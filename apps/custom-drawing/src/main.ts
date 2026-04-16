import { CanvasViewport } from './canvas-viewport';
import { ClipboardHandler } from './clipboard-handler';
import { CommandSurface } from './command-surface';
import type { DrawingElement } from './element-model';
import { ExportHandler } from './export-handler';
import { GenerationHandler } from './generation-handler';
import { ImageHandler } from './image-handler';
import { InteractionHandler } from './interaction-handler';
import { PropertiesPanel } from './properties-panel';
import { SelectionManager } from './selection-manager';
import { StateBridge } from './state-bridge';
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
const generation     = new GenerationHandler(exportHandler, renderer, selection, tools);
const propsPanel     = new PropertiesPanel(renderer, selection);
const clipboard      = new ClipboardHandler(viewport, renderer, selection);
const stateBridge    = new StateBridge(charmiq.appState);
const commandSurface = new CommandSurface(renderer, selection);

// --------------------------------------------------------------------------------
// shared elements array — all modules reference the same array object
let elements: DrawingElement[] = [];

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
// helper: save current elements to state bridge
const save = () => {
  // after any module mutates elements, re-sync references and persist
  elements = interaction.elements; // interaction is the most common mutator
  syncElements();
  stateBridge.save(elements);
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
  onGenerate: (mode) => generation.generateFromDrawing(mode).catch(err => console.error('Generation failed:', err)),
  onCopy: () => clipboard.copySelected(),
  onCut: () => { clipboard.cutSelected(); elements = clipboard.elements; syncElements(); },
  onPaste: () => { clipboard.paste().then(() => { elements = clipboard.elements; syncElements(); }); },
  onDeleteSelected: () => { clipboard.deleteSelected(); elements = clipboard.elements; syncElements(); },
});

textEditor.onSave = save;
imageHandler.onSave = save;
propsPanel.onSave = save;
clipboard.onSave = save;
commandSurface.onSave = save;

selection.setOnShowProperties(() => propsPanel.show());

tools.setOnToolChange((tool) => {
  if(tool !== 'selection') selection.deselectAll();
});

// action buttons in properties panel
document.getElementById('deleteBtn')!.addEventListener('click', () => { clipboard.deleteSelected(); elements = clipboard.elements; syncElements(); });
document.getElementById('copyBtn')!.addEventListener('click', () => clipboard.copySelected());
document.getElementById('groupBtn')!.addEventListener('click', () => { clipboard.groupSelected(); elements = clipboard.elements; syncElements(); });
document.getElementById('ungroupBtn')!.addEventListener('click', () => { clipboard.ungroupSelected(); elements = clipboard.elements; syncElements(); });

// == State Bridge — incoming updates =============================================
stateBridge.onElementsChanged = (newElements) => {
  elements = newElements;
  syncElements();

  // reconcile selection with new elements
  selection.reconcile(elements);

  // cancel text editing if element was deleted externally
  textEditor.cancelIfDeleted();

  // re-render
  renderer.rerenderAll(elements);

  if(selection.selectedElements.length > 0) {
    selection.showSelectionHandles();
    propsPanel.show();
  } else {
    selection.clearSelection();
  }
};

// == Init ========================================================================
const start = async () => {
  // wait for fonts before initializing anything
  await textMeasure.init();

  // services from CharmIQ Platform (may be null in standalone/dev)
  const services = {
    commandService: charmiq.commandService ?? null,
    assetService: charmiq.assetService ?? null,
    generationService: charmiq.generationService ?? null,
  };
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

  // start reactive state sync
  stateBridge.init();

  // advertise LLM commands
  commandSurface.init(charmiq);

  // initial transform
  viewport.updateTransform();

  syncElements();
};

start().catch(err => console.error('Initialization error:', err));
