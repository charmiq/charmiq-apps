// packs the catalog's parts from an LDraw Parts Library checkout into the files
// the Application ships with:
//   src/parts/built-in.ldr    the building parts and every file more than one family
//                             uses, as `0 FILE` sections keyed the way three's
//                             LDrawLoader looks them up: built into the Application
//   src/parts/<family>.ldr    each family's own files (SEE: catalog.ts familyOf),
//                             declared in manifest.json `bundle.resources` and read
//                             the first time a build shows one of its parts
//   src/parts.generated.ts    each part's footprint, height and top studs measured
//                             from its geometry, the resource holding each family
//                             part, and each color's value from LDConfig
//
// Usage (Node 22.18+; the official library is https://library.ldraw.org/library/updates/complete.zip):
//   node demos/brick-studio/tools/pack-parts.ts <path to the extracted ldraw directory>
// ********************************************************************************
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { familyOf, familyResource, hasOpenUnderside, type CatalogPart, ACCESSORIES, CATALOG, COLORS } from '../src/catalog.ts';
import { maxOf, minOf } from '../src/numbers.ts';
import { accessoryLine, hingePieces, limbLines, pieceLines, posedPieces, LIMBS, POSE_ANGLES, SLOT_LIMB, SLOTS_IN_ORDER, type PieceLine } from '../src/pose.ts';

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

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(APP_DIR, 'src');
const PARTS_DIR = join(SOURCE_DIR, 'parts');
const MANIFEST = join(APP_DIR, 'manifest.json');

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
  const topY = minOf(plain.flatMap(({ triangle }) => triangle.map(([, y]) => y)));
  const onTop = (base: Point | undefined): boolean => (base !== undefined) && (Math.abs(base[1] - topY) < EPSILON);
  const discStuds = walked.discs.filter(onTop);
  const triangles = walked.faces
    .filter(({ triangle, studBase }) => !onTop(studBase) && !triangle.every(point => inDiscStud(discStuds, point)))
    .map(({ triangle }) => triangle);

  const points = triangles.flat();
  return {
    minX: minOf(points.map(([x]) => x)), maxX: maxOf(points.map(([x]) => x)),
    minY: topY, maxY: maxOf(points.map(([, y]) => y)),
    minZ: minOf(points.map(([, , z]) => z)), maxZ: maxOf(points.map(([, , z]) => z)),
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

/** an assembled part's body: its own and its pieces' bodies together, and the top
 *  face its top studs stand on (-y up). Its top studs are those of the files (its own
 *  or its pieces') whose studded top face is highest: a figure's head, not a wheel
 *  set's tires, which carry none; both halves of a hinge plate, level with each other */
const bodyOfAssembly = (library: string, part: CatalogPart): Readonly<{ body: Measure; studTop: number; }> => {
  const bodies = [bodyOfPart(library, part.ldraw), ...(part.pieces ?? []).map(line => {
    const walked: Walk = { faces: [], studs: [], discs: [] };
    walkText(library, line, IDENTITY, walked);
    return bodyOf(walked);
  })];
  const studded = bodies.filter(body => body.studs.length > 0);
  const crown = (studded.length > 0) ? studded.reduce((highest, body) => (body.minY < highest.minY) ? body : highest) : bodies[0];
  const crowns = studded.filter(body => Math.abs(body.minY - crown.minY) < EPSILON);

  const triangles = bodies.flatMap(body => body.triangles);
  const points = triangles.flat();
  return { studTop: crown.minY, body: {
    minX: minOf(points.map(([x]) => x)), maxX: maxOf(points.map(([x]) => x)),
    minY: minOf(points.map(([, y]) => y)), maxY: maxOf(points.map(([, y]) => y)),
    minZ: minOf(points.map(([, , z]) => z)), maxZ: maxOf(points.map(([, , z]) => z)),
    studs: (crowns.length > 0) ? crowns.flatMap(body => body.studs) : crown.studs, triangles,
  } };
};

/** the files an assembled part's pieces reference, and every accessory's for a part
 *  that wears them, as reference names */
const pieceFiles = (part: CatalogPart): string[] => [
  ...(part.pieces ?? []).map(line => referenceName(line.trim().split(/\s+/).slice(14).join(' '))),
  ...(part.slots ? ACCESSORIES.map(accessory => `${accessory.ldraw}.dat`.toLowerCase()) : []),
];

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
  const { body: measured, studTop } = bodyOfAssembly(library, part);

  const lowest = measured.maxY / LDU_PER_PLATE/*plates from the origin down to the bottom*/;
  if(!isWhole(lowest) && !part.pieces) throw new Error(`${ldraw}: bottom ${lowest} plates below the origin is not on a level.`);
  const base = Math.round(lowest);
  const body = { ...measured, maxY: base * LDU_PER_PLATE/*the level it stands on*/ };
  const bottomFace = body.triangles.flat().filter(([, y]) => Math.abs(y - measured.maxY) < EPSILON)/*its lowest points*/;
  const [minX, maxX] = gridSpan(body.minX, body.maxX, minOf(bottomFace.map(([x]) => x)), maxOf(bottomFace.map(([x]) => x)));
  const [minZ, maxZ] = gridSpan(body.minZ, body.maxZ, minOf(bottomFace.map(([, , z]) => z)), maxOf(bottomFace.map(([, , z]) => z)));
  const height = Math.ceil(((body.maxY - body.minY) / LDU_PER_PLATE) - EPSILON)/*a tip short of a level reaches into it*/;
  const top = Math.ceil(((body.maxY - studTop) / LDU_PER_PLATE) - EPSILON)/*its top studs' level*/;

  // the cells the part reaches into, trimmed to the ones it fills
  const spanned = measureFill({ ...body, minX, minZ }, { width: Math.round((maxX - minX) / LDU_PER_STUD), depth: Math.round((maxZ - minZ) / LDU_PER_STUD), height }, hasOpenUnderside(part.kind));
  const [shiftX, shiftZ] = [minOf(spanned.map(([x]) => x)), minOf(spanned.map(([, z]) => z))];
  const fill = spanned.map(([x, z, bottom, top]) => [x - shiftX, z - shiftZ, bottom, top] as [number, number, number, number]);
  const out = { ...body, minX: minX + (shiftX * LDU_PER_STUD), minZ: minZ + (shiftZ * LDU_PER_STUD) };
  const width = maxOf(fill.map(([x]) => x)) + 1;
  const depth = maxOf(fill.map(([, z]) => z)) + 1;

  // the origin in studs from the minimum corner (a slope's sits over its stud row)
  const origin = [-out.minX / LDU_PER_STUD, -out.minZ / LDU_PER_STUD] as [number, number];
  if(!isWhole(origin[0] * 2) || !isWhole(origin[1] * 2)) throw new Error(`${ldraw}: origin ${origin} is not on a half stud.`);
  const halfStud = (value: number): number => Math.round(value * 2) / 2/*a round part's facets leave float noise*/;

  // a top stud sits on the top face. An assembled part's stud off the grid (a
  // figure's head stud, between its feet) holds nothing placed on the grid
  const studs = out.studs
    .map(([x, , z]) => [(x - out.minX) / LDU_PER_STUD - 0.5, (z - out.minZ) / LDU_PER_STUD - 0.5] as [number, number])
    .filter(([x, z]) => (isWhole(x) && isWhole(z)) || !part.pieces)
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

// --------------------------------------------------------------------------------
/** a cell a part fills: [x, z, bottom level, top level exclusive] */
type Fill = [number, number, number, number];
/** where a part stands in its own frame: its footprint's minimum corner and its bottom
 *  (LDU, -y up) */
type StandingFrame = Readonly<{ minX: number; minZ: number; bottomY: number; }>;

/** piece lines as LDraw text */
const lineText = (lines: ReadonlyArray<PieceLine>): string =>
  lines.map(({ ldraw, colorCode, position, matrix }) => ['1', colorCode, ...position, ...matrix, `${ldraw}.dat`].join(' ')).join('\n');

/** the body of LDraw text (SEE: bodyOf) */
const bodyOfText = (library: string, text: string): Measure => {
  const walked: Walk = { faces: [], studs: [], discs: [] };
  walkText(library, text, IDENTITY, walked);
  return bodyOf(walked);
};

/** the cells a body fills in a part's standing frame, from its footprint's minimum
 *  corner and its bottom, reaching past that footprint where the body does (a raised
 *  arm). Levels count up from the standing bottom (SEE: measureFill) */
const fillInFrame = (body: Measure, frame: StandingFrame, openUnderside: boolean): Fill[] => {
  if(body.triangles.length < 1) return [];
  const from = (value: number, origin: number) => Math.floor(((value - origin) / LDU_PER_STUD) + (EPSILON / LDU_PER_STUD));
  const to = (value: number, origin: number) => Math.ceil(((value - origin) / LDU_PER_STUD) - (EPSILON / LDU_PER_STUD));
  const [x0, x1, z0, z1] = [from(body.minX, frame.minX), to(body.maxX, frame.minX), from(body.minZ, frame.minZ), to(body.maxZ, frame.minZ)];
  const height = Math.ceil(((frame.bottomY - body.minY) / LDU_PER_PLATE) - EPSILON);
  const cells = measureFill({ ...body, minX: frame.minX + (x0 * LDU_PER_STUD), minZ: frame.minZ + (z0 * LDU_PER_STUD), maxY: frame.bottomY }, { width: x1 - x0, depth: z1 - z0, height }, openUnderside);
  return cells.map(([x, z, bottom, top]) => [x + x0, z + z0, bottom, top]);
};

/** a posable part's fill in its standing frame (SEE: fillInFrame), and how high its
 *  lowest point lies above the standing bottom (plates): its own body and every piece
 *  no limb moves (`core`), and each limb's at every angle. A pose fills their union and
 *  stands on its lowest point, so a limb's cells never depend on another's angle */
const measurePose = (library: string, part: CatalogPart, standing: Standing) => {
  const frame = standingFrame(standing);
  const open = hasOpenUnderside(part.kind);
  const measured = (text: string) => {
    const body = bodyOfText(library, text);
    return { fill: fillInFrame(body, frame, open), bottom: Math.round(((frame.bottomY - body.maxY) / LDU_PER_PLATE) * 1e4) / 1e4 };
  };
  const moved = new Set(LIMBS.flatMap(limb => part.limbs![limb].pieces));
  const fixed = pieceLines(part).filter((_, index) => !moved.has(index));
  const core = measured([`1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${part.ldraw}.dat`, lineText(fixed)].join('\n'));
  const limbs = Object.fromEntries(LIMBS.map(limb => [limb, Object.fromEntries(POSE_ANGLES.map(angle => [angle, measured(lineText(limbLines(part, limb, angle)))]))]));
  // each accessory a slot takes, at every angle of the limb it turns with
  const gear = Object.fromEntries(SLOTS_IN_ORDER.map(slot => [slot, Object.fromEntries(ACCESSORIES.filter(accessory => accessory.on === ((slot === 'hat') ? 'head' : 'hand')).map(accessory => [accessory.key, Object.fromEntries(POSE_ANGLES.map(angle => {
    const carrier = posedPieces(part, { [SLOT_LIMB[slot]]: angle })[part.slots![slot].piece];
    return [angle, measured(lineText([accessoryLine(part, slot, carrier, accessory, 16)]))];
  }))]))]));
  return { core, limbs, gear };
};

/** a hinge's fill in its standing frame (SEE: fillInFrame): its base's (its own body
 *  and every piece but its top), and its top's at every angle, and the cells of its
 *  top's studs at 0 (what a carry stands on). A turned hinge fills their union (SEE:
 *  grid.ts hinged) */
const measureHinge = (library: string, part: CatalogPart, standing: Standing) => {
  const frame = standingFrame(standing);
  const open = hasOpenUnderside(part.kind);
  const fill = (text: string) => fillInFrame(bodyOfText(library, text), frame, open);
  const { piece } = part.hinge!/*by contract*/;
  const base = fill([`1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${part.ldraw}.dat`, lineText(pieceLines(part).filter((_, index) => index !== piece))].join('\n'));
  const top = Object.fromEntries(POSE_ANGLES.map(angle => [angle, fill(lineText([hingePieces(part, angle)[piece]]))]));
  const studs = [...new Set(bodyOfText(library, lineText([pieceLines(part)[piece]])).studs.map(([x, , z]) => {
    const cell = [((x - frame.minX) / LDU_PER_STUD) - 0.5, ((z - frame.minZ) / LDU_PER_STUD) - 0.5];
    if(!cell.every(isWhole)) throw new Error(`${part.ldraw}: its top's stud at ${cell} is not on a cell.`);
    return cell.map(Math.round).join(',');
  }))].map(key => key.split(',').map(Number) as [number, number]).sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return { base, top, studs };
};

/** what places a part in its own frame: its origin (studs from its footprint's minimum
 *  corner) and its base (plates from its bottom up to its origin) */
type Standing = Readonly<{ origin: readonly [number, number]; base: number; }>;
/** the standing frame of a part where it stands */
const standingFrame = (standing: Standing): StandingFrame =>
  ({ minX: -standing.origin[0] * LDU_PER_STUD, minZ: -standing.origin[1] * LDU_PER_STUD, bottomY: standing.base * LDU_PER_PLATE });

/** the side a curved slope descends to at rotation 0: the footprint edge whose top
 *  is lowest on average (north is the far edge in z) */
const descentOf = (out: Measure, width: number, depth: number, ldraw: string): 'north' | 'south' | 'east' | 'west' => {
  const meanTop = (points: ReadonlyArray<readonly [number, number]>): number => {
    const tops = points.map(([x, z]) => crossings(out.triangles, x, z)).filter(ys => ys.length > 0).map(ys => minOf(ys));
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
  const topAt = (x: number, z: number): number => minOf(crossings(out.triangles, x, z));
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
          tops.push(minOf(ys));
          undersides.push(maxOf(ys));
        }
      }
      if(tops.length < 1) continue/*the part never reaches into it*/;

      const topRise = bottomY - minOf(tops)/*LDU above the bottom, at its highest*/;
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
// each family's files; a file more than one family uses goes with the building
// parts, so a family's own file needs nothing but what is built in
const familyFiles = new Map<string | undefined/*the building parts*/, Set<string>>();
for(const part of CATALOG) {
  const family = familyOf(part);
  const files = familyFiles.get(family) ?? new Set<string>();
  for(const name of [`${part.ldraw}.dat`, ...pieceFiles(part)]) closure(library, name, files);
  familyFiles.set(family, files);
}
const users = new Map<string, number>();
for(const files of familyFiles.values()) for(const name of files) users.set(name, (users.get(name) ?? 0) + 1);
const builtIn = new Set([...(familyFiles.get(undefined) ?? []), ...[...users].filter(([, count]) => count > 1).map(([name]) => name)]);
const files = new Set(users.keys());

const packText = (name: string, describes: string, names: Iterable<string>): string => [
  `0 FILE ${name}`,
  `0 Brick Studio parts: ${describes}, one 0 FILE section each`,
  '0 From the LDraw Parts Library (https://library.ldraw.org), licensed under CC BY 4.0',
  '0 (https://creativecommons.org/licenses/by/4.0/). Each file keeps its author and license header',
  '0 Generated by tools/pack-parts.ts -- do not edit',
  '',
].join('\n') + [...names].sort().map(file => `0 FILE ${cacheKey(file)}\n${readPart(library, file).trimEnd()}\n`).join('');

// every pack is written anew: one no family names any more is gone
rmSync(PARTS_DIR, { recursive: true, force: true });
mkdirSync(PARTS_DIR);
const pack = packText('brick-studio-parts.ldr', 'the building parts and the files more than one family uses', builtIn);
writeFileSync(join(PARTS_DIR, 'built-in.ldr'), pack);

const families = [...familyFiles.keys()].filter((family): family is string => family !== undefined).sort();
const familySizes = families.map(family => {
  const own = [...familyFiles.get(family)!].filter(name => !builtIn.has(name));
  const text = packText(`brick-studio-${familyResource(family)}.ldr`, `the ${family} family's own files`, own);
  writeFileSync(join(PARTS_DIR, `${family}.ldr`), text);
  return [family, text.length] as const;
});

// the resource holding each family part and piece not built in, by LDraw file stem
const partResources = Object.fromEntries(CATALOG.flatMap(part => {
  const family = familyOf(part);
  return (family === undefined) ? [] : [`${part.ldraw}.dat`, ...pieceFiles(part)]
    .filter(name => !builtIn.has(referenceName(name)))
    .map(name => [referenceName(name).replace(/\.dat$/, ''), familyResource(family)]);
}));

// .. Manifest ....................................................................
// the declarations are the families packed: `bundle.resources` is replaced whole,
// the rest of the manifest kept as written
const declared = Object.fromEntries(families.map(family => [familyResource(family), `/src/parts/${family}.ldr`]));
const resourcesBlock = `    "resources": {\n${Object.entries(declared).map(([name, path]) => `      ${JSON.stringify(name)}: ${JSON.stringify(path)}`).join(',\n')}\n    },\n`;
const manifest = readFileSync(MANIFEST, 'utf8');
const RESOURCES_BLOCK = /^    "resources": \{[^}]*\},\n/m;
const FORMAT_LINE = /^    "format": "esm",\n/m;
const nextManifest = RESOURCES_BLOCK.test(manifest) ? manifest.replace(RESOURCES_BLOCK, resourcesBlock) : manifest.replace(FORMAT_LINE, match => match + resourcesBlock);
if(JSON.stringify(JSON.parse(nextManifest).bundle?.resources) !== JSON.stringify(declared)) throw new Error('manifest.json: bundle.resources could not be written; declare it after "format" in "bundle".');
writeFileSync(MANIFEST, nextManifest);

