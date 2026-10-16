import type { Film } from './film';

// the picture track: the film along a strip of film, as many frames as fit its width,
// each the frame at its place in the film. A cell shows unexposed until its picture
// arrives from the main studio and develops when it does; the frame the playhead is
// at is marked; a press seeks to a frame. A new film starts every cell unexposed
// ********************************************************************************
// == Constants ===================================================================
/** the width a frame takes on the strip, its gap included */
const CELL_WIDTH = 72/*CSS pixels*/;
const MIN_CELLS = 6;

// == Types =======================================================================
/** a cell's picture: an image as a data URL */
export type Picture = string;

// == Class =======================================================================
export class Strip {
  private film: Film | undefined;
  /** each frame's picture, for the film shown */
  private readonly pictures = new Map<number, Picture>();
  /** each cell's frame, and the cell showing each frame */
  private cells: Array<Readonly<{ index: number; element: HTMLElement; }>> = [];
  private frame = 0;

  public constructor(private readonly root: HTMLElement, private readonly seek: (index: number) => void, private readonly onLayout: () => void/*the cells changed: some may want pictures*/) {
    root.addEventListener('click', event => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell');
      if(cell) this.seek(Number(cell.dataset.index));
    });
    new ResizeObserver(() => this.layout()).observe(root);
  }

  /** shows a film's frames; another film than the last starts every cell unexposed */
  public show(film: Film | undefined): void {
    if(film !== this.film) this.pictures.clear();
    this.film = film;
    this.layout();
  }

  /** the frames whose cells still want a picture, in the strip's order */
  public get wanting(): ReadonlyArray<number> { return this.cells.map(cell => cell.index).filter(index => !this.pictures.has(index)); }

  /** develops the cells a frame's picture stands for */
  public develop(film: Film, index: number, picture: Picture): void {
    if(film !== this.film) return/*a picture of another film*/;
    this.pictures.set(index, picture);
    for(const cell of this.cells) if(cell.index === index) this.expose(cell.element, picture);
  }

  /** marks the frame the playhead is at */
  public setFrame(index: number): void {
    this.frame = index;
    const marked = this.cells.reduce((best, cell) => (Math.abs(cell.index - index) < Math.abs(best.index - index)) ? cell : best, this.cells[0]);
    for(const cell of this.cells) cell.element.classList.toggle('is-current', cell === marked);
  }

  // == Internal ==================================================================
  private layout(): void {
    const film = this.film;
    if(!film) { this.cells = []; this.root.replaceChildren(); return; }
    const frames = film.frames.length;
    const count = Math.max(Math.min(frames, Math.floor(this.root.clientWidth / CELL_WIDTH)), Math.min(frames, MIN_CELLS));
    this.cells = Array.from({ length: count }, (_, cell) => {
      const index = (count > 1) ? Math.round(cell * ((frames - 1) / (count - 1))) : 0;
      const element = Object.assign(document.createElement('button'), { className: 'cell', type: 'button' });
      element.dataset.index = String(index);
      element.dataset.number = String(index + 1);
      element.ariaLabel = `Frame ${index + 1}`;
      const picture = this.pictures.get(index);
      if(picture) this.expose(element, picture);
      return { index, element };
    });
    this.root.replaceChildren(...this.cells.map(cell => cell.element));
    this.setFrame(this.frame);
    this.onLayout();
  }

  private expose(element: HTMLElement, picture: Picture): void {
    element.style.backgroundImage = `url("${picture}")`;
    element.classList.add('is-exposed');
  }
}
