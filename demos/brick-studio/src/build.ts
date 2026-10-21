import type { ContentChange } from '../../../shared/charmiq';
import { getFigureFace, ACCESSORIES, DEFAULT_FIGURE_FACE, FIGURE_FACES, type CatalogPart, type Slot } from './catalog';
import { checkModel, describeCopy, describePlaced, describePlacement, occupiedCells, MAX_LISTED, type CheckResult } from './check';
import type { ContentBridge } from './content-bridge';
import { cellKey, footprintOf, footprintSize, frameKey, getColor, getPart, getShape, mountsOf, restsIn, toRotation, FACES, MAX_COORDINATE, type Copy, type FaceCarry, type Footprint, type Gear, type Mount, type Placement } from './grid';
import { addSetEdits, appendLines, applyChanges, carriesComponents, clearEdits, clearSetEdits, copiesOf, copyLine, mountLine, defineEdits, deleteLines, groundEdit, parseModel, parseSets, partCount, placedPartCount, placementLines, removeSetEdits, renameSetEdits, sameSetName, serializeModel, setLines, stepCount, type Model, type ModelLayout, type SetSection, EMPTY_MODEL, MAIN_SET, MAX_PARTS, MAX_SET_NAME, MAX_SETS, READ_IN_PART } from './model';
import { maxOf, minOf } from './numbers';
import { normalizePose, pieceLines, toPoseAngle, LIMBS, POSE_STEP, type Limb, type Pose } from './pose';

// owns the current build: the `model` app-content's text, as last seen. Every
// edit is validated against the app-content's text it is measured on, and the
// build changes when the app-content does, never before. An edit that would collide is refused whole,
// so a build never gains a collision through an edit made on what it shows; a part
// may float while its support is pending. Edits change their own lines alone
// NOTE: a collision check covers the text it was measured on. Two editors can
//       each accept an edit before seeing the other's, and the document then
//       holds both
// ********************************************************************************
// == Constants ===================================================================
const MAX_BATCH = 400;
const MAX_LEVEL = 600/*plates*/;
/** the studs between a build and a copy placed beside it */
const BESIDE_GAP = 2/*studs*/;
/** a component's name: its file is `<name>.ldr` */
const COMPONENT_NAME = /^[a-z][a-z0-9-]{0,39}$/;

// == Types =======================================================================
/** why the model shown changed: the first load, a change to the app-content, a change
 *  to the app-content that leaves the set shown as it was (another set's, a data
 *  section's), or another set shown */
export type ModelSource = 'document' | 'load' | 'elsewhere' | 'set';

// ................................................................................
/** a refused edit; its message is model-facing */
export class BuildError extends Error {}

/** a design's add refused because its component is placed already: the add would
 *  change every copy, so it must say it may */
export class ComponentPlaced extends BuildError {
  public constructor(public readonly component: string, public readonly copies: number) {
    super(`"${component}" is already in this build (${copies} ${(copies === 1) ? 'copy' : 'copies'}).`);
  }
}

// ................................................................................
/** a component defined: its size, its own parts and the copies the build places */
export type Defined = Readonly<{ name: string; size: string; parts: number; copies: number; }>;
/** a component defined from a design (its first set), with the design's parts off the
 *  grid it left out and its further sets, when it has any */
export type DefinedFromDesign = Defined & Readonly<{ leftOut: number; otherSets?: number; }>;
/** a set as listSets tells it: its name, its parts (its copies' included), copies and
 *  steps, and its ground when it names one */
export type SetSummary = Readonly<{ name: string; parts: number; copies: number; steps: number; ground?: string; }>;

// == Class =======================================================================
export class Build {
  /** the set shown: its model, and its file (the main set's when undefined), followed
   *  through renames */
  private model: Model = EMPTY_MODEL;
  private shown: string | undefined;
  /** the app-content's text the model was read from, and every set of it, read once */
  private text = '';
  private read: Readonly<{ text: string; sets: ReadonlyArray<Model>; }> | undefined;
  private onModelChanged: ((model: Model, source: ModelSource) => void) | null = null;
  private onUncertainChanged: (() => void) | null = null;
  private ready: Promise<void> | null = null;

  // == Lifecycle =================================================================
  public constructor(private readonly bridge: ContentBridge) {}

  public onChange(callback: (model: Model, source: ModelSource) => void): void {
    this.onModelChanged = callback;
  }
  /** register the callback for a change to what the status reports beside the
   *  model: the build becoming uncertain or certain (SEE: isUncertain), or the
   *  document's builds changing (SEE: conflict) */
  public onUncertain(callback: () => void): void {
    this.onUncertainChanged = callback;
  }

  /** loads the document's build and follows every change to it. Rejects, with the
   *  reason, when the build cannot be read */
  public init(): Promise<void> {
    this.ready ??= (async () => {
      this.bridge.onChange(text => this.show(text, 'document'));
      this.bridge.onUncertain(() => this.onUncertainChanged?.());
      this.bridge.onBuilds(() => this.onUncertainChanged?.());
      this.show(await this.bridge.open(), 'load');
    })();
    return this.ready;
  }

  /** resolves once the build is loaded; every command waits for it */
  public whenReady(): Promise<void> { return this.init(); }

  // == Read ======================================================================
  /** the set shown, as a model */
  public getModel(): Model { return this.model; }
  /** the name of the set shown */
  public shownSet(): string { return this.model.set ?? MAIN_SET; }
  /** every set of the build, the main set first */
  public sets(): ReadonlyArray<SetSummary> {
    return this.allSets().map(model => ({ name: model.set ?? MAIN_SET, parts: partCount(model), copies: model.placed?.length ?? 0/*every line placing a component*/, steps: stepCount(model), ...((model.ground !== undefined) ? { ground: model.ground } : {}) }));
  }
  /** every set of the build as a model, the main set first */
  public allSets(): ReadonlyArray<Model> {
    if(this.read?.text !== this.text) this.read = { text: this.text, sets: parseSets(this.text) };
    return this.read.sets;
  }
  /** how many copies of a component each set places (its carried copies included),
   *  by set name, the main set first */
  public copiesBySet(component: string): ReadonlyArray<readonly [string, number]> {
    return this.allSets().map(model => [model.set ?? MAIN_SET, copiesOf(model, component)] as const);
  }
  /** whether any set holds a part, or the build a component */
  public holdsAnything(): boolean {
    return (this.model.components?.length ?? 0) > 0 || this.allSets().some(model => partCount(model) > 0);
  }
  /** the set a call names as a model, the build's one set when it names none (SEE:
   *  pickSet); refused naming the sets otherwise */
  public modelOf(set: unknown): Model { return setModel(this.text, set).model; }

