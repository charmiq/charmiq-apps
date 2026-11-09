# AYS Dialog

*A customizable "Are You Sure" confirmation dialog — built as a Web Component with TSX, SCSS, and zero frameworks.*

<iframe-app height="280px" width="100%" src="charmiq://./demo">
</iframe-app>

Click the buttons above. Each triggers a different dialog type — warning, error, info. The event log shows which CustomEvent fired. That's the full component running live.

## What this demonstrates

This is a Web Component built with:

- **TSX without React.** JSX is syntactic sugar for function calls. The compiler sees `<div class="foo">` and emits `h('div', { class: 'foo' })`. Here, `h()` comes from [Preact](https://preactjs.com) — a 3KB library that provides the same `createElement` as React. Preact loads at runtime via the import map. No React, no virtual DOM diffing overhead for this use case — just a battle-tested DOM factory.

- **SCSS in a separate file.** The component's styles live in [`ays-dialog.scss`](charmiq://./ays-dialog.scss), not in a JavaScript string. Real SCSS with variables, nesting, `:host` selectors — and real syntax highlighting in the editor. The component imports the file, the pipeline compiles it to CSS text, and the component puts that text in a `<style>` in its shadow root.

- **The pipeline handles everything.** TypeScript compilation, JSX transformation, SCSS compilation — all from a manifest and source files. No bundler config, no build step, no `node_modules`.

- **No indirection.** The manifest sets `output: "script"` and points directly at [`ays-dialog.tsx`](charmiq://./ays-dialog.tsx) — no HTML shell, no intermediary `main.tsx`. The component registers itself when its module runs.

## Using it in an Application

An Application bundles the component: it mounts the folder holding it and imports it, and the build carries the component and its styles. The demo above is [`demo/`](charmiq://./demo/manifest.json), which mounts this folder at `/ays-dialog`:

```json aK4nR8pWqM
"mounts": { "/ays-dialog": ".." },
"dependencies": {
  "importMap": {
    "preact": "https://esm.sh/preact@11.0.0",
    "preact/jsx-runtime": "https://esm.sh/preact@11.0.0/jsx-runtime"
  }
}
```

```ts bM5pS9qXrN
import '/ays-dialog/ays-dialog';
```

The importing Application's import map supplies Preact, since the component's import of it becomes part of that Application's build. The CodeMirror editor ([`apps/codemirror-editor`](charmiq://../../apps/codemirror-editor/manifest.json)) mounts the whole `shared/` folder at `/shared` and imports `/shared/ays-dialog/ays-dialog` for its close-tab confirmation.

## The files

| File | Role |
|------|------|
| [`manifest.json`](charmiq://./manifest.json) | declares the script entry, `output: "script"`, ESM format, and the Preact import map |
| [`ays-dialog.tsx`](charmiq://./ays-dialog.tsx) | the Web Component — lifecycle, attributes, shadow DOM, JSX template |
| [`ays-dialog.scss`](charmiq://./ays-dialog.scss) | component shadow DOM styles — proper SCSS, imported as compiled CSS text |
| [`demo/`](charmiq://./demo/manifest.json) | the demo above: an Application that mounts this folder and imports the component |

## How the JSX factory works

The import map in [`manifest.json`](charmiq://./manifest.json) maps `preact` to `esm.sh`:

```json pK8mR3nQwB
"output": "script",
"format": "esm",
"dependencies": {
  "importMap": {
    "preact": "https://esm.sh/preact@11.0.0"
  }
}
```

Each `.tsx` file starts with:

```tsx uK8mP3rBnQ
/** @jsx h */
import { h } from 'preact';
```

The `/** @jsx h */` pragma tells the TypeScript compiler to route all JSX through Preact's `h()` function. The result is real DOM elements — `<div className="overlay">` compiles to `h('div', { className: 'overlay' })`, which Preact turns into a real `HTMLDivElement`.

Why Preact and not React? Same JSX contract, 3KB instead of 40KB, and it gives us `h()`, `render()`, hooks (`useState`, `useEffect`, `useRef`) — the full toolkit for future shared components without switching libraries.

## How the styles work

The component's styles live in [`ays-dialog.scss`](charmiq://./ays-dialog.scss) — a standalone SCSS file with variables, nesting, and `:host` selectors:

```scss rP8mK3nBvQ
:host([type="warning"]) {
  --ays-icon-color: #f59e0b;
  --ays-primary-bg: #f59e0b;
  --ays-primary-bg-hover: #d97706;
}

.overlay {
  position: fixed;
  inset: 0;
  // ...
  &.show { display: flex; }
  &.visible { opacity: 1; }
}
```

The component imports the stylesheet as text and puts it in its shadow root:

```tsx kM7nP2rQwB
import componentStyles from './ays-dialog.scss';
// in the template:
<style>{componentStyles}</style>
```

The pipeline compiles SCSS → CSS as it builds, and the CSS text travels inside the script: no separate stylesheet request. The shadow DOM boundary guarantees these styles can't leak out and page styles can't leak in.

---

## API Reference

### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | `'warning' \| 'info' \| 'error'` | `'warning'` | sets the color scheme and icon color |
| `primary-text` | `string` | `'Continue'` | label for the confirm button |
| `cancel-text` | `string` | — | label for the cancel button; omit to hide it |
| `open` | boolean attribute | — | set to show the dialog; remove to hide |

### Methods

| Method | Description |
|--------|-------------|
| `show()` | show the dialog with a fade+scale animation |
| `hide()` | hide the dialog |
| `confirm()` | programmatically confirm — fires `ays-confirmed` and hides |
| `cancel()` | programmatically cancel — fires `ays-cancelled` and hides |

### Events

| Event | Detail | When |
|-------|--------|------|
| `ays-confirmed` | `{ type: string }` | user clicks the confirm button or `confirm()` is called |
| `ays-cancelled` | `{ type: string }` | user clicks cancel, clicks the backdrop, presses Escape, or `cancel()` is called |

Both events have `bubbles: true` and `composed: true` (they cross the shadow DOM boundary).

### Slots

| Slot | Purpose | Default |
|------|---------|---------|
| `icon` | a leading icon (sized automatically) | none |
| `title` | the dialog title | "Are you sure?" |
| `message` | the dialog message body | "Please confirm this action." |

### CSS Custom Properties

All visual properties are exposed for theming. Set these on the `<ays-dialog>` element or a parent:

| Property | Default | Description |
|----------|---------|-------------|
| `--ays-overlay-bg` | `rgba(0,0,0,0.5)` | backdrop color |
| `--ays-dialog-bg` | `white` | dialog background |
| `--ays-dialog-radius` | `12px` | dialog border radius |
| `--ays-dialog-shadow` | `0 8px 32px rgba(0,0,0,0.2)` | dialog box shadow |
| `--ays-dialog-padding` | `24px` | dialog padding |
| `--ays-dialog-max-width` | `480px` | dialog max width |
| `--ays-title-size` | `1.25rem` | title font size |
| `--ays-title-color` | `#1f2937` | title color |
| `--ays-message-color` | `#6b7280` | message color |
| `--ays-primary-bg` | varies by type | confirm button background |
| `--ays-primary-bg-hover` | varies by type | confirm button hover |
| `--ays-button-radius` | `6px` | button border radius |
| `--ays-transition-duration` | `200ms` | animation duration |

### CSS Parts

For deeper styling, the component exposes [`::part()`](https://developer.mozilla.org/en-US/docs/Web/CSS/::part) targets:

`overlay` · `dialog` · `header` · `icon` · `title` · `message` · `actions` · `confirm-button` · `cancel-button`

### Usage

```html xP7mK2rQnB
<ays-dialog type="warning" primary-text="Delete" cancel-text="Cancel">
  <svg slot="icon" ...>...</svg>
  <span slot="title">Delete Project?</span>
  <span slot="message">This will permanently delete the project.</span>
</ays-dialog>

<script>
  const dialog = document.querySelector('ays-dialog');
  dialog.show();
  dialog.addEventListener('ays-confirmed', () => { /* proceed */ });
  dialog.addEventListener('ays-cancelled', () => { /* abort */ });
</script>
```
