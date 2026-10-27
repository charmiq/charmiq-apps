import { channelAt, frameEnd, keyInForce, shotAt, shotFrames, tiltOf, type CameraShot, type Feet, type Film, type FilmFrame, type ShotFrames } from './film';
import { inBox, isSized, pointGap, rideChain, rideRoot, segmentEnters, tallOf, type Box, type Size } from './measure';
import type { Key, Point, Recorded, RecordedActor, RecordedCamera, Span } from './recorder';
import { boxOnScreen, viewAngle, type ScreenBox } from './screen';

// the film reviewed as it looks, for a Charm that sees stills and never playback: what
// each frame's camera sees (every actor's box on the screen), where the camera goes
// wrong (inside a part or an actor, or one between it and its target; the actor at a
// point it aims at, its own subject, before that point apart), where an actor pops into
// or out of the picture within a shot, and every cut read as an editor reads it. A
// frame's subject is the actor its camera aims at, else the actor filling most of the
// screen. A cut is the camera's cut between two shots a
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
// -- Camera ----------------------------------------------------------------------
/** a copy's name as Brick Studio names it (SEE: its check.ts describeCopy): its
 *  component and place across, then its level and any rotation */
const COPY_PLACE = /^(.+ at x -?[\d.]+ z -?[\d.]+) level -?[\d.]+(?: rotation -?[\d.]+)?$/u;

// -- Footing ---------------------------------------------------------------------
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
/** how fast a figure moves over the ground (studs a second) over FLIGHT_WINDOW either
 *  side of a frame to travel there: past the boil's shift and an idle's sway, short of
 *  any walk */
const TRAVELING = 1;
/** how far a path's or a key's pitch, roll or lean tilts a figure before it is named as
 *  what tips the figure (degrees): past an idle's weight shift, a degree or so */
const TILTING = 10;
/** each channel that tips a figure (SEE: TiltChannel) and the value its keys name */
const TILT_CHANNELS: ReadonlyArray<readonly [TiltChannel, string]> = [['pitch', 'pitch'], ['roll', 'roll'], ['lean', 'pose.lean']];

// -- Cuts ------------------------------------------------------------------------
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
// -- Camera ----------------------------------------------------------------------
/** what the studio's probe answered for a frame: the part its camera stands inside,
 *  and the first part between its camera and its target */
export type PartFinding = Readonly<{ inside?: string; hidden?: string; }>;
/** a span (seconds) the camera stands inside something (`inside`), something hides its
 *  target from it (`hidden`), or the actor standing at the point it aims at stands
 *  before that point (`own`: the shot's own subject, never a blocked picture; SEE:
 *  standingAt): a part as the probe names it, or an actor by name (`cause` says which) */
export type CameraProblem = Readonly<{ from: number; to: number; kind: CameraKind; by: string; cause: CameraCause; }>;
/** how a camera problem stands (SEE: CameraProblem) */
export type CameraKind = 'inside' | 'hidden' | 'own';
/** what a camera problem's `by` names: a part of the set or an actor */
export type CameraCause = 'part' | 'actor';
/** a shot's camera problems of one kind, each caused by one owner (SEE: ownerOf), in
 *  the film's order: what stands in the way by its short name and the problems */
export type CameraGroup = Readonly<{ shot: CameraShot; kind: CameraKind; by: string; problems: ReadonlyArray<CameraProblem>; }>;

// -- Footing ---------------------------------------------------------------------
/** a span (seconds) a figure's feet stand in the set (`into`), as it steps out over
 *  nothing (`above`), or as it stands, sits or poses its lowest point over what is under
 *  it (`floating`), the most they reach (studs); a figure tipped past upright as its
 *  walk lays its steps or as it travels along the ground off one (`tipped`), the most it
 *  tilts (degrees); a figure's body in a part of the set while it is in the air
 *  (`through`, the part named as the probe names it), how deep its deepest point goes
 *  at most (studs: its least way out of the part, up, down or across) with the body's
 *  points in it then (`points`). As the span starts: where it stands (`at`, its height
 *  its lowest point in plates over the baseplate), the top (plates) of the part its feet
 *  are in or of what is under them, the part the ground it follows stands it on (`on`),
 *  and what places its feet with the scene's lines that do (SEE: FootingBy) with the
 *  height keys easing then; tipped, what tips it instead (SEE: tiltedBy), the keys held
 *  over it and the moment to key it upright at (SEE: uprightAt), so a key upright then
 *  holds in their place */
