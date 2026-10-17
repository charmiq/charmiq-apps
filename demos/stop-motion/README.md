# Stop Motion

*Ask your Charm for a little film: a car flying off a ramp, a knight riding out of a castle gate. It builds the set in Brick Studio, writes the scene as code, and the film plays right there in the studio. Scrub the timeline and the studio follows; export it as a video.*

Three Applications, one document: Brick Studio is the screen, Stop Motion is the timeline, and a code editor holds the scene.


## The Studio

<iframe-app height="560px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://../brick-studio">
  <app-content name="model">
0 FILE model.ldr
0 Brick Studio model
0 Name: model.ldr
0 !BRICKSTUDIO GROUND green
1 72 0 -24 70 -1 0 0 0 1 0 0 0 -1 3297.dat
1 72 0 -24 10 1 0 0 0 1 0 0 0 1 3010.dat
1 72 0 -24 30 1 0 0 0 1 0 0 0 1 3010.dat
1 72 0 -24 50 1 0 0 0 1 0 0 0 1 3010.dat
1 72 0 -48 10 -1 0 0 0 1 0 0 0 -1 3297.dat
0 NOFILE
0 FILE car.ldr
0 car
1 4 40 -24 20 1 0 0 0 1 0 0 0 1 4600.dat
1 71 10 -18 20 0 0 1 0 1 0 -1 0 0 4624.dat
1 0 10 -18 20 0 0 1 0 1 0 -1 0 0 3641.dat
1 71 70 -18 20 0 0 -1 0 1 0 1 0 0 4624.dat
1 0 70 -18 20 0 0 -1 0 1 0 1 0 0 3641.dat
1 4 40 -24 100 1 0 0 0 1 0 0 0 1 4600.dat
1 71 10 -18 100 0 0 1 0 1 0 -1 0 0 4624.dat
1 0 10 -18 100 0 0 1 0 1 0 -1 0 0 3641.dat
1 71 70 -18 100 0 0 -1 0 1 0 1 0 0 4624.dat
1 0 70 -18 100 0 0 -1 0 1 0 1 0 0 3641.dat
1 0 40 -32 60 0 0 1 0 1 0 -1 0 0 3795.dat
1 0 40 -40 60 0 0 1 0 1 0 -1 0 0 3795.dat
1 4 40 -48 60 0 0 1 0 1 0 -1 0 0 3032.dat
1 47 40 -96 30 1 0 0 0 1 0 0 0 1 3823.dat
1 0 40 -56 50 1 0 0 0 1 0 0 0 1 3829a.dat
1 0 40 -82.32 49.76 0 0 1 -0.8 0.6 0 -0.6 -0.8 0 3828.dat
1 0 40 -56 100 1 0 0 0 1 0 0 0 1 3022.dat
  </app-content>
</iframe-app>


## The Film

<iframe-app height="420px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://.">
</iframe-app>


## The Scene

<iframe-app data-name="scene" height="420px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://../../apps/codemirror-editor">
  <app-content name="scene:scene.js">
// The Jump. A driver cruises in, grinning, working the wheel. A cat strolls into his
// lane and stops. He sees it, yanks the wheel away from it and onto the ramp: horror in
// the air, then joy, arms up. The cat jumps, then turns to watch him go. Fade to black.
scene({ title: 'The Jump', fps: 24, length: 14.6, floor: { x: -30, z: -40, width: 60, depth: 130 } })

const car = actor('car', { component: 'car' })
const driver = actor('driver', { part: 'figure', color: 'blue', hat: { part: 'construction-helmet', color: 'yellow' } })
driver.ride(car, { x: 0, z: 1.5, height: 5 })
const cat = actor('cat', { part: 'cat', color: 'orange' })

// the beats, in seconds
const CAT = 4.5, STOPS = 7, BEHIND = 6.5, SEES = 6.9, SIDE = 8.6, RAMP = 8.6, TAKEOFF = 8.95, FLIGHT = 9.3, JOY = 10.6, WATCH = 12.6

// .. the car: down a lane beside the ramp, then away from the cat onto it ............
car.at(0, { x: -6, z: 80, height: 0 })
   .at(RAMP, { z: 6, height: 0 }, 'linear')
   .at(TAKEOFF, { z: 0.5, height: 6 }, 'linear')
car.at(SEES, { x: -6, yaw: 0 })
   .at(SEES + 0.4, { x: -1.5, yaw: 30 }, 'ease-out')
   .at(SEES + 1.1, { x: 0.6, yaw: -10 }, 'ease-in-out')
   .at(RAMP, { x: 0, yaw: 0 }, 'ease-out')
car.at(RAMP, { pitch: 0 }).at(RAMP + 0.12, { pitch: 21.8 }, 'ease-out')

// the flight: a jump's arc, the clock slowing toward the top
car.path(TAKEOFF, 14.6, (u, t) => {
  const s = 0.72 * (1 - Math.pow(1 - u, 2.4))
  return { z: 0.5 - (15 * s), height: 6 + arc(s, 42, 60), pitch: 21.8 - (16 * u), roll: -7 * Math.sin(u * Math.PI) }
})

// .. the driver: happy at the wheel, the yank, horror, then joy ......................
driver.at(0, { face: 'grin', pose: { leftLeg: 90, rightLeg: 90, leftArm: 50, rightArm: 50, head: 0 } })
driver.path(0, SEES, (u, t) => ({ pose: { leftArm: 50 + (7 * Math.sin(t * 3.1)), rightArm: 50 - (7 * Math.sin(t * 3.1)), head: 6 * Math.sin(t * 1.7) } }))
driver.at(SEES, { face: 'surprised', pose: { leftArm: 50, rightArm: 50, head: 0 } })
      .at(SEES + 0.2, { pose: { leftArm: 28, rightArm: 72, head: 20 } }, 'ease-out')
      .at(SEES + 0.75, { pose: { leftArm: 70, rightArm: 30, head: -10 } }, 'ease-in-out')
      .at(RAMP, { pose: { leftArm: 50, rightArm: 50, head: 0 } })
