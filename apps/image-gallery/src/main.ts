import type { CharmIQServices } from '../../../shared/charmiq-services';
import { AssetResolver } from './asset-resolver';
import { CommandSurface, type GalleryActions } from './command-surface';
import { ConfigStore, type GalleryConfig, type OrientationMode } from './config-store';
import { ContentBridge, type BindingRecord, type GalleryItem } from './content-bridge';
import { GalleryModel } from './gallery-model';
import { GridView } from './grid-view';
import { SlotStrip } from './slot-strip';

// entry point — constructs every module, wires the data flow, advertises the
// external surfaces, and kicks off discovery
//
// Data flow
//   ContentBridge  <-->  GalleryModel  <-->  GridView / SlotStrip
//                             |
//                             +---->  CommandSurface (charmiq.command
//                                     + ai.charm.shared.imageGallery)
//
// Layout
//   orientation=auto tracks the container via ResizeObserver — the body
//   toggles `.orientation-vertical` when height > width. horizontal/vertical
//   overrides pin the class regardless of size
// ********************************************************************************
const charmiqGlobal = (window as any).charmiq;

// == Create Instances ============================================================
const contentBridge  = new ContentBridge(charmiqGlobal.appContent);
const configStore    = new ConfigStore(charmiqGlobal.appState);
const model          = new GalleryModel();
const assetResolver  = new AssetResolver();
const gridView       = new GridView();
const slotStrip      = new SlotStrip();

// == Actions =====================================================================
// these are the imperative operations the CommandSurface, the GridView, and the
// SlotStrip all dispatch into. each one mutates the model, persists via the content
// bridge and re-renders the UI
// ................................................................................
/** append newly-picked items to the end of the current list. respects maxItems */
const appendItems = async (newItems: ReadonlyArray<GalleryItem>): Promise<ReadonlyArray<string>> => {
  if(newItems.length < 1) return [];

  const current = model.getItems();
  const { maxItems } = configStore.getConfig();
  let next = [...current, ...newItems];
  if((maxItems > 0) && (next.length > maxItems)) {
    next = next.slice(next.length - maxItems)/*keep the most-recent window*/;
  } /* else -- no cap, or within cap */

  model.setItems(next);
  await contentBridge.saveItems(next);
  syncSlotStrip();
  gridView.render(next);
  return newItems.map(i => i.itemId);
};

// ................................................................................
/** remove a single item by id, unbinding it from any slots it occupies */
const removeItem = async (itemId: string): Promise<boolean> => {
  const current = model.getItems();
  const next = current.filter(i => i.itemId !== itemId);
  if(next.length === current.length) return false;/*no such item*/

  // null out any bindings that pointed at the removed item
  const bindings = model.getBindings();
  const nextBindings = bindings.map(b => (b.itemId === itemId) ? { ...b, itemId: null } : b);
  const bindingsChanged = nextBindings.some((b, i) => b.itemId !== bindings[i].itemId);

  model.setItems(next);
  await contentBridge.saveItems(next);
  if(bindingsChanged) {
    model.setBindings(nextBindings);
    await contentBridge.saveBindings(nextBindings);
  } /* else -- nothing bound to the removed item */

  syncSlotStrip();
  gridView.render(next);
  return true;
};

// ................................................................................
/** bind (or unbind if itemId=null) the given slot. Unknown slotIds are rejected */
const bindSlot = async (slotId: string, itemId: string | null): Promise<boolean> => {
  const slots = configStore.getConfig().slots;
  if(!slots || !slots.some(s => s.id === slotId)) return false;/*unknown slot*/

  // reject binding to an itemId that doesn't exist
  if(itemId && !model.getItems().some(i => i.itemId === itemId)) return false;

  const bindings = model.getBindings();
  const existing = bindings.find(b => b.slotId === slotId);
  let nextBindings: BindingRecord[];
  if(existing) {
    nextBindings = bindings.map(b => (b.slotId === slotId) ? { ...b, itemId } : b);
  } else {
    nextBindings = [...bindings, { slotId, itemId }];
  }

  model.setBindings(nextBindings);
  await contentBridge.saveBindings(nextBindings);
  syncSlotStrip();
  slotStrip.clearActiveSlot();
  return true;
};

// ................................................................................
/** move a binding from one slot to another (source becomes empty — MOVE not SWAP) */
const moveBinding = async (fromSlotId: string, toSlotId: string): Promise<boolean> => {
  if(fromSlotId === toSlotId) return false;

  const slots = configStore.getConfig().slots;
  if(!slots || !slots.some(s => s.id === fromSlotId) || !slots.some(s => s.id === toSlotId)) return false;

  const bindings = model.getBindings();
  const src = bindings.find(b => b.slotId === fromSlotId);
  if(!src || !src.itemId) return false;/*nothing to move*/

  const nextBindings: BindingRecord[] = [];
  let sawTarget = false;
  for(const b of bindings) {
    if(b.slotId === fromSlotId) {
      nextBindings.push({ slotId: fromSlotId, itemId: null, meta: b.meta });
      continue;
    } /* else -- not the source slot */
    if(b.slotId === toSlotId) {
      nextBindings.push({ slotId: toSlotId, itemId: src.itemId, meta: src.meta ?? b.meta });
      sawTarget = true;
      continue;
    } /* else -- not the target slot */
    nextBindings.push(b);
  }
  if(!sawTarget) nextBindings.push({ slotId: toSlotId, itemId: src.itemId, meta: src.meta });

  model.setBindings(nextBindings);
  await contentBridge.saveBindings(nextBindings);
  syncSlotStrip();
  return true;
};

