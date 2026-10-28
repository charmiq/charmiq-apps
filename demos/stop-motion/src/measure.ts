import { frameEnd, type Film, type Shot } from './film';
import type { Point, RecordedActor } from './recorder';

// how far apart actors come. An actor's box is its footprint turned by its yaw (pitch
// and roll aside) and its height from its position up, unposed, as the stage sizes
// it. Two boxes' gap is the distance between them, 0 where they touch or overlap.
// Over a film, every two actors that do not ride together are measured: a pair coming
// within CLOSE_GAP is close, and a pair standing more than OVERLAP_DEEP in each other
// (the least their boxes overlap any way) overlaps, but a thing leaving or reaching the
// hand of the figure letting go of it or taking it up. A film holds up to 64 actors for
// 7,200 frames, so each actor's track is indexed once per film, a frame is boxed only
// when the distance between the actors' reaches could beat the nearest found, a pair
// whose tracks never come within CLOSE_GAP (or never meet, for overlaps) is passed
// over whole, and a film's close pairs and overlaps are found once for the sizes
// given. Only an actor the stage sized (its own entry, whatever its name) is measured
// ********************************************************************************
// == Constants ===================================================================
/** two actors this near are close */
export const CLOSE_GAP = 2/*studs*/;
/** two actors standing deeper than this in each other overlap (studs): past a hand
 *  brushing a sleeve */
export const OVERLAP_DEEP = 0.5;
/** the longest two actors part (seconds) with their overlap still running on */
const OVERLAP_GAP = 0.25;
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
/** two actors standing in each other: the span (seconds), the most they stand in and
 *  the first frame they do */
export type Overlap = Readonly<{ actors: readonly [string, string]; from: number; to: number; most: number; frame: number; time: number; }>;

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

/** how deep two boxes stand in each other (studs): the least their footprints overlap
 *  across any of their edges, or their heights do; 0 where they are apart or touch */
export const depthBetween = (a: Box, b: Box): number => {
  const up = (Math.min(a.position.height + a.size.height, b.position.height + b.size.height) - Math.max(a.position.height, b.position.height)) * STUDS_PER_PLATE;
  const depth = Math.min(up, footprintDepth(corners(a), corners(b)));
  return (depth < TOUCHING) ? 0 : depth;
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

/** every span two actors of a film stand more than OVERLAP_DEEP in each other, a part
 *  of OVERLAP_GAP or less running on, with the most they stand in and the first frame
 *  they do; the longest first, ties in the scene's order; two that ride together never,
 *  nor an actor the stage gave no size, nor a thing and the figure whose hand lets go
 *  of it or takes it up while it leaves or reaches the hand (SEE: handedFrames). Found
 *  once for a film and the sizes given */
export const overlapsOf = (film: Film, sizes: Readonly<Record<string, Size>>): ReadonlyArray<Overlap> => {
  const known = overlapsFound.get(film);
  if(known?.sizes === sizes) return known.overlaps;
  const actors = film.scene.actors.filter(actor => isSized(sizes, actor.name));
  const tracks = tracksOf(film);
  const extents = new Map(actors.map(actor => [actor.name, extentOf(tracks.get(actor.name)!, reachOf(sizes[actor.name]))]));
  const overlaps: Array<{ actors: readonly [string, string]; from: number; to: number; most: number; frame: number; time: number; }> = [];
  actors.forEach((one, index) => {
    for(const other of actors.slice(index + 1)) {
      if(rideRoot(film.scene.actors, one) === rideRoot(film.scene.actors, other)) continue/*riding together*/;
      if(apart(extents.get(one.name)!, extents.get(other.name)!) > 0) continue/*their tracks never meet*/;
      const [ones, others, size, otherSize] = [tracks.get(one.name)!, tracks.get(other.name)!, sizes[one.name], sizes[other.name]];
      const reaches = reachOf(size) + reachOf(otherSize);
      const depthAt = (at: number) => { const [a, b] = [ones[at], others[at]]; return (a && b) ? depthBetween({ position: a.position, yaw: a.turn.yaw, size }, { position: b.position, yaw: b.turn.yaw, size: otherSize }) : 0; };
      const handed = handedFrames(film, one.name, other.name, depthAt);
      let open: { actors: readonly [string, string]; from: number; to: number; most: number; frame: number; time: number; } | undefined;
      film.frames.forEach((frame, at) => {
        const [a, b] = [ones[at], others[at]];
        if(!a || !b || (Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) >= reaches) || handed.has(at)) return/*hidden, out of reach, or leaving or reaching a hand*/;
        const depth = depthBetween({ position: a.position, yaw: a.turn.yaw, size }, { position: b.position, yaw: b.turn.yaw, size: otherSize });
        if(depth <= OVERLAP_DEEP) return;
        if(open && ((frame.time - open.to) <= OVERLAP_GAP)) {
          open.to = frameEnd(film, at);
          if(depth > open.most) [open.most, open.frame, open.time] = [depth, frame.index, frame.time];
          return;
        } /* else -- a span of its own */
        overlaps.push(open = { actors: [one.name, other.name], from: frame.time, to: frameEnd(film, at), most: depth, frame: frame.index, time: frame.time });
      });
    }
  });
  const sorted = overlaps.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  overlapsFound.set(film, { sizes, overlaps: sorted });
  return sorted;
};

