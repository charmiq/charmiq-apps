import { renderApp } from './app-component';
import { CommandSurface } from './command';
import { ConfigStore } from './config-store';
import { ContentBridge } from './content-bridge';
import { LibraryHandler } from './library-handler';
import type { ExcalidrawAPI } from './content-bridge';

// entry point — creates all modules, wires dependencies, starts discovery
// ********************************************************************************
const charmiq = (window as any).charmiq;

// == Create Instances ============================================================
const contentBridge = new ContentBridge(charmiq.appContent);
const configStore = new ConfigStore(charmiq.appState);
const libraryHandler = new LibraryHandler();
const commandSurface = new CommandSurface(contentBridge, configStore);

// == Init ========================================================================
const start = async () => {
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

      // start OT content sync (subscribes to appContent, creates default if empty)
      contentBridge.discover();
    },

    onChange: (elements, appState, files) => {
      contentBridge.handleSceneChange(elements, appState, files);
    },

    onLibraryChange: (items, api) => {
      contentBridge.setLibraryItems(items);

      // trigger a sync — library changed but scene elements may not have
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      contentBridge.handleSceneChange(elements, appState, files);
    }
  });

  // react to remote config changes by pushing into the React tree
  configStore.onConfigChange((cfg) => {
    appHandle.setConfig(cfg);
  });
};
start();
