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
  /** the app-content's exact state: every change to it gives it a new revision,
   *  never one it had before. Absent where the Platform cannot guard edits */
  revision?: string;
  /** a reason to check whether the app-content is gone, not proof: it is gone when
   *  {@link AppContentAPI.snapshot} by its id returns `null` */
  deleted?: boolean;
}>;

/** an existing app-content's exact observed state: what a guarded edit is measured
 *  on */
export type AppContentSnapshot = Readonly<{ id: string; content: string; revision: string; }>;
/** the app-content and revision a guarded edit applies to */
export type AppContentGuard = Pick<AppContentSnapshot, 'id' | 'revision'>;
/** a guarded write's tag: its edit id, named back by the edit it makes */
export type AppContentWrite = Readonly<{ editId: string; }>;

/** an app-content's actual edits (SEE: AppContentAPI.edits$): where it stands
 *  (`created`, or `absent` when an `[id='x']` stream opens on no app-content), each
 *  change with the revision it applies to (`ack` names your own tagged write), or its
 *  removal */
export type AppContentEdit = Readonly<
  | { kind: 'created'; id: string; revision: string; content: string; }
  | { kind: 'changes'; id: string; base: string; revision: string; changes: readonly ContentChange[]; ack?: string; }
  | { kind: 'removed'; id: string; base: string; }
  | { kind: 'absent'; id: string; }
>;

/** incremental text change passed to AppContent.applyChanges */
export type ContentChange = Readonly<{
  from: number;
  to: number;
  insert?: string;
}>;

// --------------------------------------------------------------------------------
/** an app-content as it stands, with the writes measured on it. Every write is guarded
 *  by this app-content: if it has changed since, it rejects with `code`
 *  `app/content-conflict`, writing nothing (except `appendLine`, which measures
 *  again and resends on its own) */
export type AppContent = Readonly<{
  id: string;
  /** the app-content's exact state */
  revision: string;
  text: string;
  /** the text as lines, without the line break that ends each */
  lines: readonly string[];

  /** guarded edits of any range, each measured after the ones before it */
  edit: (changes: readonly ContentChange[]) => Promise<void>;
  /** adds a line after the last (a line break first when the text does not end
   *  its last line); measured again and resent if another writer got there first */
  appendLine: (line: string) => Promise<void>;
  /** removes the line at `index`, with its line break */
  removeLine: (index: number) => Promise<void>;
  /** replaces the text of the line at `index` */
  replaceLine: (index: number, line: string) => Promise<void>;
  /** makes the app-content these lines, each ending its line, writing only the runs
   *  of lines that differ (refused when it changed since, even when nothing
   *  differs; refused with `functions/out-of-range`, writing nothing, when the
   *  lines differ too much to tell which stayed the same) */
  setLines: (lines: readonly string[]) => Promise<void>;
  /** removes the app-content from the document, refused when it changed since */
  remove: () => Promise<void>;
}>;

/** the Application's app-content: its own, so it needs no declaration and no
 *  permission */
export interface AppContentAPI {
  /** the Application's app-content, kept current: the app-content the selector
   *  names (no selector: the first), followed by its id, or `null` while there is
   *  none. Once it is removed, the next app-content the selector names is followed.
   *  A refused read errors the stream with its `code`
   *  @example
   *  window.charmiq.appContent.content$().subscribe(content => show(content ? content.text : 'nothing yet'));
   *  // later, from the app-content shown
   *  await content.appendLine('one more');
   *  @param selector optional selector (e.g. "[name='list']", "[id='xyz']") */
  content$: (selector?: string) => Observable<AppContent | null>;
  /** every app-content the selector names (no selector: every app-content), in the
   *  order each first appeared: several app-contents of one name are each given
   *  @param selector optional `[name='x']` or `[id='x']` */
  contents$: (selector?: string) => Observable<AppContent[]>;
  /** the app-content named `name` (no name: the first; spaces around a name are
   *  dropped) when one exists, its text kept whatever it is, otherwise a new one
   *  holding `text`, given back. Two collaborators creating one at the same moment
   *  each make one: `contents$` shows both */
  create: (text: string, name?: string) => Promise<AppContent>;

