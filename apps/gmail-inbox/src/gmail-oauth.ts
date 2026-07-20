import type { OAuthAuth, OAuthAuthDescriptor } from '../../../shared/charmiq';

// the OAuth account layer — the only module that talks to the OAuth bridge. It
// keeps NO token in memory: a token for one account is minted just-in-time right
// before a batch of Gmail calls, and the Platform refreshes an expired token
// behind that call, so there is no client-side refresh or expiry bookkeeping.
//
// The app never assumes an existing Connection. Which accounts appear in THIS
// inbox is the User's choice, persisted as a set of Connection keys in app-state
// (see use-inbox.ts). This layer only:
//   pickAccount()               → the Platform account picker (existing / new)
//   resolveAccount(connectionKey) → a fresh token + descriptor for one chosen account
//   disconnectAccount(descriptor) → revoke the Connection entirely
// ********************************************************************************
// == Constants ===================================================================
const GOOGLE_PROVIDER_URL = 'https://accounts.google.com';

/** the Google scopes the app requests. Read-only Gmail is all it needs; the
 *  Platform auto-merges the provider's userinfo scopes, so `displayName` /
 *  `displayAvatar` arrive on each account for free. To make the app read-write,
 *  widen this (e.g. add `.../auth/gmail.modify` or `.../auth/gmail.send`) and add
 *  the mutating calls in gmail-client.ts */
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// == Account Picking =============================================================
/** show the Platform's account picker (already-connected accounts plus a "connect
 *  new account" option) and return the account the User chose. `select_account`
 *  always shows the picker, so an existing Connection is never assumed — the User
 *  decides which account this inbox uses (or connects a new one) */
export const pickAccount = (): Promise<OAuthAuth> =>
  window.charmiq.oauth.getValidAuth({ providerUrl: GOOGLE_PROVIDER_URL, scopes: GMAIL_SCOPES, prompt: 'select_account' });

// == Account Resolution ==========================================================
/** resolve one chosen account by its Connection key: a fresh access token plus its
 *  current descriptor (email / name / avatar). Called per active account on load
 *  and before each batch of Gmail calls. Rejects if the Connection no longer
 *  exists (revoked elsewhere) or the user denied consent — the caller catches that
 *  and drops the account from the view rather than spinning.
 *
 *  No `scopes` are passed on this targeted path: the Connection already carries the
 *  scopes it was created with, and requesting scopes here would trigger a coverage
 *  check that rejects. To add scopes, run the connect flow ({@link pickAccount}) */
export const resolveAccount = (connectionKey: string): Promise<OAuthAuth> =>
  window.charmiq.oauth.getValidAuth({ providerUrl: GOOGLE_PROVIDER_URL, connectionKey });

// == Account Lifecycle ===========================================================
/** disconnect an account entirely — revoke the stored Connection. Heavier than
 *  removing it from the inbox (which just deselects it); re-adding a disconnected
 *  account needs a fresh authorization */
export const disconnectAccount = (account: OAuthAuthDescriptor): Promise<void> =>
  window.charmiq.oauth.revokeAuth(account);

// == Helpers =====================================================================
/** the token-less descriptor for a resolved auth (drop the access token before it
 *  reaches display or persisted state) */
export const toDescriptor = ({ accessToken: _accessToken/*stripped*/, ...descriptor }: OAuthAuth): OAuthAuthDescriptor => descriptor;
