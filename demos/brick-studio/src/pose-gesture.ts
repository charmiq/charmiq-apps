import { plantedAt, soleAt, type Leg } from '../../brick-shared/plant';
import type { PoseBottoms } from '../../brick-shared/rise';

import { LDU_PER_PLATE, LDU_PER_STUD, type PartLine } from './grid';
import type { ProbeGround } from './probe';
import { shotLines, shotParts, type Cast, type Point, type Shot } from './stage';

// a figure posed by hand on the stage's picture, as a person poses the toy: a part
// pushed turns about its joint until the point of it held stands under the pointer
// through the picture's camera; the figure carried by its hips is set down on the
// surface under it, clicking onto studs near a stud position at a quarter turn; a
// pinned foot stays where it stands while the figure pivots about it; and no gesture
// passes a piece into the set: it is held back at the last pose that passes. Every
// read is the studio's own (a shot's lines, a set's cells and surfaces); nothing here
// draws or listens (SEE: pose-control.ts)
// ********************************************************************************
// == Constants ===================================================================
/** the joint each part of a figure turns when it is dragged, as a shot names it (SEE:
 *  stage.ts shotParts): a hand its wrist, the torso the lean. The hips turn none: they
 *  carry the figure */
const JOINTS: Readonly<Record<string, ReadonlyArray<string>>> = {
  head: ['pose.head'], hat: ['pose.hat'], torso: ['pose.lean'],
  rightArm: ['pose.rightArm'], leftArm: ['pose.leftArm'], rightHand: ['pose.rightWrist'], leftHand: ['pose.leftWrist'],
  rightLeg: ['pose.rightLeg'], leftLeg: ['pose.leftLeg'],
};
/** how far either side of where a joint stands one pointer move looks for its angle
 *  (degrees), the step it looks in, and how fine it settles */
const REACH = 60, STEP = 5, FINE = 0.02;
/** a joint's angle as a gesture leaves it: to the tenth of a degree */
const TENTHS = 10;
/** a joint dialed: the least its held point moves across the picture for a degree
 *  (pixels) before the pointer's run across the picture dials it instead, how far that
 *  run turns it (degrees a pixel), and the most any run turns it (degrees a pixel) */
const DIAL_LEAST = 0.05, DIAL_ACROSS = 0.5, DIAL_MOST = 2;
/** how far a gesture goes between the poses tried against the set on its way (studs,
 *  and degrees of any turn or joint): nothing thinner than this is passed through */
const STRIDE = 0.25, STRIDE_TURN = 10;
/** how near a quarter turn (degrees) and a stud position (studs) a figure set down
 *  clicks onto studs */
const CLICK_TURN = 15, CLICK_REACH = 0.3;
/** a figure's feet, the footprint it stands and clicks on: two studs across, one along */
export const FEET: Readonly<{ width: number; depth: number; }> = { width: 2, depth: 1 };
/** how far up a figure carried across the set steps (plates): two bricks */
const STEP_UP = 6;
/** how far within its box a piece's points are tried against the set (LDU): a piece
 *  resting on a surface, or touching a wall, stands clear */
const WITHIN = 2;
/** how many times a gesture held back halves the way to where it was pulled */
const HALVINGS = 7;
/** how near two heights lie to count as one (plates) */
const ON = 0.05;
/** how far out the ring a figure is turned by lies (studs), and how many points trace it */
export const RING = 1.7;
const RING_POINTS = 48;
/** the least a ring shows as tall as it is wide, whatever camera sees it */
const RING_LEAST = 0.3;
/** how far past where a joint was taken and where it stands its travel is traced
 *  (degrees), the step it is traced in, how often it is ticked, and how far its axis
 *  reaches either side of the joint (studs) */
const TRAVEL_LEAD = 30, TRAVEL_STEP = 5, TICK = 15, AXIS = 0.45;
/** how far within its box a piece of a figure is tried against the figure's own other
 *  pieces (LDU): deeper than against the set, since a rounded piece fills less of its box */
const WITHIN_ITSELF = 4;
/** a figure's body: its parts never stop each other (the toy's arms, legs and head
 *  turn all the way round clear of its body); only what it wears or holds is met */
const BODY: ReadonlyArray<string> = ['torso', 'head', 'hips', 'rightArm', 'leftArm', 'rightHand', 'leftHand', 'rightLeg', 'leftLeg'];
/** what a figure wears that turns on the part carrying it, a pair each: never met by it */
const WORN: ReadonlyArray<readonly [string, string]> = [['head', 'hat']];
/** the least a part's travel stands out from its joint's axis (studs): its ticks, 15
 *  degrees apart, never crowd */
const REACH_LEAST = 0.75;
const STUDS_PER_PLATE = LDU_PER_PLATE / LDU_PER_STUD;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

// == Types =======================================================================
/** a point of one of a shot's lines, in that line's own frame (LDU): what a press on
 *  the picture holds, kept as the piece moves */
export type Held = Readonly<{ line: number; own: readonly [number, number, number]; }>;
/** where the picture shows a point of the scene (pixels), none behind its camera */
export type Sight = (point: Point) => readonly [number, number] | undefined;
/** a pinned foot: its leg, and where its contact holds */
export type Pin = Readonly<{ leg: Leg; at: Point; }>;
/** a figure a gesture poses: its cast and its shot, what its rise is measured from and
 *  its pinned foot, while one is */
