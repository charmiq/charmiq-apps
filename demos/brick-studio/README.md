# Brick Studio

*Build with toy bricks by talking to the chat. A Charm places parts on a stud grid, checks that everything is held, and looks at what it built. The build is plain LDraw text, kept in this document.*


## The Studio

<iframe-app height="520px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://.">
  <app-content name="model">
0 A little cottage
0 Name: model.ldr
1 10 60 -8 60 1 0 0 0 1 0 0 0 1 3958.dat
1 15 20 -32 10 1 0 0 0 1 0 0 0 1 3004.dat
1 15 100 -32 10 1 0 0 0 1 0 0 0 1 3004.dat
1 15 60 -32 110 1 0 0 0 1 0 0 0 1 3009.dat
1 15 10 -32 60 0 0 1 0 1 0 -1 0 0 3010.dat
1 15 110 -32 60 0 0 1 0 1 0 -1 0 0 3010.dat
1 15 20 -56 10 1 0 0 0 1 0 0 0 1 3004.dat
1 15 100 -56 10 1 0 0 0 1 0 0 0 1 3004.dat
1 15 60 -56 110 1 0 0 0 1 0 0 0 1 3009.dat
1 15 10 -56 60 0 0 1 0 1 0 -1 0 0 3010.dat
1 15 110 -56 60 0 0 1 0 1 0 -1 0 0 3010.dat
1 322 60 -80 10 1 0 0 0 1 0 0 0 1 3009.dat
1 322 60 -80 110 1 0 0 0 1 0 0 0 1 3009.dat
1 322 10 -80 60 0 0 1 0 1 0 -1 0 0 3010.dat
1 322 110 -80 60 0 0 1 0 1 0 -1 0 0 3010.dat
1 4 30 -104 30 1 0 0 0 1 0 0 0 1 3038.dat
1 4 90 -104 30 1 0 0 0 1 0 0 0 1 3038.dat
1 4 30 -104 90 -1 0 0 0 1 0 0 0 -1 3038.dat
1 4 90 -104 90 -1 0 0 0 1 0 0 0 -1 3038.dat
1 4 30 -128 50 1 0 0 0 1 0 0 0 1 3038.dat
1 4 90 -128 50 1 0 0 0 1 0 0 0 1 3038.dat
1 4 30 -128 70 -1 0 0 0 1 0 0 0 -1 3038.dat
1 4 90 -128 70 -1 0 0 0 1 0 0 0 -1 3038.dat
1 14 60 -16 10 1 0 0 0 1 0 0 0 1 3069b.dat
1 70 190 -24 50 1 0 0 0 1 0 0 0 1 3005.dat
1 70 190 -48 50 1 0 0 0 1 0 0 0 1 3005.dat
1 2 180 -56 40 1 0 0 0 1 0 0 0 1 3022.dat
1 10 180 -80 40 1 0 0 0 1 0 0 0 1 3003.dat
1 2 180 -88 40 1 0 0 0 1 0 0 0 1 3022.dat
  </app-content>
</iframe-app>

Drag to orbit, right-drag to pan, scroll to zoom.


## Try It

Open the chat on this document and ask:

- *Add a chimney to the cottage and show me.*
- *Build a red and white lighthouse beside the cottage, about 20 levels tall.*
- *Build a small yellow duck. Check it holds together, then look at it from the front.*
- *Clear the baseplate and build a bridge between two towers.*

The Charm reads the catalog, places parts in batches, runs the check, and turns the camera before it takes a screenshot of the Application to look at its own work.


## How It Works

The build is a flat LDraw file in the `model` content block. Each part is one line: its color, its position and rotation, and its part file. Edit it by hand, paste in LDraw from elsewhere, or let a Charm build it.

**The grid.** x runs east, z north, level up. A cell is one stud; a level is one plate, and a brick is three. A part is placed by the south-west corner of its footprint and its bottom level, and turns in quarter turns clockwise seen from above. Parts from the catalog on the grid are checked; any other part line is kept, drawn when its part is in the catalog, and counted as off grid.

**The check.** Two parts collide when they fill the same cell at the same level. A part holds the part above it where its top studs lie under that part: tiles have none, and a slope has studs only along its high row. A part with no chain of holds down to the baseplate floats. An edit that would collide is refused whole.

**The commands.** A Charm drives the Studio through these:

| Command | Does |
|---|---|
| `listParts` | the grid conventions, the catalog parts and the colors |
| `listPlacedParts` | every part in the build with its position |
| `addParts` | places a batch of parts; a batch that would collide is refused |
| `removeParts` | removes the part filling each given cell |
| `clear` | removes every part |
| `check` | lists collisions and floating parts |
| `setView` | turns the camera and frames the build |
| `getModel` / `setModel` | reads or replaces the build as LDraw text |

Every edit resolves once the parts have landed, so a screenshot taken next shows the result.


## Files

| File | Purpose |
|---|---|
| [`manifest.json`](charmiq://./manifest.json) | scopes, the three.js import map, and the command surface |
| [`src/main.ts`](charmiq://./src/main.ts) | entry point: wires the modules, loads the parts, then the build |
| [`src/catalog.ts`](charmiq://./src/catalog.ts) | the curated parts and colors |
| [`src/grid.ts`](charmiq://./src/grid.ts) | grid placement to and from LDraw transforms |
| [`src/model.ts`](charmiq://./src/model.ts) | LDraw text to and from a build (MPD submodels flatten) |
| [`src/check.ts`](charmiq://./src/check.ts) | collisions and what holds |
| [`src/build.ts`](charmiq://./src/build.ts) | the current build and its edits |
| [`src/content-bridge.ts`](charmiq://./src/content-bridge.ts) | the build <-> the `model` content block |
| [`src/command.ts`](charmiq://./src/command.ts) | the Charm command surface |
| [`src/viewer.ts`](charmiq://./src/viewer.ts) | the three.js scene: instanced parts, baseplate, camera |
| [`src/parts.ldr`](charmiq://./src/parts.ldr) | the catalog parts and every file they use, packed (generated) |
| [`src/parts.generated.ts`](charmiq://./src/parts.generated.ts) | each part's footprint, height and studs, measured (generated) |
| [`tools/pack-parts.ts`](charmiq://./tools/pack-parts.ts) | regenerates the two generated files |

**Adding a part.** Add it to `src/catalog.ts`, download and extract the [LDraw Parts Library](https://library.ldraw.org/library/updates/complete.zip), then run `node demos/brick-studio/tools/pack-parts.ts <path to the ldraw directory>` (Node 22.18 or later). The tool measures each part from its geometry and fails on any part that is not on the grid.


## Credits

Part geometry comes from the [LDraw Parts Library](https://library.ldraw.org), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); each packed file keeps its author and license header. Rendering is [three.js](https://threejs.org) and its LDraw loader.
