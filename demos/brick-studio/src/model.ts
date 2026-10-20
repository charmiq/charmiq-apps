import type { ContentChange } from '../../../shared/charmiq';
import { type CatalogPart, type FigureFace, ACCESSORIES, COLORS, DEFAULT_FIGURE_FACE, FIGURE_FACES } from './catalog';
import { carriedLines, compose, copyPosition, copyTransform, footprintOf, getColor, getColorByCode, getPart, getPartByLDraw, getShape, gridPosition, matrixRotation, mountedCopy, mountsOf, mountSlots, mountTransform, onSafeGrid, placedLines, poseLift, INHERITED_COLOR, type Copy, type Footprint, type Gear, type Mount, type PartLine, type Placement, type Transform } from './grid';
import { maxOf, minOf } from './numbers';
import { accessoryLine, hingePieces, limbLines, normalizePose, pieceLines, posedPieces, type Pose, LIMBS, POSE_ANGLES, SLOTS_IN_ORDER } from './pose';

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
// the part is written whole. A hinge's carry is the component line right after the
// hinge's own lines in the same step, standing on its top once turned back to 0 (SEE: grid.ts
// Hinges): the hinge owns that line, and its parts are the carry's, never the
// build's own or a copy's. `0 STEP` lines in the main file split the parts into building steps, in
// order; a step with no parts is no step. A `0 !BRICKSTUDIO GROUND <color>` line in
// the main file colors the baseplate (LDraw's form for a program's own meta-command:
// other LDraw tools pass it by). A build holds one set or more, each an arrangement on
// its own baseplate sharing the build's components: the main model is the first, and
// a section holding a `0 !BRICKSTUDIO SET <name>` line is another, read as a main
// model is (its own steps and ground) and never a component. A Model is one set
// ********************************************************************************
// == Types =======================================================================
/** a part line that is not a Placement (a part outside the catalog, an unknown
 *  color, or a position or rotation off the grid) */
export type OtherPart = PartLine;

/** a line in the text, its line break included (UTF-16 offsets) */
export type Span = Readonly<{ from: number; to: number; }>;
/** a set's section: its name (MAIN_SET for a main model that names none, `named`
 *  false), its file (`''` for a flat file), its `0 FILE` line (none for a flat file),
 *  its name line, every piece of its sections (from its `0 FILE` line to the next,
 *  apart by the data sections within, a repeated section's too) and where its own
 *  lines end */
export type SetSection = Readonly<{ name: string; named: boolean; file: string; start?: Span; nameLine?: Span; pieces: ReadonlyArray<Span>; end: number; }>;

/** where an editable text's files lie: what an edit of the file as a whole (a
 *  component defined, a set added, the build cleared) is measured on */
export type FileLayout = Readonly<{
  /** the build's sets, the main model first */
  sets: ReadonlyArray<SetSection>;
  /** the main model's `0 FILE` line, for an MPD file */
  mainFile?: Span;
  /** the `0 NOFILE` line ending the main model, when it has one: parts go before it,
   *  components after it */
  endMarker?: Span;
  /** each component's section (its lines up to any data section in it), and the rest
   *  of its lines and the later sections of the same name (`repeats`) */
  components: ReadonlyArray<Readonly<{ name: string; file: string; span: Span; repeats: ReadonlyArray<Span>; }>>;
  /** each data section (SEE: Model#data), from its `0 !DATA` line to its last `0 !:`
   *  line, kept where it stands */
  data: ReadonlyArray<Span>;
  /** where the text's files end: before the data sections that close it (nothing but
   *  blank lines after them), else the text's end. New sections go there */
  filesEnd: number;
  /** the text's length, its line break, and whether it ends with one */
  length: number;
  lineBreak: string;
  endsWithBreak: boolean;
}>;

/** where an editable model's parts lie in its text: a flat file, or an MPD file whose
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
  /** every part and copy line of the model's own file, whatever it names */
  parts: ReadonlyArray<Span>;
  /** every `0 STEP` line of its own file */
  steps: ReadonlyArray<Span>;
  /** the ground line, when the model has one */
  ground?: Span;
  /** the first `0 STEP` line after the model's last part, when it ends in steps:
   *  parts added to the last step go before it */
  trailingStep?: Span;
  /** where the model's own lines end (the text's end for a flat file), and whether its
   *  last line ends in a line break there */
  end: number;
  endsLine: boolean;
  /** where the text's files lie */
  file: FileLayout;
}>;

/** each part's and copy's building step, from 1, in the order of `placements`, of
 *  `others` and of `copies`, and how many steps there are */
export type ModelSteps = Readonly<{ placements: ReadonlyArray<number>; others: ReadonlyArray<number>; copies: ReadonlyArray<number>; count: number; }>;

/** a line of the main model placing a component: its component, the color its
 *  parts of LDraw's color 16 take, and its copy (an index into `copies`) when it is
 *  one on the grid, or `carried` when a hinge carries it (its parts are then the
 *  carry's). The line owns every part it places, a copy or not */
export type Placed = Readonly<{ component: string; colorCode: number; copy?: number; carried?: true; }>;

/** a set as a model names it: its name and its file */
export type SetEntry = Readonly<{ name: string; file: string; }>;
/** which set of a text to read: by name (ignoring case) or by file. A set the text
 *  does not hold reads its main set */
export type SetAt = Readonly<{ name: string; }> | Readonly<{ file: string; }>;

/** a component: its section's file as written (the name and `.ldr`, `.dat`, `.mpd`
 *  or nothing), its parts in its own grid and the cells they cover */
export type Component = Readonly<{ name: string; file: string; placements: ReadonlyArray<Placement>; others: ReadonlyArray<OtherPart>/*part lines off its grid*/; footprint?: Footprint; }>;

// ................................................................................
export type Model = Readonly<{
  /** the set this model is, by name, when the build holds more than one set or this
   *  set names itself; and every set, the main model first, when it holds more than
   *  one */
  set?: string;
  sets?: ReadonlyArray<SetEntry>;
  /** comment and meta lines, as written */
  header: ReadonlyArray<string>;
  placements: ReadonlyArray<Placement>;
  others: ReadonlyArray<OtherPart>;
  /** the text expands past what is read (SEE: READ_IN_PART): only its first parts were read */
  truncated?: boolean;
  /** where the parts lie, when edits can change the text line by line */
  layout?: ModelLayout;
  /** why edits cannot change the text line by line, model-facing (SEE: UNEDITABLE) */
  uneditable?: string;
  /** the components more than one section defines: the first definition is used */
  duplicated?: ReadonlyArray<string>;
  /** why an assembled part's pieces are not told from the lines near them,
   *  model-facing (SEE: UNEDITABLE) */
  untold?: string;
  /** why no text may be written from the model, model-facing: it does not account
   *  for every line as written (its pieces are untold, or a part's numbers overflow
   *  once its submodels are placed), so a flat text written from it would differ */
  unwritable?: string;
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
  /** each part off the grid's line (an index into `placed`), or undefined for a part
   *  of its own */
  otherPlaced?: ReadonlyArray<number | undefined>;
  /** the building steps, when the build has more than one */
  steps?: ModelSteps;
  /** the lines of the files the text carries that are no part of the build (LDraw's
   *  `0 !DATA` sections, their content in `0 !:` lines: a film's scene, say), as
   *  written and in order, when it has any: kept through every edit and written last
   *  when the build is written whole */
  data?: ReadonlyArray<string>;
}>;

// == Constants ===================================================================
/** the most parts a build holds */
export const MAX_PARTS = 20_000;
/** the most part lines a build is read with, a limit apart from MAX_PARTS: a part
 *  drawn in pieces (a figure, about ten) takes a line per piece */
export const MAX_PART_LINES = 100_000;
/** the most submodel lines read while expanding references: a submodel is read
 *  again for every reference to it */
const MAX_EXPANDED_LINES = 100_000;

/** why edits cannot change a model's text line by line, model-facing: each says what
 *  makes it so and what to do */
