import type { CanvasViewport } from './canvas-viewport';
import { generateId, type DrawingElement, type Point } from './element-model';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';
import type { TextMeasurement } from './text-measurement';
import type { ToolManager } from './tool-manager';

// text input overlay — creating and editing text elements
// ********************************************************************************
// == TextEditor ==================================================================
export class TextEditor {
  private readonly viewport: CanvasViewport;
  private readonly textMeasure: TextMeasurement;
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;
  private readonly tools: ToolManager;

  private textInput: HTMLTextAreaElement | null = null;
  private currentTextElement: any | null = null;
  private isFinishingTextEdit = false;
  private currentClickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  elements: DrawingElement[] = [];
  onSave: (() => void) | null = null;

  public constructor(
    viewport: CanvasViewport,
    textMeasure: TextMeasurement,
    renderer: SvgRenderer,
    selection: SelectionManager,
    tools: ToolManager,
  ) {
    this.viewport = viewport;
    this.textMeasure = textMeasure;
    this.renderer = renderer;
    this.selection = selection;
    this.tools = tools;
  }

  public get isActive(): boolean { return !!this.textInput; }
  public get isFinishing(): boolean { return this.isFinishingTextEdit; }

  // ==============================================================================
  // -- Start Text ----------------------------------------------------------------
  public startTextInput(point: Point): void {
    if(this.textInput || this.isFinishingTextEdit || this.currentTextElement) return;

    const id = generateId();
    const textElement: any = {
      id, type: 'text',
      x: point.x, y: point.y,
      text: '', fontSize: 16,
      fill: '#000000',
      width: 100, height: 20,
      isNew: true,
    };
    this.currentTextElement = textElement;
    this.showTextInput(textElement);
  }

  // -- Edit Text -----------------------------------------------------------------
  public editTextElement(textElement: DrawingElement): void {
    if(this.textInput || this.isFinishingTextEdit || this.currentTextElement) return;

    const latest = this.elements.find(el => el.id === textElement.id);
    if(!latest || latest.type !== 'text') return;

    this.isFinishingTextEdit = true;
    this.currentTextElement = latest;
    this.selection.deselectAll();
    delete (latest as any).isNew;
    this.showTextInput(latest);
    this.isFinishingTextEdit = false;
  }

  // -- Cancel --------------------------------------------------------------------
  // cancel text editing if the element was deleted externally
  public cancelIfDeleted(): void {
    if(!this.textInput || !this.currentTextElement) return;
    const found = this.elements.find(el => el.id === this.currentTextElement.id);
    if(!found) {
      const svgEl = document.getElementById(this.currentTextElement.id);
      if(this.textInput?.parentNode) document.body.removeChild(this.textInput);
      this.textInput = null;
      this.currentTextElement = null;
      if(svgEl) svgEl.setAttribute('visibility', 'visible');
    } /* else -- element still exists */
  }

