// shared contract for the `window.charmiq` namespace exposed to every Application
// at runtime. Mirrors CharmIQAPI in the Platform's iframe-scripts bundle
// (packages/service-common/support/iframe-scripts/charmiq.ts).
// See shared/Plan.md for the long-term plan that will replace this file.
// ********************************************************************************
// NOTE: transitive types referenced by CharmIQAPI are inlined below (opaque or
//       minimal) so this file is self-contained — no imports from rxjs, platform
//       internals, etc.

// == Observable ==================================================================
// minimal structural duck-type for rxjs Observable. Apps use real rxjs at runtime
// (it's in the Application importMap); this interface declares just enough surface
// (`subscribe` + a loose `pipe`) for the shared type to be structurally assignable
// to and from the real rxjs Observable. Apps that chain operators (`.pipe(...)`)
// should import rxjs's typed operators at the call site
export interface Observable<T> {
  subscribe(observer: Partial<{
    next: (value: T) => void;
    error: (error: Error) => void;
    complete: () => void;
  }>): { unsubscribe: () => void; };
  subscribe(
    next: (value: T) => void,
    error?: (error: Error) => void,
    complete?: () => void
  ): { unsubscribe: () => void; };

  /** loosely typed for structural compat with real rxjs Observable; prefer to
   *  assign to an rxjs-typed Observable at the call site to recover full types */
  pipe(...operators: Array<(source: any) => any>): Observable<any>;
}

// == AppContent ==================================================================
/** structure for app-content change notifications */
export type AppContentChange = Readonly<{
  id: string;
  name?: string;
  content: string;
  deleted?: boolean;
}>;

/** incremental text change passed to AppContent.applyChanges */
export type ContentChange = Readonly<{
  from: number;
  to: number;
  insert?: string;
}>;

// --------------------------------------------------------------------------------
export interface AppContentAPI {
  /** Observable stream of content changes from the document. Emits whenever the
   *  content is updated (by you or other collaborators)
   *  @param selector optional selector to identify which app-content to observe
   *         (e.g. "[id='xyz']", "[name='editor']", "[0]")
   *  @returns Observable that emits the current content as an {@link AppContentChange} */
  onChange$: (selector?: string) => Observable<AppContentChange>;

  /** apply incremental text changes to the persisted content. This method is
   *  designed to be for efficient updates
   *  @param changes array of incremental changes to apply
   *  @param selector optional selector to identify which app-content to update
   *         (e.g. "[id='xyz']", "[name='editor']", "[0]")
   *  @returns Promise that resolves when changes are applied to the document */
  applyChanges: (changes: readonly ContentChange[], selector?: string) => Promise<void>;

  /** get current content value (one-time read). Use onChange$ for reactive updates
   *  instead of polling with get()
   *  @param selector optional selector to identify which app-content to get
   *  @returns Promise that resolves to current content as a string */
  get: (selector?: string) => Promise<string>;
  /** set the full content (replaces everything). Use applyChanges for incremental
   *  updates instead when possible for better collaboration
   *  @param content new text content
   *  @param selector optional selector to identify which app-content to set
   *  @param name optional name attribute to set on the app-content node
   *  @returns Promise that resolves when content is saved to the document */
  set: (content: string, selector?: string, name?: string) => Promise<void>;
  /** remove the app-content node
   *  @param selector optional selector to identify which app-content to remove
   *  @returns Promise that resolves when the node is removed from the document */
  remove: (selector?: string) => Promise<void>;
}

// == AppState ====================================================================
export interface AppStateAPI {
  /** Observable stream of state changes from the document. Emits whenever the
   *  state is updated (by you or other viewers)
   *  @returns Observable that emits the current state or null if no state exists */
  onChange$: () => Observable<any | null>;

  /** update the persisted state for this iframe widget
   *  @param state JSON-serializable state object
   *  @returns Promise that resolves when state is saved to the document */
  set: (state: any) => Promise<void>;

