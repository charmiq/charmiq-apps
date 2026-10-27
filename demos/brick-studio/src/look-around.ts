import type { Sheet } from './sheet';
import type { View, Viewer } from './viewer';

// the build from four sides at once: the sheet over the studio (SEE: sheet.ts) holding
// the build seen from the south, east, north and west, each framed to its own reach of
// the build, so one screenshot sees every side. A Charm opens it (lookAround); it is a
// picture of the build as it stood, so a change to the build or the next camera
// command closes it
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
   *  it fills the panel; resolves to the sides shown, none when it was closed first.
   *  The sheet lays them in the grid (2 by 2, a row or a column of four) whose panels'
   *  shape gives the side showing the least of the build the most pixels of it: a
   *  long street's ends are narrow and its broadsides wide, so each side's share of
   *  its picture is taken at each shape tried */
  public async show(): Promise<ReadonlyArray<string>> {
    const views = SIDES.map(({ view }) => view);
    const panels = SIDES.map(({ side }) => ({ caption: `From the ${side}`, alt: `The build from the ${side}` }));
    const shows = (width: number, height: number) => Math.min(...this.viewer.framedShares(views, width / height).map(share => (share.width * width) * (share.height * height)));
    const shown = await this.sheet.show({ title: TITLE, back: BACK, shape: { shows }, panels }, (width, height) => this.viewer.snapshots(views, width, height));
    return shown ? SIDES.map(({ side }) => side) : [];
  }

  /** closes the sheet */
  public hide(): void { this.sheet.hide(); }
}
