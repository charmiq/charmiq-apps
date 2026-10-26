import type { CharmIQAPI } from '../../../shared/charmiq';
import type { Mark } from '../../../shared/review/surface';

import { exportReviewCommands } from './command';
import { Notes, NoteStatus, type Author, type Note } from './notes';
import { Surfaces } from './surfaces';

// entry point: the document's notes. A person stops where something is wrong, starts a
// note (every surface then takes marks: a stroke on the picture, a span on the
// timeline), types a few words and saves; each note lists by its status with its
// marks' chips and its replies. Showing a note puts its marks back on the surfaces (the
// timeline on its span, the picture with its strokes). The Agent reads and answers the
// notes through the commands (SEE: command.ts); the person closes a note, or sends it
// back with a reply
// ********************************************************************************
// == Constants ===================================================================
/** how each status heads its notes, in the order they list */
const SECTIONS: ReadonlyArray<readonly [NoteStatus, string]> = [[NoteStatus.Open, 'Open'], [NoteStatus.Answered, 'Answered'], [NoteStatus.Closed, 'Closed']];
/** who wrote a reply, as the panel names them */
const AUTHORS: Readonly<Record<Author, string>> = { person: 'You', agent: 'Charm' };

// == Elements ====================================================================
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const count = element<HTMLSpanElement>('count');
const status = element<HTMLParagraphElement>('status');
const newButton = element<HTMLButtonElement>('newButton');
const composer = element<HTMLFormElement>('composer');
const draftMarks = element<HTMLUListElement>('draftMarks');
const draftHint = element<HTMLParagraphElement>('draftHint');
const draftText = element<HTMLTextAreaElement>('draftText');
const cancelButton = element<HTMLButtonElement>('cancelButton');
const notesList = element<HTMLElement>('notes');

// == Instances ===================================================================
const charmiq: CharmIQAPI | undefined = window.charmiq;
const notes = charmiq && new Notes(charmiq.appContent);
const surfaces = new Surfaces(charmiq);

/** the note being written: its marks so far */
let draft: Mark[] | undefined;
/** the note shown on the surfaces, while one is */
let shownId: string | undefined;
/** what failed, while it stands */
let failure: string | undefined;

// == Draft =======================================================================
const startNote = (): void => {
  if(draft || !notes) return;
  draft = [];
  composer.hidden = false;
  newButton.disabled = true;
  showNote(undefined);
  surfaces.mark(true);
  renderDraft();
  draftText.focus();
};

const endNote = (): void => {
  draft = undefined;
  draftText.value = '';
  composer.hidden = true;
  newButton.disabled = false;
  surfaces.mark(false);
};

/** a mark made while a note is written: any other mark takes the place of the moment
 *  the timeline marked as the note began, which stands only while nothing else does */
surfaces.onMark(mark => {
  if(!draft) return;
  if(isMoment(mark) && (draft.length > 0)) return/*the note already points at something*/;
  draft = [...draft.filter(each => !isMoment(each)), mark];
  renderDraft();
});
/** a mark naming a moment alone: a timeline mark over no rows */
const isMoment = (mark: Mark): boolean => (mark.surface === 'timeline') && !(Array.isArray(mark.resolved.rows) && (mark.resolved.rows.length > 0));

const saveNote = async (): Promise<void> => {
  if(!draft || !notes) return;
  const text = draftText.value.trim();
  if(text === '') { draftText.focus(); return; }
  const marks = draft;
  endNote();
  await act(notes.add('person', text, marks));
};

const renderDraft = (): void => {
  draftMarks.replaceChildren(...(draft ?? []).map((mark, index) => markChip(mark, () => { draft?.splice(index, 1); renderDraft(); })));
  draftHint.hidden = (draft?.length ?? 0) > 0;
};

// == Notes =======================================================================
/** shows a note on the surfaces, or none */
const showNote = (note: Note | undefined): Promise<void> => {
  shownId = note?.id;
  render();
  return surfaces.show(note?.marks ?? []);
};

const render = (): void => {
  const all = notes?.all() ?? [];
  const open = all.filter(note => note.status === NoteStatus.Open).length;
  count.textContent = (open > 0) ? `${open} open` : '';
  status.hidden = !failure && (surfaces.count() > 0);
  status.textContent = failure ?? 'Add a Brick Studio or Stop Motion to this document to mark what a note is about.';
  if((all.length < 1) && !draft) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No notes yet. Where something is wrong, pause there and press New note (N): circle it on the picture, drag across the timeline over the frames it spans, and say what.';
    notesList.replaceChildren(empty);
    return;
  }
  notesList.replaceChildren(...SECTIONS.flatMap(([state, heading]) => {
    const listed = all.filter(note => note.status === state).sort((a, b) => b.created - a.created);
    if(listed.length < 1) return [];
    const section = document.createElement((state === NoteStatus.Closed) ? 'details' : 'section');
    section.className = `section section--${state}`;
    const title = document.createElement((state === NoteStatus.Closed) ? 'summary' : 'h2');
    title.className = 'eyebrow';
    title.textContent = `${heading} · ${listed.length}`;
    section.append(title, ...listed.map(noteCard));
    return [section];
  }));
};

