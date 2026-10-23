import type { DrawnSky } from '../../../brick-shared/sky';

// a sky's panorama (twice as wide as high, the whole sky round the camera) as pixels:
// a generated sky drawn from its colors and seed alone, the same pixels every time,
// and a picture that is no panorama tiled round the horizon, every other copy mirrored
// so the seams meet, over its own top and bottom colors
// ********************************************************************************
// == Constants ===================================================================
/** a generated panorama's size (pixels): soft clouds need no more */
export const GENERATED_WIDTH = 1024;
export const GENERATED_HEIGHT = 512;
/** a tiled picture's panorama size (pixels) */
export const TILED_WIDTH = 2048;
export const TILED_HEIGHT = 1024;
/** how far from twice as wide as high a picture stands and is still a panorama */
const PANORAMA_SLACK = 0.1;
/** the band a tiled picture fills (degrees above the horizon: its top and its foot),
 *  and how far its edges blend into the colors above and below it */
const BAND_TOP = 35;
const BAND_FOOT = -5;
const BAND_BLEND = 4;
/** the cloud layer, a dome over the camera: how many noise cells a unit of it holds,
 *  how flat it is (a direction's height over its length plus this divides its reach, so
 *  clouds crowd toward the horizon and stay bounded there), the octaves summed, and how
 *  clouds fade into the horizon (that height: from nothing at the first to whole at
 *  the second) */
const CLOUD_SCALE = 1.6;
const CLOUD_DOME = 0.1;
const OCTAVES = 5;
const CLOUD_FADE: readonly [number, number] = [0, 0.01];
/** a cloud's lit top and how much darker its thickest underside is (0 to 1 of white,
 *  before the sky's tint), and how much grayer an overcast sky's clouds stand */
const CLOUD_LIT = 0.98;
const CLOUD_SHADE = 0.24;
const OVERCAST_GRAY = 0.24;

// == Types =======================================================================
/** RGBA pixels, the top row first (an ImageData's order) */
export type Pixels = Readonly<{ data: Uint8ClampedArray; width: number; height: number; }>;

// == Panoramas ===================================================================
/** a generated sky's panorama: the gradient from its horizon to its zenith, its clouds
 *  over it from its seed, and below the horizon the sky's own color just above it
 *  (where its clouds stand whole), darkening a fifth toward straight down: what shows
 *  past a set's edge meets the weather above it */
export const generatedPanorama = (sky: DrawnSky, width = GENERATED_WIDTH, height = GENERATED_HEIGHT): Pixels => {
  const horizon = rgbOf(sky.horizon), zenith = rgbOf(sky.zenith);
  const data = new Uint8ClampedArray(width * height * 4);
  const threshold = 0.72 - (0.44 * sky.clouds)/*clear to overcast*/;
  const lit = CLOUD_LIT - (OVERCAST_GRAY * sky.clouds * sky.clouds)/*an overcast sky's clouds gray*/;
  const above = Math.ceil(height / 2)/*the rows above the horizon*/;
  for(let y=0; y<above; y++) {
    const elevation = (0.5 - ((y + 0.5) / height)) * Math.PI, up = Math.sin(elevation), level = Math.cos(elevation);
    const toward = Math.pow(up, 0.45)/*pale near the horizon, deep overhead*/;
    const base = [0, 1, 2].map(channel => (horizon[channel] + ((zenith[channel] - horizon[channel]) * toward)));
    const fade = (sky.clouds > 0) ? smoothstep(CLOUD_FADE[0], CLOUD_FADE[1], up) : 0;
    for(let x=0; x<width; x++) {
      let [r, g, b] = base;
      if(fade > 0) {
        // the cloud dome overhead, seen along this direction
        const azimuth = ((x + 0.5) / width) * Math.PI * 2, reach = (level / (up + CLOUD_DOME)) * CLOUD_SCALE;
        const density = fbm(sky.seed, reach * Math.sin(azimuth), reach * Math.cos(azimuth));
        const cover = smoothstep(threshold, threshold + 0.18, density) * fade;
        if(cover > 0) {
          const shade = lit - (CLOUD_SHADE * smoothstep(threshold, threshold + 0.45, density));
          const cloud = [0, 1, 2].map(channel => ((shade * 255 * 0.85) + (horizon[channel] * 0.15 * shade)));
          r += (cloud[0] - r) * cover; g += (cloud[1] - g) * cover; b += (cloud[2] - b) * cover;
        } /* else -- clear sky here */
      } /* else -- a clear sky, or the horizon itself, where the clouds fade out */
      const at = ((y * width) + x) * 4;
      data[at] = r; data[at + 1] = g; data[at + 2] = b; data[at + 3] = 255;
    }
  }
  const atHorizon = rowAverage({ data, width, height }, Math.min(above - 1, Math.floor((0.5 - (Math.asin(CLOUD_FADE[1]) / Math.PI)) * height))/*the clouds whole*/);
  for(let y=above; y<height; y++) {
    const down = -Math.sin((0.5 - ((y + 0.5) / height)) * Math.PI), dim = 1 - (0.2 * Math.sqrt(down));
    for(let x=0; x<width; x++) {
      const at = ((y * width) + x) * 4;
      data[at] = atHorizon[0] * dim; data[at + 1] = atHorizon[1] * dim; data[at + 2] = atHorizon[2] * dim; data[at + 3] = 255;
    }
  }
  return { data, width, height };
};

