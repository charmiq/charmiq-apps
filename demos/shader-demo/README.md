# Shader Demo

*A tiny Shadertoy-like demo in three panes — a live WebGL2 player on the left, a slot-strip image gallery on the right feeding `iChannel0..3`, and a CodeMirror fragment-shader editor underneath. Three Applications composed in a single Document; no servers, no magic.*


## The Stage

<p style="text-align: center;">
  <iframe-app height="420px" width="64%" style="border: 1px solid lightgrey; border-radius: 4px; vertical-align: top;" src="charmiq://.">
  </iframe-app> <iframe-app data-name="channels" height="420px" width="34%" style="border: 1px solid lightgrey; border-radius: 4px; vertical-align: top;" src="charmiq://../../apps/image-gallery">
    <app-state>
{
  "config": {
    "slots": [
      { "id": "iChannel0", "label": "iChannel0" },
      { "id": "iChannel1", "label": "iChannel1" },
      { "id": "iChannel2", "label": "iChannel2" },
      { "id": "iChannel3", "label": "iChannel3" }
    ],
    "orientation": "vertical",
    "zoomSize": 140
  }
}
    </app-state>
  </iframe-app>
</p>

<p style="text-align: center;">
  <iframe-app data-name="editor" height="360px" width="99%" style="border: 1px solid lightgrey; border-radius: 4px;" src="charmiq://../../apps/codemirror-editor">
    <app-content name="shader:shader.frag">
// Liquid lens — drag the mouse to push the image around
//   • ripples radiate from the last click (iMouse.zw)
//   • a soft lens follows the cursor while held (iMouse.xy)
//   • chromatic aberration scales with distortion
//   • subtle film grain + vignette on top
//
// Requires iChannel0. If the channel is unbound you'll see the
// procedural fallback (animated gradient) underneath

#define TAU 6.28318530718

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 res = iResolution.xy;
  vec2 uv  = fragCoord / res;
  vec2 p   = (fragCoord - 0.5 * res) / min(res.x, res.y);

  // Mouse in the same normalized space. Fall back to a slow orbit
  // so the demo still moves before the user touches it
  bool held    = iMouse.z > 0.0;
  vec2 clickPx = abs(iMouse.zw);
  vec2 cursor  = held ? iMouse.xy : 0.5 * res + 0.25 * min(res.x, res.y) * vec2(cos(iTime * 0.4), sin(iTime * 0.5));
  vec2 m       = (cursor  - 0.5 * res) / min(res.x, res.y);
  vec2 c       = (clickPx - 0.5 * res) / min(res.x, res.y);

  // Ripples from the last click point
  float d    = length(p - c);
  float wave = sin(d * 28.0 - iTime * 4.0) * exp(-d * 3.0);

  // Soft attractor lens at the cursor
  vec2  toM  = p - m;
  float dm   = length(toM);
  float lens = exp(-dm * dm * 12.0);
  vec2  pull = -toM * lens * 0.35;

  // Gentle global swirl driven by time
  vec2 pr = rot(0.25 * sin(iTime * 0.3)) * p;

  // Combined distortion field, mapped back to UV space
  vec2 aspect = vec2(min(res.x, res.y) / res.x, min(res.x, res.y) / res.y);
  vec2 dist   = pull + 0.02 * wave * normalize(p - c + 1e-5) + (pr - p) * 0.4;
  vec2 duv    = dist * aspect;

  // Chromatic aberration scales with how much the light is bent
  float ca = 0.004 + 0.02 * (lens + abs(wave));
  vec2  dir = normalize(duv + 1e-5);

  vec2 uvR = uv + duv + dir * ca;
  vec2 uvG = uv + duv;
  vec2 uvB = uv + duv - dir * ca;

  // Sample iChannel0. If unbound (1x1 transparent), blend in a
  // procedural gradient so the screen isn't empty
  vec4 sR = texture(iChannel0, uvR);
  vec4 sG = texture(iChannel0, uvG);
  vec4 sB = texture(iChannel0, uvB);

  vec3 tex  = vec3(sR.r, sG.g, sB.b);
  float haveTex = step(0.01, max(max(sR.a, sG.a), sB.a));

  vec3 proc = 0.5 + 0.5 * cos(iTime + uv.xyx * vec3(6.0, 4.0, 3.0) + vec3(0.0, 2.0, 4.0));
  vec3 col  = mix(proc, tex, haveTex);

  // Highlight the ripple crests a touch
  col += 0.15 * wave * vec3(0.6, 0.8, 1.0);

  // Cursor halo while held
  col += vec3(1.0, 0.95, 0.85) * lens * (held ? 0.25 : 0.08);

  // Vignette
  float v = smoothstep(1.2, 0.3, length(p));
  col *= mix(0.65, 1.0, v);

  // Film grain
  col += (hash12(fragCoord + iTime * 60.0) - 0.5) * 0.03;

  fragColor = vec4(col, 1.0);
}
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
    "shader": "x-shader/x-fragment"
  },
  "tabOrder": [
    "shader"
  ]
}
    </app-state>
  </iframe-app>
