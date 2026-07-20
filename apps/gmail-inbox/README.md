# Gmail Inbox

*A read-only, multi-account Gmail inbox — a master-detail viewer built on the CharmIQ OAuth bridge, with obvious hooks to make it read-write.*

<iframe-app height="560px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://.">
</iframe-app>


## What This Is

A worked example of **OAuth in a CharmIQ Application**. It connects one or more Gmail accounts, merges their inboxes into a single newest-first list, and shows the selected message on the right. The app never sees a password and never modifies anything — it holds only short-lived, read-only access tokens the Platform mints on demand.

The point of the example is the OAuth flow, so everything else stays deliberately simple.


## Using It

- **Connect an account** — click the person-plus button. A CharmIQ consent popup and Google's sign-in appear; approve read-only Gmail access.
- **Add more accounts** — the same button always shows Google's account picker, so a second and third account merge into the one list, each row tagged with its account avatar.
- **Read** — pick a message on the left. HTML mail renders in a sandboxed frame that can't reach the app; plain-text mail renders as text.
- **Manage** — the gear menu lists connected accounts; *Remove* disconnects one (with a confirmation).


## How It's Built

| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Identity, requested scopes, Preact import map |
| [`src/index.html`](charmiq://./src/index.html) | The shell — a single mount point |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Swiss-minimal styling on the shared app tokens |
| [`src/gmail-oauth.ts`](charmiq://./src/gmail-oauth.ts) | The **only** module that talks to the OAuth bridge — enumerate accounts, add/remove, mint a per-account token |
| [`src/gmail-client.ts`](charmiq://./src/gmail-client.ts) | Read-only Gmail REST + body parsing, and the read-write hooks (see below) |
| [`src/use-inbox.ts`](charmiq://./src/use-inbox.ts) | The controller — load, paginate, aggregate, select; persists the selection to `appState` |
| [`src/app.tsx`](charmiq://./src/app.tsx) · [`account-bar`](charmiq://./src/account-bar.tsx) · [`master-list`](charmiq://./src/master-list.tsx) · [`email-detail`](charmiq://./src/email-detail.tsx) · [`instructions`](charmiq://./src/instructions.tsx) · [`confirm-dialog`](charmiq://./src/confirm-dialog.tsx) · [`avatar`](charmiq://./src/avatar.tsx) | Presentational Preact components |


## The OAuth Flow (the lesson)

Multi-account rests on two bridge calls, and the app **caches no token**:

```ts
// on load — every connected account, as token-less descriptors (no popup)
const accounts = await window.charmiq.oauth.listAuth({ providerUrl: 'https://accounts.google.com' });

// just before a batch of Gmail calls — a fresh token for ONE specific account
const auth = await window.charmiq.oauth.getValidAuth({
  providerUrl: 'https://accounts.google.com',
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  connectionKey: account.id,   // ← targets exactly this account
});
```

- **`listAuth`** hands back descriptors with **no access token**, so the app can render every account (avatar, name, email) on load and rehydrate across a reload without a consent popup.
- **`getValidAuth({ connectionKey })`** mints a valid token for exactly the account named — never a Platform-chosen one — and the Platform refreshes it if it has expired. That is why the token is fetched *per account, per batch*, and never cached or refreshed in the app.
- **`prompt: 'select_account'`** (in `addAccount`) always shows Google's picker, so the user can add another account rather than reusing the first.
- Connections are **isolated to this Application** by the Platform; another app can't see or use them. The name and avatar come for free — the Platform auto-merges Google's userinfo scopes.


## Making It Read-Write (exercise for the reader)

The app is read-only on purpose. To make it write:

1. Widen `GMAIL_SCOPES` in [`gmail-oauth.ts`](charmiq://./src/gmail-oauth.ts) (e.g. add `.../auth/gmail.modify` or `.../auth/gmail.send`). No manifest change is needed — Google scopes are requested through the bridge, not declared in `requestedScopes`.
2. Add the mutating calls in [`gmail-client.ts`](charmiq://./src/gmail-client.ts) — the write-hooks section spells out `markAsRead`, `archive`, `trash`, and `send` as one-line POSTs, plus the `gmailPost` twin they need.
3. Wire a UI affordance (a button in `email-detail.tsx`) to call them.


## Running Locally

The app uses the CharmIQ bridge (OAuth, `appState`), which only exists inside the Platform. To run it in a plain browser during development, build it with the **local harness** injected:

```sh
# from platform/packages/cloud-functions
npm run build-app -- ../../../charmiq-apps/apps/gmail-inbox --harness --output /tmp/gmail-inbox.html
open /tmp/gmail-inbox.html
```

The harness ([`shared/charmiq-local`](charmiq://../../shared/charmiq-local)) stands in for `window.charmiq` — `appState` on `localStorage`, and an OAuth flow that prompts for a pasted access token (grab one from Google's [OAuth Playground](https://developers.google.com/oauthplayground/) with the `gmail.readonly` scope). It self-disables the moment a real bridge is present, so it can never ship in a Platform build.
