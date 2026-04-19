import type { CharmIQAPI } from '../../../shared/charmiq';
import type { ConfigStore } from './config-store';
import type { ContentBridge, ExcalidrawAPI } from './content-bridge';

// registers LLM-facing commands via window.charmiq.exportCommands so that
// agents can read/write drawing content and control configuration
// ********************************************************************************
/** exposes the command surface for LLM / agent interaction */
export class CommandSurface {
  private readonly contentBridge: ContentBridge;
  private readonly configStore: ConfigStore;
  private excalidrawAPI: ExcalidrawAPI | null = null;

  public constructor(contentBridge: ContentBridge, configStore: ConfigStore) {
    this.contentBridge = contentBridge;
    this.configStore = configStore;
  }

  /** provide the Excalidraw API ref once it's ready */
  public setAPI(api: ExcalidrawAPI): void {
    this.excalidrawAPI = api;
  }

  /** register all commands via `charmiq.exportCommands` — called once from main.ts */
  // NOTE: each method receives a single named-args object whose properties match
  //       the method's `inputSchema` in manifest.json. For `setConfig`, the entire
  //       object IS the partial config (showMainMenu, viewModeEnabled, ...) so
  //       it's passed through to configStore.setConfig as-is
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    charmiq.exportCommands({
      getText: () => {
        return this.contentBridge.getCurrentContent();
      },
      setText: async ({ text }: { text: string; }) => {
        await this.contentBridge.setText(text);
      },

      getSceneElements: () => {
        return this.excalidrawAPI?.getSceneElements() ?? [];
      },
      getSceneState: () => {
        return this.excalidrawAPI?.getAppState() ?? {};
      },

      getConfig: () => {
        return { ...this.configStore.getConfig() };
      },
      setConfig: async (partial: Record<string, unknown>) => {
        await this.configStore.setConfig(partial);
      }
    });
  }
}
