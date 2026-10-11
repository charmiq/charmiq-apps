import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { CATALOG } from './catalog';
import { getColor, getColorByCode, getColorValue, getPart, getShape, ldrawPosition, LDU_PER_STUD, rotationMatrix } from './grid';
import type { Model } from './model';
import PARTS_LDRAW from './parts.ldr';
import { Effects } from './render/effects';
import type { Fidelity } from './render/fidelity';
import { PathTrace } from './render/pathTrace';
import { applyGlass, applyPlastic, seamMatrix, tintedColor } from './render/plastic';
import { createStudio, type Studio } from './render/studio';

// renders a build: one instanced mesh per catalog part over a studded baseplate.
// Scene units are studs with +y up and -z north, so an LDraw transform L becomes
// C L C^-1 with C = rotateX(pi) * scale(1/20). The canvas keeps its last frame
// (preserveDrawingBuffer) so the Platform's Application screenshot captures it;
// every view change resolves only after its final frame is drawn. How real it looks
// is the fidelity stop (SEE: render/fidelity.ts)
// ********************************************************************************
// == Constants ===================================================================
const LDRAW_TO_SCENE = new THREE.Matrix4().makeRotationX(Math.PI).multiply(new THREE.Matrix4().makeScale(1 / LDU_PER_STUD, 1 / LDU_PER_STUD, 1 / LDU_PER_STUD));
const SCENE_TO_LDRAW = LDRAW_TO_SCENE.clone().invert();

/** a color outside the palette renders as this neutral */
const UNKNOWN_COLOR = '#A0A5A9';
const WHITE = new THREE.Color(1, 1, 1);

const BASEPLATE_MIN = 16/*studs*/;
const BASEPLATE_MARGIN = 4/*studs*/;
const BASEPLATE_THICKNESS = 0.16/*scene units*/;

const DROP_HEIGHT = 2.4/*scene units*/;
const DROP_MS = 340/*ms*/;
const DROP_STAGGER_MS = 22/*ms*/;
const DROP_STAGGER_MAX_MS = 700/*ms*/;
const VIEW_MS = 520/*ms*/;

// --------------------------------------------------------------------------------
/** walking speed as a share of the distance to the point the camera orbits, so a
 *  step suits a brick close up and a village far off */
const WALK_SPEED = 0.5/*per second*/;
const WALK_SPEED_MIN = 2/*scene units per second*/;
const WALK_FAST = 3/*times, with Shift*/;
const TURN_SPEED = Math.PI / 2/*radians per second*/;
/** the longest frame a walk step covers (a stalled tab never leaps) */
const WALK_STEP_MAX_MS = 100/*ms*/;
const UP = new THREE.Vector3(0, 1, 0);
const GROUND = new THREE.Plane(UP, 0);

/** the direction toward the sun, and the studio's key softbox, from the build */
const KEY_DIRECTION = new THREE.Vector3(-0.45, 1, 0.6).normalize();

// --------------------------------------------------------------------------------
export const DEFAULT_VIEW: View = { azimuth: 30, elevation: 28 };

// == Types =======================================================================
/** a camera direction in degrees: azimuth 0 looks north from the south, 90 looks
 *  west from the east; elevation 0 is level, 90 straight down */
export type View = Readonly<{ azimuth: number; elevation: number; }>;

type RenderItem = Readonly<{ ldraw: string; color: string/*hex*/; glass: boolean; key: string; matrix: THREE.Matrix4; }>;
type Drop = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; start: number; };

/** how the keys move the camera, each -1, 0 or 1: forward (or back), right (or
 *  left), up (or down) and turn left (or right); `fast` with Shift */
export type Walk = Readonly<{ forward: number; right: number; up: number; turn: number; fast: boolean; }>;
export const STANDING: Walk = { forward: 0, right: 0, up: 0, turn: 0, fast: false };

/** the look the stage takes from CSS (SEE: styles.scss `--stage`, `--baseplate`) */
type Theme = Readonly<{ stage: string; baseplate: string; }>;

