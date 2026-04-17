import { getElementBounds, isSvgOffsetElement, type DrawingElement, type ImageElement, type LineDecoration, type LineElement, type SvgCircleElement, type SvgPathElement, type SvgPolygonElement, type SvgTextPathElement, type TextAlign, type TextElement } from './element-model';
import type { TextMeasurement } from './text-measurement';

// SVG element creation, attribute updates, line decoration markers
// ********************************************************************************
const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_FAMILY = 'Excalifont, "Comic Sans MS", cursive, system-ui, sans-serif';

// == SvgRenderer =================================================================
export class SvgRenderer {
  private readonly drawingLayer: SVGGElement;
  private readonly svg: SVGSVGElement;
  private readonly textMeasurement: TextMeasurement;

  public constructor(drawingLayer: SVGGElement, svg: SVGSVGElement, textMeasurement: TextMeasurement) {
    this.drawingLayer = drawingLayer;
    this.svg = svg;
    this.textMeasurement = textMeasurement;
  }

  // == Render ====================================================================
  public renderElement(element: DrawingElement): void {
    // remove stale node (if any) then create fresh
    const existing = document.getElementById(element.id);
    if(existing) existing.remove();

    const svgEl = this.createElement(element);
    if(!svgEl) return;
    svgEl.id = element.id;
    this.drawingLayer.appendChild(svgEl);

    // svg-path/polygon/text-path bounds require getBBox(), which needs the element
    // in the DOM; apply rotation here rather than inside the shape builders
    if(isSvgOffsetElement(element)) {
      this.applyRotation(svgEl, element, getElementBounds(element));
    } /* else -- other types apply rotation inside their shape builders */
  }

  public clearAll(): void {
    this.drawingLayer.innerHTML = '';
  }

  public rerenderAll(elements: DrawingElement[]): void {
    this.clearAll();
    for(const el of elements) this.renderElement(el);
  }

  // == Element Factory ===========================================================
  private createElement(el: DrawingElement): SVGElement | null {
    switch(el.type) {
      case 'rectangle': return this.createRect(el);
      case 'diamond':   return this.createDiamond(el);
      case 'ellipse':   return this.createEllipse(el);
      case 'line':      return this.createLine(el);
      case 'text':      return this.createText(el);
      case 'image':     return this.createImage(el);
      case 'svg-circle':  return this.createSvgCircle(el);
      case 'svg-path':      return this.createSvgPath(el);
      case 'svg-polygon':   return this.createSvgPolygon(el);
      case 'svg-text-path': return this.createSvgTextPath(el);
      default: return null;
    }
  }

  // -- Shape builders ------------------------------------------------------------
  // .. Rectangle .................................................................
  private createRect(el: DrawingElement): SVGRectElement {
    const b = getElementBounds(el);
    const rect = document.createElementNS(SVG_NS, 'rect') as SVGRectElement;
    rect.setAttribute('x', String(b.x));
    rect.setAttribute('y', String(b.y));
    rect.setAttribute('width', String(b.width));
    rect.setAttribute('height', String(b.height));
    rect.setAttribute('rx', '4');
    this.applyCommonAttrs(rect, el);
    this.applyRotation(rect, el, b);
    return rect;
  }

  // .. Diamond ...................................................................
  private createDiamond(el: DrawingElement): SVGPolygonElement {
    const b = getElementBounds(el);
    const cx = b.x + b.width / 2,
          cy = b.y + b.height / 2;
    const pts = [
      `${cx},${b.y}`,
      `${b.x + b.width},${cy}`,
      `${cx},${b.y + b.height}`,
      `${b.x},${cy}`,
    ].join(' ');
    const poly = document.createElementNS(SVG_NS, 'polygon') as SVGPolygonElement;
    poly.setAttribute('points', pts);
    this.applyCommonAttrs(poly, el);
    this.applyRotation(poly, el, b);
    return poly;
  }

  // .. Ellipse ...................................................................
  private createEllipse(el: DrawingElement): SVGEllipseElement {
    const b = getElementBounds(el);
    const ellipse = document.createElementNS(SVG_NS, 'ellipse') as SVGEllipseElement;
    ellipse.setAttribute('cx', String(b.x + b.width / 2));
    ellipse.setAttribute('cy', String(b.y + b.height / 2));
    ellipse.setAttribute('rx', String(b.width / 2));
    ellipse.setAttribute('ry', String(b.height / 2));
    this.applyCommonAttrs(ellipse, el);
    this.applyRotation(ellipse, el, b);
    return ellipse;
  }