  /** shows a set by name: the studio's choice, never an edit */
  public showSet(set: unknown): Model {
    const model = this.modelOf(set);
    this.showFile(fileOf(model));
    return this.model;
  }
  /** whether the build may no longer be in the document (SEE: ContentBridge#isUncertain) */
  public isUncertain(): boolean { return this.bridge.isUncertain(); }
  /** why edits wait, when the document holds more than one build (SEE: ContentBridge#conflict) */
  public conflict(): string | undefined { return this.bridge.conflict(); }
  /** every build the document holds, by app-content id */
  public builds(): ReadonlyArray<Readonly<{ id: string; ldraw: string; }>> { return this.bridge.builds(); }
  /** the build as LDraw text: a build with components, or one no text may be written
   *  from (SEE: Model#unwritable), as written; any other flat. Refused for a build read only in
   *  part, which would otherwise pass for the whole build (and replace it, given back
   *  to setModel) */
  public getText(): string {
    if(this.model.truncated) throw new BuildError(`${READ_IN_PART} Its text cannot be given back whole from here; the whole text is in the document's model app-content.`);
    return givenText(this.text, this.model);
  }
  public check(): CheckResult { return checkModel(this.model); }

  // == Edit ======================================================================
  /** adds parts and copies of components to a set's last building step, or as a new
   *  step after it (`newStep`); refuses the whole batch when any item is invalid or
   *  collides. Shows the set */
  public async add(input: ReadonlyArray<unknown>, newStep: boolean, set?: unknown): Promise<Readonly<{ added: number; }>> {
    await this.whenReady();
    if(input.length < 1) throw new BuildError('No parts given.');
    if(input.length > MAX_BATCH) throw new BuildError(`At most ${MAX_BATCH} parts per call.`);
    const items = validItems(input, 'parts', true);

    let outcome = { added: 0 };
    let target: string | undefined;
    await this.bridge.edit(text => {
      const { model, layout, name } = editable(text, set);
      target = name;
      const named = (item: Placement | Copy) => ('component' in item) ? [item.component] : mountsOf(item).map(mount => mount.copy.component);
      const missing = [...new Set(items.flatMap(item => named(item).filter(name => !componentOf(model, name)?.footprint)))];
      if(missing.length > 0) throw new BuildError(`Nothing was added. No component named ${missing.join(', ')} holds parts on the grid (defineComponent defines one; listComponents names them).`);
      const unmounted = items.flatMap((item, index) => ('component' in item) ? [] : mountRefusals(model, item, index));
      if(unmounted.length > 0) throw new BuildError(['Nothing was added.', ...unmounted].join('\n'));
      const lines = items.flatMap(item => ('component' in item) ? [copyLine(withFootprint(componentOf(model, item.component)!/*by contract*/), item)] : carrierLines(model, item));
      const change = appendLines(layout, lines, newStep);
      const next = readWhole(applyChanges(text, [change]), name);

      // refuse any collision the batch introduces. A part or copy identical to one
      // already in the build was most likely added by an earlier call (one whose answer
      // was lost), and one listed twice is a slip: each is named as such, not as a
      // collision
      const before = new Set(checkModel(model).collisions.map(pair => `${pair.a}|${pair.b}`));
      const introduced = checkModel(next).collisions.filter(pair => !before.has(`${pair.a}|${pair.b}`) && (pair.a !== pair.b)/*a repeat, named below*/);
      const existing = new Set([...model.placements.filter((_, index) => model.placementPlaced?.[index] === undefined).map(describePlacement), ...(model.copies ?? []).map(describeCopy)]);
      const listed = new Set<string>();
      const placed: string[] = [], repeated: string[] = [];
      for(const name of items.map(describeItem)) {
        if(existing.has(name)) placed.push(name);
        else if(listed.has(name)) repeated.push(name);
        listed.add(name);
      }
      if((placed.length + repeated.length + introduced.length) > 0) throw new BuildError(['Nothing was added.',
        ...refusal('Already placed (an earlier call added them; leave them out):', placed),
        ...refusal('Listed twice in this call:', repeated),
        ...refusal('These parts would collide:', introduced.map(pair => `${pair.b} overlaps ${pair.a}`)),
      ].join('\n'));

      outcome = { added: items.length };
      return [change];
    });
    this.showNamed(target);
    return outcome;
  }

  // ------------------------------------------------------------------------------
  /** defines a component (a group of parts in its own grid, placed as a unit), or
   *  replaces its definition: every copy then changes with it, and a definition that
   *  would make a copy collide is refused whole */
  public async defineComponent(name: unknown, input: ReadonlyArray<unknown>): Promise<Defined> {
    await this.whenReady();
    const placements = componentParts(name, input);
    let outcome: Defined | undefined;
    await this.bridge.edit(text => {
      const defined = defineChecked(text, name as string/*by componentParts*/, placements);
      outcome = defined.outcome;
      return defined.changes;
    });
    return outcome!/*the edit applied*/;
  }

  /** defines a component from LDraw text (a saved design): its parts on the grid,
   *  its own components' included, moved so its footprint starts at x 0, z 0 and its
   *  lowest part stands at level 0. Its ground and steps are left out, and so are its
   *  parts off the grid, counted in `leftOut` */
  public async defineComponentFromText(name: unknown, ldraw: string): Promise<DefinedFromDesign> {
    const { parts, leftOut, otherSets } = designParts(ldraw);
    return { ...await this.defineComponent(name, parts), leftOut, ...((otherSets > 0) ? { otherSets } : {}) };
  }

