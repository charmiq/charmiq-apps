import { BehaviorSubject, type Observable } from 'rxjs';

import type { Film } from './film';

// the player: the film's playhead and its clock. It draws nothing: each frame it
// reaches is shown on the studios, which are the film's screens. Playing, the frame
// is reckoned from the time since play began (performance.now()), never counted a
// frame per callback, and a timer wakes the clock at each frame's start: a late wake
// jumps to the frame due, and the timeline scrolled out of view (where the browser
// draws it no animation frames) still plays the studios in view. The film's sound
// starts on the same clock wherever playing starts, seeks or loops, stops with a
// pause, and plays out what it started at the film's end
// ********************************************************************************
// == Types =======================================================================
/** where the player stands: the frame the playhead is at, and whether it plays and
 *  loops */
export type PlayerState = Readonly<{ index: number; playing: boolean; loop: boolean; }>;

/** what plays the film's sound beside its picture: from `from` seconds into the film
 *  at the moment `at` of the player's clock (performance.now()), the sound already
 *  started playing out when `carry`ied (the film looped); stopped at once (a pause),
 *  or finished, the sound started playing out (the film's end) */
export type Soundtrack = Readonly<{ start: (from: number, at: number, carry?: boolean) => void; stop: () => void; finish: () => void; }>;

// == Class =======================================================================
export class Player {
  /** the film the playhead runs over */
  private film: Film | undefined;
  private readonly state = new BehaviorSubject<PlayerState>({ index: 0, playing: false, loop: true });
  /** when playing began and from which frame, while playing */
  private clock: { start: number; from: number; } | undefined;
  /** the timer that wakes the clock, while playing */
  private wake: ReturnType<typeof setTimeout> | undefined;

  /** `show` puts a frame on the studios; `soundtrack` plays the film's sound */
  public constructor(private readonly show: (index: number) => void, private readonly soundtrack?: Soundtrack) {}

  public get state$(): Observable<PlayerState> { return this.state.asObservable(); }
  public get current(): PlayerState { return this.state.value; }

  // == Film ======================================================================
  /** runs the playhead over a film, keeping its frame where the film allows, and
   *  shows that frame */
  public setFilm(film: Film | undefined): void {
    this.film = film;
    const index = film ? Math.min(this.state.value.index, film.frames.length - 1) : 0;
    this.update({ index });
    if(film) this.show(index);
    if(film && this.clock) { this.clock = { start: performance.now(), from: index }; this.sound(); }/*playing on: the new film's sound from here*/
  }

  // == Transport =================================================================
  public seek(index: number): void {
    if(!this.film) return;
    const clamped = Math.max(0, Math.min(this.film.frames.length - 1, Math.round(index)));
    if(this.clock) { this.clock = { start: performance.now(), from: clamped }; this.sound(); }
    this.moveTo(clamped);
  }
  public step(delta: number): void { this.pause(); this.seek(this.state.value.index + delta); }

  public play(): void {
    if(!this.film || this.state.value.playing) return;
    const from = (this.state.value.index >= (this.film.frames.length - 1)) ? 0 : this.state.value.index;
    this.clock = { start: performance.now(), from };
    this.update({ playing: true });
    this.sound();
    this.tick();
  }
  public pause(): void {
    clearTimeout(this.wake);
    this.clock = undefined/*not playing*/;
    this.wake = undefined;
    this.soundtrack?.stop();
    if(this.state.value.playing) this.update({ playing: false });
  }
  public toggle(): void { if(this.state.value.playing) this.pause(); else this.play(); }
  public setLoop(loop: boolean): void { this.update({ loop }); }
  /** shows the playhead's frame on the studios again (staged anew) */
  public redraw(): void { if(this.film) this.show(this.state.value.index); }

  // == Clock =====================================================================
  /** moves the playhead to the frame due now and sleeps until the next one starts */
  private tick(): void {
    const film = this.film, clock = this.clock;
    if(!film || !clock) return;
    const { fps } = film.scene;
    let { start, from } = clock;
    let due = from + Math.floor(((performance.now() - start) / 1000) * fps);
    const last = film.frames.length - 1;
    if(due > last) {
      if(!this.state.value.loop) { this.moveTo(last); this.end(); return; }
      [start, from, due] = [performance.now(), 0, 0];
      this.clock = { start, from };
      this.sound(true)/*looped: the sound from the start again, the last playing out*/;
    } /* else -- within the film */
    this.moveTo(due);
    const next = ((due - from + 1) / fps) - ((performance.now() - start) / 1000)/*seconds to the next frame's start*/;
    this.wake = setTimeout(() => this.tick(), Math.max(1, next * 1000));
  }

  /** the film's sound from where the clock starts */
  private sound(carry = false): void {
    const film = this.film, clock = this.clock;
    if(film && clock) this.soundtrack?.start(clock.from / film.scene.fps, clock.start, carry);
  }

  /** the film's end reached: stopped, the sound started playing out */
  private end(): void {
    clearTimeout(this.wake);
    [this.clock, this.wake] = [undefined/*not playing*/, undefined/*no wake*/];
    this.soundtrack?.finish();
    this.update({ playing: false });
  }

  /** the playhead at a frame, shown on the studios when it moved */
  private moveTo(index: number): void {
    if(index === this.state.value.index) return/*already there*/;
    this.update({ index });
    this.show(index);
  }

  // == State =====================================================================
  private update(change: Partial<PlayerState>): void { this.state.next({ ...this.state.value, ...change }); }
}
