# After Hours

*The shop is shut and the window is dark. Tilt your phone to roll a glass ornament through the display, a maze that draws itself in line as its light passes, and find the star.*

<p style="display: flex; justify-content: center;">
  <iframe-app height="874px" requested-scopes="%5B%22page.motion%22%2C%22user.read%22%5D" width="402px">
    <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>After Hours</title>
<style>
:root {
  --night: #14161b;
  --panel: rgba(22,24,30,.94);
  --cream: #f3ecdc;
  --cream2: rgba(243,236,220,.88);
  --cream3: rgba(243,236,220,.6);
  --hair: rgba(243,236,220,.2);
  --gold: #c9a45a;
  --safe-t: env(safe-area-inset-top,0px);
  --safe-b: env(safe-area-inset-bottom,0px);
  --safe-r: env(safe-area-inset-right,0px);
  --safe-l: env(safe-area-inset-left,0px);
  --display: "Didot","Bodoni 72","Bodoni MT","Playfair Display",Georgia,serif;
  --text: "Baskerville","Hoefler Text","Iowan Old Style",Georgia,serif;
  --label: "Avenir Next","Avenir","Helvetica Neue",-apple-system,system-ui,sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
html, body { height: 100%; overflow: hidden; background: var(--night); overscroll-behavior: none; }
body {
  font-family: var(--text); font-size: 19px; color: var(--cream);
  -webkit-font-smoothing: antialiased; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
[hidden] { display: none !important; }

#scene { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }

/* small capitals, widely set: every label */
.label { font-family: var(--label); font-size: 14px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; }

#tag {
  position: fixed; top: calc(18px + var(--safe-t)); left: calc(20px + var(--safe-l)); max-width: calc(100% - 96px);
  display: flex; align-items: center; gap: 12px; color: var(--cream2);
}
/* beside the Level button the name gives way */
#tag.narrow { max-width: calc(100% - 186px); }
#tag-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
#tag-keys { display: flex; gap: 6px; flex: none; }
#tag-keys i { width: 10px; height: 10px; border-radius: 5px; display: block; }

#gear {
  position: fixed; top: calc(6px + var(--safe-t)); right: calc(10px + var(--safe-r)); width: 44px; height: 44px;
  display: grid; place-items: center; color: var(--cream2);
}
#gear svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

#relevel {
  position: fixed; top: calc(10px + var(--safe-t)); right: calc(62px + var(--safe-r)); min-height: 36px; padding: 0 14px;
  border: 1.5px solid var(--gold); border-radius: 18px; color: var(--cream);
}

.screen { position: fixed; inset: 0; display: grid; place-items: center; padding: 32px; text-align: center; }
#title { background: radial-gradient(120% 80% at 50% 42%, rgba(20,22,27,.2), rgba(20,22,27,.86)); }
#card, #leveling { background: rgba(20,22,27,.84); }
.screen > div { width: min(100%, 320px); }
.screen h1 { font-family: var(--display); font-size: 42px; font-weight: 700; line-height: 1.1; letter-spacing: .14em; text-transform: uppercase; padding-left: .14em; }
.screen h2 { font-family: var(--display); font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: .03em; }
.rule { width: 40px; height: 2px; background: var(--gold); margin: 20px auto; }
.screen p { font-size: 20px; color: var(--cream2); line-height: 1.4; overflow-wrap: break-word; }
.screen p + p { margin-top: 6px; }
.go {
  margin-top: 30px; min-height: 52px; padding: 0 36px; border: 1.5px solid var(--gold); border-radius: 26px; color: var(--cream);
  transition: background .2s;
}
.go:active { background: rgba(201,164,90,.18); }
.go:disabled { opacity: .4; }

/* the tilt as it is now: a bead in a ring, centered when the phone is level */
#bubble { position: relative; width: 132px; height: 132px; margin: 4px auto 20px; border: 2px solid var(--cream3); border-radius: 66px; }
#bubble::before, #bubble::after { content: ''; position: absolute; background: var(--hair); }
#bubble::before { left: 50%; top: 14px; bottom: 14px; width: 1px; }
#bubble::after { top: 50%; left: 14px; right: 14px; height: 1px; }
#bubble i { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 11px; background: var(--gold); z-index: 1; }

#note {
  position: fixed; left: 50%; bottom: calc(26px + var(--safe-b)); transform: translateX(-50%);
  width: max-content; max-width: calc(100% - 40px); padding: 10px 18px; text-align: center; line-height: 1.4; overflow-wrap: break-word;
  font-size: 18px; color: var(--cream); background: rgba(20,22,27,.86); border: 1px solid var(--hair); border-radius: 14px;
}
#note button { display: block; margin: 10px auto 2px; min-height: 40px; padding: 0 20px; border: 1.5px solid var(--gold); border-radius: 20px; color: var(--cream); }

#scrim { position: fixed; inset: 0; background: rgba(8,9,12,.5); }
#sheet {
  position: fixed; left: 0; right: 0; bottom: 0; max-width: 460px; margin: 0 auto; padding: 22px 24px calc(22px + var(--safe-b));
  max-height: calc(100% - 60px); overflow-y: auto; -webkit-overflow-scrolling: touch;
  background: var(--panel); border-top: 1px solid var(--hair); border-radius: 18px 18px 0 0;
}
#sheet h2 { color: var(--cream3); margin-bottom: 8px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid var(--hair); }
.row > span { min-width: 0; overflow-wrap: break-word; }
.row small { display: block; margin-top: 2px; color: var(--cream3); font-size: 16px; line-height: 1.3; }
.pill { flex: none; min-width: 72px; min-height: 40px; padding: 0 16px; border: 1.5px solid var(--cream3); border-radius: 20px; color: var(--cream); }
.pill.on { border-color: var(--gold); color: var(--gold); }
#levels { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 12px; }
#levels button { width: 46px; height: 46px; border: 1.5px solid var(--cream3); border-radius: 23px; font-family: var(--display); font-size: 21px; font-weight: 700; color: var(--cream); }
#levels button.here { border-color: var(--gold); color: var(--gold); }
#levels button:disabled { opacity: .3; }
#done { display: block; margin: 16px 0 0 auto; }
</style>
</head>
<body>
<canvas id="scene" aria-label="A maze drawn in line on a dark page. Tilt the phone to roll the ornament through it."></canvas>

<div id="tag" class="label" hidden><span id="tag-name"></span><span id="tag-keys"></span></div>
<button id="relevel" class="label" hidden>Level</button>
<button id="gear" aria-label="Settings" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/></svg>
</button>

<div id="note" role="status" hidden><span id="note-text"></span><button id="note-go" class="label" hidden></button></div>

<div id="title" class="screen">
  <div>
    <h1>After Hours</h1>
    <div class="rule"></div>
    <p>The shop is shut. The window is dark.</p>
    <p id="title-how">Tilt to roll. Find the star.</p>
    <button id="begin" class="go label">Begin</button>
  </div>
</div>

<div id="leveling" class="screen" hidden>
  <div>
    <h2>Level the tilt</h2>
    <div class="rule"></div>
    <div id="bubble"><i id="bead"></i></div>
    <p id="leveling-text"></p>
    <button id="set-level" class="go label">Set level</button>
  </div>
</div>

<div id="card" class="screen" hidden>
  <div>
    <h2 id="card-title"></h2>
    <div class="rule"></div>
    <p id="card-text"></p>
    <button id="card-go" class="go label"></button>
  </div>
</div>

<div id="scrim" hidden></div>
<section id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden>
  <h2 id="sheet-title" class="label">Settings</h2>
  <div class="row"><span>Level the tilt<small>However you hold the phone now becomes flat.</small></span><button id="recenter" class="pill label">Set</button></div>
  <div class="row"><span>Steer with a finger<small>Drag on the page instead of tilting. Arrow keys work too.</small></span><button id="finger" class="pill label" aria-pressed="false">Off</button></div>
  <div class="row"><span>Begin this level again</span><button id="restart" class="pill label">Again</button></div>
  <div class="row" style="display:block"><span class="label" style="color:var(--cream3)">Levels</span><div id="levels"></div></div>
  <button id="done" class="pill on label">Done</button>
</section>