  /** defines a component from LDraw text (SEE: defineComponentFromText) and places
   *  one copy of it on the ground just outside everything the build holds, as a new
   *  step of the set shown (SEE: besideBuild), in one edit: both land or neither
   *  does. A component of that name placed already in any set is redefined, every copy
   *  with it, only when `replace` says it may be (ComponentPlaced otherwise), judged on
   *  the text the edit is made on */
  public async addDesign(name: unknown, ldraw: string, replace: boolean): Promise<Readonly<{ component: DefinedFromDesign; copy: Copy; }>> {
    await this.whenReady();
    const { parts, leftOut, otherSets } = designParts(ldraw);
    const placements = componentParts(name, parts);
    const component = name as string/*by componentParts*/;

    let outcome: Readonly<{ component: DefinedFromDesign; copy: Copy; }> | undefined;
    const shown = this.shownSet();
    await this.bridge.edit(text => {
      editable(text, shown)/*refused before anything is defined*/;
      const placed = copiesIn(text, component);
      if((placed > 0) && !replace) throw new ComponentPlaced(component, placed);
      const defined = defineChecked(text, component, placements);

      // the copy goes where the redefined build leaves room in the set shown: nothing
      // fills it there, so it never collides
      const definedText = applyChanges(text, defined.changes);
      const { model, layout } = editable(definedText, shown);
      const { file, footprint } = componentOf(model, component)!/*by contract*/;
      const copy = besideBuild(model, component, footprint!/*its parts are on the grid*/);
      if(!copy) throw new BuildError(`Nothing was added. There is no room beside the build within ${MAX_COORDINATE} studs of the origin.`);
      const change = appendLines(layout, [copyLine({ file, footprint: footprint! }, copy)], true);
      readWhole(applyChanges(definedText, [change]), shown);

      outcome = { component: { ...defined.outcome, copies: defined.outcome.copies + 1, leftOut, ...((otherSets > 0) ? { otherSets } : {}) }, copy };
      return [...defined.changes, change]/*each measured after the ones before it*/;
    });
    return outcome!/*the edit applied*/;
  }

  // ------------------------------------------------------------------------------
  /** removes the part that fills each given cell of a set, and the glass in a removed frame;
   *  a cell a component's line fills (a copy or not) removes that whole line. The cells are read on the build as
   *  the edit applies to it: a part that took a cell's place meanwhile is the one
   *  removed. Names the parts the removal left floating (`unsupported`) */
  public async remove(cells: ReadonlyArray<unknown>, set?: unknown): Promise<Readonly<{ removed: ReadonlyArray<string>; empty: ReadonlyArray<string>; unsupported: ReadonlyArray<string>; }>> {
    await this.whenReady();
    if(cells.length < 1) throw new BuildError('No cells given.');
    const at = cells.map((cell, index) => {
      const { x, z, level } = (cell ?? {}) as Record<string, unknown>;
      if(!isInteger(x) || !isInteger(z) || !isInteger(level)) throw new BuildError(`at[${index}]: x, z and level must be integers.`);
      return { x, z, level };
    });

    let outcome = { removed: [] as ReadonlyArray<string>, empty: [] as ReadonlyArray<string>, unsupported: [] as ReadonlyArray<string> };
    let target: string | undefined;
    await this.bridge.edit(text => {
      const { model, layout, name } = editable(text, set);
      target = name;

      // the placement that fills each cell, its mounts' cells its own
      const filled = new Map<string, number>();
      model.placements.forEach((placement, index) => {
        for(const { x, z, bottom, top } of occupiedCells(model, placement)) {
          for(let level=bottom; level<top; level++) filled.set(cellKey(x, z, level), index);
        }
      });

      const removing = new Set<number>();
      const empty: string[] = [];
      for(const { x, z, level } of at) {
        const hit = filled.get(cellKey(x, z, level));
        if(hit === undefined) empty.push(`x ${x} z ${z} level ${level}`);
        else removing.add(hit);
      }

      // a pane goes with its frame (it fills no cell of its own)
      const removedFrames = new Set([...removing].map(index => frameKey(getPart(model.placements[index].part)!.ldraw/*by contract*/, model.placements[index])));
      model.placements.forEach((placement, index) => {
        const frame = getPart(placement.part)!.frame/*by contract*/;
        if((frame !== undefined) && removedFrames.has(frameKey(frame, placement))) removing.add(index);
      });

      // a part a component's line places takes the whole line, a copy or not: the
      // component's definition is every line's, and is never edited here
      const placed = new Set([...removing].flatMap(index => model.placementPlaced?.[index] ?? []));
      const own = [...removing].filter(index => model.placementPlaced?.[index] === undefined);
      const changes = deleteLines([...own.flatMap(index => [layout.placements[index], ...layout.pieces[index]]), ...[...placed].map(line => layout.placed[line])]);

      // what floats now that floated not before
      const floatingBefore = new Set(checkModel(model).floating);
      const after = checkModel(parseModel(applyChanges(text, changes), { name }));
      outcome = {
        removed: [...own.map(index => describePlacement(model.placements[index])), ...[...placed].map(line => describePlaced(model, line))],
        empty, unsupported: after.floating.filter(part => !floatingBefore.has(part)),
      };
      return changes;
    });
    this.showNamed(target);
    return outcome;
  }

  // ------------------------------------------------------------------------------
  /** removes every part, copy, further set and component the build holds as the
   *  edit applies to it, its main set's header (its name and ground) kept; or, given
   *  `set`, that set's parts, copies and steps alone (the components every set shares
   *  kept), and shows it. Refused whole when `expected` is given and the build is no
   *  longer that text */
  public async clear(expected?: string, set?: unknown): Promise<number> {
    await this.whenReady();
    let removed = 0;
    let target: string | undefined;
    await this.bridge.edit(text => {
      refuseChanged(text, expected);
      if(set !== undefined) {
        const { model, layout, name } = editable(text, set);
        target = name;
        removed = partCount(model);
        return clearSetEdits(layout);
      } /* else -- the whole build */
      const { layout } = editable(text, mainName(text));
      removed = parseSets(text).reduce((total, model) => total + partCount(model), 0);
      return clearEdits(layout);
    });
    this.showNamed(target);
    return removed;
  }

  /** colors a set's baseplate (a catalog color that is not see-through), or returns
   *  it to the theme's (`undefined`), and shows the set */
  public async setGround(color: unknown, set?: unknown): Promise<string | undefined> {
    await this.whenReady();
    if((color !== undefined) && ((typeof color !== 'string') || !getColor(color))) throw new BuildError(`unknown color '${String(color)}' (listParts names the colors)`);
    if((color !== undefined) && getColor(color)!.transparent) throw new BuildError('The ground cannot be see-through.');
    let target: string | undefined;
    await this.bridge.edit(text => { const { layout, name } = editable(text, set); target = name; return groundEdit(layout, color); });
    this.showNamed(target);
    return color;
  }

