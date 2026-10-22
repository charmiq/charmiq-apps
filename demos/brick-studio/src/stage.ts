import { toGear, toPosing } from './build';
import { getStageFace, ALL_FACES, type CatalogPart } from './catalog';
import { occupiedCells } from './check';
import { cellsFootprint, compose, copyTransform, footprint, footprintSize, getColor, getPart, getShape, gridPosition, ldrawPosition, matrixRotation, partLines, rotationMatrix, BASEPLATE_MAX, LDU_PER_PLATE, LDU_PER_STUD, MAX_COORDINATE, type Copy, type Footprint, type Gear, type PartLine, type Placement, type Rotation, type Transform } from './grid';
import { drawnLines, parseSets, placedPartCount, sameSetName, withoutParts, type Component, type Model, MAIN_SET } from './model';
import { POSE_GEOMETRY } from './parts.generated';
import { bankOf, swingOf, turnOf, type FrameLimb, type Limb, type Pose, FRAME_LIMBS, LIMBS } from './pose';

// a stage: a scene the studio shows in place of its build while another Application
// (a film) drives it. Its sets are a build's, each shown as it is: LDraw text's, or
// the studio's own. One stands at a time, the first until a frame names another, and
// every one stands built for the stage's life. Each actor is a component, a dressed
// catalog part, or a piece standing in a set (a part or a copy, named by where it
// stands), which its set is shown without while it is cast and which a shot at its
// rest draws where it stood; an actor is drawn in whichever set stands. Each frame puts an actor anywhere: any position, any turn, a figure's limbs at any angle,
// a wheel set's wheels rolled any distance. An actor is never a placement: never on
// the grid, never checked, never written to the build. A film's frames arrive as a
// reel, read and checked page by page as they load, so a frame shown from it is data
// already known good. A view of the reel may be a plan, straight down over an area,
// which the film's marks (each path on the ground), each actor's name and the film's
// camera are drawn over in place of its fade and title. Each actor's box is told with
// the cast, so a film can measure gaps. Model-facing refusals, as the build's commands
// word theirs
// ********************************************************************************
// == Constants ===================================================================
/** the version of the stage commands (describeStage) */
export const STAGE_VERSION = 10;
/** the widest and narrowest a frame's lens opens (f-numbers) */
const MIN_APERTURE = 1;
const MAX_APERTURE = 32;

/** the most sets a stage stands */
export const MAX_STAGED_SETS = 8;

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
/** a plan's marks: the most paths, points in a path and points in all */
export const MAX_PATHS = 256;
export const MAX_PATH_POINTS = 7_200;
export const MAX_MARK_POINTS = 50_000;
/** the longest mark label */
const MAX_LABEL = 40/*characters*/;
/** the most frames a storyboard shows, and its longest caption */
export const MAX_BOARD = 12;
const MAX_CAPTION = 80/*characters*/;

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
export type Shot = Readonly<{ name: string; position: Point; turn: Turn; pose?: Pose; face?: string; hands?: Hands; rolled: number; }>;
/** what a frame puts in a figure's hands in place of what it holds as dressed: an
 *  accessory, or nothing (`null`); a hand not named holds what it holds */
export type Hands = Readonly<Partial<Record<'rightHand' | 'leftHand', Gear | null>>>;

/** the camera of one frame: where it stands, the point it looks at, its vertical
 *  field of view (degrees), its roll, what it focuses on (a point, or studs ahead
 *  along its view; its target when left out) and its aperture (an f-number: a depth of
 *  field at every look, the look's own when left out) */
export type StageCamera = Readonly<{ position: Point; target: Point; fov: number; roll?: number; focus?: Point | number; aperture?: number; }>;

/** the area the baseplate covers at least (studs): its south-west corner and size */
export type Floor = Readonly<{ x: number; z: number; width: number; depth: number; }>;
/** an area of the scene in whole studs: its south-west corner and size */
export type Area = Readonly<{ x: number; z: number; width: number; depth: number; }>;

/** a plan: straight down over at least an area, north up */
export type PlanCamera = Readonly<{ plan: Area; }>;
/** the camera a screen sees a frame through: a camera, or a plan */
export type ViewCamera = StageCamera | PlanCamera;

/** a point on the ground: x east and z north in studs */
export type GroundPoint = Readonly<{ x: number; z: number; }>;
/** what a plan draws over the set: each path labeled and colored (#rrggbb), dashed
 *  where it stands for something hidden */
export type Marks = Readonly<{ paths: ReadonlyArray<Readonly<{ label: string; color: string; dashed?: boolean; points: ReadonlyArray<GroundPoint>; }>>; }>;
/** what a frame seen through a plan draws over its picture: the marks' paths, each
 *  actor's name where it stands, and the film's camera, whose picture is `aspect`
 *  wide for each unit high */
export type PlanPicture = Readonly<{ area: Area; paths: Marks['paths']; labels: ReadonlyArray<Readonly<{ text: string; x: number; z: number; }>>; camera: StageCamera; aspect: number; }>;

/** an actor's box: studs across (x) and along (z), plates up, unturned and unposed */
export type Size = Readonly<{ width: number; depth: number; height: number; }>;

/** words over a frame: a card filling it or a caption along its foot, drawn at
 *  `opacity` (0 to 1) */
export type Title = Readonly<{ text: string; style: 'card' | 'caption'; opacity: number; }>;
/** what lies over a frame's picture: the shot it leaves in a transition (SEE:
 *  Transition), its fade (0 none, 1 the whole picture its color, black unless named;
 *  closing in from the frame's edge as an iris), and its title, standing over the fade;
 *  a frame seen through a plan has its plan's marks in their place */
export type FilmOverlay = Readonly<{ transition?: Transition; fade: number; fadeColor?: string; fadeShape?: 'iris'; title?: Title; plan?: PlanPicture; }>;
/** how much of the shot a frame leaves still shows over the shot it enters (`left`,
 *  1 all of it, 0 none), and how it gives way: all of it fading (a dissolve), an edge
 *  moving across the frame toward a side (a wipe), or a circle opening from the middle
 *  (an iris) */
