import * as THREE from 'three';

import type { PartLine } from '../grid';
import { ringLean, type PoseMarks, RING } from '../pose-gesture';
import type { Point } from '../stage';

// what a figure posed by hand is handled with: light and small objects in the studio's
// scene, drawn by its renderer over the frame just drawn and held against the frame's
// own depth, so the set stands in front of them where it does. The part under the
// pointer takes a soft rim of light round its silhouette, brighter held, and a line of
// light along its travel with a band standing along its joint's axis, ruled each
// fifteen degrees, bright the way it has come and a bead where it stands, with a milky
// copy of the limb and what it carries where they were; a ring of warm light floats
// about the figure's feet over a pool of light on the ground, a bead at its front and
// pips round it that light at each quarter turn and grow under the pointer, the turn
// swept filled as a wedge, leaned up toward a camera that would see it edge on, and
// seen dimmed through whatever stands before it; the studs it will seat on glow from
// their tops and a ripple runs out as it seats; a pinned foot wears a push-pin in its
// toe; a figure lifted stands on a clear rod; where the set
// stops a piece, that piece and the part of the set it meets are both rimmed red, as a piece inside the set is.
// Every light is laid over what it lies on rather than added to it: a dark hairline
// under a bright core, so it reads on white plastic as on a dark doorway. A light
// eases in and out; nothing eases from one place to another: every mark stands where
// the figure is, the frame it is there. It is the person's aid, never the film's: no
// capture draws it
// ********************************************************************************
// == Constants ===================================================================
/** the lights, as the picture shows them: warm for what turns the figure, cool for a
 *  figure set down loose, azure for what the pointer holds, gold for studs, red for
 *  what stands inside the set, ice for where a part was, violet and green for ghosts */
const WARM = 0xffa31a, COOL = 0x8fdcff, HELD = 0x35b6ff, STUD = 0xffc93a, HOT = 0xff5a1f, INSIDE = 0xff2d2d, ICE = 0xdcefff, VIOLET = 0xa487ff, GREEN = 0x3fe38a;
/** how long a change takes to ease in (seconds): critically damped, so nothing pops */
const EASE = 0.07, SLOW = 0.11;
/** how far the ring's pool of light reaches (studs) and how high over the ground the
 *  ring floats */
const POOL = RING * 1.45, FLOAT = 0.12;
/** how much of its light a thing shows through what stands before it, and how much of
 *  what stands behind it the milky copy of a part where it was covers */
const THROUGH = 0.3, MILK = 0.42;
/** how much of its light a part's travel, and the knob, show through what stands
 *  before them: what the hand holds is found wherever it lies */
const THROUGH_HELD = 0.6;
/** how long a seat's ripple runs (seconds) and how far it reaches (studs) */
const RIPPLE_SECONDS = 0.45, RIPPLE_REACH = 2.6;
/** a stud's top: its radius, how far its glow reaches, its height over the surface and
 *  how far across the bloom of light over it is (studs) */
const STUD_RADIUS = 0.3, STUD_GLOW = 0.95, STUD_TOP = 0.17 * 0.4, STUD_BLOOM = 1.7;
/** a push-pin's size beside its own and how far its point sinks into what it pins (its
 *  own length's share); how far ahead of a pinned foot's contact it goes in, and from
 *  how far over the contact the top of the toe there is looked for (studs) */
const PIN_SIZE = 1.1, PIN_SINKS = 0.1, TOE_AHEAD = 0.34, TOE_OVER = 0.8;
/** how far either side of a limb's travel its band reaches along the joint's axis
 *  (studs), and how far past the way the limb has come its travel is drawn, fading: a
 *  sixth of the half turn traced, thirty degrees */
const BAND = 0.2, LEAD = 1 / 6;
/** a rod's radius and its foot's (studs) */
const ROD = 0.1, ROD_FOOT = 0.66;
const UP = new THREE.Vector3(0, 1, 0);

// -- Shaders ---------------------------------------------------------------------
/** a line of light a constant width on the picture, whatever looks at it: each point
 *  pushed out across the way the line runs there. A bright core over a dark hairline,
 *  a glow falling off beside it; `sweep` brightens a run of it, `fade` fades its ends */
const LINE_VERTEX = `
attribute vec3 before;
attribute vec3 after;
attribute float side;
attribute float along;
uniform vec2 picture;
uniform float scale;
uniform float reach;
varying float across;
varying float run;
void main() {
  mat4 seen = projectionMatrix * modelViewMatrix;
  vec4 here = seen * vec4(position, 1.0), from = seen * vec4(before, 1.0), to = seen * vec4(after, 1.0);
  vec2 way = ((to.xy / to.w) - (from.xy / from.w)) * picture;
  way = (dot(way, way) > 1e-12) ? normalize(way) : vec2(1.0, 0.0);
  here.xy += vec2(-way.y, way.x) * side * ((reach * scale) / picture) * 2.0 * here.w;
  across = side;
  run = along;
  gl_Position = here;
}`;
const LINE_FRAGMENT = `
uniform vec3 color;
uniform float strength;
uniform float dim;
uniform float scale;
uniform float reach;
uniform float core;
uniform float ink;
uniform float glow;
uniform float fade;
uniform vec2 sweep;
uniform float rest;
uniform float lead;
varying float across;
varying float run;
void main() {
  float out_ = abs(across) * reach;
  float line = 1.0 - smoothstep(core - 0.6, core + 0.6, out_);
  float under = (1.0 - smoothstep(core + 1.2, core + 2.6, out_)) * ink;
  float halo = pow(max(0.0, 1.0 - abs(across)), 2.4) * glow;
  float ends = (fade > 0.0) ? smoothstep(0.0, fade, run) * smoothstep(0.0, fade, 1.0 - run) : 1.0;
  float swept = smoothstep(sweep.x - 0.004, sweep.x + 0.004, run) * (1.0 - smoothstep(sweep.y - 0.004, sweep.y + 0.004, run));
  float led = (lead > 0.0) ? max(0.0, 1.0 - (max(max(sweep.x - run, run - sweep.y), 0.0) / lead)) : 1.0;
  float light = strength * dim * ends * mix(rest * led, 1.0, swept);
  gl_FragColor = vec4(((mix(color, vec3(1.0), 0.3) * line) + (color * halo * (1.0 - line))) * light, (max(line, under) + (halo * 0.45 * (1.0 - line))) * light);
}`;
/** pips of light, each a constant size on the picture (`size`, pixels across its core):
 *  a bright core over a dark hairline, a glow about it; `lit` pips brighten with `lift`,
 *  and those round a ring nearest the pointer (`near`, their `turn` round it) grow */
