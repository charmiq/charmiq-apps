import { getElementBounds, getRotatedBounds, type Bounds, type DrawingElement, type Point } from './element-model';
import { rotatePoint } from './geometry';
import type { CanvasViewport } from './canvas-viewport';

// selection state, selection handles, bounding boxes, and handle hit-testing
// ********************************************************************************
const SVG_NS = 'http://www.w3.org/2000/svg';

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'line-start' | 'line-end' | 'rotate';

// == SelectionManager ============================================================
export class SelectionManager {
  selectedElements: DrawingElement[] = [];
  private readonly viewport: CanvasViewport;
  private readonly propertiesPanel: HTMLElement;
  private onShowProperties: (() => void) | null = null;

  public constructor(viewport: CanvasViewport, propertiesPanel: HTMLElement) {
    this.viewport = viewport;
    this.propertiesPanel = propertiesPanel;
  }

  public setOnShowProperties(cb: () => void): void { this.onShowProperties = cb; }

  // ==============================================================================
  public clearSelection(): void {
    this.viewport.selectionLayer.innerHTML = '';
    this.propertiesPanel.classList.remove('visible');
  }

  public select(elements: DrawingElement[]): void {
    this.selectedElements = elements;
    this.showSelectionHandles();
  }

  // -- Add -----------------------------------------------------------------------
  public addToSelection(element: DrawingElement): void {
    if(!this.selectedElements.some(el => el.id === element.id)) {
      this.selectedElements.push(element);
    }
    this.showSelectionHandles();
  }

  // -- Remove --------------------------------------------------------------------
  public removeFromSelection(element: DrawingElement): void {
    this.selectedElements = this.selectedElements.filter(el => el.id !== element.id);
    this.showSelectionHandles();
  }

  // -- Toggle --------------------------------------------------------------------
  public toggleInSelection(element: DrawingElement): void {
    if(this.selectedElements.some(el => el.id === element.id)) {
      this.removeFromSelection(element);
    } else {
      this.addToSelection(element);
    }
  }

  // -- Deselect All --------------------------------------------------------------
  public deselectAll(): void {
    this.selectedElements = [];
    this.clearSelection();
  }

  // ==============================================================================
  // reconcile selection after external state update
  public reconcile(allElements: DrawingElement[]): void {
    const ids = new Set(allElements.map(el => el.id));
    this.selectedElements = this.selectedElements.filter(el => ids.has(el.id));

    // refresh references to latest data
    this.selectedElements = this.selectedElements.map(sel => {
      const updated = allElements.find(e => e.id === sel.id);
      return updated || sel;
    });

    // expand selection to include whole groups
    const groupIds = new Set<string>();
    for(const el of this.selectedElements) {
      if(el.groupId) groupIds.add(el.groupId);
    }
    if(groupIds.size > 0) {
      for(const el of allElements) {
        if(el.groupId && groupIds.has(el.groupId) && !this.selectedElements.some(s => s.id === el.id)) {
          this.selectedElements.push(el);
        }
      }
    } /* else -- no groupd */
  }

  // ==============================================================================
  public getHandleAtPoint(point: Point): HandleType | null {
    const handles = this.viewport.selectionLayer.querySelectorAll('.resize-handle, .line-handle, .rotate-handle');
    const threshold = this.viewport.screenSizeToCanvasSize(10);

    for(const h of handles) {
      const hx = parseFloat(h.getAttribute('cx') || '0');
      const hy = parseFloat(h.getAttribute('cy') || '0');
      if(Math.hypot(point.x - hx, point.y - hy) < threshold) {
        if(h.classList.contains('rotate-handle')) return 'rotate';
        return (h as HTMLElement).dataset.handleType as HandleType;
      } /* else -- not on this handle */
    }
    return null;
  }

