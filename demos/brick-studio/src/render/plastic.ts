import * as THREE from 'three';

import type { Fidelity } from './fidelity';

// moulded ABS: what makes a rendered brick read as a toy brick. Glossy plastic with a
// clear top coat, a hairline gap where two bricks meet, and the faint tint and gloss
// variation between bricks from different moulding runs
// ********************************************************************************
// == Material ====================================================================
/** the ABS look at a stop (stop 0 keeps the draft look) */
export const PLASTIC = (fidelity: Fidelity): THREE.MeshPhysicalMaterialParameters =>
  (fidelity < 1)
    ? { roughness: 0.34, clearcoat: 0.12, clearcoatRoughness: 0.3, ior: 1.5, specularIntensity: 1 }
    : { roughness: 0.24, clearcoat: 0.55, clearcoatRoughness: 0.06, ior: 1.54/*ABS*/, specularIntensity: 0.85 };

/** sets a material to the ABS look at a stop */
export const applyPlastic = (material: THREE.MeshPhysicalMaterial, fidelity: Fidelity): void => {
  material.setValues(PLASTIC(fidelity));
  material.needsUpdate = true;
};

// == Seams =======================================================================
/** the gap between two bricks that touch, in studs: a real 0.1 mm on an 8 mm stud,
 *  doubled so it survives at viewing distance */
const SEAM = 0.025/*studs*/;

/** shrinks a part about its own center by the seam on every axis, so neighbors
 *  touching face to face show a hairline. Applied in the part's own space, before
 *  its placement */
export const seamMatrix = (geometry: THREE.BufferGeometry): THREE.Matrix4 => {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const shrink = (extent: number): number => (extent > SEAM * 4) ? ((extent - SEAM) / extent) : 1/*too thin to shrink*/;
  return new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
    .multiply(new THREE.Matrix4().makeScale(shrink(size.x), shrink(size.y), shrink(size.z)))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
};

// == Variation ===================================================================
/** a brick's color with the slight lightness drift of its moulding run, fixed by
 *  the brick's identity so it never flickers between renders */
export const tintedColor = (hex: string, identity: string): THREE.Color => {
  const color = new THREE.Color(hex);
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 });
  const drift = (hash(identity) - 0.5) * 0.03/*±1.5% lightness*/;
  return color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + drift, 0, 1));
};

/** a stable value in [0, 1) for a string */
const hash = (text: string): number => {
  let value = 2166136261;
  for(let i=0; i<text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0) / 4294967296;
};