const PIP_VERTEX = `
attribute float size;
attribute float lit;
attribute float turn;
uniform float scale;
uniform float lift;
uniform float near;
uniform float nearby;
varying float core;
varying float bright;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float off = abs(mod((turn - near) + 3.1415927, 6.2831853) - 3.1415927);
  float grown = nearby * exp(-pow(off / 0.42, 2.0));
  float across = size * (1.0 + (0.5 * lit * lift) + (1.3 * grown)) * scale;
  gl_PointSize = (across * 3.2) + 4.0;
  core = (across * 0.5) / (gl_PointSize * 0.5);
  bright = mix(1.0, 0.55 + (0.75 * lift), lit) + (0.5 * grown);
}`;
const PIP_FRAGMENT = `
uniform vec3 color;
uniform float strength;
uniform float dim;
uniform float hot;
uniform float ink;
uniform float glow;
varying float core;
varying float bright;
void main() {
  float out_ = length((gl_PointCoord * 2.0) - 1.0), edge = core * 0.22;
  float dot_ = 1.0 - smoothstep(core - edge, core + edge, out_);
  float under = (1.0 - smoothstep(core * 1.25, core * 1.6, out_)) * ink;
  float halo = pow(max(0.0, 1.0 - out_), 2.6) * glow;
  float light = strength * dim * bright;
  gl_FragColor = vec4(((mix(color, vec3(1.0), hot) * dot_) + (color * halo * (1.0 - dot_))) * light, min(1.0, (max(dot_, under) + (halo * 0.45 * (1.0 - dot_))) * light));
}`;
/** a band of light along a limb's travel, standing along its joint's axis: a fill, a
 *  line down each edge and a rule across it each fifteen degrees (`ruled`: where the
 *  first lies along it, and how far apart they lie), bright where the limb has come
 *  (`sweep`) and running on faintly a little past it (`lead`), no further */
