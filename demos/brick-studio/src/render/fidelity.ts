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

export const toFidelity = (value: unknown): Fidelity | undefined => {
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
