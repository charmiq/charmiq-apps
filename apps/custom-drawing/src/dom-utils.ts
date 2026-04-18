// shared DOM helpers used across dropdown/toolbar components
// ********************************************************************************
// == Outside-Click Dropdown Close ================================================
/** installs a document-level click listener that closes the given dropdown
 *  (removing `.visible`) and deactivates the trigger button (removing
 *  `.active`) whenever a click lands outside both. Returns a disposer that removes
 *  the listener -- callers should invoke it on teardown if the component can be
 *  re-initialized */
export const closeOnClickOutside = (button: HTMLElement, dropdown: HTMLElement): (() => void) => {
  const handler = (e: MouseEvent) => {
    if(button.contains(e.target as Node) || dropdown.contains(e.target as Node)) return;
    dropdown.classList.remove('visible');
    button.classList.remove('active');
  };
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
};
