import type { GmailHeader, GmailMessage, GmailPayload } from './types';

// read-only Gmail REST client. Every call takes an access token the caller minted
// just-in-time from the OAuth bridge (see gmail-oauth.ts) — this module never
// touches the bridge or caches a token, so it is trivial to unit-test and reuse.
//
// Gmail's REST API sends permissive CORS headers, so these run as a direct
// `fetch` with the bearer token. An API that rejected a cross-origin call from
// the app's null origin would instead go through `window.charmiq.fetch` (the
// Platform CORS proxy)
// ********************************************************************************
// == Constants ===================================================================
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** how many message ids to pull per page */
export const PAGE_SIZE = 20;

// == Types =======================================================================
/** one page of the inbox: the fully-hydrated messages plus the cursor to the next
 *  page (`undefined` when the inbox is exhausted) */
export type MessagePage = Readonly<{
  messages: readonly GmailMessage[];
  nextPageToken?: string;
}>;

// == Read =======================================================================
/** fetch one page of messages, fully hydrated (`format=full`). With no `query` it
 *  lists the inbox; with a `query` it runs a Gmail search across all mail using the
 *  same syntax as the Gmail search box (`from:`, `is:unread`, `newer_than:7d`, free
 *  text, …). The list endpoint returns ids only, so each id is expanded in parallel */
export const fetchInboxPage = async (accessToken: string, pageToken?: string, query?: string): Promise<MessagePage> => {
  const params = new URLSearchParams({ maxResults: String(PAGE_SIZE) });
  if(query) params.set('q', query);
  else params.set('labelIds', 'INBOX');
  if(pageToken) params.set('pageToken', pageToken);

  const list = await gmailGet<{ messages?: Array<{ id: string; }>; nextPageToken?: string; }>(accessToken, `/messages?${params}`);
  if(!list.messages || (list.messages.length < 1)) return { messages: [], nextPageToken: undefined };

  const messages = await Promise.all(list.messages.map(({ id }) => fetchMessage(accessToken, id)));
  return { messages, nextPageToken: list.nextPageToken };
};

// --------------------------------------------------------------------------------
/** fetch a single message in full */
export const fetchMessage = (accessToken: string, id: string): Promise<GmailMessage> =>
  gmailGet<GmailMessage>(accessToken, `/messages/${id}?format=full`);

// == Write hooks (exercise for the reader) =======================================
// The app is deliberately read-only. To make it read-write, widen the OAuth scope
// (see GMAIL_SCOPES in gmail-oauth.ts) and add the mutating calls here — each is a
// POST to the same base with the same bearer token. For example:
//
//   /** mark a message read by removing the UNREAD label. Needs the
//    *  'https://www.googleapis.com/auth/gmail.modify' scope */
//   export const markAsRead = (accessToken: string, id: string): Promise<GmailMessage> =>
//     gmailPost<GmailMessage>(accessToken, `/messages/${id}/modify`, { removeLabelIds: ['UNREAD'] });
//
//   archive:  POST /messages/{id}/modify  { removeLabelIds: ['INBOX'] }   (gmail.modify)
//   trash:    POST /messages/{id}/trash                                   (gmail.modify)
//   send:     POST /messages/send         { raw: <base64url RFC-2822> }   (gmail.send)
//
// A `gmailPost` twin of `gmailGet` below is all the plumbing that is missing.

// == HTTP ========================================================================
/** a GET against the Gmail API with the bearer token; throws on a non-2xx */
const gmailGet = async <T>(accessToken: string, path: string): Promise<T> => {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if(!response.ok) throw new Error(`Gmail API ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
};

// == Message Parsing =============================================================
/** the value of a named header (case-insensitive), or `''` when absent */
export const getHeader = (headers: readonly GmailHeader[] | undefined, name: string): string => {
  const header = headers?.find(candidate => candidate.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : '';
};

// --------------------------------------------------------------------------------
/** decode a base64url-encoded UTF-8 body part; returns the input unchanged if it
 *  is not valid base64url (defensive — malformed parts should not throw) */
export const decodeBase64Url = (data: string): string => {
  try {
    return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch(error) {
    return data;
  }
};

// --------------------------------------------------------------------------------
/** extract the best displayable body from a payload — prefers `text/html` (richer
 *  rendering) over `text/plain`, recursing through multipart parts. Returns `''`
 *  when no textual body is present */
export const extractBody = (payload: GmailPayload | undefined): string => {
  if(!payload) return '';

  if(payload.body && payload.body.data) return decodeBase64Url(payload.body.data);

  if(payload.parts) {
    const html = payload.parts.find(part => (part.mimeType === 'text/html') && part.body?.data);
    if(html) return decodeBase64Url(html.body!.data!);

    const plain = payload.parts.find(part => (part.mimeType === 'text/plain') && part.body?.data);
    if(plain) return decodeBase64Url(plain.body!.data!);

    for(const part of payload.parts) {
      const nested = extractBody(part);
      if(nested) return nested;
    } /* else -- no textual part anywhere in this subtree */
  } /* else -- leaf payload with no inline body data */

  return '';
};
