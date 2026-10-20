import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import React from 'react';
import { createRoot } from 'react-dom/client';

import type { DrawingConfig } from './config-store';
import type { ExcalidrawAPI, LibraryItem, SceneElement, SceneFile, SceneSettings } from './content-bridge';

// factory for the React App component (React.createElement: the app has no TSX)
// ********************************************************************************

// == Types =======================================================================
/** callback bag passed to renderApp — wires the component to external modules */
export interface AppCallbacks {
  readonly onReady: (api: ExcalidrawAPI) => void;
  readonly onChange: (...change: Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['onChange']>>) => void;
  readonly onLibraryChange: (items: ReadonlyArray<LibraryItem>, api: ExcalidrawAPI) => void;
  /** the drawing to open with, once it is read */
  readonly loadScene: () => Promise<Readonly<{ elements: ReadonlyArray<SceneElement>; appState: SceneSettings; files: Readonly<Record<string, SceneFile>>; libraryItems: ReadonlyArray<LibraryItem>; }>>;
  readonly getConfig: () => Readonly<DrawingConfig>;
  readonly updateMenuCSS: (show: boolean) => void;
}

// ................................................................................
/** handle used by main.ts to push config changes into the React tree */
export interface AppHandle {
  /** push a new config into the component, triggering a re-render */
  setConfig: (config: Readonly<DrawingConfig>) => void;
}

// == Render ======================================================================
/** mount the App component into the given container. Returns a handle for
 *  pushing config changes from outside React */
export const renderApp = (container: HTMLElement, callbacks: AppCallbacks): AppHandle => {
  const root = createRoot(container);

  // shared mutable ref so the App component can be driven from outside
  let configSetter: ((config: Readonly<DrawingConfig>) => void) | null = null;
  let excalidrawAPIRef: ExcalidrawAPI | null = null;

  // ..............................................................................
  function App() {
    const [config, setConfig] = React.useState(callbacks.getConfig);
    const initializedRef = React.useRef(false);

    // expose a setter so external config changes trigger re-renders
    React.useEffect(() => {
      configSetter = (newConfig: Readonly<DrawingConfig>) => {
        const prev = config;
        callbacks.updateMenuCSS(newConfig.showMainMenu);
        setConfig({ ...newConfig });

        // apply viewModeEnabled changes at runtime via the API
        // (initialData only works on mount; afterwards updateScene is needed)
        if(excalidrawAPIRef && (newConfig.viewModeEnabled !== undefined) &&
          (newConfig.viewModeEnabled !== prev.viewModeEnabled)) {
          excalidrawAPIRef.updateScene({ appState: { viewModeEnabled: newConfig.viewModeEnabled } });
        } /* else -- no view-mode change or no API yet */
      };

      // apply initial CSS state
      callbacks.updateMenuCSS(config.showMainMenu);
      return () => { configSetter = null; };
    }, []);

    // the drawing opens with the scene read from the document (Excalidraw restores
    // it, as any scene it loads), consumed on first mount
    const initialData = React.useMemo(() => callbacks.loadScene().then(scene => ({
      ...scene,
      appState: { ...scene.appState, ...((config.viewModeEnabled !== undefined) ? { viewModeEnabled: config.viewModeEnabled } : {}) },
    })), []);

    // when menu is hidden, inject an empty MainMenu to suppress the built-in one
    const children: any[] = [];
    if(!config.showMainMenu) {
      children.push(
        React.createElement(MainMenu, { key: 'main-menu' })
      );
    } /* else -- default menu */

    return React.createElement(Excalidraw, {
      initialData,
      excalidrawAPI: (api: ExcalidrawAPI) => {
        excalidrawAPIRef = api;
        if(!initializedRef.current) {
          initializedRef.current = true;
          callbacks.onReady(api);
        } /* else -- already initialized */
      },
      onChange: callbacks.onChange,
      onLibraryChange: (items) => {
        if(!excalidrawAPIRef) return;
        callbacks.onLibraryChange(items, excalidrawAPIRef);
      },
      // library browser redirects to a bridge page hosted on the platform
      libraryReturnUrl: `${(window as any).IFRAME_APP_ORIGIN}/app/excalidraw-library-bridge.html?target=${(window as any).IFRAME_NODE_ID}`,
      UIOptions: {
        canvasActions: {
          changeViewBackgroundColor: true,
          clearCanvas: true,
          export: { saveFileToDisk: true },
          loadScene: true,
          saveToActiveFile: true,
          toggleTheme: true,
          saveAsImage: true
        }
      }
    }, ...children);
  }

  root.render(React.createElement(App));

  return {
    setConfig: (config: Readonly<DrawingConfig>) => {
      if(configSetter) configSetter(config);
    }
  };
};
