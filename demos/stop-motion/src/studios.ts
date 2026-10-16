import { BehaviorSubject, type Observable } from 'rxjs';

import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Film, FilmFrame } from './film';
import type { Recorded } from './recorder';

// the studios a film is shown on: the Applications in the document that export
// commands and describe a stage (SEE: Brick Studio's stage), in the order they are
// found. The first is the main studio: its build is the set, its camera the film's,
// and its frames are the ones captured. Each other studio stages the same set (the
// main studio's build) and shows the scene through a view of its own, the scene's
// views taken in order
// ********************************************************************************
// == Constants ===================================================================
const COMMANDS = 'charmiq.command';

/** how long an Application has to say whether it is a studio */
const PROBE_MILLIS = 3_000/*ms*/;
/** the stage commands a studio speaks */
const STAGE_VERSION = 1;

// == Types =======================================================================
/** a studio's stage commands, as a sibling calls them (one named-arguments object) */
export interface StudioCommands {
  describeStage(args: object): Promise<Readonly<{ stage: number; staged: boolean; left: boolean; }>>;
  stage(args: object): Promise<Readonly<{ actors: ReadonlyArray<string>; wheeled?: ReadonlyArray<string>; refused?: ReadonlyArray<Readonly<{ name: string; reason: string; }>>; }>>;
  frame(args: object): Promise<Readonly<{ shown: number; image?: ImageBitmap; }>>;
  getModel(args: object): Promise<Readonly<{ ldraw?: string; nextLine?: number; conflict?: string; }>>;
}

/** where the stage stands: no studio, staging, staged (with the actors cast that
 *  have wheels, and those refused), or the person went back to the main studio's
 *  build, or a studio failed */
export type StageState = Readonly<
  | { kind: 'none'; }
  | { kind: 'staging'; }
  | { kind: 'staged'; wheeled: ReadonlySet<string>; refused: ReadonlyArray<Readonly<{ name: string; reason: string; }>>; }
  | { kind: 'left'; }
  | { kind: 'failed'; message: string; }
>;

// == Class =======================================================================
export class Studios {
  /** the studios found, in their order */
  private readonly found = new BehaviorSubject<ReadonlyArray<StudioCommands>>([]);
  /** where the stage stands */
  private readonly state = new BehaviorSubject<StageState>({ kind: 'none' });
  /** the scene the studios have staged, and the request staging it */
  private staged: Recorded | undefined;
  private staging: Promise<void> | undefined;
  /** the frame waiting to be shown on the studios, and whether one is being shown */
  private monitored: Readonly<{ film: Film; frame: FilmFrame; }> | undefined;
  private monitoring = false;

  public get studios$(): Observable<ReadonlyArray<StudioCommands>> { return this.found.asObservable(); }
  public get count(): number { return this.found.value.length; }
  public get state$(): Observable<StageState> { return this.state.asObservable(); }
  public get stageState(): StageState { return this.state.value; }

  // == Discovery =================================================================
  /** follows the studios in the document; safe without the bridge (none) */
  public init(charmiq: CharmIQAPI | undefined): void {
    if(!charmiq?.discover$) return/*standalone*/;
    let round = 0;
    charmiq.discover$<StudioCommands>(COMMANDS).subscribe(async providers => {
      const asked = ++round;
      const studios = (await Promise.all(providers.map(async provider => (await isStudio(provider)) ? [provider] : []))).flat();
      if(asked !== round) return/*a newer round answers*/;
      this.found.next(studios);
      this.staged = undefined/*the studios changed: stage again*/;
      this.state.next((studios.length > 0) ? { kind: 'staging' } : { kind: 'none' });
    });
  }

  // == Stage =====================================================================
  /** stages a scene on every studio: the main studio's own build as the set, each
   *  other's the main studio's build as text. Staged once per scene until the
   *  studios or the scene change, or the person goes back to the build */
  public async stage(scene: Recorded): Promise<StageState> {
    if((this.staged === scene) && (this.state.value.kind === 'staged')) return this.state.value;
    if(this.staging) await this.staging.catch(() => undefined/*its failure is the state's*/);
    if((this.staged === scene) && (this.state.value.kind === 'staged')) return this.state.value;
    const [main, ...others] = this.found.value;
    if(!main) { this.state.next({ kind: 'none' }); return this.state.value; }

    this.state.next({ kind: 'staging' });
    this.staging = (async () => {
      const actors = scene.actors.map(({ name, source }) => ({ name, ...source }));
      const floor = scene.floor ? { floor: scene.floor } : {};
      const answer = await main.stage({ actors, ...floor });
      const set = (others.length > 0) ? await buildText(main) : undefined;
      await Promise.all(others.map(studio => studio.stage({ actors, ...floor, ...(set ? { set } : {}) })));
      this.staged = scene;
      this.state.next({ kind: 'staged', wheeled: new Set(answer.wheeled ?? []), refused: answer.refused ?? [] });
    })();
    try { await this.staging; }
    catch(error) { this.state.next({ kind: 'failed', message: messageOf(error) }); }
    finally { this.staging = undefined; }
    return this.state.value;
  }

  // == Frames ====================================================================
  /** shows a frame on every studio, the main studio's captured at `capture` when
   *  given; the person having gone back to the build pauses the film: no frame shows
   *  or stages until the scene is staged again */
  public async frame(film: Film, frame: FilmFrame, capture?: Readonly<{ width: number; height: number; }>): Promise<ImageBitmap | undefined> {
    if(this.state.value.kind === 'left') return undefined/*the slate says why*/;
    const state = await this.stage(film.scene);
    if(state.kind !== 'staged') return undefined/*no studio, or none staged: the state says why*/;
    const [main, ...others] = this.found.value;
    const actors = frame.actors;
    try {
      const [answer] = await Promise.all([
        main.frame({ actors, camera: frame.camera, ...(capture ? { capture } : {}) }),
        ...others.map((studio, index) => {
          const view = film.scene.views[index];
          return studio.frame({ actors, camera: view ? frame.views[view.name] : frame.camera });
        }),
      ]);
      return answer.image;
    } catch(error) {
      const message = messageOf(error);
      this.staged = undefined;
      this.state.next(/went back to the build/.test(message) ? { kind: 'left' } : /Nothing is staged/.test(message) ? { kind: 'staging' } : { kind: 'failed', message });
      return undefined/*not shown: the state says why*/;
    }
  }

  /** shows a frame on every studio without shooting it, so the studios follow what
   *  is on screen: the newest frame asked for while one is shown waits its turn, any
   *  between dropped */
  public monitor(film: Film, frame: FilmFrame): void {
    this.monitored = { film, frame };
    if(this.monitoring) return/*the newest is shown once this one lands*/;
    this.monitoring = true;
    void (async () => {
      while(this.monitored) {
        const next = this.monitored;
        this.monitored = undefined;
        await this.frame(next.film, next.frame);
      }
      this.monitoring = false;
    })();
  }
}

// == Util ========================================================================
/** whether a provider answers its stage's description in time */
const isStudio = (provider: StudioCommands): Promise<boolean> => Promise.race([
  provider.describeStage({}).then(answer => answer?.stage === STAGE_VERSION, () => false),
  new Promise<boolean>(resolve => setTimeout(() => resolve(false), PROBE_MILLIS)),
]);

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

const messageOf = (error: unknown): string => (error instanceof Error) ? error.message : String((error as { message?: unknown; } | null)?.message ?? error);
