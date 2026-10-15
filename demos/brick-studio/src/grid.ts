import { CATALOG, COLORS, type CatalogPart } from './catalog';
import { maxOf, minOf } from './numbers';
import { COLOR_VALUES, PART_GEOMETRY, POSE_GEOMETRY } from './parts.generated';
import { pieceLines, posedPieces, LIMBS, type Pose } from './pose';

// the build grid. x runs east, z north, level up; one cell is one stud and one
// level is one plate height (a brick is three). A placement names the minimum
// corner of its footprint and its bottom level. LDraw stores the same thing as a
// transform in LDU with -y up: 20 LDU per stud, 8 per plate
// ********************************************************************************
// == Constants ===================================================================
export const LDU_PER_STUD = 20/*LDU*/;
export const LDU_PER_PLATE = 8/*LDU*/;
export const PLATES_PER_BRICK = 3;

/** how far from the origin a command places a part (its footprint may reach past) */
export const MAX_COORDINATE = 400/*studs*/;

/** the baseplate grows with the build: this far beyond it on every side, never
 *  smaller than its least size (centered on the origin while the build is empty) and
 *  never larger than every placement's reach and its margins, under the build's
 *  middle: a build wider (parts reaching past their placements, an imported model)
 *  stands past its edge */
export const BASEPLATE_MIN = 16/*studs*/;
export const BASEPLATE_MARGIN = 4/*studs*/;
export const BASEPLATE_MAX = 2 * (MAX_COORDINATE + BASEPLATE_MARGIN)/*808 studs*/;

/** how far from the origin a part is on the grid (studs, and levels): every step of
 *  its arithmetic is exact there. A cell is placed through its middle (half a stud),
 *  a part is written in LDU (20 a stud, 8 a level) and read back from it, and the
 *  check steps a level at a time; at 2^48 each of those stays a whole number of a
 *  double's units (below 2^53), so a part is read, checked and written back as it is.
 *  A part further off is read as off grid, its line kept */
export const GRID_REACH = 2 ** 48;

/** where a part line is drawn: within DRAW_REACH studs of the origin, where the
 *  GPU's 32-bit floats (a 24-bit significand) still place a vertex to 1/64 stud
 *  (2^24 / 64), and at most MAX_DRAWN_SCALE times its size, which keeps the largest
 *  catalog part (a 48-stud baseplate) within it */
export const DRAW_REACH = 2 ** 18/*262,144 studs*/;
export const MAX_DRAWN_SCALE = 4096;

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = typeof ROTATIONS[number];

// == Types =======================================================================
export type Cell = readonly [number/*x*/, number/*z*/];

// ................................................................................
/** a catalog part on the grid. A posable part (a figure) may carry a pose and its
 *  legs' color; its footprint corner stays where it stands whatever its pose, and its
 *  level is its posed bottom (a seated figure's on its seat) */
export type Placement = Readonly<{
  part: string/*catalog key*/;
  color: string/*catalog color key*/;
  x: number;
  z: number;
  level: number;
  rotation: Rotation;
  /** each limb's angle (SEE: pose.ts), none at 0; only on a posable part */
  pose?: Pose;
  /** its hips' and legs' color (catalog color key) when not the part's own; only on a
   *  posable part */
  legColor?: string;
}>;

// ................................................................................
/** the measured shape of a catalog part (SEE: parts.generated.ts) */
export type PartShape = Readonly<{
  part: CatalogPart;
  width: number;
  depth: number;
  height: number/*plates*/;
  /** the level of its top studs above its bottom, when the part reaches above them
   *  (a wheel set's tires); otherwise its height */
  top?: number;
  origin: readonly [number, number];
  /** plates from the part's bottom up to its LDraw origin (its height, for a part
   *  whose origin is on its top face) */
  base: number;
  /** a glass pane's LDU below its frame's origin (SEE: parts.generated.ts) */
  drop?: number;
  /** the side a curve descends to at rotation 0 */
  descends?: 'north' | 'south' | 'east' | 'west';
  studs: ReadonlyArray<Cell>;
  /** the cells the part fills, as [x, z, bottom, top] levels from its own bottom
   *  (top exclusive) */
  fill: ReadonlyArray<readonly [number, number, number, number]>;
}>;

