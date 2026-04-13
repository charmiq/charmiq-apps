import { type ConfigStore, DEFAULT_MODE } from './config-store';
import type { EditorWrapper } from './editor-wrapper';
import type { TabManager } from './tab-manager';

// registers LLM-facing commands via window.charmiq.advertise so that agents can
// read/write content, manage tabs, etc.
// ********************************************************************************
/** exposes the command surface for LLM / agent interaction */
export class CommandSurface {
  private readonly tabManager: TabManager;
  private readonly editorWrapper: EditorWrapper;
  private readonly configStore: ConfigStore;

  public constructor(tabManager: TabManager, editorWrapper: EditorWrapper, configStore: ConfigStore) {
    this.tabManager = tabManager;
    this.editorWrapper = editorWrapper;
    this.configStore = configStore;
  }

  /** register all commands via `charmiq.advertise` — called once from main.ts */
  public init(): void {
    const charmiq = (window as any).charmiq;
    if(!charmiq?.advertise) return/*not running inside CharmIQ — skip*/;

    charmiq.advertise('charmiq.command', {
      getText: (tabId?: string) => {
        if(tabId) {
          const tab = this.tabManager.getTabs().get(tabId);
          return tab ? tab.content : null;
        } /* else -- no tabId provided */
        return this.editorWrapper.getValue();
      },

      setText: async (text: string, tabId?: string) => {
        const targetId = tabId || this.tabManager.getActiveTabId();
        if(!targetId) return;

        if(targetId === this.tabManager.getActiveTabId()) {
          this.editorWrapper.setValue(text);
        } /* else -- target is non-active tab */
        const contentBridge = (window as any).__contentBridge/*set by main.ts*/;
        if(contentBridge) await contentBridge.set(text, `[id='${targetId}']`);
      },

      createTab: async (name?: string, content = '', mode = DEFAULT_MODE) => {
        if(!this.tabManager.canCreateTab()) return false/*at maxTabs limit*/;
        await this.tabManager.create(name, content, mode);
        return true;
      },

      switchTab: (tabId: string) => {
        if(this.tabManager.getTabs().has(tabId)) {
          this.tabManager.switchTab(tabId);
          return true;
        } /* else -- invalid tabId */
        return false;
      },

      removeTab: async (tabId: string) => {
        const tabs = this.tabManager.getTabs();
        if(!tabs.has(tabId) || (tabs.size <= 1)) return false;

        await this.tabManager.delete(tabId);
        return true;
      },

      listTabs: () => {
        const activeTabId = this.tabManager.getActiveTabId();
        return Array.from(this.tabManager.getTabs().entries()).map(([id, tab]) => ({
          id,
          name: tab.name,
          mode: this.configStore.getTabMode(id),
          isActive: id === activeTabId
        }));
      }
    });
  }
}
