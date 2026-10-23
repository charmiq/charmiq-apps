import type { Film, FilmFrame, FrameStep } from './film';
import { glideAt, hipFor, hopShares, keysAt, posedAt, rockAt, strideOf, turnedOn, GaitMove, type GaitShape, type GaitTiming, type Move, type Stance, type Stride, WALK } from './steps';

// the Gait mode: the gait a walker takes shaped on its graphs, a tab for each kind of
// move a gait keys (a step, a stride up and one down, a quarter turn, a shift of
// weight, a hop's crouch, flight and landing), the move the frame shows marked on its
// tab and its graphs. A dot dragged reshapes the gait the graphs draw at once; let go,
// the gait is written into the scene (what it changes from the built-in walk, SEE:
// scene-edit.ts regait), and the film the scene makes shows it on the studio
// ********************************************************************************
// == Constants ===================================================================
const SVG = 'http://www.w3.org/2000/svg';
/** a stance the graphs' moves start from, facing north on the baseplate */
const START: Stance = { x: 0, z: 0.5, yaw: 180, level: 0, studded: true };
/** a figure's moves alone, each over a whole span, to draw the graphs from: a step, a
 *  stride (two studs) up onto a block two plates high and down off one, a quarter turn */
const ONE_STEP: Move = { kind: 'step', from: START, to: { ...START, z: 1.5 }, start: 0, end: 1, foot: 'left' };
const ONE_UP: Move = { ...ONE_STEP, to: { ...START, z: 2.5, level: 2 } };
const ONE_DOWN: Move = { ...ONE_STEP, from: { ...START, level: 2 }, to: { ...START, z: 2.5 } };
const ONE_TURN: Move = { kind: 'turn', from: START, to: turnedOn(START, 90), start: 0, end: 1, foot: 'right' };
/** studs a plate, and a leg's length (studs: SEE steps.ts) */
const PLATE = 0.4;
const LEG = 1.4;
/** samples a graph's curve is drawn through */
const SAMPLES = 80;
/** the least a body's glide rises from one key to the next */
const GLIDE_GAP = 0.01;
/** a hop springs only rolled forward onto the toes: its crouch's last legs key */
const SPRING: readonly [number, number] = [-40, -2];
/** a graph's margins (pixels) */
const PAD = { left: 34, right: 8, top: 10, bottom: 16 } as const;

// == Types =======================================================================
/** the tabs: one for each kind of move a gait keys, a hop's three parts apart */
export enum GaitTab { Walk = 'walk', Up = 'up', Down = 'down', Turn = 'turn', Shift = 'shift', Crouch = 'crouch', Jump = 'jump', Land = 'land' }
/** a gait as the mode shapes it: its curves held as arrays it changes in place */
type Editable = { -readonly [K in keyof GaitShape]: GaitShape[K] extends ReadonlyArray<number> ? number[] : GaitShape[K] };
/** a gait's keys that are curves */
type Curve = { [K in keyof Editable]: Editable[K] extends number[] ? K : never }[keyof Editable];
/** a stride's keys by name: a step's, a stride up's, a stride down's */
type StrideNames = Readonly<{ glide: Curve; lead: Curve; trail: Curve; heelOn: 'heelOn' | 'upHeelOn' | 'downHeelOn'; toeOff: 'toeOff' | 'upToeOff' | 'downToeOff'; }>;
/** a graph: its picture, and the values its height spans */
type Chart = Readonly<{ svg: SVGSVGElement; y0: number; y1: number; }>;
/** which of a curve's ends are its own to set: neither (from standing to standing), the
 *  last (a crouch ending where it springs), the first (a landing starting where it lands) */
enum Ends { Fixed = 'fixed', Last = 'last', First = 'first' }
/** a slider: its label, unit, range and step, and the gait value it reads and sets */
type Slider = Readonly<{ label: string; unit: string; lo: number; hi: number; step: number; get: (shape: Editable) => number; set: (shape: Editable, value: number) => void; }>;
/** what the mode asks of Stop Motion: the gait written into the scene (undefined once the
 *  scene holds it, else why not), a frame sought (by its index, the film paused) or
 *  stepped to (frames on, back when less than 0), a frame the film plays on from (a move
 *  looped), the film shown again */
export type GaitHost = Readonly<{ write: (name: string, keys: Readonly<Record<string, unknown>>) => Promise<string | undefined>; seek: (index: number) => void; step: (delta: number) => void; rewind: (index: number) => void; close: () => void; }>;

const LEVEL_STRIDE: StrideNames = { glide: 'glide', lead: 'lead', trail: 'trail', heelOn: 'heelOn', toeOff: 'toeOff' };
const UP_STRIDE: StrideNames = { glide: 'upGlide', lead: 'upLead', trail: 'upTrail', heelOn: 'upHeelOn', toeOff: 'upToeOff' };
const DOWN_STRIDE: StrideNames = { glide: 'downGlide', lead: 'downLead', trail: 'downTrail', heelOn: 'downHeelOn', toeOff: 'downToeOff' };
/** each kind of move's curves, a key a drawing: resampled along their own curve when its
 *  drawings change, so its shape holds */
