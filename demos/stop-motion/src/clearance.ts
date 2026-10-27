import { hipsOver, type PoseBottoms, HIPS } from '../../brick-shared/rise';

import { cameraShots, frameEnd, isReached, pointIn, rotation, type Feet, type Film, type FilmFrame, type Shot, type StageCamera, FLOATING } from './film';
import type { GroundProbe } from './ground';
import type { Size } from './measure';
import type { Point, RecordedCamera, Span } from './recorder';
import { avoidingAt, flying, pathAt, type PartFinding } from './review';
import { lowestAbove, surfaceUnder, type SurfaceAt } from './steps';

// the film's cameras against the set's parts, as the studio's probe answers them (SEE:
// Brick Studio's probeStage): each frame's part a camera stands inside, and the first
// part between the camera and its target. Every camera is held so: the film's, and
// each view's but a plan's (a plan stands over everything). The film's camera is
// probed at every frame, for what it meets; a view's only where it avoids. A camera
// keyed `avoid: 'parts'` is drawn in along its line to its target, as little as keeps
// it clear (inside no part, its target hidden by none): each frame's farthest clear
// stop, then eased so the camera never jumps, a frame drawn in as far as any frame
// within EASE_SECONDS of it in its shot needs, less the nearer that frame is. A frame
// clear at no stop stays where it was keyed, and its problem stands. The shot a
// transition leaves on the same set is the film's camera held on: probed where it
// stands, avoiding as the frame it last showed in did, and eased as one shot with the
// frames before its cut, so neither it nor they jump. On another set it is that frame
// held, its camera as that frame's was cleared. Each figure's body is held against the
// parts too, while it is in the air: a keyed flight through a bar, or how far it clears
// one; and a figure the ground stands on a part, its footing gone wrong there, is told
// the part it stands on
// ********************************************************************************
// == Constants ===================================================================
/** the shares of its distance to its target an avoiding camera is tried at, the
 *  farthest first */
const STOPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
/** how long an avoiding camera takes to come in to its stop and go back out (seconds) */
const EASE_SECONDS = 0.25;
/** the most points and segments one probe answers (Brick Studio's MAX_PROBES) */
const PROBE_BATCH = 20_000;
/** a share of the camera's distance kept as keyed */
const KEPT = 1 - 1e-6;
/** a figure's body as it is probed, each point named, unturned (studs across and along,
 *  plates up from its soles): its middle from its hips to its head, 0.7 studs apart
 *  lying down (a stud-wide bar crossed falls between none), and its waist's and chest's
 *  front and back (a figure faces south at yaw 0: its front is south of its middle) */
const BODY: ReadonlyArray<Readonly<{ name: string; at: Point; }>> = [
  { name: 'hips', at: { x: 0, z: 0, height: HIPS } }, { name: 'waist', at: { x: 0, z: 0, height: 5.25 } }, { name: 'chest', at: { x: 0, z: 0, height: 7 } },
  { name: 'neck', at: { x: 0, z: 0, height: 8.75 } }, { name: 'head', at: { x: 0, z: 0, height: 10.5 } },
  { name: 'waist front', at: { x: 0, z: -0.5, height: 5.25 } }, { name: 'waist back', at: { x: 0, z: 0.5, height: 5.25 } },
  { name: 'chest front', at: { x: 0, z: -0.5, height: 7 } }, { name: 'chest back', at: { x: 0, z: 0.5, height: 7 } },
];
/** the ways out of a cell, each followed up to WAY_OUT cells for a point in a part:
 *  up and down (plates), east and west, north and south (studs) */
type Way = Readonly<{ axis: 'x' | 'z' | 'height'; sign: 1 | -1; }>;
const WAYS: ReadonlyArray<Way> = [{ axis: 'height', sign: 1 }, { axis: 'height', sign: -1 }, { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 }, { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 }];
const WAY_OUT = 4;
const WAY_OUT_ASKS = WAYS.length * WAY_OUT;
/** how wide the footprint a point's column is asked under is (studs): a hair, its own
 *  column alone */
const COLUMN_HAIR = 0.1;
const STUDS_PER_PLATE = 0.4;
/** how near two heights lie to count as one (plates) */
const TOUCHING = 1e-9;
/** how far apart (studs) the points a footprint is asked at lie */
const FOOTPRINT_STEP = 0.5;

