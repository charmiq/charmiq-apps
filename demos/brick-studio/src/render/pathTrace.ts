/// <reference path="./pathTracer.d.ts" />
import * as THREE from 'three';
import type { PhysicalCamera, WebGLPathTracer } from 'three-gpu-pathtracer';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { Finish } from '../catalog';
import { DEFAULT_APERTURE, type Lens } from './effects';
import { GRADE_GLSL, type Grade } from './grade';
import { apertureWidth } from './lens';
import { tracedGlass, tracedMetal, TRACED_PLASTIC } from './plastic';

// the top stop: the scene path traced with three-gpu-pathtracer, so reflections,
// bounce light and soft shadows are physical. It refines one sample at a time while
// the camera holds still and restarts when anything moves; until its first samples
// land, the given raster callback draws the frame. It is lit and focused as the
// Photo stop is (the same key light, environment and focus), so stepping up from
// Photo changes the physics, not the picture. Loaded only when first reached
// ********************************************************************************
// == Constants ===================================================================
/** samples before a still frame counts as settled (what a screenshot waits for) */
export const SETTLE_SAMPLES = 96;
/** samples after which refining stops */
export const MAX_SAMPLES = 512;

/** the key light's disc as a share of its distance: the Photo stop's soft shadow; and
 *  how much wider a stage's softest key's disc is */
const KEY_SOFTNESS = 0.1;
const SOFTEST_KEY = 4;

// == Types =======================================================================
/** what the path traced scene is built from */
export type PathSource = Readonly<{
  /** each part's instances, and whether they are see-through plastic or metal */
  parts: ReadonlyArray<Readonly<{ mesh: THREE.InstancedMesh; glass: THREE.Color | undefined/*opaque*/; finish: Finish | undefined/*plastic*/; }>>;
  baseplate: THREE.Object3D | undefined;
  /** the pictures standing in the set, each a panel in its own material */
  pictures: THREE.Object3D;
  /** what lights the scene: the studio's capture, or a sky that lights (a panorama) */
  environment: THREE.Texture;
  environmentIntensity: number;
  /** behind the scene: the theme's color, or a sky's panorama */
  background: THREE.Color | THREE.Texture;
  /** the key light: its world position, the point it lights, its intensity and how
   *  much softer than the Photo stop's its shadow falls (0 as soft, 1 the softest) */
  key: Readonly<{ position: THREE.Vector3; target: THREE.Vector3; intensity: number; soft: number; }>;
}>;

// == PathTrace ===================================================================
export class PathTrace {
  /** what the current traced scene created and must free */
  private owned: Array<THREE.Material | THREE.BufferGeometry> = [];
  /** the grade the shown samples take, as the rasterized stops' (SEE: grade.ts) */
  private readonly grade = { gradeWhite: { value: new THREE.Vector3(1, 1, 1) }, gradeSaturation: { value: 1 } };
  /** the display materials graded, each once */
  private readonly graded = new WeakSet<THREE.Material>();

  private constructor(private readonly tracer: WebGLPathTracer, private readonly view: THREE.PerspectiveCamera, private readonly camera: PhysicalCamera) {}

  /** loads the path tracer; rejects where it cannot run (no WebGL 2 float targets) */
  public static async create(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, raster: () => void): Promise<PathTrace> {
    const { PhysicalCamera: Lens, WebGLPathTracer: Tracer } = await import('three-gpu-pathtracer');
    const tracer = new Tracer(renderer);
    tracer.bounces = 6;
    tracer.filterGlossyFactor = 0.4/*tames fireflies on the clear coat*/;
    tracer.tiles.set(2, 2);
    tracer.minSamples = 2;
    tracer.rasterizeSceneCallback = () => raster();
    const trace = new PathTrace(tracer, camera, new Lens());
    const shown = tracer.renderToCanvasCallback;
    tracer.renderToCanvasCallback = (target, renderer, quad) => { trace.gradeShown(quad.material as THREE.ShaderMaterial); shown(target, renderer, quad); };
    return trace;
  }

  /** grades the samples shown as the rasterized stops grade theirs; none shows them as
   *  traced */
  public setGrade(grade: Grade | undefined): void {
    this.grade.gradeWhite.value.set(...(grade?.white ?? [1, 1, 1]));
    this.grade.gradeSaturation.value = grade?.saturation ?? 1;
  }

  // ------------------------------------------------------------------------------
  /** rebuilds the traced scene without instancing: every brick its own mesh in its
   *  own tint, the baseplate's studs one merged mesh, each picture where it stands. Lit by the studio and the key,
   *  focused as `lens` says */
  public setScene(source: PathSource, lens: Lens): void {
    this.free();
    const scene = new THREE.Scene();
    scene.environment = source.environment;
    scene.environmentIntensity = source.environmentIntensity;
    scene.background = source.background;
    scene.add(...keyLight(source.key));

    for(const { mesh, glass, finish } of source.parts) scene.add(...this.bricks(mesh, glass, finish));
    for(const placed of [source.baseplate, source.pictures]) {
      placed?.updateMatrixWorld(true);
      placed?.traverse(object => {
        const mesh = object as THREE.Mesh;
        if(!mesh.isMesh) return;
        const flat = (mesh as THREE.InstancedMesh).isInstancedMesh ? this.merged(mesh as THREE.InstancedMesh) : mesh.clone();
        flat.matrixAutoUpdate = false;
        flat.matrix.copy(mesh.matrixWorld);
        scene.add(flat);
      });
    }

    this.aim(lens);
    this.tracer.setScene(scene, this.camera);
  }

