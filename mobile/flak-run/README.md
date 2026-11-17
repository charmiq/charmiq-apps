# Flak Run

*A one-finger shooter: three levels, each ending in a boss, and a high score for everyone you share it with. Drag anywhere to fly; the guns fire on their own.*

<p style="display: flex; justify-content: center;">
  <iframe-app height="874px" requested-scopes="%5B%22user.read%22%5D" width="402px">
    <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Flak Run</title>
<style>
:root {
  --ink: #1a1c2c;
  --gold: #ffcd3c;
  --safe-t: env(safe-area-inset-top,0px);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  height: 100%;
  overflow: hidden;
  background: #000;
  overscroll-behavior: none;
  touch-action: none;
}

body {
  font: 700 13px/1 ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #fff;
  -webkit-user-select: none;
  user-select: none;
  -webkit-text-size-adjust: 100%;
  -webkit-touch-callout: none;
}

#stage {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  overflow: hidden;
}

canvas {
  display: block;
  image-rendering: pixelated;
}

#hud {
  position: absolute;
  inset: 0;
  padding: calc(var(--safe-t) + 10px) 12px 0;
  pointer-events: none;
  text-shadow: 0 2px 0 var(--ink);
}

#stage.title #hud {
  visibility: hidden;
}

#bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

#score {
  flex: 1;
  font-size: 17px;
}

#lives {
  display: flex;
  gap: 3px;
}

#lives svg {
  display: block;
  width: 15px;
  height: 13px;
  fill: #ff4d5e;
  stroke: var(--ink);
  stroke-width: 1;
  paint-order: stroke;
}

#lives svg.lost {
  fill: rgba(0,0,0,.4);
}

#pause {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: rgba(0,0,0,.35);
  pointer-events: auto;
  position: relative;
}

#pause::before, #pause::after {
  content: "";
  position: absolute;
  top: 9px;
  width: 4px;
  height: 12px;
  background: #fff;
}

#pause::before {
  left: 9px;
}

#pause::after {
  right: 9px;
}

#power {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}

#power i {
  width: 10px;
  height: 5px;
  background: rgba(0,0,0,.4);
}

#power i.on {
  background: #5fe1ff;
}

#boss {
  height: 7px;
  margin-top: 8px;
  border: 1px solid var(--ink);
  background: rgba(0,0,0,.45);
  visibility: hidden;
}

#boss.on {
  visibility: inherit;
}

#boss i {
  display: block;
  height: 100%;
  background: #ff4d5e;
  transform-origin: 0 0;
}

#toast {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 24%;
  text-align: center;
  font-size: 15px;
  color: var(--gold);
  opacity: 0;
  transition: opacity .5s;
}

#toast.show {
  opacity: 1;
  transition: none;
}

#panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  background: rgba(10,12,24,.4);
  text-shadow: 0 2px 0 var(--ink);
  pointer-events: none;
}

#panel.hidden {
  display: none;
}

/* on a short screen the scores give way: what to do next stays in view */
#panel > * {
  flex-shrink: 0;
}

#panel.banner {
  background: none;
}

#panel h1 {
  font-size: 38px;
  line-height: 1.1;
  letter-spacing: .06em;
  color: var(--gold);
  text-shadow: 0 3px 0 #b3541e, 0 6px 0 var(--ink);
}

#panel.banner h1 {
  font-size: 26px;
}

#panel p {
  font-size: 14px;
  line-height: 1.6;
}

#panel small {
  font-size: 12px;
  animation: blink 1.1s steps(2,jump-none) infinite;
}

#panel small:empty, #panel.held small {
  visibility: hidden;
}

#board {
  width: min(100%,280px);
  min-height: 0;
  flex-shrink: 1;
  overflow: hidden;
}

#panel:not(.scores) #board, #board.none, #panel:not(.scores) #notice, #notice:empty, #panel:not(.invites) #invite {
  display: none;
}

#board h2 {
  margin-bottom: 8px;
  font-size: 13px;
  color: #5fe1ff;
}

#board ol {
  list-style: none;
}

#board li {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 22px;
}

#board li.me {
  color: var(--gold);
}

#board li i {
  width: 2ch;
  font-style: normal;
  text-align: right;
  opacity: .7;
}

#board li b {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#notice, #invite {
  max-width: 280px;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0;
  text-transform: none;
}

#notice {
  color: #ffb4a8;
}

#invite {
  opacity: .65;
}

@keyframes blink {
  to { opacity: .25; }
}
</style>
</head>
<body>

<div id="stage" class="title">
  <canvas id="game"></canvas>
  <div id="hud">
    <div id="bar"><div id="score">0</div><div id="lives"></div><button id="pause" aria-label="Pause"></button></div>
    <div id="power"></div>
    <div id="boss"><i></i></div>
    <div id="toast"></div>
  </div>
  <div id="panel">
    <h1></h1>
    <p></p>
    <div id="board" class="none"><h2>High Scores</h2><ol></ol></div>
    <small></small>
    <div id="notice"></div>
    <div id="invite">Share this document as an Editor to add a pilot.</div>
  </div>
</div>

<script>
// Flak Run: a vertical shooter played with one finger. A drag anywhere flies the
// plane and its guns fire on their own. Every picture (planes, terrain, shots,
// explosions) is drawn in code when the Application opens and every sound is made
// as it plays: it loads no files.
// The document's `pilots.json` app-content holds the high scores: a line for each
// person who has opened the game (`charmiq.user$`, `user.read`), with their best
// ********************************************************************************
(() => {
'use strict';

// == Constants ===================================================================
// the playfield's width in game pixels (near enough: a game pixel is a whole number
// of the screen's pixels), and the widest it gets against its height
const TARGET_WIDTH = 200;
const MAX_ASPECT = .62;
// the longest a single step simulates, however late the frame is
const MAX_STEP_SECONDS = 1 / 20;
const TAU = Math.PI * 2;
const INK = '#1a1c2c';

const MAX_HP = 3;
const MAX_POWER = 5;
const FIRE_SECONDS = .12;
const WINGMAN_FIRE_SECONDS = .2;
const SHOT_SPEED = 430;
const BULLET_SPEED = 80;
const SCROLL_SPEED = 28;
// how far the plane moves against the finger
const DRAG_GAIN = 1.2;
const HIT_RADIUS = 4;
const BODY_RADIUS = 8;
const PICKUP_RADIUS = 15;
const HURT_SECONDS = 2;
const SHIELD_SECONDS = 10;
const WINGMEN_SECONDS = 20;
const BLAST_DAMAGE = 40;
// a kill in every so many drops a pickup
const KILLS_A_DROP = 9;
// a train is whatever runs down a level's middle in a line: a locomotive and its
// cars on the Rail Yard's tracks, a lead car and its trucks on the Dune Road, a tug
// and its barges in the Open Water's channel. How fast it runs, how long its lane is
// marked before it comes, and the lengths of its parts along the lane
const TRAIN_SPEED = 140;
const TRAIN_WARNING_SECONDS = 1.3;
const TRAIN_HALF_WIDTH = 5;
const HEAD_LENGTH = 21;
const CAR_LENGTH = 17;
// a track's ties: how wide, and how far each track's left edge is from the middle
const TRACK_WIDTH = 9;
const TRACK_OFFSETS = [-17, 9];
const MAX_PARTICLES = 320;

// the app-content holding the pilots, and the code its writes are refused with
const APP_CONTENT_NAME = 'pilots.json';
const APP_CONTENT_SELECTOR = `[name='${APP_CONTENT_NAME}']`;
const CONTENT_CONFLICT = 'app/content-conflict';
const PILOT_KIND = 'pilot';
// a pilot whose profile names no one
const UNNAMED_PILOT = 'Pilot';
// the most pilots the high scores list
const BOARD_ROWS = 8;
// how long an end screen stays before a tap leaves it: the finger is still flying
const END_HOLD_MILLIS = 1000;

const MASTER_LEVEL = .9;
// how long a sound may be asked for while the audio is still waking from a tap
const AUDIO_WAKE_MILLIS = 500;

// -- Enums -----------------------------------------------------------------------
const Mode = Object.freeze({ Title: 'title', Playing: 'playing', Paused: 'paused', Over: 'over' });
const Move = Object.freeze({ Dive: 'dive', Weave: 'weave', Swoop: 'swoop', Hold: 'hold', Cruise: 'cruise', Ground: 'ground', Boss: 'boss' });
const Pickup = Object.freeze({ Power: 'power', Shield: 'shield', Wingmen: 'wingmen', Blast: 'blast', Repair: 'repair' });
const Theme = Object.freeze({ Forest: 'forest', Desert: 'desert', Sea: 'sea' });
// marks a sprite part as an ellipse (center and radii) instead of a polygon
const ELLIPSE = 'ellipse';

// -- Colors ----------------------------------------------------------------------
// each a ramp of lit, plain and shaded
const RAMP = Object.freeze({
  gold: ['#ffe27a', '#f6a821', '#b3541e'],
  steel: ['#e4eaf1', '#9aa7b8', '#566178'],
  dark: ['#6b7285', '#434a5e', '#2a2f42'],
  glass: ['#d8fbff', '#5fd0ef', '#2a7fb0'],
  red: ['#ff8a7a', '#e23b3b', '#8f1d2c'],
  white: ['#ffffff', '#d5dbe4', '#8e98aa'],
  green: ['#9bd06a', '#4f8f3a', '#2c5a2e'],
  olive: ['#b9b56a', '#7f8443', '#4c5230'],
  sand: ['#f0d79a', '#c79a55', '#7d5a34'],
  navy: ['#7f95c9', '#40558f', '#232f5c'],
  violet: ['#d7a6ff', '#9a5fe0', '#553091'],
  blue: ['#9fd4ff', '#3f8fe6', '#1f4f9c'],
});
const FIRE = ['#fff7d6', '#ffe066', '#ff9a2e', '#d9482b', '#6b3a2e', '#3a3540'];

// == Sprites =====================================================================
const newCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
};

// a sprite's shape in one color: the flash of a hit, or a shadow on the ground
const silhouette = (image, color) => {
  const canvas = newCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
};

const inside = (points, x, y) => {
  if(points[0] === ELLIPSE) return ((((x - points[1]) / points[3]) ** 2) + (((y - points[2]) / points[4]) ** 2)) <= 1;
  let hit = false;
  for(let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i], yi = points[i + 1], xj = points[j], yj = points[j + 1];
    if(((yi > y) !== (yj > y)) && (x < (((xj - xi) * (y - yi)) / (yj - yi)) + xi)) hit = !hit;
  }
  return hit;
};

