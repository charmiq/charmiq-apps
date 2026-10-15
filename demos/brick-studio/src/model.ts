import type { ContentChange } from '../../../shared/charmiq';
import { compose, copyPosition, copyTransform, footprintOf, getColor, getColorByCode, getPart, getPartByLDraw, getShape, gridPosition, matrixRotation, placedLines, type Copy, type Footprint, type PartLine, type Placement, type Transform } from './grid';
import { maxOf, minOf } from './numbers';

// the build as LDraw text. A model is a flat LDraw file: comment lines are kept as
// written, and each type-1 line is one part. A multi-part (MPD) file is flattened
// into its placed parts. A build with components is an MPD file: the main model
// first, then each component's section; a copy is one line of the main model naming
// its component's file (SEE: grid.ts Components). Such a file is edited line by line
// as a flat one is, as long as no component holds another. A line whose part is in the catalog and lies on the grid
// is a Placement; any other part line is kept and counted, never dropped. A flat
// file's parts also carry where their lines lie, so an edit changes those lines
// alone. A part assembled from pieces (a wheel set) is its own line and its
// pieces' lines, each where the part puts it: those lines are read as the part, and
// the part is written whole. `0 STEP` lines in the main file split the parts into building steps, in
// order; a step with no parts is no step. A `0 !BRICKSTUDIO GROUND <color>` line in
// the main file colors the baseplate (LDraw's form for a program's own meta-command:
// other LDraw tools pass it by)
// ********************************************************************************
// == Types =======================================================================
/** a part line that is not a Placement (a part outside the catalog, an unknown
 *  color, or a position or rotation off the grid) */
export type OtherPart = PartLine;

/** a line in the text, its line break included (UTF-16 offsets) */
export type Span = Readonly<{ from: number; to: number; }>;
/** where an editable file's parts lie in its text: a flat file, or an MPD file whose
 *  components hold no other component */
export type ModelLayout = Readonly<{
  /** the line of each of `placements` and of `others`, in order (a part in a copy
   *  lies in its component's section) */
  placements: ReadonlyArray<Span>;
  others: ReadonlyArray<Span>;
  /** the lines of each placement's pieces, in the order of `placements` */
  pieces: ReadonlyArray<ReadonlyArray<Span>>;
  /** the line of each of the model's `placed`, in order */
  placed: ReadonlyArray<Span>;
  /** every part and copy line of the main model, whatever it names */
  mainParts: ReadonlyArray<Span>;
  /** every `0 STEP` line (the main model's) */
  steps: ReadonlyArray<Span>;
  /** the ground line, when the text has one */
  ground?: Span;
  /** the first `0 STEP` line after the main model's last part, when it ends in
   *  steps: parts added to the last step go before it */
  trailingStep?: Span;
  /** the main model's `0 FILE` line, and each component's section from its `0 FILE`
   *  line to the next, for an MPD file */
  mainFile?: Span;
  components: ReadonlyArray<Readonly<{ name: string; span: Span; }>>;
  /** where the main model's lines end (the text's end for a flat file), and whether
   *  its last line ends in a line break there */
  mainEnd: number;
  mainEndsWithBreak: boolean;
  /** the text's length, its line break, and whether it ends with one */
  length: number;
  lineBreak: string;
  endsWithBreak: boolean;
}>;

/** each part's and copy's building step, from 1, in the order of `placements`, of
 *  `others` and of `copies`, and how many steps there are */
export type ModelSteps = Readonly<{ placements: ReadonlyArray<number>; others: ReadonlyArray<number>; copies: ReadonlyArray<number>; count: number; }>;

/** a line of the main model placing a component: its component, the color its
 *  parts of LDraw's color 16 take, and its copy (an index into `copies`) when it is
 *  one on the grid. The line owns every part it places, a copy or not */
export type Placed = Readonly<{ component: string; colorCode: number; copy?: number; }>;

