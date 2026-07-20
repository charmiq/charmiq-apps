import { useEffect, useRef, useState } from 'preact/hooks';

import type { OAuthAuth, OAuthAuthDescriptor } from '../../../shared/charmiq';
import { extractBody, fetchInboxPage, getHeader } from './gmail-client';
import { disconnectAccount, pickAccount, resolveAccount, toDescriptor } from './gmail-oauth';
import type { GmailMessage, InboxEmail } from './types';

// the inbox controller — owns all state and the async orchestration. Which accounts
// appear in THIS inbox is the User's choice, persisted as a set of Connection keys
// in app-state; the available Connections themselves live server-side (the OAuth
// broker), never assumed. Components stay presentational
// ********************************************************************************
// == Types =======================================================================
export type InboxStatus = 'initializing' | 'ready' | 'error';

export type InboxController = Readonly<{
  accounts: readonly OAuthAuthDescriptor[];
  emails: readonly InboxEmail[];
  selectedId: string | null;
  selectedEmail: InboxEmail | null;
  status: InboxStatus;
  error: string | null;
  hasMore: boolean;
  isBusy: boolean;

  /** open the account picker and add the chosen account to this inbox */
  addAccount: () => Promise<void>;
  /** disconnect an account entirely — revoke the Connection, then drop it here */
  disconnectAccount: (account: OAuthAuthDescriptor) => Promise<void>;
  /** remove an account from THIS inbox — a deselect. Non-destructive: the
   *  Connection persists and can be re-added from the picker without re-authorizing */
  removeAccount: (account: OAuthAuthDescriptor) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  select: (emailId: string) => void;
}>;

// == App State ===================================================================
/** persisted app-state: the User's chosen accounts for this inbox (by Connection
 *  key) and the open email. Only user choices live here — never the available
 *  Connection set, which is server-side truth */
type PersistedState = Readonly<{ activeAccountIds?: string[]; selectedEmailId?: string; }>;

// == Message Mapping =============================================================
/** flatten a Gmail message into the app's display model, tagged with its account */
const toInboxEmail = (message: GmailMessage, account: OAuthAuthDescriptor): InboxEmail => {
  const headers = message.payload.headers;
  const body = extractBody(message.payload);
  const isHtml = body.trim().startsWith('<');
  return {
    id: message.id,
    account,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject') || '(No subject)',
    snippet: message.snippet,
    dateHeader: getHeader(headers, 'Date'),
    internalDate: Number(message.internalDate) || 0,
    isUnread: (message.labelIds ?? []).includes('UNREAD'),
    bodyHtml: isHtml ? body : null,
    bodyText: body,
  };
};

// newest first
const byNewest = (first: InboxEmail, second: InboxEmail): number => second.internalDate - first.internalDate;

