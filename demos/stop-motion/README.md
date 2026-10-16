# Stop Motion

*Ask your Charm for a little film: a car flying off a ramp, a knight riding out of a castle gate. It builds the set in Brick Studio, writes the scene as code, and Stop Motion shoots it frame by frame. Scrub the timeline and the studio follows; export it as a video.*

Three Applications, one document: Brick Studio stages and shoots each frame, Stop Motion keeps time, and a code editor holds the scene.


## The Studio

<iframe-app height="440px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://../brick-studio">
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

<iframe-app height="700px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://.">
</iframe-app>


## The Scene

<iframe-app data-name="scene" height="420px" width="100%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://../../apps/codemirror-editor">
  <app-content name="scene:scene.js">
// The jump. A driver weaves in a bit wildly, hits the ramp and takes off; in the air
// the camera swings round to the front: arms up, a grin, a turn of the head, as time
// slows at the top. Fade to black.
scene({ title: 'The Jump', fps: 24, length: 7, floor: { x: -30, z: -40, width: 60, depth: 100 } })

const car = actor('car', { component: 'car' })
const driver = actor('driver', { part: 'figure', color: 'blue', hat: { part: 'construction-helmet', color: 'yellow' } })
driver.ride(car, { x: 0, z: 1.5, height: 5 })

// in from the north, weaving, then up the ramp (6 studs, 6 plates) nose up
const RAMP = 2.2, TAKEOFF = 2.55
car.at(0, { x: 1.5, z: 46, height: 0 })
   .at(RAMP, { x: 0, z: 6, height: 0 }, 'linear')
   .at(TAKEOFF, { z: 0.5, height: 6 }, 'linear')
car.at(RAMP, { pitch: 0 }).at(RAMP + 0.12, { pitch: 21.8 }, 'ease-out')
car.wobble('yaw', 10, { rate: 1.7, to: RAMP - 0.1 })
car.wobble('x', 0.9, { rate: 1.2, to: RAMP - 0.2 })

// the flight: a jump's arc, the clock slowing toward the top
car.path(TAKEOFF, 7, (u, t) => {
  const s = 0.72 * (1 - Math.pow(1 - u, 2.4))
  return { z: 0.5 - (15 * s), height: 6 + arc(s, 42, 60), pitch: 21.8 - (16 * u), roll: -7 * Math.sin(u * Math.PI) }
})

// hands on the wheel, then both arms up and a look round
driver.at(0, { pose: { leftLeg: 90, rightLeg: 90, leftArm: 50, rightArm: 50, head: 0 } })
      .at(1.0, { pose: { head: -12 } })
      .at(1.6, { pose: { head: 8 } })
      .at(3.05, { pose: { leftArm: 50, rightArm: 50, head: 0 } })
      .at(3.45, { pose: { leftArm: 158, rightArm: 166, head: 24 } }, 'ease-out')
      .at(4.6, { pose: { head: 24 } })
      .at(5.4, { pose: { head: -16 } }, 'ease-in-out')

// alongside from the west, low, then round to the front and in on the grin
camera.at(0, { orbit: { angle: 285, distance: 30, height: 8 }, target: { actor: car, height: 4 }, fov: 30 })
      .at(RAMP, { orbit: { angle: 270, distance: 24, height: 6 } })
      .at(3.0, { orbit: { angle: 280, distance: 22, height: 6 }, target: { actor: driver, height: 8 } })
      .at(4.4, { orbit: { angle: 332, distance: 15, height: -2 }, fov: 28 }, 'ease-in-out')
      .at(6.4, { orbit: { angle: 346, distance: 11, height: -1 } }, 'linear')
camera.shake(TAKEOFF, TAKEOFF + 0.35, 0.25, 9)

fade.out(5.7, 6.4)
title(6.3, 7, 'THE JUMP')
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

- Press play, or drag along the timeline: the studio above follows every frame.
- Press **Shoot all** to shoot the whole take, then **Export MP4** to save the film.
- Change the scene: make the car leave the ramp faster, or the camera swing the other way. The timeline changes as you type.

Or open the chat on this document and ask:

- *Start the camera high above the ramp, then drop it behind the car as it takes off.*
- *Add a second car that chases the first one up the ramp.*
- *Build a castle gate in the studio, then film a knight riding out of it.*

The scene's commands, and how the three Applications work together, are in [How It Works](charmiq://./How%20It%20Works.md).


## Credits

Parts from the [LDraw Parts Library](https://library.ldraw.org) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Videos are encoded with [Mediabunny](https://mediabunny.dev).
