import type { AppContent, AppContentAPI } from '../charmiq';
import { isConflict, parseRecord, recordLines, writeLines } from './line-records';

// an Application's records kept in step with its app-contents, one record per line
// (JSON Lines), in order, while the Application holds its own copy ahead of them
// (a drag in flight, a change not yet saved). Another tab, another User, a Charm or
// another Application can change the app-contents at the same moment, so the two
// are kept apart by record id:
//
// Shown: the records last shown, by id and in order. The Application's records are
// the shown ones plus its own changes not yet written. Another writer's change
// reaches them as a change to the records it touched: a record they changed is
// taken as they left it where this client has no change of its own to it (an Undo
// in the document included), and merged with this client's change otherwise (the
// model decides how); one they added is added, one they removed is removed, and
// every other record keeps this client's version, unsaved changes included. This
// client's own writes coming back change nothing.
//
// Saving: what this client changed since the records shown (records changed, added,
// removed or moved) is written onto the app-content as it is now, by id, through the
// app-content shown and guarded by it, whole lines only (SEE: writeLines). A refused
// edit is measured again on the app-content as it is now, so another writer's change
// to other records is never overwritten; where both changed one record, the model
// says which stands. A record another writer removed stays removed. Saves run one at
// a time, each with the Application's records as they then are.
//
// Converging: the guard covers this client's own Editor; two clients writing at once
// both pass it, and the host rebases one write over the other. A write rebased away,
// or a record both wrote that leaves the other's line where this client's stands by
// the model, is written again when the change arrives. One id on two lines (both
// writes kept) reads as the line the model prefers, and the next save leaves one.
//
// Two collaborators who each write the first record at once create two app-contents:
// both are kept and read (the first one's records first), and a record is written
// in the app-content it is in
// SEE: tutorials/03-writing-data for the line-record pattern, explained
// ********************************************************************************
// == Constants ===================================================================
/** how many times a save is measured again after its app-content changed under it */
const EDIT_ATTEMPTS = 3;
/** how long a refused save waits for the app-content's newer revision: it reaches
 *  `contents$()` in one bridge round trip */
const NEWER_REVISION_WAIT_MS = 5_000/*ms*/;

// == Types =======================================================================
/** a save that could not be made: its message is shown to the User */
export class RecordSaveError extends Error {}

/** how an Application's records are read, written and reconciled */
export type RecordModel<T> = Readonly<{
  /** the record's id, unique among the records */
  idOf: (record: T) => string;
  /** the record from its line, or null for a line that is not one */
  fromLine: (line: string) => T | null;
  /** the record's line: what a save writes and a merge compares */
  lineOf: (record: T) => string;
  /** the record that stands when another writer changed one this client holds */
  merge: (mine: T, theirs: T) => T;
  /** whether this client's record replaces the line another writer left (default:
   *  it does) */
  wins?: (mine: T, theirs: T) => boolean;
  /** whether a record differing from another of its id in its line holds no change
   *  to it (default: none does): a normalization the Application makes as it reads
   *  a record is never written back */
  unchanged?: (record: T, other: T) => boolean;
}>;

/** what the User reads when a save or a read fails */
export type RecordWords = Readonly<{
  /** on a page opened before `contents$()` */
  reload: string;
  /** a save the host refused */
  failed: string;
  /** a save refused every time it was measured again */
  changing: string;
  /** a refused save whose newer revision never arrived */
  stale: string;
}>;

// --------------------------------------------------------------------------------
/** records by id (each record's line) and the ids in order */
type Records = Readonly<{ lines: ReadonlyMap<string, string>; order: ReadonlyArray<string>; }>;
const NO_RECORDS: Records = { lines: new Map(), order: [] };