const UNEDITABLE = {
  mainTwice: 'its main model is named twice (two people gave a flat build its first component at once), so which is the build is not told. Its text is kept as written: replace it with corrected LDraw that names the main model once (setModel)',
  unsectioned: 'lines come before its first `0 FILE` section. Replace it with a flat model to edit it: call setModel with the text getModel returns (comments inside its submodels are not kept)',
  nested: 'its submodels place other submodels. Replace it with a flat model to edit it: call setModel with the text getModel returns (comments inside its submodels are not kept)',
  repeated: 'two of its sections share a name. Replace it with a flat model to edit it: call setModel with the text getModel returns (comments inside its submodels are not kept)',
  undecided: 'more lines lie where an assembled part\'s pieces go than are compared, so which lines are its pieces is not told. Remove the extra lines from the text getModel returns and give it to setModel to edit it',
  setPlaced: 'one of its sets is placed in another file as a submodel, so it is no longer an arrangement of its own. Replace it with a flat model to edit it: call setModel with the text getModel returns',
  setNamedTwice: 'two of its sets share a name, so which a name means is not told. Rename one in its `0 !BRICKSTUDIO SET` line and give the text to setModel',
  tooManySets: 'it holds more sets than a build holds (32), and only the first are read. Remove sets from the text getModel returns and give it to setModel',
} as const;

/** why no text is written from a model besides an untold piece, model-facing */
const UNWRITABLE = {
  mainTwice: 'its main model is named twice. Give LDraw that names it once',
  overflows: 'a part\'s numbers overflow once its submodels are placed, so it cannot be written flat. Give it back as written (getModel) or remove that part',
} as const;

/** why a truncated model was read only in part, model-facing */
export const READ_IN_PART = `Its submodels expand past what Brick Studio reads (${MAX_PART_LINES} part lines, ${MAX_PARTS} submodel references or ${MAX_EXPANDED_LINES} submodel lines), so it was read only in part.`;

const DEFAULT_HEADER = ['0 Brick Studio model', '0 Name: model.ldr'];
/** below this a number's thousandths are exact in a double, so a line rounds them */
const ROUNDED_BELOW = 2 ** 53 / 1000;
/** the main model's file name once the build has components */
const MAIN_FILE = 'model.ldr';
/** LDraw's meta-command that ends the file it is in: the main model's end, written
 *  by Brick Studio when it writes a build whole (its first component, Clear,
 *  setModel), so parts (before it) and components (after it) never meet */
const END_MARKER = '0 NOFILE';
/** LDraw's meta-command that ends a building step */
const STEP_LINE = '0 STEP';
/** LDraw's meta-commands that start a data section and carry its content */
const DATA_START = '0 !DATA ';
const DATA_LINE = '0 !:';
/** Brick Studio's meta-command naming the baseplate's color */
const GROUND_META = ['0', '!BRICKSTUDIO', 'GROUND'] as const;
/** Brick Studio's meta-command naming a set: the rest of its line is the name */
const SET_META = /^0\s+!BRICKSTUDIO\s+SET\s+(\S.*)$/i;
const SET_LINE = '0 !BRICKSTUDIO SET';
/** the name of a main model that names none (every build written before sets) */
export const MAIN_SET = 'Main';
/** the most sets a build holds, and a set's longest name */
export const MAX_SETS = 32;
export const MAX_SET_NAME = 40;
/** the end of the file a set Brick Studio adds is written to: a component's name
 *  holds no dot, so a set's file is never a component's */
const SET_FILE = '.set.ldr';

export const EMPTY_MODEL: Model = { header: DEFAULT_HEADER, placements: [], others: [] };

// == Parse =======================================================================
/** how far apart two lines' positions (LDU) and matrix values may be and still be
 *  the same line: LDraw's rounding of what other programs write */
const LINE_TOLERANCE = 1e-2;
const MATRIX_TOLERANCE = 1e-3;
/** the most other lines a piece compares before it is missing (SEE: absorbPieces):
 *  more than a piece's own lines and its near neighbors in any file built to be
 *  read, few enough that lines placed to miss it stay bounded */
const MAX_NEAR_LINES = 16;

const IDENTITY: Transform = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] };

// --------------------------------------------------------------------------------
/** parses LDraw text (LDR or MPD) into a Model of one of its sets, its main set
 *  unless `at` names another. Submodels are flattened; LDraw's inherited colors (16,
 *  24) take the parent's color */
export const parseModel = (text: string, at?: SetAt): Model => {
  const read = readingOf(text);
  const sets = read.layout.sets;
  const found = !at ? undefined : ('name' in at) ? sets.find(set => sameSetName(set.name, at.name)) : sets.find(set => set.file === at.file);
  return setOf(read, found ?? sets[0]);
};

/** every set of a text as a Model, the main set first, its files read once */
export const parseSets = (text: string): ReadonlyArray<Model> => {
  const read = readingOf(text);
  return (read.layout.sets.length < 1) ? [setOf(read, undefined)] : read.layout.sets.map(set => setOf(read, set));
};

// ................................................................................
// a text is read once: its most recent readings are kept by text, and each set of a
// reading is read once, so every reader of a set of one text (an edit, the set shown,
// its check, a command's report) shares one Model
/** the readings kept: the build shown, an edit's result and the texts between */
const KEPT_READINGS = 4;
const readings: Array<Readonly<{ text: string; read: Files; }>> = []/*the most recent first*/;
const readSets = new WeakMap<Files, Map<SetSection | undefined, Model>>();

/** a text's files, read once while the text is among the most recent read */
const readingOf = (text: string): Files => {
  const at = readings.findIndex(reading => reading.text === text);
  const reading = (at < 0) ? { text, read: readFiles(text) } : readings.splice(at, 1)[0];
  readings.unshift(reading);
  readings.length = Math.min(readings.length, KEPT_READINGS);
  return reading.read;
};

/** a set of a reading as a Model, read once */
const setOf = (read: Files, set: SetSection | undefined): Model => {
  let sets = readSets.get(read);
  if(!sets) { sets = new Map(); readSets.set(read, sets); }
  let model = sets.get(set);
  if(!model) { model = readSet(read, set); sets.set(set, model); }
  return model;
};

/** whether two set names name one set: alike ignoring case and outer spaces */
export const sameSetName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

// ................................................................................
/** a text's files, read once: each file's lines, its components and where its
 *  sections lie (SEE: readFiles) */
type Files = Readonly<{
  /** each file's lines by name; the main model's is the first, `''` for a flat file,
   *  undefined when the text holds no file */
  lines: ReadonlyMap<string, ReadonlyArray<Line>>;
  main: string | undefined;
  /** the components, read; none past the submodel budget (`tooManyDefinitionLines`) */
  components: ReadonlyArray<Component & Readonly<{ nested: boolean; undecided: boolean; }>>;
  tooManyDefinitionLines: boolean;
  /** the files that are sets, the main model's first (at most MAX_SETS: a set past
   *  them is never read) */
  setFiles: ReadonlySet<string>;
  /** why the text's files keep it from being edited line by line, when they do */
  mainTwice: boolean;
  setPlaced: boolean;
  tooManySets: boolean;
  setNamedTwice: boolean;
  unsectioned: boolean;
  nested: boolean;
  repeated: boolean;
  /** the components more than one section defines */
  duplicated: ReadonlyArray<string>;
  /** the data sections' lines, as written (SEE: Model#data) */
  data: ReadonlyArray<string>;
  layout: FileLayout;
}>;

/** splits a text into its files: a plain LDR is one unnamed file. Blank lines before
 *  the first file belong to none. A name used twice is read from its first section;
 *  the file can then not be edited line by line. The lines of the files after the
 *  main model that are no set (the component definitions) are counted toward the
 *  submodel budget */
