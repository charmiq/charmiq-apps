import { ConfigStore, DEFAULT_CONFIG, DEFAULT_PRESETS, type DrawingConfig, type DrawingPresets } from './config-store';
import { openColorPicker, openFontPicker, openSliderPicker } from './custom-picker';

// settings UI -- gear button opens a modal with controls for every config field.
// Alongside the simple boolean / color toggles, the modal hosts an editable
// Preset Palettes section: each preset list (stroke color, background color,
// text color, stroke width, font size, font family) is rendered as a chip row
// with remove / add controls that reuse the shared custom-picker popovers from
// the properties panel. Edits stay local to a working copy (`workingPresets`)
// until Save, at which point the full config is replaced in the store
// ********************************************************************************
// == Types =======================================================================
type PresetListKey = keyof DrawingPresets;

// == Class =======================================================================
export class SettingsPanel {
  private readonly configStore: ConfigStore;

  private readonly modal: HTMLElement;
  private readonly btn: HTMLElement;
  private readonly cancelBtn: HTMLElement;
  private readonly saveBtn: HTMLElement;
  private readonly resetBtn: HTMLElement;

  // form inputs
  private readonly showGridInput: HTMLInputElement;
  private readonly gridColorInput: HTMLInputElement;
  private readonly backgroundColorInput: HTMLInputElement;
  private readonly readOnlyInput: HTMLInputElement;
  private readonly showToolbarInput: HTMLInputElement;
  private readonly showPropertiesPanelInput: HTMLInputElement;
  private readonly showInfoBarInput: HTMLInputElement;

  // working copy of presets -- edited via the chip UI and flushed on Save
  private workingPresets: DrawingPresets = { ...DEFAULT_PRESETS };

  public constructor(configStore: ConfigStore) {
    this.configStore = configStore;

    this.modal     = document.getElementById('settingsModal')!;
    this.btn       = document.getElementById('settingsBtn')!;
    this.cancelBtn = document.getElementById('settingsCancel')!;
    this.saveBtn   = document.getElementById('settingsSave')!;
    this.resetBtn  = document.getElementById('settingsReset')!;

    this.showGridInput            = document.getElementById('cfgShowGrid')            as HTMLInputElement;
    this.gridColorInput           = document.getElementById('cfgGridColor')           as HTMLInputElement;
    this.backgroundColorInput     = document.getElementById('cfgBackgroundColor')     as HTMLInputElement;
    this.readOnlyInput            = document.getElementById('cfgReadOnly')            as HTMLInputElement;
    this.showToolbarInput         = document.getElementById('cfgShowToolbar')         as HTMLInputElement;
    this.showPropertiesPanelInput = document.getElementById('cfgShowPropertiesPanel') as HTMLInputElement;
    this.showInfoBarInput         = document.getElementById('cfgShowInfoBar')         as HTMLInputElement;
  }