  /** get current state value (one-time read). Use onChange$ for reactive updates
   *  instead of polling with get()
   *  @returns Promise that resolves to current state or null */
  get: () => Promise<any | null>;
}

// == Capability (advertise / discover) ===========================================
// proxy returned by discover() / emitted by discover$(). Methods ending in `$`
// return Observables; other methods return Promises. Apps typically know the
// shape of the remote capability and cast the proxy to a concrete interface
export type CapabilityProxy = Record<string, (...args: any[]) => any>;

// --------------------------------------------------------------------------------
/** advertise an app-to-app capability. CORBA-style: methods receive **positional
 *  arguments** — a sibling that calls `proxy.foo(a, b)` arrives here as
 *  `foo(a, b)`. The `charmiq.command` capability is reserved and must be
 *  registered via {@link ExportCommands} instead — calling
 *  `advertise('charmiq.command', ...)` will throw at runtime */
export type AdvertiseCapability = (
  capability: string,
  methods: Record<string/*method name*/, Function>
) => void;
// --------------------------------------------------------------------------------
/** discover a single provider. The type parameter narrows the proxy to the
 *  concrete capability shape — callers usually know the remote's method set
 *  (e.g. `discover<GalleryCapability>('ai.charm.shared.imageGallery')`) and
 *  supplying it avoids an `as unknown as X` cast. Defaults to {@link CapabilityProxy}
 *  when not supplied */
export type DiscoverCapability  = <T = CapabilityProxy>(capability: string) => Promise<T>;
/** observable variant — emits the current provider set whenever it changes. The
 *  type parameter narrows each proxy as with {@link DiscoverCapability} */
export type DiscoverCapability$ = <T = CapabilityProxy>(capability: string) => Observable<T[]>;

// == Commands ====================================================================
/** export this Application's MCP-style command surface — the methods declared in
 *  the app's `manifest.json` under `commands` with JSON-Schema `inputSchema` /
 *  `outputSchema`. Methods receive a **single named-args object** whose
 *  properties match the method's `inputSchema`.
 *
 *  Targeted by the host (`editor.application.call`) and by sibling apps
 *  (`discover('charmiq.command')`) — both routes converge here */
export type ExportCommands = (
  methods: Record<string/*method name*/, Function>
) => void;

// == Fetch =======================================================================
export type CharmIQFetch = (
  url: string,
  options?: RequestInit & { responseType?: 'text' | 'arrayBuffer'; }
) => Promise<Response>;

// == MCP =========================================================================
/** opaque identifier (aliases to string at runtime) */
export type Identifier = string;

/** how the MCP SDK Client should reach the MCP server.
 *  - `direct`: browser connects directly to the MCP server URL (default)
 *  - `proxy` : route traffic through a CharmIQ Cloud Function (for remote servers
 *              that block browser CORS, e.g. googleapis.com) */
export type McpTransport = 'direct' | 'proxy';

/** how the parent should authenticate with the MCP server. Two OAuth sub-modes
 *  mirror the OAuth `getValidAuth` API:
 *  - `integrationId` — developer knows the exact integration (dev/testing)
 *  - `providerUrl`   — platform resolves the integration by provider */
export type McpServerAuth =
  | Readonly<{ type: 'platform'; }>
  | Readonly<{ type: 'oauth'; integrationId: Identifier; scopes: string[]; app: OAuthAppRegistration; }>
  | Readonly<{ type: 'oauth'; providerUrl: string; scopes?: string[]; }>
  | Readonly<{ type: 'none'; }>;

/** connect config for mcp.connect(). Two modes:
 *  - Organization-defined: `{ mcpServerId }` — Platform resolves URL, auth, tools
 *  - Explicit: `{ url, transport?, auth }` — developer provides URL + auth */
export type McpConnectConfig =
  | Readonly<{ mcpServerId: Identifier; }>
  | Readonly<{ url: string; transport?: McpTransport; auth: McpServerAuth; }>;

/** server info returned on successful connect */
export type McpServerInfo = Readonly<{
  name: string;
  version: string;
}>;

