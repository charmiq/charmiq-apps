import { dbg } from './debug';

// pulls the fragment shader source from the sibling CodeMirror editor App.
// The editor doesn't advertise a dedicated capability for its content -- it
// only surfaces the generic `charmiq.command` block the Platform multiplexes
// across every advertising widget. So the bridge:
//   1. discovers all `charmiq.command` providers in the Document
//   2. functionally probes each by calling listTabs(); the editor replies with
//      an array of TabInfo records. Anything that rejects (method not found),
//      returns a non-array, or returns an array of the wrong shape isn't the
//      editor. A structural `typeof p.method === 'function'` check can't be
//      used because the Platform's discovery proxy returns a method wrapper
//      for EVERY property access -- any provider would satisfy it
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

  /** last source returned by getShader() -- used only for dbg delta logging */
  private lastLoggedLength: number | null = null;

  // == Public =====================================================================
  /** discover + cache the editor provider. Safe to call with no CharmIQ bridge
   *  (standalone preview) -- getShader() will then always return null */
  public async init(charmiq: any): Promise<void> {
    if(!charmiq?.discover) {
      dbg('editor', 'discover skipped (standalone — no charmiq bridge)');
      return;
    } /* else -- platform bridge is present */

    try {
      const providers = await charmiq.discover('charmiq.command') as ReadonlyArray<EditorCommandProvider> | null;
      if(!providers || (providers.length < 1)) {
        dbg('editor', 'discover: no charmiq.command providers yet');
        return;
      } /* else -- at least one provider to inspect */

      dbg('editor', `discover: ${providers.length} charmiq.command provider(s); probing each with listTabs()`);

      // functional probe: call listTabs() on every provider in parallel. The editor
      // replies with an array of tabs; other providers reject with 'method not found'.
      // probeListTabs() swallows the reject into a tagged result so Promise.all never throws
      const probes = await Promise.all(providers.map(p => probeListTabs(p)));
      for(let i=0; i<probes.length; i++) {
        const probe = probes[i];
        if(probe.kind !== 'editor') {
          dbg('editor', `discover: provider #${i} ${probe.reason}`);
          continue;
        } /* else -- looks like the editor */
        this.provider = providers[i];
        dbg('editor', `discover: matched provider #${i} (${probe.tabCount} tab(s))`);
        break;
      }
      if(!this.provider) dbg('editor', 'discover: no provider matched the editor shape');
    } catch(error) {
      console.error('shader-demo: failed to discover codemirror-editor:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** true if a CodeMirror editor was found in the Document */
  public isReady(): boolean { return this.provider !== null; }

  // ------------------------------------------------------------------------------
  /** read the current shader source from the editor. Returns null if the bridge isn't
   *  connected, if no tab named 'shader.frag' exists, or if the editor threw. Callers
   *  treat null as "keep the previous program running and show the connection status
   *  in the error strip" */
  public async getShader(): Promise<string | null> {
    if(!this.provider) return null;

    const started = performance.now();
    try {
      const tabs = await this.provider.listTabs();
      const tab = pickShaderTab(tabs);
      if(!tab) {
        dbg('editor', 'getShader: no matching tab', { tabs: tabs.map(t => ({ name: t.name, mode: t.mode })) });
        return null;
      } /* else -- found a tab */

      const text = await this.provider.getText({ tabId: tab.id });
      const length = text?.length ?? 0;
      // only log when the returned length changes -- the poller calls this twice a
      // second and an unchanged readout is noise
      if(length !== this.lastLoggedLength) {
        dbg('editor', `getShader: ${length} chars from '${tab.name}' [${tab.mode}]`, {
          tabId: tab.id,
          ms: Math.round(performance.now() - started),
          previousLength: this.lastLoggedLength
        });
        this.lastLoggedLength = length;
      } /* else -- same length; skip the log */
      return text ?? null;
    } catch(error) {
      console.error('shader-demo: failed to read shader text from editor:', error);
      return null;
    }
  }
}

// == Util ========================================================================
/** result of probing a single provider with listTabs(). `editor` means the provider
 *  replied with a valid tabs array; `reject` captures 'method not found' and other
 *  errors; `shape` captures non-array / wrong-shape returns */
type ProbeResult =
  | { kind: 'editor'; tabCount: number; }
  | { kind: 'reject'; reason: string; }
  | { kind: 'shape';  reason: string; };

// ................................................................................
/** probe a discovered charmiq.command provider to decide whether it's the editor.
 *  Returns a tagged result so the caller can log why a provider was rejected. An
 *  empty array is accepted as "editor present but not yet seeded" -- getShader()
 *  will return null and the caller falls back to the starter shader */
const probeListTabs = async (p: EditorCommandProvider): Promise<ProbeResult> => {
  try {
    const value = await p.listTabs();
    if(!Array.isArray(value)) return { kind: 'shape', reason: 'listTabs() returned non-array' };
    if(value.length < 1)      return { kind: 'editor', tabCount: 0 }/*empty editor -- still a match*/;

    const first = value[0] as Partial<TabInfo>;
    if((typeof first.id !== 'string') || (typeof first.name !== 'string') || (typeof first.mode !== 'string')) {
      return { kind: 'shape', reason: 'listTabs() returned array with wrong tab shape' };
    } /* else -- at least the first tab has the editor's shape */
    return { kind: 'editor', tabCount: value.length };
  } catch(error) {
    const message = (error instanceof Error) ? error.message : String(error);
    return { kind: 'reject', reason: `listTabs() rejected: ${message}` };
  }
};

// --------------------------------------------------------------------------------
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
