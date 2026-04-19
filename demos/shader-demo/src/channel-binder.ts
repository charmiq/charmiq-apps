import { BehaviorSubject, Subscription, type Observable } from 'rxjs';

import type { CharmIQAPI } from '../../../shared/charmiq';
import { dbg } from './debug';
import type { ChannelState } from './renderer';

// discovers the sibling Image Gallery's `ai.charm.shared.imageGallery`
// capability, subscribes to its state stream, and keeps a GL texture per
// channel slot in sync with whatever image the User has bound. Owns:
//   * one GL texture per slot (lazily created when a slot first becomes bound)
//   * per-slot sampler settings (filter + wrap) read from binding.meta, with
//     sensible defaults when the User hasn't set any
//   * a disposal protocol that releases textures when a slot becomes unbound
//
// The public surface is a single observable `channels$` the Renderer reads on
// every frame. A rebuild is cheap (small array allocation) and only happens
// when the gallery actually changes
// ********************************************************************************
// == Types =======================================================================
/** sampler configuration stored on a gallery binding's opaque meta. The gallery
 *  round-trips this untouched -- it belongs to the shader player */
export interface SamplerMeta {
  readonly filter: 'linear' | 'nearest';
  readonly wrap:   'repeat' | 'clamp'  | 'mirror';
}

// --------------------------------------------------------------------------------
/** the four canonical channel slot ids -- kept in an array so iteration order is
 *  stable and the index maps directly to iChannel0..3 */
export const CHANNEL_SLOT_IDS: ReadonlyArray<string> = ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3'];

// --------------------------------------------------------------------------------
/** shape of the gallery's published `PublicSlot` record. Declared locally so this
 *  module has no compile-time dependency on the image-gallery package */
interface PublicSlot {
  readonly id:       string;
  readonly label:    string;
  readonly required: boolean;
  readonly itemId:   string | null;
  readonly meta?:    unknown;
}

// --------------------------------------------------------------------------------
/** shape of the gallery's published `GalleryItem` record. Same rationale as
 *  PublicSlot -- structurally typed, no cross-package import */
interface GalleryItem {
  readonly itemId:      string;
  readonly downloadUrl: string;
  readonly mimeType:    string;
  readonly width?:      number;
  readonly height?:     number;
}

// --------------------------------------------------------------------------------
interface PublicState {
  readonly items: ReadonlyArray<GalleryItem>;
  readonly slots: ReadonlyArray<PublicSlot>;
}

// --------------------------------------------------------------------------------
interface GalleryCapability {
  state$():    Observable<Readonly<PublicState>>;
  bindSlot?(slotId: string, itemId: string | null): Promise<boolean>;
  setSlotMeta?(slotId: string, meta: unknown):      Promise<boolean>;
}

// --------------------------------------------------------------------------------
/** per-slot record held internally. Kept separate from ChannelState so the renderer
 *  surface stays minimal */
interface SlotTexture {
  readonly url:     string/*the downloadUrl whose pixels the texture holds*/;
  readonly texture: WebGLTexture;
  width:   number;
  height:  number;
  meta:    SamplerMeta;
}

// == Defaults ====================================================================
/** default sampler when the User hasn't configured the slot */
const DEFAULT_META: Readonly<SamplerMeta> = { filter: 'linear', wrap: 'clamp' };

/** empty channel state -- used for unbound slots */
const EMPTY_STATE: Readonly<ChannelState> = { texture: null, resolution: [1, 1, 1], time: 0 };

// == Class =======================================================================
/** keeps channel textures in step with the gallery and publishes a Renderer-shaped
 *  state array */
export class ChannelBinder {
  private readonly gl: WebGL2RenderingContext;

  /** one entry per CHANNEL_SLOT_IDS index; null until the slot is bound */
  private readonly slots: Array<SlotTexture | null> = [null, null, null, null];

  private readonly channelsSubject = new BehaviorSubject<ReadonlyArray<ChannelState>>(
    [EMPTY_STATE, EMPTY_STATE, EMPTY_STATE, EMPTY_STATE]
  );

  private gallery: GalleryCapability | null = null;
  private subscription: Subscription | null = null;

  /** most recent snapshot received from the gallery's state$. Cached because the
   *  gallery's `getState()` is proxied and therefore async -- readMetaFromGallery()
   *  needs a synchronous peek for the samplers popover */
  private latestGalleryState: Readonly<PublicState> | null = null;