const readFiles = (text: string): Files => {
  const lines = splitLines(text);
  const files = new Map<string, Line[]>();
  const sectionStarts: Array<Readonly<{ name: string; from: number; to: number; }>> = []/*every `0 FILE` line, in order*/;
  let current: Line[] = [];
  let currentFile: string | undefined/*the file `current` is, when it is one*/;
  let main: string | undefined;
  let mainTwice = false;
  let endMarker: Span | undefined;
  /** each further file's own end marker, and each file's first set name line */
  const markers = new Map<string, Span>();
  const nameLines = new Map<string, Readonly<{ name: string; span: Span; }>>();
  /** the lines counted in each run of lines (a file's, or lines in none) */
  const counted = new Map<Line[], number>();
  // a data section is in no file: its `0 !:` lines are its content, and the first
  // other line ends it, read in the file it interrupted
  const data: string[] = [], dataSpans: Span[] = [];
  let reading: { from: number; to: number; resume: Line[]; resumeFile: string | undefined; } | undefined;
  for(const line of lines) {
    const trimmed = line.text.trim();
    if(reading) {
      if(trimmed.startsWith(DATA_LINE)) { data.push(line.text.trimEnd()); reading.to = line.to; continue; }
      dataSpans.push({ from: reading.from, to: reading.to });
      current = reading.resume;
      currentFile = reading.resumeFile;
      reading = undefined;
    } /* else -- in a file */
    if(trimmed.startsWith(DATA_START)) {
      data.push(line.text.trimEnd());
      reading = { from: line.from, to: line.to, resume: current, resumeFile: currentFile };
      current = []/*in no file*/;
      currentFile = undefined;
      continue;
    } /* else -- no data section starts */
    if(trimmed.startsWith('0 FILE ')) {
      const name = normalizeName(trimmed.slice(7));
      current = [];
      if(files.has(name)) { mainTwice ||= (name === main)/*its lines are read from its first section*/; currentFile = undefined; }
      else { files.set(name, current); currentFile = name; }
      sectionStarts.push({ name, from: line.from, to: line.to });
      main ??= name;
      continue;
    } /* else -- a line of the current file */
    if(main !== undefined) counted.set(current, (counted.get(current) ?? 0) + 1);
    if(main === undefined) {
      if(trimmed.length < 1) continue/*before any file*/;
      main = ''; files.set(main, current); currentFile = main;
    } /* else -- in a file */
    if(trimmed.toUpperCase() === END_MARKER) {
      // the end of the file it is in. The main model's: lines after it (a page of
      // the previous release put parts there) are still the main model's. Another
      // file's: lines after it, up to the next file, are in none
      if(current === files.get(main)) endMarker ??= { from: line.from, to: line.to };
      else {
        if((currentFile !== undefined) && !markers.has(currentFile)) markers.set(currentFile, { from: line.from, to: line.to });
        current = []/*in no file*/;
        currentFile = undefined;
      }
      continue;
    } /* else -- a line of the file */
    const named = (currentFile !== undefined) && !nameLines.has(currentFile) ? SET_META.exec(trimmed) : null;
    if(named) nameLines.set(currentFile!, { name: named[1].trim(), span: { from: line.from, to: line.to } });
    current.push(line);
  }
  if(reading) dataSpans.push({ from: reading.from, to: reading.to })/*the text's last section*/;
  const filesEnd = closingData(text, dataSpans);

  // the main model is a set, and so is each file naming itself one; every other file
  // is a component: its parts in its own grid. Past the submodel budget none is read:
  // the model is then read only in part
  const named = [...files.keys()].filter(name => (name === main) || nameLines.has(name));
  const setFiles = new Set(named.slice(0, MAX_SETS))/*the sets read*/;
  const setLines = new Set(named.map(name => files.get(name)!));
  const definitionLines = [...counted].reduce((total, [run, count]) => setLines.has(run) ? total : (total + count), 0);
  const tooManyDefinitionLines = definitionLines > MAX_EXPANDED_LINES;
  const components = tooManyDefinitionLines ? [] : [...files].filter(([name]) => !setLines.has(files.get(name)!)).map(([name, componentLines]) => readComponent(name, componentLines, files));
  // a name two files share (`bare` and `bare.ldr`) names neither for an edit; a file
  // defined twice (one name defined by two people at once) is read from its first
  // definition and named
  const repeated = new Set(components.map(component => component.name)).size < components.length;
  const sectionsOf = new Map<string, number>();
  for(const { name } of sectionStarts) sectionsOf.set(name, (sectionsOf.get(name) ?? 0) + 1);
  const spans = sectionSpans(sectionStarts, dataSpans, filesEnd, text.length);
  const sections = components.map(({ name, file }) => { const [span, ...repeats] = spans.get(file)!/*each component is a file's*/; return { name, file, span, repeats }; });

  // each set's section, and where its own lines end: at the next section, its end
  // marker or the files' end
  const sets: SetSection[] = [...setFiles].map(file => {
    const start = sectionStarts.find(each => each.name === file);
    const next = start ? sectionStarts.find(each => each.from > start.from)?.from : undefined;
    const marker = (file === main) ? endMarker : markers.get(file);
    const nameLine = nameLines.get(file);
    return {
      name: nameLine?.name ?? MAIN_SET, named: !!nameLine, file,
      ...(start ? { start: { from: start.from, to: start.to } } : {}), ...(nameLine ? { nameLine: nameLine.span } : {}),
      pieces: spans.get(file) ?? [], end: minOf([next ?? Infinity, marker?.from ?? Infinity], filesEnd),
    };
  });
  const setNames = sets.map(set => set.name.toLowerCase());
  // a line of any file placing a set's file: the set is then a submodel too
  const setPlaced = [...files.values()].some(fileLines => fileLines.some(({ text: line }) => {
    const fields = line.trim().split(/\s+/);
    return (fields[0] === '1') && (fields.length >= 15) && setFiles.has(normalizeName(fields.slice(14).join(' ')));
  }));
  const duplicated = [...components.filter(component => (sectionsOf.get(component.file) ?? 0) > 1), ...sets.filter(set => (set.file !== main) && ((sectionsOf.get(set.file) ?? 0) > 1))].map(each => each.name);
  const flat = (files.size === 1) && (main === '')/*no `0 FILE` section: each part is its own line*/;
  return {
    lines: files, main, components, tooManyDefinitionLines, setFiles,
    mainTwice, setPlaced, tooManySets: named.length > MAX_SETS, setNamedTwice: new Set(setNames).size < setNames.length, unsectioned: (main === '') && !flat, nested: components.some(component => component.nested), repeated, duplicated, data,
    layout: {
      sets,
      ...(((main !== undefined) && (main !== '')) ? { mainFile: { from: sectionStarts[0].from, to: sectionStarts[0].to }/*the first section is the main model's*/ } : {}),
      ...(endMarker ? { endMarker } : {}),
      components: sections, data: dataSpans, filesEnd,
      length: text.length, lineBreak: lines.find(line => line.lineBreak)?.lineBreak ?? '\n', endsWithBreak: /[\r\n]$/.test(text),
    },
  };
};

// ................................................................................
/** one set of a text's files: its parts walked through the components it places,
 *  and where its lines lie when edits can change them line by line */
