import type { ContentBridge, ContentChange } from './content-bridge';
import { type ConfigStore, DEFAULT_MODE } from './config-store';
import type { EditorWrapper } from './editor-wrapper';

// owns tab state (create, delete, switch, rename, reorder) and coordinates the
// ContentBridge, ConfigStore, and EditorWrapper when tabs change
// ********************************************************************************
// == Constants ===================================================================
/** display name for the welcome tab created when no content exists */
export const DEFAULT_TAB_NAME = 'Welcome';
/** content for the welcome tab */
export const DEFAULT_TAB_CONTENT = '# Welcome to CodeMirror Editor\n\nStart typing your markdown here...';
/** fallback display name for tabs with no name */
export const UNTITLED_TAB_NAME = 'Untitled';

// --------------------------------------------------------------------------------
/** ms to wait for a newly created tab to appear before giving up */
const TAB_CREATION_TIMEOUT_MS = 5_000/*ms*/;

// == Types =======================================================================
declare const rxjs: any;/*loaded via <script> in index.html*/

// --------------------------------------------------------------------------------
/** a single tab's local state */
interface Tab {
  name: string;
  content: string;
  mode: string;
}

// --------------------------------------------------------------------------------
/** callback when the tab list or active tab changes (triggers UI re-render) */
type TabsChangedCallback = () => void;

// == Class =======================================================================
/** manages tab lifecycle and coordinates modules when tabs change */
export class TabManager {
  private readonly contentBridge: ContentBridge;
  private readonly configStore: ConfigStore;
  private readonly editorWrapper: EditorWrapper;

  private readonly tabs = new Map<string, Tab>();
  private activeTabId: string | null = null;

  /** tracks tab names created locally so that only the creator auto-switches */
  private readonly locallyCreatedTabNames = new Set<string>();
  /** tracks tab IDs deleted locally so only the deleter cleans up appState */
  private readonly locallyDeletedTabs = new Set<string>();

  private onTabsChanged: TabsChangedCallback | null = null;
  private initialSetupDone = false;

  // == Lifecycle =================================================================
  public constructor(contentBridge: ContentBridge, configStore: ConfigStore, editorWrapper: EditorWrapper) {
    this.contentBridge = contentBridge;
    this.configStore = configStore;
    this.editorWrapper = editorWrapper;
  }

  /** register callback fired whenever the tab set or active tab changes */
  public onTabsChange(cb: TabsChangedCallback): void {
    this.onTabsChanged = cb;
  }

  /** wire the content bridge callback — called once from main.ts */
  public init(): void {
    this.contentBridge.onContentChange((change) => this.handleContentChange(change));
  }

  // == Accessors =================================================================
  public getTabs(): ReadonlyMap<string, Readonly<Tab>> { return this.tabs; }
  public getActiveTabId(): string | null { return this.activeTabId; }

  /** return ordered tab IDs, merging configStore order with any tabs not yet in the order */
  public getOrderedTabIds(): string[] {
    const storeOrder = this.configStore.getTabOrder();
    const ordered = (storeOrder as string[]).filter((id: string) => this.tabs.has(id));

    // append tabs that exist but are not yet in the persisted order
    const missing = Array.from(this.tabs.keys()).filter(id => !ordered.includes(id));
    if(missing.length > 0) {
      const combined = [...ordered, ...missing];
      this.configStore.updateTabOrder(combined)/*async, fire-and-forget*/;
      return combined;
    } /* else -- order is up to date */

    return ordered;
  }

  // == Public Actions ============================================================
  /** mark the initial setup phase as complete (called after discovery settles) */
  public markInitialSetupDone(): void {
    this.initialSetupDone = true;

    if(this.tabs.size < 1) this.createDefaultTab();
  }

  // -- Create Tab ----------------------------------------------------------------
  /** create a new empty tab */
  public async create(name?: string, content = '', mode = DEFAULT_MODE): Promise<void> {
    const tabName = name || `${UNTITLED_TAB_NAME} ${this.tabs.size + 1}`;
    const uniqueSelector = `file-${Date.now()}`;

    try {
      this.locallyCreatedTabNames.add(tabName);
      await this.contentBridge.set(content, `[name='${uniqueSelector}']`, tabName);

      // wait for the tab to appear so its mode can be persisted
      const { filter, take, timeout } = rxjs.operators;
      (window as any).charmiq.appContent.onChange$().pipe(
        filter((c: any) => !c.deleted && (c.name === tabName)),
        take(1),
        timeout(TAB_CREATION_TIMEOUT_MS)
      ).subscribe({
        next: async (change: any) => {
          try { await this.configStore.updateTabMode(change.id, mode); } catch(error) {
            console.error('failed to set tab mode:', error);
          }
        },
        error: (error: any) => console.error('timeout waiting for tab creation:', error)
      });
    } catch(error) {
      console.error('failed to create tab:', error);
      this.locallyCreatedTabNames.delete(tabName);
    }
  }

  // -- Delete Tab ----------------------------------------------------------------
  /** delete a tab (shows confirmation first — see toolbar.ts for dialog flow) */
  public async delete(tabId: string): Promise<void> {
    if(!this.tabs.has(tabId) || this.tabs.size <= 1) return;

    try {
      this.locallyDeletedTabs.add(tabId);
      await this.contentBridge.remove(`[id='${tabId}']`);
    } catch(error) {
      console.error('failed to delete tab:', error);
      this.locallyDeletedTabs.delete(tabId);
    }
  }