export type Figure = Readonly<{ cast: Cast; shot: Shot; bottoms?: PoseBottoms; pin?: Pin; }>;
/** a piece's box in its own frame (LDU) */
export type PieceBox = Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number]; }>;
/** a piece as it stands: its line and its box */
export type Boxed = Readonly<{ line: Pick<PartLine, 'position' | 'matrix'>; box: PieceBox; }>;
/** for each segment of the scene, the frame's line whose surface it first crosses
 *  among the actors that are not the one posed, none crossing none (SEE: Viewer#crossing) */
export type Crossing = (segments: ReadonlyArray<readonly [Point, Point]>) => ReadonlyArray<number | undefined>;
/** the surfaces under a footprint, lowest first, and whether each is studded there */
export type Under = (ground: ProbeGround) => ReadonlyArray<Readonly<{ height: number; studded: boolean; }>>;
/** a held point's travel about its joint: the points it passes, one at each fifteen
 *  degrees, where it stands, the share of the path that runs past either end of the
 *  way come (drawn fading out), where the gesture took it, and the joint's axis through
 *  the middle of the turn */
export type Travel = Readonly<{ path: ReadonlyArray<Point>; ticks: ReadonlyArray<Point>; at: Point; lead: number; from?: Point; axis?: Readonly<{ from: Point; to: Point; }>; }>;
/** what a figure posed by hand is marked with, in the scene's own space (SEE:
 *  render/poseRig.ts, which draws each): the lines of its part under the pointer or
 *  held, and of that part where the gesture took it; its pieces that pass into the set,
 *  and their lines among the frame's; the travel of the point held; the ring it is
 *  turned by on the ground at its feet (or at its pinned foot), the point of it the
 *  figure faces (`front`), whether the pointer is over it (and where on it: degrees
 *  clockwise from north) or holds it (and the point of it that was taken, `grab`, with
 *  where that point has been turned to, `now`: the turn swept lies between them), and
 *  whether it is set down loose of the studs; the knob over its head it is tipped by, and whether the pointer is over it;
 *  its pinned foot's contact and that leg's lines; the studs it will seat on, and how many times it has
 *  seated; the rod under a figure lifted; what stops it (its own lines that would pass
 *  in, the set's placements they would pass into and the other actors' lines they
 *  would); the lines of a part
 *  as a settle onto the reference would leave it; and the figure's drawings before */
export type PoseMarks = Readonly<{
  part?: Readonly<{ lines: ReadonlyArray<PartLine>; held: boolean; }>; was?: ReadonlyArray<PartLine>; inside?: ReadonlyArray<PartLine>; into?: ReadonlyArray<number>;
  arc?: Travel;
  ring?: Readonly<{ at: Point; yaw: number; front: Point; over: boolean; near?: number; held: boolean; grab?: Point; now?: Point; loose: boolean; }>; knob?: Readonly<{ from: Point; to: Point; over: boolean; held: boolean; }>;
  pin?: Readonly<{ at: Point; lines: ReadonlyArray<PartLine>; }>; studs?: ReadonlyArray<Point>; seated?: number; rod?: Readonly<{ from: Point; to: Point; }>; stopped?: Readonly<{ lines: ReadonlyArray<PartLine>; placements: ReadonlyArray<number>; others: ReadonlyArray<PartLine>; }>;
  preview?: ReadonlyArray<PartLine>; before?: ReadonlyArray<PartLine>;
}>;

// == Joints ======================================================================
/** the joints a part of a figure turns when dragged; none for the hips (they carry the
 *  figure) and for what is no part of one */
export const jointsOf = (part: string): ReadonlyArray<string> | undefined => JOINTS[part];

/** a shot's value by its channel: a turn (`yaw`, `pitch`, `roll`) or a joint of its
 *  pose (`pose.head`) */
export const valueOf = (shot: Shot, channel: string): number =>
  channel.startsWith('pose.') ? (shot.pose?.[channel.slice(5) as keyof Shot['pose']] ?? 0) : shot.turn[channel as keyof Shot['turn']];

/** a shot with one of its values changed */
export const withValue = (shot: Shot, channel: string, value: number): Shot =>
  channel.startsWith('pose.') ? { ...shot, pose: { ...shot.pose, [channel.slice(5)]: value } } : { ...shot, turn: { ...shot.turn, [channel]: value } };

// == Held ========================================================================
/** the point of a shot's `line` that stands at `at`, in that line's own frame */
export const heldOf = (cast: Cast, shot: Shot, line: number, at: Point): Held => {
  const { position, matrix } = shotLines(cast, [shot])[line];
  const offset = [(at.x * LDU_PER_STUD) - position[0], (-at.height * LDU_PER_PLATE) - position[1], (at.z * LDU_PER_STUD) - position[2]];
  return { line, own: [0, 1, 2].map(column => (matrix[column] * offset[0]) + (matrix[3 + column] * offset[1]) + (matrix[6 + column] * offset[2])) as [number, number, number]/*a rotation's inverse is its transpose*/ };
};

/** where a held point stands with the figure as `shot` has it */
export const heldAt = (cast: Cast, shot: Shot, { line, own }: Held): Point => placed(shotLines(cast, [shot])[line], own);

// == Pull ========================================================================
/** a figure's shot with `joints` turned so its held point stands as near the pointer
 *  as they bring it, seen through the picture's camera: each joint in turn, looked for
 *  about where it stands (a drag is followed a move at a time), a pinned foot's
 *  contact kept. Two joints (a tip: pitch and roll) take a second pass each */