// == Types =======================================================================
/** asks the studio what stands at points and across segments of a set (the first
 *  staged when none is named) */
export type Probe = (set: string | undefined, points: ReadonlyArray<Point>, segments: ReadonlyArray<readonly [Point, Point]>) => Promise<Readonly<{ points: ReadonlyArray<string | null>; segments: ReadonlyArray<string | null>; }>>;
/** a span (seconds) an avoiding camera is drawn in toward its target, the least share
 *  of its keyed distance it keeps over it, and the view it is (none for the film's) */
export type Avoided = Readonly<{ from: number; to: number; kept: number; view?: string; }>;
/** a film cleared: its cameras drawn in where they avoid the parts, each frame's parts
 *  as the probe found them where the film's camera ends, and the spans drawn in */
export type Cleared = Readonly<{ film: Film; parts: ReadonlyArray<PartFinding>; avoided: ReadonlyArray<Avoided>; }>;

/** a camera over the film: its keys (whose cuts end its shots), its name (none for the
 *  film's), its camera at each frame and the set it stands on, whether it avoids there
 *  (as its keys say when left out), and whether it is the shot a transition leaves */
type Track = Readonly<{
  keys: RecordedCamera; view?: string; at: (frame: FilmFrame) => StageCamera; set: (frame: FilmFrame) => string | undefined;
  avoids?: (frame: FilmFrame, index: number) => boolean; leaving?: true;
}>;
/** a camera of a track at a frame, at a share of its distance to its target */
type Ask = Readonly<{ track: number; frame: number; share: number; }>;

// == Clearance ===================================================================
/** the film's cameras against the set's parts, each drawn in where it avoids them */
export const clearanceOf = async (film: Film, probe: Probe): Promise<Cleared> => {
  const { scene, frames } = film;
  const reach = easeReach(film);
  const avoidsAt = (index: number) => avoidingAt(scene.camera, frames[index].time);
  const tracks: ReadonlyArray<Track> = [
    { keys: scene.camera, at: frame => frame.camera, set: frame => frame.set },
    ...scene.views.filter(view => !view.plan).map(view => ({ keys: view, view: view.name, at: (frame: FilmFrame) => frame.views[view.name] as StageCamera/*no plan*/, set: (frame: FilmFrame) => frame.set })),
    // the shot a transition leaves on its frame's set: over its frames, and the frames before its cut it eases with
    ...(frames.some(frame => frame.transition) ? [{
      keys: { ...scene.camera, keys: scene.camera.keys.filter(key => !key.transition) }/*one shot across each cut it leaves*/, leaving: true as const,
      at: (frame: FilmFrame) => frame.transition?.camera ?? frame.camera, set: (frame: FilmFrame) => frame.transition ? frame.transition.set : frame.set,
      avoids: (frame: FilmFrame, index: number) => frame.transition ? (!isHeld(frame) && avoidsAt(frame.transition.frame)) : (avoidsAt(index) && frames.slice(index + 1, index + 1 + reach).some(each => each.transition && !isHeld(each))),
    }] : []),
  ];
  const avoiding = tracks.map(track => frames.map((frame, index) => (track.avoids ? track.avoids(frame, index) : avoidingAt(track.keys, frame.time)) && (distanceOf(track.at(frame)) > 0)));
  const outgoing = tracks.findIndex(track => track.leaving);

  // the film's camera at every frame as keyed, and each avoiding camera at every stop
  const asked = tracks.flatMap((_, track) => frames.flatMap((__, frame) => [
    ...(((track === 0) || avoiding[track][frame]) ? [{ track, frame, share: 1 }] : []),
    ...(avoiding[track][frame] ? STOPS.map(share => ({ track, frame, share })) : []),
  ]));
  const found = new Map(await probeAt(film, tracks, probe, asked));
  const needs = tracks.map((_, track) => frames.map((__, frame) => !avoiding[track][frame] ? 1 : [1, ...STOPS].find(share => isClear(found.get(keyOf(track, frame, share))))));

  // eased within each shot, then each eased stop not clear held at the farthest clear
  // stop within it, else at its own
  const eased = tracks.map((track, index) => easedShares(film, track.keys, needs[index]));
  for(const [key, finding] of await probeAt(film, tracks, probe, eased.flatMap((shares, track) => shares.flatMap((share, frame) => (avoiding[track][frame] && (share < KEPT) && !found.has(keyOf(track, frame, share))) ? [{ track, frame, share }] : [])))) found.set(key, finding);
  const shares = eased.map((trackShares, track) => trackShares.map((share, frame) => {
    const need = needs[track][frame];
    if(!avoiding[track][frame] || (need === undefined)) return 1/*as keyed*/;
    if(isClear(found.get(keyOf(track, frame, share)))) return share;
    return [1, ...STOPS].find(stop => (stop <= share) && isClear(found.get(keyOf(track, frame, stop)))) ?? need;
  }));
  // a frame before a cut drawn in as far as the shot its transition leaves eases it
  // (that shot's camera there is its own), and the track whose stop it stands at
  const source = frames.map((frame, index) => ((outgoing > 0) && !frame.transition && (shares[outgoing][index] < shares[0][index])) ? outgoing : 0);
  const filmShares = frames.map((_, index) => shares[source[index]][index]);

  const cleared = frames.map((frame, index) => {
    const camera = drawnIn(frame.camera, filmShares[index]);
    const views = Object.fromEntries(Object.entries(frame.views).map(([name, view]) => {
      const track = tracks.findIndex(each => each.view === name);
      return [name, (track > 0) ? drawnIn(view as StageCamera, shares[track][index]) : view];
    }));
    const transition = frame.transition && { ...frame.transition, camera: drawnIn(frame.transition.camera, isHeld(frame) ? filmShares[frame.transition.frame]/*that frame's own*/ : shares[outgoing][index]) };
    return { ...frame, camera, views, ...(transition ? { transition } : {}) };
  });
  return {
    film: { ...film, frames: cleared }/*its footsteps and leaps its own*/,
    parts: filmShares.map((share, frame) => found.get(keyOf(source[frame], frame, share)) ?? {}),
    avoided: tracks.flatMap((track, index) => track.leaving ? [] : avoidedOf(film, (index === 0) ? filmShares : shares[index]).map(span => ({ ...span, ...((track.view !== undefined) ? { view: track.view } : {}) }))),
  };
};