const KEYED: ReadonlyArray<readonly [keyof GaitTiming, ReadonlyArray<Curve>]> = [
  ['step', ['glide', 'lead', 'trail', 'headSwing']], ['up', ['upGlide', 'upLead', 'upTrail', 'upLean']], ['down', ['downGlide', 'downLead', 'downTrail', 'downLean']],
  ['turn', ['turnEase', 'turnLeg', 'turnRoll']], ['shift', ['shiftRoll']],
  ['crouch', ['crouchLegs', 'crouchLean', 'crouchArms']], ['air', ['hopArc', 'hopLegs', 'hopArms']], ['land', ['landLegs', 'landLean', 'landArms']],
];
/** a kind of move's drawings, as a slider */
const drawings = (kind: keyof GaitTiming, label: string, lo: number, hi: number): Slider => ({ label, unit: '', lo, hi, step: 1, get: shape => shape.timing[kind], set: (shape, value) => { shape.timing = { ...shape.timing, [kind]: value }; } });
const SLIDERS: Readonly<Record<GaitTab, ReadonlyArray<Slider>>> = {
  [GaitTab.Walk]: [drawings('step', 'drawings a step', 2, 12), { label: 'shoulders turn', unit: '', lo: 0, hi: 0.5, step: 0.01, get: shape => shape.twistPerArm, set: (shape, value) => { shape.twistPerArm = value; } }],
  [GaitTab.Up]: [drawings('up', 'drawings a stride up', 2, 16)],
  [GaitTab.Down]: [drawings('down', 'drawings a stride down', 2, 16)],
  [GaitTab.Turn]: [
    drawings('turn', 'drawings a quarter turn', 2, 16),
    { label: 'head leads by', unit: '°', lo: 0, hi: 90, step: 1, get: shape => shape.headTurn, set: (shape, value) => { shape.headTurn = value; } },
    { label: 'head turns, before', unit: ' s', lo: 0, hi: 1, step: 0.01, get: shape => shape.headLead, set: (shape, value) => { shape.headLead = value; } },
  ],
  [GaitTab.Shift]: [drawings('shift', 'drawings a shift', 2, 12)],
  [GaitTab.Crouch]: [drawings('crouch', 'drawings crouching', 2, 16)],
  [GaitTab.Jump]: [
    drawings('air', 'drawings in the air', 2, 16),
    { label: 'lift', unit: ' pl', lo: 0.5, hi: 6, step: 0.1, get: shape => shape.hopLift, set: (shape, value) => { shape.hopLift = value; } },
    { label: 'more a plate climbed', unit: ' pl', lo: 0, hi: 2, step: 0.05, get: shape => shape.hopClimb, set: (shape, value) => { shape.hopClimb = value; } },
  ],
  [GaitTab.Land]: [drawings('land', 'drawings landing', 2, 16)],
};
/** the tabs, labeled, in the order a walk meets them */
const TABS: ReadonlyArray<readonly [GaitTab, string]> = [[GaitTab.Walk, 'Walk'], [GaitTab.Up, 'Step up'], [GaitTab.Down, 'Step down'], [GaitTab.Turn, 'Turn'], [GaitTab.Shift, 'Shift'], [GaitTab.Crouch, 'Crouch'], [GaitTab.Jump, 'Jump'], [GaitTab.Land, 'Land']];

// == Gait View ===================================================================
export class GaitView {
  // .. Elements ..................................................................
  private readonly walkerSelect: HTMLSelectElement;
  private readonly gaitName: HTMLElement;
  private readonly note: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly check: HTMLButtonElement;
  private readonly charts: HTMLElement;
  private readonly sliders: HTMLElement;
  private readonly scrub: HTMLInputElement;
  private readonly loopButton: HTMLButtonElement;

  // .. State .....................................................................
  /** the film shown, the walker chosen and the tab open */
  private film: Film | undefined/*none yet*/;
  private walker: string | undefined/*no walker in the film*/;
  private tab = GaitTab.Walk;
  /** the gait shaped: the scene's (or the built-in walk) until a dot moves it */
  private shape: Editable = editable(WALK);
  /** the move the frame shows, when the walker takes one of its gait's */
  private step: FrameStep | undefined/*the walker takes none of its gait's moves*/;
  /** the point being dragged, its graph and what it moves; whether a drag changed the
   *  gait, so letting go writes it */
  private dragging: Readonly<{ chart: Chart; move: (u: number, value: number) => void; }> | undefined/*none*/;
  private changed = false;
  /** the frame shown, and the frames of the move looped (first and last), while one is */
  private shown = 0;
  private looped: Readonly<{ first: number; last: number; }> | undefined/*no move looped*/;

