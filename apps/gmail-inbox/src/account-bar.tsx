/** @jsx h */
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { OAuthAuthDescriptor } from '../../../shared/charmiq';
import { Avatar } from './avatar';

// the master-panel header: the connected-account avatars, the add-account and
// refresh actions, and a gear menu to manage (remove) accounts
// ********************************************************************************
// == Props =======================================================================
type AccountBarProps = Readonly<{
  accounts: readonly OAuthAuthDescriptor[];
  busy: boolean;
  onAddAccount: () => void;
  onDisconnectAccount: (account: OAuthAuthDescriptor) => void;
  onRemoveAccount: (account: OAuthAuthDescriptor) => void;
  onRefresh: () => void;
}>;

// == Component ===================================================================
export const AccountBar = ({ accounts, busy, onAddAccount, onRefresh, onRemoveAccount, onDisconnectAccount }: AccountBarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // close the account menu on an outside click
  useEffect(() => {
    if(!menuOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      if(menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [menuOpen]);

  return (
    <div class="header">
      <div class="header-left">
        <div class="avatar-group">
          {accounts.map(account => <Avatar key={account.id} account={account} />)}
        </div>
        <h1>Inbox</h1>
      </div>

      <div class="header-actions" ref={menuRef}>
        <button class="icon-button" title="Add account" disabled={busy} onClick={onAddAccount}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21a8 8 0 0 1 13.292-6" /><circle cx="10" cy="8" r="5" /><path d="M19 16v6" /><path d="M22 19h-6" /></svg>
        </button>

        {(accounts.length > 0) && (
          <button class="icon-button" title="Refresh" disabled={busy} onClick={onRefresh}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
          </button>
        )}

        {(accounts.length > 0) && (
          <button class="icon-button" title="Manage accounts" onClick={(event: MouseEvent) => { event.stopPropagation(); setMenuOpen(open => !open); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        )}

        {menuOpen && (
          <div class="account-menu">
            <div class="account-menu-head">Accounts</div>
            {accounts.map(account => (
              <div class="account-menu-item" key={account.id}>
                <Avatar account={account} size={32} />
                <div class="account-menu-info">
                  <div class="account-menu-name">{account.displayName || account.displayIdentifier}</div>
                  <div class="account-menu-email">{account.displayIdentifier}</div>
                </div>
                <div class="account-menu-actions">
                  <button class="menu-button" title="Remove from this inbox" onClick={() => { setMenuOpen(false); onRemoveAccount(account); }}>Remove</button>
                  <button class="menu-button danger" title="Disconnect (revoke access)" onClick={() => { setMenuOpen(false); onDisconnectAccount(account); }}>Disconnect</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
