import { toPosing } from './build';
import { getFigureFace, FIGURE_FACES } from './catalog';
import { compose, getColor, getPart, getShape, ldrawPosition, partLines, BASEPLATE_MAX, LDU_PER_PLATE, LDU_PER_STUD, MAX_COORDINATE, type PartLine, type Placement, type Rotation, type Transform } from './grid';
import { drawnLines, parseModel, type Model } from './model';
import { bankOf, swingOf, turnOf, LIMBS, type Limb, type Pose } from './pose';

// a stage: a scene the studio shows in place of its build while another Application
// (a film) drives it. The set is a build, shown as it is: LDraw text, or the
// studio's own. Each actor is a component of the set or a dressed catalog part, and
// each frame puts it anywhere: any position, any turn, a figure's limbs at any angle,
// a wheel set's wheels rolled any distance. An actor is never a placement: never on
// the grid, never checked, never written to the build. A film's frames arrive as a
// reel, read and checked page by page as they load, so a frame shown from it is data
// already known good. Model-facing refusals, as the build's commands word theirs
// ********************************************************************************
// == Constants ===================================================================
/** the version of the stage commands (describeStage) */
export const STAGE_VERSION = 2;

/** the most actors a stage casts */
export const MAX_ACTORS = 64;
/** the longest actor name */
const MAX_NAME = 40;
/** how far from the baseplate a shot may put an actor or the camera, up or down */
const MAX_HEIGHT = 2_000/*plates*/;
/** the narrowest and widest lens */
const MIN_FOV = 5/*degrees*/;
const MAX_FOV = 120/*degrees*/;
/** the camera's lens when a frame names none: the studio's own */
export const DEFAULT_FOV = 32/*degrees*/;
/** the largest frame captured */
export const MAX_CAPTURE_WIDTH = 3_840/*pixels*/;
export const MAX_CAPTURE_HEIGHT = 2_160/*pixels*/;
/** the largest thumbnail, either side */
export const MAX_THUMBNAIL = 480/*pixels*/;

/** a reel's most frames a second, and its most frames: a film's two minutes at 60 */
export const MAX_REEL_FPS = 60;
export const MAX_REEL_LENGTH = 7_200/*frames*/;
/** the most frames one loadReel call carries */
export const MAX_REEL_PAGE = 240/*frames*/;
/** the most views a reel's frame names */
export const MAX_VIEWS = 8;
/** the longest title */
export const MAX_TITLE = 200/*characters*/;

// == Types =======================================================================
/** a point of the scene: x east and z north in studs, height up in plates from the
 *  baseplate's top, fractions allowed */
export type Point = Readonly<{ x: number; z: number; height: number; }>;

/** how an actor stands, in degrees: `yaw` clockwise seen from above (as a
 *  placement's rotation turns), `pitch` raising its south side (a figure's front),
 *  `roll` raising its west side. Rolled, pitched, then yawed */
export type Turn = Readonly<{ yaw: number; pitch: number; roll: number; }>;

/** where an actor stands in one frame: the middle of the bottom of its footprint at
 *  `position`, turned about that point; a figure's limbs at `pose` and the face it
 *  wears in this frame (its own when none is named); its wheel sets' wheels turned as
 *  the actor having rolled `rolled` studs along its own north, each wheel set by its
 *  share (backward turned round, none turned across) */
export type Shot = Readonly<{ name: string; position: Point; turn: Turn; pose?: Pose; face?: string; rolled: number; }>;

/** the camera of one frame: where it stands, the point it looks at (and focuses on)
 *  and its vertical field of view (degrees) */
export type StageCamera = Readonly<{ position: Point; target: Point; fov: number; }>;

/** the area the baseplate covers at least (studs): its south-west corner and size */
export type Floor = Readonly<{ x: number; z: number; width: number; depth: number; }>;

/** words over a frame: a card filling it or a caption along its foot, drawn at
 *  `opacity` (0 to 1) */
