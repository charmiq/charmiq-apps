---
theme: charmiq:none
---

<style>
  :root {
    background: rgb(0, 0, 0);
  }
  body {
    margin: 0px;
    padding: 0px;
  }
  body > * {
    margin: 0px;
  }
</style>

<iframe-app height="100svh" width="100%" requested-scopes="%5B%22mcp.platform.generation%22%2C%22mcp.platform.vfs%22%5D">
  <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Synth Jukebox</title>
<style>
:root {
  --bg: #FFFFFF;
  --card: #F2F2F7;
  --label: #000;
  --label2: rgba(60,60,67,.6);
  --label3: rgba(60,60,67,.3);
  --sep: rgba(60,60,67,.22);
  --fill: rgba(118,118,128,.12);
  --fill2: rgba(120,120,128,.2);
  --hi: rgba(0,0,0,.05);
  --accent: #FA2D48;
  --glass: rgba(250,250,252,.72);
  --glass-edge: rgba(255,255,255,.8);
  --glass-line: rgba(0,0,0,.08);
  --shadow: 0 10px 30px rgba(0,0,0,.12);
  --menu: rgba(240,240,242,.88);
  --menu-sep: rgba(60,60,67,.18);
  --alert: rgba(242,242,242,.92);
  --bar: rgba(255,255,255,.82);
  --safe-t: env(safe-area-inset-top,0px);
  --safe-b: env(safe-area-inset-bottom,0px);
  --safe-l: env(safe-area-inset-left,0px);
  --safe-r: env(safe-area-inset-right,0px);
  --ease: cubic-bezier(.32,.72,0,1);
  --spring: cubic-bezier(.34,1.45,.64,1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000;
    --card: #1C1C1E;
    --label: #fff;
    --label2: rgba(235,235,245,.6);
    --label3: rgba(235,235,245,.3);
    --sep: rgba(84,84,88,.6);
    --fill: rgba(118,118,128,.24);
    --fill2: rgba(120,120,128,.36);
    --hi: rgba(255,255,255,.07);
    --accent: #FF375F;
    --glass: rgba(32,32,34,.72);
    --glass-edge: rgba(255,255,255,.14);
    --glass-line: rgba(255,255,255,.06);
    --shadow: 0 10px 30px rgba(0,0,0,.55);
    --menu: rgba(40,40,42,.9);
    --menu-sep: rgba(84,84,88,.5);
    --alert: rgba(30,30,30,.94);
    --bar: rgba(16,16,16,.82);
  }
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
  touch-action: manipulation;
}
body {
  font-family: -apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,"Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size: 17px;
  letter-spacing: -.41px;
  color: var(--label);
  -webkit-font-smoothing: antialiased;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
  letter-spacing: inherit;
  text-align: inherit;
}
input {
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  background: none;
  border: 0;
  outline: 0;
  -webkit-user-select: text;
  user-select: text;
  min-width: 0;
  -webkit-appearance: none;
  appearance: none;
  caret-color: var(--accent);
}
svg {
  display: block;
  flex: none;
}
img {
  display: block;
}
.hidden {
  display: none !important;
}

#app {
  position: fixed;
  inset: 0;
  background: var(--bg);
  overflow: hidden;
  transform-origin: 50% 0;
  transition: transform .55s var(--ease), border-radius .55s var(--ease), filter .55s var(--ease);
}
#app.behind {
  transform: translateY(calc(var(--safe-t) + 10px)) scale(.93);
  border-radius: 14px;
  filter: brightness(.6);
}
.pane {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}
.tabpane {
  z-index: 1;
  display: none;
  transition: transform .5s var(--ease);
}
.tabpane.on {
  display: flex;
  animation: fadeIn .25s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
#detail {
  z-index: 2;
  transform: translateX(100%);
  transition: transform .5s var(--ease);
  box-shadow: -10px 0 30px rgba(0,0,0,.1);
}
#app.detail-open #detail {
  transform: none;
}
#app.detail-open .tabpane.on {
  transform: translateX(-30%);
}

.nav {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  padding: var(--safe-t) var(--safe-r) 0 var(--safe-l);
  transition: background-color .2s;
}
.nav::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: .5px;
  background: var(--sep);
  opacity: 0;
  transition: opacity .2s;
}
.nav.solid {
  background: var(--bar);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
}
.nav.solid::after {
  opacity: 1;
}
.nav-bar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  position: relative;
}
.nav-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
  font-weight: 600;
  font-size: 17px;
  opacity: 0;
  transition: opacity .15s;
  white-space: nowrap;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.nav.solid .nav-title {
  opacity: 1;
}
.nav-btn {
  color: var(--accent);
  height: 44px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 17px;
  transition: opacity .15s;
}
/* a back button names the page it returns to, an album's title included */
#backLabel {
  max-width: 42vw;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-btn:active {
  opacity: .3;
  transition: none;
}
.nav-right {
  display: flex;
  align-items: center;
  margin-left: auto;
}
.nav-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--fill);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-right: 6px;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding: calc(var(--safe-t) + 44px) var(--safe-r) calc(var(--safe-b) + 170px) var(--safe-l);
}
.lt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 16px 6px;
}
.large-title {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: .37px;
  line-height: 41px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg,#FA2D48,#AF52DE);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(175,82,222,.35);
}
.sec-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .35px;
  padding: 24px 16px 10px;
}
.sec-h button {
  font-size: 17px;
  font-weight: 400;
  color: var(--accent);
  letter-spacing: -.41px;
}

.hscroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 16px 6px;
  scroll-snap-type: x mandatory;
  scroll-padding: 0 16px;
  scrollbar-width: none;
}
.hscroll::-webkit-scrollbar {
  display: none;
}
.pick {
  flex: none;
  width: min(260px,70vw);
  border-radius: 14px;
  overflow: hidden;
  scroll-snap-align: start;
  background: var(--card);
  box-shadow: 0 6px 18px rgba(0,0,0,.12);
  transition: transform .25s var(--spring);
}
.pick:active {
  transform: scale(.96);
}
.pick img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.pick-cap {
  padding: 11px 14px 14px;
  color: #fff;
}
.pick-kicker {
  font-size: 11px;
  font-weight: 700;
  opacity: .85;
  text-transform: uppercase;
  letter-spacing: .4px;
}
.pick-title {
  font-size: 17px;
  font-weight: 600;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-sub {
  font-size: 14px;
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compose {
  display: block;
  width: calc(100% - 32px);
  margin: 0 16px;
  border-radius: 18px;
  padding: 18px 18px 20px;
  color: #fff;
  position: relative;
  overflow: hidden;
  background: linear-gradient(120deg,#FA2D48,#AF52DE,#5856D6,#FF9500,#FA2D48);
  background-size: 400% 400%;
  animation: flow 14s ease infinite;
  transition: transform .25s var(--spring);
  box-shadow: 0 10px 30px rgba(175,82,222,.3);
}
.compose:active {
  transform: scale(.97);
}
@keyframes flow {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
.compose-glyph {
  position: absolute;
  right: -14px;
  top: -14px;
  opacity: .28;
  animation: spin 18s linear infinite;
}
.compose-glyph svg {
  width: 130px;
  height: 130px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.compose-k {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
  opacity: .9;
}
.compose-t {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: .3px;
  margin-top: 4px;
}
.compose-s {
  font-size: 15px;
  line-height: 20px;
  opacity: .92;
  margin-top: 6px;
  max-width: 440px;
}

.atile {
  display: block;
  text-align: left;
  min-width: 0;
  transition: transform .25s var(--spring);
}
.atile:active {
  transform: scale(.96);
}
.atile img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 9px;
  object-fit: cover;
  box-shadow: 0 0 0 .5px var(--sep);
}
.hscroll .atile {
  width: 150px;
  flex: none;
  scroll-snap-align: start;
}
.alb-t {
  font-size: 15px;
  margin-top: 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -.24px;
}
.alb-a {
  font-size: 13px;
  color: var(--label2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -.08px;
}
.agrid {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(150px,1fr));
  gap: 20px 14px;
  padding: 0 16px;
}

.rows {
  margin: 0 16px;
}
.lrow {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 50px;
  border-bottom: .5px solid var(--sep);
  color: var(--label);
}
.lrow > svg:first-child {
  color: var(--accent);
  width: 24px;
  height: 24px;
}
.lrow span {
  flex: 1;
  font-size: 20px;
  letter-spacing: .38px;
}
.lrow .lrow-n {
  flex: none;
  font-size: 17px;
  color: var(--label2);
  letter-spacing: -.41px;
}
.lrow .chev {
  color: var(--label3);
}
.lrow:active {
  opacity: .5;
}

.trk {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  min-height: 52px;
  transition: background-color .2s;
  cursor: pointer;
}
.trk:active {
  background: var(--hi);
  transition: none;
}
.trk-num {
  width: 22px;
  display: flex;
  justify-content: center;
  color: var(--label2);
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  flex: none;
}
.trk-thumb {
  width: 46px;
  height: 46px;
  border-radius: 6px;
  flex: none;
  position: relative;
  overflow: hidden;
  margin: 4px 0;
}
.trk-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-eq {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb-eq .eq i {
  background: #fff;
}
.trk-body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: stretch;
  border-bottom: .5px solid var(--sep);
  padding-right: 4px;
}
.trk-main {
  flex: 1;
  min-width: 0;
}
.trk-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.trk-sub {
  font-size: 14px;
  color: var(--label2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
  letter-spacing: -.15px;
}
.trk-heart {
  color: var(--accent);
}
.trk-heart svg {
  width: 13px;
  height: 13px;
}
.trk-dur {
  color: var(--label2);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.trk-more {
  width: 40px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--label);
  flex: none;
}
.trk-more:active {
  opacity: .3;
}
.eq {
  display: inline-flex;
  gap: 2px;
  align-items: flex-end;
  height: 14px;
}
.eq i {
  width: 3px;
  background: var(--accent);
  border-radius: 1px;
  height: 30%;
  animation: eq .9s ease-in-out infinite alternate;
}
.eq i:nth-child(2) {
  animation-duration: .62s;
  animation-delay: -.3s;
}
.eq i:nth-child(3) {
  animation-duration: .8s;
  animation-delay: -.55s;
}
.eq i:nth-child(4) {
  animation-duration: 1.05s;
  animation-delay: -.2s;
}
@keyframes eq {
  0% {
    height: 18%;
  }
  100% {
    height: 100%;
  }
}
.is-paused .eq i {
  animation-play-state: paused;
}

.ahead {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px 18px;
  text-align: center;
}
.ahead img {
  width: min(270px,68vw);
  aspect-ratio: 1;
  border-radius: 10px;
  box-shadow: 0 18px 40px rgba(0,0,0,.28);
  object-fit: cover;
}
.ah-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.ah-title {
  font-size: 22px;
  font-weight: 600;
  margin-top: 18px;
  letter-spacing: .35px;
}
.ah-artist {
  font-size: 22px;
  color: var(--accent);
  margin-top: 1px;
  letter-spacing: .35px;
}
.ah-meta {
  font-size: 12px;
  color: var(--label2);
  font-weight: 600;
  margin-top: 6px;
  text-transform: uppercase;
  letter-spacing: .3px;
}
.pills {
  display: flex;
  gap: 14px;
  margin-top: 18px;
  width: 100%;
  max-width: 420px;
}
.pill {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  background: var(--fill);
  color: var(--accent);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform .2s var(--spring);
}
.pill svg {
  width: 18px;
  height: 18px;
}
.pill:active {
  transform: scale(.95);
  opacity: .7;
}
.afoot {
  color: var(--label2);
  font-size: 15px;
  padding: 14px 16px;
  line-height: 21px;
}
@media (min-width:768px) {
  .ahead {
    flex-direction: row;
    align-items: flex-end;
    text-align: left;
    gap: 28px;
    padding: 14px 24px 26px;
  }
  .ahead img {
    width: 250px;
  }
  .ah-info {
    align-items: flex-start;
  }
}

.search {
  margin: 2px 16px 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-field {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  background: var(--fill);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: var(--label2);
}
.search-field input {
  flex: 1;
  font-size: 17px;
  color: var(--label);
  height: 36px;
}
.search-field input::placeholder {
  color: var(--label2);
}
.search-cancel {
  color: var(--accent);
  display: none;
}
.search.active .search-cancel {
  display: block;
}
.gtiles {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(155px,1fr));
  gap: 14px;
  padding: 0 16px;
}
.gtile {
  height: 112px;
  border-radius: 12px;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: .2px;
  padding: 12px 14px;
  position: relative;
  overflow: hidden;
  text-align: left;
  display: block;
  transition: transform .25s var(--spring);
}
.gtile:active {
  transform: scale(.96);
}
.gtile span {
  position: relative;
  z-index: 1;
  text-shadow: 0 1px 6px rgba(0,0,0,.25);
}
.gtile img {
  position: absolute;
  width: 78px;
  height: 78px;
  right: -10px;
  bottom: -8px;
  transform: rotate(22deg);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0,0,0,.35);
}
.empty {
  text-align: center;
  color: var(--label3);
  font-size: 20px;
  font-weight: 600;
  padding: 16vh 30px 0;
  letter-spacing: .38px;
}
.empty-sub {
  font-size: 15px;
  font-weight: 400;
  color: var(--label2);
  margin-top: 8px;
  letter-spacing: -.24px;
}
.foot-note {
  margin: 26px 16px 0;
  padding: 16px;
  border-radius: 14px;
  background: var(--card);
  color: var(--label2);
  font-size: 14px;
  line-height: 20px;
  letter-spacing: -.15px;
}
.foot-note b {
  color: var(--label);
  font-weight: 600;
}

.dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 0 calc(14px + var(--safe-r)) calc(var(--safe-b) + 10px) calc(14px + var(--safe-l));
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.dock::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -40px;
  bottom: 0;
  background: linear-gradient(to top, var(--bg) 25%, transparent);
  opacity: .85;
  pointer-events: none;
}
.glass {
  background: var(--glass);
  -webkit-backdrop-filter: blur(24px) saturate(190%);
  backdrop-filter: blur(24px) saturate(190%);
  box-shadow: var(--shadow), inset 0 0 0 .5px var(--glass-edge), 0 0 0 .5px var(--glass-line);
}
.mini {
  pointer-events: auto;
  width: 100%;
  max-width: 560px;
  height: 58px;
  border-radius: 29px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  position: relative;
  cursor: pointer;
  transition: transform .45s var(--spring), opacity .25s;
}
.mini.hidden-mini {
  transform: translateY(24px) scale(.96);
  opacity: 0;
  pointer-events: none;
}
.mini img {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.mini-txt {
  flex: 1;
  min-width: 0;
}
.mini-t {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -.24px;
}
.mini-a {
  font-size: 13px;
  color: var(--label2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -.08px;
}
.mini-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--label);
  border-radius: 50%;
  transition: transform .2s var(--spring), background-color .2s;
}
.mini-btn:active {
  background: var(--fill);
  transform: scale(.88);
}
.mini-btn svg {
  width: 24px;
  height: 24px;
}
.mini-btn.sk svg {
  width: 28px;
  height: 22px;
}
.mini-prog {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 3px;
  height: 2px;
  border-radius: 1px;
  overflow: hidden;
  background: var(--fill);
}
.mini-prog i {
  display: block;
  height: 100%;
  background: var(--accent);
  width: 0;
}
.tabbar {
  pointer-events: auto;
  height: 62px;
  border-radius: 31px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  width: 100%;
  max-width: 400px;
  position: relative;
}
.tab {
  flex: 1;
  height: 52px;
  border-radius: 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-size: 10px;
  font-weight: 600;
  color: var(--label);
  letter-spacing: .1px;
  transition: color .25s;
  position: relative;
  z-index: 1;
}
.tab.on {
  color: var(--accent);
}
.tab-ind {
  position: absolute;
  top: 5px;
  left: 6px;
  width: 0;
  height: 52px;
  border-radius: 26px;
  background: var(--fill);
  transition: left .5s var(--spring), width .5s var(--spring), top .5s var(--spring), height .5s var(--spring);
}

#np {
  position: fixed;
  inset: 0;
  z-index: 40;
  color: #fff;
  transform: translateY(105%);
  transition: transform .55s var(--ease);
  overflow: hidden;
  background: #151518;
  display: flex;
  flex-direction: column;
}
#np.open {
  transform: none;
}
#np:not(.open) {
  visibility: hidden;
  transition: transform .55s var(--ease), visibility 0s linear .55s;
}
#npBg {
  position: absolute;
  left: -80px;
  top: -80px;
  width: calc(100% + 160px);
  height: calc(100% + 160px);
  filter: blur(34px) saturate(1.25);
}
.np-in {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-t) + 4px) calc(26px + var(--safe-r)) calc(var(--safe-b) + 16px) calc(26px + var(--safe-l));
  max-width: 540px;
  width: 100%;
  margin: 0 auto;
  min-height: 0;
}
.grab-hit {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 100%;
}
.grab {
  width: 38px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255,255,255,.45);
}
.np-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-top: 6px;
}
.np-artwrap {
  width: var(--art,300px);
  height: var(--art,300px);
  transition: transform .75s var(--spring);
}
#np.paused .np-artwrap {
  transform: scale(.8);
}
.np-art {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: 0 26px 60px rgba(0,0,0,.5);
  transition: box-shadow .6s;
  will-change: transform;
}
#np.paused .np-art {
  box-shadow: 0 10px 26px rgba(0,0,0,.3);
}
#score {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: none;
  border-radius: 14px;
  background: rgba(0,0,0,.24);
  box-shadow: inset 0 0 0 .5px rgba(255,255,255,.12);
}
.score-cap {
  position: absolute;
  left: 14px;
  top: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .6px;
  text-transform: uppercase;
  color: rgba(255,255,255,.75);
  pointer-events: none;
  display: none;
}
.score-cap i {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #FF453A;
  margin-right: 6px;
  animation: blink 1.2s ease-in-out infinite;
  vertical-align: 1px;
}
@keyframes blink {
  50% {
    opacity: .25;
  }
}
#np.mode-score #score, #np.mode-score .score-cap {
  display: block;
}
#np.mode-score .np-artwrap, #np.mode-queue .np-artwrap {
  display: none;
}
.np-queue {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  display: none;
}
#np.mode-queue .np-queue {
  display: block;
}
.np-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
  flex: none;
}
.np-txt {
  flex: 1;
  min-width: 0;
}
.np-t {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: .38px;
}
.np-a {
  font-size: 19px;
  color: rgba(255,255,255,.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: .3px;
}
.np-circ {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,.16);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: #fff;
  transition: transform .25s var(--spring);
}
.np-circ:active {
  transform: scale(.85);
}
.np-circ svg {
  width: 17px;
  height: 17px;
}
.np-circ.on {
  background: #fff;
  color: #FA2D48;
}
.slider {
  position: relative;
  height: 30px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}
.slider .track {
  position: relative;
  width: 100%;
  height: 7px;
  border-radius: 4px;
  background: rgba(255,255,255,.22);
  overflow: hidden;
  transition: height .2s var(--spring);
}
.slider .fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(255,255,255,.7);
  width: 0;
}
.slider.active .track {
  height: 13px;
  border-radius: 7px;
}
.slider.active .fill {
  background: #fff;
}
.np-scrub {
  margin-top: 14px;
  flex: none;
}
.times {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,.6);
  font-variant-numeric: tabular-nums;
  margin-top: -2px;
  letter-spacing: 0;
}
.np-ctrl {
  display: flex;
  justify-content: space-evenly;
  align-items: center;
  margin: 12px 0 8px;
  flex: none;
}
.np-ctrl button {
  width: 80px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  transition: transform .2s var(--spring), background-color .2s;
}
.np-ctrl button:active {
  transform: scale(.84);
  background: rgba(255,255,255,.14);
}
.np-ctrl .pp svg {
  width: 46px;
  height: 46px;
}
.np-ctrl .sk svg {
  width: 42px;
  height: 32px;
}
.vol {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255,255,255,.65);
  flex: none;
}
.vol .slider {
  flex: 1;
}
/* a take on iOS is as loud as the device's buttons set it: the slider would reach
   nothing, so it gives way in place */
