# Workshop Manager

Manages the mechanics of running a workshop: a student roster and per-student cloning
of a Template folder into a Classroom folder, with incremental re-clone (additions
only) as the Template grows.

Unlike the other `apps/`, this is an **inline application** — no `manifest.json`. The
complete app is `src/index.html`; it embeds in a document inside an `<iframe-app>`
container with its scopes on the `requested-scopes` attribute.

## Embedding

```html
<iframe-app height="900px" width="100%" requested-scopes="%5B%22appState.read%22%2C%22appState.write%22%2C%22authUser.state.read%22%2C%22userProfile.search%22%2C%22mcp.vfs%22%2C%22command.richtext.copy%22%2C%22command.folder.permission.set%22%5D">
  <app-source>
<!-- contents of src/index.html -->
  </app-source>
</iframe-app>
```

The `requested-scopes` value is the percent-encoded JSON array:

```json
["appState.read", "appState.write", "authUser.state.read", "userProfile.search",
 "mcp.vfs", "command.richtext.copy", "command.folder.permission.set"]
```

| Scope | Used for |
|---|---|
| `appState.read` / `appState.write` | All state: folder config, name pattern, Owners, roster, per-student clone mappings |
| `authUser.state.read` | Active Organization + Teams that scope the user-search sections |
| `userProfile.search` | The user typeahead (add student / add Owner) — see the platform dependency below |
| `mcp.vfs` | `list_dir` (template walk), `describe_file` (folder names, document versions, existing shares), `create_dir` (student + sub folders) |
| `command.richtext.copy` | Deep-copies each template document into the student folder |
| `command.folder.permission.set` | One permission pass on each student folder at creation |

## Platform dependency: `userProfile.search`

The user typeahead calls `IUserProfileService.typeaheadSearchProfiles$` over the app
bridge. That method must carry a `@ServiceMethod` decoration (scope
`userProfile.search`) to be bridge-reachable; until that ships, the app disables the
add-student and add-Owner pickers and says why. Students and Owners are always
selected from the search results — a free-typed email is never accepted, which is
what enforces "must be a Platform User".

## Behavior notes

- **Clone** walks the Template (BFS, `list_dir`), creates the student folder under
  Classroom named by the pattern (`{name}` → student name), then per entry: folders
  via `create_dir`, documents via `richtext.copy` with `deep: true` and the explicit
  target `parentFolderId` (the deep path never falls back to the source's parent).
  Each copy is recorded as `templateUri → { copyId, templateVersion, clonedAt }`.
- **Re-clone copies only template entries with no mapping** for that student.
  Modified template documents are never re-pushed; renames in the template appear as
  new entries. The recorded `templateVersion` (from `describe_file`) exists for
  future diffing.
- **Assets (Files) are not copied** — the platform has no asset copy-into-folder
  primitive. Skipped entries are reported by name after each clone.
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
