import { frameEnd, keyInForce, shotFrames, type Film, type FilmFrame, type ShotFrames } from './film';
import { inBox, isSized, rideRoot, segmentEnters, type Box, type Size } from './measure';
import type { Recorded, RecordedCamera } from './recorder';
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

// == Types =======================================================================
/** what the studio's probe answered for a frame: the part its camera stands inside,
 *  and the first part between its camera and its target */
export type PartFinding = Readonly<{ inside?: string; hidden?: string; }>;
/** a span (seconds) the camera stands inside something, or something hides its target
 *  from it: a part, or an actor by name */
export type CameraProblem = Readonly<{ from: number; to: number; kind: 'inside' | 'hidden'; by: string; }>;
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
