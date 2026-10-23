import type { CharmIQAPI } from '../../../shared/charmiq';

import { DesignExists, displayName } from '../../brick-shared/designs';
import type { Design } from '../../brick-shared/drive';

import { linesOf, type Build } from './build';
import type { Designs } from './designs';
import { partsByKind, searchCatalog, type CatalogPart, ACCESSORIES, CATALOG, COLORS, FIGURE_FACES, FRAME_FACES } from './catalog';
import { checkModel, reportCheck, MAX_LISTED, TRUNCATED } from './check';
import type { FidelityControl } from './fidelity-control';
import { filledCells, footprintSize, getColorByCode, getPart, getShape, type PartShape, BASEPLATE_MARGIN, BASEPLATE_MAX, BASEPLATE_MIN, MAX_COORDINATE } from './grid';
import type { LookAround } from './look-around';
import { placedPartCount, type Model } from './model';
import { pictureLine } from './picture';
import { fidelityLabel, toFidelity, untracedReason } from './render/fidelity';
import { insideParts } from './stage';
import type { StageControl } from './stage-control';
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
  'A figure is a person: it stands on the middle two cells of its middle row, faces south at rotation 0, and its arms, hands and head reach into the cells around its feet (its row gives its fills), so figures side by side stand 4 studs apart. Its color is its shirt; its head and hands are yellow and its legs blue unless legColor names another. Its face is the classic smile unless face names another (listParts names the faces: expressions such as grin, laugh and surprised, and characters such as beard and sunglasses).',
  'A figure poses: pose names its head, leftArm, rightArm, leftLeg and rightLeg, each in degrees, a multiple of 15. An arm or leg swings forward (90 points it ahead, 180 straight up, -30 back); the head turns clockwise seen from above. A posed figure keeps its x and z; its level is its lowest point, so a seated figure (both legs at 90) sits on a seat at the seat\'s top level. A raised arm fills the cells it reaches. To change a pose, remove the figure and add it posed.',
  `A figure wears a hat (hat: { part, color }: ${ACCESSORIES.filter(each => each.on === 'head').map(each => each.key).join(', ')}) and holds a thing in each hand (rightHand, leftHand: ${ACCESSORIES.filter(each => each.on === 'hand').map(each => each.key).join(', ')}), each in a catalog color. They turn with its head and arms; what it holds fills the cells it reaches. A held thing is held by its first grip unless grip names another: ${ACCESSORIES.filter(each => (each.grips?.length ?? 0) > 1).map(each => `a ${each.key} by its ${each.grips!.map(grip => grip.name).join(' or ')}`).join(', ')}.`,
  'A hinge (hinge-1x2, hinge-plate-1x4, turntable-2x2, turntable-4x4) turns its top by angle, a multiple of 15, and carries one component on it: carry is a copy of a component ({component, x, z, level, rotation}) standing on the hinge\'s top as it would with the hinge at 0 (its level the level of the hinge\'s studs, its footprint over at least one of them). Build the thing closed, then open it: hinge-1x2 tilts its top about an east-west axis at rotation 0 (90 raises its south side upright), the others swivel it clockwise seen from above. The carry turns with the top, fills the cells it turns into, never collides with its own hinge, and is held by its hinge alone: put whatever rides on it inside its component. It swings over the hinge\'s axis as it rises: a drawbridge raised to 90 stands upright one stud past its hinge, on the side away from where it lay, and a partly raised one fills a slanted band, so add the hinge and its carry before building close around them; a refused addParts names every collision at once, so a batch of small probe parts shows where a swing reaches. A component\'s own hinges carry nothing. To change an angle, remove the hinge and add it again.',
  `A part with side faces (${CATALOG.filter(part => part.faces).map(part => `${part.key}: ${part.faces!.join(', ')}`).join('; ')}) carries one component on each of those faces: sides is { face: { component, x, z, rotation } }. A face is named as the part stands at rotation 0 (north is +z) and turns with it. Each face has its own map, seen from outside the face: x runs right and z up, in studs, and x 0, z 0 is the cell of its first stud (the leftmost in its row nearest the top). The component stands on that map as a copy stands on the grid: its footprint's corner at x and z, turned clockwise as seen from outside, its level 0 against the face and its levels reaching out, covering at least one of the face's studs; seen from outside it looks as it does from above, its north up. Build the detail flat as a component (a grille, a sign, a lamp), then mount it. A mount collides where it reaches (with the part's other mounts too, never with the part), is held by its part alone (put whatever rides on it inside its component), and is removed with its part. A component's own parts carry nothing on their faces.`,
  'Colors named trans- are see-through plastic.',
  'setGround colors the baseplate (green for grass, gray for a road, tan for sand): use it instead of covering the baseplate with plates. Parts on it still stand at level 0.',
  'addPicture stands a picture from the Drive in a set (a billboard, a poster, a painted backdrop, a rug): image is a charmiq://file/ uri or a picture Brick Studio ships by name (listPictures names them), placed as a part is (x, z the south-west corner of its footprint, level its bottom, rotation in quarter turns), width and height in studs (1 to 64; leave height out for the image\'s own shape). Upright it stands in the middle of a stud row width long, facing south at rotation 0; flat: true lays it on its level, its top edge north. The image covers it, cropping the overflow, unless fit is contain (shown whole) or stretch. A picture fills nothing: it never collides and the check passes it by. listPictures lists a set\'s pictures; removePicture takes one by its place in that list.',
  'setSky puts a sky behind a set: generated from a horizon and a zenith color (#rrggbb) with clouds from 0 (clear) to 1 (overcast), another seed drawing other clouds alike; or a picture from the Drive (image: a charmiq://file/ uri), a panorama twice as wide as high wrapping the whole sky, any other picture tiled round the horizon. lights: true lets the sky light the set too, for an outdoor shot. Omit the sky for the theme\'s backdrop.',
  'A component is a group of parts defined once (defineComponent, in its own grid: x, z and level from 0) and placed many times: an addParts item {component, x, z, level, rotation} places a copy by its footprint\'s south-west corner and its bottom level, turned as a part is. Copies are checked as parts are; removing any cell of a copy removes the whole copy, and redefining a component changes every copy. Build a repeated thing (a tower, a house, a tree with a fence) as a component.',
  'A saved design can be a component too: defineComponentFromDesign defines one from a design in the designs folder (listDesigns lists each with its uri), its footprint from x 0, z 0 and its lowest part at level 0, so a house, a car or a tree saved once is placed many times.',
  'A build can be split into building steps the Studio plays in order: addParts with newStep: true puts its parts in a new step after the last.',
  `The baseplate is no boundary: it grows with the build, ${BASEPLATE_MARGIN} studs beyond it on every side, never smaller than ${BASEPLATE_MIN} x ${BASEPLATE_MIN} studs (x and z from ${-BASEPLATE_MIN / 2} to ${BASEPLATE_MIN / 2} while the build is empty) and never larger than ${BASEPLATE_MAX} x ${BASEPLATE_MAX}. Parts stand anywhere with x and z within ${MAX_COORDINATE} of the origin; center a scene near x 0, z 0.`,
  'Level 0 stands on the baseplate. A view\'s azimuth 0 looks north from the south, 90 looks west from the east. lookAround shows the build from all four sides at once, so one screenshot sees every side; the next change closes it.',
].join(' ');

