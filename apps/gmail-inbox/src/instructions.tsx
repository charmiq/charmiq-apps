/** @jsx h */
import { h } from './h';

// the first-run instructions, shown inline in the empty state (most people never
// scroll, so the how-to lives where the inbox will be). Collapsible — toggled by
// directly showing/hiding the steps, no framework state
// ********************************************************************************
export const Instructions = (): Node => {
  const steps = (
    <ol class="instructions-steps">
      <li>Click the <strong>person +</strong> button above and choose a Gmail account — pick one you've connected before, or connect a new one. The app never sees your password, only a read-only token.</li>
      <li>Add more accounts the same way; each one's inbox is merged into one list, newest first, tagged with its avatar.</li>
      <li>Pick an email on the left to read it on the right. Nothing is ever modified — this viewer is read-only by design.</li>
      <li>From the <strong>gear</strong> menu, <strong>Remove</strong> hides an account from this inbox (you can add it back anytime), while <strong>Disconnect</strong> revokes access entirely.</li>
    </ol>
  ) as HTMLElement;

  const toggle = (<button class="link-button">hide</button>) as HTMLButtonElement;
  let open = true;
  toggle.addEventListener('click', () => {
    open = !open;
    steps.style.display = open ? '' : 'none';
    toggle.textContent = open ? 'hide' : 'show';
  });

  return (
    <div class="instructions">
      <div class="instructions-head">
        <span class="instructions-title">Read-only Gmail, multiple accounts</span>
        {toggle}
      </div>
      {steps}
    </div>
  );
};
