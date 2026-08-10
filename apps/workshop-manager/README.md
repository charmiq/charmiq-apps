# Workshop Manager

Manages the mechanics of running a workshop: a student roster and per-student cloning
of a Template folder into a Classroom folder, with incremental re-clone (additions
only) as the Template grows.

Unlike the other `apps/`, this is currently a single-file Source application with no
`manifest.json`. The complete app is `src/index.html` and is mounted through a
`charmiq://` URL.

## Embedding

<iframe-app height="900px" width="100%" src="charmiq://./src/index.html" requested-scopes="%5B%22appState.read%22%2C%22appState.write%22%2C%22authUser.state.read%22%2C%22userProfile.search%22%2C%22mcp.platform.vfs%22%2C%22command.richtext.copy%22%2C%22command.folder.permission.set%22%2C%22command.folder.delete%22%5D">
</iframe-app>

The `requested-scopes` value is the percent-encoded JSON array:

```json
["appState.read", "appState.write", "authUser.state.read", "userProfile.search",
 "mcp.platform.vfs", "command.richtext.copy", "command.folder.permission.set",
 "command.folder.delete"]
```

| Scope | Used for |
|---|---|
| `appState.read` / `appState.write` | All state: folder config, name pattern, Owners, roster, per-student clone mappings |
| `authUser.state.read` | Active Organization + Teams that scope the user-search sections |
| `userProfile.search` | The user typeahead (add student / add Owner) |
| `mcp.platform.vfs` | `list_dir` (walk, empty-folder checks), `describe_file` (names, versions, shares, copy liveness), `create_dir`, `move` (admin-move mirroring), `read_file`/`write_file` (edit sync), `delete_file` (removed documents) |
| `command.richtext.copy` | Deep-copies each template document into the student folder |
| `command.folder.permission.set` | One permission pass on each student folder at creation |
| `command.folder.delete` | Deletes a removed template folder's copy once it is verifiably empty |

## User search

The user typeahead rides `IUserProfileService.typeaheadSearchProfiles$`
over the app bridge, with
sections for the active Organization, and an exact-email fall-through.
Students and Owners are always selected from the search results — a free-typed
email is never accepted, which is what enforces "must be a Platform User". A
bridge-denied search reports as unavailable, never as an empty roster.

## Behavior notes

- **Clone** walks the Template (BFS, `list_dir`), creates the student folder under
  Classroom named by the pattern (`{name}` → student name), then per entry: folders
  via `create_dir`, documents via a shallow `richtext.copy` with the explicit target
  `parentFolderId` and `copyToParentFolder: false` (the shallow path's default would
  land the copy in the template's own folder).
  Each copy is recorded as `templateUri → { copyId, kind, parentUri, templateVersion,
  clonedAt }`; entries cloned before `parentUri` was recorded are backfilled from the
  walk on the next re-clone.
- **Re-clone is a full sync** implementing the contract below: additions, admin-move
  mirroring, edit sync (silent on untouched copies, prompted on edited ones),
  removals, and recreates of student-deleted copies. The summary toast itemizes
  every kind; kept folders, out-of-reach items, and failures each get their own
  loud report.
- **Comments are never cloned and never synced** — clones are shallow and the
  edit-sync overwrite carries content only, so nothing crosses from the template's
  comments to a student's copy, and comments on a copy (instructor feedback)
  survive every overwrite.
- **Assets (Files) are explicitly ignored** — a deliberate ruling, not only a
  platform gap (there is no asset copy-into-folder primitive). Skipped entries are
  reported by name after each clone.
- **Permissions**: one `folder.permission.set` on the student folder at creation —
  shares inherited from the Classroom folder are merged back (the Command replaces
  the complete map), plus the configured Owners (`owner`) and the student
  (`editor`). Later manual share edits are never rewritten; changing the Owners set
  affects future clones only.
- **Interrupted clones are resumable**: the mapping persists after every failure, so
  the next re-clone continues where it stopped.
- **State** rides app-state (per-embed, in-document): whole-blob last-write-wins with
  fetch-merge-set writes and an `onChange$` subscription for live refresh of other
  open copies. Collaborators on the hosting document share the state — do not add
  students as collaborators on that document.
- Changing the Template or Classroom folder (or the pattern) after clones exist
  requires a type-to-confirm warning; the Template change abandons the clone index,
  so the next re-clone copies the entire new template alongside existing content.

## Re-clone sync contract

Re-clone implements the rules below; the mapping (`templateUri → copyId`) is the
identity spine for all of it, and for the grading views (every student's copy of
X = the inverse read of the mapping).

- **Identity is the id — never the name, never the path.** Names change freely on
  both sides; they are not sync keys and are not synced. `copyId` is stable for an
  item's lifetime: content updates are in-place, never delete-and-recopy. This is
  what keeps every copy findable wherever students move or rename it.
- **"Edited" = the copy's version advanced past its baseline.** A fresh copy
  starts at version zero, so the baseline is implicitly 0; a sync overwrite
  records the post-write version (`copyVersion`) as the new baseline. Any advance
  counts: edit-and-revert counts, instructor feedback counts, whoever made it
  counts.
- **Additions** place into the mapped parent by id, wherever the student moved it.
- **Admin moves** relocate the copy by id into the mapped new parent — admin
  placement wins over student placement.
- **Admin edits**: unedited copy → overwrite silently; edited copy → prompt
  (overwrite / leave). `templateVersion` always remains the version the copy's
  content actually came from (clone or last overwrite) — a leave never touches
  it. A leave records `outOfSync` (the student's row shows a standing "N out of
  sync" marker) and the prompt returns on **every** sync while the divergence
  stands; an overwrite clears the marker.
- **Admin deletes a document**: unedited copy → delete; edited copy → prompt.
- **Admin deletes a folder**: contents first, per the document rules. The folder
  itself deletes only when nothing remains. **Student-created files are never
  deleted** — a folder holding any is kept and reported loudly.
- **Student deleted their copy** (document or folder): recreate as a fresh copy
  (new id, mapping updated) — never resurrect. A student cannot drop an assignment.
- **Out-of-reach copies** (moved where the instructors lack permission): the
  failing action's permission-denied is caught and reported as such; no proactive
  reach checks.
- **Conflicts resolve per student**: cloning runs one student at a time (class
  size ~30) and prompts within that run.
- **Mapping fields that carry the contract**: `parentUri` at clone time (existing
  entries are backfilled from the walk on the next re-clone), the template
  document's version, and `copyVersion` written only by sync overwrites (absent =
  baseline 0). Names are deliberately not recorded — they change freely and
  display resolves them live by id.
- **Operation order** within a sync: create/recreate folders → folder moves
  (depth-ordered) → document moves → content updates → additions → document
  deletions → empty-folder deletions.
