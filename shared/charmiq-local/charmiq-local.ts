import { readLocalApplicationResource } from '@charmiq/service-common/application/localResource';
import { appContentLayer, type AppContentObservableFactory, type AppContentObserver } from '@charmiq/service-common/richtextEditor/proseMirror/node/appContentLayer';
import { Observable } from 'rxjs';

import type { AppContentChange, AppContentEdit, AppContentGuard, AppContentSnapshot, AppContentWrite, ContentChange, OAuthAuth, OAuthAuthDescriptor } from '../charmiq';

// the local-dev bridge harness — a stand-in `window.charmiq` so a bridge app can
// run in a plain browser (opened from a `build-app --harness` build) instead of
// only inside the Platform. It installs ONLY when no real bridge is present, and
// bails out the instant one is, so it can never affect a Platform build.
//
//   appState / appContent → localStorage (survives reload)
//   fetch                 → the real window.fetch (fine for CORS-friendly APIs)
//   resources             → the texts `build-app` read for the manifest's declared
//                           resources and embedded in the page, refused as the
//                           Platform refuses them
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
/** the app-content layer's streams as the bridge's are: RxJS, so operators apply and an
 *  error ends the stream and releases what it held */
const appContentObservable: AppContentObservableFactory = <T, >(producer: (observer: AppContentObserver<T>) => () => void) =>
  new Observable<T>(subscriber => producer({ next: value => subscriber.next(value), error: failure => subscriber.error(failure) }));

// app-contents as the Platform holds them: an ordered list, each with an id and an
// optional name. A selector picks an app-content as the Platform does -- none for the
// first, `[n]` by index, `[name='x']` or `[id='x']` -- and every change carries the
// app-content's id, name and revision. `onChange$()` with no selector emits every
// app-content, then each addition, update and deletion; with a selector, that one
// app-content appearing, changing or disappearing. Revisions belong to this harness
// session, as they belong to the Platform's editor: every write to an app-content gives
// it a new one, a removed app-content's is forgotten, and a reload starts over.
// `edits$()` streams an app-content's actual edits with the same revisions, naming a
// tagged write back as `ack`
type StoredAppContent = Readonly<{ id: string; name?: string; content: string; }>;

/** the index of the app-content a selector picks, or -1 when none matches */
const resolveAppContent = (appContents: readonly StoredAppContent[], selector?: string): number => {
  const query = selector?.trim() ?? '';
  if(!query) return (appContents.length > 0) ? 0 : -1;
  const index = query.match(/^\[(\d+)\]$/);
  if(index) return (Number(index[1]) < appContents.length) ? Number(index[1]) : -1;
  const name = query.match(/^\[name=['"]([^'"]+)['"]\]$/);
  if(name) return appContents.findIndex(appContent => appContent.name === name[1]);
  const id = query.match(/^\[id=['"]([^'"]+)['"]\]$/);
  if(id) return appContents.findIndex(appContent => appContent.id === id[1]);
  throw new Error(`Invalid app-content selector: ${selector}`);
};

// --------------------------------------------------------------------------------
/** the key the selector-keyed layout gave content stored without a selector */
const DEFAULT_CONTENT_KEY = '__default__';

/** the name a `[name='x']` selector gives an app-content it creates */
const selectorName = (selector?: string): string | undefined => selector?.trim().match(/^\[name=['"]([^'"]+)['"]\]$/)?.[1];

/** the id an app-content converted from the selector-keyed layout takes: its
 *  complete key hex-encoded, so the same key always gives the same id (conversion
 *  repeats on every read until a write), distinct keys give distinct ids, and the id
 *  is safe in a `[id='x']` selector. A created app-content's id never repeats a
 *  stored one */
const convertedAppContentId = (key: string): string =>
  `app-content-key-${Array.from(new TextEncoder().encode(key), byte => byte.toString(16).padStart(2, '0')).join('')}`;

/** an id no stored app-content holds: a reload starts a new harness, so ids never come
 *  from a counter */
