import { BehaviorSubject, Subject, type Observable, type Subscription } from 'rxjs';

import type { CharmIQAPI } from '../../../shared/charmiq';
import { planMarksOf, reelFrameOf, type Film, type Paint } from './film';
import type { Size } from './measure';
import type { Recorded } from './recorder';

// the studios a film is seen on: the Applications in the document that export
// commands and describe a stage (SEE: Brick Studio's stage). Each studio is a screen.
// The one holding a build is the main screen: its build is the set, its camera the
// film's, and its frames are the ones captured; studios without a build are further
// screens, each showing the scene through the scene's views in the order found. More
// than one holding a build stops the film rather than choosing by which loaded first.
// A film is staged once per scene: the cast and the reel's header (with a plan's
// marks when the scene has a plan view), then the film made with the wheels the stage
// found, loaded on every screen a page at a time; the stage's sizes of the actors are
// kept for measuring. A frame is then a number sent to each screen, and each studio's
// state streams back: the person going back to a build pauses the film at once, a
// build appearing in a studio or emptied out chooses the screens again, and each
// change to the main studio's build is told on (the film's file looks again). The
// main studio's build is the film's set, read and written whole for its files, and a
// set written is staged anew
// ********************************************************************************
// == Constants ===================================================================
const COMMANDS = 'charmiq.command';

/** how long the studios are waited for before those that answered are arranged: a
 *  busy studio answering later joins then */
const PROBE_MILLIS = 3_000/*ms*/;
/** the stage commands a studio speaks */
const STAGE_VERSION = 3;
/** the frames a reel loads at a time (Brick Studio's MAX_REEL_PAGE) */
const REEL_PAGE = 240/*frames*/;
/** how long the main screen has to draw a frame a Charm seeks to */
const SHOWN_MILLIS = 10_000/*ms*/;

// == Types =======================================================================
/** a studio's state as its stream tells it: its stage's, whether it holds a build, and
 *  how many times its build has changed */
type ScreenState = Readonly<{ kind: 'none' | 'staged' | 'left'; reel?: number; frame?: number; build?: boolean; edits?: number; }>;

/** a studio's stage commands, as a sibling calls them (one named-arguments object) */
export interface StudioCommands {
  describeStage(args: object): Promise<Readonly<{ stage: number; staged: boolean; left: boolean; build: boolean; }>>;
  stage$(): Observable<ScreenState>;
  stage(args: object): Promise<Readonly<{ actors: ReadonlyArray<string>; wheeled?: ReadonlyArray<string>; refused?: ReadonlyArray<Readonly<{ name: string; reason: string; }>>; sizes?: Readonly<Record<string, Size>>; reel?: number; }>>;
  loadReel(args: object): Promise<Readonly<{ loaded: number; }>>;
  show(args: object): Promise<Readonly<{ shown: number; image?: ImageBitmap; }>>;
  thumbnail(args: object): Promise<Readonly<{ image: ImageBitmap; }>>;
  storyboard(args: object): Promise<Readonly<{ shown: number; }>>;
  getModel(args: object): Promise<Readonly<{ ldraw?: string; nextLine?: number; conflict?: string; }>>;
  setModel(args: object): Promise<unknown>;
  clear(args: object): Promise<unknown>;
}

/** a studio found: its commands, and whether it holds a build */
type Found = Readonly<{ commands: StudioCommands; build: boolean; }>;

/** where the film stands on the studios: none found, more than one holding a build,
 *  staging, staged (with the actors cast that have wheels, those refused, and each
 *  actor's box), the person gone back to a studio's build, or a studio failed */
export type StageState = Readonly<
  | { kind: 'none'; }
  | { kind: 'ambiguous'; builds: number; }
  | { kind: 'staging'; }
  | { kind: 'staged'; wheeled: ReadonlySet<string>; refused: ReadonlyArray<Readonly<{ name: string; reason: string; }>>; sizes: Readonly<Record<string, Size>>; }
  | { kind: 'left'; }
  | { kind: 'failed'; message: string; }
>;

/** a frame on a storyboard: the frame and what its caption says */
export type Board = Readonly<{ frame: number; caption: string; }>;

/** a film staged: its scene and film, the screens it is on (the main first) and each
 *  screen's reel */
type Staged = Readonly<{ scene: Recorded; film: Film; screens: ReadonlyArray<StudioCommands>; reels: ReadonlyArray<number>; }>;