  // .. Line ......................................................................
  private createLine(el: LineElement): SVGLineElement {
    const line = document.createElementNS(SVG_NS, 'line') as SVGLineElement;
    line.setAttribute('x1', String(el.x));
    line.setAttribute('y1', String(el.y));
    line.setAttribute('x2', String(el.x2));
    line.setAttribute('y2', String(el.y2));
    this.applyCommonAttrs(line, el);
    this.applyLineDecorations(line, el);
    return line;
  }

  // .. Text ......................................................................
  private createText(el: TextElement): SVGTextElement {
    const text = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    const fontSize = el.fontSize || 16;
    const fillColor = el.fill || el.textColor || '#000000';
    const textAlign: TextAlign = el.textAlign || 'left';
    const width = el.width || 100;

    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('font-family', FONT_FAMILY);
    text.setAttribute('fill', fillColor);

    // text-anchor from alignment
    const anchor = textAlign === 'center' ? 'middle' : textAlign === 'right' ? 'end' : 'start';
    text.setAttribute('text-anchor', anchor);

    // wrap + position tspans
    const lines = this.textMeasurement.wrapText(el.text || '', width, fontSize);
    const lineHeight = fontSize * 1.2;

    lines.forEach((line, i) => {
      const tspan = document.createElementNS(SVG_NS, 'tspan') as SVGTSpanElement;

      let xPos: number;
      if(textAlign === 'center') xPos = el.x + width / 2;
      else if(textAlign === 'right') xPos = el.x + width;
      else xPos = el.x;

      tspan.setAttribute('x', String(xPos));
      tspan.setAttribute('y', String(el.y + fontSize + i * lineHeight));
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    // rotation
    if(el.angle && (el.angle !== 0)) {
      const b = getElementBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const deg = (el.angle * 180) / Math.PI;
      text.setAttribute('transform', `rotate(${deg} ${cx} ${cy})`);
    } /* else -- no rotation */

    return text;
  }

  // .. Image .....................................................................
  private createImage(el: ImageElement): SVGImageElement {
    const b = getElementBounds(el);
    const img = document.createElementNS(SVG_NS, 'image') as SVGImageElement;
    img.setAttribute('x', String(b.x));
    img.setAttribute('y', String(b.y));
    img.setAttribute('width', String(b.width));
    img.setAttribute('height', String(b.height));
    if(el.src) img.setAttribute('href', el.src);
    img.setAttribute('preserveAspectRatio', 'none');
    this.applyRotation(img, el, b);
    return img;
  }

  // .. SVG Circle ................................................................
  private createSvgCircle(el: SvgCircleElement): SVGCircleElement {
    const c = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
    c.setAttribute('cx', String(el.cx));
    c.setAttribute('cy', String(el.cy));
    c.setAttribute('r', String(el.r));
    this.applyCommonAttrs(c, el);
    this.applyRotation(c, el, { x: el.cx - el.r, y: el.cy - el.r, width: el.r * 2, height: el.r * 2 });
    return c;
  }

  // .. SVG Path ..................................................................
  private createSvgPath(el: SvgPathElement): SVGPathElement {
    const p = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    const d = this.translatePath(el.d, el.offsetX, el.offsetY);
    p.setAttribute('d', d);
    this.applyCommonAttrs(p, el);
    return p;
  }

  // .. SVG Polygon ...............................................................
  private createSvgPolygon(el: SvgPolygonElement): SVGPolygonElement {
    const pg = document.createElementNS(SVG_NS, 'polygon') as SVGPolygonElement;
    const pts = this.translatePolygonPoints(el.points, el.offsetX, el.offsetY);
    pg.setAttribute('points', pts);
    this.applyCommonAttrs(pg, el);
    return pg;
  }

  // .. SVG Text Path .............................................................
  // text that flows along an SVG path. A self-contained <g> is emitted that owns
  // both the (invisible) path and the <text><textPath> that references it, so
  // getBBox() on the <g> gives accurate glyph bounds in canvas space
  private createSvgTextPath(el: SvgTextPathElement): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    const defs = document.createElementNS(SVG_NS, 'defs');
    const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    const pathId = `${el.id}_p`;
    path.setAttribute('id', pathId);
    path.setAttribute('d', this.translatePath(el.d, el.offsetX, el.offsetY));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'none');
    defs.appendChild(path);
    g.appendChild(defs);

    const text = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
    text.setAttribute('font-size', String(el.fontSize));
    text.setAttribute('font-family', FONT_FAMILY);
    text.setAttribute('fill', el.textColor);

    const tp = document.createElementNS(SVG_NS, 'textPath') as SVGTextPathElement;
    tp.setAttribute('href', `#${pathId}`);
    // also set the legacy xlink:href for broader interop (some renderers still require it)
    tp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${pathId}`);
    if(el.startOffset) tp.setAttribute('startOffset', el.startOffset);
    tp.textContent = el.text;
    text.appendChild(tp);
    g.appendChild(text);
    return g;
  }

  // == Attribute Updates =========================================================
  public updateElementAttributes(element: DrawingElement): void {
    const svgEl = this.drawingLayer.querySelector<SVGElement>(`#${element.id}`);
    if(!svgEl) return;

    switch(element.type) {
      case 'rectangle': {
        const b = getElementBounds(element);
        svgEl.setAttribute('x', String(b.x));
        svgEl.setAttribute('y', String(b.y));
        svgEl.setAttribute('width', String(b.width));
        svgEl.setAttribute('height', String(b.height));
        this.applyRotation(svgEl, element, b);
        break;
      }
      case 'diamond': {
        const b = getElementBounds(element);
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const pts = `${cx},${b.y} ${b.x + b.width},${cy} ${cx},${b.y + b.height} ${b.x},${cy}`;
        svgEl.setAttribute('points', pts);
        this.applyRotation(svgEl, element, b);
        break;
      }
      case 'ellipse': {
        const b = getElementBounds(element);
        svgEl.setAttribute('cx', String(b.x + b.width / 2));
        svgEl.setAttribute('cy', String(b.y + b.height / 2));
        svgEl.setAttribute('rx', String(b.width / 2));
        svgEl.setAttribute('ry', String(b.height / 2));
        this.applyRotation(svgEl, element, b);
        break;
      }
      case 'line': {
        svgEl.setAttribute('x1', String(element.x));
        svgEl.setAttribute('y1', String(element.y));
        svgEl.setAttribute('x2', String(element.x2));
        svgEl.setAttribute('y2', String(element.y2));
        break;
      }
      case 'image': {
        const b = getElementBounds(element);
        svgEl.setAttribute('x', String(b.x));
        svgEl.setAttribute('y', String(b.y));
        svgEl.setAttribute('width', String(b.width));
        svgEl.setAttribute('height', String(b.height));
        if(element.src) svgEl.setAttribute('href', element.src);
        this.applyRotation(svgEl, element, b);
        break;
      }
      case 'text': {
        // re-render text completely (tspans may change)
        this.renderElement(element);
        break;
      }
      case 'svg-circle': {
        svgEl.setAttribute('cx', String(element.cx));
        svgEl.setAttribute('cy', String(element.cy));
        svgEl.setAttribute('r', String(element.r));
        this.applyRotation(svgEl, element, { x: element.cx - element.r, y: element.cy - element.r, width: element.r * 2, height: element.r * 2 });
        break;
      }
      case 'svg-path': {
        const pathData = this.translatePath(element.d, element.offsetX, element.offsetY);
        svgEl.setAttribute('d', pathData);
        this.applyRotation(svgEl, element, getElementBounds(element));
        break;
      }
      case 'svg-polygon': {
        const polygonPts = this.translatePolygonPoints(element.points, element.offsetX, element.offsetY);
        svgEl.setAttribute('points', polygonPts);
        this.applyRotation(svgEl, element, getElementBounds(element));
        break;
      }
      case 'svg-text-path': {
        // re-render: path d, text, font-size, color may all have changed
        this.renderElement(element);
        break;
      }
    }

    // common style attributes
    if((element.type !== 'text') && (element.type !== 'image')) {
      if(element.stroke) svgEl.setAttribute('stroke', element.stroke);
      if(element.fill) svgEl.setAttribute('fill', element.fill);
      if(element.strokeWidth) svgEl.setAttribute('stroke-width', String(element.strokeWidth));

      if(element.strokeDasharray && element.strokeDasharray !== 'none') {
        svgEl.setAttribute('stroke-dasharray', element.strokeDasharray);
        svgEl.setAttribute('stroke-linecap', 'round');
      } else {
        svgEl.removeAttribute('stroke-dasharray');
        svgEl.removeAttribute('stroke-linecap');
      }
    }

    // text color / alignment
    if(element.type === 'text') {
      if(element.fill) svgEl.setAttribute('fill', element.fill);

      if(element.textAlign) {
        const anchor = element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start';
        svgEl.setAttribute('text-anchor', anchor);

        const width = element.width || 100;
        let xPos: number;
        if(element.textAlign === 'center') xPos = element.x + width / 2;
        else if(element.textAlign === 'right') xPos = element.x + width;
        else xPos = element.x;
        svgEl.setAttribute('x', String(xPos));

        svgEl.querySelectorAll('tspan').forEach(tspan => {
          tspan.setAttribute('x', String(xPos));
        });
      } /* else -- no alignment change */
    }
  }

