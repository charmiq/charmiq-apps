import { checkModel, describePlacement, type CheckResult } from './check';
import type { ContentBridge } from './content-bridge';
import { cellKey, filledCells, frameKey, getColor, getPart, getShape, toRotation, type Placement } from './grid';
import { EMPTY_MODEL, MAX_PARTS, parseModel, serializeModel, type Model } from './model';

// owns the current build. Every edit is validated, applied, written to appContent
// and then shown. An edit that would collide is refused whole, so a build never
// gains a collision through an edit; a part may float while its support is pending
// ********************************************************************************
// == Constants ===================================================================
const MAX_BATCH = 400;
const MAX_COORDINATE = 200/*studs from the origin*/;
const MAX_LEVEL = 600/*plates*/;

// == Types =======================================================================
/** why the build changed: an edit here, a change from the document, or the first load */
export type ModelSource = 'edit' | 'document' | 'load';

// ................................................................................
/** a refused edit; its message is model-facing */
export class BuildError extends Error {}

// == Class =======================================================================
export class Build {
  private model: Model = EMPTY_MODEL;
  private onModelChanged: ((model: Model, source: ModelSource) => void) | null = null;

  // == Lifecycle =================================================================
  public constructor(private readonly bridge: ContentBridge) {}

  public onChange(callback: (model: Model, source: ModelSource) => void): void {
    this.onModelChanged = callback;
  }

  /** loads the document's build and follows changes made elsewhere. Content that
   *  arrives during discovery is the initial build, shown once as the load */
  public async init(): Promise<void> {
    await this.bridge.discover();
    this.show(parseModel(this.bridge.getText()), 'load');
    this.bridge.onChange(text => this.show(parseModel(text), 'document'));
  }

  // == Read ======================================================================
  public getModel(): Model { return this.model; }
  public getText(): string { return serializeModel(this.model); }
  public check(): CheckResult { return checkModel(this.model); }

  // == Edit ======================================================================
  /** adds parts; refuses the whole batch when any part is invalid or collides */
  public async add(input: ReadonlyArray<unknown>): Promise<Readonly<{ added: number; total: number; floating: ReadonlyArray<string>; }>> {
    if(input.length < 1) throw new BuildError('No parts given.');
    if(input.length > MAX_BATCH) throw new BuildError(`At most ${MAX_BATCH} parts per call.`);
    if(this.model.truncated || ((partCount(this.model) + input.length) > MAX_PARTS)) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);

    const problems: string[] = [];
    const added = input.flatMap((item, index) => {
      const result = toPlacement(item);
      if(typeof result === 'string') { problems.push(`parts[${index}]: ${result}`); return []; }
      return [result];
    });
    if(problems.length > 0) throw new BuildError(problems.join('\n'));

    // refuse any collision the batch introduces
    const next: Model = { ...this.model, placements: [...this.model.placements, ...added] };
    const before = new Set(checkModel(this.model).collisions.map(pair => `${pair.a}|${pair.b}`));
    const result = checkModel(next);
    const introduced = result.collisions.filter(pair => !before.has(`${pair.a}|${pair.b}`));
    if(introduced.length > 0) throw new BuildError('Nothing was added: these parts would collide.\n' + introduced.slice(0, 12).map(pair => `${pair.b} overlaps ${pair.a}`).join('\n'));

    await this.commit(next);
    const addedNames = new Set(added.map(describePlacement));
    return { added: added.length, total: next.placements.length, floating: result.floating.filter(name => addedNames.has(name)) };
  }

  // ------------------------------------------------------------------------------
  /** removes the part that fills each given cell, and the glass in a removed frame */
  public async remove(cells: ReadonlyArray<unknown>): Promise<Readonly<{ removed: ReadonlyArray<string>; empty: ReadonlyArray<string>; }>> {
    if(cells.length < 1) throw new BuildError('No cells given.');

    // the placement that fills each cell
    const filled = new Map<string, number>();
    this.model.placements.forEach((placement, index) => {
      const shape = getShape(getPart(placement.part)!/*by contract*/);
      for(const { x, z, bottom, top } of filledCells(shape, placement)) {
        for(let level=bottom; level<top; level++) filled.set(cellKey(x, z, level), index);
      }
    });

    const removing = new Set<number>();
    const empty: string[] = [];
    cells.forEach((cell, index) => {
      const { x, z, level } = (cell ?? {}) as Record<string, unknown>;
      if(!isInteger(x) || !isInteger(z) || !isInteger(level)) throw new BuildError(`at[${index}]: x, z and level must be integers.`);
      const hit = filled.get(cellKey(x, z, level));
      if(hit === undefined) empty.push(`x ${x} z ${z} level ${level}`);
      else removing.add(hit);
    });

    // a pane goes with its frame (it fills no cell of its own)
    const removedFrames = new Set([...removing].map(index => frameKey(getPart(this.model.placements[index].part)!.ldraw/*by contract*/, this.model.placements[index])));
    this.model.placements.forEach((placement, index) => {
      const frame = getPart(placement.part)!.frame/*by contract*/;
      if((frame !== undefined) && removedFrames.has(frameKey(frame, placement))) removing.add(index);
    });

    const removed = [...removing].map(index => describePlacement(this.model.placements[index]));
    if(removing.size > 0) await this.commit({ ...this.model, placements: this.model.placements.filter((_, index) => !removing.has(index)) });
    return { removed, empty };
  }

  // ------------------------------------------------------------------------------
  /** removes every part */
  public async clear(): Promise<number> {
    const count = this.model.placements.length + this.model.others.length;
    await this.commit({ ...this.model, placements: [], others: [] });
    return count;
  }

  /** replaces the build with LDraw text */
  public async replace(text: string): Promise<Model> {
    const model = parseModel(text);
    if(model.truncated || (partCount(model) > MAX_PARTS)) throw new BuildError(`A build holds at most ${MAX_PARTS} parts.`);
    await this.commit(model);
    return model;
  }

  // == Internal ==================================================================
  private async commit(model: Model): Promise<void> {
    this.show(model, 'edit');
    await this.bridge.save(serializeModel(model));
  }

  private show(model: Model, source: ModelSource): void {
    this.model = model;
    this.onModelChanged?.(model, source);
  }
}

// == Validation ==================================================================
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
