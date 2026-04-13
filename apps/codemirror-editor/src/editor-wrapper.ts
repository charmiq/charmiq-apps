import type { EditorConfig } from './config-store';

// thin facade over CodeMirror 5. if CM is ever upgraded to 6, only this file changes
// ********************************************************************************
// == Types =======================================================================
// CodeMirror 5 global (loaded via <script> tag in index.html)
declare const CodeMirror: any;

// --------------------------------------------------------------------------------
/** callback shape for editor content changes */
type ChangeCallback = (from: number, to: number, insertedText: string) => void;

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
  'xml': 'Start typing your XML here...'
};

// == Class =======================================================================
/** wraps CodeMirror 5 — nobody else touches the editor instance directly */
export class EditorWrapper {
  private cm: any = null;
  private onChange: ChangeCallback | null = null;
  private updating = false;/*guard to prevent echo loops*/

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
      readOnly: 'nocursor'/*locked until discovery completes*/
    });

    // forward User edits to the registered callback
    this.cm.on('changes', (_instance: any, changes: any[]) => {
      if(this.updating) return;/*skip — this is our own programmatic write*/
      if(!this.onChange) return;

      for(const change of changes) {
        const from = this.cm.indexFromPos(change.from);
        const removedText = change.removed ? change.removed.join('\n') : '';
        const insertedText = change.text.join('\n');
        const to = from + removedText.length;
        this.onChange(from, to, insertedText);
      }
    });
  }

  // == Public API ================================================================
  /** register the callback for user-initiated content edits */
  public onContentChange(cb: ChangeCallback): void {
    this.onChange = cb;
  }

  /** get the full editor text */
  public getValue(): string {
    return this.cm?.getValue() ?? '';
  }

  /** replace the entire editor text (guarded) */
  public setValue(text: string): void {
    this.updating = true;
    this.cm.setValue(text);
    this.updating = false;
  }

  /** replace a range — used by the content bridge for minimal-diff patches.
   *  Accepts character offsets (not line/col positions) */
  public replaceRange(text: string, from: number, to: number): void {
    this.updating = true;
    this.cm.replaceRange(
      text,
      this.cm.posFromIndex(from),
      this.cm.posFromIndex(to)
    );
    this.updating = false;
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
