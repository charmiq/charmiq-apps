# CharmIQ Apps

Apps embedded by the CharmIQ platform via an app iframe. No `package.json` or `tsconfig.json` at any level — each app is built on the fly by the Charmiq runtime from the `bundle.entry` in its `manifest.json`; external deps (rxjs, etc.) come from a runtime `importMap`, not npm.

## The host bridge is always async

- Every method on the injected CharmIQ services (`commandService`, `assetService`, `generationService`, …) crosses a `postMessage` bridge to the platform host, so **app-side every method returns a `Promise`**, even when the platform-side implementation is synchronous. Type every method as `Promise<T>` in `shared/charmiq-services.d.ts` (or any host-service contract), and `await` every call. Do **not** copy sync signatures from `platform/packages/web-service/**` — those are the underlying platform APIs, not the bridge-exposed ones.

## Content bridge — the block is the truth

- An app-content bridge follows `tutorials/03-writing-data` (and the public App-Content guide, §Collaborating): show what `onChange$()` delivers and never an edit before the block has it; write whole records with guarded `applyChanges()` (measured on a snapshot, sent with its revision); and treat your own writes, coming back, like any change. Every new revision is the block's state, an equal text included, so never drop one as an echo; skipping a redraw of identical text is fine.
- A `ContentChange` with `deleted=true` is **platform bookkeeping**, not an authoritative clear: it fires during a block's first-save and can arrive late, after an unrelated action. Skip it, and confirm a block is gone with `snapshot("[id='…']")` returning `null`.
- `demos/brick-studio`'s content bridge is the line-record example; `custom-drawing`'s whole-text `set()` predates guarded edits and is not an example.

## Typecheck

- No local tsc; use the platform binary:
  ```sh
  cd <app>/src
  /Users/rgrzywinski/Devel/charmiq.ai/platform/node_modules/.bin/tsc \
    --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --strict --lib es2022,dom,dom.iterable --skipLibCheck --esModuleInterop *.ts
  ```
  `TS2307: Cannot find module 'rxjs'` / `'rxjs/operators'` is expected noise (importMap, not node_modules). Any other error is real.
