import { toPosing } from './build';
import { compose, getColor, getPart, getShape, ldrawPosition, partLines, BASEPLATE_MAX, LDU_PER_PLATE, LDU_PER_STUD, MAX_COORDINATE, type PartLine, type Placement, type Transform } from './grid';
import { drawnLines, parseModel, type Model } from './model';
import { bankOf, swingOf, turnOf, LIMBS, type Limb, type Pose } from './pose';

// a stage: a scene the studio shows in place of its build while another Application
// (a film) drives it. The set is a build, shown as it is: LDraw text, or the
// studio's own. Each actor is a component of the set or a dressed catalog part, and
// each frame puts it anywhere: any position, any turn, a figure's limbs at any angle,
// a wheel set's wheels rolled any distance. An actor is never a placement: never on
// the grid, never checked, never written to the build. Model-facing refusals, as the
// build's commands word theirs
// ********************************************************************************
// == Constants ===================================================================
/** the version of the stage commands (describeStage) */
export const STAGE_VERSION = 1;

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

// == Types =======================================================================
/** a point of the scene: x east and z north in studs, height up in plates from the
 *  baseplate's top, fractions allowed */
export type Point = Readonly<{ x: number; z: number; height: number; }>;

/** how an actor stands, in degrees: `yaw` clockwise seen from above (as a
 *  placement's rotation turns), `pitch` raising its south side (a figure's front),
 *  `roll` raising its west side. Rolled, pitched, then yawed */
export type Turn = Readonly<{ yaw: number; pitch: number; roll: number; }>;

/** where an actor stands in one frame: the middle of the bottom of its footprint at
 *  `position`, turned about that point; a figure's limbs at `pose`; its wheel sets'
 *  wheels turned as having rolled `rolled` studs north */
export type Shot = Readonly<{ name: string; position: Point; turn: Turn; pose?: Pose; rolled: number; }>;

/** the camera of one frame: where it stands, the point it looks at (and focuses on)
 *  and its vertical field of view (degrees) */
export type StageCamera = Readonly<{ position: Point; target: Point; fov: number; }>;

/** the area the baseplate covers at least (studs): its south-west corner and size */
export type Floor = Readonly<{ x: number; z: number; width: number; depth: number; }>;

/** an actor: the point of its own frame (LDU) a shot's position names, whether it
 *  poses or rolls, and its lines in its own frame */
type Actor = Readonly<{
  anchor: readonly [number, number, number];
  poses: boolean;
  rolls: boolean;
  lines: (pose: Pose | undefined, rolled: number) => PartLine[];
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
 *  (`{ name, part, color, legColor?, hat?, rightHand?, leftHand? }`); every one
 *  refused names why */
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
  const { component, part, color, legColor, hat, rightHand, leftHand } = item;
  if(component !== undefined) {
    if(part !== undefined) return 'names a component or a part, not both';
    const found = set.components?.find(each => each.name === component);
    if(!found?.footprint) return `unknown component '${String(component)}' (the set defines none by that name with parts)`;
    const { minX, minZ, maxX, maxZ } = found.footprint;
    const parts = found.placements.map(placement => getPart(placement.part)!/*by contract*/);
    return {
      anchor: [((minX + maxX) / 2) * LDU_PER_STUD, 0, ((minZ + maxZ) / 2) * LDU_PER_STUD],
      poses: false,
      rolls: parts.some(each => !!each.wheels),
      lines: (_, rolled) => [...found.placements.flatMap(placement => drawnLines(set, placement, rolled)), ...found.others],
    };
  } /* else -- a part */

  const catalogPart = (typeof part === 'string') ? getPart(part) : undefined/*no part named*/;
  if(!catalogPart) return `unknown part '${String(part)}' (listParts names the catalog)`;
  if(catalogPart.hinge || catalogPart.faces) return `${catalogPart.key} carries components, which an actor never does: cast the component that holds it`;
  if((typeof color !== 'string') || !getColor(color)) return `unknown color '${String(color)}' (listParts names the colors)`;
  const dressing = toPosing(catalogPart, undefined/*each frame poses it*/, legColor, { hat, rightHand, leftHand });
  if(typeof dressing === 'string') return dressing;
  const standing: Placement = { part: catalogPart.key, color, x: 0, z: 0, level: 0, rotation: 0, ...dressing };
  const shape = getShape(catalogPart);
  const origin = ldrawPosition(shape, standing)/*as it stands unposed: a pose turns limbs about their own pivots*/;
  const colorCode = getColor(color)!.code;
  return {
    anchor: [(shape.width / 2) * LDU_PER_STUD, 0, (shape.depth / 2) * LDU_PER_STUD],
    poses: !!catalogPart.limbs,
    rolls: !!catalogPart.wheels,
    lines: (pose, rolled) => partLines(shape, { ...standing, ...(pose ? { pose } : {}) }, colorCode, origin, rolled),
  };
};

// == Frame =======================================================================
// the frame call: each actor's shot, the camera, and the size a frame is captured at

/** the shots a frame call gives, each of a cast actor; an actor given none is
 *  hidden */
export const shotsOf = (cast: Cast, input: unknown): ReadonlyArray<Shot> => {
  if(!Array.isArray(input)) throw new Error('actors lists the actors shown: each { name, position, turn?, pose?, rolled? }');
  const named = new Set<string>();
  return input.map((item, index) => {
    const { name, position, turn, pose, rolled } = (item ?? {}) as Record<string, unknown>;
    const at = `actors[${index}]`;
    if((typeof name !== 'string') || !cast.actors.has(name)) throw new Error(`${at}: no actor named '${String(name)}' is cast (stage casts them)`);
    if(named.has(name)) throw new Error(`${at}: ${name} is shown twice`);
    named.add(name);
    const actor = cast.actors.get(name)!;
    const where = toPoint(position, `${at}.position`);
    const turned = toTurn(turn, `${at}.turn`);
    if((pose !== undefined) && !actor.poses) throw new Error(`${at}: ${name} takes no pose (a figure does)`);
    if((rolled !== undefined) && !actor.rolls) throw new Error(`${at}: ${name} has no wheels to roll`);
    if((rolled !== undefined) && !isFiniteNumber(rolled)) throw new Error(`${at}.rolled must be a finite number of studs`);
    return { name, position: where, turn: turned, ...((pose !== undefined) ? { pose: toFreePose(pose, `${at}.pose`) } : {}), rolled: (rolled as number | undefined) ?? 0 };
  });
};

/** every line a frame shows of its actors, in the scene's frame (LDU) */
export const shotLines = (cast: Cast, shots: ReadonlyArray<Shot>): PartLine[] => shots.flatMap(shot => {
  const actor = cast.actors.get(shot.name)!/*by contract: shotsOf*/;
  const placed = actorTransform(actor, shot);
  return actor.lines(shot.pose, shot.rolled).map(line => ({ ...line, ...compose(placed, line) }));
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
