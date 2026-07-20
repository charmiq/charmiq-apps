import type { OAuthAuthDescriptor } from '../../../shared/charmiq';

// shared shapes for the Gmail Inbox app
// ********************************************************************************
// == Gmail API ===================================================================
/** a single header on a Gmail message payload */
export type GmailHeader = Readonly<{ name: string; value: string; }>;

/** a Gmail message payload part (recursive — multipart messages nest) */
export type GmailPayload = Readonly<{
  mimeType?: string;
  headers?: readonly GmailHeader[];
  body?: Readonly<{ data?: string; size?: number; }>;
  parts?: readonly GmailPayload[];
}>;

/** the `format=full` Gmail message shape (only the fields the app reads) */
export type GmailMessage = Readonly<{
  id: string;
  threadId: string;
  labelIds?: readonly string[];
  snippet: string;
  internalDate: string/*ms-since-epoch as a string, per the Gmail API*/;
  payload: GmailPayload;
}>;

// == App View Model ==============================================================
/** one email flattened for display — the fields the master list and detail pane
 *  render, plus the owning account (for the per-account avatar) and its
 *  Connection key (for read-then-token operations). `bodyHtml` is `null` for a
 *  plain-text message; render `snippet`/plain text in that case */
export type InboxEmail = Readonly<{
  id: string;
  account: OAuthAuthDescriptor;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  dateHeader: string/*raw `Date` header, for display formatting*/;
  internalDate: number/*ms-since-epoch, for sorting*/;
  isUnread: boolean;
  bodyHtml: string | null;
  bodyText: string;
}>;
