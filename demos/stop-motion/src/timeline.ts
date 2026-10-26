import { cameraShots, filmLengthOf, filmTimeOf, frameAtTime, sceneTimeOf, shotAt, type Film } from './film';
import type { Inspected, InspectedMark, Inspector } from './inspector';
import type { ClosePair } from './measure';
import type { SoundCue } from './recorder';
import type { Lit, MarkedSpan } from './review-surface';
import { bandTiers, groupReading, keyGroups, rowsOf, standingAt, underAt, type KeyGroup, type Row, type RowBand, type SoundReading, type SoundsKnown, type Under } from './timeline-marks';
import { clampZoom, labelOf, labelStep, labelWidth, maxZoom, spanInView, ZOOM_STEP } from './timeline-view';

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
// The whole film stands across the lanes first; zoomed in (SEE: timeline-view.ts),
// the lanes widen and scroll sideways under the names: a pinch, or ⌥ (Alt) with the
// wheel, zooms about the pointer, = and - about the playhead, \ fits the whole film
// (again, the zoom before it), and the ruler's corner holds the same as buttons. The
// span in view is told to the host, which frames it on the picture track; while the
// film plays, a playhead leaving the view turns it a page, and a scrub or a sound
// dragged past an end of the view scrolls it. While marking (SEE: review-surface.ts),
// a drag across the lanes selects a span of frames over the rows it crosses instead
// of scrubbing, drawn as a band over each row while dragged, and marked as the pointer
// lifts; the ruler still scrubs. The spans marked, or those a note shows, stay lit on
// their rows' lanes until marking ends or another note shows.
// each sound draws as its waveform over the span it plays; one whose time the scene
// writes as a number drags along its row to a new time, which the scene then holds,
// and one written otherwise says where its time is written. A sound whose file is
// still being read pulses, saying so, and one whose file could not be read says that
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
/** how much a wheel's or a pinch's delta zooms, and the most one event zooms */
const WHEEL_ZOOM = 0.01;
const MAX_WHEEL_DELTA = 50;
/** how far a lane stands in from its cell's ends (CSS pixels: SEE: styles.scss .lane) */
const LANE_INSET = 14;
/** what a sound's mark says while its file is not heard */
const READING_TEXT: Readonly<Record<SoundReading, string>> = { loading: 'Loading…', unread: 'could not be read' };

// == Types =======================================================================
export type TimelineHost = Readonly<{
  seek: (index: number) => void;
  step: (delta: number) => void;
  toggle: () => void;
  /** a span dragged across the lanes while marking: its frames and the rows it crosses */
  marked: (span: MarkedSpan) => void;
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
  /** the span of the film in view (shares of it, 0 to 1), each time it changes */
  viewed: (span: Readonly<{ from: number; to: number; }>) => void;
  /** shapes how an actor walks (its walk's band double-clicked: SEE gait-view.ts) */
  gait: (actor: string) => void;
  /** follows an actor through the film in the studios, its ghosts and path drawn (its
   *  row's name pressed); none to follow no one */
  followActor: (actor: string | undefined) => void;
}>;

/** the film's sounds as the timeline draws them: their lengths and names, and each
 *  one's waveform (its loudest sample in equal slices, 0 to 1) once it is read */
export type TimelineSounds = SoundsKnown & Readonly<{ peaks: (sound: string) => Float32Array | undefined; }>;

/** a row as laid out: its line and lane, its marks' elements, each key group's diamond */
type Laid = Readonly<{ row: Row; line: HTMLElement; lane: HTMLElement; groups: ReadonlyArray<KeyGroup>; keys: ReadonlyArray<HTMLElement>; bands: ReadonlyArray<HTMLElement>; notches: ReadonlyArray<HTMLElement>; }>;

/** a span being dragged while marking: the frame and row (laid index) where the press
 *  began, and those under the pointer now */