// ................................................................................
/** a grid cell a placement fills, from level `bottom` up to (not including) `top` */
export type FilledCell = Readonly<{ x: number; z: number; bottom: number; top: number; }>;

// ................................................................................
/** an LDraw transform: its rotation rows (a b c / d e f / g h i) and position (LDU) */
export type Transform = Readonly<{ matrix: readonly number[]; position: readonly [number, number, number]; }>;
/** one LDraw part line: a file (its stem) in a color at a transform */
export type PartLine = Transform & Readonly<{ ldraw: string; colorCode: number; }>;

// == Catalog lookup ==============================================================
const partsByKey = new Map(CATALOG.map(part => [part.key, part]));
const partsByLDraw = new Map(CATALOG.map(part => [part.ldraw.toLowerCase(), part]));
const colorsByKey = new Map(COLORS.map(color => [color.key, color]));
const colorsByCode = new Map(COLORS.map(color => [color.code, color]));

export const getPart = (key: string): CatalogPart | undefined => partsByKey.get(key);
export const getPartByLDraw = (ldraw: string): CatalogPart | undefined => partsByLDraw.get(ldraw.toLowerCase());
export const getColor = (key: string) => colorsByKey.get(key);
export const getColorByCode = (code: number) => colorsByCode.get(code);
export const getColorValue = (code: number): string | undefined => COLOR_VALUES[code];

/** the measured shape of a catalog part */
export const getShape = (part: CatalogPart): PartShape => ({ part, ...PART_GEOMETRY[part.ldraw] });

// == Rotation ====================================================================
const isRotation = (value: number): value is Rotation => (ROTATIONS as readonly number[]).includes(value);
export const toRotation = (value: unknown): Rotation | undefined => ((typeof value === 'number') && isRotation(value)) ? value : undefined;

/** turns an offset clockwise as seen from above (north to east) */
const rotate = (dx: number, dz: number, rotation: Rotation): [number, number] => {
  switch(rotation) {
    case 0:   return [dx, dz];
    case 90:  return [dz, -dx];
    case 180: return [-dx, -dz];
    case 270: return [-dz, dx];
  }
};

/** the LDraw rotation rows (a b c / d e f / g h i) of a turn about the vertical axis */
export const rotationMatrix = (rotation: Rotation): readonly number[] => {
  const [a, g] = rotate(1, 0, rotation)/*image of +x*/;
  const [c, i] = rotate(0, 1, rotation)/*image of +z*/;
  return [a, 0, c, 0, 1, 0, g, 0, i];
};

/** the rotation an LDraw matrix is, or undefined when it is not a quarter turn about
 *  the vertical axis */
export const matrixRotation = (matrix: readonly number[]): Rotation | undefined =>
  ROTATIONS.find(rotation => rotationMatrix(rotation).every((value, index) => Math.abs(value - matrix[index]) < 1e-3));

// == Footprint ===================================================================
/** the footprint size at a rotation */
export const footprint = (shape: PartShape, rotation: Rotation): readonly [number, number] =>
  ((rotation === 90) || (rotation === 270)) ? [shape.depth, shape.width] : [shape.width, shape.depth];

/** the minimum corner of the rotated footprint relative to the part's origin */
const cornerFromOrigin = (shape: PartShape, rotation: Rotation): [number, number] => {
  const corners = [[0, 0], [shape.width, 0], [0, shape.depth], [shape.width, shape.depth]]
    .map(([u, v]) => rotate(u - shape.origin[0], v - shape.origin[1], rotation));
  return [minOf(corners.map(([x]) => x)), minOf(corners.map(([, z]) => z))];
};

