import { cameraShots, type Film } from './film';
import type { Inspected, InspectedMark, Inspector } from './inspector';
import type { ClosePair } from './measure';
import type { SoundCue } from './recorder';
import { bandTiers, keyGroups, rowsOf, standingAt, underAt, type KeyGroup, type Row, type RowBand, type SoundsKnown, type Under } from './timeline-marks';

// the timeline: one row per track (SEE: timeline-marks.ts), each key a diamond at its
// time (keys too near to tell apart one diamond, counted) and each function of time a
// band over its span (bands sharing a span stacked), under a ruler of seconds and
// frames. The rows scroll under the ruler; the playhead and the line following the
// pointer stand over them on the ruler's lanes, whatever the scroll. A press or a drag
// anywhere on the ruler or the lanes scrubs the film; a key's diamond seeks to it.
// Holding the modifier (⌘, Ctrl off a Mac) over the lanes shows the moment under the
// pointer in the sheet's inspector (SEE: inspector.ts), its marks lit on the lane; the
// modifier and a press pin that moment there until it is let go (Escape, or the
// inspector's Unpin), and a key focused shows its moment too. The line follows each
// move at once, in the move's own handler, never waiting on an animation frame; the
// inspector's heavier work gathers into one update after the moves of a task. The
// keyboard steps frames (arrows), jumps to the ends (Home, End) and plays (Space).
// each sound draws as its waveform over the span it plays; one whose time the scene
// writes as a number drags along its row to a new time, which the scene then holds,
// and one written otherwise says where its time is written
// ********************************************************************************
// == Constants ===================================================================
/** how near two keys draw (CSS pixels) before they draw as one diamond */
const KEY_APART = 9;
/** how near the pointer (CSS pixels) a key or a notch is under it */
const NEAR = 6;
/** how far (CSS pixels) a press on a sound moves before it is a drag, not a press */
const DRAG_SLOP = 3;
/** how long a note about a sound shows */
const NOTE_MS = 4_000/*ms*/;
/** how long the inspector rests on a frame before its exact picture is asked of the
 *  studio: a sweep across the timeline asks for none */
const PICTURE_REST_MS = 90;
/** the most exact pictures kept for a film */
const MAX_PICTURES = 120;
/** whether the modifier is ⌘ (a Mac's) rather than Ctrl */
const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
/** the modifier's key and its name as the timeline's hint says it */
const MODIFIER_KEY = MAC ? 'Meta' : 'Control';
const MODIFIER_NAME = MAC ? '⌘' : 'Ctrl';

// == Types =======================================================================
export type TimelineHost = Readonly<{
  seek: (index: number) => void;
  step: (delta: number) => void;
  toggle: () => void;
  /** a frame's picture as the studio draws it, or undefined when none can be had now
   *  (playing, exporting, not staged) */
  picture: (index: number) => Promise<string | undefined>;
  /** the picture track's picture nearest a frame, when one is developed */
  nearPicture: (index: number) => string | undefined;
  /** the film's sounds as far as they are read: how long each plays once, what it is
   *  called and its waveform */
  sounds: () => TimelineSounds;
  /** why a sound cannot be moved here (the scene writes its time otherwise), or
   *  undefined when it can */
  fixed: (cue: SoundCue) => string | undefined;
  /** moves a sound to a time of the film: undefined once the scene holds it, else why
   *  it could not */
  moveSound: (cue: SoundCue, time: number) => Promise<string | undefined>;
}>;

/** the film's sounds as the timeline draws them: their lengths and names, and each
 *  one's waveform (its loudest sample in equal slices, 0 to 1) once it is read */
export type TimelineSounds = SoundsKnown & Readonly<{ peaks: (sound: string) => Float32Array | undefined; }>;

/** a row as laid out: its marks' elements, each key group's diamond */
type Laid = Readonly<{ row: Row; groups: ReadonlyArray<KeyGroup>; keys: ReadonlyArray<HTMLElement>; bands: ReadonlyArray<HTMLElement>; notches: ReadonlyArray<HTMLElement>; }>;

/** a moment of the film on a row (none on the ruler): its frame, its share of the
 *  film and its time, and the marks under it there */
type Moment = Readonly<{ frame: number; share: number; time: number; row: number | undefined; under?: Under; }>;

export { actorColor } from './timeline-marks';

