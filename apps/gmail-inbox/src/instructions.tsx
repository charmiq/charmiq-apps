/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';

// the first-run instructions, shown inline in the empty state (most people never
// scroll, so the how-to lives right where the inbox will be). Collapsible once
// read
// ********************************************************************************
export const Instructions = () => {
  const [open, setOpen] = useState(true);

  return (
    <div class="instructions">
      <div class="instructions-head">
        <span class="instructions-title">Read-only Gmail, multiple accounts</span>
        <button class="link-button" onClick={() => setOpen(value => !value)}>
          {open ? 'hide' : 'show'}
        </button>
      </div>
      {open && (
        <ol class="instructions-steps">
          <li>Click the <strong>person +</strong> button above and choose a Gmail account — pick one you've connected before, or connect a new one. The app never sees your password, only a read-only token.</li>
          <li>Add more accounts the same way; each one's inbox is merged into one list, newest first, tagged with its avatar.</li>
          <li>Pick an email on the left to read it on the right. Nothing is ever modified — this viewer is read-only by design.</li>
          <li>From the <strong>gear</strong> menu, <strong>Remove</strong> hides an account from this inbox (you can add it back anytime), while <strong>Disconnect</strong> revokes access entirely.</li>
        </ol>
      )}
    </div>
  );
};
