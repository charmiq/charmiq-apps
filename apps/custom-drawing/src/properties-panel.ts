import { ConfigStore, type DrawingPresets, type DrawingRecents } from './config-store';
import { closeCustomPicker, openColorPicker, openFontPicker, openSliderPicker } from './custom-picker';
import type { DrawingElement } from './element-model';
import type { SelectionManager } from './selection-manager';
import { DEFAULT_FONT_FAMILY, type SvgRenderer } from './svg-renderer';

// properties panel — dropdowns for stroke, fill, width, style, text, decorations
// All color / width / font-size / font-family dropdowns are rendered from
// `configStore.presets` (+ session `recents` + a trailing "Custom..." row)
// rather than static HTML, so the settings panel can curate palettes and
// recents / custom picks promote seamlessly into presets via the pin action
// ********************************************************************************
// == Types =======================================================================
/** describes one of the property lists backed by presets. keeps the render code
 *  generic across color / width / font-size / font-family rows */
interface ListDef {
  /** property key used on the element (passed to updateProperty). `fill` for
   *  backgrounds, `stroke` / `textColor` for colors, etc */
  readonly elementProp: string;
  /** which preset list to read from */
  readonly presetKey: keyof DrawingPresets;
  /** which recents list to read from / push into */
  readonly recentKey: keyof DrawingRecents;
}

// == PropertiesPanel =============================================================
export class PropertiesPanel {
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;
  private readonly configStore: ConfigStore;

  elements: DrawingElement[] = [];
  onSave: (() => void) | null = null;

  public constructor(renderer: SvgRenderer, selection: SelectionManager, configStore: ConfigStore) {
    this.renderer = renderer;
    this.selection = selection;
    this.configStore = configStore;
  }

  // == Setup =====================================================================
  public setup(): void {
    this.renderAllDropdowns();

    // wire the property buttons -- these open their dropdowns. the dropdown
    // contents themselves are re-rendered whenever config changes
    document.getElementById('strokeColorBtn')!.addEventListener('click',     () => this.toggleDropdown('strokeColorDropdown'));
    document.getElementById('backgroundColorBtn')!.addEventListener('click', () => this.toggleDropdown('backgroundColorDropdown'));
    document.getElementById('textColorBtn')!.addEventListener('click',       () => this.toggleDropdown('textColorDropdown'));
    document.getElementById('strokeWidthBtn')!.addEventListener('click',     () => this.toggleDropdown('strokeWidthDropdown'));
    document.getElementById('strokeStyleBtn')!.addEventListener('click',     () => this.toggleDropdown('strokeStyleDropdown'));
    document.getElementById('textSizeBtn')!.addEventListener('click',        () => this.toggleDropdown('textSizeDropdown'));
    document.getElementById('fontFamilyBtn')?.addEventListener('click',      () => this.toggleDropdown('fontFamilyDropdown'));

    this.setupStyleDropdown();
    this.setupTextAlignDropdown();
    this.setupDecorationDropdowns();
    this.setupLayerButtons();
    this.setupActionButtons();

    // re-render preset-driven dropdowns whenever config changes (settings
    // panel edits, pin-to-preset, etc)
    this.configStore.onChange(() => this.renderAllDropdowns());

    // close dropdowns on outside click
    document.addEventListener('click', (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if(!t.closest('.prop-group') && !t.closest('.dropdown, .action-dropdown') && !t.closest('.custom-picker') && !t.closest('#saveBtn, #generateBtn, #imageBtn')) {
        this.hideAllDropdowns();
      }
    });

    // close dropdowns when the panel scrolls — the fly-out uses position:fixed
    // anchored at open-time, so it would otherwise drift from its button
    document.getElementById('propertiesPanel')?.addEventListener('scroll', () => this.hideAllDropdowns());
  }

