import type { CharmIQAPI } from '../../../shared/charmiq';
import { MAX_COORDINATE, type Build } from './build';
import type { FidelityControl } from './fidelity-control';
import { CATALOG, COLORS, partsByKind, searchCatalog, type CatalogPart } from './catalog';
import { MAX_LISTED, reportCheck, TRUNCATED } from './check';
import { DesignExists, type Designs } from './designs';
import { footprintSize, getShape, BASEPLATE_MARGIN, BASEPLATE_MIN, type PartShape } from './grid';
import { fidelityLabel, toFidelity } from './render/fidelity';
import type { LookAround } from './look-around';
import type { Viewer } from './viewer';

// the Charm command surface (SEE: manifest.json `advertise`). Results are terse
// model-facing data. Every command waits for the build to load; an edit resolves
// once the build has the app-content's new text and it is drawn, so a following
// Application screenshot shows it
// ********************************************************************************
// == Constants ===================================================================
/** the most rows findParts returns, and the most it returns when not told */
const MAX_FOUND = 40;
const DEFAULT_FOUND = 12;
/** the most placed parts one listPlacedParts page holds */
const PARTS_PER_PAGE = 300;
/** the most UTF-8 bytes of LDraw one getModel page holds (whole lines) */
const TEXT_PAGE_BYTES = 48 * 1024/*bytes*/;

// --------------------------------------------------------------------------------
/** the grid conventions, returned once by listParts */
const GRID = [
  'x runs east, z north, level up. A cell is one stud; a level is one plate (a brick is 3 levels tall).',
  'A part\'s x, z is the south-west corner of its footprint and level is its bottom. A part standing on another starts where that part ends: its level plus its height (on a plate at level 1, a figure stands at level 2).',
  'At rotation 0 a part spans width along x and depth along z; rotation 90, 180 or 270 turns it clockwise seen from above (90 and 270 swap width and depth).',
  'A part holds the part above it where its top studs lie under that part. Tiles have no top studs; a slope has studs only along its high row.',
  'listParts names every part by kind; findParts gives the rows of the parts you will use (call it before placing a part whose size or fills you do not know). Each part row reads: name, then width x depth x height (studs, studs, levels), then which way a slope or curve descends at rotation 0.',
  'A name\'s third number counts bricks (brick-1x1x3 is 9 levels tall); the row gives every height in levels.',
  'A part that does not fill its whole box ends its row with fills: its cells at rotation 0, rows from north to south separated by /, cells west to east separated by commas; # fills the part\'s full height, . is empty, and a-b fills levels a up to but not including b counted from the part\'s bottom (an arch\'s span, an inverted slope\'s underside). Other parts fill their whole box.',
  'The slope name gives its angle (45, 33 or 65 degrees). A ridge peaks along an east-west line across its middle at rotation 0 and descends north and south. A roof corner names the corner it peaks at (outside) or dips at (inside); its only studs are on its high cells. A window or door frame\'s opening counts as filled.',
  'Creatures stand on their feet and fill part of their box; leave room around them.',
  'Trees, bushes and plants stand on their base (the cells their fill starts at 0) and spread over the cells around it from higher up, so smaller parts fit under the foliage.',
  'A glass part fills nothing: place it at its frame\'s exact x, z, level and rotation (its row names the frame). Removing the frame removes its glass; glass with no frame floats.',
  'A wheel set is a plate between two wheels on an axle running east-west at rotation 0, so it rolls north and south; it stands on its tires. Its studs are lower than its tires: its row names the level they are at, and parts over its wheel columns must clear the tires. A mudguard placed one level above a wheel set\'s studs, on a plate across them, arches over its wheels. A steering wheel faces north at rotation 0.',
  'A figure is a person: it stands on the middle two cells of its middle row, faces south at rotation 0, and its arms, hands and head reach into the cells around its feet (its row gives its fills), so figures side by side stand 4 studs apart. Its color is its shirt; its head and hands are yellow and its legs blue.',
  'Colors named trans- are see-through plastic.',
  'setGround colors the baseplate (green for grass, gray for a road, tan for sand): use it instead of covering the baseplate with plates. Parts on it still stand at level 0.',
  'A component is a group of parts defined once (defineComponent, in its own grid: x, z and level from 0) and placed many times: an addParts item {component, x, z, level, rotation} places a copy by its footprint\'s south-west corner and its bottom level, turned as a part is. Copies are checked as parts are; removing any cell of a copy removes the whole copy, and redefining a component changes every copy. Build a repeated thing (a tower, a house, a tree with a fence) as a component.',
  'A saved design can be a component too: defineComponentFromDesign defines one from a design in the designs folder (listDesigns names them), its footprint from x 0, z 0 and its lowest part at level 0, so a house, a car or a tree saved once is placed many times.',
  'A build can be split into building steps the Studio plays in order: addParts with newStep: true puts its parts in a new step after the last.',
  `The baseplate is no boundary: it grows with the build, ${BASEPLATE_MARGIN} studs beyond it on every side and never smaller than ${BASEPLATE_MIN} x ${BASEPLATE_MIN} studs (x and z from ${-BASEPLATE_MIN / 2} to ${BASEPLATE_MIN / 2} while the build is empty). Parts stand anywhere with x and z within ${MAX_COORDINATE} of the origin; center a scene near x 0, z 0.`,
  'Level 0 stands on the baseplate. A view\'s azimuth 0 looks north from the south, 90 looks west from the east. lookAround shows the build from all four sides at once, so one screenshot sees every side; the next change closes it.',
].join(' ');

