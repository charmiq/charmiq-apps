# CodeMirror Editor

*A multi-tab code editor that lives inside your workspace — with collaborative editing, configurable language modes, and import/export.*

<iframe-app height="400px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
</iframe-app>


## What This Is

The CodeMirror Editor is a full code editor embedded directly in your CharmIQ document. Multiple tabs. Syntax highlighting for a dozen languages. Settings that persist across sessions. And because it's built on CharmIQ's data layer, every tab's content is collaboratively editable — two people typing in the same tab merge cleanly, the same way text does anywhere else in the workspace.

It's also a reference implementation. If you're building a complex Application, this one shows the full pattern: live collaborative text, persistent config, a Charm command surface, mobile layout, and multi-module TypeScript — all working together.


## In Practice

**Adding a tab** — Use the `+` button in the tab bar. Tabs can be renamed by double-clicking the label.

**Switching languages** — Open the settings menu (gear icon) and select from the available language modes. The setting persists — reloading the Application restores your last configuration.

**Import / Export** — The toolbar exposes file import and export. Importing replaces the active tab's content; exporting downloads it as a file.

**Collaborative editing** — Changes from any connected user merge automatically, and your own typing is never lost to them. You don't need to do anything differently — it just works. If a tab can no longer be saved (it was removed from the document, or a change was refused), the editor keeps your text, read-only, and says why, with buttons to copy the text and to reload.

**Charms can drive the editor** — Tag a Charm and ask it to write into a specific tab, create a new tab, or read the current content. The editor advertises a command surface that Charms can call directly.


> **For Developers** — The rest of this page covers how the Application is built. If you're learning the Application platform or building something similar, read on.


## How It's Built

