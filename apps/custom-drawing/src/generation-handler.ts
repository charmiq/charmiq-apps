import type { CharmIQServices } from '../../../shared/charmiq-services';
import { closeOnClickOutside } from './dom-utils';
import { generateElementId, type DrawingElement, type ImageElement } from './element-model';
import type { ExportHandler } from './export-handler';
import { notifyError } from './notifications';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';

// AI image generation from the drawing canvas
// ********************************************************************************
// == GenerationHandler ===========================================================
export class GenerationHandler {
  private readonly exportHandler: ExportHandler;
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;
  private services: CharmIQServices | null = null;

  elements: DrawingElement[] = [];
  generateMode: 'all' | 'selected' = 'all';

  public constructor(exportHandler: ExportHandler, renderer: SvgRenderer, selection: SelectionManager) {
    this.exportHandler = exportHandler;
    this.renderer = renderer;
    this.selection = selection;
  }

  public setServices(s: CharmIQServices): void { this.services = s; }

  // ==============================================================================
  public async generateFromDrawing(mode: 'all' | 'selected' | null = null): Promise<void> {
    if(!this.services) { this.notifyGenerationFailed('Required services not available'); return/*nothing more to do*/; }
    const { assetService, commandService, generationService } = this.services;
    if(this.elements.length < 1) { notifyError(commandService, 'Nothing to generate', 'Please create some drawing elements first.'); return/*nothing more to do*/; }

    try {
      // export the canvas to a data URL
      this.exportHandler.exportMode = mode || this.generateMode;
      const canvas = await this.exportHandler.exportDrawingToCanvas(
        (this.exportHandler.exportMode === 'selected') && (this.selection.selectedElements.length > 0)
          ? this.selection.selectedElements
          : this.elements,
        { whiteBackground: true },
      );
      if(!canvas) return;

      const dataUrl = canvas.toDataURL('image/png');

      // open generation modal
      const result = await commandService.execute<{ prompt: string; generationProvider: string; generationConfiguration: unknown } | null>({
        id: 'modal.generation.image.editor.openAndResolve',
        args: { parentFolderId: undefined, imageUrls: [dataUrl] },
      });
      if(!result) return;

      const generatedIds = await generationService.generateImage(result.prompt, result.generationProvider, result.generationConfiguration);
      if(!generatedIds || generatedIds.length < 1) throw new Error('No images were generated');

      // place generated images on canvas
      for(const assetId of generatedIds) {
        const asset = await assetService.waitForStoredAsset(assetId);
        if(!asset || (asset.store.storeStatus !== 'stored')) continue;

        const copies = await commandService.execute<Array<{ downloadUrl: string }>>({ id: 'asset.copy.toRichtextAsset', args: { assetIds: [assetId] } });
        if(!copies?.[0]) continue;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = copies[0].downloadUrl; });

        let w = img.naturalWidth, h = img.naturalHeight;
        const max = 500;
        if((w > max) || (h > max)) { const s = Math.min(max / w, max / h); w *= s; h *= s; }

        const el: ImageElement = {
          id: generateElementId(), type: 'image',
          x: 50, y: 50, x2: 50 + w, y2: 50 + h,
          src: copies[0].downloadUrl,
        };

        this.elements.push(el);
        this.renderer.renderElement(el);
        this.selection.select([el]);
      }
    } catch(error) {
      this.notifyGenerationFailed((error as Error)?.message ?? String(error));
    }
  }

  // ==============================================================================
  public setupGenerateDropdown(): void {
    const btn = document.getElementById('generateBtn')!;
    const dd = document.getElementById('generateDropdown')!;

    btn.addEventListener('click', () => {
      if(this.selection.selectedElements.length < 1) {
        void this.generateFromDrawing('all');
      } else {
        this.toggleGenerateDropdown();
      }
    });

    document.getElementById('generateAllBtn')!.addEventListener('click', () => {
      void this.generateFromDrawing('all');
      dd.classList.remove('visible');
    });
    document.getElementById('generateSelectedBtn')!.addEventListener('click', () => {
      void this.generateFromDrawing('selected');
      dd.classList.remove('visible');
    });

    closeOnClickOutside(btn, dd);
  }

  // ==============================================================================
  public toggleGenerateDropdown(): void {
    const dd = document.getElementById('generateDropdown')!;
    const visible = dd.classList.contains('visible');
    document.querySelectorAll('.dropdown, .action-dropdown').forEach(d => d.classList.remove('visible'));
    if(!visible) {
      const selBtn = document.getElementById('generateSelectedBtn')!;
      selBtn.style.display = this.selection.selectedElements.length > 0 ? 'flex' : 'none';
      dd.classList.add('visible');
    } /* else -- was visible */
  }

  // ==============================================================================
  private notifyGenerationFailed(description: string): void {
    const cmd = this.services?.commandService;
    if(cmd) notifyError(cmd, 'Image generation failed', description);
    else console.error('Generation failed:', description);
  }
}
