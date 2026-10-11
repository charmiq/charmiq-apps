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

import { CATALOG, COLORS } from '../src/catalog.ts';

// == Constants ===================================================================
const LDU_PER_STUD = 20/*LDU*/;
const LDU_PER_PLATE = 8/*LDU*/;
const EPSILON = 0.01/*LDU*/;

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// == Types =======================================================================
/** a 3x4 affine transform: rotation rows a..i, translation x, y, z */
type Transform = readonly [number, number, number, number, number, number, number, number, number, number, number, number];
const IDENTITY: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

type Measure = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; studs: Array<[number, number, number]>; };

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

// --------------------------------------------------------------------------------
/** walks a file's geometry under `transform`, measuring the body and recording each
 *  top stud's position. The body is what lies at or below the top face (y 0, -y up):
 *  studs stand above it, whatever primitive draws them, and an underside tube named
 *  like a stud (`stud4.dat`) is body */
const measure = (library: string, name: string, transform: Transform, out: Measure): void => {
  for(const line of readPart(library, name).split('\n')) {
    const fields = line.trim().split(/\s+/);
    switch(fields[0]) {
      case '1': {
        const values = fields.slice(2, 14).map(Number);
        const child = referenceName(fields.slice(14).join(' '));
        const local: Transform = [values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[0], values[1], values[2]];
        const world = compose(transform, local);
        if(isStud(child)) out.studs.push(apply(world, 0, 0, 0));
        measure(library, child, world, out);
        break;
      }
      case '3':
      case '4': {
        const values = fields.slice(2).map(Number);
        for(let v=0; v<(Number(fields[0]) * 3); v+=3) {
          const [x, y, z] = apply(transform, values[v], values[v + 1], values[v + 2]);
          if(y < -EPSILON) continue/*above the top face: a stud*/;
          out.minX = Math.min(out.minX, x); out.maxX = Math.max(out.maxX, x);
          out.minY = Math.min(out.minY, y); out.maxY = Math.max(out.maxY, y);
          out.minZ = Math.min(out.minZ, z); out.maxZ = Math.max(out.maxZ, z);
        }
        break;
      }
      default: break/*meta, lines and conditional lines carry no body*/;
    }
  }
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

/** footprint (studs), height (plates), origin and top-stud cells of one part, from
 *  the footprint's minimum corner. The origin lies on the top face; -y is up (LDraw) */
const measurePart = (library: string, ldraw: string) => {
  const out: Measure = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, studs: [] };
  measure(library, `${ldraw}.dat`, IDENTITY, out);

  const width = (out.maxX - out.minX) / LDU_PER_STUD;
  const depth = (out.maxZ - out.minZ) / LDU_PER_STUD;
  const height = out.maxY / LDU_PER_PLATE;
  if(!isWhole(width) || !isWhole(depth) || !isWhole(height)) throw new Error(`${ldraw}: footprint ${width} x ${depth} x ${height} is not on the grid.`);
  if(Math.abs(out.minY) > EPSILON) throw new Error(`${ldraw}: origin is not on the top face.`);

  // the origin in studs from the minimum corner (a slope's sits over its stud row)
  const origin = [-out.minX / LDU_PER_STUD, -out.minZ / LDU_PER_STUD] as [number, number];
  if(!isWhole(origin[0] * 2) || !isWhole(origin[1] * 2)) throw new Error(`${ldraw}: origin ${origin} is not on a half stud.`);
  const halfStud = (value: number): number => Math.round(value * 2) / 2/*a round part's facets leave float noise*/;

  // a top stud sits on the top face (y 0); underside studs sit below it
  const studs = out.studs
    .filter(([, y]) => Math.abs(y) < EPSILON)
    .map(([x, , z]) => [(x - out.minX) / LDU_PER_STUD - 0.5, (z - out.minZ) / LDU_PER_STUD - 0.5] as [number, number])
    .map(([x, z]) => {
      if(!isWhole(x) || !isWhole(z)) throw new Error(`${ldraw}: stud at ${x}, ${z} is not on a cell.`);
      return [Math.round(x), Math.round(z)] as [number, number];
    })
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return { width: Math.round(width), depth: Math.round(depth), height: Math.round(height), origin: [halfStud(origin[0]), halfStud(origin[1])], studs };
};

// == Main ========================================================================
const library = process.argv[2];
if(!library || !existsSync(join(library, 'LDConfig.ldr'))) {
  console.error('Usage: node demos/brick-studio/tools/pack-parts.ts <path to the extracted ldraw directory>');
  process.exit(1);
} /* else -- XXX */

// .. Pack ........................................................................
const files = new Set<string>();
for(const part of CATALOG) closure(library, `${part.ldraw}.dat`, files);

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
const geometry = Object.fromEntries(CATALOG.map(part => [part.ldraw, measurePart(library, part.ldraw)]));

const config = readFileSync(join(library, 'LDConfig.ldr'), 'utf8');
const colors = Object.fromEntries(COLORS.map(color => {
  const match = new RegExp(`^0 !COLOUR \\S+\\s+CODE\\s+${color.code}\\s+VALUE\\s+(#[0-9A-Fa-f]{6})`, 'm').exec(config);
  if(!match) throw new Error(`LDConfig.ldr has no color ${color.code}.`);
  return [color.code, match[1].toUpperCase()];
}));

const facts = [
  '// each catalog part\'s footprint, height and top studs, and each catalog color\'s',
  '// value, measured from the LDraw Parts Library by tools/pack-parts.ts -- do not edit',
  '// ********************************************************************************',
  '/** footprint in studs along x (`width`) and z (`depth`), height in plates, the LDraw',
  ' *  origin in studs from the footprint\'s minimum corner, and the top-stud cells, all',
  ' *  at rotation 0, keyed by LDraw file stem */',
  `export const PART_GEOMETRY: Readonly<Record<string, Readonly<{ width: number; depth: number; height: number; origin: readonly [number, number]; studs: ReadonlyArray<readonly [number, number]>; }>>> = ${JSON.stringify(geometry)};`,
  '',
  '/** LDConfig color value, keyed by LDraw color code */',
  `export const COLOR_VALUES: Readonly<Record<number, string>> = ${JSON.stringify(colors, null, 2)};`,
  '',
].join('\n');
writeFileSync(join(SOURCE_DIR, 'parts.generated.ts'), facts);

console.log(`Packed ${CATALOG.length} parts (${files.size} files, ${(pack.length / 1024).toFixed(0)} KB).`);
for(const part of CATALOG) {
  const g = geometry[part.ldraw];
  console.log(`  ${part.key.padEnd(10)} ${part.ldraw.padEnd(6)} ${g.width}x${g.depth}x${g.height}  origin ${g.origin}  studs ${g.studs.length}${(part.kind === 'slope') ? ` ${JSON.stringify(g.studs)}` : ''}`);
}