  /** Observable stream of content changes from the document: the source of truth
   *  to render from. Emits the current content, then on every change by anyone,
   *  including your own writes as they come back alongside others' edits
   *  @param selector optional selector to identify which app-content to observe
   *         (e.g. "[id='xyz']", "[name='editor']", "[0]")
   *  @returns Observable that emits the current content as an {@link AppContentChange} */
  onChange$: (selector?: string) => Observable<AppContentChange>;
  /** an app-content as a stream of its actual edits, for a live text editor that keeps
   *  unconfirmed changes of its own (SEE: apps/codemirror-editor): where it stands
   *  (`created`), then each change in order with the revision it applies to, naming
   *  your own tagged writes, then its removal. An `[id='x']` selector follows that
   *  app-content whether or not it exists yet, opening with `absent` when it does not;
   *  any other selector names the app-content it matches now, and fails with
   *  `functions/not-found` when none does
   *  @param selector optional selector to identify which app-content to follow
   *  @returns Observable of the app-content's {@link AppContentEdit}s */
  edits$?: (selector?: string) => Observable<AppContentEdit>;

  /** the app-content's current state, or `null` when none matches. Absent where the
   *  Platform cannot guard edits: check for it before a guarded write
   *  @param selector optional selector to identify which app-content to read
   *  @returns Promise that resolves to the app-content's {@link AppContentSnapshot} */
  snapshot?: (selector?: string) => Promise<AppContentSnapshot | null>;

  /** apply edits to the content: the way to change part of an app-content while
   *  others may be writing too. A call's changes apply in order, each position
   *  measured after the changes before it (send several from one original text
   *  last-first), and every one must lie inside the app-content. With a guard, the
   *  edits apply only while the app-content it names still has its revision;
   *  otherwise they apply to its text when the call arrives, which another writer may
   *  have changed since you read it. Unguarded, a missing app-content is created;
   *  guarded, never
   *  @param changes the edits, in the order they apply
   *  @param selector optional selector to identify which app-content to update
   *         (e.g. "[id='xyz']", "[name='editor']", "[0]")
   *  @param guard the snapshot the edits were measured on (SEE: {@link snapshot})
   *  @param write a guarded write's tag, named back by the edit it makes (SEE: {@link edits$})
   *  @returns Promise that resolves once the editor has applied the edits. Rejects,
   *           having written nothing, with `code` `app/content-conflict` when the
   *           guarded app-content changed or is gone (read it again by its id), or
   *           `functions/invalid-argument` for an edit outside the app-content */
  applyChanges: (changes: readonly ContentChange[], selector?: string, guard?: AppContentGuard, write?: AppContentWrite) => Promise<void>;

  /** get current content value (one-time read). Use onChange$ for reactive updates
   *  instead of polling with get()
   *  @param selector optional selector to identify which app-content to get
   *  @returns Promise that resolves to current content as a string */
  get: (selector?: string) => Promise<string>;
  /** replace the full content, creating the app-content when the selector matches
   *  none. Anything another writer changed meanwhile is lost: use it to create an
   *  app-content or replace everything on purpose, and {@link applyChanges} to edit
   *  @param content new text content; omitted, the app-content keeps its text
   *         (a rename)
   *  @param selector optional selector to identify which app-content to set
   *  @param name optional name attribute to set on the app-content node
   *  @returns Promise that resolves when content is saved to the document */
  set: (content: string | undefined, selector?: string, name?: string) => Promise<void>;
  /** remove the app-content node
   *  @param selector optional selector to identify which app-content to remove
   *  @returns Promise that resolves when the node is removed from the document */
  remove: (selector?: string) => Promise<void>;
}

// == AppState ====================================================================
/** the Application's app-state: its own, so it needs no declaration and no
 *  permission */
export interface AppStateAPI {
  /** Observable stream of state changes from the document. Emits whenever the
   *  state is updated (by you or other viewers)
   *  @returns Observable that emits the current state or null if no state exists */
  onChange$: () => Observable<any | null>;

