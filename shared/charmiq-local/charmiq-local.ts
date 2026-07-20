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
// keyed by selector so multiple named blocks coexist; the default key covers the
// common single-block case
const makeAppContent = () => {
  const listeners = new Set<(value: any) => void>();
  const store = () => readJson<Record<string, string>>(APP_CONTENT_KEY, {});
  const keyFor = (selector?: string) => selector ?? '__default__';
  return {
    get: (selector?: string) => Promise.resolve(store()[keyFor(selector)] ?? ''),
    set: (content: string, selector?: string) => {
      const next = { ...store(), [keyFor(selector)]: content };
      writeJson(APP_CONTENT_KEY, next);
      listeners.forEach(emit => emit({ id: keyFor(selector), content }));
      return Promise.resolve();
    },
    applyChanges: () => Promise.resolve()/*OT is a Platform concern; the harness only round-trips full content*/,
    remove: (selector?: string) => {
      const next = { ...store() }; delete next[keyFor(selector)];
      writeJson(APP_CONTENT_KEY, next);
      return Promise.resolve();
    },
    onChange$: () => makeObservable(() => ({ id: '__default__', content: store().__default__ ?? '' }), listeners),
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