  // == Show / Hide ===============================================================
  // -- Show ----------------------------------------------------------------------
  public show(): void {
    const panel = document.getElementById('propertiesPanel')!;
    const sel = this.selection.selectedElements;
    if(sel.length < 1) { panel.classList.remove('visible'); return; }

    panel.classList.add('visible');

    const hasShapes = sel.some(e => ['rectangle', 'diamond', 'ellipse', 'line'].includes(e.type));
    const hasText = sel.some(e => e.type === 'text');
    const hasLines = sel.some(e => e.type === 'line');

    this.setVisible('strokeColorGroup', hasShapes);
    this.setVisible('backgroundColorGroup', hasShapes && !sel.some(e => e.type === 'line'));
    this.setVisible('strokeWidthGroup', hasShapes);
    this.setVisible('strokeStyleGroup', hasShapes);
    this.setVisible('textSizeGroup', hasText);
    this.setVisible('textColorGroup', hasText);
    this.setVisible('fontFamilyGroup', hasText);
    this.setVisible('textAlignGroup', hasText);
    this.setVisible('decorationGroup', hasLines);

    // update current values
    if(sel.length === 1) {
      const el = sel[0] as any;
      if(hasShapes) {
        this.setSwatchColor('strokeColorSwatch', el.stroke || '#000000');
        this.setSwatchColor('backgroundColorSwatch', el.fill === 'transparent' || !el.fill ? 'transparent' : el.fill);
        this.setWidthSample(el.strokeWidth);
        this.setStyleSample(el.strokeDasharray, el.strokeWidth);
      } /* else -- no shapes */
      if(hasText) {
        this.setTextSizeSample(el.fontSize);
        this.setSwatchColor('textColorSwatch', el.textColor || el.fill || '#000000');
        this.setAlignIcon(el.textAlign || 'left');
        this.setFontFamilySample(el.fontFamily || DEFAULT_FONT_FAMILY);
      } /* else -- no text */
      if(hasLines) {
        this.updateDecorationIcon('startDecorationIcon', el.startDecoration || 'none');
        this.updateDecorationIcon('endDecorationIcon', el.endDecoration || 'none');
      } /* else -- no lines */
    } /* else -- multiple elements */

    // group / ungroup buttons
    const gids = new Set(sel.filter(e => e.groupId).map(e => e.groupId!));
    const allSame = gids.size === 1 && sel.every(e => e.groupId === [...gids][0]);
    document.getElementById('groupBtn')!.style.display = (sel.length > 1 && !allSame) ? 'flex' : 'none';
    document.getElementById('ungroupBtn')!.style.display = sel.some(e => e.groupId) ? 'flex' : 'none';
  }

  // == Update Property ===========================================================
  public updateProperty(prop: string, value: any): void {
    for(const el of this.selection.selectedElements) {
      const e = el as any;
      if(el.type === 'text') {
        if((prop === 'stroke') || (prop === 'textColor')) e.fill = value;
        else if((prop === 'fill') || (prop === 'strokeWidth') || (prop === 'strokeDasharray')) continue;
        else e[prop] = value;
      } else {
        if((prop === 'textColor') || (prop === 'fontFamily') || (prop === 'fontSize')) continue;
        e[prop] = value;
      }

      // scale dash array when stroke width changes
      if((prop === 'strokeWidth') && e.strokeDasharray && (e.strokeDasharray !== 'none')) {
        const style = this.dashStyle(e.strokeDasharray);
        if(style !== 'solid') e.strokeDasharray = this.dashArray(style, value);
      } /* else -- not stroke width change */

      const idx = this.elements.findIndex(x => x.id === el.id);
      if(idx >= 0) this.elements[idx] = { ...el } as DrawingElement;
      this.renderer.renderElement(el);
    }
    this.onSave?.();
  }

