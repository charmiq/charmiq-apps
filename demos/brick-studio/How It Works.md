# How It Works

The details behind [Brick Studio](charmiq://./README.md): the grid and the check, the parts, components, steps and designs, building together, the commands a Charm drives it with, and the code.


## The Build

The build is LDraw text in the document's `model` app-content. Each part is one line: its color, its position and rotation, and its part file. Edit it by hand, paste in LDraw from elsewhere, or let a Charm build it.

LDraw pasted into an app-content with no name, or named `Model` or ` model `, is found too: when no app-content is named `model`, the one such app-content holding parts is the build. The Studio edits it in place, its name and other lines left as they are, and it stays the build when its parts are gone. One named `model` always comes first; two such app-contents wait as two builds do (see Building Together).

A build without components is a flat LDraw file, or a single main-model section (`0 FILE model.ldr` through `0 NOFILE`) once the Studio has written it whole (Clear, `setModel`). A build with components is a standard multi-file LDraw (MPD) file: the main model first, each component a `0 FILE` section after it, and a copy one line naming its component, so other LDraw tools open it as it is. A set holds at most 20,000 parts; a Charm adds at most 400 in one call.


## The Grid

x runs east, z north, level up. A cell is one stud; a level is one plate, and a brick is three. A part is placed by the south-west corner of its footprint and its bottom level, and turns in quarter turns clockwise seen from above.

Parts from the catalog on the grid are checked. Any other part line is kept, drawn when its part is in the catalog, and counted as off grid.

**Reach.** A part is on the grid only while it and every cell it fills lie within 2^48 studs (and levels) of the origin, where its arithmetic and its LDraw numbers stay exact. One further off is off grid, its line kept; a model whose numbers overflow once its submodels are placed is given back as written, never flattened. A line is drawn within 262,144 studs of the origin and at most 4,096 times its size, where a graphics card's numbers still place it to a sixty-fourth of a stud; one beyond is kept and counted as too far or too large to draw.

**The baseplate** grows with the build, 4 studs past it on every side, from 16 to 808 studs a side. A wider build stands past its edge, and the status says so.


## The Check

Each part fills the cells and levels measured from its shape: a corner brick leaves its fourth cell empty, and the space under an arch's span or an inverted slope's underside is open. A tree's or plant's foliage spreads over the cells around its base from higher up, so smaller parts fit beneath it. A cell the part reaches into at all counts as filled, up to the part's highest point there.

- **Collisions.** Two parts collide when they fill the same cell at the same level. An edit that would collide is refused whole.
- **Holds.** A part holds the part above it where its top studs lie under a cell that part fills from its bottom. Tiles and ridges have no top studs; a slope has them only along its high row.
- **Glass.** A glass pane fills nothing. It is held by the window at its own position, and a second pane there collides.
- **Floating.** A part with no chain of holds down to the baseplate floats.


## The Parts

- **Building:** bricks, plates and tiles in the common sizes; slopes at 45, 33 and 65 degrees, inverted slopes, ridges and roof corners; corner bricks and plates, wedge plates, round bricks, plates, a tile and a cone; arches; curved slopes and inverted curves; cones, dishes, a dome and a half cylinder; windows and a door frame, with glass panes that sit in the windows.
- **Landscaping and detail:** trees, a bush, leafy plants, bamboo, grass, flower and leaf plates, a rock, crystals, fences, tall bricks, a round pillar, log bricks, panels, headlight and grille bricks, and round, rounded, corner and swirled tiles.
- **Creatures,** from cats and dogs to a cow, an octopus and two snakes.
- **Vehicles:** wheel sets, mudguards, a windscreen and a steering wheel.
- **Figures,** in a shirt of the placement's color with a printed face (the classic smile, or another `face`: expressions such as grin, laugh and surprised, characters such as beard and sunglasses) and legs blue or in their own color (`legColor`).
- **Hinges and turntables:** a hinge 1x2 that tilts, a hinge plate 1x4 that swivels, and turntables 2x2 and 4x4.
- **Side-stud bricks:** a headlight brick, bricks with studs on one, two or four sides, bricks 1x2 and 1x4 with side studs, and a bracket.

**Posing a figure.** A figure's head, arms and legs each turn in steps of 15 degrees (`pose`): an arm or a leg swings forward (90 points it ahead, 180 straight up), the head turns clockwise seen from above. A posed figure keeps its place: raising an arm moves only the arm's cells, which collide like any part's. It stands on its lowest point, so a seated figure (both legs at 90) sits on a seat placed at the seat's top level, held by its studs. To change a pose, remove the figure and add it posed. LDraw shows the pose as it is: each limb's line turned about its joint.

**Dressing a figure.** A figure wears a hat or hair (`hat`) and holds a thing in each hand (`rightHand`, `leftHand`), each a part and a catalog color: a cap, a cowboy hat or a knight's helmet; a sword, a spear, a lance or a flashlight. `listParts` names them all. A hat turns with the head and a held thing with its arm, its handle in the hand's grip. Some things are held two ways (`grip`): a flashlight by its handle or its body, a lance by its shaft (couched ahead) or its stub (carried upright). What a figure holds collides where it reaches, but never lifts the figure: a spear held low reaches through the ground. In LDraw each is one more line after the figure's pieces.

**Hinges.** A hinge's top turns in steps of 15 degrees (`angle`) and carries one component (`carry`): a chest's lid, a drawbridge, a turret. The hinge 1x2 tilts its top about an east-west axis at rotation 0, 90 raising its south side upright; the hinge plate and the turntables swivel theirs clockwise seen from above. `carry` places a copy of a component on the hinge's top as it would stand with the hinge at 0, so a build is built closed and then opened. The carry turns with the top and fills every cell its parts reach into once turned; cells it only touches stay free, and a close fit can still be refused, so give a lid room to swing. A carry swings over its hinge's axis as it rises: a drawbridge that lay south of its hinge stands upright one stud north of the hinge when raised to 90, and fills a slanted band on the way up. It never collides with its own hinge, and only its hinge holds it: put whatever rides on it inside its component. A removal naming any cell of the carry removes the hinge with it. A component's own hinges carry components too, one deep: an opening chest is a component, its lid a component carrying none. A saved design whose hinges carry components opens as a build rather than becoming a component. In LDraw the carry is the component's line right after the hinge's own lines, turned with the top.

**Side faces.** A brick with studs on a side carries one component on each studded face (`sides`): headlights and a grille on a car, a sign on a wall, lamps on a post. Build the detail flat as a component, then mount it. Faces are named as the brick stands at rotation 0 (`north`, `east`, `south`, `west`) and turn with it. Each face has its own map, seen from outside: x runs right and z up, and x 0, z 0 is the cell of its first stud (the leftmost in its row nearest the top). The component stands on that map as a copy stands on the grid, covering at least one stud, its plate against the face and its top facing out; seen from outside, it looks as it does from above, its north up. A mount collides where it reaches, with the brick's other mounts too but never with the brick, is held by its brick alone, and is removed with it. A component's own bricks carry on their faces too, one deep, as its hinges do: a store's sign band carries its signs, and a sign carries nothing. In LDraw each mount is the component's line right after the brick's lines.

Sixteen solid colors and seven see-through ones (`trans-`), which refract light at the Plastic look and up.

The building parts come with the Studio. Every other family (vehicles, figures, nature, details, and each creature) is read the first time a build shows one of its parts, and a part's shape is built the first time it is shown, so a big catalog never slows the Studio down. While a family loads the status says so (*loading vehicles…*). A family that cannot be read is named in the status with the parts it leaves unshown, and a Retry; the build itself never changes.


## The Ground

The swatch beside the save and open buttons colors the baseplate: grass, a road, sand. The color is part of the build, a `0 !BRICKSTUDIO GROUND green` line at the top of its LDraw that other LDraw tools pass by, so it is saved with designs and undone like any edit, and it stays that color in a dark theme. Theme returns the baseplate to the theme's color. Parts still stand on it at level 0. A ground change the build cannot take (one it shows but does not edit) says *ground not changed* in the status, the reason on hover.

## The Sky

The swatch beside the ground's puts a sky behind the set, in place of the theme's backdrop, at every look. Its panel picks the kind:

- **Generated**: a gradient from a horizon color to an overhead one, with clouds from none to overcast (heavier cover grays them, as an overcast day is), and **New clouds** for other clouds alike. The clouds come from a seed alone, so the same sky is drawn the same way in every look, screenshot and export, and it costs no file.
- **Picture**: an image from your Drive. A panorama (a picture about twice as wide as it is high, as panorama cameras and sky libraries write them) wraps the whole sky; any other picture is tiled round the horizon, every other copy mirrored so the seams meet, with its own top and bottom colors above and below it. The picture stays in your Drive: the build names the file, never its pixels, and each viewer reads it with their own access. Until it is read, and when it cannot be, the generated sky its colors name stands in, and the status says *sky picture could not be read*.
- **Theme**: the theme's backdrop again.

**Lights the set** lets the sky light the build as well as stand behind it (Photo and Path traced reflect it), as an outdoor shot needs; otherwise the sky is a backdrop and every look keeps the light it was tuned with. Below the horizon, past the baseplate's edge, the sky goes on in its own color just above the horizon, so the weather meets the ground.

Like the ground, the sky is the set's: a `0 !BRICKSTUDIO SKY ...` line in its header (`HORIZON #CFE2F3 ZENITH #4F87C7 CLOUDS 0.35 SEED 1`, or `IMAGE charmiq://file/...`, with `LIGHTS`), saved with designs, undone like any edit, kept by Clear and by a copy of the set. A line Brick Studio cannot read is kept as written and draws no sky. A sky change the build cannot take says *sky not changed* in the status.


## Components

A thing a build repeats (a tower, a house, a tree with its fence) is defined once as a component, in its own small grid, and placed as many copies as the build needs, each turned and moved as a part is. A copy is checked like any part. Removing any cell of a copy removes the whole copy, and changing a component changes every copy.

A line another program wrote placing a component is removed whole the same way, even when it is not a copy on the grid (a component whose parts take the copy's color). A removal never edits a component's definition.


## Sets

A build can hold more than one set: each an arrangement on its own baseplate, with its own steps and ground, sharing the build's components. A film's street and its garage are two sets, and the car is a component both can place. The sets share one grid, so a part at x 4 stands at x 4 in each.

- **In the file.** The first set is LDraw's main model, the one every LDraw tool opens. Each further set is a section holding a `0 !BRICKSTUDIO SET Garage` line, written to a file of its own (`garage.set.ldr`); other LDraw tools list it as a submodel nothing places. A build written before sets is one set, named Main until it is renamed.
- **The menu.** With more than one set, a tag in the bar names the set shown and opens a menu of the sets. The steps, the ground swatch and the view buttons act on the set shown. An edit to another set leaves the set shown as it is, its step included; a Charm's edit to a set shows that set.
- **Naming the set.** A Charm names the set on every command that reads or edits one (`set`); in a build of more than one set, a call naming none is refused, listing the sets. Redefining a component is checked in every set, since every copy changes with it.
- **Limits.** A build holds at most 32 sets, each at most 20,000 parts. A build holding more sets is shown but not edited, and `setModel` refuses one.


## Steps

A build can be split into building steps, LDraw's own `0 STEP` lines, so other LDraw tools show the same steps. The play, step and back buttons under the status show the build as it stands after each step, its parts dropping in. Playback never changes the document, and any change to the build ends it. A Charm starts a new step by adding parts with `newStep: true`.


## Designs

The save and open buttons keep builds in your Drive. Each design is a Source document of plain LDraw text, named for the design (`Beach house.ldr`). Designs go to My Drive until you choose another folder, which the Studio then remembers. Saving a name already there (in any case) asks before replacing it.

- **Finding a design.** A design listed by `listDesigns` or the Open dialog opens by its document, whatever its name shares. A design named in a command is found among the first 50 whose names hold it; past that the Charm is pointed to its `uri`, and saving refuses rather than risk a second design of the same name. A folder search shows its first 50 folders and asks you to refine it when more match.
- **Adding a design to a build.** Opening a design over a build offers to add it instead: the design becomes a component and one copy stands on the ground beside the build, where nothing is. Adding one already in the build asks before updating its copies to the design.

- **Files a design carries.** A design may carry other files beside the build, as LDraw data sections (`0 !DATA name`, their text in `0 !:` lines): a [Stop Motion](charmiq://../stop-motion/README.md) film carries its scene. The Studio keeps them as written and where they stand through every edit and save, never as parts (a component's lines after one are still the component's, replaced or removed with it); Clear removes them with everything else.

Reaching the Drive takes the `mcp.platform.vfs` scope, which can reach any document you can.


## The Look and Moving Around

The Look slider sets how real the bricks look, in five stops: Draft, Plastic, Shaded, Photo and Path traced. Each stop costs more of the graphics card than the last. The stop is each viewer's own and is kept in their browser, never in the document. Path traced builds its scene over every stud it is given, so a baseplate past 65,536 studs (a build spread over more than about 256 studs each way) keeps its studs within 16 studs of the parts there, the rest of the plate plain; the other stops always draw every stud. Path traced also merges every part it draws into one scene, so past 3,000 parts shown (a set and its actors) it draws as Photo, saying so beside the slider, until fewer are shown. Photo and Path traced focus on what lies at the middle of the picture as a camera's autofocus does: held while the view moves or parts drop in, found again once the picture rests, and a screenshot or a look around waits for it.

Drag to orbit, right-drag to pan, scroll to zoom. Or walk with the keys once the Studio has focus: W and S forward and back, A and D sideways, Q and E turn, Space and C up and down, Shift to hurry. The corner button takes the Studio full screen; Esc leaves. The info button in the bottom corner, or I, shows these again.


## The Stage

The Studio can show a scene in place of the build: a still for a Charm (the car in mid-air over the ramp), or the frames of a film another Application drives, as [Stop Motion](charmiq://../stop-motion/README.md) does.

- **The sets** are a build's: the Studio's own, or LDraw text the stage call gives (`ldraw`). A stage stands the sets it names (`sets`, at most 8; the first set alone when it names none), one at a time: the first, until a frame names another. Each is drawn as it stands, its meshes built when the scene is staged, so a cut to another set draws at once; nothing on a stage is written to the build.
- **Actors** belong to the scene, not a set: an actor cast from a piece of the street is drawn in the garage wherever its frame puts it.
- **Actors** are named once when the scene is staged: each a component of the set (the car), a catalog part dressed as a placement is (a figure in a helmet), or a piece standing in a set: a part or a copy by where it stands, or one part of a copy by where it stands in its component (`placed.inside`, as `listComponents` with the component lists its parts: a clerk in one store, the store left standing, a part in LDraw's inherited color in its copy's). A part is cast once, whole or within its copy. An actor is never on the grid and never checked. The answer names the actors with wheels and those that pose, and each piece's rest: where it stood, and a figure's pose there, which a frame's pose turns from.
- **A frame** puts each actor anywhere. Its position is the middle of the bottom of its footprint, in studs east and north and plates up, fractions allowed; it turns about that point, rolled then pitched then yawed (yaw as a placement turns, pitch raising its south side, roll its west side). A figure's limbs take any angle, and its wheels turn as the actor having rolled any distance along its own north: each wheel set by its share, backward when it is turned round, not at all when it is turned across. An actor a frame leaves out is hidden. The frame's camera stands where it says, looks at its target, takes any lens and turns clockwise about where it looks by its `roll`, as seen from behind it. Its `shift` shifts its lens up by that share of the picture's height (down when negative, from -1 to 1), so a level camera looks down at the floor with every vertical upright; it is Blender's vertical lens shift measured against the picture's height, where Blender's `shift_y` is against the larger side. Every look draws through it, Path traced included; a plan and the build are never shifted. It focuses on its `focus` (a point, or studs ahead along the view; its target when left out), and its `aperture`, an f-number from 1 to 32, gives the frame a depth of field at every look, Draft included: f/1.4 leaves only what it focuses on sharp, as a brick film's macro lens does. With no aperture, Photo and Path traced draw their own f/8 and the looks below are sharp throughout.
- **The light** is the look's own unless the stage call says (`light`): its key scaled (0 to 3), its fill, the studio's environment and sky, scaled (0 to 4), its exposure scaled (0.25 to 4) and its key's shadows softened (0, the look's own, to 1, the softest), at every look, the path tracer's key softened with them. A high-key room (a school bathroom's white tiles) is a low key, a strong fill and a soft shadow. Unstaged, the build's light is the look's own again.
- **A capture** answers the frame as an image, once settled, for the Application asking: the stage draws at that size from then on, and the canvas shows it whole.

While the scene shows, the picture is framed as film, a band of sprocket holes along its top and foot, and a strip says so and carries a Back to the build button, a Move the view button and a full-screen button; the Studio's own controls rest. Where a pointer hovers, the strip stands only while it is over the studio or a control in the strip holds the keys. **Move the view** hands the camera to the person: the mouse turns and zooms round the scene while the film plays on, its actors posed frame by frame and the camera left where the person put it; pressed again, the film's camera stands at its next frame. A capture an Application asks for is still taken through the frame's own camera, the person's view standing again after. Staging the scene afresh lets the view go; staged again keeping the picture, it stays held. Full screen over a film, the strip carries the film's controls: play and pause, a scrub bar and the film's time (Space and the arrows besides). Each press is asked of the film (the Application playing it counts each ask on the stage's stream, which names the reel it stands for), and the frames it then shows answer it. While the film plays, the strip rests out of sight once the pointer stands still off it. The button shows the build again, with the camera where it stood, and refuses the film's next frame until it stages the scene again, so a film pauses rather than taking the view back. Edits made meanwhile reach the build, and the strip says the build changed.


## Building Together

The `model` app-content is the truth: the Studio shows what it holds, whoever changed it.

**Edits.** Each edit changes its own lines alone (an add appends lines, a removal deletes them), so every other line stays exactly as written. An edit is checked against the app-content's text and applies only while the app-content is still that text. If someone changed it first, the edit is checked again on the new text, so a part removed by cell is whatever fills that cell now. The check covers the text the edit was made on: two people's editors can each accept an edit before seeing the other's. Ordinary concurrent part edits merge. Conflicting edits can still produce collisions, which the check reports, and other unexpected results, which it does not.

**Structural edits at once** are worth coordinating, or checking afterward:

- A build the Studio writes whole (its first component, Clear, `setModel`) ends its main model with LDraw's `0 NOFILE`, parts before it and components after. Once that end is in the text, adding parts and defining components at once never mix; the moment a flat build gets its first component is the exception (below). An empty build's first part is written flat, so two first parts added at once both stand.
- A component name two people define at once is used from its first definition. The status names it, and defining it again leaves one.
- A flat build given its first component by two people at once has its main model named twice. The Studio shows it but does not edit it until corrected LDraw replaces it (`setModel`), and a part added at that moment can join the new component.
- Two people who each start a build in a document without one create two `model` app-contents, and both are kept. The Studio then says the document holds two builds and refuses every edit (`setModel` included) so neither is lost; `getModel` returns each build's text so they can be combined into one app-content by hand. Two app-contents holding LDraw under a near name, none named `model`, wait the same way until one is named `model`.

**Older pages.** Reload Brick Studio tabs opened before an update: an older page adds parts after the main model's end, which the Studio still shows but other LDraw tools may not. A page opened before guarded edits shows the build and asks for a reload to edit it.

**A deleted build.** When the app-content is deleted the Studio checks, and shows an empty build only once the app-content is really gone. If the check fails, it keeps the build and says so, with a reload to try again.


## Builds It Shows but Does Not Edit

A multi-file model is edited line by line as a flat one is, its sections kept as written: each by its own `0 FILE` name (`.ldr`, `.dat`, `.mpd` or none), which its copies and its redefinition keep. The Studio shows a model but does not edit it when:

- its submodels place others (a component that places another component);
- two files carry one name (`bare` beside `bare.ldr`);
- it has more lines where an assembled part's pieces go than the Studio compares.

The refusal says which, and how to make the build editable. For submodels that is `setModel` with a flat model, which drops the comments inside them. A build whose pieces cannot be told apart is given back by `getModel` exactly as written, and `setModel` takes such text only once the extra lines are gone.

A model whose submodels expand past 100,000 part lines (a figure drawn in pieces takes about ten) or 20,000 submodel references, or whose definitions run past 100,000 submodel lines, is read only in part. The Studio says so, refuses to edit it, and `getModel` refuses to hand it back as the whole build.


## The Commands

A Charm drives the Studio through these:

| Command | Does |
|---|---|
| `listParts` | the grid conventions, every part's name by kind, the colors, the faces, and the faces a film alone wears (`frameFaces`) |
| `findParts` | the rows (size, fills, which way it descends) of the parts a query names: names, a size such as 2x4, or a word such as roof |
| `listPlacedParts` | the parts and copies in the build with their positions, a page at a time (a line placing a component that is not a copy, by component, color and a cell it fills) |
| `addParts` | places a batch of parts and copies of components, in the last step or (`newStep`) a new one, figures posed (`pose`), in their legs color (`legColor`), with a face (`face`), wearing a hat (`hat`) and holding things (`rightHand`, `leftHand`), hinges turned (`angle`) and carrying a component (`carry`), side faces carrying components (`sides`); a batch that would collide is refused; answers with the build's check |
| `removeParts` | removes the part filling each given cell, and a removed window's glass (a cell of a copy, or of any line placing a component, removes that whole line); answers with the build's check and the parts left unsupported |
| `defineComponent` | defines a component, or replaces its definition and so every copy |
| `defineComponentFromDesign` | defines a component from a saved design (its `uri` from `listDesigns`, or its name), named after it |
| `listComponents` | the components the build defines, their sizes and copies (by set, in a build of more than one); with `component`, that component's own parts where each stands in it as a copy holds them (a part in LDraw's inherited color listed as `inherited`), a page at a time: each the address `placed.inside` casts it by |
| `listSets` | the build's sets, each with its parts, copies, steps and ground, and the set shown |
| `addSet` | adds a set and shows it: empty, or a copy of another (`from`) |
| `renameSet` / `removeSet` | renames a set, or removes it and everything in it (never the last; removing the first makes the next the first) |
| `clear` | removes every part, copy, further set and component, and any file the build carries, keeping the first set's name and ground; with `set`, empties that set alone; with `expect`, only while the build is still that text |
| `check` | lists collisions and floating parts, for a build changed some other way |
| `setGround` | colors the baseplate, as the swatch does |
| `setSky` | puts a sky behind a set, as the sky swatch does: generated (`horizon`, `zenith`, `clouds`, `seed`) or a Drive picture (`image`), with `lights`; none for the theme's backdrop. A generated sky is written whole, each value it names none of its default |
| `setView` | turns the camera and frames the build |
| `lookAround` | shows the build from all four sides at once, so one screenshot sees every side, on a sheet that says the Charm is looking and carries a Back to the build button; the button, a click, a key or the next change closes it |
| `setFidelity` | sets the look, from Draft to Path traced, as the Look slider does |
| `probeStage` | what stands at `points` and across `segments` of a set as a stage shows it (staged or not, its cast pieces left out): the part filling each point, and the first part each segment crosses, none holding its end, against the cells collisions are checked in; glass, a `trans-` color, window and door frames and fences hide nothing; a part a hinge or face carries is judged by itself and named by its carrier; and under each of `grounds` (footprints `{ x, z, width, depth, yaw }`), every surface an actor there could stand on: each top nothing stands on, and the baseplate where it is bare, a column under a footprint only where they overlap over some area, a call's footprints reading at most 200,000 columns together; beside them (`studded`), whether each surface is studded under the footprint (the baseplate's studs, or a part's top studs at that level, in every column holding it: a tile's top is smooth) |
| `describeStage` | whether a scene is staged, whether the person went back to the build since, whether the studio holds a build, and its sets |
| `stage` | shows a scene in place of the build: its sets (`sets`, of the build or of LDraw text given as `ldraw`), its `light` over the look's own, its `sky` over every set's own (a film's sky), and its actors, each a component, a dressed part, or a piece of a set by where it stands (`placed`, naming its set: lifted out of that set while staged, its rest answered so a frame there draws it where it stood); answers each actor's box (`sizes`) and which actors click onto studs (`clicks`: figures and creatures). A film's `marks` are what a plan view draws over the set, a path `dashed` where it stands for something hidden. A stage shows its first set alone until a frame shows its actors; an Application staging its film again asks to `keep` the picture standing (its actors where they stood) until the new film's frame shows, so nothing goes bare between |
| `frame` | shows one moment of the staged scene on one of its sets (`set`): each actor where its shot puts it, through a camera; `capture` answers it as an image, for Applications. A figure's shot takes joints a build's figure never turns (`twist` and `lean` of its upper body over its hips, `rightWrist` and `leftWrist` on its forearms), what its hands hold in that frame alone (`rightHand`, `leftHand`: a hand item, or `null`), and the faces on a two-sided head's back (`scared`, `asleep`); a figure's box (`sizes`) is what it measures, 3.12 by 1.85 studs, never the 4 by 3 cells it reaches into |
| `loadReel` | loads a page of a film's frames into the stage, for Applications (`stage` with a `reel` first); each frame names the staged set it stands on (`set`), and its views are cameras, or plans looking straight down over an area, north up, the film's paths, names and camera drawn over it. A frame's `fade` is to its `fadeColor` (black when left out), over the whole picture or, with `fadeShape: 'iris'`, closing in from its edge; its `transition` is the shot it leaves (`camera`, `set`, and on another set the `actors` as they stood), how much of it is `left` (1 all, 0 none) and its `shape` (a dissolve, a wipe toward a side, an iris opening): the shot left is drawn through its own camera, focused there, and on another set drawn once and held until the look, the theme or the parts it draws change. The film's own screen shows it; a view's screen shows its own cuts |
| `show` | shows a frame of the film: at once, the newest asked; with `capture`, that exact frame as an image, its fade and title drawn |
| `thumbnail` | a small picture of a frame of the film, through one of its views when named, the frame shown left as it is |
| `storyboard` | shows up to 12 frames of the film, each captioned, on the sheet `lookAround` uses, for a screenshot to read; the film's next frame closes it |
| `unstage` | shows the build again |
| `getModel` / `setModel` | reads the build as LDraw text, a page of lines at a time, or replaces it (a file of components kept as written); with `expect` (the text `getModel` gave), only while the build is still that text, refused whole once it has changed |
| `listDesigns` | the designs in your designs folder, each by `name` and `uri` |
| `loadDesign` | replaces the build with a saved design (its `uri` from `listDesigns`, or its name) |
| `saveDesign` | saves the build as a design in your designs folder; a name already there needs `replace` |

Every edit resolves once the parts have landed, so a screenshot taken next shows the result. `listPlacedParts`, `addParts`, `removeParts`, `setGround`, `setSky`, `check` and `lookAround` take `set`, and in a build of more than one set each answer names the set it acted on.

A Charm can also call these from the Platform's Run Code: its script finds the Studio among `charmiq.discoverAll('charmiq.command')` (every Application with commands) as the one whose `listSets()` answers, and calls each command as a method, checked as if called directly, so loops and functions build a whole scene in one action.


## The Files

| File | Purpose |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | scopes, the three.js import map, and the command surface |
| [`src/index.html`](charmiq://./src/index.html) | the Studio's markup |
| [`src/styles.scss`](charmiq://./src/styles.scss) | the Studio's styles |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: wires the modules, loads the parts, then the build |
| [`src/catalog.ts`](charmiq://./src/catalog.ts) | the curated parts and colors |
| [`src/grid.ts`](charmiq://./src/grid.ts) | grid placement to and from LDraw transforms, and the cells a turned carry fills |
| [`src/pose.ts`](charmiq://./src/pose.ts) | a figure's pose and a hinge's turn, shared by the grid and the part measurer |
| [`src/model.ts`](charmiq://./src/model.ts) | LDraw text to and from a build: a flat file, a single main-model section, or an MPD file of sets and components |
| [`src/check.ts`](charmiq://./src/check.ts) | collisions and what holds |
| [`src/build.ts`](charmiq://./src/build.ts) | the current build and its edits |
| [`src/stage.ts`](charmiq://./src/stage.ts) | a stage's sets, its actors and each frame's shots, as part lines |
| [`src/set-control.ts`](charmiq://./src/set-control.ts) | the set menu: the set shown, and the build's sets to show |
| [`src/probe.ts`](charmiq://./src/probe.ts) | what stands at a point and across a segment of a set, followed exactly cell by cell |
| [`src/stage-control.ts`](charmiq://./src/stage-control.ts) | the Studio on stage: its strip, its way back and its frames in order |
| [`src/numbers.ts`](charmiq://./src/numbers.ts) | the least and greatest of a build-sized list of numbers |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | the build <-> the `model` app-content, edited with guarded edits |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
| [`src/designs.ts`](charmiq://./src/designs.ts) | the build saved as a design, and a design loaded whole or as a component |
| [`src/design-dialog.ts`](charmiq://./src/design-dialog.ts) | the save and open dialog's Brick Studio choices: add a design to the build, or replace it |
| [`../brick-shared`](charmiq://../brick-shared) | what Brick Studio shares with Stop Motion: the Drive, designs and their save and open dialog (the dialog brings its own styles, `design-dialog.scss`), the dialog that picks a file (a sky's picture), a sky's words (`sky.ts`), and the family's look (`_family.scss`, `_kit.scss`) |
| [`src/viewer.ts`](charmiq://./src/viewer.ts) | the three.js scene: instanced parts, baseplate, camera |
| [`src/frame-request.ts`](charmiq://./src/frame-request.ts) | a frame drawn once, at the next animation frame or after a moment when the Studio is out of view |
| [`src/render/`](charmiq://./src/render) | the look: its stops, the plastic, the studio light, the sky (its panoramas, `panorama.ts`, and the backdrop and light they make, `sky.ts`), the effects and the path tracer; a film's fade, titles and plans drawn over the stage |
| [`src/step-control.ts`](charmiq://./src/step-control.ts) | playing the building steps |
| [`src/fidelity-control.ts`](charmiq://./src/fidelity-control.ts) | the Look slider |
| [`src/ground-control.ts`](charmiq://./src/ground-control.ts) | the ground swatch and its colors |
| [`src/sky-control.ts`](charmiq://./src/sky-control.ts) | the sky swatch and its panel |
| [`src/sheet.ts`](charmiq://./src/sheet.ts) | the sheet over the stage: pictures in a grid, each captioned, for one screenshot |
| [`src/look-around.ts`](charmiq://./src/look-around.ts) | the build from four sides at once, on the sheet |
| [`src/parts/`](charmiq://./src/parts) | the packed parts (generated): `built-in.ldr` comes with the Studio, each other family is a resource read when first shown |
| [`src/parts.generated.ts`](charmiq://./src/parts.generated.ts) | each part's footprint, height, studs and fill, measured, and the family each is read from (generated) |
| [`tools/pack-parts.ts`](charmiq://./tools/pack-parts.ts) | regenerates the parts, the measurements and the manifest's resources |
| [`Brick Builder`](charmiq://./Brick%20Builder.md) | the Brick Builder Charm's Instructions |

**Adding a part.** Add it to `src/catalog.ts`, download and extract the [LDraw Parts Library](https://library.ldraw.org/library/updates/complete.zip), then run `node demos/brick-studio/tools/pack-parts.ts <path to the ldraw directory>` (Node 22.18 or later). The tool measures each part from its geometry, packs it with its family and declares the family in `manifest.json`, and fails on any part that is not on the grid. A new family is named in `familyOf` in `src/catalog.ts`.
