import type { Area, CameraPlace, Ease, FaceKey, Key, Point, Recorded, RecordedActor, RecordedCamera, Span, Target, Title } from './recorder';

// a film: a recorded scene (SEE: recorder.ts) evaluated at every frame as the
// stage's frames take them. Each value eases from key to key; a function of time
// replaces or adds to its values over its span; a rider stands at its offset in the
// frame of what it rides, turned with it; the camera stands at a point or orbits its
// target, the orbit's angle eased so it swings round on its circle; a wheeled
// actor's wheels roll by the distance it moves along its own north. A plan view
// looks down over everything the film shows; its marks are each actor's path and the
// camera's, broken at each cut. A film reaches the studios as a reel: each frame's
// world values, every view's camera, its fade and its title at the opacity it is
// drawn at, so a studio draws a frame knowing nothing of time
// ********************************************************************************
// == Constants ===================================================================
const LDU_PER_STUD = 20;
const LDU_PER_PLATE = 8;
/** how far from the origin the stage takes a point (studs) and how high (plates) */
const MAX_COORDINATE = 400;
const MAX_HEIGHT = 2_000;

const DEFAULT_TARGET: Point = { x: 0, z: 0, height: 4 };
const DEFAULT_ORBIT = { angle: 30, distance: 40, height: 30 };
export const DEFAULT_FOV = 32/*degrees: the studio's own lens*/;
/** how far a key's time may lie past a frame's and still take effect at it: a frame's
 *  time is the quotient of its index and the fps, which rounds */
const TIME_EPSILON = 1e-9/*seconds*/;
/** how long a title takes to come in and to go */
const TITLE_EASE = 0.25/*seconds*/;
/** how far a plan reaches past everything it shows */
const PLAN_MARGIN = 4/*studs*/;
/** what a plan's marks name the camera's path */
const CAMERA_LABEL = 'camera';

// == Types =======================================================================
export type Turn = Readonly<{ yaw: number; pitch: number; roll: number; }>;
/** an actor in one frame, as the stage's frame takes it */
export type Shot = Readonly<{ name: string; position: Point; turn: Turn; pose?: Readonly<Record<string, number>>; face?: string; rolled?: number; }>;
export type StageCamera = Readonly<{ position: Point; target: Point; fov: number; }>;
/** a plan: straight down over an area, north up */
export type PlanCamera = Readonly<{ plan: Area; }>;
/** the camera a view sees the scene through */
export type ViewCamera = StageCamera | PlanCamera;

export type FilmFrame = Readonly<{
  index: number;
  /** seconds */
  time: number;
  actors: ReadonlyArray<Shot>;
  camera: StageCamera;
  /** each named view's camera */
  views: Readonly<Record<string, ViewCamera>>;
  /** 0 shows the frame, 1 is black */
  fade: number;
  title?: Title;
}>;

export type Film = Readonly<{ scene: Recorded; frames: ReadonlyArray<FilmFrame>; }>;

/** a frame as a studio's reel takes it (SEE: Brick Studio's loadReel) */
export type ReelFrame = Readonly<{
  actors: ReadonlyArray<Shot>;
  camera: StageCamera;
  views?: Readonly<Record<string, ViewCamera>>;
  fade?: number;
  title?: Readonly<{ text: string; style: 'card' | 'caption'; opacity: number; }>;
}>;

/** a camera's shot: from its cut (or the film's start) to the next cut (or the
 *  film's end), in seconds, named by its cut */
export type CameraShot = Readonly<{ from: number; to: number; name?: string; }>;

/** what a plan draws over the set: each path labeled and colored, its points on the
 *  ground (SEE: Brick Studio's stage marks) */
export type Marks = Readonly<{ paths: ReadonlyArray<Readonly<{ label: string; color: string; points: ReadonlyArray<Readonly<{ x: number; z: number; }>>; }>>; }>;
/** the colors marks are drawn in: an actor's by its place in the scene (its
 *  timeline row's), and the camera's */