const readSet = (read: Files, set: SetSection | undefined): Model => {
  const { lines: files, components, layout: file } = read;
  const withData = (read.data.length > 0) ? { data: read.data } : {};
  if(!set) return { ...EMPTY_MODEL, ...withData, layout: { placements: [], others: [], pieces: [], placed: [], parts: [], steps: [], end: 0, endsLine: true/*nothing before the data*/, file } }/*no file: empty text, or data alone*/;

  const componentsByFile = new Map(components.map(component => [component.file, component]));
  const main = set.file/*the file walked: the set's*/;
  let nested = read.nested;
  const header: string[] = [];
  const placements: Placement[] = [];
  const placementCopies: Array<number | undefined> = [];
  const placementPlaced: Array<number | undefined> = [];
  const others: OtherPart[] = [];
  const placementSpans: Span[] = [];
  const otherSpans: Span[] = [];
  const copies: Copy[] = [];
  let placed: Placed[] = [];
  const placedSpans: Span[] = [];
  const placedTransforms: Transform[] = []/*each line's, as written*/;
  const parts: Span[] = [];
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
  const exceeded = () => truncated ||= (((placements.length + others.length) > MAX_PART_LINES) || (references > MAX_PARTS) || (expandedLines > MAX_EXPANDED_LINES));

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
      if(isMain) parts.push({ from, to });
      const colorCode = ((values[0] === 16) || (values[0] === 24)) ? inheritedColor : values[0];
      const reference = normalizeName(fields.slice(14).join(' '));
      const local: Transform = { position: [values[1], values[2], values[3]], matrix: values.slice(4, 13) };
      const world = compose(transform, local);

      if(files.has(reference) && (depth < 16/*guards a cyclic MPD*/)) {
        references++;
        if(reference === main) nested = true/*the set placed in itself*/;
        // a copy: the main model's line naming a component, on the grid
        const component = isMain ? componentsByFile.get(reference) : undefined;
        const position = component?.footprint && copyPosition(component.footprint, component.name, local);
        if(position) { copies.push(position); copySteps.push(step); }
        if(isMain) { placed.push({ component: component?.name ?? reference, colorCode, ...(position ? { copy: copies.length - 1 } : {}) }); placedSpans.push({ from, to }); placedTransforms.push(local); }
        walk(reference, world, colorCode, depth + 1, isMain ? (placed.length - 1) : owner);
        continue;
      } /* else -- a part */
      const placement = toPlacement(reference, colorCode, world);
      if(placement) { placements.push(placement); placementCopies.push((owner === undefined) ? undefined : placed[owner].copy); placementPlaced.push(owner); placementSpans.push({ from, to }); placementSteps.push(step); }
      else { others.push({ ldraw: reference.replace(/\.dat$/, ''), colorCode, position: world.position, matrix: world.matrix }); otherSpans.push({ from, to }); otherSteps.push(step); otherPlaced.push(owner); }
    }
  };
  walk(main, IDENTITY, 16, 0, undefined);
  const { pieceSpans, undecided } = absorbPieces(placements, others, otherSpans, otherSteps, { placements: placementPlaced, others: otherPlaced });

  // each carrier of the main model's own (a hinge, a part with side faces) takes as its
  // mounts the main model's part lines right after its own lines, in its own line's
  // building step, at most one for each of its slots: each a component line whose
  // parts are drawn from its component as the line places them (a component placing
  // no other file, its pieces told, the line in LDraw's inherited color) and that
  // stands on the studs of a slot not yet taken (SEE: grid.ts mountedCopy), in any
  // order. The first line that is none ends the look. The carrier owns the lines it
  // takes, and the parts they place leave the build's own and its copies; any other
  // line keeps its parts as read
  const placedAt = new Map(placedSpans.map((span, index) => [span.from, index]));
  const componentsByName = new Map(components.map(component => [component.name, component]));
  const carried = new Set<number/*an index into placed*/>();
  placements.forEach((placement, index) => {
    const part = getPart(placement.part)!/*by contract*/;
    const open = new Set(mountSlots(part));
    if((open.size < 1) || (placementPlaced[index] !== undefined)) return;
    const shape = getShape(part);
    const stepEnd = stepSpans[firstFrom(stepSpans, placementSpans[index].from)]?.from ?? Infinity;
    let carrier = placement;
    for(let next = firstFrom(parts, maxOf([placementSpans[index], ...pieceSpans[index]].map(span => span.to))); open.size > 0; next++) {
      const span = parts[next];
      const line = (span === undefined) ? undefined : placedAt.get(span.from);
      if((line === undefined) || carried.has(line) || (span.from > stepEnd)) break/*no component line, or a step apart*/;
      const component = componentsByName.get(placed[line].component);
      if(!component?.footprint || component.nested || component.undecided || (placed[line].colorCode !== INHERITED_COLOR)) break/*not drawn from its component as placed*/;
      const mount = [...open].flatMap(slot => { const copy = mountedCopy(shape, placement, slot, { name: component.name, footprint: component.footprint! }, placedTransforms[line]); return copy ? [{ slot, copy }] : []; })[0];
      if(!mount) break;
      carrier = withMount(carrier, mount);
      open.delete(mount.slot);
      pieceSpans[index] = [...pieceSpans[index], placedSpans[line]];
      carried.add(line);
    }
    placements[index] = carrier;
  });
  if(carried.size > 0) {
    const ownParts = placementPlaced.map(owner => (owner === undefined) || !carried.has(owner));
    const ownOthers = otherPlaced.map(owner => (owner === undefined) || !carried.has(owner));
    keepWhere(ownParts, placements, placementCopies, placementPlaced, placementSpans, placementSteps, pieceSpans);
    keepWhere(ownOthers, others, otherSpans, otherSteps, otherPlaced);
    // a carry on the grid (a hinge at 0) is no copy: the copies renumbered without it
    const carriedCopies = new Set(placed.flatMap((line, at) => (carried.has(at) && (line.copy !== undefined)) ? [line.copy] : []));
    const renumbered = new Map<number, number>();
    copies.forEach((_, index) => { if(!carriedCopies.has(index)) renumbered.set(index, renumbered.size); });
    keepWhere(copies.map((_, index) => renumbered.has(index)), copies, copySteps);
    placed = placed.map(({ copy, ...line }, at) => carried.has(at) ? { ...line, carried: true } : { ...line, ...((copy !== undefined) ? { copy: renumbered.get(copy)! } : {}) });
    placementCopies.forEach((copy, index) => { placementCopies[index] = (copy === undefined) ? undefined : renumbered.get(copy); });
  }

  exceeded();
  truncated ||= read.tooManyDefinitionLines/*the main model read, its components not*/;
  // why line edits cannot apply, when they cannot: the first reason found
  const untold = undecided || components.some(component => component.undecided);
  const overflows = others.some(other => ![...other.position, ...other.matrix].every(Number.isFinite))/*placed through submodels whose transforms overflow*/;
  const { mainTwice } = read;
  const uneditable = mainTwice ? UNEDITABLE.mainTwice : read.unsectioned ? UNEDITABLE.unsectioned : nested ? UNEDITABLE.nested : read.repeated ? UNEDITABLE.repeated
    : read.tooManySets ? UNEDITABLE.tooManySets : read.setPlaced ? UNEDITABLE.setPlaced : read.setNamedTwice ? UNEDITABLE.setNamedTwice : untold ? UNEDITABLE.undecided : undefined;
  const { end } = set;
  const lastPart = maxOf(parts.map(span => span.to), 0);
  const trailingStep = (parts.length > 0) ? stepSpans.find(span => span.from >= lastPart) : undefined;
  const steps = numberSteps(placementSteps, otherSteps, copySteps);
  const several = file.sets.length > 1;
  return {
    ...((several || set.named) ? { set: set.name } : {}),
    ...(several ? { sets: file.sets.map(({ name, file: setFile }) => ({ name, file: setFile })) } : {}),
    header: (header.length > 0) ? header : DEFAULT_HEADER, placements, others,
    ...(truncated ? { truncated } : {}),
    ...(ground ? { ground: ground.color } : {}),
    ...((components.length > 0) ? { components: components.map(({ nested: _, undecided: __, ...component }) => component) } : {}),
    ...((copies.length > 0) ? { copies, placementCopies } : {}),
    ...((placed.length > 0) ? { placed, placementPlaced, otherPlaced } : {}),
    ...(untold ? { untold: UNEDITABLE.undecided } : {}),
    ...((untold || overflows || mainTwice) ? { unwritable: mainTwice ? UNWRITABLE.mainTwice : untold ? UNEDITABLE.undecided : UNWRITABLE.overflows } : {}),
    ...((read.duplicated.length > 0) ? { duplicated: read.duplicated } : {}),
    ...withData,
    ...(uneditable ? { uneditable } : { layout: {
      placements: placementSpans, others: otherSpans, pieces: pieceSpans, placed: placedSpans, parts, steps: stepSpans,
      ...(ground ? { ground: ground.span } : {}), ...(trailingStep ? { trailingStep } : {}),
      end, endsLine: (end < file.length) || file.endsWithBreak, file,
    } }),
    ...((steps.count > 1) ? { steps } : {}),
  };
};

