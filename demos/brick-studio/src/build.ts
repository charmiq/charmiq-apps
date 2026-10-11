import { checkModel, describePlacement, type CheckResult } from './check';
import type { ContentBridge } from './content-bridge';
import { cellKey, filledCells, frameKey, getColor, getPart, getShape, toRotation, type Placement } from './grid';
import { appendLines, deleteLines, EMPTY_MODEL, MAX_PARTS, parseModel, placementLine, serializeModel, type Model, type ModelLayout } from './model';

// owns the current build: the `model` block's text, as last seen. Every edit is
// validated against the block's text it is measured on, and the build changes
// when the block does, never before. An edit that would collide is refused whole,
// so a build never gains a collision through an edit made on what it shows; a part
// may float while its support is pending. Edits change their own lines alone
// NOTE: a collision check covers the text it was measured on. Two editors can
//       each accept an edit before seeing the other's, and the document then
//       holds both
// ********************************************************************************
// == Constants ===================================================================
const MAX_BATCH = 400;
const MAX_COORDINATE = 200/*studs from the origin*/;
const MAX_LEVEL = 600/*plates*/;

// == Types =======================================================================
/** why the build changed: the first load, or a change to the block */
export type ModelSource = 'document' | 'load';

// ................................................................................
/** a refused edit; its message is model-facing */
export class BuildError extends Error {}

// == Class =======================================================================
export class Build {
  private model: Model = EMPTY_MODEL;
  private onModelChanged: ((model: Model, source: ModelSource) => void) | null = null;
  private ready: Promise<void> | null = null;

  // == Lifecycle =================================================================
  public constructor(private readonly bridge: ContentBridge) {}

  public onChange(callback: (model: Model, source: ModelSource) => void): void {
    this.onModelChanged = callback;
  }

  /** loads the document's build and follows every change to it. Rejects, with the
   *  reason, when the build cannot be read */
  public init(): Promise<void> {
    this.ready ??= (async () => {
      this.bridge.onChange(text => this.show(parseModel(text), 'document'));
      this.show(parseModel(await this.bridge.open()), 'load');
    })();
    return this.ready;
  }

  /** resolves once the build is loaded; every command waits for it */
  public whenReady(): Promise<void> { return this.init(); }

  // == Read ======================================================================
  public getModel(): Model { return this.model; }
  public getText(): string { return serializeModel(this.model); }
  public check(): CheckResult { return checkModel(this.model); }

