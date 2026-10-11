import { cellKey, footprintCells, getPart, getShape, studCells, type Placement } from './grid';
import type { Model } from './model';

// checks a build on the grid. A part fills its footprint from its bottom level up
// through its height (a slope fills its whole box). Two parts collide when they fill
// the same cell at the same level. A part connects to a part directly above it
// where one of its top studs lies under that part's footprint; a part at level 0
// stands on the ground. A part with no chain of connections to the ground floats
// ********************************************************************************
// == Types =======================================================================
export type CheckResult = Readonly<{
  parts: number;
  collisions: ReadonlyArray<Readonly<{ a: string; b: string; }>>;
  floating: ReadonlyArray<string>;
  /** part lines outside the catalog or off the grid, which the check does not see */
  unchecked: number;
}>;

// == Constants ===================================================================
/** the most collisions or floating parts a result lists (the counts stay exact) */
const MAX_LISTED = 12;

// == Check =======================================================================
export const checkModel = (model: Model): CheckResult => {
  const { placements } = model;

  // .. Collisions ................................................................
  const filled = new Map<string, number>()/*cell key -> placement index*/;
  const collided = new Set<string>()/*`a|b` index pair*/;
  const collisions: Array<{ a: string; b: string; }> = [];
  placements.forEach((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    for(const [x, z] of footprintCells(shape, placement)) {
      for(let level=placement.level; level<(placement.level + shape.height); level++) {
        const key = cellKey(x, z, level);
        const other = filled.get(key);
        if(other === undefined) { filled.set(key, index); continue; }
        const pair = `${other}|${index}`;
        if(collided.has(pair)) continue;
        collided.add(pair);
        collisions.push({ a: describePlacement(placements[other]), b: describePlacement(placement) });
      }
    }
  });

  // .. Connections ...............................................................
  // the placement whose bottom covers each cell at each level
  const bottoms = new Map<string, number>();
  placements.forEach((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    for(const [x, z] of footprintCells(shape, placement)) bottoms.set(cellKey(x, z, placement.level), index);
  });

  const neighbors = placements.map(() => new Set<number>());
  placements.forEach((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    const top = placement.level + shape.height;
    for(const [x, z] of studCells(shape, placement)) {
      const above = bottoms.get(cellKey(x, z, top));
      if((above === undefined) || (above === index)) continue;
      neighbors[index].add(above);
      neighbors[above].add(index);
    }
  });

  // reach every part from the ground
  const grounded = new Set<number>();
  const queue = placements.flatMap((placement, index) => (placement.level === 0) ? [index] : []);
  for(const index of queue) grounded.add(index);
  while(queue.length > 0) {
    const index = queue.pop()!;
    for(const next of neighbors[index]) {
      if(grounded.has(next)) continue;
      grounded.add(next);
      queue.push(next);
    }
  }
  const floating = placements.flatMap((placement, index) => grounded.has(index) ? [] : [describePlacement(placement)]);

  return { parts: placements.length, collisions, floating, unchecked: model.others.length };
};

// == Summary =====================================================================
/** whether a build passes the check */
export const isSound = (result: CheckResult): boolean => (result.collisions.length < 1) && (result.floating.length < 1);

/** the result as model-facing data: exact counts with bounded lists */
export const reportCheck = (result: CheckResult) => ({
  ok: isSound(result),
  parts: result.parts,
  collisions: result.collisions.length,
  ...((result.collisions.length > 0) ? { collidingPairs: result.collisions.slice(0, MAX_LISTED) } : {}),
  floating: result.floating.length,
  ...((result.floating.length > 0) ? { floatingParts: result.floating.slice(0, MAX_LISTED) } : {}),
  ...((result.unchecked > 0) ? { unchecked: result.unchecked } : {}),
});

/** a placement in one line, e.g. `brick-2x4 red at x 3 z 4 level 6 rotation 90` */
export const describePlacement = (placement: Placement): string =>
  `${placement.part} ${placement.color} at x ${placement.x} z ${placement.z} level ${placement.level}` + ((placement.rotation !== 0) ? ` rotation ${placement.rotation}` : '');
