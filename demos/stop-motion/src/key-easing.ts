import type { Ease } from './recorder';

// how a film keeps time and eases from key to key: a time's place among the film's
// frames and a frame's time, whether a time has reached a key, an ease's curve, and a
// value at a time over keys sorted by time. One factory holding everything it needs and
// reaching nothing outside its own body, so the scene recorder's Worker takes it as
// source text beside the recorder's (SEE: scene-runner.ts) and the film and the
// recorder read keys and frames alike
// ********************************************************************************
// == Key Easing ==================================================================
/** the key easing a film and its recorder share (SEE: the header) */
export const keyEasing = () => {
  /** how near a time lies to another and stands on it (seconds): far past the rounding
   *  between a time a scene writes (38 * 1001 / 24000) and its frame's, the frame's
   *  index over the fps, and far under half a frame at any fps a film runs */
  const ON_FRAME = 1e-9;

  /** a time's place among a film's frames at its fps (frames from 0): a whole frame
   *  where the time stands on that frame's (SEE: ON_FRAME), so a frame read from a
   *  time is the frame whose time it is, at any fps */
  const framesAt = (time: number, fps: number): number => {
    const at = time * fps, whole = Math.round(at);
    return (Math.abs(at - whole) <= (ON_FRAME * fps)) ? whole : at;
  };
  /** the time of a place among a film's frames at its fps (seconds) */
  const frameTime = (frame: number, fps: number): number => frame / fps;

  /** whether `time` has reached a key at `at`: a key holds from its own time on, a
   *  time standing on it included (SEE: ON_FRAME), so a key at a frame's time takes
   *  effect on that frame and a cut's shot and the frames that show it agree */
  const isReached = (at: number, time: number): boolean => at <= (time + ON_FRAME);

  /** progress `u` (0 to 1) shaped by an ease */
  const ease = (kind: Ease, u: number): number => {
    switch(kind) {
      case 'linear': return u;
      case 'ease-in': return u * u * u;
      case 'ease-out': return 1 - Math.pow(1 - u, 3);
      case 'ease-in-out': return (u < 0.5) ? (4 * u * u * u) : (1 - (Math.pow((-2 * u) + 2, 3) / 2));
      case 'hold': return 0;
    }
  };

  /** a value at a time over keys sorted by time: each key's value eased into from the
   *  key before by the later key's ease, the first's before it and the last's after */
  const eased = <K extends Readonly<{ time: number; ease: Ease; }>, V>(keys: ReadonlyArray<K>, time: number, value: (key: K) => V, between: (from: V, to: V, u: number) => V): V | undefined => {
    if(keys.length < 1) return undefined;
    const next = keys.findIndex(key => !isReached(key.time, time));
    if(next === 0) return value(keys[0]);
    if(next < 0) return value(keys[keys.length - 1]);
    const [from, to] = [keys[next - 1], keys[next]];
    return between(value(from), value(to), ease(to.ease, Math.max(0, (time - from.time) / (to.time - from.time))/*a time standing on its key: there*/));
  };

  return { ON_FRAME, framesAt, frameTime, isReached, ease, eased };
};
/** the key easing a film and its recorder share */
export type KeyEasing = ReturnType<typeof keyEasing>;
/** the page's own key easing (the Worker makes its own from the factory's text) */
export const { ON_FRAME, framesAt, frameTime, isReached, ease, eased } = keyEasing();
