import { BehaviorSubject, type Observable } from 'rxjs';

import type { Build } from './build';
import { probe, probeInput, type Probed } from './probe';
import type { Sheet } from './sheet';
import { boardsOf, cameraOf, captureOf, castOf, floorOf, marksOf, pictureOf, reelHeaderOf, reelPageOf, setsOf, shotsOf, shownActors, sizesOf, stagedSetOf, stageFloor, thumbnailOf, viewOf, MAX_THUMBNAIL, STAGE_VERSION, type Cast, type Marks, type ReelFrame, type ReelHeader, type Refusal, type Rest, type Size } from './stage';
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
// whatever waits for the reel it ends. A storyboard shows frames of the reel on the
// sheet until the film next shows or stages a frame. The build is never written: an
// edit made while staged reaches the build, and the strip says the build changed
// ********************************************************************************
// == Constants ===================================================================
const SHOWING = 'Showing a film scene';
const LEFT = 'The person went back to the build: stage the scene again to go on.';
const UNSTAGED = 'Nothing is staged: call stage first.';
const STORYBOARD = 'Your Charm is looking at the film\'s storyboard';
const BACK_TO_FILM = 'Back to the film';

// == Types =======================================================================
/** the strip's elements: the strip, what it says and its way back */
export type StageElements = Readonly<{ root: HTMLElement; note: HTMLElement; back: HTMLButtonElement; }>;

/** what a stage call answers: the actors cast, those among them with wheels to roll,
 *  those refused with why, each cast actor's box, and the reel's number when one is
 *  staged */
export type Staged = Readonly<{ actors: ReadonlyArray<string>; wheeled?: ReadonlyArray<string>; refused?: ReadonlyArray<Refusal>; sizes: Readonly<Record<string, Size>>; placed?: Readonly<Record<string, Rest>>; reel?: number; }>;
/** what a frame call answers: how many actors it shows, and the frame captured when
 *  one is asked for */
export type Framed = Readonly<{ shown: number; image?: ImageBitmap; }>;

/** the stage's state: nothing staged, a scene staged (its reel and the reel's frame
 *  last drawn), or the person gone back to the build */
export type StageState =
  | Readonly<{ kind: 'none'; }>
  | Readonly<{ kind: 'staged'; reel?: number; frame?: number; }>
  | Readonly<{ kind: 'left'; }>;
/** the screen's state as a film follows it: the stage's, whether the studio holds a
 *  build (a film takes its sets from the one that does), the build's sets by name,
 *  and how many times the build has changed since the studio opened (a film's file
 *  knows when to look again) */
export type ScreenState = StageState & Readonly<{ build: boolean; sets: ReadonlyArray<string>; edits: number; }>;

/** a reel as loaded: its number, header and the frames loaded so far, each as this
 *  screen shows it */
type Reel = Readonly<{ id: number; header: ReelHeader; frames: ReelFrame[]; }>;

// == Class =======================================================================
export class StageControl {
  /** the scene staged: its sets and actors, while one is shown */
  private cast: Cast | undefined;
  /** the film staged with the scene, when one is */
  private reel: Reel | undefined;
  /** how many reels have been staged: the next reel's number */
  private reels = 0;
  /** the view this screen shows the reel through (the main camera when none) */
  private view: string | undefined;
  /** what a plan draws over the set, when the stage gave marks */
  private marks: Marks | undefined;
  /** the person went back to the build since the last stage call */
  private left = false;
  /** the work running, which the next waits for */
  private running: Promise<unknown> = Promise.resolve();
  /** the newest reel frame asked for live, while it waits to be shown */
  private wanted: Readonly<{ reel: number; frame: number; }> | undefined;
  /** how many frames have been put on the canvas: a frame drawn is told only while it
   *  is still the last put there */
  private applied = 0;
  /** whether the studio holds a build and its sets, as last told, and how many times
   *  it changed */
  private holds = false;
  private sets: ReadonlyArray<string> = [];
  private edits = 0;
  private readonly state = new BehaviorSubject<ScreenState>({ kind: 'none', build: false, sets: [], edits: 0 });

  public constructor(private readonly elements: StageElements, private readonly studio: HTMLElement, private readonly viewer: Viewer, private readonly build: Build, private readonly sheet: Pick<Sheet, 'show' | 'hide'>) {
    elements.back.addEventListener('click', () => { this.left = true; this.end(); });
  }

  // == Stage =====================================================================
  /** whether a stage is shown, whether the person went back to the build since the
   *  last stage call, whether the studio holds a build of its own, and its sets */
  public async describe() {
    await this.build.whenReady();
    this.tellBuild()/*the stream says the same from now on*/;
    return { stage: STAGE_VERSION, staged: !!this.cast, left: this.left, build: this.holds, sets: this.sets };
  }

  /** the screen's state, from now on */
  public state$(): Observable<ScreenState> { return this.state.asObservable(); }