<script>
(() => {
'use strict';

// == Constants ===================================================================
// a level's text: one character for each tile (SEE: the `levels.txt` app-content)
const WALL = '#', FLOOR = '.', START = 'S', GOAL = 'G', HOLE = 'o', LIFT = '^', ICE = '~';
const isKey = (cell) => (cell >= 'a') && (cell <= 'c');
const isDoor = (cell) => (cell >= 'A') && (cell <= 'C');
/** the color of each key and of the door it opens */
const PAIR_COLOR = { a: '#d9a441', b: '#3d8a8a', c: '#c9627a' };

// the ornament, in tiles and seconds: its size, how hard a full tilt pulls it, how
// the page and the ice slow it, and how much of a knock a wall gives back
const BALL_RADIUS = 0.3;
const PULL = 30;
const DRAG = 2.4, ICE_DRAG = 0.35;
const TOP_SPEED = 9;
const BOUNCE = 0.28;
const STEP_SECONDS = 1 / 120;

// a tilt of this many degrees from level is a full tilt; less than the dead zone is none
const FULL_TILT = Math.sin(18 * Math.PI / 180);
const DEAD_ZONE = 0.06;
// how far a finger drags for a full tilt
const FINGER_REACH = 70;

// the ornament's light, in tiles: bright to the first, gone by the second
const LIGHT_NEAR = 1.8, LIGHT_FAR = 4.5;
const TILE_MIN = 30, TILE_MAX = 58;
const MAX_PIXEL_RATIO = 2;
// a fall or a rise, in seconds: the ornament is drawn to the middle of the hole or
// the lift, leaves this floor as its light closes, and arrives on the other as it opens
const DRAW_IN_SECONDS = 0.2, LEAVE_SECONDS = 0.46, ARRIVE_SECONDS = 0.5;
const TRANSIT_SECONDS = DRAW_IN_SECONDS + LEAVE_SECONDS + ARRIVE_SECONDS;
const FALL_DEPTH = 2.6/*how far beneath the page a hole takes the ornament from sight, in tiles*/;
const LIFT_HEIGHT = 2/*how far above the page a lift carries it from sight, in tiles*/;
// how long the star is celebrated before the next level is offered
const CELEBRATE_SECONDS = 1.3;

const PAGE = '#14161b';
const LEVELS_SELECTOR = "[name='levels.txt']";

// == Elements ====================================================================
const scene = document.getElementById('scene'), c = scene.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);
const tag = $('tag'), tagName = $('tag-name'), tagKeys = $('tag-keys'), gear = $('gear');
const note = $('note'), noteText = $('note-text'), noteGo = $('note-go');
const title = $('title'), titleHow = $('title-how'), begin = $('begin');
const card = $('card'), cardTitle = $('card-title'), cardText = $('card-text'), cardGo = $('card-go');
const scrim = $('scrim'), sheet = $('sheet'), levelButtons = $('levels');
const leveling = $('leveling'), levelingText = $('leveling-text'), setLevelButton = $('set-level'), bead = $('bead'), relevel = $('relevel');

// == Utility =====================================================================
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/** a repeatable random source: the same pencil marks at every launch */
const randomFrom = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const canvasOf = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
};

// == Levels ======================================================================
// the levels are text in the document (the `levels.txt` app-content): a `level` line
// names one, a `hint` line says a word about it, a `floor` line starts each of its
// floors from the top one down, and each `|…|` line is a row of tiles. A hole drops
// the ornament to the same place on the floor below; a lift raises it to the floor above
/** reads the levels a text holds: those with a start and a star, each floor a rectangle */
const parseLevels = (text) => {
  const levels = [];
  let level = null, floor = null;
  for(const raw of text.split('\n')) {
    const line = raw.trim();
    if(line.startsWith('level ')) { level = { name: line.slice(6).trim(), hint: '', floors: [] }; levels.push(level); floor = null; continue; }
    if(!level) continue/*before the first level*/;
    if(line.startsWith('hint ')) { level.hint = line.slice(5).trim(); continue; }
    if(line === 'floor') { floor = []; level.floors.push(floor); continue; }
    if(line.startsWith('|') && line.endsWith('|') && (line.length > 2)) {
      if(!floor) { floor = []; level.floors.push(floor); }
      floor.push(line.slice(1, -1));
    } /* else -- a blank line or a note: not a row */
  }
  return levels
    .map(({ name, hint, floors }) => {
      const rows = Math.max(0, ...floors.map(grid => grid.length)), cols = Math.max(0, ...floors.flat().map(row => row.length));
      // every floor the same size: a short row or floor is walled out
      const grids = floors.map(grid => Array.from({ length: rows }, (_, y) => (grid[y] || '').padEnd(cols, WALL).split('')));
      let start = null, hasGoal = false;
      grids.forEach((grid, f) => grid.forEach((row, y) => row.forEach((cell, x) => {
        if(cell === START) { start = { f, x, y }; row[x] = FLOOR; }
        if(cell === GOAL) hasGoal = true;
      })));
      return { name, hint, rows, cols, grids, start, hasGoal };
    })
    .filter(({ start, hasGoal, rows, cols }) => start && hasGoal && (rows > 0) && (cols > 0));
};

// == Game ========================================================================
let levels = [];
let reached = 0/*the furthest level opened*/, levelIndex = 0;
let level = null/*none loaded*/;
// the level as it is played: its tiles (keys taken and doors opened change them), what
// has been seen of each floor, and how brightly each tile is lit now
let grids = [], seen = [], light = [];
let floorIndex = 0;
const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
let held = [];
// the tile the ornament arrived on by a hole or a lift: it does nothing until left
let arrival = null/*none*/;
// a fall or a rise under way: the floors it joins and how far along it is
let transit = null/*none*/;
let playing = false, won = false;
// how long the found star has been celebrated: the ornament is drawn into it meanwhile
let celebrated = 0;

const cellAt = (f, x, y) => ((y < 0) || (x < 0) || (y >= level.rows) || (x >= level.cols)) ? WALL : grids[f][y][x];
const isSolid = (cell) => (cell === WALL) || isDoor(cell);

const loadLevel = (index) => {
  levelIndex = clamp(index, 0, levels.length - 1);
  level = levels[levelIndex];
  grids = level.grids.map(grid => grid.map(row => [...row]));
  seen = grids.map(grid => grid.map(row => row.map(() => 0)));
  light = grids.map(grid => grid.map(row => row.map(() => 0)));
  floorIndex = level.start.f;
  Object.assign(ball, { x: level.start.x + 0.5, y: level.start.y + 0.5, vx: 0, vy: 0, spin: 0 });
  held = []; arrival = null; transit = null; won = false; celebrated = 0;
  buildScene();
  showTag();
};

// == Scene =======================================================================
// the page is the window at night. Every wall's edge is a line, faint where it is only
// remembered. The ornament carries the one light: a pool of warm paper, cut to shape
// by the walls, and within it the walls stand up off the page as a paper model
let tile = 40/*a tile's side, in canvas pixels*/, ratio = 1;
// each floor's wall edges: a line one tile long wherever a wall meets what is not
// wall, the way it faces, and how much of it has drawn itself in
let edges = [], edgesOfTile = [];
let grain = null/*the page's tooth*/;

const NIGHT = [20, 22, 27];
// a wall in the light: its top a toned paper, hatched as a draughtsman fills what is
// solid, so the bright page beside it reads as the way through
const WALL_TOP = [205, 193, 172], SIDE_LIT = [232, 222, 201], SIDE_SHADE = [142, 131, 116];
const INK = '34,30,27', CHALK = '236,226,206', GOLD = '201,164,90';

const buildGrain = () => {
  const size = 192, canvas = canvasOf(size, size), g = canvas.getContext('2d'), random = randomFrom(11);
  for(let i=0; i<700; i++) {
    g.fillStyle = (random() < 0.5) ? 'rgba(255,248,230,.035)' : 'rgba(0,0,0,.10)';
    g.fillRect(random() * size, random() * size, 1, 1);
  }
  grain = c.createPattern(canvas, 'repeat');
};

const buildScene = () => {
  if(!level) return/*no level yet*/;
  ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = scene.clientWidth, height = scene.clientHeight;
  scene.width = Math.round(width * ratio); scene.height = Math.round(height * ratio);
  // as large as shows the whole level, within a size a thumb can read
  tile = Math.round(clamp(Math.min(width / (level.cols + 1.3), (height - 90) / (level.rows + 1.3)), TILE_MIN, TILE_MAX) * ratio);
  if(!grain) buildGrain();

  edgesOfTile = [];
  edges = level.grids.map((grid, f) => {
    const isWall = (x, y) => (y >= 0) && (x >= 0) && (y < level.rows) && (x < level.cols) && (grid[y][x] === WALL);
    const all = [], ofTile = new Map();
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if(cell !== WALL) return;
      const own = [];
      const edge = (x1, y1, x2, y2, nx, ny) => own.push({ x1, y1, x2, y2, nx, ny, x, y, drawn: 0 });
      if(!isWall(x, y - 1)) edge(x, y, x + 1, y, 0, -1);
      if(!isWall(x, y + 1)) edge(x, y + 1, x + 1, y + 1, 0, 1);
      if(!isWall(x - 1, y)) edge(x, y, x, y + 1, -1, 0);
      if(!isWall(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1, 0);
      ofTile.set(`${x},${y}`, own);
      all.push(...own);
    }));
    edgesOfTile[f] = ofTile;
    return all;
  });
};

/** the shape the ornament's light takes, in tiles: all it reaches in a straight line,
 *  out to the light's far edge. A wall's edge stops it, and so does a shut door */
