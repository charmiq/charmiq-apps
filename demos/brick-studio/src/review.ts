import type { Mark } from '../../../shared/review/surface';

import { describeIn, describePlaced, describePlacement } from './check';
import type { Model } from './model';

// the picture as a review surface (SEE: shared/review/surface.ts): a person draws a
// stroke over the picture (a circle round the trouble, a line along a path, an arrow
// at a part) and it becomes a mark, resolved into what the studio names: the film's
// frame and view shown, the actors whose shown pieces the stroke passes over or
// encloses, and the set's parts its points show. A stroke's points are picture
// coordinates, 0 to 1 across and down the picture, so a resized studio draws a mark
// where it was made. A mark's `shown` carries the stroke, frame and view, so a studio
// seeing through the same view draws it again
// ********************************************************************************
// == Constants ===================================================================
/** the kind of surface the picture is (a mark's `surface`) */
export const PICTURE = 'picture';

/** the places a stroke's coordinates keep: a ten-thousandth of the picture, under a
 *  pixel at 4K */
const PLACES = 4;
/** the least a stroke moves before it takes another point (a share of the picture) */
const MIN_STEP = 0.003;
/** the most points a stroke keeps: past it, every other point is let go */
export const MAX_STROKE_POINTS = 256;
/** the points along a stroke its parts are read at (its middle besides) */
export const STROKE_SAMPLES = 12;
/** how near its start a stroke ends to enclose what it circles: a share of the larger
 *  side of its bounds */
const CLOSED_SHARE = 0.25;
/** the most actors a label names before counting the rest */
const LABEL_ACTORS = 3;

// == Types =======================================================================
/** a point of the picture: across and down it, each 0 to 1 */
export type PicturePoint = readonly [number, number];
/** a box of the picture, in picture coordinates */
export type PictureBox = Readonly<{ left: number; top: number; right: number; bottom: number; }>;
/** a box of the picture by its element's place on the page (CSS pixels) */
export type ClientBox = Readonly<{ left: number; top: number; width: number; height: number; }>;

/** an actor the picture shows, by name, and its pieces' drawn bounds in the picture
 *  (none for a piece not drawn) */
export type ActorBounds = Readonly<{ name: string; boxes: ReadonlyArray<PictureBox | undefined>; }>;
/** a part a stroke shows: its name as a placement is named (SEE: check.ts describeIn),
 *  and the words a label says it in (its copy, when it stands in one) */
export type NamedPart = Readonly<{ name: string; label: string; }>;

/** what a stroke resolved to: the reel's frame and the view the studio shows (a
 *  stage's; none for the build), the set shown when it is named, the actors and parts
 *  under it, and the stroke itself */
export type PictureResolution = Readonly<{ frame?: number; view?: string; set?: string; actors: ReadonlyArray<string>; parts: ReadonlyArray<NamedPart>; stroke: ReadonlyArray<PicturePoint>; }>;

// == Stroke ======================================================================
/** a point of the page as a point of the picture its element shows, held to the
 *  picture */
export const picturePoint = (clientX: number, clientY: number, box: ClientBox): PicturePoint =>
  [rounded(clamp((clientX - box.left) / Math.max(box.width, 1))), rounded(clamp((clientY - box.top) / Math.max(box.height, 1)))];

/** a stroke with a point the pointer reached: unchanged within MIN_STEP of its last,
 *  every other point let go once it holds MAX_STROKE_POINTS (its ends kept) */
export const extended = (stroke: ReadonlyArray<PicturePoint>, point: PicturePoint): ReadonlyArray<PicturePoint> => {
  const last = stroke[stroke.length - 1];
  if(last && (distance(last, point) < MIN_STEP)) return stroke;
  const longer = [...stroke, point];
  return (longer.length <= MAX_STROKE_POINTS) ? longer : longer.filter((_, index) => ((index % 2) === 0) || (index === (longer.length - 1)));
};

/** the middle of a stroke: the middle of its bounds (a circle's center) */
export const strokeMiddle = (stroke: ReadonlyArray<PicturePoint>): PicturePoint => {
  const box = boundsOf(stroke);
  return [rounded((box.left + box.right) / 2), rounded((box.top + box.bottom) / 2)];
};

/** the points a stroke's parts are read at: `count` spread evenly along it, its ends
 *  among them (its one point when it never moved), then its middle */
