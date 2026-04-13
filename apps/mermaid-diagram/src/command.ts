import type { ConfigStore } from './config-store';
import type { ContentBridge } from './content-bridge';

// registers LLM-facing commands via window.charmiq.advertise so that agents
// can read diagram source and control configuration
// ********************************************************************************
/** exposes the command surface for LLM / agent interaction */
export class CommandSurface {
  private readonly contentBridge: ContentBridge;
  private readonly configStore: ConfigStore;

  public constructor(contentBridge: ContentBridge, configStore: ConfigStore) {
    this.contentBridge = contentBridge;
    this.configStore = configStore;
  }

  /** register all commands via `charmiq.advertise` — called once from main.ts */
  public init(): void {
    const charmiq = (window as any).charmiq;
    if(!charmiq?.advertise) return;/*not running inside CharmIQ — skip*/

    charmiq.advertise('charmiq.command', {
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