#np.device-volume .vol {
  visibility: hidden;
}
.np-bottom {
  display: flex;
  justify-content: space-around;
  margin-top: 14px;
  flex: none;
}
.np-bottom button {
  width: 48px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,.7);
  border-radius: 11px;
  transition: background-color .2s, color .2s, transform .2s var(--spring);
}
.np-bottom button:active {
  transform: scale(.88);
}
.np-bottom button.on {
  color: #fff;
  background: rgba(255,255,255,.2);
}
.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0 12px;
}
.q-title {
  font-weight: 700;
  font-size: 17px;
}
.q-sub {
  font-size: 13px;
  color: rgba(255,255,255,.65);
}
.q-toggles {
  display: flex;
  gap: 8px;
}
.q-tog {
  width: 46px;
  height: 32px;
  border-radius: 16px;
  background: rgba(255,255,255,.16);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.q-tog svg {
  width: 19px;
  height: 19px;
}
.q-tog.on {
  background: #fff;
  color: #111;
}
.q-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  color: #fff;
  border-radius: 8px;
}
.q-row:active {
  background: rgba(255,255,255,.1);
}
.q-row img {
  width: 46px;
  height: 46px;
  border-radius: 6px;
  object-fit: cover;
}
.q-txt {
  flex: 1;
  min-width: 0;
}
.q-t {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 16px;
}
.q-a {
  font-size: 13px;
  color: rgba(255,255,255,.65);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-d {
  font-size: 14px;
  color: rgba(255,255,255,.6);
  font-variant-numeric: tabular-nums;
}
.q-empty {
  color: rgba(255,255,255,.7);
  text-align: center;
  padding: 40px 10px;
  line-height: 22px;
  font-size: 15px;
}

.menu-wrap {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: none;
}
.menu-wrap.open {
  display: block;
}
.menu {
  position: absolute;
  min-width: 240px;
  background: var(--menu);
  color: var(--label);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  backdrop-filter: blur(40px) saturate(180%);
  border-radius: 14px;
  box-shadow: 0 10px 60px rgba(0,0,0,.25);
  overflow: hidden;
  transform-origin: top right;
  animation: pop .38s var(--ease);
}
@keyframes pop {
  from {
    transform: scale(.3);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.menu button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 46px;
  font-size: 17px;
  color: var(--label);
}
.menu button + button {
  border-top: .5px solid var(--menu-sep);
}
.menu button:active {
  background: var(--fill2);
}
.menu button.destructive {
  color: #FF3B30;
}
.menu button svg {
  width: 20px;
  height: 20px;
}
.alert-wrap {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0,0,0,.25);
  display: none;
  align-items: center;
  justify-content: center;
}
.alert-wrap.open {
  display: flex;
}
.alert {
  width: 270px;
  border-radius: 14px;
  background: var(--alert);
  color: var(--label);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  backdrop-filter: blur(30px) saturate(180%);
  overflow: hidden;
  text-align: center;
  animation: alertIn .28s var(--ease);
}
@keyframes alertIn {
  from {
    transform: scale(1.18);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.alert-text {
  padding: 19px 16px 20px;
}
.alert-title {
  font-weight: 600;
  font-size: 17px;
  line-height: 22px;
}
.alert-msg {
  font-size: 13px;
  line-height: 16px;
  margin-top: 3px;
  letter-spacing: -.08px;
}
.alert-btns {
  display: flex;
  border-top: .5px solid var(--menu-sep);
}
.alert-btns button {
  flex: 1;
  height: 44px;
  color: #007AFF;
  font-size: 17px;
  text-align: center;
}
.alert-btns button + button {
  border-left: .5px solid var(--menu-sep);
}
.alert-btns .cancel, .alert-btns .primary {
  font-weight: 600;
}
.alert-btns .destructive {
  color: #FF3B30;
}
.alert-btns button[disabled] {
  opacity: .35;
}
/* 16px: iOS zooms the page into a smaller field it focuses */
.alert-field {
  display: block;
  width: 100%;
  height: 34px;
  margin-top: 14px;
  padding: 0 9px;
  border-radius: 8px;
  background: var(--bg);
  box-shadow: inset 0 0 0 .5px var(--menu-sep);
  font-size: 16px;
  text-align: left;
  letter-spacing: -.3px;
}
.alert-field + .alert-field {
  margin-top: 8px;
}
/* the resting toast is hidden, not only moved: an offset from its own height leaves
   a short (empty) toast's edge and shadow showing under the status bar. Hiding waits
   for the slide-out to finish */
.toast {
  position: fixed;
  z-index: 80;
  left: 50%;
  top: calc(var(--safe-t) + 12px);
  transform: translate(-50%,-140%);
  visibility: hidden;
  padding: 11px 18px;
  border-radius: 22px;
  font-size: 15px;
  font-weight: 600;
  color: var(--label);
  white-space: nowrap;
  max-width: 92vw;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: transform .5s var(--spring), visibility 0s .5s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.toast svg {
  color: var(--accent);
  width: 18px;
  height: 18px;
}
.toast.show {
  transform: translate(-50%,0);
  visibility: visible;
  transition: transform .5s var(--spring), visibility 0s;
}
.toast span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toast-act {
  flex: none;
  color: var(--accent);
  font-weight: 700;
  padding: 4px 2px 4px 10px;
  margin: -4px 0;
  border-left: .5px solid var(--sep);
}

/* the Studio: the booth a song is described in, and its takes */
.booth {
  margin: 0 16px;
  border-radius: 22px;
  padding: 16px 16px 14px;
  color: #fff;
  position: relative;
  overflow: hidden;
  background: linear-gradient(120deg,#1B1035,#5856D6,#AF52DE,#FA2D48,#1B1035);
  background-size: 400% 400%;
  animation: flow 18s ease infinite;
  box-shadow: 0 12px 34px rgba(88,86,214,.35);
}
.booth > * {
  position: relative;
}
.booth .compose-glyph {
  position: absolute;
}
/* the record glyph cuts its grooves in the page's background color: on the cards'
   gradients that is a dark cut in either color scheme */
.compose-glyph {
  --bg: rgba(0,0,0,.6);
}
.booth-field {
  display: block;
  margin-top: 10px;
  border-radius: 14px;
  background: rgba(0,0,0,.28);
  box-shadow: inset 0 0 0 .5px rgba(255,255,255,.22);
  padding: 12px 14px;
}
.booth-field textarea {
  display: block;
  width: 100%;
  min-height: 72px;
  font: inherit;
  font-size: 17px;
  line-height: 23px;
  letter-spacing: -.3px;
  color: #fff;
  background: none;
  border: 0;
  outline: 0;
  resize: none;
  -webkit-user-select: text;
  user-select: text;
  -webkit-appearance: none;
  appearance: none;
  caret-color: #fff;
}
.booth-field textarea::placeholder {
  color: rgba(255,255,255,.62);
}
.booth-ideas {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.booth-ideas button {
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  font-size: 14px;
  font-weight: 600;
  background: rgba(255,255,255,.16);
  white-space: nowrap;
}
.booth-ideas button:active {
  background: rgba(255,255,255,.3);
}
.chips {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  margin: 12px -16px 0;
  padding: 0 16px 2px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar {
  display: none;
}
.chip {
  flex: none;
  height: 32px;
  padding: 0 13px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.4);
  transition: background-color .2s, color .2s, transform .2s var(--spring);
}
.chip.on {
  background: #fff;
  color: #5856D6;
  box-shadow: none;
}
.chip:active {
  transform: scale(.94);
}
/* the press: a pressing plate, its grooves ringing out from the record it presses */
.press {
  width: 100%;
  height: 64px;
  margin-top: 14px;
  padding: 0 10px 0 10px;
  border-radius: 32px;
  color: #fff;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 12px;
  background:
    repeating-radial-gradient(circle at 32px 50%, rgba(255,255,255,.07) 0 1px, transparent 1.5px 4px),
    linear-gradient(110deg,#121016,#24163A 55%,#3A1430);
  box-shadow: 0 10px 26px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.22), 0 0 22px rgba(255,55,95,.35);
  transition: transform .25s var(--spring), opacity .2s;
}
/* a light sweeping across the plate now and then */
.press::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -40%;
  width: 30%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.16), transparent);
  transform: skewX(-18deg);
  animation: sheen 4.5s ease-in-out infinite;
  pointer-events: none;
}
@keyframes sheen {
  0%, 62% {
    left: -40%;
  }
  100% {
    left: 130%;
  }
}
.press:active {
  transform: scale(.97);
}
.press[disabled] {
  opacity: .75;
}
.press .vinyl {
  width: 44px;
  height: 44px;
  --label-color: #FF375F;
  animation: spin 4s linear infinite;
}
.press:active .vinyl, .press[disabled] .vinyl {
  animation-duration: .7s;
}
.press-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  text-align: left;
}
.press-t {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: .2px;
  line-height: 22px;
}
.press-s {
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  opacity: .7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.press-go {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50%;
  background: linear-gradient(135deg,#FF375F,#AF52DE);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(255,55,95,.45);
}
.press-go svg {
  width: 22px;
  height: 22px;
}
.booth-fine {
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  opacity: .8;
  margin-top: 10px;
}
.vinyl {
  display: block;
  flex: none;
  border-radius: 50%;
  background:
    radial-gradient(circle, #111 0 5%, var(--label-color, #FA2D48) 6% 31%, transparent 32%),
    conic-gradient(transparent 0 12%, rgba(255,255,255,.2) 17%, transparent 22% 62%, rgba(255,255,255,.12) 67%, transparent 72%),
    repeating-radial-gradient(circle, #141414 0 1.5px, #262626 2px 3px);
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.takes {
  margin: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.take {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 6px 10px 10px;
  border-radius: 16px;
  background: var(--card);
  text-align: left;
  width: 100%;
  transition: transform .25s var(--spring);
}
.take.ready {
  cursor: pointer;
}
.take.ready:active {
  transform: scale(.98);
}
.take-play:active {
  transform: scale(.9);
}
.take-disc {
  position: relative;
  width: 58px;
  height: 58px;
  flex: none;
}
.take-disc img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
}
.take-disc .vinyl {
  position: absolute;
  inset: 6px;
}
.take-disc .vinyl.picture {
  background:
    radial-gradient(circle, #111 0 5%, rgba(255,255,255,.35) 5.5% 7%, transparent 7.5%),
    conic-gradient(transparent 0 12%, rgba(255,255,255,.22) 17%, transparent 22% 62%, rgba(255,255,255,.14) 67%, transparent 72%),
    var(--picture) center / cover no-repeat;
}
.take.pressing .take-disc .vinyl {
  animation: spin 1.6s linear infinite;
}
.take.failed .take-disc .vinyl {
  filter: grayscale(1);
  opacity: .5;
}
.take-ring {
  position: absolute;
  inset: 0;
  width: 58px;
  height: 58px;
  transform: rotate(-90deg);
}
.take-ring circle {
  fill: none;
  stroke-width: 3;
}
.take-ring .ring-bg {
  stroke: var(--fill2);
}
.take-ring .ring-fill {
  stroke: var(--accent);
  stroke-linecap: round;
  transition: stroke-dashoffset .5s linear;
}
.take-main {
  flex: 1;
  min-width: 0;
}
.take-t {
  font-weight: 600;
  line-height: 24px;
  height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* the flaps hold the title's one line: a name longer than it fades off its edge */
.take-t.flaps {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
}
/* one flap of a departure board: a dark tile split across its middle */
.flap {
  position: relative;
  flex: none;
  display: inline-block;
  min-width: .78em;
  padding: 0 2px;
  border-radius: 3px;
  background: #1C1C1E;
  color: #F2F2F7;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 15px;
  font-weight: 700;
  line-height: 21px;
  text-align: center;
  box-shadow: inset 0 -1px 0 rgba(255,255,255,.08);
}
.flap::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: rgba(0,0,0,.55);
}
.flap.set {
  color: #FFD60A;
}
.flap.fresh {
  animation: flapSet .35s ease-out;
}
.flap.gap {
  min-width: .45em;
  background: none;
  box-shadow: none;
}
@keyframes flapSet {
  from {
    background: #3A3A3C;
    transform: scaleY(.6);
  }
  to {
    background: #1C1C1E;
    transform: none;
  }
}
.take-p {
  font-size: 14px;
  line-height: 18px;
  color: var(--label2);
  margin-top: 1px;
  letter-spacing: -.15px;
}
.take-s {
  font-size: 12px;
  font-weight: 600;
  color: var(--label2);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: .3px;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 6px;
}
.take.pressing .take-s {
  color: var(--accent);
}
.take-err {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 18px;
  color: #FF3B30;
  min-width: 0;
}
.take-err .marquee {
  flex: 1;
}
.ings {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.ing {
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  padding: 0 7px;
  border-radius: 9px;
  background: var(--fill);
  color: var(--label2);
  white-space: nowrap;
}
.afoot .ings {
  margin: 6px 0 8px;
}
.take-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.take-acts button {
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  background: var(--fill);
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
}
.take-acts button.destructive {
  color: #FF3B30;
}
.take-play {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* a pressing card keeps its Play button's place, so the button arriving moves nothing */
.take-play-slot {
  width: 40px;
  height: 40px;
  flex: none;
}
.take-play svg {
  width: 18px;
  height: 18px;
}
.take-play .eq i {
  background: #fff;
}
/* a line held to one row: one longer than its row shows its start a moment, scrolls
   to its end, holds and scrolls back, fading at whichever edge hides text */
@property --fade-l {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}
@property --fade-r {
  syntax: "<length>";
  inherits: false;
  initial-value: 14px;
}
.marquee {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: clip;
}
.marquee-in {
  display: inline-block;
  vertical-align: top;
}
.ings .marquee-in {
  display: inline-flex;
  gap: 4px;
}
.marquee.scrolls {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--fade-l), #000 calc(100% - var(--fade-r)), transparent);
  animation: marqueeFade var(--marquee-duration) linear infinite;
}
.marquee.scrolls .marquee-in {
  animation: marqueeMove var(--marquee-duration) ease-in-out infinite;
}
@keyframes marqueeMove {
  0%, 20% {
    transform: none;
  }
  50%, 70% {
    transform: translateX(var(--marquee-shift));
  }
  100% {
    transform: none;
  }
}
@keyframes marqueeFade {
  0%, 20% {
    --fade-l: 0px;
    --fade-r: 14px;
  }
  24%, 46%, 74%, 96% {
    --fade-l: 14px;
    --fade-r: 14px;
  }
  50%, 70% {
    --fade-l: 14px;
    --fade-r: 0px;
  }
  100% {
    --fade-l: 0px;
    --fade-r: 14px;
  }
}
.studio-tag {
  display: inline-block;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .4px;
  line-height: 13px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--label2);
  color: var(--bg);
  vertical-align: 1px;
  margin-right: 5px;
}
.studio-empty {
  margin: 4px 16px 0;
  color: var(--label2);
  font-size: 15px;
  line-height: 21px;
}
.compose.go-studio {
  margin-top: 12px;
  background: linear-gradient(120deg,#1B1035,#5856D6,#AF52DE,#1B1035);
  background-size: 400% 400%;
  box-shadow: 0 10px 30px rgba(88,86,214,.3);
}
.tab-badge {
  position: absolute;
  top: 3px;
  left: calc(50% + 6px);
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
}
.tab.pressing svg {
  animation: spin 2.4s linear infinite;
}
#np.studio .score-cap i {
  background: #AF52DE;
}

/* the iPad: a sidebar for the tabs, the pages beside it. A phone turned sideways is
   too short for it and keeps the phone's layout */
@media (min-width: 768px) and (min-height: 600px) {
  :root {
    --side: 240px;
  }
  .pane {
    left: var(--side);
  }
  .scroll {
    padding-bottom: calc(var(--safe-b) + 100px);
  }
  .dock {
    left: var(--side);
  }
  .tabbar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--side);
    max-width: none;
    height: auto;
    border-radius: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: calc(var(--safe-t) + 70px) 12px calc(var(--safe-b) + 12px) calc(12px + var(--safe-l));
    background: var(--card);
    box-shadow: inset -.5px 0 0 var(--sep);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .tabbar::before {
    content: "Synth Jukebox";
    position: absolute;
    top: calc(var(--safe-t) + 22px);
    left: calc(24px + var(--safe-l));
    font-size: 24px;
    font-weight: 700;
    letter-spacing: .35px;
  }
  .tab {
    flex: none;
    height: 44px;
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -.41px;
  }
  .tab svg {
    width: 24px;
    height: 24px;
  }
  .tab-ind {
    border-radius: 10px;
  }
  .tab-badge {
    left: auto;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }
  /* as many columns as leave a card room to read: a card's own height, never its
     neighbor's */
  .takes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    align-items: start;
  }
  .np-in {
    max-width: 640px;
  }
  /* Make Something New's two cards side by side */
  #homeBody .compose {
    display: inline-block;
    vertical-align: top;
    width: calc(50% - 22px);
    min-height: 168px;
    margin: 0 0 0 16px;
  }
  #homeBody .compose.go-studio {
    margin-left: 12px;
  }
}
/* landscape: the Studio's booth stands beside its takes, kept in view while they
   scroll; Now Playing's stage beside its controls */
@media (min-width: 1000px) and (min-height: 600px) and (orientation: landscape) {
  #tab-studio .scroll {
    display: grid;
    grid-template-columns: minmax(330px, 380px) minmax(0, 1fr);
    align-items: start;
    align-content: start;
  }
  #tab-studio .lt-row {
    grid-column: 1 / -1;
  }
  #tab-studio .booth {
    position: sticky;
    top: calc(var(--safe-t) + 56px);
    margin-right: 0;
  }
  #tab-studio .sec-h {
    padding-top: 0;
  }
  .np-in {
    max-width: 1240px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    grid-template-rows: auto 1fr repeat(5, auto) 1fr;
    column-gap: 56px;
  }
  .grab-hit {
    grid-column: 1 / -1;
  }
  .np-stage {
    grid-column: 1;
    grid-row: 2 / -1;
    margin: 6px 0 10px;
  }
  .np-info {
    grid-column: 2;
    grid-row: 3;
    margin-top: 0;
  }
  .np-scrub {
    grid-column: 2;
    grid-row: 4;
  }
  .np-ctrl {
    grid-column: 2;
    grid-row: 5;
  }
  .vol {
    grid-column: 2;
    grid-row: 6;
  }
  .np-bottom {
    grid-column: 2;
    grid-row: 7;
  }
}
</style>
</head>
<body class="is-paused">
<div id="app">
  <section class="pane tabpane" id="tab-home">
    <header class="nav"><div class="nav-bar"><span class="nav-title">Home</span></div></header>
    <div class="scroll" data-th="34">
      <div class="lt-row"><h1 class="large-title">Home</h1><div class="avatar">BG</div></div>
      <div id="homeBody"></div>
    </div>
  </section>
  <section class="pane tabpane" id="tab-library">
    <header class="nav"><div class="nav-bar"><span class="nav-title">Library</span><div class="nav-right"><button class="nav-btn" data-action="compose" aria-label="Compose album"><span class="nav-circle" id="plusIco"></span></button></div></div></header>
    <div class="scroll" data-th="34">
      <div class="lt-row"><h1 class="large-title">Library</h1></div>
      <div id="libBody"></div>
    </div>
  </section>
  <section class="pane tabpane" id="tab-studio">
    <header class="nav"><div class="nav-bar"><span class="nav-title">Studio</span></div></header>
    <div class="scroll" data-th="34">
      <div class="lt-row"><h1 class="large-title">Studio</h1></div>
      <div class="booth">
        <div class="compose-glyph" id="boothGlyph"></div>
        <div class="compose-k">Infinite Record Label · Studio</div>
        <label class="booth-field"><textarea id="prompt" rows="3" maxlength="2000" enterkeyhint="send" autocomplete="off" spellcheck="true" aria-label="Describe a song"></textarea></label>
        <div class="booth-ideas"><button data-action="use-idea">Use This Idea</button><button data-action="next-idea">Another Idea</button></div>
        <div class="chips" id="chips"></div>
        <button class="press" id="pressBtn" data-action="press"><span class="vinyl"></span><span class="press-txt"><span class="press-t">Press It</span><span class="press-s" id="pressSub"></span></span><span class="press-go" id="pressGo"></span></button>
        <div class="booth-fine">Lyria 3 Pro writes and sings a whole song, up to three minutes. Pressing takes about half a minute and uses credits.</div>
      </div>
      <div id="studioBody"></div>
    </div>
  </section>
  <section class="pane tabpane" id="tab-search">
    <header class="nav"><div class="nav-bar"><span class="nav-title">Search</span></div></header>
    <div class="scroll" data-th="34">
      <div class="lt-row"><h1 class="large-title">Search</h1></div>
      <div class="search" id="searchWrap">
        <label class="search-field">
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="6.8" cy="6.8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.8 10.8 15 15" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
          <input id="search" type="search" placeholder="Artists, Songs, Genres" autocomplete="off" autocorrect="off" spellcheck="false">
        </label>
        <button class="search-cancel" data-action="search-cancel">Cancel</button>
      </div>
      <div id="searchBody"></div>
    </div>
  </section>
  <section class="pane" id="detail">
    <header class="nav"><div class="nav-bar">
      <button class="nav-btn" data-action="back" style="padding-left:2px"><svg width="13" height="21" viewBox="0 0 13 21"><path d="M11 2 2.5 10.5 11 19" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="backLabel">Home</span></button>
      <span class="nav-title" id="detailNavTitle"></span>
      <div class="nav-right"><button class="nav-btn" id="detailMore" data-action="album-menu" aria-label="More"><span class="nav-circle" id="moreIco"></span></button></div>
    </div></header>
    <div class="scroll" id="detailScroll" data-th="300"><div id="detailBody"></div></div>
  </section>
  <div class="dock">
    <div class="mini glass hidden-mini" id="mini" data-action="open-np">
      <img id="miniArt" alt="">
      <div class="mini-txt"><div class="mini-t" id="miniT"></div><div class="mini-a" id="miniA"></div></div>
      <button class="mini-btn" id="miniPlay" data-action="toggle-play" aria-label="Play"></button>
      <button class="mini-btn sk" id="miniNext" data-action="next" aria-label="Next"></button>
      <div class="mini-prog"><i id="miniFill"></i></div>
    </div>
    <nav class="tabbar glass" id="tabbar">
      <div class="tab-ind" id="tabInd"></div>
      <button class="tab" data-action="tab" data-t="home" id="tabHome"></button>
      <button class="tab" data-action="tab" data-t="library" id="tabLibrary"></button>
      <button class="tab" data-action="tab" data-t="studio" id="tabStudio"></button>
      <button class="tab" data-action="tab" data-t="search" id="tabSearch"></button>
    </nav>
  </div>
</div>

<div id="np" class="paused">
  <canvas id="npBg" width="40" height="80"></canvas>
  <div class="np-in">
    <button class="grab-hit" data-action="close-np" aria-label="Close"><span class="grab"></span></button>
    <div class="np-stage" id="npStage">
      <div class="np-artwrap"><img class="np-art" id="npArt" alt=""></div>
      <canvas id="score"></canvas>
      <div class="score-cap"><i></i><span id="scoreCap">Live Score</span></div>
      <div class="np-queue" id="npQueue"></div>
    </div>
    <div class="np-info">
      <div class="np-txt"><div class="np-t" id="npT"></div><div class="np-a" id="npA"></div></div>
      <button class="np-circ" id="npLove" data-action="love-current" aria-label="Love"></button>
      <button class="np-circ" id="npMore" data-action="np-menu" aria-label="More"></button>
    </div>
    <div class="np-scrub">
      <div class="slider" id="npScrub"><div class="track"><div class="fill" id="npFill"></div></div></div>
      <div class="times"><span id="tNow">0:00</span><span id="tLeft">-0:00</span></div>
    </div>
    <div class="np-ctrl">
      <button class="sk" data-action="prev" id="npPrev" aria-label="Previous"></button>
      <button class="pp" data-action="toggle-play" id="npPlay" aria-label="Play"></button>
      <button class="sk" data-action="next" id="npNext" aria-label="Next"></button>
    </div>
    <div class="vol"><span id="spkLo"></span><div class="slider" id="npVol"><div class="track"><div class="fill" id="volFill"></div></div></div><span id="spkHi"></span></div>
    <div class="np-bottom">
      <button data-action="mode" data-m="score" id="modeScore" aria-label="Live Score"></button>
      <button data-action="mode" data-m="queue" id="modeQueue" aria-label="Playing Next"></button>
    </div>
  </div>
</div>

<div class="menu-wrap" id="menuWrap" data-action="close-menu"><div class="menu" id="menu"></div></div>
<div class="alert-wrap" id="alertWrap">
  <div class="alert">
    <div class="alert-text"><div class="alert-title" id="alertTitle"></div><div class="alert-msg" id="alertMsg"></div></div>
    <div class="alert-btns"><button class="cancel" data-alert="0">Cancel</button><button class="destructive" data-alert="1" id="alertOk">Delete</button></div>
  </div>
</div>
<div class="alert-wrap" id="renameWrap">
  <div class="alert">
    <div class="alert-text">
      <div class="alert-title">Rename Take</div>
      <div class="alert-msg">Give your song a title and artist of your own.</div>
      <input class="alert-field" id="renameTitle" maxlength="100" placeholder="Title" autocomplete="off" autocorrect="off" enterkeyhint="next" aria-label="Title">
      <input class="alert-field" id="renameArtist" maxlength="100" placeholder="Artist" autocomplete="off" autocorrect="off" enterkeyhint="done" aria-label="Artist">
    </div>
    <div class="alert-btns"><button data-rename="0">Cancel</button><button class="primary" data-rename="1" id="renameSave">Save</button></div>
  </div>
</div>
<div class="toast glass" id="toast"></div>

<script>
// the Synth Jukebox: a music library of albums composed live on this device from
// their seed (no audio files), beside the Studio's takes: songs Lyria 3 Pro writes
// from a description, each an audio file in the User's Drive. The library is the
// app-content (`library.json`); the player's place (tab, page, queue, position) is
// the app-state
// ********************************************************************************
(() => {
'use strict';

// == Util ========================================================================
const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String((value == null) ? ''/*nothing to show*/ : value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));
const randomId = () => Math.random().toString(36).slice(2, 10);
const messageOf = (error) => (error && error.message) || String(error);
// formats seconds as m:ss
const formatTime = (seconds) => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60), rest = whole % 60;
  return minutes + ':' + ((rest < 10) ? '0' : '') + rest;
};

// .. Seeded Randomness ...........................................................
// FNV-1a: a seed string's stable 32-bit hash
const hashString = (text) => {
  let hash = 2166136261 >>> 0;
  for(let i=0; i<text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
};
// mulberry32: a generator of [0, 1) values, the same sequence for the same seed
const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// a [0, 1) value for the pair (a, b): the same pair always gives the same value
const hash01 = (a, b) => {
  let x = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
const pick = (random, items) => items[Math.floor(random() * items.length)];

// .. Color .......................................................................
// an hsla() color from a [hue, saturation, lightness] triple, its lightness and alpha
// optionally replaced
const hslColor = (hsl, lightness, alpha) => {
  const hue = ((Math.round(hsl[0]) % 360) + 360) % 360;
  return `hsla(${hue},${hsl[1]}%,${(lightness == null) ? hsl[2] : lightness}%,${(alpha == null) ? 1 : alpha})`;
};

// == Icons =======================================================================
const HEART_PATH = 'M12 21s-7.6-4.7-9.7-9.4C.8 8.1 3 4 6.9 4c2.2 0 3.8 1.2 5.1 3 1.3-1.8 2.9-3 5.1-3 3.9 0 6.1 4.1 4.6 7.6C19.6 16.3 12 21 12 21z';
const NEXT_PATH = 'M3 5.3v13.4c0 .8.9 1.3 1.6.8L15 13v5.7c0 .8.9 1.3 1.6.8l10.9-6.7c.6-.4.6-1.3 0-1.7L16.6 4.4c-.7-.4-1.6 0-1.6.9V11L4.6 4.5C3.9 4 3 4.5 3 5.3z';
const ICON = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M7 4.6v14.8c0 .8.9 1.3 1.6.9l12-7.4c.6-.4.6-1.3 0-1.7l-12-7.4C7.9 3.3 7 3.8 7 4.6z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="5.5" y="4" width="4.6" height="16" rx="1.4" fill="currentColor"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.4" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 32 24" width="30" height="22"><path fill="currentColor" d="' + NEXT_PATH + '"/></svg>',
  prev: '<svg viewBox="0 0 32 24" width="30" height="22"><path fill="currentColor" transform="translate(32 0) scale(-1 1)" d="' + NEXT_PATH + '"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="' + HEART_PATH + '"/></svg>',
  heartO: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" stroke="currentColor" stroke-width="2" d="' + HEART_PATH + '"/></svg>',
  dots: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="19" cy="12" r="1.9" fill="currentColor"/></svg>',
  chev: '<svg class="chev" width="8" height="14" viewBox="0 0 8 14"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 28 28" width="26" height="26"><path fill="currentColor" d="M14 3.2c.4 0 .8.1 1.1.4l9.3 8.1c.6.5.2 1.5-.6 1.5H22v9.6c0 1-.8 1.8-1.8 1.8h-3.7v-6.3c0-.6-.5-1-1-1h-3c-.6 0-1 .4-1 1v6.3H7.8c-1 0-1.8-.8-1.8-1.8v-9.6H4.2c-.8 0-1.2-1-.6-1.5l9.3-8.1c.3-.3.7-.4 1.1-.4z"/></svg>',
  library: '<svg viewBox="0 0 28 28" width="26" height="26"><rect x="5" y="9" width="18" height="15" rx="3.2" fill="currentColor"/><rect x="7" y="5.6" width="14" height="2" rx="1" fill="currentColor" opacity=".7"/><rect x="9.2" y="2.8" width="9.6" height="1.8" rx=".9" fill="currentColor" opacity=".45"/><path style="fill:var(--bg)" d="M17.6 12.4v6.8a2 2 0 1 1-1.4-1.9v-3.4l-4 1v4.6a2 2 0 1 1-1.4-1.9v-4.6c0-.4.3-.7.6-.8l5.4-1.4c.4-.1.8.2.8.6z"/></svg>',
  search: '<svg viewBox="0 0 28 28" width="26" height="26"><circle cx="12.3" cy="12.3" r="7.6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M18 18l6 6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
  studio: '<svg viewBox="0 0 28 28" width="26" height="26"><circle cx="14" cy="14" r="11.5" fill="currentColor"/><circle cx="14" cy="14" r="8" fill="none" style="stroke:var(--bg)" stroke-width=".9" opacity=".45"/><path d="M14 4.6a9.4 9.4 0 0 1 8.2 4.8" fill="none" style="stroke:var(--bg)" stroke-width="1.1" stroke-linecap="round" opacity=".6"/><circle cx="14" cy="14" r="3.6" style="fill:var(--bg)"/><circle cx="14" cy="14" r="1.2" fill="currentColor"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M18 3.2v11.6a3 3 0 1 1-2-2.8V7.4l-7 1.9v7.5a3 3 0 1 1-2-2.8V6.8c0-.5.3-.9.8-1l9-2.4c.6-.2 1.2.3 1.2.8z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2.5l2.1 6.2c.2.5.6.9 1.1 1.1l6.3 2.2-6.3 2.1c-.5.2-.9.6-1.1 1.1L12 21.5l-2.1-6.3c-.2-.5-.6-.9-1.1-1.1L2.5 12l6.3-2.2c.5-.2.9-.6 1.1-1.1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21M3 17h3.5c2 0 3.2-1 4.3-2.7M13.2 9.7C14.3 8 15.5 7 17.5 7H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H20M17 4l3 3-3 3M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H4M7 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repeat1: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H20M17 4l3 3-3 3M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H4M7 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 10.6l1.4-.9v5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  score: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="2.5" y="4.5" width="7.5" height="3" rx="1.5" fill="currentColor"/><rect x="12" y="4.5" width="5" height="3" rx="1.5" fill="currentColor"/><rect x="6.5" y="10.5" width="11" height="3" rx="1.5" fill="currentColor"/><rect x="2.5" y="16.5" width="5" height="3" rx="1.5" fill="currentColor"/><rect x="10.5" y="16.5" width="11" height="3" rx="1.5" fill="currentColor"/></svg>',
  queue: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="4.5" cy="6" r="1.6" fill="currentColor"/><circle cx="4.5" cy="12" r="1.6" fill="currentColor"/><circle cx="4.5" cy="18" r="1.6" fill="currentColor"/><rect x="8.5" y="5" width="13" height="2" rx="1" fill="currentColor"/><rect x="8.5" y="11" width="13" height="2" rx="1" fill="currentColor"/><rect x="8.5" y="17" width="13" height="2" rx="1" fill="currentColor"/></svg>',
  spkLo: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M4 9h3l4.3-3.6c.6-.5 1.7-.1 1.7.8v11.6c0 .9-1.1 1.3-1.7.8L7 15H4c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1z"/></svg>',
  spkHi: '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 9h3l4.3-3.6c.6-.5 1.7-.1 1.7.8v11.6c0 .9-1.1 1.3-1.7.8L6 15H3c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.3 5.8a9 9 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 6.5h16M9.5 6.5V4.8c0-.5.4-.8.8-.8h3.4c.5 0 .8.4.8.8v1.7M6.2 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.8c1 0 1.9-.8 2-1.9l.9-12.6M10 10.5v6.5M14 10.5v6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  remix: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3.5v3.8h-3.8M5.5 20.5v-3.8h3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  playNext: '<svg viewBox="0 0 24 24"><path d="M4 6h12M4 11h12M4 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 14v7l6-3.5z" fill="currentColor"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20zM13.5 7.3l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="#fff"/></svg>',
  album: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
};
// the animated equalizer marking the current track
const EQUALIZER = '<span class="eq"><i></i><i></i><i></i><i></i></span>';
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// == Music =======================================================================
// -- Theory ----------------------------------------------------------------------
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
// the MIDI note of scale degree `degree` (any octave) above `base`
const degreeToMidi = (base, scale, degree) => {
  const octave = Math.floor(degree / 7), index = degree - octave * 7;
  return base + octave * 12 + scale[index];
};
// a 16-step pattern as velocities: `.` a rest, `x` full, `o` half, a digit n ninths
const pattern = (text) => text.split('').map((c) => (c === '.') ? 0 : (c === 'x') ? 1 : (c === 'o') ? .5 : (+c) / 9);
const midiToFrequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// -- Genres ----------------------------------------------------------------------
// each genre's arrangement: `bpm` and `dur` (seconds) are [min, max] ranges a track
// picks from; `bpc` bars per chord; `sev` sevenths in the chords; the drum parts are
// patterns (null: none); `bass` and `keys` are per-step strings (`r` root, `f` third,
// `o` fifth, `x` a chord hit); `arp` the chord tones an arpeggio walks; `voices` the
// synth voice of each part; `density` how busy the lead motif is; `tone` the lowpass
// ceiling; `wet` the reverb level; `progs` the chord progressions (scale degrees)
const GENRES = {
  lofi: {
    label: 'Lo-Fi', grad: ['#9D5C7E', '#E3A27C'], bpm: [70, 84], swing: .3, mode: 'major', bpc: 1, sev: true, drums: true, clap: false, crackle: true,
    kick: pattern('x......x..x.....'), snare: pattern('....x.......x...'), hat: pattern('7.4.7.4.7.4.7.45'), ohat: null,
    bass: 'r......r..f.....', bassLen: 5, keys: 'x.........x.....', arp: null, arpEvery: 1, arpOct: 0,
    voices: { keys: 'ep', lead: 'ep', bass: 'bass-sine' }, leadOct: 12, density: .3, leadLen: 3, tone: 4200, wet: .3, dur: [130, 170],
    progs: [[1, 4, 0, 0], [3, 2, 5, 5], [0, 5, 1, 4], [3, 4, 2, 5]],
  },
  synthwave: {
    label: 'Synthwave', grad: ['#5B1F8F', '#FF2E88'], bpm: [94, 108], swing: 0, mode: 'minor', bpc: 1, sev: false, drums: true, clap: false, crackle: false,
    kick: pattern('x.......x.......'), snare: pattern('....x.......x...'), hat: pattern('o.x.o.x.o.x.o.x.'), ohat: null,
    bass: 'r.r.r.r.r.r.r.o.', bassLen: 2, keys: null, arp: [0, 1, 2, 3, 2, 1, 2, 1], arpEvery: 1, arpOct: 0,
    voices: { pad: 'pad-saw', lead: 'saw', arp: 'pluck', bass: 'bass-saw' }, leadOct: 12, density: .2, leadLen: 4, tone: 11000, wet: .38, dur: [150, 195],
    progs: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 6, 0, 0], [0, 3, 5, 6]],
  },
  house: {
    label: 'House', grad: ['#0A3D91', '#00B4D8'], bpm: [120, 124], swing: .1, mode: 'minor', bpc: 2, sev: true, drums: true, clap: true, crackle: false,
    kick: pattern('x...x...x...x...'), snare: pattern('....x.......x...'), hat: pattern('.3.3.3.3.3.3.3.3'), ohat: pattern('..x...x...x...x.'),
    bass: '..r...r...r..fr.', bassLen: 2, keys: '..x..x....x.....', arp: null, arpEvery: 1, arpOct: 0,
    voices: { keys: 'stab', lead: 'bell', bass: 'bass-saw' }, leadOct: 12, density: .1, leadLen: 6, tone: 15000, wet: .22, dur: [165, 205],
    progs: [[0, 3], [0, 5], [5, 6], [0, 6]],
  },
  chiptune: {
    label: 'Chiptune', grad: ['#0E8A5F', '#4CC26B'], bpm: [136, 152], swing: 0, mode: 'major', bpc: 1, sev: false, drums: true, clap: false, crackle: false,
    kick: pattern('x.....x.x.......'), snare: pattern('....x.......x...'), hat: pattern('5.5.5.5.5.5.5.5.'), ohat: null,
    bass: 'r.o.r.o.r.o.r.o.', bassLen: 2, keys: null, arp: [0, 1, 2, 1], arpEvery: 1, arpOct: 12,
    voices: { lead: 'square', arp: 'sqarp', bass: 'bass-tri' }, leadOct: 24, density: .45, leadLen: 2, tone: 18000, wet: .12, dur: [110, 150],
    progs: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 0], [5, 3, 0, 4]],
  },
  ambient: {
    label: 'Ambient', grad: ['#3A6FB0', '#7FB8C9'], bpm: [54, 64], swing: 0, mode: 'lydian', bpc: 2, sev: true, drums: false, clap: false, crackle: false,
    kick: null, snare: null, hat: null, ohat: null,
    bass: 'r...............', bassLen: 30, keys: null, arp: null, arpEvery: 1, arpOct: 0,
    voices: { pad: 'pad-tri', lead: 'bell', bass: 'bass-sine' }, leadOct: 12, density: .12, leadLen: 10, tone: 9000, wet: .6, dur: [150, 195],
    progs: [[0, 1], [0, 5, 3, 1], [3, 0], [0, 3, 1, 5]],
  },
};

