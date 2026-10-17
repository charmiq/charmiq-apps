import { cameraShots, type Film } from './film';
import type { ClosePair } from './measure';
import type { CameraKey, Key, RecordedCamera, Span, Title } from './recorder';

// the timeline: one row per track (the camera, each view, each actor, the fade and
// the titles), each key a diamond at its time and each function of time a band over
// its span, a camera's shots as alternating bands from cut to cut, and a notch on
// both actors' rows where two come closest when they are close, under a ruler of
// seconds and frames. A press or a drag anywhere on the
// ruler or the rows scrubs the film; a key's diamond seeks to it and says what it
// sets. The keyboard steps frames (arrows), jumps to the ends (Home, End) and plays
// (Space)
// ********************************************************************************
// == Constants ===================================================================
/** each actor's row color, in order: the studio's brick palette */
const ACTOR_COLORS = ['--brick-red', '--brick-yellow', '--brick-green', '--brick-blue', '--brick-orange', '--brick-lime', '--brick-tan'];

// == Types =======================================================================
export type TimelineHost = Readonly<{
  seek: (index: number) => void;
  step: (delta: number) => void;
  toggle: () => void;
}>;

/** a row's marks: keys at their times, bands over their spans (every other shot
 *  `alternate`), and notches where its actor comes close to another */
type Row = Readonly<{
  name: string; note?: string; color: string;
  keys: ReadonlyArray<Readonly<{ time: number; label: string; face?: true; }>>;
  bands: ReadonlyArray<Readonly<{ from: number; to: number; label: string; kind: 'path' | 'wobble' | 'fade' | 'title' | 'shot'; strength?: number; alternate?: true; }>>;
  notches?: ReadonlyArray<Readonly<{ time: number; label: string; }>>;
}>;

// == Colors ======================================================================
/** the color (a CSS custom property) of the actor at `index` in the scene */
export const actorColor = (index: number): string => ACTOR_COLORS[index % ACTOR_COLORS.length];

// == Class =======================================================================
export class Timeline {
  private film: Film | undefined;
  private scrubbing = false;

  public constructor(private readonly root: HTMLElement, private readonly host: TimelineHost) {
    root.tabIndex = 0;
    root.addEventListener('pointerdown', event => this.press(event));
    root.addEventListener('pointermove', event => { if(this.scrubbing) this.scrub(event); });
    const end = () => { this.scrubbing = false; root.classList.remove('is-scrubbing'); };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('keydown', event => this.key(event));
  }

  // == Film ======================================================================
  /** draws a film's tracks, or the empty timeline for none, with the actors that come
   *  close once the stage has sized them */
  public show(film: Film | undefined, close: ReadonlyArray<ClosePair> = []): void {
    this.film = film;
    this.root.replaceChildren();
    this.root.classList.toggle('is-empty', !film);
    if(!film) return;
    const { scene } = film;
    const length = scene.length;
    const at = (time: number) => `${(Math.min(Math.max(time / length, 0), 1) * 100).toFixed(3)}%`;

    // the ruler: a tick each second, finer ticks each frame when they fit
    const ruler = element('div', 'ruler');
    const seconds = Math.floor(length);
    const step = (length > 30) ? 5 : (length > 12) ? 2 : 1;
    for(let second=0; second<=seconds; second+=step) {
      const tick = element('span', 'ruler-tick');
      tick.style.left = at(second);
      tick.textContent = `${second}s`;
      ruler.append(tick);
    }
    ruler.style.setProperty('--frame', at(1 / scene.fps));
    const head = element('div', 'row row--ruler');
    head.append(element('span', 'row-name'), ruler);

    const rows = [
      cameraRow('Camera', 'camera', scene.camera, scene.fps, length),
      ...scene.views.map(view => cameraRow(`View ${view.name}`, view.plan ? 'plan' : 'view', view, scene.fps, length)),
      ...scene.actors.map((actor, index): Row => ({
        name: actor.name,
        note: actor.ride ? `rides ${actor.ride.parent}` : ((sourceNote(actor.source) !== actor.name) ? sourceNote(actor.source) : undefined),
        color: actorColor(index),
        keys: [
          ...actor.keys.map(key => ({ time: key.time, label: `${actor.name} at ${seconds2(key.time)} · ${describeKey(key)}` })),
          ...(actor.faces ?? []).map(key => ({ time: key.time, label: `${actor.name} at ${seconds2(key.time)} · face ${key.face}`, face: true as const })),
        ],
        bands: actor.spans.map(span => band(span, scene.fps)),
        notches: close.filter(pair => pair.actors.includes(actor.name)).map(pair => ({ time: pair.time, label: closeness(pair) })),
      })),
      fadeRow(scene.fade),
      ...((scene.titles.length > 0) ? [titleRow(scene.titles)] : []),
    ];
    const body = element('div', 'rows');
    for(const row of rows) body.append(this.row(row, at));
    const playhead = element('div', 'playhead');
    playhead.append(element('i', 'playhead-knob'));
    this.root.append(head, body, playhead);
  }