  // -- Line decoration markers ---------------------------------------------------
  public applyLineDecorations(svgLine: SVGElement, element: LineElement): void {
    svgLine.removeAttribute('marker-start');
    svgLine.removeAttribute('marker-end');

    const strokeWidth = element.strokeWidth || 2;
    this.updateMarkersForElement(element, strokeWidth);

    if(element.startDecoration && (element.startDecoration !== 'none')) {
      const id = this.markerIdFor(element.startDecoration, 'start', element.id);
      if(id) svgLine.setAttribute('marker-start', `url(#${id})`);
    } /* else -- no start decoration */
    if(element.endDecoration && (element.endDecoration !== 'none')) {
      const id = this.markerIdFor(element.endDecoration, 'end', element.id);
      if(id) svgLine.setAttribute('marker-end', `url(#${id})`);
    } /* else -- no end decoration */
  }

  // ..............................................................................
  private markerIdFor(decoration: LineDecoration, position: 'start' | 'end', elementId: string): string | null {
    const suffix = position === 'start' ? 'Start' : 'End';
    switch(decoration) {
      case 'arrow':            return `arrow${suffix}_${elementId}`;
      case 'triangle-filled':  return `triangleFilled${suffix}_${elementId}`;
      case 'triangle-outline': return `triangleOutline${suffix}_${elementId}`;
      default: return null;
    }
  }

