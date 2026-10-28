# CharmIQ Apps

Apps embedded by the CharmIQ platform via an app iframe. No `package.json` or `tsconfig.json` at any level — each app is built on the fly by the Charmiq runtime from the `bundle.entry` in its `manifest.json`; external deps (rxjs, etc.) come from a runtime `importMap`, not npm.

## The host bridge is always async

- Every method on the injected CharmIQ services (`commandService`, `assetService`, `generationService`, …) crosses a `postMessage` bridge to the platform host, so **app-side every method returns a `Promise`**, even when the platform-side implementation is synchronous. Type every method as `Promise<T>` in `shared/charmiq-services.d.ts` (or any host-service contract), and `await` every call. Do **not** copy sync signatures from `platform/packages/web-service/**` — those are the underlying platform APIs, not the bridge-exposed ones.

## Content bridge — the app-content is the truth

- **App-content is read and written through `AppContent`.** `appContent.content$()` (or `contents$()`) gives the app-content kept current, `null` while there is none, its removal exact; every write goes through the app-content shown (`appendLine`, `removeLine`, `replaceLine`, `setLines`, `edit`, `remove`), measured on it and refused whole when it has changed since. Beneath it, the contract is a guarded `applyChanges()`: insert, delete or replace any range, measured on the snapshot it names, refused whole when the app-content has changed since. Line records (Tutorial 3, Brick Studio) and the live text editor are patterns of it. Records suit discrete actions (add, remove, replace a line). A live text editor (a change per keystroke, typing still unconfirmed) also follows the app-content's actual edits (`edits$`) with tagged writes and a collaborative editing model, never by diffing snapshots; `apps/codemirror-editor` is its worked example, and `shared/collab-text` (`CollabText`) is that app's own CodeMirror-shaped helper. Never present one pattern as the contract, and never copy the CodeMirror example into a general doc or example.
- A record bridge (discrete actions: add, remove, replace a line) follows `tutorials/03-writing-data` (and the public App-Content guide, §Collaborating): show what `content$()` gives and never an edit before the app-content has it; change whole lines through the app-content shown; and treat your own writes, coming back, like any change. Every new revision is the app-content's state, an equal text included, so never drop one as an echo; skipping a redraw of identical text is fine. A live text editor shows its unconfirmed typing and recognizes its own writes by their tag instead (SEE: `apps/codemirror-editor`).
- Through the primitives, a `ContentChange` with `deleted=true` is **a reason to check, not proof** (`content$()` needs no check: its removal is exact): the platform also sends one during an app-content's first-save, and it can arrive late, after an unrelated action. Check with `snapshot("[id='…']")`: the app-content is gone when that returns `null` while the app still shows exactly the snapshot it checked (it may have been restored or replaced meanwhile). Apply any read's answer only while the app still shows what it showed when the read began, and treat a failed read as a visible error, never an absence.
- `demos/brick-studio`'s content bridge is the line-record example. Records with ids (`apps/image-gallery`, `apps/custom-drawing`) write through the app-content shown with `shared/line-records` (the one guarded change, the conflict check, an older one-array app-content read as lines) and measure a refused write again by id on the app-content as it is now; an app that bundles `shared/` mounts it (`"mounts": { "/shared": "../../shared" }`).

## Platform tool calls

- **A Platform tool call is written from that tool's declared input schema** (its `inputSchema` in the Platform's `packages/cloud-functions/src/mcp/<server>/`, or `listTools()`), required fields and nesting included, never by analogy with a sibling tool: `create_music` nests its prompt in the provider object, `create_image` takes it at the top level. A stand-in for the Platform that previews an Application validates each call against that schema, never against the Application's own call: a stand-in copied from the caller agrees with the caller's mistakes.

## Example films

- **Every new Brick Studio or Stop Motion feature lands in the example films in the same change.** The films a person meets first are Stop Motion's starter scene (`demos/stop-motion/src/films.ts` `STARTER_SCENE`), *The Salon* (`demos/stop-motion/Studio.md`) and *The Shortcut* (`demos/stop-motion/README.md`). Each one uses every feature where the film has a place for it (a sky over the street, a gait for the walkers, a sound on the cut), so the defaults show what the apps can do. A feature that needs the viewer's own files (a picture from their Drive) is shown in the scene's comments, saying how to add one. A feature is not done until the films show it.

## Mobile Applications

- **`mobile/<application>/` holds a `README.md` and one document per phone platform (`iOS.md`).** The phone document is the Application alone (theme `charmiq:none`, a stylesheet zeroing `:root`/`body` spacing, `<iframe-app height="100svh" width="100%">`): it fills the screen, so nothing else in it can be seen. Setup and explanation belong in the READMEs (`mobile/README.md` for the shared home-screen steps).
- **A state a gesture starts is in place before the write that shows it.** A write to the app-content repaints from its own emission, so local state set after the awaited write (a take's naming flaps) arrives a frame late and the surface flashes the state before it. Check a transition from its first painted frame (a `MutationObserver` on the surface from the gesture on), never only its settled states.
- **Device-only behavior is researched before it is fixed.** A defect that only the phone shows (the lock screen, the audio session, a backgrounded page) is first matched against reports of the same symptom; a fix the harness cannot reproduce is handed over as a hypothesis, naming the device result that would refute it.
- **Mobile Applications are inline** (`<app-source>` in the document), never manifest- or folder-based: inline source arrives with the document and opens with the page, while a manifest Application is fetched and built after it, a wait on every launch. Inline source cannot mount `shared/`; what it needs from there is written into the Application.

## Tests

- **This repository carries no tests**: it is public. Never add test files, test scripts or test setup here.

## Typecheck

- Every Application is type-checked as the Platform builds it, its libraries typed from esm.sh at the versions its `importMap` pins: `?typecheck=true` on the Application in the Platform, or the Platform's Application CLI, `npm run build-app -- <app folder> --typecheck`. Every reported error is real; an import served without types, or a library declaration that could not be read, is named rather than passed as typed.
- A type import from `shared/` (`../../../shared/charmiq`) resolves only through a `/shared` mount: `"mounts": { "/shared": "../../shared" }`.
