import type { Foot, Walk } from './recorder';

// an actor that clicks onto studs (a figure, a creature) moving as one does: on studs
// it stands clicked in, its feet on two studs side by side, square to them, and moves
// a stud at a time. A figure's walk is laid as steps of one stud, each a chain of
// pivots (the trailing foot tipping onto its toe, the body vaulting over the edge
// between the rows, the leading foot landing on its heel and rocking flat, clicked
// in), quarter turns on the foot inside the turn and hops where the level changes; on
// studs a diagonal is a staircase of steps and turns. Off studs (a tile, a slope) the
// same steps and turns follow the path itself. Anything else that moves it over studs
// (its keys, idling, the boil) leaves it clicked in where it stands until where it is
// keyed lies a stud on, or a quarter round, then it hops (or turns) there; in a crowd,
// a stud straight ahead is a step. A creature hops where a figure steps. A foot
// touching studs never moves over them
// ********************************************************************************
// == Constants ===================================================================
/** a figure's leg from its hip's axis to its sole, and half its foot's depth (the
 *  toe's and the heel's edge either side of the hip's axis), studs: the figure's own
 *  hips (3815) and legs (3816, 3817) */
const LEG = 1.4;
const FOOT = 0.5;
/** plates a stud high */
const PLATES_PER_STUD = 2.5;
/** how high a stud stands (plates, its 4 LDU): a foot clicked onto one lifts this far
 *  to come off it, and its sole clears the next row's studs only from up there */
const STUD_HEIGHT = 0.5;
/** how much of a move off studs it takes to lift off its studs, and to drop onto them */
const POP = 0.1;
/** how much of a step a figure stands clicked in, at its start and end together:
 *  the click a brick film holds */
const CLICKED = 0.3;
/** how far a hop rises above the higher of the levels it leaves and lands on, at
 *  least, and how far more for each plate it climbs (plates) */
const HOP_LIFT = 2;
const HOP_CLIMB = 0.5;
/** how long a hop, a quarter turn and a crowd walker's step take when nothing times
 *  them (seconds) */
const HOP_SECONDS = 0.35;
const TURN_SECONDS = 0.3;
const STEP_SECONDS = 0.35;
/** the quickest a crowd walker's step takes, catching up a walker keyed faster (seconds) */
const QUICKEST_STEP = 0.12;
/** a walk's moves weighed against each other to share its time: a stud's step, a
 *  quarter turn, a hop */
const STEP_WEIGHT = 1;
const TURN_WEIGHT = 0.5;
const HOP_WEIGHT = 1.4;
/** how far a figure's free leg swings forward as it turns on the other, how far its
 *  legs tuck and its arms rise through a hop (degrees) */
const TURN_LEG = 25;
const HOP_LEGS = 20;
const HOP_ARMS = 70;
/** how far past a stud's middle (studs) or a quarter's (degrees) where an actor is
 *  keyed must lie before it moves on: so a nudge on a boundary moves nothing */
const PAST_STUD = 0.1;
const PAST_QUARTER = 5;
/** how near a height lies to a surface (plates) to stand on it, and how far a figure
 *  tilts (degrees) before it no longer stands on its feet (lying, a push-up) */
const ON_SURFACE = 1e-3;
const UPRIGHT = 30;
/** off studs, the turn a path's leg must ask before a figure turns to it (degrees):
 *  less, its step takes it */
const OFF_TURN = 5;
/** on studs, how far a point may lie from where a figure stands clicked in for that
 *  to be nearest it (studs): half a stud each way, and a hair */
const NEAREST = 0.5 + 1e-9;
/** how near two distances lie to count as one (studs): a tie keeps the heading */
const TIE = 1e-9;
/** the most moves one walk lays */
const MAX_MOVES = 20_000;

// == Types =======================================================================
/** a surface an actor can stand on: its height (plates), studded or smooth */
export type Surface = Readonly<{ height: number; studded: boolean; }>;
/** the surfaces in a cell of the stage (whole studs), lowest first */
export type SurfaceAt = (x: number, z: number) => ReadonlyArray<Surface>;
/** how an actor stands: its middle (studs), heading (degrees clockwise from north),
 *  the level it stands on (plates) and whether that is studded */
export type Stance = Readonly<{ x: number; z: number; yaw: number; level: number; studded: boolean; }>;
/** one move of a walk or of a clicked actor: a step forward, a turn on one foot or a
 *  hop, from a stance to another over a span (seconds) */