// == Class =======================================================================
export class Studios {
  /** the studios found, in the order found */
  private readonly found = new BehaviorSubject<ReadonlyArray<Found>>([]);
  /** where the film stands */
  private readonly state = new BehaviorSubject<StageState>({ kind: 'none' });
  /** the screens a film is staged on, the main first, while the studios found allow one */
  private screens: ReadonlyArray<StudioCommands> = [];
  /** the film staged, and the stagings asked for, each run once those before it end */
  private staged: Staged | undefined;
  private stagings: Promise<unknown> = Promise.resolve();
  /** each studio's state stream, followed */
  private watching: Subscription[] = [];
  /** each frame the main screen reports drawn */
  private readonly drawn = new Subject<number>();
  /** each change to the main studio's build, by its count */
  private readonly setChanges = new Subject<number>();
  /** the main screen's build changes last told: each frame drawn repeats them */
  private mainEdits: number | undefined;

  public get studios$(): Observable<ReadonlyArray<unknown>> { return this.found.asObservable(); }
  public get count(): number { return this.found.value.length; }
  public get state$(): Observable<StageState> { return this.state.asObservable(); }
  public get stageState(): StageState { return this.state.value; }
  /** the film staged, made with the wheels the stage found */
  public get film(): Film | undefined { return this.staged?.film; }
  /** each change to the main studio's build (the film's set) */
  public get setChanges$(): Observable<number> { return this.setChanges.asObservable(); }

  /** `paint` colors a plan's marks */
  public constructor(private readonly paint: Paint) {}

  // == Discovery =================================================================
  /** follows the studios in the document; safe without the bridge (none) */
  public init(charmiq: CharmIQAPI | undefined): void {
    if(!charmiq?.discover$) return/*standalone*/;
    let round = 0;
    charmiq.discover$<StudioCommands>(COMMANDS).subscribe(providers => {
      const asked = ++round;
      const answered = new Map<StudioCommands, Found>();
      let waited = false;
      /** the studios that answered, in the order found */
      const take = () => {
        if(asked !== round) return/*a newer round answers*/;
        const found = providers.flatMap(provider => answered.get(provider) ?? []);
        this.arrange(found);
        this.found.next(found);
      };
      const probes = providers.map(provider => probe(provider).then(found => {
        if(!found) return/*not a studio*/;
        answered.set(provider, found);
        if(waited) take()/*a busy studio answering late joins*/;
      }));
      void Promise.race([Promise.all(probes), new Promise(resolve => setTimeout(resolve, PROBE_MILLIS))]).then(() => { waited = true; take(); });
    });
  }

  // == Stage =====================================================================
  /** stages a scene on every screen and loads its film, made by `filmFor` with the
   *  wheels the stage found. Staged once per scene until the scene or the studios
   *  change, or a studio goes back to its build. One scene is staged at a time, in the
   *  order asked. A staging the studios changed under (arranged again while it ran)
   *  tells nothing, staged or failed: the newer state stands */
  public stage(scene: Recorded, filmFor: (wheeled: ReadonlySet<string>) => Film): Promise<StageState> {
    const staging = this.stagings.then(() => this.stageNow(scene, filmFor));
    this.stagings = staging.catch(() => undefined/*the next runs regardless*/);
    return staging;
  }

  /** stages a scene, the stagings asked before it ended (SEE: stage) */
  private async stageNow(scene: Recorded, filmFor: (wheeled: ReadonlySet<string>) => Film): Promise<StageState> {
    if((this.staged?.scene === scene) && (this.state.value.kind === 'staged')) return this.state.value;
    if(this.state.value.kind === 'ambiguous') return this.state.value/*no film until one build remains*/;
    const screens = this.screens;
    if(screens.length < 1) { this.state.next({ kind: 'none' }); return this.state.value; }

    this.staged = undefined;
    this.state.next({ kind: 'staging' });
    try {
      const [main, ...others] = screens;
      const actors = scene.actors.map(({ name, source }) => ({ name, ...source }));
      const floor = scene.floor ? { floor: scene.floor } : {};
      const reel = { fps: scene.fps, length: scene.frames, width: scene.width, height: scene.height };
      const marks = scene.views.some(view => view.plan) ? { marks: planMarksOf(filmFor(new Set())/*its wheels move nothing*/, this.paint) } : {};
      const answer = await main.stage({ actors, ...floor, reel, ...marks });
      const set = (others.length > 0) ? await buildText(main) : undefined;
      const answers = await Promise.all(others.map((studio, index) => {
        const view = scene.views[index]?.name;
        return studio.stage({ actors, ...floor, ...(set ? { set } : {}), reel, ...(view ? { view } : {}), ...marks });
      }));
      const reels = [answer, ...answers].map(each => each.reel);
      if(reels.some(each => each === undefined)) throw new Error('A studio took the scene but no reel: it may need updating.');

      // the film with its wheels, loaded on every screen; an actor the stage refused
      // is left out of every frame (the sheet says why)
      const film = filmFor(new Set(answer.wheeled ?? []));
      const cast = new Set(answer.actors);
      const frames = film.frames.map(frame => reelFrameOf({ ...frame, actors: frame.actors.filter(shot => cast.has(shot.name)) }));
      for(let from=0; from<frames.length; from+=REEL_PAGE) {
        const page = frames.slice(from, from + REEL_PAGE);
        await Promise.all(screens.map((screen, index) => screen.loadReel({ reel: reels[index], from, frames: page })));
      }
      if(this.screens !== screens) return this.state.value/*the studios changed meanwhile*/;
      this.staged = { scene, film, screens, reels: reels as number[] };
      this.state.next({ kind: 'staged', wheeled: new Set(answer.wheeled ?? []), refused: answer.refused ?? [], sizes: answer.sizes ?? {} });
    } catch(error) {
      if(this.screens === screens) this.fail(error);
    }
    return this.state.value;
  }