/** what this client changed since the records shown */
type Delta = Readonly<{
  /** the line of each record changed or added */
  lines: ReadonlyMap<string, string>;
  removed: ReadonlySet<string>;
  /** records added or moved: each is placed after its predecessor */
  placed: ReadonlySet<string>;
  /** each record's predecessor (null: the first) */
  predecessor: ReadonlyMap<string, string | null>;
  /** the client's ids in order */
  order: ReadonlyArray<string>;
  /** the ids shown when the save was measured */
  shown: ReadonlySet<string>;
}>;

// == Class =======================================================================
/** follows the app-contents a selector names and saves the Application's records
 *  onto them by id */
export class RecordSync<T> {
  private onRecordsChanged: ((records: T[]) => void) | null = null;
  private onReadFailed: ((failure: unknown) => void) | null = null;
  private onSaveFailed: ((failure: unknown) => void) | null = null;
  private currentRecords: (() => ReadonlyArray<T>) | null = null;

  private contents: ReadonlyArray<AppContent> = [];
  /** the records last shown: what this client's own changes are measured from */
  private shown: Records = NO_RECORDS;
  /** each record's line as this client last wrote it, until it is shown */
  private readonly written = new Map<string, string>();
  /** saves waiting for an app-content's newer revision */
  private readonly waiting = new Set<() => void>();

  private saving: Promise<void> | null = null/*none in flight*/;
  private saveAgain = false;

  // == Lifecycle =================================================================
  /** @param selector the app-contents the records are in (`contents$()`'s)
   *  @param name the name a first record's app-content is created with */
  public constructor(
    private readonly appContent: AppContentAPI,
    private readonly selector: string | undefined,
    private readonly name: string | undefined,
    private readonly model: RecordModel<T>,
    private readonly words: RecordWords
  ) {}

  // ------------------------------------------------------------------------------
  /** register the callback for this client's records after another writer's change */
  public onChange(callback: (records: T[]) => void): void { this.onRecordsChanged = callback; }
  /** register the callback for a read refused after the records were first shown */
  public onReadFailure(callback: (failure: unknown) => void): void { this.onReadFailed = callback; }
  /** register the callback for a save this client makes again by itself that fails */
  public onSaveFailure(callback: (failure: unknown) => void): void { this.onSaveFailed = callback; }
  /** register the getter for this client's records: what a save writes and another
   *  writer's change merges into */
  public setCurrentRecords(getter: () => ReadonlyArray<T>): void { this.currentRecords = getter; }

  /** whether this page can read and write app-contents (a page opened before
   *  `contents$()` cannot) */
  public canEdit(): boolean { return (typeof this.appContent.contents$ === 'function'); }

  /** the app-contents' text as last shown, in order */
  public texts(): ReadonlyArray<string> { return this.contents.map(content => content.text); }

  // == Follow ====================================================================
  /** follows the app-contents: resolves once they are first shown, rejects when the
   *  read is refused */
  public follow(): Promise<void> {
    if(!this.canEdit()) return Promise.reject(new RecordSaveError(this.words.reload));
    return new Promise((resolve, reject) => {
      let shown = false;
      this.appContent.contents$(this.selector).subscribe({
        next: contents => {
          this.receive(contents);
          if(!shown) { shown = true; resolve(); }
        },
        error: failure => {
          if(!shown) { shown = true; reject(failure); }
          else this.onReadFailed?.(failure);
        },
      });
    });
  }

  /** merges the app-contents' change into this client's records, by id */
  private receive(contents: ReadonlyArray<AppContent>): void {
    const previous = this.shown,
          next = this.recordsOf(contents);
    this.contents = contents;
    this.shown = next;
    this.waiting.forEach(wake => wake());

    const local = this.currentRecords?.() ?? [];
    const kept = new Set<string>();
    const merged = this.merge(local, previous, next, kept);

    // a write the document does not hold (rebased away), or a record kept over
    // another writer's, is written again
    const { idOf, lineOf } = this.model;
    const again = merged.some(record => {
      const id = idOf(record), line = lineOf(record);
      return !this.holdsNoChange(record, next.lines.get(id)) && ((this.written.get(id) === line) || kept.has(id));
    });
    const holding = new Map(merged.map(record => [idOf(record), lineOf(record)]));
    for(const [id, line] of this.written) if((next.lines.get(id) === line) || (holding.get(id) !== line)) this.written.delete(id)/*shown, or no longer held*/;

    if(!this.same(merged, local)) this.onRecordsChanged?.(merged);
    if(again) this.save().catch(failure => this.onSaveFailed?.(failure));
  }

