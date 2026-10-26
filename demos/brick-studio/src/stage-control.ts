import { BehaviorSubject, type Observable } from 'rxjs';

import type { PoseBottoms } from '../../brick-shared/rise';
import { skyFrom } from '../../brick-shared/sky';

import type { Build } from './build';
import type { PartLine } from './grid';
import { probe, probeInput, type Probed } from './probe';
import type { Sheet } from './sheet';
import { boardsOf, bottomsOf, cameraOf, captureOf, castOf, floorOf, followOf, ghostsOf, lightOf, marksOf, pathOf, pictureOf, reelHeaderOf, reelPageOf, setsOf, shotLines, shotsOf, shownActors, sizesOf, stagedSetOf, stageFloor, thumbnailOf, viewOf, MAX_THUMBNAIL, STAGE_VERSION, type Cast, type Follow, type Leaving, type Marks, type ReelFrame, type ReelHeader, type Refusal, type Rest, type Shot, type Size } from './stage';
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
// edit made while staged reaches the build, and the strip says the build changed.
// Full screen, the strip carries the film's controls: play or pause, the frame
// scrubbed to, the film's time (Space and the arrows besides). The film plays, so a
// press is asked of it (each ask counted on the state, the latest named) and the
// frames it then shows answer it
// ********************************************************************************
// == Constants ===================================================================
const SHOWING = 'Showing a film scene';
const LEFT = 'The person went back to the build: stage the scene again to go on.';
const UNSTAGED = 'Nothing is staged: call stage first.';
const STORYBOARD = 'Your Charm is looking at the film\'s storyboard';
const BACK_TO_FILM = 'Back to the film';

// == Types =======================================================================
/** the strip's elements: the strip, what it says, its way back, and the film's
 *  controls (shown full screen): their group, play, the frame scrubbed to, the time */
export type StageElements = Readonly<{
  root: HTMLElement; note: HTMLElement; view: HTMLButtonElement; back: HTMLButtonElement;
  film: HTMLElement; play: HTMLButtonElement; scrub: HTMLInputElement; time: HTMLElement;
}>;

/** what a stage call answers: the actors cast, those among them with wheels to roll,
 *  those that pose (figures) and what a figure's rise is measured from, those that
 *  click onto studs, those refused with why, each cast actor's box, and the reel's
 *  number when one is staged */
export type Staged = Readonly<{ actors: ReadonlyArray<string>; wheeled?: ReadonlyArray<string>; figures?: ReadonlyArray<string>; bottoms?: PoseBottoms; clicks?: ReadonlyArray<string>; refused?: ReadonlyArray<Refusal>; sizes: Readonly<Record<string, Size>>; placed?: Readonly<Record<string, Rest>>; reel?: number; }>;
/** what a frame call answers: how many actors it shows, and the frame captured when
 *  one is asked for */
export type Framed = Readonly<{ shown: number; image?: ImageBitmap; }>;

/** the stage's state: nothing staged, a scene staged (its reel and the reel's frame
 *  last drawn), or the person gone back to the build */
export type StageState =
  | Readonly<{ kind: 'none'; }>
  | Readonly<{ kind: 'staged'; reel?: number; frame?: number; }>
  | Readonly<{ kind: 'left'; }>;
/** what the person asks of the film from the studio's controls: to play, to pause,
 *  or to show a frame (from 0) */
export type Ask = Readonly<{ kind: 'play'; } | { kind: 'pause'; } | { kind: 'seek'; frame: number; }>;
/** the screen's state as a film follows it: the stage's, whether the studio holds a
 *  build (a film takes its sets from the one that does), the build's sets by name,
 *  how many times the build has changed since the studio opened (a film's file knows
 *  when to look again), and how many times the person has asked something of the
 *  film from its controls, the latest named (a film acts on each new one) */
export type ScreenState = StageState & Readonly<{ build: boolean; sets: ReadonlyArray<string>; edits: number; asks: number; asked?: Ask; }>;

/** a reel as loaded: its number, header and the frames loaded so far, each as this
 *  screen shows it */
type Reel = Readonly<{ id: number; header: ReelHeader; frames: ReelFrame[]; }>;
/** what the picture shows of the stage, as a person pointing at it names it: the
 *  reel's frame (none for a frame a frame call shows), the view it is seen through
 *  (the main camera when none), the set standing and each actor shown, by name, with
 *  its lines in the scene's frame */