  // == Layer Ordering ============================================================
  public moveLayer(dir: 'toBack' | 'backward' | 'forward' | 'toFront'): void {
    for(const el of this.selection.selectedElements) {
      const idx = this.elements.findIndex(e => e.id === el.id);
      if(idx === -1) continue;
      this.elements.splice(idx, 1);
      let ni: number;
      switch (dir) {
        case 'toBack': ni = 0; break;
        case 'backward': ni = Math.max(0, idx - 1); break;
        case 'forward': ni = Math.min(this.elements.length, idx + 1); break;
        case 'toFront': ni = this.elements.length; break;
      }
      this.elements.splice(ni, 0, el);
    }
    this.renderer.rerenderAll(this.elements);
    this.selection.showSelectionHandles();
    this.onSave?.();
  }

  public hideAllDropdowns(): void {
    document.querySelectorAll('.dropdown, .action-dropdown').forEach(d => d.classList.remove('visible'));
    closeCustomPicker();
  }

  // == Preset-driven Dropdown Rendering ==========================================
  private renderAllDropdowns(): void {
    this.renderColorDropdown('strokeColorDropdown',     'strokeColorSwatch',     'stroke',      { elementProp: 'stroke',    presetKey: 'strokeColors',     recentKey: 'strokeColors' });
    this.renderColorDropdown('backgroundColorDropdown', 'backgroundColorSwatch', 'fill',        { elementProp: 'fill',      presetKey: 'backgroundColors', recentKey: 'backgroundColors' }, { alpha: true });
    this.renderColorDropdown('textColorDropdown',       'textColorSwatch',       'textColor',   { elementProp: 'textColor', presetKey: 'textColors',       recentKey: 'textColors' });
    this.renderWidthDropdown();
    this.renderFontSizeDropdown();
    this.renderFontFamilyDropdown();
  }

  // -- Color Dropdown (preset + recents + custom) --------------------------------
  private renderColorDropdown(
    ddId: string,
    swatchId: string,
    prop: string,
    def: ListDef,
    opts: { alpha?: boolean } = {},
  ): void {
    const dd = document.getElementById(ddId);
    if(!dd) return;/*group not in DOM*/
    dd.innerHTML = '';

    const cfg = this.configStore.getConfig();
    const presets = cfg.presets[def.presetKey] as ReadonlyArray<string>;
    const recents = cfg.recents[def.recentKey] as ReadonlyArray<string>;

    // section: presets
    const presetSection = document.createElement('div');
    presetSection.className = 'dropdown-swatch-grid';
    for(const color of presets) presetSection.appendChild(this.buildColorSwatch(color, () => {
      this.updateProperty(prop, color);
      this.setSwatchColor(swatchId, color);
      this.hideAllDropdowns();
    }));
    dd.appendChild(presetSection);

    // section: recents (only when non-empty)
    if(recents.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      divider.textContent = 'Recent';
      dd.appendChild(divider);

      const recentsSection = document.createElement('div');
      recentsSection.className = 'dropdown-swatch-grid';
      for(const color of recents) {
        const item = this.buildColorSwatch(color, () => {
          this.updateProperty(prop, color);
          this.setSwatchColor(swatchId, color);
          this.hideAllDropdowns();
        });
        // pin button promotes this recent into the preset list
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'dropdown-pin';
        pin.title = 'Pin to presets';
        pin.textContent = '\u{1F4CC}';/*pushpin emoji*/
        pin.addEventListener('click', (e) => {
          e.stopPropagation();/*don't apply the color*/
          void this.configStore.pinToPreset(def.presetKey, color as any);
        });
        item.appendChild(pin);
        recentsSection.appendChild(item);
      }
      dd.appendChild(recentsSection);
    } /* else -- no recents to show */

    // custom row
    const custom = this.buildCustomRow('Custom…', (anchor) => {
      const currentEl = this.selection.selectedElements[0] as any;
      const initial = (currentEl && (prop === 'textColor' ? (currentEl.fill || currentEl.textColor) : currentEl[prop])) || (presets[0] || '#000000');
      openColorPicker({
        rect: anchor,
        initial,
        alpha: !!opts.alpha,
        onChange: (c) => { this.updateProperty(prop, c); this.setSwatchColor(swatchId, c); },
        onCommit: (c) => {
          this.updateProperty(prop, c);
          this.setSwatchColor(swatchId, c);
          void this.configStore.pushRecent(def.recentKey, c as any);
          this.hideAllDropdowns();
        },
        onCancel: () => { this.updateProperty(prop, initial); this.setSwatchColor(swatchId, initial); },
      });
    });
    dd.appendChild(custom);
  }