// a sprite from the parts of its right half, each `[color key, ...polygon]` with x
// measured out from the centerline: mirrored, shaded along its edges and outlined.
// `flip` turns it to fly down the screen
const makeSprite = (half, height, ramps, parts, flip = false) => {
  const grid = [];
  for(let y = 0; y < height; y++) {
    const row = grid[flip ? height - 1 - y : y] = [];
    for(let x = 0; x < half; x++) {
      for(const [key, ...points] of parts) if(inside(points, x + .5, y + .5)) row[x] = key;
    }
  }
  const at = (x, y) => grid[y]?.[(x < 0) ? -x - 1 : x];

  const image = newCanvas((half * 2) + 2, height + 2), context = image.getContext('2d');
  for(let y = -1; y <= height; y++) {
    for(let x = -half - 1; x <= half; x++) {
      const key = at(x, y);
      if(key) context.fillStyle = ramps[key][(!at(x, y + 1) || !at((x < 0) ? x - 1 : x + 1, y)) ? 2 : !at(x, y - 1) ? 0 : 1];
      else if(at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) context.fillStyle = INK;
      else continue/*empty*/;
      context.fillRect(x + half + 1, y + 1, 1, 1);
    }
  }
  return { image, flash: silhouette(image, '#fff'), shadow: silhouette(image, '#000') };
};

// a filled circle of whole pixels, kept by radius and color
const discs = new Map();
const disc = (radius, color) => {
  const key = `${radius}${color}`;
  let image = discs.get(key);
  if(image) return image;

  image = newCanvas((radius * 2) + 1, (radius * 2) + 1);
  const context = image.getContext('2d');
  context.fillStyle = color;
  for(let dy = -radius; dy <= radius; dy++) {
    const span = Math.round(Math.sqrt((radius * radius) + radius - (dy * dy)));
    context.fillRect(radius - span, dy + radius, (span * 2) + 1, 1);
  }
  discs.set(key, image);
  return image;
};

// -- Parts -----------------------------------------------------------------------
// keys: b body, w wings, d dark metal, c canopy, m marking
const PLAYER_PARTS = [
  ['w', 2, 9, 13, 18, 13, 21, 8, 20, 2, 21],
  ['w', 1, 21, 7, 24, 7, 26, 1, 25],
  ['d', 3, 11, 5, 12, 5, 20, 3, 20],
  ['b', 0, 0, 1, 0, 2, 4, 3, 9, 3, 22, 2, 26, 0, 26],
  ['c', ELLIPSE, 0, 7, 1.6, 3],
  ['m', ELLIPSE, 9, 18, 1.6, 1.6],
];
const WINGMAN_PARTS = [
  ['w', 1, 4, 6, 8, 6, 10, 1, 9.5],
  ['b', 0, 0, 1, 0, 2, 4, 2, 10, 0, 12],
  ['c', ELLIPSE, 0, 4, 1, 1.5],
];
const FIGHTER_PARTS = [
  ['w', 1, 3, 7, 3.5, 8, 5, 8, 6.5, 7, 7.5, 1, 8],
  ['w', 0, 10.5, 4, 11, 4, 12.5, 0, 13],
  ['b', 0, 0, 1.5, 0, 2, 2, 2, 8, 1, 12, 0, 13],
  ['d', 0, 0, 1.5, 0, 1.5, 1, 0, 1],
  ['c', ELLIPSE, 0, 5.5, 1, 1.6],
  ['m', ELLIPSE, 5.5, 5.5, 1.3, 1.3],
];
const BOMBER_PARTS = [
  ['w', 2, 5, 14, 7, 15, 9, 15, 11, 2, 12.5],
  ['w', 0, 16, 6, 17, 6, 19.5, 0, 20],
  ['d', 6, 3, 9, 3, 9, 12, 6, 12],
  ['b', 0, 0, 2, 0, 3, 3, 3, 14, 1.5, 20, 0, 20],
  ['c', ELLIPSE, 0, 3.5, 1.6, 2],
  ['m', ELLIPSE, 12, 9.5, 1.5, 1.5],
  ['d', ELLIPSE, 0, 10, 1.5, 1.5],
];
const BOSS_PARTS = [
  ['w', 4, 12, 34, 22, 34, 29, 20, 27, 4, 31],
  ['w', 3, 3, 12, 8, 12, 11, 3, 10],
  ['w', 2, 35, 16, 40, 16, 44, 2, 42],
  ['m', 6, 19, 34, 25, 34, 27, 6, 22],
  ['d', 11, 13, 16, 13, 16, 31, 11, 31],
  ['d', 22, 18, 26, 18, 26, 31, 22, 31],
  ['b', 0, 0, 2, 0, 5, 5, 6, 12, 6, 34, 3, 44, 0, 44],
  ['c', ELLIPSE, 0, 7, 2.5, 4],
  ['d', ELLIPSE, 0, 22, 3.2, 3.2],
  ['m', ELLIPSE, 0, 22, 1.6, 1.6],
  ['d', ELLIPSE, 31, 25.5, 2.2, 2.2],
];
const TURRET_PARTS = [
  ['d', ELLIPSE, 0, 7, 7, 7],
  ['w', ELLIPSE, 0, 7, 5, 5],
  ['b', ELLIPSE, 0, 7, 2.6, 2.6],
];
// each kind of train's parts, its front first: what leads it and what follows. Then
// the mark over a lane a train is coming down
const LOCOMOTIVE_PARTS = [
  ['d', 0, 0, 4, 0, 5, 2, 5, 20, 0, 20],
  ['b', 0, 13, 5, 13, 5, 19, 0, 19],
  ['w', 0, 8, 1.5, 8, 1.5, 11, 0, 11],
  ['m', ELLIPSE, 0, 4, 1.7, 1.7],
];
const CAR_PARTS = [
  ['b', 0, 0, 5, 0, 5, 16, 0, 16],
  ['d', 0, 1, 1, 1, 1, 15, 0, 15],
];
const LEAD_CAR_PARTS = [
  ['b', 0, 0, 4, 0, 5, 2, 5, 20, 0, 20],
  ['c', 0, 5, 3.5, 5, 3.5, 7.5, 0, 7.5],
  ['d', ELLIPSE, 0, 14, 3, 3],
  ['m', ELLIPSE, 0, 14, 1.3, 1.3],
];
const TRUCK_PARTS = [
  ['d', 0, 0, 4, 0, 4, 5, 0, 5],
  ['c', 0, 2, 3, 2, 3, 3.5, 0, 3.5],
  ['b', 0, 5, 5, 5, 5, 16, 0, 16],
  ['d', 0, 8, 5, 8, 5, 9, 0, 9],
  ['d', 0, 12, 5, 12, 5, 13, 0, 13],
];
const TUG_PARTS = [
  ['d', 0, 0, 2, 2, 5, 8, 5, 18, 3, 20, 0, 20],
  ['w', 0, 8, 3, 8, 3, 15, 0, 15],
  ['m', ELLIPSE, 0, 11.5, 1.6, 1.6],
];
const BARGE_PARTS = [
  ['d', 0, 0, 5, 1, 5, 15, 0, 16],
  ['b', 0, 2, 4, 2, 4, 8, 0, 8],
  ['w', 0, 9, 4, 9, 4, 14, 0, 14],
];
const WARNING_PARTS = [['m', 0, 0, 6, 0, 0, 8]];
// a pickup's capsule, and the symbol each kind wears
const CAPSULE_PART = ['b', ELLIPSE, 0, 6.5, 6.5, 6.5];
const PICKUPS = Object.freeze({
  [Pickup.Power]: { label: 'Power Up', ramp: RAMP.gold, symbol: [['m', 0, 2.5, 4, 6.5, 1.5, 6.5, 1.5, 10.5, 0, 10.5]] },
  [Pickup.Shield]: { label: 'Shield', ramp: RAMP.blue, symbol: [['m', 0, 2.5, 4, 3.5, 4, 7, 0, 11]] },
  [Pickup.Wingmen]: { label: 'Wingmen', ramp: RAMP.green, symbol: [['m', 3.5, 3, 5.5, 8, 4.5, 8, 4.5, 10, 2.5, 10, 2.5, 8, 1.5, 8]] },
  [Pickup.Blast]: { label: 'Blast', ramp: RAMP.violet, symbol: [['m', 0, 1.5, 1.2, 5.3, 5, 6.5, 1.2, 7.7, 0, 11.5]] },
  [Pickup.Repair]: { label: 'Repair', ramp: RAMP.red, symbol: [['m', 0, 3, 1.5, 3, 1.5, 5, 3.5, 5, 3.5, 8, 1.5, 8, 1.5, 10, 0, 10]] },
});

// -- Built -----------------------------------------------------------------------
const plane = (half, height, parts, body, wings, marking, flip) =>
  makeSprite(half, height, { b: body, w: wings, d: RAMP.dark, c: RAMP.glass, m: marking }, parts, flip);

const SPRITE = {
  player: plane(13, 26, PLAYER_PARTS, RAMP.gold, RAMP.steel, RAMP.blue),
  wingman: plane(6, 12, WINGMAN_PARTS, RAMP.olive, RAMP.olive, RAMP.white),
  turret: plane(7, 14, TURRET_PARTS, RAMP.red, RAMP.steel, RAMP.white),
  // one of each for every level
  fighter: [[RAMP.red, RAMP.red, RAMP.white], [RAMP.sand, RAMP.sand, RAMP.red], [RAMP.white, RAMP.white, RAMP.red]]
    .map(([body, wings, marking]) => plane(8, 13, FIGHTER_PARTS, body, wings, marking, true/*flies down*/)),
  ace: [[RAMP.violet, RAMP.dark, RAMP.gold], [RAMP.red, RAMP.dark, RAMP.gold], [RAMP.navy, RAMP.dark, RAMP.gold]]
    .map(([body, wings, marking]) => plane(8, 13, FIGHTER_PARTS, body, wings, marking, true)),
  bomber: [[RAMP.green, RAMP.green, RAMP.white], [RAMP.olive, RAMP.olive, RAMP.red], [RAMP.navy, RAMP.navy, RAMP.white]]
    .map(([body, wings, marking]) => plane(15, 20, BOMBER_PARTS, body, wings, marking, true)),
  boss: [[RAMP.dark, RAMP.steel, RAMP.red], [RAMP.sand, RAMP.olive, RAMP.red], [RAMP.navy, RAMP.white, RAMP.gold]]
    .map(([body, wings, marking]) => plane(34, 44, BOSS_PARTS, body, wings, marking, true)),
  // each theme's train: what leads it, and the paints of what follows. All run down
  train: {
    [Theme.Forest]: {
      head: makeSprite(5, 20, { d: RAMP.dark, b: RAMP.red, w: RAMP.steel, m: RAMP.gold }, LOCOMOTIVE_PARTS, true),
      cars: [RAMP.sand, RAMP.green, RAMP.navy].map((ramp) => makeSprite(5, 16, { b: ramp, d: RAMP.dark }, CAR_PARTS, true)),
    },
    [Theme.Desert]: {
      head: makeSprite(5, 20, { b: RAMP.olive, c: RAMP.glass, d: RAMP.dark, m: RAMP.red }, LEAD_CAR_PARTS, true),
      cars: [RAMP.olive, RAMP.green, RAMP.steel].map((ramp) => makeSprite(5, 16, { b: ramp, c: RAMP.glass, d: RAMP.dark }, TRUCK_PARTS, true)),
    },
    [Theme.Sea]: {
      head: makeSprite(5, 20, { d: RAMP.dark, w: RAMP.white, m: RAMP.red }, TUG_PARTS, true),
      cars: [RAMP.red, RAMP.gold, RAMP.green].map((ramp) => makeSprite(5, 16, { d: RAMP.dark, b: ramp, w: RAMP.steel }, BARGE_PARTS, true)),
    },
  },
  warning: makeSprite(6, 8, { m: RAMP.gold }, WARNING_PARTS),
  pickup: Object.fromEntries(Object.entries(PICKUPS).map(([kind, { ramp, symbol }]) =>
    [kind, makeSprite(7, 13, { b: ramp, m: RAMP.white }, [CAPSULE_PART, ...symbol])])),
};

