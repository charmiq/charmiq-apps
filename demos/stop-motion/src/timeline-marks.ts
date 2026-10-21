import { cameraShots, type Film, type FilmFrame } from './film';
import type { ClosePair } from './measure';
import { castAs, type CameraKey, type Key, type RecordedCamera, type SetKey, type SoundCue, type Span, type Target, type Title } from './recorder';

// the timeline's marks as data: a row per track (the camera, each view, each actor,
// the sets, the sounds, the fade and the titles), each with its keys, its bands over their spans and
// its notches where two actors come closest. Keys too near to tell apart on the lane
// draw as one group; bands sharing a span stack in tiers, so nothing draws over
// anything else. What lies under a moment of a row (its marks, and where the row's
// track stands then) is what the timeline's hover card tells
// ********************************************************************************
// == Constants ===================================================================
/** each actor's row color, in order: the studio's brick palette */
const ACTOR_COLORS = ['--brick-red', '--brick-yellow', '--brick-green', '--brick-blue', '--brick-orange', '--brick-lime', '--brick-tan'];

// == Types =======================================================================
/** what a mark says in the hover card: its title and its values, each a chip */
export type Said = Readonly<{ title: string; chips: ReadonlyArray<string>; }>;

/** where a sound's file stands while it is not yet heard: being read, or unreadable */
export type SoundReading = 'loading' | 'unread';
/** a key at its time; a face key wears a face; a sound's says where its file stands */
export type RowKey = Said & Readonly<{ time: number; face?: true; reading?: SoundReading; }>;
/** a band over its span: a path, a wobble, a fade, a title, a camera's shot, a set or
 *  a sound played until a time */
export type BandKind = 'path' | 'wobble' | 'fade' | 'title' | 'shot' | 'set' | 'sound';
/** a band over its span; a sound's carries its cue, so the timeline can draw and move
 *  it, and says where its file stands */
export type RowBand = Said & Readonly<{ from: number; to: number; label: string; kind: BandKind; strength?: number; alternate?: true; cue?: SoundCue; reading?: SoundReading; }>;

/** what the timeline knows of the film's sounds once they are read: how long each
 *  plays once (seconds; undefined until it is decoded), what to call it (a Platform
 *  file's name, a shipped sound's own) and where its file stands until it is heard
 *  (undefined once read, or where no file is read) */
export type SoundsKnown = Readonly<{ duration: (sound: string) => number | undefined; label: (sound: string) => string; reading: (sound: string) => SoundReading | undefined; }>;
/** where two actors come closest */
export type RowNotch = Said & Readonly<{ time: number; }>;

/** whose track a row is: the camera or a view, an actor, the sets, the sounds, the
 *  fade or the titles */
export type Track = Readonly<{ kind: 'camera'; view?: string; } | { kind: 'actor'; name: string; } | { kind: 'sets'; } | { kind: 'sounds'; } | { kind: 'fade'; } | { kind: 'titles'; }>;

/** a row: its name, a note under it, its color (a CSS custom property), whose track
 *  it is and its marks */
export type Row = Readonly<{
  name: string; note?: string; color: string; track: Track;
  keys: ReadonlyArray<RowKey>; bands: ReadonlyArray<RowBand>; notches: ReadonlyArray<RowNotch>;
}>;

/** keys drawn as one: their times (the first's is where it draws) */
export type KeyGroup = Readonly<{ time: number; last: number; keys: ReadonlyArray<RowKey>; }>;

/** what lies under a moment of a row: its key groups, bands and notches there */
export type Under = Readonly<{ groups: ReadonlyArray<KeyGroup>; bands: ReadonlyArray<RowBand>; notches: ReadonlyArray<RowNotch>; }>;

// == Colors ======================================================================
/** the color (a CSS custom property) of the actor at `index` in the scene */
export const actorColor = (index: number): string => ACTOR_COLORS[index % ACTOR_COLORS.length];