/** whether a picture is a panorama: about twice as wide as high */
export const isPanorama = (width: number, height: number): boolean => Math.abs((width / height) - 2) <= (2 * PANORAMA_SLACK);

/** a picture that is no panorama made one: tiled round the horizon in a band from
 *  BAND_FOOT to BAND_TOP degrees (as many copies as fit at its own shape, every other
 *  one mirrored), its top row's color above and its bottom row's below, blended into
 *  them at the band's edges */
export const tiledPanorama = (picture: Pixels, width = TILED_WIDTH, height = TILED_HEIGHT): Pixels => {
  const band = BAND_TOP - BAND_FOOT;
  const tiles = Math.max(1, Math.round(360 / (band * (picture.width / picture.height))));
  const tile = width / tiles;
  const top = rowAverage(picture, 0), foot = rowAverage(picture, picture.height - 1);
  const data = new Uint8ClampedArray(width * height * 4);
  for(let y=0; y<height; y++) {
    const elevation = 90 - (((y + 0.5) / height) * 180);
    // where the band's picture stands at this height (0 its top, 1 its foot), held at
    // its edge past it, and how much of the color beyond it shows
    const v = Math.max(0, Math.min(1, (BAND_TOP - elevation) / band));
    const beyond = (elevation > BAND_TOP) ? Math.min(1, (elevation - BAND_TOP) / BAND_BLEND) : (elevation < BAND_FOOT) ? Math.min(1, (BAND_FOOT - elevation) / BAND_BLEND) : 0;
    const fill = (elevation > BAND_TOP) ? top : foot;
    for(let x=0; x<width; x++) {
      const copy = Math.floor(x / tile), across = (x - (copy * tile)) / tile;
      const u = ((copy % 2) === 1) ? (1 - across) : across/*mirrored, so its edges meet the next copy's*/;
      const at = ((y * width) + x) * 4;
      const sampled = (beyond < 1) ? sample(picture, u, v) : fill;
      for(let channel=0; channel<3; channel++) data[at + channel] = sampled[channel] + ((fill[channel] - sampled[channel]) * beyond);
      data[at + 3] = 255;
    }
  }
  return { data, width, height };
};

// == Internal ====================================================================
/** a color `#rrggbb` as its channels, 0 to 255 */
const rgbOf = (hex: string): readonly [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const smoothstep = (from: number, to: number, value: number): number => { const t = Math.max(0, Math.min(1, (value - from) / (to - from))); return t * t * (3 - (2 * t)); };

/** a whole-number hash of a seed and a lattice point, 0 to 1 */
const hash = (seed: number, x: number, y: number): number => {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(x, 0xc2b2ae35) ^ Math.imul(y, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** value noise at a point: the lattice's hashed values eased between, 0 to 1 */
const noise = (seed: number, x: number, y: number): number => {
  const [ix, iy] = [Math.floor(x), Math.floor(y)], [fx, fy] = [x - ix, y - iy];
  const [sx, sy] = [fx * fx * (3 - (2 * fx)), fy * fy * (3 - (2 * fy))];
  const top = hash(seed, ix, iy) + ((hash(seed, ix + 1, iy) - hash(seed, ix, iy)) * sx);
  const foot = hash(seed, ix, iy + 1) + ((hash(seed, ix + 1, iy + 1) - hash(seed, ix, iy + 1)) * sx);
  return top + ((foot - top) * sy);
};

/** octaves of noise summed, each twice as fine and half as strong, 0 to 1 */
const fbm = (seed: number, x: number, y: number): number => {
  let sum = 0, weight = 0.5, total = 0;
  for(let octave=0; octave<OCTAVES; octave++) {
    sum += noise(seed + octave, x * (2 ** octave), y * (2 ** octave)) * weight;
    total += weight;
    weight /= 2;
  }
  return sum / total;
};

/** a picture's row's average color */
const rowAverage = (picture: Pixels, row: number): readonly [number, number, number] => {
  const sums = [0, 0, 0];
  for(let x=0; x<picture.width; x++) for(let channel=0; channel<3; channel++) sums[channel] += picture.data[(((row * picture.width) + x) * 4) + channel];
  return [sums[0] / picture.width, sums[1] / picture.width, sums[2] / picture.width];
};

/** a picture's color at (u, v), each 0 to 1 across it, between its four nearest pixels */
const sample = (picture: Pixels, u: number, v: number): readonly [number, number, number] => {
  const x = Math.max(0, Math.min(picture.width - 1, (u * picture.width) - 0.5)), y = Math.max(0, Math.min(picture.height - 1, (v * picture.height) - 0.5));
  const [x0, y0] = [Math.floor(x), Math.floor(y)], [x1, y1] = [Math.min(picture.width - 1, x0 + 1), Math.min(picture.height - 1, y0 + 1)];
  const [fx, fy] = [x - x0, y - y0];
  const at = (px: number, py: number, channel: number) => picture.data[(((py * picture.width) + px) * 4) + channel];
  const channelAt = (channel: number) => {
    const top = at(x0, y0, channel) + ((at(x1, y0, channel) - at(x0, y0, channel)) * fx);
    const foot = at(x0, y1, channel) + ((at(x1, y1, channel) - at(x0, y1, channel)) * fx);
    return top + ((foot - top) * fy);
  };
  return [channelAt(0), channelAt(1), channelAt(2)];
};
