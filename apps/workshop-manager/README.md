# Workshop Manager

*A student roster, a Folder per student synced from a Template Folder, and the files the teacher watches for students' edits.*

<iframe-app height="900px" width="100%" src="charmiq://.">
</iframe-app>


## What This Is

The Workshop Manager runs the mechanics of a workshop. A teacher keeps a **Template Folder**
of the course's documents and a **Classroom Folder** that holds one folder per student. A
student's first **Sync** copies the Template into a new folder for them; each later Sync keeps
their copy in step as the Template grows and changes, without ever overwriting a copy the
student edited unless the teacher says so.

A teacher can **watch** up to three Template files (an FAQ where students add their
questions). When a student edits their copy, it shows on the roster until the teacher marks
it seen.

The workshop is the folder: `manifest.json` stands at its root, so a document embeds it by
the folder (`src="charmiq://."` beside it, or the folder's own address from anywhere).


## In Practice

**Settings** — The Template and Classroom Folders (paste a folder's link), the student folder
name (`Workshop — {name}`), the Owners added to each student folder when it is created, and
the watched files, chosen from the Template.

**Adding students** — *Add student* searches CharmIQ accounts (the active Company's Members, or
an exact email), then takes the name the workshop shows. Several students can share one
account (a parent's, for their children); the roster shows each student's name over the
account they use, and marks a shared one.

**Syncing** — *Sync* on a student, or *Sync All*. A copy the student edited since the workshop
last wrote it prompts before it is overwritten or deleted, and the destructive choice is typed
to confirm. "N out of sync" on a row counts those copies, as of the last sync.

**Watched files** — Read when the workshop opens and on *Refresh*, never on a timer: one read
per student per watched file. A copy shows **new** once the student edits it; *I've seen
everything* (the row's menu, or the student's sheet) marks it seen. The teacher's own answer
in a student's FAQ moves it too, so it shows new until it is marked seen again.

**A student's folder** — Copy its link, *Browse* it (a read-only listing, one level at a time,
each document opening in CharmIQ), or open it. *What changed?* reads one student's folder when
asked: the copies they edited, the files they made, and the copies gone from it.

**On a phone** — The roster is a list with *Add student* and *Sync All* at the bottom; tap a
student for everything above, as a sheet.

**With a Charm** — A Charm in the document runs the workshop through the commands below. It
never overwrites or deletes a copy a student edited: it reports those copies, and *Sync* here
asks about each. The configuration is set in Settings only.

| Command | What it does |
|---|---|
| `getRoster` | Lists the students, their status and how many of their copies they have edited |
| `getConfig` | Shows the Template and Classroom Folders, the folder name pattern and the Owners |
| `syncRoster` | Makes the roster match a list of people (one email per line): adds, restores and marks deleted |
| `addStudent` | Adds one student by email |
| `removeStudent` | Marks a student deleted (restorable; their folder is untouched) |
| `renameStudent` | Renames a student and, unless they renamed it themselves, their folder |
| `syncStudent` | Syncs one student |
| `syncAll` | Syncs every active student |
| `whatChanged` | Reads what one student changed in their folder |
| `checkWatchedFiles` | Reads every student's copy of the watched files: new, seen, deleted |

The state, the sync's rules, watched files, the Tracker's data and the permissions are in [How It Works](charmiq://./How%20It%20Works.md).