export const strokeSamples = (stroke: ReadonlyArray<PicturePoint>, count = STROKE_SAMPLES): ReadonlyArray<PicturePoint> => {
  if(stroke.length < 1) return [];
  const along = [0];
  for(let index=1; index<stroke.length; index++) along.push(along[index - 1] + distance(stroke[index - 1], stroke[index]));
  const length = along[along.length - 1];
  if(length <= 0) return [stroke[0], strokeMiddle(stroke)];
  const spread = Array.from({ length: count }, (_, index) => {
    const reach = (length * index) / Math.max(count - 1, 1);
    let segment = 1;
    while((segment < (along.length - 1)) && (along[segment] < reach)) segment++;
    const [from, to] = [stroke[segment - 1], stroke[segment]];
    const share = (along[segment] > along[segment - 1]) ? ((reach - along[segment - 1]) / (along[segment] - along[segment - 1])) : 0;
    return [rounded(from[0] + ((to[0] - from[0]) * share)), rounded(from[1] + ((to[1] - from[1]) * share))] as const;
  });
  return [...spread, strokeMiddle(stroke)];
};

/** whether a stroke closes on itself, enclosing what it circles: its end within
 *  CLOSED_SHARE of its bounds' larger side of its start */
export const isClosed = (stroke: ReadonlyArray<PicturePoint>): boolean => {
  if(stroke.length < 3) return false;
  const box = boundsOf(stroke);
  const size = Math.max(box.right - box.left, box.bottom - box.top);
  return (size > 0) && (distance(stroke[0], stroke[stroke.length - 1]) <= (size * CLOSED_SHARE));
};

/** whether a stroke passes over a box or encloses it: a point of it inside the box, a
 *  stretch of it crossing the box, or, closed, the box's middle within it */
export const strokeMeets = (stroke: ReadonlyArray<PicturePoint>, box: PictureBox): boolean =>
  stroke.some(point => isInside(point, box)) ||
  stroke.slice(1).some((point, index) => crosses(stroke[index], point, box)) ||
  (isClosed(stroke) && encloses(stroke, [(box.left + box.right) / 2, (box.top + box.bottom) / 2]));

/** the actors a stroke passes over or encloses any shown piece of, in the order given */
export const actorsUnder = (stroke: ReadonlyArray<PicturePoint>, actors: ReadonlyArray<ActorBounds>): ReadonlyArray<string> =>
  actors.filter(actor => actor.boxes.some(box => !!box && strokeMeets(stroke, box))).map(actor => actor.name);

// == Parts =======================================================================
/** the parts a stroke's points show, each once, in the order first shown: its name as
 *  a placement is named, and its label's words (the copy it stands in, else itself) */
export const namedParts = (model: Model, placements: ReadonlyArray<number | undefined>): ReadonlyArray<NamedPart> =>
  [...new Set(placements.filter((index): index is number => (index !== undefined) && (index >= 0) && (index < model.placements.length)))].map(index => {
    const owner = model.placementPlaced?.[index];
    return { name: describeIn(model, index), label: (owner === undefined) ? describePlacement(model.placements[index]) : describePlaced(model, owner) };
  });

// == Mark ========================================================================
/** the chip's words for a stroke: the picture and its frame, then the actors under it
 *  (the first few, the rest counted) and the first part it shows */
export const markLabel = (frame: number | undefined, actors: ReadonlyArray<string>, parts: ReadonlyArray<NamedPart>): string => {
  const head = (frame === undefined) ? 'Picture' : `Picture, frame ${frame}`;
  const named = [
    ...actors.slice(0, LABEL_ACTORS),
    ...((actors.length > LABEL_ACTORS) ? [`${actors.length - LABEL_ACTORS} more`] : []),
    ...((parts.length > 0) ? [parts[0].label] : []),
  ];
  return (named.length < 1) ? head : `${head}: ${named.join(', ')}`;
};

/** a stroke as a mark: its label, the frame it names, what it resolved to, and how a
 *  studio draws it again */
