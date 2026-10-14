// packs the catalog's parts from an LDraw Parts Library checkout into the two
// files the Application ships with:
//   src/parts.ldr             every catalog part plus every subfile it references,
//                             as `0 FILE` sections keyed the way three's LDrawLoader
//                             looks them up
//   src/parts.generated.ts    each part's footprint, height and top studs measured
//                             from its geometry, and each color's value from LDConfig
//
// Usage (Node 22.18+; the official library is https://library.ldraw.org/library/updates/complete.zip):
//   node demos/brick-studio/tools/pack-parts.ts <path to the extracted ldraw directory>
// ********************************************************************************
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, COLORS, hasOpenUnderside, type CatalogPart } from '../src/catalog.ts';

// == Constants ===================================================================
const LDU_PER_STUD = 20/*LDU*/;
const LDU_PER_PLATE = 8/*LDU*/;
const STUD_RADIUS = 6/*LDU*/;
const STUD_HEIGHT = 4/*LDU*/;
const EPSILON = 0.01/*LDU*/;
/** sample columns per cell side when measuring a cell's fill */
const SAMPLES_PER_SIDE = 8;
/** how far inside a cell a bottom-face vertex must lie to count as the cell's own */
const BASE_INSET = 2/*LDU*/;
/** how thick a part must be in a cell to fill any level there (less is a measuring
 *  sliver) */
const SLIVER = 1/*LDU*/;
/** how deep a pane may sit into its frame's sill (the groove that holds it) */
const SILL_GROOVE = LDU_PER_PLATE / 2/*LDU*/;

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// == Types =======================================================================
/** a 3x4 affine transform: rotation rows a..i, translation x, y, z */
type Transform = readonly [number, number, number, number, number, number, number, number, number, number, number, number];
const IDENTITY: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

type Point = [number, number, number];
type Triangle = readonly [Point, Point, Point];
/** a part's geometry as walked: every face, tagged with the base of the stud
 *  primitive that draws it (if any); every stud primitive's base; and the base under
 *  every disc of stud radius (SEE: discStudBase) */
type Walk = { faces: Array<{ triangle: Triangle; studBase?: Point; }>; studs: Point[]; discs: Point[]; };
/** a part's body (everything but its top studs), with its extents (-y up) */
type Measure = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; studs: Point[]; triangles: Triangle[]; };

// == Files =======================================================================
/** the name a type-1 line references, normalized as LDrawLoader normalizes it */
const referenceName = (raw: string): string => raw.trim().replace(/\\/g, '/').toLowerCase();

/** the key LDrawLoader looks a referenced file up under (SEE: LDrawLoader `s/`, `48/` handling) */
const cacheKey = (name: string): string =>
  name.startsWith('s/') ? `parts/${name}` :
  name.startsWith('48/') ? `p/${name}` :
  name;

/** the library path of a referenced file */
const libraryPath = (library: string, name: string): string => {
  for(const candidate of [join(library, 'parts', name), join(library, 'p', name)]) {
    if(existsSync(candidate)) return candidate;
  }
  throw new Error(`LDraw file '${name}' is not in the library at '${library}'.`);
};

// --------------------------------------------------------------------------------
const texts = new Map<string/*reference name*/, string>();
const readPart = (library: string, name: string): string => {
  let text = texts.get(name);
  if(text === undefined) {
    text = readFileSync(libraryPath(library, name), 'utf8').replace(/\r\n?/g, '\n');
    texts.set(name, text);
  } /* else -- already read */
  return text;
};

// == Geometry ====================================================================
const compose = (p: Transform, c: Transform): Transform => {
  const [a, b, cc, d, e, f, g, h, i, x, y, z] = p;
  const [A, B, C, D, E, F, G, H, I, X, Y, Z] = c;
  return [
    a*A + b*D + cc*G, a*B + b*E + cc*H, a*C + b*F + cc*I,
    d*A + e*D + f*G,  d*B + e*E + f*H,  d*C + e*F + f*I,
    g*A + h*D + i*G,  g*B + h*E + i*H,  g*C + h*F + i*I,
    a*X + b*Y + cc*Z + x, d*X + e*Y + f*Z + y, g*X + h*Y + i*Z + z,
  ];
};

