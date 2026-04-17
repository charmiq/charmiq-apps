// tool selection, keyboard shortcuts, tool-to-cursor mappings
// ********************************************************************************
export type Tool =
  | 'selection'
  | 'pan'
  | 'square'
  | 'diamond'
  | 'circle'
  | 'line'
  | 'text'
  | 'eraser';

const TOOL_CURSORS: Record<Tool, string> = {
  selection: 'selection',
  pan:       'pan',
  square:    'crosshair',
  diamond:   'crosshair',
  circle:    'crosshair',
  line:      'crosshair',
  text:      'text',
  eraser:    'eraser',
};

// == ToolManager =================================================================
export class ToolManager {
  currentTool: Tool = 'selection';
  spacebarHeld = false;

  /** when true, all tools except 'selection' and 'pan' are blocked */
  readOnly = false;

  private readonly container: HTMLElement;
  private readonly infoText: HTMLElement;
  private onToolChange: ((tool: Tool) => void) | null = null;

  public constructor(container: HTMLElement) {
    this.container = container;
    this.infoText = document.getElementById('infoText')!;
    this.applyToolCursor();
    this.setupToolButtons();
  }

  // bind click handlers on all .tool-btn[data-tool] buttons
  private setupToolButtons(): void {
    document.querySelectorAll<HTMLElement>('.tool-btn').forEach(btn => {
      const tool = btn.dataset.tool as Tool | undefined;
      if(tool) btn.addEventListener('click', () => this.selectTool(tool));
    });
  }

  // ------------------------------------------------------------------------------
  // register a callback fired whenever the tool changes
  public setOnToolChange(cb: (tool: Tool) => void): void {
    this.onToolChange = cb;
  }

  // ==============================================================================
  public selectTool(tool: Tool): void {
    // in read-only mode, only selection and pan are permitted
    if(this.readOnly && (tool !== 'selection') && (tool !== 'pan')) return;

    this.currentTool = tool;

    // update toolbar button highlights
    document.querySelectorAll('.tool-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
    });

    // show info text only for selection tool
    this.infoText.style.display = tool === 'selection' ? 'block' : 'none';

    this.applyToolCursor();
    this.onToolChange?.(tool);
  }

  // ==============================================================================
  // called on spacebar down/up
  public setSpacebarPan(held: boolean): void {
    this.spacebarHeld = held;
    if (held) {
      this.container.classList.remove('selection');
      this.container.classList.add('pan');
    } else {
      this.container.classList.remove('pan');
      this.container.classList.add('selection');
    }
    this.container.style.cursor = '';
  }

  public isDrawingTool(): boolean {
    return ['square', 'diamond', 'circle', 'line', 'text'].includes(this.currentTool);
  }

  // ==============================================================================
  private applyToolCursor(): void {
    // remove old cursor classes
    for (const cls of Object.values(TOOL_CURSORS)) {
      this.container.classList.remove(cls);
    }
    const cls = TOOL_CURSORS[this.currentTool];
    if (cls) this.container.classList.add(cls);
  }
}
