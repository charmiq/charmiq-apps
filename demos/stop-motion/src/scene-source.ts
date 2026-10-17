import { BehaviorSubject, timer, type Observable } from 'rxjs';
import { retry } from 'rxjs/operators';

import type { CharmIQAPI } from '../../../shared/charmiq';

// the scene's code: the `scene.js` tab of a code editor in the document (SEE:
// apps/codemirror-editor), followed as it changes, whichever editor holds it: the
// first editor with a tab of that name, as its tabs are renamed and removed. The
// editor is the scene's truth; the film writes it only when the person opens a film
// or starts a new one, through the editor as an edit of the person's own, into the tab
// named scene.js when the write is made (one made in the first editor when none is)
// ********************************************************************************
// == Constants ===================================================================
/** the tab the scene's code is in */
export const SCENE_TAB = 'scene.js';
/** the language a new scene tab is edited in */
const SCENE_MODE = 'javascript';
const EDITOR_CAPABILITY = 'ai.charmiq.shared.codemirror-editor';

/** an editor answers its change stream once it has advertised: a sibling starting up
 *  may not have yet */
const RETRIES = 20;
const RETRY_STEP_MS = 100/*ms*/;
const RETRY_MAX_MS = 1_000/*ms*/;

// == Types =======================================================================
/** the editor's capability: its tabs and their changes, and writing a tab (SEE:
 *  apps/codemirror-editor command.ts) */
interface EditorCapability {
  tabs$(): Observable<ReadonlyArray<TabInfo>>;
  changes$(): Observable<TabChange>;
  listTabs(): Promise<ReadonlyArray<TabInfo>>;
  setText(text: string, tabId: string): Promise<void>;
  createTab(name: string, content: string, mode: string): Promise<boolean>;
}
interface TabInfo { readonly id: string; readonly name: string; }
interface TabChange { readonly tabId: string; readonly name: string; readonly content: string; }
/** what an editor is known to hold: each tab's name and its content */
type Held = { names: Map<string, string>; readonly contents: Map<string, string>; };

/** where the scene stands: the editors in the document, and the scene's code once
 *  one holds it */
export type SceneText = Readonly<{ editors: number; code: string | null; }>;

// == Class =======================================================================
export class SceneSource {
  private readonly state = new BehaviorSubject<SceneText>({ editors: 0, code: null });
  private discovery: Readonly<{ unsubscribe: () => void; }> | undefined;
  private changes: Array<Readonly<{ unsubscribe: () => void; }>> = [];
  /** the editors followed, in the order found, and what each holds */
  private editors: ReadonlyArray<EditorCapability> = [];
  private held = new Map<EditorCapability, Held>();

  public get text$(): Observable<SceneText> { return this.state.asObservable(); }
  /** the scene's code as the editor holds it, or none */
  public get code(): string | null { return this.state.value.code; }

  /** follows every editor in the document; safe without the bridge (no editor) */
  public init(charmiq: CharmIQAPI | undefined): void {
    if(!charmiq?.discover$) return/*standalone: no editor*/;
    this.discovery = charmiq.discover$<EditorCapability>(EDITOR_CAPABILITY).subscribe(editors => this.follow(editors));
  }

  /** refuses, saying why, when no scene can be written: no code editor */
  public async check(): Promise<void> {
    if(this.editors.length < 1) throw new Error(`No code editor holds the scene: add one to this document, with a ${SCENE_TAB} tab.`);
  }

  /** puts code in the scene's tab as an edit of the person's own, resolving once the
   *  document holds it: the first editor's tab named scene.js as it reads now, or a
   *  new one in the first editor */
  public async write(code: string): Promise<void> {
    for(const editor of this.editors) {
      const tab = (await editor.listTabs()).find(each => each.name === SCENE_TAB);
      if(tab) { await editor.setText(code, tab.id); return; }
    }
    await this.check();
    if(!(await this.editors[0].createTab(SCENE_TAB, code, SCENE_MODE))) throw new Error(`The code editor has no room for a ${SCENE_TAB} tab.`);
  }

  // == Internal ==================================================================
  private follow(editors: ReadonlyArray<EditorCapability>): void {
    for(const subscription of this.changes) subscription.unsubscribe();
    this.editors = editors;
    this.held = new Map(editors.map(editor => [editor, { names: new Map(), contents: new Map() }]));
    const retrying = <T>(stream: Observable<T>) => stream.pipe(retry({ count: RETRIES, delay: (_error: unknown, attempt: number) => timer(Math.min(RETRY_STEP_MS * attempt, RETRY_MAX_MS)) }));
    this.changes = editors.flatMap(editor => {
      const held = this.held.get(editor)!/*each editor followed*/;
      return [
        retrying(editor.tabs$()).subscribe({
          next: tabs => { held.names = new Map(tabs.map(tab => [tab.id, tab.name])); this.look(); },
          error: error => console.error('stop-motion: an editor\'s tabs stopped:', error),
        }),
        retrying(editor.changes$()).subscribe({
          next: change => { held.names.set(change.tabId, change.name); held.contents.set(change.tabId, change.content); this.look(); },
          error: error => console.error('stop-motion: an editor\'s changes stopped:', error),
        }),
      ];
    });
    this.look();
  }

  /** the scene as the editors hold it: the content of the first editor's tab named
   *  scene.js, or none */
  private look(): void {
    let code: string | null = null;
    for(const editor of this.editors) {
      const held = this.held.get(editor)!;
      const id = [...held.names].find(([, name]) => name === SCENE_TAB)?.[0];
      if(id !== undefined) { code = held.contents.get(id) ?? null; break; }
    }
    const { editors, code: was } = this.state.value;
    if((editors !== this.editors.length) || (code !== was)) this.state.next({ editors: this.editors.length, code });
  }
}
