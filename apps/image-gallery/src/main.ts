import type { CharmIQAPI } from '../../../shared/charmiq';
import type { CharmIQServices } from '../../../shared/charmiq-services';
import { AssetResolver } from './asset-resolver';
import { CommandSurface, type GalleryActions } from './command-surface';
import { ConfigStore, type ConfigField, type GalleryConfig, type OrientationMode } from './config-store';
import { ContentBridge, GalleryWriteError, type GalleryItem } from './content-bridge';
import { GalleryModel } from './gallery-model';
import { GridView } from './grid-view';
import { SlotStrip } from './slot-strip';

// entry point — constructs every module, wires the data flow, advertises the
// external surfaces, and follows the gallery's app-contents
//
// Data flow
//   ContentBridge  <-->  GalleryModel  <-->  GridView / SlotStrip
//                             |
//                             +---->  CommandSurface (charmiq.command
//                                     + ai.charmiq.shared.imageGallery)
//
// Layout
//   orientation=auto tracks the container via ResizeObserver — the body
//   toggles `.orientation-vertical` when height > width. horizontal/vertical
//   overrides pin the class regardless of size
// ********************************************************************************
const charmiqGlobal: CharmIQAPI = window.charmiq;

// == Create Instances ============================================================
const contentBridge  = new ContentBridge(charmiqGlobal.appContent);
const configStore    = new ConfigStore(charmiqGlobal.appState);
const model          = new GalleryModel();
const assetResolver  = new AssetResolver();
const gridView       = new GridView();
const slotStrip      = new SlotStrip();

// == Actions =====================================================================
// these are the imperative operations the CommandSurface, the GridView, and the
// SlotStrip all dispatch into. Each one writes through the content bridge and
// resolves once the gallery shows the result: the screen follows the app-contents,
// never a write before the app-contents have it. A write that fails rejects with a
// GalleryWriteError, which the UI shows and a Charm receives
// ................................................................................
/** append newly-picked items to the end of the collection, then keep the newest
 *  `maxItems` */
const appendItems = async (newItems: ReadonlyArray<GalleryItem>): Promise<ReadonlyArray<string>> => {
  if(newItems.length < 1) return [];

  await contentBridge.addItems(newItems);
  const { maxItems } = configStore.getConfig();
  if(maxItems > 0) await contentBridge.keepNewest(maxItems);
  return newItems.map(i => i.itemId);
};

// ................................................................................
/** remove a single item by id, unbinding it from any slots it occupies */
const removeItem = async (itemId: string): Promise<boolean> => {
  const removed = await contentBridge.removeItem(itemId);
  await contentBridge.unbindItem(itemId)/*also after another writer removed it*/;
  return removed;
};

// ................................................................................
/** bind (or unbind if itemId=null) the given slot. Unknown slotIds are rejected */
const bindSlot = async (slotId: string, itemId: string | null): Promise<boolean> => {
  const slots = configStore.getConfig().slots;
  if(!slots || !slots.some(s => s.id === slotId)) return false;/*unknown slot*/

  // reject binding to an itemId that doesn't exist
  if(itemId && !model.getItems().some(i => i.itemId === itemId)) return false;

  await contentBridge.setBinding(slotId, current => ({ slotId, itemId, meta: current?.meta }));
  slotStrip.clearActiveSlot();
  return true;
};

// ................................................................................
/** move a binding from one slot to another (source becomes empty — MOVE not SWAP).
 *  The target is bound first, so a move that stops halfway leaves the item in both
 *  slots, never in neither */
const moveBinding = async (fromSlotId: string, toSlotId: string): Promise<boolean> => {
  if(fromSlotId === toSlotId) return false;

  const slots = configStore.getConfig().slots;
  if(!slots || !slots.some(s => s.id === fromSlotId) || !slots.some(s => s.id === toSlotId)) return false;

  const src = model.getBindings().find(b => b.slotId === fromSlotId);
  if(!src || !src.itemId) return false;/*nothing to move*/

  await contentBridge.setBinding(toSlotId, current => ({ slotId: toSlotId, itemId: src.itemId, meta: src.meta ?? current?.meta }));
  await contentBridge.setBinding(fromSlotId, current => ({ slotId: fromSlotId, itemId: null, meta: current?.meta }));
  return true;
};

