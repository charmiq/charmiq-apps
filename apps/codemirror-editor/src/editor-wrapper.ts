import { ChangeSet, Text } from '@codemirror/state';

import type { EditorConfig } from './config-store';

// thin facade over CodeMirror 5. if CM is ever upgraded to 6, only this file changes.
// The text a user changes is reported as one change set on the text before the
// batch: CodeMirror 5 reports a batch once it has applied all of it, each change
// in the coordinates of the text the changes before it left, so each is placed
// against a running copy of that text. Changes made elsewhere arrive as change
// sets and are applied without being reported back. Undo and redo are the live
// text's own (its history holds this user's changes only, mapped over everyone
// else's), never CodeMirror's, which would undo others' changes too
// ********************************************************************************
// == Types =======================================================================
// CodeMirror 5 global (loaded via <script> tag in index.html)
declare const CodeMirror: any;

// --------------------------------------------------------------------------------
/** callback shape for a user's change: one change set on the text before it */
type ChangeCallback = (changes: ChangeSet) => void;
/** callback shape for undo and redo */
type HistoryCallback = (kind: 'undo' | 'redo') => void;

// --------------------------------------------------------------------------------
// placeholder text per language mode
const PLACEHOLDERS: Readonly<Record<string, string>> = {
  'css': 'Start typing your CSS here...',
  'htmlmixed': 'Start typing your HTML here...',
  'javascript': 'Start typing your JavaScript here...',
  'application/json': 'Start typing your JSON here...',
  'jsx': 'Start typing your JSX here...',
  'markdown': 'Start typing your markdown here...',
  'text/x-scss': 'Start typing your Sass/SCSS here...',
  'text/typescript': 'Start typing your TypeScript here...',
  'text/typescript-jsx': 'Start typing your TSX here...',
  'x-shader/x-fragment': 'Start typing your fragment shader here...',
  'x-shader/x-vertex': 'Start typing your vertex shader here...',
  'xml': 'Start typing your XML here...'
};

/** the origins of the changes this wrapper applies, never reported as the user's */
const APPLIED_ORIGINS: ReadonlySet<string> = new Set(['*remote', 'setValue']);

// == Class =======================================================================
/** wraps CodeMirror 5 — nobody else touches the editor instance directly */
export class EditorWrapper {
  private cm: any = null;
  private onChange: ChangeCallback | null = null;
  private onHistory: HistoryCallback | null = null;
  /** the text the editor shows, as of the last change it reported or was given */
  private known: Text = Text.empty;

  // == Lifecycle =================================================================
  /** create the CodeMirror instance on the given <textarea> */
  public init(el: HTMLTextAreaElement, config: EditorConfig, mode: string): void {
    this.cm = CodeMirror.fromTextArea(el, {
      lineNumbers: config.lineNumbers,
      mode,
      theme: 'default',
      indentWithTabs: config.indentWithTabs,
      smartIndent: config.smartIndent,
      lineWrapping: config.lineWrapping,
      placeholder: PLACEHOLDERS[mode] || 'Start typing here...',
      readOnly: 'nocursor'/*locked until discovery completes*/,
      undoDepth: 0/*the live text keeps the history*/,
      extraKeys: {
        'Ctrl-Z': () => this.onHistory?.('undo'), 'Cmd-Z': () => this.onHistory?.('undo'),
        'Shift-Ctrl-Z': () => this.onHistory?.('redo'), 'Shift-Cmd-Z': () => this.onHistory?.('redo'), 'Ctrl-Y': () => this.onHistory?.('redo'),
      },
    });

    // report a user's batch as one change set on the text before it. A change this
    // wrapper applied is known by its origin: CodeMirror can report it after the
    // call that applied it (inside a key handler's operation, an undo's)
    this.cm.on('changes', (_instance: any, changes: any[]) => {
      const users = changes.filter(change => !APPLIED_ORIGINS.has(change.origin));
      if(users.length < 1) return/*only changes this wrapper applied*/;
      const reported = toChangeSet(this.known, users);
      this.known = reported.apply(this.known);
      if(this.known.toString() !== this.cm.getValue()) console.error('codemirror-editor: a change could not be placed; the live text may differ', JSON.stringify(changes.map(change => ({ from: change.from, to: change.to, text: change.text, removed: change.removed, origin: change.origin }))));
      this.onChange?.(reported);
    });
  }

  // == Public API ================================================================
  /** register the callback for a user's changes */
  public onContentChange(cb: ChangeCallback): void {
    this.onChange = cb;
  }

  /** register the callback for undo and redo */
  public onUndoRedo(cb: HistoryCallback): void {
    this.onHistory = cb;
  }

  /** get the full editor text */
  public getValue(): string {
    return this.cm?.getValue() ?? '';
  }

  /** replace the entire editor text, unreported: a tab shown, or reloaded */
  public setValue(text: string): void {
    this.cm.setValue(text);
    this.known = Text.of(text.split('\n'));
  }

  /** apply a change made elsewhere, unreported; the selection maps through it */
  public applyChanges(changes: ChangeSet): void {
    const edits: Array<Readonly<{ from: number; to: number; insert: string; }>> = [];
    changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => { edits.unshift({ from: fromA, to: toA, insert: inserted.toString() }); }/*the last first: none moves another*/);
    this.cm.operation(() => {
      for(const { from, to, insert } of edits) this.cm.replaceRange(insert, this.cm.posFromIndex(from), this.cm.posFromIndex(to), '*remote');
    });
    this.known = changes.apply(this.known);
  }

  /** adds keys to the editor's keymap, each a CodeMirror key name and what it does */
  public addKeys(keys: Readonly<Record<string, () => void>>): void {
    this.cm?.addKeyMap({ ...keys });
  }

  /** draws the editor's text at a size (pixels), its lines measured anew */
  public setTextSize(size: number): void {
    if(!this.cm) return;
    this.cm.getWrapperElement().style.fontSize = `${size}px`;
    this.cm.refresh();
  }

  /** set a single CodeMirror option */
  public setOption(key: string, value: any): void {
    this.cm?.setOption(key, value);
  }

  /** change the language mode and update the placeholder */
  public setMode(mode: string): void {
    this.cm.setOption('mode', mode);
    this.cm.setOption('placeholder', PLACEHOLDERS[mode] || 'Start typing here...');
  }

  /** unlock the editor (called after discovery) */
  public unlock(): void {
    this.cm.setOption('readOnly', false);
  }

  /** lock the editor (called when no tabs exist) */
  public lock(): void {
    this.cm.setOption('readOnly', 'nocursor');
  }

  /** show the editor container with a fade-in transition */
  public reveal(): void {
    requestAnimationFrame(() => {
      document.querySelector('.editor-container')?.classList.add('ready');
    });
  }

  /** focus the editor */
  public focus(): void {
    this.cm?.focus();
  }
}

// == Util ========================================================================
/** a CodeMirror 5 batch as one change set on the text before it: each change's
 *  line/column is placed in the text the changes before it left */
const toChangeSet = (before: Text, changes: ReadonlyArray<any>): ChangeSet => {
  let running = before;
  let composed = ChangeSet.empty(before.length);
  for(const change of changes) {
    const from = running.line(change.from.line + 1).from + change.from.ch;
    const removed = (change.removed ?? ['']).join('\n');
    const single = ChangeSet.of({ from, to: from + removed.length, insert: change.text.join('\n') }, running.length);
    composed = composed.compose(single);
    running = single.apply(running);
  }
  return composed;
};
