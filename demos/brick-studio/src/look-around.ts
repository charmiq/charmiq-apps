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

  public constructor(private readonly sheet: HTMLElement, private readonly viewer: Viewer) {
    sheet.addEventListener('click', () => this.hide());
  }

  public get isOpen(): boolean { return !this.sheet.hidden; }

  /** shows the sheet once its four views are taken; resolves to the sides shown */
  public async show(): Promise<ReadonlyArray<string>> {
    const request = ++this.request;
    this.sheet.replaceChildren();
    this.sheet.hidden = false/*covers the camera's jumps*/;
    this.sheet.classList.add('is-busy');
    const images = await this.viewer.snapshots(SIDES.map(({ view }) => view));
    if(request !== this.request) return []/*closed or replaced meanwhile*/;
    this.sheet.replaceChildren(...SIDES.map(({ side }, index) => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = images[index];
      image.alt = `The build from the ${side}`;
      const caption = document.createElement('figcaption');
      caption.textContent = `From the ${side}`;
      figure.append(image, caption);
      return figure;
    }));
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
