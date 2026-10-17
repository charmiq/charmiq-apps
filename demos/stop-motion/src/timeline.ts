import { cameraShots, type Film } from './film';
import type { ClosePair } from './measure';
import { Peek, type PeekContent, type PeekMark } from './peek';
import { bandTiers, keyGroups, rowsOf, standingAt, underAt, type KeyGroup, type Row } from './timeline-marks';

// the timeline: one row per track (SEE: timeline-marks.ts), each key a diamond at its
// time (keys too near to tell apart one diamond, counted) and each function of time a
// band over its span (bands sharing a span stacked), under a ruler of seconds and
// frames. The rows scroll; the playhead and the line following the pointer stand over
// them, placed on the ruler, whatever the scroll. A press or a drag anywhere on the
// ruler or the lanes scrubs the film; a key's diamond seeks to it. Hovering shows a
// card of the moment under the pointer (SEE: peek.ts): the frame's picture, where the
// row's track stands and every mark there, lit on the lane; a key focused shows its
// card too. The keyboard steps frames (arrows), jumps to the ends (Home, End), plays
// (Space) and puts the card away (Escape)
// ********************************************************************************
// == Constants ===================================================================
/** how near two keys draw (CSS pixels) before they draw as one diamond */
const KEY_APART = 9;
/** how near the pointer (CSS pixels) a key or a notch is under it */
const NEAR = 6;
/** how long the pointer rests on a frame before its exact picture is asked of the
 *  studio: a pass across the timeline asks for none */
const PICTURE_REST_MS = 90;
/** the most exact pictures kept for a film */
const MAX_PICTURES = 120;

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
}>;