  public constructor(private readonly root: HTMLElement, private readonly host: GaitHost) {
    root.replaceChildren();
    const head = element('header', 'gait-head', root);
    element('span', 'eyebrow', head).textContent = 'Gait of';
    this.walkerSelect = element('select', 'gait-walker', head);
    this.walkerSelect.setAttribute('aria-label', 'The walker whose gait is shaped');
    this.walkerSelect.addEventListener('change', () => this.choose(this.walkerSelect.value));
    this.gaitName = element('span', 'gait-name', head);
    this.note = element('span', 'gait-note', head);
    this.note.setAttribute('role', 'status');
    this.loopButton = element('button', 'tag tag--plain gait-loop', head);
    this.loopButton.type = 'button';
    this.loopButton.textContent = 'Loop this move';
    this.loopButton.title = 'Play the move under the playhead over and over';
    this.loopButton.setAttribute('aria-pressed', 'false');
    this.loopButton.addEventListener('click', () => this.loop((this.looped === undefined) ? this.moveSpanAt(this.shown) : undefined));
    const back = element('button', 'tag tag--plain', head);
    back.type = 'button';
    back.textContent = 'Back to the film';
    back.addEventListener('click', () => this.host.close());

    // where the walker's feet go into the set, if anywhere: a press seeks the worst frame
    this.check = element('button', 'gait-check', root);
    this.check.type = 'button';
    this.check.addEventListener('click', () => { const worst = this.check.dataset.frame; if(worst !== undefined) this.host.seek(Number(worst)); });
    this.tabs = element('nav', 'gait-tabs', root);
    this.tabs.setAttribute('aria-label', 'Kinds of move');
    for(const [tab, label] of TABS) {
      const button = element('button', 'tag tag--plain gait-tab', this.tabs);
      button.type = 'button';
      button.dataset.tab = tab;
      button.textContent = label;
      button.addEventListener('click', () => { this.tab = tab; this.draw(); });
    }
    const body = element('div', 'gait-body', root);
    this.charts = element('div', 'gait-charts', body);
    this.sliders = element('div', 'gait-sliders', body);
    // the film's frames, scrubbed: the playhead where it is let go
    this.scrub = element('input', 'gait-scrub', root);
    Object.assign(this.scrub, { type: 'range', min: '0', max: '0', step: '1', value: '0' });
    this.scrub.setAttribute('aria-label', 'Frame');
    this.scrub.addEventListener('input', () => this.host.seek(Number(this.scrub.value)));
    // a frame back or on with the arrows (a second with Shift), wherever the mode has
    // the keys: a field keeps its own
    addEventListener('keydown', event => {
      if(this.root.hidden || !this.film || ((event.key !== 'ArrowLeft') && (event.key !== 'ArrowRight'))) return;
      if((event.target instanceof HTMLInputElement) || (event.target instanceof HTMLSelectElement) || (event.target instanceof HTMLTextAreaElement)) return/*its own keys*/;
      this.host.step(((event.key === 'ArrowLeft') ? -1 : 1) * (event.shiftKey ? this.film.scene.fps : 1));
      event.preventDefault();
    });

    addEventListener('pointermove', event => {
      if(!this.dragging) return;
      const { chart, move } = this.dragging, box = chart.svg.getBoundingClientRect();
      move(fromX(chart, event.clientX - box.left), fromY(chart, event.clientY - box.top));
      this.changed = true;
      this.fit();
      this.draw();
    });
    addEventListener('pointerup', () => { if(this.dragging) { this.dragging = undefined; void this.commit(); } });
  }

  // == Film ======================================================================
  /** the film shown: its walkers, and the gait the one chosen takes */
  public setFilm(film: Film | undefined): void {
    this.film = film;
    const walkers = (film?.scene.actors ?? []).filter(actor => (actor.walks?.length ?? 0) > 0).map(actor => actor.name);
    this.walkerSelect.replaceChildren(...walkers.map(name => Object.assign(document.createElement('option'), { value: name, textContent: name })));
    this.walker = walkers.includes(this.walker ?? '') ? this.walker : walkers[0];
    this.scrub.max = String(Math.max(0, (film?.frames.length ?? 1) - 1));
    if(this.walker !== undefined) this.walkerSelect.value = this.walker;
    if(!this.dragging) this.reload()/*the scene's gait, as it now writes it*/;
    this.showCheck();
  }

  /** the frame shown: the walker's move under way marked on its tab and its graphs */
  public setFrame(frame: FilmFrame | undefined): void {
    this.shown = frame?.index ?? 0;
    if(this.looped && frame && ((frame.index < this.looped.first) || (frame.index > this.looped.last))) { this.host.rewind(this.looped.first); return; }
    this.step = (this.walker !== undefined) ? frame?.steps?.[this.walker] : undefined;
    if(frame && (document.activeElement !== this.scrub)) this.scrub.value = String(frame.index)/*held where the person scrubs*/;
    const moving = this.step && tabOf(this.step.move, this.step.u, this.shape);
    for(const button of this.tabs.querySelectorAll<HTMLButtonElement>('.gait-tab')) button.classList.toggle('is-moving', button.dataset.tab === moving);
    this.draw();
  }

