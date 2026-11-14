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
| [`App.tsx`](charmiq://./App.tsx) | **Notify me** (`page.notifications.request()`), a send after each saved job (`page.notifications.send()`) with a retry, and the job a notification's tap names, through `page.launchQueue` |
| [`styles.scss`](charmiq://./styles.scss) | The **Notify me** card, and the job a notification opened, highlighted |
| [`jobs.ts`](charmiq://./jobs.ts), [`people.ts`](charmiq://./people.ts), [`People.tsx`](charmiq://./People.tsx) | Unchanged |
| [`index.html`](charmiq://./index.html), [`main.tsx`](charmiq://./main.tsx), [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

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
  audienceType: 'subscribers', excludeThisDevice: true,
  body: `${me.name} added: ${text}`, launch: `job=${job.id}`,
}, sending: false }));
```

Saving a job's line tells no one by itself. Once the line is saved, the Application sends it: to everyone whose device turned on notifications for this installed app (`subscribers`), leaving out the device that sent it (your other devices still hear it). Sending needs the `command.notification.material.push.send` scope and that you may edit the document; the first send asks you for the scope as any permission does.

**Each job is its own news.** There is no `replacementTag`: a tag is for updates of one thing (a job's progress), where a later send replaces an earlier one still waiting. Two new jobs are two notifications.

**The body shows on a lock screen.** It says who added which job and nothing else: keep anything a passer-by should not read out of it. It is at most 500 characters, so a long job is cut short there; the job itself is not.

`send` resolves once the Platform accepts the notification, never once a device shows it.

## A failed send, sent again

When a send fails, the job is still saved: the Application says the others were not told and offers **Tell them again**.

```tsx
page.notifications.send({ ...entry.notification, submissionId: failure.submissionId });
```

A failure can be uncertain: the Platform may have accepted the send before the answer was lost. So the retry repeats the same send, every field as it was, with the `submissionId` the failure carried. If the first send was in fact accepted, the Platform answers with that acceptance instead of sending a second notification.

## A tap opens that job

```tsx
page.launchQueue.setConsumer(({ targetURL }) => {
  const job = new URL(targetURL).searchParams.get('job');
  if(job) { setView('all'); setTarget(job); }
});
```

The notification's `launch` (`job=<id>`) comes back as the query of the address the app opens with, through the same launch queue as the shortcut. The Application shows every job, scrolls to that one and highlights it. A job the list does not hold yet stays asked for until it arrives; one that was removed says so.

**The launch query is the Application's own.** `mode`, `app`, `view`, `chat` and `thr` are the Platform's, so this one names `job`.

## Test it on two phones

Two people, each with a phone, each signed in as themselves.

1. **The Application in your Drive.** This tutorial's folder, `12-notifications`, and the repository's `shared` folder keep their places relative to each other (the manifest mounts `../../shared`).
2. **A document that shows it.** In the Folder that holds `12-notifications` (here, `tutorials`), make a document whose first content is the Application:

   ```html
   <iframe-app src="charmiq://./12-notifications" width="100%" height="100svh"></iframe-app>
   ```

   The address is relative to the document's own Folder. Open the document once: the Application asks for its scopes.
3. **Share it.** Share the document with the second person as an **Editor**. The Application's files are read with each person's own access, so share the folders holding `12-notifications` and `shared` with them too (Viewer is enough).
4. **Put it on each Home Screen.** Once, in Document Properties → Home Screen, set the **Icon** to this folder's `icon-512.png` (`icon.svg` is its source). Then on each phone: Document Properties → Home Screen → **Open app** (or the document's address with `?mode=app`), sign in if asked, then **Share → Add to Home Screen** in Safari on an iPhone (iOS 16.4 or later), or **Install app** in Chrome on Android. Open the app from the new icon.
5. **Tap Notify me on each phone**, and **Allow** both the Platform's question and the browser's.
6. **Add a job on one phone.** Close the app on the other (or lock it). The notification arrives there, titled with the app's name, saying who added which job. Its icon shows a count.
7. **Tap it.** The app opens, scrolls to the job and highlights it.

Nothing arrives? Check that **Notify me** is gone on the receiving phone (its state is `on`), that the job was added on the *other* phone (the sending device is left out), and that both opened the same document's app.

## What to pay attention to

**Notify me works only in the installed app.** In this document or a browser tab its state is `unavailable` and the card stays hidden, while a send still works anywhere you can edit the document.

**Someone who turns notifications on later hears only later jobs.** A device is sent the notifications accepted after it subscribed.

**Sends are limited.** A person may send 60 a minute and 1,000 a day; a document accepts 120 a minute and 1,000 a day from everyone. A refusal names the limit, and the job's notice offers to try again.

SEE: the public *Developer | The Bridge API* page, `window.charmiq.page.notifications`.
