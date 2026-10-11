import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { CATALOG } from './catalog';
import { getColor, getColorValue, getPart, getShape, ldrawPosition, LDU_PER_STUD, rotationMatrix } from './grid';
import type { Model } from './model';
import PARTS_LDRAW from './parts.ldr';

// renders a build: one instanced mesh per catalog part over a studded baseplate.
// Scene units are studs with +y up and -z north, so an LDraw transform L becomes
// C L C^-1 with C = rotateX(pi) * scale(1/20). The canvas keeps its last frame
// (preserveDrawingBuffer) so the Platform's Application screenshot captures it;
// every view change resolves only after its final frame is drawn
// ********************************************************************************
// == Constants ===================================================================
const LDRAW_TO_SCENE = new THREE.Matrix4().makeRotationX(Math.PI).multiply(new THREE.Matrix4().makeScale(1 / LDU_PER_STUD, 1 / LDU_PER_STUD, 1 / LDU_PER_STUD));
const SCENE_TO_LDRAW = LDRAW_TO_SCENE.clone().invert();

/** a color outside the palette renders as this neutral */
const UNKNOWN_COLOR = '#A0A5A9';

const BASEPLATE_MIN = 16/*studs*/;
const BASEPLATE_MARGIN = 4/*studs*/;
const BASEPLATE_THICKNESS = 0.16/*scene units*/;

const DROP_HEIGHT = 2.4/*scene units*/;
const DROP_MS = 340/*ms*/;
const DROP_STAGGER_MS = 22/*ms*/;
const DROP_STAGGER_MAX_MS = 700/*ms*/;
const VIEW_MS = 520/*ms*/;

export const DEFAULT_VIEW: View = { azimuth: 30, elevation: 28 };

// == Types =======================================================================
/** a camera direction in degrees: azimuth 0 looks north from the south, 90 looks
 *  west from the east; elevation 0 is level, 90 straight down */
export type View = Readonly<{ azimuth: number; elevation: number; }>;

type RenderItem = Readonly<{ ldraw: string; color: string/*hex*/; key: string; matrix: THREE.Matrix4; }>;
type Drop = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; start: number; };

/** the look the stage takes from CSS (SEE: styles.scss `--stage`, `--baseplate`) */
type Theme = Readonly<{ stage: string; baseplate: string; }>;

