import type { Ease } from './recorder';

// how a film eases from key to key: whether a time has reached a key, an ease's curve,
// and a value at a time over keys sorted by time. One factory holding everything it
// needs and reaching nothing outside its own body, so the scene recorder's Worker takes
// it as source text beside the recorder's (SEE: scene-runner.ts) and the film and the
// recorder read keys alike
// ********************************************************************************
// == Key Easing ==================================================================
/** the key easing a film and its recorder share (SEE: the header) */
export const keyEasing = () => {
  /** whether `time` has reached a key at `at`: a key holds from its own time on,
   *  compared exactly, so a cut's shot and the frames that show it agree */
  const isReached = (at: number, time: number): boolean => at <= time;

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
    return between(value(from), value(to), ease(to.ease, (time - from.time) / (to.time - from.time)));
  };

  return { isReached, ease, eased };
};
/** the key easing a film and its recorder share */
export type KeyEasing = ReturnType<typeof keyEasing>;