  /** stages sets (of LDraw text, else of the build; its first set when none is named)
   *  and casts its actors, showing the first set alone until a frame shows them; a reel
   *  header readies the screen for a film shown through `view` (else the main camera),
   *  drawn at the film's size, and `marks` are what a plan draws over the set */
  public async stage(ldraw: unknown, sets: unknown, actors: unknown, floor: unknown, reel: unknown, view: unknown, marks: unknown): Promise<Staged> {
    await this.build.whenReady();
    const staged = setsOf(ldraw, sets, () => this.build.allSets());
    const area = floorOf(floor);
    const header = reelHeaderOf(reel);
    const named = viewOf(view);
    const marked = marksOf(marks);
    const { cast, refused } = castOf(staged, actors);
    this.sheet.hide()/*a storyboard of the film before*/;
    this.cast = cast;
    this.reel = header ? { id: ++this.reels, header, frames: [] } : undefined;
    this.view = named;
    this.marks = marked;
    this.wanted = undefined/*a frame of the reel before*/;
    this.left = false;
    this.viewer.showStage(cast.sets.map(set => set.shown)/*each set without the pieces cast*/, stageFloor(area, staged));
    if(header) this.viewer.drawStageAt(header.width, header.height);
    this.show(SHOWING);
    this.publish({ kind: 'staged', ...(this.reel ? { reel: this.reel.id } : {}) });
    const wheeled = [...cast.actors].filter(([, actor]) => actor.rolls).map(([name]) => name);
    return { actors: [...cast.actors.keys()], ...((wheeled.length > 0) ? { wheeled } : {}), ...((refused.length > 0) ? { refused } : {}), sizes: sizesOf(cast), ...((cast.placed.size > 0) ? { placed: Object.fromEntries(cast.placed) } : {}), ...(this.reel ? { reel: this.reel.id } : {}) };
  }

  /** what stands at points and across segments of a set as a stage of those sets and
   *  actors shows it (the pieces cast left out), staged or not: nothing is shown (SEE:
   *  probe.ts) */
  public async probe(ldraw: unknown, sets: unknown, actors: unknown, set: unknown, points: unknown, segments: unknown, grounds: unknown): Promise<Probed> {
    await this.build.whenReady();
    const asked = probeInput(points, segments, grounds);
    const { cast } = castOf(setsOf(ldraw, sets, () => this.build.allSets()), actors ?? []);
    return probe(cast.sets[stagedSetOf(cast, set)].shown, asked.points, asked.segments, asked.grounds);
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
    this.sheet.hide()/*the film moves on from its storyboard*/;
    if(!size) {
      const queued = !!this.wanted;
      this.wanted = { reel: loaded.id, frame: frame as number };
      if(!queued) this.after(async () => { const wanted = this.wanted; this.wanted = undefined; if(wanted) this.showWanted(wanted.reel, wanted.frame); });
      return Promise.resolve({ shown: shot.shots.length });
    } /* else -- that exact frame, captured */

    return this.after(async () => {
      const cast = this.ensure(loaded);
      this.applied++;
      const picture = this.pictureOf(loaded, shot, undefined);
      this.viewer.showFrame(shownActors(cast, shot.shots), picture.camera, picture.overlay, shot.set);
      const image = await this.viewer.capture(size.width, size.height);
      if((this.cast !== cast) || (this.reel !== loaded)) { image.close(); throw new Error(this.ended())/*ended while it settled*/; }
      this.publish({ kind: 'staged', reel: loaded.id, frame: frame as number });
      return { shown: shot.shots.length, image };
    });
  }

  /** a loaded frame of the reel as a small picture through `view` (the screen's own
   *  camera when none), the frame shown left as it is */
  public thumbnail(reel: unknown, frame: unknown, width: unknown, height: unknown, view?: unknown): Promise<ImageBitmap> {
    const { loaded } = this.reelNamed(reel);
    const shot = this.frameOf(loaded, frame);
    const size = thumbnailOf(width, height);
    const picture = this.pictureOf(loaded, shot, viewOf(view));
    return this.after(async () => {
      const cast = this.ensure(loaded);
      const image = await this.viewer.thumbnail(shownActors(cast, shot.shots), picture.camera, picture.overlay, size.width, size.height, shot.set);
      if((this.cast !== cast) || (this.reel !== loaded)) { image.close(); throw new Error(this.ended())/*ended while its parts were built*/; }
      return image;
    });
  }

