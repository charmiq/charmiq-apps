import type { CanvasViewport } from './canvas-viewport';
import { generateId, getElementBounds, moveElementBy, type DrawingElement, type Point } from './element-model';
import { distanceToLine, isPointInElement, rotatePoint, snapAngle, getDrawingBounds, isPointNearLine, doRectsIntersect } from './geometry';
import type { SelectionManager, HandleType } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';
import type { TextMeasurement } from './text-measurement';
import type { ToolManager, Tool } from './tool-manager';

// mouse and keyboard event orchestration — drawing, moving, resizing, rotating
// ********************************************************************************
// == InteractionHandler ==========================================================
export class InteractionHandler {
  // -- Dependencies (injected) ---------------------------------------------------
  private readonly viewport: CanvasViewport;
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;
  private readonly tools: ToolManager;
  private readonly textMeasure: TextMeasurement;

  // -- Callbacks -----------------------------------------------------------------
  private onSave: (() => void) | null = null;
  private onStartTextInput: ((point: Point) => void) | null = null;
  private onEditTextElement: ((el: DrawingElement) => void) | null = null;
  private onEditImageElement: ((el: DrawingElement) => void) | null = null;
  private onShowImageModal: (() => void) | null = null;
  private onToggleImageDropdown: (() => void) | null = null;
  private onToggleSaveDropdown: (() => void) | null = null;
  private onToggleGenerateDropdown: (() => void) | null = null;
  private onGenerate: ((mode: string) => void) | null = null;
  private onCopy: (() => void) | null = null;
  private onCut: (() => void) | null = null;
  private onPaste: (() => void) | null = null;
  private onDeleteSelected: (() => void) | null = null;

  // -- State references (shared with DrawingApp) ---------------------------------
  elements: DrawingElement[] = [];

  /** when true, only selection / pan / zoom are allowed (no mutations) */
  readOnly = false;

  // -- Internal state ------------------------------------------------------------
  private isDrawing = false;
  private startPoint: Point = { x: 0, y: 0 };
  private currentElement: DrawingElement | null = null;
  private selectionBox: { x: number; y: number; width: number; height: number } | null = null;
  private hasMoved = false;
  private hasResized = false;
  private isPanning = false;
  private panStartPos: Point = { x: 0, y: 0 };
  private isResizing = false;
  private resizeHandle: { type: HandleType } | null = null;
  private resizeStartPoint: Point = { x: 0, y: 0 };
  private isMoving = false;
  private moveStartPoint: Point = { x: 0, y: 0 };
  private originalPositions: any[] = [];
  private originalBounds: any = null;
  private originalElementStates: any[] = [];
  private isRotating = false;
  private rotationStartAngle = 0;
  private rotationCenter: Point | null = null;
  private originalAngles: number[] | null = null;
  private shiftKeyHeld = false;
  private snapBackPending = false;
  private lastMousePoint: Point | null = null;
  private isMouseOutside = false;
  private pendingShiftClick: { element: DrawingElement; isSelected: boolean } | null = null;

  public constructor(
    viewport: CanvasViewport,
    renderer: SvgRenderer,
    selection: SelectionManager,
    tools: ToolManager,
    textMeasure: TextMeasurement,
  ) {
    this.viewport = viewport;
    this.renderer = renderer;
    this.selection = selection;
    this.tools = tools;
    this.textMeasure = textMeasure;
  }

  // ==============================================================================
  public setCallbacks(cbs: {
    onSave: () => void;
    onStartTextInput: (point: Point) => void;
    onEditTextElement: (el: DrawingElement) => void;
    onEditImageElement: (el: DrawingElement) => void;
    onShowImageModal: () => void;
    onToggleImageDropdown: () => void;
    onToggleSaveDropdown: () => void;
    onToggleGenerateDropdown: () => void;
    onGenerate: (mode: string) => void;
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    onDeleteSelected: () => void;
  }): void {
    Object.assign(this, cbs);
  }

  // == Public Setup ==============================================================
  public setupEventListeners(): void {
    const c = this.viewport.container;

    c.addEventListener('mousedown', this.handleMouseDown);
    c.addEventListener('mousemove', this.handleMouseMove);
    c.addEventListener('mouseup', this.handleMouseUp);
    c.addEventListener('dblclick', this.handleDoubleClick);
    c.addEventListener('wheel', this.handleWheel, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());

    c.addEventListener('mouseleave', () => { if(this.isDrawing) this.isMouseOutside = true; });
    c.addEventListener('mouseenter', (e: MouseEvent) => {
      if(this.isMouseOutside) {
        this.isMouseOutside = false;
        if(this.isDrawing && e.buttons === 0) this.endCurrentOperation();
      } /* else -- mouse entered but wasn't previously outside */
    });
    document.addEventListener('mouseleave', () => { if(this.isDrawing) this.isMouseOutside = true; });
    document.addEventListener('mouseenter', (e: MouseEvent) => {
      if(this.isMouseOutside) {
        this.isMouseOutside = false;
        if(this.isDrawing && e.buttons === 0) this.endCurrentOperation();
      } /* else -- mouse entered but wasn't previously outside */
    });
  }

  // ------------------------------------------------------------------------------
  public setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if(((e.target as HTMLElement).tagName === 'INPUT') || ((e.target as HTMLElement).tagName === 'TEXTAREA')) return;

