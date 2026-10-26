import { frameEnd, keyInForce, shotFrames, type Film, type FilmFrame, type ShotFrames } from './film';
import { inBox, isSized, rideRoot, segmentEnters, type Box, type Size } from './measure';
import type { Key, Point, Recorded, RecordedCamera } from './recorder';
import { boxOnScreen, viewAngle, type ScreenBox } from './screen';

// the film reviewed as it looks, for a Charm that sees stills and never playback: what
// each frame's camera sees (every actor's box on the screen), where the camera goes
// wrong (inside a part or an actor, or one between it and its target), and every cut
// read as an editor reads it. A frame's subject is the actor its camera aims at, else
// the actor filling most of the screen. A cut is the camera's cut between two shots a
// frame shows (a shot no frame shows is passed over): each side's frame (the last of
// the shot before, the first after), where its subject stands on the screen and which
// way it moves across the frame over that side's own shot (its own motion as that
// frame's camera sees it, so a subject the camera follows still moves), how far the
// camera turns, how long each shot runs, and what an editor would flag. The parts' answers come from the
// studio's probe (SEE: Brick Studio's probeStage); the actors' are read off their boxes
// here, as close pairs are (SEE: measure.ts), two actors riding together never hiding
// each other
// ********************************************************************************
// == Constants ===================================================================
/** a shot shorter than this (seconds) is flagged */
export const SHORT_SHOT = 1;
/** a cut turning the camera less than this (degrees) on one subject is a jump cut */
export const SMALL_ANGLE = 30;
/** a subject moving more than this share of the screen's width across a cut jumps */
const JUMP_ACROSS = 1 / 3;
/** how many frames a subject's motion is read over, either side of a cut */
const MOTION_FRAMES = 3;
/** a subject moving less than this share of the screen over MOTION_FRAMES is still */
const STILL = 0.01;
/** the longest a figure's footing goes unmeasured (seconds: a pause between its steps)
 *  and its span still runs on */
const FOOTING_GAP = 0.25;
/** how deep a figure's feet go into the set before it shows (studs: about a plate), past
 *  a walker's toe brushing a tread's edge */
const FOOTING_DEEP = 0.3;
/** how long a figure not stepping floats before it shows (seconds), past a keyed jump's
 *  takeoff and landing */
const FLOATING_LONG = 1;
/** how fast a figure in the air rises or falls (plates a second) over FLIGHT_WINDOW
 *  either side of a frame to be flying there, never resting: a jump's arc even at its
 *  top, never a height easing over a wait between far keys */
const FLIGHT_SPEED = 4;
const FLIGHT_WINDOW = 0.125/*seconds*/;

// == Types =======================================================================
/** what the studio's probe answered for a frame: the part its camera stands inside,
 *  and the first part between its camera and its target */
export type PartFinding = Readonly<{ inside?: string; hidden?: string; }>;
/** a span (seconds) the camera stands inside something, or something hides its target
 *  from it: a part, or an actor by name */
export type CameraProblem = Readonly<{ from: number; to: number; kind: 'inside' | 'hidden'; by: string; }>;
/** a span (seconds) a figure's feet stand in the set (`into`), as it steps out over
 *  nothing (`above`), or as it stands, sits or poses its lowest point over what is under
 *  it (`floating`), the most they reach (studs); as the span starts, where it stands
 *  (`at`, its height its lowest point in plates), the top (plates) of the part its feet
 *  are in or of what is under them, and what places its feet with the scene's lines
 *  that do (SEE: FootingBy) with the height keys easing then */
export type FootingProblem = Readonly<{ actor: string; from: number; to: number; kind: FootingKind; most: number; at: Point; surface?: number; by: FootingBy; lines: ReadonlyArray<number>; keys?: ReadonlyArray<HeightKey>; }>;
/** a height key a figure's feet ease from or to: its time (seconds) and height (plates) */
export type HeightKey = Readonly<{ time: number; height: number; }>;
/** how a figure's footing goes wrong (SEE: FootingProblem) */
export type FootingKind = 'into' | 'above' | 'floating';
/** what places a figure's feet: its walk (its line; off the ground, the height keys
 *  easing as it starts, whose height it holds), a path keying its height (the path's
 *  line), or its keys (the lines of the height keys it eases between, or the one it
 *  holds) */
export type FootingBy = 'walk' | 'path' | 'keys';
/** which way a subject moves on the screen over a few frames */
export type Moving = 'left' | 'right' | 'up' | 'down' | 'still';
/** a side of a cut: its frame and shot, its subject, where that stands on the screen
 *  and which way it moves there */
