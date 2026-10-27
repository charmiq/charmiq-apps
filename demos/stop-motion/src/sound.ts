import { isPlatformFile, SOUND_FILES } from '../../brick-shared/drive';
import { listShipped, shippedLister, shippedOf, type ResourceLister } from '../../brick-shared/shipped';
import { filmLengthOf, filmTimeOf, soundCuesOf, type Film, type StageCamera } from './film';
import type { Point, SoundCue } from './recorder';
import { inView } from './screen';

// the film's sound: each sound a film plays read and decoded once, and the mix its
// cues make. a sound is any audio file in the Platform, named by its
// `charmiq://file/<assetId>` URI, or one of the few Stop Motion ships for its example
// films (CC0 Ogg Vorbis files in ../sounds, each a declared resource), named. a cue
// plays its sound from its time, once or over and over until a time, at its volume;
// following an actor, it pans to the side of the picture the actor stands on and
// quiets as the actor stands far off or behind the camera, frame by frame. the film's
// fade fades its sound with its picture. one mix serves playing (an AudioContext) and
// exporting (an OfflineAudioContext), so what plays is what exports. every sound
// following one actor shares that actor's pan and gain: one bus per followed actor,
// its curves over the film's frames each one value curve (frames are evenly spaced),
// so a mix's automation grows with the actors followed, never with the sounds or the
// film's length
// ********************************************************************************
// == Constants ===================================================================
/** the folder manifest.json `bundle.resources` declares for the sounds Stop Motion
 *  ships for its example films: whatever audio files it holds are the shipped sounds */
// SEE: ../sounds/README.md
export const SHIPPED_FOLDER = 'sound/';

/** how near (studs) an actor sounds at full volume; farther, it quiets as the
 *  distance grows */
const NEAR = 20;
/** how loud an actor behind the camera sounds, of what it would in front */
const BEHIND = 0.5;
/** a time past a frame's that rounding alone puts there (seconds) */
const TIME_EPSILON = 1e-9;

/** the window (seconds) a sound's loudness is heard over, where it sounds and where it
 *  pauses */
const HEARD_WINDOW = 0.02;
/** how far under its loudest window (dB) a window of a sound is a pause: a voice's
 *  quietest sounds (a whisper, a breathed consonant) stand within it, a recording's
 *  hum under it */
const QUIET_UNDER = 40;

// == Types =======================================================================
/** values at each frame from `first` on (the frame index), a frame apart */
type FrameCurve = Readonly<{ first: number; values: Float32Array; }>;
/** the decoded sounds a mix plays, by name */
export type SoundBuffers = ReadonlyMap<string, AudioBuffer>;

// == Names =======================================================================
/** the shipped sounds a listing of {@link SHIPPED_FOLDER} names: each audio file at
 *  its top by the name a scene plays it by (its file's name without its extension,
 *  `radio` for `sound/radio.ogg`) and the resource it is read as; the first of two
 *  that share a name */
export const shippedSoundsOf = (names: ReadonlyArray<string>): ReadonlyMap<string, string> => shippedOf(SHIPPED_FOLDER, SOUND_FILES, names);

/** the shipped sounds as `list` gives them, listed when first asked and kept once a
 *  listing succeeds (SEE: brick-shared/shipped.ts shippedLister) */
export const shippedSoundsLister = shippedLister;

/** the shipped sounds, from every page of {@link SHIPPED_FOLDER}'s listing */
export const listShippedSounds = (resources: ResourceLister): Promise<ReadonlyMap<string, string>> => listShipped(resources, SHIPPED_FOLDER, SOUND_FILES);


/** the names of the sounds a film's cues play */
export const soundsOf = (film: Film): ReadonlySet<string> => new Set(soundCuesOf(film).map(cue => cue.name));

/** the sounds a film plays that `buffers` lacks (their files could not be read), by
 *  name: what a film plays and exports without */
export const missingSounds = (film: Film, buffers: SoundBuffers | undefined): ReadonlyArray<string> =>
  [...soundsOf(film)].filter(name => !buffers?.has(name));

// == Placement ===================================================================
/** where a point sounds from through a camera: `pan` from -1 (the picture's left
 *  edge and beyond) to 1 (its right), and `gain`, 1 within NEAR studs and quieter
 *  past it, halved behind the camera. `aspect` is the picture's width over its
 *  height (the camera's lens is its height's angle); its right is the screen's (SEE:
 *  screen.ts) */