  // ..............................................................................
  private updateMarkersForElement(element: LineElement, strokeWidth: number): void {
    const defs = this.svg.querySelector('defs');
    if(!defs) return;

    const s = 2 / strokeWidth; // scale factor relative to medium (2px)
    const id = element.id;
    const color = element.stroke || '#000000';

    // remove existing markers for this element
    const prefixes = ['arrowStart', 'arrowEnd', 'triangleFilledStart', 'triangleFilledEnd', 'triangleOutlineStart', 'triangleOutlineEnd'];
    for(const p of prefixes) {
      const old = defs.querySelector(`#${p}_${id}`);
      if(old) old.remove();
    }

    const mk = (mid: string, w: number, h: number, rX: number, rY: number, inner: string): SVGMarkerElement => {
      const marker = document.createElementNS(SVG_NS, 'marker') as SVGMarkerElement;
      marker.id = mid;
      marker.setAttribute('markerWidth', String(w * s));
      marker.setAttribute('markerHeight', String(h * s));
      marker.setAttribute('refX', String(rX * s));
      marker.setAttribute('refY', String(rY * s));
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('markerUnits', 'strokeWidth');
      marker.innerHTML = inner;
      marker.querySelectorAll('*').forEach(child => {
        if(child.getAttribute('stroke') === 'currentColor') child.setAttribute('stroke', color);
        if(child.getAttribute('fill') === 'currentColor') child.setAttribute('fill', color);
      });
      return marker;
    };

    const p = (v: number) => v * s; // scaled value helper

    defs.appendChild(mk(`arrowStart_${id}`, 10, 7, 3, 3.5,
      `<path d="M${p(9)} ${p(1)} L${p(3)} ${p(3.5)} L${p(9)} ${p(6)}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>`));
    defs.appendChild(mk(`arrowEnd_${id}`, 10, 7, 7, 3.5,
      `<path d="M${p(1)} ${p(1)} L${p(7)} ${p(3.5)} L${p(1)} ${p(6)}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>`));
    defs.appendChild(mk(`triangleFilledStart_${id}`, 8, 6, 3, 3,
      `<polygon points="${p(7)} ${p(0)}, ${p(1)} ${p(3)}, ${p(7)} ${p(6)}" fill="currentColor" stroke="none"/>`));
    defs.appendChild(mk(`triangleFilledEnd_${id}`, 8, 6, 7, 3,
      `<polygon points="${p(1)} ${p(0)}, ${p(7)} ${p(3)}, ${p(1)} ${p(6)}" fill="currentColor" stroke="none"/>`));
    defs.appendChild(mk(`triangleOutlineStart_${id}`, 8, 6, 3, 3,
      `<polygon points="${p(7)} ${p(0)}, ${p(1)} ${p(3)}, ${p(7)} ${p(6)}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>`));
    defs.appendChild(mk(`triangleOutlineEnd_${id}`, 8, 6, 7, 3,
      `<polygon points="${p(1)} ${p(0)}, ${p(7)} ${p(3)}, ${p(1)} ${p(6)}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>`));
  }

