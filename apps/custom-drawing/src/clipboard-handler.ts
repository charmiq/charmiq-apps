import type { CanvasViewport } from './canvas-viewport';
import { generateId, generateGroupId, getElementBoundsFromData, moveElementBy, type DrawingElement, type Point } from './element-model';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';
import type { TextMeasurement } from './text-measurement';

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
  private readonly textMeasure: TextMeasurement;

  public elements: DrawingElement[] = [];
  public onSave: (() => void) | null = null;

  // set for the duration of a pasteSvg() call; maps `<path id="X">` -> d so
  // <textPath href="#X"> can resolve its curve geometry
  private currentPathDefs: Map<string, string> | null = null;

  // set for the duration of a pasteSvg() call; maps referenced-path-id -> groupId
  // so a standalone <path> and the <text><textPath> that references it end up
  // in the same group and move together
  private currentTextPathGroups: Map<string, string> | null = null;

  public constructor(viewport: CanvasViewport, renderer: SvgRenderer, selection: SelectionManager, textMeasure: TextMeasurement) {
    this.viewport = viewport;
    this.renderer = renderer;
    this.selection = selection;
    this.textMeasure = textMeasure;
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
        moveElementBy(el, offsetX, offsetY);
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

      // pre-index all <path id="..."> so <textPath href="#id"> can resolve its
      // geometry without having to emit the referenced path as its own element
      const pathDefs = new Map<string, string>();
      svgRoot.querySelectorAll('path[id]').forEach(p => {
        const pid = p.getAttribute('id');
        const d   = p.getAttribute('d');
        if(pid && d) pathDefs.set(pid, d);
      });
      this.currentPathDefs = pathDefs;

      // also remember which source <path> ids are referenced by a <textPath>.
      // When both the standalone visible <path> and the <text><textPath> end up
      // emitted as separate elements, the user expects them to move as one
      // unit (they were logically linked in the source) -- so they are bound
      // with a shared groupId keyed off the referenced path id
      const textPathRefs = new Map<string/*ref'd-path-id*/, string/*groupId*/>();
      svgRoot.querySelectorAll('textPath').forEach(tp => {
        const href = tp.getAttribute('href')
                  || tp.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
                  || '';
        const refId = href.startsWith('#') ? href.slice(1) : href;
        if(refId && !textPathRefs.has(refId)) {
          textPathRefs.set(refId, generateGroupId() + '_tp_' + Math.random().toString(36).substr(2, 5));
        } /* else -- no href or already seen */
      });
      this.currentTextPathGroups = textPathRefs;

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
    finally { this.currentPathDefs = null; this.currentTextPathGroups = null; }
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
      case 'text': {
        // SVG text attrs inherit from ancestors and can be set either as
        // XML attributes or via `style="..."`. Walk up the tree checking both
        const getStyleProp = (n: Element, prop: string): string | null => {
          const s = n.getAttribute('style');
          if(!s) return null;
          const m = s.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)'));
          return m ? m[1].trim() : null;
        };
        const inherit = (attr: string): string | null => {
          let n: Element | null = node;
          while(n) {
            const v = n.getAttribute(attr) || getStyleProp(n, attr);
            if(v) return v;
            n = n.parentElement;
          }
          return null;
        };
        const parseSize = (s: string | null, fallback: number): number => {
          if(!s) return fallback;
          const n = parseFloat(s);/*tolerates "25px", "25", etc.*/
          return isNaN(n) ? fallback : n;
        };
        const fontSize = parseSize(inherit('font-size'), 16);
        const textFill = inherit('fill') || '#000';
        const anchor   = inherit('text-anchor') || 'start';

        // <text> with a <textPath> child -> text flowing along a curve. Resolve
        // the path geometry from the pre-indexed path defs and emit a dedicated
        // svg-text-path element; the renderer handles the <textPath> plumbing
        const tp = node.querySelector(':scope > textPath');
        if(tp) {
          const href  = tp.getAttribute('href')
                     || tp.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
                     || '';
          const refId = href.startsWith('#') ? href.slice(1) : href;
          const d     = this.currentPathDefs?.get(refId);
          const tpText = (tp.textContent || '').trim();
          if(d && tpText) {
            const startOffset = tp.getAttribute('startOffset') || undefined;
            el = {
              id, type: 'svg-text-path',
              d, text: tpText,
              offsetX: oX, offsetY: oY,
              fontSize,
              textColor: textFill === 'none' ? '#000' : textFill,
              startOffset,
            };
          } /* else -- unresolved reference or empty text, skip */
          break;
        } /* else -- plain <text>, fall through to flat-text handling */

        const text = (node.textContent || '').trim();
        if(!text) break;/*empty text node, skip*/

        // SVG text is positioned by the baseline of its first glyph at (x,y),
        // shifted by optional dx/dy. TextElement positions by top-left, so they
        // are shifted up by ~fontSize to convert baseline->top (approximation --
        // exact would require font-metric ascent but this matches what most
        // users expect visually)
        const svgX = parseFloat(node.getAttribute('x')  || '0')
                   + parseFloat(node.getAttribute('dx') || '0');
        const svgY = parseFloat(node.getAttribute('y')  || '0')
                   + parseFloat(node.getAttribute('dy') || '0');

        const dims = this.textMeasure.measureTextDimensions(text, fontSize);

        // text-anchor='middle' -> svgX is the horizontal center; 'end' -> right edge
        let left = svgX;
        if(anchor === 'middle') left = svgX - dims.width / 2;
        else if(anchor === 'end') left = svgX - dims.width;
        /* else start/default -- svgX is already the left edge */

        el = {
          id, type: 'text',
          text,
          x: left + oX,
          y: svgY - fontSize * 0.85 + oY,/*baseline->top approximation*/
          width: dims.width,
          height: dims.height,
          fontSize,
          textColor: textFill === 'none' ? '#000' : textFill,
          textAlign: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
        };
        break;
      }
    }

    if(el && transform) {
      moveElementBy(el, transform.translateX, transform.translateY);
      if(Math.abs(transform.rotation) > 0.001) el.angle = (el.angle || 0) + transform.rotation;
    } /* else -- no transform */

    // bind <path id="X"> and its referencing <text><textPath href="#X"> into a
    // shared group so they move as one unit (outer group from <g> wins if set)
    if(el && !el.groupId && this.currentTextPathGroups) {
      let refId: string | null = null;
      if(el.type === 'svg-path') {
        const srcId = node.getAttribute('id');
        if(srcId && this.currentTextPathGroups.has(srcId)) refId = srcId;
      } else if(el.type === 'svg-text-path') {
        // find the source ref id by scanning the map for any textPath-href match;
        // need to know which path this textPath referenced so look at node
        const tpChild = node.querySelector(':scope > textPath');
        if(tpChild) {
          const href = tpChild.getAttribute('href')
                    || tpChild.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
                    || '';
          const id2 = href.startsWith('#') ? href.slice(1) : href;
          if(id2 && this.currentTextPathGroups.has(id2)) refId = id2;
        } /* else -- no textPath child (shouldn't happen for svg-text-path) */
      } /* else -- not a type that participates in textPath binding */
      if(refId) el.groupId = this.currentTextPathGroups.get(refId);
    } /* else -- already grouped or no pending bindings */

    return el;
  }
}