      // spacebar → temporary pan
      if((e.key === ' ') && !e.repeat && (this.tools.currentTool === 'selection')) {
        e.preventDefault();
        this.tools.setSpacebarPan(true);
        return;
      } /* else -- not spacebar or not selection tool */

      // undo/redo propagate to parent
      if((e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z') || (e.key.toLowerCase() === 'y'))) return;

      // copy / cut / paste
      if((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'c') && (this.selection.selectedElements.length > 0)) { e.preventDefault(); this.onCopy?.(); return; }
      if((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'x') && (this.selection.selectedElements.length > 0) && !this.readOnly) { e.preventDefault(); this.onCut?.(); return; }
      if((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'v') && !this.readOnly) { e.preventDefault(); this.onPaste?.(); return; }

      // in read-only mode, only allow selection / pan tool shortcuts and non-mutating actions
      if(this.readOnly) {
        switch(e.key.toLowerCase()) {
          case '1': case 'v': this.tools.selectTool('selection'); break;
          case 'h':           this.tools.selectTool('pan'); break;
          case 's':           this.onToggleSaveDropdown?.(); break;
        }
        return;
      } /* else -- full keyboard shortcuts below */

      switch (e.key.toLowerCase()) {
        case '1': case 'v': this.tools.selectTool('selection'); break;
        case 'h': this.tools.selectTool('pan'); break;
        case '2': case 'r': this.tools.selectTool('square'); break;
        case '3': case 'd': this.tools.selectTool('diamond'); break;
        case '4': case 'o': this.tools.selectTool('circle'); break;
        case '5': case 'a': case '6': case 'l': this.tools.selectTool('line'); break;
        case '8': case 't': this.tools.selectTool('text'); break;
        case '9': case 'i': this.onToggleImageDropdown?.(); break;
        case '0': case 'e': this.tools.selectTool('eraser'); break;
        case 's': this.onToggleSaveDropdown?.(); break;
        case 'g':
          if(this.selection.selectedElements.length < 1) this.onGenerate?.('all');
          else this.onToggleGenerateDropdown?.();
          break;
        case 'delete': case 'backspace':
          if(this.selection.selectedElements.length > 0) this.onDeleteSelected?.();
          break;
        case 'arrowup': case 'arrowdown': case 'arrowleft': case 'arrowright':
          if(this.selection.selectedElements.length > 0) {
            e.preventDefault();
            this.moveSelectedWithKeyboard(e.key, e.shiftKey);
          }
          break;
      }
    });

