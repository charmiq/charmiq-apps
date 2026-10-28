import { hipsFromSoles, hipsOver, type PoseBottoms } from '../../brick-shared/rise';

import { PERSON_RANGE } from './joint-range';
import type { Foot, Walk } from './recorder';

// an actor that clicks onto studs (a figure, a creature) moving as one does: on studs
// it stands clicked in, its feet on two studs side by side, square to them, and moves
// a stud at a time. A figure's walk is laid as steps of one stud, each gliding the body
// over the edge between the rows as a rendered brick film's walk measures (the
// trailing foot tipping onto its toe on that edge, the leading foot reaching out and
// landing on its heel there, rocking flat, the trailing one swinging through to stand
// beside it, clicked in), quarter turns on the foot inside the turn, strides of two studs
// up and down a level a step reaches (from the stud before the edge, so the leading leg
// reaches over it as the trailing foot rocks onto its toe) and hops elsewhere; on
// studs a diagonal is a staircase of steps and turns. Off studs (a tile, a slope) the
// same steps and turns follow the path itself. Anything else that moves it over studs
// (its keys, idling, the boil) leaves it clicked in where it stands until where it is
// keyed lies a stud on, or a quarter round, then it hops (or turns) there; in a crowd,
// a stud straight ahead is a step. A creature hops where a figure steps. A foot
// touching studs never moves over them
// ********************************************************************************
// == Constants ===================================================================
/** a figure's leg from its hip's axis to its sole, and how far its toe reaches ahead of
 *  that axis and its heel behind it (studs: 28, 11.25 and 8.75 LDU), the figure's own
 *  hips (3815) and legs (3816, 3817): a foot a stud long, a step's trailing toe where
 *  it stood meeting the leading heel where it lands */
const LEG = 1.4;
const TOE = 0.5625;
const HEEL = 0.4375;
/** a foot's outer edge from the figure's middle (studs): two feet a stud wide side by side */
const FOOT_EDGE = 1;
/** plates a stud high */
const PLATES_PER_STUD = 2.5;
/** how far a foot travelling over studs clears the plate (studs): a stud's height
 *  (1.7 LDU), and how near (studs) the stud it leaves or lands on it may sink below that */
const STUD_CLEAR = 1.7 / 20;
const STUD_NEAR = 0.25;
/** how far a foot that is moving at all stands off the plate (studs): it touches only
 *  where it stands */
const MOVING_CLEAR = 0.01;
/** the most a figure's stride climbs or descends (plates): a level farther is a hop */
const STEP_CLIMB = 2;
/** a stride up or down a level (studs): from the stud before the edge to the stud past it */
const STAIR = 2;
/** the highest part a walk leaps (plates over its level: a brick), the deepest (studs),
 *  how far ahead it looks for one (studs: it leaves a stud short of where a foot would
 *  stand in it), how far past it it lands (studs: its trailing leg, straight back, a
 *  leg's length behind its hips, has cleared it) and the most a hop rises to clear the
 *  set (plates) */
const LEAP = 3;
const LEAP_DEEP = 2;
const LEAP_AHEAD = 2;
const LEAP_PAST = 2;
const LEAP_LIFT = 4 * LEAP;
/** how finely a leap finds a part's sides along its way (studs): stepping a sixteenth
 *  of a stud, fitted to a millionth; and how far short of a whole stud's landing it may
 *  land (studs: a boil's sway, 0.06 at most, leaves a walk that far off the studs) */
const SIDE_STEP = 1 / 16;
const SIDE_FIT = 1e-6;
const LANDING_SLACK = 1 / 16;
/** a leap's stride (SEE: leaping), in studs along it: how far before its end its legs
 *  close (the trailing foot past the part, the leading leg reaching down) and its
 *  leading heel lands; and the least it rises over the line from its take-off to its
 *  landing (plates: a short rise) */
const LEAP_CLOSE = 0.6;
const LEAP_ON = 0.15;
const LEAP_RISE = 1;
/** how finely a hop's rise is fitted (plates), and a leap's split (degrees) */
const LIFT_FIT = 0.01;
const SPLIT_FIT = 0.5;
/** the most a hop's legs may stand tipped as it leaves the plate (degrees): rolled
 *  forward onto the toes, never back on the heels */
const SPRING = -2;
/** how finely a step's arch is fitted over what its feet need, and the arch between two
 *  frames */
const ARCH_SAMPLES = 32;
const BETWEEN_SAMPLES = 8;
/** how long a hop, a quarter turn and a crowd walker's step take when nothing times
 *  them (seconds) */
const HOP_SECONDS = 0.35;
const TURN_SECONDS = 0.3;
const STEP_SECONDS = 0.35;
/** the quickest a step between walks takes, catching up a walker keyed faster, and the
 *  slowest, a walker keyed at a crawl (seconds); how long keys hold before a figure is
 *  no longer carried at their pace (seconds) */
const QUICKEST_STEP = 0.12;
const SLOWEST_STEP = 1;
const PACE_HOLD = 0.5;
/** how far past a stud's middle (studs) or a quarter's (degrees) where an actor is
 *  keyed must lie before it moves on: so a nudge on a boundary moves nothing; off studs
 *  the shortest step a figure takes, a walk's remainder no longer joining the step
 *  before it */
const PAST_STUD = 0.1;
const PAST_QUARTER = 5;
/** how near a height lies to a surface (plates) to stand on it, and how far a figure
 *  tilts (degrees) before it no longer stands on its feet (lying, a push-up) */
const ON_SURFACE = 1e-3;
const UPRIGHT = 30;
/** off studs, the turn a path's leg must ask before a figure turns to it (degrees):
 *  less, its step takes it */
const OFF_TURN = 5;
/** off studs, the turn a standing figure's keys must ask before it turns on a foot
 *  (degrees): an idle's sway (9 at most) stays a sway */
const OFF_STAND_TURN = 20;
/** off studs, the farthest a standing figure's keys may lie from where it stands for
 *  its feet to take it there (studs): keyed farther at once (a cut, a new place), it
 *  stands there afresh */
const OFF_REACH = 4;
/** how little keys move from one frame to the next to hold (studs, degrees), and how
 *  long they hold to have settled (seconds): an idle's sway, still only at its turns,
 *  never settles */
const SETTLED = 1e-3;
const SETTLE_SECONDS = 0.2;
/** on studs, how far a point may lie from where a figure stands clicked in for that
 *  to be nearest it (studs): half a stud each way, and a hair */
const NEAREST = 0.5 + 1e-9;
/** how near two distances lie to count as one (studs): a tie keeps the heading */
const TIE = 1e-9;
/** the most moves one walk lays */
const MAX_MOVES = 20_000;

// == Gaits =======================================================================
/** how a figure moves through each kind of move a walk is made of (SEE: WALK) */
export type GaitShape = Readonly<{
  /** a step, keyed at its frames (even shares of it, the first and last its stances):
   *  the body's share of the stud at each; the leading leg's angle while it travels and
   *  the trailing leg's after it lifts (degrees, forward +); how far through it the
   *  leading heel lands on the edge between the rows and the trailing toe lifts off it
   *  (a heel landing after the toe lifts is a flight) */
  glide: ReadonlyArray<number>; lead: ReadonlyArray<number>; trail: ReadonlyArray<number>; heelOn: number; toeOff: number;
  /** a stride up onto another level and one down (STAIR studs, STEP_CLIMB plates at
   *  most), each keyed as a step is, and the lean forward over the legs through it
   *  (degrees) */
  upGlide: ReadonlyArray<number>; upLead: ReadonlyArray<number>; upTrail: ReadonlyArray<number>; upHeelOn: number; upToeOff: number; upLean: ReadonlyArray<number>;
  downGlide: ReadonlyArray<number>; downLead: ReadonlyArray<number>; downTrail: ReadonlyArray<number>; downHeelOn: number; downToeOff: number; downLean: ReadonlyArray<number>;
  /** a figure's arms where nothing keys them and how far a step swings them forward
   *  (degrees), back ARM_BACK as far; the shoulders never turn against them, a toy
   *  figure having no waist */
  hang: number; arms: number;
  /** the head: its swing through a step, keyed at the step's frames (degrees toward the
   *  leading foot's side, straight at the stances); and leading into a turn, how far it
   *  turns ahead of the body (degrees) and how long before the turn it starts (seconds) */
  headSwing: ReadonlyArray<number>; headTurn: number; headLead: number;
  /** the most a full variance shifts a step: the glide (studs) and the arms (degrees) */
  wander: Readonly<{ glide: number; arms: number; }>;
  /** a quarter turn, keyed at its frames (even shares of it): how far round the
   *  heading has come (a share), the free leg's swing (degrees, forward +) and how far
   *  the body leans out over the grounded foot (degrees: rolled onto that foot's outer
   *  edge, which rounds its stud as the body turns, lifting the free foot as far) */
  turnEase: ReadonlyArray<number>; turnLeg: ReadonlyArray<number>; turnRoll: ReadonlyArray<number>;
  /** a shift of weight onto the other foot before a turn on the wrong foot, keyed at its
   *  frames: how far the body rolls onto that foot's outer edge (degrees), lifting the
   *  free foot clear of its stud and setting it down again */
  shiftRoll: ReadonlyArray<number>;
  /** a hop's crouch before it springs and its landing after, each keyed at its frames:
   *  the legs tipped (degrees: + forward, rocking back on the heels, the hips going back;
   *  - back, rolled forward onto the toes, the hips going forward), the lean forward
   *  over the legs, the arms swung (degrees, forward +); the crouch starts from
   *  standing and springs from its last pose, rolled forward onto the toes; the
   *  landing ends standing */
  crouchLegs: ReadonlyArray<number>; crouchLean: ReadonlyArray<number>; crouchArms: ReadonlyArray<number>;
  landLegs: ReadonlyArray<number>; landLean: ReadonlyArray<number>; landArms: ReadonlyArray<number>;
  /** a hop's flight, keyed at its frames: its arc (a share of its rise), the legs
   *  tucked and the arms raised over the way from the crouch to the landing (degrees);
   *  its rise above the higher level, and more for each plate it climbs (plates) */
  hopArc: ReadonlyArray<number>; hopLegs: ReadonlyArray<number>; hopArms: ReadonlyArray<number>; hopLift: number; hopClimb: number;
  /** how long each kind of move takes against the others, in drawings: a walk's speed
   *  sets a step's pace, and every other move takes its drawings at that pace (a quarter
   *  turn of 6 against a step of 4 takes half again a step's time); a hop is its crouch,
   *  its flight and its landing */
  timing: GaitTiming;
}>;
/** a gait's drawings for each kind of move (SEE: GaitShape.timing) */
export type GaitTiming = Readonly<{ step: number; up: number; down: number; turn: number; shift: number; crouch: number; air: number; land: number; }>;

/** the built-in walk, timed as a rendered brick film's walk measures (the bathroom
 *  remake's west walk, nine cycles: Brick Film Remakes): the body never holding,
 *  quickest just after the leading foot lands; the arms hanging back and swinging
 *  against the legs; its wander from step to step its own */
