import type { View, Viewer } from './viewer';

// the build from four sides at once: a sheet over the stage of the build seen from
// the south, east, north and west, each framed, so one screenshot sees every side.
// The sheet is a picture of the build as it stood: it closes on a click, a key, a
// change to the build or the next camera command
// ********************************************************************************
// == Constants ===================================================================
const SIDES: ReadonlyArray<Readonly<{ side: string; view: View; }>> = [
  { side: 'south', view: { azimuth: 0,   elevation: 25 } },
  { side: 'east',  view: { azimuth: 90,  elevation: 25 } },
  { side: 'north', view: { azimuth: 180, elevation: 25 } },
  { side: 'west',  view: { azimuth: 270, elevation: 25 } },
];

// == Class =======================================================================
export class LookAround {
  /** counts the sheets asked for, so a closed or replaced one is never filled */
  private request = 0;

  public constructor(private readonly sheet: HTMLElement, private readonly chrome: HTMLElement/*the bar the sheet starts below*/, private readonly viewer: Viewer) {
    sheet.addEventListener('click', () => this.hide());
  }

  public get isOpen(): boolean { return !this.sheet.hidden; }

  /** shows the sheet once its four views are taken; resolves to the sides shown */
  public async show(): Promise<ReadonlyArray<string>> {
    const request = ++this.request;
    this.sheet.style.setProperty('--sheet-top', `${Math.ceil(this.chrome.getBoundingClientRect().bottom)}px`)/*below every control the bar shows*/;
    const figures = SIDES.map(({ side }) => {
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `From the ${side}`;
      figure.append(caption);
      return figure;
    });
    this.sheet.replaceChildren(...figures);
    this.sheet.hidden = false/*covers the camera's jumps*/;
    this.sheet.classList.add('is-busy');

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
    this.sheet.classList.remove('is-busy');
    return SIDES.map(({ side }) => side);
  }

  public hide(): void {
    if(this.sheet.hidden) return;
    this.request++;
    this.sheet.hidden = true;
    this.sheet.replaceChildren();
  }
}
