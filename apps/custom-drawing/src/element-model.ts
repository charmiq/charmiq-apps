// types, interfaces, bounds calculation, and id generation for drawing elements
// ********************************************************************************
// == Element Types ===============================================================
export type ElementType =
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'image'
  | 'svg-circle'
  | 'svg-path'
  | 'svg-polygon'
  | 'svg-text-path';

export type LineDecoration = 'none' | 'arrow' | 'triangle-filled' | 'triangle-outline';
export type TextAlign = 'left' | 'center' | 'right';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

// == Geometry Types ==============================================================
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

// == Element Interfaces ==========================================================
// core identity + styling shared by every element (no position assumption)
export interface ElementCore {
  id: string;
  type: ElementType;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  angle?: number;
  groupId?: string;
}

// base for elements whose position is expressed as x,y
export interface BaseElement extends ElementCore {
  x: number;
  y: number;
}

// shapes that have a second corner
export interface ShapeElement extends BaseElement {
  type: 'rectangle' | 'diamond' | 'ellipse';
  x2: number;
  y2: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  x2: number;
  y2: number;
  startDecoration?: LineDecoration;
  endDecoration?: LineDecoration;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize?: number;
  textColor?: string;
  textAlign?: TextAlign;
  /** CSS font-family stack. When omitted the renderer falls back to the
   *  app-wide default (`Excalifont` stack). Google Fonts choices are stored as
   *  the fully-qualified family stack and the font loader ensures the
   *  stylesheet is injected before use */
  fontFamily?: string;
  width?: number;
  height?: number;
  isNew?: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  x2: number;
  y2: number;
  src?: string;
}

export interface SvgCircleElement extends ElementCore {
  type: 'svg-circle';
  cx: number;
  cy: number;
  r: number;
}

export interface SvgPathElement extends ElementCore {
  type: 'svg-path';
  d: string;
  offsetX: number;
  offsetY: number;
}

export interface SvgPolygonElement extends ElementCore {
  type: 'svg-polygon';
  points: string;
  offsetX: number;
  offsetY: number;
}

// text that follows along an SVG path (from <text><textPath href="#p">...</textPath></text>).
// The resolved path `d` is stored directly so the renderer can emit a self-contained
// <defs><path/></defs><text><textPath/></text> without cross-element references
export interface SvgTextPathElement extends ElementCore {
  type: 'svg-text-path';
  d: string;
  text: string;
  offsetX: number;
  offsetY: number;
  fontSize: number;
  textColor: string;
  startOffset?: string;/*e.g. "80" (px) or "50%"*/
}

export type DrawingElement =
  | ShapeElement
  | LineElement
  | TextElement
  | ImageElement
  | SvgCircleElement
  | SvgPathElement
  | SvgPolygonElement
  | SvgTextPathElement;

// --------------------------------------------------------------------------------
/** true for the SVG element types that use offsetX/offsetY rather than x/y for positioning */
export const isSvgOffsetElement = (el: DrawingElement): el is SvgPathElement | SvgPolygonElement | SvgTextPathElement =>
  (el.type === 'svg-path') || (el.type === 'svg-polygon') || (el.type === 'svg-text-path');

/** true for ANY SVG-derived element (path / polygon / text-path / circle) -- the
 *  ones that delegate resize to `resizeSvgBasedElement` rather than writing x/x2/y/y2 */
export const isSvgBasedElement = (el: DrawingElement): el is SvgPathElement | SvgPolygonElement | SvgTextPathElement | SvgCircleElement =>
  isSvgOffsetElement(el) || (el.type === 'svg-circle');

// == Id Generation ===============================================================
export const generateId = (): string =>
  'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

export const generateGroupId = (): string =>
  'group_' + Date.now();

// == Position Helpers ============================================================
// translate an element's position by dx,dy (handles all element shapes)
export const moveElementBy = (el: DrawingElement, dx: number, dy: number): void => {
  if(el.type === 'svg-circle') {
    el.cx += dx; el.cy += dy;
  } else if(isSvgOffsetElement(el)) {
    el.offsetX += dx; el.offsetY += dy;
  } else {
    el.x += dx; el.y += dy;
    if('x2' in el) el.x2 += dx;
    if('y2' in el) el.y2 += dy;
  }
};

// --------------------------------------------------------------------------------
// set an element's position to `orig`'s position plus dx,dy. Used during live
// drag/rotate: `orig` is the pre-gesture snapshot so each frame recomputes from
// the original rather than accumulating floating-point drift.
export const setElementPositionFromOrig = (el: DrawingElement, orig: any, dx: number, dy: number): void => {
  if(el.type === 'svg-circle') {
    el.cx = orig.cx + dx; el.cy = orig.cy + dy;
  } else if(isSvgOffsetElement(el)) {
    el.offsetX = orig.offsetX + dx; el.offsetY = orig.offsetY + dy;
  } else {
    el.x = orig.x + dx; el.y = orig.y + dy;
    if('x2' in el) el.x2 = orig.x2 + dx;
    if('y2' in el) el.y2 = orig.y2 + dy;
  }
};