const apply = (t: Transform, x: number, y: number, z: number): [number, number, number] => [
  t[0]*x + t[1]*y + t[2]*z + t[9],
  t[3]*x + t[4]*y + t[5]*z + t[10],
  t[6]*x + t[7]*y + t[8]*z + t[11],
];

/** a single stud primitive (`stud.dat`, hollow `stud2.dat`, `stud2a.dat`, round
 *  parts' `stud10.dat`, ...); it is a top stud when it stands on the top face (the
 *  underside tubes, `stud3.dat` and `stud4*.dat`, sit below it) */
const isStud = (name: string): boolean => /^stud\d*[a-z]?\.dat$/.test(name);

/** the base under a disc of stud radius: a stud's top when it is drawn without a
 *  stud primitive (a notched stud: a partial cylinder and disc), and that disc stands
 *  a stud's height above the top face (SEE: bodyOf) */
const discStudBase = (name: string, world: Transform): Point | undefined => {
  if(!/^\d+-\d+disc\.dat$/.test(name)) return undefined;
  const radius = Math.hypot(world[0], world[3], world[6])/*the disc's x axis*/;
  const [x, y, z] = apply(world, 0, 0, 0);
  return (Math.abs(radius - STUD_RADIUS) < EPSILON) ? [x, y + STUD_HEIGHT, z] : undefined;
};

// --------------------------------------------------------------------------------
/** walks a file's geometry under `transform`, recording each face (tagged with the
 *  stud primitive drawing it) and each stud's base */
const walk = (library: string, name: string, transform: Transform, out: Walk, studBase?: Point): void =>
  walkText(library, readPart(library, name), transform, out, studBase);

/** walks LDraw text's geometry (SEE: walk) */
const walkText = (library: string, text: string, transform: Transform, out: Walk, studBase?: Point): void => {
  for(const line of text.split('\n')) {
    const fields = line.trim().split(/\s+/);
    switch(fields[0]) {
      case '1': {
        const values = fields.slice(2, 14).map(Number);
        const child = referenceName(fields.slice(14).join(' '));
        const local: Transform = [values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[0], values[1], values[2]];
        const world = compose(transform, local);
        const base = (studBase === undefined) && isStud(child) ? apply(world, 0, 0, 0) : undefined;
        const disc = (studBase === undefined) ? discStudBase(child, world) : undefined;
        if(base) out.studs.push(base);
        if(disc) out.discs.push(disc);
        walk(library, child, world, out, studBase ?? base);
        break;
      }
      case '3':
      case '4': {
        const values = fields.slice(2).map(Number);
        const points: Point[] = [];
        for(let v=0; v<(Number(fields[0]) * 3); v+=3) points.push(apply(transform, values[v], values[v + 1], values[v + 2]));
        out.faces.push({ triangle: [points[0], points[1], points[2]], studBase });
        if(points.length > 3) out.faces.push({ triangle: [points[0], points[2], points[3]], studBase });
        break;
      }
      default: break/*meta, lines and conditional lines carry no body*/;
    }
  }
};

/** a notched stud's own faces: within a stud's cylinder over its base */
const inDiscStud = (bases: ReadonlyArray<Point>, [x, y, z]: Point): boolean => bases.some(([baseX, baseY, baseZ]) =>
  (Math.hypot(x - baseX, z - baseZ) < (STUD_RADIUS + EPSILON)) && (y < (baseY + EPSILON)) && (y > (baseY - STUD_HEIGHT - EPSILON)));

/** the body of a walked part: everything but the studs standing on its top face.
 *  The top face is the highest point of what no stud draws; a stud primitive below
 *  it (an underside tube named like a stud, `stud4.dat`) is body */