/** a component: its parts in its own grid and the cells they cover */
export type Component = Readonly<{ name: string; placements: ReadonlyArray<Placement>; others: number/*part lines off its grid*/; footprint?: Footprint; }>;

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
  /** the baseplate's color (a catalog color), when the build names one */
  ground?: string;
  /** the components the file defines, and the copies its main model places; each
   *  placement's copy (an index into `copies`), or undefined for a part of its own */
  components?: ReadonlyArray<Component>;
  copies?: ReadonlyArray<Copy>;
  placementCopies?: ReadonlyArray<number | undefined>;
  /** every line of the main model placing a component, and each placement's (an
   *  index into `placed`), or undefined for a part of its own */
  placed?: ReadonlyArray<Placed>;
  placementPlaced?: ReadonlyArray<number | undefined>;
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
/** the main model's file name once the build has components */
const MAIN_FILE = 'model.ldr';
/** LDraw's meta-command that ends a building step */
const STEP_LINE = '0 STEP';
/** Brick Studio's meta-command naming the baseplate's color */
const GROUND_META = ['0', '!BRICKSTUDIO', 'GROUND'] as const;

export const EMPTY_MODEL: Model = { header: DEFAULT_HEADER, placements: [], others: [] };

// == Parse =======================================================================
const IDENTITY: Transform = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] };

// --------------------------------------------------------------------------------
/** parses LDraw text (LDR or MPD) into a Model. Submodels are flattened; LDraw's
 *  inherited colors (16, 24) take the parent's color */
