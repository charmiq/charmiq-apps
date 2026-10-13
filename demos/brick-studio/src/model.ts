import type { ContentChange } from '../../../shared/charmiq';
import { getColor, getColorByCode, getPart, getPartByLDraw, getShape, gridPosition, ldrawPosition, matrixRotation, rotationMatrix, type Placement } from './grid';

// the build as LDraw text. A model is a flat LDraw file: comment lines are kept as
// written, and each type-1 line is one part. A multi-part (MPD) file is flattened
// into its placed parts. A line whose part is in the catalog and lies on the grid
// is a Placement; any other part line is kept and counted, never dropped. A flat
// file's parts also carry where their lines lie, so an edit changes those lines
// alone. `0 STEP` lines in the main file split the parts into building steps, in
// order; a step with no parts is no step
// ********************************************************************************
// == Types =======================================================================
/** a part line that is not a Placement (a part outside the catalog, an unknown
 *  color, or a position or rotation off the grid) */
export type OtherPart = Readonly<{ ldraw: string; colorCode: number; position: readonly [number, number, number]; matrix: readonly number[]; }>;

/** a line in the text, its line break included (UTF-16 offsets) */
export type Span = Readonly<{ from: number; to: number; }>;
/** where a flat file's parts lie in its text */
export type ModelLayout = Readonly<{
  /** the line of each of `placements` and of `others`, in order */
  placements: ReadonlyArray<Span>;
  others: ReadonlyArray<Span>;
  /** every `0 STEP` line */
  steps: ReadonlyArray<Span>;
  /** the first `0 STEP` line after the last part, when the text ends in steps:
   *  parts added to the last step go before it */
  trailingStep?: Span;
  /** the text's length, its line break, and whether it ends with one */
  length: number;
  lineBreak: string;
  endsWithBreak: boolean;
}>;

/** each part's building step, from 1, in the order of `placements` and of `others`,
 *  and how many steps there are */
export type ModelSteps = Readonly<{ placements: ReadonlyArray<number>; others: ReadonlyArray<number>; count: number; }>;

// ................................................................................
export type Model = Readonly<{
  /** comment and meta lines, as written */
  header: ReadonlyArray<string>;
  placements: ReadonlyArray<Placement>;
  others: ReadonlyArray<OtherPart>;
  /** the text expands past what is read (SEE: READ_IN_PART): only its first parts were read */
  truncated?: boolean;
  /** where the parts lie, when the text is one flat file (no `0 FILE` sections) */
  layout?: ModelLayout;
  /** the building steps, when the build has more than one */
  steps?: ModelSteps;
}>;

// == Constants ===================================================================
/** the most parts a build holds */
export const MAX_PARTS = 3000;
/** the most submodel lines read while expanding references: a submodel is read
 *  again for every reference to it */
const MAX_EXPANDED_LINES = 100_000;

/** why a truncated model was read only in part, model-facing */
export const READ_IN_PART = `Its submodels expand past what Brick Studio reads (${MAX_PARTS} parts, ${MAX_PARTS} submodel references or ${MAX_EXPANDED_LINES} submodel lines), so it was read only in part.`;

const DEFAULT_HEADER = ['0 Brick Studio model', '0 Name: model.ldr'];
/** LDraw's meta-command that ends a building step */
const STEP_LINE = '0 STEP';

export const EMPTY_MODEL: Model = { header: DEFAULT_HEADER, placements: [], others: [] };

// == Parse =======================================================================
type Transform = Readonly<{ matrix: readonly number[]; position: readonly [number, number, number]; }>;
const IDENTITY: Transform = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] };

const compose = (parent: Transform, child: Transform): Transform => {
  const p = parent.matrix, c = child.matrix;
  const matrix = [0, 1, 2].flatMap(row => [0, 1, 2].map(col => (p[row*3] * c[col]) + (p[row*3 + 1] * c[3 + col]) + (p[row*3 + 2] * c[6 + col])));
  const position = [0, 1, 2].map(row => (p[row*3] * child.position[0]) + (p[row*3 + 1] * child.position[1]) + (p[row*3 + 2] * child.position[2]) + parent.position[row]) as [number, number, number];
  return { matrix, position };
};

// --------------------------------------------------------------------------------
/** parses LDraw text (LDR or MPD) into a Model. Submodels are flattened; LDraw's
 *  inherited colors (16, 24) take the parent's color */
