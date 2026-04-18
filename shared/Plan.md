# Shared Code Plan

* Web Components with an AYS dialog
* Shared TypeScript contracts for the CharmIQ services injected at runtime — see `charmiq-services.d.ts`

## CharmIQ Services Typing

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