// the player's shot, an enemy's two sizes of bullet and the shield's ring
const SHOT = (() => {
  const image = newCanvas(3, 9), context = image.getContext('2d');
  context.fillStyle = '#35b6ff'; context.fillRect(0, 2, 3, 7);
  context.fillStyle = '#b9f1ff'; context.fillRect(0, 1, 3, 3);
  context.fillStyle = '#fff'; context.fillRect(1, 0, 1, 7);
  return image;
})();
const BULLETS = [2, 3].map((radius) => {
  const image = newCanvas((radius * 2) + 1, (radius * 2) + 1), context = image.getContext('2d');
  context.drawImage(disc(radius, '#c2203a'), 0, 0);
  context.drawImage(disc(radius - 1, '#ff7a3c'), 1, 1);
  context.fillStyle = '#fff3c4'; context.fillRect(radius - 1, radius - 1, 2, 2);
  return image;
});
const SHIELD_RADIUS = 18;
const SHIELD = (() => {
  const size = (SHIELD_RADIUS * 2) + 3, image = newCanvas(size, size), context = image.getContext('2d');
  context.fillStyle = '#8eecff';
  for(let y = 0; y < size; y++) {
    for(let x = 0; x < size; x++) {
      if(Math.abs(Math.hypot(x - SHIELD_RADIUS - 1, y - SHIELD_RADIUS - 1) - SHIELD_RADIUS) < .75) context.fillRect(x, y, 1, 1);
    }
  }
  return image;
})();

// == Levels ======================================================================
// a level's script: `[seconds in, formation, ...its arguments]`, in order. The boss
// waits for the sky to clear. `trains`: the seconds between trains as the level
// starts and once its boss is due
const LEVELS = [
  { name: 'Rail Yard', theme: Theme.Forest, seed: 7, bossHp: 520, trains: [9, 3], script: [
    [1.5, 'vee', 'fighter', 3, .5],
    [4.5, 'column', 'fighter', 5, .3],
    [8, 'column', 'fighter', 5, .7],
    [11.5, 'swoop', 'fighter', 5, 1],
    [13, 'turret', .13], [14.5, 'turret', .87],
    [16, 'grid', 'fighter', 5, 2],
    [22, 'one', 'bomber', .5],
    [26, 'swoop', 'fighter', 6, -1],
    [29, 'vee', 'fighter', 5, .3],
    [32, 'vee', 'fighter', 5, .7],
    [34, 'turret', .18], [35.5, 'turret', .82],
    [37, 'grid', 'fighter', 6, 3],
    [45, 'one', 'bomber', .3], [46, 'one', 'bomber', .7],
    [50, 'swoop', 'ace', 4, 1], [51.5, 'swoop', 'ace', 4, -1],
    [56, 'boss'],
  ] },
  { name: 'Dune Road', theme: Theme.Desert, seed: 21, bossHp: 760, trains: [8, 2.8], script: [
    [1.5, 'vee', 'fighter', 5, .5],
    [4, 'turret', .28], [5, 'turret', .72],
    [6, 'column', 'ace', 4, .25], [7.5, 'column', 'ace', 4, .75],
    [11, 'swoop', 'fighter', 6, 1], [12, 'swoop', 'fighter', 6, -1],
    [16, 'grid', 'fighter', 6, 3],
    [20, 'turret', .28], [21, 'turret', .72],
    [24, 'one', 'bomber', .3], [25, 'one', 'bomber', .7],
    [29, 'vee', 'ace', 5, .5],
    [32, 'column', 'fighter', 6, .5],
    [35, 'swoop', 'ace', 5, 1],
    [38, 'grid', 'ace', 5, 2],
    [41, 'turret', .28], [42, 'turret', .72], [43, 'turret', .28], [44, 'turret', .72],
    [46, 'one', 'bomber', .5],
    [49, 'vee', 'fighter', 5, .25], [50.5, 'vee', 'fighter', 5, .75],
    [54, 'swoop', 'ace', 5, -1], [55, 'swoop', 'ace', 5, 1],
    [60, 'boss'],
  ] },
  { name: 'Open Water', theme: Theme.Sea, seed: 40, bossHp: 1000, trains: [7, 2.5], script: [
    [1.5, 'swoop', 'fighter', 6, 1], [2.5, 'swoop', 'fighter', 6, -1],
    [6, 'vee', 'ace', 5, .5],
    [9, 'column', 'fighter', 6, .2], [10, 'column', 'fighter', 6, .8],
    [13, 'one', 'bomber', .5],
    [16, 'grid', 'ace', 6, 2],
    [22, 'one', 'bomber', .25], [23, 'one', 'bomber', .75],
    [26, 'swoop', 'ace', 6, 1],
    [29, 'vee', 'fighter', 5, .3], [30, 'vee', 'fighter', 5, .7],
    [33, 'column', 'ace', 5, .5],
    [36, 'grid', 'fighter', 7, 4],
    [44, 'one', 'bomber', .2], [45, 'one', 'bomber', .5], [46, 'one', 'bomber', .8],
    [50, 'swoop', 'ace', 6, -1], [51, 'swoop', 'ace', 6, 1],
    [54, 'vee', 'ace', 5, .5],
    [57, 'column', 'fighter', 6, .3], [58, 'column', 'fighter', 6, .7],
    [63, 'boss'],
  ] },
];

// each theme's trains: their lanes (from the middle of the playfield to each lane's
// own middle) and the sound that warns of one
const TRAINS = Object.freeze({
  [Theme.Forest]: { lanes: TRACK_OFFSETS.map((offset) => offset + (TRACK_WIDTH / 2)), sound: 'whistle' },
  [Theme.Desert]: { lanes: [-6.5, 6.5], sound: 'horn' },
  [Theme.Sea]: { lanes: [-8, 8], sound: 'foghorn' },
});

// `fire`: the seconds between an enemy's shots, about; none for one that holds its
// fire. Hit points and scores are a first level's
const ENEMIES = {
  fighter: { hp: 3, score: 100, radius: 6, fire: 0 },
  ace: { hp: 6, score: 200, radius: 6, fire: 2.8 },
  bomber: { hp: 30, score: 600, radius: 11, fire: 2.3, big: true, drops: true },
  turret: { hp: 12, score: 300, radius: 6, fire: 2.5, ground: true },
  boss: { hp: 1/*the level's*/, score: 5000, radius: 22, big: true, drops: true },
};
// a fighter holding a formation's slot shoots, this often
const HOLD_FIRE_SECONDS = 5;

// the player's shots at each power: `[x from the nose, angle off straight ahead]`
const SHOTS = [
  [[-3, 0], [3, 0]],
  [[-5, 0], [0, 0], [5, 0]],
  [[-5, 0], [0, 0], [5, 0], [-7, -.2], [7, .2]],
  [[-8, 0], [-4, 0], [0, 0], [4, 0], [8, 0], [-9, -.22], [9, .22]],
  [[-8, 0], [-4, 0], [0, 0], [4, 0], [8, 0], [-9, -.18], [9, .18], [-10, -.4], [10, .4]],
];
// the pickups an ordinary drop cycles through
const DROPS = [Pickup.Power, Pickup.Wingmen, Pickup.Power, Pickup.Shield, Pickup.Blast];

// == State =======================================================================
const $ = (selector) => document.querySelector(selector);
const stage = $('#stage'), canvas = $('#game'), ctx = canvas.getContext('2d', { alpha: false });
const panel = $('#panel'), toast = $('#toast');

// the playfield in game pixels, a game pixel's size in CSS pixels and the row the
// HUD ends at
let W = TARGET_WIDTH, H = 400, scale = 2, top = 24;
let ground = null/*the level's terrain, a strip that scrolls around*/, scroll = 0;

const game = {
  mode: Mode.Title,
  level: 0,
  // seconds: of play in all, and into the level's script
  time: 0, clock: 0,
  cursor: 0/*the next line of the level's script*/,
  score: 0,
  // the account changed during the game: its score is no one's to keep
  unkept: false,
  hp: MAX_HP, power: 1,
  kills: 0, drops: 0,
  boss: null,
  shake: 0,
  // the times at which each of these ends
  hurtUntil: 0, shieldUntil: 0, wingmenUntil: 0,
  nextShot: 0, nextWingmanShot: 0,
  nextTrain: 0/*into the level's script*/,
};
const player = { x: 0, y: 0, alive: true };
let enemies = [], trains = [], shots = [], bullets = [], pickups = [], particles = [], timers = [];

// runs once the play clock has gone on that long: a pause holds it
const later = (seconds, run) => timers.push({ at: game.time + seconds, run });