export type Transition = Readonly<{ left: number; shape: TransitionShape; }>;
export type TransitionShape = 'dissolve' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'iris';
const TRANSITION_SHAPES: ReadonlyArray<TransitionShape> = ['dissolve', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'iris'];
/** the shot a frame leaves in a transition: its camera, the set it stands on (an index
 *  into the cast's sets), and, standing another set than the frame's, its actors as
 *  they stood leaving it (so its picture is the frame's own however it is reached) */
export type Leaving = Readonly<{ camera: StageCamera; set: number; shots?: ReadonlyArray<Shot>; }>;

/** a reel's frames a second, its length in frames and the size its frames are drawn
 *  at (pixels): the film's shape */
export type ReelHeader = Readonly<{ fps: number; length: number; width: number; height: number; }>;
/** a reel's frame as one screen shows it: its shots, the camera the screen sees it
 *  through (its view's, else the main camera), the film's main camera and every view,
 *  and what lies over it */
export type ReelFrame = Readonly<{ set: number/*an index into the cast's sets*/; shots: ReadonlyArray<Shot>; camera: ViewCamera; main: StageCamera; views: ReadonlyMap<string, ViewCamera>; overlay: FilmOverlay; leaving?: Leaving; }>;

/** a frame on a storyboard, and what its caption says */
export type Board = Readonly<{ frame: number; caption: string; }>;

/** an actor: the point of its own frame (LDU) a shot's position names, its box,
 *  whether it poses or rolls, and its lines in its own frame */
type Actor = Readonly<{
  anchor: readonly [number, number, number];
  size: Size;
  poses: boolean;
  /** it clicks onto studs: a figure or a creature (on studs it stands on them, a stud
   *  at a time) */
  clicks: boolean;
  /** it wears a face, which a frame may change: a figure */
  faces: boolean;
  rolls: boolean;
  /** how many parts it is, as a set counts them */
  parts: number;
  /** it holds things in its hands, which a frame may change: a figure */
  holds: boolean;
  lines: (pose: Pose | undefined, rolled: number, face?: string, hands?: Hands) => PartLine[];
}>;

/** where a placed actor's piece stands in the set, and a figure's pose there: a shot of
 *  it there draws the piece as the set does */
export type Rest = Readonly<{ position: Point; turn: Turn; pose?: Pose; }>;

/** a set a stage stands: its name, the set, and the set as it is shown, the pieces
 *  cast from it gone */
export type StagedSet = Readonly<{ name: string; set: Model; shown: Model; }>;
/** a stage's sets and its actors, by name, each cast from a piece of a set at its
 *  rest */
export type Cast = Readonly<{ sets: ReadonlyArray<StagedSet>; actors: ReadonlyMap<string, Actor>; placed: ReadonlyMap<string, Rest>; }>;

/** an actor a stage refused, and why */
export type Refusal = Readonly<{ name: string; reason: string; }>;

// == Stage =======================================================================
// the stage call: its set, the area its baseplate covers and its cast

/** the sets a stage call stands: of LDraw text standing for the build (`ldraw`),
 *  else of the build's own (`build`), by the names `names` gives, the first set alone
 *  when it gives none */
export const setsOf = (ldraw: unknown, names: unknown, build: () => ReadonlyArray<Model>): ReadonlyArray<Model> => {
  if((ldraw !== undefined) && (typeof ldraw !== 'string')) throw new Error('ldraw is LDraw text standing for the build (leave it out to stage the build)');
  const all = (ldraw === undefined) ? build() : parseSets(ldraw);
  if(names === undefined) return [all[0]];
  const named = all.map(model => model.set ?? MAIN_SET);
  if(!Array.isArray(names) || (names.length < 1) || (names.length > MAX_STAGED_SETS) || !names.every(isName)) throw new Error(`sets names 1 to ${MAX_STAGED_SETS} of the build's sets (its sets are ${named.join(', ')})`);
  return names.map((name: string, index) => {
    if(names.slice(0, index).some(other => sameSetName(other, name))) throw new Error(`sets names ${name} twice`);
    const found = all.find(model => sameSetName(model.set ?? MAIN_SET, name));
    if(!found) throw new Error(`The build has no set named '${name}': its sets are ${named.join(', ')}.`);
    return found;
  });
};

/** the area a stage's baseplate covers at least: the floor given, and, for a stage
 *  of more than one set, every set's parts, so the baseplate stands still as a frame
 *  shows another set */
export const stageFloor = (floor: Floor | undefined, sets: ReadonlyArray<Model>): Floor | undefined => {
  if(sets.length < 2) return floor;
  const areas = [...(floor ? [floor] : []), ...sets.flatMap(set => { const cells = cellsFootprint(set.placements.flatMap(placement => occupiedCells(set, placement))); return cells ? [{ x: cells.minX, z: cells.minZ, width: cells.maxX - cells.minX, depth: cells.maxZ - cells.minZ }] : []; })]/*what each set's carriers carry included*/;
  if(areas.length < 1) return undefined;
  const [minX, minZ] = [Math.min(...areas.map(area => area.x)), Math.min(...areas.map(area => area.z))];
  const [maxX, maxZ] = [Math.max(...areas.map(area => area.x + area.width)), Math.max(...areas.map(area => area.z + area.depth))];
  return { x: minX, z: minZ, width: maxX - minX, depth: maxZ - minZ };
};

/** the staged set a call names (an index into the cast's sets): the first staged
 *  when it names none */