  /** restarts refining from the camera's new place, focused as `lens` says */
  public moved(lens: Lens): void {
    this.aim(lens);
    this.tracer.updateCamera();
  }

  /** draws one sample (or the raster stand-in while compiling) */
  public render(): void { this.tracer.renderSample(); }

  public get samples(): number { return this.tracer.samples; }
  public get refining(): boolean { return this.tracer.isCompiling || (this.tracer.samples < MAX_SAMPLES); }
  public get settled(): boolean { return !this.tracer.isCompiling && (this.tracer.samples >= SETTLE_SAMPLES); }

  public dispose(): void {
    this.free();
    this.tracer.dispose();
  }

  // == Internal ==================================================================
  /** the tracer's display material grades each sample before its tone curve: its
   *  shader is the pinned tracer's own, and one that no longer reads as it did is
   *  refused, never shown ungraded */
  private gradeShown(material: THREE.ShaderMaterial): void {
    if(this.graded.has(material)) return;
    this.graded.add(material);
    material.onBeforeCompile = shader => {
      const [declare, tone] = ['vec4 clampedTexelFatch(', '#if defined( TONE_MAPPING )'];
      if(!shader.fragmentShader.includes(declare) || !shader.fragmentShader.includes(tone)) throw new Error('the path tracer\'s display shader no longer reads as its grade expects');
      Object.assign(shader.uniforms, this.grade);
      shader.fragmentShader = shader.fragmentShader.replace(declare, `${GRADE_GLSL}\n${declare}`).replace(tone, `res.xyz = grade(res.xyz);\n${tone}`);
    };
    material.needsUpdate = true;
  }

  /** the lens takes the view camera's place, focused at its distance and opened as the
   *  thin lens through its field of view is (SEE: lens.ts), so it blurs as the Photo
   *  stop's depth of field does */
  private aim({ distance, aperture = DEFAULT_APERTURE }: Lens): void {
    this.camera.copy(this.view);
    this.camera.focusDistance = distance;
    this.camera.bokehSize = apertureWidth({ fov: this.view.fov, aperture, focus: distance }) * 1000/*the tracer reads its opening in thousandths of a scene unit*/;
    this.camera.updateMatrixWorld(true);
  }

  /** each instance of a brick mesh as a mesh of its own, in its own plastic, glass or
   *  metal */
  private bricks(mesh: THREE.InstancedMesh, glass: THREE.Color | undefined, finish: Finish | undefined): THREE.Mesh[] {
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    return Array.from({ length: mesh.count }, (_, index) => {
      mesh.getMatrixAt(index, matrix);
      mesh.getColorAt(index, color);
      const material = new THREE.MeshPhysicalMaterial(glass ? tracedGlass(glass) : finish ? tracedMetal(finish, color) : { ...TRACED_PLASTIC, color: color.clone() });
      this.owned.push(material);
      const brick = new THREE.Mesh(mesh.geometry/*shared with the rasterized scene*/, material);
      brick.matrixAutoUpdate = false;
      brick.matrix.copy(matrix);
      return brick;
    });
  }

  /** every instance of a single-colored mesh as one merged mesh, in its own space */
  private merged(mesh: THREE.InstancedMesh): THREE.Mesh {
    const matrix = new THREE.Matrix4();
    const pieces = Array.from({ length: mesh.count }, (_, index) => { mesh.getMatrixAt(index, matrix); return mesh.geometry.clone().applyMatrix4(matrix); });
    const geometry = mergeGeometries(pieces)!;
    pieces.forEach(piece => piece.dispose());
    this.owned.push(geometry);
    return new THREE.Mesh(geometry, mesh.material);
  }

  private free(): void {
    this.owned.forEach(resource => resource.dispose());
    this.owned = [];
  }
}

/** the key light as a distant spot whose disc softens its shadow like the Photo
 *  stop's blurred one; no falloff, so it lights as the rasterized sun does */
const keyLight = (key: PathSource['key']): THREE.Object3D[] => {
  const distance = key.position.distanceTo(key.target);
  const light = new THREE.SpotLight(0xffffff, key.intensity, 0/*unbounded*/, Math.PI / 6, 0, 0/*no decay*/);
  light.position.copy(key.position);
  light.target.position.copy(key.target);
  (light as THREE.SpotLight & { radius: number; }).radius = distance * KEY_SOFTNESS * (1 + (SOFTEST_KEY * key.soft))/*read by the path tracer*/;
  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);
  return [light, light.target];
};