const lightShape = (reach) => {
  const bx = ball.x, by = ball.y;
  const blockers = edges[floorIndex].filter(edge => (Math.abs(((edge.x1 + edge.x2) / 2) - bx) < (reach + 1)) && (Math.abs(((edge.y1 + edge.y2) / 2) - by) < (reach + 1)));
  for(let y=Math.floor(by - reach); y<=Math.ceil(by + reach); y++) {
    for(let x=Math.floor(bx - reach); x<=Math.ceil(bx + reach); x++) {
      if(!isDoor(cellAt(floorIndex, x, y))) continue;
      blockers.push({ x1: x, y1: y, x2: x + 1, y2: y }, { x1: x, y1: y + 1, x2: x + 1, y2: y + 1 }, { x1: x, y1: y, x2: x, y2: y + 1 }, { x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    }
  }

  // a ray to each end of each edge, and just past either side of it, with enough
  // between to keep the open side round
  const angles = [];
  for(let i=0; i<48; i++) angles.push(((i / 48) * Math.PI * 2) - Math.PI);
  for(const edge of blockers) {
    for(const [x, y] of [[edge.x1, edge.y1], [edge.x2, edge.y2]]) { const angle = Math.atan2(y - by, x - bx); angles.push(angle - 0.0007, angle, angle + 0.0007); }
  }
  angles.sort((a, b) => a - b);

  return angles.map(angle => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let nearest = reach;
    for(const edge of blockers) {
      if(edge.y1 === edge.y2) {
        if(dy === 0) continue/*runs alongside it*/;
        const along = (edge.y1 - by) / dy;
        if((along <= 1e-6) || (along >= nearest)) continue;
        const x = bx + (dx * along);
        if((x >= (edge.x1 - 1e-6)) && (x <= (edge.x2 + 1e-6))) nearest = along;
      } else {
        if(dx === 0) continue/*runs alongside it*/;
        const along = (edge.x1 - bx) / dx;
        if((along <= 1e-6) || (along >= nearest)) continue;
        const y = by + (dy * along);
        if((y >= (edge.y1 - 1e-6)) && (y <= (edge.y2 + 1e-6))) nearest = along;
      }
    }
    return [bx + (dx * nearest), by + (dy * nearest)];
  });
};

// == Tilt ========================================================================
// which way and how hard the ornament is pulled, -1 to 1 across and down the screen:
// from the phone's motion, or from a finger or the arrow keys
const sensorTilt = { x: 0, y: 0 }, fingerTilt = { x: 0, y: 0 }, keyTilt = { x: 0, y: 0 };
let steerByFinger = false/*the person's own choice*/;
/** whether a finger steers: chosen, or the device has no motion to follow */
const isFingerSteering = () => steerByFinger || (motion === 'unavailable');
const tiltNow = () => {
  const from = isFingerSteering() ? fingerTilt : sensorTilt;
  return { x: clamp(from.x + keyTilt.x, -1, 1), y: clamp(from.y + keyTilt.y, -1, 1) };
};

// the way down in the phone's own frame, from its orientation, measured from the
// pose the phone was held in when the tilt was last set level
let levelPose = null/*taken from the next reading*/, heldPose = null/*no reading yet*/;
// how far from level the phone is held, before the dead zone: what the leveling bead shows
const leanNow = { x: 0, y: 0 };
/** makes however the phone is held now level */
const setLevel = () => { levelPose = heldPose; sensorTilt.x = 0; sensorTilt.y = 0; leanNow.x = 0; leanNow.y = 0; };
const receiveReading = (reading) => {
  const beta = reading.beta * Math.PI / 180, gamma = reading.gamma * Math.PI / 180,
        down = { x: Math.cos(beta) * Math.sin(gamma), y: -Math.sin(beta) };
  heldPose = down;
  if(!levelPose) levelPose = down;

  // the phone's frame, turned to the screen's when it is held sideways
  const angle = ((screen.orientation && screen.orientation.angle) || 0) * Math.PI / 180,
        x = down.x - levelPose.x, y = down.y - levelPose.y,
        across = (x * Math.cos(angle)) - (y * Math.sin(angle)),
        along = (x * Math.sin(angle)) + (y * Math.cos(angle));
  const shaped = (value) => (Math.abs(value) < DEAD_ZONE) ? 0 : clamp((value - (Math.sign(value) * DEAD_ZONE)) / (FULL_TILT - DEAD_ZONE), -1, 1);
  // the ornament rolls toward the side that drops; up the phone is up the page
  sensorTilt.x = shaped(across);
  sensorTilt.y = shaped(-along);
  leanNow.x = clamp(across / FULL_TILT, -1, 1); leanNow.y = clamp(-along / FULL_TILT, -1, 1);
  if(motion !== 'on') setMotion('on');
};

// == Motion ======================================================================
// the phone's motion comes from the page (`charmiq.page.motion$`, `page.motion`). An
// iPhone lets the page ask only within a tap, and forgets its answer whenever the app
// is closed: Tap to begin is that tap. A refusal's `code` says who refused
//   idle         not asked for yet
//   waiting      following, with no reading yet
//   ask          the page needs a tap before it can ask
//   on           readings arrive
//   refused      CharmIQ: this Application's motion was not allowed
//   device       the phone: its own question was turned down
//   unasked      this page cannot ask the phone (a published page)
//   signedOut    no one is signed in
//   unavailable  no motion reported: a finger steers
let motion = 'idle';
const MOTION_NOTE = {
  ask: 'Tilting is off.',
  refused: 'CharmIQ hasn’t been allowed to give this game your phone’s tilt. Open CharmIQ in a browser and allow it in Settings → Permissions. Until then, drag a finger.',
  device: 'Your phone didn’t allow tilting. Close the game, open it again, and choose Allow. Until then, drag a finger.',
  unasked: 'This page can’t ask your phone for its tilt. Open the game in CharmIQ or from your Home Screen. Here, drag a finger.',
  signedOut: 'Sign in to CharmIQ to roll by tilting. Until then, drag a finger.',
};
const MOTION_OF_CODE = {
  'functions/failed-precondition': 'ask',
  'functions/permission-denied': 'refused',
  'functions/cancelled': 'device',
  'functions/unimplemented': 'unasked',
  'functions/unauthenticated': 'signedOut',
};
/** the motion states in which nothing tilts and a finger must steer */
const isTiltRefused = () => (motion === 'refused') || (motion === 'device') || (motion === 'unasked') || (motion === 'signedOut');

const showMotion = () => {
  const message = playing ? MOTION_NOTE[motion] : undefined/*the title says how to play*/;
  note.hidden = !message;
  noteText.textContent = message || '';
  noteGo.hidden = (motion !== 'ask');
  noteGo.textContent = 'Turn on tilt';
  titleHow.textContent = isFingerSteering() ? 'Drag to roll, or use the arrow keys. Find the star.' : 'Tilt to roll. Find the star.';
  // a game steered by tilting is never touched: the screen stays awake while it is played
  const page = window.charmiq.page;
  if(page && (typeof page.setScreenAwake === 'function')) page.setScreenAwake(playing && !won);
};
const setMotion = (next) => {
  motion = next;
  if(motion !== 'on') { sensorTilt.x = 0; sensorTilt.y = 0; }
  showMotion();
  showTag();
  settleLeveling();
};

let following = null/*not following*/;
const unfollow = () => {
  if(!following) return;
  following.unsubscribe(); following = null;
};
/** follows the phone's motion: within a tap wherever the page must ask */
const follow = () => {
  unfollow();
  const page = window.charmiq.page;
  if(!page || (typeof page.motion$ !== 'function')) { setMotion('unavailable'); return/*a Platform that gives no motion*/; }

  setMotion('waiting');
  following = page.motion$().subscribe({
    next: receiveReading,
    error: (error) => {
      following = null;
      console.warn('Could not follow the phone’s motion', error);
      setMotion(MOTION_OF_CODE[error && error.code] || 'unavailable');
    },
  });
};
noteGo.addEventListener('click', follow);

// -- Finger and Keys -------------------------------------------------------------
// a finger pulls the ornament the way it has moved since it touched; the arrow keys
// pull it fully their way
let fingerDown = null/*no finger down*/;
scene.addEventListener('pointerdown', (event) => {
  if(motion === 'ask') follow()/*the tap an iPhone asks within*/;
  fingerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
  scene.setPointerCapture(event.pointerId);
});
scene.addEventListener('pointermove', (event) => {
  if(!fingerDown || (fingerDown.id !== event.pointerId)) return/*not the finger that touched*/;
  fingerTilt.x = clamp((event.clientX - fingerDown.x) / FINGER_REACH, -1, 1);
  fingerTilt.y = clamp((event.clientY - fingerDown.y) / FINGER_REACH, -1, 1);
});
const liftFinger = (event) => {
  if(!fingerDown || (fingerDown.id !== event.pointerId)) return/*not the finger that touched*/;
  fingerDown = null; fingerTilt.x = 0; fingerTilt.y = 0;
};
scene.addEventListener('pointerup', liftFinger);
scene.addEventListener('pointercancel', liftFinger);

const KEY_PULL = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
const keysDown = new Set();
const pullOfKeys = () => {
  keyTilt.x = 0; keyTilt.y = 0;
  keysDown.forEach(key => { keyTilt.x += KEY_PULL[key][0]; keyTilt.y += KEY_PULL[key][1]; });
};
document.addEventListener('keydown', (event) => { if(KEY_PULL[event.key]) { keysDown.add(event.key); pullOfKeys(); event.preventDefault(); } });
document.addEventListener('keyup', (event) => { if(keysDown.delete(event.key)) pullOfKeys(); });

// == Play ========================================================================
/** moves the ornament through `seconds` of its pull, the page's drag and the walls */
const step = (seconds) => {
  const pull = tiltNow();
  const drag = (cellAt(floorIndex, Math.floor(ball.x), Math.floor(ball.y)) === ICE) ? ICE_DRAG : DRAG;
  ball.vx = (ball.vx + (pull.x * PULL * seconds)) * Math.exp(-drag * seconds);
  ball.vy = (ball.vy + (pull.y * PULL * seconds)) * Math.exp(-drag * seconds);
  const speed = Math.hypot(ball.vx, ball.vy);
  if(speed > TOP_SPEED) { ball.vx *= TOP_SPEED / speed; ball.vy *= TOP_SPEED / speed; }
  ball.x += ball.vx * seconds; ball.y += ball.vy * seconds;
  ball.spin += speed * seconds;

  // each wall and shut door near it pushes it back out, and takes some of its speed
  const tx = Math.floor(ball.x), ty = Math.floor(ball.y);
  for(let y=ty-1; y<=ty+1; y++) {
    for(let x=tx-1; x<=tx+1; x++) {
      const cell = cellAt(floorIndex, x, y);
      if(!isSolid(cell)) continue;
      const nearX = clamp(ball.x, x, x + 1), nearY = clamp(ball.y, y, y + 1);
      let dx = ball.x - nearX, dy = ball.y - nearY, distance = Math.hypot(dx, dy);
      if(distance >= BALL_RADIUS) continue;
      // a door opens to the key that fits it
      if(isDoor(cell) && held.includes(cell.toLowerCase())) { grids[floorIndex][y][x] = FLOOR; held = held.filter(key => key !== cell.toLowerCase()); showTag(); continue; }
      if(distance < 1e-6) { dx = ball.x - (x + 0.5); dy = ball.y - (y + 0.5); distance = Math.hypot(dx, dy) || 1; }
      const nx = dx / distance, ny = dy / distance;
      ball.x = nearX + (nx * BALL_RADIUS); ball.y = nearY + (ny * BALL_RADIUS);
      const into = (ball.vx * nx) + (ball.vy * ny);
      if(into < 0) { ball.vx -= (1 + BOUNCE) * into * nx; ball.vy -= (1 + BOUNCE) * into * ny; }
    }
  }

  // what the ornament rolls onto
  const x = Math.floor(ball.x), y = Math.floor(ball.y), cell = cellAt(floorIndex, x, y);
  if(arrival && ((arrival.x !== x) || (arrival.y !== y))) arrival = null/*it has left where it arrived*/;
  const centered = Math.hypot(ball.x - (x + 0.5), ball.y - (y + 0.5)) < 0.34;
  if(isKey(cell)) { grids[floorIndex][y][x] = FLOOR; held.push(cell); showTag(); }
  else if((cell === GOAL) && centered) win();
  else if((cell === HOLE) && centered && !arrival && (floorIndex + 1 < grids.length)) transit = { falls: true, to: floorIndex + 1, x, y, at: 0, fromX: ball.x, fromY: ball.y, swapped: false };
  else if((cell === LIFT) && centered && !arrival && (floorIndex > 0)) transit = { falls: false, to: floorIndex - 1, x, y, at: 0, fromX: ball.x, fromY: ball.y, swapped: false };
};

/** lights what the ornament can see from where it is, and remembers it */
const look = () => {
  const lit = light[floorIndex], known = seen[floorIndex];
  for(let y=0; y<level.rows; y++) {
    for(let x=0; x<level.cols; x++) {
      const dx = (x + 0.5) - ball.x, dy = (y + 0.5) - ball.y, distance = Math.hypot(dx, dy);
      let target = 0;
      if(distance < LIGHT_FAR) {
        // the light stops at a wall: it shows the wall and nothing behind it
        let blocked = false;
        const steps = Math.ceil(distance * 4);
        for(let i=1; i<steps && !blocked; i++) {
          const sx = Math.floor(ball.x + (dx * i / steps)), sy = Math.floor(ball.y + (dy * i / steps));
          if(((sx !== x) || (sy !== y)) && isSolid(cellAt(floorIndex, sx, sy))) blocked = true;
        }
        if(!blocked) target = 1/*seen: how bright is the light's own fall-off*/;
      } /* else -- beyond the light */
      lit[y][x] += (target - lit[y][x]) * ((target > lit[y][x]) ? 0.22 : 0.07);
      // what is seen comes into memory gently, never as a tile popping in
      if(target > known[y][x]) known[y][x] += (target - known[y][x]) * 0.08;
    }
  }
};

// == Draw ========================================================================
// how the page is looked into, as a box behind the glass: from an eye above it that
// moves with the tilt, so what stands up leans away from beneath the eye and what
// lies deep draws in toward it
const EYE_HEIGHT = 5.5/*above the page, in tiles*/;
const EYE_REACH = 2.2/*how far a full tilt carries the eye, in tiles*/;
const EYE_REST = 0.9/*how far toward the reader it rests, in tiles*/;
const eye = { x: 0, y: EYE_REST }/*from the middle of what shows, in tiles*/;
const WALL_HEIGHT = 0.6, HOLE_DEPTH = 0.9/*how deep a hole shows the floor beneath*/;

const draw = (seconds) => {
  const width = scene.width, height = scene.height;
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = `rgb(${NIGHT.join(',')})`; c.fillRect(0, 0, width, height);
  if(grain) { c.fillStyle = grain; c.fillRect(0, 0, width, height); }
  if(!level || !playing) return/*the page waits, dark, behind the title*/;

  const pull = tiltNow();
  eye.x += ((pull.x * EYE_REACH) - eye.x) * 0.12;
  eye.y += ((EYE_REST + (pull.y * EYE_REACH)) - eye.y) * 0.12;

  // the whole level where it fits, else the part around the ornament
  const top = 70 * ratio, mazeWidth = level.cols * tile, mazeHeight = level.rows * tile;
  const originX = (mazeWidth <= width) ? (width - mazeWidth) / 2 : clamp((width / 2) - (ball.x * tile), width - mazeWidth - (tile / 2), tile / 2);
  const originY = (mazeHeight <= (height - top)) ? top + ((height - top - mazeHeight) / 2) : clamp((height / 2) - (ball.y * tile), height - mazeHeight - (tile / 2), top);
  // the place on the floor beneath the eye
  const eyeX = (((width / 2) - originX) / tile) + eye.x, eyeY = ((((top + height) / 2) - originY) / tile) + eye.y;
  /** how much larger what is `z` above the floor shows than what lies on it */
  const nearer = (z) => EYE_HEIGHT / (EYE_HEIGHT - z);
  /** where a place on the floor, or `z` above it, falls on the screen */
  const at = (x, y, z = 0) => { const by = nearer(z); return [originX + ((eyeX + ((x - eyeX) * by)) * tile), originY + ((eyeY + ((y - eyeY) * by)) * tile)]; };

  const known = seen[floorIndex], lit = light[floorIndex], grid = grids[floorIndex], walls = level.grids[floorIndex];
  const hair = Math.max(1, ratio);

  // .. how the ornament and its light stand ........................................
  // rolling, the ornament rests on the floor in its whole light. A hole takes it
  // down: it settles into the mouth, then drops away beneath the page. A lift takes
  // it up: the brass disc rises with it toward the eye, out of its shaft. The light
  // stays on what leaves and closes once it is nearly gone; on the other floor the
  // light opens, and it lands from above or is carried up out of the floor
  let scale = 1, alpha = 1, iris = 1, aloft = BALL_RADIUS, inHole = false, sunk = 0/*how far into the hole's dark*/, ring = null/*no ripple on the floor*/, disc = null/*no lift carries it*/;
  const overshoot = (part) => 1 + (2.70158 * ((part - 1) ** 3)) + (1.70158 * ((part - 1) ** 2));
  const smooth = (part) => part * part * (3 - (2 * part));
  if(transit) {
    const drawn = clamp(transit.at / DRAW_IN_SECONDS, 0, 1),
          leaving = clamp((transit.at - DRAW_IN_SECONDS) / LEAVE_SECONDS, 0, 1),
          arriving = clamp((transit.at - DRAW_IN_SECONDS - LEAVE_SECONDS) / ARRIVE_SECONDS, 0, 1);
    if(!transit.swapped) {
      iris = 1 - (0.9 * (clamp((leaving - 0.45) / 0.55, 0, 1) ** 2));
      if(transit.falls) {
        // faster as it goes; smaller and darker with the depth, and seen only through
        // the mouth of the hole
        const depth = FALL_DEPTH * leaving * leaving;
        aloft = BALL_RADIUS * (1 - smooth(drawn))/*onto the middle of the mouth, and straight down from there*/;
        scale = 1 / (1 + (depth * 0.8));
        sunk = clamp(leaving * 1.2, 0, 0.92); alpha = 1 - clamp((leaving - 0.8) / 0.2, 0, 1);
        inHole = (leaving > 0);
      } else {
        const height = LIFT_HEIGHT * smooth(leaving), fade = 1 - (clamp((leaving - 0.72) / 0.28, 0, 1) ** 2);
        disc = { z: height, scale: 1 + (height * 0.45), alpha: fade, shaft: 1, under: false };
        aloft = height + (BALL_RADIUS * (1 - smooth(drawn)))/*onto the middle of the disc, and up with it*/; scale = disc.scale; alpha = fade;
      }
    } else {
      const settled = overshoot(arriving);
      iris = 0.1 + (0.9 * (1 - ((1 - arriving) ** 3)));
      alpha = Math.min(1, arriving * 4);
      if(transit.falls) { scale = 1.8 - (0.8 * settled); aloft = BALL_RADIUS + (1.5 * Math.max(0, 1 - settled)); ring = { part: arriving, gold: false }; }
      else {
        // the disc brings it straight up the middle of the shaft, level with the floor,
        // and is gone
        const below = LIFT_HEIGHT * 0.7 * ((1 - Math.min(1, arriving / 0.65)) ** 2), fade = 1 - smooth(clamp((arriving - 0.7) / 0.3, 0, 1));
        disc = { z: 0, scale: 1 / (1 + (below * 0.8)), alpha: fade, shaft: fade, under: (below > 0.02) };
        aloft = BALL_RADIUS * smooth(clamp((arriving - 0.6) / 0.4, 0, 1)); scale = disc.scale; inHole = disc.under;
      }
    }
  } else if(won) iris = 1 + (0.4 * Math.min(1, celebrated / (CELEBRATE_SECONDS * 0.5)));
  // the light's reach as it stands, in tiles
  const reach = Math.max(0.05, LIGHT_FAR * iris), near = LIGHT_NEAR * Math.min(1, iris);
  /** how brightly the ornament lights a tile: seen from it, and near enough */
  const brightAt = (x, y) => lit[y][x] * clamp(1 - ((Math.hypot((x + 0.5) - ball.x, (y + 0.5) - ball.y) - near) / (reach - near)), 0, 1);
  const ellipse = (cx, cy, rx, ry) => { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
  /** a lift's brass disc, with the mark that it goes up */
  const liftDisc = (cx, cy, radius, shown) => {
    c.lineWidth = hair * 1.2; c.strokeStyle = `rgba(${INK},${shown})`;
    ellipse(cx, cy, radius, radius); c.fillStyle = `rgba(${GOLD},${0.85 * shown})`; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx - (radius * 0.38), cy + (radius * 0.19)); c.lineTo(cx, cy - (radius * 0.28)); c.lineTo(cx + (radius * 0.38), cy + (radius * 0.19)); c.stroke();
  };

  // .. what is remembered ..........................................................
  // each wall's edge, in a faint line that draws itself in as it is first seen
  c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = hair * 1.25; c.strokeStyle = `rgba(${CHALK},.4)`;
  c.beginPath();
  for(const edge of edges[floorIndex]) {
    if(known[edge.y][edge.x] <= 0.01) continue/*never seen*/;
    if(edge.drawn < 1) edge.drawn = Math.min(1, edge.drawn + (seconds / 0.45));
    const [x1, y1] = at(edge.x1, edge.y1), [x2, y2] = at(edge.x2, edge.y2);
    c.moveTo(x1, y1); c.lineTo(x1 + ((x2 - x1) * edge.drawn), y1 + ((y2 - y1) * edge.drawn));
  }
  c.stroke();
  for(let y=0; y<level.rows; y++) {
    for(let x=0; x<level.cols; x++) {
      if((walls[y][x] !== WALL) || (known[y][x] <= 0.01)) continue/*not a wall seen*/;
      const [px, py] = at(x, y);
      c.fillStyle = `rgba(${CHALK},${0.055 * known[y][x]})`;
      c.fillRect(px, py, tile, tile);
    }
  }
  // and what stood on the floor there, as marks
  for(let y=0; y<level.rows; y++) {
    for(let x=0; x<level.cols; x++) {
      if(known[y][x] <= 0.01) continue/*never seen*/;
      const cell = grid[y][x], [cx, cy] = at(x + 0.5, y + 0.5);
      c.strokeStyle = `rgba(${CHALK},.3)`;
      if(cell === HOLE) { ellipse(cx, cy, tile * 0.3, tile * 0.3 * 0.86); c.stroke(); }
      else if(cell === LIFT) { ellipse(cx, cy, tile * 0.3, tile * 0.3); c.stroke(); c.beginPath(); c.moveTo(cx - (tile * 0.1), cy + (tile * 0.05)); c.lineTo(cx, cy - (tile * 0.07)); c.lineTo(cx + (tile * 0.1), cy + (tile * 0.05)); c.stroke(); }
      else if(isKey(cell)) { c.fillStyle = PAIR_COLOR[cell]; c.globalAlpha = 0.75; ellipse(cx, cy, tile * 0.11, tile * 0.11); c.fill(); c.globalAlpha = 1; }
      else if(isDoor(cell)) {
        // a door remembered: its key's color, plain enough to find again
        c.fillStyle = PAIR_COLOR[cell.toLowerCase()]; c.globalAlpha = 0.34; c.fillRect(cx - (tile * 0.44), cy - (tile * 0.44), tile * 0.88, tile * 0.88);
        c.strokeStyle = PAIR_COLOR[cell.toLowerCase()]; c.globalAlpha = 0.9; c.lineWidth = hair * 1.5; c.strokeRect(cx - (tile * 0.44), cy - (tile * 0.44), tile * 0.88, tile * 0.88);
        c.globalAlpha = 1; c.lineWidth = hair * 1.25;
      }
    }
  }

  // .. the light ...................................................................
  const [bx, by] = at(ball.x, ball.y);
  const shape = lightShape(reach);
  const traceLight = () => {
    c.beginPath();
    shape.forEach(([x, y], index) => { const [px, py] = at(x, y); if(index) c.lineTo(px, py); else c.moveTo(px, py); });
    c.closePath();
  };
  const pool = c.createRadialGradient(bx, by, 0, bx, by, reach * tile);
  pool.addColorStop(0, 'rgba(251,243,224,.98)'); pool.addColorStop(0.42, 'rgba(248,236,208,.93)');
  pool.addColorStop(0.76, 'rgba(238,212,162,.42)'); pool.addColorStop(1, 'rgba(232,198,140,0)');
  traceLight(); c.fillStyle = pool; c.fill();

  // what lies on the floor within it, in ink and a little color
  c.save();
  traceLight(); c.clip();
  for(let y=0; y<level.rows; y++) {
    for(let x=0; x<level.cols; x++) {
      const bright = (walls[y][x] === WALL) ? 0 : brightAt(x, y);
      if(bright <= 0.02) continue/*the light does not reach it*/;
      const cell = grid[y][x], [px, py] = at(x, y), [cx, cy] = at(x + 0.5, y + 0.5);
      c.lineWidth = hair * 1.2; c.strokeStyle = `rgba(${INK},${bright})`;
      if(cell === ICE) {
        c.fillStyle = `rgba(120,165,188,${0.3 * bright})`; c.fillRect(px, py, tile + 0.5, tile + 0.5);
        c.strokeStyle = `rgba(255,255,255,${0.8 * bright})`; c.beginPath();
        c.moveTo(px + (tile * 0.2), py + (tile * 0.34)); c.lineTo(px + (tile * 0.52), py + (tile * 0.26));
        c.moveTo(px + (tile * 0.46), py + (tile * 0.72)); c.lineTo(px + (tile * 0.8), py + (tile * 0.63)); c.stroke();
      } else if(cell === HOLE) {
        // cut through the page: the dark of the floor below, deeper on the side it is seen from
        ellipse(cx, cy, tile * 0.34, tile * 0.3); c.fillStyle = `rgba(14,15,19,${bright})`; c.fill(); c.stroke();
        c.save(); ellipse(cx, cy, tile * 0.34, tile * 0.3); c.clip();
        const [dx, dy] = at(x + 0.5, y + 0.5, -HOLE_DEPTH), smaller = nearer(-HOLE_DEPTH);
        ellipse(dx, dy, tile * 0.34 * smaller, tile * 0.3 * smaller); c.fillStyle = `rgba(52,56,66,${bright})`; c.fill();
        c.restore();
      } else if(cell === LIFT) {
        // the disc rests here unless it is away, carrying the ornament
        if(!disc || (transit.x !== x) || (transit.y !== y)) liftDisc(cx, cy, tile * 0.32, bright);
      } else if(isKey(cell)) {
        const key = () => {
          ellipse(cx - (tile * 0.14), cy, tile * 0.13, tile * 0.13); c.stroke();
          c.beginPath(); c.moveTo(cx - (tile * 0.01), cy); c.lineTo(cx + (tile * 0.3), cy); c.moveTo(cx + (tile * 0.2), cy); c.lineTo(cx + (tile * 0.2), cy + (tile * 0.13)); c.stroke();
        };
        c.globalAlpha = bright;
        c.strokeStyle = `rgb(${INK})`; c.lineWidth = Math.max(4, tile * 0.15); key();
        c.strokeStyle = PAIR_COLOR[cell]; c.lineWidth = Math.max(2, tile * 0.085); key();
        c.globalAlpha = 1;
      } /* else -- open floor: the paper itself (a door stands with the walls) */
    }
  }
  c.restore();
  if(ring) {
    const [rx, ry] = at(transit.x + 0.5, transit.y + 0.5);
    c.strokeStyle = `rgba(${ring.gold ? GOLD : CHALK},${0.8 * (1 - ring.part)})`; c.lineWidth = hair * 2;
    ellipse(rx, ry, tile * (0.3 + (1.1 * ring.part)), tile * (0.3 + (1.1 * ring.part)) * 0.9); c.stroke();
  } /* else -- nothing leaves or lands */

  // .. the ornament ................................................................
  const drawOrnament = () => {
    const radius = BALL_RADIUS * tile * scale, [ox, oy] = at(ball.x, ball.y, aloft);
    // the middle of the hole or the lift it passes through
    const [hx, hy] = transit ? at(transit.x + 0.5, transit.y + 0.5) : [0, 0];
    if(disc) {
      // the shaft the disc rides in, and the disc: beneath the floor it shows only
      // through the shaft's mouth
      c.lineWidth = hair * 1.2; c.strokeStyle = `rgba(${INK},${disc.shaft})`;
      ellipse(hx, hy, tile * 0.34, tile * 0.34); c.fillStyle = `rgba(14,15,19,${disc.shaft})`; c.fill(); c.stroke();
      const [dx, dy] = at(transit.x + 0.5, transit.y + 0.5, disc.z);
      c.save();
      if(disc.under) { ellipse(hx, hy, tile * 0.34, tile * 0.34); c.clip(); }
      liftDisc(dx, dy, tile * 0.32 * disc.scale, disc.alpha);
      c.restore();
    } /* else -- no lift carries it */
    // beneath the floor, it shows only through the mouth it passes through
    if(inHole) { c.save(); ellipse(hx, hy, tile * (disc ? 0.34 : 0.335), tile * (disc ? 0.34 : 0.295)); c.clip(); }
    else if(!disc) {
      // its shadow on the floor: wider and fainter the higher it is
      const high = Math.max(0, aloft - BALL_RADIUS);
      c.globalAlpha = (alpha * 0.3) / (1 + (high * 2.5)); c.fillStyle = `rgb(${INK})`;
      ellipse(bx + (radius * 0.12), by + (radius * 0.2), radius * (0.95 + (high * 0.5)), radius * (0.7 + (high * 0.4))); c.fill();
    }
    c.globalAlpha = alpha;
    const glass = c.createRadialGradient(ox - (radius * 0.35), oy - (radius * 0.42), radius * 0.08, ox, oy, radius);
    glass.addColorStop(0, '#f3b5a6'); glass.addColorStop(0.34, '#b93a34'); glass.addColorStop(1, '#5f1b1b');
    ellipse(ox, oy, radius, radius); c.fillStyle = glass; c.fill();
    // a band of gold that turns as it rolls
    c.save(); ellipse(ox, oy, radius, radius); c.clip();
    c.strokeStyle = `rgba(${GOLD},.9)`; c.lineWidth = radius * 0.16;
    const turn = Math.sin(ball.spin * 2.2) * radius * 0.7;
    c.beginPath(); c.moveTo(ox - radius, oy + turn); c.quadraticCurveTo(ox, oy + turn + (radius * 0.3), ox + radius, oy + turn); c.stroke();
    c.restore();
    c.strokeStyle = `rgba(${INK},.85)`; c.lineWidth = hair; ellipse(ox, oy, radius, radius); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.8)'; ellipse(ox - (radius * 0.38), oy - (radius * 0.44), radius * 0.18, radius * 0.1); c.fill();
    // falling, the dark of the hole closes over it
    if(sunk > 0) { c.globalAlpha = alpha * sunk; c.fillStyle = '#0e0f13'; ellipse(ox, oy, radius + 1, radius + 1); c.fill(); }
    c.globalAlpha = 1;
    if(inHole) c.restore();
  };

  // .. the walls ...................................................................
  // each color fades out from the ornament as its light does, so a wall dims evenly
  // across its face and not one tile at a time
  const fading = (color) => {
    const fade = c.createRadialGradient(bx, by, 0, bx, by, reach * tile);
    fade.addColorStop(0, `rgba(${color},1)`); fade.addColorStop(0.45, `rgba(${color},.96)`);
    fade.addColorStop(0.8, `rgba(${color},.4)`); fade.addColorStop(1, `rgba(${color},0)`);
    return fade;
  };
  const inTop = fading(WALL_TOP.join(',')), inLit = fading(SIDE_LIT.join(',')), inShade = fading(SIDE_SHADE.join(',')), inInk = fading(INK);
  /** how much of a wall the light shows: as much as the most lit floor beside it */
  const shownAt = (x, y) => Math.max(lit[y][x], lit[y - 1]?.[x] ?? 0, lit[y + 1]?.[x] ?? 0, lit[y][x - 1] ?? 0, lit[y][x + 1] ?? 0);
  /** a block standing on the tile from `inset` within it, `height` tall: its showing
   *  sides, then its top */
  const block = (x, y, inset, height, sides, topFill) => {
    const x1 = x + inset, y1 = y + inset, x2 = x + 1 - inset, y2 = y + 1 - inset;
    for(const [ax, ay, bx2, by2, nx, ny] of [[x1, y1, x2, y1, 0, -1], [x1, y2, x2, y2, 0, 1], [x1, y1, x1, y2, -1, 0], [x2, y1, x2, y2, 1, 0]]) {
      if(!sides(nx, ny) || ((((eyeX - ax) * nx) + ((eyeY - ay) * ny)) <= 0)) continue/*no side there, or it faces away from the eye*/;
      const [p1x, p1y] = at(ax, ay), [p2x, p2y] = at(bx2, by2), [p3x, p3y] = at(bx2, by2, height), [p4x, p4y] = at(ax, ay, height);
      const facesLight = ((((ball.x - ((ax + bx2) / 2)) * nx) + ((ball.y - ((ay + by2) / 2)) * ny)) > 0);
      c.fillStyle = facesLight ? inLit : inShade;
      c.beginPath(); c.moveTo(p1x, p1y); c.lineTo(p2x, p2y); c.lineTo(p3x, p3y); c.lineTo(p4x, p4y); c.closePath(); c.fill();
      c.strokeStyle = inInk; c.stroke();
    }
    // set on whole pixels, so one top meets the next with neither a gap nor a seam
    const [tx, ty] = at(x1, y1, height).map(Math.round), [ux, uy] = at(x2, y2, height).map(Math.round), side = ux - tx;
    c.fillStyle = topFill;
    c.fillRect(tx, ty, side, uy - ty);
    return [tx, ty, side];
  };

  const standing = [];
  for(let y=0; y<level.rows; y++) {
    for(let x=0; x<level.cols; x++) {
      if((walls[y][x] !== WALL) && !isDoor(grid[y][x])) continue/*nothing stands here*/;
      const shown = shownAt(x, y);
      if(shown > 0.02) standing.push({ x, y, shown, far: Math.hypot((x + 0.5) - eyeX, (y + 0.5) - eyeY) });
      /* else -- only remembered: its mark on the page */
    }
  }
  standing.sort((a, b) => b.far - a.far);
  const ornamentFar = Math.hypot(ball.x - eyeX, ball.y - eyeY);
  let ornamentDrawn = false;
  // from the far side of the eye to the near, the ornament in its place among them, so
  // what stands nearer covers what stands behind it
  for(const { x, y, shown, far } of standing) {
    if(!ornamentDrawn && (far < ornamentFar)) { ornamentDrawn = true; c.globalAlpha = 1; drawOrnament(); }
    const cell = grid[y][x];
    c.globalAlpha = shown; c.lineWidth = hair * 1.3;

    if(isDoor(cell)) {
      // a door: a panel of its key's color, standing as the walls do, with its keyhole
      const [tx, ty, side] = block(x, y, 0.06, WALL_HEIGHT * 0.8, () => true, PAIR_COLOR[cell.toLowerCase()]);
      c.strokeStyle = inInk; c.lineWidth = hair * 1.6; c.strokeRect(tx, ty, side, side);
      c.fillStyle = `rgb(${INK})`;
      ellipse(tx + (side / 2), ty + (side * 0.42), side * 0.1, side * 0.1); c.fill();
      c.fillRect(tx + (side * 0.46), ty + (side * 0.44), side * 0.08, side * 0.24);
      continue;
    } /* else -- a wall */

    const own = edgesOfTile[floorIndex].get(`${x},${y}`);
    const [tx, ty, side] = block(x, y, 0, WALL_HEIGHT, (nx, ny) => own.some(edge => (edge.nx === nx) && (edge.ny === ny)), inTop);
    // its top hatched, each line running on into the next wall's, and edged where it ends
    c.strokeStyle = inInk; c.lineWidth = hair;
    c.globalAlpha = shown * 0.22;
    c.beginPath();
    for(let along=side / 6; along<(side * 2); along+=side / 3) {
      c.moveTo(tx + Math.min(along, side), ty + Math.max(0, along - side));
      c.lineTo(tx + Math.max(0, along - side), ty + Math.min(along, side));
    }
    c.stroke();
    c.globalAlpha = shown; c.lineWidth = hair * 1.3;
    c.beginPath();
    for(const edge of own) { const [x1, y1] = at(edge.x1, edge.y1, WALL_HEIGHT), [x2, y2] = at(edge.x2, edge.y2, WALL_HEIGHT); c.moveTo(x1, y1); c.lineTo(x2, y2); }
    c.stroke();
  }
  c.globalAlpha = 1;
  if(!ornamentDrawn) drawOrnament();

  // .. the star ...................................................................
  // what the whole page is for. Once seen it keeps its own light, however far the
  // ornament rolls from it: folded gold a little above the floor, slow rays, and
  // glints that come and go. Found, it flares
  for(let y=0; y<level.rows; y++) {
    for(let x=0; x<level.cols; x++) {
      if((grid[y][x] !== GOAL) || (known[y][x] <= 0.01)) continue/*no star, or not yet seen*/;
      const power = Math.max(brightAt(x, y), 0.6), flare = won ? Math.sin(Math.min(1, celebrated / CELEBRATE_SECONDS) * Math.PI) : 0;
      const time = performance.now() / 1000, pulse = 1 + (0.07 * Math.sin(time * 2.4)), size = tile * 0.44;
      const [cx, cy] = at(x + 0.5, y + 0.5, 0.4), [fx, fy] = at(x + 0.5, y + 0.5);
      c.save();
      // its shadow on the floor, and its light
      c.globalAlpha = 0.22 * power; c.fillStyle = `rgb(${INK})`; ellipse(fx, fy, size * 0.7, size * 0.5); c.fill(); c.globalAlpha = 1;
      // on the lit page its light shows as amber on the paper; in the dark, as light
      const amber = c.createRadialGradient(cx, cy, 0, cx, cy, size * 2.6);
      amber.addColorStop(0, `rgba(236,160,36,${0.6 * power})`); amber.addColorStop(0.5, `rgba(236,160,36,${0.22 * power})`); amber.addColorStop(1, 'rgba(236,160,36,0)');
      c.fillStyle = amber; c.fillRect(cx - (size * 2.6), cy - (size * 2.6), size * 5.2, size * 5.2);
      for(let ray=0; ray<8; ray++) {
        const angle = (time * 0.25) + (ray * Math.PI / 4), length = size * ((ray % 2) ? 1.5 : 2.6) * pulse * (1 + (flare * 2.4)), half = size * 0.07;
        const tipX = cx + (Math.cos(angle) * length), tipY = cy + (Math.sin(angle) * length), sideX = Math.cos(angle + (Math.PI / 2)) * half, sideY = Math.sin(angle + (Math.PI / 2)) * half;
        const stroke = c.createLinearGradient(cx, cy, tipX, tipY);
        stroke.addColorStop(0, `rgba(206,140,30,${0.9 * power})`); stroke.addColorStop(1, 'rgba(206,140,30,0)');
        c.fillStyle = stroke; c.beginPath(); c.moveTo(cx + sideX, cy + sideY); c.lineTo(tipX, tipY); c.lineTo(cx - sideX, cy - sideY); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = 'lighter';
      const spread = size * (3 + (flare * 7));
      const bloom = c.createRadialGradient(cx, cy, 0, cx, cy, spread);
      bloom.addColorStop(0, `rgba(255,214,120,${0.6 * power})`); bloom.addColorStop(0.3, `rgba(255,190,90,${0.24 * power})`); bloom.addColorStop(1, 'rgba(255,190,90,0)');
      c.fillStyle = bloom; c.fillRect(cx - spread, cy - spread, spread * 2, spread * 2);
      // its rays: long and short by turns, slowly turning
      for(let ray=0; ray<8; ray++) {
        const angle = (time * 0.25) + (ray * Math.PI / 4), length = size * ((ray % 2) ? 1.5 : 2.6) * pulse * (1 + (flare * 2.4)), half = size * 0.1;
        const tipX = cx + (Math.cos(angle) * length), tipY = cy + (Math.sin(angle) * length), sideX = Math.cos(angle + (Math.PI / 2)) * half, sideY = Math.sin(angle + (Math.PI / 2)) * half;
        const beam = c.createLinearGradient(cx, cy, tipX, tipY);
        beam.addColorStop(0, `rgba(255,228,156,${0.8 * power})`); beam.addColorStop(1, 'rgba(255,228,156,0)');
        c.fillStyle = beam; c.beginPath(); c.moveTo(cx + sideX, cy + sideY); c.lineTo(tipX, tipY); c.lineTo(cx - sideX, cy - sideY); c.closePath(); c.fill();
      }
      // found: a ring of light running out across the page
      if(flare > 0) {
        const run = Math.min(1, celebrated / CELEBRATE_SECONDS);
        c.strokeStyle = `rgba(255,228,156,${0.9 * (1 - run)})`; c.lineWidth = hair * 3;
        ellipse(cx, cy, tile * 4.5 * run, tile * 4.5 * run); c.stroke();
      } /* else -- waiting to be found */
      // the star itself: each point a light face and a dark one, as folded foil
      c.globalCompositeOperation = 'source-over';
      const points = [];
      for(let point=0; point<10; point++) {
        const out = size * ((point % 2) ? 0.42 : 1) * pulse * (1 + (flare * 0.5)), angle = (-Math.PI / 2) + (point * Math.PI / 5);
        points.push([cx + (Math.cos(angle) * out), cy + (Math.sin(angle) * out)]);
      }
      for(let point=0; point<10; point++) {
        const [x1, y1] = points[point], [x2, y2] = points[(point + 1) % 10];
        c.fillStyle = (point % 2) ? '#c18522' : '#fbe29a';
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.fill();
      }
      c.strokeStyle = `rgba(${INK},.8)`; c.lineWidth = hair * 1.3; c.lineJoin = 'round';
      c.beginPath(); points.forEach(([px, py], index) => (index ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); c.stroke();
      // glints
      c.globalCompositeOperation = 'lighter';
      for(let glint=0; glint<6; glint++) {
        const turn = (time * 0.55) + (glint * 1.047), far = size * (1.6 + (0.6 * Math.sin((time * 1.3) + glint))) * (1 + (flare * 2)), twinkle = Math.max(0, Math.sin((time * 3.1) + (glint * 2.1)));
        const gx = cx + (Math.cos(turn) * far), gy = cy + (Math.sin(turn) * far), arm = size * 0.26 * twinkle;
        c.strokeStyle = `rgba(255,238,190,${twinkle * power})`; c.lineWidth = hair * 1.2;
        c.beginPath(); c.moveTo(gx - arm, gy); c.lineTo(gx + arm, gy); c.moveTo(gx, gy - arm); c.lineTo(gx, gy + arm); c.stroke();
      }
      c.restore();
    }
  }

  // .. the glow, and the dark at the page's edge ...................................
  c.globalCompositeOperation = 'lighter';
  const glow = c.createRadialGradient(bx, by, 0, bx, by, tile * 1.5);
  glow.addColorStop(0, `rgba(255,196,110,${0.34 * alpha})`); glow.addColorStop(1, 'rgba(255,196,110,0)');
  c.fillStyle = glow; c.fillRect(bx - (tile * 1.5), by - (tile * 1.5), tile * 3, tile * 3);
  c.globalCompositeOperation = 'source-over';
  const edgeDark = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.45, width / 2, height / 2, Math.max(width, height) * 0.75);
  edgeDark.addColorStop(0, 'rgba(8,9,12,0)'); edgeDark.addColorStop(1, 'rgba(8,9,12,.5)');
  c.fillStyle = edgeDark; c.fillRect(0, 0, width, height);
};

// -- Loop ------------------------------------------------------------------------
let frame = null/*not drawing*/, drawnAt = 0, owed = 0;
const tick = (now) => {
  frame = requestAnimationFrame(tick);
  const elapsed = Math.min((now - drawnAt) / 1000, 0.1);
  drawnAt = now;
  if(playing && !won && level) {
    if(transit) {
      transit.at += elapsed;
      // first it is drawn to the middle of the hole or the lift
      const drawn = clamp(transit.at / DRAW_IN_SECONDS, 0, 1), eased = 1 - ((1 - drawn) * (1 - drawn));
      Object.assign(ball, { x: transit.fromX + (((transit.x + 0.5) - transit.fromX) * eased), y: transit.fromY + (((transit.y + 0.5) - transit.fromY) * eased), vx: 0, vy: 0 });
      // once it has left, it is on the other floor, where it arrives
      if(!transit.swapped && (transit.at >= (DRAW_IN_SECONDS + LEAVE_SECONDS))) {
        transit.swapped = true;
        floorIndex = transit.to;
        arrival = { x: transit.x, y: transit.y };
        showTag();
      }
      if(transit.at >= TRANSIT_SECONDS) transit = null;
    } else {
      owed += elapsed;
      while(owed >= STEP_SECONDS) { step(STEP_SECONDS); owed -= STEP_SECONDS; if(transit || won) { owed = 0; break; } }
    }
    look();
  } else if(playing && won && level && (celebrated < CELEBRATE_SECONDS)) {
    // the star found: the ornament is drawn into it, and then the next level is offered
    celebrated += elapsed;
    ball.x += ((goalAt.x + 0.5) - ball.x) * 0.18; ball.y += ((goalAt.y + 0.5) - ball.y) * 0.18;
    if(celebrated >= CELEBRATE_SECONDS) offerNext();
  } /* else -- nothing moves */
  if(isLeveling) bead.style.transform = `translate(${leanNow.x * 50}px, ${leanNow.y * 50}px)`;
  draw(elapsed);
};
const start = () => { if(frame === null) { drawnAt = performance.now(); frame = requestAnimationFrame(tick); } };
const stop = () => { if(frame !== null) { cancelAnimationFrame(frame); frame = null; } };
// the game is drawn, and the motion followed, only while the page shows
document.addEventListener('visibilitychange', () => {
  if(document.hidden) { stop(); unfollow(); return; }
  start();
  if(playing && (motion !== 'idle')) follow()/*again on every return: what was refused may since have been allowed*/;
});

let resizing = null;
window.addEventListener('resize', () => { cancelAnimationFrame(resizing); resizing = requestAnimationFrame(buildScene); });

// == Progress ====================================================================
// how far each person has come is kept in the app-state under their User id (`user.read`),
// with whether a finger steers. A change is written onto the latest state, one save at
// a time; nothing is written before the app-state and the person are known
const appState = window.charmiq.appState;
let me = null/*no one, or not told*/, appStateSeen = null, appStateKnown = false;
let unsaved = false, saving = false, restored = false;

const save = async () => {
  if(saving || !unsaved || !appStateKnown || !me) return/*one save at a time, onto a known state, for a known person*/;
  saving = true; unsaved = false;
  const latest = (appStateSeen && (typeof appStateSeen === 'object')) ? appStateSeen : {};
  const byUser = (latest.byUser && (typeof latest.byUser === 'object')) ? latest.byUser : {};
  try {
    await appState.set({ ...latest, byUser: { ...byUser, [me.id]: { reached, finger: steerByFinger } } });
  } catch(error) {
    console.error('Could not save the app-state', error);
    if(!saveFailed) { saveFailed = true; showNotice('Your place isn’t being saved. The game still plays; it tries again as you go on.'); }
  } finally {
    saving = false;
    save();
  }
};
let saveFailed = false;
const keep = () => { unsaved = true; save(); };

/** takes up where this person left off, once: after that the game in hand stands */
const restore = () => {
  if(restored || !me || !appStateKnown) return/*done, or still waiting*/;
  restored = true;
  const mine = appStateSeen && appStateSeen.byUser && appStateSeen.byUser[me.id];
  if(!mine || (typeof mine !== 'object')) return/*a first visit*/;
  if(Number.isInteger(mine.reached) && (mine.reached > reached)) reached = mine.reached;
  if(typeof mine.finger === 'boolean') steerByFinger = mine.finger;
  if(!playing && (levels.length > 0)) loadLevel(reached);
  showSheet(); showMotion();
};

// == Screens =====================================================================
let noticeTimer = null;
/** a word to the person that goes away again */
const showNotice = (message) => {
  note.hidden = false; noteText.textContent = message; noteGo.hidden = true;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(showMotion, 6000);
};

const showTag = () => {
  // the Level button stands beside the name while the phone's tilt steers
  const tilting = playing && (motion === 'on') && !steerByFinger;
  tag.hidden = !playing; gear.hidden = !playing; relevel.hidden = !tilting;
  tag.classList.toggle('narrow', tilting);
  if(!level) return;
  tagName.textContent = (grids.length > 1) ? `${level.name}  ·  ${grids.length - floorIndex} / ${grids.length}` : level.name;
  tagKeys.replaceChildren(...held.map(key => Object.assign(document.createElement('i'), { style: `background:${PAIR_COLOR[key]}` })));
};

const play = (index) => {
  loadLevel(index);
  playing = true; won = false;
  title.hidden = true; card.hidden = true;
  showTag(); showMotion();
  if(level.hint) showNotice(level.hint);
};

let goalAt = { x: 0, y: 0 }/*where the found star stands*/;
const win = () => {
  won = true; celebrated = 0;
  goalAt = { x: Math.floor(ball.x), y: Math.floor(ball.y) };
  const last = (levelIndex + 1 >= levels.length);
  if(!last && (levelIndex + 1 > reached)) { reached = levelIndex + 1; keep(); }
  showMotion();
};
/** offers the next level, the star having been celebrated */
const offerNext = () => {
  const last = (levelIndex + 1 >= levels.length);
  cardTitle.textContent = last ? 'Every window, dressed' : 'The star';
  cardText.textContent = last ? 'That is all of them, for now.' : `Next, ${levels[levelIndex + 1].name}.`;
  cardGo.textContent = last ? 'Again' : 'Continue';
  card.hidden = false;
  showMotion();
};
cardGo.addEventListener('click', () => play((levelIndex + 1 >= levels.length) ? 0 : levelIndex + 1));

// -- Leveling --------------------------------------------------------------------
// before the first level, the person says how they hold the phone: the bead shows the
// tilt as it is, and Set level makes that pose level. With no tilt to follow (a
// computer, a refusal) there is nothing to level, and the game begins with a finger
let isLeveling = false;
const settleLeveling = () => {
  if(!isLeveling) return/*not being asked*/;
  if((motion === 'unavailable') || isTiltRefused()) { isLeveling = false; leveling.hidden = true; play(reached); return; }
  const ready = (motion === 'on');
  levelingText.textContent = ready ? 'Hold your phone the way you will play. Then set it.' : (motion === 'ask') ? 'Your phone needs a tap before it reports its tilt.' : 'Waiting for your phone…';
  setLevelButton.textContent = (motion === 'ask') ? 'Turn on tilt' : 'Set level';
  setLevelButton.disabled = !ready && (motion !== 'ask');
};
setLevelButton.addEventListener('click', () => {
  if(motion === 'ask') { follow(); return/*the tap an iPhone asks within*/; }
  setLevel();
  isLeveling = false; leveling.hidden = true;
  play(reached);
});
relevel.addEventListener('click', () => { setLevel(); showNotice('Level, as you hold it now.'); });

begin.addEventListener('click', () => {
  if(levels.length < 1) { showNotice('This game has no levels yet.'); return; }
  title.hidden = true;
  if(steerByFinger) { play(reached); return/*nothing to level*/; }
  isLeveling = true; leveling.hidden = false;
  follow()/*the tap an iPhone asks within*/;
  settleLeveling();
});

// -- Settings --------------------------------------------------------------------
const showSheet = () => {
  const finger = $('finger');
  finger.textContent = steerByFinger ? 'On' : 'Off';
  finger.classList.toggle('on', steerByFinger);
  finger.setAttribute('aria-pressed', String(steerByFinger));
  levelButtons.replaceChildren(...levels.map((_, index) => {
    const button = Object.assign(document.createElement('button'), { textContent: String(index + 1), disabled: index > reached });
    button.title = levels[index].name;
    button.classList.toggle('here', index === levelIndex);
    button.addEventListener('click', () => { closeSheet(); play(index); });
    return button;
  }));
};
const openSheet = () => { showSheet(); scrim.hidden = false; sheet.hidden = false; };
const closeSheet = () => { scrim.hidden = true; sheet.hidden = true; };
gear.addEventListener('click', openSheet);
scrim.addEventListener('click', closeSheet);
$('done').addEventListener('click', closeSheet);
$('recenter').addEventListener('click', () => { setLevel(); closeSheet(); showNotice('Level, as you hold it now.'); });
$('finger').addEventListener('click', () => { steerByFinger = !steerByFinger; showSheet(); showMotion(); showTag(); keep(); });
$('restart').addEventListener('click', () => { closeSheet(); play(levelIndex); });
document.addEventListener('keydown', (event) => { if(event.key === 'Escape') closeSheet(); });

// the page never zooms and offers no long-press menu
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('contextmenu', (event) => event.preventDefault());

// == Boot ========================================================================
const boot = () => {
  // the status bar continues the page
  const page = window.charmiq.page;
  if(page) page.setTopColor({ light: PAGE, dark: PAGE });
  scene.width = scene.clientWidth; scene.height = scene.clientHeight;
  buildGrain();
  showMotion();
  start();

  // the levels, as the document holds them: read again whenever they are edited
  window.charmiq.appContent.content$(LEVELS_SELECTOR).subscribe({
    next: (content) => {
      levels = content ? parseLevels(content.text) : [];
      if(levels.length < 1) { level = null; return/*nothing to play*/; }
      reached = clamp(reached, 0, levels.length - 1);
      loadLevel(playing ? levelIndex : reached);
    },
    error: (error) => {
      console.error('Could not read the levels', error);
      showNotice('The levels could not be read. Reload to try again.');
    },
  });

  appState.onChange$().subscribe({
    next: (state) => { appStateSeen = state; appStateKnown = true; restore(); save(); },
    error: (error) => {
      console.error('Could not read the app-state', error);
      appStateKnown = false; appStateSeen = null; unsaved = false;
      showNotice('Your place isn’t being saved. The game still plays; reload to try again.');
    },
  });
  if(typeof window.charmiq.user$ === 'function') {
    window.charmiq.user$().subscribe({
      next: (user) => {
        // another person takes up their own place: the one before keeps nothing unsaved
        if(me && user && (me.id !== user.id)) { restored = false; unsaved = false; }
        me = user;
        restore();
      },
      error: (error) => { console.warn('Could not read who is signed in', error); me = null; },
    });
  } /* else -- a Platform that tells no one: nothing is kept */
};
boot();
})();
</script>
</body>
</html>
  
    </app-source>
    <app-content name="levels.txt">
