---
theme: charmiq:none
---

<style>
  :root {
    background: rgb(242, 242, 247);
  }
  body {
    margin: 0px;
    padding: 0px;
  }
  body > * {
    margin: 0px;
  }
  @media (prefers-color-scheme: dark) {
    :root { background: rgb(0, 0, 0); }
  }
</style>

<iframe-app height="100svh" width="100%" requested-scopes="%5B%22user.read%22%5D">
  <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Tick List</title>
<style>
:root {
  --bg: #F2F2F7;
  --bg2: #FFFFFF;
  --card: #FFFFFF;
  --card-hi: #D1D1D6;
  --sheet-bg: #F2F2F7;
  --sheet-card: #FFFFFF;
  --label: #000;
  --label2: rgba(60,60,67,.6);
  --label3: rgba(60,60,67,.3);
  --sep: rgba(60,60,67,.29);
  --fill: rgba(118,118,128,.12);
  --fill2: rgba(120,120,128,.2);
  --blue: #007AFF;
  --red: #FF3B30;
  --orange: #FF9500;
  --gray: #8E8E93;
  --allc: #3A3A3C;
  --ring: #C7C7CC;
  --bar: rgba(249,249,249,.84);
  --menu: rgba(237,237,237,.82);
  --menu-sep: rgba(60,60,67,.2);
  --alert: rgba(242,242,242,.86);
  --plus-glyph: #fff;
  --sel: #007AFF;
  --swatch-ring: rgba(142,142,147,.55);
  --safe-t: env(safe-area-inset-top,0px);
  --safe-b: env(safe-area-inset-bottom,0px);
  --safe-l: env(safe-area-inset-left,0px);
  --safe-r: env(safe-area-inset-right,0px);
  --ease: cubic-bezier(.32,.72,0,1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000;
    --bg2: #000;
    --card: #1C1C1E;
    --card-hi: #3A3A3C;
    --sheet-bg: #1C1C1E;
    --sheet-card: #2C2C2E;
    --label: #fff;
    --label2: rgba(235,235,245,.6);
    --label3: rgba(235,235,245,.3);
    --sep: rgba(84,84,88,.65);
    --fill: rgba(118,118,128,.24);
    --fill2: rgba(120,120,128,.36);
    --blue: #0A84FF;
    --red: #FF453A;
    --orange: #FF9F0A;
    --gray: #8E8E93;
    --allc: #636366;
    --ring: #545458;
    --bar: rgba(22,22,24,.84);
    --menu: rgba(37,37,37,.86);
    --menu-sep: rgba(84,84,88,.55);
    --alert: rgba(30,30,30,.9);
    --plus-glyph: #000;
    --sel: #0A84FF;
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
  -webkit-text-size-adjust: 100%;
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
  border-radius: 0;
  -webkit-appearance: none;
  appearance: none;
  caret-color: var(--blue);
}

svg {
  display: block;
}

#app {
  position: fixed;
  inset: 0;
  background: var(--bg);
  overflow: hidden;
  transform-origin: 50% 0;
  transition: transform .5s var(--ease), border-radius .5s var(--ease);
}

#app.behind {
  transform: translateY(calc(var(--safe-t) + 10px)) scale(.92);
  border-radius: 12px;
}

.pane {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#home {
  background: var(--bg);
  z-index: 1;
  transition: transform .5s var(--ease);
}

#home .dimmer {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.12);
  opacity: 0;
  pointer-events: none;
  transition: opacity .5s var(--ease);
  z-index: 20;
}

#detail {
  background: var(--bg2);
  z-index: 2;
  transform: translateX(100%);
  transition: transform .5s var(--ease);
  box-shadow: -.5px 0 0 var(--sep), -10px 0 30px rgba(0,0,0,.08);
}

#app.phone-detail #detail {
  transform: translateX(0);
}

#app.phone-detail #home {
  transform: translateX(-30%);
}

#app.phone-detail #home .dimmer {
  opacity: 1;
}

@media (min-width: 768px) {
  #home {
    right: auto;
    width: min(375px,40%);
    transform: none !important;
    border-right: .5px solid var(--sep);
  }
  #home .dimmer {
    display: none;
  }
  #detail {
    left: min(375px,40%);
    transform: none !important;
    box-shadow: none;
  }
  .back-btn {
    display: none !important;
  }
  .large-title {
    padding-left: 20px !important;
  }
  .item {
    padding-left: 24px !important;
  }
}

.nav {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  padding-top: var(--safe-t);
  padding-left: var(--safe-l);
  padding-right: var(--safe-r);
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
  color: var(--blue);
  height: 44px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 17px;
  transition: opacity .15s;
}

.nav-btn:active {
  opacity: .3;
  transition: none;
}

.nav-btn.bold {
  font-weight: 600;
}

.back-btn {
  padding-left: 0;
  gap: 5px;
}

.nav-right {
  display: flex;
  align-items: center;
  margin-left: auto;
}

#detail .nav-btn {
  color: var(--c, var(--blue));
}

.hidden {
  display: none !important;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding-top: calc(var(--safe-t) + 44px);
  padding-bottom: calc(var(--safe-b) + 76px);
  padding-left: var(--safe-l);
  padding-right: var(--safe-r);
}

.large-title {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: .37px;
  line-height: 41px;
  padding: 2px 16px 6px;
  color: var(--c, var(--label));
  overflow-wrap: anywhere;
}

.search {
  margin: 2px 16px 16px;
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
  color: var(--blue);
  display: none;
}

.search.active .search-cancel {
  display: block;
}

.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 16px;
}

.tile {
  background: var(--card);
  border-radius: 12px;
  padding: 9px 12px 8px 9px;
  height: 82px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: background-color .15s;
}

.tile:active {
  background: var(--card-hi);
  transition: none;
}

.tile-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.tile-count {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: .36px;
  line-height: 32px;
  font-variant-numeric: tabular-nums;
}

.tile-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--label2);
  letter-spacing: -.32px;
  padding-left: 3px;
}

.tile.selected {
  background: var(--tc);
}

.tile.selected .tile-count, .tile.selected .tile-label {
  color: #fff;
}

.tile.selected .ico {
  background: #fff !important;
  color: var(--tc);
}

.tile.selected .ico svg * {
  fill: var(--tc);
}

.ico {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: #fff;
}

.ico svg {
  width: 60%;
  height: 60%;
}

.tile .ico {
  width: 32px;
  height: 32px;
}

.section-h {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .35px;
  line-height: 28px;
  padding: 24px 20px 8px;
}

.group {
  margin: 0 16px;
  background: var(--card);
  border-radius: 10px;
  overflow: hidden;
  transform: translateZ(0);
}

.swipe {
  position: relative;
  overflow: hidden;
}

.swipe-actions {
  position: absolute;
  inset: 0;
  background: var(--red);
  display: flex;
  justify-content: flex-end;
  visibility: hidden;
}

.swipe.swiping .swipe-actions, .swipe.open .swipe-actions {
  visibility: visible;
}

.sw-del {
  width: 80px;
  color: #fff;
  font-size: 17px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-content {
  position: relative;
  transition: transform .4s var(--ease);
  touch-action: pan-y;
}

.row {
  display: flex;
  align-items: center;
  padding-left: 16px;
  gap: 12px;
  background: var(--card);
  transition: background-color .2s;
}

.row:active {
  background: var(--card-hi);
  transition: none;
}

.row-inner {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  min-height: 52px;
  padding-right: 16px;
  gap: 8px;
  position: relative;
}

.group > *:not(:last-child) .row-inner::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: .5px;
  background: var(--sep);
}

.row-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-sub {
  font-size: 15px;
  color: var(--label2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-detail {
  color: var(--label2);
  font-variant-numeric: tabular-nums;
}

.chev {
  color: var(--label3);
}

.row .ico {
  width: 30px;
  height: 30px;
}

.row.selected {
  background: var(--sel);
}

.row.selected .row-title, .row.selected .row-detail, .row.selected .chev {
  color: #fff;
}

.row.selected .row-inner::after {
  display: none;
}

.row.selected .ico {
  background: #fff !important;
}

.row.selected .ico svg * {
  fill: var(--lc);
}

.edit-minus, .info-btn {
  display: none;
}

.editing .edit-minus {
  display: flex;
  width: 22px;
  height: 22px;
  flex: none;
}

.editing .info-btn {
  display: flex;
  color: var(--blue);
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
}

.editing .row-detail, .editing .chev {
  display: none;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
}

.done-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 16px 4px 20px;
  padding: 6px 0 10px;
  color: var(--label2);
  font-size: 15px;
  border-bottom: .5px solid var(--sep);
}

.done-bar button {
  color: var(--c, var(--blue));
  font-size: 15px;
}

.done-bar .clear {
  margin-left: 6px;
}

.done-bar .clear:disabled {
  color: var(--label3);
}

.item {
  display: flex;
  align-items: flex-start;
  padding-left: 20px;
  gap: 12px;
  background: var(--bg2);
}

.check {
  width: 24px;
  height: 24px;
  margin-top: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--ring);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  transition: border-color .2s;
  position: relative;
}

.check::before {
  content: "";
  position: absolute;
  inset: -10px;
}

.check::after {
  content: "";
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--c);
  transform: scale(0);
  transition: transform .3s cubic-bezier(.3,1.6,.5,1);
}

.item.done .check {
  border-color: var(--c);
}

.item.done .check::after {
  transform: scale(1);
}

