# The Flip

*A CSS animation on the front. The code that makes it on the back. One card, two realities — click to flip between them.*

<iframe-app height="500px" width="100%" style="border: 1px solid lightgrey;" src="charmiq://./index.html">
</iframe-app>


## What You're Looking At

The card in front of you is doing two things at once. On one side, a pure-CSS text animation cycles through words endlessly — no JavaScript involved, just keyframes and overflow. On the other side, a live code editor shows the CSS and HTML that produce it.

Hit **Flip Reality**. The card rotates in 3D — `perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden` — the same trick used in flashcard UIs and product showcases, except here you're flipping between *the thing* and *the source of the thing*.

**The editors are live**. Try it: flip to the code side, change `Lifestyle` to `Vacation` in the HTML, then flip back. The animation now cycles your word. Change a color in the CSS tab. Swap `Everything` for your name. Every edit sticks — flip as many times as you want.


## The Techniques

**CSS-only text cycling** — A vertical stack of words with `overflow: hidden` and a single `@keyframes` rule that shifts `margin-top`. No JavaScript timers, no DOM manipulation. The browser's compositor does all the work.

**3D card flip** — Two absolutely-positioned faces with `backface-visibility: hidden`, wrapped in a container with `transform-style: preserve-3d`. Toggling `rotateY(180deg)` with a cubic-bezier ease gives the flip its weight and slight bounce.

**Live editing with CodeMirror** — The back face hosts a CodeMirror instance with tab switching between CSS and HTML. Content persists across flips — edit the HTML, flip to see the result, flip back and your changes are still there.


## Why It Exists

This is a single self-contained HTML file — no build step, no dependencies beyond two CDN scripts. It demonstrates that a polished, interactive demo can live in one file and load instantly. Fork it, swap in your own animation, ship it.


## Credit

The front-face text animation is inspired by Nooray Yemon's [Simple CSS Text Animation](https://codepen.io/yemon/pen/pWoROm).
