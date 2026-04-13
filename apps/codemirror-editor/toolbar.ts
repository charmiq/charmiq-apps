import { type ConfigStore, DEFAULT_MODE } from './config-store';
import type { EditorWrapper } from './editor-wrapper';
import { type TabManager, UNTITLED_TAB_NAME } from './tab-manager';

// owns all UI chrome: settings menu, mobile menu, toggle switches, mode selects,
// tab bar rendering, drag-and-drop, import/export, clipboard. Desktop and mobile
// menus are separate DOM trees driven by the same ConfigStore callbacks
// ********************************************************************************
// == Types =======================================================================
/** file extension → CodeMirror mode mapping for import */
const EXTENSION_TO_MODE: Readonly<Record<string, string>> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'markdown',
  '.html': 'htmlmixed',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript-jsx',
  '.json': 'application/json',
  '.css': 'css',
  '.scss': 'text/x-scss',
  '.sass': 'text/x-scss',
  '.xml': 'xml'
};

/** mode → export config */
const MODE_EXPORT: Readonly<Record<string, { ext: string; mime: string }>> = {
  'css': { ext: 'css', mime: 'text/css' },
  'htmlmixed': { ext: 'html', mime: 'text/html' },
  'javascript': { ext: 'js', mime: 'text/javascript' },
  'application/json': { ext: 'json', mime: 'application/json' },
  'jsx': { ext: 'jsx', mime: 'text/jsx' },
  'markdown': { ext: 'md', mime: 'text/markdown' },
  'text/x-scss': { ext: 'scss', mime: 'text/x-scss' },
  'text/typescript': { ext: 'ts', mime: 'text/typescript' },
  'text/typescript-jsx': { ext: 'tsx', mime: 'text/typescript-jsx' },
  'xml': { ext: 'xml', mime: 'application/xml' }
};

// == Class =======================================================================
/** manages all toolbar / chrome UI interactions */
export class Toolbar {
  private readonly tabManager: TabManager;
  private readonly configStore: ConfigStore;
  private readonly editorWrapper: EditorWrapper;

  // cached DOM references
  private settingsMenu!: HTMLElement;
  private mobileMenu!: HTMLElement;
  private tabBar!: HTMLElement;
  private modeSelect!: HTMLSelectElement;
  private mobileModeSelect!: HTMLSelectElement;
  private fileInput!: HTMLInputElement;
  private closeTabDialog!: HTMLElement;
  private closeTabMessage!: HTMLElement;
  private tabToCloseId: string | null = null;

  // == Lifecycle =================================================================
  public constructor(tabManager: TabManager, configStore: ConfigStore, editorWrapper: EditorWrapper) {
    this.tabManager = tabManager;
    this.configStore = configStore;
    this.editorWrapper = editorWrapper;
  }

  /** bind all DOM event listeners — called once from main.ts */
  public init(): void {
    this.cacheElements();
    this.bindSettingsMenu();
    this.bindMobileMenu();
    this.bindToggles();
    this.bindModeSelects();
    this.bindActionButtons();
    this.bindFileInput();
    this.bindCloseTabDialog();
    this.bindClickOutside();

    // re-render tabs whenever tab state changes
    this.tabManager.onTabsChange(() => this.renderTabs());
  }

  /** sync all toggle and mode-select UI to match the current config */
  public syncUI(): void {
    const config = this.configStore.getConfig();
    this.updateAllToggles(config);

    const mode = this.tabManager.getActiveTabMode();
    this.modeSelect.value = mode;
    this.mobileModeSelect.value = mode;
  }

  // -- Tabs ----------------------------------------------------------------------
  /** initial tab bar render (called from main.ts after discovery) */
  public renderTabs(): void {
    this.tabBar.innerHTML = '';

    const orderedIds = this.tabManager.getOrderedTabIds();
    const isSingleTab = orderedIds.length === 1;
    const activeTabId = this.tabManager.getActiveTabId();
    const tabs = this.tabManager.getTabs();

    for(const id of orderedIds) {
      const tab = tabs.get(id);
      if(!tab) continue;

      const tabElement = document.createElement('div');
            tabElement.className = `tab ${id === activeTabId ? 'active' : ''} ${isSingleTab ? 'single-tab' : ''}`;
            tabElement.dataset.id = id;

      if(!isSingleTab) tabElement.draggable = true;

      // name
      const nameElement = document.createElement('span');
            nameElement.className = 'tab-name';
            nameElement.textContent = tab.name || UNTITLED_TAB_NAME;
            nameElement.title = tab.name || UNTITLED_TAB_NAME;

      // rename on double-click
      tabElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startRenaming(id, nameElement);
      });

      // switch on click (multi-tab only)
      if(!isSingleTab) {
        tabElement.addEventListener('click', () => {
          if(id !== activeTabId) this.tabManager.switchTab(id);
        });
      } /* else -- single tab (not clickable) */

      // drag-and-drop (multi-tab only)
      if(!isSingleTab) this.bindTabDrag(tabElement, id);

      tabElement.appendChild(nameElement);

