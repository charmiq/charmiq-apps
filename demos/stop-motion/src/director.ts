import { filmOf, type Film } from './film';
import type { Recorded, SceneError } from './recorder';
import type { SceneRun } from './scene-runner';
import type { Studios } from './studios';

// the film's director: runs each scene's code into a film and stages it on the
// studios. The latest scene that ran is the one staged: a newer run replaces it, and
// staging it again (the studios changed, or the person asks) never runs its code again
// and never brings back an older film. A film is shown only while its scene is still
// the latest; a scene with a mistake keeps the last film that ran
// ********************************************************************************
// == Types =======================================================================
/** where the director shows what it takes: the film made, and a scene's mistake (or
 *  none) */
export type DirectorHost = Readonly<{
  show: (film: Film) => void;
  error: (error: SceneError | undefined) => void;
}>;

/** a scene that ran, and its film before the stage found its wheels */
type Take = Readonly<{ scene: Recorded; first: Film; }>;

// == Class =======================================================================
export class Director {
  /** the latest scene that ran, while there is one */
  private latest: Take | undefined;
  /** how many scenes have been asked to run: a newer run wins */
  private runs = 0;

  public constructor(private readonly studios: Pick<Studios, 'stage' | 'film'>, private readonly run: (code: string) => Promise<SceneRun>, private readonly host: DirectorHost) {}

  /** runs a scene's code into a film and stages it */
  public async take(code: string): Promise<void> {
    const asked = ++this.runs;
    const result = await this.run(code);
    if(asked !== this.runs) return/*a newer scene runs*/;
    if(!result.ok) { this.host.error(result.error); return; }
    let first: Film;
    try { first = filmOf(result.scene); }
    catch(failure) { this.host.error({ message: (failure as Error).message, line: (failure as { sceneLine?: number; }).sceneLine }); return; }
    this.host.error(undefined);
    this.latest = { scene: result.scene, first };
    await this.stageLatest();
  }

  /** stages the latest scene again as it is, its code not run again */
  public restage(): Promise<void> { return this.stageLatest(); }

  // == Internal ==================================================================
  /** stages the latest scene, made with the wheels the stage finds, and shows its
   *  film unless a newer scene took its place meanwhile (the film without wheels when
   *  no studio took it) */
  private async stageLatest(): Promise<void> {
    const take = this.latest;
    if(!take) return/*no scene has run yet: its run stages it*/;
    await this.studios.stage(take.scene, wheeled => (wheeled.size > 0) ? filmOf(take.scene, wheeled) : take.first);
    if(this.latest !== take) return/*a newer scene*/;
    this.host.show((this.studios.film?.scene === take.scene) ? this.studios.film : take.first);
  }
}