  // ------------------------------------------------------------------------------
  /** adds a set named `name`: empty, or a copy of the set `from` names (its parts,
   *  copies, steps and ground), and shows it */
  public async addSet(name: unknown, from?: unknown): Promise<SetSummary> {
    await this.whenReady();
    const named = toSetName(name);
    let added: SetSummary | undefined;
    await this.bridge.edit(text => {
      const { model: main, layout } = editable(text, mainName(text));
      const names = setNames(main);
      if(names.length >= MAX_SETS) throw new BuildError(`A build holds at most ${MAX_SETS} sets.`);
      refuseTaken(names, named, undefined);
      const source = (from === undefined) ? undefined : editable(text, from);
      const changes = addSetEdits(layout.file, named, source ? setLines(text, source.layout) : []);
      const next = readWhole(applyChanges(text, changes), named);
      added = { name: named, parts: partCount(next), copies: next.placed?.length ?? 0, steps: stepCount(next), ...((next.ground !== undefined) ? { ground: next.ground } : {}) };
      return changes;
    });
    this.showNamed(named);
    return added!/*the edit applied*/;
  }

  /** renames a set, the build's unnamed main set included */
  public async renameSet(set: unknown, name: unknown): Promise<string> {
    await this.whenReady();
    const named = toSetName(name);
    await this.bridge.edit(text => {
      const { model, layout, section } = editable(text, set);
      refuseTaken(setNames(model), named, model.set ?? MAIN_SET);
      return renameSetEdits(layout, section/*none in an empty text*/, named);
    });
    return named;
  }

  /** removes a set and its lines, never the build's last; the main set removed, the
   *  next becomes the main model. The studio shows the main set when the set shown is
   *  the one removed */
  public async removeSet(set: unknown): Promise<Readonly<{ removed: string; parts: number; }>> {
    await this.whenReady();
    let removed: Readonly<{ removed: string; parts: number; }> | undefined;
    await this.bridge.edit(text => {
      const { model, layout, section, name } = editable(text, set);
      if(!model.sets) throw new BuildError('This build has one set, and a build keeps its last set: clear empties it.');
      removed = { removed: name, parts: partCount(model) };
      return removeSetEdits(text, layout.file, section!/*a build of sets*/);
    });
    return removed!/*the edit applied*/;
  }

  /** replaces the build with LDraw text: a build with components as written, any
   *  other written flat (the deliberate way to turn a multi-file model edits cannot
   *  apply to, one whose components hold others, into one they can). Given
   *  `expected`, the build is replaced only while it is that text, as an edit of it
   *  (one landing meanwhile refuses it too), and refused whole otherwise */
  public async replace(text: string, expected?: string): Promise<Model> {
    await this.whenReady();
    const model = parseModel(text);
    // every set is checked, never the main set alone: a text of several sets that edits
    // cannot apply to is refused, since writing it flat keeps its main set alone
    const sets = parseSets(text);
    if(sets.some(each => each.truncated)) throw new BuildError(`That LDraw is too large to take: ${READ_IN_PART} Nothing was changed.`);
    const over = sets.find(each => partCount(each) > MAX_PARTS);
    if(over) throw new BuildError(tooManyParts(sets.length, over));
    if(model.sets && !model.layout) throw new BuildError(`That LDraw cannot be taken: ${model.uneditable!/*by contract: no layout*/}. Nothing was changed.`);
    const asWritten = writtenAsGiven(model) && !!model.layout;
    if(!asWritten && model.unwritable) throw new BuildError(`That LDraw cannot be taken: ${model.unwritable}. Nothing was changed.`);
    const written = asWritten ? text : serializeModel(model);
    if(expected === undefined) await this.bridge.replace(written);
    else await this.bridge.edit(current => { refuseChanged(current, expected); return [{ from: 0, to: current.length, insert: written }]; });
    return model;
  }

  // == Internal ==================================================================
  /** shows the set shown of the build a new text holds: the main set once the set
   *  shown is gone */
  private show(text: string, source: ModelSource): void {
    this.text = text;
    const model = parseModel(text, (this.shown === undefined) ? undefined : { file: this.shown });
    if(fileOf(model) !== this.shown) this.shown = undefined/*its set is gone: the main set*/;
    const before = this.model;
    this.model = model;
    const unchanged = (source === 'document') && (model.set === before.set) && (looksOf(model) === looksOf(before));
    this.onModelChanged?.(this.model, unchanged ? 'elsewhere' : source);
  }

  /** shows a set by its file (the main set's by none), when it is not shown already */
  private showFile(file: string | undefined): void {
    const target = (file === this.model.sets?.[0].file) ? undefined : file/*the main set is shown by none*/;
    if(target === this.shown) return;
    this.shown = target;
    this.show(this.text, 'set');
  }

  /** shows a set by name, once an edit acting on it has landed */
  private showNamed(set: string | undefined): void {
    if(set === undefined) return;
    this.showFile(fileOf(parseModel(this.text, { name: set })));
  }
}

// == Validation ==================================================================
/** a build's text as it is given back (SEE: Build#getText): a build with components
 *  or more than one set, or one no text may be written from, as written; any other
 *  flat */
const givenText = (text: string, model: Model): string => (writtenAsGiven(model) || model.unwritable) ? text : serializeModel(model);

/** a text's lines, its final line break ending its last line rather than starting
 *  another */
export const linesOf = (text: string): string[] => {
  const lines = text.split('\n');
  if(lines[lines.length - 1] === '') lines.pop()/*the final line break*/;
  return lines;
};

/** a build's text as a reader is given it (getModel, page by page): each line ending in
 *  a line break, the last included, however the document stores it */
const readText = (text: string): string => linesOf(text).map(line => `${line}\n`).join('');

/** refuses a write naming the text it expects (as the build was read) when the build
 *  is no longer that text */
const refuseChanged = (text: string, expected: string | undefined): void => {
  if((expected !== undefined) && (readText(givenText(text, parseModel(text))) !== expected)) throw new BuildError('The build changed since it was read, so nothing was changed.');
};

/** the set of an app-content's text a call names (SEE: pickSet), as a model, and its
 *  name */
const setModel = (text: string, set: unknown): Readonly<{ model: Model; name: string; }> => {
  const main = parseModel(text);
  const name = pickSet(main, set);
  return { model: sameSetName(name, main.set ?? MAIN_SET) ? main : parseModel(text, { name }), name };
};

/** the set of an app-content's text a call names, when an edit can apply to it line
 *  by line: its model, layout, section and name */
const editable = (text: string, set?: unknown): Readonly<{ model: Model; layout: ModelLayout; section: SetSection | undefined; name: string; }> => {
  const { model, name } = setModel(text, set);
  if(model.truncated) throw new BuildError(`This build cannot be edited here: ${READ_IN_PART} Replace it with a smaller one (setModel) to edit.`);
  if(!model.layout) throw new BuildError(`This build cannot be edited line by line: ${model.uneditable!/*by contract: no layout*/}.`);
  return { model, layout: model.layout, section: model.layout.file.sets.find(each => sameSetName(each.name, name)), name };
};

