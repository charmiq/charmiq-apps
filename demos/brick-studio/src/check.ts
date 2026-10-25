import { carriedCells, carriedPartCells, cellKey, filledCells, frameKey, getColorByCode, getPart, getShape, mountsOf, studCells, LDU_PER_PLATE, LDU_PER_STUD, type Copy, type FilledCell, type Mount, type Placement } from './grid';
import { mountedComponent, READ_IN_PART, type Model } from './model';
import { pictureFootprint, type Picture } from './picture';

// checks a build on the grid. A part fills the cells and levels its shape measures
// (SEE: parts.generated.ts `fill`). Two parts collide when they fill the same cell
// at the same level. A part connects to a part directly above it where one of its
// top studs lies under a cell that part fills from its bottom level (from the level
// it rests at, for a part hanging below it); a part resting at level 0 stands on the
// ground. A glass pane fills nothing and is held by the frame
// at its own position; two panes in one frame collide. A part with no chain of
// connections to the ground floats. A carrier's mount (a hinge's carry, a side
// face's) fills the cells its turned cells overlap (SEE: grid.ts Mounts): it never
// collides with its own carrier, it collides with the carrier's other mounts and with
// everything else, and only its carrier holds it. A picture's panel (SEE: picture.ts)
// collides with a part it stands inside: upright, a part filling a cell of its stud row
// within its height; flat, a part filling a cell beneath it through its level. It
// collides with a picture sharing its plane where they cross (two panels in one plane
// flicker over each other): upright, in one stud row; flat, on one level. It is never
// held or floating. A pinned part (SEE: pin.ts) is held where it stands, a copy
// of a component whole, and holds what its studs hold; it still collides
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
  /** the parts pins hold, and the pins naming a cell no part fills, when any */
  pinned?: number;
  strayPins?: number;
}>;

/** what a pin holds: a part of the set's own, or a component's line (a copy), every
 *  part it places */
export type PinTarget = Readonly<{ placement: number; }> | Readonly<{ placed: number; }>;

// == Constants ===================================================================
/** the most parts a result or a refusal names in each list (the counts stay exact) */
export const MAX_LISTED = 12;
/** the plates a stud of height measures: a picture's height is in studs */
const PLATES_PER_STUD = LDU_PER_STUD / LDU_PER_PLATE;

// == Check =======================================================================
/** each model's check, made once: a set read once is checked once (SEE: model.ts
 *  parseModel) */
const checks = new WeakMap<Model, CheckResult>();

export const checkModel = (model: Model): CheckResult => {
  let result = checks.get(model);
  if(!result) { result = checkWhole(model); checks.set(model, result); }
  return result;
};