/** the grid cell of a rotation-0 cell of the part */
const placeCell = (shape: PartShape, placement: Placement, cell: Cell): Cell => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, placement.rotation);
  const [dx, dz] = rotate(cell[0] + 0.5 - shape.origin[0], cell[1] + 0.5 - shape.origin[1], placement.rotation);
  return [Math.round(placement.x - cornerX + dx - 0.5), Math.round(placement.z - cornerZ + dz - 0.5)];
};

/** every grid cell the placement fills and the levels it fills there */
export const filledCells = (shape: PartShape, placement: Placement): FilledCell[] =>
  fillOf(shape, placement).map(([x, z, bottom, top]) => {
    const [gridX, gridZ] = placeCell(shape, placement, [x, z]);
    return { x: gridX, z: gridZ, bottom: placement.level + bottom, top: placement.level + top };
  });

// == Pose ========================================================================
// a standing posable part (no pose) fills its own measured fill. A pose changes only
// the cells of the limbs it turns (measured in the part's standing frame, SEE:
// POSE_GEOMETRY): each turned limb's standing cells leave that fill, keeping any the
// rest of the part fills too, and its turned cells join it, so no cell of an
// unturned limb ever moves. The part stands on its lowest point, on the nearest level
// as an assembled part does: a pose raising that point (a seated figure's legs) lifts
// it by whole levels, its lowest cells reaching down to its bottom level, where they
// hold it, and no cell reaching below it
type Fill = readonly [number, number, number, number];
/** each cell's filled levels, as ranges from bottom up to (not including) top */
type Levels = Map<string/*x,z*/, Array<[number, number]>>;

/** a posable part's fill at its placement's pose, from its posed bottom, and how far
 *  the pose raises that bottom above where the part stands (levels) */
const posed = (shape: PartShape, pose: Pose | undefined): Readonly<{ fill: ReadonlyArray<Fill>; lift: number; }> => {
  if(!pose) return { fill: shape.fill, lift: 0 }/*standing*/;
  const geometry = POSE_GEOMETRY[shape.part.ldraw]/*by contract*/;
  const turned = LIMBS.filter(limb => (pose[limb] ?? 0) !== 0);
  const kept = [geometry.core, ...LIMBS.filter(limb => !turned.includes(limb)).map(limb => geometry.limbs[limb]['0'])];
  const moved = turned.map(limb => geometry.limbs[limb][String(pose[limb])]);

  const standing = levelsOf(shape.fill);
  const left = subtract(standing, levelsOf(turned.flatMap(limb => geometry.limbs[limb]['0'].fill)));
  const shared = intersect(standing, levelsOf(kept.flatMap(body => body.fill)))/*what the rest fills as it stands*/;
  const fill = cellsOf(levelsOf([...cellsOf(left), ...cellsOf(shared), ...moved.flatMap(body => body.fill)]));

  const lift = Math.max(0, Math.round(minOf([...kept, ...moved].map(body => body.bottom))))/*the core is always among them*/;
  const lifted = fill
    .map(([x, z, bottom, top]) => [x, z, Math.max(0, bottom - lift), top - lift] as const)
    .filter(([, , bottom, top]) => top > bottom)/*clipped below its bottom*/;
  const lowest = minOf(lifted.map(([, , bottom]) => bottom));
  return { fill: lifted.map(([x, z, bottom, top]) => [x, z, (bottom === lowest) ? 0 : bottom, top] as const), lift };
};

/** cells' levels by cell, overlapping or touching ranges joined */
const levelsOf = (cells: ReadonlyArray<Fill>): Levels => {
  const levels: Levels = new Map();
  for(const [x, z, bottom, top] of cells) {
    const key = `${x},${z}`;
    if(!levels.has(key)) levels.set(key, []);
    levels.get(key)!.push([bottom, top]);
  }
  for(const [key, ranges] of levels) {
    const joined: Array<[number, number]> = [];
    for(const [bottom, top] of [...ranges].sort((a, b) => a[0] - b[0])) {
      const last = joined[joined.length - 1];
      if(last && (bottom <= last[1])) last[1] = Math.max(last[1], top);
      else joined.push([bottom, top]);
    }
    levels.set(key, joined);
  }
  return levels;
};

