import type { ContentBridge, ContentChange } from './content-bridge';
import { type ConfigStore, DEFAULT_MODE } from './config-store';
import type { EditorWrapper } from './editor-wrapper';
import { composeName, mintSlug, type TabId, type TabSlug } from './tab-types';

// owns tab state (create, delete, switch, rename, reorder) and coordinates the
// ContentBridge, ConfigStore, and EditorWrapper when tabs change.
//
// Tab identity has two flavors that MUST stay distinct:
//   - `TabId`   — platform-minted, used for selectors and edit forwarding
//   - `TabSlug` — app-controlled, used as the key for `tabModes` / `tabOrder`
// The `tabs` map is keyed by `TabId` (the platform's source of truth); each
// tab carries its `slug` as a property. AppState writes always go through the
// slug. Slug-less legacy content is migrated by minting a slug locally and
// rewriting the name; we wait for the OT-converged echo before any appState
// write so concurrent migrations resolve without cross-talk
// ********************************************************************************
// == Constants ===================================================================
/** display name for the welcome tab created when no content exists */
export const DEFAULT_TAB_NAME = 'Welcome';
/** fallback display name for tabs with no name */
export const UNTITLED_TAB_NAME = 'Untitled';

// == Types =======================================================================
/** a single tab's local state. `slug` is null only during the brief migration
 *  window between seeing a slug-less ingest and the rewritten echo arriving */
interface Tab {
  slug: TabSlug | null;
  displayName: string;
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

  private readonly tabs = new Map<TabId, Tab>();
  private activeTabId: TabId | null = null;

  /** tracks slugs minted locally so only the creator auto-switches */
  private readonly locallyCreatedSlugs = new Set<TabSlug>();
  /** tracks tab IDs deleted locally so only the deleter cleans up appState */
  private readonly locallyDeletedTabs = new Set<TabId>();
  /** tracks tab IDs whose slug-less names we've already submitted a rewrite for,
   *  so concurrent ingest events don't trigger a second migration */
  private readonly migrationsInFlight = new Set<TabId>();

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
  public getTabs(): ReadonlyMap<TabId, Readonly<Tab>> { return this.tabs; }
  public getActiveTabId(): TabId | null { return this.activeTabId; }

  /** the active tab's slug, or null while it is mid-migration or absent */
  public getActiveTabSlug(): TabSlug | null {
    if(!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId)?.slug ?? null;
  }

  /** true if a new tab can be created (respects maxTabs limit) */
  public canCreateTab(): boolean {
    const max = this.configStore.getMaxTabs();
    return (max < 1) || (this.tabs.size < max);/*0 = unlimited*/
  }

  /** return ordered tab IDs, merging configStore (slug-keyed) order with any
   *  tabs not yet in the order. Tabs whose slug is still null (migration in
   *  flight) are appended but NOT persisted yet — wait for their slug echo */
  public getOrderedTabIds(): TabId[] {
    const orderSlugs = this.configStore.getTabOrder();

    // build slug → id index from the current tab set
    const slugToId = new Map<TabSlug, TabId>();
    for(const [id, tab] of this.tabs) {
      if(tab.slug !== null) slugToId.set(tab.slug, id);
    }

    // resolve persisted slug order to ids that currently exist
    const ordered: TabId[] = [];
    const orderedSlugSet = new Set<TabSlug>();
    for(const slug of orderSlugs) {
      const id = slugToId.get(slug);
      if(id !== undefined) {
        ordered.push(id);
        orderedSlugSet.add(slug);
      } /* else -- slug refers to a tab not currently present */
    }

    // append tabs whose slug is not yet in the persisted order
    const appended: TabId[] = [];
    const newSlugs: TabSlug[] = [];
    for(const [id, tab] of this.tabs) {
      if(tab.slug === null) {
        appended.push(id)/*include in render order, exclude from persistence*/;
      } else if(!orderedSlugSet.has(tab.slug)) {
        appended.push(id);
        newSlugs.push(tab.slug);
      } /* else -- already in the persisted order */
    }

    if(this.initialSetupDone && (newSlugs.length > 0)) {
      // persist only the slugs we know — slug-null tabs join the order on echo
      this.configStore.updateTabOrder([...orderSlugs, ...newSlugs])/*async*/;
    } /* else -- nothing new to persist */

    return [...ordered, ...appended];
  }

  // == Public Actions ============================================================
  /** mark the initial setup phase as complete (called after discovery settles) */
  public markInitialSetupDone(): void {
    this.initialSetupDone = true;

    if(this.tabs.size < 1) this.createDefaultTab();
  }

