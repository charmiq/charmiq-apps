import * as THREE from 'three';

import { drawnSky, skyLine, type Sky } from '../../../brick-shared/sky';

import { generatedPanorama, isPanorama, tiledPanorama, type Pixels } from './panorama';
import type { PictureFiles } from './pictures';

// a set's sky as the studio draws it: a panorama (twice as wide as high, the whole sky
// round the camera) behind every look, and with `lights` the light the set takes from
// it. A generated sky is drawn from its colors and seed alone, the same pixels every
// time. A picture twice as wide as high is a panorama as it is; any other is tiled
// round the horizon, every other copy mirrored so the seams meet, over its own top and
// bottom colors. A sky naming a picture stands as its generated sky until the picture
// is read, and stays so when it cannot be
// ********************************************************************************
// == Constants ===================================================================
/** the skies a studio keeps drawn, so a cut between sets draws at once */
const KEPT_SKIES = 8;

// == SkyBackdrop =================================================================
/** the sky a studio draws: the backdrop texture and, for a sky that lights, the light
 *  it gives (prefiltered for the rasterizer). `changed` is told when either changes
 *  after a picture is read, or fails to be */
export class SkyBackdrop {
  /** the sky shown (its line), the texture behind the set and the light it gives */
  private shown: string | undefined/*the theme's backdrop*/;
  private backdrop: THREE.Texture | undefined;
  private light: THREE.Texture | undefined/*it does not light*/;
  /** each sky drawn, by its line, most recently shown last */
  private readonly drawn = new Map<string, THREE.Texture>();
  /** counts the skies shown, so a picture read for one replaced meanwhile is dropped */
  private request = 0;
  private reading: Promise<void> | undefined;
  private unread = false;

  public constructor(private readonly renderer: THREE.WebGLRenderer, private readonly files: PictureFiles, private readonly changed: () => void) {}

  /** the texture behind the set, none for the theme's backdrop */
  public get texture(): THREE.Texture | undefined { return this.backdrop; }
  /** the panorama the set is lit from, for a sky that lights */
  public get lighting(): THREE.Texture | undefined { return this.light && this.backdrop; }
  /** the rasterizer's prefiltered light from the sky, for a sky that lights */
  public get environment(): THREE.Texture | undefined { return this.light; }
  /** while a sky's picture is being read */
  public get loading(): Promise<void> | undefined { return this.reading; }
  /** whether the shown sky's picture could not be read (its generated sky stands) */
  public get isUnread(): boolean { return this.unread; }

  /** shows a sky, or the theme's backdrop (`undefined`); answers whether what is drawn
   *  changed */
  public show(sky: Sky | undefined): boolean {
    const line = sky && skyLine(sky);
    if(line === this.shown) return false/*shown*/;
    this.shown = line;
    const request = ++this.request;
    this.unread = false;
    this.reading = undefined;
    if(!sky) { this.use(undefined, false); return true; }
    this.use(this.kept(`generated|${skyLine({ ...drawnSky(sky) })}`, () => generatedPanorama(drawnSky(sky))), !!sky.lights)/*the picture's stand-in until it is read*/;
    const image = sky.image;
    if(image !== undefined) {
      this.reading = this.files.pixels(image).then(panoramaOf).then(
        pixels => { if(request === this.request) this.use(this.kept(`picture|${image}`, () => pixels), !!sky.lights); },
        (error: unknown) => { if(request !== this.request) return; console.warn('brick-studio: the sky\'s picture could not be read:', error); this.unread = true; },
      ).finally(() => { if(request !== this.request) return; this.reading = undefined; this.changed(); });
    } /* else -- generated: drawn */
    return true;
  }

  public dispose(): void {
    this.light?.dispose();
    for(const texture of this.drawn.values()) texture.dispose();
    this.drawn.clear();
  }

  // == Internal ==================================================================
  // the backdrop and its light from now on
  private use(texture: THREE.Texture | undefined, lights: boolean): void {
    this.backdrop = texture;
    this.light?.dispose();
    this.light = undefined;
    if(texture && lights) {
      const prefilter = new THREE.PMREMGenerator(this.renderer);
      this.light = prefilter.fromEquirectangular(texture).texture;
      prefilter.dispose();
    } /* else -- a backdrop alone, or none */
  }

  // a sky's texture, drawn once and kept among the last KEPT_SKIES shown
  private kept(key: string, draw: () => Pixels): THREE.Texture {
    let texture = this.drawn.get(key);
    if(texture) this.drawn.delete(key)/*shown again: kept longest*/;
    else texture = textureOf(draw());
    this.drawn.set(key, texture);
    for(const [old, each] of this.drawn) {
      if(this.drawn.size <= KEPT_SKIES) break;
      if(each === texture) continue;
      each.dispose();
      this.drawn.delete(old);
    }
    return texture;
  }

}

// == Internal ====================================================================
/** a picture as a panorama: as it is when it is one, else tiled */
const panoramaOf = (picture: Pixels): Pixels => isPanorama(picture.width, picture.height) ? picture : tiledPanorama(picture);

/** a panorama as a texture wrapped round the sky, its colors shown as picked */
const textureOf = ({ data, width, height }: Pixels): THREE.Texture => {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