export const placement = (camera: StageCamera, at: Point, aspect: number): Readonly<{ pan: number; gain: number; }> => {
  const { ahead, across, distance } = inView(camera, at);
  const halfWidth = Math.tan((camera.fov * Math.PI) / 360) * aspect;
  const pan = Math.max(-1, Math.min(1, across / Math.max(Math.abs(ahead) * halfWidth, 1e-9)));
  const gain = Math.min(1, NEAR / Math.max(distance, 1e-9)) * ((ahead < 0) ? BEHIND : 1);
  return { pan, gain };
};

// == Curves ======================================================================
/** an actor's pan and gain at every frame of the film, as a sound following it hears
 *  them: an actor a frame does not show is silent there */
export const actorCurves = (film: Film, actor: string): Readonly<{ pan: FrameCurve; gain: FrameCurve; }> => {
  const aspect = film.scene.width / film.scene.height;
  const [pan, gain] = [new Float32Array(film.frames.length), new Float32Array(film.frames.length)];
  film.frames.forEach((frame, at) => {
    const shot = frame.actors.find(each => each.name === actor);
    const placed = shot ? placement(frame.camera, shot.position, aspect) : { pan: 0, gain: 0 };
    [pan[at], gain[at]] = [placed.pan, placed.gain];
  });
  return { pan: { first: 0, values: pan }, gain: { first: 0, values: gain } };
};

/** a followed actor's pan and gain at each frame its cue plays over (from its time to
 *  its `until`, a sound played once to the film's end), by the frame's time */
export const followCurve = (film: Film, cue: SoundCue): ReadonlyArray<Readonly<{ time: number; pan: number; gain: number; }>> => {
  const { pan, gain } = actorCurves(film, cue.actor!);
  const { first, count } = framesOf(film, cue.time, cue.until ?? film.scene.length);
  return Array.from({ length: count }, (_, at) => ({ time: film.frames[first + at].time, pan: pan.values[first + at], gain: gain.values[first + at] }));
};

/** the film's gain at each frame: what its fade to black leaves of its picture (a
 *  fade to another color, a flash, leaves its sound) */
export const fadeCurve = (film: Film): ReadonlyArray<Readonly<{ time: number; gain: number; }>> =>
  film.frames.map(frame => ({ time: frame.time, gain: soundLeft(frame) }));
const soundLeft = (frame: Film['frames'][number]): number => (frame.fadeColor && (frame.fadeColor.toLowerCase() !== '#000000')) ? 1 : (1 - frame.fade);

// the frames from `from` up to `to` (seconds): the first's index and how many
const framesOf = (film: Film, from: number, to: number): Readonly<{ first: number; count: number; }> => {
  const first = film.frames.findIndex(frame => frame.time >= (from - TIME_EPSILON));
  if(first < 0) return { first: film.frames.length, count: 0 };
  let last = first;
  while((last < film.frames.length) && (film.frames[last].time < (to - TIME_EPSILON))) last++;
  return { first, count: last - first };
};

// == Mix =========================================================================
/** a film's sound from `from` seconds into it (the film's own time), starting at the
 *  context's time `at` (the moment its picture shows `from`): every cue sounding then
 *  or later within the film, each from where its scene's time shows in the film and
 *  at its own pace however fast the scene runs, through its volume (and, following an
 *  actor, that actor's bus: its gain and pan), the film's fade over them all, every
 *  sound ending as the film's last picture shows; returns what stops it */
export const scheduleMix = (context: BaseAudioContext, film: Film, buffers: SoundBuffers, from: number, at: number): (() => void) => {
  const length = filmLengthOf(film);
  const ends = at + Math.max(0, length - from);
  const master = context.createGain();
  master.connect(context.destination);
  follow(master.gain, { first: 0, values: Float32Array.from(film.frames, soundLeft) }, film.scene.fps, from, at);

  // each followed actor's bus: its gain, then its pan, into the master
  const buses = new Map<string, AudioNode>();
  const busOf = (actor: string): AudioNode => {
    let bus = buses.get(actor);
    if(!bus) {
      const curves = actorCurves(film, actor);
      const [gain, panner] = [context.createGain(), context.createStereoPanner()];
      follow(gain.gain, curves.gain, film.scene.fps, from, at);
      follow(panner.pan, curves.pan, film.scene.fps, from, at);
      gain.connect(panner);
      panner.connect(master);
      buses.set(actor, bus = gain);
    } /* else -- made for an earlier sound following the actor */
    return bus;
  };

  const sources: AudioBufferSourceNode[] = [];
  for(const cue of soundCuesOf(film)) {
    const buffer = buffers.get(cue.name);
    if(!buffer) continue/*not decoded: its file could not be read*/;
    const start = filmTimeOf(film, cue.time);
    const end = (cue.until !== undefined) ? filmTimeOf(film, cue.until) : (start + buffer.duration);
    if((end <= from) || (start >= length)) continue/*over before the mix starts, or past the film's end*/;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = (cue.until !== undefined);
    const volume = context.createGain();
    faded(volume.gain, { ...cue, time: start }, Math.min(end, length), from, at);
    source.connect(volume);
    volume.connect((cue.actor === undefined) ? master : busOf(cue.actor));
    const into = Math.max(0, from - start);
    source.start(at + Math.max(0, start - from), source.loop ? (into % buffer.duration) : into);
    source.stop(Math.min(ends, at + (end - from)));
    sources.push(source);
  }
  return () => {
    for(const source of sources) { try { source.stop(); } catch{ /*never started*/ } }
    master.disconnect();
  };
};