// ................................................................................
/** a component's parts in its own grid, from its file's lines; `nested` when it
 *  places another file */
const readComponent = (file: string, componentLines: ReadonlyArray<Line>, files: ReadonlyMap<string, ReadonlyArray<Line>>): Component & Readonly<{ nested: boolean; undecided: boolean; }> => {
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
  const { undecided } = absorbPieces(placements, others, spans, steps);
  const footprint = footprintOf(placements);
  return { name: file.replace(/\.ldr$/, ''), file, placements, others, ...(footprint ? { footprint } : {}), nested, undecided };
};

/** each named file's lines, in one pass, in order: from a `0 FILE` line up to the
 *  next `0 FILE` line or the text's files' end (SEE: closingData), in pieces apart by
 *  the data sections within */
const sectionSpans = (starts: ReadonlyArray<Readonly<{ name: string; from: number; }>>, data: ReadonlyArray<Span>, filesEnd: number, length: number): Map<string, Span[]> => {
  const spans = new Map<string, Span[]>();
  let next = 0/*the first data section not before the file*/;
  starts.forEach(({ name, from }, index) => {
    const to = Math.min(starts[index + 1]?.from ?? length, filesEnd)/*a file starts before the data closing the text*/;
    while((next < data.length) && (data[next].from < from)) next++;
    const pieces = spans.get(name) ?? [];
    spans.set(name, pieces);
    let at = from/*a file line: the first piece is never empty*/;
    for(; (next < data.length) && (data[next].from < to); next++) {
      if(data[next].from > at) pieces.push({ from: at, to: data[next].from });
      at = data[next].to;
    }
    if(to > at) pieces.push({ from: at, to });
  });
  return spans;
};

/** where the text's files end: the start of the data sections that close it, only
 *  blank lines after them, else the text's end */
const closingData = (text: string, data: ReadonlyArray<Span>): number => {
  let end = text.length;
  for(let index=data.length - 1; (index >= 0) && (text.slice(data[index].to, end).trim().length < 1); index--) end = data[index].from;
  return end;
};

/** the file a component Brick Studio adds is written to; a section already in the
 *  text keeps its own (SEE: Component#file) */
const newFileName = (component: string): string => `${component}.ldr`;

// ................................................................................
/** takes each placement's pieces out of the other parts: a line of the piece's file
 *  and color, within LINE_TOLERANCE of where the placement puts it and placed by the
 *  same line of the main model (`owners`, each an index into `placed`; none within
 *  one file), is the placement's, the first such line in the text. A piece a
 *  component's line places is never a part of the build's own, nor of another line's.
 *  A posable part's pieces are read limb by limb (SEE: readPose), and the placement
 *  takes the pose and legs color they show, its level raised by the pose's lift.
 *  Returns each placement's piece lines, in order, and whether a piece went undecided:
 *  more lines lay where it goes than MAX_NEAR_LINES, so which is its own is not told.
 *  The arrays of placements and other parts are changed in place */
const absorbPieces = (placements: Placement[], others: OtherPart[], otherSpans: Span[], otherSteps: number[], owners?: Readonly<{ placements: ReadonlyArray<number | undefined>; others: Array<number | undefined>; }>): Readonly<{ pieceSpans: Span[][]; undecided: boolean; }> => {
  // the other parts not yet taken, by owner, file, color and whole LDU, each bucket a
  // list in text order a taken line leaves: a piece looks only in the buckets its
  // tolerance reaches (at most two per axis), and every line it looks at counts
  const near = new Map<string, Untaken>();
  others.forEach((other, index) => {
    const key = nearKey(other, owners?.others[index], other.position.map(Math.round));
    if(!near.has(key)) near.set(key, untakenList());
    near.get(key)!.push(index);
  });
  const taken = new Set<number>();
  let undecided = false;
  /** the first line in the text that is the piece, or undefined when none is or the
   *  look ran out (`undecided`) */
  const take = (piece: PartLine, owner: number | undefined): number | undefined => {
    let looked = 0;
    let found: Readonly<{ index: number; bucket: Untaken; }> | undefined;
    for(const key of nearKeys(piece, owner)) {
      const bucket = near.get(key);
      for(const index of bucket?.lines() ?? []) {
        if(found && (index > found.index)) break/*a later line than the one found*/;
        if(++looked > MAX_NEAR_LINES) { undecided = true; return undefined; }
        if(sameLine(others[index], piece)) { found = { index, bucket: bucket! }; break; }
      }
    }
    if(found) found.bucket.remove(found.index);
    return found?.index;
  };
  const pieceSpans = placements.map((placement, placementIndex) => {
    const part = getPart(placement.part)!/*by contract*/;
    if(!part.pieces) return [];
    if(part.limbs) {
      const { posed, indices } = readPose(part, placement, piece => take(piece, owners?.placements[placementIndex]));
      placements[placementIndex] = posed;
      indices.forEach(index => taken.add(index));
      return indices.map(index => otherSpans[index]);
    }
    if(part.hinge) {
      const { hinged, indices } = readHinge(part, placement, piece => take(piece, owners?.placements[placementIndex]));
      placements[placementIndex] = hinged;
      indices.forEach(index => taken.add(index));
      return indices.map(index => otherSpans[index]);
    } /* else -- its pieces where it puts them */
    const [, ...pieces] = placedLines(getShape(part), placement, getColor(placement.color)!.code/*by contract*/);
    return pieces.flatMap(piece => {
      const index = take(piece, owners?.placements[placementIndex]);
      if(index === undefined) return []/*missing: written whole again*/;
      taken.add(index);
      return [otherSpans[index]];
    });
  });

  const removeTaken = <T,>(array: T[]): void => { array.splice(0, array.length, ...array.filter((_, index) => !taken.has(index))); };
  removeTaken(others); removeTaken(otherSpans); removeTaken(otherSteps);
  if(owners) removeTaken(owners.others);
  return { pieceSpans, undecided };
};

/** a posable part's pose read from its pieces (SEE: pose.ts): the hips in whichever
 *  catalog color they are (the legs color), then each limb's pivot piece at each angle a
 *  limb takes and the rest of the limb at the angle found, then what it wears and
 *  holds, every look bounded as any piece's (SEE: absorbPieces). A piece not found
 *  leaves its limb at 0 and is written again whole; an accessory not found is no
 *  accessory. Returns the placement, posed, its level raised by the pose's lift (it
 *  was read where the part would stand), and the lines taken, in piece order */
