import type { View, Viewer } from './viewer';

// the build from four sides at once: a sheet over the stage of the build seen from
// the south, east, north and west, each framed, so one screenshot sees every side.
// A Charm opens it (lookAround), so the sheet says so and carries the way back. It
// is a picture of the build as it stood: it closes on its button, a click, a key
// (save Tab and a modifier pressed alone, which move focus), a change to the build or
// the next camera command
// ********************************************************************************
// == Constants ===================================================================
const SIDES: ReadonlyArray<Readonly<{ side: string; view: View; }>> = [
  { side: 'south', view: { azimuth: 0,   elevation: 25 } },
  { side: 'east',  view: { azimuth: 90,  elevation: 25 } },
  { side: 'north', view: { azimuth: 180, elevation: 25 } },
  { side: 'west',  view: { azimuth: 270, elevation: 25 } },
];

// == Class =======================================================================
/** the sheet's elements: the sheet, the panel the sides fill and its way back */
export type LookAroundElements = Readonly<{ root: HTMLElement; sides: HTMLElement; back: HTMLButtonElement; }>;

export class LookAround {
  /** counts the sheets asked for, so a closed or replaced one is never filled */
  private request = 0;
  /** what had focus inside the studio before the sheet took it, given back on close */
  private returnFocus: HTMLElement | null = null;

  public constructor(private readonly elements: LookAroundElements, private readonly chrome: HTMLElement/*the bar the sheet starts below*/, private readonly viewer: Viewer) {
    elements.root.addEventListener('click', () => this.hide())/*the button's click among them*/;
  }

  public get isOpen(): boolean { return !this.elements.root.hidden; }

  /** shows the sheet once its four views are taken; resolves to the sides shown. Its
   *  way back takes focus only when focus is already in the studio: a Charm opening
   *  it never pulls focus from where the person is typing */
  public async show(): Promise<ReadonlyArray<string>> {
    const { root, sides, back } = this.elements;
    const request = ++this.request;
    root.style.setProperty('--sheet-top', `${Math.ceil(this.chrome.getBoundingClientRect().bottom)}px`)/*below every control the bar shows*/;
    const figures = SIDES.map(({ side }) => {
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `From the ${side}`;
      figure.append(caption);
      return figure;
    });
    sides.replaceChildren(...figures);
    if(!this.isOpen) this.returnFocus = document.hasFocus() && (document.activeElement instanceof HTMLElement) ? document.activeElement : null;
    root.hidden = false/*covers the camera's jumps*/;
    root.classList.add('is-busy');
    if(document.hasFocus()) back.focus();

    // each view drawn at its panel's size, so it fills the panel
    const panel = figures[0].getBoundingClientRect();
    const images = await this.viewer.snapshots(SIDES.map(({ view }) => view), Math.round(panel.width), Math.round(panel.height));
    if(request !== this.request) return []/*closed or replaced meanwhile*/;
    figures.forEach((figure, index) => {
      const image = document.createElement('img');
      image.src = images[index];
      image.alt = `The build from the ${SIDES[index].side}`;
      figure.prepend(image);
    });
    root.classList.remove('is-busy');
    return SIDES.map(({ side }) => side);
  }

  /** closes the sheet, giving focus back to where it was when the sheet took it, only
   *  while the studio still has focus and the sheet holds it: focus the person has
   *  moved elsewhere (the chat) stays there */
  public hide(): void {
    const { root, sides } = this.elements;
    if(root.hidden) return;
    this.request++;
    const hadFocus = document.hasFocus() && root.contains(document.activeElement);
    root.hidden = true;
    sides.replaceChildren();
    if(hadFocus && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }
}
