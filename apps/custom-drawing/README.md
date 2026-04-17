# Custom Drawing

*An SVG drawing canvas with shape tools, text, images, rotation, grouping, and export — with a configurable viewing mode and an LLM command surface.*

<iframe-app height="500px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
</iframe-app>


## What This Is

The Custom Drawing app is a full SVG editor embedded directly in your CharmIQ document. Shape tools, text, images, grouping, rotation, PNG export, and AI-assisted generation — all working inside a zoomable, pannable canvas. Because it's built on CharmIQ's data layer, every element is collaboratively editable: two people moving shapes in the same drawing merge cleanly.

It's also a reference implementation. If you're building a complex Application, this one shows how to combine an element-based document model (in `appContent`) with a rich configuration surface (in `appState`) — plus a Charm command surface, mobile-friendly chrome, and multi-module TypeScript.


## In Practice

**Drawing** — Pick a shape tool from the toolbar (or press `R`, `D`, `O`, `L`, `T`, `I` for rectangle, diamond, ellipse, line, text, image) and drag on the canvas. Hold Shift to axis-lock or constrain proportions.

**Selecting** — The arrow tool (`V`) selects; shift-click adds to selection; drag on empty canvas for a marquee. Grouped elements select together.

**Transforming** — Drag the handles on the selection bounding box to resize; drag the tab above it to rotate (Shift snaps to 15°). Arrow keys nudge; Shift+arrow nudges farther.

**Editing properties** — The properties panel (right side of the toolbar) exposes stroke, fill, text style, line decorations, and layer ordering for the current selection.

**Images and export** — Insert images from URL, local files, clipboard, platform Files, or drag-and-drop. Export the drawing (or a selection) as PNG to download, clipboard, or platform Files.

**AI generation** — Press `G` or click the wand icon to generate an image from your drawing or current selection.

**Settings (gear icon)** — Toggle the grid, change grid and background colors, switch to read-only or display-only mode, and hide individual pieces of UI chrome. Settings persist across sessions and are shared with anyone viewing the document.

**Charms can drive the drawing** — The app advertises a command surface that Charms can call to add, move, rotate, delete, group, ungroup, or clear elements.


> **For Developers** — The rest of this page covers how the Application is built. If you're learning the Application platform or building something similar, read on.


## How It's Built

The Application is folder-based, with each module owning a single concern. This separation keeps the codebase navigable and makes the data flow explicit.

| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map, advertised commands |
| [`src/index.html`](charmiq://./src/index.html) | Structural shell — toolbar, properties panel, SVG canvas, modals |
| [`src/styles.scss`](charmiq://./src/styles.scss) | All visual styling, chrome-visibility classes, settings modal |
| [`src/element-model.ts`](charmiq://./src/element-model.ts) | Element types, bounds, id generation, `moveElementBy` helper |
| [`src/geometry.ts`](charmiq://./src/geometry.ts) | Rotation math, hit-testing, distance helpers |
| [`src/text-measurement.ts`](charmiq://./src/text-measurement.ts) | Font loading, text wrapping via offscreen canvas |
| [`src/canvas-viewport.ts`](charmiq://./src/canvas-viewport.ts) | Pan, zoom, coordinate transforms, grid/background control |
| [`src/svg-renderer.ts`](charmiq://./src/svg-renderer.ts) | SVG element creation/update, line decoration markers |
| [`src/tool-manager.ts`](charmiq://./src/tool-manager.ts) | Tool selection, cursor management, read-only gating |
| [`src/selection-manager.ts`](charmiq://./src/selection-manager.ts) | Selection state, handles, bounding boxes |
| [`src/interaction-handler.ts`](charmiq://./src/interaction-handler.ts) | Mouse/keyboard events — drawing, move, resize, rotate, marquee |
| [`src/text-editor.ts`](charmiq://./src/text-editor.ts) | Text input overlay |
| [`src/image-handler.ts`](charmiq://./src/image-handler.ts) | Image import (URL, files, clipboard, drag-drop) |
| [`src/export-handler.ts`](charmiq://./src/export-handler.ts) | PNG export to download, clipboard, or platform Files |
| [`src/generation-handler.ts`](charmiq://./src/generation-handler.ts) | AI image generation |
| [`src/properties-panel.ts`](charmiq://./src/properties-panel.ts) | Property dropdowns and layer ordering |
| [`src/clipboard-handler.ts`](charmiq://./src/clipboard-handler.ts) | Copy/cut/paste, SVG paste, group/ungroup |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | Elements JSON sync with `appContent`. Owns the discovery phase |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Drawing configuration persisted via `appState`. Fetch-merge-set writes |
| [`src/settings-panel.ts`](charmiq://./src/settings-panel.ts) | Settings modal UI |
| [`src/command-surface.ts`](charmiq://./src/command-surface.ts) | Charm command surface via `charmiq.advertise` |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point. Creates instances, wires dependencies, starts discovery |


### Data Flow

Two storage channels — one for the drawing's elements, one for its configuration:

<iframe-app height="340px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://../mermaid-diagram">
  <app-content name="data-flow">
graph TD
    IH["InteractionHandler\n(mouse / keyboard)"] -->|"mutate elements"| EM["elements[]\n(in-memory)"]
    EM -->|"save()"| CB["ContentBridge\n(JSON serialize)"]
    CB --> AC["appContent\n(collaborative)"]
    AC -->|"onChange$"| CB
    CB -->|"re-render"| SR["SvgRenderer"]
    SP["SettingsPanel"] --> CS["ConfigStore\n(appState)"]
    CS --> AS["appState\n(last-write-wins)"]
    AS -->|"onChange$"| CS
    CS -->|"applyConfig"| VP["CanvasViewport\nToolManager\nbody classes"]
  </app-content>
  <app-state>{"theme":"neutral"}</app-state>
</iframe-app>

**`appContent`** holds the drawing's elements, serialized as a JSON array in a single named content block (`[id='elements']`). `ContentBridge` watches `onChange$()`, parses incoming content into `DrawingElement[]`, and hands it to the renderer. Locally-made mutations are flushed back via `set()`.

**`appState`** holds the drawing's configuration — grid visibility and color, background color, read-only flag, and UI chrome toggles. It uses last-write-wins semantics, appropriate for settings that one user at a time controls. `ConfigStore` always reads the current state before writing so partial updates don't clobber unrelated fields.


### Configuration (`appState`)

All settings live under the `config` key of `appState`. Any field not present falls back to the default.

| Field | Type | Default | Purpose |
|----|----|----|----|
| `showGrid` | boolean | `true` | Display the background grid pattern |
| `gridColor` | string (CSS color) | `"#e0e0e0"` | Stroke color of the grid lines |
| `backgroundColor` | string (CSS color) | `"#fafafa"` | Canvas background fill |
| `readOnly` | boolean | `false` | Disables drawing, moving, resizing, rotating, deleting, and text/image editing. Selection, pan, zoom, copy, and export still work |
| `showToolbar` | boolean | `true` | Show the main toolbar (shape tools, image, generate, export, settings) |
| `showPropertiesPanel` | boolean | `true` | Show the properties panel when elements are selected |
| `showInfoBar` | boolean | `true` | Show the hint bar under the toolbar |

Example — a read-only, display-only embedding with a white canvas and no grid:

```json
{
  "config": {
    "showGrid": false,
    "backgroundColor": "#ffffff",
    "readOnly": true,
    "showToolbar": false,
    "showPropertiesPanel": false,
    "showInfoBar": false
  }
}
```

Users can edit these values through the Settings gear in the toolbar, or Charms / other Applications can write them directly to `appState`.


### Content Format (`appContent`)

Elements are stored as a JSON array in a single named block:

```json
[
  { "id": "el_...", "type": "rectangle", "x": 0, "y": 0, "width": 100, "height": 80, "stroke": "#000", ... },
  { "id": "el_...", "type": "line", "x": 10, "y": 10, "x2": 100, "y2": 100, ... }
]
```

The element schema matches the original `drawing.html` format, so drawings migrated from that source continue to work.


### Design Decisions Worth Noting

**Elements in `appContent`, settings in `appState`.** The two storage channels exist for different reasons. `appContent` is OT-backed and merges concurrent writes; it's where the collaborative document lives. `appState` is last-write-wins and is where configuration lives — things one user at a time controls. Putting the element array in `appContent` means two people can draw at the same time without either losing work; putting the configuration in `appState` means a flip of the "read-only" switch propagates cleanly without fighting anyone's edits.

**Read-only is gated at the interaction layer, not by removing handlers.** `InteractionHandler` and `ToolManager` both check a shared `readOnly` flag. Mouse-down on an element still selects it; it just doesn't start a move operation. Shape tools can't be chosen. Keyboard shortcuts skip mutations. This keeps pan, zoom, marquee selection, and copy working — which is what "display-only" should feel like when people are discussing a drawing.

**Chrome visibility via body classes.** Each "show X" config flag toggles a body class (`hide-toolbar`, `hide-info-bar`, `hide-properties-panel`). CSS owns the actual visibility. This keeps the toggle logic a single line per flag and makes the effect inspectable in the DOM.

**RxJS at the boundary only.** `appContent.onChange$()` and `appState.onChange$()` return Observables; the bridges subscribe to them. But RxJS doesn't appear inside the drawing modules themselves — only at the integration points where the CharmIQ API requires it.


## Next Steps

**→ [App-Content and App-State](https://team.charmiq.ai/docs/application/developer-app-content-and-app-state)** — The two storage channels this Application uses, and when to reach for each.

**→ [Application Discovery](https://team.charmiq.ai/docs/application/developer-application-discovery)** — How Applications advertise capabilities and how Charms (and other Applications) discover them.

**→ [Building Applications](https://team.charmiq.ai/docs/application/building-applications)** — Inline vs. folder-based Applications, and how the build pipeline assembles source files.

**→ [The Bridge API](https://team.charmiq.ai/docs/application/developer-bridge-api)** — Full reference for `window.charmiq`.
