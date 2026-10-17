import type { Film, Shot } from './film';
import type { Point, RecordedActor } from './recorder';

// how far apart actors come. An actor's box is its footprint turned by its yaw (pitch
// and roll aside) and its height from its position up, unposed, as the stage sizes
// it. Two boxes' gap is the distance between them, 0 where they touch or overlap.
// Over a film, every two actors that do not ride together are measured, and a pair
// coming within CLOSE_GAP is close. A film holds up to 64 actors for 7,200 frames, so
// each actor's track is indexed once per film, a frame is boxed only when the
// distance between the actors' reaches could beat the nearest found, a pair whose
// tracks never come within CLOSE_GAP is passed over whole, and a film's close pairs
// are found once for the sizes given. Only an actor the stage sized (its own entry,
// whatever its name) is measured
// ********************************************************************************
// == Constants ===================================================================
/** two actors this near are close */
export const CLOSE_GAP = 2/*studs*/;
const STUDS_PER_PLATE = 0.4;
/** a gap nearer than this is touching: a turn's trigonometry rounds */
const TOUCHING = 1e-9/*studs*/;
/** how far a moment may lie past a frame's time and still reach it: a frame's time is
 *  the quotient of its index and the fps, which rounds */
const TIME_EPSILON = 1e-9/*seconds*/;

// == Types =======================================================================
/** an actor's box as the stage sizes it: studs across (x), studs along (z) and
 *  plates up, unturned and unposed */
export type Size = Readonly<{ width: number; depth: number; height: number; }>;
/** an actor's box where it stands: its footprint's middle at `position`, turned by
 *  `yaw` (degrees, clockwise seen from above) */
export type Box = Readonly<{ position: Point; yaw: number; size: Size; }>;
/** where two actors come closest: the first frame of their least gap */
export type Closest = Readonly<{ frame: number; time: number; gap: number; }>;
export type ClosePair = Closest & Readonly<{ actors: readonly [string, string]; }>;

type Corner = readonly [number, number];

// == Gap =========================================================================
/** the distance between two boxes (studs), 0 where they touch or overlap */
export const gapBetween = (a: Box, b: Box): number => {
  const across = footprintGap(corners(a), corners(b));
  const [aTop, bTop] = [a.position.height + a.size.height, b.position.height + b.size.height];
  const up = Math.max(0, b.position.height - aTop, a.position.height - bTop) * STUDS_PER_PLATE;
  const gap = Math.hypot(across, up);
  return (gap < TOUCHING) ? 0 : gap;
};

// == Film ========================================================================
/** where two actors come closest over a film, or over its frames from `from` to `to`
 *  (seconds); undefined when no frame there shows both, or the stage sized either
 *  not */
export const closest = (film: Film, sizes: Readonly<Record<string, Size>>, a: string, b: string, from = 0, to = film.scene.length): Closest | undefined =>
  nearest(film, sizes, a, b, from, to, Infinity);

/** every two actors of a film that come within CLOSE_GAP, each where it comes
 *  closest, in the scene's order; two that ride together (one on the other, or both
 *  on one thing) are never a pair, nor an actor the stage gave no size. Found once
 *  for a film and the sizes given */
export const closePairs = (film: Film, sizes: Readonly<Record<string, Size>>): ReadonlyArray<ClosePair> => {
  const known = pairsFound.get(film);
  if(known?.sizes === sizes) return known.pairs;
  const actors = film.scene.actors.filter(actor => isSized(sizes, actor.name));
  const tracks = tracksOf(film);
  const extents = new Map(actors.map(actor => [actor.name, extentOf(tracks.get(actor.name)!, reachOf(sizes[actor.name]))]));
  const pairs: ClosePair[] = [];
  actors.forEach((one, index) => {
    for(const other of actors.slice(index + 1)) {
      if(rideRoot(film.scene.actors, one) === rideRoot(film.scene.actors, other)) continue/*riding together*/;
      if(apart(extents.get(one.name)!, extents.get(other.name)!) >= CLOSE_GAP) continue/*their tracks never come close*/;
      const found = nearest(film, sizes, one.name, other.name, 0, film.scene.length, CLOSE_GAP);
      if(found) pairs.push({ actors: [one.name, other.name], ...found });
    }
  });
  pairsFound.set(film, { sizes, pairs });
  return pairs;
};

// == Tracks ======================================================================
/** each film's close pairs, for the sizes they were found for */
const pairsFound = new WeakMap<Film, Readonly<{ sizes: Readonly<Record<string, Size>>; pairs: ReadonlyArray<ClosePair>; }>>();
/** each film's actors' tracks: each actor's shot in every frame, none where hidden */
const tracksFound = new WeakMap<Film, ReadonlyMap<string, ReadonlyArray<Shot | undefined>>>();

/** a film's actors' tracks, indexed once */
const tracksOf = (film: Film): ReadonlyMap<string, ReadonlyArray<Shot | undefined>> => {
  const known = tracksFound.get(film);
  if(known) return known;
  const tracks = new Map(film.scene.actors.map(actor => [actor.name, new Array<Shot | undefined>(film.frames.length)]));
  film.frames.forEach((frame, index) => { for(const shot of frame.actors) tracks.get(shot.name)![index] = shot; });
  tracksFound.set(film, tracks);
  return tracks;
};

/** where two actors come nearer than `limit` over frames from `from` to `to`: the
 *  first frame of their least gap. A frame is boxed only when the gap between the
 *  circles their footprints turn within, and their heights, could beat the nearest
 *  found */
