import { BehaviorSubject, timer, type Observable } from 'rxjs';
import { retry } from 'rxjs/operators';

import type { CharmIQAPI } from '../../../shared/charmiq';

// the scene's code: the `scene.js` tab of a code editor in the document (SEE:
// apps/codemirror-editor), followed as it changes, whichever editor holds it. The
// editor is the scene's truth; the film never writes it
// ********************************************************************************
// == Constants ===================================================================
/** the tab the scene's code is in */
export const SCENE_TAB = 'scene.js';
const EDITOR_CAPABILITY = 'ai.charmiq.shared.codemirror-editor';

/** an editor answers its change stream once it has advertised: a sibling starting up
 *  may not have yet */
const RETRIES = 20;
const RETRY_STEP_MS = 100/*ms*/;
const RETRY_MAX_MS = 1_000/*ms*/;

// == Types =======================================================================
/** the editor's capability: its tabs' changes (SEE: apps/codemirror-editor command.ts) */
interface EditorCapability { changes$(): Observable<TabChange>; }
interface TabChange { readonly tabId: string; readonly name: string; readonly content: string; }

/** where the scene stands: the editors in the document, and the scene's code once
 *  one holds it */
export type SceneText = Readonly<{ editors: number; code: string | null; }>;

// == Class =======================================================================
export class SceneSource {
  private readonly state = new BehaviorSubject<SceneText>({ editors: 0, code: null });
  private discovery: Readonly<{ unsubscribe: () => void; }> | undefined;
  private changes: Array<Readonly<{ unsubscribe: () => void; }>> = [];

  public get text$(): Observable<SceneText> { return this.state.asObservable(); }

  /** follows every editor in the document; safe without the bridge (no editor) */
  public init(charmiq: CharmIQAPI | undefined): void {
    if(!charmiq?.discover$) return/*standalone: no editor*/;
    this.discovery = charmiq.discover$<EditorCapability>(EDITOR_CAPABILITY).subscribe(editors => this.follow(editors));
  }

  // == Internal ==================================================================
  private follow(editors: ReadonlyArray<EditorCapability>): void {
    for(const subscription of this.changes) subscription.unsubscribe();
    this.changes = editors.map(editor => editor.changes$().pipe(
      retry({ count: RETRIES, delay: (_error: unknown, attempt: number) => timer(Math.min(RETRY_STEP_MS * attempt, RETRY_MAX_MS)) }),
    ).subscribe({
      next: change => { if((change.name === SCENE_TAB) && (change.content !== this.state.value.code)) this.state.next({ ...this.state.value, code: change.content }); },
      error: error => console.error('stop-motion: an editor\'s changes stopped:', error),
    }));
    this.state.next({ editors: editors.length, code: (editors.length > 0) ? this.state.value.code : null });
  }
}