/** a row as laid out: its marks' elements, each key group's diamond */
type Laid = Readonly<{ row: Row; groups: ReadonlyArray<KeyGroup>; keys: ReadonlyArray<HTMLElement>; bands: ReadonlyArray<HTMLElement>; notches: ReadonlyArray<HTMLElement>; }>;

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
  private readonly peek: Peek;
  private laid: ReadonlyArray<Laid> = [];
  /** the lanes' width (CSS pixels) the keys were grouped at */
  private laneWidth = 0;
  private frame = 0;
  private scrubbing = false;
  /** the marks lit under the pointer, and the frame the card shows */
  private lit: ReadonlyArray<HTMLElement> = [];
  private peeking: number | undefined;
  /** the film's exact pictures, by frame, and the one asked of the studio */
  private readonly pictures = new Map<number, string>();
  private asking: number | undefined;
  private waiting: number | undefined;
  private restTimer: number | undefined;

  public constructor(private readonly root: HTMLElement, private readonly host: TimelineHost) {
    const document = root.ownerDocument;
    root.tabIndex = 0;
    this.scroller = element(document, 'div', 'timeline-scroll');
    this.over = element(document, 'div', 'timeline-over');
    this.playhead = element(document, 'div', 'playhead');
    this.playhead.append(element(document, 'i', 'playhead-knob'));
    this.hoverLine = element(document, 'div', 'hover-line');
    this.hoverTime = element(document, 'span', 'hover-time');
    this.hoverLine.append(this.hoverTime);
    this.hoverLine.hidden = true;
    this.over.append(this.hoverLine, this.playhead);
    root.replaceChildren(this.scroller, this.over);
    this.peek = new Peek(document);

    this.scroller.addEventListener('pointerdown', event => this.press(event));
    this.scroller.addEventListener('pointermove', event => { if(this.scrubbing) this.scrub(event); else this.hover(event); });
    this.scroller.addEventListener('pointerleave', () => { if(!this.scrubbing) this.unpeek(); });
    const end = () => { this.scrubbing = false; root.classList.remove('is-scrubbing'); };
    this.scroller.addEventListener('pointerup', end);
    this.scroller.addEventListener('pointercancel', end);
    this.scroller.addEventListener('scroll', () => this.unpeek()/*the rows moved from under the card*/);
    root.addEventListener('keydown', event => this.key(event));
    root.addEventListener('focusin', event => this.focused(event.target as HTMLElement));
    root.addEventListener('focusout', () => this.unpeek());
    new ResizeObserver(() => this.resized()).observe(root);
  }

  // == Film ======================================================================
  /** draws a film's tracks, or the empty timeline for none, with the actors that come
   *  close once the stage has sized them */
  public show(film: Film | undefined, close: ReadonlyArray<ClosePair> = []): void {
    if(film !== this.film) { this.pictures.clear(); this.waiting = undefined; }
    this.film = film;
    this.close = close;
    this.unpeek();
    this.layout();
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
    this.laid = rowsOf(film, this.close).map((row, index) => {
      const laid = this.row(row, keyGroups(row.keys, apart), at);
      laid.element.dataset.row = String(index);
      body.append(laid.element);
      return laid.laid;
    });
    this.scroller.append(body);
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
    const key = (event.target as HTMLElement).closest<HTMLElement>('.key');
    if(key) {
      const group = this.groupOf(key);
      if(group) this.host.seek(Math.round(group.time * film.scene.fps));
      return;
    }
    if(!(event.target as HTMLElement).closest('.lane, .ruler')) return;
    this.unpeek()/*the studio shows the frame as it scrubs*/;
    this.scrubbing = true;
    this.root.classList.add('is-scrubbing');
    this.scroller.setPointerCapture(event.pointerId);
    this.scrub(event);
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
      Escape: () => this.unpeek(),
    };
    const act = handled[event.key];
    if(!act) return;
    event.preventDefault();
    act();
  }

  // == Hover =====================================================================
  /** the card of the moment under the pointer: the row it is over (none over the
   *  ruler) and the marks there, lit */
  private hover(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const moment = (target.closest('.lane, .ruler')) ? this.momentAt(event.clientX) : undefined;
    if(!moment) { this.unpeek(); return; }
    const row = target.closest<HTMLElement>('.row')!/*the ruler's or a track's*/;
    const index = row.dataset.row;
    const laid = (index !== undefined) ? this.laid[Number(index)] : undefined;
    const film = this.film!;
    const near = (NEAR * film.scene.length) / Math.max(1, this.laneWidth);
    const frame = Math.min(film.frames.length - 1, Math.round(moment.time * film.scene.fps))/*the frame nearest the pointer*/;
    this.peekAt(frame, moment.share, laid, laid && underAt(laid.groups, laid.row, moment.time, near), event.clientX, row);
  }

  /** a key focused: its group's card, beside the key */
  private focused(target: HTMLElement): void {
    const key = target.closest<HTMLElement>('.key');
    const film = this.film;
    const group = key && this.groupOf(key);
    if(!key || !film || !group) return;
    const laid = this.laid[Number(key.closest<HTMLElement>('.row[data-row]')!.dataset.row)];
    const frame = Math.min(film.frames.length - 1, Math.round(group.time * film.scene.fps));
    const box = key.getBoundingClientRect();
    key.setAttribute('aria-describedby', this.peek.id);
    this.peekAt(frame, group.time / film.scene.length, laid, { groups: [group], bands: [], notches: [] }, box.left + (box.width / 2), key.closest<HTMLElement>('.row')!);
  }

  /** the card of a frame beside a row (the ruler's for none), the marks under the
   *  pointer listed and lit, the line following it at `share` of the film */
  private peekAt(frame: number, share: number, laid: Laid | undefined, under: ReturnType<typeof underAt> | undefined, x: number, row: HTMLElement): void {
    const film = this.film!;
    const shown = film.frames[frame];
    const shot = cameraShots(film.scene.camera, film.scene.length).filter(each => each.from <= (shown.time + 1e-9)).pop();
    const color = laid?.row.color ?? '--ink';
    const marks: PeekMark[] = [
      ...(under?.groups ?? []).flatMap(group => group.keys.map(key => ({ shape: key.face ? 'face' as const : 'key' as const, color, said: key }))),
      ...(under?.bands ?? []).map(band => ({ shape: band.kind, color, said: band })),
      ...(under?.notches ?? []).map(notch => ({ shape: 'close' as const, color: '--brick-red', said: notch })),
    ];
    const content: PeekContent = {
      frame, frames: film.frames.length, time: shown.time,
      ...((shot?.name !== undefined) ? { shot: shot.name } : {}), ...((shown.set !== undefined) ? { set: shown.set } : {}),
      row: laid ? { name: laid.row.name, color, standing: standingAt(laid.row, shown) } : { name: 'The film', color: '--ink', standing: [] },
      marks,
    };
    const box = row.getBoundingClientRect();
    this.peek.show(content, { x, top: box.top, bottom: box.bottom });
    this.light(laid, under);
    this.follow(share, frame);
    if(frame !== this.peeking) { this.peeking = frame; this.want(frame); }
  }

  /** the marks under the pointer lit on the lane, the rest as they were */
  private light(laid: Laid | undefined, under: ReturnType<typeof underAt> | undefined): void {
    const next = (laid && under) ? [
      ...under.groups.map(group => laid.keys[laid.groups.indexOf(group)]),
      ...under.bands.map(band => laid.bands[laid.row.bands.indexOf(band)]),
      ...under.notches.map(notch => laid.notches[laid.row.notches.indexOf(notch)]),
    ] : [];
    for(const mark of this.lit) if(!next.includes(mark)) mark.classList.remove('is-lit');
    for(const mark of next) mark.classList.add('is-lit');
    this.lit = next;
  }

  /** the line following the pointer, its time on the ruler */
  private follow(share: number, frame: number): void {
    const box = this.lanes();
    const film = this.film!;
    this.hoverLine.hidden = !box;
    if(!box) return;
    this.hoverLine.style.transform = `translateX(${(box.left + (share * box.width)).toFixed(2)}px)`;
    this.hoverTime.textContent = `${film.frames[frame].time.toFixed(2)} s`;
  }

  private unpeek(): void {
    this.peek.hide();
    this.light(undefined, undefined);
    this.hoverLine.hidden = true;
    this.peeking = undefined;
    window.clearTimeout(this.restTimer);
  }

  // .. Pictures ..................................................................
  /** the card's picture for a frame: kept, else the picture track's nearest at once
   *  and the exact one asked of the studio once the pointer rests there */
  private want(frame: number): void {
    const kept = this.pictures.get(frame);
    if(kept) { this.peek.setPicture(frame, kept, true); return; }
    this.peek.setPicture(frame, this.host.nearPicture(frame), false);
    window.clearTimeout(this.restTimer);
    this.restTimer = window.setTimeout(() => this.ask(frame), PICTURE_REST_MS);
  }

  /** asks the studio for a frame's picture, one at a time: a frame wanted meanwhile
   *  is asked next, when the card still shows it */
  private async ask(frame: number): Promise<void> {
    if(this.asking !== undefined) { this.waiting = frame; return; }
    const film = this.film;
    this.asking = frame;
    try {
      const picture = await this.host.picture(frame);
      if(!picture || (film !== this.film)) return/*none now, or another film*/;
      this.pictures.set(frame, picture);
      if(this.pictures.size > MAX_PICTURES) this.pictures.delete(this.pictures.keys().next().value!/*the oldest kept*/);
      this.peek.setPicture(frame, picture, true);
    } finally {
      this.asking = undefined;
      const next = this.waiting;
      this.waiting = undefined;
      if((next !== undefined) && (next === this.peeking) && !this.pictures.has(next)) void this.ask(next);
    }
  }

  /** the key group a diamond draws */
  private groupOf(key: HTMLElement): KeyGroup | undefined {
    const row = key.closest<HTMLElement>('.row[data-row]')?.dataset.row;
    return (row === undefined) ? undefined : this.laid[Number(row)]?.groups[Number(key.dataset.group)];
  }
}

// == DOM =========================================================================
const element = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), { className });
