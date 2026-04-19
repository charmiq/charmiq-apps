import type { AssetCategory, AssetCopyResult } from '../../../shared/charmiq-commands';
import type { CharmIQServices } from '../../../shared/charmiq-services';
import type { GalleryItem } from './content-bridge';

// wraps the platform Asset + Command services to produce GalleryItem records
// from user-chosen assets. Two entry paths
//   pickImages()    open the platform media import modal, return the selected
//                   assets as fully-resolved GalleryItems (downloadUrl set)
//   resolveByAssetId(assetIds)
//                   used by charmiq.command callers that already have assetIds
//                   to materialize them into GalleryItems
//
// Both paths go through the same resolve step: waitForStoredAsset() to ensure
// the asset is committed, then asset.copy.toRichtextAsset for a stable download
// URL. Natural image dimensions are measured once per asset by loading the
// URL into an off-DOM HTMLImageElement
// ********************************************************************************
// == Types =======================================================================
/** internal shape returned by waitForStoredAsset — only the fields read here */
interface StoredAsset {
  readonly name?:        string;
  readonly mimeType?:    string;
  readonly store: { storeStatus: string; };
}

// == Class =======================================================================
/** resolves asset identifiers into fully-formed GalleryItems */
export class AssetResolver {
  private services: CharmIQServices | null = null;

  // == Lifecycle =================================================================
  /** wire the services after charmiq.discover completes */
  public setServices(services: CharmIQServices | null): void {
    this.services = services;
  }

  // == Public ====================================================================
  /** open the platform media picker and resolve the user's selection into
   *  GalleryItems. Returns [] when the user cancels or services are unavailable */
  public async pickImages(assetCategory: AssetCategory): Promise<ReadonlyArray<GalleryItem>> {
    if(!this.services) return [];

    try {
      const assetIds = await this.services.commandService.execute({
        id:   'modal.mediaImport.openAndResolve',
        args: { assetCategory }
      });
      if(!assetIds || (assetIds.length < 1)) return [];/*User cancelled*/

      return this.resolveByAssetId(assetIds);
    } catch(error) {
      console.error('failed to open media import picker:', error);
      return [];
    }
  }

  // ------------------------------------------------------------------------------
  /** resolve an array of Asset IDs into GalleryItems. Assets that fail to
   *  resolve are skipped with a warning (the return length may be less than
   *  the input length) */
  public async resolveByAssetId(assetIds: ReadonlyArray<string>): Promise<ReadonlyArray<GalleryItem>> {
    if(!this.services || (assetIds.length < 1)) return [];
    const { assetService, commandService } = this.services;

    let copies: ReadonlyArray<AssetCopyResult>;
    try {
      copies = await commandService.execute({
        id:   'asset.copy.toRichtextAsset',
        args: { assetIds: [...assetIds] }
      });
    } catch(error) {
      console.error('failed to resolve asset download URLs:', error);
      return [];
    }

    const out: GalleryItem[] = [];
    for(const assetId of assetIds) {
      const copy = copies.find(c => c.assetId === assetId);
      if(!copy) {
        console.warn('no download URL for asset; skipping', assetId);
        continue;
      } /* else -- have a download URL */

      let stored: StoredAsset | null;
      try {
        stored = await assetService.waitForStoredAsset(assetId) as StoredAsset | null;
      } catch(error) {
        console.error('waitForStoredAsset failed; skipping', assetId, error);
        continue;
      }
      if(!stored || (stored.store.storeStatus !== 'stored')) {
        console.warn('asset not in stored state; skipping', assetId);
        continue;
      } /* else -- Asset is stored */

      const dims = await measureImage(copy.downloadUrl);
      out.push({
        itemId:      assetId/*use assetId as the stable itemId*/,
        assetId,
        downloadUrl: copy.downloadUrl,
        name:        stored.name     || '',
        mimeType:    stored.mimeType || 'image/*',
        width:       dims?.width,
        height:      dims?.height
      });
    }
    return out;
  }
}

// == Util ========================================================================
/** load an image off-DOM to read its natural dimensions. Returns null on error
 *  (e.g. CORS, 404) — the item is still usable without dimensions */
const measureImage = (url: string): Promise<{ width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
};
