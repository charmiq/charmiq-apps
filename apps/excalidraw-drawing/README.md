# Excalidraw Drawing

*A collaborative drawing canvas embedded in your workspace — every element kept in step between collaborators, with persistent configuration and an LLM command surface.*

<iframe-app height="500px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
</iframe-app>


## What This Is

The Excalidraw Drawing app puts a full-featured drawing canvas inside a CharmIQ document. Shapes, arrows, text, freehand strokes — the same toolset as [excalidraw.com](https://excalidraw.com), running in a sandboxed iframe.

Because it's built on CharmIQ's data layer, the drawing is collaboratively editable: two people sketching on the same canvas both keep their work, element by element. Configuration — whether the toolbar is visible, whether the canvas starts in view-only mode — persists across sessions via `appState`.

It's also a reference implementation for embedding a complex third-party React library inside the Application platform, loaded as ES modules through the manifest's import map.


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
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map (Excalidraw, React, RxJS), the `/shared` mount |
| [`src/index.html`](charmiq://./src/index.html) | Structural shell — Excalidraw's stylesheet and font path, bare `<div id="app">` |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Body reset, full-viewport sizing |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point. Creates instances, reads the drawing, mounts Excalidraw with it |
| [`src/app-component.ts`](charmiq://./src/app-component.ts) | React App factory via `createElement`; opens with the drawing as `initialData` |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | The scene as records in the drawing's app-content, kept in step by id (`shared/line-records`) |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Drawing config persisted via `appState`. Menu visibility, view mode |
| [`src/library-handler.ts`](charmiq://./src/library-handler.ts) | Library install via postMessage + BroadcastChannel from bridge page |
| [`src/command.ts`](charmiq://./src/command.ts) | Charm command surface via `charmiq.advertise` |


### Data Flow

Two storage channels — one for content, one for config:

<iframe-app height="380px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://../mermaid-diagram">
  <app-content name="data-flow">
graph TD
    EX["Excalidraw\n(React)"] -->|"onChange (debounced)"| CB["ContentBridge\n(records by id)"]
    CB -->|"initialData, updateScene"| EX
    CB -->|"whole-line writes"| AC["appContent\n(collaborative)"]
    AC -->|"contents$"| CB
    CS["ConfigStore\n(appState)"] -->|"theme / viewMode"| APP["App Component"]
    APP --> EX
    CS --> AS["appState\n(last-write-wins)"]
    LH["LibraryHandler"] -->|"updateLibrary"| EX
  </app-content>
  <app-state>{"theme":"neutral"}</app-state>
</iframe-app>

The drawing is one app-content named `scene`, one record per line: the scene's settings, each image file, each library item, then each element. Adding an element appends its line, so an image's line (often megabytes) is never rewritten by it.

**Drawing together.** Another tab, another user, a Charm or another Application can change the drawing at the same moment. A save writes only the elements this client changed (an element changes with its `version`), as whole lines, measured on the app-content as it is now and refused whole when it changed since, then measured again; every other line stays exactly as it was, however large the drawing or the change. The document is the authority: when two people change the same element at once, one whole version of it stands and both canvases show it, and Platform Undo of a change shows on every canvas. Only where your client still holds a change of its own to an element does Excalidraw's rule decide (the higher `version`, at an equal version the lower `versionNonce`), and an element you are drawing, dragging or editing right now stays as it is on your canvas. An element's place in the drawing is its own fractional `index`, so a reorder is a change to that element like any other.

**Deleted elements** stay as lines marked `isDeleted` for a day, so a stale copy never brings one back, then are dropped.

**Opening.** The drawing is read before Excalidraw mounts and handed to it as `initialData`, so Excalidraw restores it like any scene it loads. Nothing is saved until the canvas holds the drawing: a canvas still opening is never taken for one you emptied, and `setText` is refused (changing nothing) until it does. A drawing stored by an earlier version of this app (one scene object in an app-content of another name) is neither read nor written.


### Command Surface

The app advertises these commands via `charmiq.advertise`:

| Command | Description |
|---|---|
| `getText()` | Return the drawing as Excalidraw scene JSON |
| `setText(text)` | Replace the drawing with the scene JSON given: its elements stand, every other element is deleted |
| `getSceneElements()` | Return Excalidraw's scene elements array |
| `getSceneState()` | Return Excalidraw's scene state (zoom, cursor, background, etc.) |
| `getConfig()` | Return the current application configuration |
| `setConfig(partial)` | Merge partial config and persist to appState |