  /** shapes the gait an actor walks, its walker chosen */
  public choose(walker: string): void {
    this.walker = walker;
    this.walkerSelect.value = walker;
    this.loop(undefined/*another walker's moves*/);
    this.reload();
    this.showCheck();
  }

  /** shows or hides the mode */
  public show(on: boolean): void {
    this.root.hidden = !on;
    if(on) this.draw();
  }

  // == Internal ==================================================================
  // the gait the walker's walks take: the scene's, by name, or the built-in walk
  private get gait(): string {
    const walk = this.film?.scene.actors.find(actor => actor.name === this.walker)?.walks?.[0];
    return walk?.gait ?? 'walk';
  }

  // says whether the walker's feet stay out of the set through the film: where a foot
  // goes in, its frames, how far at most and in which move, the worst frame to seek
  private showCheck() {
    const walker = this.walker, frames = this.film?.frames ?? [];
    const into = frames.flatMap(frame => { const step = (walker !== undefined) ? frame.steps?.[walker] : undefined; return step?.into ? [{ index: frame.index, into: step.into, move: step.move }] : []; });
    this.check.hidden = (walker === undefined);
    this.check.classList.toggle('is-into', into.length > 0);
    if(into.length < 1) { this.check.textContent = 'Its feet stay out of the set'; delete this.check.dataset.frame; this.check.disabled = true; return; }
    const worst = into.reduce((most, each) => (each.into > most.into) ? each : most);
    const moves = [...new Set(into.map(each => each.move))].join(', ');
    this.check.disabled = false;
    this.check.dataset.frame = String(worst.index);
    this.check.textContent = `A foot goes into the set on ${into.length} frames (${moves}), ${worst.into.toFixed(2)} studs at most at frame ${worst.index + 1}: show it`;
  }

  // loops the frames of a move (first and last), or lets the loop go
  private loop(span: Readonly<{ first: number; last: number; }> | undefined) {
    this.looped = span;
    this.loopButton.setAttribute('aria-pressed', String(!!span));
  }

  // the frames of the walker's move under way at frame `index`, first and last: none
  // where it takes none of its gait's moves
  private moveSpanAt(index: number): Readonly<{ first: number; last: number; }> | undefined {
    const frames = this.film?.frames, walker = this.walker;
    const stepOf = (at: number) => (walker !== undefined) ? frames?.[at]?.steps?.[walker] : undefined;
    const here = stepOf(index);
    if(!frames || !here) { this.note.textContent = 'Stop on a move to loop it'; return undefined; }
    // the same move runs while its kind holds and it goes on (a new one starts back at 0)
    const same = (from: number, to: number) => { const [a, b] = [stepOf(from), stepOf(to)]; return !!a && !!b && (a.move === b.move) && (b.u >= a.u); };
    let [first, last] = [index, index];
    while((first > 0) && same(first - 1, first)) first--;
    while((last < (frames.length - 1)) && same(last, last + 1)) last++;
    return { first, last };
  }

  // the gait shaped as the scene writes it, its curves a key a drawing
  private reload() {
    const written = this.film?.scene.gaits?.find(each => each.name === this.gait);
    this.shape = editable(written?.shape ?? WALK);
    this.gaitName.textContent = `'${this.gait}'${written ? '' : ' (built in)'}`;
    this.fit();
    this.draw();
  }

  // each kind of move's curves resampled to its drawings, and each stride's heel and
  // toe on its drawings
  private fit() {
    const { shape } = this;
    for(const [kind, names] of KEYED) {
      const count = shape.timing[kind];
      for(const name of names) if(shape[name].length !== (count + 1)) { const keys = shape[name]; shape[name] = Array.from({ length: count + 1 }, (_, i) => keysAt(keys, i / count)); }
    }
    for(const [kind, names] of [['step', LEVEL_STRIDE], ['up', UP_STRIDE], ['down', DOWN_STRIDE]] as const) {
      const count = shape.timing[kind], snap = (u: number) => Math.round(u * count) / count;
      shape[names.heelOn] = Math.max(1 / count, snap(shape[names.heelOn])); shape[names.toeOff] = Math.min(1 - (1 / count), snap(shape[names.toeOff]));
    }
  }

  // the gait written into the scene: what it changes from the built-in walk
  private async commit() {
    if(!this.changed) return;
    this.changed = false;
    this.note.textContent = 'Writing the gait into the scene…';
    const refused = await this.host.write(this.gait, changesOf(this.shape, WALK));
    this.note.textContent = refused ?? 'Written into the scene';
  }