export const WALK: GaitShape = {
  glide: [0, 0.22, 0.57, 0.84, 1], lead: [0, 44.64, 0, 0, 0], trail: [0, 0, 0, 0, 0], heelOn: 0.5, toeOff: 0.75,
  // the strides: going up shaped by eye, leaning well forward, the leading
  // leg swinging over the edge and its heel landing as the body passes a third of the
  // stride, the trailing leg following through; going down, the trailing toe holding the
  // edge while the body tips forward over it, dropping a frame onto the leading heel
  upGlide: [0, 0.08, 0.28, 0.38, 0.63, 0.93, 1], upLead: [0, 40.8, 46.34, 11.45, 1.56, 0, 0], upTrail: [0, 0, 5.89, 19.01, 20.47, 0.53, 0], upHeelOn: 0.5, upToeOff: 0.5, upLean: [0, 17.75, 19.81, 15.13, 10.37, 3.25, 0],
  downGlide: [0, 0.25, 0.5, 0.72, 0.9, 0.97, 1], downLead: [0, 10, 60, 30, 20, 0, 0], downTrail: [0, 0, 0, 0, 0, 0, 0], downHeelOn: 5 / 6, downToeOff: 4 / 6, downLean: [0, 2, 4, 4, 2, 1, 0],
  hang: -31, arms: 38,
  headSwing: [0, 2, 3, 2, 0], headTurn: 70, headLead: 0.533,
  wander: { glide: 0.04, arms: 6 },
  turnEase: [0, 0.11, 0.36, 0.58, 0.75, 0.9, 1], turnLeg: [0, 38.93, 47.39, 41.36, 26.5, 13.58, 0], turnRoll: [0, 2, 4, 5, 4, 2, 0],
  shiftRoll: [0, 5, 6, 5, 0],
  // the jump, shaped by eye: rocking back on the heels and rolling forward
  // onto the toes to spring, a flat arc with the legs trailing and swinging through,
  // landing toes first leaning back, rocking onto the heels and folding forward, the arms
  // swinging back no further than a person's 60 behind from where they hang (29); 6
  // frames crouching, 5 in the air, 5 landing
  crouchLegs: [0, 11.11, 17.41, 20, 3.6, -8.97, -15], crouchLean: [0, 11.46, 19.65, 24, 19.09, 13.87, 10], crouchArms: [0, -16.11, -25.24, -29, -14.28, 3.99, 30],
  landLegs: [-33.56, -9.52, 5.51, 7.35, 3.17, 0], landLean: [-15.47, 9.32, 7.61, 5.25, 4.53, 0], landArms: [30, -4.7, -19.96, -28.46, -29, 0],
  hopArc: [0, 0.46, 0.74, 0.76, 0.53, 0], hopLegs: [0, -9.91, -8.04, 0.2, 5.99, 0], hopArms: [0, 42.22, 65.57, 65.57, 42.22, 0], hopLift: 2, hopClimb: 0.1,
  timing: { step: 4, up: 6, down: 6, turn: 6, shift: 4, crouch: 6, air: 5, land: 5 },
};
/** where a figure's arms hang when nothing keys them (degrees) */
export const HANG = WALK.hang;
/** how far a step swings an arm back, as a share of how far it swings it forward: the
 *  built-in walk's arm, hung 31 back and wandering 6, ends its back swing at a person's
 *  60 behind the body (SEE: joint-range.ts PERSON_RANGE), its forward swing whole; a
 *  walk naming a wider swing swings back past it, as the scene chose */
export const ARM_BACK = ((WALK.hang - PERSON_RANGE.rightArm.least) - WALK.wander.arms) / WALK.arms;
/** an arm's swing (degrees, forward +) as a step swings it: back ARM_BACK as far as
 *  forward */
const swungArm = (swing: number): number => (swing < 0) ? (swing * ARM_BACK) : swing;
/** a hop's crouch and landing, each a share of the hop, from its gait's timing */
export const hopShares = (shape: GaitShape): Readonly<{ crouch: number; land: number; }> => {
  const { crouch, air, land } = shape.timing, all = Math.max(TIE, crouch + air + land);
  return { crouch: crouch / all, land: land / all };
};
/** whether a figure `u` (0 to 1) through a move is in the air: a hop past its crouch
 *  and short of its landing, in its gait's shape (WALK when it names none); a leap's
 *  stride past its take-off and short of its landing (SEE: leaping) */
export const aloft = (move: Pick<Move, 'kind' | 'leap' | 'room' | 'from' | 'to'>, u: number, shape: GaitShape = WALK): boolean => {
  if(move.kind !== 'hop') return false;
  if(strides(move)) { const length = Math.max(TIE, Math.hypot(move.to.x - move.from.x, move.to.z - move.from.z)); return (u > (takeoffOf(move).off / length)) && (u < (1 - (LEAP_ON / length))); }
  const { crouch, land } = hopShares(shape);
  return (u > crouch) && (u < (1 - land));
};
/** what keys a step's body and legs: a level step's, or a step up or down's */
export type Stride = Pick<GaitShape, 'glide' | 'lead' | 'trail' | 'heelOn' | 'toeOff'>;
/** a move's stride: a step's onto its own level, or up or down onto another */
export const strideOf = (shape: GaitShape, move: Pick<Move, 'from' | 'to'>): Stride => {
  const rise = move.to.level - move.from.level;
  if(Math.abs(rise) < ON_SURFACE) return shape;
  return (rise > 0) ? { glide: shape.upGlide, lead: shape.upLead, trail: shape.upTrail, heelOn: shape.upHeelOn, toeOff: shape.upToeOff }
    : { glide: shape.downGlide, lead: shape.downLead, trail: shape.downTrail, heelOn: shape.downHeelOn, toeOff: shape.downToeOff };
};

// == Types =======================================================================
/** a surface an actor can stand on: its height (plates), studded or smooth, and the
 *  part whose top it is by its kind and color (`tile-2x4 orange`), none for the
 *  baseplate or where the studio names none */
export type Surface = Readonly<{ height: number; studded: boolean; part?: string; }>;
/** the surfaces in a cell of the stage (whole studs), lowest first */
export type SurfaceAt = (x: number, z: number) => ReadonlyArray<Surface>;
/** how an actor stands: its middle (studs), heading (degrees clockwise from north),
 *  the level it stands on (plates) and whether that is studded */
export type Stance = Readonly<{ x: number; z: number; yaw: number; level: number; studded: boolean; }>;
/** the kinds of move a gait keys apart: a step, a stride up or down a level, a quarter
 *  turn, a shift of weight and a hop (a leap a stud short of its part among them); and
 *  a leap's stride, which no gait's keys shape (SEE: leaping) */
export enum GaitMove { Step = 'step', Up = 'up', Down = 'down', Turn = 'turn', Shift = 'shift', Hop = 'hop', Leap = 'leap' }
/** a move as its gait keys it */
export const gaitMoveOf = (move: Pick<Move, 'kind' | 'from' | 'to' | 'leap' | 'room'>): GaitMove => {
  if(move.kind === 'turn') return GaitMove.Turn;
  if(move.kind === 'shift') return GaitMove.Shift;
  if(move.kind === 'hop') return strides(move) ? GaitMove.Leap : GaitMove.Hop;
  const rise = move.to.level - move.from.level;
  return (Math.abs(rise) < ON_SURFACE) ? GaitMove.Step : (rise > 0) ? GaitMove.Up : GaitMove.Down;
};

/** one move of a walk or of a clicked actor: a step forward, a turn on one foot or a
 *  hop, from a stance to another over a span (seconds) */
export type Move = Readonly<{ kind: 'step' | 'turn' | 'hop' | 'shift'; from: Stance; to: Stance; start: number; end: number; foot: Foot/*the step's leading foot, the turn's pivot, the foot a shift puts the weight on*/; lift?: number/*plates a hop's arc rises where its gait's would not clear the set (SEE: hopLift); a leap's, over the line from its take-off to its landing (SEE: leapFit)*/; leap?: true/*a hop leaping a part in its way, on its own level (SEE: layWalk)*/; split?: number/*degrees a leap's legs split from straight down over the part (SEE: leapFit)*/; room?: number/*studs from a leap's hips to the part's near side, measured (SEE: takeoffOf)*/; }>;

// == Surfaces ====================================================================
/** the baseplate alone: studded at 0 everywhere (a film made before the stage answers) */
export const BASEPLATE: SurfaceAt = () => [{ height: 0, studded: true }];

/** the cells under a stance's feet (whole studs), left foot first */
export const feetCells = (stance: Pick<Stance, 'x' | 'z' | 'yaw'>): ReadonlyArray<readonly [number, number]> => {
  const [rx, rz] = rightOf(stance.yaw);
  return [-1, 1].map(side => [Math.floor(stance.x + (side * 0.5 * rx) + 1e-9), Math.floor(stance.z + (side * 0.5 * rz) + 1e-9)] as const);
};

/** where an actor standing at `level` stands, its feet in their cells: on the surface
 *  at its level under both feet, studded when both are; none when a foot finds no
 *  surface there (in the air, or within a part) */
export const standingOn = (surfaceAt: SurfaceAt, stance: Pick<Stance, 'x' | 'z' | 'yaw'>, level: number): Surface | undefined => {
  const found = feetCells(stance).map(([x, z]) => surfaceAt(x, z).find(surface => Math.abs(surface.height - level) < ON_SURFACE));
  return found.every(surface => surface !== undefined) ? { height: level, studded: found.every(surface => surface!.studded) } : undefined;
};

// == Lattice =====================================================================
/** where an actor clicking onto studs faces at a yaw, and its right, on the ground (x
 *  east, z north): a catalog part faces south at yaw 0, its own front as Brick Studio
 *  places it, so it faces the heading 180 past its yaw */
export const FRONT = 180;
const forwardOf = (yaw: number): readonly [number, number] => { const angle = (yaw + FRONT) * (Math.PI / 180); return [Math.sin(angle), Math.cos(angle)]; };
const rightOf = (yaw: number): readonly [number, number] => { const angle = (yaw + FRONT) * (Math.PI / 180); return [Math.cos(angle), -Math.sin(angle)]; };

/** how far a figure's feet reach into the set (studs; 0 when clear), its pose as `set`
 *  places it (its middle, heading, height in plates and legs): each sole's corners
 *  (its heel and toe, its inner and outer edge) against the surfaces under each. A
 *  corner over a surface at or below it stands in the air there (a floor under a
 *  gallery); one with none under it is in the part whose top is the lowest above it,
 *  below that top by the least way out, up or across its cell. The figure's roll is
 *  left out (a lean lifts a foot, never lowers one into the plate) */
export const feetInto = (set: Readonly<Record<string, number>>, surfaceAt: SurfaceAt): number => feetIn(set, surfaceAt).into;

/** how far a figure's feet reach into the set (SEE: feetInto) and the top (plates) of
 *  the part they reach deepest into; none when clear */
export const feetIn = (set: Readonly<Record<string, number>>, surfaceAt: SurfaceAt): Readonly<{ into: number; top?: number; }> =>
  reachIn(set, surfaceAt, LEGS.map(([limb, side]) => [set[limb] ?? 0, side, LEG] as const));

/** a figure's legs, by channel, and the side each stands on (its right +) */
const LEGS = [['pose.leftLeg', -1], ['pose.rightLeg', 1]] as const;
/** how far points of a figure's legs reach into the set (SEE: feetInto): each named by
 *  its leg's angle (degrees, forward +), its side and how far down the leg from the
 *  hip's axis it lies (studs: LEG its sole), at the foot's heel and toe and its inner
 *  and outer edge */
const reachIn = (set: Readonly<Record<string, number>>, surfaceAt: SurfaceAt, points: ReadonlyArray<readonly [number, -1 | 1, number]>): Readonly<{ into: number; top?: number; }> => {
  const [fx, fz] = forwardOf(set.yaw ?? 0), [rx, rz] = rightOf(set.yaw ?? 0), base = (set.height ?? 0) / PLATES_PER_STUD;
  let into = 0, deepest: number | undefined;
  for(const [degrees, side, down] of points) {
    const leg = radians(degrees), [cos, sin] = [Math.cos(leg), Math.sin(leg)];
    for(const a of [-HEEL, TOE]) for(const across of [0.05, 0.95]) {
      const along = (a * cos) + (down * sin), up = base + LEG - ((down * cos) - (a * sin));
      const x = (set.x ?? 0) + (fx * along) + (rx * side * across * FOOT_EDGE), z = (set.z ?? 0) + (fz * along) + (rz * side * across * FOOT_EDGE);
      const [cx, cz] = [Math.floor(x), Math.floor(z)], topOf = (ax: number, az: number) => Math.max(0, ...surfaceAt(ax, az).map(surface => surface.height)) / PLATES_PER_STUD;
      const heights = surfaceAt(cx, cz).map(surface => surface.height / PLATES_PER_STUD);
      if((heights.length < 1) || heights.some(height => height <= (up + (ON_SURFACE / PLATES_PER_STUD)))) continue/*over a surface: in the air*/;
      const top = Math.min(...heights), below = top - up;
      if(below <= into) continue/*clear, or no deeper*/;
      // across its cell only toward a side opening onto something lower: out of the part
      const sides = [[x - cx, -1, 0], [cx + 1 - x, 1, 0], [z - cz, 0, -1], [cz + 1 - z, 0, 1]].filter(([, dx, dz]) => topOf(cx + dx, cz + dz) < (top - 1e-9)).map(([distance]) => distance);
      into = Math.min(below, ...sides);
      deepest = top * PLATES_PER_STUD;
    }
  }
  return (deepest === undefined) ? { into } : { into, top: deepest };
};

