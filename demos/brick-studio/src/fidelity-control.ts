import { fidelityLabel, loadFidelity, saveFidelity, toFidelity, MAX_FIDELITY, UNTRACED_STATE, type Fidelity } from './render/fidelity';
import type { Viewer } from './viewer';

// the look slider: one stop per notch, from the draft look to path traced. The
// choice is this browser's own and is restored on the next visit
// ********************************************************************************
/** how often the label checks whether the path tracer has settled */
const REFINING_POLL_MS = 250/*ms*/;

// == Control =====================================================================
export class FidelityControl {
  private poll: ReturnType<typeof setInterval> | undefined;
  private chosen: Fidelity | undefined;

  public constructor(private readonly input: HTMLInputElement, private readonly label: HTMLElement, private readonly state: HTMLElement, private readonly viewer: Viewer) {}

  /** restores this browser's stop and follows the slider */
  public async init(): Promise<void> {
    this.input.min = '0';
    this.input.max = String(MAX_FIDELITY);
    this.input.step = '1';
    this.input.addEventListener('input', () => { const stop = toFidelity(this.input.value); if(stop !== undefined) void this.select(stop); });
    await this.select(loadFidelity());
  }

  /** sets the stop as the slider would; resolves to the stop reached */
  public async set(stop: Fidelity): Promise<Fidelity> {
    await this.select(stop);
    return toFidelity(this.input.value) ?? stop;
  }

  // ------------------------------------------------------------------------------
  private async select(stop: Fidelity): Promise<void> {
    this.chosen = stop;
    this.input.value = String(stop);
    clearInterval(this.poll);
    this.label.textContent = fidelityLabel(stop);
    this.state.textContent = (stop === MAX_FIDELITY) ? 'loading' : ''/*the path tracer downloads and compiles first*/;
    const reached = await this.viewer.setFidelity(stop);
    if(this.chosen !== stop) return/*a later choice owns the slider*/;
    this.input.value = String(reached)/*lower when the path tracer cannot run here*/;
    saveFidelity(reached);
    this.follow(reached);
  }

  /** shows the stop's name, and that the path tracer is refining until it settles, or
   *  draws as Photo while the parts shown are past what it draws */
  private follow(stop: Fidelity): void {
    clearInterval(this.poll);
    this.label.textContent = fidelityLabel(stop);
    const show = () => { this.state.textContent = this.viewer.refining ? 'refining' : (this.viewer.untracedParts !== undefined) ? UNTRACED_STATE : ''; };
    show();
    if(stop === MAX_FIDELITY) this.poll = setInterval(show, REFINING_POLL_MS);
  }
}