// -- Composition -----------------------------------------------------------------
// a track's composition, derived from its album's seed and genre and the track's
// index alone: what the scheduler and the Live Score read
const makeSpec = (album, index) => {
  const genre = GENRES[album.genre] || GENRES.lofi;
  const seedN = hashString(String(album.seed) + '#' + index);
  const random = seededRandom(seedN);
  const bpm = Math.round(genre.bpm[0] + random() * (genre.bpm[1] - genre.bpm[0]));
  const root = 45 + Math.floor(random() * 12);
  const stepDur = 60 / bpm / 4;
  const seconds = genre.dur[0] + random() * (genre.dur[1] - genre.dur[0]);
  const bars = Math.max(16, Math.round(seconds * bpm / 240 / 8) * 8);
  const pool = [0, 2, 4, 7, 0, 2, 4, 1, 3, 5, 6, 4];
  // two bars of lead notes (scale degrees, null a rest), busiest on the beat
  const motif = () => {
    const notes = [];
    for(let i=0; i<32; i++) {
      const weight = ((i % 4) === 0) ? 1.6 : ((i % 2) === 0) ? 1 : .45;
      notes.push((random() < (genre.density * weight)) ? pick(random, pool) : null/*a rest*/);
    }
    return notes;
  };
  const motifA = motif(); if(motifA[0] == null) motifA[0] = 0;
  const motifB = motifA.slice(0, 16).concat(motif().slice(16));
  // NOTE: the draws above and this one run in a fixed order: the same seed always
  //       composes the same track
  const prog = pick(random, genre.progs);
  return {
    genre, seedN, bpm, root, stepDur, bars,
    totalSteps: bars * 16, duration: bars * 16 * stepDur,
    prog, scale: SCALES[genre.mode], motifA, motifB, bpc: genre.bpc, swing: genre.swing,
  };
};
// a take's spec ({ kind: 'take', assetId, duration }) where a composition's would
// stand: its file plays whole, its `duration` (seconds) 0 until measured
const TAKE_SPEC = 'take';
const isTakeSpec = (spec) => !!spec && (spec.kind === TAKE_SPEC);
// which parts play in bar `bar`: an intro, a breakdown at the middle and an outro
// thin the arrangement
const layers = (spec, bar) => {
  const bars = spec.bars, breakdown = Math.floor(bars / 8) * 4, hasDrums = (spec.genre.drums !== false);
  const inBreakdown = (bar >= breakdown) && (bar < (breakdown + 4)), outro = (bar >= (bars - 4)), intro = (bar < 4);
  return {
    drums: hasDrums && !intro && !inBreakdown && !outro,
    hats: hasDrums && !outro && !(inBreakdown && (bar < (breakdown + 2))),
    bass: !intro && !inBreakdown && (bar < (bars - 2)),
    pad: true,
    keys: (bar < (bars - 2)),
    lead: (bar >= 8) && (bar < (bars - 4)),
    arp: (bar >= 4) && !outro,
  };
};
// the events of step `step`, each { i: instrument, v: velocity, m: MIDI note
// (pitched only), d: length in steps, o: swing offset in seconds }. Pure: the same
// step always gives the same events, which both the audio and the Live Score read
const stepEvents = (spec, step) => {
  const genre = spec.genre, scale = spec.scale, bar = Math.floor(step / 16), stepInBar = step % 16, layer = layers(spec, bar), events = [];
  const fade = (bar >= (spec.bars - 4)) ? Math.max(0, (spec.totalSteps - step) / 64) : 1;
  const offset = ((stepInBar % 2) === 1) ? spec.swing * spec.stepDur : 0;
  const degree = spec.prog[Math.floor(bar / spec.bpc) % spec.prog.length];
  const variation = (k) => hash01(spec.seedN, step * 13 + k);
  const snare = genre.clap ? 'clap' : 'snare';

  if(layer.drums) {
    if(genre.kick[stepInBar]) events.push({ i: 'kick', v: genre.kick[stepInBar] });
    if(genre.snare[stepInBar]) events.push({ i: snare, v: genre.snare[stepInBar] * .9 });
    if(genre.ohat && genre.ohat[stepInBar]) events.push({ i: 'ohat', v: genre.ohat[stepInBar] * .8 });
    if(((bar % 8) === 7) && (stepInBar >= 12) && !genre.snare[stepInBar] && (variation(1) < .55)) events.push({ i: snare, v: .35 + .3 * variation(2) });
  } /* else -- the drums rest in the intro, the breakdown and the outro */
  if(layer.hats && genre.hat && genre.hat[stepInBar]) events.push({ i: 'hat', v: genre.hat[stepInBar] * (.75 + .25 * variation(3)) * (layer.drums ? 1 : .6) });
  if(genre.crackle && (variation(4) < .35)) events.push({ i: 'crackle', v: .3 + .7 * variation(5) });

  const bassHit = (layer.bass && genre.bass) ? genre.bass.charAt(stepInBar) : ''/*no bass in this bar*/;
  if(bassHit && (bassHit !== '.')) {
    const interval = (bassHit === 'f') ? 4 : (bassHit === 'o') ? 7 : 0;
    events.push({ i: 'bass', m: degreeToMidi(spec.root - 12, scale, degree + interval), v: .9, d: genre.bassLen });
  } /* else -- a rest */

  const tones = genre.sev ? [0, 2, 4, 6] : [0, 2, 4];
  if(layer.pad && genre.voices.pad && (stepInBar === 0) && ((bar % spec.bpc) === 0)) tones.forEach((k) => events.push({ i: 'pad', m: degreeToMidi(spec.root, scale, degree + k), v: .8, d: spec.bpc * 16 }));
  if(layer.keys && genre.keys && (genre.keys.charAt(stepInBar) === 'x')) {
    let length = 1; while(((stepInBar + length) < 16) && (genre.keys.charAt(stepInBar + length) !== 'x')) length++;
    const velocity = (stepInBar === 0) ? .85 : .6;
    tones.forEach((k) => events.push({ i: 'keys', m: degreeToMidi(spec.root, scale, degree + k), v: velocity, d: length }));
  } /* else -- the keys hold their last chord */
  if(layer.lead && genre.voices.lead) {
    const motif = ((bar % 4) >= 2) ? spec.motifB : spec.motifA, note = motif[(bar % 2) * 16 + stepInBar];
    if(note != null) events.push({ i: 'lead', m: degreeToMidi(spec.root + genre.leadOct, scale, degree + note), v: .75 + .25 * variation(6), d: genre.leadLen });
  } /* else -- the lead sits out the opening bars and the outro */
  if(layer.arp && genre.arp && ((stepInBar % genre.arpEvery) === 0)) {
    const chordTones = [0, 2, 4, 7], index = genre.arp[(stepInBar / genre.arpEvery) % genre.arp.length];
    events.push({ i: 'arp', m: degreeToMidi(spec.root + (genre.arpOct || 0), scale, degree + chordTones[index]), v: .55 + (((stepInBar % 4) === 0) ? .25 : 0), d: 1 });
  } /* else -- no arpeggio in this genre or bar */

  for(const event of events) { event.v *= fade; event.o = offset; }
  return events;
};

// == Audio Engine ================================================================
// the synthesizer: schedules a track's step events slightly ahead of the audio clock
// into a Web Audio graph (session gain, tone filter, compressor, analyser, master
// volume, with a shared reverb send). Stopping a session fades out every voice it
// scheduled
const Engine = (() => {
  let ctx = null/*created on the first play, inside a tap*/, compressor, master, analyser, tone, convolver, wet, noiseBuffer, frequencies, samples;
  let spec = null/*no track loaded*/, playing = false, t0 = 0, step = 0, timer = null/*not scheduling*/, first = true, pausedPosition = 0, volume = .8;
  let session = null/*no session playing*/, sessionReverb = null;
  const api = {
    onended: null/*nothing follows the end*/,
    // (spec) => Promise of an object URL holding a take's audio
    source: null/*no takes to play*/,
    // (spec) once a take's element measures its length
    onduration: null,
    // (error) when a take cannot be read or played
    onerror: null,
    // () when playback stopped without being asked to (SEE: stopExternally)
    onstopped: null,
  };

  // -- iOS Audio Session ---------------------------------------------------------
  // iOS mutes Web Audio with the ring/silent switch unless the audio session is
  // `playback`: Safari 16.4+ exposes navigator.audioSession; older iOS takes the same
  // category while an <audio> element plays, so a silent one loops beside the synth
  let keepAlive = null/*created on the first unlock*/;
  // a half-second silent 8-bit mono WAV as a data URL
  const silentWav = () => {
    const samples = 4000, rate = 8000, bytes = new Uint8Array(44 + samples), view = new DataView(bytes.buffer);
    const write = (offset, text) => { for(let i=0; i<text.length; i++) bytes[offset + i] = text.charCodeAt(i); };
    write(0, 'RIFF'); view.setUint32(4, 36 + samples, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true); write(36, 'data'); view.setUint32(40, samples, true);
    for(let i=44; i<bytes.length; i++) bytes[i] = 128/*the 8-bit midpoint: silence*/;
    let binary = ''; for(let i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(binary);
  };
  let silentUrl = null/*made on first use*/;
  const silence = () => silentUrl || (silentUrl = silentWav());
  const unlockSession = () => {
    try { if(navigator.audioSession && (navigator.audioSession.type !== 'playback')) navigator.audioSession.type = 'playback'; } catch(error) { /*no audio session API: the keep-alive covers older iOS*/ }
    try {
      if(!keepAlive) {
        keepAlive = document.createElement('audio');
        keepAlive.src = silence(); keepAlive.loop = true; keepAlive.preload = 'auto';
        keepAlive.setAttribute('playsinline', ''); keepAlive.setAttribute('x-webkit-airplay', 'deny');
      } /* else -- created by an earlier unlock */
      if(keepAlive.paused) { const started = keepAlive.play(); if(started && started.catch) started.catch(() => {/*refused outside a tap: the next tap retries*/}); }
    } catch(error) { /*no <audio> playback: Web Audio still plays where the switch allows*/ }
  };
  // resumes a suspended or interrupted context: iOS suspends it in the background
  const wake = () => {
    if(!ctx || (ctx.state === 'running') || (ctx.state === 'closed')) return;
    const resumed = ctx.resume(); if(resumed && resumed.catch) resumed.catch(() => {/*refused outside a tap: the next tap retries*/});
  };
  // NOTE: returning to the app never resumes playback by itself: iOS stopped it
  //       (SEE: stopExternally) and only a tap starts it again
  document.addEventListener('visibilitychange', () => { if(!document.hidden && playing && !isTakeSpec(spec) && ctx && (ctx.state !== 'running')) stopExternally(); });

  // -- Graph ---------------------------------------------------------------------
  // a decaying stereo noise burst: the reverb's impulse response
  const impulse = (seconds, decay) => {
    const length = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for(let channel=0; channel<2; channel++) {
      const data = buffer.getChannelData(channel);
      for(let i=0; i<length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buffer;
  };
  // builds the graph once, on the first play; false where the browser has no Web Audio
  const ensure = () => {
    unlockSession();
    if(ctx) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext; if(!AudioContextClass) return false;
    ctx = new AudioContextClass();
    // NOTE: a context leaving `running` stops a composition only while the page is
    //       hidden (the screen locked, the app left); one stopped while in front is
    //       caught when it is next shown. A take never plays through the context
    ctx.addEventListener('statechange', () => { if(document.hidden && !isTakeSpec(spec) && (ctx.state !== 'running')) stopExternally(); });
    compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -16; compressor.knee.value = 12; compressor.ratio.value = 4; compressor.attack.value = .004; compressor.release.value = .2;
    tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 18000; tone.Q.value = .4;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .75;
    frequencies = new Uint8Array(analyser.frequencyBinCount); samples = new Uint8Array(analyser.fftSize);
    master = ctx.createGain(); master.gain.value = volume * volume;
    convolver = ctx.createConvolver(); convolver.buffer = impulse(3.2, 2.8);
    wet = ctx.createGain(); wet.gain.value = .3;
    convolver.connect(wet); wet.connect(tone);
    tone.connect(compressor); compressor.connect(analyser); analyser.connect(master); master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0); for(let i=0; i<noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
    return true;
  };
  // routes a voice into the current session, `reverb` of it sent to the reverb
  const out = (node, reverb) => {
    node.connect(session);
    if(reverb > 0) { const send = ctx.createGain(); send.gain.value = reverb; node.connect(send); send.connect(sessionReverb); }
  };
  const oscillator = (type, frequency, start, stop) => { const node = ctx.createOscillator(); node.type = type; node.frequency.setValueAtTime(frequency, start); node.start(start); node.stop(stop); return node; };
  const gain = () => ctx.createGain();
  const filter = (type, frequency, q) => { const node = ctx.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q || .7; return node; };
  // a filtered noise burst: the drums and the vinyl crackle
  const noise = (t, length, filterType, frequency, q, v, reverb) => {
    const source = ctx.createBufferSource(); source.buffer = noiseBuffer;
    const shaped = filter(filterType, frequency, q), envelope = gain();
    envelope.gain.setValueAtTime(v, t); envelope.gain.exponentialRampToValueAtTime(.0005, t + length);
    source.connect(shaped); shaped.connect(envelope); out(envelope, reverb);
    source.start(t, Math.random() * 1.5); source.stop(t + length + .02);
  };

  // -- Instruments ---------------------------------------------------------------
  const DRUM = {
    kick: (t, v) => {
      const body = oscillator('sine', 160, t, t + .5), envelope = gain();
      body.frequency.exponentialRampToValueAtTime(42, t + .11);
      envelope.gain.setValueAtTime(v * .75, t); envelope.gain.exponentialRampToValueAtTime(.001, t + .42);
      body.connect(envelope); out(envelope, 0);
    },
    snare: (t, v) => {
      noise(t, .18, 'bandpass', 1900, .9, v * .5, .15);
      const body = oscillator('triangle', 200, t, t + .14), envelope = gain();
      body.frequency.exponentialRampToValueAtTime(140, t + .1);
      envelope.gain.setValueAtTime(v * .3, t); envelope.gain.exponentialRampToValueAtTime(.001, t + .11);
      body.connect(envelope); out(envelope, .1);
    },
    clap: (t, v) => {
      for(let k=0; k<3; k++) noise(t + k * .011, .03, 'bandpass', 1300, 1.2, v * .45, .1);
      noise(t + .033, .2, 'bandpass', 1300, 1.2, v * .4, .3);
    },
    hat: (t, v) => noise(t, .045, 'highpass', 7500, .7, v * .22, 0),
    ohat: (t, v) => noise(t, .22, 'highpass', 7000, .7, v * .18, .1),
    crackle: (t, v) => noise(t, .004, 'highpass', 2500, .5, v * .16, 0),
  };
  // plays one note of synth voice `kind` at time `t` for `duration` seconds
  const voice = (kind, midi, t, duration, v) => {
    const f = midiToFrequency(midi), end = t + duration;
    switch(kind) {
      case 'pad-saw':
      case 'pad-tri': {
        const type = (kind === 'pad-saw') ? 'sawtooth' : 'triangle', release = 1.4, attack = Math.min(.9, duration * .4), hold = Math.max(t + attack, end);
        const lowpass = filter('lowpass', (type === 'sawtooth') ? 1100 : 2400, .4), envelope = gain();
        const level = v * ((type === 'sawtooth') ? .035 : .06);
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(level, t + attack); envelope.gain.setValueAtTime(level, hold); envelope.gain.linearRampToValueAtTime(0, hold + release);
        [-9, 9].forEach((detune) => { const osc = oscillator(type, f, t, hold + release + .05); osc.detune.value = detune; osc.connect(lowpass); });
        lowpass.connect(envelope); out(envelope, .6);
        return;
      }
      case 'ep': {
        const sustain = Math.max(t + .35, end), stop = sustain + .7;
        const carrier = oscillator('sine', f, t, stop), modulator = oscillator('sine', f, t, stop), depth = gain(), envelope = gain();
        depth.gain.setValueAtTime(f * 1.4, t); depth.gain.exponentialRampToValueAtTime(f * .06, t + .7); modulator.connect(depth); depth.connect(carrier.frequency);
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(v * .09, t + .005); envelope.gain.exponentialRampToValueAtTime(v * .035, t + .35); envelope.gain.setValueAtTime(v * .035, sustain); envelope.gain.exponentialRampToValueAtTime(.0004, stop);
        carrier.connect(envelope); out(envelope, .35);
        return;
      }
      case 'stab': {
        const stop = t + .45, lowpass = filter('lowpass', 3500, 3), envelope = gain();
        lowpass.frequency.setValueAtTime(3500, t); lowpass.frequency.exponentialRampToValueAtTime(380, t + .25);
        envelope.gain.setValueAtTime(v * .06, t); envelope.gain.exponentialRampToValueAtTime(.0005, t + .4);
        [0, 7].forEach((detune) => { const osc = oscillator('sawtooth', f, t, stop); osc.detune.value = detune; osc.connect(lowpass); });
        lowpass.connect(envelope); out(envelope, .3);
        return;
      }
      case 'pluck': {
        const length = Math.max(.22, duration), stop = t + length + .1;
        const osc = oscillator('sawtooth', f, t, stop), lowpass = filter('lowpass', 5000, 2), envelope = gain();
        lowpass.frequency.setValueAtTime(5000, t); lowpass.frequency.exponentialRampToValueAtTime(500, t + length);
        envelope.gain.setValueAtTime(v * .055, t); envelope.gain.exponentialRampToValueAtTime(.0005, t + length);
        osc.connect(lowpass); lowpass.connect(envelope); out(envelope, .45);
        return;
      }
      case 'square':
      case 'sqarp': {
        const arpeggio = (kind === 'sqarp'), noteEnd = t + Math.max(.03, duration * (arpeggio ? .7 : .92)), stop = noteEnd + .06;
        const osc = oscillator('square', f, t, stop), envelope = gain(), level = v * (arpeggio ? .022 : .038);
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(level, t + .004); envelope.gain.setValueAtTime(level, noteEnd); envelope.gain.linearRampToValueAtTime(0, noteEnd + .04);
        if(!arpeggio && (duration > .2)) {
          const lfo = oscillator('sine', 5.5, t, stop), depth = gain();
          depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * .012, t + Math.min(duration, .25));
          lfo.connect(depth); depth.connect(osc.frequency);
        } /* else -- an arpeggio or a short note takes no vibrato */
        osc.connect(envelope); out(envelope, arpeggio ? .15 : .2);
        return;
      }
      case 'saw': {
        const stop = end + .3, osc = oscillator('sawtooth', f, t, stop), detuned = oscillator('sawtooth', f, t, stop); detuned.detune.value = 12;
        const lowpass = filter('lowpass', 2400, .7), envelope = gain(), release = Math.max(t + .02, end);
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(v * .032, t + .02); envelope.gain.setValueAtTime(v * .032, release); envelope.gain.linearRampToValueAtTime(0, release + .25);
        const lfo = oscillator('sine', 5, t, stop), depth = gain();
        depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * .008, t + Math.min(duration, .3));
        lfo.connect(depth); depth.connect(osc.frequency); depth.connect(detuned.frequency);
        osc.connect(lowpass); detuned.connect(lowpass); lowpass.connect(envelope); out(envelope, .45);
        return;
      }
      case 'bell': {
        const stop = t + 3, fundamental = oscillator('sine', f, t, stop), partial = oscillator('sine', f * 2.76, t, stop), envelope = gain(), partialEnvelope = gain();
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(v * .07, t + .004); envelope.gain.exponentialRampToValueAtTime(.0003, t + 2.8);
        partialEnvelope.gain.setValueAtTime(v * .02, t); partialEnvelope.gain.exponentialRampToValueAtTime(.0003, t + .8);
        fundamental.connect(envelope); partial.connect(partialEnvelope); partialEnvelope.connect(envelope); out(envelope, .7);
        return;
      }
      case 'bass-sine':
      case 'bass-tri': {
        const sine = (kind === 'bass-sine'), stop = end + .12, osc = oscillator(sine ? 'sine' : 'triangle', f, t, stop), envelope = gain();
        const level = v * (sine ? .3 : .26), release = Math.max(t + .012, end);
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(level, t + .01); envelope.gain.setValueAtTime(level, release); envelope.gain.linearRampToValueAtTime(0, release + .08);
        if(sine) { const overtone = oscillator('triangle', f * 2, t, stop), overtoneLevel = gain(); overtoneLevel.gain.value = .12; overtone.connect(overtoneLevel); overtoneLevel.connect(envelope); }
        osc.connect(envelope); out(envelope, 0);
        return;
      }
      case 'bass-saw': {
        const stop = end + .1, osc = oscillator('sawtooth', f, t, stop), lowpass = filter('lowpass', 1000, 5), envelope = gain();
        lowpass.frequency.setValueAtTime(1000, t); lowpass.frequency.exponentialRampToValueAtTime(240, t + .18);
        const release = Math.max(t + .006, end);
        envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(v * .14, t + .005); envelope.gain.setValueAtTime(v * .14, release); envelope.gain.linearRampToValueAtTime(0, release + .05);
        osc.connect(lowpass); lowpass.connect(envelope); out(envelope, 0);
        return;
      }
    }
  };

  // -- Scheduler -----------------------------------------------------------------
  // plays `event` at audio time `t`, skipping one already past or inaudible
  const fire = (event, t) => {
    if((t < (ctx.currentTime - .01)) || (event.v < .01)) return;
    if(DRUM[event.i]) { DRUM[event.i](t, event.v); return; }
    const kind = spec.genre.voices[event.i]; if(!kind) return;
    voice(kind, event.m, t, (event.d || 1) * spec.stepDur, event.v);
  };
  const newSession = () => { session = gain(); session.connect(tone); sessionReverb = gain(); sessionReverb.connect(convolver); };
  const killSession = () => {
    if(!session) return;
    const dry = session, reverb = sessionReverb, now = ctx.currentTime;
    [dry, reverb].forEach((node) => { node.gain.cancelScheduledValues(now); node.gain.setValueAtTime(node.gain.value, now); node.gain.linearRampToValueAtTime(0, now + .04); });
    setTimeout(() => { try { dry.disconnect(); reverb.disconnect(); } catch(error) { /*already disconnected*/ } }, 250);
    session = null/*no session playing*/; sessionReverb = null;
  };
  // starts the pad chord that a start partway through it would otherwise skip
  const catchUp = (fromStep) => {
    const span = spec.bpc * 16, chordStep = fromStep - (fromStep % span); if(chordStep === fromStep) return;
    stepEvents(spec, chordStep).forEach((event) => {
      if(event.i !== 'pad') return;
      const remaining = event.d - (fromStep - chordStep);
      if(remaining > 2) fire({ i: 'pad', m: event.m, v: event.v, d: remaining }, t0 + fromStep * spec.stepDur);
    });
  };
  const finish = () => { playing = false; clearInterval(timer); pausedPosition = spec.duration; if(api.onended) api.onended(); };
  // schedules every step inside the look-ahead horizon, a longer one while hidden
  // (when timers are throttled)
  const tick = () => {
    if(!playing) return;
    const horizon = ctx.currentTime + (document.hidden ? 1.2 : .15);
    while(true) {
      if(step >= spec.totalSteps) { if(ctx.currentTime >= (t0 + spec.duration)) finish(); return; }
      const stepTime = t0 + step * spec.stepDur;
      if(stepTime > horizon) break;
      if(first) { first = false; catchUp(step); }
      for(const event of stepEvents(spec, step)) fire(event, stepTime + (event.o || 0));
      step++;
    }
  };

  // -- Takes ---------------------------------------------------------------------
  // a take plays from one <audio> element straight to the speaker, never through the
  // graph: iOS keeps an element playing with the screen locked and the app left, and
  // silences one routed into Web Audio when it suspends the context. `mediaSpec` is
  // the take the element holds; `mediaToken` retires a play its pause or another
  // load overtook
  let media = null/*created on the first take*/, mediaSpec = null/*holds none*/, mediaToken = 0, mediaAnalysis = null/*not yet measured*/;
  // whether a page sets an element's volume: iOS leaves it to the device's buttons
  const mediaVolumeWorks = (() => { try { const probe = document.createElement('audio'); probe.volume = .5; return Math.abs(probe.volume - .5) < .01; } catch(error) { return false; } })();
  const mediaElement = () => {
    if(!media) {
      media = document.createElement('audio');
      media.preload = 'auto'; media.setAttribute('playsinline', ''); media.setAttribute('x-webkit-airplay', 'deny');
      media.addEventListener('ended', () => { if(playing && (spec === mediaSpec)) finish(); });
      // a pause the app did not make (a call, another app's audio, headphones pulled)
      // is a stop. The app's own pauses clear `playing` first; a source switch plays
      // again before this runs, and the song's end is `ended`
      media.addEventListener('pause', () => { if(playing && (spec === mediaSpec) && media.paused && !media.ended) stopExternally(); });
      media.addEventListener('loadedmetadata', () => {
        if(!mediaSpec || !isFinite(media.duration) || (media.duration <= 0)) return;
        mediaSpec.duration = media.duration;
        if(api.onduration) api.onduration(mediaSpec);
      });
    } /* else -- created by an earlier take */
    if(mediaVolumeWorks) media.volume = volume * volume;
    return media;
  };

  // -- Take Analysis -------------------------------------------------------------
  // what the visuals read for a take, measured from its audio once when it is read:
  // for every frame, the spectrum and the waveform an analyser would report there
  const ANALYSIS_RATE = 22050/*Hz: the audio is measured at this rate, in mono*/;
  const ANALYSIS_FPS = 24;
  const ANALYSIS_SIZE = 512/*samples per spectrum: 43 Hz per band*/;
  const ANALYSIS_WAVE = 128/*waveform samples kept per frame*/;
  const ANALYSES_KEPT = 2/*the takes whose analyses stay in memory*/;
  const analyses = new Map()/*url → Promise of the analysis, or of null*/;
  // a Blackman window and the transform's tables, as the analyser uses
  const fftTables = (() => {
    const n = ANALYSIS_SIZE, bits = Math.log2(n), reverse = new Uint16Array(n), taper = new Float32Array(n), cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for(let i=0; i<n; i++) {
      let reversed = 0; for(let b=0; b<bits; b++) reversed |= ((i >> b) & 1) << (bits - 1 - b);
      reverse[i] = reversed; taper[i] = .42 - .5 * Math.cos(2 * Math.PI * i / n) + .08 * Math.cos(4 * Math.PI * i / n);
    }
    for(let i=0; i<(n / 2); i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
    return { reverse, taper, cos, sin };
  })();
  // an in-place radix-2 transform of bit-reversed input
  const fft = (re, im) => {
    const n = re.length, { cos, sin } = fftTables;
    for(let size=2; size<=n; size<<=1) {
      const half = size >> 1, stride = n / size;
      for(let i=0; i<n; i+=size) for(let j=0; j<half; j++) {
        const a = i + j, b = a + half, k = j * stride, tr = re[b] * cos[k] - im[b] * sin[k], ti = re[b] * sin[k] + im[b] * cos[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  };
  const analyse = (url) => {
    if(analyses.has(url)) return analyses.get(url);
    const measured = (async () => {
      const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext; if(!OfflineContext) return null/*no decoder*/;
      const audio = await (await fetch(url)).arrayBuffer();
      const buffer = await new OfflineContext(1, 1, ANALYSIS_RATE).decodeAudioData(audio);
      const length = buffer.length, mono = new Float32Array(length);
      for(let c=0; c<buffer.numberOfChannels; c++) { const data = buffer.getChannelData(c); for(let i=0; i<length; i++) mono[i] += data[i] / buffer.numberOfChannels; }
      const n = ANALYSIS_SIZE, bins = n / 2, hop = buffer.sampleRate / ANALYSIS_FPS, frames = Math.max(1, Math.floor(length / hop));
      const spectra = new Uint8Array(frames * bins), waves = new Uint8Array(frames * ANALYSIS_WAVE);
      const re = new Float32Array(n), im = new Float32Array(n), smoothed = new Float32Array(bins), { reverse, taper } = fftTables;
      for(let f=0; f<frames; f++) {
        if((f % 240) === 239) await new Promise((resolve) => setTimeout(resolve, 0))/*the page stays answering*/;
        const start = Math.floor(f * hop + hop / 2 - n / 2);
        for(let i=0; i<n; i++) { re[reverse[i]] = (mono[start + i] || 0) * taper[i]; im[i] = 0; }
        fft(re, im);
        // the analyser's reading: magnitude smoothed over time, in decibels from -100 to -30
        for(let k=0; k<bins; k++) {
          smoothed[k] = .5 * smoothed[k] + .5 * Math.hypot(re[k], im[k]) / n;
          spectra[f * bins + k] = clamp((20 * Math.log10(smoothed[k] || 1e-9) + 100) / 70 * 255, 0, 255);
        }
        for(let w=0; w<ANALYSIS_WAVE; w++) waves[f * ANALYSIS_WAVE + w] = clamp(128 + (mono[start + Math.floor(w * n / ANALYSIS_WAVE)] || 0) * 128, 0, 255);
      }
      return { frames, bins, spectra, waves };
    })().catch((error) => { console.warn('take not measured', messageOf(error)); return null/*no visuals for this take: it still plays*/; });
    analyses.set(url, measured);
    while(analyses.size > ANALYSES_KEPT) analyses.delete(analyses.keys().next().value);
    return measured;
  };
  // the playing take's spectrum or waveform at its position (the spectrum eased
  // between frames), or null before it is measured
  const takeSpectrum = new Uint8Array(ANALYSIS_SIZE / 2), takeWave = new Uint8Array(ANALYSIS_WAVE);
  const takeFrame = (spectrum) => {
    const analysis = mediaAnalysis; if(!analysis || !media || (spec !== mediaSpec)) return null;
    const at = clamp(media.currentTime * ANALYSIS_FPS, 0, analysis.frames - 1), frame = Math.floor(at), next = Math.min(analysis.frames - 1, frame + 1), mix = at - frame;
    if(!spectrum) { takeWave.set(analysis.waves.subarray(frame * ANALYSIS_WAVE, (frame + 1) * ANALYSIS_WAVE)); return takeWave; }
    const bins = analysis.bins, from = frame * bins, to = next * bins;
    for(let k=0; k<bins; k++) takeSpectrum[k] = analysis.spectra[from + k] + (analysis.spectra[to + k] - analysis.spectra[from + k]) * mix;
    return takeSpectrum;
  };

  const stopMedia = () => { mediaToken++; if(media && !media.paused) media.pause(); };
  // plays the loaded take from `from` once its audio is at hand
  const playMedia = (from) => {
    const element = mediaElement(), token = ++mediaToken, take = spec;
    pausedPosition = from; playing = true;
    const begin = () => {
      if((token !== mediaToken) || !playing) return;
      const seek = () => { try { element.currentTime = from; } catch(error) { /*not seekable yet: it starts at 0*/ } };
      if(element.readyState >= 1) seek(); else element.addEventListener('loadedmetadata', seek, { once: true });
      const started = element.play();
      if(started && started.catch) started.catch((error) => { if(token !== mediaToken) return; playing = false; if(api.onerror) api.onerror(error); });
    };
    if(mediaSpec === take) { begin(); return; }
    // NOTE: iOS lets an element play outside a tap only once it has played inside
    //       one: silence plays now, inside the tap, and the take once it is read
    mediaSpec = null/*the silence*/; element.src = silence();
    const unlocked = element.play(); if(unlocked && unlocked.catch) unlocked.catch(() => {/*the take's own play reports*/});
    api.source(take).then(
      (url) => {
        if((token !== mediaToken) || (spec !== take)) return;
        mediaSpec = take; mediaAnalysis = null; element.src = url; begin();
        analyse(url).then((analysis) => { if(mediaSpec === take) mediaAnalysis = analysis; });
      },
      (error) => { if(token !== mediaToken) return; playing = false; if(api.onerror) api.onerror(error); });
  };

  // -- API -----------------------------------------------------------------------
  api.load = (nextSpec, position) => { if(playing) { playing = false; clearInterval(timer); killSession(); } stopMedia(); spec = nextSpec; pausedPosition = position || 0; };
  // the composition loaded, or null when none is
  api.spec = () => spec;
  // plays from `position` (absent: where it paused); false where Web Audio is unavailable
  api.play = (position) => {
    if(!spec || !ensure()) return false;
    wake();
    if(isTakeSpec(spec)) {
      killSession(); clearInterval(timer);
      try { if(keepAlive) keepAlive.pause(); } catch(error) { /*the keep-alive is already stopped*/ }
      const end = (spec.duration > 0) ? Math.max(0, spec.duration - .05) : Infinity/*not yet measured*/;
      playMedia(clamp((position == null) ? pausedPosition : position, 0, end));
      return true;
    } /* else -- a composition */
    stopMedia();
    killSession(); newSession();
    const now = ctx.currentTime;
    tone.frequency.setTargetAtTime(spec.genre.tone, now, .05); wet.gain.setTargetAtTime(spec.genre.wet, now, .05);
    const from = clamp((position == null) ? pausedPosition : position, 0, Math.max(0, spec.duration - .05));
    const start = now + .06; t0 = start - from;
    step = Math.ceil(from / spec.stepDur - 1e-6); first = true; playing = true;
    clearInterval(timer); timer = setInterval(tick, 25); tick();
    return true;
  };
  api.pause = () => {
    if(!playing) return;
    pausedPosition = api.position(); playing = false; clearInterval(timer); killSession(); stopMedia();
    try { if(keepAlive) keepAlive.pause(); } catch(error) { /*the keep-alive is already stopped*/ }
  };
  // a stop the app did not ask for: iOS suspends or interrupts the context when the
  // screen locks, the app leaves or a call arrives. Playback stops where it was,
  // as a pause does, so what the app shows is what is heard
  const stopExternally = () => {
    if(!playing) return;
    pausedPosition = api.position(); playing = false; clearInterval(timer); killSession(); stopMedia();
    try { if(keepAlive) keepAlive.pause(); } catch(error) { /*the keep-alive is already stopped*/ }
    if(api.onstopped) api.onstopped();
  };
  api.position = () => {
    if(!spec) return 0;
    if(!playing) return pausedPosition;
    if(isTakeSpec(spec)) return (mediaSpec === spec) ? media.currentTime : pausedPosition/*still being read*/;
    return clamp(ctx.currentTime - t0, 0, spec.duration);
  };
  api.seek = (position) => { if(playing) api.play(position); else pausedPosition = position; };
  api.isPlaying = () => playing;
  api.setVolume = (level) => { volume = level; if(master) master.gain.setTargetAtTime(level * level, ctx.currentTime, .03); if(media && mediaVolumeWorks) media.volume = level * level; };
  // whether the volume reaches a take (iOS leaves it to the device's buttons)
  api.takeVolume = () => mediaVolumeWorks;
  // the low-frequency energy now, 0 to 1: what the Now Playing background pulses with
  api.energy = () => {
    if(!playing) return 0;
    const bands = isTakeSpec(spec) ? takeFrame(true) : (ctx ? (analyser.getByteFrequencyData(frequencies), frequencies) : null); if(!bands) return 0;
    let sum = 0; for(let i=1; i<=5; i++) sum += bands[i];
    const energy = sum / 5 / 255;
    return Math.max(0, (energy - .35) / .65);
  };
  // the spectrum now (0-255 per band, lowest first), or null before the first play
  api.spectrum = () => {
    if(spec && isTakeSpec(spec)) return takeFrame(true);
    if(!ctx) return null/*no graph yet*/;
    analyser.getByteFrequencyData(frequencies);
    return frequencies;
  };
  // the waveform now (0-255 per sample, 128 the rest line), or null before the first play
  api.waveform = () => {
    if(spec && isTakeSpec(spec)) return takeFrame(false);
    if(!ctx) return null/*no graph yet*/;
    analyser.getByteTimeDomainData(samples);
    return samples;
  };
  return api;
})();

// == Artwork =====================================================================
// each album's cover, painted once from its seed and genre: a JPEG data URL and the
// palette the Now Playing background and the Top Picks captions take from it
const artCache = {};
// each take's generated cover, read once per launch and redrawn at the painted
// covers' size: by Asset id, { url, palette } once read, null while being read,
// false when it could not be
const coverArt = {};
const COVER_SIZE_PX = 480;
// an image's palette: the average color of its top, middle and bottom thirds
const paletteOf = (paint, size) => {
  const data = paint.getImageData(0, 0, size, size).data, bands = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for(let y=0; y<size; y+=8) for(let x=0; x<size; x+=8) { const i = (y * size + x) * 4, band = bands[Math.min(2, Math.floor(y * 3 / size))]; band[0] += data[i]; band[1] += data[i + 1]; band[2] += data[i + 2]; band[3]++; }
  return bands.map(([r, g, b, n]) => {
    r /= n * 255; g /= n * 255; b /= n * 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    const s = (d === 0) ? 0 : d / (1 - Math.abs(2 * l - 1));
    const h = (d === 0) ? 0 : (max === r) ? 60 * (((g - b) / d) % 6) : (max === g) ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return [h, Math.round(s * 100), Math.round(l * 100)];
  });
};
// reads a take's cover, then shows it wherever the take's art appears
const loadCover = async (assetId) => {
  coverArt[assetId] = null/*being read*/;
  try {
    const read = await callTool('vfs', 'read_file', { uri: fileUri(assetId) });
    const binary = atob(read.content), bytes = new Uint8Array(binary.length);
    for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const source = URL.createObjectURL(new Blob([bytes], { type: read.contentType || 'image/png' }));
    const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('the cover did not decode')); element.src = source; });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = COVER_SIZE_PX;
    const paint = canvas.getContext('2d'); paint.drawImage(image, 0, 0, COVER_SIZE_PX, COVER_SIZE_PX);
    URL.revokeObjectURL(source);
    coverArt[assetId] = { url: canvas.toDataURL('image/jpeg', .88), palette: paletteOf(paint, COVER_SIZE_PX) };
  } catch(error) {
    coverArt[assetId] = false/*unreadable: the painted sleeve stays this launch*/;
    console.warn('cover not shown', error);
  }
  renderAll(); onTrackChange();
};
// a take's generated cover once it is read; undefined (its painted sleeve) until then
const generatedCover = (album) => {
  if(!isTake(album) || !album.cover || (album.cover.status !== TakeStatus.Ready) || !album.cover.assetId) return undefined/*none to show*/;
  const assetId = album.cover.assetId;
  if(!(assetId in coverArt)) loadCover(assetId);
  return coverArt[assetId] || undefined/*still being read*/;
};
const artFor = (album) => {
  const cover = generatedCover(album); if(cover) return cover;
  const key = isTake(album) ? 'take|' + album.prompt : album.seed + '|' + album.genre; if(artCache[key]) return artCache[key];
  const S = 480, canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const paint = canvas.getContext('2d');
  const random = seededRandom(hashString('art|' + key)), H = Math.floor(random() * 360);
  const color = (hue, saturation, lightness, alpha) => hslColor([hue, saturation, lightness], lightness, alpha);
  let palette, grain = 10;
  if(isTake(album)) {
    // a pressed record sliding out of its sleeve, colored by its description
    const sleeve = paint.createLinearGradient(0, 0, S, S); sleeve.addColorStop(0, color(H, 70, 46)); sleeve.addColorStop(1, color(H + 70, 75, 20));
    paint.fillStyle = sleeve; paint.fillRect(0, 0, S, S);
    for(let i=0; i<5; i++) { paint.fillStyle = color(H + 30 + i * 25, 80, 60, .12); paint.beginPath(); paint.arc(random() * S, random() * S, S * (.15 + random() * .3), 0, Math.PI * 2); paint.fill(); }
    const cx = S * (.56 + random() * .08), cy = S * .5, R = S * .4;
    paint.save(); paint.shadowColor = 'rgba(0,0,0,.55)'; paint.shadowBlur = 30; paint.fillStyle = '#111'; paint.beginPath(); paint.arc(cx, cy, R, 0, Math.PI * 2); paint.fill(); paint.restore();
    paint.lineWidth = 1;
    for(let r=R * .36; r<R; r+=3.2) { paint.strokeStyle = 'rgba(255,255,255,' + (.03 + random() * .05).toFixed(3) + ')'; paint.beginPath(); paint.arc(cx, cy, r, 0, Math.PI * 2); paint.stroke(); }
    paint.strokeStyle = 'rgba(255,255,255,.22)'; paint.lineWidth = R * .5;
    paint.beginPath(); paint.arc(cx, cy, R * .66, -1.15, -.75); paint.stroke(); paint.beginPath(); paint.arc(cx, cy, R * .66, 2, 2.3); paint.stroke();
    paint.fillStyle = color(H + 180, 85, 60); paint.beginPath(); paint.arc(cx, cy, R * .32, 0, Math.PI * 2); paint.fill();
    paint.fillStyle = color(H + 180, 85, 45); paint.beginPath(); paint.arc(cx, cy, R * .22, 0, Math.PI * 2); paint.fill();
    paint.fillStyle = '#0B0B0B'; paint.beginPath(); paint.arc(cx, cy, R * .035, 0, Math.PI * 2); paint.fill();
    paint.fillStyle = color(H, 60, 12, .9); paint.fillRect(0, 0, S * .14, S);
    palette = [[H, 70, 40], [H + 70, 75, 30], [H + 180, 85, 55]]; grain = 12;
  } else if(album.genre === 'synthwave') {
    // a striped sun over a neon grid
    const hue = 270 + Math.floor(random() * 70) - 20, horizon = S * .62;
    const sky = paint.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, color(hue, 70, 7)); sky.addColorStop(.7, color(hue + 20, 70, 22)); sky.addColorStop(1, color(hue + 50, 85, 45));
    paint.fillStyle = sky; paint.fillRect(0, 0, S, horizon);
    for(let i=0; i<70; i++) { paint.fillStyle = 'rgba(255,255,255,' + (random() * .8).toFixed(2) + ')'; const size = random() * 1.8 + .4; paint.fillRect(random() * S, random() * S * .45, size, size); }
    const sun = document.createElement('canvas'); sun.width = sun.height = S;
    const sunPaint = sun.getContext('2d');
    const cx = S / 2, cy = S * .47, R = S * (.2 + random() * .07);
    const sunGradient = sunPaint.createLinearGradient(0, cy - R, 0, cy + R);
    sunGradient.addColorStop(0, color(50, 100, 62)); sunGradient.addColorStop(.55, color(15 + random() * 10, 100, 58)); sunGradient.addColorStop(1, color(320, 100, 55));
    sunPaint.fillStyle = sunGradient; sunPaint.beginPath(); sunPaint.arc(cx, cy, R, 0, Math.PI * 2); sunPaint.fill();
    sunPaint.globalCompositeOperation = 'destination-out';
    for(let i=0; i<7; i++) sunPaint.fillRect(0, cy + R * (.05 + i * .14), S, 1.5 + i * 2.2);
    paint.save(); paint.shadowColor = color(330, 100, 60); paint.shadowBlur = 40; paint.drawImage(sun, 0, 0); paint.restore();
    paint.fillStyle = color(hue, 60, 10); paint.beginPath(); paint.moveTo(0, horizon);
    let x = 0; while(x < S) { x += 20 + random() * 40; paint.lineTo(x, horizon - random() * S * .09); }
    paint.lineTo(S, horizon); paint.closePath(); paint.fill();
    paint.fillStyle = color(hue, 70, 5); paint.fillRect(0, horizon, S, S - horizon);
    paint.strokeStyle = color(315, 100, 62); paint.lineWidth = 2; paint.shadowColor = color(315, 100, 60); paint.shadowBlur = 8;
    for(let i=1; i<=10; i++) { const y = horizon + (S - horizon) * Math.pow(i / 10, 2.2); paint.globalAlpha = .35 + .65 * i / 10; paint.beginPath(); paint.moveTo(0, y); paint.lineTo(S, y); paint.stroke(); }
    paint.globalAlpha = 1;
    for(let i=-10; i<=10; i++) { paint.beginPath(); paint.moveTo(S / 2 + i * S * .02, horizon); paint.lineTo(S / 2 + i * S * .16, S); paint.stroke(); }
    paint.shadowBlur = 0;
    palette = [[hue, 70, 30], [325, 90, 52], [40, 95, 55]]; grain = 8;
  } else if(album.genre === 'lofi') {
    // a lit city skyline under a moon
    const sky = paint.createLinearGradient(0, 0, 0, S); sky.addColorStop(0, color(H, 55, 78)); sky.addColorStop(1, color(H + 35, 45, 50));
    paint.fillStyle = sky; paint.fillRect(0, 0, S, S);
    const moonX = S * (.2 + random() * .6), moonY = S * (.14 + random() * .14), moonR = S * (.07 + random() * .05);
    paint.save(); paint.fillStyle = color(45, 90, 94, .96); paint.shadowColor = color(45, 100, 90); paint.shadowBlur = 36; paint.beginPath(); paint.arc(moonX, moonY, moonR, 0, Math.PI * 2); paint.fill(); paint.restore();
    for(let i=0; i<4; i++) { paint.fillStyle = 'rgba(255,255,255,.16)'; paint.beginPath(); paint.ellipse(random() * S, S * (.2 + random() * .3), S * (.12 + random() * .14), S * (.025 + random() * .02), 0, 0, Math.PI * 2); paint.fill(); }
    let x = -10;
    while(x < S) {
      const width = 28 + random() * 60, height = S * (.18 + random() * .38);
      paint.fillStyle = color(H + 200, 25, 14 + random() * 8); paint.fillRect(x, S - height, width, height);
      for(let wy = S - height + 10; wy < S - 12; wy += 14) for(let wx = x + 6; wx < x + width - 8; wx += 11) if(random() < .28) { paint.fillStyle = color(40, 95, 70, .9); paint.fillRect(wx, wy, 5, 7); }
      x += width + 2;
    }
    palette = [[H, 55, 55], [H + 35, 45, 42], [40, 90, 55]]; grain = 22;
  } else if(album.genre === 'ambient') {
    // soft overlapping glows around a thin ring
    paint.fillStyle = color(H, 35, 86); paint.fillRect(0, 0, S, S);
    for(let i=0; i<7; i++) {
      const x = random() * S, y = random() * S, radius = S * (.25 + random() * .4), hue = H + (random() * 120 - 60);
      const glow = paint.createRadialGradient(x, y, 0, x, y, radius); glow.addColorStop(0, color(hue, 70, 66, .85)); glow.addColorStop(1, color(hue, 70, 66, 0));
      paint.fillStyle = glow; paint.fillRect(0, 0, S, S);
    }
    paint.strokeStyle = 'rgba(255,255,255,.75)'; paint.lineWidth = 1.5; paint.beginPath(); paint.arc(S / 2, S * (.4 + random() * .2), S * .17, 0, Math.PI * 2); paint.stroke();
    palette = [[H, 60, 55], [H + 40, 65, 50], [H - 40, 60, 60]]; grain = 10;
  } else if(album.genre === 'house') {
    // concentric rings crossed by a dark band
    paint.fillStyle = color(H, 35, 8); paint.fillRect(0, 0, S, S);
    const cx = S * (.3 + random() * .4), cy = S * (.3 + random() * .4);
    for(let i=22; i>0; i--) { paint.beginPath(); paint.arc(cx, cy, i * S * .045, 0, Math.PI * 2); paint.fillStyle = (i % 2) ? color(H, 90, 50 - i) : color(H + 150, 85, 55 - i * .8); paint.fill(); }
    paint.save(); paint.translate(S / 2, S / 2); paint.rotate(-.5); paint.fillStyle = 'rgba(0,0,0,.55)'; paint.fillRect(-S, S * .18, S * 2, S * .12); paint.restore();
    palette = [[H, 90, 45], [H + 150, 85, 48], [H, 40, 20]]; grain = 8;
  } else {
    // chiptune: a mirrored pixel sprite over a checkerboard and brick floor
    paint.fillStyle = color(H, 75, 58); paint.fillRect(0, 0, S, S);
    const cell = S / 16;
    for(let y=0; y<16; y++) for(let x=0; x<16; x++) if(((x + y) % 2) !== 0) { paint.fillStyle = 'rgba(0,0,0,.06)'; paint.fillRect(x * cell, y * cell, cell, cell); }
    const n = 10, px = S * .06, ox = (S - n * px) / 2, oy = S * .17, foreground = color(H + 180, 70, 22), highlight = color(H + 60, 95, 62);
    for(let y=0; y<n; y++) for(let x=0; x<n / 2; x++) if(random() < .5) { paint.fillStyle = (random() < .15) ? highlight : foreground; paint.fillRect(ox + x * px, oy + y * px, px, px); paint.fillRect(ox + (n - 1 - x) * px, oy + y * px, px, px); }
    paint.fillStyle = '#fff'; paint.fillRect(ox + 3 * px, oy + 3 * px, px, px); paint.fillRect(ox + (n - 4) * px, oy + 3 * px, px, px);
    for(let x=0; x<S; x+=cell * 2) { paint.fillStyle = color(H + 20, 60, 30); paint.fillRect(x, S - cell * 2.2, cell * 2 - 3, cell - 2); paint.fillRect(x + cell, S - cell * 1.1, cell * 2 - 3, cell - 2); }
    palette = [[H, 75, 50], [H + 180, 70, 32], [H + 60, 90, 52]]; grain = 0;
  }
  const vignette = paint.createRadialGradient(S / 2, S / 2, S * .35, S / 2, S / 2, S * .75); vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.25)');
  paint.fillStyle = vignette; paint.fillRect(0, 0, S, S);
  if(grain) {
    const image = paint.getImageData(0, 0, S, S), data = image.data;
    for(let i=0; i<data.length; i+=4) { const q = (Math.random() - .5) * grain; data[i] += q; data[i + 1] += q; data[i + 2] += q; }
    paint.putImageData(image, 0, 0);
  } /* else -- the pixel art stays crisp */
  return (artCache[key] = { url: canvas.toDataURL('image/jpeg', .88), palette });
};