// == Internal ====================================================================
/** asks the probe about cameras of the tracks at shares of their distances, set by set
 *  and a batch at a time, keyed by track, frame and share */
const probeAt = async (film: Film, tracks: ReadonlyArray<Track>, probe: Probe, asked: ReadonlyArray<Ask>): Promise<ReadonlyMap<string, PartFinding>> => {
  const bySet = new Map<string | undefined, Ask[]>();
  for(const each of asked) {
    const set = tracks[each.track].set(film.frames[each.frame]);
    const listed = bySet.get(set) ?? [];
    listed.push(each);
    bySet.set(set, listed);
  }
  const found = new Map<string, PartFinding>();
  for(const [set, all] of bySet) {
    for(let from=0; from<all.length; from+=(PROBE_BATCH / 2)) {
      const batch = all.slice(from, from + (PROBE_BATCH / 2))/*a point and a segment each*/;
      const cameras = batch.map(each => drawnIn(tracks[each.track].at(film.frames[each.frame]), each.share));
      const answer = await probe(set, cameras.map(camera => camera.position), cameras.map(camera => [camera.position, camera.target] as const));
      batch.forEach((each, index) => {
        const [inside, hidden] = [answer.points[index], answer.segments[index]];
        found.set(keyOf(each.track, each.frame, each.share), { ...(inside ? { inside } : {}), ...(hidden ? { hidden } : {}) });
      });
    }
  }
  return found;
};

/** each avoiding frame's share eased: no more than any frame of its camera's shot
 *  within EASE_SECONDS needs, that need fading out to the full distance across those
 *  seconds */
const easedShares = (film: Film, keys: RecordedCamera, needs: ReadonlyArray<number | undefined>): ReadonlyArray<number> => {
  const { scene, frames } = film;
  const shots = cameraShots(keys, scene.length);
  const shotOf = frames.map(frame => shots.filter(shot => isReached(shot.from, frame.time)).length);
  const reach = easeReach(film);
  return frames.map((_, index) => {
    let share = needs[index] ?? 1;
    for(let other=Math.max(0, index - reach); other<=Math.min(frames.length - 1, index + reach); other++) {
      const need = needs[other];
      if((need === undefined) || (shotOf[other] !== shotOf[index])) continue;
      share = Math.min(share, need + ((Math.abs(other - index) / reach) * (1 - need)));
    }
    return roundShare(share);
  });
};

