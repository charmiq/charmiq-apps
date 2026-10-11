# Tutorial Plan

Each tutorial teaches exactly one new concept. The application from the previous step is the starting point.

Manifest IDs follow the convention `ai.charmiq.tutorials.<name>` (e.g. `ai.charmiq.tutorials.hello-app`).

| # | Name | Builds on | Adds | Key API |
|---|------|-----------|------|---------|
| 01 | `hello-app` | — | File structure, ESM, SCSS, React | none |
| 02 | `reading-data` | 01 | Read document content reactively | `appContent.onChange$()` |
| 03 | `writing-data` | 02 | Write back to the document as records, collaboratively and guarded | `appContent.applyChanges()`, `snapshot()` |
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

**Concept:** The app writes back to the document as one writer among many, following the three rules of the public guide (App-Content and App-State §Collaborating): the block is the truth, write records not the whole block, your own writes come back.

**Delta from 02:** Copy 02's files, then:

- **`records.ts`** — the block as records, one per line (`records`), the whole-line edits that add or remove one (`add`, `remove`), and the guarded write (`write`, `append`): edits measured on a snapshot apply only while the block is still exactly that. The same helpers as the public guide's example.
- **`App.tsx`** — a shared list: a form adds a record, each item removes its own with the snapshot it was rendered from. The subscription is the only path to the screen; every change replaces what is shown, never skipped by flag. A page without guarded edits shows the list read-only.
- **`README.md`** — the three rules, then records, guarded writes (an append is measured again, a removal is the user's to retry), showing what the block holds, and writing records.

Key concepts: you are never the only writer; whole records merge, whole-block writes overwrite; an edit is guarded by what it was measured on; your own writes come back merged.

---

## 04 `inline-app` (done)

**Concept:** The inline Application form — a complete HTML document inside `app-source`; no folder, no files, no manifest — and what the missing manifest costs: every capability is a scope, scopes are declared in `requestedScopes`, and an Application that declares nothing cannot use any gated capability.

**Files:** `README.md` only (the document IS the Application — that's the point).

- A single "Celebrate" button calls `notification.toast.emit` through `discover('charmiq.service.command')`; the click prompts (legacy per-scope consent — no manifest, no declaration), then toasts. The drip-per-capability vs the manifest's one batched dialog is the lesson.
- Inline grants anchor to the host document (`inline:{richtextId}` subject).

---

## 05 `persistent-state`

**Concept:** App configuration that survives reloads without polluting document content.

**Delta from 03:** Copy 03's files, then:

- **`manifest.json`** — add `runtime.appState` with a default (e.g. `{ "theme": "light" }`).
- **`App.tsx`** — add a theme toggle (light/dark) backed by `appState.set()` / `appState.onChange$()`. Content editing still uses `appContent` from tutorial 03; theme preference uses `appState`. The theme shown comes from `appState.onChange$()`, never from the toggle's own `set()` (rule 1 of 03).
- **`README.md`** — explain: `appState` is per-instance, JSON-serializable, last-write-wins (no OT). Good for preferences/config, not for collaborative content. Contrast with `appContent`.

Key distinction: `appContent` = collaborative document data (OT). `appState` = per-instance config (last-write-wins). Use each for what it's designed for.