.item-main {
  flex: 1;
  min-width: 0;
  padding: 11px 16px 11px 0;
  position: relative;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-height: 44px;
}

.item-main::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: .5px;
  background: var(--sep);
}

.item-text {
  flex: 1;
  min-width: 0;
}

.item-title {
  width: 100%;
  font-size: 17px;
  line-height: 22px;
  height: 22px;
  display: block;
  caret-color: var(--c);
}

.item.done .item-title {
  color: var(--label2);
}

.item-sub {
  font-size: 15px;
  line-height: 20px;
  color: var(--label2);
  margin-top: 1px;
}

.flag-btn {
  color: var(--label3);
  width: 24px;
  height: 22px;
  display: none;
  align-items: center;
  justify-content: center;
  flex: none;
}

.item.flagged .flag-btn {
  display: flex;
  color: var(--orange);
}

.item:focus-within .flag-btn {
  display: flex;
}

.empty {
  text-align: center;
  color: var(--label3);
  font-size: 20px;
  font-weight: 600;
  padding-top: 22vh;
  letter-spacing: .38px;
}

.toolbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  padding: 0 calc(16px + var(--safe-r)) var(--safe-b) calc(16px + var(--safe-l));
  height: calc(50px + var(--safe-b));
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: var(--bar);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
}

.toolbar::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: .5px;
  background: var(--sep);
}

.tb-btn {
  color: var(--blue);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  height: 50px;
  transition: opacity .15s;
}

.tb-btn.bold {
  font-weight: 600;
}

.tb-btn:active {
  opacity: .3;
  transition: none;
}

.tb-btn .plus {
  width: 24px;
  height: 24px;
}

.tb-btn .plus path {
  stroke: var(--plus-glyph);
}

#detail .tb-btn {
  color: var(--c, var(--blue));
}

.menu-wrap {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
}

.menu-wrap.open {
  display: block;
}

.menu {
  position: absolute;
  min-width: 250px;
  background: var(--menu);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  backdrop-filter: blur(40px) saturate(180%);
  border-radius: 13px;
  box-shadow: 0 10px 60px rgba(0,0,0,.22);
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
  height: 44px;
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
  color: var(--red);
}

.menu button svg {
  width: 20px;
  height: 20px;
}

.alert-wrap {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0,0,0,.2);
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
  color: var(--blue);
  font-size: 17px;
  text-align: center;
}

.alert-btns button:active {
  background: var(--fill2);
}

.alert-btns button + button {
  border-left: .5px solid var(--menu-sep);
}

.alert-btns .cancel {
  font-weight: 600;
}

.alert-btns .destructive {
  color: var(--red);
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 39;
  background: rgba(0,0,0,.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity .45s var(--ease);
}

.sheet-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}

.sheet {
  position: fixed;
  z-index: 40;
  left: 0;
  right: 0;
  bottom: 0;
  top: calc(var(--safe-t) + 22px);
  background: var(--sheet-bg);
  border-radius: 12px 12px 0 0;
  transform: translateY(110%);
  transition: transform .5s var(--ease);
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 30px rgba(0,0,0,.12);
}

.sheet.open {
  transform: none;
}

.sheet:not(.open) {
  visibility: hidden;
  transition: transform .5s var(--ease), visibility 0s linear .5s;
}

@media (min-width: 768px) {
  .sheet {
    left: 50%;
    top: 50%;
    bottom: auto;
    width: 540px;
    height: min(620px,90vh);
    border-radius: 14px;
    transform: translate(-50%,100vh);
  }
  .sheet.open {
    transform: translate(-50%,-50%);
  }
}

.sheet-nav {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  position: relative;
  flex: none;
}

.sheet-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
  font-weight: 600;
}

.sheet-nav .nav-btn:disabled {
  color: var(--label3);
}

.sheet-body {
  flex: 1;
  overflow: auto;
  padding: 4px 16px calc(var(--safe-b) + 24px);
}

.name-card {
  background: var(--sheet-card);
  border-radius: 12px;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.big-ico {
  width: 96px;
  height: 96px;
  transition: background-color .2s, box-shadow .2s;
}

.name-input {
  width: 100%;
  height: 54px;
  border-radius: 12px;
  background: var(--fill);
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .35px;
  color: var(--c);
  caret-color: var(--c);
}

.name-input::placeholder {
  color: var(--label3);
  font-weight: 700;
}

.swatch-card {
  margin-top: 16px;
  background: var(--sheet-card);
  border-radius: 12px;
  padding: 18px 12px;
  display: grid;
  grid-template-columns: repeat(6,1fr);
  row-gap: 16px;
  justify-items: center;
}

.swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  position: relative;
}

.swatch.on::after {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 3px solid var(--swatch-ring);
}
</style>
</head>
<body>
<div id="app">
  <section id="home" class="pane">
    <header class="nav" id="homeNav">
      <div class="nav-bar">
        <span class="nav-title">Lists</span>
        <div class="nav-right"><button class="nav-btn" id="editBtn" data-action="edit">Edit</button></div>
      </div>
    </header>
    <div class="scroll" id="homeScroll">
      <div class="search" id="searchWrap">
        <label class="search-field">
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="6.8" cy="6.8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.8 10.8 15 15" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
          <input id="search" type="search" placeholder="Search" autocomplete="off" autocorrect="off" spellcheck="false">
        </label>
        <button class="search-cancel" data-action="search-cancel">Cancel</button>
      </div>
      <div id="homeBody"></div>
    </div>
    <footer class="toolbar">
      <button class="tb-btn bold" data-action="new-reminder-home"><svg class="plus" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 7v10M7 12h10" stroke-width="2.4" stroke-linecap="round"/></svg>New Reminder</button>
      <button class="tb-btn" data-action="add-list">Add List</button>
    </footer>
    <div class="dimmer"></div>
  </section>

  <section id="detail" class="pane">
    <header class="nav" id="detailNav">
      <div class="nav-bar">
        <button class="nav-btn back-btn" data-action="back"><svg width="13" height="21" viewBox="0 0 13 21"><path d="M11 2 2.5 10.5 11 19" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Lists</button>
        <span class="nav-title" id="detailNavTitle"></span>
        <div class="nav-right">
          <button class="nav-btn" id="moreBtn" data-action="menu" aria-label="More"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7.4" cy="12" r="1.45" fill="currentColor"/><circle cx="12" cy="12" r="1.45" fill="currentColor"/><circle cx="16.6" cy="12" r="1.45" fill="currentColor"/></svg></button>
          <button class="nav-btn bold hidden" id="doneEditBtn" data-action="done-editing">Done</button>
        </div>
      </div>
    </header>
    <div class="scroll" id="detailScroll">
      <h1 class="large-title" id="detailTitle"></h1>
      <div id="detailBody"></div>
    </div>
    <footer class="toolbar" id="detailToolbar">
      <button class="tb-btn bold" data-action="new-reminder"><svg class="plus" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 7v10M7 12h10" stroke-width="2.4" stroke-linecap="round"/></svg>New Reminder</button>
      <span></span>
    </footer>
  </section>
</div>

<div class="sheet-backdrop" id="sheetBackdrop" data-action="sheet-cancel"></div>
<div class="sheet" id="sheet">
  <div class="sheet-nav">
    <button class="nav-btn" data-action="sheet-cancel">Cancel</button>
    <div class="sheet-title" id="sheetTitle">New List</div>
    <button class="nav-btn bold" id="sheetDone" data-action="sheet-done">Done</button>
  </div>
  <div class="sheet-body">
    <div class="name-card">
      <div class="ico big-ico" id="bigIco"></div>
      <input class="name-input" id="listName" placeholder="List Name" autocomplete="off" enterkeyhint="done">
    </div>
    <div class="swatch-card" id="swatches"></div>
  </div>
</div>

<div class="menu-wrap" id="menuWrap" data-action="close-menu"><div class="menu" id="menu"></div></div>

<div class="alert-wrap" id="alertWrap">
  <div class="alert">
    <div class="alert-text"><div class="alert-title" id="alertTitle"></div><div class="alert-msg" id="alertMsg"></div></div>
    <div class="alert-btns"><button class="cancel" data-alert="0" id="alertCancel">Cancel</button><button class="destructive" data-alert="1" id="alertOk">Delete</button></div>
  </div>
</div>

