# Mobile

*Applications that live on your phone's home screen. Each opens straight into the Application, full-screen, the moment you tap its icon.*

| Application | What it does |
|----|----|
| [Synth Jukebox](charmiq://./synth-jukebox/README.md) | A music library whose albums are composed and played live on your phone, plus songs Lyria 3 Pro presses from your description |
| [Tick List](charmiq://./tick-list/README.md) | Lists you tick off, shared live with everyone you share it with |

Each Application's folder holds its README and one document per phone (`iOS`; Android to follow). That document is the Application and nothing else: it fills the screen, so these instructions live here.

## Put One on Your Home Screen

1. **Make it yours.** Use **Copy Document** on the Application's `iOS` document. App mode is offered to a document's Editors, and your copy holds your own data.
2. **Choose App.** Open your copy, open the view-mode selector and choose **App**. The address gains `?mode=app` and the editor disappears.
3. **Get it onto the phone.** Already on the phone? Go to step 4. On a desktop, copy the address and open it on the phone, or open the document from Drive on the phone and choose App there.
4. **Add to Home Screen.** In Safari, tap **Share → Add to Home Screen**. The icon takes the document's name; rename it in that sheet if you like.
5. **Sign in once.** The first launch asks you to sign in (the home-screen app keeps its own sign-in, apart from Safari's) and then opens the Application. It stays signed in after that, even after you force-quit it.

To edit the document itself, open it from Drive in a browser: the home-screen app has no way back to the editor.

## Share It

Share your copy as an **Editor** with each person who should have it; each adds it to their own home screen. Everyone sees everyone's changes live. App mode is not offered to Commenters or Viewers.

## Building Your Own

- **Write it inline.** The Application's source lives in the document (`<iframe-app>` → `<app-source>`), so it opens as soon as the page does. An Application with a manifest or folder is fetched and built after the page loads, a wait on every launch.
- **Keep the data as records, one per line.** The app-content holds one JSON record per line, each with its id; a change rewrites only the lines of the records it changes, through the app-content it was shown, and is applied again to the newer app-content when another writer got there first. A line it does not read is kept as written. Tick List and Synth Jukebox both work this way (the full guide: [Collaborating](https://team.charmiq.ai/docs/application/developer-app-content-and-app-state#collaborating)).
- **App-state is for settings.** It is one value for everyone sharing the document, so it holds what everyone shares (Tick List's Show Completed), never where one person is.
- **The document is only the Application:** theme `charmiq:none`, a stylesheet that zeroes the page's margin and padding (`:root`, `body`), and `<iframe-app height="100svh" width="100%">`. Copy either `iOS` document's header.
- **Sound on iOS:**
  - iOS plays audio only when it starts from a tap: create or `resume()` the `AudioContext` inside a `click` or `touchend` handler, never on load, on a timer or after an `await`. Leaving for the background, a lock or a call suspends it; resume it on the next tap.
  - Silent mode mutes Web Audio but not an `<audio>` element. Set `navigator.audioSession.type = 'playback'` to play anyway.
  - Use MP3, AAC or M4A; older iOS does not play Ogg.

  Synth Jukebox does all three. Its Studio takes are files read through the Platform and played from one `<audio>` element. iOS lets that element play outside a tap only after it has played inside one, so the tap that starts a take plays silence on it at once and the song when its bytes arrive.
