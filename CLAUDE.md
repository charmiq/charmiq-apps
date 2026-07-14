# CharmIQ Apps

Apps embedded by the CharmIQ platform via an app iframe. No `package.json` or `tsconfig.json` at any level — each app is built on the fly by the Charmiq runtime from the `bundle.entry` in its `manifest.json`; external deps (rxjs, etc.) come from a runtime `importMap`, not npm.

## The host bridge is always async

- Every method on the injected CharmIQ services (`commandService`, `assetService`, `generationService`, …) crosses a `postMessage` bridge to the platform host, so **app-side every method returns a `Promise`**, even when the platform-side implementation is synchronous. Type every method as `Promise<T>` in `shared/charmiq-services.d.ts` (or any host-service contract), and `await` every call. Do **not** copy sync signatures from `platform/packages/web-service/**` — those are the underlying platform APIs, not the bridge-exposed ones.

## Content bridge — `deleted=true` is bookkeeping

- In a content-bridge, a `ContentChange` with `deleted=true` is **platform bookkeeping**, not an authoritative clear. It fires during a block's first-save and drains whenever pending postMessage events flush (e.g. right after an unrelated `appState.set`), so it can arrive late and look caused by an unrelated action. **Skip `change.deleted` events**; use content equality against a shadow for echo suppression, and drive any real local clear proactively (update local model + shadow before calling `appContent.remove()`). See `custom-drawing`'s content-bridge for the reference implementation.

## Typecheck

- No local tsc; use the platform binary:
  ```sh
  cd <app>/src
  /Users/rgrzywinski/Devel/charmiq.ai/platform/node_modules/.bin/tsc \
    --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --strict --lib es2022,dom,dom.iterable --skipLibCheck --esModuleInterop *.ts
  ```
  `TS2307: Cannot find module 'rxjs'` / `'rxjs/operators'` is expected noise (importMap, not node_modules). Any other error is real.