export type CutSide = Readonly<{ frame: number; time: number; shot?: string; subject?: string; screen?: ScreenBox; moving?: Moving; }>;
/** a cut as an editor reads it */
export type Cut = Readonly<{
  time: number;
  frame: number;
  before: CutSide;
  after: CutSide;
  /** how far the camera turns across it (degrees) */
  angle: number;
  /** how long the shot before and the shot after run (seconds) */
  shots: Readonly<{ before: number; after: number; }>;
  /** what an editor would flag, in a phrase each */
  flags: ReadonlyArray<string>;
}>;

// == Camera ======================================================================
/** the actor a frame's camera aims at: its target key in force names an actor (SEE:
 *  film.ts keyInForce) */
export const subjectAt = (scene: Recorded, time: number): string | undefined => {
  const key = keyInForce(scene.camera.keys.filter(each => each.target), time);
  return (key?.target && ('actor' in key.target)) ? key.target.actor : undefined;
};

/** whether a camera is kept out of parts at a time: its key placing it in force says
 *  so (the film's camera, or a view's) */
export const avoidingAt = (camera: RecordedCamera, time: number): boolean =>
  keyInForce(camera.keys.filter(each => each.place), time)?.avoid === 'parts';

/** where the camera goes wrong over the film: inside a part (as the probe found), else
 *  inside an actor, else a part hiding its target (as the probe found), else an actor
 *  hiding it; each as a span of the frames it holds over */
export const cameraProblems = (film: Film, sizes: Readonly<Record<string, Size>>, parts: ReadonlyArray<PartFinding | undefined>): ReadonlyArray<CameraProblem> => {
  const spans: Array<{ from: number; to: number; kind: 'inside' | 'hidden'; by: string; frame: number; }> = [];
  film.frames.forEach((frame, index) => {
    const found = problemAt(film, sizes, frame, parts[index]);
    const last = spans[spans.length - 1];
    if(!found) return;
    if(last && (last.kind === found.kind) && (last.by === found.by) && (last.frame === (index - 1))) { [last.to, last.frame] = [frameEnd(film, index), index]; return; }
    spans.push({ from: frame.time, to: frameEnd(film, index), ...found, frame: index });
  });
  return spans.map(({ frame: _last, ...span }) => span);
};

/** the camera problem standing at a frame's time, if any: its span runs from that
 *  frame's time to the next's (each read to the nanosecond, as frame times are sums) */
export const problemAtTime = (problems: ReadonlyArray<CameraProblem>, time: number): CameraProblem | undefined =>
  problems.find(each => (time >= (each.from - 1e-9)) && (time < (each.to - 1e-9)));

/** what is wrong with a frame's camera, the worst first */
const problemAt = (film: Film, sizes: Readonly<Record<string, Size>>, frame: FilmFrame, parts: PartFinding | undefined): Readonly<{ kind: 'inside' | 'hidden'; by: string; }> | undefined => {
  if(parts?.inside) return { kind: 'inside', by: parts.inside };
  const { position, target } = frame.camera;
  const boxes = boxesAt(film, sizes, frame);
  const inside = boxes.find(([, box]) => inBox(box, position));
  if(inside) return { kind: 'inside', by: inside[0] };
  if(parts?.hidden) return { kind: 'hidden', by: parts.hidden };
  const subject = subjectAt(film.scene, frame.time);
  const together = subject && film.scene.actors.find(actor => actor.name === subject);
  const root = together ? rideRoot(film.scene.actors, together) : undefined;
  const hiding = boxes
    .filter(([name]) => (name !== subject) && ((root === undefined) || (rideRoot(film.scene.actors, film.scene.actors.find(actor => actor.name === name)!) !== root)))
    .flatMap(([name, box]) => { const at = segmentEnters(box, position, target); return ((at !== undefined) && (at < 1)) ? [[name, at] as const] : []; })
    .sort((a, b) => a[1] - b[1])[0];
  return hiding ? { kind: 'hidden', by: hiding[0] } : undefined;
};

// == Footing =====================================================================
/** where each figure's feet go wrong, as the film staged on the set's surfaces
 *  measures them (SEE: film.ts Feet): in the set (a walk through a landing), out over
 *  nothing (off a gallery's edge), or resting in the air (a sitter over its seat); each
 *  a span of the frames it holds over, a pause between steps within it, and the most it
 *  reaches: feet in the set only where they go a plate deep (a toe brushing a tread's
 *  edge is a walk's own), a figure in the air only held there a second and never while
 *  it flies (SEE: flying).
 *  A film made without the set's surfaces measures none */