// == Library =====================================================================
// the app-content the library lives in
const LIBRARY_NAME = 'library.json';
// the library a document without one starts with
const DEFAULT_LIBRARY = { version: 1, albums: [
  { id: 'a6', title: 'Theories of Everything', artist: 'The 100,000 Foot View', genre: 'lofi', year: 2026, seed: 'zoom-out', tracks: ['Zoom Out', 'The Map Is Not the Territory', 'Obvious in Hindsight', 'Everybody Else Was Wrong', 'Zoom Back In'] },
  { id: 'a1', title: 'Midnight Laundromat', artist: 'Soft Static', genre: 'lofi', year: 2026, seed: 'laundromat-7', tracks: ['Spin Cycle', 'Quarters for the Dryer', 'Fluorescent Hum', 'Lint Trap Lullaby', 'Folded Warm'] },
  { id: 'a2', title: 'Neon Tollbooth', artist: 'Vector Coast', genre: 'synthwave', year: 2026, seed: 'tollbooth-88', tracks: ['Exit 88', 'Chrome Horizon', 'Night Shift Overdrive', 'Palm Tree Static', 'Rearview Romance'] },
  { id: 'a3', title: 'Weather for Houseplants', artist: 'Moss Engine', genre: 'ambient', year: 2026, seed: 'fern', tracks: ['Photosynthesis', 'Low Pressure System', 'Dew Point', 'Root Network'] },
  { id: 'a4', title: 'Basement Cathedral', artist: 'The Four-on-the-Floor Society', genre: 'house', year: 2026, seed: 'pews', tracks: ['Kick Drum Sermon', 'Hallelujah Hi-Hat', 'Pews & Subwoofers', 'Last Call Communion'] },
  { id: 'a5', title: 'Extra Life', artist: '8-Bit Grandma', genre: 'chiptune', year: 2026, seed: '1up', tracks: ['Press Start', 'Coin Heaven', 'World 1-2 (Unofficial)', 'Boss Rush', 'Continue?'] },
], loved: ['a6:1', 'a1:0', 'a2:2', 'a5:1'] };
// the words a composed album's title, artist and track names draw from
const WORDS = {
  adj: ['Velvet', 'Paper', 'Quiet', 'Electric', 'Borrowed', 'Lunar', 'Analog', 'Tiny', 'Golden', 'Static', 'Hollow', 'Saturday', 'Infinite', 'Polaroid', 'Glass', 'Distant', 'Rented', 'Midnight', 'Soft', 'Chrome', 'Accidental', 'Sideways'],
  noun: ['Satellites', 'Laundromat', 'Orchard', 'Arcade', 'Cathedral', 'Motel', 'Weather', 'Telephones', 'Parade', 'Aquarium', 'Freeway', 'Greenhouse', 'Radio', 'Lighthouse', 'Vending Machines', 'Swimming Pools', 'Postcards', 'Basements', 'Cassettes', 'Comets', 'Conspiracies', 'Blueprints'],
  a1: ['Soft', 'Neon', 'Paper', 'Moss', 'Vector', 'Velvet', 'Cosmic', 'Dial-Up', 'Sleepy', 'Static', 'Lunar', 'Polite'],
  a2: ['Static', 'Coast', 'Engine', 'Ghosts', 'Society', 'Hands', 'Tapes', 'Choir', 'Machines', 'Moth', 'Department', 'Weather'],
  t: ['Rain', 'Tuesday', 'Headlights', 'Ceiling Fan', 'Payphone', 'Window Seat', 'Fog', 'Dial Tone', 'Sunburn', 'Overpass', 'Snow Globe', 'Ferris Wheel', 'Lost Mitten', 'Night Bus', 'Porch Light', 'Low Tide', 'Afterglow', 'Elevator', 'Vending Machine', 'Leap Year', 'Gravity', 'Small Talk'],
};
// a record title and an artist that have never existed, drawn from `random`
const mintNames = (random) => {
  const first = pick(random, WORDS.noun), second = pick(random, WORDS.noun), adjective = pick(random, WORDS.adj), form = random();
  const title = (form < .5) ? adjective + ' ' + first : (form < .75) ? 'The ' + first : first + ' & ' + ((second === first) ? 'Weather' : second);
  const artistFirst = pick(random, WORDS.a1); let artistSecond = pick(random, WORDS.a2); if(artistFirst === artistSecond) artistSecond = 'Machines';
  const artist = ((random() < .3) ? 'The ' : '') + artistFirst + ' ' + artistSecond;
  return { title, artist };
};
// an album that has never existed: a random genre, title, artist, track names and seed
const newAlbum = () => {
  const random = seededRandom((Math.random() * 4294967296) >>> 0);
  const genre = pick(random, Object.keys(GENRES));
  const { title, artist } = mintNames(random);
  const used = {}, tracks = [], count = 4 + Math.floor(random() * 3);
  const forms = [
    (word) => word, (word) => pick(random, WORDS.adj) + ' ' + word, (word) => 'The ' + word + ' Song',
    (word) => word + ' at 3AM', (word) => 'Notes on ' + word, (word) => 'Last ' + word,
    (word) => word + ' (Reprise)', (word) => 'Interlude: ' + word,
  ];
  while(tracks.length < count) { const word = pick(random, WORDS.t); if(used[word]) continue; used[word] = true; tracks.push(pick(random, forms)(word)); }
  return { id: randomId(), title, artist, genre, year: 2026, seed: randomId() + randomId(), tracks, composed: true };
};

// .. Studio Takes ................................................................
// a take is a one-track album Lyria 3 Pro generates from the User's description
// (`kind` 'take'): { id, kind, title, artist, tracks: [title], prompt (the words
// written), ingredients (the labels of the ingredients picked), model, status,
// startedAt (ms), assetId (its Drive file, once the press is accepted), seconds (its
// length, once measured), renamed (true once the User names it: a generated name
// never replaces theirs), failure (what went wrong, a Failure), detail (the
// refusal's own text, kept for diagnosis and never shown) and cover ({ status,
// assetId, startedAt, detail }: its generated cover, pressed once the song is
// accepted or painted later from its menu; the
// painted sleeve stands in until it is ready and wherever it fails) }. Its file
// plays; nothing of it is composed here
const TAKE_KIND = 'take';
const TakeStatus = Object.freeze({ Pressing: 'pressing', Ready: 'ready', Failed: 'failed' });
const MUSIC_MODEL = 'lyria-3-pro-preview';
const MODEL_LABEL = 'Lyria 3 Pro';
// a cover's model and quality: at `low`, 196 output tokens (about $0.006) a cover
const COVER_MODEL = 'gpt-image-2.5-flare';
const COVER_QUALITY = 'low';
const COVER_SIZE = '1024x1024';
const STUDIO_LABEL = 'Studio';
// what a take's search matches on and its Browse tile shows
const STUDIO_GENRE = { label: STUDIO_LABEL, grad: ['#1B1035', '#AF52DE'] };
// a press usually takes this long (ms): the progress ring fills toward it
const PRESS_EXPECTED_MS = 35 * 1000;
// a press still unaccepted after this long (ms) was interrupted before the studio
// answered; one accepted but still pressing after this long (ms) never settled. The
// Platform settles every accepted generation within ten minutes
const PRESS_UNANSWERED_MS = 3 * 60 * 1000;
const PRESS_UNSETTLED_MS = 15 * 60 * 1000;
// what went wrong with a press, each shown as one line
const Failure = Object.freeze({ Unavailable: 'unavailable', NotIncluded: 'not-included', OutOfCredits: 'out-of-credits', NotAllowed: 'not-allowed', Refused: 'refused', Interrupted: 'interrupted', Unfinished: 'unfinished', Unknown: 'unknown' });
const FAILURE_LINE = {
  [Failure.Unavailable]: 'The studio is closed right now',
  [Failure.NotIncluded]: 'Music isn’t in your plan',
  [Failure.OutOfCredits]: 'You’re out of credits for now',
  [Failure.NotAllowed]: 'The studio needs your OK',
  [Failure.Refused]: 'Lyria couldn’t make this one',
  [Failure.Interrupted]: 'This press was interrupted',
  [Failure.Unfinished]: 'This press never finished',
  [Failure.Unknown]: 'This press hit a snag',
};
// the failures a retry cannot change
const FINAL_FAILURES = [Failure.NotIncluded];
// what a refusal's text says went wrong, by the bridge's and the Platform's own
// wording: a consent refusal, the usage cap, a Feature the plan lacks, a tool or
// argument the Platform does not offer
const failureOf = (text) => {
  if(/consent gate/i.test(text)) return Failure.NotAllowed;
  if(/current usage|credit/i.test(text)) return Failure.OutOfCredits;
  if(/\[permission-denied\]/.test(text)) return Failure.NotIncluded;
  if(/-3260[12]|input validation|invalid arguments|not found/i.test(text)) return Failure.Unavailable;
  return Failure.Unknown;
};
// the refusal's text as a take keeps it: bounded, for diagnosis
const failureDetail = (text) => String(text).slice(0, 500);
const isTake = (album) => !!album && (album.kind === TAKE_KIND);
// whether an album's tracks can play: every composed album, and a take once pressed
const isPlayable = (album) => !!album && (!isTake(album) || ((album.status === TakeStatus.Ready) && !!album.assetId));
// what an album is filed under: a take under the Studio, an album under its genre
const albumLabel = (album) => isTake(album) ? STUDIO_LABEL : GENRES[album.genre].label;
const fileUri = (assetId) => 'charmiq://file/' + assetId;

