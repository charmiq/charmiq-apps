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

Two storage channels — one for the drawing's elements, one for its configuration. (Yes, the diagram below is itself rendered by Custom Drawing.)

<iframe-app height="420px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
  <app-content name="elements">
{"type":"text","x":130,"y":-5,"text":"Content Flow","fontSize":13,"fill":"#1a1a18","fontWeight":"bold","width":200,"height":16,"id":"ti_c"}
{"type":"text","x":610,"y":-5,"text":"Config Flow","fontSize":13,"fill":"#1a1a18","fontWeight":"bold","width":200,"height":16,"id":"ti_s"}
{"type":"rectangle","x":80,"y":20,"x2":320,"y2":80,"stroke":"#1a1a18","strokeWidth":2,"fill":"#ebeae5","id":"b_ih"}
{"type":"text","x":98,"y":32,"text":"InteractionHandler","fontSize":14,"fill":"#1a1a18","fontWeight":"bold","width":220,"height":18,"id":"t_ih1"}
{"type":"text","x":98,"y":52,"text":"mouse / keyboard","fontSize":11,"fill":"#1a1a18","width":220,"height":14,"id":"t_ih2"}
{"type":"rectangle","x":20,"y":160,"x2":210,"y2":230,"stroke":"#1a1a18","strokeWidth":2,"fill":"#ebeae5","id":"b_cb"}
{"type":"text","x":38,"y":172,"text":"ContentBridge","fontSize":13,"fill":"#1a1a18","fontWeight":"bold","width":170,"height":16,"id":"t_cb1"}
{"type":"text","x":38,"y":192,"text":"JSONL serialize","fontSize":11,"fill":"#1a1a18","width":170,"height":14,"id":"t_cb2"}
{"type":"rectangle","x":270,"y":160,"x2":440,"y2":230,"stroke":"#1a1a18","strokeWidth":2,"fill":"#ebeae5","id":"b_sr"}
{"type":"text","x":288,"y":188,"text":"SvgRenderer","fontSize":13,"fill":"#1a1a18","fontWeight":"bold","width":150,"height":16,"id":"t_sr1"}
{"type":"rectangle","x":80,"y":290,"x2":320,"y2":350,"stroke":"#d94a00","strokeWidth":2,"fill":"#ebeae5","id":"b_ac"}
{"type":"text","x":98,"y":302,"text":"appContent","fontSize":14,"fill":"#d94a00","fontWeight":"bold","width":220,"height":18,"id":"t_ac1"}
{"type":"text","x":98,"y":322,"text":"collaborative (OT-backed)","fontSize":11,"fill":"#1a1a18","width":220,"height":14,"id":"t_ac2"}
{"type":"rectangle","x":560,"y":20,"x2":800,"y2":80,"stroke":"#1a1a18","strokeWidth":2,"fill":"#ebeae5","id":"b_sp"}
{"type":"text","x":578,"y":32,"text":"SettingsPanel","fontSize":14,"fill":"#1a1a18","fontWeight":"bold","width":220,"height":18,"id":"t_sp1"}
{"type":"text","x":578,"y":52,"text":"gear icon","fontSize":11,"fill":"#1a1a18","width":220,"height":14,"id":"t_sp2"}
{"type":"rectangle","x":500,"y":160,"x2":690,"y2":230,"stroke":"#1a1a18","strokeWidth":2,"fill":"#ebeae5","id":"b_cs"}
{"type":"text","x":518,"y":172,"text":"ConfigStore","fontSize":13,"fill":"#1a1a18","fontWeight":"bold","width":170,"height":16,"id":"t_cs1"}
{"type":"text","x":518,"y":192,"text":"fetch-merge-set","fontSize":11,"fill":"#1a1a18","width":170,"height":14,"id":"t_cs2"}
{"type":"rectangle","x":750,"y":160,"x2":930,"y2":230,"stroke":"#1a1a18","strokeWidth":2,"fill":"#ebeae5","id":"b_vp"}
{"type":"text","x":768,"y":170,"text":"CanvasViewport","fontSize":11,"fill":"#1a1a18","fontWeight":"bold","width":160,"height":14,"id":"t_vp1"}
{"type":"text","x":768,"y":186,"text":"ToolManager","fontSize":11,"fill":"#1a1a18","fontWeight":"bold","width":160,"height":14,"id":"t_vp2"}
{"type":"text","x":768,"y":202,"text":"body classes","fontSize":11,"fill":"#1a1a18","fontWeight":"bold","width":160,"height":14,"id":"t_vp3"}
{"type":"rectangle","x":560,"y":290,"x2":800,"y2":350,"stroke":"#d94a00","strokeWidth":2,"fill":"#ebeae5","id":"b_as"}
{"type":"text","x":578,"y":302,"text":"appState","fontSize":14,"fill":"#d94a00","fontWeight":"bold","width":220,"height":18,"id":"t_as1"}
{"type":"text","x":578,"y":322,"text":"last-write-wins","fontSize":11,"fill":"#1a1a18","width":220,"height":14,"id":"t_as2"}
{"type":"line","x":180,"y":80,"x2":130,"y2":160,"stroke":"#1a1a18","strokeWidth":2,"endDecoration":"arrow","id":"a_ih_cb"}
{"type":"text","x":90,"y":112,"text":"mutate","fontSize":11,"fill":"#1a1a18","width":60,"height":14,"id":"l_ih_cb"}
{"type":"line","x":210,"y":195,"x2":270,"y2":195,"stroke":"#1a1a18","strokeWidth":2,"endDecoration":"arrow","id":"a_cb_sr"}
{"type":"text","x":222,"y":178,"text":"render","fontSize":11,"fill":"#1a1a18","width":60,"height":14,"id":"l_cb_sr"}
{"type":"line","x":150,"y":230,"x2":150,"y2":290,"stroke":"#1a1a18","strokeWidth":2,"endDecoration":"arrow","id":"a_cb_ac"}
{"type":"text","x":158,"y":252,"text":"set()","fontSize":11,"fill":"#1a1a18","width":50,"height":14,"id":"l_cb_ac"}
{"type":"line","x":90,"y":290,"x2":90,"y2":230,"stroke":"#d94a00","strokeWidth":2,"strokeDasharray":"4,4","endDecoration":"arrow","id":"a_ac_cb"}
{"type":"text","x":6,"y":252,"text":"onChange$","fontSize":11,"fill":"#d94a00","width":80,"height":14,"id":"l_ac_cb"}
{"type":"line","x":660,"y":80,"x2":610,"y2":160,"stroke":"#1a1a18","strokeWidth":2,"endDecoration":"arrow","id":"a_sp_cs"}
{"type":"text","x":575,"y":112,"text":"update","fontSize":11,"fill":"#1a1a18","width":60,"height":14,"id":"l_sp_cs"}
{"type":"line","x":690,"y":195,"x2":750,"y2":195,"stroke":"#1a1a18","strokeWidth":2,"endDecoration":"arrow","id":"a_cs_vp"}
{"type":"text","x":694,"y":178,"text":"applyConfig","fontSize":11,"fill":"#1a1a18","width":80,"height":14,"id":"l_cs_vp"}
{"type":"line","x":630,"y":230,"x2":630,"y2":290,"stroke":"#1a1a18","strokeWidth":2,"endDecoration":"arrow","id":"a_cs_as"}
{"type":"text","x":638,"y":252,"text":"set()","fontSize":11,"fill":"#1a1a18","width":50,"height":14,"id":"l_cs_as"}
{"type":"line","x":570,"y":290,"x2":570,"y2":230,"stroke":"#d94a00","strokeWidth":2,"strokeDasharray":"4,4","endDecoration":"arrow","id":"a_as_cs"}
{"type":"text","x":486,"y":252,"text":"onChange$","fontSize":11,"fill":"#d94a00","width":80,"height":14,"id":"l_as_cs"}
  </app-content>
  <app-state>{"config":{"readOnly":true,"showGrid":false,"showToolbar":false,"showPropertiesPanel":false,"showInfoBar":false,"backgroundColor":"#f7f7f4"}}</app-state>
</iframe-app>

**`appContent`** holds the drawing's elements, serialized as JSON Lines in a single named content block (`[name='elements']`). `ContentBridge` watches `onChange$()`, parses incoming content into `DrawingElement[]`, and hands it to the renderer. Locally-made mutations are flushed back via `set()`.

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

Elements are stored in a single named block (`[name='elements']`) as **JSON Lines** — one element per line:

```jsonl
{ "id": "el_...", "type": "rectangle", "x": 0, "y": 0, "width": 100, "height": 80, "stroke": "#000", ... }
{ "id": "el_...", "type": "line", "x": 10, "y": 10, "x2": 100, "y2": 100, ... }
```

JSONL is used instead of a single JSON array so that edits to one element produce a localized diff, rather than rewriting the entire document on every change. The content bridge also accepts a legacy single-array format on read for backward compatibility. The element schema matches the original `drawing.html` format, so drawings migrated from that source continue to work.


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
