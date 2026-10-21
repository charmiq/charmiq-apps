import { isSeenThrough } from './catalog';
import { describeIn, occupiedPartCells } from './check';
import { getPart, type Placement } from './grid';
import type { Model } from './model';
import { toPoint } from './stage';

// what stands where on a stage: the part filling a point, and the first part a
// segment crosses, against the cells each part (and what its hinges and faces carry)
// fills, the cells collisions are checked in (SEE: check.ts occupiedCells). A point and
// a segment are in the film's units: x and z in studs, height in plates, each within a
// stage's reach (SEE: stage.ts toPoint). A part seen through (a trans- color, or a kind
// with an opening: a window or door frame, a fence; its cells are its whole block,
// opening and all) fills its cells but hides nothing behind it, each part a hinge or a
// face carries judged by its own color and kind, and named by its carrier. A segment
// never counts the part holding its own end (a target inside a building's doorway is
// not hidden by it): that part alone, never the other parts its carrier carries. A segment is followed exactly, column by column across the set's
// extent alone, so a corner it clips counts and its work is bounded by the set's size.
// A part off the grid fills no cells, as collisions count it
// ********************************************************************************
// == Constants ===================================================================
/** the most points and segments one probe answers */
export const MAX_PROBES = 20_000;
/** a column's key: its x and z on one number (a stage's columns lie well within) */
const COLUMN_SPAN = 1 << 16;

// == Types =======================================================================
/** a point in the film's units */
export type ProbePoint = Readonly<{ x: number; z: number; height: number; }>;
/** what a probe answers: each point's part, and each segment's first part, named (SEE:
 *  check.ts describeIn); null where none */
export type Probed = Readonly<{ points: ReadonlyArray<string | null>; segments: ReadonlyArray<string | null>; }>;

/** a part's span of levels in a column: the placement it is named by (itself, or its
 *  carrier), the part itself (each of a set's own and carried parts numbered once),
 *  and whether it is seen through */
type Span = Readonly<{ bottom: number; top: number; part: number; piece: number; seen: boolean; }>;
/** the cells of a set's parts, by column, and the bounds of them all (x and z the
 *  columns' edges, studs; bottom and top, plates) */
type Columns = Readonly<{ spans: ReadonlyMap<number, ReadonlyArray<Span>>; extent?: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number; }>; }>;

// == Probe =======================================================================
/** the parts at points and across segments of a set as a stage shows it */
export const probe = (model: Model, points: ReadonlyArray<ProbePoint>, segments: ReadonlyArray<readonly [ProbePoint, ProbePoint]>): Probed => {
  const columns = columnsOf(model);
  const name = (part: number | undefined) => (part === undefined) ? null : describeIn(model, part);
  return {
    points: points.map(point => name(partsAt(columns, point)[0]?.part)),
    segments: segments.map(([from, to]) => name(firstAcross(columns, from, to))),
  };
};

/** the points and segments a probe call gives, or a refusal naming the first that is
 *  none */
export const probeInput = (points: unknown, segments: unknown): Readonly<{ points: ReadonlyArray<ProbePoint>; segments: ReadonlyArray<readonly [ProbePoint, ProbePoint]>; }> => {
  const pointsGiven = (points === undefined) ? [] : points, segmentsGiven = (segments === undefined) ? [] : segments;
  if(!Array.isArray(pointsGiven) || !Array.isArray(segmentsGiven)) throw new Error('points lists points and segments lists segments: each point { x, z, height }, each segment [from, to]');
  if((pointsGiven.length + segmentsGiven.length) > MAX_PROBES) throw new Error(`A probe answers at most ${MAX_PROBES} points and segments.`);
  return {
    points: pointsGiven.map((each, index) => toPoint(each, `points[${index}]`)),
    segments: segmentsGiven.map((each, index) => {
      if(!Array.isArray(each) || (each.length !== 2)) throw new Error(`segments[${index}] is [from, to]`);
      return [toPoint(each[0], `segments[${index}][0]`), toPoint(each[1], `segments[${index}][1]`)] as const;
    }),
  };
};

// == Internal ====================================================================
const columnKey = (x: number, z: number): number => (x * COLUMN_SPAN) + z;

/** every part's cells, by column */
const columnsOf = (model: Model): Columns => {
  const spans = new Map<number, Array<Span>>();
  let extent: { minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number; } | undefined;
  let pieces = 0;
  model.placements.forEach((placement, part) => {
    for(const { part: filling, cells } of occupiedPartCells(model, placement)) {
      const seen = isSeenThroughPart(filling), piece = pieces++;
      for(const { x, z, bottom, top } of cells) {
        const key = columnKey(x, z);
        const column = spans.get(key) ?? [];
        column.push({ bottom, top, part, piece, seen });
        spans.set(key, column);
        extent = extent
          ? { minX: Math.min(extent.minX, x), maxX: Math.max(extent.maxX, x + 1), minZ: Math.min(extent.minZ, z), maxZ: Math.max(extent.maxZ, z + 1), bottom: Math.min(extent.bottom, bottom), top: Math.max(extent.top, top) }
          : { minX: x, maxX: x + 1, minZ: z, maxZ: z + 1, bottom, top };
      }
    }
  });
  return { spans, ...(extent ? { extent } : {}) };
};

