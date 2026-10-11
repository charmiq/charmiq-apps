import { race, timer, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';

import type { AppContentAPI, AppContentChange } from '../../../shared/charmiq';

// bridges the build's LDraw text <-> the `model` appContent block. Inbound text
// that equals the shadow (the last text seen or written) is an echo and is
// skipped. A block-level `deleted=true` event is Platform bookkeeping (it fires
// during first-save block creation), never an authoritative clear: this
// Application never removes its block, so the event is ignored
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;

/** name + selector of the content block that holds the LDraw text */
const MODEL_NAME = 'model';
const MODEL_SELECTOR = `[name='${MODEL_NAME}']`;

// == Class =======================================================================
export class ContentBridge {
  private shadow = '';
  private onTextChanged: ((text: string) => void) | null = null;

  // == Lifecycle =================================================================
  public constructor(private readonly appContent: AppContentAPI) {}

  /** register the callback for text changed by someone else */
  public onChange(callback: (text: string) => void): void {
    this.onTextChanged = callback;
  }

  // ------------------------------------------------------------------------------
  /** subscribes to the block and resolves once its initial content has settled
   *  (content stopped arriving, or none arrived) */
  public discover(): Promise<void> {
    return new Promise(resolve => {
      const received$ = new Subject<void>();
      this.appContent.onChange$().subscribe((change: AppContentChange) => {
        received$.next();
        if((change.name !== MODEL_NAME) || change.deleted) return/*another block, or bookkeeping*/;
        if(change.content === this.shadow) return/*echo*/;
        this.shadow = change.content;
        this.onTextChanged?.(change.content);
      });

      race(
        received$.pipe(debounceTime(DISCOVERY_DEBOUNCE_MS), take(1)),
        timer(DISCOVERY_TIMEOUT_MS).pipe(take(1))
      ).subscribe(() => resolve());
    });
  }

  // == Text ======================================================================
  public getText(): string { return this.shadow; }

  /** writes the text, creating the block when the document has none */
  public async save(text: string): Promise<void> {
    if(text === this.shadow) return/*unchanged*/;
    this.shadow = text;
    await this.appContent.set(text, MODEL_SELECTOR, MODEL_NAME);
  }
}