const bodyOf = (walked: Walk): Measure => {
  const plain = walked.faces.filter(({ triangle, studBase }) => (studBase === undefined) && !triangle.every(point => inDiscStud(walked.discs, point)));
  const topY = Math.min(...plain.flatMap(({ triangle }) => triangle.map(([, y]) => y)));
  const onTop = (base: Point | undefined): boolean => (base !== undefined) && (Math.abs(base[1] - topY) < EPSILON);
  const discStuds = walked.discs.filter(onTop);
  const triangles = walked.faces
    .filter(({ triangle, studBase }) => !onTop(studBase) && !triangle.every(point => inDiscStud(discStuds, point)))
    .map(({ triangle }) => triangle);

  const points = triangles.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)), maxX: Math.max(...points.map(([x]) => x)),
    minY: topY, maxY: Math.max(...points.map(([, y]) => y)),
    minZ: Math.min(...points.map(([, , z]) => z)), maxZ: Math.max(...points.map(([, , z]) => z)),
    studs: [...walked.studs.filter(onTop), ...discStuds], triangles,
  };
};

/** every file `name` references, transitively, as reference names */
const closure = (library: string, name: string, seen: Set<string>): void => {
  if(seen.has(name)) return;
  seen.add(name);
  for(const line of readPart(library, name).split('\n')) {
    const fields = line.trim().split(/\s+/);
    if(fields[0] === '1') closure(library, referenceName(fields.slice(14).join(' ')), seen);
  }
};

// == Measure =====================================================================
const isWhole = (value: number): boolean => Math.abs(value - Math.round(value)) < EPSILON;

/** the grid lines (LDU along one axis, every stud) a part lies on: its own extent
 *  when that is whole studs; otherwise the extent grown out to the lines its base
 *  sits on (a tree's foliage overhangs its base). A base an odd number of studs wide
 *  centers on a cell, an even one on a cell corner */
const gridSpan = (min: number, max: number, baseMin: number, baseMax: number): readonly [number, number] => {
  if(isWhole((max - min) / LDU_PER_STUD)) return [min, max];
  const center = Math.round((baseMin + baseMax) / 2 / (LDU_PER_STUD / 2)) * (LDU_PER_STUD / 2)/*on a half stud*/;
  const odd = (Math.round((baseMax - baseMin) / LDU_PER_STUD) % 2) === 1;
  const line = odd ? (center - (LDU_PER_STUD / 2)) : center/*one grid line*/;
  return [
    line + (Math.floor(((min - line) / LDU_PER_STUD) + (EPSILON / LDU_PER_STUD)) * LDU_PER_STUD),
    line + (Math.ceil(((max - line) / LDU_PER_STUD) - (EPSILON / LDU_PER_STUD)) * LDU_PER_STUD),
  ];
};

/** a part's body, walked from its own file */
const bodyOfPart = (library: string, ldraw: string): Measure => {
  const walked: Walk = { faces: [], studs: [], discs: [] };
  walk(library, `${ldraw}.dat`, IDENTITY, walked);
  return bodyOf(walked);
};

/** an assembled part's body: its own, grown by every face of its pieces. Its studs
 *  and top face stay its own (a wheel set's tires are no top face) */
const bodyOfAssembly = (library: string, part: CatalogPart): Measure => {
  const own = bodyOfPart(library, part.ldraw);
  if(!part.pieces) return own;
  const walked: Walk = { faces: [], studs: [], discs: [] };
  walkText(library, part.pieces.join('\n'), IDENTITY, walked);
  const triangles = [...own.triangles, ...walked.faces.map(({ triangle }) => triangle)];
  const points = triangles.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)), maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)), maxY: Math.max(...points.map(([, y]) => y)),
    minZ: Math.min(...points.map(([, , z]) => z)), maxZ: Math.max(...points.map(([, , z]) => z)),
    studs: own.studs, triangles,
  };
};

/** the files an assembled part's pieces reference, as reference names */
const pieceFiles = (part: CatalogPart): string[] => (part.pieces ?? []).map(line => referenceName(line.trim().split(/\s+/).slice(14).join(' ')));

// --------------------------------------------------------------------------------
/** how far (LDU) a glass pane sits below its frame's origin. A pane drawn at the
 *  frame's origin that already reaches the frame's sill (seated in its groove)
 *  stays; one that stops short of it (the 1x4x3's, which hangs from pins) drops
 *  onto it. The sill is the bottom of the opening, the widest open span between
 *  the frame's surfaces straight down through its origin */