// == Viewer ======================================================================
export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);

  private readonly material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.3 });
  private readonly baseplateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });

  private readonly geometries = new Map<string/*ldraw*/, THREE.BufferGeometry>();
  private studGeometry: THREE.BufferGeometry | undefined;

  private readonly parts = new THREE.Group();
  private baseplate: THREE.Group | undefined;
  private shownKeys = new Set<string>();
  private drops: Drop[] = [];

  private tween: { from: THREE.Spherical; to: THREE.Spherical; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; resolve: () => void; } | undefined;
  private frameWaiters: Array<() => void> = [];
  private settleWaiters: Array<() => void> = [];
  private frameRequested = false;

  // == Lifecycle =================================================================
  public constructor(private readonly canvas: HTMLCanvasElement, theme: Theme) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true/*the Application screenshot reads the canvas*/ });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const environment = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    environment.dispose();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xfffaf0, 0xd8d0c0, 0.5));
    this.scene.add(this.parts);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495/*never below the baseplate*/;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 600;
    this.controls.addEventListener('start', () => { this.tween = undefined; });
    this.controls.addEventListener('change', () => this.requestFrame());

    this.setTheme(theme);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  // ------------------------------------------------------------------------------
  /** parses the packed parts once; resolves when every catalog part has geometry */
  public async load(): Promise<void> {
    const loader = new LDrawLoader();
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    loader.addDefaultMaterials();

    await parse(loader, PARTS_LDRAW)/*caches every packed file*/;
    for(const part of CATALOG) this.geometries.set(part.ldraw, toSceneGeometry(await parse(loader, single(`${part.ldraw}.dat`))));
    this.studGeometry = toSceneGeometry(await parse(loader, single('stud.dat')));
  }

  // == Theme =====================================================================
  public setTheme(theme: Theme): void {
    this.renderer.setClearColor(new THREE.Color(theme.stage), 1);
    this.baseplateMaterial.color.set(theme.baseplate);
    this.requestFrame();
  }

  // == Model =====================================================================
  /** shows a build; parts not shown before drop into place unless `animate` is false */
  public setModel(model: Model, animate: boolean): void {
    const items = renderItems(model).filter(item => this.geometries.has(item.ldraw));

    // one instanced mesh per part
    for(const child of [...this.parts.children]) { this.parts.remove(child); (child as THREE.InstancedMesh).dispose(); }
    this.drops = [];
    const now = performance.now();
    let dropIndex = 0;

    const byPart = new Map<string, RenderItem[]>();
    for(const item of items) byPart.set(item.ldraw, [...(byPart.get(item.ldraw) ?? []), item]);
    for(const [ldraw, partItems] of byPart) {
      const mesh = new THREE.InstancedMesh(this.geometries.get(ldraw)!, this.material, partItems.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      partItems.forEach((item, index) => {
        mesh.setColorAt(index, new THREE.Color(item.color));
        if(animate && !this.shownKeys.has(item.key)) {
          this.drops.push({ mesh, index, matrix: item.matrix, start: now + Math.min(dropIndex++ * DROP_STAGGER_MS, DROP_STAGGER_MAX_MS) });
          mesh.setMatrixAt(index, dropped(item.matrix, 0));
        } else {
          mesh.setMatrixAt(index, item.matrix);
        }
      });
      mesh.computeBoundingSphere();
      mesh.frustumCulled = false/*instances move during a drop*/;
      this.parts.add(mesh);
    }
    this.shownKeys = new Set(items.map(item => item.key));

    this.updateBaseplate();
    this.requestFrame();
  }

  // == View ======================================================================
  /** turns the camera to a view, framing the build when `fit` is set; resolves once
   *  the final frame is drawn */
  public setView(view: View, fit: boolean): Promise<void> {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const from = new THREE.Spherical().setFromVector3(offset);
    const to = new THREE.Spherical(from.radius, THREE.MathUtils.degToRad(90 - clamp(view.elevation, 2, 89)), THREE.MathUtils.degToRad(view.azimuth));
    to.phi = Math.min(to.phi, this.controls.maxPolarAngle);
    let target = this.controls.target.clone();
    if(fit) {
      const framing = this.framing();
      target = framing.target;
      to.radius = framing.radius;
    } /* else -- keep the distance and target */

    // take the short way round
    while((to.theta - from.theta) > Math.PI) to.theta -= Math.PI * 2;
    while((to.theta - from.theta) < -Math.PI) to.theta += Math.PI * 2;

    this.tween?.resolve();
    return new Promise(resolve => {
      this.tween = { from, to, fromTarget: this.controls.target.clone(), toTarget: target, start: performance.now(), resolve };
      this.requestFrame();
    });
  }

  /** places the camera at once (no tween), used for the first frame */
  public jumpToView(view: View): void {
    const to = new THREE.Spherical(1, THREE.MathUtils.degToRad(90 - clamp(view.elevation, 2, 89)), THREE.MathUtils.degToRad(view.azimuth));
    const framing = this.framing();
    to.radius = framing.radius;
    this.controls.target.copy(framing.target);
    this.camera.position.copy(framing.target).add(new THREE.Vector3().setFromSpherical(to));
    this.controls.update();
    this.requestFrame();
  }

  /** the current view, in degrees */
  public getView(): View {
    const spherical = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(this.camera.position, this.controls.target));
    return { azimuth: Math.round(normalizeDegrees(THREE.MathUtils.radToDeg(spherical.theta))), elevation: Math.round(90 - THREE.MathUtils.radToDeg(spherical.phi)) };
  }

  /** resolves once every part has landed, any view change has finished and that
   *  frame is drawn */
  public whenSettled(): Promise<void> {
    return new Promise(resolve => { this.settleWaiters.push(resolve); this.requestFrame(); });
  }

  /** reframes the build at the current view when any part lies outside the frame */
  public keepInView(): void {
    const box = this.buildBounds();
    if(box.isEmpty()) return/*nothing to frame*/;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(
      (i & 1) ? box.max.x : box.min.x, (i & 2) ? box.max.y : box.min.y, (i & 4) ? box.max.z : box.min.z).project(this.camera));
    const inView = corners.every(corner => (Math.abs(corner.x) <= 0.98) && (Math.abs(corner.y) <= 0.98) && (corner.z < 1));
    if(!inView) void this.setView(this.getView(), true);
  }

  // == Internal ==================================================================
  /** the build's bounds with every part in place (a dropping part counts where it lands) */
  private buildBounds(): THREE.Box3 {
    const box = new THREE.Box3();
    const landing = new Map(this.drops.map(drop => [drop.mesh.uuid + ':' + drop.index, drop.matrix]));
    const matrix = new THREE.Matrix4();
    for(const mesh of this.parts.children as THREE.InstancedMesh[]) {
      for(let index=0; index<mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(landing.get(mesh.uuid + ':' + index) ?? matrix));
      }
    }
    return box;
  }

  /** the target and distance that frame the build (or the baseplate when empty) */
  private framing(): { target: THREE.Vector3; radius: number; } {
    const box = this.buildBounds();
    if(box.isEmpty() && this.baseplate) box.setFromObject(this.baseplate);
    if(box.isEmpty()) box.set(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 1, 4));

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const radius = (sphere.radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.04;
    return { target: sphere.center, radius: Math.max(radius, this.controls.minDistance) };
  }

  // ------------------------------------------------------------------------------
  /** sizes the baseplate to the build plus a margin and places the sun over it */
  private updateBaseplate(): void {
    if(!this.studGeometry) return/*not loaded*/;

    const box = this.buildBounds();
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    const width = evenAtLeast(size.x + (BASEPLATE_MARGIN * 2), BASEPLATE_MIN);
    const depth = evenAtLeast(size.z + (BASEPLATE_MARGIN * 2), BASEPLATE_MIN);
    const minX = Math.round(center.x - (width / 2));
    const minZ = Math.round(center.z - (depth / 2));

    if(this.baseplate) {
      const current = this.baseplate.userData as { minX: number; minZ: number; width: number; depth: number; };
      if((current.minX === minX) && (current.minZ === minZ) && (current.width === width) && (current.depth === depth)) return/*unchanged*/;
      this.scene.remove(this.baseplate);
      this.baseplate.traverse((object: THREE.Object3D) => { if((object as THREE.Mesh).isMesh && !(object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.Mesh).geometry.dispose(); });
    } /* else -- first baseplate */

    const plate = new THREE.Group();
    plate.userData = { minX, minZ, width, depth };
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, BASEPLATE_THICKNESS, depth), this.baseplateMaterial);
    slab.position.set(minX + (width / 2), -BASEPLATE_THICKNESS / 2, minZ + (depth / 2));
    slab.receiveShadow = true;
    const studs = new THREE.InstancedMesh(this.studGeometry, this.baseplateMaterial, width * depth);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for(let z=0; z<depth; z++) for(let x=0; x<width; x++) studs.setMatrixAt(index++, matrix.makeTranslation(minX + x + 0.5, 0, minZ + z + 0.5));
    studs.receiveShadow = true;
    plate.add(slab, studs);
    this.baseplate = plate;
    this.scene.add(plate);

    // the sun stands high to the south-west of the plate and its shadow covers it
    const reach = Math.max(width, depth, size.y * 2);
    const plateCenter = new THREE.Vector3(minX + (width / 2), 0, minZ + (depth / 2));
    this.sun.target.position.copy(plateCenter);
    this.sun.position.copy(plateCenter).add(new THREE.Vector3(-0.45, 1, 0.6).normalize().multiplyScalar(reach * 1.5));
    const camera = this.sun.shadow.camera;
    camera.left = camera.bottom = -reach * 0.75;
    camera.right = camera.top = reach * 0.75;
    camera.near = 0.1;
    camera.far = reach * 4;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------------------
  private resize(): void {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if((width < 1) || (height < 1)) return/*hidden*/;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestFrame();
  }

  // ------------------------------------------------------------------------------
  private requestFrame(): void {
    if(this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.frameRequested = false;
    const now = performance.now();
    let moving = false;

    // camera tween
    if(this.tween) {
      const t = Math.min((now - this.tween.start) / VIEW_MS, 1);
      const e = easeInOutCubic(t);
      const spherical = new THREE.Spherical(
        lerp(this.tween.from.radius, this.tween.to.radius, e),
        lerp(this.tween.from.phi, this.tween.to.phi, e),
        lerp(this.tween.from.theta, this.tween.to.theta, e));
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      if(t >= 1) { const { resolve } = this.tween; this.tween = undefined; this.frameWaiters.push(resolve); }
      else moving = true;
    } /* else -- no tween */
    if(this.controls.update()) moving = true/*damping*/;

    // dropping parts
    if(this.drops.length > 0) {
      const settled: Drop[] = [];
      for(const drop of this.drops) {
        const t = clamp((now - drop.start) / DROP_MS, 0, 1);
        drop.mesh.setMatrixAt(drop.index, dropped(drop.matrix, easeOutCubic(t)));
        drop.mesh.instanceMatrix.needsUpdate = true;
        if(t >= 1) settled.push(drop);
      }
      this.drops = this.drops.filter(drop => !settled.includes(drop));
      moving = true;
    } /* else -- nothing dropping */

    this.renderer.render(this.scene, this.camera);

    const waiters = this.frameWaiters;
    this.frameWaiters = [];
    if((this.drops.length < 1) && !this.tween) { waiters.push(...this.settleWaiters); this.settleWaiters = []; }
    for(const resolve of waiters) resolve();
    if(moving || (this.drops.length > 0)) this.requestFrame();
  }
}