// --------------------------------------------------------------------------------
// scale an SVG polygon `points` string so that a point originally rendered at
// (fromBounds) ends up rendered at (newBounds). `offsetX`/`offsetY` are the
// pre-resize offsets (baked into the result — caller zeroes offsets afterward).
export const scaleSvgPolygonPoints = (
  points: string,
  offsetX: number, offsetY: number,
  fromBounds: Bounds, newBounds: Bounds,
): string => {
  if((fromBounds.width === 0) || (fromBounds.height === 0)) return points;
  const sx = newBounds.width / fromBounds.width;
  const sy = newBounds.height / fromBounds.height;
  return points.replace(/(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g, (_m, xs, ys) => {
    const rx = parseFloat(xs) + offsetX;
    const ry = parseFloat(ys) + offsetY;
    const nx = newBounds.x + (rx - fromBounds.x) * sx;
    const ny = newBounds.y + (ry - fromBounds.y) * sy;
    return `${nx},${ny}`;
  });
};

// --------------------------------------------------------------------------------
// scale an SVG path `d` string. Handles absolute M/L/H/V/C/S/Q/T/A and their
// relative counterparts. `offsetX`/`offsetY` are the pre-resize offsets (baked
// into absolute coords — caller zeroes offsets afterward).
export const scaleSvgPathData = (
  d: string,
  offsetX: number, offsetY: number,
  fromBounds: Bounds, newBounds: Bounds,
): string => {
  if((fromBounds.width === 0) || (fromBounds.height === 0)) return d;
  const sx = newBounds.width / fromBounds.width;
  const sy = newBounds.height / fromBounds.height;

  const absX = (x: number) => newBounds.x + (x + offsetX - fromBounds.x) * sx;
  const absY = (y: number) => newBounds.y + (y + offsetY - fromBounds.y) * sy;

  const tokens = d.match(/[a-zA-Z]|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
  if(!tokens) return d;

  const out: string[] = [];
  let cmd = '';
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  while(i < tokens.length) {
    const t = tokens[i];
    if(/[a-zA-Z]/.test(t)) {
      cmd = t;
      out.push(cmd);
      i++;
      // 'Z'/'z' takes no args
      continue;
    }
    const uc = cmd.toUpperCase();
    const isRel = cmd !== uc;
    switch(uc) {
      case 'M': case 'L': case 'T': {
        const x = num(), y = num();
        if(isRel) out.push(`${x * sx} ${y * sy}`);
        else      out.push(`${absX(x)} ${absY(y)}`);
        // per spec, subsequent implicit pairs after M/m are L/l
        if(uc === 'M') cmd = isRel ? 'l' : 'L';
        break;
      }
      case 'H': {
        const x = num();
        out.push(isRel ? String(x * sx) : String(absX(x)));
        break;
      }
      case 'V': {
        const y = num();
        out.push(isRel ? String(y * sy) : String(absY(y)));
        break;
      }
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        if(isRel) out.push(`${x1 * sx} ${y1 * sy} ${x2 * sx} ${y2 * sy} ${x * sx} ${y * sy}`);
        else      out.push(`${absX(x1)} ${absY(y1)} ${absX(x2)} ${absY(y2)} ${absX(x)} ${absY(y)}`);
        break;
      }
      case 'S': case 'Q': {
        const x1 = num(), y1 = num(), x = num(), y = num();
        if(isRel) out.push(`${x1 * sx} ${y1 * sy} ${x * sx} ${y * sy}`);
        else      out.push(`${absX(x1)} ${absY(y1)} ${absX(x)} ${absY(y)}`);
        break;
      }
      case 'A': {
        // radii scale with sx/sy; x-axis-rotation + flags unchanged; endpoint transforms like M/L
        const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), x = num(), y = num();
        const nx = isRel ? x * sx : absX(x);
        const ny = isRel ? y * sy : absY(y);
        out.push(`${rx * sx} ${ry * sy} ${rot} ${large} ${sweep} ${nx} ${ny}`);
        break;
      }
      default:
        // unknown command — consume one token to avoid infinite loop
        i++;
        break;
    }
  }
  return out.join(' ');
};