// what a description presses as: its title and artist minted from its words
const newTake = (prompt, ingredients) => {
  const { title, artist } = mintNames(seededRandom(hashString(prompt + '|' + Date.now())));
  return { id: randomId(), kind: TAKE_KIND, title, artist, year: new Date().getFullYear(), tracks: [title], prompt, ingredients, model: MUSIC_MODEL, status: TakeStatus.Pressing, startedAt: Date.now() };
};
// the instructions a take's name is asked for under: a record title and an artist
// as JSON, so the reply parses whatever the model's habits
const NAMING_INSTRUCTIONS = 'You name records. Given a description of a song, invent its record title and its artist (a band or artist name). ' +
  'The title is at most three words; the artist at most three words. Make both evocative and specific to the song, never generic. ' +
  'No quotation marks, emoji, or the words song, track or album. ' +
  'Reply with JSON only, no other text: {"title": "...", "artist": "..."}';
// a name past this many characters is not a name the cards can show
const NAME_MAX_LENGTH = 40;
// what the cover's model is asked for: a record cover the song's own words and
// style direct, art-directed as a designed cover and kept free of lettering (the
// app sets the title beside it, and a model's lettering garbles)
const coverPrompt = (prompt, ingredients) =>
  'Album cover artwork for this song: ' + modelPrompt(prompt, ingredients) + '\n\n' +
  'Design a bold, striking record cover that a music fan would frame: one memorable central image or concept drawn from the song\'s story, mood and genre; ' +
  'a deliberate, distinctive color palette; dramatic lighting, depth and rich texture; and the art style that best fits the music, whether photography, ' +
  'illustration, painting, collage or graphic design. Square, full-bleed composition with no border or frame. ' +
  'No text, letters, words, numbers, logos or watermarks anywhere in the image.';
// what the model is asked for: the words written, then the ingredients as a style
// (`Style: jazz, orchestral.`)
const modelPrompt = (prompt, ingredients) => {
  if(ingredients.length < 1) return prompt;
  const texts = ingredients.map((label) => { const ingredient = INGREDIENTS.find((candidate) => candidate.label === label); return ingredient ? ingredient.text : label.toLowerCase(); });
  return prompt.replace(/\s+$/, '') + (/[.!?]$/.test(prompt.trim()) ? ' ' : '. ') + 'Style: ' + texts.join(', ') + '.';
};
// descriptions the booth offers, each a song worth hearing
const IDEAS = [
  'Rainy-window lo-fi for a laundromat at 2AM: dusty Rhodes, vinyl crackle, a sleepy saxophone',
  'A sea shanty about forgetting your password, stomping boots and the whole crew singing',
  'Ambient music for houseplants: slow warm pads, distant birdsong, nothing happens, beautifully',
  'Gospel house sermon for the last train home, a choir, handclaps and a rolling piano',
  'An 80s synthwave anthem for a tollbooth attendant who dreams of the open road',
  'A chiptune boss battle against a printer that will not print, frantic and triumphant',
  'A cozy jazz trio for a Sunday crossword, brushed drums and walking bass',
  'A breakup ballad sung by a lighthouse to a ship that stopped visiting',
  'Surf rock for a cat chasing a laser pointer, reverb-soaked guitar, a big drum fill',
  'A bossa nova lullaby for a robot learning to sleep, soft nylon guitar and humming',
  'A marching band fanfare for finally finishing your taxes, brass and cymbals',
  'Dreamy shoegaze about the moon forgetting its lines, washed-out vocals',
];
// what a chip adds to the description; `group` chips exclude each other
const INGREDIENTS = [
  { label: 'Instrumental', text: 'instrumental, no vocals', group: 'voice' },
  { label: 'With Vocals', text: 'with sung vocals and lyrics', group: 'voice' },
  { label: 'Dreamy', text: 'dreamy' },
  { label: 'Euphoric', text: 'euphoric' },
  { label: 'Melancholy', text: 'melancholy' },
  { label: 'Spooky', text: 'spooky' },
  { label: 'Cinematic', text: 'cinematic' },
  { label: 'Lo-Fi', text: 'lo-fi hip hop' },
  { label: 'Synthwave', text: 'synthwave' },
  { label: 'House', text: 'deep house' },
  { label: 'Jazz', text: 'jazz' },
  { label: 'Orchestral', text: 'orchestral' },
  { label: 'Punk', text: 'punk rock' },
  { label: 'Slow', text: 'slow tempo', group: 'tempo' },
  { label: 'Fast', text: 'fast tempo', group: 'tempo' },
];

// == State =======================================================================
// .. Vocabulary ..................................................................
const Tab = Object.freeze({ Home: 'home', Library: 'library', Studio: 'studio', Search: 'search' });
const TAB_LABEL = { [Tab.Home]: 'Home', [Tab.Library]: 'Library', [Tab.Studio]: 'Studio', [Tab.Search]: 'Search' };
// the page a detail view shows: an album, the Loved Songs list, every song or every
// pressed take
const RouteType = Object.freeze({ Album: 'album', Loved: 'loved', Songs: 'songs', Takes: 'takes' });
const Repeat = Object.freeze({ Off: 'off', All: 'all', One: 'one' });
// what the Now Playing stage shows
const PlayerMode = Object.freeze({ Art: 'art', Score: 'score', Queue: 'queue' });
// what leads a track row: its number (an album's track list) or its cover
const RowStyle = Object.freeze({ Number: 'num', Thumbnail: 'thumb' });

// .. Values ......................................................................
// the library as shown: what the app-content holds, null until it first arrives
let library = null;
// the player's place, saved as the app-state: the tab, the detail page open (`route`)
// and the tab it opened from, the queue of track keys (`albumId:index`) with the
// current index (`qi`), the position in seconds (`pos`), the volume (`vol`), the
// unshuffled queue while shuffled (`orig`), the repeat and stage modes, and the
// recently played album ids
const state = {
  tab: Tab.Home, route: null/*no detail page open*/, routeTab: Tab.Home,
  queue: [], qi: 0, pos: 0, vol: .8, shuffle: false, orig: null/*not shuffled*/,
  repeat: Repeat.Off, mode: PlayerMode.Art, recent: [],
};
let nowPlayingOpen = false, query = '', stateTimer = null/*no app-state write pending*/, booted = false;
// a detail page waiting for the album it names to be shown
let pendingRoute = null/*none waiting*/;
const specCache = {};
// the track keys each list shows, by list: what playing from it queues
const contextKeys = {};
let currentPalette = null/*no track*/;
const app = $('#app'), nowPlaying = $('#np'), detail = $('#detail');

// .. Lookups .....................................................................
const albumById = (id) => library ? library.albums.find((album) => album.id === id) : null/*no library yet*/;
// the track a key (`albumId:index`) names, or null when it names none
const trackOf = (key) => {
  if(!key || !library) return null/*no track*/;
  const colon = key.lastIndexOf(':');
  const album = albumById(key.slice(0, colon)), index = +key.slice(colon + 1);
  if(!album || (album.tracks[index] == null) || !isPlayable(album)) return null/*the album or the track is gone, or still pressing*/;
  return { key, album, idx: index, title: album.tracks[index] };
};
// the track's composition, composed once per seed, genre and index; a take's spec,
// one per file, its length the measured one
const specOf = (track) => {
  const album = track.album;
  if(isTake(album)) {
    const key = TAKE_SPEC + '|' + album.assetId;
    const spec = specCache[key] || (specCache[key] = { kind: TAKE_SPEC, assetId: album.assetId, duration: 0/*not yet measured*/ });
    if(!(spec.duration > 0) && (album.seconds > 0)) spec.duration = album.seconds;
    return spec;
  } /* else -- a composition */
  const key = album.seed + '|' + album.genre + '|' + track.idx;
  return specCache[key] || (specCache[key] = makeSpec(album, track.idx));
};
// a track's length as a row shows it: blank until a take is measured
const durationText = (spec) => (spec.duration > 0) ? formatTime(spec.duration) : '';
const current = () => trackOf(state.queue[state.qi]);
const keysOf = (album) => isPlayable(album) ? album.tracks.map((_, index) => album.id + ':' + index) : []/*a take still pressing plays nothing*/;
const playableAlbums = () => library.albums.filter(isPlayable);
// every take, the newest first, and the keys of those pressed
const takes = () => library.albums.filter(isTake).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
const takeKeys = () => takes().flatMap(keysOf);
const isLoved = (key) => library.loved.indexOf(key) > -1;
// shuffles `items` in place (Fisher-Yates)
const shuffleArray = (items) => {
  for(let i=items.length - 1; i>0; i--) { const j = Math.floor(Math.random() * (i + 1)); const swap = items[i]; items[i] = items[j]; items[j] = swap; }
  return items;
};

// == Menu, Alert, Toast ==========================================================
const openMenu = (button, items) => {
  const menu = $('#menu');
  menu.innerHTML = items.map((item) => '<button data-action="' + item.action + '"' + (item.key ? ' data-key="' + item.key + '"' : '') + (item.id ? ' data-id="' + item.id + '"' : '') + ' class="' + (item.destructive ? 'destructive' : '') + '"><span>' + escapeHtml(item.label) + '</span>' + item.icon + '</button>').join('');
  $('#menuWrap').classList.add('open');
  const anchor = button.getBoundingClientRect(), height = menu.offsetHeight;
  let top = anchor.bottom + 4;
  if((top + height) > (window.innerHeight - 10)) top = Math.max(10, anchor.top - height - 4);
  menu.style.top = top + 'px'; menu.style.right = Math.max(8, window.innerWidth - anchor.right) + 'px';
};
const closeMenu = () => $('#menuWrap').classList.remove('open');
// asks the User to confirm; resolves true on the confirming button
const confirmAlert = (title, message, confirmLabel) => new Promise((resolve) => {
  $('#alertTitle').textContent = title; $('#alertMsg').textContent = message; $('#alertOk').textContent = confirmLabel || 'OK';
  const wrap = $('#alertWrap'); wrap.classList.add('open');
  const onClick = (event) => {
    const button = event.target.closest('[data-alert]'); if(!button) return;
    event.stopPropagation(); wrap.classList.remove('open'); wrap.removeEventListener('click', onClick, true);
    resolve(button.dataset.alert === '1');
  };
  wrap.addEventListener('click', onClick, true);
});
let toastTimer = null/*no toast showing*/;
// shows `message`; with `act` ({ label, action, key, t }) a button taking that action,
// shown longer so there is time to tap it
const toast = (message, act) => {
  const element = $('#toast');
  element.innerHTML = ICON.spark + '<span>' + escapeHtml(message) + '</span>' +
    (act ? '<button class="toast-act" data-action="' + act.action + '"' + (act.key ? ' data-key="' + escapeHtml(act.key) + '"' : '') + (act.t ? ' data-t="' + act.t + '"' : '') + '>' + escapeHtml(act.label) + '</button>' : '');
  element.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), act ? 6000 : 2000);
};

// == Bridge ======================================================================
// -- Library ---------------------------------------------------------------------
// the library's app-content as last shown: the AppContent every write is measured on
let libraryContent = null/*none shown yet*/;
// retries waiting for the AppContent after the one their write was refused on
let contentWaiters = [];
let creatingLibrary = false;

// the library a text holds, or null when it holds none
const parseLibrary = (text) => {
  const trimmed = String((text == null) ? '' : text).trim(); if(!trimmed) return null/*empty*/;
  try { const data = JSON.parse(trimmed); if(data && Array.isArray(data.albums)) return data; } catch(error) { /*not JSON: no library*/ }
  return null/*not a library*/;
};
// the library made safe to render: albums without an id or tracks dropped, every
// shown field a string, an unknown genre played as Lo-Fi; a take's unknown status
// shown as failed and its file id, length and start kept only when well formed
const normalize = (data) => {
  data.albums = data.albums
    .filter((album) => album && album.id && Array.isArray(album.tracks))
    .map((album) => {
      const shown = Object.assign({}, album, {
        id: String(album.id).replace(/:/g, '-'),
        genre: GENRES[album.genre] ? album.genre : 'lofi',
        seed: (album.seed != null) ? String(album.seed) : String(album.id),
        title: String(album.title || 'Untitled'),
        artist: String(album.artist || 'Unknown Artist'),
        tracks: album.tracks.map(String),
      });
      if(!isTake(album)) return shown;
      return Object.assign(shown, {
        prompt: String(album.prompt || ''),
        ingredients: Array.isArray(album.ingredients) ? album.ingredients.filter((label) => typeof label === 'string') : [],
        status: (Object.values(TakeStatus).indexOf(album.status) > -1) ? album.status : TakeStatus.Failed,
        assetId: (typeof album.assetId === 'string') && album.assetId ? album.assetId : undefined/*not yet accepted*/,
        seconds: (typeof album.seconds === 'number') && (album.seconds > 0) ? album.seconds : undefined/*not yet measured*/,
        startedAt: (typeof album.startedAt === 'number') ? album.startedAt : 0,
        renamed: (album.renamed === true) || undefined/*named by the Platform or minted*/,
        failure: (Object.values(Failure).indexOf(album.failure) > -1) ? album.failure : Failure.Unknown,
        cover: (album.cover && (typeof album.cover === 'object') && (Object.values(TakeStatus).indexOf(album.cover.status) > -1)) ? album.cover : undefined/*no cover pressed*/,
      });
    });
  data.loved = Array.isArray(data.loved) ? data.loved.filter((key) => typeof key === 'string') : [];
  return data;
};

// writes `lines` as the whole app-content, measured on `content`
const writeLines = async (content, lines) => {
  try {
    await content.setLines(lines);
  } catch(error) {
    if(!error || (error.code !== 'functions/out-of-range')) throw error;
    // NOTE: setLines refuses lines too different to align with the app-content's;
    //       one edit of the whole text, still measured on `content`, replaces it
    await content.edit([{ from: 0, to: content.text.length, insert: lines.map((line) => line + '\n').join('') }]);
  }
};
// resolves once an AppContent other than `previous` is shown
const nextContent = (previous) => (libraryContent !== previous) ? Promise.resolve() : new Promise((resolve) => contentWaiters.push(resolve));
const isConflict = (error) => !!error && (error.code === 'app/content-conflict');
const MAX_CHANGE_ATTEMPTS = 5;
// applies `change` ((library) => nextLibrary) to the library the app-content holds and
// writes the result through that AppContent. A write refused because another writer
// changed the app-content first applies the change again to what it holds then. An
// unreadable app-content is changed from the default library
const changeLibrary = async (change) => {
  for(let attempt=1; ; attempt++) {
    const content = libraryContent;
    if(!content) throw new Error(LIBRARY_NAME + ' is not in the document');
    const data = parseLibrary(content.text);
    const next = change(normalize(data || clone(DEFAULT_LIBRARY)));
    try {
      await writeLines(content, JSON.stringify(next, null, 2).split('\n'));
      return;
    } catch(error) {
      if(!isConflict(error) || (attempt >= MAX_CHANGE_ATTEMPTS)) throw error;
      await nextContent(content);
    }
  }
};
// changes the library, telling the User when the change could not be saved; true once saved
const updateLibrary = async (change) => {
  try { await changeLibrary(change); return true; }
  catch(error) { toast('Not saved: ' + messageOf(error)); return false; }
};

const createLibrary = () => {
  if(creatingLibrary) return;
  creatingLibrary = true;
  window.charmiq.appContent.create(JSON.stringify(DEFAULT_LIBRARY, null, 2), LIBRARY_NAME)
    .catch((error) => { creatingLibrary = false; toast('Could not create the library: ' + messageOf(error)); });
};
// keeps the playing track's music in step with its album: a remix (here or on another
// device) gives the album a new seed and so new music, continued from the same position
const followComposition = () => {
  const track = current(); if(!track) return;
  const spec = specOf(track); if(Engine.spec() === spec) return;
  const playing = Engine.isPlaying(), position = Math.min(Engine.position(), spec.duration - 1);
  Engine.load(spec, position);
  if(playing) Engine.play(position);
};
// shows each AppContent the library's stream gives: what is shown is always what the
// app-content holds, the User's own writes included as they come back
const showLibrary = (content) => {
  libraryContent = content;
  const waiters = contentWaiters; contentWaiters = []; waiters.forEach((resolve) => resolve());
  if(!content) {
    if(!library) createLibrary();
    return/*a library shown stays shown while its app-content is gone*/;
  } /* else -- an app-content to show */
  const data = parseLibrary(content.text);
  if(!data) {
    if(!library) updateLibrary((defaults) => defaults)/*replaces the unreadable text with the default library*/;
    return;
  } /* else -- a library */

  const first = !library, previous = library;
  library = normalize(data);
  if(first) { boot(); return; }
  followComposition();
  if(!current()) { Engine.pause(); state.queue = []; state.qi = 0; }
  renderAll(); onTrackChange();
  announceTakes(previous); schedulePoll(TAKE_POLL_MS);
  if(pendingRoute && albumById(pendingRoute.id)) { const route = pendingRoute; pendingRoute = null; openRoute(route); }
};

// -- Studio ----------------------------------------------------------------------
// a press asks the Platform's generation server for a queued song: its Asset id
// comes back at once and the song is generated after. Every device showing the
// library asks after each pressing take's Asset until it is stored or failed, and
// records the outcome on the take, so every device shows it
const TAKE_POLL_MS = 4000;
// an Asset's storage status, as describe_file reports it
const AssetStatus = Object.freeze({ Stored: 'stored', Failed: 'failed' });
// the takes whose press this device is still sending
const sending = new Set();
let pollTimer = null/*no check waiting*/, checking = false;

// calls a Platform MCP tool and returns its structured result; a refusal throws its text
const callTool = async (server, tool, args) => {
  const mcp = window.charmiq && window.charmiq.mcp; if(!mcp) throw new Error('The studio is reachable only inside CharmIQ.');
  const result = await mcp.callTool(server, tool, args);
  const text = (result.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  if(result.isError) throw new Error(text || ('The Platform refused ' + tool + '.'));
  if(result.structuredContent == null) throw new Error('The Platform answered ' + tool + ' without its result.');
  return result.structuredContent;
};
// changes take `id` by `fields`; with `stillPressing`, only while it is still pressing
const changeTake = (id, fields, stillPressing) => updateLibrary((data) => ({ ...data, albums: data.albums.map((album) => ((album.id === id) && (!stillPressing || (album.status === TakeStatus.Pressing))) ? { ...album, ...fields } : album) }));

// presses `prompt` with `ingredients` (their labels) as a new take, in place of take
// `replaces` when it is a retry; false when the take could not be added to the
// library (nothing was sent)
const pressTake = async (prompt, ingredients, replaces) => {
  const take = newTake(prompt, ingredients);
  sending.add(take.id);
  naming.set(take.id, { startedAt: Date.now(), name: null/*not yet named*/ })/*its card's first paint already flips*/;
  try {
    if(!await updateLibrary((data) => ({ ...data, albums: [take, ...data.albums.filter((album) => album.id !== replaces)] }))) { naming.delete(take.id); return false; }
    toast('Pressing your song');
    nameTake(take.id, prompt, ingredients)/*beside the song; its names stand until a name arrives*/;
    let fields;
    try {
      const result = await callTool('generation', 'create_music', { mode: 'queued', google: { model: MUSIC_MODEL, prompt: modelPrompt(prompt, ingredients) } });
      const assetId = Array.isArray(result.assetIds) && result.assetIds[0];
      fields = assetId ? { assetId, cover: await pressCover(prompt, ingredients) } : { status: TakeStatus.Failed, failure: Failure.Unknown, detail: 'create_music answered without an assetId' };
    } catch(error) { const text = messageOf(error); fields = { status: TakeStatus.Failed, failure: failureOf(text), detail: failureDetail(text) }; }
    await changeTake(take.id, fields, true);
  } finally { sending.delete(take.id); }
  schedulePoll(TAKE_POLL_MS);
  return true;
};

// -- Naming ----------------------------------------------------------------------
// a take's title and artist from its description, written by a language model. The
// minted names stand until it answers and wherever it fails; a name the User gave
// is never replaced
// the takes being named on this device: when each began, and the name once it came
const naming = new Map();
const NAMING_TIMEOUT_MS = 30 * 1000;
// the title and artist a reply names, or null when it names none usable
const parseName = (text) => {
  const match = String(text || '').match(/\{[\s\S]*\}/); if(!match) return null/*no JSON in the reply*/;
  let name; try { name = JSON.parse(match[0]); } catch(error) { return null/*not JSON*/; }
  const clean = (value) => (typeof value === 'string') ? value.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim() : '';
  const title = clean(name && name.title), artist = clean(name && name.artist);
  if(!title || (title.length > NAME_MAX_LENGTH) || (artist.length > NAME_MAX_LENGTH)) return null/*not a name the cards can show*/;
  return { title, artist };
};
// names take `id`, already marked as being named
const nameTake = async (id, prompt, ingredients) => {
  let name = null/*the minted names stand*/;
  try {
    const result = await callTool('generation', 'create_text', { prompt: modelPrompt(prompt, ingredients), instructions: NAMING_INSTRUCTIONS });
    name = result.success ? parseName(result.text) : null/*no text to use*/;
  } catch(error) { console.warn('take not named', messageOf(error))/*the minted names stand*/; }
  if(!name || !naming.has(id)) { naming.delete(id); renderStudio(); return; }
  const saved = await updateLibrary((data) => ({ ...data, albums: data.albums.map((album) => ((album.id === id) && !album.renamed) ? { ...album, title: name.title, artist: name.artist || album.artist, tracks: [name.title] } : album) }));
  if(!saved || !naming.has(id)) { naming.delete(id); renderStudio(); return; }
  naming.set(id, { ...naming.get(id), name, lockedAt: Date.now() })/*the flaps settle onto it*/;
};

// asks for a take's cover; its failure never fails the take (the painted sleeve stays)
const pressCover = async (prompt, ingredients) => {
  try {
    const result = await callTool('generation', 'create_image', { mode: 'queued', prompt: coverPrompt(prompt, ingredients), openai: { model: COVER_MODEL, size: COVER_SIZE, quality: COVER_QUALITY } });
    const assetId = Array.isArray(result.assetIds) && result.assetIds[0];
    return assetId ? { status: TakeStatus.Pressing, assetId, startedAt: Date.now() } : { status: TakeStatus.Failed, detail: 'create_image answered without an assetId' };
  } catch(error) { return { status: TakeStatus.Failed, detail: failureDetail(messageOf(error)) }; }
};
// asks for a take's new title and artist; resolves them, or null when cancelled.
// The title is required; an empty artist keeps the take's own
const renameAlert = (take) => new Promise((resolve) => {
  const wrap = $('#renameWrap'), title = $('#renameTitle'), artist = $('#renameArtist'), save = $('#renameSave');
  title.value = take.title; artist.value = take.artist;
  const validate = () => { save.disabled = !title.value.trim(); };
  const close = (result) => {
    wrap.classList.remove('open'); title.blur(); artist.blur();
    wrap.removeEventListener('click', onClick, true); wrap.removeEventListener('input', validate); wrap.removeEventListener('keydown', onKey);
    resolve(result);
  };
  const commit = () => { if(title.value.trim()) close({ title: title.value.trim(), artist: artist.value.trim() || take.artist }); };
  const onClick = (event) => {
    const button = event.target.closest('[data-rename]'); if(!button) return;
    event.stopPropagation();
    if(button.dataset.rename === '1') commit(); else close(null/*cancelled*/);
  };
  const onKey = (event) => {
    if(event.key === 'Escape') { event.stopPropagation(); close(null/*cancelled*/); }
    else if(event.key === 'Enter') { event.preventDefault(); if(event.target === title) artist.focus(); else commit(); }
  };
  wrap.addEventListener('click', onClick, true); wrap.addEventListener('input', validate); wrap.addEventListener('keydown', onKey);
  validate(); wrap.classList.add('open');
  // NOTE: focused inside the tap that opened it, so iOS raises the keyboard
  title.focus(); title.select();
});
// renames a take: its title (the album's and its song's) and its artist
const renameTake = async (id) => {
  const take = albumById(id); if(!isTake(take)) return;
  const names = await renameAlert(take); if(!names) return;
  if((names.title === take.title) && (names.artist === take.artist)) return/*unchanged*/;
  naming.delete(id)/*the User's name wins*/;
  if(await changeTake(id, { title: names.title, artist: names.artist, tracks: [names.title], renamed: true })) toast('Renamed “' + names.title + '”');
};
// paints a new cover for a pressed take whose cover failed or that has none
const paintCover = async (id) => {
  const take = albumById(id); if(!isTake(take) || !needsCover(take)) return;
  const cover = await pressCover(take.prompt, take.ingredients);
  if(!await updateLibrary((data) => ({ ...data, albums: data.albums.map((album) => (album.id === id) ? { ...album, cover } : album) }))) return;
  toast((cover.status === TakeStatus.Pressing) ? 'Painting a cover for “' + take.title + '”' : 'The cover could not be started');
  schedulePoll(TAKE_POLL_MS);
};
// changes take `id`'s cover by `fields` while it is still pressing
const changeCover = (id, fields) => updateLibrary((data) => ({ ...data, albums: data.albums.map((album) => ((album.id === id) && album.cover && (album.cover.status === TakeStatus.Pressing)) ? { ...album, cover: { ...album.cover, ...fields } } : album) }));

// each take's audio, read once per launch: an object URL by Asset id
const takeUrls = {};
const takeUrl = (assetId) => takeUrls[assetId] || (takeUrls[assetId] = readTake(assetId).catch((error) => { delete takeUrls[assetId]; throw error; }));
const readTake = async (assetId) => {
  const read = await callTool('vfs', 'read_file', { uri: fileUri(assetId) });
  if(typeof read.content !== 'string') throw new Error('The take’s file did not read as audio.');
  const binary = atob(read.content), bytes = new Uint8Array(binary.length);
  for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: read.contentType || 'audio/mpeg' }));
};
// a take's length in seconds, read from its file; undefined where it cannot be read
// or the browser measures it only once it plays (its first play records it then)
const measureTake = (assetId) => takeUrl(assetId).then((url) => new Promise((resolve) => {
  const probe = document.createElement('audio');
  let settled = false;
  const done = (seconds) => { if(settled) return; settled = true; probe.removeAttribute('src'); resolve(seconds); };
  probe.preload = 'metadata';
  probe.addEventListener('loadedmetadata', () => done((isFinite(probe.duration) && (probe.duration > 0)) ? Math.round(probe.duration * 10) / 10 : undefined/*no length*/));
  probe.addEventListener('error', () => done(undefined/*unreadable here*/));
  setTimeout(() => done(undefined/*not measured before a play*/), 8000);
  probe.src = url;
}), () => undefined/*unreadable: its first play reads it again*/);

