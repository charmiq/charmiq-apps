# How It Works

The details behind [Brick Studio](charmiq://./README.md): the grid and the check, the parts, components, steps and designs, building together, the commands a Charm drives it with, and the code.


## The Build

The build is LDraw text in the document's `model` app-content. Each part is one line: its color, its position and rotation, and its part file. Edit it by hand, paste in LDraw from elsewhere, or let a Charm build it.

A build without components is a flat LDraw file, or a single main-model section (`0 FILE model.ldr` through `0 NOFILE`) once the Studio has written it whole (Clear, `setModel`). A build with components is a standard multi-file LDraw (MPD) file: the main model first, each component a `0 FILE` section after it, and a copy one line naming its component, so other LDraw tools open it as it is. A build holds at most 3,000 parts; a Charm adds at most 400 in one call.


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
- **Figures,** in a shirt of the placement's color with a printed face.

Sixteen solid colors and seven see-through ones (`trans-`), which refract light at the Plastic look and up.

The building parts come with the Studio. Every other family (vehicles, figures, nature, details, and each creature) is read the first time a build shows one of its parts, and a part's shape is built the first time it is shown, so a big catalog never slows the Studio down. While a family loads the status says so (*loading vehicles…*). A family that cannot be read is named in the status with the parts it leaves unshown, and a Retry; the build itself never changes.


## The Ground

The swatch beside the save and open buttons colors the baseplate: grass, a road, sand. The color is part of the build, a `0 !BRICKSTUDIO GROUND green` line at the top of its LDraw that other LDraw tools pass by, so it is saved with designs and undone like any edit, and it stays that color in a dark theme. Theme returns the baseplate to the theme's color. Parts still stand on it at level 0. A ground change the build cannot take (one it shows but does not edit) says *ground not changed* in the status, the reason on hover.


## Components

A thing a build repeats (a tower, a house, a tree with its fence) is defined once as a component, in its own small grid, and placed as many copies as the build needs, each turned and moved as a part is. A copy is checked like any part. Removing any cell of a copy removes the whole copy, and changing a component changes every copy.

A line another program wrote placing a component is removed whole the same way, even when it is not a copy on the grid (a component whose parts take the copy's color). A removal never edits a component's definition.


## Steps

A build can be split into building steps, LDraw's own `0 STEP` lines, so other LDraw tools show the same steps. The play, step and back buttons under the status show the build as it stands after each step, its parts dropping in. Playback never changes the document, and any change to the build ends it. A Charm starts a new step by adding parts with `newStep: true`.


## Designs

The save and open buttons keep builds in your Drive. Each design is a Source document of plain LDraw text, named for the design (`Beach house.ldr`). Designs go to My Drive until you choose another folder, which the Studio then remembers. Saving a name already there (in any case) asks before replacing it.

- **Finding a design.** A design listed by `listDesigns` or the Open dialog opens by its document, whatever its name shares. A design named in a command is found among the first 50 whose names hold it; past that the Charm is pointed to its `uri`, and saving refuses rather than risk a second design of the same name. A folder search shows its first 50 folders and asks you to refine it when more match.
- **Adding a design to a build.** Opening a design over a build offers to add it instead: the design becomes a component and one copy stands on the ground beside the build, where nothing is. Adding one already in the build asks before updating its copies to the design.

Reaching the Drive takes the `mcp.platform.vfs` scope, which can reach any document you can.


## The Look and Moving Around

The Look slider sets how real the bricks look, in five stops: Draft, Plastic, Shaded, Photo and Path traced. Each stop costs more of the graphics card than the last. The stop is each viewer's own and is kept in their browser, never in the document.

Drag to orbit, right-drag to pan, scroll to zoom. Or walk with the keys once the Studio has focus: W and S forward and back, A and D sideways, Q and E turn, Space and C up and down, Shift to hurry. The corner button takes the Studio full screen; Esc leaves. The info button in the bottom corner, or I, shows these again.


## Building Together

The `model` app-content is the truth: the Studio shows what it holds, whoever changed it.

**Edits.** Each edit changes its own lines alone (an add appends lines, a removal deletes them), so every other line stays exactly as written. An edit is checked against the app-content's text and applies only while the app-content is still that text. If someone changed it first, the edit is checked again on the new text, so a part removed by cell is whatever fills that cell now. The check covers the text the edit was made on: two people's editors can each accept an edit before seeing the other's. Ordinary concurrent part edits merge. Conflicting edits can still produce collisions, which the check reports, and other unexpected results, which it does not.

**Structural edits at once** are worth coordinating, or checking afterward:

- A build the Studio writes whole (its first component, Clear, `setModel`) ends its main model with LDraw's `0 NOFILE`, parts before it and components after. Once that end is in the text, adding parts and defining components at once never mix; the moment a flat build gets its first component is the exception (below). An empty build's first part is written flat, so two first parts added at once both stand.
- A component name two people define at once is used from its first definition. The status names it, and defining it again leaves one.
- A flat build given its first component by two people at once has its main model named twice. The Studio shows it but does not edit it until corrected LDraw replaces it (`setModel`), and a part added at that moment can join the new component.
- Two people who each start a build in a document without one create two `model` app-contents, and both are kept. The Studio then says the document holds two builds and refuses every edit (`setModel` included) so neither is lost; `getModel` returns each build's text so they can be combined into one app-content by hand.

**Older pages.** Reload Brick Studio tabs opened before an update: an older page adds parts after the main model's end, which the Studio still shows but other LDraw tools may not. A page opened before guarded edits shows the build and asks for a reload to edit it.

**A deleted build.** When the app-content is deleted the Studio checks, and shows an empty build only once the app-content is really gone. If the check fails, it keeps the build and says so, with a reload to try again.


## Builds It Shows but Does Not Edit

A multi-file model is edited line by line as a flat one is, its sections kept as written: each by its own `0 FILE` name (`.ldr`, `.dat`, `.mpd` or none), which its copies and its redefinition keep. The Studio shows a model but does not edit it when:

- its submodels place others (a component that places another component);
- two files carry one name (`bare` beside `bare.ldr`);
- it has more lines where an assembled part's pieces go than the Studio compares.

The refusal says which, and how to make the build editable. For submodels that is `setModel` with a flat model, which drops the comments inside them. A build whose pieces cannot be told apart is given back by `getModel` exactly as written, and `setModel` takes such text only once the extra lines are gone.

A model whose submodels expand past 3,000 parts or 3,000 submodel references, or whose definitions run past 100,000 submodel lines, is read only in part. The Studio says so, refuses to edit it, and `getModel` refuses to hand it back as the whole build.


## The Commands

A Charm drives the Studio through these:

| Command | Does |
|---|---|
| `listParts` | the grid conventions, every part's name by kind, and the colors |
| `findParts` | the rows (size, fills, which way it descends) of the parts a query names: names, a size such as 2x4, or a word such as roof |
| `listPlacedParts` | the parts and copies in the build with their positions, a page at a time (a line placing a component that is not a copy, by component, color and a cell it fills) |
| `addParts` | places a batch of parts and copies of components, in the last step or (`newStep`) a new one; a batch that would collide is refused; answers with the build's check |
| `removeParts` | removes the part filling each given cell, and a removed window's glass (a cell of a copy, or of any line placing a component, removes that whole line); answers with the build's check and the parts left unsupported |
| `defineComponent` | defines a component, or replaces its definition and so every copy |
| `defineComponentFromDesign` | defines a component from a saved design (its `uri` from `listDesigns`, or its name), named after it |
| `listComponents` | the components the build defines, their sizes and copies |
| `clear` | removes every part, copy and component, keeping the ground |
| `check` | lists collisions and floating parts, for a build changed some other way |
| `setGround` | colors the baseplate, as the swatch does |
| `setView` | turns the camera and frames the build |
| `lookAround` | shows the build from all four sides at once, so one screenshot sees every side, on a sheet that says the Charm is looking and carries a Back to the build button; the button, a click, a key or the next change closes it |
| `setFidelity` | sets the look, from Draft to Path traced, as the Look slider does |
| `getModel` / `setModel` | reads the build as LDraw text, a page of lines at a time, or replaces it (a file of components kept as written) |
| `listDesigns` | the designs in your designs folder, each by `name` and `uri` |
| `loadDesign` | replaces the build with a saved design (its `uri` from `listDesigns`, or its name) |
| `saveDesign` | saves the build as a design in your designs folder; a name already there needs `replace` |

Every edit resolves once the parts have landed, so a screenshot taken next shows the result.


## The Files

| File | Purpose |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | scopes, the three.js import map, and the command surface |
| [`src/index.html`](charmiq://./src/index.html) | the Studio's markup |
| [`src/styles.scss`](charmiq://./src/styles.scss) | the Studio's styles |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: wires the modules, loads the parts, then the build |
| [`src/catalog.ts`](charmiq://./src/catalog.ts) | the curated parts and colors |
| [`src/grid.ts`](charmiq://./src/grid.ts) | grid placement to and from LDraw transforms |
| [`src/model.ts`](charmiq://./src/model.ts) | LDraw text to and from a build: a flat file, a single main-model section, or an MPD file of components |
| [`src/check.ts`](charmiq://./src/check.ts) | collisions and what holds |
| [`src/build.ts`](charmiq://./src/build.ts) | the current build and its edits |
| [`src/numbers.ts`](charmiq://./src/numbers.ts) | the least and greatest of a build-sized list of numbers |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | the build <-> the `model` app-content, edited with guarded edits |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
| [`src/drive.ts`](charmiq://./src/drive.ts) | the Drive's folders and designs, through the VFS server |
| [`src/designs.ts`](charmiq://./src/designs.ts) | saving and loading designs: names, the remembered folder, replacing |
| [`src/design-dialog.ts`](charmiq://./src/design-dialog.ts) | the save and open dialog and its folder chooser |
| [`src/viewer.ts`](charmiq://./src/viewer.ts) | the three.js scene: instanced parts, baseplate, camera |
| [`src/render/`](charmiq://./src/render) | the look: its stops, the plastic, the studio light, the effects and the path tracer |
| [`src/step-control.ts`](charmiq://./src/step-control.ts) | playing the building steps |
| [`src/fidelity-control.ts`](charmiq://./src/fidelity-control.ts) | the Look slider |
| [`src/ground-control.ts`](charmiq://./src/ground-control.ts) | the ground swatch and its colors |
| [`src/look-around.ts`](charmiq://./src/look-around.ts) | the build from four sides at once |
| [`src/parts/`](charmiq://./src/parts) | the packed parts (generated): `built-in.ldr` comes with the Studio, each other family is a resource read when first shown |
| [`src/parts.generated.ts`](charmiq://./src/parts.generated.ts) | each part's footprint, height, studs and fill, measured, and the family each is read from (generated) |
| [`tools/pack-parts.ts`](charmiq://./tools/pack-parts.ts) | regenerates the parts, the measurements and the manifest's resources |
| [`Brick Builder`](charmiq://./Brick%20Builder.md) | the Brick Builder Charm's Instructions |

**Adding a part.** Add it to `src/catalog.ts`, download and extract the [LDraw Parts Library](https://library.ldraw.org/library/updates/complete.zip), then run `node demos/brick-studio/tools/pack-parts.ts <path to the ldraw directory>` (Node 22.18 or later). The tool measures each part from its geometry, packs it with its family and declares the family in `manifest.json`, and fails on any part that is not on the grid. A new family is named in `familyOf` in `src/catalog.ts`.
