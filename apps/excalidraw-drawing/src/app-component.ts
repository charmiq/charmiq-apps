import type { DrawingConfig } from './config-store';
import type { ExcalidrawAPI } from './content-bridge';

// factory for the React App component. Uses React.createElement (not TSX)
// because React is loaded as a UMD global, not an ESM import
// ********************************************************************************
// == UMD Globals =================================================================
declare const React: any;
declare const ReactDOM: any;

// access ExcalidrawLib from UMD
const ExcalidrawLib = (window as any).ExcalidrawLib;
const Excalidraw = ExcalidrawLib?.Excalidraw;

// == Types =======================================================================
/** callback bag passed to renderApp — wires the component to external modules */
export interface AppCallbacks {
  readonly onReady: (api: ExcalidrawAPI) => void;
  readonly onChange: (elements: any[], appState: Record<string, unknown>, files: Record<string, unknown>) => void;
  readonly onLibraryChange: (items: any[], api: ExcalidrawAPI) => void;
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
  const root = ReactDOM.createRoot(container);

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

    // initialData is only consumed on first mount
    const initialData = config.viewModeEnabled !== undefined
      ? { appState: { viewModeEnabled: config.viewModeEnabled } }
      : undefined;

    // when menu is hidden, inject an empty MainMenu to suppress the built-in one
    const children: any[] = [];
    if(!config.showMainMenu && ExcalidrawLib?.MainMenu) {
      children.push(
        React.createElement(ExcalidrawLib.MainMenu, { key: 'main-menu' })
      );
    } /* else -- default menu */

    return React.createElement(Excalidraw, {
      ...(initialData ? { initialData } : {}),
      excalidrawAPI: (api: ExcalidrawAPI) => {
        excalidrawAPIRef = api;
        if(!initializedRef.current) {
          initializedRef.current = true;
          callbacks.onReady(api);
        } /* else -- already initialized */
      },
      onChange: (elements: any[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
        callbacks.onChange(elements, appState, files);
      },
      onLibraryChange: (items: any[]) => {
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
