import React, { useEffect, useRef, useState } from 'react';

import type { AppContentSnapshot } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;
import { append, canGuard, isConflict, records, remove, reread, snapshotOf, write, type TextRecord } from './records';

// ********************************************************************************
/** the block this Application reads and writes: the first */
const BLOCK = '[0]';

/** what the list shows: nothing yet, the block (its snapshot `null` where the page
 *  cannot guard edits), no block, or why the block cannot be read */
type View =
  | Readonly<{ kind: 'waiting'; }>
  | Readonly<{ kind: 'shown'; snapshot: AppContentSnapshot | null; records: TextRecord[]; }>
  | Readonly<{ kind: 'missing'; }>
  | Readonly<{ kind: 'unreadable'; reason: string; }>;

/** why a read failed, in the user's words */
const unreadable = (failure: unknown): View => ({
  kind: 'unreadable',
  reason: ((failure as { code?: unknown; } | null)?.code === 'functions/permission-denied') ? 'This Application isn\'t allowed to read the list.' : 'The list could not be read.',
});

// ================================================================================
export const App = () => {
  const appContent = window.charmiq.appContent;
  const [view, setView] = useState<View>({ kind: 'waiting' });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shownRef = useRef<AppContentSnapshot | null>(null/*the snapshot the list shows*/);
  const [uncertain, setUncertain] = useState(false/*a check failed; cleared by the next revision*/);

  // == Initialization ============================================================
  // a deletion notice, or a refused write, is a reason to check whether the block
  // is gone: a read of it by its id that finds nothing. The answer applies only
  // while the list still shows exactly the snapshot checked (the block may have
  // been restored, or another taken its place). A read that fails is an error,
  // never an absence, and it too is about the snapshot checked
  const confirmBlock = async (snapshot: AppContentSnapshot | null) => {
    if(!snapshot) return;
    let current: AppContentSnapshot | null;
    try {
      current = await reread(appContent, snapshot);
    } catch{
      const shown = shownRef.current;
      if((shown?.id === snapshot.id) && (shown.revision === snapshot.revision)) setUncertain(true);
      return;
    }
    if(current !== null) return;
    setView(shown => ((shown.kind === 'shown') && (shown.snapshot?.id === snapshot.id) && (shown.snapshot.revision === snapshot.revision)) ? { kind: 'missing' } : shown);
  };

  // the block is the truth: show what it holds, whoever changed it. Fires
  // immediately with the current value, then on every change -- including this
  // Application's own writes, which come back merged with everyone else's
  useEffect(() => {
    const sub = appContent.onChange$(BLOCK).subscribe({
      next: change => {
        if(change.deleted) { void confirmBlock(snapshotOf(change)); return; }
        shownRef.current = snapshotOf(change);
        setUncertain(false)/*a new revision: the block is there*/;
        setView({ kind: 'shown', snapshot: shownRef.current, records: records(change.content) });
      },
      error: failure => setView(unreadable(failure)),
    });

    // a block that does not exist sends no change: ask whether there is one
    appContent.snapshot?.(BLOCK).then(
      current => { if(!current) setView(shown => (shown.kind === 'waiting') ? { kind: 'missing' } : shown); },
      failure => setView(shown => (shown.kind === 'waiting') ? unreadable(failure) : shown)
    );
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, [appContent]/*run once on mount*/);

  // == Handlers ==================================================================
  // every write is measured on a snapshot and refused if the block has changed
  // since; the list changes when the block does, never before
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = draft.trim();
    if(!item || (view.kind !== 'shown')) return;
    setError(null);
    try {
      await append(appContent, view.snapshot, item)/*measured again if someone got there first*/;
      setDraft(current => (current.trim() === item) ? '' : current/*kept typing*/);
    } catch(failure) {
      setError(`"${item}" was not added. Try again.`);
      if(isConflict(failure)) await confirmBlock(view.snapshot);
    }
  };

  // the row's own snapshot: the one its span was measured on
  const removeItem = async (snapshot: AppContentSnapshot | null, record: TextRecord) => {
    setError(null);
    try {
      await write(appContent, snapshot, [remove(record)]);
    } catch(failure) {
      setError(isConflict(failure) ? `The list changed, so "${record.line}" was not removed. Check it and try again.` : `"${record.line}" was not removed. Try again.`);
      if(isConflict(failure)) await confirmBlock(snapshot);
    }
  };

  // == UI ========================================================================
  const editable = (view.kind === 'shown') && !!view.snapshot && canGuard(appContent);
  return (
    <div className="app">
      <h1>Shared List</h1>
      <form className="add" onSubmit={addItem}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an item" aria-label="New item" disabled={!editable} />
        <button type="submit" disabled={!editable}>Add</button>
      </form>
      {!canGuard(appContent) && <p className="notice">This page can't make safe edits. Reload it to edit the list.</p>}
      {(view.kind === 'missing') && <p className="notice">The list isn't in the document.</p>}
      {(view.kind === 'unreadable') && <p className="notice" role="alert">{view.reason}</p>}
      {uncertain && (view.kind === 'shown') && <p className="notice" role="alert">The list could not be checked. Reload to try again.</p>}
      {error && (view.kind === 'shown') && <p className="error" role="alert">{error}</p>}
      {(view.kind === 'shown') && (
        <ul className="items">
          {view.records.map(record => (
            <li key={record.from/*duplicates are separate records*/}>
              <span>{record.line}</span>
              <button type="button" onClick={() => removeItem(view.snapshot, record)} aria-label={`Remove ${record.line}`} disabled={!editable}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