/** each cell's levels in `a` and not in `b` */
const subtract = (a: Levels, b: Levels): Levels => new Map([...a].map(([key, ranges]) => [key, ranges.flatMap(range =>
  (b.get(key) ?? []).reduce<Array<[number, number]>>((pieces, [bottom, top]) => pieces.flatMap(([from, to]) =>
    [...((from < Math.min(to, bottom)) ? [[from, Math.min(to, bottom)] as [number, number]] : []), ...((Math.max(from, top) < to) ? [[Math.max(from, top), to] as [number, number]] : [])]), [range]))]));

/** each cell's levels in both `a` and `b` */
const intersect = (a: Levels, b: Levels): Levels => new Map([...a].map(([key, ranges]) => [key, ranges.flatMap(([from, to]) =>
  (b.get(key) ?? []).flatMap(([bottom, top]) => (Math.max(from, bottom) < Math.min(to, top)) ? [[Math.max(from, bottom), Math.min(to, top)] as [number, number]] : []))]));

const cellsOf = (levels: Levels): Fill[] => [...levels].flatMap(([key, ranges]) => {
  const [x, z] = key.split(',').map(Number);
  return ranges.map(([bottom, top]) => [x, z, bottom, top] as const);
});

/** the cells a placement's part fills from its bottom: a posable part's at its pose */
const fillOf = (shape: PartShape, placement: Placement): ReadonlyArray<Fill> =>
  shape.part.limbs ? posed(shape, placement.pose).fill : shape.fill;

/** plates from a placement's bottom up to its part's LDraw origin: less a pose's lift */
const baseOf = (shape: PartShape, placement: Placement): number =>
  shape.part.limbs ? (shape.base - posed(shape, placement.pose).lift) : shape.base;

/** how far a pose raises a posable part's bottom above where it stands (levels) */
export const poseLift = (part: CatalogPart, pose: Pose | undefined): number => part.limbs ? posed(getShape(part), pose).lift : 0;

/** every cell holding one of the placement's top studs */
export const studCells = (shape: PartShape, placement: Placement): Cell[] =>
  shape.studs.map(cell => placeCell(shape, placement, cell));

/** whether a placement, and every cell it fills, lies within GRID_REACH of the origin
 *  on every axis: there its arithmetic is exact (SEE: GRID_REACH). A pane fills no
 *  cell, so its own position is judged too */
export const onSafeGrid = (shape: PartShape, placement: Placement): boolean => {
  const within = (value: number) => Math.abs(value) <= GRID_REACH;
  return [placement.x, placement.z, placement.level].every(within) &&
    filledCells(shape, placement).every(({ x, z, bottom, top }) => [x, z, bottom, top].every(within));
};

// == LDraw transform =============================================================
/** the LDraw position (LDU) of a placement's origin */
export const ldrawPosition = (shape: PartShape, placement: Placement): readonly [number, number, number] => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, placement.rotation);
  return [
    (placement.x - cornerX) * LDU_PER_STUD,
    (-(placement.level + baseOf(shape, placement)) * LDU_PER_PLATE) + (shape.drop ?? 0),
    (placement.z - cornerZ) * LDU_PER_STUD,
  ];
};

/** the grid corner and level of an LDraw position, or undefined when off the grid. A
 *  posable part's level is where it stands; its pose's lift is added once read */
export const gridPosition = (shape: PartShape, rotation: Rotation, position: readonly [number, number, number]): Readonly<{ x: number; z: number; level: number; }> | undefined => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, rotation);
  const x = (position[0] / LDU_PER_STUD) + cornerX;
  const z = (position[2] / LDU_PER_STUD) + cornerZ;
  const level = (-(position[1] - (shape.drop ?? 0)) / LDU_PER_PLATE) - shape.base;
  if(!isWhole(x) || !isWhole(z) || !isWhole(level)) return undefined;
  return { x: Math.round(x), z: Math.round(z), level: Math.round(level) };
};

