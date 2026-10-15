import type { ContentChange } from '../../../shared/charmiq';
import { checkModel, describeCopy, describePlaced, describePlacement, MAX_LISTED, type CheckResult } from './check';
import type { ContentBridge } from './content-bridge';
import { cellKey, filledCells, footprintOf, footprintSize, frameKey, getColor, getPart, getShape, toRotation, type Copy, type Footprint, type Placement } from './grid';
import { appendLines, applyChanges, clearEdits, copyLine, defineEdits, deleteLines, groundEdit, parseModel, placementLines, serializeModel, type Model, type ModelLayout, EMPTY_MODEL, MAX_PARTS, READ_IN_PART } from './model';
import { minOf } from './numbers';

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
export const MAX_COORDINATE = 400/*studs from the origin*/;
const MAX_LEVEL = 600/*plates*/;
/** the studs between a build and a copy placed beside it */
const BESIDE_GAP = 2/*studs*/;
/** a component's name: its file is `<name>.ldr` */
const COMPONENT_NAME = /^[a-z][a-z0-9-]{0,39}$/;

// == Types =======================================================================
/** why the build changed: the first load, or a change to the app-content */
export type ModelSource = 'document' | 'load';

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
/** a component defined from a design, with the design's parts off the grid it left out */
export type DefinedFromDesign = Defined & Readonly<{ leftOut: number; }>;

// == Class =======================================================================
export class Build {
  private model: Model = EMPTY_MODEL;
  /** the app-content's text the model was read from */
  private text = '';
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
  public getModel(): Model { return this.model; }
  /** whether the build may no longer be in the document (SEE: ContentBridge#isUncertain) */
  public isUncertain(): boolean { return this.bridge.isUncertain(); }
  /** why edits wait, when the document holds more than one build (SEE: ContentBridge#conflict) */
  public conflict(): string | undefined { return this.bridge.conflict(); }
  /** every build the document holds, by app-content id */
  public builds(): ReadonlyArray<Readonly<{ id: string; ldraw: string; }>> { return this.bridge.builds(); }
  /** the build as LDraw text: a build with components, or whose pieces are untold
   *  (SEE: Model#untold), as written; any other flat. Refused for a build read only in
   *  part, which would otherwise pass for the whole build (and replace it, given back
   *  to setModel) */
  public getText(): string {
    if(this.model.truncated) throw new BuildError(`${READ_IN_PART} Its text cannot be given back whole from here; the whole text is in the document's model app-content.`);
    return (hasComponents(this.model) || this.model.untold) ? this.text : serializeModel(this.model);
  }
  public check(): CheckResult { return checkModel(this.model); }

