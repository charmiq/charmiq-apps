import type { ContentChange } from '../../../shared/charmiq';
import { ACCESSORIES, COLORS, type CatalogPart } from './catalog';
import { carriedLines, compose, copyPosition, copyTransform, footprintOf, getColor, getColorByCode, getPart, getPartByLDraw, getShape, gridPosition, matrixRotation, mountedCopy, mountsOf, mountSlots, mountTransform, onSafeGrid, placedLines, poseLift, INHERITED_COLOR, type Copy, type Footprint, type Gear, type Mount, type PartLine, type Placement, type Transform } from './grid';
import { maxOf, minOf } from './numbers';
import { accessoryLine, hingePieces, limbLines, normalizePose, pieceLines, posedPieces, LIMBS, POSE_ANGLES, SLOTS_IN_ORDER, type Pose } from './pose';

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
  /** the `0 NOFILE` line ending the main model, when it has one: parts go before it,
   *  components after it */
  endMarker?: Span;
  /** each component's section, and the later sections of the same name (`repeats`) */
  components: ReadonlyArray<Readonly<{ name: string; file: string; span: Span; repeats: ReadonlyArray<Span>; }>>;
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
 *  one on the grid, or `carried` when a hinge carries it (its parts are then the
 *  carry's). The line owns every part it places, a copy or not */
export type Placed = Readonly<{ component: string; colorCode: number; copy?: number; carried?: true; }>;

/** a component: its section's file as written (the name and `.ldr`, `.dat`, `.mpd`
 *  or nothing), its parts in its own grid and the cells they cover */
export type Component = Readonly<{ name: string; file: string; placements: ReadonlyArray<Placement>; others: ReadonlyArray<OtherPart>/*part lines off its grid*/; footprint?: Footprint; }>;

// ................................................................................
export type Model = Readonly<{
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
  /** the building steps, when the build has more than one */
  steps?: ModelSteps;
}>;

// == Constants ===================================================================
/** the most parts a build holds */
export const MAX_PARTS = 3000;
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
} as const;

/** why no text is written from a model besides an untold piece, model-facing */
const UNWRITABLE = {
  mainTwice: 'its main model is named twice. Give LDraw that names it once',
  overflows: 'a part\'s numbers overflow once its submodels are placed, so it cannot be written flat. Give it back as written (getModel) or remove that part',
} as const;

/** why a truncated model was read only in part, model-facing */
export const READ_IN_PART = `Its submodels expand past what Brick Studio reads (${MAX_PARTS} parts, ${MAX_PARTS} submodel references or ${MAX_EXPANDED_LINES} submodel lines), so it was read only in part.`;

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
/** Brick Studio's meta-command naming the baseplate's color */
const GROUND_META = ['0', '!BRICKSTUDIO', 'GROUND'] as const;

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
/** parses LDraw text (LDR or MPD) into a Model. Submodels are flattened; LDraw's
 *  inherited colors (16, 24) take the parent's color */
