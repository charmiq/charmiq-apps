# Excalidraw Drawing

*A collaborative drawing canvas embedded in your workspace — with OT content sync, persistent configuration, and an LLM command surface.*

<iframe-app data-sandboxed="true" height="500px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
  <app-source></app-source>
</iframe-app>

## What This Is

The Excalidraw Drawing app puts a full-featured drawing canvas inside a CharmIQ document. Shapes, arrows, text, freehand strokes — the same toolset as [excalidraw.com](https://excalidraw.com), running in a sandboxed iframe.

Because it's built on CharmIQ's data layer, the drawing is collaboratively editable. Two people sketching on the same canvas merge cleanly through OT (operational transforms). Configuration — whether the toolbar is visible, whether the canvas starts in view-only mode — persists across sessions via `appState`.

It's also a reference implementation for embedding a complex third-party React library inside the Application platform. If you're wrapping a library that has no ESM CDN build and needs UMD `<script>` tags, load-order hacks, and global state — this is the pattern.

## In Practice

**Drawing** — Use the Excalidraw toolbar to create shapes, arrows, text, and freehand strokes. Everything syncs in real time.

**View mode** — An agent or the host can toggle `viewModeEnabled` via the config. When enabled, the canvas is read-only — useful for presenting finished diagrams.

**Menu visibility** — The main menu and toolbar can be hidden via `showMainMenu: false` in the config. This turns the canvas into a clean, view-only embed.

**Libraries** — Excalidraw's library browser works through a bridge page hosted on the platform. Installed libraries appear in the toolbar and are persisted in the drawing's content.

**Charms can drive the canvas** — Tag a Charm and ask it to read or write the drawing JSON, query scene elements, or toggle configuration. The app advertises a [command surface](#command-surface) that Charms call directly.


> **For Developers** — The rest of this page covers how the app is built. If you're learning the Application platform or building something similar, read on.


## How It's Built

The app is folder-based, with each module owning a single concern.

| File | Responsibility |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map (RxJS, fast-diff), CDN dependencies |
| [`src/index.html`](charmiq://./src/index.html) | Structural shell — UMD script tags, asset-path hack, bare `<div id="app">` |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Body reset, full-viewport sizing |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point. Creates instances, wires dependencies, starts discovery |
| [`src/app-component.ts`](charmiq://./src/app-component.ts) | React App factory via `createElement` (UMD globals, not TSX) |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | OT sync between Excalidraw scene and `appContent`. Inbound apply, outbound diff |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Drawing config persisted via `appState`. Menu visibility, view mode |
| [`src/diff-converter.ts`](charmiq://./src/diff-converter.ts) | Converts fast-diff output into OT change objects, with consolidation |
| [`src/library-handler.ts`](charmiq://./src/library-handler.ts) | Library install via postMessage + BroadcastChannel from bridge page |
| [`src/command.ts`](charmiq://./src/command.ts) | Charm command surface via `charmiq.advertise` |

### Data Flow

Two storage channels — one for content, one for config:

```
appContent (OT)         ← drawing JSON (elements, appState, files, libraryItems)
appState (last-write)   ← configuration (showMainMenu, viewModeEnabled)
```

The content bridge serializes the Excalidraw scene to pretty-printed JSON, diffs it against the last known server state, and sends the minimal OT changes. Inbound, it parses the JSON and pushes it into `updateScene()`.

### The UMD / Asset-Path Hack

Excalidraw 0.17.6 has no usable ESM CDN build. The UMD bundle is loaded via `<script>` tags in `index.html`, and `EXCALIDRAW_ASSET_PATH` is set **twice**:

1. **Before** the UMD loads — pointing to `dist/` so Webpack's internal chunk loader finds the right folder.
2. **After** the UMD loads — switched to the root so that font loading (which appends `dist/` internally) resolves correctly.

This is a known workaround for Excalidraw's asset resolution. The two-phase set is intentional and must happen in this exact order. When Excalidraw eventually ships an ESM build, the hack can be removed entirely.

### Synchronous Re-entry Guard

Excalidraw fires its `onChange` callback synchronously during `updateScene()`. Without a guard, an inbound remote update would immediately trigger the outbound path, diff the content against itself, and attempt a no-op write. The `updating` flag in `content-bridge.ts` prevents this. It's a narrow, synchronous guard — set before `updateScene()`, cleared after — not a suppression of remote changes. The broader loop protection is **state comparison**: if the incoming JSON matches `lastJSON`, the update is skipped entirely.

### Command Surface

The app advertises these commands via `charmiq.advertise`:

| Command | Description |
|---|---|
| `getText()` | Return the current drawing JSON |
| `setText(text)` | Replace the drawing content |
| `getSceneElements()` | Return Excalidraw's scene elements array |
| `getAppState()` | Return Excalidraw's app state |
| `getConfig()` | Return the current widget configuration |
| `setConfig(partial)` | Merge partial config and persist to appState |