export const footingProblems = (film: Film): ReadonlyArray<FootingProblem> => {
  const spans: Array<{ actor: string; from: number; to: number; kind: FootingKind; most: number; at: Point; surface?: number; by: FootingBy; lines: ReadonlyArray<number>; keys?: ReadonlyArray<HeightKey>; }> = [];
  film.frames.forEach((frame, index) => {
    for(const [actor, step] of Object.entries(frame.feet ?? {})) {
      for(const kind of ['into', 'above', 'floating'] as const) {
        const reach = step[kind];
        if(reach === undefined) continue;
        if((kind === 'floating') && flying(film, actor, index)) continue;
        const open = spans.find(span => (span.actor === actor) && (span.kind === kind) && ((frame.time - span.to) <= FOOTING_GAP));
        if(open) { [open.to, open.most] = [frameEnd(film, index), Math.max(open.most, reach)]; continue; }
        const at = frame.actors.find(shot => shot.name === actor)!.position;
        spans.push({ actor, from: frame.time, to: frameEnd(film, index), kind, most: reach, at, ...((step.surface !== undefined) ? { surface: step.surface } : {}), ...placedBy(film, actor, frame.time) });
      }
    }
  });
  return spans.filter(span => (span.kind === 'above') || ((span.kind === 'into') && (span.most >= FOOTING_DEEP)) || ((span.kind === 'floating') && ((span.to - span.from) >= FLOATING_LONG)));
};

/** whether an actor is flying at a frame: its height a frame FLIGHT_WINDOW before or
 *  after it apart from its own faster than FLIGHT_SPEED */
const flying = (film: Film, name: string, index: number): boolean => {
  const heightAt = (at: number) => film.frames[at]?.actors.find(shot => shot.name === name)?.position.height;
  const here = heightAt(index)!, reach = Math.max(1, Math.round(FLIGHT_WINDOW * film.scene.fps));
  return [index - reach, index + reach].some(at => {
    const there = heightAt(at);
    return (there !== undefined) && (Math.abs(there - here) > (FLIGHT_SPEED * Math.abs(film.frames[at].time - film.frames[index].time)));
  });
};

/** what places an actor's feet at a time (SEE: FootingBy): a footing problem's cause,
 *  and a timeline mark's row */
export const placedBy = (film: Film, name: string, time: number): Readonly<{ by: FootingBy; lines: ReadonlyArray<number>; keys?: ReadonlyArray<HeightKey>; }> => {
  const actor = film.scene.actors.find(each => each.name === name)!;
  const linesOf = (lined: ReadonlyArray<Readonly<{ line?: number; }>>) => lined.flatMap(each => (each.line !== undefined) ? [each.line] : []);
  // the height keys easing at a time: the two either side, or the last it holds
  const heights = actor.keys.filter(key => Object.hasOwn(key.values, 'height'));
  const easingAt = (at: number) => { const next = heights.findIndex(key => key.time > at); return (next < 0) ? heights.slice(-1) : heights.slice(Math.max(0, next - 1), next + 1); };
  const keysOf = (easing: ReadonlyArray<Key>) => ((easing.length > 0) ? { keys: easing.map(key => ({ time: key.time, height: key.values.height })) } : {});
  const walk = actor.walks?.find(each => (time >= each.start) && (time <= each.end));
  if(walk) return { by: 'walk', lines: linesOf([walk]), ...(actor.ground ? {} : keysOf(easingAt(walk.start))) }/*a walk holds the level its keys give it as it starts*/;
  const at = time * film.scene.fps;
  const path = actor.spans.find(span => (at >= span.from) && (at <= span.to) && span.channels.includes('height'));
  if(path) return { by: 'path', lines: linesOf([path]) };
  const easing = easingAt(time);
  return { by: 'keys', lines: [...new Set(linesOf(easing))], ...keysOf(easing) };
};

// == Screen ======================================================================
/** every actor in a frame on the screen, by name: those the stage sized */
export const screenAt = (film: Film, sizes: Readonly<Record<string, Size>>, index: number): Readonly<Record<string, ScreenBox>> => {
  const frame = film.frames[index];
  const aspect = film.scene.width / film.scene.height;
  return Object.fromEntries(boxesAt(film, sizes, frame).map(([name, box]) => [name, boxOnScreen(frame.camera, aspect, box)]));
};

/** each sized actor's box in a frame */
const boxesAt = (film: Film, sizes: Readonly<Record<string, Size>>, frame: FilmFrame): ReadonlyArray<readonly [string, Box]> =>
  frame.actors.filter(shot => isSized(sizes, shot.name)).map(shot => [shot.name, { position: shot.position, yaw: shot.turn.yaw, size: sizes[shot.name] }] as const);