export const pulled = (figure: Figure, held: Held, joints: ReadonlyArray<string>, sight: Sight, pointer: readonly [number, number]): Shot => {
  const { cast } = figure;
  const miss = (shot: Shot): number => {
    const seen = sight(heldAt(cast, shot, held));
    return seen ? Math.hypot(seen[0] - pointer[0], seen[1] - pointer[1]) : Infinity/*behind the camera*/;
  };
  let shot = figure.shot;
  for(let pass=0; pass<((joints.length > 1) ? 2 : 1); pass++) for(const joint of joints) {
    const at = (value: number) => settled(figure, withValue(shot, joint, value));
    const from = valueOf(shot, joint);
    let [best, least] = [from, miss(at(from))];
    for(let value=from - REACH; value<=from + REACH; value+=STEP) { const missed = miss(at(value)); if(missed < least) [best, least] = [value, missed]; }
    // the least within a step either side, by golden section
    let [low, high] = [best - STEP, best + STEP];
    while((high - low) > FINE) {
      const [a, b] = [high - ((high - low) * GOLDEN), low + ((high - low) * GOLDEN)];
      if(miss(at(a)) <= miss(at(b))) high = b; else low = a;
    }
    shot = at(named((low + high) / 2));
  }
  return shot;
};

/** a figure's shot with `joint` dialed: turned as far as the pointer has run from
 *  `down` straight along the way its held point sets off through the picture's camera,
 *  a degree for as far as a degree moves the point there (never more than DIAL_MOST a
 *  pixel, for a point that hardly moves); a point the joint never moves across the
 *  picture is dialed by the pointer's run across it. A pinned foot's contact is kept */
export const dialed = (figure: Figure, held: Held, joint: string, sight: Sight, down: readonly [number, number], pointer: readonly [number, number]): Shot => {
  const { cast, shot } = figure, stands = valueOf(shot, joint);
  const [at, next] = [sight(heldAt(cast, shot, held)), sight(heldAt(cast, settled(figure, withValue(shot, joint, stands + 1)), held))];
  const [run, rise] = [pointer[0] - down[0], pointer[1] - down[1]];
  const along = (at && next) ? [next[0] - at[0], next[1] - at[1]] as const : [0, 0] as const, moves = Math.hypot(along[0], along[1])/*pixels a degree*/;
  const turned = (moves < DIAL_LEAST) ? run * DIAL_ACROSS : (((run * along[0]) + (rise * along[1])) / moves) * Math.min(1 / moves, DIAL_MOST);
  return settled(figure, withValue(shot, joint, named(stands + turned)));
};

/** a shot with each of `joints` settled on the nearest `step` (degrees), a figure's
 *  pinned foot kept: a part dragged in steps */
export const stepped = (figure: Pick<Figure, 'bottoms' | 'pin'>, shot: Shot, joints: ReadonlyArray<string>, step: number): Shot =>
  settled(figure, joints.reduce((each, joint) => withValue(each, joint, named(Math.round(valueOf(each, joint) / step) * step)), shot));

/** a figure's shot turned to `yaw` where it stands, about its pinned foot when one is */
export const turnedTo = (figure: Figure, yaw: number): Shot => settled(figure, withValue(figure.shot, 'yaw', yaw));

/** a shot with a figure's pinned foot kept where it is pinned */
export const settled = ({ bottoms, pin }: Pick<Figure, 'bottoms' | 'pin'>, shot: Shot): Shot =>
  pin ? { ...shot, position: plantedAt(bottoms, shot, pin.leg, pin.at).position } : shot;

export { soleAt };

// == Set Down ====================================================================
/** a figure carried to `at` (its footprint's middle) and set down: on the highest
 *  surface under it that it can step up to from where it stands, clicked onto studs (a
 *  stud position, a quarter turn) when it is near both and every stud under it is
 *  there, unless held `free`; none where every surface under it stands out of reach (a
 *  wall) */
export const setDown = (shot: Shot, at: Readonly<{ x: number; z: number; }>, size: Readonly<{ width: number; depth: number; }>, under: Under, free: boolean): Readonly<{ shot: Shot; clicked: boolean; }> | undefined => {
  const standsOn = (x: number, z: number, yaw: number) => under({ x, z, width: size.width, depth: size.depth, yaw }).filter(surface => surface.height <= (shot.position.height + STEP_UP)).pop();
  const quarter = Math.round(shot.turn.yaw / 90) * 90;
  if(!free && (Math.abs(shot.turn.yaw - quarter) <= CLICK_TURN)) {
    // a figure's studs lie under its footprint, which a quarter turn turns with it
    const [across, along] = ((((quarter / 90) % 2) + 2) % 2 === 1) ? [size.depth, size.width] : [size.width, size.depth];
    const [x, z] = [Math.round(at.x - (across / 2)) + (across / 2), Math.round(at.z - (along / 2)) + (along / 2)];
    const surface = (Math.hypot(at.x - x, at.z - z) <= CLICK_REACH) ? standsOn(x, z, quarter) : undefined;
    if(surface?.studded) return { shot: { ...shot, position: { x, z, height: surface.height }, turn: { ...shot.turn, yaw: quarter } }, clicked: true };
  } /* else -- set down where it is carried */
  const surface = standsOn(at.x, at.z, shot.turn.yaw);
  return surface && { shot: { ...shot, position: { x: at.x, z: at.z, height: surface.height } }, clicked: false };
};

/** how far a figure's lowest point stands over the highest surface under it (plates),
 *  none standing on one: a figure afloat holds its place, and is shown so */
