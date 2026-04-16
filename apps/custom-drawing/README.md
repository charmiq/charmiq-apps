# Custom Drawing

An SVG drawing canvas with shape tools, text, images, rotation, grouping, and export — with reactive state sync and an LLM command surface.

## Features

- **Shape tools**: Rectangle, Diamond, Ellipse, Line with arrow/triangle decorations
- **Text**: Multi-line with word wrapping, alignment, font size
- **Images**: Import from URL, local files, clipboard, platform Files, or drag-and-drop
- **Selection**: Click, shift-click, marquee selection with group expansion
- **Transform**: Move (axis-locked with Shift), resize (proportional for images), rotate (15° snap with Shift)
- **Properties panel**: Stroke color/width/style, fill color, text size/color/align, line decorations, layer ordering
- **Grouping**: Group/ungroup selected elements
- **Clipboard**: Copy/cut/paste elements, paste SVG content
- **Export**: PNG download, copy to clipboard, save to platform Files
- **AI Generation**: Generate images from drawing content
- **Reactive state**: Real-time collaborative sync via `appState`
- **LLM command surface**: `getElements`, `addElement`, `addElements`, `move`, `rotate`, `delete`, `group`, `ungroup`, `clear`

## Architecture

```
src/
├── main.ts                 # entry point — creates modules, wires dependencies
├── index.html              # HTML shell (toolbar, panels, SVG canvas, modals)
├── styles.scss             # all CSS
├── element-model.ts        # types, interfaces, bounds, id generation
├── geometry.ts             # rotation math, hit-testing, distance helpers
├── text-measurement.ts     # font loading, text wrapping via offscreen canvas
├── canvas-viewport.ts      # pan, zoom, coordinate transforms
├── svg-renderer.ts         # SVG element creation/update, line markers
├── tool-manager.ts         # tool selection, cursor management
├── selection-manager.ts    # selection state, handles, bounding boxes
├── interaction-handler.ts  # mouse/keyboard events, drawing, move, resize, rotate
├── text-editor.ts          # text input overlay
├── image-handler.ts        # image import (URL, files, clipboard, drag-drop)
├── export-handler.ts       # PNG export to download/clipboard/files
├── generation-handler.ts   # AI image generation
├── properties-panel.ts     # property dropdowns and layer ordering
├── clipboard-handler.ts    # copy/cut/paste, SVG paste, group/ungroup
├── state-bridge.ts         # reactive state sync with appState (rxjs)
└── command-surface.ts      # advertised LLM commands
```

## Storage Format

State is stored in `appState` as:

```json
{
  "elements": [ { "id": "...", "type": "rectangle", "x": 0, "y": 0, ... } ],
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

This format is **fully compatible** with the original `drawing.html` application.

## Dependencies

- **rxjs** (via ESM import map) — reactive state observation
- **Excalifont** (CDN) — hand-drawn style font