  /** this client's records with another writer's change from `previous` to `next`;
   *  `kept` collects the ids whose record this client kept over another writer's */
  private merge(local: ReadonlyArray<T>, previous: Records, next: Records, kept: Set<string>): T[] {
    const { idOf, lineOf } = this.model;
    const mine = new Map(local.map(record => [idOf(record), record]));
    const merged: T[] = [];
    for(const id of next.order) {
      const line = next.lines.get(id)!,
            before = previous.lines.get(id),
            record = mine.get(id);
      const theirs = (line !== before) && (line !== this.written.get(id))/*not this client's write coming back*/;
      if(!record) {
        if(before !== undefined) continue/*removed here, not yet saved*/;
        const added = this.model.fromLine(line);
        if(added) merged.push(added);
      } else if(theirs) {
        const changed = this.model.fromLine(line);
        const settled = this.holdsNoChange(record, before)/*no change of this client's own to it*/;
        const standing = !changed ? record : settled ? changed : this.model.merge(record, changed);
        if((lineOf(standing) === lineOf(record)) && !this.holdsNoChange(record, line)) kept.add(id);
        merged.push(standing);
      } else merged.push(record)/*this client's version, unsaved changes included*/;
    }

    // records added here and not yet saved, each after its predecessor
    local.forEach((record, index) => {
      const id = idOf(record);
      if(previous.lines.has(id) || next.lines.has(id)) return/*shown, or removed by another writer*/;
      const predecessor = (index > 0) ? idOf(local[index - 1]) : null;
      const at = (predecessor === null) ? 0 : (merged.findIndex(candidate => idOf(candidate) === predecessor) + 1);
      merged.splice((at > 0) || (predecessor === null) ? at : merged.length, 0, record);
    });
    return merged;
  }

  // == Save ======================================================================
  /** writes what this client changed since the records shown onto the app-contents
   *  as they are now. Saves run one at a time; a save asked for while one runs runs
   *  once more after it, with the records as they then are */
  public save(): Promise<void> {
    this.saveAgain = true;
    if(!this.saving) this.saving = this.drain().finally(() => { this.saving = null; });
    return this.saving;
  }

  private async drain(): Promise<void> {
    while(this.saveAgain) {
      this.saveAgain = false;
      await this.saveOnce();
    }
  }

  private async saveOnce(): Promise<void> {
    if(!this.canEdit()) throw new RecordSaveError(this.words.reload);
    const delta = this.deltaOf(this.currentRecords?.() ?? [], this.shown);
    if((delta.lines.size < 1) && (delta.removed.size < 1) && (delta.placed.size < 1)) return/*nothing changed*/;

    for(let attempt=1; ; attempt++) {
      if(this.contents.length < 1) {
        if(delta.lines.size < 1) return/*no app-content, and nothing to write*/;
        try {
          await this.appContent.create(''/*no records*/, this.name);
        } catch(error) {
          throw new RecordSaveError(this.words.failed, { cause: error });
        }
        await this.newerThan(undefined)/*the created app-content shown*/;
      } /* else -- an app-content to write in */

      // the lines each app-content needs, measured on it as it is now
      const idsIn = (content: AppContent) => this.linesOf(content).map(line => this.idOfLine(line)).filter(isId);
      const elsewhere = (content: AppContent) => new Set(this.contents.filter(other => other !== content).flatMap(idsIn));
      const edits = this.contents.map((content, index) => ({ content, lines: this.applyDelta(this.linesOf(content), delta, index === 0, elsewhere(content)) }))
                                 .filter(edit => (edit.lines.length !== edit.content.lines.length) || edit.lines.some((line, at) => line !== edit.content.lines[at]));
      if(edits.length < 1) return/*the app-contents already hold it*/;

      for(const [id, line] of delta.lines) this.written.set(id, line);
      let refused: AppContent | undefined;
      for(const { content, lines } of edits) {
        try {
          await writeLines(content, lines);
        } catch(error) {
          if(!isConflict(error)) throw new RecordSaveError(this.words.failed, { cause: error });
          refused = content;
          break;
        }
      }
      if(!refused) { await this.newerThan(edits[edits.length - 1].content); return/*shown*/; }
      if(attempt >= EDIT_ATTEMPTS) throw new RecordSaveError(this.words.changing);
      await this.newerThan(refused);
    }
  }

