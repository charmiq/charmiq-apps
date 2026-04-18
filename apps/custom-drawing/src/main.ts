import { CanvasViewport } from './canvas-viewport';
import { ClipboardHandler } from './clipboard-handler';
import { CommandSurface } from './command-surface';
import { ConfigStore, type DrawingConfig } from './config-store';
import { confirm } from './confirm';
import { ContentBridge } from './content-bridge';
import type { DrawingElement } from './element-model';
import { ExportHandler } from './export-handler';
import { GenerationHandler } from './generation-handler';
import { ImageHandler } from './image-handler';
import { InteractionHandler } from './interaction-handler';
import { PropertiesPanel } from './properties-panel';
import { SelectionManager } from './selection-manager';
import { SettingsPanel } from './settings-panel';
import { SvgRenderer } from './svg-renderer';
import { TextEditor } from './text-editor';
import { TextMeasurement } from './text-measurement';
import { ToolManager } from './tool-manager';

// entry point — creates all modules, wires dependencies, starts discovery
// ********************************************************************************
const charmiq = (window as any).charmiq;

// == Create Instances ============================================================
const textMeasure    = new TextMeasurement();
const viewport       = new CanvasViewport('canvasContainer');
const renderer       = new SvgRenderer(viewport.drawingLayer, viewport.svg, textMeasure);
const tools          = new ToolManager(viewport.container);
const selection      = new SelectionManager(viewport, document.getElementById('propertiesPanel')!);
const interaction    = new InteractionHandler(viewport, renderer, selection, tools, textMeasure);
const textEditor     = new TextEditor(viewport, textMeasure, renderer, selection, tools);
const imageHandler   = new ImageHandler(viewport, renderer, selection, tools);
const exportHandler  = new ExportHandler(textMeasure);
const generation     = new GenerationHandler(exportHandler, renderer, selection);
const clipboard      = new ClipboardHandler(viewport, renderer, selection, textMeasure);
const contentBridge  = new ContentBridge(charmiq.appContent);
const configStore    = new ConfigStore(charmiq.appState);
const propsPanel     = new PropertiesPanel(renderer, selection, configStore);
const settingsPanel  = new SettingsPanel(configStore);
const commandSurface = new CommandSurface(renderer, selection);

// --------------------------------------------------------------------------------
// shared elements array — all modules reference the same array object
let elements: DrawingElement[] = [];

// ................................................................................
// expose the current elements to the content bridge so it can overlay
// active-edit property values (picker in flight) onto inbound remote
// changes and avoid clobbering in-flight local edits
contentBridge.setCurrentStateGetter(() => elements);

// ................................................................................
// helper: sync the shared elements array to all modules
const syncElements = () => {
  interaction.elements = elements;
  textEditor.elements = elements;
  imageHandler.elements = elements;
  exportHandler.elements = elements;
  exportHandler.selectedElements = selection.selectedElements;
  generation.elements = elements;
  propsPanel.elements = elements;
  clipboard.elements = elements;
  commandSurface.elements = elements;
};

// --------------------------------------------------------------------------------
// helper: save current elements via the content bridge
const save = () => {
  // read back from interaction (the most common mutator), resync, then persist
  elements = interaction.elements;
  syncElements();
  contentBridge.save(elements).catch(err => console.error('save failed:', err));
};

// == Wire Callbacks ==============================================================
interaction.setCallbacks({
  onSave: save,
  onStartTextInput: (pt) => textEditor.startTextInput(pt),
  onEditTextElement: (el) => textEditor.editTextElement(el),
  onEditImageElement: (el) => imageHandler.editImageElement(el),
  onShowImageModal: () => imageHandler.showImageModal(),
  onToggleImageDropdown: () => imageHandler.toggleImageDropdown(),
  onToggleSaveDropdown: () => exportHandler.toggleSaveDropdown(),
  onToggleGenerateDropdown: () => generation.toggleGenerateDropdown(),
  onGenerate: (mode) => { void generation.generateFromDrawing(mode); },
  onCopy: () => clipboard.copySelected(),
  onCut: () => { clipboard.cutSelected(); elements = clipboard.elements; syncElements(); },
  onPaste: () => { clipboard.paste().then(() => { elements = clipboard.elements; syncElements(); }); },
  onDeleteSelected: () => { clipboard.deleteSelected(); elements = clipboard.elements; syncElements(); },
  onEditBegin: (ids, prop) => contentBridge.beginEdit(ids, prop),
  onEditEnd:   (ids, prop) => contentBridge.endEdit(ids, prop),
});

textEditor.onSave = save;
imageHandler.onSave = save;
propsPanel.onSave = save;
clipboard.onSave = save;
commandSurface.onSave = save;

// live-edit declarations: while a picker is open the app calls onEditBegin
// with the (selection, property) under modification, and the bridge
// suppresses inbound remote changes for exactly those pairs (local wins)
propsPanel.onEditBegin = (ids, prop) => contentBridge.beginEdit(ids, prop);
propsPanel.onEditEnd   = (ids, prop) => contentBridge.endEdit(ids, prop);

selection.setOnShowProperties(() => {
  const cfg = configStore.getConfig();
  if(!cfg.showPropertiesPanel) return;/*chrome hidden*/
  if(cfg.readOnly) return;/*nothing to edit*/
  propsPanel.show();
});

tools.setOnToolChange((tool) => {
  if(tool !== 'selection') selection.deselectAll();
});