  // .. Drawing ...................................................................
  // the open tab's graphs and sliders, while the mode shows (hidden, a graph has no size
  // to draw at; shown again, it is drawn)
  private draw() {
    if(this.root.hidden) return;
    for(const button of this.tabs.querySelectorAll<HTMLButtonElement>('.gait-tab')) button.classList.toggle('is-on', button.dataset.tab === this.tab);
    const { shape, tab } = this, phase = this.phaseIn(tab);
    if(this.charts.dataset.tab !== tab) this.layout();
    const chart = (index: number, y0: number, y1: number): Chart => ({ svg: this.charts.querySelectorAll<SVGSVGElement>('svg')[index], y0, y1 });

    if(tab === GaitTab.Walk) {
      const s = this.stride(chart(0, 0, 1), chart(1, -60, 60), chart(4, 0, 0.6), ONE_STEP, LEVEL_STRIDE, [-45, 0, 45], [0, 0.25, 0.5]);
      const arms = chart(2, -110, 50);
      grid(arms, [-90, -45, 0, 45], '°', shape.glide.length - 1);
      path(arms, s.map(p => [p.u, p.armOpposite] as const), 'gait-trail');
      path(arms, s.map(p => [p.u, p.armBeside] as const), 'gait-lead');
      this.handle(arms, 0, shape.hang, (_, value) => { shape.hang = clamp(value, -90, 30); });
      this.handle(arms, 0.5, shape.hang + shape.arms, (_, value) => { shape.arms = clamp(value - shape.hang, 0, 100); });
      this.keyed(chart(3, -20, 20), shape.headSwing, [-10, 0, 10], '°');
      playhead([chart(0, 0, 1), chart(1, -60, 60), arms, chart(3, -20, 20), chart(4, 0, 0.6)], phase);
    } else if((tab === GaitTab.Up) || (tab === GaitTab.Down)) {
      const up = tab === GaitTab.Up;
      this.stride(chart(0, 0, 1), chart(1, -100, 100), chart(3, up ? -0.5 : -3, up ? 3 : 0.5), up ? ONE_UP : ONE_DOWN, up ? UP_STRIDE : DOWN_STRIDE, [-90, -45, 0, 45, 90], up ? [0, 1, 2] : [-2, -1, 0]);
      this.keyed(chart(2, -20, 60), up ? shape.upLean : shape.downLean, [0, 20, 40], '°');
      playhead([0, 1, 2, 3].map(i => chart(i, 0, 1)), phase);
    } else if(tab === GaitTab.Turn) {
      this.keyed(chart(0, 0, 1), shape.turnEase, [0, 0.5, 1]);
      this.keyed(chart(1, -60, 60), shape.turnLeg, [-45, 0, 45], '°');
      this.keyed(chart(2, 0, 15), shape.turnRoll, [0, 5, 10], '°');
      const hips = chart(3, 0, 1.2);
      grid(hips, [0, 0.5, 1], '', shape.turnEase.length - 1);
      path(hips, curve(u => posedAt(ONE_TURN, u, true, this.gaitOf()).set.height), 'gait-curve');
      playhead([0, 1, 2, 3].map(i => chart(i, 0, 1)), phase);
    } else if(tab === GaitTab.Shift) {
      this.keyed(chart(0, 0, 15), shape.shiftRoll, [0, 5, 10], '°');
      playhead([chart(0, 0, 15)], phase);
    } else if((tab === GaitTab.Crouch) || (tab === GaitTab.Land)) {
      const crouch = tab === GaitTab.Crouch, ends = crouch ? Ends.Last : Ends.First;
      this.keyed(chart(0, -45, 60), crouch ? shape.crouchLegs : shape.landLegs, [-20, 0, 20, 40], '°', ends, crouch ? SPRING : [-45, 60]);
      this.keyed(chart(1, -20, 60), crouch ? shape.crouchLean : shape.landLean, [0, 20, 40], '°', ends);
      this.keyed(chart(2, -120, 60), crouch ? shape.crouchArms : shape.landArms, [-90, -45, 0, 45], '°', ends);
      playhead([0, 1, 2].map(i => chart(i, 0, 1)), phase);
    } else {
      this.keyed(chart(0, 0, 1.3), shape.hopArc, [0, 0.5, 1]);
      this.keyed(chart(1, -30, 90), shape.hopLegs, [0, 45], '°');
      this.keyed(chart(2, -30, 150), shape.hopArms, [0, 45, 90], '°');
      playhead([0, 1, 2].map(i => chart(i, 0, 1)), phase);
    }
  }

