# Zap Lab

*A sound-effect bench for games: pick a kind of sound, click until one is close, steer it closer by ear, then take it away as a WAV or as code that makes it.*

<iframe-app height="900px" width="100%">
  <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Zap Lab</title>
<style>
:root {
  --bg: #12131a;
  --panel: #1b1d28;
  --well: #0b0c12;
  --line: #2b2e3d;
  --ink: #e8eaf2;
  --dim: #8b90a6;
  --hue: #5cc8ff;
  --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--ink);
  font: 13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-text-size-adjust: 100%;
}

button, input, textarea {
  font: inherit;
  color: inherit;
}

button {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 6px 12px;
  background: var(--panel);
  cursor: pointer;
  white-space: nowrap;
}

button:hover:not(:disabled) {
  border-color: var(--hue);
}

button:active:not(:disabled) {
  transform: translateY(1px);
}

button:disabled {
  opacity: .4;
  cursor: default;
}

button.main {
  border-color: var(--hue);
  background: var(--hue);
  color: #0b0c12;
  font-weight: 700;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

h1 {
  font: 800 15px/1 var(--mono);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--hue);
  white-space: nowrap;
}

#buckets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bucket {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 5px 11px 5px 9px;
}

.bucket i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
}

.bucket:hover:not(:disabled), .bucket.on {
  border-color: var(--c);
}

main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0,1fr) 350px;
}

#bench {
  min-width: 0;
  overflow: auto;
  padding: 12px 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#bench > * {
  flex-shrink: 0;
}

#scope {
  position: relative;
  height: 200px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--well);
  overflow: hidden;
}

#scope canvas {
  display: block;
  width: 100%;
  height: 100%;
}

#playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  opacity: 0;
  pointer-events: none;
}

#hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
  color: var(--dim);
}

#app.chosen #hint {
  display: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

#name {
  flex: 1;
  min-width: 90px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 8px;
  background: none;
  font-weight: 700;
  text-overflow: ellipsis;
}

#name:hover, #name:focus {
  border-color: var(--line);
  background: var(--well);
  outline: none;
}

#facts {
  max-width: 45%;
  overflow: hidden;
  color: var(--dim);
  font: 12px var(--mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

#strength {
  width: 90px;
  accent-color: var(--hue);
}

.row label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dim);
}

h2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
  font: 700 11px var(--mono);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--dim);
}

h2 small {
  flex: 1;
  font: 11px system-ui,sans-serif;
  letter-spacing: 0;
  text-transform: none;
  opacity: .8;
}

h2 button {
  padding: 3px 9px;
  font: 12px system-ui,sans-serif;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink);
}

/* as tall as the family in it, up to a height it scrolls within */
#tree {
  position: relative;
  max-height: 320px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--well);
  overflow: auto;
}

#family {
  position: relative;
  min-width: 100%;
  min-height: 100%;
}

#family > .none {
  padding: 14px;
}

#family svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

#family path {
  fill: none;
  stroke: #3a3e52;
  stroke-width: 1.5;
}

#family path.lit {
  stroke: var(--hue);
  stroke-width: 2;
}

#family path.blend {
  stroke-dasharray: 4 4;
}

.tile {
  position: absolute;
  display: block;
  width: 96px;
  height: 62px;
  padding: 4px 5px 3px;
  border-radius: 6px;
  text-align: left;
}

.tile canvas {
  display: block;
  width: 100%;
  height: 26px;
}

.tile span, .tile small {
  display: block;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.25;
  color: var(--dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile small {
  font-size: 10px;
  opacity: .75;
}

.tile em {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--c);
  color: #0b0c12;
  font: 700 10px/14px var(--mono);
}

.tile.way {
  border-color: var(--c);
}

.tile.marked {
  outline: 2px dashed var(--ink);
  outline-offset: 2px;
}

.tile.playing {
  background: #2c3042;
}

.ghost {
  position: absolute;
  display: flex;
  align-items: center;
  width: 96px;
  height: 62px;
  padding: 5px;
  border: 1px dashed #3a3e52;
  border-radius: 6px;
  color: var(--dim);
  font-size: 10px;
  line-height: 1.25;
}

#note {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  color: var(--dim);
}

#note button {
  padding: 3px 9px;
  font-size: 12px;
  color: var(--ink);
}

#blend {
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile:hover:not(:disabled) {
  border-color: var(--c);
}

.tile.on {
  border-color: var(--c);
  box-shadow: inset 0 0 0 1px var(--c);
}

.tile.on span {
  color: var(--ink);
}

.tile.kept::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
}

.none {
  color: var(--dim);
}

#notice {
  color: #ffb4a8;
}

#notice:empty {
  display: none;
}

#kit {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#kit li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
}

#kit li i {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
}

#kit li input {
  flex: 1;
  min-width: 60px;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 5px;
  background: none;
  text-overflow: ellipsis;
}

#kit li input:hover, #kit li input:focus {
  border-color: var(--line);
  background: var(--well);
  outline: none;
}

#kit li span {
  color: var(--dim);
  font: 11px var(--mono);
  white-space: nowrap;
}

#kit li button {
  padding: 3px 8px;
  font-size: 12px;
}

#tweak {
  border-left: 1px solid var(--line);
  overflow: auto;
  padding: 10px 12px 20px;
}

#tweak.idle {
  opacity: .45;
  pointer-events: none;
}

#tweak h2 {
  margin: 0 0 10px;
}

#steer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.steer {
  display: grid;
  grid-template-columns: 68px 1fr 1fr 34px;
  align-items: center;
  gap: 6px;
}

.steer span {
  color: var(--dim);
  font-size: 12px;
}

.steer button {
  padding: 6px 0;
  font-size: 12px;
}

.steer svg {
  display: block;
  width: 16px;
  height: 16px;
  margin: 0 auto;
  fill: currentColor;
}

#knobs > summary {
  margin-bottom: 6px;
}

#waves {
  display: grid;
  grid-template-columns: repeat(5,1fr);
  gap: 4px;
  margin-bottom: 6px;
}

#waves button {
  padding: 5px 0;
  font-size: 12px;
}

#waves button.on {
  border-color: var(--hue);
  color: var(--hue);
}

details {
  border-top: 1px solid var(--line);
  padding: 6px 0;
}

summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font: 700 11px var(--mono);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--dim);
  cursor: pointer;
  list-style: none;
}

summary::-webkit-details-marker {
  display: none;
}

summary::before {
  content: "+";
  width: 10px;
}

details[open] summary::before {
  content: "-";
}

details.used summary::after {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--hue);
}

.knob {
  display: grid;
  grid-template-columns: 92px minmax(0,1fr) 88px;
  align-items: center;
  gap: 8px;
  height: 24px;
}

.knob span {
  overflow: hidden;
  color: var(--dim);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knob input {
  width: 100%;
  accent-color: var(--hue);
}

.knob output {
  overflow: hidden;
  font: 11px var(--mono);
  text-align: right;
  white-space: nowrap;
}

.knob.changed span {
  color: var(--ink);
}

#keys {
  margin-top: 10px;
  color: var(--dim);
  font-size: 11px;
  line-height: 1.6;
}

#sheet {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(6,7,12,.72);
}

#sheet.hidden {
  display: none;
}

#sheet .card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(760px,100%);
  max-height: 100%;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

#sheet h3 {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#sheet p {
  color: var(--dim);
}

#sheet textarea {
  flex: 1;
  min-height: 260px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--well);
  font: 11px/1.45 var(--mono);
  white-space: pre;
  resize: none;
}

#sheet .row {
  justify-content: flex-end;
}

#copied {
  flex: 1;
  color: var(--dim);
}

@media (max-width: 760px) {
  html, body {
    height: auto;
  }

  #app {
    height: auto;
  }

  header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  /* one column: the steering sits under the family, the kit after it */
  main {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 20px;
  }

  #bench {
    display: contents;
  }

  #tweak {
    order: 1;
    overflow: visible;
    padding: 0;
    border-left: 0;
  }

  #kitHead, #notice, #kit {
    order: 2;
  }

  #scope {
    height: 150px;
  }

  #keys {
    display: none;
  }
}
</style>
</head>
<body>

<div id="app">
  <header>
    <h1>Zap Lab</h1>
    <div id="buckets" role="group" aria-label="Kinds of sound"></div>
  </header>
  <main>
    <section id="bench">
      <div id="scope">
        <canvas id="picture"></canvas>
        <div id="playhead"></div>
        <div id="hint">Pick a kind of sound above. Every click makes a new one and plays it.</div>
      </div>
      <div class="row">
        <button id="play" class="main" disabled>Play</button>
        <input id="name" type="text" maxlength="40" aria-label="The sound's name" disabled>
        <span id="facts"></span>
        <button id="keep" disabled>Keep</button>
        <button id="wav" disabled>WAV</button>
        <button id="code" disabled>Code</button>
      </div>
      <div class="row">
        <button id="mutate" disabled>Mutate</button>
        <label>Subtle <input id="strength" type="range" min="0" max="1" step=".01" value=".3" aria-label="How far a mutation or a roll goes"> Wild</label>
        <button id="mark" disabled>Mark to blend</button>
        <button id="blend" disabled>Blend</button>
        <button id="remove" disabled>Remove</button>
      </div>
      <h2>Family <small>A sound never changes. Whatever you do to one makes a new sound beside it.</small></h2>
      <div id="tree"><div id="family"></div></div>
      <div id="note"><span id="noteText"></span><button id="putBack" hidden>Put back</button></div>
      <h2 id="kitHead">Kit <small id="kitFacts">Kept with this document.</small><button id="kitCode" disabled>Kit code</button></h2>
      <div id="notice"></div>
      <ul id="kit"></ul>
    </section>
    <section id="tweak" class="idle">
      <h2>Steer <small>A step goes there. The dice roll that one thing, and you stay to roll again.</small></h2>
      <div id="steer"></div>
      <details id="knobs">
        <summary>All the knobs</summary>
        <div id="waves" role="group" aria-label="Wave"></div>
        <div id="groups"></div>
      </details>
      <p id="keys">Space plays. M mutates. B blends with the marked sound. K keeps. Delete removes. Enter starts another of its kind. The arrow keys walk the family: left to the sound it was made from, right to what was made from it, up and down among those beside it.</p>
    </section>
  </main>
  <div id="sheet" class="hidden">
    <div class="card" role="dialog" aria-labelledby="sheetTitle">
      <h3 id="sheetTitle"></h3>
      <p>Paste it into any page. It loads nothing: <code>zap</code> makes each sound's samples from its record and <code>play</code> plays one by name.</p>
      <textarea readonly spellcheck="false" aria-label="The code"></textarea>
      <div class="row"><span id="copied"></span><button id="copy" class="main">Copy</button><button id="close">Close</button></div>
    </div>
  </div>
</div>