/** the part lines a placement is written as: its own, then its pieces' (SEE:
 *  CatalogPart#pieces) turned and moved with it, a posable part's at its pose and its
 *  legs in their color. A piece in LDraw's inherited color takes the placement's */
export const placedLines = (shape: PartShape, placement: Placement, colorCode: number): PartLine[] => {
  const own: PartLine = { ldraw: shape.part.ldraw, colorCode, position: ldrawPosition(shape, placement), matrix: rotationMatrix(placement.rotation) };
  const legs = (placement.legColor === undefined) ? undefined : getColor(placement.legColor)?.code;
  const pieces = shape.part.limbs ? posedPieces(shape.part, placement.pose, legs) : piecesOf(shape.part);
  return [own, ...pieces.map(piece => ({ ...piece, ...compose(own, piece), colorCode: (piece.colorCode === INHERITED_COLOR) ? colorCode : piece.colorCode }))];
};

/** LDraw's inherited color: a piece written in it takes its part's color */
export const INHERITED_COLOR = 16;

/** composes a child transform into its parent's */
export const compose = (parent: Transform, child: Transform): Transform => {
  const p = parent.matrix, c = child.matrix;
  const matrix = [0, 1, 2].flatMap(row => [0, 1, 2].map(col => (p[row*3] * c[col]) + (p[row*3 + 1] * c[3 + col]) + (p[row*3 + 2] * c[6 + col])));
  const position = [0, 1, 2].map(row => (p[row*3] * child.position[0]) + (p[row*3 + 1] * child.position[1]) + (p[row*3 + 2] * child.position[2]) + parent.position[row]) as [number, number, number];
  return { matrix, position };
};

/** the LDraw files (stems) a part is drawn from: its own and its pieces' */
export const partFiles = (part: CatalogPart): string[] => [part.ldraw, ...piecesOf(part).map(piece => piece.ldraw)];

// --------------------------------------------------------------------------------
const pieces = new Map<string, ReadonlyArray<PartLine>>();
/** a part's pieces as part lines (the catalog writes them as LDraw text) */
const piecesOf = (part: CatalogPart): ReadonlyArray<PartLine> => {
  let lines = pieces.get(part.key);
  if(!lines) {
    lines = pieceLines(part);
    pieces.set(part.key, lines);
  } /* else -- read once */
  return lines;
};

// == Components ================================================================
// a component is a group of parts in its own grid, placed as a unit: a copy names
// where the component's footprint goes and how it turns, as a part does. Its LDraw
// line moves the component's own grid: turned about its origin, its footprint's
// south-west corner at the copy's x and z, its level 0 at the copy's level

/** the cells a group of parts covers: from the minimum corner up to (not including)
 *  the maximum, at rotation 0 in the group's own grid */
export type Footprint = Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number; height: number/*levels from 0*/; }>;

/** where a copy of a component stands */
export type Copy = Readonly<{ component: string; x: number; z: number; level: number; rotation: Rotation; }>;

/** the footprint of a group of parts, or undefined for none */
export const footprintOf = (placements: ReadonlyArray<Placement>): Footprint | undefined => {
  const cells = placements.flatMap(placement => filledCells(getShape(getPart(placement.part)!/*by contract*/), placement));
  if(cells.length < 1) return undefined;
  return {
    minX: minOf(cells.map(cell => cell.x)), minZ: minOf(cells.map(cell => cell.z)),
    maxX: maxOf(cells.map(cell => cell.x)) + 1, maxZ: maxOf(cells.map(cell => cell.z)) + 1,
    height: maxOf(cells.map(cell => cell.top), 0),
  };
};

/** the footprint's size at a rotation (width along x, depth along z) */
export const footprintSize = (footprint: Footprint, rotation: Rotation): readonly [number, number] => {
  const [width, depth] = [footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ];
  return ((rotation === 90) || (rotation === 270)) ? [depth, width] : [width, depth];
};

