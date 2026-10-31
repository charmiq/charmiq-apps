import { filmLengthOf, soundCuesOf, type Film } from './film';
import { frameTime } from './key-easing';
import { missingSounds, scheduleMix, type SoundBuffers } from './sound';
import type { Studios } from './studios';

// the film as a video file: every frame captured from the main studio at the
// scene's size, its fade and title drawn by the studio, encoded as H.264 in an MP4
// (Mediabunny, loaded the first time a film is exported) and handed to the browser
// to save. A film with sound carries it as AAC: the mix that plays (SEE: sound.ts),
// rendered offline whole, without any sound whose file could not be read, and saying
// which; a browser that encodes no AAC exports the picture alone and says so
// ********************************************************************************
// == Constants ===================================================================
const BITRATE = 8_000_000/*bits per second*/;
/** the sound's sample rate (Hz) and channels */
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

// == Types =======================================================================
/** Mediabunny's surface this module reaches (SEE: https://mediabunny.dev) */
type Mediabunny = Readonly<{
  Output: new (options: { format: unknown; target: unknown; }) => { addVideoTrack: (source: unknown, metadata?: { frameRate?: number; }) => void; addAudioTrack: (source: unknown) => void; start: () => Promise<void>; finalize: () => Promise<void>; cancel: () => Promise<void>; target: { buffer: ArrayBuffer | null; }; };
  Mp4OutputFormat: new () => unknown;
  BufferTarget: new () => unknown;
  CanvasSource: new (canvas: OffscreenCanvas, options: { codec: 'avc'; bitrate: number; }) => { add: (timestamp: number, duration: number) => Promise<void>; };
  AudioBufferSource: new (options: { codec: 'aac'; quality: unknown; }) => { add: (buffer: AudioBuffer) => Promise<void>; };
  canEncodeAudio: (codec: 'aac', options: { numberOfChannels: number; sampleRate: number; }) => Promise<boolean>;
  QUALITY_HIGH: unknown;
}>;

/** an exported film: its file; why it carries no sound when its film has some (an
 *  encoder it lacks), and the sounds it carries without (their files could not be
 *  read), every one when none could be */
export type Exported = Readonly<{ file: Blob; withoutSound?: string; missing?: ReadonlyArray<string>; }>;

// == Export ======================================================================
/** the film as an MP4, its sound from `sounds` (the film's sounds, decoded), its
 *  progress told frame by frame; undefined once `cancelled` says stop, or when a
 *  frame of this film cannot be captured: another film was staged meanwhile, or the
 *  status says why */
export const exportFilm = async (film: Film, studios: Studios, sounds: SoundBuffers | undefined, onProgress: (done: number, total: number) => void, cancelled: () => boolean): Promise<Exported | undefined> => {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, canEncodeAudio, QUALITY_HIGH } = await import('mediabunny') as unknown as Mediabunny;
  const { width, height, fps } = film.scene;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: BITRATE });
  output.addVideoTrack(source, { frameRate: fps });

  // the sound mixed whole before the frames: its track is declared before the output
  // starts, and added once they are in
  let sound: Readonly<{ source: InstanceType<Mediabunny['AudioBufferSource']>; mixed: AudioBuffer; }> | undefined;
  let withoutSound: string | undefined;
  const missing = missingSounds(film, sounds);
  if(sounds && (sounds.size > 0) && (soundCuesOf(film).length > 0)) {
    if(!(await canEncodeAudio('aac', { numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE }))) withoutSound = 'This browser encodes no AAC sound';
    else {
      const mixing = new OfflineAudioContext(CHANNELS, Math.ceil(filmLengthOf(film) * SAMPLE_RATE), SAMPLE_RATE);
      scheduleMix(mixing, film, sounds, 0, 0);
      const audio = new AudioBufferSource({ codec: 'aac', quality: QUALITY_HIGH });
      output.addAudioTrack(audio);
      sound = { source: audio, mixed: await mixing.startRendering() };
    }
  } /* else -- a silent film, or none of its sounds read: every one missing */
  await output.start();
  for(const frame of film.frames) {
    if(cancelled()) { await output.cancel(); return undefined; }
    const image = await studios.capture(film, frame.index, { width, height })/*none once another film is staged*/;
    if(!image) { await output.cancel(); return undefined; }
    context.drawImage(image, 0, 0, width, height);
    image.close();
    await source.add(frameTime(frame.index, fps), frameTime(1, fps));
    onProgress(frame.index + 1, film.frames.length);
  }
  if(sound) await sound.source.add(sound.mixed);
  await output.finalize();
  return {
    file: new Blob([output.target.buffer!], { type: 'video/mp4' }),
    ...((withoutSound !== undefined) ? { withoutSound } : {}),
    ...((missing.length > 0) ? { missing } : {}),
  };
};

/** hands a file to the browser to save */
export const save = (file: Blob, name: string): void => {
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000/*after the browser has it*/);
};

/** a file name from a film's title: lower case words joined by dashes */
export const fileName = (title: string): string => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'film'}.mp4`;
