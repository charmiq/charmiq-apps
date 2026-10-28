import { frameAtTime, type Film } from './film';
import type { Key, RecordedActor } from './recorder';

// an actor's motion read over a span, as an Agent asks after a note or a footing
// problem: its place and turn a sample at a time, a figure's pose beside them (each
// limb's angle the number its keys ease, as the scene keys it), and for each of them
// what drives it over the span (its walk, a path keying it, its keys, or nothing) and
// what the scene adds over that (a walk's swing, an idle, a wobble) with the scene's
// lines that do. A channel read before its first key holds that key's value back from
// its later time, which a reader of the scene never sees: a figure whose only pitch
// key is at its landing lies at that pitch all through its run-up. Such a key is named
// as holding back, with its time. A height is read from the baseplate; following the
// ground, the level the ground stands it on is read beside it, from which its keys and
// paths count (a high jumper's over the bar's top while its footprint overlaps the bar)
// ********************************************************************************
// == Constants ===================================================================
/** the channels read: an actor's place and turn */
export const MOTION_CHANNELS = ['x', 'z', 'height', 'yaw', 'pitch', 'roll'] as const;
/** a figure's pose channels read, as a key names them under `pose` */
export const POSE_CHANNELS = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'lean', 'leftWrist', 'rightWrist'] as const;
/** the channels a walk lays itself, over any key or path: its place, its heading and a
 *  figure's legs */
const WALKED = new Set<string>(['x', 'z', 'height', 'yaw', 'pose.leftLeg', 'pose.rightLeg']);
/** the channels a walk swings over what drives them: a figure's arms, lean and head */
const SWUNG = new Set<string>(['pose.leftArm', 'pose.rightArm', 'pose.lean', 'pose.head']);
/** the most samples a read takes */
export const MAX_SAMPLES = 60;

// == Types =======================================================================
export type MotionChannel = typeof MOTION_CHANNELS[number];
export type PoseChannel = typeof POSE_CHANNELS[number];
/** what drives a channel at a moment: a walk, a path, its keys (easing between two, or
 *  the last held, or the first holding back from `heldBack`, its time), or nothing
 *  keying it; and the scene's lines that do. `added`, the lines of what the scene adds
 *  over it (a walk swinging a figure's arms, an idle, a wobble); the figure's own
 *  idling, which no line writes, is never named */
export type Driver = Readonly<{ by: 'walk' | 'path' | 'keys' | 'none'; lines: ReadonlyArray<number>; heldBack?: number; added?: ReadonlyArray<number>; }>;
/** a driver over a stretch of the span read (seconds) */
export type DriverSpan = Driver & Readonly<{ from: number; to: number; }>;
/** the actor at a sample: its place (studs; height in plates over the baseplate),
 *  following the ground the level it stands it on (`ground`, plates over the baseplate;
 *  SEE: film.ts FilmFrame `grounds`), its turn (degrees) and, posed, each pose channel
 *  (degrees, 0 where nothing poses it); none of it while hidden */
export type MotionSample = Readonly<{ time: number; frame: number; shown: boolean; x?: number; z?: number; height?: number; ground?: number; yaw?: number; pitch?: number; roll?: number; pose?: Readonly<Record<PoseChannel, number>>; }>;
/** each channel's drivers over the span, a figure's pose channels under `pose` */
export type MotionDrivers = Readonly<Record<MotionChannel, ReadonlyArray<DriverSpan>>> & Readonly<{ pose?: Readonly<Record<PoseChannel, ReadonlyArray<DriverSpan>>>; }>;
export type MotionRead = Readonly<{ actor: string; samples: ReadonlyArray<MotionSample>; drivers: MotionDrivers; }>;

// == Read ========================================================================
/** an actor's motion over `from` to `to` (seconds): `samples` evenly spaced samples
 *  (at most MAX_SAMPLES), and each channel's drivers over every frame of the span; a
 *  figure's pose (an actor shown posed over the span) with them */