// == Cuts ========================================================================
/** every cut of the film, read as an editor reads it */
export const reviewCuts = (film: Film, sizes: Readonly<Record<string, Size>>, problems: ReadonlyArray<CameraProblem>): ReadonlyArray<Cut> => {
  const { frames } = film;
  const shown = shotFrames(film);
  return shown.slice(1).map((after, index) => {
    const before = shown[index];
    const [last, first] = [frames[before.last], frames[after.first]];
    const sides = [sideOf(film, sizes, before, before.last, -1), sideOf(film, sizes, after, after.first, 1)] as const;
    const angle = viewAngle(last.camera, first.camera);
    const lengths = { before: before.shot.to - before.shot.from, after: after.shot.to - after.shot.from };
    return { time: first.time, frame: after.first, before: sides[0], after: sides[1], angle, shots: lengths, flags: flagsOf(sides[0], sides[1], angle, lengths, problems, last.time, first.time) };
  });
};

/** a side of a cut: its subject on the screen and its motion over the frames of its
 *  shot on that side (`toward` -1 those before the cut, 1 those after), each of its
 *  places seen through this frame's camera; none when its shot shows one frame */
const sideOf = (film: Film, sizes: Readonly<Record<string, Size>>, shot: ShotFrames, index: number, toward: -1 | 1): CutSide => {
  const frame = film.frames[index];
  const screen = screenAt(film, sizes, index);
  const aimed = subjectAt(film.scene, frame.time);
  const subject = (aimed && screen[aimed]) ? aimed : largestOn(screen);
  const base = { frame: index, time: frame.time, ...((shot.shot.name !== undefined) ? { shot: shot.shot.name } : {}) };
  if(!subject) return base;
  const other = Math.min(shot.last, Math.max(shot.first, index + (toward * MOTION_FRAMES)));
  const aspect = film.scene.width / film.scene.height;
  const placed = boxesAt(film, sizes, film.frames[other]).find(([name]) => name === subject);
  const then = placed && boxOnScreen(frame.camera, aspect, placed[1]);
  const now = screen[subject];
  const [early, late] = (toward < 0) ? [then, now] : [now, then];
  return { ...base, subject, screen: now, ...(((other !== index) && early && late && !early.behind && !late.behind) ? { moving: movingOf(late.center.x - early.center.x, late.center.y - early.center.y) } : {}) };
};

/** the actor filling most of the screen, in frame */
const largestOn = (screen: Readonly<Record<string, ScreenBox>>): string | undefined =>
  Object.entries(screen).filter(([, box]) => box.inFrame).map(([name, box]) => [name, Math.max(0, Math.min(1, box.right) - Math.max(0, box.left)) * Math.max(0, Math.min(1, box.bottom) - Math.max(0, box.top))] as const).sort((a, b) => b[1] - a[1])[0]?.[0];

const movingOf = (dx: number, dy: number): Moving => (Math.max(Math.abs(dx), Math.abs(dy)) < STILL) ? 'still' : (Math.abs(dx) >= Math.abs(dy)) ? ((dx > 0) ? 'right' : 'left') : ((dy > 0) ? 'down' : 'up');

/** what an editor would flag at a cut */
const flagsOf = (before: CutSide, after: CutSide, angle: number, shots: Readonly<{ before: number; after: number; }>, problems: ReadonlyArray<CameraProblem>, beforeTime: number, afterTime: number): string[] => {
  const flags: string[] = [];
  const same = (before.subject !== undefined) && (before.subject === after.subject);
  const across = (moving?: Moving) => (moving === 'left') || (moving === 'right');
  if(same && across(before.moving) && across(after.moving) && (before.moving !== after.moving)) flags.push(`${before.subject} crosses the line: it moves ${before.moving} before the cut and ${after.moving} after`);
  if(same && before.screen?.inFrame && after.screen?.inFrame && (Math.abs(after.screen.center.x - before.screen.center.x) > JUMP_ACROSS)) flags.push(`${before.subject} jumps across the screen, from ${share(before.screen.center.x)} to ${share(after.screen.center.x)} of its width`);
  if(same && (angle < SMALL_ANGLE)) flags.push(`the camera turns only ${Math.round(angle)}° on ${before.subject}: a jump cut`);
  if(shots.before < SHORT_SHOT) flags.push(`the shot before runs only ${shots.before.toFixed(2)} s`);
  if(shots.after < SHORT_SHOT) flags.push(`the shot after runs only ${shots.after.toFixed(2)} s`);
  for(const [side, label] of [[before, 'before'], [after, 'after']] as const) if(side.subject && side.screen && !side.screen.inFrame) flags.push(`${side.subject} is out of frame ${label} the cut`);
  for(const [time, label] of [[beforeTime, 'before'], [afterTime, 'after']] as const) {
    const problem = problemAtTime(problems, time);
    if(problem) flags.push((problem.kind === 'inside') ? `the camera is inside ${problem.by} ${label} the cut` : `${problem.by} hides the camera's target ${label} the cut`);
  }
  return flags;
};

const share = (value: number): string => `${Math.round(value * 100)}%`;