  // ==============================================================================
  private showTextInput(textElement: any): void {
    if(this.textInput) return;

    // clean up lingering handlers
    if(this.currentClickOutsideHandler) {
      document.removeEventListener('click', this.currentClickOutsideHandler);
      this.currentClickOutsideHandler = null;
    } /* else -- no lingering handler */

    const targetId = textElement.id;
    const isNew = textElement.isNew || false;

    // deep working copy
    const work: any = {
      id: targetId, type: 'text',
      x: Number(textElement.x), y: Number(textElement.y),
      text: String(textElement.text || ''),
      fontSize: Number(textElement.fontSize || 16),
      width: Number(textElement.width || 100),
      height: Number(textElement.height || 20),
      fill: String(textElement.fill || '#000000'),
      textAlign: String(textElement.textAlign || 'left'),
      angle: Number(textElement.angle || 0),
      originalText: String(textElement.text || ''),
    };
    this.currentTextElement = work;

    // hide the SVG text while editing
    const svgEl = document.getElementById(targetId);
    if(svgEl) svgEl.setAttribute('visibility', 'hidden');

    // create textarea overlay
    this.textInput = document.createElement('textarea');
    this.textInput.className = 'text-input';

    // position
    const screenPos = this.viewport.canvasToScreen(textElement.x, textElement.y);
    const yOffset = 3;
    this.textInput.style.left = `${screenPos.x}px`;
    this.textInput.style.top = `${screenPos.y + yOffset}px`;

    if(isNew) {
      this.textInput.style.width = '1000px';
    } else {
      this.textInput.style.width = Math.max(1, work.width * this.viewport.zoomLevel) + 'px';
      this.textInput.style.whiteSpace = 'pre-wrap';
      this.textInput.style.wordWrap = 'break-word';
    }

    this.textInput.style.fontSize = (work.fontSize * this.viewport.zoomLevel) + 'px';
    this.textInput.style.minHeight = '24px';
    this.textInput.value = work.text || '';
    this.textInput.placeholder = 'Enter text...';
    this.textInput.style.overflow = 'hidden';
    this.textInput.style.resize = 'none';

    if(work.angle && (work.angle !== 0)) {
      const deg = (work.angle * 180) / Math.PI;
      this.textInput.style.transform = `rotate(${deg}deg)`;
      this.textInput.style.transformOrigin = 'top left';
    } /* else -- no rotation */

    if(work.textAlign) this.textInput.style.textAlign = work.textAlign;

    document.body.appendChild(this.textInput);

    // auto-resize
    const autoResize = () => {
      if(!this.textInput) return;
      this.textInput.style.height = 'auto';
      this.textInput.style.height = Math.max(24, this.textInput.scrollHeight) + 'px';
    };
    this.textInput.addEventListener('input', autoResize);
    autoResize();

    setTimeout(() => { this.textInput?.focus(); this.textInput?.select(); }, 1);

    const originalText = work.originalText || '';

    // -- finishText closure -------------------------------------------------------
    const finishText = (): void => {
      document.removeEventListener('click', handleClickOutside);
      if(this.currentClickOutsideHandler === handleClickOutside) this.currentClickOutsideHandler = null;
      if(!this.textInput) return;
      if(this.currentTextElement?.id !== targetId) return;

      this.isFinishingTextEdit = true;

      const inputValue = this.textInput.value.trim();

      if(this.textInput.parentNode) document.body.removeChild(this.textInput);
      this.textInput = null;

      // show SVG text again
      const svg = document.getElementById(targetId);
      if(svg) svg.setAttribute('visibility', 'visible');

      if(inputValue !== originalText.trim()) {
        if(inputValue) {
          const dims = isNew
                        ? this.textMeasure.measureTextDimensions(inputValue, work.fontSize || 16)
                        : this.textMeasure.measureWrappedText(inputValue, work.width, work.fontSize || 16);

          const updated = { ...work, text: inputValue, width: dims.width, height: dims.height };
          delete updated.isNew;
          delete updated.originalText;

          const idx = this.elements.findIndex(el => el.id === targetId);
          if(idx >= 0) this.elements[idx] = updated;
          else this.elements.push(updated);

          const ref = this.elements.find(el => el.id === targetId);
          if(ref) {
            this.selection.select([ref]);
            this.renderer.renderElement(ref);
          } /* else -- no reference */
          this.selection.showSelectionHandles();
          this.currentTextElement = null;
          this.isFinishingTextEdit = false;
          this.onSave?.();
        } else if(isNew) {
          this.isFinishingTextEdit = false;
          this.currentTextElement = null;
        } else {
          // existing text cleared → delete element
          const idx = this.elements.findIndex(el => el.id === targetId);
          if(idx >= 0) {
            this.elements.splice(idx, 1);
            this.renderer.rerenderAll(this.elements);
            this.onSave?.();
          } /* else -- no element to delete */
          this.isFinishingTextEdit = false;
          this.currentTextElement = null;
        }
      } else {
        this.isFinishingTextEdit = false;
        this.currentTextElement = null;
      }

      this.tools.selectTool('selection');
    };

    // -- keyboard handlers -------------------------------------------------------
    this.textInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if(e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishText(); }
      else if((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); finishText(); }
    });

    // -- click outside handler ---------------------------------------------------
    let ignoreFirstClick = isNew;
    const handleClickOutside = (e: MouseEvent): void => {
      if(ignoreFirstClick) { ignoreFirstClick = false; return; }
      if(this.textInput && !this.textInput.contains(e.target as Node)) finishText();
    };
    document.addEventListener('click', handleClickOutside);
    this.currentClickOutsideHandler = handleClickOutside;
  }
}
