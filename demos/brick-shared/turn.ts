// how a stage turns an actor: rolled, then pitched, then yawed (yaw clockwise seen from
// above, pitch raising its south side, roll its west side), as row-major rotation rows
// in LDraw's frame (y down); the turn a rotation is, so what one Application turns
// another reads back the same (a rider turned with what it rides, a thing standing
// where a hand held it); and a figure's twist, which turns it as its yaw does
// ********************************************************************************
// == Types =======================================================================
/** an actor's turn, in degrees */
export type Turn = Readonly<{ yaw: number; pitch: number; roll: number; }>;

// == Turns =======================================================================
/** the rotation of a turn */
export const rotation = ({ yaw, pitch, roll }: Turn): number[] => {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(radians(yaw)), Math.sin(radians(yaw)), Math.cos(radians(pitch)), Math.sin(radians(pitch)), Math.cos(radians(roll)), Math.sin(radians(roll))];
  const yawed = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const pitched = [1, 0, 0, 0, cp, sp, 0, -sp, cp];
  const rolled = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return multiply(multiply(yawed, pitched), rolled);
};

/** the turn of a rotation (degrees): its pitch from its middle row's last, then its
 *  roll and yaw */
export const turnOf = (m: ReadonlyArray<number>): Turn => {
  const pitch = Math.asin(Math.max(-1, Math.min(1, m[5])));
  const level = Math.cos(pitch) > 1e-9;
  const yaw = level ? Math.atan2(m[2], m[8]) : Math.atan2(-m[6], m[0])/*straight up or down: the yaw takes the roll*/;
  const roll = level ? Math.atan2(m[3], m[4]) : 0;
  const degrees = (value: number) => { const d = value * (180 / Math.PI); return Object.is(d, -0) ? 0 : d; };
  return { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) };
};

/** the yaw of a figure turned by a pose's `twist` (degrees clockwise seen from above),
 *  added to its own: a toy figure's torso and hips are one block with no waist that
 *  turns, so a twist turns the whole figure from its feet, about the vertical through
 *  its hips, as its yaw does */
export const twistedYaw = (yaw: number, twist: number | undefined): number => yaw + (twist ?? 0);

// == Internal ====================================================================
const radians = (degrees: number) => degrees * (Math.PI / 180);

const multiply = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] =>
  [0, 1, 2].flatMap(row => [0, 1, 2].map(column => (a[row * 3] * b[column]) + (a[(row * 3) + 1] * b[3 + column]) + (a[(row * 3) + 2] * b[6 + column])));