// .. Facts .......................................................................
const measured = Object.fromEntries(CATALOG.filter(part => !part.frame).map(part => [part.ldraw, measurePart(library, part)]));
// a pane takes its frame's grid shape and fills nothing: it sits in the frame's
// opening, dropped to the frame's sill
const geometry = { ...measured, ...Object.fromEntries(CATALOG.flatMap(part => part.frame ? [[part.ldraw, { ...measured[part.frame], studs: [], fill: [], drop: paneDrop(library, part.ldraw, part.frame) }]] : [])) };
// each posable part's fill by pose, in its standing frame
const poses = Object.fromEntries(CATALOG.filter(part => part.limbs).map(part => [part.ldraw, measurePose(library, part, measured[part.ldraw])]));
// each hinge's base and top, the top at every angle, in its standing frame
const hinges = Object.fromEntries(CATALOG.filter(part => part.hinge).map(part => [part.ldraw, measureHinge(library, part, measured[part.ldraw])]));

// every color the packed parts are drawn in: the catalog's, and each fixed color a
// packed file draws a face or subfile in (a face's print, a piece's rim)
const drawnCodes = new Set([
  ...COLORS.map(color => color.code),
  ...CATALOG.flatMap(part => (part.pieces ?? []).map(line => Number(line.trim().split(/\s+/)[1]))),
  ...[...files].flatMap(name => readPart(library, name).split('\n').map(line => line.trim().split(/\s+/))
    .filter(fields => ['1', '3', '4'].includes(fields[0]) && /^\d+$/.test(fields[1] ?? ''))
    .map(fields => Number(fields[1]))),
].filter(code => (code !== 16) && (code !== 24)/*the inherited colors*/));