/** subset of the Organization's McpServerDefinition safe to expose to Applications.
 *  URL and auth details are deliberately omitted — the Platform resolves those on
 *  connect() */
export type McpServerDescriptor = Readonly<{
  /** the MCP server definition id (pass to connect() as `mcpServerId`) or the
   *  well-known CharmIQ MCP server id for Platform servers */
  id: Identifier;
  /** user-friendly server name */
  name: string;
  /** Organization-level tool ceiling — `undefined` means all tools are permitted */
  allowedTools?: readonly string[];
  /** `true` for CharmIQ Platform MCP servers (pre-connected, no connect() needed) */
  isPlatform?: boolean;
}>;

/** tool descriptor returned by listTools */
export type McpToolDescriptor = Readonly<{
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}>;

/** result from an MCP tool call */
export type McpToolCallResult = Readonly<{
  content: ReadonlyArray<{ type: string; text: string; }>;
  structuredContent?: unknown;
  isError?: boolean;
}>;

// --------------------------------------------------------------------------------
export interface CharmIQMcpAPI {
  /** connect to an MCP server. For external servers this triggers OAuth consent
   *  @returns server info from the MCP initialize handshake */
  connect: (connectionName: string, config: McpConnectConfig) => Promise<McpServerInfo>;
  /** disconnect from a previously connected MCP server */
  disconnect: (connectionName: string) => Promise<void>;

  /** list all available MCP servers (Platform + Organization-defined).
   *  Platform servers have `isPlatform: true` and are pre-connected (no connect()
   *  needed); Organization servers require connect() with `{ mcpServerId: id }` */
  listServers: () => Promise<McpServerDescriptor[]>;
  /** list available tools on a connected MCP server */
  listTools: (connectionName: string) => Promise<McpToolDescriptor[]>;

  /** call an MCP tool on a connected server */
  callTool: (
    connectionName: string,
    toolName: string,
    args?: Record<string, unknown>
  ) => Promise<McpToolCallResult>;
}

// == OAuth =======================================================================
/** metadata that apps must register before requesting OAuth */
export type OAuthAppRegistration = Readonly<{
  /** unique app identifier (reverse domain notation recommended) */
  appId: string;
  /** human-readable app name shown to users during consent */
  name: string;
  /** optional description of what the app does */
  description?: string;
  /** optional icon URL displayed in consent dialog and management UI */
  icon?: string;
  /** optional homepage URL for the app */
  homepage?: string;
}>;

/** controls account resolution behavior for getValidAuth.
 *  - `auto` (default): uses session cache / single auto-select / default flag,
 *    only shows picker when ambiguous
 *  - `select_account`: always shows the account picker (with "connect new account"
 *    option), bypassing cache, auto-select, and default flag */
export type OAuthGetValidAuthPrompt = 'auto' | 'select_account';

/** OAuth auth data returned to iframe apps. Represents a single OAuthConnection */
export type OAuthAuth = Readonly<{
  /** unique connection identifier (used for refresh/revoke operations) */
  id: string;
  /** OAuth provider URL (authorization server base URL) */
  providerUrl: string;
  /** provider's stable account identifier (e.g. 'sub' for Google, 'id' for GitHub) */
  providerAccountId: string;
  /** scopes granted for this token */
  scopes: string[];
  /** access token for API calls */
  accessToken: string;
  /** Unix timestamp when token expires. `undefined` for tokens that never expire */
  expiresAt?: number;
  /** normalized display identifier (email, username, or fallback to accountId) */
  displayIdentifier: string;
}>;

/** getValidAuth config — either `{ providerUrl }` to let the platform resolve the
 *  integration, or `{ integrationId }` when the integration is known */
export type OAuthGetValidAuthConfig =
  | Readonly<{ providerUrl: string; scopes?: string[]; prompt?: OAuthGetValidAuthPrompt; }>
  | Readonly<{ integrationId: Identifier; scopes?: string[]; prompt?: OAuthGetValidAuthPrompt; }>;