// == Render items ================================================================
/** every part line of a build that has catalog geometry, with its scene transform */
const renderItems = (model: Model): RenderItem[] => [
  ...model.placements.map(placement => {
    const part = getPart(placement.part)!/*by contract*/;
    const color = getColor(placement.color)!/*by contract*/;
    const position = ldrawPosition(getShape(part), placement);
    const matrix = rotationMatrix(placement.rotation);
    return { ldraw: part.ldraw, color: getColorValue(color.code) ?? UNKNOWN_COLOR, key: `${part.ldraw}|${color.code}|${position}|${matrix}`, matrix: toScene(position, matrix) };
  }),
  ...model.others.map(other => ({
    ldraw: other.ldraw, color: getColorValue(other.colorCode) ?? UNKNOWN_COLOR,
    key: `${other.ldraw}|${other.colorCode}|${other.position}|${other.matrix}`, matrix: toScene(other.position, other.matrix),
  })),
];

/** the scene transform of an LDraw position and rotation */
const toScene = (position: readonly number[], m: readonly number[]): THREE.Matrix4 =>
  LDRAW_TO_SCENE.clone()
    .multiply(new THREE.Matrix4().set(m[0], m[1], m[2], position[0], m[3], m[4], m[5], position[1], m[6], m[7], m[8], position[2], 0, 0, 0, 1))
    .multiply(SCENE_TO_LDRAW);

