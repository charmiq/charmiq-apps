import { isSeenThrough } from './catalog';
import { describeIn, occupiedPartCells } from './check';
import { getPart, MAX_COORDINATE, type Placement } from './grid';
import type { Model } from './model';
import { toPoint } from './stage';

// what stands where on a stage: the part filling a point, the first part a segment
// crosses, and the ground under a footprint, against the cells each part (and what its
// hinges and faces carry) fills, the cells collisions are checked in (SEE: check.ts
// occupiedCells). Points are in the film's units: x and z in studs, height in plates,
// each within a stage's reach (SEE: stage.ts toPoint). A part seen through (a trans-
// color, or a kind with an opening: a window or door frame, a fence; its cells are its
// whole block, opening and all) fills its cells but hides nothing behind it, each part
// a hinge or a face carries judged by its own color and kind, and named by its
// carrier. A segment never counts the part holding its own end (a target inside a
// building's doorway is not hidden by it): that part alone, never the other parts its
// carrier carries. A segment is followed exactly, column by column across the set's
// extent alone, so a corner it clips counts and its work is bounded by the set's size.
// The ground under a footprint is every surface an actor there could stand on: each
// top of the cells under it that no cell stands on, any part counted, seen through or
// not, and the baseplate (0) where a column under it is bare; an actor following the
// ground chooses among them as it goes (SEE: Stop Motion's ground). A column is under
// a footprint where they overlap over some area, and a call's footprints together
// read a bounded number of columns. A part off the grid fills no cells, as collisions
// count it
// ********************************************************************************
// == Constants ===================================================================
/** the most points, segments and grounds one probe answers */
export const MAX_PROBES = 20_000;
/** the largest footprint a ground is asked under, each way (studs) */
const MAX_FOOTPRINT = 64;
/** the most columns one probe's grounds read, all its footprints' bounds together:
 *  a figure's reach a few columns, a bus's some hundred */
export const MAX_GROUND_COLUMNS = 200_000;
/** how far into a column a footprint must reach to stand over it (studs): less is
 *  touching it */
const TOUCHING = 1e-9;
/** a column's key: its x and z on one number (a stage's columns lie well within) */
const COLUMN_SPAN = 1 << 16;

// == Types =======================================================================
/** a point in the film's units */
export type ProbePoint = Readonly<{ x: number; z: number; height: number; }>;
/** a footprint the ground is asked under: where its middle stands and its size
 *  (studs), turned by its yaw (clockwise seen from above) */
export type ProbeGround = Readonly<{ x: number; z: number; width: number; depth: number; yaw: number; }>;
/** what a probe answers: each point's part, and each segment's first part, named (SEE:
 *  check.ts describeIn), null where none; and the surfaces under each footprint
 *  (plates, lowest first) */
export type Probed = Readonly<{ points: ReadonlyArray<string | null>; segments: ReadonlyArray<string | null>; grounds: ReadonlyArray<ReadonlyArray<number>>; }>;

/** a part's span of levels in a column: the placement it is named by (itself, or its
 *  carrier), the part itself (each of a set's own and carried parts numbered once),
 *  and whether it is seen through */
type Span = Readonly<{ bottom: number; top: number; part: number; piece: number; seen: boolean; }>;
/** the cells of a set's parts, by column, and the bounds of them all (x and z the
 *  columns' edges, studs; bottom and top, plates) */
type Columns = Readonly<{ spans: ReadonlyMap<number, ReadonlyArray<Span>>; extent?: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number; }>; }>;

// == Probe =======================================================================
/** the parts at points and across segments of a set as a stage shows it */
export const probe = (model: Model, points: ReadonlyArray<ProbePoint>, segments: ReadonlyArray<readonly [ProbePoint, ProbePoint]>, grounds: ReadonlyArray<ProbeGround> = []): Probed => {
  const columns = columnsOf(model), surfaces = surfacesBy(columns);
  const name = (part: number | undefined) => (part === undefined) ? null : describeIn(model, part);
  return {
    points: points.map(point => name(partsAt(columns, point)[0]?.part)),
    segments: segments.map(([from, to]) => name(firstAcross(columns, from, to))),
    grounds: grounds.map(ground => surfacesUnder(columns, surfaces, ground)),
  };
};

/** the points and segments a probe call gives, or a refusal naming the first that is
 *  none */
export const probeInput = (points: unknown, segments: unknown, grounds?: unknown): Readonly<{ points: ReadonlyArray<ProbePoint>; segments: ReadonlyArray<readonly [ProbePoint, ProbePoint]>; grounds: ReadonlyArray<ProbeGround>; }> => {
  const pointsGiven = (points === undefined) ? [] : points, segmentsGiven = (segments === undefined) ? [] : segments, groundsGiven = (grounds === undefined) ? [] : grounds;
  if(!Array.isArray(pointsGiven) || !Array.isArray(segmentsGiven) || !Array.isArray(groundsGiven)) throw new Error('points lists points, segments lists segments and grounds lists footprints: each point { x, z, height }, each segment [from, to], each footprint { x, z, width, depth, yaw }');
  if((pointsGiven.length + segmentsGiven.length + groundsGiven.length) > MAX_PROBES) throw new Error(`A probe answers at most ${MAX_PROBES} points, segments and grounds.`);
  return {
    points: pointsGiven.map((each, index) => toPoint(each, `points[${index}]`)),
    segments: segmentsGiven.map((each, index) => {
      if(!Array.isArray(each) || (each.length !== 2)) throw new Error(`segments[${index}] is [from, to]`);
      return [toPoint(each[0], `segments[${index}][0]`), toPoint(each[1], `segments[${index}][1]`)] as const;
    }),
    grounds: boundedGrounds(groundsGiven.map((each, index) => {
      const where = `grounds[${index}]`;
      const { x, z, width, depth, yaw } = (each ?? {}) as Record<string, unknown>;
      const finite = (value: unknown): value is number => (typeof value === 'number') && Number.isFinite(value);
      const placed = finite(x) && finite(z) && (Math.abs(x) <= MAX_COORDINATE) && (Math.abs(z) <= MAX_COORDINATE);
      const sized = [width, depth].every(value => finite(value) && (value > 0) && (value <= MAX_FOOTPRINT));
      if(!placed || !sized || !finite(yaw)) throw new Error(`${where} is { x, z, width, depth, yaw }: its middle (studs within ${MAX_COORDINATE} of the origin), its size (studs, up to ${MAX_FOOTPRINT} each way) and its yaw (degrees)`);
      return { x, z, width: width as number, depth: depth as number, yaw };
    })),
  };
};