/** whether a frame's transition leaves another set: the frame it last showed in, held */
const isHeld = (frame: FilmFrame): boolean => !!frame.transition && (frame.transition.set !== frame.set);

/** how many frames either way an avoiding camera eases over */
const easeReach = ({ scene }: Film): number => Math.max(1, Math.round(EASE_SECONDS * scene.fps));

/** the spans a camera is drawn in over, each with the least share it keeps */
const avoidedOf = (film: Film, shares: ReadonlyArray<number>): ReadonlyArray<Avoided> => {
  const spans: Array<{ from: number; to: number; kept: number; frame: number; }> = [];
  shares.forEach((share, index) => {
    if(share >= KEPT) return;
    const last = spans[spans.length - 1];
    if(last && (last.frame === (index - 1))) { [last.to, last.frame, last.kept] = [frameEnd(film, index), index, Math.min(last.kept, share)]; return; }
    spans.push({ from: film.frames[index].time, to: frameEnd(film, index), kept: share, frame: index });
  });
  return spans.map(({ frame: _last, ...span }) => span);
};

/** a camera drawn in to a share of its distance to its target */
const drawnIn = (camera: StageCamera, share: number): StageCamera => {
  if(share >= KEPT) return camera;
  const { position, target } = camera;
  const along = (from: number, to: number) => to + ((from - to) * share);
  return { ...camera, position: { x: along(position.x, target.x), z: along(position.z, target.z), height: along(position.height, target.height) } };
};

/** how far a camera stands from its target (studs, its heights' plates read as studs:
 *  only whether it is any matters) */
const distanceOf = ({ position, target }: StageCamera): number => Math.hypot(position.x - target.x, position.z - target.z, position.height - target.height);
const isClear = (finding: PartFinding | undefined): boolean => (finding !== undefined) && !finding.inside && !finding.hidden;
/** a share to the thousandth, so an eased share keys the same answer each time */
const roundShare = (share: number): number => Math.round(share * 1000) / 1000;
const keyOf = (track: number, frame: number, share: number): string => `${track}:${frame}:${share}`;

// == Bodies ======================================================================
/** the film with each figure's body held against the set's parts at each frame it is in
 *  the air: its lowest point over what is under it (on its set's `surfaces`) past
 *  film.ts FLOATING, or flying (SEE: review.ts flying). Its body's points (SEE: BODY),
 *  turned as it stands, are asked of the probe set by set; the part holding most of
 *  them is written on its feet with the points in it and how deep the deepest is, its
 *  least way out of the part (SEE: wayOut). Over a keyed flight (a path keying its
 *  height), each part whose top rises above both the surface under its takeoff and the
 *  one under its landing is held against the body too: the body's least clearance over
 *  that part's top (studs, below 0 through it), each point's part read from the ground
 *  under it (`groundProbe`) or, within the part, from its way out, with the point
 *  setting it (SEE: film.ts Feet `through`, `clearance`). Only `figures` are held so,
 *  never one riding, each turned about its hips over its lowest point (SEE:
 *  brick-shared/rise.ts hipsOver, measured from `bottoms`) */
