import type { Build } from './build';
import { cameraOf, captureOf, castOf, floorOf, setOf, shotLines, shotsOf, STAGE_VERSION, type Cast, type Refusal } from './stage';
import type { Viewer } from './viewer';

// the studio on stage: another Application (a film) stages a scene and shows it frame
// by frame in place of the build (SEE: stage.ts). A strip says so and carries the way
// back to the build. Going back refuses the film's next frame, so a film pauses
// rather than taking the view back; a stage call starts again. Frames run one at a
// time, in the order they are asked for. The build is never written: an edit made
// while staged reaches the build, and the strip says the build changed
// ********************************************************************************
// == Constants ===================================================================
const SHOWING = 'Showing a film scene';
const LEFT = 'The person went back to the build: stage the scene again to go on.';
const UNSTAGED = 'Nothing is staged: call stage first.';

// == Types =======================================================================
/** the strip's elements: the strip, what it says and its way back */
export type StageElements = Readonly<{ root: HTMLElement; note: HTMLElement; back: HTMLButtonElement; }>;

/** what a stage call answers: the actors cast, those among them with wheels to roll,
 *  and those refused with why */
export type Staged = Readonly<{ actors: ReadonlyArray<string>; wheeled?: ReadonlyArray<string>; refused?: ReadonlyArray<Refusal>; }>;
/** what a frame call answers: how many actors it shows, and the frame captured when
 *  one is asked for */
export type Framed = Readonly<{ shown: number; image?: ImageBitmap; }>;

// == Class =======================================================================
export class StageControl {
  /** the scene staged: its set and actors, while one is shown */
  private cast: Cast | undefined;
  /** the person went back to the build since the last stage call */
  private left = false;
  /** the frame running, which the next waits for */
  private running: Promise<unknown> = Promise.resolve();

  public constructor(private readonly elements: StageElements, private readonly studio: HTMLElement, private readonly viewer: Viewer, private readonly build: Build) {
    elements.back.addEventListener('click', () => { this.end(); this.left = true; });
  }

  // == Stage =====================================================================
  /** whether a stage is shown, and whether the person went back to the build since
   *  the last stage call */
  public describe() { return { stage: STAGE_VERSION, staged: !!this.cast, left: this.left }; }

  /** stages a set (LDraw text, else the build) and casts its actors, showing the set
   *  alone until a frame shows them */
  public async stage(set: unknown, actors: unknown, floor: unknown): Promise<Staged> {
    await this.build.whenReady();
    const scene = setOf(set, this.build.getModel());
    const area = floorOf(floor);
    const { cast, refused } = castOf(scene, actors);
    this.cast = cast;
    this.left = false;
    this.viewer.showStage(scene, area);
    this.show(SHOWING);
    const wheeled = [...cast.actors].filter(([, actor]) => actor.rolls).map(([name]) => name);
    return { actors: [...cast.actors.keys()], ...((wheeled.length > 0) ? { wheeled } : {}), ...((refused.length > 0) ? { refused } : {}) };
  }

  /** shows the build again */
  public unstage(): Readonly<{ staged: false; }> {
    this.end();
    return { staged: false };
  }

  // == Frames ====================================================================
  /** shows a frame: each actor given where its shot puts it, any other hidden, seen
   *  through the camera; captured at a size when one is given */
  public frame(actors: unknown, camera: unknown, capture: unknown): Promise<Framed> {
    const run = this.running.then(async () => {
      const cast = this.cast;
      if(!cast) throw new Error(this.left ? LEFT : UNSTAGED);
      const shots = shotsOf(cast, actors);
      const view = cameraOf(camera);
      const size = captureOf(capture);
      this.viewer.showFrame(shotLines(cast, shots), view);
      if(!size) return { shown: shots.length };
      const image = await this.viewer.capture(size.width, size.height);
      if(this.cast !== cast) { image.close(); throw new Error(this.left ? LEFT : UNSTAGED)/*ended while it settled*/; }
      return { shown: shots.length, image };
    });
    this.running = run.catch(() => undefined/*the next frame runs regardless*/);
    return run;
  }

  // == Build =====================================================================
  /** the build changed while staged: the strip says so */
  public buildChanged(): void {
    if(this.cast) this.show(`${SHOWING} · the build changed`);
  }

  // == Internal ==================================================================
  /** ends the stage: the build shown again, the strip hidden */
  private end(): void {
    this.cast = undefined/*nothing staged*/;
    this.viewer.unstage();
    this.show(undefined/*no strip*/);
  }

  /** shows the strip saying `note`, or hides it */
  private show(note: string | undefined): void {
    this.elements.root.hidden = (note === undefined);
    this.elements.note.textContent = note ?? '';
    this.studio.classList.toggle('is-staged', note !== undefined);
  }
}