  /** update the persisted state for this iframe application instance
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
 *  (e.g. `discover<GalleryCapability>('ai.charmiq.shared.imageGallery')`) and
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
 *  (`discover('charmiq.command')`) — both routes converge here.
 *
 *  ## Designing for LLM callers
 *
 *  This is the surface agents reach for. Agents pick identifier values from
 *  the document HTML they can already see — `<app-content id="..." name="..."/>`
 *  attributes and the JSON inside `<app-state>JSON</app-state>`. Whatever string
 *  looks like an identifier in that context is what they will pass back, which is
 *  rarely the platform-minted opaque ID your code wants. If the same token appears
 *  in multiple places (e.g. as a key in app-state AND as the prefix of an app-content
 *  `name`), that is the form the agent will most confidently use.
 *
 *  Two consequences for handler design:
 *  - **Be tolerant of identifier slop.** Where you accept an identifier, resolve
 *    it permissively: try the canonical id first, then any document-visible aliases
 *    (state keys, `name`-attr halves, display labels). Telling the agent "call
 *    listX first to find the real id" defeats the purpose of an MCP-style surface —
 *    the agent already saw what it needed.
 *  - **Be defensive about input shape.** Optional fields really are optional; a
 *    missing arg should fall back to a sensible default (typically "the active /
 *    most recent / only thing"), not throw.
 *
 *  This is intentionally laxer than {@link AdvertiseCapability}, which is
 *  app-to-app (developers know the canonical contract) */
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
  | Readonly<{ type: 'oauth'; integrationId: Identifier; scopes: string[]; app?: OAuthAppRegistration/*legacy self-declaration — ignored*/; }>
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
/** legacy `oauth.register()` self-declaration — ignored. The app's identity is
 *  platform-resolved (the loaded application material); connections are isolated
 *  per application by that identity, never by a declared appId */
export type OAuthAppRegistration = Readonly<{
  /** self-declared app identifier — ignored */
  appId: string;
  /** self-declared app name — ignored */
  name: string;
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
  /** the Integration whose credentials issued this connection. Provider-mode
   *  `listAuth` spans Integrations, so the same account connected through two
   *  Integrations returns two entries with equal `providerAccountId` but distinct
   *  `id` and `integrationId` — this is how an app tells them apart */
  integrationId: string;
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
  /** user's display name (e.g. "John Doe") — present when the provider's userinfo
   *  returns one (reliably populated for Google) */
  displayName?: string;
  /** user's avatar / profile picture URL — present when the provider's userinfo
   *  returns one (reliably populated for Google) */
  displayAvatar?: string;

  /** `true` when this is the User's preferred Connection for the Integration; the
   *  resolution chain auto-selects it. Opt-in via the Connection management UI */
  default?: boolean;
}>;

/** the account shape returned by `oauth.listAuth` — an {@link OAuthAuth} with the
 *  `accessToken` withheld. Enumerate connected accounts (render them, rehydrate a
 *  multi-account UI across a reload) without minting a token per account; the token
 *  for a chosen account is fetched on demand via `getValidAuth({ connectionKey })`.
 *  The `id` doubles as that targeting key and as the argument to `revokeAuth` */
export type OAuthAuthDescriptor = Omit<OAuthAuth, 'accessToken'>;

/** getValidAuth config — either `{ providerUrl }` to let the platform resolve the
 *  integration, or `{ integrationId }` when the integration is known. Pass
 *  `connectionKey` (an {@link OAuthAuthDescriptor} `id` from `listAuth`) to target
 *  one specific already-connected account, bypassing account selection */
export type OAuthGetValidAuthConfig =
  | Readonly<{ providerUrl: string; scopes?: string[]; prompt?: OAuthGetValidAuthPrompt; connectionKey?: string; }>
  | Readonly<{ integrationId: Identifier; scopes?: string[]; prompt?: OAuthGetValidAuthPrompt; connectionKey?: string; }>;

/** listAuth config — enumerate the app's connected accounts for a provider or a
 *  specific Integration */
export type OAuthListAuthConfig =
  | Readonly<{ providerUrl: string; }>
  | Readonly<{ integrationId: Identifier; }>;

// --------------------------------------------------------------------------------
export interface CharmIQOAuthAPI {
  /** legacy no-op — the app's identity is platform-resolved; the declaration is
   *  ignored. Call getValidAuth directly */
  register: (registration: OAuthAppRegistration) => Promise<void>;

