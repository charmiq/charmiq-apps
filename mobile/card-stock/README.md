# Card Stock

*Cut a track out of card, stand it on a cutting mat, and race a folded-paper car around it by tipping your phone. Build your own with a finger, hills, bridges and jumps included, then chase the best lap of everyone you share it with.*

<p style="display: flex; justify-content: center;">
  <iframe-app height="874px" requested-scopes="%5B%22page.motion%22%2C%22user.read%22%5D" width="402px">
    <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>Card Stock</title>
<style>
:root {
  --kraft: #c9a878;
  --card: #f8f3e9;
  --ink: #2c2b33;
  --ink2: rgba(44,43,51,.74);
  --coral: #ef5b4c;
  --mustard: #f2c14e;
  --teal: #2f6e63;
  --sky: #7cc4d8;
  --mint: #9ad0a8;
  --tape: rgba(236,221,172,.95);
  --safe-t: env(safe-area-inset-top,0px);
  --safe-b: env(safe-area-inset-bottom,0px);
  --round: ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Nunito",system-ui,sans-serif;
  --marker: "Marker Felt","Chalkboard SE","Bradley Hand","Comic Sans MS",cursive;
}
* { box-sizing: border-box; }
/* the page is one fixed screen: nothing scrolls it, and no gesture zooms or moves it
   (an iPhone scrolls a page on a double tap, even one that says it does not scroll) */
html, body { position: fixed; inset: 0; width: 100%; height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; background: var(--kraft); color: var(--ink); font-family: var(--round); font-weight: 700; -webkit-user-select: none; user-select: none; touch-action: none; -webkit-tap-highlight-color: transparent; }
body * { touch-action: none; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; border: 0; padding: 0; background: none; cursor: pointer; }
#scene { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }

/* the table seen as a small thing: out of focus toward the top and bottom, darker at its edges */
.soft { position: fixed; left: 0; right: 0; height: 24%; pointer-events: none; -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
#soft-top { top: 0; -webkit-mask-image: linear-gradient(#000, transparent); mask-image: linear-gradient(#000, transparent); }
#soft-bottom { bottom: 0; -webkit-mask-image: linear-gradient(transparent, #000); mask-image: linear-gradient(transparent, #000); }
#edges { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 46%, transparent 52%, rgba(70,45,15,.3) 100%); }

/* everything said or pressed is made of what is on the table: letters cut from card,
   scraps of card, masking tape written on in marker, and ruled paper taped down */
.cut { background: var(--card); border-radius: 12px; box-shadow: 0 3px 0 rgba(44,43,51,.3), 0 10px 22px rgba(44,43,51,.2); }
.pill { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 0 20px; font-size: 18px; font-weight: 800; letter-spacing: .02em; }
.pill:active, .letters:active i { transform: translateY(2px); }
.pill:disabled { opacity: .45; }
.pill.go { background: var(--coral); color: #fff; }
.pill.on { background: var(--mustard); }
/* an icon over its word */
.pill.stacked { flex-direction: column; gap: 1px; min-height: 54px; padding: 0 2px; font-size: 15px; }
.pill.stacked svg { width: 22px; height: 22px; }
.letters { display: flex; gap: 7px; justify-content: center; }
.letters i { display: grid; place-items: center; width: 50px; height: 62px; border-radius: 8px; font-style: normal; font-size: 40px; font-weight: 900; color: var(--ink); box-shadow: 0 4px 0 rgba(44,43,51,.32), 0 12px 20px rgba(44,43,51,.22); }
.stuck { filter: drop-shadow(0 2px 1px rgba(40,25,5,.3)); }
.tape { display: inline-block; max-width: 100%; padding: 9px 24px 10px; background: var(--tape) repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 2px, transparent 2px 7px); font-family: var(--marker); font-size: 21px; font-weight: 700; line-height: 1.25; color: #3b352c; text-align: center;
  clip-path: polygon(0 0, 6px 12%, 0 25%, 6px 38%, 0 50%, 6px 62%, 0 75%, 6px 88%, 0 100%, 100% 100%, calc(100% - 6px) 88%, 100% 75%, calc(100% - 6px) 62%, 100% 50%, calc(100% - 6px) 38%, 100% 25%, calc(100% - 6px) 12%, 100% 0); }
.paper { position: relative; padding: 34px 20px 22px; background: #fbf7ee repeating-linear-gradient(transparent 0 33px, rgba(86,140,176,.2) 33px 34px); border-radius: 3px; box-shadow: 0 1px 0 rgba(40,25,5,.2), 0 16px 30px rgba(40,25,5,.34); }
.paper::before, .paper::after { content: ""; position: absolute; top: -9px; width: 86px; height: 28px; background: var(--tape) repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 2px, transparent 2px 7px); box-shadow: 0 2px 2px rgba(40,25,5,.22); }
.paper::before { left: -24px; transform: rotate(-34deg); }
.paper::after { right: -24px; transform: rotate(33deg); }
h2 { margin: 0; font-family: var(--marker); font-size: 32px; font-weight: 700; line-height: 1.1; }

/* while racing */
#hud { position: fixed; left: 0; right: 0; top: calc(var(--safe-t) + 10px); display: flex; align-items: flex-start; justify-content: space-between; padding: 0 12px; pointer-events: none; }
#gear, #clock-tag { pointer-events: auto; }
#name-tag { max-width: 34vw; padding: 9px 12px; font-size: 15px; font-weight: 800; line-height: 1.15; transform: rotate(-2deg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#clock-tag { max-width: 52vw; padding: 6px 16px 8px; text-align: center; transform: rotate(1deg); }
#clock-tag.asked { background: var(--coral); color: #fff; }
#clock-tag.asked #times { color: #fff; }
#clock, #times { display: block; }
#clock { font-size: 38px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
#times { margin-top: 3px; font-size: 13px; font-weight: 800; color: var(--ink2); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#gear { width: 48px; height: 48px; display: grid; place-items: center; transform: rotate(3deg); }
#gear svg, .icon { width: 24px; height: 24px; fill: none; stroke: var(--ink); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
#foot { position: fixed; left: 12px; right: 12px; bottom: calc(var(--safe-b) + 14px); display: flex; justify-content: space-between; pointer-events: none; }
#foot > * { pointer-events: auto; }
#foot .pill { min-width: 78px; min-height: 58px; padding: 0 14px; }
#build-open { background: var(--mustard); transform: rotate(-2deg); }
#car-open { background: var(--mint); transform: rotate(1deg); }
#tracks-open { background: var(--sky); transform: rotate(2deg); }
#relevel { position: fixed; right: 12px; top: calc(var(--safe-t) + 70px); min-height: 44px; font-size: 15px; transform: rotate(-2deg); }

#count { position: fixed; left: 50%; top: 20%; width: 132px; height: 148px; margin-left: -66px; display: grid; place-items: center; font-size: 96px; font-weight: 900; line-height: 1; pointer-events: none; }
#count.pop { animation: pop .5s cubic-bezier(.2,1.6,.4,1); }
#flash { position: fixed; left: 50%; top: 26%; transform: translateX(-50%) rotate(-3deg); padding: 10px 22px 12px; text-align: center; pointer-events: none; white-space: nowrap; }
#flash.pop { animation: flashpop .45s cubic-bezier(.2,1.6,.4,1); }
#flash b { display: block; font-size: 44px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
#flash span { display: block; margin-top: 4px; font-family: var(--marker); font-size: 20px; color: var(--coral); }
@keyframes pop { from { transform: scale(.3) rotate(-14deg); } to { transform: none; } }
@keyframes flashpop { from { transform: translateX(-50%) scale(.3) rotate(-14deg); } to { transform: translateX(-50%) rotate(-3deg); } }

/* what only says something lets a finger through to the table under it */
#note { position: fixed; left: 14px; right: 14px; bottom: calc(var(--safe-b) + 88px); text-align: center; transform: rotate(-1deg); pointer-events: none; transition: opacity .4s; }
#note.going { opacity: 0; }
#note button { display: flex; margin: 10px auto 2px; font-family: var(--round); pointer-events: auto; }

/* whole-screen moments */
.screen { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; }
.screen > div { width: 100%; max-width: 350px; }
.screen p { margin: 14px 0 0; font-family: var(--marker); font-size: 21px; line-height: 1.35; }
#title { place-items: stretch center; padding: calc(var(--safe-t) + 34px) 20px calc(var(--safe-b) + 34px); }
#title > div { display: flex; flex-direction: column; justify-content: space-between; align-items: center; }
#logo { display: grid; gap: 10px; }
#title-foot { display: grid; gap: 16px; justify-items: center; }
#begin i { width: 58px; height: 72px; font-size: 46px; background: var(--coral); color: #fff; }
#leveling > div, #failed > div { transform: rotate(-1.2deg); }
#bubble { position: relative; width: 150px; height: 150px; margin: 18px auto 0; border-radius: 50%; background: var(--teal); box-shadow: inset 0 4px 0 rgba(0,0,0,.18); }
#bubble::after { content: ""; position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px; border-radius: 50%; border: 3px dashed rgba(255,255,255,.55); }
#bead { position: absolute; left: 50%; top: 50%; width: 34px; height: 34px; margin: -17px; border-radius: 50%; background: var(--mustard); box-shadow: 0 3px 0 rgba(0,0,0,.25); }
#set-level, #retry { margin-top: 18px; min-width: 170px; }
#no-tilt { display: block; margin: 16px auto 0; transform: rotate(1.5deg); }

/* building */
#build-top { position: fixed; left: 12px; right: 12px; top: calc(var(--safe-t) + 10px); display: grid; gap: 8px; justify-items: center; pointer-events: none; }
#build-top > * { pointer-events: auto; max-width: 100%; }
#build-top .name { width: 100%; transform: rotate(-.8deg); }
#build-top .name .tape { display: block; padding: 5px 22px 6px; }
#track-name { width: 100%; padding: 4px 0; border: 0; border-radius: 0; background: transparent; color: #3b352c; font: inherit; font-size: 24px; text-align: center; -webkit-user-select: text; user-select: text; outline: none; }
#track-name::placeholder { color: rgba(59,53,44,.5); }
#build-status { font-size: 19px; padding: 6px 20px 7px; }
#build-status.ready { color: #1f6a52; }
#sizes { display: flex; gap: 8px; }
.stepper { display: inline-flex; align-items: center; gap: 7px; min-height: 46px; padding: 0 6px 0 12px; font-size: 16px; font-weight: 800; }
.stepper button { width: 36px; height: 36px; border-radius: 9px; background: var(--mustard); font-size: 24px; font-weight: 900; line-height: 1; }
.stepper button:active { transform: translateY(1px); }
.stepper b { min-width: 1.5em; text-align: center; font-size: 19px; font-variant-numeric: tabular-nums; }
.building #note { bottom: calc(var(--safe-b) + 176px); }
#build-foot { position: fixed; left: 12px; right: 12px; bottom: calc(var(--safe-b) + 12px); display: grid; gap: 10px; }
#tools { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
#tools .pill:nth-child(odd) { transform: rotate(-1.5deg); }
#tools .pill:nth-child(even) { transform: rotate(1.5deg); }
#build-ends { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 8px; }

/* the car, walked round, and what it is fitted out with */
#car-top { position: fixed; left: 12px; right: 12px; top: calc(var(--safe-t) + 14px); text-align: center; transform: rotate(-1.5deg); pointer-events: none; }
#car-foot { position: fixed; left: 12px; right: 12px; bottom: calc(var(--safe-b) + 12px); display: grid; gap: 10px; justify-items: center; }
.picks { display: grid; gap: 6px; width: 100%; }
#shapes { grid-template-columns: repeat(4, 1fr); }
#kits { grid-template-columns: repeat(3, 1fr); }
.picks .pill:nth-child(odd) { transform: rotate(-1.5deg); }
.picks .pill:nth-child(even) { transform: rotate(1.5deg); }
#paints { display: flex; gap: 8px; justify-content: center; }
#paints button { width: 36px; height: 42px; border-radius: 7px; box-shadow: 0 3px 0 rgba(44,43,51,.3), 0 8px 14px rgba(44,43,51,.2); }
#paints button:nth-child(odd) { transform: rotate(-3deg); }
#paints button:nth-child(even) { transform: rotate(3deg); }
#paints button.on { outline: 3px solid var(--ink); outline-offset: 2px; transform: translateY(-4px); }
#kit-says { font-size: 17px; padding: 6px 18px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#car-done { width: 100%; }
.fitting #note { bottom: calc(var(--safe-b) + 336px); }

/* the tracks, as cards to leaf through; the settings, as a note */
#scrim { position: fixed; inset: 0; background: rgba(62,42,16,.52); }
#tracks-sheet { position: fixed; left: 0; right: 0; top: 50%; transform: translateY(-51%); text-align: center; }
#track-list { display: flex; gap: 22px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 26px 13% 34px; scrollbar-width: none; }
#track-list, #track-list * { touch-action: pan-x; }
#track-list::-webkit-scrollbar { display: none; }
/* a card is as wide as its place among the cards, however long a name on it: every
   name is one line, cut short with an ellipsis */
.swatch { flex: 0 0 100%; min-width: 0; max-width: 100%; scroll-snap-align: center; padding: 30px 16px 18px; }
.swatch:nth-child(odd) { transform: rotate(-1.3deg); }
.swatch:nth-child(even) { transform: rotate(1.1deg); }
.swatch svg { display: block; width: 100%; max-height: 36vh; border-radius: 5px; }
.swatch .name { margin-top: 12px; font-size: 25px; font-weight: 900; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch .best { margin-top: 2px; font-family: var(--marker); font-size: 20px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch .acts { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.swatch .acts .pill { min-height: 46px; padding: 0 14px; font-size: 17px; }
.swatch .acts .only { width: 46px; padding: 0; }
.swatch .acts .go { flex: 1; font-size: 20px; }
.swatch.blank { display: grid; place-items: center; align-content: center; gap: 6px; min-height: 300px; background: rgba(251,247,238,.5); border: 4px dashed rgba(251,247,238,.9); box-shadow: none; font-family: var(--marker); font-size: 26px; color: #fff; }
.swatch.blank::before, .swatch.blank::after { display: none; }
.swatch.blank b { font-family: var(--round); font-size: 72px; font-weight: 900; line-height: 1; }
.swatch.blank:disabled { opacity: .6; }
#settings-sheet { position: fixed; left: 22px; right: 22px; top: 50%; transform: translateY(-50%) rotate(-1deg); }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0; font-size: 19px; line-height: 1.25; text-align: left; }
.row > span { flex: 1; min-width: 0; }
.row small { display: block; margin-top: 2px; font-family: var(--marker); font-size: 17px; font-weight: 400; color: var(--ink2); }
.row .pill { min-height: 46px; min-width: 64px; padding: 0 14px; font-size: 17px; }
#settings-sheet > .pill { width: 100%; margin-top: 12px; }
</style>
</head>
<body>
<canvas id="scene" aria-label="A paper race track taped to a cutting mat, and a folded-paper car. Tip the phone to drive it."></canvas>
<div id="soft-top" class="soft"></div>
<div id="soft-bottom" class="soft"></div>
<div id="edges"></div>

<div id="hud" hidden>
  <div id="name-tag" class="cut"></div>
  <button id="clock-tag" class="cut" title="Start over"><span id="clock">0.00</span><span id="times"></span></button>
  <button id="gear" class="cut" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/></svg></button>
</div>
<div id="foot" hidden>
  <button id="build-open" class="cut pill stacked" data-icon="scissors">Build</button>
  <button id="car-open" class="cut pill stacked" data-icon="coupe">Car</button>
  <button id="tracks-open" class="cut pill stacked" data-icon="cards">Tracks</button>
</div>
<button id="relevel" class="cut pill" hidden>Level</button>
<div id="count" class="cut" hidden></div>
<div id="flash" class="cut" hidden><b id="flash-time"></b><span id="flash-word"></span></div>

<div id="note" class="stuck" role="status" hidden><div class="tape"><span id="note-text"></span><button id="note-go" class="cut pill on" hidden></button></div></div>

<div id="title" class="screen">
  <div>
    <div id="logo" role="heading" aria-level="1" aria-label="Card Stock">
      <div class="letters"><i style="background:#ef5b4c;transform:rotate(-5deg)">C</i><i style="background:#f2c14e;transform:rotate(3deg)">A</i><i style="background:#9ad0a8;transform:rotate(-2deg)">R</i><i style="background:#7cc4d8;transform:rotate(4deg)">D</i></div>
      <div class="letters"><i style="background:#f8f3e9;transform:rotate(3deg)">S</i><i style="background:#f2c14e;transform:rotate(-4deg)">T</i><i style="background:#ef5b4c;transform:rotate(2deg)">O</i><i style="background:#9ad0a8;transform:rotate(-3deg)">C</i><i style="background:#7cc4d8;transform:rotate(5deg)">K</i></div>
    </div>
    <div id="title-foot">
      <div class="stuck" style="transform:rotate(-2deg)"><div class="tape" style="font-size:19px;white-space:nowrap">Cut a track. Fold a car. Tip the table.</div></div>
      <button id="begin" class="letters" aria-label="Race"><i style="transform:rotate(-4deg)">R</i><i style="transform:rotate(3deg)">A</i><i style="transform:rotate(-2deg)">C</i><i style="transform:rotate(4deg)">E</i></button>
      <div class="stuck" style="transform:rotate(1.5deg)"><div id="title-how" class="tape" style="font-size:17px;white-space:nowrap"></div></div>
    </div>
  </div>
</div>

<div id="leveling" class="screen" hidden>
  <div class="paper">
    <h2>Level the table</h2>
    <div id="bubble"><i id="bead"></i></div>
    <p id="leveling-text"></p>
    <button id="set-level" class="cut pill go">Set level</button>
    <button id="no-tilt" class="stuck"><span class="tape" style="font-size:19px">Just use a finger</span></button>
  </div>
</div>

<div id="failed" class="screen" hidden>
  <div class="paper">
    <h2>The table didn’t arrive</h2>
    <p>Card Stock couldn’t load what it draws with. Check your connection, then try again.</p>
    <button id="retry" class="cut pill go">Try again</button>
  </div>
</div>

<div id="build-top" hidden>
  <div class="stuck name"><div class="tape"><input id="track-name" maxlength="28" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="The track’s name"></div></div>
  <div id="sizes">
    <span class="cut stepper">Wide<button data-size="wide" data-by="-1" aria-label="Narrower">−</button><b id="wide"></b><button data-size="wide" data-by="1" aria-label="Wider">+</button></span>
    <span class="cut stepper">Long<button data-size="long" data-by="-1" aria-label="Shorter">−</button><b id="long"></b><button data-size="long" data-by="1" aria-label="Longer">+</button></span>
  </div>
  <div class="stuck" style="transform:rotate(1deg)"><div id="build-status" class="tape"></div></div>
</div>
<div id="build-foot" hidden>
  <div id="tools">
    <button class="cut pill stacked" data-tool="draw" data-icon="pencil">Road</button>
    <button class="cut pill stacked" data-tool="erase" data-icon="eraser">Erase</button>
    <button class="cut pill stacked" data-tool="raise" data-icon="raise">Raise</button>
    <button class="cut pill stacked" data-tool="jump" data-icon="jump">Jump</button>
    <button class="cut pill stacked" data-tool="start" data-icon="flag">Start</button>
  </div>
  <div id="build-ends">
    <button id="build-close" class="cut pill">Close</button>
    <button id="build-clear" class="cut pill">Clear</button>
    <button id="build-race" class="cut pill go" disabled>Race it</button>
  </div>
</div>

<div id="car-top" hidden><div class="stuck"><div class="tape">Your car</div></div></div>
<div id="car-foot" hidden>
  <div id="shapes" class="picks" role="group" aria-label="Its shape"></div>
  <div id="paints" role="group" aria-label="Its paint"></div>
  <div id="kits" class="picks" role="group" aria-label="Its set-up"></div>
  <div class="stuck" style="transform:rotate(-1deg)"><div id="kit-says" class="tape"></div></div>
  <button id="car-done" class="cut pill go">Race it</button>
</div>

<div id="scrim" hidden></div>
<section id="tracks-sheet" role="dialog" aria-modal="true" aria-label="Tracks" hidden>
  <div id="track-list"></div>
  <button id="tracks-done" class="stuck"><span class="tape">Back to the race</span></button>
</section>
<section id="settings-sheet" class="paper" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
  <h2 id="settings-title">Settings</h2>
  <div class="row"><span>Steer by tilting<small>Off, only a finger steers.</small></span><button id="tilt" class="cut pill" aria-pressed="true">On</button></div>
  <div class="row"><span>Level the table<small>However you hold the phone now becomes flat.</small></span><button id="recenter" class="cut pill">Set</button></div>
  <div class="row"><span>Back on the track<small>Puts the car back where it last was on the road.</small></span><button id="put-back" class="cut pill">Put</button></div>
  <button id="settings-done" class="cut pill on">Done</button>
</section>

<script>
(() => {
'use strict';

// == Constants ===================================================================
// what the table is drawn with: a pinned module, fetched when the Application opens
const THREE_URL = 'https://esm.sh/three@0.186.1';

// the mat is a grid of tiles, each one unit across; north is up the screen. Each
// track says how wide and how long its own mat is
const SMALLEST = 5, WIDEST = 15, LONGEST = 21/*tiles a side*/, NEW_WIDE = 11, NEW_LONG = 14;
const NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3;
const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
const sideBit = (side) => 1 << side;
const opposite = (side) => (side + 2) % 4;

// a tile of track is the sides its road leaves by, written as one character
//   | -      straights            L r 7 J   corners        +   a crossing
//   T W F H  forks, where a shortcut leaves the road or comes back to it: the road
//            runs every way but north, south, west or east
//   : =      straights with a jump
//   ^ > v <  the start line, and the way the race runs across it
const OPEN_OF_GLYPH = { '|': 5, '-': 10, 'L': 3, 'r': 6, '7': 12, 'J': 9, '+': 15, 'T': 14, 'W': 11, 'F': 7, 'H': 13, ':': 5, '=': 10, '^': 5, 'v': 5, '>': 10, '<': 10 };
const GLYPH_OF_OPEN = { 5: '|', 10: '-', 3: 'L', 6: 'r', 12: '7', 9: 'J', 15: '+', 14: 'T', 11: 'W', 7: 'F', 13: 'H' };
const START_OF_GLYPH = { '^': NORTH, '>': EAST, 'v': SOUTH, '<': WEST };
const GLYPH_OF_START = ['^', '>', 'v', '<'];
const NORTH_SOUTH = 5, EAST_WEST = 10;
const ROAD_NORTH_SOUTH = 0, ROAD_EAST_WEST = 1/*a crossing's two roads (a side's road is `side % 2`); any other tile's one road is the first*/;
const TRACK_CAP = 24/*tracks kept in a document*/, NAME_CAP = 40/*characters of a person's name kept on a track or a lap*/;

// the road, and the car on it (tiles and seconds)
const ROAD_HALF = 0.31, CARD_HALF = 0.38/*the card the road is glued on*/, FORK_MIXED = CARD_HALF * 2/*how near two roads of a fork lie before their heights are mixed: one as far out as this part of the other*/, CAR_ROOM = 0.05/*how far off the road's edge the car still grips*/;
const LEVELS = 4/*how high a tile stands: 0 to 3*/, LEVEL_HIGH = 0.24/*for each*/;
const DECK = 0.055/*how thick a piece of road is, card and all*/, CAR_TALL = 0.15, HEADROOM = 0.17/*what the car needs over it to pass under a road*/;
// how a car is set up, its tires traded against its engine: how hard it is driven
// (`thrust`), how fast it turns (`turn`, radians a second), how fast sliding sideways
// dies on the road and off it (`grip`, `roughGrip`), and how much of a turn its speed
// turns with it (`carry`, `roughCarry`)
const KITS = {
  tires: { name: 'Tires', says: 'Grips the corners, slower on straights.', thrust: 5.3, turn: 7.6, grip: 11, roughGrip: 5, carry: 0.96, roughCarry: 0.65 },
  even: { name: 'Even', says: 'A bit of both.', thrust: 5.5, turn: 6.5, grip: 7, roughGrip: 3.5, carry: 0.85, roughCarry: 0.5 },
  engine: { name: 'Engine', says: 'Fast on straights, loose in the corners.', thrust: 5.9, turn: 5.8, grip: 3.8, roughGrip: 2.6, carry: 0.68, roughCarry: 0.4 },
};
const ROAD_DRAG = 1.6, ROUGH_DRAG = 3.6;
const BRAKE = 11, BRAKE_ANGLE = 2.2/*tipped this far against its travel, it brakes*/, BRAKE_SPEED = 0.9;
const GRAVITY = 7.5, HILL_HOLD = 0.7/*the most a hill pulls the car back, of its full thrust*/;
const BOUNCE = 0.45/*how much of its speed the car keeps, turned back, off what stops it*/;
const WALL_PACE = 0.05/*how finely the ground is walked to find a wall*/;
const STEP_UP = 0.07/*the tallest edge the car mounts: a taller one stops it*/, STEEPEST = 1.5/*steeper than any road runs, rise over run: a rise steeper is an edge*/;
const RAMP_FROM = -0.32, RAMP_LIP = 0.26, RAMP_HEIGHT = 0.2, RAMP_HALF = 0.25;
const WHEEL_AHEAD = 0.115, WHEEL_ASIDE = 0.105/*where the wheels stand from the car's middle*/;
const BODY_AHEAD = 0.17, BODY_ASIDE = 0.1/*and the corners of its body*/;
const HANGING = 0.14/*a wheel with the ground this far beneath it hangs in the air*/, HANG_PULL = 9/*how hard a hanging wheel pulls the car over*/, HANG_SLIDE = 3/*and how hard off the edge*/;
const TUMBLE = 14/*the fastest the car turns over, radians a second*/;
const WRECK_SECONDS = 1.2/*off its wheels this long, it flips itself back*/, RIGHTING_SECONDS = 0.45/*which takes this long*/;
const TREE_RADIUS = 0.13, CAR_RADIUS = 0.11, POST_RADIUS = 0.035, GATE_HALF = 0.5/*the start gate's posts, from the middle of the road*/;
const LOST_SECONDS = 4/*off the road this long, the car is put back*/;
const NOTE_SECONDS = 5/*how long a word to the person stays*/, ASKED_SECONDS = 3/*and how long a question waits for its second tap*/;
const LAP_SLACK = 2/*tiles of road a lap may miss between two it reaches, and still count*/;
const STEP_SECONDS = 1 / 120;

// a lap is kept as where the car was, this often; a longer lap keeps its time alone
const GHOST_RATE = 12, GHOST_SECONDS = 60;

// tilt
const FULL_TILT = Math.sin(20 * Math.PI / 180), DEAD_ZONE = 0.05, FINGER_REACH = 70/*pixels to a full pull*/;

const PAGE = '#c9a878';

// == Elements ====================================================================
const $ = (id) => document.getElementById(id);
const scene = $('scene'), hud = $('hud'), foot = $('foot'), nameTag = $('name-tag'), clockTag = $('clock-tag'), clock = $('clock'), times = $('times');
const count = $('count'), flash = $('flash'), flashTime = $('flash-time'), flashWord = $('flash-word');
const note = $('note'), noteText = $('note-text'), noteGo = $('note-go');
const title = $('title'), titleHow = $('title-how'), begin = $('begin');
const leveling = $('leveling'), levelingText = $('leveling-text'), setLevelButton = $('set-level'), bead = $('bead'), relevel = $('relevel');
const buildTop = $('build-top'), buildFoot = $('build-foot'), trackName = $('track-name'), buildStatus = $('build-status'), buildRace = $('build-race');
const carTop = $('car-top'), carFoot = $('car-foot'), kitSays = $('kit-says');
const scrim = $('scrim'), tracksSheet = $('tracks-sheet'), trackList = $('track-list'), settingsSheet = $('settings-sheet');

// the icons, drawn as with a marker: each the lines of a picture 24 by 24. A button
// that names one (`data-icon`) carries it before its word
const WHEELS = 'M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z';
const ICONS = {
  pencil: 'M4 20l3.5-1L19 7.5 16.5 5 5 16.5z',
  eraser: 'M9 19h11M4.5 14.5l8-8 5 5-7 7H7z',
  raise: 'M4 19h16M6.5 14h11M9 9h6',
  jump: 'M3 19h18M5 19l12-9v9',
  flag: 'M6 21V4M6 5h12l-3 4 3 4H6',
  scissors: 'M8.6 8.2 20 19M8.6 15.8 20 5M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  cards: 'M8 7V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H17M5.5 7h10A1.5 1.5 0 0 1 17 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7z',
  // a wastepaper basket, and a ball of paper on its way in
  basket: 'M5 10h14l-1.5 10.5h-11zM9.5 10l.5 10.5M14.5 10l-.5 10.5M10 5.6l2.1-1.6 2 1.3-.4 1.9h-3.1z',
  // the cars, each facing right
  coupe: `M3 16v-3.5h4l2.5-4h5l3 4H21V16${WHEELS}`,
  pickup: `M3 16v-4h8V8h4.5l2.5 4h3v4${WHEELS}`,
  wedge: `M3 16V9.5l18 4V16${WHEELS}`,
  van: `M3 16V7h12l6 5.5V16${WHEELS}`,
  tires: 'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  even: 'M5 9h14M5 15h14',
  engine: 'M13 3 5 13.5h6L10 21l9-11.5h-6z',
};
const iconOf = (name) => {
  const made = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  made.setAttribute('class', 'icon'); made.setAttribute('viewBox', '0 0 24 24'); made.setAttribute('aria-hidden', 'true');
  made.innerHTML = `<path d="${ICONS[name]}"/>`;
  return made;
};
document.querySelectorAll('[data-icon]').forEach(button => button.prepend(iconOf(button.dataset.icon)));

// == Utility =====================================================================
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
/** the signed turn from one heading to another, the short way round */
const turnBetween = (from, to) => { let turn = (to - from) % (Math.PI * 2); if(turn > Math.PI) turn -= Math.PI * 2; if(turn < -Math.PI) turn += Math.PI * 2; return turn; };
/** the same numbers from the same seed, every time */
const randomFrom = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};
const formatTime = (seconds) => (seconds >= 60) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}` : seconds.toFixed(2);
const newId = () => `t${Math.random().toString(36).slice(2, 10)}`;

// == Tracks ======================================================================
// a track is a record, one to a line of the `tracks` app-content: its id, its name,
// who built it, its rows of tiles (as many and as long as its mat) and, where any
// tile stands above the mat, the same rows again as how high each stands
const emptyTiles = (wide, long) => Array.from({ length: long }, () => Array.from({ length: wide }, () => ({ open: 0, jump: false, start: -1, level: 0 })));
const copyTiles = (tiles) => tiles.map(row => row.map(({ open, jump, start, level }) => ({ open, jump, start, level })));
const isStraight = (tile) => (tile.open === NORTH_SOUTH) || (tile.open === EAST_WEST);
/** whether a tile's road leaves it three ways */
const isFork = (tile) => [7, 11, 13, 14].includes(tile.open);

/** a record's rows as tiles, or `null` when they are not a track's */
const tilesOfRows = (rows, high) => {
  if(!Array.isArray(rows) || (rows.length < SMALLEST) || (rows.length > LONGEST)) return null/*no mat is that long*/;
  const wide = (typeof rows[0] === 'string') ? rows[0].length : 0;
  if((wide < SMALLEST) || (wide > WIDEST)) return null/*no mat is that wide*/;
  const tiles = emptyTiles(wide, rows.length);
  for(let y=0; y<rows.length; y++) {
    if((typeof rows[y] !== 'string') || (rows[y].length !== wide)) return null/*a row of another length*/;
    for(let x=0; x<wide; x++) {
      const glyph = rows[y][x];
      if(glyph === '.') continue/*bare mat*/;
      if(!(glyph in OPEN_OF_GLYPH)) return null/*not a tile*/;
      const level = (Array.isArray(high) && (typeof high[y] === 'string')) ? clamp(Number(high[y][x]) || 0, 0, LEVELS - 1) : 0;
      tiles[y][x] = { open: OPEN_OF_GLYPH[glyph], jump: (glyph === ':') || (glyph === '='), start: (glyph in START_OF_GLYPH) ? START_OF_GLYPH[glyph] : -1, level };
    }
  }
  return tiles;
};
/** tiles as a record's rows: each tile must be a whole piece (SEE: routeOf) */
const rowsOfTiles = (tiles) => tiles.map(row => row.map(tile => {
  if(tile.open === 0) return '.';
  if(tile.start >= 0) return GLYPH_OF_START[tile.start];
  if(tile.jump) return (tile.open === NORTH_SOUTH) ? ':' : '=';
  return GLYPH_OF_OPEN[tile.open];
}).join(''));
/** how high the tiles stand, as a record's rows, when any stands above the mat */
const highOfTiles = (tiles) => tiles.some(row => row.some(tile => (tile.open !== 0) && (tile.level > 0)))
  ? tiles.map(row => row.map(tile => (tile.open !== 0) ? String(tile.level) : '0').join('')) : undefined/*a flat track says nothing*/;

// a road may fork: a shortcut leaves the lap at one fork and comes back to it at
// another, further on. So the way round a track is every stretch of its road, each
// with the way the race runs along it
const roadKey = (x, y, road) => `${x},${y},${road}`;
/** which of a tile's roads a side is of: a crossing has two, any other tile one */
const roadOfSide = (tile, side) => (tile.open === 15) ? side % 2 : 0;
/** the way round a track, or why there is none. Each tile's road (a crossing's two)
 *  is a stretch of it: where it is, the ways the race comes onto it (`ins`) and leaves
 *  it (`outs`, and `next` for what lies each way), its first of each as `enter` and
 *  `exit`, and `order`, which only rises along the race. `steps` are the stretches of
 *  one whole lap, from the start gate (`first`) round to the tile behind it (`last`) */
const routeOf = (tiles) => {
  const long = tiles.length, wide = tiles[0].length;
  let start = null, laid = 0, ends = 0;
  for(let y=0; y<long; y++) {
    for(let x=0; x<wide; x++) {
      const tile = tiles[y][x];
      if(tile.open === 0) continue/*bare mat*/;
      laid++;
      if(!(tile.open in GLYPH_OF_OPEN)) ends++;
      if(tile.start >= 0) start = { x, y, heading: tile.start };
    }
  }
  if(laid < 1) return { ok: false, why: 'Drag a finger across the mat to lay road.' };
  if(ends > 0) return { ok: false, why: (ends === 1) ? 'The road has a loose end at the marked tile. Join it up, or erase it.' : 'The road has loose ends at the marked tiles. Join them up, or erase them.' };
  if(!start) return { ok: false, why: 'Choose Start, then tap a straight.' };

  // every stretch, and the stretch each of its sides meets
  const stretches = new Map();
  tiles.forEach((row, y) => row.forEach((tile, x) => {
    for(const road of (tile.open === 0) ? [] : (tile.open === 15) ? [ROAD_NORTH_SOUTH, ROAD_EAST_WEST] : [ROAD_NORTH_SOUTH]) {
      const sides = [NORTH, EAST, SOUTH, WEST].filter(side => (tile.open & sideBit(side)) && (roadOfSide(tile, side) === road));
      stretches.set(roadKey(x, y, road), { x, y, road, sides, next: new Map(), ins: [], outs: [], enter: -1, exit: -1, order: NaN });
    }
  }));
  for(const stretch of stretches.values()) {
    for(const side of stretch.sides) {
      const x = stretch.x + DX[side], y = stretch.y + DZ[side], tile = tiles[y] && tiles[y][x];
      if(!tile || !(tile.open & sideBit(opposite(side)))) return { ok: false, why: 'The road does not join up where it meets the next piece.' };
      stretch.next.set(side, stretches.get(roadKey(x, y, roadOfSide(tile, opposite(side)))));
    }
  }
  /** the race runs from a stretch out of one of its sides */
  const runs = (from, side) => { from.outs.push(side); from.next.get(side).ins.push(side); };
  const hasWay = (stretch, side) => stretch.outs.includes(side) || stretch.ins.includes(opposite(side));
  /** the shortest way from a stretch, out of one of its sides, along road with no way
   *  yet and stretches not yet on the route, to a stretch that ends it */
  const wayFrom = (from, side, isEnd) => {
    const came = new Map([[from, null]]), toTry = [];
    const reach = (stretch, by) => {
      if(hasWay(stretch, by)) return null/*already run*/;
      const to = stretch.next.get(by);
      if(came.has(to)) return null/*been there*/;
      came.set(to, { from: stretch, side: by });
      if(isEnd(to)) return to;
      if(Number.isNaN(to.order)) toTry.push(to)/*not on the route yet: the way may go on through it*/;
      return null;
    };
    let end = reach(from, side);
    while(!end && (toTry.length > 0)) { const stretch = toTry.shift(); for(const by of stretch.sides) { end = reach(stretch, by); if(end) break; } }
    if(!end) return null/*no way*/;
    const way = [];
    for(let to = end; came.get(to); to = came.get(to).from) way.unshift({ ...came.get(to), to });
    return way;
  };

  // one whole lap first: from the start gate, the way it faces, round to the tile behind it
  const first = stretches.get(roadKey(start.x, start.y, ROAD_NORTH_SOUTH)), last = first.next.get(opposite(start.heading));
  const lap = wayFrom(first, start.heading, stretch => stretch === last);
  if(!lap) return { ok: false, why: 'The road never comes back to the start gate.' };
  first.order = 0;
  lap.forEach((step, index) => { step.to.order = index + 1; runs(step.from, step.side); });
  runs(last, start.heading)/*and through the gate*/;
  // then every other road, a stretch at a time: each leaves the route at one place and
  // comes back to it at another, and runs from the earlier of the two to the later
  for(let guard=0; guard<stretches.size * 4; guard++) {
    let from = null, side = -1;
    for(const stretch of stretches.values()) {
      if(Number.isNaN(stretch.order)) continue/*not on the route yet*/;
      const open = stretch.sides.find(by => !hasWay(stretch, by));
      if(open !== undefined) { from = stretch; side = open; break; }
    }
    if(!from) break/*every road has its way*/;
    const way = wayFrom(from, side, stretch => !Number.isNaN(stretch.order)), end = way && way[way.length - 1].to;
    if(!way || (end === from)) return { ok: false, why: 'A road that leaves the lap has to come back to it further on.' };
    const between = way.slice(0, -1).map(step => step.to);
    between.forEach((stretch, index) => { stretch.order = from.order + ((end.order - from.order) * (index + 1) / (between.length + 1)); });
    for(const step of way) { if(from.order < end.order) runs(step.from, step.side); else runs(step.to, opposite(step.side)); }
  }
  for(const stretch of stretches.values()) {
    if((stretch.ins.length < 1) || (stretch.outs.length < 1)) return { ok: false, why: 'A road that leaves the lap has to come back to it further on.' };
    stretch.enter = stretch.ins[0]; stretch.exit = stretch.outs[0];
  }
  const steps = [first, ...lap.map(step => step.to)];
  steps.forEach((stretch, index) => { stretch.index = index; });
  return { ok: true, stretches, steps, start, first, last };
};
/** whether one stretch of a route is at most `within` stretches on from another, the
 *  way the race runs: by no way that goes on through the stretch `short` of which it stops */
const isAhead = (from, to, within, short) => {
  let reached = [from];
  for(let on=0; on<within; on++) {
    reached = reached.flatMap(stretch => ((on > 0) && (stretch === short)) ? [] : stretch.outs.map(side => stretch.next.get(side)));
    if(reached.includes(to)) return true;
  }
  return false;
};

/** where the middle of the road is, `part` of the way through a step of the route,
 *  and which way it runs there */
const along = (step, part) => {
  const cx = step.x + 0.5, cz = step.y + 0.5;
  if(step.enter === step.exit) return { x: cx + (DX[step.enter] * (part - 0.5)), z: cz + (DZ[step.enter] * (part - 0.5)), heading: Math.atan2(DZ[step.enter], DX[step.enter]) };
  // a quarter circle about the corner of the tile the road bends round
  const px = cx + ((DX[step.exit] - DX[step.enter]) * 0.5), pz = cz + ((DZ[step.exit] - DZ[step.enter]) * 0.5), angle = part * Math.PI / 2;
  return {
    x: px - (DX[step.exit] * 0.5 * Math.cos(angle)) + (DX[step.enter] * 0.5 * Math.sin(angle)),
    z: pz - (DZ[step.exit] * 0.5 * Math.cos(angle)) + (DZ[step.enter] * 0.5 * Math.sin(angle)),
    heading: Math.atan2((DZ[step.exit] * Math.sin(angle)) + (DZ[step.enter] * Math.cos(angle)), (DX[step.exit] * Math.sin(angle)) + (DX[step.enter] * Math.cos(angle))),
  };
};

/** whether a place on the mat is within `half` of the middle of a road */
const isRoad = (tiles, x, z, half) => {
  const tx = Math.floor(x), ty = Math.floor(z), tile = tiles[ty] && tiles[ty][tx];
  if(!tile || (tile.open === 0)) return false/*bare mat*/;
  const u = x - (tx + 0.5), v = z - (ty + 0.5);
  if(((tile.open & NORTH_SOUTH) === NORTH_SOUTH) && (Math.abs(u) < half)) return true;
  if(((tile.open & EAST_WEST) === EAST_WEST) && (Math.abs(v) < half)) return true;
  if(isFork(tile)) {
    // the road it has one way only: from the middle of the tile out to that side
    const stem = [NORTH, EAST, SOUTH, WEST].find(side => (tile.open & sideBit(side)) && !(tile.open & sideBit(opposite(side))));
    return (Math.abs((u * DZ[stem]) - (v * DX[stem])) < half) && (((u * DX[stem]) + (v * DZ[stem])) > 0);
  } /* else -- no fork */
  if(!(tile.open in GLYPH_OF_OPEN) || isStraight(tile) || (tile.open === 15)) return false/*beside a straight, or a loose end*/;
  // a corner: within the road's width of its quarter circle
  let px = tx + 0.5, pz = ty + 0.5;
  for(let side=0; side<4; side++) if(tile.open & sideBit(side)) { px += DX[side] * 0.5; pz += DZ[side] * 0.5; }
  return Math.abs(Math.hypot(x - px, z - pz) - 0.5) < half;
};

// -- Heights ---------------------------------------------------------------------
// a tile stands at its own height in its middle, and meets each tile it joins halfway
// between the two: the road runs up and down between them as hills. A raised road
// stands on stilts, with room to pass beneath it. A crossing has no height of its own:
// each of its two roads stands as high as the roads it joins, so one can bridge the other
/** readies tiles to be laid and driven: how high each stands at each of its sides,
 *  and which way the race runs over it (by its route, or as its piece lies) */
const survey = (tiles, route) => {
  const joined = (x, y, side) => { const next = tiles[y + DZ[side]] && tiles[y + DZ[side]][x + DX[side]]; return ((tiles[y][x].open & sideBit(side)) && next && (next.open & sideBit(opposite(side)))) ? next : null; };
  tiles.forEach((row, y) => row.forEach((tile, x) => {
    if(tile.open !== 15) return/*not a crossing*/;
    // each of its roads stands halfway between the two roads it joins. Where that leaves
    // the higher too little room over the lower for a car to pass, they are no bridge:
    // the two cross on the level, as high as the four roads they join come to between them
    const ends = [NORTH, EAST, SOUTH, WEST].map((end) => { const next = joined(x, y, end); return (next && (next.open !== 15)) ? next.level : tile.level; });
    const northSouth = (ends[NORTH] + ends[SOUTH]) / 2, eastWest = (ends[EAST] + ends[WEST]) / 2;
    const [upper, lower] = (northSouth >= eastWest) ? [[northSouth, ends[NORTH], ends[SOUTH]], [eastWest, ends[EAST], ends[WEST]]] : [[eastWest, ends[EAST], ends[WEST]], [northSouth, ends[NORTH], ends[SOUTH]]];
    const lowestOver = Math.min(upper[0], (upper[0] + upper[1]) / 2, (upper[0] + upper[2]) / 2), highestUnder = Math.max(lower[0], (lower[0] + lower[1]) / 2, (lower[0] + lower[2]) / 2);
    const isBridge = (((lowestOver - highestUnder) * LEVEL_HIGH) - DECK) >= HEADROOM + 0.02, level = (ends[NORTH] + ends[EAST] + ends[SOUTH] + ends[WEST]) / 4;
    tile.roads = isBridge ? [northSouth, eastWest] : [level, level];
  }));
  const standsToward = (tile, side) => (tile.open === 15) ? tile.roads[side % 2] : tile.level;
  // a track not yet a lap has no route: the way the race would run over each tile is
  // how the road is followed from the start line, down both roads of a fork
  const followed = new Map();
  if(!route.ok) {
    const from = [];
    tiles.forEach((row, y) => row.forEach((tile, x) => { if(tile.start >= 0) from.push({ x, y, heading: tile.start }); }));
    while(from.length > 0) {
      const { x, y, heading } = from.shift(), tile = tiles[y] && tiles[y][x], key = `${x},${y}`;
      if(!tile || (tile.open === 0) || followed.has(key)) continue/*off the road, or been over*/;
      followed.set(key, heading);
      const ways = ((tile.open === 15) || isStraight(tile)) ? [heading] : [NORTH, EAST, SOUTH, WEST].filter(side => side !== opposite(heading));
      for(const way of ways) if(tile.open & sideBit(way)) from.push({ x: x + DX[way], y: y + DZ[way], heading: way });
    }
  } /* else -- its route says */
  tiles.forEach((row, y) => row.forEach((tile, x) => {
    tile.joints = [NORTH, EAST, SOUTH, WEST].map((side) => { const next = joined(x, y, side); return LEVEL_HIGH * (next ? (standsToward(tile, side) + standsToward(next, side)) / 2 : standsToward(tile, side)); });
    const stretch = route.ok ? route.stretches.get(roadKey(x, y, ROAD_NORTH_SOUTH)) : undefined, lies = (tile.open === NORTH_SOUTH) ? SOUTH : EAST;
    tile.runs = stretch ? stretch.enter : followed.has(`${x},${y}`) ? followed.get(`${x},${y}`) : lies;
    // (a straight is only ever run along)
    if(isStraight(tile) && !(tile.open & sideBit(tile.runs))) tile.runs = lies;
  }));
};
const eased = (part) => part * part * (3 - (2 * part));
/** how high a surveyed tile's road lies at a place over it (its jump and its own
 *  thickness apart): at a crossing, the road named */
const roadHigh = (tile, tx, ty, x, z, road) => {
  const u = clamp(x - (tx + 0.5), -0.5, 0.5), v = clamp(z - (ty + 0.5), -0.5, 0.5);
  const toward = (side, part) => { const middle = LEVEL_HIGH * ((tile.open === 15) ? tile.roads[side % 2] : tile.level); return middle + ((tile.joints[side] - middle) * eased(clamp(part * 2, 0, 1))); };
  if(tile.open === NORTH_SOUTH) return toward((v < 0) ? NORTH : SOUTH, Math.abs(v));
  if(tile.open === EAST_WEST) return toward((u < 0) ? WEST : EAST, Math.abs(u));
  if((tile.open === 15) || isFork(tile)) {
    // a crossing's road named, or a fork's three roads: toward whichever side of it the
    // place lies furthest out to
    let nearest = -1, out = -Infinity, other = -1, less = -Infinity;
    for(let side=0; side<4; side++) {
      if(!(tile.open & sideBit(side)) || ((tile.open === 15) && (side % 2 !== road))) continue/*no road that way, or the other road's*/;
      const far = (u * DX[side]) + (v * DZ[side]);
      if(far > out) { other = nearest; less = out; nearest = side; out = far; }
      else if(far > less) { other = side; less = far; }
    }
    const high = toward(nearest, Math.max(0, out));
    // two roads of a fork that run to different heights would meet at a step, along the
    // line as far out to the one as to the other: close to that line the two are mixed.
    // (At the tile's side, as wide as its card, a road stands as its joint does alone)
    const mixed = (less > 0) ? 0.5 * eased(clamp(((less / out) - FORK_MIXED) / (1 - FORK_MIXED), 0, 1)) : 0;
    return (mixed > 0) ? high + ((toward(other, less) - high) * mixed) : high;
  } /* else -- a corner, or a loose end */
  if(!(tile.open in GLYPH_OF_OPEN)) return tile.level * LEVEL_HIGH/*a loose end*/;
  // a corner: by how far round its quarter circle the place is, from one side to the other
  const [first, second] = [NORTH, EAST, SOUTH, WEST].filter(side => tile.open & sideBit(side));
  const wx = u - ((DX[first] + DX[second]) * 0.5), wz = v - ((DZ[first] + DZ[second]) * 0.5);
  const round = clamp(Math.atan2(-((wx * DX[first]) + (wz * DZ[first])), -((wx * DX[second]) + (wz * DZ[second]))) / (Math.PI / 2), 0, 1);
  return (round < 0.5) ? toward(first, 0.5 - round) : toward(second, round - 0.5);
};
const NO_ROADS = [];
/** how high each road's top stands at a place on surveyed tiles: none over bare mat,
 *  two where a crossing's roads both pass */
const roadsAt = (tiles, x, z) => {
  const tx = Math.floor(x), ty = Math.floor(z), tile = tiles[ty] && tiles[ty][tx];
  if(!tile || (tile.open === 0)) return NO_ROADS;
  const u = x - (tx + 0.5), v = z - (ty + 0.5);
  if(tile.open === 15) {
    const tops = [];
    if(Math.abs(u) < CARD_HALF) tops.push(roadHigh(tile, tx, ty, x, z, ROAD_NORTH_SOUTH) + DECK);
    if(Math.abs(v) < CARD_HALF) tops.push(roadHigh(tile, tx, ty, x, z, ROAD_EAST_WEST) + DECK);
    return tops;
  } /* else -- one road */
  if(!isRoad(tiles, x, z, CARD_HALF)) return NO_ROADS;
  return [roadHigh(tile, tx, ty, x, z, ROAD_NORTH_SOUTH) + DECK + jumpAt(tiles, x, z)];
};
/** the ground under something `y` high at a place: the highest road it stands on or
 *  can mount, else the mat (a road above it is a roof, not ground) */
const groundAt = (tiles, x, z, y) => {
  let ground = 0;
  for(const top of roadsAt(tiles, x, z)) if((top <= y + STEP_UP) && (top > ground)) ground = top;
  return ground;
};
/** how high a jump stands over its road at a place: nothing, where there is none */
const jumpAt = (tiles, x, z) => {
  const tx = Math.floor(x), ty = Math.floor(z), tile = tiles[ty] && tiles[ty][tx];
  if(!tile || !tile.jump) return 0/*no jump*/;
  const u = x - (tx + 0.5), v = z - (ty + 0.5), run = (u * DX[tile.runs]) + (v * DZ[tile.runs]), across = (u * DZ[tile.runs]) - (v * DX[tile.runs]);
  return ((Math.abs(across) < RAMP_HALF) && (run > RAMP_FROM) && (run < RAMP_LIP)) ? ((run - RAMP_FROM) / (RAMP_LIP - RAMP_FROM)) * RAMP_HEIGHT : 0;
};
// the ground is walked a pace at a time, from where something stands to somewhere near
// it, to find what it meets on the way. From a road the next pace may rise as a hill
// does; from the bare mat it may only mount an edge. So a hill of any steepness is
// followed up and down, the side of a road is an edge, and a road overhead is a roof:
// never ground, however near
/** how far the next pace may rise, from ground `high` */
const riseFrom = (high, pace) => high + STEP_UP + ((high > 0.001) ? STEEPEST * pace : 0);
/** how high the ground stands at the end of a walk from one place, on ground `y`, to
 *  another. `onJump`: the walker may be on a jump's road beneath the jump (a wheel still
 *  on the jump its car is driving off), and so stand on the jump */
const groundToward = (tiles, fromX, fromZ, y, toX, toZ, onJump) => {
  const far = Math.hypot(toX - fromX, toZ - fromZ), paces = Math.max(1, Math.ceil(far / WALL_PACE)), pace = far / paces;
  let high = y;
  for(let paced=1; paced<=paces; paced++) {
    const x = fromX + ((toX - fromX) * paced / paces), z = fromZ + ((toZ - fromZ) * paced / paces), reach = riseFrom(high, pace), jump = onJump ? jumpAt(tiles, x, z) : 0;
    let ground = 0;
    for(const top of roadsAt(tiles, x, z)) if(((top <= reach) || ((jump > 0) && (top - jump <= reach))) && (top > ground)) ground = top;
    high = ground;
  }
  return high;
};
/** whether a wall stands between two places for something on the ground at `y` (or
 *  flying at it): a road whose top rises more sharply than the ground may be followed,
 *  and stands too low to pass beneath */
const isWalled = (tiles, fromX, fromZ, y, toX, toZ, isFlying) => {
  const far = Math.hypot(toX - fromX, toZ - fromZ), paces = Math.max(1, Math.ceil(far / WALL_PACE)), pace = far / paces;
  let high = y;
  for(let paced=1; paced<=paces; paced++) {
    const reach = riseFrom(high, pace);
    let ground = 0;
    for(const top of roadsAt(tiles, fromX + ((toX - fromX) * paced / paces), fromZ + ((toZ - fromZ) * paced / paces))) {
      if(top <= reach) ground = Math.max(ground, top);
      else if((top - DECK) < high + HEADROOM) return true;
      /* else -- a road high enough overhead to pass beneath */
    }
    high = isFlying ? Math.max(ground, y) : ground;
  }
  return false;
};

// == Cars ========================================================================
// a person's car is fitted out with a shape, a paint and a set-up (SEE: KITS). Every
// shape fills the same box on the same wheels, so every car drives and fits alike
const SHAPES = { coupe: { name: 'Coupe' }, pickup: { name: 'Pickup' }, wedge: { name: 'Wedge' }, van: { name: 'Van' } };
const PAINTS = {
  coral: { name: 'Coral', color: 0xef5b4c, stripe: 0xfdfaf3 }, orange: { name: 'Orange', color: 0xf08a3c, stripe: 0xfdfaf3 },
  mustard: { name: 'Mustard', color: 0xf2c14e, stripe: 0xfdfaf3 }, mint: { name: 'Mint', color: 0x9ad0a8, stripe: 0xfdfaf3 },
  sky: { name: 'Sky', color: 0x7cc4d8, stripe: 0xfdfaf3 }, plum: { name: 'Plum', color: 0x9a6bb0, stripe: 0xfdfaf3 },
  cream: { name: 'Cream', color: 0xf8f3e9, stripe: 0xef5b4c }, ink: { name: 'Ink', color: 0x3a3944, stripe: 0xf2c14e },
};
const NEW_FIT = { shape: 'coupe', paint: 'coral', kit: 'even' };
let fit = { ...NEW_FIT }/*the person's own car*/;
/** a car's fit as it was kept: whatever of it this game does not know is the new car's */
const fitOf = (kept) => {
  const known = (list, id, other) => ((typeof id === 'string') && Object.hasOwn(list, id)) ? id : other;
  return { shape: known(SHAPES, kept && kept.shape, NEW_FIT.shape), paint: known(PAINTS, kept && kept.paint, NEW_FIT.paint), kit: known(KITS, kept && kept.kit, NEW_FIT.kit) };
};

// == Tilt ========================================================================
// which way and how hard the car is driven, at most 1 in any direction across and
// down the screen: the phone's tilt, a finger and the arrow keys, all at once
const sensorTilt = { x: 0, y: 0 }, fingerTilt = { x: 0, y: 0 }, keyTilt = { x: 0, y: 0 };
let useTilt = true/*the person's own choice*/;
let motion = 'idle';
const tiltNow = () => {
  const x = ((useTilt && (motion === 'on')) ? sensorTilt.x : 0) + fingerTilt.x + keyTilt.x,
        y = ((useTilt && (motion === 'on')) ? sensorTilt.y : 0) + fingerTilt.y + keyTilt.y, size = Math.hypot(x, y);
  return (size > 1) ? { x: x / size, y: y / size } : { x, y };
};

// the phone's tilt is measured on the table as the phone was held when it was last set
// level: across it and up it, square to the way down then. However the phone is held,
// tipping it as far one way as another pulls as hard
let levelTable = null/*taken from the next reading*/, heldDown = null/*no reading yet*/;
// how far from level the phone is held, before the dead zone: what the leveling bead shows
const leanNow = { x: 0, y: 0 };
/** the table for a way down: its across and its up-the-phone, each a unit vector in
 *  the phone's own frame */
const tableOf = (down) => {
  const up = { x: -down.x, y: -down.y, z: -down.z };
  const flat = (x, y, z) => { const lift = (x * up.x) + (y * up.y) + (z * up.z), made = { x: x - (lift * up.x), y: y - (lift * up.y), z: z - (lift * up.z) }, size = Math.hypot(made.x, made.y, made.z); return { x: made.x / size, y: made.y / size, z: made.z / size, size }; };
  const cross = (a, b) => ({ x: (a.y * b.z) - (a.z * b.y), y: (a.z * b.x) - (a.x * b.z), z: (a.x * b.y) - (a.y * b.x) });
  // from the phone's own across; held on its side, upright, from its own up
  const across = flat(1, 0, 0);
  if(across.size > 0.2) return { across, up: cross(up, across) };
  const along = flat(0, 1, 0);
  return { across: cross(along, up), up: along };
};
/** makes however the phone is held now level */
const setLevel = () => { if(heldDown) levelTable = tableOf(heldDown); sensorTilt.x = 0; sensorTilt.y = 0; leanNow.x = 0; leanNow.y = 0; };
const receiveReading = (reading) => {
  if((reading.beta === null) || (reading.gamma === null)) return/*nothing measured*/;
  // the way down, in the phone's own frame
  const beta = reading.beta * Math.PI / 180, gamma = reading.gamma * Math.PI / 180,
        down = { x: Math.cos(beta) * Math.sin(gamma), y: -Math.sin(beta), z: -Math.cos(beta) * Math.cos(gamma) };
  heldDown = down;
  if(!levelTable) levelTable = tableOf(down);

  // how far down has swung across the table and up it, turned to the screen's frame
  // when the phone is held sideways
  const dot = (a, b) => (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
  const angle = ((screen.orientation && screen.orientation.angle) || 0) * Math.PI / 180,
        x = dot(down, levelTable.across), y = dot(down, levelTable.up),
        across = (x * Math.cos(angle)) - (y * Math.sin(angle)),
        up = (x * Math.sin(angle)) + (y * Math.cos(angle)), size = Math.hypot(across, up);
  // the car drives toward the side that drops; up the phone is up the table. One dead
  // zone round level, so a slight tip steers the way it points and not along an axis
  const pull = (size < DEAD_ZONE) ? 0 : Math.min(1, (size - DEAD_ZONE) / (FULL_TILT - DEAD_ZONE));
  sensorTilt.x = size ? (across / size) * pull : 0;
  sensorTilt.y = size ? (-up / size) * pull : 0;
  leanNow.x = clamp(across / FULL_TILT, -1, 1); leanNow.y = clamp(-up / FULL_TILT, -1, 1);
  if(motion !== 'on') setMotion('on');
};

// == Motion ======================================================================
// the phone's motion comes from the page (`charmiq.page.motion$`, `page.motion`). An
// iPhone lets the page ask only within a tap, and forgets its answer whenever the app
// is closed: Race is that tap. A refusal's `code` says who refused
//   idle         not asked for yet
//   waiting      following, with no reading yet
//   ask          the page needs a tap before it can ask
//   on           readings arrive
//   refused      CharmIQ: this Application's motion was not allowed
//   device       the phone: its own question was turned down
//   unasked      this page cannot ask the phone (a published page)
//   signedOut    no one is signed in
//   unavailable  no motion reported: a finger steers
const MOTION_NOTE = {
  ask: 'Tilting is off. A finger still steers.',
  refused: 'CharmIQ hasn’t been allowed to give this game your phone’s tilt. Open CharmIQ in a browser and allow it in Settings → Permissions. Until then, drag a finger.',
  device: 'Your phone didn’t allow tilting. Close the game, open it again, and choose Allow. Until then, drag a finger.',
  unasked: 'This page can’t ask your phone for its tilt. Open the game in CharmIQ or from your Home Screen. Here, drag a finger.',
  signedOut: 'Sign in to CharmIQ to drive by tilting. Until then, drag a finger.',
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

// what the Application is doing: `title`, `leveling`, `race`, `build` or `car`
let mode = 'title';
let noticeTimer = null, goingTimer = null;
let toldMotion = null/*which word about tilting has been said*/;
const showMotion = () => {
  // why tilting is not to be had, or the offer to turn it on, is said once and goes
  // like any other word: a finger steers meanwhile, and the settings turn tilting on
  if((mode === 'race') && MOTION_NOTE[motion] && (toldMotion !== motion)) { toldMotion = motion; showNotice(MOTION_NOTE[motion], (motion === 'ask') ? 'Turn on tilt' : undefined); }
  showTilt();
};
/** what follows from whether tilting steers: what the title says, the Level button,
 *  and the screen kept awake */
const showTilt = () => {
  titleHow.textContent = (useTilt && (motion !== 'unavailable')) ? 'Tip your phone to drive. Or drag a finger.' : 'Drag a finger to drive. Or use the arrows.';
  relevel.hidden = !((mode === 'race') && (motion === 'on') && useTilt);
  // a game steered by tilting is never touched: the screen stays awake while it is raced
  const page = window.charmiq.page;
  if(page && (typeof page.setScreenAwake === 'function')) page.setScreenAwake(mode === 'race');
};
/** a word to the person, and what it offers to do: it fades away after NOTE_SECONDS,
 *  whatever is touched meanwhile */
const showNotice = (message, offer) => {
  note.hidden = false; note.classList.remove('going');
  noteText.textContent = message; noteGo.hidden = !offer; noteGo.textContent = offer || '';
  clearTimeout(noticeTimer); clearTimeout(goingTimer);
  noticeTimer = setTimeout(() => { note.classList.add('going'); goingTimer = setTimeout(() => { note.hidden = true; }, 400); }, NOTE_SECONDS * 1000);
};
const hideNotice = () => { clearTimeout(noticeTimer); clearTimeout(goingTimer); note.hidden = true; };
let settleLeveling = () => {}/*set once the screens are*/;
const setMotion = (next) => {
  motion = next;
  if(motion !== 'on') { sensorTilt.x = 0; sensorTilt.y = 0; }
  showMotion();
  settleLeveling();
};

let following = null/*not following*/;
/** follows the phone's motion: within a tap wherever the page must ask */
const follow = () => {
  if(following) { following.unsubscribe(); following = null; }
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
noteGo.addEventListener('click', () => { hideNotice(); follow(); });

// the arrow keys drive fully their way
const KEY_PULL = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
const keysDown = new Set();
const pullOfKeys = () => {
  keyTilt.x = 0; keyTilt.y = 0;
  keysDown.forEach(key => { keyTilt.x += KEY_PULL[key][0]; keyTilt.y += KEY_PULL[key][1]; });
};
document.addEventListener('keydown', (event) => {
  if((event.target === trackName) || !KEY_PULL[event.key]) return/*typing a name, or not a driving key*/;
  keysDown.add(event.key); pullOfKeys(); event.preventDefault();
});
document.addEventListener('keyup', (event) => { if(keysDown.delete(event.key)) pullOfKeys(); });

// == The Table ===================================================================
/** everything drawn and driven, once what draws it has arrived */
const open = (THREE) => {

// -- Paper -----------------------------------------------------------------------
// every piece is matte card. A piece cut from colored card shows its white core at
// its cut edges
const paper = (color, more) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0, ...more });
const EDGE = paper(0xfdfaf3);
const CARD = paper(0xf6f0e3), ROAD = paper(0x474a54), LINE = paper(0xfdfaf3);
const CORAL = paper(0xef5b4c), MUSTARD = paper(0xf2c14e), MINT = paper(0x9ad0a8), SKY = paper(0x7cc4d8), TEAL = paper(0x3d8a7b);
const LOOSE = paper(0xf3a99f), GLASS = paper(0x39475a), TIRE = paper(0x2f2f36), TRUNK = paper(0x8f6444);
const GHOST = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false });
const LEAVES = [paper(0x7fc08f, { flatShading: true }), paper(0x4f9f7c, { flatShading: true }), paper(0xf2c14e, { flatShading: true }), paper(0xf08a5d, { flatShading: true }), paper(0xbfdc8a, { flatShading: true })];

/** a canvas to paint a paper's face on */
const paint = (width, height, draw) => {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
};
// kraft paper: its fibers, lighter and darker
const kraft = paint(512, 512, (g, width, height) => {
  const random = randomFrom(7);
  g.fillStyle = '#c9a878'; g.fillRect(0, 0, width, height);
  for(let fiber=0; fiber<5200; fiber++) {
    const x = random() * width, y = random() * height, length = 3 + (random() * 16), angle = random() * Math.PI;
    g.strokeStyle = (random() < 0.5) ? `rgba(255,240,210,${0.05 + (random() * 0.09)})` : `rgba(90,60,25,${0.04 + (random() * 0.08)})`;
    g.lineWidth = 0.6 + random();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.cos(angle) * length), y + (Math.sin(angle) * length)); g.stroke();
  }
});
kraft.wrapS = kraft.wrapT = THREE.RepeatWrapping; kraft.repeat.set(9, 9);
// the cutting mat: a line at every tile, a finer one at every half, and its own marks
const MAT_MARGIN = 0.4;
const paintMat = (wide, long) => {
  const tile = clamp(Math.floor(1800 / (Math.max(wide, long) + (MAT_MARGIN * 2))), 48, 128), line = tile / 128;
  return paint(Math.round((wide + (MAT_MARGIN * 2)) * tile), Math.round((long + (MAT_MARGIN * 2)) * tile), (g, width, height) => {
    const left = MAT_MARGIN * tile, top = MAT_MARGIN * tile, random = randomFrom(3);
    g.fillStyle = '#2f6e63'; g.fillRect(0, 0, width, height);
    for(let speck=0; speck<2600; speck++) { g.fillStyle = `rgba(${(random() < 0.5) ? '255,255,255' : '0,30,24'},${0.02 + (random() * 0.04)})`; g.fillRect(random() * width, random() * height, 1 + (random() * 2), 1 + (random() * 2)); }
    g.strokeStyle = 'rgba(200,236,222,.2)'; g.lineWidth = 1.5 * line; g.beginPath();
    for(let x=0; x<=wide * 2; x++) { g.moveTo(left + (x * tile / 2), top); g.lineTo(left + (x * tile / 2), top + (long * tile)); }
    for(let y=0; y<=long * 2; y++) { g.moveTo(left, top + (y * tile / 2)); g.lineTo(left + (wide * tile), top + (y * tile / 2)); }
    g.stroke();
    g.strokeStyle = 'rgba(214,242,230,.62)'; g.lineWidth = 3 * line; g.beginPath();
    for(let x=0; x<=wide; x++) { g.moveTo(left + (x * tile), top); g.lineTo(left + (x * tile), top + (long * tile)); }
    for(let y=0; y<=long; y++) { g.moveTo(left, top + (y * tile)); g.lineTo(left + (wide * tile), top + (y * tile)); }
    g.stroke();
    g.fillStyle = 'rgba(214,242,230,.7)'; g.font = `700 ${Math.round(22 * line)}px ui-rounded, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for(let x=0; x<wide; x++) g.fillText(String(x + 1), left + ((x + 0.5) * tile), top / 2);
    for(let y=0; y<long; y++) g.fillText(String(y + 1), left / 2, top + ((y + 0.5) * tile));
    g.textAlign = 'right'; g.font = `800 ${Math.round(20 * line)}px ui-rounded, system-ui, sans-serif`;
    g.fillText(`CARD STOCK  ·  ${wide} × ${long}`, width - left, height - (top / 2));
  });
};
// what keeps a track from being a lap, marked on its tile while it is built
const FAULT_MARK = paper(0xffffff, { transparent: true, map: paint(96, 96, (g) => {
  g.fillStyle = '#ef5b4c'; g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fdfaf3'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#fdfaf3'; g.font = '900 68px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 48, 52);
}) });
// how high a raised tile stands, written on it while a track is built
const LEVEL_MARKS = [1, 2, 3].map(level => paper(0xffffff, { transparent: true, map: paint(96, 96, (g) => {
  g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2c2b33'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#2c2b33'; g.font = '900 64px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(level), 48, 52);
}) }));
// a checkered flag's squares, two by two
const checker = paint(64, 64, (g) => { g.fillStyle = '#fdfaf3'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2c2b33'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); });
checker.wrapS = checker.wrapT = THREE.RepeatWrapping; checker.magFilter = THREE.NearestFilter;
const checkered = (across, down) => { const face = checker.clone(); face.needsUpdate = true; face.repeat.set(across, down); return paper(0xffffff, { map: face }); };

/** a box of card standing on `y`: colored on top and beneath, its cut edges white */
const box = (width, height, depth, face, x = 0, y = 0, z = 0) => {
  // a long piece is cut across its length, so it can bend over a hill
  const cuts = (length) => (length > 0.9) ? 8 : (length > 0.45) ? 4 : 1;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth, cuts(width), 1, cuts(depth)), [EDGE, EDGE, face, face, EDGE, EDGE]);
  mesh.position.set(x, y + (height / 2), z);
  return mesh;
};
/** part of the quarter ring a corner's road is, lying on `y`: between two distances
 *  from the tile's north-east corner, `from` to `to` of the way round from its north
 *  side to its east. It is cut across at every step round, each cut running straight
 *  out from that corner, so it bends over a hill as one surface */
const ring = (inner, outer, from, to, y, height, face) => {
  const steps = Math.max(2, Math.ceil(16 * (to - from))), faces = [], edges = [];
  const at = (part, radius, high) => { const angle = (from + ((to - from) * part)) * Math.PI / 2; return [0.5 - (radius * Math.cos(angle)), high, -0.5 + (radius * Math.sin(angle))]; };
  /** two triangles for four corners, wound to face the way given */
  const quad = (into, a, b, c, d, toward) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const isFacing = ((((uy * vz) - (uz * vy)) * toward[0]) + (((uz * vx) - (ux * vz)) * toward[1]) + (((ux * vy) - (uy * vx)) * toward[2])) > 0;
    into.push(...(isFacing ? [a, b, c, a, c, d] : [a, c, b, a, d, c]).flat());
  };
  for(let step=0; step<steps; step++) {
    const here = step / steps, next = (step + 1) / steps, middle = (from + ((to - from) * (here + next) / 2)) * Math.PI / 2, out = [-Math.cos(middle), 0, Math.sin(middle)];
    quad(faces, at(here, inner, height), at(here, outer, height), at(next, outer, height), at(next, inner, height), [0, 1, 0]);
    quad(faces, at(here, inner, 0), at(here, outer, 0), at(next, outer, 0), at(next, inner, 0), [0, -1, 0]);
    quad(edges, at(here, outer, 0), at(next, outer, 0), at(next, outer, height), at(here, outer, height), out);
    quad(edges, at(here, inner, 0), at(next, inner, 0), at(next, inner, height), at(here, inner, height), [-out[0], 0, -out[2]]);
  }
  // its two cut ends
  const first = from * Math.PI / 2, last = to * Math.PI / 2;
  quad(edges, at(0, inner, 0), at(0, outer, 0), at(0, outer, height), at(0, inner, height), [-Math.sin(first), 0, -Math.cos(first)]);
  quad(edges, at(1, inner, 0), at(1, outer, 0), at(1, outer, height), at(1, inner, height), [Math.sin(last), 0, Math.cos(last)]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...faces, ...edges], 3));
  geometry.addGroup(0, faces.length / 3, 0); geometry.addGroup(faces.length / 3, edges.length / 3, 1);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, [face, EDGE]);
  mesh.position.y = y;
  return mesh;
};
const shadowed = (thing) => { thing.traverse(part => { if(part.isMesh) { part.castShadow = true; part.receiveShadow = true; } }); return thing; };
const group = (...parts) => { const made = new THREE.Group(); parts.forEach(part => made.add(part)); return made; };

