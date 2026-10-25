// the size of the editor's text: one of the editor's options, kept with the others in
// the document's app state (SEE: config-store.ts), so a document sets its editor's
// size for whoever reads it (a studio's narrow scene tab smaller) and a change reaches
// everyone, as line numbers do. Bigger and smaller with Mod-= (or Mod-+) and Mod--, the
// default again with Mod-0, as an editor zooms, and with the menus' Text Size row
// ********************************************************************************
// == Constants ===================================================================
/** the text's size when the document names none, and the least and most (pixels) */
export const DEFAULT_TEXT_SIZE = 14;
export const MIN_TEXT_SIZE = 10;
export const MAX_TEXT_SIZE = 28;

// == Sizes =======================================================================
/** a size the app state holds, read: a whole number of pixels within reach, else none */
export const textSizeOf = (value: unknown): number | undefined =>
  ((typeof value === 'number') && Number.isInteger(value) && (value >= MIN_TEXT_SIZE) && (value <= MAX_TEXT_SIZE)) ? value : undefined;
/** the size a step away (a pixel bigger or smaller), held within reach */
export const steppedTextSize = (size: number, step: number): number => Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, size + step));

// == TextSize ====================================================================
/** the editor's text size: `resize` draws the editor's text at a size (pixels) and
 *  `choose` keeps a size chosen here as the document's */
export class TextSize {
  private size = DEFAULT_TEXT_SIZE;

  public constructor(private readonly resize: (size: number) => void, private readonly choose: (size: number) => void) {}

  /** the menus' rows bound */
  public init(): void {
    for(const control of document.querySelectorAll<HTMLElement>('[data-text-size]')) {
      control.addEventListener('click', event => { event.stopPropagation()/*the menu stays open*/; this.step((control.dataset.textSize === 'bigger') ? 1 : -1); });
    }
  }

  /** the keys an editor zooms by, for its keymap */
  public keys(): Readonly<Record<string, () => void>> {
    const bigger = () => this.step(1), smaller = () => this.step(-1), reset = () => this.set(DEFAULT_TEXT_SIZE);
    return { 'Cmd-=': bigger, 'Ctrl-=': bigger, 'Shift-Cmd-=': bigger, 'Shift-Ctrl-=': bigger, 'Cmd--': smaller, 'Ctrl--': smaller, 'Cmd-0': reset, 'Ctrl-0': reset };
  }

  /** draws the text at the document's size (its own, or one arriving from another viewer) */
  public show(size: number): void {
    this.size = size;
    this.resize(size);
    for(const value of document.querySelectorAll<HTMLElement>('[data-text-size-value]')) value.textContent = String(size);
  }

  // == Internal ==================================================================
  private step(step: number): void { this.set(steppedTextSize(this.size, step)); }

  private set(size: number): void {
    if(size === this.size) return/*as it is*/;
    this.show(size);
    this.choose(size);
  }
}