export const parseModel = (text: string): Model => {
  const lines = splitLines(text);

  // split into files: a plain LDR is one unnamed file. Blank lines before the first
  // file belong to none. A name used twice is read from its first section; the
  // file can then not be edited line by line. The lines of the files after the
  // main model (the component definitions) are counted toward the submodel budget
  const files = new Map<string, Line[]>();
  const sectionStarts: Array<Readonly<{ name: string; from: number; to: number; }>> = []/*every `0 FILE` line, in order*/;
  let current: Line[] = [];
  let main: string | undefined;
  let repeated = false;
  let mainTwice = false;
  let endMarker: Span | undefined;
  let definitionLines = 0;
  for(const line of lines) {
    const trimmed = line.text.trim();
    if(trimmed.startsWith('0 FILE ')) {
      const name = normalizeName(trimmed.slice(7));
      current = [];
      if(files.has(name)) mainTwice ||= (name === main)/*its lines are read from its first section*/;
      else files.set(name, current);
      sectionStarts.push({ name, from: line.from, to: line.to });
      main ??= name;
      continue;
    } /* else -- a line of the current file */
    if((main !== undefined) && (current !== files.get(main))) definitionLines++;
    if(main === undefined) {
      if(trimmed.length < 1) continue/*before any file*/;
      main = ''; files.set(main, current);
    } /* else -- in a file */
    if(trimmed.toUpperCase() === END_MARKER) {
      // the end of the file it is in. The main model's: lines after it (a page of
      // the previous release put parts there) are still the main model's. A
      // component's: lines after it, up to the next file, are in none
      if(current === files.get(main)) endMarker ??= { from: line.from, to: line.to };
      else current = []/*in no file*/;
      continue;
    } /* else -- a line of the file */
    current.push(line);
  }
  if(main === undefined) return { ...EMPTY_MODEL, layout: { placements: [], others: [], pieces: [], placed: [], mainParts: [], steps: [], components: [], mainEnd: 0, mainEndsWithBreak: false, length: 0, lineBreak: '\n', endsWithBreak: false } }/*empty text*/;

  // each file but the main model is a component: its parts in its own grid. Past
  // the submodel budget none is read: the model is then read only in part
  const tooManyDefinitionLines = definitionLines > MAX_EXPANDED_LINES;
  const components = tooManyDefinitionLines ? [] : [...files].filter(([name]) => name !== main).map(([name, componentLines]) => readComponent(name, componentLines, files));
  const componentsByFile = new Map(components.map(component => [component.file, component]));
  let nested = components.some(component => component.nested);
  // a name two files share (`bare` and `bare.ldr`) names neither for an edit; a file
  // defined twice (one name defined by two people at once) is read from its first
  // definition and named
  const names = new Set(components.map(component => component.name));
  if(names.size < components.length) repeated = true;
  const sectionsOf = new Map<string, number>();
  for(const { name } of sectionStarts) sectionsOf.set(name, (sectionsOf.get(name) ?? 0) + 1);
  const duplicated = components.filter(component => (sectionsOf.get(component.file) ?? 0) > 1).map(component => component.name);

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
    for(let next = firstFrom(mainParts, maxOf([placementSpans[index], ...pieceSpans[index]].map(span => span.to))); open.size > 0; next++) {
      const span = mainParts[next];
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
  truncated ||= tooManyDefinitionLines/*the main model read, its components not*/;
  const flat = (files.size === 1) && (main === '')/*no `0 FILE` section: each part is its own line*/;
  // why line edits cannot apply, when they cannot: the first reason found
  const untold = undecided || components.some(component => component.undecided);
  const overflows = others.some(other => ![...other.position, ...other.matrix].every(Number.isFinite))/*placed through submodels whose transforms overflow*/;
  const uneditable = mainTwice ? UNEDITABLE.mainTwice : ((main === '') && !flat) ? UNEDITABLE.unsectioned : nested ? UNEDITABLE.nested : repeated ? UNEDITABLE.repeated
    : untold ? UNEDITABLE.undecided : undefined;
  const lineBreak = lines.find(line => line.lineBreak)?.lineBreak ?? '\n';
  const endsWithBreak = /[\r\n]$/.test(text);
  const spans = sectionSpans(sectionStarts, text.length);
  const sections = components.map(({ name, file }) => { const [span, ...repeats] = spans.get(file)!/*each component is a file's*/; return { name, file, span, repeats }; });
  const mainEnd = minOf([...sections.flatMap(({ span, repeats }) => [span, ...repeats]).map(span => span.from), ...(endMarker ? [endMarker.from] : [])], text.length);
  const lastPart = maxOf(mainParts.map(span => span.to), 0);
  const trailingStep = (mainParts.length > 0) ? stepSpans.find(span => span.from >= lastPart) : undefined;
  const mainFile: Span | undefined = (main !== '') ? { from: sectionStarts[0].from, to: sectionStarts[0].to }/*the first section is the main model's*/ : undefined;
  const steps = numberSteps(placementSteps, otherSteps, copySteps);
  return {
    header: (header.length > 0) ? header : DEFAULT_HEADER, placements, others,
    ...(truncated ? { truncated } : {}),
    ...(ground ? { ground: ground.color } : {}),
    ...((components.length > 0) ? { components: components.map(({ nested: _, undecided: __, ...component }) => component) } : {}),
    ...((copies.length > 0) ? { copies, placementCopies } : {}),
    ...((placed.length > 0) ? { placed, placementPlaced } : {}),
    ...(untold ? { untold: UNEDITABLE.undecided } : {}),
    ...((untold || overflows || mainTwice) ? { unwritable: mainTwice ? UNWRITABLE.mainTwice : untold ? UNEDITABLE.undecided : UNWRITABLE.overflows } : {}),
    ...((duplicated.length > 0) ? { duplicated } : {}),
    ...(uneditable ? { uneditable } : { layout: {
      placements: placementSpans, others: otherSpans, pieces: pieceSpans, placed: placedSpans, mainParts, steps: stepSpans,
      ...(ground ? { ground: ground.span } : {}), ...(trailingStep ? { trailingStep } : {}),
      ...(mainFile ? { mainFile } : {}), ...(endMarker ? { endMarker } : {}), components: sections,
      mainEnd, mainEndsWithBreak: (mainEnd < text.length) || endsWithBreak,
      length: text.length, lineBreak, endsWithBreak,
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

/** each named file's sections, in one pass, in order: from a `0 FILE` line up to the
 *  next `0 FILE` line, or the text's end */
const sectionSpans = (starts: ReadonlyArray<Readonly<{ name: string; from: number; }>>, length: number): Map<string, Span[]> => {
  const spans = new Map<string, Span[]>();
  starts.forEach(({ name, from }, index) => {
    if(!spans.has(name)) spans.set(name, []);
    spans.get(name)!.push({ from, to: starts[index + 1]?.from ?? length });
  });
  return spans;
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
  // its pivot is found at none, each piece then taken alone as any part's)
  const pose: Partial<Record<typeof LIMBS[number], number>> = {};
  for(const limb of LIMBS) {
    const { pieces } = part.limbs![limb];
    const angle = [0, ...POSE_ANGLES.filter(each => each !== 0)].find(each => {
      const pivot = take(placedPiece(limbLines(part, limb, each)[0], codeOf(pieces[0])));
      if(pivot !== undefined) found.set(pieces[0], pivot);
      return pivot !== undefined;
    });
    if(angle !== undefined) pose[limb] = angle;
    const limbPieces = limbLines(part, limb, angle ?? 0);
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

  const posed: Placement = { ...placement, level: placement.level + poseLift(part, { pose: normalized }), ...(normalized ? { pose: normalized as Pose } : {}), ...(legColor ? { legColor } : {}), ...gear };
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
 *  lines it draws (flat, no longer a carry) */
export const serializeModel = (model: Model): string => {
  const steps = model.steps;
  const lines = [`0 FILE ${MAIN_FILE}`, ...model.header];
  for(let step=1; step<=(steps?.count ?? 1); step++) {
    if(step > 1) lines.push(STEP_LINE);
    lines.push(...model.placements.filter((_, index) => (steps?.placements[index] ?? 1) === step).flatMap(placement => drawnLines(model, placement).map(line => partLine(line.colorCode, line.position, line.matrix, line.ldraw))));
    lines.push(...model.others.filter((_, index) => (steps?.others[index] ?? 1) === step).map(other => partLine(other.colorCode, other.position, other.matrix, other.ldraw)));
  }
  lines.push(END_MARKER);
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
/** the edit that adds part and copy lines to the main model: to its last step, or
 *  as a new step after it (`newStep`, for a build that has parts), before its end
 *  marker. An empty text gains the header first, flat: two first parts added at once
 *  then both stand, each with the header (a comment written twice), where a main
 *  model's file line written twice would leave neither editable */
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

/** the edits that define a component, or replace its definition (every section of
 *  its name, the first rewritten and the rest removed): its section holds its name and
 *  its parts' lines. A flat text becomes an MPD file first, its main model named
 *  model.ldr and ended by the end marker; a new section goes at the text's end */
export const defineEdits = (layout: ModelLayout, name: string, lines: ReadonlyArray<string>): ContentChange[] => {
  const existing = layout.components.find(component => component.name === name);
  const section = [`0 FILE ${existing?.file ?? newFileName(name)}`, `0 ${name}`, ...lines].map(line => line + layout.lineBreak).join('');
  if(existing) return [...deleteLines(existing.repeats)/*after the first: removed first*/, { ...existing.span, insert: section }];
  const lead = ((layout.length < 1) || layout.endsWithBreak) ? '' : layout.lineBreak/*the last line is unfinished*/;
  const marker = layout.endMarker ? '' : END_MARKER + layout.lineBreak;
  const end: ContentChange = { from: layout.length, to: layout.length, insert: lead + ((layout.mainFile && !layout.endMarker) ? ''/*an MPD file of the previous release: its sections already part the two*/ : marker) + section };
  if(layout.mainFile) return [end];
  const opening = [`0 FILE ${MAIN_FILE}`, ...((layout.length < 1) ? DEFAULT_HEADER : [])].map(line => line + layout.lineBreak).join('');
  return [end, { from: 0, to: 0, insert: opening }]/*the end first: each edit is measured after the ones before it*/;
};

/** the edits that remove every part, copy and component, keeping the main model's
 *  other lines (its header, the ground): the build is left as Brick Studio writes one
 *  whole, its main model's file line first and its end marker last. An empty text
 *  stays empty */
export const clearEdits = (layout: ModelLayout): ContentChange[] => {
  if(layout.length < 1) return [];
  const removed = [...layout.mainParts, ...layout.steps, ...layout.components.flatMap(({ span, repeats }) => [span, ...repeats])];
  // the main model's end, after the lines before it are removed
  const end = layout.mainEnd - removed.filter(span => span.to <= layout.mainEnd).reduce((total, span) => total + (span.to - span.from), 0);
  const lead = layout.mainEndsWithBreak ? '' : layout.lineBreak/*the last line is unfinished*/;
  return [
    ...deleteLines(removed),
    ...(layout.endMarker ? [] : [{ from: end, to: end, insert: lead + END_MARKER + layout.lineBreak }]),
    ...(layout.mainFile ? [] : [{ from: 0, to: 0, insert: `0 FILE ${MAIN_FILE}` + layout.lineBreak }]),
  ];
};

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
  if(layout.length < 1) return [{ from: 0, to: 0, insert: [...DEFAULT_HEADER, line].map(text => text + layout.lineBreak).join('') }]/*flat, as an empty build's first part (SEE: appendLines)*/;
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

/** a number as a line writes it: to three decimals, or exactly as it is where
 *  rounding to three decimals cannot change it (a whole number, or one too large for
 *  thousandths to count) */
const formatNumber = (value: number | string): string => {
  if(typeof value === 'string') return value;
  if(Number.isInteger(value) || (Math.abs(value) >= ROUNDED_BELOW)) return Object.is(value, -0) ? '0' : String(value);
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
