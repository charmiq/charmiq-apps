import type { CharmIQCommandService } from '../../../shared/charmiq-services';

// thin wrappers around the host's notification Commands so apps don't
// reach for `alert()` or bury failures in `console.error`
// ********************************************************************************
// == Modal =======================================================================
/** Emits an error modal via the host's notification command. Logs (rather than
 *  throws) if the emit itself fails -- a broken notification pipeline must
 *  not mask the original error that prompted the call */
export const notifyError = (cmd: CharmIQCommandService, title: string, description?: string): void => {
  cmd.execute({ id: 'notification.modal.emit', args: { status: 'error', title, description } })
    .catch(err => console.error('notifyError failed:', err));
};

export const notifyWarning = (cmd: CharmIQCommandService, title: string, description?: string): void => {
  cmd.execute({ id: 'notification.modal.emit', args: { status: 'warning', title, description } })
    .catch(err => console.error('notifyWarning failed:', err));
};

// == Toast =======================================================================
export const toastError = (cmd: CharmIQCommandService, title: string, description?: string): void => {
  cmd.execute({ id: 'notification.toast.emit', args: { status: 'error', title, description } })
    .catch(err => console.error('toastError failed:', err));
};
