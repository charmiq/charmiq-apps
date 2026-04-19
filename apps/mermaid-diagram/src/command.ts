import type { CharmIQAPI } from '../../../shared/charmiq';
import type { ConfigStore } from './config-store';
import type { ContentBridge } from './content-bridge';

// registers LLM-facing commands via window.charmiq.exportCommands so that
// agents can read diagram source and control configuration
// ********************************************************************************
/** exposes the command surface for LLM / agent interaction */
export class CommandSurface {
  private readonly contentBridge: ContentBridge;
  private readonly configStore: ConfigStore;

  public constructor(contentBridge: ContentBridge, configStore: ConfigStore) {
    this.contentBridge = contentBridge;
    this.configStore = configStore;
  }

  /** register all commands via `charmiq.exportCommands` — called once from main.ts */
  // NOTE: each method receives a single named-args object whose properties match
  //       the method's `inputSchema` in manifest.json. For `setConfig`, the entire
  //       object IS the partial config (theme, flowchart, ...) so it's passed
  //       through to configStore.setConfig as-is
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    charmiq.exportCommands({
      getText: () => {
        return this.contentBridge.getCurrentSource();
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
