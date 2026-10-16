import { BehaviorSubject, type Observable } from 'rxjs';

import type { Build } from './build';
import { partCount, type Model } from './model';
import { cameraOf, captureOf, castOf, floorOf, reelHeaderOf, reelPageOf, setOf, shotLines, shotsOf, thumbnailOf, viewOf, STAGE_VERSION, type Cast, type ReelFrame, type ReelHeader, type Refusal } from './stage';
import type { Viewer } from './viewer';

// the studio on stage: another Application (a film) stages a scene and shows it in
// place of the build (SEE: stage.ts). A film loads as a reel, its frames in pages,
// and the studio is its screen: it shows whichever frame it is told, the newest when
// several arrive between two of its frames, and captures one exactly when asked. A
// strip says so and carries the way back to the build. Going back ends the stage and
// refuses the film's next frame, so a film pauses rather than taking the view back; a
// stage call starts again. The state streams to the film, so it knows at once. Work
// runs one piece at a time in the order asked (a capture never shares the canvas
// with a frame shown live), and a new stage, the way back or unstage refuses
// whatever waits for the reel it ends. The build is never written: an edit made
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
 *  those refused with why, and the reel's number when one is staged */
export type Staged = Readonly<{ actors: ReadonlyArray<string>; wheeled?: ReadonlyArray<string>; refused?: ReadonlyArray<Refusal>; reel?: number; }>;
/** what a frame call answers: how many actors it shows, and the frame captured when
 *  one is asked for */
export type Framed = Readonly<{ shown: number; image?: ImageBitmap; }>;

/** the stage's state: nothing staged, a scene staged (its reel and the reel's frame
 *  last drawn), or the person gone back to the build */
export type StageState =
  | Readonly<{ kind: 'none'; }>
  | Readonly<{ kind: 'staged'; reel?: number; frame?: number; }>
  | Readonly<{ kind: 'left'; }>;
/** the screen's state as a film follows it: the stage's, and whether the studio holds
 *  a build (a film takes its set from the one that does) */
export type ScreenState = StageState & Readonly<{ build: boolean; }>;

/** a reel as loaded: its number, header and the frames loaded so far, each as this
 *  screen shows it */
type Reel = Readonly<{ id: number; header: ReelHeader; frames: ReelFrame[]; }>;

// == Class =======================================================================
export class StageControl {
  /** the scene staged: its set and actors, while one is shown */
  private cast: Cast | undefined;
  /** the film staged with the scene, when one is */
  private reel: Reel | undefined;
  /** how many reels have been staged: the next reel's number */
  private reels = 0;
  /** the view this screen shows the reel through (the main camera when none) */
  private view: string | undefined;
  /** the person went back to the build since the last stage call */
  private left = false;
  /** the work running, which the next waits for */
  private running: Promise<unknown> = Promise.resolve();
  /** the newest reel frame asked for live, while it waits to be shown */
  private wanted: Readonly<{ reel: number; frame: number; }> | undefined;
  /** how many frames have been put on the canvas: a frame drawn is told only while it
   *  is still the last put there */
  private applied = 0;
  /** whether the studio holds a build, as last told */
  private holds = false;
  private readonly state = new BehaviorSubject<ScreenState>({ kind: 'none', build: false });

  public constructor(private readonly elements: StageElements, private readonly studio: HTMLElement, private readonly viewer: Viewer, private readonly build: Build) {
    elements.back.addEventListener('click', () => { this.left = true; this.end(); });
  }

  // == Stage =====================================================================
  /** whether a stage is shown, whether the person went back to the build since the
   *  last stage call, and whether the studio holds a build of its own */
  public async describe() {
    await this.build.whenReady();
    this.tellBuild()/*the stream says the same from now on*/;
    return { stage: STAGE_VERSION, staged: !!this.cast, left: this.left, build: this.holds };
  }

  /** the screen's state, from now on */
  public state$(): Observable<ScreenState> { return this.state.asObservable(); }

