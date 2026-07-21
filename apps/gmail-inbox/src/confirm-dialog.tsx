/** @jsx h */
import { h } from './h';

// a minimal confirmation modal as an imperative call: show it, resolve true/false
// when the user answers. No custom element, no extra scope — the app stays simple
// and runs identically under the local harness
// ********************************************************************************
type ConfirmOptions = Readonly<{
  title: string;
  message: string;
  confirmLabel?: string;
}>;

export const showConfirm = (options: ConfirmOptions): Promise<boolean> => new Promise(resolve => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const finish = (result: boolean): void => { overlay.remove(); resolve(result); };
  overlay.addEventListener('click', () => finish(false));

  overlay.appendChild(
    <div class="modal" onClick={(event: MouseEvent) => event.stopPropagation()}>
      <div class="modal-title">{options.title}</div>
      <div class="modal-message">{options.message}</div>
      <div class="modal-actions">
        <button class="button-secondary" onClick={() => finish(false)}>Cancel</button>
        <button class="button-danger" onClick={() => finish(true)}>{options.confirmLabel ?? 'Confirm'}</button>
      </div>
    </div>
  );

  document.body.appendChild(overlay);
});
