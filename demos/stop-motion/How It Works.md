# How It Works

Stop Motion makes stop-motion films of toy-brick scenes. Each Application does its own part: [Brick Studio](charmiq://../brick-studio/README.md) builds the set and shoots each frame on its stage; Stop Motion keeps time, plays the film and exports it; a code editor's `scene.js` tab holds the scene. They find each other in the document and talk through the Platform's commands.


## The Scene

The scene is JavaScript. Stop Motion runs it whenever it changes, in a worker of its own: the code reaches no page, no document and no other Application, only the commands below, and a scene that runs for more than four seconds is stopped. A mistake is shown with its line, and the last film that ran stays on screen meanwhile.

Positions are Brick Studio's: `x` east and `z` north in studs, `height` up in plates (a brick is 3 plates), fractions allowed. Times are seconds.

| Command | Does |
|---|---|
| `scene({ title, fps, length, width, height, floor })` | the film's title, frames a second (24), length in seconds (the last key's when left out), its export size (1280 × 720), and the area (`{ x, z, width, depth }` in studs) the studio's baseplate covers at least, so actors have ground to move over |
| `actor(name, source)` | an actor: a component of the studio's build (`{ component: 'car' }`) or a catalog part dressed as a placement is (`{ part: 'figure', color: 'blue', legColor, hat, rightHand, leftHand }`) |
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

An actor's values are `x`, `z`, `height`, `yaw` (clockwise seen from above), `pitch` (raising its south side, which is a figure's front), `roll` (raising its west side), `visible`, and a figure's `pose`: `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg` at any angle. Its position is the middle of the bottom of its footprint, and it turns about that point. A ridden figure sits where its offset puts its feet: a seated figure (both legs at 90) sits 2 plates lower than it stands.

An actor with wheels rolls them on its own: they turn by the distance it moves along its own north.


## Shooting

The first time a frame is shown, Stop Motion asks Brick Studio to stage the scene and shoot the frame, and keeps the shot in the take. A frame in the take plays and scrubs without the studio, and the studio follows what is on screen. The strip under the timeline is the take: a frame not yet shot shows unexposed, and develops when it is. **Shoot all** shoots the rest of the take. A change to the scene starts a new take, unless only the fade or the titles changed.

**Export MP4** shoots every frame again at the scene's size, draws the fade and the titles over it, and encodes the film as H.264 in an MP4 for the browser to save.

While the film is shown, Brick Studio says so and offers a way back to its build. Pressing it pauses the film; **Stage again** shows the film in the studio once more. Nothing in a film is written to the build.


## The Timeline

A row per track: the camera, each view, each actor, the fade and the titles. A key is a diamond, a path a solid band, a wobble or shake a striped band, the fade a ramp to black, a title its words. Drag anywhere on the ruler or the rows to scrub; a diamond seeks to its key and says what it sets. With the timeline focused, the arrows step a frame (with Shift, a second), Home and End go to the ends, and Space plays.


## The Commands

A Charm writes the scene in the code editor's `scene.js` tab, then works the film through these:

| Command | Does |
|---|---|
| `describeFilm` | the studios and editors found, whether the scene is staged, and the film: title, seconds, fps, frames, actors, views and its log, or the scene's mistake and its line |
| `seek` | shows a moment (`time` in seconds, or `frame` from 0) in the studio and the player, so a screenshot sees it |
| `play`, `pause` | the transport |

A Charm can also stage a still without a film: Brick Studio's own `stage` and `frame` commands put actors anywhere.


## The Files

| File | Purpose |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | scopes, the import map and the command surface |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: the scene, the studios, the player, the timeline and the strip, wired |
| [`src/recorder.ts`](charmiq://./src/recorder.ts) | runs a scene's code and records it as data |
| [`src/scene-runner.ts`](charmiq://./src/scene-runner.ts) | the worker a scene runs in |
| [`src/scene-source.ts`](charmiq://./src/scene-source.ts) | the editor's `scene.js` tab, followed |
| [`src/film.ts`](charmiq://./src/film.ts) | a recorded scene as a frame per frame: keys, rides, orbits, rolling wheels |
| [`src/studios.ts`](charmiq://./src/studios.ts) | the Brick Studios found, staged and shown each frame |
| [`src/player.ts`](charmiq://./src/player.ts) | the take, the transport, the fade and the titles |
| [`src/timeline.ts`](charmiq://./src/timeline.ts) | the timeline |
| [`src/strip.ts`](charmiq://./src/strip.ts) | the take as a strip of film |
| [`src/export.ts`](charmiq://./src/export.ts) | the film as an MP4 |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
