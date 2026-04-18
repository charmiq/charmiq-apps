import { Subject, Subscription, type Observable } from 'rxjs';

import { dbg } from './debug';

// pulls the fragment shader source from a sibling CodeMirror editor App.
// The editor advertises a dedicated reactive capability under the same name as
// its manifest id, so this bridge:
//   1. subscribes to `discover$('ai.charm.shared.codemirror-editor')` to track
//      the live set of editor providers (any number; a Document may host more
//      than one editor)
//   2. subscribes to each provider's `changes$()` and filters by tab name —
//      the matching tab can live in any editor, and a renamed tab disappears
//      cleanly when no provider emits for it anymore
//   3. exposes the most recent matching source via `getShader()` and the live
//      stream via `shaderSource$()` for callers that want push-based recompiles
//
// No probing, no polling. Sibling-app reload is handled because discover$ re-
// emits on the new advertiser identity and the per-provider subscription is torn
// down + rebuilt
// ********************************************************************************
// == Types =======================================================================
/** the editor's reactive capability — the subset this bridge consumes. The full
 *  surface (listTabs, getText, createTab, ...) is documented on the editor side;
 *  the change stream alone is sufficient here */
interface EditorCapability {
  changes$(): Observable<TabContentChange>;
}

// --------------------------------------------------------------------------------
/** mirror of the editor's TabContentChange projection (kept structural to avoid
 *  an inter-app type dependency) */
interface TabContentChange {
  readonly tabId:   string;
  readonly name:    string;
  readonly mode:    string;
  readonly content: string;
}

// == Constants ===================================================================
/** the canonical tab name the demo seeds into the editor. Matches the
 *  `<app-content name="shader:shader.frag">` block in README.md */
const SHADER_TAB_NAME = 'shader.frag';

/** capability advertised by the codemirror-editor app — same string as its
 *  manifest id */
const EDITOR_CAPABILITY = 'ai.charm.shared.codemirror-editor';

// == Class =======================================================================
/** subscribes to every advertised editor in the Document, filters their change
 *  streams for the shader tab, and republishes the matching source through a
 *  Subject the player can react to */
export class EditorBridge {
  /** outer subscription on `discover$(EDITOR_CAPABILITY)` */
  private discoverySubscription: Subscription | null = null;
  /** per-provider subscriptions on `changes$()` — torn down on every discover$
   *  emission so a removed advertiser doesn't keep streaming stale text */
  private providerSubscriptions: Subscription[] = [];

  /** last matching source seen (any provider). null until the first emission;
   *  exposed via getShader() for callers that want a snapshot */
  private latestSource: string | null = null;

  /** push channel for shaderSource$() — emits whenever the matching tab's text
   *  changes in any provider */
  private readonly sourceSubject = new Subject<string>();

  // == Public =====================================================================
  /** subscribe to the editor's advertiser set. Safe to call without a CharmIQ
   *  bridge (standalone preview) — getShader() then always returns null */
  public init(charmiq: any): void {
    if(!charmiq?.discover$) {
      dbg('editor', 'discover skipped (standalone — no charmiq bridge)');
      return;
    } /* else -- platform bridge is present */

    try {
      const providers$ = charmiq.discover$(EDITOR_CAPABILITY) as Observable<ReadonlyArray<EditorCapability>>;
      this.discoverySubscription = providers$.subscribe((providers: ReadonlyArray<EditorCapability>) => {
        this.rewireProviders(providers);
      });
    } catch(error) {
      console.error('shader-demo: failed to subscribe to editor capability:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** release every subscription. Safe to call if init() was never run */
  public destroy(): void {
    if(this.discoverySubscription) this.discoverySubscription.unsubscribe();
    this.discoverySubscription = null;
    this.tearDownProviders();
  }

  // ------------------------------------------------------------------------------
  /** snapshot of the most recent matching shader source. Returns null if no
   *  editor has emitted a tab named SHADER_TAB_NAME yet — caller falls back
   *  to a starter shader so the first frame still renders */
  public getShader(): string | null { return this.latestSource; }

  // ------------------------------------------------------------------------------
  /** push stream of the matching shader source. Subscribers receive every change
   *  (no debounce). Use rxjs operators (debounceTime, distinctUntilChanged) at the
   *  call site to shape the cadence */
  public shaderSource$(): Observable<string> { return this.sourceSubject.asObservable(); }

  // ------------------------------------------------------------------------------
  /** true if any editor was found in the Document */
  public isReady(): boolean { return this.providerSubscriptions.length > 0; }

  // == Internal ===================================================================
  /** swap the per-provider subscriptions to match the latest discover$ snapshot */
  private rewireProviders(providers: ReadonlyArray<EditorCapability>): void {
    this.tearDownProviders();

    if(providers.length < 1) {
      dbg('editor', 'discover$: 0 editor(s); clearing cached source');
      this.latestSource = null;
      return;
    } /* else -- at least one editor */

    dbg('editor', `discover$: ${providers.length} editor(s); subscribing to changes$`);
    for(let i=0; i<providers.length; i++) {
      const provider = providers[i];
      const sub = provider.changes$().subscribe({
        next:  (change: TabContentChange) => this.handleChange(i, change),
        error: (error: unknown)           => console.error(`shader-demo: editor #${i} changes$ errored:`, error)
      });
      this.providerSubscriptions.push(sub);
    }
  }

  // ------------------------------------------------------------------------------
  /** drop every per-provider subscription. Called before re-wiring */
  private tearDownProviders(): void {
    for(const sub of this.providerSubscriptions) sub.unsubscribe();
    this.providerSubscriptions = [];
  }

  // ------------------------------------------------------------------------------
  /** filter for the shader tab and republish on a hit */
  private handleChange(providerIndex: number, change: TabContentChange): void {
    if(change.name !== SHADER_TAB_NAME) return/*not our tab*/;

    if(change.content === this.latestSource) return/*duplicate emission*/;

    dbg('editor', `changes$: editor #${providerIndex} '${change.name}' (${change.content.length} chars)`);
    this.latestSource = change.content;
    this.sourceSubject.next(change.content);
  }

}