      // close button (multi-tab only)
      if(!isSingleTab) {
        const closeBtn = document.createElement('div');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.requestCloseTab(id);
        });
        tabElement.appendChild(closeBtn);
      } /* else -- single tab (no close button) */

      this.tabBar.appendChild(tabElement);
    }
  }

  // == Private: Element Caching ==================================================
  private cacheElements(): void {
    this.settingsMenu = document.getElementById('settingsMenu')!;
    this.mobileMenu = document.getElementById('mobileMenu')!;
    this.tabBar = document.getElementById('tabBar')!;
    this.modeSelect = document.getElementById('modeSelect')! as HTMLSelectElement;
    this.mobileModeSelect = document.getElementById('mobileModeSelect')! as HTMLSelectElement;
    this.fileInput = document.getElementById('fileInput')! as HTMLInputElement;
    this.closeTabDialog = document.getElementById('closeTabDialog')!;
    this.closeTabMessage = document.getElementById('closeTabMessage')!;
  }

  // == Private: Settings Menu ====================================================
  private bindSettingsMenu(): void {
    const settingsBtn = document.getElementById('settingsBtn')!;
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.settingsMenu.classList.toggle('show');
    });
  }

  private hideSettingsMenu(): void {
    this.settingsMenu.classList.remove('show');
  }

  // == Private: Mobile Menu ======================================================
  private bindMobileMenu(): void {
    const hamburgerBtn = document.getElementById('hamburgerBtn')!;
    const mobileMenuClose = document.getElementById('mobileMenuClose')!;

    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMobileMenu();
    });

    mobileMenuClose.addEventListener('click', () => this.hideMobileMenu());

    this.mobileMenu.addEventListener('click', (e) => {
      if(e.target === this.mobileMenu) this.hideMobileMenu();
    });

    // mobile action buttons
    document.getElementById('mobileCopyContent')!.addEventListener('click', () => {
      this.copyToClipboard(this.editorWrapper.getValue());
      this.hideMobileMenu();
    });
    document.getElementById('mobileExport')!.addEventListener('click', () => {
      this.exportFile();
      this.hideMobileMenu();
    });
    document.getElementById('mobileImport')!.addEventListener('click', () => {
      this.fileInput.click();
      this.hideMobileMenu();
    });
  }

  private toggleMobileMenu(): void {
    this.mobileMenu.classList.toggle('show');
    if(this.mobileMenu.classList.contains('show')) this.syncUI()/*sync state before showing*/;
  }

  private hideMobileMenu(): void {
    this.mobileMenu.classList.remove('show');
  }

  // == Private: Toggle Switches ==================================================
  private bindToggles(): void {
    // desktop toggles use data-option attributes
    const desktopToggles = this.settingsMenu.querySelectorAll<HTMLElement>('[data-option]');
    for(const el of desktopToggles) {
      el.addEventListener('click', () => this.handleToggleClick(el));
    }

    // mobile toggles also use data-option attributes
    const mobileToggles = this.mobileMenu.querySelectorAll<HTMLElement>('[data-option]');
    for(const el of mobileToggles) {
      el.addEventListener('click', () => this.handleToggleClick(el));
    }
  }

  /** handle a toggle click from either desktop or mobile — updates config and syncs
   *  all toggles */
  private handleToggleClick(el: HTMLElement): void {
    const option = el.dataset.option as 'lineNumbers' | 'lineWrapping' | 'smartIndent' | 'indentWithTabs';
    if(!option) return;

    const toggle = el.querySelector('.toggle-switch')!;
    const newValue = !toggle.classList.contains('active');

    // update editor and persist
    this.editorWrapper.setOption(option, newValue);
    this.configStore.updateEditorConfig(option, newValue);

    // sync all toggles (desktop + mobile) to the new state
    this.updateAllToggles({ ...this.configStore.getConfig(), [option]: newValue });
  }

  /** update every toggle switch in both desktop and mobile menus */
  private updateAllToggles(config: Readonly<Record<string, boolean>>): void {
    const allToggles = document.querySelectorAll<HTMLElement>('[data-option]');
    for(const el of allToggles) {
      const option = el.dataset.option!;
      const toggle = el.querySelector('.toggle-switch');
      if(!toggle) continue;

      if(config[option]) toggle.classList.add('active');
      else toggle.classList.remove('active');
    }
  }

  // == Private: Mode Selects =====================================================
  private bindModeSelects(): void {
    this.modeSelect.addEventListener('change', () => {
      this.changeMode(this.modeSelect.value);
    });
    this.mobileModeSelect.addEventListener('change', () => {
      this.changeMode(this.mobileModeSelect.value);
    });
  }

  /** change the mode for the active tab, persist, and sync both selects */
  private changeMode(newMode: string): void {
    this.editorWrapper.setMode(newMode);

    const activeTabId = this.tabManager.getActiveTabId();
    if(activeTabId) this.configStore.updateTabMode(activeTabId, newMode);

    // sync both selects
    this.modeSelect.value = newMode;
    this.mobileModeSelect.value = newMode;
  }

  // == Private: Action Buttons ===================================================
  private bindActionButtons(): void {
    document.getElementById('copyContentBtn')!.addEventListener('click', () => {
      this.copyToClipboard(this.editorWrapper.getValue());
    });
    document.getElementById('exportIconBtn')!.addEventListener('click', () => {
      this.exportFile();
    });
    document.getElementById('importIconBtn')!.addEventListener('click', () => {
      this.fileInput.click();
    });
    document.getElementById('addTabBtn')!.addEventListener('click', () => {
      this.tabManager.create();
    });
  }

  // == Private: File Input =======================================================
  private bindFileInput(): void {
    this.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
  }

  private async handleFileImport(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if(!file) return;

    if(!this.tabManager.getActiveTabId()) {
      alert('Please create a tab first.');
      input.value = '';
      return;
    } /* else -- has active tab */

    const validExtensions = Object.keys(EXTENSION_TO_MODE);
    const fileExt = validExtensions.find(ext => file.name.toLowerCase().endsWith(ext));
    if(!fileExt) {
      alert(`Please select a valid file (${validExtensions.join(', ')})`);
      input.value = '';
      return;
    } /* else -- valid extension */

    const detectedMode = EXTENSION_TO_MODE[fileExt] || DEFAULT_MODE;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = (e.target as FileReader).result as string;
        await this.tabManager.create(file.name, content, detectedMode);
      } catch(error) {
        console.error('import error:', error);
        alert(`Failed to import file: ${(error as Error).message}`);
      }
      input.value = '';
    };

    reader.onerror = () => {
      alert('Failed to read the selected file.');
      input.value = '';
    };

    reader.readAsText(file);
  }

  // == Private: Close Tab Dialog =================================================
  private bindCloseTabDialog(): void {
    this.closeTabDialog.addEventListener('ays-confirmed', async () => {
      if(this.tabToCloseId) await this.tabManager.delete(this.tabToCloseId);
    });
  }

  private requestCloseTab(tabId: string): void {
    const tabs = this.tabManager.getTabs();
    if(tabs.size <= 1) return;

    this.tabToCloseId = tabId;
    const tab = tabs.get(tabId);
    this.closeTabMessage.textContent = `Are you sure you want to delete "${tab?.name || UNTITLED_TAB_NAME}"? This will permanently delete the content.`;
    (this.closeTabDialog as any).show();
  }

  // == Private: Tab Rename =======================================================
  private startRenaming(tabId: string, nameEl: HTMLElement): void {
    const tabs = this.tabManager.getTabs();
    const currentName = tabs.get(tabId)?.name || UNTITLED_TAB_NAME;

    const input = document.createElement('input');
          input.type = 'text';
          input.className = 'tab-name-input';
          input.value = currentName;

    const save = async () => {
      const newName = input.value.trim();
      if(newName && (newName !== currentName)) await this.tabManager.rename(tabId, newName);
      this.renderTabs();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') input.blur();
    });

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  // == Private: Tab Drag & Drop ==================================================
  private bindTabDrag(tabElement: HTMLElement, tabId: string): void {
    tabElement.addEventListener('dragstart', (e) => {
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', tabId);
      tabElement.classList.add('dragging');
    });

    tabElement.addEventListener('dragend', () => {
      tabElement.classList.remove('dragging');
    });

    tabElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';

      const dragging = this.tabBar.querySelector('.dragging');
      if(dragging && (dragging !== tabElement)) {
        const rect = tabElement.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;

        if(e.clientX < midpoint) tabElement.parentNode!.insertBefore(dragging, tabElement);
        else tabElement.parentNode!.insertBefore(dragging, tabElement.nextSibling);
      } /* else -- no dragging element or dragging self */
    });

    tabElement.addEventListener('drop', (e) => {
      e.preventDefault();
      const newOrder = Array.from(this.tabBar.querySelectorAll<HTMLElement>('.tab')).map(el => el.dataset.id!);
      this.tabManager.reorder(newOrder);
    });
  }

  // == Private: Click Outside ====================================================
  private bindClickOutside(): void {
    const settingsBtn = document.getElementById('settingsBtn')!;

    document.addEventListener('click', (e) => {
      if(!settingsBtn.contains(e.target as Node) && !this.settingsMenu.contains(e.target as Node)) {
        this.hideSettingsMenu();
      } /* else -- click was inside settings button or menu */
    });

    // close settings menu when focus leaves the iframe
    window.addEventListener('blur', () => this.hideSettingsMenu());
  }

  // == Private: Clipboard ========================================================
  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch(error) {
      console.error('failed to copy:', error);
    }
  }

  // == Private: Export ===========================================================
  private exportFile(): void {
    const content = this.editorWrapper.getValue();
    const tabs = this.tabManager.getTabs();
    const activeTabId = this.tabManager.getActiveTabId();
    const tabName = (tabs.get(activeTabId!)?.name || 'file').replace(/\s+/g, '-');
    const mode = this.tabManager.getActiveTabMode();
    const config = MODE_EXPORT[mode] || { ext: 'txt', mime: 'text/plain' };

    const blob = new Blob([content], { type: config.mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tabName}.${config.ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }
}
