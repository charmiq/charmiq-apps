import mermaid from 'mermaid';
import { race, timer, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { DiagramConfig } from './config-store';

// bridges appContent → Mermaid renderer. Read-only: subscribes to content
// changes and re-renders the diagram. No outbound writes
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;
/** unique id passed to mermaid.render (must be a valid element id) */
const RENDER_ID = 'mermaid-svg';

// == Types =======================================================================
/** shape of an appContent change event */
export interface ContentChange {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

// == Charmiq API (global) ========================================================
interface CharmiqAppContent {
  onChange$(): Observable<ContentChange>;
  set(content: string | undefined, selector: string, name?: string): Promise<void>;
}

// == Class =======================================================================
/** subscribes to appContent and renders Mermaid diagrams into the container */
export class ContentBridge {
  private readonly appContent: CharmiqAppContent;
  private readonly diagramEl: HTMLElement;
  private readonly errorEl: HTMLElement;

  private currentContentId: string | null = null;
  private currentSource: string = '';
  private renderCounter = 0;/*monotonic counter to discard stale renders*/
  private discoveryDone = false;

  // == Lifecycle =================================================================
  public constructor(appContent: CharmiqAppContent, diagramEl: HTMLElement, errorEl: HTMLElement) {
    this.appContent = appContent;
    this.diagramEl = diagramEl;
    this.errorEl = errorEl;
  }

  /** initialize Mermaid with the given config */
  public initMermaid(config: Readonly<DiagramConfig>): void {
    mermaid.initialize({
      startOnLoad: false,
      theme: config.theme,
      ...(config.flowchart ? { flowchart: config.flowchart } : {})
    });
  }

  /** re-initialize Mermaid with updated config and re-render */
  public async applyConfig(config: Readonly<DiagramConfig>): Promise<void> {
    this.initMermaid(config);
    if(this.currentSource) await this.render(this.currentSource);
  }

  /** subscribe to appContent changes, wait for discovery, then resolve */
  public discover(): Promise<void> {
    return new Promise((resolve) => {
      const contentReceived$ = new Subject<void>();

      this.appContent.onChange$().subscribe((change: ContentChange) => {
        contentReceived$.next();/*signal that content arrived*/
        this.handleRemoteChange(change);
      });

      // discovery is complete when either:
      // 1. content arrives and settles (debounce) or
      // 2. no content at all after timeout
      race(
        contentReceived$.pipe(debounceTime(DISCOVERY_DEBOUNCE_MS), take(1)),
        timer(DISCOVERY_TIMEOUT_MS).pipe(take(1))
      ).subscribe(() => {
        this.discoveryDone = true;
        resolve();
      });
    });
  }

  // == Getters ===================================================================
  public getCurrentSource(): string { return this.currentSource; }
  public getCurrentContentId(): string | null { return this.currentContentId; }

  // == Inbound (appContent → Mermaid) ============================================
  /** handle an incoming remote change from appContent */
  private handleRemoteChange(change: ContentChange): void {
    if(change.deleted) {
      if(change.id === this.currentContentId) {
        this.currentContentId = null;
        this.currentSource = '';
        this.diagramEl.innerHTML = '';
      } /* else -- deleted content isn't ours */
      return;
    } /* else -- not a deletion */

    // pick the first content id if none set yet
    if(!this.currentContentId) this.currentContentId = change.id;

    // only process updates for our current content
    if(change.id !== this.currentContentId) return;

    // state comparison — skip if source hasn't changed
    if(change.content === this.currentSource) return/*unchanged*/;

    this.currentSource = change.content;
    this.render(change.content);
  }

  // == Render ====================================================================
  /** render Mermaid source into the diagram container */
  private async render(source: string): Promise<void> {
    if(!source.trim()) {
      this.diagramEl.innerHTML = '';
      this.errorEl.hidden = true;
      return;
    } /* else -- non-empty source to render */

    // monotonic counter — discard stale renders if a newer one started
    const renderToken = ++this.renderCounter;

    try {
      const { svg } = await mermaid.render(RENDER_ID, source.trim());
      if(renderToken !== this.renderCounter) return/*stale — a newer render started*/;

      this.diagramEl.innerHTML = svg;
      this.errorEl.hidden = true;
    } catch(error) {
      if(renderToken !== this.renderCounter) return/*stale*/;

      // mermaid.render() throws on syntax errors — show them inline
      this.errorEl.textContent = (error as Error).message || String(error);
      this.errorEl.hidden = false;

      // clear the stale diagram so a broken SVG doesn't linger
      this.diagramEl.innerHTML = '';
    }
  }
}
