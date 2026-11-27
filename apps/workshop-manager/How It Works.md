# How It Works

The Workshop Manager is one Folder Application: its manifest stands at the folder's root, so a document embeds it by the folder. What follows is how it keeps a workshop, syncs it, and reads what students change.


## The Files

| File | Role |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | Identity, scopes, the advertised commands, the `/shared` mount and the rxjs import |
| [`src/index.html`](charmiq://./src/index.html) | The page: the roster, its sheets, the toasts |
| [`src/main.ts`](charmiq://./src/main.ts) | State, the sync engine, watched files, the commands and the page |
| [`src/styles.css`](charmiq://./src/styles.css) | One layout for every width; under 640px a list, sheets and a bottom bar |


## State (`appState`)

Everything the workshop keeps is its app-state: the configuration, the roster, and each
student's mapping (`template URI → copy`) and seen versions. The app-state is the truth: what
shows is what the document last told, and every write reads the latest state and writes its
change onto it, one at a time, keeping every field this page does not know. A sync writes only
its own fields, so a rename or delete another person makes during a long sync stands. A failed
write or a stopped update is told to the person. Collaborators on the hosting document share
the state: do not add students as collaborators on that document.


## The Sync

The mapping (`templateUri → { copyId, kind, parentUri, templateVersion, copyVersion,
lastCopyVersion }`) is the identity spine: names change freely on both sides and are never
sync keys, and `copyId` is stable for an item's lifetime (content updates are in place).

- **Edited** means the copy's version advanced past the version the workshop last wrote
  (`copyVersion`, absent = 0 for a fresh copy). Any advance counts, whoever made it.
- **Additions** go into the mapped parent by id, wherever the student moved it. **Admin moves**
  relocate the copy into the mapped new parent: the teacher's placement wins.
- **Template edits** overwrite an unedited copy silently and prompt on an edited one
  (overwrite / leave). A leave never touches `templateVersion`, so the prompt returns on every
  sync while the divergence stands.
- **Template removals** delete an unedited copy and prompt on an edited one. A removed folder
  deletes only once empty; **anything the student made is never deleted**, and a folder holding
  it is kept and reported.
- **A copy the student deleted** is recreated fresh (new id): a student cannot drop an assignment.
- **Out-of-reach copies** (moved where the teacher lacks permission) are reported as such.
- **"Copy of" is undone for Charms**: an explicitly named source copies as `Copy of <name>`, so
  a Charm copy takes the Template's name back at once, and a sync heals any copy still named
  exactly `Copy of <the Template's current name>`; a student's own rename is never touched.
- **Comments and Reference Material are never copied or synced**: copies are shallow
  (`preserveContextDependents: false`) and the edit sync carries content only.
- **Files (Assets) are not copied**; they are reported by name after each sync.
- **Permissions**: one `folder.permission.set` on a student's folder when it is created — the
  shares inherited from the Classroom folder merged back, the Owners as `owner`, the student as
  `editor`. Later share edits are never rewritten.
- **Renaming a student** renames their folder only while its live name is still the one the
  workshop set: a student's own rename wins.
- **Interrupted syncs resume**: the mapping is saved after every failure.
- **Order**: one student at a time over one shared read of the Template; within a student,
  reads go through a bounded pool (8 at once), decisions and their prompts run back to back,
  and writes apply behind ordering barriers (folders by level, then moves, updates, additions,
  removals, empty-folder removals).


## Watched Files and What Changed?

A watched file's copy is found through the mapping, and read with one `describe_file` per
student per file; it is **new** when its version is past the version last marked seen
(`watchSeen`, absent = the version the workshop last wrote). *What changed?* lists the
student's folder (one `list_dir` per folder they hold from the Template; a folder they made is
listed, not walked) and reads each synced document's version: what is not in the mapping the
student made, and what the mapping holds but no listing does is gone.


## Advertised Data (`workshop-data`)

The app advertises its state to the Workshop Tracker on the same page:

```
advertise('workshop-data', {
  getWorkshopData: () => snapshot,   // one-shot
  data$: () => Observable<snapshot>, // emits the current one on subscribe, then every change
})
snapshot = { version: 1, config: { templateFolderId, classroomFolderId }, students }
```

The snapshot is the persisted roster, mappings included; names and the tree resolve live by
id on the Tracker's side. `apps/workshop-tracker/mock/roster.html` advertises the same contract
with made-up students for Tracker development.


## Permissions

| Scope | Used for |
|---|---|
| `user.read` | The signed-in User: the active Company scopes the user search |
| `userProfile.search` | The user search (add a student or an Owner; a roster list's emails) |
| `mcp.platform.vfs` | `list_dir` (the sync, Browse, What changed?), `describe_file` (versions, names, watched files), `create_dir`, `move`, `read_file`/`write_file` (edit sync), `delete_file` |
| `command.richtext.copy` | Copies each Template document into a student's folder |
| `command.richtext.metadata.set` | Takes a Charm copy's name back from the "Copy of" convention |
| `command.folder.permission.set` | One permission pass on each student folder at creation |
| `command.folder.delete` | Deletes a removed Template folder's copy once it is empty |
| `command.folder.name.set` | Renames a student's folder when the student is renamed |

App-state is the Application's own and needs no declaration; neither does advertising.
