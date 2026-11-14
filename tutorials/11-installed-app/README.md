# The Installed App

*The Punch List on your phone's Home Screen: its own icon, the header running into the status bar, the **new** count on the icon, and a shortcut straight to the done jobs.*

<p style="text-align: center;">
  <iframe-app height="420px" src="charmiq://.">
    <app-source>
    </app-source>
  </iframe-app>
</p>

In this document the Application is the Punch List from the last step, with an **All jobs / Done** switch. The rest of this step shows only once the document is opened as an app.

## What changed from the Punch List

| File | Change |
|------|--------|
| [`manifest.json`](charmiq://./manifest.json) | A new id and description; the same scopes (the page calls need none) |
| [`App.tsx`](charmiq://./App.tsx) | `page.setTopColor()`, the **new** count through `page.setAppBadge()`, the **All jobs / Done** switch, and the view a launch names through `page.launchQueue` |
| [`styles.scss`](charmiq://./styles.scss) | The **All jobs / Done** switch |
| [`jobs.ts`](charmiq://./jobs.ts), [`people.ts`](charmiq://./people.ts), [`People.tsx`](charmiq://./People.tsx) | Unchanged |
| [`index.html`](charmiq://./index.html), [`main.tsx`](charmiq://./main.tsx), [`_variables.scss`](charmiq://./_variables.scss) | Unchanged |

## Put the list on your Home Screen

A document opens as an app: its first Application (or the one you choose), full-screen, with no editor around it.

1. **Make a document of your own for it.** Put a document in the Folder that holds this tutorial's folder, with the Application as its first content:

   ```html
   <iframe-app src="charmiq://./11-installed-app" width="100%" height="100svh"></iframe-app>
   ```

   The address is relative to the document's own Folder. The app shows one Application, and the page calls below reach only that one: keep it first, or choose it in step 2.
2. **Document Properties → Home Screen.** Choose the **Application** (or leave **First Application**), a **Name** for the label under the icon, an **Icon** (this folder's `icon-512.png`: the setting takes one square 512×512 PNG; `icon.svg` is its source), and, under **Shortcuts**, one named *Done jobs* that opens with `?show=done`.
3. **Open it as an app.** **Open app** there (or the view-mode selector's **App**) opens the document at `?mode=app`. App mode is offered to the document's Editors.
4. **Add to Home Screen.** On an iPhone, open that address in Safari and use **Share → Add to Home Screen**; on Android, Chrome's **Install app** or **Add to Home screen**; on a Mac, Safari's **File → Add to Dock** or Chrome's install button. **Copy link** in the Home Screen settings carries the address to the phone.

## The header runs into the status bar

```tsx
useEffect(() => page.setTopColor({ light: '#f7f7f4', dark: '#161614' }), [page]);
```

The page behind the Application is what an installed phone app's status bar shows (a desktop app's title bar). The Application asks for one color for each mode, its header's own, and the page follows the document's mode as it changes. A `theme-color` `<meta>` inside the Application reaches nothing outside it: this call is the whole of it.

## The new count on the icon

```tsx
useEffect(() => { if(placeKnown) page.setAppBadge(fresh.length); }, [page, placeKnown, fresh.length]);
```

Whenever the **new** count changes, the icon shows it (`0` clears it). Nothing is counted before your place has been read.

**The tap asks.** On a Mac a badge needs the person's permission, and only a request made during a tap asks for it; one made outside a tap waits until they have decided. So the **N new** tap, which marks the jobs seen, also asks for the badge (`page.setAppBadge(0)`): after that one tap, every later count shows. An iPhone (16.4 or later) shows the count too; Android shows no badge.

The color and the count last while the app runs: leaving it, a reload or a source change resets them, so the Application sets them again each time it starts.

## A shortcut that opens a view

```tsx
useEffect(() => page.launchQueue.setConsumer(({ targetURL }) => {
  const wanted = new URL(targetURL).searchParams.get('show');
  if((wanted === 'all') || (wanted === 'done')) setView(wanted);
}), [page]);
```

The consumer hears the address the app opened with, then each shortcut chosen while it is open, each once. A shortcut adds its query to the address (`?show=done`); a launch that names no view leaves the view as it is. Shortcuts show in a Mac's Dock menu and on a long press on Android; an iPhone shows none.

**The query is the Application's own.** `mode`, `app`, `view`, `chat` and `thr` are the Platform's (the view mode, the Application, the Sidebar and so on): a shortcut cannot name them, so this one names `show`.

## What to pay attention to

**Outside the installed app, the calls do nothing.** In this document, in a browser tab or in a Preview, `setTopColor`, `setAppBadge` and `launchQueue` change nothing and never fail, so the Application calls them unconditionally. None needs a scope, and none answers.

**Only the app's Application is heard.** A document can hold several Applications; the app shows one, and only that one reaches the page.

**An icon on the Home Screen keeps its old name and picture.** After changing them in Document Properties, remove the icon and add it again.

## Next steps

Next, the other person hears about a new job even while their app is closed.

→ [**Notifications**](charmiq://../12-notifications/README.md)