export const bodiesThrough = async (film: Film, figures: ReadonlySet<string>, bottoms: PoseBottoms | undefined, surfaces: (set: string | undefined) => SurfaceAt, probe: Probe, groundProbe: GroundProbe): Promise<Film> => {
  const riders = new Set(film.scene.actors.filter(actor => actor.ride).map(actor => actor.name));
  const aloft = (frame: FilmFrame, index: number, shot: Shot) => (lowestAbove({ ...shot.position, yaw: shot.turn.yaw }, surfaces(frame.set)) > FLOATING) || flying(film, shot.name, index);
  const floors = new Map<Span, number | undefined>();
  const bodies = film.frames.flatMap((frame, index) => frame.actors.filter(shot => figures.has(shot.name) && !riders.has(shot.name) && aloft(frame, index, shot)).map(shot => {
    const flight = pathAt(film, shot.name, frame.time, ['height']);
    if(flight && !floors.has(flight)) floors.set(flight, floorOf(film, surfaces, shot.name, flight));
    const floor = flight && floors.get(flight);
    return { index, set: frame.set, shot, points: bodyOf(shot, bottoms), ...((floor !== undefined) ? { floor } : {}) };
  }));

  // each point's part, and for each point in one its least way out
  const named = await partsAt(probe, bodies.flatMap(({ set, points }) => points.map(point => ({ set, point }))));
  const partOf = (body: number, point: number) => named[(body * BODY.length) + point];
  const inside = bodies.flatMap((body, at) => body.points.flatMap((point, index) => { const part = partOf(at, index); return (part !== null) ? [{ body: at, index, point, part }] : []; }));
  const outs = await partsAt(probe, inside.flatMap(({ point }, at) => wayOutCells(point).map(cell => ({ set: bodies[inside[at].body].set, point: cell.point }))));
  const ways = inside.map((each, at) => wayOut(each.point, each.part, outs.slice(at * WAY_OUT_ASKS, (at + 1) * WAY_OUT_ASKS)));

  // over a keyed flight, the top of the part under each point not in one, above its floor
  const over = bodies.flatMap((body, at) => (body.floor === undefined) ? [] : body.points.flatMap((point, index) => (partOf(at, index) === null) ? [{ body: at, index, point }] : []));
  const tops = await topsAt(groundProbe, over.map(({ body, point }) => ({ set: bodies[body].set, point })));
  const crossed = over.flatMap((each, at) => {
    const floor = bodies[each.body].floor!, top = Math.max(-Infinity, ...tops[at].filter(height => (height <= (each.point.height + TOUCHING)) && (height > (floor + TOUCHING))));
    return Number.isFinite(top) ? [{ ...each, top }] : [];
  });
  const crossedParts = await partsAt(probe, crossed.map(({ body, point, top }) => ({ set: bodies[body].set, point: { ...point, height: top - 0.5 } })));

  const feet = new Map<number, Record<string, Feet>>();
  const write = (index: number, name: string, wrong: Feet) => feet.set(index, { ...feet.get(index), [name]: { ...feet.get(index)?.[name], ...wrong } });
  bodies.forEach((body, at) => {
    const own = inside.map((each, which) => ({ ...each, way: ways[which] })).filter(each => each.body === at);
    const counted = [...new Set(own.map(each => each.part))].map(part => own.filter(each => each.part === part)).sort((a, b) => b.length - a.length)[0];
    if(counted) write(body.index, body.shot.name, { through: { part: counted[0].part, points: counted.map(each => BODY[each.index].name), depth: Math.max(...counted.map(each => each.way.depth)) } });
    if(body.floor === undefined) return/*not a keyed flight*/;
    const clearances = [
      ...own.filter(each => each.way.top > (body.floor! + TOUCHING)).map(each => ({ part: each.part, studs: (each.point.height - each.way.top) * STUDS_PER_PLATE, point: BODY[each.index].name })),
      ...crossed.flatMap((each, which) => ((each.body === at) && (crossedParts[which] !== null)) ? [{ part: crossedParts[which]!, studs: (each.point.height - each.top) * STUDS_PER_PLATE, point: BODY[each.index].name }] : []),
    ].sort((a, b) => a.studs - b.studs);
    if(clearances.length > 0) write(body.index, body.shot.name, { clearance: clearances[0] });
  });
  return { ...film, frames: film.frames.map((frame, index) => {
    const found = feet.get(index);
    if(!found) return frame;
    return { ...frame, feet: { ...frame.feet, ...Object.fromEntries(Object.entries(found).map(([name, wrong]) => [name, { ...frame.feet?.[name], ...wrong }])) } };
  }) };
};

/** the film with the part the ground stands each figure on named on its feet (`on`) at
 *  each frame its footing goes wrong standing over the baseplate (SEE: film.ts Feet
 *  `ground`): the part whose top is that level, asked of the probe half a plate under it
 *  across the figure's footprint (as the stage sized it, turned as it stands), the
 *  nearest its middle first. Where none is found its feet name none */
