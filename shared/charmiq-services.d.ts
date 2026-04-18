// shared duck-typed contract for the CharmIQ services that the host injects
// into apps at runtime. See shared/Plan.md for the long-term plan that will
// replace this file.
// ********************************************************************************
// NOTE: intentionally minimal -- describe only the surface that charmiq-apps
//       actually call. Add methods here as apps start consuming them
// NOTE: every method here crosses the postMessage bridge, so ALL calls are
//       async on the app side -- even methods that are synchronous inside the
//       platform (e.g. getUploadAssetId) return a Promise here

// == Asset =======================================================================
// opaque upload handle returned by uploadLocalFolderAsset -- apps only pass it
// back into getUploadAssetId, never introspect it
export type AssetUploadResult = unknown;

// --------------------------------------------------------------------------------
export interface CharmIQAssetService {
  getUploadAssetId(uploadResult: AssetUploadResult): Promise<string | undefined>;
  uploadLocalFolderAsset(parentFolderId: string | undefined, mimeType: string, data: Blob, name?: string, description?: string): Promise<AssetUploadResult>;
  waitForStoredAsset(assetId: string): Promise<{ store: { storeStatus: string; } } | null>;
}

// == Command =====================================================================
export interface CharmIQCommandService {
  execute<T = unknown>(req: { id: string; args?: unknown }): Promise<T>;
}

// == Generation ==================================================================
export interface CharmIQGenerationService {
  generateImage(prompt: string, provider: string, configuration: unknown): Promise<string[]>;
}

// ================================================================================
export interface CharmIQServices {
  commandService: CharmIQCommandService;
  assetService: CharmIQAssetService;
  generationService: CharmIQGenerationService;
}
