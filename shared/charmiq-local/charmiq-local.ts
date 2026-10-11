import type { OAuthAuth, OAuthAuthDescriptor } from '../charmiq';

// the local-dev bridge harness — a stand-in `window.charmiq` so a bridge app can
// run in a plain browser (opened from a `build-app --harness` build) instead of
// only inside the Platform. It installs ONLY when no real bridge is present, and
// bails out the instant one is, so it can never affect a Platform build.
//
//   appState / appContent → localStorage (survives reload)
//   fetch                 → the real window.fetch (fine for CORS-friendly APIs)
//   oauth                 → a paste-an-access-token flow (see below), with the
//                           same listAuth / getValidAuth({connectionKey}) shape
//                           the app uses against the real bridge
//   mcp / generation      → throw a clear "not in the local harness" error
//
// OAuth locally: the Platform's server-side broker cannot exist in a plain
// browser, so the harness asks the developer to paste an access token (grab one
// from Google's OAuth Playground with the gmail.readonly scope). It calls the
// provider's userinfo endpoint to fill in the account's email / name / avatar,
// mirroring what the Platform returns
// ********************************************************************************
// == Storage Keys ================================================================
const APP_STATE_KEY = 'charmiq-local:appState';
const APP_CONTENT_KEY = 'charmiq-local:appContent';
const OAUTH_KEY = 'charmiq-local:oauth';

// a stored account: the descriptor the app sees plus the pasted token the harness
// hands back on demand (the real bridge keeps the token server-side; the harness
// has nowhere else to put it)
type StoredAccount = OAuthAuthDescriptor & { accessToken: string; };