export const afloat = (shot: Shot, size: Readonly<{ width: number; depth: number; }>, under: Under): number | undefined => {
  const below = under({ x: shot.position.x, z: shot.position.z, width: size.width, depth: size.depth, yaw: shot.turn.yaw }).filter(surface => surface.height <= (shot.position.height + ON)).pop();
  const over = shot.position.height - (below?.height ?? 0);
  return (over > ON) ? Math.round(over * 1000) / 1000 : undefined;
};

// == Into the Set ================================================================
/** how many points of each line a shot draws stand in a part of the set: a piece's
 *  corners, its faces' middles and its own, each WITHIN its box (`boxOf`, none for a
 *  piece not measured: counted clear), asked of the set's cells (`inside`) */
export const into = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined, inside: (points: ReadonlyArray<Point>) => ReadonlyArray<boolean>): ReadonlyArray<number> => {
  const points = triedPoints(cast, shot, boxOf);
  const stands = inside(points.flat());
  let at = 0;
  return points.map(each => { let count = 0; for(let index=0; index<each.length; index++) if(stands[at++]) count++; return count; });
};

/** where a shot's pieces touch the set: the middle of their points standing in a part
 *  of it (SEE: into), none standing clear. With `clear` (the same figure, posed as it
 *  stood), only the points that stand clear there count: where the shot first passes in */
export const contactOf = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined, inside: (points: ReadonlyArray<Point>) => ReadonlyArray<boolean>, clear?: Shot): Point | undefined => {
  const points = triedPoints(cast, shot, boxOf).flat(), stands = inside(points);
  const stood = clear ? inside(triedPoints(cast, clear, boxOf).flat()) : [];
  const within = points.filter((_, index) => stands[index] && !stood[index]);
  if(within.length < 1) return undefined/*clear of the set*/;
  const sum = within.reduce((total, point) => ({ x: total.x + point.x, z: total.z + point.z, height: total.height + point.height }), { x: 0, z: 0, height: 0 });
  return { x: sum.x / within.length, z: sum.z / within.length, height: sum.height / within.length };
};

// == Against Other Actors ========================================================
/** the edges of each line a shot draws, as its piece's box stands, tried WITHIN the
 *  box: its twelve edges and its four diagonals, each from one point of the scene to
 *  another; none for a piece not measured (`boxOf`). A figure posed is held clear of
 *  the other actors by these: an edge that crosses a surface of theirs passes into
 *  them, so a thin leaf stops it and the opening of a frame does not */
export const edgesOf = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined): ReadonlyArray<ReadonlyArray<readonly [Point, Point]>> =>
  shotLines(cast, [shot]).map(line => {
    const box = boxOf(line.ldraw);
    if(!box) return [];
    const [low, high] = [0, 1, 2].reduce<[number[], number[]]>(([lows, highs], axis) => { const inset = Math.min(WITHIN, (box.max[axis] - box.min[axis]) / 2); return [[...lows, box.min[axis] + inset], [...highs, box.max[axis] - inset]]; }, [[], []]);
    // its eight corners, each numbered by which end of each axis it stands at
    const corners = Array.from({ length: 8 }, (_, corner) => placed(line, [0, 1, 2].map(axis => ((corner >> axis) & 1) ? high[axis] : low[axis])));
    const edges: Array<readonly [Point, Point]> = [];
    for(let corner=0; corner<8; corner++) for(const axis of [0, 1, 2]) if(!((corner >> axis) & 1)) edges.push([corners[corner], corners[corner | (1 << axis)]]);
    for(const corner of [0, 1, 2, 3]) edges.push([corners[corner], corners[7 - corner]])/*the diagonals: each corner to the one opposite*/;
    return edges;
  });

/** whether two pieces' boxes meet as their lines stand them, at any turn: each tried
 *  WITHIN its box, so pieces that touch stand clear (the separating axes of two boxes:
 *  each one's own three, and the nine across a pair of them) */
export const boxesMeet = (one: Boxed, other: Boxed, within = WITHIN): boolean => {
  const [a, b] = [standing(one, within), standing(other, within)];
  const between = minus(b.middle, a.middle), turn = a.axes.map(axis => b.axes.map(across => dot(axis, across)));
  const reach = turn.map(row => row.map(value => Math.abs(value) + 1e-9)), off = a.axes.map(axis => dot(between, axis));
  for(let i=0; i<3; i++) if(Math.abs(off[i]) > (a.half[i] + (b.half[0] * reach[i][0]) + (b.half[1] * reach[i][1]) + (b.half[2] * reach[i][2]))) return false;
  for(let j=0; j<3; j++) if(Math.abs((off[0] * turn[0][j]) + (off[1] * turn[1][j]) + (off[2] * turn[2][j])) > ((a.half[0] * reach[0][j]) + (a.half[1] * reach[1][j]) + (a.half[2] * reach[2][j]) + b.half[j])) return false;
  for(let i=0; i<3; i++) for(let j=0; j<3; j++) {
    const [i1, i2, j1, j2] = [(i + 1) % 3, (i + 2) % 3, (j + 1) % 3, (j + 2) % 3];
    const apart = Math.abs((off[i2] * turn[i1][j]) - (off[i1] * turn[i2][j]));
    if(apart > ((a.half[i1] * reach[i2][j]) + (a.half[i2] * reach[i1][j]) + (b.half[j1] * reach[i][j2]) + (b.half[j2] * reach[i][j1]))) return false;
  }
  return true;
};