  // -- Width Dropdown ------------------------------------------------------------
  private renderWidthDropdown(): void {
    const dd = document.getElementById('strokeWidthDropdown');
    if(!dd) return;
    dd.innerHTML = '';

    const cfg = this.configStore.getConfig();
    const presets = cfg.presets.strokeWidths;
    const recents = cfg.recents.strokeWidths;

    for(const w of presets) dd.appendChild(this.buildWidthRow(w, false));
    if(recents.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      divider.textContent = 'Recent';
      dd.appendChild(divider);
      for(const w of recents) dd.appendChild(this.buildWidthRow(w, true));
    } /* else -- no recents */

    const custom = this.buildCustomRow('Custom…', (anchor) => {
      const currentEl = this.selection.selectedElements[0] as any;
      const initial = currentEl?.strokeWidth || presets[0] || 2;
      openSliderPicker({
        rect: anchor,
        initial, min: 1, max: 24, step: 1, unit: 'px',
        onChange: (v) => { this.updateProperty('strokeWidth', v); this.setWidthSample(v); },
        onCommit: (v) => {
          this.updateProperty('strokeWidth', v);
          this.setWidthSample(v);
          void this.configStore.pushRecent('strokeWidths', v);
          this.hideAllDropdowns();
        },
        onCancel: () => { this.updateProperty('strokeWidth', initial); this.setWidthSample(initial); },
      });
    });
    dd.appendChild(custom);
  }

