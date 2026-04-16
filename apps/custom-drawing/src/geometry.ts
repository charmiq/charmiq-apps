import { getElementBounds, getRotatedBounds, type Bounds, type DrawingElement, type Point } from './element-model';

// rotation math, transforms, hit-testing, and distance helpers
// ********************************************************************************
// == Rotation Helpers ============================================================
export const rotatePoint = (px: number, py: number, cx: number, cy: number, angle: number): Point => {
  const cos = Math.cos(angle),
        sin = Math.sin(angle);
  const dx = px - cx,
        dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
};

// --------------------------------------------------------------------------------
// snap an angle (radians) to the nearest 15-degree increment
export const snapAngle = (angle: number): number => {
  const step = Math.PI / 12; // 15 degrees
  return Math.round(angle / step) * step;
};

// == Hit Testing =================================================================
export const isPointInBounds = (point: Point, bounds: Bounds, padding = 5): boolean =>
  (point.x >= bounds.x - padding) &&
  (point.x <= bounds.x + bounds.width + padding) &&
  (point.y >= bounds.y - padding) &&
  (point.y <= bounds.y + bounds.height + padding);

// --------------------------------------------------------------------------------
// hit-test considering rotation: un-rotate the point around the element center,
// then test against the axis-aligned bounds
export const isPointInElement = (point: Point, element: DrawingElement): boolean => {
  const bounds = getElementBounds(element);

  if(element.type === 'line') return isPointNearLine(point, element as any);

  let testPoint = point;
  if(element.angle && (element.angle !== 0)) {
    const cx = bounds.x + bounds.width / 2,
          cy = bounds.y + bounds.height / 2;
    testPoint = rotatePoint(point.x, point.y, cx, cy, -element.angle);
  } /* else -- no rotation, use point as-is */

  return isPointInBounds(testPoint, bounds);
};

// --------------------------------------------------------------------------------
// distance from a point to a line segment
export const distanceToLine = (
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number => {
  const dx = x2 - x1,
        dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if(lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx,
        closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
};

// --------------------------------------------------------------------------------
export const isPointNearLine = (point: Point, element: { x: number; y: number; x2: number; y2: number }): boolean =>
  distanceToLine(point.x, point.y, element.x, element.y, element.x2, element.y2) < 8;

// is a point inside a diamond (rotated square)?
export const isPointInDiamond = (point: Point, bounds: Bounds): boolean => {
  const cx = bounds.x + bounds.width / 2,
        cy = bounds.y + bounds.height / 2;
  const dx = Math.abs(point.x - cx) / (bounds.width / 2),
        dy = Math.abs(point.y - cy) / (bounds.height / 2);
  return dx + dy <= 1.1; // small tolerance
};

// --------------------------------------------------------------------------------
// is a point inside an ellipse?
export const isPointInEllipse = (point: Point, bounds: Bounds): boolean => {
  const cx = bounds.x + bounds.width / 2,
        cy = bounds.y + bounds.height / 2;
  const rx = bounds.width / 2,
        ry = bounds.height / 2;
  if((rx === 0) || (ry === 0)) return false;
  const dx = (point.x - cx) / rx;
  const dy = (point.y - cy) / ry;
  return dx * dx + dy * dy <= 1.1;
};

// == Drawing Bounds (multi-element) ==============================================
export const getDrawingBounds = (elements: DrawingElement[]): { minX: number; minY: number; maxX: number; maxY: number } => {
  if(elements.length < 1) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
  for(const el of elements) {
    const b = getRotatedBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  return { minX, minY, maxX, maxY };
};

// == Selection Box Intersection ==================================================
export const doRectsIntersect = (a: Bounds, b: Bounds): boolean =>
  (a.x < b.x + b.width) &&
  (a.x + a.width > b.x) &&
  (a.y < b.y + b.height) &&
  (a.y + a.height > b.y);