export type FootingProblem = Readonly<{
  actor: string; from: number; to: number; kind: FootingKind; most: number; at: Point; surface?: number; on?: string; part?: string; points?: ReadonlyArray<string>;
  by: FootingBy; lines: ReadonlyArray<number>; keys?: ReadonlyArray<HeightKey>; tilts?: ReadonlyArray<TiltKey>; heldBack?: ReadonlyArray<HeldBack>; upright?: number;
}>;
/** a keyed flight (a path keying a figure's height) over a part it crosses: the span
 *  (seconds) its body is over the part's column, the least its body clears the part's
 *  top by (`margin`, studs, below 0 through it) with the moment it is least (`time`, its
 *  first frame so) and the body's point setting it then (`point`; SEE: clearance.ts
 *  BODY), whether it clears it, and the path's line. A fact of the film; one not
 *  clearing its part is also a problem (`short`) */
export type Clearance = Readonly<{ actor: string; from: number; to: number; part: string; margin: number; time: number; point: string; cleared: boolean; lines: ReadonlyArray<number>; }>;
/** a height key a figure's feet ease from or to: its time (seconds) and height (plates) */
export type HeightKey = Readonly<{ time: number; height: number; }>;
/** a figure's channel that tips it: its pitch and roll, and its pose's lean (SEE:
 *  film.ts tiltOf) */
export type TiltChannel = 'pitch' | 'roll' | 'lean';
/** a pitch, roll or lean key tipping a figure: its time (seconds), its channel and its
 *  value (degrees) */
export type TiltKey = Readonly<{ time: number; channel: TiltChannel; value: number; }>;
/** a channel's key held over a figure's moves from outside them (its time, seconds):
 *  its first key held back to the film's start from its later time, or its last, keyed
 *  before the walk it tips, held on through it (a crouch's lean never keyed back); its
 *  channel and line */
export type HeldBack = Readonly<{ time: number; channel: TiltChannel; line?: number; }>;
/** how a figure's footing goes wrong (SEE: FootingProblem) */
export type FootingKind = 'into' | 'above' | 'floating' | 'tipped' | 'through';
/** what places a figure's feet: its walk (its line; off the ground, the height keys
 *  easing as it starts, whose height it holds), a path keying its height (the path's
 *  line), or its keys (the lines of the height keys it eases between, or the one it
 *  holds) */
export type FootingBy = 'walk' | 'path' | 'keys';

// -- Pops ------------------------------------------------------------------------
/** how an actor pops: shown where the frame before hid it, or hidden where the frame
 *  before showed it */
export type PopChange = 'appears' | 'vanishes';
/** an actor appearing or vanishing in the picture within one shot: the first frame
 *  showing the change (its index, and its time in seconds), its shot, where the actor
 *  stands shown (`at`: in the frame it appears in, or the last before it vanishes) and
 *  the scene's line keying the change (SEE: popLines) */
export type Pop = Readonly<{ actor: string; change: PopChange; frame: number; time: number; shot: CameraShot; at: Point; lines: ReadonlyArray<number>; }>;

// -- Cuts ------------------------------------------------------------------------
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
// -- Keys in Force ---------------------------------------------------------------
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

// -- Problems --------------------------------------------------------------------
/** where the camera goes wrong over the film: inside a part (as the probe found), else
 *  inside an actor, else a part hiding its target (as the probe found), else an actor
 *  hiding it, else its own subject before the point it aims at; each as a span of the
 *  frames it holds over */
