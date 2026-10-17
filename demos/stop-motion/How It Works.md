# How It Works

Stop Motion makes stop-motion films of toy-brick scenes. Each Application does one job: [Brick Studio](charmiq://../brick-studio/README.md) is the screen, where the film is seen on its set; Stop Motion is the timeline, which decides what moment is shown and when, and exports the film; a code editor's `scene.js` tab holds the scene. They find each other in the document and talk through the Platform's commands.


## The Scene

The scene is JavaScript. Stop Motion runs it whenever it changes, in a worker of its own: the code reaches no page, no document and no other Application, only the commands below, and a scene that runs for more than four seconds is stopped. A mistake is shown with its line, and the last film that ran stays on screen meanwhile.

Positions are Brick Studio's: `x` east and `z` north in studs, `height` up in plates (a brick is 3 plates), fractions allowed. Times are seconds.

| Command | Does |
|---|---|
| `scene({ title, fps, length, width, height, floor })` | the film's title, frames a second (24), length in seconds (the last key's when left out), its export size (1280 × 720), and the area (`{ x, z, width, depth }` in studs) the studio's baseplate covers at least, so actors have ground to move over |
| `actor(name, source)` | an actor: a component of the studio's build (`{ component: 'car' }`), a catalog part dressed as a placement is (`{ part: 'figure', color: 'blue', legColor, face, hat, rightHand, leftHand }`), or a piece already standing in the build, by where `listPlacedParts` says it stands (`{ placed: { x: 30, z: -20, level: 0 } }`, and `set: 'Garage'` for a set other than the first): it is lifted out of the set, dressed and posed as it is there; each value the scene keys comes from its keys from the first frame (held before its first key, as for any actor), and every value it never keys from where the piece stood |
| `a.at(time, values, ease)` | a key: the actor's values at a time, eased into from the key before (`linear`, `ease-in`, `ease-out`, `ease-in-out`, the default, or `hold`) |
| `a.path(from, to, (u, t) => values)` | values from a function over a span (`u` from 0 to 1 across it, `t` in seconds), in place of the keys there |
| `a.wobble(value, amount, { rate, from, to })` | smooth noise added to one value: `amount` at most, `rate` swings a second |
| `a.ride(other, { x, z, height })` | stands at an offset in another actor's frame and turns with it; its own position and turn add to the ride |
| `camera.at(time, { position \| orbit, target, fov }, ease)` | the camera: standing at a point, or orbiting its target (`{ angle, distance, height }`: angle 0 south of it, 90 east), looking at a point or an actor (`target: car`, or `{ actor: car, height }` to look higher), through a lens of `fov` degrees (32) |
| `camera.cut(time, { position \| orbit, target, fov }, name)` | a cut: the camera jumps to these values at `time`, starting a new shot, named for the timeline and storyboards |
| `camera.shake(from, to, amount, rate)` | a handheld shake |
| `view(name)` | another camera, used the same way: a second Brick Studio in the document shows the scene through it |
| `view(name, { plan: true })` | a plan: the scene from straight above, north up, with every actor's path and the camera drawn over it. It takes no keys; `{ plan: { x, z, width, depth } }` frames an area instead of everything the film shows |
| `set.at(time, name)` | a cut to another of the build's sets (Brick Studio's [sets](charmiq://../brick-studio/How%20It%20Works.md)): the set of that name stands from `time` on, until the next; the build's first set before the first |
| `fade.at(time, value)`, `fade.out(from, to)`, `fade.in(from, to)` | the fade to black: 0 shows the frame, 1 is black |
| `title(from, to, text, { style })` | words over the film: a full `card`, or a `caption` along the foot |
| `arc(t, up, gravity)`, `noise(t)`, `lerp(a, b, u)` | a jump's height in plates after `t` seconds, smooth noise from -1 to 1, and a blend |
| `console.log(...)` | a line in the film's log, beside the cast |

An actor's values are `x`, `z`, `height`, `yaw` (clockwise seen from above), `pitch` (raising its south side, which is a figure's front), `roll` (raising its west side), `visible`, and a figure's `pose`: `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg` at any angle. A figure's `face` is a name (`listParts` in Brick Studio names them): it changes at its key, at once, and stays until the next, the face the actor was declared with showing before the first. A face never eases from one to another; the swap is the stop-motion way, and it reads best on a motion that hides it (a head turn, a shake, arms flying up). Its position is the middle of the bottom of its footprint, and it turns about that point. A ridden figure sits where its offset puts its feet: a seated figure (both legs at 90) sits 2 plates lower than it stands.

