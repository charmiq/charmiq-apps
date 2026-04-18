// thin wrappers around the host's notification Commands so apps don't
// reach for `alert()` or bury failures in `console.error`
// ********************************************************************************
// duck-typed to avoid coupling this file to the evolving CharmIQ services shape;
// replace with the shared services typing when it lands
interface CommandService { execute(req: { id: string; args?: unknown }): Promise<unknown>; }

// == Modal =======================================================================
/** Emits an error modal via the host's notification command. Logs (rather than
 *  throws) if the emit itself fails -- a broken notification pipeline must
 *  not mask the original error that prompted the call */
export const notifyError = (cmd: CommandService, title: string, description?: string): void => {
  cmd.execute({ id: 'notification.modal.emit', args: { status: 'error', title, description } })
    .catch(err => console.error('notifyError failed:', err));
};

export const notifyWarning = (cmd: CommandService, title: string, description?: string): void => {
  cmd.execute({ id: 'notification.modal.emit', args: { status: 'warning', title, description } })
    .catch(err => console.error('notifyWarning failed:', err));
};

// == Toast =======================================================================
export const toastError = (cmd: CommandService, title: string, description?: string): void => {
  cmd.execute({ id: 'notification.toast.emit', args: { status: 'error', title, description } })
    .catch(err => console.error('toastError failed:', err));
};
