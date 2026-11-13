# Punch List

*Two people, one document, one list: what each of you sees, and what is new to you.*

<p style="text-align: center;">
  <iframe-app height="420px" src="charmiq://.">
    <app-source>
    </app-source>
  </iframe-app>
</p>

Add a job above, then share this document with someone as an Editor. Each of you adds and checks off jobs; each job carries the name of whoever added it, and **N new** counts the jobs the *other* person added since you last looked. Tap it to mark them seen.

## What changed from Writing Data

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Declares `user.read`; no `runtime.appContent` (the list's app-content is created by name) |
| [`jobs.ts`](charmiq://./jobs.ts) | New: the jobs as JSON records, one per line, each change made by id to the list as it stands |
| [`App.tsx`](charmiq://./App.tsx) | Shows the jobs; who is looking (`user$`); each person's place in app-state |
| [`styles.scss`](charmiq://./styles.scss) | A header with the **new** count; done jobs struck through |
| [`index.html`](charmiq://./index.html) | A phone-sized viewport |
| [`main.tsx`](charmiq://./main.tsx) | Unchanged |
| [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## One record per line

Every job is one line of the app-content named `punch-list`, a JSON record with an `id`:

```json
{"k":"job","id":"k2x9q1a","text":"Fix the gate latch","by":"<User id>","name":"Ana","done":false,"ts":1762800000000}
```

Two people checking off two different jobs at once change two different lines, and the document keeps both. A job never holds anything about another job.

**Every change is made by id, to the list as it stands.** Checking off a job rewrites *that job's* line, through the app-content shown and guarded by it (`writeLines`, from `shared/line-records`). If the other person changed the list first, the write is refused whole; the Application waits for the newer list and makes the same change again, by the same id. Your change never lands on their job, and theirs is never undone by yours.

The job carries its writer's name (`name`), written when it is added: the list shows what each line holds, and never looks anyone up.

## Who is looking

```tsx
window.charmiq.user$().subscribe({ next: setMe, error: () => setMe(null) });
```

`user$` is the person viewing, never the document's author. Their `id` keys their own place, and their name signs the jobs they add. It needs the `user.read` scope, declared in the manifest: the person is asked before the Application learns who they are.

## Each person's own place

What one person has seen is theirs alone, so it lives in app-state under their User id:

```json
{ "byUser": { "<Rob's id>": { "seen": 1762800000000 }, "<Ana's id>": { "seen": 1762790000000 } } }
```

App-state is one value for the whole document, and the last write wins. So the Application never writes the whole object: `shared/app-state-settings` writes only `byUser.<your id>.seen`, onto the latest state, so Rob marking his jobs seen never resets Ana's.

**New** counts the other person's jobs newer than your `seen`, and `seen` is the newest such job's own time, not your device's clock: two phones whose clocks disagree still agree on what you have seen.

**Seen is a gesture.** It changes only when you tap **N new**, never because the list was drawn. An Application that saves while it draws can save in a loop: a refused save shows the saved value again, which draws again, which saves again.

## What to pay attention to

**Your place is readable by everyone.** `byUser` is still the document's: anyone who can read the document can read it. Keep anything private out of app-state.

**Two first adds create two lists.** If both of you add the very first job at the same moment, the document holds two app-contents named `punch-list`; the Application shows the first. Every later change goes to the one shown.

## Next steps

Next, this list becomes an app on your phone's Home Screen, with its own icon, top color and the **new** count on its icon.

→ [**The Installed App**](charmiq://../11-installed-app/README.md)
