import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Mark } from '../../../shared/review/surface';

import { NoteStatus, type Note, type Notes } from './notes';
import type { Surfaces } from './surfaces';

// the Agent's command surface (SEE: manifest.json `advertise`): the document's notes,
// each with what its marks resolved to, in the order they were written so the Agent
// works through them as the person watched; a note shown on the surfaces as opening it
// shows it, so a screenshot or a measurement sees what the person saw; an answer on a
// note; and a note deleted when the person asks. Closing a note is the person's word
// that it is right, never the Agent's
// ********************************************************************************
// == Types =======================================================================
/** what the commands read and change */
export type ReviewHost = Readonly<{
  notes: Notes;
  surfaces: Surfaces;
  /** shows a note as opening it in the panel does */
  open: (note: Note) => Promise<void>;
}>;

// == Commands ====================================================================
export const exportReviewCommands = (charmiq: CharmIQAPI, host: ReviewHost): void => {
  charmiq.exportCommands({
    listNotes: ({ status }: { status?: unknown; }) => {
      if((status !== undefined) && !Object.values(NoteStatus).includes(status as NoteStatus)) throw new Error(`status is one of ${Object.values(NoteStatus).join(', ')}.`);
      const notes = host.notes.all().filter(note => (status === undefined) || (note.status === status));
      return { notes: [...notes].sort((a, b) => a.created - b.created).map(noteReport), surfaces: host.surfaces.count() };
    },
    showNote: async ({ id }: { id?: unknown; }) => {
      const note = noteOf(host, id);
      await host.open(note);
      return { shown: note.id, marks: note.marks.length };
    },
    replyToNote: async ({ id, reply, status }: { id?: unknown; reply?: unknown; status?: unknown; }) => {
      const note = noteOf(host, id);
      if((typeof reply !== 'string') || (reply.trim() === '')) throw new Error('reply is what was wrong, what changed (the scene lines) and what was checked.');
      if(status === NoteStatus.Closed) throw new Error('Only the person who wrote a note closes it: reply with answered, or open when it needs them.');
      if((status !== undefined) && (status !== NoteStatus.Answered) && (status !== NoteStatus.Open)) throw new Error('status is answered or open.');
      const replied = await host.notes.reply(note.id, 'agent', reply.trim(), (status as NoteStatus | undefined) ?? NoteStatus.Answered);
      return noteReport(replied);
    },
    deleteNote: async ({ id }: { id?: unknown; }) => {
      const note = noteOf(host, id);
      await host.notes.remove(note.id);
      return { deleted: note.id };
    },
  });
};

// == Util ========================================================================
/** the note an id names (its first characters will do, as a person quotes it) */
const noteOf = (host: ReviewHost, id: unknown): Note => {
  if((typeof id !== 'string') || (id.trim() === '')) throw new Error('id is the note\'s id, as listNotes gives it.');
  const wanted = id.trim(), notes = host.notes.all();
  const exact = notes.find(note => note.id === wanted);
  if(exact) return exact;
  const starting = notes.filter(note => note.id.startsWith(wanted));
  if(starting.length > 1) throw new Error(`${wanted} begins ${starting.length} notes' ids: give more of it.`);
  if(starting.length < 1) throw new Error(`No note ${wanted}: listNotes names them.`);
  return starting[0];
};

/** a note as the Agent reads it: its marks as resolved, without how a surface draws them */
const noteReport = (note: Note) => ({
  id: note.id, text: note.text, status: note.status, author: note.author,
  marks: note.marks.map(({ surface, label, frames, resolved }: Mark) => ({ surface, label, ...(frames ? { frames } : {}), resolved })),
  replies: note.replies.map(({ author, text }) => ({ author, text })),
});
