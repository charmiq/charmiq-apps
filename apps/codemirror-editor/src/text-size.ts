// the size of the editor's text, as each viewer likes it: bigger and smaller with
// Mod-= (or Mod-+) and Mod--, its own size again with Mod-0, as an editor zooms, and
// with the menus' Text Size row. It is the viewer's, never the document's (two people
// reading one scene keep their own), so it is kept in this browser alone; where the
// browser keeps nothing (a private window) it holds for the visit
// ********************************************************************************
// == Constants ===================================================================
/** the text's size when the viewer has chosen none, and the least and most (pixels) */
export const DEFAULT_TEXT_SIZE = 14;
export const MIN_TEXT_SIZE = 10;
export const MAX_TEXT_SIZE = 28;
/** where the browser keeps the viewer's size */
const STORAGE_KEY = 'codemirror-editor.textSize';
/** the CSS variable the editor's text takes its size from (SEE: styles.scss) */
const SIZE_VARIABLE = '--editor-text-size';

// == Sizes =======================================================================
/** a size kept, read: a whole number of pixels within reach, else the default */
export const keptTextSize = (kept: string | null): number => {
  const size = Number(kept);
  return (Number.isInteger(size) && (size >= MIN_TEXT_SIZE) && (size <= MAX_TEXT_SIZE)) ? size : DEFAULT_TEXT_SIZE;
};
/** the size a step away (a pixel bigger or smaller), held within reach */
export const steppedTextSize = (size: number, step: number): number => Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, size + step));

// == TextSize ====================================================================
/** the editor's text size: `redraw` lays the editor out again at a new size */
export class TextSize {
  private size = DEFAULT_TEXT_SIZE;

  public constructor(private readonly redraw: () => void) {}

  /** the size the viewer chose last, shown, and the menus' rows bound */
  public init(): void {
    let kept: string | null = null;
    try { kept = localStorage.getItem(STORAGE_KEY); } catch { /* nothing kept here: the default */ }
    this.show(keptTextSize(kept));
    for(const control of document.querySelectorAll<HTMLElement>('[data-text-size]')) {
      control.addEventListener('click', event => { event.stopPropagation()/*the menu stays open*/; this.step((control.dataset.textSize === 'bigger') ? 1 : -1); });
    }
  }

  /** the keys an editor zooms by, for its keymap */
  public keys(): Readonly<Record<string, () => void>> {
    const bigger = () => this.step(1), smaller = () => this.step(-1), reset = () => this.set(DEFAULT_TEXT_SIZE);
    return { 'Cmd-=': bigger, 'Ctrl-=': bigger, 'Shift-Cmd-=': bigger, 'Shift-Ctrl-=': bigger, 'Cmd--': smaller, 'Ctrl--': smaller, 'Cmd-0': reset, 'Ctrl-0': reset };
  }

  // == Internal ==================================================================
  private step(step: number): void { this.set(steppedTextSize(this.size, step)); }

  private set(size: number): void {
    this.show(size);
    try { localStorage.setItem(STORAGE_KEY, String(size)); } catch { /* kept for the visit alone */ }
  }

  private show(size: number): void {
    this.size = size;
    document.documentElement.style.setProperty(SIZE_VARIABLE, `${size}px`);
    for(const value of document.querySelectorAll<HTMLElement>('[data-text-size-value]')) value.textContent = String(size);
    this.redraw()/*CodeMirror measures its lines again*/;
  }
}
