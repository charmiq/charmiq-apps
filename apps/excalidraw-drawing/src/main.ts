import type { CharmIQAPI } from '../../../shared/charmiq';
import { renderApp } from './app-component';
import { CommandSurface } from './command';
import { ConfigStore } from './config-store';
import { ContentBridge } from './content-bridge';
import { LibraryHandler } from './library-handler';
import type { ExcalidrawAPI } from './content-bridge';

// entry point — creates all modules, wires dependencies, follows the drawing
// ********************************************************************************
const charmiq: CharmIQAPI = window.charmiq;

// == Create Instances ============================================================
const contentBridge = new ContentBridge(charmiq.appContent);
const configStore = new ConfigStore(charmiq.appState);
const libraryHandler = new LibraryHandler();
const commandSurface = new CommandSurface(contentBridge, configStore);

/** shows why the drawing could not be saved or read */
const showFailure = (failure: unknown) => {
  const notice = document.getElementById('notice')!;
  notice.textContent = (failure instanceof Error) && failure.message ? failure.message
                     : 'The drawing could not be read. Reload to try again.';
  notice.hidden = false;
};
contentBridge.onFailure(showFailure);

// == Init ========================================================================
const start = async () => {
  // read the drawing while Excalidraw loads: it opens with it (SEE: loadScene)
  contentBridge.follow().catch(showFailure);

  // load persisted config (drives initial Excalidraw props)
  await configStore.init();

  // start listening for library messages before Excalidraw mounts
  libraryHandler.init();

  // mount React + Excalidraw. The onReady callback fires once the API is live
  const appHandle = renderApp(document.getElementById('app')!, {
    getConfig: () => configStore.getConfig(),
    updateMenuCSS: (show) => configStore.updateMenuVisibilityCSS(show),

    onReady: (api: ExcalidrawAPI) => {
      // hand the API to modules that need it
      contentBridge.setAPI(api);
      libraryHandler.setAPI(api);
      commandSurface.setAPI(api);

      // register LLM commands
      commandSurface.init();
    },

    loadScene: () => contentBridge.loadScene(),

    onChange: () => {
      contentBridge.sceneChanged();
    },

    onLibraryChange: (items) => {
      contentBridge.setLibraryItems(items);
    }
  });

  // react to remote config changes by pushing into the React tree
  configStore.onConfigChange((cfg) => {
    appHandle.setConfig(cfg);
  });
};
start();