/** the top (plates) of what is under a figure's feet, its pose as `set` places it: the
 *  highest surface under them at or below its lowest point; none over nothing */
export const surfaceUnder = (set: Readonly<Record<string, number>>, surfaceAt: SurfaceAt): number | undefined => {
  const lowest = set.height ?? 0;
  const under = feetCells({ x: set.x ?? 0, z: set.z ?? 0, yaw: set.yaw ?? 0 }).flatMap(([x, z]) => surfaceAt(x, z).map(surface => surface.height)).filter(top => top <= (lowest + ON_SURFACE));
  return (under.length > 0) ? Math.max(...under) : undefined;
};

/** how far a figure's feet stand over nothing (studs; 0 when one is on the set): the
 *  least each sole's corners stand above the surface under each, its pose as `set`
 *  places it (SEE: feetInto), so a walker held at a ledge's height out over the floor
 *  says so where a hop's feet barely leave the studs */
export const feetAbove = (set: Readonly<Record<string, number>>, surfaceAt: SurfaceAt): number => {
  const [fx, fz] = forwardOf(set.yaw ?? 0), [rx, rz] = rightOf(set.yaw ?? 0), base = (set.height ?? 0) / PLATES_PER_STUD;
  let above = Infinity;
  for(const [limb, side] of [['pose.leftLeg', -1], ['pose.rightLeg', 1]] as const) {
    const leg = radians(set[limb] ?? 0), [cos, sin] = [Math.cos(leg), Math.sin(leg)];
    for(const a of [-HEEL, TOE]) for(const across of [0.05, 0.95]) {
      const along = (a * cos) + (LEG * sin), up = base + LEG - ((LEG * cos) - (a * sin));
      const x = (set.x ?? 0) + (fx * along) + (rx * side * across * FOOT_EDGE), z = (set.z ?? 0) + (fz * along) + (rz * side * across * FOOT_EDGE);
      const top = Math.max(0, ...surfaceAt(Math.floor(x), Math.floor(z)).filter(surface => surface.height <= ((up * PLATES_PER_STUD) + ON_SURFACE)).map(surface => surface.height)) / PLATES_PER_STUD;
      above = Math.min(above, Math.max(0, up - top));
    }
  }
  return above;
};

/** how far a figure's lowest point stands over what is under it (studs), its place,
 *  heading and height as `set` gives them and its legs straight down (SEE: feetAbove):
 *  a figure standing, sitting or posing as it would stand there */
export const lowestAbove = (set: Readonly<Record<string, number>>, surfaceAt: SurfaceAt): number => feetAbove({ ...set, 'pose.leftLeg': 0, 'pose.rightLeg': 0 }, surfaceAt);

/** the quarter heading nearest a heading, unwrapped as it is (450 stays 450) */
export const quarterOf = (yaw: number): number => Math.round(yaw / 90) * 90;

/** a stance clicked in nearest a place: its heading a quarter, its middle a stud's
 *  middle along its heading and a stud's edge across it, so each foot is on a stud */
export const clickedNear = (x: number, z: number, yaw: number): Pick<Stance, 'x' | 'z' | 'yaw'> => {
  const quarter = quarterOf(yaw);
  const alongX = (Math.abs(Math.round(Math.sin(quarter * (Math.PI / 180)))) === 1);
  const middle = (value: number) => Math.floor(value) + 0.5, edge = (value: number) => Math.round(value);
  return alongX ? { x: middle(x), z: edge(z), yaw: quarter } : { x: edge(x), z: middle(z), yaw: quarter };
};

// == Laying ======================================================================
/** a walk's moves from where it starts (`from`) through its points, over its span: on
 *  studs a stud a step, square to them, the nearer axis walked first and turned to on
 *  one foot (a diagonal a staircase); off studs along the path itself, a stud a step,
 *  its last the rest (a remainder no longer than PAST_STUD joining the step before it,
 *  never a step in place); a figure on studs strides onto a level within STEP_CLIMB from the stud
 *  before its edge to the stud past it when the walk goes that far, and otherwise hops
 *  onto another level; up at most `climb` plates when the actor follows the ground
 *  (else its level as it starts), a level past that holding its own as at a wall,
 *  leaping a part in its way no higher than LEAP over its level and no deeper than
 *  LEAP_DEEP, each hop rising as its feet need (SEE: hopLift) and each leap a figure
 *  takes split as its legs need (SEE: leapFit). A creature hops every step. Its moves
 *  share the walk's span by their drawings in its gait's timing, a leap the walk's
 *  time for the studs it crosses */
export const layWalk = (walk: Walk, from: Stance, surfaceAt: SurfaceAt, climb: number | undefined, figure: boolean): ReadonlyArray<Move> => {
  // each kind of move weighed by its drawings against a step's (SEE: GaitShape.timing)
  const timing = (walk.shape ?? WALK).timing, weigh = (drawings: number) => drawings / Math.max(TIE, timing.step);
  const moves: Array<Omit<Move, 'start' | 'end'> & { weight: number; }> = [];
  let current = from.studded ? { ...from, ...clickedNear(from.x, from.z, from.yaw) } : from;
  let lead = walk.lead;
  const push = (kind: Move['kind'], to: Stance, foot: Foot, weight: number, fit: Pick<Move, 'lift' | 'leap' | 'split' | 'room'> = {}) => {
    if(moves.length >= MAX_MOVES) return false;
    moves.push({ kind: (kind === 'hop') ? 'hop' : (figure ? kind : 'hop'), from: current, to, foot, weight, ...fit });
    current = to;
    return true;
  };
  // a turn spins on the foot inside it, the other free; a figure whose free foot is that
  // one (the wrong foot into the turn) first shifts its weight onto it. The turn sets the
  // other foot down with the weight on it, so the next step leads with the foot it turned on
  const turn = (by: number) => {
    const pivot: Foot = (by < 0) ? 'left' : 'right';
    if(figure && (lead === pivot) && !push('shift', current, pivot, weigh(timing.shift))) return false;
    lead = pivot;
    return push('turn', turnedOn(current, by), pivot, weigh(timing.turn) * (Math.abs(by) / 90));
  };
  // a backward walk steps against the way it faces: its frame turned half round
  const back = walk.backward ? -1 : 1;
  const step = (length: number, yaw = current.yaw) => {
    const [fx, fz] = forwardOf(yaw).map(v => back * v);
    const ahead = { x: current.x + (fx * length), z: current.z + (fz * length), yaw };
    const next = landing(surfaceAt, current, ahead, climb);
    const kind = (next.level !== current.level) ? 'hop' : 'step';
    const foot = lead;
    lead = (lead === 'left') ? 'right' : 'left';
    const lift = (kind === 'hop') ? hopLift(surfaceAt, current, next, foot, figure, walk) : undefined;
    return push(kind, next, foot, (kind === 'hop') ? weigh(timing.crouch + timing.air + timing.land) : length, (lift !== undefined) ? { lift } : {});
  };
  // a figure's stride onto a level within its reach: up from a stud whose next lies on
  // its own level and the one past it higher, down from a stud whose next lies lower as
  // the one past it does (the edge between the levels always at the stride's own stud
  // boundary: SEE edgeOf); none where the levels ahead are otherwise
  const stair = (): boolean | undefined => {
    if(!figure || !current.studded) return undefined/*not a figure on studs*/;
    const [fx, fz] = forwardOf(current.yaw).map(v => back * v);
    const at = (studs: number) => landing(surfaceAt, current, { x: current.x + (fx * studs), z: current.z + (fz * studs), yaw: current.yaw }, climb);
    const [near, far] = [at(1), at(STAIR)], rise = far.level - current.level;
    const up = (rise > ON_SURFACE) && (near.level === current.level), down = (rise < -ON_SURFACE) && (near.level === far.level);
    if((!up && !down) || (Math.abs(rise) > (STEP_CLIMB + ON_SURFACE))) return undefined/*no stride*/;
    const foot = lead;
    lead = (lead === 'left') ? 'right' : 'left';
    return push('step', far, foot, weigh((far.level > current.level) ? timing.up : timing.down));
  };
  // a leap over a part in its way (SEE: wayOf) along `yaw`, its point `remaining` studs
  // on: from the stance nearest LEAP_AHEAD studs short of the part's near side (its
  // hips half a stud or more nearer), the sides measured from where its hips stand (a
  // walk off the stud lattice, as a boil leaves it, is as far from the part as it
  // stands), on its own level: a figure with more than a leg's length to the part
  // striding to LEAP_PAST studs past its far side, its split and rise fitted to clear
  // the part's top (SEE: leapFit); a creature, or a figure nearer the part (no room for
  // its leading leg to swing up), hopping to a stud past it as its feet need (SEE:
  // hopLift); landing a whole number of studs on, so its walk keeps its stride, within
  // LANDING_SLACK. None where the part is higher or deeper, its point comes sooner, it
  // stands in a part already, or a stud it lands over is not its own level's
  const leap = (yaw: number, remaining: number): boolean | undefined => {
    const [fx, fz] = forwardOf(yaw).map(v => back * v);
    const ahead = (studs: number) => ({ x: current.x + (fx * studs), z: current.z + (fz * studs), yaw });
    const at = (studs: number) => landing(surfaceAt, current, ahead(studs), climb);
    const way = (studs: number) => wayOf(surfaceAt, ahead(studs), at(studs).level)/*where its hips stand then, never clicked onto a stud; a level it climbs onto is not in its way*/;
    if(wayOf(surfaceAt, current, current.level) !== 0) return undefined/*in a part already: it walks on through*/;
    // where the part starts and ends along the way (studs): the first point past `from`
    // at most `reach` on whose way is or is not clear, to SIDE_FIT; none past reach, or
    // at a wall
    const edge = (from: number, reach: number, clear: boolean): number | 'wall' | undefined => {
      for(let studs=from+SIDE_STEP; studs<=(reach + TIE); studs+=SIDE_STEP) {
        const rise = way(studs);
        if(rise > (LEAP + ON_SURFACE)) return 'wall';
        if((rise === 0) !== clear) continue;
        let [low, high] = [studs - SIDE_STEP, studs];
        while((high - low) > SIDE_FIT) { const middle = (low + high) / 2; if((way(middle) === 0) === clear) high = middle; else low = middle; }
        return high;
      }
      return undefined;
    };
    const near = edge(0, LEAP_AHEAD + 0.5, false);
    if((near === undefined) || (near === 'wall')) return undefined/*nothing in its way, or a wall*/;
    const far = edge(near, near + LEAP_DEEP, true);
    if((far === undefined) || (far === 'wall')) return undefined/*too deep, or a wall beyond*/;
    const striding = figure && (near > LEG), beyond = Math.ceil(far + (striding ? LEAP_PAST : 1) - LANDING_SLACK);
    if(beyond > (remaining + NEAREST)) return undefined/*its point short of where it lands*/;
    for(let studs=Math.ceil(far - (2 * SIDE_FIT)); studs<=beyond; studs++) if((way(studs) !== 0) || (Math.abs(at(studs).level - current.level) >= ON_SURFACE)) return undefined/*no footing past it*/;
    const to = at(beyond), foot = lead;
    lead = (lead === 'left') ? 'right' : 'left';
    const lift = striding ? undefined/*its split fitted instead*/ : hopLift(surfaceAt, current, to, foot, figure, walk);
    const fit = striding ? leapFit(surfaceAt, current, to, foot, near, walk) : (lift !== undefined) ? { lift } : {};
    return push('hop', to, foot, beyond/*the walk's time for its studs: it runs on, never pausing*/, { ...fit, leap: true, room: near });
  };

  for(const target of walk.points.slice(1)) {
    for(let guard=0; guard<MAX_MOVES; guard++) {
      const [dx, dz] = [target.x - current.x, target.z - current.z];
      if(current.studded) {
        const [fx, fz] = forwardOf(current.yaw).map(v => back * v), [rx, rz] = rightOf(current.yaw).map(v => back * v);
        const [along, across] = [(dx * fx) + (dz * fz), (dx * rx) + (dz * rz)];
        if((Math.abs(along) <= NEAREST) && (Math.abs(across) <= NEAREST)) break/*clicked in nearest the point*/;
        if((along > (STAIR - NEAREST)) && (along >= (Math.abs(across) - TIE))) { const strode = stair(); if(strode === false) break; if(strode) continue; }
        if((along > NEAREST) && (along >= (Math.abs(across) - TIE))) {
          const leapt = leap(current.yaw, along);
          if(leapt === false) break;
          if(!leapt && !step(1)) break;
          continue;
        }
        if(!((Math.abs(across) > (Math.abs(along) + TIE)) ? turn((across > 0) ? 90 : -90) : turn(90))) break/*about: two quarters*/;
        continue;
      } /* else -- off studs: along the path itself */
      const distance = Math.hypot(dx, dz);
      if(distance < 1e-6) break;
      const heading = (Math.atan2(dx, dz) * (180 / Math.PI)) + FRONT + ((back < 0) ? 180 : 0)/*the yaw facing the point, or away from it*/;
      const by = wrapped(heading - current.yaw);
      if(Math.abs(by) > OFF_TURN) { if(!turn(by)) break; continue; }
      const leapt = leap(current.yaw + by, distance);
      if(leapt === false) break;
      if(!leapt && !step((distance <= (1 + PAST_STUD)) ? distance : 1/*a remainder too short to step joins this step*/, current.yaw + by/*straight at the point*/)) break;
    }
  }
  return timed(moves, walk.start, walk.end);
};