// == Terrain =====================================================================
// a small seeded generator: a level's terrain is the same every time
const seeded = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const buildGround = (theme, seed) => {
  // a multiple of every repeat drawn down it, so its end meets its start
  const height = Math.ceil((H + 48) / 24) * 24;
  const image = newCanvas(W, height), context = image.getContext('2d'), rand = seeded(seed);
  const middle = Math.round(W / 2);

  // whatever runs off one end comes back in at the other
  const rect = (color, x, y, width, tall) => {
    context.fillStyle = color;
    for(const wrap of [-height, 0, height]) context.fillRect(Math.round(x), Math.round(y) + wrap, width, tall);
  };
  const dot = (color, x, y, radius) => {
    for(let dy = -radius; dy <= radius; dy++) {
      const span = Math.round(Math.sqrt((radius * radius) + radius - (dy * dy)));
      rect(color, Math.round(x) - span, Math.round(y) + dy, (span * 2) + 1, 1);
    }
  };
  // a few overlapping circles, painted as often as the shape needs layers
  const clump = (x, y, radius, count = 4) => Array.from({ length: count },
    () => [x + ((rand() - .5) * radius), y + ((rand() - .5) * radius), Math.max(1, Math.round(radius * (.45 + (rand() * .4))))]);
  const paint = (shape, color, dx = 0, dy = 0, grow = 0) => {
    for(const [x, y, radius] of shape) if((radius + grow) > 0) dot(color, x + dx, y + dy, radius + grow);
  };
  const speckle = (count, colors) => {
    for(let i = 0; i < count; i++) rect(colors[i % colors.length], rand() * W, rand() * height, 1 + Math.round(rand()), 1);
  };
  // somewhere clear of the middle strip (the rails, the road)
  const aside = (clear) => {
    const x = clear + (rand() * ((W / 2) - clear - 4));
    return Math.round((rand() < .5) ? middle - x : middle + x);
  };
  const rock = (x, y, radius, colors) => {
    const shape = clump(x, y, radius, 3);
    paint(shape, colors[2], 1, 2);
    paint(shape, colors[1]);
    paint(shape, colors[0], -1, -1, -2);
  };
  const pine = (x, y) => {
    dot('rgba(20,40,20,.35)', x + 2, y + 10, 4);
    // three tiers, each wider than the last: outlined, so the lit side stands off the grass
    for(let i = 0; i < 12; i++) {
      const width = 1 + (2 * ((i % 4) + Math.floor(i / 4))), left = x - ((width - 1) / 2);
      rect('#1c3322', left - 1, y + i, width + 2, 1);
      rect('#2b5230', left, y + i, width, 1);
      rect('#3f7a3c', left, y + i, Math.ceil(width / 2), 1);
    }
    rect('#1c3322', x, y - 1, 1, 1);
    rect('#4f3d2a', x, y + 12, 1, 2);
  };
  const hut = (x, y, roof) => {
    rect('rgba(0,0,0,.25)', x + 2, y + 3, 22, 15);
    rect(roof[2], x, y, 22, 15);
    rect(roof[1], x + 1, y + 1, 20, 13);
    for(let i = 3; i < 20; i += 3) rect(roof[2], x + i, y + 1, 1, 13);
    rect(roof[0], x + 1, y + 7, 20, 1);
  };

  switch(theme) {
    case Theme.Forest: {
      rect('#4f7038', 0, 0, W, height);
      speckle(W * 4, ['#476632', '#59793f']);
      for(let i = 0; i < 12; i++) paint(clump(rand() * W, rand() * height, 12), '#486834');
      // two tracks: a gravel bed, ties and a pair of rails
      for(const x of TRACK_OFFSETS.map((offset) => middle + offset)) {
        rect('#7b775f', x - 1, 0, TRACK_WIDTH + 2, height);
        for(let y = 0; y < height; y += 4) rect('#5d4c33', x, y + 1, TRACK_WIDTH, 2);
        rect('#b9bcae', x + 1, 0, 1, height); rect('#b9bcae', x + TRACK_WIDTH - 2, 0, 1, height);
      }
      for(let i = 0; i < 5; i++) hut(aside(34) - 11, rand() * height, ['#a9b1a5', '#8d958a', '#6c7469']);
      for(let i = 0; i < 9; i++) rock(aside(30), rand() * height, 5 + (rand() * 5), ['#aab4a5', '#8a9488', '#3d4a36']);
      for(let i = 0; i < 46; i++) pine(aside(30), rand() * height);
      break;
    }
    case Theme.Desert: {
      rect('#d7b26c', 0, 0, W, height);
      speckle(W * 4, ['#cba460', '#e2c07c']);
      for(let i = 0; i < 10; i++) paint(clump(rand() * W, rand() * height, 14), '#d0a962');
      for(let i = 0; i < 70; i++) {
        const x = rand() * W, y = rand() * height, length = 6 + (rand() * 10);
        for(let j = 0; j < length; j++) rect('#c39a57', x + j, y + Math.round(Math.sin(j * .7)), 1, 1);
      }
      // the road and its center line
      rect('#6e6252', middle - 14, 0, 28, height);
      rect('#857763', middle - 13, 0, 26, height);
      for(let y = 0; y < height; y += 12) rect('#e9dcae', middle - 1, y + 3, 2, 6);
      for(let i = 0; i < 5; i++) hut(aside(34) - 11, rand() * height, ['#d9c28a', '#b79c63', '#8a744a']);
      for(let i = 0; i < 14; i++) rock(aside(22), rand() * height, 4 + (rand() * 5), ['#c79a6a', '#a3764b', '#7a5a3a']);
      for(let i = 0; i < 26; i++) {
        const x = aside(22), y = rand() * height;
        dot('rgba(90,60,20,.3)', x + 2, y + 8, 2);
        rect('#2c5a2e', x, y, 2, 8); rect('#4f8f3a', x, y, 1, 8);
        rect('#2c5a2e', x - 2, y + 2, 2, 1); rect('#2c5a2e', x - 2, y, 1, 3);
        rect('#2c5a2e', x + 2, y + 4, 2, 1); rect('#2c5a2e', x + 3, y + 2, 1, 3);
      }
      break;
    }
    default: {
      rect('#2a6ea6', 0, 0, W, height);
      for(let i = 0; i < W * 1.2; i++) rect((i % 3) ? '#3f86bd' : '#235f92', rand() * W, rand() * height, 3 + Math.round(rand() * 4), 1);
      for(let i = 0; i < 4; i++) {
        const x = aside(40), y = (i + (rand() * .6)) * (height / 4), radius = 10 + (rand() * 9);
        const shore = clump(x, y, radius, 5);
        paint(shore, '#3f86bd', 0, 0, 5);
        paint(shore, '#7fc0dd', 0, 0, 2);
        paint(shore, '#e3d296');
        paint(shore, '#c9b477', 1, 1, -2);
        paint(shore, '#4f8f3a', 0, 0, -3);
        paint(shore, '#2c5a2e', 1, 1, -6);
        paint(shore, '#6faa48', -1, -1, -7);
      }
      for(let i = 0; i < 8; i++) rock(aside(22), rand() * height, 2 + (rand() * 3), ['#aab4a5', '#7c8a8f', '#1f4f7c']);
      break;
    }
  }
  return image;
};

// == HUD =========================================================================
const hud = { score: -1, hp: -1, power: -1, boss: -1 };
$('#lives').innerHTML = '<svg viewBox="0 0 10 9"><path d="M5 9 0 4V2L2 0H3L5 2 7 0H8L10 2V4Z"/></svg>'.repeat(MAX_HP);
$('#power').innerHTML = '<i></i>'.repeat(MAX_POWER);

const number = (value) => value.toLocaleString('en-US');

// only what changed is written
const updateHud = () => {
  if(hud.score !== game.score) $('#score').textContent = number(hud.score = game.score);
  if(hud.hp !== game.hp) { hud.hp = game.hp; $('#lives').childNodes.forEach((heart, index) => heart.classList.toggle('lost', index >= game.hp)); }
  if(hud.power !== game.power) { hud.power = game.power; $('#power').childNodes.forEach((pip, index) => pip.classList.toggle('on', index < game.power)); }

  const boss = game.boss ? Math.max(0, game.boss.hp / game.boss.max) : -1;
  if(hud.boss !== boss) {
    hud.boss = boss;
    $('#boss').classList.toggle('on', boss >= 0);
    $('#boss i').style.transform = `scaleX(${Math.max(0, boss)})`;
  } /* else -- the boss's bar shows it already */
};

let toastTimer = null;
const showToast = (text) => {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 900);
};

// `banner`: over the play, which goes on beneath it. `scores`: with the high scores.
// `invites`: with how to add a pilot
const showPanel = (title, text, hint, { banner = false, scores = false, invites = false } = {}) => {
  panel.querySelector('h1').textContent = title;
  panel.querySelector('p').innerHTML = text;
  panel.querySelector('small').textContent = hint;
  panel.classList.toggle('banner', banner);
  panel.classList.toggle('scores', scores);
  panel.classList.toggle('invites', invites);
  panel.classList.remove('hidden', 'held');
};
const hidePanel = () => panel.classList.add('hidden');

const setMode = (mode) => {
  game.mode = mode;
  stage.classList.toggle('title', mode === Mode.Title);
};

// == Pilots ======================================================================
// the high scores: `pilots.json` holds a line for each person who has opened the
// game, `{ kind, id, name, best }` by their User id. A person writes their own line
// alone: when they open the game, when their name changes and when they beat their
// best. A line this does not read is kept as written
const appContent = window.charmiq.appContent;

// the app-content as last given (null: there is none) and the signed-in User (null:
// no one), each once it is known
let shown = null, contentKnown = false, contentFailed = false;
let me = null, meKnown = false, userFailed = false;
// this person's best: their line's, or a higher one flown here and still to be saved
let best = 0;
// one write at a time; the next waits for the app-content the last one made
let writing = false, awaitingEcho = false, saveFailed = false;

const pilotOf = (line) => {
  try {
    const record = JSON.parse(line);
    return (record && (record.kind === PILOT_KIND) && (typeof record.id === 'string')) ? record : null/*another kind of line*/;
  } catch(error) {
    return null/*not a record*/;
  }
};
const scoreOf = (pilot) => Number.isFinite(pilot.best) ? Math.max(0, Math.floor(pilot.best)) : 0;
const nameOf = (name) => ((typeof name === 'string') && name.trim()) || UNNAMED_PILOT;

// the pilots the lines hold, by User id: of two lines for one person, the higher
const pilotsIn = (lines) => {
  const pilots = new Map();
  for(const line of lines) {
    const pilot = pilotOf(line);
    if(!pilot || (pilots.has(pilot.id) && (pilots.get(pilot.id).best >= scoreOf(pilot)))) continue/*not a pilot, or a lower line of one*/;
    pilots.set(pilot.id, { id: pilot.id, name: nameOf(pilot.name), best: scoreOf(pilot) });
  }
  return pilots;
};

// the highest first, then by name
const byScore = (a, b) => (b.best - a.best) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// what to tell the person when their score is not kept, and what they can do
const noticeText = () => {
  if(contentFailed) return 'The high scores could not be read. Close Flak Run and open it again.';
  if(userFailed) return 'Flak Run could not read your account, so your score is not kept. Close Flak Run and open it again.';
  if(meKnown && !me) return 'Sign in to keep your score.';
  if(game.unkept) return 'The account changed during that game, so its score was not kept.';
  if(saveFailed) return 'Your score was not saved. Flak Run tries again after your next game.';
  return '';
};