export type Move = Readonly<{ kind: 'step' | 'turn' | 'hop'; from: Stance; to: Stance; start: number; end: number; foot: Foot/*the step's leading foot, the turn's pivot*/; }>;

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
const FRONT = 180;
const forwardOf = (yaw: number): readonly [number, number] => { const angle = (yaw + FRONT) * (Math.PI / 180); return [Math.sin(angle), Math.cos(angle)]; };
const rightOf = (yaw: number): readonly [number, number] => { const angle = (yaw + FRONT) * (Math.PI / 180); return [Math.cos(angle), -Math.sin(angle)]; };

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
 *  one foot (a diagonal a staircase); off studs along the path itself, a stud a step
 *  at most; a step onto another level a hop, up at most `climb` plates when the actor
 *  follows the ground (else its level as it starts), a level past that holding its
 *  own as at a wall. A creature hops every step. Its moves share the walk's span by
 *  their weights */
export const layWalk = (walk: Walk, from: Stance, surfaceAt: SurfaceAt, climb: number | undefined, figure: boolean): ReadonlyArray<Move> => {
  const moves: Array<Omit<Move, 'start' | 'end'> & { weight: number; }> = [];
  let current = from.studded ? { ...from, ...clickedNear(from.x, from.z, from.yaw) } : from;
  let lead = walk.lead;
  const push = (kind: Move['kind'], to: Stance, foot: Foot, weight: number) => {
    if(moves.length >= MAX_MOVES) return false;
    moves.push({ kind: (kind === 'hop') ? 'hop' : (figure ? kind : 'hop'), from: current, to, foot, weight });
    current = to;
    return true;
  };
  const turn = (by: number) => push('turn', turnedOn(current, by), (by < 0) ? 'left' : 'right', TURN_WEIGHT * (Math.abs(by) / 90));
  const step = (length: number, yaw = current.yaw) => {
    const [fx, fz] = forwardOf(yaw);
    const ahead = { x: current.x + (fx * length), z: current.z + (fz * length), yaw };
    const next = landing(surfaceAt, current, ahead, climb);
    const kind = (next.level !== current.level) ? 'hop' : 'step';
    const foot = lead;
    lead = (lead === 'left') ? 'right' : 'left';
    return push(kind, next, foot, (kind === 'hop') ? HOP_WEIGHT : (STEP_WEIGHT * length));
  };

  for(const target of walk.points.slice(1)) {
    for(let guard=0; guard<MAX_MOVES; guard++) {
      const [dx, dz] = [target.x - current.x, target.z - current.z];
      if(current.studded) {
        const [fx, fz] = forwardOf(current.yaw), [rx, rz] = rightOf(current.yaw);
        const [along, across] = [(dx * fx) + (dz * fz), (dx * rx) + (dz * rz)];
        if((Math.abs(along) <= NEAREST) && (Math.abs(across) <= NEAREST)) break/*clicked in nearest the point*/;
        if((along > NEAREST) && (along >= (Math.abs(across) - TIE))) { if(!step(1)) break; continue; }
        if(!((Math.abs(across) > (Math.abs(along) + TIE)) ? turn((across > 0) ? 90 : -90) : turn(90))) break/*about: two quarters*/;
        continue;
      } /* else -- off studs: along the path itself */
      const distance = Math.hypot(dx, dz);
      if(distance < 1e-6) break;
      const heading = (Math.atan2(dx, dz) * (180 / Math.PI)) + FRONT/*the yaw facing the point*/;
      const by = wrapped(heading - current.yaw);
      if(Math.abs(by) > OFF_TURN) { if(!turn(by)) break; continue; }
      if(!step(Math.min(1, distance), current.yaw + by/*straight at the point*/)) break;
    }
  }
  return timed(moves, walk.start, walk.end);
};

/** a stance turned `by` degrees on the foot inside the turn (the left turning left),
 *  its middle carried round that foot, on the level it stands */
