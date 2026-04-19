import type { CharmIQAPI } from '../../../shared/charmiq';
import type { ConfigStore } from './config-store';
import type { ContentBridge, ExcalidrawAPI } from './content-bridge';

// registers LLM-facing commands via window.charmiq.advertise so that agents
// can read/write drawing content and control configuration
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

  /** register all commands via `charmiq.advertise` — called once from main.ts */
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    charmiq.advertise('charmiq.command', {
      getText: () => {
        return this.contentBridge.getCurrentContent();
      },
      setText: async (text: string) => {
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