/** the frames a thing and the figure whose hand lets go of it or takes it up stand
 *  more than OVERLAP_DEEP in each other (`depthAt`) at that hand-off: from the frame it
 *  leaves the hand until it stands clear of the figure, and back from the frame before
 *  the hand takes it to the first it stands clear (SEE: film.ts HandOff); a thing the
 *  hand plants, every frame the figure hangs from it and then from its letting go until
 *  it stands clear */
const handedFrames = (film: Film, one: string, other: string, depthAt: (at: number) => number): ReadonlySet<number> => {
  const frames = new Set<number>();
  for(const handOff of film.handOffs ?? []) {
    if(!((handOff.thing === one) && (handOff.by === other)) && !((handOff.thing === other) && (handOff.by === one))) continue;
    const step = (handOff.change === 'released') ? 1 : -1;
    const planted = (step > 0) ? film.scene.actors.find(actor => actor.name === handOff.thing)?.planted : undefined;
    const letGo = !planted ? handOff.frame : planted.letGo ? film.frames.findIndex(frame => frame.time >= (planted.letGo!.time - 1e-6)) : -1/*hangs to the end*/;
    const hung = (letGo < 0) ? film.frames.length : letGo;
    for(let at=handOff.frame; at<hung; at++) frames.add(at);
    for(let at=((step > 0) ? hung : (handOff.frame - 1)); (at >= 0) && (at < film.frames.length) && (depthAt(at) > OVERLAP_DEEP); at+=step) frames.add(at);
  }
  return frames;
};

// == Tracks ======================================================================
/** each film's overlaps, for the sizes they were found for */
const overlapsFound = new WeakMap<Film, Readonly<{ sizes: Readonly<Record<string, Size>>; overlaps: ReadonlyArray<Overlap>; }>>();
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
/** an actor and each actor it rides in turn, what it rides at the bottom of its rides
 *  last; itself alone when it rides nothing */
export const rideChain = (actors: ReadonlyArray<RecordedActor>, actor: RecordedActor): ReadonlyArray<RecordedActor> => {
  const seen = new Set<string>(), chain = [actor];
  let current = actor;
  while(current.ride && !seen.has(current.name)) {
    seen.add(current.name);
    current = actors.find(each => each.name === current.ride!.parent) ?? current;
    if(current !== chain[chain.length - 1]) chain.push(current);
  }
  return chain;
};
/** what an actor rides at the bottom of its rides, itself when it rides nothing */
export const rideRoot = (actors: ReadonlyArray<RecordedActor>, actor: RecordedActor): string => {
  const chain = rideChain(actors, actor);
  return chain[chain.length - 1].name;
};