// a sound's volume over its span from `from` seconds on (the context's time from
// `at`): its volume, rising from silence over its fadeIn and falling to silence over
// its fadeOut before `end`; a fade longer than the sound reaches what it reaches by
// the sound's end
const faded = (param: AudioParam, cue: SoundCue, end: number, from: number, at: number): void => {
  const gainAt = (time: number) => cue.volume * Math.max(0, Math.min(1, cue.fadeIn ? ((time - cue.time) / cue.fadeIn) : 1, cue.fadeOut ? ((end - time) / cue.fadeOut) : 1));
  const start = Math.max(from, cue.time);
  param.setValueAtTime(gainAt(start), at + (start - from));
  if(!cue.fadeIn && !cue.fadeOut) return/*its volume throughout*/;
  // its corners: where the fade in ends, the fade out begins, where the two cross
  // overlapping (its loudest), and its end
  const crossing = (cue.fadeIn && cue.fadeOut) ? (((cue.time * cue.fadeOut) + (end * cue.fadeIn)) / (cue.fadeIn + cue.fadeOut)) : undefined;
  const turns = [...new Set([...(cue.fadeIn ? [cue.time + cue.fadeIn] : []), ...(cue.fadeOut ? [end - cue.fadeOut] : []), ...((crossing !== undefined) ? [crossing] : []), end])]
    .filter(time => (time > start) && (time <= end)).sort((a, b) => a - b)/*each once*/;
  for(const time of turns) param.linearRampToValueAtTime(gainAt(time), at + (time - from));
};

// a parameter following a curve over the film's frames from `from` seconds on, as
// the context's time from `at`: the frame at `from` at once, then one value curve to
// the curve's last frame
const follow = (param: AudioParam, curve: FrameCurve, fps: number, from: number, at: number): void => {
  if(curve.values.length < 1) return;
  const into = Math.min(curve.values.length - 1, Math.max(0, Math.ceil((from * fps) - curve.first - TIME_EPSILON)))/*the first frame at or past `from`*/;
  const values = curve.values.subarray(into);
  param.value = values[0];
  if(values.length < 2) return;
  const start = at + Math.max(0, ((curve.first + into) / fps) - from);
  param.setValueCurveAtTime(values, start, (values.length - 1) / fps);
};

// == Waveform ====================================================================
/** a sound's loudest sample in each of `count` equal slices of it, from 0 to 1,
 *  across its channels: what a waveform draws */
export const peaksOf = (buffer: AudioBuffer, count: number): Float32Array => {
  const peaks = new Float32Array(Math.max(1, count));
  const slice = buffer.length / peaks.length;
  for(let channel=0; channel<buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for(let at=0; at<data.length; at++) {
      const index = Math.min(peaks.length - 1, Math.floor(at / slice));
      const sample = Math.abs(data[at]);
      if(sample > peaks[index]) peaks[index] = Math.min(1, sample);
    }
  }
  return peaks;
};

// == Hearing =====================================================================
/** where a sound sounds: its length (seconds), the spans it sounds over (seconds,
 *  first to last) and how many spans it held before they were capped */
export type Heard = Readonly<{ seconds: number; spans: ReadonlyArray<Readonly<{ from: number; to: number; }>>; found: number; }>;
// a sound as its samples: what is heard of a decoded sound
type Sampled = Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'sampleRate' | 'getChannelData'>;

/** where a sound sounds, judged against its own loudness: in windows of
 *  HEARD_WINDOW seconds, one sounding within QUIET_UNDER dB of its loudest (its
 *  power across its channels); the windows sounding, parted by a pause of at least
 *  `minPause` seconds, are its spans. Holding more than `most`, it is parted at its
 *  longest pauses alone (the earlier of two as long) */
