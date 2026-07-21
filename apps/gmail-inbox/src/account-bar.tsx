/** @jsx h */
import { h } from './h';

import type { OAuthAuthDescriptor } from '../../../shared/charmiq';
import { Avatar } from './avatar';
import { showConfirm } from './confirm-dialog';
import type { InboxModel } from './inbox-model';

// the master-panel header: the connected-account avatars, add-account / refresh,
// and a gear menu to manage accounts. Subscribes to the model and rebuilds the
// dynamic parts (avatars, menu rows) directly — no framework state
// ********************************************************************************
export const AccountBar = (model: InboxModel): Node => {
  const avatarGroup = (<div class="avatar-group" />) as HTMLElement;
  const menuItems = (<div />) as HTMLElement;

  const addButton = (
    <button class="icon-button" title="Add account">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21a8 8 0 0 1 13.292-6" /><circle cx="10" cy="8" r="5" /><path d="M19 16v6" /><path d="M22 19h-6" /></svg>
    </button>
  ) as HTMLButtonElement;

  const refreshButton = (
    <button class="icon-button" title="Refresh">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
    </button>
  ) as HTMLButtonElement;

  const gearButton = (
    <button class="icon-button" title="Manage accounts">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
  ) as HTMLButtonElement;

  const menu = (
    <div class="account-menu">
      <div class="account-menu-head">Accounts</div>
      {menuItems}
    </div>
  ) as HTMLElement;

  const actions = (<div class="header-actions">{addButton}{refreshButton}{gearButton}{menu}</div>) as HTMLElement;
  const header = (
    <div class="header">
      <div class="header-left">{avatarGroup}<h1>Inbox</h1></div>
      {actions}
    </div>
  );

  // menu open/close, driven directly on the element
  let menuOpen = false;
  const setMenu = (open: boolean): void => { menuOpen = open; menu.style.display = open ? 'block' : 'none'; };
  setMenu(false);

  addButton.addEventListener('click', () => void model.addAccount());
  refreshButton.addEventListener('click', () => void model.refresh());
  gearButton.addEventListener('click', event => { event.stopPropagation(); setMenu(!menuOpen); });
  document.addEventListener('click', event => { if(menuOpen && !actions.contains(event.target as Node)) setMenu(false); });

  // == Menu Row ==================================================================
  const menuRow = (account: OAuthAuthDescriptor): Node => (
    <div class="account-menu-item">
      {Avatar({ account, size: 32 })}
      <div class="account-menu-info">
        <div class="account-menu-name">{account.displayName || account.displayIdentifier}</div>
        <div class="account-menu-email">{account.displayIdentifier}</div>
      </div>
      <div class="account-menu-actions">
        <button class="menu-button" title="Remove from this inbox" onClick={() => { setMenu(false); model.removeAccount(account); }}>Remove</button>
        <button
          class="menu-button danger"
          title="Disconnect (revoke access)"
          onClick={async () => {
            setMenu(false);
            const confirmed = await showConfirm({
              title: 'Disconnect account?',
              message: `Disconnect ${account.displayName || account.displayIdentifier}? This revokes access — you'll have to reconnect it to use it again. To just hide it here, use Remove.`,
              confirmLabel: 'Disconnect',
            });
            if(confirmed) void model.disconnectAccount(account);
          }}
        >Disconnect</button>
      </div>
    </div>
  );

  // == Render ====================================================================
  const render = (): void => {
    const { accounts, isBusy } = model.getState();

    avatarGroup.replaceChildren(...accounts.map(account => Avatar({ account })));
    menuItems.replaceChildren(...accounts.map(menuRow));

    const hasAccounts = accounts.length > 0;
    refreshButton.style.display = hasAccounts ? '' : 'none';
    gearButton.style.display = hasAccounts ? '' : 'none';
    addButton.disabled = isBusy;
    refreshButton.disabled = isBusy;
    if(!hasAccounts) setMenu(false);
  };

  model.subscribe(render);
  render();
  return header;
};
