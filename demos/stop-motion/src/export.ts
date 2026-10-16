import type { Film } from './film';
import { overlay } from './player';
import type { Studios } from './studios';

// the film as a video file: every frame shot on the main studio at the scene's
// size, its titles and fade drawn over it, encoded as H.264 in an MP4 (Mediabunny,
// loaded the first time a film is exported) and handed to the browser to save
// ********************************************************************************
// == Constants ===================================================================
const BITRATE = 8_000_000/*bits per second*/;

// == Types =======================================================================
/** Mediabunny's surface this module reaches (SEE: https://mediabunny.dev) */
type Mediabunny = Readonly<{
  Output: new (options: { format: unknown; target: unknown; }) => { addVideoTrack: (source: unknown, metadata?: { frameRate?: number; }) => void; start: () => Promise<void>; finalize: () => Promise<void>; cancel: () => Promise<void>; target: { buffer: ArrayBuffer | null; }; };
  Mp4OutputFormat: new () => unknown;
  BufferTarget: new () => unknown;
  CanvasSource: new (canvas: OffscreenCanvas, options: { codec: 'avc'; bitrate: number; }) => { add: (timestamp: number, duration: number) => Promise<void>; };
}>;

// == Export ======================================================================
/** the film as an MP4, its progress told frame by frame; undefined once `cancelled`
 *  says stop, or when a frame cannot be shot (the slate says why) */
export const exportFilm = async (film: Film, studios: Studios, onProgress: (done: number, total: number) => void, cancelled: () => boolean): Promise<Blob | undefined> => {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource } = await import('mediabunny') as unknown as Mediabunny;
  const { width, height, fps } = film.scene;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: BITRATE });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  for(const frame of film.frames) {
    if(cancelled()) { await output.cancel(); return undefined; }
    const image = await studios.frame(film, frame, { width, height });
    if(!image) { await output.cancel(); return undefined; }
    context.drawImage(image, 0, 0, width, height);
    image.close();
    overlay(context, frame, 0, 0, width, height);
    await source.add(frame.index / fps, 1 / fps);
    onProgress(frame.index + 1, film.frames.length);
  }
  await output.finalize();
  return new Blob([output.target.buffer!], { type: 'video/mp4' });
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