<script>
// Tick List: lists of reminders to tick off, kept in the document's `lists.json`
// app-content so that every phone and browser sharing the document sees the same lists.
// Each person's place (the open list) is kept in the app-state under their User id
// (`charmiq.user$`, `user.read`), so they come back to it
// ********************************************************************************
(() => {
'use strict';

// == Constants ===================================================================
// the app-content holding the lists, and the codes its writes are refused with
const APP_CONTENT_NAME = 'lists.json';
const APP_CONTENT_SELECTOR = `[name='${APP_CONTENT_NAME}']`;
const CONTENT_CONFLICT = 'app/content-conflict';

const SAVE_DELAY_MILLIS = 250;
const STATE_SAVE_DELAY_MILLIS = 150;
const COLLAPSE_MILLIS = 320;
const LEAVE_DELAY_MILLIS = 650;
const SWIPE_SETTLE_MILLIS = 400;

const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55', '#AF52DE', '#A2845E', '#8E8E93', '#E3A0A9'];
const DEFAULT_COLOR = COLORS[5];
const DEFAULT_LIST_NAME = 'Reminders';
// the width of a row's revealed Delete action
const SWIPE_ACTION_WIDTH = 80;
// the width along the left edge where a swipe goes back to the lists
const EDGE_SWIPE_WIDTH = 28;

// -- Enums -----------------------------------------------------------------------
const RouteType = Object.freeze({ List: 'list', Smart: 'smart' });
const SmartList = Object.freeze({ Today: 'today', Flagged: 'flagged', All: 'all', Completed: 'completed' });
// the pane a phone shows: the lists, or one list's reminders
const PhoneView = Object.freeze({ Home: 'home', Detail: 'detail' });
const SwipeKind = Object.freeze({ Item: 'item', List: 'list' });
const DragKind = Object.freeze({ Edge: 'edge', Row: 'row' });
const Action = Object.freeze({
  AddList: 'add-list',
  Back: 'back',
  ClearCompleted: 'clear-completed',
  CloseMenu: 'close-menu',
  DeleteCurrent: 'del-current',
  DeleteItem: 'del-item',
  DeleteList: 'del-list',
  DoneEditing: 'done-editing',
  Edit: 'edit',
  InfoCurrent: 'info-current',
  InfoList: 'info-list',
  Menu: 'menu',
  NewReminder: 'new-reminder',
  NewReminderHome: 'new-reminder-home',
  OpenList: 'open-list',
  OpenSmart: 'open-smart',
  SearchCancel: 'search-cancel',
  SheetCancel: 'sheet-cancel',
  SheetDone: 'sheet-done',
  Swatch: 'swatch',
  ToggleCompleted: 'toggle-completed',
  ToggleDone: 'toggle-done',
  ToggleFlag: 'toggle-flag',
});

// -- Icons -----------------------------------------------------------------------
const ICON = {
  list: '<svg viewBox="0 0 24 24" fill="#fff"><circle cx="5.6" cy="6.5" r="1.7"/><circle cx="5.6" cy="12" r="1.7"/><circle cx="5.6" cy="17.5" r="1.7"/><rect x="9.4" y="5.4" width="10.4" height="2.2" rx="1.1"/><rect x="9.4" y="10.9" width="10.4" height="2.2" rx="1.1"/><rect x="9.4" y="16.4" width="10.4" height="2.2" rx="1.1"/></svg>',
  cal: (day) => `<svg viewBox="0 0 24 24"><path fill="#fff" d="M6 4h12a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zm-1 5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9z"/><text x="12" y="17.6" text-anchor="middle" font-size="8.6" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="#fff">${day}</text></svg>`,
  tray: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M7.9 4h8.2a2 2 0 0 1 1.9 1.4L20.6 13v5a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2v-5L6 5.4A2 2 0 0 1 7.9 4zm-2.3 9h3.6l1 2.2h3.6l1-2.2h3.6l-2.2-6.6a.6.6 0 0 0-.6-.4H8.4a.6.6 0 0 0-.6.4z"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M5.5 3.2c.6 0 1 .4 1 1v.3c1.6-.7 3.4-.6 5.4.2 2.2.9 4.3.9 6.5-.2.4-.2.9.1.9.6v9.2c0 .3-.2.6-.5.8-2.5 1.3-5 1.3-7.6.3-1.7-.7-3.3-.7-4.7 0V20.8a1 1 0 1 1-2 0V4.2c0-.6.4-1 1-1z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M6.6 12.6l3.6 3.6 7.4-8" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flagSmall: '<svg width="16" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M5.5 3.2c.6 0 1 .4 1 1v.3c1.6-.7 3.4-.6 5.4.2 2.2.9 4.3.9 6.5-.2.4-.2.9.1.9.6v9.2c0 .3-.2.6-.5.8-2.5 1.3-5 1.3-7.6.3-1.7-.7-3.3-.7-4.7 0V20.8a1 1 0 1 1-2 0V4.2c0-.6.4-1 1-1z"/></svg>',
  chev: '<svg width="8" height="14" viewBox="0 0 8 14"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  minus: '<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="var(--red)"/><path d="M6.5 11h9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  info: '<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/><path d="M12 11v6.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M4 3.5l16 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 6.5h16M9.5 6.5V4.8c0-.5.4-.8.8-.8h3.4c.5 0 .8.4.8.8v1.7M6.2 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h5.8c1 0 1.9-.8 2-1.9l.9-12.6M10 10.5v6.5M14 10.5v6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

// the lists computed from every list's reminders, in the order their tiles show
const SMART = {
  [SmartList.Today]: { name: 'Today', color: 'var(--blue)', icon: () => ICON.cal(new Date().getDate()) },
  [SmartList.Flagged]: { name: 'Flagged', color: 'var(--orange)', icon: () => ICON.flag },
  [SmartList.All]: { name: 'All', color: 'var(--allc)', icon: () => ICON.tray },
  [SmartList.Completed]: { name: 'Completed', color: 'var(--gray)', icon: () => ICON.check },
};

// == Utilities ===================================================================
const $ = (selector, root = document) => root.querySelector(selector);
const uid = () => Math.random().toString(36).slice(2, 10);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

const isToday = (timestamp) => {
  if(!timestamp) return false;
  const date = new Date(timestamp), now = new Date();
  return ((date.getFullYear() === now.getFullYear()) && (date.getMonth() === now.getMonth()) && (date.getDate() === now.getDate()));
};

const mqPad = matchMedia('(min-width: 768px)');
// a wide screen shows the lists and the open list side by side
const isPad = () => mqPad.matches;

// == Lists =======================================================================
// the app-content holds one record per line (JSON Lines), each whole on its line:
//   {"kind":"list","id":"rem01","name":"Reminders","color":"#007AFF"}
//   {"kind":"item","id":"i01","list":"rem01","title":"Milk","done":false,"flagged":false,"created":1793059200000}
// A change rewrites only the lines of the records it changes, so two people changing
// different reminders at once change different lines and the document keeps both.
// (One JSON object would spread a reminder over many lines, and two such changes
// would merge into text that is no longer JSON.) Lists show in the order of their
// lines, a list's reminders in the order of theirs. A line holding no list or
// reminder (malformed, or another writer's record) is kept as written, never shown
const RecordKind = Object.freeze({ List: 'list', Item: 'item' });

// -- Reading ---------------------------------------------------------------------
/** the list or reminder a line holds, or null when it holds neither */
const recordOf = (line) => {
  let record;
  try { record = JSON.parse(line); } catch(error) { return null/*not JSON*/; }
  if(!record || (typeof record !== 'object') || (typeof record.id !== 'string')) return null/*not a record*/;
  if((record.kind === RecordKind.List) && (typeof record.name === 'string')) return record;
  if((record.kind === RecordKind.Item) && (typeof record.list === 'string') && (typeof record.title === 'string')) return record;
  return null/*neither a list nor a reminder*/;
};

// a row is one line of the app-content and the record it holds (null: the line is
// kept as written). A row a change leaves alone keeps its line exactly, so a write
// rewrites only the lines of the records it changed
/** the rows of an app-content's lines */
const rowsOf = (lines) => lines.map((line) => ({ line, record: recordOf(line) }));
const rowOf = (record) => ({ line: JSON.stringify(record), record });

/** the record of `id` in the rows: its last line's (SEE: listsOf), or null */
const recordIn = (rows, id) => rows.reduce((found, row) => ((row.record && (row.record.id === id)) ? row.record : found), null/*none*/);

/** the lists the rows hold, each with its reminders. Two lines of one id (another
 *  writer appended a record under an id already there) read as the last, where the
 *  first stands; the next change to that record leaves one line. A reminder whose list
 *  is gone (removed while another person added to it) is not shown */
const listsOf = (rows) => {
  const order = [...new Set(rows.flatMap((row) => (row.record ? [row.record.id] : [])))];
  const records = order.map((id) => recordIn(rows, id));
  const lists = records
    .filter((record) => (record.kind === RecordKind.List))
    .map((record) => ({ id: record.id, name: record.name, color: record.color || DEFAULT_COLOR, items: [] }));
  const byId = new Map(lists.map((list) => [list.id, list]));
  records
    .filter((record) => (record.kind === RecordKind.Item) && byId.has(record.list))
    .forEach((record) => byId.get(record.list).items.push({ id: record.id, title: record.title, done: (record.done === true), flagged: (record.flagged === true), created: record.created, completedAt: record.completedAt }));
  return { lists };
};

const seedRows = () => {
  const now = Date.now(), list = uid();
  const reminder = (title, flagged = false) => rowOf({ kind: RecordKind.Item, id: uid(), list, title, done: false, flagged, created: now });
  return [
    rowOf({ kind: RecordKind.List, id: list, name: DEFAULT_LIST_NAME, color: DEFAULT_COLOR }),
    reminder('Tap the circle to complete a reminder'),
    reminder('Swipe left on a row to delete it'),
    reminder('Tap New Reminder to add one', true/*flagged*/),
  ];
};

const findItemIn = (lists, id) => {
  for(const list of lists.lists) {
    const index = list.items.findIndex((item) => (item.id === id));
    if(index > -1) return { list, item: list.items[index], index };
  }
  return null/*no such reminder*/;
};

// -- Changes ---------------------------------------------------------------------
// each change gives the next rows without touching the ones it is given, changing
// only the lines of the records it names, and gives the same result applied twice:
// a change is applied again over the latest app-content whenever another writer got
// there first
// NOTE: every change states its outcome (done, not "toggled") so that applying it again
//       over rows that already hold it changes nothing

/** replaces the record of `id` with `update(record)` on its first line and removes any
 *  other line of it */
const replaceRecord = (id, update) => (rows) => {
  const record = recordIn(rows, id);
  if(!record) return rows/*removed meanwhile*/;
  const replaced = rowOf(update(record));
  let placed = false;
  return rows.flatMap((row) => {
    if(!row.record || (row.record.id !== id)) return [row];
    if(placed) return []/*a second line of it*/;
    placed = true;
    return [replaced];
  });
};

/** the index of the last row `matches` accepts, or -1 */
const lastRowIndex = (rows, matches) => rows.reduce((found, row, index) => (matches(row) ? index : found), -1);

// .. Reminders ...................................................................
/** inserts the reminder's line after `afterId`'s (after its list's last reminder when
 *  `afterId` is not there): a drafted reminder enters the lists with its first letter */
const insertItem = (listId, afterId, item) => (rows) => {
  if(recordIn(rows, item.id)) return rows/*already inserted*/;
  if(!recordIn(rows, listId)) return rows/*its list removed meanwhile*/;
  const after = (afterId && recordIn(rows, afterId))
    ? lastRowIndex(rows, (row) => (row.record?.id === afterId))
    : lastRowIndex(rows, (row) => ((row.record?.id === listId) || ((row.record?.kind === RecordKind.Item) && (row.record.list === listId))));
  const inserted = rowOf({ kind: RecordKind.Item, id: item.id, list: listId, title: item.title, done: item.done, flagged: item.flagged, created: item.created });
  return [...rows.slice(0, after + 1), inserted, ...rows.slice(after + 1)];
};

const setItemTitle = (id, title) => replaceRecord(id, (item) => ({ ...item, title }));
const setItemFlagged = (id, flagged) => replaceRecord(id, (item) => ({ ...item, flagged }));
const setItemDone = (id, done, completedAt) => replaceRecord(id, (item) => {
  const { completedAt: _completedAt, ...rest } = item;
  return done ? { ...rest, done, completedAt } : { ...rest, done };
});

const removeItems = (ids) => (rows) => rows.filter((row) => !(row.record && ids.has(row.record.id)));

// .. Lists .......................................................................
/** adds the list, without reminders, after the last line */
const addList = (list) => (rows) => {
  if(recordIn(rows, list.id)) return rows/*already added*/;
  return [...rows, rowOf({ kind: RecordKind.List, id: list.id, name: list.name, color: list.color })];
};
const renameList = (id, name, color) => replaceRecord(id, (list) => ({ ...list, name, color }));
/** removes the list's line and the line of every reminder in it */
const removeList = (id) => (rows) => rows.filter((row) => !(row.record && ((row.record.id === id) || ((row.record.kind === RecordKind.Item) && (row.record.list === id)))));

// == State =======================================================================
// `data` is what the User sees: the lists of the shown app-content's rows with the
// User's changes not yet in it applied over them, then the reminder being drafted
let data = null/*nothing received yet*/;
let ui = { route: null/*no list open*/, showCompleted: false, phoneView: PhoneView.Home };
let editMode = false;
let query = '';

// reminders just completed (or restored) stay visible for a moment before they leave
const justToggled = new Set();
let pendingRender = false/*a render waits for a reminder's title to lose focus*/;
let rendering = false;

const app = $('#app'), home = $('#home'), detail = $('#detail');

// == Routes ======================================================================
const isCompletedView = () => !!(ui.route && (ui.route.type === RouteType.Smart) && (ui.route.id === SmartList.Completed));
const isFlaggedView = () => !!(ui.route && (ui.route.type === RouteType.Smart) && (ui.route.id === SmartList.Flagged));

const allItems = () => data.lists.flatMap((list) => list.items.map((item) => ({ item, list })));
const findItem = (id) => findItemIn(data, id);

/** what a route shows (its title, color, list and reminders), or null when it names
 *  nothing there is */
const routeInfo = (route) => {
  if(!route || !data) return null/*nothing to show*/;
  if(route.type === RouteType.List) {
    const list = data.lists.find((candidate) => (candidate.id === route.id));
    return list ? { title: list.name, color: list.color, list, items: list.items.map((item) => ({ item, list })) } : null/*list deleted*/;
  } /* else -- a smart list */

  const smart = SMART[route.id];
  if(!smart) return null/*unknown smart list*/;
  const all = allItems();
  let items = all;
  if(route.id === SmartList.Today) items = all.filter((entry) => isToday(entry.item.created));
  else if(route.id === SmartList.Flagged) items = all.filter((entry) => entry.item.flagged);
  else if(route.id === SmartList.Completed) items = all.filter((entry) => entry.item.done);
  return { title: smart.name, color: smart.color, list: null/*spans lists*/, items, smart: route.id };
};

// == Alerts ======================================================================
// one alert box serves both a question (Cancel / a confirming action) and a notice
// (a single OK); it answers whether the confirming action was chosen
const openAlert = (title, message, confirmLabel, cancellable, destructive) => new Promise((resolve) => {
  $('#alertTitle').textContent = title;
  $('#alertMsg').textContent = message;
  $('#alertOk').textContent = confirmLabel;
  $('#alertOk').classList.toggle('destructive', destructive);
  $('#alertCancel').classList.toggle('hidden', !cancellable);
  const wrap = $('#alertWrap');
  wrap.classList.add('open');
  const handle = (event) => {
    const button = event.target.closest('[data-alert]');
    if(!button) return;
    event.stopPropagation();
    wrap.classList.remove('open');
    wrap.removeEventListener('click', handle, true/*capture*/);
    resolve(button.dataset.alert === '1');
  };
  wrap.addEventListener('click', handle, true/*capture*/);
});

const confirmAlert = (title, message, confirmLabel) => openAlert(title, message, confirmLabel, true/*cancellable*/, true/*destructive*/);
const showNotice = (title, message) => openAlert(title, message, 'OK', false/*not cancellable*/, false/*not destructive*/);

// == Rendering ===================================================================
// -- Home ------------------------------------------------------------------------
const listRowHTML = (list) => `<div><div class="row" data-action="${Action.OpenList}" data-id="${list.id}"><div class="ico" style="background:${list.color}">${ICON.list}</div><div class="row-inner"><div class="row-title">${esc(list.name)}</div><span class="chev">${ICON.chev}</span></div></div></div>`;
const hitRowHTML = (entry) => `<div><div class="row" data-action="${Action.OpenList}" data-id="${entry.list.id}"><div class="dot" style="background:${entry.list.color}"></div><div class="row-inner" style="flex-direction:column;align-items:flex-start;justify-content:center;gap:0;padding-top:8px;padding-bottom:8px"><div class="row-title" style="width:100%${entry.item.done ? ';color:var(--label2)' : ''}">${esc(entry.item.title)}</div><div class="row-sub">${esc(entry.list.name)}</div></div></div></div>`;

const renderSearch = (body) => {
  const needle = query.trim().toLowerCase();
  const hits = allItems().filter((entry) => entry.item.title.toLowerCase().includes(needle));
  const lists = data.lists.filter((list) => list.name.toLowerCase().includes(needle));
  let html = '';
  if(lists.length > 0) html += `<div class="section-h">Lists</div><div class="group">${lists.map(listRowHTML).join('')}</div>`;
  if(hits.length > 0) html += `<div class="section-h">Reminders</div><div class="group">${hits.map(hitRowHTML).join('')}</div>`;
  if(html.length < 1) html = '<div class="empty" style="padding-top:18vh">No Results</div>';
  body.innerHTML = html;
};

const renderHome = () => {
  const body = $('#homeBody');
  $('#editBtn').textContent = editMode ? 'Done' : 'Edit';
  $('#editBtn').classList.toggle('bold', editMode);
  if(query.trim()) { renderSearch(body); return; }

  // a wide screen marks the open list
  const selected = isPad() ? ui.route : null/*a phone marks none*/;
  const all = allItems();
  const counts = {
    [SmartList.Today]: all.filter((entry) => !entry.item.done && isToday(entry.item.created)).length,
    [SmartList.Flagged]: all.filter((entry) => !entry.item.done && entry.item.flagged).length,
    [SmartList.All]: all.filter((entry) => !entry.item.done).length,
    [SmartList.Completed]: all.filter((entry) => entry.item.done).length,
  };
  let html = `<div class="tiles">${Object.keys(SMART).map((key) => {
    const smart = SMART[key];
    const on = (selected && (selected.type === RouteType.Smart) && (selected.id === key));
    // the Completed tile shows its count only while open
    const count = ((key === SmartList.Completed) && !on) ? '' : counts[key];
    return `<button class="tile${on ? ' selected' : ''}" style="--tc:${smart.color}" data-action="${Action.OpenSmart}" data-id="${key}"><div class="tile-top"><div class="ico" style="background:${smart.color}">${smart.icon()}</div><div class="tile-count">${count}</div></div><div class="tile-label">${smart.name}</div></button>`;
  }).join('')}</div>`;

  html += '<div class="section-h">My Lists</div>';
  if(data.lists.length > 0) {
    html += `<div class="group${editMode ? ' editing' : ''}">${data.lists.map((list) => {
      const remaining = list.items.filter((item) => !item.done).length;
      const on = (selected && (selected.type === RouteType.List) && (selected.id === list.id));
      return `<div class="swipe" data-kind="${SwipeKind.List}" data-id="${list.id}"><div class="swipe-actions"><button class="sw-del" data-action="${Action.DeleteList}" data-id="${list.id}">Delete</button></div>`
        + `<div class="row row-content${(on && !editMode) ? ' selected' : ''}" data-action="${Action.OpenList}" data-id="${list.id}">`
        + `<button class="edit-minus" data-action="${Action.DeleteList}" data-id="${list.id}" aria-label="Delete">${ICON.minus}</button>`
        + `<div class="ico" style="background:${list.color};--lc:${list.color}">${ICON.list}</div>`
        + `<div class="row-inner"><div class="row-title">${esc(list.name)}</div><span class="row-detail">${remaining}</span><span class="chev">${ICON.chev}</span>`
        + `<button class="info-btn" data-action="${Action.InfoList}" data-id="${list.id}" aria-label="List Info">${ICON.info}</button></div></div></div>`;
    }).join('')}</div>`;
  } else {
    html += '<div style="padding:4px 20px;color:var(--label2);font-size:15px">Tap Add List to create your first list.</div>';
  }
  body.innerHTML = html;
};

// -- Detail ----------------------------------------------------------------------
// shows the navigation bar's background once the content scrolls beneath it
const updateNavSolid = () => {
  $('#homeNav').classList.toggle('solid', ($('#homeScroll').scrollTop > 2));
  $('#detailNav').classList.toggle('solid', ($('#detailScroll').scrollTop > ($('#detailTitle').offsetHeight - 6)));
};

const itemHTML = (entry, showList) => {
  const item = entry.item;
  return `<div class="swipe" data-kind="${SwipeKind.Item}" data-id="${item.id}"><div class="swipe-actions"><button class="sw-del" data-action="${Action.DeleteItem}" data-id="${item.id}">Delete</button></div>`
    + `<div class="item row-content${item.done ? ' done' : ''}${item.flagged ? ' flagged' : ''}" data-id="${item.id}" style="--c:${entry.list.color}">`
    + `<button class="check" data-action="${Action.ToggleDone}" data-id="${item.id}" aria-label="Complete"></button>`
    + `<div class="item-main"><div class="item-text"><input class="item-title" data-id="${item.id}" value="${esc(item.title)}" enterkeyhint="next" autocomplete="off">`
    + (showList ? `<div class="item-sub">${esc(entry.list.name)}</div>` : '') + '</div>'
    + `<button class="flag-btn" data-action="${Action.ToggleFlag}" data-id="${item.id}" aria-label="Flag">${ICON.flagSmall}</button></div></div></div>`;
};

const renderDetail = () => {
  const route = routeInfo(ui.route);
  const body = $('#detailBody');
  if(!route) {
    $('#detailTitle').textContent = '';
    $('#detailNavTitle').textContent = '';
    body.innerHTML = '<div class="empty">No List Selected</div>';
    $('#detailToolbar').classList.add('hidden');
    $('#moreBtn').classList.add('hidden');
    return;
  } /* else -- a list to show */

  detail.style.setProperty('--c', route.color);
  $('#detailTitle').textContent = route.title;
  $('#detailNavTitle').textContent = route.title;
  $('#moreBtn').classList.toggle('hidden', !!(document.activeElement && document.activeElement.classList.contains('item-title')));
  $('#detailToolbar').classList.toggle('hidden', isCompletedView());

  const doneCount = route.items.filter((entry) => entry.item.done).length;
  let rows = route.items;
  if(!isCompletedView() && !ui.showCompleted) rows = rows.filter((entry) => !entry.item.done || justToggled.has(entry.item.id));

  let html = '';
  if(!isCompletedView()) html += `<div class="done-bar"><span>${doneCount} Completed<span style="margin:0 6px">•</span><button class="clear" data-action="${Action.ClearCompleted}"${(doneCount > 0) ? '' : ' disabled'}>Clear</button></span><button data-action="${Action.ToggleCompleted}">${ui.showCompleted ? 'Hide' : 'Show'}</button></div>`;
  html += (rows.length > 0)
    ? rows.map((entry) => itemHTML(entry, !!route.smart)).join('')
    : `<div class="empty">${isCompletedView() ? 'No Completed Reminders' : 'No Reminders'}</div>`;
  body.innerHTML = html;
  updateNavSolid();
};

// -- Page ------------------------------------------------------------------------
const render = () => {
  if(!data || rendering) return;
  rendering = true;
  try {
    if(!routeInfo(ui.route)) {
      ui.route = isPad() ? (data.lists[0] ? { type: RouteType.List, id: data.lists[0].id } : { type: RouteType.Smart, id: SmartList.All }) : null/*a phone shows the lists*/;
      if(!ui.route) ui.phoneView = PhoneView.Home;
    } /* else -- the route still names something */
    app.classList.toggle('phone-detail', (!isPad() && (ui.phoneView === PhoneView.Detail) && !!ui.route));
    renderHome();
    renderDetail();
  } finally {
    rendering = false;
  }
};

// defers a render while a reminder's title is being typed: the render would replace it
const safeRender = () => {
  const active = document.activeElement;
  if(active && (active.tagName === 'INPUT') && app.contains(active) && active.classList.contains('item-title')) { pendingRender = true; return; }
  render();
};

// == Content Bridge ==============================================================
// the app-content is the truth: `shown` is the app-content as `content$` last gave it,
// and every render starts from its rows, never from what this app last wrote. A change
// is applied to what the User sees at once and saved shortly after, applied to the rows
// of the app-content shown and written through it (`setLines`: only the lines that
// differ, refused whole when it has changed since); when another writer got there
// first, the same changes are applied to the latest app-content and saved again
const appContent = window.charmiq.appContent;
const appState = window.charmiq.appState;

let shown = null/*nothing received yet*/;
// the rows shown before any app-content exists (what `create` writes), kept so that
// every render agrees
let seed = null/*not needed yet*/;
let creating = false;

// changes sent and not yet seen in an app-content, then changes not yet sent
let written = [];
let pending = [];
let writeTarget = null/*no write in flight*/;
// a sent write succeeded on the app-content still shown: its app-content arrives next
let awaitingEcho = false;
let saveTimer = null/*no save scheduled*/;

// the reminder being drafted: shown, but stored only once it has a title
let draft = null/*no reminder being drafted*/;

/** the app-content's rows; before there is one, the rows it is created with */
const storedRows = (content) => {
  if(content) return rowsOf(content.lines);
  if(!seed) seed = seedRows();
  return seed;
};

const recompute = () => {
  let rows = storedRows(shown);
  for(const change of written) rows = change(rows);
  for(const change of pending) rows = change(rows);
  if(draft) rows = insertItem(draft.listId, draft.afterId, draft.item)(rows);
  data = listsOf(rows);
};

/** applies a change to what the User sees and saves it shortly after */
const change = (update) => {
  pending.push(update);
  recompute();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY_MILLIS);
};

// .. Saving ......................................................................
/** writes the rows onto `target`, measured on it: only the lines that differ, refused
 *  whole when it has changed since. False when no line differs: nothing is written,
 *  so no app-content follows */
const writeRows = async (target, rows) => {
  const lines = rows.map((row) => row.line);
  if((lines.length === target.lines.length) && lines.every((line, index) => (line === target.lines[index]))) return false/*nothing to write*/;
  await target.setLines(lines);
  return true;
};

const save = async () => {
  saveTimer = null;
  if(writeTarget || awaitingEcho || !shown || (pending.length < 1)) return/*the save resumes when the write settles or its app-content arrives; nothing to save*/;

  const target = shown;
  written = pending;
  pending = [];
  writeTarget = target;
  let conflicted = false;
  try {
    const wrote = await writeRows(target, written.reduce((rows, update) => update(rows), storedRows(target)));
    awaitingEcho = wrote && (shown === target);
    if(!awaitingEcho) written = []/*its app-content already arrived*/;
  } catch(error) {
    conflicted = (error?.code === CONTENT_CONFLICT);
    if(conflicted) {
      pending = [...written, ...pending];
    } else {
      console.error(`Could not save the ${APP_CONTENT_NAME} app-content`, error);
      showNotice('Couldn’t Save', `Your last change wasn’t saved. ${error?.message ?? ''}`.trim());
    }
    written = [];
  } finally {
    writeTarget = null;
  }
  recompute();
  safeRender();

  // the changes made meanwhile follow now, unless the app-content they apply to is still
  // to arrive (this write's own, or the one that won a conflict): `receive` saves them
  if((pending.length > 0) && !awaitingEcho && !(conflicted && (shown === target))) save();
};

// .. Receiving ...................................................................
const createContent = async () => {
  if(creating) return/*already creating*/;
  creating = true;
  try {
    await appContent.create(storedRows(null/*no app-content yet*/).map((row) => `${row.line}\n`).join(''), APP_CONTENT_NAME);
  } catch(error) {
    console.error(`Could not create the ${APP_CONTENT_NAME} app-content`, error);
    showNotice('Couldn’t Create Your Lists', error?.message ?? '');
  } finally {
    creating = false;
  }
};

const receive = (content) => {
  if(!content) {
    shown = null;
    recompute();
    safeRender();
    createContent();
    return;
  } /* else -- an app-content to show */

  shown = content;
  if(!writeTarget && awaitingEcho) { awaitingEcho = false; written = []; }
  recompute();
  safeRender();
  settlePlace();
  if(!writeTarget && !saveTimer && (pending.length > 0)) save();
};

// .. App-State ...................................................................
// the app-state holds the document's settings, the same for everyone sharing it
// (whether completed reminders show), and each person's place under their User id
// (`byUser`: the open list and the pane). It is one value for the whole document:
// each save writes the settings and this person's entry onto the latest state, and
// two people saving at once can drop one's latest place (they come back to the one
// before). Nothing is written before the app-state is known. Everyone who reads the
// document reads every entry
let writeTimer = null/*no write scheduled*/, settingsPending = false/*a setting changed here, still to be written*/;
// the signed-in User (null: no one, or not told) and the app-state as last seen
let me = null, meKnown = false, appStateSeen = null, appStateKnown = false;
// each person's saved place settles once the lists, they and the app-state are known:
// restored, unless they already moved, which is then saved instead. A place waiting
// to be saved names whose it is
let placeSettled = false, movedEarly = false, placeToSave = null/*nothing waiting*/;
// a failed save is told once, until a save succeeds
let saveFailed = false;

/** the person a User is: null for no one */
const idOf = (user) => (user ? user.id : null);
/** a failure's reason, as the start of a notice */
const reasonOf = (error) => ((error && error.message) ? `${error.message} ` : '');
/** tells the person their place is not kept, and why; their lists still work */
const noticePlaceUnsaved = (error) => showNotice('Your Place Isn’t Being Saved', `${reasonOf(error)}Your lists still work; reload to try again.`);

/** writes a setting changed here, and the place waiting to be saved, onto the latest
 *  app-state: once it is known. A setting not changed here stays as last received */
const writeAppState = () => {
  writeTimer = null;
  if(!appStateKnown) return/*written once the app-state is known*/;
  const latest = (appStateSeen && (typeof appStateSeen === 'object')) ? appStateSeen : {};
  const byUser = (latest.byUser && (typeof latest.byUser === 'object')) ? latest.byUser : {};
  const settings = settingsPending ? { showCompleted: ui.showCompleted } : {/*no setting changed here*/};
  const place = placeToSave ? { [placeToSave.id]: placeToSave.place } : {/*no place waiting*/};
  settingsPending = false; placeToSave = null;
  appState.set({ ...latest, ...settings, byUser: { ...byUser, ...place } })
    .then(() => { saveFailed = false; })
    .catch((error) => {
      console.error('Could not save the app-state', error);
      if('showCompleted' in settings) {
        if(settingsPending) return/*a newer choice is about to be written*/;
        showNotice('Show Completed Wasn’t Saved', `${reasonOf(error)}Reload to see the saved setting.`);
        return;
      } /* else -- a place alone: the next move saves it */
      if(saveFailed) return/*already told*/;
      saveFailed = true;
      showNotice('Your Place Wasn’t Saved', `${reasonOf(error)}Your lists still work; Tick List tries again when you next move.`);
    });
};
/** writes shortly after a setting or this person's place changes */
const scheduleWrite = () => {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeAppState, STATE_SAVE_DELAY_MILLIS);
};
/** saves the settings shortly after one changes here */
const saveSettings = () => { settingsPending = true; scheduleWrite(); };

/** the app-state can no longer be read: nothing waiting is written, and nothing
 *  later, since the app-state it would be written onto is no longer known */
const loseAppState = (error) => {
  console.error('Could not read the app-state', error);
  appStateKnown = false; appStateSeen = null;
  clearTimeout(writeTimer); writeTimer = null;
  settingsPending = false; placeToSave = null;
  noticePlaceUnsaved(error);
};

/** saves this person's place once it is settled; a move before then is remembered */
const savePlace = () => {
  if(!placeSettled) { movedEarly = true; return; }
  if(!me) return/*no one signed in, or not told: no place kept*/;
  placeToSave = { id: me.id, place: { route: ui.route, phoneView: ui.phoneView } };
  scheduleWrite();
};

/** shows this person's saved place, once for each person: when the lists, they and
 *  the app-state are known, and only if they have not moved meanwhile (then their new
 *  place is saved). Another person's later saves never move this screen */
const settlePlace = () => {
  if(placeSettled || !data || !meKnown || !appStateKnown) return/*settled, or still waiting*/;
  placeSettled = true;
  if(movedEarly) { movedEarly = false; savePlace(); return; }
  const saved = me && appStateSeen && appStateSeen.byUser && appStateSeen.byUser[me.id];
  if(!saved || (typeof saved !== 'object') || !routeInfo(saved.route)) return/*nothing to restore, or its list is gone*/;
  ui.route = saved.route;
  ui.phoneView = (saved.phoneView === PhoneView.Detail) ? PhoneView.Detail : PhoneView.Home;
  safeRender();
};

/** takes each User the Platform tells. Another person (or no one) ends the place
 *  work of the one before, whose place is never saved under them, starts from the
 *  lists and settles their own; the same person with a new name or picture stays
 *  where they are */
const receiveUser = (user) => {
  const another = meKnown && (idOf(user) !== idOf(me));
  me = user; meKnown = true;
  if(another) {
    placeSettled = false; movedEarly = false; placeToSave = null;
    ui.route = null/*no list open*/; ui.phoneView = PhoneView.Home;
    safeRender();
  } /* else -- the first User told, or the same person */
  settlePlace();
};

/** takes the settings an app-state holds: true when one changed */
const applySettings = (state) => {
  if(!state || (typeof state !== 'object') || (typeof state.showCompleted !== 'boolean') || (state.showCompleted === ui.showCompleted)) return false;
  ui.showCompleted = state.showCompleted;
  return true;
};

// == Menu ========================================================================
const openMenu = (button) => {
  const route = routeInfo(ui.route);
  if(!route) return;
  const entries = [];
  if(route.list) entries.push({ label: 'Show List Info', icon: ICON.info, action: Action.InfoCurrent });
  if(!isCompletedView()) entries.push({ label: ui.showCompleted ? 'Hide Completed' : 'Show Completed', icon: ui.showCompleted ? ICON.eyeOff : ICON.eye, action: Action.ToggleCompleted });
  if(route.list) entries.push({ label: 'Delete List', icon: ICON.trash, action: Action.DeleteCurrent, destructive: true });

  const menu = $('#menu');
  menu.innerHTML = entries.map((entry) => `<button data-action="${entry.action}" class="${entry.destructive ? 'destructive' : ''}"><span>${entry.label}</span>${entry.icon}</button>`).join('');
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${Math.max(8, innerWidth - rect.right)}px`;
  $('#menuWrap').classList.add('open');
};
const closeMenu = () => $('#menuWrap').classList.remove('open');

// == List Sheet ==================================================================
// the sheet that names and colors a new list, or an existing one (`editing`)
let sheet = { editing: null/*a new list*/, name: '', color: DEFAULT_COLOR };

const updateSheet = () => {
  $('#bigIco').style.background = sheet.color;
  $('#bigIco').style.boxShadow = `0 8px 20px ${sheet.color}66`;
  $('#bigIco').innerHTML = ICON.list;
  $('#listName').style.setProperty('--c', sheet.color);
  $('#sheetDone').disabled = !sheet.name.trim();
  document.querySelectorAll('.swatch').forEach((swatch) => swatch.classList.toggle('on', (swatch.dataset.color === sheet.color)));
};

const openSheet = (list) => {
  sheet = { editing: list ? list.id : null/*a new list*/, name: list ? list.name : '', color: list ? list.color : DEFAULT_COLOR };
  $('#sheetTitle').textContent = list ? 'List Info' : 'New List';
  $('#listName').value = sheet.name;
  $('#swatches').innerHTML = COLORS.map((color) => `<button class="swatch" data-action="${Action.Swatch}" data-color="${color}" style="background:${color}" aria-label="${color}"></button>`).join('');
  updateSheet();
  $('#sheet').classList.add('open');
  $('#sheetBackdrop').classList.add('open');
  if(!isPad()) app.classList.add('behind');
  $('#listName').focus({ preventScroll: true });
};

const closeSheet = () => {
  $('#listName').blur();
  $('#sheet').classList.remove('open');
  $('#sheetBackdrop').classList.remove('open');
  app.classList.remove('behind');
};

// == Swipe Rows ==================================================================
let suppressClick = false/*a drag just ended: its click is not a tap*/;
let drag = null/*no drag under way*/;
let openSwipe = null/*no row swiped open*/;

const closeSwipe = () => {
  if(!openSwipe) return;
  const swipe = openSwipe;
  openSwipe = null;
  const row = swipe.querySelector('.row-content');
  if(row) row.style.transform = '';
  setTimeout(() => swipe.classList.remove('open', 'swiping'), SWIPE_SETTLE_MILLIS);
};

// == Actions =====================================================================
// -- Navigation ------------------------------------------------------------------
const go = (route) => {
  ui.route = route;
  ui.phoneView = PhoneView.Detail;
  savePlace();
  justToggled.clear();
  closeSwipe();
  render();
  $('#detailScroll').scrollTop = 0;
  updateNavSolid();
};

const goBack = () => {
  ui.phoneView = PhoneView.Home;
  savePlace();
  app.classList.remove('phone-detail');
  renderHome();
};

// -- Reminders -------------------------------------------------------------------
// stores the reminder being drafted before a change to it: a change to a reminder
// applies to the stored lists
const storeDraft = (id) => {
  if(!draft || (draft.item.id !== id)) return;
  const { listId, afterId, item } = draft;
  draft = null;
  change(insertItem(listId, afterId, item));
};

const discardDraft = (id) => {
  if(!draft || (draft.item.id !== id)) return false;
  draft = null;
  recompute();
  return true;
};

/** drafts a new reminder after `afterId` (at the end of the open list otherwise) and
 *  focuses its title */
const addItem = (afterId) => {
  const route = routeInfo(ui.route);
  let list = (route && route.list) ? route.list : (afterId ? findItem(afterId).list : data.lists[0]);
  if(!list) {
    list = { id: uid(), name: DEFAULT_LIST_NAME, color: DEFAULT_COLOR, items: [] };
    change(addList(list));
  } /* else -- a list to add to */

  const item = { id: uid(), title: '', done: false, flagged: isFlaggedView(), created: Date.now() };
  const after = afterId && findItem(afterId);
  draft = { listId: list.id, afterId: (after && (after.list.id === list.id)) ? afterId : null/*at the end*/, item };
  recompute();
  render();

  const input = document.querySelector(`.item-title[data-id="${item.id}"]`);
  if(input) {
    input.focus({ preventScroll: true });
    input.closest('.swipe').scrollIntoView({ block: 'nearest' });
  } /* else -- the draft's list is not the one shown */
};

// animates a row closed, then calls `done`
const collapse = (element, done) => {
  if(!element) { done?.(); return; }
  element.style.height = `${element.offsetHeight}px`;
  element.offsetHeight/*forces the starting height before the transition*/;
  element.style.transition = 'height .32s var(--ease), opacity .25s ease';
  element.style.height = '0px';
  element.style.opacity = '0';
  setTimeout(() => done?.(), COLLAPSE_MILLIS);
};

// whether a reminder leaves the open list now that it is (or is no longer) done
const leavesView = (item) => (isCompletedView() ? !item.done : (item.done && !ui.showCompleted));

const toggleDone = (id) => {
  const found = findItem(id);
  if(!found) return;
  storeDraft(id);
  const done = !found.item.done;
  change(setItemDone(id, done, Date.now()));

  const row = document.querySelector(`.item[data-id="${id}"]`);
  if(row) row.classList.toggle('done', done);
  if(leavesView({ done })) {
    justToggled.add(id);
    setTimeout(() => {
      if(!justToggled.has(id)) return/*the view was reset meanwhile*/;
      const still = findItem(id);
      if(!still || !leavesView(still.item)) { justToggled.delete(id); return; }
      collapse(row && row.closest('.swipe'), () => { justToggled.delete(id); safeRender(); });
    }, LEAVE_DELAY_MILLIS);
  } /* else -- it stays in view */
  renderHome();

  // the completed count and Clear in place, without re-rendering the rows
  const bar = $('.done-bar span');
  if(bar) {
    const count = routeInfo(ui.route).items.filter((entry) => entry.item.done).length;
    bar.firstChild.textContent = `${count} Completed`;
    const clear = $('.done-bar .clear');
    if(clear) clear.disabled = (count < 1);
  } /* else -- the Completed list has no bar */
};

const toggleFlag = (id, button) => {
  const found = findItem(id);
  if(!found) return;
  storeDraft(id);
  const flagged = !found.item.flagged;
  change(setItemFlagged(id, flagged));
  button.closest('.item').classList.toggle('flagged', flagged);
  renderHome();
};

const deleteItem = (id) => {
  if(!findItem(id)) return;
  const swipe = document.querySelector(`.swipe[data-kind="${SwipeKind.Item}"][data-id="${id}"]`);
  if(openSwipe === swipe) openSwipe = null;
  collapse(swipe, () => {
    if(!discardDraft(id) && findItem(id)) change(removeItems(new Set([id])));
    render();
  });
};

const clearCompleted = async () => {
  const route = routeInfo(ui.route);
  if(!route) return;
  const ids = new Set(route.items.filter((entry) => entry.item.done).map((entry) => entry.item.id));
  if(ids.size < 1) return;
  const confirmed = await confirmAlert(`Clear ${ids.size} Completed Reminder${(ids.size > 1) ? 's' : ''}?`, 'This action cannot be undone.', 'Clear');
  if(!confirmed) return;
  change(removeItems(ids));
  render();
};

// -- Lists -----------------------------------------------------------------------
const deleteList = async (id) => {
  const list = data.lists.find((candidate) => (candidate.id === id));
  if(!list) return;
  const confirmed = await confirmAlert(`Delete “${list.name}”?`, 'This will delete all reminders in this list.', 'Delete');
  closeSwipe();
  if(!confirmed) return;
  if(draft && (draft.listId === id)) draft = null;
  change(removeList(id));
  if(ui.route && (ui.route.type === RouteType.List) && (ui.route.id === id)) {
    ui.route = null/*the open list is gone*/;
    ui.phoneView = PhoneView.Home;
    savePlace();
  } /* else -- another list was open */
  render();
};

const commitSheet = () => {
  const name = sheet.name.trim();
  if(!name) return;
  closeSheet();
  if(sheet.editing) {
    change(renameList(sheet.editing, name, sheet.color));
    render();
  } else {
    const list = { id: uid(), name, color: sheet.color };
    change(addList(list));
    editMode = false;
    go({ type: RouteType.List, id: list.id });
  }
};

// == Gestures ====================================================================
// a horizontal drag swipes a row open to Delete (left) or, from the left edge of an
// open list on a phone, goes back to the lists (right)
const startDrag = (event) => {
  suppressClick = false;
  if(openSwipe && !event.target.closest('.swipe-actions')) { closeSwipe(); suppressClick = true; return; }
  if((event.pointerType === 'mouse') && (event.button !== 0)) return/*not the primary button*/;
  if(!isPad() && (ui.phoneView === PhoneView.Detail) && (event.clientX < EDGE_SWIPE_WIDTH) && event.target.closest('#detail')) {
    drag = { type: DragKind.Edge, x: event.clientX, y: event.clientY, dx: 0, startedAt: performance.now(), active: false };
    return;
  } /* else -- maybe a row */

  const row = event.target.closest('.swipe .row-content');
  if(!row || editMode) return;
  const input = event.target.closest('input');
  if(input && (document.activeElement === input)) return/*selecting text in the title being typed*/;
  drag = { type: DragKind.Row, row, swipe: row.parentElement, x: event.clientX, y: event.clientY, offset: 0, active: false };
};

const moveDrag = (event) => {
  if(!drag) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if(!drag.active) {
    if((Math.abs(dx) > 10) && (Math.abs(dx) > (Math.abs(dy) * 1.2))) {
      if(((drag.type === DragKind.Edge) && (dx < 0)) || ((drag.type === DragKind.Row) && (dx > 0))) { drag = null; return; }
      drag.active = true;
      if(drag.type === DragKind.Row) { drag.swipe.classList.add('swiping'); drag.row.style.transition = 'none'; }
      else { detail.style.transition = 'none'; home.style.transition = 'none'; }
    } else if(Math.abs(dy) > 10) { drag = null; return; }
    else return;
  } /* else -- already dragging */

  if(drag.type === DragKind.Row) {
    drag.offset = Math.min(0, dx);
    drag.row.style.transform = `translateX(${drag.offset}px)`;
  } else {
    drag.dx = Math.max(0, dx);
    detail.style.transform = `translateX(${drag.dx}px)`;
    home.style.transform = `translateX(${-30 + ((30 * drag.dx) / innerWidth)}%)`;
  }
};

const endDrag = () => {
  if(!drag) return;
  const ended = drag;
  drag = null;
  if(!ended.active) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, SWIPE_SETTLE_MILLIS);

  if(ended.type === DragKind.Row) {
    ended.row.style.transition = '';
    const width = ended.swipe.offsetWidth;
    if(ended.offset < (-width * 0.55)) {
      // a long swipe deletes at once
      ended.row.style.transform = 'translateX(-100%)';
      const id = ended.swipe.dataset.id;
      if(ended.swipe.dataset.kind === SwipeKind.Item) setTimeout(() => deleteItem(id), 200);
      else { openSwipe = ended.swipe; ended.swipe.classList.add('open'); deleteList(id); }
    } else if(ended.offset < (-SWIPE_ACTION_WIDTH / 2)) {
      ended.row.style.transform = `translateX(-${SWIPE_ACTION_WIDTH}px)`;
      ended.swipe.classList.add('open');
      openSwipe = ended.swipe;
    } else {
      ended.row.style.transform = '';
      setTimeout(() => ended.swipe.classList.remove('swiping'), SWIPE_SETTLE_MILLIS);
    }
  } else {
    const velocity = ended.dx / Math.max(1, performance.now() - ended.startedAt);
    detail.style.transition = '';
    home.style.transition = '';
    detail.style.transform = '';
    home.style.transform = '';
    if((ended.dx > (innerWidth * 0.33)) || (velocity > 0.6)) goBack();
  }
};

// == Events ======================================================================
// -- Taps ------------------------------------------------------------------------
const handleAction = (event, element) => {
  const action = element.dataset.action, id = element.dataset.id;
  if(element.closest('#menu') || (action === Action.CloseMenu)) closeMenu();
  switch(action) {
    case Action.OpenSmart: if(!editMode) go({ type: RouteType.Smart, id }); break;
    case Action.OpenList: {
      if(editMode) { const list = data.lists.find((candidate) => (candidate.id === id)); if(list) openSheet(list); break; }
      if(query) { query = ''; $('#search').value = ''; $('#searchWrap').classList.remove('active'); $('#search').blur(); }
      go({ type: RouteType.List, id });
      break;
    }
    case Action.Back: goBack(); break;
    case Action.Edit: editMode = !editMode; closeSwipe(); renderHome(); break;
    case Action.DeleteList: event.stopPropagation(); deleteList(id); break;
    case Action.InfoList: {
      event.stopPropagation();
      const list = data.lists.find((candidate) => (candidate.id === id));
      if(list) openSheet(list);
      break;
    }
    case Action.AddList: openSheet(null/*a new list*/); break;
    case Action.NewReminderHome: {
      // a wide screen adds to the open list; otherwise to the first list
      let target = (isPad() && ui.route) ? ui.route : null/*the first list*/;
      if(!target || isCompletedView()) target = data.lists[0] ? { type: RouteType.List, id: data.lists[0].id } : null/*no list yet*/;
      if(target) { ui.route = target; ui.phoneView = PhoneView.Detail; savePlace(); }
      addItem();
      break;
    }
    case Action.NewReminder: addItem(); break;
    case Action.ToggleDone: toggleDone(id); break;
    case Action.ToggleFlag: toggleFlag(id, element); break;
    case Action.DeleteItem: event.stopPropagation(); deleteItem(id); break;
    case Action.Menu: openMenu(element); break;
    case Action.CloseMenu: break;
    case Action.ToggleCompleted: ui.showCompleted = !ui.showCompleted; justToggled.clear(); saveSettings(); render(); break;
    case Action.ClearCompleted: clearCompleted(); break;
    case Action.InfoCurrent: { const route = routeInfo(ui.route); if(route && route.list) openSheet(route.list); break; }
    case Action.DeleteCurrent: { const route = routeInfo(ui.route); if(route && route.list) deleteList(route.list.id); break; }
    case Action.DoneEditing: document.activeElement?.blur(); break;
    case Action.SearchCancel: query = ''; $('#search').value = ''; $('#search').blur(); $('#searchWrap').classList.remove('active'); renderHome(); break;
    case Action.SheetCancel: closeSheet(); break;
    case Action.SheetDone: commitSheet(); break;
    case Action.Swatch: sheet.color = element.dataset.color; updateSheet(); break;
  }
};

document.addEventListener('click', (event) => {
  if(suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
  const element = event.target.closest('[data-action]');
  if(element) handleAction(event, element);
}, true/*capture*/);

// -- Typing ----------------------------------------------------------------------
document.addEventListener('input', (event) => {
  const target = event.target;
  if(target.classList.contains('item-title')) {
    const id = target.dataset.id;
    if(draft && (draft.item.id === id)) {
      const { listId, afterId, item } = draft;
      draft = null;
      change(insertItem(listId, afterId, { ...item, title: target.value }));
    } else if(findItem(id)) {
      change(setItemTitle(id, target.value));
    } /* else -- the reminder was deleted elsewhere while being typed */
  } else if(target.id === 'search') {
    query = target.value;
    renderHome();
  } else if(target.id === 'listName') {
    sheet.name = target.value;
    updateSheet();
  } /* else -- an input with no handler */
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if(target.classList.contains('item-title') && (event.key === 'Enter')) {
    // Enter drafts the next reminder; on an empty one it finishes typing
    event.preventDefault();
    const found = findItem(target.dataset.id);
    if(found && found.item.title.trim()) addItem(found.item.id);
    else target.blur();
  } else if((target.id === 'listName') && (event.key === 'Enter')) {
    event.preventDefault();
    commitSheet();
  } else if(event.key === 'Escape') {
    closeMenu();
    if($('#sheet').classList.contains('open')) closeSheet();
  } /* else -- a key with no handler */
});

// -- Focus -----------------------------------------------------------------------
document.addEventListener('focusin', (event) => {
  if(event.target.classList.contains('item-title')) { $('#moreBtn').classList.add('hidden'); $('#doneEditBtn').classList.remove('hidden'); }
  if(event.target.id === 'search') $('#searchWrap').classList.add('active');
});

// keeps the title focused while its flag is pressed: WebKit never focuses a tapped
// button, so the title would lose focus (and hide the flag it shows) before the tap lands
document.addEventListener('mousedown', (event) => { if(event.target.closest('.flag-btn')) event.preventDefault(); });

// leaving a reminder's title removes it when empty and trims it otherwise
const finishTitle = (id) => {
  const found = findItem(id);
  const active = document.activeElement;
  const stillEditing = !!(active && active.classList && active.classList.contains('item-title'));
  if(found && !found.item.title.trim()) {
    if(!discardDraft(id)) change(removeItems(new Set([id])));
    if(!stillEditing) render();
    else document.querySelector(`.swipe[data-kind="${SwipeKind.Item}"][data-id="${id}"]`)?.remove();
  } else if(found) {
    const trimmed = found.item.title.trim();
    if(trimmed !== found.item.title) change(setItemTitle(id, trimmed));
  } /* else -- the reminder was deleted meanwhile */

  if(pendingRender && !stillEditing) { pendingRender = false; render(); }
  else if(!stillEditing) renderHome();
};

document.addEventListener('focusout', (event) => {
  const target = event.target;
  if(target.classList.contains('item-title')) {
    $('#doneEditBtn').classList.add('hidden');
    $('#moreBtn').classList.toggle('hidden', !routeInfo(ui.route));
    // NOTE: the focus moves after focusout: whether another title took it is known only then
    const id = target.dataset.id;
    setTimeout(() => finishTitle(id), 0);
  } /* else -- not a reminder's title */
  if((target.id === 'search') && !query) $('#searchWrap').classList.remove('active');
});

// -- Pointer & Page --------------------------------------------------------------
addEventListener('pointerdown', startDrag);
addEventListener('pointermove', moveDrag);
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

$('#homeScroll').addEventListener('scroll', updateNavSolid, { passive: true });
$('#detailScroll').addEventListener('scroll', updateNavSolid, { passive: true });

// the page never zooms, and only a text field offers its long-press menu
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('contextmenu', (event) => { if(!event.target.closest('input')) event.preventDefault(); });
mqPad.addEventListener('change', () => { closeSheet(); render(); });

// == Boot ========================================================================
// the settings first, so that the first render shows them; then the lists, as
// `content$` gives them. The settings are followed as the lists are: another
// person's change to one shows here too. The signed-in User says whose place is
// kept; a Platform too old to tell keeps none
const boot = async () => {
  try {
    const state = await appState.get();
    if(!settingsPending) applySettings(state)/*a setting changed here stands*/;
  } catch(error) {
    console.warn('Could not read the app-state', error);
  }
  appState.onChange$().subscribe({
    next: (state) => {
      appStateSeen = state; appStateKnown = true;
      settlePlace();
      const changedHere = settingsPending/*before the write below clears it*/;
      if(!writeTimer && (settingsPending || placeToSave)) writeAppState()/*waited for the app-state*/;
      if(changedHere) return/*a setting changed here stands over this older state*/;
      if(!applySettings(state)) return/*no setting changed*/;
      justToggled.clear();
      safeRender();
    },
    error: loseAppState,
  });
  if(typeof window.charmiq.user$ === 'function') {
    window.charmiq.user$().subscribe({
      next: receiveUser,
      error: (error) => { receiveUser(null); noticePlaceUnsaved(error); },
    });
  } else meKnown = true;

  appContent.content$(APP_CONTENT_SELECTOR).subscribe({
    next: receive,
    error: (error) => {
      console.error(`Could not read the ${APP_CONTENT_NAME} app-content`, error);
      showNotice('Couldn’t Load Your Lists', error?.message ?? '');
    },
  });
};
boot();
})();
</script>
</body>
</html>
  </app-source>
  <app-content name="lists.json">
{"kind":"list","id":"rem01","name":"Reminders","color":"#007AFF"}
{"kind":"item","id":"i01","list":"rem01","title":"Tap the circle to complete a reminder","done":true,"flagged":false,"created":1793059200000,"completedAt":1793066966995}
{"kind":"item","id":"i02","list":"rem01","title":"Swipe left on a row to delete it","done":false,"flagged":false,"created":1793059200000}
{"kind":"item","id":"i03","list":"rem01","title":"Tap New Reminder to add one","done":false,"flagged":true,"created":1793059200000}
{"kind":"item","id":"i04","list":"rem01","title":"Add this page to the Home Screen","done":false,"flagged":false,"created":1793059200000}
{"kind":"item","id":"i05","list":"rem01","title":"Open the app for the first time","done":true,"flagged":false,"created":1793059200000}
{"kind":"item","id":"csafmodm","list":"rem01","title":"Eat food!","done":false,"flagged":false,"created":1793116601190}
{"kind":"list","id":"gro01","name":"Groceries","color":"#FF9500"}
{"kind":"item","id":"g01","list":"gro01","title":"Oat milk","done":true,"flagged":false,"created":1793059200000,"completedAt":1793113724758}
{"kind":"item","id":"g02","list":"gro01","title":"Eggs","done":false,"flagged":false,"created":1793059200000}
{"kind":"item","id":"g03","list":"gro01","title":"Coffee beans","done":false,"flagged":true,"created":1793059200000}
{"kind":"item","id":"g04","list":"gro01","title":"Avocados","done":false,"flagged":false,"created":1793059200000}
{"kind":"list","id":"wrk01","name":"Work","color":"#AF52DE"}
{"kind":"item","id":"w01","list":"wrk01","title":"Test the iOS Home Screen shortcut","done":false,"flagged":true,"created":1793059200000}
{"kind":"item","id":"w02","list":"wrk01","title":"Verify app-state persistence","done":false,"flagged":false,"created":1793059200000}
{"kind":"item","id":"w03","list":"wrk01","title":"Ship it","done":false,"flagged":false,"created":1793059200000}
  </app-content>
  <app-state>
{
  "showCompleted": true
}
  </app-state>
</iframe-app>