// ................................................................................
/** set opaque metadata on a slot binding. inserts an empty binding if needed */
const setSlotMeta = async (slotId: string, meta: unknown): Promise<boolean> => {
  const slots = configStore.getConfig().slots;
  if(!slots || !slots.some(s => s.id === slotId)) return false;/*unknown slot*/

  await contentBridge.setBinding(slotId, current => ({ slotId, itemId: current?.itemId ?? null, meta }));
  return true;
};

// ................................................................................
/** unbind every slot (meta is cleared too — a full reset) */
const clearAllSlots = async (): Promise<boolean> => {
  if(model.getBindings().length < 1) return false;/*already clear*/

  await contentBridge.clearBindings();
  return true;
};

// ................................................................................
/** runs a User's action, showing why when it fails */
const fromUi = (action: () => Promise<unknown>): void => {
  gridView.setNotice(null);
  action().catch(error => gridView.setNotice((error instanceof GalleryWriteError) ? error.message : 'That didn\'t work. Try again.'));
};

// ................................................................................
/** open the platform media picker and append the User's selection. While the
 *  picker is open and the chosen Assets are resolving, swap the empty-state
 *  prompt from "No images yet." to "Loading…" so a novice User isn't left
 *  staring at a message that contradicts what they just clicked */
const pickAndAdd = async (): Promise<ReadonlyArray<string>> => {
  const cfg = configStore.getConfig();
  gridView.setStatus('Loading…');
  gridView.setLoading(true);
  try {
    const newItems = await assetResolver.pickImages(cfg.assetCategory);
    return await appendItems(newItems);
  } finally {
    gridView.setLoading(false)/*restores "No images yet." + Add button*/;
  }
};

// == Command Surface =============================================================
const actions: GalleryActions = {
  addItems:      ()                          => pickAndAdd(),
  removeItem:    (itemId)                    => removeItem(itemId),
  bindSlot:      (slotId, itemId)            => bindSlot(slotId, itemId),
  setSlotMeta:   (slotId, meta)              => setSlotMeta(slotId, meta),
  clearAllSlots: ()                          => clearAllSlots()
};
const commandSurface = new CommandSurface(model, actions);

// == Rendering helpers ===========================================================
/** re-render the slot strip from the latest config + model state */
const syncSlotStrip = (): void => {
  const slots = configStore.getConfig().slots ?? [];
  slotStrip.render(slots, model.getBindings(), model.getItems());
  model.setSlots(slots);
};

// ................................................................................
/** apply an orientation decision to the app root */
const applyOrientation = (mode: OrientationMode): void => {
  const root = document.getElementById('app')!;
  if(mode === 'vertical') {
    root.classList.add('orientation-vertical');
    root.classList.remove('orientation-horizontal');
    return;
  } /* else -- not vertical */
  if(mode === 'horizontal') {
    root.classList.add('orientation-horizontal');
    root.classList.remove('orientation-vertical');
    return;
  } /* else -- not horizontal; auto: decided by ResizeObserver */
  root.classList.remove('orientation-vertical');
  root.classList.remove('orientation-horizontal');
};

// ................................................................................
/** decide orientation from the current container size (only used in auto mode) */
const reflectAutoOrientation = (root: HTMLElement): void => {
  const w = root.clientWidth;
  const h = root.clientHeight;
  const vertical = (h > w * 1.1)/*hysteresis against square-ish sizes*/;
  root.classList.toggle('orientation-vertical', vertical);
};