// -- Pieces ----------------------------------------------------------------------
// each piece is made once and copied onto its tiles: a base of pale card, the road
// glued on it, and its lines glued on that
const BASE = 0.035, TOP = 0.055/*the road's face, above the mat*/;
// a straight, running east and west
const straightPiece = shadowed(group(
  box(1, BASE, CARD_HALF * 2, CARD),
  box(1, TOP - BASE, ROAD_HALF * 2, ROAD, 0, BASE),
  box(1, 0.006, 0.02, LINE, 0, TOP, ROAD_HALF - 0.04), box(1, 0.006, 0.02, LINE, 0, TOP, -(ROAD_HALF - 0.04)),
  box(0.18, 0.006, 0.03, LINE, -0.25, TOP), box(0.18, 0.006, 0.03, LINE, 0.25, TOP),
));
// a corner, from the north side round to the east
const cornerPiece = shadowed(group(
  ring(0.5 - CARD_HALF, 0.5 + CARD_HALF, 0, 1, 0, BASE, CARD),
  ring(0.5 - ROAD_HALF, 0.5 + ROAD_HALF, 0, 1, BASE, TOP - BASE, ROAD),
  ring(0.5 + ROAD_HALF - 0.05, 0.5 + ROAD_HALF - 0.03, 0, 1, TOP, 0.006, LINE),
  ring(0.49, 0.515, 0.14, 0.38, TOP, 0.006, LINE), ring(0.49, 0.515, 0.62, 0.86, TOP, 0.006, LINE),
  ...[0, 1, 2, 3, 4, 5].map(stripe => ring(0.5 - ROAD_HALF + 0.015, 0.5 - ROAD_HALF + 0.065, stripe / 6, (stripe + 1) / 6, TOP, 0.009, (stripe % 2) ? LINE : CORAL)),
));
// a crossing: one road over the other
const crossPiece = shadowed(group(
  box(1, BASE, CARD_HALF * 2, CARD), box(CARD_HALF * 2, BASE, 1, CARD),
  box(1, TOP - BASE, ROAD_HALF * 2, ROAD, 0, BASE), box(ROAD_HALF * 2, TOP - BASE, 1, ROAD, 0, BASE),
));
// a fork: a road running east and west, and one that leaves it to the south
const forkPiece = shadowed(group(
  box(1, BASE, CARD_HALF * 2, CARD), box(CARD_HALF * 2, BASE, 0.5, CARD, 0, 0, 0.25),
  box(1, TOP - BASE, ROAD_HALF * 2, ROAD, 0, BASE), box(ROAD_HALF * 2, TOP - BASE, 0.5, ROAD, 0, BASE, 0.25),
  box(1, 0.006, 0.02, LINE, 0, TOP, -(ROAD_HALF - 0.04)),
  ...[-1, 1].flatMap(aside => [
    box(0.54 - ROAD_HALF, 0.006, 0.02, LINE, aside * (0.46 + ROAD_HALF) / 2, TOP, ROAD_HALF - 0.04),
    box(0.02, 0.006, 0.54 - ROAD_HALF, LINE, aside * (ROAD_HALF - 0.04), TOP, (0.46 + ROAD_HALF) / 2),
    box(0.18, 0.006, 0.03, LINE, aside * 0.3, TOP),
  ]),
  box(0.03, 0.006, 0.14, LINE, 0, TOP, 0.38),
));
// the start line, for a race running east: its checkers, the arrows before them and
// the arch over them
const chevron = (x) => { const arm = (turn, z) => { const made = box(0.15, 0.006, 0.032, LINE, x, TOP, z); made.rotation.y = turn; return made; }; return [arm(0.7, 0.048), arm(-0.7, -0.048)]; };
const startPiece = shadowed(group(
  box(0.1, 0.007, ROAD_HALF * 2, checkered(1, 6), 0, TOP),
  ...chevron(-0.3), ...chevron(-0.18),
  box(0.045, 0.5, 0.045, LINE, 0, 0, GATE_HALF), box(0.045, 0.5, 0.045, LINE, 0, 0, -GATE_HALF),
  (() => { const banner = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, (GATE_HALF * 2) + 0.08), [checkered(8, 1), checkered(8, 1), EDGE, EDGE, EDGE, EDGE]); banner.position.set(0, 0.47, 0); return banner; })(),
  (() => { const flag = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), CORAL); flag.position.set(0, 0.59, GATE_HALF); return flag; })(),
  (() => { const flag = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), MUSTARD); flag.position.set(0, 0.59, -GATE_HALF); return flag; })(),
));
// a jump, for a race running east: a wedge of folded card
const rampPiece = shadowed((() => {
  const profile = new THREE.Shape();
  profile.moveTo(RAMP_FROM, 0); profile.lineTo(RAMP_LIP, 0); profile.lineTo(RAMP_LIP, RAMP_HEIGHT); profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, { depth: RAMP_HALF * 2, bevelEnabled: false });
  geometry.translate(0, TOP, -RAMP_HALF);
  return group(new THREE.Mesh(geometry, [EDGE, MUSTARD]), ...chevron(-0.42));
})());
// a crossing's two roads, each of which bends to its own height
crossPiece.children[0].userData.road = crossPiece.children[2].userData.road = ROAD_EAST_WEST;
crossPiece.children[1].userData.road = crossPiece.children[3].userData.road = ROAD_NORTH_SOUTH;
/** a piece set on its tile, bent to how the tile's road lies: every part is lifted to
 *  the road's height where it is */