// == Small Utilities =============================================================
const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch(error) {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => localStorage.setItem(key, JSON.stringify(value));

/** a minimal Observable-shaped object: emits the current value once, then on every
 *  change. Enough for apps that subscribe to appState; `pipe` returns self */
const makeObservable = <T>(getValue: () => T, listeners: Set<(value: T) => void>) => {
  const observable = {
    subscribe(next: ((value: T) => void) | Partial<{ next: (value: T) => void; }>) {
      const emit = (typeof next === 'function') ? next : (next.next ?? (() => {}));
      emit(getValue());
      listeners.add(emit);
      return { unsubscribe: () => listeners.delete(emit) };
    },
    pipe: () => observable,
  };
  return observable;
};

// == App State ===================================================================
const makeAppState = () => {
  const listeners = new Set<(value: any) => void>();
  const get = () => readJson<any>(APP_STATE_KEY, null);
  return {
    get: () => Promise.resolve(get()),
    set: (state: any) => { writeJson(APP_STATE_KEY, state); listeners.forEach(emit => emit(state)); return Promise.resolve(); },
    onChange$: () => makeObservable(get, listeners),
  };
};

// == App Content =================================================================
// app-content blocks as the Platform holds them: an ordered list, each with an id and
// an optional name. A selector picks a block as the Platform does -- none for the
// first, `[n]` by index, `[name='x']` or `[id='x']` -- and every change carries the
// block's id and name. `onChange$()` with no selector emits every block, then each
// addition, update and deletion; with a selector, that one block appearing, changing
// or disappearing
type AppContentBlock = Readonly<{ id: string; name?: string; content: string; }>;
type AppContentChange = Readonly<{ id: string; name?: string; content: string; deleted?: boolean; }>;

/** the index of the block a selector picks, or -1 when none matches */
const resolveAppContent = (blocks: readonly AppContentBlock[], selector?: string): number => {
  const query = selector?.trim() ?? '';
  if(!query) return (blocks.length > 0) ? 0 : -1;
  const index = query.match(/^\[(\d+)\]$/);
  if(index) return (Number(index[1]) < blocks.length) ? Number(index[1]) : -1;
  const name = query.match(/^\[name=['"]([^'"]+)['"]\]$/);
  if(name) return blocks.findIndex(block => block.name === name[1]);
  const id = query.match(/^\[id=['"]([^'"]+)['"]\]$/);
  if(id) return blocks.findIndex(block => block.id === id[1]);
  throw new Error(`Invalid app-content selector: ${selector}`);
};

// --------------------------------------------------------------------------------
/** the key the selector-keyed layout gave content stored without a selector */
const DEFAULT_CONTENT_KEY = '__default__';

/** the name a `[name='x']` selector gives a block it creates */
const selectorName = (selector?: string): string | undefined => selector?.trim().match(/^\[name=['"]([^'"]+)['"]\]$/)?.[1];

/** the id a block converted from the selector-keyed layout takes: its complete key
 *  hex-encoded, so the same key always gives the same id (conversion repeats on every
 *  read until a write), distinct keys give distinct ids, and the id is safe in a
 *  `[id='x']` selector. A created block's id never repeats a stored one */
const convertedBlockId = (key: string): string =>
  `app-content-key-${Array.from(new TextEncoder().encode(key), byte => byte.toString(16).padStart(2, '0')).join('')}`;

/** an id no stored block holds: a reload starts a new harness, so ids never come
 *  from a counter */
const newBlockId = (blocks: readonly AppContentBlock[]): string => {
  for(;;) {
    const id = `app-content-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    if(!blocks.some(block => block.id === id)) return id;
  }
};

// --------------------------------------------------------------------------------
const isSameBlock = (a: AppContentBlock, b: AppContentBlock): boolean => (a.name === b.name) && (a.content === b.content);

// --------------------------------------------------------------------------------
const makeAppContent = () => {
  const writes = new Set<(blocks: readonly AppContentBlock[]) => void>();
  const blocks = (): AppContentBlock[] => {
    const stored = readJson<unknown>(APP_CONTENT_KEY, []);
    if(Array.isArray(stored)) return stored as AppContentBlock[];
    if(!stored || (typeof stored !== 'object')) return []/*nothing stored*/;

    // the selector-keyed layout this harness stored before blocks (`__default__` for
    // no selector): each entry is a block, named when its selector named one, the
    // unselected block first. Converted on every read until the next write stores
    // blocks (SEE: convertedBlockId)
    return Object.entries(stored as Record<string, string>)
      .sort(([a], [b]) => Number(b === DEFAULT_CONTENT_KEY) - Number(a === DEFAULT_CONTENT_KEY))
      .map(([key, content]) => ({ id: convertedBlockId(key), name: selectorName(key), content }));
  };
  const write = (next: AppContentBlock[]) => { writeJson(APP_CONTENT_KEY, next); writes.forEach(notify => notify(next)); };

  // the changes between two lists of blocks, as one subscription sees them
  const changes = (selector: string | undefined, prev: readonly AppContentBlock[], next: readonly AppContentBlock[]): AppContentChange[] => {
    if(selector === undefined) {
      const prevById = new Map(prev.map(block => [block.id, block]));
      const nextIds = new Set(next.map(block => block.id));
      return [
        ...next.filter(block => { const before = prevById.get(block.id); return !before || !isSameBlock(before, block); }),
        ...prev.filter(block => !nextIds.has(block.id)).map(block => ({ ...block, deleted: true })),
      ];
    } /* else -- one selected block */
    const before = prev[resolveAppContent(prev, selector)];
    const after = next[resolveAppContent(next, selector)];
    if(after && (!before || (before.id !== after.id) || !isSameBlock(before, after))) return [after];
    if(before && !after) return [{ ...before, deleted: true }];
    return []/*unchanged*/;
  };

  return {
    onChange$: (selector?: string) => {
      const observable = {
        subscribe(next: ((value: AppContentChange) => void) | Partial<{ next: (value: AppContentChange) => void; }>) {
          const emit = (typeof next === 'function') ? next : (next.next ?? (() => {}));
          let seen = blocks();
          changes(selector, [], seen).forEach(emit);
          const notify = (current: readonly AppContentBlock[]) => { const prev = seen; seen = [...current]; changes(selector, prev, seen).forEach(emit); };
          writes.add(notify);
          return { unsubscribe: () => writes.delete(notify) };
        },
        pipe: () => observable,
      };
      return observable;
    },
    // a call's changes apply in order, each position measured after the changes
    // before it; a missing block is created, named from a `[name='x']` selector.
    // There is no other writer here, so there is nothing to merge
    applyChanges: async (edits: ReadonlyArray<Readonly<{ from: number; to: number; insert?: string; }>>, selector?: string) => {
      const next = blocks();
      let index = resolveAppContent(next, selector);
      if(index < 0) index = next.push({ id: newBlockId(next), name: selectorName(selector), content: '' }) - 1;
      const content = edits.reduce((text, edit) => text.slice(0, edit.from) + (edit.insert ?? '') + text.slice(edit.to), next[index].content);
      next[index] = { ...next[index], content };
      write(next);
    },

    // every call crosses the Platform bridge, so a refusal is a rejection, never a throw
    get: async (selector?: string) => { const current = blocks(); return current[resolveAppContent(current, selector)]?.content ?? ''; },
    // omitted content keeps a block's text (a rename); a block it creates is empty
    set: async (content: string | undefined, selector?: string, name?: string) => {
      const next = blocks();
      const index = resolveAppContent(next, selector);
      if(index < 0) next.push({ id: newBlockId(next), name: name ?? selectorName(selector), content: content ?? '' });
      else next[index] = { ...next[index], ...((name !== undefined) ? { name } : {}), ...((content !== undefined) ? { content } : {}) };
      write(next);
    },
    remove: async (selector?: string) => {
      const next = blocks();
      const index = resolveAppContent(next, selector);
      if(index >= 0) { next.splice(index, 1); write(next); }
    },
  };
};

// == OAuth =======================================================================
const makeOAuth = () => {
  const accounts = (): StoredAccount[] => readJson<StoredAccount[]>(OAUTH_KEY, []);
  const saveAccounts = (next: StoredAccount[]) => writeJson(OAUTH_KEY, next);
  const toDescriptor = ({ accessToken: _accessToken, ...descriptor }: StoredAccount): OAuthAuthDescriptor => descriptor;
  const toAuth = (account: StoredAccount): OAuthAuth => ({ ...toDescriptor(account), accessToken: account.accessToken });

  // connect a new account by pasting a token, then enrich it from userinfo
  const connect = async (providerUrl: string, scopes: string[]): Promise<StoredAccount> => {
    const accessToken = await promptForToken();
    const profile = await fetchGoogleProfile(accessToken);
    const account: StoredAccount = {
      id: `local:${profile.id}`,
      providerUrl,
      integrationId: 'local'/*synthetic — the harness models one Integration per provider*/,
      providerAccountId: profile.id,
      scopes,
      accessToken,
      expiresAt: Date.now() + (60 * 60 * 1000)/*paste tokens last ~1h*/,
      displayIdentifier: profile.email,
      displayName: profile.name,
      displayAvatar: profile.picture,
    };
    const others = accounts().filter(existing => existing.id !== account.id);
    saveAccounts([...others, account]);
    return account;
  };

  return {
    register: () => Promise.resolve(),

    listAuth: (config: { providerUrl?: string; }) =>
      Promise.resolve(accounts().filter(account => !config.providerUrl || (account.providerUrl === config.providerUrl)).map(toDescriptor)),

    getValidAuth: async (config: { providerUrl?: string; scopes?: string[]; prompt?: string; connectionKey?: string; }) => {
      const providerUrl = config.providerUrl ?? 'https://accounts.google.com';
      const scopes = config.scopes ?? ['https://www.googleapis.com/auth/gmail.readonly'];

      if(config.connectionKey) {
        const found = accounts().find(account => account.id === config.connectionKey);
        if(!found) throw new Error('The requested account is not connected to this application');
        return toAuth(found);
      } /* else -- resolve or connect an account */

      const existing = accounts();
      if((config.prompt === 'select_account') || (existing.length < 1)) return toAuth(await connect(providerUrl, scopes));
      return toAuth(existing[0]!);
    },

    revokeAuth: (auth: { id: string; }) => { saveAccounts(accounts().filter(account => account.id !== auth.id)); return Promise.resolve(); },
  };
};

// -- Paste-token UI --------------------------------------------------------------
/** a tiny modal asking for an access token. Resolves with the pasted token, or
 *  rejects if the developer cancels (mirroring a cancelled Platform picker) */
const promptForToken = (): Promise<string> => new Promise((resolve, reject) => {
  const overlay = document.createElement('div');
  overlay.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);font-family:-apple-system,BlinkMacSystemFont,sans-serif;');
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:460px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">Local harness — paste an access token</div>
      <div style="font-size:13px;color:#555;line-height:1.5;margin-bottom:12px">The real OAuth broker only runs inside CharmIQ. For local testing, paste a Google access token (OAuth Playground, <code>gmail.readonly</code> scope).</div>
      <input type="text" placeholder="ya29.…" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-family:monospace;font-size:12px;margin-bottom:16px" />
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button data-cancel style="padding:8px 16px;border:none;border-radius:6px;background:#f3f4f6;color:#374151;cursor:pointer">Cancel</button>
        <button data-ok style="padding:8px 16px;border:none;border-radius:6px;background:#4A90E2;color:#fff;cursor:pointer">Use token</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('input')!;
  const close = () => overlay.remove();
  input.focus();
  overlay.querySelector('[data-cancel]')!.addEventListener('click', () => { close(); reject(new Error('User cancelled the local token prompt')); });
  overlay.querySelector('[data-ok]')!.addEventListener('click', () => {
    const token = input.value.trim();
    if(!token) return;
    close();
    resolve(token);
  });
});

// -- Provider profile ------------------------------------------------------------
/** fetch the Google account profile so the harness can fill in email / name /
 *  avatar, as the Platform does. Degrades to token-derived placeholders on failure */
const fetchGoogleProfile = async (accessToken: string): Promise<{ id: string; email: string; name?: string; picture?: string; }> => {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    if(response.ok) {
      const info = await response.json() as { id?: string; email?: string; name?: string; picture?: string; };
      return { id: info.id ?? info.email ?? 'local-account', email: info.email ?? 'local@account', name: info.name, picture: info.picture };
    } /* else -- fall through to placeholders */
  } catch(error) { /* offline / CORS — use placeholders */ }
  return { id: `local-${accessToken.slice(-8)}`, email: 'local@account' };
};

// == Capability Registry (app-to-app) ============================================
const makeRegistry = () => {
  const capabilities = new Map<string, Record<string, (...args: any[]) => any>>();
  return {
    advertise: (capability: string, methods: Record<string, (...args: any[]) => any>) => { capabilities.set(capability, methods); },
    discover: <T>(capability: string) => Promise.resolve((capabilities.get(capability) ?? {}) as T),
    discover$: <T>(capability: string) => makeObservable<T[]>(() => (capabilities.has(capability) ? [capabilities.get(capability) as T] : []), new Set()),
    exportCommands: (methods: Record<string, (...args: any[]) => any>) => { capabilities.set('charmiq.command', methods); },
  };
};

// == Unavailable Surfaces ========================================================
const unavailable = (name: string) => () => { throw new Error(`charmiq.${name} is not available in the local harness`); };

// == Install =====================================================================
/** install the local bridge — a no-op when a real `window.charmiq` is present, so
 *  it never shadows the Platform bridge */
export const installLocalBridge = (): void => {
  const globalWindow = window as any;
  if(globalWindow.charmiq) return/*real bridge present — never shadow it*/;

  const registry = makeRegistry();
  globalWindow.charmiq = {
    appState: makeAppState(),
    appContent: makeAppContent(),
    oauth: makeOAuth(),
    fetch: (url: string, options?: RequestInit) => fetch(url, options),

    advertise: registry.advertise,
    discover: registry.discover,
    discover$: registry.discover$,
    exportCommands: registry.exportCommands,

    mcp: {
      listServers: unavailable('mcp.listServers'),
      connect: unavailable('mcp.connect'),
      disconnect: unavailable('mcp.disconnect'),
      listTools: unavailable('mcp.listTools'),
      callTool: unavailable('mcp.callTool'),
    },
    visualEditor: { isActive: () => false, activate: () => {}, deactivate: () => {}, applyStyle: () => {} },
    visualDesigner: { isActive: () => false, activate: () => {}, deactivate: () => {} },
  };

  console.info('[charmiq-local] local bridge harness installed — window.charmiq is a localStorage-backed stand-in');
};