  // == Frames ====================================================================
  /** shows a frame on every screen; each draws the newest it is sent */
  public show(index: number): void {
    const staged = this.ready();
    if(!staged) return/*nothing staged: the state says why*/;
    staged.screens.forEach((screen, at) => { screen.show({ reel: staged.reels[at], frame: index }).catch(error => this.refused(staged, error)); });
  }

  /** a frame of `film` drawn whole (fade and title included) on the main screen at a
   *  size, or undefined when it cannot be: the film is no longer the one staged, or the
   *  state says why */
  public async capture(film: Film, index: number, size: Readonly<{ width: number; height: number; }>): Promise<ImageBitmap | undefined> {
    const staged = this.ready();
    if(!staged || (staged.film !== film)) return undefined;
    try { return (await staged.screens[0].show({ reel: staged.reels[0], frame: index, capture: size })).image; }
    catch(error) { this.refused(staged, error); return undefined; }
  }

  /** a small picture of a frame from the main screen, the frame shown left as it is;
   *  undefined when it cannot be had */
  public async thumbnail(index: number, size: Readonly<{ width: number; height: number; }>): Promise<ImageBitmap | undefined> {
    const staged = this.ready();
    if(!staged) return undefined;
    try { return (await staged.screens[0].thumbnail({ reel: staged.reels[0], frame: index, ...size })).image; }
    catch(error) { this.refused(staged, error); return undefined; }
  }

  /** shows frames of the film on the main screen's storyboard sheet, through `view`
   *  when named, answering how many it shows; refuses while the film is not staged */
  public async storyboard(frames: ReadonlyArray<Board>, view?: string): Promise<number> {
    const staged = this.ready();
    if(!staged) throw new Error(notStaged(this.state.value));
    return (await staged.screens[0].storyboard({ reel: staged.reels[0], frames, ...((view !== undefined) ? { view } : {}) })).shown;
  }