</p>


## How To Play

 - **Edit the shader** in the panel below the stage. Hit **Compile** (or **Cmd/Ctrl+Enter**). Flip on **Auto** if you'd rather have recompiles fire after you stop typing.
 - **Compile errors** pulse red under the player with the GLSL infoLog verbatim — line numbers refer to your source, not the wrapped program.
 - **Bind channels** by dragging images into the slot strip on the right (or the platform media picker via the `+` button). Each slot becomes `iChannel0..3` in the shader.
 - **Tune samplers** with the **Samplers** popover in the toolbar — pick `linear / nearest` and `clamp / repeat / mirror` per slot. The meta round-trips through the gallery so it persists with the binding.
 - **Mouse** — `iMouse.xy` tracks the cursor while the button is held; `iMouse.zw` holds the last click position (negated when released).
 - **Transport** — play / pause / reset the clock independently of compile. Reset zeroes `iTime` and `iFrame` without affecting playback state.
 - **Fullscreen** — takes the stage only; the gallery + editor stay put.


## Shader Inputs

The player's preamble declares every demo uniform so your `mainImage` can use them verbatim. None need to be re-declared in your source.

| Uniform | Type | Description |
|----|----|----|
| `iResolution` | `vec3` | viewport resolution in pixels (xy; z is pixel aspect ratio, currently 1.0) |
| `iTime` | `float` | shader playback time in seconds |
| `iTimeDelta` | `float` | render time of the previous frame in seconds |
| `iFrameRate` | `float` | smoothed frames per second |
| `iFrame` | `int` | shader playback frame counter |
| `iChannelTime[4]` | `float[4]` | per-channel playback time in seconds (still images: tracks `iTime`) |
| `iChannelResolution[4]` | `vec3[4]` | per-channel texture resolution in pixels |
| `iMouse` | `vec4` | `xy` = current cursor (while held); `zw` = last click (negated when released) |
| `iChannel0..3` | `sampler2D` | bound texture per slot; a 1×1 transparent pixel when unbound |
| `iDate` | `vec4` | `(year, month, day, secondsSinceMidnight)` |
| `iSampleRate` | `float` | audio sample rate, nominally 44100 (reserved; no audio path yet) |