/** the name of a text's main set */
const mainName = (text: string): string => parseModel(text).set ?? MAIN_SET;

/** the set a call names: the build's one set when it names none, refused naming the
 *  sets when the build has more than one or names none it has */
const pickSet = (main: Model, set: unknown): string => {
  const names = setNames(main);
  if(set === undefined) {
    if(names.length > 1) throw new BuildError(`This build has ${names.length} sets, ${listed(names)}: name one as set.`);
    return names[0];
  } /* else -- named */
  if((typeof set !== 'string') || (set.trim().length < 1)) throw new BuildError('set names one of the build\'s sets (listSets names them).');
  const found = names.find(name => sameSetName(name, set));
  if(found === undefined) throw new BuildError(`This build has no set named '${set}': its ${(names.length === 1) ? 'set is' : 'sets are'} ${listed(names)}.`);
  return found;
};

/** every set's name, the main set's first */
const setNames = (model: Model): ReadonlyArray<string> => model.sets?.map(each => each.name) ?? [model.set ?? MAIN_SET];

/** the file of the set a model is, when the build holds more than one (the main set's
 *  otherwise: none) */
const fileOf = (model: Model): string | undefined => model.sets?.find(each => each.name === model.set)?.file;

/** a set's name an input gives, or why it is none */
const toSetName = (name: unknown): string => {
  if((typeof name !== 'string') || (name.trim().length < 1) || (name.trim().length > MAX_SET_NAME) || /[\u0000-\u001f\u007f]/.test(name)) throw new BuildError(`name is a set's name: 1 to ${MAX_SET_NAME} characters on one line.`);
  return name.trim();
};

/** refuses a set name another set has (`own`, the set renamed, may keep its own) */
const refuseTaken = (names: ReadonlyArray<string>, name: string, own: string | undefined): void => {
  if(names.some(each => sameSetName(each, name) && !((own !== undefined) && sameSetName(each, own)))) throw new BuildError(`This build has a set named '${name}' already.`);
};

/** names in a sentence: "A", "A and B", "A, B and C" */
const listed = (names: ReadonlyArray<string>): string => (names.length < 2) ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** how many copies of a component every set of a text places */
const copiesIn = (text: string, component: string): number => parseSets(text).reduce((total, model) => total + copiesOf(model, component), 0);

/** a set as drawn, as one text: its header (its name and ground), its steps and every
 *  line it draws, its copies' and mounts' included. Two models that look alike draw
 *  alike */
const looksOf = (model: Model): string => serializeModel({ ...model, data: undefined });

/** the set an edit's result holds, refused when it would hold more parts than a set
 *  may, or be read only in part (its submodels expanding past what is read): a build
 *  is never written that its next edit could not apply to */
const readWhole = (text: string, set?: string): Model => {
  const model = parseModel(text, (set === undefined) ? undefined : { name: set });
  if(model.truncated) throw new BuildError(`That edit would leave the build too large to read whole: ${READ_IN_PART}`);
  if(partCount(model) > MAX_PARTS) throw new BuildError(tooManyParts(model.sets?.length ?? 1, model));
  return model;
};

/** the refusal of a set past its parts, naming how many it would hold: a build's, when
 *  it is the build's one set */
const tooManyParts = (sets: number, model: Model): string => (sets > 1)
  ? `A set holds at most ${MAX_PARTS} parts: this would make ${model.set ?? MAIN_SET} ${partCount(model)}.`
  : `A build holds at most ${MAX_PARTS} parts: this would make it ${partCount(model)}.`;

/** the parts a component of that name holds: a name free for one, and parts that
 *  repeat none; refuses the whole component otherwise (whether they collide is checked
 *  on the build, with what they carry: SEE: defineChecked) */
const componentParts = (name: unknown, input: ReadonlyArray<unknown>): Placement[] => {
  if((typeof name !== 'string') || !COMPONENT_NAME.test(name)) throw new BuildError('name must be lower case letters, digits and dashes, starting with a letter, at most 40 characters.');
  if(isReservedName(name)) throw new BuildError(`'${name}' is taken (a catalog part or the main model); choose another name.`);
  if(input.length < 1) throw new BuildError('No parts given.');
  if(input.length > MAX_BATCH) throw new BuildError(`At most ${MAX_BATCH} parts per component.`);
  const placements = validItems(input, 'parts', false) as Placement[]/*parts alone: its carriers' mounts are checked on the build (SEE: defineChecked)*/;
  const names = placements.map(describePlacement);
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if(repeated.length > 0) throw new BuildError(['Nothing was defined.', ...refusal('Listed twice in this call:', repeated)].join('\n'));
  return placements;
};

/** the parts (and, where `copies` allows, copies) a list describes; refuses the
 *  list naming each item that is not one */
const validItems = (input: ReadonlyArray<unknown>, field: string, copies: boolean): ReadonlyArray<Placement | Copy> => {
  const problems: string[] = [];
  const items = input.flatMap((item, index) => {
    const isCopy = (item !== null) && (typeof item === 'object') && ('component' in item);
    const result = !isCopy ? toPlacement(item) : copies ? toCopy(item) : 'a component holds parts, not copies of components';
    if(typeof result === 'string') { problems.push(`${field}[${index}]: ${result}`); return []; }
    return [result];
  });
  if(problems.length > 0) throw new BuildError(problems.join('\n'));
  return items;
};

/** the Copy an input describes, or why it is not one */
const toCopy = (item: unknown): Copy | string => {
  const { component, x, z, level, rotation } = (item ?? {}) as Record<string, unknown>;
  if((typeof component !== 'string') || !COMPONENT_NAME.test(component)) return `unknown component '${String(component)}' (listComponents names them)`;
  const where = toPosition(x, z, level, rotation);
  return (typeof where === 'string') ? where : { component, ...where };
};

