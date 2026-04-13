# Mermaid Diagram

*A read-only Mermaid renderer that turns diagram source in `appContent` into live SVG.*

<iframe-app data-sandboxed="true" height="300px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
  <app-content name="demo">
graph LR
    A[appContent] -->|onChange$| B[ContentBridge]
    B -->|mermaid.render| C[SVG]
    D[appState] -->|onChange$| E[ConfigStore]
    E -->|theme / options| B
  </app-content>
  <app-source></app-source>
</iframe-app>

## What This Is

The Mermaid Diagram app renders [Mermaid](https://mermaid.js.org) source text into SVG, live, inside a CharmIQ document. Flowcharts, sequence diagrams, Gantt charts, ER diagrams, pie charts — anything Mermaid supports.

It's **read-only**. The diagram source lives in `appContent`, and other tools write to it: a CodeMirror editor tab, a Charm, an agent, an MCP tool. This app just renders whatever arrives. When the source changes, the diagram re-renders automatically.

Theme and layout options are persisted in `appState`, so an agent can switch to dark mode or change the flowchart curve without touching the diagram source.

## In Practice

**Embedding a diagram** — Add a `<iframe-app>` pointing at this app, with the Mermaid source in an `<app-content>` block:

```html
<iframe-app src="charmiq://../mermaid-diagram">
  <app-content name="my-diagram">
graph TD
    A --> B
    B --> C
  </app-content>
</iframe-app>
```

**Changing the theme** — Set `appState` (via a Charm, agent, or the command surface):

```json
{ "theme": "dark" }
```

Available themes: `default`, `neutral`, `dark`, `forest`, `base`.

**Flowchart options** — Pass Mermaid's `flowchart` config:

```json
{ "theme": "neutral", "flowchart": { "curve": "basis" } }
```


> **For Developers** — The rest of this page covers how the app is built.


## How It's Built

| File | Responsibility |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map (RxJS, Mermaid), runtime flags |
| [`src/index.html`](charmiq://./src/index.html) | Bare shell — `<div id="diagram">` and `<div id="error">` |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Centering, SVG sizing, error display styling |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point. Creates instances, wires config → render, starts discovery |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | Subscribes to `appContent`, calls `mermaid.render()`, shows errors inline |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Diagram config persisted via `appState`. Theme, flowchart options |
| [`src/command.ts`](charmiq://./src/command.ts) | Charm command surface via `charmiq.advertise` |

### Data Flow

```
appContent (OT)         ← Mermaid source text (read-only for this app)
appState (last-write)   ← configuration (theme, flowchart options)
```

Content flows **one direction**: `appContent` → `ContentBridge` → `mermaid.render()` → SVG in the DOM. There are no outbound writes. If the source contains a syntax error, the error is displayed inline and the stale diagram is cleared.

A monotonic render counter discards stale renders — if the source changes twice in quick succession, only the latest render is applied.

### Command Surface

| Command | Description |
|---|---|
| `getText()` | Return the current Mermaid source text |
| `getConfig()` | Return the current theme/options configuration |
| `setConfig(partial)` | Merge partial config and persist to appState |