const readPose = (part: CatalogPart, placement: Placement, take: (piece: PartLine) => number | undefined): Readonly<{ posed: Placement; indices: number[]; }> => {
  const colorCode = getColor(placement.color)!.code/*by contract*/;
  const [own] = placedLines(getShape(part), placement, colorCode)/*where it stands*/;
  const lines = pieceLines(part);
  const found = new Map<number/*piece*/, number/*other part*/>();
  const placedPiece = (piece: PartLine, code: number): PartLine => pieceAt(own, piece, code);
  const limbed = new Set(LIMBS.flatMap(limb => part.limbs![limb].pieces));

  // the legs color: the color the hips (a legs piece no limb moves) are found in
  let legsCode: number | undefined;
  for(const index of (part.legs ?? []).filter(index => !limbed.has(index))) {
    for(const color of [lines[index].colorCode, ...COLORS.map(each => each.code).filter(code => code !== lines[index].colorCode)]) {
      const line = take(placedPiece(lines[index], color));
      if(line === undefined) continue;
      found.set(index, line);
      legsCode ??= color;
      break;
    }
  }
  const legs = new Set(part.legs ?? []);
  const codeOf = (index: number): number => (legs.has(index) && (legsCode !== undefined)) ? legsCode : lines[index].colorCode;

  // each limb: its pivot at each angle, then the rest at the angle found (at 0 when
  // its pivot is found at none, each piece then taken alone as any part's). A pivot
  // that is the face piece is looked for wearing each face, the default first
  const pose: Partial<Record<typeof LIMBS[number], number>> = {};
  let face: FigureFace | undefined;
  for(const limb of LIMBS) {
    const { pieces } = part.limbs![limb];
    const faces = (pieces[0] === part.facePiece) ? FIGURE_FACES : [undefined/*no face to wear*/];
    const angle = [0, ...POSE_ANGLES.filter(each => each !== 0)].find(each => faces.some(worn => {
      const pivot = take(placedPiece(limbLines(part, limb, each, worn)[0], codeOf(pieces[0])));
      if(pivot === undefined) return false;
      found.set(pieces[0], pivot);
      if(pieces[0] === part.facePiece) face = worn;
      return true;
    }));
    if(angle !== undefined) pose[limb] = angle;
    const limbPieces = limbLines(part, limb, angle ?? 0, face);
    pieces.slice(1).forEach((index, order) => {
      const line = take(placedPiece(limbPieces[order + 1], codeOf(index)));
      if(line !== undefined) found.set(index, line);
    });
  }

  const normalized = normalizePose(pose);
  const legColor = ((legsCode === undefined) || (legsCode === lines[(part.legs ?? [])[0]]?.colorCode)) ? undefined : getColorByCode(legsCode)?.key;

  // what it wears: each slot's accessories of its kind, by each of their grips, in
  // any catalog color, where the posed piece carrying the slot puts them
  const carriers = posedPieces(part, normalized);
  const gear: Partial<Record<typeof SLOTS_IN_ORDER[number], Gear>> = {};
  SLOTS_IN_ORDER.forEach((slot, order) => {
    const carrier = carriers[part.slots![slot].piece];
    for(const accessory of ACCESSORIES.filter(each => each.on === ((slot === 'hat') ? 'head' : 'hand'))) {
      for(const [index, grip] of (accessory.grips ?? [undefined]).entries()) {
        for(const color of COLORS) {
          const line = take(placedPiece(accessoryLine(part, slot, carrier, accessory, grip, color.code), color.code));
          if(line === undefined) continue;
          found.set(lines.length + order, line);
          gear[slot] = { part: accessory.key, color: color.key, ...((grip && (index > 0)) ? { grip: grip.name } : {}) };
          return;
        }
      }
    }
  });

  const worn = ((face !== undefined) && (face.key !== DEFAULT_FIGURE_FACE)) ? { face: face.key } : {}/*the default is the head as the part writes it*/;
  const posed: Placement = { ...placement, level: placement.level + poseLift(part, { pose: normalized }), ...(normalized ? { pose: normalized as Pose } : {}), ...(legColor ? { legColor } : {}), ...worn, ...gear };
  return { posed, indices: [...found.keys()].sort((a, b) => a - b).map(index => found.get(index)!) };
};

/** a hinge's angle read from its pieces: its top at each angle a hinge takes, then its
 *  other pieces where that angle puts them, every look bounded as any piece's (SEE:
 *  absorbPieces). A top found at none leaves the hinge at 0, its top written again
 *  whole. Returns the placement at its angle and the lines taken, in piece order */
const readHinge = (part: CatalogPart, placement: Placement, take: (piece: PartLine) => number | undefined): Readonly<{ hinged: Placement; indices: number[]; }> => {
  const [own] = placedLines(getShape(part), placement, getColor(placement.color)!.code/*by contract*/)/*at 0*/;
  const { piece: top } = part.hinge!/*by contract*/;
  const found = new Map<number/*piece*/, number/*other part*/>();
  const angle = [0, ...POSE_ANGLES.filter(each => each !== 0)].find(each => {
    const line = take(pieceAt(own, hingePieces(part, each)[top]));
    if(line !== undefined) found.set(top, line);
    return line !== undefined;
  }) ?? 0;
  hingePieces(part, angle).forEach((piece, index) => {
    if(index === top) return;
    const line = take(pieceAt(own, piece));
    if(line !== undefined) found.set(index, line);
  });
  return { hinged: { ...placement, ...((angle !== 0) ? { angle } : {}) }, indices: [...found.keys()].sort((a, b) => a - b).map(index => found.get(index)!) };
};

/** a piece's line where its part's own line (`own`) puts it, in `code` (the part's
 *  color when the piece takes LDraw's inherited color) */
const pieceAt = (own: PartLine, piece: PartLine, code: number = piece.colorCode): PartLine =>
  ({ ...piece, ...compose(own, piece), colorCode: (piece.colorCode === INHERITED_COLOR) ? own.colorCode : code });

/** keeps the entries of each of `arrays` (parallel arrays, changed in place) whose
 *  index `kept` marks */
const keepWhere = (kept: ReadonlyArray<boolean>, ...arrays: unknown[][]): void => {
  for(const array of arrays) array.splice(0, array.length, ...array.filter((_, index) => kept[index]));
};

/** the index of the first span starting at or after `offset` in spans in text order
 *  (their length when none does) */
const firstFrom = (spans: ReadonlyArray<Span>, offset: number): number => {
  let [low, high] = [0, spans.length];
  while(low < high) {
    const middle = (low + high) >> 1;
    if(spans[middle].from < offset) low = middle + 1; else high = middle;
  }
  return low;
};

/** a bucket's lines not yet taken, in text order: a removed line is never visited
 *  again */
type Untaken = Readonly<{ push: (index: number) => void; lines: () => Iterable<number>; remove: (index: number) => void; }>;
const untakenList = (): Untaken => {
  const next = new Map<number, number | undefined>(), previous = new Map<number, number | undefined>();
  let first: number | undefined, last: number | undefined;
  return {
    push: index => {
      next.set(index, undefined); previous.set(index, last);
      if(last === undefined) first = index; else next.set(last, index);
      last = index;
    },
    lines: function* () { for(let index=first; index!==undefined; index=next.get(index)) yield index; },
    remove: index => {
      const [before, after] = [previous.get(index), next.get(index)];
      if(before === undefined) first = after; else next.set(before, after);
      if(after === undefined) last = before; else previous.set(after, before);
      next.delete(index); previous.delete(index);
    },
  };
};

/** a part line's bucket for `absorbPieces`: its owner, file and color at a position
 *  in whole LDU */
const nearKey = (line: PartLine, owner: number | undefined, position: ReadonlyArray<number>): string =>
  `${owner ?? 'own'}|${line.ldraw.toLowerCase()}|${line.colorCode}|${position.join(',')}`;

/** the buckets a line within LINE_TOLERANCE of a piece lies in: each axis rounds one
 *  of at most two ways */
const nearKeys = (piece: PartLine, owner: number | undefined): string[] =>
  piece.position.reduce<number[][]>((positions, value) => {
    const ways = [...new Set([Math.round(value - LINE_TOLERANCE), Math.round(value + LINE_TOLERANCE)])];
    return positions.flatMap(position => ways.map(way => [...position, way]));
  }, [[]]).map(position => nearKey(piece, owner, position));

/** whether two part lines are the same file, color and transform, within LDraw's
 *  rounding */
const sameLine = (a: PartLine, b: PartLine): boolean =>
  (a.ldraw.toLowerCase() === b.ldraw.toLowerCase()) && (a.colorCode === b.colorCode) &&
  a.position.every((value, index) => Math.abs(value - b.position[index]) < LINE_TOLERANCE) &&
  a.matrix.every((value, index) => Math.abs(value - b.matrix[index]) < MATRIX_TOLERANCE);

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
/** how many parts a build holds: its own, its copies' and its carriers' mounts', on
 *  the grid or off */
export const partCount = (model: Model): number => model.placements.length + model.others.length +
  model.placements.flatMap(mountsOf).reduce((total, mount) => total + carriedPartCount(mountedComponent(model, mount)), 0);