export const parseModel = (text: string): Model => {
  const lines = splitLines(text);

  // split into files: a plain LDR is one unnamed file
  const files = new Map<string, Line[]>();
  let current: Line[] = [];
  let main: string | undefined;
  for(const line of lines) {
    const trimmed = line.text.trim();
    if(trimmed.startsWith('0 FILE ')) {
      const name = normalizeName(trimmed.slice(7));
      current = [];
      files.set(name, current);
      main ??= name;
      continue;
    } /* else -- a line of the current file */
    if(main === undefined) { main = ''; files.set(main, current); }
    current.push(line);
  }
  if(main === undefined) return { ...EMPTY_MODEL, layout: { placements: [], others: [], steps: [], length: 0, lineBreak: '\n', endsWithBreak: false } }/*empty text*/;

  const header: string[] = [];
  const placements: Placement[] = [];
  const others: OtherPart[] = [];
  const placementSpans: Span[] = [];
  const otherSpans: Span[] = [];
  // each part's step as counted (a `0 STEP` line counts one), numbered once read
  const placementSteps: number[] = [];
  const otherSteps: number[] = [];
  const stepSpans: Span[] = [];
  let step = 0;

  // a submodel's parts take the step of the line that places it: walk() counts
  // `0 STEP` lines in the main file alone
  // submodels can reference each other many times over, so the parts they expand
  // to, the references followed to reach them and the lines read inside them are
  // bounded as they are read (the main file's own lines are read once)
  let references = 0;
  let expandedLines = 0;
  let truncated = false;
  const exceeded = () => truncated ||= (((placements.length + others.length) > MAX_PARTS) || (references > MAX_PARTS) || (expandedLines > MAX_EXPANDED_LINES));

  const walk = (name: string, transform: Transform, inheritedColor: number, depth: number, isMain: boolean): void => {
    for(const { text: line, from, to } of files.get(name) ?? []) {
      if(!isMain) expandedLines++;
      if(exceeded()) return;
      const fields = line.trim().split(/\s+/);
      if(isMain && isStepLine(fields)) { step++; stepSpans.push({ from, to }); continue; }
      if(fields[0] !== '1') {
        if(isMain && (line.trim().length > 0) && !line.trim().startsWith('0 FILE')) header.push(line.trimEnd());
        continue;
      } /* else -- a part or submodel reference */
      if(fields.length < 15) continue/*malformed*/;

      const values = fields.slice(1, 14).map(Number);
      if(values.some(value => !Number.isFinite(value))) continue/*malformed*/;
      const colorCode = ((values[0] === 16) || (values[0] === 24)) ? inheritedColor : values[0];
      const reference = normalizeName(fields.slice(14).join(' '));
      const local: Transform = { position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
      const world = compose(transform, local);

      if(files.has(reference) && (depth < 16/*guards a cyclic MPD*/)) { references++; walk(reference, world, colorCode, depth + 1, false); continue; }
      const placement = toPlacement(reference, colorCode, world);
      if(placement) { placements.push(placement); placementSpans.push({ from, to }); placementSteps.push(step); }
      else { others.push({ ldraw: reference.replace(/\.dat$/, ''), colorCode, position: world.position, matrix: world.matrix }); otherSpans.push({ from, to }); otherSteps.push(step); }
    }
  };
  walk(main, IDENTITY, 16, 0, true);

  exceeded();
  const flat = (files.size === 1) && (main === '')/*no `0 FILE` section: each part is its own line*/;
  const lineBreak = lines.find(line => line.lineBreak)?.lineBreak ?? '\n';
  const lastPart = Math.max(0, ...placementSpans.map(span => span.to), ...otherSpans.map(span => span.to));
  const trailingStep = ((placementSpans.length + otherSpans.length) > 0) ? stepSpans.find(span => span.from >= lastPart) : undefined;
  const steps = numberSteps(placementSteps, otherSteps);
  return {
    header: (header.length > 0) ? header : DEFAULT_HEADER, placements, others,
    ...(truncated ? { truncated } : {}),
    ...(flat ? { layout: { placements: placementSpans, others: otherSpans, steps: stepSpans, ...(trailingStep ? { trailingStep } : {}), length: text.length, lineBreak, endsWithBreak: /[\r\n]$/.test(text) } } : {}),
    ...((steps.count > 1) ? { steps } : {}),
  };
};

// ................................................................................
/** whether a line is LDraw's `0 STEP` meta-command */
const isStepLine = (fields: ReadonlyArray<string>): boolean => (fields.length === 2) && (fields[0] === '0') && (fields[1].toUpperCase() === 'STEP');

/** the steps as counted, numbered from 1 in order: a count no part has is no step */
const numberSteps = (placements: ReadonlyArray<number>, others: ReadonlyArray<number>): ModelSteps => {
  const counted = [...new Set([...placements, ...others])].sort((a, b) => a - b);
  const number = new Map(counted.map((count, index) => [count, index + 1]));
  return { placements: placements.map(count => number.get(count)!), others: others.map(count => number.get(count)!), count: counted.length };
};

// ................................................................................
/** how many building steps a build has (none when it has no parts) */
export const stepCount = (model: Model): number => model.steps?.count ?? (((model.placements.length + model.others.length) > 0) ? 1 : 0);

/** the build as it stands after a step: its parts in that step and before */
export const upToStep = (model: Model, step: number): Model => {
  const steps = model.steps;
  if(!steps) return model/*one step*/;
  return {
    ...model,
    placements: model.placements.filter((_, index) => steps.placements[index] <= step),
    others: model.others.filter((_, index) => steps.others[index] <= step),
    steps: undefined, layout: undefined/*a view, never edited*/,
  };
};

// ................................................................................
/** one line of the text: its content, and its span with its line break */
type Line = Readonly<{ text: string; from: number; to: number; lineBreak: string; }>;

/** the text's lines, as written (CRLF, CR or LF) */
const splitLines = (text: string): Line[] => {
  const lines: Line[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for(let match = pattern.exec(text); match && (match.index < text.length); match = pattern.exec(text)) {
    lines.push({ text: match[1], from: match.index, to: match.index + match[0].length, lineBreak: match[2] });
    if(!match[2]) break/*the last line*/;
  }
  return lines;
};

// --------------------------------------------------------------------------------
/** the Placement an LDraw part line is, when it is a catalog part on the grid */
const toPlacement = (reference: string, colorCode: number, transform: Transform): Placement | undefined => {
  const part = getPartByLDraw(reference.replace(/\.dat$/, ''));
  const color = getColorByCode(colorCode);
  const rotation = matrixRotation(transform.matrix);
  if(!part || !color || (rotation === undefined)) return undefined;

  const position = gridPosition(getShape(part), rotation, transform.position);
  if(!position) return undefined;
  return { part: part.key, color: color.key, rotation, ...position };
};

const normalizeName = (name: string): string => name.trim().replace(/\\/g, '/').toLowerCase();

// == Serialize ===================================================================
/** writes a Model as a flat LDraw file, its steps apart by `0 STEP` lines */
export const serializeModel = (model: Model): string => {
  const steps = model.steps;
  const lines = [...model.header];
  for(let step=1; step<=(steps?.count ?? 1); step++) {
    if(step > 1) lines.push(STEP_LINE);
    lines.push(...model.placements.filter((_, index) => (steps?.placements[index] ?? 1) === step).map(placementLine));
    lines.push(...model.others.filter((_, index) => (steps?.others[index] ?? 1) === step).map(other => partLine(other.colorCode, other.position, other.matrix, other.ldraw)));
  }
  return lines.join('\n') + '\n';
};

/** the LDraw line of a Placement (its part and color are catalog entries by contract) */
export const placementLine = (placement: Placement): string => {
  const part = getPart(placement.part)!/*by contract*/;
  const color = getColor(placement.color)!/*by contract*/;
  return partLine(color.code, ldrawPosition(getShape(part), placement), rotationMatrix(placement.rotation), part.ldraw);
};

// == Line Edits ==================================================================
/** the edit that adds part lines to a flat model's text: to its last step, or as a
 *  new step after it (`newStep`, for a build that has parts). An empty text gains
 *  the header first */
export const appendLines = (layout: ModelLayout, lines: ReadonlyArray<string>, newStep: boolean): ContentChange => {
  const hasParts = (layout.placements.length + layout.others.length) > 0;
  if(!newStep && layout.trailingStep) {
    const at = layout.trailingStep.from/*before the steps the text ends in*/;
    return { from: at, to: at, insert: lines.map(line => line + layout.lineBreak).join('') };
  } /* else -- the lines go at the end */
  const opening = (layout.length < 1) ? DEFAULT_HEADER : (newStep && hasParts && !layout.trailingStep) ? [STEP_LINE] : [];
  const lead = ((layout.length < 1) || layout.endsWithBreak) ? '' : layout.lineBreak/*the last line is unfinished*/;
  return { from: layout.length, to: layout.length, insert: lead + [...opening, ...lines].map(line => line + layout.lineBreak).join('') };
};

/** the edits that delete lines, the last first: each edit is measured after the
 *  ones before it */
export const deleteLines = (spans: ReadonlyArray<Span>): ContentChange[] =>
  [...spans].sort((a, b) => b.from - a.from).map(({ from, to }) => ({ from, to }));

// --------------------------------------------------------------------------------
const partLine = (colorCode: number, position: readonly number[], matrix: readonly number[], ldraw: string): string =>
  ['1', colorCode, ...position, ...matrix].map(formatNumber).join(' ') + ` ${ldraw}.dat`;

const formatNumber = (value: number | string): string => {
  if(typeof value === 'string') return value;
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