/** the south-west corner of the footprint turned about the component's origin */
const turnedCorner = (footprint: Footprint, rotation: Rotation): [number, number] => {
  const corners = [[footprint.minX, footprint.minZ], [footprint.maxX, footprint.minZ], [footprint.minX, footprint.maxZ], [footprint.maxX, footprint.maxZ]]
    .map(([x, z]) => rotate(x, z, rotation));
  return [minOf(corners.map(([x]) => x)), minOf(corners.map(([, z]) => z))];
};

/** the LDraw transform of a copy */
export const copyTransform = (footprint: Footprint, copy: Copy): Transform => {
  const [cornerX, cornerZ] = turnedCorner(footprint, copy.rotation);
  return {
    matrix: rotationMatrix(copy.rotation),
    position: [(copy.x - cornerX) * LDU_PER_STUD, -copy.level * LDU_PER_PLATE, (copy.z - cornerZ) * LDU_PER_STUD],
  };
};

/** where a copy stands, from its LDraw transform, or undefined when it is not a
 *  quarter turn on the grid */
export const copyPosition = (footprint: Footprint, component: string, transform: Transform): Copy | undefined => {
  const rotation = matrixRotation(transform.matrix);
  if(rotation === undefined) return undefined;
  const [cornerX, cornerZ] = turnedCorner(footprint, rotation);
  const x = (transform.position[0] / LDU_PER_STUD) + cornerX;
  const z = (transform.position[2] / LDU_PER_STUD) + cornerZ;
  const level = 0 - (transform.position[1] / LDU_PER_PLATE)/*never -0 on the ground*/;
  if(!isWhole(x) || !isWhole(z) || !isWhole(level)) return undefined;
  return { component, x: Math.round(x), z: Math.round(z), level: Math.round(level), rotation };
};

// == Frames ======================================================================
/** a part at a placement's position: a glass pane names its frame's LDraw file
 *  here, and the pane sits in the frame placed under the same key */
export const frameKey = (ldraw: string, placement: Placement): string =>
  `${ldraw}@${cellKey(placement.x, placement.z, placement.level)}/${placement.rotation}`;

// == Drawing =====================================================================
/** whether a part line can be drawn (SEE: DRAW_REACH): every number finite, its
 *  position within the reach and its matrix at most MAX_DRAWN_SCALE */
export const isDrawable = (line: PartLine): boolean =>
  [...line.position, ...line.matrix].every(Number.isFinite) &&
  line.position.every(value => Math.abs(value) <= (DRAW_REACH * LDU_PER_STUD)) &&
  line.matrix.every(value => Math.abs(value) <= MAX_DRAWN_SCALE);

/** the baseplate under a build's drawn bounds (studs; none for an empty build): the
 *  bounds and BASEPLATE_MARGIN on every side, an even number of studs from
 *  BASEPLATE_MIN to BASEPLATE_MAX a side, centered on the bounds; `partial` when the
 *  build reaches past it */
export const baseplateArea = (bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number; }> | undefined): Readonly<{ minX: number; minZ: number; width: number; depth: number; partial: boolean; }> => {
  if(!bounds) return { minX: -BASEPLATE_MIN / 2, minZ: -BASEPLATE_MIN / 2, width: BASEPLATE_MIN, depth: BASEPLATE_MIN, partial: false };
  const side = (min: number, max: number) => {
    const size = Math.min(BASEPLATE_MAX, Math.max(BASEPLATE_MIN, Math.ceil((max - min + (BASEPLATE_MARGIN * 2)) / 2) * 2));
    const from = Math.round(((min + max) / 2) - (size / 2));
    return { from, size, partial: (min < from) || (max > (from + size))/*the build itself past the plate, not its margin*/ };
  };
  const [x, z] = [side(bounds.minX, bounds.maxX), side(bounds.minZ, bounds.maxZ)];
  return { minX: x.from, minZ: z.from, width: x.size, depth: z.size, partial: x.partial || z.partial };
};

// == Util ========================================================================
const isWhole = (value: number): boolean => Math.abs(value - Math.round(value)) < 1e-3;
export const cellKey = (x: number, z: number, level: number): string => `${x},${z},${level}`;