/** the grounds a probe call gives, refused whole when together they read more than
 *  MAX_GROUND_COLUMNS columns */
const boundedGrounds = (grounds: ReadonlyArray<ProbeGround>): ReadonlyArray<ProbeGround> => {
  const reached = grounds.reduce((total, ground) => total + columnsReached(ground), 0);
  if(reached > MAX_GROUND_COLUMNS) throw new Error(`A probe's grounds read at most ${MAX_GROUND_COLUMNS} columns together (these reach ${reached}): ask fewer or smaller footprints a call.`);
  return grounds;
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

/** the surfaces under a footprint, lowest first: each top of a cell under it no cell
 *  stands on, and the baseplate (0) where a column under it is bare. A column is under
 *  it where the two overlap over some area: a corner across counts, an edge touching
 *  does not */
const surfacesUnder = (columns: Columns, surfacesOf: (key: number) => ReadonlyArray<number>, ground: ProbeGround): ReadonlyArray<number> => {
  const surfaces = new Set<number>();
  for(const [x, z] of columnsUnder(ground)) for(const surface of surfacesOf(columnKey(x, z))) surfaces.add(surface);
  return [...surfaces].sort((a, b) => a - b);
};

/** a column's surfaces, once a probe asks for them, each column's read once a call:
 *  the top of each run of its spans above the baseplate merged (what nothing stands
 *  on), and 0 unless a run holds the baseplate's level (spans wholly below it lie
 *  under the baseplate) */
const surfacesBy = (columns: Columns): ((key: number) => ReadonlyArray<number>) => {
  const read = new Map<number, ReadonlyArray<number>>();
  return key => {
    const known = read.get(key);
    if(known) return known;
    const spans = (columns.spans.get(key) ?? []).filter(span => span.top > 0).sort((a, b) => a.bottom - b.bottom);
    const surfaces: number[] = ((spans.length < 1) || (spans[0].bottom > 0)) ? [0] : [];
    let top = -Infinity;
    for(const span of spans) {
      if((span.bottom > top) && (top > -Infinity)) surfaces.push(top)/*a gap above the run before*/;
      top = Math.max(top, span.top);
    }
    if(top > -Infinity) surfaces.push(top);
    read.set(key, surfaces);
    return surfaces;
  };
};

/** a footprint's corners on the ground, and the columns its bounds reach (x from
 *  `minX` up to `maxX`, z likewise): every column it can be over */
const footprintOf = ({ x, z, width, depth, yaw }: ProbeGround) => {
  const angle = yaw * (Math.PI / 180);
  const [east, north] = [[Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]]/*its own x and z on the ground*/;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [x + ((u * width / 2) * east[0]) + ((v * depth / 2) * north[0]), z + ((u * width / 2) * east[1]) + ((v * depth / 2) * north[1])] as const);
  const [xs, zs] = [corners.map(corner => corner[0]), corners.map(corner => corner[1])];
  return { corners, axes: [east, north], minX: Math.floor(Math.min(...xs)), maxX: Math.ceil(Math.max(...xs)), minZ: Math.floor(Math.min(...zs)), maxZ: Math.ceil(Math.max(...zs)) };
};

/** how many columns a footprint's bounds reach: the work its ground takes */
const columnsReached = (ground: ProbeGround): number => {
  const { minX, maxX, minZ, maxZ } = footprintOf(ground);
  return (maxX - minX) * (maxZ - minZ);
};

/** the columns under a footprint: those its bounds reach that it overlaps over some
 *  area, by the separating axes of the column's square and the footprint's turned
 *  rectangle */
const columnsUnder = (ground: ProbeGround): ReadonlyArray<readonly [number, number]> => {
  const { corners, axes, minX, maxX, minZ, maxZ } = footprintOf(ground);
  const under: Array<readonly [number, number]> = [];
  for(let x=minX; x<maxX; x++) for(let z=minZ; z<maxZ; z++) {
    const square = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]] as const;
    const apart = [[1, 0], [0, 1], ...axes].some(([ax, az]) => {
      const project = (points: ReadonlyArray<readonly [number, number]>) => points.map(([px, pz]) => (px * ax) + (pz * az));
      const [a, b] = [project(square), project(corners)];
      return (Math.min(...a) >= (Math.max(...b) - TOUCHING)) || (Math.min(...b) >= (Math.max(...a) - TOUCHING));
    });
    if(!apart) under.push([x, z]);
  }
  return under;
};

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
