# CodeMirror Editor

*A multi-tab code editor that lives inside your workspace — with collaborative editing, configurable language modes, and import/export.*

<iframe-app height="400px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
</iframe-app>


## What This Is

The CodeMirror Editor is a full code editor embedded directly in your CharmIQ document. Multiple tabs. Syntax highlighting for a dozen languages. Settings that persist across sessions. And because it's built on CharmIQ's data layer, every tab's content is collaboratively editable — two people typing in the same tab merge cleanly, the same way text does anywhere else in the workspace.

It's also a reference implementation. If you're building a complex Application, this one shows the full pattern: OT-backed content, persistent config, a Charm command surface, mobile layout, and multi-module TypeScript — all working together.


## In Practice

**Adding a tab** — Use the `+` button in the tab bar. Tabs can be renamed by double-clicking the label.

**Switching languages** — Open the settings menu (gear icon) and select from the available language modes. The setting persists — reloading the Application restores your last configuration.

**Import / Export** — The toolbar exposes file import and export. Importing replaces the active tab's content; exporting downloads it as a file.

**Collaborative editing** — Changes from any connected user merge automatically. You don't need to do anything differently — it just works.

**Charms can drive the editor** — Tag a Charm and ask it to write into a specific tab, create a new tab, or read the current content. The editor advertises a command surface that Charms can call directly.


> **For Developers** — The rest of this page covers how the Application is built. If you're learning the Application platform or building something similar, read on.


## How It's Built

The Application is folder-based, with each module owning a single concern. This separation keeps the codebase navigable and makes the data flow explicit.
| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map, CDN declarations |
| [`src/index.html`](charmiq://./src/index.html) | Structural shell — tabs, menus, editor container. No inline JS or CSS |
| [`src/styles.scss`](charmiq://./src/styles.scss) | All visual styling — custom properties, nesting, mobile breakpoint |
| [`src/editor-wrapper.ts`](charmiq://./src/editor-wrapper.ts) | Thin facade over CodeMirror 5. If the editor library is ever swapped, only this file changes |
| [`src/content-bridge.ts`](charmiq://./src/ontent-bridge.ts) | OT sync between editor state and `appContent`. Owns the discovery phase |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Editor config and tab metadata, persisted via `appState`. Fetch-merge-set writes |
| [`src/tab-manager.ts`](charmiq://./src/tab-manager.ts) | Tab lifecycle — create, delete, switch, rename, reorder. Coordinates the other modules |
| [`src/toolbar.ts`](charmiq://./src/toolbar.ts) | Settings menu, mobile drawer, toggles, drag-and-drop, import/export |
| [`src/command.ts`](charmiq://./src/command.ts) | Charm command surface via `charmiq.advertise` |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point. Creates instances, wires dependencies, starts discovery |


### Data Flow

Two storage channels — one for content, one for config:

<iframe-app height="340px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://../mermaid-diagram">
  <app-content name="data-flow">
graph TD
    EW["EditorWrapper\n(CodeMirror)"] <-->|"setValue / replaceRange"| TM["TabManager\n(state machine)"]
    EW -->|"user edits"| CB["ContentBridge\n(OT sync)"]
    TM -->|"content changes"| CB
    CS["ConfigStore\n(appState)"] -->|"applyChanges"| CB
    CB --> AC["appContent\n(collaborative)"]
    CS --> AS["appState\n(last-write-wins)"]
  </app-content>
  <app-state>{"theme":"neutral"}</app-state>
</iframe-app>

**`appContent`** holds each tab's text. It uses OT — multiple writers can edit simultaneously without data loss. `ContentBridge` watches `onChange$()` and applies incoming changes to the editor; it sends the editor's local changes back via `applyChanges()`.

**`appState`** holds everything else: which tabs exist, their names, language settings, UI preferences. It uses last-write-wins semantics — appropriate here because one user at a time controls configuration. `ConfigStore` always reads the current state before writing, merging its update rather than clobbering the whole object.


### Design Decisions Worth Noting

**State comparison, not causality tracking.** When the editor writes to `appContent`, the change comes back through `onChange$()`. It's tempting to set a flag — "I just wrote this, so ignore the next incoming change." That's wrong. OT can merge your edit with a concurrent one, so the change that comes back may contain both your text *and* someone else's. Suppressing it silently drops their work. Instead, compare: read the editor's current text, compare it to what arrived, and apply only the diff. If they already match, do nothing. If they differ, patch the difference. It doesn't matter who caused the change — only whether the editor's state matches the authoritative state. (The narrow `updating` flag in `EditorWrapper` serves a different purpose: it prevents CodeMirror's synchronous `changes` event from re-dispatching a programmatic `replaceRange()` call back to `applyChanges()`. That's a local, synchronous guard — not a suppression of remote changes.)

**CodeMirror 5 via CDN globals.** CM5 isn't an ES module — it attaches to `window.CodeMirror`. Language modes load the same way, as additional `<script>` tags declared in the manifest. The `editor-wrapper.ts` facade means the rest of the Application never touches `window.CodeMirror` directly.

**The Charm command surface.** `command.ts` calls `charmiq.advertise('charmiq.command', { ... })` to register named operations: `getText`, `setText`, `createTab`, `switchTab`, `removeTab`, `listTabs`. Any Charm working in the same document can discover and call these. This is the pattern for making an Application Charm-controllable without coupling it to any specific Charm.

**RxJS at the boundary only.** `onChange$()` returns an Observable; the Application subscribes to it. But RxJS doesn't appear inside the modules themselves — only at the integration points where the CharmIQ API requires it.


## Next Steps

**→ [App-Content and App-State](https://team.charmiq.ai/docs/application/developer-app-content-and-app-state)** — The two storage channels this Application uses, and when to reach for each.

**→ [Application Discovery](https://team.charmiq.ai/docs/application/developer-application-discovery)** — How Applications advertise capabilities and how Charms (and other Applications) discover them.

**→ [Building Applications](https://team.charmiq.ai/docs/application/building-applications)** — Inline vs. folder-based Applications, and how the build pipeline assembles source files.

**→ [The Bridge API](https://team.charmiq.ai/docs/application/developer-bridge-api)** — Full reference for `window.charmiq`.