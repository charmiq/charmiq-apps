// a film as one design in the Drive: its set's LDraw text, then its scene as LDraw's
// data section `0 !DATA scene.js`, the code's UTF-8 in base64 across `0 !: ` lines of
// LINE characters. Brick Studio opens the file as a design (its set) and keeps the
// scene it carries through every edit (SEE: Brick Studio's model.ts data sections), so
// a film saved from either is whole
// ********************************************************************************
// == Constants ===================================================================
/** the data section the scene is */
export const SCENE_FILE = 'scene.js';
const DATA_START = '0 !DATA ';
const DATA_LINE = '0 !:';
/** the base64 characters a data line carries */
const LINE = 76;

// == File ========================================================================
/** a film file of a set and a scene: the set as given, any scene it carried before
 *  left out, then the scene */
export const writeFilmFile = (set: string, scene: string): string => {
  const { set: kept } = split(set);
  const body = ((kept.length < 1) || kept.endsWith('\n')) ? kept : `${kept}\n`/*its last line unfinished*/;
  const encoded = toBase64(scene);
  const lines = [`${DATA_START}${SCENE_FILE}`, ...Array.from({ length: Math.ceil(encoded.length / LINE) }, (_, index) => `${DATA_LINE} ${encoded.slice(index * LINE, (index + 1) * LINE)}`)];
  return `${body}${lines.join('\n')}\n`;
};

/** a film file's set and scene; a design carrying no scene is a set alone */
export const readFilmFile = (text: string): Readonly<{ set: string; scene?: string; }> => {
  const { set, encoded } = split(text);
  return (encoded === undefined) ? { set: text } : { set, scene: fromBase64(encoded) };
};

// == Util ========================================================================
/** a text without its scene's data section, and that section's base64 when it has one */
const split = (text: string): Readonly<{ set: string; encoded?: string; }> => {
  const lines = text.split(/(?<=\n)/);
  const kept: string[] = [];
  let encoded: string | undefined, inScene = false;
  for(const line of lines) {
    const trimmed = line.trim();
    if(inScene && trimmed.startsWith(DATA_LINE)) { encoded += trimmed.slice(DATA_LINE.length).trim(); continue; }
    inScene = trimmed.startsWith(DATA_START) && (trimmed.slice(DATA_START.length).trim().toLowerCase() === SCENE_FILE);
    if(inScene) { encoded = ''; continue; }
    kept.push(line);
  }
  return { set: kept.join(''), ...((encoded !== undefined) ? { encoded } : {}) };
};

const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for(const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const fromBase64 = (encoded: string): string => new TextDecoder().decode(Uint8Array.from(atob(encoded), character => character.charCodeAt(0)));