/** the Placement an input describes, or why it is not one */
const toPlacement = (item: unknown): Placement | string => {
  const { part, color, x, z, level, rotation, pose, legColor, face, hat, rightHand, leftHand, angle, carry, sides } = (item ?? {}) as Record<string, unknown>;
  const catalogPart = (typeof part === 'string') ? getPart(part) : undefined;
  if(!catalogPart) return `unknown part '${String(part)}' (listParts names the catalog)`;
  if((typeof color !== 'string') || !getColor(color)) return `unknown color '${String(color)}' (listParts names the colors)`;
  const where = toPosition(x, z, level, rotation);
  if(typeof where === 'string') return where;
  const posing = toPosing(catalogPart, pose, legColor, face, { hat, rightHand, leftHand });
  if(typeof posing === 'string') return posing;
  const hinging = toHinging(catalogPart, angle, carry);
  if(typeof hinging === 'string') return hinging;
  const faced = toSides(catalogPart, sides);
  return (typeof faced === 'string') ? faced : { part: catalogPart.key, color, ...where, ...posing, ...hinging, ...faced };
};

/** the copies a part's side faces carry an input describes, or why they are not: by
 *  face, each a component and where it stands on the face's map (SEE: grid.ts Side
 *  faces) */
const toSides = (part: CatalogPart, sides: unknown): Pick<Placement, 'sides'> | string => {
  if(sides === undefined) return {};
  if(!part.faces) return `${part.key} has no side faces that carry (listParts names the parts that do)`;
  if((typeof sides !== 'object') || (sides === null) || Array.isArray(sides)) return `sides names faces (${part.faces.join(', ')}) and what each carries`;
  const carried: Partial<Record<typeof FACES[number], FaceCarry>> = {};
  for(const [face, value] of Object.entries(sides)) {
    if(!(part.faces as readonly string[]).includes(face)) return `${part.key} has no side face '${face}' that carries (${part.faces.join(', ')})`;
    const { component, x, z, rotation } = (value ?? {}) as Record<string, unknown>;
    if((typeof component !== 'string') || !COMPONENT_NAME.test(component)) return `sides.${face}.component: unknown component '${String(component)}' (listComponents names them)`;
    if(!isInteger(x) || !isInteger(z) || (Math.abs(x) > MAX_COORDINATE) || (Math.abs(z) > MAX_COORDINATE)) return `sides.${face}: x and z must be integers within ${MAX_COORDINATE} of the face's first stud`;
    const turn = (rotation === undefined) ? 0 : toRotation(rotation);
    if(turn === undefined) return `sides.${face}.rotation must be 0, 90, 180 or 270`;
    carried[face as typeof FACES[number]] = { component, x, z, rotation: turn };
  }
  return { sides: carried };
};

/** a hinge's angle and carry an input describes, or why they are not: the angle a
 *  whole number of POSE_STEPs (wrapped as a pose's, SEE: toPoseAngle), the carry a
 *  copy of a component as `addParts` takes one; an angle of 0 is left out */
const toHinging = (part: CatalogPart, angle: unknown, carry: unknown): Pick<Placement, 'angle' | 'carry'> | string => {
  if((angle === undefined) && (carry === undefined)) return {};
  if(!part.hinge) return `${part.key} takes no angle or carry (a hinge does)`;
  const turned = (angle === undefined) ? 0 : toPoseAngle(angle);
  if(turned === undefined) return `angle must be a whole number of ${POSE_STEP} degrees`;
  const copy = (carry === undefined) ? undefined : ((carry !== null) && (typeof carry === 'object') && ('component' in carry)) ? toCopy(carry) : 'names a component and where its copy stands with the hinge at 0';
  if(typeof copy === 'string') return `carry ${copy}`;
  return { ...((turned !== 0) ? { angle: turned } : {}), ...(copy ? { carry: copy } : {}) };
};

/** a posable part's pose, legs color, face and what it wears an input describes, or
 *  why they are not: each limb's angle a whole number of POSE_STEPs (wrapped, SEE:
 *  toPoseAngle), the legs a catalog color, the face one of the figure faces, a hat
 *  headgear and a hand's item one held (by a grip it has, when one is named), each in
 *  a catalog color; a limb at 0, legs in their own color and the default face are left
 *  out */
export const toPosing = (part: CatalogPart, pose: unknown, legColor: unknown, face: unknown, worn: Readonly<Record<Slot, unknown>>): Pick<Placement, 'pose' | 'legColor' | 'face' | 'hat' | 'rightHand' | 'leftHand'> | string => {
  const wearing = (Object.keys(worn) as Slot[]).filter(slot => worn[slot] !== undefined);
  if((pose === undefined) && (legColor === undefined) && (face === undefined) && (wearing.length < 1)) return {};
  if(!part.limbs) return `${part.key} takes no pose, legColor, face, hat or hand item (a figure does)`;
  const faced = toFace(part, face);
  if(typeof faced === 'string') return faced;
  const gear: Partial<Record<Slot, Gear>> = {};
  for(const slot of wearing) {
    const { part: key, color, grip } = (worn[slot] ?? {}) as Record<string, unknown>;
    const on = (slot === 'hat') ? 'head' : 'hand';
    const accessory = ACCESSORIES.find(each => (each.key === key) && (each.on === on));
    if(!accessory) return `${slot}.part must be one of ${ACCESSORIES.filter(each => each.on === on).map(each => each.key).join(', ')}`;
    if((typeof color !== 'string') || !getColor(color)) return `unknown ${slot}.color '${String(color)}' (listParts names the colors)`;
    const grips = accessory.grips ?? [];
    const held = (grip === undefined) ? undefined : grips.findIndex(each => each.name === grip);
    if(held === -1) return (grips.length > 0) ? `${slot}.grip of a ${accessory.key} must be one of ${grips.map(each => each.name).join(', ')}` : `a ${accessory.key} takes no grip`;
    gear[slot] = { part: accessory.key, color, ...((held !== undefined) ? { grip: grip as string } : {}) };
  }
  const angles: Partial<Record<Limb, number>> = {};
  if(pose !== undefined) {
    if((typeof pose !== 'object') || (pose === null) || Array.isArray(pose)) return `pose names limbs and their angles (${LIMBS.join(', ')})`;
    for(const [limb, value] of Object.entries(pose)) {
      if(!(LIMBS as readonly string[]).includes(limb)) return `pose names no limb '${limb}' (${LIMBS.join(', ')})`;
      const angle = toPoseAngle(value);
      if(angle === undefined) return `pose.${limb} must be a whole number of ${POSE_STEP} degrees`;
      angles[limb as Limb] = angle;
    }
  }
  const legsColor = (legColor === undefined) ? undefined : (typeof legColor === 'string') ? getColor(legColor) : undefined;
  if((legColor !== undefined) && !legsColor) return `unknown legColor '${String(legColor)}' (listParts names the colors)`;
  const ownLegs = pieceLines(part)[(part.legs ?? [])[0]]?.colorCode;
  const normalized = normalizePose(angles as Pose);
  return { ...(normalized ? { pose: normalized } : {}), ...((legsColor && (legsColor.code !== ownLegs)) ? { legColor: legsColor.key } : {}), ...faced, ...gear };
};

