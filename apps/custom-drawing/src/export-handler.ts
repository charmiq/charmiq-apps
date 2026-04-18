import { getElementBounds, type DrawingElement } from './element-model';
import { getDrawingBounds } from './geometry';
import { ensureGoogleFontsLoaded } from './google-fonts';
import { DEFAULT_FONT_FAMILY } from './svg-renderer';
import type { TextMeasurement } from './text-measurement';

// PNG export — download, clipboard, save to Files
// ********************************************************************************

// --------------------------------------------------------------------------------
interface CharmIQServices {
  commandService: any;
  assetService: any;
}

// == ExportHandler ===============================================================
export class ExportHandler {
  private readonly textMeasure: TextMeasurement;
  private services: CharmIQServices = { commandService: null, assetService: null };

  public elements: DrawingElement[] = [];
  public selectedElements: DrawingElement[] = [];
  public exportMode: 'all' | 'selected' = 'all';

  public constructor(textMeasure: TextMeasurement) {
    this.textMeasure = textMeasure;
  }

  public setServices(s: CharmIQServices): void { this.services = s; }

  // ==============================================================================
  public async exportToPNG(target: 'download' | 'clipboard' | 'files'): Promise<void> {
    const elements = (this.exportMode === 'selected') && (this.selectedElements.length > 0)
                    ? this.selectedElements
                    : this.elements;

    const canvas = await this.exportDrawingToCanvas(elements);
    if(target === 'download') {
      canvas.toBlob(blob => {
        if(!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing-export-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } else if(target === 'clipboard') {
      canvas.toBlob(async blob => {
        if(!blob) return;
        try {
          if(navigator.clipboard && (window as any).ClipboardItem) {
            await navigator.clipboard.write([new (window as any).ClipboardItem({ 'image/png': blob })]);
          }
        } catch { /* fallback to download */ this.downloadBlob(blob); }
      }, 'image/png');
    } else if(target === 'files') {
      canvas.toBlob(async blob => {
        if(!blob) return;
        try { await this.saveToFiles(blob); }
        catch { this.downloadBlob(blob); }
      }, 'image/png');
    }
  }

  // ==============================================================================
  public setupSaveDropdown(onHideAll: () => void): void {
    const saveBtn = document.getElementById('saveBtn')!;
    const dropdown = document.getElementById('saveDropdown')!;

    saveBtn.addEventListener('click', () => { this.toggleSaveDropdown(); setTimeout(() => saveBtn.classList.remove('active'), 0); });

    document.getElementById('exportAllBtn')!.addEventListener('click', () => { this.exportMode = 'all'; this.exportToPNG('download'); dropdown.classList.remove('visible'); });
    document.getElementById('exportSelectedBtn')!.addEventListener('click', () => { this.exportMode = 'selected'; this.exportToPNG('download'); dropdown.classList.remove('visible'); });
    document.getElementById('downloadBtn')!.addEventListener('click', () => { this.exportToPNG('download'); dropdown.classList.remove('visible'); });
    document.getElementById('clipboardBtn')!.addEventListener('click', () => { this.exportToPNG('clipboard'); dropdown.classList.remove('visible'); });
    document.getElementById('saveToFilesBtn')!.addEventListener('click', () => { this.exportToPNG('files'); dropdown.classList.remove('visible'); });

    document.addEventListener('click', (e: MouseEvent) => {
      if(!saveBtn.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.classList.remove('visible');
        saveBtn.classList.remove('active');
      } /* else -- click was inside dropdown or button */
    });
  }

  public toggleSaveDropdown(): void {
    const dd = document.getElementById('saveDropdown')!;
    const visible = dd.classList.contains('visible');
    document.querySelectorAll('.dropdown, .action-dropdown').forEach(d => d.classList.remove('visible'));
    if(!visible) {
      const selBtn = document.getElementById('exportSelectedBtn')!;
      selBtn.style.display = this.selectedElements.length > 0 ? 'flex' : 'none';
      dd.classList.add('visible');
    } /* else -- was visible */
  }

  // == Canvas Rendering ==========================================================
  public async exportDrawingToCanvas(elements: DrawingElement[], opts: { whiteBackground?: boolean } = {}): Promise<HTMLCanvasElement> {
    // ensure any Google-hosted fonts referenced by text elements are loaded
    // before canvas rendering -- without this, `ctx.fillText` silently falls
    // back to serif for the frame that happens to export first after a cold
    // load, even though the on-screen SVG renders correctly
    const families = elements
      .filter(el => (el.type === 'text') && (el as any).fontFamily)
      .map(el => (el as any).fontFamily as string);
    if(families.length > 0) await ensureGoogleFontsLoaded(families);

    const padding = 40;
    const { minX, minY, maxX, maxY } = getDrawingBounds(elements);
    const w = maxX - minX + padding * 2,
          h = maxY - minY + padding * 2;

    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    if(opts.whiteBackground) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    } /* else -- transparent background */

    const offsetX = padding - minX,
          offsetY = padding - minY;

    for(const el of elements) {
      ctx.save();
      await this.renderElementToCanvas(ctx, el, offsetX, offsetY);
      ctx.restore();
    }

    return canvas;
  }

  // -- Element to Canvas ---------------------------------------------------------
  private async renderElementToCanvas(ctx: CanvasRenderingContext2D, el: DrawingElement, offsetX: number, offsetY: number): Promise<void> {
    const b = getElementBounds(el);

    // apply rotation
    if(el.angle && (el.angle !== 0)) {
      const cx = b.x + b.width / 2 + offsetX;
      const cy = b.y + b.height / 2 + offsetY;
      ctx.translate(cx, cy);
      ctx.rotate(el.angle);
      ctx.translate(-cx, -cy);
    }

    // image
    if((el.type === 'image') && (el as any).src) {
      await new Promise<void>(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, b.x + offsetX, b.y + offsetY, b.width, b.height); resolve(); };
        img.onerror = () => resolve();
        img.src = (el as any).src;
      });
      return;
    }