The Application is folder-based, with each module owning a single concern. This separation keeps the codebase navigable and makes the data flow explicit.
| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map, CDN declarations |
| [`src/index.html`](charmiq://./src/index.html) | Structural shell — tabs, menus, editor container. No inline JS or CSS |
| [`src/styles.scss`](charmiq://./src/styles.scss) | All visual styling — custom properties, nesting, mobile breakpoint |
| [`src/editor-wrapper.ts`](charmiq://./src/editor-wrapper.ts) | Thin facade over CodeMirror 5: reports the user's changes as CodeMirror change sets and applies others' with the selection mapped. If the editor library is ever swapped, only this file changes |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | Tab discovery and app-content identity over `appContent`; gives each tab its live text (`shared/collab-text`) |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Editor config and tab metadata, persisted via `appState`. Fetch-merge-set writes |
| [`src/tab-manager.ts`](charmiq://./src/tab-manager.ts) | Tab lifecycle — create, delete, switch, rename, reorder. Holds each tab's live text and follows the active one in the editor |
| [`src/toolbar.ts`](charmiq://./src/toolbar.ts) | Settings menu, mobile drawer, toggles, drag-and-drop, import/export |
| [`src/command.ts`](charmiq://./src/command.ts) | Charm command surface via `charmiq.advertise` |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point. Creates instances, wires dependencies, starts discovery |


### Data Flow

Two storage channels — one for content, one for config:

<iframe-app height="340px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://../mermaid-diagram">
  <app-content name="data-flow">
graph TD
    EW["EditorWrapper\n(CodeMirror)"] -->|"user changes"| TM["TabManager\n(tabs)"]
    TM -->|"others' changes"| EW
    TM <-->|"local / apply"| CT["CollabText\n(one per tab)"]
    CT <-->|"edits$ / tagged applyChanges"| AC["appContent\n(collaborative)"]
    CB["ContentBridge\n(discovery)"] -->|"tabs"| TM
    AC -->|"onChange$"| CB
    CS["ConfigStore"] --> AS["appState\n(last-write-wins)"]
  </app-content>
  <app-state>{"theme":"neutral"}</app-state>
</iframe-app>

**`appContent`** holds each tab's text. It uses OT — multiple writers can edit simultaneously without data loss. `ContentBridge` watches `onChange$()` to discover the tabs; each tab's text then lives in a `CollabText` (`shared/collab-text`), which follows the app-content's actual edits through `edits$()` and sends the user's changes as tagged, guarded `applyChanges()` writes.

**`appState`** holds everything else: which tabs exist, their names, language settings, UI preferences. It uses last-write-wins semantics — appropriate here because one user at a time controls configuration. `ConfigStore` always reads the current state before writing, merging its update rather than clobbering the whole object.


### Design Decisions Worth Noting

**Actual edits, not snapshots.** A live editor sends a change on every keystroke, and the user goes on typing before it is confirmed. A snapshot of the app-content cannot say which of those changes it already holds, or where the unconfirmed typing belongs in someone else's edit; diffing texts guesses, and a guess drops or duplicates text. So each tab follows the app-content's actual edits (`edits$()`), and `CollabText` keeps three things apart: the text the document confirmed, the one batch it sent, and the typing since. Every other writer's change is rebased under the last two by CodeMirror's own collaboration model (`@codemirror/collab`), over a headless CodeMirror 6 state. Each batch goes out as a guarded write tagged with an edit id, and the edit it makes names it back, so the editor recognizes its own change whether the write's answer or the edit arrives first. None of this lives in the Application: it is the shared adapter, and any editor that can apply a change set can use it.

**CodeMirror 5 reports a batch in order.** One keystroke can be several changes (Enter inserts a line break, then indents the new line), each measured on the text the one before it left. `EditorWrapper` measures each against that running text, not the text before the batch, and recognizes the changes it applies itself by their origin, since CodeMirror 5 reports them after the call that made them.

**Undo is yours only.** CodeMirror 5's own history is off; undo and redo go to the tab's `CollabText`, whose history undoes the user's own changes only, mapped over everyone else's made since.

**Nothing typed is lost.** When a tab can no longer be saved (its app-content was removed, a write was refused, or an edit was missed), its text stays in the editor, read-only, and a notice says why, with Copy text and Reload. A write whose result is unknown is never sent again. A tab whose app-content comes back while nothing was unsent resumes on its own.

**CodeMirror 5 via CDN globals.** CM5 isn't an ES module — it attaches to `window.CodeMirror`. Language modes load the same way, as additional `<script>` tags declared in the manifest. The `editor-wrapper.ts` facade means the rest of the Application never touches `window.CodeMirror` directly.

**The Charm command surface.** `command.ts` calls `charmiq.exportCommands({ ... })` to register named operations: `getText`, `setText`, `createTab`, `switchTab`, `removeTab`, `listTabs`. Each method receives a single named-args object whose properties match the method's `inputSchema` declared in `manifest.json`. `setText` is the user's own change, kept through others' like any edit, and it resolves only once the document has applied it: a refused or unsavable write rejects, so a Charm never hears of a success that did not happen. Any Charm working in the same document can discover and call these. This is the pattern for making an Application Charm-controllable without coupling it to any specific Charm.

**RxJS at the boundary only.** `onChange$()` returns an Observable; the Application subscribes to it. But RxJS doesn't appear inside the modules themselves — only at the integration points where the CharmIQ API requires it.


## Next Steps

**→ [App-Content and App-State](https://team.charmiq.ai/docs/application/developer-app-content-and-app-state)** — The two storage channels this Application uses, and when to reach for each.

**→ [Application Discovery](https://team.charmiq.ai/docs/application/developer-application-discovery)** — How Applications advertise capabilities and how Charms (and other Applications) discover them.

**→ [Building Applications](https://team.charmiq.ai/docs/application/building-applications)** — Inline vs. folder-based Applications, and how the build pipeline assembles source files.

**→ [The Bridge API](https://team.charmiq.ai/docs/application/developer-bridge-api)** — Full reference for `window.charmiq`.