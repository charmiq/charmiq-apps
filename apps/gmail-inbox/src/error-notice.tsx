/** @jsx h */
import { h } from './h';

import type { InboxModel } from './inbox-model';

// the failure notice under the header: an action that failed while the inbox is
// usable (adding, disconnecting, loading more) says so here, until dismissed or the
// next attempt. A failure that leaves no inbox shows in the list itself
// ********************************************************************************
export const ErrorNotice = (model: InboxModel): Node => {
  const message = (<span class="error-notice-message" />) as HTMLElement;
  const dismissButton = (
    <button class="error-notice-dismiss" title="Dismiss" aria-label="Dismiss">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    </button>
  ) as HTMLButtonElement;
  const container = (<div class="error-notice" role="alert">{message}{dismissButton}</div>) as HTMLElement;

  dismissButton.addEventListener('click', () => model.dismissError());

  const render = (): void => {
    const { status, error } = model.getState();
    const shown = (status === 'ready') && (error !== null);
    container.style.display = shown ? '' : 'none';
    message.textContent = error ?? '';
  };

  model.subscribe(render);
  render();
  return container;
};
