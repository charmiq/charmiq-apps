# Writing Data

*Your Application now writes content back to the document — not just reads it.*

<p style="text-align: center;">
  <iframe-app height="250px" src="charmiq://.">
    <app-source>
    </app-source>
    <app-content>Edit me!</app-content>
  </iframe-app>
</p>

Type in the textarea above. The text you type is written to the document's `app-content` block in real time. Open this document in a second tab — edits appear in both.

## What changed from Reading Data

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Unchanged (still declares `runtime.appContent`) |
| [`App.tsx`](charmiq://./App.tsx) | Added a `<textarea>`, writes back via `appContent.set()`, added the update guard |
| [`styles.scss`](charmiq://./styles.scss) | Replaced `.content` display with `.editor` textarea styling |
| [`index.html`](charmiq://./index.html) | Unchanged |
| [`main.tsx`](charmiq://./main.tsx) | Unchanged |
| [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## Writing with `set()`

The simplest way to write: replace the entire content.

```tsx xR7mK2pQnB
const handleChange = async (e) => {
  const newContent = e.target.value;
  setContent(newContent);

  updatingRef.current = true;
  await window.charmiq.appContent.set(newContent);
  updatingRef.current = false;
};
```

`set()` replaces everything in the `app-content` block. Simple, correct, easy to reason about. For a textarea that holds the full content, this is all you need.

## The update guard

This is the critical pattern this tutorial introduces:

```tsx bN4fPm8kWs
const updatingRef = useRef(false);

// Incoming changes from the document
const sub = window.charmiq.appContent.onChange$().subscribe(change => {
  if(updatingRef.current) return; // ← skip our own writes
  if(!change.deleted) setContent(change.content);
});

// Outgoing changes to the document
const handleChange = async (e) => {
  setContent(e.target.value);

  updatingRef.current = true;                   // ← flag on
  await window.charmiq.appContent.set(newContent);
  updatingRef.current = false;                  // ← flag off
};
```

### Why is this needed?

Without the guard, every `set()` call triggers `onChange$`, which calls `setContent`, which re-renders the textarea, which could trigger another write. The guard breaks the loop:

1. User types → `handleChange` fires → sets `updatingRef.current = true` → calls `set()`
2. `set()` writes to the document → document emits a change → `onChange$` fires
3. The subscription sees `updatingRef.current === true` → skips → no re-render from our own write
4. `set()` resolves → sets `updatingRef.current = false`

Other users' edits arrive with `updatingRef.current === false`, so they flow through normally.

## When to use `applyChanges()` instead

`set()` replaces *everything*. For a simple textarea, that's fine. But if you're building a code editor or a rich text tool where two users might edit different parts simultaneously, `applyChanges()` sends only the delta:

```tsx qP3mN7rKvX
window.charmiq.appContent.applyChanges([
  { from: 5, to: 10, insert: 'world' }
]);
```

Each change specifies a `from` position, a `to` position, and the text to `insert`. This is **OT-safe** — CharmIQ applies operational transforms so concurrent edits from different users merge correctly.

For this tutorial we use `set()` to keep things simple. A real collaborative editor would use `applyChanges()`.

## What to pay attention to

**The guard is a `useRef`, not state.** `useRef` gives you a mutable `.current` that persists across renders without triggering re-renders — exactly right for a synchronization flag. Never use a module-level variable for this (it would be shared across component instances) or `useState` (it would cause unnecessary re-renders).

**`set()` is async.** It returns a Promise that resolves when the write is persisted to the document. The guard wraps the entire async operation.

**The manifest didn't change.** The `runtime.appContent` declaration from tutorial 02 is the same. Reading and writing use the same manifest — it's the code that decides the direction.

## Next steps

The content you're writing persists in the document — but what about app-level preferences like theme or display mode? Those don't belong in `appContent`. Next, we introduce `appState`: per-widget configuration that survives reloads.

→ [**Persistent State**](charmiq://../04-persistent-state/README.md)
