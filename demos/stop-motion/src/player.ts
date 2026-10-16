import { BehaviorSubject, type Observable } from 'rxjs';

import type { Film, FilmFrame } from './film';
import type { Studios } from './studios';

// the player: shows the film a frame at a time. A frame is shot on the studios the
// first time it is shown and kept in the take (a JPEG, encoded at once: a deferred
// encode can wait on the browser for a second), so it plays and scrubs again without
// a studio; a new scene starts a new take. Playing runs on the film's clock and waits
// for a frame still being shot (the strip shows it develop). Scrubbing asks for the
// latest frame only: one is shot at a time, the newest asked for next. A frame shown
// from the take is shown on the studios too, so they follow the film live. The fade
// and the titles are drawn over each frame, never by the studio
// ********************************************************************************
// == Constants ===================================================================
/** the size frames are shot at for the take, its height the scene's aspect */
const TAKE_WIDTH = 960/*pixels*/;
/** how the take keeps each frame: a small image, decoded again to show */
const TAKE_TYPE = 'image/jpeg';
const TAKE_QUALITY = 0.86;

// == Types =======================================================================
/** a frame the take keeps: its image as a data URL */
export type TakenFrame = string;

/** where the player stands: the frame on screen, whether it plays and loops, how
 *  many frames the take holds and whether a frame is being shot */
export type PlayerState = Readonly<{
  index: number;
  playing: boolean;
  loop: boolean;
  /** frames in the take */
  taken: number;
  /** a frame is being shot */
  shooting: boolean;
}>;

// == Class =======================================================================
export class Player {
  /** the film shown, and its take: each frame shot so far, by frame */
  private film: Film | undefined;
  private readonly take = new Map<number, TakenFrame>();
  /** the canvas each shot frame is encoded on */
  private readonly darkroom = document.createElement('canvas');
  private onFrameTaken: ((index: number, frame: TakenFrame) => void) | undefined;

  private readonly state = new BehaviorSubject<PlayerState>({ index: 0, playing: false, loop: true, taken: 0, shooting: false });
  /** the frame wanted on screen, and the one being shot */
  private wanted = 0;
  private shooting: number | undefined;
  /** when playing began and from which frame, while playing */
  private clock: { start: number; from: number; } | undefined;

  public constructor(private readonly canvas: HTMLCanvasElement, private readonly studios: Studios) {}

  public get state$(): Observable<PlayerState> { return this.state.asObservable(); }
  public get current(): PlayerState { return this.state.value; }

  // == Film ======================================================================
  /** shows a film, starting a new take; `sameShots` keeps the take when the new
   *  film shoots every frame as the last did */
  public setFilm(film: Film | undefined, sameShots = false): void {
    this.film = film;
    if(!sameShots) this.take.clear();
    const index = film ? Math.min(this.state.value.index, film.frames.length - 1) : 0;
    this.update({ index, taken: this.take.size });
    void this.show(index);
  }

  // == Take ======================================================================
  /** the take's frame, when shot */
  public taken(index: number): TakenFrame | undefined { return this.take.get(index); }
  /** register the callback for each frame the take gains */
  public onTaken(callback: (index: number, frame: TakenFrame) => void): void { this.onFrameTaken = callback; }

  /** shoots every frame not yet in the take, in order */
  public async develop(onProgress: (done: number, total: number) => void): Promise<void> {
    const film = this.film;
    if(!film) return;
    for(const frame of film.frames) {
      if(this.film !== film) return/*replaced*/;
      if(!this.take.has(frame.index)) await this.shoot(film, frame);
      onProgress(frame.index + 1, film.frames.length);
    }
  }

  // == Transport =================================================================
  public seek(index: number): void {
    if(!this.film) return;
    const clamped = Math.max(0, Math.min(this.film.frames.length - 1, Math.round(index)));
    if(this.state.value.playing) this.clock = { start: performance.now(), from: clamped };
    void this.show(clamped);
  }
  public step(delta: number): void { this.pause(); this.seek(this.state.value.index + delta); }

  public play(): void {
    if(!this.film || this.state.value.playing) return;
    const from = (this.state.value.index >= (this.film.frames.length - 1)) ? 0 : this.state.value.index;
    this.clock = { start: performance.now(), from };
    this.update({ playing: true });
    requestAnimationFrame(() => this.tick());
  }
  public pause(): void { this.clock = undefined/*not playing*/; this.update({ playing: false }); }
  public toggle(): void { if(this.state.value.playing) this.pause(); else this.play(); }
  public setLoop(loop: boolean): void { this.update({ loop }); }

  // == Shooting ==================================================================
  /** resolves once no frame is being shot: the frame asked for is on screen */
  public settled(): Promise<void> {
    return new Promise(resolve => {
      const subscription = this.state.subscribe(state => { if(!state.shooting) { queueMicrotask(() => subscription.unsubscribe()); resolve(); } });
    });
  }