  // == Lifecycle =================================================================
  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  // ------------------------------------------------------------------------------
  /** discover the gallery capability + subscribe. Safe to call with no CharmIQ
   *  bridge (standalone preview) -- the binder just stays idle and publishes a
   *  4-slot array of empties */
  public async init(charmiq: CharmIQAPI | undefined): Promise<void> {
    if(!charmiq?.discover) {
      dbg('gallery', 'discover skipped (standalone — no charmiq bridge)');
      return;
    } /* else -- platform bridge is present */

    try {
      const cap = await charmiq.discover<GalleryCapability | undefined>('ai.charm.shared.imageGallery');
      if(!cap) {
        dbg('gallery', 'discover: no ai.charm.shared.imageGallery provider in this Document');
        return;
      } /* else -- gallery found */
      this.gallery = cap;
      dbg('gallery', 'discover: attached to gallery capability');

      this.subscription = cap.state$().subscribe((state: Readonly<PublicState>) => {
        dbg('gallery', 'state$', {
          items: state.items.length,
          slots: state.slots.map(s => ({ id: s.id, itemId: s.itemId, meta: s.meta }))
        });
        this.latestGalleryState = state;
        this.reconcile(state);
      });
    } catch(error) {
      console.error('shader-demo: failed to discover image gallery:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** tear down subscriptions + release GL textures */
  public destroy(): void {
    if(this.subscription) this.subscription.unsubscribe();
    this.subscription = null;

    for(let i=0; i<this.slots.length; i++) {
      const slot = this.slots[i];
      if(slot) this.gl.deleteTexture(slot.texture);
      this.slots[i] = null;
    }
  }

  // == Public =====================================================================
  /** observable the Renderer subscribes to. Emits on gallery changes + on each async
   *  texture load completion */
  public channels$(): Observable<ReadonlyArray<ChannelState>> {
    return this.channelsSubject.asObservable();
  }

  // ------------------------------------------------------------------------------
  /** synchronous snapshot -- the renderer uses this every frame so it doesn't need
   *  its own subscription */
  public getChannels(): ReadonlyArray<ChannelState> { return this.channelsSubject.getValue(); }

  // ------------------------------------------------------------------------------
  /** read the current sampler meta for a given channel index (0..3). Falls back to
   *  DEFAULT_META for unbound slots */
  public getSamplerMeta(index: number): Readonly<SamplerMeta> {
    if((index < 0) || (index >= this.slots.length)) return DEFAULT_META;
    const slot = this.slots[index];
    if(!slot) {
      const meta = this.readMetaFromGallery(CHANNEL_SLOT_IDS[index]);
      return meta ?? DEFAULT_META;
    } /* else -- slot has a loaded texture; meta is already normalized on it */
    return slot.meta;
  }

  // ------------------------------------------------------------------------------
  /** push updated sampler meta for a channel index. Applied immediately to the GL
   *  texture (so the next frame reflects the change) and persisted back to the
   *  gallery so the setting survives reloads and syncs to peers */
  public async setSamplerMeta(index: number, meta: Readonly<SamplerMeta>): Promise<void> {
    if((index < 0) || (index >= this.slots.length)) return;
    const slotId = CHANNEL_SLOT_IDS[index];

    const slot = this.slots[index];
    if(slot) {
      slot.meta = { ...meta };
      this.applySamplerParams(slot);
    } /* else -- nothing loaded yet; meta will be applied when a texture arrives */

    if(this.gallery?.setSlotMeta) {
      try {
        dbg('gallery', `setSlotMeta ${slotId} ->`, meta);
        await this.gallery.setSlotMeta(slotId, meta);
      } catch(error) {
        console.error('shader-demo: failed to persist sampler meta:', error);
      }
    } else {
      dbg('gallery', `setSlotMeta ${slotId}: no persist target (local-only)`, meta);
    }
  }

  // == Internal ===================================================================
  /** bring internal slots in line with the gallery state. For each channel:
   *    no binding  -> release any existing texture, publish EMPTY_STATE
   *    same URL    -> keep the texture, just pick up any meta changes
   *    new URL     -> release the old texture, start an async load */
  private reconcile(state: Readonly<PublicState>): void {
    const itemsById = new Map<string, GalleryItem>(state.items.map(i => [i.itemId, i]));
    let anyChanged = false;

    for(let i=0; i<CHANNEL_SLOT_IDS.length; i++) {
      const slotId = CHANNEL_SLOT_IDS[i];
      const slot   = state.slots.find(s => s.id === slotId);
      const itemId = slot?.itemId ?? null;
      const meta   = normalizeMeta(slot?.meta);
      const item   = itemId ? itemsById.get(itemId) ?? null : null;

      const current = this.slots[i];

      // slot cleared -- release texture
      if(!item) {
        if(current) {
          dbg('gallery', `reconcile ${slotId}: cleared (was ${current.url})`);
          this.gl.deleteTexture(current.texture);
          this.slots[i] = null;
          anyChanged = true;
        } /* else -- already empty */
        continue;
      } /* else -- slot is bound to a real item */

      // same image -- only meta may have changed
      if(current && (current.url === item.downloadUrl)) {
        if(!metaEqual(current.meta, meta)) {
          dbg('gallery', `reconcile ${slotId}: meta changed`, { from: current.meta, to: meta });
          current.meta = meta;
          this.applySamplerParams(current);
          anyChanged = true;
        } /* else -- meta unchanged too */
        continue;
      } /* else -- different image or nothing loaded yet */

      // release the outgoing texture now; the incoming one loads async
      if(current) {
        dbg('gallery', `reconcile ${slotId}: swap (${current.url} -> ${item.downloadUrl})`);
        this.gl.deleteTexture(current.texture);
        this.slots[i] = null;
      } else {
        dbg('gallery', `reconcile ${slotId}: new binding -> ${item.downloadUrl}`, { meta });
      }

      void this.loadTexture(i, item, meta);
      anyChanged = true;
    }

    if(anyChanged) this.publish();
  }

  // ................................................................................
  /** create a GL texture + start an async image load. The texture is allocated with
   *  a 1x1 placeholder so it's immediately sampleable; the real pixels replace it
   *  when the image decodes */
  private async loadTexture(index: number, item: GalleryItem, meta: Readonly<SamplerMeta>): Promise<void> {
    const gl = this.gl;
    const texture = gl.createTexture();
    if(!texture) {
      console.error('shader-demo: failed to create texture for', item.itemId);
      return;
    } /* else -- texture object allocated */

    // placeholder 1x1 pixel so early reads are well-defined
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);

    const slot: SlotTexture = {
      url:     item.downloadUrl,
      texture,
      width:   item.width  ?? 1,
      height:  item.height ?? 1,
      meta:    { ...meta }
    };
    this.slots[index] = slot;
    this.applySamplerParams(slot)/*apply filter+wrap immediately so placeholder is valid*/;
    this.publish();

    try {
      const started = performance.now();
      const bitmap = await decodeImage(item.downloadUrl);
      // bail if the User changed the binding while the image was loading
      if(this.slots[index] !== slot) {
        dbg('gallery', `loadTexture iChannel${index}: superseded during load (${item.downloadUrl})`);
        bitmap.close?.();
        return;
      } /* else -- still the active binding for this channel */

      gl.bindTexture(gl.TEXTURE_2D, texture);
      // NOTE: manual Y-flip via OffscreenCanvas -- UNPACK_FLIP_Y_WEBGL is silently a
      //       no-op on the ImageBitmap upload path in this browser (both on/off
      //       produced upside-down output), so flip the row data ourselves. This
      //       lands the image in memory as "row 0 = bottom of image", which pairs
      //       with Shadertoy's `uv.y=0 at screen bottom` sampling convention
      const flipped = flipYToCanvas(bitmap);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, flipped);

      slot.width  = bitmap.width;
      slot.height = bitmap.height;
      const mipmapped = needsMipmap(slot.meta.wrap, bitmap.width, bitmap.height);
      if(mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
      this.applySamplerParams(slot);
      gl.bindTexture(gl.TEXTURE_2D, null);

      bitmap.close?.();
      dbg('gallery', `loadTexture iChannel${index}: ready`, {
        url: item.downloadUrl,
        size: `${bitmap.width}x${bitmap.height}`,
        ms: Math.round(performance.now() - started),
        mipmapped
      });
      this.publish();
    } catch(error) {
      console.error('shader-demo: failed to load image for channel', index, error);
    }
  }

  // ................................................................................
  /** apply the slot's filter + wrap settings to its GL texture. Assumes the texture
   *  is already created. REPEAT/MIRRORED_REPEAT are skipped for non-power-of-two textures
   *  (WebGL2 actually allows it, but filtering is ill-defined without mipmaps so
   *  CLAMP is substituted for safety) */
  private applySamplerParams(slot: SlotTexture): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);

    const minFilter = (slot.meta.filter === 'nearest') ? gl.NEAREST : gl.LINEAR;
    const magFilter = minFilter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

    const wrapMode = resolveWrapMode(gl, slot.meta.wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // ................................................................................
  /** rebuild + emit the ChannelState[] the renderer reads each frame */
  private publish(): void {
    const out: ChannelState[] = [];
    for(let i=0; i<this.slots.length; i++) {
      const slot = this.slots[i];
      if(!slot) {
        out.push(EMPTY_STATE);
        continue;
      } /* else -- slot has a loaded (or loading) texture */
      out.push({
        texture:    slot.texture,
        resolution: [slot.width, slot.height, 1],
        time:       0/*still-image channels only in v1*/
      });
    }
    this.channelsSubject.next(out);
  }

  // ................................................................................
  /** read the current slot meta directly off the gallery's latest snapshot. Used
   *  as a fallback when the slot isn't loaded yet but the User opened the sampler
   *  popover */
  private readMetaFromGallery(slotId: string): Readonly<SamplerMeta> | null {
    // read from the cached snapshot, not gallery.getState() -- bridged methods are
    // always async so getState() returns a Promise, not a PublicState
    const snapshot = this.latestGalleryState;
    if(!snapshot) return null;
    const slot = snapshot.slots.find(s => s.id === slotId);
    if(!slot) return null;
    return normalizeMeta(slot.meta);
  }
}

// == Util ========================================================================
/** coerce an opaque meta object into a validated SamplerMeta. Unknown fields are
 *  ignored, invalid values fall back to defaults */
const normalizeMeta = (raw: unknown): Readonly<SamplerMeta> => {
  if(!raw || (typeof raw !== 'object')) return DEFAULT_META;
  const m = raw as Partial<SamplerMeta>;
  const filter: SamplerMeta['filter'] = (m.filter === 'nearest') ? 'nearest' : 'linear';
  const wrap:   SamplerMeta['wrap']   = (m.wrap === 'repeat' || m.wrap === 'mirror') ? m.wrap : 'clamp';
  return { filter, wrap };
};

// --------------------------------------------------------------------------------
const metaEqual = (a: Readonly<SamplerMeta>, b: Readonly<SamplerMeta>): boolean => {
  return (a.filter === b.filter) && (a.wrap === b.wrap);
};

// --------------------------------------------------------------------------------
/** decode an image URL into an ImageBitmap. Uses the fast path when available and
 *  falls back to an HTMLImageElement + crossOrigin='anonymous' for hosts that don't
 *  honour CORS on the bitmap fetch */
const decodeImage = async (url: string): Promise<ImageBitmap> => {
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    // NOTE: imageOrientation must be 'none' -- the texImage2D path flips via
    //       UNPACK_FLIP_Y_WEBGL so the shader's `texture(iChannel0, uv)` is upright
    //       under Shadertoy's bottom-left-origin fragCoord. 'from-image' causes
    //       some browsers to pre-apply an orientation that races with the GL flag
    //       and yields an inverted image
    return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' });
  } catch(error) {
    // fall back to the image element path so data: URLs and permissive hosts still work
    // NOTE: this path can't set colorSpace the same way
    return await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { createImageBitmap(img).then(resolve, reject); };
      img.onerror = (event) => reject(event instanceof Event ? new Error('image load failed') : event);
      img.src = url;
    });
  }
};

