// the build's autofocus, as a camera's: the distance to what lies at the middle of the
// picture, found on the first frame the picture rests (nothing moved since the frame
// before: the camera, its damping, parts dropping) and never while it moves, where it
// was last found in the meantime. A frame is not settled while its focus is yet to be
// found, and a change in the distance found is told once, so a refining renderer
// starts again from it
// ********************************************************************************
export class AutoFocus {
  /** the distance last found; none before the first */
  private found: number | undefined;
  /** the picture moved since the distance was last found */
  private stale = true;
  /** the distance found changed since it was last told */
  private moved = false;

  /** `find` measures the distance to what lies at the middle of the picture now */
  public constructor(private readonly find: () => number) {}

  /** the distance in focus now: where it was last found, none before the first */
  public get distance(): number | undefined { return this.found; }

  /** a frame, once per frame drawn, `moving` when anything in its picture moved since
   *  the frame before: the distance found when it rests; whether a frame more is
   *  needed to find it */
  public frame(moving: boolean): boolean {
    if(moving) { this.stale = true; return true; }
    if(!this.stale) return false;
    const distance = this.find();
    if(distance !== this.found) this.moved = true;
    this.found = distance;
    this.stale = false;
    return false;
  }

  /** whether the focus for the picture is yet to be found */
  public get pending(): boolean { return this.stale; }

  /** whether the distance found changed since this was last asked */
  public takeMoved(): boolean {
    const moved = this.moved;
    this.moved = false;
    return moved;
  }

  /** what lies at the middle changed beneath the view (the build drawn again): found
   *  again on the next frame at rest */
  public forget(): void { this.stale = true; }
}