const config = readFileSync(join(library, 'LDConfig.ldr'), 'utf8');
const colors = Object.fromEntries([...drawnCodes].sort((a, b) => a - b).map(code => {
  const match = new RegExp(`^0 !COLOUR \\S+\\s+CODE\\s+${code}\\s+VALUE\\s+(#[0-9A-Fa-f]{6})`, 'm').exec(config);
  if(!match) throw new Error(`LDConfig.ldr has no color ${code}.`);
  return [code, match[1].toUpperCase()];
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
  '/** each posable part\'s fill by pose, in its standing frame (the standing footprint\'s',
  ' *  minimum corner and its bottom; a raised limb reaches past them): the cells its body',
  ' *  and every piece no limb moves fill (`core`), and each limb\'s at every angle, each with',
  ' *  how high its lowest point lies above the standing bottom (plates), and each accessory\'s',
  ' *  by slot at every angle of the limb it turns with (`gear`), keyed by LDraw file stem. A',
  ' *  pose fills their union and stands on its lowest point (SEE: grid.ts posed) */',
  `export const POSE_GEOMETRY: Readonly<Record<string, Readonly<{ core: PosedBody; limbs: Readonly<Record<string, Readonly<Record<string, PosedBody>>>>; gear: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, PosedBody>>>>>>; }>>> = ${JSON.stringify(poses)};`,
  '/** a body\'s fill in its part\'s standing frame and its lowest point (SEE: POSE_GEOMETRY) */',
  'type PosedBody = Readonly<{ fill: ReadonlyArray<readonly [number, number, number, number]>; bottom: number; }>;',
  '',
  '/** each hinge\'s fill in its standing frame: its base\'s (its own body and every piece',
  ' *  but its top) and its top\'s at every angle, and the cells of its top\'s studs at 0',
  ' *  (what a carry stands on), keyed by LDraw file stem. A turned hinge fills their',
  ' *  union (SEE: grid.ts hinged) */',
  `export const HINGE_GEOMETRY: Readonly<Record<string, Readonly<{ base: ReadonlyArray<readonly [number, number, number, number]>; top: Readonly<Record<string, ReadonlyArray<readonly [number, number, number, number]>>>; studs: ReadonlyArray<readonly [number, number]>; }>>> = ${JSON.stringify(hinges)};`,
  '',
  '/** the declared resource (manifest.json `bundle.resources`) holding each LDraw file',
  ' *  stem not built into the Application, lower case; every other stem is in parts/built-in.ldr */',
  `export const PART_RESOURCES: Readonly<Record<string, string>> = ${JSON.stringify(partResources, null, 2)};`,
  '',
  '/** LDConfig color value of every color the packed parts are drawn in (the catalog\'s',
  ' *  and the fixed colors their files and pieces use), keyed by LDraw color code */',
  `export const COLOR_VALUES: Readonly<Record<number, string>> = ${JSON.stringify(colors, null, 2)};`,
  '',
].join('\n');
writeFileSync(join(SOURCE_DIR, 'parts.generated.ts'), facts);

console.log(`Packed ${CATALOG.length} parts (${files.size} files): ${(pack.length / 1024).toFixed(0)} KB built in, ${families.length} families read when shown.`);
for(const [family, size] of familySizes) console.log(`  ${familyResource(family).padEnd(30)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
for(const part of CATALOG) {
  const g = geometry[part.ldraw];
  const box = g.fill.every(([, , bottom, top]) => (bottom === 0) && (top === g.height)) && (g.fill.length === (g.width * g.depth));
  console.log(`  ${part.key.padEnd(22)} ${part.ldraw.padEnd(6)} ${g.width}x${g.depth}x${g.height}  origin ${g.origin}  studs ${g.studs.length}  ${box ? 'box' : `fill ${JSON.stringify(g.fill)}`}`);
}
