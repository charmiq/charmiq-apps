import React, { useEffect, useState } from 'react';

import type { AppContentBlock } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;

// ********************************************************************************
/** a refused write: the block changed since it was shown */
const isConflict = (failure: unknown) => (failure as { code?: unknown; } | null)?.code === 'app/content-conflict';

// ================================================================================
export const App = () => {
  const appContent = window.charmiq.appContent;
  const [block, setBlock] = useState<AppContentBlock | null>();
  const [failure, setFailure] = useState<Error & { code?: string; }>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const supported = !!appContent.block$/*a page opened before blocks has none*/;

  // == Initialization ============================================================
  // the list is the block: shown as it stands, whoever changed it -- this
  // Application's own writes included, which come back merged with everyone else's
  useEffect(() => {
    if(!supported) return;
    const sub = appContent.block$().subscribe({ next: setBlock, error: setFailure });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, [appContent, supported]/*run once on mount*/);

  // == Handlers ==================================================================
  // every write is measured on the block shown and refused if it has changed since;
  // the list changes when the block does, never before
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = draft.trim();
    if(!item || !block) return;
    setError(null);
    try {
      await block.appendLine(item)/*measured again if someone got there first*/;
      setDraft(current => (current.trim() === item) ? '' : current/*kept typing*/);
    } catch{
      setError(`"${item}" was not added. Try again.`);
    }
  };

  // the row's own block: the one its line was shown from
  const removeItem = async (shown: AppContentBlock, index: number) => {
    const line = shown.lines[index];
    setError(null);
    try {
      await shown.removeLine(index);
    } catch(refused) {
      setError(isConflict(refused) ? `The list changed, so "${line}" was not removed. Check it and try again.` : `"${line}" was not removed. Try again.`);
    }
  };

  // == UI ========================================================================
  const editable = supported && !failure && !!block;
  return (
    <div className="app">
      <h1>Shared List</h1>
      <form className="add" onSubmit={addItem}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="New item" disabled={!editable} />
        <button type="submit" disabled={!editable}>Add</button>
      </form>
      {!supported && <p className="notice">This page can't make safe edits. Reload it to edit the list.</p>}
      {failure && <p className="notice" role="alert">{(failure.code === 'functions/permission-denied') ? 'This Application isn\'t allowed to read the list.' : 'The list could not be read.'}</p>}
      {!failure && (block === null) && <p className="notice">The list isn't in the document.</p>}
      {error && block && <p className="error" role="alert">{error}</p>}
      {!failure && block && (
        <ul className="items">
          {block.lines.map((line, index) => line && (
            <li key={`${index}:${line}`/*duplicates are separate lines*/}>
              <span>{line}</span>
              <button type="button" onClick={() => removeItem(block, index)} aria-label={`Remove ${line}`} disabled={!editable}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
