import { GOOGLE_FONT_FAMILIES, googleFontStack, loadGoogleFont } from './google-fonts';

// shared "Custom..." popovers invoked from the properties-panel dropdowns:
//   `openColorPicker`    -- native color input + optional alpha slider,
//                           live previewed into an rgba() swatch
//   `openSliderPicker`   -- numeric slider with inline numeric input (width,
//                           font size, etc)
//   `openFontPicker`     -- searchable list of curated Google Fonts, streams
//                           the font CSS into the document on selection
// All three are single-instance: opening one auto-closes any other. They
// position themselves with `position: fixed` anchored to the invoking
// dropdown-item so they clear the properties panel just like the host dropdown
// ********************************************************************************
// == Types =======================================================================
export interface PickerAnchor {
  /** DOM rect to anchor the popover next to (typically the dropdown-item that
   *  launched it). The popover lands immediately to the right with a small gap */
  readonly rect: DOMRect;
}

// --------------------------------------------------------------------------------
export interface ColorPickerOptions extends PickerAnchor {
  /** seed color (any CSS color string -- hex, rgb, rgba, "transparent") */
  readonly initial: string;
  /** show the alpha slider + checker preview. Off for stroke / text colors
   *  where alpha isn't part of the mental model; on for background fills
   *  since the built-in presets are all 50%-alpha tints */
  readonly alpha: boolean;
  /** applied live as the user drags the pickers */
  readonly onChange: (color: string) => void;
  /** applied once when the user commits (clicks "Apply" or outside) */
  readonly onCommit: (color: string) => void;
  /** fired if the user cancels -- the caller should revert to `initial` */
  readonly onCancel: () => void;
}

export interface SliderPickerOptions extends PickerAnchor {
  readonly initial: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;/*displayed after the numeric input, eg. "px" or "pt"*/
  readonly onChange: (value: number) => void;
  readonly onCommit: (value: number) => void;
  readonly onCancel: () => void;
}

// --------------------------------------------------------------------------------
export interface FontFamilyChoice {
  readonly label: string;
  readonly family: string;
  readonly googleFont?: string;
}

export interface FontPickerOptions extends PickerAnchor {
  readonly initial: FontFamilyChoice | null;
  readonly onChange: (choice: FontFamilyChoice) => void;
  readonly onCommit: (choice: FontFamilyChoice) => void;
  readonly onCancel: () => void;
}

// == Single-Instance Popover =====================================================
// tracks the currently open popover so a new open() tears down the old one before
// mounting. Closing on Escape / outside-click / blur is wired below
let currentPopover: HTMLElement | null = null;
let currentCleanup: (() => void) | null = null;

// ................................................................................
const closeCurrentPopover = (): void => {
  if(currentCleanup) { try { currentCleanup(); } catch { /*ignore*/ } }
  if(currentPopover && currentPopover.parentElement) currentPopover.parentElement.removeChild(currentPopover);
  currentPopover = null;
  currentCleanup = null;
};

// ................................................................................
/** public: tear down any open picker. Called by the properties-panel when the host
 *  dropdown is dismissed, or by the global blur/hide handlers in main.ts */
export const closeCustomPicker = closeCurrentPopover;

// ................................................................................
// place the popover next to its anchor; if there's no room to the right, flip to
// the left. Vertical offset clamps to the viewport to keep the full body of the
// popover on-screen
const positionPopover = (popover: HTMLElement, anchor: DOMRect): void => {
  popover.style.position = 'fixed';
  popover.style.visibility = 'hidden';
  popover.style.left = '0';
  popover.style.top  = '0';
  popover.style.maxHeight = '';/*reset so the measurement reflects natural size*/
  document.body.appendChild(popover);

  const pw = popover.offsetWidth;
  let ph = popover.offsetHeight;
  const gap = 8;
  const margin = 8;

  // horizontal: prefer right of anchor; flip left if no room
  let left = anchor.right + gap;
  if(left + pw > window.innerWidth - margin) left = Math.max(margin, anchor.left - gap - pw);

  // vertical: prefer aligned-with-anchor; shift up as needed; cap height if
  // still too tall. The popover itself scrolls via a flex-column layout so the
  // inner list shrinks gracefully when capped rather than being clipped
  let top = anchor.top;
  const overflow = (top + ph) - (window.innerHeight - margin);
  if(overflow > 0) {
    top = Math.max(margin, top - overflow);
    const avail = window.innerHeight - top - margin;
    if(ph > avail) {
      popover.style.maxHeight = `${avail}px`;
      ph = avail;
    } /* else -- shift was enough */
  } /* else -- fits as-is */

  popover.style.left = `${left}px`;
  popover.style.top  = `${top}px`;
  popover.style.visibility = '';
};