  // the open tab's graphs, titled, and its sliders
  private layout() {
    const titles: Readonly<Record<GaitTab, ReadonlyArray<string>>> = {
      [GaitTab.Walk]: ['Body along the step', 'Legs: leading and trailing (+ forward)', 'Arms: where they hang, how far they swing', 'Head swing toward the leading foot', 'Hips: the rock (dashed) and what the legs need'],
      [GaitTab.Up]: ['Body along the stride', 'Legs: leading and trailing (+ forward)', 'Waist bent forward', 'Hips: the rock (dashed) and what the legs need (plates)'],
      [GaitTab.Down]: ['Body along the stride', 'Legs: leading and trailing (+ forward)', 'Waist bent forward', 'Hips: the rock (dashed) and what the legs need (plates)'],
      [GaitTab.Turn]: ['Heading: how far round', 'Free leg (+ forward)', 'Lean out over the grounded foot', 'Hips: the hop the free foot needs'],
      [GaitTab.Shift]: ['Roll onto the turning foot\'s outer edge'],
      [GaitTab.Crouch]: ['Legs: back on the heels (+), forward onto the toes (−)', 'Waist bent forward', 'Arms (+ forward)'],
      [GaitTab.Jump]: ['The arc: a share of the rise', 'Legs tucked', 'Arms raised'],
      [GaitTab.Land]: ['Legs: back on the heels (+), forward onto the toes (−)', 'Waist bent forward', 'Arms (+ forward)'],
    };
    this.charts.dataset.tab = this.tab;
    this.charts.replaceChildren(...titles[this.tab].map(title => {
      const figure = document.createElement('figure');
      figure.className = 'gait-chart';
      element('figcaption', 'eyebrow', figure).textContent = title;
      figure.appendChild(document.createElementNS(SVG, 'svg'));
      return figure;
    }));
    this.sliders.replaceChildren(...SLIDERS[this.tab].map(slider => {
      const row = document.createElement('label');
      row.className = 'gait-slider';
      element('span', 'eyebrow', row).textContent = slider.label;
      const input = element('input', '', row), shown = element('span', 'gait-value', row);
      Object.assign(input, { type: 'range', min: String(slider.lo), max: String(slider.hi), step: String(slider.step), value: String(slider.get(this.shape)) });
      const show = () => { shown.textContent = `${Number(input.value)}${slider.unit}`; };
      show();
      input.addEventListener('input', () => { slider.set(this.shape, Number(input.value)); show(); this.changed = true; this.fit(); this.draw(); });
      input.addEventListener('change', () => void this.commit());
      return row;
    }));
  }

  // how far through the open tab's move the frame is (0 to 1); -1 when it shows none
  private phaseIn(tab: GaitTab): number {
    const step = this.step;
    if(!step || (tabOf(step.move, step.u, this.shape) !== tab)) return -1;
    if(step.move !== GaitMove.Hop) return step.u;
    const { crouch, land } = hopShares(this.shape);
    if(tab === GaitTab.Crouch) return step.u / crouch;
    if(tab === GaitTab.Land) return (step.u - (1 - land)) / land;
    return (step.u - crouch) / Math.max(1e-9, 1 - crouch - land);
  }

  // the gait the graphs pose with: the shape, without wander
  private gaitOf() { return { arms: this.shape.arms, lean: 0, variance: 0, shape: this.shape }; }