/** the face an input names for a part, or why it is not one: one of the figure
 *  faces on a part with a face piece; the default left out */
export const toFace = (part: CatalogPart, face: unknown): Pick<Placement, 'face'> | string => {
  if(face === undefined) return {};
  if(part.facePiece === undefined) return `${part.key} takes no face (a figure does)`;
  if(!getFigureFace(face)) return `unknown face '${String(face)}' (one of ${FIGURE_FACES.map(each => each.key).join(', ')})`;
  return (face === DEFAULT_FIGURE_FACE) ? {} : { face: face as string };
};

/** a position on the grid an input describes, or why it is not one */
const toPosition = (x: unknown, z: unknown, level: unknown, rotation: unknown): Pick<Placement, 'x' | 'z' | 'level' | 'rotation'> | string => {
  if(!isInteger(x) || !isInteger(z) || !isInteger(level)) return 'x, z and level must be integers';
  if((Math.abs(x) > MAX_COORDINATE) || (Math.abs(z) > MAX_COORDINATE)) return `x and z must lie within ${MAX_COORDINATE} of the origin`;
  if((level < 0) || (level > MAX_LEVEL)) return `level must lie between 0 and ${MAX_LEVEL}`;
  const turn = (rotation === undefined) ? 0 : toRotation(rotation);
  if(turn === undefined) return 'rotation must be 0, 90, 180 or 270';
  return { x, z, level, rotation: turn };
};

// == Components ==================================================================
/** the edits that define (or redefine) a component on a text, its hinges and faces
 *  carrying components that carry none (SEE: mountRefusals), refused whole when the
 *  build would hold too many parts, a copy would collide, a component carried would
 *  carry components, or a hinge or face carrying it would carry it no longer (its copy
 *  no longer on their studs) */
const defineChecked = (text: string, name: string, placements: ReadonlyArray<Placement>): Readonly<{ changes: ReadonlyArray<ContentChange>; outcome: Defined; }> => {
  const { model, layout } = editable(text, mainName(text));
  const unmounted = placements.flatMap((placement, index) => mountRefusals(model, placement, index, name));
  if(unmounted.length > 0) throw new BuildError(['Nothing was defined.', ...unmounted].join('\n'));
  // counted before anything it carries is expanded: a component past a build's parts
  // could never be placed
  const parts = placedPartCount(model, placements);
  if(parts > MAX_PARTS) throw new BuildError(`Nothing was defined. A component holds at most ${MAX_PARTS} parts with what its hinges and faces carry: this would make it ${parts}.`);
  const inside = checkModel({ header: [], placements, others: [], ...(model.components ? { components: model.components } : {}) }).collisions;
  if(inside.length > 0) throw new BuildError(['Nothing was defined.', ...refusal('These parts of the component collide:', inside.map(pair => `${pair.b} overlaps ${pair.a}`))].join('\n'));
  const before = parseSets(text);
  const carrying = before.flatMap((set, index) => carriersIn(set, name, (index === 0)/*the build's components once*/, before.length > 1));
  if((carrying.length > 0) && placements.some(placement => mountsOf(placement).length > 0)) throw new BuildError([`Nothing was defined. ${name} is carried, and a component carried carries none:`, ...refusal('', carrying).slice(1)].join('\n'));
  const changes = defineEdits(layout.file, name, placements.flatMap(placement => carrierLines(model, placement)));
  const definedText = applyChanges(text, changes);
  const after = parseSets(definedText);
  after.forEach(set => readWhole(definedText, set.set));
  // every set's copies change with it: each set is checked, named when there are more
  const where = (model: Model) => (after.length > 1) ? ` (in ${model.set})` : '';
  const carriers = (of: Model, index: number) => carriersIn(of, name, (index === 0), after.length > 1);
  const dropped = before.flatMap((model, index) => { const kept = carriers(after[index], index); return carriers(model, index).filter(carrier => !kept.includes(carrier)); });
  if(dropped.length > 0) throw new BuildError(['Nothing was defined. It would no longer stand on the studs of the hinges and faces carrying it:', ...refusal('', dropped).slice(1)].join('\n'));
  const introduced = before.flatMap((model, index) => {
    const known = new Set(checkModel(model).collisions.map(pair => `${pair.a}|${pair.b}`));
    return checkModel(after[index]).collisions.filter(pair => !known.has(`${pair.a}|${pair.b}`)).map(pair => `${pair.b} overlaps ${pair.a}${where(after[index])}`);
  });
  // the components carrying it change with it too, placed or not
  const knownInside = new Set(insideCarriers(before[0], name));
  const colliding = insideCarriers(after[0], name).filter(collision => !knownInside.has(collision));
  if((introduced.length + colliding.length) > 0) throw new BuildError([
    ...((introduced.length > 0) ? ['Nothing was defined. Its copies would collide:', ...refusal('', introduced).slice(1)] : ['Nothing was defined.']),
    ...refusal('The components carrying it would collide inside:', colliding),
  ].join('\n'));

  const defined = componentOf(after[0], name)!;
  const footprint = defined.footprint!/*its parts are on the grid*/;
  const [width, depth] = footprintSize(footprint, 0);
  return { changes, outcome: { name, size: `${width}x${depth}x${footprint.height}`, parts: placedPartCount(after[0], defined.placements)/*what its carriers carry included*/, copies: copiesIn(definedText, name) } };
};

/** a saved design's parts on the grid, moved so its footprint starts at x 0, z 0
 *  and its lowest part stands at level 0, and how many of its parts are off the grid.
 *  Refused for a design whose hinges or faces carry components: the components they
 *  carry are the design's, not the build's */
const designParts = (ldraw: string): Readonly<{ parts: ReadonlyArray<Placement>; leftOut: number; otherSets: number; }> => {
  const design = parseModel(ldraw);
  if(design.truncated) throw new BuildError(`That design is too large to take: ${READ_IN_PART}`);
  if(design.untold) throw new BuildError(`That design cannot be taken: ${design.untold}.`);
  if(design.placements.some(placement => mountsOf(placement).length > 0)) throw new BuildError('That design\'s hinges or side faces carry its own components, which a component of this build cannot take: open it as the build instead (loadDesign).');
  const footprint = footprintOf(design.placements);
  if(!footprint) throw new BuildError('That design holds no parts on the grid.');
  const lowest = minOf(design.placements.map(placement => placement.level));
  const parts = design.placements.map(placement => ({ ...placement, x: placement.x - footprint.minX, z: placement.z - footprint.minZ, level: placement.level - lowest }));
  return { parts, leftOut: design.others.length, otherSets: Math.max(0, (design.sets?.length ?? 1) - 1)/*a component is made from its first set*/ };
};

