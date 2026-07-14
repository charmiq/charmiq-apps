# Tutorial Plan

Each tutorial teaches exactly one new concept. The application from the previous step is the starting point.

Manifest IDs follow the convention `ai.charmiq.tutorials.<name>` (e.g. `ai.charmiq.tutorials.hello-app`).

| # | Name | Builds on | Adds | Key API |
|---|------|-----------|------|---------|
| 01 | `hello-app` | — | File structure, ESM, SCSS, React | none |
| 02 | `reading-data` | 01 | Read document content reactively | `appContent.onChange$()` |
| 03 | `writing-data` | 02 | Write back to the document | `appContent.set()`, `applyChanges()` |
| 04 | `inline-app` | 03 | The inline form: a full HTML document in `app-source` — no folder, no manifest — and why the missing manifest gates it | `discover('charmiq.service.command')`, scopes/consent |
| 05 | `persistent-state` | 03 | Config that survives reloads | `appState.onChange$()`, `appState.set()` |
| 06 | `charm-integration` | 05 | A Charm populates `appContent`; the Application renders it live | — |
| 07 | `app-discovery` | 06 | Two Applications in the same document | `advertise()` / `discover()` |
| 08 | `oauth` | 07 | Connecting to an external API — Google or GitHub | — |
| 09 | `mcp` | 08 | Calling an MCP server tool from inside an Application | — |

---

## 01 `hello-app` (done)

**Concept:** File structure, ESM, SCSS, React — no CharmIQ APIs.

**Files:** `manifest.json`, `index.html`, `main.tsx`, `App.tsx`, `styles.scss`, `_variables.scss`

- Manifest entry points, ESM import maps, SCSS partials, React mount pattern.
- Zero CharmIQ APIs — pure local state (`useState` counter).
- README walks through every file.

---

## 02 `reading-data`

**Concept:** The app reads document data reactively via `appContent.onChange$()`.

**Delta from 01:** Copy 01's files, then:

- **`manifest.json`** — add `runtime.appContent` with a single field (e.g. `"message": { "type": "text" }`).
- **`App.tsx`** — replace the counter with an `appContent.onChange$()` subscription that displays the current content. Introduce the `window.charmiq` global, RxJS subscribe/unsubscribe pattern in a `useEffect`, and the `AppContentChange` shape (`{ id, content, deleted }`).
- **`README.md`** — explain: content lives in the document, not in the app; `onChange$` fires immediately with the current value then on each edit; teardown the subscription on unmount.

Key code pattern:

```tsx
useEffect(() => {
  const sub = window.charmiq.appContent.onChange$().subscribe(change => {
    if(!change.deleted) setContent(change.content);
  });
  return () => sub.unsubscribe();
}, []);
```

Does NOT cover: writing data, multiple app-content blocks, selectors.

---

## 03 `writing-data`

**Concept:** The app writes back to the document via `appContent.set()` / `applyChanges()`.

**Delta from 02:** Copy 02's files, then:

- **`App.tsx`** — add a `<textarea>` (or simple input) that calls `appContent.set(newContent)` on change. Also demonstrate `applyChanges([{ from, to, insert }])` for incremental edits. Introduce the "guard flag" pattern to avoid infinite loops (`let updating = false`).
- **`README.md`** — explain: `set()` replaces everything (simple); `applyChanges()` sends deltas (OT-safe, better for collaboration). Show the updating-guard pattern and why it matters.

Key concepts: full replacement vs. incremental changes, OT safety, the update guard.

---

## 04 `inline-app` (done)

**Concept:** The inline Application form — a complete HTML document inside `app-source`; no folder, no files, no manifest — and what the missing manifest costs: every capability is a scope, scopes are declared in `requestedScopes`, and an Application that declares nothing cannot use any gated capability.

**Files:** `README.md` only (the document IS the Application — that's the point).

- A single "Celebrate" button calls `notification.toast.emit` through `discover('charmiq.service.command')`; the click is DENIED (`deny-undeclared`) because the inline form has nowhere to declare the scope — the denial and its error message are the lesson.
- Becomes a working toast when inline Applications gain a declaration mechanism (open design: srcdoc-embedded manifest).

---

## 05 `persistent-state`

**Concept:** App configuration that survives reloads without polluting document content.

**Delta from 03:** Copy 03's files, then:

- **`manifest.json`** — add `runtime.appState` with a default (e.g. `{ "theme": "light" }`).
- **`App.tsx`** — add a theme toggle (light/dark) backed by `appState.set()` / `appState.onChange$()`. Content editing still uses `appContent` from tutorial 03; theme preference uses `appState`.
- **`README.md`** — explain: `appState` is per-widget, JSON-serializable, last-write-wins (no OT). Good for preferences/config, not for collaborative content. Contrast with `appContent`.

Key distinction: `appContent` = collaborative document data (OT). `appState` = per-widget config (last-write-wins). Use each for what it's designed for.