const bend = (piece, tile, tx, ty) => {
  const bent = new THREE.Group();
  piece.updateMatrixWorld(true);
  piece.traverse((part) => {
    if(!part.isMesh) return/*a group*/;
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld), spot = geometry.attributes.position;
    const road = part.userData.road || ROAD_NORTH_SOUTH, highAt = (x, z) => roadHigh(tile, tx, ty, x, z, road);
    for(let index=0; index<spot.count; index++) spot.setY(index, spot.getY(index) + highAt(spot.getX(index), spot.getZ(index)));
    geometry.computeVertexNormals();
    // a face that looks up takes the slope of the road under it, so a bent piece is
    // lit as one smooth surface and not as the flat cuts it is made of
    const facing = geometry.attributes.normal, reach = 0.02;
    for(let index=0; index<spot.count; index++) {
      if(facing.getY(index) < 0.5) continue/*a cut edge*/;
      const x = spot.getX(index), z = spot.getZ(index), fallX = (highAt(x + reach, z) - highAt(x - reach, z)) / (reach * 2), fallZ = (highAt(x, z + reach) - highAt(x, z - reach)) / (reach * 2), size = Math.hypot(fallX, 1, fallZ);
      facing.setXYZ(index, -fallX / size, 1 / size, -fallZ / size);
    }
    const mesh = new THREE.Mesh(geometry, part.material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.isOwn = true/*its shape is this tile's alone*/;
    bent.add(mesh);
  });
  return bent;
};
/** how far a piece is turned for a race running `heading`, when it is made for east */
const turnFor = (heading) => -((heading - EAST + 4) % 4) * Math.PI / 2;

// a tree: a rolled trunk and two cones of folded card
const trunkShape = new THREE.CylinderGeometry(0.028, 0.036, 0.12, 6), lowShape = new THREE.ConeGeometry(0.17, 0.24, 7), highShape = new THREE.ConeGeometry(0.12, 0.2, 7), bushShape = new THREE.DodecahedronGeometry(0.085);
const makeTree = (random) => {
  const leaves = LEAVES[Math.floor(random() * LEAVES.length)], size = 0.8 + (random() * 0.55);
  const trunk = new THREE.Mesh(trunkShape, TRUNK), low = new THREE.Mesh(lowShape, leaves), high = new THREE.Mesh(highShape, leaves);
  trunk.position.y = 0.06; low.position.y = 0.22; high.position.y = 0.37; high.rotation.y = 0.4;
  const tree = shadowed(group(trunk, low, high));
  tree.scale.setScalar(size); tree.rotation.y = random() * Math.PI;
  return tree;
};

// -- The World -------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: scene, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.02;
const world = new THREE.Scene();
world.background = new THREE.Color(0xb8956a); world.fog = new THREE.Fog(0xb8956a, 20, 60);
const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 160);

// a warm lamp over the far left of the table, and the room's own light. The lamp's
// shadows are drawn round what is looked at, and move a whole grain of the shadow at
// a time, so they never crawl
const LAMP_FROM = new THREE.Vector3(-6, 11, -4.5), SHADOW_GRAINS = 2048;
const lamp = new THREE.DirectionalLight(0xfff0d8, 2.7);
lamp.castShadow = true; lamp.shadow.mapSize.set(SHADOW_GRAINS, SHADOW_GRAINS);
lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.012; lamp.shadow.radius = 2.5;
world.add(lamp, lamp.target, new THREE.HemisphereLight(0xfffaf0, 0xd9b98c, 1.35));
const lampAcross = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LAMP_FROM).normalize(), lampUp = new THREE.Vector3().crossVectors(LAMP_FROM, lampAcross).normalize();
let lampReach = 0;
/** lights what lies within `reach` of a place */
const aimLamp = (at, reach) => {
  if(reach !== lampReach) {
    lampReach = reach;
    Object.assign(lamp.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 60 });
    lamp.shadow.camera.updateProjectionMatrix();
  } /* else -- as wide as it was */
  const grain = (reach * 2) / SHADOW_GRAINS, across = at.dot(lampAcross), up = at.dot(lampUp);
  lamp.target.position.copy(at).addScaledVector(lampAcross, (Math.round(across / grain) * grain) - across).addScaledVector(lampUp, (Math.round(up / grain) * grain) - up);
  lamp.position.copy(lamp.target.position).add(LAMP_FROM);
};

// the table, the mat on it (as wide and long as the track laid), and what was left
// lying about beside it
let wide = 0, long = 0/*no mat laid yet*/;
const middle = new THREE.Vector3();
const table = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), paper(0xffffff, { map: kraft }));
table.rotation.x = -Math.PI / 2; table.receiveShadow = true;
kraft.repeat.set(12, 12);
world.add(table);
let mat = null, beside = null/*nothing laid yet*/;
const layMat = (newWide, newLong) => {
  if(mat) { world.remove(mat, beside); mat.geometry.dispose(); mat.material[2].map.dispose(); mat.material[2].dispose(); }
  wide = newWide; long = newLong;
  middle.set(wide / 2, 0, long / 2);
  table.position.set(middle.x, -0.045, middle.z);
  mat = new THREE.Mesh(new THREE.BoxGeometry(wide + (MAT_MARGIN * 2), 0.045, long + (MAT_MARGIN * 2)), [TEAL, TEAL, paper(0xffffff, { map: paintMat(wide, long) }), TEAL, TEAL, TEAL]);
  mat.position.set(middle.x, -0.0225, middle.z); mat.castShadow = true; mat.receiveShadow = true;

  beside = new THREE.Group();
  {
    // a pencil
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 2.9, 6), MUSTARD), wood = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 6), paper(0xe6c79a)), lead = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), TIRE);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.16, 12), paper(0xb9bcc4, { roughness: 0.5, metalness: 0.4 })), rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.2, 12), paper(0xf09a9a));
    wood.position.y = 1.6; lead.position.y = 1.72; band.position.y = -1.53; rubber.position.y = -1.7;
    const pencil = group(barrel, wood, lead, band, rubber);
    pencil.rotation.set(Math.PI / 2, 0, 0.18); pencil.position.set(-1.05, 0.04, long * 0.62);
    beside.add(pencil);
    // a roll of masking tape
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 10, 28), paper(0xe9d9a6));
    roll.rotation.x = Math.PI / 2; roll.scale.z = 1.5; roll.position.set(wide + 1.15, 0.15, 1.5);
    beside.add(roll);
    // offcuts
    const random = randomFrom(21), cuts = [CORAL, MUSTARD, MINT, SKY, CARD];
    for(let scrap=0; scrap<14; scrap++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.2 + (random() * 0.3), 0.04 * random()); shape.lineTo(0.1 + (random() * 0.2), 0.16 + (random() * 0.24)); shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      const cut = new THREE.Mesh(geometry, [cuts[scrap % cuts.length], EDGE]), side = (random() < 0.5) ? -1 : 1;
      cut.position.set((side < 0) ? -0.9 - (random() * 1.6) : wide + 0.9 + (random() * 1.6), -0.04, (random() * (long + 2)) - 1);
      cut.rotation.y = random() * Math.PI * 2;
      beside.add(cut);
    }
  }
  world.add(mat, shadowed(beside));
};

// -- The Car ---------------------------------------------------------------------
/** a car folded from card, facing east. It turns about its own middle, so it can lie
 *  on a hill or tumble through the air; its body leans on its wheels in a turn */
