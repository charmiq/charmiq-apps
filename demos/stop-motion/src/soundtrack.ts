import { BehaviorSubject, type Observable } from 'rxjs';

import type { Film } from './film';
import type { Soundtrack as PlayerSoundtrack } from './player';
import { missingSounds, scheduleMix, soundsOf, type SoundBank, type SoundBuffers } from './sound';

// the film's sound as it plays: the film's sounds read from the studio's catalog, the
// mix (SEE: sound.ts) started on the player's clock. the audio clock and the player's
// are tied through the moment the speaker sounds (`getOutputTimestamp`), and the sound
// waits the time the studio takes to show a frame, so the picture and its sound meet
// on screen. the browser lets a frame sound only once the person has pressed in it:
// a film played any other way (a Charm's command) stays silent and says so until a
// press brings its sound in, from where the film plays then. reaching the film's end,
// or looping, lets the sound already started play out its delay, every sound ending as
// the film's last picture shows; a pause, a new film or the way back stops every sound
// still playing at once. a sound whose file cannot be read is left out, and its name
// said
// ********************************************************************************
// == Constants ===================================================================
/** how many of the studio's latest delays (showing a frame) the sound waits the
 *  middle of */
const DELAYS = 9;
/** the longest the sound waits on the studio (ms): a longer delay is a stall, not the
 *  studio's pace */
const MAX_DELAY = 250;

// == Types =======================================================================
/** where the film's sound stands: none to play, its sounds loading (`settled` of
 *  `total` read or found unreadable so far), ready, silent until a press (each naming
 *  the sounds `missing`, those whose files could not be read), or unavailable
 *  (`reason` says why, or every sound is `missing`) */
export type SoundState = Readonly<{ kind: 'none'; } | { kind: 'loading'; settled: number; total: number; } | { kind: 'ready' | 'silent'; missing: ReadonlyArray<string>; } | { kind: 'unavailable'; reason: string; } | { kind: 'unavailable'; missing: ReadonlyArray<string>; }>;

// == Class =======================================================================
export class Soundtrack implements PlayerSoundtrack {
  // the audio context, made at the first start (a press lets it run)
  private context: AudioContext | undefined;
  // the film whose sound plays, its sounds decoded and those that could not be read
  private film: Film | undefined;
  private buffers: SoundBuffers = new Map();
  private missing: ReadonlyArray<string> = [];
  // what stops each mix that may still sound: the one playing, and the one before it
  // playing out its delay after a loop or the film's end
  private mixes: Array<() => void> = [];
  // where the last start put the film on the player's clock, while playing
  private started: Readonly<{ from: number; at: number; }> | undefined;
  // the studio's latest delays in showing a frame (ms)
  private readonly delays: number[] = [];
  private readonly state = new BehaviorSubject<SoundState>({ kind: 'none' });

  /** `bank` reads the studio's sounds: none where the Platform delivers no file's
   *  bytes */
  public constructor(private readonly bank: SoundBank | undefined) {}

  /** where the film's sound stands, from now on */
  public get state$(): Observable<SoundState> { return this.state.asObservable(); }

  // == Film ======================================================================
  /** the film whose sound plays: the sound of the film before stopped, its sounds
   *  read, and sounding at once where it already plays */
  public setFilm(film: Film | undefined): void {
    if(film !== this.film) this.stopMixes(0)/*the film before's sound, playing out or not*/;
    this.film = film;
    const names = film ? soundsOf(film) : new Set<string>();
    [this.buffers, this.missing] = [new Map(), []];
    if(names.size < 1) { this.state.next({ kind: 'none' }); return; }
    if(!this.bank) { this.state.next({ kind: 'unavailable', reason: 'This Platform delivers no sound files' }); return; }
    let settled = 0;
    this.state.next({ kind: 'loading', settled, total: names.size });
    void this.bank.load(names, () => {
      settled++;
      if((film === this.film) && (settled < names.size)) this.state.next({ kind: 'loading', settled, total: names.size })/*the last settles into what the film hears*/;
    }).then(buffers => {
      if(film !== this.film) return/*another film meanwhile*/;
      [this.buffers, this.missing] = [buffers, missingSounds(film!, buffers)];
      this.state.next((buffers.size < 1) ? { kind: 'unavailable', missing: this.missing } : this.heard());
      if(this.started) this.restart()/*playing: the sounds in from here*/;
    });
  }

