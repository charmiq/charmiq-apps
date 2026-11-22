# Notifications

*The other person hears about a new job even while their app is closed, and a tap on the notification opens the app at that job.*

<p style="text-align: center;">
  <iframe-app height="420px" src="charmiq://.">
    <app-source>
    </app-source>
  </iframe-app>
</p>

In this document the Application is the Punch List from the last step, and every job you add is sent as a notification. **Notify me** shows only in the installed app: to receive one, follow [Test it on two phones](#test-it-on-two-phones).

## What changed from the Installed App

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | Declares `command.notification.material.push.send` beside `user.read` and `mcp.platform.vfs` |
| [`App.tsx`](charmiq://./App.tsx) | **Notify me** (`page.notifications.request()`), a send after each saved job (`page.notifications.send()`, one tag with a hold, so a run of jobs arrives as one notification, leaving out whoever is watching the list as it arrives), one line for the jobs no one was told about, the list shown clearing what still waits (`page.notifications.consumed()`) and marking its jobs seen, which clears the icon's count (no **N new** tap), and the job a notification's tap names, through `page.launchQueue` |
| [`unsent.ts`](charmiq://./unsent.ts) | New: the jobs no one was told about, as one line for the newest, and whether trying again can help |
| [`styles.scss`](charmiq://./styles.scss) | The **Notify me** card in a slot that keeps its height, the job a notification opened, highlighted, and the waiting screen; no **N new** button |
| [`manifest.json`](charmiq://./manifest.json), [`index.html`](charmiq://./index.html), [`App.tsx`](charmiq://./App.tsx) | The app draws its own waiting screen while it opens: the manifest declares `"waitingState": "application"`, `index.html`'s markup is the header over a list assembling itself, and the whole page takes its place at once, after `page.launchState$()` says `ready`, when the list, who is looking and who has the document are known |
| [`jobs.ts`](charmiq://./jobs.ts), [`people.ts`](charmiq://./people.ts), [`People.tsx`](charmiq://./People.tsx) | Unchanged |
| [`main.tsx`](charmiq://./main.tsx), [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## Each device decides for itself

```tsx
const turnOn = () => page.notifications.request().then(setNotify, () => setNotifyFailed(true));
```

A tap on **Notify me** asks *this device*, for its signed-in person and this installed app. The Platform asks with its own question: **Allow** turns notifications on (the browser asks too, within the same tap), **Don't allow** keeps them off. Another device of the same person asks for itself. Receiving needs no scope, and allowing it grants no sending.

`page.notifications.state()` says where this device stands, and the card follows it:

| State | What the card shows |
|----|----|
| `off` | **Notify me** |
| `blocked` | **Notify me**, and how to allow notifications in the device's settings: the browser refuses them until then |
| `on` | Nothing: this device hears about new jobs |
| `unavailable` | Nothing: there is no installed app to notify (a browser tab, this document, a browser without push) |

The state is read again each time you come back to the app.

**The app has no off button, and needs none.** Turning a device off is the person's: in a browser that shares its storage with the installed app (Chrome on a computer or Android), Settings → Permissions → Notifications on this device; for an app added to the Home Screen of an iPhone or iPad, or to the Dock from a Mac's Safari, that device's own notification settings (Settings → Notifications, System Settings → Notifications).

## Only a send notifies

```tsx
list.change(adding(job)).then(() => announce({ job, notification: {
  audienceType: 'subscribers', excludeThisDevice: true, excludePresent: true,
  body: bodyOf(me.name, text, run.current.count), launch: `job=${job.id}`,
  replacementTag: 'new-jobs', holdSeconds: 10,
}, sending: false }));
```

Saving a job's line tells no one by itself. Once the line is saved, the Application sends it: to everyone whose device turned on notifications for this installed app (`subscribers`), leaving out the device that sent it (your other devices still hear it). Sending needs the `command.notification.material.push.send` scope and that you may edit the document; the first send asks you for the scope as any permission does.

## Ten jobs in a row are one notification

Ana adds ten jobs in a row. Ten notifications would buzz Ben's phone ten times, nine of them about a list he is already looking at. So every new job is sent under one `replacementTag` (`new-jobs`) with a `holdSeconds` of 10:

- **The tag replaces.** A later send with the same tag replaces the one still waiting, and on Ben's device the newer notification takes the older one's place.
- **The hold batches.** The Platform sends nothing of the tag to Ben's devices until 10 seconds after the first of the run. A job added within those 10 seconds replaces the waiting one and keeps the earlier, sooner end, so a run waits at most one hold (no send ever waits longer than its own). The hold is the Platform's: it holds even after Ana closes the app.
- **The Application words the batch.** The Platform counts nothing into the message, so the app counts the jobs this device added in the current hold and says so: *Ana added 'Seal the deck' and 2 more*. A tap opens the newest.

A single job arrives 10 seconds after it was added, saying only *Ana added 'Seal the deck'*. Without the tag and hold, each job would arrive on its own within seconds of the last.

**Watching is seen.** Ben has the list open, and watches Ana's jobs appear in it. Each send leaves out present recipients (`excludePresent: true`): when the hold ends, the Platform checks whether Ben has this app open at the list, in view. He does, so none of his devices is pushed and his icon counts nothing. Had he put the phone away, or left App mode, or opened another Application, the notification would have reached him. Where the Platform cannot tell, it sends.

**The body shows on a lock screen.** It says who added which job and nothing else: keep anything a passer-by should not read out of it. It is at most 500 characters, so a long job is cut short there; the job itself is not.

## A list seen is news already seen

```tsx
page.notifications.consumed('new-jobs');
```

When the list is shown (opened, or come back to), the jobs are in front of Ben: a `new-jobs` notification still waiting is news he has seen. `consumed('new-jobs')` tells the Platform so. What still waits of the tag for Ben is sent to none of his devices, and this device closes the `new-jobs` notifications it still shows. Opening the app alone closes nothing: only the Application knows what was shown.

`consumed` covers what was waiting when the list was shown. A job Ana adds while Ben watches is sent after that, so it is new: `excludePresent` covers it, at delivery.

**The badge counts notifications, the message counts jobs.** Ana's three jobs in a row arrive as one notification ("… and 2 more"), and the icon shows 1: the Platform counts what it sent, a tag once. *An exercise for the reader:* make the icon count jobs. A send's `badge` sets the icon's number outright, but one send to every subscriber carries one number, and each person's new jobs differ: send to each person (`audienceType: 'users'`) with their own count, read from their place in app-state, and mind the sending limits in a burst.

**The icon agrees.** The same moment marks the jobs the list shows as seen (Ben's place in app-state), so the **new** count drops to 0 and the icon's badge clears; a job that arrives while he watches is seen as it appears. The Installed App's **N new** tap is gone: here, a list shown is a list seen. Where a badge needs permission (a Mac), the **Notify me** tap is the one that asks for it.

`send` resolves once the Platform accepts the notification, never once a device shows it.

## A failed send, sent again

When a send fails, the job is still saved: the Application says the others were not told, in one line however many failed: *"Four" and 3 more were saved, but no one was told.* Every job is sent under the same tag, so the newest send stands for the others, and it is the one sent again ([`unsent.ts`](charmiq://./unsent.ts)). Once a newer job is told, the line goes.

```tsx
page.notifications.send({ ...latest.notification, submissionId: failure.submissionId });
```

A failure can be uncertain: the Platform may have accepted the send before the answer was lost. So the retry repeats the same send, every field as it was, with the `submissionId` the failure carried. If the first send was in fact accepted, the Platform answers with that acceptance instead of sending a second notification.

**Tell them again** shows only where trying again can help: a lost answer, a service busy or failing for now, or a sending limit (which also says to wait). A refusal is the same every time (sending from someone who cannot change the list, a send the Platform cannot take), so the line says why and offers **Dismiss** instead.

## A tap opens that job

```tsx
page.launchQueue.setConsumer(({ targetURL }) => {
  const job = new URL(targetURL).searchParams.get('job');
  if(job) { setView('all'); setTarget(job); }
});
```

The notification's `launch` (`job=<id>`) comes back as the query of the address the app opens with, through the same launch queue as the shortcut. The Application shows every job, scrolls to that one and highlights it. A job the list does not hold yet stays asked for until it arrives; one that was removed says so.

**The launch query is the Application's own.** `mode`, `app`, `view`, `chat` and `thr` are the Platform's, so this one names `job`.

## The app draws its own waiting screen

```json
"waitingState": "application"
```

```tsx
useEffect(() => {
  const subscription = page.launchState$().subscribe(setLaunch);
  return () => subscription.unsubscribe();
}, [page]);
```

An installed app takes a moment to open: the Platform checks the sign-in and the person's access while the Application's document loads. The Installed App showed its launch screen through that wait, the color and picture set in Home Screen. With `waitingState` declared in `manifest.json`, the Punch List shows itself instead, from the first paint: its header, over a list assembling itself.

**The markup is the waiting screen.** It shows before any of the Application's scripts runs, so [`index.html`](charmiq://./index.html) draws it as written: the header, and rows in the crew's colors whose boxes tick in turn while their lines shimmer, with no field or button that looks as if it works. With Reduce Motion on, the ticks fade in and out in turn instead of drawing, and the lines hold still.

**Held means nothing acts.** While the page holds the Application, a tap reaches nothing, and every call it makes through the bridge (a save, a send, the badge) waits, then goes in order once the Application is released, or never, if the launch is refused. So the waiting screen never shows an action as done.

**`launchState$()` says when it is released.** It says `held`, then `ready` once, and ends. By `ready`, taps reach the Application and its waiting calls have gone. The Application then swaps the waiting screen for the whole page, in a single frame, once what the page shows first is known too: the list, who is looking, and who has the document (its shares, read or refused). So the page appears once, complete, and nothing in it moves as the rest arrives: no empty list, no card that grows when the names come in, no people popping in under the jobs. A list that could not be read says so at once. A list behind the waiting screen is not yet shown: nothing is marked seen or `consumed` until the live list is, and a job a notification names stays asked for until the live list can scroll to it.

**Notify me is not waited for.** This device's notification state can take a moment while the device looks up its push subscription, so the page does not wait on it: its slot keeps the card's height from the first frame, empty until the state arrives, and a state said in a line sits in the middle of it. Only *blocked*, with more to say, grows it.

**The waiting screen waits as long as they do.** Who is looking and the document's shares come with no deadline, and the first open may ask you for the Application's scopes before either answers; the waiting screen stands until they do.

**Where it applies.** A launch whose page the server writes with the Application: from the network, signed in, or from the page the phone kept. A reload says `held` again. The first launch on a phone, before it is signed in, still shows the launch screen, so keep it set (step 4 below). One launch never shows both: once the waiting screen is up, the launch screen does not come back, even when the app's files changed and it rebuilds or reloads; where the waiting screen has to go, the plain background shows until the new one draws. Everywhere else (this document, a browser tab, a Preview), `launchState$()` says `ready` alone, and the waiting screen shows only until the list, who is looking and the shares are known.

## Test it on two phones

Two people, each with a phone, each signed in as themselves.

1. **The Application in your Drive.** This tutorial's folder, `12-notifications`, and the repository's `shared` folder keep their places relative to each other (the manifest mounts `../../shared`).
2. **A document that shows it.** In the Folder that holds `12-notifications` (here, `tutorials`), make a document whose first content is the Application:

   ```html
   <iframe-app src="charmiq://./12-notifications" width="100%" height="100svh"></iframe-app>
   ```

   The address is relative to the document's own Folder. Open the document once: the Application asks for its scopes.
3. **Share it.** Share the document with the second person as an **Editor**. The Application's files are read with each person's own access, so share the folders holding `12-notifications` and `shared` with them too (Viewer is enough).
4. **Put it on each Home Screen.** Once, in Document Properties → Home Screen, set the **Icon** to this folder's `icon-512.png` (`icon.svg` is its source), and the **Launch screen** to its `launch-screen-1024.png` (`launch-screen.svg` is its source) with the **Launch screen color** `#0e9bb0`: the installed app shows it while it opens wherever the Punch List cannot draw its own waiting screen ([The app draws its own waiting screen](#the-app-draws-its-own-waiting-screen)). Then on each phone: Document Properties → Home Screen → **Open app** (or the document's address with `/app` on the end), sign in if asked, then **Share → Add to Home Screen** in Safari on an iPhone (iOS 16.4 or later), or **Install app** in Chrome on Android. Open the app from the new icon.
5. **Tap Notify me on each phone**, and **Allow** both the Platform's question and the browser's.
6. **Add a job on one phone.** Close the app on the other (or lock it). About 10 seconds later the notification arrives there, titled with the app's name, saying who added which job. Its icon shows a count.
7. **Add three jobs in a row.** One notification arrives, for the newest: *… and 2 more*.
8. **Tap it.** The app opens, scrolls to the job and highlights it, and closes the other `new-jobs` notifications that phone still shows. Its icon's count clears, and stays clear after you leave.
9. **Add a job, and open the app on the other phone within 10 seconds.** Nothing arrives: the list was seen.
10. **Keep the app open on the other phone, in view, and add a job.** Nothing arrives there and its icon counts nothing: Ben watched it appear. Lock that phone, wait a minute, and add another: it arrives.

Nothing arrives? Check that **Notify me** is gone on the receiving phone (its state is `on`), that the job was added on the *other* phone (the sending device is left out), and that both opened the same document's app.

## What to pay attention to

**Notify me works only in the installed app.** In this document or a browser tab its state is `unavailable` and the card stays hidden, while a send still works anywhere you can edit the document.

**Someone who turns notifications on later hears only later jobs.** A device is sent the notifications accepted after it subscribed.

**Sends are limited.** A person may send 60 a minute and 1,000 a day; a document accepts 120 a minute and 1,000 a day from everyone. A refusal names the limit, and the job's notice offers to try again.

SEE: the public *Developer | The Bridge API* page, `window.charmiq.page.notifications`.