<script>
// Zap Lab: a bench for game sound effects. A kind of sound is picked, each click
// starts another of that kind, the one that is close is steered closer by ear
// (mutated, stepped and blended, each a new sound beside the last), and it leaves as
// a WAV or as code that makes it. Every sound is a small record that `render` turns
// into samples; the code it gives is that same function and the records.
// The document's `sounds.json` app-content holds the kit: a line for each sound kept
// ********************************************************************************
(() => {
'use strict';

// == Engine ======================================================================
// a sound's record: what `render` reads. A record holds only what differs from this.
// Times are seconds, pitches Hz, slides octaves a second, a jump semitones
const DEFAULTS = Object.freeze({
  wave: 'square', duty: .5, dutySweep: 0, noise: 0,
  attack: 0, sustain: .2, punch: 0, decay: .3, curve: 1,
  freq: 440, slide: 0, slideChange: 0, minFreq: 0, vibDepth: 0, vibSpeed: 0, jump: 0, jumpAt: 0, repeat: 0,
  lowPass: 0, lowPassSweep: 0, resonance: 0, highPass: 0, highPassSweep: 0,
  flange: 0, flangeSweep: 0,
  fm: 0, fmRatio: 2, fmDecay: 0,
  drive: 0, bits: 0, echo: 0, echoTime: .15, echoFeedback: .3,
  volume: .3, seed: 1,
});

// a sound's samples, 44,100 a second and each -1..1. One voice (a square, saw,
// triangle or sine wave, or noise that has a pitch) whose pitch slides, wobbles,
// jumps and starts over, under an envelope, through a low-pass and a high-pass filter
// and a flanger, then driven, crushed and echoed. The voice is made eight times
// finer than it is heard
// NOTE: this function is the code Zap Lab gives away, as written: it reads nothing
//       but `DEFAULTS`
const render = (sound) => {
  const p = { ...DEFAULTS, ...sound };
  const RATE = 44100, OVER = 8, FAST = RATE * OVER, TAU = Math.PI * 2;
  const wave = ['square', 'saw', 'triangle', 'sine', 'noise'].indexOf(p.wave);
  const noisy = (wave === 4) || (p.noise > 0);

  // the noise: 32 values a period, the same for a seed every time
  let seed = p.seed | 0;
  const random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const grains = new Float32Array(32);
  const refill = () => { for(let i = 0; i < 32; i++) grains[i] = (random() * 2) - 1; };
  refill();

  // the envelope's three stages, in samples
  const stages = [p.attack, p.sustain, p.decay].map((seconds) => Math.max(0, seconds) * RATE);
  const length = Math.max(1, Math.ceil(stages[0] + stages[1] + stages[2]));
  const dry = new Float32Array(length);

  // the pitch (as a period, in fine samples), set again at each repeat
  let period = 0, slide = 0, duty = 0, jumpIn = -1;
  const restart = () => {
    period = FAST / Math.max(1, p.freq);
    slide = p.slide; duty = p.duty;
    jumpIn = p.jump ? Math.round(p.jumpAt * RATE) : -1/*none*/;
  };
  restart();
  const longest = FAST / (p.minFreq || 3.5);
  const repeatEvery = p.repeat ? Math.max(32, Math.round(RATE / p.repeat)) : 0;

  // the low-pass is a resonant one: its pull is the square of the pitch it turns over at
  let lowPass = p.lowPass ? Math.min(.1, ((TAU * p.lowPass) / FAST) ** 2) : 0;
  const lowPassStep = 2 ** ((2 * p.lowPassSweep) / FAST);
  const damping = Math.min(.8, (5 / (1 + (p.resonance * p.resonance * 20))) * (.01 + lowPass));
  let highPass = (TAU * p.highPass) / FAST;
  const highPassStep = 2 ** (p.highPassSweep / RATE);
  let flange = (p.flange / 1000) * FAST;
  const flangeStep = (p.flangeSweep / 1000) * OVER;
  const line = new Float32Array(1024);
  const overdrive = 1 + (p.drive * 12), crush = p.bits ? 2 ** (p.bits - 1) : 0;

  let phase = 0, vibrato = 0, modulator = 0, low = 0, lowSpeed = 0, high = 0, at = 0, written = 0;
  for(let i = 0, stage = 0, into = 0; i < length; i++, into++) {
    if(repeatEvery && i && !(i % repeatEvery)) restart();
    if(jumpIn-- === 0) period /= 2 ** (p.jump / 12);
    slide += p.slideChange / RATE;
    period *= 2 ** (-slide / RATE);
    if(period > longest) {
      period = longest;
      if(p.minFreq) break/*the pitch fell to where the sound ends*/;
    } /* else -- above the lowest pitch */
    vibrato += (TAU * p.vibSpeed) / RATE;
    const span = Math.max(8, Math.floor(period * (1 + (Math.sin(vibrato) * p.vibDepth))));
    duty = Math.min(.5, Math.max(0, duty + (p.dutySweep / RATE)));

    while((stage < 2) && (into >= stages[stage])) { into = 0; stage++; }
    const level = (stage === 0) ? into / stages[0]
      : (stage === 1) ? 1 + ((1 - (into / stages[1])) * 2 * p.punch)
      : stages[2] ? Math.max(0, 1 - (into / stages[2])) ** p.curve : 0;

    flange += flangeStep;
    const tap = Math.min(1023, Math.abs(Math.floor(flange)));
    highPass = Math.min(.1, Math.max(.00001, highPass * highPassStep));
    const index = (p.fm * (p.fmDecay ? Math.exp(-i / (p.fmDecay * RATE)) : 1)) / TAU;

    let sum = 0;
    for(let fine = 0; fine < OVER; fine++) {
      if(++phase >= span) {
        phase %= span;
        if(noisy) refill();
      } /* else -- within the period */
      let turn = phase / span;
      if(index) {
        modulator += p.fmRatio / span;
        turn += index * Math.sin(TAU * modulator);
        turn -= Math.floor(turn);
      } /* else -- no modulator */
      const grain = grains[Math.floor((phase * 32) / span)];
      let sample = (wave === 4) ? grain
        : (wave === 1) ? 1 - (turn * 2)
        : (wave === 2) ? Math.abs((turn * 4) - 2) - 1
        : (wave === 3) ? Math.sin(TAU * turn)
        : (turn < duty) ? .5 : -.5;
      if(p.noise && (wave !== 4)) sample += (grain - sample) * p.noise;

      const before = low;
      if(p.lowPass) {
        lowPass = Math.min(.1, lowPass * lowPassStep);
        lowSpeed += (sample - low) * lowPass;
        lowSpeed -= lowSpeed * damping;
      } else {
        low = sample; lowSpeed = 0;
      }
      low += lowSpeed;
      high += low - before;
      high -= high * highPass;

      // the flanger: the voice over itself a moment late
      line[at & 1023] = high;
      sum += (high + line[(at - tap + 1024) & 1023]) * level;
      at = (at + 1) & 1023;
    }

    let out = sum / OVER;
    if(p.drive) out = Math.tanh(out * overdrive) / Math.tanh(overdrive);
    out *= p.volume;
    if(crush) out = Math.round(out * crush) / crush;
    dry[written++] = Math.max(-1, Math.min(1, out));
  }
  const heard = dry.subarray(0, Math.max(1, written));
  if(!p.echo) return heard;

  // the echo: the sound again, each time later and quieter
  const delay = Math.max(1, Math.round(p.echoTime * RATE));
  const feedback = Math.max(0, Math.min(.9, p.echoFeedback));
  const echoes = feedback ? Math.min(12, Math.ceil(Math.log(.02) / Math.log(feedback))) : 1;
  const echoed = new Float32Array(heard.length + (delay * echoes));
  for(let i = delay; i < echoed.length; i++) echoed[i] = ((heard[i - delay] ?? 0) * p.echo) + (echoed[i - delay] * feedback);
  for(let i = 0; i < echoed.length; i++) echoed[i] = Math.max(-1, Math.min(1, echoed[i] + (heard[i] ?? 0)));
  return echoed;
};

// == Constants ===================================================================
const RATE = 44100;
const TAU = Math.PI * 2;
const WAVES = Object.freeze([['square', 'Square'], ['saw', 'Saw'], ['triangle', 'Triangle'], ['sine', 'Sine'], ['noise', 'Noise']]);

// the most sounds started from a kind, sounds in all, and sounds in the kit
const ROOTS_MAX = 40;
const SOUNDS_MAX = 400;
const KIT_MAX = 100;

// a sound's tile in the family, and how far apart the columns and rows are
const TILE_WIDTH = 96, TILE_HEIGHT = 62, COLUMN_WIDTH = 126, ROW_HEIGHT = 70, TREE_PAD = 10;
const SVG = 'http://www.w3.org/2000/svg';
// the dice on a steering row
const DICE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.3"/><circle cx="11" cy="5" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="5" cy="11" r="1.3"/><circle cx="11" cy="11" r="1.3"/></svg>';
const NAME_MAX = 40;

// the app-content holding the kit, and the code its writes are refused with
const APP_CONTENT_NAME = 'sounds.json';
const APP_CONTENT_SELECTOR = `[name='${APP_CONTENT_NAME}']`;
const CONTENT_CONFLICT = 'app/content-conflict';
const SOUND_KIND = 'sound';
// how often a refused write is made again on the app-content that follows
const WRITE_TRIES = 3;

// the least there is to hear: a sound shorter or quieter is made again, this often
const LEAST_SECONDS = .03;
const LEAST_LEVEL = .02;
const MAKE_TRIES = 8;

// the picture of a sound: how many moments and pitches it shows, between which pitches
const FFT_SIZE = 1024;
const PICTURE_COLUMNS = 220;
const PICTURE_ROWS = 72;
const LOWEST_HZ = 60, HIGHEST_HZ = 18000;
// how far below a sound's loudest pitch the picture goes dark, in decibels
const PICTURE_RANGE = 62;

// == Knobs =======================================================================
// how a slider's place (0..1) and a value answer each other. `off`: the value at
// which what the knob does is off
const lin = (min, max) => ({ to: (t) => min + ((max - min) * t), from: (v) => (v - min) / (max - min) });
const log = (min, max) => ({ to: (t) => min * ((max / min) ** t), from: (v) => Math.log(Math.max(v, min) / min) / Math.log(max / min) });
// from nothing up, finer near nothing
const rise = (max, power = 2) => ({ to: (t) => max * (t ** power), from: (v) => (Math.max(0, v) / max) ** (1 / power) });
// either way from the middle, finer near it
const both = (max, power = 1) => ({
  to: (t) => { const x = (t * 2) - 1; return Math.sign(x) * (Math.abs(x) ** power) * max; },
  from: (v) => ((Math.sign(v) * ((Math.min(max, Math.abs(v)) / max) ** (1 / power))) + 1) / 2,
});
// a range with off below it, or above it
const offBelow = (min, max) => { const scale = log(min, max); return { to: (t) => (t <= 0) ? 0 : scale.to(t), from: (v) => (v <= 0) ? 0 : Math.max(.004, scale.from(v)), off: 0 }; };
const offAbove = (min, max) => { const scale = log(min, max); return { to: (t) => (t >= 1) ? 0 : scale.to(t), from: (v) => (v <= 0) ? 1 : Math.min(.996, scale.from(v)), off: 0 }; };
// whole bits, off under two
const bits = (max) => ({ to: (t) => { const value = Math.round(t * max); return (value < 2) ? 0 : value; }, from: (v) => v / max, off: 0 });

const hertz = (v) => (v < 1000) ? `${Number(v.toPrecision(3))} Hz` : `${(v / 1000).toFixed(2)} kHz`;
const seconds = (v) => (v < 1) ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
const percent = (v) => `${Math.round(v * 100)}%`;
const signed = (unit, digits = 1) => (v) => `${(v > 0) ? '+' : ''}${v.toFixed(digits)} ${unit}`;
const plain = (unit = '', digits = 2) => (v) => `${v.toFixed(digits)}${unit}`;

const knob = (key, label, scale, show, off = scale.off) => ({ key, label, scale, show, off });

// the knobs, in the groups the tweak panel shows. `quiet`: a group that starts
// closed and is marked when a sound uses it
const GROUPS = [
  { name: 'Envelope', knobs: [
    knob('attack', 'Attack', rise(2.2), seconds),
    knob('sustain', 'Sustain', rise(2.2), seconds),
    knob('punch', 'Punch', lin(0, 1), percent),
    knob('decay', 'Decay', rise(2.2), seconds),
    knob('curve', 'Decay curve', lin(.5, 4), plain()),
    knob('volume', 'Volume', lin(0, 1), percent),
  ] },
  { name: 'Pitch', knobs: [
    knob('freq', 'Pitch', log(3.5, 3600), hertz),
    knob('slide', 'Slide', both(640, 3), signed('oct/s')),
    knob('slideChange', 'Slide change', both(2800, 3), signed('oct/s2')),
    knob('minFreq', 'Ends at', offBelow(3.5, 3600), hertz),
    knob('jump', 'Jump', both(40), signed('st'), 0),
    knob('jumpAt', 'Jump after', rise(.46), seconds),
    knob('vibDepth', 'Vibrato', lin(0, .5), percent, 0),
    knob('vibSpeed', 'Vibrato speed', rise(70), plain(' Hz', 1)),
    knob('repeat', 'Repeat', offBelow(2, 1400), plain(' Hz', 1)),
  ] },
  { name: 'Shape', knobs: [
    knob('duty', 'Square width', lin(.01, .5), percent),
    knob('dutySweep', 'Width sweep', both(2.2), signed('/s', 2)),
    knob('noise', 'Noise in it', lin(0, 1), percent, 0),
  ] },
  { name: 'Filter', quiet: true, knobs: [
    knob('lowPass', 'Low-pass', offAbove(100, 17000), hertz),
    knob('lowPassSweep', 'Low sweep', both(25), signed('oct/s')),
    knob('resonance', 'Resonance', lin(0, 1), percent),
    knob('highPass', 'High-pass', offBelow(10, 5600), hertz),
    knob('highPassSweep', 'High sweep', both(19), signed('oct/s')),
  ] },
  { name: 'Flanger', quiet: true, knobs: [
    knob('flange', 'Offset', both(2.9, 2), signed('ms', 2), 0),
    knob('flangeSweep', 'Sweep', both(125, 2), signed('ms/s')),
  ] },
  { name: 'FM', quiet: true, knobs: [
    knob('fm', 'Amount', rise(12), plain(), 0),
    knob('fmRatio', 'Ratio', log(.25, 8), plain('x')),
    knob('fmDecay', 'Fades over', offBelow(.02, 2), seconds),
  ] },
  { name: 'Finish', quiet: true, knobs: [
    knob('drive', 'Drive', lin(0, 1), percent, 0),
    knob('bits', 'Crush to', bits(12), plain(' bits', 0)),
    knob('echo', 'Echo', lin(0, .8), percent, 0),
    knob('echoTime', 'Echo after', log(.03, .6), seconds),
    knob('echoFeedback', 'Echo repeats', lin(0, .85), percent),
  ] },
];
const KNOBS = GROUPS.flatMap((group) => group.knobs);
// the least and the most each knob gives
for(const each of KNOBS) {
  const values = [0, .001, .5, .999, 1].map((t) => each.scale.to(t));
  each.low = Math.min(...values); each.high = Math.max(...values);
}

// a number as a record holds it
const tidy = (value) => Number(value.toPrecision(4));

// a whole record from whatever was given: every value of its kind and in its knob's
// range, the rest as `DEFAULTS` has them
const recordOf = (given) => {
  const record = { ...DEFAULTS };
  if(WAVES.some(([wave]) => wave === given?.wave)) record.wave = given.wave;
  for(const { key, low, high } of KNOBS) {
    if(Number.isFinite(given?.[key])) record[key] = tidy(Math.min(high, Math.max(low, given[key])));
  }
  if(Number.isFinite(given?.seed)) record.seed = Math.floor(given.seed);
  return record;
};
// only what differs from `DEFAULTS`: what is kept and given away
const briefOf = (record) => Object.fromEntries(Object.keys(DEFAULTS).filter((key) => record[key] !== DEFAULTS[key]).map((key) => [key, record[key]]));

// == Buckets =====================================================================
const frnd = (range) => Math.random() * range;
const chance = (odds = .5) => Math.random() < odds;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// the first eight kinds follow the ranges of the classic generator (sfxr; jsfxr, its
// JavaScript port, is under the Unlicense), each 0..1 or -1..1: those measures as
// this engine's
const classic = Object.freeze({
  hz: (v) => 3528 * ((v * v) + .001),
  seconds: (v) => v * v * (100000 / RATE),
  slide: (v) => -RATE * Math.log2(1 - ((v ** 3) * .01)),
  vibDepth: (v) => v * .5,
  vibSpeed: (v) => v * v * 70.19,
  jump: (v) => -12 * Math.log2((v >= 0) ? 1 - (v * v * .9) : 1 + (v * v * 10)),
  jumpAt: (v) => (Math.floor(((1 - v) ** 2) * 20000) + 32) / RATE,
  duty: (v) => .5 - (v * .5),
  dutySweep: (v) => -v * 2.205,
  repeat: (v) => RATE / (Math.floor(((1 - v) ** 2) * 20000) + 32),
  flange: (v) => Math.sign(v) * v * v * 2.891,
  flangeSweep: (v) => Math.sign(v) * v * v * 125,
  lowPass: (v) => Math.sqrt((v ** 3) * .1) * 56150,
  highPass: (v) => v * v * 5615,
});

const explosion = () => {
  const s = { wave: 'noise', attack: 0, sustain: classic.seconds(.1 + frnd(.3)), decay: classic.seconds(frnd(.5)), punch: .2 + frnd(.6) };
  if(chance()) { s.freq = classic.hz((.1 + frnd(.4)) ** 2); s.slide = classic.slide(-.1 + frnd(.4)); }
  else { s.freq = classic.hz((.2 + frnd(.7)) ** 2); s.slide = classic.slide(-.2 - frnd(.2)); }
  if(chance(.2)) s.slide = 0;
  if(chance(.33)) s.repeat = classic.repeat(.3 + frnd(.5));
  if(chance()) { s.flange = classic.flange(-.3 + frnd(.9)); s.flangeSweep = classic.flangeSweep(-frnd(.3)); }
  if(chance()) { s.vibDepth = classic.vibDepth(frnd(.7)); s.vibSpeed = classic.vibSpeed(frnd(.6)); }
  if(chance(.33)) { s.jumpAt = classic.jumpAt(.6 + frnd(.3)); s.jump = classic.jump(.8 - frnd(1.6)); }
  return s;
};
const hit = () => {
  const s = { wave: pick(['square', 'saw', 'noise']), freq: classic.hz(.2 + frnd(.6)), slide: classic.slide(-.3 - frnd(.4)), attack: 0, sustain: classic.seconds(frnd(.1)), decay: classic.seconds(.1 + frnd(.2)) };
  if(s.wave === 'square') s.duty = classic.duty(frnd(.6));
  if(chance()) s.highPass = classic.highPass(frnd(.3));
  return s;
};

// each kind of sound: its name, its color and what makes one. Some of what it gives
// is by chance, so the next click is another of the kind
const BUCKETS = [
  { id: 'coin', label: 'Coin', color: '#ffd23f', make: () => {
    const s = { wave: pick(['square', 'saw']), freq: classic.hz(.4 + frnd(.5)), attack: 0, sustain: classic.seconds(frnd(.1)), decay: classic.seconds(.1 + frnd(.4)), punch: .3 + frnd(.3) };
    if(chance()) { s.jumpAt = classic.jumpAt(.5 + frnd(.2)); s.jump = classic.jump(.2 + frnd(.4)); }
    return s;
  } },
  { id: 'laser', label: 'Laser', color: '#ff5d8f', make: () => {
    const s = { wave: pick(['square', 'square', 'saw', 'saw', 'sine']), attack: 0, sustain: classic.seconds(.1 + frnd(.2)), decay: classic.seconds(frnd(.4)) };
    if(chance(.33)) {
      s.freq = classic.hz(.3 + frnd(.6)); s.minFreq = classic.hz(frnd(.1)); s.slide = classic.slide(-.35 - frnd(.3));
    } else {
      const base = .5 + frnd(.5);
      s.freq = classic.hz(base); s.minFreq = classic.hz(Math.max(.2, base - .2 - frnd(.6))); s.slide = classic.slide(-.15 - frnd(.2));
    }
    if(chance()) { s.duty = classic.duty(frnd(.5)); s.dutySweep = classic.dutySweep(frnd(.2)); }
    else { s.duty = classic.duty(.4 + frnd(.5)); s.dutySweep = classic.dutySweep(-frnd(.7)); }
    if(chance()) s.punch = frnd(.3);
    if(chance(.33)) { s.flange = classic.flange(frnd(.2)); s.flangeSweep = classic.flangeSweep(-frnd(.2)); }
    if(chance()) s.highPass = classic.highPass(frnd(.3));
    return s;
  } },
  { id: 'explosion', label: 'Explosion', color: '#ff8c42', make: explosion },
  { id: 'powerup', label: 'Power-up', color: '#4de2c5', make: () => {
    const s = { wave: chance() ? 'saw' : 'square', freq: classic.hz(.2 + frnd(.3)), attack: 0, sustain: classic.seconds(frnd(.4)), decay: classic.seconds(.1 + frnd(.4)) };
    if(s.wave === 'square') s.duty = classic.duty(frnd(.6));
    if(chance()) {
      s.slide = classic.slide(.1 + frnd(.4)); s.repeat = classic.repeat(.4 + frnd(.4));
    } else {
      s.slide = classic.slide(.05 + frnd(.2));
      if(chance()) { s.vibDepth = classic.vibDepth(frnd(.7)); s.vibSpeed = classic.vibSpeed(frnd(.6)); }
    }
    return s;
  } },
  { id: 'hit', label: 'Hit', color: '#ef476f', make: hit },
  { id: 'jump', label: 'Jump', color: '#9bdb4d', make: () => {
    const s = { wave: 'square', duty: classic.duty(frnd(.6)), freq: classic.hz(.3 + frnd(.3)), slide: classic.slide(.1 + frnd(.2)), attack: 0, sustain: classic.seconds(.1 + frnd(.3)), decay: classic.seconds(.1 + frnd(.2)) };
    if(chance()) s.highPass = classic.highPass(frnd(.3));
    if(chance()) s.lowPass = classic.lowPass(1 - frnd(.6));
    return s;
  } },
  { id: 'blip', label: 'Blip', color: '#5cc8ff', make: () => {
    const s = { wave: chance() ? 'square' : 'saw', freq: classic.hz(.2 + frnd(.4)), attack: 0, sustain: classic.seconds(.1 + frnd(.1)), decay: classic.seconds(frnd(.2)), highPass: classic.highPass(.1) };
    if(s.wave === 'square') s.duty = classic.duty(frnd(.6));
    return s;
  } },
  { id: 'click', label: 'Click', color: '#c9c9d6', make: () => {
    const s = chance() ? explosion() : hit();
    if(chance()) s.slide = classic.slide(-.5 + frnd(1));
    if(chance()) { s.sustain *= (frnd(.4) + .2) ** 2; s.decay *= (frnd(.4) + .2) ** 2; }
    if(chance(.25)) s.attack = classic.seconds(frnd(.3));
    s.freq = classic.hz(1 - frnd(.25)); s.highPass = classic.highPass(1 - frnd(.1));
    return s;
  } },
  { id: 'zap', label: 'Zap', color: '#b388ff', make: () => {
    const s = { wave: pick(['saw', 'square', 'sine']), duty: .2 + frnd(.3), freq: 600 + frnd(2200), slide: -(6 + frnd(22)), fm: 2 + frnd(7), fmRatio: pick([.5, 1.41, 2.37, 3.14, 5.3]), fmDecay: .05 + frnd(.2), attack: 0, sustain: .04 + frnd(.12), decay: .08 + frnd(.25), punch: frnd(.4) };
    if(chance()) s.minFreq = 40 + frnd(120);
    if(chance()) s.highPass = 80 + frnd(500);
    if(chance(.4)) { s.flange = frnd(1.2); s.flangeSweep = -frnd(20); }
    return s;
  } },
  { id: 'whoosh', label: 'Whoosh', color: '#7fd8f5', make: () => {
    const s = { wave: 'noise', freq: 1200 + frnd(2200), resonance: .2 + frnd(.5), attack: .06 + frnd(.25), sustain: .03 + frnd(.15), decay: .15 + frnd(.45), curve: 1.5 + frnd(1), highPass: frnd(300), volume: .6 };
    if(chance()) { s.lowPass = 200 + frnd(500); s.lowPassSweep = 2 + frnd(6); }
    else { s.lowPass = 1500 + frnd(3000); s.lowPassSweep = -(2 + frnd(5)); }
    return s;
  } },
  { id: 'thud', label: 'Thud', color: '#c98a5a', make: () =>
    ({ wave: pick(['sine', 'triangle']), freq: 70 + frnd(110), slide: -(3 + frnd(9)), attack: 0, sustain: .015 + frnd(.05), decay: .08 + frnd(.25), punch: .2 + frnd(.5), curve: 1.5 + frnd(1.5), noise: frnd(.35), lowPass: 600 + frnd(1800), drive: frnd(.5), volume: .4 }) },
  { id: 'chime', label: 'Chime', color: '#ffe9a8', make: () => {
    const s = { wave: 'sine', freq: pick([523, 659, 784, 988, 1175, 1319, 1568]), fm: 1 + frnd(3.5), fmRatio: pick([1.41, 2, 2.76, 3.5, 5.4, 7]), fmDecay: .08 + frnd(.3), attack: 0, sustain: .01 + frnd(.05), decay: .35 + frnd(.8), curve: 2 + frnd(1.5), volume: .25 };
    if(chance(.4)) { s.jump = pick([4, 5, 7, 12]); s.jumpAt = .06 + frnd(.06); }
    if(chance()) { s.echo = .15 + frnd(.25); s.echoTime = .09 + frnd(.2); s.echoFeedback = .25 + frnd(.3); }
    return s;
  } },
  { id: 'alarm', label: 'Alarm', color: '#ff6b6b', make: () => {
    const s = { wave: pick(['square', 'saw']), duty: .25 + frnd(.25), freq: 450 + frnd(700), attack: .005, sustain: .5 + frnd(.7), decay: .05 + frnd(.15), volume: .22 };
    switch(pick(['wobble', 'sweep', 'two'])) {
      case 'wobble': s.vibDepth = .08 + frnd(.25); s.vibSpeed = 3 + frnd(9); break;
      case 'sweep': s.repeat = 2.5 + frnd(6); s.slide = (chance() ? 1 : -1) * (1.5 + frnd(3.5)); break;
      default: s.jumpAt = .12 + frnd(.13); s.jump = (chance() ? 1 : -1) * (3 + frnd(4)); s.repeat = 1 / (s.jumpAt * 2); break;
    }
    if(chance()) s.lowPass = 2500 + frnd(2500);
    return s;
  } },
  // any of the others, mutated a long way
  { id: 'wild', label: 'Wild', color: '#f472ff', make: () => mutationOf(recordOf(pick(BUCKETS.slice(0, -1)).make()), .32) },
];
const bucketOf = (id) => BUCKETS.find((bucket) => bucket.id === id) ?? BUCKETS.at(-1);

const newSeed = () => 1 + Math.floor(Math.random() * 99999);

// a record near another: some of its knobs (`keys`: these alone; `odds`: how many of
// them) moved by up to `strength` of their travel. A knob that is off mostly stays
// off (`wakes`: how often it does not)
function mutationOf(record, strength, { keys = null, odds = .5, wakes = .2 } = {}) {
  const mutant = { ...record, seed: newSeed() };
  for(const { key, scale, off } of KNOBS) {
    if((keys && !keys.includes(key)) || !chance(odds) || ((off !== undefined) && (record[key] === off) && !chance(wakes))) continue/*left alone*/;
    const place = Math.min(1, Math.max(0, scale.from(record[key]) + ((Math.random() - .5) * 2 * strength)));
    mutant[key] = scale.to(place);
  }
  return recordOf(mutant);
}

// == Steering ====================================================================
const knobOf = (key) => KNOBS.find((each) => each.key === key);
// how long a record's envelope lasts, in seconds, and how far a step bends a
// sound's pitch over that, in octaves
const spanOf = (r) => Math.max(.05, r.attack + r.sustain + r.decay);
const BEND_OCTAVES = .5;
// three semitones of pitch, as a ratio
const PITCH_STEP = 2 ** (3 / 12);
// a record a step darker or brighter. A low-pass filter closes or opens; with none,
// darker puts one a little above the pitch, and brighter thins the sound from
// beneath (a high-pass at its pitch, then higher) and narrows a square wave
const darker = (r) => (r.highPass > DARKEN_FLOOR) ? { highPass: ((r.highPass * .5) > DARKEN_FLOOR) ? r.highPass * .5 : 0, duty: Math.min(.5, r.duty / .75) }
  : { highPass: 0, lowPass: r.lowPass ? r.lowPass * .65 : Math.min(5000, Math.max(500, (r.wave === 'noise') ? 3000 : r.freq * 4)) };
const brighter = (r) => r.lowPass ? { lowPass: ((r.lowPass * 1.5) > 16000) ? 0 : r.lowPass * 1.5 }
  : { highPass: Math.max(r.highPass * 1.6, (r.wave === 'noise') ? 600 : r.freq), duty: Math.max(.08, r.duty * .75) };
// a high-pass under this, in Hz, is off to the ear: darker takes it away
const DARKEN_FLOOR = 60;

// a record played over `factor` times the time: its envelope that much longer and
// everything that moves in it that much slower, so it is the same sound for longer
// (a sound whose falling pitch ends it lasts that much longer too)
const stretched = (r, factor) => ({
  attack: r.attack * factor, sustain: r.sustain * factor, decay: (factor > 1) ? Math.max(.02, r.decay * factor) : r.decay * factor, jumpAt: r.jumpAt * factor, fmDecay: r.fmDecay * factor,
  slide: r.slide / factor, slideChange: r.slideChange / (factor * factor), repeat: r.repeat / factor,
  dutySweep: r.dutySweep / factor, lowPassSweep: r.lowPassSweep / factor, highPassSweep: r.highPassSweep / factor, flangeSweep: r.flangeSweep / factor,
});
// how often a roll that moved nothing is rolled again
const ROLL_TRIES = 6;

// what a person steers by, in place of the knobs. Each row is one quality of the
// sound: a step either way (its name, and what it changes in a record) and the knobs
// a roll of its dice moves. `says`: how far its steps go, as an Agent is told.
// `wave`: a roll may change the wave. `wakes`: the knob a roll turns on when it is
// off. `dice: false`: nothing to roll. Every knob is in one row
const ROWS = [
  { id: 'length', label: 'Length', knobs: ['sustain', 'decay', 'curve'], says: 'shorter and longer play the same sound over 0.7 or 1.4 times the time, its pitch moving as far in less or more time', steps: [
    ['Shorter', (r) => stretched(r, .7)],
    ['Longer', (r) => stretched(r, 1.4)],
  ] },
  { id: 'pitch', label: 'Pitch', knobs: ['freq', 'minFreq', 'jump', 'jumpAt'], says: 'lower and higher move the whole pitch 3 semitones', steps: [
    ['Lower', (r) => ({ freq: r.freq / PITCH_STEP, minFreq: r.minFreq / PITCH_STEP })],
    ['Higher', (r) => ({ freq: r.freq * PITCH_STEP, minFreq: r.minFreq * PITCH_STEP })],
  ] },
  { id: 'movement', label: 'Movement', knobs: ['slide', 'slideChange', 'vibDepth', 'vibSpeed', 'repeat'], says: 'fall more and rise more bend the pitch another half octave down or up over the sound', steps: [
    ['Fall more', (r) => ({ slide: r.slide - (BEND_OCTAVES / spanOf(r)) })],
    ['Rise more', (r) => ({ slide: r.slide + (BEND_OCTAVES / spanOf(r)) })],
  ] },
  { id: 'tone', label: 'Tone', wave: true, knobs: ['duty', 'dutySweep', 'noise', 'lowPass', 'lowPassSweep', 'resonance', 'highPass', 'highPassSweep', 'flange', 'flangeSweep', 'fm', 'fmRatio', 'fmDecay'], says: 'darker and brighter close or open a filter, lowering or raising the brightness', steps: [
    ['Darker', (r) => darker(r)],
    ['Brighter', (r) => brighter(r)],
  ] },
  { id: 'punch', label: 'Punch', knobs: ['attack', 'punch', 'drive', 'bits'], says: 'softer and punchier ease or sharpen how the sound starts', steps: [
    ['Softer', (r) => ({ attack: Math.max(r.attack * 1.6, r.attack + .012), punch: Math.max(0, r.punch - .2) })],
    ['Punchier', (r) => ({ attack: (r.attack < .004) ? 0 : r.attack * .4, punch: Math.min(1, r.punch + .2) })],
  ] },
  { id: 'space', label: 'Space', knobs: ['echo', 'echoTime', 'echoFeedback'], wakes: 'echo', says: 'drier and more echo take away or add echo', steps: [
    ['Drier', (r) => ({ echo: (r.echo < .13) ? 0 : r.echo - .12 })],
    ['More echo', (r) => ({ echo: r.echo ? r.echo + .12 : .2 })],
  ] },
  { id: 'volume', label: 'Volume', knobs: ['volume'], dice: false, says: 'quieter and louder scale the loudness by 0.8 or 1.25', steps: [
    ['Quieter', (r) => ({ volume: r.volume * .8 })],
    ['Louder', (r) => ({ volume: r.volume * 1.25 })],
  ] },
];

// a row's step from a record: the record with that change, or null when the step
// changes nothing (a sound with no echo gets no drier)
const steppedOf = (row, index, record) => {
  const stepped = recordOf({ ...record, ...row.steps[index][1](record) });
  return KNOBS.some(({ key }) => stepped[key] !== record[key]) ? stepped : null;
};

// a roll of one row's dice: its knobs moved, the rest as they were. Rolled again (a
// few times at most) while nothing moved
const rollOf = (row, record, strength) => {
  let rolled = record;
  for(let tries = 0; (tries < ROLL_TRIES) && !row.knobs.some((key) => rolled[key] !== record[key]) && (rolled.wave === record.wave); tries++) {
    rolled = mutationOf(record, Math.max(.12, strength), { keys: row.knobs, odds: .8, wakes: .5 });
    if(row.wave && chance(.3)) rolled.wave = pick(WAVES.map(([wave]) => wave).filter((wave) => wave !== record.wave));
    if(row.wakes && !rolled[row.wakes]) rolled[row.wakes] = .15 + frnd(.3);
    rolled = recordOf(rolled);
  }
  return rolled;
};

// a cross of two records: each row's knobs somewhere between the two, by the weight
// `weightOf` gives the row (0: the first's, 1: the second's)
const blendOf = (a, b, weightOf) => {
  const cross = { ...a, seed: newSeed() };
  for(const row of ROWS) {
    const weight = weightOf(row);
    for(const key of row.knobs) {
      const { scale } = knobOf(key);
      cross[key] = scale.to(scale.from(a[key]) + ((scale.from(b[key]) - scale.from(a[key])) * weight));
    }
    if(row.wave) cross.wave = (weight < .5) ? a.wave : b.wave;
  }
  return recordOf(cross);
};

// == Declarations ================================================================
// what an Agent is told of Zap Lab, and all it is told: each command's name,
// description and inputSchema. The commands are the moves a person makes with the
// buttons, on the same bench, so the person sees and hears each one. An Agent cannot
// hear: the descriptions say so, and the answers give measures to steer by
// SEE: Commands, which runs each
const TAKES_MAX = 5;

// the moves by the words an Agent is given: each steering row's step either way, a
// mutation, a roll of each row's dice and a blend
const MOVES = [
  ...ROWS.flatMap((row) => row.steps.map(([label], index) => ({ name: label.toLowerCase(), row, index }))),
  { name: 'mutate' },
  ...ROWS.filter((row) => row.dice !== false).map((row) => ({ name: `roll ${row.id}`, row })),
  { name: 'blend' },
];
// what each kind of sound is for, as an Agent is told
const KIND_SAYS = Object.freeze({ coin: 'a coin or a pickup', laser: 'a shot', explosion: 'a blast', powerup: 'a reward that rises', hit: 'a blow landing', jump: 'a hop', blip: 'a menu blip', click: 'a tick', zap: 'an electric crackle', whoosh: 'air rushing past', thud: 'a dull impact', chime: 'a bell', alarm: 'a siren', wild: 'any of the others, changed a long way' });
const rollWords = MOVES.filter((move) => (move.index === undefined) && move.row).map((move) => move.name).join(', ');
const soundArg = (what) => ({ type: 'string', description: `The name of ${what}, on the bench or in the kit. Left out: the selected sound.` });

const DECLARATIONS = [
  { name: 'look',
    description: 'Describe what is on Zap Lab\'s bench, a place for making game sound effects. Changes nothing and plays nothing. You cannot hear the sounds; the User can. So a sound is given in measures to steer by: its heard length in seconds, the pitch it starts and ends at in Hz and how the pitch moves between, its brightness (a higher number sounds brighter), its loudness (0 to 1) and whether it echoes. The answer also says how the sound was made, the steps it can still take (a step that would change nothing is left out), the sounds made from it, every sound started so far, and the kit: the kept sounds, which are saved with the document. A kept sound is named in the other commands like any sound, with nothing to select first.',
    inputSchema: { type: 'object', properties: { sound: soundArg('the sound to describe') } } },
  { name: 'start',
    description: 'Start a new sound of a kind and play it for the User. No two sounds of a kind are the same, so starting again gives another. The new sound becomes the selected sound. The answer describes what was started.',
    inputSchema: { type: 'object', required: ['kind'], properties: {
      kind: { type: 'string', enum: BUCKETS.map(({ id }) => id), description: `The kind of sound: ${BUCKETS.map(({ id }) => `${id} (${KIND_SAYS[id]})`).join(', ')}.` },
      takes: { type: 'integer', minimum: 1, maximum: TAKES_MAX, description: 'How many to start, each different. They play one after another and the last is selected. Left out: one.' },
    } } },
  { name: 'change',
    description: `Make a new sound from a sound and play it for the User. The sound it is made from never changes, so nothing is lost and any sound can be named again later. A step makes one sound with that one change and selects it, so steps chain: shorter twice is shorter still. The steps: ${ROWS.map((row) => row.says).join('; ')}. A roll (mutate, which varies the whole sound a little; ${rollWords}, which vary that one thing) makes a different sound every time and leaves the selection where it is, so the next roll is another take on the same sound. blend crosses the sound with another. The answer describes each sound made and names the selected sound.`,
    inputSchema: { type: 'object', required: ['move'], properties: {
      move: { type: 'string', enum: MOVES.map(({ name }) => name), description: 'The step, the roll, or blend.' },
      from: soundArg('the sound to make it from'),
      with: { type: 'string', description: 'For blend: the name of the sound to blend with.' },
      takes: { type: 'integer', minimum: 1, maximum: TAKES_MAX, description: 'For a roll or a blend: how many takes to make, each different. They play one after another. Left out: one.' },
    } } },
  { name: 'keep',
    description: 'Keep a sound in the kit under a name. The kit is saved with the document and is what the User exports, as WAV files or as code; a sound on the bench that is not kept is gone when the page reloads. Keeping under a name the kit already holds replaces that kept sound: that is how a kept sound is changed. To have both, keep under another name.',
    inputSchema: { type: 'object', properties: {
      sound: soundArg('the sound to keep'),
      as: { type: 'string', description: 'The name to keep it under, such as "pickup". Left out: the name the sound has.' },
    } } },
];

// == State =======================================================================
const $ = (selector) => document.querySelector(selector);
const app = $('#app'), tree = $('#tree'), family = $('#family'), kitList = $('#kit'), sheet = $('#sheet');
const picture = $('#picture'), playhead = $('#playhead');

// every sound, by its id. Each `{ id, bucket, name, how, record, samples, parent,
// other, children }`; `how`: what made it, in a word or two; `parent`: the sound it
// was made from (null: started from a kind); `other`: the second sound of a blend;
// `children`: what was made from it, the newest first
const nodes = new Map();
// the sounds started from a kind, the newest first
let roots = [];
let selected = null;
// the sound marked to blend with and the sound the knobs are shaping (each by its
// id), and the last removal while it can be put back
let marked = null, tuning = null, removed = null;
let serial = 0;
const counts = {};

// the kit as the app-content last gave it (null: there is none), and its sounds
let shown = null, contentKnown = false, contentFailed = false;
let kit = [];
let notice = '';
// the samples of the kit's sounds, by their line
const kitSamples = new Map();

// == Sound =======================================================================
let audio = null/*not started: no tap yet, or a browser without Web Audio*/;
let voice = null/*what is playing*/;
let playedAt = 0, playedFor = 0;

// NOTE: a browser starts audio only from a tap, a click or a key
const startAudio = () => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if(!audio && Context) {
    if(navigator.audioSession) navigator.audioSession.type = 'playback'/*a sound tool is heard with the silent switch on*/;
    audio = new Context();
  } /* else -- started already, or no Web Audio */
  if(audio && (audio.state !== 'running')) audio.resume().catch(() => { /*not from a tap: the next tap wakes it*/ });
};

// plays the samples, in place of whatever was playing. `node`: the sound they are,
// whose tile shows it sounding
const play = (samples, node = null) => {
  startAudio();
  if(!audio) return/*no Web Audio*/;
  const buffer = audio.createBuffer(1, samples.length, RATE);
  buffer.getChannelData(0).set(samples);
  if(voice) { try { voice.stop(); } catch(error) { /*already ended*/ } }
  voice = audio.createBufferSource();
  voice.buffer = buffer;
  voice.connect(audio.destination);
  voice.start();
  // NOTE: the playhead crosses the picture, which is the selected sound's alone
  playedAt = audio.currentTime; playedFor = (node && (node === selected)) ? samples.length / RATE : 0;

  family.querySelector('.playing')?.classList.remove('playing');
  const tile = node ? tileEl(node) : null;
  if(!tile) return/*not a sound of the family, or not shown*/;
  tile.classList.add('playing');
  setTimeout(() => tile.classList.remove('playing'), Math.min(700, (samples.length / RATE) * 1000));
};

// == Picture =====================================================================
const HANN = Float32Array.from({ length: FFT_SIZE }, (_, i) => .5 - (.5 * Math.cos((TAU * i) / (FFT_SIZE - 1))));

// a Fourier transform in place; the length is a power of two
const fft = (re, im) => {
  const n = re.length;
  for(let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for(; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if(i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for(let size = 2; size <= n; size <<= 1) {
    const angle = -TAU / size, stepRe = Math.cos(angle), stepIm = Math.sin(angle);
    for(let start = 0; start < n; start += size) {
      let turnRe = 1, turnIm = 0;
      for(let k = 0; k < (size / 2); k++) {
        const a = start + k, b = a + (size / 2);
        const partRe = (re[b] * turnRe) - (im[b] * turnIm), partIm = (re[b] * turnIm) + (im[b] * turnRe);
        re[b] = re[a] - partRe; im[b] = im[a] - partIm;
        re[a] += partRe; im[a] += partIm;
        const next = (turnRe * stepRe) - (turnIm * stepIm);
        turnIm = (turnRe * stepIm) + (turnIm * stepRe); turnRe = next;
      }
    }
  }
};

// how loud each pitch is at each moment, 0..1: a row for each pitch, the highest
// first, and a column for each moment
const spectrogramOf = (samples) => {
  const levels = new Float32Array(PICTURE_COLUMNS * PICTURE_ROWS);
  const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE), loud = new Float32Array(FFT_SIZE / 2);
  let peak = -Infinity;
  for(let column = 0; column < PICTURE_COLUMNS; column++) {
    const start = Math.round((column / (PICTURE_COLUMNS - 1)) * (samples.length - 1)) - (FFT_SIZE / 2);
    for(let i = 0; i < FFT_SIZE; i++) { re[i] = (samples[start + i] ?? 0) * HANN[i]; im[i] = 0; }
    fft(re, im);
    for(let bin = 0; bin < (FFT_SIZE / 2); bin++) loud[bin] = Math.hypot(re[bin], im[bin]);
    for(let row = 0; row < PICTURE_ROWS; row++) {
      const bin = (LOWEST_HZ * ((HIGHEST_HZ / LOWEST_HZ) ** (1 - (row / (PICTURE_ROWS - 1)))) * FFT_SIZE) / RATE;
      const under = Math.min((FFT_SIZE / 2) - 2, Math.floor(bin)), part = bin - under;
      const decibels = 20 * Math.log10((loud[under] * (1 - part)) + (loud[under + 1] * part) + 1e-9);
      levels[(row * PICTURE_COLUMNS) + column] = decibels;
      peak = Math.max(peak, decibels);
    }
  }
  for(let i = 0; i < levels.length; i++) levels[i] = Math.min(1, Math.max(0, (levels[i] - (peak - PICTURE_RANGE)) / PICTURE_RANGE));
  return levels;
};

const rgbOf = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const DARK = rgbOf('#0b0c12');

// the loudest and quietest sample under each of `columns` across the sound
const outlineOf = (samples, columns) => {
  const outline = new Float32Array(columns * 2);
  for(let column = 0; column < columns; column++) {
    const from = Math.floor((column / columns) * samples.length), to = Math.max(from + 1, Math.floor(((column + 1) / columns) * samples.length));
    let least = 1, most = -1;
    for(let i = from; (i < to) && (i < samples.length); i++) { least = Math.min(least, samples[i]); most = Math.max(most, samples[i]); }
    outline[column * 2] = least; outline[(column * 2) + 1] = most;
  }
  return outline;
};
const drawOutline = (context, samples, color, x, y, width, height) => {
  const outline = outlineOf(samples, width), middle = y + (height / 2);
  context.fillStyle = color;
  for(let column = 0; column < width; column++) {
    const top = middle - (outline[(column * 2) + 1] * (height / 2)), bottom = middle - (outline[column * 2] * (height / 2));
    context.fillRect(x + column, Math.floor(top), 1, Math.max(1, Math.ceil(bottom - top)));
  }
};

// the selected sound: its pitches over time above, its wave beneath
const heat = document.createElement('canvas');
heat.width = PICTURE_COLUMNS; heat.height = PICTURE_ROWS;
const drawPicture = () => {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(picture.clientWidth * ratio)), height = Math.max(1, Math.round(picture.clientHeight * ratio));
  if((picture.width !== width) || (picture.height !== height)) { picture.width = width; picture.height = height; }
  const context = picture.getContext('2d');
  context.clearRect(0, 0, width, height);
  if(!selected) return/*nothing to show*/;

  const color = bucketOf(selected.bucket).color, hue = rgbOf(color);
  const levels = spectrogramOf(selected.samples);
  const image = heat.getContext('2d').createImageData(PICTURE_COLUMNS, PICTURE_ROWS);
  for(let i = 0; i < levels.length; i++) {
    // dark up to the kind's color, then on to white
    const level = levels[i], [from, to, part] = (level < .65) ? [DARK, hue, level / .65] : [hue, [255, 255, 255], (level - .65) / .35];
    for(let channel = 0; channel < 3; channel++) image.data[(i * 4) + channel] = from[channel] + ((to[channel] - from[channel]) * part);
    image.data[(i * 4) + 3] = 255;
  }
  heat.getContext('2d').putImageData(image, 0, 0);
  const split = Math.round(height * .64);
  context.imageSmoothingEnabled = true;
  context.drawImage(heat, 0, 0, width, split);
  context.fillStyle = '#2b2e3d';
  context.fillRect(0, split, width, 1);
  drawOutline(context, selected.samples, color, 0, split + 1, width, height - split - 1);
};

// the playhead crosses the picture while the selected sound plays
const follow = () => {
  const along = (audio && playedFor) ? (audio.currentTime - playedAt) / playedFor : 1;
  const on = (along >= 0) && (along < 1);
  playhead.style.opacity = on ? .8 : 0;
  if(on) playhead.style.left = `${along * 100}%`;
  requestAnimationFrame(follow);
};

// == Family ======================================================================
const tileEl = (node) => family.querySelector(`[data-id="${node.id}"]`);
const drawThumb = (node) => {
  const canvas = tileEl(node)?.querySelector('canvas');
  if(!canvas) return/*not shown*/;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawOutline(context, node.samples, bucketOf(node.bucket).color, 0, 0, canvas.width, canvas.height);
};

// the kit's sound of a sound's name: what keeping it replaces
const keptAs = (node) => kit.find((sound) => sound.name === node.name);
const inKit = (node) => !!keptAs(node);

// a sound's way back to where its family started, itself last
const wayTo = (node) => {
  const way = [];
  for(let each = node; each; each = nodes.get(each.parent)) way.unshift(each);
  return way;
};
// everything made from a sound, and from those
const under = (node) => node.children.flatMap((id) => [nodes.get(id), ...under(nodes.get(id))]);

// a line to the person about the family. `putBack`: of a removal that can be put back
const say = (text, putBack = false) => {
  $('#noteText').textContent = text;
  $('#putBack').hidden = !putBack;
};

// the family: a column of the sounds started from a kind, then a column for each
// sound on the way to the selected one, holding what was made from it, the newest
// first. A sound off that way shows how many came of it and opens when it is
// selected: the family shows no more than the way there
const showTree = () => {
  family.textContent = '';
  if(roots.length < 1) {
    const none = document.createElement('p');
    none.className = 'none'; none.textContent = 'Nothing yet. Pick a kind of sound above.';
    family.style.width = family.style.height = '';
    family.append(none);
    return;
  } /* else -- sounds to show */

  const way = selected ? wayTo(selected) : [];
  const columns = [roots, ...way.map((node) => node.children)].map((ids) => ids.map((id) => nodes.get(id)));
  const places = new Map();
  columns.forEach((column, depth) => column.forEach((node, row) => places.set(node.id, { x: TREE_PAD + (depth * COLUMN_WIDTH), y: TREE_PAD + (row * ROW_HEIGHT) })));

  const lines = document.createElementNS(SVG, 'svg');
  family.append(lines);
  const join = (from, to, kind) => {
    const curve = document.createElementNS(SVG, 'path');
    const x1 = from.x + TILE_WIDTH, y1 = from.y + (TILE_HEIGHT / 2), x2 = to.x, y2 = to.y + (TILE_HEIGHT / 2), bend = (x1 + x2) / 2;
    curve.setAttribute('d', `M${x1} ${y1} C${bend} ${y1} ${bend} ${y2} ${x2} ${y2}`);
    if(kind) curve.setAttribute('class', kind);
    lines.append(curve);
  };

  for(const [id, place] of places) {
    const node = nodes.get(id), onWay = way.includes(node), came = under(node).length;
    const tile = document.createElement('button'), canvas = document.createElement('canvas'), name = document.createElement('span'), how = document.createElement('small');
    tile.className = 'tile'; tile.dataset.id = id;
    tile.style.setProperty('--c', bucketOf(node.bucket).color);
    tile.style.left = `${place.x}px`; tile.style.top = `${place.y}px`;
    tile.classList.toggle('on', node === selected);
    tile.classList.toggle('way', onWay);
    tile.classList.toggle('kept', inKit(node));
    tile.classList.toggle('marked', id === marked);
    canvas.width = 176; canvas.height = 52;
    name.textContent = node.name; how.textContent = node.how;
    tile.title = node.how ? `${node.name}: ${node.how}` : node.name;
    tile.append(canvas, name, how);
    if(!onWay && (came > 0)) {
      const more = document.createElement('em');
      more.textContent = `+${came}`; more.title = `${came} made from it`;
      tile.append(more);
    } /* else -- what came of it is shown, or nothing did */
    family.append(tile);
    drawThumb(node);

    const parent = places.get(node.parent), other = places.get(node.other);
    if(parent) join(parent, place, onWay ? 'lit' : '');
    if(other && (other.x < place.x)) join(other, place, 'blend');
  }

  // where what is made from the selected sound goes, until something is
  if(selected && (selected.children.length < 1)) {
    const from = places.get(selected.id), slot = { x: from.x + COLUMN_WIDTH, y: TREE_PAD };
    const ghost = document.createElement('div');
    ghost.className = 'ghost'; ghost.textContent = 'What you make from this sound goes here.';
    ghost.style.left = `${slot.x}px`; ghost.style.top = `${slot.y}px`;
    family.append(ghost);
    join(from, slot, 'blend');
  } /* else -- nothing selected, or its column holds what was made */

  const width = (TREE_PAD * 2) + ((columns.length - 1) * COLUMN_WIDTH) + TILE_WIDTH;
  const height = (TREE_PAD * 2) + ((Math.max(1, ...columns.map((column) => column.length)) - 1) * ROW_HEIGHT) + TILE_HEIGHT;
  family.style.width = `${width}px`; family.style.height = `${height}px`;
  lines.setAttribute('width', width); lines.setAttribute('height', height);

  // the selected sound and the column after it stay in view
  if(!selected) return/*nothing to keep in view*/;
  const { x, y } = places.get(selected.id);
  tree.scrollLeft = Math.max(Math.min(tree.scrollLeft, x - TREE_PAD), x + COLUMN_WIDTH + TILE_WIDTH + TREE_PAD - tree.clientWidth);
  tree.scrollTop = Math.max(Math.min(tree.scrollTop, y - TREE_PAD), y + TILE_HEIGHT + TREE_PAD - tree.clientHeight);
};

const durationOf = (samples) => seconds(samples.length / RATE);

// the selected sound everywhere it shows: its name and length, its picture, its
// knobs, and what can be done with it
const showSelected = () => {
  const node = selected, partner = nodes.get(marked), came = node ? under(node).length : 0;
  app.classList.toggle('chosen', !!node);
  app.style.setProperty('--hue', node ? bucketOf(node.bucket).color : '#5cc8ff');
  for(const id of ['play', 'name', 'keep', 'wav', 'code', 'mutate', 'mark', 'remove']) $(`#${id}`).disabled = !node;
  $('#tweak').classList.toggle('idle', !node);
  if(document.activeElement !== $('#name')) $('#name').value = node ? node.name : '';
  $('#facts').textContent = node ? `${bucketOf(node.bucket).label}, ${durationOf(node.samples)}` : '';
  $('#keep').textContent = (node && inKit(node)) ? 'Update' : 'Keep';
  $('#remove').textContent = (came > 0) ? `Remove it and its ${came}` : 'Remove';
  $('#mark').textContent = (node && (marked === node.id)) ? 'Unmark' : 'Mark to blend';
  $('#blend').disabled = !node || !partner || (partner === node);
  $('#blend').textContent = $('#blend').title = partner ? `Blend with ${partner.name}` : 'Blend';
  for(const button of document.querySelectorAll('.bucket')) button.classList.toggle('on', !!node && (button.dataset.id === node.bucket));
  // a step that would change nothing is not offered
  for(const button of document.querySelectorAll('.steer [data-step]')) {
    const row = ROWS.find((each) => each.id === button.parentElement.dataset.row);
    button.disabled = !node || !steppedOf(row, Number(button.dataset.step), node.record);
  }
  drawPicture();
  showKnobs();
};

const select = (node, heard = true) => {
  selected = node; tuning = null;
  showTree();
  showSelected();
  if(heard) play(node.samples, node);
};

// whether there is something to hear: long and loud enough
const audible = (samples) => {
  let squares = 0;
  for(let i = 0; i < samples.length; i++) squares += samples[i] * samples[i];
  return (samples.length >= (RATE * LEAST_SECONDS)) && (Math.sqrt(squares / samples.length) >= LEAST_LEVEL);
};
// what `make` gives, made again (a few times at most) while there is nothing to hear
const audibleFrom = (make) => {
  let record = make(), samples = render(record);
  for(let tries = 1; (tries < MAKE_TRIES) && !audible(samples); tries++) { record = make(); samples = render(record); }
  return { record, samples };
};

// whether there is room for another sound (`started`: one started from a kind),
// said when there is not. Past `ROOTS_MAX` the oldest sound that nothing was made
// from goes, unless it is kept, selected or marked
const room = (started) => {
  if(nodes.size >= SOUNDS_MAX) { say(`That is ${SOUNDS_MAX} sounds. Remove some to go on.`); return false; }
  if(!started || (roots.length < ROOTS_MAX)) return true;
  const idle = roots.findLast((id) => { const node = nodes.get(id); return (node.children.length < 1) && !inKit(node) && (node !== selected) && (id !== marked); });
  if(!idle) { say(`That is ${ROOTS_MAX} families. Remove one to start another.`); return false; }
  roots = roots.filter((id) => id !== idle);
  nodes.delete(idle);
  return true;
};

// a new sound in the family: the newest of what its `parent` made, or of the sounds
// started from a kind
const addNode = (bucket, record, { parent = null, other = null, how = '', name, samples = render(record) } = {}) => {
  // NOTE: a sound given no name is numbered among its kind
  const node = { id: `t${++serial}`, bucket, name: name ?? `${bucketOf(bucket).label} ${counts[bucket] = (counts[bucket] ?? 0) + 1}`, how, record, samples, parent, other, children: [] };
  nodes.set(node.id, node);
  (parent ? nodes.get(parent).children : roots).unshift(node.id);
  return node;
};

// a sound started from a kind, selected and played: the sound, or null with no room
const roll = (bucket) => {
  if(!room(true)) return null/*said*/;
  const { record, samples } = audibleFrom(() => recordOf({ ...bucketOf(bucket).make(), seed: newSeed() }));
  const node = addNode(bucket, record, { samples });
  say('');
  select(node);
  return node;
};
// a sound of the kit put on the bench, to make sounds from: the sound, or null with no room
const fromKit = (sound) => room(true) ? addNode(sound.bucket, { ...sound.record }, { name: sound.name, how: 'From the kit' }) : null;

// a sound made from the selected one, and played: the sound, or null when there is
// none to make it from or no room. `move`: it is selected, as a step taken is;
// otherwise the selected sound stays, to be rolled from again
const grow = (record, how, { samples = render(record), other = null, move = false } = {}) => {
  if(!selected || !room(false)) return null/*nothing to make it from, or no room (said)*/;
  const node = addNode(selected.bucket, record, { parent: selected.id, other, how, samples });
  say('');
  if(move) { select(node); return node; }
  showTree();
  showSelected();
  play(node.samples, node);
  return node;
};

// how far a mutation or a roll goes is the Subtle..Wild slider's
const reach = () => .03 + (Number($('#strength').value) * .37);
const mutate = () => {
  if(!selected) return null/*nothing to mutate*/;
  const from = selected.record, by = reach();
  const { record, samples } = audibleFrom(() => mutationOf(from, by));
  return grow(record, 'Mutated', { samples });
};
const rollRow = (row) => {
  if(!selected) return null/*nothing to roll from*/;
  const from = selected.record, by = reach();
  const { record, samples } = audibleFrom(() => rollOf(row, from, by));
  return grow(record, `${row.label} rolled`, { samples });
};
const stepRow = (row, index) => {
  const record = selected ? steppedOf(row, index, selected.record) : null;
  return record ? grow(record, row.steps[index][0], { move: true }) : null/*nothing to step from, or no further that way*/;
};

// the pairs of sounds blended so far: the first blend of two is the even one, and
// each after it is another cross
const blended = new Set();
const mark = () => {
  if(!selected) return/*nothing to mark*/;
  marked = (marked === selected.id) ? null : selected.id;
  showTree();
  showSelected();
};
const blendWith = (other) => {
  if(!selected || !other || (other === selected)) return null/*no two to blend*/;
  const pair = [selected.id, other.id].sort().join(' '), even = !blended.has(pair);
  blended.add(pair);
  return grow(blendOf(selected.record, other.record, () => even ? .5 : Math.random()), `Blend with ${other.name}`, { other: other.id });
};
const blend = () => blendWith(nodes.get(marked));

// removes the selected sound and everything made from it; the sound it was made
// from is selected. The removal can be put back until the next one
const removeSelected = () => {
  const node = selected;
  if(!node) return/*nothing to remove*/;
  const gone = [node, ...under(node)], list = node.parent ? nodes.get(node.parent).children : roots, index = list.indexOf(node.id);
  list.splice(index, 1);
  for(const each of gone) nodes.delete(each.id);
  if(gone.some((each) => each.id === marked)) marked = null;
  removed = { gone, parent: node.parent, index };
  selected = nodes.get(node.parent) ?? nodes.get(roots[Math.min(index, roots.length - 1)]) ?? null;
  tuning = null;
  showTree();
  showSelected();
  say(`Removed ${node.name}${(gone.length > 1) ? ` and the ${gone.length - 1} made from it` : ''}.${gone.some(inKit) ? ' The kit keeps what was kept.' : ''}`, true);
};
const putBack = () => {
  if(!removed) return/*nothing to put back*/;
  const { gone, parent, index } = removed, list = parent ? nodes.get(parent)?.children : roots;
  removed = null;
  if(!list) { say('The sound it was made from is gone too.'); return; }
  for(const each of gone) nodes.set(each.id, each);
  list.splice(Math.min(index, list.length), 0, gone[0].id);
  say('');
  select(gone[0], false);
};

// -- Tweaks ----------------------------------------------------------------------
const knobText = ({ show, off }, value) => ((off !== undefined) && (value === off)) ? 'Off' : show(value);

// every knob as the selected sound has it
const showKnobs = () => {
  const record = selected ? selected.record : DEFAULTS;
  for(const button of document.querySelectorAll('#waves button')) button.classList.toggle('on', button.dataset.wave === record.wave);
  for(const each of KNOBS) {
    const row = document.querySelector(`.knob[data-key="${each.key}"]`);
    row.querySelector('input').value = each.scale.from(record[each.key]);
    row.querySelector('output').textContent = knobText(each, record[each.key]);
    row.classList.toggle('changed', record[each.key] !== DEFAULTS[each.key]);
  }
  for(const group of document.querySelectorAll('details')) group.classList.toggle('used', !!group.dataset.quiet && !!group.querySelector('.knob.changed'));
};

// the selected sound made again from its record, wherever it shows
const remake = () => {
  selected.samples = render(selected.record);
  $('#facts').textContent = `${bucketOf(selected.bucket).label}, ${durationOf(selected.samples)}`;
  drawPicture();
  drawThumb(selected);
};

// the knobs shape a sound of their own: the first one moved makes a new sound from
// the selected one, and they go on shaping that until another sound is selected
const tweak = (key, value) => {
  if(!selected) return/*nothing to tune*/;
  if(tuning !== selected.id) {
    if(!room(false)) return/*said*/;
    const tuned = addNode(selected.bucket, { ...selected.record }, { parent: selected.id, how: 'Tuned', samples: selected.samples });
    select(tuned, false);
    tuning = tuned.id;
  } /* else -- the sound the knobs are shaping */
  selected.record = { ...selected.record, [key]: value };
  remake();
  showKnobs();
};
const settle = () => { if(selected) play(selected.samples, selected); };

// == Kit =========================================================================
// the kit: `sounds.json` holds a line for each sound kept, `{ kind, id, name, bucket,
// sound }`, `sound` the record's differences from `DEFAULTS`. A change rewrites that
// sound's line alone, through the app-content shown; a line this does not read is
// kept as written
const appContent = window.charmiq.appContent;

const soundOf = (line) => {
  try {
    const entry = JSON.parse(line);
    return (entry && (entry.kind === SOUND_KIND) && (typeof entry.id === 'string') && entry.sound && (typeof entry.sound === 'object')) ? entry : null/*another kind of line*/;
  } catch(error) {
    return null/*not a record*/;
  }
};
const nameOf = (name) => ((typeof name === 'string') && name.trim().slice(0, NAME_MAX)) || 'Sound';

// by name, then by id
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id.localeCompare(b.id);

const kitOf = (lines) => lines.map((line, index) => {
  const entry = soundOf(line);
  return entry ? { id: entry.id, name: nameOf(entry.name), bucket: bucketOf(entry.bucket).id, record: recordOf(entry.sound), line, index } : null;
}).filter(Boolean).sort(byName);

const samplesOf = (sound) => {
  if(!kitSamples.has(sound.line)) kitSamples.set(sound.line, render(sound.record));
  return kitSamples.get(sound.line);
};

const showKit = () => {
  for(const line of [...kitSamples.keys()]) if(!kit.some((sound) => sound.line === line)) kitSamples.delete(line);

  $('#notice').textContent = contentFailed ? 'The kit could not be read. Reload the page.' : notice;
  $('#kitFacts').textContent = (kit.length > 0) ? `${kit.length} kept with this document.` : 'Kept with this document.';
  $('#kitCode').disabled = kit.length < 1;
  kitList.textContent = '';
  if(kit.length < 1) {
    const none = document.createElement('li');
    none.className = 'none'; none.textContent = contentKnown ? 'Nothing kept yet. Keep a sound and it stays with this document.' : 'Reading the kit.';
    kitList.append(none);
  } /* else -- sounds to list */
  for(const sound of kit) {
    const row = document.createElement('li'), dot = document.createElement('i'), name = document.createElement('input'), length = document.createElement('span');
    row.dataset.id = sound.id;
    row.style.setProperty('--c', bucketOf(sound.bucket).color);
    name.type = 'text'; name.maxLength = NAME_MAX; name.value = name.title = sound.name;
    name.setAttribute('aria-label', 'The kept sound\'s name');
    length.textContent = durationOf(samplesOf(sound));
    row.append(dot, name, length);
    for(const [action, label] of [['play', 'Play'], ['edit', 'Edit'], ['wav', 'WAV'], ['remove', 'Remove']]) {
      const button = document.createElement('button');
      button.dataset.action = action; button.textContent = label;
      row.append(button);
    }
    kitList.append(row);
  }
  for(const node of nodes.values()) tileEl(node)?.classList.toggle('kept', inKit(node));
  if(selected) $('#keep').textContent = inKit(selected) ? 'Update' : 'Keep';
};

// the app-content that follows the one shown
let awaited = [];
const nextContent = () => new Promise((resolve) => awaited.push(resolve));

// one change to the kit, measured on the app-content shown: refused because that
// changed, it is made again on the app-content that follows
let writing = false;
const writeKit = async (change) => {
  if(writing || !contentKnown || contentFailed) return false/*one write at a time; nothing to write on*/;
  writing = true;
  try {
    for(let tries = 0; tries < WRITE_TRIES; tries++) {
      const target = shown;
      try {
        await change(target);
        notice = '';
        return true;
      } catch(error) {
        if(error?.code !== CONTENT_CONFLICT) throw error;
        if(shown === target) await nextContent()/*else the app-content that won is here already*/;
      }
    }
    notice = 'The kit kept changing elsewhere, so that was not saved. Try again.';
    return false;
  } catch(error) {
    console.error(`Could not save the ${APP_CONTENT_NAME} app-content`, error);
    notice = 'That was not saved. Try again.';
    return false;
  } finally {
    writing = false;
    showKit();
  }
};

const lineOf = (id, name, bucket, record) => JSON.stringify({ kind: SOUND_KIND, id, name: nameOf(name), bucket, sound: briefOf(record) });
const indexIn = (content, id) => content ? content.lines.findIndex((line) => soundOf(line)?.id === id) : -1;

// keeps the selected sound under its name: a new line, or the line of the kit's
// sound of that name, which it replaces. Gives whether it was kept
const keep = async () => {
  const node = selected, held = node ? keptAs(node) : null;
  if(!node) return false/*nothing to keep*/;
  if(!held && (kit.length >= KIT_MAX)) { notice = `The kit holds ${KIT_MAX} sounds. Remove one to keep another.`; showKit(); return false; }

  const id = held ? held.id : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const line = lineOf(id, node.name, node.bucket, node.record);
  const kept = await writeKit(async (content) => {
    const index = indexIn(content, id);
    if(!content) await appContent.create(`${line}\n`, APP_CONTENT_NAME);
    else if(index < 0) await content.appendLine(line);
    else await content.replaceLine(index, line);
  });
  showKit();
  return kept;
};
const rename = (sound, name) => writeKit(async (content) => {
  const index = indexIn(content, sound.id);
  if(index >= 0) await content.replaceLine(index, lineOf(sound.id, name, sound.bucket, sound.record));
});
const removeKept = (sound) => writeKit(async (content) => {
  const index = indexIn(content, sound.id);
  if(index >= 0) await content.removeLine(index);
});

const receive = (content) => {
  shown = content; contentKnown = true;
  kit = content ? kitOf(content.lines) : [];
  for(const resolve of awaited.splice(0)) resolve();
  showKit();
};

// == Export ======================================================================
const wavOf = (samples) => {
  const bytes = new DataView(new ArrayBuffer(44 + (samples.length * 2)));
  const text = (at, word) => { for(let i = 0; i < word.length; i++) bytes.setUint8(at + i, word.charCodeAt(i)); };
  text(0, 'RIFF'); bytes.setUint32(4, 36 + (samples.length * 2), true); text(8, 'WAVE');
  // 16-bit, one channel
  text(12, 'fmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
  bytes.setUint32(24, RATE, true); bytes.setUint32(28, RATE * 2, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true);
  text(36, 'data'); bytes.setUint32(40, samples.length * 2, true);
  for(let i = 0; i < samples.length; i++) bytes.setInt16(44 + (i * 2), Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Blob([bytes], { type: 'audio/wav' });
};

const fileNameOf = (name) => `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sound'}.wav`;
const download = (samples, name) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(wavOf(samples));
  link.download = fileNameOf(name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
};

// a name as the code's key: `Laser 7` is `laser7`
const keyOf = (name) => {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const key = words.map((word, index) => index ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word.toLowerCase()).join('');
  return /^[A-Za-z]/.test(key) ? key : `sound${key}`;
};
const literal = (record) => `{ ${Object.entries(record).map(([key, value]) => `${key}: ${(typeof value === 'string') ? `'${value}'` : value}`).join(', ')} }`;

// the code that makes these sounds: the engine as it runs here, each sound's record
// and a player. `sounds`: `[name, record]`
const codeOf = (sounds) => {
  const keys = new Set();
  const entries = sounds.map(([name, record]) => {
    let key = keyOf(name);
    for(let n = 2; keys.has(key); n++) key = `${keyOf(name)}${n}`;
    keys.add(key);
    return `  ${key}: ${literal(briefOf(record))},`;
  });
  return [
    '// Sounds designed in Zap Lab. Nothing is loaded: `zap` makes a sound\'s samples',
    '// (44,100 a second, each -1..1) from its record, and `play` plays one by name.',
    'const zap = (() => {',
    `  const DEFAULTS = ${literal(DEFAULTS)};`,
    `  return ${render.toString().split('\n').join('\n  ')};`,
    '})();',
    '',
    'const SOUNDS = {',
    ...entries,
    '};',
    '',
    '// NOTE: a browser starts audio only from a tap, a click or a key: call `play` first',
    '//       from one of those',
    'let audio = null;',
    'const buffers = {};',
    'const play = (name) => {',
    '  audio ??= new AudioContext();',
    '  if(audio.state !== \'running\') audio.resume();',
    '  if(!buffers[name]) {',
    '    const samples = zap(SOUNDS[name]);',
    '    buffers[name] = audio.createBuffer(1, samples.length, 44100);',
    '    buffers[name].getChannelData(0).set(samples);',
    '  }',
    '  const source = audio.createBufferSource();',
    '  source.buffer = buffers[name];',
    '  source.connect(audio.destination);',
    '  source.start();',
    '};',
    '',
    `// play('${entries[0].trim().split(':')[0]}');`,
    '',
  ].join('\n');
};

const showCode = (title, sounds) => {
  $('#sheetTitle').textContent = title;
  sheet.querySelector('textarea').value = codeOf(sounds);
  $('#copied').textContent = '';
  sheet.classList.remove('hidden');
  sheet.querySelector('textarea').scrollTop = 0;
};
const copyCode = async () => {
  const area = sheet.querySelector('textarea');
  let copied = false;
  try {
    await navigator.clipboard.writeText(area.value);
    copied = true;
  } catch(error) {
    area.select();
    try { copied = document.execCommand('copy'); } catch(refused) { /*told below*/ }
  }
  $('#copied').textContent = copied ? 'Copied.' : 'The browser refused the copy. The code is selected: copy it with the keyboard.';
};

// == Build =======================================================================
for(const { id, label, color } of BUCKETS) {
  const button = document.createElement('button'), dot = document.createElement('i');
  button.className = 'bucket'; button.dataset.id = id;
  button.style.setProperty('--c', color);
  button.append(dot, label);
  $('#buckets').append(button);
}
for(const [wave, label] of WAVES) {
  const button = document.createElement('button');
  button.dataset.wave = wave; button.textContent = label;
  $('#waves').append(button);
}
for(const row of ROWS) {
  const line = document.createElement('div'), label = document.createElement('span');
  line.className = 'steer'; line.dataset.row = row.id;
  label.textContent = row.label;
  line.append(label);
  row.steps.forEach(([text], index) => {
    const button = document.createElement('button');
    button.dataset.step = index; button.textContent = text;
    line.append(button);
  });
  if(row.dice !== false) {
    const dice = document.createElement('button');
    dice.innerHTML = DICE;
    dice.title = `Roll the ${row.label.toLowerCase()} alone`;
    dice.setAttribute('aria-label', dice.title);
    line.append(dice);
  } /* else -- nothing to roll */
  $('#steer').append(line);
}
for(const { name, quiet, knobs } of GROUPS) {
  const group = document.createElement('details'), summary = document.createElement('summary');
  group.open = !quiet;
  if(quiet) group.dataset.quiet = 'true';
  summary.textContent = name;
  group.append(summary);
  for(const { key, label } of knobs) {
    const row = document.createElement('label'), text = document.createElement('span'), slider = document.createElement('input'), value = document.createElement('output');
    row.className = 'knob'; row.dataset.key = key;
    text.textContent = text.title = label;
    slider.type = 'range'; slider.min = 0; slider.max = 1; slider.step = .001;
    row.append(text, slider, value);
    group.append(row);
  }
  $('#groups').append(group);
}

// == Input =======================================================================
const knobAt = (target) => KNOBS.find((each) => each.key === target.closest('.knob')?.dataset.key);

$('#buckets').addEventListener('click', (event) => { const id = event.target.closest('.bucket')?.dataset.id; if(id) roll(id); });
family.addEventListener('click', (event) => {
  const node = nodes.get(event.target.closest('.tile')?.dataset.id);
  if(node) select(node);
});
$('#play').addEventListener('click', () => { if(selected) play(selected.samples, selected); });
$('#mutate').addEventListener('click', mutate);
$('#mark').addEventListener('click', mark);
$('#blend').addEventListener('click', blend);
$('#remove').addEventListener('click', removeSelected);
$('#putBack').addEventListener('click', putBack);
$('#steer').addEventListener('click', (event) => {
  const row = ROWS.find((each) => each.id === event.target.closest('.steer')?.dataset.row), button = event.target.closest('button');
  if(!row || !button) return/*not a step or a roll*/;
  if(button.dataset.step) stepRow(row, Number(button.dataset.step));
  else rollRow(row);
});
$('#keep').addEventListener('click', keep);
$('#wav').addEventListener('click', () => { if(selected) download(selected.samples, selected.name); });
$('#code').addEventListener('click', () => { if(selected) showCode(selected.name, [[selected.name, selected.record]]); });
$('#kitCode').addEventListener('click', () => { if(kit.length > 0) showCode(`The kit: ${kit.length} ${(kit.length === 1) ? 'sound' : 'sounds'}`, kit.map((sound) => [sound.name, sound.record])); });
$('#copy').addEventListener('click', copyCode);
$('#close').addEventListener('click', () => sheet.classList.add('hidden'));
sheet.addEventListener('click', (event) => { if(event.target === sheet) sheet.classList.add('hidden'); });

$('#name').addEventListener('input', (event) => {
  if(!selected) return/*nothing to name*/;
  selected.name = nameOf(event.target.value);
  const label = tileEl(selected)?.querySelector('span');
  if(label) label.textContent = label.parentElement.title = selected.name;
  $('#keep').textContent = inKit(selected) ? 'Update' : 'Keep';
});
$('#name').addEventListener('change', (event) => {
  if(!selected) return/*nothing to name*/;
  event.target.value = selected.name;
  showTree();
  showSelected();
});

$('#waves').addEventListener('click', (event) => {
  const wave = event.target.closest('button')?.dataset.wave;
  if(!wave || !selected || (selected.record.wave === wave)) return/*not a wave, or the one it has*/;
  tweak('wave', wave);
  settle();
});
$('#groups').addEventListener('input', (event) => {
  const each = knobAt(event.target);
  if(each) tweak(each.key, tidy(each.scale.to(Number(event.target.value))));
});
$('#groups').addEventListener('change', (event) => { if(knobAt(event.target)) settle(); });
$('#groups').addEventListener('dblclick', (event) => {
  const each = knobAt(event.target);
  if(!each || !selected || (selected.record[each.key] === DEFAULTS[each.key])) return/*not a knob, or as it began*/;
  tweak(each.key, DEFAULTS[each.key]);
  settle();
});

kitList.addEventListener('click', (event) => {
  const sound = kit.find((each) => each.id === event.target.closest('li')?.dataset.id);
  switch(sound && event.target.closest('button')?.dataset.action) {
    case 'play': play(samplesOf(sound)); break;
    case 'edit': { const node = fromKit(sound); if(node) select(node); break; }
    case 'wav': download(samplesOf(sound), sound.name); break;
    case 'remove': removeKept(sound); break;
  }
});
kitList.addEventListener('change', (event) => {
  const sound = kit.find((each) => each.id === event.target.closest('li')?.dataset.id);
  if(!sound || (event.target.tagName !== 'INPUT')) return/*not a name*/;
  const name = nameOf(event.target.value);
  if(name === sound.name) { event.target.value = sound.name; return; }
  // NOTE: a name is one sound of the kit's: keeping a sound replaces the kit's of its name
  if(kit.some((other) => other.name === name)) { notice = `The kit already holds a sound named ${name}.`; showKit(); return; }
  rename(sound, name);
});

// a button a pointer pressed gives the keys back to the bench
document.addEventListener('click', (event) => { if(event.detail > 0) event.target.closest('button')?.blur(); });
document.addEventListener('keydown', (event) => {
  if(event.metaKey || event.ctrlKey || event.altKey) return/*the browser's own*/;
  if(event.key === 'Escape') { sheet.classList.add('hidden'); return; }
  if(!sheet.classList.contains('hidden') || event.target.matches('input[type="text"], textarea')) return/*typing, or the code is up*/;
  if(event.target.matches('input[type="range"]') && event.key.startsWith('Arrow')) return/*the slider's own*/;
  // the sound beside the selected one, among those made from the same sound
  const beside = (by) => {
    const list = selected.parent ? nodes.get(selected.parent).children : roots;
    return nodes.get(list[list.indexOf(selected.id) + by]);
  };
  const go = (node) => { if(node) select(node); };
  switch(event.key) {
    case ' ': if(selected) play(selected.samples, selected); break;
    case 'Enter': if(selected) roll(selected.bucket); break;
    case 'm': case 'M': mutate(); break;
    case 'b': case 'B': blend(); break;
    case 'k': case 'K': keep(); break;
    case 'Delete': case 'Backspace': removeSelected(); break;
    // left to the sound it was made from, right to the newest made from it
    case 'ArrowLeft': go(nodes.get(selected?.parent)); break;
    case 'ArrowRight': go(nodes.get(selected?.children[0])); break;
    case 'ArrowUp': if(selected) go(beside(-1)); break;
    case 'ArrowDown': if(selected) go(beside(1)); break;
    default: return/*not a key of the bench*/;
  }
  event.preventDefault();
});
addEventListener('resize', drawPicture);

// == Commands ====================================================================
// what runs each command an Agent is told of (SEE: Declarations). An Agent's words
// are taken loosely (a name whatever its case, `fall` for `fall more`); what cannot
// be done is refused in words that say what can
const TAKE_GAP_MILLIS = 250;
// a slide slower than this, in octaves a second, is told as a steady pitch
const STEADY_SLIDE = .2;

const plainOf = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
// the one of `list` a word names (`wordOf`: each one's word): exactly, else the only
// one the word is part of
const pickBy = (list, wordOf, word) => {
  const plain = plainOf(word), within = plain ? list.filter((each) => plainOf(wordOf(each)).includes(plain)) : [];
  return list.find((each) => plainOf(wordOf(each)) === plain) ?? ((within.length === 1) ? within[0] : null);
};
const takesOf = (takes) => Math.min(TAKES_MAX, Math.max(1, Math.floor(Number(takes)) || 1));

// a sound by the name an Agent gives, the newest of that name on the bench. A sound
// of the kit that is not on the bench is put on it
const soundNamed = (name) => {
  const onBench = [...nodes.values()].reverse(), same = (each) => plainOf(each.name) === plainOf(name);
  const node = onBench.find((each) => each.name === name) ?? onBench.find(same);
  if(node) return node;
  const kept = kit.find((sound) => sound.name === name) ?? kit.find(same);
  if(!kept) return null/*no such sound*/;
  const put = fromKit(kept);
  if(!put) throw new Error($('#noteText').textContent);
  return put;
};
// the sound a command is about: the one named, or the selected one
const soundFor = (name) => {
  const given = (typeof name === 'string') && (name.trim() !== '');
  const node = given ? soundNamed(name) : selected;
  if(node) return node;
  const names = [...new Set([...[...nodes.values()].map((each) => each.name), ...kit.map((sound) => sound.name)])];
  throw new Error(`${given ? `There is no sound named "${name}".` : 'No sound is selected.'} ${(names.length > 0) ? `The sounds: ${names.join(', ')}.` : 'There are no sounds yet: start one with start.'}`);
};

// how bright a sound is: where the middle of its energy lies among the pitches, in Hz
const brightnessOf = (samples) => {
  const re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
  const frames = Math.max(1, Math.min(48, Math.floor(samples.length / (FFT_SIZE / 2))));
  let weighted = 0, total = 0;
  for(let frame = 0; frame < frames; frame++) {
    const start = Math.floor((frame / frames) * Math.max(0, samples.length - FFT_SIZE));
    for(let i = 0; i < FFT_SIZE; i++) { re[i] = (samples[start + i] ?? 0) * HANN[i]; im[i] = 0; }
    fft(re, im);
    for(let bin = 1; bin < (FFT_SIZE / 2); bin++) {
      const power = (re[bin] * re[bin]) + (im[bin] * im[bin]);
      weighted += power * ((bin * RATE) / FFT_SIZE); total += power;
    }
  }
  return total ? weighted / total : 0;
};
const loudnessOf = (samples) => {
  let squares = 0;
  for(let i = 0; i < samples.length; i++) squares += samples[i] * samples[i];
  return Math.sqrt(squares / samples.length);
};
// the pitch a sound ends at, in Hz: its pitch followed over its heard length
// SEE: `render`, whose pitch this follows
const endPitchOf = ({ record, samples }) => {
  const every = record.repeat ? Math.max(32, Math.round(RATE / record.repeat)) : 0, lowest = record.minFreq || 3.5;
  let pitch = record.freq, slide = record.slide, jumpIn = record.jump ? Math.round(record.jumpAt * RATE) : -1;
  for(let i = 0; i < samples.length; i++) {
    if(every && i && !(i % every)) { pitch = record.freq; slide = record.slide; jumpIn = record.jump ? Math.round(record.jumpAt * RATE) : -1; }
    if(jumpIn-- === 0) pitch *= 2 ** (record.jump / 12);
    slide += record.slideChange / RATE;
    pitch = Math.max(lowest, pitch * (2 ** (slide / RATE)));
  }
  return pitch;
};
// how a sound's pitch moves, in words
const movementOf = (record) => [
  (Math.abs(record.slide) < STEADY_SLIDE) ? 'steady' : `${(record.slide > 0) ? 'rises' : 'falls'} ${Number(Math.abs(record.slide).toPrecision(2))} octaves a second`,
  ((record.minFreq > 0) && (record.slide <= -STEADY_SLIDE)) ? `and ends when it reaches ${Math.round(record.minFreq)} Hz` : '',
  record.jump ? `jumps ${(record.jump > 0) ? 'up' : 'down'} ${Number(Math.abs(record.jump).toPrecision(2))} semitones after ${Math.round(record.jumpAt * 1000)} ms` : '',
  (record.vibDepth && record.vibSpeed) ? 'wobbles' : '',
  record.repeat ? `starts over ${Number(record.repeat.toPrecision(2))} times a second` : '',
].filter(Boolean).join(', ');

// a sound as an Agent is told of it: what it cannot hear, in measures
const told = (node) => ({
  name: node.name,
  kind: bucketOf(node.bucket).id,
  made: node.parent ? `${node.how}, from ${nodes.get(node.parent).name}` : (node.how || 'Started from its kind'),
  seconds: Number((node.samples.length / RATE).toFixed(3)),
  wave: node.record.wave,
  pitchStartsHz: Math.round(node.record.freq),
  pitchEndsHz: Math.round(endPitchOf(node)),
  pitchMovement: movementOf(node.record),
  brightnessHz: Math.round(brightnessOf(node.samples)),
  loudness: Number(loudnessOf(node.samples).toFixed(2)),
  echoes: node.record.echo > 0,
  inKit: inKit(node),
});
const stepsOf = (node) => MOVES.filter((move) => (move.index !== undefined) && steppedOf(move.row, move.index, node.record)).map((move) => move.name);

// whether the person heard what was played: a browser plays nothing before they click
const playedSaid = () => (audio && (audio.state === 'running')) ? { played: true }
  : { played: false, note: 'The sounds were made but nothing played: a browser plays no sound until the User has clicked in Zap Lab.' };
// several sounds played one after another
const playInTurn = (made) => {
  let wait = 0;
  for(const node of made) {
    setTimeout(() => play(node.samples, node), wait);
    wait += ((node.samples.length / RATE) * 1000) + TAKE_GAP_MILLIS;
  }
};
// what a command made, as its answer
const madeSaid = (made) => {
  if(made.length < 1) throw new Error($('#noteText').textContent || 'Nothing was made.');
  if(made.length > 1) playInTurn(made);
  return { made: made.map(told), selected: selected.name, ...playedSaid() };
};

const COMMANDS = {
  look: async ({ sound } = {}) => {
    const given = (typeof sound === 'string') && (sound.trim() !== ''), node = (given || selected) ? soundFor(sound) : null;
    return {
      ...(node ? {} : { note: 'No sound is selected. Name one to look at it: one started on the bench, or one of the kit.' }),
      sound: node ? told(node) : null,
      steps: node ? stepsOf(node) : [],
      madeFromIt: node ? node.children.map((id) => nodes.get(id).name) : [],
      selected: selected ? selected.name : null,
      started: roots.map((id) => nodes.get(id).name),
      kit: kit.map((kept) => kept.name),
    };
  },
  start: async ({ kind, takes } = {}) => {
    const bucket = pickBy(BUCKETS, (each) => each.id, kind) ?? pickBy(BUCKETS, (each) => each.label, kind);
    if(!bucket) throw new Error(`"${kind ?? ''}" is not a kind of sound. The kinds: ${BUCKETS.map((each) => each.id).join(', ')}.`);
    return madeSaid(Array.from({ length: takesOf(takes) }, () => roll(bucket.id)).filter(Boolean));
  },
  change: async ({ move, from, with: partner, takes } = {}) => {
    const chosen = pickBy(MOVES, (each) => each.name, move ?? 'mutate');
    if(!chosen) throw new Error(`"${move}" is not a move. The moves: ${MOVES.map((each) => each.name).join(', ')}.`);
    const node = soundFor(from);
    if(node !== selected) select(node, false);

    if(chosen.index !== undefined) {
      if(!steppedOf(chosen.row, chosen.index, node.record)) throw new Error(`${node.name} goes no further that way (${chosen.name}). The steps it can take: ${stepsOf(node).join(', ')}.`);
      return madeSaid([stepRow(chosen.row, chosen.index)].filter(Boolean));
    } /* else -- a roll or a blend: the selection stays, and several can be made */
    let other = null;
    if(chosen.name === 'blend') {
      other = ((typeof partner === 'string') && partner.trim()) ? soundFor(partner) : nodes.get(marked);
      if(!other || (other === node)) throw new Error('blend takes two sounds: name the other in `with`.');
      if(selected !== node) select(node, false)/*the other was put on the bench from the kit*/;
    } /* else -- a roll */
    return madeSaid(Array.from({ length: takesOf(takes) }, () => other ? blendWith(other) : chosen.row ? rollRow(chosen.row) : mutate()).filter(Boolean));
  },
  keep: async ({ sound, as } = {}) => {
    const node = soundFor(sound);
    if(node !== selected) select(node, false);
    if((typeof as === 'string') && (as.trim() !== '')) { node.name = nameOf(as); showTree(); showSelected(); }
    const replaced = inKit(node);
    if(!await keep()) throw new Error(notice || 'It was not kept. Try again.');
    return { kept: node.name, replaced, kit: [...new Set([...kit.map((kept) => kept.name), node.name])].sort() };
  },
};

// == Boot ========================================================================
showTree();
showSelected();
showKit();
requestAnimationFrame(follow);
window.charmiq.exportCommands(Object.fromEntries(DECLARATIONS.map(({ name }) => [name, COMMANDS[name]])));

// the kit as `content$` gives it: a sound kept in another window shows here
appContent.content$(APP_CONTENT_SELECTOR).subscribe({
  next: receive,
  error: (error) => {
    console.error(`Could not read the ${APP_CONTENT_NAME} app-content`, error);
    contentFailed = true;
    showKit();
  },
});
})();
</script>
</body>
</html>
  </app-source>
</iframe-app>

## How to Use It

* **Pick a kind of sound.** Each button along the top starts a new sound of its kind and plays it. Click again for another: each one starts a family, listed down the left of the family box, the newest first.

* **A sound never changes.** Whatever you do to a sound makes a new one beside it, joined to it by a line, so going back is a click on the sound you came from.

* **Mutate** makes a sound near the selected one and leaves you where you are, so the next click is another take on the same sound. The slider beside it sets how near: subtle changes a little, wild changes a lot. Click a take to go on from it.

* **Steer.** Each row on the right is one thing you can hear: length, pitch, movement, tone, punch, space, volume. A step (Shorter, Lower, Darker) takes you to a sound with that change; Shorter and Longer play the same sound over less or more time. The dice roll that one thing and leave the rest, and you stay to roll again.

* **Blend.** Select a sound and press **Mark to blend**; select another and press **Blend with**. The first blend of two sounds is the even one; each after it is another cross of the two.

* **The family shows the way to the selected sound**: what each sound on the way made, the newest first. A sound off the way shows how many came of it (`+6`) and opens when you click it, so the box never holds more than the way there. Each tile says what made it.

* **Remove** takes out the selected sound and everything made from it; the button says how many. **Put back** undoes the last removal. Removing a sound never takes it out of the kit. Past 40 families, the oldest sound nothing was made from goes; the families hold 400 sounds in all.

* **All the knobs** holds every knob the sound has, for when a step is not exact enough. The first knob you move makes a new sound, and the knobs go on shaping that one. Double-click a slider to put it back.

* **The picture** shows the selected sound: its pitches over time above (higher is higher, brighter is louder) and its wave beneath.

* **Keep** puts the sound in the kit under its name; the kit is saved with the document (`sounds.json`, the Application's app-content, a line for each sound). Keeping a sound whose name the kit already holds replaces that one, and the button says **Update**. The families are gone when the page reloads; the kit stays. The kit holds 100 sounds.

## Taking a Sound Away

* **WAV** downloads the sound: 16-bit, one channel, 44,100 samples a second.

* **Code** gives JavaScript that makes the sound, with nothing to load: the engine (one function, `zap`), the sound's record and a `play`. **Kit code** gives the same for every sound in the kit, each by its name (`Laser 7` is `laser7`), which is how a game takes all of its sounds at once.

## Working With a Charm

* **Four commands**, each one of your own buttons: `look` describes the bench, `start` starts a sound of a kind, `change` makes a sound from one (a step, a roll or a blend) and `keep` keeps one in the kit under a name. What a Charm makes plays for you and shows in the family, and the selection is shared: click the take you like and the Charm's next `look` sees it.

* **A Charm cannot hear.** Each answer gives the sound in measures: its heard length, the pitch it starts and ends at, its brightness and its loudness. You are its ears: say "shorter" or "too thin" and it steps from there.

* **This Application is inline**, so a Charm is not told its commands (it is told those of an Application with a manifest). It reaches them through Run Code: `const zap = await charmiq.discover('charmiq.command'); return await zap.start({ kind: 'coin' });`.

## How It Makes Sound

* **One voice**: a square, saw, triangle or sine wave, or noise that has a pitch. Its pitch can slide, wobble, jump once and start over; an envelope shapes its loudness; a low-pass and a high-pass filter and a flanger color it; FM, drive, a bit crusher and an echo finish it.

* **Coin, Laser, Explosion, Power-up, Hit, Jump, Blip and Click** follow the ranges of sfxr, the generator this kind of tool began with (through jsfxr, its port under the Unlicense). **Zap, Whoosh, Thud, Chime and Alarm** use what this engine adds. **Wild** is any of them, mutated a long way.

* **A record is exact.** The same record gives the same samples every time, noise included, so the WAV and the code are the sound you heard.