export type Paint = Readonly<{ actor: (index: number) => string; camera: string; }>;

/** an actor's values in one frame, before any ride */
type Local = Readonly<{ channels: Readonly<Record<string, number>>; }>;
/** where an actor cast from a piece of the set stood, as the stage answers it: the
 *  values its scene never keys (SEE: Brick Studio's stage Rest) */
export type Rest = Readonly<{ position: Point; turn: Turn; }>;
/** an actor where it stands in one frame */
type Placed = Readonly<{ position: Point; matrix: ReadonlyArray<number>; visible: boolean; pose?: Readonly<Record<string, number>>; }>;

// == Film ========================================================================
/** the film a recorded scene makes: every frame, each wheeled actor's wheels rolled,
 *  each actor cast from a piece of the set starting from its rest (`rests`: each value
 *  it keys from its keys, the rest from where the piece stood). Throws, naming the
 *  scene's line, when an actor rides in a circle or leaves the stage's reach */
export const filmOf = (scene: Recorded, wheeled: ReadonlySet<string> = new Set(), rests: ReadonlyMap<string, Rest> = new Map()): Film => {
  const order = rideOrder(scene.actors);
  const frames: FilmFrame[] = [];
  const rolled = new Map<string, number>();
  let previous: ReadonlyMap<string, Placed> | undefined;
  for(let index=0; index<scene.frames; index++) {
    const time = index / scene.fps;
    const placed = new Map<string, Placed>();
    for(const actor of order) {
      const local = localAt(actor, index, time, actor.ride ? undefined : rests.get(actor.name)/*a rider stands where it rides*/);
      const own = placedOf(local);
      const parent = actor.ride && placed.get(actor.ride.parent);
      const standing = parent ? riding(parent, actor.ride!.offset, own) : own;
      within(actor, standing.position, time);
      placed.set(actor.name, standing);
    }
    for(const name of wheeled) {
      const now = placed.get(name), before = previous?.get(name);
      if(!now) continue;
      const yaw = turnOf(now.matrix).yaw * (Math.PI / 180);
      const moved = before ? (((now.position.x - before.position.x) * Math.sin(yaw)) + ((now.position.z - before.position.z) * Math.cos(yaw))) : 0;
      rolled.set(name, (rolled.get(name) ?? 0) + moved);
    }
    previous = placed;

    const actors = scene.actors.flatMap(({ name, faces }) => {
      const standing = placed.get(name)!;
      if(!standing.visible) return [];
      const face = faceAt(faces, time);
      return [{ name, position: standing.position, turn: turnOf(standing.matrix), ...(standing.pose ? { pose: standing.pose } : {}), ...(face ? { face } : {}), ...(wheeled.has(name) ? { rolled: rolled.get(name)! } : {}) }];
    });
    const fade = channelAt(scene.fade, 'fade', time) ?? 0;
    const title = scene.titles.find(each => (time >= each.from) && (time < each.to));
    const views = Object.fromEntries(scene.views.filter(view => !view.plan).map(view => [view.name, cameraAt(view, index, time, placed)]));
    frames.push({ index, time, actors, camera: cameraAt(scene.camera, index, time, placed), views, fade, ...(title ? { title } : {}) });
  }
  if(!scene.views.some(view => view.plan)) return { scene, frames };

  // each plan over the area it names, or over all the film shows
  const shown = scene.views.some(view => view.plan && !view.plan.area) ? planArea(scene, frames) : undefined/*every plan names its area*/;
  const plans = new Map(scene.views.flatMap(view => view.plan ? [[view.name, { plan: view.plan.area ?? shown! }] as const] : []));
  return { scene, frames: frames.map(frame => ({ ...frame, views: Object.fromEntries(scene.views.map(view => [view.name, plans.get(view.name) ?? frame.views[view.name]])) })) };
};

