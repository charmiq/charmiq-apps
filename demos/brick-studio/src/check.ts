import { carriedCells, cellKey, filledCells, frameKey, getColorByCode, getPart, getShape, studCells, type Copy, type FilledCell, type Placement } from './grid';
import { carriedComponent, READ_IN_PART, type Model } from './model';

// checks a build on the grid. A part fills the cells and levels its shape measures
// (SEE: parts.generated.ts `fill`). Two parts collide when they fill the same cell
// at the same level. A part connects to a part directly above it where one of its
// top studs lies under a cell that part fills from its bottom level; a part at
// level 0 stands on the ground. A glass pane fills nothing and is held by the frame
// at its own position; two panes in one frame collide. A part with no chain of
// connections to the ground floats. A hinge's carry fills the cells its turned
// cells overlap (SEE: grid.ts Hinges) as the hinge's: it never collides with its own
// hinge, and only its hinge holds it
// ********************************************************************************
// == Types =======================================================================
export type CheckResult = Readonly<{
  parts: number;
  collisions: ReadonlyArray<Readonly<{ a: string; b: string; }>>;
  floating: ReadonlyArray<string>;
  /** part lines outside the catalog or off the grid, which the check does not see */
  unchecked: number;
  /** the build was read only in part (SEE: READ_IN_PART): the check covers what
   *  was read */
  truncated: boolean;
}>;

// == Constants ===================================================================
/** the most parts a result or a refusal names in each list (the counts stay exact) */
export const MAX_LISTED = 12;

// == Check =======================================================================
export const checkModel = (model: Model): CheckResult => {
  const { placements } = model;
  const name = (index: number): string => describeIn(model, index);

  // .. Collisions ................................................................
  const collided = new Set<string>()/*`a|b` index pair*/;
  const collisions: Array<{ a: string; b: string; }> = [];
  const collide = (other: number, index: number) => {
    const pair = `${other}|${index}`;
    if(collided.has(pair)) return;
    collided.add(pair);
    collisions.push({ a: name(other), b: name(index) });
  };
  for(const [other, index] of overlapping(placements, placement => occupiedCells(model, placement))) collide(other, index);
  const { panes, crowded } = framed(placements);
  for(const [first, index] of crowded) collide(first, index);
  // a carry's own parts, against each other in its component's grid by the same rules:
  // a definition given as text is not checked when it is written
  placements.forEach((placement, index) => {
    if(!placement.carry) return;
    const { name: component, placements: parts } = carriedComponent(model, placement);
    const inCarry = (part: number) => `${describePlacement(parts[part])} in ${component} carried by ${name(index)}`;
    const pairs = [...overlapping(parts, each => filledCells(getShape(getPart(each.part)!/*by contract*/), each)), ...framed(parts).crowded];
    for(const [other, part] of pairs) collisions.push({ a: inCarry(other), b: inCarry(part) });
  });

  // .. Connections ...............................................................
  // the placement whose bottom covers each cell at each level
  const bottoms = new Map<string, number>();
  placements.forEach((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    for(const { x, z, bottom } of filledCells(shape, placement)) {
      if(bottom === placement.level) bottoms.set(cellKey(x, z, placement.level), index)/*an open underside holds nothing*/;
    }
  });

  const neighbors = placements.map(() => new Set<number>());
  for(const [pane, frame] of panes) { neighbors[pane].add(frame); neighbors[frame].add(pane); }
  placements.forEach((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    const top = placement.level + (shape.top ?? shape.height);
    for(const [x, z] of studCells(shape, placement)) {
      const above = bottoms.get(cellKey(x, z, top));
      if((above === undefined) || (above === index)) continue;
      neighbors[index].add(above);
      neighbors[above].add(index);
    }
  });

  // reach every part from the ground
  const grounded = new Set<number>();
  const queue = placements.flatMap((placement, index) => ((placement.level === 0) && !getPart(placement.part)!.frame/*by contract*/) ? [index] : []);
  for(const index of queue) grounded.add(index);
  while(queue.length > 0) {
    const index = queue.pop()!;
    for(const next of neighbors[index]) {
      if(grounded.has(next)) continue;
      grounded.add(next);
      queue.push(next);
    }
  }
  const floating = placements.flatMap((_, index) => grounded.has(index) ? [] : [name(index)]);

  // a carry's parts count as the build's: those on its component's grid checked, the
  // rest unchecked
  const carried = placements.flatMap(placement => placement.carry ? [carriedComponent(model, placement)] : []);
  return {
    parts: placements.length + carried.reduce((total, component) => total + component.placements.length, 0), collisions, floating,
    unchecked: model.others.length + carried.reduce((total, component) => total + component.others.length, 0), truncated: !!model.truncated,
  };
};

/** each pair of placements that fill one cell at one level, once, in the order
 *  found: a placement's own cells (a carry's over its hinge's) never pair */
