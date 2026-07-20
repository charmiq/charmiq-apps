/** @jsx h */
import { h } from 'preact';

import { Avatar } from './avatar';
import { formatListDate } from './format';
import type { InboxEmail } from './types';

// the master panel: every account's mail merged newest-first. Each row shows the
// owning account's avatar so a multi-account inbox stays legible
// ********************************************************************************
// == Props =======================================================================
type MasterListProps = Readonly<{
  emails: readonly InboxEmail[];
  selectedId: string | null;
  hasMore: boolean;
  busy: boolean;
  onSelect: (emailId: string) => void;
  onLoadMore: () => void;
}>;

// == Component ===================================================================
export const MasterList = ({ emails, selectedId, hasMore, busy, onSelect, onLoadMore }: MasterListProps) => {
  if(emails.length < 1) return <div class="placeholder">No email in these accounts.</div>;

  return (
    <div class="list">
      {emails.map(email => (
        <button
          key={email.id}
          class={`email-row${email.isUnread ? ' unread' : ''}${email.id === selectedId ? ' selected' : ''}`}
          onClick={() => onSelect(email.id)}
        >
          <div class="email-from">
            <Avatar account={email.account} size={20} />
            <span class="email-from-text">{email.from}</span>
            <span class="email-date">{formatListDate(email.dateHeader)}</span>
          </div>
          <div class="email-subject">{email.subject}</div>
          <div class="email-snippet">{email.snippet}</div>
        </button>
      ))}

      {hasMore && (
        <button class="load-more" disabled={busy} onClick={onLoadMore}>
          {busy ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
};