const carriedPartCount = (component: Component): number => component.placements.length + component.others.length;

/** how many copies of a component a build places: on the grid, and carried by its
 *  carriers */
export const copiesOf = (model: Model, name: string): number =>
  (model.copies ?? []).filter(copy => copy.component === name).length + model.placements.flatMap(mountsOf).filter(mount => mount.copy.component === name).length;

/** the component a mount carries: defined, with parts on the grid (a reader takes no
 *  other line as a mount) */
export const mountedComponent = (model: Model, mount: Mount): Component & Readonly<{ footprint: Footprint; }> =>
  model.components!.find(component => component.name === mount.copy.component) as Component & Readonly<{ footprint: Footprint; }>/*by contract*/;

/** a placement carrying one more mount: a hinge's carry, or a face's */
const withMount = (placement: Placement, { slot, copy }: Mount): Placement => {
  if(slot === 'top') return { ...placement, carry: copy };
  const { component, x, z, rotation } = copy;
  return { ...placement, sides: { ...placement.sides, [slot]: { component, x, z, rotation } } };
};

/** the lines a placement is drawn as: its own and its pieces' (SEE: grid.ts
 *  placedLines, a wheel set's wheels turned as having rolled `rolled` studs), then its
 *  mounts' (SEE: grid.ts carriedLines) */
export const drawnLines = (model: Model, placement: Placement, rolled = 0): PartLine[] => {
  const shape = getShape(getPart(placement.part)!/*by contract*/);
  const own = placedLines(shape, placement, getColor(placement.color)!.code/*by contract*/, rolled);
  return [...own, ...mountsOf(placement).flatMap(mount => carriedLines(shape, placement, mount, mountedComponent(model, mount)))];
};
/** whether LDraw text holds a part (a build, not comments alone or nothing) */
export const holdsParts = (text: string): boolean => partCount(parseModel(text)) > 0;

/** how many building steps a build has (none when it has no parts) */
export const stepCount = (model: Model): number => model.steps?.count ?? ((partCount(model) > 0) ? 1 : 0);

/** the build as it stands after a step: its parts in that step and before */
export const upToStep = (model: Model, step: number): Model => {
  const steps = model.steps;
  if(!steps) return model/*one step*/;
  return {
    ...model,
    placements: model.placements.filter((_, index) => steps.placements[index] <= step),
    others: model.others.filter((_, index) => steps.others[index] <= step),
    steps: undefined, layout: undefined, copies: undefined, placementCopies: undefined, placed: undefined, placementPlaced: undefined, otherPlaced: undefined/*a view, never edited*/,
  };
};

/** the model without some of its parts (indices into `placements` and `others`): a
 *  view, never edited */
export const withoutParts = (model: Model, placements: ReadonlySet<number>, others: ReadonlySet<number>): Model => ({
  ...model,
  placements: model.placements.filter((_, index) => !placements.has(index)),
  others: model.others.filter((_, index) => !others.has(index)),
  steps: undefined, layout: undefined, copies: undefined, placementCopies: undefined, placed: undefined, placementPlaced: undefined, otherPlaced: undefined,
});

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

  const shape = getShape(part);
  const position = gridPosition(shape, rotation, transform.position);
  if(!position) return undefined;
  const placement: Placement = { part: part.key, color: color.key, rotation, ...position };
  return onSafeGrid(shape, placement) ? placement : undefined/*off the grid's safe numbers: an unchecked part*/;
};

const normalizeName = (name: string): string => name.trim().replace(/\\/g, '/').toLowerCase();

// == Serialize ===================================================================
/** writes a Model whole as one main-model section (`0 FILE model.ldr` through its end
 *  marker), its steps apart by `0 STEP` lines: every part, a hinge's carry's as the
 *  lines it draws (flat, no longer a carry); the data it carries after it */
export const serializeModel = (model: Model): string => {
  const steps = model.steps;
  const lines = [`0 FILE ${MAIN_FILE}`, ...model.header];
  for(let step=1; step<=(steps?.count ?? 1); step++) {
    if(step > 1) lines.push(STEP_LINE);
    lines.push(...model.placements.filter((_, index) => (steps?.placements[index] ?? 1) === step).flatMap(placement => drawnLines(model, placement).map(line => partLine(line.colorCode, line.position, line.matrix, line.ldraw))));
    lines.push(...model.others.filter((_, index) => (steps?.others[index] ?? 1) === step).map(other => partLine(other.colorCode, other.position, other.matrix, other.ldraw)));
  }
  lines.push(END_MARKER, ...(model.data ?? []));
  return lines.join('\n') + '\n';
};

/** the LDraw lines of a Placement: its own, then its pieces' (its part and color
 *  are catalog entries by contract) */
export const placementLines = (placement: Placement): string[] => {
  const part = getPart(placement.part)!/*by contract*/;
  const color = getColor(placement.color)!/*by contract*/;
  return placedLines(getShape(part), placement, color.code).map(line => partLine(line.colorCode, line.position, line.matrix, line.ldraw));
};

/** a copy's LDraw line: its component's file as its section names it, in LDraw's
 *  inherited color so each part keeps its own */
export const copyLine = (component: Readonly<{ file: string; footprint: Footprint; }>, copy: Copy): string =>
  referenceLine(component.file, copyTransform(component.footprint, copy));

/** a mount as its line, written right after its carrier's own lines in slot order:
 *  its component's file where its slot puts the copy (SEE: grid.ts mountTransform),
 *  in LDraw's inherited color */
export const mountLine = (component: Readonly<{ file: string; footprint: Footprint; }>, placement: Placement, mount: Mount): string =>
  referenceLine(component.file, mountTransform(getShape(getPart(placement.part)!/*by contract*/), placement, mount, component.footprint));

const referenceLine = (file: string, { position, matrix }: Transform): string =>
  ['1', 16, ...position, ...matrix].map(formatNumber).join(' ') + ` ${file}`;

// == Line Edits ==================================================================
/** the edit that adds part and copy lines to a model: to its last step, or as a new
 *  step after it (`newStep`, for a build that has parts), before its end marker. An
 *  empty text gains the header first, flat: two first parts added at once then both
 *  stand, each with the header (a comment written twice), where a main model's file
 *  line written twice would leave neither editable */
export const appendLines = (layout: ModelLayout, lines: ReadonlyArray<string>, newStep: boolean): ContentChange => {
  const { lineBreak, length } = layout.file;
  const hasParts = layout.parts.length > 0;
  if(!newStep && layout.trailingStep) {
    const at = layout.trailingStep.from/*before the steps the model ends in*/;
    return { from: at, to: at, insert: lines.map(line => line + lineBreak).join('') };
  } /* else -- the lines go at the model's end */
  const opening = (length < 1) ? DEFAULT_HEADER : (newStep && hasParts && !layout.trailingStep) ? [STEP_LINE] : [];
  const lead = ((length < 1) || layout.endsLine) ? '' : lineBreak/*the last line is unfinished*/;
  return { from: layout.end, to: layout.end, insert: lead + [...opening, ...lines].map(line => line + lineBreak).join('') };
};

/** the edits that define a component, or replace its definition (every section of
 *  its name, the first rewritten and the rest removed): its section holds its name and
 *  its parts' lines */
export const defineEdits = (file: FileLayout, name: string, lines: ReadonlyArray<string>): ContentChange[] => {
  const existing = file.components.find(component => component.name === name);
  const section = sectionText(file, [`0 FILE ${existing?.file ?? newFileName(name)}`, `0 ${name}`, ...lines]);
  if(existing) return [...deleteLines(existing.repeats)/*after the first: removed first*/, { ...existing.span, insert: section }];
  return newSectionEdits(file, section);
};

/** the edits that add a section to the text: at its files' end, before the data that
 *  closes it. A flat text becomes an MPD file first, its main model named model.ldr
 *  and ended by the end marker */