const CAR_MIDDLE = 0.07/*above the ground under its wheels*/;
const painted = new Map();
/** card of a color: one sheet for every part cut from it */
const cardOf = (color) => { if(!painted.has(color)) painted.set(color, paper(color)); return painted.get(color); };
/** a car of a fit (SEE: fitOf), or the pale ghost of one */
const makeCar = (fit, isGhost) => {
  const body = new THREE.Group(), shell = new THREE.Group(), whole = new THREE.Group();
  const paintwork = cardOf(PAINTS[fit.paint].color), stripe = cardOf(PAINTS[fit.paint].stripe);
  /** a box of card standing on `y`, its nose tipped up by `nose` */
  const part = (width, height, depth, face, x, y, z, nose = 0) => {
    // folded, not cut: a car shows its color on every side
    const made = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), isGhost ? GHOST : face);
    made.position.set(x, y + (height / 2), z); made.rotation.z = nose;
    body.add(made);
  };
  /** what a ghost does without: glass, stripes and the like */
  const trim = (...box) => { if(!isGhost) part(...box); };
  /** a part whose side is cut to an outline (ahead and up, point by point), `depth` across */
  const cut = (outline, depth, face) => {
    const side = new THREE.Shape();
    outline.forEach(([x, y], index) => { if(index === 0) side.moveTo(x, y); else side.lineTo(x, y); });
    const geometry = new THREE.ExtrudeGeometry(side, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    body.add(new THREE.Mesh(geometry, isGhost ? GHOST : face));
  };
  part(0.36, 0.045, 0.19, paintwork, 0, 0.03, 0)/*the floor*/;
  trim(0.3, 0.004, 0.15, TIRE, 0, 0.026, 0)/*its underside, seen when it is over*/;
  let engineAt = [0, 0]/*where a big engine stands out of the body: ahead, and how high*/;
  if(fit.shape === 'pickup') {
    part(0.12, 0.03, 0.17, paintwork, 0.12, 0.075, 0)/*the hood*/;
    part(0.11, 0.075, 0.17, paintwork, 0.005, 0.075, 0)/*the cab*/;
    part(0.13, 0.04, 0.012, paintwork, -0.115, 0.075, 0.089); part(0.13, 0.04, 0.012, paintwork, -0.115, 0.075, -0.089)/*the sides of its bed*/;
    part(0.012, 0.04, 0.19, paintwork, -0.174, 0.075, 0)/*and its gate*/;
    trim(0.06, 0.034, 0.08, TRUNK, -0.1, 0.075, 0.02)/*a box in the bed*/;
    trim(0.006, 0.045, 0.14, GLASS, 0.063, 0.092, 0)/*the windshield*/;
    trim(0.07, 0.04, 0.006, GLASS, 0.005, 0.094, 0.086); trim(0.07, 0.04, 0.006, GLASS, 0.005, 0.094, -0.086);
    trim(0.006, 0.035, 0.12, GLASS, -0.053, 0.1, 0);
    trim(0.12, 0.004, 0.045, stripe, 0.12, 0.105, 0); trim(0.11, 0.004, 0.045, stripe, 0.005, 0.15, 0)/*the stripe*/;
    engineAt = [0.125, 0.105];
  } else if(fit.shape === 'wedge') {
    // one fold from a low nose up to a flat tail
    const NOSE = 0.088, TAIL = 0.135, FOLD = -0.03, slope = Math.atan2(TAIL - NOSE, 0.18 - FOLD), highAt = (x) => NOSE + ((0.18 - x) / (0.18 - FOLD) * (TAIL - NOSE));
    cut([[0.18, 0.075], [0.18, NOSE], [FOLD, TAIL], [-0.18, TAIL], [-0.18, 0.075]], 0.18, paintwork);
    part(0.05, 0.02, 0.012, paintwork, -0.152, TAIL, 0.082); part(0.05, 0.02, 0.012, paintwork, -0.152, TAIL, -0.082)/*the fins*/;
    trim(0.1, 0.004, 0.13, GLASS, 0.045, highAt(0.045), 0, -slope)/*the canopy*/;
    trim(0.05, 0.004, 0.045, stripe, 0.148, highAt(0.148), 0, -slope); trim(0.15, 0.004, 0.045, stripe, -0.105, TAIL, 0)/*the stripe*/;
    engineAt = [-0.09, TAIL];
  } else if(fit.shape === 'van') {
    part(0.07, 0.04, 0.17, paintwork, 0.145, 0.075, 0)/*the nose*/;
    part(0.29, 0.075, 0.18, paintwork, -0.035, 0.075, 0)/*the box*/;
    trim(0.006, 0.04, 0.15, GLASS, 0.113, 0.1, 0)/*the windshield*/;
    for(const aside of [0.091, -0.091]) { trim(0.07, 0.035, 0.006, GLASS, 0.06, 0.1, aside); trim(0.1, 0.035, 0.006, GLASS, -0.06, 0.1, aside); }
    trim(0.29, 0.004, 0.045, stripe, -0.035, 0.15, 0); trim(0.07, 0.004, 0.045, stripe, 0.145, 0.115, 0)/*the stripe*/;
    engineAt = [0.145, 0.115];
  } else {
    part(0.11, 0.03, 0.17, paintwork, 0.115, 0.075, 0)/*the hood*/;
    part(0.16, 0.075, 0.16, paintwork, -0.03, 0.075, 0)/*the cabin*/;
    part(0.07, 0.03, 0.17, paintwork, -0.145, 0.075, 0)/*the trunk*/;
    part(0.02, 0.012, 0.2, paintwork, -0.172, 0.14, 0)/*the wing*/;
    part(0.012, 0.035, 0.012, LINE, -0.172, 0.105, 0.07); part(0.012, 0.035, 0.012, LINE, -0.172, 0.105, -0.07);
    trim(0.006, 0.045, 0.13, GLASS, 0.052, 0.092, 0)/*the windshield*/;
    trim(0.1, 0.04, 0.006, GLASS, -0.03, 0.094, 0.081); trim(0.1, 0.04, 0.006, GLASS, -0.03, 0.094, -0.081);
    trim(0.11, 0.004, 0.045, stripe, 0.115, 0.105, 0); trim(0.16, 0.004, 0.045, stripe, -0.03, 0.15, 0); trim(0.07, 0.004, 0.045, stripe, -0.145, 0.105, 0)/*the stripe*/;
    engineAt = [0.115, 0.105];
  }
  // its set-up shows: a big engine stands out of the body, sticky tires are fat
  if(fit.kit === 'engine') {
    trim(0.05, 0.026, 0.075, TIRE, engineAt[0], engineAt[1], 0);
    trim(0.014, 0.024, 0.014, LINE, engineAt[0] + 0.012, engineAt[1] + 0.026, 0.02); trim(0.014, 0.024, 0.014, LINE, engineAt[0] - 0.012, engineAt[1] + 0.026, -0.02);
  } /* else -- an engine that fits under its hood */
  shell.add(body);
  const isFat = (fit.kit === 'tires'), round = isFat ? 0.052 : 0.046, across = isFat ? 0.05 : 0.034, out = isFat ? 0.008 : 0;
  const wheelShape = new THREE.CylinderGeometry(round, round, across, 12), hubShape = new THREE.CylinderGeometry(0.02, 0.02, across + 0.004, 8);
  for(const [x, z] of [[WHEEL_AHEAD, WHEEL_ASIDE + out], [WHEEL_AHEAD, -WHEEL_ASIDE - out], [-WHEEL_AHEAD, WHEEL_ASIDE + out], [-WHEEL_AHEAD, -WHEEL_ASIDE - out]]) {
    const wheel = new THREE.Mesh(wheelShape, isGhost ? GHOST : TIRE);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(x, round, z);
    shell.add(wheel);
    if(!isGhost) { const hub = new THREE.Mesh(hubShape, LINE); hub.rotation.x = Math.PI / 2; hub.position.set(x, round, z); shell.add(hub); }
  }
  shell.position.y = -CAR_MIDDLE;
  whole.add(shell);
  whole.rotation.order = 'YZX'/*turned to its heading, then nose up, then rolled*/;
  if(!isGhost) shadowed(whole);
  return { whole, body };
};
/** stands a car where it is: `pitch` is nose up, `roll` is tipped to its right */
const pose = (model, x, y, z, heading, pitch, roll) => {
  model.whole.rotation.set(roll, -heading, pitch);
  // its middle stands as far above the ground as the part of it that is lowest:
  // its wheels, a side, its roof or its nose
  model.whole.updateMatrix();
  const turned = model.whole.matrix.elements;
  model.whole.position.set(x, y + (CAR_MIDDLE * Math.abs(turned[5])) + (0.12 * Math.abs(turned[9])) + (0.18 * Math.max(0, Math.abs(turned[1]) - 0.45) / 0.55), z);
};
let carModel = makeCar(fit, false);
const ghostModel = makeCar(NEW_FIT, true);
ghostModel.whole.visible = false;
world.add(carModel.whole, ghostModel.whole);
/** the car as it is now fitted out, in place of the one before */
const dressCar = () => {
  world.remove(carModel.whole);
  carModel.whole.traverse((part) => { if(part.isMesh) part.geometry.dispose(); });
  carModel = makeCar(fit, false);
  world.add(carModel.whole);
};

// confetti: scraps of card thrown for a record
const confetti = [];
{
  const scrapShape = new THREE.PlaneGeometry(0.07, 0.05), colors = [0xef5b4c, 0xf2c14e, 0x9ad0a8, 0x7cc4d8, 0xfdfaf3].map(color => paper(color, { side: THREE.DoubleSide }));
  for(let scrap=0; scrap<54; scrap++) {
    const mesh = new THREE.Mesh(scrapShape, colors[scrap % colors.length]);
    mesh.visible = false; mesh.castShadow = true;
    world.add(mesh);
    confetti.push({ mesh, vx: 0, vy: 0, vz: 0, spin: 0, left: 0 });
  }
}
const throwConfetti = (x, z) => confetti.forEach(scrap => {
  const angle = Math.random() * Math.PI * 2, out = 0.6 + (Math.random() * 1.6);
  Object.assign(scrap, { vx: Math.cos(angle) * out, vz: Math.sin(angle) * out, vy: 2.4 + (Math.random() * 2.4), spin: (Math.random() - 0.5) * 18, left: 1.8 + (Math.random() * 0.8) });
  scrap.mesh.position.set(x, 0.25, z); scrap.mesh.visible = true;
});

// -- The Track on the Mat --------------------------------------------------------
// the track being raced or built: its tiles, the way round it (when it has one), and
// what stands on the mat beside it
let tiles = emptyTiles(NEW_WIDE, NEW_LONG), route = { ok: false, why: '' };
let laidTrack = new THREE.Group(), standing = []/*what a car cannot drive through: each `{ x, z, radius, from, to, tree?, shake }`*/;
world.add(laidTrack);
const markShape = new THREE.PlaneGeometry(0.52, 0.52);

/** lays the tiles' pieces on the mat, and trees on the bare tiles beside the road */
const layTrack = () => {
  laidTrack.traverse((part) => { if(part.isMesh && part.userData.isOwn) part.geometry.dispose(); });
  world.remove(laidTrack);
  laidTrack = new THREE.Group(); standing = [];
  if((tiles[0].length !== wide) || (tiles.length !== long)) layMat(tiles[0].length, tiles.length);
  route = routeOf(tiles);
  survey(tiles, route);
  const isBuilt = (mode === 'build');
  for(let y=0; y<long; y++) {
    for(let x=0; x<wide; x++) {
      const tile = tiles[y][x], random = randomFrom((y * 31) + x + 5);
      const place = (piece, turn, high) => { piece.position.set(x + 0.5, high, y + 0.5); piece.rotation.y = turn; return piece; };
      if(tile.open === 0) {
        // bare mat: trees, where the road runs past
        const isBeside = [NORTH, EAST, SOUTH, WEST].some(side => { const next = tiles[y + DZ[side]] && tiles[y + DZ[side]][x + DX[side]]; return next && (next.open !== 0); });
        const count = isBeside ? Math.floor(random() * 3.4) : (random() < 0.12) ? 1 : 0;
        for(let planted=0; planted<count; planted++) {
          const tx = x + 0.5 + ((random() - 0.5) * 0.56), tz = y + 0.5 + ((random() - 0.5) * 0.56);
          if(standing.some(other => Math.hypot(other.x - tx, other.z - tz) < 0.26)) continue/*no room beside the last*/;
          const tree = makeTree(random);
          tree.position.set(tx, 0, tz);
          laidTrack.add(tree);
          standing.push({ x: tx, z: tz, radius: TREE_RADIUS, from: 0, to: 0.4, tree, shake: 0 });
        }
        continue;
      } /* else -- road */

      // flat on the mat a piece lies as it was made; raised, it is bent to its hill
      // and stood on stilts
      // (being built, the whole track lies flat, each raised tile under its number: seen
      // from above, road standing at its height would lie beside where it is)
      const middle = isBuilt ? 0 : LEVEL_HIGH * ((tile.open === 15) ? Math.max(...tile.roads) : tile.level), isRaised = !isBuilt && ((middle > 0) || tile.joints.some(joint => joint > 0));
      const lay = (piece, turn) => laidTrack.add(isRaised ? bend(place(piece, turn, 0), tile, x, y) : place(piece, turn, 0));
      if(tile.open === EAST_WEST) lay(straightPiece.clone(), 0);
      else if(tile.open === NORTH_SOUTH) lay(straightPiece.clone(), Math.PI / 2);
      else if(tile.open === 15) lay(crossPiece.clone(), 0);
      else if(isFork(tile)) lay(forkPiece.clone(), -[14, 13, 11, 7].indexOf(tile.open) * Math.PI / 2);
      else if(tile.open in GLYPH_OF_OPEN) lay(cornerPiece.clone(), -[3, 6, 12, 9].indexOf(tile.open) * Math.PI / 2);
      else {
        // a loose end: the road as far as it goes, on card of a warning color
        const loose = group(box(CARD_HALF * 2, BASE, CARD_HALF * 2, LOOSE));
        for(let side=0; side<4; side++) {
          if(!(tile.open & sideBit(side))) continue/*no road that way*/;
          loose.add(box(DX[side] ? 0.5 : ROAD_HALF * 2, TOP - BASE, DZ[side] ? 0.5 : ROAD_HALF * 2, ROAD, DX[side] * 0.25, BASE, DZ[side] * 0.25));
        }
        laidTrack.add(place(shadowed(loose), 0, middle));
      }
      // stilts under each raised joint this tile shares with the next one east or south:
      // a leg either side of the road and a beam between them, with the way beneath clear
      for(const side of [EAST, SOUTH]) {
        const high = tile.joints[side];
        if(isBuilt || !(tile.open & sideBit(side)) || (high < 0.06)) continue/*lying flat, no road that way, or on the mat*/;
        const jx = x + 0.5 + (DX[side] * 0.5), jz = y + 0.5 + (DZ[side] * 0.5), isAcrossZ = (side === EAST);
        for(const aside of [-CARD_HALF + 0.03, CARD_HALF - 0.03]) laidTrack.add(shadowed(box(0.05, high, 0.05, CARD, jx + (isAcrossZ ? 0 : aside), 0, jz + (isAcrossZ ? aside : 0))));
        laidTrack.add(shadowed(box(isAcrossZ ? 0.05 : CARD_HALF * 2, 0.03, isAcrossZ ? CARD_HALF * 2 : 0.05, CARD, jx, high - 0.03, jz)));
      }
      if(tile.start >= 0) {
        // the start gate, whose posts stand in a car's way
        laidTrack.add(place(startPiece.clone(), turnFor(tile.start), middle));
        for(const aside of [-GATE_HALF, GATE_HALF]) standing.push({ x: x + 0.5 + (DZ[tile.start] * aside), z: y + 0.5 - (DX[tile.start] * aside), radius: POST_RADIUS, from: middle, to: middle + 0.5, shake: 0 });
      } /* else -- no start line */
      if(tile.jump) laidTrack.add(place(rampPiece.clone(), turnFor(tile.runs), middle));
      if(isBuilt && !(tile.open in GLYPH_OF_OPEN)) {
        // being built, a loose end is marked: what keeps the track from racing
        const mark = new THREE.Mesh(markShape, FAULT_MARK);
        mark.rotation.x = -Math.PI / 2; mark.scale.setScalar(1.3); mark.position.set(x + 0.5, middle + TOP + 0.05, y + 0.5);
        laidTrack.add(mark);
      } else if(isBuilt && (tile.open !== 15) && (tile.level > 0)) {
        // and a raised tile says how high it stands
        const mark = new THREE.Mesh(markShape, LEVEL_MARKS[tile.level - 1]);
        mark.rotation.x = -Math.PI / 2; mark.position.set(x + 0.5, middle + TOP + 0.03, y + 0.5);
        laidTrack.add(mark);
      } /* else -- raced, a crossing, or flat on the mat */
    }
  }
  world.add(laidTrack);
};
/** the ground under something `y` high at a place on the mat as laid */
const groundHere = (x, z, y) => groundAt(tiles, x, z, y);
/** how high the road of a step of the route stands at a place on it */
const roadTopOf = (step, x, z) => roadHigh(tiles[step.y][step.x], step.x, step.y, x, z, step.road) + DECK;

// -- Driving ---------------------------------------------------------------------
// the car: where it is and how it moves, how it lies (`pitch` nose up, `roll` tipped
// to its right) and how fast it is turning over, which stretch of the route it has
// reached (`at`), and how its body sits (`ride` is how far over the ground under its middle
// its wheels carry it)
const car = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, heading: 0, pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, isGrounded: true, under: 0, ride: 0, wreck: 0, righting: 0, fromPitch: 0, fromRoll: 0, at: null/*on no route*/, linePart: NaN, lostFor: 0, stuckFor: 0, lean: 0, squash: 0 };
// the lap being driven: whether its clock runs, its time, and where the car has been
const lap = { running: false, clock: 0, samples: [], sampledAt: 0 };
let racing = false/*the countdown is still running, or nothing is raced*/;
const isUpright = () => (Math.cos(car.roll) * Math.cos(car.pitch)) > 0.4;
// the car's body: its middle and its four corners, ahead of and beside its middle
const BODY = [[0, 0], [BODY_AHEAD, BODY_ASIDE], [BODY_AHEAD, -BODY_ASIDE], [-BODY_AHEAD, BODY_ASIDE], [-BODY_AHEAD, -BODY_ASIDE]];
/** where each part of the car's body stands, when its middle is at a place */
const bodyAt = (x, z, heading) => { const fx = Math.cos(heading), fz = Math.sin(heading); return BODY.map(([ahead, aside]) => [x + (fx * ahead) - (fz * aside), z + (fz * ahead) + (fx * aside)]); };
/** whether a wall keeps the car from being moved to a place and a heading: whether
 *  any part of its body would cross one on its own way there, from where that part is
 *  and the ground it stands on (so the back of a jump the car is driving off, still
 *  under its rear, is none) */
const isCarBarred = (x, z, heading) => {
  const isFlying = !car.isGrounded, from = bodyAt(car.x, car.z, car.heading), to = bodyAt(x, z, heading);
  // (each part starts from the ground under it, found by walking there from the car's
  // middle: up a steep hill that is well above the ground under the middle, and a car
  // hopping just clear of the hill is over it all the same. A road overhead is never it)
  return from.some(([px, pz], part) => { const under = groundToward(tiles, car.x, car.z, car.y, px, pz, false); return isWalled(tiles, px, pz, isFlying ? Math.max(car.y, under) : under, to[part][0], to[part][1], isFlying); });
};

/** how a car at a place lies on the ground under its four wheels. A wheel with the
 *  ground far beneath it hangs: it says nothing of how the car lies, and pulls the car
 *  over its way (`dive` nose down or up, `tip` to the right or the left) */
const lieOf = (x, z, y, heading) => {
  const fx = Math.cos(heading), fz = Math.sin(heading);
  // (a wheel stands on the ground reached by walking to it from the car's middle: so
  // on a jump the car is creeping off, and never on a road overhead)
  const under = (ahead, aside) => { const high = groundToward(tiles, x, z, y, x + (fx * ahead) - (fz * aside), z + (fz * ahead) + (fx * aside), true); return (high < y - HANGING) ? null : high; };
  const frontLeft = under(WHEEL_AHEAD, -WHEEL_ASIDE), frontRight = under(WHEEL_AHEAD, WHEEL_ASIDE), rearLeft = under(-WHEEL_AHEAD, -WHEEL_ASIDE), rearRight = under(-WHEEL_AHEAD, WHEEL_ASIDE);
  const mean = (one, other) => (one === null) ? other : (other === null) ? one : (one + other) / 2;
  const front = mean(frontLeft, frontRight), rear = mean(rearLeft, rearRight), left = mean(frontLeft, rearLeft), right = mean(frontRight, rearRight);
  const held = [frontLeft, frontRight, rearLeft, rearRight].filter(high => high !== null);
  return {
    // how high the ground stands under its wheels, taken together
    high: held.length ? held.reduce((sum, high) => sum + high, 0) / held.length : null,
    pitch: ((front !== null) && (rear !== null)) ? Math.atan2(front - rear, WHEEL_AHEAD * 2) : null,
    roll: ((left !== null) && (right !== null)) ? Math.atan2(left - right, WHEEL_ASIDE * 2) : null,
    dive: ((front === null) ? -1 : 0) + ((rear === null) ? 1 : 0),
    tip: ((right === null) ? 1 : 0) + ((left === null) ? -1 : 0),
  };
};

/** sets the car down on a stretch of the route, as dropped from a hand */
const setDown = (stretch, part, drop) => {
  const place = along(stretch, part), ground = roadTopOf(stretch, place.x, place.z);
  Object.assign(car, { x: place.x, z: place.z, heading: place.heading, vx: 0, vz: 0, vy: 0, y: ground + drop, under: ground, isGrounded: drop <= 0, pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, ride: 0, wreck: 0, righting: 0, lean: 0, squash: 0, at: stretch, linePart: (stretch === route.first) ? part - 0.5 : NaN, lostFor: 0, stuckFor: 0 });
};
/** the car on the grid, a little before the start line, with no lap begun */
const toGrid = () => {
  Object.assign(lap, { running: false, clock: 0, samples: [], sampledAt: 0 });
  if(route.ok) setDown(route.first, 0.18, 0);
};
/** the car back on the road where it last was */
const putBack = () => { if(route.ok && car.at) setDown(car.at, (car.at === route.first) ? 0.18 : 0.5, 0.45); };
/** a wrecked car is turned back onto its wheels where it lies: lifted a little, turned
 *  level and set down, over `RIGHTING_SECONDS`. Nothing else moves it meanwhile */
