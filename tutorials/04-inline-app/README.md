# The Inline Application

*No folder. No files. No manifest — the whole Application lives in this document.*

<p style="text-align: center;">
  <iframe-app height="220px">
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

## The catch: no manifest, nothing declared

Click the button. It fails:

```
denied by the consent gate — scope 'command.notification.toast.emit' is not declared in the manifest's requestedScopes
```

Every capability an Application uses is a scope, and an Application must **declare** its scopes before it may even ask you for them — that is what [`requestedScopes`](charmiq://../02-reading-data/manifest.json) does in the folder tutorials, and it is what powers the one-dialog consent you see when a declared Application first runs. An Application that declares nothing cannot use any gated capability: not Commands, not services, not `charmiq.fetch`, not Application-to-Application calls.

The inline form has no manifest, so it has nowhere to declare anything. What an inline Application *can* do today is everything that never leaves the sandbox: markup, styles, local state — Tutorial 01's counter would run here unchanged.

## What to pay attention to

**The full-document requirement** — `app-source` carries a whole HTML document, not a fragment. The bridge injects into it like any other Application.

**`discover` vs `execute`** — resolving a service proxy is local and free; invoking through it is a platform crossing and is gated.

**The denial names the fix** — the error tells you exactly which scope was missing. For a folder Application the fix is one line in `requestedScopes`; for an inline Application, there is no line to write — yet.
