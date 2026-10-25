// how far a figure's pose raises its lowest point over its soles (plates): a figure's
// height is its lowest point, as a build's level is (a seated figure's on its seat),
// and it is drawn from its soles that far below it. Both legs at 90 rest it on its
// hips, 2.4 plates up; a stride's toe dipping below its soles raises nothing. Brick
// Studio measures each body's lowest point at every 15 degrees (its pose geometry) and
// gives that table to the film with its stage; between the measured angles the rise
// runs straight, so a figure sitting down settles smoothly
// ********************************************************************************
// == Constants ===================================================================
/** the angles a body's lowest point is measured at (degrees) */
const STEP = 15/*degrees*/;

// == Types =======================================================================
/** a figure's bodies' lowest points over its soles (plates): its core (torso and
 *  hips), and each limb's at each measured angle, keyed by the angle */
export type PoseBottoms = Readonly<{ core: number; limbs: Readonly<Record<string, Readonly<Record<string, number>>>>; }>;

// == Rise ========================================================================
/** how far `pose` (degrees by limb, a limb it names none of at 0) raises a figure's
 *  lowest point over its soles (plates, never below 0) */
export const poseRise = (bottoms: PoseBottoms, pose: Readonly<Partial<Record<string, number>>> | undefined): number => {
  let lowest = bottoms.core;
  for(const [limb, measured] of Object.entries(bottoms.limbs)) lowest = Math.min(lowest, bottomAt(measured, pose?.[limb] ?? 0));
  return Math.max(0, lowest);
};

// == Internal ====================================================================
/** a limb's lowest point at any angle: straight between the measured angles about it */
const bottomAt = (measured: Readonly<Record<string, number>>, angle: number): number => {
  const turned = ((((angle + 180) % 360) + 360) % 360) - 180/*-180 to 180*/;
  const below = Math.floor(turned / STEP) * STEP, above = below + STEP;
  const [low, high] = [measured[String(below)], measured[String((above >= 180) ? (above - 360) : above)]];
  if((low === undefined) || (high === undefined)) return low ?? high ?? 0/*by contract: every angle measured*/;
  return low + ((high - low) * ((turned - below) / STEP));
};
