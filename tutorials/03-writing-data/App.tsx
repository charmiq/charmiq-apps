import React, { useEffect, useState } from 'react';

import type { AppContent } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;

// ********************************************************************************
/** a refused write: the app-content changed since it was shown */
const isConflict = (failure: unknown) => (failure as { code?: unknown; } | null)?.code === 'app/content-conflict';

// ================================================================================
export const App = () => {
  const appContent = window.charmiq.appContent;
  const [content, setContent] = useState<AppContent | null>();
  const [failure, setFailure] = useState<Error & { code?: string; }>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const supported = !!appContent.content$/*a page opened before content$ has none*/;

  // == Initialization ============================================================
  // the list is the app-content: shown as it stands, whoever changed it -- this
  // Application's own writes included, which come back merged with everyone else's
  useEffect(() => {
    if(!supported) return;
    const sub = appContent.content$().subscribe({ next: setContent, error: setFailure });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, [appContent, supported]/*run once on mount*/);

  // == Handlers ==================================================================
  // every write is measured on the app-content shown and refused if it has changed
  // since; the list changes when the app-content does, never before
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = draft.trim();
    if(!item || !content) return;
    setError(null);
    try {
      await content.appendLine(item)/*measured again if someone got there first*/;
      setDraft(current => (current.trim() === item) ? '' : current/*kept typing*/);
    } catch{
      setError(`"${item}" was not added. Try again.`);
    }
  };

  // the row's own app-content: the one its line was shown from
  const removeItem = async (shown: AppContent, index: number) => {
    const line = shown.lines[index];
    setError(null);
    try {
      await shown.removeLine(index);
    } catch(refused) {
      setError(isConflict(refused) ? `The list changed, so "${line}" was not removed. Check it and try again.` : `"${line}" was not removed. Try again.`);
    }
  };

  // == UI ========================================================================
  const editable = supported && !failure && !!content;
  return (
    <div className="app">
      <h1>Shared List</h1>
      <form className="add" onSubmit={addItem}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="New item" disabled={!editable} />
        <button type="submit" disabled={!editable}>Add</button>
      </form>
      {!supported && <p className="notice">This page can't make safe edits. Reload it to edit the list.</p>}
      {failure && <p className="notice" role="alert">The list could not be read.</p>}
      {!failure && (content === null) && <p className="notice">The list isn't in the document.</p>}
      {error && content && <p className="error" role="alert">{error}</p>}
      {!failure && content && (
        <ul className="items">
          {content.lines.map((line, index) => line && (
            <li key={`${index}:${line}`/*duplicates are separate lines*/}>
              <span>{line}</span>
              <button type="button" onClick={() => removeItem(content, index)} aria-label={`Remove ${line}`} disabled={!editable}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