const righting = (seconds) => {
  car.righting = Math.max(0, car.righting - seconds);
  const done = 1 - (car.righting / RIGHTING_SECONDS), ground = groundHere(car.x, car.z, car.y);
  Object.assign(car, { vx: 0, vz: 0, vy: 0, y: ground, under: ground, isGrounded: true, pitch: car.fromPitch * (1 - eased(done)), roll: car.fromRoll * (1 - eased(done)), ride: Math.sin(done * Math.PI) * 0.2, lean: 0 });
};
/** a car off its wheels is flipped back at once (it does so itself, given a moment) */
const flipBack = () => { if(car.wreck > 0) car.wreck = Math.min(car.wreck, 0.02); };

/** the car comes down at `speed`: on its wheels it drives on; on its side or its roof
 *  it is wrecked, and bounces. Gives how fast it leaves the ground again */
const land = (speed) => {
  car.squash = Math.min(1, speed * 0.28);
  if(isUpright()) { car.pitch = turnBetween(0, car.pitch); car.roll = turnBetween(0, car.roll); car.pitchRate = 0; car.rollRate = 0; return 0; }
  car.wreck = WRECK_SECONDS;
  car.vx *= 0.6; car.vz *= 0.6; car.pitchRate *= 0.4; car.rollRate *= 0.4;
  return (speed > 0.7) ? Math.min(2.2, speed * 0.32) : 0;
};

let onLapDone = () => {}/*set once laps are kept*/;
/** moves the car through `seconds` of its pull, the road's grip and its hills, and
 *  what it hits */
const drive = (seconds) => {
  if(car.righting > 0) { righting(seconds); lapOn(seconds); return; }
  const pull = tiltNow(), strength = Math.min(1, Math.hypot(pull.x, pull.y)), kit = KITS[fit.kit];
  const speed = Math.hypot(car.vx, car.vz), isDriven = car.isGrounded && isUpright() && (car.wreck <= 0);
  // on the road: over its width, and on it (not on the mat beneath a raised one)
  const onRoad = car.isGrounded && isRoad(tiles, car.x, car.z, ROAD_HALF + CAR_ROOM) && (car.y > 0.02);
  let turned = 0;
  if(isDriven) {
    let fx = Math.cos(car.heading), fz = Math.sin(car.heading);
    if(strength > 0.02) {
      const turn = turnBetween(car.heading, Math.atan2(pull.y, pull.x)), ahead = (car.vx * fx) + (car.vz * fz);
      if((Math.abs(turn) > BRAKE_ANGLE) && (ahead > BRAKE_SPEED)) {
        // tipped back against its travel: it brakes before it turns round
        const slowed = Math.max(0, speed - (BRAKE * strength * seconds)) / (speed || 1);
        car.vx *= slowed; car.vz *= slowed;
      } else {
        // it noses toward the tip, and drives the way it faces. Its tires carry most of
        // its speed round with it; what they do not carry slides, and the grip below
        // wears that away
        turned = clamp(turn, -kit.turn * seconds, kit.turn * seconds) * (0.4 + (0.6 * strength));
        // (it cannot swing a corner of its body into what bars its way)
        if(isCarBarred(car.x, car.z, car.heading + turned)) turned = 0;
        car.heading += turned;
        const carried = turned * (onRoad ? kit.carry : kit.roughCarry), cos = Math.cos(carried), sin = Math.sin(carried);
        [car.vx, car.vz] = [(car.vx * cos) - (car.vz * sin), (car.vx * sin) + (car.vz * cos)];
        fx = Math.cos(car.heading); fz = Math.sin(car.heading);
        const push = kit.thrust * strength * (0.35 + (0.65 * Math.max(0, Math.cos(turn)))) * seconds;
        car.vx += fx * push; car.vz += fz * push;
      }
    } /* else -- held level: it coasts */
    // across its heading the tires hold; along it the road drags, and bare mat far more
    const forward = ((car.vx * fx) + (car.vz * fz)) * Math.exp(-(onRoad ? ROAD_DRAG : ROUGH_DRAG) * seconds),
          sideways = ((car.vz * fx) - (car.vx * fz)) * Math.exp(-(onRoad ? kit.grip : kit.roughGrip) * seconds);
    car.vx = (forward * fx) - (sideways * fz); car.vz = (forward * fz) + (sideways * fx);
    car.lean += ((clamp((sideways * 0.22) + (turned / seconds * 0.02), -0.3, 0.3)) - car.lean) * 0.12;
    // a hill pulls it down the way it falls (an edge is no hill): never so hard that a
    // car driven flat out cannot climb it, so no road a person builds can trap the car
    const reach = 0.05, fallX = (groundHere(car.x + reach, car.z, car.y) - groundHere(car.x - reach, car.z, car.y)) / (reach * 2), fallZ = (groundHere(car.x, car.z + reach, car.y) - groundHere(car.x, car.z - reach, car.y)) / (reach * 2), steep = Math.hypot(fallX, fallZ);
    if((steep > 0) && (steep < STEEPEST * 1.4)) { const pulled = Math.min(GRAVITY * steep, kit.thrust * HILL_HOLD) / steep; car.vx -= pulled * fallX * seconds; car.vz -= pulled * fallZ * seconds; }
  } else if(car.isGrounded) {
    // off its wheels: it slides to rest
    const slid = Math.exp(-3.5 * seconds);
    car.vx *= slid; car.vz *= slid; car.lean *= 0.9;
  } /* else -- in the air: nothing steers it */

  // it moves; a wall stops it (the side of a raised road, the back and the sides of a
  // jump), and it bounces off
  let nextX = car.x + (car.vx * seconds), nextZ = car.z + (car.vz * seconds);
  const isStopped = (x, z) => isCarBarred(x, z, car.heading);
  if(isStopped(nextX, nextZ)) {
    if(!isStopped(nextX, car.z)) { nextZ = car.z; car.vz *= -BOUNCE; }
    else if(!isStopped(car.x, nextZ)) { nextX = car.x; car.vx *= -BOUNCE; }
    else { nextX = car.x; nextZ = car.z; car.vx *= -BOUNCE; car.vz *= -BOUNCE; }
  } /* else -- nothing in its way */
  const moved = Math.hypot(nextX - car.x, nextZ - car.z);
  car.x = nextX; car.z = nextZ;

  // it falls, and the ground carries it. Carried up a hill it keeps that rise, so over
  // a crest, off a jump's lip or off the edge of a raised road it flies. Beneath a
  // road it cannot rise through it
  const was = car.y, ground = groundHere(car.x, car.z, was), wasGrounded = car.isGrounded;
  car.vy -= GRAVITY * seconds; car.y += car.vy * seconds;
  for(const [px, pz] of bodyAt(car.x, car.z, car.heading)) for(const top of roadsAt(tiles, px, pz)) if((was + CAR_TALL <= top - DECK) && (car.y + CAR_TALL > top - DECK)) { car.y = top - DECK - CAR_TALL; car.vy = Math.min(0, car.vy); }
  if(car.y <= ground) {
    const rise = ground - car.under;
    car.y = ground;
    car.vy = !wasGrounded ? land(-car.vy) : (Math.abs(rise) <= (STEEPEST * moved) + 1e-4) ? rise / seconds : 0/*an edge mounted, not a hill climbed*/;
    car.isGrounded = true;
  } else car.isGrounded = (car.y - ground) < 0.01;
  car.under = ground;
  car.squash *= Math.exp(-seconds * 9);

  // how it lies. On its wheels it settles to the ground under them, and a wheel that
  // hangs pulls it over; in the air it turns as it left the ground; off its wheels it
  // rocks to rest, and then flips itself back
  if(car.isGrounded && !isUpright() && (car.wreck <= 0)) car.wreck = WRECK_SECONDS;
  if(!car.isGrounded || (car.wreck > 0)) car.ride *= Math.exp(-20 * seconds);
  if(!car.isGrounded) {
    // flying steadily, its nose follows its flight; tumbling, it tumbles
    if(isUpright() && (Math.abs(car.pitchRate) < 3) && (Math.abs(car.rollRate) < 3)) {
      const flight = clamp(Math.atan2(car.vy, Math.max(speed, 1.5)), -0.7, 0.7);
      car.pitchRate += ((turnBetween(car.pitch, flight) * 30) - (car.pitchRate * 9)) * seconds;
      car.rollRate += ((turnBetween(car.roll, 0) * 30) - (car.rollRate * 9)) * seconds;
    } /* else -- turning over */
    car.pitchRate = clamp(car.pitchRate, -TUMBLE, TUMBLE); car.rollRate = clamp(car.rollRate, -TUMBLE, TUMBLE);
    car.pitch += car.pitchRate * seconds; car.roll += car.rollRate * seconds;
  } else if(car.wreck > 0) {
    const rocked = Math.exp(-7 * seconds);
    car.pitchRate *= rocked; car.rollRate *= rocked;
    car.pitch += car.pitchRate * seconds; car.roll += car.rollRate * seconds;
    car.wreck -= seconds;
    if(car.wreck <= 0) {
      // it is turned back onto its wheels where it lies (SEE: righting)
      Object.assign(car, { wreck: 0, righting: RIGHTING_SECONDS, fromPitch: turnBetween(0, car.pitch), fromRoll: turnBetween(0, car.roll), pitchRate: 0, rollRate: 0 });
    } /* else -- still rocking */
  } else {
    // (it lies as the ground under its wheels does, and rides as high as they stand:
    // over a crest that is lower than the ground under its middle, in a dip higher)
    const lie = lieOf(car.x, car.z, car.y, car.heading), settle = Math.min(1, seconds * 40);
    car.ride += ((((lie.high === null) ? 0 : clamp(lie.high - car.y, -0.1, 0.12)) - car.ride) * settle);
    // nose up or down it only follows the road: a hill, however sharp, does not flip
    // it. Wheels left hanging over an edge pull it over, gently, and on off the edge
    if(lie.pitch !== null) { car.pitch += (lie.pitch - car.pitch) * settle; car.pitchRate = 0; }
    else {
      car.pitchRate = clamp(car.pitchRate + (lie.dive * HANG_PULL * seconds), -2.5, 2.5); car.pitch += car.pitchRate * seconds;
      car.vx -= Math.cos(car.heading) * lie.dive * HANG_SLIDE * seconds; car.vz -= Math.sin(car.heading) * lie.dive * HANG_SLIDE * seconds;
    }
    // side to side the road is level, so it tips only with one side on a jump or over
    // an edge: and that turning it keeps when it leaves the ground
    if(lie.roll !== null) { const to = car.roll + ((lie.roll - car.roll) * settle); car.rollRate += (((to - car.roll) / seconds) - car.rollRate) * 0.25; car.roll = to; }
    else {
      car.rollRate += lie.tip * HANG_PULL * seconds; car.roll += car.rollRate * seconds;
      car.vx -= Math.sin(car.heading) * lie.tip * HANG_SLIDE * seconds; car.vz += Math.cos(car.heading) * lie.tip * HANG_SLIDE * seconds;
    }
  }

  // a tree or a gate post stops what drives into it, and a tree shakes
  // (the car's body, to them, is two rounds: one over its front wheels, one over its rear)
  for(const thing of standing) {
    if((car.y < thing.from - 0.05) || (car.y > thing.to)) continue/*beneath it, or over it*/;
    for(const ahead of [BODY_AHEAD - CAR_RADIUS, CAR_RADIUS - BODY_AHEAD]) {
      const dx = car.x + (Math.cos(car.heading) * ahead) - thing.x, dz = car.z + (Math.sin(car.heading) * ahead) - thing.z, apart = Math.hypot(dx, dz), room = thing.radius + CAR_RADIUS;
      if((apart >= room) || (apart < 1e-6)) continue/*clear of it*/;
      const nx = dx / apart, nz = dz / apart, into = (car.vx * nx) + (car.vz * nz);
      car.x += nx * (room - apart); car.z += nz * (room - apart);
      if(into < 0) { car.vx -= 1.4 * into * nx; car.vz -= 1.4 * into * nz; thing.shake = Math.min(1, thing.shake + (-into * 0.5)); }
    }
  }

  // off the mat, or off the road too long: back where it last was. Driven hard and
  // going nowhere that long: set down on the next tile of the lap (before the start
  // gate, when that is next, with the gate still to cross)
  if(car.isGrounded) car.lostFor = onRoad ? 0 : car.lostFor + seconds;
  if((car.lostFor > LOST_SECONDS) || (car.x < -1.2) || (car.x > wide + 1.2) || (car.z < -1.2) || (car.z > long + 1.2)) { putBack(); return; }
  car.stuckFor = (isDriven && (strength > 0.5) && (speed < 0.2)) ? car.stuckFor + seconds : 0;
  if((car.stuckFor > LOST_SECONDS) && route.ok && car.at) {
    const reached = car.at, next = reached.next.get(reached.exit), isGate = (next === route.first);
    setDown(next, isGate ? 0.18 : 0.5, 0.45);
    if(isGate) car.at = reached;
    return;
  } /* else -- moving, or not driven */
  lapOn(seconds);
};
/** the lap, through `seconds` more of it: how far round the car has come, the start
 *  gate, the clock, and where the car was */
const lapOn = (seconds) => {
  if(!route.ok || !car.at) return/*nothing to lap*/;
  // the route: the car reaches a tile by being over it, on the road or beside it, and
  // may miss as many as LAP_SLACK tiles on the way to the next it reaches, down
  // whichever road of a fork it took. The start gate's own tile is reached through
  // the gate alone
  const tx = Math.floor(car.x), tz = Math.floor(car.z);
  reaching: for(let ahead=1; ahead<=LAP_SLACK + 1; ahead++) {
    for(const road of [ROAD_NORTH_SOUTH, ROAD_EAST_WEST]) {
      const over = route.stretches.get(roadKey(tx, tz, road));
      if(over && (over !== route.first) && isAhead(car.at, over, ahead, route.first)) { car.at = over; break reaching; }
    }
  }

  // the start line: across the middle of its tile, between the gate's posts, the way
  // the race runs
  const line = route.start, u = car.x - (line.x + 0.5), v = car.z - (line.y + 0.5);
  const part = (u * DX[line.heading]) + (v * DZ[line.heading]), aside = (u * DZ[line.heading]) - (v * DX[line.heading]);
  const isWithin = (Math.abs(part) < 0.5) && (Math.abs(aside) < GATE_HALF);
  if(isWithin && (car.linePart < 0) && (part >= 0)) {
    // through the gate: the lap just driven counts when it went round the road, and
    // another begins either way
    if(lap.running && isAhead(car.at, route.first, LAP_SLACK + 1)) onLapDone();
    else if(lap.running) showNotice('That lap left out part of the road, so it doesn’t count. This one is on the clock.');
    Object.assign(lap, { running: true, clock: 0, samples: [], sampledAt: -1 });
    car.at = route.first;
  } /* else -- not crossing it the way the race runs */
  car.linePart = isWithin ? part : NaN;

  if(lap.running) {
    lap.clock += seconds;
    if((lap.clock - lap.sampledAt >= 1 / GHOST_RATE) && (lap.clock <= GHOST_SECONDS)) {
      lap.sampledAt = lap.clock;
      lap.samples.push(Math.round(car.x * 100), Math.round(car.z * 100), Math.round((car.y + car.ride) * 100), Math.round(car.heading * 100), Math.round(car.pitch * 100), Math.round(car.roll * 100));
    } /* else -- sampled lately, or too long a lap to keep */
  } /* else -- not yet over the line */
};

// the title's car drives itself round the track
let demoAt = 0;
const demo = (seconds) => {
  if(!route.ok) return/*no track to show*/;
  demoAt = (demoAt + (seconds * 2.6)) % route.steps.length;
  const step = route.steps[Math.floor(demoAt)], place = along(step, demoAt % 1), turn = turnBetween(car.heading, place.heading);
  const road = roadTopOf(step, place.x, place.z), ground = groundHere(place.x, place.z, road + (tiles[step.y][step.x].jump ? RAMP_HEIGHT : 0)), lie = lieOf(place.x, place.z, ground, place.heading);
  Object.assign(car, { x: place.x, z: place.z, y: ground, heading: place.heading, isGrounded: true, pitch: lie.pitch || 0, roll: lie.roll || 0, ride: (lie.high === null) ? 0 : clamp(lie.high - ground, -0.1, 0.1) });
  car.lean += (clamp(turn * 6, -0.25, 0.25) - car.lean) * 0.1;
};

// -- Laps ------------------------------------------------------------------------
// the best lap of each person on each track is a record, one to a line of the `laps`
// app-content: whose it is, its time, the track's shape when it was driven, and where
// the car was through it (its ghost). A lap on a shape since changed is passed over
const appContent = window.charmiq.appContent;
let tracksContent = null, lapsContent = null/*neither read yet*/;
let tracks = []/*each `{ id, name, by, rows, tiles, line }`*/, laps = []/*each `{ id, track, user, name, shape, time, ghost, line }`*/;
let current = null/*the track on the mat when racing*/;
let me = null/*no one, or not told*/;
/** a track's shape: its tiles, and how high they stand */
const shapeOf = (track) => `${track.rows.join('/')}${track.high ? `|${track.high.join('/')}` : ''}`;
const GHOST_KEPT = 6/*numbers kept for each moment of a lap: where the car was, its heading and how it lay*/;

const readRecords = (content, read) => {
  const records = [];
  (content ? content.lines : []).forEach((line, index) => {
    if(!line.trim()) return/*an empty line*/;
    try { const record = read(JSON.parse(line), index); if(record) records.push(record); } catch(error) { /*a line this game did not write: kept, not read*/ }
  });
  return records;
};
const readTracks = (content) => readRecords(content, (record, line) => {
  const made = tilesOfRows(record.rows, record.high);
  return (made && (typeof record.id === 'string')) ? { id: record.id, name: String(record.name || 'A track').slice(0, 28), by: String(record.by || '').slice(0, NAME_CAP), rows: record.rows, high: highOfTiles(made), tiles: made, line } : null;
});
const readLaps = (content) => readRecords(content, (record, line) => (
  ((typeof record.track === 'string') && (typeof record.user === 'string') && Number.isFinite(record.time)) ? { ...record, name: String(record.name || 'Someone').slice(0, NAME_CAP), ghost: Array.isArray(record.ghost) ? record.ghost : [], line } : null));

/** the best lap on a track as it is now shaped: anyone's, or one person's */
const bestLap = (track, user) => laps.filter(found => (found.track === track.id) && (found.shape === shapeOf(track)) && (!user || (found.user === user)))
                                    .reduce((best, found) => (!best || (found.time < best.time)) ? found : best, null);

/** writes one record onto the newest app-content: its own line when it has one, else
 *  a new line. A write refused because another got there first is made again */
const writeRecord = async (name, latest, id, line) => {
  for(let attempt=0; attempt<4; attempt++) {
    const content = latest();
    try {
      if(!content) { await appContent.create(`${line}\n`, name); return; }
      const index = content.lines.findIndex(text => { try { return JSON.parse(text).id === id; } catch(error) { return false; } });
      if(index >= 0) await content.replaceLine(index, line); else await content.appendLine(line);
      return;
    } catch(error) {
      if(!error || (error.code !== 'app/content-conflict') || (attempt === 3)) throw error;
      await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)))/*the newer app-content arrives*/;
    }
  }
};

let ghostLap = null/*no lap to chase*/;
let startOverTimer = null/*not asked whether to start over*/;
const showTimes = () => {
  if(!current) return/*nothing raced*/;
  const record = bestLap(current), mine = me ? bestLap(current, me.id) : null;
  ghostLap = (record && (record.ghost.length >= GHOST_KEPT * 2)) ? record : null;
  // (a time before the name it belongs to: what is cut short is the name's end)
  nameTag.textContent = nameTag.title = current.name;
  times.textContent = times.title = (startOverTimer !== null) ? 'Start over? Tap again.'
    : !record ? 'No lap yet'
    : (mine && (record.user === mine.user)) ? `Best ${formatTime(record.time)}`
    : `${mine ? `You ${formatTime(mine.time)}  ·  ` : ''}${formatTime(record.time)} ${record.name}`;
};

let flashTimer = null, saveWarned = false;
onLapDone = () => {
  const time = lap.clock, record = bestLap(current), mine = me ? bestLap(current, me.id) : null;
  const isRecord = !record || (time < record.time), isBest = !mine || (time < mine.time);
  flashTime.textContent = formatTime(time);
  flashWord.textContent = isRecord ? 'Track record!' : isBest ? 'Your best lap' : `+${(time - (mine ? mine.time : record.time)).toFixed(2)}`;
  flash.hidden = false; flash.classList.remove('pop'); void flash.offsetWidth; flash.classList.add('pop');
  clearTimeout(flashTimer); flashTimer = setTimeout(() => { flash.hidden = true; }, 2600);
  if(isRecord) throwConfetti(car.x, car.z);
  if(!isBest) return/*nothing to keep*/;
  if(!me) { if(!saveWarned) { saveWarned = true; showNotice('Sign in to CharmIQ to keep your laps.'); } return; }

  const kept = { id: `${current.id}|${me.id}`, track: current.id, user: me.id, name: String(me.name || 'Someone').slice(0, NAME_CAP), shape: shapeOf(current), time: Math.round(time * 1000) / 1000, ghost: (time <= GHOST_SECONDS) ? lap.samples.slice() : [] };
  // shown at once; the record as written comes back from the app-content
  laps = laps.filter(found => found.id !== kept.id).concat(kept);
  showTimes();
  writeRecord('laps', () => lapsContent, kept.id, JSON.stringify(kept)).catch((error) => {
    console.error('Could not keep the lap', error);
    showNotice('That lap couldn’t be kept. Drive another and it tries again.');
  });
};