const noteCard = (note: Note): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'note';
  card.dataset.status = note.status;
  card.classList.toggle('is-shown', note.id === shownId);

  const words = document.createElement('p');
  words.className = 'note-words';
  words.textContent = note.text;

  const marks = document.createElement('ul');
  marks.className = 'marks';
  marks.append(...note.marks.map(mark => markChip(mark)));

  const replies = document.createElement('ol');
  replies.className = 'replies';
  replies.append(...note.replies.map(reply => {
    const item = document.createElement('li');
    item.className = `reply reply--${reply.author}`;
    const who = document.createElement('b');
    who.textContent = AUTHORS[reply.author];
    item.append(who, ` ${reply.text}`);
    return item;
  }));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const shown = note.id === shownId;
  actions.append(button(shown ? 'Stop showing' : 'Show', shown ? 'Take its marks off the picture and the timeline' : 'Put its marks back on the picture and the timeline', () => void showNote(shown ? undefined : note), shown ? 'ink' : 'azure'));
  if(note.status !== NoteStatus.Closed) actions.append(button('Close', 'It is right now', () => void act(notes!.setStatus(note.id, NoteStatus.Closed))));
  if(note.status !== NoteStatus.Open) actions.append(button('Reopen', 'It is not right yet: say why', () => reopen(card, note)));
  actions.append(deleteButton(note));

  card.append(words, marks, replies, actions);
  return card;
};

/** sends a note back with the person's reply, asked in its card */
const reopen = (card: HTMLElement, note: Note): void => {
  if(card.querySelector('.reopen')) return;
  const form = document.createElement('form');
  form.className = 'reopen';
  const reason = document.createElement('textarea');
  reason.className = 'words';
  reason.rows = 2;
  reason.placeholder = 'What is still wrong?';
  reason.setAttribute('aria-label', 'What is still wrong');
  const send = button('Send back', 'Reopen it with your reply', () => undefined, 'yellow');
  send.type = 'submit';
  form.append(reason, send);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = reason.value.trim();
    void act((text === '') ? notes!.setStatus(note.id, NoteStatus.Open) : notes!.reply(note.id, 'person', text, NoteStatus.Open));
  });
  card.append(form);
  reason.focus();
};

/** deletes on a second press, the first asking */
const deleteButton = (note: Note): HTMLButtonElement => {
  const remove = button('Delete', 'Delete the note', () => {
    if(remove.dataset.asking !== 'true') { remove.dataset.asking = 'true'; remove.textContent = 'Delete?'; return; }
    if(shownId === note.id) void showNote(undefined);
    void act(notes!.remove(note.id));
  });
  remove.addEventListener('blur', () => { remove.dataset.asking = 'false'; remove.textContent = 'Delete'; });
  return remove;
};

// == Util ========================================================================
const markChip = (mark: Mark, remove?: () => void): HTMLLIElement => {
  const chip = document.createElement('li');
  chip.className = 'chip';
  chip.dataset.surface = mark.surface;
  const label = document.createElement('span');
  label.textContent = mark.label;
  chip.append(label);
  if(remove) chip.append(button('×', 'Remove this mark', remove, 'plain', 'chip-remove'));
  return chip;
};

const button = (text: string, title: string, pressed: () => void, tone = 'plain', className = 'tag'): HTMLButtonElement => {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = (className === 'tag') ? `tag tag--${tone}` : className;
  made.textContent = text;
  made.title = title;
  made.addEventListener('click', pressed);
  return made;
};

/** a change to the notes, its failure said in the status until the next succeeds */
const act = async (change: Promise<unknown>): Promise<void> => {
  try {
    await change;
    failure = undefined;
  } catch(error) {
    failure = (error as Error).message;
  }
  render();
};

// == Wiring ======================================================================
newButton.addEventListener('click', startNote);
cancelButton.addEventListener('click', endNote);
composer.addEventListener('submit', event => { event.preventDefault(); void saveNote(); });
draftText.addEventListener('keydown', event => {
  if((event.key === 'Enter') && !event.shiftKey) { event.preventDefault(); void saveNote(); }
  if(event.key === 'Escape') { event.preventDefault(); endNote(); }
});
document.addEventListener('keydown', event => {
  const typing = (event.target instanceof HTMLTextAreaElement) || (event.target instanceof HTMLInputElement);
  if(!typing && (event.key === 'n' || event.key === 'N') && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); startNote(); }
  if(!typing && (event.key === 'Escape') && shownId) void showNote(undefined);
});

surfaces.onFound(() => render());
if(notes) {
  notes.onChange(() => render());
  notes.onReadFailure(error => { failure = (error as Error).message; render(); });
  notes.onSaveFailure(error => { failure = (error as Error).message; render(); });
  notes.follow().catch(error => { failure = (error as Error).message; render(); });
  exportReviewCommands(charmiq!, { notes, surfaces, open: note => showNote(note) });
} else {
  failure = 'Review keeps a document\'s notes: open it in a document.';
  newButton.disabled = true;
}
render();