const nearest = (film: Film, sizes: Readonly<Record<string, Size>>, a: string, b: string, from: number, to: number, limit: number): Closest | undefined => {
  if(!isSized(sizes, a) || !isSized(sizes, b)) return undefined;
  const tracks = tracksOf(film);
  const [ones, others] = [tracks.get(a) ?? [], tracks.get(b) ?? []];
  const [size, otherSize] = [sizes[a], sizes[b]];
  const reaches = reachOf(size) + reachOf(otherSize);
  let best = limit, found: Closest | undefined;
  film.frames.forEach((frame, index) => {
    const [one, other] = [ones[index], others[index]];
    if(!one || !other) return/*one of them hidden*/;
    if((frame.time < (from - TIME_EPSILON)) || (frame.time > (to + TIME_EPSILON))) return;
    const up = Math.max(0, other.position.height - (one.position.height + size.height), one.position.height - (other.position.height + otherSize.height)) * STUDS_PER_PLATE;
    const across = Math.max(0, Math.hypot(other.position.x - one.position.x, other.position.z - one.position.z) - reaches);
    if(Math.hypot(across, up) >= best) return/*cannot come nearer*/;
    const gap = gapBetween({ position: one.position, yaw: one.turn.yaw, size }, { position: other.position, yaw: other.turn.yaw, size: otherSize });
    if(gap < best) { best = gap; found = { frame: frame.index, time: frame.time, gap }; }
  });
  return found;
};

/** the area (studs) a track's footprints reach over the film */
type Extent = Readonly<{ west: number; south: number; east: number; north: number; }>;
const extentOf = (track: ReadonlyArray<Shot | undefined>, reach: number): Extent => {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for(const shot of track) {
    if(!shot) continue;
    west = Math.min(west, shot.position.x - reach); east = Math.max(east, shot.position.x + reach);
    south = Math.min(south, shot.position.z - reach); north = Math.max(north, shot.position.z + reach);
  }
  return { west, south, east, north };
};
/** the least distance between two extents, 0 where they meet (Infinity for a track
 *  never shown) */
const apart = (a: Extent, b: Extent): number => {
  if(!Number.isFinite(a.west) || !Number.isFinite(b.west)) return Infinity;
  return Math.hypot(Math.max(0, b.west - a.east, a.west - b.east), Math.max(0, b.south - a.north, a.south - b.north));
};

/** the radius a footprint turns within */
const reachOf = (size: Size): number => Math.hypot(size.width / 2, size.depth / 2);

/** whether the stage sized an actor: its own entry, never one every object inherits */
export const isSized = (sizes: Readonly<Record<string, Size>>, name: string): boolean => Object.hasOwn(sizes, name);

// == Util ========================================================================
/** what an actor rides at the bottom of its rides, itself when it rides nothing */
const rideRoot = (actors: ReadonlyArray<RecordedActor>, actor: RecordedActor): string => {
  const seen = new Set<string>();
  let current = actor;
  while(current.ride && !seen.has(current.name)) {
    seen.add(current.name);
    current = actors.find(each => each.name === current.ride!.parent) ?? current;
  }
  return current.name;
};

/** a box's footprint corners, in order round it (x east, z north) */
const corners = ({ position, yaw, size }: Box): ReadonlyArray<Corner> => {
  const angle = yaw * (Math.PI / 180);
  const north: Corner = [Math.sin(angle), Math.cos(angle)], east: Corner = [Math.cos(angle), -Math.sin(angle)];
  const [w, d] = [size.width / 2, size.depth / 2];
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([across, along]) => [position.x + (across * east[0]) + (along * north[0]), position.z + (across * east[1]) + (along * north[1])] as const);
};

/** the distance between two convex footprints, 0 where they meet */
const footprintGap = (a: ReadonlyArray<Corner>, b: ReadonlyArray<Corner>): number => {
  if(!separated(a, b) && !separated(b, a)) return 0/*overlapping or touching*/;
  const nearest = (points: ReadonlyArray<Corner>, polygon: ReadonlyArray<Corner>) => Math.min(...points.flatMap(point => polygon.map((start, index) => toSegment(point, start, polygon[(index + 1) % polygon.length]))));
  return Math.min(nearest(a, b), nearest(b, a));
};

/** whether an edge of `a` has `b` wholly beyond it */
const separated = (a: ReadonlyArray<Corner>, b: ReadonlyArray<Corner>): boolean => a.some((start, index) => {
  const end = a[(index + 1) % a.length];
  const normal: Corner = [end[1] - start[1], start[0] - end[0]];
  const project = (point: Corner) => (point[0] * normal[0]) + (point[1] * normal[1]);
  const [aLeast, aMost] = [Math.min(...a.map(project)), Math.max(...a.map(project))];
  const [bLeast, bMost] = [Math.min(...b.map(project)), Math.max(...b.map(project))];
  return (bLeast > (aMost + TOUCHING)) || (bMost < (aLeast - TOUCHING));
});

/** the distance from a point to a segment */
const toSegment = ([px, pz]: Corner, [ax, az]: Corner, [bx, bz]: Corner): number => {
  const [dx, dz] = [bx - ax, bz - az];
  const along = Math.max(0, Math.min(1, (((px - ax) * dx) + ((pz - az) * dz)) / ((dx * dx) + (dz * dz))));
  return Math.hypot(px - (ax + (along * dx)), pz - (az + (along * dz)));
};
