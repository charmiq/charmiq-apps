import type { CharmIQAPI } from '../../../shared/charmiq';
import { CommandSurface } from './command';
import { ConfigStore } from './config-store';
import { ContentBridge } from './content-bridge';

// entry point — creates all modules, wires dependencies, starts discovery
// ********************************************************************************
const charmiq: CharmIQAPI = window.charmiq;

// == Create Instances ============================================================
const configStore = new ConfigStore(charmiq.appState);
const contentBridge = new ContentBridge(
  charmiq.appContent,
  document.getElementById('diagram')!,
  document.getElementById('error')!
);
const commandSurface = new CommandSurface(contentBridge, configStore);

// == Init ========================================================================
const start = async () => {
  // load persisted config (drives Mermaid theme/options)
  await configStore.init();

  // initialize Mermaid with the loaded config
  contentBridge.initMermaid(configStore.getConfig());

  // register LLM commands
  commandSurface.init();

  // react to remote config changes by re-initializing Mermaid
  configStore.onConfigChange((cfg) => {
    contentBridge.applyConfig(cfg);
  });

  // subscribe to appContent and render — creates no default content (read-only)
  await contentBridge.discover();
};
start();
