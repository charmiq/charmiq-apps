# Shared Code Plan

* Web Components with an AYS dialog
* Shared TypeScript contracts for the runtime surface that the Platform exposes to Applications:
  * `charmiq.d.ts` — the `window.charmiq` namespace (`CharmIQAPI`): per-Application
    instance API for appContent, appState, capability advertise/discover, fetch, mcp,
    oauth, visualEditor, visualDesigner
  * `charmiq-services.d.ts` — the CharmIQ *services* (`CharmIQServices`): shared
    singletons injected by the host (commandService, assetService, generationService)
  * `charmiq-commands.d.ts` — the `CharmIQCommandsMap`: per-command `{ args, return }`
    signatures for the platform Commands that apps call through `commandService.execute`.
    Hand-mirrored from the platform's `registerCommand` declarations; a generator
    will eventually replace the hand mirror so it can't drift

## CharmIQ API Typing (`charmiq.d.ts`)

### Near-term (current)
`shared/charmiq.d.ts` mirrors the `CharmIQAPI` interface from the Platform's iframe-scripts
bundle — the
scripts run *inside* the Application iframe, so the Promise / Observable shapes here ARE
the app-side signatures (no promisification pass needed, unlike services). Transitive
types (rxjs `Observable`, OAuth / MCP value types, etc.) are inlined as minimal or
opaque forms so the file is zero-dependency.

Apps import via relative path:
```ts
import type { CharmIQAPI } from '../../../shared/charmiq';
```
Importing anything from this module also types `window.charmiq` globally (via
`declare global { interface Window { ... } }`), so apps can reach through
`window.charmiq.appContent.get()` etc. without a local cast.

### Long-term
Same destination as services (see below): publish as part of the types-only
`@charmiq/app-sdk` package, generated from the Platform's `CharmIQAPI` source of truth
so signatures can't drift. Cutover is mechanical — only the module specifier changes.

## CharmIQ Services Typing (`charmiq-services.d.ts`)

### Near-term (current)
`shared/charmiq-services.d.ts` duck-types the subset of `commandService` / `assetService` /
`generationService` methods that apps actually call. Each app imports the contract via
relative path (e.g. `../../../shared/charmiq-services`) and replaces its local
`interface CharmIQServices { commandService: any; ... }` with the shared types. No
build-system changes -- tsc follows the relative import. Zero runtime cost (interfaces
are erased).

When a new app starts consuming a service method that isn't covered, the method signature
is added to `charmiq-services.d.ts` rather than to a per-app interface. Drift between
the shared contract and the real platform implementation is caught at runtime; the
contract is authoritative for what apps may rely on.

### Long-term
Publish the contracts as a types-only `@charmiq/app-sdk` package generated from the real
platform interfaces in `platform/packages/{application,web-service}/src/**`, so the
contract can't drift from the implementation. Charmiq-apps reference it via the
`manifest.json` `importMap` (same mechanism already used for `rxjs` et al.) -- no runtime
code shipped, just types. Concrete method signatures (e.g. `execute` narrows by
command id via a CommandsMap, `generateImage` returns typed asset ids) replace the
duck-typed surface. Cutover is mechanical because every app already imports from a
single shared symbol -- only the module specifier changes.