  /** get a valid (non-expired) OAuth auth. The platform handles the full
   *  resolution chain parent-side:
   *  1. resolve integration (if by provider, only when no connections exist)
   *  2. resolve account (0 → consent popup, 1 → auto, >1 → account picker)
   *  3. refresh if token is expired
   *  4. return valid OAuthAuth
   *
   *  Pass `connectionKey` (an {@link OAuthAuthDescriptor} `id` from {@link listAuth})
   *  to target one specific already-connected account — the platform verifies the
   *  key names one of *this* app's own Connections, refreshes it if expired, and
   *  returns its token, bypassing selection. This is how a multi-account app
   *  fetches a token per account after enumerating with `listAuth`.
   *
   *  Rejects with a {@link CharmIQError}: `functions/cancelled` when the User
   *  dismisses an ask; `functions/not-found` when the Organization has no
   *  Integration for the provider (the Platform has already told the User) */
  getValidAuth: (config: OAuthGetValidAuthConfig) => Promise<OAuthAuth>;

  /** list this app's connected accounts (token-less {@link OAuthAuthDescriptor}s)
   *  for a provider or Integration. No consent popup, no account resolution — the
   *  enumeration a multi-account app needs to render every account on load and
   *  rehydrate across a reload. Fetch a token for a chosen account on demand via
   *  `getValidAuth({ connectionKey })` */
  listAuth: (config: OAuthListAuthConfig) => Promise<OAuthAuthDescriptor[]>;

  /** revoke an OAuth connection (pass the OAuthAuth from getValidAuth, or an
   *  OAuthAuthDescriptor from listAuth — both carry the `id` the platform needs) */
  revokeAuth: (auth: OAuthAuth | OAuthAuthDescriptor) => Promise<void>;
}

// == Resources ===================================================================
export type ResourcesAPI = Readonly<{
  /** the complete bytes of the resource the manifest declares as `name` (or of the
   *  file `name` names beneath a folder it declares), as stored: an Asset's newest
   *  version (a sound, an image), or a Source's text as UTF-8; rejects as `text`
   *  does, a file's bytes never refused for not being UTF-8 */
  bytes: (name: string) => Promise<ArrayBuffer>;
  /** the complete UTF-8 text of the resource the manifest declares as `name`, or of
   *  the file `name` names beneath a folder it declares (`sound/README.md`: the
   *  folder's name, then the file's path within it). Rejects for an undeclared name
   *  (`code` `functions/not-found`), a name reaching outside its folder
   *  (`functions/invalid-argument`) and for a file that is missing, unreadable, not
   *  UTF-8 or over 32 MB (32,000,000 bytes), with `code` naming the refusal; a
   *  failure the Platform cannot classify (a network failure) carries no `code`. A
   *  failed read can be retried */
  text: (name: string) => Promise<string>;

  /** a page of the names one level beneath `prefix`, a folder the manifest declares
   *  (`"sound/": "/sounds/"` lists as `sound/`) or a directory beneath it
   *  (`sound/effects/`): each file by the name it is read by (`sound/radio.ogg`),
   *  each subfolder by its name and `/`, as the folder is now. `next` is the next
   *  page's cursor (pass it back as `next`), absent on the last. Rejects for a
   *  prefix beneath no declared folder (`code` `functions/not-found`), one reaching
   *  outside its folder (`functions/invalid-argument`) and a folder missing or not
   *  listable by the current User */
  list: (prefix: string, options?: Readonly<{ next?: string; }>) => Promise<Readonly<{ names: ReadonlyArray<string>; next?: string; }>>;
}>;

// == Signed-In User ==============================================================
/** an Organization the User belongs to: `individual` is their Personal account,
 *  `organization` a Company */
export type ApplicationOrganization = Readonly<{
  id: string;
  name: string;
  type: 'individual' | 'organization';
}>;

/** a feature the User may use: present means granted; a `numeric` one carries its
 *  limit */
export type ApplicationEntitlement =
  | Readonly<{ feature: string; type: 'binary'; }>
  | Readonly<{ feature: string; type: 'numeric'; limit: number; }>;

/** the signed-in User using the Application */
export type ApplicationUser = Readonly<{
  /** the User's Platform id: stable, and the same in every Application */
  id: string;
  /** the User's name, or `''` when their profile names no one */
  name: string;
  email: string | null;
  /** the URL of their picture */
  imageUrl: string | null;
  /** the User's Platform roles: a role present (as `true`) is assigned; usually
   *  empty. Ignore a role you do not know. Roles inform what an Application shows;
   *  they grant nothing (the Platform checks every operation itself) */
  userRoles: Readonly<{ [role: string]: true | undefined; }>;
  /** each Organization the User belongs to, once: their Personal account and each
   *  Company. A pending invitation is not a membership */
  organizations: readonly ApplicationOrganization[];
  /** the active Organization (an entry of `organizations`), or `null` */
  activeOrganizationId: string | null;
  /** the features the User may use now, by feature */
  entitlements: Readonly<{ [feature: string]: ApplicationEntitlement | undefined; }>;
}>;

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

// == Failure =====================================================================
/** the Error a failed Platform call rejects with: its `message`, and its `code`
 *  when the Platform classified the failure (e.g. `functions/cancelled` -- the User
 *  dismissed the ask; `functions/not-found` -- no OAuth Integration for the
 *  provider; `functions/permission-denied`). Classify on `code`, never on the
 *  message text. A call to another Application carries that provider's code */
export type CharmIQError = Error & Readonly<{ code?: string; }>;

// == CharmIQAPI ==================================================================
// CharmIQ namespace for Application discovery and communication.
//
// Provides a clean, ergonomic API for iframe applications to advertise their
// capabilities and discover other applications in the document. Available globally
// as `window.charmiq`
/** a color for each of the document's modes: opaque hex, `#rgb` or `#rrggbb` */
export type PageTopColor = Readonly<{ light: string; dark: string; }>;
/** a launch of the page: the address it was launched at (`window.launchQueue`'s) */
export type LaunchParams = Readonly<{ targetURL: string; }>;
export interface PageAPI {
  /** asks the page to badge the installed app's icon (0 clears it; absent, a mark with
   *  no count), as `navigator.setAppBadge` does. Call it during a tap: where a badge
   *  needs notification permission, the first request asks the User for it */
  setAppBadge(contents?: number): void;
  /** asks the page to clear the installed app's icon badge */
  clearAppBadge(): void;

