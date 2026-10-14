import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Build } from './build';
import type { FidelityControl } from './fidelity-control';
import { CATALOG, COLORS, type CatalogPart } from './catalog';
import { reportCheck, TRUNCATED } from './check';
import { DesignExists, type Designs } from './designs';
import { getShape, type PartShape } from './grid';
import { fidelityLabel, toFidelity } from './render/fidelity';
import type { Viewer } from './viewer';

// the Charm command surface (SEE: manifest.json `advertise`). Results are terse
// model-facing data. Every command waits for the build to load; an edit resolves
// once the build has the app-content's new text and it is drawn, so a following
// Application screenshot shows it
// ********************************************************************************
// == Constants ===================================================================
/** the grid conventions, returned once by listParts */
const GRID = [
  'x runs east, z north, level up. A cell is one stud; a level is one plate (a brick is 3 levels tall).',
  'A part\'s x, z is the south-west corner of its footprint and level is its bottom.',
  'At rotation 0 a part spans width along x and depth along z; rotation 90, 180 or 270 turns it clockwise seen from above (90 and 270 swap width and depth).',
  'A part holds the part above it where its top studs lie under that part. Tiles have no top studs; a slope has studs only along its high row.',
  'Each part row reads: name, then width x depth x height (studs, studs, levels), then which way a slope or curve descends at rotation 0.',
  'A name\'s third number counts bricks (brick-1x1x3 is 9 levels tall); the row gives every height in levels.',
  'A part that does not fill its whole box ends its row with fills: its cells at rotation 0, rows from north to south separated by /, cells west to east separated by commas; # fills the part\'s full height, . is empty, and a-b fills levels a up to but not including b counted from the part\'s bottom (an arch\'s span, an inverted slope\'s underside). Other parts fill their whole box.',
  'The slope name gives its angle (45, 33 or 65 degrees). A ridge peaks along an east-west line across its middle at rotation 0 and descends north and south. A roof corner names the corner it peaks at (outside) or dips at (inside); its only studs are on its high cells. A window or door frame\'s opening counts as filled.',
  'Creatures stand on their feet and fill part of their box; leave room around them.',
  'Trees, bushes and plants stand on their base (the cells their fill starts at 0) and spread over the cells around it from higher up, so smaller parts fit under the foliage.',
  'A glass part fills nothing: place it at its frame\'s exact x, z, level and rotation (its row names the frame). Removing the frame removes its glass; glass with no frame floats.',
  'A wheel set is a plate between two wheels on an axle running east-west at rotation 0, so it rolls north and south; it stands on its tires. Its studs are lower than its tires: its row names the level they are at, and parts over its wheel columns must clear the tires. A mudguard placed one level above a wheel set\'s studs, on a plate across them, arches over its wheels. A steering wheel faces north at rotation 0.',
  'Colors named trans- are see-through plastic.',
  'A build can be split into building steps the Studio plays in order: addParts with newStep: true puts its parts in a new step after the last.',
  'Level 0 stands on the baseplate. A view\'s azimuth 0 looks north from the south, 90 looks west from the east.',
].join(' ');

// == Class =======================================================================
export class CommandSurface {
  public constructor(private readonly build: Build, private readonly designs: Designs, private readonly viewer: Viewer, private readonly look: FidelityControl) {}

  /** the build's check, model-facing: never sound while the document holds more
   *  than one build, since it covers only the one shown */
  private report() {
    const conflict = this.build.conflict();
    return { ...reportCheck(this.build.check()), ...(conflict ? { ok: false, conflict } : {}) };
  }

  /** frames a build that has just replaced the last one whole, once it is drawn */
  private async showWhole(): Promise<void> {
    await this.viewer.setView(this.viewer.getView(), true);
    await this.viewer.whenSettled();
  }