  /** stages a set (LDraw text, else the build) and casts its actors, showing the set
   *  alone until a frame shows them; a reel header readies the screen for a film
   *  shown through `view` (else the main camera), drawn at the film's size */
  public async stage(set: unknown, actors: unknown, floor: unknown, reel: unknown, view: unknown): Promise<Staged> {
    await this.build.whenReady();
    const scene = setOf(set, this.build.getModel());
    const area = floorOf(floor);
    const header = reelHeaderOf(reel);
    const named = viewOf(view);
    const { cast, refused } = castOf(scene, actors);
    this.cast = cast;
    this.reel = header ? { id: ++this.reels, header, frames: [] } : undefined;
    this.view = named;
    this.wanted = undefined/*a frame of the reel before*/;
    this.left = false;
    this.viewer.showStage(scene, area);
    if(header) this.viewer.drawStageAt(header.width, header.height);
    this.show(SHOWING);
    this.publish({ kind: 'staged', ...(this.reel ? { reel: this.reel.id } : {}) });
    const wheeled = [...cast.actors].filter(([, actor]) => actor.rolls).map(([name]) => name);
    return { actors: [...cast.actors.keys()], ...((wheeled.length > 0) ? { wheeled } : {}), ...((refused.length > 0) ? { refused } : {}), ...(this.reel ? { reel: this.reel.id } : {}) };
  }

  /** shows the build again */
  public unstage(): Readonly<{ staged: false; }> {
    this.end();
    return { staged: false };
  }

  // == Reel ======================================================================
  /** loads a page of the reel's frames at `from`, the count loaded so far; a page
   *  that breaks any frame is refused whole */
  public loadReel(reel: unknown, from: unknown, frames: unknown): Readonly<{ loaded: number; }> {
    const { cast, loaded } = this.reelNamed(reel);
    if(from !== loaded.frames.length) throw new Error(`from must be ${loaded.frames.length}, the frames loaded so far`);
    const page = reelPageOf(cast, this.view, frames, loaded.frames.length);
    if(loaded.frames.length + page.length > loaded.header.length) throw new Error(`the reel is ${loaded.header.length} frames long; this page runs past its end`);
    loaded.frames.push(...page);
    return { loaded: loaded.frames.length };
  }

  /** shows a loaded frame of the reel. Live (no capture) it answers at once and the
   *  newest frame asked is shown next; with a capture it answers that exact frame,
   *  drawn whole at that size */
  public showReel(reel: unknown, frame: unknown, capture: unknown): Promise<Framed> {
    const { loaded } = this.reelNamed(reel);
    const shot = this.frameOf(loaded, frame);
    const size = captureOf(capture);
    if(!size) {
      const queued = !!this.wanted;
      this.wanted = { reel: loaded.id, frame: frame as number };
      if(!queued) this.after(async () => { const wanted = this.wanted; this.wanted = undefined; if(wanted) this.showWanted(wanted.reel, wanted.frame); });
      return Promise.resolve({ shown: shot.shots.length });
    } /* else -- that exact frame, captured */

    return this.after(async () => {
      const cast = this.ensure(loaded);
      this.applied++;
      this.viewer.showFrame(shotLines(cast, shot.shots), shot.camera, shot.overlay);
      const image = await this.viewer.capture(size.width, size.height);
      if((this.cast !== cast) || (this.reel !== loaded)) { image.close(); throw new Error(this.ended())/*ended while it settled*/; }
      this.publish({ kind: 'staged', reel: loaded.id, frame: frame as number });
      return { shown: shot.shots.length, image };
    });
  }

  /** a loaded frame of the reel as a small picture, the frame shown left as it is */
  public thumbnail(reel: unknown, frame: unknown, width: unknown, height: unknown): Promise<ImageBitmap> {
    const { loaded } = this.reelNamed(reel);
    const shot = this.frameOf(loaded, frame);
    const size = thumbnailOf(width, height);
    return this.after(async () => {
      const cast = this.ensure(loaded);
      const image = await this.viewer.thumbnail(shotLines(cast, shot.shots), shot.camera, shot.overlay, size.width, size.height);
      if((this.cast !== cast) || (this.reel !== loaded)) { image.close(); throw new Error(this.ended())/*ended while its parts were built*/; }
      return image;
    });
  }