// --------------------------------------------------------------------------------
export interface CharmIQOAuthAPI {
  /** register your app's identity (required before calling getValidAuth) */
  register: (registration: OAuthAppRegistration) => Promise<void>;

  /** get a valid (non-expired) OAuth auth. The platform handles the full
   *  resolution chain parent-side:
   *  1. resolve integration (if by provider, only when no connections exist)
   *  2. resolve account (0 → consent popup, 1 → auto, >1 → account picker)
   *  3. refresh if token is expired
   *  4. return valid OAuthAuth */
  getValidAuth: (config: OAuthGetValidAuthConfig) => Promise<OAuthAuth>;

  /** revoke an OAuth connection (pass the OAuthAuth object from getValidAuth) */
  revokeAuth: (auth: OAuthAuth) => Promise<void>;
}

// == Visual Editor ===============================================================
export interface VisualEditorAPI {
  /** returns true if visual editor mode is currently active */
  isActive: () => boolean;
  /** activates visual editor mode - enables hover outlines, selection, text editing */
  activate: () => void;
  /** deactivates visual editor mode - syncs pending changes and cleans up */
  deactivate: () => void;

  /** applies a style change to an element identified by its CSS path */
  applyStyle: (path: string, property: string, value: string) => void;
}

// == Visual Designer =============================================================
export interface VisualDesignerAPI {
  isActive: () => boolean;
  activate: () => void;
  deactivate: () => void;
}

// == CharmIQAPI ==================================================================
// CharmIQ namespace for Application discovery and communication.
//
// Provides a clean, ergonomic API for iframe applications to advertise their
// capabilities and discover other applications in the document. Available globally
// as `window.charmiq`
export interface CharmIQAPI {
  /** AppContent API for Application text content with operational transforms. Store
   *  plain text directly in the document that supports collaborative editing.
   *  Separate from AppState which is for configuration (last-write-wins).
   *  @example
   *  // subscribe to content changes from collaborators
   *  window.charmiq.appContent.onChange$().subscribe(content => {
   *    if(editor.state.doc.toString() !== content) {
   *      editor.dispatch({
   *        changes: { from: 0, to: editor.state.doc.length, insert: content }
   *      });
   *    }
   *  });
   *
   *  // forward changes to app-content
   *  editor.onUpdate(update => {
   *    if(update.docChanged) {
   *      const changes = [];
   *      update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
   *        changes.push({
   *          from: fromA,
   *          to: toA,
   *          insert: text.length ? text.toString() : ''
   *        });
   *      });
   *      window.charmiq.appContent.applyChanges(changes);
   *    }
   *  });
   */
  appContent: AppContentAPI;
  /** AppState API for application state persistence. Store JSON data directly in the
   *  document that persists across reloads and is shared with collaborators.
   *  @example
   *  window.charmiq.appState.onChange$().subscribe(state => {
   *    if(!state) state = { count: 0 };
   *    updateUI(state);
   *  });
   *  await window.charmiq.appState.set({ count: 42 });
   */
  appState: AppStateAPI;

  /** advertise a capability that this Application provides for sibling Applications
   *  in the same Document. CORBA-style: methods receive **positional arguments**.
   *
   *  Use this for app-to-app communication (e.g. a previewer subscribing to an
   *  editor's text stream). For host-callable commands described by JSON-Schema
   *  in the app's manifest, use {@link CharmIQAPI.exportCommands} instead —
   *  calling `advertise('charmiq.command', ...)` will throw.
   *  @example
   *  window.charmiq.advertise('counter', {
   *    increment: () => ++count,
   *    value$: () => valueSubject.asObservable()
   *  });
   */
  advertise: AdvertiseCapability;