// == Class =======================================================================
export class CommandSurface {
  public constructor(private readonly build: Build, private readonly designs: Designs, private readonly shippedPictures: () => Promise<ReadonlyMap<string, string>>/*by name*/, private readonly viewer: Viewer, private readonly lookAround: LookAround, private readonly stage: StageControl, private readonly look: FidelityControl) {}

  /** a set's check (the set shown's when none is given), model-facing, naming the set
   *  when the build has more than one: never sound while the document holds more than
   *  one build, since it covers only the one shown */
  private report(model: Model = this.build.getModel()) {
    const conflict = this.build.conflict();
    return { ...named(model), ...reportCheck(checkModel(model)), ...(conflict ? { ok: false, conflict } : {}) };
  }

  /** the design a call names: its uri (from listDesigns), which is that document, or
   *  else its name, found by a bounded search (SEE: Designs#load) */
  private async designGiven(uri: unknown, name: unknown): Promise<Design | string> {
    if((typeof uri === 'string') && (uri.length > 0)) return this.designs.at(uri);
    if((typeof name === 'string') && (name.length > 0)) return name;
    throw new Error('Give a design\'s uri (listDesigns) or its name.');
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
        faces: FIGURE_FACES.map(face => face.key),
        frameFaces: FRAME_FACES.map(face => face.key),
      }),
      findParts: ({ query, limit }: { query?: unknown; limit?: unknown; }) => {
        if((typeof query !== 'string') || (query.trim().length < 1)) throw new Error('query names the parts to find: a part\'s name, a size such as 2x4, a kind or a word such as roof');
        const count = ((typeof limit === 'number') && Number.isInteger(limit) && (limit > 0)) ? Math.min(limit, MAX_FOUND) : DEFAULT_FOUND;
        const found = searchCatalog(query);
        return { parts: found.slice(0, count).map(partRow), total: found.length };
      },

      listPlacedParts: async ({ from, set }: { from?: unknown; set?: unknown; }) => {
        await this.build.whenReady();
        const model = this.build.modelOf(set);
        const conflict = this.build.conflict();
        const steps = model.steps;
        // a part of its own, or a component's line as one entry (its parts are its
        // component's): a copy by where it stands, any other line by its component,
        // color and a cell it fills (a removal there takes the line)
        const owned = new Map<number, number[]>()/*each line's placements, in order*/;
        model.placementPlaced?.forEach((line, index) => {
          if(line === undefined) return/*a part of its own*/;
          if(!owned.has(line)) owned.set(line, []);
          owned.get(line)!.push(index);
        });
        const entries = [
          ...model.placements.flatMap((placement, index) => (model.placementPlaced?.[index] === undefined) ? [steps ? { ...placement, step: steps.placements[index] } : placement] : []),
          ...(model.copies ?? []).map((copy, index) => steps ? { ...copy, step: steps.copies[index] } : copy),
          ...(model.placed ?? []).flatMap(({ component, colorCode, copy, carried }, line) => {
            if((copy !== undefined) || carried) return []/*listed as a copy, or with the hinge carrying it*/;
            const color = getColorByCode(colorCode)?.key;
            const parts = owned.get(line) ?? [];
            const cell = parts.flatMap(index => filledCells(getShape(getPart(model.placements[index].part)!/*by contract*/), model.placements[index]))[0]/*the first part that fills one: glass fills none*/;
            const step = steps?.placements[parts[0]];
            return [{ component, ...(color ? { color } : {}), ...(cell ? { at: { x: cell.x, z: cell.z, level: cell.bottom } } : {}), ...((step !== undefined) ? { step } : {}) }];
          }),
        ];
        const start = pageStart(from);
        const end = Math.min(entries.length, start + PARTS_PER_PAGE);
        return {
          ...named(model), parts: entries.slice(start, end), total: entries.length, ...((end < entries.length) ? { next: end } : {}),
          ...((model.others.length > 0) ? { unchecked: model.others.length } : {}), ...(model.truncated ? { truncated: TRUNCATED } : {}), ...(conflict ? { conflict } : {}),
        };
      },

      defineComponent: async ({ name, parts }: { name?: unknown; parts?: unknown; }) => {
        const component = await this.build.defineComponent(name, Array.isArray(parts) ? parts : []);
        const shown = this.build.getModel()/*taken before drawing lets the person show another set*/;
        await this.viewer.whenSettled();
        return { component, ...this.report(shown) }/*the component's own counts apart from the build's*/;
      },
      listComponents: async ({ component: named, from }: { component?: unknown; from?: unknown; } = {}) => {
        await this.build.whenReady();
        const model = this.build.getModel();
        if(named !== undefined) {
          // one component's parts where each stands in it, a page at a time: where a
          // stage's placed actor names a part inside a copy (`inside`), read from a
          // copy as a stage reads it (a part in LDraw's inherited color listed as
          // inherited); with no copy, its own parts as defined (nothing to cast)
          const component = (model.components ?? []).find(each => each.name === named);
          if(!component) throw new Error(`No component named '${String(named)}': listComponents names them.`);
          const copied = this.build.allSets().flatMap(set => { const copy = (set.copies ?? []).findIndex(each => each.component === component.name); return (copy >= 0) ? [{ set, copy }] : []; })[0];
          const parts = copied ? insideParts(copied.set, copied.copy) : component.placements;
          const start = pageStart(from);
          const end = Math.min(parts.length, start + PARTS_PER_PAGE);
          return { component: component.name, parts: parts.slice(start, end), total: parts.length, ...((end < parts.length) ? { next: end } : {}) };
        } /* else -- every component */
        return { components: (model.components ?? []).map(component => {
          const size = component.footprint ? footprintSize(component.footprint, 0) : [0, 0];
          const bySet = this.build.copiesBySet(component.name);
          return {
            name: component.name, size: `${size[0]}x${size[1]}x${component.footprint?.height ?? 0}`, parts: placedPartCount(model, component.placements)/*what its carriers carry included*/, copies: bySet.reduce((total, [, copies]) => total + copies, 0),
            ...((bySet.length > 1) ? { copiesBySet: Object.fromEntries(bySet) } : {}),
          };
        }) };
      },
      listSets: async () => {
        await this.build.whenReady();
        return { sets: this.build.sets(), shown: this.build.shownSet() };
      },
      addSet: async ({ name, from }: { name?: unknown; from?: unknown; }) => {
        const added = await this.build.addSet(name, from);
        await this.viewer.whenSettled()/*the set shown*/;
        return added;
      },
      renameSet: async ({ set, name }: { set?: unknown; name?: unknown; }) => ({ name: await this.build.renameSet(set, name) }),
      removeSet: async ({ set }: { set?: unknown; }) => {
        const removed = await this.build.removeSet(set);
        await this.viewer.whenSettled();
        return removed;
      },

      // an edit answers with the check of the build it made, so no check call follows
      addParts: async ({ parts, newStep, set }: { parts?: unknown; newStep?: unknown; set?: unknown; }) => {
        const result = await this.build.add(Array.isArray(parts) ? parts : [], newStep === true, set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.whenSettled();
        return { added: result.added, ...this.report(edited) };
      },
      removeParts: async ({ at, set }: { at?: unknown; set?: unknown; }) => {
        const result = await this.build.remove(Array.isArray(at) ? at : [], set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.whenSettled();
        return {
          removed: result.removed,
          ...((result.empty.length > 0) ? { empty: result.empty } : {}),
          ...((result.unsupported.length > 0) ? { unsupported: result.unsupported.length, unsupportedParts: result.unsupported.slice(0, MAX_LISTED) } : {}),
          ...this.report(edited),
        };
      },

      setGround: async ({ color, set }: { color?: unknown; set?: unknown; }) => {
        const ground = await this.build.setGround(color ?? undefined/*null returns it to the theme's*/, set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.whenSettled();
        return { ground: ground ?? 'theme', ...named(edited) };
      },

      addPicture: async ({ picture, set }: { picture?: unknown; set?: unknown; }) => {
        const added = await this.build.addPicture(picture, set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.whenSettled();
        return { picture: added, index: (edited.pictures ?? []).map(pictureLine).lastIndexOf(pictureLine(added))/*its place as listPictures lists it*/, ...named(edited) };
      },

      listPictures: async ({ set }: { set?: unknown; }) => {
        await this.build.whenReady();
        const model = this.build.modelOf(set);
        const shipped = await this.shippedPictures().then(names => [...names.keys()].sort(), () => []/*unlisted: none named*/);
        return { pictures: model.pictures ?? [], shipped, ...named(model) };
      },

      removePicture: async ({ index, set }: { index?: unknown; set?: unknown; }) => {
        const removed = await this.build.removePicture(index, set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.whenSettled();
        return { removed, ...named(edited) };
      },

      setSky: async ({ sky, set }: { sky?: unknown; set?: unknown; }) => {
        const shown = await this.build.setSky(sky ?? undefined/*null returns it to the theme's backdrop*/, set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.whenSettled();
        return { sky: shown ?? 'theme', ...named(edited) };
      },

      clear: async ({ expect, set }: { expect?: unknown; set?: unknown; }) => {
        const removed = await this.build.clear(expectedText(expect), set);
        const edited = this.build.getModel()/*the set the edit landed in, shown: taken before drawing lets the person show another*/;
        await this.viewer.setView(this.viewer.getView(), true);
        return { removed, ...((set !== undefined) ? named(edited) : {}) };
      },

      setFidelity: async ({ fidelity }: { fidelity?: unknown; }) => {
        this.lookAround.hide();
        const stop = toFidelity(fidelity);
        if(stop === undefined) throw new Error('fidelity must be 0, 1, 2, 3 or 4');
        const reached = await this.look.set(stop);
        await this.viewer.whenSettled()/*a screenshot next shows the settled look*/;
        const untraced = this.viewer.untracedParts;
        return { fidelity: reached, look: fidelityLabel(reached), ...((untraced !== undefined) ? { untraced: untracedReason(untraced) } : {}) };
      },

      getModel: async ({ fromLine }: { fromLine?: unknown; }) => {
        await this.build.whenReady();
        const conflict = this.build.conflict();
        if(conflict) return { conflict, builds: this.build.builds() }/*each build's text, to recover from*/;
        return textPage(this.build.getText(), pageStart(fromLine));
      },
      setModel: async ({ ldraw, expect }: { ldraw?: unknown; expect?: unknown; }) => {
        await this.build.replace((typeof ldraw === 'string') ? ldraw : '', expectedText(expect));
        const shown = this.build.getModel()/*taken before drawing lets the person show another set*/;
        await this.showWhole();
        return this.report(shown);
      },

      listDesigns: async () => {
        const designs = await this.designs.list()/*waits for the chosen folder*/;
        return { folder: this.designs.getFolder().name, designs: designs.map(design => ({ name: displayName(design), uri: design.uri })) };
      },
      defineComponentFromDesign: async ({ design, uri, name }: { design?: unknown; uri?: unknown; name?: unknown; }) => {
        const { leftOut, otherSets, ...component } = await this.designs.asComponent(await this.designGiven(uri, design), (typeof name === 'string') ? name : undefined);
        const shown = this.build.getModel()/*taken before drawing lets the person show another set*/;
        await this.viewer.whenSettled();
        return { component, ...((leftOut > 0) ? { leftOut } : {}), ...((otherSets !== undefined) ? { otherSets } : {}), ...this.report(shown) };
      },
      loadDesign: async ({ name, uri }: { name?: unknown; uri?: unknown; }) => {
        const loaded = await this.designs.load(await this.designGiven(uri, name));
        const shown = this.build.getModel()/*taken before drawing lets the person show another set*/;
        await this.showWhole();
        return { loaded, ...this.report(shown) };
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

      check: async ({ set }: { set?: unknown; }) => { await this.build.whenReady(); return this.report(this.build.modelOf(set)); },

      setView: async ({ azimuth, elevation, fit }: { azimuth?: unknown; elevation?: unknown; fit?: unknown; }) => {
        if([azimuth, elevation].some(value => (typeof value === 'number') && !Number.isFinite(value))) throw new Error('azimuth and elevation must be finite numbers');
        this.lookAround.hide();
        const current = this.viewer.getView();
        await this.viewer.setView({
          azimuth: (typeof azimuth === 'number') ? azimuth : current.azimuth,
          elevation: (typeof elevation === 'number') ? elevation : current.elevation,
        }, fit !== false);
        await this.viewer.whenSettled()/*a screenshot next shows the settled frame*/;
        return this.viewer.getView();
      },
      lookAround: async ({ set }: { set?: unknown; }) => {
        if(this.viewer.isStaged) throw new Error('The studio is showing a film scene; unstage shows the build again.');
        await this.build.whenReady();
        const shown = this.build.showSet(set);
        await this.viewer.whenSettled()/*the set as it stands*/;
        return { sides: await this.lookAround.show(), ...named(shown) };
      },

      // a stage: a film's scene shown in place of the build (SEE: stage.ts)
      describeStage: () => this.stage.describe(),
      stage$: () => this.stage.state$()/*a stream for the film, not a Charm's command*/,
      stage: async ({ ldraw, set, sets, actors, floor, light, sky, reel, view, marks, keep }: { ldraw?: unknown; set?: unknown; sets?: unknown; actors?: unknown; floor?: unknown; light?: unknown; sky?: unknown; reel?: unknown; view?: unknown; marks?: unknown; keep?: unknown; }) => {
        if(set !== undefined) throw new Error('stage takes the sets it stands as sets (their names), and LDraw text standing for the build as ldraw.');
        this.lookAround.hide();
        const staged = await this.stage.stage(ldraw, sets, actors, floor, light, sky, reel, view, marks, keep);
        await this.viewer.whenSettled()/*the set drawn*/;
        return staged;
      },
      loadReel: async ({ reel, from, frames }: { reel?: unknown; from?: unknown; frames?: unknown; }) => this.stage.loadReel(reel, from, frames),
      show: async ({ reel, frame, capture, playing }: { reel?: unknown; frame?: unknown; capture?: unknown; playing?: unknown; }) => this.stage.showReel(reel, frame, capture, playing),
      thumbnail: async ({ reel, frame, width, height, view }: { reel?: unknown; frame?: unknown; width?: unknown; height?: unknown; view?: unknown; }) => ({ image: await this.stage.thumbnail(reel, frame, width, height, view) }),
      storyboard: async ({ reel, frames, view }: { reel?: unknown; frames?: unknown; view?: unknown; }) => this.stage.storyboard(reel, frames, view),
      frame: async ({ set, actors, camera, capture }: { set?: unknown; actors?: unknown; camera?: unknown; capture?: unknown; }) => {
        const framed = await this.stage.frame(set, actors, camera, capture);
        if(!framed.image) await this.viewer.whenSettled()/*a screenshot next shows the frame*/;
        return framed;
      },
      unstage: () => this.stage.unstage(),
      probeStage: async ({ ldraw, sets, actors, set, points, segments, grounds }: { ldraw?: unknown; sets?: unknown; actors?: unknown; set?: unknown; points?: unknown; segments?: unknown; grounds?: unknown; }) => this.stage.probe(ldraw, sets, actors, set, points, segments, grounds),
    });
  }
}

// == Util ========================================================================
/** the set a model is, as an answer names it: when the build has more than one */
const named = (model: Model): Readonly<{ set?: string; }> => model.sets ? { set: model.set! } : {};

/** the build's text a write expects, when given (SEE: Build#replace) */
const expectedText = (value: unknown): string | undefined => (typeof value === 'string') ? value : undefined;

/** where a page starts: a whole number from 0, else the start */
const pageStart = (value: unknown): number => ((typeof value === 'number') && Number.isInteger(value) && (value > 0)) ? value : 0;

/** whole lines of LDraw text from a line, up to a page's bytes (always at least one
 *  line), and the line the next page starts at while any remain */
const textPage = (text: string, fromLine: number) => {
  const lines = linesOf(text);
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