// == Rows ========================================================================
/** a film's rows, in the timeline's order, its close pairs on their actors' rows,
 *  its sounds as far as they are `known` */
export const rowsOf = (film: Film, close: ReadonlyArray<ClosePair>, known: SoundsKnown = UNKNOWN_SOUNDS): ReadonlyArray<Row> => {
  const { scene } = film;
  const length = scene.length;
  return [
    cameraRow('Camera', 'camera', undefined, scene.camera, scene.fps, length),
    ...scene.views.map(view => cameraRow(`View ${view.name}`, view.plan ? 'plan' : 'view', view.name, view, scene.fps, length)),
    ...scene.actors.map((actor, index): Row => {
      const cast = castAs(actor.source).words;
      return {
        name: actor.name, color: actorColor(index), track: { kind: 'actor', name: actor.name },
        note: actor.ride ? `rides ${actor.ride.parent}` : ((cast !== actor.name) ? cast : undefined),
        keys: [
          ...actor.keys.map(key => ({ time: key.time, title: `Key at ${seconds2(key.time)}`, chips: keyChips(key) })),
          ...(actor.faces ?? []).map(key => ({ time: key.time, title: `Face at ${seconds2(key.time)}`, chips: [key.face], face: true as const })),
          ...(actor.hands ?? []).map(key => ({ time: key.time, title: `${(key.hand === 'rightHand') ? 'Right' : 'Left'} hand at ${seconds2(key.time)}`, chips: [key.item ? [key.item.color, key.item.part].join(' ') : 'empty'], face: true as const })),
        ].sort((a, b) => a.time - b.time),
        bands: [
          ...actor.spans.map(span => band(span, scene.fps)),
          ...(actor.reactions ?? []).map(reaction => ({ from: reaction.from, to: reaction.to, label: reaction.face, kind: 'wobble' as const, title: `Reacts "${reaction.face}"`, chips: [`${seconds2(reaction.from)} – ${seconds2(reaction.to)}`] })),
          ...(actor.looks ?? []).map(look => ({ from: look.from, to: look.to, label: `looks at ${lookTarget(look.target)}`, kind: 'wobble' as const, title: `Looks at ${lookTarget(look.target)}`, chips: [`${seconds2(look.from)} – ${seconds2(look.to)}`, `within ${round(look.within)} studs`, `up to ${round(look.max)}°`] })),
        ],
        notches: close.filter(pair => pair.actors.includes(actor.name)).map(pair => ({ time: pair.time, ...closeness(pair) })),
      };
    }),
    ...(scene.sets ? [setRow(scene.sets, length)] : []),
    ...(scene.sounds ? [soundRow(scene.sounds, length, known)] : []),
    fadeRow(scene.fade),
    ...((scene.titles.length > 0) ? [titleRow(scene.titles)] : []),
  ];
};

const cameraRow = (name: string, kind: 'camera' | 'view' | 'plan', view: string | undefined, camera: RecordedCamera, fps: number, length: number): Row => ({
  name, color: '--brick-azure', track: { kind: 'camera', ...((view !== undefined) ? { view } : {}) },
  note: (kind === 'view') ? 'a second studio' : (kind === 'plan') ? 'a plan from above' : undefined,
  keys: camera.keys.map(key => ({ time: key.time, title: `${(key.ease === 'hold') ? 'Cut' : 'Key'} at ${seconds2(key.time)}`, chips: cameraChips(key) })),
  bands: [
    ...((camera.keys.length > 0) ? cameraShots(camera, length).map((shot, index) => ({
      from: shot.from, to: shot.to, label: shot.name ?? '', kind: 'shot' as const, ...((index % 2) ? { alternate: true as const } : {}),
      title: (shot.name !== undefined) ? `Shot "${shot.name}"` : 'Shot', chips: [`${seconds2(shot.from)} – ${seconds2(shot.to)}`],
    })) : []),
    ...camera.spans.map(span => band(span, fps)),
  ],
  notches: [],
});