/** how many edges of each line a shot draws cross a surface of another actor's
 *  (`crossing`: for each segment, the frame's line whose surface it first crosses, none
 *  crossing none) */
export const against = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined, crossing: Crossing): ReadonlyArray<number> => {
  const edges = edgesOf(cast, shot, boxOf), crossed = crossing(edges.flat());
  let at = 0;
  return edges.map(each => { let count = 0; for(let index=0; index<each.length; index++) if(crossed[at++] !== undefined) count++; return count; });
};

/** what stopped a gesture among the other actors: of the first pose refused (`past`),
 *  the lines with an edge that crosses a surface of theirs where the pose it is held
 *  at (`held`) crosses none, and the frame's lines those surfaces are of */
export const stoppedAgainst = (cast: Cast, past: Shot, held: Shot, boxOf: (ldraw: string) => PieceBox | undefined, crossing: Crossing): Readonly<{ lines: ReadonlyArray<number>; pieces: ReadonlyArray<number>; }> => {
  const edges = edgesOf(cast, past, boxOf), [crossed, stood] = [crossing(edges.flat()), crossing(edgesOf(cast, held, boxOf).flat())];
  const [lines, pieces] = [new Set<number>(), new Set<number>()];
  let at = 0;
  edges.forEach((each, line) => each.forEach(() => {
    const piece = crossed[at];
    if((piece !== undefined) && (stood[at] === undefined)) { lines.add(line); pieces.add(piece); }
    at++;
  }));
  return { lines: [...lines], pieces: [...pieces] };
};

// == Against Itself ==============================================================
/** how many of a figure's own other pieces each line a shot draws passes into, each
 *  tried WITHIN_ITSELF its box. Two parts of its body never count, nor a thing worn
 *  and the part it turns on: what counts is what it wears or holds against the rest of
 *  it (a hand against its hat). Pieces may still meet as they stand, so a gesture is
 *  judged by whether it meets more than it did, never by the count itself */
export const amongItself = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined): ReadonlyArray<number> => {
  const boxed = boxedOf(cast, shot, boxOf), parts = shotParts(cast, shot);
  return boxed.map((one, line) => one ? boxed.filter((other, at) => (at !== line) && other && !areJoined(parts[line], parts[at]) && boxesMeet(one, other, WITHIN_ITSELF)).length : 0);
};

/** what stopped a gesture within the figure itself: the lines of each pair of its
 *  pieces that meet at the first pose refused (`past`) and stand clear of each other at
 *  the pose it is held at (`held`) */
export const stoppedAmongItself = (cast: Cast, past: Shot, held: Shot, boxOf: (ldraw: string) => PieceBox | undefined): ReadonlyArray<number> => {
  const [pushed, stood, parts] = [boxedOf(cast, past, boxOf), boxedOf(cast, held, boxOf), shotParts(cast, past)];
  const lines = new Set<number>();
  pushed.forEach((one, line) => pushed.forEach((other, at) => {
    const [was, wasOther] = [stood[line], stood[at]];
    if((at <= line) || !one || !other || !was || !wasOther || areJoined(parts[line], parts[at])) return/*each pair once; a piece not measured counts clear, as two joined do*/;
    if(boxesMeet(one, other, WITHIN_ITSELF) && !boxesMeet(was, wasOther, WITHIN_ITSELF)) { lines.add(line); lines.add(at); }
  }));
  return [...lines];
};

/** what stopped a gesture: of the first pose refused (`past`), the lines whose points
 *  pass into the set where the pose it is held at (`held`) stands clear, and the set's
 *  placements those points stand in (`placing`: SEE: probe.ts placing) */
export const stoppedBy = (cast: Cast, past: Shot, held: Shot, boxOf: (ldraw: string) => PieceBox | undefined, placing: (points: ReadonlyArray<Point>) => ReadonlyArray<number | undefined>): Readonly<{ lines: ReadonlyArray<number>; placements: ReadonlyArray<number>; }> => {
  const [points, stood] = [triedPoints(cast, past, boxOf), placing(triedPoints(cast, held, boxOf).flat())];
  const into = placing(points.flat());
  const [lines, placements] = [new Set<number>(), new Set<number>()];
  let at = 0;
  points.forEach((each, line) => each.forEach(() => {
    const placement = into[at];
    if((placement !== undefined) && (stood[at] === undefined)) { lines.add(line); placements.add(placement); }
    at++;
  }));
  return { lines: [...lines], placements: [...placements] };
};

/** a gesture from one pose to another held back at the last pose that passes: `to`
 *  when it passes, else the furthest share of the way there that does (each value
 *  straight between the two, `settle` keeping what the figure keeps: its pinned foot),
 *  `from` when none does */
export const heldBack = (from: Shot, to: Shot, passes: (shot: Shot) => boolean, settle: (shot: Shot) => Shot = shot => shot): Shot => heldShort(from, to, passes, settle).shot;

/** a gesture held back (SEE: heldBack), and the first pose past it that was refused:
 *  where the set stops it. None when the gesture passes whole. The way there is tried
 *  a stride at a time, so a gesture pulled clean through a wall stops at its near face */