export const motionOf = (film: Film, actor: RecordedActor, from: number, to: number, samples: number): MotionRead => {
  const [first, last] = [frameAtTime(film, from), frameAtTime(film, to)];
  const count = Math.max(1, Math.min(MAX_SAMPLES, Math.round(samples)));
  const picked = (count === 1) ? [first] : Array.from({ length: count }, (_, index) => Math.round(first + (((last - first) * index) / (count - 1))));
  const sampleAt = (index: number): MotionSample => {
    const frame = film.frames[index], shot = frame.actors.find(each => each.name === actor.name), ground = frame.grounds?.[actor.name];
    return shot
      ? { time: frame.time, frame: index, shown: true, x: shot.position.x, z: shot.position.z, height: shot.position.height, ...((ground !== undefined) ? { ground } : {}), yaw: shot.turn.yaw, pitch: shot.turn.pitch, roll: shot.turn.roll, ...(shot.pose ? { pose: Object.fromEntries(POSE_CHANNELS.map(limb => [limb, shot.pose![limb] ?? 0])) as Record<PoseChannel, number> } : {}) }
      : { time: frame.time, frame: index, shown: false };
  };
  // each channel's drivers, a stretch for each run of frames one driver drives
  const spansOf = (channel: string): ReadonlyArray<DriverSpan> => {
    const spans: Array<DriverSpan> = [];
    for(let index=first; index<=last; index++) {
      const time = film.frames[index].time, driver = driverAt(film, actor, channel, time);
      const open = spans[spans.length - 1];
      if(open && sameDriver(open, driver)) { spans[spans.length - 1] = { ...open, to: time }; continue; }
      spans.push({ ...driver, from: time, to: time });
    }
    return spans;
  };
  const posed = film.frames.slice(first, last + 1).some(frame => frame.actors.some(each => (each.name === actor.name) && each.pose));
  const drivers = {
    x: spansOf('x'), z: spansOf('z'), height: spansOf('height'), yaw: spansOf('yaw'), pitch: spansOf('pitch'), roll: spansOf('roll'),
    ...(posed ? { pose: Object.fromEntries(POSE_CHANNELS.map(limb => [limb, spansOf(`pose.${limb}`)])) as Record<PoseChannel, ReadonlyArray<DriverSpan>> } : {}),
  };
  return { actor: actor.name, samples: [...new Set(picked)].map(sampleAt), drivers };
};

/** what drives an actor's channel at a time (SEE: Driver): its walk where the walk lays
 *  it, else a path setting it, else its keys; and what adds over that (its walk's swing,
 *  a span adding to it that the scene writes) */
export const driverAt = (film: Film, actor: RecordedActor, channel: string, time: number): Driver => {
  const walk = actor.walks?.find(each => (time >= each.start) && (time <= each.end));
  if(walk && WALKED.has(channel)) return { by: 'walk', lines: linesOf([walk]) };
  const at = time * film.scene.fps;
  const over = actor.spans.filter(span => (at >= span.from) && (at <= span.to) && span.channels.includes(channel) && (span.label !== 'walk')/*a walk's own span: its walk*/);
  const added = linesOf([...((walk && SWUNG.has(channel)) ? [walk] : []), ...over.filter(span => span.mode === 'add')]);
  const driving = drivenAt(actor, channel, time, over.find(span => span.mode === 'set'));
  return (added.length > 0) ? { ...driving, added } : driving;
};

/** what sets a channel at a time under any walk: a path setting it, else its keys */
const drivenAt = (actor: RecordedActor, channel: string, time: number, path: Readonly<{ line?: number; }> | undefined): Driver => {
  if(path) return { by: 'path', lines: linesOf([path]) };
  const keys: ReadonlyArray<Key> = actor.keys.filter(key => Object.hasOwn(key.values, channel));
  if(keys.length < 1) return { by: 'none', lines: [] };
  const next = keys.findIndex(key => key.time > time);
  if(next === 0) return { by: 'keys', lines: linesOf([keys[0]]), heldBack: keys[0].time }/*read before its first key*/;
  return { by: 'keys', lines: linesOf((next < 0) ? keys.slice(-1) : keys.slice(next - 1, next + 1)) };
};

/** the scene's lines of what writes them, each once, in order */
const linesOf = (lined: ReadonlyArray<Readonly<{ line?: number; }>>): ReadonlyArray<number> => [...new Set(lined.flatMap(each => (each.line !== undefined) ? [each.line] : []))];
const sameDriver = (a: Driver, b: Driver): boolean => (a.by === b.by) && (a.heldBack === b.heldBack) && (a.lines.join() === b.lines.join()) && ((a.added ?? []).join() === (b.added ?? []).join());
