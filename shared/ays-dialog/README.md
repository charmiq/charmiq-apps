# AYS Dialog

*A customizable "Are You Sure" confirmation dialog — built as a Web Component with TSX, SCSS, and zero frameworks.*

<iframe-app data-sandboxed="true" height="280px" width="100%">
  <app-source>
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; background: #f9fafb; }
    .controls { display: flex; gap: 12px; margin-bottom: 16px; }
    .btn { padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; color: white; transition: transform 0.15s; }
    .btn:hover { transform: translateY(-1px); }
    .btn.warning { background: #f59e0b; }
    .btn.error { background: #dc2626; }
    .btn.info { background: #3b82f6; }
    .log { padding: 12px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; font-family: monospace; font-size: 13px; color: #6b7280; }
    .log .entry { padding: 2px 0; }
    .log .confirmed { color: #059669; }
    .log .cancelled { color: #dc2626; }
  </style>
  <script src="charmiq://."></script>
</head>
<body>
  <div class="controls">
    <button class="btn warning" onclick="document.getElementById('w').show()">Warning</button>
    <button class="btn error" onclick="document.getElementById('e').show()">Error</button>
    <button class="btn info" onclick="document.getElementById('i').show()">Info (no cancel)</button>
  </div>
  <div class="log" id="log">click a button above</div>

  <ays-dialog id="w" type="warning" primary-text="Delete" cancel-text="Cancel">
    <svg slot="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
    <span slot="title">Delete Project?</span>
    <span slot="message">This will permanently delete the project and all its contents. This action cannot be undone.</span>
  </ays-dialog>

  <ays-dialog id="e" type="error" primary-text="Force Delete" cancel-text="Go Back">
    <svg slot="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
    <span slot="title">This Cannot Be Undone</span>
    <span slot="message">All data associated with this resource will be permanently destroyed. There is no recovery path.</span>
  </ays-dialog>

  <ays-dialog id="i" type="info" primary-text="Got It">
    <svg slot="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
    <span slot="title">Update Available</span>
    <span slot="message">A new version is available. The page will reload to apply the update.</span>
  </ays-dialog>

  <script>
    const log = document.getElementById('log');
    let n = 0;
    const entry = (type, action) => {
      if(n === 0) log.textContent = '';
      n++;
      const d = document.createElement('div');
      d.className = 'entry ' + action;
      d.textContent = '[' + n + '] ' + type + ' → ' + action;
      log.insertBefore(d, log.firstChild);
    };
    document.addEventListener('ays-confirmed', e => entry(e.detail.type, 'confirmed'));
    document.addEventListener('ays-cancelled', e => entry(e.detail.type, 'cancelled'));
  </script>
</body>
</html>
  </app-source>
</iframe-app>

Click the buttons above. Each triggers a different dialog type — warning, error, info. The event log shows which CustomEvent fired. That's the full component running live.

## What this demonstrates

This is a Web Component built with:

- **TSX without React.** JSX is syntactic sugar for function calls. The compiler sees `<div class="foo">` and emits `h('div', { class: 'foo' })`. Here, `h()` comes from [Preact](https://preactjs.com) — a 3KB library that provides the same `createElement` as React. Preact loads at runtime via the import map. No React, no virtual DOM diffing overhead for this use case — just a battle-tested DOM factory.

- **SCSS in a separate file.** The component's styles live in [`ays-dialog.scss`](charmiq://./ays-dialog.scss), not in a JavaScript string. Real SCSS with variables, nesting, `:host` selectors — and real syntax highlighting in the editor. The pipeline compiles it to CSS; the component loads it into its shadow root via a `<link>`.

- **The pipeline handles everything.** TypeScript compilation, JSX transformation, SCSS compilation — all from a manifest and source files. No bundler config, no build step, no `node_modules`.

- **No indirection.** The manifest points `script` directly at [`ays-dialog.tsx`](charmiq://./ays-dialog.tsx) — no intermediary `main.tsx` that just re-exports. The component registers itself. The `<iframe-app>` fixtures above load it with `<script src="charmiq://."></script>`, which the platform resolves to the compiled entry point.

## The files

| File | Role |
|------|------|
| [`manifest.json`](charmiq://./manifest.json) | declares entry points, ESM format, and the Preact import map |
| [`ays-dialog.tsx`](charmiq://./ays-dialog.tsx) | the Web Component — lifecycle, attributes, shadow DOM, JSX template |
| [`ays-dialog.scss`](charmiq://./ays-dialog.scss) | component shadow DOM styles — proper SCSS, loaded via `<link>` |
| [`index.html`](charmiq://./index.html) | HTML shell |

## How the JSX factory works

The import map in [`manifest.json`](charmiq://./manifest.json) maps `preact` to `esm.sh`:

```json pK8mR3nQwB
"importMap": {
  "preact": "https://esm.sh/preact@10.24.3"
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

The component loads these into its shadow root via a `<link>` element:

```tsx kM7nP2rQwB
const styleHref = new URL('./ays-dialog.scss', import.meta.url).href;
// in render():
shadow.appendChild(<link rel="stylesheet" href={styleHref} />);
```

The pipeline compiles SCSS → CSS when the browser requests the file. The shadow DOM boundary guarantees these styles can't leak out and page styles can't leak in.

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