const paneDrop = (library: string, pane: string, frame: string): number => {
  const surfaces = [...new Set(crossings(bodyOfPart(library, frame).triangles, 0, 0).map(y => Math.round(y * 100) / 100))].sort((a, b) => a - b);
  let sill = Number.NaN, widest = 0;
  for(let index=1; index<surfaces.length; index++) {
    const span = surfaces[index] - surfaces[index - 1];
    if(span > widest) { widest = span; sill = surfaces[index]; }
  }
  const short = sill - bodyOfPart(library, pane).maxY/*LDU the pane stops above the sill*/;
  if(!(short > -SILL_GROOVE)) throw new Error(`${pane}: the pane reaches into the sill of its frame ${frame} past a groove.`);
  return Math.max(0, Math.round(short * 100) / 100);
};

// --------------------------------------------------------------------------------
/** footprint (studs), height (plates), origin, base and top-stud cells of one part,
 *  from the footprint's minimum corner; -y is up (LDraw). A part that reaches beyond
 *  whole studs or levels (a tree) takes every cell and level it reaches into, laid
 *  out from its base. An assembled part's bottom may lie off a level (a wheel set's
 *  tires): it stands on the nearest level, sunk into or raised above it */
const measurePart = (library: string, part: CatalogPart) => {
  const { ldraw } = part;
  const own = bodyOfPart(library, ldraw);
  const measured = bodyOfAssembly(library, part);

  const lowest = measured.maxY / LDU_PER_PLATE/*plates from the origin down to the bottom*/;
  if(!isWhole(lowest) && !part.pieces) throw new Error(`${ldraw}: bottom ${lowest} plates below the origin is not on a level.`);
  const base = Math.round(lowest);
  const body = { ...measured, maxY: base * LDU_PER_PLATE/*the level it stands on*/ };
  const bottomFace = body.triangles.flat().filter(([, y]) => Math.abs(y - measured.maxY) < EPSILON)/*its lowest points*/;
  const [minX, maxX] = gridSpan(body.minX, body.maxX, Math.min(...bottomFace.map(([x]) => x)), Math.max(...bottomFace.map(([x]) => x)));
  const [minZ, maxZ] = gridSpan(body.minZ, body.maxZ, Math.min(...bottomFace.map(([, , z]) => z)), Math.max(...bottomFace.map(([, , z]) => z)));
  const height = Math.ceil(((body.maxY - body.minY) / LDU_PER_PLATE) - EPSILON)/*a tip short of a level reaches into it*/;
  const top = Math.ceil(((body.maxY - own.minY) / LDU_PER_PLATE) - EPSILON)/*its top studs' level*/;

  // the cells the part reaches into, trimmed to the ones it fills
  const spanned = measureFill({ ...body, minX, minZ }, { width: Math.round((maxX - minX) / LDU_PER_STUD), depth: Math.round((maxZ - minZ) / LDU_PER_STUD), height }, hasOpenUnderside(part.kind));
  const [shiftX, shiftZ] = [Math.min(...spanned.map(([x]) => x)), Math.min(...spanned.map(([, z]) => z))];
  const fill = spanned.map(([x, z, bottom, top]) => [x - shiftX, z - shiftZ, bottom, top] as [number, number, number, number]);
  const out = { ...body, minX: minX + (shiftX * LDU_PER_STUD), minZ: minZ + (shiftZ * LDU_PER_STUD) };
  const width = Math.max(...fill.map(([x]) => x)) + 1;
  const depth = Math.max(...fill.map(([, z]) => z)) + 1;

  // the origin in studs from the minimum corner (a slope's sits over its stud row)
  const origin = [-out.minX / LDU_PER_STUD, -out.minZ / LDU_PER_STUD] as [number, number];
  if(!isWhole(origin[0] * 2) || !isWhole(origin[1] * 2)) throw new Error(`${ldraw}: origin ${origin} is not on a half stud.`);
  const halfStud = (value: number): number => Math.round(value * 2) / 2/*a round part's facets leave float noise*/;

  // a top stud sits on the top face
  const studs = out.studs
    .map(([x, , z]) => [(x - out.minX) / LDU_PER_STUD - 0.5, (z - out.minZ) / LDU_PER_STUD - 0.5] as [number, number])
    .map(([x, z]) => {
      if(!isWhole(x) || !isWhole(z)) throw new Error(`${ldraw}: stud at ${x}, ${z} is not on a cell.`);
      return [Math.round(x), Math.round(z)] as [number, number];
    })
    .filter(([x, z], index, all) => all.findIndex(([otherX, otherZ]) => (otherX === x) && (otherZ === z)) === index)/*a stud primitive's own disc*/
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  if(part.kind === 'ridge') assertRidgeRunsEastWest(body, ldraw);
  const descends = (part.kind === 'curve') ? descentOf(out, width, depth, ldraw) : undefined;
  return { width, depth, height, ...((top !== height) ? { top } : {}), origin: [halfStud(origin[0]), halfStud(origin[1])], base, studs, fill, ...(descends ? { descends } : {}) };
};