const BAND_VERTEX = `
varying vec2 at;
void main() { at = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BAND_FRAGMENT = `
uniform vec3 color;
uniform float strength;
uniform float dim;
uniform vec2 sweep;
uniform vec2 ruled;
uniform float lead;
varying vec2 at;
void main() {
  float swept = smoothstep(sweep.x - 0.004, sweep.x + 0.004, at.x) * (1.0 - smoothstep(sweep.y - 0.004, sweep.y + 0.004, at.x));
  float led = max(0.0, 1.0 - (max(max(sweep.x - at.x, at.x - sweep.y), 0.0) / lead));
  float rule = 1.0 - smoothstep(0.035, 0.085, abs(fract(((at.x - ruled.x) / ruled.y) + 0.5) - 0.5));
  float edge = smoothstep(0.8, 0.94, abs(at.y));
  float line = max(rule * 0.75, edge * 0.6);
  float light = max(0.34, line) * mix(0.3 * led, 1.0, swept) * strength * dim;
  gl_FragColor = vec4(mix(color, vec3(1.0), line * 0.45) * light, light * 0.9);
}`;
/** plastic that is mostly its edges: lit from over the camera's shoulder, bright where
 *  it turns away (fresnel), a glint where it catches the light. Frosted with a little
 *  body, clear with almost none */
const FROST_VERTEX = `
varying vec3 facing;
varying vec3 toward;
void main() {
  vec4 at = modelViewMatrix * vec4(position, 1.0);
  facing = normalize(normalMatrix * normal);
  toward = normalize(-at.xyz);
  gl_Position = projectionMatrix * at;
}`;
const FROST_FRAGMENT = `
uniform vec3 color;
uniform float strength;
uniform float body;
uniform float gloss;
uniform float rim;
uniform float shade;
varying vec3 facing;
varying vec3 toward;
const vec3 LIT_FROM = vec3(-0.45, 0.72, 0.53);
void main() {
  vec3 out_ = normalize(facing) * (gl_FrontFacing ? 1.0 : -1.0), eye = normalize(toward);
  float edge = pow(1.0 - abs(dot(out_, eye)), 2.0) * rim;
  float lit = (1.0 - shade) + (shade * dot(out_, LIT_FROM));
  float glint = pow(max(0.0, dot(out_, normalize(LIT_FROM + eye))), 48.0) * gloss;
  float cover = min(1.0, (body + ((1.0 - body) * edge) + glint) * strength);
  gl_FragColor = vec4(mix(color * lit, vec3(1.0), min(1.0, (edge * 0.55) + glint)) * cover, cover);
}`;
/** light lying flat: a soft pool, a dish brightest at its rim (`dish`) with a wedge of
 *  it filled (`wedge`, from one turn round it to another), a stud's top
 *  (`fill`, the share of its radius that is the stud, a glow round it) or a band
 *  running out (`band`, the share
 *  of its radius it stands at) */
const GROUND_VERTEX = `
varying vec2 across;
void main() { across = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GROUND_FRAGMENT = `
uniform vec3 color;
uniform float strength;
uniform float dim;
uniform float fill;
uniform float band;
uniform float dish;
uniform vec2 wedge;
uniform float wedged;
uniform float cover;
varying vec2 across;
float turned(float turn) { return mod(turn + 3.1415927, 6.2831853) - 3.1415927; }
void main() {
  float out_ = length(across - 0.5) * 2.0;
  // a dish's wedge: the turn swept from one way round it to another, the short way
  float swept = turned(wedge.y - wedge.x), here = turned(atan(across.x - 0.5, 0.5 - across.y) - wedge.x);
  float within = ((swept >= 0.0) ? step(0.0, here) * step(here, swept) : step(here, 0.0) * step(swept, here)) * wedged * (1.0 - smoothstep(0.96, 1.0, out_)) * smoothstep(0.02, 0.1, out_);
  float soft = (dish > 0.0) ? max(pow(out_, 3.0) * (1.0 - smoothstep(0.96, 1.0, out_)), within * (2.2 + (1.2 * out_))) : pow(max(0.0, 1.0 - out_), 1.7);
  float top = (fill > 0.0) ? 1.0 - smoothstep(fill - 0.03, fill + 0.03, out_) : 0.0;
  float rim = (fill > 0.0) ? exp(-pow((out_ - fill) / 0.045, 2.0)) : 0.0;
  float wave = (band > 0.0) ? exp(-pow((out_ - band) / 0.07, 2.0)) * (1.0 - smoothstep(0.86, 1.0, out_)) : 0.0;
  float light = (band > 0.0) ? wave : max(top * 0.78, (fill > 0.0) ? soft * 0.6 : soft);
  light = max(light, rim) * strength * dim;
  gl_FragColor = vec4(mix(color, vec3(1.0), (rim * 0.5) + (wave * 0.35)) * light, light * cover);
}`;
/** a silhouette drawn unseen for the rims, in a channel of its own, a hair nearer the
 *  camera than it stands: a face it shares with a piece it touches is its own */
const SHAPE_VERTEX = `
void main() {
  vec4 at = modelViewMatrix * vec4(position, 1.0);
  at.xyz -= normalize(at.xyz) * 0.07;
  gl_Position = projectionMatrix * at;
}`;
const SHAPE_FRAGMENT = `
uniform vec4 channel;
void main() { gl_FragColor = channel; }`;
/** the rims of light, laid over the whole picture: `shapes` holds what the picture
 *  shows of each rimmed thing, a channel a kind (what the pointer holds, what stands
 *  inside the set, a frosted copy, the drawings before). Round the first two runs a
 *  bright line just outside the shape, a glow falling off beyond, and a little light
 *  wrapping onto its own edge; round a frosted thing, a fine line alone. A hole in a
 *  shape smaller than the glow (a face's print, drawn apart) is no edge */
const RIM_VERTEX = `
varying vec2 at;
void main() { at = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const RIM_FRAGMENT = `
uniform sampler2D shapes;
uniform vec2 texel;
uniform float scale;
uniform vec3 heldColor;
uniform vec3 insideColor;
uniform vec3 frostColor;
uniform vec3 beforeColor;
uniform vec4 lights;
uniform float grip;
uniform float milk;
varying vec2 at;
vec2 round_(float turn, float out_) { return vec2(cos(turn), sin(turn)) * out_ * scale * texel; }
void main() {
  vec4 here = texture2D(shapes, at), near = vec4(0.0), mid = vec4(0.0), far = vec4(0.0);
  for(int tap = 0; tap < 12; tap++) {
    float turn = float(tap) * 0.5235988;
    near += texture2D(shapes, at + round_(turn, 1.1));
    mid += texture2D(shapes, at + round_(turn + 0.2617994, 2.8));
  }
  for(int tap = 0; tap < 20; tap++) far += texture2D(shapes, at + round_(float(tap) * 0.3141593, 5.6));
  near = min(near / 12.0, 1.0); mid = min(mid / 12.0, 1.0); far = min(far / 20.0, 1.0);
  here = max(min(here, 1.0), smoothstep(0.62, 0.86, far));
  vec4 off = 1.0 - here;
  vec4 line = off * smoothstep(0.04, 0.5, near);
  vec4 halo = off * pow((0.55 * mid) + (0.45 * far), vec4(1.25)) * vec4(0.75 + (0.75 * grip), 1.7, 0.12, 0.12);
  vec4 wrap = here * (1.0 - mid) * vec4(0.7, 0.7, 0.0, 0.0);
  vec4 fill = here * vec4(0.0, 0.0, milk, 0.0);
  vec4 lit = (line + halo + wrap + fill) * lights;
  vec4 cover = ((line * 0.92) + (halo * 0.4) + (wrap * 0.4) + fill) * lights;
  vec3 color = (mix(heldColor, vec3(1.0), 0.45 * line.r) * lit.r) + (mix(insideColor, vec3(1.0), 0.3 * line.g) * lit.g) + (mix(frostColor, vec3(1.0), 0.3 * line.b) * lit.b) + (mix(beforeColor, vec3(1.0), 0.2 * line.a) * lit.a);
  gl_FragColor = vec4(color, min(1.0, cover.r + cover.g + cover.b + cover.a));
}`;

// == Types =======================================================================
/** a part's geometry and where it stands in the scene, as the studio draws it */
export type Shape = Readonly<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; }>;
/** a line's shape, none for a part the studio has not drawn */
export type Drawn = (line: PartLine) => Shape | undefined;
/** a strength eased toward where it is told to stand */
type Eased = { value: number; target: number; over: number; };
/** what every light of a kind shares: its color and its strength */
type Lit = Readonly<{ color: { value: THREE.Color; }; strength: { value: number; }; }>;
/** the picture every line and pip is sized for: its pixels, and how many of them the
 *  page shows as one of its own, every width being told in the page's pixels */
type Picture = Readonly<{ picture: { value: THREE.Vector2; }; scale: { value: number; }; }>;

// == Class =======================================================================
export class PoseRig {
  private readonly scene = new THREE.Scene();
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly eased: Eased[] = [];
  private readonly seen: Picture = { picture: { value: new THREE.Vector2(1, 1) }, scale: { value: 1 } };
  private last = 0;

  // .. Ring ......................................................................
  private readonly ring = new THREE.Group();
  /** an arrowhead on the ring where the figure faces, and the bead on the point of the ring taken while it is turned */
  private readonly front = new THREE.Group();
  private readonly grabbed = new THREE.Group();
  private readonly ringLit = lit(WARM);
  private readonly pipsLit = { ...lit(WARM), lift: { value: 0 }, near: { value: 0 }, nearby: { value: 0 } };
  private readonly beadLit = { ...lit(WARM), lift: { value: 0 } };
  private readonly dishLit = lit(WARM);
  private readonly dish: THREE.ShaderMaterial;
  private readonly nearShown = this.ease(0);
  private readonly turning = this.ease(0);
  private readonly pool: THREE.Mesh;
  private readonly poolLit = lit(WARM);
  private readonly ringLine: THREE.ShaderMaterial;
  private readonly ringShown = this.ease(0, SLOW);
  private readonly ringHeld = this.ease(0);
  private readonly ringOver = this.ease(0);
  private readonly squared = this.ease(0);
  private readonly loose = this.ease(0);
  private ringAt: THREE.Vector3 | undefined;

  // .. Part ......................................................................
  /** the silhouettes of what is rimmed, drawn unseen, and the rims laid over the picture */
  private readonly shapes = new THREE.Scene();
  private readonly rimmed = new THREE.Group();
  private readonly insides = new THREE.Group();
  /** the set's parts a gesture is stopped by, rimmed as what stands inside the set is */
  private readonly touched = new THREE.Group();
  private readonly wasShape = new THREE.Group();
  private readonly previewShape = new THREE.Group();
  private readonly ghostShapes = new THREE.Group();
  private shapesTarget: THREE.WebGLRenderTarget | undefined;
  private readonly rims = new THREE.ShaderMaterial({
    uniforms: { shapes: { value: null }, texel: { value: new THREE.Vector2() }, scale: this.seen.scale, heldColor: { value: shown(HELD) }, insideColor: { value: shown(INSIDE) }, frostColor: { value: shown(ICE) }, beforeColor: { value: shown(VIOLET) }, lights: { value: new THREE.Vector4() }, grip: { value: 0 }, milk: { value: MILK } },
    vertexShader: RIM_VERTEX, fragmentShader: RIM_FRAGMENT, ...OVER, depthTest: false,
  });
  private readonly rimScene = new THREE.Scene();
  private readonly rimCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly partShown = this.ease(0);
  private readonly partHeld = this.ease(0);
  private readonly insideShown = this.ease(0);
  private readonly wasShown = this.ease(0, SLOW);
  private readonly ghosts = new THREE.Group();
  private readonly ghostFrost = frost(VIOLET, 0.36, 0.35);
  private readonly ghostsShown = this.ease(0, SLOW);
  private readonly preview = new THREE.Group();
  private readonly previewFrost = frost(GREEN, 0.36, 0.5);
  private readonly previewShown = this.ease(0, SLOW);

  // .. Travel ....................................................................
  private readonly arc = new THREE.Group();
  private readonly arcLit = lit(HELD);
  private readonly arcLine: THREE.ShaderMaterial;
  private readonly arcThrough: THREE.ShaderMaterial;
  /** its pips and the bead where the part stands, each as itself and seen through what stands before it; the bead red while the set stops the part */
  private readonly tickPips: readonly [THREE.ShaderMaterial, THREE.ShaderMaterial];
  private readonly nowLit = lit(HELD);
  private readonly nowPips: readonly [THREE.ShaderMaterial, THREE.ShaderMaterial];
  private readonly arcBand: THREE.ShaderMaterial;
  private readonly arcBandThrough: THREE.ShaderMaterial;
  private readonly arcShown = this.ease(0);

  // .. Ground ....................................................................
  private readonly studs = new THREE.Group();
  private readonly studLit = lit(STUD);
  private readonly studTop = ground(this.studLit, { fill: STUD_RADIUS / STUD_GLOW, cover: 0.9 });
  private readonly studThrough = ground(this.studLit, { fill: STUD_RADIUS / STUD_GLOW, cover: 0.9, through: true });
  private readonly bloomLit = lit(STUD);
  private readonly studBloom = Object.assign(ground(this.bloomLit, { cover: 0.45 }), { depthTest: false });
  private readonly studsShown = this.ease(0);
  private readonly ripple: THREE.Mesh;
  private readonly rippleLit = lit(STUD);
  private rippled: number | undefined;
  private seats = 0;
  private readonly pin = new THREE.Group();
  private readonly pinShown = this.ease(0);
  private readonly rod = new THREE.Group();
  private readonly rodClear = frost(0xe2f2ff, 0.2, 1.6);
  private readonly rodShown = this.ease(0, SLOW);
  private readonly knob = new THREE.Group();
  private readonly knobLit = lit(HELD);
  private readonly knobStalk = [false, true].map(through => line(this.knobLit, this.seen, { core: 0.6, ink: 0.5, glow: 0.3, reach: 5, through, dim: THROUGH_HELD }));
  private readonly knobBead = [false, true].map(through => pips({ ...this.knobLit, lift: { value: 0 }, ...this.seen }, { hot: 0.8, ink: 0.7, glow: 0.7, through, dim: THROUGH_HELD }));
  private readonly knobShown = this.ease(0, SLOW);

  public constructor(private readonly drawn: Drawn, private readonly scenePoint: (point: Point) => THREE.Vector3) {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5), placed(new THREE.DirectionalLight(0xffffff, 2.4), new THREE.Vector3(-4, 9, 6)));

    // the ring: a line of light, a pip each fifteen degrees (the quarter turns larger) and a bead at the figure's front, each seen dimmed through what stands before it; under it a pool of light on the ground
    const round = Array.from({ length: 97 }, (_, index) => { const angle = (index / 96) * 2 * Math.PI; return new THREE.Vector3(Math.sin(angle) * RING, 0, Math.cos(angle) * RING); });
    const marks = Array.from({ length: 24 }, (_, index) => ({ at: round[index * 4], size: ((index % 6) === 0) ? 5 : 2.6, lit: ((index % 6) === 0) ? 1 : 0, turn: (index / 24) * 2 * Math.PI }));
    this.ringLine = line(this.ringLit, this.seen, { core: 1.4, ink: 0.9, glow: 0.7, reach: 12 });
    this.dish = ground(this.dishLit, { dish: true, cover: 0.7 });
    this.ring.add(new THREE.Mesh(new THREE.CircleGeometry(RING, 64).rotateX(-Math.PI / 2), this.dish));
    this.ring.add(...twice(through => new THREE.Mesh(lineOf(round), through ? line(this.ringLit, this.seen, { core: 1.4, ink: 0.7, glow: 0.3, reach: 12, through }) : this.ringLine)));
    this.ring.add(...twice(through => new THREE.Points(pipsOf(marks), pips({ ...this.pipsLit, ...this.seen }, { hot: 0.12, ink: 0.7, glow: 0.35, through }))));
    const arrow = [new THREE.Vector3(-0.2, 0, RING * 0.9), new THREE.Vector3(0, 0, RING * 1.1), new THREE.Vector3(0.2, 0, RING * 0.9)];
    this.front.add(...twice(through => new THREE.Mesh(lineOf(arrow), line(this.ringLit, this.seen, { core: 1.6, ink: 0.9, glow: 0.4, reach: 9, through }))));
    this.grabbed.add(...twice(through => new THREE.Points(pipsOf([{ at: new THREE.Vector3(0, 0, RING), size: 10, lit: 1 }]), pips({ ...this.beadLit, ...this.seen }, { hot: 0.22, ink: 0.8, glow: 0.9, through }))));
    this.ring.add(this.front, this.grabbed);
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(POOL, 48).rotateX(-Math.PI / 2), ground(this.poolLit, { cover: 0.55 }));

    // a limb's travel: its line, its pips, the bead where it stands, and the band along its joint's axis
    this.arcLine = line(this.arcLit, this.seen, { core: 1.1, ink: 0.6, glow: 0.6, reach: 9, rest: 0.5, lead: LEAD });
    this.arcThrough = line(this.arcLit, this.seen, { core: 1.1, ink: 0, glow: 0.3, reach: 9, rest: 0.5, lead: LEAD, through: true, dim: THROUGH_HELD });
    this.tickPips = [pips({ ...this.arcLit, lift: { value: 0 }, ...this.seen }, { hot: 0.45, ink: 0.6, glow: 0.3 }), pips({ ...this.arcLit, lift: { value: 0 }, ...this.seen }, { hot: 0.45, ink: 0.6, glow: 0.3, through: true, dim: THROUGH_HELD })];
    this.nowPips = [pips({ ...this.nowLit, lift: { value: 0 }, ...this.seen }, { hot: 0.9, ink: 0.7, glow: 0.9 }), pips({ ...this.nowLit, lift: { value: 0 }, ...this.seen }, { hot: 0.9, ink: 0.7, glow: 0.9, through: true, dim: THROUGH_HELD })];
    this.arcBand = band(this.arcLit, false);
    this.arcBandThrough = band(this.arcLit, true, THROUGH_HELD);

    // the ripple a seat sends out, the push-pin, the rod on its foot and the knob on its stalk
    this.ripple = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), ground(this.rippleLit, { band: 0.8, cover: 0.7 }));
    const steel = new THREE.MeshStandardMaterial({ color: 0xe3e7ec, metalness: 1, roughness: 0.18 }), head = new THREE.MeshPhysicalMaterial({ color: 0xe5352b, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.pin.add(
      placed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.003, 0.42, 12), steel), new THREE.Vector3(0, 0.21, 0)),
      placed(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.08, 0.06, 28), head), new THREE.Vector3(0, 0.43, 0)),
      placed(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.07, 0.17, 28), head), new THREE.Vector3(0, 0.54, 0)),
      placed(new THREE.Mesh(new THREE.SphereGeometry(0.09, 28, 18).scale(1, 0.62, 1), head), new THREE.Vector3(0, 0.63, 0)),
      // its head again, seen dimmed through whatever stands before it: a foot seen from behind hides its own pin
      placed(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.11, 28, 18), new THREE.MeshBasicMaterial({ color: 0xe5352b, transparent: true, opacity: THROUGH_HELD, depthTest: false, depthWrite: false })), { renderOrder: 5 }), new THREE.Vector3(0, 0.55, 0)),
    );
    this.rod.add(new THREE.Mesh(new THREE.CylinderGeometry(ROD, ROD, 1, 28, 1, true).translate(0, 0.5, 0), this.rodClear), new THREE.Mesh(new THREE.CylinderGeometry(ROD_FOOT, ROD_FOOT, 0.07, 48).translate(0, 0.035, 0), this.rodClear));
    this.scene.add(this.pool, this.studs, this.ripple, this.ghosts, this.preview, this.ring, this.arc, this.rod, this.pin, this.knob);
    for(const each of [this.pool, this.ring, this.ripple, this.rod, this.pin, this.knob]) each.visible = false;

    this.shapes.add(this.rimmed, this.insides, this.touched, this.wasShape, this.previewShape, this.ghostShapes);
    for(const each of this.shapes.children) each.visible = false;
    this.rimScene.add(Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.rims), { frustumCulled: false }));
  }

  // == Marks =====================================================================
  /** whether anything of the rig shows, or still eases out */
  public get isShown(): boolean { return this.eased.some(each => (each.value > 0.002) || (each.target > 0)) || (this.rippled !== undefined); }

  /** the marks a posed figure wears from now (SEE: pose-gesture.ts PoseMarks), with the
   *  shapes of the set's parts a gesture is stopped by (`touched`, as the studio draws
   *  them): each light eases in; none, and all ease away */
  public show(marks: PoseMarks | undefined, touched: ReadonlyArray<Shape> = []): void {
    // the ring: where it lies, at once
    this.ringShown.target = marks?.ring ? 1 : 0;
    if(marks?.ring) {
      this.ringAt = this.scenePoint(marks.ring.at);
      this.ringAt.y += FLOAT;
      // how far round the ring a point of it lies, as the scene stands it: read from the point itself
      const middle = this.scenePoint(marks.ring.at), round = (point: Point) => { const at = this.scenePoint(point); return Math.atan2(at.x - middle.x, at.z - middle.z); };
      this.front.rotation.y = round(marks.ring.front);
      // where the pointer lies on it (the scene's north runs the other way)
      this.nearShown.target = (marks.ring.near !== undefined) ? 1 : 0;
      if(marks.ring.near !== undefined) this.pipsLit.near.value = (180 - marks.ring.near) * (Math.PI / 180);
      // while it is turned: a bead on the point of it taken, and the turn swept from where that point was
      this.turning.target = (marks.ring.grab && marks.ring.now) ? 1 : 0;
      if(marks.ring.grab && marks.ring.now) {
        this.grabbed.rotation.y = round(marks.ring.now);
        (this.dish.uniforms.wedge.value as THREE.Vector2).set(round(marks.ring.grab), round(marks.ring.now));
      } /* else -- not held */
      this.ringHeld.target = marks.ring.held ? 1 : 0;
      this.ringOver.target = (marks.ring.over || marks.ring.held) ? 1 : 0;
      this.loose.target = marks.ring.loose ? 1 : 0;
      this.squared.target = (Math.abs(marks.ring.yaw - (Math.round(marks.ring.yaw / 90) * 90)) < 0.05) ? 1 : 0;
    } else if(!marks) this.ringAt = undefined;

    // the part under the pointer or held, the pieces inside the set, and the frosted copies
    this.partShown.target = marks?.part ? 1 : 0;
    this.partHeld.target = marks?.part?.held ? 1 : 0;
    if(marks?.part) this.stand(this.rimmed, marks.part.lines, [SHAPE_HELD]);
    // red round what stands inside the set, and round both things where the set stops a gesture: the figure's pieces and the set's parts they meet
    const reds = [...(marks?.inside ?? []), ...(marks?.stopped?.lines ?? []), ...(marks?.stopped?.others ?? [])];
    this.insideShown.target = ((reds.length > 0) || (touched.length > 0)) ? 1 : 0;
    if(marks) { this.stand(this.insides, reds, [SHAPE_INSIDE]); this.standShapes(this.touched, marks.stopped ? touched : [], SHAPE_INSIDE); }
    this.nowLit.color.value.copy(shown(marks?.stopped ? INSIDE : HELD));
    this.wasShown.target = marks?.was ? 1 : 0;
    if(marks?.was) this.stand(this.wasShape, marks.was, [SHAPE_FROST]);
    this.previewShown.target = marks?.preview ? 1 : 0;
    if(marks?.preview) { this.stand(this.preview, marks.preview, [FRONTS, this.previewFrost]); this.stand(this.previewShape, marks.preview, [SHAPE_FROST]); }
    this.ghostsShown.target = (marks?.before && (marks.before.length > 0)) ? 1 : 0;
    if(marks?.before && (marks.before.length > 0)) { this.stand(this.ghosts, marks.before, [FRONTS, this.ghostFrost]); this.stand(this.ghostShapes, marks.before, [SHAPE_BEFORE]); }

    // the limb's travel
    this.arcShown.target = marks?.arc ? 1 : 0;
    if(marks?.arc) this.travel(marks.arc);

    // the studs it seats on, the ripple as it seats, its pin, its rod and the set's push back
    this.studsShown.target = (marks?.studs && (marks.studs.length > 0)) ? 1 : 0;
    if(marks?.studs && (marks.studs.length > 0)) this.glowStuds(marks.studs);
    if(marks && ((marks.seated ?? 0) > this.seats) && marks.studs?.[0]) { this.rippled = performance.now(); this.ripple.position.copy(middleOf(marks.studs.map(this.scenePoint))).setY(this.scenePoint(marks.studs[0]).y + STUD_TOP + 0.012); }
    this.seats = marks?.seated ?? this.seats;
    this.pinShown.target = marks?.pin ? 1 : 0;
    if(marks?.pin) {
      // pushed into the top of the pinned foot's toe at a lean, as a hand pushes one in: where a line dropped ahead of its contact first meets the leg
      const facing = ((marks.ring?.yaw ?? 0) + 180) * (Math.PI / 180), ahead = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const sole = this.scenePoint(marks.pin.at), over = sole.clone().addScaledVector(ahead, TOE_AHEAD).setY(sole.y + TOE_OVER);
      const leg = marks.pin.lines.flatMap(line => { const each = this.drawn(line); return each ? [Object.assign(new THREE.Mesh(each.geometry, SHAPE_HELD), { matrixAutoUpdate: false, matrixWorld: each.matrix.clone() })] : []; });
      const met = new THREE.Raycaster(over, UP.clone().negate(), 0, TOE_OVER).intersectObjects(leg, false)[0]?.point;
      this.pin.position.copy(met ?? over.setY(sole.y)).setY((met?.y ?? sole.y) - (PIN_SINKS * PIN_SIZE));
      this.pin.quaternion.setFromUnitVectors(UP, ahead.clone().multiplyScalar(0.3).add(UP).applyAxisAngle(UP, 0.6).normalize());
    }
    this.rodShown.target = marks?.rod ? 1 : 0;
    if(marks?.rod) {
      const [from, to] = [this.scenePoint(marks.rod.from), this.scenePoint(marks.rod.to)];
      this.rod.position.copy(from);
      this.rod.children[0].scale.set(1, Math.max(0.001, to.y - from.y), 1);
    }
    this.knobShown.target = marks?.knob ? ((marks.knob.held || marks.knob.over) ? 1 : 0.6) : 0;
    if(marks?.knob) this.handle(this.scenePoint(marks.knob.from), this.scenePoint(marks.knob.to));
  }

  // == Frame =====================================================================
  /** eases every light toward where it was told to stand; true while any still moves */
  public update(now: number): boolean {
    const seconds = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    let moving = false;
    for(const each of this.eased) {
      const gap = each.target - each.value;
      if(Math.abs(gap) < 0.002) { each.value = each.target; continue; }
      each.value += gap * (1 - Math.exp(-seconds / each.over));
      moving = true;
    }
    const [ring, held, over, loose, squared] = [this.ringShown.value, this.ringHeld.value, this.ringOver.value, this.loose.value, this.squared.value];
    const ringColor = shown(WARM).lerp(shown(COOL), loose);
    for(const each of [this.ringLit, this.pipsLit, this.beadLit, this.dishLit, this.poolLit]) each.color.value.copy(ringColor);
    this.ringLit.strength.value = ring * (0.8 + (0.2 * over));
    this.ringLine.uniforms.core.value = 1.3 + (1.1 * over) + (0.2 * held);
    this.ringLine.uniforms.glow.value = 0.6 + (0.5 * over) + (0.2 * held);
    this.dishLit.strength.value = ring * (0.13 + (0.2 * over) + (0.05 * held));
    this.dish.uniforms.wedged.value = this.turning.value;
    this.pipsLit.strength.value = ring;
    this.pipsLit.lift.value = squared;
    this.pipsLit.nearby.value = this.nearShown.value;
    this.beadLit.strength.value = ring * this.turning.value;
    this.beadLit.lift.value = over;
    this.grabbed.visible = this.turning.value > 0.002;
    this.poolLit.strength.value = ring * (0.3 + (0.12 * over) + (0.12 * held)) * (1 - (0.5 * loose));
    this.ring.visible = this.pool.visible = ring > 0.002;

    const [part, grip, inside] = [this.partShown.value, this.partHeld.value, this.insideShown.value];
    const [was, preview, ghosts] = [this.wasShown.value, this.previewShown.value, this.ghostsShown.value];
    (this.rims.uniforms.lights.value as THREE.Vector4).set(part * (0.8 + (0.2 * grip)), inside, Math.max(was, preview * 0.9), ghosts * 0.7);
    this.rims.uniforms.grip.value = grip;
    (this.rims.uniforms.frostColor.value as THREE.Color).copy(shown((preview > was) ? GREEN : ICE));
    this.rimmed.visible = part > 0.002;
    this.insides.visible = this.touched.visible = inside > 0.002;
    this.rims.uniforms.milk.value = (preview > was) ? 0 : MILK;
    this.wasShape.visible = was > 0.002;
    this.ghostFrost.uniforms.strength.value = 0.9 * ghosts;
    this.ghosts.visible = this.ghostShapes.visible = ghosts > 0.002;
    this.previewFrost.uniforms.strength.value = preview;
    this.preview.visible = this.previewShape.visible = preview > 0.002;

    this.arcLit.strength.value = this.nowLit.strength.value = this.arcShown.value;
    this.arc.visible = this.arcShown.value > 0.002;

    // the studs breathe a little while they wait, flare as the figure seats and settle
    const since = (this.rippled === undefined) ? undefined : (now - this.rippled) / 1000;
    const run = ((since !== undefined) && (since < RIPPLE_SECONDS)) ? since / RIPPLE_SECONDS : undefined;
    if(run === undefined) this.rippled = undefined; else moving = true;
    const flare = (run === undefined) ? 0 : (1 - run) * (1 - run);
    this.studLit.strength.value = Math.max(this.studsShown.value * (0.88 + (0.12 * Math.sin(now / 260))), flare * 1.25);
    this.bloomLit.strength.value = 0.55 * this.studLit.strength.value;
    this.studs.visible = (this.studsShown.value > 0.002) || (flare > 0);
    if(this.studsShown.value > 0.002) moving = true/*they breathe*/;
    this.ripple.visible = run !== undefined;
    if(run !== undefined) {
      this.ripple.scale.setScalar(0.5 + (RIPPLE_REACH * (1 - Math.pow(1 - run, 3))));
      this.rippleLit.strength.value = 0.9 * (1 - run) * (1 - run);
    }

    this.pin.visible = this.pinShown.value > 0.002;
    this.pin.scale.setScalar(PIN_SIZE * overshoot(this.pinShown.value));
    this.rod.visible = this.rodShown.value > 0.002;
    this.rodClear.uniforms.strength.value = this.rodShown.value;
    this.knob.visible = this.knobShown.value > 0.002;
    this.knobLit.strength.value = this.knobShown.value;
    return moving;
  }

  /** draws the rig over the frame just drawn: the frame's own depth laid first (its
   *  scene drawn unseen), then the rig against it, lit as the scene is, the ring leaned
   *  up toward the camera where it would lie edge on; then the rims of light, round
   *  the silhouettes drawn unseen */
  public render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const size = renderer.getDrawingBufferSize(this.seen.picture.value);
    const { clientWidth, clientHeight } = renderer.domElement, high = Math.min(clientHeight, clientWidth * (size.y / Math.max(size.x, 1)))/*the picture stands whole within its box*/;
    this.seen.scale.value = (high > 0) ? size.y / high : 1;
    const along = camera.getWorldDirection(new THREE.Vector3()), level = Math.hypot(along.x, along.z);
    const lean = (level < 1e-9) ? 0 : ringLean(Math.atan2(-along.y, level));
    if(lean > 0) this.ring.quaternion.setFromAxisAngle(new THREE.Vector3(along.x / level, 0, along.z / level).cross(UP), lean); else this.ring.quaternion.identity();
    if(this.ringAt) { this.ring.position.copy(this.ringAt).setY(this.ringAt.y + (RING * Math.sin(lean))); this.pool.position.copy(this.ringAt).setY(this.ringAt.y - (FLOAT * 0.7)); }
    for(const each of this.studs.children.filter(light => (light as THREE.Mesh).geometry === BLOOM)) each.quaternion.copy(camera.quaternion)/*the glows face the camera*/;

    const [autoClear, background, override, shadows] = [renderer.autoClear, scene.background, scene.overrideMaterial, renderer.shadowMap.autoUpdate];
    const rimmed = this.shapes.children.some(group => group.visible);
    renderer.shadowMap.autoUpdate = false/*the frame's depth alone is drawn: its shadows stand as drawn*/;
    [scene.background, scene.overrideMaterial] = [null, this.depthOnly];
    if(rimmed) {
      // what the picture shows of each rimmed thing: its shape against the frame's own depth
      const target = this.shapesTarget ??= new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
      if((target.width !== size.x) || (target.height !== size.y)) target.setSize(size.x, size.y);
      const [clearColor, clearAlpha] = [renderer.getClearColor(new THREE.Color()), renderer.getClearAlpha()];
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(this.shapes, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColor, clearAlpha);
      this.rims.uniforms.shapes.value = target.texture;
      (this.rims.uniforms.texel.value as THREE.Vector2).set(1 / size.x, 1 / size.y);
    } /* else -- nothing rimmed */

    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    [scene.background, scene.overrideMaterial] = [background, override];
    renderer.shadowMap.autoUpdate = shadows;
    this.scene.environment = scene.environment;
    renderer.render(this.scene, camera);
    if(rimmed) renderer.render(this.rimScene, this.rimCamera);
    renderer.autoClear = autoClear;
  }

  // == Internal ==================================================================
  // a strength that eases to where it is told
  private ease(value: number, over = EASE): Eased {
    const eased = { value, target: value, over };
    this.eased.push(eased);
    return eased;
  }

  // a group standing a mesh for each line in each material, as the studio draws the line
  private stand(group: THREE.Group, lines: ReadonlyArray<PartLine>, materials: ReadonlyArray<THREE.Material>): void {
    const drawn = lines.flatMap(line => { const each = this.drawn(line); return each ? [each] : []; });
    const wanted = drawn.length * materials.length;
    while(group.children.length > wanted) group.remove(group.children[group.children.length - 1]);
    drawn.forEach(({ geometry, matrix }, index) => materials.forEach((material, layer) => {
      const at = (index * materials.length) + layer;
      let mesh = group.children[at] as THREE.Mesh | undefined;
      if(!mesh) { mesh = new THREE.Mesh(geometry, material); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; group.add(mesh); }
      [mesh.geometry, mesh.material] = [geometry, material];
      mesh.matrix.copy(matrix);
      mesh.matrixWorldNeedsUpdate = true;
    }));
  }

  // a limb's travel, at the far end of what its joint turns: a line of light through the
  // points it passes, the way it has come from where it was taken brightest, a pip at
  // each fifteen degrees and a bead where it stands; and, along the joint's axis, a band
  // of light the line runs down the middle of, ruled at each fifteen degrees: looked at
  // along the travel's own plane, where the line shows as a stick, the band faces the view
  private travel({ path, ticks, at, lead, from, axis }: NonNullable<PoseMarks['arc']>): void {
    for(const child of this.arc.children) (child as THREE.Mesh).geometry.dispose();
    this.arc.clear();
    const points = path.map(this.scenePoint), stands = this.scenePoint(at);
    for(const each of [this.arcLine, this.arcThrough, this.arcBand, this.arcBandThrough]) each.uniforms.lead.value = lead/*it runs on past either end of the way come, fading to nothing at its own ends*/;
    if(points.length > 2) {
      const [one, other] = [alongOf(points, stands), from ? alongOf(points, this.scenePoint(from)) : alongOf(points, stands)];
      for(const each of [this.arcLine, this.arcThrough, this.arcBand, this.arcBandThrough]) (each.uniforms.sweep.value as THREE.Vector2).set(Math.min(one, other), Math.max(one, other));
      const strip = lineOf(points);
      this.arc.add(Object.assign(new THREE.Mesh(strip, this.arcLine), { frustumCulled: false }), Object.assign(new THREE.Mesh(strip, this.arcThrough), { frustumCulled: false }));
      if(axis && (ticks.length > 1)) {
        const ruled = [alongOf(points, this.scenePoint(ticks[0])), alongOf(points, this.scenePoint(ticks[1]))];
        for(const each of [this.arcBand, this.arcBandThrough]) (each.uniforms.ruled.value as THREE.Vector2).set(ruled[0], Math.max(1e-4, ruled[1] - ruled[0]));
        const band = bandOf(points, this.scenePoint(axis.to).sub(this.scenePoint(axis.from)).normalize(), BAND);
        this.arc.add(Object.assign(new THREE.Mesh(band, this.arcBand), { frustumCulled: false }), Object.assign(new THREE.Mesh(band, this.arcBandThrough), { frustumCulled: false }));
      } /* else -- no joint to stand the band along */
    } /* else -- too short a way to draw */
    // a pip at each fifteen degrees the travel is drawn through, but for its faded ends
    const drawn = ticks.map(this.scenePoint).filter(tick => { const along = alongOf(points, tick); return (along > (lead * 0.35)) && (along < (1 - (lead * 0.35))); });
    const [marked, bead] = [pipsOf(drawn.map(tick => ({ at: tick, size: 2.8, lit: 0 }))), pipsOf([{ at: stands, size: 8.5, lit: 0 }])];
    for(const material of this.tickPips) this.arc.add(Object.assign(new THREE.Points(marked, material), { frustumCulled: false }));
    for(const material of this.nowPips) this.arc.add(Object.assign(new THREE.Points(bead, material), { frustumCulled: false }));
  }

  // a group standing a mesh for each shape, in one material
  private standShapes(group: THREE.Group, shapes: ReadonlyArray<Shape>, material: THREE.Material): void {
    while(group.children.length > shapes.length) group.remove(group.children[group.children.length - 1]);
    shapes.forEach(({ geometry, matrix }, index) => {
      let mesh = group.children[index] as THREE.Mesh | undefined;
      if(!mesh) { mesh = new THREE.Mesh(geometry, material); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; group.add(mesh); }
      mesh.geometry = geometry;
      mesh.matrix.copy(matrix);
      mesh.matrixWorldNeedsUpdate = true;
    });
  }

  // the knob a figure is tipped by: a bead of light on a stalk over its head
  private handle(from: THREE.Vector3, to: THREE.Vector3): void {
    for(const child of this.knob.children) (child as THREE.Mesh).geometry.dispose();
    this.knob.clear();
    const [stalk, bead] = [lineOf([from, to]), pipsOf([{ at: to, size: 7.5, lit: 0 }])];
    for(const material of this.knobStalk) this.knob.add(Object.assign(new THREE.Mesh(stalk, material), { frustumCulled: false }));
    for(const material of this.knobBead) this.knob.add(Object.assign(new THREE.Points(bead, material), { frustumCulled: false }));
  }

  // the studs a figure will seat on, each glowing from its top, seen dimmed through its
  // feet, with a bloom of light about it that shows over the feet: a camera level with
  // the ground sees no stud's top
  private glowStuds(studs: ReadonlyArray<Point>): void {
    while(this.studs.children.length > (studs.length * 3)) this.studs.remove(this.studs.children[this.studs.children.length - 1]);
    studs.forEach((stud, index) => [this.studTop, this.studThrough, this.studBloom].forEach((material, layer) => {
      const blooms = layer > 1;
      let light = this.studs.children[(index * 3) + layer] as THREE.Mesh | undefined;
      if(!light) { light = new THREE.Mesh(blooms ? BLOOM : STUD_LIGHT, material); this.studs.add(light); if(blooms) light.scale.setScalar(STUD_BLOOM); }
      light.position.copy(this.scenePoint(stud)).setY(this.scenePoint(stud).y + STUD_TOP + (blooms ? 0.1 : 0.006));
    }));
  }
}

// == Util ========================================================================
/** a light laid over what it lies on: its color already multiplied by how much of what
 *  lies under it it covers, so a glow adds light and a core replaces it */
const OVER = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true, depthWrite: false } as const;

/** a color as the picture shows it: the rig draws over the finished frame */
const shown = (color: number): THREE.Color => new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace);

/** a color and a strength for lights to share */
const lit = (color: number): Lit => ({ color: { value: shown(color) }, strength: { value: 0 } });

/** a thing drawn as itself and again, dimmed, wherever something stands before it */
const twice = <T extends THREE.Object3D>(make: (through: boolean) => T): readonly [T, T] => [Object.assign(make(false), { frustumCulled: false }), Object.assign(make(true), { frustumCulled: false })];

/** a line of light (SEE: LINE_FRAGMENT): its core's half width and its glow's reach
 *  (the page's pixels), how dark the hairline under it, how strong its glow, how much of
 *  each end fades, how bright it rests outside its sweep and how far past the sweep it
 *  runs on, fading (`lead`, a share of its length; all of it when none); `through`,
 *  drawn dimmed (to `dim`) where something stands before it */
const line = (light: Lit, seen: Picture, { core, ink, glow, reach, fade = 0, rest = 1, lead = 0, through = false, dim = THROUGH }: Readonly<{ core: number; ink: number; glow: number; reach: number; fade?: number; rest?: number; lead?: number; through?: boolean; dim?: number; }>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { ...light, ...seen, dim: { value: through ? dim : 1 }, reach: { value: reach }, core: { value: core }, ink: { value: ink }, glow: { value: glow }, fade: { value: fade }, sweep: { value: new THREE.Vector2(0, 1) }, rest: { value: rest }, lead: { value: lead } },
    vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT, ...OVER, side: THREE.DoubleSide, depthFunc: through ? THREE.GreaterDepth : THREE.LessEqualDepth,
  });

/** a band of light along a limb's travel (SEE: BAND_FRAGMENT) */
const band = (light: Lit, through: boolean, dim = THROUGH): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { ...light, dim: { value: through ? dim : 1 }, sweep: { value: new THREE.Vector2(0, 1) }, ruled: { value: new THREE.Vector2(0, 1) }, lead: { value: LEAD } },
    vertexShader: BAND_VERTEX, fragmentShader: BAND_FRAGMENT, ...OVER, side: THREE.DoubleSide, depthFunc: through ? THREE.GreaterDepth : THREE.LessEqualDepth,
  });

/** pips of light (SEE: PIP_FRAGMENT): how white their cores, how dark the hairline
 *  under them and how strong their glow */
const pips = (light: Lit & Picture & Readonly<{ lift: { value: number; }; }>, { hot, ink, glow, through = false, dim = THROUGH }: Readonly<{ hot: number; ink: number; glow: number; through?: boolean; dim?: number; }>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { near: { value: 0 }, nearby: { value: 0 }, ...light, dim: { value: through ? dim : 1 }, hot: { value: hot }, ink: { value: through ? 0 : ink }, glow: { value: glow } },
    vertexShader: PIP_VERTEX, fragmentShader: PIP_FRAGMENT, ...OVER, depthFunc: through ? THREE.GreaterDepth : THREE.LessEqualDepth,
  });

/** frosted or clear plastic (SEE: FROST_FRAGMENT): how much of it is body, how it
 *  glints, how much brighter its edges turn and how much the light shades it; a milky
 *  copy is all body, even and unshaded */
const frost = (color: number, body: number, gloss: number, rim = 1, shade = 0.16): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { color: { value: shown(color) }, strength: { value: 0 }, body: { value: body }, gloss: { value: gloss }, rim: { value: rim }, shade: { value: shade } }, vertexShader: FROST_VERTEX, fragmentShader: FROST_FRAGMENT,
    ...OVER, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });

/** a frosted thing's nearest faces, laid in depth alone before it is drawn: its far
 *  side never shows through its near */
const FRONTS = new THREE.ShaderMaterial({ vertexShader: FROST_VERTEX, fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }', colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });

/** light lying on the ground (SEE: GROUND_FRAGMENT): how much of what it lies on it covers */
const ground = (light: Lit, { fill = 0, band = 0, dish = false, cover, through = false }: Readonly<{ fill?: number; band?: number; dish?: boolean; cover: number; through?: boolean; }>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { ...light, dim: { value: through ? THROUGH : 1 }, fill: { value: fill }, band: { value: band }, dish: { value: dish ? 1 : 0 }, wedge: { value: new THREE.Vector2() }, wedged: { value: 0 }, cover: { value: cover } }, side: THREE.DoubleSide,
    vertexShader: GROUND_VERTEX, fragmentShader: GROUND_FRAGMENT, ...OVER, depthFunc: through ? THREE.GreaterDepth : THREE.LessEqualDepth,
  });

/** a silhouette drawn unseen for the rims, where the frame's own depth shows it: what
 *  the pointer holds, what stands inside the set, a frosted copy, the drawings before,
 *  a channel each */
const shape = (...channel: readonly [number, number, number, number]): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { channel: { value: new THREE.Vector4(...channel) } }, vertexShader: SHAPE_VERTEX, fragmentShader: SHAPE_FRAGMENT,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
const SHAPE_HELD = shape(1, 0, 0, 0), SHAPE_INSIDE = shape(0, 1, 0, 0), SHAPE_FROST = shape(0, 0, 1, 0), SHAPE_BEFORE = shape(0, 0, 0, 1);

/** a stud's top and the glow round it, as a disc of light */
const STUD_LIGHT = new THREE.CircleGeometry(STUD_GLOW, 40).rotateX(-Math.PI / 2);

/** the points a line of light runs through, as the strip its shader pushes out: each
 *  point twice, a side each, knowing the points before and after it */
const lineOf = (points: ReadonlyArray<THREE.Vector3>): THREE.BufferGeometry => {
  const closed = (points.length > 2) && (points[0].distanceToSquared(points[points.length - 1]) < 1e-10), last = points.length - 1;
  const [position, before, after, side, along, index]: number[][] = [[], [], [], [], [], []];
  points.forEach((point, at) => {
    const [back, ahead] = [points[(at > 0) ? at - 1 : (closed ? last - 1 : 0)], points[(at < last) ? at + 1 : (closed ? 1 : last)]];
    for(const each of [-1, 1]) { position.push(...point.toArray()); before.push(...back.toArray()); after.push(...ahead.toArray()); side.push(each); along.push(at / Math.max(1, last)); }
    if(at < last) index.push(at * 2, (at * 2) + 1, (at * 2) + 2, (at * 2) + 1, (at * 2) + 3, (at * 2) + 2);
  });
  const geometry = new THREE.BufferGeometry();
  for(const [name, values, width] of [['position', position, 3], ['before', before, 3], ['after', after, 3], ['side', side, 1], ['along', along, 1]] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, width));
  geometry.setIndex(index);
  return geometry;
};

/** the points a band of light runs through, as a strip `half` wide either side of them
 *  along `axis`: each point's share of the way along it, and its side */
const bandOf = (points: ReadonlyArray<THREE.Vector3>, axis: THREE.Vector3, half: number): THREE.BufferGeometry => {
  const [position, uv, index]: number[][] = [[], [], []];
  points.forEach((point, at) => {
    for(const side of [-1, 1]) { position.push(...point.clone().addScaledVector(axis, side * half).toArray()); uv.push(at / Math.max(1, points.length - 1), side); }
    if(at < (points.length - 1)) index.push(at * 2, (at * 2) + 1, (at * 2) + 2, (at * 2) + 1, (at * 2) + 3, (at * 2) + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
};

/** how far along a run of points a point lies nearest: its share of the way, by the
 *  points' count (each a step of the same turn) */
const alongOf = (points: ReadonlyArray<THREE.Vector3>, to: THREE.Vector3): number => {
  let [best, gap] = [0, Infinity];
  for(let at=0; at<(points.length - 1); at++) {
    const step = points[at + 1].clone().sub(points[at]), share = THREE.MathUtils.clamp(to.clone().sub(points[at]).dot(step) / Math.max(step.lengthSq(), 1e-12), 0, 1);
    const off = points[at].clone().addScaledVector(step, share).distanceToSquared(to);
    if(off < gap) [best, gap] = [(at + share) / (points.length - 1), off];
  }
  return best;
};

/** pips, each where it stands, its core's size (the page's pixels) and whether it is
 *  one that lights */
const pipsOf = (each: ReadonlyArray<Readonly<{ at: THREE.Vector3; size: number; lit: number; turn?: number; }>>): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('turn', new THREE.Float32BufferAttribute(each.map(pip => pip.turn ?? 0), 1));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(each.flatMap(pip => pip.at.toArray()), 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(each.map(pip => pip.size), 1));
  geometry.setAttribute('lit', new THREE.Float32BufferAttribute(each.map(pip => pip.lit), 1));
  return geometry;
};

/** a soft round glow that is turned to face the camera each frame (SEE: PoseRig#render) */
const BLOOM = new THREE.PlaneGeometry(1, 1);

/** an object stood at a point */
const placed = <T extends THREE.Object3D>(object: T, at: THREE.Vector3): T => { object.position.copy(at); return object; };

/** the middle of some points */
const middleOf = (points: ReadonlyArray<THREE.Vector3>): THREE.Vector3 => points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, points.length));

/** a share eased in with a small overshoot, as a thing pushed in settles */
const overshoot = (share: number): number => share * (1 + (0.35 * Math.sin(Math.min(1, share) * Math.PI)));
