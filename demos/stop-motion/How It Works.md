# How It Works

Stop Motion makes stop-motion films of toy-brick scenes. Each Application does one job: [Brick Studio](charmiq://../brick-studio/README.md) is the screen, where the film is seen on its set; Stop Motion is the timeline, which decides what moment is shown and when, and exports the film; a code editor's `scene.js` tab holds the scene. They find each other in the document and talk through the Platform's commands.


## The Scene

The scene is JavaScript. Stop Motion runs it whenever it changes, in a worker of its own: the code reaches no page, no document and no other Application, only the commands below, and a scene that runs for more than four seconds is stopped. A mistake is shown with its line, and the last film that ran stays on screen meanwhile.

Positions are Brick Studio's: `x` east and `z` north in studs, `height` up in plates (a brick is 3 plates), fractions allowed. Times are seconds.

| Command | Does |
|---|---|
| `scene({ title, fps, length, width, height, floor, boil })` | the film's title, frames a second (24), length in seconds (the last key's when left out), its export size (1280 × 720), the area (`{ x, z, width, depth }` in studs) the studio's baseplate covers at least, so actors have ground to move over, and its `boil` (0 to 1, none when left out): every actor not kept still shifted a little from frame to frame, as bricks moved by hand between exposures |
| `actor(name, source)` | an actor: a component of the studio's build (`{ component: 'car' }`), a catalog part dressed as a placement is (`{ part: 'figure', color: 'blue', legColor, face, hat, rightHand, leftHand }`), or a piece already standing in the build, by where `listPlacedParts` says it stands (`{ placed: { x: 30, z: -20, level: 0 } }`, and `set: 'Garage'` for a set other than the first), or one part of a copy of a component standing there, by where it stands in the component as Brick Studio's `listComponents({ component })` lists its parts (`{ placed: { x: 30, z: -20, level: 0, inside: { x: 1, z: 2, level: 1 } } }`: the clerk of one store, the store left standing): it is lifted out of the set, dressed and posed as it is there; each value the scene keys comes from its keys from the first frame (held before its first key, as for any actor), and every value it never keys from where the piece stood |
| `a.at(time, values, ease)` | a key: the actor's values at a time, eased into from the key before (`linear`, `ease-in`, `ease-out`, `ease-in-out`, the default, or `hold`); a figure's `face`, `rightHand` and `leftHand` (`{ part, color, grip }` as Brick Studio dresses a hand, or `null` for nothing) are taken at once and held, a coffee picked up partway through |
| `a.path(from, to, (u, t) => values)` | values from a function over a span (`u` from 0 to 1 across it, `t` in seconds), in place of the keys there |
| `a.wobble(value, amount, { rate, from, to })` | smooth noise added to one value: `amount` at most, `rate` swings a second |
| `a.ride(other, { x, z, height })` | stands at an offset in another actor's frame and turns with it; its own position and turn add to the ride |
| `a.walk(time, points, { speed, until, stride, swing, arms, bounce, lean, seed })` | walks along `points` (each `{ x, z }`) from `time` at `speed` studs a second (3), or arriving `until` a time, facing the way it goes: a figure or a creature on studs a stud a step, turning a quarter on one foot and hopping up and down a level (see below); anything else keyed through each point, turning at each corner, its legs and arms swinging in step with the ground it covers, a bounce and a lean. Its arms, lean and leading foot are its own (seeded by its name, or `seed`); `stride` and `bounce` move only an actor that does not click onto studs |
| `a.idle({ from, to, energy, nervous, seed })` | alive while it stands: breathing, its weight shifting, small turns, glances held a moment; livelier with `energy` and quicker and wider with `nervous` (each 0 to 1). A figure idles subtly on its own wherever nothing else moves it (see below) |
| `a.still()` | stands as keyed alone: no idling of its own, and the scene's boil leaves it |
| `a.look(target, { from, to, within, max })` | turns its head toward an actor or a point while it stands within `within` studs (12), as far as `max` degrees (70) either way of where its torso faces, easing there and back; of two looks at once, the one begun latest |
| `a.react(time, face, { for })` | a face for `for` seconds (1) over whatever it wears, then its own again |
| `a.ground({ step })` | its height follows the ground under it: what it is keyed is then plates above the surface it stands on, stepping up onto one at most `step` plates (3, a brick) above where it stood and down onto any below; before a surface higher its height holds, as at a wall, though its keys still move it on (ground sets heights; nothing stops an actor walking into a part); where it is first shown, and shown again after being hidden, it starts afresh |
| `crowd(name, { along, count, width, personalities, wardrobe, stops, react, go, from, to, seed })` | walkers named `name-1` on, walking `along` a path both ways over its `width` (4 studs), dressed from the wardrobe (`colors`, `legColors`, `faces`, `hats`, `hairColors`), each a personality: `commuter`, `window-shopper` (stops at `stops`), `tourist` (pauses looking up), `phone` (a radio held up), `jogger`, `stroller`, `couple` (in pairs, talking), `waiter` (waits until `go`). They keep right, slow behind a slower walker, pass when the other side is clear and wait when not, keeping about a body apart along the path and side by side (spacing on the path, not collisions with the set or other actors); `react: { at, where, within, look, for }` stops those near what happens, the nearest first, staring and surprised. It answers the walkers, to key further |
| `camera.at(time, { position \| orbit, target, fov, avoid }, ease)` | the camera: standing at a point, or orbiting its target (`{ angle, distance, height }`: angle 0 south of it, 90 east, round counterclockwise seen from above; with `relativeTo: 'heading'`, round the actor it looks at as it turns: 0 behind it, 90 its right, 180 before it), looking at a point or an actor (`target: car`, or `{ actor: car, height }` to look higher), through a lens of `fov` degrees (32), turned clockwise about where it looks by `roll` degrees as seen from behind it, sharp at its `focus` (an actor, `{ actor, height }`, a point, or a number of studs ahead along its view; its target when no key names one) through its `aperture` (an f-number from 1 to 32: 1.4 a brick film's shallow macro look, only what it focuses on sharp; 8 a toy photo's; 16 nearly all sharp), each eased between keys like any value, so a key's new focus is a rack focus (see *The edit*); `dollyZoom: true` on a lens key keeps the target its size on the screen while the lens eases into the key (see *The edit*); `avoid: 'parts'` keeps it out of the set's parts, drawn in toward its target until it stands clear and sees it, from this key to the next placing it (a view's camera too) |
| `camera.cut(time, { position \| orbit, target, fov, roll }, name, { transition, seconds })` | a cut: the camera jumps to these values at `time`, starting a new shot, named for the timeline and storyboards; the film's camera's cut may enter by a `transition` over `seconds` (0.5, up to 10): `dissolve`, `wipe-left`, `wipe-right`, `wipe-up`, `wipe-down` (the edge moving that way) or `iris` (opening from the middle) |
| `camera.shake(from, to, amount, rate)` | a handheld shake |
| `view(name)` | another camera, used the same way: a second Brick Studio in the document shows the scene through it |
| `view(name, { plan: true })` | a plan: the scene from straight above, north up, with every actor's path and the camera drawn over it. It takes no keys; `{ plan: { x, z, width, depth } }` frames an area instead of everything the film shows |
| `set.at(time, name)` | a cut to another of the build's sets (Brick Studio's [sets](charmiq://../brick-studio/How%20It%20Works.md)): the set of that name stands from `time` on, until the next; the build's first set before the first |
| `fade.at(time, value, ease, { color, shape })`, `fade.out(from, to, { color })`, `fade.in(from, to, { color })` | the fade: 0 shows the frame, 1 is its color (`#rrggbb`, black when left out), over the whole picture or, with `shape: 'iris'`, closing in from the frame's edge; each fade takes the color and shape of the key it eases into |
| `fade.flash(time, { color, hold, out })`, `fade.irisOut(from, to, { color })`, `fade.irisIn(from, to, { color })` | a flash: the frame all `color` (white) at `time`, held `hold` seconds (0.04), back over `out` (0.3); an iris closing on the frame, and opening on it |
| `speed.at(time, rate, ease)`, `speed.slow(from, to, rate, { ease })` | how fast the scene runs on the screen from a key: 1 as it is, 0.25 a quarter as fast, 2 twice (0.05 to 8), eased into from the key before; `slow` runs a span at `rate` (0.25), easing in and out over `ease` seconds (0.2; 0 at once) |
| `title(from, to, text, { style })` | words over the film: a full `card`, or a `caption` along the foot |
| `sound.at(time, sound, { volume, until, fadeIn, fadeOut })` | a sound from `time`: a file in the Platform by its URI (`charmiq://file/<assetId>`), or one Stop Motion ships by name; once, or over and over `until` a time; `volume` from 0 to 4 (1 as recorded), rising from silence over `fadeIn` seconds and falling to silence over `fadeOut` before it ends (two overlapping sounds' fades cross them over) |
| `a.sound(time, sound, { volume, until, fadeIn, fadeOut })` | a sound that follows an actor: it sounds from the side of the picture the actor stands on, quieter as it stands farther than 20 studs off or behind the camera |
| `arc(t, up, gravity)`, `noise(t, seed)`, `lerp(a, b, u)` | a jump's height in plates after `t` seconds, smooth noise from -1 to 1 (a seed its own run of it), and a blend |
| `random(seed)` | a random generator, from 0 up to 1: the same numbers for the same seed on every run. `Math.random` is seeded by the scene, so a film is the same every run |
| `console.log(...)` | a line in the film's log, beside the cast |

An actor's values are `x`, `z`, `height`, `yaw` (clockwise seen from above; a figure faces south at 0, so 180 faces north), `pitch` (raising its south side, which is a figure's front), `roll` (raising its west side), `visible`, and a figure's `pose`: `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, and on film alone `twist` (its upper body turning over its hips, clockwise seen from above), `lean` (its upper body leaning forward over its hips), `rightWrist` and `leftWrist` (each hand turning on its forearm), all at any angle. A figure's `face` is a name (`listParts` in Brick Studio names them, and `frameFaces` the ones a film alone wears: `scared` and `asleep`): it changes at its key, at once, and stays until the next, the face the actor was declared with showing before the first. A face never eases from one to another; the swap is the stop-motion way, and it reads best on a motion that hides it (a head turn, a shake, arms flying up). Its position is the middle of the bottom of its footprint, and it turns about that point. A ridden figure sits where its offset puts its feet: a seated figure (both legs at 90) sits 2 plates lower than it stands.

An actor with wheels rolls them on its own: they turn by the distance it moves along its own north.

A figure or a creature on studs is clicked onto them, as in a brick film: its feet on two studs side by side, square to them, never sliding. A walk is a stud a step, each step a pivot over the edge between two rows of studs (the trailing toe and the leading heel meet there, the hips rise a fifth of a plate, the legs scissor about 39°, and the next row clicks in); a corner is a quarter turn on the foot inside the turn, a diagonal a staircase of steps and turns, and a step onto another level (a brick, a plate, a tile) a hop. Anything else that moves it over studs leaves it clicked in where it stands until where it is keyed lies a stud on (or a quarter round), and then it hops (or turns) there; in a crowd, a stud straight ahead is a step. Its idling and the boil only tilt it a little, never off its studs. Off studs (on tiles, a slope), in the air or lying down, it goes where it is keyed, and a walk takes the same steps and turns along the path itself. The ground under it is read from the studio when the film is staged; before that, the whole floor counts as studded baseplate.

A figure is never perfectly still, as in a brick film: wherever none of its walks, idles, paths or crowds moves it for more than half a second, it idles subtly on its own (breathing, a slight sway, now and then a glance), over the pose it stands in, its keys still setting what they name. The stage says which actors are figures, so a figure cast from the set idles too, and a car or a building never does; `a.still()` keeps one exactly as keyed. The timeline shows what the scene writes, so this idling has no band of its own.

A story in more than one place cuts between the build's sets: the street, then `set.at(9, 'Garage')`, the garage. A set never eases into another; every set the scene names is staged when the film is, so the cut draws at once, and an actor goes wherever its keys put it in whichever set stands, so the car that left the street rolls into the garage.

A shot runs from one cut to the next. A move may end exactly where the next shot cuts in: `.at(4.5, { orbit: { angle: 15 } }, 'linear').cut(4.5, { position: ... })` moves to the end of one shot, then cuts. An orbit's angle eases by the numbers written, so 345 to 15 swings back through 180 while −15 to 15 swings through 0; a plan shows which way a swing goes.

### The edit

Every time a scene writes is the scene's own: its keys, its sounds' starts, a seek's time. Its `speed` stretches them on the screen: a quarter as fast shows four film frames for each frame of the scene, every key, path and wobble read between the scene's frames, and the film runs longer than the scene (`describeFilm` gives both, `seconds` and `filmSeconds`); the timeline's ruler is the film's own time. A sound starts where its moment shows and plays at its own pace, however fast the scene runs. A film runs at most 7,200 frames at its speed.

A transition is the film's camera's: over its seconds the shot the cut leaves still shows over the one it enters, through the camera as its keys before the cut place it (holding its last place as the world moves on, kept out of the parts as its last frame was); a value first keyed at the cut, such as its lens, holds before that key, so the shot left keeps it as the frames before the cut showed it. Across a set change it is the street as the last frame before the cut showed it, held. A later cut ends a transition still running, with or without one of its own; a cut at the film's start has nothing to leave. A view cuts plainly.

Depth of field is the scene's: once a camera key names an aperture, every look draws it, Draft and Plastic included, so the shallow look shows as the film is made; with none, Photo and Path traced draw a toy photo's f/8 and the looks below are sharp throughout. A shallow lens wants its focus said: on whom the shot is about (`focus: driver`, `{ actor: driver, height: 10 }` for a face), and a rack focus moves it, `.at(4, { focus: cat }, 'hold').at(4.6, { focus: car }, 'ease-in-out')` pulling from the cat to the car over 0.6 s. A focus given as studs ahead stays that far ahead however the camera is kept out of parts.

A roll, like every keyed value, holds before its first key: key `roll: 0` where the camera stands level before a later roll. A dolly zoom draws the camera along its line to its target as the lens narrows (and back as it widens), from the lens key before the run of `dollyZoom` keys, so the target keeps its size while the world behind it stretches or flattens; after the run the camera stays where the run left it, and a later run draws on from there, until a key places the camera again. Only a fade to black lowers the film's sound; a flash or a fade to white leaves it.


## The Screen

Each time the scene runs, Stop Motion turns it into a reel, every frame of the film as data, and loads it into Brick Studio once. From then on the timeline only names a frame and the studio shows it: playing, scrubbing and seeking all happen in the studio, the fade and the titles drawn there too. The film plays in the studio while the timeline is scrolled out of view.

The studio holding a build is the main one: its build holds the sets, and its camera is the film's. A Brick Studio with no build of its own is another screen, showing the same set through the scene's next `view`: give the scene a plan view, and a second studio is the film's map. When two studios both hold a build, the film waits until one of them is emptied.

Brick Studio plays the film full screen: the button on its strip fills the screen with the studio, and the strip then carries the film's controls (play and pause, a scrub bar and the film's time; Space and the arrow keys besides), each press asked of Stop Motion's own transport, so the timeline and the studio stay one film. While the film plays the strip rests out of sight once the pointer stands still off it; moving it brings the strip back, and Esc or the button leaves.

The strip under the timeline is the film's picture track: a small picture of each frame, taken from the studio while the film is neither playing nor exporting, without moving the picture the studio shows. **Storyboard** turns it into a cell per camera shot: the shot's middle frame, captioned with its name and span; a press seeks to the shot's start, and the shot the playhead is in stays marked while the film plays. With more shots than fit, the track scrolls. The choice is kept in your browser.

**Export MP4** shows every frame in the studio at the scene's size, captures it with its fade and titles, and encodes the film as H.264 in an MP4 for the browser to save. Changing the scene during an export stops it.

While the film is shown, Brick Studio says so and offers a way back to its build. Pressing it pauses the film at once; **Stage again** shows the film in the studio once more. Nothing in a film is written to the build.


## The File

A film is saved to your Drive as one file: the main studio's build (the set), then the scene, carried in the same LDraw file as a data section (`0 !DATA scene.js`). Brick Studio opens that file as an ordinary design, and keeps the scene in it when it saves, so a film saved from either is whole.

- **Save** saves the set and the scene together. The first save asks for a name and a folder; after that, Save writes over the film's own file, the one it was saved as or opened from, wherever it is.
- **Open…** opens a film: its set into the studio and its scene into the code block, and the film plays on the new set. A plain design opens its set alone and keeps the scene.
- **New** clears the set (its ground kept) and starts a new scene.

The scene is written into the code editor's tab named `scene.js` as it stands then (a tab renamed from it is left alone; with none, a new one). With no code editor, Open and New change nothing. If the scene cannot be written once the set has changed, Stop Motion says so and the film shows unsaved changes.

The bar says the film's name and whether it has changed since it was saved or opened. New and Open read the film as it stands just before changing it and ask first rather than lose unsaved changes; a set that cannot be read counts as changed, and an edit made in the studio after that read stops the change with nothing replaced. Save, Open and New run one at a time, in the order asked; a Drive that does not answer within 30 seconds is refused, so the next one runs. Stop Motion is between the two parts: it reads and writes the studio's build and the code block's scene, and nothing else.


## The Sound

A film's sounds are the person's own files in the Platform, however they came there: uploaded, or made by a Charm (`create_audio` speaks a line, `create_music` composes a piece; each returns the file's id). A scene plays one by its URI, `charmiq://file/<assetId>`, reading it through the Drive; *Add sound* picks one from the Drive's folders and writes its line into the scene at the playhead (`sound.at(1.5, 'charmiq://file/…') // Horn.ogg`). The few sounds Stop Motion's example films play ship with it and play by name; they are the audio files in [`sounds`](charmiq://./sounds/README.md), the folder the manifest declares as `sound/` (a sound added there plays by its file's name, with no other change), each Creative Commons Zero.

Stop Motion plays the film's sound itself as the studio shows its picture: started with the playhead, from wherever it starts, seeks or loops, and waiting the moment the studio takes to show a frame so the two meet on screen; at the film's end or its loop the last sounds play out, and a pause stops them at once. The film's fade fades its sound too. A sound following an actor sounds from where the actor stands in the camera's picture, however the camera tilts. A browser lets an Application sound only once the person has pressed in it: a film played otherwise (a Charm's `play`) stays silent, and a *Sound off · click to hear* chip lets it in. A sound whose file cannot be read is left out and a *Sounds missing* chip names it; with none readable, a *No sound* chip says why.

Exported, the film carries the same mix as AAC in its MP4, without any sound that could not be read (the export button names them). A browser that encodes no AAC exports the picture alone, and the export button says so.

## The Timeline

A row per track: the camera, each view, each actor, the sets the scene cuts between, the fade and the titles. A key is a diamond, a path a solid band, a wobble or shake a striped band, the fade a ramp to black, a title its words. A camera's shots alternate shades from cut to cut, each named, and so do the sets, each named from its key. Where two actors come within 2 studs of each other, a red notch on both their rows marks the moment they come closest. Keys too close to tell apart draw as one diamond with their count on it, and bands sharing a span stack, the row growing to fit, so nothing hides another.

The Sound row draws each sound as its waveform, over the span it plays once read (over and over to its `until`), named by its file. Drag a sound along the row and it moves to the frame it is let go on: its time is rewritten where its line writes it (its `until` with it), and nothing else in the scene changes. The timeline reads only code for the call, never a comment or a string, and checks the edit before writing it: the scene as edited must play the same sounds with only that one moved, and the editor takes the edit only while the scene still reads as it was measured. A sound whose time the scene writes as an expression (`LATE`, `HOME + 0.2`) stays where it is, its title saying the line to change.

Drag anywhere else on the ruler or the rows to scrub; a diamond seeks to its key. The rows scroll under the playhead, which stays on the ruler. Hovering shows a dashed line following the pointer, its time on the ruler. Hold ⌘ (Ctrl off a Mac) as you move and the sheet beside the timeline shows that moment instead of the film: the studio's own picture of the frame (the picture track's nearest, developing, until it arrives), its time, frame, shot and set, where the row's actor or camera stands then, and every mark under the pointer with what it sets, lit on the lane. Let go and the film's sheet comes back. ⌘-click (Ctrl-click) pins the moment in the sheet, marked on the ruler, until Unpin or Escape lets it go; a plain click still scrubs. A key focused from the keyboard shows its moment too. With the timeline focused, the arrows step a frame (with Shift, a second), Home and End go to the ends, and Space plays.

The timeline opens with the whole film across it, and zooms in from there (never further out): pinch on a trackpad, or hold ⌥ (Alt) and turn the wheel, and the moment under the pointer stays under it; with the timeline focused, `=` and `-` zoom about the playhead and `\` fits the whole film (press it again to return); the ruler's corner holds the same as − / Fit / + buttons. Zoomed in, keys drawn as one diamond with a count draw apart, the rows scroll sideways under their names (a sideways swipe, or Shift with the wheel), and the ruler labels halves, quarters and frames. While the film plays, the view turns a page as the playhead leaves it. The picture track under the timeline always shows the whole film, a yellow bracket framing the span the timeline shows: drag its grip along the top to pan, drag either end to zoom; the pictures under it still seek when pressed.

Opening a film says so: the film picked in the Open dialog shows *Opening…* while everything else in the dialog waits, and the bar says *opening…* until the film is staged. Staging shows its progress in the status, loading the film into the studio frame by frame.


## The Commands

A Charm writes the scene in the code editor's `scene.js` tab, then works the film through these:

| Command | Does |
|---|---|
| `describeFilm` | the studios and editors found, whether the scene is staged, and the film: title, seconds, fps, frames, actors, views, its shots (each with the set it starts on), its set keys, its sounds, every two actors that come within 2 studs, where the camera stands inside a part or an actor or has its target hidden, where an avoiding camera was drawn in, and its log, or the scene's mistake and its line; and the sounds Stop Motion ships |
| `seek` | shows a moment (`time` in seconds, or `frame` from 0) in the studios, answering once the studio has drawn it, so a screenshot sees it |
| `play`, `pause` | the transport |
| `storyboard` | shows up to 12 moments at once on a sheet over the main studio, each captioned with its time and shot (the middle of each shot when no `times` or `frames` are given), through a `view` when named: a screenshot of the studio reads them all. The film's next move closes it |
| `measure` | where two actors come closest, over the film or `from` and `to`: the gap between their boxes in studs (each its footprint turned by its yaw and its height; 0 when they touch) and where each stood |
| `where` | every actor's position and turn, the camera and the set standing, at a `time` or `frame` |
| `screenOf` | every actor on the screen at a `time` or `frame`, as the studio's camera draws it: its box across and down as shares of the frame, how far ahead, whether it is in frame; and the camera's problem then |
| `reviewCuts` | every cut as an editor reads it: the frames either side, each side's subject, where it stands on the screen and which way it moves, the camera's turn and each shot's length, and what an editor would flag (crossing the line, a jump across the screen, a jump cut under 30°, a shot under a second, a subject out of frame, the camera inside something or its target hidden) |
| `listFilms` | the films (and designs) in the films folder, each by name and uri |
| `saveFilm` | saves the set and the scene as one film: under `name` in the films folder, or over the film's own file wherever it is; another film of that name needs `replace` |
| `openFilm` | opens a film by `uri` or `name`: its set into the studio, its scene into the code block (a plain design, its set alone) |
| `newFilm` | clears the set and starts a new scene |

`openFilm` and `newFilm` refuse while the film has unsaved changes unless given `discard: true`; save the film first to keep it.

A Charm can also stage a still without a film: Brick Studio's own `stage` and `frame` commands put actors anywhere.

A Charm sees stills, never playback, so the film is also read as it looks. Staging asks Brick Studio's `probeStage` what each frame's camera stands inside and what stands between it and its target, against the cells the set's parts fill (glass, window and door frames and fences hide nothing). `describeFilm` lists where the camera goes wrong, `screenOf` places the actors on the screen, and `reviewCuts` reads each cut. A plan draws the camera's path dashed where it stands inside a part.


## The Files

| File | Purpose |
|---|---|
| [`Studio.md`](charmiq://./Studio.md) | the studio as one page, no words: the screen and the scene side by side over the timeline, on a bench of studs, its film the homecoming (a street and a garage, two sets) |
| [`manifest.json`](charmiq://./manifest.json) | scopes, the import map and the command surface |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: the scene, the studios, the playhead, the timeline and the picture track, wired |
| [`src/director.ts`](charmiq://./src/director.ts) | each scene run into a film and staged; the latest scene is the one the studios show |
| [`src/recorder.ts`](charmiq://./src/recorder.ts) | runs a scene's code and records it as data |
| [`src/scene-runner.ts`](charmiq://./src/scene-runner.ts) | the worker a scene runs in |
| [`src/scene-source.ts`](charmiq://./src/scene-source.ts) | the editor's `scene.js` tab, followed through renames and removals, written, and edited a range at a time |
| [`src/scene-edit.ts`](charmiq://./src/scene-edit.ts) | the timeline's edits of the scene: a sound added, a sound moved |
| [`src/film.ts`](charmiq://./src/film.ts) | a recorded scene as a frame per frame (keys, rides, orbits, rolling wheels, shots, plans), each frame as the studio's reel takes it, and a plan's marks |
| [`src/measure.ts`](charmiq://./src/measure.ts) | how far apart actors come |
| [`src/ground.ts`](charmiq://./src/ground.ts) | the ground actors follow: the surfaces under them asked of the studio and followed frame by frame |
| [`src/screen.ts`](charmiq://./src/screen.ts) | what a frame's camera sees: a point's and an actor's place on the screen, as the studio draws it |
| [`src/clearance.ts`](charmiq://./src/clearance.ts) | the film's camera against the set's parts: what each frame's camera meets, and an avoiding camera drawn in |
| [`src/review.ts`](charmiq://./src/review.ts) | the film read as it looks: where the camera goes wrong, and each cut as an editor reads it |
| [`src/studios.ts`](charmiq://./src/studios.ts) | the Brick Studios found, the main one chosen, the reel staged, each frame shown, each studio's state followed |
| [`src/player.ts`](charmiq://./src/player.ts) | the playhead and its clock |
| [`src/sound.ts`](charmiq://./src/sound.ts) | the film's sounds, read (Platform files through the Drive, shipped sounds as resources) and decoded once, their waveforms, and the mix a film's cues make, for playing and exporting alike |
| [`src/sound-dialog.ts`](charmiq://./src/sound-dialog.ts) | *Add sound*: the Drive's audio files to pick from |
| [`src/soundtrack.ts`](charmiq://./src/soundtrack.ts) | the film's sound as it plays, on the playhead's clock |
| [`sounds`](charmiq://./sounds/README.md) | the sounds Stop Motion ships for its example films, and where each comes from |
| [`src/timeline.ts`](charmiq://./src/timeline.ts) | the timeline |
| [`src/timeline-marks.ts`](charmiq://./src/timeline-marks.ts) | the timeline's marks as data: its rows, keys grouped, bands stacked, what lies under a moment, where each track stands |
| [`src/inspector.ts`](charmiq://./src/inspector.ts) | the sheet's inspector: a moment of the film in the sheet's place |
| [`src/strip.ts`](charmiq://./src/strip.ts) | the picture track, a strip of film |
| [`src/export.ts`](charmiq://./src/export.ts) | the film as an MP4 |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
| [`src/films.ts`](charmiq://./src/films.ts) | the film's files: save, open and new, and whether the film changed since |
| [`src/film-file.ts`](charmiq://./src/film-file.ts) | a film as one LDraw file: its set, then its scene as a data section |
| [`src/film-dialog.ts`](charmiq://./src/film-dialog.ts) | the save and open dialog, the Brick family's own |
| [`../brick-shared`](charmiq://../brick-shared) | what Stop Motion shares with Brick Studio: the Drive, designs and their dialog (the dialog brings its own styles, `design-dialog.scss`), and the family's look (`_family.scss`, `_kit.scss`) |
