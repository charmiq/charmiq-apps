/** @jsx h */
import { h } from './h';

import type { InboxModel } from './inbox-model';

// the master search box — the same Gmail `q` the command API uses. Debounced as the
// User types; kept in sync with the model's query when not focused, so a search the
// LLM runs visibly fills the box. A clear (×) button appears while there's text.
// Shown only once there's an account to search
// ********************************************************************************
const DEBOUNCE_MS = 350;

export const SearchBar = (model: InboxModel): Node => {
  const input = (<input class="search-input" type="text" placeholder="Search mail — from:, is:unread, newer_than:7d, …" />) as HTMLInputElement;
  const clearButton = (
    <button class="search-clear" title="Clear search" aria-label="Clear search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    </button>
  ) as HTMLButtonElement;
  const container = (<div class="search-bar"><div class="search-field">{input}{clearButton}</div></div>) as HTMLElement;

  let timer: number | undefined;
  const run = (): void => { void model.search(input.value); };
  const syncClear = (): void => { clearButton.style.display = input.value ? 'flex' : 'none'; };

  input.addEventListener('input', () => {
    syncClear();
    if(timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if(event.key !== 'Enter') return;
    if(timer !== undefined) clearTimeout(timer);
    run();
  });

  clearButton.addEventListener('click', () => {
    input.value = '';
    syncClear();
    if(timer !== undefined) clearTimeout(timer);
    void model.search('');
    input.focus();
  });

  const render = (): void => {
    const { accounts, query } = model.getState();
    container.style.display = accounts.length > 0 ? '' : 'none';
    // reflect a query set elsewhere (e.g. the LLM's search) without stomping typing
    if((document.activeElement !== input) && (input.value !== query)) input.value = query;
    syncClear();
  };

  model.subscribe(render);
  render();
  return container;
};
