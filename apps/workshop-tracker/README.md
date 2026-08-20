# Workshop Tracker

The daily-work surface beside the [Workshop Manager](../workshop-manager/): the
template tree of Materials, **Assignment** toggles on the Materials students do
work in, and per-student progress under each Assignment — at a glance for a
~30-student class.

Single-file Source application (no `manifest.json`), mounted through a
`charmiq://` URL, on the **same page** as the Workshop Manager (app-to-app
discovery is document-scoped).

## Embedding

<iframe-app height="700px" width="100%" src="charmiq://./src/index.html" requested-scopes="%5B%22appState.read%22%2C%22appState.write%22%2C%22mcp.platform.vfs%22%5D">
</iframe-app>

| Scope | Used for |
|---|---|
| `appState.read` / `appState.write` | The Assignment set (`assignedUris`, template-uri-keyed) |
| `mcp.platform.vfs` | `list_dir` (template tree walk), `describe_file` (live checks) |

## Data flow

- Subscribes to the roster app's advertised **`workshop-data`** stream
  (`discover$` for provider presence, `data$()` with `retry` for the data — the
  counters-demo pattern). No polling; App 2 is push-current with the roster.
- **Roster emissions replace data only.** Assignments, tree expansion, live-check
  results, and scroll all survive every emission by construction.
- Statuses from the stream are "as of that student's last sync". **Check** (per
  Assignment) and **Check all** describe the copies directly for live truth,
  through the bounded pool, stamped with the check time.
- Status vocabulary: **Has work** / **Not started** / **Not cloned** /
  **Unreachable**; live-checked chips render dotted-underlined.
- Provider gone → "Roster app not found", last received data stays visible.

## Mock provider

`mock/roster.html` advertises the identical contract with fabricated students
over a **real** template tree (paste a real Folder id; copy ids are fake, so
copy links 404 — structure, statuses, and live updates are fully exercisable).
Scenarios: small / classroom (30) / chaos (missing clones, absurd names) /
empty, plus one-shot and auto random "student edited something" mutations to
exercise the live stream. Embed it in place of the Workshop Manager on a test
page:

<iframe-app height="300px" width="100%" src="charmiq://./mock/roster.html" requested-scopes="%5B%22mcp.platform.vfs%22%2C%22application.advertise%22%5D">
</iframe-app>