// == Shots =======================================================================
/** a camera's shots: one from the start and one from each cut, each to the next */
export const cameraShots = (camera: RecordedCamera, length: number): ReadonlyArray<CameraShot> => {
  const starts = new Map<number, string | undefined>([[0, undefined]]);
  for(const key of camera.keys) if((key.ease === 'hold') && (key.time < length)) starts.set(key.time, key.name ?? starts.get(key.time));
  const times = [...starts.keys()].sort((a, b) => a - b);
  return times.map((from, index) => { const name = starts.get(from); return { from, to: times[index + 1] ?? length, ...((name !== undefined) ? { name } : {}) }; });
};

// == Plan ========================================================================
/** the area a plan shows when it names none: the floor, every actor's place in every
 *  frame and every place the camera stands and looks, PLAN_MARGIN out, in whole studs
 *  within the stage's reach */
const planArea = (scene: Recorded, frames: ReadonlyArray<FilmFrame>): Area => {
  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  const take = ({ x, z }: Readonly<{ x: number; z: number; }>) => {
    bounds.west = Math.min(bounds.west, x); bounds.east = Math.max(bounds.east, x);
    bounds.south = Math.min(bounds.south, z); bounds.north = Math.max(bounds.north, z);
  };
  if(scene.floor) { take(scene.floor); take({ x: scene.floor.x + scene.floor.width, z: scene.floor.z + scene.floor.depth }); }
  for(const frame of frames) {
    for(const actor of frame.actors) take(actor.position);
    take(frame.camera.position);
    take(frame.camera.target);
  }
  const [west, south] = [Math.max(-MAX_COORDINATE, Math.floor(bounds.west - PLAN_MARGIN)), Math.max(-MAX_COORDINATE, Math.floor(bounds.south - PLAN_MARGIN))];
  const [east, north] = [Math.min(MAX_COORDINATE, Math.ceil(bounds.east + PLAN_MARGIN)), Math.min(MAX_COORDINATE, Math.ceil(bounds.north + PLAN_MARGIN))];
  return { x: west, z: south, width: Math.max(1, east - west), depth: Math.max(1, north - south) };
};

/** a plan's marks: each actor's path over the frames it shows (a frame it is hidden
 *  breaks it), none for a rider, whose path is what it rides; then the camera's path,
 *  broken at each cut. A point repeating the one before is left out */
export const planMarksOf = (film: Film, paint: Paint): Marks => {
  const { scene, frames } = film;
  const paths: Array<Marks['paths'][number]> = [];
  const shown = frames.map(frame => new Map(frame.actors.map(actor => [actor.name, actor.position])))/*each frame's actors, by name*/;
  scene.actors.forEach((actor, index) => {
    if(actor.ride) return/*its path is what it rides*/;
    const color = paint.actor(index);
    let points: Array<{ x: number; z: number; }> = [];
    for(const positions of shown) {
      const at = positions.get(actor.name);
      if(!at) { if(points.length > 0) paths.push({ label: actor.name, color, points }); points = []; continue; }
      pushPoint(points, at);
    }
    if(points.length > 0) paths.push({ label: actor.name, color, points });
  });

  const cuts = cameraShots(scene.camera, scene.length).slice(1).map(shot => shot.from);
  let points: Array<{ x: number; z: number; }> = [];
  frames.forEach((frame, index) => {
    const cut = (index > 0) && cuts.some(time => (time > frames[index - 1].time) && (time <= (frame.time + TIME_EPSILON)));
    if(cut && (points.length > 0)) { paths.push({ label: CAMERA_LABEL, color: paint.camera, points }); points = []; }
    pushPoint(points, frame.camera.position);
  });
  if(points.length > 0) paths.push({ label: CAMERA_LABEL, color: paint.camera, points });
  return { paths };
};

/** adds a point on the ground, to the hundredth of a stud, to a path unless it
 *  repeats the last */
