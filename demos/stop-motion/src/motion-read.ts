import { frameAtTime, type Film } from './film';
import type { Key, RecordedActor } from './recorder';

// an actor's motion read over a span, as an Agent asks after a note or a footing
// problem: its place and turn a sample at a time, and for each of them what drives it
// over the span (its walk, a path keying it, its keys, or nothing) with the scene's
// lines that do. A channel read before its first key holds that key's value back from
// its later time, which a reader of the scene never sees: a figure whose only pitch
// key is at its landing lies at that pitch all through its run-up. Such a key is named
// as holding back, with its time
// ********************************************************************************
// == Constants ===================================================================
/** the channels read: an actor's place and turn */
export const MOTION_CHANNELS = ['x', 'z', 'height', 'yaw', 'pitch', 'roll'] as const;
/** the channels a walk lays itself, over any key or path */
const WALKED = new Set<string>(['x', 'z', 'height', 'yaw']);
/** the most samples a read takes */
export const MAX_SAMPLES = 60;

// == Types =======================================================================
export type MotionChannel = typeof MOTION_CHANNELS[number];
/** what drives a channel at a moment: a walk, a path, its keys (easing between two, or
 *  the last held, or the first holding back from `heldBack`, its time), or nothing
 *  keying it; and the scene's lines that do */
export type Driver = Readonly<{ by: 'walk' | 'path' | 'keys' | 'none'; lines: ReadonlyArray<number>; heldBack?: number; }>;
/** a driver over a stretch of the span read (seconds) */
export type DriverSpan = Driver & Readonly<{ from: number; to: number; }>;
/** the actor at a sample: its place (studs; height in plates) and turn (degrees); none
 *  of it while hidden */
export type MotionSample = Readonly<{ time: number; frame: number; shown: boolean; x?: number; z?: number; height?: number; yaw?: number; pitch?: number; roll?: number; }>;
export type MotionRead = Readonly<{ actor: string; samples: ReadonlyArray<MotionSample>; drivers: Readonly<Record<MotionChannel, ReadonlyArray<DriverSpan>>>; }>;

// == Read ========================================================================
/** an actor's motion over `from` to `to` (seconds): `samples` evenly spaced samples
 *  (at most MAX_SAMPLES), and each channel's drivers over every frame of the span */
export const motionOf = (film: Film, actor: RecordedActor, from: number, to: number, samples: number): MotionRead => {
  const [first, last] = [frameAtTime(film, from), frameAtTime(film, to)];
  const count = Math.max(1, Math.min(MAX_SAMPLES, Math.round(samples)));
  const picked = (count === 1) ? [first] : Array.from({ length: count }, (_, index) => Math.round(first + (((last - first) * index) / (count - 1))));
  const sampleAt = (index: number): MotionSample => {
    const frame = film.frames[index], shot = frame.actors.find(each => each.name === actor.name);
    return shot
      ? { time: frame.time, frame: index, shown: true, x: shot.position.x, z: shot.position.z, height: shot.position.height, yaw: shot.turn.yaw, pitch: shot.turn.pitch, roll: shot.turn.roll }
      : { time: frame.time, frame: index, shown: false };
  };
  // each channel's drivers, a stretch for each run of frames one driver drives
  const spansOf = (channel: MotionChannel): ReadonlyArray<DriverSpan> => {
    const spans: Array<DriverSpan> = [];
    for(let index=first; index<=last; index++) {
      const time = film.frames[index].time, driver = driverAt(film, actor, channel, time);
      const open = spans[spans.length - 1];
      if(open && sameDriver(open, driver)) { spans[spans.length - 1] = { ...open, to: time }; continue; }
      spans.push({ ...driver, from: time, to: time });
    }
    return spans;
  };
  const drivers = { x: spansOf('x'), z: spansOf('z'), height: spansOf('height'), yaw: spansOf('yaw'), pitch: spansOf('pitch'), roll: spansOf('roll') };
  return { actor: actor.name, samples: [...new Set(picked)].map(sampleAt), drivers };
};

/** what drives an actor's channel at a time (SEE: Driver) */
export const driverAt = (film: Film, actor: RecordedActor, channel: string, time: number): Driver => {
  const linesOf = (lined: ReadonlyArray<Readonly<{ line?: number; }>>) => [...new Set(lined.flatMap(each => (each.line !== undefined) ? [each.line] : []))];
  const walk = WALKED.has(channel) && actor.walks?.find(each => (time >= each.start) && (time <= each.end));
  if(walk) return { by: 'walk', lines: linesOf([walk]) };
  const at = time * film.scene.fps;
  const path = actor.spans.find(span => (at >= span.from) && (at <= span.to) && span.channels.includes(channel));
  if(path) return { by: 'path', lines: linesOf([path]) };
  const keys: ReadonlyArray<Key> = actor.keys.filter(key => Object.hasOwn(key.values, channel));
  if(keys.length < 1) return { by: 'none', lines: [] };
  const next = keys.findIndex(key => key.time > time);
  if(next === 0) return { by: 'keys', lines: linesOf([keys[0]]), heldBack: keys[0].time }/*read before its first key*/;
  return { by: 'keys', lines: linesOf((next < 0) ? keys.slice(-1) : keys.slice(next - 1, next + 1)) };
};

const sameDriver = (a: Driver, b: Driver): boolean => (a.by === b.by) && (a.heldBack === b.heldBack) && (a.lines.join() === b.lines.join());
