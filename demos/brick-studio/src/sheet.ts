// a sheet over the whole studio: pictures in a grid, each captioned beneath it, under
// a title and a way back, so one screenshot sees them all (the build from four sides,
// a film's storyboard). A Charm opens it, so the sheet says so. A Charm's screenshot is
// the whole Application and it pays for every pixel, so the studio's chrome rests
// while the sheet stands (SEE: styles.scss) and the pictures share the rest, laid in
// whichever grid shows the most. It is a picture of the studio as it stood: it closes
// on its button, a click, a key (SEE: main.ts), and whatever its opener closes it on.
// A sheet asked for while another fills replaces it
// ********************************************************************************
// == Types =======================================================================
// -- Content ---------------------------------------------------------------------
/** the sheet's elements: the sheet, its title, the panel its pictures fill and its
 *  way back with that button's words */
export type SheetElements = Readonly<{ root: HTMLElement; title: HTMLElement; panels: HTMLElement; back: HTMLButtonElement; backLabel: HTMLElement; }>;

/** the shape a sheet's pictures take: a film's frame (`aspect`, its width for each
 *  unit high), or their panel's whole, the grid then chosen by how much of the subject
 *  the picture showing least of it shows at a size (`shows`, in CSS pixels) */
export type SheetShape = Readonly<{ aspect: number; }> | Readonly<{ shows: (width: number, height: number) => number; }>;

/** what a sheet shows: its title, its way back's words, the shape of its pictures,
 *  and each picture's caption and words for a screen reader */
export type SheetContent = Readonly<{ title: string; back: string; shape: SheetShape; panels: ReadonlyArray<Readonly<{ caption: string; alt: string; }>>; }>;

/** a picture for a panel: a data URL, or a drawn bitmap the sheet takes over */
export type SheetPicture = string | ImageBitmap;

// -- Grid ------------------------------------------------------------------------
/** an area in CSS pixels */
export type SheetArea = Readonly<{ width: number; height: number; }>;
/** the space between panels and the height of each caption's strip (CSS pixels) */
export type SheetSpacing = Readonly<{ gap: number; caption: number; }>;
/** a sheet's grid: its columns and rows, and each picture's size (whole CSS pixels) */
export type SheetGrid = Readonly<{ columns: number; rows: number; width: number; height: number; }>;

// == Class =======================================================================
export class Sheet {
  /** counts the sheets asked for, so a closed or replaced one is never filled */
  private request = 0;
  /** what had focus inside the studio before the sheet took it, given back on close */
  private returnFocus: HTMLElement | null = null;

  public constructor(private readonly elements: SheetElements) {
    elements.root.addEventListener('click', () => this.hide())/*the button's click among them*/;
  }

  public get isOpen(): boolean { return !this.elements.root.hidden; }

  /** shows the sheet, its panels filled with what `fill` draws at a picture's size
   *  (CSS pixels); resolves true once they show, false when it was closed or replaced
   *  first. Its way back takes focus only when focus is already in the studio: a
   *  Charm opening it never pulls focus from where the person is typing */
  public async show(content: SheetContent, fill: (width: number, height: number) => Promise<ReadonlyArray<SheetPicture>>): Promise<boolean> {
    const { root, title, panels, back, backLabel } = this.elements;
    const request = ++this.request;
    title.textContent = content.title;
    backLabel.textContent = content.back;
    panels.ariaLabel = content.title;
    const figures = content.panels.map(({ caption }) => {
      const figure = document.createElement('figure');
      figure.append(Object.assign(document.createElement('div'), { className: 'sheet-picture' })/*the picture's place until it is drawn*/, Object.assign(document.createElement('figcaption'), { textContent: caption, title: caption }));
      return figure;
    });
    panels.replaceChildren(...figures);
    if(!this.isOpen) this.returnFocus = document.hasFocus() && (document.activeElement instanceof HTMLElement) ? document.activeElement : null;
    root.hidden = false/*covers what the studio draws meanwhile*/;
    root.classList.add('is-busy');
    if(document.hasFocus()) back.focus();

    const area = panels.getBoundingClientRect();
    const spacing = { gap: parseFloat(getComputedStyle(panels).rowGap) || 0, caption: figures[0]?.querySelector('figcaption')?.getBoundingClientRect().height ?? 0 };
    const grid = sheetGrid({ width: area.width, height: area.height }, spacing, figures.length, content.shape);
    panels.style.setProperty('--columns', String(grid.columns));
    panels.style.setProperty('--picture-width', `${grid.width}px`);
    panels.style.setProperty('--picture-height', `${grid.height}px`);
    let pictures: ReadonlyArray<SheetPicture>;
    try { pictures = await fill(grid.width, grid.height); }
    catch(error) { if(request === this.request) this.hide(); throw error; }
    if(request !== this.request) { pictures.forEach(release); return false/*closed or replaced meanwhile*/; }
    figures.forEach((figure, index) => figure.firstElementChild!.replaceWith(pictureElement(pictures[index], content.panels[index].alt)));
    root.classList.remove('is-busy');
    return true;
  }

