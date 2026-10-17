import type { BandKind, Said } from './timeline-marks';

// the timeline's hover card: a picture of the moment (the frame as the studio draws
// it; the picture track's nearest, developing, while it arrives), when the moment is
// (its time, its frame, the shot and the set), where the row's track stands then, and
// every mark under the pointer (the first few, and how many more). It floats beside
// the pointer above the row it tells (below it when there is no room above), within the
// page, and never takes a click
// ********************************************************************************
// == Constants ===================================================================
/** the space kept between the card, the row and the page's edges */
const GAP = 8/*CSS pixels*/;
/** the most marks the card lists; the rest are counted */
const MAX_MARKS = 4;

// == Types =======================================================================
/** a mark under the pointer: its shape, its row's color and what it says */
export type PeekMark = Readonly<{ shape: 'key' | 'face' | 'close' | BandKind; color: string; said: Said; }>;

/** what the card tells: the moment, the row's track there and the marks under the
 *  pointer */
export type PeekContent = Readonly<{
  frame: number; frames: number; time: number; shot?: string; set?: string;
  row: Readonly<{ name: string; color: string; standing: ReadonlyArray<string>; }>;
  marks: ReadonlyArray<PeekMark>;
}>;

/** where the card stands: the pointer's x, and the band (the row's top and bottom)
 *  it keeps clear of, in the page's pixels */
export type PeekAnchor = Readonly<{ x: number; top: number; bottom: number; }>;

// == Class =======================================================================
export class Peek {
  private readonly root: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly body: HTMLElement;
  /** what the card shows, so a move within one moment only moves it */
  private shown: string | undefined;
  private frame = -1;

  public constructor(document: Document) {
    this.root = element(document, 'div', 'peek');
    this.root.id = 'peek';
    this.root.setAttribute('role', 'tooltip');
    this.root.hidden = true;
    this.picture = element(document, 'div', 'peek-picture');
    this.body = element(document, 'div', 'peek-body');
    this.root.append(this.picture, this.body);
    document.body.append(this.root);
  }

  /** the card's element, which a key it describes names (aria-describedby) */
  public get id(): string { return this.root.id; }

  /** shows what the card tells at an anchor; content already shown only moves */
  public show(content: PeekContent, anchor: PeekAnchor): void {
    const said = JSON.stringify(content);
    if(said !== this.shown) { this.shown = said; this.render(content); }
    const opening = this.root.hidden;
    this.root.hidden = false;
    this.place(anchor);
    if(opening) { this.root.classList.remove('is-in'); void this.root.offsetWidth/*restarts the entrance*/; this.root.classList.add('is-in'); }
  }

  /** the frame's picture, once it arrives: exact as the studio draws it, else the
   *  picture track's nearest, shown developing; none leaves the unexposed frame */
  public setPicture(frame: number, picture: string | undefined, exact: boolean): void {
    if(frame !== this.frame) return/*the card moved on*/;
    this.picture.style.backgroundImage = picture ? `url("${picture}")` : '';
    this.picture.classList.toggle('is-exposed', !!picture);
    this.picture.classList.toggle('is-developing', !!picture && !exact);
  }

  public hide(): void {
    this.root.hidden = true;
    this.shown = undefined;
  }

  // == Internal ==================================================================
  private render(content: PeekContent): void {
    const document = this.root.ownerDocument;
    if(content.frame !== this.frame) { this.frame = content.frame; this.setPicture(content.frame, undefined, false); }
    this.picture.dataset.frame = `frame ${content.frame + 1}`;

    const when = element(document, 'div', 'peek-when');
    when.append(text(document, 'b', 'peek-time', `${content.time.toFixed(2)} s`), text(document, 'span', 'peek-frame', `frame ${content.frame + 1} of ${content.frames}`));
    const context = element(document, 'div', 'peek-context');
    if(content.shot) context.append(text(document, 'span', 'peek-tag peek-tag--shot', content.shot));
    if(content.set) context.append(text(document, 'span', 'peek-tag peek-tag--set', content.set));

    const row = element(document, 'div', 'peek-row');
    row.style.setProperty('--row', `var(${content.row.color})`);
    row.append(element(document, 'i', 'peek-swatch'), text(document, 'b', 'peek-row-name', content.row.name), chips(document, content.row.standing));

    const marks = element(document, 'ul', 'peek-marks');
    for(const mark of content.marks.slice(0, MAX_MARKS)) {
      const item = element(document, 'li', 'peek-mark');
      item.style.setProperty('--row', `var(${mark.color})`);
      item.append(element(document, 'i', `peek-shape peek-shape--${mark.shape}`), text(document, 'span', 'peek-mark-title', mark.said.title), chips(document, mark.said.chips));
      marks.append(item);
    }
    if(content.marks.length > MAX_MARKS) marks.append(text(document, 'li', 'peek-more', `and ${content.marks.length - MAX_MARKS} more here`));
    this.body.replaceChildren(when, ...(context.childElementCount > 0 ? [context] : []), row, ...(content.marks.length > 0 ? [marks] : []));
  }

  /** above the band beside x, else below it, within the page */
  private place({ x, top, bottom }: PeekAnchor): void {
    const view = this.root.ownerDocument.documentElement;
    const { width, height } = this.root.getBoundingClientRect();
    const left = Math.min(Math.max(GAP, x - (width / 2)), Math.max(GAP, view.clientWidth - width - GAP));
    const above = (top - GAP - height) >= GAP;
    const y = above ? (top - GAP - height) : Math.min(bottom + GAP, Math.max(GAP, view.clientHeight - height - GAP));
    this.root.classList.toggle('is-below', !above);
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
    this.root.style.setProperty('--pointer', `${Math.round(Math.min(Math.max(x - left, 14), width - 14))}px`);
  }
}

// == DOM =========================================================================
const element = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), { className });
const text = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string, content: string): HTMLElementTagNameMap[K] => Object.assign(element(document, tag, className), { textContent: content });
const chips = (document: Document, values: ReadonlyArray<string>): HTMLElement => {
  const list = element(document, 'span', 'peek-chips');
  list.append(...values.map(value => text(document, 'span', 'peek-chip', value)));
  return list;
};
