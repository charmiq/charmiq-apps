/** @jsx h */
import { h } from 'preact';

import type { OAuthAuthDescriptor } from '../../../shared/charmiq';

// the per-account avatar — the provider's profile picture when present (Google
// returns one for free via the auto-merged userinfo scopes), else the account's
// initials, else the first letter of its identifier
// ********************************************************************************
// == Helpers =====================================================================
/** up to two initials from a display name, else the first letter of the identifier */
const initialsOf = (account: OAuthAuthDescriptor): string => {
  if(account.displayName) {
    return account.displayName
      .split(' ')
      .map(part => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  } /* else -- no display name; fall back to the identifier */
  return (account.displayIdentifier[0] ?? '?').toUpperCase();
};

// == Component ===================================================================
export const Avatar = ({ account, size = 32 }: { account: OAuthAuthDescriptor; size?: number; }) => {
  const title = account.displayName || account.displayIdentifier;
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` };
  return (
    <div class="avatar" style={style} title={title}>
      {account.displayAvatar
        ? <img src={account.displayAvatar} alt={title} />
        : initialsOf(account)}
    </div>
  );
};