/** a walk's leaps as laid (SEE: leapsOf): when each sets off and lands (seconds); the steps it
 *  takes before the first, between each and the next and after the last; the studs each
 *  leap carries it and the studs its steps on its own level do, their median, so one
 *  odd step (a short first, a last joining a remainder) sets nothing (none where it
 *  takes no such step): parts a leap's studs and n steps' apart leave n steps between */
export type Leaps = Readonly<{ times: ReadonlyArray<number>; lands: ReadonlyArray<number>; stepsBefore: number; stepsBetween: ReadonlyArray<number>; stepsAfter: number; leapStuds: ReadonlyArray<number>; stepStuds?: number; }>;

// the studs a move carries its walker over the set
const studsCarried = (move: Move) => Math.hypot(move.to.x - move.from.x, move.to.z - move.from.z);

/** a walk's leaps over the parts in its way, as laid (SEE: layWalk), its steps counted
 *  as each move carrying it on (a step, a stride, a hop onto a level), never a turn or a
 *  shift of weight; none where it leaps nothing */
export const leapsOf = (moves: ReadonlyArray<Move>): Leaps | undefined => {
  const leaps = moves.flatMap((move, index) => move.leap ? [index] : []);
  if(leaps.length < 1) return undefined;
  const carries = (move: Move) => (move.kind === 'step') || (move.kind === 'hop');
  const stepsIn = (from: number, to: number) => moves.slice(from, to).filter(carries).length;
  const steps = moves.filter(move => gaitMoveOf(move) === GaitMove.Step).map(studsCarried);
  return {
    times: leaps.map(index => moves[index].start), lands: leaps.map(index => moves[index].end),
    stepsBefore: stepsIn(0, leaps[0]), stepsBetween: leaps.slice(1).map((index, at) => stepsIn(leaps[at] + 1, index)), stepsAfter: stepsIn(leaps[leaps.length - 1] + 1, moves.length),
    leapStuds: leaps.map(index => studsCarried(moves[index])), ...((steps.length > 0) ? { stepStuds: median(steps) } : {}),
  };
};

/** the stud a stance's foot stands on, its middle (studs) */
export const studOf = (stance: Pick<Stance, 'x' | 'z' | 'yaw'>, foot: Foot): readonly [number, number] => {
  const side = (foot === 'left') ? -1 : 1, [rx, rz] = rightOf(stance.yaw);
  return [stance.x + (side * 0.5 * rx), stance.z + (side * 0.5 * rz)];
};

/** a stance turned `by` degrees on the foot inside the turn (the left turning left),
 *  its middle carried round that foot, on the level it stands */
export const turnedOn = (stance: Stance, by: number): Stance => {
  const [x, z] = turnedAbout([stance.x, stance.z], studOf(stance, (by < 0) ? 'left' : 'right'), by);
  return { ...stance, x, z, yaw: stance.yaw + by };
};

