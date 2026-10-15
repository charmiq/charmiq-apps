import type { CatalogPart } from './catalog';

// a posable part's pose (a figure's): each limb at an angle in whole POSE_STEPs. A
// swing (an arm, a leg) raises the limb forward by its angle, a turn (the head) turns
// it clockwise seen from above, as a placement's rotation turns; at 0 the limb is
// where the part's pieces put it. A limb turns rigidly about its pivot piece's origin
// on that piece's own axis, its other pieces (an arm's hand) carried with it. Shared
// by the grid (the lines a pose writes and reads back) and the part measurer (the
// cells each limb fills at each angle), so the two never disagree
// ********************************************************************************
// == Constants ===================================================================
/** a figure's limbs, each at its own angle */
export const LIMBS = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type Limb = typeof LIMBS[number];

/** the step a limb's angle takes (degrees) */
export const POSE_STEP = 15;
/** every angle a limb takes: whole steps from -180 up to (not including) 180 */
export const POSE_ANGLES: ReadonlyArray<number> = Array.from({ length: 360 / POSE_STEP }, (_, index) => -180 + (index * POSE_STEP));

// == Types =======================================================================
/** a limb's angle by limb; a limb not named is at 0 */
export type Pose = Readonly<Partial<Record<Limb, number>>>;

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
/** a part's pieces as lines, as its catalog entry writes them */
export const pieceLines = (part: CatalogPart): PieceLine[] => (part.pieces ?? []).map(line => {
  const fields = line.trim().split(/\s+/);
  const values = fields.slice(1, 14).map(Number);
  return { ldraw: fields[14].replace(/\.dat$/i, ''), colorCode: values[0], position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
});

/** the lines of `limb`'s pieces at `angle` (its pivot first) */
export const limbLines = (part: CatalogPart, limb: Limb, angle: number): PieceLine[] => {
  const { pieces, axis } = part.limbs![limb]/*by contract*/;
  const lines = pieceLines(part);
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

/** every piece of a part at a pose, in its catalog order, its legs pieces in
 *  `legsColor` when given */
export const posedPieces = (part: CatalogPart, pose: Pose | undefined, legsColor?: number): PieceLine[] => {
  const lines = pieceLines(part);
  for(const limb of LIMBS) {
    const angle = pose?.[limb] ?? 0;
    if((angle === 0) || !part.limbs) continue;
    const moved = limbLines(part, limb, angle);
    part.limbs[limb].pieces.forEach((index, order) => { lines[index] = moved[order]; });
  }
  if(legsColor !== undefined) for(const index of part.legs ?? []) lines[index] = { ...lines[index], colorCode: legsColor };
  return lines;
};

// == Matrices ====================================================================
// row-major 3x3 rotation rows (a b c / d e f / g h i), as LDraw writes them
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** a swing raising a limb forward by `angle`: its local +y (hanging) toward -z (the
 *  part's front) */
const swingOf = (angle: number): number[] => {
  const [cos, sin] = [Math.cos(radians(angle)), Math.sin(radians(angle))];
  return [1, 0, 0, 0, cos, sin, 0, -sin, cos];
};

/** a turn clockwise seen from above by `angle`, as a placement's rotation turns */
const turnOf = (angle: number): number[] => {
  const [cos, sin] = [Math.cos(radians(angle)), Math.sin(radians(angle))];
  return [cos, 0, sin, 0, 1, 0, -sin, 0, cos];
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