export type Title = Readonly<{ text: string; style: 'card' | 'caption'; opacity: number; }>;
/** what lies over a frame's picture: its fade to black (0 none, 1 black) and its
 *  title, standing over the black */
export type FilmOverlay = Readonly<{ fade: number; title?: Title; }>;

/** a reel's frames a second, its length in frames and the size its frames are drawn
 *  at (pixels): the film's shape */
export type ReelHeader = Readonly<{ fps: number; length: number; width: number; height: number; }>;
/** a reel's frame as one screen shows it: its shots, the camera the screen sees it
 *  through (its view's, else the main camera) and what lies over it */
export type ReelFrame = Readonly<{ shots: ReadonlyArray<Shot>; camera: StageCamera; overlay: FilmOverlay; }>;

/** an actor: the point of its own frame (LDU) a shot's position names, whether it
 *  poses or rolls, and its lines in its own frame */
type Actor = Readonly<{
  anchor: readonly [number, number, number];
  poses: boolean;
  /** it wears a face, which a frame may change: a figure */
  faces: boolean;
  rolls: boolean;
  lines: (pose: Pose | undefined, rolled: number, face?: string) => PartLine[];
}>;

/** a stage's set and its actors, by name */
export type Cast = Readonly<{ set: Model; actors: ReadonlyMap<string, Actor>; }>;

/** an actor a stage refused, and why */
export type Refusal = Readonly<{ name: string; reason: string; }>;

// == Stage =======================================================================
// the stage call: its set, the area its baseplate covers and its cast

/** the set a stage call names: its LDraw text, else the build's */
export const setOf = (text: unknown, build: Model): Model => {
  if(text === undefined) return build;
  if(typeof text !== 'string') throw new Error('set is the scene\'s LDraw text (leave it out to stage the build)');
  return parseModel(text);
};

/** the floor a stage call names, or undefined for none */
export const floorOf = (input: unknown): Floor | undefined => {
  if(input === undefined) return undefined/*the set's own baseplate*/;
  const { x, z, width, depth } = (input ?? {}) as Record<string, unknown>;
  if(![x, z, width, depth].every(Number.isInteger)) throw new Error('floor is { x, z, width, depth } in whole studs');
  if((Math.abs(x as number) > MAX_COORDINATE) || (Math.abs(z as number) > MAX_COORDINATE)) throw new Error(`floor.x and floor.z must lie within ${MAX_COORDINATE} of the origin`);
  if(((width as number) < 1) || ((depth as number) < 1) || ((width as number) > BASEPLATE_MAX) || ((depth as number) > BASEPLATE_MAX)) throw new Error(`floor.width and floor.depth must lie between 1 and ${BASEPLATE_MAX}`);
  return { x: x as number, z: z as number, width: width as number, depth: depth as number };
};

// -- Cast ------------------------------------------------------------------------
/** the actors a stage call casts from a set: each named once, a component of the set
 *  (`{ name, component }`) or a catalog part dressed as a placement is
 *  (`{ name, part, color, legColor?, face?, hat?, rightHand?, leftHand? }`); every
 *  one refused names why */
export const castOf = (set: Model, input: unknown): Readonly<{ cast: Cast; refused: ReadonlyArray<Refusal>; }> => {
  if(!Array.isArray(input)) throw new Error('actors lists the actors: each { name, component } or { name, part, color }');
  if(input.length > MAX_ACTORS) throw new Error(`A stage casts at most ${MAX_ACTORS} actors.`);
  const actors = new Map<string, Actor>();
  const refused: Refusal[] = [];
  for(const item of input) {
    const { name } = (item ?? {}) as Record<string, unknown>;
    if(!isName(name)) { refused.push({ name: String(name), reason: `name must be 1 to ${MAX_NAME} characters` }); continue; }
    if(actors.has(name) || refused.some(refusal => refusal.name === name)) { refused.push({ name, reason: 'named twice' }); continue; }
    const actor = actorOf(set, item as Record<string, unknown>);
    if(typeof actor === 'string') refused.push({ name, reason: actor });
    else actors.set(name, actor);
  }
  return { cast: { set, actors }, refused };
};