// == Hook ========================================================================
export const useInbox = (): InboxController => {
  const [accounts, setAccounts] = useState<readonly OAuthAuthDescriptor[]>([]);
  const [emails, setEmails] = useState<readonly InboxEmail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<InboxStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // live mirrors for the callbacks (refs update synchronously; state does not)
  const accountsRef = useRef<readonly OAuthAuthDescriptor[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const emailsByAccount = useRef<Map<string, InboxEmail[]>>(new Map());
  const pageTokens = useRef<Map<string, string | undefined>>(new Map());

  const setAccountsBoth = (next: readonly OAuthAuthDescriptor[]): void => { accountsRef.current = next; setAccounts(next); };
  const setSelectedBoth = (next: string | null): void => { selectedIdRef.current = next; setSelectedId(next); };

  // ..............................................................................
  /** persist the User's current choices. Called only from explicit user actions —
   *  never from a load failure, so a transient consent-denial can't erase the set */
  const persist = (): void => {
    void window.charmiq.appState.set({
      activeAccountIds: accountsRef.current.map(account => account.id),
      selectedEmailId: selectedIdRef.current ?? undefined,
    } satisfies PersistedState).catch(error => console.error('gmail-inbox: persist failed', error));
  };

  // ..............................................................................
  /** recompute the flat, newest-first list from every account's messages */
  const reaggregate = (): readonly InboxEmail[] => {
    const flat: InboxEmail[] = [];
    for(const list of emailsByAccount.current.values()) flat.push(...list);
    flat.sort(byNewest);
    setEmails(flat);
    setHasMore([...pageTokens.current.values()].some(Boolean));
    return flat;
  };

  // ..............................................................................
  /** load one account's first page into the per-account store, using a token
   *  minted for exactly that account */
  const loadFirstPage = async (account: OAuthAuthDescriptor, accessToken: string): Promise<void> => {
    const page = await fetchInboxPage(accessToken);
    emailsByAccount.current.set(account.id, page.messages.map(message => toInboxEmail(message, account)));
    pageTokens.current.set(account.id, page.nextPageToken);
  };

  // == Load ======================================================================
  /** resolve and load exactly the accounts the User chose. A Connection that no
   *  longer resolves (revoked, or consent denied) is dropped from the view but NOT
   *  from the persisted set. Dedups by `providerAccountId` so the same Google
   *  account connected through two integrations is one inbox, not two */
  const load = async (activeIds: readonly string[], restoreSelectionId?: string): Promise<void> => {
    setStatus('initializing');
    setError(null);
    emailsByAccount.current.clear();
    pageTokens.current.clear();

    try {
      // mint a token + descriptor per chosen account; a failure drops just that one
      const resolved = await Promise.all(activeIds.map(id =>
        resolveAccount(id).catch(error => { console.warn(`gmail-inbox: dropping account ${id}`, error); return null; })
      ));

      // dedup by provider account (one inbox per Google identity)
      const seen = new Set<string>();
      const chosen: OAuthAuth[] = [];
      for(const auth of resolved) {
        if(!auth || seen.has(auth.providerAccountId)) continue;
        seen.add(auth.providerAccountId);
        chosen.push(auth);
      }

      // load each account's first page; a per-account failure leaves it empty, not errored
      await Promise.all(chosen.map(auth =>
        loadFirstPage(toDescriptor(auth), auth.accessToken).catch(error => console.warn(`gmail-inbox: inbox load failed for ${auth.id}`, error))
      ));

      setAccountsBoth(chosen.map(toDescriptor));
      const flat = reaggregate();
      const restored = restoreSelectionId && flat.find(email => email.id === restoreSelectionId);
      setSelectedBoth(restored ? restored.id : (flat[0]?.id ?? null));

      setStatus('ready');
    } catch(error) {
      setError(error instanceof Error ? error.message : 'Failed to load the inbox');
      setStatus('error');
    }
  };

  // == Actions ===================================================================
  /** open the Platform account picker (existing Connections + "connect new") and
   *  add the chosen account to this inbox */
  const addAccount = async (): Promise<void> => {
    setIsBusy(true);
    try {
      const auth = await pickAccount();
      if(accountsRef.current.some(account => account.providerAccountId === auth.providerAccountId)) return/*already in this inbox*/;

      const account = toDescriptor(auth);
      await loadFirstPage(account, auth.accessToken);
      setAccountsBoth([...accountsRef.current, account]);
      persist();

      const flat = reaggregate();
      if(!selectedIdRef.current) setSelectedBoth(flat[0]?.id ?? null);
    } catch(error) {
      // a cancelled picker or a denied consent is a normal outcome, not an inbox error
      console.warn('gmail-inbox: add account not completed', error);
    } finally {
      setIsBusy(false);
    }
  };

  // ..............................................................................
  /** remove an account from this inbox (deselect) — non-destructive, no revoke */
  const removeAccount = (account: OAuthAuthDescriptor): void => {
    emailsByAccount.current.delete(account.id);
    pageTokens.current.delete(account.id);
    setAccountsBoth(accountsRef.current.filter(existing => existing.id !== account.id));
    persist();

    const flat = reaggregate();
    if(!selectedIdRef.current || !flat.some(email => email.id === selectedIdRef.current)) setSelectedBoth(flat[0]?.id ?? null);
  };

  // ..............................................................................
  /** disconnect an account entirely (revoke), then drop it from the inbox */
  const disconnect = async (account: OAuthAuthDescriptor): Promise<void> => {
    setIsBusy(true);
    try {
      await disconnectAccount(account);
      removeAccount(account);
    } catch(error) {
      setError(error instanceof Error ? error.message : 'Failed to disconnect the account');
    } finally {
      setIsBusy(false);
    }
  };

  // ..............................................................................
  const refresh = async (): Promise<void> => {
    setIsBusy(true);
    try { await load(accountsRef.current.map(account => account.id), selectedIdRef.current ?? undefined); }
    finally { setIsBusy(false); }
  };

  // ..............................................................................
  const loadMore = async (): Promise<void> => {
    if(isBusy) return;
    const pending = accountsRef.current.filter(account => pageTokens.current.get(account.id));
    if(pending.length < 1) return;

    setIsBusy(true);
    try {
      await Promise.all(pending.map(async account => {
        const auth = await resolveAccount(account.id);
        const page = await fetchInboxPage(auth.accessToken, pageTokens.current.get(account.id));
        const existing = emailsByAccount.current.get(account.id) ?? [];
        emailsByAccount.current.set(account.id, [...existing, ...page.messages.map(message => toInboxEmail(message, account))]);
        pageTokens.current.set(account.id, page.nextPageToken);
      }));
      reaggregate();
    } catch(error) {
      setError(error instanceof Error ? error.message : 'Failed to load more email');
    } finally {
      setIsBusy(false);
    }
  };

  // ..............................................................................
  /** select an email and persist it so a reload reopens it */
  const select = (emailId: string): void => {
    setSelectedBoth(emailId);
    persist();
  };

  // == Init ======================================================================
  useEffect(() => {
    void (async () => {
      const persisted = (await window.charmiq.appState.get().catch(() => null)) as PersistedState | null;
      await load(persisted?.activeAccountIds ?? [], persisted?.selectedEmailId);
    })();
  }, []);

  const selectedEmail = selectedId ? (emails.find(email => email.id === selectedId) ?? null) : null;

  return {
    accounts, emails, selectedId, selectedEmail, status, error, hasMore, isBusy,
    addAccount, removeAccount, disconnectAccount: disconnect, refresh, loadMore, select,
  };
};
