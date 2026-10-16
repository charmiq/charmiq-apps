// a frame drawn at the browser's next animation frame, or after a wait when the
// browser animates none (a frame scrolled out of view)
// ********************************************************************************
/** the clock a request runs on: the browser's (`window`) */
export type FrameClock = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'>;

/** draws once: at the next animation frame or after `fallbackMs`, whichever comes
 *  first withdrawing the other, so a later request is never drawn by this one's */
export const requestDraw = (clock: FrameClock, draw: () => void, fallbackMs: number): void => {
  const animation = clock.requestAnimationFrame(() => { clock.clearTimeout(fallback); draw(); });
  const fallback = clock.setTimeout(() => { clock.cancelAnimationFrame(animation); draw(); }, fallbackMs);
};