export const soundSpans = (sound: Sampled, minPause: number, most: number): Heard => {
  const size = Math.max(1, Math.round(sound.sampleRate * HEARD_WINDOW))/*samples a window*/;
  const count = Math.ceil(sound.length / size);
  const power = new Float64Array(count);
  for(let channel=0; channel<sound.numberOfChannels; channel++) {
    const data = sound.getChannelData(channel);
    for(let at=0; at<data.length; at++) power[Math.floor(at / size)] += data[at] * data[at];
  }
  for(let window=0; window<count; window++) power[window] /= Math.min(size, sound.length - (window * size)) * sound.numberOfChannels;
  const loudest = power.reduce((most, each) => Math.max(most, each), 0);
  const quiet = loudest * (10 ** (-QUIET_UNDER / 10));

  // the windows sounding, as runs from a window up to another
  const runs: Array<[number, number]> = [];
  for(let window=0; window<count; window++) {
    if((loudest <= 0) || (power[window] < quiet)) continue/*a pause*/;
    const last = runs[runs.length - 1];
    if(last && (last[1] === window)) last[1] = window + 1;
    else runs.push([window, window + 1]);
  }
  const seconds = (window: number) => Math.min(window * size, sound.length) / sound.sampleRate;
  const parts = runs.slice(1).map((run, at) => ({ at, pause: seconds(run[0]) - seconds(runs[at][1]) })).filter(({ pause }) => pause >= (minPause - TIME_EPSILON));
  const kept = (parts.length < most) ? parts : [...parts].sort((a, b) => (b.pause - a.pause) || (a.at - b.at)).slice(0, Math.max(0, most - 1)).sort((a, b) => a.at - b.at);
  const ends = [...kept.map(({ at }) => at), runs.length - 1]/*the last run of each span*/;
  return {
    seconds: sound.length / sound.sampleRate,
    spans: (runs.length < 1) ? [] : ends.map((end, at) => ({ from: seconds(runs[(at > 0) ? (ends[at - 1] + 1) : 0][0]), to: seconds(runs[end][1]) })),
    found: (runs.length < 1) ? 0 : (parts.length + 1),
  };
};

// == Bank ========================================================================
/** the film's sounds, read and decoded once each: `readFile` gives a Platform file's
 *  bytes (by its URI), `readShipped` a shipped sound's (by the name a scene plays it
 *  by) */
export class SoundBank {
  // each sound read, decoding or decoded, by name
  private readonly decoded = new Map<string, Promise<AudioBuffer | undefined>>();
  /** the sounds whose files could not be read or decoded, with why */
  public readonly failed = new Map<string, string>();

  public constructor(private readonly readShipped: (name: string) => Promise<ArrayBuffer>, private readonly readFile: (uri: string) => Promise<ArrayBuffer>) {}

  /** the named sounds, decoded; one that cannot be read is left out (and `failed`
   *  says why). `settled` hears each as it is decoded or found unreadable */
  public async load(names: Iterable<string>, settled?: (name: string, buffer: AudioBuffer | undefined/*unreadable*/) => void): Promise<SoundBuffers> {
    const loaded = await Promise.all([...names].map(async name => {
      const buffer = await this.buffer(name);
      settled?.(name, buffer);
      return [name, buffer] as const;
    }));
    return new Map(loaded.filter((entry): entry is readonly [string, AudioBuffer] => entry[1] !== undefined));
  }

  /** the named sound decoded, as a load decodes it; or why it cannot be read or
   *  decoded */
  public async read(name: string): Promise<AudioBuffer> {
    const buffer = await this.buffer(name);
    if(!buffer) throw new Error(this.failed.get(name) ?? 'it could not be read');
    return buffer;
  }

  // the named sound decoded, read once; a failed read is forgotten, so a later load
  // asks again
  private buffer(name: string): Promise<AudioBuffer | undefined> {
    let decoded = this.decoded.get(name);
    if(!decoded) {
      decoded = (isPlatformFile(name) ? this.readFile(name) : this.readShipped(name))
        .then(bytes => new OfflineAudioContext(2, 1, 48_000).decodeAudioData(bytes))
        .catch((error: unknown) => { this.failed.set(name, (error as Error)?.message ?? String(error)); this.decoded.delete(name); return undefined/*left out: `failed` says why*/; });
      this.decoded.set(name, decoded);
    } /* else -- read, or being read, for an earlier load */
    return decoded;
  }
}