/** the actor an input describes, or why it is not one */
const actorOf = (set: Model, item: Record<string, unknown>): Actor | string => {
  const { component, part, color, legColor, face, hat, rightHand, leftHand } = item;
  if(component !== undefined) {
    if(part !== undefined) return 'names a component or a part, not both';
    if(face !== undefined) return 'a component wears no face: give the figures in it their faces, or cast a figure';
    const found = set.components?.find(each => each.name === component);
    if(!found?.footprint) return `unknown component '${String(component)}' (the set defines none by that name with parts)`;
    const { minX, minZ, maxX, maxZ } = found.footprint;
    const parts = found.placements.map(placement => getPart(placement.part)!/*by contract*/);
    return {
      anchor: [((minX + maxX) / 2) * LDU_PER_STUD, 0, ((minZ + maxZ) / 2) * LDU_PER_STUD],
      poses: false,
      faces: false,
      rolls: parts.some(each => !!each.wheels),
      lines: (_, rolled) => [...found.placements.flatMap(placement => drawnLines(set, placement, rolled * alongNorth(placement.rotation))), ...found.others],
    };
  } /* else -- a part */

  const catalogPart = (typeof part === 'string') ? getPart(part) : undefined/*no part named*/;
  if(!catalogPart) return `unknown part '${String(part)}' (listParts names the catalog)`;
  if(catalogPart.hinge || catalogPart.faces) return `${catalogPart.key} carries components, which an actor never does: cast the component that holds it`;
  if((typeof color !== 'string') || !getColor(color)) return `unknown color '${String(color)}' (listParts names the colors)`;
  const dressing = toPosing(catalogPart, undefined/*each frame poses it*/, legColor, face, { hat, rightHand, leftHand });
  if(typeof dressing === 'string') return dressing;
  const standing: Placement = { part: catalogPart.key, color, x: 0, z: 0, level: 0, rotation: 0, ...dressing };
  const shape = getShape(catalogPart);
  const origin = ldrawPosition(shape, standing)/*as it stands unposed: a pose turns limbs about their own pivots*/;
  const colorCode = getColor(color)!.code;
  return {
    anchor: [(shape.width / 2) * LDU_PER_STUD, 0, (shape.depth / 2) * LDU_PER_STUD],
    poses: !!catalogPart.limbs,
    faces: catalogPart.facePiece !== undefined,
    rolls: !!catalogPart.wheels,
    lines: (pose, rolled, worn) => partLines(shape, { ...standing, ...(pose ? { pose } : {}), ...((worn !== undefined) ? { face: worn } : {}) }, colorCode, origin, rolled),
  };
};

// == Frame =======================================================================
// the frame call: each actor's shot, the camera, and the size a frame is captured at

/** the shots a frame call gives, each of a cast actor; an actor given none is
 *  hidden */
export const shotsOf = (cast: Cast, input: unknown): ReadonlyArray<Shot> => {
  if(!Array.isArray(input)) throw new Error('actors lists the actors shown: each { name, position, turn?, pose?, face?, rolled? }');
  const named = new Set<string>();
  return input.map((item, index) => {
    const { name, position, turn, pose, face, rolled } = (item ?? {}) as Record<string, unknown>;
    const at = `actors[${index}]`;
    if((typeof name !== 'string') || !cast.actors.has(name)) throw new Error(`${at}: no actor named '${String(name)}' is cast (stage casts them)`);
    if(named.has(name)) throw new Error(`${at}: ${name} is shown twice`);
    named.add(name);
    const actor = cast.actors.get(name)!;
    const where = toPoint(position, `${at}.position`);
    const turned = toTurn(turn, `${at}.turn`);
    if((pose !== undefined) && !actor.poses) throw new Error(`${at}: ${name} takes no pose (a figure does)`);
    if((face !== undefined) && !actor.faces) throw new Error(`${at}: ${name} wears no face (a figure does)`);
    if((face !== undefined) && !getFigureFace(face)) throw new Error(`${at}.face: unknown face '${String(face)}' (one of ${FIGURE_FACES.map(each => each.key).join(', ')})`);
    if((rolled !== undefined) && !actor.rolls) throw new Error(`${at}: ${name} has no wheels to roll`);
    if((rolled !== undefined) && !isFiniteNumber(rolled)) throw new Error(`${at}.rolled must be a finite number of studs`);
    return { name, position: where, turn: turned, ...((pose !== undefined) ? { pose: toFreePose(pose, `${at}.pose`) } : {}), ...((face !== undefined) ? { face: face as string } : {}), rolled: (rolled as number | undefined) ?? 0 };
  });
};

