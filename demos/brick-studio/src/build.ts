import { checkModel, describeCopy, describePlacement, MAX_LISTED, type CheckResult } from './check';
import type { ContentBridge } from './content-bridge';
import { cellKey, filledCells, footprintSize, frameKey, getColor, getPart, getShape, toRotation, type Copy, type Placement } from './grid';
import { appendLines, applyChanges, clearEdits, copyLine, defineEdits, deleteLines, groundEdit, parseModel, placementLines, serializeModel, type Model, type ModelLayout, EMPTY_MODEL, MAX_PARTS, READ_IN_PART } from './model';

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
/** a component's name: its file is `<name>.ldr` */
const COMPONENT_NAME = /^[a-z][a-z0-9-]{0,39}$/;

// == Types =======================================================================
/** why the build changed: the first load, or a change to the app-content */
export type ModelSource = 'document' | 'load';

// ................................................................................
/** a refused edit; its message is model-facing */
export class BuildError extends Error {}

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
  /** the build as LDraw text: a build with components as written, any other flat;
   *  refused for a build read only in part, which would otherwise pass for the whole
   *  build (and replace it, given back to setModel) */
  public getText(): string {
    if(this.model.truncated) throw new BuildError(`${READ_IN_PART} Its text cannot be given back whole from here; the whole text is in the document's model app-content.`);
    return hasComponents(this.model) ? this.text : serializeModel(this.model);
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
      const lines = items.flatMap(item => ('component' in item) ? [copyLine(componentOf(model, item.component)!.footprint!/*by contract*/, item)] : placementLines(item));
      const change = appendLines(layout, lines, newStep);
      const next = parseModel(applyChanges(text, [change]));
      if(next.truncated || (partCount(next) > MAX_PARTS)) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);

      // refuse any collision the batch introduces. A part or copy identical to one
      // already in the build was most likely added by an earlier call (one whose answer
      // was lost), and one listed twice is a slip: each is named as such, not as a
      // collision
      const before = new Set(checkModel(model).collisions.map(pair => `${pair.a}|${pair.b}`));
      const introduced = checkModel(next).collisions.filter(pair => !before.has(`${pair.a}|${pair.b}`) && (pair.a !== pair.b)/*a repeat, named below*/);
      const existing = new Set([...model.placements.filter((_, index) => model.placementCopies?.[index] === undefined).map(describePlacement), ...(model.copies ?? []).map(describeCopy)]);
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
  public async defineComponent(name: unknown, input: ReadonlyArray<unknown>): Promise<Readonly<{ name: string; size: string; parts: number; copies: number; }>> {
    await this.whenReady();
    if((typeof name !== 'string') || !COMPONENT_NAME.test(name)) throw new BuildError('name must be lower case letters, digits and dashes, starting with a letter, at most 40 characters.');
    if(getPart(name) || (name === 'model')) throw new BuildError(`'${name}' is taken (a catalog part or the main model); choose another name.`);
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

    let outcome = { name, size: '', parts: 0, copies: 0 };
    await this.bridge.edit(text => {
      const { model, layout } = editable(text);
      const changes = defineEdits(layout, name, placements.flatMap(placementLines));
      const next = parseModel(applyChanges(text, changes));
      if(next.truncated || (partCount(next) > MAX_PARTS)) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);
      const before = new Set(checkModel(model).collisions.map(pair => `${pair.a}|${pair.b}`));
      const introduced = checkModel(next).collisions.filter(pair => !before.has(`${pair.a}|${pair.b}`));
      if(introduced.length > 0) throw new BuildError(['Nothing was defined. Its copies would collide:', ...refusal('', introduced.map(pair => `${pair.b} overlaps ${pair.a}`)).slice(1)].join('\n'));

      const footprint = componentOf(next, name)!.footprint!/*its parts are on the grid*/;
      const [width, depth] = footprintSize(footprint, 0);
      outcome = { name, size: `${width}x${depth}x${footprint.height}`, parts: placements.length, copies: (next.copies ?? []).filter(copy => copy.component === name).length };
      return changes;
    });
    return outcome;
  }

  // ------------------------------------------------------------------------------
  /** removes the part that fills each given cell, and the glass in a removed frame;
   *  a cell a copy fills removes the whole copy. The cells are read on the build as
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

      // a part of a copy takes its whole copy: the copy's line goes
      const copies = new Set([...removing].flatMap(index => model.placementCopies?.[index] ?? []));
      const own = [...removing].filter(index => model.placementCopies?.[index] === undefined);
      const changes = deleteLines([...own.flatMap(index => [layout.placements[index], ...layout.pieces[index]]), ...[...copies].map(copy => layout.copies[copy])]);

      // what floats now that floated not before
      const floatingBefore = new Set(checkModel(model).floating);
      const after = checkModel(parseModel(applyChanges(text, changes)));
      outcome = {
        removed: [...own.map(index => describePlacement(model.placements[index])), ...[...copies].map(copy => describeCopy(model.copies![copy]/*by contract*/))],
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
  if(!model.layout) throw new BuildError('This build is a multi-file LDraw model whose submodels place other submodels, so edits cannot change it line by line. Replace it with a flat model to edit it: call setModel with the text getModel returns (comments inside its submodels are not kept).');
  return { model, layout: model.layout };
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

/** a part or copy in one line */
const describeItem = (item: Placement | Copy): string => ('component' in item) ? describeCopy(item) : describePlacement(item);

/** a model's component of a name */
const componentOf = (model: Model, name: string) => model.components?.find(component => component.name === name);

/** whether a model defines components (its text is then kept as written) */
const hasComponents = (model: Model): boolean => (model.components?.length ?? 0) > 0;

/** one section of a refusal: its heading and a bounded list, or nothing */
const refusal = (heading: string, lines: ReadonlyArray<string>): string[] =>
  (lines.length < 1) ? [] : [heading, ...lines.slice(0, MAX_LISTED), ...((lines.length > MAX_LISTED) ? [`and ${lines.length - MAX_LISTED} more`] : [])];

const isInteger = (value: unknown): value is number => (typeof value === 'number') && Number.isInteger(value);

/** every part a model holds, outside the catalog included */
const partCount = (model: Model): number => model.placements.length + model.others.length;