/** a transform raised for a drop at progress `t` (0 raised, 1 in place) */
const dropped = (matrix: THREE.Matrix4, t: number): THREE.Matrix4 =>
  new THREE.Matrix4().makeTranslation(0, (1 - t) * DROP_HEIGHT, 0).multiply(matrix);

// == Geometry ====================================================================
/** a one-part LDraw model */
const single = (file: string): string => `1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${file}\n`;

const parse = (loader: LDrawLoader, text: string): Promise<THREE.Group> =>
  new Promise((resolve, reject) => loader.parse(text, resolve, reject));

/** the faces of a parsed LDraw group as one scene-space geometry (edge lines dropped) */
const toSceneGeometry = (group: THREE.Group): THREE.BufferGeometry => {
  group.updateMatrixWorld(true);
  const pieces: THREE.BufferGeometry[] = [];
  group.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if(!mesh.isMesh) return/*edge and conditional lines*/;
    let geometry = mesh.geometry.clone();
    if(geometry.index) geometry = geometry.toNonIndexed();
    for(const name of Object.keys(geometry.attributes)) if((name !== 'position') && (name !== 'normal')) geometry.deleteAttribute(name);
    geometry.clearGroups();
    pieces.push(geometry.applyMatrix4(mesh.matrixWorld));
  });
  const merged = mergeGeometries(pieces)!;
  merged.applyMatrix4(LDRAW_TO_SCENE);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

// == Util ========================================================================
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number => (t < 0.5) ? (4 * t * t * t) : (1 - (Math.pow(-2 * t + 2, 3) / 2));
const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;
const evenAtLeast = (value: number, min: number): number => Math.max(min, Math.ceil(value / 2) * 2);
