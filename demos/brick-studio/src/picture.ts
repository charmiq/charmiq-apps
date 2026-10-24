import { isImageName } from '../../brick-shared/shipped';

// a picture standing in a set: an image (a Drive file, or a picture Brick Studio
// ships, by name: SEE: brick-shared/shipped.ts) on a flat panel `width` by
// `height` studs, placed as a part is (`x` and `z` its footprint's south-west corner,
// `level` its bottom, turned clockwise seen from above by `rotation`). Upright, it
// stands in the middle of a stud row `width` long, facing south at rotation 0; flat
// (`flat`), it lies on its level's studs, its top edge north. The image covers the panel
// unless `fit` says contain or stretch; with no height, the panel takes the image's own
// shape at its width. Written as Brick Studio's meta-command in the set's own file, its
// words in pairs: `0 !BRICKSTUDIO PICTURE IMAGE charmiq://file/... X 0 Z 4 LEVEL 3
// ROTATION 0 WIDTH 8 HEIGHT 6`, `FLAT` and `FIT CONTAIN` or `FIT STRETCH` as named. A
// line Brick Studio cannot read is kept as written and draws nothing
// ********************************************************************************
// == Constants ===================================================================
/** Brick Studio's meta-command naming a picture */
export const PICTURE_META = ['0', '!BRICKSTUDIO', 'PICTURE'] as const;
/** a picture's least and greatest size either way (studs) */
export const MIN_PICTURE = 1;
export const MAX_PICTURE = 64;
/** the folder manifest.json `bundle.resources` declares for the pictures Brick Studio
 *  ships for its example films: whatever images it holds are the shipped pictures */
// SEE: ../pictures/README.md
export const SHIPPED_PICTURES = 'picture/';
/** how a picture's image may fit its panel other than covering it */
export const FITS = ['contain', 'stretch'] as const;

const INTEGER = /^-?\d+$/;
const NUMBER = /^\d*\.?\d+$/;

// == Types =======================================================================
export type PictureFit = typeof FITS[number];
/** a picture in a set (SEE: the header) */
export type Picture = Readonly<{ image: string; x: number; z: number; level: number; rotation: 0 | 90 | 180 | 270; width: number; height?: number; flat?: true; fit?: PictureFit; }>;

// == Reading =====================================================================
/** whether a line's words are the picture meta-command, readable or not */
export const isPictureLine = (fields: ReadonlyArray<string>): boolean => (fields.length >= PICTURE_META.length) && PICTURE_META.every((word, index) => fields[index].toUpperCase() === word);

/** the picture a picture line's words name, or undefined where Brick Studio cannot read
 *  them (an unknown word, a value out of its range, a word named twice, its image or
 *  place left out) */
export const pictureOf = (fields: ReadonlyArray<string>): Picture | undefined => {
  if(!isPictureLine(fields)) return undefined;
  const read: Record<string, string | true> = {};
  for(let at=PICTURE_META.length; at<fields.length; at++) {
    const word = fields[at].toUpperCase();
    if(word in read) return undefined/*named twice*/;
    if(word === 'FLAT') { read[word] = true; continue; }
    const value = fields[at + 1];
    if(value === undefined) return undefined/*a word without its value*/;
    read[word] = value;
    at++;
  }
  const { IMAGE: image, X: x, Z: z, LEVEL: level, ROTATION: rotation = '0', WIDTH: width, HEIGHT: height, FLAT: flat, FIT: fit, ...rest } = read;
  if(Object.keys(rest).length > 0) return undefined/*an unknown word*/;
  if(!isImageName(image)) return undefined;
  if(![x, z, level, rotation].every(value => (typeof value === 'string') && INTEGER.test(value))) return undefined;
  if(![width, ...((height === undefined) ? [] : [height])].every(value => (typeof value === 'string') && NUMBER.test(value) && isSize(Number(value)))) return undefined;
  const turn = Number(rotation);
  if(![0, 90, 180, 270].includes(turn)) return undefined;
  const fitted = (typeof fit === 'string') ? FITS.find(each => each === fit.toLowerCase()) : undefined;
  if((fit !== undefined) && !fitted) return undefined;
  return {
    image, x: Number(x), z: Number(z), level: Number(level), rotation: turn as Picture['rotation'], width: Number(width),
    ...((height !== undefined) ? { height: Number(height) } : {}), ...(flat ? { flat: true as const } : {}), ...(fitted ? { fit: fitted } : {}),
  };
};

// == Writing =====================================================================
/** a picture's line: the words it names, in a fixed order */
export const pictureLine = (picture: Picture): string => [
  ...PICTURE_META, 'IMAGE', picture.image, 'X', String(picture.x), 'Z', String(picture.z), 'LEVEL', String(picture.level), 'ROTATION', String(picture.rotation),
  'WIDTH', String(Number(picture.width.toFixed(2))), ...((picture.height !== undefined) ? ['HEIGHT', String(Number(picture.height.toFixed(2)))] : []),
  ...(picture.flat ? ['FLAT'] : []), ...(picture.fit ? ['FIT', picture.fit.toUpperCase()] : []),
].join(' ');

/** whether a size (studs) is one a picture takes */
export const isSize = (value: number): boolean => Number.isFinite(value) && (value >= MIN_PICTURE) && (value <= MAX_PICTURE);

// == Footprint ===================================================================
/** a picture's footprint as turned, in studs east and north of its south-west corner:
 *  upright, its width along its stud row and that one row across; flat, its width by
 *  `height` */
export const pictureFootprint = (picture: Picture, height: number): readonly [number, number] => {
  const quarter = (picture.rotation === 90) || (picture.rotation === 270);
  if(picture.flat) return quarter ? [height, picture.width] : [picture.width, height];
  return quarter ? [1, picture.width] : [picture.width, 1];
};
