/** @jsx h */
import { h } from 'preact';

// a minimal confirmation modal. Deliberately a plain Preact component, not a
// custom element — it needs no `charmiq://` load and no extra scope, so the app
// stays simple and runs identically under the local harness
// ********************************************************************************
type ConfirmDialogProps = Readonly<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}>;

export const ConfirmDialog = ({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }: ConfirmDialogProps) => {
  if(!open) return null;

  return (
    <div class="modal-overlay" onClick={onCancel}>
      <div class="modal" onClick={(event: MouseEvent) => event.stopPropagation()}>
        <div class="modal-title">{title}</div>
        <div class="modal-message">{message}</div>
        <div class="modal-actions">
          <button class="button-secondary" onClick={onCancel}>Cancel</button>
          <button class="button-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};
