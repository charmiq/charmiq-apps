import type { StageCamera } from './film';
import { boxCorners, type Box } from './measure';
import type { Point } from './recorder';

// what a frame's camera sees, as the studio draws it: its scene is the film's x east,
// height up and z north turned to the scene's -z (plates 0.4 studs), its camera
// standing at its position looking at its target, the world's up its up, its field of
// view vertical across the frame's height, at the frame's shape. Looking straight down
// or up, the studio's aim (three.js lookAt) turns east to the screen's right: north is
// up looking down, south looking up. A camera standing on its target looks north (the
// scene's -z). A place on the screen
// is a share of the frame across (0 its left edge, 1 its right) and down (0 its top, 1
// its bottom); a point behind the camera has none. An actor's box on the screen is the
// bounds of its corners in front of the camera: in frame where any of it is
// ********************************************************************************
// == Constants ===================================================================
const STUDS_PER_PLATE = 0.4;
/** the nearest a point is to the camera, along its view, and still seen (studs) */
const NEAR = 0.05;

// == Types =======================================================================
/** a point on the screen: across and down as shares of the frame, and how far ahead
 *  of the camera it is (studs, along its view) */
export type OnScreen = Readonly<{ x: number; y: number; depth: number; }>;
/** a box on the screen: its bounds across and down (shares of the frame, past 0 and 1
 *  where it runs off), its middle, the nearest of it (studs ahead), whether any of it is
 *  in frame, and whether it is wholly behind the camera (its bounds then 0) */
export type ScreenBox = Readonly<{ left: number; top: number; right: number; bottom: number; center: Readonly<{ x: number; y: number; }>; depth: number; inFrame: boolean; behind: boolean; }>;

type Vector = readonly [number, number, number];

// == Screen ======================================================================
/** where a point stands on the screen, or undefined behind the camera */
export const onScreen = (camera: StageCamera, aspect: number, point: Point): OnScreen | undefined => {
  const { ahead: depth, across, up } = inView(camera, point);
  if(depth < NEAR) return undefined;
  const tan = Math.tan((camera.fov * (Math.PI / 180)) / 2);
  return { x: 0.5 + (across / (2 * depth * tan * aspect)), y: 0.5 - (up / (2 * depth * tan)), depth };
};

/** a point as a camera sees it (studs): how far ahead along its view, to its right,
 *  above its view, and away */
export const inView = (camera: StageCamera, point: Point): Readonly<{ ahead: number; across: number; up: number; distance: number; }> => {
  const { eye, forward, right, up } = viewOf(camera);
  const offset = subtract(scene(point), eye);
  return { ahead: dot(offset, forward), across: dot(offset, right), up: dot(offset, up), distance: Math.hypot(...offset) };
};

/** an actor's box on the screen */
export const boxOnScreen = (camera: StageCamera, aspect: number, box: Box): ScreenBox => {
  const seen = boxCorners(box).flatMap(corner => onScreen(camera, aspect, corner) ?? []);
  if(seen.length < 1) return { left: 0, top: 0, right: 0, bottom: 0, center: { x: 0, y: 0 }, depth: 0, inFrame: false, behind: true };
  const [left, right] = [Math.min(...seen.map(each => each.x)), Math.max(...seen.map(each => each.x))];
  const [top, bottom] = [Math.min(...seen.map(each => each.y)), Math.max(...seen.map(each => each.y))];
  return {
    left, top, right, bottom, center: { x: (left + right) / 2, y: (top + bottom) / 2 }, depth: Math.min(...seen.map(each => each.depth)),
    inFrame: (right > 0) && (left < 1) && (bottom > 0) && (top < 1), behind: false,
  };
};

/** the angle (degrees) between where two cameras look */
export const viewAngle = (a: StageCamera, b: StageCamera): number => {
  const cosine = dot(viewOf(a).forward, viewOf(b).forward);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * (180 / Math.PI);
};

// == Util ========================================================================
/** a camera's frame in the scene: where it stands, its view, its right and its up */
const viewOf = ({ position, target }: StageCamera) => {
  const eye = scene(position);
  const forward = unit(subtract(scene(target), eye)) ?? [0, 0, -1]/*on its target*/;
  const right = unit(cross(forward, [0, 1, 0])) ?? [1, 0, 0]/*straight down or up*/;
  return { eye, forward, right, up: cross(right, forward) };
};

const scene = ({ x, z, height }: Point): Vector => [x, height * STUDS_PER_PLATE, -z];
const subtract = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vector, b: Vector): number => (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
const cross = (a: Vector, b: Vector): Vector => [(a[1] * b[2]) - (a[2] * b[1]), (a[2] * b[0]) - (a[0] * b[2]), (a[0] * b[1]) - (a[1] * b[0])];
/** a vector a unit long, or undefined for none */
const unit = (a: Vector): Vector | undefined => { const length = Math.hypot(...a); return (length > 1e-9) ? [a[0] / length, a[1] / length, a[2] / length] : undefined/*no direction*/; };
