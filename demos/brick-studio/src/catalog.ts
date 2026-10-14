// the curated parts and colors a build may use. Hand-written: a part's name, kind
// and LDraw file. Its footprint, height, fill and studs are measured from the LDraw
// geometry by tools/pack-parts.ts into parts.generated.ts, never typed here
// NOTE: this module has no imports so that tools/pack-parts.ts can load it directly
// ********************************************************************************
// == Parts =======================================================================
export type PartKind = 'brick' | 'plate' | 'tile' | 'slope' | 'round' | 'arch' | 'corner' | 'wedge' | 'inverted' | 'ridge' | 'roof-corner' | 'window' | 'glass' | 'curve' | 'plant' | 'rock' | 'fence' | 'detail' | 'creature';

// ................................................................................
export type CatalogPart = Readonly<{
  /** the name a build uses for this part (e.g. `brick-2x4`) */
  key: string;
  /** the LDraw file stem in the LDraw Parts Library (e.g. `3001`) */
  ldraw: string;
  kind: PartKind;
  /** a glass pane's frame (LDraw file stem): the pane sits in it, at its position */
  frame?: string;
}>;

/** whether a kind's underside is open (an arch's span, an inverted slope's face, a
 *  plant's foliage over its base): its fill is measured from below there, never
 *  assumed to reach its bottom */