// == Class =======================================================================
export class CommandSurface {
  public constructor(private readonly build: Build, private readonly designs: Designs, private readonly viewer: Viewer, private readonly lookAround: LookAround, private readonly look: FidelityControl) {}

  /** the build's check, model-facing: never sound while the document holds more
   *  than one build, since it covers only the one shown */
  private report() {
    const conflict = this.build.conflict();
    return { ...reportCheck(this.build.check()), ...(conflict ? { ok: false, conflict } : {}) };
  }

  /** frames a build that has just replaced the last one whole, once it is drawn */
  private async showWhole(): Promise<void> { await this.viewer.frameWhole(); }

  /** registers the commands; called once from main.ts */
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    charmiq.exportCommands({
      listParts: () => ({
        grid: GRID,
        parts: partsByKind().map(({ kind, names }) => `${kind}: ${names.join(', ')}`),
        colors: COLORS.map(color => color.key),
      }),
      findParts: ({ query, limit }: { query?: unknown; limit?: unknown; }) => {
        if((typeof query !== 'string') || (query.trim().length < 1)) throw new Error('query names the parts to find: a part\'s name, a size such as 2x4, a kind or a word such as roof');
        const count = ((typeof limit === 'number') && Number.isInteger(limit) && (limit > 0)) ? Math.min(limit, MAX_FOUND) : DEFAULT_FOUND;
        const found = searchCatalog(query);
        return { parts: found.slice(0, count).map(partRow), total: found.length };
      },

      listPlacedParts: async ({ from }: { from?: unknown; }) => {
        await this.build.whenReady();
        const model = this.build.getModel();
        const conflict = this.build.conflict();
        const steps = model.steps;
        // a part of its own, or a copy as one entry (its parts are its component's)
        const entries = [
          ...model.placements.flatMap((placement, index) => (model.placementCopies?.[index] === undefined) ? [steps ? { ...placement, step: steps.placements[index] } : placement] : []),
          ...(model.copies ?? []).map((copy, index) => steps ? { ...copy, step: steps.copies[index] } : copy),
        ];
        const start = pageStart(from);
        const end = Math.min(entries.length, start + PARTS_PER_PAGE);
        return {
          parts: entries.slice(start, end), total: entries.length, ...((end < entries.length) ? { next: end } : {}),
          ...((model.others.length > 0) ? { unchecked: model.others.length } : {}), ...(model.truncated ? { truncated: TRUNCATED } : {}), ...(conflict ? { conflict } : {}),
        };
      },

      defineComponent: async ({ name, parts }: { name?: unknown; parts?: unknown; }) => {
        const component = await this.build.defineComponent(name, Array.isArray(parts) ? parts : []);
        await this.viewer.whenSettled();
        return { component, ...this.report() }/*the component's own counts apart from the build's*/;
      },
      listComponents: async () => {
        await this.build.whenReady();
        const model = this.build.getModel();
        return { components: (model.components ?? []).map(component => {
          const size = component.footprint ? footprintSize(component.footprint, 0) : [0, 0];
          return { name: component.name, size: `${size[0]}x${size[1]}x${component.footprint?.height ?? 0}`, parts: component.placements.length, copies: (model.copies ?? []).filter(copy => copy.component === component.name).length };
        }) };
      },

      // an edit answers with the check of the build it made, so no check call follows
      addParts: async ({ parts, newStep }: { parts?: unknown; newStep?: unknown; }) => {
        const result = await this.build.add(Array.isArray(parts) ? parts : [], newStep === true);
        await this.viewer.whenSettled();
        return { added: result.added, ...this.report() };
      },
      removeParts: async ({ at }: { at?: unknown; }) => {
        const result = await this.build.remove(Array.isArray(at) ? at : []);
        await this.viewer.whenSettled();
        return {
          removed: result.removed,
          ...((result.empty.length > 0) ? { empty: result.empty } : {}),
          ...((result.unsupported.length > 0) ? { unsupported: result.unsupported.length, unsupportedParts: result.unsupported.slice(0, MAX_LISTED) } : {}),
          ...this.report(),
        };
      },

      setGround: async ({ color }: { color?: unknown; }) => {
        const ground = await this.build.setGround(color ?? undefined/*null returns it to the theme's*/);
        await this.viewer.whenSettled();
        return { ground: ground ?? 'theme' };
      },

      clear: async () => {
        const removed = await this.build.clear();
        await this.viewer.setView(this.viewer.getView(), true);
        return { removed };
      },

      setFidelity: async ({ fidelity }: { fidelity?: unknown; }) => {
        this.lookAround.hide();
        const stop = toFidelity(fidelity);
        if(stop === undefined) throw new Error('fidelity must be 0, 1, 2, 3 or 4');
        const reached = await this.look.set(stop);
        await this.viewer.whenSettled()/*a screenshot next shows the settled look*/;
        return { fidelity: reached, look: fidelityLabel(reached) };
      },

      getModel: async ({ fromLine }: { fromLine?: unknown; }) => {
        await this.build.whenReady();
        const conflict = this.build.conflict();
        if(conflict) return { conflict, builds: this.build.builds() }/*each build's text, to recover from*/;
        return textPage(this.build.getText(), pageStart(fromLine));
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
      defineComponentFromDesign: async ({ design, name }: { design?: unknown; name?: unknown; }) => {
        const { leftOut, ...component } = await this.designs.asComponent((typeof design === 'string') ? design : '', (typeof name === 'string') ? name : undefined);
        await this.viewer.whenSettled();
        return { component, ...((leftOut > 0) ? { leftOut } : {}), ...this.report() };
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
        this.lookAround.hide();
        const current = this.viewer.getView();
        await this.viewer.setView({
          azimuth: (typeof azimuth === 'number') ? azimuth : current.azimuth,
          elevation: (typeof elevation === 'number') ? elevation : current.elevation,
        }, fit !== false);
        await this.viewer.whenSettled()/*a screenshot next shows the settled frame*/;
        return this.viewer.getView();
      },
      lookAround: async () => {
        await this.build.whenReady();
        await this.viewer.whenSettled()/*the build as it stands*/;
        return { sides: await this.lookAround.show() };
      },
    });
  }
}

// == Util ========================================================================
/** where a page starts: a whole number from 0, else the start */
const pageStart = (value: unknown): number => ((typeof value === 'number') && Number.isInteger(value) && (value > 0)) ? value : 0;

/** whole lines of LDraw text from a line, up to a page's bytes (always at least one
 *  line), and the line the next page starts at while any remain */
const textPage = (text: string, fromLine: number) => {
  const lines = text.split('\n');
  if(lines[lines.length - 1] === '') lines.pop()/*the final line break*/;
  const encoder = new TextEncoder();
  let bytes = 0, end = fromLine;
  while((end < lines.length) && ((end === fromLine) || ((bytes + encoder.encode(lines[end]).length + 1) <= TEXT_PAGE_BYTES))) bytes += encoder.encode(lines[end++]).length + 1;
  return { ldraw: lines.slice(fromLine, end).map(line => line + '\n').join(''), lines: lines.length, ...((end < lines.length) ? { nextLine: end } : {}) };
};

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