An actor with wheels rolls them on its own: they turn by the distance it moves along its own north.

A story in more than one place cuts between the build's sets: the street, then `set.at(9, 'Garage')`, the garage. A set never eases into another; every set the scene names is staged when the film is, so the cut draws at once, and an actor goes wherever its keys put it in whichever set stands, so the car that left the street rolls into the garage.

A shot runs from one cut to the next. A move may end exactly where the next shot cuts in: `.at(4.5, { orbit: { angle: 15 } }, 'linear').cut(4.5, { position: ... })` moves to the end of one shot, then cuts. An orbit's angle eases by the numbers written, so 345 to 15 swings back through 180 while −15 to 15 swings through 0; a plan shows which way a swing goes.


## The Screen

Each time the scene runs, Stop Motion turns it into a reel, every frame of the film as data, and loads it into Brick Studio once. From then on the timeline only names a frame and the studio shows it: playing, scrubbing and seeking all happen in the studio, the fade and the titles drawn there too. The film plays in the studio while the timeline is scrolled out of view.

The studio holding a build is the main one: its build holds the sets, and its camera is the film's. A Brick Studio with no build of its own is another screen, showing the same set through the scene's next `view`: give the scene a plan view, and a second studio is the film's map. When two studios both hold a build, the film waits until one of them is emptied.

The strip under the timeline is the film's picture track: a small picture of each frame, taken from the studio while the film is neither playing nor exporting, without moving the picture the studio shows.

**Export MP4** shows every frame in the studio at the scene's size, captures it with its fade and titles, and encodes the film as H.264 in an MP4 for the browser to save. Changing the scene during an export stops it.

While the film is shown, Brick Studio says so and offers a way back to its build. Pressing it pauses the film at once; **Stage again** shows the film in the studio once more. Nothing in a film is written to the build.


## The File

A film is saved to your Drive as one file: the main studio's build (the set), then the scene, carried in the same LDraw file as a data section (`0 !DATA scene.js`). Brick Studio opens that file as an ordinary design, and keeps the scene in it when it saves, so a film saved from either is whole.

- **Save** saves the set and the scene together. The first save asks for a name and a folder; after that, Save writes over the film's own file, the one it was saved as or opened from, wherever it is.
- **Open…** opens a film: its set into the studio and its scene into the code block, and the film plays on the new set. A plain design opens its set alone and keeps the scene.
- **New** clears the set (its ground kept) and starts a new scene.

The scene is written into the code editor's tab named `scene.js` as it stands then (a tab renamed from it is left alone; with none, a new one). With no code editor, Open and New change nothing. If the scene cannot be written once the set has changed, Stop Motion says so and the film shows unsaved changes.

The bar says the film's name and whether it has changed since it was saved or opened. New and Open read the film as it stands just before changing it and ask first rather than lose unsaved changes; a set that cannot be read counts as changed, and an edit made in the studio after that read stops the change with nothing replaced. Save, Open and New run one at a time, in the order asked; a Drive that does not answer within 30 seconds is refused, so the next one runs. Stop Motion is between the two parts: it reads and writes the studio's build and the code block's scene, and nothing else.


## The Timeline

A row per track: the camera, each view, each actor, the sets the scene cuts between, the fade and the titles. A key is a diamond, a path a solid band, a wobble or shake a striped band, the fade a ramp to black, a title its words. A camera's shots alternate shades from cut to cut, each named, and so do the sets, each named from its key. Where two actors come within 2 studs of each other, a red notch on both their rows marks the moment they come closest. Keys too close to tell apart draw as one diamond with their count on it, and bands sharing a span stack, the row growing to fit, so nothing hides another.

Drag anywhere on the ruler or the rows to scrub; a diamond seeks to its key. The rows scroll under the playhead, which stays on the ruler. Hover anywhere over the rows or the ruler and a dashed line follows the pointer, its time on the ruler, while a card beside the row shows that moment: the studio's own picture of the frame (the picture track's nearest, developing, until it arrives), its time, frame, shot and set, where the row's actor or camera stands then, and every mark under the pointer with what it sets. The marks it describes light up on the lane. A key focused from the keyboard shows its card too. With the timeline focused, the arrows step a frame (with Shift, a second), Home and End go to the ends, Space plays, and Escape puts the card away.

