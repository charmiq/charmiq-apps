import { stepCount, upToStep, EMPTY_MODEL, type Model } from './model';
import type { Viewer } from './viewer';

// plays a build's building steps: the studio shows the build as it stands after a
// step, and each next step's parts drop in. A view only, the document never
// changes: any change to the build ends the playback and shows the build whole.
// The controls show only for a build of more than one step
// ********************************************************************************
// == Constants ===================================================================
/** how long each step shows while playing */
const STEP_MS = 1100/*ms*/;

// == Types =======================================================================
export type StepControlElements = Readonly<{
  root: HTMLElement;
  first: HTMLButtonElement;
  previous: HTMLButtonElement;
  play: HTMLButtonElement;
  next: HTMLButtonElement;
  label: HTMLElement;
}>;

// == Class =======================================================================
export class StepControl {
  private model: Model = EMPTY_MODEL;
  /** the step shown; undefined shows the whole build */
  private at: number | undefined;
  private timer: number | undefined;

  public constructor(private readonly elements: StepControlElements, private readonly viewer: Viewer, private readonly motion: () => boolean/*drops animate*/) {
    elements.first.addEventListener('click', () => { this.pause(); this.go(1, true); });
    elements.previous.addEventListener('click', () => { this.pause(); this.go(Math.max(1, (this.at ?? stepCount(this.model)) - 1)); });
    elements.next.addEventListener('click', () => { this.pause(); this.advance(); });
    elements.play.addEventListener('click', () => (this.timer === undefined) ? this.play() : this.pause());
  }

  /** shows a build whole: the build changed, so any playback ends */
  public show(model: Model, animate: boolean): void {
    this.pause();
    this.model = model;
    this.at = undefined;
    this.viewer.setModel(model, animate);
    this.render();
  }

  // == Playback ==================================================================
  private play(): void {
    if((this.at === undefined) || (this.at >= stepCount(this.model))) this.go(1, true)/*from the start*/;
    this.timer = window.setInterval(() => this.advance(), STEP_MS);
    this.render();
  }

  private pause(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.render();
  }

  /** the next step; past the last, the whole build, and playing stops */
  private advance(): void {
    const next = (this.at ?? 0) + 1;
    if(next > stepCount(this.model)) { this.pause(); this.go(undefined); return; }
    this.go(next);
  }

  /** shows the build after a step (or whole); `fromEmpty` clears the baseplate first,
   *  so even the parts already shown drop in (a start from the beginning) */
  private go(step: number | undefined, fromEmpty = false): void {
    if(fromEmpty) this.viewer.setModel(upToStep(this.model, 0), false);
    this.at = step;
    this.viewer.setModel((step === undefined) ? this.model : upToStep(this.model, step), this.motion());
    this.render();
  }

  // == Render ====================================================================
  private render(): void {
    const count = stepCount(this.model);
    const { root, first, previous, play, next, label } = this.elements;
    root.hidden = (count < 2);
    const playing = (this.timer !== undefined);
    play.setAttribute('aria-pressed', String(playing));
    play.title = play.ariaLabel = playing ? 'Pause' : 'Play the steps';
    first.disabled = (this.at === 1);
    previous.disabled = (this.at === 1);
    next.disabled = (this.at === undefined);
    label.textContent = (this.at === undefined) ? `${count} steps` : `Step ${this.at} / ${count}`;
  }
}