// everyone with a line and the person playing, their line written or not. Past
// `BOARD_ROWS` the list ends with the person playing, at their own place
const showBoard = () => {
  const pilots = pilotsIn(shown ? shown.lines : []);
  if(me) pilots.set(me.id, { id: me.id, name: nameOf(me.name), best });
  const ranked = [...pilots.values()].sort(byScore).map((pilot, index) => ({ ...pilot, place: index + 1 }));
  const mine = me ? ranked.findIndex((pilot) => pilot.id === me.id) : -1;
  const rows = ranked.slice(0, BOARD_ROWS);
  if(mine >= BOARD_ROWS) rows[BOARD_ROWS - 1] = ranked[mine];

  const list = $('#board ol');
  list.textContent = '';
  for(const pilot of rows) {
    const row = document.createElement('li'), place = document.createElement('i'), name = document.createElement('b'), score = document.createElement('span');
    row.classList.toggle('me', !!me && (pilot.id === me.id));
    place.textContent = pilot.place;
    name.textContent = name.title = pilot.name;
    score.textContent = (pilot.best > 0) ? number(pilot.best) : '-';
    row.append(place, name, score);
    list.append(row);
  }
  $('#board').classList.toggle('none', rows.length < 1);
  $('#notice').textContent = noticeText();
};

// writes this person's line when it is missing or holds another name or best. The
// write is measured on the app-content shown: refused because that changed, it is
// made again on the app-content that follows
const savePilot = async () => {
  if(writing || awaitingEcho || !me || !contentKnown || contentFailed) return/*resumes when the write settles or its app-content arrives; no one to write, or nothing to write on*/;

  const line = JSON.stringify({ kind: PILOT_KIND, id: me.id, name: nameOf(me.name), best });
  const target = shown, index = target ? target.lines.findIndex((each) => pilotOf(each)?.id === me.id) : -1;
  if(target && (target.lines[index] === line)) return/*as it stands*/;

  writing = true;
  try {
    if(!target) await appContent.create(`${line}\n`, APP_CONTENT_NAME);
    else if(index < 0) await target.appendLine(line);
    else await target.replaceLine(index, line);
    saveFailed = false;
    awaitingEcho = (shown === target)/*else its app-content already arrived*/;
  } catch(error) {
    if(error?.code !== CONTENT_CONFLICT) {
      console.error(`Could not save the ${APP_CONTENT_NAME} app-content`, error);
      saveFailed = true;
    } /* else -- refused whole: the app-content that won arrives next */
  } finally {
    writing = false;
  }
  showBoard();
  // NOTE: a failed write waits for the next game: the app-contents that arrive do not retry it
  if(!saveFailed && !awaitingEcho && (shown !== target)) savePilot();
};

const receive = (content) => {
  shown = content; contentKnown = true;
  awaitingEcho = false;
  if(me && content) best = Math.max(best, pilotsIn(content.lines).get(me.id)?.best ?? 0);
  showBoard();
  if(!saveFailed) savePilot();
};

// the first User told, the same person again (a new name, say) or another person: a
// best flown here is the previous person's, and a game in the air is no one's
const receiveUser = (user) => {
  const another = meKnown && !!me && (user?.id !== me.id);
  me = user; meKnown = true;
  if(another) {
    best = 0;
    if(game.mode !== Mode.Title) game.unkept = true;
  } /* else -- the first told, or the same person */
  if(me && shown) best = Math.max(best, pilotsIn(shown.lines).get(me.id)?.best ?? 0);
  showBoard();
  saveFailed = false;
  savePilot();
};

// == Sound =======================================================================
// every sound is made as it plays, from oscillators and filtered noise: none is a
// file. A tap starts the audio (iOS plays none that a tap did not start); it plays
// beside the person's own music, and the phone's silent switch mutes it
let audio = null/*not started: no tap yet, or a browser without Web Audio*/;

// what every sound plays into (`out`, which evens out many at once), and a second of
// noise to cut bursts from
const makeAudio = (context) => {
  const out = context.createDynamicsCompressor(), master = context.createGain();
  out.threshold.value = -18; out.knee.value = 12; out.ratio.value = 8; out.attack.value = .003; out.release.value = .15;
  master.gain.value = MASTER_LEVEL;
  out.connect(master); master.connect(context.destination);

  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate), samples = noise.getChannelData(0);
  for(let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2) - 1;
  return { context, out, noise, wakeBy: 0 };
};

const startAudio = () => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if(!audio && Context) {
    if(navigator.audioSession) navigator.audioSession.type = 'ambient';
    audio = makeAudio(new Context());
  } /* else -- started already, or no Web Audio */
  if(!audio || (audio.context.state === 'running')) return/*nothing to wake*/;
  audio.wakeBy = performance.now() + AUDIO_WAKE_MILLIS;
  audio.context.resume().catch(() => { /*not from a tap: the next tap wakes it*/ });
};

// -- Voices ----------------------------------------------------------------------
// the pitch a number of semitones from the A above middle C
const pitch = (semitones) => 440 * (2 ** (semitones / 12));

// a level that rises at once and falls away over `length` seconds
const envelope = (a, at, length, level) => {
  const gain = a.context.createGain();
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.linearRampToValueAtTime(level, at + .005);
  gain.gain.exponentialRampToValueAtTime(.0001, at + length);
  gain.connect(a.out);
  return gain;
};
// a tone gliding from one frequency to another
const tone = (a, at, wave, from, to, length, level) => {
  const oscillator = a.context.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, at);
  if(to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
  oscillator.connect(envelope(a, at, length, level));
  oscillator.start(at); oscillator.stop(at + length + .03);
};
// noise through a filter that slides from one frequency to another
const burst = (a, at, from, to, length, level, kind = 'lowpass') => {
  const source = a.context.createBufferSource(), filter = a.context.createBiquadFilter();
  source.buffer = a.noise; source.loop = true;
  filter.type = kind; filter.Q.value = 1;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + length);
  source.connect(filter); filter.connect(envelope(a, at, length, level));
  source.start(at, Math.random() * .5); source.stop(at + length + .03);
};
// notes one after another, each `step` seconds after the last
const tune = (a, at, wave, notes, step, length, level) =>
  notes.forEach((semitones, index) => tone(a, at + (index * step), wave, pitch(semitones), pitch(semitones), length, level));

// -- Sounds ----------------------------------------------------------------------
// each plays into `a` from the time `t`; a pickup's is named for its kind
const SOUND = {
  shot: (a, t) => tone(a, t, 'triangle', 1700, 500, .07, .14),
  hit: (a, t) => burst(a, t, 5000, 2500, .035, .06, 'highpass'),
  boom: (a, t) => { burst(a, t, 2400, 160, .45, .5); tone(a, t, 'sine', 160, 45, .3, .5); },
  bigBoom: (a, t) => {
    burst(a, t, 1600, 60, 1.3, .8); burst(a, t, 6000, 500, .2, .3);
    tone(a, t, 'sine', 110, 28, .9, .8); tone(a, t + .08, 'triangle', 70, 30, .6, .4);
  },
  hurt: (a, t) => { tone(a, t, 'sawtooth', 600, 70, .35, .2); burst(a, t, 3500, 300, .25, .3); },
  whistle: (a, t) => { for(const [at, length] of [[0, .16], [.24, .55]]) for(const frequency of [311, 370, 466]) tone(a, t + at, 'square', frequency, frequency, length, .045); },
  horn: (a, t) => { for(const at of [0, .2]) for(const frequency of [392, 494]) tone(a, t + at, 'square', frequency, frequency, .14, .05); },
  foghorn: (a, t) => { tone(a, t, 'sawtooth', 98, 98, .9, .12); tone(a, t, 'sawtooth', 147, 147, .9, .07); },
  alarm: (a, t) => { for(let i = 0; i < 3; i++) { tone(a, t + (i * .36), 'square', 660, 660, .16, .08); tone(a, t + (i * .36) + .18, 'square', 495, 495, .16, .08); } },

  [Pickup.Power]: (a, t) => tune(a, t, 'square', [7, 12, 16, 19], .055, .12, .09),
  [Pickup.Shield]: (a, t) => { tone(a, t, 'triangle', 440, 1320, .4, .14); tone(a, t + .05, 'triangle', 660, 1980, .4, .08); },
  [Pickup.Wingmen]: (a, t) => tune(a, t, 'square', [12, 19, 12, 19], .07, .1, .08),
  [Pickup.Blast]: (a, t) => { burst(a, t, 300, 5000, .28, .35, 'bandpass'); SOUND.bigBoom(a, t + .22); },
  [Pickup.Repair]: (a, t) => tune(a, t, 'sine', [15, 19, 22], .09, .3, .16),

  start: (a, t) => { tone(a, t, 'square', pitch(14), pitch(14), .08, .09); tone(a, t + .08, 'square', pitch(19), pitch(19), .4, .09); },
  level: (a, t) => { tune(a, t, 'square', [3, 7, 10, 15], .1, .18, .08); tone(a, t, 'triangle', pitch(-21), pitch(-21), .5, .12); },
  clear: (a, t) => { tune(a, t, 'square', [-2, 3, 7, 10, 7, 10], .11, .2, .08); tone(a, t + .66, 'square', pitch(15), pitch(15), .6, .09); tone(a, t + .66, 'triangle', pitch(-9), pitch(-9), .6, .12); },
  win: (a, t) => {
    tune(a, t, 'square', [3, 7, 10, 15, 10, 15], .14, .22, .08);
    for(const semitones of [15, 19, 22]) tone(a, t + .84, 'square', pitch(semitones), pitch(semitones), 1.1, .06);
    tone(a, t + .84, 'triangle', pitch(-9), pitch(-9), 1.1, .14);
  },
  over: (a, t) => { tune(a, t, 'square', [7, 3, 0, -4, -7], .2, .32, .08); tune(a, t, 'triangle', [-5, -9, -12, -16, -19], .2, .32, .1); },
  best: (a, t) => tune(a, t, 'square', [15, 19, 22, 27, 22, 27], .06, .1, .07),
};

// plays a sound now (or `delay` seconds on), unless it played within the last `gap`
// seconds: many of one at once is only louder
const played = {};
const play = (name, gap = 0, delay = 0) => {
  if(!audio || ((audio.context.state !== 'running') && (performance.now() > audio.wakeBy))) return/*no audio, or asleep: sounds do not queue for when it wakes*/;
  const now = audio.context.currentTime;
  if((now - (played[name] ?? -1)) < gap) return/*played a moment ago*/;
  played[name] = now;
  SOUND[name](audio, now + delay);
};