// -- Racing ----------------------------------------------------------------------
let countTimer = null;
/** puts a track on the mat and counts the race in */
const race = (track) => {
  current = track;
  tiles = copyTiles(track.tiles);
  setMode('race')/*before it is laid: a track raced stands at its heights*/;
  layTrack();
  toGrid();
  showTimes(); keep();
  racing = false; ghostModel.whole.visible = false;
  let left = 3;
  const tick = () => {
    count.hidden = false; count.textContent = (left > 0) ? String(left) : 'GO';
    count.style.background = ['#9ad0a8', '#ef5b4c', '#f2c14e', '#7cc4d8'][left]; count.style.color = (left === 1) ? '#fff' : '';
    count.style.fontSize = (left > 0) ? '' : '66px'/*two letters on a card cut for one*/;
    count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');
    if(left === 0) racing = true;
    left--;
    countTimer = setTimeout((left >= 0) ? tick : () => { count.hidden = true; }, 700);
  };
  clearTimeout(countTimer); tick();
};
// a tap on the clock asks whether to start over, and a second tap while it asks does:
// the car goes back to the grid, the lap in hand is dropped, and the race is counted in
const askStartOver = (isAsked) => {
  clearTimeout(startOverTimer);
  startOverTimer = isAsked ? setTimeout(() => askStartOver(false), ASKED_SECONDS * 1000) : null;
  clockTag.classList.toggle('asked', isAsked);
  showTimes();
};
clockTag.addEventListener('click', () => {
  if(startOverTimer === null) { askStartOver(true); return/*asked once more*/; }
  askStartOver(false);
  race(current);
});

// -- Building --------------------------------------------------------------------
// a track being built: road is laid by dragging from tile to tile, and each tile's
// piece is whatever joins the sides the road leaves it by
let draft = null/*nothing being built*/, unfinished = null/*no new track left unfinished*/, tool = 'draw', lastTile = null/*no finger laying road*/;
const showBuild = () => {
  layTrack();
  buildStatus.textContent = route.ok ? 'Ready to race.' : route.why;
  buildStatus.classList.toggle('ready', route.ok);
  buildRace.disabled = !route.ok;
  $('wide').textContent = String(wide); $('long').textContent = String(long);
  document.querySelectorAll('#tools .pill').forEach(button => button.classList.toggle('on', button.dataset.tool === tool));
};
/** a piece holds a jump or the start line only while it is a straight */
const tidy = (tile) => { if(!isStraight(tile)) { tile.jump = false; tile.start = -1; } };
const join = (from, to) => {
  const side = [NORTH, EAST, SOUTH, WEST].find(way => (from.x + DX[way] === to.x) && (from.y + DZ[way] === to.y));
  if(side === undefined) return/*not neighbors*/;
  tiles[from.y][from.x].open |= sideBit(side); tiles[to.y][to.x].open |= sideBit(opposite(side));
  tidy(tiles[from.y][from.x]); tidy(tiles[to.y][to.x]);
};
const erase = (at) => {
  tiles[at.y][at.x] = { open: 0, jump: false, start: -1, level: 0 };
  for(let side=0; side<4; side++) {
    const next = tiles[at.y + DZ[side]] && tiles[at.y + DZ[side]][at.x + DX[side]];
    if(next) { next.open &= ~sideBit(opposite(side)); tidy(next); }
  }
};
const touchTile = (at) => {
  const tile = tiles[at.y][at.x];
  if(tool === 'erase') erase(at);
  else if((tool === 'raise') && (tile.open !== 0)) tile.level = (tile.level + 1) % LEVELS/*up a level, and from the top back to the mat*/;
  else if((tool === 'jump') && isStraight(tile)) { tile.jump = !tile.jump; tile.start = -1; }
  else if((tool === 'start') && isStraight(tile)) {
    // the one start line: set here, or turned to run the other way
    const way = (tile.start >= 0) ? opposite(tile.start) : (tile.open === NORTH_SOUTH) ? NORTH : EAST;
    tiles.forEach(row => row.forEach(other => { other.start = -1; }));
    tile.start = way; tile.jump = false;
  } /* else -- laying road: a tap alone lays none */
};

// the mat being built on is seen from straight above: the whole of it where its tiles
// stay large enough for a finger, else a part of it. Two fingers move it and pinch it
const buildView = { x: 0, z: 0, high: 10 }/*over where, and from how high*/;
const TOP_COVERED = 172, FOOT_COVERED = 150/*pixels the builder's own labels and tools cover*/;
/** how high the view stands for a tile to show this many pixels across */
const highFor = (tilePixels) => scene.clientHeight / (tilePixels * 2 * Math.tan(camera.fov * Math.PI / 360));
const wholeMatHigh = () => highFor(Math.min(scene.clientWidth / (wide + 1.2), (scene.clientHeight - TOP_COVERED - FOOT_COVERED) / (long + 1.2)));
const fitBuild = () => {
  const whole = wholeMatHigh(), isWhole = (whole <= highFor(30));
  Object.assign(buildView, { x: wide / 2, z: long / 2, high: isWhole ? whole : highFor(38) });
  if(!isWhole) showNotice('Two fingers move the mat. Pinch to see more of it.');
};
/** a mat of another size under the track being built: what no longer fits is cut off */
const resize = (newWide, newLong) => {
  const next = emptyTiles(newWide, newLong);
  for(let y=0; y<Math.min(long, newLong); y++) for(let x=0; x<Math.min(wide, newWide); x++) next[y][x] = tiles[y][x];
  // road that ran off the mat's new edge ends at it
  next.forEach((row, y) => row.forEach((tile, x) => {
    for(let side=0; side<4; side++) if(!(next[y + DZ[side]] && next[y + DZ[side]][x + DX[side]])) tile.open &= ~sideBit(side);
    tidy(tile);
  }));
  tiles = draft.tiles = next;
  showBuild();
  fitBuild();
};
document.querySelectorAll('#sizes button').forEach(button => button.addEventListener('click', () => {
  const by = Number(button.dataset.by);
  if(button.dataset.size === 'wide') resize(clamp(wide + by, SMALLEST, WIDEST), long); else resize(wide, clamp(long + by, SMALLEST, LONGEST));
}));

const pointer = new THREE.Vector2(), sight = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), touched = new THREE.Vector3();
/** the tile of the mat under a finger, if any */
const tileUnder = (event) => {
  const bounds = scene.getBoundingClientRect();
  pointer.set((((event.clientX - bounds.left) / bounds.width) * 2) - 1, 1 - (((event.clientY - bounds.top) / bounds.height) * 2));
  sight.setFromCamera(pointer, camera);
  if(!sight.ray.intersectPlane(floor, touched)) return null/*looking away from the mat*/;
  const x = Math.floor(touched.x), y = Math.floor(touched.z);
  return ((x >= 0) && (x < wide) && (y >= 0) && (y < long)) ? { x, y } : null;
};

// fingers on the table. Building, one lays or changes the track, and two move and
// pinch the mat; racing, one pulls the car the way it has moved since it touched
let fingerDown = null/*no finger steering*/;
const fingers = new Map()/*each finger down while building, and where*/;
let pinch = null/*two fingers down: where they were, and how the view stood, when the second touched*/;
const twoFingers = () => {
  const [one, other] = [...fingers.values()];
  return { apart: Math.max(1, Math.hypot(one.x - other.x, one.y - other.y)), x: (one.x + other.x) / 2, y: (one.y + other.y) / 2 };
};
scene.addEventListener('pointerdown', (event) => {
  scene.setPointerCapture(event.pointerId);
  if(mode === 'build') {
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if(fingers.size > 1) {
      // a second finger: the road stops being laid, and the mat is held
      lastTile = null;
      if(fingers.size === 2) pinch = { ...twoFingers(), high: buildView.high, overX: buildView.x, overZ: buildView.z };
      return;
    } /* else -- the one finger */
    lastTile = tileUnder(event);
    if(lastTile && (tool !== 'draw')) { touchTile(lastTile); showBuild(); }
    return;
  } /* else -- not building */
  if(motion === 'ask') follow()/*the tap an iPhone asks within*/;
  flipBack();
  fingerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
scene.addEventListener('pointermove', (event) => {
  if(mode === 'build') {
    if(!fingers.has(event.pointerId)) return/*not a finger that touched*/;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if(pinch && (fingers.size >= 2)) {
      // the mat follows the two fingers, nearer as they part
      const now = twoFingers();
      buildView.high = clamp(pinch.high * (pinch.apart / now.apart), highFor(76), Math.max(wholeMatHigh(), highFor(38)));
      const tilesAPixel = 1 / (scene.clientHeight / (buildView.high * 2 * Math.tan(camera.fov * Math.PI / 360)));
      buildView.x = clamp(pinch.overX - ((now.x - pinch.x) * tilesAPixel), 0, wide);
      buildView.z = clamp(pinch.overZ - ((now.y - pinch.y) * tilesAPixel), 0, long);
      return;
    } /* else -- one finger */
    const at = tileUnder(event);
    if(!lastTile || !at || ((at.x === lastTile.x) && (at.y === lastTile.y))) return/*laying none, off the mat, or the same tile*/;
    if(tool === 'draw') {
      // from tile to tile, by the longer way first when the finger skipped one
      let from = lastTile;
      while((from.x !== at.x) || (from.y !== at.y)) {
        const dx = at.x - from.x, dy = at.y - from.y;
        const next = (Math.abs(dx) >= Math.abs(dy)) ? { x: from.x + Math.sign(dx), y: from.y } : { x: from.x, y: from.y + Math.sign(dy) };
        join(from, next); from = next;
      }
    } else if(tool === 'erase') erase(at);
    lastTile = at;
    showBuild();
    return;
  } /* else -- not building */
  if(!fingerDown || (fingerDown.id !== event.pointerId)) return/*not the finger that touched*/;
  const dx = event.clientX - fingerDown.x, dy = event.clientY - fingerDown.y, far = Math.hypot(dx, dy);
  // dragged past a full pull, where it touched follows: turning back answers at once
  if(far > FINGER_REACH) { fingerDown.x += dx * (1 - (FINGER_REACH / far)); fingerDown.y += dy * (1 - (FINGER_REACH / far)); }
  fingerTilt.x = (far > FINGER_REACH) ? dx / far : dx / FINGER_REACH;
  fingerTilt.y = (far > FINGER_REACH) ? dy / far : dy / FINGER_REACH;
});
const liftFinger = (event) => {
  // a finger lifted from the mat: no road is laid until one touches again
  fingers.delete(event.pointerId);
  if(fingers.size < 2) pinch = null;
  lastTile = null;
  if(!fingerDown || (fingerDown.id !== event.pointerId)) return/*not the finger that steers*/;
  fingerDown = null; fingerTilt.x = 0; fingerTilt.y = 0;
};
scene.addEventListener('pointerup', liftFinger);
scene.addEventListener('pointercancel', liftFinger);

document.querySelectorAll('#tools .pill').forEach(button => button.addEventListener('click', () => { tool = button.dataset.tool; showBuild(); }));
$('build-clear').addEventListener('click', () => { tiles = draft.tiles = emptyTiles(wide, long); showBuild(); });
/** opens the builder on a track, to change it, or on a new one. What was closed without
 *  being raced is taken up again: the changes to that track, or the new track left
 *  unfinished (kept while another is changed) */
const build = (track) => {
  if(draft && !draft.id) unfinished = draft;
  if(!track) draft = unfinished || { id: null, name: '', tiles: emptyTiles(NEW_WIDE, NEW_LONG) };
  else if(!draft || (draft.id !== track.id)) draft = { id: track.id, name: track.name, tiles: copyTiles(track.tiles) };
  tiles = draft.tiles;
  trackName.value = draft.name; trackName.placeholder = 'Name your track';
  tool = 'draw';
  fingers.clear(); pinch = null; lastTile = null;
  setMode('build');
  showBuild();
  fitBuild();
};
$('build-close').addEventListener('click', () => {
  draft.name = trackName.value;
  if(current) race(current); else { setMode('title'); showTitleTrack(); }
});
buildRace.addEventListener('click', () => {
  if(!route.ok) return/*no lap to race*/;
  const rows = rowsOfTiles(tiles), high = highOfTiles(tiles), id = draft.id || newId();
  const name = trackName.value.trim().slice(0, 28) || `Track ${tracks.length + 1}`;
  const made = { id, name, by: String((me && me.name) || '').slice(0, NAME_CAP), rows, high, tiles: copyTiles(tiles) };
  if(draft === unfinished) unfinished = null;
  draft = null;
  // raced at once; the track as written comes back from the app-content
  tracks = tracks.filter(found => found.id !== id).concat(made);
  race(made);
  writeRecord('tracks', () => tracksContent, id, JSON.stringify({ id, name, by: made.by, rows, high })).catch((error) => {
    console.error('Could not keep the track', error);
    showNotice('Your track couldn’t be saved. It still races; build it again to try once more.');
  });
});

// -- Screens ---------------------------------------------------------------------
const setMode = (next) => {
  mode = next;
  title.hidden = (mode !== 'title'); leveling.hidden = (mode !== 'leveling');
  hud.hidden = foot.hidden = (mode !== 'race');
  buildTop.hidden = buildFoot.hidden = (mode !== 'build');
  carTop.hidden = carFoot.hidden = (mode !== 'car');
  $('soft-top').hidden = $('soft-bottom').hidden = (mode === 'build');
  document.body.classList.toggle('building', mode === 'build');
  document.body.classList.toggle('fitting', mode === 'car');
  if(mode !== 'race') askStartOver(false);
  if(mode !== 'race') { racing = false; clearTimeout(countTimer); count.hidden = true; flash.hidden = true; ghostModel.whole.visible = false; }
  showMotion();
};

// before the first race, the person says how they hold the phone: the bead shows the
// tilt as it is, and Set level makes that pose level. With no tilt to follow (a
// computer, a refusal) there is nothing to level, and the race begins with a finger
const firstTrack = () => (current && tracks.find(track => track.id === current.id)) || tracks.find(track => track.id === wanted) || tracks[0];
settleLeveling = () => {
  if(mode !== 'leveling') return/*not being asked*/;
  if((motion === 'unavailable') || isTiltRefused()) { race(firstTrack()); return; }
  const ready = (motion === 'on');
  levelingText.textContent = ready ? 'Hold your phone the way you will drive. Then set it.' : (motion === 'ask') ? 'Your phone needs a tap before it reports its tilt.' : 'Waiting for your phone…';
  setLevelButton.textContent = (motion === 'ask') ? 'Turn on tilt' : 'Set level';
  setLevelButton.disabled = !ready && (motion !== 'ask');
};
setLevelButton.addEventListener('click', () => {
  if(motion === 'ask') { follow(); return/*the tap an iPhone asks within*/; }
  setLevel();
  race(firstTrack());
});
$('no-tilt').addEventListener('click', () => { useTilt = false; keep(); race(firstTrack()); });
relevel.addEventListener('click', () => { setLevel(); showNotice('Level, as you hold it now.'); });
begin.addEventListener('click', () => {
  if(tracks.length < 1) { build(null); return/*no track yet: build the first*/; }
  if(!useTilt) { race(firstTrack()); return/*nothing to level*/; }
  setMode('leveling');
  follow()/*the tap an iPhone asks within*/;
  settleLeveling();
});

// the tracks, by name, as cards to leaf through: each with its picture and its best
// lap, to race, change or throw away; and last a bare card, to build a new one
const closeSheets = () => { scrim.hidden = true; tracksSheet.hidden = true; settingsSheet.hidden = true; };
/** a track's picture: its road on the mat, seen from above */
const pictureOf = (track) => {
  const high = track.tiles.length, wide = track.tiles[0].length;
  let road = '', line = '';
  for(let y=0; y<high; y++) {
    for(let x=0; x<wide; x++) {
      const tile = track.tiles[y][x], cx = x + 0.5, cy = y + 0.5;
      const sides = [NORTH, EAST, SOUTH, WEST].filter(side => tile.open & sideBit(side));
      if(sides.length === 2 && (sides[1] - sides[0] !== 2)) {
        // a corner: a quarter circle from one side to the other
        const [a, b] = sides, turnsRight = ((DX[b] * DZ[a]) - (DZ[b] * DX[a])) > 0;
        road += `M${cx + (DX[a] / 2)} ${cy + (DZ[a] / 2)}A.5 .5 0 0 ${turnsRight ? 1 : 0} ${cx + (DX[b] / 2)} ${cy + (DZ[b] / 2)}`;
      } else for(const side of sides) road += `M${cx} ${cy}L${cx + (DX[side] / 2)} ${cy + (DZ[side] / 2)}`;
      if(tile.start >= 0) line = `M${cx - (DZ[tile.start] * 0.34)} ${cy + (DX[tile.start] * 0.34)}L${cx + (DZ[tile.start] * 0.34)} ${cy - (DX[tile.start] * 0.34)}`;
    }
  }
  const picture = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  picture.setAttribute('viewBox', `-0.4 -0.4 ${wide + 0.8} ${high + 0.8}`);
  picture.setAttribute('aria-hidden', 'true');
  picture.innerHTML = `<rect x="-0.4" y="-0.4" width="${wide + 0.8}" height="${high + 0.8}" fill="#2f6e63"/>`
    + `<path d="${road}" fill="none" stroke="#f6f0e3" stroke-width=".8"/><path d="${road}" fill="none" stroke="#474a54" stroke-width=".62"/>`
    + `<path d="${line}" fill="none" stroke="#fdfaf3" stroke-width=".16"/>`;
  return picture;
};
let doomed = null/*no track asked to be thrown away*/;
const showTracks = () => {
  const make = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text || '' });
  const cards = [...tracks].sort((a, b) => a.name.localeCompare(b.name)).map((track) => {
    const record = bestLap(track), card = make('div', 'swatch paper'), acts = make('div', 'acts');
    /** a button of words, or of an icon alone under a name */
    const button = (text, more, act, icon, named) => {
      const made = make('button', `cut pill ${more}`, text);
      if(icon) made.prepend(iconOf(icon));
      if(named) { made.setAttribute('aria-label', named); made.title = named; }
      made.addEventListener('click', act);
      return made;
    };
    const isDoomed = (doomed === track.id);
    acts.append(
      button(isDoomed ? 'Sure?' : '', isDoomed ? 'on' : 'only', () => {
        if(doomed !== track.id) { doomed = track.id; showTracks(); return/*asked once more*/; }
        doomed = null;
        throwAway(track);
      }, 'basket', isDoomed ? 'Sure? Toss this track' : 'Toss this track'),
      button('', 'only', () => { closeSheets(); build(track); }, 'pencil', 'Change this track'),
      button('Race', 'go', () => { closeSheets(); race(track); }));
    const named = make('div', 'name', track.name), best = make('div', 'best', `${record ? `${formatTime(record.time)}  ${record.name}` : 'No lap yet'}${track.by ? `  ·  by ${track.by}` : ''}`);
    named.title = named.textContent; best.title = best.textContent;
    card.append(pictureOf(track), named, best, acts);
    card.dataset.track = track.id;
    return card;
  });
  const full = (tracks.length >= TRACK_CAP), blank = make('button', 'swatch paper blank');
  blank.append(make('b', '', full ? '' : '+'), make('span', '', full ? `The table holds ${TRACK_CAP} tracks. Toss one to build another.` : 'Build a new track'));
  blank.disabled = full;
  blank.addEventListener('click', () => { closeSheets(); build(null); });
  // the cards stay where they were leafed to
  const leafed = trackList.scrollLeft;
  trackList.replaceChildren(...cards, blank);
  trackList.scrollLeft = leafed;
};
/** throws a track away, and the laps driven on it */
const throwAway = async (track) => {
  tracks = tracks.filter(found => found.id !== track.id);
  showTracks();
  try {
    const index = tracksContent ? tracksContent.lines.findIndex(text => { try { return JSON.parse(text).id === track.id; } catch(error) { return false; } }) : -1;
    if(index >= 0) await tracksContent.removeLine(index);
    if(lapsContent) {
      const keptLines = lapsContent.lines.filter(text => { try { return JSON.parse(text).track !== track.id; } catch(error) { return true; } });
      if(keptLines.length !== lapsContent.lines.length) await lapsContent.setLines(keptLines);
    } /* else -- no lap was ever kept */
  } catch(error) {
    console.error('Could not throw the track away', error);
    showNotice('That track couldn’t be thrown away. Try again.');
  }
  if(current && (current.id === track.id)) { current = null; if(tracks.length > 0) race(tracks[0]); else { closeSheets(); build(null); } }
};
$('tracks-open').addEventListener('click', () => {
  doomed = null;
  scrim.hidden = false; tracksSheet.hidden = false;
  showTracks();
  // opened at the track being raced
  const here = current && [...trackList.children].find(card => card.dataset.track === current.id);
  if(here) trackList.scrollLeft = here.offsetLeft - ((trackList.clientWidth - here.offsetWidth) / 2);
});
$('build-open').addEventListener('click', () => build(current))/*the track on the mat, to change or to clear*/;
$('tracks-done').addEventListener('click', closeSheets);

