// tiny tagged-logging helper used to trace the cross-App boundaries (gallery
// state$, editor getText, compile pipeline). The enable flag is a module-level
// mutable driven by ConfigStore (appState.config.debug) -- sandboxed App iframes
// don't have access to localStorage, so the toggle lives in the Document state
// alongside the rest of the player's prefs. On by default until the persisted
// value flips it off. Every line is prefixed `[shader-demo:<channel>]` so it's
// easy to grep / filter in DevTools
// ********************************************************************************
let enabled = true;/*default: log until config says otherwise*/

/** update the enable flag. Called from main.ts after the ConfigStore has loaded
 *  and again whenever appState.config.debug changes */
export const setDbgEnabled = (value: boolean): void => {
  enabled = value;
};

// ................................................................................
/** log under a named channel. Example: dbg('gallery', 'state$', state) */
export const dbg = (channel: string, ...args: unknown[]): void => {
  if(!enabled) return;
  console.log(`[shader-demo:${channel}]`, ...args);
};
