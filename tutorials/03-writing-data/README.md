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
| [`App.tsx`](charmiq://./App.tsx) | Added a `<textarea>`, writes back via `appContent.set()`, added state comparison to avoid redundant re-renders |
| [`styles.scss`](charmiq://./styles.scss) | Replaced `.content` display with `.editor` textarea styling |
| [`index.html`](charmiq://./index.html) | Unchanged |
| [`main.tsx`](charmiq://./main.tsx) | Unchanged |
| [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## Writing with `set()`

The simplest way to write: replace the entire content.

```tsx xR7mK2pQnB
const handleChange = async (e) => {
  const newContent = e.target.value;
  contentRef.current = newContent;
  setContent(newContent);

  await window.charmiq.appContent.set(newContent);
};
```

`set()` replaces everything in the `app-content` block. Simple, correct, easy to reason about. For a textarea that holds the full content, this is all you need.

## Avoiding redundant re-renders

This is the central pattern this tutorial introduces. When the Application writes to `appContent`, the change comes back through `onChange$()`. Without handling it, every keystroke would trigger a redundant re-render — the app writes, the document echoes, the subscription fires, React re-renders to the value it already has.

The solution is **state comparison**: check whether what arrived is different from what the component already holds.

```tsx bN4fPm8kWs
const [content, setContent] = useState('');
const contentRef = useRef(content);

// Incoming changes from the document
const sub = window.charmiq.appContent.onChange$().subscribe(change => {
  if(change.deleted) return;

  if(change.content === contentRef.current) return; // ← already matches
  contentRef.current = change.content;
  setContent(change.content);
});

// Outgoing changes to the document
const handleChange = async (e) => {
  const newContent = e.target.value;
  contentRef.current = newContent;              // ← update ref first
  setContent(newContent);

  await window.charmiq.appContent.set(newContent);
};
```

### How it works

1. User types → `handleChange` fires → updates `contentRef` and calls `set()`
2. `set()` writes to the document → document emits a change → `onChange$` fires
3. The subscription compares `change.content` to `contentRef.current` → they match → no re-render
4. Meanwhile, if another user edits the content, `change.content` won't match → it flows through → the component re-renders with the merged result

### Why state comparison, not a flag?

It's tempting to use a boolean flag — "I'm writing, so skip the next incoming change." That's wrong in a collaborative system. When a `set()` is in-flight and another user edits concurrently, OT merges both changes. The value that comes back through `onChange$()` may contain *their* edit folded into *yours*. A flag would suppress it, silently dropping the other user's work.

State comparison doesn't care about causality. It asks one question: "does the component already reflect this content?" If yes, skip. If no, update. It doesn't matter who wrote it or when.

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

**The ref tracks current content, not a boolean flag.** `contentRef` holds the most recent content string — updated both on local edits and on incoming changes. The subscription compares against it to decide whether a re-render is needed. This is a `useRef` (not `useState`) because the comparison needs the latest value inside the subscription closure without triggering extra renders.

**`set()` is async.** It returns a Promise that resolves when the write is persisted to the document. The comparison still works — `contentRef` is updated synchronously before the `set()` call, so by the time the echo arrives, the ref already reflects the value.

**The manifest didn't change.** The `runtime.appContent` declaration from tutorial 02 is the same. Reading and writing use the same manifest — it's the code that decides the direction.

## Next steps

The content you're writing persists in the document — but what about app-level preferences like theme or display mode? Those don't belong in `appContent`. Next, we introduce `appState`: per-widget configuration that survives reloads.

→ [**Persistent State**](charmiq://../04-persistent-state/README.md)