const pushPoint = (points: Array<{ x: number; z: number; }>, point: Point) => {
  const [x, z] = [hundredths(point.x), hundredths(point.z)];
  const last = points[points.length - 1];
  if(!last || (last.x !== x) || (last.z !== z)) points.push({ x, z });
};
const hundredths = (value: number): number => (Math.round(value * 100) / 100) || 0/*never -0*/;

// == Reel ========================================================================
/** a film's frame as a studio's reel takes it: what it leaves out, the studio takes
 *  as none */
export const reelFrameOf = (frame: FilmFrame): ReelFrame => ({
  actors: frame.actors,
  camera: frame.camera,
  ...((Object.keys(frame.views).length > 0) ? { views: frame.views } : {}),
  ...((frame.fade > 0) ? { fade: frame.fade } : {}),
  ...(frame.title ? { title: { text: frame.title.text, style: frame.title.style, opacity: titleOpacity(frame.title, frame.time) } } : {}),
});

/** how opaque a title is at a time: in over TITLE_EASE from its start, out over
 *  TITLE_EASE to its end */
export const titleOpacity = (title: Title, time: number): number => Math.max(0, Math.min(1, Math.min(time - title.from, title.to - time) / TITLE_EASE));

// == Actors ======================================================================
/** the actors in an order every rider follows what it rides in */
const rideOrder = (actors: ReadonlyArray<RecordedActor>): ReadonlyArray<RecordedActor> => {
  const byName = new Map(actors.map(actor => [actor.name, actor]));
  const ordered: RecordedActor[] = [];
  const visiting = new Set<string>();
  const visit = (actor: RecordedActor) => {
    if(ordered.includes(actor)) return;
    if(visiting.has(actor.name)) throw sceneError(`${actor.name} rides in a circle`, actor.line);
    visiting.add(actor.name);
    if(actor.ride) visit(byName.get(actor.ride.parent)!/*by contract: recorded*/);
    visiting.delete(actor.name);
    ordered.push(actor);
  };
  actors.forEach(visit);
  return ordered;
};

/** an actor's values at a frame: from its rest when it has one, its keys eased over
 *  them, then its spans */
const localAt = (actor: RecordedActor, index: number, time: number, rest: Rest | undefined): Local => {
  const channels: Record<string, number> = rest ? { ...rest.position, ...rest.turn }/*its keys and paths from there*/ : {};
  for(const channel of new Set(actor.keys.flatMap(key => Object.keys(key.values)))) channels[channel] = channelAt(actor.keys, channel, time)!;
  applySpans(channels, actor.spans, index);
  return { channels };
};

/** an actor as its own values place it */
const placedOf = ({ channels }: Local): Placed => {
  const pose = Object.fromEntries(Object.entries(channels).filter(([channel]) => channel.startsWith('pose.')).map(([channel, angle]) => [channel.slice('pose.'.length), angle]));
  return {
    position: { x: channels.x ?? 0, z: channels.z ?? 0, height: channels.height ?? 0 },
    matrix: rotation({ yaw: channels.yaw ?? 0, pitch: channels.pitch ?? 0, roll: channels.roll ?? 0 }),
    visible: (channels.visible ?? 1) >= 0.5,
    ...((Object.keys(pose).length > 0) ? { pose } : {}),
  };
};

/** a rider where what it rides puts it: its offset and its own position in the
 *  ridden actor's frame, its own turn after the ridden actor's */
const riding = (parent: Placed, offset: Point, own: Placed): Placed => {
  const local = [(offset.x + own.position.x) * LDU_PER_STUD, -(offset.height + own.position.height) * LDU_PER_PLATE, (offset.z + own.position.z) * LDU_PER_STUD];
  const moved = multiplyVector(parent.matrix, local);
  return {
    ...own,
    position: { x: parent.position.x + (moved[0] / LDU_PER_STUD), z: parent.position.z + (moved[2] / LDU_PER_STUD), height: parent.position.height - (moved[1] / LDU_PER_PLATE) },
    matrix: multiply(parent.matrix, own.matrix),
    visible: parent.visible && own.visible,
  };
};