/** every line a frame shows of its actors, in the scene's frame (LDU) */
export const shotLines = (cast: Cast, shots: ReadonlyArray<Shot>): PartLine[] => shots.flatMap(shot => {
  const actor = cast.actors.get(shot.name)!/*by contract: shotsOf*/;
  const placed = actorTransform(actor, shot);
  return actor.lines(shot.pose, shot.rolled, shot.face).map(line => ({ ...line, ...compose(placed, line) }));
});

/** where a shot puts an actor's frame: its anchor at the shot's position, turned
 *  about it */
const actorTransform = (actor: Actor, { position, turn }: Shot): Transform => {
  const matrix = compose(compose(rotation(turnOf(turn.yaw)), rotation(swingOf(turn.pitch))), rotation(bankOf(turn.roll))).matrix;
  const at = ldrawPoint(position);
  const [ax, ay, az] = actor.anchor;
  const turned = [0, 1, 2].map(row => (matrix[row * 3] * ax) + (matrix[(row * 3) + 1] * ay) + (matrix[(row * 3) + 2] * az));
  return { matrix, position: [at[0] - turned[0], at[1] - turned[1], at[2] - turned[2]] };
};

// -- Camera ----------------------------------------------------------------------
/** the camera a frame call gives */
export const cameraOf = (input: unknown): StageCamera => {
  const { position, target, fov } = (input ?? {}) as Record<string, unknown>;
  if((input === null) || (typeof input !== 'object')) throw new Error('camera is { position, target, fov? }');
  const lens = (fov === undefined) ? DEFAULT_FOV : fov;
  if(!isFiniteNumber(lens) || (lens < MIN_FOV) || (lens > MAX_FOV)) throw new Error(`camera.fov must lie between ${MIN_FOV} and ${MAX_FOV} degrees`);
  const from = toPoint(position, 'camera.position'), to = toPoint(target, 'camera.target');
  if((from.x === to.x) && (from.z === to.z) && (from.height === to.height)) throw new Error('camera.target must differ from camera.position');
  return { position: from, target: to, fov: lens };
};

// -- Capture ---------------------------------------------------------------------
/** the size a frame is captured at, or undefined for none */
export const captureOf = (input: unknown): Readonly<{ width: number; height: number; }> | undefined => {
  if(input === undefined) return undefined/*the frame shown, not captured*/;
  const { width, height } = (input ?? {}) as Record<string, unknown>;
  const fits = [width, height].every(Number.isInteger) && ((width as number) >= 1) && ((height as number) >= 1) && ((width as number) <= MAX_CAPTURE_WIDTH) && ((height as number) <= MAX_CAPTURE_HEIGHT);
  if(!fits) throw new Error(`capture is { width, height } in whole pixels, at most ${MAX_CAPTURE_WIDTH} x ${MAX_CAPTURE_HEIGHT}`);
  return { width: width as number, height: height as number };
};

// == Reel ========================================================================
// a film's frames: a header with the stage call, then pages of frames, each read as
// the screen showing `view` shows it

