import type { SamplerMeta } from './channel-binder';
import type { PlaybackTelemetry } from './playback';

// owns the imperative DOM for the transport + telemetry + action controls. Pure
// view -- every interaction is reported via onXxx callbacks set by main.ts. The
// Samplers popover is also drawn here so everything visible in index.html has a
// single owner. The popover sources its data (bound item + meta per slot) from
// callbacks injected by main.ts so the toolbar has no direct dependency on the
// ChannelBinder beyond the SamplerMeta type
// ********************************************************************************
// == Types =======================================================================
/** per-channel row data the Samplers popover displays. `bound` toggles the unbound
 *  visual state -- filter/wrap selects are disabled when unbound */
export interface SamplerRow {
  readonly index:  number/*0..3, maps to CHANNEL_SLOT_IDS[index]*/;
  readonly label:  string;
  readonly bound:  boolean;
  readonly meta:   Readonly<SamplerMeta>;
}

// --------------------------------------------------------------------------------
export type SamplerChangeCallback = (index: number, meta: Readonly<SamplerMeta>) => void;

// == Constants ===================================================================
const FILTER_OPTIONS: ReadonlyArray<SamplerMeta['filter']> = ['linear', 'nearest'];
const WRAP_OPTIONS:   ReadonlyArray<SamplerMeta['wrap']>   = ['clamp', 'repeat', 'mirror'];

// == Class =======================================================================
export class Toolbar {
  private readonly playPauseBtn:   HTMLButtonElement;
  private readonly iconPlay:       SVGElement;
  private readonly iconPause:      SVGElement;
  private readonly resetBtn:       HTMLButtonElement;
  private readonly compileBtn:     HTMLButtonElement;
  private readonly samplersBtn:    HTMLButtonElement;
  private readonly fullscreenBtn:  HTMLButtonElement;
  private readonly autoCheckbox:   HTMLInputElement;
  private readonly timeEl:         HTMLElement;
  private readonly fpsEl:          HTMLElement;
  private readonly resolutionEl:   HTMLElement;
  private readonly samplersPopover: HTMLElement;
  private readonly samplersList:   HTMLElement;

  // callbacks (set by main.ts; no-ops until wired)
  private onPlayPause:    () => void = () => {};
  private onReset:        () => void = () => {};
  private onCompile:      () => void = () => {};
  private onFullscreen:   () => void = () => {};
  private onAutoCompile:  (enabled: boolean) => void = () => {};
  private onSamplerChange: SamplerChangeCallback = () => {};
  private samplersDataSource: (() => ReadonlyArray<SamplerRow>) | null = null;

  // == Lifecycle =================================================================
  public constructor() {
    this.playPauseBtn   = must<HTMLButtonElement>('playPauseBtn');
    this.iconPlay       = this.playPauseBtn.querySelector('.icon-play')  as unknown as SVGElement;
    this.iconPause      = this.playPauseBtn.querySelector('.icon-pause') as unknown as SVGElement;
    this.resetBtn       = must<HTMLButtonElement>('resetBtn');
    this.compileBtn     = must<HTMLButtonElement>('compileBtn');
    this.samplersBtn    = must<HTMLButtonElement>('samplersBtn');
    this.fullscreenBtn  = must<HTMLButtonElement>('fullscreenBtn');
    this.autoCheckbox   = must<HTMLInputElement>('autoCompileCheckbox');
    this.timeEl         = must<HTMLElement>('timeDisplay');
    this.fpsEl          = must<HTMLElement>('fpsDisplay');
    this.resolutionEl   = must<HTMLElement>('resolutionDisplay');
    this.samplersPopover = must<HTMLElement>('samplersPopover');
    this.samplersList   = must<HTMLElement>('samplersList');

    this.wireEvents();
  }

  // == Public =====================================================================
  public setOnPlayPause(cb: () => void):                      void { this.onPlayPause   = cb; }
  public setOnReset(cb: () => void):                          void { this.onReset       = cb; }
  public setOnCompile(cb: () => void):                        void { this.onCompile     = cb; }
  public setOnFullscreen(cb: () => void):                     void { this.onFullscreen  = cb; }
  public setOnAutoCompile(cb: (enabled: boolean) => void):    void { this.onAutoCompile = cb; }
  public setOnSamplerChange(cb: SamplerChangeCallback):       void { this.onSamplerChange = cb; }
  public setSamplersDataSource(src: () => ReadonlyArray<SamplerRow>): void { this.samplersDataSource = src; }

  // ------------------------------------------------------------------------------
  /** render the transport + telemetry row. Called on every telemetry tick */
  public applyTelemetry(t: Readonly<PlaybackTelemetry>): void {
    setHidden(this.iconPlay,  t.isPlaying);
    setHidden(this.iconPause, !t.isPlaying);
    this.playPauseBtn.title = t.isPlaying ? 'Pause' : 'Play';

    this.timeEl.textContent       = formatTime(t.time);
    this.fpsEl.textContent        = formatFps(t.frameRate);
    this.resolutionEl.textContent = (t.cssWidth > 0) ? `${Math.round(t.cssWidth)}\u00D7${Math.round(t.cssHeight)}` : '— \u00D7 —';
  }

  // ------------------------------------------------------------------------------
  /** reflect the current autoCompile setting in the checkbox */
  public setAutoCompile(enabled: boolean): void {
    this.autoCheckbox.checked = enabled;
  }

