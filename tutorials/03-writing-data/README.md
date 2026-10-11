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

Add and remove items above. Each item is one line of the document's `app-content` block. Open this document in a second tab and change the list in both at once: every item either lands whole or is refused with a message, and nothing lands on the wrong line.

## What changed from Reading Data

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Unchanged (still declares `runtime.appContent`) |
| [`records.ts`](charmiq://./records.ts) | New: reads the block as records (one per line), makes the edits that add or remove one, and writes them guarded |
| [`App.tsx`](charmiq://./App.tsx) | Shows the block's records as a list, and adds or removes whole records |
| [`styles.scss`](charmiq://./styles.scss) | Replaced `.content` display with the form and list |
| [`index.html`](charmiq://./index.html) | Unchanged |
| [`main.tsx`](charmiq://./main.tsx) | Unchanged |
| [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## You are never the only writer

Another tab, another user, a Charm or another Application can change this block at the same moment you do. Three rules keep everyone's work (the full guide: [Collaborating](https://team.charmiq.ai/docs/application/developer-app-content-and-app-state#collaborating)):

1. **The block is the truth.** Show what `onChange$()` delivers, never what you last wrote.
2. **Write records, not the whole block.** One record per line; add or remove whole lines with `applyChanges()`, guarded by the snapshot you measured them on.
3. **Your own writes come back.** Treat them like any change.

## Records

A record is one line. [`records.ts`](charmiq://./records.ts) reads the block into records, each remembering its span, and makes the edits that change one:

```tsx qP3mN7rKvX
export const records = (text) => {
  const found = [];
  let from = 0;
  for(const line of text.split('\n')) {
    const to = Math.min(from + line.length + 1, text.length);
    if(line) found.push({ line, from, to });
    from += line.length + 1;
  }
  return found;
};

export const add = (text, line) => ({ from: text.length, to: text.length, insert: ((text && !text.endsWith('\n')) ? '\n' : '') + line + '\n' });
export const remove = record => ({ from: record.from, to: record.to });
```

Whole lines are what make concurrent writes merge cleanly: two people adding at once both get their item, and two removals of the same line remove it once.

## Guarded writes

A span is only true of the text it was measured on. Between your read and your write, someone else may have added a line above it, or removed it. Every change `onChange$()` delivers carries the block's `revision`, and `records.ts` sends it with the edit. The edit applies only while the block is still exactly what you measured, and otherwise is refused whole, with nothing written:

```tsx BmzkASeomr
export const write = async (appContent, snapshot, changes) => {
  if(!canGuard(appContent) || !snapshot) throw new Error('This page cannot make safe edits. Reload it.');
  await appContent.applyChanges(changes, `[id='${snapshot.id}']`, { id: snapshot.id, revision: snapshot.revision });
};

export const append = async (appContent, snapshot, line) => {
  let current = snapshot;
  for(let attempt = 1; ; attempt++) {
    try {
      return await write(appContent, current, [add(current?.content ?? '', line)]);
    } catch(error) {
      if(!isConflict(error) || (attempt >= 3)) throw error;
      current = await reread(appContent, current); // ← the same block, as it is now
      if(!current) throw error;
    }
  }
};
```

A refusal has the code `app/content-conflict`. What to do next depends on what the user meant:

- **An append** still means "add this to the end", so `append` measures it again on the block's latest text (read by its id with `snapshot()`, never `[0]`, which may now be a different block) and tries again.
- **A removal** meant "remove the line I saw", and that line may have moved or gone. The list shows the change that refused it, and the user decides again.

**Check support first.** A page opened before guarded edits existed has no `snapshot()`, and its changes carry no `revision`. `canGuard` checks that, and the list then shows read-only and asks for a reload. It never falls back to an unguarded write.

## Showing what the block holds

The subscription is the only way the list changes. It fires immediately with the current value, then on every change, including this Application's own writes as they come back:

```tsx bN4fPm8kWs
const sub = appContent.onChange$(BLOCK).subscribe({
  next: change => {
    if(change.deleted) return;
    setView({ kind: 'shown', snapshot: snapshotOf(change), records: records(change.content) });
  },
  error: failure => setView(unreadable(failure)),
});

// a block that does not exist sends no change: ask whether there is one
appContent.snapshot?.(BLOCK).then(
  current => { if(!current) setView(shown => (shown.kind === 'waiting') ? { kind: 'missing' } : shown); },
  failure => setView(shown => (shown.kind === 'waiting') ? unreadable(failure) : shown)
);
```

Every change replaces what is shown, along with its snapshot: even a change that leaves the text equal brings a new revision. Never skip one with an "I'm writing" flag. Your own write comes back merged with anyone else's, so whatever arrives is what to show.

**Say why nothing shows.** The list is waiting, shown, missing from the document, or unreadable, and each says so. A read the Application isn't allowed is not a missing list.

## Writing records

Each row removes itself with the snapshot it was rendered from, never a newer one:

```tsx xR7mK2pQnB
{view.records.map(record => (
  <li key={record.from}>
    <span>{record.line}</span>
    <button onClick={() => removeItem(view.snapshot, record)}>Remove</button>
  </li>
))}
```

```tsx FFh6Qa4v8l
const removeItem = async (snapshot, record) => {
  try {
    await write(appContent, snapshot, [remove(record)]);
  } catch(failure) {
    setError(isConflict(failure) ? `The list changed, so "${record.line}" was not removed. Check it and try again.` : `"${record.line}" was not removed. Try again.`);
    if(isConflict(failure)) await confirmBlock(snapshot);
  }
};
```

Neither handler touches the list: it changes when the block does. Clicking Remove twice is safe. The first removal gives the block a new revision, so the second is refused instead of deleting whatever moved into the span.

**A removed block sends no change.** A deletion notice is bookkeeping, not proof the list is gone, so after a refusal the list asks: `snapshot()` by the block's id returns `null` only when it really is gone. The list then says so and stops editing:

```tsx 3IJkZW5yVi
const confirmBlock = async (snapshot) => {
  const current = await reread(appContent, snapshot).catch(() => undefined);
  if(current !== null) return;
  // only while the list still shows that block: another may have taken its place
  setView(shown => ((shown.kind === 'shown') && (shown.snapshot?.id === snapshot.id)) ? { kind: 'missing' } : shown);
};
```

`set()` would write the whole list instead. If someone else changed it at the same moment, your whole list would replace theirs.

## What to pay attention to

**The guard is narrow.** It promises that your positions never land on text they weren't measured on. It is not a lock. A resolved write means the editor applied your edit, and the document then shares it as it shares any edit.

**Duplicates are separate records.** Each list item is keyed by its position, so two identical lines are two items, each removable on its own.

**The manifest didn't change.** The `runtime.appContent` declaration from tutorial 02 is the same. Reading and writing use the same manifest: the code decides the direction.

## Next steps

So far the Application lives in its own folder with a manifest. Next, the whole Application lives inside the document itself.

→ [**The Inline Application**](charmiq://../04-inline-app/README.md)
