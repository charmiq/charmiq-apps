import type { DrawingElement } from './element-model';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';

// properties panel — dropdowns for stroke, fill, width, style, text, decorations
// ********************************************************************************
// == PropertiesPanel =============================================================
export class PropertiesPanel {
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;

  elements: DrawingElement[] = [];
  onSave: (() => void) | null = null;

  public constructor(renderer: SvgRenderer, selection: SelectionManager) {
    this.renderer = renderer;
    this.selection = selection;
  }

  // == Setup =====================================================================
  public setup(): void {
    this.setupColorDropdown('strokeColorBtn', 'strokeColorDropdown', 'strokeColorSwatch', 'stroke');
    this.setupColorDropdown('backgroundColorBtn', 'backgroundColorDropdown', 'backgroundColorSwatch', 'fill');
    this.setupColorDropdown('textColorBtn', 'textColorDropdown', 'textColorSwatch', 'textColor');
    this.setupWidthDropdown();
    this.setupStyleDropdown();
    this.setupTextSizeDropdown();
    this.setupTextAlignDropdown();
    this.setupDecorationDropdowns();
    this.setupLayerButtons();
    this.setupActionButtons();

    // close dropdowns on outside click
    document.addEventListener('click', (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if(!t.closest('.prop-group') && !t.closest('.dropdown, .action-dropdown') && !t.closest('#saveBtn, #generateBtn, #imageBtn')) {
        this.hideAllDropdowns();
      }
    });
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
        if(prop === 'textColor') continue;
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
  }

  // == Util ======================================================================
  // -- Color Dropdowns -----------------------------------------------------------
  private setupColorDropdown(btnId: string, ddId: string, swatchId: string, prop: string): void {
    document.getElementById(btnId)!.addEventListener('click', () => this.toggleDropdown(ddId));
    document.getElementById(ddId)!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        const color = item.dataset.color!;
        this.updateProperty(prop, color);
        this.setSwatchColor(swatchId, color);
        this.hideAllDropdowns();
      }
    });
  }

  // -- Stroke Width Dropdown -----------------------------------------------------
  private setupWidthDropdown(): void {
    document.getElementById('strokeWidthBtn')!.addEventListener('click', () => this.toggleDropdown('strokeWidthDropdown'));
    document.getElementById('strokeWidthDropdown')!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        const w = parseInt(item.dataset.width!);
        this.updateProperty('strokeWidth', w);
        this.setWidthSample(w);
        this.hideAllDropdowns();
      }
    });
  }

  // -- Stroke Style Dropdown -----------------------------------------------------
  private setupStyleDropdown(): void {
    document.getElementById('strokeStyleBtn')!.addEventListener('click', () => this.toggleDropdown('strokeStyleDropdown'));
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

  // -- Text Size Dropdown --------------------------------------------------------
  private setupTextSizeDropdown(): void {
    document.getElementById('textSizeBtn')!.addEventListener('click', () => this.toggleDropdown('textSizeDropdown'));
    document.getElementById('textSizeDropdown')!.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement | null;
      if(item) {
        const size = parseInt(item.dataset.size!);
        this.updateProperty('fontSize', size);
        this.setTextSizeSample(size);
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
  private toggleDropdown(ddId: string): void {
    const dd = document.getElementById(ddId)!;
    const was = dd.classList.contains('visible');
    this.hideAllDropdowns();
    if(!was) dd.classList.add('visible');
  }

  private setVisible(id: string, v: boolean): void { document.getElementById(id)!.style.display = v ? 'flex' : 'none'; }

  private setSwatchColor(id: string, color: string): void {
    const s = document.getElementById(id)! as HTMLElement;
    s.style.backgroundColor = color;
    if(color === 'transparent') s.style.border = '1px solid #ccc';
  }

  private setWidthSample(w: number): void {
    const s = document.getElementById('strokeWidthSample')!;
    s.className = 'stroke-width-sample';
    if(w === 4) s.classList.add('thick');
    else if(w === 2) s.classList.add('medium');
  }

  private setStyleSample(dash: string | undefined, sw: number): void {
    const s = document.getElementById('strokeStyleSample')!;
    s.className = 'stroke-style-sample';
    const style = this.dashStyle(dash);
    if(style !== 'solid') s.classList.add(style);
  }

  private setTextSizeSample(size: number): void {
    const s = document.getElementById('textSizeSample')!;
    s.className = 'text-size-sample';
    if(size <= 12) s.classList.add('small');
    else if(size <= 16) s.classList.add('medium');
    else if(size <= 20) s.classList.add('large');
    else s.classList.add('xlarge');
  }

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