  /** closes the sheet, giving focus back to where it was when the sheet took it, only
   *  while the studio still has focus and the sheet holds it: focus the person has
   *  moved elsewhere (the chat) stays there */
  public hide(): void {
    const { root, panels } = this.elements;
    if(root.hidden) return;
    this.request++;
    const hadFocus = document.hasFocus() && root.contains(document.activeElement);
    root.hidden = true;
    panels.replaceChildren();
    if(hadFocus && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }
}

// == Grid ========================================================================
/** the grid that shows the most of `count` pictures in an area, each over its caption
 *  strip, `spacing.gap` apart: each count of columns tried, the rows it takes, and
 *  each picture's size in its cell. A film's frame fits its cell at its own shape and
 *  shows its area; a picture filling its cell shows what `shape.shows` says of the
 *  cell. A count of columns taking no fewer rows than one column less is passed by
 *  (its cells narrower, its slots left empty: four as three and one), and the fewest
 *  columns win a tie */
export const sheetGrid = (area: SheetArea, spacing: SheetSpacing, count: number, shape: SheetShape): SheetGrid => {
  let best: SheetGrid = { columns: 1, rows: Math.max(1, count), width: 1, height: 1 }, shown = -Infinity;
  for(let columns=1; columns<=Math.max(1, count); columns++) {
    const rows = Math.ceil(count / columns);
    if((columns > 1) && (Math.ceil(count / (columns - 1)) === rows)) continue/*the same rows, narrower*/;
    const cell = { width: (area.width - (spacing.gap * (columns - 1))) / columns, height: ((area.height - (spacing.gap * (rows - 1))) / rows) - spacing.caption };
    const picture = ('aspect' in shape) ? atShape(cell, shape.aspect) : { width: Math.floor(cell.width), height: Math.floor(cell.height) };
    if((picture.width < 1) || (picture.height < 1)) continue/*no room*/;
    const shows = ('aspect' in shape) ? (picture.width * picture.height) : shape.shows(picture.width, picture.height);
    if(shows > shown) { best = { columns, rows, ...picture }; shown = shows; }
  }
  return best;
};

/** the largest picture `aspect` wide for each unit high in a cell, in whole pixels */
const atShape = (cell: SheetArea, aspect: number): SheetArea => {
  const width = Math.floor(Math.min(cell.width, cell.height * aspect));
  return { width, height: Math.round(width / aspect) };
};

// == Util ========================================================================
/** a picture as its panel shows it: an image of a data URL, or a canvas holding a
 *  bitmap (released once drawn) */
const pictureElement = (picture: SheetPicture, alt: string): HTMLElement => {
  if(typeof picture === 'string') return Object.assign(document.createElement('img'), { src: picture, alt });
  const canvas = Object.assign(document.createElement('canvas'), { width: picture.width, height: picture.height, ariaLabel: alt });
  canvas.setAttribute('role', 'img');
  canvas.getContext('2d')!.drawImage(picture, 0, 0);
  picture.close();
  return canvas;
};

/** lets a bitmap no panel takes go */
const release = (picture: SheetPicture) => { if(typeof picture !== 'string') picture.close(); };