export const stagedSetOf = (cast: Cast, input: unknown): number => {
  if(input === undefined) return 0/*the first staged*/;
  const index = isName(input) ? cast.sets.findIndex(staged => sameSetName(staged.name, input)) : -1;
  if(index < 0) throw new Error(`set names one of the sets staged (${cast.sets.map(staged => staged.name).join(', ')})`);
  return index;
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
 *  (`{ name, component }`), a catalog part dressed as a placement is (`{ name, part,
 *  color, legColor?, face?, hat?, rightHand?, leftHand? }`), or a piece standing in the
 *  set by where it stands (`{ name, placed: { x, z, level } }`, as listPlacedParts says:
 *  a part of its own as it is dressed there, a copy as its component; with `inside`,
 *  the part of that copy standing there in its component, as listComponents lists the
 *  component's parts). A part is cast once, whole or within its copy; every actor
 *  refused names why */
export const castOf = (sets: ReadonlyArray<Model>, input: unknown): Readonly<{ cast: Cast; refused: ReadonlyArray<Refusal>; }> => {
  if(!Array.isArray(input)) throw new Error('actors lists the actors: each { name, component }, { name, part, color } or { name, placed }');
  if(input.length > MAX_ACTORS) throw new Error(`A stage casts at most ${MAX_ACTORS} actors.`);
  const actors = new Map<string, Actor>();
  const placed = new Map<string, Rest>();
  const pieces = new Map<string, string>()/*each part cast (a set's placement or other line), by the actor cast from it*/;
  const hidden = sets.map(() => ({ placements: new Set<number>(), others: new Set<number>() }))/*each set's pieces cast*/;
  const refused: Refusal[] = [];
  for(const item of input) {
    const { name } = (item ?? {}) as Record<string, unknown>;
    if(!isName(name)) { refused.push({ name: String(name), reason: `name must be 1 to ${MAX_NAME} characters` }); continue; }
    if(actors.has(name) || refused.some(refusal => refusal.name === name)) { refused.push({ name, reason: 'named twice' }); continue; }
    const fields = item as Record<string, unknown>;
    if(fields.placed === undefined) {
      const actor = actorOf(sets[0]/*every set's components are the build's*/, fields);
      if(typeof actor === 'string') refused.push({ name, reason: actor });
      else actors.set(name, actor);
      continue;
    } /* else -- a piece of the set */

    const at = placedSet(sets, fields.placed);
    if(typeof at === 'string') { refused.push({ name, reason: at }); continue; }
    const piece = pieceOf(sets[at], fields);
    if(typeof piece === 'string') { refused.push({ name, reason: piece }); continue; }
    const keys = [...piece.placements.map(index => `${at} part ${index}`), ...piece.others.map(index => `${at} other ${index}`)];
    const caster = keys.map(key => pieces.get(key)).find(each => each !== undefined);
    if(caster !== undefined) { refused.push({ name, reason: `the piece at ${piece.at} is cast already, as ${caster}` }); continue; }
    for(const key of keys) pieces.set(key, name);
    actors.set(name, piece.actor);
    placed.set(name, piece.rest);
    for(const index of piece.placements) hidden[at].placements.add(index);
    for(const index of piece.others) hidden[at].others.add(index);
  }
  const staged = sets.map((set, index) => ({
    name: set.set ?? MAIN_SET, set,
    shown: ((hidden[index].placements.size + hidden[index].others.size) > 0) ? withoutParts(set, hidden[index].placements, hidden[index].others) : set,
  }));
  return { cast: { sets: staged, actors, placed }, refused };
};

/** the staged set a placed actor names (an index into `sets`): the first staged when
 *  it names none, or why it is none staged */
const placedSet = (sets: ReadonlyArray<Model>, placed: unknown): number | string => {
  const { set } = (placed ?? {}) as Record<string, unknown>;
  if(set === undefined) return 0/*the first staged*/;
  const index = isName(set) ? sets.findIndex(each => sameSetName(each.set ?? MAIN_SET, set)) : -1;
  return (index >= 0) ? index : `placed.set names no set staged (${sets.map(each => each.set ?? MAIN_SET).join(', ')})`;
};

/** the actor an input describes, or why it is not one */
const actorOf = (set: Model, item: Record<string, unknown>): Actor | string => {
  const { component, part, color, legColor, face, hat, rightHand, leftHand } = item;
  if(component !== undefined) {
    if(part !== undefined) return 'names a component or a part, not both';
    if(face !== undefined) return 'a component wears no face: give the figures in it their faces, or cast a figure';
    const found = set.components?.find(each => each.name === component);
    if(!found?.footprint) return `unknown component '${String(component)}' (the set defines none by that name with parts)`;
    return componentActor(set, found);
  } /* else -- a part */

  const catalogPart = (typeof part === 'string') ? getPart(part) : undefined/*no part named*/;
  if(!catalogPart) return `unknown part '${String(part)}' (listParts names the catalog)`;
  if(catalogPart.hinge || catalogPart.faces) return carriesComponents(catalogPart);
  if((typeof color !== 'string') || !getColor(color)) return `unknown color '${String(color)}' (listParts names the colors)`;
  const dressing = toPosing(catalogPart, undefined/*each frame poses it*/, legColor, face, { hat, rightHand, leftHand });
  if(typeof dressing === 'string') return dressing;
  return partActor(catalogPart, { part: catalogPart.key, color, x: 0, z: 0, level: 0, rotation: 0, ...dressing });
};

/** a piece of the set cast in place: where it stands, its actor, its rest, and its
 *  parts (indices into the set's `placements` and `others`) */
type Piece = Readonly<{ at: string; actor: Actor; rest: Rest; placements: ReadonlyArray<number>; others: ReadonlyArray<number>; }>;

/** the piece of the set a placed actor names, by where it stands, or why it cannot be
 *  cast in place: nothing stands there, or its rest lies where no frame reaches */
const pieceOf = (set: Model, item: Record<string, unknown>): Piece | string => {
  const piece = pieceAt(set, item);
  if(typeof piece === 'string') return piece;
  try { toPoint(piece.rest.position, 'its rest')/*as a frame takes it*/; }
  catch { return `the piece at ${piece.at} cannot be cast in place: its middle lies past where a frame reaches (x and z within ${MAX_COORDINATE} of the origin)`; }
  return piece;
};

/** the piece of the set standing where a placed actor names, or why there is none */
const pieceAt = (set: Model, item: Record<string, unknown>): Piece | string => {
  if((item.component !== undefined) || (item.part !== undefined)) return 'names a placed piece, a component or a part: one of them';
  const { x, z, level, inside } = (item.placed ?? {}) as Record<string, unknown>;
  if(![x, z, level].every(Number.isInteger)) return 'placed is { x, z, level }: whole numbers, where listPlacedParts says the piece stands';
  const at = `x ${String(x)}, z ${String(z)}, level ${String(level)}`;
  const standsThere = (piece: Readonly<{ x: number; z: number; level: number; }>) => (piece.x === x) && (piece.z === z) && (piece.level === level);

  // a part of its own
  const own = (inside !== undefined) ? -1/*a copy's part*/ : set.placements.findIndex((placement, index) => (set.placementPlaced?.[index] === undefined) && standsThere(placement));
  if(own >= 0) return partPiece(set, own, at);
  /* else -- a copy, a copy's part, or nothing */

  const copy = (set.copies ?? []).findIndex(standsThere);
  const component = (copy >= 0) ? set.components?.find(each => each.name === set.copies![copy].component) : undefined;
  if(!component?.footprint) return `nothing stands at ${at} (listPlacedParts lists where each part and copy stands)${(inside !== undefined) ? ': inside names a part of the copy standing there' : ''}`;
  const { rotation } = set.copies![copy];
  const { placements, others } = copyParts(set, copy);
  if(inside !== undefined) return insidePiece(set, set.copies![copy], component, placements, inside, at);
  // measured from its parts as the set holds them and what their hinges and faces
  // carry (SEE: filledBy), each inherited color's part among them (its component's own
  // footprint leaves those out)
  const parts = placements.map(index => set.placements[index]);
  const measured = filledBy(set, parts);
  const [width, depth] = footprintSize(measured, rotation)/*turned back*/;
  const rest: Rest = { position: { x: (measured.minX + measured.maxX) / 2, z: (measured.minZ + measured.maxZ) / 2, height: level as number }, turn: { yaw: rotation, pitch: 0, roll: 0 } };
  return { at, actor: copyActor(set, rotation, parts, others, rest, { width, depth, height: measured.height - (level as number) }), rest, placements, others };
};

/** a part of the set cast in place (`index` into its placements), as it stands and is
 *  dressed there, or why it cannot be */
const partPiece = (set: Model, index: number, at: string): Piece | string => {
  const placement = set.placements[index];
  const catalogPart = getPart(placement.part)!/*by contract: the set's*/;
  if(catalogPart.hinge || catalogPart.faces) return carriesComponents(catalogPart);
  const shape = getShape(catalogPart);
  const [width, depth] = footprint(shape, placement.rotation);
  const standing = { ...placement, x: 0, z: 0, level: 0, rotation: 0 } as const;
  const lift = (ldrawPosition(shape, { ...standing, pose: undefined })[1] - ldrawPosition(shape, standing)[1]) / LDU_PER_PLATE/*its pose's: a posed part's level is its posed bottom*/;
  return {
    at, actor: partActor(catalogPart, standing),
    rest: { position: { x: placement.x + (width / 2), z: placement.z + (depth / 2), height: placement.level + lift }, turn: { yaw: placement.rotation, pitch: 0, roll: 0 }, ...(placement.pose ? { pose: placement.pose } : {}) },
    placements: [index], others: [],
  };
};

/** the part of a copy standing `inside` it (where it stands in its component), among
 *  the copy's `placements` as the set holds them (each in its copy's colors, a part in
 *  LDraw's inherited color among them), or why there is none */
const insidePiece = (set: Model, copy: Copy, component: Component, placements: ReadonlyArray<number>, inside: unknown, at: string): Piece | string => {
  const { x, z, level } = (inside ?? {}) as Record<string, unknown>;
  if(![x, z, level].every(Number.isInteger)) return 'placed.inside is { x, z, level }: whole numbers, where a part stands in its component (listComponents with its component lists them)';
  const within = `${at}, inside at x ${String(x)}, z ${String(z)}, level ${String(level)}`;
  const back = inverseOf(copyTransform(component.footprint!/*by contract: its copy stands*/, copy));
  const index = placements.find(each => { const where = inComponent(back, set.placements[each]); return !!where && (where.x === x) && (where.z === z) && (where.level === level); });
  if(index === undefined) return `nothing of ${component.name} stands inside at x ${String(x)}, z ${String(z)}, level ${String(level)} (listComponents with its component lists where each part stands)`;
  return partPiece(set, index, within);
};

/** where a copy's part stands in its component's grid (`back`: the copy's frame
 *  undone): its line read back there as a component's part is read, its pose's lift
 *  kept, and its turn there */
const inComponent = (back: Transform, part: Placement): Readonly<{ x: number; z: number; level: number; rotation: Rotation; }> | undefined => {
  const shape = getShape(getPart(part.part)!/*by contract: the set's*/);
  const placed = ldrawPosition(shape, part);
  const lift = part.level - gridPosition(shape, part.rotation, placed)!.level/*its pose's, which reading adds*/;
  const local = compose(back, { position: placed, matrix: rotationMatrix(part.rotation) });
  const rotation = matrixRotation(local.matrix);
  const position = (rotation !== undefined) ? gridPosition(shape, rotation, local.position) : undefined;
  return (position && (rotation !== undefined)) ? { ...position, level: position.level + lift, rotation } : undefined;
};

/** a copy's parts as the set holds them: indices into its placements and others */
const copyParts = (set: Model, copy: number): Readonly<{ placements: ReadonlyArray<number>; others: ReadonlyArray<number>; }> => {
  const lines = new Set((set.placed ?? []).flatMap((line, index) => (line.copy === copy) ? [index] : []));
  const owned = (owners: ReadonlyArray<number | undefined> | undefined) => (owners ?? []).flatMap((owner, index) => ((owner !== undefined) && lines.has(owner)) ? [index] : []);
  return { placements: owned(set.placementPlaced), others: owned(set.otherPlaced) };
};

/** a component's parts as a copy of it (`copy`, an index into the set's copies) holds
 *  them, each where it stands in the component, as a placed actor's `inside` names it
 *  (read as a cast reads it, so each address casts): a part LDraw's inherited color
 *  gives the copy's color is `inherited` */
export const insideParts = (set: Model, copy: number): ReadonlyArray<Placement | (Omit<Placement, 'color'> & Readonly<{ color: 'inherited'; }>)> => {
  const standing = set.copies![copy]/*by contract*/;
  const component = set.components!.find(each => each.name === standing.component)!/*by contract: its copy stands*/;
  const back = inverseOf(copyTransform(component.footprint!, standing));
  return copyParts(set, copy).placements.flatMap(index => {
    const placed = set.placements[index];
    const where = inComponent(back, placed);
    if(!where) return []/*off its component's grid*/;
    const own = component.placements.some(part => (part.part === placed.part) && (part.x === where.x) && (part.z === where.z) && (part.level === where.level));
    return [own ? { ...placed, ...where } : { ...placed, ...where, color: 'inherited' as const }];
  });
};

/** a copy's actor: its own parts as the set draws them (each inherited color its
 *  copy's), in the frame of its rest, which is its anchor, `size` its box */
const copyActor = (set: Model, rotation: Rotation, parts: ReadonlyArray<Placement>, others: ReadonlyArray<number>, rest: Rest, size: Size): Actor => {
  const back = inverseOf(turnedAt(rest.position, rest.turn))/*the scene's frame into its own*/;
  return {
    anchor: [0, 0, 0],
    size,
    poses: false,
    clicks: false,
    holds: false,
    faces: false,
    rolls: parts.some(placement => !!getPart(placement.part)!.wheels),
    parts: placedPartCount(set, parts) + others.length/*those the set shown leaves out, what they carry included*/,
    lines: (_, rolled) => [
      ...parts.flatMap(placement => drawnLines(set, placement, rolled * alongNorth(((placement.rotation - rotation + 360) % 360) as Rotation/*turned within the copy*/))),
      ...others.map(index => set.others[index]),
    ].map(line => ({ ...line, ...compose(back, line) })),
  };
};

/** a component's actor: a copy of it, the middle of the cells it fills (SEE:
 *  filledBy) its anchor */
const componentActor = (set: Model, component: Component): Actor => {
  const { minX, minZ, maxX, maxZ, height } = filledBy(set, component.placements);
  const parts = component.placements.map(placement => getPart(placement.part)!/*by contract*/);
  return {
    anchor: [((minX + maxX) / 2) * LDU_PER_STUD, 0, ((minZ + maxZ) / 2) * LDU_PER_STUD],
    size: { width: maxX - minX, depth: maxZ - minZ, height },
    poses: false,
    clicks: false,
    holds: false,
    faces: false,
    rolls: parts.some(each => !!each.wheels),
    parts: placedPartCount(set, component.placements) + component.others.length/*what its carriers carry included*/,
    lines: (_, rolled) => [...component.placements.flatMap(placement => drawnLines(set, placement, rolled * alongNorth(placement.rotation))), ...component.others],
  };
};

/** the cells some parts and what their hinges and faces carry fill (their footprint,
 *  when they carry none), as high as their tallest top (tires above the studs
 *  included): an actor's box, however it is cast */
const filledBy = (set: Model, parts: ReadonlyArray<Placement>): Footprint => {
  const cells = cellsFootprint(parts.flatMap(placement => occupiedCells(set, placement)))!/*an actor has parts*/;
  return { ...cells, height: Math.max(cells.height, tallestTop(parts)) };
};

/** the level the tallest of some parts reaches (tires above the studs included) */
const tallestTop = (parts: ReadonlyArray<Placement>): number => Math.max(...parts.map(placement => placement.level + getShape(getPart(placement.part)!/*by contract*/).height));

/** a catalog part's actor, `standing` as dressed at the origin unturned: a frame's pose
 *  over its own (each limb a frame names, the rest as it stands) and its face in place
 *  of its own, for that frame */
const partActor = (catalogPart: CatalogPart, standing: Placement): Actor => {
  const shape = getShape(catalogPart);
  const origin = ldrawPosition(shape, { ...standing, pose: undefined })/*as it stands unposed: a pose turns limbs about their own pivots*/;
  const colorCode = getColor(standing.color)!.code;
  return {
    anchor: [(shape.width / 2) * LDU_PER_STUD, 0, (shape.depth / 2) * LDU_PER_STUD],
    size: { ...(POSE_GEOMETRY[catalogPart.ldraw]?.body ?? { width: shape.width, depth: shape.depth })/*a figure as it measures, never its cells*/, height: shape.height },
    poses: !!catalogPart.limbs,
    clicks: !!catalogPart.limbs || (catalogPart.kind === 'creature'),
    faces: catalogPart.facePiece !== undefined,
    rolls: !!catalogPart.wheels,
    parts: 1,
    holds: !!catalogPart.slots?.rightHand,
    lines: (pose, rolled, worn, hands) => partLines(shape, holding({ ...standing, ...(pose ? { pose: { ...standing.pose, ...pose } } : {}), ...((worn !== undefined) ? { face: worn } : {}) }, hands), colorCode, origin, rolled),
  };
};

/** a placement holding what a frame's hands name in place of what it holds */
const holding = (placement: Placement, hands: Hands | undefined): Placement => {
  if(!hands) return placement;
  const { rightHand, leftHand, ...rest } = placement;
  const [right, left] = [('rightHand' in hands) ? hands.rightHand : rightHand, ('leftHand' in hands) ? hands.leftHand : leftHand];
  return { ...rest, ...(right ? { rightHand: right } : {}), ...(left ? { leftHand: left } : {}) };
};

/** the refusal of a part that carries components */
const carriesComponents = (catalogPart: CatalogPart): string => `${catalogPart.key} carries components, which an actor never does: cast the component that holds it`;

/** each cast actor's box, by name */
export const sizesOf = (cast: Cast): Readonly<Record<string, Size>> => Object.fromEntries([...cast.actors].map(([name, actor]) => [name, actor.size]));

// == Frame =======================================================================
// the frame call: each actor's shot, the camera, and the size a frame is captured at

/** the shots a frame call gives, each of a cast actor; an actor given none is
 *  hidden */
export const shotsOf = (cast: Cast, input: unknown): ReadonlyArray<Shot> => {
  if(!Array.isArray(input)) throw new Error('actors lists the actors shown: each { name, position, turn?, pose?, face?, rightHand?, leftHand?, rolled? }');
  const named = new Set<string>();
  return input.map((item, index) => {
    const { name, position, turn, pose, face, rolled, rightHand, leftHand } = (item ?? {}) as Record<string, unknown>;
    const at = `actors[${index}]`;
    if((typeof name !== 'string') || !cast.actors.has(name)) throw new Error(`${at}: no actor named '${String(name)}' is cast (stage casts them)`);
    if(named.has(name)) throw new Error(`${at}: ${name} is shown twice`);
    named.add(name);
    const actor = cast.actors.get(name)!;
    const where = toPoint(position, `${at}.position`);
    const turned = toTurn(turn, `${at}.turn`);
    if((pose !== undefined) && !actor.poses) throw new Error(`${at}: ${name} takes no pose (a figure does)`);
    if((face !== undefined) && !actor.faces) throw new Error(`${at}: ${name} wears no face (a figure does)`);
    if((face !== undefined) && !getStageFace(face)) throw new Error(`${at}.face: unknown face '${String(face)}' (one of ${ALL_FACES.map(each => each.key).join(', ')})`);
    if(((rightHand !== undefined) || (leftHand !== undefined)) && !actor.holds) throw new Error(`${at}: ${name} has no hands to hold things (a figure does)`);
    const hands = handsOf({ rightHand, leftHand }, at);
    if((rolled !== undefined) && !actor.rolls) throw new Error(`${at}: ${name} has no wheels to roll`);
    if((rolled !== undefined) && !isFiniteNumber(rolled)) throw new Error(`${at}.rolled must be a finite number of studs`);
    return { name, position: where, turn: turned, ...((pose !== undefined) ? { pose: toFreePose(pose, `${at}.pose`) } : {}), ...((face !== undefined) ? { face: face as string } : {}), ...(hands ? { hands } : {}), rolled: (rolled as number | undefined) ?? 0 };
  });
};

/** every line a frame shows of its actors, in the scene's frame (LDU) */
export const shotLines = (cast: Cast, shots: ReadonlyArray<Shot>): PartLine[] => shots.flatMap(shot => {
  const actor = cast.actors.get(shot.name)!/*by contract: shotsOf*/;
  const placed = actorTransform(actor, shot);
  return actor.lines(shot.pose, shot.rolled, shot.face, shot.hands).map(line => ({ ...line, ...compose(placed, line) }));
});

/** a frame's actors as drawn: their lines (SEE: shotLines), and how many parts they
 *  are, as a set counts them */
export type ShownActors = Readonly<{ lines: ReadonlyArray<PartLine>; parts: number; }>;
export const NO_ACTORS: ShownActors = { lines: [], parts: 0 };
export const shownActors = (cast: Cast, shots: ReadonlyArray<Shot>): ShownActors =>
  ({ lines: shotLines(cast, shots), parts: shots.reduce((total, shot) => total + cast.actors.get(shot.name)!/*by contract: shotsOf*/.parts, 0) });

/** where a shot puts an actor's frame: its anchor at the shot's position, turned
 *  about it */
const actorTransform = (actor: Actor, { position, turn }: Shot): Transform => {
  const { matrix, position: at } = turnedAt(position, turn);
  const [ax, ay, az] = actor.anchor;
  const turned = [0, 1, 2].map(row => (matrix[row * 3] * ax) + (matrix[(row * 3) + 1] * ay) + (matrix[(row * 3) + 2] * az));
  return { matrix, position: [at[0] - turned[0], at[1] - turned[1], at[2] - turned[2]] };
};

/** a frame at a point, turned about it: rolled, then pitched, then yawed */
const turnedAt = (position: Point, turn: Turn): Transform =>
  ({ matrix: compose(compose(rotation(turnOf(turn.yaw)), rotation(swingOf(turn.pitch))), rotation(bankOf(turn.roll))).matrix, position: ldrawPoint(position) });

/** a turn and a move undone: a rotation's inverse is its transpose */
const inverseOf = ({ matrix, position }: Transform): Transform => {
  const transposed = [0, 1, 2].flatMap(row => [0, 1, 2].map(column => matrix[(column * 3) + row]));
  return { matrix: transposed, position: [0, 1, 2].map(row => -((transposed[row * 3] * position[0]) + (transposed[(row * 3) + 1] * position[1]) + (transposed[(row * 3) + 2] * position[2]))) as [number, number, number] };
};

// -- Camera ----------------------------------------------------------------------
/** the camera a frame call gives */
export const cameraOf = (input: unknown): StageCamera => {
  const { position, target, fov, roll, focus, aperture } = (input ?? {}) as Record<string, unknown>;
  if((input === null) || (typeof input !== 'object')) throw new Error('camera is { position, target, fov?, roll?, focus?, aperture? }');
  const lens = (fov === undefined) ? DEFAULT_FOV : fov;
  if(!isFiniteNumber(lens) || (lens < MIN_FOV) || (lens > MAX_FOV)) throw new Error(`camera.fov must lie between ${MIN_FOV} and ${MAX_FOV} degrees`);
  if((roll !== undefined) && !isFiniteNumber(roll)) throw new Error('camera.roll is degrees, the camera turned clockwise about where it looks as seen from behind it');
  const from = toPoint(position, 'camera.position'), to = toPoint(target, 'camera.target');
  if((from.x === to.x) && (from.z === to.z) && (from.height === to.height)) throw new Error('camera.target must differ from camera.position');
  if(isFiniteNumber(focus) && (focus <= 0)) throw new Error('camera.focus as a number is studs ahead along the view, more than 0');
  const focused = ((focus === undefined) || isFiniteNumber(focus)) ? focus : toPoint(focus, 'camera.focus');
  if((aperture !== undefined) && (!isFiniteNumber(aperture) || (aperture < MIN_APERTURE) || (aperture > MAX_APERTURE))) throw new Error(`camera.aperture is an f-number from ${MIN_APERTURE} (the shallowest depth of field) to ${MAX_APERTURE}`);
  return { position: from, target: to, fov: lens, ...(roll ? { roll: roll as number } : {}), ...((focused !== undefined) ? { focus: focused } : {}), ...((aperture !== undefined) ? { aperture: aperture as number } : {}) };
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
  if(!Array.isArray(input) || (input.length < 1) || (input.length > MAX_REEL_PAGE)) throw new Error(`frames is a page of 1 to ${MAX_REEL_PAGE} frames, each { set?, actors, camera, views?, transition?, fade?, fadeColor?, fadeShape?, title? }`);
  return input.map((item, index) => {
    try { return reelFrameOf(cast, view, item); }
    catch(error) { throw new Error(`frames[${index}] (frame ${from + index}): ${(error as Error).message}`); }
  });
};

/** one frame of a reel, as the screen showing `view` shows it */
const reelFrameOf = (cast: Cast, view: string | undefined, input: unknown): ReelFrame => {
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error('a frame is { set?, actors, camera, views?, transition?, fade?, fadeColor?, fadeShape?, title? }');
  const { set, actors, camera, views, transition, fade, fadeColor, fadeShape, title } = input as Record<string, unknown>;
  const standing = stagedSetOf(cast, set);
  const shots = shotsOf(cast, actors);
  const main = cameraOf(camera);
  const named = viewsOf(views);
  if((view !== undefined) && !named.has(view)) throw new Error(`views names no '${view}', the view this studio shows`);
  const titled = titleOf(title);
  const leaving = transitionOf(cast, transition);
  if((fadeColor !== undefined) && ((typeof fadeColor !== 'string') || !/^#[0-9a-fA-F]{6}$/.test(fadeColor))) throw new Error('fadeColor is #rrggbb (black when left out)');
  if((fadeShape !== undefined) && (fadeShape !== 'iris')) throw new Error('fadeShape is iris (the whole picture when left out)');
  const overlay: FilmOverlay = {
    ...(leaving ? { transition: leaving.transition } : {}), fade: fadeOf(fade),
    ...((fadeColor !== undefined) ? { fadeColor: fadeColor as string } : {}), ...((fadeShape !== undefined) ? { fadeShape: 'iris' as const } : {}), ...(titled ? { title: titled } : {}),
  };
  return { set: standing, shots, camera: (view !== undefined) ? named.get(view)! : main, main, views: named, overlay, ...(leaving ? { leaving: leaving.leaving } : {}) };
};

/** the transition a frame gives (`{ camera, set?, left, shape }`: the shot it leaves,
 *  how much of that still shows and how it gives way), or undefined for none */
const transitionOf = (cast: Cast, input: unknown): Readonly<{ transition: Transition; leaving: Leaving; }> | undefined => {
  if(input === undefined) return undefined/*no transition*/;
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error(`transition is { camera, set?, actors?, left, shape }: the shot left, how much of it still shows (0 to 1), and one of ${TRANSITION_SHAPES.join(', ')}`);
  const { camera, set, actors, left, shape } = input as Record<string, unknown>;
  if(!isFiniteNumber(left) || (left < 0) || (left > 1)) throw new Error('transition.left is how much of the shot left still shows, 0 to 1');
  if(!TRANSITION_SHAPES.includes(shape as TransitionShape)) throw new Error(`transition.shape is one of ${TRANSITION_SHAPES.join(', ')}`);
  let seen: StageCamera;
  try { seen = cameraOf(camera); }
  catch(error) { throw new Error(`transition.${(error as Error).message}`); }
  let shots: ReadonlyArray<Shot> | undefined;
  try { shots = (actors === undefined) ? undefined : shotsOf(cast, actors); }
  catch(error) { throw new Error(`transition.${(error as Error).message}`); }
  return { transition: { left, shape: shape as TransitionShape }, leaving: { camera: seen, set: stagedSetOf(cast, set), ...(shots ? { shots } : {}) } };
};

/** the views a frame names, each a camera or a plan */
const viewsOf = (input: unknown): ReadonlyMap<string, ViewCamera> => {
  if(input === undefined) return new Map()/*the main camera alone*/;
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error('views names cameras: { [name]: { position, target, fov? } or { plan } }');
  const entries = Object.entries(input);
  if(entries.length > MAX_VIEWS) throw new Error(`views names at most ${MAX_VIEWS} cameras`);
  return new Map(entries.map(([name, value]) => {
    if(!isName(name)) throw new Error(`views: a view's name is at most ${MAX_NAME} characters`);
    try { return [name, ((typeof value === 'object') && (value !== null) && ('plan' in value)) ? { plan: planOf((value as { plan: unknown; }).plan) } : cameraOf(value)]; }
    catch(error) { throw new Error(`views.${name}: ${(error as Error).message}`); }
  }));
};

/** the area a plan shows at least */
const planOf = (input: unknown): Area => {
  const { x, z, width, depth } = (input ?? {}) as Record<string, unknown>;
  const fits = [x, z, width, depth].every(Number.isInteger) && (Math.abs(x as number) <= MAX_COORDINATE) && (Math.abs(z as number) <= MAX_COORDINATE)
    && [width, depth].every(size => ((size as number) >= 1) && ((size as number) <= (2 * MAX_COORDINATE)));
  if(!fits) throw new Error(`plan is { x, z, width, depth }: whole studs within ${MAX_COORDINATE} of the origin, its south-west corner and size, 1 to ${2 * MAX_COORDINATE} each way`);
  return { x: x as number, z: z as number, width: width as number, depth: depth as number };
};

/** whether a screen sees through a plan */
export const isPlan = (camera: ViewCamera): camera is PlanCamera => 'plan' in camera;

/** a frame as a screen draws it through `view` (its own camera when none is named):
 *  the camera, and what lies over its picture. Through a plan, the marks' paths, each
 *  actor's name where it stands and the film's camera (its picture `aspect` wide for
 *  each unit high) lie over it in place of the fade and title */
export const pictureOf = (frame: ReelFrame, view: string | undefined, marks: Marks | undefined, aspect: number): Readonly<{ camera: ViewCamera; overlay: FilmOverlay; leaving?: Leaving; }> => {
  const camera = (view === undefined) ? frame.camera : frame.views.get(view);
  if(!camera) throw new Error(`No view '${view}' in the reel: ${(frame.views.size > 0) ? `its views are ${[...frame.views.keys()].join(', ')}` : 'it has none'}.`);
  if((view === undefined) && (camera === frame.main) && frame.leaving) return { camera, overlay: frame.overlay, leaving: frame.leaving }/*the film's camera: its transition*/;
  const { transition: _left, ...overlay } = frame.overlay/*a view shows its own cuts*/;
  if(!isPlan(camera)) return { camera, overlay };
  const labels = frame.shots.map(shot => ({ text: shot.name, x: shot.position.x, z: shot.position.z }));
  return { camera, overlay: { fade: 0, plan: { area: camera.plan, paths: marks?.paths ?? [], labels, camera: frame.main, aspect } } };
};

// == Marks =======================================================================
/** the marks a stage call gives, or undefined for none */
export const marksOf = (input: unknown): Marks | undefined => {
  if(input === undefined) return undefined/*a plan draws the set alone*/;
  const { paths } = (input ?? {}) as Record<string, unknown>;
  if(!Array.isArray(paths)) throw new Error('marks is { paths }: each { label, color, dashed, points }');
  const read = paths.map((path, index) => {
    const { label, color, dashed, points } = (path ?? {}) as Record<string, unknown>;
    if(!isName(label) || (label.length > MAX_LABEL)) throw new Error(`marks.paths[${index}].label is 1 to ${MAX_LABEL} characters`);
    if((typeof color !== 'string') || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`marks.paths[${index}].color is #rrggbb`);
    if((dashed !== undefined) && (typeof dashed !== 'boolean')) throw new Error(`marks.paths[${index}].dashed is true or false`);
    const ground = Array.isArray(points) && (points.length >= 1) && (points.length <= MAX_PATH_POINTS) && points.every(point => [(point as GroundPoint | null)?.x, (point as GroundPoint | null)?.z].every(isFiniteNumber));
    if(!ground) throw new Error(`marks.paths[${index}].points is 1 to ${MAX_PATH_POINTS} points { x, z }`);
    return { label, color, ...(dashed ? { dashed } : {}), points: (points as GroundPoint[]).map(({ x, z }) => ({ x, z })) };
  });
  if((read.length > MAX_PATHS) || (read.reduce((sum, path) => sum + path.points.length, 0) > MAX_MARK_POINTS)) throw new Error(`marks holds at most ${MAX_PATHS} paths and ${MAX_MARK_POINTS} points`);
  return { paths: read };
};

// == Storyboard ==================================================================
/** the frames a storyboard call shows, each `{ frame, caption }` */
export const boardsOf = (input: unknown): ReadonlyArray<Board> => {
  const fits = Array.isArray(input) && (input.length >= 1) && (input.length <= MAX_BOARD)
    && input.every(item => Number.isInteger((item as Board | null)?.frame) && (typeof (item as Board | null)?.caption === 'string') && ((item as Board).caption.length <= MAX_CAPTION));
  if(!fits) throw new Error(`frames is 1 to ${MAX_BOARD} frames, each { frame, caption } (a caption at most ${MAX_CAPTION} characters)`);
  return (input as Board[]).map(({ frame, caption }) => ({ frame, caption }));
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
export const toPoint = (input: unknown, field: string): Point => {
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
  const limbs: ReadonlyArray<string> = [...LIMBS, ...FRAME_LIMBS];
  if((typeof input !== 'object') || (input === null) || Array.isArray(input)) throw new Error(`${field} names limbs and their angles (${limbs.join(', ')})`);
  const pose: Partial<Record<Limb | FrameLimb, number>> = {};
  for(const [limb, angle] of Object.entries(input)) {
    if(!limbs.includes(limb)) throw new Error(`${field} names no limb '${limb}' (${limbs.join(', ')})`);
    if(!isFiniteNumber(angle)) throw new Error(`${field}.${limb} must be a finite number of degrees`);
    pose[limb as Limb | FrameLimb] = angle;
  }
  return pose;
};

/** what a shot puts in a figure's hands (each `{ part, color, grip? }` a hand item,
 *  or `null` for none), or undefined when it names neither */
const handsOf = (input: Readonly<Record<'rightHand' | 'leftHand', unknown>>, field: string): Hands | undefined => {
  const named = (['rightHand', 'leftHand'] as const).filter(slot => input[slot] !== undefined);
  if(named.length < 1) return undefined;
  return Object.fromEntries(named.map(slot => {
    if(input[slot] === null) return [slot, null];
    const gear = toGear(slot, input[slot]);
    if(typeof gear === 'string') throw new Error(`${field}: ${gear}`);
    return [slot, gear];
  }));
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