  // == Frames ====================================================================
  /** shows a frame: each actor given where its shot puts it, any other hidden, seen
   *  through the camera; captured at a size when one is given */
  public frame(actors: unknown, camera: unknown, capture: unknown): Promise<Framed> {
    return this.after(async () => {
      const cast = this.cast;
      if(!cast) throw new Error(this.ended());
      const shots = shotsOf(cast, actors);
      const view = cameraOf(camera);
      const size = captureOf(capture);
      this.applied++/*a reel frame waiting to be drawn is no longer the one shown*/;
      this.viewer.showFrame(shotLines(cast, shots), view);
      if(!size) return { shown: shots.length };
      const image = await this.viewer.capture(size.width, size.height);
      if(this.cast !== cast) { image.close(); throw new Error(this.ended())/*ended while it settled*/; }
      return { shown: shots.length, image };
    });
  }

  // == Build =====================================================================
  /** the build changed: while staged, the strip says so; whether the studio holds a
   *  build is told when that changes */
  public buildChanged(): void {
    if(this.cast) this.show(`${SHOWING} · the build changed`);
    this.tellBuild();
  }

  // == Internal ==================================================================
  /** runs `work` once the work before it is done; a failure fails it alone */
  private after<T>(work: () => Promise<T>): Promise<T> {
    const run = this.running.then(work);
    this.running = run.catch(() => undefined/*the next runs regardless*/);
    return run;
  }

  /** shows the newest live frame asked for, if its reel is still the one staged,
   *  telling the film once it is drawn */
  private showWanted(reel: number, frame: number): void {
    const loaded = this.reel, cast = this.cast;
    if(!loaded || !cast || (loaded.id !== reel)) return/*the reel ended while it waited*/;
    const shot = loaded.frames[frame];
    const applied = ++this.applied;
    this.viewer.showFrame(shotLines(cast, shot.shots), shot.camera, shot.overlay);
    void this.viewer.whenSettled().then(() => { if((this.reel === loaded) && (this.applied === applied)) this.publish({ kind: 'staged', reel, frame }); });
  }

  /** the reel staged that `reel` names, with its cast, or why there is none */
  private reelNamed(reel: unknown): Readonly<{ cast: Cast; loaded: Reel; }> {
    const cast = this.cast, loaded = this.reel;
    if(!cast) throw new Error(this.ended());
    if(!loaded) throw new Error('No reel is staged: stage with a reel first.');
    if(reel !== loaded.id) throw new Error(`reel ${String(reel)} is not the reel staged (${loaded.id})`);
    return { cast, loaded };
  }

  /** the loaded frame `frame` names of a reel */
  private frameOf(loaded: Reel, frame: unknown): ReelFrame {
    if(!Number.isInteger(frame) || ((frame as number) < 0) || ((frame as number) >= loaded.frames.length)) throw new Error(`frame must be a loaded frame of the reel, 0 to ${loaded.frames.length - 1}`);
    return loaded.frames[frame as number];
  }

  /** the cast of a reel still staged, or why it is no longer */
  private ensure(loaded: Reel): Cast {
    if(!this.cast || (this.reel !== loaded)) throw new Error(this.ended());
    return this.cast;
  }

  /** why nothing staged can be shown */
  private ended(): string { return this.left ? LEFT : this.cast ? 'The reel was replaced: show a frame of the reel staged.' : UNSTAGED; }

  /** ends the stage: the build shown again, the strip hidden */
  private end(): void {
    this.cast = undefined/*nothing staged*/;
    this.reel = undefined;
    this.wanted = undefined;
    this.viewer.unstage();
    this.show(undefined/*no strip*/);
    this.publish(this.left ? { kind: 'left' } : { kind: 'none' });
  }

  /** tells the film whether the studio holds a build, when that changed */
  private tellBuild(): void {
    const holds = holdsBuild(this.build.getModel());
    if(holds === this.holds) return/*still holding one, or still none*/;
    this.holds = holds;
    this.state.next({ ...this.state.value, build: holds });
  }

  /** tells the film the screen's state */
  private publish(state: StageState): void { this.state.next({ ...state, build: this.holds }); }

  /** shows the strip saying `note`, or hides it */
  private show(note: string | undefined): void {
    this.elements.root.hidden = (note === undefined);
    this.elements.note.textContent = note ?? '';
    this.studio.classList.toggle('is-staged', note !== undefined);
  }
}

// == Util ========================================================================
/** whether a build holds anything a set can show or cast: a part, or a component */
const holdsBuild = (model: Model): boolean => (partCount(model) > 0) || ((model.components?.length ?? 0) > 0);