  // == Edit ======================================================================
  /** adds parts and copies of components to the last building step, or as a new
   *  step after it (`newStep`); refuses the whole batch when any item is invalid or
   *  collides */
  public async add(input: ReadonlyArray<unknown>, newStep: boolean): Promise<Readonly<{ added: number; }>> {
    await this.whenReady();
    if(input.length < 1) throw new BuildError('No parts given.');
    if(input.length > MAX_BATCH) throw new BuildError(`At most ${MAX_BATCH} parts per call.`);
    const items = validItems(input, 'parts', true);

    let outcome = { added: 0 };
    await this.bridge.edit(text => {
      const { model, layout } = editable(text);
      const missing = [...new Set(items.flatMap(item => ('component' in item) && !componentOf(model, item.component)?.footprint ? [item.component] : []))];
      if(missing.length > 0) throw new BuildError(`Nothing was added. No component named ${missing.join(', ')} holds parts on the grid (defineComponent defines one; listComponents names them).`);
      const lines = items.flatMap(item => {
        if(!('component' in item)) return placementLines(item);
        const component = componentOf(model, item.component)!/*by contract*/;
        return [copyLine({ file: component.file, footprint: component.footprint!/*by contract*/ }, item)];
      });
      const change = appendLines(layout, lines, newStep);
      const next = readWhole(applyChanges(text, [change]));

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
    const { parts, leftOut } = designParts(ldraw);
    return { ...await this.defineComponent(name, parts), leftOut };
  }

  /** defines a component from LDraw text (SEE: defineComponentFromText) and places
   *  one copy of it on the ground just outside everything the build holds, as a new
   *  step (SEE: besideBuild), in one edit: both land or neither does. A component of
   *  that name placed already is redefined, every copy with it, only when `replace`
   *  says it may be (ComponentPlaced otherwise), judged on the text the edit is made
   *  on */
  public async addDesign(name: unknown, ldraw: string, replace: boolean): Promise<Readonly<{ component: DefinedFromDesign; copy: Copy; }>> {
    await this.whenReady();
    const { parts, leftOut } = designParts(ldraw);
    const placements = componentParts(name, parts);
    const component = name as string/*by componentParts*/;

    let outcome: Readonly<{ component: DefinedFromDesign; copy: Copy; }> | undefined;
    await this.bridge.edit(text => {
      const placed = copiesOf(editable(text).model, component);
      if((placed > 0) && !replace) throw new ComponentPlaced(component, placed);
      const defined = defineChecked(text, component, placements);

      // the copy goes where the redefined build leaves room: nothing fills it there,
      // so it never collides
      const definedText = applyChanges(text, defined.changes);
      const { model, layout } = editable(definedText);
      const { file, footprint } = componentOf(model, component)!/*by contract*/;
      const copy = besideBuild(model, component, footprint!/*its parts are on the grid*/);
      if(!copy) throw new BuildError(`Nothing was added. There is no room beside the build within ${MAX_COORDINATE} studs of the origin.`);
      const change = appendLines(layout, [copyLine({ file, footprint: footprint! }, copy)], true);
      readWhole(applyChanges(definedText, [change]));

      outcome = { component: { ...defined.outcome, copies: defined.outcome.copies + 1, leftOut }, copy };
      return [...defined.changes, change]/*each measured after the ones before it*/;
    });
    return outcome!/*the edit applied*/;
  }

  // ------------------------------------------------------------------------------
  /** removes the part that fills each given cell, and the glass in a removed frame;
   *  a cell a component's line fills (a copy or not) removes that whole line. The cells are read on the build as
   *  the edit applies to it: a part that took a cell's place meanwhile is the one
   *  removed. Names the parts the removal left floating (`unsupported`) */
  public async remove(cells: ReadonlyArray<unknown>): Promise<Readonly<{ removed: ReadonlyArray<string>; empty: ReadonlyArray<string>; unsupported: ReadonlyArray<string>; }>> {
    await this.whenReady();
    if(cells.length < 1) throw new BuildError('No cells given.');
    const at = cells.map((cell, index) => {
      const { x, z, level } = (cell ?? {}) as Record<string, unknown>;
      if(!isInteger(x) || !isInteger(z) || !isInteger(level)) throw new BuildError(`at[${index}]: x, z and level must be integers.`);
      return { x, z, level };
    });

    let outcome = { removed: [] as ReadonlyArray<string>, empty: [] as ReadonlyArray<string>, unsupported: [] as ReadonlyArray<string> };
    await this.bridge.edit(text => {
      const { model, layout } = editable(text);

      // the placement that fills each cell
      const filled = new Map<string, number>();
      model.placements.forEach((placement, index) => {
        const shape = getShape(getPart(placement.part)!/*by contract*/);
        for(const { x, z, bottom, top } of filledCells(shape, placement)) {
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
      const after = checkModel(parseModel(applyChanges(text, changes)));
      outcome = {
        removed: [...own.map(index => describePlacement(model.placements[index])), ...[...placed].map(line => describePlaced(model, line))],
        empty, unsupported: after.floating.filter(name => !floatingBefore.has(name)),
      };
      return changes;
    });
    return outcome;
  }

  // ------------------------------------------------------------------------------
  /** removes every part, copy and component the build holds as the edit applies to
   *  it, its header (and ground) kept */
  public async clear(): Promise<number> {
    await this.whenReady();
    let removed = 0;
    await this.bridge.edit(text => {
      const { model, layout } = editable(text);
      removed = partCount(model);
      return clearEdits(layout);
    });
    return removed;
  }

  /** colors the baseplate (a catalog color that is not see-through), or returns it
   *  to the theme's (`undefined`) */
  public async setGround(color: unknown): Promise<string | undefined> {
    await this.whenReady();
    if((color !== undefined) && ((typeof color !== 'string') || !getColor(color))) throw new BuildError(`unknown color '${String(color)}' (listParts names the colors)`);
    if((color !== undefined) && getColor(color)!.transparent) throw new BuildError('The ground cannot be see-through.');
    await this.bridge.edit(text => groundEdit(editable(text).layout, color));
    return color;
  }

  /** replaces the build with LDraw text: a build with components as written, any
   *  other written flat (the deliberate way to turn a multi-file model edits cannot
   *  apply to, one whose components hold others, into one they can) */
  public async replace(text: string): Promise<Model> {
    await this.whenReady();
    const model = parseModel(text);
    if(model.truncated) throw new BuildError(`That LDraw is too large to take: ${READ_IN_PART} Nothing was changed.`);
    if(model.untold) throw new BuildError(`That LDraw cannot be taken: ${model.untold}. Nothing was changed.`);
    if(partCount(model) > MAX_PARTS) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);
    await this.bridge.replace((hasComponents(model) && model.layout) ? text : serializeModel(model));
    return model;
  }

  // == Internal ==================================================================
  /** shows the build a new text holds */
  private show(text: string, source: ModelSource): void {
    this.text = text;
    this.model = parseModel(text);
    this.onModelChanged?.(this.model, source);
  }
}

// == Validation ==================================================================
/** the model an app-content's text holds, when an edit can apply to it line by line */
const editable = (text: string): Readonly<{ model: Model; layout: ModelLayout; }> => {
  const model = parseModel(text);
  if(model.truncated) throw new BuildError(`This build cannot be edited here: ${READ_IN_PART} Replace it with a smaller one (setModel) to edit.`);
  if(!model.layout) throw new BuildError(`This build cannot be edited line by line: ${model.uneditable!/*by contract: no layout*/}.`);
  return { model, layout: model.layout };
};

/** the model an edit's result holds, refused when it would hold more parts than a
 *  build may, or be read only in part (its submodels expanding past what is read):
 *  a build is never written that its next edit could not apply to */
const readWhole = (text: string): Model => {
  const model = parseModel(text);
  if(model.truncated || (partCount(model) > MAX_PARTS)) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);
  return model;
};

/** the parts a component of that name holds: a name free for one, and parts that
 *  neither repeat nor collide; refuses the whole component otherwise */
const componentParts = (name: unknown, input: ReadonlyArray<unknown>): Placement[] => {
  if((typeof name !== 'string') || !COMPONENT_NAME.test(name)) throw new BuildError('name must be lower case letters, digits and dashes, starting with a letter, at most 40 characters.');
  if(isReservedName(name)) throw new BuildError(`'${name}' is taken (a catalog part or the main model); choose another name.`);
  if(input.length < 1) throw new BuildError('No parts given.');
  if(input.length > MAX_BATCH) throw new BuildError(`At most ${MAX_BATCH} parts per component.`);
  const placements = validItems(input, 'parts', false) as Placement[]/*parts alone*/;
  const names = placements.map(describePlacement);
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  const inside = checkModel({ header: [], placements, others: [] }).collisions.filter(pair => pair.a !== pair.b/*a repeat, named below*/);
  if((repeated.length + inside.length) > 0) throw new BuildError(['Nothing was defined.',
    ...refusal('Listed twice in this call:', repeated),
    ...refusal('These parts of the component collide:', inside.map(pair => `${pair.b} overlaps ${pair.a}`)),
  ].join('\n'));
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
  const { part, color, x, z, level, rotation } = (item ?? {}) as Record<string, unknown>;
  if((typeof part !== 'string') || !getPart(part)) return `unknown part '${String(part)}' (listParts names the catalog)`;
  if((typeof color !== 'string') || !getColor(color)) return `unknown color '${String(color)}' (listParts names the colors)`;
  const where = toPosition(x, z, level, rotation);
  return (typeof where === 'string') ? where : { part, color, ...where };
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
/** the edits that define (or redefine) a component on a text, refused whole when
 *  the build would hold too many parts or a copy would collide */
const defineChecked = (text: string, name: string, placements: ReadonlyArray<Placement>): Readonly<{ changes: ReadonlyArray<ContentChange>; outcome: Defined; }> => {
  const { model, layout } = editable(text);
  const changes = defineEdits(layout, name, placements.flatMap(placementLines));
  const next = readWhole(applyChanges(text, changes));
  const before = new Set(checkModel(model).collisions.map(pair => `${pair.a}|${pair.b}`));
  const introduced = checkModel(next).collisions.filter(pair => !before.has(`${pair.a}|${pair.b}`));
  if(introduced.length > 0) throw new BuildError(['Nothing was defined. Its copies would collide:', ...refusal('', introduced.map(pair => `${pair.b} overlaps ${pair.a}`)).slice(1)].join('\n'));

  const footprint = componentOf(next, name)!.footprint!/*its parts are on the grid*/;
  const [width, depth] = footprintSize(footprint, 0);
  return { changes, outcome: { name, size: `${width}x${depth}x${footprint.height}`, parts: placements.length, copies: copiesOf(next, name) } };
};

/** a saved design's parts on the grid, moved so its footprint starts at x 0, z 0
 *  and its lowest part stands at level 0, and how many of its parts are off the grid */
const designParts = (ldraw: string): Readonly<{ parts: ReadonlyArray<Placement>; leftOut: number; }> => {
  const design = parseModel(ldraw);
  if(design.truncated) throw new BuildError(`That design is too large to take: ${READ_IN_PART}`);
  if(design.untold) throw new BuildError(`That design cannot be taken: ${design.untold}.`);
  const footprint = footprintOf(design.placements);
  if(!footprint) throw new BuildError('That design holds no parts on the grid.');
  const lowest = minOf(design.placements.map(placement => placement.level));
  const parts = design.placements.map(placement => ({ ...placement, x: placement.x - footprint.minX, z: placement.z - footprint.minZ, level: placement.level - lowest }));
  return { parts, leftOut: design.others.length };
};

/** where a copy of a component goes beside a build: on the ground, its footprint
 *  BESIDE_GAP studs past the cells the build fills, east of it (else north, west or
 *  south, the first that stays within MAX_COORDINATE of the origin), or centered on
 *  the origin when the build fills none */
const besideBuild = (model: Model, component: string, footprint: Footprint): Copy | undefined => {
  const [width, depth] = footprintSize(footprint, 0);
  const build = footprintOf(model.placements);
  if(!build) return { component, x: -Math.floor(width / 2), z: -Math.floor(depth / 2), level: 0, rotation: 0 };
  const { minX, minZ, maxX, maxZ } = build;
  const spots = [[maxX + BESIDE_GAP, minZ], [minX, maxZ + BESIDE_GAP], [minX - BESIDE_GAP - width, minZ], [minX, minZ - BESIDE_GAP - depth]] as const;
  const reach = (from: number, size: number): boolean => (Math.abs(from) <= MAX_COORDINATE) && (Math.abs(from + size - 1) <= MAX_COORDINATE);
  const spot = spots.find(([x, z]) => reach(x, width) && reach(z, depth));
  return spot && { component, x: spot[0], z: spot[1], level: 0, rotation: 0 };
};

/** whether the build itself takes a name: a catalog part's or the main model's,
 *  neither of which a component may have */
export const isReservedName = (name: string): boolean => !!getPart(name) || (name === 'model');

/** how many copies of a component a model places */
const copiesOf = (model: Model, name: string): number => (model.copies ?? []).filter(copy => copy.component === name).length;

/** a model's component of a name */
const componentOf = (model: Model, name: string) => model.components?.find(component => component.name === name);

/** whether a model defines components (its text is then kept as written) */
const hasComponents = (model: Model): boolean => (model.components?.length ?? 0) > 0;

// == Util ========================================================================
/** a part or copy in one line */
const describeItem = (item: Placement | Copy): string => ('component' in item) ? describeCopy(item) : describePlacement(item);

/** one section of a refusal: its heading and a bounded list, or nothing */
const refusal = (heading: string, lines: ReadonlyArray<string>): string[] =>
  (lines.length < 1) ? [] : [heading, ...lines.slice(0, MAX_LISTED), ...((lines.length > MAX_LISTED) ? [`and ${lines.length - MAX_LISTED} more`] : [])];

const isInteger = (value: unknown): value is number => (typeof value === 'number') && Number.isInteger(value);

/** every part a model holds, outside the catalog included */
const partCount = (model: Model): number => model.placements.length + model.others.length;
