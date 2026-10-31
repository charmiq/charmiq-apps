import * as THREE from 'three';

// the key's shadow at Photo. Its softness is a width in studs: Photo's own, the
// softness it has always given the set (SEE: viewer.ts photoEdge), unless a stage's
// light asks otherwise: soft 0 a sun's hard edge, so a small part before a near wall
// throws its own shape there, to soft 1 the look's softest. The shadow map covers only
// what the camera sees of the set, however wide the set: the view's frustum, from the
// nearest to the farthest of the set's corners along it, met with the set's own box,
// both as the key sees them. A part off the picture shading what is on it stands
// between that and the key, so it is covered too. The cover steps in quarter octaves and its middle in whole texels, so a moving
// camera neither swims the shadow's edges nor rescales them every frame
// ********************************************************************************
// == Constants ===================================================================
/** how far a sun's hard shadow edge spreads either side (studs): a stage's light at soft 0 */
export const HARD_EDGE = 0.03;
/** how many times Photo's own edge the softest (soft 1) spreads */
const SOFTEST_EDGE = 4;
/** how far past what the camera sees the cover reaches beyond the edge's own spread
 *  (studs), so the edge's blur never reads past the map */
const COVER_MARGIN = 1;
/** the cover's steps (per octave) */
const COVER_STEPS = 4;

// == Types =======================================================================
/** the set as the key covers it: its box (scene units) */
export type KeyCover = Readonly<{ box: THREE.Box3; }>;

// == Fit =========================================================================
/** how far the key's shadow edge spreads either side at Photo (studs): Photo's `own`
 *  when a stage's light asks nothing, else from a sun's hard edge (soft 0) to the
 *  softest (soft 1) */
export const keyEdge = (own: number, soft: number | undefined): number =>
  (soft === undefined) ? own : (HARD_EDGE + (((own * SOFTEST_EDGE) - HARD_EDGE) * soft));

/** fits the key's shadow camera (orthographic, standing at the light and looking at its
 *  target) to what `view` sees of the set, and its blur to `edge` studs; false, the
 *  camera untouched, when the view sees none of the set or is not a perspective one */
export const fitKeyShadow = (light: THREE.DirectionalLight, view: THREE.Camera, cover: KeyCover, edge: number): boolean => {
  if(!(view as THREE.PerspectiveCamera).isPerspectiveCamera) return false/*a plan's own camera*/;
  const camera = light.shadow.camera;
  camera.position.copy(light.position);
  camera.lookAt(light.target.position);
  camera.updateMatrixWorld();
  view.updateMatrixWorld();

  // the set's corners: along the view (its depth range), and as the key sees them
  const corners = boxCorners(cover.box);
  const toView = view.matrixWorldInverse;
  const depths = corners.map(corner => -corner.clone().applyMatrix4(toView).z);
  const { near, far } = view as THREE.PerspectiveCamera;
  const [nearest, farthest] = [Math.max(near, Math.min(...depths)), Math.min(far, Math.max(...depths))];
  if(nearest >= farthest) return false/*the set behind the camera*/;
  const toKey = camera.matrixWorldInverse;
  const keyed = (points: ReadonlyArray<THREE.Vector3>) => points.map(point => point.clone().applyMatrix4(toKey));
  const setSeen = keyed(corners);

  // the view's frustum between those depths, through its own projection (a shifted lens
  // included), as the key sees it
  const frustum: THREE.Vector3[] = [];
  for(const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const ray = new THREE.Vector3(x, y, -1).applyMatrix4(view.projectionMatrixInverse)/*on the near plane, view space*/;
    for(const depth of [nearest, farthest]) frustum.push(ray.clone().multiplyScalar(depth / -ray.z).applyMatrix4(view.matrixWorld));
  }
  const viewSeen = keyed(frustum);

  // what both cover, across the key; the set's whole depth along it
  const margin = COVER_MARGIN + edge;
  const span = (points: ReadonlyArray<THREE.Vector3>, axis: 'x' | 'y' | 'z') => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))] as const;
  const across = (axis: 'x' | 'y') => {
    const [[setLeast, setMost], [viewLeast, viewMost]] = [span(setSeen, axis), span(viewSeen, axis)];
    return [Math.max(setLeast, viewLeast) - margin, Math.min(setMost, viewMost) + margin] as const;
  };
  const [[left, right], [bottom, top]] = [across('x'), across('y')];
  if((left >= right) || (bottom >= top)) return false/*the view misses the set*/;

  // a square cover in quarter octaves, its middle on whole texels
  const size = 2 ** (Math.ceil(Math.log2(Math.max(right - left, top - bottom)) * COVER_STEPS) / COVER_STEPS);
  const texel = size / light.shadow.mapSize.x;
  const [middleX, middleY] = [Math.round(((left + right) / 2) / texel) * texel, Math.round(((bottom + top) / 2) / texel) * texel];
  const [nearKey, farKey] = span(setSeen, 'z');
  camera.left = middleX - (size / 2);
  camera.right = middleX + (size / 2);
  camera.bottom = middleY - (size / 2);
  camera.top = middleY + (size / 2);
  camera.near = Math.max(0.1, -farKey - COVER_MARGIN);
  camera.far = -nearKey + COVER_MARGIN;
  camera.updateProjectionMatrix();
  light.shadow.radius = Math.max(1, edge / texel)/*the variance blur reads this many texels either side*/;
  return true;
};

/** a box's eight corners */
const boxCorners = ({ min, max }: THREE.Box3): ReadonlyArray<THREE.Vector3> =>
  [min.x, max.x].flatMap(x => [min.y, max.y].flatMap(y => [min.z, max.z].map(z => new THREE.Vector3(x, y, z))));