  private buildWidthRow(w: number, pinnable: boolean): HTMLElement {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    const sample = document.createElement('div');
    sample.className = 'stroke-width-sample';
    sample.style.height = `${Math.max(1, Math.min(8, w))}px`;
    const label = document.createElement('span');
    label.textContent = `${w}px`;
    item.appendChild(sample);
    item.appendChild(label);
    item.addEventListener('click', () => {
      this.updateProperty('strokeWidth', w);
      this.setWidthSample(w);
      this.hideAllDropdowns();
    });
    if(pinnable) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'dropdown-pin';
      pin.title = 'Pin to presets';
      pin.textContent = '\u{1F4CC}';
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.configStore.pinToPreset('strokeWidths', w);
      });
      item.appendChild(pin);
    } /* else -- preset row */
    return item;
  }

  // -- Font Size Dropdown --------------------------------------------------------
  private renderFontSizeDropdown(): void {
    const dd = document.getElementById('textSizeDropdown');
    if(!dd) return;
    dd.innerHTML = '';

    const cfg = this.configStore.getConfig();
    const presets = cfg.presets.fontSizes;
    const recents = cfg.recents.fontSizes;

    for(const size of presets) dd.appendChild(this.buildFontSizeRow(size, false));
    if(recents.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      divider.textContent = 'Recent';
      dd.appendChild(divider);
      for(const size of recents) dd.appendChild(this.buildFontSizeRow(size, true));
    } /* else -- no recents */

    const custom = this.buildCustomRow('Custom…', (anchor) => {
      const currentEl = this.selection.selectedElements[0] as any;
      const initial = currentEl?.fontSize || presets[0] || 16;
      openSliderPicker({
        rect: anchor,
        initial, min: 6, max: 144, step: 1, unit: 'pt',
        onChange: (v) => { this.updateProperty('fontSize', v); this.setTextSizeSample(v); },
        onCommit: (v) => {
          this.updateProperty('fontSize', v);
          this.setTextSizeSample(v);
          void this.configStore.pushRecent('fontSizes', v);
          this.hideAllDropdowns();
        },
        onCancel: () => { this.updateProperty('fontSize', initial); this.setTextSizeSample(initial); },
      });
    });
    dd.appendChild(custom);
  }

  private buildFontSizeRow(size: number, pinnable: boolean): HTMLElement {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    const sample = document.createElement('span');
    sample.className = 'text-size-sample';
    sample.style.fontSize = `${Math.min(28, size)}px`;
    sample.textContent = 'A';
    const label = document.createElement('span');
    label.textContent = `${size}pt`;
    item.appendChild(sample);
    item.appendChild(label);
    item.addEventListener('click', () => {
      this.updateProperty('fontSize', size);
      this.setTextSizeSample(size);
      this.hideAllDropdowns();
    });
    if(pinnable) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'dropdown-pin';
      pin.title = 'Pin to presets';
      pin.textContent = '\u{1F4CC}';
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.configStore.pinToPreset('fontSizes', size);
      });
      item.appendChild(pin);
    } /* else -- preset row */
    return item;
  }

  // -- Font Family Dropdown ------------------------------------------------------
  private renderFontFamilyDropdown(): void {
    const dd = document.getElementById('fontFamilyDropdown');
    if(!dd) return;/*group not in DOM (eg. older HTML)*/
    dd.innerHTML = '';

    const cfg = this.configStore.getConfig();
    const presets = cfg.presets.fontFamilies;
    const recents = cfg.recents.fontFamilies;

    for(const f of presets) dd.appendChild(this.buildFontFamilyRow(f, false));
    if(recents.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      divider.textContent = 'Recent';
      dd.appendChild(divider);
      for(const f of recents) dd.appendChild(this.buildFontFamilyRow(f, true));
    } /* else -- no recents */

    const custom = this.buildCustomRow('Google Fonts…', (anchor) => {
      const currentEl = this.selection.selectedElements[0] as any;
      const initialFamily = currentEl?.fontFamily || null;
      openFontPicker({
        rect: anchor,
        initial: initialFamily ? { label: 'Current', family: initialFamily } : null,
        onChange: (c) => { this.updateProperty('fontFamily', c.family); this.setFontFamilySample(c.family); },
        onCommit: (c) => {
          this.updateProperty('fontFamily', c.family);
          this.setFontFamilySample(c.family);
          void this.configStore.pushRecent('fontFamilies', c);
          this.hideAllDropdowns();
        },
        onCancel: () => {
          const revert = initialFamily || DEFAULT_FONT_FAMILY;
          this.updateProperty('fontFamily', revert);
          this.setFontFamilySample(revert);
        },
      });
    });
    dd.appendChild(custom);
  }

  private buildFontFamilyRow(f: { label: string; family: string; googleFont?: string }, pinnable: boolean): HTMLElement {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    const sample = document.createElement('span');
    sample.style.fontFamily = f.family;
    sample.style.fontSize = '16px';
    sample.textContent = f.label;
    item.appendChild(sample);
    item.addEventListener('click', () => {
      this.updateProperty('fontFamily', f.family);
      this.setFontFamilySample(f.family);
      this.hideAllDropdowns();
    });
    if(pinnable) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'dropdown-pin';
      pin.title = 'Pin to presets';
      pin.textContent = '\u{1F4CC}';
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.configStore.pinToPreset('fontFamilies', f);
      });
      item.appendChild(pin);
    } /* else -- preset row */
    return item;
  }

  // -- Shared Builders -----------------------------------------------------------
  private buildColorSwatch(color: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'dropdown-swatch';
    item.title = color;
    const sw = document.createElement('div');
    sw.className = 'color-swatch';
    sw.style.background = color;
    if((color === 'transparent') || color.includes('rgba')) sw.style.border = '1px solid #ccc';
    item.appendChild(sw);
    item.addEventListener('click', onClick);
    return item;
  }

  private buildCustomRow(label: string, onOpen: (anchor: DOMRect) => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'dropdown-item dropdown-item-custom';
    const icon = document.createElement('span');
    icon.className = 'dropdown-custom-icon';
    icon.textContent = '\u{2795}';/*heavy plus sign -- unambiguous without depending on an icon font*/
    const text = document.createElement('span');
    text.textContent = label;
    item.appendChild(icon);
    item.appendChild(text);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = (item.getBoundingClientRect as any).call(item) as DOMRect;
      onOpen(rect);
    });
    return item;
  }

  // == Non-preset Dropdowns (style / align / decoration) =========================
  // -- Stroke Style Dropdown -----------------------------------------------------
  private setupStyleDropdown(): void {
    document.getElementById('strokeStyleDropdown')!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        const style = item.dataset.style!;
        const sw = (this.selection.selectedElements[0] as any)?.strokeWidth || 2;
        this.updateProperty('strokeDasharray', this.dashArray(style, sw));
        const sample = document.getElementById('strokeStyleSample')!;
        sample.className = 'stroke-style-sample ' + style;
        this.hideAllDropdowns();
      }
    });
  }

  // -- Text Align Dropdown -------------------------------------------------------
  private setupTextAlignDropdown(): void {
    document.getElementById('textAlignBtn')!.addEventListener('click', () => this.toggleDropdown('textAlignDropdown'));
    document.getElementById('textAlignDropdown')!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        const align = item.dataset.align!;
        this.updateProperty('textAlign', align);
        this.setAlignIcon(align);
        this.hideAllDropdowns();
      }
    });
  }

  // -- Decoration Dropdowns ------------------------------------------------------
  private setupDecorationDropdowns(): void {
    document.getElementById('startDecorationBtn')!.addEventListener('click', () => this.toggleDropdown('startDecorationDropdown'));
    document.getElementById('startDecorationDropdown')!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        this.updateProperty('startDecoration', item.dataset.decoration!);
        this.updateDecorationIcon('startDecorationIcon', item.dataset.decoration!);
        this.hideAllDropdowns();
      }
    });
    document.getElementById('endDecorationBtn')!.addEventListener('click', () => this.toggleDropdown('endDecorationDropdown'));
    document.getElementById('endDecorationDropdown')!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        this.updateProperty('endDecoration', item.dataset.decoration!);
        this.updateDecorationIcon('endDecorationIcon', item.dataset.decoration!);
        this.hideAllDropdowns();
      }
    });
  }

  // -- Layer Ordering Buttons ----------------------------------------------------
  private setupLayerButtons(): void {
    document.getElementById('sendToBackBtn')!.addEventListener('click', () => this.moveLayer('toBack'));
    document.getElementById('sendBackwardBtn')!.addEventListener('click', () => this.moveLayer('backward'));
    document.getElementById('bringForwardBtn')!.addEventListener('click', () => this.moveLayer('forward'));
    document.getElementById('bringToFrontBtn')!.addEventListener('click', () => this.moveLayer('toFront'));
  }

  // -- Action Buttons ------------------------------------------------------------
  private setupActionButtons(): void {
    // group, ungroup, copy, delete are wired in main.ts
  }

  // ==============================================================================
  // dropdowns fly out using position:fixed so they escape the panel's scrolling
  // container (the panel itself must clip overflow to scroll vertically, which
  // would otherwise clip horizontally-escaping dropdowns too)
  private toggleDropdown(ddId: string): void {
    const dd = document.getElementById(ddId)!;
    const was = dd.classList.contains('visible');
    this.hideAllDropdowns();
    if(!was) {
      const group = dd.closest('.prop-group') as HTMLElement | null;
      const anchor = group?.getBoundingClientRect();
      const panel = document.getElementById('propertiesPanel')?.getBoundingClientRect();
      if(anchor && panel) {
        dd.style.position = 'fixed';
        dd.style.left = `${panel.right + 8}px`;
        dd.style.top = `${anchor.top}px`;
      } /* else -- let CSS fallback position it */
      dd.classList.add('visible');
    } /* else -- was already open; hideAllDropdowns closed it */
  }

  // ------------------------------------------------------------------------------
  private setVisible(id: string, v: boolean): void {
    const el = document.getElementById(id);
    if(el) el.style.display = v ? 'flex' : 'none';
  }

  // ------------------------------------------------------------------------------
  private setSwatchColor(id: string, color: string): void {
    const s = document.getElementById(id)! as HTMLElement;
    s.style.backgroundColor = color;
    if((color === 'transparent') || color.includes('rgba')) s.style.border = '1px solid #ccc';
    else s.style.border = '';
  }

  // ------------------------------------------------------------------------------
  private setWidthSample(w: number): void {
    const s = document.getElementById('strokeWidthSample')!;
    s.className = 'stroke-width-sample';
    s.style.height = `${Math.max(1, Math.min(8, w))}px`;
  }

  private setStyleSample(dash: string | undefined, _sw: number): void {
    const s = document.getElementById('strokeStyleSample')!;
    s.className = 'stroke-style-sample';
    const style = this.dashStyle(dash);
    if(style !== 'solid') s.classList.add(style);
  }

  // ------------------------------------------------------------------------------
  private setTextSizeSample(size: number): void {
    const s = document.getElementById('textSizeSample')!;
    s.className = 'text-size-sample';
    s.style.fontSize = `${Math.min(28, size)}px`;
  }

  private setFontFamilySample(family: string): void {
    const s = document.getElementById('fontFamilySample');
    if(!s) return;/*group not in DOM*/
    s.style.fontFamily = family;
  }

  // ------------------------------------------------------------------------------
  private setAlignIcon(align: string): void {
    const icon = document.getElementById('textAlignIcon')!;
    if(align === 'left') icon.innerHTML = '<path d="M21 6H3M15 12H3M17 18H3"/>';
    else if(align === 'center') icon.innerHTML = '<path d="M18 6H6M21 12H3M18 18H6"/>';
    else icon.innerHTML = '<path d="M21 6H3M21 12H9M21 18H7"/>';
  }

  private updateDecorationIcon(iconId: string, decoration: string): void {
    const icon = document.getElementById(iconId);
    if(!icon) return;
    const icons: Record<string, string> = {
      none:              '<g stroke="currentColor" opacity="0.3" stroke-width="2"><path d="M12 12l9 0"></path><path d="M3 9l6 6"></path><path d="M3 15l6 -6"></path></g>',
      arrow:             '<g stroke="currentColor" stroke-width="2" fill="none"><path d="M34 10H6M34 10L27 5M34 10L27 15"></path><path d="M27.5 5L34.5 10L27.5 15"></path></g>',
      'triangle-filled': '<g stroke="currentColor" fill="currentColor"><path d="M32 10L6 10" stroke-width="2"></path><path d="M27.5 5.5L34.5 10L27.5 14.5L27.5 5.5"></path></g>',
      'triangle-outline':'<g stroke="currentColor" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M6,9.5H27"></path><path d="M27,5L34,10L27,14Z" fill="none"></path></g>',
    };
    icon.innerHTML = icons[decoration] || icons.none;
    icon.setAttribute('viewBox', decoration === 'none' ? '0 0 24 24' : '0 0 40 20');
  }

  // ------------------------------------------------------------------------------
  private dashArray(style: string, sw: number): string {
    if(style === 'dashed') return `${6 * sw},${3 * sw}`;
    if(style === 'dotted') return `${2 * sw},${2 * sw}`;
    return 'none';
  }

  private dashStyle(dash: string | undefined): string {
    if(!dash || (dash === 'none')) return 'solid';
    const parts = dash.split(',').map(p => parseFloat(p.trim()));
    if(parts.length < 2) return 'solid';
    return Math.abs(parts[0] - parts[1]) < 0.1 ? 'dotted' : 'dashed';
  }
}