Entry point signature — write this, not `void main()`:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(fragCoord / iResolution.xy, 0.5 + 0.5 * cos(iTime), 1.0);
}
```

`fragCoord` has origin at the bottom-left. Textures are uploaded with `UNPACK_FLIP_Y_WEBGL = true` so `texture(iChannel0, uv)` samples with the same orientation.


> **For Developers** — the rest of this page covers how the demo is assembled.


## How It's Built

Three Applications cooperating in one Document — none of them know the others exist at build time; they find each other at runtime via capability discovery.

| Application | Role in the Document |
|----|----|
| `shader-demo` (this App) | Live WebGL2 fragment-shader player; pulls source from the editor, textures from the gallery |
| `codemirror-editor` | Single-tab GLSL editor seeded via `<app-content>` below |
| `image-gallery` | Four-slot channel strip seeded via `<app-state>` above |

### Player Internals

| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Identity, import map, advertised `charmiq.command` surface |
| [`src/index.html`](charmiq://./src/index.html) | Canvas stage, status overlay, error strip, toolbar, samplers popover |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Swiss-minimal styling matched to the sibling Apps |
| [`src/shader-program.ts`](charmiq://./src/shader-program.ts) | GLSL preamble + trampoline, compile / link, line-number remapping on failure |
| [`src/renderer.ts`](charmiq://./src/renderer.ts) | WebGL2 pipeline — fullscreen-triangle via `gl_VertexID`, uniform upload, `iChannel0..3` binding |
| [`src/channel-binder.ts`](charmiq://./src/channel-binder.ts) | Discovers `ai.charm.shared.imageGallery`, reconciles bindings into `WebGLTexture`s + sampler meta |
| [`src/editor-bridge.ts`](charmiq://./src/editor-bridge.ts) | Discovers `ai.charm.shared.codemirror-editor`; subscribes to `changes$` filtered to the `shader.frag` tab and republishes via `shaderSource$` |
| [`src/playback.ts`](charmiq://./src/playback.ts) | RAF loop — `iTime` / `iFrame` / `iFrameRate` / `iMouse`; play / pause / reset; telemetry stream |
| [`src/config-store.ts`](charmiq://./src/config-store.ts) | Persists the `autoCompile` toggle (and debounce window) to `appState` |
| [`src/toolbar.ts`](charmiq://./src/toolbar.ts) | Imperative DOM for transport, telemetry readout, samplers popover |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point — composes modules, wires the compile pipeline, advertises the command surface |


### Data Flow

```
            ┌────────────────┐                          ┌────────────────┐
            │  CodeMirror    │                          │ Image Gallery  │
            │  (shader.frag) │                          │ (iChannel0..3) │
            └────────┬───────┘                          └───────┬────────┘
     charmiq.command │                                          │ ai.charm.shared.imageGallery
                     ▼                                          ▼
            ┌────────────────┐                          ┌────────────────┐
            │ EditorBridge   │                          │ ChannelBinder  │
            │ (pull on       │                          │ (state$ →      │
            │  compile)      │                          │  WebGLTexture) │
            └────────┬───────┘                          └───────┬────────┘
                     │ getShader()                              │ channels[]
                     ▼                                          │
            ┌────────────────┐                                  │
            │    compile()   │                                  │
            │  preamble +    │                                  │
            │  trampoline    │                                  │
            └────────┬───────┘                                  │
                     │ setShader()                              │
                     ▼                                          ▼
                ┌───────────────────────────────────────────────────┐
                │                  Renderer                         │
                │   gl_VertexID triangle + iTime / iMouse / iCh*    │
                └───────────────────────────┬───────────────────────┘
                                            ▲
                                            │ render(inputs, channels)
                                            │
                                  ┌────────────────┐
                                  │    Playback    │
                                  │    (RAF)       │
                                  └────────┬───────┘
                                           │ telemetry$
                                           ▼
                                  ┌────────────────┐
                                  │    Toolbar     │
                                  │ (time / fps /  │
                                  │  samplers pop) │
                                  └────────────────┘
```

### How The Apps Find Each Other

None of the three manifests reference each other. At load time:

 - The player calls `charmiq.discover$('ai.charm.shared.codemirror-editor')` and subscribes to each returned editor's `changes$()`, filtering for a tab named `shader.frag`. Auto-compile is push-driven off that stream — no polling.
 - The player calls `charmiq.discover('ai.charm.shared.imageGallery')` to attach to the gallery's reactive `state$()` — that is what the gallery exists for (see the comment in its [`command-surface.ts`](charmiq://../../apps/image-gallery/src/command-surface.ts): *"e.g. a shader player watching slot bindings"*).
 - The player itself advertises `charmiq.command` (play, pause, reset, compile, setAutoCompile) so an agent — or a future toolbar next to it — can drive it.

### State vs Content — the Split

Matching the pattern established by the gallery:

 - **`appContent`** — the shader source. Owned by the editor; the player *reads* it on each compile via `getText({ tabId })`.
 - **`appState` (player)** — `autoCompile` and its debounce window. Pure UI preference.
 - **`appState` (gallery)** — slot definitions (`iChannel0..3`), orientation, zoom. Seeded by this README.
 - **`appContent` (gallery)** — item list + bindings (with the player's `{ filter, wrap }` meta hung on each binding).

Everything an auto-compile depends on — source, bindings, filter / wrap meta — persists across reloads without the player storing any of it directly.


### Compile Pipeline

The user source is wrapped once per compile:

```glsl
#version 300 es
precision highp float;
precision highp int;

uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform float iFrameRate;
uniform int   iFrame;
uniform float iChannelTime[4];
uniform vec3  iChannelResolution[4];
uniform vec4  iMouse;
uniform vec4  iDate;
uniform float iSampleRate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

out vec4 cmq_FragColor;

/* — user source inlined here — */

void main() { mainImage(cmq_FragColor, gl_FragCoord.xy); }
```

On failure the infoLog's line numbers are shifted back by the preamble size so errors point at the line you typed.


## Credit

[Shadertoy](https://www.shadertoy.com/) is the original and the obvious inspiration — the uniform conventions, the entry-point shape, and the iMouse semantics all come from it.