type Selecting = Readonly<{ from: number; fromRow: number; to: number; toRow: number; }>;

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
  /** the actor followed in the studios, while one is, and each actor's row name */
  private followed: string | undefined;
  private actorNames = new Map<string, HTMLElement>();
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
  /** a sound being dragged: its band, its element, where the press began and the
   *  lanes' scroll then */
  private dragging: Readonly<{ band: RowBand; mark: HTMLElement; startX: number; startScroll: number; }> | undefined;
  /** whether a drag across the lanes marks a span (SEE: review-surface.ts), the span
   *  being dragged, and the spans lit on their rows (those marked, or a note's shown) */
  private marking = false;
  private selecting: Selecting | undefined;
  private lights: ReadonlyArray<Lit> = [];
  /** the lanes' zoom (1: the whole film across them), the zoom a fit left (a second fit
   *  returns to it, where it stood), and a zoom waiting for the next animation frame (a
   *  pinch's moves gather into one) with what it holds still: a share of the film at a
   *  view x */
  private zoom = 1;
  private beforeFit: Readonly<{ zoom: number; from: number; }> | undefined;
  private zooming: Readonly<{ zoom: number; share: number; x: number; }> | undefined;
  private zoomFrame: number | undefined;
  /** the zoom a Safari pinch began at */
  private gestureZoom = 1;
  /** a scroll's waveform redraw waiting for the next animation frame */
  private wavesFrame: number | undefined;
  /** the lanes' view width (CSS pixels) as last laid out: a resize changing it lays out
   *  again, on the next animation frame */
  private shownWidth = 0;
  private resizeFrame: number | undefined;
  /** the sounds changed while a sound was held: drawn again once the gesture ends */
  private soundsStale = false;
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
    this.scroller.addEventListener('dblclick', event => {
      // the band under the pointer: the press before scrubbed, so the lanes hold the
      // pointer and the event's target is theirs
      const mark = this.root.ownerDocument.elementsFromPoint(event.clientX, event.clientY).find((under): under is HTMLElement => (under instanceof HTMLElement) && under.classList.contains('band'));
      const laid = mark && this.laid.find(each => each.bands.includes(mark));
      if(this.marking || !mark || !laid || !isWalk(laid.row, laid.row.bands[laid.bands.indexOf(mark)])) return/*marking, or not a walk*/;
      this.host.gait(laid.row.track.name);
    });
    this.scroller.addEventListener('pointermove', event => {
      if(this.selecting) { this.select(event); return; }
      if(this.dragging) { this.drag(event); return; }
      if(this.scrubbing) { this.scrub(event); return; }
      this.pointer = { x: event.clientX, y: event.clientY };
      this.modifier = held(event);
      this.hover(this.momentUnder(event.clientX, event.target as Element));
    });
    this.scroller.addEventListener('pointerleave', () => { this.pointer = undefined; this.hover(undefined); });
    const end = () => { this.scrubbing = false; root.classList.remove('is-scrubbing'); };
    this.scroller.addEventListener('pointerup', event => { if(this.selecting) this.selected(); else if(this.dragging) void this.drop(event); else end(); });
    this.scroller.addEventListener('pointercancel', () => { this.cancelSelect(); this.cancelDrag(); end(); });
    this.scroller.addEventListener('scroll', () => this.refresh(false/*its waveforms on the next frame*/));
    // a pinch arrives as the wheel with Ctrl (Safari's as its own gesture); ⌥ (Alt) with
    // the wheel zooms too. ⌘ stays the inspector's, and a plain wheel scrolls
    this.scroller.addEventListener('wheel', event => {
      if(!event.ctrlKey && !event.altKey) return/*a scroll*/;
      event.preventDefault();
      const delta = Math.min(Math.max(event.deltaY, -MAX_WHEEL_DELTA), MAX_WHEEL_DELTA);
      this.zoomAt(this.aimedZoom() * Math.exp(-delta * WHEEL_ZOOM), event.clientX);
    }, { passive: false });
    root.addEventListener('gesturestart', event => { event.preventDefault(); this.gestureZoom = this.zoom; });
    root.addEventListener('gesturechange', event => { event.preventDefault(); const gesture = event as Gesture; this.zoomAt(this.gestureZoom * gesture.scale, gesture.clientX); });
    root.addEventListener('keydown', event => this.key(event));
    root.addEventListener('focusin', event => { this.focusedKey = (event.target as HTMLElement).closest<HTMLElement>('.key') ?? undefined; this.update(); });
    root.addEventListener('focusout', () => { this.focusedKey = undefined; this.update(); });
    // the modifier pressed or let go with the pointer resting on the lanes
    view.addEventListener('keydown', event => { if(event.key === MODIFIER_KEY) { this.modifier = true; this.follow(); this.update(); } });
    view.addEventListener('keyup', event => { if(event.key === MODIFIER_KEY) { this.modifier = false; this.follow(); this.update(); } });
    view.addEventListener('blur', () => { this.modifier = false; this.follow(); this.update(); });
    // answered on the next frame: laying out again resizes the timeline itself (a sideways
    // scrollbar coming or going), never within the observer's own delivery
    new ResizeObserver(() => {
      if(this.resizeFrame !== undefined) return/*one waits*/;
      this.resizeFrame = view.requestAnimationFrame(() => { this.resizeFrame = undefined; this.resized(); });
    }).observe(root);
  }

  // == Film ======================================================================
  /** draws a film's tracks, or the empty timeline for none, with the actors that come
   *  close once the stage has sized them */
  public show(film: Film | undefined, close: ReadonlyArray<ClosePair> = []): void {
    if(film !== this.film) { this.pictures.clear(); this.waiting = undefined; this.pinned = undefined; }
    this.film = film;
    if(this.followed && !film?.scene.actors.some(actor => actor.name === this.followed)) this.followActor(undefined)/*no longer in the film*/;
    this.close = close;
    this.layout();
    this.follow()/*the lanes laid out anew*/;
    this.update();
  }

  /** follows an actor in the studios, its row's name pressed (none: no one) */
  private followActor(actor: string | undefined): void {
    this.followed = actor;
    for(const [name, element] of this.actorNames) element.setAttribute('aria-pressed', String(name === actor));
    this.host.followActor(actor);
  }

  /** lets a pinned moment go: the film's sheet again */
  public unpin(): void {
    this.pinned = undefined;
    this.update();
  }

  // .. Marking ...................................................................
  /** turns marking a span on or off (SEE: review-surface.ts): either way, nothing lit */
  public setMarking(on: boolean): void {
    this.marking = on;
    this.root.classList.toggle('is-marking', on);
    this.selecting = undefined;
    this.lights = [];
    this.drawLit();
  }

  /** lights rows over spans of frames (a note shown), in place of those lit */
  public lightSpans(lit: ReadonlyArray<Lit>): void {
    this.lights = lit;
    this.drawLit();
  }

  /** draws the film's sounds again: one read since, its length and waveform known.
   *  A sound held keeps the marks it holds, drawn again once it is let go */
  public soundsChanged(): void {
    if(this.dragging) { this.soundsStale = true; return; }
    this.layout();
  }

  /** moves the playhead to a frame. Zoomed, a playhead leaving the view (the film
   *  playing, a seek elsewhere) turns it a page on, the playhead at its left; a scrub
   *  scrolls it itself (SEE: scrub) */
  public setFrame(index: number): void {
    this.frame = index;
    const film = this.film;
    const box = this.lanes();
    const share = (film && (film.frames.length > 1)) ? (index / film.frames.length) : 0;
    if(film && box && (this.zoom > 1) && !this.scrubbing && !this.inView(box.left + (share * box.width))) this.scroller.scrollLeft = share * this.laneWidth;
    this.place();
  }

  /** shows a span of the film (shares of it, 0 to 1): zoomed so it fills the lanes'
   *  view, its start at their left, within the zoom's bounds */
  public showSpan(from: number, to: number): void {
    if(!this.film) return;
    this.zoomTo({ zoom: 1 / Math.max(to - from, 1e-6), share: from, x: this.viewBounds().left + LANE_INSET });
  }

  // == Layout ====================================================================
  private layout(): void {
    this.soundsStale = false/*every sound drawn as it stands*/;
    const film = this.film;
    const document = this.root.ownerDocument;
    this.root.classList.toggle('is-empty', !film);
    this.laid = [];
    this.actorNames.clear();
    if(!film) { this.scroller.replaceChildren(); this.place(); return; }
    const { scene } = film;
    // the lanes run in the film's own time; a mark stands where its scene time shows
    const length = filmLengthOf(film);
    const atFilm = (time: number) => `${(Math.min(Math.max(time / length, 0), 1) * 100).toFixed(3)}%`;
    const at = (time: number) => atFilm(filmTimeOf(film, time));

    // the lanes widened by the zoom, within its bounds at the view's width: the lane
    // itself exactly its shown width times the zoom, its insets as they are
    const shown = this.lanesShown();
    this.zoom = clampZoom(this.zoom, film.frames.length, shown);
    if(this.zoom > 1) this.scroller.style.setProperty('--lane-span', `${((shown * this.zoom) + (2 * LANE_INSET)).toFixed(2)}px`);
    else this.scroller.style.removeProperty('--lane-span');
    this.root.classList.toggle('is-zoomed', this.zoom > 1);

    // the ruler: a label at a step that keeps labels apart at the zoom, finer ticks each
    // frame when they fit. A last label running past the lanes stands before its tick,
    // the one before giving way where they would meet, so nothing widens the scroll
    const ruler = element(document, 'div', 'ruler');
    const lanes = shown * this.zoom;
    const step = labelStep(lanes / length, scene.fps, length);
    const ticks: Array<Readonly<{ tick: HTMLElement; x: number; width: number; }>> = [];
    for(let index=0; (index * step) <= (length + 1e-9); index++) {
      const tick = element(document, 'span', 'ruler-tick');
      tick.style.left = atFilm(index * step);
      tick.textContent = labelOf(index * step, step);
      ruler.append(tick);
      ticks.push({ tick, x: Math.min((index * step) / length, 1) * lanes, width: labelWidth(tick.textContent) });
    }
    const [before, last] = ticks.slice(-2);
    if(last && ((last.x + last.width) > (lanes + LANE_INSET))) {
      last.tick.classList.add('ruler-tick--end');
      if(before && ((before.x + before.width) > (last.x - last.width))) before.tick.textContent = ''/*its tick stands*/;
    } /* else -- the last label within the lanes' inset */
    ruler.style.setProperty('--frame', atFilm(1 / scene.fps));
    const head = element(document, 'div', 'row row--ruler');
    head.append(this.zoomControls(film), ruler);
    this.scroller.replaceChildren(head);

    // keys grouped at the lanes' width: those nearer than KEY_APART draw as one
    this.laneWidth = ruler.getBoundingClientRect().width;
    const apart = (this.laneWidth > 0) ? ((KEY_APART * scene.length) / this.laneWidth) : 0/*the scene's seconds, as its keys are timed*/;
    const body = element(document, 'div', 'rows');
    const sounds = this.host.sounds();
    this.laid = rowsOf(film, this.close, sounds).map((row, index) => {
      const laid = this.row(row, keyGroups(row.keys, apart), at);
      laid.element.dataset.row = String(index);
      body.append(laid.element);
      return laid.laid;
    });
    this.scroller.append(body);
    this.drawLit()/*on the lanes laid anew*/;
    this.shownWidth = this.lanesShown();
    this.refresh();
  }

  /** everything drawn at a place on the lanes, after their geometry changed (laid out,
   *  zoomed, scrolled, resized): the playhead, the line following the pointer (the
   *  moment now under it: a pin keeps its moment, hover follows the pointer), the pin,
   *  the waveforms (at once, or on the next frame) and the span told to the host */
  private refresh(waves = true): void {
    this.place();
    const pointer = this.pointer;
    this.hovered = pointer && this.momentUnder(pointer.x, this.root.ownerDocument.elementFromPoint(pointer.x, pointer.y));
    this.follow();
    this.update()/*the pin, and the inspector's moment*/;
    if(waves) this.drawWaves(); else this.drawWavesSoon();
    this.tellView();
  }

  // .. Zoom ......................................................................
  // the ruler's corner: zoom out, fit the whole film, zoom in, each about the playhead
  private zoomControls(film: Film): HTMLElement {
    const document = this.root.ownerDocument;
    const corner = element(document, 'span', 'row-name zoom-controls');
    const deepest = maxZoom(film.frames.length, this.lanesShown());
    const control = (name: string, label: string, enabled: boolean, act: () => void, path?: string) => {
      const button = Object.assign(element(document, 'button', `zoom-button zoom-button--${name}`), { type: 'button', title: label, ariaLabel: label, disabled: !enabled });
      if(path) button.innerHTML = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
      else button.textContent = 'Fit';
      button.addEventListener('click', act);
      return button;
    };
    corner.append(
      control('out', 'Zoom out (-)', this.zoom > 1, () => this.zoomBy(1 / ZOOM_STEP), REMOVE_ICON),
      control('fit', 'Fit the whole film (\\)', (this.zoom > 1) || !!this.beforeFit, () => this.fit()),
      control('in', 'Zoom in (=)', this.zoom < deepest, () => this.zoomBy(ZOOM_STEP), ADD_ICON),
    );
    return corner;
  }

  /** zooms by a factor about the playhead: where it stands in view stays put, or the
   *  view's middle when it stands outside it */
  private zoomBy(factor: number): void {
    const film = this.film;
    if(!film) return;
    const share = (film.frames.length > 1) ? (this.frame / film.frames.length) : 0;
    const { left, right } = this.viewBounds();
    const x = left + LANE_INSET + (share * this.laneWidth) - this.scroller.scrollLeft;
    this.zoomTo({ zoom: this.aimedZoom() * factor, share, x: ((x >= left) && (x <= right)) ? x : ((left + right) / 2) });
  }

  /** the zoom a zoom builds on: one waiting for its frame, else the lanes' (several
   *  presses or a pinch's moves within a frame each count) */
  private aimedZoom(): number {
    const film = this.film;
    const aimed = this.zooming?.zoom ?? this.zoom;
    return film ? clampZoom(aimed, film.frames.length, this.lanesShown()) : aimed;
  }

  /** zooms about a page x: the moment under it stays under it */
  private zoomAt(zoom: number, clientX: number): void {
    const at = this.momentAt(clientX);
    if(!at) return;
    this.zoomTo({ zoom, share: at.share, x: clientX - this.scroller.getBoundingClientRect().left });
  }

  /** fits the whole film; fitted, returns to the zoom a fit left, where it stood */
  private fit(): void {
    if(this.zoom > 1) {
      this.beforeFit = { zoom: this.zoom, from: spanInView(this.laneWidth, this.scroller.scrollLeft, this.lanesShown()).from };
      this.zoomTo({ zoom: 1, share: 0, x: this.viewBounds().left + LANE_INSET });
      return;
    } /* else -- the whole film already: back to the zoom before it */
    const before = this.beforeFit;
    this.beforeFit = undefined;
    if(before) this.showSpan(before.from, before.from + (1 / before.zoom));
    else this.layout()/*its fit button off*/;
  }

  /** a zoom with the share it holds at a view x, applied on the next animation frame:
   *  moves between gather into one */
  private zoomTo(zooming: Readonly<{ zoom: number; share: number; x: number; }>): void {
    this.zooming = zooming;
    if(this.zoomFrame !== undefined) return/*one waits*/;
    this.zoomFrame = this.root.ownerDocument.defaultView!.requestAnimationFrame(() => {
      this.zoomFrame = undefined;
      const next = this.zooming!;
      this.zooming = undefined;
      const film = this.film;
      if(!film) return;
      const zoom = clampZoom(next.zoom, film.frames.length, this.lanesShown());
      if(Math.abs(zoom - this.zoom) > 1e-9) { this.zoom = zoom; this.layout(); } /* else -- a pan: the lanes as they are */
      this.scroller.scrollLeft = (this.viewBounds().left + LANE_INSET + (next.share * this.laneWidth)) - next.x;
      this.refresh();
    });
  }

  /** the lanes' cell width in view: the scroll's width past the names */
  private viewWidth(): number {
    const names = parseFloat(getComputedStyle(this.root).getPropertyValue('--names')) || 0;
    return Math.max(0, this.scroller.clientWidth - names);
  }

  /** where the lanes' view lies across the scroll (CSS pixels from its left): past the
   *  names to the scroll's edge */
  private viewBounds(): Readonly<{ left: number; right: number; }> {
    const width = this.viewWidth();
    return { left: this.scroller.clientWidth - width, right: this.scroller.clientWidth };
  }

  /** how much of the lanes is in view (CSS pixels) */
  private lanesShown(): number { return Math.max(0, this.viewWidth() - (2 * LANE_INSET)); }

  /** tells the host the span in view */
  private tellView(): void {
    if(!this.film) return;
    this.host.viewed(spanInView(this.laneWidth, this.scroller.scrollLeft, this.lanesShown()));
  }

  private row(row: Row, groups: ReadonlyArray<KeyGroup>, at: (time: number) => string): Readonly<{ element: HTMLElement; laid: Laid; }> {
    const document = this.root.ownerDocument;
    const line = element(document, 'div', 'row');
    line.style.setProperty('--row', `var(${row.color})`);
    const name = element(document, 'span', 'row-name');
    name.append(Object.assign(element(document, 'b', 'row-swatch'), { ariaHidden: 'true' }), document.createTextNode(row.name));
    if(row.note) name.append(Object.assign(element(document, 'small', 'row-note'), { textContent: row.note }));
    if(row.track.kind === 'actor') {
      // pressed, the studios follow the actor: its ghosts and path about each frame
      const actor = row.track.name;
      name.classList.add('row-name--actor');
      Object.assign(name, { tabIndex: 0, title: `Show ${actor}'s ghosts and path in the studio (press again, or Escape, to let go)` });
      name.setAttribute('role', 'button');
      name.setAttribute('aria-pressed', String(this.followed === actor));
      const press = () => this.followActor((this.followed === actor) ? undefined : actor);
      name.addEventListener('click', press);
      name.addEventListener('keydown', event => { if((event.key === 'Enter') || (event.key === ' ')) { event.preventDefault(); event.stopPropagation()/*not the timeline's play*/; press(); } });
      this.actorNames.set(actor, name);
    } /* else -- the camera's, the sets', the sounds' and the film's rows follow no one */

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
      if(isWalk(row, each)) mark.title = 'Double-click to shape how it walks';
      if(each.cue) this.soundBand(mark, each.cue, each.label, each.reading);
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
      const reading = groupReading(group);
      const diamond = element(document, 'button', `${group.keys.every(key => key.face) ? 'key key--face' : 'key'}${reading ? ` is-${reading}` : ''}`);
      diamond.type = 'button';
      diamond.style.left = at(group.time);
      diamond.dataset.group = String(index);
      diamond.ariaLabel = group.keys.map(key => `${key.title}: ${key.chips.join(', ')}`).join('; ');
      if(group.keys.length > 1) diamond.append(Object.assign(element(document, 'span', 'key-count'), { textContent: `×${group.keys.length}`, ariaHidden: 'true' }));
      lane.append(diamond);
      // a sound whose file is not yet heard says so beside its key
      if(reading) {
        const note = Object.assign(element(document, 'span', `key-reading is-${reading}`), { textContent: READING_TEXT[reading], ariaHidden: 'true' });
        note.style.left = at(group.time);
        lane.append(note);
      } /* else -- nothing to say */
      return diamond;
    });
    line.append(name, lane);
    return { element: line, laid: { row, line, lane, groups, keys, bands, notches } };
  }

  // .. Sounds ....................................................................
  // a sound's band: its waveform under its name, movable or saying why not, and
  // saying so while its file is being read or could not be
  private soundBand(mark: HTMLElement, cue: SoundCue, label: string, reading: SoundReading | undefined): void {
    const document = this.root.ownerDocument;
    const why = this.host.fixed(cue);
    mark.classList.toggle('is-fixed', why !== undefined);
    if(reading) mark.classList.add(`is-${reading}`);
    mark.title = why ?? `Drag to move "${label}"`;
    const shown = reading ? `${label} · ${READING_TEXT[reading]}` : label;
    mark.append(element(document, 'canvas', 'band-wave'), Object.assign(element(document, 'span', 'band-label'), { textContent: shown }));
  }

  // every sound band's waveform, the span in view alone; again on the next animation
  // frame after a scroll (never while a sound is held: it moves as drawn)
  private drawWaves(): void {
    const sounds = this.host.sounds();
    for(const laid of this.laid) laid.row.bands.forEach((band, index) => { if(band.cue) this.drawWave(laid.bands[index], band, sounds); });
  }
  private drawWavesSoon(): void {
    if((this.wavesFrame !== undefined) || this.dragging) return;
    this.wavesFrame = this.root.ownerDocument.defaultView!.requestAnimationFrame(() => { this.wavesFrame = undefined; this.drawWaves(); });
  }

  // a sound band's waveform, its sound's slices stretched over the band (repeated
  // over and over where it plays until a time); none until the sound is read. Only the
  // band's span in the lanes' view is drawn, so no canvas outgrows what a browser
  // draws at any zoom
  private drawWave(mark: HTMLElement, band: RowBand, sounds: TimelineSounds): void {
    const canvas = mark.querySelector<HTMLCanvasElement>('.band-wave');
    const peaks = sounds.peaks(band.cue!.name);
    const duration = sounds.duration(band.cue!.name);
    const [width, height] = [mark.clientWidth, mark.clientHeight];
    if(!canvas || !peaks || !duration || (width < 1) || (height < 1)) return/*not read, or not laid out*/;
    const [inner, scroll] = [mark.getBoundingClientRect().left + mark.clientLeft/*inside its border, where the canvas stands*/, this.scroller.getBoundingClientRect()];
    const { left: viewLeft, right: viewRight } = this.viewBounds();
    const from = Math.max(0, (scroll.left + viewLeft) - inner), to = Math.min(width, (scroll.left + viewRight) - inner);
    const shown = Math.max(0, to - from);
    canvas.style.left = `${from}px`;
    canvas.style.width = `${shown}px`;
    const scale = this.root.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    [canvas.width, canvas.height] = [Math.round(shown * scale), Math.round(height * scale)];
    if(canvas.width < 1) return/*out of view*/;
    const context = canvas.getContext('2d');
    if(!context) return/*no 2D drawing here*/;
    context.fillStyle = getComputedStyle(mark).getPropertyValue('--wave').trim() || 'currentColor';
    const span = band.to - band.from;
    for(let x=0; x<canvas.width; x++) {
      const played = (((from + (x / scale)) / width) * span) % duration;
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

  /** the playhead on the ruler at the frame, whatever the rows' scroll, hidden while
   *  its moment is scrolled out of view */
  private place(): void {
    const film = this.film;
    const box = this.lanes();
    if(!film || !box) { this.playhead.hidden = true; return; }
    const share = (film.frames.length > 1) ? (this.frame / film.frames.length) : 0;
    const x = box.left + (share * box.width);
    this.playhead.hidden = !this.inView(x);
    this.playhead.style.transform = `translateX(${x.toFixed(2)}px)`;
  }

  /** whether a timeline x (CSS pixels from its left) lies in the lanes' view */
  private inView(x: number): boolean {
    const { left, right } = this.viewBounds();
    return (x >= (left + this.root.clientLeft - 0.5)) && (x <= (right + this.root.clientLeft + 0.5));
  }

  /** scrolls the lanes by how far a page x lies past an end of their view: a scrub or
   *  a drag carried past it */
  private carry(clientX: number): void {
    if(this.zoom <= 1) return/*the whole film in view*/;
    const scroll = this.scroller.getBoundingClientRect();
    const { left, right } = this.viewBounds();
    const past = (clientX < (scroll.left + left)) ? (clientX - (scroll.left + left)) : (clientX > (scroll.left + right)) ? (clientX - (scroll.left + right)) : 0;
    if(past !== 0) this.scroller.scrollLeft += past;
  }

  /** the lanes' span within the timeline (its left and width, CSS pixels), read off
   *  the ruler, which stays at the top */
  private lanes(): Readonly<{ left: number; width: number; }> | undefined {
    const ruler = this.scroller.querySelector<HTMLElement>('.ruler');
    if(!ruler) return undefined;
    const [lane, root] = [ruler.getBoundingClientRect(), this.root.getBoundingClientRect()];
    return (lane.width > 0) ? { left: lane.left - root.left - this.root.clientLeft, width: lane.width } : undefined;
  }

  /** the timeline resized: laid out again when the lanes' view changed width (keys
   *  grouped anew, the zoom's bounds and the span in view kept by its start), else
   *  everything placed again */
  private resized(): void {
    if(this.film && (Math.abs(this.lanesShown() - this.shownWidth) >= 1)) {
      const from = spanInView(this.laneWidth, this.scroller.scrollLeft, this.shownWidth).from;
      this.layout();
      this.scroller.scrollLeft = from * this.laneWidth;
      this.refresh();
      return;
    } /* else -- the lanes' view as it was */
    this.refresh();
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
    if(this.marking && (event.target as HTMLElement).closest('.lane')) { this.startSelect(event); return; }
    const key = (event.target as HTMLElement).closest<HTMLElement>('.key');
    if(key) {
      const group = this.groupOf(key);
      if(group) this.host.seek(frameAtTime(film, group.time));
      return;
    } /* else -- not on a key: a sound, or the lane */
    const sound = (event.target as HTMLElement).closest<HTMLElement>('.band--sound:not(.is-fixed)');
    const band = sound && this.bandOf(sound);
    if(sound && band?.cue) {
      event.preventDefault();
      this.dragging = { band, mark: sound, startX: event.clientX, startScroll: this.scroller.scrollLeft };
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
    this.carry(event.clientX);
    this.dragged = (event.clientX - dragging.startX) + (this.scroller.scrollLeft - dragging.startScroll)/*the lanes scrolled under it*/;
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
    if(Math.abs(moved) < DRAG_SLOP) { mark.style.transform = ''; this.redrawStale(); this.scrub(event); return; }
    const fell = Math.max(0, Math.round((filmTimeOf(film, band.cue!.time) + ((moved / Math.max(1, this.laneWidth)) * filmLengthOf(film))) * film.scene.fps) / film.scene.fps)/*the film's frame it fell on*/;
    const time = Math.round(sceneTimeOf(film, fell) * 1000) / 1000;
    const refused = await this.host.moveSound(band.cue!, time);
    if(refused !== undefined) { mark.style.transform = ''; this.showNote(refused); }
    this.redrawStale()/*the move settled: a sound read meanwhile drawn*/;
  }

  // a drag the browser took away: the sound back where it was
  private cancelDrag(): void {
    if(!this.dragging) return;
    this.dragging.mark.style.transform = '';
    this.dragging = undefined;
    this.root.classList.remove('is-moving');
    this.redrawStale();
  }

  // the sounds drawn again when they changed while one was held
  private redrawStale(): void {
    if(this.soundsStale && !this.dragging) this.layout();
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
    this.carry(event.clientX);
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
    return { share, time: sceneTimeOf(film, share * filmLengthOf(film)), frame: Math.min(film.frames.length - 1, Math.floor(share * film.frames.length)) };
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
      Escape: () => { if(this.pinned) this.unpin(); else if(this.followed) this.followActor(undefined); },
      '=': () => this.zoomBy(ZOOM_STEP), '+': () => this.zoomBy(ZOOM_STEP),
      '-': () => this.zoomBy(1 / ZOOM_STEP), '_': () => this.zoomBy(1 / ZOOM_STEP),
      '\\': () => this.fit(),
    };
    const act = handled[event.key];
    if(!act) return;
    event.preventDefault();
    act();
  }

  // == Marking ===================================================================
  // a press on the lanes while marking: the span begins at its frame and row
  private startSelect(event: PointerEvent): void {
    const at = this.momentAt(event.clientX), row = this.rowAt(event.clientY);
    if(!at || (row === undefined)) return/*no lanes laid*/;
    event.preventDefault();
    this.selecting = { from: at.frame, fromRow: row, to: at.frame, toRow: row };
    this.scroller.setPointerCapture(event.pointerId);
    this.drawLit();
  }

  // the span follows the pointer, across frames and rows, the lanes scrolling past an
  // end of their view
  private select(event: PointerEvent): void {
    const selecting = this.selecting!;
    this.carry(event.clientX);
    const at = this.momentAt(event.clientX), row = this.rowAt(event.clientY);
    const next = { ...selecting, ...(at ? { to: at.frame } : {}), ...((row !== undefined) ? { toRow: row } : {}) };
    if((next.to === selecting.to) && (next.toRow === selecting.toRow)) return/*the same span*/;
    this.selecting = next;
    this.drawLit();
  }

  // the pointer lifted: the span marked and kept lit on its rows
  private selected(): void {
    const span = this.spanOf(this.selecting!);
    this.selecting = undefined;
    this.lights = [...this.lights, { first: span.first, last: span.last, rows: span.rows.map(row => row.name) }];
    this.drawLit();
    this.host.marked(span);
  }

  // a drag the browser took away: no span marked
  private cancelSelect(): void {
    if(!this.selecting) return;
    this.selecting = undefined;
    this.drawLit();
  }

  /** a span being dragged as its frames and the rows it crosses, in the timeline's order */
  private spanOf(selecting: Selecting): MarkedSpan {
    const [top, bottom] = [Math.min(selecting.fromRow, selecting.toRow), Math.max(selecting.fromRow, selecting.toRow)];
    return { first: Math.min(selecting.from, selecting.to), last: Math.max(selecting.from, selecting.to), rows: this.laid.slice(top, bottom + 1).map(laid => laid.row) };
  }

  /** the row (laid index) at a page y: above the rows the first, below them the last */
  private rowAt(y: number): number | undefined {
    if(this.laid.length < 1) return undefined;
    const index = this.laid.findIndex(laid => y < laid.line.getBoundingClientRect().bottom);
    return (index < 0) ? (this.laid.length - 1) : index;
  }

  /** the spans lit, and the one being dragged, each a band over its frames on each of
   *  its rows' lanes (a row by its name; one the film no longer has, none) */
  private drawLit(): void {
    this.scroller.querySelectorAll('.marked').forEach(band => band.remove());
    const film = this.film;
    if(!film) return;
    const frames = film.frames.length;
    const draw = (first: number, last: number, laid: Laid | undefined, className: string) => {
      if(!laid) return;
      const band = element(this.root.ownerDocument, 'span', className);
      band.style.left = `${((Math.max(0, first) / frames) * 100).toFixed(3)}%`;
      band.style.width = `${(((Math.min(last, frames - 1) + 1 - Math.max(0, first)) / frames) * 100).toFixed(3)}%`;
      laid.lane.prepend(band)/*under the row's own marks*/;
    };
    for(const lit of this.lights) for(const name of lit.rows) draw(lit.first, lit.last, this.laid.find(laid => laid.row.name === name), 'marked');
    if(this.selecting) {
      const span = this.spanOf(this.selecting);
      for(const row of span.rows) draw(span.first, span.last, this.laid.find(laid => laid.row === row), 'marked is-selecting');
    } /* else -- nothing being dragged */
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
    const x = box.left + (moment.share * box.width);
    this.hoverLine.hidden = !this.inView(x);
    this.hoverLine.style.transform = `translateX(${x.toFixed(2)}px)`;
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
    const pinX = (this.pinned && box) ? (box.left + (this.pinned.share * box.width)) : undefined;
    this.pinLine.hidden = (pinX === undefined) || !this.inView(pinX);
    if(pinX !== undefined) this.pinLine.style.transform = `translateX(${pinX.toFixed(2)}px)`;

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
    const frame = frameAtTime(film, at.time)/*the frame nearest the pointer*/;
    return { frame, share: at.share, time: at.time, row, ...(laid ? { under: underAt(laid.groups, laid.row, at.time, near) } : {}) };
  }

  /** a key focused: its group's moment */
  private keyMoment(key: HTMLElement): Readonly<{ moment: Moment; pinned: boolean; }> | undefined {
    const film = this.film;
    const group = film && this.groupOf(key);
    if(!film || !group) return undefined;
    const row = Number(key.closest<HTMLElement>('.row[data-row]')!.dataset.row);
    key.setAttribute('aria-describedby', 'inspect');
    return { moment: { frame: frameAtTime(film, group.time), share: filmTimeOf(film, group.time) / filmLengthOf(film), time: group.time, row, under: { groups: [group], bands: [], notches: [] } }, pinned: false };
  }

  /** a moment in the inspector, its marks lit on the lane */
  private inspect(moment: Moment, pinned: boolean): void {
    const film = this.film!;
    const shown = film.frames[moment.frame];
    const laid = (moment.row === undefined) ? undefined : this.laid[moment.row];
    const shot = shotAt(cameraShots(film.scene.camera, film.scene.length), shown.time);
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
/** Safari's pinch: how far it has scaled since it began, and where */
type Gesture = UIEvent & Readonly<{ scale: number; clientX: number; }>;

/** Material Symbols' add and remove, for the zoom buttons */
const ADD_ICON = 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z';
const REMOVE_ICON = 'M200-440v-80h560v80H200Z';

/** whether an event comes with the modifier held */
const held = (event: MouseEvent): boolean => MAC ? event.metaKey : event.ctrlKey;

/** whether a band is an actor's walk: what adds its gait to the pose, whose shape the
 *  Gait mode edits */
const isWalk = (row: Row, band: RowBand | undefined): row is Row & Readonly<{ track: Extract<Row['track'], { kind: 'actor'; }>; }> => (row.track.kind === 'actor') && (band?.label === 'walk');

// == DOM =========================================================================
const element = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), { className });