/** the side a curved slope descends to at rotation 0: the footprint edge whose top
 *  is lowest on average (north is the far edge in z) */
const descentOf = (out: Measure, width: number, depth: number, ldraw: string): 'north' | 'south' | 'east' | 'west' => {
  const meanTop = (points: ReadonlyArray<readonly [number, number]>): number => {
    const tops = points.map(([x, z]) => crossings(out.triangles, x, z)).filter(ys => ys.length > 0).map(ys => Math.min(...ys));
    return tops.reduce((sum, y) => sum + y, 0) / Math.max(1, tops.length)/*y grows downward: the larger, the lower*/;
  };
  const along = (count: number, at: (t: number) => readonly [number, number]) => Array.from({ length: count * SAMPLES_PER_SIDE }, (_, index) => at((index + 0.5) / (count * SAMPLES_PER_SIDE)));
  const [x0, x1, z0, z1] = [out.minX + 1, out.minX + (width * LDU_PER_STUD) - 1, out.minZ + 1, out.minZ + (depth * LDU_PER_STUD) - 1];
  const edges = [
    ['south', along(width, t => [out.minX + (t * width * LDU_PER_STUD), z0])],
    ['north', along(width, t => [out.minX + (t * width * LDU_PER_STUD), z1])],
    ['west', along(depth, t => [x0, out.minZ + (t * depth * LDU_PER_STUD)])],
    ['east', along(depth, t => [x1, out.minZ + (t * depth * LDU_PER_STUD)])],
  ] as const;
  const ranked = edges.map(([side, points]) => [side, meanTop(points)] as const).sort((a, b) => b[1] - a[1]);
  if((ranked[0][1] - ranked[ranked.length - 1][1]) < LDU_PER_PLATE / 2) throw new Error(`${ldraw}: the curve descends to no side.`);
  return ranked[0][0];
};

/** a ridge's peak runs east-west across the middle of its depth, as listParts says
 *  (SEE: command.ts GRID): its top is full height along that line and lower at its
 *  north and south edges */
const assertRidgeRunsEastWest = (out: Measure, ldraw: string): void => {
  const topAt = (x: number, z: number): number => Math.min(...crossings(out.triangles, x, z));
  const middleX = (out.minX + out.maxX) / 2, middleZ = (out.minZ + out.maxZ) / 2;
  const peak = [out.minX + 1, middleX, out.maxX - 1].every(x => Math.abs(topAt(x, middleZ) - out.minY) < EPSILON);
  const falls = [out.minZ + 1, out.maxZ - 1].every(z => topAt(middleX, z) > (out.minY + 1));
  if(!peak || !falls) throw new Error(`${ldraw}: the ridge does not run east-west across its middle.`);
};