// action buttons in properties panel
document.getElementById('deleteBtn')!.addEventListener('click', () => { clipboard.deleteSelected(); elements = clipboard.elements; syncElements(); });
document.getElementById('copyBtn')!.addEventListener('click', () => clipboard.copySelected());
document.getElementById('groupBtn')!.addEventListener('click', () => { clipboard.groupSelected(); elements = clipboard.elements; syncElements(); });
document.getElementById('ungroupBtn')!.addEventListener('click', () => { clipboard.ungroupSelected(); elements = clipboard.elements; syncElements(); });

// clear all — destructive, gated by an are-you-sure confirmation
document.getElementById('clearAllBtn')!.addEventListener('click', async () => {
  if(configStore.getConfig().readOnly) return;/*no-op in read-only*/
  if(elements.length < 1) return;/*nothing to clear*/
  const ok = await confirm({
    title:    'Clear the entire drawing?',
    message:  `This will permanently remove all ${elements.length} element${elements.length === 1 ? '' : 's'}. This cannot be undone.`,
    okLabel:  'Clear All',
  });
  if(!ok) return;/*user cancelled*/

  // in-place mutation to preserve the shared array reference used across modules
  elements.splice(0, elements.length);
  selection.deselectAll();
  textEditor.cancelIfDeleted();
  renderer.rerenderAll(elements);
  syncElements();
});

// == Iframe-Focus Recovery =======================================================
// pointer capture (see interaction-handler) solves the common "drag outside the
// iframe" case -- pointerup/pointercancel are delivered to us no matter where
// the pointer is. these listeners cover the residual edge cases capture can't:
// user hitting alt-tab mid-drag, the OS stealing focus, devtools opening with a
// modifier held, etc. authored state (elements, modals, text editor, tool
// choice) is intentionally untouched -- closing them on alt-tab would be hostile.
const resetTransientState = () => {
  interaction.cancelActiveGesture();
  tools.setSpacebarPan(false);/*clear stuck spacebar-pan*/
  propsPanel.hideAllDropdowns();/*close anything anchored to a transient click*/
};
window.addEventListener('blur',     resetTransientState);
window.addEventListener('pagehide', resetTransientState);/*bfcache / cross-origin nav*/
document.addEventListener('visibilitychange', () => {
  if(document.hidden) resetTransientState();
  // NOTE: becoming visible again is fine, nothing to reset
});

// == Content Bridge — incoming updates ===========================================
contentBridge.onChange((newElements) => {
  elements = newElements;
  syncElements();

  // reconcile selection with new elements
  selection.reconcile(elements);

  // cancel text editing if element was deleted externally
  textEditor.cancelIfDeleted();

  // re-render
  renderer.rerenderAll(elements);

  const cfg = configStore.getConfig();
  if(selection.selectedElements.length > 0) {
    selection.showSelectionHandles();
    if(cfg.showPropertiesPanel && !cfg.readOnly) propsPanel.show();
  } else {
    selection.clearSelection();
  }
});

// == Config Bridge — apply config to the DOM / modules ===========================
const applyConfig = (cfg: Readonly<DrawingConfig>) => {
  // canvas visuals
  viewport.setGridVisible(cfg.showGrid);
  viewport.setGridColor(cfg.gridColor);
  viewport.setBackgroundColor(cfg.backgroundColor);

  // read-only propagation
  interaction.readOnly = cfg.readOnly;
  tools.readOnly = cfg.readOnly;
  if(cfg.readOnly && (tools.currentTool !== 'selection') && (tools.currentTool !== 'pan')) {
    tools.selectTool('selection');
  } /* else -- tool already compatible with read-only */

  // UI chrome (body classes drive CSS visibility)
  document.body.classList.toggle('hide-toolbar',          !cfg.showToolbar);
  document.body.classList.toggle('hide-info-bar',         !cfg.showInfoBar);
  document.body.classList.toggle('hide-properties-panel', !cfg.showPropertiesPanel || cfg.readOnly);
  document.body.classList.toggle('read-only',             cfg.readOnly);
};

configStore.onChange(applyConfig);

// == Init ========================================================================
const start = async () => {
  // wait for fonts before initializing anything
  await textMeasure.init();

  // services via charmiq.discover; in standalone/dev (no charmiq bridge) they fall back to null
  const discover = (name: string) => charmiq?.discover?.(name).catch(() => null) ?? Promise.resolve(null);
  const [commandService, assetService, generationService] = await Promise.all([
    discover('charmiq.service.command'),
    discover('charmiq.service.asset'),
    discover('charmiq.service.generation'),
  ]);
  const services = { commandService, assetService, generationService };
  imageHandler.setServices(services);
  exportHandler.setServices(services);
  generation.setServices(services);

  // setup all UI wiring
  interaction.setupEventListeners();
  interaction.setupKeyboardShortcuts();
  propsPanel.setup();
  imageHandler.setupImageModal();
  imageHandler.setupImageDropdown();
  imageHandler.setupDragDrop();
  exportHandler.setupSaveDropdown(() => propsPanel.hideAllDropdowns());
  generation.setupGenerateDropdown();
  settingsPanel.init();

  // load config first so initial visuals and read-only flag are correct
  await configStore.init();
  applyConfig(configStore.getConfig());

  // advertise LLM commands
  commandSurface.init(charmiq);

  // initial transform -- pan and zoom come from config so embedders can
  // position the viewport (e.g. flush with top-left, or centered on content)
  const cfg = configStore.getConfig();
  viewport.panOffset = { x: cfg.initialPanX, y: cfg.initialPanY };
  viewport.zoomLevel = cfg.initialZoom;
  viewport.updateTransform();

  syncElements();

  // discover initial elements content (onChange callback registered above)
  await contentBridge.discover();
};

start().catch(err => console.error('Initialization error:', err));
