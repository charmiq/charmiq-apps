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
/** the build's set standing from `time` on, until the next: a cut, never eased (SEE:
 *  Brick Studio's sets) */
export type SetKey = Readonly<{ time: number; set: string; line?: number; }>;
/** one of the studio's sounds played from `time`: once, or over and over `until` a
 *  time; at a volume (1 as recorded); from where an actor stands in the picture
 *  when it follows one (SEE: sound.ts) */
export type SoundCue = Readonly<{ time: number; name: string; volume: number; until?: number; actor?: string; line?: number; }>;

/** a function of time over a span, sampled at each frame from `from` up to `to`
 *  (frame numbers, inclusive): `set` replaces its channels there, `add` adds to them */
export type Span = Readonly<{ from: number; to: number; mode: 'set' | 'add'; channels: ReadonlyArray<string>; samples: ReadonlyArray<Readonly<Record<string, number>>>; label: string; line?: number; }>;

/** where the camera looks: a point, or an actor's position raised by `height` plates */
export type Target = Readonly<{ point: Point; } | { actor: string; height: number; }>;
/** where the camera stands: a point, or around its target at `angle` degrees,
 *  `distance` studs out and `height` plates above it. The angle is fixed to the world
 *  (0 south of the target, 90 east) or, `relativeTo: 'heading'`, turns with the target
 *  actor's heading (0 behind it, 90 its right, 180 before it) */
export type CameraPlace = Readonly<{ point: Point; } | { orbit: Readonly<{ angle: number; distance: number; height: number; relativeTo?: 'heading'; }>; }>;
/** a camera's key; a cut is a held key, and `name` names the shot it starts.
 *  `avoid: 'parts'` keeps the camera out of the set's parts from it to the next key
 *  placing it (SEE: studios.ts avoided) */
