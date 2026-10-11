import type { AppContentAPI, AppContentChange, AppContentSnapshot, ContentChange } from '../../shared/charmiq';

// an app-content block as records: one record per line. Every write is a whole
// line -- inserted or deleted -- measured on the snapshot it was read from, and
// applied only while the block is still exactly that
// ********************************************************************************
/** one record: its line, and the span it occupies (the line and its newline) */
export type TextRecord = Readonly<{ line: string; from: number; to: number; }>;

// == Read ========================================================================
/** the block's records, in order; a blank line is not a record */
export const records = (text: string): TextRecord[] => {
  const found: TextRecord[] = [];
  let from = 0;
  for(const line of text.split('\n')) {
    const to = Math.min(from + line.length + 1, text.length);
    if(line) found.push({ line, from, to });
    from += line.length + 1;
  }
  return found;
};

/** the snapshot a change shows, or `null` where the page cannot guard edits */
export const snapshotOf = (change: AppContentChange): AppContentSnapshot | null =>
  change.revision ? { id: change.id, content: change.content, revision: change.revision } : null;

// == Edits =======================================================================
/** the edit that appends a record */
export const add = (text: string, line: string): ContentChange =>
  ({ from: text.length, to: text.length, insert: ((text && !text.endsWith('\n')) ? '\n' : '') + line + '\n' });

/** the edit that removes a record */
export const remove = (record: TextRecord): ContentChange =>
  ({ from: record.from, to: record.to });

// == Write =======================================================================
/** whether this page can guard edits (an older page has no snapshots: reload it) */
export const canGuard = (appContent: AppContentAPI): boolean => (typeof appContent.snapshot === 'function');

/** whether a refusal means the block changed: read it again and decide again */
export const isConflict = (error: unknown): boolean => ((error as { code?: unknown; } | null)?.code === 'app/content-conflict');

/** applies edits measured on `snapshot`, to that block only, and only while it still
 *  has that revision. Where the page cannot guard edits, refuses without writing */
export const write = async (appContent: AppContentAPI, snapshot: AppContentSnapshot | null, changes: readonly ContentChange[]): Promise<void> => {
  if(!canGuard(appContent) || !snapshot) throw new Error('This page cannot make safe edits. Reload it.');
  await appContent.applyChanges(changes, byId(snapshot.id), { id: snapshot.id, revision: snapshot.revision });
};

/** the block a snapshot came from, as it is now (`null`: it is gone) */
export const reread = async (appContent: AppContentAPI, snapshot: AppContentSnapshot): Promise<AppContentSnapshot | null> => {
  if(!appContent.snapshot) throw new Error('This page cannot make safe edits. Reload it.');
  return appContent.snapshot(byId(snapshot.id));
};

/** appends a record, measured again on the block's latest text when another writer
 *  got there first. A block that is gone stays gone */
export const append = async (appContent: AppContentAPI, snapshot: AppContentSnapshot | null, line: string): Promise<void> => {
  let current = snapshot;
  for(let attempt = 1; ; attempt++) {
    try {
      return await write(appContent, current, [add(current?.content ?? '', line)]);
    } catch(error) {
      if(!isConflict(error) || (attempt >= APPEND_ATTEMPTS)) throw error;
      current = await reread(appContent, current!);
      if(!current) throw error/*the block was removed*/;
    }
  }
};
const APPEND_ATTEMPTS = 3;

// == Util ========================================================================
const byId = (id: string) => `[id='${id}']`;
