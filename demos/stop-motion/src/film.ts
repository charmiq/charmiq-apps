import type { Area, CameraKey, CameraPlace, Ease, FaceKey, FadeKey, HandKey, Key, Look, Point, Reaction, Recorded, RecordedActor, RecordedCamera, SetKey, Span, Target, Title, TransitionShape } from './recorder';
import { BASEPLATE, Clicked, type SurfaceAt } from './steps';

// a film: a recorded scene (SEE: recorder.ts) evaluated at every frame as the
// stage's frames take them. Each value eases from key to key; a function of time
// replaces or adds to its values over its span; a rider stands at its offset in the
// frame of what it rides, turned with it; the camera stands at a point or orbits its
// target, the orbit's angle eased so it swings round on its circle; a wheeled
// actor's wheels roll by the distance it moves along its own north. A plan view
// looks down over everything the film shows; its marks are each actor's path and the
// camera's, broken at each cut. A frame stands on the set its keys name, held from
// each key to the next as a cut. A film reaches the studios as a reel: each frame's
// set, world values, every view's camera, its fade and its title at the opacity it is
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
/** the most paths a studio's marks hold (Brick Studio's MAX_PATHS) */
const MAX_MARK_PATHS = 256;

// == Types =======================================================================
export type Turn = Readonly<{ yaw: number; pitch: number; roll: number; }>;
/** an actor in one frame, as the stage's frame takes it */
export type Shot = Readonly<{ name: string; position: Point; turn: Turn; pose?: Readonly<Record<string, number>>; face?: string; rightHand?: HandKey['item']; leftHand?: HandKey['item']; rolled?: number; }>;
/** a frame's camera as the stage takes it: what it focuses on is a point, or studs
 *  ahead along its view (kept so however it is drawn in clear of parts) */
export type StageCamera = Readonly<{ position: Point; target: Point; fov: number; roll?: number; focus?: Point | number; aperture?: number; }>;
/** a plan: straight down over an area, north up */
export type PlanCamera = Readonly<{ plan: Area; }>;
/** the camera a view sees the scene through */
export type ViewCamera = StageCamera | PlanCamera;

export type FilmFrame = Readonly<{
  index: number;
  /** seconds */
  time: number;
  /** the build's set it stands on, when a key names one by then (its first set
   *  otherwise) */
  set?: string;
  actors: ReadonlyArray<Shot>;
  camera: StageCamera;
  /** each named view's camera */
  views: Readonly<Record<string, ViewCamera>>;
  /** 0 shows the frame, 1 is its fade's color (black unless a key names one), over
   *  the whole picture or closing in as an iris */
  fade: number;
  fadeColor?: string;
  fadeShape?: 'iris';
  /** the shot its camera leaves in a cut's transition: that camera, its set, its
   *  actors on another set, the frame it last showed in (its index), how much of it
   *  still shows (1 all, 0 none) and how it gives way */
  transition?: Readonly<{ camera: StageCamera; set?: string; actors?: ReadonlyArray<Shot>; frame: number; left: number; shape: TransitionShape; }>;
  title?: Title;
}>;

export type Film = Readonly<{ scene: Recorded; frames: ReadonlyArray<FilmFrame>; }>;

/** a frame as a studio's reel takes it (SEE: Brick Studio's loadReel) */
export type ReelFrame = Readonly<{
  set?: string;
  actors: ReadonlyArray<Shot>;
  camera: StageCamera;
  views?: Readonly<Record<string, ViewCamera>>;
  fade?: number;
  fadeColor?: string;
  fadeShape?: 'iris';
  transition?: Readonly<{ camera: StageCamera; set?: string; actors?: ReadonlyArray<Shot>; left: number; shape: TransitionShape; }>;
  title?: Readonly<{ text: string; style: 'card' | 'caption'; opacity: number; }>;
}>;

/** a camera's shot: from its cut (or the film's start) to the next cut (or the
 *  film's end), in seconds, named by its cut */
export type CameraShot = Readonly<{ from: number; to: number; name?: string; }>;
/** a shot's frames: its first, its last, and its middle (the frame a storyboard
 *  pictures) */
export type ShotFrames = Readonly<{ shot: CameraShot; first: number; last: number; middle: number; }>;

/** what a plan draws over the set: each path labeled and colored, dashed where it
 *  stands for something hidden, its points on the ground (SEE: Brick Studio's stage
 *  marks) */
export type Marks = Readonly<{ paths: ReadonlyArray<Readonly<{ label: string; color: string; dashed?: boolean; points: ReadonlyArray<Readonly<{ x: number; z: number; }>>; }>>; }>;
/** the colors marks are drawn in: an actor's by its place in the scene (its
 *  timeline row's), and the camera's */
export type Paint = Readonly<{ actor: (index: number) => string; camera: string; }>;