// == Effects =====================================================================
const explode = (x, y, size) => {
  for(let i = 0; i < 4 + (size * 4); i++) {
    const angle = Math.random() * TAU, speed = Math.random() * 22 * Math.sqrt(size);
    particles.push({
      x: x + ((Math.random() - .5) * 5 * size), y: y + ((Math.random() - .5) * 5 * size),
      vx: Math.cos(angle) * speed, vy: (Math.sin(angle) * speed) + (SCROLL_SPEED / 2),
      radius: 2 + (Math.random() * 2 * Math.sqrt(size)), age: 0, life: .35 + (Math.random() * .4),
    });
  }
  for(let i = 0; i < 3 * size; i++) {
    const angle = Math.random() * TAU, speed = 60 + (Math.random() * 90);
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 0/*a spark*/, age: 0, life: .2 + (Math.random() * .25) });
  }
  if(particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  game.shake = Math.max(game.shake, size * 1.5);
  play((size >= 3) ? 'bigBoom' : 'boom', .05);
};

// == Enemies =====================================================================
const spawn = (type, at) => {
  const kind = ENEMIES[type];
  const enemy = { type, kind, t: 0, flash: 0, phase: 0, ...at };
  enemy.hp = enemy.max = Math.round(kind.hp * (1 + (game.level * .3)));
  enemy.fire = kind.fire || ((enemy.move === Move.Hold) ? HOLD_FIRE_SECONDS : 0);
  enemy.fireAt = enemy.fire * (.5 + Math.random());
  enemies.push(enemy);
  return enemy;
};

const bulletSpeed = () => BULLET_SPEED * (1 + (game.level * .15));
const shoot = (x, y, angle, speed = bulletSpeed(), size = 0) =>
  bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size });
const aimFrom = (x, y) => Math.atan2(player.y - y, player.x - x);
const fan = (x, y, count, spread, size) => {
  const angle = aimFrom(x, y);
  for(let i = 0; i < count; i++) shoot(x, y, angle + ((i - ((count - 1) / 2)) * spread), undefined/*the level's*/, size);
};

// -- Boss ------------------------------------------------------------------------
// three attacks in turn, quicker once it is down to half
const bossAttack = (boss) => {
  if(boss.dead || (game.boss !== boss)) return/*gone*/;

  const rage = boss.hp < (boss.max / 2);
  switch(boss.attack++ % 3) {
    case 0:
      for(let burst = 0; burst < 3; burst++) later(burst * .3, () => { if(!boss.dead) fan(boss.x, boss.y + 14, 5 + game.level, .2, 1); });
      break;
    case 1:
      for(let ring = 0; ring < (rage ? 2 : 1); ring++) {
        later(ring * .5, () => {
          if(boss.dead) return/*gone*/;
          const count = 12 + (game.level * 3);
          for(let i = 0; i < count; i++) shoot(boss.x, boss.y, ((i + (ring / 2)) / count) * TAU, bulletSpeed() * .8);
        });
      }
      break;
    default:
      for(let i = 0; i < 9; i++) {
        later(i * .13, () => {
          if(boss.dead) return/*gone*/;
          for(const side of [-1, 1]) shoot(boss.x + (side * 30), boss.y + 6, (Math.PI / 2) + (side * Math.sin(i * .7) * .25), bulletSpeed() * 1.2, 1);
        });
      }
      if(rage && (game.level > 0)) FORMATION.swoop('fighter', 4, (boss.attack % 2) ? 1 : -1);
  }
  later(rage ? 1.8 : 2.5, () => bossAttack(boss));
};

// -- Formations ------------------------------------------------------------------
// `at`: a fraction of the playfield's width
const FORMATION = {
  // a V, diving
  vee: (type, count, at) => {
    for(let i = 0; i < count; i++) {
      const offset = i - ((count - 1) / 2);
      spawn(type, { x: (W * at) + (offset * 15), y: -12 - (Math.abs(offset) * 11), move: Move.Dive, speed: 62 });
    }
  },
  // one behind the other, snaking down
  column: (type, count, at) => {
    for(let i = 0; i < count; i++) spawn(type, { x: W * at, x0: W * at, y: -12 - (i * 17), move: Move.Weave, speed: 58, phase: -i * .64 });
  },
  // in from one side (`side`: 1 from the left, -1 from the right), down in an arc and out the other
  swoop: (type, count, side) => {
    for(let i = 0; i < count; i++) spawn(type, { x: -99, y: 0, move: Move.Swoop, side, delay: i * .3 });
  },
  // rows that fly in, hold their slots and peel off at the player, the back row last
  grid: (type, columns, rows) => {
    const gap = Math.min(17, (W - 20) / columns);
    for(let row = 0; row < rows; row++) {
      for(let column = 0; column < columns; column++) {
        const offset = column - ((columns - 1) / 2);
        spawn(type, {
          x: (W / 2) + (offset * gap * 2.5), y: -14 - (row * 16),
          tx: (W / 2) + (offset * gap), ty: top + 14 + (row * 15),
          move: Move.Hold, stay: 5 + ((((rows - 1 - row) * columns) + column) * .45), phase: column,
        });
      }
    }
  },
  // a big one that comes down, lingers and leaves
  one: (type, at) => spawn(type, { x: W * at, y: -20, move: Move.Cruise, phase: at * 9 }),
  turret: (at) => spawn('turret', { x: W * at, y: -10, move: Move.Ground }),
  boss: () => {
    const boss = game.boss = spawn('boss', { x: W / 2, y: -40, move: Move.Boss, attack: 0 });
    boss.hp = boss.max = LEVELS[game.level].bossHp;
    play('alarm');
    later(2.6, () => bossAttack(boss));
  },
};

const runScript = () => {
  const script = LEVELS[game.level].script;
  while(game.cursor < script.length) {
    const [at, formation, ...args] = script[game.cursor];
    if(at > game.clock) return/*not yet*/;
    // NOTE: the boss waits for the sky to clear, though never long
    if((formation === 'boss') && (game.clock < (at + 6)) && enemies.some((enemy) => !enemy.kind.ground)) return;
    FORMATION[formation](...args);
    game.cursor++;
  }
};

// -- Trains ----------------------------------------------------------------------
// a train runs down one of the level's lanes, its lane marked first: nothing stops
// it, and the plane gets out of its way. `y`: its front
const sendTrain = () => {
  const { lanes, sound } = TRAINS[LEVELS[game.level].theme];
  trains.push({ x: Math.round(W / 2) + lanes[Math.floor(Math.random() * lanes.length)], y: -2, wait: TRAIN_WARNING_SECONDS, cars: 3 + Math.floor(Math.random() * 3), paint: Math.floor(Math.random() * 3) });
  play(sound);
};
const trainLength = (train) => HEAD_LENGTH + (train.cars * CAR_LENGTH);
// whether a point, with `reach` around it, is on a train that has come
const onTrain = (train, x, y, reach) =>
  (train.wait <= 0) && (Math.abs(x - train.x) < (TRAIN_HALF_WIDTH + reach)) && (y < (train.y + reach)) && (y > (train.y - trainLength(train) - reach));

// trains come until the boss is down, the sooner after one another the nearer the
// boss is
const runTrains = (dt) => {
  for(const train of trains) {
    if(train.wait > 0) train.wait -= dt;
    else train.y += TRAIN_SPEED * dt;
  }
  const level = LEVELS[game.level], due = level.script.at(-1)[0];
  if(!player.alive || (game.clock < game.nextTrain) || ((game.cursor >= level.script.length) && !game.boss)) return/*no one to dodge, not yet, or the boss is down*/;
  sendTrain();
  const [early, late] = level.trains;
  game.nextTrain = game.clock + ((early + ((late - early) * Math.min(1, game.clock / due))) * (.8 + (Math.random() * .4)));
};

const moveEnemy = (enemy, dt) => {
  enemy.t += dt;
  switch(enemy.move) {
    case Move.Dive:
      enemy.y += enemy.speed * dt;
      break;
    case Move.Weave:
      enemy.y += enemy.speed * dt;
      enemy.x = enemy.x0 + (Math.sin((enemy.t * 2.2) + enemy.phase) * W * .2);
      break;
    case Move.Swoop: {
      const progress = (enemy.t - enemy.delay) * .3;
      if(progress < 0) break/*waiting its turn, off the screen*/;
      enemy.x = (W / 2) - (enemy.side * ((W / 2) + 14) * Math.cos(progress * Math.PI));
      enemy.y = (H * .08) + (H * .42 * Math.sin(progress * Math.PI));
      if(progress > 1) enemy.gone = true;
      break;
    }
    case Move.Hold: {
      if(enemy.t < enemy.stay) {
        const ease = Math.min(1, dt * 3);
        enemy.x += (enemy.tx - enemy.x) * ease;
        enemy.y += (enemy.ty + (Math.sin((enemy.t * 2) + enemy.phase) * 2) - enemy.y) * ease;
        break;
      } /* else -- peels off at where the player is */
      if(enemy.vy === undefined) {
        const angle = aimFrom(enemy.x, enemy.y);
        enemy.vx = Math.cos(angle) * 120; enemy.vy = Math.max(70, Math.sin(angle) * 120);
        enemy.fire = 0;
      } /* else -- on its way */
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      break;
    }
    case Move.Cruise:
      if(enemy.t > 14) enemy.y += 55 * dt;
      else if(enemy.y < (top + 22)) enemy.y += 40 * dt;
      else enemy.x += Math.sin((enemy.t * .7) + enemy.phase) * 14 * dt;
      break;
    case Move.Ground:
      enemy.y += SCROLL_SPEED * dt;
      break;
    case Move.Boss:
      enemy.y += (top + 30 - enemy.y) * Math.min(1, dt * 1.2);
      if(enemy.t > 2.6) enemy.x = (W / 2) + (Math.sin((enemy.t - 2.6) * .55) * W * .24);
      break;
  }
  if(enemy.y > (H + 30)) enemy.gone = true;
  if(enemy.flash > 0) enemy.flash -= dt;

  // its guns, while it is on the screen and the player is there to shoot at
  if(!enemy.fire || !player.alive || (enemy.y < 4) || (enemy.y > (H * .8))) return;
  enemy.fireAt -= dt;
  if(enemy.fireAt > 0) return/*not yet*/;
  enemy.fireAt = enemy.fire * (.7 + (Math.random() * .6)) / (1 + (game.level * .2));
  if(enemy.type === 'bomber') fan(enemy.x, enemy.y + 6, 3, .28, 1);
  else shoot(enemy.x, enemy.y, aimFrom(enemy.x, enemy.y));
};