const showSettings = () => {
  // (tilting chosen, with the phone still to be asked for it: the button asks)
  const tilt = $('tilt'), isUnasked = useTilt && (motion === 'ask');
  tilt.textContent = isUnasked ? 'Turn on' : useTilt ? 'On' : 'Off';
  tilt.classList.toggle('on', useTilt && !isUnasked);
  tilt.setAttribute('aria-pressed', String(useTilt && !isUnasked));
};
$('gear').addEventListener('click', () => { showSettings(); scrim.hidden = false; settingsSheet.hidden = false; });
$('settings-done').addEventListener('click', closeSheets);
scrim.addEventListener('click', closeSheets);
$('recenter').addEventListener('click', () => { setLevel(); closeSheets(); showNotice('Level, as you hold it now.'); });
$('tilt').addEventListener('click', () => {
  if(useTilt && (motion === 'ask')) follow()/*the tap an iPhone asks within*/;
  else {
    useTilt = !useTilt;
    if(useTilt && (motion !== 'on')) follow()/*the same tap*/;
  }
  showSettings(); showMotion(); keep();
});
$('put-back').addEventListener('click', () => { closeSheets(); putBack(); });
document.addEventListener('keydown', (event) => { if(event.key === 'Escape') closeSheets(); });

// the car, fitted out: it stands on the grid and is walked round, and whatever is chosen
// is on it at once. Leaving counts the race in again
const showCar = () => {
  carFoot.querySelectorAll('[data-pick]').forEach((button) => {
    const isOn = (fit[button.dataset.pick] === button.dataset.id);
    button.classList.toggle('on', isOn); button.setAttribute('aria-pressed', String(isOn));
  });
  kitSays.textContent = KITS[fit.kit].says;
};
/** a button that fits the car with one of what it may have */
const pickOf = (into, pick, id, made) => {
  Object.assign(made.dataset, { pick, id });
  made.addEventListener('click', () => { fit = { ...fit, [pick]: id }; dressCar(); showCar(); keep(); });
  into.append(made);
};
const wordPick = (into, pick, id, name) => { const made = Object.assign(document.createElement('button'), { className: 'cut pill stacked', textContent: name }); made.prepend(iconOf(id)); pickOf(into, pick, id, made); };
Object.entries(SHAPES).forEach(([id, shape]) => wordPick($('shapes'), 'shape', id, shape.name));
Object.entries(PAINTS).forEach(([id, paint]) => {
  const made = document.createElement('button');
  made.style.background = `#${paint.color.toString(16).padStart(6, '0')}`; made.title = paint.name; made.setAttribute('aria-label', paint.name);
  pickOf($('paints'), 'paint', id, made);
});
Object.entries(KITS).forEach(([id, kit]) => wordPick($('kits'), 'kit', id, kit.name));
$('car-open').addEventListener('click', () => { toGrid(); setMode('car'); showCar(); });
$('car-done').addEventListener('click', () => race(current));

// the page never zooms and offers no long-press menu
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('contextmenu', (event) => event.preventDefault());

// -- Each Person's Place ---------------------------------------------------------
// which track a person last raced, whether tilting steers, and their car, are kept in the
// app-state under their User id (`user.read`). A change is written onto the latest
// state, one save at a time; nothing is written before the app-state and the person
// are known
const appState = window.charmiq.appState;
let appStateSeen = null, appStateKnown = false, unsaved = false, saving = false, restored = false, saveFailed = false;
let wanted = null/*the track this person last raced*/;
const save = async () => {
  if(saving || !unsaved || !appStateKnown || !me) return/*one save at a time, onto a known state, for a known person*/;
  saving = true; unsaved = false;
  const latest = (appStateSeen && (typeof appStateSeen === 'object')) ? appStateSeen : {};
  const byUser = (latest.byUser && (typeof latest.byUser === 'object')) ? latest.byUser : {};
  try {
    await appState.set({ ...latest, byUser: { ...byUser, [me.id]: { track: current ? current.id : wanted, tilt: useTilt, car: fit } } });
  } catch(error) {
    console.error('Could not save the app-state', error);
    if(!saveFailed) { saveFailed = true; showNotice('Your settings aren’t being saved. The game still plays; it tries again as you go on.'); }
  } finally {
    saving = false;
    save();
  }
};
const keep = () => { unsaved = true; save(); };
/** takes up where this person left off, once: after that the game in hand stands */
const restore = () => {
  if(restored || !me || !appStateKnown) return/*done, or still waiting*/;
  restored = true;
  const mine = appStateSeen && appStateSeen.byUser && appStateSeen.byUser[me.id];
  if(!mine || (typeof mine !== 'object')) return/*a first visit*/;
  if(typeof mine.track === 'string') wanted = mine.track;
  if(typeof mine.tilt === 'boolean') useTilt = mine.tilt;
  if(mine.car && (typeof mine.car === 'object')) { fit = fitOf(mine.car); dressCar(); }
  if(mode === 'title') showTitleTrack();
  showMotion();
};
/** the track the title's car drives: the one this person last raced, else the first */
const showTitleTrack = () => {
  const track = tracks.find(found => found.id === wanted) || tracks[0];
  tiles = track ? copyTiles(track.tiles) : emptyTiles(NEW_WIDE, NEW_LONG);
  layTrack();
  demoAt = 0;
};

// -- The View --------------------------------------------------------------------
// racing, the table is seen from the south, over the car and a little ahead of it,
// and leans with the tilt; building, the mat from straight above (SEE: buildView);
// fitting out the car, the car from a walk close round it; at the title, the whole mat
// from a slow walk round it
const eye = new THREE.Vector3(4, 9, 16), look = new THREE.Vector3(4, 0, 5), wantEye = new THREE.Vector3(), wantLook = new THREE.Vector3();
let walked = 0;
const size = () => {
  const width = scene.clientWidth, height = scene.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height; camera.updateProjectionMatrix();
};
window.addEventListener('resize', size);
const view = (seconds) => {
  if(mode === 'build') {
    // the mat sits between the labels above it and the tools below
    const south = ((FOOT_COVERED - TOP_COVERED) / 2) / (scene.clientHeight / (buildView.high * 2 * Math.tan(camera.fov * Math.PI / 360)));
    wantLook.set(buildView.x, 0, buildView.z + south); wantEye.set(buildView.x, buildView.high, buildView.z + south + 0.01);
  } else if(mode === 'race') {
    const pull = tiltNow();
    wantLook.set(car.x + (car.vx * 0.32), car.y * 0.6, car.z + (car.vz * 0.32) - 0.2);
    wantEye.set(wantLook.x + (pull.x * 0.6), 4.9 + (car.y * 0.6), wantLook.z + 3.7 + (pull.y * 0.45));
  } else if(mode === 'car') {
    // (looked at beneath its wheels, so it stands above what is chosen under it)
    walked += seconds * 0.45;
    wantLook.set(car.x, car.y - 0.24, car.z); wantEye.set(car.x + (Math.sin(walked) * 1.15), car.y + 0.58, car.z + (Math.cos(walked) * 1.15));
  } else {
    const span = Math.max(wide / 7, long / 9);
    walked += seconds * 0.13;
    wantLook.set(middle.x, 0, middle.z + (0.6 * span)); wantEye.set(middle.x + (Math.sin(walked) * 6 * span), 9.5 * span, middle.z + ((10.5 + (Math.cos(walked) * 1.6)) * span));
  }
  // held by two fingers, the mat keeps up with them
  const ease = ((mode === 'build') && pinch) ? 1 : 1 - Math.exp(-seconds * 4.5);
  eye.lerp(wantEye, ease); look.lerp(wantLook, ease);
  camera.position.copy(eye); camera.lookAt(look);
  // the far table fades into the room, from beyond what is looked at
  world.fog.near = eye.distanceTo(look) + 10; world.fog.far = world.fog.near + 46;
  // racing, the lamp's shadows are kept fine round the car; else they cover the mat
  if((mode === 'race') || (mode === 'car')) aimLamp(look, 7.5); else aimLamp(middle, (Math.max(wide, long) / 2) + 3);
};

// -- The Loop --------------------------------------------------------------------
let frame = null, drawnAt = 0, owed = 0;
const tick = (now) => {
  frame = requestAnimationFrame(tick);
  const seconds = Math.min((now - drawnAt) / 1000, 0.1);
  drawnAt = now;
  // the race waits while a sheet is open over it
  if((mode === 'race') && racing && scrim.hidden) {
    owed += seconds;
    while(owed >= STEP_SECONDS) { drive(STEP_SECONDS); owed -= STEP_SECONDS; }
  } else if(mode === 'title') demo(seconds);

  // the car as it lies, its body leaning into the turn and pressed down as it lands
  carModel.whole.visible = (mode !== 'build') && route.ok;
  pose(carModel, car.x, car.y + car.ride, car.z, car.heading, car.pitch, car.roll);
  carModel.body.rotation.x = car.lean;
  carModel.body.scale.y = 1 - (car.squash * 0.35);

  // the lap being chased, where it was at this moment of its own lap
  const shown = (mode === 'race') && lap.running && !!ghostLap;
  if(shown) {
    const at = lap.clock * GHOST_RATE, index = Math.floor(at), part = at - index, ghost = ghostLap.ghost;
    if(((index + 2) * GHOST_KEPT) <= ghost.length) {
      const from = index * GHOST_KEPT, to = from + GHOST_KEPT;
      const between = (kept) => (ghost[from + kept] + ((ghost[to + kept] - ghost[from + kept]) * part)) / 100;
      const turned = (kept) => (ghost[from + kept] / 100) + (turnBetween(ghost[from + kept] / 100, ghost[to + kept] / 100) * part);
      pose(ghostModel, between(0), between(2), between(1), turned(3), turned(4), turned(5));
      ghostModel.whole.visible = true;
    } else ghostModel.whole.visible = false/*its lap is over*/;
  } else ghostModel.whole.visible = false;

  for(const thing of standing) {
    if(!thing.tree || (thing.shake < 0.002)) continue/*a post, or standing still*/;
    thing.shake *= Math.exp(-seconds * 5);
    thing.tree.rotation.z = Math.sin(now / 28) * thing.shake * 0.34;
  }
  for(const scrap of confetti) {
    if(scrap.left <= 0) continue/*lying still, or never thrown*/;
    scrap.left -= seconds;
    scrap.vy -= 6 * seconds;
    const mesh = scrap.mesh;
    mesh.position.x += scrap.vx * seconds; mesh.position.z += scrap.vz * seconds;
    mesh.position.y = Math.max(0.062, mesh.position.y + (scrap.vy * seconds));
    if(mesh.position.y > 0.063) { mesh.rotation.x += scrap.spin * seconds; mesh.rotation.z += scrap.spin * 0.7 * seconds; }
    else { mesh.rotation.x = -Math.PI / 2; scrap.vx *= 0.9; scrap.vz *= 0.9; }
    if(scrap.left <= 0) mesh.visible = false;
  }

  if(mode === 'race') clock.textContent = lap.running ? formatTime(lap.clock) : racing ? 'GO' : 'Ready';
  if(mode === 'leveling') bead.style.transform = `translate(${leanNow.x * 52}px, ${leanNow.y * 52}px)`;
  view(seconds);
  renderer.render(world, camera);
};
const start = () => { if(frame === null) { drawnAt = performance.now(); frame = requestAnimationFrame(tick); } };
const stop = () => { if(frame !== null) { cancelAnimationFrame(frame); frame = null; } };
document.addEventListener('visibilitychange', () => { if(document.hidden) stop(); else start(); });

// -- Boot ------------------------------------------------------------------------
size();
showMotion();
showTitleTrack();
start();

appContent.content$("[name='tracks']").subscribe({
  next: (content) => {
    tracksContent = content;
    tracks = readTracks(content);
    if(current) { const found = tracks.find(track => track.id === current.id); if(found) current.name = found.name; }
    if(mode === 'title') showTitleTrack();
    if(!tracksSheet.hidden) showTracks();
    showTimes();
  },
  error: (error) => {
    console.error('Could not read the tracks', error);
    showNotice('The tracks could not be read. Reload to try again.');
  },
});
appContent.content$("[name='laps']").subscribe({
  next: (content) => {
    lapsContent = content;
    laps = readLaps(content);
    if(!tracksSheet.hidden) showTracks();
    showTimes();
  },
  error: (error) => {
    console.error('Could not read the laps', error);
    showNotice('The laps could not be read. The game still plays; reload to try again.');
  },
});
appState.onChange$().subscribe({
  next: (state) => { appStateSeen = state; appStateKnown = true; restore(); save(); },
  error: (error) => {
    console.error('Could not read the app-state', error);
    appStateKnown = false; appStateSeen = null; unsaved = false;
    showNotice('Your settings aren’t being saved. The game still plays; reload to try again.');
  },
});
if(typeof window.charmiq.user$ === 'function') {
  window.charmiq.user$().subscribe({
    next: (user) => {
      // another person takes up their own place: the one before keeps nothing unsaved
      if(me && user && (me.id !== user.id)) { restored = false; unsaved = false; }
      me = user;
      restore();
      showTimes();
    },
    error: (error) => { console.warn('Could not read who is signed in', error); me = null; },
  });
} /* else -- a Platform that tells no one: nothing is kept */
};

// == Boot ========================================================================
// the page stays where it is. An iPhone can scroll it all the same (on a double tap, or
// to bring the track's name over the keyboard), and leave it scrolled: whenever it has
// moved, it is put back
const stayPut = () => { if((window.scrollX !== 0) || (window.scrollY !== 0)) window.scrollTo(0, 0); };
window.addEventListener('scroll', stayPut);
if(window.visualViewport) { window.visualViewport.addEventListener('scroll', stayPut); window.visualViewport.addEventListener('resize', stayPut); }
trackName.addEventListener('blur', () => setTimeout(stayPut, 0));
document.addEventListener('dblclick', (event) => event.preventDefault());

// the status bar continues the table
if(window.charmiq.page) window.charmiq.page.setTopColor({ light: PAGE, dark: PAGE });
const load = () => {
  $('failed').hidden = true;
  import(THREE_URL).then(open, (error) => {
    console.error('Could not load what the table is drawn with', error);
    title.hidden = true; $('failed').hidden = false;
  });
};
$('retry').addEventListener('click', load);
load();
})();
</script>
</body>
</html>
    </app-source>
    <app-content name="tracks">
{"id":"first-fold","name":"First Fold","by":"","rows":[".......",".r---7.",".|...|.",".|...|.",".|...|.",".|...|.",".|...|.",".L->-J.","......."]}
{"id":"paper-clip","name":"Paper Clip","by":"","rows":[".r---7.",".|...|.",".|.r-J.",".|.|...",".|.L-7.",".:...|.",".|...|.",".L-<-J.","......."]}
{"id":"figure-eight","name":"Figure Eight","by":"","rows":[".......","r--7...","|..|...","|..|...","L--+--7","...|..|","...|..|","...L>-J","......."],"high":["0000000","0000000","0001000","0002000","0000000","0002000","0001000","0000000","0000000"]}
{"id":"long-way-round","name":"Long Way Round","by":"","rows":["...........",".r-------7.",".|.......|.",".|.r---7.|.",".|.|...|.|.",".:.|...L-J.",".|.|.......",".|.L--=--7.",".|.......|.",".L---7...|.",".....|...|.",".r---J...|.",".L--->---J.","..........."],"high":["00000000000","00012321000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000","00000000000"]}
    </app-content>
  </iframe-app>
</p>

## How to Play

* **Driving:** tip the phone and the car noses the way you tip it, and drives the way it faces: the further you tip, the harder it goes. Tip it back against its travel and it brakes. A finger dragged on the table and the arrow keys steer too, all at once with the tilt. **Race** is also the tap an iPhone needs before it reports its tilt, each time the game is opened; however you hold the phone when you set it level is flat, and **Level** sets it again. **Just use a finger** on that screen, or **Steer by tilting** in the settings, turns the tilt off. A word the game has for you (that tilting is off, say) fades after five seconds; the settings still turn tilting on.

* **The road holds, the mat does not.** On the road the tires grip. Off it the bare mat drags the car to a crawl, a tree stops it, and a car left off the road is put back where it last was. A car driven hard and going nowhere is set down on the next tile.

* **Starting over:** tap the clock and it asks; tap it again while it asks and the car is back on the grid, the lap in hand dropped.

* **Laps:** a lap runs from the start gate round to the start gate. The gate's posts are solid: there is no way past but between them. A lap counts when it went round the road (it may cut a corner, not leave out a stretch); one that does not is said so, and the next is already on the clock. Your best lap on each track is kept.

* **Ghosts:** the pale car is the best lap anyone has driven on the track, yours included, replayed beside you. Beat it and yours takes its place.

* **Hills:** a raised road stands on stilts. It slows the car on the way up and hurries it on the way down, and over a crest taken fast the car leaves the ground. No hill is too steep for a car driven flat out. Drive off the side of a raised road and it falls.

* **Under and over:** there is room to drive beneath a raised road. Where two roads cross and one stands high enough over the other for a car to pass beneath, it bridges it; otherwise they cross on the level.

* **Jumps:** drive up a wedge and the car flies off its lip. Hit a wedge from behind or from the side and the car bounces off it.

* **Rolls and wrecks:** the car lies on its four wheels. A hill or a jump taken straight never flips it; catch a jump with the wheels of one side, or let a side hang over the edge of a raised road, and it rolls. Landed on its side or its roof it is wrecked: it is turned back onto its wheels after a moment, or at once when you tap the table.

## Your Car

**Car** stands your car on the grid and walks round it while you fit it out. **Race it** puts it back in the race.

* **Shape:** a coupe, a pickup, a wedge or a van. All four fill the same box on the same wheels, so none fits where another would not.

* **Paint:** eight colors of card.

* **Set-up** trades the tires against the engine. **Tires** holds the corners and gives up some speed down the straights; **Engine** is quicker in a straight line and slides in the corners; **Even** is a bit of both. Sticky tires are fat, and a big engine stands out of the body.

## Building a Track

**Build** opens the track you are racing, to change it or to **Clear** it and start again. The last card under **Tracks** opens a bare mat for a new one.

* **Size:** **Wide** and **Long** set the mat's size, from 5 tiles a side to 15 wide and 21 long. A new mat is 11 by 14. What no longer fits a smaller mat is cut off.

* **Road:** drag a finger from tile to tile and road is laid behind it. Each tile becomes whatever piece joins the sides you crossed: a straight, a corner, a crossing, or a fork.

* **Shortcuts:** draw a road off the lap and back onto it further round, and it is a shortcut: the road forks where it leaves and again where it comes back. A lap counts whichever way round you went. A road that leaves the lap and never comes back to it is the one fork a track cannot have.

* **Erase:** tap or drag over tiles to lift them.

* **Raise:** tap a tile of road to stand it a level higher, up to three, and once more to set it back on the mat. The road runs up and down between tiles of different heights. A crossing has no height of its own: each of its two roads stands as high as the roads it joins, so raising the tiles either side of one road (two levels is plenty) makes it a bridge over the other. While it is built the track lies flat, each raised tile under its number; raced, it stands.

* **Jump:** tap a straight to fold a wedge onto it, and again to take it off.

* **Start:** tap a straight to put the start gate there, and again to run the race the other way.

* **Moving about a large mat:** two fingers move the mat, and pinching shows more or less of it.

The tape above the mat says what the track still needs, and a loose end is marked on its tile. Until the track is a lap, a jump faces the way the road is followed from the start gate; after that it faces the way the race runs, which on a shortcut is from the fork the race reaches first to the one it reaches later. Once the road comes back round to the start gate, **Race it** saves the track and puts you on its grid. **Tracks** shows every track as a card with its picture and its best lap: the wastepaper basket tosses it (and asks first), the pencil changes it, **Race** races it. The last card builds a new one.

## Sharing

Everything is kept in the document, so everyone you share it with as an Editor has the same tracks and chases the same laps.

* **Tracks** are records, one to a line, in the Application's `tracks` app-content: a name, who built it, and its `rows`, one string for each row of the mat and one character for each tile (`.` bare mat, `|` `-` straights, `L` `r` `7` `J` corners, `+` a crossing, `T` `W` `F` `H` forks with no road north, south, west or east, `:` `=` jumps, `^` `>` `v` `<` the start gate and the way the race runs). A track with raised road has `high` as well: the same rows, each tile's height from `0` to `3`. A document holds up to 24 tracks.

* **Laps** are records in its `laps` app-content: one line for each person on each track, with their best time and its ghost (where the car was and how it lay, twelve times a second, for laps up to a minute). Changing a track's shape or its heights sets its laps aside, since they were driven on another road.

* **Your place** (the track you last raced, whether tilting steers, and your car) is kept under your User id in the Application's app-state.

## On Your Phone

* **Home-screen setup:** [Mobile](charmiq://../README.md).

* **What it asks for:** your phone's tilt (`page.motion`), and who you are (`user.read`) to put your name on your tracks and laps. Signed out, the game plays and nothing is kept.

* **The screen stays awake** while you race, since a game steered by tilting is never touched.

* **It needs the network to open.** The table is drawn with three.js, fetched when the Application opens; with no connection it says so and offers to try again.