  // == Util ======================================================================
  private applyCommonAttrs(svgEl: SVGElement, el: DrawingElement): void {
    if(el.stroke) svgEl.setAttribute('stroke', el.stroke);
    if(el.fill) svgEl.setAttribute('fill', el.fill);
    if(el.strokeWidth) svgEl.setAttribute('stroke-width', String(el.strokeWidth));

    if(el.strokeDasharray && el.strokeDasharray !== 'none') {
      svgEl.setAttribute('stroke-dasharray', el.strokeDasharray);
      svgEl.setAttribute('stroke-linecap', 'round');
    }
  }

  // -- Rotation --------------------------------------------------------------------
  private applyRotation(svgEl: SVGElement, el: DrawingElement, bounds: { x: number; y: number; width: number; height: number }): void {
    if(el.angle && (el.angle !== 0)) {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const deg = (el.angle * 180) / Math.PI;
      svgEl.setAttribute('transform', `rotate(${deg} ${cx} ${cy})`);
    } /* else -- no rotation */
  }

  // SVG path translation (used for pasted SVG elements)
  private translatePath(pathData: string, offsetX: number, offsetY: number): string {
    if((offsetX === 0) && (offsetY === 0)) return pathData;

    let result = pathData;

    // absolute M, L
    result = result.replace(/([ML])\s*([\d.-]+)[\s,]*([\d.-]+)/g, (_m, cmd, x, y) => {
      return `${cmd}${parseFloat(x) + offsetX},${parseFloat(y) + offsetY}`;
    });

    // absolute H, V
    result = result.replace(/([HV])\s*([\d.-]+)/g, (_m, cmd, v) => {
      const nv = parseFloat(v) + (cmd === 'H' ? offsetX : offsetY);
      return `${cmd}${nv}`;
    });

    // relative m (only first pair translated)
    result = result.replace(/([m])\s*((?:-?\d+(?:\.\d+)?[\s,]*)+)/g, (_m, cmd, coords) => {
      const nums = coords.match(/-?\d+(?:\.\d+)?/g);
      if(!nums || nums.length < 2) return _m;
      let out = `${parseFloat(nums[0]) + offsetX},${parseFloat(nums[1]) + offsetY}`;
      for(let i=2; i<nums.length; i+=2) {
        if(i + 1 < nums.length) out += ` ${nums[i]},${nums[i + 1]}`;
      }
      return `${cmd}${out}`;
    });

    return result;
  }

  // ------------------------------------------------------------------------------
  private translatePolygonPoints(pts: string, offsetX: number, offsetY: number): string {
    if((offsetX === 0) && (offsetY === 0)) return pts;
    return pts.replace(/([^,\s]+)[\s,]*([^,\s]+)/g, (_m, x, y) =>
      `${parseFloat(x) + offsetX},${parseFloat(y) + offsetY}`);
  }
}