// == Class =======================================================================
export class Timeline {
  private film: Film | undefined;
  private close: ReadonlyArray<ClosePair> = [];
  private readonly scroller: HTMLElement;
  private readonly over: HTMLElement;
  private readonly playhead: HTMLElement;
  private readonly hoverLine: HTMLElement;
  private readonly hoverTime: HTMLElement;
  private readonly pinLine: HTMLElement;
  private laid: ReadonlyArray<Laid> = [];
  /** the lanes' width (CSS pixels) the keys were grouped at */
  private laneWidth = 0;
  private frame = 0;
  private scrubbing = false;
  /** the pointer over the timeline as it last moved (page pixels), whether the
   *  modifier is held, the key focused, and the moment pinned */
  private pointer: Readonly<{ x: number; y: number; }> | undefined;
  /** the moment under the pointer, and the line's time and hint as last written */
  private hovered: Moment | undefined;
  private lineFrame = -1;
  private lineHint: string | undefined;
  private modifier = false;
  private focusedKey: HTMLElement | undefined;
  private pinned: Moment | undefined;
  /** the inspector's update waiting to run, while one waits */
  private updating: number | undefined;
  /** the marks lit, and the frame the inspector shows */
  private lit: ReadonlyArray<HTMLElement> = [];
  private inspecting: number | undefined;
  /** the film's exact pictures, by frame, and the one asked of the studio */
  private readonly pictures = new Map<number, string>();
  private asking: number | undefined;
  private waiting: number | undefined;
  private restTimer: number | undefined;
  /** a sound being dragged: its band, its element and where the press began */
  private dragging: Readonly<{ band: RowBand; mark: HTMLElement; startX: number; }> | undefined;
  private dragged = 0;
  /** the note about a sound, and its timer */
  private readonly note: HTMLElement;
  private noteTimer: number | undefined;

  public constructor(private readonly root: HTMLElement, private readonly host: TimelineHost, private readonly inspector: Inspector) {
    const document = root.ownerDocument;
    const view = document.defaultView!;
    root.tabIndex = 0;
    this.scroller = element(document, 'div', 'timeline-scroll');
    this.over = element(document, 'div', 'timeline-over');
    this.playhead = element(document, 'div', 'playhead');
    this.playhead.append(element(document, 'i', 'playhead-knob'));
    this.hoverLine = element(document, 'div', 'hover-line');
    this.hoverTime = element(document, 'span', 'hover-time');
    this.hoverLine.append(this.hoverTime);
    this.hoverLine.hidden = true;
    this.pinLine = element(document, 'div', 'pin-line');
    this.pinLine.append(element(document, 'i', 'pin-knob'));
    this.pinLine.hidden = true;
    this.note = element(document, 'p', 'timeline-note');
    this.note.hidden = true;
    this.note.setAttribute('role', 'status');
    this.over.append(this.pinLine, this.hoverLine, this.playhead, this.note);
    root.replaceChildren(this.scroller, this.over);

    this.scroller.addEventListener('pointerdown', event => this.press(event));
    this.scroller.addEventListener('pointermove', event => {
      if(this.dragging) { this.drag(event); return; }
      if(this.scrubbing) { this.scrub(event); return; }
      this.pointer = { x: event.clientX, y: event.clientY };
      this.modifier = held(event);
      this.hover(this.momentUnder(event.clientX, event.target as Element));
    });
    this.scroller.addEventListener('pointerleave', () => { this.pointer = undefined; this.hover(undefined); });
    const end = () => { this.scrubbing = false; root.classList.remove('is-scrubbing'); };
    this.scroller.addEventListener('pointerup', event => { if(this.dragging) void this.drop(event); else end(); });
    this.scroller.addEventListener('pointercancel', () => { this.cancelDrag(); end(); });
    this.scroller.addEventListener('scroll', () => {
      const pointer = this.pointer/*the rows moved under it*/;
      this.hover(pointer && this.momentUnder(pointer.x, document.elementFromPoint(pointer.x, pointer.y)));
    });
    root.addEventListener('keydown', event => this.key(event));
    root.addEventListener('focusin', event => { this.focusedKey = (event.target as HTMLElement).closest<HTMLElement>('.key') ?? undefined; this.update(); });
    root.addEventListener('focusout', () => { this.focusedKey = undefined; this.update(); });
    // the modifier pressed or let go with the pointer resting on the lanes
    view.addEventListener('keydown', event => { if(event.key === MODIFIER_KEY) { this.modifier = true; this.follow(); this.update(); } });
    view.addEventListener('keyup', event => { if(event.key === MODIFIER_KEY) { this.modifier = false; this.follow(); this.update(); } });
    view.addEventListener('blur', () => { this.modifier = false; this.follow(); this.update(); });
    new ResizeObserver(() => this.resized()).observe(root);
  }

