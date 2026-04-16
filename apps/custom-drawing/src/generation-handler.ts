import type { DrawingElement } from './element-model';
import type { ExportHandler } from './export-handler';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';
import type { ToolManager } from './tool-manager';

// AI image generation from the drawing canvas
// ********************************************************************************
interface Services {
  commandService: any;
  assetService: any;
  generationService: any;
}

// == GenerationHandler ===========================================================
export class GenerationHandler {
  private readonly exportHandler: ExportHandler;
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;
  private readonly tools: ToolManager;
  private services: Services = { commandService: null, assetService: null, generationService: null };

  elements: DrawingElement[] = [];
  generateMode: 'all' | 'selected' = 'all';

  public constructor(exportHandler: ExportHandler, renderer: SvgRenderer, selection: SelectionManager, tools: ToolManager) {
    this.exportHandler = exportHandler;
    this.renderer = renderer;
    this.selection = selection;
    this.tools = tools;
  }

  public setServices(s: Services): void { this.services = s; }

  // ==============================================================================
  public async generateFromDrawing(mode: string | null = null): Promise<void> {
    const { commandService, assetService, generationService } = this.services;
    if(!commandService || !assetService || !generationService) throw new Error('Required services not available');
    if(this.elements.length < 1) { alert('Please create some drawing elements first.'); return; }

    // export the canvas to a data URL
    this.exportHandler.exportMode = (mode || this.generateMode) as any;
    const canvas = await (this.exportHandler as any).exportDrawingToCanvas?.(
      (this.exportHandler.exportMode === 'selected') && (this.selection.selectedElements.length > 0)
        ? this.selection.selectedElements
        : this.elements,
      { whiteBackground: true },
    );
    if(!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');

    // open generation modal
    const result = await commandService.execute({
      id: 'modal.generation.image.editor.openAndResolve',
      args: { parentFolderId: undefined, imageUrls: [dataUrl] },
    });
    if(!result) return;

    const generatedIds = await generationService.generateImage(result.prompt, result.generationProvider, result.generationConfiguration);
    if(!generatedIds || generatedIds.length < 1) throw new Error('No images were generated');

    // place generated image on canvas
    for(const assetId of generatedIds) {
      const asset = await assetService.waitForStoredAsset(assetId);
      if(!asset || asset.store.storeStatus !== 'stored') continue;

      const copies = await commandService.execute({ id: 'asset.copy.toRichtextAsset', args: { assetIds: [assetId] } });
      if(!copies?.[0]) continue;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = copies[0].downloadUrl; });

      let w = img.naturalWidth, h = img.naturalHeight;
      const max = 500;
      if((w > max) || (h > max)) { const s = Math.min(max / w, max / h); w *= s; h *= s; }

      const el: any = {
        id: 'el_' + Date.now(), type: 'image',
        x: 50, y: 50, x2: 50 + w, y2: 50 + h,
        width: w, height: h, src: copies[0].downloadUrl,
      };

      this.elements.push(el);
      this.renderer.renderElement(el);
      this.selection.select([el]);
    }
  }

  // ==============================================================================
  public setupGenerateDropdown(): void {
    const btn = document.getElementById('generateBtn')!;
    const dd = document.getElementById('generateDropdown')!;

    btn.addEventListener('click', () => {
      if(this.selection.selectedElements.length < 1) {
        this.generateFromDrawing('all').catch(err => console.error('Generation failed:', err));
      } else {
        this.toggleGenerateDropdown();
      }
      setTimeout(() => btn.classList.remove('active'), 0);
    });

    document.getElementById('generateAllBtn')!.addEventListener('click', () => {
      this.generateFromDrawing('all').catch(err => console.error('Generation failed:', err));
      dd.classList.remove('visible');
    });
    document.getElementById('generateSelectedBtn')!.addEventListener('click', () => {
      this.generateFromDrawing('selected').catch(err => console.error('Generation failed:', err));
      dd.classList.remove('visible');
    });

    document.addEventListener('click', (e: MouseEvent) => {
      if(!btn.contains(e.target as Node) && !dd.contains(e.target as Node)) {
        dd.classList.remove('visible');
        btn.classList.remove('active');
      }
    });
  }

  // ==============================================================================
  public toggleGenerateDropdown(): void {
    const dd = document.getElementById('generateDropdown')!;
    const was = dd.classList.contains('visible');
    document.querySelectorAll('.dropdown, .action-dropdown').forEach(d => d.classList.remove('visible'));
    if(!was) {
      const selBtn = document.getElementById('generateSelectedBtn')!;
      selBtn.style.display = this.selection.selectedElements.length > 0 ? 'flex' : 'none';
      dd.classList.add('visible');
    }
  }
}
