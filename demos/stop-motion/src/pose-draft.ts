import { plantedAt, soleAt, type Leg, type Posed } from '../../brick-shared/plant';
import type { PoseBottoms } from '../../brick-shared/rise';
import { twistedYaw } from '../../brick-shared/turn';

import { channelAt, type Film, type Shot } from './film';
import { isReached } from './key-easing';
import type { Key, Point, RecordedActor } from './recorder';

// a figure's draft in the Pose mode (SEE: pose-view.ts): the values a key of its takes,
// posed at one frame before any is written. A draft starts from what the figure's keys
// give it at the frame (on a frame holding no key, at the key before it), and where no
// key sets a value from what the frame shows. The studio stands it as the frame's own
// shot with the draft's values in place, the person poses that shot by hand on its
// picture, and the shot posed is read back as the draft; a pinned foot's contact holds
// while a value typed solves the figure's place about it; an onion skin reaches back to
// the drawings before. Written, a frame holding a key takes only what the draft changed,
// every other value as the scene writes it; a frame holding none takes a key of every
// value the figure's keys set, with what the draft changed, so the drawing holds as posed
// ********************************************************************************
// == Constants ===================================================================
/** the values a draft poses: a figure's place, its turn, and its pose's joints */
export const POSED: ReadonlyArray<string> = ['x', 'z', 'height', 'yaw', 'pitch', 'roll', 'pose.head', 'pose.hat', 'pose.leftArm', 'pose.rightArm', 'pose.leftLeg', 'pose.rightLeg', 'pose.lean', 'pose.leftWrist', 'pose.rightWrist'];
/** a pose's joints among them, as a shot's pose names them */
const JOINTS = POSED.filter(channel => channel.startsWith('pose.')).map(channel => channel.slice('pose.'.length));
/** how far a value stands from where it started before the draft changed it */
const CHANGED = 1e-6;
/** how far past a drawing's frame an onion skin's reach runs, so rounding never leaves
 *  that drawing out (seconds) */
const REACH_PAST = 1e-6;

// == Types =======================================================================
/** an actor as a draft reads it: its name and its keys */
type Keyed = Pick<RecordedActor, 'name' | 'keys'>;
/** a draft: each value posed, by its channel */
export type Draft = Readonly<Record<string, number>>;

// == Draft =======================================================================
/** why the Pose mode cannot pose an actor, or undefined when it can: one not cast
 *  `click: false` stands where its studs put it, and a rider where what it rides does */
export const unposed = (actor: Pick<RecordedActor, 'name' | 'click' | 'ride'>): string | undefined => {
  if(actor.ride) return `${actor.name} rides ${actor.ride.parent}: the Pose mode poses an actor standing on its own`;
  if(actor.click !== false) return `The Pose mode places an actor exactly where its keys say: cast ${actor.name} with click: false, as actor('${actor.name}', { …, click: false })`;
  return undefined/*posed where its keys place it*/;
};

/** the actor's key frame `index` holds: the last whose time that frame reaches first */
export const keyOn = (film: Film, actor: Keyed, index: number): Key | undefined => {
  const time = film.frames[index]?.time, before = film.frames[index - 1]?.time;
  if(time === undefined) return undefined/*no such frame*/;
  return actor.keys.filter(key => isReached(key.time, time) && ((before === undefined) || !isReached(key.time, before))).pop();
};

/** the values the film stands the actor at on frame `index`: what its keys give each
 *  there, eased, and what the frame shows of a value no key sets (0 where it shows none) */
export const filmedOf = (film: Film, actor: Keyed, index: number): Draft => valuesAt(film, actor, index, film.frames[index]?.time);

/** the values a draft starts from at frame `index`: on a frame holding a key (or before
 *  the actor's first), where the film stands it; on any other, where the key before
 *  stands it, as a new drawing starts from the last and never from an ease between two */
export const draftOf = (film: Film, actor: Keyed, index: number): Draft => {
  const time = film.frames[index]?.time;
  const before = ((time === undefined) || keyOn(film, actor, index)) ? undefined : actor.keys.filter(key => isReached(key.time, time)).pop();
  return valuesAt(film, actor, index, before?.time ?? time);
};

/** how far back (seconds) a frame's onion skin reaches for the `drawings` before it: to
 *  the frame the last of them starts on, a drawing a frame whose shot of the actor
 *  differs from the frame's before (held on twos, one drawing); as far as the film has */
export const onionReach = (film: Film, actor: string, index: number, drawings: number): number => {
  const shot = (at: number) => JSON.stringify(film.frames[at]?.actors.find(each => each.name === actor) ?? null);
  let [at, left] = [index, drawings + 1/*the drawing shown, then those before*/];
  for(; at>0; at--) if((shot(at) !== shot(at - 1)) && (--left <= 0)) break;
  const reached = Math.min(index, Math.max(0, at)), time = film.frames[index]?.time, from = film.frames[reached]?.time;
  return ((drawings < 1) || (time === undefined) || (from === undefined) || (reached >= index)) ? 0 : (time - from) + REACH_PAST;
};

