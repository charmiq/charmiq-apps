import type { CanvasViewport } from './canvas-viewport';
import { generateId, generateGroupId, getElementBoundsFromData, type DrawingElement, type Point } from './element-model';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';

// copy, cut, paste (drawing elements + SVG), group, ungroup
// ********************************************************************************
// serialization format written to / read from the system clipboard
interface ClipboardData {
  type: 'drawing-elements';
  version: '1.0';
  elements: Omit<DrawingElement, 'id'>[];
}

// --------------------------------------------------------------------------------
// parsed representation of an SVG transform attribute
interface SvgTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// == ClipboardHandler ============================================================
export class ClipboardHandler {
  private readonly viewport: CanvasViewport;
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;

  public elements: DrawingElement[] = [];
  public onSave: (() => void) | null = null;

  public constructor(viewport: CanvasViewport, renderer: SvgRenderer, selection: SelectionManager) {
    this.viewport = viewport;
    this.renderer = renderer;
    this.selection = selection;
  }

  // == Copy / Cut ================================================================
  public async copySelected(): Promise<void> {
    const sel = this.selection.selectedElements;
    if(sel.length < 1) return;

    const data: ClipboardData = {
      type: 'drawing-elements',
      version: '1.0',
      elements: sel.map(({ id, ...rest }) => rest),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(data));
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(data);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  public async cutSelected(): Promise<void> {
    await this.copySelected();
    this.deleteSelected();
  }

  // == Paste =====================================================================
  public async paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();

      // SVG content
      if(text.trim().startsWith('<svg')) { this.pasteSvg(text); return; }

      let data: ClipboardData | null;
      try { data = JSON.parse(text) as ClipboardData; } catch{ return; }
      if(!data || data.type !== 'drawing-elements' || !Array.isArray(data.elements)) return;

      const center = this.canvasCenter();
      const { minX, minY, maxX, maxY } = this.boundsOfData(data.elements);
      const copyCx = (minX + maxX) / 2,
            copyCy = (minY + maxY) / 2;

      // remap group ids
      const gidMap = new Map<string, string>();
      for(const d of data.elements) {
        if(d.groupId && !gidMap.has(d.groupId)) gidMap.set(d.groupId, generateGroupId() + '_' + Math.random().toString(36).substr(2, 5));
      }

      const offsetX = center.x - copyCx,
            offsetY = center.y - copyCy;

      const newEls: DrawingElement[] = data.elements.map((d) => {
        const el = { ...d, id: generateId() } as DrawingElement;
        if(d.groupId) el.groupId = gidMap.get(d.groupId);

        // offset position fields based on element shape
        if(el.type === 'svg-circle') {
          el.cx += offsetX; el.cy += offsetY;
        } else if(el.type === 'svg-path' || el.type === 'svg-polygon') {
          el.offsetX += offsetX; el.offsetY += offsetY;
        } else {
          el.x += offsetX; el.y += offsetY;
          if('x2' in el) el.x2 += offsetX;
          if('y2' in el) el.y2 += offsetY;
        }
        return el;
      });

      this.elements.push(...newEls);
      for(const el of newEls) this.renderer.renderElement(el);
      this.selection.select(newEls);
      this.onSave?.();
    } catch(error) { console.error('Paste failed:', error); }
  }

  // -- SVG paste -----------------------------------------------------------------
  private pasteSvg(svgText: string): void {
    try {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svgRoot = doc.querySelector('svg');
      if(!svgRoot) return;

      const center = this.canvasCenter();
      let svgBounds = { x: 0, y: 0, width: 200, height: 200 };
      const vb = svgRoot.getAttribute('viewBox');
      if(vb) {
        const [x, y, w, h] = vb.split(/\s+/).map(parseFloat);
        svgBounds = { x, y, width: w, height: h };
      } else {
        svgBounds.width = parseFloat(svgRoot.getAttribute('width') || '200');
        svgBounds.height = parseFloat(svgRoot.getAttribute('height') || '200');
      }

      const offsetX = center.x - svgBounds.x - svgBounds.width / 2,
            offsetY = center.y - svgBounds.y - svgBounds.height / 2;

      const newEls: DrawingElement[] = [];
      const groupStack: (string | null)[] = [null];

      const parseNode = (node: Element, inheritTransform: SvgTransform | null = null) => {
        const tag = node.tagName.toLowerCase();
        const trAttr = node.getAttribute('transform');
        let transform = inheritTransform;
        if(trAttr) {
          const parsed = this.parseSvgTransform(trAttr);
          transform = transform ? this.combineTransforms(transform, parsed) : parsed;
        } /* else -- no transform on this node */

        if(tag === 'g') {
          const gid = generateGroupId() + '_' + Math.random().toString(36).substr(2, 5);
          groupStack.push(gid);
          Array.from(node.children).forEach(c => parseNode(c, transform));
          groupStack.pop();
        } else {
          const el = this.convertSvgElement(node, transform, offsetX, offsetY);
          if(el) {
            const cg = groupStack[groupStack.length - 1];
            if(cg) el.groupId = cg;
            newEls.push(el);
          } /* else -- unsupported element type */
        }
      };

      Array.from(svgRoot.children).forEach(c => parseNode(c));
      if(newEls.length < 1) return;

      this.elements.push(...newEls);
      for(const el of newEls) this.renderer.renderElement(el);
      this.selection.select(newEls);
      this.onSave?.();
    } catch(error) { console.error('SVG paste failed:', error); }
  }

  // == Delete / Group / Ungroup ==================================================
  public deleteSelected(): void {
    const ids = new Set(this.selection.selectedElements.map(e => e.id));
    // mutate in place so the shared elements array reference stays valid across modules
    for(let i=this.elements.length - 1; i>=0; i--) {
      if(ids.has(this.elements[i].id)) this.elements.splice(i, 1);
    }
    for(const id of ids) { const el = document.getElementById(id); if(el) el.remove(); }
    this.selection.deselectAll();
    this.onSave?.();
  }

  // ------------------------------------------------------------------------------
  public groupSelected(): void {
    const sel = this.selection.selectedElements;
    if(sel.length <= 1) return;
    const gid = generateGroupId();
    for(const el of sel) {
      el.groupId = gid;
      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
    }
    this.selection.showSelectionHandles();
    this.onSave?.();
  }

  // ------------------------------------------------------------------------------
  public ungroupSelected(): void {
    for(const el of this.selection.selectedElements) {
      if(el.groupId) {
        delete el.groupId;
        const idx = this.elements.findIndex(e => e.id === el.id);
        if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
      } /* else -- element not in a group */
    }
    this.selection.showSelectionHandles();
    this.onSave?.();
  }

  // ==============================================================================
  private canvasCenter(): Point {
    const r = this.viewport.container.getBoundingClientRect();
    return this.viewport.screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
  }

  // ------------------------------------------------------------------------------
  private boundsOfData(elements: Omit<DrawingElement, 'id'>[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const d of elements) {
      const b = getElementBoundsFromData(d);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { minX, minY, maxX, maxY };
  }

  // ------------------------------------------------------------------------------
  private parseSvgTransform(s: string): SvgTransform {
    const t: SvgTransform = { translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const tm = s.match(/translate\s*\(\s*([^,\s]+)(?:[\s,]+([^)]+))?\s*\)/);
    if(tm) { t.translateX = parseFloat(tm[1]) || 0; t.translateY = parseFloat(tm[2]) || 0; }
    const rm = s.match(/rotate\s*\(\s*([^,\s)]+)/);
    if(rm) t.rotation = (parseFloat(rm[1]) || 0) * Math.PI / 180;
    const sm = s.match(/scale\s*\(\s*([^,\s]+)(?:[\s,]+([^)]+))?\s*\)/);
    if(sm) { t.scaleX = parseFloat(sm[1]) || 1; t.scaleY = parseFloat(sm[2]) || t.scaleX; }
    return t;
  }

  private combineTransforms(a: SvgTransform, b: SvgTransform): SvgTransform {
    return {
      translateX: a.translateX + b.translateX, translateY: a.translateY + b.translateY,
      rotation: a.rotation + b.rotation,
      scaleX: a.scaleX * b.scaleX, scaleY: a.scaleY * b.scaleY,
    };
  }

  // ==============================================================================
  private convertSvgElement(node: Element, transform: SvgTransform | null, oX: number, oY: number): DrawingElement | null {
    const tag = node.tagName.toLowerCase();
    const id = generateId();
    const stroke = node.getAttribute('stroke') || 'none';
    const fill = node.getAttribute('fill') || 'none';
    const sw = parseFloat(node.getAttribute('stroke-width') || '1');

    let el: DrawingElement | null = null;
    switch (tag) {
      case 'rect': {
        const x = parseFloat(node.getAttribute('x') || '0');
        const y = parseFloat(node.getAttribute('y') || '0');
        const w = parseFloat(node.getAttribute('width') || '0');
        const h = parseFloat(node.getAttribute('height') || '0');
        el = { id, type: 'rectangle', x: x + oX, y: y + oY, x2: x + w + oX, y2: y + h + oY, stroke: stroke === 'none' ? '#000' : stroke, fill: fill === 'none' ? 'transparent' : fill, strokeWidth: sw };
        break;
      }
      case 'circle': {
        const cx = parseFloat(node.getAttribute('cx') || '0');
        const cy = parseFloat(node.getAttribute('cy') || '0');
        const r = parseFloat(node.getAttribute('r') || '0');
        el = { id, type: 'svg-circle', cx: cx + oX, cy: cy + oY, r, stroke: stroke === 'none' ? '#000' : stroke, fill: fill === 'none' ? 'transparent' : fill, strokeWidth: sw };
        break;
      }
      case 'path': {
        const d = node.getAttribute('d') || '';
        if(d) el = { id, type: 'svg-path', d, offsetX: oX, offsetY: oY, stroke: stroke === 'none' ? '#000' : stroke, fill: fill === 'none' ? 'transparent' : fill, strokeWidth: sw };
        break;
      }
      case 'polygon': {
        const pts = node.getAttribute('points') || '';
        if(pts) el = { id, type: 'svg-polygon', points: pts, offsetX: oX, offsetY: oY, stroke: stroke === 'none' ? '#000' : stroke, fill: fill === 'none' ? 'transparent' : fill, strokeWidth: sw };
        break;
      }
      case 'line': {
        const x1 = parseFloat(node.getAttribute('x1') || '0');
        const y1 = parseFloat(node.getAttribute('y1') || '0');
        const x2 = parseFloat(node.getAttribute('x2') || '0');
        const y2 = parseFloat(node.getAttribute('y2') || '0');
        el = { id, type: 'line', x: x1 + oX, y: y1 + oY, x2: x2 + oX, y2: y2 + oY, stroke: stroke === 'none' ? '#000' : stroke, strokeWidth: sw, startDecoration: 'none', endDecoration: 'none' };
        break;
      }
      case 'ellipse': {
        const cx = parseFloat(node.getAttribute('cx') || '0');
        const cy = parseFloat(node.getAttribute('cy') || '0');
        const rx = parseFloat(node.getAttribute('rx') || '0');
        const ry = parseFloat(node.getAttribute('ry') || '0');
        el = { id, type: 'ellipse', x: cx - rx + oX, y: cy - ry + oY, x2: cx + rx + oX, y2: cy + ry + oY, stroke: stroke === 'none' ? '#000' : stroke, fill: fill === 'none' ? 'transparent' : fill, strokeWidth: sw };
        break;
      }
    }

    if(el && transform) {
      if(el.type === 'svg-circle') {
        el.cx += transform.translateX;
        el.cy += transform.translateY;
      } else if((el.type === 'svg-path') || (el.type === 'svg-polygon')) {
        el.offsetX += transform.translateX;
        el.offsetY += transform.translateY;
      } else {
        el.x += transform.translateX;
        el.y += transform.translateY;
        if('x2' in el) el.x2 += transform.translateX;
        if('y2' in el) el.y2 += transform.translateY;
      }
      if(Math.abs(transform.rotation) > 0.001) el.angle = (el.angle || 0) + transform.rotation;
    } /* else -- no transform */
    return el;
  }
}
