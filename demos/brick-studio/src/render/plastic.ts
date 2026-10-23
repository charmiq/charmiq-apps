import * as THREE from 'three';

import type { Finish } from '../catalog';
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

/** ABS for the path tracer: a glossy dielectric is already physical, so no clear
 *  coat (the rasterizer's stand-in for that gloss). The tracer also renders a clear
 *  coat black on this geometry */
export const TRACED_PLASTIC: THREE.MeshPhysicalMaterialParameters = { roughness: 0.2, ior: 1.54/*ABS*/, specularIntensity: 0.85 };

/** sets a material to the ABS look at a stop */
export const applyPlastic = (material: THREE.MeshPhysicalMaterial, fidelity: Fidelity): void => {
  material.setValues(PLASTIC(fidelity));
  material.needsUpdate = true;
};

// == Metal =======================================================================
/** a metal look at a stop: chrome a bright satin mirror that takes its color from what
 *  it reflects (blurred and strengthened, as a studio's white cards light a chrome
 *  part: a true mirror in a dark studio reflects the dark), pearl a soft sheen over its
 *  color. Draft keeps them duller, as it keeps plastic */
export const METAL = (finish: Finish, fidelity: Fidelity): THREE.MeshPhysicalMaterialParameters => (finish === 'chrome')
  ? { metalness: 1, roughness: (fidelity < 1) ? 0.4 : 0.3, clearcoat: 0, specularIntensity: 1, envMapIntensity: 3 }
  : { metalness: 0.6, roughness: (fidelity < 1) ? 0.45 : 0.32, clearcoat: (fidelity < 1) ? 0 : 0.4, clearcoatRoughness: 0.2, specularIntensity: 1 };

/** sets a material to a metal look at a stop */
export const applyMetal = (material: THREE.MeshPhysicalMaterial, finish: Finish, fidelity: Fidelity): void => {
  material.setValues(METAL(finish, fidelity));
  material.needsUpdate = true;
};

/** a metal look for the path tracer, in its color */
export const tracedMetal = (finish: Finish, color: THREE.Color): THREE.MeshPhysicalMaterialParameters => ({ ...METAL(finish, 1), color: color.clone() });

// == Transparent =================================================================
/** polycarbonate, which transparent bricks are moulded from */
const POLYCARBONATE_IOR = 1.585;

/** how deep into a brick its tint absorbs, in studs: deep enough that a wall shows
 *  through, shallow enough that a stack of them glows its color */
const ABSORPTION = 1.2/*studs*/;

/** see-through plastic of one tint at a stop. Draft blends; from Plastic up the
 *  surface is clear and glossy and light refracts through the brick
 *  (`transmission`), taking its color from absorption through the brick's depth, as
 *  real transparent plastic does */
export const GLASS = (tint: THREE.Color, fidelity: Fidelity): THREE.MeshPhysicalMaterialParameters =>
  (fidelity < 1)
    ? { color: tint.clone(), transmission: 0, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.1, ior: POLYCARBONATE_IOR, thickness: 0, attenuationDistance: Infinity }
    : { color: new THREE.Color(1, 1, 1).lerp(tint, 0.25), transmission: 1, transparent: false, opacity: 1, depthWrite: true, roughness: 0.03, ior: POLYCARBONATE_IOR, specularIntensity: 1,
        thickness: 1/*studs*/, attenuationColor: tint.clone(), attenuationDistance: ABSORPTION };

/** sets a material to see-through plastic of its tint at a stop */
export const applyGlass = (material: THREE.MeshPhysicalMaterial, tint: THREE.Color, fidelity: Fidelity): void => {
  material.setValues(GLASS(tint, fidelity));
  material.needsUpdate = true;
};

/** see-through plastic for the path tracer: thin-walled, each wall a ray crosses
 *  filtering it by the tint. LDraw parts are open shells (hollow undersides, open
 *  studs), not closed solids, so volumetric absorption traps rays and renders black;
 *  the walls of a hollow brick compound the color instead */
export const tracedGlass = (tint: THREE.Color): THREE.MeshPhysicalMaterialParameters =>
  ({ color: tint.clone(), transmission: 1, roughness: 0.02, ior: POLYCARBONATE_IOR, specularIntensity: 1, thickness: 0 });

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