/** an actor's values in one frame, before any ride */
type Local = Readonly<{ channels: Readonly<Record<string, number>>; }>;
/** where an actor cast from a piece of the set stood, as the stage answers it, and a
 *  figure's pose there: the values its scene never keys (SEE: Brick Studio's stage
 *  Rest) */
export type Rest = Readonly<{ position: Point; turn: Turn; pose?: Readonly<Record<string, number>>; }>;
/** what the stage answers of a scene's cast, and the ground under it: the actors with
 *  wheels to roll (`wheeled`), those that pose (`figures`), those that click onto studs
 *  (`clicks`), where each actor cast from a piece of the set stood (`rests`), the
 *  surface under each actor following the ground at each frame (`grounds`, plates;
 *  SEE: groundsOf), and the surfaces in each cell of each set an actor clicking onto
 *  studs stands on (`surfaces`; SEE: surfacesOf; the baseplate alone when none) */
export type StageFacts = Readonly<{ wheeled?: ReadonlySet<string>; figures?: ReadonlySet<string>; clicks?: ReadonlySet<string>; rests?: ReadonlyMap<string, Rest>; grounds?: ReadonlyMap<string, ReadonlyArray<number>>; surfaces?: (set: string | undefined) => SurfaceAt; }>;
/** an actor where it stands in one frame */
type Placed = Readonly<{ position: Point; matrix: ReadonlyArray<number>; visible: boolean; pose?: Readonly<Record<string, number>>; }>;

// == Film ========================================================================
/** the film a recorded scene makes with what the stage answered of its cast (`facts`):
 *  every frame, each wheeled actor's wheels rolled, each figure idling where nothing
 *  else moves it (a span for a figure alone), each actor cast from a piece of the set
 *  starting from its rest (each value it keys from its keys, the rest from where the
 *  piece stood), each actor following the ground standing on it (its keyed height
 *  above the surface under it), each actor that clicks onto studs (and rides nothing)
 *  walking and standing as one does (SEE: steps.ts; its walks' glide left out), each
 *  head turned to what it looks at (SEE: looking), each actor not kept still shifted
 *  a frame at a time by the scene's boil (SEE: boiled). Throws, naming the scene's
 *  line, when an actor rides in a circle or leaves the stage's reach */