/** refuses a point past the stage's reach, naming the actor and the moment */
const within = (actor: RecordedActor, { x, z, height }: Point, time: number) => {
  const reached = (Math.abs(x) <= MAX_COORDINATE) && (Math.abs(z) <= MAX_COORDINATE) && (Math.abs(height) <= MAX_HEIGHT);
  if(!reached) throw sceneError(`${actor.name} leaves the stage at ${time.toFixed(2)} s (x and z within ${MAX_COORDINATE} studs, height within ${MAX_HEIGHT} plates)`, actor.line);
};

// == Camera ======================================================================
/** the camera at a frame: its target, then where it stands (around the target, or
 *  at a point), its lens, then any shake */
const cameraAt = (camera: RecordedCamera, index: number, time: number, placed: ReadonlyMap<string, Placed>): StageCamera => {
  const keys = camera.keys;
  const resolve = (target: Target): Point => ('point' in target) ? target.point : lifted(placed.get(target.actor)!.position, target.height);
  const target = eased(keys.filter(key => key.target), time, key => resolve(key.target!), lerpPoint) ?? DEFAULT_TARGET;

  const places = keys.filter(key => key.place);
  const pointOf = (place: CameraPlace): Point => ('point' in place) ? place.point : orbitPoint(target, place.orbit);
  const position = eased(places, time, key => key.place!, (from, to, u) => {
    if(('orbit' in from) && ('orbit' in to)) return { orbit: { angle: lerp(from.orbit.angle, to.orbit.angle, u), distance: lerp(from.orbit.distance, to.orbit.distance, u), height: lerp(from.orbit.height, to.orbit.height, u) } }/*round on its circle*/;
    return { point: lerpPoint(pointOf(from), pointOf(to), u) };
  });
  const channels: Record<string, number> = {};
  applySpans(channels, camera.spans, index);
  const standing = position ? pointOf(position) : orbitPoint(target, DEFAULT_ORBIT);
  const shaken = { x: standing.x + (channels.x ?? 0), z: standing.z + (channels.z ?? 0), height: standing.height + (channels.height ?? 0) };
  const apart = ((shaken.x === target.x) && (shaken.z === target.z) && (shaken.height === target.height)) ? { ...shaken, height: shaken.height + 0.01 } : shaken;
  const fov = eased(keys.filter(key => key.fov !== undefined), time, key => key.fov!, lerp) ?? DEFAULT_FOV;
  return { position: apart, target, fov };
};

/** where an orbit stands around a target: `angle` degrees round from its south (90
 *  its east), `distance` studs out, `height` plates above it */
export const orbitPoint = (target: Point, orbit: Readonly<{ angle: number; distance: number; height: number; }>): Point => {
  const angle = orbit.angle * (Math.PI / 180);
  return { x: target.x + (orbit.distance * Math.sin(angle)), z: target.z - (orbit.distance * Math.cos(angle)), height: target.height + orbit.height };
};

const lifted = (point: Point, height: number): Point => ({ ...point, height: point.height + height });

// == Keys ========================================================================
/** the face an actor's face keys give at a time: the last keyed at or before it,
 *  none before the first (its declared face, as the stage casts it). A key a frame's
 *  time reaches by rounding alone still takes effect at that frame */
export const faceAt = (faces: ReadonlyArray<FaceKey> | undefined, time: number): string | undefined => {
  let face: string | undefined;
  for(const key of faces ?? []) {
    if(key.time > (time + TIME_EPSILON)) break;
    face = key.face;
  }
  return face;
};

/** a channel's value at a time: its keys' values eased from each to the next, the
 *  first before it and the last after; undefined for a channel no key gives */
export const channelAt = (keys: ReadonlyArray<Key>, channel: string, time: number): number | undefined =>
  eased(keys.filter(key => channel in key.values), time, key => key.values[channel], lerp);

/** a value at a time over keys sorted by time: each key's value eased into from the
 *  key before by the later key's ease */
