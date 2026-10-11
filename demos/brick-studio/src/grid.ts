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
  origin: readonly [number, number];
  studs: ReadonlyArray<Cell>;
}>;

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

/** every cell the placement covers */
export const footprintCells = (shape: PartShape, placement: Placement): Cell[] => {
  const cells: Cell[] = [];
  for(let z=0; z<shape.depth; z++) for(let x=0; x<shape.width; x++) cells.push(placeCell(shape, placement, [x, z]));
  return cells;
};

/** every cell holding one of the placement's top studs */
export const studCells = (shape: PartShape, placement: Placement): Cell[] =>
  shape.studs.map(cell => placeCell(shape, placement, cell));

// == LDraw transform =============================================================
/** the LDraw position (LDU) of a placement's origin */
export const ldrawPosition = (shape: PartShape, placement: Placement): readonly [number, number, number] => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, placement.rotation);
  return [
    (placement.x - cornerX) * LDU_PER_STUD,
    -(placement.level + shape.height) * LDU_PER_PLATE/*the origin is on the top face*/,
    (placement.z - cornerZ) * LDU_PER_STUD,
  ];
};

/** the grid corner and level of an LDraw position, or undefined when off the grid */
export const gridPosition = (shape: PartShape, rotation: Rotation, position: readonly [number, number, number]): Readonly<{ x: number; z: number; level: number; }> | undefined => {
  const [cornerX, cornerZ] = cornerFromOrigin(shape, rotation);
  const x = (position[0] / LDU_PER_STUD) + cornerX;
  const z = (position[2] / LDU_PER_STUD) + cornerZ;
  const level = (-position[1] / LDU_PER_PLATE) - shape.height;
  if(!isWhole(x) || !isWhole(z) || !isWhole(level)) return undefined;
  return { x: Math.round(x), z: Math.round(z), level: Math.round(level) };
};

// == Util ========================================================================
const isWhole = (value: number): boolean => Math.abs(value - Math.round(value)) < 1e-3;
export const cellKey = (x: number, z: number, level: number): string => `${x},${z},${level}`;