  // ==============================================================================
  public showSelectionHandles(): void {
    this.clearSelection();
    if(this.selectedElements.length < 1) {
      this.propertiesPanel.classList.remove('visible');
      return;
    } /* else -- has selection */

    const layer = this.viewport.selectionLayer;
    const s2c = (px: number) => this.viewport.screenSizeToCanvasSize(px);

    // single line — endpoint handles only
    if((this.selectedElements.length === 1) && (this.selectedElements[0].type === 'line')) {
      const line = this.selectedElements[0] as any;
      this.appendCircleHandle(layer, line.x, line.y, s2c(6), 'line-start', 'line-handle');
      this.appendCircleHandle(layer, line.x2, line.y2, s2c(6), 'line-end', 'line-handle');
      this.onShowProperties?.();
      return;
    } /* else -- not a single line */

    // single element — rotated bounding box + corner handles + rotate handle
    if(this.selectedElements.length === 1) {
      const el = this.selectedElements[0];
      const b = this.unrotatedBounds(el);
      this.appendBoundingBox(layer, b, el.angle, false);
      this.appendCornerHandles(layer, b, el.angle, s2c);
      this.appendRotateHandle(layer, b, el.angle, s2c);
      this.onShowProperties?.();
      return;
    } /* else -- multiple elements, may be multiple groups */

    // multiple elements — individual boxes + combined dotted box + corner handles
    const groupIds = new Set(this.selectedElements.filter(e => e.groupId).map(e => e.groupId!));
    const allSameGroup = groupIds.size === 1 && this.selectedElements.every(e => e.groupId === [...groupIds][0]);

    if(!allSameGroup) {
      for(const el of this.selectedElements) {
        const b = this.unrotatedBounds(el);
        this.appendBoundingBox(layer, b, el.angle, false);
      }
    } /* else -- all in same group */

    // combined bounding box
    const combined = this.combinedBounds();
    this.appendBoundingBox(layer, combined, undefined, true);

    // corner handles on combined box
    const pad = 5;
    const corners: { x: number; y: number; type: HandleType }[] = [
      { x: combined.x - pad, y: combined.y - pad, type: 'nw' },
      { x: combined.x + combined.width + pad, y: combined.y - pad, type: 'ne' },
      { x: combined.x + combined.width + pad, y: combined.y + combined.height + pad, type: 'se' },
      { x: combined.x - pad, y: combined.y + combined.height + pad, type: 'sw' },
    ];
    for(const c of corners) {
      this.appendCircleHandle(layer, c.x, c.y, s2c(4), c.type, 'resize-handle');
    }

    // combined rotate handle
    this.appendRotateHandle(layer, combined, undefined, s2c);

    this.onShowProperties?.();
  }

  // == Util ======================================================================
  private unrotatedBounds(el: DrawingElement): Bounds {
    switch(el.type) {
      case 'rectangle': case 'diamond': case 'ellipse': case 'image':
        return {
          x: Math.min(el.x, (el as any).x2),
          y: Math.min(el.y, (el as any).y2),
          width: Math.abs((el as any).x2 - el.x),
          height: Math.abs((el as any).y2 - el.y),
        };
      case 'text':
        return { x: el.x, y: el.y, width: (el as any).width || 100, height: (el as any).height || 20 };
      case 'line':
        return {
          x: Math.min(el.x, (el as any).x2) - 5,
          y: Math.min(el.y, (el as any).y2) - 5,
          width: Math.abs((el as any).x2 - el.x) + 10,
          height: Math.abs((el as any).y2 - el.y) + 10,
        };
      // svg-circle / svg-path / svg-polygon / svg-text-path: geometry isn't
      // expressed as simple corner coords -- defer to getElementBounds, which
      // reads it straight from the rendered DOM node (via getBBox for paths)
      default:
        return getElementBounds(el);
    }
  }

