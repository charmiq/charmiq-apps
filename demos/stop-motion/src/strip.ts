import { shotFrames, type Film } from './film';

// the picture track: the film along a strip of film, as many frames as fit its width,
// each the frame at its place in the film, or, as a storyboard, a cell per camera
// shot picturing its middle, captioned with its name and span. A cell shows unexposed
// until its picture arrives from the main studio and develops when it does; the cell
// the playhead is at is marked; a press seeks to its frame, a shot's first. The strip
// is the timeline's navigator: it always shows the whole film, and a bracket over it
// frames the span the timeline shows; dragging its grip (along its top, over the
// sprocket holes) pans that span, dragging an end zooms, and the cells under it are
// pressed as ever. In a storyboard the shots in view are marked instead
// ********************************************************************************
// == Constants ===================================================================
/** the width a frame takes on the strip, its gap included */
const CELL_WIDTH = 72/*CSS pixels*/;
const MIN_CELLS = 6;
/** how far (CSS pixels) a press on the bracket moves before it is a drag */
const DRAG_SLOP = 3;

// == Types =======================================================================
/** a cell's picture: an image as a data URL */
export type Picture = string;

/** a cell: the frame it pictures, the frame a press seeks to, and its element */
type Cell = Readonly<{ index: number; seek: number; element: HTMLElement; }>;

// == Class =======================================================================
export class Strip {
  private film: Film | undefined;
  /** each frame's picture, for the film shown */
  private readonly pictures = new Map<number, Picture>();
  private cells: Cell[] = [];
  private frame = 0;
  private marked: Cell | undefined;
  private storyboard = false;
  /** the span the timeline shows (shares of the film), its bracket, and a drag of it:
   *  which part, where it began and the span then */
  private span = { from: 0, to: 1 };
  private readonly bracket: HTMLElement;
  private moving: Readonly<{ part: 'from' | 'to' | 'span'; startX: number; from: number; to: number; }> | undefined;
  private moved = 0;
  /** a resize's layout waiting for the next animation frame */
  private resizeFrame: number | undefined;

