// a set's sky: generated (a gradient from its horizon color to its zenith color, its
// clouds drawn from a seed) or a picture from the Drive, standing behind the set or,
// with `lights`, lighting it too. Written as Brick Studio's meta-command in the set's
// header, its words in pairs: `0 !BRICKSTUDIO SKY HORIZON #CFE2F3 ZENITH #4F87C7
// CLOUDS 0.35 SEED 1`, or `0 !BRICKSTUDIO SKY IMAGE charmiq://file/...`, `LIGHTS` added
// to either. A line Brick Studio cannot read is kept as written and draws no sky
// ********************************************************************************
// == Constants ===================================================================
/** Brick Studio's meta-command naming a set's sky */
export const SKY_META = ['0', '!BRICKSTUDIO', 'SKY'] as const;
/** a generated sky's values where its line names none: a pale summer sky, lightly
 *  clouded */
export const DEFAULT_SKY = { horizon: '#CFE2F3', zenith: '#4F87C7', clouds: 0.35, seed: 1 } as const;
/** the largest seed: a whole number a 32-bit hash takes as it is */
export const MAX_SEED = 2 ** 31 - 1;

const HEX = /^#[0-9a-f]{6}$/i;
/** a file a sky's image is: the Platform's file uris, one word */
const FILE_URI = /^charmiq:\/\/file\/\S+$/;

// == Types =======================================================================
/** a set's sky: generated from its colors, clouds and seed (each its default where it
 *  names none), or the picture `image` names (its colors the sky drawn when the
 *  picture cannot be read); `lights` when it lights the set as well */
export type Sky = Readonly<{ horizon?: string; zenith?: string; clouds?: number; seed?: number; image?: string; lights?: true; }>;
/** a generated sky with every value it is drawn from */
export type DrawnSky = Readonly<{ horizon: string; zenith: string; clouds: number; seed: number; }>;

// == Reading =====================================================================
/** whether a line's words are the sky meta-command, readable or not */
export const isSkyLine = (fields: ReadonlyArray<string>): boolean => (fields.length >= SKY_META.length) && SKY_META.every((word, index) => fields[index].toUpperCase() === word);

/** the sky a sky line's words name, or undefined where Brick Studio cannot read them
 *  (an unknown word, a value out of its range, a word named twice) */
export const skyOf = (fields: ReadonlyArray<string>): Sky | undefined => {
  if(!isSkyLine(fields)) return undefined;
  const sky: { -readonly [K in keyof Sky]: Sky[K] } = {};
  for(let at=SKY_META.length; at<fields.length; at++) {
    const word = fields[at].toUpperCase(), value = fields[at + 1];
    if(word === 'LIGHTS') { if(sky.lights) return undefined; sky.lights = true; continue; }
    if(value === undefined) return undefined/*a word without its value*/;
    at++;
    if((word === 'HORIZON') && (sky.horizon === undefined) && HEX.test(value)) sky.horizon = value.toUpperCase();
    else if((word === 'ZENITH') && (sky.zenith === undefined) && HEX.test(value)) sky.zenith = value.toUpperCase();
    else if((word === 'CLOUDS') && (sky.clouds === undefined) && isShare(Number(value)) && /^\d*\.?\d+$/.test(value)) sky.clouds = Number(value);
    else if((word === 'SEED') && (sky.seed === undefined) && isSeed(Number(value)) && /^\d+$/.test(value)) sky.seed = Number(value);
    else if((word === 'IMAGE') && (sky.image === undefined) && FILE_URI.test(value)) sky.image = value;
    else return undefined;
  }
  return sky;
};

/** the generated sky a sky draws: its own values, the default's where it names none */
export const drawnSky = (sky: Sky): DrawnSky => ({ horizon: sky.horizon ?? DEFAULT_SKY.horizon, zenith: sky.zenith ?? DEFAULT_SKY.zenith, clouds: sky.clouds ?? DEFAULT_SKY.clouds, seed: sky.seed ?? DEFAULT_SKY.seed });

// == Writing =====================================================================
/** a sky's line: the words it names, in a fixed order */
export const skyLine = (sky: Sky): string => [
  ...SKY_META,
  ...((sky.horizon !== undefined) ? ['HORIZON', sky.horizon.toUpperCase()] : []),
  ...((sky.zenith !== undefined) ? ['ZENITH', sky.zenith.toUpperCase()] : []),
  ...((sky.clouds !== undefined) ? ['CLOUDS', String(Number(sky.clouds.toFixed(2)))] : []),
  ...((sky.seed !== undefined) ? ['SEED', String(sky.seed)] : []),
  ...((sky.image !== undefined) ? ['IMAGE', sky.image] : []),
  ...(sky.lights ? ['LIGHTS'] : []),
].join(' ');

/** a sky a command or a control gives, made a Sky, or why it is none: colors `#rrggbb`,
 *  clouds 0 to 1, a seed a whole number from 0, an image a Platform file, lights true
 *  or false */
export const skyFrom = (given: unknown): Sky | string => {
  if((typeof given !== 'object') || (given === null) || Array.isArray(given)) return 'A sky is { horizon, zenith, clouds, seed } or { image }, with lights';
  const { horizon, zenith, clouds, seed, image, lights, ...rest } = given as Record<string, unknown>;
  const unknown = Object.keys(rest);
  if(unknown.length > 0) return `A sky has no ${unknown[0]}: it takes horizon, zenith, clouds, seed, image and lights`;
  for(const [name, color] of [['horizon', horizon], ['zenith', zenith]] as const) if((color !== undefined) && ((typeof color !== 'string') || !HEX.test(color))) return `The sky's ${name} is a color written #rrggbb`;
  if((clouds !== undefined) && ((typeof clouds !== 'number') || !isShare(clouds))) return 'The sky\'s clouds are 0 (none) to 1 (overcast)';
  if((seed !== undefined) && ((typeof seed !== 'number') || !isSeed(seed))) return `The sky's seed is a whole number from 0 to ${MAX_SEED}`;
  if((image !== undefined) && ((typeof image !== 'string') || !FILE_URI.test(image))) return 'The sky\'s image is a Drive file (charmiq://file/...)';
  if((lights !== undefined) && (typeof lights !== 'boolean')) return 'The sky\'s lights is true or false';
  return {
    ...((horizon !== undefined) ? { horizon: (horizon as string).toUpperCase() } : {}), ...((zenith !== undefined) ? { zenith: (zenith as string).toUpperCase() } : {}),
    ...((clouds !== undefined) ? { clouds: Number((clouds as number).toFixed(2)) } : {}), ...((seed !== undefined) ? { seed: seed as number } : {}),
    ...((image !== undefined) ? { image: image as string } : {}), ...(lights ? { lights: true as const } : {}),
  };
};

// == Internal ====================================================================
const isShare = (value: number): boolean => Number.isFinite(value) && (value >= 0) && (value <= 1);
const isSeed = (value: number): boolean => Number.isInteger(value) && (value >= 0) && (value <= MAX_SEED);