const drop = (x, y) => {
  const repair = (game.hp < MAX_HP) && (Math.random() < .35);
  pickups.push({ x: Math.min(W - 10, Math.max(10, x)), y, t: 0, kind: repair ? Pickup.Repair : DROPS[game.drops++ % DROPS.length] });
};

// the boss takes its escort and every bullet in the air down with it
const finishBoss = (boss) => {
  game.boss = null;
  bullets = [];
  for(const enemy of enemies) hurtEnemy(enemy, enemy.hp);
  for(let i = 0; i < 9; i++) later(i * .16, () => explode(boss.x + ((Math.random() - .5) * 56), boss.y + ((Math.random() - .5) * 34), 3));
  later(1.5, () => explode(boss.x, boss.y, 7));
  later(2.6, clearLevel);
};

const hurtEnemy = (enemy, damage) => {
  if(enemy.dead) return/*already down*/;
  enemy.hp -= damage;
  enemy.flash = .06;
  if(enemy.hp > 0) { play('hit', .05); return; }

  enemy.dead = true;
  game.score += enemy.kind.score * (game.level + 1);
  explode(enemy.x, enemy.y, enemy.kind.big ? 3 : 1);
  if(enemy.kind.drops || ((++game.kills % KILLS_A_DROP) === 0)) drop(enemy.x, enemy.y);
  if(enemy === game.boss) finishBoss(enemy);
};

// == Player ======================================================================
const collect = (kind) => {
  let label = PICKUPS[kind].label;
  switch(kind) {
    case Pickup.Power:
      if(game.power < MAX_POWER) game.power++;
      else { game.score += 1000; label = 'Bonus'; }
      break;
    case Pickup.Shield:
      game.shieldUntil = game.time + SHIELD_SECONDS;
      break;
    case Pickup.Wingmen:
      game.wingmenUntil = game.time + WINGMEN_SECONDS;
      break;
    case Pickup.Blast:
      bullets = [];
      for(const enemy of enemies) if(enemy.y > -10) hurtEnemy(enemy, BLAST_DAMAGE);
      explode(player.x, player.y - 30, 6);
      break;
    case Pickup.Repair:
      if(game.hp < MAX_HP) game.hp++;
      else { game.score += 1000; label = 'Bonus'; }
      break;
  }
  play(kind);
  showToast(label);
};

// the end screen: the score, whether it is this person's best and the high scores
// with it in them
const endGame = (won) => {
  const record = !game.unkept && (game.score > best);
  if(record) best = game.score;
  setMode(Mode.Over);
  showPanel(won ? 'Mission Complete' : 'Game Over', `Score ${number(game.score)}<br>${record ? 'New best!' : `Your best ${number(best)}`}`, 'Tap to continue', { scores: true });
  showBoard();
  saveFailed = false/*tried again*/;
  savePilot();
  play(won ? 'win' : 'over');
  if(record) play('best', 0, won ? 2.2 : 1.5);

  // NOTE: a tap this soon is the finger still flying, not an answer
  panel.classList.add('held');
  setTimeout(() => panel.classList.remove('held'), END_HOLD_MILLIS);
};

const hurtPlayer = () => {
  if(!player.alive || (game.time < game.hurtUntil)) return/*gone, or still recovering*/;
  if(game.time < game.shieldUntil) return/*the shield takes it*/;

  game.hp--;
  game.power = Math.max(1, game.power - 1);
  game.hurtUntil = game.time + HURT_SECONDS;
  game.shake = 6;
  play('hurt');
  bullets = bullets.filter((bullet) => Math.hypot(bullet.x - player.x, bullet.y - player.y) > 50);
  if(game.hp > 0) { explode(player.x, player.y, 1); return; }

  player.alive = false;
  explode(player.x, player.y, 5);
  later(1.4, () => endGame(false/*shot down*/));
};

const firePlayer = () => {
  if(game.time >= game.nextShot) {
    game.nextShot = game.time + FIRE_SECONDS;
    for(const [dx, angle] of SHOTS[game.power - 1]) {
      shots.push({ x: player.x + dx, y: player.y - 12, vx: Math.sin(angle) * SHOT_SPEED, vy: -Math.cos(angle) * SHOT_SPEED });
    }
    play('shot');
  } /* else -- the guns are cycling */
  if((game.time < game.wingmenUntil) && (game.time >= game.nextWingmanShot)) {
    game.nextWingmanShot = game.time + WINGMAN_FIRE_SECONDS;
    for(const side of [-1, 1]) shots.push({ x: player.x + (side * 22), y: player.y + 2, vx: 0, vy: -SHOT_SPEED });
  } /* else -- no wingmen, or theirs are cycling */
};

// == Levels' Flow ================================================================
const startLevel = (level) => {
  game.level = level;
  game.clock = 0; game.cursor = 0;
  game.boss = null;
  enemies = []; trains = []; bullets = []; pickups = [];
  game.nextTrain = LEVELS[level].trains[0] * .7;
  for(const type of ['fighter', 'ace', 'bomber', 'boss']) ENEMIES[type].sprite = SPRITE[type][level];
  ENEMIES.turret.sprite = SPRITE.turret;
  ground = buildGround(LEVELS[level].theme, LEVELS[level].seed);

  showPanel(`Level ${level + 1}`, LEVELS[level].name, '', { banner: true });
  later(2, hidePanel);
  play((level > 0) ? 'level' : 'start');
};

function clearLevel() {
  if(!player.alive) return/*shot down as the boss went*/;
  if(game.level === (LEVELS.length - 1)) { endGame(true/*won*/); return; }

  showPanel('Level Clear', `Score ${number(game.score)}`, '', { banner: true });
  play('clear');
  later(2.2, () => {
    game.hp = Math.min(MAX_HP, game.hp + 1);
    startLevel(game.level + 1);
  });
}

const startGame = () => {
  Object.assign(game, { time: 0, score: 0, unkept: false, hp: MAX_HP, power: 1, kills: 0, drops: 0, shake: 0, hurtUntil: 0, shieldUntil: 0, wingmenUntil: 0, nextShot: 0, nextWingmanShot: 0 });
  shots = []; particles = []; timers = [];
  player.x = W / 2; player.y = H * .78; player.alive = true;
  setMode(Mode.Playing);
  startLevel(0);
};

const showTitle = () => {
  setMode(Mode.Title);
  showPanel('Flak Run', 'Drag anywhere to fly.<br>The guns fire on their own.', 'Tap to start', { scores: true, invites: true });
  showBoard();
};

const pause = () => {
  if(game.mode !== Mode.Playing) return/*nothing to pause*/;
  setMode(Mode.Paused);
  showPanel('Paused', '', 'Tap to resume');
};

// a tap anywhere, outside of play: the title starts a game, a pause resumes and an
// end screen goes back to the title
const tap = () => {
  switch(game.mode) {
    case Mode.Title: startGame(); break;
    case Mode.Paused: setMode(Mode.Playing); hidePanel(); break;
    case Mode.Over: if(!panel.classList.contains('held')) showTitle(); break;
  }
};

// == Update ======================================================================
// keeps what is still in play, without making a new array each frame
const keep = (list, alive) => {
  let kept = 0;
  for(const item of list) if(alive(item)) list[kept++] = item;
  list.length = kept;
};
const onScreen = (item) => (item.x > -8) && (item.x < (W + 8)) && (item.y > -12) && (item.y < (H + 12));

const update = (dt) => {
  game.time += dt; game.clock += dt;
  scroll = (scroll + (SCROLL_SPEED * dt)) % ground.height;
  game.shake = Math.max(0, game.shake - (dt * 14));

  // NOTE: a timer may add timers: those run from the next step on
  const due = timers.filter((timer) => timer.at <= game.time);
  timers = timers.filter((timer) => timer.at > game.time);
  for(const timer of due) timer.run();
  if(game.mode !== Mode.Playing) return/*a timer ended the play*/;

  runScript();
  runTrains(dt);
  if(player.alive) firePlayer();

  for(const shot of shots) { shot.x += shot.vx * dt; shot.y += shot.vy * dt; }
  for(const bullet of bullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; }
  for(const enemy of enemies) moveEnemy(enemy, dt);

  // -- Hits ----------------------------------------------------------------------
  for(const shot of shots) {
    if(trains.some((train) => onTrain(train, shot.x, shot.y, 1))) {
      particles.push({ x: shot.x, y: shot.y, vx: 0, vy: TRAIN_SPEED, radius: 1, age: 0, life: .1 });
      play('hit', .05);
      shot.spent = true;
      continue/*stopped by a train*/;
    } /* else -- clear of the trains */
    for(const enemy of enemies) {
      if(enemy.dead || (enemy.y < -4)) continue/*down, or not on the screen yet*/;
      const reach = enemy.kind.radius + 2;
      if((Math.abs(shot.x - enemy.x) > reach) || (Math.abs(shot.y - enemy.y) > reach)) continue/*missed*/;
      hurtEnemy(enemy, 1);
      particles.push({ x: shot.x, y: shot.y, vx: 0, vy: 30, radius: 1, age: 0, life: .12 });
      shot.spent = true;
      break;
    }
  }
  if(player.alive) {
    if(trains.some((train) => onTrain(train, player.x, player.y, HIT_RADIUS))) hurtPlayer();
    for(const bullet of bullets) {
      if(Math.hypot(bullet.x - player.x, bullet.y - player.y) > (HIT_RADIUS + bullet.size + 1)) continue/*missed*/;
      bullet.spent = true;
      hurtPlayer();
    }
    for(const enemy of enemies) {
      if(enemy.dead || enemy.kind.ground) continue/*nothing to fly into*/;
      if(Math.hypot(enemy.x - player.x, enemy.y - player.y) > (BODY_RADIUS + enemy.kind.radius)) continue/*clear*/;
      hurtEnemy(enemy, enemy.kind.big ? 4 : enemy.hp);
      hurtPlayer();
    }
    for(const pickup of pickups) {
      pickup.t += dt;
      pickup.y += 30 * dt;
      pickup.x += Math.sin(pickup.t * 3) * 10 * dt;
      // it leans toward a plane that is near
      const distance = Math.hypot(pickup.x - player.x, pickup.y - player.y);
      if(distance < 44) { pickup.x += ((player.x - pickup.x) / distance) * 60 * dt; pickup.y += ((player.y - pickup.y) / distance) * 60 * dt; }
      if(distance > PICKUP_RADIUS) continue/*not reached*/;
      pickup.taken = true;
      collect(pickup.kind);
    }
  } /* else -- shot down: nothing more to hit */

  for(const particle of particles) { particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }

  keep(shots, (shot) => !shot.spent && onScreen(shot));
  keep(bullets, (bullet) => !bullet.spent && onScreen(bullet));
  keep(enemies, (enemy) => !enemy.dead && !enemy.gone);
  keep(trains, (train) => (train.y - trainLength(train)) < (H + 4));
  keep(pickups, (pickup) => !pickup.taken && (pickup.y < (H + 12)));
  keep(particles, (particle) => particle.age < particle.life);
};

