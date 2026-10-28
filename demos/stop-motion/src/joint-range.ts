// a person's range at each joint a figure's pose turns, and how far a pose stands past
// it. A toy figure's arm swings all the way round its shoulder and its leg round its
// hip; a person's stop short, behind the body above all, so a pose a toy can take
// reads wrong as a person. Each range is a standard joint range of the body (SEE:
// SPEC.stop-motion.md §*A person's range*), in the pose's own numbers: an arm or a leg
// forward from hanging, the head clockwise seen from above, the lean forward. An angle
// is read round the circle into its range's turn (an overarm -190 is 170, forward of
// straight up), and how far past it stands is the way back to the nearer end
// ********************************************************************************
// == Constants ===================================================================
/** each joint a person's range bounds, and that range (degrees, the least and the most
 *  within one turn): the neck turned either way; the shoulder forward and up over the
 *  head and back behind the body; the hip forward and back, back as far as a stride
 *  carries a thigh behind an upright body (a toy's hips stay upright where a person's
 *  pelvis tilts); the trunk bent forward over the legs and back. A wrist turns a toy's
 *  hand, which has no thumb, so a hand turned half round holds a thing as a person's
 *  holds it the other way round in the fist; a twist turns the whole figure on its
 *  feet: neither is bounded */
export const PERSON_RANGE = {
  head: { least: -80, most: 80 },
  leftArm: { least: -60, most: 190 }, rightArm: { least: -60, most: 190 },
  leftLeg: { least: -40, most: 120 }, rightLeg: { least: -40, most: 120 },
  lean: { least: -30, most: 90 },
} as const;

// == Types =======================================================================
/** a joint a person's range bounds (SEE: PERSON_RANGE) */
export type RangedJoint = keyof typeof PERSON_RANGE;
/** how far an angle stands past a person's range: the degrees back to the nearer end
 *  (`past`), and that end in the angle's own turn (`nearest`: an arm read -134 is
 *  nearest -170, up and a little back over the head, the same arm as 190) */
export type PastRange = Readonly<{ past: number; nearest: number; }>;

/** the joints a person's range bounds, in a pose's order */
export const RANGED_JOINTS: ReadonlyArray<RangedJoint> = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'lean'];

// == Past Range ==================================================================
/** how far a joint's angle (degrees, as its pose keys it) stands past a person's range,
 *  read round the circle into its range's turn; none within it */
export const pastRange = (joint: RangedJoint, angle: number): PastRange | undefined => {
  const { least, most } = PERSON_RANGE[joint];
  const turned = ((((angle - least) % 360) + 360) % 360) + least/*from its least up to a turn past it*/;
  if(turned <= most) return undefined;
  const [overMost, underLeast] = [turned - most, (least + 360) - turned];
  return (overMost <= underLeast) ? { past: overMost, nearest: angle - overMost } : { past: underLeast, nearest: angle + underLeast };
};

/** the value a joint keyed `to` takes, by whole turns, to ease from `from` to it the
 *  short way within a person's range, every angle between within it; none where no such
 *  turn does (either end past it, or the way between crossing it every way round) */
export const withinFrom = (joint: RangedJoint, from: number, to: number): number | undefined => {
  if(pastRange(joint, from) || pastRange(joint, to)) return undefined;
  const { least } = PERSON_RANGE[joint];
  const turnOf = (angle: number) => Math.floor((angle - least) / 360)/*the turn its range lies in*/;
  const value = to + ((turnOf(from) - turnOf(to)) * 360);
  return (value === to) ? undefined/*the same turn: never crossing*/ : value;
};
