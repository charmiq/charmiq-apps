import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { Sky } from '../../brick-shared/sky';

import { CATALOG, resourceFamily, type Finish } from './catalog';
import { requestDraw } from './frame-request';
import { baseplateArea, getColor, getColorByCode, getColorValue, isDrawable, partFiles, tracedStudCells, LDU_PER_STUD, type PartLine } from './grid';
import { drawnLines, partCount, type Model } from './model';
import { isPlan, ldrawPoint, NO_ACTORS, type FilmOverlay, type Floor, type Point, type ShownActors, type StageCamera, type StageLight, type ViewCamera } from './stage';
import { COLOR_VALUES, PART_RESOURCES } from './parts.generated';
import PARTS_LDRAW from './parts/built-in.ldr';
import { AutoFocus } from './render/autofocus';
import { Effects, type Lens } from './render/effects';
import { PATH_TRACED_PARTS, type Fidelity } from './render/fidelity';
import { drawOverlay, isBlank } from './render/overlay';
import { planAim } from './render/plan';
import { PathTrace } from './render/pathTrace';
import { applyGlass, applyMetal, applyPlastic, seamMatrix, tintedColor } from './render/plastic';
import { PictureFiles, PictureStand } from './render/pictures';
import { SkyBackdrop } from './render/sky';
import { createStudio, type Studio } from './render/studio';

// renders a build: one instanced mesh per catalog part over a studded baseplate.
// Scene units are studs with +y up and -z north, so an LDraw transform L becomes
// C L C^-1 with C = rotateX(pi) * scale(1/20). The canvas keeps its last frame
// (preserveDrawingBuffer) so the Platform's Application screenshot captures it;
// every view change resolves only after its final frame is drawn. How real it looks
// is the fidelity stop (SEE: render/fidelity.ts). Staged, it shows a stage's set and
// actors through the stage's camera in place of the build (SEE: stage.ts), a film's
// fade and title on a canvas over it; a frame of a film moves the actors' standing
// instances rather than rebuilding them
// ********************************************************************************
// == Constants ===================================================================
const LDRAW_TO_SCENE = new THREE.Matrix4().makeRotationX(Math.PI).multiply(new THREE.Matrix4().makeScale(1 / LDU_PER_STUD, 1 / LDU_PER_STUD, 1 / LDU_PER_STUD));
const SCENE_TO_LDRAW = LDRAW_TO_SCENE.clone().invert();

/** a color outside the palette renders as this neutral */
const UNKNOWN_COLOR = '#A0A5A9';
/** the color code a one-part model draws its part in (LDraw's inherited color): its
 *  faces in any other code are drawn in that color */
const OWN_COLOR = 16;
const WHITE = new THREE.Color(1, 1, 1);
/** a frame with nothing over its picture */
const NO_OVERLAY: FilmOverlay = { fade: 0 };
/** the parts the pack holds (the catalog's and their pieces'), the only ones a
 *  geometry is built for */
const PACKED = new Set(CATALOG.flatMap(partFiles));

const BASEPLATE_THICKNESS = 0.16/*scene units*/;

/** how much wider than the build a framed view is */
const FRAME_MARGIN = 1.08;

/** how much more a stage's softest key blurs its shadows than the look's own */
const SOFTEST_SHADOW = 3;
const DROP_HEIGHT = 2.4/*scene units*/;
const DROP_MS = 340/*ms*/;
const DROP_STAGGER_MS = 22/*ms*/;
const DROP_STAGGER_MAX_MS = 700/*ms*/;
const VIEW_MS = 520/*ms*/;
/** how long a requested frame waits for the browser's animation frame before it is
 *  drawn anyway: a frame scrolled out of view gets none, and a command waiting for
 *  the studio to settle (a Charm's edit, a film's frame) would never answer */
const FRAME_FALLBACK_MS = 100/*ms*/;

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
/** a plan's top: north (the scene's -z) */
const NORTH = new THREE.Vector3(0, 0, -1);
/** the camera's nearest and farthest drawing (scene units); a plan, standing far
 *  higher, draws from PLAN_DEPTH above the ground to just below it */
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 2_000;
const PLAN_DEPTH = 900/*scene units: the stage's highest reach and more*/;

/** the direction toward the sun, and the studio's key softbox, from the build */
const KEY_DIRECTION = new THREE.Vector3(-0.45, 1, 0.6).normalize();
/** a sky that lights the set lights it this much of the look's own environment's
 *  strength: a pale sky all round is several times brighter than the studio's dark room
 *  and its panels, and would wash every color out */
const SKY_LIGHT = 0.35;

// --------------------------------------------------------------------------------
export const DEFAULT_VIEW: View = { azimuth: 30, elevation: 28 };

// == Types =======================================================================
/** a camera direction in degrees: azimuth 0 looks north from the south, 90 looks
 *  west from the east; elevation 0 is level, 90 straight down */
export type View = Readonly<{ azimuth: number; elevation: number; }>;

/** one drawn file: `geometry` names a part's own faces (its LDraw stem) or a print's
 *  (SEE: printKey); `drop` names the part whose drop it rides; an actor's moves with
 *  each frame of a stage and never counts toward the build's bounds */
type RenderItem = Readonly<{ ldraw: string; geometry: string; color: string/*hex*/; glass: boolean; finish: Finish | undefined/*plastic*/; key: string; drop: string; matrix: THREE.Matrix4; actor?: true; }>;
type Drop = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; start: number; };

/** how the keys move the camera, each -1, 0 or 1: forward (or back), right (or
 *  left), up (or down) and turn left (or right); `fast` with Shift */
export type Walk = Readonly<{ forward: number; right: number; up: number; turn: number; fast: boolean; }>;
export const STANDING: Walk = { forward: 0, right: 0, up: 0, turn: 0, fast: false };

/** the look the stage takes from CSS (SEE: styles.scss `--stage`, `--baseplate`) */
type Theme = Readonly<{ stage: string; baseplate: string; }>;

/** a stage shown in place of the build: its sets and the one standing (an index into
 *  them), the area its baseplate covers at least, its actors (their lines in the
 *  scene's frame) in the frame shown, the size frames are captured at once one is, and
 *  the camera to put back when it ends */
/** the shot a transition leaves: its camera, the set it stands on (an index into the
 *  stage's), and, standing another set, its actors as they stood leaving it */
type LeavingShot = Readonly<{ camera: StageCamera; set: number; actors?: ShownActors; }>;
/** a stage frame's lens: the point it focuses on, or how far ahead along the view
 *  (studs, the scene's units), and its aperture */
type StageLens = Readonly<{ focus?: THREE.Vector3 | number; aperture?: number; }>;
/** where the camera stands and how it sees, its lens shifted up by `shift` (a share of
 *  the picture's height) */
type Eye = Readonly<{ position: THREE.Vector3; target: THREE.Vector3; fov: number; shift: number; up: THREE.Vector3; lens: StageLens; }>;
type Staging = { /*NOTE: Mutable: each frame replaces its set, actors and overlay, a capture its size*/
  readonly sets: ReadonlyArray<Model>;
  standing: number;
  floor?: Floor;
  actors: ShownActors;
  overlay: FilmOverlay;
  /** the shot a transition leaves, and its picture as drawn last (SEE: drawLeaving) */
  leaving?: LeavingShot;
  left?: Readonly<{ key: string; picture: HTMLCanvasElement; }>;
  size?: Readonly<{ width: number; height: number; }>;
  readonly before: Readonly<{ position: THREE.Vector3; target: THREE.Vector3; fov: number; }>;
};