  /** moves the playhead to a frame */
  public setFrame(index: number): void {
    const film = this.film;
    if(!film) return;
    this.root.style.setProperty('--at', String(film.frames.length > 1 ? index / film.frames.length : 0));
  }

  // == Rows ======================================================================
  private row(row: Row, at: (time: number) => string): HTMLElement {
    const line = element('div', 'row');
    line.style.setProperty('--row', `var(${row.color})`);
    const name = element('span', 'row-name');
    name.append(Object.assign(element('b', 'row-swatch'), { ariaHidden: 'true' }), text(row.name));
    if(row.note) name.append(Object.assign(element('small', 'row-note'), { textContent: row.note }));
    const lane = element('div', 'lane');
    for(const each of row.bands) {
      const mark = element('span', `band band--${each.kind}${each.alternate ? ` band--${each.kind}-alternate` : ''}`);
      mark.style.left = at(each.from);
      mark.style.width = `calc(${at(each.to)} - ${at(each.from)})`;
      if(each.strength !== undefined) mark.style.setProperty('--strength', String(each.strength));
      mark.title = each.label;
      if((each.kind === 'title') || (each.kind === 'shot')) mark.textContent = each.label;
      lane.append(mark);
    }
    for(const notch of row.notches ?? []) {
      const mark = element('span', 'notch');
      mark.style.left = at(notch.time);
      mark.title = notch.label;
      lane.append(mark);
    }
    for(const key of row.keys) {
      const diamond = element('button', key.face ? 'key key--face' : 'key');
      diamond.type = 'button';
      diamond.style.left = at(key.time);
      diamond.title = key.label;
      diamond.ariaLabel = key.label;
      diamond.dataset.time = String(key.time);
      lane.append(diamond);
    }
    line.append(name, lane);
    return line;
  }

  // == Scrubbing =================================================================
  private press(event: PointerEvent): void {
    const film = this.film;
    if(!film || (event.button !== 0)) return;
    const key = (event.target as HTMLElement).closest<HTMLElement>('.key');
    if(key) { this.host.seek(Math.round(Number(key.dataset.time) * film.scene.fps)); return; }
    if(!(event.target as HTMLElement).closest('.lane, .ruler')) return;
    this.scrubbing = true;
    this.root.classList.add('is-scrubbing');
    this.root.setPointerCapture(event.pointerId);
    this.scrub(event);
  }

  private scrub(event: PointerEvent): void {
    const film = this.film;
    const lane = this.root.querySelector<HTMLElement>('.ruler');
    if(!film || !lane) return;
    const box = lane.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    this.host.seek(Math.min(film.frames.length - 1, Math.floor(fraction * film.frames.length)));
  }

  private key(event: KeyboardEvent): void {
    const film = this.film;
    if(!film) return;
    const handled: Record<string, () => void> = {
      ArrowLeft: () => this.host.step(event.shiftKey ? -film.scene.fps : -1),
      ArrowRight: () => this.host.step(event.shiftKey ? film.scene.fps : 1),
      Home: () => this.host.seek(0),
      End: () => this.host.seek(film.frames.length - 1),
      ' ': () => this.host.toggle(),
    };
    const act = handled[event.key];
    if(!act) return;
    event.preventDefault();
    act();
  }
}