    document.addEventListener('keyup', (e: KeyboardEvent) => {
      if((e.key === ' ') && (this.tools.currentTool === 'selection')) {
        this.tools.setSpacebarPan(false);
        if(this.isPanning) this.endPanning();
      } /* else -- not spacebar or not selection tool */
      if((e.key === 'Shift') && this.isResizing && this.shiftKeyHeld &&
          (this.selection.selectedElements.length === 1) && (this.selection.selectedElements[0].type === 'image')) {
        this.shiftKeyHeld = false;
        if(this.lastMousePoint) {
          this.resizeProportionally(
            this.lastMousePoint.x - this.resizeStartPoint.x,
            this.lastMousePoint.y - this.resizeStartPoint.y,
          );
          this.selection.showSelectionHandles();
        } /* else -- no last mouse point for resizing */
      } /* else -- not shift key or not resizing or not single image element */
    });
  }

  // == Mouse Handlers ============================================================
  // -- Mouse Down ----------------------------------------------------------------
  private handleMouseDown = (e: MouseEvent): void => {
    const point = this.getCanvasPoint(e);
    this.startPoint = point;
    this.isDrawing = true;

    // in read-only mode coerce any mutating tool into the selection tool (pan
    // remains pan so users can still navigate the canvas)
    const tool: Tool = this.readOnly && (this.tools.currentTool !== 'pan')
      ? 'selection'
      : this.tools.currentTool;

    switch (tool) {
      case 'pan':
        this.startPanning(e);
        break;
      case 'selection':
        if(this.tools.spacebarHeld) { this.startPanning(e); break; }
        this.handleSelectionStart(e, point);
        break;
      case 'square': case 'diamond': case 'circle': case 'line':
        this.startDrawing(point);
        break;
      case 'text':
        this.onStartTextInput?.(point);
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.isDrawing = false;
        break;
      case 'eraser':
        this.handleEraser(point);
        break;
    }
  };

  // -- Mouse Move ----------------------------------------------------------------
  private handleMouseMove = (e: MouseEvent): void => {
    const point = this.getCanvasPoint(e);
    this.lastMousePoint = point;

    const prevShift = this.shiftKeyHeld;
    this.shiftKeyHeld = e.shiftKey;

    if(this.isResizing && prevShift && !this.shiftKeyHeld &&
        (this.selection.selectedElements.length === 1) && (this.selection.selectedElements[0].type === 'image')) {
      this.snapBackPending = true;
    } /* else -- not resizing with shift key or not single image element */

    if(this.tools.spacebarHeld && !this.isDrawing) return;

    // cursor updates when idle
    if(!this.isDrawing && (this.tools.currentTool === 'selection') && !this.tools.spacebarHeld) {
      this.updateIdleCursor(point);
    } /* else -- not idle for cursor updates */

    if(!this.isDrawing) return;

    if(this.isPanning) { this.updatePanning(e); return; }
    if(this.isResizing) { this.updateResize(point); return; }
    if(this.isMoving) { this.updateMoving(point, e.shiftKey); return; }
    if(this.isRotating) { this.updateRotation(point, e.shiftKey); return; }
    if(this.currentElement) { this.updateDrawing(point, e.shiftKey); return; }
    if(this.selectionBox) { this.updateSelectionBox(point); }
  };

  // -- Mouse Up ------------------------------------------------------------------
  private handleMouseUp = (e: MouseEvent): void => {
    if(this.isPanning) { this.endPanning(); }
    else if(this.isResizing) { this.endResize(); }
    else if(this.isMoving) { this.endMoving(e); }
    else if(this.isRotating) { this.endRotation(); }
    else if(this.currentElement) { this.endDrawing(); }
    else if(this.selectionBox) { this.endSelectionBox(); }

    this.isDrawing = false;
    this.isMouseOutside = false;
  };

  // -- Double Click --------------------------------------------------------------
  private handleDoubleClick = (e: MouseEvent): void => {
    if(this.tools.currentTool !== 'selection') return;
    const point = this.getCanvasPoint(e);
    const el = this.getElementAtPoint(point);
    if(!el) return;
    if(el.type === 'text') this.onEditTextElement?.(el);
    else if(el.type === 'image') this.onEditImageElement?.(el);
  };

  // -- Wheel (Zoom) --------------------------------------------------------------
  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.viewport.container.getBoundingClientRect();
    this.viewport.applyZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
    if(this.selection.selectedElements.length > 0) this.selection.showSelectionHandles();
  };

  // == Panning ===================================================================
  private startPanning(e: MouseEvent): void {
    this.isPanning = true;
    this.panStartPos = { x: e.clientX, y: e.clientY };
  }

  private updatePanning(e: MouseEvent): void {
    const dx = e.clientX - this.panStartPos.x;
    const dy = e.clientY - this.panStartPos.y;
    this.viewport.pan(dx, dy);
    this.panStartPos = { x: e.clientX, y: e.clientY };
    if(this.selection.selectedElements.length > 0) this.selection.showSelectionHandles();
  }

  private endPanning(): void { this.isPanning = false; }

  // == Drawing (creating new shapes) =============================================
  private startDrawing(point: Point): void {
    const type = this.tools.currentTool === 'square' ? 'rectangle'
      : this.tools.currentTool === 'circle' ? 'ellipse'
      : this.tools.currentTool === 'diamond' ? 'diamond'
      : 'line';

    const id = generateId();
    const el: any = {
      id, type,
      x: point.x, y: point.y,
      x2: point.x, y2: point.y,
      stroke: '#000000',
      strokeWidth: 2,
      fill: 'transparent',
    };
    if(type === 'line') {
      el.startDecoration = 'none';
      el.endDecoration = 'none';
    } /* else -- not a line type */
    this.currentElement = el;
    this.renderer.renderElement(el);
  }

  // ------------------------------------------------------------------------------
  private updateDrawing(point: Point, shift: boolean): void {
    if(!this.currentElement) return;
    const el = this.currentElement as any;

    if(shift && (el.type !== 'line')) {
      // constrain to square / circle
      const dx = point.x - el.x,
            dy = point.y - el.y;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      el.x2 = el.x + Math.sign(dx) * size;
      el.y2 = el.y + Math.sign(dy) * size;
    } else if(shift && (el.type === 'line')) {
      // snap to 45° increments
      const dx = point.x - el.x,
            dy = point.y - el.y;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      el.x2 = el.x + Math.cos(snapped) * len;
      el.y2 = el.y + Math.sin(snapped) * len;
    } else {
      el.x2 = point.x;
      el.y2 = point.y;
    }

    this.renderer.updateElementAttributes(el);
  }

  private endDrawing(): void {
    if(!this.currentElement) return;
    const el = this.currentElement as any;

    // discard tiny shapes
    const w = Math.abs(el.x2 - el.x),
          h = Math.abs(el.y2 - el.y);
    if(w < 2 && h < 2 && el.type !== 'line') {
      const svgEl = document.getElementById(el.id);
      if(svgEl) svgEl.remove();
    } else {
      this.elements.push(el);
      this.selection.select([el]);
      this.onSave?.();
    }
    this.currentElement = null;
    this.tools.selectTool('selection');
  }

  // == Selection =================================================================
  private handleSelectionStart(e: MouseEvent, point: Point): void {
    // check rotate handle
    if(!this.readOnly && (this.selection.selectedElements.length > 0)) {
      const rh = this.getRotateHandleAtPoint(point);
      if(rh) { this.startRotation(point); return; }

      // check resize handle
      const handle = this.selection.getHandleAtPoint(point);
      if(handle) { this.startResize(point, handle); return; }

      // check edge handles (edge resize for single non-line elements)
      const edge = this.getEdgeAtPoint(point);
      if(edge) { this.startResize(point, edge); return; }
    } /* else -- read-only or no selection */

    // check if clicking on an element
    const clickedEl = this.getElementAtPoint(point);

    if(clickedEl) {
      if(e.shiftKey) {
        // shift-click: toggle selection
        const alreadySelected = this.selection.selectedElements.some(s => s.id === clickedEl.id);
        if(alreadySelected) {
          this.pendingShiftClick = { element: clickedEl, isSelected: true };
        } else {
          // expand selection including group
          this.expandSelectionWithGroup(clickedEl);
          this.pendingShiftClick = { element: clickedEl, isSelected: false };
        }
      } else {
        const alreadySelected = this.selection.selectedElements.some(s => s.id === clickedEl.id);
        if(!alreadySelected) {
          this.selectWithGroup(clickedEl);
        }
      }
      if(!this.readOnly) this.startMoving(point);
    } else {
      // clicked on empty canvas → start marquee
      if(!e.shiftKey) this.selection.deselectAll();
      this.startSelectionBox(point);
    }
  }

  // == Moving ====================================================================
  // -- Start ---------------------------------------------------------------------
  private startMoving(point: Point): void {
    this.isMoving = true;
    this.hasMoved = false;
    this.moveStartPoint = point;
    this.originalPositions = this.selection.selectedElements.map(el => ({ ...el }));
  }

  // -- Update --------------------------------------------------------------------
  private updateMoving(point: Point, shift: boolean): void {
    if(!this.isMoving) return;

    // pending shift-click on unselected element — don't move yet
    if(this.pendingShiftClick && !this.pendingShiftClick.isSelected) {
      const dx = point.x - this.moveStartPoint.x;
      const dy = point.y - this.moveStartPoint.y;
      if(Math.abs(dx) > 1 || Math.abs(dy) > 1) this.hasMoved = true;
      return;
    } /* else -- either no pending shift-click or pending shift-click on already selected element */

    let dx = point.x - this.moveStartPoint.x,
        dy = point.y - this.moveStartPoint.y;

    if(shift) {
      if(Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    } /* else -- not holding shift for axis-constrained movement */

    if(Math.abs(dx) > 1 || Math.abs(dy) > 1) this.hasMoved = true;

    this.selection.selectedElements.forEach((el, i) => {
      const orig = this.originalPositions[i];

      // restore to original position then apply delta
      if(el.type === 'svg-circle') {
        el.cx = orig.cx + dx; el.cy = orig.cy + dy;
      } else if(el.type === 'svg-path' || el.type === 'svg-polygon') {
        el.offsetX = orig.offsetX + dx; el.offsetY = orig.offsetY + dy;
      } else {
        el.x = orig.x + dx; el.y = orig.y + dy;
        if('x2' in el) el.x2 = orig.x2 + dx;
        if('y2' in el) el.y2 = orig.y2 + dy;
      }

      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
      this.renderer.renderElement(el);
    });

    this.selection.showSelectionHandles();
  }

  // -- End -----------------------------------------------------------------------
  private endMoving(e: MouseEvent): void {
    this.isMoving = false;

    // handle pending shift-click (click without drag)
    if(this.pendingShiftClick && !this.hasMoved) {
      if(this.pendingShiftClick.isSelected) {
        this.selection.removeFromSelection(this.pendingShiftClick.element);
      } /* else -- was not already selected */
    } /* else -- no pending shift-click or had already moved */
    this.pendingShiftClick = null;

    if(this.hasMoved) this.onSave?.();
  }

  // == Resizing ==================================================================
  // -- Start ---------------------------------------------------------------------
  private startResize(point: Point, handle: HandleType | { type: HandleType }): void {
    const type = typeof handle === 'string' ? handle : handle.type;
    this.isResizing = true;
    this.hasResized = false;
    this.resizeHandle = { type: type as HandleType };
    this.resizeStartPoint = point;
    this.originalElementStates = this.selection.selectedElements.map(el => ({ ...el }));

    // compute combined original bounds for multi-element resize
    if(this.selection.selectedElements.length > 1) {
      const { minX, minY, maxX, maxY } = getDrawingBounds(this.selection.selectedElements);
      this.originalBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    } else {
      const b = getElementBounds(this.selection.selectedElements[0]);
      this.originalBounds = b;
    }
  }

  // -- Update --------------------------------------------------------------------
  private updateResize(point: Point): void {
    if(!this.isResizing || !this.resizeHandle) return;
    const rawDx = point.x - this.resizeStartPoint.x;
    const rawDy = point.y - this.resizeStartPoint.y;
    if(Math.abs(rawDx) > 1 || Math.abs(rawDy) > 1) this.hasResized = true;

    if(this.snapBackPending) {
      this.snapBackPending = false;
      this.resizeProportionally(rawDx, rawDy);
      this.selection.showSelectionHandles();
      return;
    } /* else -- not pending snap-back */

    const sel = this.selection.selectedElements;
    if(sel.length > 1) {
      this.resizeProportionally(rawDx, rawDy);
    } else if(sel.length === 1) {
      const el = sel[0];
      if(el.type === 'line') this.resizeSingleLine(point, el);
      else if(el.type === 'text') this.resizeSingleText(rawDx, rawDy, el);
      else if(el.angle && (el.angle !== 0)) this.resizeRotatedElement(point, rawDx, rawDy);
      else if(el.type === 'image') {
        if(this.shiftKeyHeld) this.resizeSingleFree(rawDx, rawDy);
        else this.resizeProportionally(rawDx, rawDy);
      } else {
        this.resizeSingleFree(rawDx, rawDy);
      }
    }
    this.selection.showSelectionHandles();
  }

  // -- End -----------------------------------------------------------------------
  private endResize(): void {
    this.isResizing = false;
    this.resizeHandle = null;
    if(this.hasResized) this.onSave?.();
  }

  // == Resize Strategies =========================================================
  // -- Proportional --------------------------------------------------------------
  private resizeProportionally(rawDx: number, rawDy: number): void {
    const ob = this.originalBounds;
    if(!ob || (ob.width === 0) || (ob.height === 0)) return;
    const handleType = this.resizeHandle!.type;

    // determine dominant axis
    let scale = 1 + Math.max(Math.abs(rawDx), Math.abs(rawDy)) / Math.max(ob.width, ob.height);
    if((handleType === 'nw') || (handleType === 'sw')) { if(rawDx > 0) scale = 1 / scale; }
    else { if(rawDx < 0) scale = 1 / scale; }
    if((handleType === 'nw') || (handleType === 'ne')) { if(rawDy > 0) scale = 1 / scale; }
    else { if(rawDy < 0) scale = 1 / scale; }

    const newW = ob.width * scale,
          newH = ob.height * scale;
    if(newW < 10 || newH < 10) return;

    // anchor at the opposite corner
    let anchorX = ob.x,
        anchorY = ob.y;
    if(handleType === 'nw') { anchorX = ob.x + ob.width; anchorY = ob.y + ob.height; }
    else if(handleType === 'ne') { anchorX = ob.x; anchorY = ob.y + ob.height; }
    else if(handleType === 'sw') { anchorX = ob.x + ob.width; anchorY = ob.y; }
    /* else se — anchor is nw, already set */

    const newBounds = {
      x: handleType.includes('e') ? anchorX : anchorX - newW,
      y: handleType.includes('s') ? anchorY : anchorY - newH,
      width: newW,
      height: newH,
    };

    this.applyBoundsToSelected(newBounds);
  }

  // -- Freeform (non-proportional) -----------------------------------------------
  private resizeSingleFree(rawDx: number, rawDy: number): void {
    const orig = this.originalElementStates[0];
    const el = this.selection.selectedElements[0] as any;
    const ht = this.resizeHandle!.type;

    if((ht === 'nw') || (ht === 'sw') || (ht === 'w')) el.x = orig.x + rawDx;
    if((ht === 'ne') || (ht === 'se') || (ht === 'e')) el.x2 = orig.x2 + rawDx;
    if((ht === 'nw') || (ht === 'ne') || (ht === 'n')) el.y = orig.y + rawDy;
    if((ht === 'sw') || (ht === 'se') || (ht === 's')) el.y2 = orig.y2 + rawDy;

    // keep x < x2 and y < y2 if needed? original doesn't enforce this
    const idx = this.elements.findIndex(e => e.id === el.id);
    if(idx >= 0) this.elements[idx] = { ...el };
    this.renderer.updateElementAttributes(el);
  }

  private resizeSingleLine(point: Point, el: any): void {
    const ht = this.resizeHandle!.type;
    if(ht === 'line-start') { el.x = point.x; el.y = point.y; }
    else if(ht === 'line-end') { el.x2 = point.x; el.y2 = point.y; }
    const idx = this.elements.findIndex(e => e.id === el.id);
    if(idx >= 0) this.elements[idx] = { ...el };
    this.renderer.updateElementAttributes(el);
  }

  private resizeSingleText(rawDx: number, rawDy: number, el: any): void {
    const orig = this.originalElementStates[0];
    const ht = this.resizeHandle!.type;

    // only horizontal handles change text width (causing reflow)
    let newWidth = orig.width || 100;
    if((ht === 'ne') || (ht === 'se') || (ht === 'e')) newWidth = Math.max(20, (orig.width || 100) + rawDx);
    if((ht === 'nw') || (ht === 'sw') || (ht === 'w')) newWidth = Math.max(20, (orig.width || 100) - rawDx);

    const dims = this.textMeasure.measureWrappedText(orig.text || '', newWidth, orig.fontSize || 16);
    el.width = newWidth;
    el.height = dims.height;

    if((ht === 'nw') || (ht === 'sw') || (ht === 'w')) el.x = orig.x + rawDx;

    const idx = this.elements.findIndex(e => e.id === el.id);
    if(idx >= 0) this.elements[idx] = { ...el };
    this.renderer.renderElement(el);
  }

  private resizeRotatedElement(point: Point, rawDx: number, rawDy: number): void {
    const el = this.selection.selectedElements[0];
    const orig = this.originalElementStates[0];
    const angle = el.angle || 0;

    // for rotated elements, project the mouse delta into the element's local axes
    const cos = Math.cos(angle),
          sin = Math.sin(angle);

    // calculate the element center
    const bounds = getElementBounds({ ...orig } as DrawingElement);
    const cx = bounds.x + bounds.width / 2,
          cy = bounds.y + bounds.height / 2;

    // project dx,dy into local coords
    const localDx = rawDx * cos + rawDy * sin,
          localDy = -rawDx * sin + rawDy * cos;

    // apply free resize in local space
    const ht = this.resizeHandle!.type;
    let newLeft = bounds.x,
        newTop = bounds.y,
        newRight = bounds.x + bounds.width,
        newBottom = bounds.y + bounds.height;

    if((ht === 'nw') || (ht === 'sw') || (ht === 'w')) newLeft += localDx;
    if((ht === 'ne') || (ht === 'se') || (ht === 'e')) newRight += localDx;
    if((ht === 'nw') || (ht === 'ne') || (ht === 'n')) newTop += localDy;
    if((ht === 'sw') || (ht === 'se') || (ht === 's')) newBottom += localDy;

    const newW = newRight - newLeft,
          newH = newBottom - newTop;
    if(newW < 10 || newH < 10) return;

    const newCx = (newLeft + newRight) / 2,
          newCy = (newTop + newBottom) / 2;

    // translate new center back to world space
    const worldCx = cx + (newCx - cx) * cos - (newCy - cy) * sin,
          worldCy = cy + (newCx - cx) * sin + (newCy - cy) * cos;

    // update element
    if(el.type === 'text') {
      (el as any).x = worldCx - newW / 2;
      (el as any).y = worldCy - newH / 2;
      (el as any).width = newW;
      (el as any).height = newH;
    } else {
      (el as any).x = worldCx - newW / 2;
      (el as any).y = worldCy - newH / 2;
      (el as any).x2 = worldCx + newW / 2;
      (el as any).y2 = worldCy + newH / 2;
    }
    if(el.type === 'image') {
      (el as any).width = newW;
      (el as any).height = newH;
    }

    const idx = this.elements.findIndex(e => e.id === el.id);
    if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
    this.renderer.renderElement(el);
  }

  // ------------------------------------------------------------------------------
  private applyBoundsToSelected(newBounds: { x: number; y: number; width: number; height: number }): void {
    const ob = this.originalBounds;
    const scaleX = newBounds.width / ob.width,
          scaleY = newBounds.height / ob.height;

    this.selection.selectedElements.forEach((el, i) => {
      const orig = this.originalElementStates[i];
      const oX = orig.x - ob.x,
            oY = orig.y - ob.y;
      const newX = newBounds.x + oX * scaleX,
            newY = newBounds.y + oY * scaleY;

      switch (el.type) {
        case 'rectangle': case 'diamond': case 'ellipse': case 'image': {
          const oX2 = orig.x2 - ob.x,
                oY2 = orig.y2 - ob.y;
          (el as any).x = newX; (el as any).y = newY;
          (el as any).x2 = newBounds.x + oX2 * scaleX;
          (el as any).y2 = newBounds.y + oY2 * scaleY;
          if(el.type === 'image') {
            (el as any).width = Math.abs((el as any).x2 - (el as any).x);
            (el as any).height = Math.abs((el as any).y2 - (el as any).y);
          }
          break;
        }
        case 'line': {
          const lX2 = orig.x2 - ob.x,
                lY2 = orig.y2 - ob.y;
          (el as any).x = newX; (el as any).y = newY;
          (el as any).x2 = newBounds.x + lX2 * scaleX;
          (el as any).y2 = newBounds.y + lY2 * scaleY;
          break;
        }
        case 'text':
          (el as any).x = newX; (el as any).y = newY;
          (el as any).width = (orig.width || 100) * scaleX;
          (el as any).height = (orig.height || 20) * scaleY;
          (el as any).fontSize = (orig.fontSize || 16) * scaleX;
          break;
      }
      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
      this.renderer.renderElement(el);
    });
  }

  // == Rotation ==================================================================
  // -- Start ---------------------------------------------------------------------
  private startRotation(point: Point): void {
    this.isRotating = true;
    const bounds = getDrawingBounds(this.selection.selectedElements);
    this.rotationCenter = {
      x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
      y: bounds.minY + (bounds.maxY - bounds.minY) / 2,
    };
    this.rotationStartAngle = Math.atan2(
      point.y - this.rotationCenter.y,
      point.x - this.rotationCenter.x,
    );
    this.originalAngles = this.selection.selectedElements.map(el => el.angle || 0);
    this.originalPositions = this.selection.selectedElements.map(el => ({ ...el }));
  }

  // -- Update --------------------------------------------------------------------
  private updateRotation(point: Point, shift: boolean): void {
    if(!this.isRotating || !this.rotationCenter) return;
    let angle = Math.atan2(
      point.y - this.rotationCenter.y,
      point.x - this.rotationCenter.x,
    );
    let delta = angle - this.rotationStartAngle;
    if(shift) delta = snapAngle(delta);

    if(this.selection.selectedElements.length === 1) {
      const el = this.selection.selectedElements[0];
      el.angle = (this.originalAngles![0] + delta) % (2 * Math.PI);
      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
      this.renderer.renderElement(el);
    } else {
      // multi-element: rotate positions around center
      this.selection.selectedElements.forEach((el, i) => {
        const orig = this.originalPositions[i];
        const ob = getElementBounds({ ...orig } as DrawingElement);
        const eCx = ob.x + ob.width / 2;
        const eCy = ob.y + ob.height / 2;

        const r = rotatePoint(eCx, eCy, this.rotationCenter!.x, this.rotationCenter!.y, delta);
        const dx = r.x - eCx;
        const dy = r.y - eCy;

        // apply position delta per element type
        if(el.type === 'svg-circle') {
          el.cx = orig.cx + dx; el.cy = orig.cy + dy;
        } else if(el.type === 'svg-path' || el.type === 'svg-polygon') {
          el.offsetX = orig.offsetX + dx; el.offsetY = orig.offsetY + dy;
        } else {
          el.x = orig.x + dx; el.y = orig.y + dy;
          if('x2' in el) el.x2 = orig.x2 + dx;
          if('y2' in el) el.y2 = orig.y2 + dy;
        }
        el.angle = (this.originalAngles![i] + delta) % (2 * Math.PI);

        const idx = this.elements.findIndex(e => e.id === el.id);
        if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
        this.renderer.renderElement(el);
      });
    }
    this.selection.showSelectionHandles();
  }

  // -- End -----------------------------------------------------------------------
  private endRotation(): void {
    this.isRotating = false;
    this.onSave?.();
  }

  // == Selection Box (marquee) ===================================================
  // -- Start ---------------------------------------------------------------------
  private startSelectionBox(point: Point): void {
    this.selectionBox = { x: point.x, y: point.y, width: 0, height: 0 };
  }

  // -- Update --------------------------------------------------------------------
  private updateSelectionBox(point: Point): void {
    if(!this.selectionBox) return;
    this.selectionBox.width = point.x - this.selectionBox.x;
    this.selectionBox.height = point.y - this.selectionBox.y;

    // draw the selection rectangle on the selection layer
    this.viewport.selectionLayer.innerHTML = '';
    const x = Math.min(this.selectionBox.x, point.x),
          y = Math.min(this.selectionBox.y, point.y);
    const w = Math.abs(this.selectionBox.width),
          h = Math.abs(this.selectionBox.height);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.classList.add('selection-box');
    this.viewport.selectionLayer.appendChild(rect);

    // live preview: show bounding boxes for elements that intersect the marquee,
    // including full groups when any member is touched
    const box = { x, y, width: w, height: h };
    const hits: DrawingElement[] = [];
    for(const el of this.elements) {
      if(doRectsIntersect(box, getElementBounds(el))) hits.push(el);
    }
    const groupIds = new Set<string>();
    for(const el of hits) if(el.groupId) groupIds.add(el.groupId);
    const preview = [...hits];
    if(groupIds.size > 0) {
      for(const el of this.elements) {
        if(el.groupId && groupIds.has(el.groupId) && !preview.some(p => p.id === el.id)) preview.push(el);
      }
    } /* else -- no groups to expand */
    this.renderSelectionPreview(preview);
  }

  // -- Preview -------------------------------------------------------------------
  private renderSelectionPreview(elements: DrawingElement[]): void {
    if(elements.length < 1) return;

    // group elements by groupId for group-box rendering
    const groups = new Map<string, DrawingElement[]>();
    const ungrouped: DrawingElement[] = [];
    for(const el of elements) {
      if(el.groupId) {
        const list = groups.get(el.groupId);
        if(list) list.push(el);
        else groups.set(el.groupId, [el]);
      } else {
        ungrouped.push(el);
      }
    }

    // individual element preview boxes
    for(const el of ungrouped) {
      const b = getElementBounds(el);
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.classList.add('preview-box', 'element-box');
      r.setAttribute('x',      String(b.x - 5));
      r.setAttribute('y',      String(b.y - 5));
      r.setAttribute('width',  String(b.width + 10));
      r.setAttribute('height', String(b.height + 10));
      this.viewport.selectionLayer.appendChild(r);
    }

    // group preview boxes (dashed)
    for(const groupElements of groups.values()) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for(const el of groupElements) {
        const b = getElementBounds(el);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.classList.add('preview-box', 'group-box');
      r.setAttribute('x',      String(minX - 8));
      r.setAttribute('y',      String(minY - 8));
      r.setAttribute('width',  String(maxX - minX + 16));
      r.setAttribute('height', String(maxY - minY + 16));
      this.viewport.selectionLayer.appendChild(r);
    }
  }

  // -- End -----------------------------------------------------------------------
  private endSelectionBox(): void {
    if(!this.selectionBox) return;
    const box = {
      x: Math.min(this.selectionBox.x, this.selectionBox.x + this.selectionBox.width),
      y: Math.min(this.selectionBox.y, this.selectionBox.y + this.selectionBox.height),
      width: Math.abs(this.selectionBox.width),
      height: Math.abs(this.selectionBox.height),
    };
    this.selectionBox = null;

    if((box.width < 2) && (box.height < 2)) {
      this.selection.deselectAll();
      return;
    } /* else -- not a tiny selection box */

    // find elements intersecting the box
    const hits: DrawingElement[] = [];
    for(const el of this.elements) {
      const b = getElementBounds(el);
      if(doRectsIntersect(box, b)) hits.push(el);
    }

    // expand groups
    const groupIds = new Set<string>();
    for(const el of hits) if(el.groupId) groupIds.add(el.groupId);
    for(const el of this.elements) {
      if(el.groupId && groupIds.has(el.groupId) && !hits.some(h => h.id === el.id)) hits.push(el);
    }

    this.selection.select(hits);
  }

  // == Eraser ====================================================================
  private handleEraser(point: Point): void {
    const el = this.getElementAtPoint(point);
    if(el) {
      // mutate in place so the shared elements array reference stays valid across modules
      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx >= 0) this.elements.splice(idx, 1);
      const svgEl = document.getElementById(el.id);
      if(svgEl) svgEl.remove();
      this.onSave?.();
    } /* else -- no element at eraser point */
  }

  // == Keyboard move =============================================================
  moveSelectedWithKeyboard(key: string, shift: boolean): void {
    const units = (shift ? 1 : 5) / this.viewport.zoomLevel;
    let dx = 0, dy = 0;
    if(key.toLowerCase() === 'arrowup') dy = -units;
    else if(key.toLowerCase() === 'arrowdown') dy = units;
    else if(key.toLowerCase() === 'arrowleft') dx = -units;
    else if(key.toLowerCase() === 'arrowright') dx = units;

    for(const el of this.selection.selectedElements) {
      moveElementBy(el, dx, dy);
      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
      this.renderer.renderElement(el);
    }
    this.selection.showSelectionHandles();
    this.onSave?.();
  }

  // == Util ======================================================================
  private getCanvasPoint(e: MouseEvent): Point {
    return this.viewport.screenToCanvas(e.clientX, e.clientY);
  }

  // -- Element At Point ----------------------------------------------------------
  public getElementAtPoint(point: Point): DrawingElement | null {
    if(this.tools.currentTool === 'pan') return null;
    for(let i=this.elements.length - 1; i>=0; i--) {
      if(isPointInElement(point, this.elements[i])) return this.elements[i];
    }
    return null;
  }

  // -- Rotate Handle At Point ----------------------------------------------------
  private getRotateHandleAtPoint(point: Point): boolean {
    const handles = this.viewport.selectionLayer.querySelectorAll('.rotate-handle');
    const threshold = this.viewport.screenSizeToCanvasSize(12);
    for(const h of handles) {
      const hx = parseFloat(h.getAttribute('cx') || '0');
      const hy = parseFloat(h.getAttribute('cy') || '0');
      if(Math.hypot(point.x - hx, point.y - hy) < threshold) return true;
    }
    return false;
  }

  // -- Edge Handle At Point ------------------------------------------------------
  private getEdgeAtPoint(point: Point): { type: HandleType } | null {
    if(this.selection.selectedElements.length !== 1) return null;
    const el = this.selection.selectedElements[0];
    if(el.type === 'line') return null;

    const b = getElementBounds(el);
    const t = this.viewport.screenSizeToCanvasSize(8);

    // check each edge midpoint proximity
    const midpoints: { x: number; y: number; type: HandleType }[] = [
      { x: b.x + b.width / 2, y: b.y, type: 'n' as HandleType },
      { x: b.x + b.width / 2, y: b.y + b.height, type: 's' as HandleType },
      { x: b.x, y: b.y + b.height / 2, type: 'w' as HandleType },
      { x: b.x + b.width, y: b.y + b.height / 2, type: 'e' as HandleType },
    ];

    // if rotated, rotate midpoints
    if(el.angle && el.angle !== 0) {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      for(const mp of midpoints) {
        const r = rotatePoint(mp.x, mp.y, cx, cy, el.angle);
        mp.x = r.x; mp.y = r.y;
      }
    }

    for(const mp of midpoints) {
      if(Math.hypot(point.x - mp.x, point.y - mp.y) < t) return { type: mp.type };
    }
    return null;
  }

  // -- Update Idle Cursor --------------------------------------------------------
  private updateIdleCursor(point: Point): void {
    const c = this.viewport.container;
    if(this.selection.selectedElements.length > 0) {
      if(this.getRotateHandleAtPoint(point)) { c.style.cursor = 'grab'; return; }
      const handle = this.selection.getHandleAtPoint(point);
      if(handle) { c.style.cursor = handle === 'line-start' || handle === 'line-end' ? 'move' : 'nwse-resize'; return; }
      const edge = this.getEdgeAtPoint(point);
      if(edge) { c.style.cursor = 'nwse-resize'; return; }
    }

    const el = this.getElementAtPoint(point);
    c.style.cursor = el ? 'move' : 'default';
  }

  // -- End any Active Operation --------------------------------------------------
  private endCurrentOperation(): void {
    if(this.isPanning) this.endPanning();
    else if(this.isResizing) this.endResize();
    else if(this.isMoving) this.endMoving(new MouseEvent('mouseup'));
    else if(this.isRotating) this.endRotation();
    this.isDrawing = false;
    this.isMouseOutside = false;
  }

  // -- Group selection helpers ---------------------------------------------------
  private selectWithGroup(el: DrawingElement): void {
    const selected = [el];
    if(el.groupId) {
      for(const e of this.elements) {
        if((e.groupId === el.groupId) && (e.id !== el.id)) selected.push(e);
      }
    } /* else -- not part of a group */
    this.selection.select(selected);
  }

  private expandSelectionWithGroup(el: DrawingElement): void {
    this.selection.addToSelection(el);
    if(el.groupId) {
      for(const e of this.elements) {
        if((e.groupId === el.groupId) && !this.selection.selectedElements.some(s => s.id === e.id)) {
          this.selection.addToSelection(e);
        } /* else -- either not part of a group or already selected */
      }
    } /* else -- not part of a group */
  }
}