export const groundedOn = async (film: Film, sizes: Readonly<Record<string, Size>>, probe: Probe): Promise<Film> => {
  const standing = film.frames.flatMap((frame, index) => Object.entries(frame.feet ?? {}).flatMap(([name, feet]) => {
    const shot = frame.actors.find(each => each.name === name);
    return ((feet.ground !== undefined) && (feet.ground > TOUCHING) && shot && Object.hasOwn(sizes, name)) ? [{ index, set: frame.set, name, points: footprintAt(shot, sizes[name], feet.ground - 0.5) }] : [];
  }));
  const named = await partsAt(probe, standing.flatMap(({ set, points }) => points.map(point => ({ set, point }))));
  let at = 0;
  const on = new Map<number, Record<string, string>>();
  for(const { index, name, points } of standing) {
    const part = named.slice(at, at + points.length).find(found => found !== null);
    at += points.length;
    if(part) on.set(index, { ...on.get(index), [name]: part });
  }
  return { ...film, frames: film.frames.map((frame, index) => {
    const found = on.get(index);
    return found ? { ...frame, feet: Object.fromEntries(Object.entries(frame.feet!).map(([name, feet]) => [name, (found[name] !== undefined) ? { ...feet, on: found[name] } : feet])) } : frame;
  }) };
};

/** the points across a figure's footprint at a height (plates), FOOTPRINT_STEP apart and
 *  turned as it stands, the nearest its middle first */
const footprintAt = (shot: Shot, size: Size, height: number): ReadonlyArray<Point> => {
  const angle = shot.turn.yaw * (Math.PI / 180);
  const along = (extent: number) => Array.from({ length: (2 * Math.floor((extent / 2) / FOOTPRINT_STEP)) + 1 }, (_, k) => (k - Math.floor((extent / 2) / FOOTPRINT_STEP)) * FOOTPRINT_STEP);
  return along(size.width).flatMap(across => along(size.depth).map(ahead => [across, ahead] as const))
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
    .map(([across, ahead]) => ({ x: shot.position.x + (across * Math.cos(angle)) + (ahead * Math.sin(angle)), z: shot.position.z - (across * Math.sin(angle)) + (ahead * Math.cos(angle)), height }));
};

/** a figure's body's points where it stands, posed as the rig poses it (SEE:
 *  bodyPointAt) and turned about its hips as it is: its hips at its x and z, over its
 *  lowest point turned (measured from `bottoms`: SEE brick-shared/rise.ts hipsOver) */
const bodyOf = (shot: Shot, bottoms: PoseBottoms | undefined): ReadonlyArray<Point> => {
  const matrix = rotation(shot.turn);
  const hips = { ...shot.position, height: shot.position.height + hipsOver(bottoms, shot.pose, shot.turn) };
  return BODY.map(({ at }) => { const posed = bodyPointAt(at, shot.pose); return pointIn(hips, matrix, { ...posed, height: posed.height - HIPS }); });
};

/** a body point (unturned, SEE: BODY) as a pose moves it, as Brick Studio's rig turns
 *  the pieces about it: its torso twisted on its hips about the vertical through its
 *  middle (clockwise seen from above), then torso and hips leaning forward together
 *  about its legs' axle, the hips' point (HIPS; its top toward its front, -z) */
const bodyPointAt = (at: Point, pose: Shot['pose']): Point => {
  const [twist, lean] = [pose?.twist ?? 0, pose?.lean ?? 0].map(degrees => degrees * (Math.PI / 180));
  const x = (at.x * Math.cos(twist)) + (at.z * Math.sin(twist)), z = (at.z * Math.cos(twist)) - (at.x * Math.sin(twist));
  const up = (at.height - HIPS) * STUDS_PER_PLATE/*studs over the axle*/;
  return { x, z: (z * Math.cos(lean)) - (up * Math.sin(lean)), height: HIPS + (((z * Math.sin(lean)) + (up * Math.cos(lean))) / STUDS_PER_PLATE) };
};

/** the floor of a keyed flight (plates): the higher of the surfaces under the figure as
 *  its path starts and as it ends; none when it is unseen at either */
const floorOf = (film: Film, surfaces: (set: string | undefined) => SurfaceAt, name: string, flight: Span): number | undefined => {
  const under = (index: number) => {
    const frame = film.frames[index], shot = frame?.actors.find(each => each.name === name);
    return shot && surfaceUnder({ ...shot.position, yaw: shot.turn.yaw }, surfaces(frame.set));
  };
  const first = film.frames.findIndex(frame => (frame.time * film.scene.fps) >= (flight.from - TOUCHING));
  const next = film.frames.findIndex(frame => (frame.time * film.scene.fps) > (flight.to + TOUCHING));
  const [takeoff, landing] = [under(first), under(((next < 0) ? film.frames.length : next) - 1)];
  return ((takeoff === undefined) || (landing === undefined)) ? undefined : Math.max(takeoff, landing);
};

