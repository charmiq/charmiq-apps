# Punch List

*Two people, one document, one list: what each of you sees, and what is new to you.*

<p style="text-align: center;">
  <iframe-app height="420px" src="charmiq://.">
    <app-source>
    </app-source>
  </iframe-app>
</p>

Add a job above, then share this document with someone as an Editor. Each of you adds and checks off jobs; each job carries the name and color of whoever added it, and **N new** counts the jobs the *other* person added since you last looked. Tap it to mark them seen. Above the list, the Application says whether anyone else is here yet; beneath it, who has a seat and how to bring someone in.

## What changed from Writing Data

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Declares `user.read` and `mcp.platform.vfs`; no `runtime.appContent` (the list's app-content is created by name) |
| [`jobs.ts`](charmiq://./jobs.ts) | New: the jobs as JSON records, one per line, each change made by id to the list as it stands |
| [`people.ts`](charmiq://./people.ts) | New: each person's member line, the document's shares, and everyone with a seat |
| [`People.tsx`](charmiq://./People.tsx) | New: whether anyone else is here, who works on the list and who looks in, and the invite card |
| [`App.tsx`](charmiq://./App.tsx) | Shows the jobs; who is looking (`user$`); their member line; the shares; each person's place in app-state |
| [`styles.scss`](charmiq://./styles.scss) | A header with the **new** count; each job marked in its writer's color; avatars and the people section |
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

The job carries its writer's name (`name`), written when it is added: the list shows what each line holds, and never looks anyone up. The row shows the writer's initials in their color (the full name on hover), so the job's text keeps the width on a phone. The color comes from its writer's member line, on the same list.

## Who is looking

```tsx
window.charmiq.user$().subscribe({ next: setMe, error: () => setMe(null) });
```

`user$` is the person viewing, never the document's author. Their `id` keys their own place, and their name signs the jobs they add. It needs the `user.read` scope, declared in the manifest: the person is asked before the Application learns who they are.

## Who is on the list

Two things together say who is here: the people who opened the list, and the people who have a seat on the document.

**A member line for each person who opens it.** On your first open the Application adds a line of your own beside the jobs:

```json
{"k":"member","id":"<User id>","name":"Ana","img":"<picture URL>","c":"blue"}
```

It carries your name, your picture and a color no one else on the list has; every job you add is marked in that color. It is written through the same guarded change as a job (the color is chosen from the list as it stands when the line is written, so two people opening at once still get two colors), and written again only when your name or picture changes. Someone who only looks at the document writes none: their write would be refused.

**The document's shares.** Who else has a seat comes from the document itself, read with the `vfs` server's `describe_file` tool (scope `mcp.platform.vfs`):

```tsx
const here = window.charmiq.document;   // { type, id, uri }, or null outside a document
const result = await window.charmiq.mcp.callTool('vfs', 'describe_file', { uri: here.uri, verbose: true, types: ['iframe-app'] });
// result.structuredContent.shares: [{ user: '<User id or invited email>', role: 'owner' | 'editor' | 'commenter' | 'viewer' | … }]
```

`window.charmiq.document` is the document the Application is in: an address, not access. The read through it needs its own scope and your own access to the document. `shares` comes only in verbose mode, and is absent when the document has no shares at all; `types` keeps the rest of the answer (the document's outline) small.

Owners and Editors **work on** the list; Commenters and Viewers **look in**: they see the jobs and cannot change them. Someone invited who has not opened the list yet has a seat and no member line: they show as invited, by their email when they were invited by one. Someone with a member line the shares do not name (their access comes from a Folder) wrote here, so they work on it.

**An unread list is never "nobody else".** If the shares cannot be read (the Platform refuses, or the person declined the scope), the Application says so and offers to try again; it never says "It's just you in here" without having read them. Outside a saved document (`document === null`) it says the list needs one. The shares are read when the list opens and again when you come back to it (at most every 15 seconds), so someone you just invited from the Share menu shows up.

**There is no live "here now".** Showing who is looking right now would mean each person writing to the document every minute the list is open: a change to the document, its history and every other screen, per person, per minute. The list shows who *has opened* it, which one line per person records for good.

**Sorted, always.** The people are listed you first, then those who opened the list by name, then those who have not opened it yet by name. A long name ends in an ellipsis.

## Each person's own place

What one person has seen is theirs alone, so it lives in app-state under their User id:

```json
{ "byUser": { "<Rob's id>": { "seen": 1762800000000 }, "<Ana's id>": { "seen": 1762790000000 } } }
```

App-state is one value for the whole document, and the last write wins. So the Application never writes the whole object: `shared/app-state-settings` writes only `byUser.<your id>.seen`, onto the latest state, so Rob marking his jobs seen never resets Ana's.

**New** counts the other person's jobs newer than your `seen`, and `seen` is the newest such job's own time, not your device's clock: two phones whose clocks disagree still agree on what you have seen.

Nothing counts as new until your place has been read: before then every job would look new.

**Seen is a gesture.** It changes only when you tap **N new**, never because the list was drawn. An Application that saves while it draws can save in a loop: a refused save shows the saved value again, which draws again, which saves again.

## What to pay attention to

**Your place is readable by everyone.** `byUser` is still the document's: anyone who can read the document can read it. Keep anything private out of app-state.

**Two first opens create two lists.** The first member line starts the list. If two people open a brand-new list at the same moment, the document holds two app-contents named `punch-list`; the Application shows the first. Every later change goes to the one shown.

**Names and pictures are the document's.** A member line is readable by everyone who can read the document, like every job.

## Next steps

Next, this list becomes an app on your phone's Home Screen, with its own top color, the **new** count on its icon and a shortcut to the done jobs.

→ [**The Installed App**](charmiq://../11-installed-app/README.md)