export type StageShown = Readonly<{ frame?: number; view?: string; set: string; actors: ReadonlyArray<Readonly<{ name: string; lines: ReadonlyArray<PartLine>; }>>; }>;
/** a frame drawn: the reel's frame it is (none for a frame call's), the set standing
 *  (an index into the cast's sets) and its shots */
type Drawn = Readonly<{ frame?: number; set: number; shots: ReadonlyArray<Shot>; }>;

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
  /** the actor followed through the film, while one is (SEE: follow) */
  private followed: Follow | undefined;
  /** the frame the picture shows, while a stage stands */
  private drawn: Drawn | undefined;
  /** the reel's frame last shown, and whether the film said it plays */
  private shownFrame = 0;
  private playing = false;
  /** how many times the person has asked something of the film, and the latest */
  private asks = 0;
  private asked: Ask | undefined;
  private readonly state = new BehaviorSubject<ScreenState>({ kind: 'none', build: false, sets: [], edits: 0, asks: 0 });

  public constructor(private readonly elements: StageElements, private readonly studio: HTMLElement, private readonly viewer: Viewer, private readonly build: Build, private readonly sheet: Pick<Sheet, 'show' | 'hide'>) {
    elements.view.addEventListener('click', () => this.holdView(!this.viewer.isViewHeld));
    elements.back.addEventListener('click', () => { this.left = true; this.end(); });
    elements.play.addEventListener('click', () => this.ask(this.playing ? { kind: 'pause' } : { kind: 'play' }));
    elements.scrub.addEventListener('input', () => this.ask({ kind: 'seek', frame: elements.scrub.valueAsNumber }));
    studio.addEventListener('keydown', event => this.key(event));
  }

  // == Stage =====================================================================
  /** whether a stage is shown, whether the person went back to the build since the
   *  last stage call, whether the studio holds a build of its own, its sets, and the
   *  actor it follows through the film, while it follows one */
  public async describe() {
    await this.build.whenReady();
    this.tellBuild()/*the stream says the same from now on*/;
    return { stage: STAGE_VERSION, staged: !!this.cast, left: this.left, build: this.holds, sets: this.sets, ...(this.followed ? { followed: this.followed.actor } : {}) };
  }

  /** the screen's state, from now on */
  public state$(): Observable<ScreenState> { return this.state.asObservable(); }

  /** what the picture shows of the stage, while one stands */
  public shown(): StageShown | undefined {
    const cast = this.cast, drawn = this.drawn;
    if(!cast || !drawn) return undefined/*the build*/;
    return {
      ...((drawn.frame !== undefined) ? { frame: drawn.frame } : {}), ...((this.view !== undefined) ? { view: this.view } : {}), set: cast.sets[drawn.set].name,
      actors: drawn.shots.map(shot => ({ name: shot.name, lines: shotLines(cast, [shot]) })),
    };
  }

  /** stages sets (of LDraw text, else of the build; its first set when none is named)
   *  and casts its actors, showing the first set alone until a frame shows them, lit as
   *  `light` says over the look's own (SEE: stage.ts StageLight) under `sky` over every
   *  set's own (SEE: sky.ts); a reel
   *  header readies the screen for a film shown through `view` (else the main camera),
   *  drawn at the film's size, and `marks` are what a plan draws over the set. To
   *  `keep`, a stage replacing one leaves its picture standing (its actors where they
   *  stood) until a frame shows: a film staged again never shows its set bare */
  public async stage(ldraw: unknown, sets: unknown, actors: unknown, floor: unknown, light: unknown, sky: unknown, reel: unknown, view: unknown, marks: unknown, keep: unknown): Promise<Staged> {
    if((keep !== undefined) && (typeof keep !== 'boolean')) throw new Error('keep is whether the picture standing stays until a frame shows: true or false');
    await this.build.whenReady();
    const staged = setsOf(ldraw, sets, () => this.build.allSets());
    const area = floorOf(floor);
    const lit = lightOf(light);
    const skied = (sky === undefined) ? undefined : skyFrom(sky);
    if(typeof skied === 'string') throw new Error(skied);
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
    this.followed = undefined/*the film follows its actor again once staged*/;
    [this.shownFrame, this.playing] = [0, false];
    this.viewer.useSky(skied)/*before the first set is shown under it*/;
    this.viewer.showStage(cast.sets.map(set => set.shown)/*each set without the pieces cast*/, stageFloor(area, staged), keep === true);
    this.drawn = { set: 0, shots: [] }/*the first set alone, until a frame shows*/;
    this.showHeld();
    this.viewer.useLight(lit);
    if(header) this.viewer.drawStageAt(header.width, header.height);
    this.show(SHOWING);
    this.showControls();
    this.publish({ kind: 'staged', ...(this.reel ? { reel: this.reel.id } : {}) });
    const [wheeled, figures, clicks] = (['rolls', 'poses', 'clicks'] as const).map(can => [...cast.actors].filter(([, actor]) => actor[can]).map(([name]) => name));
    const bottoms = bottomsOf(cast);
    return { actors: [...cast.actors.keys()], ...((wheeled.length > 0) ? { wheeled } : {}), ...((figures.length > 0) ? { figures } : {}), ...(bottoms ? { bottoms } : {}), ...((clicks.length > 0) ? { clicks } : {}), ...((refused.length > 0) ? { refused } : {}), sizes: sizesOf(cast), ...((cast.placed.size > 0) ? { placed: Object.fromEntries(cast.placed) } : {}), ...(this.reel ? { reel: this.reel.id } : {}) };
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

  /** the shot a transition leaves as the viewer draws it: its actors' lines, when it
   *  names its own */
  private leavingShot(cast: Cast, leaving: Leaving | undefined) {
    return leaving && { camera: leaving.camera, set: leaving.set, ...(leaving.shots ? { actors: shownActors(cast, leaving.shots) } : {}) };
  }

    /** shows the build again */
  public unstage(): Readonly<{ staged: false; }> {
    this.end();
    return { staged: false };
  }

  /** follows an actor through the film shown: at each frame shown live, its ghosts at
   *  each drawing within its seconds back and ahead and its path through its hips, its
   *  keys marked (SEE: stage.ts Follow); none to follow no one. Answers the actor
   *  followed and how many ghosts the frame shown has */
  public follow(input: unknown): Readonly<{ followed: string | null; ghosts: number; }> {
    const cast = this.cast;
    if(!cast && (input !== undefined) && (input !== null)) throw new Error('nothing is staged to follow an actor through');
    this.followed = cast && followOf(cast, input);
    return { followed: this.followed?.actor ?? null, ghosts: this.ghost() };
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
   *  newest frame asked is shown next, the film `playing` or not as it says; with a
   *  capture it answers that exact frame, drawn whole at that size */
  public showReel(reel: unknown, frame: unknown, capture: unknown, playing?: unknown): Promise<Framed> {
    const { loaded } = this.reelNamed(reel);
    const shot = this.frameOf(loaded, frame);
    const size = captureOf(capture);
    if((playing !== undefined) && (typeof playing !== 'boolean')) throw new Error('playing is whether the film plays: true or false');
    this.sheet.hide()/*the film moves on from its storyboard*/;
    if(!size) {
      if(playing !== undefined) this.playing = playing;
      const queued = !!this.wanted;
      this.wanted = { reel: loaded.id, frame: frame as number };
      if(!queued) this.after(async () => { const wanted = this.wanted; this.wanted = undefined; if(wanted) this.showWanted(wanted.reel, wanted.frame); });
      return Promise.resolve({ shown: shot.shots.length });
    } /* else -- that exact frame, captured */

    return this.after(async () => {
      const cast = this.ensure(loaded);
      this.applied++;
      const picture = this.pictureOf(loaded, shot, undefined);
      this.viewer.showFrame(shownActors(cast, shot.shots), picture.camera, picture.overlay, shot.set, this.leavingShot(cast, picture.leaving), true/*through its own camera*/);
      this.drawn = { frame: frame as number, set: shot.set, shots: shot.shots };
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
      const image = await this.viewer.thumbnail(shownActors(cast, shot.shots), picture.camera, picture.overlay, size.width, size.height, shot.set, this.leavingShot(cast, picture.leaving));
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
          images.push(await this.after(() => this.viewer.thumbnail(shownActors(cast, shot.shots), pictures[index].camera, pictures[index].overlay, size.width, size.height, shot.set, this.leavingShot(cast, pictures[index].leaving))));
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
      this.viewer.showFrame(shownActors(cast, shots), view, undefined/*no overlay*/, standing, undefined/*no transition*/, !!size/*a capture through its own camera*/);
      this.drawn = { set: standing, shots };
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
    this.viewer.showFrame(shownActors(cast, shot.shots), picture.camera, picture.overlay, shot.set, this.leavingShot(cast, picture.leaving));
    this.drawn = { frame, set: shot.set, shots: shot.shots };
    this.shownFrame = frame;
    this.ghost();
    this.showControls();
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
    this.drawn = undefined;
    this.viewer.unstage();
    this.showHeld();
    this.show(undefined/*no strip*/);
    this.showControls();
    this.publish(this.left ? { kind: 'left' } : { kind: 'none' });
  }

  /** draws the followed actor's ghosts and path about the frame shown live (none while
   *  no actor is followed or no reel is loaded); answers how many ghosts */
  private ghost(): number {
    const loaded = this.reel, cast = this.cast, follow = this.followed;
    if(!loaded || !cast || !follow) { this.viewer.showGhosts([], undefined, { before: 0, after: 0 }); return 0; }
    const ghosts = ghostsOf(loaded.frames, loaded.header.fps, this.shownFrame, follow);
    this.viewer.showGhosts(ghosts.map(({ shot, offset }) => ({ lines: shotLines(cast, [shot]), offset })), pathOf(cast, loaded.frames, loaded.header.fps, this.shownFrame, follow), follow);
    return ghosts.length;
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
  private publish(state: StageState): void { this.state.next({ ...state, build: this.holds, sets: this.sets, edits: this.edits, asks: this.asks, ...(this.asked ? { asked: this.asked } : {}) }); }

  // .. Controls ..................................................................
  /** asks the film to play, pause or show a frame, as the person pressed */
  private ask(asked: Ask): void {
    if(!this.reel) return/*no film to ask*/;
    [this.asks, this.asked] = [this.asks + 1, asked];
    this.state.next({ ...this.state.value, asks: this.asks, asked });
  }

  /** the keys the film's controls take full screen: Space plays or pauses (unless the
   *  person holds the view: then it lifts the camera), the arrows step a frame (a second
   *  with Shift) */
  private key(event: KeyboardEvent): void {
    const header = this.reel?.header;
    if(!header || !isFullScreen(this.studio) || event.altKey || event.ctrlKey || event.metaKey) return;
    if(event.key === ' ') { if(this.viewer.isViewHeld) return/*the camera's: up*/; this.ask(this.playing ? { kind: 'pause' } : { kind: 'play' }); }
    else if((event.key === 'ArrowLeft') || (event.key === 'ArrowRight')) {
      const step = (event.shiftKey ? header.fps : 1) * ((event.key === 'ArrowLeft') ? -1 : 1);
      this.ask({ kind: 'seek', frame: Math.max(0, Math.min(header.length - 1, this.shownFrame + step)) });
    } else return/*not the film's*/;
    event.preventDefault();
  }

  /** the film's controls as the reel stands: hidden with none, else at its frame */
  private showControls(): void {
    const { film, play, scrub, time } = this.elements;
    const header = this.reel?.header;
    film.hidden = !header;
    if(!header) { this.studio.classList.toggle('is-playing', false); return; }
    scrub.max = String(header.length - 1);
    scrub.value = String(this.shownFrame);
    time.textContent = `${clock(this.shownFrame / header.fps)} / ${clock(header.length / header.fps)}`;
    play.setAttribute('aria-pressed', String(this.playing));
    this.studio.classList.toggle('is-playing', this.playing)/*the strip rests only over a film playing*/;
    play.title = this.playing ? 'Pause (Space)' : 'Play (Space)';
    play.ariaLabel = this.playing ? 'Pause' : 'Play';
  }

  /** holds the view for the person or lets it go (SEE: Viewer.holdView): let go, the
   *  frame shown stands through its own camera again */
  private holdView(held: boolean): void {
    this.viewer.holdView(held);
    this.showHeld();
    const loaded = this.reel;
    if(!held && loaded?.frames[this.shownFrame]) this.showWanted(loaded.id, this.shownFrame);
  }

  /** the strip's view button, and the studio, as the viewer holds the view */
  private showHeld(): void {
    const held = this.viewer.isViewHeld;
    this.elements.view.setAttribute('aria-pressed', String(held));
    this.studio.classList.toggle('is-holding', held);
  }

  /** shows the strip saying `note`, or hides it */
  private show(note: string | undefined): void {
    this.elements.root.hidden = (note === undefined);
    this.elements.note.textContent = note ?? '';
    this.studio.classList.toggle('is-staged', note !== undefined);
  }
}

// == Util ========================================================================
/** whether an element fills the screen */
const isFullScreen = (element: HTMLElement): boolean => element.ownerDocument.fullscreenElement === element;

/** seconds as minutes, seconds and tenths: 1:05.3 */
const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