/** a draft as the studio draws it at frame `index`: the frame's own shot of the actor
 *  (its face and what its hands hold), placed, turned and posed as the draft says, its
 *  keyed twist turning it whole and the ground it follows under it */
export const draftShot = (film: Film, actor: Keyed, index: number, values: Draft): Shot => {
  const frame = film.frames[index], shot = frame?.actors.find(each => each.name === actor.name);
  const twist = (frame !== undefined) ? channelAt(actor.keys, 'pose.twist', frame.time) : undefined;
  return {
    ...(shot ?? { name: actor.name }),
    position: { x: values.x, z: values.z, height: values.height + (frame?.grounds?.[actor.name] ?? 0) },
    turn: { yaw: twistedYaw(values.yaw, twist), pitch: values.pitch, roll: values.roll },
    pose: { ...shot?.pose, ...Object.fromEntries(JOINTS.map(joint => [joint, values[`pose.${joint}`]])) },
  };
};

/** the values the key written for a draft holds at frame `index`, each to the
 *  thousandth: on a frame holding a key, what the draft changed from where it started;
 *  on one holding none, every value the actor's keys set as well */
export const draftKey = (film: Film, actor: Keyed, index: number, values: Draft): Draft => {
  const started = draftOf(film, actor, index), held = keyOn(film, actor, index);
  const keyed = new Set(actor.keys.flatMap(key => Object.keys(key.values)));
  return Object.fromEntries(POSED.filter(channel => (Math.abs(values[channel] - started[channel]) > CHANGED) || (!held && keyed.has(channel))).map(channel => [channel, written(values[channel])]));
};

// == Posed by Hand ===============================================================
/** the draft a shot posed by hand on the studio's picture is, at frame `index`: its
 *  place, its turn and its joints as the scene keys them, the ground the actor follows
 *  taken from its height and its keyed twist from its yaw (SEE: draftShot, its inverse) */
export const draftFrom = (film: Film, actor: Keyed, index: number, { position, turn, pose }: Posed): Draft => {
  const frame = film.frames[index];
  const twist = (frame !== undefined) ? channelAt(actor.keys, 'pose.twist', frame.time) : undefined;
  const joints: Readonly<Partial<Record<string, number>>> = pose ?? {};
  return {
    x: position.x, z: position.z, height: position.height - (frame?.grounds?.[actor.name] ?? 0),
    yaw: turn.yaw - (twistedYaw(0, twist)), pitch: turn.pitch, roll: turn.roll,
    ...Object.fromEntries(JOINTS.map(joint => [`pose.${joint}`, joints[joint] ?? 0])),
  };
};

// == Planting ====================================================================
/** where a foot's contact stands with the figure posed as `values` (its keyed `twist`
 *  turning it whole): the middle of its `leg`'s sole, as the studio draws it (SEE:
 *  brick-shared/plant.ts soleAt) */
export const contactOf = (bottoms: PoseBottoms | undefined, values: Draft, leg: string, twist = 0): Point => soleAt(bottoms, posedOf(values, twist), legOf(leg));

/** a draft with its place and its height solved so a planted foot's contact stands at
 *  `at`: whatever else the draft poses stands, and the figure pivots about that foot */
export const plantedOn = (bottoms: PoseBottoms | undefined, values: Draft, leg: string, at: Point, twist = 0): Draft => {
  const { position } = plantedAt(bottoms, posedOf(values, twist), legOf(leg), at);
  return { ...values, ...position };
};

// == Internal ====================================================================
// the actor's values on frame `index` as its keys give them at `time` (eased), and what
// the frame shows of a value no key sets (0 where it shows none)
const valuesAt = (film: Film, actor: Keyed, index: number, time: number | undefined): Draft => {
  const shot = film.frames[index]?.actors.find(each => each.name === actor.name);
  const shown: Readonly<Record<string, number | undefined>> = shot ? { ...shot.position, ...shot.turn, ...Object.fromEntries(Object.entries(shot.pose ?? {}).map(([joint, angle]) => [`pose.${joint}`, angle])) } : {};
  return Object.fromEntries(POSED.map(channel => [channel, ((time !== undefined) ? channelAt(actor.keys, channel, time) : undefined) ?? shown[channel] ?? 0]));
};

// a draft's values as a figure stands: its place, its turn (its twist in its yaw) and
// its pose's joints
const posedOf = (values: Draft, twist: number): Posed => ({
  position: { x: values.x, z: values.z, height: values.height },
  turn: { yaw: twistedYaw(values.yaw, twist), pitch: values.pitch, roll: values.roll },
  pose: Object.fromEntries(JOINTS.map(joint => [joint, values[`pose.${joint}`] ?? 0])),
});

const legOf = (leg: string): Leg => (leg === 'rightLeg') ? 'rightLeg' : 'leftLeg';

// a value as the scene writes it: to the thousandth, never -0
const written = (value: number): number => Number(value.toFixed(3)) || 0;