/** whether a part is seen through: a trans- color, or a kind with an opening */
const isSeenThroughPart = (placement: Placement): boolean => placement.color.startsWith('trans-') || isSeenThrough(getPart(placement.part)!.kind/*by contract*/);

/** the parts whose cells hold a point */
const partsAt = (columns: Columns, { x, z, height }: ProbePoint): ReadonlyArray<Span> =>
  (columns.spans.get(columnKey(Math.floor(x), Math.floor(z))) ?? []).filter(cell => (height >= cell.bottom) && (height < cell.top));

/** the first part not seen through a segment crosses from its start, none that holds
 *  its end: the segment clipped to the set's extent, then followed from column to
 *  column, each column's spans met over the stretch of it inside that column */
const firstAcross = (columns: Columns, from: ProbePoint, to: ProbePoint): number | undefined => {
  const { extent } = columns;
  if(!extent) return undefined/*an empty set*/;
  const atEnd = new Set(partsAt(columns, to).map(cell => cell.piece));
  const start = [from.x, from.z, from.height], delta = [to.x - from.x, to.z - from.z, to.height - from.height];
  const [low, high] = [[extent.minX, extent.minZ, extent.bottom], [extent.maxX, extent.maxZ, extent.top]];
  let [enter, leave] = [0, 1];
  for(let axis=0; axis<3; axis++) {
    if(delta[axis] === 0) { if((start[axis] < low[axis]) || (start[axis] > high[axis])) return undefined; continue; }
    const [t1, t2] = [(low[axis] - start[axis]) / delta[axis], (high[axis] - start[axis]) / delta[axis]];
    [enter, leave] = [Math.max(enter, Math.min(t1, t2)), Math.min(leave, Math.max(t1, t2))];
    if(enter >= leave) return undefined/*it misses the set*/;
  }

  // the shares of the segment where it crosses a column's edge, in order along it
  const crossings = mergedInOrder(edgesCrossed(from.x, delta[0], enter, leave), edgesCrossed(from.z, delta[1], enter, leave));
  const stops = [enter, ...crossings, leave];
  for(let index=0; index<(stops.length - 1); index++) {
    const [a, b] = [stops[index], stops[index + 1]];
    if(b <= a) continue/*a corner crossed both ways at once*/;
    const middle = (a + b) / 2;
    const column = columns.spans.get(columnKey(Math.floor(from.x + (delta[0] * middle)), Math.floor(from.z + (delta[1] * middle))));
    let first: Readonly<{ at: number; part: number; }> | undefined;
    for(const span of column ?? []) {
      if(span.seen || atEnd.has(span.piece)) continue;
      const met = metOver(from.height, delta[2], a, b, span);
      if((met !== undefined) && (!first || (met < first.at))) first = { at: met, part: span.part };
    }
    if(first) return first.part;
  }
  return undefined;
};

/** the shares of a segment's run along one axis (from `start` by `delta`) where it
 *  crosses a whole stud, between `enter` and `leave`, in order */
const edgesCrossed = (start: number, delta: number, enter: number, leave: number): ReadonlyArray<number> => {
  if(delta === 0) return [];
  const [a, b] = [start + (delta * enter), start + (delta * leave)];
  const shares: number[] = [];
  if(delta > 0) for(let edge=Math.floor(a) + 1; edge<b; edge++) shares.push((edge - start) / delta);
  else for(let edge=Math.ceil(a) - 1; edge>b; edge--) shares.push((edge - start) / delta);
  return shares;
};

/** two ordered lists as one */
const mergedInOrder = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): ReadonlyArray<number> => {
  const merged: number[] = [];
  let [i, j] = [0, 0];
  while((i < a.length) || (j < b.length)) merged.push(((j >= b.length) || ((i < a.length) && (a[i] <= b[j]))) ? a[i++] : b[j++]);
  return merged;
};

/** where (a share of the segment) a segment's height, from `start` by `delta`, first
 *  lies within a span's levels between shares `a` and `b`; none when it never does */
const metOver = (start: number, delta: number, a: number, b: number, span: Span): number | undefined => {
  if(delta === 0) return ((start >= span.bottom) && (start < span.top)) ? a : undefined;
  const [t1, t2] = [(span.bottom - start) / delta, (span.top - start) / delta];
  const [from, to] = [Math.max(a, Math.min(t1, t2)), Math.min(b, Math.max(t1, t2))];
  return (from < to) ? from : undefined;
};
