import { hipsOver, soleFromHips, type PoseBottoms } from './rise';
import { rotation, type Turn } from './turn';

// a figure's planted foot: where the middle of a leg's sole stands with the figure
// placed, turned and posed, and the place that keeps it there. A figure turns about its
// hips, which stand over its lowest point (its position's height) as its pose and its
// tilt put them (SEE: rise.ts hipsOver), so the place that keeps a contact is the place
// less how far the contact moved: exact in one step. Shared by the studio, which pivots
// a figure about a pinned foot as it is dragged, and the film, which keeps the pin
// through a value typed
// ********************************************************************************
// == Constants ===================================================================
const LDU_PER_STUD = 20, LDU_PER_PLATE = 8;

// == Types =======================================================================
/** a point of a scene: studs east and north, plates up */
export type Place = Readonly<{ x: number; z: number; height: number; }>;
/** a figure as a frame stands it: its place (its lowest point), its turn and its pose's
 *  joints (degrees by joint; one not named at 0) */
export type Posed = Readonly<{ position: Place; turn: Turn; pose?: Readonly<Partial<Record<string, number>>>; }>;
/** a leg whose foot plants */
export type Leg = 'leftLeg' | 'rightLeg';

// == Contact =====================================================================
/** where a foot's contact stands: the middle of its `leg`'s sole, as the studio draws
 *  it (SEE: rise.ts soleFromHips) */
export const soleAt = (bottoms: PoseBottoms | undefined, { position, turn, pose }: Posed, leg: Leg): Place => {
  const hips = { ...position, height: position.height + hipsOver(bottoms, pose, turn) };
  return placeIn(hips, rotation(turn), soleFromHips(bottoms, leg, pose?.[leg] ?? 0));
};

/** a figure moved so its planted foot's contact stands at `at`: its turn and its pose
 *  as they are, the figure pivoting about that foot */
export const plantedAt = (bottoms: PoseBottoms | undefined, posed: Posed, leg: Leg, at: Place): Posed => {
  const stands = soleAt(bottoms, posed, leg), { position } = posed;
  return { ...posed, position: { x: position.x + (at.x - stands.x), z: position.z + (at.z - stands.z), height: position.height + (at.height - stands.height) } };
};

// == Frames ======================================================================
/** a point at an offset (studs across and along, plates up) in the frame of an actor
 *  standing at `origin` turned by `matrix` (SEE: turn.ts rotation) */
export const placeIn = (origin: Place, matrix: ReadonlyArray<number>, offset: Place): Place => {
  const local = [offset.x * LDU_PER_STUD, -offset.height * LDU_PER_PLATE, offset.z * LDU_PER_STUD];
  const moved = [0, 1, 2].map(row => (matrix[row * 3] * local[0]) + (matrix[(row * 3) + 1] * local[1]) + (matrix[(row * 3) + 2] * local[2]));
  return { x: origin.x + (moved[0] / LDU_PER_STUD), z: origin.z + (moved[2] / LDU_PER_STUD), height: origin.height - (moved[1] / LDU_PER_PLATE) };
};
