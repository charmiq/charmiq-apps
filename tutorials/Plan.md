# Tutorial Plan

Each tutorial teaches exactly one new concept. The application from the previous step is the starting point.

Manifest IDs follow the convention `ai.charmiq.tutorials.<name>` (e.g. `ai.charmiq.tutorials.hello-app`).

| # | Name | Builds on | Adds | Key API |
|---|------|-----------|------|---------|
| 01 | `hello-app` | — | File structure, ESM, SCSS, React | none |
| 02 | `reading-data` | 01 | Read document content reactively | `appContent.content$()` |
| 03 | `writing-data` | 02 | Write back to the document as lines, collaboratively and guarded | `content.appendLine()`, `content.removeLine()` |
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

**Concept:** The app reads document data reactively via `appContent.content$()`.

**Delta from 01:** Copy 01's files, then:

- **`manifest.json`** — add `runtime.appContent` with a single field (e.g. `"message": { "type": "text" }`).
- **`App.tsx`** — replace the counter with an `appContent.content$()` subscription that displays the app-content's text, `null` as no app-content, and a refused read's reason. Introduce the `window.charmiq` global and the RxJS subscribe/unsubscribe pattern in a `useEffect`.
- **`README.md`** — explain: content lives in the document, not in the app; `content$` fires immediately with the app-content as it stands, then on each change; `null` means no app-content (exact: the Platform knows when an app-content is removed); a selector names another app-content; teardown the subscription on unmount.

Key code pattern:

```tsx
useEffect(() => {
  const sub = window.charmiq.appContent.content$().subscribe({ next: setContent, error: setFailure });
  return () => sub.unsubscribe();
}, []);
```

Does NOT cover: writing data, multiple app-contents.

---

## 03 `writing-data`

**Concept:** The app writes back to the document as one writer among many, through the app-content it was given: every write is measured on the app-content it is called on and refused whole if it changed since.

**Delta from 02:** Copy 02's files, then:

- **`App.tsx`** — a shared list over `content$()`: a form adds a line (`content.appendLine`), each item removes its own line through the app-content it was shown from (`content.removeLine`). The subscription is the only path to the screen; a refused removal says so. A page without `content$` asks for a reload.
- **`README.md`** — you are never the only writer; writes measured on the app-content; `appendLine` measures again by itself, `removeLine` is the user's to retry; show what the app-content holds; whole lines merge, `set()` overwrites.

Key concepts: you are never the only writer; whole lines merge, whole-app-content writes overwrite; a write is guarded by the app-content it was measured on; your own writes come back merged.

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

- **`manifest.json`** — add `runtime.appState` with a default (e.g. `{ "sort": "entered" }`).
- **`App.tsx`** — add a sort-order toggle (as entered, A–Z) backed by `appState.set()` / `appState.onChange$()`. Content editing still uses `appContent` from tutorial 03; the sort preference uses `appState`. The order shown comes from `appState.onChange$()`, never from the toggle's own `set()`: what an Application shows is what the document holds, as in 03. Never a light/dark toggle: an Application follows the document's mode through `prefers-color-scheme`.
- **`README.md`** — explain: `appState` is per-instance, JSON-serializable, last-write-wins (no OT). Good for preferences/config, not for collaborative content. Contrast with `appContent`.

Key distinction: `appContent` = collaborative document data (OT). `appState` = per-instance config (last-write-wins). Use each for what it's designed for.