// == Color Parsing Helpers =======================================================
/** parse any CSS color string into { r, g, b, a } in 0-255 / 0-1. Uses the browser's
 *  canvas color parser so there's no need for a colors library -- handles hex, rgb(),
 *  rgba(), named colors, transparent, and modern space-separated syntax alike */
const parseColor = (input: string): { r: number; g: number; b: number; a: number } => {
  if(!input || (input === 'transparent')) return { r: 255, g: 255, b: 255, a: 0 };
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000';/*reset so a bad value doesn't leak*/
  ctx.fillStyle = input;
  const normalized = ctx.fillStyle as string;/*either #rrggbb or rgba(...)*/

  if(normalized.startsWith('#')) {
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return { r, g, b, a: 1 };
  } /* else -- rgba(...) form */
  const m = normalized.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if(!m) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: parseInt(m[1]),
    g: parseInt(m[2]),
    b: parseInt(m[3]),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
};

// ................................................................................
/** compose back to an rgba() string (or #rrggbb when alpha is 1). Preferring
 *  rgba() over hex for any non-opaque color so the downstream canvas / SVG path
 * receives the right format */
const formatColor = (r: number, g: number, b: number, a: number): string => {
  if(a >= 1) {
    const hex = (n: number): string => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } /* else -- preserve alpha */
  if(a <= 0) return 'transparent';
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
};

// ................................................................................
/** 6-digit hex portion of any color (the format required by `<input type="color">`).
 *  Alpha is dropped */
