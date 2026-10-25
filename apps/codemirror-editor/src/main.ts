import type { CharmIQAPI } from '../../../shared/charmiq';
import { CommandSurface } from './command';
import { ConfigStore, DEFAULT_MODE } from './config-store';
import { ContentBridge } from './content-bridge';
import { EditorWrapper } from './editor-wrapper';
import { TabManager } from './tab-manager';
import { TextSize } from './text-size';
import { Toolbar } from './toolbar';

// entry point — creates all modules, wires dependencies, starts discovery
// ********************************************************************************
const charmiq: CharmIQAPI = window.charmiq;

// == Create Instances ============================================================
const editorWrapper = new EditorWrapper();
const contentBridge = new ContentBridge(charmiq.appContent);
const configStore = new ConfigStore(charmiq.appState);
const tabManager = new TabManager(contentBridge, configStore, editorWrapper);
const toolbar = new Toolbar(tabManager, configStore, editorWrapper);
const commandSurface = new CommandSurface(tabManager, editorWrapper);

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

  // the document's text size, its menus' rows and the keys an editor zooms by
  const textSize = new TextSize(size => editorWrapper.setTextSize(size), size => void configStore.updateEditorConfig('textSize', size));
  textSize.show(config.textSize);
  textSize.init();
  editorWrapper.addKeys(textSize.keys());

  // the user's changes go to the active tab's live text, which sends them and keeps
  // them through everyone else's; undo and redo are its own
  editorWrapper.onContentChange(changes => tabManager.localChange(changes));
  editorWrapper.onUndoRedo(kind => tabManager.history(kind));

  // where the active tab's text stands: once it can no longer be saved, say why and
  // offer the text and a reload (the text stays in the editor, read-only)
  const notice = document.getElementById('syncNotice')!;
  tabManager.onActiveStatus(status => {
    notice.hidden = (status.kind !== 'stopped');
    if(status.kind === 'stopped') document.getElementById('syncNoticeText')!.textContent = status.message;
  });
  document.getElementById('syncCopyBtn')!.addEventListener('click', () => void navigator.clipboard.writeText(editorWrapper.getValue()));
  document.getElementById('syncReloadBtn')!.addEventListener('click', () => window.location.reload());

  // react to remote config changes
  configStore.onConfigChange((cfg) => {
    editorWrapper.setOption('lineNumbers', cfg.lineNumbers);
    editorWrapper.setOption('lineWrapping', cfg.lineWrapping);
    editorWrapper.setOption('smartIndent', cfg.smartIndent);
    editorWrapper.setOption('indentWithTabs', cfg.indentWithTabs);
    textSize.show(cfg.textSize);
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