  // -- Switch Tab ----------------------------------------------------------------
  /** switch to a tab by ID */
  public switchTab(tabId: string): void {
    if(!this.tabs.has(tabId)) return;

    this.activeTabId = tabId;
    const tab = this.tabs.get(tabId)!;

    this.editorWrapper.setValue(tab.content || '');
    this.editorWrapper.unlock();

    // apply the tab's stored mode
    const mode = this.configStore.getTabMode(tabId);
    this.editorWrapper.setMode(mode);

    this.notify();
  }

  // -- Rename Tab ----------------------------------------------------------------
  /** rename a tab */
  public async rename(tabId: string, newName: string): Promise<void> {
    if(!this.tabs.has(tabId)) return;
    await this.contentBridge.set(undefined, `[id='${tabId}']`, newName);
  }

  // -- Reorder Tabs --------------------------------------------------------------
  /** reorder tabs (called after drag-and-drop) */
  public async reorder(newOrder: string[]): Promise<void> {
    await this.configStore.updateTabOrder(newOrder);
  }

  // -- Mode for Active Tab -------------------------------------------------------
  /** get the current mode for the active tab */
  public getActiveTabMode(): string {
    if(!this.activeTabId) return DEFAULT_MODE;
    return this.configStore.getTabMode(this.activeTabId);
  }

  // == Internal ==================================================================
  // -- Content -------------------------------------------------------------------
  // .. Content Change ............................................................
  /** handle a content change from the content bridge */
  private handleContentChange(change: ContentChange): void {
    if(change.deleted) {
      this.handleDeletion(change.id);
      return;
    } /* else -- content was created or updated */

    const isNew = !this.tabs.has(change.id);

    this.tabs.set(change.id, {
      name: change.name,
      content: change.content,
      mode: this.configStore.getTabMode(change.id)
    });

    if(isNew) {
      // auto-switch only if this client created the tab
      if(this.locallyCreatedTabNames.has(change.name)) {
        this.locallyCreatedTabNames.delete(change.name);
        this.switchTab(change.id);
      } else if(!this.activeTabId) {
        // no active tab yet — activate the first one that arrives
        this.switchTab(change.id);
      } /* else -- leave new tab in background */
      this.notify();
    } else {
      this.applyRemoteContent(change.id, change.content);

      // update name if it changed
      const existing = this.tabs.get(change.id)!;
      if(change.name && (change.name !== existing.name)) {
        existing.name = change.name;
        this.notify();
      } /* else -- name is unchanged */
    }
  }

  // .. Apply Remote Content ......................................................
  /** apply a minimal diff for a remote content change to the active tab */
  // REF: https://prosemirror.net/examples/codemirror/
  private applyRemoteContent(tabId: string, newText: string): void {
    const tab = this.tabs.get(tabId);
    if(tab) tab.content = newText;

    if(tabId !== this.activeTabId) return;/*not the active tab — just cache it*/

    const curText = this.editorWrapper.getValue();
    if(newText === curText) return;/*already in sync*/

    // find the minimal changed region
    let start = 0;
    let curEnd = curText.length;
    let newEnd = newText.length;

    while((start < curEnd) && (curText.charCodeAt(start) === newText.charCodeAt(start))) {
      ++start;
    }
    while((curEnd > start) && (newEnd > start) && (curText.charCodeAt(curEnd - 1) === newText.charCodeAt(newEnd - 1))) {
      curEnd--;
      newEnd--;
    }

    this.editorWrapper.replaceRange(newText.slice(start, newEnd), start, curEnd);
  }

  // -- Tabs ----------------------------------------------------------------------
  // .. Tab Deletion ..............................................................
  /** handle a tab deletion event from the content bridge */
  private handleDeletion(tabId: string): void {
    if(!this.tabs.has(tabId)) return;

    // find a replacement active tab before removing
    let newActiveTabId: string | null = null;
    if(this.activeTabId === tabId) {
      const orderedIds = this.getOrderedTabIds();
      const idx = orderedIds.indexOf(tabId);
      if(idx > 0) {
        newActiveTabId = orderedIds[idx - 1];
      } else if(orderedIds.length > 1) {
        newActiveTabId = orderedIds[1];
      } /* else -- no other tabs to switch to */
    }

    this.tabs.delete(tabId);

    // clean up appState only if this client initiated the deletion
    if(this.locallyDeletedTabs.has(tabId)) {
      this.locallyDeletedTabs.delete(tabId);
      this.configStore.removeTab(tabId)/*async, fire-and-forget*/;
    } /* else -- another client deleted the tab */

    // switch to replacement or handle no-tabs state
    if(newActiveTabId) {
      this.switchTab(newActiveTabId);
    } else if(this.activeTabId === tabId) {
      if(this.tabs.size === 0 && this.initialSetupDone) {
        this.createDefaultTab();
      } else {
        this.activeTabId = null;
        this.editorWrapper.setValue('');
        this.editorWrapper.lock();
      }
    } /* else -- deleted tab was not active */

    this.notify();
  }

  // .. Create Default Tab ........................................................
  /** create a welcome/default tab when no tabs exist after discovery */
  private async createDefaultTab(): Promise<void> {
    const defaultContent = DEFAULT_TAB_CONTENT;
    const defaultName = DEFAULT_TAB_NAME;
    const uniqueSelector = `file-${Date.now()}`;

    try {
      this.locallyCreatedTabNames.add(defaultName);
      await this.contentBridge.set(defaultContent, `[name='${uniqueSelector}']`, defaultName);
    } catch(error) {
      console.error('failed to create default tab:', error);
      this.locallyCreatedTabNames.delete(defaultName);
      this.activeTabId = null;
      this.editorWrapper.setValue('');
      this.editorWrapper.lock();
    }
  }

  // .. Notify UI .................................................................
  /** notify the UI that tabs changed */
  private notify(): void {
    if(this.onTabsChanged) this.onTabsChanged();
  }
}
