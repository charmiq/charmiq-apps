import type { CharmIQServices } from '../../../shared/charmiq-services';
import type { CanvasViewport } from './canvas-viewport';
import { closeOnClickOutside } from './dom-utils';
import { generateElementId, type DrawingElement, type ImageElement, type Point } from './element-model';
import { showLoadingOverlay, type LoadingOverlay } from './loading-overlay';
import { notifyError } from './notifications';
import type { SelectionManager } from './selection-manager';
import type { SvgRenderer } from './svg-renderer';
import type { ToolManager } from './tool-manager';

// image import (URL modal, local files, clipboard, drag-drop, Files)
// ********************************************************************************
// == ImageHandler ================================================================
export class ImageHandler {
  private readonly viewport: CanvasViewport;
  private readonly renderer: SvgRenderer;
  private readonly selection: SelectionManager;
  private readonly tools: ToolManager;
  private services: CharmIQServices | null = null;

  private pendingImagePoint: Point | null = null;
  private editingImageElement: ImageElement | null = null;

  elements: DrawingElement[] = [];
  onSave: (() => void) | null = null;

  public constructor(viewport: CanvasViewport, renderer: SvgRenderer, selection: SelectionManager, tools: ToolManager) {
    this.viewport = viewport;
    this.renderer = renderer;
    this.selection = selection;
    this.tools = tools;
  }

  public setServices(s: CharmIQServices): void { this.services = s; }