  // ------------------------------------------------------------------------------
  /** disable the Compile button while a compile is in flight (so double-click
   *  doesn't queue two round-trips) */
  public setCompiling(busy: boolean): void {
    this.compileBtn.disabled = busy;
    this.compileBtn.textContent = busy ? 'Compiling…' : 'Compile';
  }

  // ------------------------------------------------------------------------------
  /** re-render the samplers popover if it's open. Called when bindings or meta change
   *  so the popover stays live instead of staying stale */
  public refreshSamplers(): void {
    if(this.samplersPopover.hidden) return/*closed -- redraw deferred to next open*/;
    this.drawSamplers();
  }

  // == Internal ===================================================================
  private wireEvents(): void {
    this.playPauseBtn.addEventListener('click',  () => this.onPlayPause());
    this.resetBtn.addEventListener('click',      () => this.onReset());
    this.compileBtn.addEventListener('click',    () => this.onCompile());
    this.fullscreenBtn.addEventListener('click', () => this.onFullscreen());

    this.autoCheckbox.addEventListener('change', () => this.onAutoCompile(this.autoCheckbox.checked));

    this.samplersBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleSamplers();
    });

    // dismiss the popover on outside click
    document.addEventListener('click', (event) => {
      if(this.samplersPopover.hidden) return;/*already closed*/
      const target = event.target as Node | null;
      if(!target) return;
      if(this.samplersPopover.contains(target) || this.samplersBtn.contains(target)) return;
      this.samplersPopover.hidden = true;
    });

    // Escape closes the popover too
    document.addEventListener('keydown', (event) => {
      if((event.key === 'Escape') && !this.samplersPopover.hidden) {
        this.samplersPopover.hidden = true;
      } /* else -- not a dismiss keystroke */
    });
  }

  // ................................................................................
  private toggleSamplers(): void {
    if(this.samplersPopover.hidden) {
      this.drawSamplers();
      this.samplersPopover.hidden = false;
    } else {
      this.samplersPopover.hidden = true;
    }
  }

  // ................................................................................
  /** rebuild the rows inside the samplers popover from the data source */
  private drawSamplers(): void {
    const rows = this.samplersDataSource ? this.samplersDataSource() : [];
    this.samplersList.innerHTML = '';

    if(rows.length < 1) {
      const empty = document.createElement('div');
      empty.className = 'sampler-row';
      empty.textContent = 'No channels configured.';
      this.samplersList.appendChild(empty);
      return;
    } /* else -- render a row per channel */

    for(let i=0; i<rows.length; i++) {
      this.samplersList.appendChild(this.buildSamplerRow(rows[i]));
    }
  }

  // ................................................................................
  private buildSamplerRow(row: Readonly<SamplerRow>): HTMLElement {
    const container = document.createElement('div');
    container.className = `sampler-row${row.bound ? '' : ' unbound'}`;

    const label = document.createElement('span');
    label.className = 'sampler-label';
    label.textContent = row.label;
    container.appendChild(label);

    const filterSel = this.buildSelect(FILTER_OPTIONS, row.meta.filter, !row.bound, (value) => {
      this.onSamplerChange(row.index, { filter: value as SamplerMeta['filter'], wrap: row.meta.wrap });
    });
    container.appendChild(filterSel);

    const wrapSel = this.buildSelect(WRAP_OPTIONS, row.meta.wrap, !row.bound, (value) => {
      this.onSamplerChange(row.index, { filter: row.meta.filter, wrap: value as SamplerMeta['wrap'] });
    });
    container.appendChild(wrapSel);

    return container;
  }

  // ................................................................................
  private buildSelect(
    options:  ReadonlyArray<string>,
    selected: string,
    disabled: boolean,
    onChange: (value: string) => void
  ): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.disabled = disabled;
    for(let i=0; i<options.length; i++) {
      const opt = document.createElement('option');
      opt.value = options[i];
      opt.textContent = options[i];
      if(options[i] === selected) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
}

// == Helpers =====================================================================
/** toggle the `hidden` attribute on any element (SVG or HTML). The TS typings only
 *  expose the `hidden` property on HTMLElement, but the attribute itself applies
 *  to SVG nodes too and the platform's CSS keys off it */
const setHidden = (el: Element, hidden: boolean): void => {
  if(hidden) el.setAttribute('hidden', '');
  else       el.removeAttribute('hidden');
};

// --------------------------------------------------------------------------------
/** DOM getById with a runtime guarantee -- throws if the element is missing rather
 *  than letting a silent null slip through */
const must = <T extends Element>(id: string): T => {
  const el = document.getElementById(id);
  if(!el) throw new Error(`shader-demo: required element #${id} is missing from index.html`);
  return el as unknown as T;
};

// --------------------------------------------------------------------------------
/** format seconds as m:ss.hh */
const formatTime = (seconds: number): string => {
  const m  = Math.floor(seconds / 60);
  const s  = Math.floor(seconds) % 60;
  const hs = Math.floor((seconds - Math.floor(seconds)) * 100);
  return `${m}:${pad2(s)}.${pad2(hs)}`;
};

// --------------------------------------------------------------------------------
const formatFps = (frameRate: number): string => {
  if(frameRate < 0.5) return '— fps';
  return `${frameRate.toFixed(1)} fps`;
};

// --------------------------------------------------------------------------------
const pad2 = (value: number): string => (value < 10) ? `0${value}` : `${value}`;
