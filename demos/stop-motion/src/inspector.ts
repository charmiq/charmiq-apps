import type { BandKind, Said } from './timeline-marks';

// the sheet's inspector: a moment of the film in the sheet's place while the person
// holds the modifier over the timeline, or pins one (SEE: timeline.ts): the studio's
// picture of the frame (the picture track's nearest, developing, while it arrives),
// when the moment is (its time, its frame, the shot and the set), where the row's
// track stands then, and every mark under the pointer. The sheet scrolls, so nothing
// is left out; the film's sheet returns once the moment is let go. The moment shows in
// the sheet's fixed place, never a card beside the pointer: a card's size follows what
// lies under the pointer, so it jumps as the pointer scrubs and covers the rows it tells
// ********************************************************************************
// == Types =======================================================================
/** a mark under the pointer: its shape, its row's color and what it says */
export type InspectedMark = Readonly<{ shape: 'key' | 'face' | 'close' | BandKind; color: string; said: Said; }>;

/** what the inspector tells: the moment, the row's track there and the marks under
 *  the pointer */
export type Inspected = Readonly<{
  frame: number; frames: number; time: number; shot?: string; set?: string;
  row: Readonly<{ name: string; color: string; standing: ReadonlyArray<string>; }>;
  marks: ReadonlyArray<InspectedMark>;
}>;

// == Class =======================================================================
export class Inspector {
  private readonly picture: HTMLElement;
  private readonly title: HTMLElement;
  private readonly moment: HTMLElement;
  private readonly body: HTMLElement;
  private readonly unpin: HTMLButtonElement;
  /** what the inspector shows, so a move within one moment changes nothing */
  private shown: string | undefined;
  private frame = -1;

  /** over the sheet's own content (`film`), which it stands in place of while shown;
   *  `onUnpin`, the person letting a pinned moment go */
  public constructor(private readonly root: HTMLElement, private readonly film: HTMLElement, onUnpin: () => void) {
    const document = root.ownerDocument;
    const head = element(document, 'div', 'inspect-head');
    this.title = text(document, 'p', 'eyebrow', 'At the pointer');
    this.unpin = Object.assign(element(document, 'button', 'tag tag--ink inspect-unpin'), { type: 'button', textContent: 'Unpin', title: 'Let the moment go (Esc)' });
    this.unpin.addEventListener('click', onUnpin);
    head.append(this.title, this.unpin);
    // the picture small beside when the moment is, so the details fit a short sheet
    this.picture = element(document, 'div', 'inspect-picture');
    this.moment = element(document, 'div', 'inspect-moment');
    const top = element(document, 'div', 'inspect-top');
    top.append(this.picture, this.moment);
    this.body = element(document, 'div', 'inspect-body');
    root.replaceChildren(head, top, this.body);
    root.hidden = true;
  }

  /** shows a moment in the sheet's place: followed while the modifier is held, or
   *  pinned there */
  public show(inspected: Inspected, pinned: boolean): void {
    const said = JSON.stringify(inspected);
    if(said !== this.shown) { this.shown = said; this.render(inspected); }
    this.title.textContent = pinned ? 'Pinned' : 'At the pointer';
    this.unpin.hidden = !pinned;
    this.root.classList.toggle('is-pinned', pinned);
    this.root.hidden = false;
    this.film.hidden = true;
  }

  /** the frame's picture, once it arrives: exact as the studio draws it, else the
   *  picture track's nearest, shown developing; none leaves the unexposed frame */
  public setPicture(frame: number, picture: string | undefined, exact: boolean): void {
    if(frame !== this.frame) return/*the inspector moved on*/;
    this.picture.style.backgroundImage = picture ? `url("${picture}")` : '';
    this.picture.classList.toggle('is-exposed', !!picture);
    this.picture.classList.toggle('is-developing', !!picture && !exact);
  }

  /** the film's sheet again */
  public hide(): void {
    if(this.root.hidden) return/*the film's sheet shows*/;
    this.root.hidden = true;
    this.film.hidden = false;
    this.shown = undefined;
  }

  // == Internal ==================================================================
  private render(inspected: Inspected): void {
    const document = this.root.ownerDocument;
    if(inspected.frame !== this.frame) { this.frame = inspected.frame; this.setPicture(inspected.frame, undefined, false); }
    this.picture.dataset.frame = `frame ${inspected.frame + 1}`;

    const when = element(document, 'div', 'inspect-when');
    when.append(text(document, 'b', 'inspect-time', `${inspected.time.toFixed(2)} s`), text(document, 'span', 'inspect-frame', `frame ${inspected.frame + 1} of ${inspected.frames}`));
    const context = element(document, 'div', 'inspect-context');
    if(inspected.shot) context.append(text(document, 'span', 'inspect-tag inspect-tag--shot', inspected.shot));
    if(inspected.set) context.append(text(document, 'span', 'inspect-tag inspect-tag--set', inspected.set));

    const row = element(document, 'div', 'inspect-row');
    row.style.setProperty('--row', `var(${inspected.row.color})`);
    row.append(element(document, 'i', 'inspect-swatch'), text(document, 'b', 'inspect-row-name', inspected.row.name), chips(document, inspected.row.standing));

    const marks = element(document, 'ul', 'inspect-marks');
    for(const mark of inspected.marks) {
      const item = element(document, 'li', 'inspect-mark');
      item.style.setProperty('--row', `var(${mark.color})`);
      item.append(element(document, 'i', `inspect-shape inspect-shape--${mark.shape}`), text(document, 'span', 'inspect-mark-title', mark.said.title), chips(document, mark.said.chips));
      marks.append(item);
    }
    this.moment.replaceChildren(when, ...((context.childElementCount > 0) ? [context] : []));
    this.body.replaceChildren(row, ...((inspected.marks.length > 0) ? [marks] : []));
  }
}

// == DOM =========================================================================
const element = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), { className });
const text = <K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className: string, content: string): HTMLElementTagNameMap[K] => Object.assign(element(document, tag, className), { textContent: content });
const chips = (document: Document, values: ReadonlyArray<string>): HTMLElement => {
  const list = element(document, 'span', 'inspect-chips');
  list.append(...values.map(value => text(document, 'span', 'inspect-chip', value)));
  return list;
};
