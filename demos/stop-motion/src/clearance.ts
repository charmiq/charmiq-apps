import { cameraShots, isReached, type Film, type FilmFrame, type StageCamera } from './film';
import type { Point, RecordedCamera } from './recorder';
import { avoidingAt, type PartFinding } from './review';

// the film's cameras against the set's parts, as the studio's probe answers them (SEE:
// Brick Studio's probeStage): each frame's part a camera stands inside, and the first
// part between the camera and its target. Every camera is held so: the film's, and
// each view's but a plan's (a plan stands over everything). The film's camera is
// probed at every frame, for what it meets; a view's only where it avoids. A camera
// keyed `avoid: 'parts'` is drawn in along its line to its target, as little as keeps
// it clear (inside no part, its target hidden by none): each frame's farthest clear
// stop, then eased so the camera never jumps, a frame drawn in as far as any frame
// within EASE_SECONDS of it in its shot needs, less the nearer that frame is. A frame
// clear at no stop stays where it was keyed, and its problem stands
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

/** a camera over the film: its keys, its name (none for the film's), and its camera at
 *  each frame */
type Track = Readonly<{ keys: RecordedCamera; view?: string; at: (frame: FilmFrame) => StageCamera; }>;
/** a camera of a track at a frame, at a share of its distance to its target */
type Ask = Readonly<{ track: number; frame: number; share: number; }>;

// == Clearance ===================================================================
/** the film's cameras against the set's parts, each drawn in where it avoids them */
export const clearanceOf = async (film: Film, probe: Probe): Promise<Cleared> => {
  const { scene, frames } = film;
  const tracks: ReadonlyArray<Track> = [
    { keys: scene.camera, at: frame => frame.camera },
    ...scene.views.filter(view => !view.plan).map(view => ({ keys: view, view: view.name, at: (frame: FilmFrame) => frame.views[view.name] as StageCamera/*no plan*/ })),
  ];
  const avoiding = tracks.map(track => frames.map(frame => avoidingAt(track.keys, frame.time) && (distanceOf(track.at(frame)) > 0)));

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

  const cleared = frames.map((frame, index) => {
    const camera = drawnIn(frame.camera, shares[0][index]);
    const views = Object.fromEntries(Object.entries(frame.views).map(([name, view]) => {
      const track = tracks.findIndex(each => each.view === name);
      return [name, (track > 0) ? drawnIn(view as StageCamera, shares[track][index]) : view];
    }));
    return { ...frame, camera, views };
  });
  return {
    film: { scene, frames: cleared },
    parts: shares[0].map((share, frame) => found.get(keyOf(0, frame, share)) ?? {}),
    avoided: tracks.flatMap((track, index) => avoidedOf(film, shares[index]).map(span => ({ ...span, ...((track.view !== undefined) ? { view: track.view } : {}) }))),
  };
};

// == Internal ====================================================================
/** asks the probe about cameras of the tracks at shares of their distances, set by set
 *  and a batch at a time, keyed by track, frame and share */
const probeAt = async (film: Film, tracks: ReadonlyArray<Track>, probe: Probe, asked: ReadonlyArray<Ask>): Promise<ReadonlyMap<string, PartFinding>> => {
  const bySet = new Map<string | undefined, Ask[]>();
  for(const each of asked) {
    const set = film.frames[each.frame].set;
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
  const reach = Math.max(1, Math.round(EASE_SECONDS * scene.fps))/*frames*/;
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

/** the spans a camera is drawn in over, each with the least share it keeps */
const avoidedOf = (film: Film, shares: ReadonlyArray<number>): ReadonlyArray<Avoided> => {
  const spans: Array<{ from: number; to: number; kept: number; }> = [];
  const step = 1 / film.scene.fps;
  shares.forEach((share, index) => {
    if(share >= KEPT) return;
    const time = film.frames[index].time, last = spans[spans.length - 1];
    if(last && (Math.abs(last.to - time) < (step / 2))) { last.to = time + step; last.kept = Math.min(last.kept, share); return; }
    spans.push({ from: time, to: time + step, kept: share });
  });
  return spans;
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
