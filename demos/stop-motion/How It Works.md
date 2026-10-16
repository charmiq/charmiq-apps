# How It Works

Stop Motion makes stop-motion films of toy-brick scenes. Each Application does one job: [Brick Studio](charmiq://../brick-studio/README.md) is the screen, where the film is seen on its set; Stop Motion is the timeline, which decides what moment is shown and when, and exports the film; a code editor's `scene.js` tab holds the scene. They find each other in the document and talk through the Platform's commands.


## The Scene

The scene is JavaScript. Stop Motion runs it whenever it changes, in a worker of its own: the code reaches no page, no document and no other Application, only the commands below, and a scene that runs for more than four seconds is stopped. A mistake is shown with its line, and the last film that ran stays on screen meanwhile.

Positions are Brick Studio's: `x` east and `z` north in studs, `height` up in plates (a brick is 3 plates), fractions allowed. Times are seconds.

| Command | Does |
|---|---|
| `scene({ title, fps, length, width, height, floor })` | the film's title, frames a second (24), length in seconds (the last key's when left out), its export size (1280 × 720), and the area (`{ x, z, width, depth }` in studs) the studio's baseplate covers at least, so actors have ground to move over |
| `actor(name, source)` | an actor: a component of the studio's build (`{ component: 'car' }`) or a catalog part dressed as a placement is (`{ part: 'figure', color: 'blue', legColor, face, hat, rightHand, leftHand }`) |
| `a.at(time, values, ease)` | a key: the actor's values at a time, eased into from the key before (`linear`, `ease-in`, `ease-out`, `ease-in-out`, the default, or `hold`) |
| `a.path(from, to, (u, t) => values)` | values from a function over a span (`u` from 0 to 1 across it, `t` in seconds), in place of the keys there |
| `a.wobble(value, amount, { rate, from, to })` | smooth noise added to one value: `amount` at most, `rate` swings a second |
| `a.ride(other, { x, z, height })` | stands at an offset in another actor's frame and turns with it; its own position and turn add to the ride |
| `camera.at(time, { position \| orbit, target, fov }, ease)` | the camera: standing at a point, or orbiting its target (`{ angle, distance, height }`: angle 0 south of it, 90 east), looking at a point or an actor (`target: car`, or `{ actor: car, height }` to look higher), through a lens of `fov` degrees (32) |
| `camera.shake(from, to, amount, rate)` | a handheld shake |
| `view(name)` | another camera, used the same way: a second Brick Studio in the document shows the scene through it |
| `fade.at(time, value)`, `fade.out(from, to)`, `fade.in(from, to)` | the fade to black: 0 shows the frame, 1 is black |
| `title(from, to, text, { style })` | words over the film: a full `card`, or a `caption` along the foot |
| `arc(t, up, gravity)`, `noise(t)`, `lerp(a, b, u)` | a jump's height in plates after `t` seconds, smooth noise from -1 to 1, and a blend |
| `console.log(...)` | a line in the film's log, beside the cast |

An actor's values are `x`, `z`, `height`, `yaw` (clockwise seen from above), `pitch` (raising its south side, which is a figure's front), `roll` (raising its west side), `visible`, and a figure's `pose`: `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg` at any angle. A figure's `face` is a name (`listParts` in Brick Studio names them): it changes at its key, at once, and stays until the next, the face the actor was declared with showing before the first. A face never eases from one to another; the swap is the stop-motion way, and it reads best on a motion that hides it (a head turn, a shake, arms flying up). Its position is the middle of the bottom of its footprint, and it turns about that point. A ridden figure sits where its offset puts its feet: a seated figure (both legs at 90) sits 2 plates lower than it stands.

An actor with wheels rolls them on its own: they turn by the distance it moves along its own north.


## The Screen

Each time the scene runs, Stop Motion turns it into a reel, every frame of the film as data, and loads it into Brick Studio once. From then on the timeline only names a frame and the studio shows it: playing, scrubbing and seeking all happen in the studio, the fade and the titles drawn there too. The film plays in the studio while the timeline is scrolled out of view.

The studio holding a build is the main one: its build is the set, and its camera is the film's. A Brick Studio with no build of its own is another screen, showing the same set through the scene's next `view`. When two studios both hold a build, the film waits until one of them is emptied.

The strip under the timeline is the film's picture track: a small picture of each frame, taken from the studio while the film is neither playing nor exporting, without moving the picture the studio shows.

**Export MP4** shows every frame in the studio at the scene's size, captures it with its fade and titles, and encodes the film as H.264 in an MP4 for the browser to save. Changing the scene during an export stops it.

While the film is shown, Brick Studio says so and offers a way back to its build. Pressing it pauses the film at once; **Stage again** shows the film in the studio once more. Nothing in a film is written to the build.


## The Timeline

A row per track: the camera, each view, each actor, the fade and the titles. A key is a diamond, a path a solid band, a wobble or shake a striped band, the fade a ramp to black, a title its words. Drag anywhere on the ruler or the rows to scrub; a diamond seeks to its key and says what it sets. With the timeline focused, the arrows step a frame (with Shift, a second), Home and End go to the ends, and Space plays.


## The Commands

A Charm writes the scene in the code editor's `scene.js` tab, then works the film through these:

| Command | Does |
|---|---|
| `describeFilm` | the studios and editors found, whether the scene is staged, and the film: title, seconds, fps, frames, actors, views and its log, or the scene's mistake and its line |
| `seek` | shows a moment (`time` in seconds, or `frame` from 0) in the studios, answering once the studio has drawn it, so a screenshot sees it |
| `play`, `pause` | the transport |

A Charm can also stage a still without a film: Brick Studio's own `stage` and `frame` commands put actors anywhere.


## The Files

| File | Purpose |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | scopes, the import map and the command surface |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: the scene, the studios, the playhead, the timeline and the picture track, wired |
| [`src/director.ts`](charmiq://./src/director.ts) | each scene run into a film and staged; the latest scene is the one the studios show |
| [`src/recorder.ts`](charmiq://./src/recorder.ts) | runs a scene's code and records it as data |
| [`src/scene-runner.ts`](charmiq://./src/scene-runner.ts) | the worker a scene runs in |
| [`src/scene-source.ts`](charmiq://./src/scene-source.ts) | the editor's `scene.js` tab, followed |
| [`src/film.ts`](charmiq://./src/film.ts) | a recorded scene as a frame per frame (keys, rides, orbits, rolling wheels), and each frame as the studio's reel takes it |
| [`src/studios.ts`](charmiq://./src/studios.ts) | the Brick Studios found, the main one chosen, the reel staged, each frame shown, each studio's state followed |
| [`src/player.ts`](charmiq://./src/player.ts) | the playhead and its clock |
| [`src/timeline.ts`](charmiq://./src/timeline.ts) | the timeline |
| [`src/strip.ts`](charmiq://./src/strip.ts) | the picture track, a strip of film |
| [`src/export.ts`](charmiq://./src/export.ts) | the film as an MP4 |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