  // == Film ======================================================================
  /** draws a film's tracks, or the empty timeline for none, with the actors that come
   *  close once the stage has sized them */
  public show(film: Film | undefined, close: ReadonlyArray<ClosePair> = []): void {
    if(film !== this.film) { this.pictures.clear(); this.waiting = undefined; this.pinned = undefined; }
    this.film = film;
    this.close = close;
    this.layout();
    this.follow()/*the lanes laid out anew*/;
    this.update();
  }

  /** lets a pinned moment go: the film's sheet again */
  public unpin(): void {
    this.pinned = undefined;
    this.update();
  }

  /** draws the film's sounds again: one read since, its length and waveform known */
  public soundsChanged(): void {
    if(!this.dragging) this.layout()/*a drag keeps the marks it holds*/;
  }

  /** moves the playhead to a frame */
  public setFrame(index: number): void {
    this.frame = index;
    this.place();
  }

  // == Layout ====================================================================
  private layout(): void {
    const film = this.film;
    const document = this.root.ownerDocument;
    this.root.classList.toggle('is-empty', !film);
    this.laid = [];
    if(!film) { this.scroller.replaceChildren(); this.place(); return; }
    const { scene } = film;
    const length = scene.length;
    const at = (time: number) => `${(Math.min(Math.max(time / length, 0), 1) * 100).toFixed(3)}%`;

    // the ruler: a tick each second, finer ticks each frame when they fit
    const ruler = element(document, 'div', 'ruler');
    const step = (length > 30) ? 5 : (length > 12) ? 2 : 1;
    for(let second=0; second<=Math.floor(length); second+=step) {
      const tick = element(document, 'span', 'ruler-tick');
      tick.style.left = at(second);
      tick.textContent = `${second}s`;
      ruler.append(tick);
    }
    ruler.style.setProperty('--frame', at(1 / scene.fps));
    const head = element(document, 'div', 'row row--ruler');
    head.append(element(document, 'span', 'row-name'), ruler);
    this.scroller.replaceChildren(head);

    // keys grouped at the lanes' width: those nearer than KEY_APART draw as one
    this.laneWidth = ruler.getBoundingClientRect().width;
    const apart = (this.laneWidth > 0) ? ((KEY_APART * length) / this.laneWidth) : 0;
    const body = element(document, 'div', 'rows');
    const sounds = this.host.sounds();
    this.laid = rowsOf(film, this.close, sounds).map((row, index) => {
      const laid = this.row(row, keyGroups(row.keys, apart), at);
      laid.element.dataset.row = String(index);
      body.append(laid.element);
      return laid.laid;
    });
    this.scroller.append(body);
    for(const laid of this.laid) laid.row.bands.forEach((band, index) => { if(band.cue) this.drawWave(laid.bands[index], band, sounds); });
    this.place();
  }