const newAppContentId = (appContents: readonly StoredAppContent[]): string => {
  for(;;) {
    const id = `app-content-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    if(!appContents.some(appContent => appContent.id === id)) return id;
  }
};

// --------------------------------------------------------------------------------
const isSameChange = (a: AppContentChange, b: AppContentChange): boolean => (a.name === b.name) && (a.content === b.content) && (a.revision === b.revision);

/** a refusal as the Platform bridge rejects it: an Error carrying the code */
const bridgeError = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/** the edits, once the whole payload is checked as the Platform checks it: a list,
 *  each with integer offsets `0 ≤ from ≤ to ≤ length` (measured after the edits
 *  before it) and an optional text insert */
const validChanges = (length: number, changes: unknown): ContentChange[] => {
  if(!Array.isArray(changes)) throw bridgeError('functions/invalid-argument', 'App-content edits are a list.');
  let current = length;
  changes.forEach((change: unknown, index) => {
    const { from, to, insert } = (change ?? {}) as Partial<Record<keyof ContentChange, unknown>>;
    if((typeof change !== 'object') || (typeof from !== 'number') || (typeof to !== 'number') || ((insert !== undefined) && (typeof insert !== 'string'))) throw bridgeError('functions/invalid-argument', `App-content edit ${index + 1} is not an edit: from and to are offsets, and insert, when present, is text.`);
    if(!Number.isInteger(from) || !Number.isInteger(to) || (from < 0) || (from > to) || (to > current)) throw bridgeError('functions/invalid-argument', `App-content edit ${index + 1} (from ${from} to ${to}) is outside the app-content's ${current} characters.`);
    current += ((insert as string | undefined)?.length ?? 0) - (to - from);
  });
  return changes;
};

