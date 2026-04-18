// pulls the fragment shader source from the sibling CodeMirror editor App.
// The editor doesn't advertise a dedicated capability for its content -- it
// only surfaces the generic `charmiq.command` block the Platform multiplexes
// across every advertising widget. So the bridge:
//   1. discovers all `charmiq.command` providers in the Document
//   2. filters for one that looks like a CodeMirror editor (shape-check on
//      listTabs / getText / createTab -- the tab-oriented method trio)
//   3. locates the 'shader.frag' tab and reads its text on demand
//
// No subscription / streaming -- shader recompiles are driven by explicit
// Compile clicks or (optional) debounced auto-compile triggered from the Platform
// side, so a polling strategy isn't needed here
// ********************************************************************************
// == Types =======================================================================
/** minimal structural type for a CodeMirror editor command provider. The real
 *  shape is richer (import/export, etc.) but only these are required */
interface EditorCommandProvider {
  readonly nodeId?: string;
  listTabs():                                                  Promise<ReadonlyArray<TabInfo>>;
  getText(args?: { tabId?: string; }):                         Promise<string | null>;
  createTab(args: { name?: string; content?: string; mode?: string; }): Promise<boolean>;
}

// --------------------------------------------------------------------------------
/** shape returned by the editor's listTabs command */
interface TabInfo {
  readonly id:       string;
  readonly name:     string;
  readonly mode:     string;
  readonly isActive: boolean;
}

// == Constants ===================================================================
/** the canonical tab name the demo seeds into the editor. Matches the
 *  `<app-content name="shader.frag">` block in README.md */
const SHADER_TAB_NAME = 'shader.frag';

// == Class =======================================================================
/** one-way bridge from the sibling CodeMirror editor to this demo. The provider
 *  reference is cached on first discovery; getShader() is cheap after that (single
 *  listTabs + getText round-trip across postMessage) */
export class EditorBridge {
  private provider: EditorCommandProvider | null = null;

  // == Public =====================================================================
  /** discover + cache the editor provider. Safe to call with no CharmIQ bridge
   *  (standalone preview) -- getShader() will then always return null */
  public async init(charmiq: any): Promise<void> {
    if(!charmiq?.discover) return;/*standalone -- no providers to inspect*/

    try {
      const providers = await charmiq.discover('charmiq.command') as ReadonlyArray<EditorCommandProvider> | null;
      if(!providers || (providers.length < 1)) return;/*no command providers yet*/

      // duck-type: the editor is the one with tab-oriented methods. Using typeof
      // checks (not `in` operator) because discovered providers are proxies and
      // Reflect.has is cheaper than method probing
      for(let i=0; i<providers.length; i++) {
        const p = providers[i];
        if((typeof p.listTabs === 'function') && (typeof p.getText === 'function') && (typeof p.createTab === 'function')) {
          this.provider = p;
          break;
        } /* else -- not the editor; keep looking */
      }
    } catch(error) {
      console.error('shader-demo: failed to discover codemirror-editor:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** true if a CodeMirror editor was found in the Document */
  public isReady(): boolean { return this.provider !== null; }

  // ------------------------------------------------------------------------------
  /** read the current shader source from the editor. Returns null if the bridge isn't
   *  connected, if no tab named 'shader.frag' exists, or if the editor threw.
   *  Callers treat null as "keep the previous program running and show the connection
   *  status in the error strip" */
  public async getShader(): Promise<string | null> {
    if(!this.provider) return null;

    try {
      const tabs = await this.provider.listTabs();
      const tab = pickShaderTab(tabs);
      if(!tab) return null;/*editor exists but hasn't been seeded with the tab*/

      const text = await this.provider.getText({ tabId: tab.id });
      return text ?? null;
    } catch(error) {
      console.error('shader-demo: failed to read shader text from editor:', error);
      return null;
    }
  }
}

// == Helpers =====================================================================
/** pick the tab the demo expects to find. Prefers an exact name match on
 *  'shader.frag'; falls back to the first tab whose mode is a GLSL variant; falls
 *  back to the active tab as a last resort so the User isn't stuck when a tab was
 *  renamed */
const pickShaderTab = (tabs: ReadonlyArray<TabInfo>): TabInfo | null => {
  if(tabs.length < 1) return null;

  const named = tabs.find(t => t.name === SHADER_TAB_NAME);
  if(named) return named;

  const glslish = tabs.find(t => isGlslMode(t.mode));
  if(glslish) return glslish;

  const active = tabs.find(t => t.isActive);
  return active ?? tabs[0];
};

// --------------------------------------------------------------------------------
const isGlslMode = (mode: string): boolean => {
  const lower = mode.toLowerCase();
  return (lower === 'glsl') || (lower === 'x-shader/x-fragment') || lower.includes('clike');
};