  private row(row: Row, groups: ReadonlyArray<KeyGroup>, at: (time: number) => string): Readonly<{ element: HTMLElement; laid: Laid; }> {
    const document = this.root.ownerDocument;
    const line = element(document, 'div', 'row');
    line.style.setProperty('--row', `var(${row.color})`);
    const name = element(document, 'span', 'row-name');
    name.append(Object.assign(element(document, 'b', 'row-swatch'), { ariaHidden: 'true' }), document.createTextNode(row.name));
    if(row.note) name.append(Object.assign(element(document, 'small', 'row-note'), { textContent: row.note }));

    // bands sharing a span stack in tiers, the row as tall as they need
    const lane = element(document, 'div', 'lane');
    const { tiers, count } = bandTiers(row.bands);
    line.style.setProperty('--tiers', String(count));
    const bands = row.bands.map((each, index) => {
      const mark = element(document, 'span', `band band--${each.kind}${each.alternate ? ` band--${each.kind}-alternate` : ''}`);
      mark.style.left = at(each.from);
      mark.style.width = `calc(${at(each.to)} - ${at(each.from)})`;
      mark.style.setProperty('--tier', String(tiers[index]));
      if(each.strength !== undefined) mark.style.setProperty('--strength', String(each.strength));
      if((each.kind === 'title') || (each.kind === 'shot') || (each.kind === 'set')) mark.textContent = each.label;
      if(each.cue) this.soundBand(mark, each.cue, each.label);
      lane.append(mark);
      return mark;
    });
    const notches = row.notches.map(notch => {
      const mark = element(document, 'span', 'notch');
      mark.style.left = at(notch.time);
      lane.append(mark);
      return mark;
    });
    const keys = groups.map((group, index) => {
      const diamond = element(document, 'button', group.keys.every(key => key.face) ? 'key key--face' : 'key');
      diamond.type = 'button';
      diamond.style.left = at(group.time);
      diamond.dataset.group = String(index);
      diamond.ariaLabel = group.keys.map(key => `${key.title}: ${key.chips.join(', ')}`).join('; ');
      if(group.keys.length > 1) diamond.append(Object.assign(element(document, 'span', 'key-count'), { textContent: `×${group.keys.length}`, ariaHidden: 'true' }));
      lane.append(diamond);
      return diamond;
    });
    line.append(name, lane);
    return { element: line, laid: { row, groups, keys, bands, notches } };
  }

  // .. Sounds ....................................................................
  // a sound's band: its waveform under its name, movable or saying why not
  private soundBand(mark: HTMLElement, cue: SoundCue, label: string): void {
    const document = this.root.ownerDocument;
    const why = this.host.fixed(cue);
    mark.classList.toggle('is-fixed', why !== undefined);
    mark.title = why ?? `Drag to move "${label}"`;
    mark.append(element(document, 'canvas', 'band-wave'), Object.assign(element(document, 'span', 'band-label'), { textContent: label }));
  }

  // a sound band's waveform, its sound's slices stretched over the band (repeated
  // over and over where it plays until a time); none until the sound is read
  private drawWave(mark: HTMLElement, band: RowBand, sounds: TimelineSounds): void {
    const canvas = mark.querySelector<HTMLCanvasElement>('.band-wave');
    const peaks = sounds.peaks(band.cue!.name);
    const duration = sounds.duration(band.cue!.name);
    const [width, height] = [mark.clientWidth, mark.clientHeight];
    if(!canvas || !peaks || !duration || (width < 1) || (height < 1)) return/*not read, or not laid out*/;
    const scale = this.root.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    [canvas.width, canvas.height] = [Math.round(width * scale), Math.round(height * scale)];
    const context = canvas.getContext('2d');
    if(!context) return/*no 2D drawing here*/;
    context.fillStyle = getComputedStyle(mark).getPropertyValue('--wave').trim() || 'currentColor';
    const span = band.to - band.from;
    for(let x=0; x<canvas.width; x++) {
      const played = ((x / canvas.width) * span) % duration;
      const peak = peaks[Math.min(peaks.length - 1, Math.floor((played / duration) * peaks.length))];
      const tall = Math.max(1, peak * canvas.height);
      context.fillRect(x, (canvas.height - tall) / 2, 1, tall);
    }
  }

