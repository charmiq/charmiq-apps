import { isPlatformFile } from '../../brick-shared/drive';

import { cameraShots, channelAt, filmTimeOf, frameAtTime, frameEnd, keyInForce, shotAt, shotFrames, soundEndOf, tiltOf, type CameraShot, type Feet, type Film, type FilmFrame, type ShotFrames } from './film';
import { pastRange, withinFrom, type PastRange, type RangedJoint } from './joint-range';
import { inBox, isSized, pointGap, rideChain, rideRoot, segmentEnters, tallOf, type Box, type Size } from './measure';
import { driverAt, type Driver } from './motion-read';
import type { CutOut, Key, Point, Recorded, RecordedActor, RecordedCamera, Span, TransitionShape } from './recorder';
import { boxOnScreen, viewAngle, type ScreenBox } from './screen';

// the film reviewed as it looks, for a Charm that sees stills and never playback: what
// each frame's camera sees (every actor's box on the screen), where the camera goes
// wrong (inside a part or an actor, or one between it and its target; the actor at a
// point it aims at, its own subject, before that point apart), where an actor pops into
// or out of the picture within a shot, where the scene poses a figure past a person's
// range (SEE: joint-range.ts), every cut read as an editor reads it, where a shot
// holds with nothing new (dead air), and where a cut-out jumps what a shot shows. A
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

// -- Waiting ---------------------------------------------------------------------
/** the shortest an actor stands in frame doing nothing but idle, its shot about someone
 *  else, before it is waiting (seconds): past a beat between events, short of a figure
 *  parked through someone else's turn */
export const WAITING = 3;
/** how fast a keyed value changes for its keys to move an actor (a second): studs across
 *  the ground, plates up, degrees of a turn or a joint; a slower ease (a lean of 8° over a
 *  minute) leaves it standing */
const MOVING_RATES: Readonly<Record<'across' | 'up' | 'angle', number>> = { across: 0.5, up: 1, angle: 15 };
/** how many times taller on the screen than a figure waiting the frame's subject may
 *  stand for the two to share the picture (or it the subject): a runner far behind an
 *  anchor at the desk, or a passer-by under a car the camera follows, never waits */
const UPSTAGED = 2;

// -- Dead Air --------------------------------------------------------------------
/** the shortest stretch of a shot with nothing new that is dead air (seconds): past a
 *  beat held between lines or moves, short of the opening desk's 4 s after its voice */
export const DEAD_AIR = 3.5;
/** the share of the film's loudest volume a sound plays under to be a bed under the
 *  rest: its start is new, its playing fills no time */
export const BED_SHARE = 0.5;
/** how far from where the camera aims an actor starting a move stands to be what the
 *  shot shows (studs, across the ground): a person's event, not the busy distance behind */
const FEATURED = 10;
/** how near two times (seconds), or two keyed values, are to be one */
const SAME_TIME = 1e-6;

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

// -- Poses -----------------------------------------------------------------------
/** a span (seconds) the scene poses a figure past a person's range at one joint while it
 *  is shown (SEE: sceneDrives): how far past at most (`most`, degrees), when it first
 *  goes that far (`time`) and its angle then (`value`, as its pose keys it) with the
 *  nearest a person reaches (`nearest`, in that angle's turn); what drives the joint
 *  then (`by`), with the scene's lines that do and those adding over them
 *  (SEE: motion-read.ts Driver), a walk's swing among them (`swung`); and where a key
 *  is what to change, that key (SEE: Rekey) */
export type StrainedPose = Readonly<{ actor: string; joint: RangedJoint; from: number; to: number; most: number; time: number; value: number; nearest: number; by: Driver['by']; lines: ReadonlyArray<number>; added?: ReadonlyArray<number>; swung?: true; rekey?: Rekey; }>;
/** a key that poses a figure past a person's range, and the value to key in its place:
 *  a key itself past the range, keyed the nearest a person reaches; or the later of two
 *  keys within it whose ease between crosses out of it, keyed by whole turns so the ease
 *  runs the short way within it (an arm keyed -300 then 30 swings back up over the head
 *  and down behind the back; keyed -330, the same arm, it swings down ahead). Its time
 *  (seconds), its value, the value in its place (`to`) and its line */