/** the reel header a stage call gives, or undefined for none */
export const reelHeaderOf = (input: unknown): ReelHeader | undefined => {
  if(input === undefined) return undefined/*a still, not a film*/;
  const { fps, length, width, height } = (input ?? {}) as Record<string, unknown>;
  if(!Number.isInteger(fps) || ((fps as number) < 1) || ((fps as number) > MAX_REEL_FPS)) throw new Error(`reel.fps must be a whole number of frames a second, 1 to ${MAX_REEL_FPS}`);
  if(!Number.isInteger(length) || ((length as number) < 1) || ((length as number) > MAX_REEL_LENGTH)) throw new Error(`reel.length must be a whole number of frames, 1 to ${MAX_REEL_LENGTH}`);
  let size: Readonly<{ width: number; height: number; }>;
  try { size = captureOf({ width, height })!; }
  catch { throw new Error(`reel.width and reel.height are the film's size in whole pixels, at most ${MAX_CAPTURE_WIDTH} x ${MAX_CAPTURE_HEIGHT}`); }
  return { fps: fps as number, length: length as number, ...size };
};

/** the view a stage call names for this screen, or undefined for the main camera */
export const viewOf = (input: unknown): string | undefined => {
  if(input === undefined) return undefined/*the main camera*/;
  if(!isName(input)) throw new Error(`view names one of the frames' views (at most ${MAX_NAME} characters)`);
  return input;
};

/** a page of frames a loadReel call gives, the first being frame `from`; a frame
 *  that is not one refuses the page, naming it */
export const reelPageOf = (cast: Cast, view: string | undefined, input: unknown, from: number): ReadonlyArray<ReelFrame> => {
  if(!Array.isArray(input) || (input.length < 1) || (input.length > MAX_REEL_PAGE)) throw new Error(`frames is a page of 1 to ${MAX_REEL_PAGE} frames, each { actors, camera, views?, fade?, title? }`);
  return input.map((item, index) => {
    try { return reelFrameOf(cast, view, item); }
    catch(error) { throw new Error(`frames[${index}] (frame ${from + index}): ${(error as Error).message}`); }
  });
};

/** one frame of a reel, as the screen showing `view` shows it */
const reelFrameOf = (cast: Cast, view: string | undefined, input: unknown): ReelFrame => {
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error('a frame is { actors, camera, views?, fade?, title? }');
  const { actors, camera, views, fade, title } = input as Record<string, unknown>;
  const shots = shotsOf(cast, actors);
  const main = cameraOf(camera);
  const named = viewsOf(views);
  if((view !== undefined) && !named.has(view)) throw new Error(`views names no '${view}', the view this studio shows`);
  const titled = titleOf(title);
  return { shots, camera: (view !== undefined) ? named.get(view)! : main, overlay: { fade: fadeOf(fade), ...(titled ? { title: titled } : {}) } };
};

/** the views a frame names, each a camera */
const viewsOf = (input: unknown): ReadonlyMap<string, StageCamera> => {
  if(input === undefined) return new Map()/*the main camera alone*/;
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error('views names cameras: { [name]: { position, target, fov? } }');
  const entries = Object.entries(input);
  if(entries.length > MAX_VIEWS) throw new Error(`views names at most ${MAX_VIEWS} cameras`);
  return new Map(entries.map(([name, value]) => {
    if(!isName(name)) throw new Error(`views: a view's name is at most ${MAX_NAME} characters`);
    try { return [name, cameraOf(value)]; }
    catch(error) { throw new Error(`views.${name}: ${(error as Error).message}`); }
  }));
};

/** a frame's fade to black, none when left out */
const fadeOf = (input: unknown): number => {
  if(input === undefined) return 0/*no fade*/;
  if(!isFiniteNumber(input) || (input < 0) || (input > 1)) throw new Error('fade is from 0 (none) to 1 (black)');
  return input;
};