export const hasOpenUnderside = (kind: PartKind): boolean => (kind === 'inverted') || (kind === 'arch') || (kind === 'plant') || (kind === 'creature');

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
  { key: 'brick-1x10', ldraw: '6111', kind: 'brick' },
  { key: 'brick-1x12', ldraw: '6112', kind: 'brick' },
  { key: 'brick-1x16', ldraw: '2465', kind: 'brick' },
  { key: 'brick-2x10', ldraw: '3006', kind: 'brick' },

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
  { key: 'plate-1x10', ldraw: '4477',  kind: 'plate' },
  { key: 'plate-1x12', ldraw: '60479', kind: 'plate' },
  { key: 'plate-2x10', ldraw: '3832',  kind: 'plate' },
  { key: 'plate-2x12', ldraw: '2445',  kind: 'plate' },
  { key: 'plate-4x6',  ldraw: '3032',  kind: 'plate' },
  { key: 'plate-4x8',  ldraw: '3035',  kind: 'plate' },
  { key: 'plate-4x10', ldraw: '3030',  kind: 'plate' },
  { key: 'plate-6x8',  ldraw: '3036',  kind: 'plate' },
  { key: 'plate-6x10', ldraw: '3033',  kind: 'plate' },
  { key: 'plate-8x8',  ldraw: '41539', kind: 'plate' },

  { key: 'tile-1x1',  ldraw: '3070b', kind: 'tile' },
  { key: 'tile-1x2',  ldraw: '3069b', kind: 'tile' },
  { key: 'tile-1x4',  ldraw: '2431',  kind: 'tile' },
  { key: 'tile-2x2',  ldraw: '3068b', kind: 'tile' },
  { key: 'tile-1x3',  ldraw: '63864', kind: 'tile' },
  { key: 'tile-1x6',  ldraw: '6636',  kind: 'tile' },
  { key: 'tile-1x8',  ldraw: '4162',  kind: 'tile' },
  { key: 'tile-2x4',  ldraw: '87079', kind: 'tile' },

  // the angle names the slope; documents store LDraw files, never these keys
  { key: 'slope-45-2x1', ldraw: '3040b',  kind: 'slope' },
  { key: 'slope-45-2x2', ldraw: '3039',   kind: 'slope' },
  { key: 'slope-45-2x3', ldraw: '3038',   kind: 'slope' },
  { key: 'slope-45-2x4', ldraw: '3037',   kind: 'slope' },
  { key: 'slope-33-3x1', ldraw: '4286',   kind: 'slope' },
  { key: 'slope-33-3x2', ldraw: '3298',   kind: 'slope' },
  { key: 'slope-33-3x4', ldraw: '3297',   kind: 'slope' },
  { key: 'slope-65-2x1', ldraw: '60481a', kind: 'slope' },
  { key: 'slope-65-2x2', ldraw: '3678b',  kind: 'slope' },

  { key: 'round-brick-1x1', ldraw: '3062b', kind: 'round' },
  { key: 'round-brick-2x2', ldraw: '3941',  kind: 'round' },
  { key: 'round-plate-1x1', ldraw: '6141',  kind: 'round' },
  { key: 'round-plate-2x2', ldraw: '4032a', kind: 'round' },
  { key: 'round-tile-1x1',  ldraw: '98138', kind: 'round' },
  { key: 'cone-1x1',        ldraw: '4589',  kind: 'round' },

  { key: 'arch-1x4', ldraw: '3659', kind: 'arch' },
  { key: 'arch-1x6', ldraw: '3455', kind: 'arch' },

  { key: 'corner-brick-2x2', ldraw: '2357', kind: 'corner' },
  { key: 'corner-plate-2x2', ldraw: '2420', kind: 'corner' },

  { key: 'wedge-plate-2x3-right', ldraw: '43722a', kind: 'wedge' },
  { key: 'wedge-plate-2x3-left',  ldraw: '43723a', kind: 'wedge' },
  { key: 'wedge-plate-2x4-right', ldraw: '41769a', kind: 'wedge' },
  { key: 'wedge-plate-2x4-left',  ldraw: '41770a', kind: 'wedge' },

  { key: 'inverted-slope-45-2x1', ldraw: '3665a', kind: 'inverted' },
  { key: 'inverted-slope-45-2x2', ldraw: '3660a', kind: 'inverted' },
  { key: 'inverted-slope-33-3x2', ldraw: '3747b', kind: 'inverted' },

  { key: 'ridge-45-2x1',        ldraw: '3044b', kind: 'ridge' },
  { key: 'ridge-45-2x2',        ldraw: '3043',  kind: 'ridge' },
  { key: 'roof-corner-outside', ldraw: '3045',  kind: 'roof-corner' },
  { key: 'roof-corner-inside',  ldraw: '3046',  kind: 'roof-corner' },

  { key: 'window-1x2x2', ldraw: '60592', kind: 'window' },
  { key: 'window-1x2x3', ldraw: '60593', kind: 'window' },
  { key: 'window-1x4x3', ldraw: '60594', kind: 'window' },
  { key: 'door-frame-1x4x6', ldraw: '60596', kind: 'window' },

  { key: 'glass-1x2x2', ldraw: '60601', kind: 'glass', frame: '60592' },
  { key: 'glass-1x2x3', ldraw: '60602', kind: 'glass', frame: '60593' },
  { key: 'glass-1x4x3', ldraw: '60603', kind: 'glass', frame: '60594' },

  // a plant or rock is named without a size: its foliage or points spread past its
  // base, and its listParts row gives the cells it fills
  { key: 'tree-pine-small', ldraw: '2435',  kind: 'plant' },
  { key: 'tree-pine',       ldraw: '3471',  kind: 'plant' },
  { key: 'tree-oval',       ldraw: '3470',  kind: 'plant' },
  { key: 'tree-tall',       ldraw: '3778',  kind: 'plant' },
  { key: 'bush',            ldraw: '6064b', kind: 'plant' },
  { key: 'leafy-plant',     ldraw: '6255',  kind: 'plant' },
  { key: 'bamboo',          ldraw: '30176', kind: 'plant' },
  { key: 'leaf-plate',      ldraw: '32607', kind: 'plant' },
  { key: 'flower-plate-1x1', ldraw: '24866', kind: 'plant' },
  { key: 'grass-stem',      ldraw: '15279', kind: 'plant' },

  { key: 'rock-4x4',        ldraw: '42284', kind: 'rock' },
  { key: 'crystal-small',   ldraw: '30385', kind: 'rock' },
  { key: 'crystal-large',   ldraw: '30213', kind: 'rock' },

  { key: 'fence-lattice-1x4x1', ldraw: '3633',  kind: 'fence' },
  { key: 'fence-lattice-1x4x2', ldraw: '3185',  kind: 'fence' },
  { key: 'fence-spindled-1x4x2', ldraw: '30055', kind: 'fence' },

  { key: 'pillar-round-1x1x6', ldraw: '43888', kind: 'detail' },
  { key: 'brick-1x1x3',     ldraw: '14716', kind: 'detail' },
  { key: 'brick-1x1x5',     ldraw: '2453b', kind: 'detail' },
  { key: 'headlight-brick-1x1', ldraw: '4070', kind: 'detail' },
  { key: 'grille-brick-1x2', ldraw: '2877', kind: 'detail' },
  { key: 'round-tile-2x2',  ldraw: '14769', kind: 'detail' },
  { key: 'swirl-plate-1x1', ldraw: '15470', kind: 'detail' },
  { key: 'log-brick-1x2',   ldraw: '30136', kind: 'detail' },
  { key: 'log-brick-1x4',   ldraw: '30137', kind: 'detail' },
  { key: 'panel-1x2x1',     ldraw: '4865b', kind: 'detail' },
  { key: 'panel-1x2x3',     ldraw: '2362b', kind: 'detail' },
  { key: 'panel-1x4x1',     ldraw: '30413', kind: 'detail' },
  { key: 'grille-tile-1x2', ldraw: '2412b', kind: 'detail' },
  { key: 'rounded-tile-1x1', ldraw: '24246', kind: 'detail' },
  { key: 'rounded-tile-1x2', ldraw: '1126',  kind: 'detail' },
  { key: 'corner-tile-2x2', ldraw: '14719', kind: 'detail' },
  { key: 'quarter-round-tile-2x2', ldraw: '27925', kind: 'detail' },
  { key: 'door-rail-plate-1x2', ldraw: '32028', kind: 'detail' },
  { key: 'tooth-plate-1x1', ldraw: '15070', kind: 'detail' },

  { key: 'curve-2x1',       ldraw: '11477', kind: 'curve' },
  { key: 'curve-3x1',       ldraw: '50950', kind: 'curve' },
  { key: 'curve-4x1-tall',  ldraw: '3573',  kind: 'curve' },
  { key: 'curve-6x1',       ldraw: '42022', kind: 'curve' },
  { key: 'curve-2x2',       ldraw: '15068', kind: 'curve' },
  { key: 'curve-3x2',       ldraw: '24309', kind: 'curve' },
  { key: 'curve-6x2',       ldraw: '44126', kind: 'curve' },
  { key: 'curve-8x2',       ldraw: '42918', kind: 'curve' },
  { key: 'curve-top-2x2',   ldraw: '30602', kind: 'curve' },
  { key: 'inverted-curve-2x1', ldraw: '24201', kind: 'inverted' },
  { key: 'inverted-curve-4x1', ldraw: '13547', kind: 'inverted' },
  { key: 'inverted-curve-6x1', ldraw: '42023', kind: 'inverted' },
  { key: 'inverted-curve-2x2', ldraw: '32803', kind: 'inverted' },

  { key: 'cone-half-4x2',   ldraw: '38317', kind: 'round' },
  { key: 'dish-2x2',        ldraw: '2654b', kind: 'round' },
  { key: 'dish-3x3',        ldraw: '43898', kind: 'round' },
  { key: 'dish-6x6',        ldraw: '44375b', kind: 'round' },
  { key: 'dish-8x8',        ldraw: '3961',  kind: 'round' },
  { key: 'dome-2x2',        ldraw: '24947', kind: 'round' },
  { key: 'cylinder-half-2x4', ldraw: '24593', kind: 'round' },

  { key: 'cat',             ldraw: '11602', kind: 'creature' },
  { key: 'cat-crouching',   ldraw: '6251',  kind: 'creature' },
  { key: 'dog-terrier',     ldraw: '26078', kind: 'creature' },
  { key: 'dog-bulldog',     ldraw: '29602', kind: 'creature' },
  { key: 'dog-dachshund',   ldraw: '53075', kind: 'creature' },
  { key: 'puppy',           ldraw: '2889',  kind: 'creature' },
  { key: 'bunny',           ldraw: '29685', kind: 'creature' },
  { key: 'rabbit',          ldraw: '33207', kind: 'creature' },
  { key: 'mouse',           ldraw: '35757', kind: 'creature' },
  { key: 'rat',             ldraw: '40234', kind: 'creature' },
  { key: 'squirrel',        ldraw: '11568', kind: 'creature' },
  { key: 'frog',            ldraw: '33320', kind: 'creature' },
  { key: 'turtle',          ldraw: '11603', kind: 'creature' },
  { key: 'snake',           ldraw: '30115', kind: 'creature' },
  { key: 'snake-large',     ldraw: '38801', kind: 'creature' },
  { key: 'crab',            ldraw: '33121', kind: 'creature' },
  { key: 'starfish',        ldraw: '33122', kind: 'creature' },
  { key: 'spider',          ldraw: '30238', kind: 'creature' },
  { key: 'octopus',         ldraw: '6086',  kind: 'creature' },
  { key: 'penguin',         ldraw: '26074', kind: 'creature' },
  { key: 'owl',             ldraw: '40232', kind: 'creature' },
  { key: 'parrot',          ldraw: '2546',  kind: 'creature' },
  { key: 'seagull',         ldraw: '12891', kind: 'creature' },
  { key: 'chick',           ldraw: '3918',  kind: 'creature' },
  { key: 'duckling',        ldraw: '49661', kind: 'creature' },
  { key: 'flamingo',        ldraw: '57798', kind: 'creature' },
  { key: 'piglet',          ldraw: '1410',  kind: 'creature' },
  { key: 'lamb',            ldraw: '1569',  kind: 'creature' },
  { key: 'cow',             ldraw: '64452', kind: 'creature' },
  { key: 'wolf',            ldraw: '6649',  kind: 'creature' },
  { key: 'dinosaur',        ldraw: '30464', kind: 'creature' },
];

// == Colors ======================================================================
export type CatalogColor = Readonly<{
  /** the name a build uses for this color (e.g. `red`) */
  key: string;
  /** the LDraw color code (LDConfig.ldr) */
  code: number;
  /** see-through plastic */
  transparent?: true;
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

  { key: 'trans-clear',      code: 47, transparent: true },
  { key: 'trans-red',        code: 36, transparent: true },
  { key: 'trans-orange',     code: 57, transparent: true },
  { key: 'trans-yellow',     code: 46, transparent: true },
  { key: 'trans-green',      code: 34, transparent: true },
  { key: 'trans-light-blue', code: 43, transparent: true },
  { key: 'trans-dark-blue',  code: 33, transparent: true },
];
