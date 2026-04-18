import { DEFAULT_MODE } from './config-store';
import type { ContentBridge } from './content-bridge';
import type { EditorWrapper } from './editor-wrapper';
import type { TabManager } from './tab-manager';
import type { TabId } from './tab-types';

// advertises the editor's two external surfaces:
//   charmiq.command                     -- discrete, agent-callable actions
//                                          (getText, listTabs, createTab, ...)
//   ai.charm.shared.codemirror-editor   -- reactive capability for sibling apps
//                                          that want to observe tabs / live text
//                                          without polling (e.g. shader-demo)
//
// The slug half of the (slug, displayName) tuple is intentionally hidden from
// both surfaces — external callers see only the platform tab id and display name
// ********************************************************************************
// == Class =======================================================================
/** wires the editor's commands + reactive capability into the charmiq host */
export class CommandSurface {
  private readonly tabManager: TabManager;
  private readonly editorWrapper: EditorWrapper;
  private readonly contentBridge: ContentBridge;

  // == Lifecycle =================================================================
  public constructor(tabManager: TabManager, editorWrapper: EditorWrapper, contentBridge: ContentBridge) {
    this.tabManager = tabManager;
    this.editorWrapper = editorWrapper;
    this.contentBridge = contentBridge;
  }

  /** advertise both surfaces — called once from main.ts */
  public init(): void {
    const charmiq = (window as any).charmiq;
    if(!charmiq?.advertise) return/*not running inside CharmIQ — skip*/;

    console.log('[codemirror-editor] CommandSurface.init: about to advertise charmiq.command');
    this.advertiseCommands(charmiq);
    console.log('[codemirror-editor] CommandSurface.init: about to advertise ai.charm.shared.codemirror-editor');
    this.advertiseCapability(charmiq);
    console.log('[codemirror-editor] CommandSurface.init: both advertises returned');
  }

  // == Internal ==================================================================
  /** register the discrete agent-callable commands declared in manifest.json */
  private advertiseCommands(charmiq: any): void {
    charmiq.advertise('charmiq.command', {
      getText: (tabId?: TabId) => this.getText(tabId),
      setText: (text: string, tabId?: TabId) => this.setText(text, tabId),

      listTabs: () => this.tabManager.listTabs(),
      switchTab: (tabId: TabId) => this.switchTab(tabId),
      createTab: (name?: string, content = '', mode = DEFAULT_MODE) => this.createTab(name, content, mode),
      removeTab: (tabId: TabId) => this.removeTab(tabId)
    });
  }

  // ------------------------------------------------------------------------------
  /** advertise the reactive capability for sibling apps in the same Document */
  private advertiseCapability(charmiq: any): void {
    charmiq.advertise('ai.charm.shared.codemirror-editor', {
      // streams
      tabs$:      () => this.tabManager.tabs$(),
      activeTab$: () => this.tabManager.activeTab$(),
      changes$:   () => this.tabManager.changes$(),

      // snapshot accessors — convenience for late subscribers
      listTabs:      () => this.tabManager.listTabs(),
      getActiveTabId: () => this.tabManager.getActiveTabId(),
      getText:       (tabId?: TabId) => this.getText(tabId),

      // action pass-through — subscribers can drive the editor in response to
      // their own UI (e.g. a previewer's "open file" button)
      setText:   (text: string, tabId?: TabId) => this.setText(text, tabId),
      switchTab: (tabId: TabId) => this.switchTab(tabId),
      createTab: (name?: string, content = '', mode = DEFAULT_MODE) => this.createTab(name, content, mode),
      removeTab: (tabId: TabId) => this.removeTab(tabId)
    });
  }

  // == Action Implementations ====================================================
  // shared by both surfaces so the behavior stays identical

  // ------------------------------------------------------------------------------
  private getText(tabId?: TabId): string | null {
    if(tabId) {
      const tab = this.tabManager.getTabs().get(tabId);
      return tab ? tab.content : null;
    } /* else -- no tabId; return active editor buffer */
    return this.editorWrapper.getValue();
  }

  private async setText(text: string, tabId?: TabId): Promise<void> {
    const targetId = tabId || this.tabManager.getActiveTabId();
    if(!targetId) return;

    if(targetId === this.tabManager.getActiveTabId()) {
      this.editorWrapper.setValue(text);
    } /* else -- target is non-active tab */
    await this.contentBridge.set(text, `[id='${targetId}']`);
  }

  private switchTab(tabId: TabId): boolean {
    if(!this.tabManager.getTabs().has(tabId)) return false;
    this.tabManager.switchTab(tabId);
    return true;
  }

  private async createTab(name?: string, content = '', mode = DEFAULT_MODE): Promise<boolean> {
    if(!this.tabManager.canCreateTab()) return false/*at maxTabs limit*/;
    await this.tabManager.create(name, content, mode);
    return true;
  }

  private async removeTab(tabId: TabId): Promise<boolean> {
    const tabs = this.tabManager.getTabs();
    if(!tabs.has(tabId) || (tabs.size <= 1)) return false;
    await this.tabManager.delete(tabId);
    return true;
  }
}