/** the sets a scene cuts between: each key's set as a band to the next key (or the
 *  end), named by its set, alternating as shots do */
const setRow = (keys: ReadonlyArray<SetKey>, length: number): Row => ({
  name: 'Set', color: '--brick-red', track: { kind: 'sets' },
  keys: keys.map(key => ({ time: key.time, title: `Cut at ${seconds2(key.time)}`, chips: [`to ${key.set}`] })),
  bands: keys.map((key, index) => {
    const to = keys[index + 1]?.time ?? length;
    return { from: key.time, to, label: key.set, kind: 'set' as const, ...((index % 2) ? { alternate: true as const } : {}), title: `Set "${key.set}"`, chips: [`${seconds2(key.time)} – ${seconds2(to)}`] };
  }),
  notches: [],
});

/** the sounds a scene plays, each a band over the span it plays (one played once
 *  over its own length, once read; one played until a time over that span), named and
 *  saying its volume and the actor it follows; one whose length is not yet known a key
 *  at its time */
const soundRow = (cues: ReadonlyArray<SoundCue>, length: number, known: SoundsKnown): Row => {
  const said = (cue: SoundCue) => [...((cue.volume !== 1) ? [`volume ${Math.round(cue.volume * 100)}%`] : []), ...((cue.actor !== undefined) ? [`follows ${cue.actor}`] : []), ...readingSaid(known.reading(cue.name))];
  const reading = (cue: SoundCue) => { const where = known.reading(cue.name); return (where === undefined) ? {/*read*/} : { reading: where }; };
  const spanOf = (cue: SoundCue) => {
    const duration = known.duration(cue.name);
    const to = cue.until ?? ((duration !== undefined) ? (cue.time + duration) : undefined);
    return (to === undefined) ? undefined/*its length not yet known*/ : Math.min(to, length);
  };
  return {
    name: 'Sound', color: '--brick-orange', track: { kind: 'sounds' },
    keys: cues.filter(cue => spanOf(cue) === undefined).map(cue => ({ time: cue.time, title: `Sound "${known.label(cue.name)}" at ${seconds2(cue.time)}`, chips: said(cue), ...reading(cue) })),
    bands: cues.flatMap(cue => {
      const to = spanOf(cue);
      if(to === undefined) return [];
      return [{ from: cue.time, to, label: known.label(cue.name), kind: 'sound' as const, cue, title: `Sound "${known.label(cue.name)}"`, chips: [`${seconds2(cue.time)} – ${seconds2(to)}`, ...((cue.until !== undefined) ? ['over and over'] : []), ...said(cue)], ...reading(cue) }];
    }),
    notches: [],
  };
};

/** what a sound's file standing says: being read, or why it is not heard */
const readingSaid = (reading: SoundReading | undefined): ReadonlyArray<string> =>
  (reading === 'loading') ? ['loading…'] : (reading === 'unread') ? ['could not be read'] : [];

/** the sounds before any is read: no lengths, each called by its sound, none being read */
const UNKNOWN_SOUNDS: SoundsKnown = { duration: () => undefined/*not read*/, label: sound => sound, reading: () => undefined/*no file read*/ };

const fadeRow = (keys: ReadonlyArray<Key>): Row => ({
  name: 'Fade', color: '--ink', track: { kind: 'fade' },
  keys: keys.map(key => ({ time: key.time, title: `Fade at ${seconds2(key.time)}`, chips: [`${Math.round(key.values.fade * 100)}% black`, key.ease] })),
  bands: keys.slice(1).map((key, index) => ({
    from: keys[index].time, to: key.time, label: `to ${Math.round(key.values.fade * 100)}% black`, kind: 'fade' as const, strength: key.values.fade,
    title: `Fade to ${Math.round(key.values.fade * 100)}% black`, chips: [`${seconds2(keys[index].time)} – ${seconds2(key.time)}`, key.ease],
  })),
  notches: [],
});

