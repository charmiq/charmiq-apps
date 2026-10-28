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

<iframe-app height="100svh" width="100%">
  <app-source>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Status Bar Probe</title>
<style>
:root {
  --top: #FF00AA;
  --bottom: #00C853;
  --page: #FFFFFF;
  --text: #000000;
}
@media (prefers-color-scheme: dark) {
  :root {
    --top: #00B8FF;
    --bottom: #FFAB00;
    --page: #111111;
    --text: #FFFFFF;
  }
}
html, body {
  margin: 0;
  height: 100%;
  background: var(--page);
  color: var(--text);
  font: 15px/1.4 -apple-system, system-ui, sans-serif;
}
/* a loud band at each edge: anything drawn under the status bar or home bar shows */
.band {
  position: fixed;
  left: 0;
  right: 0;
  height: 24px;
}
.band.top {
  top: 0;
  background: var(--top);
}
.band.bottom {
  bottom: 0;
  background: var(--bottom);
}
/* reads the frame's safe-area insets through padding */
#inset {
  position: fixed;
  visibility: hidden;
  padding: env(safe-area-inset-top, -1px) env(safe-area-inset-right, -1px) env(safe-area-inset-bottom, -1px) env(safe-area-inset-left, -1px);
}
main {
  padding: 40px 16px;
}
h1 {
  font-size: 20px;
  margin: 0 0 12px;
}
table {
  border-collapse: collapse;
  width: 100%;
}
td {
  padding: 4px 0;
  border-bottom: 1px solid rgba(127,127,127,.3);
}
td:last-child {
  text-align: right;
  font-family: ui-monospace, monospace;
}
</style>
</head>
<body>
<div class="band top"></div>
<div class="band bottom"></div>
<div id="inset"></div>
<main>
  <h1>Status Bar Probe</h1>
  <p>Top band: magenta in light, blue in dark. Bottom band: green in light, amber in dark.</p>
  <table id="facts"></table>
</main>
<script>
const facts = () => {
  const inset = getComputedStyle(document.getElementById('inset'));
  const query = (media) => window.matchMedia(media).matches ? 'yes' : 'no';
  return [
    ['inset top (frame)', inset.paddingTop],
    ['inset right (frame)', inset.paddingRight],
    ['inset bottom (frame)', inset.paddingBottom],
    ['inset left (frame)', inset.paddingLeft],
    ['frame size', window.innerWidth + ' × ' + window.innerHeight],
    ['screen size', screen.width + ' × ' + screen.height],
    ['pixel ratio', String(window.devicePixelRatio)],
    ['dark scheme', query('(prefers-color-scheme: dark)')],
    ['display-mode standalone', query('(display-mode: standalone)')],
    ['display-mode browser', query('(display-mode: browser)')],
    ['in a frame', (window.top !== window) ? 'yes' : 'no'],
    ['updated', new Date().toLocaleTimeString()],
  ];
};
const render = () => {
  document.getElementById('facts').innerHTML = facts().map(([label, value]) => '<tr><td>' + label + '</td><td>' + value + '</td></tr>').join('');
};
render();
window.addEventListener('resize', render);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
document.addEventListener('visibilitychange', render);
</script>
</body>
</html>
  </app-source>
</iframe-app>
