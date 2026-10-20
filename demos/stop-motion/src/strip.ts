import { shotFrames, type Film } from './film';

// the picture track: the film along a strip of film, as many frames as fit its width,
// each the frame at its place in the film, or, as a storyboard, a cell per camera
// shot picturing its middle, captioned with its name and span. A cell shows unexposed
// until its picture arrives from the main studio and develops when it does; the cell
// the playhead is at is marked; a press seeks to its frame, a shot's first
// ********************************************************************************
// == Constants ===================================================================
/** the width a frame takes on the strip, its gap included */
const CELL_WIDTH = 72/*CSS pixels*/;
const MIN_CELLS = 6;

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

  public constructor(private readonly root: HTMLElement, private readonly seek: (index: number) => void, private readonly onLayout: () => void/*the cells changed: some may want pictures*/) {
    root.addEventListener('click', event => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell');
      if(cell) this.seek(Number(cell.dataset.seek));
    });
    new ResizeObserver(() => this.layout()).observe(root);
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
    this.root.replaceChildren(...this.cells.map(cell => cell.element));
    this.setFrame(this.frame);
    if(film) this.onLayout();
  }

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
