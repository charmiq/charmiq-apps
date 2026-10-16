import type { Film } from './film';
import type { TakenFrame } from './player';

// the film strip: the take as frames along a strip of film, as many as fit its
// width, each the frame at its place in the film. A frame not yet shot shows
// unexposed and develops when the take gains it; the frame on screen is marked; a
// press seeks to a frame
// ********************************************************************************
// == Constants ===================================================================
/** the width a frame takes on the strip, its gap included */
const CELL_WIDTH = 72/*CSS pixels*/;
const MIN_CELLS = 6;

// == Class =======================================================================
export class Strip {
  private film: Film | undefined;
  private taken: ((index: number) => TakenFrame | undefined) | undefined;
  /** each cell's frame, and the cell showing each frame */
  private cells: Array<Readonly<{ index: number; element: HTMLElement; }>> = [];
  private frame = 0;

  public constructor(private readonly root: HTMLElement, private readonly seek: (index: number) => void) {
    root.addEventListener('click', event => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell');
      if(cell) this.seek(Number(cell.dataset.index));
    });
    new ResizeObserver(() => this.layout()).observe(root);
  }

  /** shows a film's frames, those the take holds developed */
  public show(film: Film | undefined, taken: (index: number) => TakenFrame | undefined): void {
    this.film = film;
    this.taken = taken;
    this.layout();
  }

  /** develops the cell a frame the take gained stands for */
  public develop(index: number, frame: TakenFrame): void {
    const cell = this.cells.find(each => each.index === index);
    if(cell) this.expose(cell.element, frame);
  }

  /** marks the frame on screen */
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
      const shot = this.taken?.(index);
      if(shot) this.expose(element, shot);
      return { index, element };
    });
    this.root.replaceChildren(...this.cells.map(cell => cell.element));
    this.setFrame(this.frame);
  }

  private expose(element: HTMLElement, frame: TakenFrame): void {
    element.style.backgroundImage = `url("${frame}")`;
    element.classList.add('is-exposed');
  }
}