const titleRow = (titles: ReadonlyArray<Title>): Row => ({
  name: 'Titles', color: '--brick-yellow', track: { kind: 'titles' }, keys: [],
  bands: titles.map(title => ({ from: title.from, to: title.to, label: title.text, kind: 'title' as const, title: `Title "${title.text}"`, chips: [title.style, `${seconds2(title.from)} – ${seconds2(title.to)}`] })),
  notches: [],
});

/** a span as a band: its frames as seconds */
const band = (span: Span, fps: number): RowBand => {
  const [from, to] = [span.from / fps, span.to / fps];
  const path = (span.mode === 'set');
  return { from, to, label: span.label, kind: path ? 'path' : 'wobble', title: BEHAVIOR_TITLES[span.label] ?? (path ? `Path "${span.label}"` : `Wobble "${span.label}"`), chips: [`${seconds2(from)} – ${seconds2(to)}`, ...span.channels] };
};
/** what a behavior's span is called (SEE: recorder.ts walk, idle, crowd) */
const BEHAVIOR_TITLES: Readonly<Record<string, string>> = { walk: 'Walk', idle: 'Idle', crowd: 'Crowd', 'crowd walk': 'Crowd walk' };
/** what a look aims at, in a few words */
const lookTarget = (target: Target): string => ('actor' in target) ? target.actor : `x ${round(target.point.x)}, z ${round(target.point.z)}`;

// == Overlap =====================================================================
/** a row's keys as the lane draws them: each key within `apart` seconds of the
 *  group's last joins it, so keys too near to tell apart draw as one */
export const keyGroups = (keys: ReadonlyArray<RowKey>, apart: number): ReadonlyArray<KeyGroup> => {
  const groups: Array<{ time: number; last: number; keys: RowKey[]; }> = [];
  for(const key of [...keys].sort((a, b) => a.time - b.time)) {
    const group = groups[groups.length - 1];
    if(group && ((key.time - group.last) <= apart)) { group.keys.push(key); group.last = key.time; }
    else groups.push({ time: key.time, last: key.time, keys: [key] });
  }
  return groups;
};

/** where the sound files of a group's keys stand, as the group shows it: unreadable
 *  when any is, else being read when any is (undefined: nothing to say) */
export const groupReading = (group: KeyGroup): SoundReading | undefined =>
  group.keys.some(key => key.reading === 'unread') ? 'unread' : group.keys.some(key => key.reading === 'loading') ? 'loading' : undefined;

/** each band's tier, in the order given, and how many tiers there are: a band takes
 *  the first tier whose bands all end by its start, so bands sharing a span stack */
export const bandTiers = (bands: ReadonlyArray<Readonly<{ from: number; to: number; }>>): Readonly<{ tiers: ReadonlyArray<number>; count: number; }> => {
  const ends: number[] = []/*each tier's last end*/;
  const tiers = new Array<number>(bands.length);
  [...bands.keys()].sort((a, b) => (bands[a].from - bands[b].from) || (a - b)).forEach(index => {
    const tier = ends.findIndex(end => end <= bands[index].from);
    const at = (tier < 0) ? ends.length : tier;
    ends[at] = bands[index].to;
    tiers[index] = at;
  });
  return { tiers, count: Math.max(1, ends.length) };
};

/** what lies under a moment of a row: the key groups `near` seconds of it (a group
 *  from its first key to its last), the bands over it and the notches near it */
export const underAt = (groups: ReadonlyArray<KeyGroup>, row: Row, time: number, near: number): Under => ({
  groups: groups.filter(group => ((group.time - near) <= time) && (time <= (group.last + near))),
  bands: row.bands.filter(each => (each.from <= time) && (time < each.to)),
  notches: row.notches.filter(notch => Math.abs(notch.time - time) <= near),
});