const toHex = (r: number, g: number, b: number): string => {
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

// == Color Picker ================================================================
export const openColorPicker = (opts: ColorPickerOptions): void => {
  closeCurrentPopover();

  const popover = document.createElement('div');
  popover.className = 'custom-picker color-picker';

  const { r, g, b, a } = parseColor(opts.initial);
  let state = { r, g, b, a: opts.alpha ? a : 1 };
  const initialSnapshot = { ...state };
  let committed = false;

  // -- swatch (live preview with checker backing for alpha -----------------------
  const preview = document.createElement('div');
  preview.className = 'custom-picker-preview';
  const previewInner = document.createElement('div');
  previewInner.className = 'custom-picker-preview-inner';
  preview.appendChild(previewInner);

  // -- native color input --------------------------------------------------------
  const colorRow = document.createElement('label');
  colorRow.className = 'custom-picker-row';
  const colorLabel = document.createElement('span');
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = toHex(state.r, state.g, state.b);
  colorRow.appendChild(colorLabel);
  colorRow.appendChild(colorInput);

  // -- alpha slider (optional) ---------------------------------------------------
  let alphaRow: HTMLElement | null = null;
  let alphaInput: HTMLInputElement | null = null;
  let alphaReadout: HTMLElement | null = null;
  if(opts.alpha) {
    alphaRow = document.createElement('label');
    alphaRow.className = 'custom-picker-row';
    const alphaLabel = document.createElement('span');
    alphaLabel.textContent = 'Opacity';
    alphaInput = document.createElement('input');
    alphaInput.type = 'range';
    alphaInput.min = '0';
    alphaInput.max = '100';
    alphaInput.step = '1';
    alphaInput.value = String(Math.round(state.a * 100));
    alphaReadout = document.createElement('span');
    alphaReadout.className = 'custom-picker-readout';
    alphaReadout.textContent = `${Math.round(state.a * 100)}%`;
    alphaRow.appendChild(alphaLabel);
    alphaRow.appendChild(alphaInput);
    alphaRow.appendChild(alphaReadout);
  } /* else -- no alpha row */

  // -- buttons -------------------------------------------------------------------
  const buttons = document.createElement('div');
  buttons.className = 'custom-picker-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'custom-picker-btn';
  cancelBtn.textContent = 'Cancel';
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'custom-picker-btn primary';
  applyBtn.textContent = 'Apply';
  buttons.appendChild(cancelBtn);
  buttons.appendChild(applyBtn);

  popover.appendChild(preview);
  popover.appendChild(colorRow);
  if(alphaRow) popover.appendChild(alphaRow);
  popover.appendChild(buttons);

  // -- live update helper --------------------------------------------------------
  const render = (): void => {
    previewInner.style.background = formatColor(state.r, state.g, state.b, state.a);
    opts.onChange(formatColor(state.r, state.g, state.b, state.a));
  };

  colorInput.addEventListener('input', () => {
    const parsed = parseColor(colorInput.value);
    state = { r: parsed.r, g: parsed.g, b: parsed.b, a: state.a };
    render();
  });
  if(alphaInput && alphaReadout) {
    alphaInput.addEventListener('input', () => {
      const v = parseInt(alphaInput!.value, 10) / 100;
      state = { ...state, a: Number.isFinite(v) ? v : 1 };
      alphaReadout!.textContent = `${Math.round(state.a * 100)}%`;
      render();
    });
  } /* else -- no alpha control to wire */

  cancelBtn.addEventListener('click', () => {
    opts.onCancel();
    state = { ...initialSnapshot };/*revert in case onCancel doesn't*/
    closeCurrentPopover();
  });
  applyBtn.addEventListener('click', () => {
    committed = true;
    opts.onCommit(formatColor(state.r, state.g, state.b, state.a));
    closeCurrentPopover();
  });

  positionPopover(popover, opts.rect);
  currentPopover = popover;
  render();/*paint initial preview*/

  // cleanup registers an onblur/escape revert so any live-preview changes get
  // undone if the user dismisses without committing. outside-click is handled
  // globally below
  currentCleanup = () => {
    if(!committed) opts.onCancel();
  };

  installGlobalDismiss(popover);
  // focus the color input so keyboard users can tab straight into the alpha
  // slider and Apply button
  setTimeout(() => colorInput.focus(), 0);
};

// == Slider Picker ===============================================================
export const openSliderPicker = (opts: SliderPickerOptions): void => {
  closeCurrentPopover();

  const popover = document.createElement('div');
  popover.className = 'custom-picker slider-picker';

  let value = opts.initial;
  const initialSnapshot = value;
  let committed = false;

  const row = document.createElement('div');
  row.className = 'custom-picker-row';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(opts.min);
  slider.max = String(opts.max);
  slider.step = String(opts.step);
  slider.value = String(value);
  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.min = String(opts.min);
  numberInput.max = String(opts.max);
  numberInput.step = String(opts.step);
  numberInput.value = String(value);
  numberInput.className = 'custom-picker-number';
  const unit = document.createElement('span');
  unit.className = 'custom-picker-unit';
  unit.textContent = opts.unit;
  row.appendChild(slider);
  row.appendChild(numberInput);
  row.appendChild(unit);

  const buttons = document.createElement('div');
  buttons.className = 'custom-picker-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'custom-picker-btn';
  cancelBtn.textContent = 'Cancel';
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'custom-picker-btn primary';
  applyBtn.textContent = 'Apply';
  buttons.appendChild(cancelBtn);
  buttons.appendChild(applyBtn);

  popover.appendChild(row);
  popover.appendChild(buttons);

  const syncFrom = (v: number): void => {
    const clamped = Math.max(opts.min, Math.min(opts.max, v));
    value = clamped;
    slider.value = String(clamped);
    numberInput.value = String(clamped);
    opts.onChange(clamped);
  };

  slider.addEventListener('input', () => syncFrom(parseFloat(slider.value)));
  numberInput.addEventListener('input', () => {
    const v = parseFloat(numberInput.value);
    if(!Number.isFinite(v)) return;/*ignore partial typing like "-" or ""*/
    syncFrom(v);
  });

  cancelBtn.addEventListener('click', () => {
    opts.onCancel();
    value = initialSnapshot;
    closeCurrentPopover();
  });
  applyBtn.addEventListener('click', () => {
    committed = true;
    opts.onCommit(value);
    closeCurrentPopover();
  });

  positionPopover(popover, opts.rect);
  currentPopover = popover;
  currentCleanup = () => { if(!committed) opts.onCancel(); };

  installGlobalDismiss(popover);
  setTimeout(() => numberInput.focus(), 0);
};

// == Font Picker =================================================================
export const openFontPicker = (opts: FontPickerOptions): void => {
  closeCurrentPopover();

  const popover = document.createElement('div');
  popover.className = 'custom-picker font-picker';

  const initialSnapshot = opts.initial;
  let committed = false;
  let currentChoice: FontFamilyChoice | null = opts.initial;

  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Search Google Fonts...';
  search.className = 'custom-picker-search';

  const list = document.createElement('div');
  list.className = 'custom-picker-font-list';

  const hint = document.createElement('div');
  hint.className = 'custom-picker-hint';
  hint.textContent = 'Hover to preview. Click to apply.';

  popover.appendChild(search);
  popover.appendChild(list);
  popover.appendChild(hint);

  // renders (or re-renders) the visible list after a search-term change
  const renderList = (filter: string): void => {
    const needle = filter.trim().toLowerCase();
    list.innerHTML = '';
    for(const family of GOOGLE_FONT_FAMILIES) {
      if(needle && !family.toLowerCase().includes(needle)) continue;
      const row = document.createElement('div');
      row.className = 'custom-picker-font-row';

      const preview = document.createElement('span');
      preview.textContent = family;
      // set a family-specific stack so each row previews in its own face once
      // the stylesheet loads; until then the fallback `system-ui` holds place
      preview.style.fontFamily = googleFontStack(family);
      row.appendChild(preview);

      // hover: kick off the lazy load so the preview glyphs swap in without
      // the user committing to the font. cheap -- loadGoogleFont dedupes
      row.addEventListener('mouseenter', () => { void loadGoogleFont(family); });

      row.addEventListener('click', async () => {
        await loadGoogleFont(family);/*wait so onChange callers see correct metrics*/
        const choice: FontFamilyChoice = {
          label: family,
          family: googleFontStack(family),
          googleFont: family,
        };
        currentChoice = choice;
        opts.onChange(choice);
      });

      list.appendChild(row);
    }
    if(!list.firstChild) {
      const empty = document.createElement('div');
      empty.className = 'custom-picker-hint';
      empty.textContent = 'No fonts match.';
      list.appendChild(empty);
    } /* else -- list has entries */
  };

  const buttons = document.createElement('div');
  buttons.className = 'custom-picker-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'custom-picker-btn';
  cancelBtn.textContent = 'Cancel';
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'custom-picker-btn primary';
  applyBtn.textContent = 'Apply';
  buttons.appendChild(cancelBtn);
  buttons.appendChild(applyBtn);
  popover.appendChild(buttons);

  search.addEventListener('input', () => renderList(search.value));
  cancelBtn.addEventListener('click', () => {
    opts.onCancel();
    currentChoice = initialSnapshot;
    closeCurrentPopover();
  });
  applyBtn.addEventListener('click', () => {
    if(!currentChoice) { closeCurrentPopover(); return; }/*nothing to apply*/
    committed = true;
    opts.onCommit(currentChoice);
    closeCurrentPopover();
  });

  positionPopover(popover, opts.rect);
  currentPopover = popover;
  currentCleanup = () => { if(!committed) opts.onCancel(); };

  installGlobalDismiss(popover);
  renderList('');
  setTimeout(() => search.focus(), 0);
};

// == Global Dismiss Wiring =======================================================
// every popover gets the same outside-click + Escape dismissal. listeners are
// added on first open and removed via the popover's cleanup when it closes
const installGlobalDismiss = (popover: HTMLElement): void => {
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if(popover.contains(target)) return;/*inside the picker, leave it alone*/
    // the host dropdown-item that spawned the picker should not dismiss it
    // either -- the properties-panel closes its dropdowns explicitly when the
    // picker applies/cancels
    if((e.target as HTMLElement)?.closest('.dropdown, .action-dropdown')) return;
    closeCurrentPopover();
  };
  const onKey = (e: KeyboardEvent) => {
    if(e.key === 'Escape') closeCurrentPopover();
  };
  document.addEventListener('mousedown', onDocClick, true);
  document.addEventListener('keydown', onKey, true);

  // chain this removal onto the existing cleanup (which handles the
  // not-yet-committed revert). closeCurrentPopover runs the composite once
  const priorCleanup = currentCleanup;
  currentCleanup = () => {
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    if(priorCleanup) priorCleanup();
  };
};