export type Rekey = Readonly<{ time: number; value: number; to: number; line?: number; }>;

// -- Pops ------------------------------------------------------------------------
/** how an actor pops: shown where the frame before hid it, or hidden where the frame
 *  before showed it */
export type PopChange = 'appears' | 'vanishes';
/** an actor appearing or vanishing in the picture within one shot: the first frame
 *  showing the change (its index, and its time in seconds), its shot, where the actor
 *  stands shown (`at`: in the frame it appears in, or the last before it vanishes) and
 *  the scene's line keying the change (SEE: popLines) */
export type Pop = Readonly<{ actor: string; change: PopChange; frame: number; time: number; shot: CameraShot; at: Point; lines: ReadonlyArray<number>; during?: PopDuring; }>;
/** the transition a pop in the shot it leaves happens under: its shape, its seconds, the
 *  shot it enters and when it ends, from which the shot left no longer shows */
export type PopDuring = Readonly<{ shape: TransitionShape; seconds: number; into: CameraShot; until: number; }>;

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

// -- Dead Air --------------------------------------------------------------------
/** a stretch of a shot with nothing new (SEE: deadAirOf): its shot, its span (seconds),
 *  how long the film shows it (seconds, its cut-outs cut) and what came last before it,
 *  a phrase and the scene's line making it */
export type DeadAir = Readonly<{ shot: CameraShot; from: number; to: number; seconds: number; after: Readonly<{ what: string; line?: number; }>; }>;

// -- Jumps -----------------------------------------------------------------------
/** a cut-out the film shows within one shot (SEE: jumpsOf): that shot, the cut-out, and
 *  the film's own time it lies at */
export type Jump = Readonly<{ shot: CameraShot; cut: CutOut; at: number; }>;

// -- Waiting ---------------------------------------------------------------------
/** an actor standing in frame doing nothing but idle while its shot is about someone
 *  else (SEE: waitingOf): the actor, its shot, its span (seconds) and the line of the key
 *  placing it then */
export type Waiting = Readonly<{ actor: string; shot: CameraShot; from: number; to: number; line?: number; }>;

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

// == Poses =======================================================================
/** every span the scene poses a figure past a person's range, joint by joint (SEE:
 *  film.ts FilmFrame `strained`, sceneDrives): its frames within FOOTING_GAP of each
 *  other one span, at its most; in the film's order */
export const strainedPoses = (film: Film): ReadonlyArray<StrainedPose> => {
  const spans: Array<{ actor: RecordedActor; joint: RangedJoint; from: number; to: number; worst: PastRange; time: number; value: number; }> = [];
  film.frames.forEach((frame, index) => {
    for(const [name, joints] of Object.entries(frame.strained ?? {})) {
      const actor = film.scene.actors.find(each => each.name === name)!;
      for(const [joint, past] of Object.entries(joints) as Array<[RangedJoint, PastRange]>) {
        if(!sceneDrives(film, actor, `pose.${joint}`, frame.time)) continue/*a gait's own, or its idling*/;
        const value = frame.actors.find(shot => shot.name === name)!.pose![joint]!;
        const open = spans.find(span => (span.actor === actor) && (span.joint === joint) && ((frame.time - span.to) <= FOOTING_GAP));
        if(!open) { spans.push({ actor, joint, from: frame.time, to: frameEnd(film, index), worst: past, time: frame.time, value }); continue; }
        open.to = frameEnd(film, index);
        if(past.past > open.worst.past) Object.assign(open, { worst: past, time: frame.time, value });
      }
    }
  });
  return spans.map(({ actor, joint, from, to, worst, time, value }) => {
    const { by, lines, added } = driverAt(film, actor, `pose.${joint}`, time), rekey = rekeyOf(actor, joint, time);
    const swung = actor.walks?.some(walk => (time >= walk.start) && (time <= walk.end));
    return { actor: actor.name, joint, from, to, most: worst.past, time, value, nearest: worst.nearest, by, lines, ...(added ? { added } : {}), ...(swung ? { swung: true as const } : {}), ...(rekey ? { rekey } : {}) };
  });
};