// --------------------------------------------------------------------------------
// resize an SVG-based element (svg-path / svg-polygon / svg-circle / svg-text-path)
// to fit `newBounds`. `orig` is the pre-resize snapshot; `fromBounds` is its
// bounds at the start of the resize gesture. Mutates `el` in place.
export const resizeSvgBasedElement = (
  el: DrawingElement,
  orig: any,
  fromBounds: Bounds, newBounds: Bounds,
): void => {
  if((fromBounds.width === 0) || (fromBounds.height === 0)) return;
  const sx = newBounds.width / fromBounds.width;
  const sy = newBounds.height / fromBounds.height;

  if(el.type === 'svg-polygon') {
    el.points = scaleSvgPolygonPoints(orig.points, orig.offsetX, orig.offsetY, fromBounds, newBounds);
    el.offsetX = 0; el.offsetY = 0;
  } else if(el.type === 'svg-path') {
    el.d = scaleSvgPathData(orig.d, orig.offsetX, orig.offsetY, fromBounds, newBounds);
    el.offsetX = 0; el.offsetY = 0;
  } else if(el.type === 'svg-text-path') {
    el.d = scaleSvgPathData(orig.d, orig.offsetX, orig.offsetY, fromBounds, newBounds);
    el.offsetX = 0; el.offsetY = 0;
    if(typeof orig.fontSize === 'number') {
      el.fontSize = orig.fontSize * Math.max(0.01, (sx + sy) / 2);
    } /* else -- no fontSize to scale */
  } else if(el.type === 'svg-circle') {
    // place circle at newBounds center; radius = min(width,height)/2 to stay a circle
    el.cx = newBounds.x + newBounds.width / 2;
    el.cy = newBounds.y + newBounds.height / 2;
    el.r = Math.min(newBounds.width, newBounds.height) / 2;
  } /* else -- not an SVG-based element */
};

// == Bounds Helpers ==============================================================
export const getElementBounds = (element: DrawingElement): Bounds => {
  switch(element.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
    case 'image':
      return {
        x: Math.min(element.x, element.x2),
        y: Math.min(element.y, element.y2),
        width: Math.abs(element.x2 - element.x),
        height: Math.abs(element.y2 - element.y),
      };

    case 'line':
      return {
        x: Math.min(element.x, element.x2),
        y: Math.min(element.y, element.y2),
        width: Math.abs(element.x2 - element.x),
        height: Math.abs(element.y2 - element.y),
      };

    case 'text':
      return {
        x: element.x,
        y: element.y,
        width: element.width || 100,
        height: element.height || 20,
      };

    case 'svg-circle':
      return {
        x: element.cx - element.r,
        y: element.cy - element.r,
        width: element.r * 2,
        height: element.r * 2,
      };

    case 'svg-path':
    case 'svg-polygon':
    case 'svg-text-path': {
      // path/polygon/textPath geometry isn't simple -- ask the browser. The
      // rendered node has its translated d/points applied, and getBBox() returns
      // local (pre-transform) bounds in canvas coord space, which is exactly
      // what every other element's bounds are in
      const node = document.getElementById(element.id) as SVGGraphicsElement | null;
      if(node && (typeof node.getBBox === 'function')) {
        try {
          const bb = node.getBBox();
          if((bb.width > 0) || (bb.height > 0)) {
            return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
          } /* else -- zero-size bounding-box */
        } catch { /*not yet rendered / not in a rendered tree -- fall through*/ }
      } /* else -- element not in DOM yet */

      // fallback for pre-render calls: at least anchor at the known offset so
      // the first-paint frame doesn't put selection chrome at (0, 0)
      return { x: element.offsetX, y: element.offsetY, width: 0, height: 0 };
    }
  }
};

// -- Rotation --------------------------------------------------------------------
// bounds that account for rotation (axis-aligned bounding box of rotated rect)
export const getRotatedBounds = (element: DrawingElement): Bounds => {
  const b = getElementBounds(element);
  const angle = element.angle;
  if(!angle || (angle === 0)) return b;

  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = b.width * cos + b.height * sin;
  const h = b.width * sin + b.height * cos;

  return {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
  };
};

// --------------------------------------------------------------------------------
// convenience: bounds from raw data (e.g. copied element without the full object)
export const getElementBoundsFromData = (data: any): Bounds => {
  switch(data.type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
    case 'image':
      return {
        x: Math.min(data.x, data.x2),
        y: Math.min(data.y, data.y2),
        width: Math.abs(data.x2 - data.x),
        height: Math.abs(data.y2 - data.y),
      };

    case 'line':
      return {
        x: Math.min(data.x, data.x2) - 5,
        y: Math.min(data.y, data.y2) - 5,
        width: Math.abs(data.x2 - data.x) + 10,
        height: Math.abs(data.y2 - data.y) + 10,
      };

    case 'text':
      return {
        x: data.x,
        y: data.y,
        width: data.width || 100,
        height: data.height || 20,
      };

    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
};