// whether a pressed take can have a cover painted: none was, or it failed
const needsCover = (album) => isTake(album) && (album.status === TakeStatus.Ready) && (!album.cover || (album.cover.status === TakeStatus.Failed));
const isCoverPressing = (album) => !!album.cover && (album.cover.status === TakeStatus.Pressing) && !!album.cover.assetId;
// the takes whose song or cover is still pressing
const awaitedTakes = () => library ? library.albums.filter((album) => isTake(album) && ((album.status === TakeStatus.Pressing) || isCoverPressing(album))) : [];
// the storage status of the Asset `assetId`, or null when it could not be asked
const assetOf = async (assetId) => {
  try { return (await callTool('vfs', 'describe_file', { uri: fileUri(assetId) })).asset || null; } catch(error) { return null/*asked again next round*/; }
};
const schedulePoll = (delay) => {
  if(pollTimer || checking || (awaitedTakes().length < 1)) return;
  pollTimer = setTimeout(() => { pollTimer = null; checkTakes(); }, delay);
};
// asks after each pressing take once, recording the outcome of each one settled
const checkTakes = async () => {
  if(checking || document.hidden) return/*the next visible moment asks*/;
  checking = true;
  try {
    for(const take of awaitedTakes()) {
      const age = Date.now() - take.startedAt;
      if(isCoverPressing(take)) {
        const cover = await assetOf(take.cover.assetId), coverAge = Date.now() - (take.cover.startedAt || take.startedAt);
        if(cover && (cover.storeStatus === AssetStatus.Stored)) await changeCover(take.id, { status: TakeStatus.Ready });
        else if(cover && (cover.storeStatus === AssetStatus.Failed)) await changeCover(take.id, { status: TakeStatus.Failed, detail: failureDetail(cover.errorMessage || 'failed without a reason') });
        else if(coverAge > PRESS_UNSETTLED_MS) await changeCover(take.id, { status: TakeStatus.Failed, detail: 'still storing after ' + Math.round(coverAge / 1000) + 's' });
      } /* else -- no cover still pressing */
      if(take.status !== TakeStatus.Pressing) continue/*the song has settled*/;
      if(!take.assetId) {
        if(!sending.has(take.id) && (age > PRESS_UNANSWERED_MS)) await changeTake(take.id, { status: TakeStatus.Failed, failure: Failure.Interrupted, detail: 'no assetId after ' + Math.round(age / 1000) + 's' }, true);
        continue;
      } /* else -- accepted: its Asset says how it stands */
      const asset = await assetOf(take.assetId);
      if(asset && (asset.storeStatus === AssetStatus.Stored)) {
        const seconds = await measureTake(take.assetId);
        await changeTake(take.id, seconds ? { status: TakeStatus.Ready, seconds } : { status: TakeStatus.Ready }, true);
      } else if(asset && (asset.storeStatus === AssetStatus.Failed)) await changeTake(take.id, { status: TakeStatus.Failed, failure: Failure.Refused, detail: failureDetail(asset.errorMessage || 'failed without a reason') }, true);
      else if(age > PRESS_UNSETTLED_MS) await changeTake(take.id, { status: TakeStatus.Failed, failure: Failure.Unfinished, detail: 'still storing after ' + Math.round(age / 1000) + 's' }, true);
    }
  } finally { checking = false; schedulePoll(TAKE_POLL_MS); }
};
document.addEventListener('visibilitychange', () => { if(document.hidden) return; clearTimeout(pollTimer); pollTimer = null; checkTakes(); });
// tells of each take that settled since `previous` was shown, pressed here or elsewhere
const announceTakes = (previous) => {
  if(!previous) return;
  const was = {}; previous.albums.forEach((album) => { if(isTake(album)) was[album.id] = album.status; });
  library.albums.forEach((take) => {
    if(!isTake(take) || (was[take.id] !== TakeStatus.Pressing) || (take.status === TakeStatus.Pressing)) return;
    if(take.status === TakeStatus.Ready) toast('“' + take.title + '” is pressed', { label: 'Play', action: 'play-take', key: take.id + ':0' });
    else toast('“' + take.title + '” didn’t press', { label: 'See Why', action: 'tab', t: Tab.Studio });
  });
};

// -- App-State -------------------------------------------------------------------
// writes the player's place, at most once per 200ms
const saveState = () => {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    const saved = {
      tab: state.tab, route: state.route, routeTab: state.routeTab,
      queue: state.queue, qi: state.qi, pos: Math.round(Engine.position() * 10) / 10, vol: state.vol,
      shuffle: state.shuffle, orig: state.orig, repeat: state.repeat, mode: state.mode, recent: state.recent,
    };
    window.charmiq.appState.set(saved).catch((error) => console.warn('appState.set failed', error));
  }, 200);
};
// takes each valid field of a saved app-state
const applyState = (saved) => {
  if(!saved || (typeof saved !== 'object')) return;
  if(TAB_LABEL[saved.tab]) state.tab = saved.tab;
  state.route = (saved.route && (typeof saved.route === 'object')) ? saved.route : null/*no detail page open*/;
  if(TAB_LABEL[saved.routeTab]) state.routeTab = saved.routeTab;
  if(Array.isArray(saved.queue)) state.queue = saved.queue.filter((key) => typeof key === 'string');
  if(typeof saved.qi === 'number') state.qi = saved.qi;
  if(typeof saved.pos === 'number') state.pos = saved.pos;
  if(typeof saved.vol === 'number') state.vol = clamp(saved.vol, 0, 1);
  state.shuffle = !!saved.shuffle; state.orig = Array.isArray(saved.orig) ? saved.orig : null/*not shuffled*/;
  if(Object.values(Repeat).indexOf(saved.repeat) > -1) state.repeat = saved.repeat;
  if(Object.values(PlayerMode).indexOf(saved.mode) > -1) state.mode = saved.mode;
  if(Array.isArray(saved.recent)) state.recent = saved.recent;
};

// == Rendering ===================================================================
// -- Pages -----------------------------------------------------------------------
// re-renders with `render`, keeping each horizontal shelf's scroll within `element`
const keepShelfScroll = (element, render) => {
  const offsets = $$('.hscroll', element).map((shelf) => shelf.scrollLeft);
  render();
  $$('.hscroll', element).forEach((shelf, i) => { if(offsets[i]) shelf.scrollLeft = offsets[i]; });
};
// the tag marking a take: the Studio pressed it, nothing composed it here
const STUDIO_TAG = '<span class="studio-tag">STUDIO</span>';
const rowHTML = (key, context, style) => {
  const track = trackOf(key); if(!track) return '';
  const art = artFor(track.album), spec = specOf(track), playingTrack = current(), isCurrent = !!(playingTrack && (playingTrack.key === key));
  const lead = (style === RowStyle.Number)
    ? '<div class="trk-num">' + (isCurrent ? EQUALIZER : (track.idx + 1)) + '</div>'
    : '<div class="trk-thumb"><img alt="" src="' + art.url + '">' + (isCurrent ? '<div class="thumb-eq">' + EQUALIZER + '</div>' : '') + '</div>';
  // NOTE: a row in a list of songs opens its album (played from there); a row on its
  //       album's own page plays
  const action = (style === RowStyle.Thumbnail) ? 'open-album' : 'play';
  return '<div class="trk' + (isCurrent ? ' current' : '') + '" data-action="' + action + '" data-id="' + track.album.id + '" data-key="' + key + '" data-ctx="' + escapeHtml(context) + '" data-mode="' + style + '">' + lead +
    '<div class="trk-body"><div class="trk-main"><div class="trk-title">' + escapeHtml(track.title) + '</div>' +
    ((style === RowStyle.Thumbnail) ? '<div class="trk-sub">' + (isTake(track.album) ? STUDIO_TAG + escapeHtml(track.album.prompt) : escapeHtml(track.album.artist) + ' · ' + albumLabel(track.album)) + '</div>' : '') + '</div>' +
    (isLoved(key) ? '<span class="trk-heart">' + ICON.heart + '</span>' : '') +
    '<span class="trk-dur">' + durationText(spec) + '</span>' +
    '<button class="trk-more" data-action="track-menu" data-key="' + key + '" aria-label="More">' + ICON.dots + '</button></div></div>';
};
const tileHTML = (album) => '<button class="atile" data-action="open-album" data-id="' + album.id + '"><img alt="" src="' + artFor(album).url + '"><div class="alb-t">' + escapeHtml(album.title) + '</div><div class="alb-a">' + (isTake(album) ? STUDIO_TAG : '') + escapeHtml(album.artist) + '</div></button>';
const renderHome = () => {
  const body = $('#homeBody');
  keepShelfScroll(body, () => {
    const albums = playableAlbums(), pressed = albums.filter(isTake);
    let html = '<div class="sec-h">Top Picks for You</div><div class="hscroll">' + albums.slice(0, 6).map((album, i) => {
      const art = artFor(album);
      return '<button class="pick" data-action="open-album" data-id="' + album.id + '"><img alt="" src="' + art.url + '"><div class="pick-cap" style="background:' + hslColor(art.palette[0], 24) + '"><div class="pick-kicker">' + ((i === 0) ? 'Made for Big G' : isTake(album) ? 'Fresh from the Studio' : albumLabel(album) + ' Mix') + '</div><div class="pick-title">' + escapeHtml(album.title) + '</div><div class="pick-sub">' + escapeHtml(album.artist) + '</div></div></button>';
    }).join('') + '</div>';
    html += '<div class="sec-h">Make Something New</div><button class="compose" data-action="compose"><div class="compose-glyph">' + ICON.spark + '</div><div class="compose-k">Infinite Record Label</div><div class="compose-t">Compose an Album</div><div class="compose-s">Tap to mint a record that has never existed. Every note is written on this device, live. No files, no servers, no repeats.</div></button>' +
      '<button class="compose go-studio" data-action="tab" data-t="' + Tab.Studio + '"><div class="compose-glyph">' + ICON.studio + '</div><div class="compose-k">The Studio</div><div class="compose-t">Press a Song</div><div class="compose-s">Describe any song you can imagine. Lyria 3 Pro writes it, plays it and sings it, and it joins your library.</div></button>';
    if(pressed.length > 0) html += '<div class="sec-h">From the Studio<button data-action="open-route" data-type="' + RouteType.Takes + '">See All</button></div><div class="hscroll">' + pressed.map(tileHTML).join('') + '</div>';
    let recent = state.recent.map(albumById).filter(isPlayable);
    if(recent.length < 1) recent = albums.slice().reverse();
    html += '<div class="sec-h">Recently Played</div><div class="hscroll">' + recent.map(tileHTML).join('') + '</div>';
    const loved = library.loved.filter(trackOf);
    contextKeys[RouteType.Loved] = loved;
    if(loved.length > 0) html += '<div class="sec-h">Loved Songs<button data-action="open-route" data-type="loved">See All</button></div><div>' + loved.slice(0, 4).map((key) => rowHTML(key, RouteType.Loved, RowStyle.Thumbnail)).join('') + '</div>';
    html += '<div class="foot-note"><b>The albums have no audio files.</b> Each song is a seed (a short string) unfolded into music in real time by a tiny composer living in this page. Change one letter of a seed in the document and you get a completely different record. Open Now Playing and tap the score button to watch it think. <b>Studio takes are the exception:</b> songs Lyria 3 Pro pressed from your words, each an audio file in your Drive.</div>';
    body.innerHTML = html;
  });
};
const renderLibrary = () => {
  const albums = playableAlbums(), lovedCount = library.loved.filter(trackOf).length, total = albums.reduce((sum, album) => sum + album.tracks.length, 0);
  $('#libBody').innerHTML = '<div class="rows">' +
    '<button class="lrow" data-action="open-route" data-type="loved">' + ICON.heart + '<span>Loved Songs</span><span class="lrow-n">' + lovedCount + '</span>' + ICON.chev + '</button>' +
    '<button class="lrow" data-action="open-route" data-type="songs">' + ICON.note + '<span>Songs</span><span class="lrow-n">' + total + '</span>' + ICON.chev + '</button>' +
    '<button class="lrow" data-action="open-route" data-type="' + RouteType.Takes + '">' + ICON.studio + '<span>Studio Takes</span><span class="lrow-n">' + takeKeys().length + '</span>' + ICON.chev + '</button>' +
    '<button class="lrow" data-action="compose">' + ICON.spark + '<span>Compose New Album</span>' + ICON.chev + '</button></div>' +
    '<div class="sec-h">Recently Added</div><div class="agrid">' + albums.map(tileHTML).join('') + '</div>';
};
const renderSearch = () => {
  const body = $('#searchBody'), needle = query.trim().toLowerCase();
  if(!needle) {
    const take = playableAlbums().find(isTake);
    const tile = (key, genre, album) => '<button class="gtile" data-action="genre" data-g="' + key + '" style="background:linear-gradient(135deg,' + genre.grad[0] + ',' + genre.grad[1] + ')"><span>' + genre.label + '</span>' + (album ? '<img alt="" src="' + artFor(album).url + '">' : '') + '</button>';
    body.innerHTML = '<div class="sec-h">Browse Categories</div><div class="gtiles">' +
      (take ? tile(TAKE_KIND, STUDIO_GENRE, take) : '') +
      Object.keys(GENRES).map((key) => tile(key, GENRES[key], library.albums.find((candidate) => !isTake(candidate) && (candidate.genre === key)))).join('') + '</div>';
    return;
  } /* else -- a query to answer */
  const matches = (text) => text.toLowerCase().indexOf(needle) > -1;
  // a take also matches on its description
  const words = (album) => album.artist + ' ' + albumLabel(album) + (isTake(album) ? ' ' + album.prompt + ' ' + album.ingredients.join(' ') : '');
  const albums = playableAlbums().filter((album) => matches(album.title + ' ' + words(album)));
  const songs = [];
  library.albums.forEach((album) => keysOf(album).forEach((key, i) => { if(matches(album.tracks[i] + ' ' + words(album))) songs.push(key); }));
  contextKeys.search = songs;
  let html = '';
  if(albums.length > 0) html += '<div class="sec-h">Albums</div><div class="hscroll">' + albums.map(tileHTML).join('') + '</div>';
  if(songs.length > 0) html += '<div class="sec-h">Songs</div><div>' + songs.map((key) => rowHTML(key, 'search', RowStyle.Thumbnail)).join('') + '</div>';
  if(!html) html = '<div class="empty">No Results<div class="empty-sub">But you could make it. Compose a new album in Library, or describe it in the Studio and press it.</div></div>';
  body.innerHTML = html;
};
// what a detail page is called on the back button that returns to it
const routeLabel = (route) => {
  if(route.type === RouteType.Album) { const album = albumById(route.id); return album ? album.title : 'Back'; }
  return (route.type === RouteType.Loved) ? 'Loved Songs' : (route.type === RouteType.Takes) ? 'Studio Takes' : 'Songs';
};
const renderDetail = () => {
  const route = state.route, body = $('#detailBody'), scroll = $('#detailScroll');
  if(!route) return;
  $('#backLabel').textContent = (routeHistory.length > 0) ? routeLabel(routeHistory[routeHistory.length - 1]) : (TAB_LABEL[state.routeTab] || 'Back');
  if(route.type === RouteType.Album) {
    const album = albumById(route.id); if(!isPlayable(album)) { goBack(); return; }
    if(isTake(album)) { renderTakeDetail(album); return; }
    const art = artFor(album), keys = keysOf(album), context = 'album:' + album.id; contextKeys[context] = keys;
    const total = keys.reduce((sum, key) => sum + specOf(trackOf(key)).duration, 0);
    $('#detailNavTitle').textContent = album.title; $('#detailMore').classList.remove('hidden'); $('#detailMore').dataset.id = album.id;
    const bpms = keys.map((key) => specOf(trackOf(key)).bpm);
    body.innerHTML = '<div class="ahead"><img alt="" src="' + art.url + '"><div class="ah-info"><div class="ah-title">' + escapeHtml(album.title) + '</div><div class="ah-artist">' + escapeHtml(album.artist) + '</div><div class="ah-meta">' + GENRES[album.genre].label + ' · ' + (album.year || 2026) + ' · ' + Math.min(...bpms) + '–' + Math.max(...bpms) + ' BPM</div>' +
      '<div class="pills"><button class="pill" data-action="play-all" data-ctx="' + context + '">' + ICON.play + 'Play</button><button class="pill" data-action="shuffle-all" data-ctx="' + context + '">' + ICON.shuffle + 'Shuffle</button></div></div></div>' +
      '<div>' + keys.map((key) => rowHTML(key, context, RowStyle.Number)).join('') + '</div>' +
      '<div class="afoot">' + keys.length + ' songs, ' + Math.round(total / 60) + ' minutes<br>Seed “' + escapeHtml(album.seed) + '”. Composed live on this device. No audio files were harmed.</div>';
    scroll.dataset.th = 300;
  } else {
    const loved = (route.type === RouteType.Loved), pressed = (route.type === RouteType.Takes);
    const keys = loved ? library.loved.filter(trackOf) : pressed ? takeKeys() : library.albums.flatMap(keysOf);
    contextKeys[route.type] = keys;
    const title = loved ? 'Loved Songs' : pressed ? 'Studio Takes' : 'Songs';
    $('#detailNavTitle').textContent = title; $('#detailMore').classList.add('hidden');
    body.innerHTML = '<div class="lt-row"><h1 class="large-title">' + title + '</h1></div>' +
      ((keys.length > 0)
        ? '<div style="padding:0 16px 14px"><div class="pills" style="margin-top:8px"><button class="pill" data-action="play-all" data-ctx="' + route.type + '">' + ICON.play + 'Play</button><button class="pill" data-action="shuffle-all" data-ctx="' + route.type + '">' + ICON.shuffle + 'Shuffle</button></div></div>' +
          '<div>' + keys.map((key) => rowHTML(key, route.type, RowStyle.Thumbnail)).join('') + '</div>'
        : pressed
          ? '<div class="empty">No Studio Takes Yet<div class="empty-sub">Describe a song in the Studio and press it.</div></div>'
          : '<div class="empty">No Loved Songs Yet<div class="empty-sub">Tap the heart in Now Playing to love a song.</div></div>');
    scroll.dataset.th = 34;
  }
  updateNavSolid();
};
// a pressed take's page: its record, its one song, and the description it was pressed from
const renderTakeDetail = (take) => {
  const art = artFor(take), keys = keysOf(take), context = 'album:' + take.id; contextKeys[context] = keys;
  $('#detailNavTitle').textContent = take.title; $('#detailMore').classList.remove('hidden'); $('#detailMore').dataset.id = take.id;
  $('#detailBody').innerHTML = '<div class="ahead"><img alt="" src="' + art.url + '"><div class="ah-info"><div class="ah-title">' + escapeHtml(take.title) + '</div><div class="ah-artist">' + escapeHtml(take.artist) + '</div><div class="ah-meta">' + STUDIO_LABEL + ' Take · ' + take.year + ' · ' + MODEL_LABEL + '</div>' +
    '<div class="pills"><button class="pill" data-action="play-all" data-ctx="' + context + '">' + ICON.play + 'Play</button><button class="pill" data-action="press-again" data-id="' + take.id + '">' + ICON.remix + 'Press Again</button></div></div></div>' +
    '<div>' + keys.map((key) => rowHTML(key, context, RowStyle.Number)).join('') + '</div>' +
    '<div class="afoot">“' + escapeHtml(take.prompt) + '”' + (ingredientsHTML(take) || '<br>') + 'Pressed by ' + MODEL_LABEL + ' from this description. The song is an audio file in your Drive.</div>';
  $('#detailScroll').dataset.th = 300;
  updateNavSolid();
};

// -- Studio ----------------------------------------------------------------------
// a pressing take's progress: toward 90% over the time a press usually takes, then
// creeping on until it settles (the Platform reports no progress of its own)
const pressProgress = (take) => {
  const elapsed = Date.now() - waitStart(take);
  return (elapsed < PRESS_EXPECTED_MS) ? .9 * elapsed / PRESS_EXPECTED_MS : .9 + .08 * (1 - Math.exp(-(elapsed - PRESS_EXPECTED_MS) / 60000));
};
const RING_LENGTH = 2 * Math.PI * 27;
// which of a take's parts are still being made: its song, and its cover until it
// shows (asked for, pressing, or pressed and still being read)
const takeParts = (take) => {
  const song = (take.status === TakeStatus.Pressing), cover = take.cover;
  const coverWaiting = song ? (!cover || (cover.status === TakeStatus.Pressing)) : isCoverPressing(take);
  const coverReading = !!cover && (cover.status === TakeStatus.Ready) && !!cover.assetId && (coverArt[cover.assetId] === null);
  return { song, cover: coverWaiting || coverReading };
};
const isTakeAwaited = (take) => { const parts = takeParts(take); return parts.song || parts.cover; };
// when the wait a card shows began: the press, or a cover's own start once only the
// cover is left (a cover painted later starts long after its song)
const waitStart = (take) => takeParts(take).song ? take.startedAt : ((take.cover && take.cover.startedAt) || take.startedAt);
// what a take's card says while any part is still being made, and for how long
const pressStatus = (take) => {
  const parts = takeParts(take), elapsed = (Date.now() - waitStart(take)) / 1000;
  const doing = (parts.song && parts.cover) ? ((elapsed < 90) ? 'Pressing' : 'Still pressing') : parts.song ? 'Pressing the song' : 'Painting the cover';
  return doing + ' · ' + formatTime(elapsed);
};
// the record a take's card spins while any part is being made, inside its progress
// ring: a picture disc of its cover once the cover shows
const spinningDiscHTML = (take) => {
  const cover = generatedCover(take), art = artFor(take);
  return '<div class="take-disc"><span class="vinyl' + (cover ? ' picture' : '') + '" style="--label-color:' + hslColor(art.palette[2]) + (cover ? ';--picture:url(' + cover.url + ')' : '') + '"></span>' +
    '<svg class="take-ring" viewBox="0 0 58 58"><circle class="ring-bg" cx="29" cy="29" r="27"/><circle class="ring-fill" cx="29" cy="29" r="27" stroke-dasharray="' + RING_LENGTH + '" stroke-dashoffset="' + (RING_LENGTH * (1 - pressProgress(take))) + '"/></svg></div>';
};
// the ingredients a take was pressed with, as chips
const ingredientsHTML = (take) => (take.ingredients.length > 0) ? '<div class="ings">' + ingredientChipsHTML(take) + '</div>' : '';
const ingredientChipsHTML = (take) => take.ingredients.map((label) => '<span class="ing">' + escapeHtml(label) + '</span>').join('');
// one row of a card, held to one line (SEE: fitMarquees)
const marqueeHTML = (className, html) => '<div class="' + className + ' marquee"><span class="marquee-in">' + html + '</span></div>';
const takeCardHTML = (take) => {
  const title = naming.has(take.id) ? '<div class="take-t flaps" data-flap="' + take.id + '">' + flapsHTML(take.id) + '</div>' : marqueeHTML('take-t', escapeHtml(take.title));
  const label = hslColor(artFor(take).palette[2]), main = title + marqueeHTML('take-p', escapeHtml(take.prompt)) + ((take.ingredients.length > 0) ? marqueeHTML('ings', ingredientChipsHTML(take)) : '');
  if(take.status === TakeStatus.Pressing) {
    return '<div class="take pressing" data-id="' + take.id + '">' + spinningDiscHTML(take) +
      '<div class="take-main">' + main + marqueeHTML('take-s', '<span class="take-time">' + pressStatus(take) + '</span>') + '</div><span class="take-play-slot"></span></div>';
  } /* else -- settled */
  if(take.status === TakeStatus.Failed) {
    return '<div class="take failed"><div class="take-disc"><span class="vinyl" style="--label-color:' + label + '"></span></div><div class="take-main">' + main +
      '<div class="take-err">' + ICON.alert + marqueeHTML('take-err-t', FAILURE_LINE[take.failure]) + '</div>' +
      '<div class="take-acts">' + ((FINAL_FAILURES.indexOf(take.failure) > -1) ? '' : '<button data-action="retry-take" data-id="' + take.id + '">Try Again</button>') + '<button data-action="edit-take" data-id="' + take.id + '">Edit</button><button class="destructive" data-action="remove-take" data-id="' + take.id + '">Remove</button></div></div></div>';
  } /* else -- pressed */
  // pressed: it opens its page, and its round button plays it, though its cover may
  // still be on its way
  const key = take.id + ':0', playingTrack = current(), isCurrent = !!(playingTrack && (playingTrack.key === key)), spec = specOf(trackOf(key)), awaited = isTakeAwaited(take);
  return '<div class="take ready' + (awaited ? ' pressing' : '') + '" data-action="open-album" data-id="' + take.id + '">' +
    (awaited ? spinningDiscHTML(take) : '<div class="take-disc"><img alt="" src="' + artFor(take).url + '"></div>') +
    '<div class="take-main">' + main + marqueeHTML('take-s', awaited ? '<span class="take-time">' + pressStatus(take) + '</span>' : STUDIO_TAG + escapeHtml(take.artist) + (spec.duration > 0 ? ' · ' + durationText(spec) : '')) + '</div>' +
    '<button class="take-play" data-action="play-take" data-key="' + key + '" aria-label="Play">' + (isCurrent ? EQUALIZER : ICON.play) + '</button></div>';
};
// -- Split Flaps -----------------------------------------------------------------
// a take's title while it is named: a departure board's flaps cycling, then locking
// onto the name letter by letter, left to right
const FLAP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FLAP_COUNT = 12/*flaps while no name has come*/;
const FLAP_LOCK_MS = 55/*between one letter locking and the next*/;
const randomFlap = () => FLAP_LETTERS.charAt(Math.floor(Math.random() * FLAP_LETTERS.length));
const flapsHTML = (id) => {
  const entry = naming.get(id); if(!entry) return '';
  const target = entry.name ? entry.name.title.toUpperCase() : null/*not yet named*/;
  const length = target ? target.length : FLAP_COUNT, locked = target ? Math.floor((Date.now() - entry.lockedAt) / FLAP_LOCK_MS) : 0;
  let html = '';
  for(let i=0; i<length; i++) {
    const letter = (i < locked) ? target.charAt(i) : (target && (target.charAt(i) === ' ')) ? ' ' : randomFlap();
    // NOTE: the flaps are redrawn each turn: only the letter locked last flashes
    html += (letter === ' ') ? '<span class="flap gap"></span>' : '<span class="flap' + ((i < locked) ? ' set' : '') + ((i === (locked - 1)) ? ' fresh' : '') + '">' + escapeHtml(letter) + '</span>';
  }
  return html;
};
// turns each naming take's flaps; a name fully locked settles into the card's title,
// and a name that never comes gives way to the minted one
const turnFlaps = () => {
  if(naming.size < 1) return;
  naming.forEach((entry, id) => {
    const done = entry.name && ((Date.now() - entry.lockedAt) > ((entry.name.title.length + 6) * FLAP_LOCK_MS));
    if(done || (!entry.name && ((Date.now() - entry.startedAt) > NAMING_TIMEOUT_MS))) { naming.delete(id); renderStudio(); return; }
    $$('[data-flap="' + id + '"]').forEach((element) => { element.innerHTML = flapsHTML(id); });
  });
};

const renderStudio = () => {
  const all = takes();
  $('#studioBody').innerHTML = '<div class="sec-h">Your Takes</div>' + ((all.length > 0)
    ? '<div class="takes">' + all.map(takeCardHTML).join('') + '</div>'
    : '<div class="studio-empty">Nothing pressed yet. Describe a song above, or take an idea, add a few ingredients and press it. It lands here, and in your library, in about half a minute.</div>');
  fitMarquees($('#studioBody'));
  updateStudioTab();
};
// -- Marquee ---------------------------------------------------------------------
// each one-line row under `root` that its text overflows scrolls by exactly the
// overflow, at a reading pace, holding at least a second at each end
const MARQUEE_SPEED = 32/*px per second*/;
const MARQUEE_MIN_S = 6/*the shortest cycle: its holds are a fifth of it each*/;
const fitMarquees = (root) => {
  root.querySelectorAll('.marquee').forEach((line) => {
    const inner = line.firstElementChild; if(!inner || !line.clientWidth) return/*not laid out: refit when shown*/;
    const overflow = inner.offsetWidth - line.clientWidth;
    line.classList.toggle('scrolls', overflow > 1);
    if(overflow <= 1) return;
    line.style.setProperty('--marquee-shift', -overflow + 'px');
    line.style.setProperty('--marquee-duration', Math.max(MARQUEE_MIN_S, overflow / MARQUEE_SPEED / .3).toFixed(2) + 's'/*two travels: 60% of the cycle*/);
  });
};
// the Studio tab's mark while any take has a part still being made: its record
// spins and counts them
const updateStudioTab = () => {
  const count = takes().filter(isTakeAwaited).length, tab = $('#tabStudio');
  tab.classList.toggle('pressing', count > 0);
  let badge = $('.tab-badge', tab);
  if(count < 1) { if(badge) badge.remove(); return; }
  if(!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; tab.appendChild(badge); }
  badge.textContent = count;
};
// moves each pressing take's ring and clock on
const tickTakes = () => {
  if(!library) return;
  takes().filter(isTakeAwaited).forEach((take) => {
    const card = $('.take.pressing[data-id="' + take.id + '"]'); if(!card) return;
    $('.ring-fill', card).setAttribute('stroke-dashoffset', RING_LENGTH * (1 - pressProgress(take)));
    $('.take-time', card).textContent = pressStatus(take);
  });
};

const renderAll = () => {
  if(!library) return;
  renderHome(); renderLibrary(); renderStudio(); renderSearch();
  if(state.route) renderDetail();
  renderMini(); renderNowPlayingInfo();
};
// re-renders each track row whose current-track mark is out of date
const updateMarks = () => {
  const playingTrack = current(), key = playingTrack && playingTrack.key;
  $$('.trk').forEach((row) => {
    const shouldMark = (row.dataset.key === key); if(shouldMark === row.classList.contains('current')) return;
    const html = rowHTML(row.dataset.key, row.dataset.ctx, row.dataset.mode); if(html) row.outerHTML = html;
  });
};
// solidifies each page's nav bar once its large title scrolls under it
const updateNavSolid = () => {
  $$('.scroll').forEach((scroll) => { const nav = scroll.parentElement.querySelector('.nav'); if(nav) nav.classList.toggle('solid', scroll.scrollTop > (+scroll.dataset.th || 34)); });
};
$$('.scroll').forEach((scroll) => scroll.addEventListener('scroll', updateNavSolid, { passive: true }));