/** whether the scene drives a figure's joint at a time: its keys, or a span it writes
 *  (a path, a wobble, an idle, a walk's or a crowd's swing) setting or adding to it;
 *  never what a walk lays over any key or path (a figure's legs), or the figure's own
 *  idling, which no line writes */
const sceneDrives = (film: Film, actor: RecordedActor, channel: string, time: number): boolean => {
  const { by } = driverAt(film, actor, channel, time);
  if(by === 'keys') return true;
  if(by === 'walk') return false/*a walk lays it over any key or path*/;
  return writesAt(film, actor, channel, time)/*a path, or a span adding to it*/;
};
/** whether a span the scene writes (a path, a wobble, an idle, a walk, a crowd) sets or
 *  adds to an actor's channel at a time */
const writesAt = (film: Film, actor: RecordedActor, channel: string, time: number): boolean => {
  const at = time * film.scene.fps;
  return actor.spans.some(span => (span.line !== undefined) && (at >= span.from) && (at <= span.to) && span.channels.includes(channel));
};

/** the key to change where a joint's keys pose it past a person's range at a time (SEE:
 *  Rekey): of the keys easing then (the two either side, or the one it holds), the one
 *  past the range nearest that time, else the later of two whose ease crosses out of
 *  it; none where its keys stand within it and something over them carries it past */
