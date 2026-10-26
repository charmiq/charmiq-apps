import type { AppContentAPI } from '../../../shared/charmiq';
import { recordWithId, RecordSync } from '../../../shared/line-records/record-sync';
import type { Mark } from '../../../shared/review/surface';

// the document's notes: one note per line of the app-content named `notes` (JSON
// Lines), kept in step with the panel by note id (SEE: RecordSync). A note is what a
// person wrote about what they see (their words and the marks they made on the
// surfaces), its status and its replies. Two writers changing one note at once (the
// person closing it as the Agent answers) leave the later change, both replies kept
// ********************************************************************************
// == Constants ===================================================================
/** name and selector of the app-content that holds the notes */
const NOTES_NAME = 'notes';
const NOTES_SELECTOR = `[name='${NOTES_NAME}']`;

// == Types =======================================================================
/** who wrote a note or a reply: the person in the panel, or the Agent through the
 *  commands */
export type Author = 'person' | 'agent';
/** a note's state: written and waiting, answered by whoever worked on it, or closed
 *  by the person satisfied with it */
export enum NoteStatus { Open = 'open', Answered = 'answered', Closed = 'closed' }
export type Reply = Readonly<{ author: Author; text: string; time: number/*ms since the epoch*/; }>;
export type Note = Readonly<{
  id: string;
  text: string;
  marks: ReadonlyArray<Mark>;
  status: NoteStatus;
  author: Author;
  replies: ReadonlyArray<Reply>;
  /** when it was written and last changed (ms since the epoch) */
  created: number;
  changed: number;
}>;

// == Records =====================================================================
const STATUSES = new Set<string>(Object.values(NoteStatus));
const isAuthor = (value: unknown): value is Author => (value === 'person') || (value === 'agent');
const isMark = (value: unknown): value is Mark => {
  const mark = value as Partial<Mark> | null;
  return !!mark && (typeof mark.surface === 'string') && (typeof mark.label === 'string') && (typeof mark.resolved === 'object') && (typeof mark.shown === 'object');
};
const isReply = (value: unknown): value is Reply => {
  const reply = value as Partial<Reply> | null;
  return !!reply && isAuthor(reply.author) && (typeof reply.text === 'string') && (typeof reply.time === 'number');
};

/** a note from its line, or null for a line that is not one */
export const noteOf = (line: string): Note | null => {
  const record = recordWithId<Partial<Note>>(line);
  if(!record || (typeof record.text !== 'string') || !STATUSES.has(record.status as string) || !isAuthor(record.author)) return null;
  if(!Array.isArray(record.marks) || !Array.isArray(record.replies) || (typeof record.created !== 'number') || (typeof record.changed !== 'number')) return null;
  return { ...(record as Note), marks: record.marks.filter(isMark), replies: record.replies.filter(isReply) };
};

/** the note that stands when two writers changed one: the later change, with every
 *  reply either wrote, in time order */
export const mergedNote = (mine: Note, theirs: Note): Note => {
  const later = (theirs.changed > mine.changed) ? theirs : mine;
  const replies = new Map([...mine.replies, ...theirs.replies].map(reply => [`${reply.time}|${reply.author}|${reply.text}`, reply]));
  return { ...later, replies: [...replies.values()].sort((a, b) => a.time - b.time) };
};

// == Class =======================================================================
/** follows the notes app-content and writes the panel's notes onto it by note id */
export class Notes {
  private readonly sync: RecordSync<Note>;
  private notes: Note[] = [];
  private changed: (notes: ReadonlyArray<Note>) => void = () => undefined;

  public constructor(appContent: AppContentAPI) {
    this.sync = new RecordSync<Note>(appContent, NOTES_SELECTOR, NOTES_NAME, {
      idOf: note => note.id,
      fromLine: noteOf,
      lineOf: note => JSON.stringify(note),
      merge: mergedNote,
    }, {
      reload: 'This page cannot save notes safely. Reload it to keep reviewing.',
      failed: 'The note could not be saved. Try again.',
      changing: 'The notes kept changing while they were saved. Your last change was not saved; try again.',
      stale: 'The notes did not update. Reload to see the latest.',
    });
    this.sync.setCurrentRecords(() => this.notes);
    this.sync.onChange(notes => { this.notes = notes; this.changed(this.notes); });
  }

  /** told every time the notes change, by anyone */
  public onChange(callback: (notes: ReadonlyArray<Note>) => void): void { this.changed = callback; }
  public onReadFailure(callback: (failure: unknown) => void): void { this.sync.onReadFailure(callback); }
  public onSaveFailure(callback: (failure: unknown) => void): void { this.sync.onSaveFailure(callback); }
  /** whether this page can write the notes */
  public canEdit(): boolean { return this.sync.canEdit(); }
  /** follows the notes: resolves once they are first shown */
  public follow(): Promise<void> { return this.sync.follow(); }

  public all(): ReadonlyArray<Note> { return this.notes; }
  public find(id: string): Note | undefined { return this.notes.find(note => note.id === id); }

  // == Changes ===================================================================
  /** a new note, open, written by `author` */
  public add(author: Author, text: string, marks: ReadonlyArray<Mark>): Promise<Note> {
    const now = Date.now();
    const note: Note = { id: crypto.randomUUID(), text, marks, status: NoteStatus.Open, author, replies: [], created: now, changed: now };
    return this.write([...this.notes, note]).then(() => note);
  }

  /** a reply to a note, leaving it in `status` (its own when none is given) */
  public reply(id: string, author: Author, text: string, status?: NoteStatus): Promise<Note> {
    return this.change(id, note => ({ ...note, ...((status !== undefined) ? { status } : {}), replies: [...note.replies, { author, text, time: Date.now() }] }));
  }

  /** a note's status changed, nothing else */
  public setStatus(id: string, status: NoteStatus): Promise<Note> { return this.change(id, note => ({ ...note, status })); }

  public remove(id: string): Promise<void> {
    if(!this.find(id)) return Promise.reject(new Error(`No note ${id}.`));
    return this.write(this.notes.filter(note => note.id !== id));
  }

  // == Internal ==================================================================
  private change(id: string, changed: (note: Note) => Note): Promise<Note> {
    const note = this.find(id);
    if(!note) return Promise.reject(new Error(`No note ${id}.`));
    const next = { ...changed(note), changed: Date.now() };
    return this.write(this.notes.map(each => (each.id === id) ? next : each)).then(() => next);
  }

  private write(notes: Note[]): Promise<void> {
    this.notes = notes;
    this.changed(this.notes);
    return this.sync.save();
  }
}