  // ------------------------------------------------------------------------------
  public init(): void {
    this.btn.addEventListener('click', () => this.open());
    this.cancelBtn.addEventListener('click', () => this.close());
    this.saveBtn.addEventListener('click', () => this.save());
    this.resetBtn.addEventListener('click', () => this.populate(DEFAULT_CONFIG));

    // per-list "Reset" links inside the Preset Palettes section
    this.modal.querySelectorAll<HTMLElement>('.preset-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const list = btn.dataset.list as PresetListKey | undefined;
        if(!list) return;/*malformed*/
        this.workingPresets = { ...this.workingPresets, [list]: (DEFAULT_PRESETS as any)[list] };
        this.renderPresetSection(list);
      });
    });

    // click outside modal closes (same behavior as image modal)
    this.modal.addEventListener('click', (e) => {
      if(e.target === this.modal) this.close();
    });
  }

  // ------------------------------------------------------------------------------
  /** set button visibility (always visible by default; caller may hide in
   *  display-only contexts -- but the button stays accessible so end-users can
   *  still reach settings) */
  public setVisible(visible: boolean): void {
    this.btn.style.display = visible ? '' : 'none';
  }

  // == Private ===================================================================
  private open(): void {
    this.populate(this.configStore.getConfig());
    this.modal.classList.add('visible');
  }

  private close(): void {
    this.modal.classList.remove('visible');
  }

  private populate(cfg: Readonly<DrawingConfig>): void {
    this.showGridInput.checked            = cfg.showGrid;
    this.gridColorInput.value             = cfg.gridColor;
    this.backgroundColorInput.value       = cfg.backgroundColor;
    this.readOnlyInput.checked            = cfg.readOnly;
    this.showToolbarInput.checked         = cfg.showToolbar;
    this.showPropertiesPanelInput.checked = cfg.showPropertiesPanel;
    this.showInfoBarInput.checked         = cfg.showInfoBar;

    // deep-clone presets so edits stay in the working copy until Save
    this.workingPresets = {
      strokeColors:     [...cfg.presets.strokeColors],
      backgroundColors: [...cfg.presets.backgroundColors],
      textColors:       [...cfg.presets.textColors],
      strokeWidths:     [...cfg.presets.strokeWidths],
      fontSizes:        [...cfg.presets.fontSizes],
      fontFamilies:     cfg.presets.fontFamilies.map(f => ({ ...f })),
    };
    this.renderAllPresetSections();
  }

  private async save(): Promise<void> {
    const current = this.configStore.getConfig();
    const next: DrawingConfig = {
      ...current,
      showGrid:            this.showGridInput.checked,
      gridColor:           this.gridColorInput.value,
      backgroundColor:     this.backgroundColorInput.value,
      readOnly:            this.readOnlyInput.checked,
      showToolbar:         this.showToolbarInput.checked,
      showPropertiesPanel: this.showPropertiesPanelInput.checked,
      showInfoBar:         this.showInfoBarInput.checked,
      presets:             this.workingPresets,
    };
    await this.configStore.replace(next);
    this.close();
  }

  // == Preset Editor =============================================================
  private renderAllPresetSections(): void {
    this.renderPresetSection('strokeColors');
    this.renderPresetSection('backgroundColors');
    this.renderPresetSection('textColors');
    this.renderPresetSection('strokeWidths');
    this.renderPresetSection('fontSizes');
    this.renderPresetSection('fontFamilies');
  }

  // ------------------------------------------------------------------------------
  private renderPresetSection(list: PresetListKey): void {
    const containerId = {
      strokeColors:     'presetStrokeColors',
      backgroundColors: 'presetBackgroundColors',
      textColors:       'presetTextColors',
      strokeWidths:     'presetStrokeWidths',
      fontSizes:        'presetFontSizes',
      fontFamilies:     'presetFontFamilies',
    }[list];
    const container = document.getElementById(containerId);
    if(!container) return;/*section not in DOM*/
    container.innerHTML = '';

    const values = this.workingPresets[list] as ReadonlyArray<unknown>;
    for(let i=0; i<values.length; i++) {
      const chip = this.buildPresetChip(list, values[i], i);
      container.appendChild(chip);
    }

    // trailing "+" button opens the matching picker for this list
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'preset-add';
    add.title = 'Add preset';
    add.textContent = '+';
    add.addEventListener('click', (e) => {
      e.preventDefault();
      const rect = add.getBoundingClientRect();
      this.openPickerForAdd(list, rect);
    });
    container.appendChild(add);
  }

  // ------------------------------------------------------------------------------
  /** build a single chip for a preset row. Click on the body opens the picker to
   *  edit it; click on the "x" removes it from the working copy */
  private buildPresetChip(list: PresetListKey, value: unknown, idx: number): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'preset-chip';

    // inner preview depends on the list shape
    if((list === 'strokeColors') || (list === 'backgroundColors') || (list === 'textColors')) {
      const sw = document.createElement('div');
      sw.className = 'color-swatch';
      sw.style.background = value as string;
      if((value === 'transparent') || (value as string).includes('rgba')) sw.style.border = '1px solid #ccc';
      chip.appendChild(sw);
      const label = document.createElement('span');
      label.className = 'preset-chip-label';
      label.textContent = value as string;
      chip.title = value as string;/*full value reachable via hover -- the label itself ellipses*/
      chip.appendChild(label);
    } else if(list === 'strokeWidths') {
      const sample = document.createElement('div');
      sample.className = 'stroke-width-sample';
      sample.style.height = `${Math.max(1, Math.min(8, value as number))}px`;
      chip.appendChild(sample);
      const label = document.createElement('span');
      label.className = 'preset-chip-label';
      label.textContent = `${value}px`;
      chip.appendChild(label);
    } else if(list === 'fontSizes') {
      const sample = document.createElement('span');
      sample.className = 'text-size-sample';
      sample.style.fontSize = `${Math.min(28, value as number)}px`;
      sample.textContent = 'A';
      chip.appendChild(sample);
      const label = document.createElement('span');
      label.className = 'preset-chip-label';
      label.textContent = `${value}pt`;
      chip.appendChild(label);
    } else if(list === 'fontFamilies') {
      const f = value as { label: string; family: string; googleFont?: string };
      const sample = document.createElement('span');
      sample.style.fontFamily = f.family;
      sample.style.fontSize = '15px';
      sample.textContent = f.label;
      chip.appendChild(sample);
    } /* else -- unknown list */

    // remove button
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'preset-chip-x';
    x.title = 'Remove';
    x.textContent = '\u00D7';/*multiplication sign*/
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeAt(list, idx);
    });
    chip.appendChild(x);

    return chip;
  }

  // ------------------------------------------------------------------------------
  private removeAt(list: PresetListKey, idx: number): void {
    const arr = (this.workingPresets[list] as ReadonlyArray<unknown>).slice();
    arr.splice(idx, 1);
    this.workingPresets = { ...this.workingPresets, [list]: arr as any };
    this.renderPresetSection(list);
  }

  // ------------------------------------------------------------------------------
  /** open the right custom-picker to append a new entry to the specified list */
  private openPickerForAdd(list: PresetListKey, rect: DOMRect): void {
    if((list === 'strokeColors') || (list === 'textColors')) {
      openColorPicker({
        rect,
        initial: '#000000',
        alpha: false,
        onChange: () => { /*no live-preview surface in the settings modal*/ },
        onCommit: (c) => this.appendTo(list, c),
        onCancel: () => { /*nothing to revert*/ },
      });
    } else if(list === 'backgroundColors') {
      openColorPicker({
        rect,
        initial: 'rgba(255,255,255,0.5)',
        alpha: true,
        onChange: () => { /*no-op*/ },
        onCommit: (c) => this.appendTo(list, c),
        onCancel: () => { /*nothing to revert*/ },
      });
    } else if(list === 'strokeWidths') {
      openSliderPicker({
        rect,
        initial: 2, min: 1, max: 24, step: 1, unit: 'px',
        onChange: () => { /*no-op*/ },
        onCommit: (v) => this.appendTo(list, v),
        onCancel: () => { /*nothing to revert*/ },
      });
    } else if(list === 'fontSizes') {
      openSliderPicker({
        rect,
        initial: 16, min: 6, max: 144, step: 1, unit: 'pt',
        onChange: () => { /*no-op*/ },
        onCommit: (v) => this.appendTo(list, v),
        onCancel: () => { /*nothing to revert*/ },
      });
    } else if(list === 'fontFamilies') {
      openFontPicker({
        rect,
        initial: null,
        onChange: () => { /*no-op*/ },
        onCommit: (c) => this.appendTo(list, c),
        onCancel: () => { /*nothing to revert*/ },
      });
    } /* else -- unknown list */
  }

  // ------------------------------------------------------------------------------
  private appendTo(list: PresetListKey, value: unknown): void {
    const prior = this.workingPresets[list] as ReadonlyArray<unknown>;
    const matches = (a: unknown, b: unknown): boolean => {
      if((typeof a === 'object') && (typeof b === 'object') && a && b) return (a as any).family === (b as any).family;
      return a === b;
    };
    if(prior.some(v => matches(v, value))) return;/*already present*/
    const next = [...prior, value] as any;
    this.workingPresets = { ...this.workingPresets, [list]: next };
    this.renderPresetSection(list);
  }
}
