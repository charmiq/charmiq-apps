// a pin: a cell of a set whose part is held where it stands, as a brick film's maker
// glues or wires a brick (one flying from an explosion, a fake ceiling a chandelier
// hangs from). The part filling the cell is pinned, a copy of a component whole: held,
// and holding what its studs hold, though it still collides (SEE: check.ts). Written as
// Brick Studio's meta-command in the set's own file, its words in pairs:
// `0 !BRICKSTUDIO PIN X 3 Z 4 LEVEL 6`. A line Brick Studio cannot read is kept as
// written and pins nothing
// ********************************************************************************
// == Constants ===================================================================
/** Brick Studio's meta-command naming a pin */
export const PIN_META = ['0', '!BRICKSTUDIO', 'PIN'] as const;

const INTEGER = /^-?\d+$/;

// == Types =======================================================================
/** the cell a pin holds the part filling */
export type Pin = Readonly<{ x: number; z: number; level: number; }>;

// == Reading =====================================================================
/** whether a line's words are the pin meta-command, readable or not */
export const isPinLine = (fields: ReadonlyArray<string>): boolean => (fields.length >= PIN_META.length) && PIN_META.every((word, index) => fields[index].toUpperCase() === word);

/** the pin a pin line's words name, or undefined where Brick Studio cannot read them
 *  (an unknown word, a word named twice, a place left out or not whole) */
export const pinOf = (fields: ReadonlyArray<string>): Pin | undefined => {
  if(!isPinLine(fields)) return undefined;
  const read: Record<string, string> = {};
  for(let at=PIN_META.length; at<fields.length; at+=2) {
    const word = fields[at].toUpperCase(), value = fields[at + 1];
    if((word in read) || (value === undefined)) return undefined/*named twice, or without its value*/;
    read[word] = value;
  }
  const { X: x, Z: z, LEVEL: level, ...rest } = read;
  if(Object.keys(rest).length > 0) return undefined/*an unknown word*/;
  if(![x, z, level].every(value => (typeof value === 'string') && INTEGER.test(value))) return undefined;
  return { x: Number(x), z: Number(z), level: Number(level) };
};

// == Writing =====================================================================
/** a pin's line: its words in a fixed order */
export const pinLine = (pin: Pin): string => [...PIN_META, 'X', String(pin.x), 'Z', String(pin.z), 'LEVEL', String(pin.level)].join(' ');