  // -- URL modal -----------------------------------------------------------------
  public setupImageModal(): void {
    const modal = document.getElementById('imageModal')!;
    const input = document.getElementById('imageUrlInput') as HTMLInputElement;
    const error = document.getElementById('imageModalError')!;
    const okBtn = document.getElementById('imageModalOk')!;
    const cancelBtn = document.getElementById('imageModalCancel')!;

    const hide = () => {
      modal.classList.remove('visible');
      input.value = '';
      error.classList.remove('visible');
      this.pendingImagePoint = null;
      this.editingImageElement = null;
    };

    cancelBtn.addEventListener('click', hide);
    modal.addEventListener('keydown', (e: KeyboardEvent) => { if(e.key === 'Escape') hide(); });

    const loadImage = async () => {
      const url = input.value.trim();
      if(!url) { error.textContent = 'Please enter a URL'; error.classList.add('visible'); return; }

      // hide the URL modal behind the busy overlay so the user sees progress
      // instead of a frozen dialog while the image is fetched
      modal.classList.remove('visible');
      let overlay: LoadingOverlay | null = showLoadingOverlay('Loading image...');
      try {
        error.classList.remove('visible');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });

        let { naturalWidth: w, naturalHeight: h } = img;
        const max = 300;
        if((w > max) || (h > max)) { const s = Math.min(max / w, max / h); w *= s; h *= s; }

        overlay.setMessage('Adding image...');
        if(this.editingImageElement) {
          const editing = this.editingImageElement;
          // re-anchor around existing center so the new image keeps its natural
          // aspect ratio instead of stretching to the old bounding box
          const cx = (editing.x + editing.x2) / 2,
                cy = (editing.y + editing.y2) / 2;
          editing.src = url;
          editing.width = w;
          editing.height = h;
          editing.x = cx - w / 2; editing.y = cy - h / 2;
          editing.x2 = cx + w / 2; editing.y2 = cy + h / 2;
          const idx = this.elements.findIndex(el => el.id === editing.id);
          if(idx >= 0) this.elements[idx] = { ...editing };
          this.renderer.renderElement(editing);
          this.selection.showSelectionHandles();
          this.onSave?.();
        } else if(this.pendingImagePoint) {
          const el = this.createImageElement(url, this.pendingImagePoint, w, h);
          this.elements.push(el);
          this.renderer.renderElement(el);
          this.selection.select([el]);
          this.onSave?.();
          this.tools.selectTool('selection');
        }
        hide();
      } catch{
        // failure: re-show the modal so the User can correct the URL
        modal.classList.add('visible');
        error.textContent = 'Failed to load image. Please check the URL.';
        error.classList.add('visible');
      } finally {
        overlay?.dismiss();
        overlay = null;
      }
    };

    okBtn.addEventListener('click', loadImage);
    input.addEventListener('keydown', (e: KeyboardEvent) => { if(e.key === 'Enter') { e.preventDefault(); loadImage(); } });
  }

  // ..............................................................................
  public showImageModal(): void {
    const rect = this.viewport.container.getBoundingClientRect();
    this.pendingImagePoint = this.viewport.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    this.editingImageElement = null;

    const modal = document.getElementById('imageModal')!;
    const input = document.getElementById('imageUrlInput') as HTMLInputElement;
    modal.classList.add('visible');
    setTimeout(() => input.focus(), 100);
  }

  // ..............................................................................
  public editImageElement(el: ImageElement): void {
    this.editingImageElement = el;
    this.pendingImagePoint = null;

    const modal = document.getElementById('imageModal')!;
    const input = document.getElementById('imageUrlInput') as HTMLInputElement;
    input.value = el.src || '';
    modal.classList.add('visible');
    setTimeout(() => { input.focus(); input.select(); }, 100);
  }

  // -- image dropdown (URL / files / local / clipboard) --------------------------
  public setupImageDropdown(): void {
    const imageBtn = document.getElementById('imageBtn')!;
    const dropdown = document.getElementById('imageDropdown')!;
    const localInput = document.getElementById('localImageInput') as HTMLInputElement;

    imageBtn.addEventListener('click', () => this.toggleImageDropdown());

    document.getElementById('imageFromUrlBtn')!.addEventListener('click', () => { dropdown.classList.remove('visible'); this.showImageModal(); });
    document.getElementById('imageFromFilesBtn')!.addEventListener('click', () => { dropdown.classList.remove('visible'); this.importFromFiles(); });
    document.getElementById('imageFromLocalBtn')!.addEventListener('click', () => { dropdown.classList.remove('visible'); localInput.click(); });
    document.getElementById('imageFromClipboardBtn')!.addEventListener('click', () => { dropdown.classList.remove('visible'); this.importFromClipboard(); });

    localInput.addEventListener('change', (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      if(files && (files.length > 0)) { this.processLocalFiles(files); (e.target as HTMLInputElement).value = ''; }
    });

    closeOnClickOutside(imageBtn, dropdown);
  }

  // ..............................................................................
  public toggleImageDropdown(): void {
    const dd = document.getElementById('imageDropdown')!;
    const was = dd.classList.contains('visible');
    this.hideAllActionDropdowns();
    if(!was) dd.classList.add('visible');
  }

  // -- drag-and-drop on canvas ---------------------------------------------------
  public setupDragDrop(): void {
    const c = this.viewport.container;
    c.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    c.addEventListener('dragenter', (e: DragEvent) => { e.preventDefault(); c.classList.add('drag-over'); });
    c.addEventListener('dragleave', () => c.classList.remove('drag-over'));
    c.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      c.classList.remove('drag-over');
      if(e.dataTransfer?.files && (e.dataTransfer.files.length > 0)) {
        const point = this.viewport.screenToCanvas(e.clientX, e.clientY);
        this.processLocalFilesAtPosition(e.dataTransfer.files, point);
      }
    });
  }

  // -- private import helpers ----------------------------------------------------
  private async importFromFiles(): Promise<void> {
    if(!this.services) return;
    const { assetService, commandService } = this.services;

    let overlay: LoadingOverlay | null = null;
    try {
      const assetIds = await commandService.execute<string[] | null>({ id: 'modal.mediaImport.openAndResolve', args: { assetCategory: 'image' } });
      if(!assetIds || (assetIds.length < 1)) return;

      overlay = showLoadingOverlay('Importing images...');
      const copyResults = await commandService.execute<Array<{ assetId: string; downloadUrl: string }>>({ id: 'asset.copy.toRichtextAsset', args: { assetIds } });
      const center = this.canvasCenter();
      const newEls: DrawingElement[] = [];
      let offsetX = 0;

      for (const assetId of assetIds) {
        const copy = copyResults.find(c => c.assetId === assetId);
        if(!copy) continue;
        overlay.setMessage('Waiting for asset...');
        await assetService.waitForStoredAsset(assetId);
        try {
          overlay.setMessage('Loading image...');
          const el = await this.createImageFromUrl(copy.downloadUrl, center, offsetX);
          newEls.push(el);
          offsetX += (el as any).width + 20;
        } catch { /* skip failed images */ }
      }

      this.commitNewElements(newEls);
    } catch(error) { console.error('Failed to import images from files:', error); }
    finally { overlay?.dismiss(); }
  }

  // ..............................................................................
  private async importFromClipboard(): Promise<void> {
    if(!this.services) return;

    let overlay: LoadingOverlay | null = null;
    try {
      const items = await navigator.clipboard.read();
      let blob: Blob | null = null;
      let mime: string | null = null;
      for (const item of items) {
        for (const type of item.types) {
          if(type.startsWith('image/')) { blob = await item.getType(type); mime = type; break; }
        }
        if(blob) break;
      }
      if(!blob || !mime) { notifyError(this.services.commandService, 'Clipboard import', 'No image found in clipboard.'); return; }

      overlay = showLoadingOverlay('Uploading image...');
      const ext = mime.split('/')[1] || 'png';
      const name = `clipboard-image-${Date.now()}.${ext}`;
      const url = await this.uploadBlob(blob, name, mime);
      overlay.setMessage('Loading image...');
      const center = this.canvasCenter();
      const el = await this.createImageFromUrl(url, center, 0);
      this.commitNewElements([el]);
    } catch(error) {
      console.error('Clipboard import failed:', error);
      if((error as Error)?.name === 'NotAllowedError') notifyError(this.services.commandService, 'Clipboard import', 'Clipboard access denied.');
    } finally { overlay?.dismiss(); }
  }

  // ..............................................................................
  private async processLocalFiles(files: FileList): Promise<void> {
    const center = this.canvasCenter();
    await this.processFilesAtPosition(files, center);
  }

  private async processLocalFilesAtPosition(files: FileList, position: Point): Promise<void> {
    await this.processFilesAtPosition(files, position);
  }

  private async processFilesAtPosition(files: FileList, position: Point): Promise<void> {
    const supported = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const valid = Array.from(files).filter(f => supported.includes(f.type));
    if(valid.length < 1) return;

    const overlay = showLoadingOverlay(valid.length > 1 ? `Uploading ${valid.length} images...` : 'Uploading image...');
    const newEls: DrawingElement[] = [];
    let offsetX = 0;
    try {
      for (const file of valid) {
        try {
          overlay.setMessage(`Uploading ${file.name}...`);
          const url = await this.uploadBlob(file, file.name, file.type);
          overlay.setMessage('Loading image...');
          const el = await this.createImageFromUrl(url, position, offsetX);
          newEls.push(el);
          offsetX += (el as any).width + 20;
        } catch{ /*skip failed*/ }
      }
      this.commitNewElements(newEls);
    } finally { overlay.dismiss(); }
  }

  // ..............................................................................
  private async uploadBlob(blob: Blob, name: string, mime: string): Promise<string> {
    if(!this.services) throw new Error('Services not available');
    const { assetService, commandService } = this.services;
    const uploadResult = await assetService.uploadLocalFolderAsset(undefined, mime, blob, name, `Uploaded ${new Date().toLocaleString()}`);
    const assetId = await assetService.getUploadAssetId(uploadResult);
    if(!assetId) throw new Error('Upload did not produce an asset id');
    await assetService.waitForStoredAsset(assetId);
    const copies = await commandService.execute<Array<{ downloadUrl: string }>>({ id: 'asset.copy.toRichtextAsset', args: { assetIds: [assetId] } });
    return copies[0].downloadUrl;
  }

  // ..............................................................................
  private async createImageFromUrl(url: string, center: Point, offsetX: number): Promise<DrawingElement> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });

    let w = img.naturalWidth, h = img.naturalHeight;
    const max = 300;
    if(w > max || h > max) { const s = Math.min(max / w, max / h); w *= s; h *= s; }

    return this.createImageElement(url, { x: center.x + offsetX, y: center.y }, w, h);
  }

  // ..............................................................................
  private createImageElement(src: string, center: Point, w: number, h: number): ImageElement {
    return {
      id: generateElementId(), type: 'image',
      x: center.x - w / 2, y: center.y - h / 2,
      x2: center.x + w / 2, y2: center.y + h / 2,
      width: w, height: h, src,
    };
  }

  // ..............................................................................
  private commitNewElements(newEls: DrawingElement[]): void {
    if(newEls.length < 1) return;
    this.elements.push(...newEls);
    for (const el of newEls) this.renderer.renderElement(el);
    this.selection.select(newEls);
    this.onSave?.();
    this.tools.selectTool('selection');
  }

  // ..............................................................................
  private canvasCenter(): Point {
    const rect = this.viewport.container.getBoundingClientRect();
    return this.viewport.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // ..............................................................................
  public hideAllActionDropdowns(): void {
    document.querySelectorAll('.dropdown, .action-dropdown').forEach(d => d.classList.remove('visible'));
  }
}