/** a point turned `by` degrees clockwise seen from above about another */
const turnedAbout = ([x, z]: ReadonlyArray<number>, [px, pz]: ReadonlyArray<number>, by: number): readonly [number, number] => {
  const angle = by * (Math.PI / 180), [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const [vx, vz] = [x - px, z - pz];
  return [px + (vx * cos) + (vz * sin), pz - (vx * sin) + (vz * cos)];
};

/** where a step from `current` to `ahead` lands: on the surface under its feet there
 *  (following the ground: the highest within `climb` of where it stands under each
 *  foot, the higher foot's; a level past that holds its own; else its own level),
 *  clicked onto the studs it lands on */
const landing = (surfaceAt: SurfaceAt, current: Stance, ahead: Pick<Stance, 'x' | 'z' | 'yaw'>, climb: number | undefined): Stance => {
  const level = (climb === undefined) ? current.level : reached(surfaceAt, ahead, current.level, climb);
  const surface = standingOn(surfaceAt, ahead, level);
  const studded = surface?.studded ?? false;
  return { ...ahead, ...(studded ? clickedNear(ahead.x, ahead.z, ahead.yaw) : {}), level, studded };
};

/** how far a part stands in the way of a stance at `level` (plates over it): the
 *  lowest top over that level under its feet, where they find no surface at it; 0 where
 *  they stand on it, or nothing stands over it (a gap, a lower level) */
const wayOf = (surfaceAt: SurfaceAt, stance: Pick<Stance, 'x' | 'z' | 'yaw'>, level: number): number => {
  if(standingOn(surfaceAt, stance, level)) return 0;
  const rises = feetCells(stance).flatMap(([x, z]) => surfaceAt(x, z).map(surface => surface.height - level).filter(rise => rise > ON_SURFACE));
  return (rises.length > 0) ? Math.min(...rises) : 0;
};

/** how high a hop from `from` to `to` rises (plates) for its feet to clear the set: the
 *  least, from its gait's own rise to LEAP_LIFT, that keeps its feet out of the set (SEE:
 *  feetInto) through its flight at each of ARCH_SAMPLES moments, no deeper than where
 *  they spring from and land (a toe brushing the face of a level it hops onto) and
 *  everything over its higher level a stud's height higher (the studs on top, and room
 *  to spare); none where its gait's own rise does */
const hopLift = (surfaceAt: SurfaceAt, from: Stance, to: Stance, foot: Foot, figure: boolean, gait: Gait): number | undefined => {
  const shape = gait.shape ?? WALK, raised = raisedOver(surfaceAt, Math.max(from.level, to.level));
  const intoAt = (lift: number | undefined, u: number) => feetInto(posedAt({ kind: 'hop', from, to, start: 0, end: 1, foot, ...((lift !== undefined) ? { lift } : {}) }, u, figure, gait).set, raised);
  const ends = Math.max(intoAt(undefined, 0), intoAt(undefined, 1));
  const clears = (lift: number | undefined) => {
    for(let index=0; index<=ARCH_SAMPLES; index++) if(aloft({ kind: 'hop', from, to }, index / ARCH_SAMPLES, shape) && (intoAt(lift, index / ARCH_SAMPLES) > (ends + TIE))) return false;
    return true;
  };
  if(clears(undefined)) return undefined;
  let [low, high] = [shape.hopLift + (shape.hopClimb * Math.abs(to.level - from.level)), LEAP_LIFT];
  if(!clears(high)) return high;
  while((high - low) > LIFT_FIT) { const middle = (low + high) / 2; if(clears(middle)) high = middle; else low = middle; }
  return high;
};

/** how a figure's leap from `from` to `to` splits its legs and rises (SEE: leaping) for
 *  its legs to clear the set: its legs split the least, from its gait's own step's reach
 *  to level, that keeps them out of the set at its short rise (LEAP_RISE), and level,
 *  it rises the least that does, up to LEAP_LIFT; each leg's sole and the middle of its
 *  front and back, and the hips' bottom between them, out of the set (SEE: feetInto)
 *  at each of ARCH_SAMPLES moments in the air, no deeper than where it springs from and
 *  lands, and everything over its level a stud's height higher (as for a hop) */
const leapFit = (surfaceAt: SurfaceAt, from: Stance, to: Stance, foot: Foot, room: number, gait: Gait): Readonly<{ split: number; lift: number; }> => {
  const shape = gait.shape ?? WALK, raised = raisedOver(surfaceAt, from.level), move: Move = { kind: 'hop', from, to, start: 0, end: 1, foot, leap: true, room };
  const intoAt = (split: number, lift: number, u: number) => {
    const { set } = posedAt({ ...move, split, lift }, u, true, gait);
    const legs = LEGS.flatMap(([limb, side]) => [[set[limb] ?? 0, side, LEG], [set[limb] ?? 0, side, LEG / 2]] as const);
    return reachIn(solesOf(set), raised, [...legs, [0, -1, HEEL], [0, 1, HEEL]]/*the hips' bottom, a heel's depth below their axis*/).into;
  };
  const least = Math.max(...shape.lead), ends = Math.max(intoAt(least, LEAP_RISE, 0), intoAt(least, LEAP_RISE, 1));
  const clears = (split: number, lift: number) => {
    for(let index=0; index<=ARCH_SAMPLES; index++) if(aloft(move, index / ARCH_SAMPLES) && (intoAt(split, lift, index / ARCH_SAMPLES) > (ends + TIE))) return false;
    return true;
  };
  if(clears(least, LEAP_RISE)) return { split: least, lift: LEAP_RISE };
  if(clears(90, LEAP_RISE)) {
    let [low, high] = [least, 90];
    while((high - low) > SPLIT_FIT) { const middle = (low + high) / 2; if(clears(middle, LEAP_RISE)) high = middle; else low = middle; }
    return { split: high, lift: LEAP_RISE };
  } /* else -- level legs need a higher rise */
  let [low, high] = [LEAP_RISE, LEAP_LIFT];
  if(!clears(90, high)) return { split: 90, lift: high };
  while((high - low) > LIFT_FIT) { const middle = (low + high) / 2; if(clears(90, middle)) high = middle; else low = middle; }
  return { split: 90, lift: high };
};

/** the set with everything over `level` a stud's height higher: the studs on a part's
 *  top, and room to spare, for a flight to clear */
const raisedOver = (surfaceAt: SurfaceAt, level: number): SurfaceAt => (x, z) =>
  surfaceAt(x, z).map(surface => (surface.height > (level + ON_SURFACE)) ? { ...surface, height: surface.height + (STUD_CLEAR * PLATES_PER_STUD) } : surface);

/** the level a figure following the ground stands on under its feet: under each, the
 *  highest surface no more than `climb` above `level`, the higher of the feet's; its
 *  own where a foot finds none within reach (a wall) */
const reached = (surfaceAt: SurfaceAt, stance: Pick<Stance, 'x' | 'z' | 'yaw'>, level: number, climb: number): number => {
  const under = feetCells(stance).map(([x, z]) => surfaceAt(x, z).filter(surface => surface.height <= (level + climb + ON_SURFACE)));
  if(under.some(surfaces => surfaces.length < 1)) return level;
  return Math.max(...under.map(surfaces => Math.max(...surfaces.map(surface => surface.height))));
};

/** moves sharing a span by their weights, in order */
const timed = (moves: ReadonlyArray<Omit<Move, 'start' | 'end'> & { weight: number; }>, start: number, end: number): ReadonlyArray<Move> => {
  const total = moves.reduce((sum, move) => sum + move.weight, 0);
  let at = start;
  return moves.map(({ weight, ...move }) => {
    const span = (total > 0) ? ((end - start) * (weight / total)) : 0;
    const timedMove = { ...move, start: at, end: at + span };
    at += span;
    return timedMove;
  });
};

// == Posing ======================================================================

/** what a stance and a move set at a time: place, heading, height (plates) and the
 *  legs; what they add: arms, lean. A move rolling a figure about a foot's
 *  edge (a turn's lean, a shift of weight) sets where its soles stand (`soles`), and its
 *  hips are placed from there (SEE: Clicked) */
export type Posed = Readonly<{ set: Readonly<Record<string, number>>; add: Readonly<Record<string, number>>; soles?: true; }>;
/** how a walk carries a figure: its arms' swing when it names one (its shape's
 *  otherwise) and its lean (degrees), how far it wanders from step to step (0 none; 1
 *  its shape's own wander) and its shape (WALK when it names none) */
export type Gait = Readonly<{ arms?: number; lean: number; variance?: number; shape?: GaitShape; }>;

/** an actor standing in a stance, clicked in or not: its place, heading and level
 *  (its legs as keyed: a lunge, a seat) */
export const stood = (stance: Stance): Posed => ({ set: { x: stance.x, z: stance.z, yaw: stance.yaw, height: stance.level }, add: {} });

/** an actor `u` (0 to 1) through a move: a step vaulting over the edge between its
 *  rows, a turn on its pivot foot, a hop in an arc, a figure's leap where it has room a
 *  running stride split over the part. `drawn`, it is a drawing standing on
 *  its own (a film on ones or twos, SEE: Drawing): its body as high as its feet need
 *  there, never arching to clear the frames a smooth film draws between */
export const posedAt = (move: Move, u: number, figure: boolean, gait: Gait, drawn = false): Posed => {
  const at = Math.max(0, Math.min(1, u));
  if(move.kind === 'turn') return turning(move, at, figure, gait.shape ?? WALK, drawn);
  if(move.kind === 'hop') return (figure && strides(move)) ? leaping(move, at, gait) : hopping(move, at, figure, gait.shape ?? WALK);
  if(move.kind === 'shift') return shifting(move, at, figure, gait.shape ?? WALK);
  return stepping(move, at, gait, drawn);
};

/** how a walker is drawn, each drawing a pose standing on its own: on twos (`frames`
 *  2) a move in its gait's own drawings (SEE: GaitShape.timing), each held as many
 *  frames as the move's span gives it (two at a walk's own pace); a move quicker than
 *  that (a sprint's step, a leap at a run) a drawing at every second frame, where the
 *  film draws it (SEE: film.ts filmOf); on ones (`frames` 1) a drawing every frame at
 *  `fps`; none when it moves smoothly, on every frame between its keys */
export type Drawing = Readonly<{ frames: number; fps: number; }>;

/** the drawings a gait draws a move in: a step's, a stride's, a quarter turn's (a half
 *  turn twice as many), a shift's, a hop's crouch, flight and landing together; a leap a
 *  step's for each stud it crosses, as it is timed (SEE: layWalk) */
const drawingsOf = (move: Move, shape: GaitShape): number => {
  const { timing } = shape;
  if(move.kind === 'turn') return timing.turn * Math.max(1, Math.round(Math.abs(move.to.yaw - move.from.yaw) / 90));
  if(move.kind === 'shift') return timing.shift;
  if(move.kind === 'hop') return move.leap ? Math.max(1, Math.round(timing.step * Math.hypot(move.to.x - move.from.x, move.to.z - move.from.z))) : (timing.crouch + timing.air + timing.land);
  const rise = move.to.level - move.from.level;
  return (Math.abs(rise) < ON_SURFACE) ? timing.step : (rise > 0) ? timing.up : timing.down;
};

/** a step: the body gliding over the edge between its rows (its stride's glide); the
 *  trailing toe planted on that edge until its toe-off and the leading heel from its
 *  heel-on, each planted leg set by where the body stands; the other leg where its keys
 *  put it, its foot clearing the studs as it travels; the hips as low as the feet let
 *  them, the body hopping just as far as a leg's swing needs, a planted foot rising
 *  straight up from its stud (the other way for a step backward); the arms swinging
 *  against the legs; wandering by the gait's `variance`. A step onto another level
 *  keys its own stride, the leading foot planted on the level it lands on and each
 *  travelling foot clearing the edge between the levels, leaning over its legs through
 *  it. No foot touching the plate ever moves along it */
const stepping = (move: Move, u: number, gait: Gait, drawn: boolean): Posed => {
  const shape = gait.shape ?? WALK, stride = strideOf(shape, move);
  const length = Math.hypot(move.to.x - move.from.x, move.to.z - move.from.z);
  const rise = (move.to.level - move.from.level) / PLATES_PER_STUD/*studs*/, climbing = Math.abs(rise) > TIE;
  // a step's wander: one shift a step, faded in and out across it, so it drifts from
  // step to step and never shakes from frame to frame
  const wander = (channel: string, most: number, at = u) => (gait.variance ?? 0) * most * Math.sin(Math.PI * at) * jitter(`${move.start}|${move.from.x}|${move.from.z}|${channel}`);
  // where the body is through the step, its wander with it: one place for a planted leg
  // and for the free leg it hands over to
  const alongAt = (at: number) => (glideAt(stride, at) * length) + wander('glide', shape.wander.glide, at);
  const legsAt = (at: number) => {
    const along = alongAt(at);
    const trailPlanted = at <= stride.toeOff, leadPlanted = at >= stride.heelOn;
    const rocked = rockedAt(along, length);
    const trailing = trailPlanted ? rocked.trail : radians(keyedAt(stride, stride.trail, at, [stride.toeOff, degreesOf(rockedAt(alongAt(stride.toeOff), length).trail)], [1, 0]));
    const leading = leadPlanted ? rocked.lead : radians(keyedAt(stride, stride.lead, at, [0, 0], [stride.heelOn, degreesOf(rockedAt(alongAt(stride.heelOn), length).lead)]));
    // the hip each foot needs above the level it starts on: a planted one's rock (the
    // leading one's on the level it lands on), a travelling one's clearing the plate,
    // the studs and the edge between the levels
    const needs = Math.max(trailPlanted ? rocked.trailHip : 0, leadPlanted ? (rocked.leadHip + rise) : 0, ...(trailPlanted ? [] : [hipFor(degreesOf(trailing), along, length, rise)]), ...(leadPlanted ? [] : [hipFor(degreesOf(leading), along, length, rise)]));
    return { along, trailing, leading, needs };
  };
  const { along, trailing, leading } = legsAt(u);
  // the hip at each frame just where the feet need it (a planted foot on the plate
  // there), arching between frames only as high as a travelling foot needs to clear
  // the studs; a planted foot below it rises straight up from its stud
  const hip = drawn ? legsAt(u).needs : between(stride.glide.length - 1, u, at => legsAt(at).needs);
  const backward = (((move.to.x - move.from.x) * forwardOf(move.from.yaw)[0]) + ((move.to.z - move.from.z) * forwardOf(move.from.yaw)[1])) < 0;
  const degrees = (angle: number) => (backward ? -1 : 1) * degreesOf(angle);
  const [lead, trail] = (move.foot === 'left') ? ['leftLeg', 'rightLeg'] : ['rightLeg', 'leftLeg'];
  const arm = (gait.arms ?? shape.arms) * Math.sin(Math.PI * u) * ((move.foot === 'left') ? 1 : -1)/*the arm opposite the leading leg forward*/, drift = wander('arms', shape.wander.arms);
  const w = along / Math.max(length, TIE);
  return {
    set: { x: move.from.x + ((move.to.x - move.from.x) * w), z: move.from.z + ((move.to.z - move.from.z) * w), yaw: move.from.yaw, height: move.from.level + ((hip - LEG) * PLATES_PER_STUD), [`pose.${lead}`]: degrees(leading), [`pose.${trail}`]: degrees(trailing) },
    add: { 'pose.rightArm': swungArm(arm) + drift, 'pose.leftArm': swungArm(-arm) - drift, 'pose.lean': (gait.lean * Math.sin(Math.PI * u)) + (climbing ? keysAt((rise > 0) ? shape.upLean : shape.downLean, u) : 0), 'pose.head': keysAt(shape.headSwing, u) * ((move.foot === 'right') ? 1 : -1)/*a head turns clockwise seen from above: toward the right*/ },
  };
};

/** a height through a move of `frames` frames, at `u`: what `needs` says at each
 *  frame, and between two the line joining them raised by one arch just enough to
 *  stay over what `needs` says there */
const between = (frames: number, u: number, needs: (u: number) => number): number => {
  const i = Math.max(0, Math.min(frames - 1, Math.floor(u * frames))), [u0, u1] = [i / frames, (i + 1) / frames];
  const [h0, h1] = [needs(u0), needs(u1)], t = (u - u0) / (u1 - u0);
  let rise = 0;
  for(let k=1; k<BETWEEN_SAMPLES; k++) {
    const s = k / BETWEEN_SAMPLES;
    rise = Math.max(rise, (needs(u0 + (s * (u1 - u0))) - (h0 + ((h1 - h0) * s))) / Math.sin(Math.PI * s));
  }
  return h0 + ((h1 - h0) * t) + (rise * Math.sin(Math.PI * t));
};
/** the lowest arch over heights sampled evenly through a step (its upper hull), at `u` */
const archAt = (heights: ReadonlyArray<number>, u: number): number => {
  const last = heights.length - 1, hull: Array<readonly [number, number]> = [];
  heights.forEach((height, i) => {
    const point = [i / last, height] as const;
    while(hull.length >= 2) {
      const [[x0, y0], [x1, y1]] = [hull[hull.length - 2], hull[hull.length - 1]];
      if((((x1 - x0) * (point[1] - y0)) - ((y1 - y0) * (point[0] - x0))) < 0) break/*a bend down: kept*/;
      hull.pop();
    }
    hull.push(point);
  });
  const index = Math.max(0, hull.findIndex(([at], i) => (i > 0) && (u <= at)) - 1);
  const [[u0, h0], [u1, h1]] = [hull[index], hull[Math.min(hull.length - 1, index + 1)]];
  return (u1 > u0) ? (h0 + ((h1 - h0) * ((u - u0) / (u1 - u0)))) : h1;
};

/** where each planted foot holds its leg and the hip, the body `along` a step of
 *  `length` (studs): the trailing toe on the plate where it stood, the leading heel
 *  where it lands, each leg rocking about that corner (radians, forward +; studs above
 *  the plate) */
const rockedAt = (along: number, length: number) => {
  const toe = along - TOE, heel = along - (length - HEEL);
  const toeRadius = Math.hypot(TOE, LEG), heelRadius = Math.hypot(HEEL, LEG);
  const within = (value: number) => Math.max(-1, Math.min(1, value));
  return {
    trail: -Math.asin(within(toe / toeRadius)) - Math.atan2(TOE, LEG), trailHip: Math.sqrt(Math.max(0, (toeRadius ** 2) - (toe ** 2))),
    lead: Math.atan2(HEEL, LEG) - Math.asin(within(heel / heelRadius)), leadHip: Math.sqrt(Math.max(0, (heelRadius ** 2) - (heel ** 2))),
  };
};
/** how far below the hip a leg at `leg` (radians, forward +) reaches: its heel's corner
 *  swung forward, its toe's swung back (studs) */
const reachOf = (leg: number): number => (LEG * Math.cos(leg)) + (((leg >= 0) ? HEEL : TOE) * Math.abs(Math.sin(leg)));
/** where a stride's edge between its levels lies along it (studs): half a stud before
 *  where it lands going up, half a stud past where it starts going down */
const edgeOf = (length: number, rise: number): number => (rise > 0) ? (length - 0.5) : 0.5;
/** how high the planted feet's rock holds the hip `u` through a step of `length` that
 *  rises `rise` (studs above the level it starts on, without wander; 0 in a flight, no
 *  foot planted) */
export const rockAt = (stride: Stride, u: number, length = 1, rise = 0): number => {
  const rocked = rockedAt(glideAt(stride, u) * length, length);
  return Math.max((u <= stride.toeOff) ? rocked.trailHip : 0, (u >= stride.heelOn) ? (rocked.leadHip + rise) : 0);
};
/** how high the hip must stand for a free leg at `degrees` (forward +), its body `along`
 *  a step of `length` rising `rise` at its edge (studs), to keep its
 *  sole clear of the plate under each point of it (the edge's corner too) and,
 *  travelling, of the studs (studs above the level it starts on) */
export const hipFor = (degrees: number, along: number, length = 1, rise = 0): number => {
  const leg = radians(degrees), [cos, sin] = [Math.cos(leg), Math.sin(leg)], offset = (TOE - HEEL) / 2/*the foot's middle ahead of the hip's axis*/;
  const travel = travelling(along + (LEG * sin) + (offset * cos) - offset, length);
  // a point of the sole `a` ahead of the hip's axis (heel -HEEL, toe TOE): where it lies
  // along the step and how far below the hip, over the level under it
  const edge = edgeOf(length, rise), alongOf = (a: number) => along + (a * cos) + (LEG * sin), below = (a: number) => (LEG * cos) - (a * sin);
  const over = (a: number) => below(a) + ((alongOf(a) > edge) ? rise : 0);
  const atEdge = (edge - along - (LEG * sin)) / cos/*the sole's point over the edge*/;
  const lowest = Math.max(over(-HEEL), over(TOE), ...(((atEdge > -HEEL) && (atEdge < TOE)) ? [below(atEdge) + Math.max(0, rise)] : []));
  return lowest + Math.max(STUD_CLEAR * travel, (travel > 0) ? MOVING_CLEAR : 0);
};
/** how far a foot whose middle stands `at` (studs along a step of `length`, from where
 *  it stood) is travelling: 0 over the stud it left or lands on, 1 between them */
const travelling = (at: number, length: number): number => Math.min(1, Math.abs(at) / STUD_NEAR, Math.abs(at - length) / STUD_NEAR);
/** a free leg's angle at `u` through a step: a smooth curve through `from`, its keys at
 *  the frames between, and `to` (each [u, degrees]) */
const keyedAt = (stride: Stride, keys: ReadonlyArray<number>, u: number, from: readonly [number, number], to: readonly [number, number]): number => {
  const frames = stride.glide.length - 1;
  return smoothThrough([from, ...keys.map((key, i) => [i / frames, key] as const).filter(([at]) => (at > (from[0] + TIE)) && (at < (to[0] - TIE))), to], u);
};
/** a smooth curve through points (each [u, value], u rising), at `u`: each piece a cubic
 *  that keeps the curve from overshooting between its points (monotone Hermite) */
const smoothThrough = (points: ReadonlyArray<readonly [number, number]>, u: number): number => {
  if(points.length < 2) return points[0]?.[1] ?? 0;
  const at = Math.max(points[0][0], Math.min(points[points.length - 1][0], u));
  const i = Math.max(0, Math.min(points.length - 2, points.findIndex(([x], k) => (k > 0) && (at <= x)) - 1));
  const slope = (k: number) => (points[k + 1][1] - points[k][1]) / Math.max(TIE, points[k + 1][0] - points[k][0]);
  const tangent = (k: number) => {
    if((k === 0) || (k === (points.length - 1))) return slope(Math.min(k, points.length - 2));
    const [a, b] = [slope(k - 1), slope(k)];
    return ((a * b) <= 0) ? 0 : (2 / ((1 / a) + (1 / b)))/*a turn holds still; otherwise the slopes' harmonic mean*/;
  };
  const [[x0, y0], [x1, y1]] = [points[i], points[i + 1]], h = Math.max(TIE, x1 - x0), t = (at - x0) / h;
  const [t2, t3] = [t * t, t * t * t];
  return (((2 * t3) - (3 * t2) + 1) * y0) + ((t3 - (2 * t2) + t) * h * tangent(i)) + (((-2 * t3) + (3 * t2)) * y1) + ((t3 - t2) * h * tangent(i + 1));
};
const radians = (degrees: number): number => degrees * (Math.PI / 180);
const degreesOf = (angle: number): number => angle * (180 / Math.PI);

/** where a step's body glides at `u` through it: a smooth curve through its stride's
 *  glide at even shares */
export const glideAt = (stride: Pick<Stride, 'glide'>, u: number): number => smoothThrough(stride.glide.map((g, i) => [i / (stride.glide.length - 1), g] as const), u);
/** a turn: the heading eased round as its shape keys it, the middle carried round the
 *  pivot foot (turning on its stud), leaning out over that foot (rolled onto its outer
 *  edge, which rounds the stud), the free leg swung as its shape keys it, the body
 *  rising as far as the lean lifts it or, one arch a turn, as the free foot needs to
 *  clear the studs it travels over */
const turning = (move: Move, u: number, figure: boolean, shape: GaitShape, drawn: boolean): Posed => {
  const w = keysAt(shape.turnEase, u), by = move.to.yaw - move.from.yaw, yaw = move.from.yaw + (by * w);
  const [cx, cz] = turnedAbout([move.from.x, move.from.z], studOf(move.from, move.foot), by * w);
  const free = (move.foot === 'left') ? 'rightLeg' : 'leftLeg', pivoting = (move.foot === 'left') ? 'leftLeg' : 'rightLeg';
  // the lean: rolled about the grounded foot's outer edge, the middle carried out toward
  // it and up (SEE: shifting)
  const roll = figure ? radians(keysAt(shape.turnRoll, u)) : 0, side = (move.foot === 'right') ? 1 : -1, [rx, rz] = rightOf(yaw);
  const out = FOOT_EDGE * (1 - Math.cos(roll)), up = FOOT_EDGE * Math.sin(roll);
  const clears = (at: number) => Math.max(0, reachOf(radians(keysAt(shape.turnLeg, at))) + (STUD_CLEAR * Math.min(1, at / STUD_NEAR, (1 - at) / STUD_NEAR)/*leaving and landing on its own stud*/) - LEG);
  const hop = !figure ? 0 : drawn ? clears(u) : archAt(Array.from({ length: ARCH_SAMPLES + 1 }, (_, i) => clears(i / ARCH_SAMPLES)), u);
  return {
    // NOTE: a stage's roll raises the figure's right side, so leaning onto the right foot is negative
    set: { x: cx + (side * rx * out), z: cz + (side * rz * out), yaw, height: move.from.level + (Math.max(up, hop) * PLATES_PER_STUD), ...(figure ? { roll: -side * degreesOf(roll), [`pose.${free}`]: keysAt(shape.turnLeg, u), [`pose.${pivoting}`]: 0 } : {}) },
    add: {}, ...(figure ? { soles: true as const } : {}),
  };
};

/** a hop: a crouch (rocking back on the heels where it stands, leaning over its legs,
 *  the arms swinging back), a flight in its shape's arc above the higher level from the
 *  crouch's pose to the landing's (the legs tucked and the arms raised on the way), and a
 *  landing (heels first where it lands, rocking back on them, rising to stand) */
const hopping = (move: Move, u: number, figure: boolean, shape: GaitShape): Posed => {
  const [a, b] = [move.from.level, move.to.level];
  const [dx, dz] = [move.to.x - move.from.x, move.to.z - move.from.z], length = Math.hypot(dx, dz);
  const [fx, fz] = (length > TIE) ? [dx / length, dz / length] : [0, 0];
  const shares = hopShares(shape), crouch = figure ? shares.crouch : 0, land = figure ? shares.land : 0, flight = Math.max(TIE, 1 - crouch - land);
  // a stance rocked on its feet, its legs tipped `degrees` (forward +: back on the heels,
  // each heel where it stood; back -: forward onto the toes, each toe where it stood):
  // where its hip stands back from the stance's middle and how high (studs)
  const rocked = (degrees: number) => {
    const leg = radians(degrees), corner = (degrees >= 0) ? HEEL : TOE, side = (degrees >= 0) ? 1 : -1;
    return { back: side * (corner - (corner * Math.cos(leg))) + (LEG * Math.sin(leg)), hip: (LEG * Math.cos(leg)) + (corner * Math.abs(Math.sin(leg))) };
  };
  const at = (stance: Stance, level: number, legs: number, lean: number, arms: number) => {
    const { back, hip } = rocked(legs);
    return { x: stance.x - (fx * back), z: stance.z - (fz * back), height: level + ((hip - LEG) * PLATES_PER_STUD), legs, lean, arms };
  };
  const posed = (pose: ReturnType<typeof at>, yaw: number): Posed => ({
    set: { x: pose.x, z: pose.z, yaw, height: pose.height, ...(figure ? { 'pose.leftLeg': pose.legs, 'pose.rightLeg': pose.legs } : {}) },
    add: figure ? { 'pose.rightArm': pose.arms, 'pose.leftArm': pose.arms, 'pose.lean': pose.lean } : {},
  });
  if(u < crouch) {
    const v = u / crouch, legs = keysAt(shape.crouchLegs, v);
    return posed(at(move.from, a, (v < 1) ? legs : Math.min(SPRING, legs), keysAt(shape.crouchLean, v), keysAt(shape.crouchArms, v)), move.from.yaw);
  }
  if(u > (1 - land)) {
    const v = (u - (1 - land)) / land;
    return posed(at(move.to, b, keysAt(shape.landLegs, v), keysAt(shape.landLean, v), keysAt(shape.landArms, v)), move.to.yaw);
  }
  // the flight: from the crouch's last pose to the landing's first, in an arc; it leaves
  // the plate only rolled forward onto the toes (SPRING at most), never back on the heels
  const w = (u - crouch) / flight, eased = smooth(w);
  const from = figure ? at(move.from, a, Math.min(SPRING, keysAt(shape.crouchLegs, 1)), keysAt(shape.crouchLean, 1), keysAt(shape.crouchArms, 1)) : at(move.from, a, 0, 0, 0);
  const to = figure ? at(move.to, b, keysAt(shape.landLegs, 0), keysAt(shape.landLean, 0), keysAt(shape.landArms, 0)) : at(move.to, b, 0, 0, 0);
  const between = (p: number, q: number) => p + ((q - p) * eased);
  const lift = move.lift ?? (shape.hopLift + (shape.hopClimb * Math.abs(b - a)));
  // across the ground it carries the speed it leaves with, steady to the landing; only
  // its rise follows the arc
  return posed({
    x: from.x + ((to.x - from.x) * w), z: from.z + ((to.z - from.z) * w), height: from.height + ((to.height - from.height) * w) + (lift * keysAt(shape.hopArc, w)),
    legs: between(from.legs, to.legs) + keysAt(shape.hopLegs, w), lean: between(from.lean, to.lean), arms: between(from.arms, to.arms) + keysAt(shape.hopArms, w),
  }, move.from.yaw + ((move.to.yaw - move.from.yaw) * eased));
};

/** a figure's leap over a part: a running stride, never a crouch. From its stance the
 *  trailing foot rolls up onto its toe, the leading leg swinging up into the split, the
 *  body rising off that toe (SEE: takeoffOf); in the air the trailing leg kicks back into
 *  the split, the hips at the move's rise over the line from the take-off to the
 *  landing (its `lift`), the legs `split` either way from straight down over the part,
 *  the arm opposite the leading leg reaching forward and the body leaning as its gait
 *  leans; the legs close as the trailing foot passes the part (LEAP_CLOSE before the
 *  end), the trailing leg swinging through to straight down as the leading heel lands
 *  on its stud (LEAP_ON before it), rocked over as a step's is. The body runs on
 *  at the walk's own pace throughout. Its height is its lowest point, a split raising
 *  that over its soles (SEE: solesOf) */
const leaping = (move: Move, u: number, gait: Gait): Posed => {
  const shape = gait.shape ?? WALK, split = move.split ?? Math.max(...shape.lead), lift = (move.lift ?? LEAP_RISE) / PLATES_PER_STUD/*studs*/;
  const [dx, dz] = [move.to.x - move.from.x, move.to.z - move.from.z], length = Math.max(TIE, Math.hypot(dx, dz));
  const { off, splitAt } = takeoffOf(move), along = u * length, [on, close] = [length - LEAP_ON, length - LEAP_CLOSE];
  const share = (from: number, to: number) => smooth(Math.max(0, Math.min(1, (along - from) / Math.max(TIE, to - from))))/*0 before, 1 after*/;
  const rocked = rockedAt(along, length), takeoff = rockedAt(off, length), landed = rockedAt(on, length);
  // the legs (degrees, forward +): the leading up into the split by the take-off, down
  // to its heel's landing as they close, then rocked over it; the trailing rocked over
  // its toe to the take-off, kicked back into the split, swung through to straight down
  // as the leading heel lands
  const leading = (along >= on) ? degreesOf(rocked.lead) : (split * share(0, splitAt)) + ((degreesOf(landed.lead) - split) * share(close, on));
  const trailing = (along <= off) ? degreesOf(rocked.trail) : ((degreesOf(takeoff.trail) + ((-split - degreesOf(takeoff.trail)) * share(off, splitAt))) * (1 - share(close, on)));
  // the hips: where the planted toe or heel holds them, between them the line from one
  // to the other raised by the leap's rise; never so low a free foot meets the plate
  const flight = takeoff.trailHip + ((landed.leadHip - takeoff.trailHip) * Math.max(0, Math.min(1, (along - off) / (on - off)))) + (lift * share(off, splitAt) * (1 - share(close, on)));
  const planted = (along <= off) ? rocked.trailHip : (along >= on) ? rocked.leadHip : flight;
  const hip = Math.max(planted, ...((along > off) ? [hipFor(trailing, along, length)] : []), ...((along < on) ? [hipFor(leading, along, length)] : []));
  const reach = share(0, splitAt) * (1 - share(close, length))/*the arms and the lean with the legs' split*/;
  const arm = (gait.arms ?? shape.arms) * reach * ((move.foot === 'left') ? 1 : -1)/*the arm opposite the leading leg forward*/;
  const [lead, trail] = (move.foot === 'left') ? ['leftLeg', 'rightLeg'] : ['rightLeg', 'leftLeg'];
  const w = along / length;
  return {
    set: { x: move.from.x + (dx * w), z: move.from.z + (dz * w), yaw: move.from.yaw, height: move.from.level + ((hip - LEG + riseOf(leading, trailing)) * PLATES_PER_STUD), [`pose.${lead}`]: leading, [`pose.${trail}`]: trailing },
    add: { 'pose.rightArm': swungArm(arm), 'pose.leftArm': swungArm(-arm), 'pose.lean': gait.lean * reach },
  };
};

/** whether a move is a figure's leap's stride (SEE: leaping): a leap with more than a
 *  leg's length from its hips to the part; one nearer springs as a hop does */
const strides = (move: Pick<Move, 'leap' | 'room'>): boolean => !!move.leap && ((move.room ?? 0) > LEG);
/** where a figure's leap takes off and where its legs stand split, its hips risen
 *  (studs along it): split as the leading heel comes over the part's near side, a leg's
 *  length short of it, its take-off toe leaving the plate a third of the way there */
const takeoffOf = (move: Pick<Move, 'room'>): Readonly<{ off: number; splitAt: number; }> => {
  const splitAt = (move.room ?? LEAP_AHEAD) - LEG;
  return { off: splitAt / 3, splitAt };
};

/** how far legs at these angles (degrees, forward +) raise a figure's lowest point over
 *  its soles (studs): its lowest leg's reach short of a leg's length, the hips' bottom
 *  (a heel's depth below their axis) at most, as Brick Studio measures each body's
 *  lowest point (SEE: brick-shared/rise.ts) */
const riseOf = (...legs: ReadonlyArray<number>): number => Math.max(0, Math.min(LEG - HEEL, ...legs.map(leg => LEG - reachOf(radians(leg)))));

/** a figure's pose as `set` places it with its height at its soles (its legs straight
 *  down), its lowest point lowered by the rise its legs make (SEE: riseOf): where
 *  feetInto and feetAbove read its feet from */
export const solesOf = (set: Readonly<Record<string, number>>): Readonly<Record<string, number>> =>
  ({ ...set, height: (set.height ?? 0) - (riseOf(...LEGS.map(([limb]) => set[limb] ?? 0)) * PLATES_PER_STUD) });

/** a shift of weight: the body rolled onto the outer edge of the foot taking the weight,
 *  that edge where it stands, lifting the other foot clear of its stud and setting it
 *  down again */
const shifting = (move: Move, u: number, figure: boolean, shape: GaitShape): Posed => {
  const roll = figure ? radians(keysAt(shape.shiftRoll, u)) : 0, side = (move.foot === 'right') ? 1 : -1, [rx, rz] = rightOf(move.from.yaw);
  const out = FOOT_EDGE * (1 - Math.cos(roll)), up = FOOT_EDGE * Math.sin(roll);
  // NOTE: a stage's roll raises the figure's right side, so rolling onto the right foot is negative
  return { set: { x: move.from.x + (side * rx * out), z: move.from.z + (side * rz * out), yaw: move.from.yaw, height: move.from.level + (up * PLATES_PER_STUD), roll: -side * degreesOf(roll), ...(figure ? { 'pose.leftLeg': 0, 'pose.rightLeg': 0 } : {}) }, add: {}, ...(figure ? { soles: true as const } : {}) };
};

/** how far a walking figure's head turns ahead of its body at `time` (degrees, clockwise
 *  seen from above): toward the next turn's way from its shape's lead before it, easing
 *  back to straight as the body comes round */
export const leadingHead = (moves: ReadonlyArray<Move>, time: number, shape: GaitShape): number => {
  const next = moves.find(move => (move.kind === 'turn') && (move.end >= time));
  if(!next || (time < (next.start - shape.headLead))) return 0;
  const toward = Math.sign(next.to.yaw - next.from.yaw) * shape.headTurn;
  if(time < next.start) return toward * smooth((time - (next.start - shape.headLead)) / Math.max(TIE, shape.headLead));
  return toward * (1 - keysAt(shape.turnEase, (time - next.start) / Math.max(TIE, next.end - next.start)));
};

/** a move's value at `u` through it: a smooth curve through its keys at even shares */
export const keysAt = (keys: ReadonlyArray<number>, u: number): number => smoothThrough(keys.map((key, i) => [i / (keys.length - 1), key] as const), u);

const smooth = (u: number): number => u * u * (3 - (2 * u));
/** the middle of some values: the mean of the middle two of an even count */
export const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return ((sorted.length % 2) === 1) ? sorted[middle] : ((sorted[middle - 1] + sorted[middle]) / 2);
};
/** a fixed number from -1 to 1 for some text (FNV-1a over it): the same every run */
export const jitter = (text: string): number => {
  let hash = 0x811c9dc5;
  for(let at=0; at<text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
  return (((hash >>> 0) / 0xffffffff) * 2) - 1;
};
/** an angle turned into -180 to 180 */
const wrapped = (angle: number): number => ((((angle + 180) % 360) + 360) % 360) - 180;

// == Clicked =====================================================================
/** an actor that clicks onto studs, frame by frame: its walks laid once each (SEE:
 *  layWalk), and between them, while it stands upright on studs, clicked in where it
 *  stands, hopping (or turning) to where it is keyed once that lies a stud on (a
 *  quarter round); walking in a crowd (`crowding`, its spans in seconds), stepping to
 *  a stud straight ahead and standing between steps with its legs straight down. Off
 *  studs, in the air or lying it is where it is keyed, and clicks in afresh where it
 *  lands */
export class Clicked {
  /** each walk's moves, and the stance it ends in */
  private laid = new Map<Walk, Readonly<{ moves: ReadonlyArray<Move>; last: Stance; }>>();
  /** where it stands clicked in, while it does */
  private stance: Stance | undefined;
  /** a hop or a turn under way between walks */
  private moving: Move | undefined;
  /** the walk it walked last, so it stands where that ended */
  private walked: Walk | undefined;
  /** the foot its last step in a crowd led with */
  private lead: Foot = 'right';
  /** where its keys stood it the frame before, off studs, and since when they have not
   *  moved: settled once they hold SETTLE_SECONDS */
  private keyedOff: Stance | undefined;
  private stillFrom: number | undefined;
  /** each moment a foot of its was set down, as its moves were begun and laid */
  // SEE: film.ts footstepsOf
  public readonly landed: number[] = [];
  /** where its keys last moved it, when, and the pace they carried it there at */
  private moved: Readonly<{ x: number; z: number; time: number; pace: number; }> | undefined;

  public constructor(private readonly walks: ReadonlyArray<Walk>, private readonly climb: number | undefined, private readonly figure: boolean, private readonly bottoms: PoseBottoms | undefined, private readonly crowding: ReadonlyArray<readonly [number, number]> = [], private readonly drawing?: Drawing) {}

  /** a walk's moves, once laid */
  public movesOf(walk: Walk): ReadonlyArray<Move> | undefined { return this.laid.get(walk)?.moves; }

  /** the move of a walk under way at `time` and how far through it (0 to 1: where its
   *  drawing stands, drawn), once the walk has been laid; none between walks or before
   *  one is laid */
  public moveAt(time: number): Readonly<{ walk: Walk; move: Move; u: number; }> | undefined {
    const walk = this.walks.find(each => (time >= each.start) && (time <= each.end)), laid = walk && this.laid.get(walk);
    const move = laid?.moves.find(each => (time >= each.start) && (time <= each.end));
    if(!walk || !move) return undefined/*not walking, or not laid yet*/;
    return { walk, move, u: this.drawnAt(move, time, walk.shape ?? WALK) };
  }

  /** what the actor's own values become at `time`, keyed (`channels`: its keys,
   *  spans, ground and boil), on the surfaces of the set standing then */
  public at(channels: Readonly<Record<string, number>>, time: number, surfaceAt: SurfaceAt): Record<string, number> {
    const walk = this.walks.find(each => (time >= each.start) && (time <= each.end));
    if(this.walked && (this.walked !== walk)) { this.stance = this.laid.get(this.walked)!.last; this.walked = undefined; }/*a walk starting as the last ends starts where it ended*/
    if(walk && this.moving) { this.stance = this.moving.to; this.moving = undefined; }/*and where a turn or hop its keys made was going*/
    return walk ? this.walking(walk, channels, time, surfaceAt) : this.standing(channels, time, surfaceAt);
  }

  // == Internal ==================================================================
  // how far through a move `time` stands (0 to 1): drawn, at the start of the drawing it
  // falls in, the move laid in its gait's drawings on twos (one quicker than a drawing
  // every two frames drawn at the time it is asked, each frame the film draws it on its
  // own drawing) and in a drawing a frame on ones (SEE: Drawing)
  private drawnAt(move: Move, time: number, shape: GaitShape): number {
    const span = move.end - move.start, u = (span > 0) ? Math.max(0, Math.min(1, (time - move.start) / span)) : 1;
    if(!this.drawing) return u/*smooth*/;
    const frames = span * this.drawing.fps, own = drawingsOf(move, shape);
    if((this.drawing.frames > 1) && (own > (frames / this.drawing.frames))) return u/*quicker than the film draws it*/;
    const drawings = Math.max(1, (this.drawing.frames > 1) ? own : Math.round(frames));
    return Math.min(1, Math.floor((u * drawings) + 1e-6) / drawings);
  }

  // `posed` over its values (SEE: applied); a figure its move rolls about a foot's edge
  // (Posed `soles`) placed by its hips, as its keys place it (SEE: brick-shared/rise.ts):
  // the move's roll taken about that edge, a pitch its keys give it about its hips as
  // every keyed turn is (a figure walking lying down lies where its steps put it)
  private placed(channels: Readonly<Record<string, number>>, posed: Posed): Record<string, number> {
    const out = applied(channels, posed);
    if(!posed.soles) return out;
    const pose = poseOf(out), rolled = { pitch: 0, roll: out.roll ?? 0 };
    const hips = hipsFromSoles(this.bottoms, pose, rolled, out.yaw ?? 0);
    return { ...out, x: (out.x ?? 0) + hips.x, z: (out.z ?? 0) + hips.z, height: (out.height ?? 0) + hips.height - hipsOver(this.bottoms, pose, rolled) };
  }

  private walking(walk: Walk, channels: Readonly<Record<string, number>>, time: number, surfaceAt: SurfaceAt): Record<string, number> {
    if(!this.laid.has(walk)) {
      const from = this.stance ?? this.keyedStance(channels, surfaceAt) ?? { x: walk.points[0].x, z: walk.points[0].z, yaw: channels.yaw ?? 0, level: channels.height ?? 0, studded: false };
      const moves = layWalk(walk, from, surfaceAt, this.climb, this.figure);
      for(const move of moves) this.land(move, walk.shape ?? WALK);
      this.laid.set(walk, { moves, last: moves[moves.length - 1]?.to ?? (from.studded ? { ...from, ...clickedNear(from.x, from.z, from.yaw) } : from) });
    }
    const { moves, last } = this.laid.get(walk)!;
    this.moving = undefined;
    this.walked = walk;
    const move = moves.find(each => time <= each.end);
    if(!move) return applied(channels, stood(last));
    const u = this.drawnAt(move, time, walk.shape ?? WALK), drawnTime = move.start + ((move.end - move.start) * u)/*the time its drawing stands for*/;
    const posed = (time < move.start) ? stood(move.from) : posedAt(move, u, this.figure, walk, !!this.drawing);
    return this.placed(channels, this.figure ? { ...posed, add: { ...posed.add, 'pose.head': (posed.add['pose.head'] ?? 0) + leadingHead(moves, drawnTime, walk.shape ?? WALK) } } : posed);
  }

  private standing(channels: Readonly<Record<string, number>>, time: number, surfaceAt: SurfaceAt): Record<string, number> {
    if((channels.visible ?? 1) < 0.5) { this.stance = this.moving = this.keyedOff = this.stillFrom = this.moved = undefined; return { ...channels }/*unseen: clicked in afresh where it shows again*/; }
    const pace = this.paceAt(channels, time);
    if(this.moving) {
      const { start, end } = this.moving;
      if(time < end) return this.placed(channels, posedAt(this.moving, this.drawnAt(this.moving, time, WALK), this.figure, (this.moving.kind === 'step') ? CROWD_GAIT : NO_GAIT, !!this.drawing));
      this.stance = this.moving.to;
      this.moving = undefined;
    }
    const keyed = this.keyedStance(channels, surfaceAt);
    const crowding = this.figure && this.crowding.some(([from, to]) => (time >= from) && (time <= to));
    const standing = (at: Stance) => crowding ? { set: { ...stood(at).set, 'pose.leftLeg': 0, 'pose.rightLeg': 0 }, add: {} } : stood(at);
    if(keyed && !keyed.studded && this.figure) return this.offStuds(channels, keyed, time, pace, standing, crowding);
    if(!keyed?.studded) { this.stance = undefined; return { ...channels }; }
    const stance = this.stance;
    if(!stance) { this.stance = { ...keyed, ...clickedNear(keyed.x, keyed.z, keyed.yaw) }; return applied(channels, standing(this.stance)); }
    const turnBy = (Math.abs(wrapped(keyed.yaw - stance.yaw)) > (45 + PAST_QUARTER)) ? (quarterOf(stance.yaw + wrapped(keyed.yaw - stance.yaw)) - stance.yaw) : 0;
    const apart = Math.max(Math.abs(keyed.x - stance.x), Math.abs(keyed.z - stance.z));
    const level = Math.abs(keyed.level - stance.level) < ON_SURFACE;
    if((turnBy === 0) && (apart <= (0.5 + PAST_STUD)) && level) return applied(channels, standing(stance));
    const to = { ...keyed, ...clickedNear(keyed.x, keyed.z, stance.yaw + turnBy) };
    const turnOnly = (apart <= (0.5 + PAST_STUD)) && level && (Math.abs(turnBy) === 90) && this.figure;
    // in a crowd, keyed a whole stud or more straight ahead: a step of one, quicker the
    // further it falls behind
    const [fx, fz] = forwardOf(stance.yaw), [rx, rz] = rightOf(stance.yaw), [dx, dz] = [to.x - stance.x, to.z - stance.z];
    const [along, across] = [(dx * fx) + (dz * fz), (dx * rx) + (dz * rz)];
    const ahead = crowding && level && (turnBy === 0) && (along > (1 - TIE)) && (Math.abs(across) < TIE);
    const step = { ...stance, x: stance.x + Math.round(fx), z: stance.z + Math.round(fz) };
    this.begin(turnOnly ? { kind: 'turn', from: stance, to: turnedOn(stance, turnBy), start: time, end: time + TURN_SECONDS, foot: (turnBy < 0) ? 'left' : 'right' }
      : ahead ? { kind: 'step', from: stance, to: step, start: time, end: this.stepEnd(time, pace, along), foot: this.lead = (this.lead === 'left') ? 'right' : 'left' }
      : { kind: 'hop', from: stance, to, start: time, end: time + HOP_SECONDS, foot: 'left' });
    return applied(channels, standing(stance));
  }

  /** a figure standing off studs (a tiled floor), its feet making every move as a walk's
   *  do there: turning on a foot to a heading its keys ask more than its turn of (a crowd
   *  walker OFF_TURN, any other OFF_STAND_TURN, so an idle's sway stays a sway); else,
   *  once its keys lie a stud or more off, a step of a stud toward them, quicker the
   *  further it falls behind: a crowd walker's facing its way, any other's facing as it
   *  stands, forward or back, and a hop where they lie to its side; once its keys
   *  settle, the rest of the turn past OFF_TURN and the rest of the way past PAST_STUD;
   *  standing where it stood between, never carried along. Keyed onto another level or
   *  farther than OFF_REACH, it stands where it is keyed afresh */
  private offStuds(channels: Readonly<Record<string, number>>, keyed: Stance, time: number, pace: number, standing: (at: Stance) => Posed, crowding: boolean): Record<string, number> {
    const stance = this.stance, before = this.keyedOff;
    this.keyedOff = keyed;
    const still = !!before && (Math.abs(wrapped(keyed.yaw - before.yaw)) < SETTLED) && (Math.hypot(keyed.x - before.x, keyed.z - before.z) < SETTLED);
    this.stillFrom = still ? (this.stillFrom ?? time) : undefined;
    const settled = (this.stillFrom !== undefined) && ((time - this.stillFrom) >= SETTLE_SECONDS);
    const [dx, dz] = stance ? [keyed.x - stance.x, keyed.z - stance.z] : [0, 0], apart = Math.hypot(dx, dz);
    if(!stance || stance.studded || (Math.abs(keyed.level - stance.level) >= ON_SURFACE) || (apart > OFF_REACH)) { this.stance = keyed; return applied(channels, standing(keyed)); }
    const turnBy = wrapped(keyed.yaw - stance.yaw);
    if(Math.abs(turnBy) > ((crowding || settled) ? OFF_TURN : OFF_STAND_TURN)) this.begin({ kind: 'turn', from: stance, to: turnedOn(stance, turnBy), start: time, end: time + (TURN_SECONDS * Math.max(1, Math.abs(turnBy) / 90)), foot: (turnBy < 0) ? 'left' : 'right' });
    else if((apart >= (1 - TIE)) || (settled && (apart > PAST_STUD))) {
      const from = crowding ? { ...stance, yaw: keyed.yaw }/*a turn under OFF_TURN taken by the step*/ : stance;
      const [fx, fz] = forwardOf(from.yaw), along = ((dx * fx) + (dz * fz)) / apart, length = Math.min(1, apart);
      const foot = this.lead = (this.lead === 'left') ? 'right' : 'left';
      this.begin((crowding || (Math.abs(along) >= Math.SQRT1_2))
        ? { kind: 'step', from, to: { ...from, x: stance.x + ((dx / apart) * length), z: stance.z + ((dz / apart) * length) }, start: time, end: this.stepEnd(time, pace, apart), foot }
        : { kind: 'hop', from: stance, to: { ...keyed, yaw: stance.yaw }, start: time, end: time + HOP_SECONDS, foot: 'left' });
    }
    return applied(channels, standing(stance));
  }

  /** a hop, a turn or a step between walks, under way from now */
  private begin(move: Move): void {
    this.moving = move;
    this.land(move, WALK);
  }

  /** where a move sets a foot down (seconds): a step's leading heel at its gait's
   *  heel-on, a figure's leap's stride's as it lands (SEE: leaping), a hop's landing and a turn's
   *  free foot at their ends; a weight shift's feet stay planted */
  private land(move: Move, shape: GaitShape): void {
    if(move.kind === 'shift') return;
    const span = move.end - move.start, length = Math.hypot(move.to.x - move.from.x, move.to.z - move.from.z);
    this.landed.push((move.kind === 'step') ? (move.start + (strideOf(shape, move).heelOn * span)) : (this.figure && strides(move)) ? (move.start + (span * (1 - (LEAP_ON / length)))) : move.end);
  }

  /** how fast its keys carry it (studs a second): over the span since they last moved
   *  it, so a film on twos, its keys held a frame, reads its true pace; nothing once
   *  they have held PACE_HOLD */
  private paceAt(channels: Readonly<Record<string, number>>, time: number): number {
    const [x, z] = [channels.x ?? 0, channels.z ?? 0], moved = this.moved;
    if(!moved) { this.moved = { x, z, time, pace: 0 }; return 0; }
    const apart = Math.hypot(x - moved.x, z - moved.z);
    if(apart < SETTLED) return ((time - moved.time) > PACE_HOLD) ? 0 : moved.pace;
    this.moved = { x, z, time, pace: apart / Math.max(time - moved.time, TIE) };
    return this.moved.pace;
  }

  /** when a step taken at `time` ends: as long as its pace takes over a stud (from
   *  QUICKEST_STEP to SLOWEST_STEP), so a walker steps through its walk and never stands
   *  between steps; STEP_SECONDS once its keys have stopped; quicker the further
   *  `behind` (studs) its keys have left it */
  private stepEnd(time: number, pace: number, behind: number): number {
    const own = (pace > 0) ? Math.min(SLOWEST_STEP, 1 / pace) : STEP_SECONDS;
    return time + Math.max(QUICKEST_STEP, own / Math.max(1, behind - 0.5));
  }

  /** where the actor's keys stand it, upright on a surface, studded or not; none in
   *  the air or lying */
  private keyedStance(channels: Readonly<Record<string, number>>, surfaceAt: SurfaceAt): Stance | undefined {
    if((Math.abs(channels.pitch ?? 0) > UPRIGHT) || (Math.abs(channels.roll ?? 0) > UPRIGHT)) return undefined;
    const place = { x: channels.x ?? 0, z: channels.z ?? 0, yaw: channels.yaw ?? 0 };
    const level = channels.height ?? 0;
    const surface = standingOn(surfaceAt, clickedNear(place.x, place.z, place.yaw), level) ?? standingOn(surfaceAt, place, level);
    return surface ? { ...place, level, studded: surface.studded } : undefined;
  }
}

/** a gait adding nothing (a hop or a turn between walks) */
const NO_GAIT = { arms: 0, lean: 0 };
/** a crowd walker's step between walks: its arms swinging as the built-in walk's */
const CROWD_GAIT = { arms: WALK.arms, lean: 0 };

/** an actor's values with a pose's: what it sets in place, what it adds over them */
const applied = (channels: Readonly<Record<string, number>>, posed: Posed): Record<string, number> => {
  const out: Record<string, number> = { ...channels, ...posed.set };
  for(const [channel, value] of Object.entries(posed.add)) out[channel] = (out[channel] ?? 0) + value;
  return out;
};

/** a figure's pose among an actor's values: each limb's angle, by limb */
export const poseOf = (channels: Readonly<Record<string, number>>): Readonly<Record<string, number>> => {
  const pose: Record<string, number> = {};
  for(const channel in channels) if(channel.startsWith('pose.')) pose[channel.slice('pose.'.length)] = channels[channel];
  return pose;
};