// --------------------------------------------------------------------------------
/** the surfaces a vertical line at (x, z) crosses, as their y (-y up) */
const crossings = (triangles: Measure['triangles'], x: number, z: number): number[] => {
  const ys: number[] = [];
  for(const [a, b, c] of triangles) {
    const area = ((b[0] - a[0]) * (c[2] - a[2])) - ((c[0] - a[0]) * (b[2] - a[2]));
    if(Math.abs(area) < EPSILON) continue/*a vertical face: the line runs along it*/;
    const u = (((b[0] - x) * (c[2] - z)) - ((c[0] - x) * (b[2] - z))) / area;
    const v = (((c[0] - x) * (a[2] - z)) - ((a[0] - x) * (c[2] - z))) / area;
    const w = 1 - u - v;
    if((u < 0) || (v < 0) || (w < 0)) continue;
    ys.push((u * a[1]) + (v * b[1]) + (w * c[1]));
  }
  return ys;
};

/** each footprint cell the part fills and the levels it fills there, from the
 *  footprint's minimum corner as [x, z, bottom, top] (levels bottom up to, not
 *  including, top). A cell is filled when the part reaches into it at all (a wedge's
 *  cut cell still blocks a part beside it); a level when its middle lies between the
 *  part's underside and its highest point in the cell (nothing fits above a slope's
 *  high edge, a cone's tip or into a pocket in a top). A part thinner than a plate
 *  there (a leaf) fills the level holding its middle.
 *  The fill reaches the part's bottom unless its underside is open, where it starts
 *  at the underside's mean height -- except in a cell holding the part's own bottom
 *  face (a wall or tube standing on the part's bottom), since from below a hollow
 *  part shows only its inner ceiling */
const measureFill = (out: Measure, size: Readonly<{ width: number; depth: number; height: number; }>, openUnderside: boolean): Array<[number, number, number, number]> => {
  const bottomY = out.maxY;
  const fill: Array<[number, number, number, number]> = [];
  for(let cz=0; cz<size.depth; cz++) {
    for(let cx=0; cx<size.width; cx++) {
      const x0 = out.minX + (cx * LDU_PER_STUD), z0 = out.minZ + (cz * LDU_PER_STUD);
      const tops: number[] = [], undersides: number[] = [];
      for(let sz=0; sz<SAMPLES_PER_SIDE; sz++) {
        for(let sx=0; sx<SAMPLES_PER_SIDE; sx++) {
          const ys = crossings(out.triangles, x0 + (((sx + 0.5) / SAMPLES_PER_SIDE) * LDU_PER_STUD), z0 + (((sz + 0.5) / SAMPLES_PER_SIDE) * LDU_PER_STUD));
          if(ys.length < 1) continue;
          tops.push(Math.min(...ys));
          undersides.push(Math.max(...ys));
        }
      }
      if(tops.length < 1) continue/*the part never reaches into it*/;

      const topRise = bottomY - Math.min(...tops)/*LDU above the bottom, at its highest*/;
      const standsOnBottom = !openUnderside || out.triangles.some(triangle => triangle.some(([x, y, z]) =>
        (Math.abs(y - bottomY) < EPSILON) &&
        (x > (x0 + BASE_INSET)) && (x < (x0 + LDU_PER_STUD - BASE_INSET)) &&
        (z > (z0 + BASE_INSET)) && (z < (z0 + LDU_PER_STUD - BASE_INSET))));
      const bottomRise = standsOnBottom ? 0 : (bottomY - (undersides.reduce((sum, y) => sum + y, 0) / undersides.length))/*its mean height*/;

      const middles = Array.from({ length: size.height }, (_, level) => level)
        .filter(level => (((level + 0.5) * LDU_PER_PLATE) < topRise) && (((level + 0.5) * LDU_PER_PLATE) > bottomRise));
      const thin = Math.min(size.height - 1, Math.floor(((topRise + bottomRise) / 2) / LDU_PER_PLATE))/*the level holding its middle*/;
      const levels = (middles.length > 0) ? middles : ((topRise - bottomRise) > SLIVER) ? [thin] : [];
      if(levels.length < 1) continue/*a sliver*/;
      fill.push([cx, cz, levels[0], levels[levels.length - 1] + 1]);
    }
  }
  return fill;
};

// == Main ========================================================================
const library = process.argv[2];
if(!library || !existsSync(join(library, 'LDConfig.ldr'))) {
  console.error('Usage: node demos/brick-studio/tools/pack-parts.ts <path to the extracted ldraw directory>');
  process.exit(1);
} /* else -- an LDraw library to pack from */

