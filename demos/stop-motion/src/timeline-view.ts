import { frameTime } from './key-easing';

// how much of the film the timeline shows: the whole film across its lanes, zoomed in
// from there (the lanes widen by the zoom and scroll sideways), never further out. A
// zoom stops where a frame is FRAME_PIXELS wide, so a pinch never overshoots, and the
// ruler labels seconds at a step that keeps its labels apart at the zoom, every label
// to the step's places and the widest clear of the next
// ********************************************************************************
// == Constants ===================================================================
/** how wide a frame is at the deepest zoom (CSS pixels): every frame told apart */
export const FRAME_PIXELS = 24;
/** how far apart the ruler's labels stand at least (CSS pixels) */
const LABEL_APART = 44;
/** a ruler label's character (CSS pixels): JetBrains Mono's 0.6em advance at the
 *  label's 8px and its 0.12em spacing (SEE: styles.scss .ruler-tick) */
const LABEL_CHARACTER = 5.76;
/** a ruler label's tick and the padding after it (CSS pixels) */
const LABEL_INSET = 5;
/** the space a label keeps before the next tick (CSS pixels) */
const LABEL_GAP = 6;
/** the ruler's steps between labels (seconds), out to in, after a frame's own */
const SECOND_STEPS = [60, 30, 15, 10, 5, 2, 1, 0.5, 0.25] as const;
/** the most places a ruler label shows: a millisecond, where a frame's step never ends */
const MOST_PLACES = 3;
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
/** the places every label of a ruler stepping `step` seconds shows: the step's own,
 *  a millisecond at most */
const placesOf = (step: number): number => {
  for(let places=0; places<MOST_PLACES; places++) {
    const scaled = step * (10 ** places);
    if(Math.abs(scaled - Math.round(scaled)) < 1e-9) return places;
  }
  return MOST_PLACES;
};

/** a ruler label at its step's places: `4s` among whole seconds, `4.0s` among halves,
 *  `4.00s` among quarters, `4.000s` among frames */
export const labelOf = (time: number, step: number): string => `${time.toFixed(placesOf(step))}s`;

/** how wide a ruler label stands (CSS pixels): its tick, padding and characters */
export const labelWidth = (label: string): number => LABEL_INSET + (label.length * LABEL_CHARACTER);

/** the seconds between the ruler's labels at `pixels` a second for a film at `fps`,
 *  `length` seconds long: the finest step keeping them LABEL_APART and its widest label
 *  (the film's end, at the step's places) LABEL_GAP clear of the next, out to a minute,
 *  in to a frame */
export const labelStep = (pixels: number, fps: number, length: number): number => {
  const steps = [...new Set([...SECOND_STEPS, frameTime(2, fps), frameTime(1, fps)])].filter(step => step >= frameTime(1, fps)).sort((a, b) => b - a)/*never finer than a frame*/;
  let fitting: number = SECOND_STEPS[0];
  for(const step of steps) if((step * pixels) >= Math.max(LABEL_APART, labelWidth(labelOf(length, step)) + LABEL_GAP)) fitting = step;
  return fitting;
};
