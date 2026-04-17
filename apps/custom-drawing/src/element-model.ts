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
  | 'svg-polygon';

export type LineDecoration = 'none' | 'arrow' | 'triangle-filled' | 'triangle-outline';
export type TextAlign = 'left' | 'center' | 'right';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

// == Element Interfaces ==========================================================
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

export type DrawingElement =
  | ShapeElement
  | LineElement
  | TextElement
  | ImageElement
  | SvgCircleElement
  | SvgPathElement
  | SvgPolygonElement;

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
  } else if(el.type === 'svg-path' || el.type === 'svg-polygon') {
    el.offsetX += dx; el.offsetY += dy;
  } else {
    el.x += dx; el.y += dy;
    if('x2' in el) el.x2 += dx;
    if('y2' in el) el.y2 += dy;
  }
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
    case 'svg-polygon': {
      // path/polygon geometry isn't simple -- ask the browser. The rendered
      // <path>/<polygon> has its translated d/points applied, and getBBox()
      // returns local (pre-transform) bounds in canvas coord space, which is
      // exactly what every other element's bounds are in
      const node = document.getElementById(element.id) as SVGGraphicsElement | null;
      if(node && typeof node.getBBox === 'function') {
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