  /** shows frames of the reel on the sheet, each captioned and drawn through `view`
   *  (the screen's own camera when none) at the film's shape within its panel;
   *  answers how many once the sheet shows them, none when the sheet was closed or
   *  taken first */
  public async storyboard(reel: unknown, frames: unknown, view: unknown): Promise<Readonly<{ shown: number; }>> {
    const { loaded } = this.reelNamed(reel);
    const boards = boardsOf(frames);
    const named = viewOf(view);
    const pictures = boards.map(board => this.pictureOf(loaded, this.frameOf(loaded, board.frame), named))/*each frame and the view, known first*/;
    const columns = (boards.length <= 4) ? 2 : (boards.length <= 9) ? 3 : 4;
    const panels = boards.map(board => ({ caption: board.caption, alt: `The film at ${board.caption}` }));
    const shown = await this.sheet.show({ title: STORYBOARD, back: BACK_TO_FILM, columns, panels }, async (width, height) => {
      const { header } = loaded;
      const across = Math.min(MAX_THUMBNAIL, width, Math.floor(height * (header.width / header.height)));
      const size = { width: Math.max(1, across), height: Math.max(1, Math.round(across * (header.height / header.width))) };
      const images: ImageBitmap[] = [];
      try {
        for(const [index, board] of boards.entries()) {
          const cast = this.ensure(loaded);
          const shot = loaded.frames[board.frame];
          images.push(await this.after(() => this.viewer.thumbnail(shownActors(cast, shot.shots), pictures[index].camera, pictures[index].overlay, size.width, size.height, shot.set)));
          this.ensure(loaded)/*ended while it was drawn*/;
        }
      } catch(error) {
        images.forEach(image => image.close())/*the pictures drawn so far, which no sheet takes*/;
        throw error;
      }
      return images;
    });
    return { shown: shown ? boards.length : 0 };
  }

  // == Frames ====================================================================
  /** shows a frame on a staged set (the first when none is named): each actor given
   *  where its shot puts it, any other hidden, seen through the camera; captured at a
   *  size when one is given */
  public frame(set: unknown, actors: unknown, camera: unknown, capture: unknown): Promise<Framed> {
    this.sheet.hide()/*the stage moves on from a storyboard*/;
    return this.after(async () => {
      const cast = this.cast;
      if(!cast) throw new Error(this.ended());
      const standing = stagedSetOf(cast, set);
      const shots = shotsOf(cast, actors);
      const view = cameraOf(camera);
      const size = captureOf(capture);
      this.applied++/*a reel frame waiting to be drawn is no longer the one shown*/;
      this.viewer.showFrame(shownActors(cast, shots), view, undefined/*no overlay*/, standing);
      if(!size) return { shown: shots.length };
      const image = await this.viewer.capture(size.width, size.height);
      if(this.cast !== cast) { image.close(); throw new Error(this.ended())/*ended while it settled*/; }
      return { shown: shots.length, image };
    });
  }

  // == Build =====================================================================
  /** the build changed: while staged, the strip says so; the film is told, with
   *  whether the studio holds a build and its sets */
  public buildChanged(): void {
    if(this.cast) this.show(`${SHOWING} · the build changed`);
    this.edits++;
    this.holds = this.build.holdsAnything();
    this.sets = this.build.sets().map(set => set.name);
    this.state.next({ ...this.state.value, build: this.holds, sets: this.sets, edits: this.edits });
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
    const picture = this.pictureOf(loaded, shot, undefined);
    this.viewer.showFrame(shownActors(cast, shot.shots), picture.camera, picture.overlay, shot.set);
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

  /** a reel's frame as this screen draws it through `view` (its own camera when
   *  none), a plan's marks with it */
  private pictureOf(loaded: Reel, shot: ReelFrame, view: string | undefined) {
    return pictureOf(shot, view, this.marks, loaded.header.width / loaded.header.height);
  }

  /** the cast of a reel still staged, or why it is no longer */
  private ensure(loaded: Reel): Cast {
    if(!this.cast || (this.reel !== loaded)) throw new Error(this.ended());
    return this.cast;
  }

  /** why nothing staged can be shown */
  private ended(): string { return this.left ? LEFT : this.cast ? 'The reel was replaced: show a frame of the reel staged.' : UNSTAGED; }

  /** ends the stage: the build shown again, the strip and any storyboard hidden */
  private end(): void {
    this.sheet.hide();
    this.cast = undefined/*nothing staged*/;
    this.reel = undefined;
    this.wanted = undefined;
    this.viewer.unstage();
    this.show(undefined/*no strip*/);
    this.publish(this.left ? { kind: 'left' } : { kind: 'none' });
  }

  /** tells the film whether the studio holds a build and its sets, when either
   *  changed */
  private tellBuild(): void {
    const holds = this.build.holdsAnything();
    const sets = this.build.sets().map(set => set.name);
    if((holds === this.holds) && (sets.join('\n') === this.sets.join('\n'))) return/*as told*/;
    this.holds = holds;
    this.sets = sets;
    this.state.next({ ...this.state.value, build: holds, sets });
  }

  /** tells the film the screen's state */
  private publish(state: StageState): void { this.state.next({ ...state, build: this.holds, sets: this.sets, edits: this.edits }); }

  /** shows the strip saying `note`, or hides it */
  private show(note: string | undefined): void {
    this.elements.root.hidden = (note === undefined);
    this.elements.note.textContent = note ?? '';
    this.studio.classList.toggle('is-staged', note !== undefined);
  }
}

