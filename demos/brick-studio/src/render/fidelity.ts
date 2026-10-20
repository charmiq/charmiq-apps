// how real the bricks look: five stops, each adding the next most convincing cue
// at a cost. The stop is a viewer's own preference (their GPU, their patience), so
// it is kept in this browser, never in the shared document
// ********************************************************************************
// == Stops =======================================================================
export const FIDELITY_STOPS = [
  { stop: 0, label: 'Draft' }/*flat studio light*/,
  { stop: 1, label: 'Plastic' }/*glossy ABS, hairline seams, softbox light*/,
  { stop: 2, label: 'Shaded' }/*+ ambient occlusion, soft shadows*/,
  { stop: 3, label: 'Photo' }/*+ macro depth of field, filmic finish*/,
  { stop: 4, label: 'Path traced' }/*physically path traced, refining while still*/,
] as const;

export type Fidelity = typeof FIDELITY_STOPS[number]['stop'];

export const DEFAULT_FIDELITY: Fidelity = 1;
export const MAX_FIDELITY: Fidelity = 4;

/** the most parts the path tracer draws: it merges every part it draws into one scene,
 *  so its memory grows with them. Past it the Path traced stop draws as Photo */
export const PATH_TRACED_PARTS = 3000;
/** why the Path traced stop draws `parts` as Photo, model-facing */
export const untracedReason = (parts: number): string => `Path traced draws at most ${PATH_TRACED_PARTS} parts, and this shows ${parts}: it is drawn as Photo until it shows fewer.`;
/** the same, beside the slider */
export const UNTRACED_STATE = `as Photo · over ${PATH_TRACED_PARTS.toLocaleString('en-US')} parts`;

/** the stop a value names: a stop's number, or a string of one; anything else
 *  (nothing kept, a blank) names none */
export const toFidelity = (value: unknown): Fidelity | undefined => {
  if((typeof value !== 'number') && ((typeof value !== 'string') || (value.trim().length < 1))) return undefined;
  const stop = Number(value);
  return FIDELITY_STOPS.find(entry => entry.stop === stop)?.stop;
};

export const fidelityLabel = (fidelity: Fidelity): string => FIDELITY_STOPS[fidelity].label;

// == Preference ==================================================================
const STORAGE_KEY = 'brick-studio:fidelity';

/** the stop this browser last chose; storage can be absent or refused */
export const loadFidelity = (): Fidelity => {
  try {
    return toFidelity(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_FIDELITY;
  } catch {
    return DEFAULT_FIDELITY;
  }
};

export const saveFidelity = (fidelity: Fidelity): void => {
  try { localStorage.setItem(STORAGE_KEY, String(fidelity)); } catch { /*a preference only*/ }
};
