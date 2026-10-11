// the curated parts and colors a build may use. Hand-written: a part's name, kind
// and LDraw file. Its footprint, height and studs are measured from the LDraw
// geometry by tools/pack-parts.ts into parts.generated.ts, never typed here
// NOTE: this module has no imports so that tools/pack-parts.ts can load it directly
// ********************************************************************************
// == Parts =======================================================================
export type PartKind = 'brick' | 'plate' | 'tile' | 'slope';

// ................................................................................
export type CatalogPart = Readonly<{
  /** the name a build uses for this part (e.g. `brick-2x4`) */
  key: string;
  /** the LDraw file stem in the LDraw Parts Library (e.g. `3001`) */
  ldraw: string;
  kind: PartKind;
}>;

// --------------------------------------------------------------------------------
export const CATALOG: ReadonlyArray<CatalogPart> = [
  { key: 'brick-1x1', ldraw: '3005',  kind: 'brick' },
  { key: 'brick-1x2', ldraw: '3004',  kind: 'brick' },
  { key: 'brick-1x3', ldraw: '3622',  kind: 'brick' },
  { key: 'brick-1x4', ldraw: '3010',  kind: 'brick' },
  { key: 'brick-1x6', ldraw: '3009',  kind: 'brick' },
  { key: 'brick-1x8', ldraw: '3008',  kind: 'brick' },
  { key: 'brick-2x2', ldraw: '3003',  kind: 'brick' },
  { key: 'brick-2x3', ldraw: '3002',  kind: 'brick' },
  { key: 'brick-2x4', ldraw: '3001',  kind: 'brick' },
  { key: 'brick-2x6', ldraw: '2456',  kind: 'brick' },
  { key: 'brick-2x8', ldraw: '3007',  kind: 'brick' },

  { key: 'plate-1x1', ldraw: '3024',  kind: 'plate' },
  { key: 'plate-1x2', ldraw: '3023b', kind: 'plate' },
  { key: 'plate-1x3', ldraw: '3623',  kind: 'plate' },
  { key: 'plate-1x4', ldraw: '3710',  kind: 'plate' },
  { key: 'plate-1x6', ldraw: '3666',  kind: 'plate' },
  { key: 'plate-1x8', ldraw: '3460',  kind: 'plate' },
  { key: 'plate-2x2', ldraw: '3022',  kind: 'plate' },
  { key: 'plate-2x3', ldraw: '3021',  kind: 'plate' },
  { key: 'plate-2x4', ldraw: '3020',  kind: 'plate' },
  { key: 'plate-2x6', ldraw: '3795',  kind: 'plate' },
  { key: 'plate-2x8', ldraw: '3034',  kind: 'plate' },
  { key: 'plate-4x4', ldraw: '3031',  kind: 'plate' },
  { key: 'plate-6x6', ldraw: '3958',  kind: 'plate' },

  { key: 'tile-1x1',  ldraw: '3070b', kind: 'tile' },
  { key: 'tile-1x2',  ldraw: '3069b', kind: 'tile' },
  { key: 'tile-1x4',  ldraw: '2431',  kind: 'tile' },
  { key: 'tile-2x2',  ldraw: '3068b', kind: 'tile' },

  { key: 'slope-2x1', ldraw: '3040b', kind: 'slope' },
  { key: 'slope-2x2', ldraw: '3039',  kind: 'slope' },
  { key: 'slope-2x3', ldraw: '3038',  kind: 'slope' },
  { key: 'slope-2x4', ldraw: '3037',  kind: 'slope' },
];

// == Colors ======================================================================
export type CatalogColor = Readonly<{
  /** the name a build uses for this color (e.g. `red`) */
  key: string;
  /** the LDraw color code (LDConfig.ldr) */
  code: number;
}>;

// --------------------------------------------------------------------------------
export const COLORS: ReadonlyArray<CatalogColor> = [
  { key: 'white',        code: 15 },
  { key: 'black',        code: 0 },
  { key: 'red',          code: 4 },
  { key: 'orange',       code: 25 },
  { key: 'yellow',       code: 14 },
  { key: 'lime',         code: 27 },
  { key: 'green',        code: 2 },
  { key: 'bright-green', code: 10 },
  { key: 'azure',        code: 322 },
  { key: 'medium-blue',  code: 73 },
  { key: 'blue',         code: 1 },
  { key: 'pink',         code: 5 },
  { key: 'tan',          code: 19 },
  { key: 'brown',        code: 70 },
  { key: 'light-gray',   code: 71 },
  { key: 'dark-gray',    code: 72 },
];