const newSectionEdits = (file: FileLayout, section: string): ContentChange[] => {
  const at = file.filesEnd;
  const lead = ((file.length < 1) || (at < file.length) || file.endsWithBreak) ? '' : file.lineBreak/*the last line is unfinished*/;
  const marker = file.endMarker ? '' : END_MARKER + file.lineBreak;
  const end: ContentChange = { from: at, to: at, insert: lead + ((file.mainFile && !file.endMarker) ? ''/*an MPD file of the previous release: its sections already part the two*/ : marker) + section };
  if(file.mainFile) return [end];
  const opening = sectionText(file, [`0 FILE ${MAIN_FILE}`, ...((file.length < 1) ? DEFAULT_HEADER : [])]);
  return [end, { from: 0, to: 0, insert: opening }]/*the end first: each edit is measured after the ones before it*/;
};

/** lines as a text writes them, each ended by its line break */
const sectionText = (file: FileLayout, lines: ReadonlyArray<string>): string => lines.map(line => line + file.lineBreak).join('');

// .. Sets ........................................................................
/** the edits that add a set named `name`: its section, holding its name line and
 *  `lines` (another set's, for a copy of it), goes at the files' end in a file of its
 *  own (SEE: setFileName) */
export const addSetEdits = (file: FileLayout, name: string, lines: ReadonlyArray<string>): ContentChange[] =>
  newSectionEdits(file, sectionText(file, [`0 FILE ${setFileName(file, name)}`, `${SET_LINE} ${name}`, ...lines]));

/** a set's lines that a copy of it takes, as written and in order: its ground, its
 *  part and copy lines and its steps (its header comments and name line left) */
export const setLines = (text: string, layout: ModelLayout): string[] =>
  [...(layout.ground ? [layout.ground] : []), ...layout.parts, ...layout.steps].sort((a, b) => a.from - b.from).map(({ from, to }) => text.slice(from, to).replace(/[\r\n]+$/, ''));

/** the edits that rename a set: its name line rewritten, or one written for a main
 *  model that names none (after its `0 FILE` line, else before a flat file's first
 *  part or step, else at its end). An empty text, which holds no section, gains the
 *  header first (SEE: appendLines) */
export const renameSetEdits = (layout: ModelLayout, set: SetSection | undefined, name: string): ContentChange[] => {
  const { file } = layout;
  const line = `${SET_LINE} ${name}`;
  if(!set) return [{ from: 0, to: 0, insert: sectionText(file, [...DEFAULT_HEADER, line]) }]/*an empty text*/;
  if(set.nameLine) {
    const ending = ((set.nameLine.to < file.length) || file.endsWithBreak) ? file.lineBreak : ''/*the last line, unfinished*/;
    return [{ ...set.nameLine, insert: line + ending }];
  } /* else -- the main model, unnamed */
  if(set.start) return [{ from: set.start.to, to: set.start.to, insert: line + file.lineBreak }];
  const first = minOf([...layout.parts, ...layout.steps].map(span => span.from));
  if(Number.isFinite(first)) return [{ from: first, to: first, insert: line + file.lineBreak }];
  const lead = layout.endsLine ? '' : file.lineBreak/*the last line is unfinished*/;
  return [{ from: layout.end, to: layout.end, insert: lead + line + file.lineBreak }];
};

/** the edits that remove a set and every line of its sections (a data section within
 *  kept where it stands). The main set removed, the next set becomes the main model:
 *  its lines (its name line among them) take the main model's place, after its `0
 *  FILE` line and before its end marker */
export const removeSetEdits = (text: string, file: FileLayout, set: SetSection): ContentChange[] => {
  if(set.file !== file.sets[0]?.file) return deleteLines(set.pieces);
  const next = file.sets[1]!/*by contract: a build keeps its last set*/;
  const start = set.start!/*by contract: a build of two sets is an MPD file*/;
  const [first, ...rest] = next.pieces;
  const moved = [text.slice(next.start!.to, first.to), ...rest.map(({ from, to }) => text.slice(from, to))].join('');
  const ended = (moved.length < 1) || /[\r\n]$/.test(moved) ? moved : (moved + file.lineBreak);
  const own = set.pieces.map((piece, index) => (index === 0) ? { from: start.to, to: piece.to } : piece)/*its file line kept*/;
  return [...deleteLines([...own, ...next.pieces]), { from: start.to, to: start.to, insert: ended + END_MARKER + file.lineBreak }];
};

/** the edits that empty a set: its part, copy and step lines removed, its name,
 *  ground and other lines kept */
export const clearSetEdits = (layout: ModelLayout): ContentChange[] => deleteLines([...layout.parts, ...layout.steps]);

/** the file a set Brick Studio adds is written to: its name in lower case, every
 *  other character a dash, then SET_FILE; numbered when a section has it */
const setFileName = (file: FileLayout, name: string): string => {
  const taken = new Set([...file.sets.map(set => set.file), ...file.components.map(component => component.file)]);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'set';
  let candidate = `${base}${SET_FILE}`;
  for(let count=2; taken.has(candidate); count++) candidate = `${base}-${count}${SET_FILE}`;
  return candidate;
};

// ................................................................................
/** the edits that remove every part, copy, further set, component and data section,
 *  keeping the main model's other lines (its header, its name, the ground): the build
 *  is left as Brick Studio writes one whole, its main model's file line first and its
 *  end marker last. An empty text stays empty */
export const clearEdits = (layout: ModelLayout): ContentChange[] => {
  const { file } = layout;
  if(file.length < 1) return [];
  const removed = [...layout.parts, ...layout.steps, ...file.sets.slice(1).flatMap(set => set.pieces), ...file.components.flatMap(({ span, repeats }) => [span, ...repeats]), ...file.data];
  // the main model's end, after the lines before it are removed
  const end = layout.end - removed.filter(span => span.to <= layout.end).reduce((total, span) => total + (span.to - span.from), 0);
  const lead = layout.endsLine ? '' : file.lineBreak/*the last line is unfinished*/;
  return [
    ...deleteLines(removed),
    ...(file.endMarker ? [] : [{ from: end, to: end, insert: lead + END_MARKER + file.lineBreak }]),
    ...(file.mainFile ? [] : [{ from: 0, to: 0, insert: `0 FILE ${MAIN_FILE}` + file.lineBreak }]),
  ];
};

/** the edit that sets a model's ground color, or returns it to the theme's
 *  (`undefined`): the ground line is replaced or removed, or a new one goes before the
 *  first part. An empty text gains the header first */
export const groundEdit = (layout: ModelLayout, color: string | undefined): ContentChange[] => {
  const { file } = layout;
  const line = (color === undefined) ? undefined : [...GROUND_META, color].join(' ');
  if(layout.ground) {
    const ending = ((layout.ground.to < file.length) || file.endsWithBreak) ? file.lineBreak : ''/*the last line, unfinished*/;
    return [{ ...layout.ground, insert: (line === undefined) ? '' : line + ending }];
  } /* else -- no ground line yet */
  if(line === undefined) return []/*already the theme's*/;
  if(file.length < 1) return [{ from: 0, to: 0, insert: sectionText(file, [...DEFAULT_HEADER, line]) }]/*flat, as an empty build's first part (SEE: appendLines)*/;
  const first = minOf([...layout.parts, ...layout.steps].map(span => span.from));
  if(Number.isFinite(first)) return [{ from: first, to: first, insert: line + file.lineBreak }];
  const lead = layout.endsLine ? '' : file.lineBreak/*the last line is unfinished*/;
  return [{ from: layout.end, to: layout.end, insert: lead + line + file.lineBreak }];
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

/** a number as a line writes it: to three decimals, or exactly as it is where
 *  rounding to three decimals cannot change it (a whole number, or one too large for
 *  thousandths to count) */
const formatNumber = (value: number | string): string => {
  if(typeof value === 'string') return value;
  if(Number.isInteger(value) || (Math.abs(value) >= ROUNDED_BELOW)) return Object.is(value, -0) ? '0' : String(value);
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
