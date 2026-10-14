import type { CharmIQCommandService } from '../../../shared/charmiq-services';

// thin wrappers around the host's notification Commands so apps don't
// reach for `alert()` or bury failures in `console.error`
// ********************************************************************************
// == Modal =======================================================================
/** Emits an error modal via the host's notification command. Logs (rather than
 *  throws) if the emit itself fails -- a broken notification pipeline must
 *  not mask the original error that prompted the call */
export const notifyError = (cmd: CharmIQCommandService, title: string, description?: string): void => {
  emit(cmd, { id: 'notification.modal.emit', args: { status: 'error', title, description } }, 'notifyError');
};

export const notifyWarning = (cmd: CharmIQCommandService, title: string, description?: string): void => {
  emit(cmd, { id: 'notification.modal.emit', args: { status: 'warning', title, description } }, 'notifyWarning');
};

// == Toast =======================================================================
export const toastError = (cmd: CharmIQCommandService, title: string, description?: string): void => {
  emit(cmd, { id: 'notification.toast.emit', args: { status: 'error', title, description } }, 'toastError');
};

// == Internal ====================================================================
/** executes the notification Command, logging any failure: one thrown while
 *  sending included (a service without `execute`) */
const emit = (cmd: CharmIQCommandService, command: Parameters<CharmIQCommandService['execute']>[0], label: string): void => {
  Promise.resolve().then(() => cmd.execute(command))
    .catch(err => console.error(`${label} failed:`, err));
};
