import { NEUTRAL_WHITE, type KeyFrom } from '../../../brick-shared/light';

// a stage light's color and where its key stands. Its white balance shows the light as
// one of its color temperature does in a picture balanced for daylight (6500 K, the
// picture's own white): each channel scaled by a blackbody's color at that temperature
// over 6500 K's, its brightness kept, so lower is warmer and higher cooler. Its
// saturation scales each color's distance from its own gray. Both grade the frame's
// light before its tone curve, at every look, the path tracer's included
// ********************************************************************************
// == Constants ===================================================================
/** a light's brightness from its linear red, green and blue (Rec. 709) */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

// == Types =======================================================================
/** a frame's grade: each channel's gain and the saturation */
export type Grade = Readonly<{ white: readonly [number, number, number]; saturation: number; }>;

// == White Balance ===============================================================
/** a blackbody's color at `kelvin`, in linear red, green and blue (Kim et al.'s cubic
 *  fit of the Planckian locus, CIE 1931, through XYZ) */
const blackbody = (kelvin: number): readonly [number, number, number] => {
  const t = kelvin;
  const x = (t <= 4000) ? ((-0.2661239e9 / t ** 3) - (0.2343589e6 / t ** 2) + (0.8776956e3 / t) + 0.179910)
                        : ((-3.0258469e9 / t ** 3) + (2.1070379e6 / t ** 2) + (0.2226347e3 / t) + 0.240390);
  const y = (t <= 2222) ? ((-1.1063814 * x ** 3) - (1.34811020 * x ** 2) + (2.18555832 * x) - 0.20219683)
          : (t <= 4000) ? ((-0.9549476 * x ** 3) - (1.37418593 * x ** 2) + (2.09137015 * x) - 0.16748867)
                        : ((3.0817580 * x ** 3) - (5.87338670 * x ** 2) + (3.75112997 * x) - 0.37001483);
  const [X, Y, Z] = [x / y, 1, (1 - x - y) / y];
  return [(3.2406 * X) - (1.5372 * Y) - (0.4986 * Z), (-0.9689 * X) + (1.8758 * Y) + (0.0415 * Z), (0.0557 * X) - (0.2040 * Y) + (1.0570 * Z)];
};

/** each channel's gain showing a light of `kelvin` as a daylight-balanced picture does,
 *  its brightness kept: 1, 1, 1 at 6500 K */
export const whiteGains = (kelvin: number): readonly [number, number, number] => {
  const [color, neutral] = [blackbody(kelvin), blackbody(NEUTRAL_WHITE)];
  const gains = color.map((channel, index) => Math.max(0, channel / neutral[index]))/*a red-hot light holds no blue*/;
  const brightness = gains.reduce((sum, gain, index) => sum + (gain * LUMA[index]), 0);
  return [gains[0] / brightness, gains[1] / brightness, gains[2] / brightness];
};

/** a light's grade: none when it neither balances white nor saturates */
export const gradeOf = (light: Readonly<{ white?: number; saturation?: number; }>): Grade | undefined =>
  (((light.white ?? NEUTRAL_WHITE) === NEUTRAL_WHITE) && ((light.saturation ?? 1) === 1)) ? undefined
    : { white: whiteGains(light.white ?? NEUTRAL_WHITE), saturation: light.saturation ?? 1 };

// == Key =========================================================================
/** the direction toward the key light (scene axes: x east, y up, z south) */
export const keyDirection = ({ azimuth, elevation }: KeyFrom): readonly [number, number, number] => {
  const [turn, rise] = [(azimuth * Math.PI) / 180, (elevation * Math.PI) / 180];
  return [Math.sin(turn) * Math.cos(rise), Math.sin(rise), Math.cos(turn) * Math.cos(rise)];
};

// == Shader ======================================================================
/** the grade as GLSL: `gradeWhite` and `gradeSaturation` uniforms, and grade(color) on
 *  linear light */
export const GRADE_GLSL = /* glsl */`
  uniform vec3 gradeWhite; uniform float gradeSaturation;
  vec3 grade(vec3 color) {
    color *= gradeWhite;
    float gray = dot(color, vec3(${LUMA.join(', ')}));
    return max(vec3(0.0), mix(vec3(gray), color, gradeSaturation));
  }`;
