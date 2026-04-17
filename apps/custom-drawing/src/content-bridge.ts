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
const ELEMENTS_SELECTOR = "[id='elements']";
const ELEMENTS_NAME = 'Drawing Elements';

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
  /** write the current elements array as JSON to app-content */
  public async save(elements: DrawingElement[]): Promise<void> {
    const json = JSON.stringify(elements);
    this.lastWrittenJson = json;
    try {
      await this.appContent.set(json, ELEMENTS_SELECTOR, ELEMENTS_NAME);
    } catch(error) {
      console.error('failed to save elements to app-content:', error);
    }
  }

  // == Internal ==================================================================
  /** test whether a content change relates to our elements block.
   *  the platform may identify blocks by id or by name; be permissive */
  private isElementsBlock(change: ContentChange): boolean {
    return (change.id === 'elements') || (change.name === ELEMENTS_NAME);
  }

  // ------------------------------------------------------------------------------
  private parse(content: string): DrawingElement[] {
    if(!content) return [];
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch(error) {
      console.error('failed to parse elements JSON from app-content:', error);
      return [];
    }
  }

  // ------------------------------------------------------------------------------
  private emit(elements: DrawingElement[]): void {
    if(this.onElementsChanged) this.onElementsChanged(elements);
  }

  // ------------------------------------------------------------------------------
  /** whether initial discovery has completed (used to suppress early writes) */
  public get isDiscoveryDone(): boolean { return this.discoveryDone; }
}
