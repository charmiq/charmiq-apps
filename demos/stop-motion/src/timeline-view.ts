// how much of the film the timeline shows: the whole film across its lanes, zoomed in
// from there (the lanes widen by the zoom and scroll sideways), never further out. A
// zoom stops where a frame is FRAME_PIXELS wide, so a pinch never overshoots, and the
// ruler labels seconds at a step that keeps its labels apart at the zoom
// ********************************************************************************
// == Constants ===================================================================
/** how wide a frame is at the deepest zoom (CSS pixels): every frame told apart */
export const FRAME_PIXELS = 24;
/** how far apart the ruler's labels stand at least (CSS pixels) */
const LABEL_APART = 44;
/** the ruler's steps between labels (seconds), out to in, after a frame's own */
const SECOND_STEPS = [60, 30, 15, 10, 5, 2, 1, 0.5, 0.25] as const;
/** how much a zoom key or button zooms */
export const ZOOM_STEP = 1.5;

// == Zoom ========================================================================
/** the deepest zoom for a film of `frames` frames across lanes `width` wide at the
 *  whole film: a frame FRAME_PIXELS wide, and never below the whole film */
export const maxZoom = (frames: number, width: number): number => Math.max(1, (FRAME_PIXELS * frames) / Math.max(1, width));

/** a zoom within its bounds: the whole film (1) at least, a frame FRAME_PIXELS wide
 *  at most */
export const clampZoom = (zoom: number, frames: number, width: number): number =>
  Math.min(Math.max(Number.isFinite(zoom) ? zoom : 1, 1), maxZoom(frames, width));

/** the span of the film in view (shares of the film, 0 to 1): lanes `width` wide,
 *  scrolled `scrolled` pixels, `shown` pixels of them in view */
export const spanInView = (width: number, scrolled: number, shown: number): Readonly<{ from: number; to: number; }> => {
  if(width <= 0) return { from: 0, to: 1 };
  const from = Math.min(Math.max(scrolled / width, 0), 1);
  return { from, to: Math.min(Math.max((scrolled + shown) / width, from), 1) };
};

// == Ruler =======================================================================
/** the seconds between the ruler's labels at `pixels` a second for a film at `fps`:
 *  the finest step keeping them LABEL_APART, out to a minute, in to a frame */
export const labelStep = (pixels: number, fps: number): number => {
  const steps = [...new Set([...SECOND_STEPS, 2 / fps, 1 / fps])].filter(step => step >= (1 / fps)).sort((a, b) => b - a)/*never finer than a frame*/;
  let fitting: number = SECOND_STEPS[0];
  for(const step of steps) if((step * pixels) >= LABEL_APART) fitting = step;
  return fitting;
};

/** a ruler label: whole seconds as `12s`, a fraction to the hundredth */
export const labelOf = (time: number): string => {
  const whole = Math.round(time);
  return (Math.abs(time - whole) < 1e-6) ? `${whole}s` : `${time.toFixed(2)}s`;
};