// == Render ======================================================================
const put = (image, x, y) => ctx.drawImage(image, Math.round(x - (image.width / 2)), Math.round(y - (image.height / 2)));

const render = (now) => {
  const shake = (game.shake > .5) ? Math.round((Math.random() - .5) * game.shake * 2) : 0;
  const offset = Math.floor(scroll + shake + ground.height) % ground.height;
  ctx.drawImage(ground, 0, offset - ground.height);
  ctx.drawImage(ground, 0, offset);
  ctx.setTransform(1, 0, 0, 1, 0, shake);

  // -- On the Ground -------------------------------------------------------------
  const trainArt = SPRITE.train[LEVELS[game.level].theme];
  for(const train of trains) {
    if(train.wait > 0) { if((now % 240) < 150) put(SPRITE.warning.image, train.x, top + 8); continue; }
    for(let car = train.cars - 1; car >= 0; car--) put(trainArt.cars[(train.paint + car) % trainArt.cars.length].image, train.x, train.y - HEAD_LENGTH - (car * CAR_LENGTH) - (CAR_LENGTH / 2));
    put(trainArt.head.image, train.x, train.y - (HEAD_LENGTH / 2));
  }
  for(const enemy of enemies) {
    if(!enemy.kind.ground) continue/*in the air*/;
    put((enemy.flash > 0) ? enemy.kind.sprite.flash : enemy.kind.sprite.image, enemy.x, enemy.y);
    // its barrel follows the player
    const angle = aimFrom(enemy.x, enemy.y);
    ctx.fillStyle = INK;
    for(let reach = 2; reach <= 7; reach++) ctx.fillRect(Math.round(enemy.x + (Math.cos(angle) * reach)) - 1, Math.round(enemy.y + (Math.sin(angle) * reach)) - 1, 2, 2);
  }

  // -- Shadows -------------------------------------------------------------------
  const blink = (game.time < game.hurtUntil) && ((now % 160) < 80);
  const showPlayer = player.alive && (game.mode !== Mode.Title) && !blink;
  ctx.globalAlpha = .22;
  for(const enemy of enemies) if(!enemy.kind.ground) put(enemy.kind.sprite.shadow, enemy.x + 5, enemy.y + 9);
  if(showPlayer) put(SPRITE.player.shadow, player.x + 5, player.y + 9);
  ctx.globalAlpha = 1;

  // -- In the Air ----------------------------------------------------------------
  for(const pickup of pickups) put(SPRITE.pickup[pickup.kind].image, pickup.x, pickup.y + Math.sin(pickup.t * 5));
  for(const enemy of enemies) if(!enemy.kind.ground) put((enemy.flash > 0) ? enemy.kind.sprite.flash : enemy.kind.sprite.image, enemy.x, enemy.y);
  for(const shot of shots) put(SHOT, shot.x, shot.y);

  if(showPlayer) {
    const flicker = (now % 120) < 60;
    if(game.time < game.wingmenUntil) {
      // about to leave, they flicker
      if(((game.wingmenUntil - game.time) > 2) || flicker) for(const side of [-1, 1]) put(SPRITE.wingman.image, player.x + (side * 22), player.y + 8);
    } /* else -- flying alone */
    ctx.fillStyle = flicker ? '#ffe066' : '#ff9a2e';
    ctx.fillRect(Math.round(player.x) - 2, Math.round(player.y) + 14, 1, flicker ? 3 : 2);
    ctx.fillRect(Math.round(player.x) + 1, Math.round(player.y) + 14, 1, flicker ? 3 : 2);
    put(SPRITE.player.image, player.x, player.y);
    if((game.time < game.shieldUntil) && (((game.shieldUntil - game.time) > 2) || flicker)) {
      ctx.globalAlpha = .55 + (.3 * Math.sin(now / 90));
      put(SHIELD, player.x, player.y);
      ctx.globalAlpha = 1;
    } /* else -- no shield */
  } /* else -- not shown: the title, shot down or blinking */

  for(const bullet of bullets) put(BULLETS[bullet.size], bullet.x, bullet.y);

  for(const particle of particles) {
    const spent = particle.age / particle.life;
    if(!particle.radius) { ctx.fillStyle = (spent < .5) ? '#fff7d6' : '#ff9a2e'; ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 1, 1); continue; }
    const radius = Math.max(1, Math.round(particle.radius * ((spent < .25) ? .6 + (spent * 1.6) : 1 - ((spent - .25) * .7))));
    put(disc(radius, FIRE[Math.min(FIRE.length - 1, Math.floor(spent * FIRE.length))]), particle.x, particle.y);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

// == Layout ======================================================================
// the playfield fills the screen's width in whole game pixels; a wide window gets a
// column of the phone's shape
const layout = () => {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.min(window.innerWidth, Math.round(window.innerHeight * MAX_ASPECT)), height = window.innerHeight;
  const size = Math.max(1, Math.round((width * ratio) / TARGET_WIDTH));
  scale = size / ratio;
  W = Math.ceil(width / scale); H = Math.ceil(height / scale);
  canvas.width = W; canvas.height = H;
  canvas.style.width = `${W * scale}px`; canvas.style.height = `${H * scale}px`;
  stage.style.width = `${width}px`; stage.style.height = `${height}px`;
  ctx.imageSmoothingEnabled = false;

  top = Math.ceil($('#boss').getBoundingClientRect().bottom / scale) + 4;
  ground = buildGround(LEVELS[game.level].theme, LEVELS[game.level].seed);
  scroll %= ground.height;
  player.x = Math.min(W - 10, Math.max(10, player.x || (W / 2)));
  player.y = Math.min(H - 16, Math.max(top + 14, player.y || (H * .78)));
};

// == Input =======================================================================
// the plane moves as the finger does, from wherever the finger went down: it is
// never under the finger. Outside of play, a finger that goes down and lifts is a tap
let drag = null;
stage.addEventListener('pointerdown', (event) => {
  if(event.target.id === 'pause') return/*the button's own*/;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, tap: game.mode !== Mode.Playing };
  try { stage.setPointerCapture(event.pointerId); } catch(error) { /*the pointer is already gone*/ }
});
stage.addEventListener('pointermove', (event) => {
  if(!drag || (event.pointerId !== drag.id)) return/*another finger*/;
  if((game.mode === Mode.Playing) && player.alive) {
    player.x = Math.min(W - 10, Math.max(10, player.x + (((event.clientX - drag.x) / scale) * DRAG_GAIN)));
    player.y = Math.min(H - 16, Math.max(top + 14, player.y + (((event.clientY - drag.y) / scale) * DRAG_GAIN)));
  } /* else -- nothing to fly */
  drag.x = event.clientX; drag.y = event.clientY;
});
stage.addEventListener('pointerup', (event) => {
  if(!drag || (event.pointerId !== drag.id)) return/*another finger*/;
  startAudio();
  if(drag.tap) tap();
  drag = null;
});
stage.addEventListener('pointercancel', (event) => { if(drag && (event.pointerId === drag.id)) drag = null; });
// NOTE: iOS starts audio from a `touchend` or a `click`, whatever else the tap raised
document.addEventListener('touchend', startAudio);
document.addEventListener('click', startAudio);

$('#pause').addEventListener('click', pause);

// the page never scrolls, zooms or offers a menu
document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('contextmenu', (event) => event.preventDefault());

// leaving the app (the home screen, a call, a lock) pauses the play
document.addEventListener('visibilitychange', () => { if(document.hidden) pause(); });
addEventListener('resize', layout);

// == Boot ========================================================================
let last = 0;
const frame = (now) => {
  const dt = Math.min(MAX_STEP_SECONDS, (now - last) / 1000);
  last = now;
  if(game.mode === Mode.Playing) update(dt);
  else if(game.mode !== Mode.Paused) scroll = (scroll + (SCROLL_SPEED * dt)) % ground.height/*the terrain rolls on*/;
  updateHud();
  render(now);
  requestAnimationFrame(frame);
};

// the phone's status bar takes the color of the HUD's ink
window.charmiq.page.setTopColor({ light: INK, dark: INK });

layout();
showTitle();

// who is playing, and the pilots as `content$` gives them: another person's best
// shows here as they fly it
window.charmiq.user$().subscribe({
  next: receiveUser,
  error: (error) => {
    console.error('Could not read the User', error);
    userFailed = true;
    receiveUser(null);
  },
});
appContent.content$(APP_CONTENT_SELECTOR).subscribe({
  next: receive,
  error: (error) => {
    console.error(`Could not read the ${APP_CONTENT_NAME} app-content`, error);
    contentFailed = true;
    showBoard();
  },
});
requestAnimationFrame((now) => { last = now; frame(now); });
})();
</script>
</body>
</html>
    </app-source>
  </iframe-app>
</p>

## How to Play

* **Flying:** the plane moves as your finger does, from wherever your finger went down, so it is never under your finger. A second tap is never needed.

* **Pickups** fall from every bomber and boss, and from one in nine of everything else shot down:


  | Pickup | What it does |
  |----|----|
  | Arrow (gold) | More guns, up to five steps; a hit takes one step back |
  | Shield (blue) | Ten seconds in which nothing hurts |
  | Two planes (green) | Two wingmen for twenty seconds |
  | Star (violet) | Clears every bullet and hits everything on the screen |
  | Cross (red) | One heart back |

* **Trains.** Something runs down the middle of every level: a train on the Rail Yard's tracks, a convoy on the Dune Road, a tug and its barges in the Open Water's channel. A gold mark shows over its lane and a horn sounds before it comes; nothing stops it, so get out of its way. They come more often the nearer the boss is.

* **Three hearts.** Every game starts at the first level and ends on a screen with your score: shot down, or the third boss beaten. Leaving the app pauses it.

* **High scores** (`pilots.json`, the Application's app-content): a line for each person who has opened the game, with their name and their best score, written by that person alone. The title and the end screen list everyone, the highest first. Share the document as an Editor and each person who opens it joins the list; a best shows on everyone's screen as it is flown. It asks to read your account (`user.read`) for your name; signed out, no score is kept.

* **Sound** starts with your first tap, plays beside your own music, and is muted by the phone's silent switch.

## On Your Phone

* **Home-screen setup:** [Mobile](charmiq://../README.md).

* **It loads nothing.** Every plane, shot, explosion and landscape is drawn in code as the Application opens, and every sound is made as it plays: there are no picture or sound files.

* **Its icon:** `icon-512.png` (`icon.svg` is its source). Set it in **Document Properties → Home Screen** on your copy, before adding the game to your home screen.