const checkWhole = (model: Model): CheckResult => {
  const { placements } = model;
  const name = (index: number): string => describeIn(model, index);

  // .. Collisions ................................................................
  // every placement's own part, then each of its mounts
  const bodies: Body[] = placements.flatMap((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    return [{ placement: index, cells: filledCells(shape, placement) }, ...mountsOf(placement).map(mount => ({ placement: index, mount, cells: carriedCells(shape, placement, mount, mountedComponent(model, mount)) }))];
  });
  const own = new Map(bodies.flatMap((body, at) => (body.mount === undefined) ? [[body.placement, at]] : []));
  const bodyName = ({ placement, mount }: Body): string => (mount === undefined) ? name(placement) : mountName(model, placement, mount);
  const collided = new Set<string>()/*`a|b` body index pair*/;
  const collisions: Array<{ a: string; b: string; }> = [];
  const collide = (other: number, at: number) => {
    const pair = `${other}|${at}`;
    if(collided.has(pair)) return;
    collided.add(pair);
    collisions.push({ a: bodyName(bodies[other]), b: bodyName(bodies[at]) });
  };
  for(const [other, at] of overlapping(bodies)) collide(other, at);
  const { panes, crowded } = framed(placements);
  for(const [first, index] of crowded) collide(own.get(first)!, own.get(index)!);
  // a mount's own parts, against each other in its component's grid by the same
  // rules: a definition given as text is not checked when it is written
  placements.forEach((placement, index) => {
    for(const mount of mountsOf(placement)) {
      const { name: component, placements: parts } = mountedComponent(model, mount);
      const inMount = (part: number) => `${describePlacement(parts[part])} in ${component} carried by ${(mount.slot === 'top') ? name(index) : `the ${mount.slot} face of ${name(index)}`}`;
      const pairs = [...overlapping(parts.map((part, at) => ({ placement: at, cells: filledCells(getShape(getPart(part.part)!/*by contract*/), part) }))), ...framed(parts).crowded];
      for(const [other, part] of pairs) collisions.push({ a: inMount(other), b: inMount(part) });
    }
  });
  // each picture against each body it stands inside (SEE: insidePicture)
  if((model.pictures?.length ?? 0) > 0) {
    const columns = new Map<string, Array<Readonly<{ body: number; cell: FilledCell; }>>>();
    bodies.forEach((body, at) => {
      for(const cell of body.cells) {
        const key = cellKey(cell.x, cell.z, 0/*the column*/);
        const column = columns.get(key);
        if(column) column.push({ body: at, cell }); else columns.set(key, [{ body: at, cell }]);
      }
    });
    for(const picture of model.pictures!) {
      const inside = new Set<number>();
      for(const [x, z] of pictureCells(picture)) {
        for(const { body, cell } of columns.get(cellKey(x, z, 0/*the column*/)) ?? []) {
          if(inside.has(body) || !insidePicture(picture, cell)) continue;
          inside.add(body);
          collisions.push({ a: describePicture(picture), b: bodyName(bodies[body]) });
        }
      }
    }
    for(const [first, second] of coplanarPictures(model.pictures!)) collisions.push({ a: describePicture(first), b: describePicture(second) });
  } /* else -- no pictures */

  // .. Connections ...............................................................
  // the placement whose bottom covers each cell at each level
  const bottoms = new Map<string, number>();
  placements.forEach((placement, index) => {
    const shape = getShape(getPart(placement.part)!/*by contract*/);
    const resting = restingLevel(placement);
    for(const { x, z, bottom } of filledCells(shape, placement)) {
      if(bottom === resting) bottoms.set(cellKey(x, z, resting), index)/*an open underside holds nothing*/;
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

  // reach every part from the ground, and from every part pinned where it stands
  const grounded = new Set<number>();
  const pins = pinsOf(model);
  const queue = placements.flatMap((placement, index) => ((((restingLevel(placement) === 0) && !getPart(placement.part)!.frame/*by contract*/)) || pins.placements.has(index)) ? [index] : []);
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

  // a mount's parts count as the build's: those on its component's grid checked, the
  // rest unchecked
  const carried = placements.flatMap(mountsOf).map(mount => mountedComponent(model, mount));
  return {
    parts: placements.length + carried.reduce((total, component) => total + component.placements.length, 0), collisions, floating,
    unchecked: model.others.length + carried.reduce((total, component) => total + component.others.length, 0), truncated: !!model.truncated,
    ...((pins.placements.size > 0) ? { pinned: pins.placements.size } : {}), ...((pins.stray > 0) ? { strayPins: pins.stray } : {}),
  };
};

// == Collisions ==================================================================
// -- Bodies ----------------------------------------------------------------------
/** what fills cells in a check: a placement's own part, or one of its mounts */
type Body = Readonly<{ placement: number; mount?: Mount; cells: ReadonlyArray<FilledCell>; }>;

/** each pair of bodies that fill one cell at one level, once, in the order found, a
 *  body against the first at the cell it may meet: a body's own cells never pair,
 *  nor a carrier with its own mounts (its mounts with each other do) */
const overlapping = (bodies: ReadonlyArray<Body>): Array<readonly [number, number]> => {
  const filled = new Map<string, number[]>()/*cell key -> body indices*/;
  const pairs = new Map<string, readonly [number, number]>();
  const exempt = (a: Body, b: Body): boolean => (a === b) || ((a.placement === b.placement) && ((a.mount === undefined) || (b.mount === undefined)));
  bodies.forEach((body, at) => {
    for(const { x, z, bottom, top } of body.cells) {
      for(let level=bottom; level<top; level++) {
        const key = cellKey(x, z, level);
        const there = filled.get(key);
        if(!there) { filled.set(key, [at]); continue; }
        const other = there.find(each => !exempt(bodies[each], body));
        if(other !== undefined) pairs.set(`${other}|${at}`, [other, at]);
        if(!there.includes(at)) there.push(at);
      }
    }
  });
  return [...pairs.values()];
};

/** a mount in one line: a hinge's carry by its hinge, a face's by its face, e.g.
 *  `grille on the south face of brick-1x2-side-studs white at x 4 z 6 level 0` */
const mountName = (model: Model, placement: number, mount: Mount): string =>
  (mount.slot === 'top') ? describeIn(model, placement) : `${mount.copy.component} on the ${mount.slot} face of ${describeIn(model, placement)}`;

// -- Glass -----------------------------------------------------------------------
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

// -- Pictures --------------------------------------------------------------------
// a picture's panel against the parts it stands inside (SEE: checkWhole)

/** the stud cells a picture's panel passes over or through. With no height its height
 *  follows its image, which the check does not read: it takes what the panel covers
 *  whatever the image, its first plate upright and its first stud row flat */
const pictureCells = (picture: Picture): ReadonlyArray<readonly [number, number]> => {
  const [east, north] = pictureFootprint(picture, picture.height ?? (picture.flat ? 1 : (1 / PLATES_PER_STUD)));
  const cells: Array<readonly [number, number]> = [];
  for(let x=0; x<Math.ceil(east); x++) for(let z=0; z<Math.ceil(north); z++) cells.push([picture.x + x, picture.z + z]);
  return cells;
};

/** whether a picture's panel stands inside a part filling a cell it passes, from
 *  `bottom` to `top`: upright, the part fills the cell within the panel's height; flat,
 *  it fills the cell through the picture's level (a part standing on the picture stands
 *  on the studs beneath it) */
const insidePicture = (picture: Picture, { bottom, top }: FilledCell): boolean => {
  if(picture.flat) return (bottom < picture.level) && (top > picture.level);
  const panelTop = picture.level + ((picture.height ?? (1 / PLATES_PER_STUD)) * PLATES_PER_STUD);
  return (bottom < panelTop) && (top > picture.level);
};

/** every two pictures sharing a plane and crossing in it, the earlier first: upright,
 *  standing in one stud row (facing either way) with their spans along it and their
 *  heights crossing; flat, lying on one level with their footprints crossing. A picture
 *  in the row before another stands in front of it, as a poster on a billboard does */
export const coplanarPictures = (pictures: ReadonlyArray<Picture>): ReadonlyArray<readonly [Picture, Picture]> => {
  const panels = pictures.map(panelOf);
  const pairs: Array<readonly [Picture, Picture]> = [];
  panels.forEach((first, at) => {
    for(let next=at+1; next<panels.length; next++) {
      const second = panels[next];
      if((first.plane === second.plane) && (first.across[0] < second.across[1]) && (second.across[0] < first.across[1]) && (first.up[0] < second.up[1]) && (second.up[0] < first.up[1])) pairs.push([pictures[at], pictures[next]]);
    }
  });
  return pairs;
};

/** the level an upright picture's top reaches (its height is in studs); none for a flat
 *  one, or one whose height follows its image */
export const pictureTop = (picture: Picture): number | undefined =>
  (picture.flat || (picture.height === undefined)) ? undefined : picture.level + (picture.height * PLATES_PER_STUD);

/** a picture's panel as its plane names it (upright, its stud row; flat, its level) and
 *  its extent in that plane: along the row and up, or east and north */
const panelOf = (picture: Picture): Readonly<{ plane: string; across: readonly [number, number]; up: readonly [number, number]; }> => {
  const height = picture.height ?? (picture.flat ? 1 : (1 / PLATES_PER_STUD))/*what the check takes of a panel following its image (SEE: pictureCells)*/;
  const [east, north] = pictureFootprint(picture, height);
  if(picture.flat) return { plane: `flat ${picture.level}`, across: [picture.x, picture.x + east], up: [picture.z, picture.z + north] };
  const alongX = (picture.rotation === 0) || (picture.rotation === 180)/*facing south or north*/;
  return {
    plane: alongX ? `row z ${picture.z}` : `row x ${picture.x}`,
    across: alongX ? [picture.x, picture.x + east] : [picture.z, picture.z + north],
    up: [picture.level, picture.level + (height * PLATES_PER_STUD)],
  };
};

// == Holding =====================================================================
/** the level a placement rests on the studs beneath at: its bottom, or the level above
 *  it its part names, for a part hanging below where it rests (SEE: catalog.ts rests) */
const restingLevel = (placement: Placement): number => placement.level + (getPart(placement.part)!.rests ?? 0)/*by contract*/;

// -- Pins ------------------------------------------------------------------------
/** what each of a model's pins holds (undefined for a pin naming a cell no part
 *  fills), the parts they hold, and how many hold nothing: a part filling the pin's
 *  cell, its mounts' cells its own, or the whole line placing it when a component's
 *  line places it */
export const pinsOf = (model: Model): Readonly<{ targets: ReadonlyArray<PinTarget | undefined>; placements: ReadonlySet<number>; stray: number; }> => {
  const pins = model.pins ?? [];
  if(pins.length < 1) return { targets: [], placements: new Set(), stray: 0 };
  const filled = filledBy(model);
  const targets = pins.map(({ x, z, level }) => targetOf(model, filled.get(cellKey(x, z, level))));
  const lines = new Set(targets.flatMap(target => ((target !== undefined) && ('placed' in target)) ? [target.placed] : []));
  const placements = new Set(model.placements.flatMap((_, index) => {
    const line = model.placementPlaced?.[index];
    return (((line !== undefined) && lines.has(line)) || targets.some(target => (target !== undefined) && ('placement' in target) && (target.placement === index))) ? [index] : [];
  }));
  return { targets, placements, stray: targets.filter(target => target === undefined).length };
};

/** what a pin naming a placement's cell holds: the placement, or the component's
 *  line placing it */
export const targetOf = (model: Model, placement: number | undefined): PinTarget | undefined => {
  if(placement === undefined) return undefined;
  const line = model.placementPlaced?.[placement];
  return (line === undefined) ? { placement } : { placed: line };
};

/** whether two pins hold the same thing */
export const sameTarget = (a: PinTarget | undefined, b: PinTarget | undefined): boolean =>
  (a !== undefined) && (b !== undefined) && (('placement' in a) ? (('placement' in b) && (a.placement === b.placement)) : (('placed' in b) && (a.placed === b.placed)));

// == Cells =======================================================================
// the cells parts fill: the check's, and every edit's or mark's that finds a part by
// a cell

/** the placement that fills each cell of a model, its mounts' cells its own */
export const filledBy = (model: Model): ReadonlyMap<string, number> => {
  const filled = new Map<string, number>();
  model.placements.forEach((placement, index) => {
    for(const { x, z, bottom, top } of occupiedCells(model, placement)) {
      for(let level=bottom; level<top; level++) filled.set(cellKey(x, z, level), index);
    }
  });
  return filled;
};

/** the cells a placement takes in a build: its part's, then its mounts' (SEE:
 *  grid.ts carriedCells), which may share cells with it and with each other */
export const occupiedCells = (model: Model, placement: Placement): FilledCell[] => {
  const shape = getShape(getPart(placement.part)!/*by contract*/);
  return [...filledCells(shape, placement), ...mountsOf(placement).flatMap(mount => carriedCells(shape, placement, mount, mountedComponent(model, mount)))];
};

/** the cells a placement takes in a build (SEE: occupiedCells), by the part filling
 *  them: its own, then each part its mounts carry */
export const occupiedPartCells = (model: Model, placement: Placement): ReadonlyArray<Readonly<{ part: Placement; cells: FilledCell[]; }>> => {
  const shape = getShape(getPart(placement.part)!/*by contract*/);
  return [{ part: placement, cells: filledCells(shape, placement) }, ...mountsOf(placement).flatMap(mount => carriedPartCells(shape, placement, mount, mountedComponent(model, mount)))];
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
  ...(result.pinned ? { pinned: result.pinned } : {}),
  ...(result.strayPins ? { strayPins: result.strayPins } : {}),
  ...(result.truncated ? { truncated: TRUNCATED } : {}),
});

/** what a build read only in part means, model-facing */
export const TRUNCATED = `${READ_IN_PART} This covers that part alone.`;

// == Descriptions ================================================================
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

/** a picture in one line, e.g. `picture night-watch at x -8 z 19 level 24`, or `picture
 *  charmiq://file/rug at x 0 z 0 level 3 rotation 90 flat` */
export const describePicture = (picture: Picture): string =>
  `picture ${picture.image} at x ${picture.x} z ${picture.z} level ${picture.level}` + ((picture.rotation !== 0) ? ` rotation ${picture.rotation}` : '') + (picture.flat ? ' flat' : '');
/** whether a collision names a picture (SEE: describePicture), rather than a part */
export const isPictureName = (named: string): boolean => named.startsWith('picture ');

/** a placement in one line, e.g. `brick-2x4 red at x 3 z 4 level 6 rotation 90`, or
 *  `hinge-1x2 red at x 0 z 4 level 3 angle 60 carrying lid` */
export const describePlacement = (placement: Placement): string =>
  `${placement.part} ${placement.color} at x ${placement.x} z ${placement.z} level ${placement.level}` + ((placement.rotation !== 0) ? ` rotation ${placement.rotation}` : '') +
  (placement.angle ? ` angle ${placement.angle}` : '') +
  ((mountsOf(placement).length > 0) ? ` carrying ${mountsOf(placement).map(({ slot, copy }) => (slot === 'top') ? copy.component : `${copy.component} on its ${slot} face`).join(' and ')}` : '');