; After Hours: its levels. Each tile is one character:
;   # wall     . path     S where the ornament starts     G the star
;   a b c keys, and A B C the doors they open
;   o a hole, down to the floor below     ^ a lift, up to the floor above
;   ~ ice
; A level's floors are listed from the top one down.

level The Toy Shelf
hint Tilt gently. The page draws itself as you go.
floor
|#########|
|#S..#...#|
|#.#.#.#.#|
|#.#...#.#|
|#.#####.#|
|#.....#.#|
|###.#.#.#|
|#...#...#|
|#.#####.#|
|#.....#G#|
|#########|

level The Ribbon Drawer
hint A door opens to the key of its own color.
floor
|#########|
|#S..#..a#|
|#.#.#.###|
|#.#...#G#|
|#.###.#.#|
|#...#.A.#|
|###.#.###|
|#...#...#|
|#.#####.#|
|#.......#|
|#########|

level Two Shelves
hint A hole drops you a shelf. A brass lift carries you back up.
floor
|#########|
|#S....#G#|
|#.###.#.#|
|#.#...#.#|
|#.#.###.#|
|#...#...#|
|###.#.###|
|#o..#...#|
|#########|
floor
|#########|
|#...#...#|
|#.#.#.#.#|
|#.#...#.#|
|#.#####.#|
|#.......#|
|#.#####.#|
|#.#....^#|
|#########|