const turnedOn = (stance: Stance, by: number): Stance => {
  const side = (by < 0) ? -1 : 1, [rx, rz] = rightOf(stance.yaw);
  const pivot = [stance.x + (side * 0.5 * rx), stance.z + (side * 0.5 * rz)];
  const [x, z] = turnedAbout([stance.x, stance.z], pivot, by);
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
/** how far an actor clicked onto studs is lifted off them `u` through a move between
 *  two stances (plates): off as it unclicks, a stud's height while its feet ride the
 *  studs' tops, back down as it clicks in; on a smooth floor nothing to come off */
const popped = (move: Move, u: number, from: number, to: number): number => {
  if(!move.from.studded && !move.to.studded) return 0;
  const ramp = (value: number) => smooth(Math.max(0, Math.min(1, value / POP)));
  return STUD_HEIGHT * ramp(u - from) * ramp(to - u);
};

/** what a stance and a move set at a time: place, heading, height (plates) and the
 *  legs; what they add: arms, shoulders, lean */
export type Posed = Readonly<{ set: Readonly<Record<string, number>>; add: Readonly<Record<string, number>>; }>;

/** an actor standing in a stance, clicked in or not: its place, heading and level
 *  (its legs as keyed: a lunge, a seat) */
export const stood = (stance: Stance): Posed => ({ set: { x: stance.x, z: stance.z, yaw: stance.yaw, height: stance.level }, add: {} });

/** an actor `u` (0 to 1) through a move: a step vaulting over the edge between its
 *  rows, a turn on its pivot foot, a hop in an arc */
export const posedAt = (move: Move, u: number, figure: boolean, gait: Readonly<{ arms: number; lean: number; }>): Posed => {
  const at = Math.max(0, Math.min(1, u));
  if(move.kind === 'turn') return turning(move, at, figure);
  if(move.kind === 'hop') return hopping(move, at, figure);
  return stepping(move, at, gait);
};

/** a step: lifted off its studs, the body's middle carried over the edge where the
 *  trailing toe and the leading heel meet on the studs' tops, on its radius from them,
 *  so neither foot slides; the trailing leg tipping back on its toe then swinging
 *  through, the leading leg swinging out then rocking flat on its heel; dropped onto
 *  the next row and clicked in a while at each end; the arms against the legs */
const stepping = (move: Move, u: number, gait: Readonly<{ arms: number; lean: number; }>): Posed => {
  const length = Math.hypot(move.to.x - move.from.x, move.to.z - move.from.z);
  const w = clickedThrough(u);
  const half = Math.min(FOOT, length / 2)/*a shorter step's edge nearer*/;
  const radius = Math.hypot(half, LEG), tilt = Math.atan2(half, LEG);
  const phi = Math.asin(Math.max(-1, Math.min(1, ((w * length) - half) / radius)));
  const rise = (radius * Math.cos(phi)) - LEG;
  const [trailing, leading] = (phi <= 0) ? [-phi - tilt, phi + tilt] : [phi - tilt, tilt - phi];
  const degrees = (radians: number) => radians * (180 / Math.PI);
  const [lead, trail] = (move.foot === 'left') ? ['leftLeg', 'rightLeg'] : ['rightLeg', 'leftLeg'];
  const swing = Math.sin(Math.PI * w);
  const arm = gait.arms * swing * ((move.foot === 'left') ? 1 : -1)/*the arm opposite the leading leg forward*/;
  return {
    set: { x: move.from.x + ((move.to.x - move.from.x) * w), z: move.from.z + ((move.to.z - move.from.z) * w), yaw: move.from.yaw, height: move.from.level + (rise * PLATES_PER_STUD) + popped(move, u, CLICKED / 2, 1 - (CLICKED / 2)), [`pose.${lead}`]: degrees(leading), [`pose.${trail}`]: degrees(trailing) },
    add: { 'pose.rightArm': arm, 'pose.leftArm': -arm, 'pose.twist': -arm / 5, 'pose.lean': gait.lean * swing },
  };
};

/** a turn: lifted off its studs, the heading eased round, the middle carried round the
 *  pivot foot, the free leg swung forward and back, dropped back on */
const turning = (move: Move, u: number, figure: boolean): Posed => {
  const w = smooth(u), by = move.to.yaw - move.from.yaw;
  const side = (move.foot === 'left') ? -1 : 1, [rx, rz] = rightOf(move.from.yaw);
  const pivot = [move.from.x + (side * 0.5 * rx), move.from.z + (side * 0.5 * rz)];
  const [x, z] = turnedAbout([move.from.x, move.from.z], pivot, by * w);
  const free = (move.foot === 'left') ? 'rightLeg' : 'leftLeg', pivoting = (move.foot === 'left') ? 'leftLeg' : 'rightLeg';
  return { set: { x, z, yaw: move.from.yaw + (by * w), height: move.from.level + popped(move, u, 0, 1), ...(figure ? { [`pose.${free}`]: TURN_LEG * Math.sin(Math.PI * u), [`pose.${pivoting}`]: 0 } : {}) }, add: {} };
};

/** a hop: carried from one stance to the other in an arc above the higher level, the
 *  legs tucked and the arms raised in the air */
const hopping = (move: Move, u: number, figure: boolean): Posed => {
  const w = smooth(u), air = Math.sin(Math.PI * u);
  const [a, b] = [move.from.level, move.to.level];
  const lift = HOP_LIFT + (HOP_CLIMB * Math.abs(b - a));
  return {
    set: {
      x: move.from.x + ((move.to.x - move.from.x) * w), z: move.from.z + ((move.to.z - move.from.z) * w), yaw: move.from.yaw + ((move.to.yaw - move.from.yaw) * w),
      height: a + ((b - a) * u) + (4 * lift * u * (1 - u)),
      ...(figure ? { 'pose.leftLeg': HOP_LEGS * air, 'pose.rightLeg': HOP_LEGS * air } : {}),
    },
    add: figure ? { 'pose.rightArm': HOP_ARMS * air, 'pose.leftArm': HOP_ARMS * air } : {},
  };
};

/** a step's progress held clicked in at each end: CLICKED of it standing still */
const clickedThrough = (u: number): number => smooth(Math.max(0, Math.min(1, (u - (CLICKED / 2)) / (1 - CLICKED))));
const smooth = (u: number): number => u * u * (3 - (2 * u));
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

  public constructor(private readonly walks: ReadonlyArray<Walk>, private readonly climb: number | undefined, private readonly figure: boolean, private readonly crowding: ReadonlyArray<readonly [number, number]> = []) {}

  /** what the actor's own values become at `time`, keyed (`channels`: its keys,
   *  spans, ground and boil), on the surfaces of the set standing then */
  public at(channels: Readonly<Record<string, number>>, time: number, surfaceAt: SurfaceAt): Record<string, number> {
    const walk = this.walks.find(each => (time >= each.start) && (time <= each.end));
    if(this.walked && (this.walked !== walk)) { this.stance = this.laid.get(this.walked)!.last; this.walked = undefined; }/*a walk starting as the last ends starts where it ended*/
    return walk ? this.walking(walk, channels, time, surfaceAt) : this.standing(channels, time, surfaceAt);
  }

  // == Internal ==================================================================
  private walking(walk: Walk, channels: Readonly<Record<string, number>>, time: number, surfaceAt: SurfaceAt): Record<string, number> {
    if(!this.laid.has(walk)) {
      const from = this.stance ?? this.keyedStance(channels, surfaceAt) ?? { x: walk.points[0].x, z: walk.points[0].z, yaw: channels.yaw ?? 0, level: channels.height ?? 0, studded: false };
      const moves = layWalk(walk, from, surfaceAt, this.climb, this.figure);
      this.laid.set(walk, { moves, last: moves[moves.length - 1]?.to ?? (from.studded ? { ...from, ...clickedNear(from.x, from.z, from.yaw) } : from) });
    }
    const { moves, last } = this.laid.get(walk)!;
    this.moving = undefined;
    this.walked = walk;
    const move = moves.find(each => time <= each.end);
    if(!move) return applied(channels, stood(last));
    const span = move.end - move.start;
    return applied(channels, (time < move.start) ? stood(move.from) : posedAt(move, (span > 0) ? ((time - move.start) / span) : 1, this.figure, walk));
  }

  private standing(channels: Readonly<Record<string, number>>, time: number, surfaceAt: SurfaceAt): Record<string, number> {
    if((channels.visible ?? 1) < 0.5) { this.stance = this.moving = undefined; return { ...channels }/*unseen: clicked in afresh where it shows again*/; }
    if(this.moving) {
      const { start, end } = this.moving;
      if(time < end) return applied(channels, posedAt(this.moving, (time - start) / (end - start), this.figure, NO_GAIT));
      this.stance = this.moving.to;
      this.moving = undefined;
    }
    const keyed = this.keyedStance(channels, surfaceAt);
    if(!keyed?.studded) { this.stance = undefined; return { ...channels }; }
    const crowding = this.figure && this.crowding.some(([from, to]) => (time >= from) && (time <= to));
    const standing = (at: Stance) => crowding ? { set: { ...stood(at).set, 'pose.leftLeg': 0, 'pose.rightLeg': 0 }, add: {} } : stood(at);
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
    this.moving = turnOnly ? { kind: 'turn', from: stance, to: turnedOn(stance, turnBy), start: time, end: time + TURN_SECONDS, foot: (turnBy < 0) ? 'left' : 'right' }
      : ahead ? { kind: 'step', from: stance, to: step, start: time, end: time + Math.max(QUICKEST_STEP, STEP_SECONDS / Math.max(1, along - 0.5)), foot: this.lead = (this.lead === 'left') ? 'right' : 'left' }
      : { kind: 'hop', from: stance, to, start: time, end: time + HOP_SECONDS, foot: 'left' };
    return applied(channels, standing(stance));
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

/** an actor's values with a pose's: what it sets in place, what it adds over them */
const applied = (channels: Readonly<Record<string, number>>, posed: Posed): Record<string, number> => {
  const out: Record<string, number> = { ...channels, ...posed.set };
  for(const [channel, value] of Object.entries(posed.add)) out[channel] = (out[channel] ?? 0) + value;
  return out;
};
