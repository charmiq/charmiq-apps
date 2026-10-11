import type { ContentChange } from '../../../shared/charmiq';
import { getColor, getColorByCode, getPart, getPartByLDraw, getShape, gridPosition, ldrawPosition, matrixRotation, rotationMatrix, type Placement } from './grid';

// the build as LDraw text. A model is a flat LDraw file: comment lines are kept as
// written, and each type-1 line is one part. A multi-part (MPD) file is flattened
// into its placed parts. A line whose part is in the catalog and lies on the grid
// is a Placement; any other part line is kept and counted, never dropped. A flat
// file's parts also carry where their lines lie, so an edit changes those lines
// alone
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
  /** the text's length, its line break, and whether it ends with one */
  length: number;
  lineBreak: string;
  endsWithBreak: boolean;
}>;

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
  if(main === undefined) return { ...EMPTY_MODEL, layout: { placements: [], others: [], length: 0, lineBreak: '\n', endsWithBreak: false } }/*empty text*/;

  const header: string[] = [];
  const placements: Placement[] = [];
  const others: OtherPart[] = [];
  const placementSpans: Span[] = [];
  const otherSpans: Span[] = [];

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
      if(placement) { placements.push(placement); placementSpans.push({ from, to }); }
      else { others.push({ ldraw: reference.replace(/\.dat$/, ''), colorCode, position: world.position, matrix: world.matrix }); otherSpans.push({ from, to }); }
    }
  };
  walk(main, IDENTITY, 16, 0, true);

  exceeded();
  const flat = (files.size === 1) && (main === '')/*no `0 FILE` section: each part is its own line*/;
  const lineBreak = lines.find(line => line.lineBreak)?.lineBreak ?? '\n';
  return {
    header: (header.length > 0) ? header : DEFAULT_HEADER, placements, others,
    ...(truncated ? { truncated } : {}),
    ...(flat ? { layout: { placements: placementSpans, others: otherSpans, length: text.length, lineBreak, endsWithBreak: /[\r\n]$/.test(text) } } : {}),
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
/** writes a Model as a flat LDraw file */
export const serializeModel = (model: Model): string => [
  ...model.header,
  ...model.placements.map(placementLine),
  ...model.others.map(other => partLine(other.colorCode, other.position, other.matrix, other.ldraw)),
].join('\n') + '\n';

/** the LDraw line of a Placement (its part and color are catalog entries by contract) */
export const placementLine = (placement: Placement): string => {
  const part = getPart(placement.part)!/*by contract*/;
  const color = getColor(placement.color)!/*by contract*/;
  return partLine(color.code, ldrawPosition(getShape(part), placement), rotationMatrix(placement.rotation), part.ldraw);
};

// == Line Edits ==================================================================
/** the edit that appends lines to a flat model's text, after its header when the
 *  text is empty */
export const appendLines = (layout: ModelLayout, lines: ReadonlyArray<string>): ContentChange => {
  const written = (layout.length < 1) ? [...DEFAULT_HEADER, ...lines] : lines;
  const lead = ((layout.length < 1) || layout.endsWithBreak) ? '' : layout.lineBreak/*the last line is unfinished*/;
  return { from: layout.length, to: layout.length, insert: lead + written.map(line => line + layout.lineBreak).join('') };
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