  /** asks the page to paint `color` behind the Application, for the document's mode.
   *  A later request replaces an earlier one; nothing is answered */
  setTopColor(color: PageTopColor): void;

  /** the page's launches, as `window.launchQueue`: the consumer hears the page's latest
   *  launch not yet heard (the address it opened with, or a shortcut since: one replaced
   *  before the consumer was set is never heard), then each later launch of the open
   *  app, several chosen together collapsing to the latest, each once; a later consumer
   *  replaces it */
  launchQueue: Readonly<{ setConsumer(consumer: (params: LaunchParams) => void): void; }>;
}

// --------------------------------------------------------------------------------
export interface CharmIQAPI {
  /** AppContent API for Application text content with operational transforms. Store
   *  plain text directly in the document that supports collaborative editing.
   *  Separate from AppState which is for configuration (last-write-wins). Read and
   *  write each app-content (`content$`, `contents$`, `create`): each write is
   *  measured on the app-content it is called on, and refused whole when it has
   *  changed since. A live text editor, whose typing runs ahead of confirmation, also
   *  follows the app-content's actual edits (`edits$`) and tags its writes
   *  (SEE: apps/codemirror-editor)
   *  @example
   *  // the Application's app-content, kept current (null while there is none)
   *  window.charmiq.appContent.content$().subscribe(content => show(content));
   *  // a write through the app-content shown, measured on it: refused, writing
   *  // nothing, if it changed since (appendLine measures again on its own)
   *  await content.appendLine('one more');
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
   *  calling `advertise('charmiq.command', ...)` will throw. Needs no declaration:
   *  any Application may advertise.
   *  @example
   *  window.charmiq.advertise('counter', {
   *    increment: () => ++count,
   *    value$: () => valueSubject.asObservable()
   *  });
   */
  advertise: AdvertiseCapability;