// -- Player Chrome ---------------------------------------------------------------
const renderMini = () => {
  const track = current(), mini = $('#mini');
  if(!track) { mini.classList.add('hidden-mini'); return; }
  mini.classList.remove('hidden-mini');
  const url = artFor(track.album).url; if($('#miniArt').getAttribute('src') !== url) $('#miniArt').src = url;
  $('#miniT').textContent = track.title; $('#miniA').textContent = track.album.artist;
};
const renderNowPlayingInfo = () => {
  const track = current();
  if(!track) { if(nowPlayingOpen) closeNowPlaying(); return; }
  const art = artFor(track.album), spec = specOf(track);
  if($('#npArt').getAttribute('src') !== art.url) $('#npArt').src = art.url;
  // a take is its own album: its line names the Studio rather than repeating its title
  $('#npT').textContent = track.title; $('#npA').textContent = track.album.artist + ' — ' + (isTake(track.album) ? STUDIO_LABEL + ' Take' : track.album.title);
  const loved = isLoved(track.key), loveButton = $('#npLove'); loveButton.innerHTML = loved ? ICON.heart : ICON.heartO; loveButton.classList.toggle('on', loved);
  currentPalette = art.palette;
  const take = isTakeSpec(spec); nowPlaying.classList.toggle('studio', take);
  nowPlaying.classList.toggle('device-volume', take && !Engine.takeVolume())/*the device's buttons set it*/;
  $('#scoreCap').textContent = take ? STUDIO_LABEL + ' Take · ' + MODEL_LABEL : 'Live Score · ' + spec.bpm + ' BPM · ' + NOTE_NAMES[spec.root % 12] + ' ' + spec.genre.mode;
  if(state.mode === PlayerMode.Queue) renderQueue();
};
const updatePlayUI = () => {
  const playing = Engine.isPlaying();
  document.body.classList.toggle('is-paused', !playing);
  nowPlaying.classList.toggle('paused', !playing);
  $('#miniPlay').innerHTML = playing ? ICON.pause : ICON.play;
  $('#npPlay').innerHTML = playing ? ICON.pause : ICON.play;
  try { if(navigator.mediaSession) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch(error) { /*no Media Session: the lock screen shows nothing*/ }
  setMediaPosition();
};
const onTrackChange = () => { renderMini(); renderNowPlayingInfo(); updateMarks(); if(library) renderStudio(); setMediaMetadata(); updatePlayUI(); };

// == Playback ====================================================================
// loads the current track at `position`, playing it when `autoplay`
const startCurrent = (position, autoplay) => {
  const track = current(); if(!track) { Engine.pause(); onTrackChange(); return; }
  Engine.load(specOf(track), position || 0);
  if(autoplay) Engine.play(position || 0);
  state.pos = position || 0;
  state.recent = [track.album.id].concat(state.recent.filter((id) => id !== track.album.id)).slice(0, 10);
  if(!app.classList.contains('detail-open') && (state.tab === Tab.Home)) renderHome();
  onTrackChange(); saveState();
};
// queues list `context` from `key` (absent: its first track), shuffled when `shuffle`
const playContext = (context, key, shuffle) => {
  let keys = (contextKeys[context] || (key ? [key] : [])).slice(); if(keys.length < 1) return;
  let index = key ? Math.max(0, keys.indexOf(key)) : 0;
  state.shuffle = !!shuffle; state.orig = null/*not shuffled*/;
  if(shuffle) { state.orig = keys.slice(); keys = shuffleArray(keys); index = 0; }
  state.queue = keys; state.qi = index;
  startCurrent(0, true);
};
const togglePlay = () => {
  const track = current(); if(!track) return;
  if(Engine.isPlaying()) { Engine.pause(); saveState(); }
  else {
    const spec = specOf(track); let position = Engine.position(); if((spec.duration > 0) && (position >= (spec.duration - .2))) position = 0;
    Engine.play(position);
  }
  updatePlayUI();
};
// moves to the next track; `auto` when the current one ended on its own
const nextTrack = (auto) => {
  if(state.queue.length < 1) return;
  if(auto && (state.repeat === Repeat.One)) { startCurrent(0, true); return; }
  if(state.qi < (state.queue.length - 1)) { state.qi++; startCurrent(0, true); }
  else if(state.repeat === Repeat.All) { state.qi = 0; startCurrent(0, true); }
  else if(auto) { state.qi = 0; startCurrent(0, false); }
  else { state.qi = 0; startCurrent(0, Engine.isPlaying()); }
};
// restarts the track, or moves to the previous one within its first three seconds
const previousTrack = () => {
  if(!current()) return;
  if((Engine.position() > 3) || (state.qi === 0)) { Engine.seek(0); return; }
  const wasPlaying = Engine.isPlaying(); state.qi--; startCurrent(0, wasPlaying);
};
Engine.onended = () => nextTrack(true);
Engine.source = (spec) => takeUrl(spec.assetId);
Engine.onerror = (error) => { toast('Could not play: ' + messageOf(error)); updatePlayUI(); };
Engine.onstopped = () => { updatePlayUI(); saveState(); };
// records a take's length the first time a play measures it, so every row shows it
Engine.onduration = (spec) => {
  setMediaPosition();
  const take = library && library.albums.find((album) => isTake(album) && (album.assetId === spec.assetId));
  if(take && !(take.seconds > 0)) changeTake(take.id, { seconds: Math.round(spec.duration * 10) / 10 });
};
const playNext = (key) => {
  if(!current()) { state.queue = [key]; state.qi = 0; startCurrent(0, true); return; }
  state.queue.splice(state.qi + 1, 0, key); if(state.orig) state.orig.push(key);
  saveState(); if(state.mode === PlayerMode.Queue) renderQueue(); toast('Playing Next');
};
const toggleShuffle = () => {
  const currentKey = state.queue[state.qi]; if(!currentKey) return;
  if(!state.shuffle) {
    state.orig = state.queue.slice();
    const rest = state.queue.filter((_, i) => i !== state.qi);
    state.queue = [currentKey].concat(shuffleArray(rest)); state.qi = 0; state.shuffle = true;
  } else {
    if(state.orig) { state.queue = state.orig; state.qi = Math.max(0, state.queue.indexOf(currentKey)); }
    state.orig = null/*not shuffled*/; state.shuffle = false;
  }
  renderQueue(); saveState();
};
const cycleRepeat = () => {
  state.repeat = (state.repeat === Repeat.Off) ? Repeat.All : (state.repeat === Repeat.All) ? Repeat.One : Repeat.Off;
  renderQueue(); saveState();
};

// == Library Changes =============================================================
// each change shows once the app-content holds it
const toggleLove = async (key) => {
  const loving = !isLoved(key);
  const saved = await updateLibrary((data) => {
    const others = data.loved.filter((loved) => loved !== key);
    return { ...data, loved: loving ? [key, ...others] : others };
  });
  if(saved && loving) toast('Loved');
};
const composeAlbum = async () => {
  const album = newAlbum();
  if(!await updateLibrary((data) => ({ ...data, albums: [album, ...data.albums] }))) return;
  openRouteWhenShown({ type: RouteType.Album, id: album.id });
  toast('Composed “' + album.title + '”');
};
// gives the album a new seed: the same titles with all-new music
const remixAlbum = async (id) => {
  if(!albumById(id)) return;
  const seed = randomId() + randomId();
  const saved = await updateLibrary((data) => ({ ...data, albums: data.albums.map((album) => (album.id === id) ? { ...album, seed } : album) }));
  if(saved) toast('Remixed: same titles, all-new music');
};
// removes an album from the library after the User confirms; a take's file stays in
// their Drive. `confirmed` skips the question (a failed take holds nothing to lose)
const deleteAlbum = async (id, confirmed) => {
  const album = albumById(id); if(!album) return;
  if(!confirmed) {
    confirmed = isTake(album)
      ? await confirmAlert('Remove “' + album.title + '”?', 'It leaves your library. The song itself stays in your Drive.', 'Remove')
      : await confirmAlert('Delete “' + album.title + '”?', 'It will be gone forever. Its seed will never be heard again.', 'Delete');
  } /* else -- confirmed by the caller */
  if(!confirmed) return;
  const prefix = id + ':', inAlbum = (key) => key.indexOf(prefix) === 0, currentKey = state.queue[state.qi];
  state.recent = state.recent.filter((albumId) => albumId !== id);
  state.queue = state.queue.filter((key) => !inAlbum(key));
  if(state.orig) state.orig = state.orig.filter((key) => !inAlbum(key));
  if(state.route && (state.route.type === RouteType.Album) && (state.route.id === id)) goBack();
  if(currentKey && inAlbum(currentKey)) {
    Engine.pause(); state.qi = 0;
    if(state.queue.length > 0) startCurrent(0, false);
    else { closeNowPlaying(); onTrackChange(); }
  } else state.qi = Math.max(0, state.queue.indexOf(currentKey));
  saveState(); renderAll();
  await updateLibrary((data) => ({ ...data, albums: data.albums.filter((candidate) => candidate.id !== id), loved: data.loved.filter((key) => !inAlbum(key)) }));
};

// == Studio Booth ================================================================
// the description field types out one idea after another while it is empty; the
// ingredients picked ride along with whatever is pressed
const promptField = $('#prompt');
const picked = new Set();
let ideaIndex = Math.floor(Math.random() * IDEAS.length), ideaShown = 0/*characters typed*/, ideaTimer = null/*not typing*/, pressingDescription = false;
const typeIdea = () => {
  let delay = 34;
  if(ideaShown < IDEAS[ideaIndex].length) { ideaShown++; if(ideaShown === IDEAS[ideaIndex].length) delay = 2800/*the whole idea stands to be read*/; }
  else { ideaIndex = (ideaIndex + 1) % IDEAS.length; ideaShown = 1/*the next idea begins typing at once*/; }
  // NOTE: the shown idea stops while another tab is in front: it resumes where it was
  if(state.tab === Tab.Studio) promptField.placeholder = (ideaShown > 0) ? IDEAS[ideaIndex].slice(0, ideaShown) + ((ideaShown < IDEAS[ideaIndex].length) ? '▍' : '') : '';
  ideaTimer = setTimeout(typeIdea, delay);
};
// the idea being shown, whole
const shownIdea = () => (ideaShown > 0) ? IDEAS[ideaIndex] : IDEAS[(ideaIndex + IDEAS.length - 1) % IDEAS.length];
const useIdea = () => { promptField.value = shownIdea(); updatePressLabel(); promptField.focus(); };
const nextIdea = () => { ideaIndex = (ideaIndex + 1) % IDEAS.length; ideaShown = IDEAS[ideaIndex].length; promptField.placeholder = IDEAS[ideaIndex]; clearTimeout(ideaTimer); ideaTimer = (document.activeElement === promptField) ? (holdIdeas(), null) : setTimeout(typeIdea, 2800)/*the idea asked for stands whole first*/; };
// the ideas type only into an empty field the User is not in: focusing it or
// writing in it clears the idea, and an empty field left types the next idea in from
// its first letter
const IDEA_RESUME_MS = 400;
const holdIdeas = () => { clearTimeout(ideaTimer); ideaTimer = null/*not typing*/; ideaShown = IDEAS[ideaIndex].length; promptField.placeholder = ''; };
const resumeIdeas = () => {
  if(ideaTimer || promptField.value || (document.activeElement === promptField)) return;
  promptField.placeholder = ''; ideaTimer = setTimeout(typeIdea, IDEA_RESUME_MS);
};
promptField.addEventListener('focus', holdIdeas);
promptField.addEventListener('blur', resumeIdeas);
// puts a take's words and ingredients back in the booth to change and press again
const editDescription = (take) => {
  switchTab(Tab.Studio); promptField.value = take.prompt;
  picked.clear(); take.ingredients.forEach((label) => { const index = INGREDIENTS.findIndex((ingredient) => ingredient.label === label); if(index > -1) picked.add(index); });
  renderChips(); $('#tab-studio .scroll').scrollTo({ top: 0, behavior: 'smooth' }); promptField.focus();
};

// says on the press what it will press: the description written, or else the idea
// shown, with the ingredients picked
const updatePressLabel = () => {
  const count = picked.size;
  $('#pressSub').textContent = (promptField.value.trim() ? 'Your description' : 'The idea above') + ((count > 0) ? ' + ' + count + ' ingredient' + ((count > 1) ? 's' : '') : '');
};
const renderChips = () => {
  $('#chips').innerHTML = INGREDIENTS.map((ingredient, i) => '<button class="chip' + (picked.has(i) ? ' on' : '') + '" data-action="chip" data-i="' + i + '">' + escapeHtml(ingredient.label) + '</button>').join('');
  updatePressLabel();
};
// picks or drops ingredient `index`, dropping the others of its group
const toggleIngredient = (index) => {
  const ingredient = INGREDIENTS[index]; if(!ingredient) return;
  if(picked.has(index)) picked.delete(index);
  else {
    if(ingredient.group) INGREDIENTS.forEach((other, i) => { if(other.group === ingredient.group) picked.delete(i); });
    picked.add(index);
  }
  renderChips();
};
// presses what the field says (the idea shown when it says nothing) with the
// ingredients picked, then clears the booth for the next one
const pressDescription = async () => {
  if(pressingDescription) return;
  const written = promptField.value.trim(), prompt = written || shownIdea();
  const ingredients = Array.from(picked).sort((a, b) => a - b).map((i) => INGREDIENTS[i].label);
  pressingDescription = true; $('#pressBtn').disabled = true; promptField.blur();
  const kept = new Set(picked);
  try {
    promptField.value = ''; picked.clear(); renderChips(); resumeIdeas();
    if(await pressTake(prompt, ingredients)) return;
    // not added: the booth holds the description again to retry
    promptField.value = written; kept.forEach((i) => picked.add(i)); renderChips();
  } finally { pressingDescription = false; $('#pressBtn').disabled = false; }
};

// == Navigation ==================================================================
// slides the tab bar's highlight under the selected tab
const placeIndicator = () => {
  const tab = $('.tab.on'), indicator = $('#tabInd'); if(!tab) return;
  indicator.style.left = tab.offsetLeft + 'px'; indicator.style.width = tab.offsetWidth + 'px';
  indicator.style.top = tab.offsetTop + 'px'; indicator.style.height = tab.offsetHeight + 'px';
};
// selects a tab; the selected tab again closes its detail page or scrolls it to the top
const switchTab = (tab) => {
  if(!TAB_LABEL[tab]) tab = Tab.Home;
  if(state.tab === tab) {
    if(app.classList.contains('detail-open')) closeDetail();
    else { const scroll = $('#tab-' + tab + ' .scroll'); if(scroll) scroll.scrollTo({ top: 0, behavior: 'smooth' }); }
    return;
  } /* else -- another tab */
  state.tab = tab;
  if(app.classList.contains('detail-open')) {
    // NOTE: the detail page closes without its slide: reading offsetHeight commits
    //       the transition-less state before the transition is restored
    detail.style.transition = 'none'; app.classList.remove('detail-open'); state.route = null/*no detail page open*/; routeHistory = []; void detail.offsetHeight; detail.style.transition = '';
  } /* else -- no detail page to close */
  $$('.tabpane').forEach((pane) => pane.classList.toggle('on', pane.id === ('tab-' + tab)));
  $$('.tab').forEach((button) => button.classList.toggle('on', button.dataset.t === tab));
  placeIndicator(); updateNavSolid(); saveState();
};
// the detail pages beneath the one open, the nearest last: a page opened from a
// detail page (an album from a list of songs) returns to it. Not saved: a relaunch
// returns to the tab
let routeHistory = [];
const openRoute = (route) => {
  const fromDetail = app.classList.contains('detail-open') && !!state.route;
  routeHistory = fromDetail ? routeHistory.concat([state.route]) : [];
  if(!fromDetail) state.routeTab = state.tab;
  state.route = route;
  renderDetail();
  $('#detailScroll').scrollTop = 0;
  app.classList.add('detail-open');
  updateNavSolid(); saveState();
};
// returns to the detail page beneath the open one, or to the tab
const goBack = () => {
  if(routeHistory.length < 1) { closeDetail(); return; }
  state.route = routeHistory.pop();
  renderDetail(); $('#detailScroll').scrollTop = 0;
  updateNavSolid(); saveState();
};
// opens an album's page once the album is shown (a just-composed one arrives with its write)
const openRouteWhenShown = (route) => { if(albumById(route.id)) openRoute(route); else pendingRoute = route; };
// closes every detail page, returning to the tab
const closeDetail = () => { app.classList.remove('detail-open'); state.route = null/*no detail page open*/; routeHistory = []; saveState(); };

// == Now Playing =================================================================
// sizes the cover to the largest square the stage holds
const layoutNowPlaying = () => {
  const stage = $('#npStage'), size = Math.min(stage.clientWidth, stage.clientHeight);
  nowPlaying.style.setProperty('--art', Math.max(120, size) + 'px');
};
const openNowPlaying = () => {
  if(!current()) return;
  nowPlayingOpen = true; renderNowPlayingInfo(); setModeClasses();
  nowPlaying.classList.add('open'); app.classList.add('behind');
  requestAnimationFrame(layoutNowPlaying);
};
const closeNowPlaying = () => { nowPlayingOpen = false; nowPlaying.classList.remove('open'); app.classList.remove('behind'); nowPlaying.style.transform = ''; };
const setModeClasses = () => {
  nowPlaying.classList.toggle('mode-score', state.mode === PlayerMode.Score); nowPlaying.classList.toggle('mode-queue', state.mode === PlayerMode.Queue);
  $('#modeScore').classList.toggle('on', state.mode === PlayerMode.Score); $('#modeQueue').classList.toggle('on', state.mode === PlayerMode.Queue);
  if(state.mode === PlayerMode.Queue) renderQueue();
};
// shows `mode` on the stage; the mode shown again returns to the cover
const setMode = (mode) => { state.mode = (state.mode === mode) ? PlayerMode.Art : mode; setModeClasses(); saveState(); };
const renderQueue = () => {
  const playingTrack = current(), element = $('#npQueue'); if(!playingTrack) return;
  const upcoming = state.queue.slice(state.qi + 1);
  element.innerHTML = '<div class="q-head"><div><div class="q-title">Playing Next</div><div class="q-sub">' + ((upcoming.length > 0) ? upcoming.length + ' song' + ((upcoming.length > 1) ? 's' : '') : 'End of queue') + '</div></div>' +
    '<div class="q-toggles"><button class="q-tog' + (state.shuffle ? ' on' : '') + '" data-action="toggle-shuffle" aria-label="Shuffle">' + ICON.shuffle + '</button>' +
    '<button class="q-tog' + ((state.repeat !== Repeat.Off) ? ' on' : '') + '" data-action="cycle-repeat" aria-label="Repeat">' + ((state.repeat === Repeat.One) ? ICON.repeat1 : ICON.repeat) + '</button></div></div>' +
    ((upcoming.length > 0)
      ? upcoming.map((key, i) => {
          const track = trackOf(key); if(!track) return '';
          return '<button class="q-row" data-action="jump" data-i="' + (state.qi + 1 + i) + '"><img alt="" src="' + artFor(track.album).url + '"><div class="q-txt"><div class="q-t">' + escapeHtml(track.title) + '</div><div class="q-a">' + escapeHtml(track.album.artist) + '</div></div><span class="q-d">' + durationText(specOf(track)) + '</span></button>';
        }).join('')
      : '<div class="q-empty">Nothing up next.<br>' + ((state.repeat === Repeat.All) ? 'The queue will start over.' : 'Tap repeat to loop forever, or compose another album.') + '</div>');
};

// -- Background ------------------------------------------------------------------
const backgroundPaint = $('#npBg').getContext('2d');
// drifting blobs of the cover's palette that swell with the music's energy
const drawBackground = (time, energy) => {
  const canvas = $('#npBg'), paint = backgroundPaint, W = canvas.width, H = canvas.height, palette = currentPalette || [[260, 40, 30], [320, 60, 40], [200, 60, 40]];
  paint.fillStyle = hslColor(palette[0], 16); paint.fillRect(0, 0, W, H);
  for(let i=0; i<5; i++) {
    const hsl = palette[i % palette.length], lightness = clamp(hsl[2], 30, 55);
    const x = W * (.5 + .45 * Math.sin(time * .00011 * (i + 1) + i * 2.3)), y = H * (.5 + .42 * Math.cos(time * .00009 * (i + 1.7) + i * 1.1));
    const radius = W * (.75 + .2 * Math.sin(time * .0004 + i)) * (1 + energy * .55);
    const blob = paint.createRadialGradient(x, y, 0, x, y, radius); blob.addColorStop(0, hslColor(hsl, lightness, .95)); blob.addColorStop(1, hslColor(hsl, lightness, 0));
    paint.fillStyle = blob; paint.fillRect(0, 0, W, H);
  }
  paint.fillStyle = 'rgba(0,0,0,.38)'; paint.fillRect(0, 0, W, H);
};

// -- Live Score ------------------------------------------------------------------
// each part's color on the score
const PART_COLOR = { pad: '#9BB8FF', keys: '#FFD60A', lead: '#FF5E7E', arp: '#C77DFF', bass: '#5AC8FA', kick: '#FFFFFF', snare: '#FF9F0A', clap: '#FF9F0A', hat: 'rgba(255,255,255,.55)', ohat: 'rgba(255,255,255,.7)' };
const roundedRect = (paint, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  paint.beginPath(); paint.moveTo(x + radius, y);
  paint.arcTo(x + w, y, x + w, y + h, radius); paint.arcTo(x + w, y + h, x, y + h, radius); paint.arcTo(x, y + h, x, y, radius); paint.arcTo(x, y, x + w, y, radius);
  paint.closePath();
};
// a scrolling piano roll of the track around `position`: pitched notes as bars, drum
// hits as dots below, the playhead fixed a third of the way in
const drawScore = (spec, position) => {
  const canvas = $('#score'), dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight; if(!W || !H) return;
  if((canvas.width !== Math.round(W * dpr)) || (canvas.height !== Math.round(H * dpr))) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const paint = canvas.getContext('2d'); paint.setTransform(dpr, 0, 0, dpr, 0, 0); paint.clearRect(0, 0, W, H);
  const past = 1.6, future = 3.4, pxPerSecond = W / (past + future), playheadX = past * pxPerSecond;
  const top = 34, drumH = 26, rollH = H - top - drumH - 8, low = 30, high = 90, rowH = Math.max(3, rollH / (high - low) * 1.15);
  const yOf = (midi) => top + (1 - (clamp(midi, low, high) - low) / (high - low)) * rollH;
  const beat = spec.stepDur * 4;
  for(let b = Math.floor((position - past) / beat); (b * beat) < (position + future); b++) {
    if(b < 0) continue;
    const beatX = playheadX + (b * beat - position) * pxPerSecond;
    paint.fillStyle = ((b % 4) === 0) ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; paint.fillRect(beatX, top - 6, 1, H - top);
  }
  const firstStep = Math.max(0, Math.floor((position - past) / spec.stepDur) - spec.bpc * 16), lastStep = Math.min(spec.totalSteps - 1, Math.ceil((position + future) / spec.stepDur));
  for(let s=firstStep; s<=lastStep; s++) {
    const stepTime = s * spec.stepDur;
    for(const event of stepEvents(spec, s)) {
      const eventTime = stepTime + event.o, x = playheadX + (eventTime - position) * pxPerSecond;
      if((event.i === 'crackle') || (event.v < .02)) continue;
      if(event.m == null) {
        // a drum hit: hats, snare/clap, kick in lanes from the top
        if((x < -4) || (x > (W + 4))) continue;
        const lane = (event.i === 'kick') ? 2 : ((event.i === 'hat') || (event.i === 'ohat')) ? 0 : 1;
        const hit = (position >= eventTime) && (position < (eventTime + .12));
        paint.globalAlpha = hit ? 1 : ((eventTime > position) ? .7 : .3); paint.fillStyle = PART_COLOR[event.i] || '#fff';
        paint.beginPath(); paint.arc(x, H - drumH + 4 + lane * 8, (hit ? 3.6 : 2.2) * (.6 + event.v * .5), 0, Math.PI * 2); paint.fill();
        continue;
      } /* else -- a pitched note */
      const length = (event.d || 1) * spec.stepDur, w = Math.max(3, length * pxPerSecond - 1.5);
      if(((x + w) < 0) || (x > W)) continue;
      const active = (position >= eventTime) && (position < (eventTime + length)), partColor = PART_COLOR[event.i] || '#fff';
      paint.globalAlpha = (event.v * .5 + .5) * (active ? 1 : ((eventTime > position) ? .8 : .32));
      paint.fillStyle = partColor; paint.shadowColor = partColor; paint.shadowBlur = active ? 14 : 0;
      roundedRect(paint, x, yOf(event.m) - rowH / 2, w, rowH, rowH / 2); paint.fill();
    }
  }
  paint.shadowBlur = 0; paint.globalAlpha = 1;
  const playhead = paint.createLinearGradient(0, 0, 0, H); playhead.addColorStop(0, 'rgba(255,255,255,0)'); playhead.addColorStop(.2, 'rgba(255,255,255,.9)'); playhead.addColorStop(1, 'rgba(255,255,255,.4)');
  paint.fillStyle = playhead; paint.fillRect(playheadX - 1, top - 10, 2, H - top + 10);
  paint.font = '600 10px -apple-system,system-ui,sans-serif'; paint.textAlign = 'right';
  const legend = [['bass', 'Bass'], ['pad', 'Pad'], ['keys', 'Keys'], ['arp', 'Arp'], ['lead', 'Lead']].filter((entry) => (entry[0] === 'bass') || spec.genre.voices[entry[0]]);
  let legendX = W - 12;
  for(let k=legend.length - 1; k>=0; k--) {
    paint.fillStyle = 'rgba(255,255,255,.7)'; paint.fillText(legend[k][1], legendX, 20);
    const textWidth = paint.measureText(legend[k][1]).width;
    paint.fillStyle = PART_COLOR[legend[k][0]]; paint.beginPath(); paint.arc(legendX - textWidth - 6, 16.5, 3, 0, Math.PI * 2); paint.fill();
    legendX -= textWidth + 18;
  }
};

// -- Afterglow -------------------------------------------------------------------
// a take has no score to show: it plays as light instead, in its cover's colors. A
// core of light beats at the centre, its waveform rings the core, its spectrum flares
// around it as a mirrored corona, and each kick throws a shockwave and sparks. Every frame keeps the last one zoomed, turned and
// faded, so the light streams outward
const GLOW_RAYS = 64/*per side: the corona is mirrored left and right*/;
const GLOW_SPARKS = 160/*the most sparks in flight*/;
const GLOW_TRAIL_SCALE = .5/*the trail's resolution: its softness is the glow*/;
const glow = { trail: null, spare: null, peaks: new Float32Array(GLOW_RAYS), sparks: [], waves: [], colors: null, palette: null, bass: 0, mids: 0, highs: 0, slowBass: 0, beatAt: 0, spin: 0, swing: 0, last: 0 };
// a canvas of `w` x `h`, (re)sized only when it changes
const sizedCanvas = (canvas, w, h) => {
  const sized = canvas || document.createElement('canvas');
  if((sized.width !== w) || (sized.height !== h)) { sized.width = w; sized.height = h; }
  return sized;
};
// each ray's color: the palette's hues swept across the corona, lifted bright
const glowColors = (palette) => {
  const colors = [];
  for(let i=0; i<GLOW_RAYS; i++) {
    const t = i / (GLOW_RAYS - 1) * (palette.length - 1), from = palette[Math.floor(t)], to = palette[Math.min(palette.length - 1, Math.floor(t) + 1)], mix = t - Math.floor(t);
    let delta = to[0] - from[0]; if(delta > 180) delta -= 360; else if(delta < -180) delta += 360;
    colors.push(hslColor([from[0] + delta * mix, Math.max(80, from[1]), 0], 58));
  }
  return colors;
};
const drawAfterglow = (time, playing) => {
  const canvas = $('#score'), dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight; if(!W || !H) return;
  if((canvas.width !== Math.round(W * dpr)) || (canvas.height !== Math.round(H * dpr))) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const dt = Math.min(.05, Math.max(.001, (time - (glow.last || time)) / 1000)) || (1 / 60); glow.last = time;
  const palette = currentPalette || [[260, 40, 30], [320, 60, 40], [200, 60, 40]];
  if(glow.palette !== palette) { glow.palette = palette; glow.colors = glowColors(palette); }
  const spectrum = Engine.spectrum(), waveform = Engine.waveform();
  const S = Math.min(W, H), cx = W / 2, cy = H / 2 + 8, core = S * .19, reach = S * .27;

  // the bass, and a kick wherever it jumps clear of its own recent level
  let low = 0; if(spectrum) { for(let i=1; i<=6; i++) low += spectrum[i]; low /= 6 * 255; }
  if(!playing) low = 0;
  glow.bass += (low - glow.bass) * ((low > glow.bass) ? .6 : .15);
  glow.slowBass += (low - glow.slowBass) * Math.min(1, dt * 2.5);
  const kick = playing && (low > (glow.slowBass * 1.18 + .06)) && ((time - glow.beatAt) > 200);
  if(kick) {
    glow.beatAt = time;
    glow.waves.push({ radius: core, life: 1 });
    for(let k=0; (k < 18) && (glow.sparks.length < GLOW_SPARKS); k++) {
      const angle = Math.random() * Math.PI * 2, speed = S * (.35 + Math.random() * .7);
      glow.sparks.push({ x: cx + Math.cos(angle) * core, y: cy + Math.sin(angle) * core, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: glow.colors[Math.floor(Math.random() * GLOW_RAYS)] });
    }
  }
  glow.spin += dt * (playing ? (.45 + glow.bass * 1.6) : 0);
  glow.swing += dt * (playing ? .12 : 0);

  // the trail: the last frame zoomed out from the centre, turned and faded, at half
  // resolution so it blurs into a glow
  const tw = Math.round(W * dpr * GLOW_TRAIL_SCALE), th = Math.round(H * dpr * GLOW_TRAIL_SCALE), ts = tw / W;
  glow.trail = sizedCanvas(glow.trail, tw, th); glow.spare = sizedCanvas(glow.spare, tw, th);
  const spare = glow.spare.getContext('2d'), zoom = Math.pow(2.2 + glow.bass * 4, dt), turn = dt * (.18 + glow.bass * .5) * Math.sin(glow.swing);
  spare.setTransform(1, 0, 0, 1, 0, 0); spare.clearRect(0, 0, tw, th);
  spare.globalAlpha = Math.pow(playing ? .86 : .8, dt * 60);
  spare.translate(cx * ts, cy * ts); spare.rotate(turn); spare.scale(zoom, zoom); spare.translate(-cx * ts, -cy * ts);
  spare.drawImage(glow.trail, 0, 0);
  spare.setTransform(ts, 0, 0, ts, 0, 0); spare.globalAlpha = 1; spare.globalCompositeOperation = 'lighter';
  [glow.trail, glow.spare] = [glow.spare, glow.trail];

  // the corona: each band a ray, lows at the top, mirrored; its peak a moment longer
  const rays = [];
  for(let i=0; i<GLOW_RAYS; i++) {
    const band = (spectrum && playing) ? spectrum[Math.min(spectrum.length - 1, Math.floor(Math.pow(i / GLOW_RAYS, 1.7) * spectrum.length * .62) + 1)] / 255 : 0;
    const level = Math.pow(band, 1.4);
    glow.peaks[i] = Math.max(level, glow.peaks[i] - dt * .9);
    rays.push(level);
  }
  const corona = (paint, width, alpha, lengthOf) => {
    paint.lineCap = 'round'; paint.lineWidth = width;
    for(let i=0; i<GLOW_RAYS; i++) {
      const length = lengthOf(i); if(length < .5) continue;
      paint.strokeStyle = glow.colors[i]; paint.globalAlpha = alpha * (.35 + rays[i] * .65);
      for(const side of [1, -1]) {
        const angle = -Math.PI / 2 + side * (i + .5) / GLOW_RAYS * Math.PI + glow.spin * .08, inner = core * (1.12 + glow.bass * .08);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        paint.beginPath(); paint.moveTo(cx + cos * inner, cy + sin * inner); paint.lineTo(cx + cos * (inner + length), cy + sin * (inner + length)); paint.stroke();
      }
    }
    paint.globalAlpha = 1;
  };
  corona(spare, 3, .3, (i) => rays[i] * reach * 1.05);

  // the waveform as a ring about the record, drawn into the trail too so it swirls
  const ring = (paint, width, alpha) => {
    // NOTE: the core is drawn over it, so only the waveform's outward swings show
    if(!waveform) return;
    const points = 120, step = Math.floor(waveform.length / points);
    paint.beginPath();
    for(let p=0; p<=points; p++) {
      const sample = playing ? (waveform[(p % points) * step] - 128) / 128 : 0, angle = p / points * Math.PI * 2 - glow.spin * .3;
      const radius = core * (1.04 + glow.bass * .08) + sample * core * .4;
      if(p === 0) paint.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); else paint.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    }
    paint.lineWidth = width; paint.strokeStyle = glow.colors[GLOW_RAYS - 1]; paint.globalAlpha = alpha; paint.stroke(); paint.globalAlpha = 1;
  };
  ring(spare, 1.5, .2);

  // shockwaves and sparks live only in the trail, where they streak
  glow.waves = glow.waves.filter((wave) => {
    wave.radius += dt * S * 1.1; wave.life -= dt * 1.6; if(wave.life <= 0) return false;
    spare.globalAlpha = wave.life * .45; spare.strokeStyle = glow.colors[Math.floor(GLOW_RAYS * .2)]; spare.lineWidth = 1 + wave.life * 2.5;
    spare.beginPath(); spare.arc(cx, cy, wave.radius, 0, Math.PI * 2); spare.stroke();
    return true;
  });
  glow.sparks = glow.sparks.filter((spark) => {
    spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vx *= Math.pow(.4, dt); spark.vy *= Math.pow(.4, dt); spark.life -= dt * .9;
    if((spark.life <= 0) || (spark.x < 0) || (spark.y < 0) || (spark.x > W) || (spark.y > H)) return false;
    spare.globalAlpha = spark.life; spare.fillStyle = spark.color; spare.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
    return true;
  });
  spare.globalAlpha = 1; spare.globalCompositeOperation = 'source-over';
  // NOTE: `spare` and `glow.trail` name the same canvas after the swap above

  // the frame: the trail, then the crisp corona, its peaks, the ring and the core
  const paint = canvas.getContext('2d'); paint.setTransform(dpr, 0, 0, dpr, 0, 0); paint.clearRect(0, 0, W, H);
  const stage = paint.createRadialGradient(cx, cy, core, cx, cy, S * .75);
  stage.addColorStop(0, hslColor(palette[0], 6, .9)); stage.addColorStop(1, 'rgba(0,0,0,.82)');
  paint.fillStyle = stage; paint.fillRect(0, 0, W, H);
  paint.imageSmoothingEnabled = true; paint.globalCompositeOperation = 'lighter'; paint.drawImage(glow.trail, 0, 0, W, H);
  corona(paint, 1.6, .85, (i) => rays[i] * reach);
  paint.fillStyle = '#fff';
  for(let i=0; i<GLOW_RAYS; i++) {
    if(glow.peaks[i] < .04) continue;
    paint.globalAlpha = Math.min(1, glow.peaks[i] * 1.4);
    for(const side of [1, -1]) {
      const angle = -Math.PI / 2 + side * (i + .5) / GLOW_RAYS * Math.PI + glow.spin * .08, radius = core * (1.12 + glow.bass * .08) + glow.peaks[i] * reach + 4;
      paint.fillRect(cx + Math.cos(angle) * radius - 1, cy + Math.sin(angle) * radius - 1, 2, 2);
    }
  }
  paint.globalAlpha = 1;
  ring(paint, 2, .9);
  paint.globalCompositeOperation = 'source-over';

  // the core, drawn from the sound alone: a dark well, a white-hot orb that swells
  // with the bass, a rose of petals that open with the mids, and two orbits that
  // stretch with the highs
  let mids = 0, highs = 0;
  if(spectrum && playing) { for(let i=20; i<80; i++) mids += spectrum[i]; for(let i=120; i<250; i++) highs += spectrum[i]; mids /= 60 * 255; highs /= 130 * 255; }
  glow.mids += (mids - glow.mids) * .2; glow.highs += (highs - glow.highs) * .25;
  const radius = core * (1 + glow.bass * .07);
  const well = paint.createRadialGradient(cx, cy, 0, cx, cy, radius);
  well.addColorStop(0, hslColor(palette[0], 8, .95)); well.addColorStop(.8, 'rgba(0,0,0,.9)'); well.addColorStop(1, 'rgba(0,0,0,0)');
  paint.fillStyle = well; paint.beginPath(); paint.arc(cx, cy, radius, 0, Math.PI * 2); paint.fill();
  paint.globalCompositeOperation = 'lighter';
  const orbRadius = radius * (.45 + glow.bass * .35), orb = paint.createRadialGradient(cx, cy, 0, cx, cy, orbRadius);
  orb.addColorStop(0, 'rgba(255,255,255,.95)'); orb.addColorStop(.25, glow.colors[Math.floor(GLOW_RAYS * .1)]); orb.addColorStop(1, 'rgba(0,0,0,0)');
  paint.fillStyle = orb; paint.beginPath(); paint.arc(cx, cy, orbRadius, 0, Math.PI * 2); paint.fill();
  // a rose r = cos(5/3 θ), turning slowly, its petals as long as the mids are loud
  const petals = radius * (.5 + glow.mids * .5);
  paint.beginPath();
  for(let p=0; p<=240; p++) {
    const theta = p / 240 * Math.PI * 6, r = petals * Math.cos(theta * 5 / 3), angle = theta + glow.spin * .35;
    if(p === 0) paint.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r); else paint.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  paint.lineWidth = 1.2; paint.strokeStyle = glow.colors[Math.floor(GLOW_RAYS * .55)]; paint.globalAlpha = .55 + glow.mids * .45; paint.stroke();
  // two orbits at the rim, turning against each other
  paint.lineCap = 'round';
  for(const [orbit, speed, color] of [[.86, 1, glow.colors[GLOW_RAYS - 1]], [.72, -1.4, glow.colors[Math.floor(GLOW_RAYS * .3)]]]) {
    const sweep = Math.PI * (.25 + glow.highs * 1.4), at = glow.spin * speed;
    paint.lineWidth = 2; paint.strokeStyle = color; paint.globalAlpha = .5 + glow.highs * .5;
    for(const offset of [0, Math.PI]) { paint.beginPath(); paint.arc(cx, cy, radius * orbit, at + offset, at + offset + sweep); paint.stroke(); }
  }
  paint.globalAlpha = 1; paint.globalCompositeOperation = 'source-over';
};