// .. Way Out .....................................................................
/** a point's least way out of the part it stands in: up and down (plates), east,
 *  west, north and south (studs), each followed a cell at a time up to WAY_OUT cells;
 *  how deep it is (studs, the least of them; at least the nearest of the farthest
 *  cells followed when none leaves the part) and the part's top over it (plates; at
 *  least the farthest followed when the way up never leaves it) */
const wayOut = (point: Point, part: string, found: ReadonlyArray<string | null>): Readonly<{ depth: number; top: number; }> => {
  const out = WAYS.map((way, at) => {
    const cells = Array.from({ length: WAY_OUT }, (_, k) => cellAlong(point, way, k + 1));
    const leaving = cells.findIndex((_, k) => found[(at * WAY_OUT) + k] !== part);
    const scale = (way.axis === 'height') ? STUDS_PER_PLATE : 1;
    return { way, studs: cells[(leaving < 0) ? (WAY_OUT - 1) : leaving].distance * scale, left: leaving >= 0, plates: cells[(leaving < 0) ? (WAY_OUT - 1) : leaving].distance };
  });
  const left = out.filter(each => each.left);
  const up = out.find(each => (each.way.axis === 'height') && (each.way.sign > 0))!;
  return { depth: Math.min(...((left.length > 0) ? left : out).map(each => each.studs)), top: point.height + up.plates };
};

/** the cells a point's ways out cross, way by way and nearest first (SEE: WAYS) */
const wayOutCells = (point: Point): ReadonlyArray<Readonly<{ point: Point; distance: number; }>> =>
  WAYS.flatMap(way => Array.from({ length: WAY_OUT }, (_, k) => cellAlong(point, way, k + 1)));

/** the `k`th cell from a point's own along a way out: its middle, and how far the point
 *  lies from that cell's near side (in the way's units) */
const cellAlong = (point: Point, way: Way, k: number): Readonly<{ point: Point; distance: number; }> => {
  const at = point[way.axis], own = Math.floor(at);
  const side = (way.sign > 0) ? (own + k) : (own - (k - 1));
  return { point: { ...point, [way.axis]: side + (way.sign * 0.5) }, distance: Math.abs(side - at) };
};

// .. Probe .......................................................................
/** what the probe names at each point, each asked on its own set, a batch at a time */
const partsAt = async (probe: Probe, asked: ReadonlyArray<Readonly<{ set: string | undefined; point: Point; }>>): Promise<ReadonlyArray<string | null>> => {
  const found: Array<string | null> = asked.map(() => null);
  for(const [set, indices] of bySet(asked)) {
    for(let from=0; from<indices.length; from+=PROBE_BATCH) {
      const batch = indices.slice(from, from + PROBE_BATCH);
      const answer = await probe(set, batch.map(index => asked[index].point), []);
      batch.forEach((index, at) => { found[index] = answer.points[at]; });
    }
  }
  return found;
};

/** the tops of the cells over each point's column (plates), each asked on its own set
 *  under a footprint a hair across, a batch at a time */
const topsAt = async (probe: GroundProbe, asked: ReadonlyArray<Readonly<{ set: string | undefined; point: Point; }>>): Promise<ReadonlyArray<ReadonlyArray<number>>> => {
  const found: Array<ReadonlyArray<number>> = asked.map(() => []);
  for(const [set, indices] of bySet(asked)) {
    for(let from=0; from<indices.length; from+=PROBE_BATCH) {
      const batch = indices.slice(from, from + PROBE_BATCH);
      const answer = await probe(set, batch.map(index => ({ x: asked[index].point.x, z: asked[index].point.z, width: COLUMN_HAIR, depth: COLUMN_HAIR, yaw: 0 })));
      batch.forEach((index, at) => { found[index] = answer[at]; });
    }
  }
  return found;
};

/** each set's asks, by their indices */
const bySet = (asked: ReadonlyArray<Readonly<{ set: string | undefined; }>>): ReadonlyMap<string | undefined, ReadonlyArray<number>> => {
  const sets = new Map<string | undefined, number[]>();
  asked.forEach((each, index) => { const listed = sets.get(each.set) ?? []; listed.push(index); sets.set(each.set, listed); });
  return sets;
};