  // == Playing ===================================================================
  /** the film's sound from `from` seconds at `at` on the player's clock; `carry`
   *  lets the sound already started play out (the film looped) */
  public start(from: number, at: number, carry = false): void {
    const started = { from, at };
    this.started = started;
    this.stopMixes(carry ? 1/*the last plays out*/ : 0);
    const film = this.film;
    if(!film || (this.buffers.size < 1)) return/*nothing to play, or not yet read*/;

    // a press in the frame lets the context run: created then, or resumed; a resume
    // that completes later brings the sound in from where the film plays then, unless
    // the film stopped or started again meanwhile
    this.context ??= new AudioContext();
    if(this.context.state !== 'running') {
      this.state.next(this.heard());
      const context = this.context;
      void context.resume().then(() => { if((this.started === started) && (context.state === 'running')) { this.state.next(this.heard()); this.restart(); } }, () => undefined/*refused: silent until a press*/);
      return;
    } /* else -- the context runs: the mix starts now */
    this.state.next(this.heard());

    // the moment `at` (plus the studio's delay) as the audio clock's, a moment past
    // taken up from now further into the film
    const context = this.context;
    let when = this.contextTime(at + this.delay());
    let into = from;
    if(when < context.currentTime) { into += context.currentTime - when; when = context.currentTime; }
    this.mixes.push(scheduleMix(context, film, this.buffers, into, when));
  }

  /** the film paused (or left): every sound still playing stopped at once */
  public stop(): void {
    this.started = undefined;
    this.stopMixes(0);
  }

  /** the film reached its end: the sound already started plays out its delay, still
   *  stopped by a pause or a new start */
  public finish(): void {
    this.started = undefined;
  }

  /** the person's press: the film's sound let in, from where it plays now */
  public async resume(): Promise<void> {
    this.context ??= new AudioContext();
    await this.context.resume();
    this.state.next(this.heard());
    this.restart();
  }

  // == Studio's Delay ============================================================
  /** how long the studio took to show a frame (ms), measured while playing */
  public observeDelay(ms: number): void {
    if(!Number.isFinite(ms) || (ms < 0)) return;
    this.delays.push(Math.min(ms, MAX_DELAY));
    if(this.delays.length > DELAYS) this.delays.shift();
  }

  // == Internal ==================================================================
  // -- Mixes ---------------------------------------------------------------------
  // stops every mix but the latest `keep`
  private stopMixes(keep: number): void {
    for(const stop of this.mixes.splice(0, Math.max(0, this.mixes.length - keep))) stop();
  }

  // the mix again from where the film plays now
  private restart(): void {
    const started = this.started;
    if(!started) return;
    const now = performance.now();
    this.start(started.from + ((now - started.at) / 1000), now);
  }

  // -- State ---------------------------------------------------------------------
  // ready when the context runs, silent until a press otherwise (a film with sound),
  // naming the sounds missing
  private heard(): SoundState {
    if(this.state.value.kind === 'unavailable') return this.state.value;
    return { kind: (!this.context || (this.context.state === 'running')) ? 'ready' : 'silent', missing: this.missing };
  }

  // -- Clocks --------------------------------------------------------------------
  // the studio's delay showing a frame: the middle of its latest (ms)
  private delay(): number {
    if(this.delays.length < 1) return 0;
    const sorted = [...this.delays].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // a moment of the player's clock (ms) as the audio clock's (seconds): through the
  // sample the speaker sounds now, or the context's own time before it reports one
  private contextTime(at: number): number {
    const context = this.context!;
    const stamp = context.getOutputTimestamp();
    if((stamp.contextTime !== undefined) && (stamp.performanceTime !== undefined) && (stamp.performanceTime > 0)) return stamp.contextTime + ((at - stamp.performanceTime) / 1000);
    return context.currentTime + context.outputLatency + ((at - performance.now()) / 1000);
  }
}
