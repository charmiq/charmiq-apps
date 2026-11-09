import type { CharmIQAPI } from '../../../shared/charmiq';
import { appStateFailureNotice } from '/shared/app-state-settings/app-state-settings';
import { CommandSurface } from './command';
import { ConfigStore } from './config-store';
import { ContentBridge } from './content-bridge';

// entry point — creates all modules, wires dependencies, follows the app-content
// ********************************************************************************
const charmiq: CharmIQAPI = window.charmiq;

// == Create Instances ============================================================
/** shows why a setting was not saved or the settings stopped updating */
const notice = document.getElementById('notice')!;
const configStore = new ConfigStore(charmiq.appState, (failure, error) => {
  notice.textContent = appStateFailureNotice(failure, error);
  notice.hidden = false;
});
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

  // follow the app-content and render it — creates no content (read-only)
  await contentBridge.follow();
};
start();
