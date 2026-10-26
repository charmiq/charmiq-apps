# Review

*Watch the film, stop where something is wrong, circle it, say what. Your Charm answers each note, and opening a note puts the moment back in front of you.*

Review keeps a document's notes. It sits beside the picture in a film document (Brick Studio above Stop Motion), and any Application that can be marked joins in: Brick Studio's picture and Stop Motion's timeline.

## Leaving a note

1. **Stop** where it goes wrong: Space pauses, scrubbing finds the frame.
2. **New note** (or `N` in Review) starts marking: the picture takes strokes and the timeline takes a span.
3. **Mark** it: draw on the picture (a circle round the trouble, a line along a path, an arrow at a part) and drag across the timeline's rows over the frames it spans. Each mark shows as a chip saying what it points at (*Picture, frame 658: Hurdler-2, the rail*; *Timeline, 27.42–27.67 s: Hurdler-2*); × takes one back. Without a span, the note is the frame it was begun on.
4. **Say what**: a few words, then Enter (Shift-Enter for a new line). Escape drops the note.
5. **Carry on**, and tell your Charm in the chat when your notes are waiting.

## Reading the answers

Notes list by status: **Open** (waiting), **Answered** (your Charm replied with what it changed), **Closed** (folded away). **Show** puts a note back on the picture and the timeline: the timeline loops its span and the picture draws its strokes. **Close** a note when it is right; **Reopen** it with what is still wrong; **Delete** asks once more before it deletes.

## For your Charm

Review's commands: `listNotes` (oldest first, each with what its marks point at: the frame, the actors and parts under a stroke, a span's times and rows with what moves each actor then and the scene lines), `showNote` (the note on the picture and the timeline, for a screenshot or a measurement), `replyToNote` (what was wrong, what changed, what was checked; left answered, or open when you must act) and `deleteNote` (only when you ask). Only you close a note.

## How it is made

The notes are the document's own content (one note a line), so whoever can read the document reads them, and two people noting at once each keep theirs. A surface advertises `charmiq.review-surface` (`shared/review/surface.ts`): it takes marks when Review asks, resolves each into its own terms, and shows a note's marks again. Review keeps the marks without understanding them.

| File | |
|---|---|
| [`src/main.ts`](charmiq://./src/main.ts) | the panel: New note, the note being written and its chips, the notes by status |
| [`src/notes.ts`](charmiq://./src/notes.ts) | the notes, one a line of the `notes` app-content, merged by id with another writer's |
| [`src/surfaces.ts`](charmiq://./src/surfaces.ts) | the surfaces found by discovery: marking while a note is written, showing a note |
| [`src/command.ts`](charmiq://./src/command.ts) | your Charm's commands |