export const heldShort = (from: Shot, to: Shot, passes: (shot: Shot) => boolean, settle: (shot: Shot) => Shot = shot => shot): Readonly<{ shot: Shot; past?: Shot; }> => {
  const strides = stridesBetween(from, to);
  let [low, best] = [0, from];
  for(let stride=1; stride<=strides; stride++) {
    const share = stride / strides, tried = (stride === strides) ? to : settle(between(from, to, share));
    if(passes(tried)) { [low, best] = [share, tried]; continue; }
    let [high, past] = [share, tried];
    for(let halving=0; halving<HALVINGS; halving++) {
      const half = (low + high) / 2, halfway = settle(between(from, to, half));
      if(passes(halfway)) [low, best] = [half, halfway]; else [high, past] = [half, halfway];
    }
    return { shot: best, past };
  }
  return { shot: to };
};

/** a figure carried from one footing to another (SEE: setDown), held back as a gesture
 *  is (SEE: heldShort). Between two levels it goes as a hand lifts it: up where it
 *  stands and then across, or across and then down, never through a step's corner on
 *  the straight line between. Stopped on the way up, over or down, it stays where it
 *  stood (never hung in the air); stopped going across on its own level, it stands as
 *  far as it passed */
export const carriedShort = (from: Shot, to: Shot, passes: (shot: Shot) => boolean): Readonly<{ shot: Shot; past?: Shot; }> => {
  const over = Math.max(from.position.height, to.position.height);
  if(from.position.height === to.position.height) return heldShort(from, to, passes);
  const raised = (shot: Shot): Shot => ({ ...shot, position: { ...shot.position, height: over } });
  let at = from;
  for(const leg of [raised(from), raised(to), to]) {
    const { shot, past } = heldShort(at, leg, passes);
    if(past) return { shot: ((at === from) && (shot.position.height === from.position.height)) ? shot/*across its own level*/ : from, past };
    at = leg;
  }
  return { shot: to };
};

// == Marks =======================================================================
/** how far the ring a figure is turned by leans up toward a camera that looks `down`
 *  on the ground by so much (radians): none looked down on steeply; under a lower
 *  camera, as far as shows it RING_LEAST as tall as it is wide, never edge on */
export const ringLean = (down: number): number => Math.max(0, Math.asin(RING_LEAST) - Math.max(0, down));

/** the points of the ring a figure is turned by, RING studs out about a point: level on
 *  the ground, or `seen` by a camera (the way it looks level with the ground, a unit,
 *  and how steeply down), leaned up toward it (SEE: ringLean) about its near side,
 *  which stays on the ground */
export const ringAround = (at: Point, seen?: Readonly<{ x: number; z: number; down: number; }>): ReadonlyArray<Point> => {
  const lean = seen ? ringLean(seen.down) : 0, [away, up] = [Math.cos(lean) - 1, Math.sin(lean) / STUDS_PER_PLATE];
  return Array.from({ length: RING_POINTS + 1 }, (_, index) => {
    const angle = (index / RING_POINTS) * 2 * Math.PI, [x, z] = [RING * Math.sin(angle), RING * Math.cos(angle)];
    const far = seen ? (x * seen.x) + (z * seen.z) : 0/*how far past the middle, away from the camera*/;
    return { x: at.x + x + ((seen?.x ?? 0) * far * away), z: at.z + z + ((seen?.z ?? 0) * far * away), height: at.height + ((RING + far) * up) };
  });
};

/** the point of the ring about a point that lies `degrees` clockwise from north, on the ground */
export const ringPoint = (at: Point, degrees: number): Point =>
  ({ x: at.x + (RING * Math.sin(degrees * (Math.PI / 180))), z: at.z + (RING * Math.cos(degrees * (Math.PI / 180))), height: at.height });

/** where on the ring a point of the picture lies (degrees clockwise from north): the
 *  nearest point of the ring as the picture draws it (`round`: where it shows each of
 *  ringAround's points, in their order), read between the points that trace it. A ring
 *  taken at one point and dragged turns by the difference, whatever camera sees it */
export const ringAngleAt = (round: ReadonlyArray<readonly [number, number]>, [x, y]: readonly [number, number]): number => {
  // the picture's own measure of the ring: its middle, and where it shows its north and its east
  const count = round.length - 1/*its last point closes it*/, quarter = Math.round(count / 4);
  const middle = [0, 1].map(axis => round.slice(0, count).reduce((sum, point) => sum + point[axis], 0) / count);
  const [north, east, to] = [round[0], round[quarter], [x, y]].map(point => [point[0] - middle[0], point[1] - middle[1]]);
  const span = (north[0] * east[1]) - (north[1] * east[0]);
  if(Math.abs(span) < 1e-9) return 0/*seen edge on: no angle to read*/;
  const [northward, eastward] = [((to[0] * east[1]) - (to[1] * east[0])) / span, ((north[0] * to[1]) - (north[1] * to[0])) / span];
  return ((Math.atan2(eastward, northward) * (180 / Math.PI)) + 360) % 360;
};

/** the travel of a figure's held point as `joint` turns (a pinned foot kept): from
 *  where the joint stood when it was taken (`since`; where it stands, not yet moved) to
 *  where it stands, and TRAVEL_LEAD past either end, where it is drawn fading out: none
 *  for a point that turning it never moves */