  /** resolves once the main screen reports a frame drawn; refuses after SHOWN_MILLIS,
   *  or once the film stops being staged */
  public whenShown(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const subscriptions: Subscription[] = [];
      const done = () => { clearTimeout(timer); queueMicrotask(() => subscriptions.forEach(subscription => subscription.unsubscribe())); };
      const timer = setTimeout(() => { done(); reject(new Error(`The studio did not draw frame ${index} within ${SHOWN_MILLIS / 1000} seconds.`)); }, SHOWN_MILLIS);
      subscriptions.push(
        this.drawn.subscribe(frame => { if(frame === index) { done(); resolve(); } }),
        this.state.subscribe(state => { if(state.kind !== 'staged') { done(); reject(new Error(notStaged(state))); } })/*answers at once: already stopped refuses now*/,
      );
    });
  }

  // == Set =======================================================================
  /** the main studio's build, the film's set, as LDraw text */
  public async readSet(): Promise<string> { return buildText(this.main()); }

  /** puts LDraw text in the main studio's build; the film is staged anew on it */
  public async writeSet(ldraw: string): Promise<void> {
    await this.main().setModel({ ldraw });
    this.staged = undefined/*its set is gone: the next staging stages again*/;
  }

  /** empties the main studio's build; the film is staged anew on it */
  public async clearSet(): Promise<void> {
    await this.main().clear({});
    this.staged = undefined/*its set is gone: the next staging stages again*/;
  }

  // == Internal ==================================================================
  /** the main studio, or why there is none */
  private main(): StudioCommands {
    const state = this.state.value;
    if(this.screens.length > 0) return this.screens[0];
    throw new Error((state.kind === 'ambiguous') ? `${state.builds} studios hold a build: keep the set in one, and the others empty.` : 'No studio: add Brick Studio to this document.');
  }

  /** the screens for the studios found: the one holding a build first, then the
   *  rest in the order found; none while more than one holds a build. Every studio's
   *  state is followed, and the film stages again */
  private arrange(found: ReadonlyArray<Found>): void {
    const builds = found.filter(each => each.build);
    const main = (builds.length === 1) ? builds[0] : (builds.length < 1) ? found[0] : undefined;
    this.screens = main ? [main.commands, ...found.filter(each => each !== main).map(each => each.commands)] : [];
    this.staged = undefined/*the studios changed: stage again*/;
    this.mainEdits = undefined/*the main screen's build told afresh*/;

    for(const subscription of this.watching) subscription.unsubscribe();
    this.watching = found.map(studio => studio.commands.stage$().subscribe({
      next: state => this.studioState(found, studio, state),
      error: () => undefined/*a studio that streams no state still shows frames*/,
    }));
    this.state.next((found.length < 1) ? { kind: 'none' } : (builds.length > 1) ? { kind: 'ambiguous', builds: builds.length } : { kind: 'staging' });
  }

  /** a studio's state: a build appearing in it or emptied out chooses the screens
   *  again (once its stream has answered); otherwise what it says as a screen */
  private studioState(found: ReadonlyArray<Found>, studio: Found, state: ScreenState): void {
    if((this.screens[0] === studio.commands) && (state.edits !== undefined) && (state.edits !== this.mainEdits)) { this.mainEdits = state.edits; this.setChanges.next(state.edits)/*the film's set*/; }
    if((state.build !== undefined) && (state.build !== studio.build)) {
      const changed = found.map(each => (each === studio) ? { ...each, build: state.build! } : each);
      queueMicrotask(() => { if(this.found.value === found) { this.arrange(changed); this.found.next(changed); } })/*outside the stream's own call*/;
      return;
    } /* else -- its build as it was */
    const at = this.screens.indexOf(studio.commands);
    if(at >= 0) this.screenState(studio.commands, at, state);
  }

  /** a screen's state: the main screen's frames drawn, and any screen of the film
   *  going back to its build (or unstaged) pausing it until it is staged again */
  private screenState(screen: StudioCommands, at: number, state: ScreenState): void {
    const staged = this.staged;
    if(!staged || !staged.screens.includes(screen)) return/*not showing this film*/;
    if((state.kind === 'staged') && (state.reel === staged.reels[at])) {
      if((at === 0) && (state.frame !== undefined)) this.drawn.next(state.frame);
      return;
    } /* else -- the screen no longer shows this film's reel */
    if(state.kind === 'staged') return/*a newer reel of its own: a stage in flight*/;
    this.staged = undefined;
    this.state.next({ kind: 'left' });
  }

  /** the film staged, when the state allows frames */
  private ready(): Staged | undefined { return (this.state.value.kind === 'staged') ? this.staged : undefined; }

  /** a screen refused a staged film's frame: the person went back, or it failed */
  private refused(staged: Staged, error: unknown): void {
    if(this.staged !== staged) return/*already replaced*/;
    this.fail(error);
  }

  /** the film stops: the person went back to a build, or a studio failed */
  private fail(error: unknown): void {
    const message = messageOf(error);
    this.staged = undefined;
    this.state.next(/went back to the build/.test(message) ? { kind: 'left' } : { kind: 'failed', message });
  }
}

// == Util ========================================================================
/** a provider as a studio found, once it describes its stage; undefined for an
 *  Application that refuses (no studio) or speaks other stage commands */
const probe = (provider: StudioCommands): Promise<Found | undefined> =>
  provider.describeStage({}).then(answer => (answer?.stage === STAGE_VERSION) ? { commands: provider, build: answer.build === true } : undefined, () => undefined);

/** a studio's build as LDraw text, read a page at a time */
const buildText = async (studio: StudioCommands): Promise<string> => {
  let text = '', fromLine: number | undefined = 0;
  while(fromLine !== undefined) {
    const page = await studio.getModel({ fromLine });
    if(page.conflict) throw new Error(page.conflict);
    text += page.ldraw ?? '';
    fromLine = page.nextLine;
  }
  return text;
};

/** why a film not staged shows nothing */
const notStaged = (state: StageState): string => `The film is not staged (${state.kind}): describeFilm says why.`;

const messageOf = (error: unknown): string => (error instanceof Error) ? error.message : String((error as { message?: unknown; } | null)?.message ?? error);