export const filmOf = (scene: Recorded, facts: StageFacts = {}): Film => {
  const { wheeled = new Set<string>(), figures = new Set<string>(), clicks = new Set<string>(), rests = new Map<string, Rest>(), grounds = new Map<string, ReadonlyArray<number>>(), surfaces = () => BASEPLATE } = facts;
  const order = rideOrder(scene.actors).map(actor => ({ ...actor, spans: actor.spans.filter(span => (!span.figure || figures.has(actor.name))/*a figure's alone*/ && (!span.glide || !clicks.has(actor.name) || !!actor.ride)/*a walk stepped*/) }));
  const clicked = new Map(order.filter(actor => clicks.has(actor.name) && !actor.ride).map(actor => [actor.name, new Clicked(actor.walks ?? [], actor.ground?.step, figures.has(actor.name), actor.spans.filter(span => span.label === 'crowd').map(({ from, to }) => [from / scene.fps, to / scene.fps] as const))]));
  const frames: FilmFrame[] = [];
  const rolled = new Map<string, number>();
  const looked = new Map<string, Readonly<{ angle: number; engaged: number; }>>();
  let previous: ReadonlyMap<string, Placed> | undefined;
  const times = sceneTimesOf(scene);
  for(let index=0; index<times.length; index++) {
    const time = times[index], at = time * scene.fps/*where it stands among the scene's own frames*/;
    const placed = new Map<string, Placed>(), headings = new Map<string, number>();
    for(const actor of order) {
      const cast = rests.get(actor.name);
      const rest: Partial<Rest> | undefined = (actor.ride && cast) ? (cast.pose ? { pose: cast.pose } : undefined)/*a rider stands where it rides, in the pose it stood in*/ : cast;
      const ground = grounds.get(actor.name)?.[index];
      // following the ground, its own height counts from the ground (its piece's place
      // and turn kept): what its keys and paths give it, over the ground under it
      const keyed = boiled(localAt(actor, at, time, (rest?.position && (ground !== undefined)) ? { ...rest, position: { ...rest.position, height: 0 } } : rest), actor, index, scene.boil, figures.has(actor.name), clicks.has(actor.name));
      const grounded = (ground === undefined) ? keyed : { channels: { ...keyed.channels, height: (keyed.channels.height ?? 0) + ground } };
      const stepping = clicked.get(actor.name);
      const local = stepping ? { channels: stepping.at(grounded.channels, time, surfaces(setAt(scene.sets, time))) } : grounded;
      const own = placedOf(local);
      const parent = actor.ride && placed.get(actor.ride.parent);
      const standing = parent ? riding(parent, actor.ride!.offset, own) : own;
      within(actor, standing.position, time);
      placed.set(actor.name, standing);
      // its heading as written: what it rides's, and its own yaw, unwrapped (a turn
      // through 180 carries on round), what its ride's tilt adds taken from its turn
      const written = (parent ? headings.get(actor.ride!.parent)! : 0) + (local.channels.yaw ?? 0);
      headings.set(actor.name, written + wrapped(turnOf(standing.matrix).yaw - written));
    }
    for(const name of wheeled) {
      const now = placed.get(name), before = previous?.get(name);
      if(!now) continue;
      const yaw = turnOf(now.matrix).yaw * (Math.PI / 180);
      const moved = before ? (((now.position.x - before.position.x) * Math.sin(yaw)) + ((now.position.z - before.position.z) * Math.cos(yaw))) : 0;
      rolled.set(name, (rolled.get(name) ?? 0) + moved);
    }
    previous = placed;
    for(const actor of scene.actors) if(actor.looks) looking(actor, time, (index > 0) ? (time - times[index - 1]) : (1 / scene.fps), placed, headings, looked);

    const actors = scene.actors.flatMap(({ name, faces, reactions, hands }) => {
      const standing = placed.get(name)!;
      if(!standing.visible) return [];
      const face = reactionAt(reactions, time) ?? faceAt(faces, time);
      const holding = (['rightHand', 'leftHand'] as const).flatMap(hand => { const key = heldAt(hands?.filter(each => each.hand === hand), time); return key ? [[hand, key.item] as const] : []; });
      return [{ name, position: standing.position, turn: turnOf(standing.matrix), ...(standing.pose ? { pose: standing.pose } : {}), ...(face ? { face } : {}), ...Object.fromEntries(holding), ...(wheeled.has(name) ? { rolled: rolled.get(name)! } : {}) }];
    });
    const fade = channelAt(scene.fade, 'fade', time) ?? 0;
    const fading = fadeStyleAt(scene.fade, time);
    const transition = transitionAt(scene, at, time, placed, headings, setAt(scene.sets, time), frames);
    const title = scene.titles.find(each => (time >= each.from) && (time < each.to));
    const views = Object.fromEntries(scene.views.filter(view => !view.plan).map(view => [view.name, cameraAt(view, at, time, placed, headings)]));
    const set = setAt(scene.sets, time);
    frames.push({ index, time, ...((set !== undefined) ? { set } : {}), actors, camera: cameraAt(scene.camera, at, time, placed, headings), views, fade, ...((fade > 0) ? fading : {}), ...(transition ? { transition } : {}), ...(title ? { title } : {}) });
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

/** the shot showing at `time`: the last whose cut it has reached */
export const shotAt = (shots: ReadonlyArray<CameraShot>, time: number): CameraShot | undefined => shots.filter(shot => isReached(shot.from, time)).pop();

/** each of a film's shots that a frame shows, with its first and last frames and the
 *  one nearest its middle: a shot holds the frames that reach its cut and not the next, so one
 *  holding no frame has none */
export const shotFrames = ({ scene, frames }: Film): ReadonlyArray<ShotFrames> => cameraShots(scene.camera, scene.length).flatMap(shot => {
  const first = frames.findIndex(frame => isReached(shot.from, frame.time));
  const next = frames.findIndex(frame => isReached(shot.to, frame.time));
  const last = ((next < 0) ? frames.length : next) - 1;
  if((first < 0) || (first > last)) return []/*no frame shows it*/;
  return [{ shot, first, last, middle: Math.min(last, Math.max(first, frameAtTime({ scene, frames }, (shot.from + shot.to) / 2))) }];
});

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
 *  broken at each cut and dashed over the frames `inside` says it stands inside a part
 *  (each dashed stretch joined to its neighbors). A point repeating the one before is
 *  left out. Dashes too many for a studio's marks leave the camera's path whole */
export const planMarksOf = (film: Film, paint: Paint, inside: ReadonlyArray<boolean> = []): Marks => {
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

  const camera = cameraPaths(film, paint, inside);
  return { paths: [...paths, ...(((paths.length + camera.length) > MAX_MARK_PATHS) ? cameraPaths(film, paint, []) : camera)] };
};

/** the camera's path, broken at each cut and at each change in whether it stands
 *  inside a part */
const cameraPaths = ({ scene, frames }: Film, paint: Paint, inside: ReadonlyArray<boolean>): Marks['paths'] => {
  const paths: Array<Marks['paths'][number]> = [];
  const cuts = cameraShots(scene.camera, scene.length).slice(1).map(shot => shot.from);
  let points: Array<{ x: number; z: number; }> = [], dashed = false;
  const end = () => { if(points.length > 0) paths.push({ label: CAMERA_LABEL, color: paint.camera, ...(dashed ? { dashed } : {}), points }); };
  frames.forEach((frame, index) => {
    const cut = (index > 0) && cuts.some(time => !isReached(time, frames[index - 1].time) && isReached(time, frame.time));
    const hidden = inside[index] === true;
    if(cut) { end(); points = []; }
    else if((hidden !== dashed) && (points.length > 0)) { end(); points = [points[points.length - 1]]/*joined to the stretch before*/; }
    dashed = hidden;
    pushPoint(points, frame.camera.position);
  });
  end();
  return paths;
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
  ...((frame.set !== undefined) ? { set: frame.set } : {}),
  actors: frame.actors,
  camera: frame.camera,
  ...((Object.keys(frame.views).length > 0) ? { views: frame.views } : {}),
  ...((frame.fade > 0) ? { fade: frame.fade, ...(frame.fadeColor ? { fadeColor: frame.fadeColor } : {}), ...(frame.fadeShape ? { fadeShape: frame.fadeShape } : {}) } : {}),
  ...(frame.transition ? { transition: { camera: frame.transition.camera, ...((frame.transition.set !== undefined) ? { set: frame.transition.set } : {}), ...(frame.transition.actors ? { actors: frame.transition.actors } : {}), left: frame.transition.left, shape: frame.transition.shape } } : {}),
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

/** an actor's values at a frame: from its rest when it has one (a figure's pose
 *  there with it), its keys eased over them, then its spans (what one adds, a
 *  figure's idling among them, added to the pose it rests in) */
const localAt = (actor: RecordedActor, index: number, time: number, rest: Partial<Rest> | undefined): Local => {
  const channels: Record<string, number> = rest ? { ...rest.position, ...rest.turn, ...Object.fromEntries(Object.entries(rest.pose ?? {}).map(([limb, angle]) => [`pose.${limb}`, angle])) }/*its keys and paths from there*/ : {};
  for(const channel of new Set(actor.keys.flatMap(key => Object.keys(key.values)))) channels[channel] = channelAt(actor.keys, channel, time)!;
  applySpans(channels, actor.spans, index);
  return { channels };
};

/** an actor's values shifted at a frame (its index in the film) by the scene's boil
 *  (0 to 1), as bricks moved by hand between exposures: its place and turn, a
 *  figure's head and arms besides, and the tilt of one clicking onto studs (where it
 *  stands clicked in, the tilt alone moves it), by amounts its name and the frame fix
 *  (the same every run); an actor kept still, or a scene with no boil, as it is */
const boiled = (local: Local, actor: RecordedActor, index: number, boil: number | undefined, figure: boolean, clicks: boolean): Local => {
  if(!boil || actor.still) return local;
  const shift = (channel: string, most: number) => boil * most * jitter(`${actor.name}|${index}|${channel}`);
  const channels: Record<string, number> = { ...local.channels };
  for(const [channel, most] of BOIL) {
    if(channel.startsWith('pose.') && !figure) continue/*no limbs to shift*/;
    channels[channel] = (channels[channel] ?? 0) + shift(channel, most);
  }
  if(clicks) for(const [channel, most] of TILT) channels[channel] = (channels[channel] ?? 0) + shift(channel, most);
  return { channels };
};
/** the most a full boil shifts each value: studs, degrees; and tilts an actor clicking
 *  onto studs, never quite level on them (degrees) */
const BOIL: ReadonlyArray<readonly [string, number]> = [['x', 0.06], ['z', 0.06], ['yaw', 1.2], ['pose.head', 3], ['pose.rightArm', 3], ['pose.leftArm', 3]];
const TILT: ReadonlyArray<readonly [string, number]> = [['pitch', 0.8], ['roll', 0.8]];
/** a fixed number from -1 to 1 for some text (FNV-1a over it) */
const jitter = (text: string): number => {
  let hash = 0x811c9dc5;
  for(let at=0; at<text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
  return (((hash >>> 0) / 0xffffffff) * 2) - 1;
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
 *  at a point), its lens, then any shake. An orbit relative to the target's heading
 *  turns with the actor the target key in force names (0 behind it; SEE: keyInForce):
 *  its angle on the world is its own less that actor's heading (`headings`, its yaw as
 *  written, unwrapped; an orbit's angle runs counterclockwise seen from above, a yaw
 *  clockwise). Round a point, an orbit has no heading: its angle is the world's */
const cameraAt = (camera: RecordedCamera, index: number, time: number, placed: ReadonlyMap<string, Placed>, headings: ReadonlyMap<string, number>): StageCamera => {
  const keys = camera.keys;
  const resolve = (target: Target): Point => ('point' in target) ? target.point : lifted(placed.get(target.actor)!.position, target.height);
  const target = eased(keys.filter(key => key.target), time, key => resolve(key.target!), lerpPoint) ?? DEFAULT_TARGET;
  const aimed = keyInForce(keys.filter(key => key.target), time)?.target;
  const heading = (aimed && ('actor' in aimed)) ? headings.get(aimed.actor)! : 0;
  const onWorld = (orbit: Readonly<{ angle: number; relativeTo?: 'heading'; }>): number => orbit.angle - ((orbit.relativeTo === 'heading') ? heading : 0);

  const places = keys.filter(key => key.place);
  const pointOf = (place: CameraPlace): Point => ('point' in place) ? place.point : orbitPoint(target, { ...place.orbit, angle: onWorld(place.orbit) });
  const position = eased(places, time, key => key.place!, (from, to, u): CameraPlace => {
    if(('orbit' in from) && ('orbit' in to)) return { orbit: { angle: lerp(onWorld(from.orbit), onWorld(to.orbit), u), distance: lerp(from.orbit.distance, to.orbit.distance, u), height: lerp(from.orbit.height, to.orbit.height, u) } }/*round on its circle, its angles on the world*/;
    return { point: lerpPoint(pointOf(from), pointOf(to), u) };
  });
  const channels: Record<string, number> = {};
  applySpans(channels, camera.spans, index);
  const standing = position ? pointOf(position) : orbitPoint(target, DEFAULT_ORBIT);
  const shaken = { x: standing.x + (channels.x ?? 0), z: standing.z + (channels.z ?? 0), height: standing.height + (channels.height ?? 0) };
  const apart = ((shaken.x === target.x) && (shaken.z === target.z) && (shaken.height === target.height)) ? { ...shaken, height: shaken.height + 0.01 } : shaken;
  const lensKeys = keys.filter(key => key.fov !== undefined);
  const fov = eased(lensKeys, time, key => key.fov!, lerp) ?? DEFAULT_FOV;
  const roll = eased(keys.filter(key => key.roll !== undefined), time, key => key.roll!, lerp) ?? 0;
  const drawn = dollied(keys, lensKeys, time);
  const seen = (drawn === 1) ? apart : { x: target.x + ((apart.x - target.x) * drawn), z: target.z + ((apart.z - target.z) * drawn), height: target.height + ((apart.height - target.height) * drawn) };
  // what is sharp: each key's focus where it stands now (an actor as it moves), eased
  // from key to key; held by a distance (none eased into, or a cut yet to come) or
  // racked between two, a distance ahead along the view, which holds however the
  // camera is drawn in; racked between a distance and a point, points, the distance
  // read where the camera stands as keyed
  const focusKeys = keys.filter(key => key.focus);
  const next = focusKeys.find(key => !isReached(key.time, time));
  const easing = [focusKeys.filter(key => isReached(key.time, time)).pop(), ((next?.ease === 'hold') && (next !== focusKeys[0])) ? undefined/*a cut: never eased into*/ : next].filter(key => key !== undefined);
  const focus = easing.every(key => 'distance' in key.focus!)
    ? eased(focusKeys, time, key => (('distance' in key.focus!) ? key.focus.distance : 0/*not between these keys*/), lerp)
    : eased(focusKeys, time, key => (('distance' in key.focus!) ? ahead(seen, target, key.focus.distance) : resolve(key.focus!)), lerpPoint);
  const aperture = eased(keys.filter(key => key.aperture !== undefined), time, key => key.aperture!, lerp);
  return { position: seen, target, fov, ...(roll ? { roll } : {}), ...((focus !== undefined) ? { focus } : {}), ...((aperture !== undefined) ? { aperture } : {}) };
};

/** the point `studs` from `from` toward `toward` (heights in plates) */
const ahead = (from: Point, toward: Point, studs: number): Point => {
  const plates = LDU_PER_STUD / LDU_PER_PLATE/*a stud's width, in plates*/;
  const [x, z, height] = [toward.x - from.x, toward.z - from.z, (toward.height - from.height) / plates];
  const share = studs / (Math.hypot(x, z, height) || 1);
  return { x: from.x + (x * share), z: from.z + (z * share), height: from.height + (height * share * plates) };
};

/** how far dolly zooms draw the camera along its line to its target at a time (1 as
 *  keyed): over a run of lens keys keeping their target's size (`dollyZoom`), from the
 *  lens key before the run, the camera drawn as the lens narrows and pushed back as it
 *  widens, so the target keeps the size it had there (the distance against the tangent
 *  of half the lens); after the run, held where it left the camera (a lens changing
 *  then changes the picture alone, and a later run draws on from there) until a key
 *  placing the camera */
const dollied = (keys: ReadonlyArray<CameraKey>, lensKeys: ReadonlyArray<CameraKey>, time: number): number => {
  const half = (degrees: number) => Math.tan((degrees * (Math.PI / 180)) / 2);
  let drawn = 1;
  for(let start=1; start<lensKeys.length; start++) {
    if(!lensKeys[start].dollyZoom || lensKeys[start - 1].dollyZoom) continue/*not a run's first*/;
    let end = start;
    while(lensKeys[end + 1]?.dollyZoom) end++;
    const reference = lensKeys[start - 1];
    if(!isReached(reference.time, time)) break/*later runs not begun*/;
    const run = lensKeys.slice(start - 1, end + 1);
    drawn *= half(reference.fov!) / half(eased(run, time, key => key.fov!, lerp)!);
    if(keys.some(other => other.place && (other.time > lensKeys[end].time) && isReached(other.time, time))) drawn = 1/*a key placing the camera since*/;
    start = end;
  }
  return drawn;
};

/** the shot a frame's camera leaves in a cut's transition: the latest cut the frame has
 *  reached, while its transition's span holds the frame (a later cut ends it, with or
 *  without one of its own); the camera as its keys before the cut place it
 *  (holding its last place as the world moves on), each value none of them names held
 *  from the first key naming it, as the frames before the cut draw it (SEE:
 *  heldBefore), on the set standing before the cut.
 *  On another set than the frame's, it is the last frame before the cut (`before`, the
 *  frames so far) as it stood: its camera and its actors, one moment, drawn once and
 *  held. A cut no frame stands before leaves no shot */
const transitionAt = (scene: Recorded, at: number, time: number, placed: ReadonlyMap<string, Placed>, headings: ReadonlyMap<string, number>, standing: string | undefined, before: ReadonlyArray<FilmFrame>): FilmFrame['transition'] => {
  const keys = scene.camera.keys;
  const cut = keys.filter(key => (key.ease === 'hold') && isReached(key.time, time)).pop();
  if(!cut?.transition || (time >= (cut.time + cut.transition.seconds))) return undefined;
  const leaving = { keys: heldBefore(keys, cut), spans: scene.camera.spans };
  const set = setAt(scene.sets, cut.time - LEFT_SET_BEFORE);
  const last = [...before].reverse().find(frame => !isReached(cut.time, frame.time));
  if(!last) return undefined/*nothing filmed before the cut to leave*/;
  const apart = (set !== standing) ? { camera: last.camera, actors: last.actors } : { camera: cameraAt(leaving, at, time, placed, headings) };
  return { ...apart, ...((set !== undefined) ? { set } : {}), frame: last.index, left: 1 - ((time - cut.time) / cut.transition.seconds), shape: cut.transition.shape };
};
/** the values of a camera key */
const CAMERA_VALUES = ['place', 'target', 'fov', 'roll', 'focus', 'aperture'] as const;
/** the keys before a cut as the frames before it draw them: a value none of them names
 *  is the first key's naming it, held before that key (SEE: eased), so a lens first
 *  keyed at the cut is the shot's it leaves too */
const heldBefore = (keys: ReadonlyArray<CameraKey>, cut: CameraKey): ReadonlyArray<CameraKey> => {
  const before = keys.slice(0, keys.indexOf(cut));
  const [first, ...rest] = (before.length > 0) ? before : [{ time: cut.time, ease: cut.ease }]/*the cut keys all the frames before it*/;
  const held = CAMERA_VALUES.filter(name => !before.some(key => key[name] !== undefined)).flatMap(name => {
    const naming = keys.find(key => key[name] !== undefined);
    return naming ? [[name, naming[name]] as const] : [];
  });
  return [{ ...first, ...Object.fromEntries(held) }, ...rest];
};

/** how long before a cut the set its shot leaves is read (seconds): a set keyed at the
 *  cut is the shot it enters */
const LEFT_SET_BEFORE = 1e-3;

/** a fade's color and shape at a time: those of the key it eases into, else the last
 *  key's (black and the whole picture when no key names them) */
const fadeStyleAt = (keys: ReadonlyArray<FadeKey>, time: number): Readonly<{ fadeColor?: string; fadeShape?: 'iris'; }> => {
  const key = keys.find(each => !isReached(each.time, time - TIME_EPSILON)) ?? keys[keys.length - 1];
  return { ...(key?.color ? { fadeColor: key.color } : {}), ...(key?.shape ? { fadeShape: key.shape } : {}) };
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
export const faceAt = (faces: ReadonlyArray<FaceKey> | undefined, time: number): string | undefined => heldAt(faces, time)?.face;

/** the sets a stage of a scene stands, by name: none when the scene keys none; else
 *  each set its keys name, in the order first keyed, the build's first set (`first`)
 *  ahead of them when a frame stands before the first key */
export const stagedSets = (scene: Recorded, first: string): ReadonlyArray<string> | undefined => {
  const keys = scene.sets;
  if(!keys || (keys.length < 1)) return undefined;
  const names = [...((keys[0].time > TIME_EPSILON) ? [first] : []), ...keys.map(key => key.set)];
  return names.filter((name, index) => names.findIndex(other => other.toLowerCase() === name.toLowerCase()) === index);
};

/** the face a reaction gives at a time, the last declared of those then: none outside
 *  every reaction */
export const reactionAt = (reactions: ReadonlyArray<Reaction> | undefined, time: number): string | undefined =>
  reactions?.filter(reaction => (time >= (reaction.from - TIME_EPSILON)) && (time < (reaction.to - TIME_EPSILON))).pop()?.face;

/** how fast a head turns to what it looks at, and back (degrees a second), and how
 *  fast it takes to looking and leaves it (shares a second) */
const LOOK_RATE = 240;
const ENGAGE_RATE = 4;
/** an actor's head turned toward what it looks at in a frame: of its looks then whose
 *  target stands within its reach, the one begun latest (a reaction's over a lasting
 *  look, which takes back over once the reaction ends), as far as its `max` either way
 *  of where its torso faces (its heading, and its twist); the turn eased from the last frame's at LOOK_RATE, its own head's keyed
 *  turn giving way to it as it engages, and back as it lets go (SEE: Look) */
const looking = (actor: RecordedActor, time: number, step: number, placed: Map<string, Placed>, headings: ReadonlyMap<string, number>, looked: Map<string, Readonly<{ angle: number; engaged: number; }>>) => {
  const standing = placed.get(actor.name)!;
  const target = (look: Look): Point | undefined => ('point' in look.target) ? look.target.point : placed.get(look.target.actor)?.position;
  const begun = actor.looks!.map((look, order) => ({ look, order })).filter(({ look }) => (time >= (look.from - TIME_EPSILON)) && (time < (look.to - TIME_EPSILON)));
  const active = begun.sort((a, b) => (b.look.from - a.look.from) || (b.order - a.order)).map(({ look }) => look).find(look => {
    const at = target(look);
    return at && (Math.hypot(at.x - standing.position.x, at.z - standing.position.z) <= look.within);
  });
  const at = active && target(active)!;
  const facing = headings.get(actor.name)! + (standing.pose?.twist ?? 0)/*the head turns over its twisted torso*/;
  const wanted = (active && at) ? Math.max(-active.max, Math.min(active.max, wrapped((Math.atan2(at.x - standing.position.x, at.z - standing.position.z) * (180 / Math.PI)) - facing))) : 0;
  const before = looked.get(actor.name) ?? { angle: 0, engaged: 0 };
  const angle = before.angle + Math.max(-LOOK_RATE * step, Math.min(LOOK_RATE * step, wanted - before.angle));
  const engaged = Math.max(0, Math.min(1, before.engaged + ((active ? 1 : -1) * ENGAGE_RATE * step)));
  looked.set(actor.name, { angle, engaged });
  if((engaged <= 0) && (Math.abs(angle) < 1e-6)) return/*not looking*/;
  const own = standing.pose?.head ?? 0;
  placed.set(actor.name, { ...standing, pose: { ...standing.pose, head: (own * (1 - engaged)) + angle } });
};

/** the key in force at a time: the last at or before it, held to the next (none
 *  before the first) */
const heldAt = <K extends Readonly<{ time: number; }>>(keys: ReadonlyArray<K> | undefined, time: number): K | undefined => {
  let held: K | undefined;
  for(const key of keys ?? []) {
    if(key.time > (time + TIME_EPSILON)) break;
    held = key;
  }
  return held;
};

/** the set standing at a time, by name, when a key names one by then */
export const setAt = (keys: ReadonlyArray<SetKey> | undefined, time: number): string | undefined => heldAt(keys, time)?.set;

/** a channel's value at a time: its keys' values eased from each to the next, the
 *  first before it and the last after; undefined for a channel no key gives */
export const channelAt = (keys: ReadonlyArray<Key>, channel: string, time: number): number | undefined =>
  eased(keys.filter(key => channel in key.values), time, key => key.values[channel], lerp);

/** whether `time` has reached a key at `at`: a key holds from its own time on,
 *  compared exactly, so a cut's shot and the frames that show it agree */
export const isReached = (at: number, time: number): boolean => at <= time;

/** the camera key in force at a time, of keys sorted by time: the last it has reached,
 *  else the first, held before it as its values are (SEE: eased) */
export const keyInForce = <K extends Readonly<{ time: number; }>>(keys: ReadonlyArray<K>, time: number): K | undefined =>
  keys.filter(key => isReached(key.time, time)).pop() ?? keys[0];

/** a value at a time over keys sorted by time: each key's value eased into from the
 *  key before by the later key's ease */
const eased = <K extends Readonly<{ time: number; ease: Ease; }>, V>(keys: ReadonlyArray<K>, time: number, value: (key: K) => V, between: (from: V, to: V, u: number) => V): V | undefined => {
  if(keys.length < 1) return undefined;
  const next = keys.findIndex(key => !isReached(key.time, time));
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
const applySpans = (channels: Record<string, number>, spans: ReadonlyArray<Span>, at: number) => {
  for(const mode of ['set', 'add'] as const) for(const span of spans) {
    if((span.mode !== mode) || (at < (span.from - FRAME_EPSILON)) || (at > (span.to + FRAME_EPSILON))) continue;
    // between two of its frames (a film slowed past the scene's), each value eased
    // from the one to the next
    const into = Math.min(span.to, Math.max(span.from, at)) - span.from;
    const whole = Math.floor(into + FRAME_EPSILON), part = into - whole;
    const [sample, next] = [span.samples[whole], span.samples[Math.min(span.samples.length - 1, whole + 1)]];
    for(const [channel, own] of Object.entries(sample)) {
      const value = ((part > FRAME_EPSILON) && (channel in next)) ? own + ((next[channel] - own) * part) : own;
      channels[channel] = (mode === 'set') ? value : ((channels[channel] ?? 0) + value);
    }
  }
};
/** how near a frame's place among the scene's frames is to a whole one (frames) */
const FRAME_EPSILON = 1e-6;

// == Clock =======================================================================
// the film's own time against the scene's: a frame a 1/fps of the film's time after
// the one before, the scene's time it shows advancing by its speed (1 unless the scene
// keys speed: 0.25 a quarter as fast, slow motion; 2 twice). A frame stands at the
// scene's time it shows (FilmFrame.time); the film's time is its index over its fps
// (SEE: filmTimeOf)

/** the most frames a film runs (Brick Studio's reel's most) */
const MAX_FILM_FRAMES = 7_200;
/** the slowest and fastest a scene's speed runs */
export const MIN_SPEED = 0.05;
export const MAX_SPEED = 8;

/** the scene's time each film frame shows: each frame its fps after the one before at
 *  the speed there; a frame stands while it shows a time less than half a frame from
 *  the scene's end, as a film of the scene's own frames would. Throws, naming the
 *  speed's line, past MAX_FILM_FRAMES */
export const sceneTimesOf = (scene: Recorded): ReadonlyArray<number> => {
  if(!scene.speed || (scene.speed.length < 1)) return Array.from({ length: scene.frames }, (_, index) => index / scene.fps);
  const times: number[] = [];
  for(let time=0; ;) {
    const rate = channelAt(scene.speed, 'speed', time)!;
    if(time >= (scene.length - (rate / (2 * scene.fps)))) break;
    if(times.length >= MAX_FILM_FRAMES) throw sceneError(`the film runs past ${MAX_FILM_FRAMES} frames at its speed: speed it up, or shorten what runs slow`, scene.speed[0].line);
    times.push(time);
    time += rate / scene.fps;
  }
  return times.length > 0 ? times : [0];
};

/** the film's own time (seconds) a scene's time shows at: between the frames that show
 *  it, as far as it lies between them; past the film's ends at its first and last
 *  frames' pace */
export const filmTimeOf = (film: Film, time: number): number => {
  const { frames, scene } = film;
  const step = (index: number) => paceAt(film, index);
  if(time <= frames[0].time) return (time - frames[0].time) / (step(0) * scene.fps);
  let low = 0, high = frames.length - 1;
  while(low < high) { const middle = Math.ceil((low + high) / 2); if(frames[middle].time <= time) low = middle; else high = middle - 1; }
  return (low + ((time - frames[low].time) / step(low))) / scene.fps;
};

/** the scene's time a film's own time (seconds) shows: between its frames' */
export const sceneTimeOf = (film: Film, filmTime: number): number => {
  const { frames, scene } = film;
  const at = filmTime * scene.fps;
  const index = Math.max(0, Math.min(frames.length - 1, Math.floor(at)));
  return frames[index].time + (paceAt(film, index) * (at - index));
};

/** the scene's seconds a frame's span shows (its pace): to the next frame's time, the
 *  last frame's as the one before it (a film of one frame at its scene's own pace) */
const paceAt = (film: Film, index: number): number => {
  const { frames, scene } = film;
  if(index < (frames.length - 1)) return frames[index + 1].time - frames[index].time;
  return (index > 0) ? (frames[index].time - frames[index - 1].time) : (1 / scene.fps);
};

/** the scene's time a frame's span ends at: where the next frame stands, the last
 *  frame's as long as the one before it */
export const frameEnd = (film: Film, index: number): number => film.frames[index].time + paceAt(film, index);

/** how long the film runs (seconds of its own) */
export const filmLengthOf = (film: Film): number => film.frames.length / film.scene.fps;

/** the frame showing a scene's time: the nearest, the later of two as near */
export const frameAtTime = (film: Film, time: number): number => Math.max(0, Math.min(film.frames.length - 1, Math.round(filmTimeOf(film, time) * film.scene.fps)));

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
/** an angle (degrees) brought within a half turn of 0: -180 up to 180 */
const wrapped = (degrees: number): number => ((((degrees % 360) + 540) % 360)) - 180;

/** a failure naming the scene's line */
const sceneError = (message: string, line: number | undefined) => Object.assign(new Error(message), { sceneLine: line });
