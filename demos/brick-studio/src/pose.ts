import type { Accessory, CatalogPart, FigureFace, Grip, Slot } from './catalog';

// a posable part's pose (a figure's): each limb at an angle in whole POSE_STEPs. A
// swing (an arm, a leg) raises the limb forward by its angle, a turn (the head) turns
// it clockwise seen from above, as a placement's rotation turns; at 0 the limb is
// where the part's pieces put it. A limb turns rigidly about its pivot piece's origin
// on that piece's own axis, its other pieces (an arm's hand) carried with it. A
// hinge's top turns the same way, in the same steps, about its knuckle's axis.
// Shared by the grid (the lines a pose or a hinge writes and reads back) and the part
// measurer (the cells each limb and each hinge top fills at each angle), so the two
// never disagree
// ********************************************************************************
// == Constants ===================================================================
/** a figure's limbs, each at its own angle */
export const LIMBS = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type Limb = typeof LIMBS[number];

/** a figure's further joints, which a stage's frame alone turns, at any angle: its
 *  upper body's twist (clockwise seen from above) and lean (forward), and each hand's
 *  turn on its forearm (the right clockwise as the figure looks down its arm, the left
 *  mirroring it). A build's figure stands with them at 0, and its cells are measured
 *  without them */
export const FRAME_LIMBS = ['twist', 'lean', 'rightWrist', 'leftWrist'] as const;
export type FrameLimb = typeof FRAME_LIMBS[number];

/** the step a limb's angle takes (degrees) */
export const POSE_STEP = 15;
/** every angle a limb takes: whole steps from -180 up to (not including) 180 */
export const POSE_ANGLES: ReadonlyArray<number> = Array.from({ length: 360 / POSE_STEP }, (_, index) => -180 + (index * POSE_STEP));

// == Types =======================================================================
/** a limb's angle by limb (a stage's frame's further joints too); a limb not named is
 *  at 0 */
export type Pose = Readonly<Partial<Record<Limb | FrameLimb, number>>>;

/** one of a part's pieces as a line: its file (stem), color and transform (LDU, in
 *  the part's own frame) */
export type PieceLine = Readonly<{ ldraw: string; colorCode: number; position: readonly [number, number, number]; matrix: readonly number[]; }>;

// == Angles ======================================================================
/** an angle as a limb takes it: a whole number of POSE_STEPs (a safe integer) turned
 *  into -180 up to (not including) 180 (360 is 0, 180 is -180); undefined for any other
 *  value */
export const toPoseAngle = (value: unknown): number | undefined => {
  if((typeof value !== 'number') || !Number.isSafeInteger(value) || ((value % POSE_STEP) !== 0)) return undefined/*past a safe integer, its arithmetic is not exact*/;
  const wrapped = ((((value % 360) + 540) % 360)) - 180/*reduced first: exact for any safe integer*/;
  return Object.is(wrapped, -0) ? 0 : wrapped;
};

/** the pose with every limb at 0 left out: undefined when none is turned */
export const normalizePose = (pose: Pose | undefined): Pose | undefined => {
  const turned = LIMBS.filter(limb => (pose?.[limb] ?? 0) !== 0);
  return (turned.length > 0) ? Object.fromEntries(turned.map(limb => [limb, pose![limb]!])) : undefined;
};

// == Pieces ======================================================================
/** a part's pieces as lines, as its catalog entry writes them, its face piece printed
 *  with `face` when one is given (SEE: catalog.ts FIGURE_FACES; a print's back is
 *  turned to the front in posedPieces alone) */