// == Where the track stands ======================================================
/** where a row's track stands in a frame, as the hover card's chips: an actor's place
 *  and turn (or hidden), a camera's place, target and lens (or the plan it shows), the
 *  set standing, the sounds playing until a time, the fade or the title */
export const standingAt = (row: Row, frame: FilmFrame): ReadonlyArray<string> => {
  const track = row.track;
  switch(track.kind) {
    case 'actor': {
      const shot = frame.actors.find(actor => actor.name === track.name);
      if(!shot) return ['hidden'];
      const { x, z, height } = shot.position;
      const turn = (['yaw', 'pitch', 'roll'] as const).filter(axis => round(shot.turn[axis]) !== 0).map(axis => `${axis} ${round(shot.turn[axis])}°`);
      return [`x ${round(x)}`, `z ${round(z)}`, `height ${round(height)}`, ...turn, ...(shot.face ? [`face ${shot.face}`] : [])];
    }
    case 'camera': {
      const camera = (track.view === undefined) ? frame.camera : frame.views[track.view];
      if(!camera) return [];
      if('plan' in camera) return [`plan ${camera.plan.width} × ${camera.plan.depth} studs`];
      return [`at ${point(camera.position)}`, `looks at ${point(camera.target)}`, `${round(camera.fov)}° lens`];
    }
    case 'sets': return [frame.set ?? 'the build\'s first set'];
    case 'sounds': {
      const playing = row.bands.filter(each => (each.from <= frame.time) && (frame.time < each.to)).map(each => each.label);
      return (playing.length > 0) ? playing : ['quiet'];
    }
    case 'fade': return [`${Math.round(frame.fade * 100)}% black`];
    case 'titles': return frame.title ? [frame.title.text] : ['no title'];
  }
};

// == Words =======================================================================
export const seconds2 = (time: number) => `${time.toFixed(2)} s`;

/** a key's values, each a chip, then its ease */
const keyChips = (key: Key): ReadonlyArray<string> => {
  const values = key.values;
  const chips = ['x', 'z', 'height'].filter(channel => channel in values).map(channel => `${channel} ${round(values[channel])}`);
  for(const channel of ['yaw', 'pitch', 'roll']) if(channel in values) chips.push(`${channel} ${round(values[channel])}°`);
  for(const channel of Object.keys(values).filter(each => each.startsWith('pose.'))) chips.push(`${channel.slice(5)} ${round(values[channel])}°`);
  if('visible' in values) chips.push(values.visible ? 'shown' : 'hidden');
  return [...chips, key.ease];
};

/** a camera key's values, each a chip, then its ease (a cut's name instead) */
const cameraChips = (key: CameraKey): ReadonlyArray<string> => {
  const chips: string[] = (key.ease === 'hold') ? [(key.name !== undefined) ? `"${key.name}"` : 'a cut'] : [];
  if(key.place) chips.push(('orbit' in key.place) ? `orbits at ${round(key.place.orbit.angle)}°, ${round(key.place.orbit.distance)} out` : `at ${point(key.place.point)}`);
  if(key.target) chips.push(('actor' in key.target) ? `looks at ${key.target.actor}` : `looks at ${point(key.target.point)}`);
  if(key.fov !== undefined) chips.push(`${round(key.fov)}° lens`);
  return (key.ease === 'hold') ? chips : [...chips, key.ease];
};

/** how close two actors come, in words */
const closeness = ({ actors: [a, b], time, gap }: ClosePair): Said => ({
  title: (gap > 0) ? `${a} and ${b} come within ${round(gap)} studs` : `${a} touches ${b}`,
  chips: [`at ${seconds2(time)}`],
});

const point = ({ x, z, height }: Readonly<{ x: number; z: number; height: number; }>) => `${round(x)}, ${round(z)}, ${round(height)}`;
const round = (value: number) => (Math.round(value * 100) / 100) || 0/*never -0*/;
