# charmiq-local — the local-dev bridge harness

*Run a `window.charmiq` app in a plain browser, outside the Platform.*

A CharmIQ Application normally only runs inside the Platform iframe, where the host injects `window.charmiq` (OAuth, `appState`, `appContent`, `fetch`, …). This harness is a stand-in for that bridge so you can build an app locally and open it in a browser while you iterate.

It is a **dev aid only**. It installs *only* when no real bridge is present and bails the instant one is, so it can never affect a Platform build.


## Use it

Build your app with the harness injected, then open the result:

```sh
# from platform/packages/cloud-functions
npm run build-app -- <path-to-app> --harness --output /tmp/app.html
open /tmp/app.html          # or serve /tmp over http://localhost (see below)
```

`--harness` bundles [`install.ts`](./install.ts) to an IIFE and inlines it ahead of your app, so `window.charmiq` exists before your code runs. Nothing in your app changes — it uses `window.charmiq` exactly as it does in the Platform.


## What it stands in for

| Surface | Local behavior |
|----|----|
| `appState` / `appContent` | Backed by `localStorage` — survives a reload |
| `fetch` | The real `window.fetch` (fine for CORS-friendly APIs like Google's) |
| `oauth.listAuth` / `getValidAuth` / `revokeAuth` | A paste-an-access-token flow (below), with the same `listAuth` / `getValidAuth({ connectionKey })` shape as the real bridge |
| `advertise` / `discover` / `exportCommands` | An in-page registry (one page, so siblings see each other) |
| `mcp`, `generation` | Throw a clear "not available in the local harness" error |

### OAuth locally

The Platform's OAuth broker is server-side and cannot exist in a plain browser, so the harness asks you to paste an **access token**:

1. Open Google's [OAuth Playground](https://developers.google.com/oauthplayground/), select the scope your app needs (e.g. `https://www.googleapis.com/auth/gmail.readonly`), authorize, and exchange for an access token.
2. When the app calls `getValidAuth`, the harness pops a prompt — paste the token.
3. The harness calls the provider's userinfo endpoint to fill in the account's email, name, and avatar, mirroring what the Platform returns. `prompt: 'select_account'` prompts again so you can add a second account.

Pasted tokens expire (~1h); re-add the account when it does. For a real in-browser OAuth flow (Google Identity Services token client), see the TODO in [`charmiq-local.ts`](./charmiq-local.ts) — it needs your own OAuth client id and your local origin added to its authorized origins.


## `file://` vs `localhost`

Opening the built HTML directly (`file://`) works, but browsers treat each `file://` document as a unique origin, which restricts `localStorage` and logs origin warnings. For a smoother loop, serve the output over HTTP:

```sh
cd /tmp && python3 -m http.server 8000   # then open http://localhost:8000/app.html
```
