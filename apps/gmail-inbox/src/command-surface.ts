import type { OAuthAuthDescriptor } from '../../../shared/charmiq';
import type { InboxModel } from './inbox-model';
import type { InboxEmail } from './types';

// the LLM-facing command surface (`charmiq.command`). Every command drives the same
// InboxModel the UI renders, so an agent walking the inbox — searching, opening
// mail, loading more — shows up live on screen for the User to watch. Read-only:
// nothing here mutates mail (the read-write hooks live in gmail-client.ts).
//
// Per the platform guidance these handlers are tolerant of identifier slop (an
// accountId may be a Connection key, an email address, or a provider account id)
// and defensive about input shape (optional fields fall back sensibly)
// ********************************************************************************
// == Result Shapes ===============================================================
type AccountSummary = Readonly<{ id: string; email: string; name?: string; }>;
type EmailSummary = Readonly<{ id: string; from: string; subject: string; date: string; snippet: string; unread: boolean; account: string; }>;
type EmailFull = Readonly<{ id: string; from: string; to: string; subject: string; date: string; unread: boolean; account: string; body: string; }>;

// == Command Surface =============================================================
export class CommandSurface {
  private readonly model: InboxModel;

  public constructor(model: InboxModel) {
    this.model = model;
  }

  /** register the command surface — called once at startup */
  public init(): void {
    window.charmiq.exportCommands({
      listAccounts: () => this.listAccounts(),
      listEmails: ({ accountId, query }: { accountId?: string; query?: string; } = {}) => this.listEmails(accountId, query),
      getEmail: ({ emailId }: { emailId: string; }) => this.getEmail(emailId),
      selectEmail: ({ emailId }: { emailId: string; }) => this.selectEmail(emailId),
      loadMore: () => this.loadMore(),
      search: ({ query }: { query: string; }) => this.search(query),
    });
  }

  // == Read ======================================================================
  private listAccounts(): AccountSummary[] {
    return this.model.getState().accounts.map(toAccountSummary);
  }

  private async listEmails(accountId?: string, query?: string): Promise<EmailSummary[]> {
    if(query !== undefined) await this.model.search(query)/*a query re-runs the search — visible in the UI*/;
    const emails = this.model.getState().emails;
    const scoped = accountId ? emails.filter(email => matchesAccount(email, accountId)) : emails;
    return scoped.map(toEmailSummary);
  }

  private getEmail(emailId: string): EmailFull | null {
    const email = this.model.getEmail(emailId);
    return email ? toEmailFull(email) : null/*not loaded — list or search first*/;
  }

  // == Navigate ==================================================================
  /** open an email in the UI. Returns false if the id isn't in the loaded set */
  private selectEmail(emailId: string): boolean {
    if(!this.model.getEmail(emailId)) return false;
    this.model.select(emailId);
    return true;
  }

  private async loadMore(): Promise<number> {
    await this.model.loadMore();
    return this.model.getState().emails.length;
  }

  private async search(query: string): Promise<EmailSummary[]> {
    await this.model.search(query);
    return this.model.getState().emails.map(toEmailSummary);
  }
}

// == Mapping =====================================================================
const toAccountSummary = (account: OAuthAuthDescriptor): AccountSummary => ({
  id: account.id,
  email: account.displayIdentifier,
  name: account.displayName,
});

const toEmailSummary = (email: InboxEmail): EmailSummary => ({
  id: email.id,
  from: email.from,
  subject: email.subject,
  date: email.dateHeader,
  snippet: email.snippet,
  unread: email.isUnread,
  account: email.account.displayIdentifier,
});

const toEmailFull = (email: InboxEmail): EmailFull => ({
  id: email.id,
  from: email.from,
  to: email.to,
  subject: email.subject,
  date: email.dateHeader,
  unread: email.isUnread,
  account: email.account.displayIdentifier,
  body: email.bodyText,
});

/** tolerant account match: by Connection key, email address, or provider account id */
const matchesAccount = (email: InboxEmail, accountId: string): boolean => {
  const account = email.account;
  return (account.id === accountId) || (account.displayIdentifier === accountId) || (account.providerAccountId === accountId);
};
