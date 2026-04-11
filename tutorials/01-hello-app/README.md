# Hello, Application

*A working React + SCSS Application in six files — nothing more than the wiring requires.*

<p style="text-align: center;">
  <iframe-app height="250px" src="charmiq://.">
    <app-source>
    </app-source>
  </iframe-app>
</p>

The Application above is live. Click the button. That's local React state — no CharmIQ APIs involved yet. This page walks through every file and explains why it's there.

## How it's wired

CharmIQ Applications run inside a sandboxed iframe. You give CharmIQ a manifest and it handles the rest: compiling your TypeScript, processing your SCSS, mounting the iframe in the document.

The module format here is **ESM** — ECMAScript modules, loaded directly in the browser without a bundler. React resolves at runtime via an import map pointing to `esm.sh`. No build step. No `node_modules`.

## The files
| File | Role |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Declares entry points, module format, and the import map |
| [`index.html`](charmiq://./index.html) | The HTML shell — just a `<div id="root">` |
| [`main.tsx`](charmiq://./main.tsx) | Entry point — mounts React into `#root` |
| [`App.tsx`](charmiq://./App.tsx) | The component — a counter with local state |
| [`styles.scss`](charmiq://./styles.scss) | Main styles — imports the variables partial |
| [`_variables.scss`](charmiq://./_variables.scss) | Design tokens — colors, spacing, typography |

## What to pay attention to

**`manifest.json` — the contract**

The `bundle.entry` block tells CharmIQ which files are the roots. The `importMap` tells the browser where to find React. That's it — no webpack config, no `tsconfig`.

**`main.tsx` — the mount**

```tsx V4t1rDWObP
const container = document.getElementById('root');
if(container) {
  createRoot(container).render(<App />);
} else console.error('Root container not found.');
```

If `index.html` doesn't have `<div id="root">`, this fails gracefully instead of silently. Worth keeping that pattern.

**SCSS partials**

`styles.scss` imports `_variables.scss` with:

```scss 6koPnS4opm
@import 'variables';
```

No underscore. No extension. Standard SCSS partial resolution — the underscore in the filename is SCSS's signal that it's a partial, not a standalone file.

## Next steps

This Application is self-contained — it holds its own state and doesn't talk to the document. The next example introduces `appContent`: how your Application reads data that lives in the document itself.

→ [**Reading Data**](charmiq://../02-reading-data/README.md)