  // -- Create Tab ----------------------------------------------------------------
  /** create a new empty tab. The slug is minted locally so the appState mode
   *  write can fire immediately — no need to wait for the platform to round-
   *  trip an id back */
  public async create(name?: string, content = '', mode = DEFAULT_MODE): Promise<void> {
    if(!this.canCreateTab()) return/*at maxTabs limit*/;

    const displayName = name || `${UNTITLED_TAB_NAME} ${this.tabs.size + 1}`;
    const slug = mintSlug();
    const uniqueSelector = `file-${Date.now()}`;

    try {
      this.locallyCreatedSlugs.add(slug);
      await this.contentBridge.set(content, `[name='${uniqueSelector}']`, composeName(slug, displayName));

      // slug is already known — persist mode without waiting for echo
      try { await this.configStore.updateTabMode(slug, mode); }
      catch(error) { console.error('failed to set tab mode:', error); }
    } catch(error) {
      console.error('failed to create tab:', error);
      this.locallyCreatedSlugs.delete(slug);
    }
  }

  // -- Delete Tab ----------------------------------------------------------------
  /** delete a tab (shows confirmation first — see toolbar.ts for dialog flow) */
  public async delete(tabId: TabId): Promise<void> {
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
  public switchTab(tabId: TabId): void {
    const tab = this.tabs.get(tabId);
    if(!tab) return;

    this.activeTabId = tabId;

    this.editorWrapper.setValue(tab.content || '');
    this.editorWrapper.unlock();

    // apply the tab's stored mode (slug-less tabs fall back to DEFAULT_MODE)
    if(tab.slug !== null) this.editorWrapper.setMode(this.configStore.getTabMode(tab.slug));
    else this.editorWrapper.setMode(DEFAULT_MODE);

    this.notify();
  }

  // -- Rename Tab ----------------------------------------------------------------
  /** rename a tab — preserves the slug, only the right side of the tuple changes */
  public async rename(tabId: TabId, newDisplayName: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if(!tab || tab.slug === null) return/*can't rename mid-migration*/;
    await this.contentBridge.set(undefined, `[id='${tabId}']`, composeName(tab.slug, newDisplayName));
  }

  // -- Reorder Tabs --------------------------------------------------------------
  /** reorder tabs (called after drag-and-drop). Translates ids → slugs before
   *  persisting; slug-less tabs are dropped from the persisted order */
  public async reorder(newOrder: TabId[]): Promise<void> {
    const slugOrder: TabSlug[] = [];
    for(const id of newOrder) {
      const slug = this.tabs.get(id)?.slug;
      if(slug) slugOrder.push(slug);
    }
    await this.configStore.updateTabOrder(slugOrder);
  }

  // -- Mode for Active Tab -------------------------------------------------------
  /** get the current mode for the active tab */
  public getActiveTabMode(): string {
    const slug = this.getActiveTabSlug();
    if(!slug) return DEFAULT_MODE;
    return this.configStore.getTabMode(slug);
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

    // legacy migration: slug-less name → mint a slug, rewrite, wait for echo
    if(change.slug === null) {
      this.handleSlugLessChange(change);
      return;
    } /* else -- has a slug */

    // duplicate-slug: another tab is already using this slug
    const existingId = this.findTabIdBySlug(change.slug);
    if((existingId !== null) && (existingId !== change.id)) {
      this.disambiguateSlug(change);
      return/*wait for the rewritten echo*/;
    } /* else -- slug is unique or this is the echo of our own tab */

    this.upsertTab(change);
  }

  // .. Slug-less Migration .......................................................
  /** legacy content arrived without a slug — mint one and rewrite the name. We
   *  still register the tab so the UI can render it, but skip appState writes
   *  for it until the converged slug echoes back */
  private handleSlugLessChange(change: ContentChange): void {
    const isNew = !this.tabs.has(change.id);

    this.tabs.set(change.id, {
      slug: null,
      displayName: change.displayName,
      content: change.content,
      mode: DEFAULT_MODE
    });

    if(isNew && !this.activeTabId) this.switchTab(change.id);
    this.notify();

    if(this.migrationsInFlight.has(change.id)) return/*already initiated*/;

    this.migrationsInFlight.add(change.id);
    const newSlug = mintSlug();
    this.contentBridge.set(undefined, `[id='${change.id}']`, composeName(newSlug, change.displayName))
      .catch((error) => {
        console.error('failed to migrate slug-less tab name:', error);
        this.migrationsInFlight.delete(change.id);
      });
  }

  // .. Slug Disambiguation .......................................................
  /** another tab is already using this slug — suffix and rewrite. OT delivers
   *  events in the same order to all clients, so each client picks the same
   *  suffix and the writes are idempotent */
  private disambiguateSlug(change: ContentChange): void {
    if(this.migrationsInFlight.has(change.id)) return/*rewrite already in flight*/;

    this.migrationsInFlight.add(change.id);
    const suffixed = this.uniqueSuffix(change.slug!);
    this.contentBridge.set(undefined, `[id='${change.id}']`, composeName(suffixed, change.displayName))
      .catch((error) => {
        console.error('failed to disambiguate duplicate slug:', error);
        this.migrationsInFlight.delete(change.id);
      });
  }

  /** find a free `slug-N` suffix that no current tab is using */
  private uniqueSuffix(base: TabSlug): TabSlug {
    let n = 2;
    while(this.findTabIdBySlug(`${base}-${n}`) !== null) n++;
    return `${base}-${n}`;
  }

  // .. Upsert Tab ................................................................
  /** apply a slug-bearing change — either a new tab, a migration completion,
   *  or an ongoing content/name update */
  private upsertTab(change: ContentChange): void {
    const slug = change.slug!;
    const existing = this.tabs.get(change.id);
    const isNew = !existing;
    const wasMigration = this.migrationsInFlight.delete(change.id);

    this.tabs.set(change.id, {
      slug,
      displayName: change.displayName,
      content: change.content,
      mode: this.configStore.getTabMode(slug)
    });

    if(isNew) {
      // auto-switch only if this client created the tab
      if(this.locallyCreatedSlugs.has(slug)) {
        this.locallyCreatedSlugs.delete(slug);
        this.switchTab(change.id);
      } else if(!this.activeTabId) {
        this.switchTab(change.id);
      } /* else -- leave new tab in background */
      this.notify();
      return;
    } /* else -- existing tab */

    // migration completion — slug just arrived; if we're the active tab,
    // re-apply the mode now that we know it
    if(wasMigration && (this.activeTabId === change.id)) {
      this.editorWrapper.setMode(this.configStore.getTabMode(slug));
    } /* else -- not a migration completion or not active */

    this.applyRemoteContent(change.id, change.content);

    if(change.displayName !== existing!.displayName) {
      this.tabs.get(change.id)!.displayName = change.displayName;
      this.notify();
    } else if(wasMigration) {
      this.notify()/*slug change is invisible but downstream may want to refresh*/;
    } /* else -- no observable change */
  }

  // .. Apply Remote Content ......................................................
  /** apply a minimal diff for a remote content change to the active tab */
  // REF: https://prosemirror.net/examples/codemirror/
  private applyRemoteContent(tabId: TabId, newText: string): void {
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

  // -- Lookups -------------------------------------------------------------------
  /** find the tab id currently assigned a given slug; null if unused */
  private findTabIdBySlug(slug: TabSlug): TabId | null {
    for(const [id, tab] of this.tabs) {
      if(tab.slug === slug) return id;
    }
    return null;
  }

  // -- Tabs ----------------------------------------------------------------------
  // .. Tab Deletion ..............................................................
  /** handle a tab deletion event from the content bridge */
  private handleDeletion(tabId: TabId): void {
    const removed = this.tabs.get(tabId);
    if(!removed) return;

    // find a replacement active tab before removing
    let newActiveTabId: TabId | null = null;
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
    this.migrationsInFlight.delete(tabId);

    // clean up appState only if this client initiated the deletion
    if(this.locallyDeletedTabs.has(tabId)) {
      this.locallyDeletedTabs.delete(tabId);
      if(removed.slug !== null) this.configStore.removeTab(removed.slug)/*async*/;
    } /* else -- another client deleted the tab */

    // switch to replacement or handle no-tabs state
    if(newActiveTabId) {
      this.switchTab(newActiveTabId);
    } else if(this.activeTabId === tabId) {
      if((this.tabs.size < 1) && this.initialSetupDone) {
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
    const slug = mintSlug();
    const uniqueSelector = `file-${Date.now()}`;

    try {
      this.locallyCreatedSlugs.add(slug);
      await this.contentBridge.set('', `[name='${uniqueSelector}']`, composeName(slug, DEFAULT_TAB_NAME));
    } catch(error) {
      console.error('failed to create default tab:', error);
      this.locallyCreatedSlugs.delete(slug);
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