export const pieceLines = (part: CatalogPart, face?: FigureFace): PieceLine[] => (part.pieces ?? []).map((line, index) => {
  const fields = line.trim().split(/\s+/);
  const values = fields.slice(1, 14).map(Number);
  const printed = (index === part.facePiece) ? face?.ldraw : undefined;
  return { ldraw: printed ?? fields[14].replace(/\.dat$/i, ''), colorCode: values[0], position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
});

/** the lines of `limb`'s pieces at `angle` (its pivot first), wearing `face` */
export const limbLines = (part: CatalogPart, limb: Limb, angle: number, face?: FigureFace): PieceLine[] => {
  const { pieces, axis } = part.limbs![limb]/*by contract*/;
  const lines = pieceLines(part, face);
  if(angle === 0) return pieces.map(index => lines[index])/*exactly as the part writes them*/;
  const pivot = lines[pieces[0]];
  const turn = conjugate(pivot.matrix, (axis === 'x') ? swingOf(angle) : turnOf(angle));
  return pieces.map(index => {
    const piece = lines[index];
    const offset = piece.position.map((value, axisIndex) => value - pivot.position[axisIndex]);
    const moved = multiplyVector(turn, offset);
    return { ...piece, position: [moved[0] + pivot.position[0], moved[1] + pivot.position[1], moved[2] + pivot.position[2]], matrix: multiply(turn, piece.matrix) };
  });
};

/** every piece of a part at a pose, in its catalog order, wearing `face`, its legs
 *  pieces in `legsColor` when given, then the accessories it wears, in slot order.
 *  Each limb turns first, then each hand on its forearm, then the upper body (SEE:
 *  upperTurn), what is held turning with what holds it */
export const posedPieces = (part: CatalogPart, pose: Pose | undefined, legsColor?: number, worn?: Worn, face?: FigureFace): PieceLine[] => {
  const lines = pieceLines(part, face);
  for(const limb of LIMBS) {
    const angle = pose?.[limb] ?? 0;
    if((angle === 0) || !part.limbs) continue;
    const moved = limbLines(part, limb, angle, face);
    part.limbs[limb].pieces.forEach((index, order) => { lines[index] = moved[order]; });
  }
  for(const [wrist, slot, side] of [['rightWrist', 'rightHand', 1], ['leftWrist', 'leftHand', -1]] as const) {
    const angle = pose?.[wrist] ?? 0, hand = part.slots?.[slot]?.piece;
    if((angle === 0) || (hand === undefined)) continue;
    lines[hand] = { ...lines[hand], matrix: multiply(lines[hand].matrix, bankOf(side * angle)) }/*about its own z, along its forearm*/;
  }
  const upper = upperTurn(part, pose);
  if(upper) for(const index of part.waist!.upper) lines[index] = turned(lines[index], upper);
  if(legsColor !== undefined) for(const index of part.legs ?? []) lines[index] = { ...lines[index], colorCode: legsColor };
  const gear = SLOTS_IN_ORDER.flatMap(slot => worn?.[slot] ? [accessoryLine(part, slot, lines[part.slots![slot].piece], worn[slot]!.accessory, worn[slot]!.grip, worn[slot]!.colorCode)] : []);
  // a print's back turned to the front on the head alone, after what the head wears
  // has taken its place from it
  if(face && ('back' in face) && (part.facePiece !== undefined)) lines[part.facePiece] = { ...lines[part.facePiece], matrix: multiply(lines[part.facePiece].matrix, HALF_TURN_ABOUT_Y) };
  return [...lines, ...gear];
};

/** how a part's upper body turns at a pose: its twist about the vertical through its
 *  origin, then its lean forward about its hip; undefined when it does neither (SEE:
 *  CatalogPart#waist) */
export const upperTurn = (part: CatalogPart, pose: Pose | undefined): Turn | undefined => {
  const [twist, lean] = [pose?.twist ?? 0, pose?.lean ?? 0];
  if(!part.waist || ((twist === 0) && (lean === 0))) return undefined;
  const turning = turnAbout('y', [0, 0, 0], twist), leaning = turnAbout('x', part.waist.hip, -lean)/*its top toward its front*/;
  const moved = multiplyVector(leaning.matrix, turning.position);
  return { matrix: multiply(leaning.matrix, turning.matrix), position: [moved[0] + leaning.position[0], moved[1] + leaning.position[1], moved[2] + leaning.position[2]] };
};

// == Accessories =================================================================
/** what a part wears, by slot: each accessory, how it is held (its first grip when
 *  none is named) and its color code */
export type Worn = Readonly<Partial<Record<Slot, Readonly<{ accessory: Accessory; grip?: Grip; colorCode: number; }>>>>;

/** the slots in the order their accessories are written */
export const SLOTS_IN_ORDER: ReadonlyArray<Slot> = ['hat', 'rightHand', 'leftHand'];
/** the limb each slot turns with */
export const SLOT_LIMB: Readonly<Record<Slot, Limb>> = { hat: 'head', rightHand: 'rightArm', leftHand: 'leftArm' };

/** an accessory's line where a slot's piece (`carrier`, posed) puts it: headgear at
 *  the head's transform; a held item with the bar of `grip` (its first when none is
 *  given) in the hand's grip, its point `at` on its axis at the grip's centre (SEE:
 *  catalog.ts ACCESSORIES) */
export const accessoryLine = (part: CatalogPart, slot: Slot, carrier: PieceLine, accessory: Accessory, grip: Grip | undefined, colorCode: number): PieceLine => {
  const { grip: frame } = part.slots![slot];
  const bar = grip ?? accessory.grips?.[0];
  if(!bar || !frame) return { ldraw: accessory.ldraw, colorCode, position: carrier.position, matrix: carrier.matrix };
  const matrix = multiply(multiply(multiply(carrier.matrix, frame.matrix), (bar.axis === 'y') ? IDENTITY : Z_ALONG_Y), !bar.flip ? IDENTITY : (bar.axis === 'y') ? HALF_TURN_ABOUT_Y : HALF_TURN_ABOUT_Z);
  const centre = multiplyVector(carrier.matrix, frame.position).map((value, axis) => value + carrier.position[axis]);
  const held = multiplyVector(matrix, (bar.axis === 'y') ? [0, bar.at, 0] : [0, 0, bar.at]);
  return { ldraw: accessory.ldraw, colorCode, position: [centre[0] - held[0], centre[1] - held[1], centre[2] - held[2]], matrix };
};

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** a quarter turn taking an item's z (the axis it lies along) to y */
const Z_ALONG_Y = [1, 0, 0, 0, 0, 1, 0, -1, 0];
/** a half turn of an item about its bar, along y or along z (SEE: Grip#flip) */
const HALF_TURN_ABOUT_Y = [-1, 0, 0, 0, 1, 0, 0, 0, -1];
const HALF_TURN_ABOUT_Z = [-1, 0, 0, 0, -1, 0, 0, 0, 1];

// == Hinges ======================================================================
/** where a hinge's top at `angle` moves a point of the part's frame: a turn about
 *  the axis through its pivot (SEE: CatalogPart#hinge), as rotation rows and the
 *  position the origin goes to (LDU) */
export const hingeTurn = (part: CatalogPart, angle: number): Turn => {
  const { axis, pivot } = part.hinge!/*by contract*/;
  return turnAbout(axis, pivot, angle);
};

/** every piece of a hinge with its top at `angle`, in its catalog order (at 0
 *  exactly as the part writes them) */
export const hingePieces = (part: CatalogPart, angle: number): PieceLine[] => {
  const lines = pieceLines(part);
  if(angle === 0) return lines;
  const { piece } = part.hinge!/*by contract*/;
  lines[piece] = turned(lines[piece], hingeTurn(part, angle));
  return lines;
};

// == Wheels ======================================================================
/** every piece of a wheel set with its wheels turned by `angle`, in its catalog
 *  order: each wheel's pieces about the east-west axis through its hub. A positive
 *  angle turns them as rolling north turns them (SEE: CatalogPart#wheels) */
export const wheelPieces = (part: CatalogPart, angle: number): PieceLine[] => {
  const lines = pieceLines(part);
  if(angle === 0) return lines;
  for(const wheel of part.wheels!.turning/*by contract*/) {
    const turn = turnAbout('x', lines[wheel[0]].position, angle);
    for(const index of wheel) lines[index] = turned(lines[index], turn);
  }
  return lines;
};

// == Turns =======================================================================
/** a turn of a part's frame about an axis through a point: its rotation rows and
 *  where it moves the origin (LDU) */
export type Turn = Readonly<{ matrix: number[]; position: [number, number, number]; }>;

/** a turn by `angle` about the axis through `pivot` (LDU, in the part's frame): `x`
 *  raising its south side, `y` clockwise seen from above */
const turnAbout = (axis: 'x' | 'y', pivot: readonly number[], angle: number): Turn => {
  const matrix = (axis === 'x') ? swingOf(angle) : turnOf(angle);
  const moved = multiplyVector(matrix, pivot);
  return { matrix, position: [pivot[0] - moved[0], pivot[1] - moved[1], pivot[2] - moved[2]] };
};

/** a piece moved by a turn */
const turned = (piece: PieceLine, turn: Turn): PieceLine => {
  const moved = multiplyVector(turn.matrix, piece.position);
  return { ...piece, position: [moved[0] + turn.position[0], moved[1] + turn.position[1], moved[2] + turn.position[2]], matrix: multiply(turn.matrix, piece.matrix) };
};

// == Matrices ====================================================================
// row-major 3x3 rotation rows (a b c / d e f / g h i), as LDraw writes them
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** a swing raising a limb forward by `angle`: its local +y (hanging) toward -z (the
 *  part's front) */
export const swingOf = (angle: number): number[] => {
  const [cos, sin] = [Math.cos(radians(angle)), Math.sin(radians(angle))];
  return [1, 0, 0, 0, cos, sin, 0, -sin, cos];
};

/** a turn clockwise seen from above by `angle`, as a placement's rotation turns */
export const turnOf = (angle: number): number[] => {
  const [cos, sin] = [Math.cos(radians(angle)), Math.sin(radians(angle))];
  return [cos, 0, sin, 0, 1, 0, -sin, 0, cos];
};

/** a bank by `angle` about the north-south axis: its west side up, its east side down */
export const bankOf = (angle: number): number[] => {
  const [cos, sin] = [Math.cos(radians(angle)), Math.sin(radians(angle))];
  return [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
};

const multiply = (a: readonly number[], b: readonly number[]): number[] =>
  [0, 1, 2].flatMap(row => [0, 1, 2].map(col => (a[row*3] * b[col]) + (a[row*3 + 1] * b[3 + col]) + (a[row*3 + 2] * b[6 + col])));

const multiplyVector = (m: readonly number[], v: readonly number[]): number[] =>
  [0, 1, 2].map(row => (m[row*3] * v[0]) + (m[row*3 + 1] * v[1]) + (m[row*3 + 2] * v[2]));

/** a rotation about the pivot's own axes, in the part's frame: the pivot's matrix,
 *  the rotation, then the pivot's inverse (the exact inverse: a library matrix is
 *  rounded, and at 0 the limb stays exactly where it is written) */
const conjugate = (pivot: readonly number[], rotation: readonly number[]): number[] =>
  multiply(multiply(pivot, rotation), inverse(pivot));

const inverse = (m: readonly number[]): number[] => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = (a * ((e * i) - (f * h))) - (b * ((d * i) - (f * g))) + (c * ((d * h) - (e * g)));
  return [
    ((e * i) - (f * h)) / det, ((c * h) - (b * i)) / det, ((b * f) - (c * e)) / det,
    ((f * g) - (d * i)) / det, ((a * i) - (c * g)) / det, ((c * d) - (a * f)) / det,
    ((d * h) - (e * g)) / det, ((b * g) - (a * h)) / det, ((a * e) - (b * d)) / det,
  ];
};
