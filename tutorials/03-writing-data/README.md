# Writing Data

*Your Application now writes to the document — as one writer among many.*

<p style="text-align: center;">
  <iframe-app height="300px" src="charmiq://.">
    <app-source>
    </app-source>
    <app-content>Milk
Eggs
Bread
</app-content>
  </iframe-app>
</p>

Add and remove items above. Each item is one line of the document's `app-content`. Open this document in a second tab and change the list in both at once: every item either lands whole or is refused with a message, and nothing lands on the wrong line.

## What changed from Reading Data

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Unchanged (still declares `runtime.appContent`) |
| [`App.tsx`](charmiq://./App.tsx) | Shows the app-content's lines as a list, and adds or removes a line through the app-content |
| [`styles.scss`](charmiq://./styles.scss) | Replaced `.content` display with the form and list |
| [`index.html`](charmiq://./index.html) | Unchanged |
| [`main.tsx`](charmiq://./main.tsx) | Unchanged |
| [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## You are never the only writer

Another tab, another user, a Charm or another Application can change this app-content at the same moment you do. The app-content you were given by `content$()` handles that for you: every write is **measured on the app-content you call it on**. If it has changed since, the write is refused whole and nothing is written, so your edit never lands on a line it wasn't meant for (the full guide: [Collaborating](https://team.charmiq.ai/docs/application/developer-app-content-and-app-state#collaborating)).

## Writing lines

Each item is one line of the app-content (`content.lines`). The app-content writes them for you:

```tsx qP3mN7rKvX
await content.appendLine(item);   // adds a line after the last
await content.removeLine(index);  // removes the line at index, with its line break
```

- **`appendLine`** — adds the line, putting a line break first if the last line has none, so it never joins it. If another writer got there first, it is measured again on the new text and sent again on its own: adding a line never depends on what the list held.
- **`removeLine`** — removing *this* line was the user's choice about what they saw. If the list changed since, it rejects with `code` `app/content-conflict`, writing nothing: show the list again and let them choose.

Whole lines are what make concurrent writes merge cleanly: two people adding at once both get their item, and two removals of the same line remove it once.

## Showing what the app-content holds

```tsx Rk9vPq2mXw
useEffect(() => {
  const sub = appContent.content$().subscribe({ next: setContent, error: setFailure });
  return () => sub.unsubscribe();
}, []);
```

The list shows the app-content, never what this Application last wrote: its own writes come back through `content$()` like anyone's, merged with whatever others did meanwhile. Each row removes through the app-content it was shown from (`removeItem(content, index)`), so a click acts on exactly what the user saw.

`set()` would write the whole list instead. If someone else changed it at the same moment, your whole list would replace theirs.

## What to pay attention to

**The guard is narrow.** It promises that a write never lands on text it wasn't measured on. It is not a lock. A resolved write means the editor applied your edit, and the document then shares it as it shares any edit.

**Duplicates are separate lines.** Each list item is its line's position, so two identical lines are two items, each removable on its own.

**The manifest didn't change.** The `runtime.appContent` declaration from tutorial 02 is the same. Reading and writing use the same manifest: the code decides the direction.

## Next steps

So far the Application lives in its own folder with a manifest. Next, the whole Application lives inside the document itself.

→ [**The Inline Application**](charmiq://../04-inline-app/README.md)
