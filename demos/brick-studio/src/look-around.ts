import type { Sheet } from './sheet';
import type { View, Viewer } from './viewer';

// the build from four sides at once: the sheet over the stage (SEE: sheet.ts) holding
// the build seen from the south, east, north and west, each framed, so one screenshot
// sees every side. A Charm opens it (lookAround); it is a picture of the build as it
// stood, so a change to the build or the next camera command closes it
// ********************************************************************************
// == Constants ===================================================================
const SIDES: ReadonlyArray<Readonly<{ side: string; view: View; }>> = [
  { side: 'south', view: { azimuth: 0,   elevation: 25 } },
  { side: 'east',  view: { azimuth: 90,  elevation: 25 } },
  { side: 'north', view: { azimuth: 180, elevation: 25 } },
  { side: 'west',  view: { azimuth: 270, elevation: 25 } },
];
const TITLE = 'Your Charm is looking at every side of the build';
const BACK = 'Back to the build';

// == Class =======================================================================
export class LookAround {
  public constructor(private readonly sheet: Sheet, private readonly viewer: Viewer) {}

  /** shows the sheet once its four views are taken, each drawn at its panel's size so
   *  it fills the panel; resolves to the sides shown, none when it was closed first */
  public async show(): Promise<ReadonlyArray<string>> {
    const panels = SIDES.map(({ side }) => ({ caption: `From the ${side}`, alt: `The build from the ${side}` }));
    const shown = await this.sheet.show({ title: TITLE, back: BACK, columns: 2, panels }, (width, height) => this.viewer.snapshots(SIDES.map(({ view }) => view), width, height));
    return shown ? SIDES.map(({ side }) => side) : [];
  }

  /** closes the sheet */
  public hide(): void { this.sheet.hide(); }
}
