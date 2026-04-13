# CodeMirror Editor

*A multi-tab code editor with collaborative editing (OT), configurable language modes, and import/export — built with TypeScript, CodeMirror 5, and zero frameworks.*

<iframe-app data-sandboxed="true" height="400px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
  <app-source></app-source>
</iframe-app>

## Architecture

The original `codemirror.html` (~2,000 lines) has been decomposed into focused modules:

| File | Responsibility |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map, runtime declarations |
| [`index.html`](charmiq://./index.html) | Structural shell — tabs, menus, editor container. No inline JS or CSS |
| [`styles.scss`](charmiq://./styles.scss) | All visual styling (SCSS with custom properties, nesting, responsive breakpoint) |
| [`editor-wrapper.ts`](charmiq://./editor-wrapper.ts) | Thin facade over CodeMirror 5. If CM is ever upgraded to 6, only this file changes |
| [`content-bridge.ts`](charmiq://./content-bridge.ts) | OT content sync between editor and `appContent`. Owns the discovery phase |
| [`config-store.ts`](charmiq://./config-store.ts) | Editor configuration and tab metadata persisted via `appState`. Fetch-merge-set writes |
| [`tab-manager.ts`](charmiq://./tab-manager.ts) | Tab lifecycle (create, delete, switch, rename, reorder). Coordinates all three data modules |
| [`toolbar.ts`](charmiq://./toolbar.ts) | All UI chrome: settings menu, mobile menu, toggles, drag-and-drop, import/export, clipboard |
| [`command.ts`](charmiq://./command.ts) | LLM command surface via `charmiq.advertise` — getText, setText, createTab, etc. |
| [`main.ts`](charmiq://./main.ts) | Entry point (~30 lines). Creates instances, wires dependencies, starts discovery |

### Data flow

```
┌───────────────┐               ┌─────────────────┐
│ EditorWrapper │◄──────────────│  TabManager     │
│  (CodeMirror) │  setValue/    │  (state machine)│
└──────┬────────┘  replaceRange └───────┬─────────┘
       │ user edits                     │ content changes
       ▼                                ▼
┌──────────────┐              ┌───────────────┐
│ContentBridge │◄─────────────│  ConfigStore  │
│  (OT sync)   │  applyChanges│  (appState)   │
└──────────────┘              └───────────────┘
       │                               │
       ▼                               ▼
   appContent                      appState
  (collaborative)              (last-write-wins)
```

### Design decisions

- **Classes for encapsulation.** Each module is a class with private state and a public API. Dependencies are passed via constructor injection.

- **Option B mobile menu.** Desktop settings menu and mobile slide-out drawer are separate DOM trees driven by the same `ConfigStore` callbacks. One function updates all toggles via `data-option` attribute queries.

- **CodeMirror 5 via CDN `<script>` tags.** CM5 is not an ES module — it attaches to `window.CodeMirror`. Language modes load the same way. If CM6 is adopted, only `editor-wrapper.ts` changes.

- **RxJS at the boundary only.** Used for `appContent.onChange$()` discovery (race/debounceTime) and `appState.onChange$()` subscription. No RxJS inside the modules themselves.

- **AYS dialog via `charmiq://../../shared/ays-dialog`.** The shared confirmation dialog loads as a Web Component.

### Runtime APIs

- **`appContent`** — OT-enabled content storage. `onChange$()`, `set()`, `applyChanges()`, `remove()`.
- **`appState`** — Last-write-wins configuration. `onChange$()`, `get()`, `set()`.
- **`charmiq.advertise`** — Registers commands (getText, setText, createTab, switchTab, removeTab, listTabs) for LLM interaction.