// --------------------------------------------------------------------------------
/** draw a bitmap to an OffscreenCanvas with a scale(1, -1) transform so the canvas
 *  pixels are Y-flipped relative to the source. Used as a cross-browser substitute
 *  for UNPACK_FLIP_Y_WEBGL, which is silently ignored on the ImageBitmap upload
 *  path in some browsers */
const flipYToCanvas = (bitmap: ImageBitmap): OffscreenCanvas => {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if(!ctx) throw new Error('2d context unavailable on OffscreenCanvas');
  ctx.translate(0, bitmap.height);
  ctx.scale(1, -1);
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
};

// --------------------------------------------------------------------------------
/** true if a given wrap mode + image size combination benefits from mipmaps. WebGL2
 *  supports NPOT wrap/repeat but linear-min-filter without mipmaps looks bad; so
 *  mipmaps are built whenever REPEAT/MIRROR is requested */
const needsMipmap = (wrap: SamplerMeta['wrap'], _w: number, _h: number): boolean => {
  return (wrap === 'repeat') || (wrap === 'mirror');
};

// --------------------------------------------------------------------------------
const resolveWrapMode = (gl: WebGL2RenderingContext, wrap: SamplerMeta['wrap']): number => {
  if(wrap === 'repeat') return gl.REPEAT;
  if(wrap === 'mirror') return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
};
