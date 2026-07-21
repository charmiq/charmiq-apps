/** @jsx h */
import { h } from './h';

import type { InboxModel } from './inbox-model';

// the master search box — the same Gmail `q` the command API uses. Debounced as the
// User types; kept in sync with the model's query when not focused, so a search the
// LLM runs visibly fills the box. Shown only once there's an account to search
// ********************************************************************************
const DEBOUNCE_MS = 350;

export const SearchBar = (model: InboxModel): Node => {
  const input = (<input class="search-input" type="text" placeholder="Search mail — from:, is:unread, newer_than:7d, …" />) as HTMLInputElement;
  const container = (<div class="search-bar">{input}</div>) as HTMLElement;

  let timer: number | undefined;
  const run = (): void => { void model.search(input.value); };

  input.addEventListener('input', () => {
    if(timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if(event.key !== 'Enter') return;
    if(timer !== undefined) clearTimeout(timer);
    run();
  });

  const render = (): void => {
    const { accounts, query } = model.getState();
    container.style.display = accounts.length > 0 ? '' : 'none';
    // reflect a query set elsewhere (e.g. the LLM's search) without stomping typing
    if((document.activeElement !== input) && (input.value !== query)) input.value = query;
  };

  model.subscribe(render);
  render();
  return container;
};