/** where a copy of a component goes beside a build: on the ground, its footprint
 *  BESIDE_GAP studs past the cells the build fills (its hinges' carries' included),
 *  east of it (else north, west or south, the first that stays within MAX_COORDINATE
 *  of the origin), or centered on the origin when the build fills none */
const besideBuild = (model: Model, component: string, footprint: Footprint): Copy | undefined => {
  const [width, depth] = footprintSize(footprint, 0);
  const cells = model.placements.flatMap(placement => occupiedCells(model, placement));
  if(cells.length < 1) return { component, x: -Math.floor(width / 2), z: -Math.floor(depth / 2), level: 0, rotation: 0 };
  const [minX, minZ] = [minOf(cells.map(cell => cell.x)), minOf(cells.map(cell => cell.z))];
  const [maxX, maxZ] = [maxOf(cells.map(cell => cell.x)) + 1, maxOf(cells.map(cell => cell.z)) + 1];
  const spots = [[maxX + BESIDE_GAP, minZ], [minX, maxZ + BESIDE_GAP], [minX - BESIDE_GAP - width, minZ], [minX, minZ - BESIDE_GAP - depth]] as const;
  const reach = (from: number, size: number): boolean => (Math.abs(from) <= MAX_COORDINATE) && (Math.abs(from + size - 1) <= MAX_COORDINATE);
  const spot = spots.find(([x, z]) => reach(x, width) && reach(z, depth));
  return spot && { component, x: spot[0], z: spot[1], level: 0, rotation: 0 };
};

/** the carriers of a component in a set, described: its own parts', and the build's
 *  components' when `components` says (they are every set's), each named by where it is */
const carriersIn = (model: Model, name: string, components: boolean, several: boolean): string[] => {
  const carrying = (placement: Placement) => mountsOf(placement).some(mount => mount.copy.component === name);
  return [
    ...model.placements.filter(carrying).map(placement => describePlacement(placement) + (several ? ` (in ${model.set})` : '')),
    ...(components ? (model.components ?? []).flatMap(component => component.placements.filter(carrying).map(placement => `${describePlacement(placement)} in ${component.name}`)) : []),
  ];
};

/** the collisions inside each component carrying a component (its definition's own
 *  parts and what they carry), described, each named by its component */
const insideCarriers = (model: Model, name: string): string[] => (model.components ?? [])
  .filter(component => component.placements.some(placement => mountsOf(placement).some(mount => mount.copy.component === name)))
  .flatMap(component => checkModel({ header: [], placements: component.placements, others: [], components: model.components }).collisions.map(pair => `${pair.b} overlaps ${pair.a} in ${component.name}`));

/** why each of a placement's mounts is refused, model-facing: the component it carries
 *  is the one being defined, has no parts on the grid, carries components itself (a
 *  component carried carries none), or does not stand on its slot's studs */
const mountRefusals = (model: Model, placement: Placement, index: number, defining?: string): string[] => mountsOf(placement).flatMap(mount => {
  const name = mount.copy.component;
  if(name === defining) return [`parts[${index}]: ${name} cannot carry itself`];
  const component = componentOf(model, name);
  if(!component?.footprint) return [`parts[${index}]: no component named ${name} holds parts on the grid (defineComponent defines one; listComponents names them)`];
  if(carriesComponents(component)) return [`parts[${index}]: ${name} carries components itself, and a component carried carries none`];
  return mountRests(model, placement, mount) ? [] : [`parts[${index}]: ${whyUnrested(mount)}`];
});

/** a placement's lines and its mounts', its mounts' components the model's */
const carrierLines = (model: Model, placement: Placement): string[] =>
  [...placementLines(placement), ...mountsOf(placement).map(mount => mountLine(withFootprint(componentOf(model, mount.copy.component)!/*by contract*/), placement, mount))];

/** whether a mount stands on its slot's studs (SEE: grid.ts restsIn), its component
 *  one the model defines with parts on the grid */
const mountRests = (model: Model, carrier: Placement, mount: Mount): boolean =>
  restsIn(getShape(getPart(carrier.part)!/*by contract*/), carrier, mount.slot, componentOf(model, mount.copy.component)!.footprint!/*by contract*/, mount.copy);

/** why a mount was refused, model-facing */
const whyUnrested = ({ slot }: Mount): string => (slot === 'top')
  ? 'carry must stand on the hinge\'s top with the hinge at 0: its level the level of the hinge\'s studs, its footprint over at least one of them'
  : `sides.${slot} must stand on the face's map over at least one of its studs (its first stud at x 0, z 0; listParts says how a face's map runs)`;

/** a component whose parts are on the grid, as its copies' lines take it */
const withFootprint = (component: Readonly<{ file: string; footprint?: Footprint; }>): Readonly<{ file: string; footprint: Footprint; }> =>
  ({ file: component.file, footprint: component.footprint!/*by contract*/ });

/** whether the build itself takes a name: a catalog part's or the main model's,
 *  neither of which a component may have */
export const isReservedName = (name: string): boolean => !!getPart(name) || (name === 'model');


/** a model's component of a name */
const componentOf = (model: Model, name: string) => model.components?.find(component => component.name === name);

/** whether a model's text is kept as written: it defines components, or holds more
 *  than one set */
const writtenAsGiven = (model: Model): boolean => ((model.components?.length ?? 0) > 0) || !!model.sets;

// == Util ========================================================================
/** a part or copy in one line */
const describeItem = (item: Placement | Copy): string => ('component' in item) ? describeCopy(item) : describePlacement(item);

/** one section of a refusal: its heading and a bounded list, or nothing */
const refusal = (heading: string, lines: ReadonlyArray<string>): string[] =>
  (lines.length < 1) ? [] : [heading, ...lines.slice(0, MAX_LISTED), ...((lines.length > MAX_LISTED) ? [`and ${lines.length - MAX_LISTED} more`] : [])];

const isInteger = (value: unknown): value is number => (typeof value === 'number') && Number.isInteger(value);
