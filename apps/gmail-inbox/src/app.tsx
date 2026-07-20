/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';

import type { OAuthAuthDescriptor } from '../../../shared/charmiq';
import { AccountBar } from './account-bar';
import { ConfirmDialog } from './confirm-dialog';
import { EmailDetail } from './email-detail';
import { Instructions } from './instructions';
import { MasterList } from './master-list';
import { useInbox } from './use-inbox';

// the top-level app: the inbox controller wired into a master-detail layout.
// Removing an account from the inbox is a plain deselect (instant); disconnecting
// it (revoke) is destructive, so that one is behind a confirmation
// ********************************************************************************
export const App = () => {
  const inbox = useInbox();
  const [pendingDisconnect, setPendingDisconnect] = useState<OAuthAuthDescriptor | null>(null);

  const confirmDisconnect = (): void => {
    if(pendingDisconnect) void inbox.disconnectAccount(pendingDisconnect);
    setPendingDisconnect(null);
  };

  return (
    <div class="app">
      <div class="master-panel">
        <AccountBar
          accounts={inbox.accounts}
          busy={inbox.isBusy}
          onAddAccount={inbox.addAccount}
          onDisconnectAccount={setPendingDisconnect}
          onRemoveAccount={inbox.removeAccount}
          onRefresh={inbox.refresh}
        />
        <div class="master-body">
          {(inbox.status === 'initializing') && (
            <div class="placeholder"><div class="spinner" />Checking connections…</div>
          )}
          {(inbox.status === 'error') && <div class="error">⚠ {inbox.error}</div>}
          {(inbox.status === 'ready') && (inbox.accounts.length < 1) && (
            <div class="empty"><Instructions /></div>
          )}
          {inbox.status === 'ready' && (inbox.accounts.length > 0) && (
            <MasterList
              emails={inbox.emails}
              selectedId={inbox.selectedId}
              hasMore={inbox.hasMore}
              busy={inbox.isBusy}
              onSelect={inbox.select}
              onLoadMore={inbox.loadMore}
            />
          )}
        </div>
      </div>

      <div class="detail-panel">
        <EmailDetail email={inbox.selectedEmail} />
      </div>

      <ConfirmDialog
        open={pendingDisconnect !== null}
        title="Disconnect account?"
        message={`Disconnect ${pendingDisconnect?.displayName || pendingDisconnect?.displayIdentifier || 'this account'}? This revokes access — you'll have to reconnect it to use it again. To just hide it here, use Remove.`}
        confirmLabel="Disconnect"
        onConfirm={confirmDisconnect}
        onCancel={() => setPendingDisconnect(null)}
      />
    </div>
  );
};
