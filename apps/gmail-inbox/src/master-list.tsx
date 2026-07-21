/** @jsx h */
import { h } from './h';

import { Avatar } from './avatar';
import { formatListDate } from './format';
import { Instructions } from './instructions';
import type { InboxModel, InboxState } from './inbox-model';
import type { InboxEmail } from './types';

// the master panel body: every account's mail merged newest-first, or a structural
// state (checking / error / empty / no-results). Selection only toggles a class, so
// clicking a row never rebuilds the list (scroll position is preserved); the list
// is rebuilt only when the email set itself changes
// ********************************************************************************
export const MasterList = (model: InboxModel): Node => {
  const container = (<div class="master-body" />) as HTMLElement;

  let renderedEmails: readonly InboxEmail[] | null = null;
  let rowsById = new Map<string, HTMLElement>();
  let loadMoreButton: HTMLButtonElement | null = null;

  // ..............................................................................
  const buildRow = (email: InboxEmail): HTMLElement => {
    const row = (
      <button class="email-row" onClick={() => model.select(email.id)}>
        <div class="email-from">
          {Avatar({ account: email.account, size: 20 })}
          <span class="email-from-text">{email.from}</span>
          <span class="email-date">{formatListDate(email.dateHeader)}</span>
        </div>
        <div class="email-subject">{email.subject}</div>
        <div class="email-snippet">{email.snippet}</div>
      </button>
    ) as HTMLElement;
    if(email.isUnread) row.classList.add('unread');
    return row;
  };

  // ..............................................................................
  /** the non-list states — reset the list bookkeeping and show a single placeholder */
  const structural = (state: InboxState): Node | null => {
    if(state.status === 'initializing') return <div class="placeholder"><div class="spinner" />Checking connections…</div>;
    if(state.status === 'error') return <div class="error">⚠ {state.error}</div>;
    if(state.accounts.length < 1) return <div class="empty">{Instructions()}</div>;
    if(state.emails.length < 1) return <div class="placeholder">{state.query ? 'No matching email.' : 'No email in these accounts.'}</div>;
    return null;
  };

  // == Render ====================================================================
  const render = (): void => {
    const state = model.getState();

    const placeholder = structural(state);
    if(placeholder) {
      renderedEmails = null;
      rowsById = new Map();
      loadMoreButton = null;
      container.replaceChildren(placeholder);
      return;
    }

    // rebuild the list only when the email set actually changed (not on a selection)
    if(state.emails !== renderedEmails) {
      renderedEmails = state.emails;
      rowsById = new Map();
      const scrollTop = container.scrollTop/*preserve across an append (Load more)*/;

      const list = (<div class="list" />) as HTMLElement;
      for(const email of state.emails) {
        const row = buildRow(email);
        rowsById.set(email.id, row);
        list.appendChild(row);
      }

      if(state.hasMore) {
        loadMoreButton = (<button class="load-more" onClick={() => void model.loadMore()}>Load more</button>) as HTMLButtonElement;
        list.appendChild(loadMoreButton);
      } else {
        loadMoreButton = null;
      }

      container.replaceChildren(list);
      container.scrollTop = scrollTop;
    }

    if(loadMoreButton) {
      loadMoreButton.disabled = state.isBusy;
      loadMoreButton.textContent = state.isBusy ? 'Loading…' : 'Load more';
    }

    for(const [id, row] of rowsById) row.classList.toggle('selected', id === state.selectedId);
  };

  model.subscribe(render);
  render();
  return container;
};