export const pictureMark = ({ frame, view, set, actors, parts, stroke }: PictureResolution): Mark => {
  const at = { ...((frame !== undefined) ? { frame } : {}), ...((view !== undefined) ? { view } : {}) };
  return {
    surface: PICTURE,
    label: markLabel(frame, actors, parts),
    ...((frame !== undefined) ? { frames: { first: frame, last: frame } } : {}),
    resolved: { ...at, ...((set !== undefined) ? { set } : {}), actors: [...actors], parts: parts.map(part => part.name), stroke: stroke.map(point => [...point]) },
    shown: { ...at, stroke: stroke.map(point => [...point]) },
  };
};

// == Show ========================================================================
/** the strokes of the picture marks a studio seeing through `view` (none for the main
 *  camera or the build) draws: those made through the same view, each stroke as its
 *  `shown` gives it; any other mark, and one whose stroke is malformed, draws nothing */
export const shownStrokes = (marks: ReadonlyArray<Mark>, view: string | undefined): ReadonlyArray<ReadonlyArray<PicturePoint>> =>
  (Array.isArray(marks) ? marks : []).flatMap(mark => {
    if((mark?.surface !== PICTURE) || !mark.shown || (typeof mark.shown !== 'object')) return [];
    const { view: madeThrough, stroke } = mark.shown as Readonly<{ view?: unknown; stroke?: unknown; }>;
    if((madeThrough ?? undefined) !== view) return []/*through another view*/;
    const points = strokeOf(stroke);
    return points ? [points] : [];
  });

/** a stroke as a mark carries it: a list of points within the picture, at most
 *  MAX_STROKE_POINTS; none when it is anything else */
export const strokeOf = (value: unknown): ReadonlyArray<PicturePoint> | undefined => {
  if(!Array.isArray(value) || (value.length < 1) || (value.length > MAX_STROKE_POINTS)) return undefined;
  const isCoordinate = (each: unknown): each is number => (typeof each === 'number') && Number.isFinite(each) && (each >= 0) && (each <= 1);
  return value.every(point => Array.isArray(point) && (point.length === 2) && point.every(isCoordinate)) ? value.map(([x, y]: [number, number]) => [x, y] as const) : undefined;
};

/** a stroke as an SVG polyline's points: a point alone drawn as a dot */
export const polylinePoints = (stroke: ReadonlyArray<PicturePoint>): string =>
  ((stroke.length === 1) ? [stroke[0], stroke[0]] : stroke).map(([x, y]) => `${x},${y}`).join(' ');

// == Util ========================================================================
const clamp = (value: number): number => Math.min(Math.max(value, 0), 1);
const rounded = (value: number): number => Math.round(value * (10 ** PLACES)) / (10 ** PLACES);
const distance = (a: PicturePoint, b: PicturePoint): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

const boundsOf = (stroke: ReadonlyArray<PicturePoint>): PictureBox => ({
  left: Math.min(...stroke.map(point => point[0])), top: Math.min(...stroke.map(point => point[1])),
  right: Math.max(...stroke.map(point => point[0])), bottom: Math.max(...stroke.map(point => point[1])),
});

const isInside = ([x, y]: PicturePoint, box: PictureBox): boolean => (x >= box.left) && (x <= box.right) && (y >= box.top) && (y <= box.bottom);

/** whether a stretch from `from` to `to` crosses a box, by clipping it to the box */
const crosses = (from: PicturePoint, to: PicturePoint, { left, top, right, bottom }: PictureBox): boolean => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  let [enter, leave] = [0, 1];
  for(const [toward, room] of [[-dx, from[0] - left], [dx, right - from[0]], [-dy, from[1] - top], [dy, bottom - from[1]]] as const) {
    if(toward === 0) { if(room < 0) return false/*alongside the box, outside it*/; continue; }
    const share = room / toward;
    if(toward < 0) enter = Math.max(enter, share);
    else leave = Math.min(leave, share);
    if(enter > leave) return false;
  }
  return true;
};

/** whether a closed stroke holds a point, its end joined to its start (even-odd) */
const encloses = (stroke: ReadonlyArray<PicturePoint>, [x, y]: PicturePoint): boolean => {
  let inside = false;
  for(let index=0, before=(stroke.length - 1); index<stroke.length; before=index++) {
    const [[xi, yi], [xj, yj]] = [stroke[index], stroke[before]];
    if(((yi > y) !== (yj > y)) && (x < (((xj - xi) * (y - yi)) / (yj - yi)) + xi)) inside = !inside;
  }
  return inside;
};