    // common styles
    if(el.stroke) ctx.strokeStyle = el.stroke;
    if(el.fill && el.fill !== 'transparent') ctx.fillStyle = el.fill;
    if(el.strokeWidth) ctx.lineWidth = el.strokeWidth;
    if(el.strokeDasharray && (el.strokeDasharray !== 'none')) {
      ctx.setLineDash(el.strokeDasharray.split(',').map(v => parseFloat(v.trim())));
      ctx.lineCap = 'round';
    } /* else -- solid line */

    const x = b.x + offsetX,
          y = b.y + offsetY;

    switch (el.type) {
      case 'rectangle':
        ctx.beginPath();
        ctx.roundRect(x, y, b.width, b.height, 4);
        if(el.fill && el.fill !== 'transparent') ctx.fill();
        if(el.stroke) ctx.stroke();
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(x + b.width / 2, y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
        if(el.fill && el.fill !== 'transparent') ctx.fill();
        if(el.stroke) ctx.stroke();
        break;
      case 'diamond': {
        const cx = x + b.width / 2;
        const cy = y + b.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(x + b.width, cy);
        ctx.lineTo(cx, y + b.height);
        ctx.lineTo(x, cy);
        ctx.closePath();
        if(el.fill && el.fill !== 'transparent') ctx.fill();
        if(el.stroke) ctx.stroke();
        break;
      }
      case 'line': {
        const le = el as any;
        ctx.beginPath();
        ctx.moveTo(le.x + offsetX, le.y + offsetY);
        ctx.lineTo(le.x2 + offsetX, le.y2 + offsetY);
        ctx.stroke();
        this.drawLineDecorations(ctx, le, offsetX, offsetY);
        break;
      }
      case 'text': {
        const te = el as any;
        const fontSize = te.fontSize || 16;
        ctx.font = `${fontSize}px ${te.fontFamily || DEFAULT_FONT_FAMILY}`;
        ctx.fillStyle = te.fill || te.textColor || '#000000';
        const lines = this.textMeasure.wrapText(te.text || '', te.width || 100, fontSize);
        const lh = fontSize * 1.2;
        let tx = te.x + offsetX;
        if(te.textAlign === 'center') { tx += (te.width || 100) / 2; ctx.textAlign = 'center'; }
        else if(te.textAlign === 'right') { tx += (te.width || 100); ctx.textAlign = 'right'; }
        else ctx.textAlign = 'left';
        lines.forEach((line, i) => ctx.fillText(line, tx, te.y + offsetY + fontSize + i * lh));
        break;
      }
    }
  }

  // -- Line Decorations ----------------------------------------------------------
  private drawLineDecorations(ctx: CanvasRenderingContext2D, el: any, offX: number, offY: number): void {
    const color = el.stroke || '#000000';
    const sw = el.strokeWidth || 2;
    const x1 = el.x + offX, y1 = el.y + offY;
    const x2 = el.x2 + offX, y2 = el.y2 + offY;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const scale = sw * 1.2;

    const drawArrow = (px: number, py: number, a: number) => {
      const len = 6 * scale, h = 2.5 * scale;
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(-len, -h); ctx.lineTo(0, 0); ctx.lineTo(-len, h);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, sw); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
    };
    const drawTri = (px: number, py: number, a: number, filled: boolean) => {
      const len = 6 * scale, w = 6 * scale;
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(-len, -w / 2); ctx.lineTo(0, 0); ctx.lineTo(-len, w / 2); ctx.closePath();
      if(filled) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, sw); ctx.stroke(); }
      ctx.restore();
    };

    if(el.startDecoration === 'arrow') drawArrow(x1, y1, angle + Math.PI);
    if(el.startDecoration === 'triangle-filled') drawTri(x1, y1, angle + Math.PI, true);
    if(el.startDecoration === 'triangle-outline') drawTri(x1, y1, angle + Math.PI, false);
    if(el.endDecoration === 'arrow') drawArrow(x2, y2, angle);
    if(el.endDecoration === 'triangle-filled') drawTri(x2, y2, angle, true);
    if(el.endDecoration === 'triangle-outline') drawTri(x2, y2, angle, false);
  }

  // ==============================================================================
  private downloadBlob(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drawing-export-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------------------------
  private async saveToFiles(blob: Blob): Promise<void> {
    const { assetService, commandService } = this.services;
    if(!assetService) throw new Error('Asset service not available');
    const name = `drawing-export-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    const upload = await assetService.uploadLocalFolderAsset(undefined, 'image/png', blob, name, 'Drawing export');
    const assetId = await assetService.getUploadAssetId(upload);
    await assetService.waitForStoredAsset(assetId);
  }
}
