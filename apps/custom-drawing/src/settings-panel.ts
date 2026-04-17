import { ConfigStore, DEFAULT_CONFIG, type DrawingConfig } from './config-store';

// settings UI — gear button opens a modal with controls for every config field
// ********************************************************************************
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

    // click outside modal closes (same behavior as image modal)
    this.modal.addEventListener('click', (e) => {
      if(e.target === this.modal) this.close();
    });
  }

  // ------------------------------------------------------------------------------
  /** set button visibility (always visible by default; caller may hide in
   *  display-only contexts — but we keep it visible so end-users can still
   *  access settings) */
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
  }

  private async save(): Promise<void> {
    const next: DrawingConfig = {
      showGrid:            this.showGridInput.checked,
      gridColor:           this.gridColorInput.value,
      backgroundColor:     this.backgroundColorInput.value,
      readOnly:            this.readOnlyInput.checked,
      showToolbar:         this.showToolbarInput.checked,
      showPropertiesPanel: this.showPropertiesPanelInput.checked,
      showInfoBar:         this.showInfoBarInput.checked,
    };
    await this.configStore.replace(next);
    this.close();
  }
}
