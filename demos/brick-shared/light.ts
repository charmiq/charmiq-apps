// a stage light's color and where its key stands, as Brick Studio's stage takes them
// and Stop Motion's scene writes them: a white balance (kelvin, or by name), a
// saturation, and the key light's direction. Brick Studio grades and lights by them
// (SEE: brick-studio/src/render/grade.ts)
// ********************************************************************************
// == Constants ===================================================================
/** the color temperatures a white balance takes (kelvin): the Planckian locus's fit */
export const WHITE_RANGE = { least: 1_700, most: 25_000 } as const;
/** the picture's own white (kelvin) */
export const NEUTRAL_WHITE = 6_500;
/** a white balance by name (kelvin) */
export const WHITE_NAMES: Readonly<Record<string, number>> = { tungsten: 3_200, warm: 5_000, neutral: NEUTRAL_WHITE, cool: 8_000, shade: 10_000 };
/** the most a saturation scales colors by */
export const MOST_SATURATION = 2;

// == Types =======================================================================
/** where the key light stands, as setView names a direction: azimuth 0 south of the
 *  set, 90 east; elevation degrees above level */
export type KeyFrom = Readonly<{ azimuth: number; elevation: number; }>;
/** a light's color and key */
export type LightTone = Readonly<{ white?: number; saturation?: number; from?: KeyFrom; }>;

// == Reading =====================================================================
/** a white balance as kelvin: a number of them, or a name of one; undefined for
 *  anything else */
export const toKelvin = (value: unknown): number | undefined => {
  if((typeof value === 'string') && Object.prototype.hasOwnProperty.call(WHITE_NAMES, value)) return WHITE_NAMES[value]/*its own names, never an inherited one*/;
  if((typeof value !== 'number') || !Number.isFinite(value) || (value < WHITE_RANGE.least) || (value > WHITE_RANGE.most)) return undefined;
  return value;
};

const isFiniteNumber = (value: unknown): value is number => (typeof value === 'number') && Number.isFinite(value);

/** a light's `white`, `saturation` and `from` as given (each left out when not);
 *  throws naming the first misgiven, as `light.<name> is …` */
export const lightToneOf = (given: Readonly<Record<string, unknown>>): LightTone => {
  const tone: { white?: number; saturation?: number; from?: KeyFrom; } = {};
  if(given.white !== undefined) {
    const white = toKelvin(given.white);
    const names = Object.keys(WHITE_NAMES);
    if(white === undefined) throw new Error(`light.white is a color temperature, ${WHITE_RANGE.least} to ${WHITE_RANGE.most} kelvin (6500 neutral, lower warmer), or ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);
    tone.white = white;
  } /* else -- the look's own white */
  if(given.saturation !== undefined) {
    if(!isFiniteNumber(given.saturation) || (given.saturation < 0) || (given.saturation > MOST_SATURATION)) throw new Error(`light.saturation is 0 to ${MOST_SATURATION}`);
    tone.saturation = given.saturation;
  } /* else -- the look's own saturation */
  if(given.from !== undefined) {
    const { azimuth, elevation } = ((typeof given.from === 'object') && (given.from !== null)) ? given.from as Record<string, unknown> : {} as Record<string, unknown>;
    if(!isFiniteNumber(azimuth) || !isFiniteNumber(elevation) || (elevation < 1) || (elevation > 90)) throw new Error('light.from is where the key light stands, { azimuth, elevation }: azimuth as setView\'s (0 south of the set, 90 east), elevation 1 to 90 degrees');
    tone.from = { azimuth, elevation };
  } /* else -- the look's own key */
  return tone;
};