/** a frame's title, or undefined for none */
const titleOf = (input: unknown): Title | undefined => {
  if(input === undefined) return undefined/*no title*/;
  const { text, style, opacity = 1 } = (input ?? {}) as Record<string, unknown>;
  if((typeof text !== 'string') || (text.trim().length < 1) || (text.length > MAX_TITLE)) throw new Error(`title.text is the words, at most ${MAX_TITLE} characters`);
  if((style !== 'card') && (style !== 'caption')) throw new Error('title.style is card or caption');
  if(!isFiniteNumber(opacity) || (opacity < 0) || (opacity > 1)) throw new Error('title.opacity is from 0 to 1');
  return { text, style, opacity };
};

/** the size a thumbnail is drawn at */
export const thumbnailOf = (width: unknown, height: unknown): Readonly<{ width: number; height: number; }> => {
  const fits = [width, height].every(Number.isInteger) && ((width as number) >= 1) && ((height as number) >= 1) && ((width as number) <= MAX_THUMBNAIL) && ((height as number) <= MAX_THUMBNAIL);
  if(!fits) throw new Error(`a thumbnail is width and height in whole pixels, at most ${MAX_THUMBNAIL} each`);
  return { width: width as number, height: height as number };
};

// == Inputs ======================================================================
// the values a call gives, each read or refused naming its field

/** a point an input gives, or why it is not one */
const toPoint = (input: unknown, field: string): Point => {
  const { x, z, height } = (input ?? {}) as Record<string, unknown>;
  if(![x, z, height].every(isFiniteNumber)) throw new Error(`${field} is { x, z, height }: finite numbers (studs, studs, plates)`);
  if((Math.abs(x as number) > MAX_COORDINATE) || (Math.abs(z as number) > MAX_COORDINATE)) throw new Error(`${field}: x and z must lie within ${MAX_COORDINATE} of the origin`);
  if(Math.abs(height as number) > MAX_HEIGHT) throw new Error(`${field}.height must lie within ${MAX_HEIGHT} plates of the baseplate`);
  return { x: x as number, z: z as number, height: height as number };
};

/** a turn an input gives (each angle 0 when left out) */
const toTurn = (input: unknown, field: string): Turn => {
  if(input === undefined) return { yaw: 0, pitch: 0, roll: 0 };
  const { yaw = 0, pitch = 0, roll = 0 } = (input ?? {}) as Record<string, unknown>;
  if(![yaw, pitch, roll].every(isFiniteNumber)) throw new Error(`${field} is { yaw?, pitch?, roll? }: finite numbers of degrees`);
  return { yaw: yaw as number, pitch: pitch as number, roll: roll as number };
};

/** a pose an input gives: any finite angle per limb */
const toFreePose = (input: unknown, field: string): Pose => {
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error(`${field} names limbs and their angles (${LIMBS.join(', ')})`);
  const pose: Partial<Record<Limb, number>> = {};
  for(const [limb, angle] of Object.entries(input)) {
    if(!(LIMBS as readonly string[]).includes(limb)) throw new Error(`${field} names no limb '${limb}' (${LIMBS.join(', ')})`);
    if(!isFiniteNumber(angle)) throw new Error(`${field}.${limb} must be a finite number of degrees`);
    pose[limb as Limb] = angle;
  }
  return pose;
};

const isFiniteNumber = (value: unknown): value is number => (typeof value === 'number') && Number.isFinite(value);
const isName = (value: unknown): value is string => (typeof value === 'string') && (value.trim().length > 0) && (value.length <= MAX_NAME);

// == Util ========================================================================
/** a point of the scene in LDraw's frame (LDU, y down) */
export const ldrawPoint = ({ x, z, height }: Point): [number, number, number] => [x * LDU_PER_STUD, -height * LDU_PER_PLATE, z * LDU_PER_STUD];

const rotation = (matrix: readonly number[]): Transform => ({ matrix, position: [0, 0, 0] });

/** how much of a step along an actor's north a part turned `turn` in it takes along
 *  its own north: all of it unturned, backward turned round, none across (a wheel set
 *  turned 90 skids) */
const alongNorth = (turn: Rotation): number => [1, 0, -1, 0][turn / 90];