  /** discover Applications by capability (Observable-based, full control). Returns an
   *  Observable that emits arrays of proxies whenever providers change.
   *  @example
   *  window.charmiq.discover$('counter')
   *    .pipe(
   *      map(providers => providers[0]),
   *      switchMap(counter => counter.value$())
   *    )
   *    .subscribe(val => console.log('Value:', val));
   */
  discover$: DiscoverCapability$;
  /** discover Applications by capability (Promise-based, self-healing). Returns a
   *  Promise that resolves to a self-healing proxy for the first application
   *  advertising the requested capability.
   *  @example
   *  const counter = await window.charmiq.discover('counter');
   *  const val = await counter.increment();  // auto-waits during reload
   *  counter.value$().pipe(retry()).subscribe(...);  // use retry() for streams
   */
  discover: DiscoverCapability;

  /** export this Application's MCP-style command surface — the methods declared
   *  in the app's `manifest.json` under `commands` with JSON-Schema `inputSchema`
   *  / `outputSchema`. Methods receive a **single named-args object** whose
   *  properties match the method's `inputSchema`.
   *
   *  Targeted by the host (`editor.application.call`) and by sibling apps
   *  (`discover('charmiq.command')`) — both routes converge here.
   *  @example
   *  // manifest.json declares: setText({ text: string, tabId?: string })
   *  window.charmiq.exportCommands({
   *    setText: ({ text, tabId }) => editor.replace(tabId, text),
   *    listTabs: () => tabManager.listTabs()
   *  });
   */
  exportCommands: ExportCommands;

  /** fetch proxy to bypass CORS restrictions. Routes requests through the parent
   *  window which has a valid origin and returns a standard Response.
   *
   *  Supports standard fetch options plus optional `responseType`:
   *  - `text` (default)
   *  - `arrayBuffer` (useful for binary payloads like images/files)
   *
   *  Requests are still subject to platform proxy/auth/allowlist policy.
   *  @example
   *  const response = await window.charmiq.fetch('https://api.example.com/data', {
   *    headers: { 'Authorization': `Bearer ${token}` }
   *  });
   *  const data = await response.json();
   *
   *  // binary example
   *  const imageResponse = await window.charmiq.fetch('https://example.com/image.png', {
   *    responseType: 'arrayBuffer'
   *  });
   *  const blob = await imageResponse.blob();
   */
  fetch: CharmIQFetch;

  /** MCP (Model Context Protocol) API for connecting to MCP servers and calling
   *  tools through the platform. The platform holds real MCP SDK Client instances
   *  and manages all authentication — the Application never touches credentials.
   *
   *  **CharmIQ servers** ('vfs', 'agent', 'generation') are pre-connected with
   *  platform auth — no explicit connect() call needed.
   *
   *  **Organization-defined servers** can be discovered via listServers() and
   *  connected by passing their id as `mcpServerId` — the platform resolves the
   *  URL, auth, and tool ceiling from the Organization's configuration.
   *
   *  **External servers** (escape hatch / dev / testing) use connect() with a URL
   *  and auth config. OAuth auth supports two sub-modes:
   *  - `providerUrl` — platform resolves the integration (ergonomic, no opaque IDs)
   *  - `integrationId` — developer specifies the exact integration (precise / dev)
   *  @example
   *  // Organization-defined server: discover and connect
   *  const servers = await window.charmiq.mcp.listServers();
   *  await window.charmiq.mcp.connect('bq', { mcpServerId: servers[0].id });
   *  const result = await window.charmiq.mcp.callTool('bq', 'execute_sql', { query: '...' });
   *
   *  // external server: connect with OAuth by provider (platform resolves integration)
   *  await window.charmiq.mcp.connect('bigquery', {
   *    url: 'https://bigquery.googleapis.com/mcp',
   *    transport: 'proxy',
   *    auth: {
   *      type: 'oauth',
   *      providerUrl: 'https://accounts.google.com/',
   *      scopes: ['https://www.googleapis.com/auth/bigquery'],
   *    },
   *  });
   *  const result = await window.charmiq.mcp.callTool('bigquery', 'execute_sql', {
   *    query: 'SELECT * FROM `project.dataset.table` LIMIT 10',
   *  });
   *
   *  // CharmIQ server: no connect needed
   *  const tools = await window.charmiq.mcp.listTools('generation');
   *  const result = await window.charmiq.mcp.callTool('generation', 'create_video', { ... });
   */
  mcp: CharmIQMcpAPI;