export const cameraProblems = (film: Film, sizes: Readonly<Record<string, Size>>, parts: ReadonlyArray<PartFinding | undefined>): ReadonlyArray<CameraProblem> => {
  const spans: Array<{ from: number; to: number; kind: CameraKind; by: string; cause: CameraCause; frame: number; }> = [];
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

/** what is wrong with a frame's camera, the worst first. Its subject is the actor it
 *  aims at, else the actor standing at the point it aims at (SEE: standingAt); an
 *  actor in the way riding with neither hides its target, and one riding with the
 *  subject at a point stands as its own (an actor aimed at never counts) */
const problemAt = (film: Film, sizes: Readonly<Record<string, Size>>, frame: FilmFrame, parts: PartFinding | undefined): Readonly<{ kind: CameraKind; by: string; cause: CameraCause; }> | undefined => {
  if(parts?.inside) return { kind: 'inside', by: parts.inside, cause: 'part' };
  const { position, target } = frame.camera;
  const boxes = boxesAt(film, sizes, frame);
  const inside = boxes.find(([, box]) => inBox(box, position));
  if(inside) return { kind: 'inside', by: inside[0], cause: 'actor' };
  if(parts?.hidden) return { kind: 'hidden', by: parts.hidden, cause: 'part' };
  const aimed = subjectAt(film.scene, frame.time);
  const subject = aimed ?? standingAt(boxes, target);
  const together = subject && film.scene.actors.find(actor => actor.name === subject);
  const root = together ? rideRoot(film.scene.actors, together) : undefined;
  const withSubject = (name: string) => (name === subject) || ((root !== undefined) && (rideRoot(film.scene.actors, film.scene.actors.find(actor => actor.name === name)!) === root));
  const entering = boxes
    .flatMap(([name, box]) => { const at = segmentEnters(box, position, target); return ((at !== undefined) && (at < 1)) ? [[name, at] as const] : []; })
    .sort((a, b) => a[1] - b[1]);
  const hiding = entering.find(([name]) => !withSubject(name));
  if(hiding) return { kind: 'hidden', by: hiding[0], cause: 'actor' };
  return ((aimed === undefined) && (entering.length > 0)) ? { kind: 'own', by: entering[0][0], cause: 'actor' } : undefined;
};

/** the actor standing at a point a camera aims at: the one whose box lies nearest it,
 *  within its own height of it (a jumper beside the bar his camera aims at, a
 *  medallist on the step it aims at); none farther */
const standingAt = (boxes: ReadonlyArray<readonly [string, Box]>, point: Point): string | undefined => {
  const [nearest] = boxes.map(([name, box]) => [name, pointGap(box, point), tallOf(box)] as const).sort((a, b) => a[1] - b[1]);
  return (nearest && (nearest[1] <= nearest[2])) ? nearest[0] : undefined;
};

// -- Groups ----------------------------------------------------------------------
/** the camera problems of each shot, grouped by kind and by what stands in the way
 *  (SEE: ownerOf): the figures of one stand sweeping a camera a frame or a few at a
 *  time, one group; each problem in exactly one, the groups in the order each starts */
export const cameraGroups = (shots: ReadonlyArray<CameraShot>, problems: ReadonlyArray<CameraProblem>): ReadonlyArray<CameraGroup> => {
  const groups: Array<{ shot: CameraShot; kind: CameraKind; owner: string; by: string; problems: CameraProblem[]; }> = [];
  for(const problem of problems) {
    const shot = shotAt(shots, problem.from) ?? shots[0]/*a film's first shot starts at 0*/;
    const { owner, name } = ownerOf(problem);
    const group = groups.find(each => (each.shot === shot) && (each.kind === problem.kind) && (each.owner === owner));
    if(group) group.problems.push(problem);
    else groups.push({ shot, kind: problem.kind, owner, by: name, problems: [problem] });
  }
  return groups.map(({ owner: _owner, ...group }) => group);
};

/** what owns the cause of a camera problem, and its short name: an actor itself; a part
 *  inside a component the component's copy (SEE: Brick Studio's check.ts describeIn: a
 *  placement, ` in `, the copy or the line placing it), short as its component and its
 *  place across (`stand-full at x 38 z -15`); any other part itself, by its own name */
const ownerOf = ({ by, cause }: CameraProblem): Readonly<{ owner: string; name: string; }> => {
  const within = (cause === 'part') ? by.indexOf(' in ') : -1/*an actor's name is its own*/;
  if(within < 0) return { owner: by, name: by };
  const owner = by.slice(within + ' in '.length);
  return { owner, name: COPY_PLACE.exec(owner)?.[1] ?? owner/*a line placing it, named whole*/ };
};

// == Footing =====================================================================
// -- Problems and Clearances -----------------------------------------------------
/** where each figure's footing goes wrong, as the film staged on the set's surfaces
 *  measures it (SEE: film.ts Feet): its feet in the set (a walk through a landing), out
 *  over nothing (off a gallery's edge), resting in the air (a sitter over its seat),
 *  tipped as it moves (a walker lying on its back), or its body through a part in the
 *  air (a keyed flight through a bar). Each a span of the frames it holds over (a
 *  body's for each part), a pause between steps within it, and the most it reaches:
 *  feet in the set only where they go a plate deep (a toe brushing a tread's edge is a
 *  walk's own), a figure in the air only held there a second and never while it flies
 *  (SEE: flying), a figure tipped only while its walk lays its steps or it travels along
 *  the ground off one (one lying still, asleep or fallen, is the scene's own).
 *  A film made without the set's surfaces measures none */
export const footingProblems = (film: Film): ReadonlyArray<FootingProblem> => {
  const problems = footingSpans(film).flatMap(span => isFooting(span) ? [span] : [])
    .filter(span => (span.kind === 'above') || (span.kind === 'tipped') || (span.kind === 'through') || ((span.kind === 'into') && (span.most >= FOOTING_DEEP)) || ((span.kind === 'floating') && ((span.to - span.from) >= FLOATING_LONG)));
  return problems.map(problem => problem.heldBack ? { ...problem, upright: uprightAt(film, problems, problem) } : problem);
};

/** when a figure tipped by keys held over its moves is keyed upright to stand so (SEE:
 *  HeldBack), over every span of its tipped by the same keys (a walk on and a run-up
 *  held back by one landing key take one): held back from a later key, its last frame
 *  tipped before the earliest of them, so the upright key holds back in their place;
 *  held on from an earlier key, its first frame tipped after the latest, so the upright
 *  key holds on in its place */
const uprightAt = (film: Film, problems: ReadonlyArray<FootingProblem>, held: FootingProblem): number => {
  const keysOf = ({ heldBack }: FootingProblem) => (heldBack ?? []).map(key => `${key.channel}@${key.time}`).join();
  const spans = problems.filter(problem => (problem.actor === held.actor) && (problem.kind === 'tipped') && (keysOf(problem) === keysOf(held)));
  const back = held.heldBack!.filter(key => key.time > held.from).map(key => key.time), on = held.heldBack!.filter(key => key.time <= held.from).map(key => key.time);
  const [after, until] = [Math.max(-Infinity, ...on), Math.min(Infinity, ...back)];
  const frames = film.frames.filter(frame => (frame.time > (after + 1e-9)) && (frame.time < (until - 1e-9)) && spans.some(span => (frame.time >= (span.from - 1e-9)) && (frame.time < (span.to - 1e-9))));
  return ((back.length > 0) ? frames[frames.length - 1] : frames[0])?.time ?? held.from/*its first frame lies at the key*/;
};

/** how far each keyed flight clears each part it crosses, as the film staged on the
 *  set's parts measures it (SEE: film.ts Feet `clearance`): a span of the frames its
 *  body is over the part, a pause between steps within it, at its least, cleared or not,
 *  so a fix reads its margin before and after; in the film's order */
export const clearancesOf = (film: Film): ReadonlyArray<Clearance> =>
  footingSpans(film).flatMap(span => isFooting(span) ? [] : [{ actor: span.actor, from: span.from, to: span.to, part: span.part!, margin: span.most, time: span.least!.time, point: span.least!.point, cleared: span.most >= 0, lines: span.lines }]);

// -- Spans -----------------------------------------------------------------------
/** a footing span as it is gathered: a keyed flight's clearance (placed by its path,
 *  its line, and when and where its body is least over its part) among the footing
 *  problems */
type FootingSpan = { -readonly [K in keyof FootingProblem]: K extends 'kind' ? FootingKind | 'clearance' : FootingProblem[K] } & { least?: Readonly<{ time: number; point: string; }>; };
const isFooting = (span: FootingSpan): span is FootingSpan & FootingProblem => span.kind !== 'clearance';

/** every span a figure's feet or body go wrong over, unfiltered, and every keyed
 *  flight's clearance over each part it crosses: each kind's (and each part's) frames
 *  within FOOTING_GAP of each other one span, at its most (a clearance at its least) */
const footingSpans = (film: Film): ReadonlyArray<FootingSpan> => {
  const spans: FootingSpan[] = [];
  film.frames.forEach((frame, index) => {
    for(const [actor, feet] of Object.entries(frame.feet ?? {})) {
      for(const { kind, reach, part, points, point } of wrongAt(film, actor, index, feet)) {
        const open = spans.find(span => (span.actor === actor) && (span.kind === kind) && (span.part === part) && ((frame.time - span.to) <= FOOTING_GAP));
        const worse = open && ((kind === 'clearance') ? (reach < open.most) : (reach > open.most))/*a clearance at its least, the rest at their most*/;
        if(open) { open.to = frameEnd(film, index); if(worse) { open.most = reach; if(points) open.points = points; if(point !== undefined) open.least = { time: frame.time, point }; } continue; }
        const at = frame.actors.find(shot => shot.name === actor)!.position;
        const by = (kind === 'clearance') ? { by: 'path' as const, lines: linesOf([pathAt(film, actor, frame.time, ['height']) ?? {}]) }/*its flight*/ : (kind === 'tipped') ? tiltedBy(film, actor, frame.time) : placedBy(film, actor, frame.time);
        spans.push({ actor, from: frame.time, to: frameEnd(film, index), kind, most: reach, at, ...((feet.surface !== undefined) ? { surface: feet.surface } : {}), ...((feet.on !== undefined) ? { on: feet.on } : {}), ...((part !== undefined) ? { part } : {}), ...(points ? { points } : {}), ...((point !== undefined) ? { least: { time: frame.time, point } } : {}), ...by });
      }
    }
  });
  return spans;
};

/** how a figure's footing goes wrong at a frame, as its feet there measure it (SEE:
 *  film.ts Feet), each way with how far it reaches and a body's part: resting in the air
 *  never while it flies, tipped only while its walk lays its steps or it travels on the
 *  ground (neither resting in the air nor flying); and a keyed flight's clearance with
 *  the body's point setting it */
const wrongAt = (film: Film, actor: string, index: number, feet: Feet): ReadonlyArray<Readonly<{ kind: FootingKind | 'clearance'; reach: number; part?: string; points?: ReadonlyArray<string>; point?: string; }>> => {
  const walking = film.frames[index].steps?.[actor] !== undefined;
  const aloft = (feet.floating !== undefined) || flying(film, actor, index);
  return [
    ...((feet.into !== undefined) ? [{ kind: 'into' as const, reach: feet.into }] : []),
    ...((feet.above !== undefined) ? [{ kind: 'above' as const, reach: feet.above }] : []),
    ...(((feet.floating !== undefined) && !flying(film, actor, index)) ? [{ kind: 'floating' as const, reach: feet.floating }] : []),
    ...(((feet.tipped !== undefined) && (walking || (!aloft && traveling(film, actor, index)))) ? [{ kind: 'tipped' as const, reach: feet.tipped }] : []),
    ...(feet.through ? [{ kind: 'through' as const, reach: feet.through.depth, part: feet.through.part, points: feet.through.points }] : []),
    ...(feet.clearance ? [{ kind: 'clearance' as const, reach: feet.clearance.studs, part: feet.clearance.part, point: feet.clearance.point }] : []),
  ];
};

// -- Flying and Traveling --------------------------------------------------------
/** whether an actor is flying at a frame: its height a frame FLIGHT_WINDOW before or
 *  after it apart from its own faster than FLIGHT_SPEED */
export const flying = (film: Film, name: string, index: number): boolean =>
  outpacing(film, name, index, (a, b) => Math.abs(a.height - b.height), FLIGHT_SPEED).some(Boolean);

/** whether an actor travels over the ground at a frame: its place a frame FLIGHT_WINDOW
 *  before and after it each apart from its own across the ground faster than TRAVELING,
 *  so a single jump in its place (a figure tipping off its studs) is no travel */
const traveling = (film: Film, name: string, index: number): boolean => {
  const sides = outpacing(film, name, index, (a, b) => Math.hypot(a.x - b.x, a.z - b.z), TRAVELING);
  return (sides.length > 0) && sides.every(Boolean);
};

/** whether an actor's place a frame FLIGHT_WINDOW before and after a frame (each the
 *  film holds it in) lies farther from its own there, as `apart` measures, than
 *  `speed` covers in the time between */
const outpacing = (film: Film, name: string, index: number, apart: (a: Point, b: Point) => number, speed: number): ReadonlyArray<boolean> => {
  const placeAt = (at: number) => film.frames[at]?.actors.find(shot => shot.name === name)?.position;
  const here = placeAt(index)!, reach = Math.max(1, Math.round(FLIGHT_WINDOW * film.scene.fps));
  return [index - reach, index + reach].flatMap(at => {
    const there = placeAt(at);
    return (there !== undefined) ? [apart(there, here) > (speed * Math.abs(film.frames[at].time - film.frames[index].time))] : [];
  });
};

// -- What Places and Tips a Figure -----------------------------------------------
/** what places an actor's feet at a time (SEE: FootingBy): a footing problem's cause,
 *  and a timeline mark's row */
export const placedBy = (film: Film, name: string, time: number): Readonly<{ by: FootingBy; lines: ReadonlyArray<number>; keys?: ReadonlyArray<HeightKey>; }> => {
  const actor = film.scene.actors.find(each => each.name === name)!;
  const heights = actor.keys.filter(key => Object.hasOwn(key.values, 'height'));
  const keysOf = (easing: ReadonlyArray<Key>) => ((easing.length > 0) ? { keys: easing.map(key => ({ time: key.time, height: key.values.height })) } : {});
  const walk = actor.walks?.find(each => (time >= each.start) && (time <= each.end));
  if(walk) return { by: 'walk', lines: linesOf([walk]), ...(actor.ground ? {} : keysOf(easingAt(heights, walk.start).keys)) }/*a walk holds the level its keys give it as it starts*/;
  const path = pathAt(film, name, time, ['height']);
  if(path) return { by: 'path', lines: linesOf([path]) };
  const easing = easingAt(heights, time).keys;
  return { by: 'keys', lines: [...new Set(linesOf(easing))], ...keysOf(easing) };
};

/** what tips an actor at a time: the paths whose pitch, roll and lean then tilt it
 *  (their lines; a walk's glide aside, which a figure on studs never takes), else the
 *  keys of each of its pitch, roll and lean that tilt it then, easing (SEE: placedBy),
 *  with their lines. Held (`heldBack`, each such key; SEE: HeldBack) where a channel's
 *  first key is the one in force and lies later, as a channel's first key holds back to
 *  the film's start (a flight's pitch keyed at its landing lies its walker down from the
 *  start), or where its last is and lies before the walk then, as a channel's last key
 *  holds on (a crouch's lean keyed before a race bends its runner the whole race) */
export const tiltedBy = (film: Film, name: string, time: number): Readonly<{ by: FootingBy; lines: ReadonlyArray<number>; tilts?: ReadonlyArray<TiltKey>; heldBack?: ReadonlyArray<HeldBack>; }> => {
  const actor = film.scene.actors.find(each => each.name === name)!;
  const at = time * film.scene.fps;
  const sampleAt = (span: Span) => span.samples[Math.max(0, Math.min(span.samples.length - 1, Math.round(at - span.from)))];
  const paths = actor.spans.filter(span => !span.glide && (at >= span.from) && (at <= span.to) && (tiltOf({ pitch: sampleAt(span).pitch ?? 0, roll: sampleAt(span).roll ?? 0 }, sampleAt(span)['pose.lean'] ?? 0) >= TILTING));
  if(paths.length > 0) return { by: 'path', lines: [...new Set(linesOf(paths))] };
  const walk = actor.walks?.find(each => (time >= each.start) && (time <= each.end));
  const easing = TILT_CHANNELS.flatMap(([channel, valued]) => {
    const keyed = actor.keys.filter(key => Object.hasOwn(key.values, valued));
    const value = channelAt(keyed, valued, time) ?? 0/*unkeyed: upright*/;
    if(tiltOf({ pitch: value, roll: 0 }) < TILTING) return []/*one channel alone tilts as a pitch would*/;
    const { keys, heldBack } = easingAt(keyed, time);
    const heldOn = !heldBack && (keys.length === 1) && !!walk && (keys[0].time < walk.start)/*its last key, keyed before the walk*/;
    return [{ channel, valued, keys, heldBack: heldBack || heldOn }];
  });
  const tilts = easing.flatMap(({ channel, valued, keys }) => keys.map(key => ({ time: key.time, channel, value: key.values[valued] })));
  const heldBack = easing.flatMap(({ channel, keys, heldBack: held }) => held ? [{ time: keys[0].time, channel, ...((keys[0].line !== undefined) ? { line: keys[0].line } : {}) }] : []);
  return { by: 'keys', lines: [...new Set(easing.flatMap(({ keys }) => linesOf(keys)))], ...((tilts.length > 0) ? { tilts } : {}), ...((heldBack.length > 0) ? { heldBack } : {}) };
};
/** the keys easing at a time, of keys sorted by time: the two either side, or the last
 *  it holds; the first alone where it lies later and holds back (`heldBack`) */
const easingAt = (keys: ReadonlyArray<Key>, time: number): Readonly<{ keys: ReadonlyArray<Key>; heldBack: boolean; }> => {
  const next = keys.findIndex(key => key.time > time);
  return { keys: (next < 0) ? keys.slice(-1) : keys.slice(Math.max(0, next - 1), next + 1), heldBack: next === 0 };
};

/** an actor's path at a time keying any of the channels named, a walk's glide aside
 *  (a figure on studs never takes it): its height's a keyed flight */
export const pathAt = (film: Film, name: string, time: number, channels: ReadonlyArray<string>): Span | undefined => {
  const at = time * film.scene.fps;
  return film.scene.actors.find(each => each.name === name)!.spans.find(span => !span.glide && (at >= span.from) && (at <= span.to) && span.channels.some(channel => channels.includes(channel)));
};

/** the scene's lines of what names one */
const linesOf = (lined: ReadonlyArray<Readonly<{ line?: number; }>>): ReadonlyArray<number> => lined.flatMap(each => (each.line !== undefined) ? [each.line] : []);

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

// == Pops ========================================================================
/** every actor appearing or vanishing in the picture within one shot (SEE: Pop):
 *  hidden in one frame of the shot and shown in the next, or shown and then hidden,
 *  any part of its box in frame where it is shown (SEE: screenAt), so a person sees it
 *  pop in or out. One shown or hidden at a cut, or out of the picture as it changes, is
 *  no pop; those the stage sized, in the film's order */
export const popsOf = (film: Film, sizes: Readonly<Record<string, Size>>): ReadonlyArray<Pop> =>
  shotFrames(film).flatMap(({ shot, first, last }) => {
    const pops: Pop[] = [];
    const shownIn = (index: number) => new Map(film.frames[index].actors.map(each => [each.name, each] as const));
    let before = shownIn(first);
    for(let index=first+1; index<=last; index++) {
      const after = shownIn(index);
      for(const name of new Set([...before.keys(), ...after.keys()])) {
        if(!isSized(sizes, name) || (before.has(name) === after.has(name))) continue;
        const appears = after.has(name), seen = appears ? index : (index - 1);
        if(!screenAt(film, sizes, seen)[name].inFrame) continue/*out of the picture as it changes*/;
        const time = film.frames[index].time;
        pops.push({ actor: name, change: appears ? 'appears' : 'vanishes', frame: index, time, shot, at: (appears ? after : before).get(name)!.position, lines: popLines(film, name, time, appears) });
      }
      before = after;
    }
    return pops;
  });

/** the scene's line keying an actor shown or hidden at a time: of the actor and each
 *  actor it rides (a rider is shown only while what it rides is), the key or path
 *  giving its own `visible` that state from the latest time */
const popLines = (film: Film, name: string, time: number, shown: boolean): ReadonlyArray<number> => {
  const actor = film.scene.actors.find(each => each.name === name)!;
  const giving = rideChain(film.scene.actors, actor).flatMap(each => { const own = visibleAt(film, each, time); return (own && (own.shown === shown)) ? [own] : []; });
  return linesOf([...giving].sort((a, b) => b.since - a.since).slice(0, 1));
};

/** an actor's own `visible` at a time and from when it holds: a path keying it (its
 *  sample then, from then), else its key in force (taken at its key, never eased: SEE
 *  film.ts channelAt); none for an actor never keying it, always shown */
const visibleAt = (film: Film, actor: RecordedActor, time: number): Readonly<{ shown: boolean; since: number; line?: number; }> | undefined => {
  const path = pathAt(film, actor.name, time, ['visible']);
  if(path) {
    const sample = path.samples[Math.max(0, Math.min(path.samples.length - 1, Math.round((time * film.scene.fps) - path.from)))];
    return { shown: (sample.visible ?? 1) >= 0.5, since: time, ...((path.line !== undefined) ? { line: path.line } : {}) };
  } /* else -- its keys alone key it */
  const key = keyInForce(actor.keys.filter(each => Object.hasOwn(each.values, 'visible')), time);
  return key && { shown: key.values.visible >= 0.5, since: key.time, ...((key.line !== undefined) ? { line: key.line } : {}) };
};

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
    if(problem && (problem.kind !== 'own'/*its own subject: no editor's flag*/)) flags.push((problem.kind === 'inside') ? `the camera is inside ${problem.by} ${label} the cut` : `${problem.by} hides the camera's target ${label} the cut`);
  }
  return flags;
};

const share = (value: number): string => `${Math.round(value * 100)}%`;