  /** resolves once the app-contents no longer show `content` as it was (with none,
   *  once any app-content is shown) */
  private newerThan(content: AppContent | undefined): Promise<void> {
    const moved = () => content ? !this.contents.some(candidate => (candidate.id === content.id) && (candidate.revision === content.revision))
                                : (this.contents.length > 0);
    if(moved()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const wake = () => { if(!moved()) return; done(); resolve(); };
      const timeout = setTimeout(() => { done(); reject(new RecordSaveError(this.words.stale)); }, NEWER_REVISION_WAIT_MS);
      const done = () => { clearTimeout(timeout); this.waiting.delete(wake); };
      this.waiting.add(wake);
    });
  }

  // == Records ===================================================================
  /** an app-content's record lines (an older one-array app-content: its elements) */
  private linesOf(content: AppContent): ReadonlyArray<string> { return recordLines(content); }
  private idOfLine(line: string): string | null {
    const record = this.model.fromLine(line);
    return record ? this.model.idOf(record) : null;
  }

  /** every app-content's records by id, in order: an id on more than one line is
   *  the line the model prefers, where the first of them stands */
  private recordsOf(contents: ReadonlyArray<AppContent>): Records {
    const lines = new Map<string, string>(), order: string[] = [];
    for(const line of contents.flatMap(content => this.linesOf(content))) {
      const id = this.idOfLine(line);
      if(!id) continue/*not a record*/;
      const first = lines.get(id);
      if(first === undefined) { lines.set(id, line); order.push(id); continue; }
      if(this.prefers(line, first)) lines.set(id, line)/*a later copy the model prefers*/;
    }
    return { lines, order };
  }

  /** whether the model prefers `line` to `other`, two lines of one record */
  private prefers(line: string, other: string): boolean {
    if(!this.model.wins) return false/*the first stands*/;
    const [record, otherRecord] = [this.model.fromLine(line), this.model.fromLine(other)];
    return !!record && !!otherRecord && (this.model.lineOf(record) !== this.model.lineOf(otherRecord)) && this.model.wins(record, otherRecord);
  }

  /** whether the record holds no change from the line (none: it does) */
  private holdsNoChange(record: T, line: string | undefined): boolean {
    if(line === undefined) return false;
    if(this.model.lineOf(record) === line) return true;
    const other = this.model.unchanged ? this.model.fromLine(line) : null;
    return !!other && this.model.unchanged!(record, other);
  }

  private same(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
    const { lineOf } = this.model;
    return (a.length === b.length) && a.every((record, index) => (record === b[index]) || (lineOf(record) === lineOf(b[index])));
  }

  // == Delta =====================================================================
  /** what this client changed since the records shown */
  private deltaOf(local: ReadonlyArray<T>, shown: Records): Delta {
    const { idOf, lineOf } = this.model;
    const order = local.map(idOf);
    const lines = new Map<string, string>(), placed = new Set<string>(), predecessor = new Map<string, string | null>();
    local.forEach((record, index) => {
      const id = idOf(record), line = lineOf(record);
      if(!this.holdsNoChange(record, shown.lines.get(id))) lines.set(id, line);
      if(!shown.lines.has(id)) placed.add(id)/*added*/;
      predecessor.set(id, (index > 0) ? order[index - 1] : null);
    });
    const removed = new Set(shown.order.filter(id => !predecessor.has(id)));

    // moved: a record whose predecessor among the records both hold changed
    const both = (ids: ReadonlyArray<string>, other: ReadonlySet<string> | ReadonlyMap<string, unknown>) => ids.filter(id => other.has(id));
    const before = predecessorsOf(both(shown.order, predecessor)),
          after = predecessorsOf(both(order, shown.lines));
    for(const [id, previous] of after) if(before.get(id) !== previous) placed.add(id);

    return { lines, removed, placed, predecessor, order, shown: new Set(shown.order) };
  }

  /** an app-content's lines with the delta made on them. Repeating it changes
   *  nothing more. A record changed, moved or removed here that another writer
   *  removed stays removed; one both changed keeps the line the model's `wins`
   *  prefers; an added record goes in the first app-content unless another holds it */
  private applyDelta(lines: ReadonlyArray<string>, delta: Delta, first: boolean, elsewhere: ReadonlySet<string>): ReadonlyArray<string> {
    // each id's line here (the one the model prefers, where two hold it), and its
    // other copies left out
    const held = new Map<string, string>();
    for(const line of lines) {
      const id = this.idOfLine(line);
      if(!id) continue;
      const other = held.get(id);
      if((other === undefined) || this.prefers(line, other)) held.set(id, line);
    }
    const seen = new Set<string>();
    lines = lines.filter(line => { const id = this.idOfLine(line); if(!id) return true; if(seen.has(id)) return false; seen.add(id); return true; })
                 .map(line => { const id = this.idOfLine(line); return id ? held.get(id)! : line; });
    const lineFor = (id: string): string => {
      const mine = delta.lines.get(id), theirs = held.get(id);
      if((mine === undefined) || (theirs === undefined) || !this.model.wins) return mine ?? theirs!;
      const [mineRecord, theirsRecord] = [this.model.fromLine(mine), this.model.fromLine(theirs)];
      return (!mineRecord || !theirsRecord || this.model.wins(mineRecord, theirsRecord)) ? mine : theirs;
    };
    const out = lines.filter(line => { const id = this.idOfLine(line); return !id || !(delta.removed.has(id) || delta.placed.has(id)); })
                     .map(line => { const id = this.idOfLine(line); return (id && delta.lines.has(id)) ? lineFor(id) : line; });

    for(const id of delta.order) {
      if(!delta.placed.has(id)) continue;
      const added = !delta.shown.has(id);
      const here = held.has(id) || (added && first && !elsewhere.has(id));
      if(!here) continue/*another app-content's, or removed by another writer*/;

      const line = lineFor(id);
      const predecessor = delta.predecessor.get(id) ?? null;
      const after = (predecessor === null) ? -1 : out.findIndex(candidate => this.idOfLine(candidate) === predecessor);
      if(predecessor === null) out.splice(0, 0, line);
      else if(after >= 0) out.splice(after + 1, 0, line);
      else out.push(line)/*its predecessor is not in this app-content*/;
    }
    return out;
  }
}

// == Util ========================================================================
const isId = (id: string | null): id is string => (id !== null);

const predecessorsOf = (ids: ReadonlyArray<string>): ReadonlyMap<string, string | null> =>
  new Map(ids.map((id, index) => [id, (index > 0) ? ids[index - 1] : null]));

/** the record a line holds when it has a non-empty string `id` (or null) */
export const recordWithId = <T>(line: string): T | null => {
  const record = parseRecord(line);
  return ((typeof record?.id === 'string') && (record.id.length > 0)) ? record as unknown as T : null;
};
