// the scene recorder: runs a scene's code and records what it declares as plain
// data: the scene's settings, each actor's keys and the camera's, the fade, the
// titles and the sounds, every function of time sampled once per frame. It runs inside a Worker
// (SEE: scene-runner.ts), so `record` is self-contained: it reaches nothing outside
// its own body but the language's globals, and is shipped as its own source text
// ********************************************************************************
// == Types =======================================================================
/** how a value eases into a key from the key before it */
export type Ease = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

/** a point of the scene: x east and z north in studs, height up in plates */
export type Point = Readonly<{ x: number; z: number; height: number; }>;
/** an area of the scene in whole studs: its south-west corner and size */
export type Area = Readonly<{ x: number; z: number; width: number; depth: number; }>;

/** an actor's key: its channels at a time (x, z, height, yaw, pitch, roll, visible
 *  and each limb as `pose.<limb>`), eased into from the key before */
export type Key = Readonly<{ time: number; values: Readonly<Record<string, number>>; ease: Ease; line?: number; }>;
/** a figure's face from `time` on, until the next: worn at once, never eased (SEE:
 *  Brick Studio's faces) */
export type FaceKey = Readonly<{ time: number; face: string; line?: number; }>;
/** what a figure's hand holds from `time` on, until the next: an accessory (as Brick
 *  Studio's addParts dresses a hand), or nothing (null); taken at once, as a face is */
export type HandKey = Readonly<{ time: number; hand: 'rightHand' | 'leftHand'; item: Readonly<{ part: string; color: string; grip?: string; }> | null; line?: number; }>;
/** a figure's face over a span, over whatever it wears then: a reaction */
export type Reaction = Readonly<{ from: number; to: number; face: string; line?: number; }>;
/** a figure turning its head toward a target over a span (an actor, or a point), as
 *  far as `max` degrees either way, while the target stands within `within` studs; of
 *  two at once, the one begun latest (SEE: film.ts looking) */
export type Look = Readonly<{ from: number; to: number; target: Target; within: number; max: number; line?: number; }>;
/** the build's set standing from `time` on, until the next: a cut, never eased (SEE:
 *  Brick Studio's sets) */
export type SetKey = Readonly<{ time: number; set: string; line?: number; }>;
/** one of the studio's sounds played from `time`: once, or over and over `until` a
 *  time; at a volume (1 as recorded); from where an actor stands in the picture
 *  when it follows one (SEE: sound.ts) */
export type SoundCue = Readonly<{ time: number; name: string; volume: number; until?: number; actor?: string; fadeIn?: number; fadeOut?: number; line?: number; }>;

/** a walk: its span (seconds), the points it walks through (studs), how far its arms
 *  swing and it leans (degrees) and the foot it leads with (SEE: steps.ts) */
export type Walk = Readonly<{ start: number; end: number; points: ReadonlyArray<Readonly<{ x: number; z: number; }>>; arms: number; lean: number; lead: Foot; swing?: number; backward?: true; line?: number; }>;
export type Foot = 'left' | 'right';

/** a function of time over a span, sampled at each frame from `from` up to `to`
 *  (frame numbers, inclusive): `set` replaces its channels there, `add` adds to them;
 *  `figure`, only where the actor is a figure (the stage says which pose) */
export type Span = Readonly<{ from: number; to: number; mode: 'set' | 'add'; channels: ReadonlyArray<string>; samples: ReadonlyArray<Readonly<Record<string, number>>>; label: string; figure?: true; glide?: true; line?: number; }>;

/** where the camera looks: a point, or an actor's position raised by `height` plates */
export type Target = Readonly<{ point: Point; } | { actor: string; height: number; }>;
/** where the camera stands: a point, or around its target at `angle` degrees,
 *  `distance` studs out and `height` plates above it. The angle is fixed to the world
 *  (0 south of the target, 90 east) or, `relativeTo: 'heading'`, turns with the target
 *  actor's heading (0 behind it, 90 its right, 180 before it) */
export type CameraPlace = Readonly<{ point: Point; } | { orbit: Readonly<{ angle: number; distance: number; height: number; relativeTo?: 'heading'; }>; }>;
/** a camera's key; a cut is a held key, and `name` names the shot it starts, which
 *  enters by its `transition` over the shot it leaves. `avoid: 'parts'` keeps the
 *  camera out of the set's parts from it to the next key placing it (SEE: studios.ts
 *  avoided). `roll` turns the camera about where it looks (degrees, clockwise as seen
 *  from behind it); `shift` shifts its lens up by that share of the picture's height
 *  (down when negative, from -1 to 1), its verticals kept upright; `dollyZoom` keeps its
 *  target the size it is on the screen while the lens eases into the key (the camera
 *  drawn in or out against the lens). `focus` is what is sharp (its target when no key
 *  names it) and `aperture` the lens's opening as an f-number (a depth of field at
 *  every look once a key names one), each eased into: a rack focus */
export type CameraKey = Readonly<{ time: number; place?: CameraPlace; target?: Target; fov?: number; roll?: number; shift?: number; dollyZoom?: true; focus?: Focus; aperture?: number; avoid?: 'parts'; ease: Ease; name?: string; transition?: Transition; line?: number; }>;
/** what a camera focuses on: a point, an actor (raised), or what lies `distance` studs
 *  ahead of it along its view */
export type Focus = Target | Readonly<{ distance: number; }>;
/** how a shot enters over the one it leaves, over `seconds` from its cut: dissolving,
 *  wiping it away toward a side, or opening on it as an iris (SEE: Brick Studio's
 *  transitions) */
export type Transition = Readonly<{ shape: TransitionShape; seconds: number; }>;
export type TransitionShape = 'dissolve' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'iris';
/** a key of the fade: its amount (0 shows the frame, 1 its color), and, from it on,
 *  its color (#rrggbb, black unless named) and its shape (the whole picture, or an iris
 *  closing in from the frame's edge) */
export type FadeKey = Key & Readonly<{ color?: string; shape?: 'iris'; }>;

export type Title = Readonly<{ from: number; to: number; text: string; style: 'card' | 'caption'; line?: number; }>;

export type RecordedCamera = Readonly<{ keys: ReadonlyArray<CameraKey>; spans: ReadonlyArray<Span>; }>;

export type RecordedActor = Readonly<{
  name: string;
  /** how the stage casts it: a component of the set, a dressed catalog part, or the
   *  piece of the set standing where it names (`placed`) */
  source: Readonly<Record<string, unknown>>;
  /** what it rides and where on it (studs east and north, plates up, in the
   *  ridden actor's frame) */
  ride?: Readonly<{ parent: string; offset: Point; }>;
  keys: ReadonlyArray<Key>;
  /** its face keys, in time order, when it has any */
  faces?: ReadonlyArray<FaceKey>;
  /** what its hands hold from each key on, in time order, when they change */
  hands?: ReadonlyArray<HandKey>;
  /** its reactions, when it has any */
  reactions?: ReadonlyArray<Reaction>;
  /** where it looks, when it looks anywhere */
  looks?: ReadonlyArray<Look>;
  /** its height follows the ground under it, stepping up at most `step` plates (SEE:
   *  studios.ts grounds) */
  ground?: Readonly<{ step: number; }>;
  /** it stands as keyed alone: no figure's idling where nothing else moves it, no boil */
  still?: true;
  spans: ReadonlyArray<Span>;
  /** its walks, in time order, when it walks: laid as steps where it clicks onto studs
   *  (SEE: steps.ts), its span `glide` the walk where it does not */
  walks?: ReadonlyArray<Walk>;
  line?: number;
}>;

export type Recorded = Readonly<{
  title: string;
  fps: number;
  /** seconds */
  length: number;
  /** frames */
  frames: number;
  /** the size a film is exported at (pixels) */
  width: number;
  height: number;
  /** the area (studs) the studio's baseplate covers at least: its south-west corner
   *  and size */
  floor?: Readonly<{ x: number; z: number; width: number; depth: number; }>;
  /** how much every actor shifts from frame to frame, as bricks moved by hand (0 to 1),
   *  when the scene asks for any (SEE: film.ts boiled) */
  boil?: number;
  /** how the stage is lit over the look's own light, when the scene says (SEE: Brick
   *  Studio's StageLight) */
  light?: Readonly<{ key?: number; fill?: number; exposure?: number; soft?: number; }>;
  actors: ReadonlyArray<RecordedActor>;
  camera: RecordedCamera;
  /** more cameras, by name: each a second studio's view of the scene. A plan looks
   *  straight down over `area`, or over everything the film shows when it names none */
  views: ReadonlyArray<RecordedCamera & Readonly<{ name: string; plan?: Readonly<{ area?: Area; }>; }>>;
  fade: ReadonlyArray<FadeKey>;
  titles: ReadonlyArray<Title>;
  /** which of the build's sets stands from each key on, in time order, when the scene
   *  keys any (its first set stands before the first) */
  sets?: ReadonlyArray<SetKey>;
  /** the sounds it plays, in time order, when it plays any */
  sounds?: ReadonlyArray<SoundCue>;
  /** how fast the scene runs against the film from each key on (`speed`: 1 as it is,
   *  0.25 a quarter as fast), eased between keys, in time order, when it keys any
   *  (SEE: film.ts Clock) */
  speed?: ReadonlyArray<Key>;
  /** what the scene logged (console.log) */
  logs: ReadonlyArray<string>;
}>;

/** a scene that failed to run: why, and the line of the scene it failed on */
export type SceneError = Readonly<{ message: string; line?: number; }>;

// == Cast ========================================================================
/** what an actor is cast as, in a few words: its component, its part in its color, or
 *  the piece of the set standing where it names; and whether that is one thing (the
 *  cart) or one of a kind (a red figure) */
export const castAs = (source: Readonly<Record<string, unknown>>): Readonly<{ words: string; definite: boolean; }> => {
  if(typeof source.component === 'string') return { words: source.component, definite: true };
  const placed = source.placed as Readonly<Record<string, unknown>> | undefined;
  if((typeof placed === 'object') && (placed !== null)) return { words: `piece at x ${String(placed.x)}, z ${String(placed.z)}, level ${String(placed.level)}${(typeof placed.set === 'string') ? ` in ${placed.set}` : ''}`, definite: true };
  return { words: [source.color, source.part].filter(Boolean).join(' '), definite: false };
};

// == Recorder ====================================================================
/** runs a scene's code and records it, its sounds Platform files (by URI) or named
 *  from the `shipped` sounds; throws a SceneError-shaped error for a scene that
 *  fails or declares something no film can show */