const eased = <K extends Readonly<{ time: number; ease: Ease; }>, V>(keys: ReadonlyArray<K>, time: number, value: (key: K) => V, between: (from: V, to: V, u: number) => V): V | undefined => {
  if(keys.length < 1) return undefined;
  const next = keys.findIndex(key => key.time > time);
  if(next === 0) return value(keys[0]);
  if(next < 0) return value(keys[keys.length - 1]);
  const [from, to] = [keys[next - 1], keys[next]];
  return between(value(from), value(to), ease(to.ease, (time - from.time) / (to.time - from.time)));
};

/** progress `u` (0 to 1) shaped by an ease */
export const ease = (kind: Ease, u: number): number => {
  switch(kind) {
    case 'linear': return u;
    case 'ease-in': return u * u * u;
    case 'ease-out': return 1 - Math.pow(1 - u, 3);
    case 'ease-in-out': return (u < 0.5) ? (4 * u * u * u) : (1 - (Math.pow((-2 * u) + 2, 3) / 2));
    case 'hold': return 0;
  }
};

/** sets and adds what a frame's spans give: a set span's values replace, an add
 *  span's add */
const applySpans = (channels: Record<string, number>, spans: ReadonlyArray<Span>, index: number) => {
  for(const mode of ['set', 'add'] as const) for(const span of spans) {
    if((span.mode !== mode) || (index < span.from) || (index > span.to)) continue;
    for(const [channel, value] of Object.entries(span.samples[index - span.from])) channels[channel] = (mode === 'set') ? value : ((channels[channel] ?? 0) + value);
  }
};

// == Turns =======================================================================
// row-major rotation rows in LDraw's frame (y down), as the stage turns an actor:
// rolled, pitched, then yawed (SEE: Brick Studio's stage)
const radians = (degrees: number) => degrees * (Math.PI / 180);

/** the rotation of a turn */
export const rotation = ({ yaw, pitch, roll }: Turn): number[] => {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(radians(yaw)), Math.sin(radians(yaw)), Math.cos(radians(pitch)), Math.sin(radians(pitch)), Math.cos(radians(roll)), Math.sin(radians(roll))];
  const yawed = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const pitched = [1, 0, 0, 0, cp, sp, 0, -sp, cp];
  const rolled = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return multiply(multiply(yawed, pitched), rolled);
};

/** the turn of a rotation (degrees): its pitch from its middle row's last, then its
 *  roll and yaw */
export const turnOf = (m: ReadonlyArray<number>): Turn => {
  const pitch = Math.asin(Math.max(-1, Math.min(1, m[5])));
  const level = Math.cos(pitch) > 1e-9;
  const yaw = level ? Math.atan2(m[2], m[8]) : Math.atan2(-m[6], m[0])/*straight up or down: the yaw takes the roll*/;
  const roll = level ? Math.atan2(m[3], m[4]) : 0;
  const degrees = (value: number) => { const d = value * (180 / Math.PI); return Object.is(d, -0) ? 0 : d; };
  return { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) };
};

const multiply = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] =>
  [0, 1, 2].flatMap(row => [0, 1, 2].map(column => (a[row * 3] * b[column]) + (a[(row * 3) + 1] * b[3 + column]) + (a[(row * 3) + 2] * b[6 + column])));
const multiplyVector = (m: ReadonlyArray<number>, v: ReadonlyArray<number>): number[] =>
  [0, 1, 2].map(row => (m[row * 3] * v[0]) + (m[(row * 3) + 1] * v[1]) + (m[(row * 3) + 2] * v[2]));

// == Util ========================================================================
const lerp = (a: number, b: number, u: number): number => a + ((b - a) * u);
const lerpPoint = (a: Point, b: Point, u: number): Point => ({ x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), height: lerp(a.height, b.height, u) });

/** a failure naming the scene's line */
const sceneError = (message: string, line: number | undefined) => Object.assign(new Error(message), { sceneLine: line });