driver.path(TAKEOFF, JOY - 0.2, (u, t) => ({ pose: { leftArm: 95 + (35 * Math.sin(t * 14)), rightArm: 90 + (35 * Math.sin((t * 13) + 1)), head: 15 * Math.sin(t * 9) } }))
driver.at(JOY - 0.2, { pose: { leftArm: 120, rightArm: 115, head: 0 } })
      .at(JOY + 0.3, { face: 'grin', pose: { leftArm: 158, rightArm: 166, head: 24 } }, 'ease-out')
      .at(11.4, { face: 'laugh', pose: { head: 24 } })
      .at(12.2, { pose: { head: -16 } }, 'ease-in-out')

// .. the cat: a stroll into his lane, a jump as he passes, then it watches ...........
cat.at(0, { x: -17, z: 14, height: 0, yaw: -90 })
   .at(CAT, { x: -17 })
   .at(STOPS, { x: -8.5 }, 'ease-out')
cat.path(CAT, STOPS, (u, t) => ({ height: 0.5 * Math.abs(Math.sin(t * 9)), pitch: 5 * Math.sin(t * 18) }))
cat.at(7.55, { height: 0 }).at(7.75, { height: 1.8 }, 'ease-out').at(7.95, { height: 0 }, 'ease-in')
cat.at(WATCH + 0.1, { yaw: -90 }).at(WATCH + 0.7, { yaw: 0 }, 'ease-out')

// .. the camera: shot by shot, each move ending where the next shot cuts in ..........
camera.cut(0, { orbit: { angle: 250, distance: 34, height: 9 }, target: { actor: car, height: 4 }, fov: 32 }, 'the road')
      .at(CAT - 2, { orbit: { angle: 236, distance: 30, height: 8 } }, 'linear')
      .cut(CAT - 2, { orbit: { angle: -15, distance: 11, height: 3 }, target: { actor: driver, height: 8 }, fov: 26 }, 'the driver')
      .at(CAT, { orbit: { angle: 15, distance: 10, height: 3 } }, 'linear')
      .cut(CAT, { position: { x: -20, z: 4, height: 2.5 }, target: { actor: cat, height: 2.5 }, fov: 34 }, 'the cat')
      .at(BEHIND, { position: { x: -18, z: 4, height: 2.5 } }, 'linear')
      .cut(BEHIND, { orbit: { angle: 180, distance: 13, height: 16 }, target: { actor: driver, height: 6 }, fov: 36 }, 'over his shoulder')
      .at(SIDE, { orbit: { angle: 190, distance: 12, height: 15 } }, 'linear')
      // wide from the side for the ramp, then round to the front in the air
      .cut(SIDE, { orbit: { angle: 270, distance: 26, height: 6 }, target: { actor: car, height: 4 }, fov: 32 }, 'the ramp')
      .at(FLIGHT, { orbit: { angle: 280, distance: 22, height: 6 }, target: { actor: driver, height: 8 } })
      .at(9.8, { orbit: { angle: 330, distance: 15, height: -2 }, fov: 28 }, 'ease-in-out')
      .at(JOY, { orbit: { angle: 334, distance: 14, height: -2 } }, 'linear')
      .at(WATCH, { orbit: { angle: 346, distance: 11, height: -1 } }, 'linear')
      .cut(WATCH, { position: { x: -10, z: 24, height: 3 }, target: { x: -4, z: 6, height: 10 }, fov: 42 }, 'the cat watches')
camera.shake(TAKEOFF, TAKEOFF + 0.35, 0.25, 9)

// the scene from above, framed on the cat, the swerve and the ramp: a second Brick
// Studio shows it, and a storyboard through it maps each moment
view('plan', { plan: { x: -40, z: -16, width: 72, depth: 44 } })

fade.out(13.6, 14.2)
title(14.0, 14.6, 'THE JUMP')
  </app-content>
  <app-state>
{
  "config": {
    "lineNumbers": true,
    "lineWrapping": false,
    "smartIndent": true,
    "indentWithTabs": false,
    "maxTabs": 1
  },
  "tabModes": {
    "scene": "javascript"
  },
  "tabOrder": [
    "scene"
  ]
}
  </app-state>
</iframe-app>


## Try It

- Press play, or drag along the timeline: the film plays in the studio above.
- Press **Back to the build** in the studio to work on the set: the film waits until you press **Stage again**.
- Press **Export MP4** to save the film.
- Change the scene: make the car leave the ramp faster, or the camera swing the other way. The timeline changes as you type.
- Add a second Brick Studio below this one, its build empty: it shows the scene's plan, the whole jump from above with every path and where the camera stands.

Or open the chat on this document and ask:

- *Show me the storyboard of the jump.*
- *Start the camera high above the ramp, then drop it behind the car as it takes off.*
- *Add a second car that chases the first one up the ramp.*
- *Build a castle gate in the studio, then film a knight riding out of it.*

The scene's commands, and how the three Applications work together, are in [How It Works](charmiq://./How%20It%20Works.md).


## Credits

Parts from the [LDraw Parts Library](https://library.ldraw.org) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Videos are encoded with [Mediabunny](https://mediabunny.dev).