level The Skating Pond
hint Ice does not hold you. Mind the holes.
floor
|#########|
|#S......#|
|#.~~~~~.#|
|#.~o~o~.#|
|#.~~~~~.#|
|#.~o~~~.#|
|#.~~~o~.#|
|#.~~~~~.#|
|#.~~G~~.#|
|#.......#|
|#########|
floor
|#########|
|#^......#|
|#.......#|
|#.......#|
|#.......#|
|#.......#|
|#.......#|
|#.......#|
|#.......#|
|#.......#|
|#########|

level The Attic Stairs
hint The key is on the shelf below. So is the way back.
floor
|#########|
|#S..#A.G#|
|#.#.#.###|
|#.#.#...#|
|#.#.###.#|
|#.#.....#|
|#.#####.#|
|#.......#|
|#.#####o#|
|#.......#|
|#########|
floor
|#########|
|#a..#...#|
|###.#.#.#|
|#...#.#.#|
|#.###.#.#|
|#.....#.#|
|#.#####.#|
|#.#...#.#|
|#.#.#...#|
|#^..#####|
|#########|
  
    </app-content>
  </iframe-app>
</p>

## How to Play

* **Rolling:** tilt the phone and the ornament rolls downhill. **Tap to begin** is also the tap an iPhone needs before it reports its tilt, each time the game is opened. However you hold the phone at that tap is level; **Level the tilt** in the settings (the button at the top right) sets it again.

* **The page draws itself.** The window is dark. The ornament's light shows what it reaches as a paper model in ink, and what you have passed stays on the page as a faint line.

* **Keys and doors:** a door opens to the key of its own color.

* **Floors:** a hole drops the ornament to the floor below, and a brass lift carries it up to the floor above.

* **Ice** does not hold the ornament: it keeps sliding.

* **Nothing ends the game.** There is no clock and nothing to lose; a fall is just another place to be.

* **Steering with a finger:** on a device that reports no tilt (a computer), drag on the page or use the arrow keys. **Steer with a finger** in the settings chooses it on a phone.

## Its Levels

The levels are text in this document (`levels.txt`, the Application's app-content): one character for each tile, one grid for each floor from the top one down. Its first lines say what each character is. Edit it and the game plays what you wrote; a level with no start or no star is left out.

## On Your Phone

* **Home-screen setup:** [Mobile](charmiq://../README.md).

* **What it asks for:** your phone's tilt (`page.motion`), and who you are (`user.read`) to keep how far you have come, under your User id in the Application's app-state. Signed out, nothing is kept.

* **The screen stays awake** while a level is played, since a game steered by tilting is never touched.

* **It loads nothing.** Every wall, the ornament and the star are drawn in code as the Application opens.