  // a note about a sound, shown a moment
  private showNote(text: string): void {
    this.note.textContent = text;
    this.note.hidden = false;
    window.clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => { this.note.hidden = true; }, NOTE_MS);
  }

  /** the playhead on the ruler at the frame, whatever the rows' scroll */
  private place(): void {
    const film = this.film;
    const box = this.lanes();
    this.playhead.hidden = !film || !box;
    if(!film || !box) return;
    const share = (film.frames.length > 1) ? (this.frame / film.frames.length) : 0;
    this.playhead.style.transform = `translateX(${(box.left + (share * box.width)).toFixed(2)}px)`;
  }

  /** the lanes' span within the timeline (its left and width, CSS pixels), read off
   *  the ruler, which stays at the top */
  private lanes(): Readonly<{ left: number; width: number; }> | undefined {
    const ruler = this.scroller.querySelector<HTMLElement>('.ruler');
    if(!ruler) return undefined;
    const [lane, root] = [ruler.getBoundingClientRect(), this.root.getBoundingClientRect()];
    return (lane.width > 0) ? { left: lane.left - root.left - this.root.clientLeft, width: lane.width } : undefined;
  }

  /** the timeline resized: keys grouped again at the new width, the playhead placed */
  private resized(): void {
    const ruler = this.scroller.querySelector<HTMLElement>('.ruler');
    if(ruler && (Math.abs(ruler.getBoundingClientRect().width - this.laneWidth) >= 1)) this.layout();
    else this.place();
  }

  // == Scrubbing =================================================================
  private press(event: PointerEvent): void {
    const film = this.film;
    if(!film || (event.button !== 0)) return;
    if(held(event)) {
      // the modifier and a press: the moment pinned in the inspector, the film where it is
      const moment = this.momentUnder(event.clientX, event.target as Element);
      if(moment) { event.preventDefault(); this.pinned = moment; this.update(); }
      return;
    }
    const key = (event.target as HTMLElement).closest<HTMLElement>('.key');
    if(key) {
      const group = this.groupOf(key);
      if(group) this.host.seek(Math.round(group.time * film.scene.fps));
      return;
    } /* else -- not on a key: a sound, or the lane */
    const sound = (event.target as HTMLElement).closest<HTMLElement>('.band--sound:not(.is-fixed)');
    const band = sound && this.bandOf(sound);
    if(sound && band?.cue) {
      event.preventDefault();
      this.dragging = { band, mark: sound, startX: event.clientX };
      this.dragged = 0;
      this.scroller.setPointerCapture(event.pointerId);
      return;
    } /* else -- the lane, or a sound the scene places: a scrub */
    if(!(event.target as HTMLElement).closest('.lane, .ruler')) return;
    this.scrubbing = true;
    this.root.classList.add('is-scrubbing');
    this.scroller.setPointerCapture(event.pointerId);
    this.scrub(event);
  }

  // .. Moving a sound ............................................................
  // the dragged sound follows the pointer along its row
  private drag(event: PointerEvent): void {
    const dragging = this.dragging!;
    this.dragged = event.clientX - dragging.startX;
    if(Math.abs(this.dragged) < DRAG_SLOP) return/*still a press*/;
    this.root.classList.add('is-moving');
    dragging.mark.style.transform = `translateX(${this.dragged}px)`;
  }

  // the dragged sound let go: a press seeks where it fell, a drag moves the sound to
  // the frame it was let go on (the scene then holds it, and draws it there)
  private async drop(event: PointerEvent): Promise<void> {
    const { band, mark } = this.dragging!;
    const film = this.film!;
    const moved = this.dragged;
    this.dragging = undefined;
    this.root.classList.remove('is-moving');
    if(Math.abs(moved) < DRAG_SLOP) { mark.style.transform = ''; this.scrub(event); return; }
    const time = Math.max(0, Math.round((band.cue!.time + ((moved / Math.max(1, this.laneWidth)) * film.scene.length)) * film.scene.fps) / film.scene.fps);
    const refused = await this.host.moveSound(band.cue!, time);
    if(refused !== undefined) { mark.style.transform = ''; this.showNote(refused); }
  }

  // a drag the browser took away: the sound back where it was
  private cancelDrag(): void {
    if(!this.dragging) return;
    this.dragging.mark.style.transform = '';
    this.dragging = undefined;
    this.root.classList.remove('is-moving');
  }

  // the band a sound's element draws
  private bandOf(mark: HTMLElement): RowBand | undefined {
    for(const laid of this.laid) {
      const index = laid.bands.indexOf(mark);
      if(index >= 0) return laid.row.bands[index];
    }
    return undefined/*not this film's*/;
  }

  private scrub(event: PointerEvent): void {
    const at = this.momentAt(event.clientX);
    if(at) this.host.seek(at.frame);
  }

  /** the moment under a page x on the lanes: its share of the film, its time and its
   *  frame (as a scrub there seeks), or undefined off the lanes */
  private momentAt(x: number): Readonly<{ share: number; time: number; frame: number; }> | undefined {
    const film = this.film;
    const ruler = this.scroller.querySelector<HTMLElement>('.ruler');
    if(!film || !ruler) return undefined;
    const box = ruler.getBoundingClientRect();
    if(box.width <= 0) return undefined;
    const share = Math.min(Math.max((x - box.left) / box.width, 0), 1);
    return { share, time: share * film.scene.length, frame: Math.min(film.frames.length - 1, Math.floor(share * film.frames.length)) };
  }

  private key(event: KeyboardEvent): void {
    const film = this.film;
    if(!film) return;
    const handled: Record<string, () => void> = {
      ArrowLeft: () => this.host.step(event.shiftKey ? -film.scene.fps : -1),
      ArrowRight: () => this.host.step(event.shiftKey ? film.scene.fps : 1),
      Home: () => this.host.seek(0),
      End: () => this.host.seek(film.frames.length - 1),
      ' ': () => this.host.toggle(),
      Escape: () => this.unpin(),
    };
    const act = handled[event.key];
    if(!act) return;
    event.preventDefault();
    act();
  }

  // == Hover =====================================================================
  /** the pointer over a moment (none off the lanes): the line follows it at once, the
   *  inspector after */
  private hover(moment: Moment | undefined): void {
    this.hovered = moment;
    this.follow();
    this.update();
  }

  /** the line following the pointer, its time on the ruler and the modifier named
   *  while it is not held: each written only when it changes */
  private follow(): void {
    const film = this.film, moment = this.hovered;
    const box = (film && moment) ? this.lanes() : undefined;
    this.hoverLine.hidden = !box;
    if(!film || !moment || !box) return;
    this.hoverLine.style.transform = `translateX(${(box.left + (moment.share * box.width)).toFixed(2)}px)`;
    if(moment.frame !== this.lineFrame) { this.lineFrame = moment.frame; this.hoverTime.textContent = `${film.frames[moment.frame].time.toFixed(2)} s`; }
    const hint = this.modifier ? '' : `${MODIFIER_NAME} for details`;
    if(hint !== this.lineHint) { this.lineHint = hint; this.hoverTime.dataset.hint = hint; }
  }

  /** asks for one update of the inspector once the task's moves are done: the moves
   *  between gather into it */
  private update(): void {
    if(this.updating !== undefined) return/*one waits*/;
    this.updating = window.setTimeout(() => { this.updating = undefined; this.redraw(); }, 0);
  }

  /** the pinned moment's line, and the inspector: the moment under the pointer while
   *  the modifier is held, else the key focused, else the moment pinned, else the
   *  film's sheet */
  private redraw(): void {
    const film = this.film;
    const box = (film && this.pinned) ? this.lanes() : undefined;
    this.pinLine.hidden = !box;
    if(this.pinned && box) this.pinLine.style.transform = `translateX(${(box.left + (this.pinned.share * box.width)).toFixed(2)}px)`;

    const hovered = this.hovered;
    const shown = (this.modifier && hovered) ? { moment: hovered, pinned: false } : this.focusedKey ? this.keyMoment(this.focusedKey) : this.pinned ? { moment: this.pinned, pinned: true } : undefined;
    if(!film || !shown) { this.inspector.hide(); this.light(undefined); this.inspecting = undefined; window.clearTimeout(this.restTimer); return; }
    this.inspect(shown.moment, shown.pinned);
  }

  /** the moment at a page x on the element under the pointer (the lanes or the ruler),
   *  with the marks there on a row; undefined off them */
  private momentUnder(x: number, hit: Element | null): Moment | undefined {
    const film = this.film;
    if(!film || !hit || !this.scroller.contains(hit) || !hit.closest('.lane, .ruler')) return undefined;
    const at = this.momentAt(x);
    if(!at) return undefined;
    const index = hit.closest<HTMLElement>('.row[data-row]')?.dataset.row;
    const row = (index === undefined) ? undefined : Number(index);
    const laid = (row === undefined) ? undefined : this.laid[row];
    const near = (NEAR * film.scene.length) / Math.max(1, this.laneWidth);
    const frame = Math.min(film.frames.length - 1, Math.round(at.time * film.scene.fps))/*the frame nearest the pointer*/;
    return { frame, share: at.share, time: at.time, row, ...(laid ? { under: underAt(laid.groups, laid.row, at.time, near) } : {}) };
  }

  /** a key focused: its group's moment */
  private keyMoment(key: HTMLElement): Readonly<{ moment: Moment; pinned: boolean; }> | undefined {
    const film = this.film;
    const group = film && this.groupOf(key);
    if(!film || !group) return undefined;
    const row = Number(key.closest<HTMLElement>('.row[data-row]')!.dataset.row);
    key.setAttribute('aria-describedby', 'inspect');
    return { moment: { frame: Math.min(film.frames.length - 1, Math.round(group.time * film.scene.fps)), share: group.time / film.scene.length, time: group.time, row, under: { groups: [group], bands: [], notches: [] } }, pinned: false };
  }

  /** a moment in the inspector, its marks lit on the lane */
  private inspect(moment: Moment, pinned: boolean): void {
    const film = this.film!;
    const shown = film.frames[moment.frame];
    const laid = (moment.row === undefined) ? undefined : this.laid[moment.row];
    const shot = cameraShots(film.scene.camera, film.scene.length).filter(each => each.from <= (shown.time + 1e-9)).pop();
    const color = laid?.row.color ?? '--ink';
    const under = moment.under;
    const marks: InspectedMark[] = [
      ...(under?.groups ?? []).flatMap(group => group.keys.map(key => ({ shape: key.face ? 'face' as const : 'key' as const, color, said: key }))),
      ...(under?.bands ?? []).map(band => ({ shape: band.kind, color, said: band })),
      ...(under?.notches ?? []).map(notch => ({ shape: 'close' as const, color: '--brick-red', said: notch })),
    ];
    const inspected: Inspected = {
      frame: moment.frame, frames: film.frames.length, time: shown.time,
      ...((shot?.name !== undefined) ? { shot: shot.name } : {}), ...((shown.set !== undefined) ? { set: shown.set } : {}),
      row: laid ? { name: laid.row.name, color, standing: standingAt(laid.row, shown) } : { name: 'The film', color: '--ink', standing: [] },
      marks,
    };
    this.inspector.show(inspected, pinned);
    this.light(laid && under && { laid, under });
    if(moment.frame !== this.inspecting) { this.inspecting = moment.frame; this.want(moment.frame); }
  }

  /** the marks under the moment lit on the lane, the rest as they were: only those
   *  that change are touched */
  private light(at: Readonly<{ laid: Laid; under: Under; }> | undefined): void {
    const next = at ? [
      ...at.under.groups.map(group => at.laid.keys[at.laid.groups.indexOf(group)]),
      ...at.under.bands.map(band => at.laid.bands[at.laid.row.bands.indexOf(band)]),
      ...at.under.notches.map(notch => at.laid.notches[at.laid.row.notches.indexOf(notch)]),
    ].filter(Boolean) : [];
    for(const mark of this.lit) if(!next.includes(mark)) mark.classList.remove('is-lit');
    for(const mark of next) if(!this.lit.includes(mark)) mark.classList.add('is-lit');
    this.lit = next;
  }

  // .. Pictures ..................................................................
  /** the inspector's picture for a frame: kept, else the picture track's nearest at
   *  once and the exact one asked of the studio once it rests there */
  private want(frame: number): void {
    const kept = this.pictures.get(frame);
    if(kept) { this.inspector.setPicture(frame, kept, true); return; }
    this.inspector.setPicture(frame, this.host.nearPicture(frame), false);
    window.clearTimeout(this.restTimer);
    this.restTimer = window.setTimeout(() => this.ask(frame), PICTURE_REST_MS);
  }

  /** asks the studio for a frame's picture, one at a time: a frame wanted meanwhile
   *  is asked next, when the inspector still shows it */
  private async ask(frame: number): Promise<void> {
    if(this.asking !== undefined) { this.waiting = frame; return; }
    const film = this.film;
    this.asking = frame;
    try {
      const picture = await this.host.picture(frame);
      if(!picture || (film !== this.film)) return/*none now, or another film*/;
      this.pictures.set(frame, picture);
      if(this.pictures.size > MAX_PICTURES) this.pictures.delete(this.pictures.keys().next().value!/*the oldest kept*/);
      this.inspector.setPicture(frame, picture, true);
    } finally {
      this.asking = undefined;
      const next = this.waiting;
      this.waiting = undefined;
      if((next !== undefined) && (next === this.inspecting) && !this.pictures.has(next)) void this.ask(next);
    }
  }

  /** the key group a diamond draws */
  private groupOf(key: HTMLElement): KeyGroup | undefined {
    const row = key.closest<HTMLElement>('.row[data-row]')?.dataset.row;
    return (row === undefined) ? undefined : this.laid[Number(row)]?.groups[Number(key.dataset.group)];
  }
}

// == Util ========================================================================
/** whether an event comes with the modifier held */
const held = (event: MouseEvent): boolean => MAC ? event.metaKey : event.ctrlKey;

// == DOM =========================================================================
const element = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), { className });
