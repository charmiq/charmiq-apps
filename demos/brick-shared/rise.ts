// how far a figure's pose raises its lowest point over its soles (plates): a figure's
// height is its lowest point, as a build's level is (a seated figure's on its seat),
// and it is drawn from its soles that far below it. Both legs at 90 rest it on its
// hips, 2.4 plates up; a stride's toe dipping below its soles raises nothing. Brick
// Studio measures each body's bounding box at every 15 degrees (its pose geometry) and
// gives that table to the film with its stage; between the measured angles each runs
// straight, so a figure sitting down settles smoothly. A figure turns (pitch and roll)
// about its hips, its legs' axle, as a body in the air turns about its middle, and its
// height stays its lowest point turned: a figure keyed lying at a mat's top lies on it
// ********************************************************************************
// == Constants ===================================================================
/** the angles a body's box is measured at (degrees) */
const STEP = 15/*degrees*/;
/** a figure's hips, its legs' axle, over its soles at its footprint's middle (plates):
 *  the point it turns about */
export const HIPS = 3.5;
const STUDS_PER_PLATE = 0.4;

// == Types =======================================================================
/** a body's bounding box in its figure's frame standing: how high its lowest point and
 *  its top lie over the soles (plates), and how far it reaches across (`x`, east) and
 *  along (`z`, north) the footprint's middle (studs, least first) */
export type BodyBox = Readonly<{ bottom: number; top: number; x: readonly [number, number]; z: readonly [number, number]; }>;
/** where a figure's limb turns, as its pose is drawn (SEE: Brick Studio's pose.ts
 *  limbLines): its pivot piece's origin, studs east (`x`) and north (`z`) of the
 *  footprint's middle and plates over the soles (`height`); the pivot's own axis it
 *  turns on (`x` a swing raising it forward, `y` a turn clockwise seen from above); and
 *  the pivot's own rows, as LDraw writes them (its y down), whose axes it turns about */
export type Joint = Readonly<{ at: Readonly<{ x: number; z: number; height: number; }>; axis: 'x' | 'y'; matrix: ReadonlyArray<number>; }>;
/** a figure's bodies' boxes: its core (torso and hips), and each limb's at each
 *  measured angle, keyed by the angle; and each limb's joint, by limb */
export type PoseBottoms = Readonly<{ core: BodyBox; limbs: Readonly<Record<string, Readonly<Record<string, BodyBox>>>>; joints?: Readonly<Record<string, Joint>>; }>;
/** how a figure is tipped from upright (degrees): `pitch` raising its south side (its
 *  front), `roll` its west side */
export type Tilt = Readonly<{ pitch: number; roll: number; }>;

// == Rise ========================================================================
/** how far `pose` (degrees by limb, a limb it names none of at 0) raises a figure's
 *  lowest point over its soles (plates, never below 0) */
export const poseRise = (bottoms: PoseBottoms, pose: Readonly<Partial<Record<string, number>>> | undefined): number =>
  Math.max(0, Math.min(...bodiesOf(bottoms, pose).map(body => body.bottom)));

/** how far a figure's lowest point lies under its hips (plates), posed as `pose` and
 *  tipped by `tilt` (its yaw turns nothing up or down): the deepest corner of any of its
 *  bodies' boxes, each standing on its soles at the least (a stride's toe dipping below
 *  them reaches no lower, SEE: poseRise). Upright, its hips less its pose's rise; lying
 *  on its back, its head's back. Exact where each box lies square (upright, lying on a
 *  face or side), and a hair deep between. Without `bottoms` (no stage has measured the
 *  figure), its soles' middle is its lowest point */
export const hipsOver = (bottoms: PoseBottoms | undefined, pose: Readonly<Partial<Record<string, number>>> | undefined, { pitch, roll }: Tilt): number => {
  const [cp, sp, cr, sr] = [Math.cos(radians(pitch)), Math.sin(radians(pitch)), Math.cos(radians(roll)), Math.sin(radians(roll))];
  if(!bottoms) return HIPS * cp * cr;
  // a corner's depth under the hips, plates: rolled (its east down), then pitched (its
  // north down), as the stage turns a figure (SEE: Brick Studio's stage)
  const [across, along, up] = [cp * sr / STUDS_PER_PLATE, sp / STUDS_PER_PLATE, cp * cr];
  return Math.max(...bodiesOf(bottoms, pose).map(({ bottom, top, x, z }) =>
    (across * ((across > 0) ? x[1] : x[0])) + (along * ((along > 0) ? z[1] : z[0])) - (up * (((up > 0) ? Math.max(0, bottom) : top) - HIPS))));
};

/** where a figure's hips stand from its lowest point as it would stand upright (its
 *  soles, raised by its pose's rise: SEE poseRise), tipped by `tilt` and turned to `yaw`
 *  (degrees, clockwise seen from above): studs east and north and plates up. What places
 *  a figure by where its soles stand (rolled about a foot's edge, riding a seat) places
 *  its hips so */
export const hipsFromSoles = (bottoms: PoseBottoms | undefined, pose: Readonly<Partial<Record<string, number>>> | undefined, { pitch, roll }: Tilt, yaw: number): Readonly<{ x: number; z: number; height: number; }> => {
  const over = HIPS - (bottoms ? poseRise(bottoms, pose) : 0)/*plates*/;
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(radians(yaw)), Math.sin(radians(yaw)), Math.cos(radians(pitch)), Math.sin(radians(pitch)), Math.cos(radians(roll)), Math.sin(radians(roll))];
  const reach = over * STUDS_PER_PLATE/*studs*/;
  return { x: reach * ((cy * sr) + (sy * sp * cr)), z: reach * ((cy * sp * cr) - (sy * sr)), height: over * cp * cr };
};

// == Bodies ======================================================================
/** each of a figure's bodies' boxes at `pose`: its core, and each limb at its angle */
export const bodiesOf = (bottoms: PoseBottoms, pose: Readonly<Partial<Record<string, number>>> | undefined): ReadonlyArray<BodyBox> =>
  [bottoms.core, ...Object.entries(bottoms.limbs).map(([limb, measured]) => bodyAt(measured, pose?.[limb] ?? 0))];

// == Internal ====================================================================
const radians = (degrees: number): number => degrees * (Math.PI / 180);

/** a limb's box at any angle: each of its extents straight between the measured angles
 *  about it */
const bodyAt = (measured: Readonly<Record<string, BodyBox>>, angle: number): BodyBox => {
  const turned = ((((angle + 180) % 360) + 360) % 360) - 180/*-180 to 180*/;
  const below = Math.floor(turned / STEP) * STEP, above = below + STEP;
  const [low, high] = [measured[String(below)], measured[String((above >= 180) ? (above - 360) : above)]];
  if(!low || !high) return (low ?? high)!/*by contract: every angle measured*/;
  const u = (turned - below) / STEP, lerp = (a: number, b: number) => a + ((b - a) * u);
  return { bottom: lerp(low.bottom, high.bottom), top: lerp(low.top, high.top), x: [lerp(low.x[0], high.x[0]), lerp(low.x[1], high.x[1])], z: [lerp(low.z[0], high.z[0]), lerp(low.z[1], high.z[1])] };
};
