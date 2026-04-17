import { race, timer, Observable, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';

import type { DrawingElement } from './element-model';

// bridges the drawing elements ↔ appContent layer. The elements array is
// serialized as JSON and stored in a single named content block. The bridge
// owns the discovery phase (wait for initial content to settle on start up)
// and routes remote updates back to the app
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;

/** selector + name for the single content block that holds the elements JSON */
const ELEMENTS_NAME = 'elements';
const ELEMENTS_SELECTOR = `[name='${ELEMENTS_NAME}']`;

// == Types =======================================================================
interface ContentChange {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

// --------------------------------------------------------------------------------
type ElementsChangedCallback = (elements: DrawingElement[]) => void;

// == CharmIQ API (global) ========================================================
interface CharmiqAppContent {
  onChange$(): Observable<ContentChange>;
  applyChanges(changes: ReadonlyArray<{ from: number; to: number; insert: string; }>, selector: string): Promise<void>;
  set(content: string | undefined, selector: string, name?: string): Promise<void>;
  remove(selector: string): Promise<void>;
}

// == Class =======================================================================
/** manages elements JSON sync between the drawing app and appContent */
export class ContentBridge {
  private readonly appContent: CharmiqAppContent;
  private onElementsChanged: ElementsChangedCallback | null = null;
  private discoveryDone = false;
  /** last JSON we wrote — used to suppress echo events */
  private lastWrittenJson: string | null = null;

  // == Lifecycle =================================================================
  public constructor(appContent: CharmiqAppContent) {
    this.appContent = appContent;
  }

  // ------------------------------------------------------------------------------
  /** register callback for remote element changes */
  public onChange(cb: ElementsChangedCallback): void {
    this.onElementsChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** subscribe to appContent changes and wait for the discovery phase to settle.
   *  resolves when discovery is complete (content has stopped arriving, or timeout) */
  public discover(): Promise<void> {
    return new Promise((resolve) => {
      const contentReceived$ = new Subject<void>();

      this.appContent.onChange$().subscribe((change: ContentChange) => {
        contentReceived$.next();

        // only process our elements block
        if(!this.isElementsBlock(change)) return;

        if(change.deleted) {
          this.emit([]);
          return;
        } /* else -- normal content update */

        // ignore echoes of our own writes
        if(change.content === this.lastWrittenJson) return;

        this.emit(this.parse(change.content));
      });

      race(
        contentReceived$.pipe(debounceTime(DISCOVERY_DEBOUNCE_MS), take(1)),
        timer(DISCOVERY_TIMEOUT_MS).pipe(take(1))
      ).subscribe(() => {
        this.discoveryDone = true;
        resolve();
      });
    });
  }

  // == Outbound (app → appContent) ===============================================
  /** write the current elements as JSON Lines (one element per line) to
   *  app-content. JSONL is used instead of a single JSON array so that
   *  incremental edits on a single element produce a localized diff rather
   *  than rewriting the entire document */
  public async save(elements: DrawingElement[]): Promise<void> {
    const jsonl = this.serialize(elements);
    this.lastWrittenJson = jsonl;
    try {
      await this.appContent.set(jsonl, ELEMENTS_SELECTOR, ELEMENTS_NAME);
    } catch(error) {
      console.error('failed to save elements to app-content:', error);
    }
  }

  // == Internal ==================================================================
  /** test whether a content change relates to our elements block */
  private isElementsBlock(change: ContentChange): boolean {
    return change.name === ELEMENTS_NAME;
  }

  // ------------------------------------------------------------------------------
  /** serialize elements as JSON Lines (one element per line) */
  private serialize(elements: DrawingElement[]): string {
    return elements.map(el => JSON.stringify(el)).join('\n');
  }

  // ------------------------------------------------------------------------------
  /** parse elements from app-content. Accepts JSON Lines (one element per
   *  line, current format) and, for backward compatibility, a single JSON
   *  array on one line (legacy format) */
  private parse(content: string): DrawingElement[] {
    if(!content) return [];

    const trimmed = content.trim();
    if(!trimmed) return [];

    // legacy: a single JSON array
    if(trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch(error) {
        console.error('failed to parse elements JSON array from app-content:', error);
        return [];
      }
    } /* else -- treat as JSON Lines */

    const out: DrawingElement[] = [];
    const lines = trimmed.split('\n');
    for(const line of lines) {
      const s = line.trim();
      if(!s) continue;/*skip blank lines*/
      try {
        out.push(JSON.parse(s));
      } catch(error) {
        console.error('failed to parse element line from app-content:', s, error);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------------
  private emit(elements: DrawingElement[]): void {
    if(this.onElementsChanged) this.onElementsChanged(elements);
  }

  // ------------------------------------------------------------------------------
  /** whether initial discovery has completed (used to suppress early writes) */
  public get isDiscoveryDone(): boolean { return this.discoveryDone; }
}