  // == Edit ======================================================================
  /** adds parts; refuses the whole batch when any part is invalid or collides */
  public async add(input: ReadonlyArray<unknown>): Promise<Readonly<{ added: number; total: number; floating: ReadonlyArray<string>; }>> {
    await this.whenReady();
    if(input.length < 1) throw new BuildError('No parts given.');
    if(input.length > MAX_BATCH) throw new BuildError(`At most ${MAX_BATCH} parts per call.`);

    const problems: string[] = [];
    const added = input.flatMap((item, index) => {
      const result = toPlacement(item);
      if(typeof result === 'string') { problems.push(`parts[${index}]: ${result}`); return []; }
      return [result];
    });
    if(problems.length > 0) throw new BuildError(problems.join('\n'));

    let outcome = { added: 0, total: 0, floating: [] as ReadonlyArray<string> };
    await this.bridge.edit(text => {
      const { model, layout } = editable(text);
      if((partCount(model) + added.length) > MAX_PARTS) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);

      // refuse any collision the batch introduces
      const next: Model = { ...model, placements: [...model.placements, ...added] };
      const before = new Set(checkModel(model).collisions.map(pair => `${pair.a}|${pair.b}`));
      const result = checkModel(next);
      const introduced = result.collisions.filter(pair => !before.has(`${pair.a}|${pair.b}`));
      if(introduced.length > 0) throw new BuildError('Nothing was added: these parts would collide.\n' + introduced.slice(0, 12).map(pair => `${pair.b} overlaps ${pair.a}`).join('\n'));

      const addedNames = new Set(added.map(describePlacement));
      outcome = { added: added.length, total: partCount(next), floating: result.floating.filter(name => addedNames.has(name)) };
      return [appendLines(layout, added.map(placementLine))];
    });
    return outcome;
  }

  // ------------------------------------------------------------------------------
  /** removes the part that fills each given cell, and the glass in a removed frame.
   *  The cells are read on the build as the edit applies to it: a part that took a
   *  cell's place meanwhile is the one removed */
  public async remove(cells: ReadonlyArray<unknown>): Promise<Readonly<{ removed: ReadonlyArray<string>; empty: ReadonlyArray<string>; }>> {
    await this.whenReady();
    if(cells.length < 1) throw new BuildError('No cells given.');
    const at = cells.map((cell, index) => {
      const { x, z, level } = (cell ?? {}) as Record<string, unknown>;
      if(!isInteger(x) || !isInteger(z) || !isInteger(level)) throw new BuildError(`at[${index}]: x, z and level must be integers.`);
      return { x, z, level };
    });

    let outcome = { removed: [] as ReadonlyArray<string>, empty: [] as ReadonlyArray<string> };
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

      outcome = { removed: [...removing].map(index => describePlacement(model.placements[index])), empty };
      return deleteLines([...removing].map(index => layout.placements[index]));
    });
    return outcome;
  }

  // ------------------------------------------------------------------------------
  /** removes every part the build holds as the edit applies to it, its header kept */
  public async clear(): Promise<number> {
    await this.whenReady();
    let removed = 0;
    await this.bridge.edit(text => {
      const { model, layout } = editable(text);
      removed = partCount(model);
      return deleteLines([...layout.placements, ...layout.others]);
    });
    return removed;
  }

  /** replaces the build with LDraw text, written flat: the deliberate way to turn
   *  a multi-file model into one that edits apply to */
  public async replace(text: string): Promise<Model> {
    await this.whenReady();
    const model = parseModel(text);
    if(model.truncated || (partCount(model) > MAX_PARTS)) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);
    await this.bridge.replace(serializeModel(model));
    return model;
  }

  // == Internal ==================================================================
  /** shows a model whose text is new */
  private show(model: Model, source: ModelSource): void {
    this.model = model;
    this.onModelChanged?.(model, source);
  }
}

// == Validation ==================================================================
/** the model a block's text holds, when an edit can apply to it line by line */
const editable = (text: string): Readonly<{ model: Model; layout: ModelLayout; }> => {
  const model = parseModel(text);
  if(model.truncated) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);
  if(!model.layout) throw new BuildError('This build is a multi-file LDraw model, so edits cannot change it line by line. Replace it with a flat model to edit it: call setModel with the text getModel returns (comments inside its submodels are not kept).');
  return { model, layout: model.layout };
};

/** the Placement an input describes, or why it is not one */
const toPlacement = (item: unknown): Placement | string => {
  const { part, color, x, z, level, rotation } = (item ?? {}) as Record<string, unknown>;
  if((typeof part !== 'string') || !getPart(part)) return `unknown part '${String(part)}' (listParts names the catalog)`;
  if((typeof color !== 'string') || !getColor(color)) return `unknown color '${String(color)}' (listParts names the colors)`;
  if(!isInteger(x) || !isInteger(z) || !isInteger(level)) return 'x, z and level must be integers';
  if((Math.abs(x) > MAX_COORDINATE) || (Math.abs(z) > MAX_COORDINATE)) return `x and z must lie within ${MAX_COORDINATE} of the origin`;
  if((level < 0) || (level > MAX_LEVEL)) return `level must lie between 0 and ${MAX_LEVEL}`;
  const turn = (rotation === undefined) ? 0 : toRotation(rotation);
  if(turn === undefined) return 'rotation must be 0, 90, 180 or 270';
  return { part, color, x, z, level, rotation: turn };
};

const isInteger = (value: unknown): value is number => (typeof value === 'number') && Number.isInteger(value);

/** every part a model holds, outside the catalog included */
const partCount = (model: Model): number => model.placements.length + model.others.length;
