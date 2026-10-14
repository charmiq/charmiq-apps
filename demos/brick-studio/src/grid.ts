import { CATALOG, COLORS, type CatalogPart } from './catalog';
import { COLOR_VALUES, PART_GEOMETRY } from './parts.generated';

// the build grid. x runs east, z north, level up; one cell is one stud and one
// level is one plate height (a brick is three). A placement names the minimum
// corner of its footprint and its bottom level. LDraw stores the same thing as a
// transform in LDU with -y up: 20 LDU per stud, 8 per plate
// ********************************************************************************
// == Constants ===================================================================
export const LDU_PER_STUD = 20/*LDU*/;
export const LDU_PER_PLATE = 8/*LDU*/;
export const PLATES_PER_BRICK = 3;

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = typeof ROTATIONS[number];

// == Types =======================================================================
export type Cell = readonly [number/*x*/, number/*z*/];

// ................................................................................
/** a catalog part on the grid */
export type Placement = Readonly<{
  part: string/*catalog key*/;
  color: string/*catalog color key*/;
  x: number;
  z: number;
  level: number;
  rotation: Rotation;
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
  return [Math.min(...corners.map(([x]) => x)), Math.min(...corners.map(([, z]) => z))];
};

/** the grid cell of a rotation-0 cell of the part */
const placeCell = (shape: PartShape, placement: Placement, cell: Cell): Cell => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, placement.rotation);
  const [dx, dz] = rotate(cell[0] + 0.5 - shape.origin[0], cell[1] + 0.5 - shape.origin[1], placement.rotation);
  return [Math.round(placement.x - cornerX + dx - 0.5), Math.round(placement.z - cornerZ + dz - 0.5)];
};

/** every grid cell the placement fills and the levels it fills there */
export const filledCells = (shape: PartShape, placement: Placement): FilledCell[] =>
  shape.fill.map(([x, z, bottom, top]) => {
    const [gridX, gridZ] = placeCell(shape, placement, [x, z]);
    return { x: gridX, z: gridZ, bottom: placement.level + bottom, top: placement.level + top };
  });

/** every cell holding one of the placement's top studs */
export const studCells = (shape: PartShape, placement: Placement): Cell[] =>
  shape.studs.map(cell => placeCell(shape, placement, cell));

// == LDraw transform =============================================================
/** the LDraw position (LDU) of a placement's origin */
export const ldrawPosition = (shape: PartShape, placement: Placement): readonly [number, number, number] => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, placement.rotation);
  return [
    (placement.x - cornerX) * LDU_PER_STUD,
    (-(placement.level + shape.base) * LDU_PER_PLATE) + (shape.drop ?? 0),
    (placement.z - cornerZ) * LDU_PER_STUD,
  ];
};

/** the grid corner and level of an LDraw position, or undefined when off the grid */
export const gridPosition = (shape: PartShape, rotation: Rotation, position: readonly [number, number, number]): Readonly<{ x: number; z: number; level: number; }> | undefined => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, rotation);
  const x = (position[0] / LDU_PER_STUD) + cornerX;
  const z = (position[2] / LDU_PER_STUD) + cornerZ;
  const level = (-(position[1] - (shape.drop ?? 0)) / LDU_PER_PLATE) - shape.base;
  if(!isWhole(x) || !isWhole(z) || !isWhole(level)) return undefined;
  return { x: Math.round(x), z: Math.round(z), level: Math.round(level) };
};

/** the part lines a placement is written as: its own, then its pieces' (SEE:
 *  CatalogPart#pieces) turned and moved with it. A piece in LDraw's inherited color
 *  takes the placement's */
export const placedLines = (shape: PartShape, placement: Placement, colorCode: number): PartLine[] => {
  const own: PartLine = { ldraw: shape.part.ldraw, colorCode, position: ldrawPosition(shape, placement), matrix: rotationMatrix(placement.rotation) };
  return [own, ...piecesOf(shape.part).map(piece => ({ ...piece, ...compose(own, piece), colorCode: (piece.colorCode === INHERITED_COLOR) ? colorCode : piece.colorCode }))];
};

/** LDraw's inherited color: a piece written in it takes its part's color */
const INHERITED_COLOR = 16;

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
const pieceLines = new Map<string, ReadonlyArray<PartLine>>();
/** a part's pieces as part lines (the catalog writes them as LDraw text) */
const piecesOf = (part: CatalogPart): ReadonlyArray<PartLine> => {
  let pieces = pieceLines.get(part.key);
  if(!pieces) {
    pieces = (part.pieces ?? []).map(line => {
      const fields = line.trim().split(/\s+/);
      const values = fields.slice(1, 14).map(Number);
      return { ldraw: fields[14].replace(/\.dat$/i, ''), colorCode: values[0], position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
    });
    pieceLines.set(part.key, pieces);
  } /* else -- read once */
  return pieces;
};

// == Frames ======================================================================
/** a part at a placement's position: a glass pane names its frame's LDraw file
 *  here, and the pane sits in the frame placed under the same key */
export const frameKey = (ldraw: string, placement: Placement): string =>
  `${ldraw}@${cellKey(placement.x, placement.z, placement.level)}/${placement.rotation}`;

// == Util ========================================================================
const isWhole = (value: number): boolean => Math.abs(value - Math.round(value)) < 1e-3;
export const cellKey = (x: number, z: number, level: number): string => `${x},${z},${level}`;