  public constructor(private readonly root: HTMLElement, private readonly seek: (index: number) => void, private readonly onLayout: () => void/*the cells changed: some may want pictures*/, private readonly showSpan: (from: number, to: number) => void/*the timeline asked to show a span*/) {
    root.addEventListener('click', event => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell');
      if(cell) this.seek(Number(cell.dataset.seek));
    });
    this.bracket = Object.assign(document.createElement('div'), { className: 'strip-window' });
    this.bracket.setAttribute('aria-hidden', 'true')/*the timeline's keys zoom and pan it*/;
    this.bracket.append(
      Object.assign(document.createElement('i'), { className: 'strip-window-grip', title: 'The span the timeline shows: drag to pan' }),
      Object.assign(document.createElement('i'), { className: 'strip-window-end is-from', title: 'Drag to zoom' }),
      Object.assign(document.createElement('i'), { className: 'strip-window-end is-to', title: 'Drag to zoom' }),
    );
    this.bracket.addEventListener('pointerdown', event => this.press(event));
    this.bracket.addEventListener('pointermove', event => this.drag(event));
    this.bracket.addEventListener('pointerup', () => this.drop());
    this.bracket.addEventListener('pointercancel', () => { this.moving = undefined; });
    // answered on the next frame: its cells laid out again resize the strip itself, never
    // within the observer's own delivery
    new ResizeObserver(() => {
      if(this.resizeFrame !== undefined) return/*one waits*/;
      this.resizeFrame = requestAnimationFrame(() => { this.resizeFrame = undefined; this.layout(); });
    }).observe(root);
  }

  /** frames the span the timeline shows (shares of the film, 0 to 1) */
  public setSpan(span: Readonly<{ from: number; to: number; }>): void {
    this.span = { from: span.from, to: span.to };
    this.placeBracket();
  }

  /** shows a film's frames; another film than the last starts every cell unexposed */
  public show(film: Film | undefined): void {
    if(film !== this.film) this.pictures.clear();
    this.film = film;
    this.layout();
  }

  /** shows a cell per shot (a storyboard), or frames along the film */
  public setStoryboard(storyboard: boolean): void {
    this.storyboard = storyboard;
    if(!storyboard) for(const cell of this.cells) cell.element.classList.remove('is-in-view');
    this.root.classList.toggle('is-storyboard', storyboard);
    this.layout();
  }

  /** the frames whose cells still want a picture, in the strip's order */
  public get wanting(): ReadonlyArray<number> { return this.cells.map(cell => cell.index).filter(index => !this.pictures.has(index)); }

  /** the developed picture of the frame nearest `index`, when one is */
  public nearest(index: number): Picture | undefined {
    let best: number | undefined;
    for(const frame of this.pictures.keys()) if((best === undefined) || (Math.abs(frame - index) < Math.abs(best - index))) best = frame;
    return (best === undefined) ? undefined : this.pictures.get(best);
  }

  /** develops the cells a frame's picture stands for */
  public develop(film: Film, index: number, picture: Picture): void {
    if(film !== this.film) return/*a picture of another film*/;
    this.pictures.set(index, picture);
    for(const cell of this.cells) if(cell.index === index) this.expose(cell.element, picture);
  }

  /** marks the cell the playhead is at: the nearest frame, or the shot it is in,
   *  scrolled into the track when it becomes the one marked */
  public setFrame(index: number): void {
    this.frame = index;
    const marked = this.storyboard
      ? this.cells.filter(cell => cell.seek <= index).pop()
      : this.cells.reduce<Cell | undefined>((best, cell) => (!best || (Math.abs(cell.index - index) < Math.abs(best.index - index))) ? cell : best, undefined);
    for(const cell of this.cells) cell.element.classList.toggle('is-current', cell === marked);
    if(marked && (marked !== this.marked)) this.reveal(marked.element);
    this.marked = marked;
  }

  // == Internal ==================================================================
  private layout(): void {
    const film = this.film;
    this.cells = !film ? [] : this.storyboard ? this.shotCells(film) : this.frameCells(film);
    this.root.replaceChildren(...this.cells.map(cell => cell.element), this.bracket);
    this.setFrame(this.frame);
    this.placeBracket();
    if(film) this.onLayout();
  }

  // .. Navigator .................................................................
  /** the bracket over the cells, the film's start to its end along them; in a
   *  storyboard, the shots in view marked instead */
  private placeBracket(): void {
    const film = this.film;
    const region = this.region();
    this.bracket.hidden = !film || this.storyboard || !region;
    if(film && this.storyboard) {
      const frames = film.frames.length;
      this.cells.forEach((cell, index) => {
        const [first, next] = [cell.seek, this.cells[index + 1]?.seek ?? frames];
        cell.element.classList.toggle('is-in-view', ((next / frames) > this.span.from) && ((first / frames) < this.span.to));
      });
      return;
    } /* else -- frames along the film */
    if(!film || !region) return;
    this.bracket.style.left = `${(region.left + (this.span.from * region.width)).toFixed(2)}px`;
    this.bracket.style.width = `${((this.span.to - this.span.from) * region.width).toFixed(2)}px`;
    this.bracket.classList.toggle('is-whole', (this.span.from <= 0) && (this.span.to >= 1));
  }

  /** where the film lies along the strip: from its first cell's left to its last
   *  cell's right (CSS pixels within the strip) */
  private region(): Readonly<{ left: number; width: number; }> | undefined {
    const [first, last] = [this.cells[0]?.element, this.cells[this.cells.length - 1]?.element];
    if(!first || !last) return undefined;
    const width = (last.offsetLeft + last.offsetWidth) - first.offsetLeft;
    return (width > 0) ? { left: first.offsetLeft, width } : undefined;
  }

  // a press on the bracket's grip or an end: an end zooms, the grip pans (its body
  // lets presses through to the cells)
  private press(event: PointerEvent): void {
    const part = (event.target as HTMLElement).closest<HTMLElement>('.strip-window-grip, .strip-window-end');
    if((event.button !== 0) || !part) return;
    this.moving = { part: part.classList.contains('is-from') ? 'from' : part.classList.contains('is-to') ? 'to' : 'span', startX: event.clientX, from: this.span.from, to: this.span.to };
    this.moved = 0;
    part.setPointerCapture(event.pointerId)/*its moves bubble to the bracket*/;
    event.preventDefault();
  }

  // the bracket dragged: the span it asks the timeline for (which zooms within its
  // bounds and tells the span back, so the bracket follows what is shown)
  private drag(event: PointerEvent): void {
    const moving = this.moving;
    const region = this.region();
    if(!moving || !region) return;
    this.moved = event.clientX - moving.startX;
    if(Math.abs(this.moved) < DRAG_SLOP) return/*still a press*/;
    const by = this.moved / region.width;
    const width = moving.to - moving.from;
    const narrowest = 1 / region.width/*a pixel of the strip*/;
    const [from, to] = (moving.part === 'span') ? [Math.min(Math.max(moving.from + by, 0), 1 - width), Math.min(Math.max(moving.from + by, 0), 1 - width) + width]
      : (moving.part === 'from') ? [Math.min(Math.max(moving.from + by, 0), moving.to - narrowest), moving.to]
      : [moving.from, Math.max(Math.min(moving.to + by, 1), moving.from + narrowest)];
    this.showSpan(from, to);
  }

  // let go: the drag is done
  private drop(): void { this.moving = undefined; }

  /** as many frames as fit the strip, evenly along the film */
  private frameCells(film: Film): Cell[] {
    const frames = film.frames.length;
    const count = Math.max(Math.min(frames, Math.floor(this.root.clientWidth / CELL_WIDTH)), Math.min(frames, MIN_CELLS));
    return Array.from({ length: count }, (_, cell) => {
      const index = (count > 1) ? Math.round(cell * ((frames - 1) / (count - 1))) : 0;
      const element = this.cellElement(index, index, `Frame ${index + 1}`);
      element.dataset.number = String(index + 1);
      return { index, seek: index, element };
    });
  }

  /** a cell per shot, picturing its middle */
  private shotCells(film: Film): Cell[] {
    return shotFrames(film).map(({ shot, first, middle }, number) => {
      const caption = `${shot.name ?? `Shot ${number + 1}`} · ${shot.from.toFixed(2)}–${shot.to.toFixed(2)} s`;
      const element = this.cellElement(middle, first, caption);
      element.title = caption/*whole, where the cell cuts it*/;
      element.append(Object.assign(document.createElement('span'), { className: 'cell-caption', textContent: caption }));
      return { index: middle, seek: first, element };
    });
  }

  private cellElement(index: number, seek: number, label: string): HTMLElement {
    const element = Object.assign(document.createElement('button'), { className: 'cell', type: 'button', ariaLabel: label });
    element.dataset.index = String(index);
    element.dataset.seek = String(seek);
    const picture = this.pictures.get(index);
    if(picture) this.expose(element, picture);
    return element;
  }

  /** scrolls a cell the track cuts off into it, the page left where it stands */
  private reveal(element: HTMLElement): void {
    const { root } = this;
    if((element.offsetLeft >= root.scrollLeft) && ((element.offsetLeft + element.offsetWidth) <= (root.scrollLeft + root.clientWidth))) return/*seen whole*/;
    root.scrollLeft = element.offsetLeft - ((root.clientWidth - element.offsetWidth) / 2);
  }

  private expose(element: HTMLElement, picture: Picture): void {
    element.style.backgroundImage = `url("${picture}")`;
    element.classList.add('is-exposed');
  }
}