// == Sliders =====================================================================
let scrubbing = false, scrubPosition = 0;
// a horizontal slider: `onMove` with the pointer's ratio along it while held, `onEnd` on release
const bindSlider = (element, onMove, onEnd) => {
  element.addEventListener('pointerdown', (event) => {
    event.preventDefault(); event.stopPropagation();
    try { element.setPointerCapture(event.pointerId); } catch(error) { /*the pointer is already gone*/ }
    element.classList.add('active');
    const ratio = (pointer) => { const bounds = element.getBoundingClientRect(); return clamp((pointer.clientX - bounds.left) / bounds.width, 0, 1); };
    onMove(ratio(event));
    const move = (pointer) => onMove(ratio(pointer));
    const up = (pointer) => {
      element.classList.remove('active');
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up);
      if(onEnd) onEnd(ratio(pointer));
    };
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
  });
};
bindSlider($('#npScrub'),
  (x) => { const track = current(); if(!track) return; scrubbing = true; scrubPosition = x * specOf(track).duration; },
  (x) => { const track = current(); scrubbing = false; if(!track) return; const position = x * specOf(track).duration; Engine.seek(position); state.pos = position; saveState(); setMediaPosition(); });
const setVolumeUI = () => { $('#volFill').style.width = (state.vol * 100) + '%'; };
bindSlider($('#npVol'), (x) => { state.vol = x; Engine.setVolume(x); setVolumeUI(); }, () => saveState());

// == Frame Loop ==================================================================
let lastSave = 0, smoothedEnergy = 0, wasPlaying = false;
// each frame: the progress bars, the Now Playing background and score, and a save of
// the position every five seconds while playing
const frame = (time) => {
  requestAnimationFrame(frame);
  const playing = Engine.isPlaying();
  if(playing !== wasPlaying) { wasPlaying = playing; updatePlayUI(); }
  const track = current(); if(!track) return;
  const spec = specOf(track), position = scrubbing ? scrubPosition : Engine.position(), percent = (spec.duration > 0) ? clamp(position / spec.duration, 0, 1) * 100 : 0/*not yet measured*/;
  $('#miniFill').style.width = percent + '%';
  if(nowPlayingOpen) {
    $('#npFill').style.width = percent + '%';
    $('#tNow').textContent = formatTime(position); $('#tLeft').textContent = (spec.duration > 0) ? '-' + formatTime(spec.duration - position) : '--:--';
    const energy = Engine.energy(); smoothedEnergy += (energy - smoothedEnergy) * ((energy > smoothedEnergy) ? .5 : .12);
    drawBackground(time, smoothedEnergy);
    $('#npArt').style.transform = 'scale(' + (1 + smoothedEnergy * .03).toFixed(4) + ')';
    if(state.mode === PlayerMode.Score) { if(isTakeSpec(spec)) drawAfterglow(time, playing); else drawScore(spec, position); }
  } /* else -- only the mini player's bar shows */
  if(playing && ((time - lastSave) > 5000)) { lastSave = time; saveState(); }
};

// == Media Session ===============================================================
// the lock screen's and Control Center's now-playing card
// the lock screen's progress bar: where the track is and how long it runs
const setMediaPosition = () => {
  const session = navigator.mediaSession, track = current(); if(!session || !session.setPositionState || !track) return;
  const duration = specOf(track).duration; if(!(duration > 0)) return/*not yet measured*/;
  try { session.setPositionState({ duration, position: clamp(Engine.position(), 0, duration), playbackRate: 1 }); } catch(error) { /*a position the browser refused*/ }
};
const setMediaMetadata = () => {
  const session = navigator.mediaSession, track = current(); if(!session || !track || (typeof MediaMetadata === 'undefined')) return;
  try { session.metadata = new MediaMetadata({ title: track.title, artist: track.album.artist, album: track.album.title, artwork: [{ src: artFor(track.album).url, sizes: '480x480', type: 'image/jpeg' }] }); } catch(error) { /*metadata refused: the card shows the page title*/ }
};
try {
  if(navigator.mediaSession) {
    navigator.mediaSession.setActionHandler('play', () => { if(!Engine.isPlaying()) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if(Engine.isPlaying()) togglePlay(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(false));
    navigator.mediaSession.setActionHandler('previoustrack', previousTrack);
    navigator.mediaSession.setActionHandler('seekto', (details) => { if(!current() || !(details.seekTime >= 0)) return; Engine.seek(details.seekTime); state.pos = details.seekTime; saveState(); setMediaPosition(); });
  } /* else -- no lock screen controls */
} catch(error) { /*an action the browser does not support*/ }

// == Events ======================================================================
// -- Actions ---------------------------------------------------------------------
const trackMenu = (button, key, fromNowPlaying) => {
  const track = trackOf(key); if(!track) return;
  const items = [{ label: isLoved(key) ? 'Unlove' : 'Love', icon: isLoved(key) ? ICON.heart : ICON.heartO, action: 'm-love', key }];
  if(isTake(track.album)) items.unshift({ label: 'Rename', icon: ICON.pencil, action: 'rename-take', id: track.album.id });
  if(!fromNowPlaying) items.push({ label: 'Play Next', icon: ICON.playNext, action: 'm-next', key });
  const onItsAlbum = state.route && (state.route.type === RouteType.Album) && (state.route.id === track.album.id) && app.classList.contains('detail-open');
  if(fromNowPlaying || !onItsAlbum) items.push({ label: 'Go to Album', icon: ICON.album, action: 'm-album', key });
  openMenu(button, items);
};
let suppressClick = false/*set after a drag so its release is not a tap*/;
document.addEventListener('click', (event) => {
  if(suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
  const element = event.target.closest('[data-action]'); if(!element) return;
  const action = element.dataset.action, id = element.dataset.id, key = element.dataset.key;
  if(element.closest('#menu') || (action === 'close-menu')) closeMenu();
  switch(action) {
    case 'tab': switchTab(element.dataset.t); break;
    case 'open-album': openRoute({ type: RouteType.Album, id }); break;
    case 'open-route': openRoute({ type: element.dataset.type }); break;
    case 'back': goBack(); break;
    case 'play': playContext(element.dataset.ctx, key, false); break;
    case 'track-menu': event.stopPropagation(); trackMenu(element, key, false); break;
    case 'play-all': playContext(element.dataset.ctx, null/*from the first track*/, false); break;
    case 'shuffle-all': playContext(element.dataset.ctx, null/*from the first track*/, true); break;
    case 'compose': composeAlbum(); break;
    case 'genre': query = (element.dataset.g === TAKE_KIND) ? STUDIO_LABEL : GENRES[element.dataset.g].label; $('#search').value = query; $('#searchWrap').classList.add('active'); renderSearch(); break;
    case 'search-cancel': query = ''; $('#search').value = ''; $('#search').blur(); $('#searchWrap').classList.remove('active'); renderSearch(); break;
    case 'open-np': openNowPlaying(); break;
    case 'toggle-play': togglePlay(); break;
    case 'next': nextTrack(false); break;
    case 'prev': previousTrack(); break;
    case 'close-np': closeNowPlaying(); break;
    case 'love-current': { const track = current(); if(track) toggleLove(track.key); break; }
    case 'np-menu': { const track = current(); if(track) trackMenu(element, track.key, true); break; }
    case 'mode': setMode(element.dataset.m); break;
    case 'toggle-shuffle': toggleShuffle(); break;
    case 'cycle-repeat': cycleRepeat(); break;
    case 'jump': state.qi = +element.dataset.i; startCurrent(0, true); break;
    case 'album-menu': openMenu(element, isTake(albumById(id))
      ? [{ label: 'Rename', icon: ICON.pencil, action: 'rename-take', id }, { label: 'Press Again', icon: ICON.remix, action: 'press-again', id }].concat(needsCover(albumById(id)) ? [{ label: 'Paint Cover', icon: ICON.album, action: 'paint-cover', id }] : []).concat([{ label: 'Remove from Library', icon: ICON.trash, action: 'm-delete', id, destructive: true }])
      : [{ label: 'Remix Album', icon: ICON.remix, action: 'm-remix', id }, { label: 'Delete from Library', icon: ICON.trash, action: 'm-delete', id, destructive: true }]); break;
    case 'm-love': toggleLove(key); break;
    case 'm-next': playNext(key); break;
    case 'm-album': { const track = trackOf(key); if(track) { if(nowPlayingOpen) closeNowPlaying(); openRoute({ type: RouteType.Album, id: track.album.id }); } break; }
    case 'm-remix': remixAlbum(id); break;
    case 'm-delete': deleteAlbum(id); break;
    case 'press': pressDescription(); break;
    case 'use-idea': useIdea(); break;
    case 'next-idea': nextIdea(); break;
    case 'chip': toggleIngredient(+element.dataset.i); break;
    case 'play-take': contextKeys[RouteType.Takes] = takeKeys(); playContext(RouteType.Takes, key, false); break;
    case 'press-again': { const take = albumById(id); if(isTake(take)) pressTake(take.prompt, take.ingredients); break; }
    case 'retry-take': { const take = albumById(id); if(isTake(take)) pressTake(take.prompt, take.ingredients, take.id); break; }
    case 'edit-take': { const take = albumById(id); if(isTake(take)) editDescription(take); break; }
    case 'remove-take': deleteAlbum(id, true/*a failed take holds nothing to lose*/); break;
    case 'paint-cover': paintCover(id); break;
    case 'rename-take': renameTake(id); break;
  }
}, true);
document.addEventListener('input', (event) => {
  if(event.target.id === 'search') { query = event.target.value; renderSearch(); }
  else if(event.target.id === 'prompt') updatePressLabel();
});
document.addEventListener('focusin', (event) => { if(event.target.id === 'search') $('#searchWrap').classList.add('active'); });
document.addEventListener('focusout', (event) => { if((event.target.id === 'search') && !query) $('#searchWrap').classList.remove('active'); });
document.addEventListener('keydown', (event) => {
  if(event.target.id === 'prompt') {
    if((event.key === 'Enter') && !event.shiftKey) { event.preventDefault(); pressDescription(); }
    else if(event.key === 'Escape') event.target.blur();
    return;
  } /* else -- not the description */
  if(event.target.tagName === 'INPUT') { if(event.key === 'Escape') event.target.blur(); return; }
  if(event.key === ' ') { event.preventDefault(); togglePlay(); }
  else if(event.key === 'Escape') {
    if($('#menuWrap').classList.contains('open')) closeMenu();
    else if(nowPlayingOpen) closeNowPlaying();
    else if(app.classList.contains('detail-open')) goBack();
  }
  else if((event.key === 'ArrowRight') && nowPlayingOpen) nextTrack(false);
  else if((event.key === 'ArrowLeft') && nowPlayingOpen) previousTrack();
});

// -- Gestures --------------------------------------------------------------------
// dragging Now Playing down dismisses it; swiping from a detail page's left edge goes back
let nowPlayingDrag = null/*no drag*/, edgeSwipe = null/*no swipe*/;
nowPlaying.addEventListener('pointerdown', (event) => {
  if(event.target.closest('button:not(.grab-hit), .slider, .np-queue')) return;
  nowPlayingDrag = { y: event.clientY, dy: 0, t: performance.now(), active: false };
});
detail.addEventListener('pointerdown', (event) => {
  if(!app.classList.contains('detail-open') || ((event.clientX - detail.getBoundingClientRect().left) > 24)) return;
  edgeSwipe = { x: event.clientX, dx: 0, t: performance.now(), active: false };
});
window.addEventListener('pointermove', (event) => {
  if(nowPlayingDrag) {
    const dy = event.clientY - nowPlayingDrag.y;
    if(!nowPlayingDrag.active) {
      if(dy > 8) { nowPlayingDrag.active = true; nowPlaying.style.transition = 'none'; }
      else if(dy < -8) { nowPlayingDrag = null/*an upward move is not a dismissal*/; return; }
      else return;
    } /* else -- already dragging */
    nowPlayingDrag.dy = Math.max(0, dy); nowPlaying.style.transform = 'translateY(' + nowPlayingDrag.dy + 'px)';
  } else if(edgeSwipe) {
    const dx = event.clientX - edgeSwipe.x;
    if(!edgeSwipe.active) {
      if(dx > 10) { edgeSwipe.active = true; detail.style.transition = 'none'; }
      else if(dx < -10) { edgeSwipe = null/*a leftward move is not a swipe back*/; return; }
      else return;
    } /* else -- already swiping */
    edgeSwipe.dx = Math.max(0, dx); detail.style.transform = 'translateX(' + edgeSwipe.dx + 'px)';
  } /* else -- no drag in progress */
});
// a drag ends in a dismissal when far or fast enough, otherwise springs back
const endDrags = () => {
  if(nowPlayingDrag) {
    const drag = nowPlayingDrag; nowPlayingDrag = null/*no drag*/; nowPlaying.style.transition = '';
    if(drag.active) {
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 350);
      const velocity = drag.dy / Math.max(1, performance.now() - drag.t);
      if((drag.dy > 140) || (velocity > .7)) closeNowPlaying(); else nowPlaying.style.transform = '';
    } /* else -- a tap, not a drag */
  } /* else -- no Now Playing drag */
  if(edgeSwipe) {
    const swipe = edgeSwipe; edgeSwipe = null/*no swipe*/; detail.style.transition = ''; detail.style.transform = '';
    if(swipe.active) {
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 350);
      if((swipe.dx > (detail.clientWidth * .33)) || ((swipe.dx / Math.max(1, performance.now() - swipe.t)) > .6)) goBack();
    } /* else -- a tap, not a swipe */
  } /* else -- no edge swipe */
};
window.addEventListener('pointerup', endDrags);
window.addEventListener('pointercancel', endDrags);
window.addEventListener('resize', () => { placeIndicator(); if(nowPlayingOpen) layoutNowPlaying(); });
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('contextmenu', (event) => { if(!event.target.closest('input, textarea')) event.preventDefault(); });

// == Boot ========================================================================
// fills the static buttons with their icons
const paintStatic = () => {
  $('#tabHome').innerHTML = ICON.home + 'Home'; $('#tabLibrary').innerHTML = ICON.library + 'Library'; $('#tabStudio').innerHTML = ICON.studio + 'Studio'; $('#tabSearch').innerHTML = ICON.search + 'Search';
  $('#boothGlyph').innerHTML = ICON.studio; $('#pressGo').innerHTML = ICON.spark; renderChips();
  $('#miniNext').innerHTML = ICON.next; $('#npPrev').innerHTML = ICON.prev; $('#npNext').innerHTML = ICON.next;
  $('#npMore').innerHTML = ICON.dots; $('#spkLo').innerHTML = ICON.spkLo; $('#spkHi').innerHTML = ICON.spkHi;
  $('#modeScore').innerHTML = ICON.score; $('#modeQueue').innerHTML = ICON.queue;
  $('#plusIco').innerHTML = ICON.plus; $('#moreIco').innerHTML = ICON.dots;
};
// shows the library for the first time, restoring the player's saved place
const boot = () => {
  if(booted) return;
  booted = true;
  state.qi = clamp(state.qi, 0, Math.max(0, state.queue.length - 1));
  const track = current();
  if(track) Engine.load(specOf(track), clamp(state.pos, 0, specOf(track).duration - 1));
  else state.queue = [];
  Engine.setVolume(state.vol); setVolumeUI();
  const tab = state.tab, route = state.route, routeTab = state.routeTab;
  state.tab = null/*so switchTab selects the saved tab*/;
  switchTab(tab);
  renderAll();
  if(route && ((route.type !== RouteType.Album) || isPlayable(albumById(route.id)))) {
    state.routeTab = routeTab; detail.style.transition = 'none'; state.route = route; renderDetail();
    app.classList.add('detail-open'); void detail.offsetHeight; detail.style.transition = '';
  } /* else -- no saved page, or its album is gone */
  setModeClasses(); onTrackChange();
  requestAnimationFrame(() => { placeIndicator(); updateNavSolid(); });
  requestAnimationFrame(frame);
  typeIdea(); setInterval(tickTakes, 500); setInterval(turnFlaps, 70);
  new ResizeObserver(() => fitMarquees($('#studioBody'))).observe($('#studioBody'))/*shown, or turned: the rows measure again*/;
  // takes left pressing when the app last closed are asked after at once
  schedulePoll(0);
};
const init = async () => {
  // the status bar continues the navigation bar: the page's own background in each
  // mode (a Platform without `page` paints its own)
  window.charmiq.page?.setTopColor({ light: '#ffffff', dark: '#000000' });
  paintStatic();
  try { applyState(await window.charmiq.appState.get()); } catch(error) { console.warn('appState.get failed', error); }
  window.charmiq.appContent.content$("[name='" + LIBRARY_NAME + "']").subscribe({
    next: showLibrary,
    error: (error) => {
      toast('Could not read the library: ' + messageOf(error));
      if(!library) { library = normalize(clone(DEFAULT_LIBRARY)); boot(); }
    },
  });
};
init();
})();
</script>
</body>
</html>
  </app-source>
  <app-content name="library.json">
{
  "version": 1,
  "albums": [
    {
      "id": "a6",
      "title": "Theories of Everything",
      "artist": "The 100,000 Foot View",
      "genre": "lofi",
      "year": 2026,
      "seed": "zoom-out",
      "tracks": [
        "Zoom Out",
        "The Map Is Not the Territory",
        "Obvious in Hindsight",
        "Everybody Else Was Wrong",
        "Zoom Back In"
      ]
    },
    {
      "id": "a1",
      "title": "Midnight Laundromat",
      "artist": "Soft Static",
      "genre": "lofi",
      "year": 2026,
      "seed": "laundromat-7",
      "tracks": [
        "Spin Cycle",
        "Quarters for the Dryer",
        "Fluorescent Hum",
        "Lint Trap Lullaby",
        "Folded Warm"
      ]
    },
    {
      "id": "a2",
      "title": "Neon Tollbooth",
      "artist": "Vector Coast",
      "genre": "synthwave",
      "year": 2026,
      "seed": "tollbooth-88",
      "tracks": [
        "Exit 88",
        "Chrome Horizon",
        "Night Shift Overdrive",
        "Palm Tree Static",
        "Rearview Romance"
      ]
    },
    {
      "id": "a3",
      "title": "Weather for Houseplants",
      "artist": "Moss Engine",
      "genre": "ambient",
      "year": 2026,
      "seed": "fern",
      "tracks": [
        "Photosynthesis",
        "Low Pressure System",
        "Dew Point",
        "Root Network"
      ]
    },
    {
      "id": "a4",
      "title": "Basement Cathedral",
      "artist": "The Four-on-the-Floor Society",
      "genre": "house",
      "year": 2026,
      "seed": "pews",
      "tracks": [
        "Kick Drum Sermon",
        "Hallelujah Hi-Hat",
        "Pews & Subwoofers",
        "Last Call Communion"
      ]
    },
    {
      "id": "a5",
      "title": "Extra Life",
      "artist": "8-Bit Grandma",
      "genre": "chiptune",
      "year": 2026,
      "seed": "1up",
      "tracks": [
        "Press Start",
        "Coin Heaven",
        "World 1-2 (Unofficial)",
        "Boss Rush",
        "Continue?"
      ]
    }
  ],
  "loved": [
    "a1:0",
    "a2:2",
    "a5:1"
  ]
}
  </app-content>
  <app-state>
{
  "tab": "library",
  "route": null,
  "routeTab": "library",
  "queue": [
    "a6:1",
    "a1:0",
    "a2:2",
    "a5:1"
  ],
  "qi": 0,
  "pos": 5.2,
  "vol": 0.8,
  "shuffle": false,
  "orig": null,
  "repeat": "off",
  "mode": "art",
  "recent": [
    "a6",
    "a3",
    "a4",
    "a2",
    "a5"
  ]
}
  </app-state>
</iframe-app>