const overlapping = (placements: ReadonlyArray<Placement>, cellsOf: (placement: Placement) => ReadonlyArray<FilledCell>): Array<readonly [number, number]> => {
  const filled = new Map<string, number>()/*cell key -> placement index*/;
  const pairs = new Map<string, readonly [number, number]>();
  placements.forEach((placement, index) => {
    for(const { x, z, bottom, top } of cellsOf(placement)) {
      for(let level=bottom; level<top; level++) {
        const key = cellKey(x, z, level);
        const other = filled.get(key);
        if(other === undefined) filled.set(key, index);
        else if(other !== index) pairs.set(`${other}|${index}`, [other, index]);
      }
    }
  });
  return [...pairs.values()];
};

/** each pane's frame, the frame part at the pane's own position (a pane with none
 *  floats), and each pane a frame holds after its first, with that first: two panes
 *  in one frame collide */
const framed = (placements: ReadonlyArray<Placement>): Readonly<{ panes: Map<number/*pane*/, number/*frame*/>; crowded: Array<readonly [number, number]>; }> => {
  const frames = new Map<string, number>()/*frame key -> placement index*/;
  placements.forEach((placement, index) => frames.set(frameKey(getPart(placement.part)!.ldraw/*by contract*/, placement), index));
  const panes = new Map<number, number>();
  const firstPanes = new Map<number, number>()/*frame index -> its first pane*/;
  const crowded: Array<readonly [number, number]> = [];
  placements.forEach((placement, index) => {
    const frame = getPart(placement.part)!.frame/*by contract*/;
    if(frame === undefined) return/*not a pane*/;
    const holder = frames.get(frameKey(frame, placement));
    if(holder === undefined) return/*no frame here: it floats*/;
    panes.set(index, holder);
    const first = firstPanes.get(holder);
    if(first === undefined) firstPanes.set(holder, index);
    else crowded.push([first, index]);
  });
  return { panes, crowded };
};

/** the cells a placement takes in a build: its part's, and a hinge's carry's (SEE:
 *  grid.ts carriedCells), which may share cells with its hinge */
export const occupiedCells = (model: Model, placement: Placement): FilledCell[] => {
  const shape = getShape(getPart(placement.part)!/*by contract*/);
  const own = filledCells(shape, placement);
  return placement.carry ? [...own, ...carriedCells(shape, placement, carriedComponent(model, placement))] : own;
};

// == Summary =====================================================================
/** whether a build passes the check */
export const isSound = (result: CheckResult): boolean => !result.truncated && (result.collisions.length < 1) && (result.floating.length < 1);

/** the result as model-facing data: exact counts with bounded lists */
export const reportCheck = (result: CheckResult) => ({
  ok: isSound(result),
  parts: result.parts,
  collisions: result.collisions.length,
  ...((result.collisions.length > 0) ? { collidingPairs: result.collisions.slice(0, MAX_LISTED) } : {}),
  floating: result.floating.length,
  ...((result.floating.length > 0) ? { floatingParts: result.floating.slice(0, MAX_LISTED) } : {}),
  ...((result.unchecked > 0) ? { unchecked: result.unchecked } : {}),
  ...(result.truncated ? { truncated: TRUNCATED } : {}),
});

/** what a build read only in part means, model-facing */
export const TRUNCATED = `${READ_IN_PART} This covers that part alone.`;

/** a model's placement in one line, naming the line placing it in a component */
export const describeIn = (model: Model, index: number): string => {
  const owner = model.placementPlaced?.[index];
  const placement = describePlacement(model.placements[index]);
  return (owner === undefined) ? placement : `${placement} in ${describePlaced(model, owner)}`;
};

/** a line of the main model placing a component, in one line: a copy as a copy
 *  (SEE: describeCopy), any other line by its component and color, e.g. `post red,
 *  placed by a line of the main model` */
export const describePlaced = (model: Model, index: number): string => {
  const { component, colorCode, copy } = model.placed![index]/*by contract*/;
  if(copy !== undefined) return describeCopy(model.copies![copy]/*by contract*/);
  const color = getColorByCode(colorCode)?.key;
  return `${component}${color ? ` ${color}` : ''}, placed by a line of the main model`;
};

/** a copy in one line, e.g. `tower at x 0 z 0 level 0 rotation 90` */
export const describeCopy = (copy: Copy): string =>
  `${copy.component} at x ${copy.x} z ${copy.z} level ${copy.level}` + ((copy.rotation !== 0) ? ` rotation ${copy.rotation}` : '');

/** a placement in one line, e.g. `brick-2x4 red at x 3 z 4 level 6 rotation 90`, or
 *  `hinge-1x2 red at x 0 z 4 level 3 angle 60 carrying lid` */
export const describePlacement = (placement: Placement): string =>
  `${placement.part} ${placement.color} at x ${placement.x} z ${placement.z} level ${placement.level}` + ((placement.rotation !== 0) ? ` rotation ${placement.rotation}` : '') +
  (placement.angle ? ` angle ${placement.angle}` : '') + (placement.carry ? ` carrying ${placement.carry.component}` : '');
