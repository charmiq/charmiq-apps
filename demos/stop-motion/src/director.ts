import { filmOf, type Film } from './film';
import type { FigurePart, Recorded, SceneError } from './recorder';
import type { SceneRun } from './scene-runner';
import type { Studios } from './studios';

// the film's director: runs each scene's code into a film and stages it on the
// studios. The latest scene that ran is the one staged: a newer run replaces it, and
// staging it again (the studios changed, or the person asks) never runs its code again
// and never brings back an older film. A film is shown only while its scene is still
// the latest; a scene with a mistake keeps the last film that ran. A scene runs with
// the figures built into the set (its audiences lift them), and runs again, its code as
// it was, once they change: the set found, edited or replaced
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
/** a scene's code as last asked to run, and the figure parts it ran with, by their text */
type Asked = Readonly<{ code: string; parts: string; }>;

// == Class =======================================================================
export class Director {
  /** the latest scene that ran, while there is one */
  private latest: Take | undefined;
  /** how many scenes have been asked to run: a newer run wins */
  private runs = 0;
  /** the latest scene asked to run, while there is one */
  private asked: Asked | undefined;
  /** the figure parts the latest scene ran with, none while no studio listed them */
  private ranWith: ReadonlyArray<FigurePart> | undefined;

  public constructor(private readonly studios: Pick<Studios, 'stage' | 'film' | 'figureParts'>, private readonly run: (code: string, parts: ReadonlyArray<FigurePart> | undefined) => Promise<SceneRun>, private readonly host: DirectorHost) {}

  /** runs a scene's code into a film, with the figures built into the set, and stages it */
  public async take(code: string): Promise<void> {
    const asked = ++this.runs;
    const parts = await this.studios.figureParts();
    if(asked !== this.runs) return/*a newer scene runs*/;
    this.asked = { code, parts: JSON.stringify(parts ?? null) };
    const result = await this.run(code, parts);
    if(asked !== this.runs) return/*a newer scene runs*/;
    this.ranWith = parts;
    if(!result.ok) { this.host.error(result.error); return; }
    let first: Film;
    try { first = filmOf(result.scene); }
    catch(failure) { this.host.error({ message: (failure as Error).message, line: (failure as { sceneLine?: number; }).sceneLine }); return; }
    this.host.error(undefined);
    this.latest = { scene: result.scene, first };
    await this.stageLatest();
  }

  /** the figures built as parts of the set's copies the latest scene ran with (its
   *  audiences lifted those they name), none while no studio listed them */
  public get parts(): ReadonlyArray<FigurePart> | undefined { return this.ranWith; }

  /** stages the latest scene again as it is, its code not run again unless the figures
   *  built into the set changed since it ran */
  public async restage(): Promise<void> {
    const asked = this.asked;
    if(!asked) return this.stageLatest();
    const parts = await this.studios.figureParts();
    if((this.asked === asked) && (JSON.stringify(parts ?? null) !== asked.parts)) return this.take(asked.code);
    return this.stageLatest();
  }

  // == Internal ==================================================================
  /** stages the latest scene, made with what the stage answers of its cast, and shows
   *  its film unless a newer scene took its place meanwhile (the film as first made
   *  when the stage answers nothing that changes it, or no studio took it) */
  private async stageLatest(): Promise<void> {
    const take = this.latest;
    if(!take) return/*no scene has run yet: its run stages it*/;
    await this.studios.stage(take.scene, facts => Object.values(facts).some(each => (typeof each === 'function')/*surfaces*/ || ((each !== undefined) && ('size' in each) && (each.size > 0))/*a figure's bottoms measure the footing clicks already change*/) ? filmOf(take.scene, facts) : take.first);
    if(this.latest !== take) return/*a newer scene*/;
    this.host.show((this.studios.film?.scene === take.scene) ? this.studios.film : take.first);
  }
}