export const parseModel = (text: string): Model => {
  const lines = splitLines(text);

  // split into files: a plain LDR is one unnamed file. Blank lines before the first
  // file belong to none
  const files = new Map<string, Line[]>();
  const fileLines = new Map<string, Span>()/*each named file's `0 FILE` line*/;
  let current: Line[] = [];
  let main: string | undefined;
  for(const line of lines) {
    const trimmed = line.text.trim();
    if(trimmed.startsWith('0 FILE ')) {
      const name = normalizeName(trimmed.slice(7));
      current = [];
      files.set(name, current);
      fileLines.set(name, { from: line.from, to: line.to });
      main ??= name;
      continue;
    } /* else -- a line of the current file */
    if(main === undefined) {
      if(trimmed.length < 1) continue/*before any file*/;
      main = ''; files.set(main, current);
    } /* else -- in a file */
    current.push(line);
  }
  if(main === undefined) return { ...EMPTY_MODEL, layout: { placements: [], others: [], pieces: [], placed: [], mainParts: [], steps: [], components: [], mainEnd: 0, mainEndsWithBreak: false, length: 0, lineBreak: '\n', endsWithBreak: false } }/*empty text*/;

  // each file but the main model is a component: its parts in its own grid
  const components = [...files].filter(([name]) => name !== main).map(([name, componentLines]) => readComponent(name, componentLines, files));
  const componentsByFile = new Map(components.map(component => [fileName(component.name), component]));
  let nested = components.some(component => component.nested);

  const header: string[] = [];
  const placements: Placement[] = [];
  const placementCopies: Array<number | undefined> = [];
  const placementPlaced: Array<number | undefined> = [];
  const others: OtherPart[] = [];
  const placementSpans: Span[] = [];
  const otherSpans: Span[] = [];
  const copies: Copy[] = [];
  const placed: Placed[] = [];
  const placedSpans: Span[] = [];
  const mainParts: Span[] = [];
  // each part's and copy's step as counted (a `0 STEP` line counts one), numbered once read
  const placementSteps: number[] = [];
  const otherSteps: number[] = [];
  const otherPlaced: Array<number | undefined> = [];
  const copySteps: number[] = [];
  const stepSpans: Span[] = [];
  let step = 0;
  let ground: Readonly<{ color: string; span: Span; }> | undefined/*the first ground line naming a ground color*/;

  // a submodel's parts take the step of the line that places it: walk() counts
  // `0 STEP` lines in the main file alone
  // submodels can reference each other many times over, so the parts they expand
  // to, the references followed to reach them and the lines read inside them are
  // bounded as they are read (the main file's own lines are read once)
  let references = 0;
  let expandedLines = 0;
  let truncated = false;
  const exceeded = () => truncated ||= (((placements.length + others.length) > MAX_PARTS) || (references > MAX_PARTS) || (expandedLines > MAX_EXPANDED_LINES));

  const walk = (name: string, transform: Transform, inheritedColor: number, depth: number, owner: number | undefined/*an index into placed*/): void => {
    const isMain = (depth === 0);
    for(const { text: line, from, to } of files.get(name) ?? []) {
      if(!isMain) expandedLines++;
      if(exceeded()) return;
      const fields = line.trim().split(/\s+/);
      if(isMain && isStepLine(fields)) { step++; stepSpans.push({ from, to }); continue; }
      if(isMain && !ground) {
        const color = groundColorOf(fields);
        if(color) ground = { color, span: { from, to } }/*kept in the header as written*/;
      } /* else -- the first names the ground */
      if(fields[0] !== '1') {
        if(isMain && (line.trim().length > 0) && !line.trim().startsWith('0 FILE')) header.push(line.trimEnd());
        continue;
      } /* else -- a part or submodel reference */
      if(fields.length < 15) continue/*malformed*/;

      const values = fields.slice(1, 14).map(Number);
      if(values.some(value => !Number.isFinite(value))) continue/*malformed*/;
      if(isMain) mainParts.push({ from, to });
      const colorCode = ((values[0] === 16) || (values[0] === 24)) ? inheritedColor : values[0];
      const reference = normalizeName(fields.slice(14).join(' '));
      const local: Transform = { position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
      const world = compose(transform, local);

      if(files.has(reference) && (depth < 16/*guards a cyclic MPD*/)) {
        references++;
        if(reference === main) nested = true/*the main model placed in itself*/;
        // a copy: the main model's line naming a component, on the grid
        const component = isMain ? componentsByFile.get(reference) : undefined;
        const position = component?.footprint && copyPosition(component.footprint, component.name, local);
        if(position) { copies.push(position); copySteps.push(step); }
        if(isMain) { placed.push({ component: component?.name ?? reference, colorCode, ...(position ? { copy: copies.length - 1 } : {}) }); placedSpans.push({ from, to }); }
        walk(reference, world, colorCode, depth + 1, isMain ? (placed.length - 1) : owner);
        continue;
      } /* else -- a part */
      const placement = toPlacement(reference, colorCode, world);
      if(placement) { placements.push(placement); placementCopies.push((owner === undefined) ? undefined : placed[owner].copy); placementPlaced.push(owner); placementSpans.push({ from, to }); placementSteps.push(step); }
      else { others.push({ ldraw: reference.replace(/\.dat$/, ''), colorCode, position: world.position, matrix: world.matrix }); otherSpans.push({ from, to }); otherSteps.push(step); otherPlaced.push(owner); }
    }
  };
  walk(main, IDENTITY, 16, 0, undefined);
  const pieceSpans = absorbPieces(placements, others, otherSpans, otherSteps, { placements: placementPlaced, others: otherPlaced });

  exceeded();
  const flat = (files.size === 1) && (main === '')/*no `0 FILE` section: each part is its own line*/;
  const editable = flat || ((main !== '') && !nested)/*an MPD file of components holding none*/;
  const lineBreak = lines.find(line => line.lineBreak)?.lineBreak ?? '\n';
  const endsWithBreak = /[\r\n]$/.test(text);
  const sections = components.map(({ name }) => ({ name, span: sectionSpan(fileName(name), fileLines, text.length) }));
  const mainEnd = minOf(sections.map(({ span }) => span.from), text.length);
  const lastPart = maxOf(mainParts.map(span => span.to), 0);
  const trailingStep = (mainParts.length > 0) ? stepSpans.find(span => span.from >= lastPart) : undefined;
  const mainFile = (main !== '') ? fileLines.get(main) : undefined;
  const steps = numberSteps(placementSteps, otherSteps, copySteps);
  return {
    header: (header.length > 0) ? header : DEFAULT_HEADER, placements, others,
    ...(truncated ? { truncated } : {}),
    ...(ground ? { ground: ground.color } : {}),
    ...((components.length > 0) ? { components: components.map(({ nested: _, ...component }) => component) } : {}),
    ...((copies.length > 0) ? { copies, placementCopies } : {}),
    ...((placed.length > 0) ? { placed, placementPlaced } : {}),
    ...(editable ? { layout: {
      placements: placementSpans, others: otherSpans, pieces: pieceSpans, placed: placedSpans, mainParts, steps: stepSpans,
      ...(ground ? { ground: ground.span } : {}), ...(trailingStep ? { trailingStep } : {}),
      ...(mainFile ? { mainFile } : {}), components: sections,
      mainEnd, mainEndsWithBreak: (mainEnd < text.length) || endsWithBreak,
      length: text.length, lineBreak, endsWithBreak,
    } } : {}),
    ...((steps.count > 1) ? { steps } : {}),
  };
};

// ................................................................................
/** a component's parts in its own grid, from its file's lines; `nested` when it
 *  places another file */
const readComponent = (file: string, componentLines: ReadonlyArray<Line>, files: ReadonlyMap<string, ReadonlyArray<Line>>): Component & Readonly<{ nested: boolean; }> => {
  const placements: Placement[] = [];
  const others: OtherPart[] = [];
  const spans: Span[] = [], steps: number[] = [];
  let nested = false;
  for(const { text: line, from, to } of componentLines) {
    const fields = line.trim().split(/\s+/);
    if((fields[0] !== '1') || (fields.length < 15)) continue/*a comment, or malformed*/;
    const values = fields.slice(1, 14).map(Number);
    if(values.some(value => !Number.isFinite(value))) continue/*malformed*/;
    const reference = normalizeName(fields.slice(14).join(' '));
    if(files.has(reference)) { nested = true; continue; }
    const transform: Transform = { position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
    const placement = toPlacement(reference, values[0], transform);
    if(placement) placements.push(placement);
    else { others.push({ ldraw: reference.replace(/\.dat$/, ''), colorCode: values[0], position: transform.position, matrix: transform.matrix }); spans.push({ from, to }); steps.push(0); }
  }
  absorbPieces(placements, others, spans, steps);
  const footprint = footprintOf(placements);
  return { name: file.replace(/\.ldr$/, ''), placements, others: others.length, ...(footprint ? { footprint } : {}), nested };
};

/** a named file's section: from its `0 FILE` line up to the next file's, or the text's end */
const sectionSpan = (file: string, fileLines: ReadonlyMap<string, Span>, length: number): Span => {
  const from = fileLines.get(file)!/*by contract*/.from;
  return { from, to: minOf([...fileLines.values()].map(span => span.from).filter(start => start > from), length) };
};

/** a component's file name */
export const fileName = (component: string): string => `${component}.ldr`;

// ................................................................................
/** takes each placement's pieces out of the other parts, where a line lies as its
 *  piece would and the same line of the main model placed it (`owners`, each an
 *  index into `placed`; none within one file): the lines are the placement's. A
 *  piece a component's line places is never a part of the build's own, nor of
 *  another line's. Returns each placement's piece lines, in order. The arrays of
 *  other parts are changed in place */
const absorbPieces = (placements: ReadonlyArray<Placement>, others: OtherPart[], otherSpans: Span[], otherSteps: number[], owners?: Readonly<{ placements: ReadonlyArray<number | undefined>; others: Array<number | undefined>; }>): Span[][] => {
  const taken = new Set<number>();
  const pieceSpans = placements.map((placement, placementIndex) => {
    const part = getPart(placement.part)!/*by contract*/;
    if(!part.pieces) return [];
    const [, ...pieces] = placedLines(getShape(part), placement, getColor(placement.color)!.code/*by contract*/);
    return pieces.flatMap(piece => {
      const index = others.findIndex((other, at) => !taken.has(at) && (owners?.others[at] === owners?.placements[placementIndex]) && sameLine(other, piece));
      if(index < 0) return []/*missing: written whole again*/;
      taken.add(index);
      return [otherSpans[index]];
    });
  });

  const removeTaken = <T,>(array: T[]): void => { array.splice(0, array.length, ...array.filter((_, index) => !taken.has(index))); };
  removeTaken(others); removeTaken(otherSpans); removeTaken(otherSteps);
  if(owners) removeTaken(owners.others);
  return pieceSpans;
};

/** whether two part lines are the same file, color and transform */
const sameLine = (a: PartLine, b: PartLine): boolean =>
  (a.ldraw.toLowerCase() === b.ldraw.toLowerCase()) && (a.colorCode === b.colorCode) &&
  a.position.every((value, index) => Math.abs(value - b.position[index]) < 1e-2) &&
  a.matrix.every((value, index) => Math.abs(value - b.matrix[index]) < 1e-3);

// ................................................................................
/** whether a line is LDraw's `0 STEP` meta-command */
const isStepLine = (fields: ReadonlyArray<string>): boolean => (fields.length === 2) && (fields[0] === '0') && (fields[1].toUpperCase() === 'STEP');

/** the ground color a line names, when it is the ground meta-command naming a
 *  catalog color that is not see-through */
const groundColorOf = (fields: ReadonlyArray<string>): string | undefined => {
  if((fields.length !== 4) || GROUND_META.some((word, index) => fields[index].toUpperCase() !== word)) return undefined;
  const color = getColor(fields[3].toLowerCase());
  return (color && !color.transparent) ? color.key : undefined;
};

/** the steps as counted, numbered from 1 in order: a count no part or copy has is no step */
const numberSteps = (placements: ReadonlyArray<number>, others: ReadonlyArray<number>, copies: ReadonlyArray<number>): ModelSteps => {
  const counted = [...new Set([...placements, ...others, ...copies])].sort((a, b) => a - b);
  const number = new Map(counted.map((count, index) => [count, index + 1]));
  return { placements: placements.map(count => number.get(count)!), others: others.map(count => number.get(count)!), copies: copies.map(count => number.get(count)!), count: counted.length };
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
    steps: undefined, layout: undefined, copies: undefined, placementCopies: undefined, placed: undefined, placementPlaced: undefined/*a view, never edited*/,
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
    lines.push(...model.placements.filter((_, index) => (steps?.placements[index] ?? 1) === step).flatMap(placementLines));
    lines.push(...model.others.filter((_, index) => (steps?.others[index] ?? 1) === step).map(other => partLine(other.colorCode, other.position, other.matrix, other.ldraw)));
  }
  return lines.join('\n') + '\n';
};

/** the LDraw lines of a Placement: its own, then its pieces' (its part and color
 *  are catalog entries by contract) */
export const placementLines = (placement: Placement): string[] => {
  const part = getPart(placement.part)!/*by contract*/;
  const color = getColor(placement.color)!/*by contract*/;
  return placedLines(getShape(part), placement, color.code).map(line => partLine(line.colorCode, line.position, line.matrix, line.ldraw));
};

/** a copy's LDraw line: its component's file, in LDraw's inherited color so each
 *  part keeps its own */
export const copyLine = (footprint: Footprint, copy: Copy): string => {
  const { position, matrix } = copyTransform(footprint, copy);
  return ['1', 16, ...position, ...matrix].map(formatNumber).join(' ') + ` ${fileName(copy.component)}`;
};

// == Line Edits ==================================================================
/** the edit that adds part and copy lines to the main model: to its last step, or
 *  as a new step after it (`newStep`, for a build that has parts). An empty text
 *  gains the header first */
export const appendLines = (layout: ModelLayout, lines: ReadonlyArray<string>, newStep: boolean): ContentChange => {
  const hasParts = layout.mainParts.length > 0;
  if(!newStep && layout.trailingStep) {
    const at = layout.trailingStep.from/*before the steps the main model ends in*/;
    return { from: at, to: at, insert: lines.map(line => line + layout.lineBreak).join('') };
  } /* else -- the lines go at the main model's end */
  const opening = (layout.length < 1) ? DEFAULT_HEADER : (newStep && hasParts && !layout.trailingStep) ? [STEP_LINE] : [];
  const lead = ((layout.length < 1) || layout.mainEndsWithBreak) ? '' : layout.lineBreak/*the last line is unfinished*/;
  return { from: layout.mainEnd, to: layout.mainEnd, insert: lead + [...opening, ...lines].map(line => line + layout.lineBreak).join('') };
};

/** the edits that define a component, or replace its definition: its section holds
 *  its name and its parts' lines. A flat text becomes an MPD file first, its main
 *  model named model.ldr; a new section goes at the text's end */
export const defineEdits = (layout: ModelLayout, name: string, lines: ReadonlyArray<string>): ContentChange[] => {
  const section = [`0 FILE ${fileName(name)}`, `0 ${name}`, ...lines].map(line => line + layout.lineBreak).join('');
  const existing = layout.components.find(component => component.name === name);
  if(existing) return [{ ...existing.span, insert: section }];
  const lead = ((layout.length < 1) || layout.endsWithBreak) ? '' : layout.lineBreak/*the last line is unfinished*/;
  const end: ContentChange = { from: layout.length, to: layout.length, insert: lead + section };
  if(layout.mainFile) return [end];
  const opening = [`0 FILE ${MAIN_FILE}`, ...((layout.length < 1) ? DEFAULT_HEADER : [])].map(line => line + layout.lineBreak).join('');
  return [end, { from: 0, to: 0, insert: opening }]/*the end first: each edit is measured after the ones before it*/;
};

/** the edits that remove every part, copy and component, keeping the main model's
 *  other lines (its header, the ground): an MPD file becomes a flat one again */
export const clearEdits = (layout: ModelLayout): ContentChange[] => deleteLines([
  ...layout.mainParts, ...layout.steps, ...layout.components.map(({ span }) => span), ...(layout.mainFile ? [layout.mainFile] : []),
]);

/** the edit that sets a flat model's ground color, or returns it to the theme's
 *  (`undefined`): the ground line is replaced or removed, or a new one goes before the
 *  first part. An empty text gains the header first */
export const groundEdit = (layout: ModelLayout, color: string | undefined): ContentChange[] => {
  const line = (color === undefined) ? undefined : [...GROUND_META, color].join(' ');
  if(layout.ground) {
    const ending = ((layout.ground.to < layout.length) || layout.endsWithBreak) ? layout.lineBreak : ''/*the last line, unfinished*/;
    return [{ ...layout.ground, insert: (line === undefined) ? '' : line + ending }];
  } /* else -- no ground line yet */
  if(line === undefined) return []/*already the theme's*/;
  if(layout.length < 1) return [{ from: 0, to: 0, insert: [...DEFAULT_HEADER, line].map(text => text + layout.lineBreak).join('') }];
  const first = minOf([...layout.mainParts, ...layout.steps].map(span => span.from));
  if(Number.isFinite(first)) return [{ from: first, to: first, insert: line + layout.lineBreak }];
  const lead = layout.mainEndsWithBreak ? '' : layout.lineBreak/*the last line is unfinished*/;
  return [{ from: layout.mainEnd, to: layout.mainEnd, insert: lead + line + layout.lineBreak }];
};

/** the edits that delete lines, each once and the last first: each edit is measured
 *  after the ones before it */
export const deleteLines = (spans: ReadonlyArray<Span>): ContentChange[] =>
  [...new Map(spans.map(span => [span.from, span])).values()].sort((a, b) => b.from - a.from).map(({ from, to }) => ({ from, to }));

/** a text with edits applied as the app-content applies them: in order, each
 *  measured after the ones before it */
export const applyChanges = (text: string, changes: ReadonlyArray<ContentChange>): string =>
  changes.reduce((current, { from, to, insert }) => current.slice(0, from) + (insert ?? '') + current.slice(to), text);

// --------------------------------------------------------------------------------
const partLine = (colorCode: number, position: readonly number[], matrix: readonly number[], ldraw: string): string =>
  ['1', colorCode, ...position, ...matrix].map(formatNumber).join(' ') + ` ${ldraw}.dat`;

const formatNumber = (value: number | string): string => {
  if(typeof value === 'string') return value;
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
