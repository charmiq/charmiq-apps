# Image Gallery

*A minimal, Swiss-styled image gallery backed by platform Assets — with an optional labelled-slot layer that other Applications can subscribe to.*

<iframe-app height="420px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
</iframe-app>


## What This Is

The Image Gallery is a reusable surface for collecting images and, optionally, binding them into named slots that a consuming Application defines. Two modes in one app
 - **Gallery mode** — a plain responsive grid of images pulled from platform Assets. Click any tile for a lightbox, drag the zoom slider to resize tiles, use the `+` button (or the empty-state button) to pick new images from the platform media picker.
 - **Slot mode** — an extra strip of labelled tiles above the grid. A host Application declares the slots in `appState` (e.g. `iChannel0..3` for a shader) and the User fills them by drag-and-drop or click-then-click. Consuming Apps observe the bindings via a reactive capability.

Because the gallery is generic, it knows nothing about what its slots mean. Consumers hang their own typed metadata on each binding (a sampler filter mode, a colour curve, a channel index) and the gallery round-trips it untouched.


## In Practice

**Adding images** — Click the `+` icon (or the "Add images" button when empty) to open the platform media picker. Selected Assets land at the end of the grid.

**Removing images** — Hover a grid tile for the `×` overlay, click to remove. Any slot that was bound to that item becomes empty (meta is preserved).

**Lightbox** — Click a grid tile to open the lightbox. Arrow keys navigate; `Esc` closes.

**Zoom** — Drag the slider in the header; the preference is persisted to `appState`.

**Slot binding (when slots are configured)**
 - *Click-then-click* — click a slot tile to activate it (dashed border turns solid), then click any grid image to bind. `Esc` or clicking the same slot again cancels.
 - *Drag-and-drop* — drag a grid image onto a slot tile.
 - *Slot-to-slot* — drag a bound slot onto another slot to **move** the binding (the source becomes empty — not a swap, because duplicates are allowed).
 - *Unbind* — click the `×` overlay on a bound slot.

**Orientation** — Horizontal by default, adapts to a vertical layout when the container is taller than wide. A consumer can pin either via `appState.config.orientation`.


> **For Developers** — The rest of this page covers how the Application is built and how other Apps consume it.


## How It's Built

| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Application identity, import map, advertised commands |
| [`src/index.html`](charmiq://./src/index.html) | Structural shell — header, slot strip, grid, lightbox |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Swiss-minimal styling; orientation + selecting-mode class hooks |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Gallery configuration (slot definitions, orientation, zoom) via `appState` |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | Two named `appContent` blocks — `items` and `bindings` — as JSONL |
| [`src/asset-resolver.ts`](charmiq://./src/asset-resolver.ts) | Opens the media picker, resolves Assets into `GalleryItem` records |
| [`src/gallery-model.ts`](charmiq://./src/gallery-model.ts) | Reactive model — BehaviorSubjects for items, slots, bindings, and a combined public state |
| [`src/grid-view.ts`](charmiq://./src/grid-view.ts) | Grid + lightbox + zoom slider DOM |
| [`src/slot-strip.ts`](charmiq://./src/slot-strip.ts) | Slot tiles + click-to-bind + drag-and-drop |
| [`src/command-surface.ts`](charmiq://./src/command-surface.ts) | Advertises `charmiq.command` and `ai.charmiq.shared.imageGallery` |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point — composes modules, owns the imperative actions, auto-orientation |


### Data Flow

```
       ┌────────────────┐
       │  appContent    │      ┌────────────────┐
       │  items (JSONL) │◄────►│ ContentBridge  │
       │  bindings      │      └───────┬────────┘
       └────────────────┘              │
                                       ▼
       ┌────────────────┐      ┌────────────────┐      ┌─────────────┐
       │  appState      │◄────►│  ConfigStore   │──►──►│  main.ts    │
       │  config        │      └────────────────┘      │  (actions)  │
       │  (slots, zoom) │                              └─┬─────────┬─┘
       └────────────────┘                                │         │
                                                         ▼         ▼
                                                 ┌──────────┐ ┌──────────┐
                                                 │ GridView │ │SlotStrip │
                                                 └──────────┘ └──────────┘
                                                         ▲         ▲
                                                         │         │
                                                         └─────────┘
                                                  GalleryModel (BehaviorSubjects)
                                                         │
                                                         ▼
                                                 ai.charmiq.shared.imageGallery
                                                 (reactive capability)
```

**State vs content** — a deliberate split
 - *State* is configuration: slot *definitions* (id + label), orientation, zoom, maxItems. Lives in `appState`.
 - *Content* is data: the collection of items and their slot *bindings*. Lives in two named `appContent` blocks (`items`, `bindings`), each serialized as JSON Lines for OT-friendly diffs.

Bindings persist even when `itemId=null` so slot order stays stable and so opaque `meta` can outlive a binding.


### The Capability (`ai.charmiq.shared.imageGallery`)

Any Application running in the same Document can call `charmiq.discover('ai.charmiq.shared.imageGallery')` to attach to the gallery. The capability surface
 - `items$()` → `Observable<ReadonlyArray<GalleryItem>>`
 - `slots$()` → `Observable<ReadonlyArray<SlotDefinition>>`
 - `bindings$()` → `Observable<ReadonlyArray<BindingRecord>>`
 - `state$()` → `Observable<PublicState>` — combined snapshot with bindings resolved inline as `PublicSlot` records
 - `getState()` — synchronous snapshot accessor for late subscribers
 - `bindSlot(slotId, itemId)` / `setSlotMeta(slotId, meta)` / `clearAllSlots()` — action passthroughs

The `meta` field on each binding is opaque to the gallery. Consumers store their own typed configuration there (a shader app might stash `{ sampler: 'linear', wrap: 'repeat' }`) and read it back via the streams.


### The Command Surface (`charmiq.command`)

Agents can drive the gallery directly
 - `addItems()` → opens the picker, returns new item ids
 - `removeItem({ itemId })`
 - `getItems()` / `getSlots()`
 - `bindSlot({ slotId, itemId })` — pass `itemId: null` to unbind
 - `setSlotMeta({ slotId, meta })`
 - `clearAllSlots()`


## Configuring the Gallery

A host Application writes to `appState.config`. The gallery merges per-field and only re-renders what changed.

| Field | Type | Default | Notes |
|----|----|----|----|
| `slots` | `Array<{ id, label, required? }>` \| `undefined` | `undefined` | Presence flips on slot mode |
| `maxItems` | `number` | `0` (unlimited) | Oldest items drop when exceeded |
| `orientation` | `'auto' \| 'horizontal' \| 'vertical'` | `'auto'` | `auto` tracks container aspect |
| `zoomSize` | `number` (80-400) | `200` | Persisted UI pref |
| `showLightbox` | `boolean` | `true` | |
| `assetCategory` | `'image'` | `'image'` | Forwarded to the picker |