  /** OAuth API for authenticating with external providers (Google, GitHub, etc.)
   *  All resolution logic (Integration lookup, account selection, token refresh)
   *  runs parent-side — the iframe never touches credentials directly.
   *
   *  @example
   *  // 1. register your app (once, before any OAuth calls)
   *  await window.charmiq.oauth.register({
   *    appId: 'com.example.my-application',
   *    name: 'My Application'
   *  });
   *
   *  // 2. get a valid auth — one call handles everything:
   *  //    integration resolution, account selection, consent popup, token refresh
   *
   *  // by providerUrl (platform resolves which integration to use):
   *  const auth = await window.charmiq.oauth.getValidAuth({
   *    providerUrl: 'https://accounts.google.com/',
   *    scopes: ['https://www.googleapis.com/auth/gmail.readonly']
   *  });
   *
   *  // or by integrationId (when you know the exact integration):
   *  const auth = await window.charmiq.oauth.getValidAuth({
   *    integrationId: 'abc123',
   *    scopes: ['https://www.googleapis.com/auth/bigquery']
   *  });
   *
   *  // 3. use the access token
   *  const response = await fetch('https://gmail.googleapis.com/...', {
   *    headers: { Authorization: `Bearer ${auth.accessToken}` }
   *  });
   *
   *  // 4. revoke when done (optional)
   *  await window.charmiq.oauth.revokeAuth(auth);
   */
  oauth: CharmIQOAuthAPI;

  /** Visual Editor API for Webflow/Onlook-style visual editing of HTML content.
   *  Enables hover outlines, click selection, inline text editing, and style
   *  changes that sync back to the ProseMirror document in real-time.
   *  @example
   *  // activate visual editing mode (usually triggered by platform)
   *  window.charmiq.visualEditor.activate();
   *
   *  // check if visual editing is active
   *  if(window.charmiq.visualEditor.isActive()) {
   *    // ... user is in visual edit mode
   *  }
   *
   *  // deactivate visual editing mode
   *  window.charmiq.visualEditor.deactivate();
   */
  visualEditor: VisualEditorAPI;

  /** Visual Designer API for PowerPoint-like editing of absolutely positioned
   *  HTML content. Elements with `data-vd` attributes can be selected, moved,
   *  resized, rotated, and grouped. Changes sync back to the ProseMirror document.
   *  @example
   *  // activate visual designer mode (usually triggered by platform)
   *  window.charmiq.visualDesigner.activate();
   *
   *  // check if visual designer is active
   *  if(window.charmiq.visualDesigner.isActive()) {
   *    // ... user is in visual designer mode
   *  }
   *
   *  // deactivate visual designer mode
   *  window.charmiq.visualDesigner.deactivate();
   */
  visualDesigner: VisualDesignerAPI;
}

// == Global Augmentation =========================================================
// type `window.charmiq` for any file that imports a symbol from this module.
//
// Bridge presence:
//   Apps run inside the CharmIQ platform iframe where the bridge is injected
//   before any app code. The global is therefore typed as present
//   (non-optional) — bridge-required apps read `window.charmiq` directly with
//   no null-checking noise.
//
// Standalone / local testing (opt-in):
//   Apps that need to run outside the platform (file://, a local dev server,
//   Storybook, ...) narrow the global at the app entry and branch at every
//   touchpoint:
//     const charmiq: CharmIQAPI | undefined = window.charmiq;
//     if(charmiq) { /* bridge path */ } else { /* standalone fallback */ }
//   `demos/shader-demo` is the reference implementation — falls back to a
//   starter shader, skips discovery, runs without appState.
declare global {
  interface Window {
    charmiq: CharmIQAPI;
  }
}
