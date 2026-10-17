// a sheet over the stage: pictures in a grid, each captioned, under a title and a way
// back, so one screenshot sees them all (the build from four sides, a film's
// storyboard). A Charm opens it, so the sheet says so. It is a picture of the studio
// as it stood: it closes on its button, a click, a key (SEE: main.ts), and whatever
// its opener closes it on. A sheet asked for while another fills replaces it
// ********************************************************************************
// == Types =======================================================================
/** the sheet's elements: the sheet, its title, the panel its pictures fill and its
 *  way back with that button's words */
export type SheetElements = Readonly<{ root: HTMLElement; title: HTMLElement; panels: HTMLElement; back: HTMLButtonElement; backLabel: HTMLElement; }>;

/** what a sheet shows: its title, its way back's words, how many pictures a row
 *  holds, and each picture's caption and words for a screen reader */
export type SheetContent = Readonly<{ title: string; back: string; columns: number; panels: ReadonlyArray<Readonly<{ caption: string; alt: string; }>>; }>;

/** a picture for a panel: a data URL, or a drawn bitmap the sheet takes over */
export type SheetPicture = string | ImageBitmap;

// == Class =======================================================================
export class Sheet {
  /** counts the sheets asked for, so a closed or replaced one is never filled */
  private request = 0;
  /** what had focus inside the studio before the sheet took it, given back on close */
  private returnFocus: HTMLElement | null = null;

  public constructor(private readonly elements: SheetElements, private readonly chrome: HTMLElement/*the bar the sheet starts below*/) {
    elements.root.addEventListener('click', () => this.hide())/*the button's click among them*/;
  }

  public get isOpen(): boolean { return !this.elements.root.hidden; }

  /** shows the sheet, its panels filled with what `fill` draws at a panel's size (CSS
   *  pixels); resolves true once they show, false when it was closed or replaced
   *  first. Its way back takes focus only when focus is already in the studio: a
   *  Charm opening it never pulls focus from where the person is typing */
  public async show(content: SheetContent, fill: (width: number, height: number) => Promise<ReadonlyArray<SheetPicture>>): Promise<boolean> {
    const { root, title, panels, back, backLabel } = this.elements;
    const request = ++this.request;
    root.style.setProperty('--sheet-top', `${Math.ceil(this.chrome.getBoundingClientRect().bottom)}px`)/*below every control the bar shows*/;
    title.textContent = content.title;
    backLabel.textContent = content.back;
    panels.ariaLabel = content.title;
    panels.style.setProperty('--columns', String(content.columns));
    panels.style.setProperty('--rows', String(Math.ceil(content.panels.length / content.columns)));
    const figures = content.panels.map(({ caption }) => {
      const figure = document.createElement('figure');
      figure.append(Object.assign(document.createElement('figcaption'), { textContent: caption }));
      return figure;
    });
    panels.replaceChildren(...figures);
    if(!this.isOpen) this.returnFocus = document.hasFocus() && (document.activeElement instanceof HTMLElement) ? document.activeElement : null;
    root.hidden = false/*covers what the studio draws meanwhile*/;
    root.classList.add('is-busy');
    if(document.hasFocus()) back.focus();

    const panel = figures[0].getBoundingClientRect();
    let pictures: ReadonlyArray<SheetPicture>;
    try { pictures = await fill(Math.round(panel.width), Math.round(panel.height)); }
    catch(error) { if(request === this.request) this.hide(); throw error; }
    if(request !== this.request) { pictures.forEach(release); return false/*closed or replaced meanwhile*/; }
    figures.forEach((figure, index) => figure.prepend(pictureElement(pictures[index], content.panels[index].alt)));
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