  // .. Graphs ....................................................................
  // a stride's graphs: the body along it, the legs (the free leg's no-hop band shaded,
  // a planted leg dashed, the heel landing and the toe lifting draggable) and the hips;
  // its samples
  private stride(glideChart: Chart, legs: Chart, hips: Chart, move: Move, names: StrideNames, legTicks: number[], hipTicks: number[]) {
    const { shape } = this, stride = strideOf(shape, move), rise = (move.to.level - move.from.level) * PLATE, length = move.to.z - move.from.z;
    const glide = shape[names.glide], lead = shape[names.lead], trail = shape[names.trail], frames = glide.length - 1;
    const s = Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const u = i / SAMPLES, { set, add } = posedAt(move, u, true, this.gaitOf());
      return { u, along: (set.z - move.from.z) / length, lead: set['pose.leftLeg'], trail: set['pose.rightLeg'], hips: set.height - move.from.level, rock: (rockAt(stride, u, length, rise) - LEG) * 2.5, armOpposite: shape.hang + add['pose.rightArm'], armBeside: shape.hang + add['pose.leftArm'] };
    });
    const snapped = (u: number) => Math.round(clamp(u, 0, 1) * frames) / frames;

    grid(glideChart, [0, 0.5, 1], '', frames);
    path(glideChart, [[0, 0], [1, 1]], 'gait-derived');
    path(glideChart, s.map(p => [p.u, p.along] as const), 'gait-curve');
    glide.forEach((g, i) => { if((i > 0) && (i < frames)) this.handle(glideChart, i / frames, g, (_, value) => { pushed(glide, i, value); }); });

    grid(legs, legTicks, '°', frames);
    for(let i=0; i<SAMPLES; i++) {
      const u = (i + 0.5) / SAMPLES;
      if((u >= stride.heelOn) && (u <= stride.toeOff)) continue/*both planted: nothing free*/;
      for(const [lo, hi] of noHop(stride, u, length, rise, legs.y0, legs.y1)) svg('rect', { x: toX(legs, i / SAMPLES), width: toX(legs, (i + 1) / SAMPLES) - toX(legs, i / SAMPLES) + 0.5, y: toY(legs, hi), height: toY(legs, lo) - toY(legs, hi), class: 'gait-band' }, legs.svg);
    }
    path(legs, s.filter(p => p.u <= stride.heelOn).map(p => [p.u, p.lead] as const), 'gait-lead');
    path(legs, s.filter(p => p.u >= stride.heelOn).map(p => [p.u, p.lead] as const), 'gait-lead gait-planted');
    path(legs, s.filter(p => p.u >= stride.toeOff).map(p => [p.u, p.trail] as const), 'gait-trail');
    path(legs, s.filter(p => p.u <= stride.toeOff).map(p => [p.u, p.trail] as const), 'gait-trail gait-planted');
    lead.forEach((v, i) => { const u = i / frames; if((i > 0) && (u < stride.heelOn)) this.handle(legs, u, v, (_, value) => { lead[i] = clamp(value, legs.y0, legs.y1); }); });
    trail.forEach((v, i) => { const u = i / frames; if((i < frames) && (u > stride.toeOff)) this.handle(legs, u, v, (_, value) => { trail[i] = clamp(value, legs.y0, legs.y1); }); });
    this.moment(legs, stride.heelOn, 'heel lands', u => { shape[names.heelOn] = clamp(snapped(u), 1 / frames, 1); });
    this.moment(legs, stride.toeOff, 'toe lifts', u => { shape[names.toeOff] = clamp(snapped(u), 0, 1 - (1 / frames)); });

    grid(hips, hipTicks, '', frames);
    path(hips, s.map(p => [p.u, p.rock] as const), 'gait-derived');
    path(hips, s.map(p => [p.u, p.hips] as const), 'gait-curve');
    return s;
  }

  // a move's keyed curve: the curve through its keys and a dot at each key its own to set
  // (`last` bounds the last key apart from the rest: a crouch springs only rolled forward)
  private keyed(chart: Chart, keys: number[], ticks: number[], unit = '', ends = Ends.Fixed, last: readonly [number, number] = [chart.y0, chart.y1]) {
    grid(chart, ticks, unit, keys.length - 1);
    path(chart, curve(u => keysAt(keys, u)), 'gait-curve');
    const free = (i: number) => ((i > 0) || (ends === Ends.First)) && ((i < (keys.length - 1)) || (ends === Ends.Last));
    keys.forEach((v, i) => { if(free(i)) this.handle(chart, i / (keys.length - 1), v, (_, value) => { keys[i] = (i === (keys.length - 1)) ? clamp(value, last[0], last[1]) : clamp(value, chart.y0, chart.y1); }); });
  }

  // a draggable dot: `move` takes the pointer's place in the graph's terms
  private handle(chart: Chart, u: number, value: number, move: (u: number, value: number) => void) {
    const dot = svg('circle', { cx: toX(chart, u), cy: toY(chart, value), r: 6, class: 'gait-handle' }, chart.svg);
    dot.addEventListener('pointerdown', event => { this.dragging = { chart, move }; event.preventDefault(); });
  }

  // a moment of a stride, dragged along it and snapping to its drawings
  private moment(chart: Chart, u: number, label: string, move: (u: number) => void) {
    const line = svg('line', { x1: toX(chart, u), x2: toX(chart, u), y1: PAD.top, y2: sizeOf(chart).h - PAD.bottom, class: 'gait-moment' }, chart.svg);
    svg('text', { x: toX(chart, u) + 3, y: PAD.top + 9, class: 'gait-axis' }, chart.svg).textContent = label;
    line.addEventListener('pointerdown', event => { this.dragging = { chart, move: at => move(at) }; event.preventDefault(); });
  }
}

// == Gaits =======================================================================
/** a gait as the mode shapes it: its own copy, every curve an array of its own */
const editable = (shape: GaitShape): Editable => Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, Array.isArray(value) ? [...value] : ((typeof value === 'object') && (value !== null)) ? { ...value } : value])) as Editable;

/** what a gait changes from `base`: each curve and number it holds otherwise, and of a
 *  group (its timing, its wander) only what it holds otherwise */
export const changesOf = (shape: GaitShape | Editable, base: GaitShape): Readonly<Record<string, unknown>> => {
  const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const changes: Record<string, unknown> = {};
  for(const [key, value] of Object.entries(shape)) {
    const was = (base as Record<string, unknown>)[key];
    if(Array.isArray(value)) { if(!Array.isArray(was) || (was.length !== value.length) || value.some((each: number, i) => !same(each, was[i] as number))) changes[key] = [...value]; }
    else if((typeof value === 'object') && (value !== null)) {
      const group = Object.fromEntries(Object.entries(value).filter(([part, each]) => !same(each as number, (was as Record<string, number>)[part])));
      if(Object.keys(group).length > 0) changes[key] = group;
    } else if(!same(value as number, was as number)) changes[key] = value;
  }
  return changes;
};