// == Wire Callbacks ==============================================================
// grid view -> actions
gridView.setOnAdd(() => fromUi(pickAndAdd));
gridView.setOnRemove((itemId) => fromUi(() => removeItem(itemId)));
gridView.setOnBindSelected((itemId) => {
  const slotId = slotStrip.getActiveSlotId();
  if(!slotId) return;/*no active slot — shouldn't happen but be defensive*/
  fromUi(() => bindSlot(slotId, itemId));
});
gridView.setOnZoomCommit((zoom) => { void configStore.updateZoomSize(zoom); });

// slot strip -> actions
slotStrip.setOnBind((slotId, itemId) => fromUi(() => bindSlot(slotId, itemId)));
slotStrip.setOnMoveBinding((from, to) => fromUi(() => moveBinding(from, to)));
slotStrip.setOnSelecting((slotId) => { gridView.setSelectingSlot(slotId !== null); });

// global escape fired by grid-view when nothing else swallows it
document.getElementById('app')!.addEventListener('gallery:escape', () => {
  slotStrip.clearActiveSlot();
});

// == Config Bridge — apply config to DOM / modules ===============================
// `changedFields` lets us only re-run the side-effect for fields that actually
// moved; pass `null` to force a full apply (e.g. initial load)
const applyConfig = (cfg: Readonly<GalleryConfig>, changedFields: ReadonlySet<ConfigField> | null): void => {
  const touched = (f: ConfigField) => (changedFields === null) || changedFields.has(f);

  if(touched('orientation')) applyOrientation(cfg.orientation);
  if(touched('zoomSize'))    gridView.applyZoom(cfg.zoomSize);
  if(touched('slots'))       syncSlotStrip()/*slot set changed — rebuild strip*/;
};

// == Content Bridge — incoming updates ===========================================
contentBridge.onItemsChange((items) => {
  model.setItems(items);
  gridView.render(items);
  syncSlotStrip();
});
contentBridge.onBindingsChange((bindings) => {
  model.setBindings(bindings);
  syncSlotStrip();
});
contentBridge.onReadFailure(() => gridView.setNotice('The gallery stopped updating. Reload to see the latest.'));

// == Init ========================================================================
const start = async (): Promise<void> => {
  gridView.init();

  // services via charmiq.discover; absent services resolve to undefined so the
  // gallery still renders (just no picker)
  const discover = (name: string): Promise<unknown> => charmiqGlobal.discover(name).catch(() => undefined);
  const [commandService, assetService, generationService] = await Promise.all([
    discover('charmiq.service.command'),
    discover('charmiq.service.asset'),
    discover('charmiq.service.generation'),
  ]);
  const services = { commandService, assetService, generationService } as CharmIQServices;
  assetResolver.setServices(services);

  // load config first so initial orientation + zoom are correct.
  // initial apply forces every field through (null => no change filter);
  // subsequent callbacks supply the changedFields set so unrelated fields
  // don't re-run their side effects (e.g. a remote orientation flip won't
  // also re-apply zoom and yank the slider)
  await configStore.init();
  applyConfig(configStore.getConfig(), null);
  configStore.onConfigChange(applyConfig);

  // auto-orientation via ResizeObserver (no-op when explicit mode is set)
  const root = document.getElementById('app')!;
  const ro = new ResizeObserver(() => {
    if(configStore.getConfig().orientation === 'auto') reflectAutoOrientation(root);
  });
  ro.observe(root);
  if(configStore.getConfig().orientation === 'auto') reflectAutoOrientation(root);

  // advertise before following the app-contents so external subscribers can attach
  // early
  commandSurface.init();

  // follow the items + bindings app-contents; the callbacks registered above render
  // each change, the first included
  try {
    await contentBridge.follow();
  } catch(failure) {
    const code = (failure as { code?: unknown; } | null)?.code;
    gridView.setNotice((failure instanceof GalleryWriteError) ? failure.message
                     : (code === 'functions/permission-denied') ? 'This Application isn\'t allowed to read the gallery.'
                     : 'The gallery could not be read. Reload to try again.');
  }
  gridView.render(model.getItems());
  syncSlotStrip();
};

start().catch(err => console.error('image-gallery initialization failed:', err));