  /** shows a frame: from the take, else shot now; while one is shot, the newest
   *  asked for waits its turn */
  private async show(index: number): Promise<void> {
    this.wanted = index;
    this.update({ index });
    const film = this.film;
    if(!film) { this.clear(); return; }
    const kept = this.take.get(index);
    if(kept) { this.studios.monitor(film, film.frames[index]); this.draw(film.frames[index], await decoded(kept)); return; }
    if(this.shooting !== undefined) return/*the newest is shot once this one lands*/;

    this.shooting = index;
    this.update({ shooting: true });
    try { await this.shoot(film, film.frames[index]); }
    finally { this.shooting = undefined/*none being shot*/; this.update({ shooting: false }); }
    if((this.film === film) && (this.wanted !== index)) void this.show(this.wanted);
    else if((this.film === film) && this.take.has(index)) this.draw(film.frames[index], await decoded(this.take.get(index)!));
  }

  /** shoots a frame on the studios and keeps it in the take */
  private async shoot(film: Film, frame: FilmFrame): Promise<void> {
    const width = TAKE_WIDTH, height = Math.round(TAKE_WIDTH * (film.scene.height / film.scene.width));
    const image = await this.studios.frame(film, frame, { width, height });
    if(!image) return/*no studio, or none staged: the slate says why*/;
    const canvas = this.darkroom;
    [canvas.width, canvas.height] = [image.width, image.height];
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    image.close();
    const taken = canvas.toDataURL(TAKE_TYPE, TAKE_QUALITY);
    if(this.film !== film) return/*a new scene's take*/;
    this.take.set(frame.index, taken);
    this.update({ taken: this.take.size });
    this.onFrameTaken?.(frame.index, taken);
  }

  // == Drawing ===================================================================
  /** draws the frame on screen again (the canvas was resized) */
  public redraw(): void { void this.show(this.state.value.index); }

  /** draws a frame and what lies over it, the frame fit whole */
  private draw(frame: FilmFrame, image: HTMLImageElement): void {
    const context = this.canvas.getContext('2d')!;
    const { width, height } = this.canvas;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    const scale = Math.min(width / image.width, height / image.height);
    const [w, h] = [image.width * scale, image.height * scale];
    const [x, y] = [(width - w) / 2, (height - h) / 2];
    context.drawImage(image, x, y, w, h);
    overlay(context, frame, x, y, w, h);
  }

  /** clears the screen: no film */
  private clear(): void {
    const context = this.canvas.getContext('2d')!;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // == Clock =====================================================================
  /** shows the frame the film's clock has reached, one animation frame at a time */
  private tick(): void {
    const film = this.film;
    if(!film || !this.clock || !this.state.value.playing) return;
    // a frame still being shot holds the clock on the frame shown
    if(this.shooting !== undefined) { this.clock = { start: performance.now(), from: this.state.value.index }; requestAnimationFrame(() => this.tick()); return; }
    let due = this.clock.from + Math.floor(((performance.now() - this.clock.start) / 1000) * film.scene.fps);
    const last = film.frames.length - 1;
    if(due > last) {
      if(!this.state.value.loop) { this.pause(); return; }
      this.clock = { start: performance.now(), from: 0 };
      due = 0;
    } /* else -- within the film */
    if(due !== this.state.value.index) void this.show(due);
    requestAnimationFrame(() => this.tick());
  }

  // == State =====================================================================
  private update(change: Partial<PlayerState>): void { this.state.next({ ...this.state.value, ...change }); }
}

// == Overlay =====================================================================
/** a frame's fade and titles, over its image at x, y, w, h: a title stands over the
 *  black of a fade. A card fills the frame in the studio's type; a caption runs along
 *  its foot */
export const overlay = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: FilmFrame, x: number, y: number, w: number, h: number): void => {
  if(frame.fade > 0) {
    context.fillStyle = `rgba(0, 0, 0, ${Math.min(1, frame.fade)})`;
    context.fillRect(x, y, w, h);
  } /* else -- no fade */
  const title = frame.title;
  if(title) {
    const progress = Math.min(1, Math.min(frame.time - title.from, title.to - frame.time) / 0.25)/*a quarter second in and out*/;
    context.save();
    context.globalAlpha = Math.max(0, progress);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if(title.style === 'card') {
      context.fillStyle = 'rgba(16, 15, 13, 0.55)';
      context.fillRect(x, y, w, h);
      context.fillStyle = '#FFFDF2';
      context.font = `500 ${Math.round(h * 0.11)}px Inter, 'Helvetica Neue', Arial, sans-serif`;
      context.fillText(title.text, x + (w / 2), y + (h / 2), w * 0.9);
    } else {
      context.font = `500 ${Math.round(h * 0.05)}px 'JetBrains Mono', ui-monospace, Menlo, monospace`;
      const width = Math.min(w * 0.9, context.measureText(title.text).width + (h * 0.06));
      context.fillStyle = 'rgba(16, 15, 13, 0.7)';
      context.fillRect(x + ((w - width) / 2), y + (h * 0.84), width, h * 0.09);
      context.fillStyle = '#FFFDF2';
      context.fillText(title.text, x + (w / 2), y + (h * 0.885), w * 0.88);
    }
    context.restore();
  } /* else -- no title over this frame */
};

// == Util ========================================================================
/** a taken frame as an image, decoded */
const decoded = async (frame: TakenFrame): Promise<HTMLImageElement> => {
  const image = new Image();
  image.src = frame;
  await image.decode();
  return image;
};