/** the tab a move under way is on: a hop's by whether it crouches, flies or lands */
const tabOf = (move: GaitMove, u: number, shape: GaitShape | Editable): GaitTab => {
  if(move !== GaitMove.Hop) return (move === GaitMove.Step) ? GaitTab.Walk : (move === GaitMove.Up) ? GaitTab.Up : (move === GaitMove.Down) ? GaitTab.Down : (move === GaitMove.Turn) ? GaitTab.Turn : GaitTab.Shift;
  const { crouch, land } = hopShares(shape);
  return (u < crouch) ? GaitTab.Crouch : (u > (1 - land)) ? GaitTab.Land : GaitTab.Jump;
};

/** where a free leg swings with no hop, `u` through a stride of `length` rising `rise`
 *  (studs): the angles within `lo` and `hi` whose foot the planted foot's rock alone keeps
 *  clear (degrees, as runs) */
const noHop = (stride: Stride, u: number, length: number, rise: number, lo: number, hi: number): ReadonlyArray<readonly [number, number]> => {
  const rock = rockAt(stride, u, length, rise), along = glideAt(stride, u) * length, runs: Array<[number, number]> = [];
  for(let leg=lo; leg<=hi; leg+=1) {
    if(hipFor(leg, along, length, rise) > (rock + 1e-6)) continue;
    const run = runs[runs.length - 1];
    if(run && (run[1] === (leg - 1))) run[1] = leg; else runs.push([leg, leg]);
  }
  return runs;
};

/** a body's glide key `i` dragged to `value`: the keys either side pushed along so the
 *  body never stands still or goes back, its first key 0 and its last 1 */
const pushed = (glide: number[], i: number, value: number) => {
  const last = glide.length - 1;
  glide[i] = clamp(value, i * GLIDE_GAP, 1 - ((last - i) * GLIDE_GAP));
  for(let j=i - 1; j>0; j--) glide[j] = Math.min(glide[j], glide[j + 1] - GLIDE_GAP);
  for(let j=i + 1; j<last; j++) glide[j] = Math.max(glide[j], glide[j - 1] + GLIDE_GAP);
};

// == Drawing =====================================================================
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: Element): HTMLElementTagNameMap[K] => {
  const made = document.createElement(tag);
  if(className) made.className = className;
  parent.appendChild(made);
  return made;
};
const svg = (name: string, attributes: Readonly<Record<string, string | number>>, parent: Element): SVGElement => {
  const made = document.createElementNS(SVG, name);
  for(const [key, value] of Object.entries(attributes)) made.setAttribute(key, String(value));
  parent.appendChild(made);
  return made;
};
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const sizeOf = (chart: Chart) => { const box = chart.svg.getBoundingClientRect(); return { w: box.width, h: box.height }; };
const toX = (chart: Chart, u: number) => PAD.left + (u * (sizeOf(chart).w - PAD.left - PAD.right));
const toY = (chart: Chart, value: number) => PAD.top + (((chart.y1 - value) / (chart.y1 - chart.y0)) * (sizeOf(chart).h - PAD.top - PAD.bottom));
const fromX = (chart: Chart, x: number) => (x - PAD.left) / (sizeOf(chart).w - PAD.left - PAD.right);
const fromY = (chart: Chart, y: number) => chart.y1 - (((y - PAD.top) / (sizeOf(chart).h - PAD.top - PAD.bottom)) * (chart.y1 - chart.y0));
/** a function sampled across a move, as a curve's points */
const curve = (at: (u: number) => number): ReadonlyArray<readonly [number, number]> => Array.from({ length: SAMPLES + 1 }, (_, i) => [i / SAMPLES, at(i / SAMPLES)] as const);
const path = (chart: Chart, points: ReadonlyArray<readonly [number, number]>, className: string) => svg('path', { d: points.map(([u, v], i) => `${i ? 'L' : 'M'}${toX(chart, u).toFixed(1)},${toY(chart, v).toFixed(1)}`).join(' '), class: `gait-line ${className}` }, chart.svg);
/** a graph emptied: its value lines labeled and a line at each drawing */
const grid = (chart: Chart, ticks: ReadonlyArray<number>, unit: string, frames: number) => {
  chart.svg.replaceChildren();
  const { w, h } = sizeOf(chart);
  for(const tick of ticks) {
    svg('line', { x1: PAD.left, x2: w - PAD.right, y1: toY(chart, tick), y2: toY(chart, tick), class: 'gait-grid' }, chart.svg);
    svg('text', { x: 2, y: toY(chart, tick) + 3, class: 'gait-axis' }, chart.svg).textContent = `${tick}${unit}`;
  }
  for(let i=0; i<=frames; i++) svg('line', { x1: toX(chart, i / frames), x2: toX(chart, i / frames), y1: PAD.top, y2: h - PAD.bottom, class: 'gait-grid' }, chart.svg);
};
/** where the frame stands in the move, on each graph; none at -1 */
const playhead = (charts: ReadonlyArray<Chart>, phase: number) => { if(phase >= 0) for(const chart of charts) svg('line', { x1: toX(chart, phase), x2: toX(chart, phase), y1: PAD.top, y2: sizeOf(chart).h - PAD.bottom, class: 'gait-playhead' }, chart.svg); };