export const travelOf = (figure: Figure, held: Held, joint: string, since?: number): Travel | undefined => {
  const { cast, shot } = figure, stands = valueOf(shot, joint), was = stands - shortWay(stands - (since ?? stands))/*the short way round from where it was taken*/;
  const [low, high] = [Math.min(was, stands) - TRAVEL_LEAD, Math.max(was, stands) + TRAVEL_LEAD];
  const at = (value: number) => heldAt(cast, settled(figure, withValue(shot, joint, value)), held);
  const path: Point[] = [];
  for(let value=low; value<=high + 1e-9; value+=TRAVEL_STEP) path.push(at(value));
  const ticks: Point[] = [];
  for(let value=Math.ceil((low - 1e-9) / TICK) * TICK; value<=high + 1e-9; value+=TICK) ticks.push(at(value));
  // the joint's axis: through the middle of the circle three of its points lie on, square to it
  const [a, b, c] = [path[0], path[Math.floor(path.length / 2)], path[path.length - 1]].map(spaceOf);
  const [ab, ac] = [minus(b, a), minus(c, a)], normal = cross(ab, ac), area = dot(normal, normal);
  if(area < 1e-12) return undefined/*the point stands on its joint's axis*/;
  const toMiddle = scaled(plus(scaled(cross(normal, ab), dot(ac, ac)), scaled(cross(ac, normal), dot(ab, ab))), 1 / (2 * area));
  const middle = plus(a, toMiddle), along = scaled(normal, AXIS / Math.sqrt(area));
  return { path, ticks, at: at(stands), lead: TRAVEL_LEAD / (high - low), axis: { from: pointOf(minus(middle, along)), to: pointOf(plus(middle, along)) } };
};

/** where a part's travel is drawn: through the point held, out the way it lies from
 *  the joint's axis as far as the far end of what the joint turns. That far end is, of
 *  `lines` (the shot's lines the joint carries), the point furthest from the axis among
 *  each piece's own origin and its box's corners (`boxOf`, none for a piece not
 *  measured), and never nearer the axis than REACH_LEAST: a hand's travel is a dial
 *  about the hand. So the travel passes the hand's own place on the part, as large as
 *  the motion seen; the point held itself when it lies furthest out, or on the axis */
export const reachOf = (figure: Figure, held: Held, joint: string, lines: ReadonlyArray<number>, boxOf: (ldraw: string) => PieceBox | undefined): Held => {
  const axis = travelOf(figure, held, joint)?.axis;
  if(!axis) return held/*the point stands on its joint's axis: nothing to measure from*/;
  const [from, along] = [spaceOf(axis.from), minus(spaceOf(axis.to), spaceOf(axis.from))], length = dot(along, along);
  const across = (point: Point): Vector => { const to = minus(spaceOf(point), from); return minus(to, scaled(along, dot(to, along) / length)); };
  const out = (point: Point): number => { const way = across(point); return Math.sqrt(dot(way, way)); };
  const drawn = shotLines(figure.cast, [figure.shot]);
  const furthest = Math.max(...lines.flatMap(line => {
    const box = boxOf(drawn[line].ldraw);
    const corners = box ? [box.min[0], box.max[0]].flatMap(x => [box.min[1], box.max[1]].flatMap(y => [box.min[2], box.max[2]].map(z => [x, y, z] as const))) : [];
    return [[0, 0, 0] as const, ...corners].map(own => out(heldAt(figure.cast, figure.shot, { line, own })));
  }));
  const far = Math.max(furthest, REACH_LEAST)/*a small part's travel is drawn about it, large enough to read*/;
  const stands = heldAt(figure.cast, figure.shot, held), way = across(stands), near = Math.sqrt(dot(way, way));
  if((near < 1e-9) || (far <= near)) return held;
  return heldOf(figure.cast, figure.shot, held.line, pointOf(plus(spaceOf(stands), scaled(way, (far / near) - 1))));
};

/** the way a figure faces, seen from above (degrees clockwise from north), read from
 *  the figure itself: the front of its first line that is no part of a limb (its hips;
 *  a thing's own first line), which LDraw stands toward its own -z */
export const forwardOf = (cast: Cast, shot: Shot): number => {
  const parts = shotParts(cast, shot), line = Math.max(0, parts.includes('hips') ? parts.indexOf('hips') : parts.indexOf(undefined));
  const [at, front] = [heldAt(cast, shot, { line, own: [0, 0, 0] }), heldAt(cast, shot, { line, own: [0, 0, -LDU_PER_STUD] })];
  return (angleAbout(at, front) + 360) % 360;
};

/** the angle of a point about another, seen from above (degrees clockwise from north) */
export const angleAbout = (at: Point, point: Point): number => Math.atan2(point.x - at.x, point.z - at.z) * (180 / Math.PI);

// == Internal ====================================================================
// the points of each line a shot draws that are tried against the set: its piece's
// corners, its faces' middles and its own, each WITHIN its box; none for a piece not
// measured
const triedPoints = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined): ReadonlyArray<ReadonlyArray<Point>> =>
  shotLines(cast, [shot]).map(line => {
    const box = boxOf(line.ldraw);
    if(!box) return [];
    const [low, high] = [0, 1, 2].reduce<[number[], number[]]>(([lows, highs], axis) => { const inset = Math.min(WITHIN, (box.max[axis] - box.min[axis]) / 2); return [[...lows, box.min[axis] + inset], [...highs, box.max[axis] - inset]]; }, [[], []]);
    const middle = low.map((value, axis) => (value + high[axis]) / 2);
    const tried: number[][] = [middle];
    for(const x of [low[0], high[0]]) for(const y of [low[1], high[1]]) for(const z of [low[2], high[2]]) tried.push([x, y, z]);
    for(const axis of [0, 1, 2]) for(const end of [low, high]) tried.push(middle.map((value, each) => (each === axis) ? end[axis] : value));
    return tried.map(own => placed(line, own));
  });