// == Viewer ======================================================================
export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly sky = new THREE.HemisphereLight(0xfffaf0, 0xd8d0c0, 0.5);
  private readonly room: THREE.Texture;
  private studio: Studio | undefined;
  private readonly effects: Effects;
  private pathTrace: PathTrace | undefined;
  private pathTraceStale = true;
  private cameraMoved = false;
  private fidelity: Fidelity = 0;
  private fidelityRequest = 0;
  private readonly stage = new THREE.Color();

  private readonly material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.3 });
  /** see-through plastic, one material per tint: its color is absorption through the
   *  brick's depth, a material-wide property */
  private readonly glasses = new Map<string/*tint hex*/, THREE.MeshPhysicalMaterial>();
  private readonly baseplateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });

  private readonly geometries = new Map<string/*ldraw*/, THREE.BufferGeometry>();
  private readonly seams = new Map<string/*ldraw*/, THREE.Matrix4>();
  private studGeometry: THREE.BufferGeometry | undefined;

  private readonly parts = new THREE.Group();
  private model: Model | undefined;
  private baseplate: THREE.Group | undefined;
  private shownKeys = new Set<string>();
  private drops: Drop[] = [];

  private tween: { from: THREE.Spherical; to: THREE.Spherical; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; resolve: () => void; } | undefined;
  private walking: Walk = STANDING;
  private lastWalk: number | undefined/*ms: the previous walk step*/;
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
    this.room = environment.fromScene(new RoomEnvironment(), 0.04).texture;
    environment.dispose();

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target, this.sky);
    this.scene.add(this.parts);
    this.effects = new Effects(this.renderer, this.scene, this.camera);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495/*never below the baseplate*/;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 600;
    this.controls.addEventListener('start', () => { this.tween = undefined; });
    // a wheel zoom lands inside the controls' own handler, so the next frame sees no
    // movement; every change marks the camera moved for the path tracer
    this.controls.addEventListener('change', () => { this.cameraMoved = true; this.requestFrame(); });

    this.setTheme(theme);
    this.applyLook(0);
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
    for(const part of CATALOG) {
      const geometry = toSceneGeometry(await parse(loader, single(`${part.ldraw}.dat`)));
      this.geometries.set(part.ldraw, geometry);
      this.seams.set(part.ldraw, seamMatrix(geometry));
    }
    this.studGeometry = toSceneGeometry(await parse(loader, single('stud.dat')));
  }

  // == Theme =====================================================================
  public setTheme(theme: Theme): void {
    this.stage.set(theme.stage);
    this.renderer.setClearColor(this.stage, 1);
    this.baseplateMaterial.color.set(theme.baseplate);
    this.pathTraceStale = true;
    this.requestFrame();
  }

  // == Fidelity ==================================================================
  /** sets how real the build looks; resolves to the stop reached, which is lower
   *  when the path tracer cannot run here */
  public async setFidelity(fidelity: Fidelity): Promise<Fidelity> {
    const request = ++this.fidelityRequest;
    if(fidelity === 4) {
      try {
        const loaded = this.pathTrace ?? await PathTrace.create(this.renderer, this.camera, () => this.effects.render());
        if(request !== this.fidelityRequest) { if(loaded !== this.pathTrace) loaded.dispose(); return this.fidelity/*a later choice won*/; }
        this.pathTrace = loaded;
      } catch(error) {
        console.warn('path tracing is unavailable here:', error);
        return (request === this.fidelityRequest) ? this.setFidelity(3) : this.fidelity;
      }
      this.pathTraceStale = true;
    } else {
      this.pathTrace?.dispose();
      this.pathTrace = undefined;
    }

    this.fidelity = fidelity;
    this.applyLook(fidelity);
    if(this.model) this.setModel(this.model, false)/*seams and tint follow the stop*/;
    this.requestFrame();
    return fidelity;
  }

  /** the see-through plastic of a tint, made at the current stop on first use */
  private glassFor(tint: string): THREE.MeshPhysicalMaterial {
    let glass = this.glasses.get(tint);
    if(!glass) {
      glass = new THREE.MeshPhysicalMaterial({ metalness: 0 });
      applyGlass(glass, new THREE.Color(tint), this.fidelity);
      this.glasses.set(tint, glass);
    } /* else -- made */
    return glass;
  }

  /** the tint a material is glass of, if it is glass */
  private tintOf(material: THREE.Material | THREE.Material[]): THREE.Color | undefined {
    for(const [tint, glass] of this.glasses) if(glass === material) return new THREE.Color(tint);
    return undefined;
  }

  /** the material, light and shadow of a stop; stop 4 rasterizes as stop 3 until
   *  its samples land */
  private applyLook(fidelity: Fidelity): void {
    const draft = (fidelity < 1);
    if(!draft) this.studio ??= createStudio(this.renderer, KEY_DIRECTION);
    this.scene.environment = draft ? this.room : this.studio!.environment;
    this.scene.environmentIntensity = draft ? 0.42 : 0.9;
    this.sky.intensity = draft ? 0.5 : 0.1;
    this.sun.intensity = draft ? 1.6 : 2.4;
    this.renderer.toneMapping = draft ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = draft ? 1.05 : 1.2;

    // soft, blurred shadows from stop 2; a shadow type change recompiles materials
    const shadows = (fidelity >= 2) ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    if(this.renderer.shadowMap.type !== shadows) {
      this.renderer.shadowMap.type = shadows;
      this.sun.shadow.radius = (fidelity >= 2) ? 10 : 4;
      this.sun.shadow.blurSamples = 16;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.baseplateMaterial.needsUpdate = true;
    } /* else -- unchanged */

    applyPlastic(this.material, fidelity);
    for(const [tint, glass] of this.glasses) applyGlass(glass, new THREE.Color(tint), fidelity);
    this.effects.setFidelity((fidelity > 3) ? 3 : fidelity);
  }

  // == Model =====================================================================
  /** shows a build; parts not shown before drop into place unless `animate` is false */
  public setModel(model: Model, animate: boolean): void {
    this.model = model;
    const real = (this.fidelity >= 1);
    const items = renderItems(model).filter(item => this.geometries.has(item.ldraw))
      .map(item => real ? { ...item, matrix: item.matrix.clone().multiply(this.seams.get(item.ldraw)!) } : item);

    // one instanced mesh per part
    for(const child of [...this.parts.children]) { this.parts.remove(child); (child as THREE.InstancedMesh).dispose(); }
    this.drops = [];
    const now = performance.now();
    let dropIndex = 0;

    // one instanced mesh per part in opaque plastic, and per part and tint in glass
    const group = (item: RenderItem): string => item.glass ? `${item.ldraw}|${item.color}` : item.ldraw;
    const byPart = new Map<string, RenderItem[]>();
    for(const item of items) byPart.set(group(item), [...(byPart.get(group(item)) ?? []), item]);
    for(const partItems of byPart.values()) {
      const { ldraw, glass, color: tint } = partItems[0];
      const mesh = new THREE.InstancedMesh(this.geometries.get(ldraw)!, glass ? this.glassFor(tint) : this.material, partItems.length);
      mesh.castShadow = !glass/*light passes through; the path tracer shades it physically*/;
      mesh.receiveShadow = true;
      partItems.forEach((item, index) => {
        mesh.setColorAt(index, glass ? WHITE/*the glass material carries the tint*/ : real ? tintedColor(item.color, item.key) : new THREE.Color(item.color));
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
    this.pathTraceStale = true;
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

  /** moves the camera as the keys say until they say stand (SEE: Walk) */
  public walk(walk: Walk): void {
    const stopping = !isStanding(this.walking) && isStanding(walk);
    this.walking = walk;
    if(stopping) this.pivotOnView();
    if(isStanding(walk)) { this.lastWalk = undefined; return; }
    this.tween?.resolve()/*a walk takes over from a view change*/;
    this.tween = undefined;
    this.requestFrame();
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
    this.effects.setSize(width, height);
    this.cameraMoved = true;
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
    if(!isStanding(this.walking)) {
      this.step(Math.min(now - (this.lastWalk ?? now), WALK_STEP_MAX_MS) / 1000);
      this.lastWalk = now;
      moving = true;
    } /* else -- standing */
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

    this.effects.focus(this.focusDistance());
    const refining = this.render(moving);

    const waiters = this.frameWaiters;
    this.frameWaiters = [];
    const settled = (this.drops.length < 1) && !this.tween && (!this.pathTrace || this.pathTrace.settled);
    if(settled) { waiters.push(...this.settleWaiters); this.settleWaiters = []; }
    for(const resolve of waiters) resolve();
    if(moving || (this.drops.length > 0) || refining) this.requestFrame();
  }

  /** one walk step of `seconds`: moves the camera and the point it orbits together,
   *  level with the baseplate, and turns the camera in place (the point swings
   *  round it), so the mouse still orbits what the camera faces */
  private step(seconds: number): void {
    const { forward, right, up, turn, fast } = this.walking;
    const camera = this.camera.position, target = this.controls.target;
    if(turn !== 0) {
      const offset = new THREE.Vector3().subVectors(target, camera).applyAxisAngle(UP, turn * TURN_SPEED * seconds);
      target.copy(camera).add(offset);
    } /* else -- not turning */

    const speed = Math.max(camera.distanceTo(target) * WALK_SPEED, WALK_SPEED_MIN) * (fast ? WALK_FAST : 1) * seconds;
    const ahead = new THREE.Vector3().subVectors(target, camera).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(ahead, UP);
    const move = ahead.multiplyScalar(forward * speed).addScaledVector(side, right * speed).addScaledVector(UP, up * speed);
    move.y = Math.max(move.y, -target.y)/*the point never sinks below the baseplate*/;
    camera.add(move);
    target.add(move);
    this.cameraMoved = true;
  }

  /** moves the point the camera orbits in to what lies at the center of the view
   *  (a brick, else the baseplate's plane) when that is nearer, leaving the camera
   *  where it stands. Never farther: ground far beyond the build would make the
   *  next drag swing the camera around a distant point */
  private pivotOnView(): void {
    const camera = this.camera.position;
    const distance = camera.distanceTo(this.controls.target);
    const ahead = new THREE.Vector3().subVectors(this.controls.target, camera).normalize();
    const ray = new THREE.Raycaster(camera, ahead);
    const hit = ray.intersectObjects([this.parts, ...(this.baseplate ? [this.baseplate] : [])], true)[0]?.point
      ?? ray.ray.intersectPlane(GROUND, new THREE.Vector3()) ?? undefined;
    if(!hit) return/*looking at the sky: the point stays*/;
    this.controls.target.copy(camera).addScaledVector(ahead, clamp(camera.distanceTo(hit), this.controls.minDistance, distance));
    this.controls.update();
    this.requestFrame();
  }

  /** the depth of field focuses on the point the camera orbits */
  private focusDistance(): number { return this.camera.position.distanceTo(this.controls.target); }

  /** whether the path tracer is still refining toward a settled frame */
  public get refining(): boolean { return !!this.pathTrace && !this.pathTrace.settled; }

  /** draws the frame at the current stop; true while the path tracer still refines */
  private render(moving: boolean): boolean {
    if(!this.pathTrace || (this.drops.length > 0)) { this.effects.render(); return false; }

    if(this.pathTraceStale) {
      this.pathTrace.setScene({
        parts: (this.parts.children as THREE.InstancedMesh[]).map(mesh => ({ mesh, glass: this.tintOf(mesh.material) })), baseplate: this.baseplate,
        environment: this.studio!.cube, environmentIntensity: this.scene.environmentIntensity, background: this.stage,
        key: { position: this.sun.position, target: this.sun.target.position, intensity: this.sun.intensity },
      }, this.focusDistance());
      this.pathTraceStale = false;
    } else if(moving || this.cameraMoved) {
      this.pathTrace.moved(this.focusDistance());
    } /* else -- still: keep refining */
    this.cameraMoved = false;
    this.pathTrace.render();
    return this.pathTrace.refining;
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
    return { ldraw: part.ldraw, color: getColorValue(color.code) ?? UNKNOWN_COLOR, glass: !!color.transparent, key: `${part.ldraw}|${color.code}|${position}|${matrix}`, matrix: toScene(position, matrix) };
  }),
  ...model.others.map(other => ({
    ldraw: other.ldraw, color: getColorValue(other.colorCode) ?? UNKNOWN_COLOR, glass: !!getColorByCode(other.colorCode)?.transparent,
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
const isStanding = (walk: Walk): boolean => (walk.forward === 0) && (walk.right === 0) && (walk.up === 0) && (walk.turn === 0);
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number => (t < 0.5) ? (4 * t * t * t) : (1 - (Math.pow(-2 * t + 2, 3) / 2));
const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;
const evenAtLeast = (value: number, min: number): number => Math.max(min, Math.ceil(value / 2) * 2);
