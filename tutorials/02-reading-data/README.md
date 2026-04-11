# Reading Data

*Your Application now reads content from the document — not from its own state.*

<p style="text-align: center;">
  <iframe-app height="200px" src="charmiq://.">
    <app-source>
    </app-source>
    <app-content>Hello from the document!</app-content>
  </iframe-app>
</p>

The text above lives in the document, not in the Application. Edit the `app-content` block and watch the Application update in real time. That's the core idea: **the document is the source of truth**.

## What changed from Hello App

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Added `runtime.appContent` — declares the content this app reads |
| [`App.tsx`](charmiq://./App.tsx) | Replaced the counter with a `window.charmiq.appContent.onChange$()` subscription |
| [`styles.scss`](charmiq://./styles.scss) | Styled the content display area |
| [`index.html`](charmiq://./index.html) | Unchanged |
| [`main.tsx`](charmiq://./main.tsx) | Unchanged |
| [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## The manifest — declaring `appContent`

```json dVm8rQpK1x
{
  "runtime": {
    "appContent": {
      "message": { "type": "text", "description": "Message to display" }
    }
  }
}
```

The `runtime.appContent` block tells CharmIQ that this Application expects content from the document. The key (`"message"`) names the field, `"type": "text"` declares it as plain text.

## The subscription — `onChange$()`

This is the new code in `App.tsx`:

```tsx 9fKp2mRtNw
const [content, setContent] = useState('');

useEffect(() => {
  const sub = window.charmiq.appContent.onChange$().subscribe(change => {
    if(!change.deleted) setContent(change.content);
  });
  return () => sub.unsubscribe();
}, []);
```

### What's happening

1. **`window.charmiq`** — the global CharmIQ SDK, injected into every Application iframe automatically. You don't import it.

2. **`appContent.onChange$()`** — returns an RxJS Observable. It fires immediately with the current content, then again every time the content changes (by you, by a collaborator, by a Charm).

3. **The `change` object** has this shape:
   ```ts
   {
     id: string;       // unique identifier for this app-content block
     content: string;  // the current text
     deleted?: boolean; // true if the block was removed
   }
   ```

4. **`if(!change.deleted)`** — guard against the block being removed from the document. If someone deletes the `app-content` node, you get one last emission with `deleted: true`.

5. **`return () => sub.unsubscribe()`** — standard React cleanup. When the component unmounts, stop listening.

## What to pay attention to

**The app doesn't own the data.** In Hello App, the counter was local React state — it reset on every reload. Here, the content persists in the document. Reload the page and it's still there.

**`onChange$` fires immediately.** You don't need a separate "load" call. Subscribe once and you get the current value plus all future changes. This is a reactive pattern — no polling.

**This is read-only.** The app displays content but doesn't write it. Editing happens outside the app (directly in the document, or via a Charm). The next tutorial adds writing.

## Next steps

This Application can read but not write. Next, we make it interactive — the app writes content back to the document.

→ **Writing Data**
