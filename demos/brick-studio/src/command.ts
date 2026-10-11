import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Build } from './build';
import type { FidelityControl } from './fidelity-control';
import { CATALOG, COLORS, type CatalogPart } from './catalog';
import { reportCheck } from './check';
import { getShape, type PartShape } from './grid';
import { fidelityLabel, toFidelity } from './render/fidelity';
import type { Viewer } from './viewer';

// the Charm command surface (SEE: manifest.json `advertise`). Results are terse
// model-facing data; an edit resolves once the build is drawn so a following
// Application screenshot shows it
// ********************************************************************************
// == Constants ===================================================================
/** the grid conventions, returned once by listParts */
const GRID = [
  'x runs east, z north, level up. A cell is one stud; a level is one plate (a brick is 3 levels tall).',
  'A part\'s x, z is the south-west corner of its footprint and level is its bottom.',
  'At rotation 0 a part spans width along x and depth along z; rotation 90, 180 or 270 turns it clockwise seen from above (90 and 270 swap width and depth).',
  'A part holds the part above it where its top studs lie under that part. Tiles have no top studs; a slope has studs only along its high row.',
  'Each part row reads: name, then width x depth x height (studs, studs, levels), then which way a slope descends at rotation 0.',
  'A part that does not fill its whole box ends its row with fills: its cells at rotation 0, rows from north to south separated by /, cells west to east separated by commas; # fills the part\'s full height, . is empty, and a-b fills levels a up to but not including b counted from the part\'s bottom (an arch\'s span, an inverted slope\'s underside). Other parts fill their whole box.',
  'The slope name gives its angle (45, 33 or 65 degrees). A ridge peaks along an east-west line across its middle at rotation 0 and descends north and south. A roof corner names the corner it peaks at (outside) or dips at (inside); its only studs are on its high cells. A window or door frame\'s opening counts as filled.',
  'Trees, bushes and plants stand on their base (the cells their fill starts at 0) and spread over the cells around it from higher up, so smaller parts fit under the foliage.',
  'A glass part fills nothing: place it at its frame\'s exact x, z, level and rotation (its row names the frame). Removing the frame removes its glass; glass with no frame floats.',
  'Colors named trans- are see-through plastic.',
  'Level 0 stands on the baseplate. A view\'s azimuth 0 looks north from the south, 90 looks west from the east.',
].join(' ');

// == Class =======================================================================
export class CommandSurface {
  public constructor(private readonly build: Build, private readonly viewer: Viewer, private readonly look: FidelityControl) {}

  /** registers the commands; called once from main.ts */
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    charmiq.exportCommands({
      listParts: () => ({
        grid: GRID,
        parts: CATALOG.map(partRow),
        colors: COLORS.map(color => color.key),
      }),

      listPlacedParts: () => {
        const model = this.build.getModel();
        return { parts: model.placements, ...((model.others.length > 0) ? { unchecked: model.others.length } : {}) };
      },

      addParts: async ({ parts }: { parts?: unknown; }) => {
        const result = await this.build.add(Array.isArray(parts) ? parts : []);
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

      getModel: () => this.build.getText(),

      setModel: async ({ ldraw }: { ldraw?: unknown; }) => {
        await this.build.replace((typeof ldraw === 'string') ? ldraw : '');
        await this.viewer.setView(this.viewer.getView(), true)/*a new build is framed whole*/;
        await this.viewer.whenSettled();
        return reportCheck(this.build.check());
      },

      check: () => reportCheck(this.build.check()),

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
    (part.kind === 'roof-corner') ? roofCorner(shape) :
    '';
  const fills = (!frame && !fillsBox(shape)) ? ` fills ${fillMap(shape)}` : '';
  return `${part.key} ${shape.width}x${shape.depth}x${shape.height}${descent}${fills}${frame ? ` sits in ${frame.key}` : ''}`;
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