export type CameraKey = Readonly<{ time: number; place?: CameraPlace; target?: Target; fov?: number; avoid?: 'parts'; ease: Ease; name?: string; line?: number; }>;

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
  spans: ReadonlyArray<Span>;
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
  actors: ReadonlyArray<RecordedActor>;
  camera: RecordedCamera;
  /** more cameras, by name: each a second studio's view of the scene. A plan looks
   *  straight down over `area`, or over everything the film shows when it names none */
  views: ReadonlyArray<RecordedCamera & Readonly<{ name: string; plan?: Readonly<{ area?: Area; }>; }>>;
  fade: ReadonlyArray<Key>;
  titles: ReadonlyArray<Title>;
  /** which of the build's sets stands from each key on, in time order, when the scene
   *  keys any (its first set stands before the first) */
  sets?: ReadonlyArray<SetKey>;
  /** the sounds it plays, in time order, when it plays any */
  sounds?: ReadonlyArray<SoundCue>;
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
  const LIMBS = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
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
  const settings = { title: 'Untitled film', fps: 24, length: undefined as number | undefined, width: 1280, height: 720, floor: undefined as { x: number; z: number; width: number; depth: number; } | undefined };
  const actors: Array<{ name: string; source: Record<string, unknown>; ride?: { parent: string; offset: Point; }; keys: Key[]; faces: FaceKey[]; spans: Array<() => Span>; line?: number; }> = [];
  const cameras = new Map<string, { keys: CameraKey[]; spans: Array<() => Span>; }>();
  /** the views that are plans, each with the area it names, if any */
  const plans = new Map<string, { area?: Area; }>();
  const fadeKeys: Key[] = [];
  const setKeys: SetKey[] = [];
  const soundCues: SoundCue[] = [];
  const titles: Title[] = [];
  const logs: string[] = [];
  let keyCount = 0;
  /** counts a key, refusing a scene past MAX_KEYS */
  const counted = () => { if(++keyCount > MAX_KEYS) fail(`a scene holds at most ${MAX_KEYS} keys`); };

  // .. Scene .....................................................................
  /** the film's settings: its title, fps, length, export size and floor */
  const scene = (options: Record<string, unknown> = {}) => {
    const { title, fps, length, width, height, floor } = options;
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
    const named = ('key' in keyed) ? 'x, z, height, yaw, pitch, roll, visible, pose, face' : 'x, z, height, yaw, pitch, roll, visible, pose';
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
      if(('name' in keyed) && (name === 'face')) fail(`${what}: a path gives no face; a face is worn from a key: ${keyed.name}.at(time, { face })`);
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
    const entry: (typeof actors)[number] = { name: name as string, source: { ...(source as Record<string, unknown>) }, keys: [], faces: [], spans: [], line: callerLine() };
    actors.push(entry);
    const handle = {
      name,
      /** a key: the values the actor has at `time`, eased into, and its face from
       *  then on, worn at once */
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
        const channels = channelsOf(given ? Object.fromEntries(Object.entries(given).filter(([key]) => key !== 'face')) : values, what, { key: true });
        if((face === undefined) || (Object.keys(channels).length > 0)) entry.keys.push({ time: at, values: channels, ease: toEase(ease), line: callerLine() });
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
    const key = (verb: string, time: unknown, values: unknown, ease: Ease, shot?: string) => {
      unplanned();
      counted();
      const at = toTime(time, `${label}.${verb}`);
      const what = `${label}.${verb}(${at})`;
      if((typeof values !== 'object') || (values === null)) fail(`${what} gives { position, orbit, target, fov, avoid }`);
      const { position, orbit, target, fov, avoid, ...rest } = values as Record<string, unknown>;
      if(Object.keys(rest).length > 0) fail(`${what}: no value '${Object.keys(rest)[0]}' (position, orbit, target, fov, avoid)`);
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
      cameraKeys.push({ time: at, ...(place ? { place } : {}), ...(aim ? { target: aim } : {}), ...((fov !== undefined) ? { fov: fov as number } : {}), ...((avoid === 'parts') ? { avoid: 'parts' as const } : {}), ease, ...((shot !== undefined) ? { name: shot } : {}), line: callerLine() });
    };
    const camera = {
      /** a key: where the camera stands (a point or an orbit round its target), what
       *  it looks at and its lens at `time`, each left to the key before when left out */
      at: (time: unknown, values: unknown, ease?: unknown) => { key('at', time, values, toEase(ease)); return camera; },
      /** a cut: the camera jumps to these values at `time`, held there from the key
       *  before; `name` names the shot it starts */
      cut: (time: unknown, values: unknown, name?: unknown) => {
        if((name !== undefined) && ((typeof name !== 'string') || (name.trim().length < 1) || (name.length > MAX_NAME))) fail(`${label}.cut(${String(time)}): a shot's name is 1 to ${MAX_NAME} characters`);
        key('cut', time, values, 'hold', name as string | undefined);
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
  /** the fade to black: 0 shows the frame, 1 is black */
  const fade = {
    at: (time: unknown, value: unknown, ease?: unknown) => {
      counted();
      if(!isFiniteNumber(value) || (value < 0) || (value > 1)) fail('fade.at takes a value from 0 (the frame) to 1 (black)');
      fadeKeys.push({ time: toTime(time, 'fade.at'), values: { fade: value as number }, ease: toEase(ease), line: callerLine() });
      return fade;
    },
    /** from the frame to black over a span */
    out: (from: unknown, to: unknown) => fade.at(from, 0, 'hold').at(to, 1, 'ease-in'),
    /** from black to the frame over a span */
    in: (from: unknown, to: unknown) => fade.at(from, 1, 'hold').at(to, 0, 'ease-out'),
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
    const { volume = 1, until } = ((typeof options === 'object') && (options !== null)) ? options as Record<string, unknown> : {};
    if(!isFiniteNumber(volume) || (volume < 0) || (volume > MAX_VOLUME)) fail(`${call}'s volume is a number from 0 to ${MAX_VOLUME}`);
    const end = (until === undefined) ? undefined : toTime(until, what);
    if((end !== undefined) && (end <= at)) fail(`${call} plays until after it starts`);
    soundCues.push({ time: at, name: name as string, volume: volume as number, ...((end !== undefined) ? { until: end } : {}), ...((actor !== undefined) ? { actor } : {}), line: callerLine() });
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

  /** smooth noise from -1 to 1: cosine-blended random values at whole steps */
  const noise = (t: number): number => {
    const random = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return ((s - Math.floor(s)) * 2) - 1; };
    const whole = Math.floor(t), fraction = t - whole;
    const blend = (1 - Math.cos(fraction * Math.PI)) / 2;
    return (random(whole) * (1 - blend)) + (random(whole + 1) * blend);
  };

  // .. Run .......................................................................
  // the scene's code, given the API alone
  const api: Record<string, unknown> = {
    scene, actor, camera, view, set, fade, title, sound, noise,
    /** a jump's height (plates) at time t from leaving at `up` plates a second, under
     *  `gravity` plates a second squared */
    arc: (t: number, up: number, gravity = 120) => (up * t) - (gravity * t * t / 2),
    lerp: (a: number, b: number, u: number) => a + ((b - a) * u),
    console: { log: (...values: unknown[]) => { logs.push(values.map(value => (typeof value === 'string') ? value : JSON.stringify(value)).join(' ')); }, warn: (...values: unknown[]) => { logs.push(values.map(String).join(' ')); } },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(...Object.keys(api), `"use strict";\n${code}\n`);
  try { run(...Object.values(api)); }
  catch(error) {
    throw Object.assign(new Error((error as Error)?.message ?? String(error)), { sceneLine: (error as { sceneLine?: number; } | null)?.sceneLine ?? stackLine(error) });
  }

  // .. Settle ....................................................................
  // every ride and every camera's actor named, the length known, then each span
  // sampled and each key in time order
  for(const each of actors) if(each.ride && !actors.some(other => other.name === each.ride!.parent)) fail(`${each.name} rides '${each.ride.parent}', which is no actor`, each.line);
  for(const [name, { keys }] of cameras) for(const key of keys) if(key.target && ('actor' in key.target) && !actors.some(other => other.name === (key.target as { actor: string; }).actor)) fail(`${(name === 'main') ? 'camera' : `view('${name}')`}.at(${key.time}) looks at '${(key.target as { actor: string; }).actor}', which is no actor`, key.line);
  const times = [...actors.flatMap(each => [...each.keys, ...each.faces].map(key => key.time)), ...[...cameras.values()].flatMap(each => each.keys.map(key => key.time)), ...fadeKeys.map(key => key.time), ...setKeys.map(key => key.time), ...titles.map(each => each.to), ...soundCues.map(each => each.until ?? each.time)];
  settings.length ??= Math.max(1, ...times);
  /** keys in time order, a held key after any other at its time, so a move may end
   *  exactly where a cut jumps */
  const byTime = <T extends { time: number; ease?: Ease; }>(keys: T[]) => [...keys].sort((a, b) => (a.time - b.time) || (Number(a.ease === 'hold') - Number(b.ease === 'hold')));
  return {
    title: settings.title, fps: settings.fps, length: settings.length, frames: Math.max(1, Math.round(settings.length * settings.fps)), width: settings.width, height: settings.height, ...(settings.floor ? { floor: settings.floor } : {}),
    actors: actors.map(({ name, source, ride, keys, faces, spans, line }) => ({ name, source, ...(ride ? { ride } : {}), keys: byTime(keys), ...((faces.length > 0) ? { faces: byTime(faces) } : {}), spans: spans.map(span => span()), ...((line !== undefined) ? { line } : {}) })),
    camera: { keys: byTime(cameras.get('main')!.keys), spans: cameras.get('main')!.spans.map(span => span()) },
    views: [...cameras].filter(([name]) => name !== 'main').map(([name, { keys, spans }]) => ({ name, keys: byTime(keys), spans: spans.map(span => span()), ...(plans.has(name) ? { plan: plans.get(name)! } : {}) })),
    fade: byTime(fadeKeys), titles, ...((setKeys.length > 0) ? { sets: byTime(setKeys) } : {}), ...((soundCues.length > 0) ? { sounds: byTime(soundCues) } : {}), logs,
  };
};