// --------------------------------------------------------------------------------
const makeAppContent = () => {
  const writes = new Set<(appContents: readonly AppContentChange[]) => void>();
  const edited = new Set<(edits: readonly AppContentEdit[]) => void>();

  // revisions: `${session}:${n}`, minted for an app-content when first read and on
  // every write
  const session = Math.random().toString(36).slice(2, 10);
  let nextRevision = 0;
  const revisions = new Map<string, string>();
  const revisionOf = (id: string): string => {
    const known = revisions.get(id);
    if(known) return known;
    const minted = `${session}:${nextRevision++}`;
    revisions.set(id, minted);
    return minted;
  };
  const withRevisions = (current: readonly StoredAppContent[]): Array<AppContentChange & Readonly<{ revision: string; }>> => current.map(appContent => ({ ...appContent, revision: revisionOf(appContent.id) }));
  const appContents = (): StoredAppContent[] => {
    const stored = readJson<unknown>(APP_CONTENT_KEY, []);
    if(Array.isArray(stored)) return stored as StoredAppContent[];
    if(!stored || (typeof stored !== 'object')) return []/*nothing stored*/;

    // the selector-keyed layout this harness stored before the list (`__default__`
    // for no selector): each entry is an app-content, named when its selector named
    // one, the unselected one first. Converted on every read until the next write
    // stores the list (SEE: convertedAppContentId)
    return Object.entries(stored as Record<string, string>)
      .sort(([a], [b]) => Number(b === DEFAULT_CONTENT_KEY) - Number(a === DEFAULT_CONTENT_KEY))
      .map(([key, content]) => ({ id: convertedAppContentId(key), name: selectorName(key), content }));
  };
  /** stores the app-contents, the `written` one with a new revision, made by `made`
   *  (its edits, and the write's tag) when the write was edits; otherwise its whole
   *  text is replaced */
  const write = (next: StoredAppContent[], written?: string, made?: Readonly<{ changes: readonly ContentChange[]; ack?: string; }>) => {
    const before = new Map(withRevisions(appContents()).map(appContent => [appContent.id, appContent]));
    if(written !== undefined) revisions.delete(written);
    const ids = new Set(next.map(appContent => appContent.id));
    [...revisions.keys()].filter(id => !ids.has(id)).forEach(id => revisions.delete(id))/*gone: whatever returns is new*/;
    writeJson(APP_CONTENT_KEY, next);
    const current = withRevisions(next);
    writes.forEach(notify => notify(current));

    const edits: AppContentEdit[] = [];
    before.forEach((appContent, id) => { if(!ids.has(id)) edits.push({ kind: 'removed', id, base: appContent.revision }); });
    current.forEach(appContent => {
      const prior = before.get(appContent.id);
      if(!prior) { edits.push({ kind: 'created', id: appContent.id, revision: appContent.revision, content: appContent.content }); return; }
      if(prior.revision === appContent.revision) return/*unchanged*/;
      const changes = ((appContent.id === written) && made) ? made.changes : [{ from: 0, to: prior.content.length, insert: appContent.content }];
      edits.push({ kind: 'changes', id: appContent.id, base: prior.revision, revision: appContent.revision, changes, ...(((appContent.id === written) && made?.ack) ? { ack: made.ack } : {}) });
    });
    edited.forEach(notify => notify(edits));
  };

  // the changes between two lists of app-contents, as one subscription sees them
  const changes = (selector: string | undefined, prev: readonly AppContentChange[], next: readonly AppContentChange[]): AppContentChange[] => {
    if(selector === undefined) {
      const prevById = new Map(prev.map(appContent => [appContent.id, appContent]));
      const nextIds = new Set(next.map(appContent => appContent.id));
      return [
        ...next.filter(appContent => { const before = prevById.get(appContent.id); return !before || !isSameChange(before, appContent); }),
        ...prev.filter(appContent => !nextIds.has(appContent.id)).map(appContent => ({ ...appContent, deleted: true })),
      ];
    } /* else -- one selected app-content */
    const before = prev[resolveAppContent(prev, selector)];
    const after = next[resolveAppContent(next, selector)];
    if(after && (!before || (before.id !== after.id) || !isSameChange(before, after))) return [after];
    if(before && !after) return [{ ...before, deleted: true }];
    return []/*unchanged*/;
  };

  const primitives = {
    onChange$: (selector?: string) => {
      const observable = {
        subscribe(next: ((value: AppContentChange) => void) | Partial<{ next: (value: AppContentChange) => void; }>) {
          const emit = (typeof next === 'function') ? next : (next.next ?? (() => {}));
          let seen: readonly AppContentChange[] = withRevisions(appContents());
          changes(selector, [], seen).forEach(emit);
          const notify = (current: readonly AppContentChange[]) => { const prev = seen; seen = current; changes(selector, prev, seen).forEach(emit); };
          writes.add(notify);
          return { unsubscribe: () => writes.delete(notify) };
        },
        pipe: () => observable,
      };
      return observable;
    },
    // the app-content a selector names now (an `[id='x']` selector names that
    // app-content whether or not it exists yet): where it stands, then its edits
    edits$: (selector?: string) => {
      const observable = {
        subscribe(next: ((value: AppContentEdit) => void) | Partial<{ next: (value: AppContentEdit) => void; error: (error: Error) => void; }>) {
          const emit = (typeof next === 'function') ? next : (next.next ?? (() => {}));
          const current = withRevisions(appContents());
          const appContent = current[resolveAppContent(current, selector)];
          const id = appContent?.id ?? selector?.trim().match(/^\[id=['"]([^'"]+)['"]\]$/)?.[1];
          if(!id) {
            if(typeof next !== 'function') next.error?.(bridgeError('functions/not-found', `No app-content matches '${selector ?? ''}'.`));
            return { unsubscribe: () => {} };
          } /* else -- the app-content, or the id it will have */
          emit(appContent ? { kind: 'created', id, revision: appContent.revision, content: appContent.content } : { kind: 'absent', id });
          const notify = (edits: readonly AppContentEdit[]) => edits.filter(edit => edit.id === id).forEach(emit);
          edited.add(notify);
          return { unsubscribe: () => edited.delete(notify) };
        },
        pipe: () => observable,
      };
      return observable;
    },
    snapshot: async (selector?: string): Promise<AppContentSnapshot | null> => {
      const current = appContents();
      const appContent = current[resolveAppContent(current, selector)];
      return appContent ? { id: appContent.id, content: appContent.content, revision: revisionOf(appContent.id) } : null;
    },

    // a call's changes apply in order, each position measured after the changes
    // before it, and all or none apply. Guarded, they apply only to the guard's
    // app-content at the guard's revision; unguarded, a missing app-content is
    // created, named from a `[name='x']` selector. A guarded write may carry a tag,
    // named back by the edit it makes. There is no other writer here, so there is
    // nothing to merge
    applyChanges: async (edits: readonly ContentChange[], selector?: string, guard?: AppContentGuard, tag?: AppContentWrite) => {
      const next = appContents();
      let index = resolveAppContent(next, selector);
      if((tag !== undefined) && ((guard === undefined) || (typeof tag?.editId !== 'string') || !tag.editId)) throw bridgeError('functions/invalid-argument', 'An app-content write tag names an edit id, and comes with a guard.');
      if(guard !== undefined) {
        const { id, revision } = (guard ?? {}) as Partial<Record<keyof AppContentGuard, unknown>>;
        if((typeof id !== 'string') || !id || (typeof revision !== 'string') || !revision) throw bridgeError('functions/invalid-argument', 'An app-content guard names an app-content id and a revision.');
        if((index < 0) || (next[index].id !== id) || (revisionOf(id) !== revision)) throw bridgeError('app/content-conflict', `App-content ${id} is no longer at revision ${revision}. Nothing was written.`);
      } /* else -- unguarded */
      const valid = validChanges((index < 0) ? 0 : next[index].content.length, edits);
      if(index < 0) index = next.push({ id: newAppContentId(next), name: selectorName(selector), content: '' }) - 1;
      const content = valid.reduce((text, edit) => text.slice(0, edit.from) + (edit.insert ?? '') + text.slice(edit.to), next[index].content);
      next[index] = { ...next[index], content };
      write(next, next[index].id, { changes: valid, ack: tag?.editId });
    },

    // every call crosses the Platform bridge, so a refusal is a rejection, never a throw
    get: async (selector?: string) => { const current = appContents(); return current[resolveAppContent(current, selector)]?.content ?? ''; },
    // omitted content keeps an app-content's text (a rename); one it creates is empty
    set: async (content: string | undefined, selector?: string, name?: string) => {
      const next = appContents();
      const index = resolveAppContent(next, selector);
      if(index < 0) next.push({ id: newAppContentId(next), name: name ?? selectorName(selector), content: content ?? '' });
      else next[index] = { ...next[index], ...((name !== undefined) ? { name } : {}), ...((content !== undefined) ? { content } : {}) };
      write(next, next[(index < 0) ? (next.length - 1) : index].id);
    },
    // with a guard, only the guard's app-content and only at the guard's revision
    remove: async (selector?: string, guard?: AppContentGuard) => {
      const next = appContents();
      const index = resolveAppContent(next, selector);
      if(guard !== undefined) {
        const { id, revision } = (guard ?? {}) as Partial<Record<keyof AppContentGuard, unknown>>;
        if((typeof id !== 'string') || !id || (typeof revision !== 'string') || !revision) throw bridgeError('functions/invalid-argument', 'An app-content guard names an app-content id and a revision.');
        if((index < 0) || (next[index].id !== id) || (revisionOf(id) !== revision)) throw bridgeError('app/content-conflict', `App-content ${id} is no longer at revision ${revision}. Nothing was removed.`);
      } /* else -- unguarded */
      if(index >= 0) { next.splice(index, 1); write(next); }
    },
  };

  // the app-content of that name (no name: the first), created in one step when there
  // is none: an existing app-content, empty or not, is never written
  const createContent = async (name?: string, content = '') => {
    // a name is stored without the spaces around it, as the Platform's is; a name of
    // nothing else is refused before anything is written
    const named = name?.trim();
    if((named !== undefined) && !/^[^'"\]\[]+$/.test(named)) throw bridgeError('functions/invalid-argument', 'An app-content name is text without quotes or brackets.');
    const next = appContents();
    const index = resolveAppContent(next, (named !== undefined) ? `[name='${named}']` : undefined);
    if(index >= 0) return { id: next[index].id, created: false };
    next.push({ id: newAppContentId(next), ...((named !== undefined) ? { name: named } : {}), content });
    write(next, next[next.length - 1].id);
    return { id: next[next.length - 1].id, created: true };
  };

  // the app-contents an Application reads and writes, from the Platform's own layer
  // over these primitives: one behavior with the bridge (SEE: the CLI's harness
  // bundler)
  return { ...primitives, ...appContentLayer({ ...primitives, createContent }, appContentObservable) };
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
    resources: { text: (name: string) => readLocalApplicationResource(document, name) },

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