// == Rows ========================================================================
const cameraRow = (name: string, kind: 'camera' | 'view' | 'plan', camera: RecordedCamera, fps: number, length: number): Row => ({
  name, color: '--brick-azure', note: (kind === 'view') ? 'a second studio' : (kind === 'plan') ? 'a plan from above' : undefined,
  keys: camera.keys.map(key => ({ time: key.time, label: `${name} at ${seconds2(key.time)} · ${describeCamera(key)}` })),
  bands: [
    ...((camera.keys.length > 0) ? cameraShots(camera, length).map((shot, index) => ({ from: shot.from, to: shot.to, label: shot.name ?? '', kind: 'shot' as const, ...((index % 2) ? { alternate: true as const } : {}) })) : []),
    ...camera.spans.map(span => band(span, fps)),
  ],
});

const fadeRow = (keys: ReadonlyArray<Key>): Row => ({
  name: 'Fade', color: '--ink',
  keys: keys.map(key => ({ time: key.time, label: `fade at ${seconds2(key.time)} · ${Math.round(key.values.fade * 100)}% black` })),
  bands: keys.slice(1).map((key, index) => ({ from: keys[index].time, to: key.time, label: `to ${Math.round(key.values.fade * 100)}% black`, kind: 'fade' as const, strength: key.values.fade })),
});

const titleRow = (titles: ReadonlyArray<Title>): Row => ({
  name: 'Titles', color: '--brick-yellow', keys: [],
  bands: titles.map(title => ({ from: title.from, to: title.to, label: title.text, kind: 'title' as const })),
});

/** a span as a band: its frames as seconds */
const band = (span: Span, fps: number) => ({ from: span.from / fps, to: span.to / fps, label: span.label, kind: (span.mode === 'set') ? 'path' as const : 'wobble' as const });

// == Words =======================================================================
const seconds2 = (time: number) => `${time.toFixed(2)} s`;

const describeKey = (key: Key): string => {
  const values = key.values;
  const parts: string[] = [];
  if(['x', 'z', 'height'].some(channel => channel in values)) parts.push(['x', 'z', 'height'].filter(channel => channel in values).map(channel => `${channel} ${round(values[channel])}`).join(' '));
  for(const channel of ['yaw', 'pitch', 'roll']) if(channel in values) parts.push(`${channel} ${round(values[channel])}°`);
  const limbs = Object.keys(values).filter(channel => channel.startsWith('pose.'));
  if(limbs.length > 0) parts.push(`pose ${limbs.map(channel => `${channel.slice(5)} ${round(values[channel])}°`).join(', ')}`);
  if('visible' in values) parts.push(values.visible ? 'shown' : 'hidden');
  return [...parts, key.ease].join(' · ');
};

const describeCamera = (key: CameraKey): string => {
  const parts: string[] = (key.ease === 'hold') ? [(key.name !== undefined) ? `cuts to ${key.name}` : 'cuts'] : [];
  if(key.place) parts.push(('orbit' in key.place) ? `orbits at ${round(key.place.orbit.angle)}°, ${round(key.place.orbit.distance)} studs out` : `stands at x ${round(key.place.point.x)} z ${round(key.place.point.z)} height ${round(key.place.point.height)}`);
  if(key.target) parts.push(('actor' in key.target) ? `looks at ${key.target.actor}` : `looks at x ${round(key.target.point.x)} z ${round(key.target.point.z)}`);
  if(key.fov !== undefined) parts.push(`${round(key.fov)}° lens`);
  return [...parts, ...((key.ease === 'hold') ? [] : [key.ease])].join(' · ');
};

/** how close two actors come, in words */
const closeness = ({ actors: [a, b], time, gap }: ClosePair): string =>
  (gap > 0) ? `${a} and ${b} come within ${round(gap)} studs at ${seconds2(time)}` : `${a} touches ${b} at ${seconds2(time)}`;

const sourceNote = (source: Readonly<Record<string, unknown>>): string => (typeof source.component === 'string') ? source.component : [source.color, source.part].filter(Boolean).join(' ');
const round = (value: number) => Math.round(value * 100) / 100;

// == DOM =========================================================================
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), { className });
const text = (value: string) => document.createTextNode(value);