// .. Pack ........................................................................
const files = new Set<string>();
for(const part of CATALOG) for(const name of [`${part.ldraw}.dat`, ...pieceFiles(part)]) closure(library, name, files);

const sections = [...files].sort().map(name => `0 FILE ${cacheKey(name)}\n${readPart(library, name).trimEnd()}\n`);
const header = [
  '0 FILE brick-studio-parts.ldr',
  '0 Brick Studio parts: the catalog parts and the files they reference, one 0 FILE section each',
  '0 From the LDraw Parts Library (https://library.ldraw.org), licensed under CC BY 4.0',
  '0 (https://creativecommons.org/licenses/by/4.0/). Each file keeps its author and license header',
  '0 Generated by tools/pack-parts.ts -- do not edit',
  '',
].join('\n');
const pack = header + sections.join('');
writeFileSync(join(SOURCE_DIR, 'parts.ldr'), pack);

// .. Facts .......................................................................
const measured = Object.fromEntries(CATALOG.filter(part => !part.frame).map(part => [part.ldraw, measurePart(library, part)]));
// a pane takes its frame's grid shape and fills nothing: it sits in the frame's
// opening, dropped to the frame's sill
const geometry = { ...measured, ...Object.fromEntries(CATALOG.flatMap(part => part.frame ? [[part.ldraw, { ...measured[part.frame], studs: [], fill: [], drop: paneDrop(library, part.ldraw, part.frame) }]] : [])) };

const config = readFileSync(join(library, 'LDConfig.ldr'), 'utf8');
const colors = Object.fromEntries(COLORS.map(color => {
  const match = new RegExp(`^0 !COLOUR \\S+\\s+CODE\\s+${color.code}\\s+VALUE\\s+(#[0-9A-Fa-f]{6})`, 'm').exec(config);
  if(!match) throw new Error(`LDConfig.ldr has no color ${color.code}.`);
  return [color.code, match[1].toUpperCase()];
}));

const facts = [
  '// each catalog part\'s footprint, height, base, top studs and fill, and each catalog',
  '// color\'s value, measured from the LDraw Parts Library by tools/pack-parts.ts -- do not edit',
  '// ********************************************************************************',
  '/** footprint in studs along x (`width`) and z (`depth`), height in plates, the LDraw',
  ' *  origin in studs from the footprint\'s minimum corner and its `base` in plates above',
  ' *  the part\'s bottom, the top-stud cells and the filled cells ([x, z, bottom level,',
  ' *  top level exclusive]), all at rotation 0, the `top` level of its top studs when',
  ' *  the part reaches above them (a wheel set\'s tires), a glass pane\'s `drop` (LDU) below its',
  ' *  frame\'s origin and the side a curve `descends` to, keyed by LDraw file stem */',
  `export const PART_GEOMETRY: Readonly<Record<string, Readonly<{ width: number; depth: number; height: number; origin: readonly [number, number]; base: number; studs: ReadonlyArray<readonly [number, number]>; fill: ReadonlyArray<readonly [number, number, number, number]>; top?: number; drop?: number; descends?: 'north' | 'south' | 'east' | 'west'; }>>> = ${JSON.stringify(geometry)};`,
  '',
  '/** LDConfig color value, keyed by LDraw color code */',
  `export const COLOR_VALUES: Readonly<Record<number, string>> = ${JSON.stringify(colors, null, 2)};`,
  '',
].join('\n');
writeFileSync(join(SOURCE_DIR, 'parts.generated.ts'), facts);

console.log(`Packed ${CATALOG.length} parts (${files.size} files, ${(pack.length / 1024).toFixed(0)} KB).`);
for(const part of CATALOG) {
  const g = geometry[part.ldraw];
  const box = g.fill.every(([, , bottom, top]) => (bottom === 0) && (top === g.height)) && (g.fill.length === (g.width * g.depth));
  console.log(`  ${part.key.padEnd(22)} ${part.ldraw.padEnd(6)} ${g.width}x${g.depth}x${g.height}  origin ${g.origin}  studs ${g.studs.length}  ${box ? 'box' : `fill ${JSON.stringify(g.fill)}`}`);
}