Opening a film says so: the film picked in the Open dialog shows *Opening…* while everything else in the dialog waits, and the bar says *opening…* until the film is staged. Staging shows its progress in the status, loading the film into the studio frame by frame.


## The Commands

A Charm writes the scene in the code editor's `scene.js` tab, then works the film through these:

| Command | Does |
|---|---|
| `describeFilm` | the studios and editors found, whether the scene is staged, and the film: title, seconds, fps, frames, actors, views, its shots (each with the set it starts on), its set keys, every two actors that come within 2 studs, and its log, or the scene's mistake and its line |
| `seek` | shows a moment (`time` in seconds, or `frame` from 0) in the studios, answering once the studio has drawn it, so a screenshot sees it |
| `play`, `pause` | the transport |
| `storyboard` | shows up to 12 moments at once on a sheet over the main studio, each captioned with its time and shot (the middle of each shot when no `times` or `frames` are given), through a `view` when named: a screenshot of the studio reads them all. The film's next move closes it |
| `measure` | where two actors come closest, over the film or `from` and `to`: the gap between their boxes in studs (each its footprint turned by its yaw and its height; 0 when they touch) and where each stood |
| `where` | every actor's position and turn, the camera and the set standing, at a `time` or `frame` |
| `listFilms` | the films (and designs) in the films folder, each by name and uri |
| `saveFilm` | saves the set and the scene as one film: under `name` in the films folder, or over the film's own file wherever it is; another film of that name needs `replace` |
| `openFilm` | opens a film by `uri` or `name`: its set into the studio, its scene into the code block (a plain design, its set alone) |
| `newFilm` | clears the set and starts a new scene |

`openFilm` and `newFilm` refuse while the film has unsaved changes unless given `discard: true`; save the film first to keep it.

A Charm can also stage a still without a film: Brick Studio's own `stage` and `frame` commands put actors anywhere.


## The Files

| File | Purpose |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | scopes, the import map and the command surface |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: the scene, the studios, the playhead, the timeline and the picture track, wired |
| [`src/director.ts`](charmiq://./src/director.ts) | each scene run into a film and staged; the latest scene is the one the studios show |
| [`src/recorder.ts`](charmiq://./src/recorder.ts) | runs a scene's code and records it as data |
| [`src/scene-runner.ts`](charmiq://./src/scene-runner.ts) | the worker a scene runs in |
| [`src/scene-source.ts`](charmiq://./src/scene-source.ts) | the editor's `scene.js` tab, followed through renames and removals, and written |
| [`src/film.ts`](charmiq://./src/film.ts) | a recorded scene as a frame per frame (keys, rides, orbits, rolling wheels, shots, plans), each frame as the studio's reel takes it, and a plan's marks |
| [`src/measure.ts`](charmiq://./src/measure.ts) | how far apart actors come |
| [`src/studios.ts`](charmiq://./src/studios.ts) | the Brick Studios found, the main one chosen, the reel staged, each frame shown, each studio's state followed |
| [`src/player.ts`](charmiq://./src/player.ts) | the playhead and its clock |
| [`src/timeline.ts`](charmiq://./src/timeline.ts) | the timeline |
| [`src/timeline-marks.ts`](charmiq://./src/timeline-marks.ts) | the timeline's marks as data: its rows, keys grouped, bands stacked, what lies under a moment, where each track stands |
| [`src/peek.ts`](charmiq://./src/peek.ts) | the timeline's hover card |
| [`src/strip.ts`](charmiq://./src/strip.ts) | the picture track, a strip of film |
| [`src/export.ts`](charmiq://./src/export.ts) | the film as an MP4 |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
| [`src/films.ts`](charmiq://./src/films.ts) | the film's files: save, open and new, and whether the film changed since |
| [`src/film-file.ts`](charmiq://./src/film-file.ts) | a film as one LDraw file: its set, then its scene as a data section |
| [`src/film-dialog.ts`](charmiq://./src/film-dialog.ts) | the save and open dialog, the Brick family's own |
| [`../brick-shared`](charmiq://../brick-shared) | what Stop Motion shares with Brick Studio: the Drive, designs and their dialog (the dialog brings its own styles, `design-dialog.scss`), and the family's look (`_family.scss`, `_kit.scss`) |
