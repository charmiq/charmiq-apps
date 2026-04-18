import { CommandSurface } from './command';
import { ConfigStore, DEFAULT_MODE } from './config-store';
import { ContentBridge } from './content-bridge';
import { EditorWrapper } from './editor-wrapper';
import { TabManager } from './tab-manager';
import { Toolbar } from './toolbar';

// entry point — creates all modules, wires dependencies, starts discovery
// ********************************************************************************
const charmiq = (window as any).charmiq;

// == Create Instances ============================================================
const editorWrapper = new EditorWrapper();
const contentBridge = new ContentBridge(charmiq.appContent);
const configStore = new ConfigStore(charmiq.appState);
const tabManager = new TabManager(contentBridge, configStore, editorWrapper);
const toolbar = new Toolbar(tabManager, configStore, editorWrapper);
const commandSurface = new CommandSurface(tabManager, editorWrapper, configStore);

// expose contentBridge for command.ts setText
(window as any).__contentBridge = contentBridge;

// == Init ========================================================================
const start = async () => {
  // load persisted config first (drives editor defaults)
  await configStore.init();

  const config = configStore.getConfig();
  editorWrapper.init(
    document.getElementById('editor')! as HTMLTextAreaElement,
    config,
    DEFAULT_MODE
  );

  // forward user edits from editor → content bridge
  editorWrapper.onContentChange((from, to, insertedText) => {
    const activeTabId = tabManager.getActiveTabId();
    if(activeTabId) contentBridge.forwardChange(activeTabId, from, to, insertedText);
  });

  // react to remote config changes
  configStore.onConfigChange((cfg) => {
    editorWrapper.setOption('lineNumbers', cfg.lineNumbers);
    editorWrapper.setOption('lineWrapping', cfg.lineWrapping);
    editorWrapper.setOption('smartIndent', cfg.smartIndent);
    editorWrapper.setOption('indentWithTabs', cfg.indentWithTabs);
    toolbar.syncUI();
    toolbar.renderTabs()/*maxTabs may have changed*/;
  });

  configStore.onTabModesChange(() => {
    // if the active tab's mode changed remotely, apply it (slug-keyed lookup;
    // tabs mid-migration have no slug yet so they fall back to default)
    const activeSlug = tabManager.getActiveTabSlug();
    if(activeSlug) {
      const mode = configStore.getTabMode(activeSlug);
      editorWrapper.setMode(mode);
      toolbar.syncUI();
    } /* else -- no active tab or active tab is mid-migration */
  });

  configStore.onTabOrderChange(() => {
    toolbar.renderTabs();
  });

  // wire tab manager (subscribes to content bridge)
  tabManager.init();

  // wire toolbar DOM listeners
  toolbar.init();
  toolbar.syncUI();

  // register LLM commands
  commandSurface.init();

  // discover existing content, then reveal
  await contentBridge.discover();
  tabManager.markInitialSetupDone();
  editorWrapper.reveal();
};
start();