/** a box's eight corners: its footprint's at its bottom, then at its top */
export const boxCorners = (box: Box): ReadonlyArray<Point> => {
  const footprint = corners(box);
  return [box.position.height, box.position.height + box.size.height].flatMap(height => footprint.map(([x, z]) => ({ x, z, height })));
};

/** whether a point lies within a box: inside its turned footprint, between its bottom
 *  and its top */
export const inBox = (box: Box, point: Point): boolean => {
  const [across, up, along] = boxFrameOf(box, point);
  return (Math.abs(across) <= (box.size.width / 2)) && (up >= 0) && (up <= (box.size.height * STUDS_PER_PLATE)) && (Math.abs(along) <= (box.size.depth / 2));
};

/** how far a point lies from a box (studs), 0 within it */
export const pointGap = (box: Box, point: Point): number => {
  const [across, up, along] = boxFrameOf(box, point);
  return Math.hypot(Math.max(0, Math.abs(across) - (box.size.width / 2)), Math.max(0, -up, up - tallOf(box)), Math.max(0, Math.abs(along) - (box.size.depth / 2)));
};

/** how tall a box stands (studs) */
export const tallOf = (box: Box): number => box.size.height * STUDS_PER_PLATE;

/** where a segment first enters a box, as a share of its length from its start; none
 *  when it misses it */
export const segmentEnters = (box: Box, from: Point, to: Point): number | undefined => {
  const [a, b] = [boxFrameOf(box, from), boxFrameOf(box, to)];
  const low = [-box.size.width / 2, 0, -box.size.depth / 2], high = [box.size.width / 2, box.size.height * STUDS_PER_PLATE, box.size.depth / 2];
  let [enter, leave] = [0, 1];
  for(let axis=0; axis<3; axis++) {
    const delta = b[axis] - a[axis];
    if(Math.abs(delta) < 1e-12) { if((a[axis] < low[axis]) || (a[axis] > high[axis])) return undefined; continue; }
    const [t1, t2] = [(low[axis] - a[axis]) / delta, (high[axis] - a[axis]) / delta];
    enter = Math.max(enter, Math.min(t1, t2));
    leave = Math.min(leave, Math.max(t1, t2));
    if(enter > leave) return undefined;
  }
  return enter;
};

/** a point in a box's own frame (studs): across its east, up from its bottom, along its
 *  north, its footprint's middle at the origin (SEE: corners) */
const boxFrameOf = (box: Box, point: Point): readonly [number, number, number] => {
  const angle = box.yaw * (Math.PI / 180);
  const [dx, dz] = [point.x - box.position.x, point.z - box.position.z];
  return [(dx * Math.cos(angle)) - (dz * Math.sin(angle)), (point.height - box.position.height) * STUDS_PER_PLATE, (dx * Math.sin(angle)) + (dz * Math.cos(angle))];
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

/** how deep two convex footprints stand in each other: the least their extents overlap
 *  across any edge of either, 0 where one has the other wholly beyond it */
const footprintDepth = (a: ReadonlyArray<Corner>, b: ReadonlyArray<Corner>): number => Math.min(...[a, b].flatMap(polygon => polygon.map((start, index) => {
  const end = polygon[(index + 1) % polygon.length], length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const normal: Corner = [(end[1] - start[1]) / length, (start[0] - end[0]) / length];
  const project = (point: Corner) => (point[0] * normal[0]) + (point[1] * normal[1]);
  const [aLeast, aMost] = [Math.min(...a.map(project)), Math.max(...a.map(project))];
  const [bLeast, bMost] = [Math.min(...b.map(project)), Math.max(...b.map(project))];
  return Math.max(0, Math.min(aMost, bMost) - Math.max(aLeast, bLeast));
})));

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