  /** discover Applications by capability (Observable-based, full control). Returns an
   *  Observable that emits arrays of proxies whenever providers change. Declares
   *  `application.discover`, and `application.call` to call what it finds. It errors
   *  with the reason and `code` (`functions/permission-denied`) when the Platform
   *  refuses the discovery.
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
   *  advertising the requested capability, waiting for one as long as it takes.
   *  Declares `application.discover`, and `application.call` to call what it finds.
   *  It rejects with the reason and `code` (`functions/permission-denied`) when the
   *  Platform refuses the discovery; a call through the proxy waiting for a provider
   *  is refused the same way once the proxy's own discovery is refused.
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
   *
   *  This is the LLM-facing surface — handlers should be **tolerant of
   *  identifier slop** (resolve any document-visible alias, not just the
   *  canonical id) and **defensive about input shape** (optional fields fall
   *  back to a sensible default, never throw). See {@link ExportCommands} for
   *  the full rationale and an example resolver.
   *  @example
   *  // manifest.json declares: setText({ text: string, tabId?: string })
   *  window.charmiq.exportCommands({
   *    setText: ({ text, tabId }) => {
   *      // tabId tolerated as: platform id | document-visible state key |
   *      //                     display label | "key:label" tuple
   *      const id = tabManager.resolveTabId(tabId);
   *      if(id !== null) editor.replace(id, text);
   *    },
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

  /** the files the manifest declares in `bundle.resources` (a name for each path),
   *  and the files beneath the folders it declares (a name and a path each ending in
   *  `/`), read by name when needed rather than built into the Application, and a
   *  folder listed. Each read is the file as it is now, read as the current User; a
   *  declaration grants nothing the User cannot read. Not covered by the
   *  Application's signature
   *  @example
   *  const parts = await window.charmiq.resources.text('parts/nature.ldr');
   *  const { names } = await window.charmiq.resources.list('sound/');
   */
  resources: ResourcesAPI;

  /** the page the Application is shown on. In App mode, its first Application may set
   *  the color the page paints behind it (an installed phone app's status bar, a
   *  desktop app's title bar), badge the installed app's icon, and hear the page's
   *  launches, a Home Screen shortcut's included. Elsewhere each does nothing
   *  @example
   *  window.charmiq.page.launchQueue.setConsumer(({ targetURL }) => openTab(new URL(targetURL).searchParams.get('tab')));
   *  window.charmiq.page.setAppBadge(2);
   *  window.charmiq.page.setTopColor({ light: '#ffffff', dark: '#1c1c1e' });
   */
  page: PageAPI;

  /** the signed-in User using the Application, then each change to who they are,
   *  their Organizations, the active one, their roles or their features. `null`
   *  when no one is signed in (an anonymous visitor to a published page). It is
   *  always the person viewing, never the document's author or publisher. Declare
   *  `user.read` in `requestedScopes`; the User may be asked first, and a refusal
   *  errors the stream (`code` names it). A per-User entry kept in app-state
   *  (`state.byUser[user.id]`) is still the document's: everyone who reads the
   *  document reads it, and `appState.set()` replaces the whole state
   *  @example
   *  window.charmiq.user$().subscribe(user => {
   *    showGreeting(user ? user.name : 'Guest');
   *    restorePreferences(user && savedState.byUser?.[user.id]);
   *  });
   */
  user$: () => Observable<ApplicationUser | null>;

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
   *
   *  MCP `requestedScopes` identify the authority, not merely the runtime alias:
   *  - `listServers()` — `mcp.discover`
   *  - CharmIQ server — `mcp.platform.{serverName}` (for example `mcp.platform.vfs`)
   *  - Organization server — `mcp.org.{serverId}` (or `mcp.org.*` when discovered dynamically)
   *  - explicit server — `mcp.adhoc.{connectionName}` (+ `oauth.token` when OAuth-backed)
   *  Never derive `mcp.{alias}` from a call-site alias; `mcp.vfs` and `mcp.*`
   *  are not valid MCP call-site declarations.
   *
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
   *  runs parent-side — the iframe never touches credentials directly. The app's
   *  identity is platform-resolved (the loaded application material); connections
   *  are isolated per application by that identity.
   *
   *  @example
   *  // 1. get a valid auth — one call handles everything:
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
   *  // 2. use the access token
   *  const response = await fetch('https://gmail.googleapis.com/...', {
   *    headers: { Authorization: `Bearer ${auth.accessToken}` }
   *  });
   *
   *  // 3. revoke when done (optional)
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