export const record = (code: string, shipped: ReadonlyArray<string> = []): Recorded => {
  // .. Limits ....................................................................
  const MAX_LENGTH = 120/*seconds*/;
  const MAX_FPS = 60;
  const MAX_ACTORS = 64;
  const MAX_KEYS = 2_000;
  const MAX_NAME = 40/*characters*/;
  const MAX_VOLUME = 4;
  const EASES = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];
  const LIMBS = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'twist', 'lean', 'rightWrist', 'leftWrist'];
  const MAX_CROWD = 40/*walkers*/;
  const MAX_STEP = 48/*plates*/;
  /** a walk's pace when none is given (studs a second) and the fastest */
  const WALK_SPEED = 3;
  const MAX_SPEED = 40;
  /** how long a walk's gait takes to start and to settle (seconds), and a turn at a
   *  corner */
  const GAIT_EASE = 0.2;
  const TURN_SECONDS = 0.3;
  const ACTOR_CHANNELS = ['x', 'z', 'height', 'yaw', 'pitch', 'roll', 'visible', ...LIMBS.map(limb => `pose.${limb}`)];

  // .. Failures ..................................................................
  /** the line of the scene's code an error's stack passes through first: the scene
   *  runs as a function whose first three lines are its own (its head, its brace and
   *  its strict mode) */
  const stackLine = (error: unknown): number | undefined => {
    const match = String((error as { stack?: unknown; } | null)?.stack ?? '').split('\n').map(frame => /<anonymous>:(\d+):\d+/.exec(frame)).find(Boolean);
    return match ? Number(match[1]) - 3 : undefined/*not from the scene's code*/;
  };
  /** the line of the scene's code a call came from */
  const callerLine = (): number | undefined => stackLine(new Error());
  /** refuses what the scene declared, naming its line */
  const fail = (message: string, line = callerLine()): never => { throw Object.assign(new Error(message), { sceneLine: line }); };

  // .. Reading ...................................................................
  const isFiniteNumber = (value: unknown): value is number => (typeof value === 'number') && Number.isFinite(value);
  const toTime = (value: unknown, what: string): number => {
    if(!isFiniteNumber(value) || (value < 0) || (value > MAX_LENGTH)) fail(`${what}: a time is seconds from 0 to ${MAX_LENGTH}`);
    return value as number;
  };
  const toEase = (value: unknown): Ease => {
    if(value === undefined) return 'ease-in-out';
    if(!EASES.includes(value as string)) fail(`unknown ease '${String(value)}' (${EASES.join(', ')})`);
    return value as Ease;
  };
  const toPoint = (value: unknown, what: string): Point => {
    const { x, z, height } = (value ?? {}) as Record<string, unknown>;
    if(![x, z, height].every(isFiniteNumber)) fail(`${what} is { x, z, height }: studs, studs and plates`);
    return { x: x as number, z: z as number, height: height as number };
  };
  /** an actor's name, given the name or the actor itself */
  const nameOf = (actor: unknown): unknown => ((typeof actor === 'object') && (actor !== null)) ? (actor as { name?: unknown; }).name : actor;
  /** where a camera looks: an actor (its name or itself), `{ actor, height }`, or a
   *  point; undefined where the key leaves it to the key before */
  const toTarget = (value: unknown, what: string): Target | undefined => {
    if(value === undefined) return undefined/*where the key before left it*/;
    if(typeof value === 'string') return { actor: value, height: 0 };
    if((typeof value !== 'object') || (value === null)) return { point: toPoint(value, what) }/*refused: not a point*/;
    if(('name' in value) && !('x' in value)) return { actor: String(nameOf(value)), height: 0 };
    if(!('actor' in value)) return { point: toPoint(value, what) };
    const { actor: named, height = 0 } = value as Record<string, unknown>;
    if((typeof nameOf(named) !== 'string') || !isFiniteNumber(height)) fail(`${what} is a point, an actor, or { actor, height }`);
    return { actor: nameOf(named) as string, height: height as number };
  };

  // .. Recording .................................................................
  // what the scene declares, as it declares it
  const settings = { title: 'Untitled film', fps: 24, length: undefined as number | undefined, width: 1280, height: 720, floor: undefined as { x: number; z: number; width: number; depth: number; } | undefined, boil: 0, light: undefined as Record<string, number> | undefined };
  type Entry = { name: string; source: Record<string, unknown>; ride?: { parent: string; offset: Point; }; keys: Key[]; walks: Walk[]; faces: FaceKey[]; hands: HandKey[]; reactions: Reaction[]; looks: Array<Omit<Look, 'to'> & { to?: number; }>; ground?: { step: number; }; still?: true; spans: Array<() => Span>; line?: number; };
  const actors: Entry[] = [];
  const cameras = new Map<string, { keys: CameraKey[]; spans: Array<() => Span>; }>();
  /** the views that are plans, each with the area it names, if any */
  const plans = new Map<string, { area?: Area; }>();
  const fadeKeys: FadeKey[] = [];
  const speedKeys: Key[] = [];
  const setKeys: SetKey[] = [];
  const soundCues: SoundCue[] = [];
  const titles: Title[] = [];
  const logs: string[] = [];
  let keyCount = 0;
  /** counts a key, refusing a scene past MAX_KEYS */
  const counted = () => { if(++keyCount > MAX_KEYS) fail(`a scene holds at most ${MAX_KEYS} keys`); };

  // .. Scene .....................................................................
  /** the film's settings: its title, fps, length, export size, floor, boil and light */
  const scene = (options: Record<string, unknown> = {}) => {
    const { title, fps, length, width, height, floor, boil, light } = options;
    if(boil !== undefined) settings.boil = unitOf(boil, 'boil')/*0 to 1*/;
    if(light !== undefined) settings.light = lightOf(light);
    if(title !== undefined) settings.title = String(title);
    if(fps !== undefined) { if(!Number.isInteger(fps) || ((fps as number) < 1) || ((fps as number) > MAX_FPS)) fail(`fps is a whole number from 1 to ${MAX_FPS}`); settings.fps = fps as number; }
    if(length !== undefined) { settings.length = toTime(length, 'length'); if(settings.length <= 0) fail('length must be more than 0 seconds'); }
    if((width !== undefined) || (height !== undefined)) {
      if(![width, height].every(value => Number.isInteger(value) && ((value as number) >= 16) && ((value as number) <= 3840))) fail('width and height are whole pixels from 16 to 3840');
      settings.width = width as number; settings.height = Math.min(height as number, 2160);
    } /* else -- exported at 1280 x 720 */
    if(floor !== undefined) {
      const { x, z, width: across, depth } = (floor ?? {}) as Record<string, unknown>;
      if(![x, z, across, depth].every(Number.isInteger) || ((across as number) < 1) || ((depth as number) < 1)) fail('floor is { x, z, width, depth }: whole studs, its south-west corner and size');
      settings.floor = { x: x as number, z: z as number, width: across as number, depth: depth as number };
    } /* else -- the studio's baseplate covers its set */
  };

  // .. Actors ....................................................................
  /** values an actor's key or path gives, as channels; a key's face is taken before
   *  (`keyed`), and a path gives none: a face is worn from a key, until the next */
  const channelsOf = (values: unknown, what: string, keyed: Readonly<{ name: string; } | { key: true; }>): Record<string, number> => {
    const named = ('key' in keyed) ? 'x, z, height, yaw, pitch, roll, visible, pose, face, rightHand, leftHand' : 'x, z, height, yaw, pitch, roll, visible, pose';
    if((typeof values !== 'object') || (values === null)) fail(`${what} gives values: { ${named} }`);
    const channels: Record<string, number> = {};
    for(const [name, value] of Object.entries(values as Record<string, unknown>)) {
      if(name === 'pose') {
        if((typeof value !== 'object') || (value === null)) fail(`${what}: pose names limbs (${LIMBS.join(', ')})`);
        for(const [limb, angle] of Object.entries(value as Record<string, unknown>)) {
          if(!LIMBS.includes(limb)) fail(`${what}: pose names no limb '${limb}' (${LIMBS.join(', ')})`);
          if(!isFiniteNumber(angle)) fail(`${what}: pose.${limb} must be a number of degrees`);
          channels[`pose.${limb}`] = angle as number;
        }
        continue;
      } /* else -- a value of its own, not a limb */
      if(name === 'visible') { channels.visible = value ? 1 : 0; continue; }
      if(('name' in keyed) && ((name === 'face') || (name === 'rightHand') || (name === 'leftHand'))) fail(`${what}: a path gives no ${name}; ${(name === 'face') ? 'a face is worn' : 'what a hand holds is taken'} from a key: ${keyed.name}.at(time, { ${name} })`);
      if(!ACTOR_CHANNELS.includes(name)) fail(`${what}: no value '${name}' (${named})`);
      if(!isFiniteNumber(value)) fail(`${what}: ${name} must be a number`);
      channels[name] = value as number;
    }
    return channels;
  };

  /** an actor: what the stage casts it as, and its keys, paths, wobbles and ride */
  const actor = (name: unknown, source: unknown) => {
    if((typeof name !== 'string') || (name.trim().length < 1) || (name.length > 40)) fail('an actor is named: 1 to 40 characters');
    if(actors.some(each => each.name === name)) fail(`actor '${String(name)}' is declared twice`);
    if(actors.length >= MAX_ACTORS) fail(`a scene holds at most ${MAX_ACTORS} actors`);
    if((typeof source !== 'object') || (source === null)) fail(`actor '${String(name)}' names what it is: { component }, { part, color } or { placed: { x, z, level } }`);
    const entry: Entry = { name: name as string, source: { ...(source as Record<string, unknown>) }, keys: [], walks: [], faces: [], hands: [], reactions: [], looks: [], spans: [], line: callerLine() };
    actors.push(entry);
    const handle = {
      name,
      /** a key: the values the actor has at `time`, eased into, and its face and what
       *  its hands hold from then on, taken at once */
      at: (time: unknown, values: unknown, ease?: unknown) => {
        counted();
        const at = toTime(time, `${String(name)}.at`);
        const what = `${String(name)}.at(${at})`;
        const given = ((typeof values === 'object') && (values !== null)) ? values as Record<string, unknown> : undefined;
        const face = given?.face;
        if(face !== undefined) {
          if((typeof face !== 'string') || (face.trim().length < 1) || (face.length > 40)) fail(`${what}: face names a figure's face, such as grin or laugh`);
          entry.faces.push({ time: at, face: face as string, line: callerLine() });
        } /* else -- the face it wears goes on */
        for(const hand of ['rightHand', 'leftHand'] as const) if(given?.[hand] !== undefined) entry.hands.push({ time: at, hand, item: handItem(given[hand], `${what}.${hand}`), line: callerLine() });
        const taken = ['face', 'rightHand', 'leftHand'].filter(key => given?.[key] !== undefined);
        const channels = channelsOf(given ? Object.fromEntries(Object.entries(given).filter(([key]) => !taken.includes(key))) : values, what, { key: true });
        if((taken.length < 1) || (Object.keys(channels).length > 0)) entry.keys.push({ time: at, values: channels, ease: toEase(ease), line: callerLine() });
        return handle;
      },
      /** a function of time (u from 0 to 1 over the span, t in seconds) giving values
       *  from `from` to `to`, in place of its keys there */
      path: (from: unknown, to: unknown, fn: unknown) => {
        const [start, end] = [toTime(from, `${String(name)}.path`), toTime(to, `${String(name)}.path`)];
        if(end <= start) fail(`${String(name)}.path ends after it starts`);
        if(typeof fn !== 'function') fail(`${String(name)}.path takes a function of (u, t) giving values`);
        const line = callerLine();
        entry.spans.push(() => sampled(start, end, 'set', 'path', line, (u, t) => channelsOf((fn as (u: number, t: number) => unknown)(u, t), `${String(name)}.path at ${t.toFixed(3)} s`, { name: String(name) })));
        return handle;
      },
      /** smooth noise added to one value, `amount` at most, `rate` swings a second */
      wobble: (channel: unknown, amount: unknown, options: Record<string, unknown> = {}) => {
        if(!ACTOR_CHANNELS.includes(channel as string) || (channel === 'visible')) fail(`${String(name)}.wobble takes a value: x, z, height, yaw, pitch, roll or pose.<limb>`);
        if(!isFiniteNumber(amount)) fail(`${String(name)}.wobble's amount is a number`);
        const { rate = 1, from = 0, to, seed = actors.indexOf(entry) + 1 } = options;
        if(!isFiniteNumber(rate) || !isFiniteNumber(seed)) fail(`${String(name)}.wobble's rate and seed are numbers`);
        const start = toTime(from, `${String(name)}.wobble`);
        const line = callerLine();
        entry.spans.push(() => {
          const end = (to === undefined) ? settings.length! : toTime(to, `${String(name)}.wobble`);
          return sampled(start, end, 'add', `wobble ${String(channel)}`, line, (_, t) => ({ [channel as string]: (amount as number) * noise((t * (rate as number)) + ((seed as number) * 17.31)) }));
        });
        return handle;
      },
      /** walks along `points` (each { x, z }) from `time`: its position keyed along
       *  them at `speed` studs a second (or arriving `until` a time), turning to each
       *  leg as it reaches it. An actor that clicks onto studs walks it in steps of a
       *  stud (SEE: steps.ts), its arms and lean its gait's, leading with its seeded
       *  foot; one that does not glides along it, its legs and arms swinging in step
       *  with the ground it covers, a bounce and a lean (SEE: gaitAt), its own seeded
       *  stride, swing and starting foot */
      walk: (time: unknown, points: unknown, options: unknown = {}) => {
        const what = `${String(name)}.walk`;
        const start = toTime(time, what);
        const given = optionsOf(options, what);
        const path = pathOf(points, `${what}'s points`);
        const gait = gaitOf(given, what, given.seed ?? `${String(name)} walk`);
        const speed = given.speed ?? WALK_SPEED;
        if((given.speed !== undefined) && (given.until !== undefined)) fail(`${what} takes speed or until, not both`);
        if(!isFiniteNumber(speed) || (speed <= 0) || (speed > MAX_SPEED)) fail(`${what}'s speed is studs a second, more than 0 and up to ${MAX_SPEED}`);
        const end = (given.until !== undefined) ? toTime(given.until, what) : (start + (path.total / (speed as number)));
        if(end <= start) fail(`${what} ends after it starts`);
        if(end > MAX_LENGTH) fail(`${what} walks past ${MAX_LENGTH} s: walk faster or a shorter way`);
        const backward = given.backward ?? false;
        if(typeof backward !== 'boolean') fail(`${what}'s backward is true or false`);
        const line = callerLine();
        const unused = (['stride', 'bounce'] as const).filter(key => given[key] !== undefined);
        if(unused.length > 0) logs.push(`${what} (line ${line ?? '?'}): ${unused.join(' and ')} move only an actor that does not click onto studs; a figure's step is a stud, its rise its own`);
        entry.walks.push({ start, end, points: path.points, arms: gait.rightArm, lean: gait.lean, lead: (gait.phase < Math.PI) ? 'left' : 'right', ...((given.swing !== undefined) ? { swing: given.swing as number } : {}), ...(backward ? { backward: true as const } : {}), ...((line !== undefined) ? { line } : {}) });
        const timeAt = (along: number) => start + ((end - start) * (along / path.total));
        path.points.forEach((point, index) => {
          counted();
          entry.keys.push({ time: timeAt(path.cumulative[index]), values: { x: point.x, z: point.z }, ease: (index === 0) ? 'ease-in-out' : 'linear', line });
        });
        // each leg's heading, faced at the leg's start, over a corner's turn: the first
        // within half a turn of the yaw keyed before the walk, so it never spins round
        const keyedYaw = entry.keys.filter(key => ('yaw' in key.values) && (key.time <= start)).reduce<Key | undefined>((latest, key) => (!latest || (key.time >= latest.time)) ? key : latest, undefined)?.values.yaw;
        const faced = facingOf(entry.source) + (backward ? 180 : 0)/*a backward walk faces away from the way it goes*/;
        const first = path.headings[0] + faced;
        const facing = faced + ((keyedYaw === undefined) ? 0 : (nearestTurn(first, keyedYaw) - first));
        path.headings.forEach((heading, index) => {
          counted();
          if(index === 0) { entry.keys.push({ time: start, values: { yaw: heading + facing }, ease: 'ease-in-out', line }); return; }
          const at = timeAt(path.cumulative[index]);
          const turn = Math.min(TURN_SECONDS, 0.4 * (at - timeAt(path.cumulative[index - 1])), 0.4 * (timeAt(path.cumulative[index + 1]) - at));
          counted();
          entry.keys.push({ time: at - (turn / 2), values: { yaw: path.headings[index - 1] + facing }, ease: 'linear', line }, { time: at + (turn / 2), values: { yaw: heading + facing }, ease: 'ease-in-out', line });
        });
        entry.spans.push(() => ({ ...sampled(start, end, 'add', 'walk', line, (_, t) => gaitAt(gait, ((t - start) / (end - start)) * path.total, envelope(t, start, end, GAIT_EASE))), glide: true as const }));
        return handle;
      },
      /** standing alive from `from` to `to` (the film's end): breathing, its weight
       *  shifting, small turns and glances held a moment, livelier with `energy` and
       *  quicker and wider with `nervous` (each 0 to 1), seeded by `seed` */
      idle: (options: unknown = {}) => {
        const what = `${String(name)}.idle`;
        const given = optionsOf(options, what);
        const [energy, nervous] = [unitOf(given.energy ?? 0.4, `${what}'s energy`), unitOf(given.nervous ?? 0, `${what}'s nervous`)];
        const start = toTime(given.from ?? 0, what);
        const line = callerLine();
        entry.spans.push(() => {
          const end = (given.to === undefined) ? settings.length! : toTime(given.to, what);
          return sampled(start, end, 'add', 'idle', line, idleOf(energy, nervous, start, end, given.seed ?? `${String(name)} idle`));
        });
        return handle;
      },
      /** wears `face` from `time` for `for` seconds (1), over whatever face it wears
       *  then, then its own again: a reaction */
      react: (time: unknown, face: unknown, options: unknown = {}) => {
        const what = `${String(name)}.react`;
        const at = toTime(time, what);
        const lasting = optionsOf(options, what).for ?? 1;
        if((typeof face !== 'string') || (face.trim().length < 1) || (face.length > 40)) fail(`${what} names a figure's face, such as surprised or scared`);
        if(!isFiniteNumber(lasting) || (lasting <= 0)) fail(`${what}'s for is seconds, more than 0`);
        entry.reactions.push({ from: at, to: Math.min(MAX_LENGTH, at + (lasting as number)), face: face as string, line: callerLine() });
        return handle;
      },
      /** turns its head toward `target` (an actor, or a point) from `from` to `to` (the
       *  film's end), as far as `max` degrees (70) either way, while it stands within
       *  `within` studs (12) */
      look: (target: unknown, options: unknown = {}) => {
        const what = `${String(name)}.look`;
        const given = optionsOf(options, what);
        const aim = toTarget(target, `${what}'s target`) ?? fail(`${what} takes an actor or a point to look at`);
        const [within, max] = [given.within ?? 12, given.max ?? 70];
        if(!isFiniteNumber(within) || (within <= 0)) fail(`${what}'s within is studs, more than 0`);
        if(!isFiniteNumber(max) || (max <= 0) || (max > 180)) fail(`${what}'s max is degrees, more than 0 and up to 180`);
        entry.looks.push({ from: toTime(given.from ?? 0, what), ...((given.to !== undefined) ? { to: toTime(given.to, what) } : {}), target: aim, within: within as number, max: max as number, line: callerLine() });
        return handle;
      },
      /** its height follows the ground under it: what it is keyed is then plates above
       *  the surface it stands on, stepping up onto one at most `step` plates (3, a
       *  brick) above where it stands, down onto any below; before one higher its height
       *  holds (its keys still move it on) */
      ground: (options: unknown = {}) => {
        const step = optionsOf(options, `${String(name)}.ground`).step ?? 3;
        if(!isFiniteNumber(step) || (step < 0) || (step > MAX_STEP)) fail(`${String(name)}.ground's step is plates, 0 to ${MAX_STEP}`);
        entry.ground = { step: step as number };
        return handle;
      },
      /** stands as keyed alone: a figure never idles where nothing else moves it, and
       *  the scene's boil leaves it */
      still: () => { entry.still = true; return handle; },
      /** one of the studio's sounds from `time`, from where the actor stands in the
       *  picture (SEE: cue) */
      sound: (time: unknown, named: unknown, options?: unknown) => { cue(`${String(name)}.sound`, time, named, options, name as string); return handle; },
      /** rides another actor: stands at `offset` (studs east and north, plates up) in
       *  its frame, turned with it */
      ride: (parent: unknown, offset: unknown) => {
        if(typeof nameOf(parent) !== 'string') fail(`${String(name)}.ride takes the actor it rides`);
        entry.ride = { parent: nameOf(parent) as string, offset: toPoint(offset ?? { x: 0, z: 0, height: 0 }, `${String(name)}.ride's offset`) };
        return handle;
      },
    };
    return handle;
  };

  // .. Cameras ...................................................................
  /** a camera: keys of where it stands, what it looks at and its lens, cuts, and
   *  shakes */
  const cameraNamed = (name: string, label: string) => {
    const { keys: cameraKeys, spans: cameraSpans } = cameras.get(name) ?? cameras.set(name, { keys: [], spans: [] }).get(name)!;
    /** refuses a key on a plan, which looks down over the whole scene */
    const unplanned = () => { if(plans.has(name)) fail(`${label} is a plan: it takes no keys`); };
    /** a key's values at a time, eased into, starting a named shot when it cuts */
    const key = (verb: string, time: unknown, values: unknown, ease: Ease, shot?: string, transition?: Transition) => {
      unplanned();
      counted();
      const at = toTime(time, `${label}.${verb}`);
      const what = `${label}.${verb}(${at})`;
      if((typeof values !== 'object') || (values === null)) fail(`${what} gives { position, orbit, target, fov, roll, shift, dollyZoom, focus, aperture, avoid }`);
      const { position, orbit, target, fov, roll, shift, dollyZoom, focus, aperture, avoid, ...rest } = values as Record<string, unknown>;
      if(Object.keys(rest).length > 0) fail(`${what}: no value '${Object.keys(rest)[0]}' (position, orbit, target, fov, roll, shift, dollyZoom, focus, aperture, avoid)`);
      if((aperture !== undefined) && (!isFiniteNumber(aperture) || (aperture < 1) || (aperture > 32))) fail(`${what}.aperture is an f-number from 1 (the shallowest: only what it focuses on sharp) to 32 (nearly all sharp)`);
      if(isFiniteNumber(focus) && (focus <= 0)) fail(`${what}.focus as a number is studs ahead of the camera, more than 0`);
      const focused: Focus | undefined = isFiniteNumber(focus) ? { distance: focus } : toTarget(focus, `${what}.focus`);
      if((roll !== undefined) && !isFiniteNumber(roll)) fail(`${what}.roll is degrees: the camera turned clockwise about where it looks, as seen from behind it`);
      if((shift !== undefined) && (!isFiniteNumber(shift) || (shift < -1) || (shift > 1))) fail(`${what}.shift is a share of the picture's height from -1 to 1: the lens shifted up (down when negative), verticals kept upright`);
      if((dollyZoom !== undefined) && (dollyZoom !== true)) fail(`${what}.dollyZoom is true: the target kept its size on the screen while the lens eases into the key`);
      if(dollyZoom && (fov === undefined)) fail(`${what}.dollyZoom eases the lens into the key: give it a fov`);
      if((avoid !== undefined) && (avoid !== 'parts')) fail(`${what}.avoid is 'parts': the camera kept out of the set's parts`);
      if((position !== undefined) && (orbit !== undefined)) fail(`${what}: a position or an orbit, not both`);
      let place: CameraPlace | undefined;
      if(position !== undefined) place = { point: toPoint(position, `${what}.position`) };
      if(orbit !== undefined) {
        const { angle, distance, height, relativeTo } = (orbit ?? {}) as Record<string, unknown>;
        if(![angle, distance, height].every(isFiniteNumber) || ((distance as number) <= 0)) fail(`${what}.orbit is { angle, distance, height, relativeTo }: degrees (0 south of the target, 90 east), studs out and plates up`);
        if((relativeTo !== undefined) && (relativeTo !== 'world') && (relativeTo !== 'heading')) fail(`${what}.orbit.relativeTo is 'world' (its angle fixed to the world: 0 south of the target) or 'heading' (turning with the target actor: 0 behind it)`);
        place = { orbit: { angle: angle as number, distance: distance as number, height: height as number, ...((relativeTo === 'heading') ? { relativeTo: 'heading' as const } : {}) } };
      } /* else -- a position, or where the key before left it */
      const aim = toTarget(target, `${what}.target`);
      if((fov !== undefined) && (!isFiniteNumber(fov) || ((fov as number) < 5) || ((fov as number) > 120))) fail(`${what}.fov is degrees from 5 to 120`);
      if((avoid !== undefined) && !place) fail(`${what}.avoid keeps the camera a key places out of parts: give it a position or an orbit`);
      cameraKeys.push({
        time: at, ...(place ? { place } : {}), ...(aim ? { target: aim } : {}), ...((fov !== undefined) ? { fov: fov as number } : {}), ...((roll !== undefined) ? { roll: roll as number } : {}),
        ...((shift !== undefined) ? { shift: shift as number } : {}), ...(dollyZoom ? { dollyZoom: true as const } : {}), ...(focused ? { focus: focused } : {}), ...((aperture !== undefined) ? { aperture: aperture as number } : {}), ...((avoid === 'parts') ? { avoid: 'parts' as const } : {}), ease, ...((shot !== undefined) ? { name: shot } : {}), ...(transition ? { transition } : {}), line: callerLine(),
      });
    };
    const camera = {
      /** a key: where the camera stands (a point or an orbit round its target), what
       *  it looks at and its lens at `time`, each left to the key before when left out */
      at: (time: unknown, values: unknown, ease?: unknown) => { key('at', time, values, toEase(ease)); return camera; },
      /** a cut: the camera jumps to these values at `time`, held there from the key
       *  before; `name` names the shot it starts, which enters by `transition` (a
       *  dissolve, a wipe toward a side or an iris, over `seconds`: 0.5) over the shot it
       *  leaves, the camera's alone */
      cut: (time: unknown, values: unknown, name?: unknown, options: unknown = {}) => {
        if((name !== undefined) && (name !== null) && ((typeof name !== 'string') || (name.trim().length < 1) || (name.length > MAX_NAME))) fail(`${label}.cut(${String(time)}): a shot's name is 1 to ${MAX_NAME} characters`);
        const given = optionsOf(options, `${label}.cut(${String(time)})`);
        if((given.transition !== undefined) && (label !== 'camera')) fail(`${label}.cut(${String(time)}): a transition is the film's camera's; a view cuts`);
        const transition = (given.transition === undefined) ? undefined : transitionOf(given, `${label}.cut(${String(time)})`);
        key('cut', time, values, 'hold', (name ?? undefined) as string | undefined, transition);
        return camera;
      },
      /** a handheld shake: noise added to where it stands, `amount` studs at most */
      shake: (from: unknown, to: unknown, amount: unknown = 0.3, rate: unknown = 6) => {
        unplanned();
        const [start, end] = [toTime(from, `${label}.shake`), toTime(to, `${label}.shake`)];
        if(!isFiniteNumber(amount) || !isFiniteNumber(rate)) fail(`${label}.shake's amount and rate are numbers`);
        const line = callerLine();
        cameraSpans.push(() => sampled(start, end, 'add', 'shake', line, (_, t) => ({
          x: (amount as number) * noise(t * (rate as number) + 3.1), z: (amount as number) * noise(t * (rate as number) + 7.7), height: (amount as number) * 2.5 * noise(t * (rate as number) + 11.3),
        })));
        return camera;
      },
    };
    return camera;
  };
  /** the film's camera */
  const camera = cameraNamed('main', 'camera');
  /** another camera, by name: a second studio shows the scene through it. With
   *  `plan`, it looks straight down over the area given, or over all the film shows */
  const view = (name: unknown, options: Record<string, unknown> = {}) => {
    if((typeof name !== 'string') || !/^[a-z][a-z0-9-]{0,23}$/.test(name) || (name === 'main')) fail('a view is named in lower case letters, digits and dashes (not main)');
    const label = `view('${String(name)}')`;
    const { plan } = options;
    if(plan === true) plans.set(name as string, {});
    else if(plan !== undefined) {
      const { x, z, width, depth } = ((typeof plan === 'object') && (plan !== null)) ? plan as Record<string, unknown> : {};
      if(![x, z, width, depth].every(Number.isInteger) || ((width as number) < 1) || ((depth as number) < 1)) fail(`${label}'s plan is true or { x, z, width, depth }: whole studs, its south-west corner and size`);
      plans.set(name as string, { area: { x: x as number, z: z as number, width: width as number, depth: depth as number } });
    } /* else -- a camera of keys */
    return cameraNamed(name as string, label);
  };

  // .. Fade and Titles ...........................................................
  /** the fade: 0 shows the frame, 1 is its color (black unless a key names one), over
   *  the whole picture or closing in from the frame's edge as an iris */
  const fade = {
    at: (time: unknown, value: unknown, ease?: unknown, options: unknown = {}) => {
      counted();
      if(!isFiniteNumber(value) || (value < 0) || (value > 1)) fail('fade.at takes a value from 0 (the frame) to 1 (its color)');
      const given = optionsOf(options, 'fade.at');
      if((given.color !== undefined) && ((typeof given.color !== 'string') || !/^#[0-9a-fA-F]{6}$/.test(given.color))) fail('fade.at\'s color is #rrggbb (black when left out)');
      if((given.shape !== undefined) && (given.shape !== 'iris')) fail('fade.at\'s shape is iris (the whole picture when left out)');
      fadeKeys.push({ time: toTime(time, 'fade.at'), values: { fade: value as number }, ease: toEase(ease), ...((given.color !== undefined) ? { color: given.color as string } : {}), ...((given.shape !== undefined) ? { shape: 'iris' as const } : {}), line: callerLine() });
      return fade;
    },
    /** from the frame to its color over a span (black, or `color`) */
    out: (from: unknown, to: unknown, options: unknown = {}) => fade.at(from, 0, 'hold', options).at(to, 1, 'ease-in', options),
    /** from its color to the frame over a span */
    in: (from: unknown, to: unknown, options: unknown = {}) => fade.at(from, 1, 'hold', options).at(to, 0, 'ease-out', options),
    /** a flash: the whole frame `color` (white) at `time`, held `hold` seconds (a
     *  frame or two), then back to the frame over `out` seconds */
    flash: (time: unknown, options: unknown = {}) => {
      const given = optionsOf(options, 'fade.flash');
      const [at, hold, out] = [toTime(time, 'fade.flash'), given.hold ?? 0.04, given.out ?? 0.3];
      if(!isFiniteNumber(hold) || (hold < 0) || !isFiniteNumber(out) || (out <= 0)) fail('fade.flash\'s hold and out are seconds, out more than 0');
      const color = { color: given.color ?? '#ffffff' };
      return fade.at(at, 0, 'hold', color).at(at, 1, 'hold', color).at(at + (hold as number), 1, 'hold', color).at(at + (hold as number) + (out as number), 0, 'ease-out', color);
    },
    /** an iris closing on the frame over a span, to black (or `color`) */
    irisOut: (from: unknown, to: unknown, options: unknown = {}) => fade.out(from, to, { ...optionsOf(options, 'fade.irisOut'), shape: 'iris' }),
    /** an iris opening on the frame over a span */
    irisIn: (from: unknown, to: unknown, options: unknown = {}) => fade.in(from, to, { ...optionsOf(options, 'fade.irisIn'), shape: 'iris' }),
  };

  /** how fast the scene runs against the film from `time` (`rate`: 1 as it is, 0.25 a
   *  quarter as fast for slow motion, 2 twice), eased into from the key before */
  const speed = {
    at: (time: unknown, rate: unknown, ease?: unknown) => {
      counted();
      if(!isFiniteNumber(rate) || (rate < 0.05) || (rate > 8)) fail('speed.at takes a rate from 0.05 (a twentieth as fast) to 8 (eight times): 1 as the scene runs');
      speedKeys.push({ time: toTime(time, 'speed.at'), values: { speed: rate as number }, ease: toEase(ease), line: callerLine() });
      return speed;
    },
    /** the scene a `rate` as fast from `from` to `to`, at its own speed either side,
     *  easing in and out over `ease` seconds (0.2) */
    slow: (from: unknown, to: unknown, rate: unknown = 0.25, options: unknown = {}) => {
      const [start, end] = [toTime(from, 'speed.slow'), toTime(to, 'speed.slow')];
      const into = optionsOf(options, 'speed.slow').ease ?? 0.2;
      if(!isFiniteNumber(into) || (into < 0) || ((2 * (into as number)) > (end - start)) || ((start - (into as number)) < 0)) fail('speed.slow\'s ease is seconds, at most half its span and no earlier than the film\'s start');
      if(into === 0) return speed.at(start, 1, 'hold').at(start, rate, 'hold').at(end, 1, 'hold')/*at once, its own speed held before*/;
      return speed.at(start - (into as number), 1, 'hold').at(start, rate, 'ease-in-out').at(end, rate, 'linear').at(end + (into as number), 1, 'ease-in-out');
    },
  };

  /** the build's set standing from a time on: a cut to another set */
  const set = {
    at: (time: unknown, name: unknown) => {
      counted();
      if((typeof name !== 'string') || (name.trim().length < 1) || (name.length > MAX_NAME)) fail(`set.at names one of the build's sets: set.at(time, name), the name 1 to ${MAX_NAME} characters`);
      setKeys.push({ time: toTime(time, 'set.at'), set: (name as string).trim(), line: callerLine() });
      return set;
    },
  };

  // .. Sounds ....................................................................
  /** a sound from `time` (a Platform file by its `charmiq://file/<assetId>` URI, or a
   *  shipped sound by name): once, or over and over until `until`; at `volume` (0 to
   *  4, 1 as recorded); following `actor` */
  const cue = (what: string, time: unknown, name: unknown, options: unknown, actor?: string) => {
    counted();
    const at = toTime(time, what);
    const call = `${what}(${at})`;
    const file = (typeof name === 'string') && /^charmiq:\/\/file\/[^/?#\s]+$/.test(name);
    if(!file && !shipped.includes(name as string)) fail(`${call} plays a Platform file by its URI (charmiq://file/<assetId>)${(shipped.length > 0) ? ` or a sound Stop Motion ships: ${shipped.join(', ')}` : ''}`);
    const { volume = 1, until, fadeIn, fadeOut } = ((typeof options === 'object') && (options !== null)) ? options as Record<string, unknown> : {};
    if(!isFiniteNumber(volume) || (volume < 0) || (volume > MAX_VOLUME)) fail(`${call}'s volume is a number from 0 to ${MAX_VOLUME}`);
    const end = (until === undefined) ? undefined : toTime(until, what);
    if((end !== undefined) && (end <= at)) fail(`${call} plays until after it starts`);
    for(const [key, value] of [['fadeIn', fadeIn], ['fadeOut', fadeOut]] as const) if((value !== undefined) && (!isFiniteNumber(value) || (value < 0))) fail(`${call}'s ${key} is seconds, 0 or more`);
    soundCues.push({
      time: at, name: name as string, volume: volume as number, ...((end !== undefined) ? { until: end } : {}), ...((actor !== undefined) ? { actor } : {}),
      ...(fadeIn ? { fadeIn: fadeIn as number } : {}), ...(fadeOut ? { fadeOut: fadeOut as number } : {}), line: callerLine(),
    });
  };
  /** the studio's sounds at their times, following no actor */
  const sound = { at: (time: unknown, name: unknown, options?: unknown) => { cue('sound.at', time, name, options); return sound; } };

  /** words over the film: a full card or a caption along the bottom */
  const title = (from: unknown, to: unknown, text: unknown, options: Record<string, unknown> = {}) => {
    const [start, end] = [toTime(from, 'title'), toTime(to, 'title')];
    if(end <= start) fail('a title ends after it starts');
    const style = options.style ?? 'card';
    if((style !== 'card') && (style !== 'caption')) fail('a title\'s style is card or caption');
    titles.push({ from: start, to: end, text: String(text), style: style as Title['style'], line: callerLine() });
  };

  // .. Behaviors .................................................................
  /** a call's options: an object, its values to read */
  const optionsOf = (options: unknown, what: string): Record<string, unknown> => {
    if(options === undefined) return {};
    if((typeof options !== 'object') || (options === null) || Array.isArray(options)) fail(`${what}'s options are { ... }`);
    return options as Record<string, unknown>;
  };
  const unitOf = (value: unknown, what: string): number => {
    if(!isFiniteNumber(value) || (value < 0) || (value > 1)) fail(`${what} is 0 to 1`);
    return value as number;
  };
  /** a cut's transition: its `transition` (dissolve, a wipe toward a side, iris) over
   *  `seconds` (0.5) */
  const transitionOf = (given: Record<string, unknown>, what: string): Transition => {
    const shapes: ReadonlyArray<TransitionShape> = ['dissolve', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'iris'];
    if(!shapes.includes(given.transition as TransitionShape)) fail(`${what}'s transition is one of ${shapes.join(', ')}`);
    const seconds = given.seconds ?? 0.5;
    if(!isFiniteNumber(seconds) || (seconds <= 0) || (seconds > 10)) fail(`${what}'s transition takes seconds, more than 0 and up to 10`);
    return { shape: given.transition as TransitionShape, seconds: seconds as number };
  };
  /** a hand item: `{ part, color, grip? }`, or null for nothing */
  const handItem = (value: unknown, what: string): HandKey['item'] => {
    if(value === null) return null;
    const { part, color, grip } = ((typeof value === 'object') && (value !== null)) ? value as Record<string, unknown> : {};
    if((typeof part !== 'string') || (typeof color !== 'string') || ((grip !== undefined) && (typeof grip !== 'string'))) fail(`${what} is { part, color, grip? } (a hand item, as Brick Studio dresses a hand) or null for nothing`);
    return { part: part as string, color: color as string, ...((grip !== undefined) ? { grip: grip as string } : {}) };
  };

  /** points on the ground: each { x, z }, studs */
  const groundPoints = (value: unknown, what: string): ReadonlyArray<Readonly<{ x: number; z: number; }>> => {
    if(!Array.isArray(value) || (value.length > 200)) fail(`${what} are up to 200 points { x, z }`);
    return (value as unknown[]).map((point, index) => {
      const { x, z } = (point ?? {}) as Record<string, unknown>;
      if(!isFiniteNumber(x) || !isFiniteNumber(z)) fail(`${what}[${index}] is { x, z }: studs`);
      return { x: x as number, z: z as number };
    });
  };
  /** a path over the ground: its points (each { x, z }), how far along it each lies,
   *  its length, and each leg's heading (degrees clockwise from north, each turned the
   *  short way from the one before) */
  /** an angle turned by whole turns to lie within half a turn of another (degrees) */
  const nearestTurn = (angle: number, near: number): number => near + ((((angle - near) % 360) + 540) % 360) - 180;
  type Path = Readonly<{ points: ReadonlyArray<Readonly<{ x: number; z: number; }>>; cumulative: ReadonlyArray<number>; total: number; headings: ReadonlyArray<number>; }>;
  const pathOf = (value: unknown, what: string): Path => {
    if(!Array.isArray(value) || (value.length < 2) || (value.length > 200)) fail(`${what} are 2 to 200 points { x, z }`);
    const points = groundPoints(value, what);
    const cumulative = [0];
    const headings: number[] = [];
    for(let index=1; index<points.length; index++) {
      const [dx, dz] = [points[index].x - points[index - 1].x, points[index].z - points[index - 1].z];
      cumulative.push(cumulative[index - 1] + Math.hypot(dx, dz));
      const heading = Math.atan2(dx, dz) * (180 / Math.PI);
      const before = headings[headings.length - 1];
      headings.push((before === undefined) ? heading : nearestTurn(heading, before));
    }
    const total = cumulative[cumulative.length - 1];
    if(total <= 0) fail(`${what} cover no ground`);
    return { points, cumulative, total, headings };
  };
  /** where along a path a distance lies, and its heading there (rounded over ROUND
   *  studs about each corner) */
  const alongPath = (path: Path, along: number): Readonly<{ x: number; z: number; heading: number; }> => {
    const ROUND = 0.75;
    const at = Math.max(0, Math.min(path.total, along));
    let leg = 0;
    while((leg < (path.headings.length - 1)) && (path.cumulative[leg + 1] < at)) leg++;
    const [from, to] = [path.points[leg], path.points[leg + 1]];
    const length = path.cumulative[leg + 1] - path.cumulative[leg];
    const u = (length > 0) ? (at - path.cumulative[leg]) / length : 0;
    const beyond = along - at/*past either end: on along the end legs*/;
    const end = path.headings[(beyond < 0) ? 0 : path.headings.length - 1] * (Math.PI / 180);
    let heading = path.headings[leg];
    const [intoLeg, toEnd] = [at - path.cumulative[leg], path.cumulative[leg + 1] - at];
    const round = Math.min(ROUND, length / 2);
    if((leg > 0) && (intoLeg < round)) heading = path.headings[leg - 1] + ((path.headings[leg] - path.headings[leg - 1]) * (0.5 + (intoLeg / (2 * round))));
    else if((leg < (path.headings.length - 1)) && (toEnd < round)) heading = path.headings[leg] + ((path.headings[leg + 1] - path.headings[leg]) * (0.5 - (toEnd / (2 * round))));
    return { x: from.x + ((to.x - from.x) * u) + (beyond * Math.sin(end)), z: from.z + ((to.z - from.z) * u) + (beyond * Math.cos(end)), heading };
  };

  /** how a walker walks: its stride (studs a step), its legs' and arms' swing
   *  (degrees, each arm its own), its bounce (plates), its lean (degrees forward) and
   *  its starting foot (radians into its step) */
  type Gait = Readonly<{ stride: number; swing: number; rightArm: number; leftArm: number; twist: number; bounce: number; lean: number; phase: number; }>;
  const gaitOf = (given: Record<string, unknown>, what: string, seed: unknown, base: Partial<Record<'stride' | 'swing' | 'bounce' | 'lean' | 'arms', number>> = {}): Gait => {
    const next = random(seed);
    const read = (key: 'stride' | 'swing' | 'bounce' | 'lean' | 'arms', fallback: number, low: number, high: number) => {
      const value = given[key] ?? base[key] ?? fallback;
      if(!isFiniteNumber(value) || (value < low) || (value > high)) fail(`${what}'s ${key} is ${low} to ${high}`);
      return value as number;
    };
    const stride = read('stride', 1.4, 0.2, 6) * (0.9 + (0.2 * next())), swing = read('swing', 30, 0, 90) * (0.85 + (0.3 * next()));
    const arms = read('arms', swing * 0.8, 0, 120);
    return { stride, swing, rightArm: arms, leftArm: arms, twist: swing / 5, bounce: read('bounce', 0.35, 0, 4), lean: read('lean', 3, -30, 30), phase: next() * 2 * Math.PI };
  };
  /** a gait's values (added to the walker's own) `along` studs into a walk, at
   *  `amount` of its full swing: each leg swinging forward in turn, the arms against
   *  them, the shoulders turning against the hips, a bounce as the legs pass and a
   *  lean */
  const gaitAt = (gait: Gait, along: number, amount: number): Record<string, number> => {
    const swing = Math.sin(gait.phase + ((Math.PI * along) / gait.stride));
    return {
      'pose.leftLeg': amount * gait.swing * swing, 'pose.rightLeg': -amount * gait.swing * swing,
      'pose.rightArm': amount * gait.rightArm * swing, 'pose.leftArm': -amount * gait.leftArm * swing,
      'pose.twist': -amount * gait.twist * swing, 'pose.lean': amount * gait.lean, height: amount * gait.bounce * (1 - Math.abs(swing)),
    };
  };
  /** the yaw past a heading that faces an actor along it: a catalog part, dressed or a
   *  piece of the set, faces south at yaw 0 (its own front, as Brick Studio places it),
   *  so it faces a heading 180 past it; a component faces north at yaw 0, as a camera
   *  orbiting its heading takes it */
  const FIGURE_FACING = 180;
  const facingOf = (source: Readonly<Record<string, unknown>>): number => (source.component !== undefined) ? 0 : FIGURE_FACING;
  /** a scene's light: its key and fill scaled (0 to 3, 0 to 4), its exposure scaled
   *  (0.25 to 4) and its key's shadows softened (0 to 1), as Brick Studio's stage takes
   *  them (SEE: its StageLight) */
  const LIGHT_LIMITS: ReadonlyArray<readonly [string, number, number]> = [['key', 0, 3], ['fill', 0, 4], ['exposure', 0.25, 4], ['soft', 0, 1]];
  const lightOf = (value: unknown): Record<string, number> => {
    if((value === null) || (typeof value !== 'object')) fail('scene\'s light is { key?, fill?, exposure?, soft? }');
    const given = value as Record<string, unknown>;
    const unknown = Object.keys(given).find(name => !LIGHT_LIMITS.some(([known]) => known === name));
    if(unknown !== undefined) fail(`scene's light has no '${unknown}' (${LIGHT_LIMITS.map(([name]) => name).join(', ')})`);
    return Object.fromEntries(LIGHT_LIMITS.flatMap(([name, least, most]) => {
      const each = given[name];
      if(each === undefined) return [];
      if(!isFiniteNumber(each) || (each < least) || (each > most)) fail(`scene's light.${name} is ${least} to ${most}`);
      return [[name, each as number]];
    }));
  };
  /** 0 to 1 over a span: rising over its first `ease` seconds and falling over its last */
  const envelope = (t: number, start: number, end: number, ease: number): number => {
    const edge = Math.min(ease, (end - start) / 2);
    const up = Math.min(1, Math.max(0, (t - start) / edge)), down = Math.min(1, Math.max(0, (end - t) / edge));
    const smooth = (u: number) => u * u * (3 - (2 * u));
    return smooth(Math.min(up, down));
  };
  /** standing alive (SEE: idle): a function of time giving what it adds, `scale` of
   *  each movement */
  const idleOf = (energy: number, nervous: number, start: number, end: number, seed: unknown, scale = 1) => {
    const next = random(seed);
    const offsets = Array.from({ length: 6 }, () => Math.floor(next() * 1000));
    const breathRate = 0.22 + (0.12 * nervous) + (0.05 * next()), breathPhase = next() * 2 * Math.PI;
    // glances: each held a while, then turned to over a moment
    const glances: Array<{ time: number; angle: number; }> = [{ time: start, angle: 0 }];
    for(let t=start; t<end;) {
      t += (2.6 - (1.8 * nervous)) * (0.6 + (0.8 * next()));
      glances.push({ time: t, angle: ((next() * 2) - 1) * (18 + (45 * nervous) + (15 * energy)) });
    }
    const turnTime = 0.32 - (0.16 * nervous);
    const headAt = (t: number) => {
      let index = 0;
      while(((index + 1) < glances.length) && (glances[index + 1].time <= t)) index++;
      const [held, before] = [glances[index], glances[Math.max(0, index - 1)]];
      const u = Math.min(1, (t - held.time) / turnTime);
      return before.angle + ((held.angle - before.angle) * (u * u * (3 - (2 * u))));
    };
    return (_: number, t: number): Record<string, number> => {
      const breath = Math.sin((2 * Math.PI * breathRate * t) + breathPhase);
      const settle = envelope(t, start, end, 0.3);
      const amount = settle * scale;
      return {
        'pose.rightArm': amount * (1.5 + (2 * energy)) * breath, 'pose.leftArm': amount * (1.5 + (2 * energy)) * breath, 'pose.lean': amount * 0.8 * breath,
        yaw: amount * (3 + (6 * energy)) * noise((t * 0.12) + offsets[0]), 'pose.twist': amount * (2 + (4 * energy)) * noise((t * 0.18) + offsets[1]),
        x: amount * 0.06 * (0.5 + energy) * noise((t * 0.1) + offsets[2]), z: amount * 0.06 * (0.5 + energy) * noise((t * 0.1) + offsets[3]),
        roll: amount * 0.8 * (0.5 + energy) * noise((t * 0.1) + offsets[2])/*the weight shifting, which alone moves a figure clicked onto studs*/,
        'pose.head': amount * headAt(t),
        'pose.rightWrist': amount * 25 * nervous * noise((t * 2) + offsets[4]), 'pose.leftWrist': amount * 25 * nervous * noise((t * 2) + offsets[5]),
      };
    };
  };

  /** an actor's spans, and where none of them moves it (no walk, idle, path or crowd)
   *  for at least ALIVE_GAP seconds, idling subtly there should it be a figure: brick
   *  films keep every figure in slight motion. None for an actor kept `still`, or a
   *  component (which never poses) */
  const alive = (name: string, source: Readonly<Record<string, unknown>>, still: true | undefined, spans: ReadonlyArray<Span>): Span[] => {
    if(still || (source.component !== undefined)) return [...spans];
    const last = Math.max(0, Math.round(settings.length! * settings.fps) - 1);
    const moving = spans.filter(span => MOVING.has(span.label)).map(span => [span.from, span.to] as const).sort((a, b) => a[0] - b[0]);
    const gaps: Array<readonly [number, number]> = [];
    let from = 0;
    for(const [start, end] of moving) {
      if(start > from) gaps.push([from, start - 1]);
      from = Math.max(from, end + 1);
    }
    if(from <= last) gaps.push([from, last]);
    return [...spans, ...gaps.filter(([start, end]) => ((end - start) / settings.fps) >= ALIVE_GAP).map(([start, end], index) => {
      const [begin, finish] = [start / settings.fps, end / settings.fps];
      return { ...sampled(begin, finish, 'add', 'alive', undefined, idleOf(ALIVE_ENERGY, 0, begin, finish, `${name} alive ${index}`, ALIVE_SCALE)), figure: true as const };
    })];
  };
  /** the spans that move an actor themselves, so a figure idles elsewhere alone */
  const MOVING = new Set(['walk', 'idle', 'path', 'crowd', 'crowd walk']);
  /** the shortest stretch a figure idles over (seconds), how lively, and how much of
   *  an idle's every movement it makes: subtle */
  const ALIVE_GAP = 0.6;
  const ALIVE_ENERGY = 0.2;
  const ALIVE_SCALE = 0.5;

  // .. Crowds ....................................................................
  /** what a crowd's walkers can be: how fast and how they walk (studs a second, studs a
   *  step, degrees of swing), how lively they stand, and what they do besides: stop at
   *  the crowd's stops (`stops`), pause now and then looking up (`pause`, seconds apart),
   *  walk with a radio held up (`phone`), wait at their start until the crowd goes
   *  (`waits`), walk in pairs talking (`pair`) */
  type Personality = Readonly<{ speed: number; stride: number; swing: number; energy: number; nervous: number; bounce?: number; lean?: number; arms?: number; pause?: number; stops?: boolean; phone?: boolean; waits?: boolean; pair?: boolean; }>;
  const PERSONALITIES: Readonly<Record<string, Personality>> = {
    commuter:         { speed: 4.4, stride: 1.5, swing: 32, energy: 0.2, nervous: 0.3 },
    'window-shopper': { speed: 2,   stride: 1.2, swing: 22, energy: 0.5, nervous: 0, stops: true },
    tourist:          { speed: 2.2, stride: 1.2, swing: 24, energy: 0.7, nervous: 0.1, pause: 7 },
    phone:            { speed: 1.9, stride: 1.1, swing: 18, energy: 0.2, nervous: 0.2, lean: 8, phone: true },
    jogger:           { speed: 7,   stride: 2.4, swing: 50, energy: 0.8, nervous: 0.2, bounce: 0.9, lean: 10, arms: 55 },
    stroller:         { speed: 1.5, stride: 1.1, swing: 16, energy: 0.4, nervous: 0 },
    couple:           { speed: 2.2, stride: 1.2, swing: 22, energy: 0.5, nervous: 0, pair: true },
    waiter:           { speed: 3,   stride: 1.4, swing: 28, energy: 0.4, nervous: 0.5, waits: true },
  };
  const DEFAULT_MIX = ['commuter', 'window-shopper', 'tourist', 'phone', 'stroller', 'couple'];
  const WARDROBE = {
    colors: ['red', 'blue', 'white', 'black', 'green', 'yellow', 'azure', 'tan', 'orange', 'dark-gray', 'pink', 'medium-blue'],
    legColors: ['blue', 'black', 'dark-gray', 'tan', 'brown', 'light-gray', 'white'],
    faces: ['smile', 'grin', 'lopsided', 'frown', 'freckles', 'glasses', 'beard', 'moustache', 'sunglasses', 'stern'],
    hats: ['hair', 'pigtails', 'cap', 'hair', 'pigtails', 'cowboy-hat', 'top-hat'],
    hairColors: ['brown', 'black', 'tan', 'yellow', 'dark-gray', 'orange'],
  };
  /** a figure's body (studs): across, hands included, and along (SEE: Brick Studio's
   *  measured figure), and how close two walkers come, side by side and nose to tail */
  const SIDE_BY_SIDE = 2.8, NOSE_TO_TAIL = 2;
  type Walker = { entry: Entry; handle: unknown; personality: Personality; direction: 1 | -1; partner?: number; gait: Gait; seed: string; };
  type Crowd = Readonly<{ what: string; line?: number; path: Path; width: number; walkers: ReadonlyArray<Walker>; from: number; to?: number; stops: ReadonlyArray<Readonly<{ x: number; z: number; }>>; reacts: ReadonlyArray<Readonly<{ at: number; where: Readonly<{ x: number; z: number; }>; within: number; look: Target; lasting: number; }>>; go?: number; seed: unknown; }>;
  const crowds: Crowd[] = [];

  /** a crowd: `count` walkers named `<name>-1` on, dressed from a wardrobe, walking
   *  `along` a path both ways over its `width` (studs, 4), each by its personality,
   *  keeping right, slowing behind a slower walker, passing when the other side is
   *  clear and waiting when not, about a body apart on the path (SEE: walkCrowd); its
   *  walkers' handles, to key further */
  const crowd = (name: unknown, options: unknown) => {
    if((typeof name !== 'string') || !/^[a-z][a-z0-9-]{0,30}$/.test(name)) fail('a crowd is named in lower case letters, digits and dashes, up to 31: its walkers are <name>-1, <name>-2 and on');
    const what = `crowd('${String(name)}')`;
    const given = optionsOf(options, what);
    const path = pathOf(given.along, `${what}.along`);
    const count = given.count ?? 10;
    if(!Number.isInteger(count) || ((count as number) < 1) || ((count as number) > MAX_CROWD)) fail(`${what}'s count is 1 to ${MAX_CROWD} walkers`);
    if((actors.length + (count as number)) > MAX_ACTORS) fail(`${what}'s ${String(count)} walkers take the scene past ${MAX_ACTORS} actors`);
    const width = given.width ?? 4;
    if(!isFiniteNumber(width) || (width <= 0) || (width > 40)) fail(`${what}'s width is studs, more than 0 and up to 40`);
    const mix: unknown = given.personalities ?? DEFAULT_MIX;
    if(!Array.isArray(mix) || (mix.length < 1) || !mix.every(each => (typeof each === 'string') && Object.hasOwn(PERSONALITIES, each))) fail(`${what}'s personalities name some of ${Object.keys(PERSONALITIES).join(', ')}`);
    const kinds = mix as string[];
    const wardrobe = { ...WARDROBE, ...optionsOf(given.wardrobe, `${what}.wardrobe`) } as Record<string, unknown>;
    for(const [key, values] of Object.entries(wardrobe)) if(!Array.isArray(values) || (values.length < 1) || !values.every(value => typeof value === 'string')) fail(`${what}.wardrobe.${key} lists names`);
    const stops = groundPoints(given.stops ?? [], `${what}.stops`);
    const reacts = (Array.isArray(given.react) ? given.react : (given.react === undefined) ? [] : [given.react]).map((each, index) => {
      const event = optionsOf(each, `${what}.react[${index}]`);
      const { x, z } = (event.where ?? {}) as Record<string, unknown>;
      if(!isFiniteNumber(x) || !isFiniteNumber(z)) fail(`${what}.react[${index}].where is { x, z }: where it happens`);
      const within = event.within ?? 20, lasting = event.for ?? 3;
      if(!isFiniteNumber(within) || (within <= 0) || !isFiniteNumber(lasting) || (lasting <= 0)) fail(`${what}.react[${index}]'s within (studs) and for (seconds) are more than 0`);
      return { at: toTime(event.at, `${what}.react[${index}].at`), where: { x: x as number, z: z as number }, within: within as number, lasting: lasting as number, look: (event.look === undefined) ? { point: { x: x as number, z: z as number, height: 6 } } : (toTarget(event.look, `${what}.react[${index}].look`) as Target) };
    });
    const next = random(given.seed ?? name);
    const pick = (values: unknown) => (values as string[])[Math.floor(next() * (values as string[]).length)];
    const walkers: Walker[] = [];
    for(let index=0; index<(count as number); index++) {
      const kind = kinds[index % kinds.length];
      const personality = PERSONALITIES[kind];
      const partnered = personality.pair && (index > 0) && walkers[index - 1].personality.pair && (walkers[index - 1].partner === undefined) && ((index % 2) === 1);
      const hat = (next() < 0.6) ? pick(wardrobe.hats) : undefined;
      const source = {
        part: 'figure', color: pick(wardrobe.colors), legColor: pick(wardrobe.legColors), face: pick(wardrobe.faces),
        ...(hat ? { hat: { part: hat, color: pick(wardrobe.hairColors) } } : {}),
        ...(personality.phone ? { rightHand: { part: 'radio', color: 'black' } } : {}),
      };
      const handle = actor(`${String(name)}-${index + 1}`, source);
      const entry = actors[actors.length - 1];
      const seed = `${String(name)}-${index + 1}`;
      const gait = gaitOf({}, what, `${seed} walk`, { stride: personality.stride, swing: personality.swing, ...((personality.bounce !== undefined) ? { bounce: personality.bounce } : {}), ...((personality.lean !== undefined) ? { lean: personality.lean } : {}), ...((personality.arms !== undefined) ? { arms: personality.arms } : {}) });
      walkers.push({ entry, handle, personality, direction: partnered ? walkers[index - 1].direction : (((index % 2) === 0) ? 1 : -1), ...(partnered ? { partner: index - 1 } : {}), gait: personality.phone ? { ...gait, rightArm: 0 } : gait, seed });
      if(partnered) walkers[index - 1].partner = index;
      (handle as { idle: (options: unknown) => unknown; }).idle({ from: given.from ?? 0, ...((given.to !== undefined) ? { to: given.to } : {}), energy: personality.energy, nervous: personality.nervous, seed: `${seed} idle` });
    }
    crowds.push({ what, line: callerLine(), path, width: width as number, walkers, from: toTime(given.from ?? 0, what), ...((given.to !== undefined) ? { to: toTime(given.to, what) } : {}), stops, reacts, ...((given.go !== undefined) ? { go: toTime(given.go, `${what}.go`) } : {}), seed: given.seed ?? name });
    return walkers.map(walker => walker.handle);
  };

  /** a crowd walked, frame by frame from its first to its last: each walker's place on
   *  the path (how far along and how far to its right), its pace eased toward its
   *  personality's (drifting a little), held at a stop, a pause or an event, kept
   *  behind or past the walker ahead and right of one coming, and never nearer another
   *  on the path than a body; then each walker's position, heading and visibility set
   *  over the span, its gait added at its pace, its head turned to what it stops for
   *  and its partner */
  const walkCrowd = (crowd: Crowd) => {
    const { path, walkers, width } = crowd;
    const fps = settings.fps, dt = 1 / fps;
    const [first, last] = [frameOf(crowd.from), frameOf(crowd.to ?? settings.length!)];
    const next = random(`${String(crowd.seed)} walk`);
    const edge = Math.max(0, (width / 2) - 1);
    const rightOf = (direction: number) => direction * Math.min(edge, width / 4)/*its side of the path, keeping right*/;
    const states = walkers.map((walker, index) => {
      const ahead = (index + next()) / walkers.length;
      const partner = walker.partner;
      const pairSide = (partner === undefined) ? 0 : ((partner > index) ? 1 : -1);
      return {
        along: (walker.direction > 0) ? path.total * ahead : path.total * (1 - ahead), side: rightOf(walker.direction) + (pairSide * 1.2), lane: rightOf(walker.direction) + (pairSide * 1.2),
        pace: 0, covered: 0, swing: 0, heldUntil: walker.personality.waits ? (crowd.go ?? (crowd.from + 3 + (5 * next()))) : -1,
        nextPause: walker.personality.pause ? crowd.from + (walker.personality.pause * next()) : Infinity, lookingUp: false,
        visited: new Set<number>(), reacted: new Set<number>(), passing: false,
      };
    });
    if(walkers.some(walker => walker.partner !== undefined)) states.forEach((state, index) => { const partner = walkers[index].partner; if((partner !== undefined) && (partner < index)) state.along = states[partner].along; });
    const frames = walkers.map(() => [] as Array<Record<string, number>>);
    const gaits = walkers.map(() => [] as Array<Record<string, number>>), poses = walkers.map(() => [] as Array<Record<string, number>>);
    const paused = (t: number, index: number) => states[index].heldUntil > t;
    for(let frame=first; frame<=last; frame++) {
      const t = frame / fps;
      walkers.forEach((walker, index) => {
        const state = states[index], me = walker.personality;
        const place = alongPath(path, state.along);
        // what holds it: an event near it, a stop it reaches, a pause, its wait
        crowd.reacts.forEach((event, number) => {
          if(state.reacted.has(number) || (t < event.at)) return;
          state.reacted.add(number);
          const distance = Math.hypot(place.x - event.where.x, place.z - event.where.z);
          if(distance > event.within) return;
          const from = event.at + (distance * 0.04)/*the nearest first*/;
          state.heldUntil = Math.max(state.heldUntil, from + event.lasting);
          walker.entry.looks.push({ from, to: from + event.lasting, target: event.look, within: 400, max: 70, ...((crowd.line !== undefined) ? { line: crowd.line } : {}) });
          walker.entry.reactions.push({ from, to: from + Math.min(1.5, event.lasting), face: 'surprised', ...((crowd.line !== undefined) ? { line: crowd.line } : {}) });
        });
        if(me.stops) crowd.stops.forEach((stop, number) => {
          if(state.visited.has(number) || paused(t, index)) return;
          if(Math.hypot(place.x - stop.x, place.z - stop.z) > 3.5) return;
          state.visited.add(number);
          if(next() > 0.7) return/*it walks on past this one*/;
          const lasting = 2 + (2 * next());
          state.heldUntil = t + lasting;
          walker.entry.looks.push({ from: t, to: t + lasting, target: { point: { x: stop.x, z: stop.z, height: 8 } }, within: 400, max: 80, ...((crowd.line !== undefined) ? { line: crowd.line } : {}) });
        });
        if(t >= state.nextPause) { state.heldUntil = t + 1.5 + next(); state.nextPause = t + (me.pause! * (0.6 + (0.8 * next()))); state.lookingUp = true; }
        if(!paused(t, index)) state.lookingUp = false;
        // its pace: its own, drifting, held, or kept behind the walker ahead
        let wanted = paused(t, index) ? 0 : me.speed * (1 + (0.08 * noise((t * 0.3) + (index * 7.1))));
        let blocker: number | undefined, gap = Infinity;
        states.forEach((other, number) => {
          if((number === index) || (number === walker.partner)) return;
          const ahead = (other.along - state.along) * walker.direction;
          if((ahead <= 0) || (Math.abs(other.side - state.side) >= SIDE_BY_SIDE)) return;
          if((walkers[number].direction === walker.direction) && (ahead < gap)) { gap = ahead; blocker = number; }
          if((walkers[number].direction !== walker.direction) && (ahead < 5)) state.lane = Math.max(-edge, Math.min(edge, state.lane + (walker.direction * 0.8 * dt * fps * 0.05)))/*keeping right of one coming*/;
        });
        if((blocker !== undefined) && (gap < (NOSE_TO_TAIL + 0.4 + (wanted * 0.6)))) {
          const passing = state.side - (walker.direction * SIDE_BY_SIDE);
          const clear = (Math.abs(passing) <= (edge + 0.01)) && states.every((other, number) => (number === index) || (Math.abs(other.side - passing) >= SIDE_BY_SIDE) || ((((other.along - state.along) * walker.direction) < -1.5) || (((other.along - state.along) * walker.direction) > 6)));
          if(clear && (states[blocker].pace < (wanted - 0.3)) && !walker.partner) { state.lane = passing; state.passing = true; }
          else wanted = Math.min(wanted, (gap < NOSE_TO_TAIL) ? 0 : states[blocker].pace);
        } else if(state.passing && (blocker === undefined)) { state.passing = false; state.lane = rightOf(walker.direction) + ((walker.partner === undefined) ? 0 : ((walker.partner > index) ? 1.2 : -1.2)); }
        if(me.phone) state.lane = Math.max(-edge, Math.min(edge, state.lane + (0.02 * noise((t * 0.4) + index))))/*drifting*/;
        state.pace += Math.max(-6 * dt, Math.min(6 * dt, wanted - state.pace));
        state.side += Math.max(-1.5 * dt, Math.min(1.5 * dt, state.lane - state.side));
        state.along += state.pace * walker.direction * dt;
        state.covered += state.pace * dt;
        state.swing += Math.max(-4 * dt, Math.min(4 * dt, (state.pace / me.speed) - state.swing));
      });
      // no nearer another on the path than a body: the one behind held back
      states.forEach((state, index) => states.forEach((other, number) => {
        if((number <= index) || (number === walkers[index].partner)) return;
        const apart = other.along - state.along;
        if((Math.abs(apart) >= NOSE_TO_TAIL) || (Math.abs(other.side - state.side) >= SIDE_BY_SIDE)) return;
        if(walkers[index].direction !== walkers[number].direction) { const push = (SIDE_BY_SIDE - Math.abs(other.side - state.side)) / 2; state.side += walkers[index].direction * push; other.side += walkers[number].direction * push; return; }
        const behind = ((apart * walkers[index].direction) > 0) ? state : other, front = (behind === state) ? other : state;
        behind.along = front.along - ((behind === state ? walkers[index].direction : walkers[number].direction) * NOSE_TO_TAIL);
      }));
      walkers.forEach((walker, index) => {
        const state = states[index];
        let visible = 1;
        if((state.along > (path.total + 0.5)) || (state.along < -0.5)) { state.along = (walker.direction > 0) ? -0.5 : path.total + 0.5; state.visited.clear(); visible = 0/*round to the start again, unseen*/; }
        const place = alongPath(path, state.along);
        const heading = place.heading * (Math.PI / 180);
        frames[index].push({ x: place.x + (Math.cos(heading) * state.side), z: place.z - (Math.sin(heading) * state.side), yaw: place.heading + ((walker.direction > 0) ? 0 : 180) + FIGURE_FACING/*a walker is a figure*/, visible });
        // its gait (the glide a walker clicking onto studs steps in place of), and what it
        // does besides: looking up, a radio held up
        const { 'pose.lean': lean, ...gait } = gaitAt(walker.gait, state.covered, Math.max(0, Math.min(1, state.swing)));
        gaits[index].push(state.lookingUp ? gait : { ...gait, 'pose.lean': lean });
        poses[index].push({ ...(state.lookingUp ? { 'pose.lean': -10 } : {}), ...(walker.personality.phone ? { 'pose.rightArm': 75 } : {}) });
      });
    }
    walkers.forEach((walker, index) => {
      const channels = ['x', 'z', 'yaw', 'visible'];
      walker.entry.spans.push(() => ({ from: first, to: last, mode: 'set', channels, samples: frames[index], label: 'crowd', ...((crowd.line !== undefined) ? { line: crowd.line } : {}) }));
      walker.entry.spans.push(() => ({ from: first, to: last, mode: 'add', channels: [...new Set(gaits[index].flatMap(sample => Object.keys(sample)))], samples: gaits[index], label: 'crowd walk', glide: true as const, ...((crowd.line !== undefined) ? { line: crowd.line } : {}) }));
      walker.entry.spans.push(() => ({ from: first, to: last, mode: 'add', channels: [...new Set(poses[index].flatMap(sample => Object.keys(sample)))], samples: poses[index], label: 'crowd pose', ...((crowd.line !== undefined) ? { line: crowd.line } : {}) }));
      if(walker.partner !== undefined) walker.entry.looks.push({ from: crowd.from, ...((crowd.to !== undefined) ? { to: crowd.to } : {}), target: { actor: walkers[walker.partner].entry.name, height: 10 }, within: 6, max: 35, ...((crowd.line !== undefined) ? { line: crowd.line } : {}) });
    });
  };

  // .. Sampling ..................................................................
  /** the frame at a time, as frames count from 0 */
  const frameOf = (time: number) => Math.round(time * settings.fps);

  /** a function of time sampled at every frame of a span */
  const sampled = (start: number, end: number, mode: 'set' | 'add', label: string, line: number | undefined, at: (u: number, t: number) => Record<string, number>): Span => {
    const [first, last] = [frameOf(start), frameOf(end)];
    const samples: Array<Record<string, number>> = [];
    for(let frame=first; frame<=last; frame++) {
      const t = frame / settings.fps;
      try { samples.push(at((last > first) ? ((frame - first) / (last - first)) : 1, t)); }
      catch(error) { fail((error as Error).message, (error as { sceneLine?: number; }).sceneLine ?? stackLine(error) ?? line); }
    }
    const channels = [...new Set(samples.flatMap(sample => Object.keys(sample)))];
    return { from: first, to: last, mode, channels, samples, label, line };
  };

  /** a seed's number: any value, by its text (FNV-1a) */
  const seedOf = (seed: unknown): number => {
    let hash = 2166136261;
    for(const char of String(seed)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  };
  /** a seeded random generator: from 0 up to 1, the same numbers for the same seed on
   *  every run (mulberry32) */
  const random = (seed: unknown = 0) => {
    let state = seedOf(seed);
    return (): number => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** smooth noise from -1 to 1: cosine-blended random values at whole steps, a seed
   *  choosing its own run of them */
  const noise = (time: number, seed?: unknown): number => {
    const random = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return ((s - Math.floor(s)) * 2) - 1; };
    const t = time + ((seed === undefined) ? 0 : (seedOf(seed) % 100_003));
    const whole = Math.floor(t), fraction = t - whole;
    const blend = (1 - Math.cos(fraction * Math.PI)) / 2;
    return (random(whole) * (1 - blend)) + (random(whole + 1) * blend);
  };

  // .. Run .......................................................................
  // the scene's code, given the API alone
  const api: Record<string, unknown> = {
    scene, actor, crowd, camera, view, set, fade, speed, title, sound, noise, random,
    /** the language's Math, its random seeded by the scene: the same film every run */
    Math: Object.assign(Object.create(Math) as Math, { random: random('Math.random') }),
    /** a jump's height (plates) at time t from leaving at `up` plates a second, under
     *  `gravity` plates a second squared */
    arc: (t: number, up: number, gravity = 120) => (up * t) - (gravity * t * t / 2),
    lerp: (a: number, b: number, u: number) => a + ((b - a) * u),
    console: { log: (...values: unknown[]) => { logs.push(values.map(value => (typeof value === 'string') ? value : JSON.stringify(value)).join(' ')); }, warn: (...values: unknown[]) => { logs.push(values.map(String).join(' ')); } },
  };
  // the scene's code in a block of its own, so a name it declares (its own crowd, its
  // own random) stands over the API's of that name rather than refusing the scene;
  // its strict mode and the block's brace share the line before its first
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(...Object.keys(api), `"use strict"; {\n${code}\n}`);
  try { run(...Object.values(api)); }
  catch(error) {
    throw Object.assign(new Error((error as Error)?.message ?? String(error)), { sceneLine: (error as { sceneLine?: number; } | null)?.sceneLine ?? stackLine(error) });
  }

  // .. Settle ....................................................................
  // every ride and every camera's actor named, the length known, then each span
  // sampled and each key in time order
  for(const each of actors) if(each.ride && !actors.some(other => other.name === each.ride!.parent)) fail(`${each.name} rides '${each.ride.parent}', which is no actor`, each.line);
  for(const each of actors) if(each.ride && each.ground) fail(`${each.name} rides ${each.ride.parent}, so it stands where it rides: ${each.ride.parent} follows the ground, not ${each.name}`, each.line);
  for(const each of actors) for(const look of each.looks) if(('actor' in look.target) && !actors.some(other => other.name === (look.target as { actor: string; }).actor)) fail(`${each.name}.look looks at '${look.target.actor}', which is no actor`, look.line);
  for(const [name, { keys }] of cameras) for(const key of keys) if(key.target && ('actor' in key.target) && !actors.some(other => other.name === (key.target as { actor: string; }).actor)) fail(`${(name === 'main') ? 'camera' : `view('${name}')`}.at(${key.time}) looks at '${(key.target as { actor: string; }).actor}', which is no actor`, key.line);
  for(const [name, { keys }] of cameras) for(const key of keys) if(key.focus && ('actor' in key.focus) && !actors.some(other => other.name === (key.focus as { actor: string; }).actor)) fail(`${(name === 'main') ? 'camera' : `view('${name}')`}.at(${key.time}) focuses on '${(key.focus as { actor: string; }).actor}', which is no actor`, key.line);
  const times = [...actors.flatMap(each => [...each.keys, ...each.faces, ...each.hands].map(key => key.time)), ...actors.flatMap(each => each.reactions.map(reaction => reaction.to)), ...[...cameras.values()].flatMap(each => each.keys.map(key => key.time)), ...fadeKeys.map(key => key.time), ...speedKeys.map(key => key.time), ...setKeys.map(key => key.time), ...titles.map(each => each.to), ...soundCues.map(each => each.until ?? each.time)];
  settings.length ??= Math.max(1, ...times);
  for(const each of crowds) walkCrowd(each);
  /** keys in time order, a held key after any other at its time, so a move may end
   *  exactly where a cut jumps */
  const byTime = <T extends { time: number; ease?: Ease; }>(keys: T[]) => [...keys].sort((a, b) => (a.time - b.time) || (Number(a.ease === 'hold') - Number(b.ease === 'hold')));
  return {
    title: settings.title, fps: settings.fps, length: settings.length, frames: Math.max(1, Math.round(settings.length * settings.fps)), width: settings.width, height: settings.height, ...(settings.floor ? { floor: settings.floor } : {}), ...(settings.light ? { light: settings.light } : {}),
    ...((settings.boil > 0) ? { boil: settings.boil } : {}),
    actors: actors.map(({ name, source, ride, keys, walks, faces, hands, reactions, looks, ground, still, spans, line }) => ({
      name, source, ...(ride ? { ride } : {}), keys: byTime(keys), ...((faces.length > 0) ? { faces: byTime(faces) } : {}), ...((hands.length > 0) ? { hands: byTime(hands) } : {}),
      ...((reactions.length > 0) ? { reactions } : {}), ...((looks.length > 0) ? { looks: looks.map(look => ({ ...look, to: look.to ?? settings.length! })) } : {}), ...(ground ? { ground } : {}),
      ...(still ? { still } : {}), spans: alive(name, source, still, spans.map(span => span())), ...((walks.length > 0) ? { walks: [...walks].sort((a, b) => a.start - b.start) } : {}), ...((line !== undefined) ? { line } : {}),
    })),
    camera: { keys: byTime(cameras.get('main')!.keys), spans: cameras.get('main')!.spans.map(span => span()) },
    views: [...cameras].filter(([name]) => name !== 'main').map(([name, { keys, spans }]) => ({ name, keys: byTime(keys), spans: spans.map(span => span()), ...(plans.has(name) ? { plan: plans.get(name)! } : {}) })),
    fade: byTime(fadeKeys), titles, ...((setKeys.length > 0) ? { sets: byTime(setKeys) } : {}), ...((soundCues.length > 0) ? { sounds: byTime(soundCues) } : {}), ...((speedKeys.length > 0) ? { speed: byTime(speedKeys) } : {}), logs,
  };
};