// ................................................................................
/** set opaque metadata on a slot binding. inserts an empty binding if needed */
const setSlotMeta = async (slotId: string, meta: unknown): Promise<boolean> => {
  const slots = configStore.getConfig().slots;
  if(!slots || !slots.some(s => s.id === slotId)) return false;/*unknown slot*/

  const bindings = model.getBindings();
  const existing = bindings.find(b => b.slotId === slotId);
  const nextBindings: BindingRecord[] = existing
    ? bindings.map(b => (b.slotId === slotId) ? { ...b, meta } : b)
    : [...bindings, { slotId, itemId: null, meta }];

  model.setBindings(nextBindings);
  await contentBridge.saveBindings(nextBindings);
  syncSlotStrip();
  return true;
};

// ................................................................................
/** unbind every slot (meta is cleared too — a full reset) */
const clearAllSlots = async (): Promise<boolean> => {
  const bindings = model.getBindings();
  if(bindings.length < 1) return false;/*already clear*/

  model.setBindings([]);
  await contentBridge.clearBindings();
  syncSlotStrip();
  return true;
};

// ................................................................................
/** open the platform media picker and append the User's selection */
const pickAndAdd = async (): Promise<ReadonlyArray<string>> => {
  const cfg = configStore.getConfig();
  gridView.setStatus('Loading…');
  try {
    const newItems = await assetResolver.pickImages(cfg.assetCategory);
    const ids = await appendItems(newItems);
    return ids;
  } finally {
    // status is reset by grid render; no explicit clear needed
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
gridView.setOnAdd(() => { void pickAndAdd(); });
gridView.setOnRemove((itemId) => { void removeItem(itemId); });
gridView.setOnBindSelected((itemId) => {
  const slotId = slotStrip.getActiveSlotId();
  if(!slotId) return;/*no active slot — shouldn't happen but be defensive*/
  void bindSlot(slotId, itemId);
});
gridView.setOnZoomCommit((zoom) => { void configStore.updateZoomSize(zoom); });

// slot strip -> actions
slotStrip.setOnBind((slotId, itemId) => { void bindSlot(slotId, itemId); });
slotStrip.setOnMoveBinding((from, to) => { void moveBinding(from, to); });
slotStrip.setOnSelecting((slotId) => { gridView.setSelectingSlot(slotId !== null); });

// global escape fired by grid-view when nothing else swallows it
document.getElementById('app')!.addEventListener('gallery:escape', () => {
  slotStrip.clearActiveSlot();
});

// == Config Bridge — apply config to DOM / modules ===============================
const applyConfig = (cfg: Readonly<GalleryConfig>): void => {
  applyOrientation(cfg.orientation);
  gridView.applyZoom(cfg.zoomSize);
  syncSlotStrip()/*slot definitions may have changed*/;
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

// == Init ========================================================================
const start = async (): Promise<void> => {
  gridView.init();

  // services via charmiq.discover; in standalone/dev (no charmiq bridge) they
  // fall back to null so the gallery still renders (just no picker)
  const discover = (name: string): Promise<unknown> =>
    charmiqGlobal?.discover?.(name).catch(() => null) ?? Promise.resolve(null);
  const [commandService, assetService, generationService] = await Promise.all([
    discover('charmiq.service.command'),
    discover('charmiq.service.asset'),
    discover('charmiq.service.generation'),
  ]);
  const services = { commandService, assetService, generationService } as CharmIQServices;
  assetResolver.setServices(services);

  // load config first so initial orientation + zoom are correct
  await configStore.init();
  applyConfig(configStore.getConfig());
  configStore.onConfigChange(applyConfig);

  // auto-orientation via ResizeObserver (no-op when explicit mode is set)
  const root = document.getElementById('app')!;
  const ro = new ResizeObserver(() => {
    if(configStore.getConfig().orientation === 'auto') reflectAutoOrientation(root);
  });
  ro.observe(root);
  if(configStore.getConfig().orientation === 'auto') reflectAutoOrientation(root);

  // advertise before discovery so external subscribers can attach early
  commandSurface.init();

  // discover initial items + bindings from the content bridge; inbound
  // callbacks registered above will push the first renders
  await contentBridge.discover();

  // if discovery saw nothing, render the empty grid explicitly
  gridView.render(model.getItems());
  syncSlotStrip();
};

start().catch(err => console.error('image-gallery initialization failed:', err));
