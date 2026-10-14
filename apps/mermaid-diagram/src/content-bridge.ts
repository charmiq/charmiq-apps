import mermaid from 'mermaid';
import { firstValueFrom } from 'rxjs';

import type { AppContent, AppContentAPI } from '../../../shared/charmiq';
import type { DiagramConfig } from './config-store';

// bridges appContent → Mermaid renderer. Read-only: follows the Application's
// app-content and re-renders the diagram as it changes. No outbound writes
// ********************************************************************************
// == Constants ===================================================================
/** unique id passed to mermaid.render (must be a valid element id) */
const RENDER_ID = 'mermaid-svg';
/** the diagram types laid out by dagre before Mermaid 12 made ELK the default: they
 *  keep dagre unless a diagram asks for another layout in its own configuration.
 *  Every other type keeps its own default (a mindmap: cose-bilkent). The layout is
 *  set for the type alone because Mermaid reads one top-level `layout` for every
 *  diagram, and a mindmap takes it as the author's */
const DAGRE_DIAGRAM_TYPES: ReadonlySet<string> = new Set([ 'flowchart-v2', 'flowchart', 'stateDiagram', 'state', 'classDiagram', 'class', 'er', 'requirement' ]);

// == Class =======================================================================
/** follows the Application's app-content and renders it as a Mermaid diagram */
export class ContentBridge {
  private readonly appContent: AppContentAPI;
  private readonly diagramEl: HTMLElement;
  private readonly errorEl: HTMLElement;

  private currentContentId: string | null = null;
  private currentSource: string = '';
  private renderCounter = 0;/*monotonic counter to discard stale renders*/
  private config: Readonly<DiagramConfig> | null = null/*until initMermaid*/;

  // == Lifecycle =================================================================
  public constructor(appContent: AppContentAPI, diagramEl: HTMLElement, errorEl: HTMLElement) {
    this.appContent = appContent;
    this.diagramEl = diagramEl;
    this.errorEl = errorEl;
  }

  /** initialize Mermaid with the given config. A diagram is drawn as it always was
   *  (the classic look, and its type's layout before Mermaid 12: SEE:
   *  DAGRE_DIAGRAM_TYPES) unless it asks for another in its own configuration */
  public initMermaid(config: Readonly<DiagramConfig>, diagramType?: string): void {
    this.config = config;
    mermaid.initialize({
      startOnLoad: false,
      look: 'classic',
      ...((diagramType !== undefined) && DAGRE_DIAGRAM_TYPES.has(diagramType) ? { layout: 'dagre' } : {}),
      theme: config.theme,
      ...(config.flowchart ? { flowchart: config.flowchart } : {})
    });
  }

  /** re-initialize Mermaid with updated config and re-render */
  public async applyConfig(config: Readonly<DiagramConfig>): Promise<void> {
    this.initMermaid(config);
    if(this.currentSource) await this.render(this.currentSource);
  }

  /** follows the app-content: resolves once it is first shown (or its read refused) */
  public async follow(): Promise<void> {
    if(!this.appContent.content$) { this.showProblem('Reload this page to show the diagram.'); return/*a page opened before content$*/; }

    const content$ = this.appContent.content$();
    content$.subscribe({ next: content => this.show(content), error: failure => this.showReadFailure(failure) });
    await firstValueFrom(content$).catch(() => undefined/*shown by the subscription*/);
  }

  // == Getters ===================================================================
  public getCurrentSource(): string { return this.currentSource; }
  public getCurrentContentId(): string | null { return this.currentContentId; }

  // == Inbound (appContent → Mermaid) ============================================
  /** shows the app-content as it stands: none is no diagram */
  private show(content: AppContent | null): void {
    this.currentContentId = content?.id ?? null;
    const source = content?.text ?? '';
    if(source === this.currentSource) return/*unchanged*/;

    this.currentSource = source;
    this.render(source);
  }

  /** a refused read says why instead of showing nothing */
  private showReadFailure(failure: unknown): void {
    const code = (failure as { code?: unknown; } | null)?.code;
    this.showProblem((code === 'functions/permission-denied') ? 'This Application isn\'t allowed to read the diagram.' : 'The diagram could not be read. Reload to try again.');
  }
  private showProblem(message: string): void {
    this.diagramEl.innerHTML = '';
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
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
      // the layout follows the diagram's type (SEE: initMermaid), read from its
      // opening keyword (no parse)
      if(this.config) this.initMermaid(this.config, diagramTypeOf(source.trim()));
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

// == Util ========================================================================
/** the diagram's type from its opening keyword (a match, never a parse), or
 *  undefined when there is none */
const diagramTypeOf = (text: string): string | undefined => {
  try {
    return mermaid.detectType(text);
  } catch{
    return undefined/*no known type: Mermaid's own default*/;
  }
};