// == Viewer ======================================================================
export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, CAMERA_NEAR, CAMERA_FAR);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly sky = new THREE.HemisphereLight(0xfffaf0, 0xd8d0c0, 0.5);
  private readonly room: THREE.Texture;
  private studio: Studio | undefined;
  private readonly effects: Effects;
  private pathTrace: PathTrace | undefined;
  private pathTraceStale = true;
  /** the parts drawn, as a set counts them: the build's, or the standing set's and
   *  its actors' */
  private drawnParts = 0;
  /** the parts of the set drawn */
  private setParts = 0;
  /** the camera moved since the path tracer was last told */
  private cameraMoved = false;
  /** the camera moved since the frame before (SEE: AutoFocus) */
  private viewMoved = false;
  /** a stage frame's lens: the point it focuses on (its target when none) and its
   *  aperture (the look's own when none) */
  private stageLens: StageLens = {};
  /** a stage's light over the look's own (SEE: stage.ts StageLight) */
  private stageLight: StageLight = {};
  /** the sky behind the set (SEE: render/sky.ts), and a stage's own over every set's */
  private readonly backdrop: SkyBackdrop;
  /** the pictures standing in the set (SEE: render/pictures.ts) */
  private readonly pictures: PictureStand;
  private stageSky: Sky | undefined/*each set's own*/;
  /** the build's focus: what lies at the middle of the picture, found once the view
   *  rests (SEE: render/autofocus.ts) */
  private readonly autoFocus = new AutoFocus(() => this.middleDistance());
  private fidelity: Fidelity = 0;
  private fidelityRequest = 0;
  private readonly stage = new THREE.Color();

  private readonly material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.3 });
  /** see-through plastic, one material per tint: its color is absorption through the
   *  brick's depth, a material-wide property */
  private readonly glasses = new Map<string/*tint hex*/, THREE.MeshPhysicalMaterial>();
  /** metal, one material per finish, each part its own color as plastic is */
  private readonly metals = new Map<Finish, THREE.MeshPhysicalMaterial>();
  private readonly baseplateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  /** the baseplate's color: the build's ground when it names one, else the theme's */
  private themeBaseplate = '';
  private ground: string | undefined/*hex*/;
  /** whether the baseplate is drawn without studs (the build's ground is smooth) */
  private smoothGround = false;

  /** each part's geometry and its prints', built the first time a build shows the part */
  private readonly geometries = new Map<string/*ldraw or print key*/, THREE.BufferGeometry>();
  /** the color codes each part prints in (SEE: toSceneGeometries) */
  private readonly prints = new Map<string/*ldraw*/, ReadonlyArray<number>>();
  private readonly seams = new Map<string/*ldraw*/, THREE.Matrix4>();
  private readonly building = new Map<string/*ldraw*/, Promise<void>>();
  /** how many times what a picture draws has changed beneath it: parts built (a
   *  picture held over a build drew without them), the look, the theme (SEE:
   *  drawLeaving) */
  private drawingChanges = 0;
  /** each family read into the loader, or being read (SEE: PART_RESOURCES) */
  private readonly families = new Map<string/*resource name*/, Promise<void>>();
  /** parts that could not be drawn (their family could not be read, or their
   *  geometry not built): never tried again until a retry */
  private readonly unbuilt = new Set<string/*ldraw*/>();
  /** the families being read, and those whose read failed (until a retry) */
  private readonly loading = new Set<string/*family*/>();
  private readonly failed = new Set<string/*family*/>();
  private onPartsChanged: (() => void) | null = null;
  private loader: LDrawLoader | undefined;
  private studGeometry: THREE.BufferGeometry | undefined;

  private readonly parts = new THREE.Group();
  private model: Model | undefined;
  private staging: Staging | undefined;
  /** whether the person holds the view over the stage (SEE: holdView), and where it
   *  stood while a capture draws a frame through the frame's own camera */
  private viewHeld = false;
  private heldEye: Eye | undefined/*no capture under way*/;
  /** each staged set's own meshes, built once and kept while the stage stands, so a
   *  frame standing another set swaps meshes, never rebuilding them; dropped when what
   *  they draw changes (a part built, the look: SEE redraw), and kept meshes are freed
   *  only once dropped */
  private readonly setMeshes = new Map<Model, ReadonlyArray<THREE.InstancedMesh>>();
  private readonly kept = new Set<THREE.Object3D>();
  private baseplate: THREE.Group | undefined;
  /** whether the build reaches past the baseplate (SEE: baseplateArea) */
  private pastBaseplate = false;
  private shownKeys = new Set<string>();
  private drops: Drop[] = [];

  private tween: { from: THREE.Spherical; to: THREE.Spherical; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; resolve: () => void; } | undefined;
  private walking: Walk = STANDING;
  private lastWalk: number | undefined/*ms: the previous walk step*/;
  private frameWaiters: Array<() => void> = [];
  private settleWaiters: Array<() => void> = [];
  private frameRequested = false;
  /** the overlay canvas waits for the next frame to show the stage's overlay */
  private overlayStale = false;

  // == Lifecycle =================================================================
  public constructor(private readonly canvas: HTMLCanvasElement, private readonly overlayCanvas: HTMLCanvasElement/*a film's fade and title, over the canvas*/, theme: Theme, private readonly readResource: (name: string) => Promise<string>/*a declared resource's text*/, readImage: (image: string) => Promise<ArrayBuffer>/*an image's bytes: a Drive file, or a picture Brick Studio ships*/) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true/*the Application screenshot reads the canvas*/ });
    this.renderer.setPixelRatio(screenPixelRatio());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const environment = new THREE.PMREMGenerator(this.renderer);
    this.room = environment.fromScene(new RoomEnvironment(), 0.04).texture;
    environment.dispose();
    const files = new PictureFiles(readImage)/*one read of each image, for skies and pictures alike*/;
    this.backdrop = new SkyBackdrop(this.renderer, files, () => { this.skyChanged(); this.onPartsChanged?.()/*the status says whether its picture was read*/; });
    this.pictures = new PictureStand(files, () => { this.pathTraceStale = true; this.requestFrame(); this.onPartsChanged?.()/*the status counts the pictures not read*/; });

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target, this.sky);
    this.scene.add(this.parts, this.pictures.group);
    this.effects = new Effects(this.renderer, this.scene, this.camera);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495/*never below the baseplate*/;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 600;
    this.controls.addEventListener('start', () => { this.tween?.resolve(); this.tween = undefined; })/*a drag ends a move, settling its command*/;
    // a wheel zoom lands inside the controls' own handler, so the next frame sees no
    // movement; every change marks the camera moved for the path tracer
    this.controls.addEventListener('change', () => { this.cameraChanged(); this.requestFrame(); });

    this.setTheme(theme);
    this.applyLook(0);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  // ------------------------------------------------------------------------------
  /** parses the packed parts once. A part's geometry is built the first time a
   *  build shows it, so a studio never pays for parts no build uses */
  public async load(): Promise<void> {
    const loader = new LDrawLoader();
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    loader.addDefaultMaterials();
    // the loader names each face's color by its material: one per color the packed
    // parts are drawn in keeps a print's code (SEE: toSceneGeometries)
    for(const code of Object.keys(COLOR_VALUES)) loader.addMaterial(Object.assign(new THREE.MeshStandardMaterial(), { userData: { code } }));

    await parse(loader, PARTS_LDRAW)/*caches every built-in file; a family's are cached when it is read*/;
    this.loader = loader;
    this.studGeometry = toSceneGeometries(await parse(loader, single('stud.dat'))).get(OWN_COLOR);
  }

  /** builds the geometry of the catalog parts drawn items show that have none yet,
   *  reading the families they are in first, then draws what is shown by then
   *  again. A part that cannot be drawn is counted (SEE: unbuiltCount)
   *  and left out; the build itself never changes. Settling waits for it */
  private buildGeometries(items: ReadonlyArray<RenderItem>, model: Model, animate: boolean): void {
    const missing = [...new Set(items.map(item => item.ldraw))]
      .filter(ldraw => !this.prints.has(ldraw)/*built*/ && !this.building.has(ldraw) && !this.unbuilt.has(ldraw) && PACKED.has(ldraw));
    if(missing.length < 1) return/*every part shown has its geometry, is being built or cannot be*/;

    const loader = this.loader;
    if(!loader) return/*not loaded*/;
    const built = (async () => {
      const families = [...new Set(missing.flatMap(ldraw => PART_RESOURCES[ldraw.toLowerCase()] ?? []))];
      const read = await Promise.allSettled(families.map(name => this.readFamily(loader, name)));
      const failed = new Set(families.filter((_, index) => read[index].status === 'rejected'));
      for(const ldraw of missing) {
        try {
          const family = PART_RESOURCES[ldraw.toLowerCase()];
          if((family !== undefined) && failed.has(family)) { this.unbuilt.add(ldraw); continue; }
          const byColor = toSceneGeometries(await parse(loader, single(`${ldraw}.dat`)));
          const prints = [...byColor.keys()].filter(code => code !== OWN_COLOR);
          for(const [code, geometry] of byColor) this.geometries.set((code === OWN_COLOR) ? ldraw : printKey(ldraw, code), geometry);
          this.prints.set(ldraw, prints);
          this.seams.set(ldraw, seamMatrix(byColor.get(OWN_COLOR) ?? byColor.values().next().value!/*a part drawn in fixed colors alone*/));
        } catch(error) {
          console.error(`brick-studio: part ${ldraw} could not be built:`, error);
          this.unbuilt.add(ldraw);
        }
      }
    })().finally(() => {
        for(const ldraw of missing) this.building.delete(ldraw);
        this.drawingChanges++;
        if(missing.some(ldraw => this.unbuilt.has(ldraw))) this.onPartsChanged?.();
        // what is shown now, which may have replaced this one while its parts were
        // read (it skipped the parts being built, so it waits for these): a build kept
        // in view now that they are drawn
        this.redraw((this.model === model) && animate);
        if(!this.staging) this.keepInView();
        this.requestFrame();
      });
    for(const ldraw of missing) this.building.set(ldraw, built);
  }

  /** reads a family into the loader once, saying so while it reads; a failed read
   *  is named and read again on a retry */
  private readFamily(loader: LDrawLoader, name: string): Promise<void> {
    let read = this.families.get(name);
    if(!read) {
      const family = resourceFamily(name);
      this.loading.add(family);
      this.onPartsChanged?.();
      read = this.readResource(name).then(text => parse(loader, text)).then(() => undefined/*its files are cached*/);
      read.then(
        () => { this.loading.delete(family); this.onPartsChanged?.(); },
        error => {
          console.error(`brick-studio: the ${name} parts could not be read:`, error);
          this.families.delete(name);
          this.loading.delete(family);
          this.failed.add(family);
          this.onPartsChanged?.();
        });
      this.families.set(name, read);
    } /* else -- read, or being read */
    return read;
  }

  // ------------------------------------------------------------------------------
  /** how many of a build's parts are not drawn because they lie past the draw reach
   *  or are outsized (SEE: isDrawable); their lines are kept */
  public undrawnCount(model: Model): number {
    const placements = model.placements.filter(placement => !drawnLines(model, placement).every(isDrawable));
    return placements.length + model.others.filter(other => !isDrawable(other)).length;
  }
  /** whether the build reaches past its baseplate (SEE: BASEPLATE_MAX) */
  public reachesPastBaseplate(): boolean { return this.pastBaseplate; }

  /** how many of a build's parts are not drawn because they could not be: each
   *  placement by the lines it draws (a figure by what it wears, never by every
   *  accessory it could; a hinge with its carry) */
  public unbuiltCount(model: Model): number {
    const placements = model.placements.filter(placement => drawnLines(model, placement).some(line => this.unbuilt.has(line.ldraw)));
    return placements.length + model.others.filter(other => this.unbuilt.has(other.ldraw)).length;
  }
  /** the families being read, and those whose read failed */
  public familiesLoading(): ReadonlyArray<string> { return [...this.loading]; }
  public familiesFailed(): ReadonlyArray<string> { return [...this.failed]; }
  /** register the callback for a family starting or ending its read, and for parts
   *  becoming undrawable or drawable again */
  public onParts(callback: () => void): void { this.onPartsChanged = callback; }
  /** tries every part that could not be drawn again */
  public retryUnbuilt(): void {
    this.unbuilt.clear();
    this.failed.clear();
    this.onPartsChanged?.();
    this.redraw(false);
  }

  // == Theme =====================================================================
  public setTheme(theme: Theme): void {
    this.stage.set(theme.stage);
    this.renderer.setClearColor(this.stage, 1);
    this.themeBaseplate = theme.baseplate;
    this.drawingChanges++;
    this.colorBaseplate();
  }

  /** colors the baseplate the build's ground (a hex color), or the theme's when it
   *  names none: a green lawn stays green in a dark theme */
  private setGround(ground: string | undefined): void {
    if(ground === this.ground) return/*unchanged*/;
    this.ground = ground;
    this.colorBaseplate();
  }

  private colorBaseplate(): void {
    this.baseplateMaterial.color.set(this.ground ?? this.themeBaseplate);
    this.pathTraceStale = true;
    this.requestFrame();
  }

  // == Sky =======================================================================
  /** shows a set's sky, or the theme's backdrop (`undefined`) */
  private showSky(sky: Sky | undefined): void {
    if(this.backdrop.show(sky)) this.skyChanged();
  }

  /** the sky behind every look, and the light it gives one that lights */
  private skyChanged(): void {
    this.scene.background = this.backdrop.texture ?? null/*the theme's clear color*/;
    this.applyLook(this.fidelity);
    this.pathTraceStale = true;
    this.requestFrame();
  }

  /** whether the sky shown names a picture that could not be read (its generated sky
   *  stands in) */
  public get skyUnread(): boolean { return this.backdrop.isUnread; }
  /** how many pictures standing in the set name an image that could not be read (each
   *  drawn plain) */
  public get picturesUnread(): number { return this.pictures.unreadCount; }

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
    this.drawingChanges++;
    this.applyLook(fidelity);
    this.redraw(false)/*seams and tint follow the stop*/;
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

  /** the metal of a finish, made at the current stop on first use */
  private metalFor(finish: Finish): THREE.MeshPhysicalMaterial {
    let metal = this.metals.get(finish);
    if(!metal) {
      metal = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
      applyMetal(metal, finish, this.fidelity);
      this.metals.set(finish, metal);
    } /* else -- made */
    return metal;
  }

  /** the finish a material is the metal of, if it is metal */
  private finishOf(material: THREE.Material | THREE.Material[]): Finish | undefined {
    for(const [finish, metal] of this.metals) if(metal === material) return finish;
    return undefined;
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
    const { key = 1, fill = 1, exposure = 1, soft = 0 } = this.stageLight;
    if(!draft) this.studio ??= createStudio(this.renderer, KEY_DIRECTION);
    this.scene.environment = this.backdrop.environment ?? (draft ? this.room : this.studio!.environment);
    this.scene.environmentIntensity = (draft ? 0.42 : 0.9) * fill * (this.backdrop.environment ? SKY_LIGHT : 1);
    this.sky.intensity = (draft ? 0.5 : 0.1) * fill;
    this.sun.intensity = (draft ? 1.6 : 2.4) * key;
    this.renderer.toneMapping = draft ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = (draft ? 1.05 : 1.2) * exposure;
    this.sun.shadow.radius = ((fidelity >= 2) ? 10 : 4) * (1 + (SOFTEST_SHADOW * soft));

    // soft, blurred shadows from stop 2; a shadow type change recompiles materials
    const shadows = (fidelity >= 2) ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    if(this.renderer.shadowMap.type !== shadows) {
      this.renderer.shadowMap.type = shadows;
      this.sun.shadow.blurSamples = 16;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.baseplateMaterial.needsUpdate = true;
    } /* else -- unchanged */

    applyPlastic(this.material, fidelity);
    for(const [tint, glass] of this.glasses) applyGlass(glass, new THREE.Color(tint), fidelity);
    for(const [finish, metal] of this.metals) applyMetal(metal, finish, fidelity);
    this.effects.setFidelity((fidelity > 3) ? 3 : fidelity);
  }

  // == Model =====================================================================
  /** shows a build; parts not shown before drop into place unless `animate` is false.
   *  Staged, the build is kept and shown when the stage ends */
  public setModel(model: Model, animate: boolean): void {
    this.model = model;
    if(!this.staging) this.draw(model, NO_ACTORS, animate);
  }

  /** draws again what is shown: the stage, or the build, every set's meshes built anew */
  private redraw(animate: boolean): void {
    this.forgetSetMeshes();
    if(this.staging) this.draw(this.staging.sets[this.staging.standing], this.staging.actors, false);
    else if(this.model) this.draw(this.model, NO_ACTORS, animate);
  }

  /** the items drawn for render items: each part's prints beside it, only those
   *  whose geometry is built, the seams of the real look applied */
  private itemsOf(drawn: ReadonlyArray<RenderItem>): RenderItem[] {
    const real = (this.fidelity >= 1);
    return drawn.filter(item => this.prints.has(item.ldraw))
      .flatMap(item => [item, ...this.prints.get(item.ldraw)!.map(code => printItem(item, code))])
      .filter(item => this.geometries.has(item.geometry))
      .map(item => real ? { ...item, matrix: item.matrix.clone().multiply(this.seams.get(item.ldraw)!) } : item);
  }

  /** draws a build and, over it, actors' lines (LDraw, the scene's frame). Staged, a
   *  set's meshes drawn before stand again (SEE: setMeshes) */
  private draw(model: Model, actors: ShownActors, animate: boolean): void {
    this.autoFocus.forget()/*what lies at the middle may change*/;
    const ground = (model.ground === undefined) ? undefined : getColorValue(getColor(model.ground)!.code/*by contract*/);
    this.setGround(ground);
    this.smoothGround = !!model.smoothGround/*the baseplate drawn next follows it*/;
    this.showSky(this.staging ? (this.stageSky ?? model.sky) : model.sky);
    this.pictures.show(model.pictures ?? []);
    const kept = this.staging ? this.setMeshes.get(model) : undefined;
    const setItems = kept ? [] : renderItems(model)/*a set kept is built*/;
    const actorItems = actors.lines.filter(isDrawable).map(line => ({ ...renderItem(line, lineKey(line)), actor: true as const }));
    this.setParts = partCount(model);
    this.drawnParts = this.setParts + actors.parts;
    this.buildGeometries([...setItems, ...actorItems], model, animate);

    for(const child of [...this.parts.children]) { this.parts.remove(child); if(!this.kept.has(child)) (child as THREE.InstancedMesh).dispose(); }
    this.drops = [];
    const drops = { now: performance.now(), starts: new Map<string/*drop*/, number>()/*a part's pieces and prints drop with it*/ };
    const setDrawn = this.itemsOf(setItems);
    const own = kept ?? this.meshesOf(setDrawn, animate, drops);
    if(this.staging && !kept) { this.setMeshes.set(model, own); own.forEach(mesh => this.kept.add(mesh)); }
    const actorDrawn = this.itemsOf(actorItems);
    for(const mesh of [...own, ...this.meshesOf(actorDrawn, animate, drops)]) this.parts.add(mesh);
    if(!kept) this.shownKeys = new Set([...setDrawn, ...actorDrawn].map(item => item.key));
    this.prepareSets(model);

    this.updateBaseplate();
    this.pathTraceStale = true;
    this.requestFrame();
  }

  /** builds the meshes of every staged set but the one standing that has none yet, and
   *  draws each once unseen, so its WebGL buffers stand before the first frame standing
   *  it: drawn and the parts shown put back within one task, as a thumbnail is (the
   *  browser paints between tasks) */
  private prepareSets(standing: Model): void {
    const fresh = (this.staging?.sets ?? []).filter(other => (other !== standing) && !this.setMeshes.has(other));
    if(fresh.length < 1) return;
    const shown = [...this.parts.children];
    for(const other of fresh) {
      const meshes = this.meshesOf(this.itemsOf(renderItems(other)), false, { now: 0, starts: new Map() });
      this.setMeshes.set(other, meshes);
      meshes.forEach(mesh => this.kept.add(mesh));
      this.parts.clear();
      for(const mesh of meshes) this.parts.add(mesh);
      this.renderNow();
    }
    this.parts.clear();
    for(const child of shown) this.parts.add(child);
    this.renderNow();
  }

  /** frees every staged set's meshes not drawn now, and keeps none from now on: those
   *  drawn now are freed once the next draw removes them */
  private forgetSetMeshes(): void {
    for(const meshes of this.setMeshes.values()) for(const mesh of meshes) if(mesh.parent !== this.parts) mesh.dispose();
    this.setMeshes.clear();
    this.kept.clear();
  }

  /** one instanced mesh per part in opaque plastic, per part and finish in metal, and
   *  per part and tint in glass, an actor's apart from the set's; parts not shown
   *  before drop into place when `animate` */
  private meshesOf(items: ReadonlyArray<RenderItem>, animate: boolean, drops: Readonly<{ now: number; starts: Map<string, number>; }>): THREE.InstancedMesh[] {
    const real = (this.fidelity >= 1);
    const { now, starts: dropStarts } = drops;
    const meshes: THREE.InstancedMesh[] = [];
    const byPart = new Map<string, RenderItem[]>();
    for(const item of items) byPart.set(groupOf(item), [...(byPart.get(groupOf(item)) ?? []), item]);
    for(const [groupKey, partItems] of byPart) {
      const { geometry, glass, finish, color: tint, actor } = partItems[0];
      const mesh = new THREE.InstancedMesh(this.geometries.get(geometry)!, glass ? this.glassFor(tint) : finish ? this.metalFor(finish) : this.material, partItems.length);
      if(actor) mesh.userData.actor = groupKey/*how a frame finds the mesh to move*/;
      mesh.castShadow = !glass/*light passes through; the path tracer shades it physically*/;
      mesh.receiveShadow = true;
      partItems.forEach((item, index) => {
        mesh.setColorAt(index, instanceColor(item, real));
        if(animate && !this.shownKeys.has(item.key)) {
          if(!dropStarts.has(item.drop)) dropStarts.set(item.drop, now + Math.min(dropStarts.size * DROP_STAGGER_MS, DROP_STAGGER_MAX_MS));
          this.drops.push({ mesh, index, matrix: item.matrix, start: dropStarts.get(item.drop)! });
          mesh.setMatrixAt(index, dropped(item.matrix, 0));
        } else {
          mesh.setMatrixAt(index, item.matrix);
        }
      });
      mesh.computeBoundingSphere();
      mesh.frustumCulled = false/*instances move during a drop*/;
      meshes.push(mesh);
    }
    return meshes;
  }

  // == View ======================================================================
  /** turns the camera to a view, framing the build when `fit` is set; resolves once
   *  the final frame is drawn */
  public setView(view: View, fit: boolean): Promise<void> {
    if(this.staging) return Promise.resolve()/*the stage's camera stands*/;
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const from = new THREE.Spherical().setFromVector3(offset);
    const to = new THREE.Spherical(from.radius, THREE.MathUtils.degToRad(90 - clamp(view.elevation, 2, 89)), THREE.MathUtils.degToRad(normalizeDegrees(view.azimuth)));
    to.phi = Math.min(to.phi, this.controls.maxPolarAngle);
    let target = this.controls.target.clone();
    if(fit) {
      const framing = this.framing(new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, to.phi, to.theta)));
      target = framing.target;
      to.radius = framing.radius;
    } /* else -- keep the distance and target */

    // take the short way round: the turn wrapped into a half turn either way, in one
    // step whatever the angles' size
    to.theta = from.theta + wrapTurn(to.theta - from.theta);

    this.tween?.resolve();
    return new Promise(resolve => {
      this.tween = { from, to, fromTarget: this.controls.target.clone(), toTarget: target, start: performance.now(), resolve };
      this.requestFrame();
    });
  }

  /** frames the whole build once its parts are drawn (a part counts toward the
   *  framing only once its geometry is built), resolving once settled */
  public async frameWhole(): Promise<void> {
    await this.whenSettled();
    await this.setView(this.getView(), true);
    await this.whenSettled();
  }

  /** places the camera at once (no tween), used for the first frame */
  public jumpToView(view: View): void {
    if(this.staging) return/*the stage's camera stands*/;
    const to = new THREE.Spherical(1, THREE.MathUtils.degToRad(90 - clamp(view.elevation, 2, 89)), THREE.MathUtils.degToRad(view.azimuth));
    const framing = this.framing(new THREE.Vector3().setFromSpherical(to));
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

  /** the build from each view, framed, as a PNG data URL of the given size (CSS
   *  pixels) once settled; the camera and the canvas's size are put back after */
  public async snapshots(views: ReadonlyArray<View>, width: number, height: number): Promise<string[]> {
    this.tween?.resolve();
    this.tween = undefined;
    const position = this.camera.position.clone(), target = this.controls.target.clone();
    this.setDrawingSize(width, height);
    const images: string[] = [];
    try {
      for(const view of views) {
        this.jumpToView(view);
        await this.whenSettled();
        images.push(this.canvas.toDataURL('image/png'));
      }
    } finally {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.resize()/*the canvas's own size*/;
    }
    return images;
  }

  /** resolves once every part has landed, any view change has finished and that
   *  frame is drawn */
  public whenSettled(): Promise<void> {
    return new Promise(resolve => { this.settleWaiters.push(resolve); this.requestFrame(); });
  }

  /** reframes the build at the current view when any part lies outside the frame */
  public keepInView(): void {
    if(this.staging) return/*the stage's camera stands*/;
    const box = this.buildBounds();
    if(box.isEmpty()) return/*nothing to frame*/;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(
      (i & 1) ? box.max.x : box.min.x, (i & 2) ? box.max.y : box.min.y, (i & 4) ? box.max.z : box.min.z).project(this.camera));
    const inView = corners.every(corner => (Math.abs(corner.x) <= 0.98) && (Math.abs(corner.y) <= 0.98) && (corner.z < 1));
    if(!inView) void this.setView(this.getView(), true);
  }

  /** moves the camera as the keys say until they say stand (SEE: Walk) */
  public walk(walk: Walk): void {
    if(this.staging) return/*the stage's camera stands*/;
    const stopping = !isStanding(this.walking) && isStanding(walk);
    this.walking = walk;
    if(stopping) this.pivotOnView();
    if(isStanding(walk)) { this.lastWalk = undefined; return; }
    this.tween?.resolve()/*a walk takes over from a view change*/;
    this.tween = undefined;
    this.requestFrame();
  }

  // == Stage =====================================================================
  /** whether a stage is shown in place of the build */
  public get isStaged(): boolean { return !!this.staging; }

  /** holds the view over a stage for the person (`held`): the mouse turns and zooms the
   *  camera, and a live frame poses its actors without moving it; let go, the next
   *  frame's camera stands again. A stage shown afresh, or the build shown again, lets
   *  it go; a stage that keeps the picture keeps it held */
  public holdView(held: boolean): void {
    this.viewHeld = held && !!this.staging;
    this.controls.enabled = !this.staging || this.viewHeld;
    this.requestFrame();
  }
  /** whether the person holds the view over the stage (SEE: holdView) */
  public get isViewHeld(): boolean { return this.viewHeld; }

  /** shows a stage's first set in place of the build, its baseplate covering at least
   *  `floor`, no actor shown yet, the parts of its other sets built unseen so a frame
   *  standing another draws it at once; the camera stands until a frame moves it.
   *  Staged again, the new sets replace the last; to `keep` the picture, the actors and
   *  the overlay standing stand on in the set standing (the first, if there are fewer
   *  now) until a frame moves them, so a stage replacing one shows nothing bare */
  public showStage(sets: ReadonlyArray<Model>, floor: Floor | undefined, keep: boolean): void {
    const kept = keep ? this.staging : undefined/*shown afresh*/;
    if(!this.staging) {
      this.tween?.resolve();
      this.tween = undefined;
      this.walking = STANDING;
      this.controls.enabled = false/*the stage's camera, never the mouse's*/;
    } /* else -- staged: the camera to put back stays the build's */
    if(!kept) this.viewHeld = false/*a stage afresh: its frames' camera*/;
    this.controls.enabled = this.viewHeld;
    this.forgetSetMeshes()/*the last stage's*/;
    const standing = kept ? Math.min(kept.standing, sets.length - 1) : 0, actors = kept?.actors ?? NO_ACTORS;
    this.staging = { sets, standing, floor, actors, overlay: kept?.overlay ?? NO_OVERLAY, size: this.staging?.size, before: this.staging?.before ?? { position: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov } };
    this.overlayStale = true;
    for(const other of sets.filter((_, index) => index !== standing)) this.buildGeometries(renderItems(other), other, false);
    this.draw(sets[standing], actors, false);
  }

  /** draws the stage at `width` by `height` pixels from now on, the canvas showing
   *  it whole: a film's shape, or a capture's size */
  public drawStageAt(width: number, height: number): void {
    if(!this.staging) return/*nothing staged*/;
    if((this.staging.size?.width === width) && (this.staging.size?.height === height)) return/*drawn at that size*/;
    this.staging.size = { width, height };
    this.renderer.setPixelRatio(1)/*a frame is its pixels*/;
    this.canvas.style.objectFit = this.overlayCanvas.style.objectFit = 'contain';
    this.setDrawingSize(width, height);
  }

  /** shows a frame of the stage on one of its sets (`set`, an index into them): its
   *  actors' lines (LDraw, the scene's frame) seen through its camera, or its plan,
   *  over the shot a transition leaves (`leaving`); the view the person holds stands
   *  unless the frame is `filmed` (to capture: through its own camera, the view put
   *  back once captured) */
  public showFrame(actors: ShownActors, camera: ViewCamera, overlay: FilmOverlay = NO_OVERLAY, set = 0, leaving?: LeavingShot, filmed = false): void {
    if(!this.staging) return/*nothing staged*/;
    if(this.viewHeld && filmed) this.heldEye ??= this.eye();
    if(!this.viewHeld || filmed) this.look(camera);
    this.staging.leaving = leaving;
    this.pose(actors, overlay, set);
  }

  /** a frame's picture `width` by `height`, its fade and title drawn over it. Its
   *  parts are built first, unseen, and the studio settled on the frame it shows; then
   *  the frame is drawn, copied and the frame shown put back in one task, so the screen
   *  never shows it: the browser paints between tasks */
  public async thumbnail(actors: ShownActors, camera: ViewCamera, overlay: FilmOverlay, width: number, height: number, set = 0, leaving?: LeavingShot): Promise<ImageBitmap> {
    const staging = this.staging;
    if(!staging) throw new Error('nothing is staged');
    await this.partsBuilt(actors.lines, set);
    if(leaving) await this.partsBuilt((leaving.actors ?? actors).lines, leaving.set)/*the shot it leaves*/;
    await this.whenSettled();
    if(this.staging !== staging) throw new Error('the stage was replaced while the thumbnail\'s parts were built');
    const shown = { set: staging.standing, actors: staging.actors, overlay: staging.overlay, leaving: staging.leaving, eye: this.eye() };
    const picture = Object.assign(document.createElement('canvas'), { width, height });

    this.look(camera);
    staging.leaving = leaving;
    this.pose(actors, overlay, set);
    this.renderNow();
    this.drawPicture(picture.getContext('2d')!, overlay, width, height);

    this.toEye(shown.eye);
    staging.leaving = shown.leaving;
    this.pose(shown.actors, shown.overlay, shown.set);
    this.renderNow();
    return createImageBitmap(picture);
  }

  /** the frame shown, `width` by `height` pixels, once settled. The stage draws at
   *  that size from then on, the canvas showing it whole */
  public async capture(width: number, height: number): Promise<ImageBitmap> {
    if(!this.staging) throw new Error('nothing is staged');
    try {
      this.drawStageAt(width, height);
      await this.whenSettled();
      const overlay = this.staging.overlay;
      if(isBlank(overlay)) return await createImageBitmap(this.canvas)/*the picture alone*/;
      const picture = Object.assign(document.createElement('canvas'), { width, height });
      this.drawPicture(picture.getContext('2d')!, overlay, width, height);
      return await createImageBitmap(picture);
    } finally {
      if(this.heldEye) { this.toEye(this.heldEye); this.heldEye = undefined/*the person's view again*/; this.requestFrame(); }
    }
  }

  /** shows the build again, the camera where it stood before the stage */
  public unstage(): void {
    const staging = this.staging;
    if(!staging) return/*nothing staged*/;
    this.staging = undefined;
    [this.viewHeld, this.heldEye] = [false, undefined]/*the build's own view*/;
    this.aim(staging.before.position, staging.before.target, staging.before.fov)/*level and unshifted again*/;
    this.useLens({})/*the look's own focus again*/;
    this.useLight({})/*the look's own light again*/;
    this.stageSky = undefined/*each set's own again*/;
    this.controls.enabled = true;
    this.controls.update();
    this.renderer.setPixelRatio(screenPixelRatio());
    this.canvas.style.objectFit = this.overlayCanvas.style.objectFit = '';
    this.overlayStale = true;
    this.resize();
    this.redraw(false);
  }

  // .. Stage frames ..............................................................
  /** turns the camera to a frame's: where it stands, or straight down over a plan's
   *  area at the canvas's shape, a plan neither rolled nor shifted */
  private look(camera: ViewCamera): void {
    const seen = isPlan(camera) ? planAim(camera.plan, this.camera.aspect) : camera;
    this.aim(scenePoint(seen.position), scenePoint(seen.target), seen.fov, isPlan(camera), isPlan(camera) ? 0 : (camera.roll ?? 0), isPlan(camera) ? 0 : (camera.shift ?? 0));
    this.useLens(isPlan(camera) ? {} : { ...((camera.focus !== undefined) ? { focus: (typeof camera.focus === 'number') ? camera.focus/*studs, the scene's units*/ : scenePoint(camera.focus) } : {}), ...((camera.aperture !== undefined) ? { aperture: camera.aperture } : {}) });
  }

  /** a stage's sky from now on, over every set's (`undefined`: each set's own); shown
   *  with the set the next frame draws */
  public useSky(sky: Sky | undefined): void { this.stageSky = sky; }

  /** a stage's light from now on, over the look's own; the path tracer lights its
   *  scene afresh */
  public useLight(light: StageLight): void {
    this.stageLight = light;
    this.applyLook(this.fidelity);
    this.pathTraceStale = true;
    this.requestFrame();
  }

  /** a stage frame's lens from now on: an aperture of its own draws a depth of field
   *  at every look */
  private useLens(lens: StageLens): void {
    this.stageLens = lens;
    this.effects.setDepthOfField(lens.aperture !== undefined);
  }

  /** where the camera stands and how it sees, to put back */
  private eye(): Eye { return { position: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov, shift: this.lensShift(), up: this.camera.up.clone(), lens: this.stageLens }; }
  private toEye(eye: Eye): void {
    this.aimed(eye.position, eye.target, eye.fov, eye.shift, eye.up);
    this.useLens(eye.lens);
  }

  /** how far the camera's lens is shifted up: a share of the picture's height, its view
   *  offset's (SEE: aimed) */
  private lensShift(): number {
    const view = this.camera.view;
    return view?.enabled ? -(view.offsetY / view.fullHeight) : 0/*unshifted*/;
  }

  /** turns the camera to stand at `position`, looking at `target` through `fov`,
   *  turned clockwise about where it looks by `roll` degrees as seen from behind it, its
   *  lens shifted up by `shift` (a share of the picture's height, down when negative);
   *  looking straight down over a plan, north is up and the camera draws from high
   *  over the ground */
  private aim(position: THREE.Vector3, target: THREE.Vector3, fov: number, plan = false, roll = 0, shift = 0): void {
    this.aimed(position, target, fov, shift, plan ? NORTH : rolledUp(position, target, roll), plan);
  }

  /** turns the camera to stand at `position`, looking at `target` through `fov`, its
   *  lens shifted up by `shift`, `up` its up. The shift is the camera's view offset (the
   *  picture a window raised over the image its lens casts), so every reader of the
   *  projection (ambient occlusion, the depth of field, the path tracer's rays) draws
   *  through it and a resize keeps it */
  private aimed(position: THREE.Vector3, target: THREE.Vector3, fov: number, shift: number, up: THREE.Vector3, plan = up.equals(NORTH)): void {
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.camera.fov = fov;
    this.camera.up.copy(up);
    const height = position.distanceTo(target);
    [this.camera.near, this.camera.far] = plan ? [Math.max(CAMERA_NEAR, height - PLAN_DEPTH), height + 1] : [CAMERA_NEAR, CAMERA_FAR];
    // NOTE: each updates the projection; a view offset takes the picture's shape from
    //       its full size, so the full size is the picture's own
    if(shift !== 0) this.camera.setViewOffset(this.camera.aspect, 1, 0, -shift/*a view offset counts down the picture*/, this.camera.aspect, 1);
    else this.camera.clearViewOffset();
    this.camera.lookAt(this.controls.target);
    this.cameraChanged();
  }

  /** shows a frame's set, actors and overlay: the standing actors moved where the
   *  frame puts them, or the stage drawn again when the frame stands another set or
   *  shows other parts (an actor appearing or leaving) */
  private pose(actors: ShownActors, overlay: FilmOverlay, set: number): void {
    const staging = this.staging!/*by contract: staged*/;
    staging.overlay = overlay;
    this.overlayStale = true;
    const cut = (set !== staging.standing);
    staging.standing = set;
    if(cut || !this.moveActors(actors.lines)) this.draw(staging.sets[set], actors, false);
    staging.actors = actors;
    this.drawnParts = this.setParts + actors.parts/*moved, the set drawn stands*/;
    this.pathTraceStale = true;
    this.requestFrame();
  }

  /** moves each actor's standing instance to a frame's lines; false, moving none,
   *  when the frame's parts are not the instances standing, or are not all built yet
   *  (drawing them builds them) */
  private moveActors(actors: ReadonlyArray<PartLine>): boolean {
    const drawn = actors.filter(isDrawable).map(line => ({ ...renderItem(line, lineKey(line)), actor: true as const }));
    if(drawn.some(item => !this.prints.has(item.ldraw) || !this.geometries.has(item.geometry))) return false;
    const byGroup = new Map<string, RenderItem[]>();
    for(const item of this.itemsOf(drawn)) {
      const key = groupOf(item);
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    const meshes = new Map((this.parts.children as THREE.InstancedMesh[]).filter(mesh => mesh.userData.actor).map(mesh => [mesh.userData.actor as string, mesh]));
    if(meshes.size !== byGroup.size) return false;
    for(const [key, items] of byGroup) if(meshes.get(key)?.count !== items.length) return false;

    const real = (this.fidelity >= 1);
    for(const [key, items] of byGroup) {
      const mesh = meshes.get(key)!;
      items.forEach((item, index) => { mesh.setMatrixAt(index, item.matrix); mesh.setColorAt(index, instanceColor(item, real))/*the instance may stand for another actor now*/; });
      mesh.instanceMatrix.needsUpdate = true;
      if(mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    return true;
  }

  /** resolves once every part a frame's lines show is built (or cannot be), building
   *  those none has asked for yet without showing them: a build's end redraws the
   *  frame shown */
  private async partsBuilt(actors: ReadonlyArray<PartLine>, set: number): Promise<void> {
    const drawn = actors.filter(isDrawable).map(line => renderItem(line, lineKey(line)));
    const model = this.staging!.sets[set]/*by contract: staged*/;
    this.buildGeometries([...drawn, ...renderItems(model)], model, false);
    await Promise.all([...new Set(drawn.map(item => item.ldraw))].flatMap(ldraw => this.building.get(ldraw) ?? []));
  }

  /** draws what the canvas shows into a picture `width` by `height` (fit whole, the
   *  rest black) and an overlay over it */
  private drawPicture(context: CanvasRenderingContext2D, overlay: FilmOverlay, width: number, height: number): void {
    const scale = Math.min(width / this.canvas.width, height / this.canvas.height);
    const [w, h] = [this.canvas.width * scale, this.canvas.height * scale];
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.drawImage(this.canvas, (width - w) / 2, (height - h) / 2, w, h);
    context.save();
    context.translate((width - w) / 2, (height - h) / 2);
    drawOverlay(context, overlay, w, h, this.staging?.left?.picture);
    context.restore();
  }

  /** draws the frame now, at the look's immediate render (no refining), over the shot
   *  a transition leaves */
  private renderNow(): void {
    this.drawLeaving();
    this.effects.focus(this.lens());
    this.effects.render();
  }

  /** the shot a transition leaves, drawn apart as its picture before the frame's:
   *  through its camera on the set standing, its actors where the frame puts them, at
   *  every frame; or, on another set, with the actors it names (as they stood leaving
   *  it), drawn there once for all it names and that picture held (standing the other
   *  set takes rebuilding the actors' meshes, too slow for every frame), until what
   *  it draws changes beneath it: parts it may have drawn without built, the look, the
   *  theme. The picture is the frame's own however
   *  the frame is reached: played to, sought, captured; the frame's own focus is put
   *  back with its camera */
  private drawLeaving(): void {
    const staging = this.staging, leaving = staging?.leaving;
    if(!staging || !leaving) { if(staging) staging.left = undefined; return; }
    const elsewhere = (leaving.set !== staging.standing);
    const actors = leaving.actors ?? staging.actors;
    const { position, target, fov, roll, shift, focus, aperture } = leaving.camera;
    const key = [leaving.set, position.x, position.z, position.height, target.x, target.z, target.height, fov, roll ?? 0, shift ?? 0, JSON.stringify(focus ?? null), aperture, this.canvas.width, this.canvas.height, this.drawingChanges, ...actors.lines.map(line => `${line.ldraw}:${line.colorCode}:${line.position.join(',')}:${line.matrix.join(',')}`)].join('|');
    if(elsewhere && (staging.left?.key === key)) return/*held*/;
    const picture = staging.left?.picture ?? document.createElement('canvas');
    [picture.width, picture.height] = [this.canvas.width, this.canvas.height];
    const shown = this.eye();
    if(elsewhere) this.draw(staging.sets[leaving.set], actors, false);
    this.look(leaving.camera);
    this.effects.focus(this.lens());
    this.effects.render();
    picture.getContext('2d')!.drawImage(this.canvas, 0, 0);
    if(elsewhere) this.draw(staging.sets[staging.standing], staging.actors, false);
    this.toEye(shown);
    this.effects.focus(this.lens());
    staging.left = { key, picture };
    this.overlayStale = true;
  }

  /** the overlay canvas at the stage canvas's pixels, the frame's overlay on it */
  private paintOverlay(): void {
    const canvas = this.overlayCanvas;
    if((canvas.width !== this.canvas.width) || (canvas.height !== this.canvas.height)) [canvas.width, canvas.height] = [this.canvas.width, this.canvas.height];
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const overlay = this.staging?.overlay;
    if(overlay && !isBlank(overlay)) drawOverlay(context, overlay, canvas.width, canvas.height, this.staging?.left?.picture);
    this.overlayStale = false;
  }

  // == Internal ==================================================================
  /** the build's bounds with every part in place (a dropping part counts where it
   *  lands); a stage's actors never count */
  private buildBounds(): THREE.Box3 {
    const box = new THREE.Box3();
    for(const part of this.partBoxes()) box.union(part);
    return box;
  }

  /** each part's box, a dropping part's where it lands; no actor's (each moves with its
   *  frame) */
  private partBoxes(): THREE.Box3[] {
    const landing = new Map(this.drops.map(drop => [drop.mesh.uuid + ':' + drop.index, drop.matrix]));
    const matrix = new THREE.Matrix4();
    return (this.parts.children as THREE.InstancedMesh[]).filter(mesh => !mesh.userData.actor).flatMap(mesh => Array.from({ length: mesh.count }, (_, index) => {
      mesh.getMatrixAt(index, matrix);
      return mesh.geometry.boundingBox!.clone().applyMatrix4(landing.get(mesh.uuid + ':' + index) ?? matrix);
    }));
  }

  /** the baseplate the path tracer is given: the plate as drawn, or past
   *  TRACED_STUDS_MAX its slab and the studs near the build alone (SEE:
   *  tracedStudCells); and what to free once the tracer holds its copy */
  private tracedBaseplate(): Readonly<{ plate: THREE.Object3D | undefined; free: () => void; }> {
    const plate = this.baseplate;
    if(!plate || !this.studGeometry || (plate.userData as { smooth: boolean; }).smooth) return { plate, free: () => undefined }/*none, or a smooth slab*/;
    const area = plate.userData as Readonly<{ minX: number; minZ: number; width: number; depth: number; }>;
    const cells = tracedStudCells(area, this.partBoxes().map(box => ({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z })));
    if(!cells) return { plate, free: () => undefined }/*every stud*/;

    const traced = new THREE.Group();
    traced.add(plate.children.find(child => !(child as THREE.InstancedMesh).isInstancedMesh)!.clone()/*the slab*/);
    if(cells.length < 1) return { plate: traced, free: () => undefined }/*a plain slab*/;
    const studs = new THREE.InstancedMesh(this.studGeometry, this.baseplateMaterial, cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach(([x, z], index) => studs.setMatrixAt(index, matrix.makeTranslation(x + 0.5, 0, z + 0.5)));
    traced.add(studs);
    return { plate: traced, free: () => studs.dispose() };
  }

  /** the target and distance that frame the build (or the baseplate when empty)
   *  seen from a direction: every corner of its bounds in view, the nearest edges at
   *  the margin, so a wide, low build fills the frame as a tall one does */
  private framing(direction: THREE.Vector3/*from the target toward the camera*/): { target: THREE.Vector3; radius: number; } {
    const box = this.buildBounds();
    if(box.isEmpty() && this.baseplate) box.setFromObject(this.baseplate);
    if(box.isEmpty()) box.set(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 1, 4));

    // the camera's axes looking back along the direction (straight down looks north)
    const target = box.getCenter(new THREE.Vector3());
    const back = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back);
    if(right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(back, right).normalize();

    // back far enough that every corner of the bounds is in view
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / FRAME_MARGIN;
    const tanHorizontal = tanVertical * this.camera.aspect;
    let distance = 0;
    for(const x of [box.min.x, box.max.x]) for(const y of [box.min.y, box.max.y]) for(const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(target);
      const toward = corner.dot(back);
      distance = Math.max(distance, toward + (Math.abs(corner.dot(right)) / tanHorizontal), toward + (Math.abs(corner.dot(up)) / tanVertical));
    }
    return { target, radius: Math.max(distance, this.controls.minDistance) };
  }


  // ------------------------------------------------------------------------------
  /** sizes the baseplate to the build plus a margin (SEE: baseplateArea) and places
   *  the sun over it */
  private updateBaseplate(): void {
    if(!this.studGeometry) return/*not loaded*/;

    const box = this.buildBounds()/*drawn parts alone: finite and within the draw reach*/;
    const floor = this.staging?.floor;
    if(floor) box.union(new THREE.Box3(new THREE.Vector3(floor.x, 0, -(floor.z + floor.depth)), new THREE.Vector3(floor.x + floor.width, 0, -floor.z)));
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    const { minX, minZ, width, depth, partial } = baseplateArea(box.isEmpty() ? undefined : { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    if(partial !== this.pastBaseplate) { this.pastBaseplate = partial; this.onPartsChanged?.(); }

    if(this.baseplate) {
      const current = this.baseplate.userData as { minX: number; minZ: number; width: number; depth: number; smooth: boolean; };
      if((current.minX === minX) && (current.minZ === minZ) && (current.width === width) && (current.depth === depth) && (current.smooth === this.smoothGround)) return/*unchanged*/;
      this.scene.remove(this.baseplate);
      // the slab's own geometry, and the studs' instances (their stud geometry is shared)
      this.baseplate.traverse((object: THREE.Object3D) => {
        if((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
        else if((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
      });
    } /* else -- first baseplate */

    const plate = new THREE.Group();
    plate.userData = { minX, minZ, width, depth, smooth: this.smoothGround };
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, BASEPLATE_THICKNESS, depth), this.baseplateMaterial);
    slab.position.set(minX + (width / 2), -BASEPLATE_THICKNESS / 2, minZ + (depth / 2));
    slab.receiveShadow = true;
    plate.add(slab);
    if(!this.smoothGround) {
      const studs = new THREE.InstancedMesh(this.studGeometry, this.baseplateMaterial, width * depth);
      const matrix = new THREE.Matrix4();
      let index = 0;
      for(let z=0; z<depth; z++) for(let x=0; x<width; x++) studs.setMatrixAt(index++, matrix.makeTranslation(minX + x + 0.5, 0, minZ + z + 0.5));
      studs.receiveShadow = true;
      plate.add(studs);
    } /* else -- a smooth ground: its slab alone */
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
    const size = this.staging?.size;
    this.setDrawingSize(size?.width ?? this.canvas.clientWidth, size?.height ?? this.canvas.clientHeight);
  }

  /** draws at a size (CSS pixels), whatever size the canvas shows at */
  private setDrawingSize(width: number, height: number): void {
    if((width < 1) || (height < 1)) return/*hidden*/;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects.setSize(width, height);
    this.cameraChanged();
    this.overlayStale = true/*drawn at the canvas's pixels*/;
    this.requestFrame();
  }

  // ------------------------------------------------------------------------------
  private requestFrame(): void {
    if(this.frameRequested) return;
    this.frameRequested = true;
    requestDraw(window, () => this.frame(), FRAME_FALLBACK_MS);
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
    if(!this.staging && this.controls.update()) moving = true/*damping; a stage's camera stands where its frame puts it*/;

    // dropping parts
    if(this.drops.length > 0) {
      const settled: Drop[] = [];
      for(const drop of this.drops) {
        const t = clamp((now - drop.start) / DROP_MS, 0, 1);
        drop.mesh.setMatrixAt(drop.index, dropped(drop.matrix, easeOutCubic(t)));
        drop.mesh.instanceMatrix.needsUpdate = true;
        if(t >= 1) settled.push(drop);
      }
      for(const mesh of new Set(this.drops.map(drop => drop.mesh))) mesh.computeBoundingSphere()/*a ray tests the bounds before the instances*/;
      this.drops = this.drops.filter(drop => !settled.includes(drop));
      moving = true;
    } /* else -- nothing dropping */

    if(this.autoFocused() && this.autoFocus.frame(moving || this.viewMoved)) this.requestFrame()/*a frame more, to find it at rest*/;
    this.viewMoved = false;
    this.effects.focus(this.lens());
    const refining = this.render(moving);
    if(this.overlayStale) this.paintOverlay()/*with the picture it lies over*/;

    const waiters = this.frameWaiters;
    this.frameWaiters = [];
    const settled = (this.drops.length < 1) && !this.tween && (this.building.size < 1) && !this.backdrop.loading && !this.pictures.loading && !this.focusing() && (this.tracing()?.settled ?? true);
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
    this.cameraChanged();
  }

  /** the camera moved: the path tracer starts again, the autofocus waits for it to rest */
  private cameraChanged(): void {
    this.cameraMoved = true;
    this.viewMoved = true;
  }

  /** moves the point the camera orbits in to what lies at the center of the view
   *  (a brick, else the baseplate's plane) when that is nearer, leaving the camera
   *  where it stands. Never farther: ground far beyond the build would make the
   *  next drag swing the camera around a distant point */
  private pivotOnView(): void {
    const camera = this.camera.position;
    const distance = camera.distanceTo(this.controls.target);
    const ahead = new THREE.Vector3().subVectors(this.controls.target, camera).normalize();
    const hit = this.firstMet(ahead);
    if(!hit) return/*looking at the sky: the point stays*/;
    this.controls.target.copy(camera).addScaledVector(ahead, clamp(camera.distanceTo(hit), this.controls.minDistance, distance));
    this.controls.update();
    this.requestFrame();
  }

  /** how the frame is focused: a stage frame on the point its lens names (its target
   *  when none) through its aperture, its distance along the camera's axis (where it
   *  looks, which a lens shift moves off the picture's middle and leaves as it is); the
   *  build on what lies at the middle of the picture, as a camera's autofocus finds it
   *  (the point it orbits, looking at the sky), its lens never shifted */
  private lens(): Lens {
    if(this.staging) {
      const { focus, aperture } = this.stageLens;
      const ahead = this.camera.getWorldDirection(new THREE.Vector3());
      const distance = (typeof focus === 'number') ? focus/*ahead along the view*/ : focus ? Math.max(CAMERA_NEAR, new THREE.Vector3().subVectors(focus, this.camera.position).dot(ahead))/*along the view*/ : this.camera.position.distanceTo(this.controls.target);
      return { distance, ...((aperture !== undefined) ? { aperture } : {}) };
    } /* else -- the build */
    if(!this.focuses()) return { distance: this.camera.position.distanceTo(this.controls.target) }/*nothing blurs: no autofocus to find*/;
    return { distance: this.autoFocus.distance ?? this.camera.position.distanceTo(this.controls.target)/*none found yet*/ };
  }

  /** whether the frame is the build's, focused by its autofocus (each frame drawn
   *  advances it once: SEE: AutoFocus#frame) */
  private autoFocused(): boolean { return !this.staging && this.focuses(); }

  /** whether the build's autofocus has yet to find what lies at the middle of the
   *  picture since the view last moved: a frame is not settled until it has */
  private focusing(): boolean { return this.autoFocused() && this.autoFocus.pending; }

  /** whether the frame is focused at all: a depth of field drawn, or the path tracer's */
  private focuses(): boolean { return this.effects.focuses || !!this.tracing(); }

  /** how far from the camera what lies at the middle of the picture stands (a brick,
   *  else the baseplate's plane), else the point it orbits */
  private middleDistance(): number {
    const camera = this.camera.position;
    const hit = this.firstMet(this.camera.getWorldDirection(new THREE.Vector3()));
    return hit ? Math.max(CAMERA_NEAR, camera.distanceTo(hit)) : camera.distanceTo(this.controls.target);
  }

  /** the first point a ray from the camera toward `ahead` (normalized) meets: a brick,
   *  else the baseplate, else the baseplate's plane; none toward the sky */
  private firstMet(ahead: THREE.Vector3): THREE.Vector3 | undefined {
    const ray = new THREE.Raycaster(this.camera.position, ahead);
    return ray.intersectObjects([this.parts, ...(this.baseplate ? [this.baseplate] : [])], true)[0]?.point ?? ray.ray.intersectPlane(GROUND, new THREE.Vector3()) ?? undefined;
  }

  /** whether the path tracer is still refining toward a settled frame */
  public get refining(): boolean { return !(this.tracing()?.settled ?? true); }
  /** the parts drawn at the Path traced stop as Photo, being past what it draws (SEE:
   *  PATH_TRACED_PARTS) */
  public get untracedParts(): number | undefined { return (this.pathTrace && !this.tracer()) ? this.drawnParts : undefined; }
  /** the path tracer, while the parts drawn are within what it draws */
  private tracer(): PathTrace | undefined { return (this.drawnParts <= PATH_TRACED_PARTS) ? this.pathTrace : undefined; }
  /** the path tracer drawing the frame now: none while parts drop or a transition draws
   *  two shots (each drawn at once), so nothing waits on its refining then */
  private tracing(): PathTrace | undefined { return ((this.drops.length > 0) || this.staging?.leaving) ? undefined : this.tracer(); }

  /** draws the frame at the current stop; true while the path tracer still refines */
  private render(moving: boolean): boolean {
    this.drawLeaving();
    const refocused = this.autoFocus.takeMoved()/*told once, whichever draws the frame*/;
    const tracer = this.tracing();
    if(!tracer) { this.effects.render(); return false; }

    if(this.pathTraceStale) {
      const { plate, free } = this.tracedBaseplate();
      tracer.setScene({
        parts: (this.parts.children as THREE.InstancedMesh[]).map(mesh => ({ mesh, glass: this.tintOf(mesh.material), finish: this.finishOf(mesh.material) })), baseplate: plate, pictures: this.pictures.group,
        environment: this.backdrop.lighting ?? this.studio!.cube, environmentIntensity: this.scene.environmentIntensity, background: this.backdrop.texture ?? this.stage,
        key: { position: this.sun.position, target: this.sun.target.position, intensity: this.sun.intensity, soft: this.stageLight.soft ?? 0 },
      }, this.lens());
      free()/*the tracer merged its own copy*/;
      this.pathTraceStale = false;
    } else if(refocused || moving || this.cameraMoved) {
      tracer.moved(this.lens());
    } /* else -- still: keep refining */
    this.cameraMoved = false;
    tracer.render();
    return tracer.refining;
  }
}

// == Render items ================================================================
/** every part line of a build that has catalog geometry, with its scene transform */
/** the lines a build is drawn as: every line that can be (SEE: isDrawable) */
const renderItems = (model: Model): RenderItem[] => [
  ...model.placements.flatMap(placement => {
    const lines = drawnLines(model, placement);
    const drop = lineKey(lines[0]);
    return lines.every(isDrawable) ? lines.map(line => renderItem(line, drop)) : []/*the part whole, or none of it*/;
  }),
  ...model.others.filter(isDrawable).map(other => renderItem(other, lineKey(other))),
];

/** a part line as drawn, dropping with the part `drop` names */
const renderItem = (line: PartLine, drop: string): RenderItem => ({
  ldraw: line.ldraw, geometry: line.ldraw, ...drawnColor(line.colorCode),
  key: lineKey(line), drop, matrix: toScene(line.position, line.matrix),
});

/** the color an item's instance is drawn in: glass white (its material carries the
 *  tint), plastic its color, varied a little per part in the real looks */
const instanceColor = (item: RenderItem, real: boolean): THREE.Color =>
  item.glass ? WHITE : real ? tintedColor(item.color, item.key) : new THREE.Color(item.color);

/** the instanced mesh an item is drawn in: one per part in opaque plastic, per part
 *  and finish in metal, per part and tint in glass, an actor's apart from the set's */
const groupOf = (item: RenderItem): string => `${item.actor ? 'actor|' : ''}${item.glass ? `${item.geometry}|${item.color}` : item.finish ? `${item.geometry}|${item.finish}` : item.geometry}`;

/** a part's faces printed in a fixed color, drawn with it */
const printItem = (item: RenderItem, code: number): RenderItem =>
  ({ ...item, geometry: printKey(item.ldraw, code), ...drawnColor(code), key: `${item.key}#${code}` });

const drawnColor = (code: number) => ({ color: getColorValue(code) ?? UNKNOWN_COLOR, glass: !!getColorByCode(code)?.transparent, finish: getColorByCode(code)?.finish });
const lineKey = (line: PartLine): string => `${line.ldraw}|${line.colorCode}|${line.position}|${line.matrix}`;
/** the geometry key of a part's faces printed in a color */
const printKey = (ldraw: string, code: number): string => `${ldraw}#${code}`;

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
const single = (file: string): string => `1 ${OWN_COLOR} 0 0 0 1 0 0 0 1 0 0 0 1 ${file}\n`;

const parse = (loader: LDrawLoader, text: string): Promise<THREE.Group> =>
  new Promise((resolve, reject) => loader.parse(text, resolve, reject));

/** the faces of a parsed LDraw group as scene-space geometries by color code (edge
 *  lines dropped): the part's own color (OWN_COLOR, as `single` draws it), and each
 *  fixed color a print or a molded-in detail is drawn in (a face's eyes) */
const toSceneGeometries = (group: THREE.Group): Map<number, THREE.BufferGeometry> => {
  group.updateMatrixWorld(true);
  const pieces = new Map<number, THREE.BufferGeometry[]>();
  group.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if(!mesh.isMesh) return/*edge and conditional lines*/;
    let geometry = mesh.geometry.clone();
    if(geometry.index) geometry = geometry.toNonIndexed()/*keeps its groups*/;
    for(const name of Object.keys(geometry.attributes)) if((name !== 'position') && (name !== 'normal')) geometry.deleteAttribute(name);
    geometry.applyMatrix4(mesh.matrixWorld);
    if(mesh.matrixWorld.determinant() < 0) reverseWinding(geometry)/*a mirrored file (a left arm drawn as a right one) would face inward*/;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const ranges = (geometry.groups.length > 0) ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }];
    for(const { start, count, materialIndex } of ranges) {
      const code = Number(materials[materialIndex ?? 0].userData.code);
      pieces.set(code, [...(pieces.get(code) ?? []), sliceVertices(geometry, start, count)]);
    }
  });
  return new Map([...pieces].map(([code, parts]) => {
    const merged = mergeGeometries(parts)!;
    merged.applyMatrix4(LDRAW_TO_SCENE);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return [code, merged];
  }));
};

/** turns every triangle of a non-indexed geometry to face the other way */
const reverseWinding = (geometry: THREE.BufferGeometry): void => {
  for(const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
    for(let vertex=0; vertex<attribute.count; vertex+=3) {
      const [x, y, z] = [attribute.getX(vertex + 1), attribute.getY(vertex + 1), attribute.getZ(vertex + 1)];
      attribute.setXYZ(vertex + 1, attribute.getX(vertex + 2), attribute.getY(vertex + 2), attribute.getZ(vertex + 2));
      attribute.setXYZ(vertex + 2, x, y, z);
    }
  }
};

/** a run of a non-indexed geometry's vertices as its own geometry */
const sliceVertices = (geometry: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry => {
  const slice = new THREE.BufferGeometry();
  for(const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
    slice.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(start * attribute.itemSize, (start + count) * attribute.itemSize), attribute.itemSize));
  }
  return slice;
};

// == Util ========================================================================
/** the pixels drawn per CSS pixel on this screen, at most 2 */
const screenPixelRatio = (): number => Math.min(window.devicePixelRatio || 1, 2);
/** a stage's point in the scene */
const scenePoint = (point: Point): THREE.Vector3 => new THREE.Vector3(...ldrawPoint(point)).applyMatrix4(LDRAW_TO_SCENE);
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const isStanding = (walk: Walk): boolean => (walk.forward === 0) && (walk.right === 0) && (walk.up === 0) && (walk.turn === 0);
const lerp = (a: number, b: number, t: number): number => a + ((b - a) * t);

/** a camera's up turned clockwise about where it looks by `roll` degrees, as seen from
 *  behind it: the world's up when it does not roll, or looks straight up or down */
const rolledUp = (position: THREE.Vector3, target: THREE.Vector3, roll: number): THREE.Vector3 => {
  if(roll === 0) return UP;
  const forward = new THREE.Vector3().subVectors(target, position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP);
  if(right.lengthSq() < 1e-12) return UP;
  right.normalize();
  const level = new THREE.Vector3().crossVectors(right, forward)/*its up, level*/;
  const angle = roll * (Math.PI / 180);
  return level.multiplyScalar(Math.cos(angle)).addScaledVector(right, Math.sin(angle));
};
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number => (t < 0.5) ? (4 * t * t * t) : (1 - (Math.pow(-2 * t + 2, 3) / 2));
const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;
/** a turn (radians) as the same turn within a half turn either way */
const wrapTurn = (radians: number): number => {
  const turn = ((((radians + Math.PI) % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2)) - Math.PI;
  return (turn === -Math.PI) ? Math.PI : turn;
};
