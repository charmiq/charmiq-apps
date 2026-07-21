import type { OAuthAuthDescriptor } from '../../../shared/charmiq';
import { extractBody, fetchInboxPage, getHeader } from './gmail-client';
import { disconnectAccount, pickAccount, resolveAccount, toDescriptor } from './gmail-oauth';
import type { GmailMessage, InboxEmail } from './types';

// the inbox model — all state and the async orchestration behind a plain
// subscribe/emit surface (no hooks, no framework). The views subscribe and rebuild
// their DOM from getState(); the command surface (LLM) drives the same actions, so
// an agent's navigation shows up live in the UI.
//
// Which accounts appear in this inbox is the User's choice, persisted as a set of
// Connection keys in app-state; the available Connections live server-side (the
// OAuth broker), never assumed
// ********************************************************************************
// == Types =======================================================================
export type InboxStatus = 'initializing' | 'ready' | 'error';

/** the immutable snapshot a view renders from */
export type InboxState = Readonly<{
  accounts: readonly OAuthAuthDescriptor[];
  emails: readonly InboxEmail[];
  selectedId: string | null;
  selectedEmail: InboxEmail | null;
  status: InboxStatus;
  error: string | null;
  hasMore: boolean;
  isBusy: boolean;
  query: string;
}>;

/** persisted app-state: the User's chosen accounts (by Connection key) and the
 *  open email. Only user choices live here — never the available Connection set */
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

// == Model =======================================================================
export class InboxModel {
  private accounts: OAuthAuthDescriptor[] = [];
  private emailsByAccount = new Map<string, InboxEmail[]>();
  private pageTokens = new Map<string, string | undefined>();
  private emails: InboxEmail[] = [];
  private selectedId: string | null = null;
  private status: InboxStatus = 'initializing';
  private error: string | null = null;
  private isBusy = false;
  private query = '';

  private readonly listeners = new Set<() => void>();

  // == Subscription ==============================================================
  /** subscribe to state changes; returns an unsubscribe */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void { for(const listener of this.listeners) listener(); }

  // == Snapshot ==================================================================
  public getState(): InboxState {
    const selectedEmail = this.selectedId ? (this.emails.find(email => email.id === this.selectedId) ?? null) : null;
    return {
      accounts: this.accounts,
      emails: this.emails,
      selectedId: this.selectedId,
      selectedEmail,
      status: this.status,
      error: this.error,
      isBusy: this.isBusy,
      query: this.query,
      hasMore: [...this.pageTokens.values()].some(Boolean),
    };
  }

  // == Internal ==================================================================
  private reaggregate(): void {
    const flat: InboxEmail[] = [];
    for(const list of this.emailsByAccount.values()) flat.push(...list);
    flat.sort(byNewest);
    this.emails = flat;
  }

  private setBusy(busy: boolean): void { this.isBusy = busy; this.emit(); }

  private persist(): void {
    void window.charmiq.appState.set({
      activeAccountIds: this.accounts.map(account => account.id),
      selectedEmailId: this.selectedId ?? undefined,
    } satisfies PersistedState).catch(error => console.error('gmail-inbox: persist failed', error));
  }

  /** load one account's first page (current query applied) into the per-account store */
  private async loadFirstPage(account: OAuthAuthDescriptor, accessToken: string): Promise<void> {
    const page = await fetchInboxPage(accessToken, undefined, this.query || undefined);
    this.emailsByAccount.set(account.id, page.messages.map(message => toInboxEmail(message, account)));
    this.pageTokens.set(account.id, page.nextPageToken);
  }

  /** resolve and load exactly the accounts the User chose. A Connection that no
   *  longer resolves (revoked / denied) drops from the view, not from the persisted
   *  set. Dedups by `providerAccountId` (one inbox per Google identity) */
  private async load(activeIds: readonly string[], restoreSelectionId?: string): Promise<void> {
    this.status = 'initializing';
    this.error = null;
    this.emit();

    this.emailsByAccount.clear();
    this.pageTokens.clear();

    try {
      const resolved = await Promise.all(activeIds.map(id =>
        resolveAccount(id).catch(error => { console.warn(`gmail-inbox: dropping account ${id}`, error); return null; })
      ));

      const seen = new Set<string>();
      const chosen = [];
      for(const auth of resolved) {
        if(!auth || seen.has(auth.providerAccountId)) continue;
        seen.add(auth.providerAccountId);
        chosen.push(auth);
      }

      await Promise.all(chosen.map(auth =>
        this.loadFirstPage(toDescriptor(auth), auth.accessToken).catch(error => console.warn(`gmail-inbox: inbox load failed for ${auth.id}`, error))
      ));

      this.accounts = chosen.map(toDescriptor);
      this.reaggregate();
      const restored = restoreSelectionId && this.emails.find(email => email.id === restoreSelectionId);
      this.selectedId = restored ? restored.id : (this.emails[0]?.id ?? null);
      this.status = 'ready';
    } catch(error) {
      this.error = error instanceof Error ? error.message : 'Failed to load the inbox';
      this.status = 'error';
    }
    this.emit();
  }