const rekeyOf = (actor: RecordedActor, joint: RangedJoint, time: number): Rekey | undefined => {
  const keys = actor.keys.filter(key => Object.hasOwn(key.values, `pose.${joint}`));
  const next = keys.findIndex(key => key.time > time);
  const easing = (next < 0) ? keys.slice(-1) : keys.slice(Math.max(0, next - 1), next + 1);
  const valueOf = (key: Key) => key.values[`pose.${joint}`];
  const past = easing.flatMap(key => { const beyond = pastRange(joint, valueOf(key)); return beyond ? [{ key, to: beyond.nearest }] : []; }).sort((a, b) => Math.abs(a.key.time - time) - Math.abs(b.key.time - time))[0];
  const [from, later] = easing;
  const turned = past ? undefined : (later !== undefined) ? withinFrom(joint, valueOf(from), valueOf(later)) : undefined;
  const [key, to] = past ? [past.key, past.to] : (turned !== undefined) ? [later, turned] : [undefined, undefined];
  return key && { time: key.time, value: valueOf(key), to: to!, ...((key.line !== undefined) ? { line: key.line } : {}) };
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

// == Pops ========================================================================
/** every actor appearing or vanishing in the picture within one shot (SEE: Pop):
 *  hidden in one frame of the shot and shown in the next, or shown and then hidden,
 *  any part of its box in frame where it is shown (SEE: screenAt), so a person sees it
 *  pop in or out. Through a transition both shots show: the shot it leaves over the part
 *  of the picture it still holds (as it leaves it on the same set), the shot entering
 *  over the rest, each judged there (SEE: PicturePart). One shown or hidden at a cut in
 *  the shot entering, out of the picture as it changes, or leaving a hand or taken into
 *  one on its hand-off's frame (SEE: film.ts HandOff), is no pop; those the stage sized,
 *  in the film's order */
export const popsOf = (film: Film, sizes: Readonly<Record<string, Size>>): ReadonlyArray<Pop> => {
  const handed = new Set((film.handOffs ?? []).map(each => `${each.thing}|${each.frame}`));
  const aspect = film.scene.width / film.scene.height, shots = shotFrames(film);
  const shownIn = (index: number) => new Map(film.frames[index].actors.map(each => [each.name, each] as const));
  return shots.flatMap(({ shot, first, last }, at) => {
    const pops: Pop[] = [], left = shots[at - 1];
    for(let index=Math.max(1, first); index<=last; index++) {
      const [before, after] = [shownIn(index - 1), shownIn(index)], leaving = film.frames[index].transition;
      // the shot entering, after its cut, and the shot it leaves while it still shows
      const pictures = [
        ...((index > first) ? [{ shot, camera: undefined/*the frame's own*/, part: enteringPart(leaving), during: undefined/*the shot it shows*/ }] : []),
        ...((left && leaving && !leaving.actors && (leaving.left > 0)) ? [{ shot: left.shot, camera: leaving.camera, part: leavingPart(leaving), during: duringOf(film, shot, leaving) }] : []),
      ];
      for(const name of new Set([...before.keys(), ...after.keys()])) {
        if(!isSized(sizes, name) || (before.has(name) === after.has(name)) || handed.has(`${name}|${index}`)) continue;
        const appears = after.has(name), seen = appears ? index : (index - 1), time = film.frames[index].time;
        for(const picture of pictures) {
          const placed = picture.camera && boxesAt(film, sizes, film.frames[seen]).find(([each]) => each === name)?.[1];
          const box = picture.camera ? (placed && boxOnScreen(picture.camera, aspect, placed)) : screenAt(film, sizes, seen)[name];
          if(!box?.inFrame || !shows(picture.part, box)) continue/*out of the picture as it changes*/;
          pops.push({ actor: name, change: appears ? 'appears' : 'vanishes', frame: index, time, shot: picture.shot, at: (appears ? after : before).get(name)!.position, lines: popLines(film, name, time, appears), ...(picture.during ? { during: picture.during } : {}) });
        }
      }
    }
    return pops;
  });
};

/** the transition the shot entering `into` takes, from its cut's key: its shape, its
 *  seconds and when it ends */
const duringOf = (film: Film, into: CameraShot, leaving: NonNullable<FilmFrame['transition']>): PopDuring => {
  const seconds = film.scene.camera.keys.find(key => key.transition && (Math.abs(key.time - into.from) < SAME_TIME))?.transition?.seconds ?? 0;
  return { shape: leaving.shape, seconds, into, until: into.from + seconds };
};

/** the part of the picture a shot shows through a transition, as shares of its width
 *  (x, from the left) and height (y, from the top): the shot a wipe leaves over the part
 *  it has not yet wiped (SEE: Brick Studio's overlay), the shot entering over the rest; a
 *  dissolve, or an iris (taken whole), shows both over all of it */
type PicturePart = Readonly<{ x: readonly [number, number]; y: readonly [number, number]; }>;
const WHOLE: PicturePart = { x: [0, 1], y: [0, 1] };
const leavingPart = ({ shape, left }: NonNullable<FilmFrame['transition']>): PicturePart =>
  (shape === 'wipe-left') ? { x: [0, left], y: [0, 1] } : (shape === 'wipe-right') ? { x: [1 - left, 1], y: [0, 1] } : (shape === 'wipe-up') ? { x: [0, 1], y: [0, left] } : (shape === 'wipe-down') ? { x: [0, 1], y: [1 - left, 1] } : WHOLE;
const enteringPart = (transition: FilmFrame['transition']): PicturePart => {
  if(!transition || (transition.left <= 0)) return WHOLE;
  const { shape, left } = transition;
  return (shape === 'wipe-left') ? { x: [left, 1], y: [0, 1] } : (shape === 'wipe-right') ? { x: [0, 1 - left], y: [0, 1] } : (shape === 'wipe-up') ? { x: [0, 1], y: [left, 1] } : (shape === 'wipe-down') ? { x: [0, 1], y: [0, 1 - left] } : WHOLE;
};
/** whether a box on the screen reaches into a part of the picture */
const shows = ({ x, y }: PicturePart, box: ScreenBox): boolean => (box.right > x[0]) && (box.left < x[1]) && (box.bottom > y[0]) && (box.top < y[1]);

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

// == Dead Air ====================================================================
/** each stretch of a shot the film shows at least DEAD_AIR long (its cut-outs cut)
 *  where nothing new happens: nothing heard starting or playing over the rest (SEE:
 *  BED_SHARE), no fade under way, the camera following no walk or path of its subject
 *  (a camera move alone fills nothing), and no actor the shot shows (SEE: FEATURED)
 *  starting one (its keys moving it from rest outside its
 *  walks and paths, a walk, a path, a crowd, a face, a reaction or a hand's change; its
 *  idling never), with what came last before it; in the film's order.
 *  None while a sound heard over the rest has no known length (`lengths`, seconds by
 *  name, unless it plays until a time) */
export const deadAirOf = (film: Film, sizes: Readonly<Record<string, Size>>, lengths: ReadonlyMap<string, number>): ReadonlyArray<DeadAir> | undefined => {
  const { scene } = film;
  type Moment = Readonly<{ time: number; what: string; line?: number; }>;
  type Filled = Readonly<{ from: number; to: number; what: string; line?: number; }>;
  const news: Moment[] = [], filled: Filled[] = [];
  // .. Sound and Picture ..........................................................
  const cues = scene.sounds ?? [], steps = film.footsteps ?? [];
  const loudest = Math.max(0, ...[...cues, ...steps].map(cue => cue.volume));
  for(const cue of cues) {
    const named = isPlatformFile(cue.name) ? 'the sound' : `the sound '${cue.name}'`;
    news.push({ time: cue.time, what: `${named} at ${secondsOf(cue.time)} s starts`, ...lineOf(cue.line) });
    if(cue.volume < (BED_SHARE * loudest)) continue/*a bed under the rest*/;
    const seconds = lengths.get(cue.name), end = (cue.until !== undefined) ? cue.until : ((seconds !== undefined) ? soundEndOf(film, cue, seconds) : undefined);
    if(end === undefined) return undefined/*how long it plays unknown*/;
    filled.push({ from: cue.time, to: end, what: `${named} from ${secondsOf(cue.time)} s ends`, ...lineOf(cue.line) });
  }
  for(const step of steps) news.push({ time: step.time, what: `${step.actor ?? 'a figure'}'s footstep at ${secondsOf(step.time)} s`, ...lineOf(step.line) });
  scene.fade.forEach((key, index) => {
    const before = scene.fade[index - 1];
    if(!before || (Math.abs(key.values.fade - before.values.fade) < SAME_TIME)) return;
    if(key.ease === 'hold') news.push({ time: key.time, what: `the fade at ${secondsOf(key.time)} s`, ...lineOf(key.line) });
    else filled.push({ from: before.time, to: key.time, what: `the fade to ${secondsOf(key.time)} s ends`, ...lineOf(key.line) });
  });
  for(const title of scene.titles) news.push({ time: title.from, what: `the title at ${secondsOf(title.from)} s`, ...lineOf(title.line) });
  for(const key of scene.sets ?? []) news.push({ time: key.time, what: `the set at ${secondsOf(key.time)} s`, ...lineOf(key.line) });
  // .. What the Shot Shows .......................................................
  // an actor the shot shows within FEATURED of where its camera aims, in frame
  const screens = new Map<number, Readonly<Record<string, ScreenBox>>>();
  const featured = (name: string, time: number) => {
    const index = frameAtTime(film, time), frame = film.frames[index], shown = frame.actors.find(shot => shot.name === name);
    if(!isSized(sizes, name) || !shown || (Math.hypot(shown.position.x - frame.camera.target.x, shown.position.z - frame.camera.target.z) > FEATURED)) return false;
    const screen = screens.get(index) ?? screens.set(index, screenAt(film, sizes, index)).get(index)!;
    return !!screen[name]?.inFrame;
  };
  // the camera's own subject under way: each span of its keys aiming at one actor
  const keys = scene.camera.keys.filter(key => key.target);
  const aimed = keys.map((key, index) => ({ from: key.time, to: keys[index + 1]?.time ?? scene.length, actor: subjectAt(scene, key.time) }));
  for(const actor of scene.actors) {
    const moved = actor.spans.filter(span => MOVES.has(span.label)), own: Moment[] = [];
    const under = [...(actor.walks ?? []).map(walk => [walk.start, walk.end, walk.line] as const), ...moved.map(span => [span.from / scene.fps, span.to / scene.fps, span.line] as const)];
    for(const [from, to, line] of under) for(const aim of aimed.filter(each => each.actor === actor.name)) {
      const [start, end] = [Math.max(from, aim.from), Math.min(to, aim.to)];
      if(end > start) filled.push({ from: start, to: end, what: `${actor.name}'s move the camera follows ends at ${secondsOf(end)} s`, ...lineOf(line) });
    }
    for(const walk of actor.walks ?? []) own.push({ time: walk.start, what: `${actor.name}'s walk at ${secondsOf(walk.start)} s`, ...lineOf(walk.line) });
    for(const span of moved) own.push({ time: span.from / scene.fps, what: `${actor.name}'s ${span.label} at ${secondsOf(span.from / scene.fps)} s`, ...lineOf(span.line) });
    // an audience's member in view cheering, sitting back down or waving: action while it lasts
    for(const span of moved.filter(each => ACTING.has(each.label))) {
      const [from, to] = [span.from / scene.fps, span.to / scene.fps];
      if(featured(actor.name, from)) filled.push({ from, to, what: `${actor.name}'s ${span.label} ends at ${secondsOf(to)} s`, ...lineOf(span.line) });
    }
    for(const start of keyedStarts(actor.keys)) if(!under.some(([from, to]) => (start.time >= (from - SAME_TIME)) && (start.time <= (to + SAME_TIME)))) own.push({ time: start.time, what: `${actor.name}'s keys move it at ${secondsOf(start.time)} s`, ...lineOf(start.line) });
    for(const key of actor.faces ?? []) own.push({ time: key.time, what: `${actor.name}'s face at ${secondsOf(key.time)} s`, ...lineOf(key.line) });
    for(const each of actor.reactions ?? []) own.push({ time: each.from, what: `${actor.name}'s reaction at ${secondsOf(each.from)} s`, ...lineOf(each.line) });
    for(const key of actor.hands ?? []) own.push({ time: key.time, what: `${actor.name}'s hand at ${secondsOf(key.time)} s`, ...lineOf(key.line) });
    news.push(...own.filter(each => featured(actor.name, each.time)));
  }
  // .. Stretches ..................................................................
  // a shot's times parted at everything new and at the ends of what fills time, each
  // part filled or not, the unfilled run together where nothing new parts them
  const at = (time: number) => (each: Readonly<{ time: number; }>) => Math.abs(each.time - time) < SAME_TIME;
  return cameraShots(scene.camera, scene.length).flatMap(shot => {
    const within = (time: number) => (time > (shot.from + SAME_TIME)) && (time < (shot.to - SAME_TIME));
    const points = [...new Set([shot.from, shot.to, ...news.map(each => each.time).filter(within), ...filled.flatMap(each => [each.from, each.to]).filter(within)])].sort((a, b) => a - b);
    const stretches: Array<{ from: number; to: number; }> = [];
    for(let index=0; index<points.length-1; index++) {
      const [from, to] = [points[index], points[index + 1]];
      if(filled.some(each => (each.from < (to - SAME_TIME)) && (each.to > (from + SAME_TIME)))) continue;
      const last = stretches[stretches.length - 1];
      if(last && (Math.abs(last.to - from) < SAME_TIME) && !news.some(at(from))) last.to = to;
      else stretches.push({ from, to });
    }
    const afterOf = (from: number): DeadAir['after'] => {
      if(Math.abs(from - shot.from) < SAME_TIME) return { what: 'the cut' };
      const { what, line } = news.find(at(from)) ?? filled.find(each => Math.abs(each.to - from) < SAME_TIME) ?? { what: 'the cut' };
      return { what, ...lineOf(line) };
    };
    const shown = ({ from, to }: Readonly<{ from: number; to: number; }>) => (to - from) - (scene.cutOuts ?? []).reduce((cut, each) => cut + Math.max(0, Math.min(to, each.to) - Math.max(from, each.from)), 0);
    return stretches.map(each => ({ ...each, seconds: shown(each) })).filter(each => each.seconds >= (DEAD_AIR - SAME_TIME)).map(each => ({ shot, ...each, after: afterOf(each.from) }));
  });
};

/** the spans that move an actor of themselves, each a movement starting where it starts
 *  and under way to its end: an audience's cheer, its sitting back down after one and
 *  its part in a wave among them, never its seated idle */
const MOVES = new Set(['path', 'crowd', 'cheer', 'sit', 'wave']);
/** of them, an audience's: action under way while it lasts wherever the camera aims, as
 *  a move the camera follows is (SEE: recorder.ts audience) */
const ACTING = new Set(['cheer', 'sit', 'wave']);
/** where an actor's keys start moving it from rest: each channel but `visible` changing
 *  from one key to the next after holding (at the key it leaves), or jumping at a held
 *  key; with the line of the key it moves to */
const keyedStarts = (keys: ReadonlyArray<Key>): ReadonlyArray<Readonly<{ time: number; line?: number; }>> => {
  const channels = [...new Set(keys.flatMap(key => Object.keys(key.values)))].filter(channel => channel !== 'visible');
  return channels.flatMap(channel => {
    const giving = keys.filter(key => channel in key.values), starts: Array<Readonly<{ time: number; line?: number; }>> = [];
    let moving = false;
    for(let index=1; index<giving.length; index++) {
      const [before, key] = [giving[index - 1], giving[index]];
      const changes = Math.abs(key.values[channel] - before.values[channel]) > SAME_TIME;
      if(changes && (key.ease === 'hold')) { starts.push({ time: key.time, ...lineOf(key.line) }); moving = false; continue; }
      if(changes && !moving) starts.push({ time: before.time, ...lineOf(key.line) });
      moving = changes;
    }
    return starts;
  });
};
const lineOf = (line: number | undefined) => (line !== undefined) ? { line } : {};
/** seconds as a phrase writes them: to the thousandth */
const secondsOf = (time: number): number => Math.round(time * 1000) / 1000;

// == Jumps =======================================================================
/** each cut-out whose frames on either side stand in one shot on one set: no camera cut
 *  or set change from its start to its end, so everything in view jumps on there; one
 *  reaching the film's end none */
export const jumpsOf = (film: Film): ReadonlyArray<Jump> => {
  const { scene } = film;
  const shots = cameraShots(scene.camera, scene.length), cutting = [...shots.map(shot => shot.from), ...(scene.sets ?? []).map(key => key.time)];
  return (scene.cutOuts ?? []).filter(cut => (cut.to < (scene.length - SAME_TIME)) && !cutting.some(time => (time >= (cut.from - SAME_TIME)) && (time <= (cut.to + SAME_TIME)))).flatMap(cut => {
    const shot = shotAt(shots, cut.to);
    return shot ? [{ shot, cut, at: filmTimeOf(film, cut.to) }] : [];
  });
};

// == Waiting =====================================================================
/** each stretch of a shot at least WAITING long a figure (not in an audience, riding
 *  nothing) stands in frame doing nothing but idle (no key moving it at MOVING_RATES,
 *  walk, path, crowd, face, reaction or hand's change) while someone else is the frame's
 *  subject and something moves it (the actor the camera aims at, else the largest in
 *  frame),
 *  near enough its size on the screen to share the picture with it (SEE: UPSTAGED), and
 *  it has a turn to come (something moves it later); those the stage sized, in the
 *  film's order */
export const waitingOf = (film: Film, sizes: Readonly<Record<string, Size>>): ReadonlyArray<Waiting> => {
  const { scene, frames } = film;
  const members = new Set((scene.audiences ?? []).flatMap(each => each.members.map(member => member.actor)));
  const cast = scene.actors.filter(actor => !members.has(actor.name) && isSized(sizes, actor.name)).map(actor => ({ actor, busy: busyOf(actor, scene.fps) }));
  const figures = cast.filter(({ actor }) => (actor.source.part === 'figure') && !actor.ride);
  if(figures.length < 1) return [];
  const busyAt = (busy: ReadonlyArray<readonly [number, number]>, time: number) => busy.some(([from, to]) => (time >= (from - SAME_TIME)) && (time <= (to + SAME_TIME)));
  const screens = frames.map((_, index) => screenAt(film, sizes, index));
  const tall = (box: ScreenBox | undefined) => (box && box.inFrame) ? (Math.min(1, box.bottom) - Math.max(0, box.top)) : 0;
  // each frame's subject while something moves it: the actor aimed at, else the largest
  // in frame of those not in an audience
  const busyOfName = new Map(cast.map(({ actor, busy }) => [actor.name, busy] as const));
  const subjects = frames.map((frame, index) => {
    const aimed = subjectAt(scene, frame.time);
    const subject = (aimed && screens[index][aimed]?.inFrame) ? aimed : cast.map(({ actor }) => actor.name).filter(name => tall(screens[index][name]) > 0).sort((a, b) => tall(screens[index][b]) - tall(screens[index][a]))[0];
    return ((subject !== undefined) && busyAt(busyOfName.get(subject) ?? [], frame.time)) ? subject : undefined/*no subject doing anything: nobody waits on it*/;
  });
  return shotFrames(film).flatMap(({ shot, first, last }) => figures.flatMap(({ actor, busy }) => {
    const waits: Waiting[] = [];
    let start: number | undefined;
    for(let index=first; index<=(last + 1); index++) {
      const subject = subjects[index], [own, theirs] = [tall(screens[index]?.[actor.name]), (subject === undefined) ? 0 : tall(screens[index][subject])];
      const waiting = (index <= last) && (own > 0) && (subject !== undefined) && (subject !== actor.name) && ((Math.max(own, theirs) / Math.max(SAME_TIME, Math.min(own, theirs))) <= UPSTAGED) && !busyAt(busy, frames[index].time);
      if(waiting && (start === undefined)) start = index;
      if(waiting || (start === undefined)) continue;
      const [from, to] = [frames[start].time, frameEnd(film, index - 1)];
      if(((to - from) >= (WAITING - SAME_TIME)) && busy.some(([later]) => later >= (to - SAME_TIME))) waits.push({ actor: actor.name, shot, from, to, ...lineOf(keyInForce(actor.keys.filter(key => key.time <= (from + SAME_TIME)), from)?.line ?? actor.line) });
      start = undefined;
    }
    return waits;
  })).sort((a, b) => (a.from - b.from) || a.actor.localeCompare(b.actor));
};

/** the spans (seconds) something moves an actor: its walks, paths and crowd, each span
 *  its keys move it at MOVING_RATES, a key jumping it a frame, and each face, reaction and
 *  hand's change */
const busyOf = (actor: RecordedActor, fps: number): ReadonlyArray<readonly [number, number]> => {
  const frame = 1 / fps;
  const rateOf = (channel: string) => ((channel === 'x') || (channel === 'z')) ? MOVING_RATES.across : (channel === 'height') ? MOVING_RATES.up : MOVING_RATES.angle;
  const keyed = [...new Set(actor.keys.flatMap(key => Object.keys(key.values)))].filter(channel => channel !== 'visible').flatMap(channel => {
    const giving = actor.keys.filter(key => channel in key.values);
    return giving.slice(1).flatMap((key, index) => {
      const before = giving[index], change = Math.abs(key.values[channel] - before.values[channel]);
      if(change <= SAME_TIME) return [];
      if(key.ease === 'hold') return [[key.time, key.time + frame] as const];
      return ((change / Math.max(SAME_TIME, key.time - before.time)) >= rateOf(channel)) ? [[before.time, key.time] as const] : [];
    });
  });
  return [
    ...(actor.walks ?? []).map(walk => [walk.start, walk.end] as const), ...actor.spans.filter(span => MOVES.has(span.label)).map(span => [span.from / fps, span.to / fps] as const), ...keyed,
    ...[...(actor.faces ?? []), ...(actor.hands ?? [])].map(key => [key.time, key.time + frame] as const), ...(actor.reactions ?? []).map(each => [each.from, each.to] as const),
  ];
};