// whether two parts of a figure never stop each other: two parts of its body, or a
// thing worn and the part it turns on (a line that is no named part is of its hips)
const areJoined = (one: string | undefined, other: string | undefined): boolean => {
  const [a, b] = [one ?? 'hips', other ?? 'hips'];
  return (BODY.includes(a) && BODY.includes(b)) || WORN.some(([part, worn]) => ((part === a) && (worn === b)) || ((part === b) && (worn === a)));
};

// each line a shot draws with its piece's box, none for a piece not measured
const boxedOf = (cast: Cast, shot: Shot, boxOf: (ldraw: string) => PieceBox | undefined): ReadonlyArray<Boxed | undefined> =>
  shotLines(cast, [shot]).map(line => { const box = boxOf(line.ldraw); return box && { line, box }; });

// a piece's box as its line stands it in the scene (LDU): its middle, its three axes
// and how far it reaches along each, tried `within` its box
const standing = ({ line: { position, matrix }, box }: Boxed, within: number): Readonly<{ middle: Vector; axes: ReadonlyArray<Vector>; half: Vector; }> => {
  const own = [0, 1, 2].map(axis => (box.min[axis] + box.max[axis]) / 2);
  const reach = (axis: number) => { const whole = (box.max[axis] - box.min[axis]) / 2; return whole - Math.min(within, whole); };
  const stands = (row: number) => position[row] + (matrix[row * 3] * own[0]) + (matrix[(row * 3) + 1] * own[1]) + (matrix[(row * 3) + 2] * own[2]);
  return {
    middle: [stands(0), stands(1), stands(2)],
    axes: [0, 1, 2].map(column => [matrix[column], matrix[3 + column], matrix[6 + column]] as const), half: [reach(0), reach(1), reach(2)],
  };
};

// a point as a vector in one unit (studs east, up and north), and back
type Vector = readonly [number, number, number];
const spaceOf = ({ x, z, height }: Point): Vector => [x, height * STUDS_PER_PLATE, z];
const pointOf = ([x, y, z]: Vector): Point => ({ x, z, height: y / STUDS_PER_PLATE });
const minus = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const plus = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scaled = (a: Vector, by: number): Vector => [a[0] * by, a[1] * by, a[2] * by];
const dot = (a: Vector, b: Vector): number => (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
const cross = (a: Vector, b: Vector): Vector => [(a[1] * b[2]) - (a[2] * b[1]), (a[2] * b[0]) - (a[0] * b[2]), (a[0] * b[1]) - (a[1] * b[0])];

// where a point of a line's own frame stands in the scene
const placed = ({ position, matrix }: Readonly<{ position: ReadonlyArray<number>; matrix: ReadonlyArray<number>; }>, own: ReadonlyArray<number>): Point => {
  const [x, y, z] = [0, 1, 2].map(row => position[row] + (matrix[row * 3] * own[0]) + (matrix[(row * 3) + 1] * own[1]) + (matrix[(row * 3) + 2] * own[2]));
  return { x: x / LDU_PER_STUD, z: z / LDU_PER_STUD, height: -y / LDU_PER_PLATE };
};

// an angle as a gesture names it: within a half turn either way, to the tenth of a degree
const named = (angle: number): number => (Math.round(((((angle + 180) % 360) + 360) % 360) * TENTHS) / TENTHS) - 180 || 0;

// how many strides a gesture takes from one shot to another: by how far it goes and
// by the most any of its turns and joints turns
const stridesBetween = (from: Shot, to: Shot): number => {
  const far = Math.hypot(to.position.x - from.position.x, to.position.z - from.position.z, (to.position.height - from.position.height) * STUDS_PER_PLATE);
  const pose: Readonly<Record<string, number | undefined>> = from.pose ?? {}, posed: Readonly<Record<string, number | undefined>> = to.pose ?? {};
  const turns = [to.turn.yaw - from.turn.yaw, to.turn.pitch - from.turn.pitch, to.turn.roll - from.turn.roll, ...[...new Set([...Object.keys(pose), ...Object.keys(posed)])].map(joint => (posed[joint] ?? 0) - (pose[joint] ?? 0))];
  return Math.max(1, Math.ceil(far / STRIDE), Math.ceil(Math.max(...turns.map(turn => Math.abs(shortWay(turn)))) / STRIDE_TURN));
};

// an angle turned through, the short way round (degrees, -180 to 180)
const shortWay = (angle: number): number => ((((angle + 180) % 360) + 360) % 360) - 180;

// a shot a share of the way from one to another: its place, its turn and its joints
const between = (from: Shot, to: Shot, share: number): Shot => {
  const mix = (a: number, b: number) => a + ((b - a) * share), turn = (a: number, b: number) => a + (shortWay(b - a) * share)/*an angle goes the short way round*/;
  const joints = new Set([...Object.keys(from.pose ?? {}), ...Object.keys(to.pose ?? {})]);
  const pose: Readonly<Record<string, number | undefined>> = from.pose ?? {}, posed: Readonly<Record<string, number | undefined>> = to.pose ?? {};
  return {
    ...to,
    position: { x: mix(from.position.x, to.position.x), z: mix(from.position.z, to.position.z), height: mix(from.position.height, to.position.height) },
    turn: { yaw: turn(from.turn.yaw, to.turn.yaw), pitch: turn(from.turn.pitch, to.turn.pitch), roll: turn(from.turn.roll, to.turn.roll) },
    ...((joints.size > 0) ? { pose: Object.fromEntries([...joints].map(joint => [joint, turn(pose[joint] ?? 0, posed[joint] ?? 0)])) } : {}),
  };
};