  // == Lifecycle =================================================================
  /** load the persisted accounts + selection */
  public async init(): Promise<void> {
    const persisted = (await window.charmiq.appState.get().catch(() => null)) as PersistedState | null;
    await this.load(persisted?.activeAccountIds ?? [], persisted?.selectedEmailId);
  }

  // == Actions ===================================================================
  /** open the Platform account picker (existing + connect-new) and add the choice */
  public async addAccount(): Promise<void> {
    this.setBusy(true);
    try {
      const auth = await pickAccount();
      if(this.accounts.some(account => account.providerAccountId === auth.providerAccountId)) return/*already here*/;

      const account = toDescriptor(auth);
      await this.loadFirstPage(account, auth.accessToken);
      this.accounts = [...this.accounts, account];
      this.persist();
      this.reaggregate();
      if(!this.selectedId) this.selectedId = this.emails[0]?.id ?? null;
    } catch(error) {
      console.warn('gmail-inbox: add account not completed', error)/*cancelled picker / denied consent is normal*/;
    } finally {
      this.setBusy(false);
    }
  }

  /** remove an account from this inbox (deselect) — non-destructive */
  public removeAccount(account: OAuthAuthDescriptor): void {
    this.emailsByAccount.delete(account.id);
    this.pageTokens.delete(account.id);
    this.accounts = this.accounts.filter(existing => existing.id !== account.id);
    this.persist();
    this.reaggregate();
    if(!this.selectedId || !this.emails.some(email => email.id === this.selectedId)) this.selectedId = this.emails[0]?.id ?? null;
    this.emit();
  }

  /** disconnect an account entirely (revoke), then drop it from the inbox */
  public async disconnectAccount(account: OAuthAuthDescriptor): Promise<void> {
    this.setBusy(true);
    try {
      await disconnectAccount(account);
      this.removeAccount(account);
    } catch(error) {
      this.error = error instanceof Error ? error.message : 'Failed to disconnect the account';
      this.emit();
    } finally {
      this.setBusy(false);
    }
  }

  public async refresh(): Promise<void> {
    this.setBusy(true);
    try { await this.load(this.accounts.map(account => account.id), this.selectedId ?? undefined); }
    finally { this.setBusy(false); }
  }

  public async loadMore(): Promise<void> {
    if(this.isBusy) return;
    const pending = this.accounts.filter(account => this.pageTokens.get(account.id));
    if(pending.length < 1) return;

    this.setBusy(true);
    try {
      await Promise.all(pending.map(async account => {
        const auth = await resolveAccount(account.id);
        const page = await fetchInboxPage(auth.accessToken, this.pageTokens.get(account.id), this.query || undefined);
        const existing = this.emailsByAccount.get(account.id) ?? [];
        this.emailsByAccount.set(account.id, [...existing, ...page.messages.map(message => toInboxEmail(message, account))]);
        this.pageTokens.set(account.id, page.nextPageToken);
      }));
      this.reaggregate();
    } catch(error) {
      this.error = error instanceof Error ? error.message : 'Failed to load more email';
    } finally {
      this.setBusy(false);
    }
  }

  /** select an email (drives the detail view + the LLM-watch experience) */
  public select(emailId: string): void {
    this.selectedId = emailId;
    this.persist();
    this.emit();
  }

  /** run a Gmail search (empty query clears it back to the inbox). Reloads every
   *  active account with the `q` applied */
  public async search(query: string): Promise<void> {
    this.query = query.trim();
    this.setBusy(true);
    try { await this.load(this.accounts.map(account => account.id), undefined); }
    finally { this.setBusy(false); }
  }

  // == Reads (for the command surface) ===========================================
  /** the full loaded email for an id, or null if it isn't loaded (list / search first) */
  public getEmail(emailId: string): InboxEmail | null {
    return this.emails.find(email => email.id === emailId) ?? null;
  }
}
