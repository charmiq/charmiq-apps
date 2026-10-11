import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Build } from './build';
import type { FidelityControl } from './fidelity-control';
import { CATALOG, COLORS } from './catalog';
import { reportCheck } from './check';
import { getShape } from './grid';
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
        parts: CATALOG.map(part => {
          const shape = getShape(part);
          return {
            part: part.key, kind: part.kind, width: shape.width, depth: shape.depth, height: shape.height,
            ...((part.kind === 'slope') ? { slope: `descends ${slopeDescent(shape.studs, shape.depth)} at rotation 0` } : {}),
          };
        }),
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
        return this.viewer.getView();
      },
    });
  }
}

// == Util ========================================================================
/** the direction a slope descends at rotation 0: away from its stud row */
const slopeDescent = (studs: ReadonlyArray<readonly [number, number]>, depth: number): string =>
  (studs.every(([, z]) => z === (depth - 1))) ? 'south' : 'north';
