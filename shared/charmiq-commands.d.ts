// type-safe contract for the subset of platform Commands that charmiq-apps
// actually invoke. `CharmIQCommandService.execute` (see charmiq-services.d.ts)
// is typed against the CharmIQCommandsMap below, so call sites get checked
// args AND an inferred return without any generic ceremony:
//
//   const copies = await commandService.execute({
//     id:   'asset.copy.toRichtextAsset',
//     args: { assetIds }
//   });
//   // copies is typed as ReadonlyArray<AssetCopyResult>
//
// Scope: mirrors ONLY the commands apps call today. Add an entry when a new
//        app starts invoking a new command. The platform's per-command
//        Application-type parameter (registerCommand<Args, Return, AppType>)
//        is intentionally not mirrored here -- iframe apps do not observe
//        the host application type.
//
// Drift: this file is hand-written. The source of truth is the platform's
//        registerCommand declarations (Zod schema + return type). Planned
//        follow-up is a generator that walks the platform's registrations
//        and produces this file so it cannot silently drift.
// ********************************************************************************
// == Supporting Types ============================================================
// NOTE: pure TS -- Zod schemas from the platform are flattened to the
//       structural shapes here. Narrow string literal unions are preferred
//       over `string` so callers get autocomplete on enum-valued fields.

// -- Asset -----------------------------------------------------------------------
/** mirror of the platform `AssetCategory` enum values */
export type AssetCategory =
  | 'archive'
  | 'audio'
  | 'data-interchange'
  | 'document'
  | 'google'
  | 'image'
  | 'markup-structured-data'
  | 'plain-text'
  | 'source-code'
  | 'unknown'
  | 'video';

/** return shape of `asset.copy.toRichtextAsset` */
export interface AssetCopyResult {
  readonly assetId:     string;
  /** opaque AssetSource payload -- structure is reserved for the platform */
  readonly source:      unknown;
  readonly downloadUrl: string;
}

// -- Generation ------------------------------------------------------------------
/** return shape of `modal.generation.image.editor.openAndResolve` */
export interface GenerationImageEditorResolved {
  readonly parentFolderId?:         string;
  readonly prompt:                  string;
  readonly generationProvider:      string;
  /** opaque provider-specific configuration; structure reserved for the platform */
  readonly generationConfiguration: unknown;
}

// -- Notification ----------------------------------------------------------------
/** mirror of the platform `NotificationStatus` enum */
export type NotificationStatus = 'success' | 'error' | 'warning' | 'info' | 'loading';

/** mirror of the platform `NotificationModalType` enum. Keep in sync with
 *  platform/packages/application/src/notification/type.ts */
export type NotificationModalType =
  | 'default'
  | 'apiKeyRequired'
  | 'contactSupport'
  | 'capExceeded'
  | 'limitExceeded'
  | 'notEntitled'
  | 'editorTerminalError'
  | 'paymentPastDue'
  | 'paymentUnpaid';

// == CharmIQCommandsMap ==========================================================
/** command id -> { args, return } mapping. Keys are the literal command id
 *  strings used on the wire; values describe the typed args and return shape */
export interface CharmIQCommandsMap {
  // == Asset =====================================================================
  'asset.copy.toRichtextAsset': {
    args:   { assetIds: ReadonlyArray<string> };
    return: ReadonlyArray<AssetCopyResult>;
  };

  // == Modal =====================================================================
  'modal.mediaImport.openAndResolve': {
    args:   { assetCategory: AssetCategory };
    return: ReadonlyArray<string> | null/*null when the user cancels*/;
  };

  'modal.generation.image.editor.openAndResolve': {
    args:   { parentFolderId?: string; imageUrls?: ReadonlyArray<string> };
    return: GenerationImageEditorResolved | null/*null when the user cancels*/;
  };

  // == Notification ==============================================================
  'notification.modal.emit': {
    args: {
      status:       NotificationStatus;
      type?:        NotificationModalType;
      title?:       string;
      description?: string;
      acceptLabel?: string;
    };
    return: void;
  };

  'notification.toast.emit': {
    args: {
      status:       NotificationStatus;
      title:        string;
      description?: string;
    };
    return: void;
  };
}