  /** registers the commands; called once from main.ts */
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    charmiq.exportCommands({
      listParts: () => ({
        grid: GRID,
        parts: CATALOG.map(partRow),
        colors: COLORS.map(color => color.key),
      }),

      listPlacedParts: async () => {
        await this.build.whenReady();
        const model = this.build.getModel();
        const conflict = this.build.conflict();
        const steps = model.steps;
        const parts = steps ? model.placements.map((placement, index) => ({ ...placement, step: steps.placements[index] })) : model.placements;
        return { parts, ...((model.others.length > 0) ? { unchecked: model.others.length } : {}), ...(model.truncated ? { truncated: TRUNCATED } : {}), ...(conflict ? { conflict } : {}) };
      },

      addParts: async ({ parts, newStep }: { parts?: unknown; newStep?: unknown; }) => {
        const result = await this.build.add(Array.isArray(parts) ? parts : [], newStep === true);
        await this.viewer.whenSettled();
        return { added: result.added, total: result.total, ...((result.floating.length > 0) ? { floating: result.floating } : {}) };
      },
      removeParts: async ({ at }: { at?: unknown; }) => {
        const result = await this.build.remove(Array.isArray(at) ? at : []);
        await this.viewer.whenSettled();
        return { removed: result.removed, ...((result.empty.length > 0) ? { empty: result.empty } : {}) };
      },

      clear: async () => {
        const removed = await this.build.clear();
        await this.viewer.setView(this.viewer.getView(), true);
        return { removed };
      },

      setFidelity: async ({ fidelity }: { fidelity?: unknown; }) => {
        const stop = toFidelity(fidelity);
        if(stop === undefined) throw new Error('fidelity must be 0, 1, 2, 3 or 4');
        const reached = await this.look.set(stop);
        await this.viewer.whenSettled()/*a screenshot next shows the settled look*/;
        return { fidelity: reached, look: fidelityLabel(reached) };
      },

      getModel: async () => {
        await this.build.whenReady();
        const conflict = this.build.conflict();
        return conflict ? { conflict, builds: this.build.builds() }/*each build's text, to recover from*/ : this.build.getText();
      },
      setModel: async ({ ldraw }: { ldraw?: unknown; }) => {
        await this.build.replace((typeof ldraw === 'string') ? ldraw : '');
        await this.showWhole();
        return this.report();
      },

      listDesigns: async () => {
        const designs = await this.designs.list()/*waits for the chosen folder*/;
        return { folder: this.designs.getFolder().name, designs };
      },
      loadDesign: async ({ name }: { name?: unknown; }) => {
        const loaded = await this.designs.load((typeof name === 'string') ? name : '');
        await this.showWhole();
        return { loaded, ...this.report() };
      },
      saveDesign: async ({ name, replace }: { name?: unknown; replace?: unknown; }) => {
        try {
          const saved = await this.designs.save((typeof name === 'string') ? name : '', replace === true);
          return { saved: saved.name, folder: saved.folder.name, ...(saved.replaced ? { replaced: true } : {}) };
        } catch(error) {
          if(error instanceof DesignExists) throw new Error(`${error.message} Pass replace: true to write over it.`);
          throw error;
        }
      },

      check: async () => { await this.build.whenReady(); return this.report(); },

      setView: async ({ azimuth, elevation, fit }: { azimuth?: unknown; elevation?: unknown; fit?: unknown; }) => {
        const current = this.viewer.getView();
        await this.viewer.setView({
          azimuth: (typeof azimuth === 'number') ? azimuth : current.azimuth,
          elevation: (typeof elevation === 'number') ? elevation : current.elevation,
        }, fit !== false);
        await this.viewer.whenSettled()/*a screenshot next shows the settled frame*/;
        return this.viewer.getView();
      },
    });
  }
}

// == Util ========================================================================
/** a part's listParts row (SEE: GRID) */
const partRow = (part: CatalogPart): string => {
  const shape = getShape(part);
  const frame = part.frame ? CATALOG.find(other => other.ldraw === part.frame) : undefined;
  const descent = (part.kind === 'slope') ? ` descends ${slopeDescent(shape.studs, shape.depth)}` :
    ((part.kind === 'curve') && shape.descends) ? ` descends ${shape.descends}` :
    (part.kind === 'roof-corner') ? roofCorner(shape) :
    '';
  const fills = (!frame && (part.kind !== 'creature') && !fillsBox(shape)) ? ` fills ${fillMap(shape)}` : ''/*a creature's shape is checked, not listed*/;
  const studs = (shape.top !== undefined) ? ` studs at level ${shape.top}` : '';
  return `${part.key} ${shape.width}x${shape.depth}x${shape.height}${descent}${studs}${fills}${frame ? ` sits in ${frame.key}` : ''}`;
};

/** where a roof corner peaks (a lone stud cell) or dips (the one cell without a stud) */
const roofCorner = (shape: PartShape): string => {
  const studded = (x: number, z: number) => shape.studs.some(([studX, studZ]) => (studX === x) && (studZ === z));
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
  const corner = ([x, z]: readonly [number, number]) => `${(z > 0) ? 'north' : 'south'}-${(x > 0) ? 'east' : 'west'}`;
  if(shape.studs.length === 1) return ` peaks ${corner(shape.studs[0])}`;
  const bare = cells.find(([x, z]) => !studded(x, z));
  return bare ? ` dips ${corner(bare)}` : '';
};

/** whether a part fills every cell of its box at every level */
const fillsBox = (shape: PartShape): boolean =>
  (shape.fill.length === (shape.width * shape.depth)) && shape.fill.every(([, , bottom, top]) => (bottom === 0) && (top === shape.height));

/** a part's cells, rows north to south (SEE: GRID) */
const fillMap = (shape: PartShape): string => {
  const rows: string[] = [];
  for(let z=(shape.depth - 1); z>=0; z--) {
    const cells: string[] = [];
    for(let x=0; x<shape.width; x++) {
      const cell = shape.fill.find(([cellX, cellZ]) => (cellX === x) && (cellZ === z));
      cells.push(!cell ? '.' : ((cell[2] === 0) && (cell[3] === shape.height)) ? '#' : `${cell[2]}-${cell[3]}`);
    }
    rows.push(cells.join(','));
  }
  return rows.join('/');
};

/** the direction a slope descends at rotation 0: away from its stud row */
const slopeDescent = (studs: ReadonlyArray<readonly [number, number]>, depth: number): string =>
  (studs.every(([, z]) => z === (depth - 1))) ? 'south' : 'north';