  // ------------------------------------------------------------------------------
  private combinedBounds(): Bounds {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const el of this.selectedElements) {
      const b = getRotatedBounds(el);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // ==============================================================================
  // -- Bounding Box --------------------------------------------------------------
  private appendBoundingBox(layer: SVGGElement, b: Bounds, angle: number | undefined, dashed: boolean): void {
    const pad = 5;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.classList.add('element-box');
    rect.setAttribute('x', String(b.x - pad));
    rect.setAttribute('y', String(b.y - pad));
    rect.setAttribute('width', String(b.width + pad * 2));
    rect.setAttribute('height', String(b.height + pad * 2));
    rect.style.fill = 'none';
    rect.style.stroke = '#4285f4';
    rect.style.strokeWidth = '1';
    if(dashed) rect.style.strokeDasharray = '5,5';

    if(angle && (angle !== 0)) {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      rect.setAttribute('transform', `rotate(${(angle * 180) / Math.PI} ${cx} ${cy})`);
    }
    layer.appendChild(rect);
  }

  // -- Corner Handles ------------------------------------------------------------
  private appendCornerHandles(layer: SVGGElement, b: Bounds, angle: number | undefined, s2c: (px: number) => number): void {
    const pad = 5;
    const corners: { x: number; y: number; type: HandleType }[] = [
      { x: b.x - pad, y: b.y - pad, type: 'nw' },
      { x: b.x + b.width + pad, y: b.y - pad, type: 'ne' },
      { x: b.x + b.width + pad, y: b.y + b.height + pad, type: 'se' },
      { x: b.x - pad, y: b.y + b.height + pad, type: 'sw' },
    ];
    for(const c of corners) {
      let hx = c.x, hy = c.y;
      if(angle && angle !== 0) {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const r = rotatePoint(hx, hy, cx, cy, angle);
        hx = r.x; hy = r.y;
      }
      this.appendCircleHandle(layer, hx, hy, s2c(4), c.type, 'resize-handle');
    }
  }

  // -- Rotate Handle -------------------------------------------------------------
  private appendRotateHandle(layer: SVGGElement, b: Bounds, angle: number | undefined, s2c: (px: number) => number): void {
    const pad = 5;
    const dist = 30;
    let hx = b.x + b.width / 2;
    let hy = b.y - pad - dist;
    let lineEndY = b.y - pad;

    if(angle && angle !== 0) {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;

      const rotH = rotatePoint(hx, hy, cx, cy, angle);
      const rotL = rotatePoint(hx, lineEndY, cx, cy, angle);
      hx = rotH.x; hy = rotH.y;

      const line = document.createElementNS(SVG_NS, 'line');
      line.classList.add('rotate-handle-line');
      line.setAttribute('x1', String(rotL.x));
      line.setAttribute('y1', String(rotL.y));
      line.setAttribute('x2', String(hx));
      line.setAttribute('y2', String(hy));
      line.style.strokeWidth = String(s2c(1));
      layer.appendChild(line);
    } else {
      const line = document.createElementNS(SVG_NS, 'line');
      line.classList.add('rotate-handle-line');
      line.setAttribute('x1', String(hx));
      line.setAttribute('y1', String(lineEndY));
      line.setAttribute('x2', String(hx));
      line.setAttribute('y2', String(hy + 6));
      line.style.strokeWidth = String(s2c(1));
      layer.appendChild(line);
    }

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.classList.add('rotate-handle');
    circle.setAttribute('cx', String(hx));
    circle.setAttribute('cy', String(hy));
    circle.setAttribute('r', String(s2c(6)));
    circle.style.strokeWidth = String(s2c(2));
    layer.appendChild(circle);
  }

  // -- Circle Handle -------------------------------------------------------------
  private appendCircleHandle(layer: SVGGElement, cx: number, cy: number, r: number, type: HandleType, cls: string): void {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.classList.add(cls);
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.style.fill = '#4285f4';
    circle.style.stroke = 'white';
    circle.style.strokeWidth = String(this.viewport.screenSizeToCanvasSize(2));
    circle.style.cursor = 'move';
    (circle as any).dataset.handleType = type;
    layer.appendChild(circle);
  }
}
