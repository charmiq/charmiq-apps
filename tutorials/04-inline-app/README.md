# The Inline Application

*No folder. No files. No manifest — the whole Application lives in this document.*

<p style="text-align: center;">
  <iframe-app height="280px">
    <app-source>
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: #f7f7f4; color: #1a1a18; text-align: center; padding: 20px; -webkit-font-smoothing: antialiased; }
  h1 { letter-spacing: -0.02em; }
  p { color: rgba(26, 26, 24, 0.6); }
  button { background: #d94a00; color: white; padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px; }
  button:hover { background: #b83e00; }
  .error { color: #b00020; font-size: 13px; min-height: 1.2em; overflow-wrap: break-word; }
</style>
</head>
<body>
  <h1>Inline</h1>
  <p>One button. One platform Command. Zero files.</p>
  <button id="celebrate">Celebrate 🎉</button>
  <p class="error" id="error"></p>
  <script>
    const error = document.getElementById('error');
    document.getElementById('celebrate').addEventListener('click', async () => {
      error.textContent = '';
      try {
        const commandService = await window.charmiq.discover('charmiq.service.command');
        await commandService.execute({ id: 'notification.toast.emit', args: { status: 'success', title: 'Hello from an inline Application!' } });
      } catch(err) {
        error.textContent = String((err && err.message) || err);
      }
    });
  </script>
</body>
</html>
    </app-source>
  </iframe-app>
</p>

The Application above is live — and its entire source sits inside the `app-source` block of this very page. No folder, no Source documents, no build wiring. This is the inline form: a complete HTML document, dropped straight into the page.

## What changed from Writing Data

| Tutorial 03 | Here |
|----|----|
| Six files in a folder | One HTML document inside `app-source` |
| `manifest.json` declares entries and scopes | **No manifest — and that matters. Read on.** |
| TypeScript + SCSS, built on demand | Plain HTML, CSS, and JavaScript, as written |
| React via import map | No dependencies at all |

## How it's wired

CharmIQ mounts the `app-source` HTML in the same sandboxed iframe every Application gets, and injects the same bridge — `window.charmiq`. Inline changes *how the source gets there*, not what the Application is. The `app-source` block holds a **complete HTML document**: doctype, head, styles, script.

## The button

The click handler does two things:

```js
const commandService = await window.charmiq.discover('charmiq.service.command');
await commandService.execute({ id: 'notification.toast.emit', args: { status: 'success', title: '…' } });
```

`discover('charmiq.service.*')` resolves locally — asking for a service proxy needs no permission. The `execute` is different: it asks the **platform** to run a Command on your behalf. That crossing is governed by a scope — this one is `command.notification.toast.emit`.

## The catch: no manifest, so every capability asks separately

Click the button. Before the toast appears, CharmIQ asks for your consent — one dialog, for this one capability. Allow it and the toast fires; your decision is remembered (see it under **Settings → Permissions**), so the next click runs without asking.

That dialog-per-capability is the cost of having no manifest. Every capability an Application uses is a scope, and an Application with no manifest has nowhere to *declare* its scopes — so it falls back to asking for each one, the first time it comes up. An Application that needs five capabilities interrupts you five times.

The folder tutorials never do that: [`requestedScopes`](charmiq://../02-reading-data/manifest.json) declares the full set up front, so the user sees **one** dialog covering everything the Application will ever ask for — and anything *outside* the declaration is denied outright, which is a promise the Application makes to its users. Declaring is both the better experience and the stronger contract.

The inline form trades that away for zero setup. For one button it hardly matters; the moment your Application grows a second or third capability, the manifest is how you grow up — and it is also the door to [signing](charmiq://../../demos/shader-demo/README.md), which only exists for Applications with a manifest.

## What to pay attention to

**The full-document requirement** — `app-source` carries a whole HTML document, not a fragment. The bridge injects into it like any other Application.

**`discover` vs `execute`** — resolving a service proxy is local and free; invoking through it is a platform crossing and is gated.

**Consent is per scope, per Application, per document** — an inline Application's grants are anchored to the document that hosts it. Copy this Application into another document and it asks again there.

**The drip is the incentive** — one capability, one ask is tolerable; five capabilities, five asks is the nudge toward a manifest and its single batched dialog.
