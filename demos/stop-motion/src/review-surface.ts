import { concat, defer, from, Subject, type Observable } from 'rxjs';

import type { CharmIQAPI } from '../../../shared/charmiq';
import { REVIEW_SURFACE, type Mark, type ReviewSurface } from '../../../shared/review/surface';

import { cameraShots, frameEnd, shotAt, type Film } from './film';
import type { Player } from './player';
import { placedBy } from './review';
import type { Row } from './timeline-marks';

// the timeline as a review surface (SEE: shared/review/surface.ts): while a note is
// written the timeline takes marks, a drag across its lanes a span of frames over the
// rows it crosses, and marking turned on marks the playhead's moment at once, so a
// note carries its moment though no span is dragged. Each mark is resolved here into
// the film's terms (its frames and scene times, the shot it starts in, each row it
// crosses, an actor's with what moves it then and the scene's lines that do), and
// heard by every listener, one subscribing late hearing first those made since
// marking last turned on. Shown again, a
// note's spans loop with their rows lit; a note naming only frames (a stroke drawn on
// the picture) is sought to its first. Without a Review in the document nothing
// calls it, and the timeline scrubs as ever
// ********************************************************************************
// == Constants ===================================================================
/** the kind of surface the timeline is: its marks' `surface` */
export const TIMELINE_SURFACE = 'timeline';

// == Types =======================================================================
/** frames of the film, first and last (indices, inclusive) */
export type FrameSpan = Readonly<{ first: number; last: number; }>;
/** a span dragged on the timeline: its frames, and each row it crosses in the
 *  timeline's order */
export type MarkedSpan = FrameSpan & Readonly<{ rows: ReadonlyArray<Pick<Row, 'name' | 'track'>>; }>;
/** rows lit over frames: each row by its name on the timeline */
export type Lit = FrameSpan & Readonly<{ rows: ReadonlyArray<string>; }>;
/** what showing marks does: the span looped from its first frame (none: nothing
 *  loops), else the frame sought (none: the playhead stays), and the rows lit */
export type Showing = Readonly<{ loop?: FrameSpan; seek?: number; lit: ReadonlyArray<Lit>; }>;

/** what the surface reaches: the film shown and the playhead's frame, the timeline
 *  (marking spans or not, rows lit) and the transport */
export type SurfaceHost = Readonly<{
  film: () => Film | undefined;
  frame: () => number;
  timeline: Readonly<{ setMarking: (on: boolean) => void; lightSpans: (lit: ReadonlyArray<Lit>) => void; }>;
  player: Pick<Player, 'seek' | 'play' | 'pause' | 'loopSpan' | 'redraw'>;
  /** resolves once the main studio has drawn a frame (SEE: studios.ts whenShown) */
  shown: (index: number) => Promise<void>;
}>;

// == Marks =======================================================================
/** a span of the film resolved as a timeline mark: its frames (within the film), its
 *  scene times (from its first frame's start to its last frame's end), the shot it
 *  starts in, each row it crosses (an actor's with what places its feet as the span
 *  starts and the scene's lines that do, a view's camera by its view) and its chip's
 *  label; shown again by its rows */
export const timelineMark = (film: Film, span: MarkedSpan): Mark => {
  const last = clampFrame(film, span.last), first = Math.min(clampFrame(film, span.first), last);
  const from = film.frames[first].time, to = frameEnd(film, last);
  const shot = shotAt(cameraShots(film.scene.camera, film.scene.length), from)?.name;
  const rows = span.rows.map(row => {
    const { name, track } = row;
    if(track.kind === 'actor') return { name, kind: track.kind, ...placedBy(film, track.name, from) };
    if(track.kind === 'camera') return { name, kind: track.kind, ...((track.view !== undefined) ? { view: track.view } : {}) };
    return { name, kind: track.kind };
  });
  const names = span.rows.map(row => row.name);
  const when = (first === last) ? `${from.toFixed(2)} s` : `${from.toFixed(2)}–${to.toFixed(2)} s`;
  return {
    surface: TIMELINE_SURFACE,
    label: `Timeline, ${when}${(names.length > 0) ? `: ${names.join(', ')}` : ''}`,
    frames: { first, last },
    resolved: { times: { from: thousandths(from), to: thousandths(to) }, ...((shot !== undefined) ? { shot } : {}), rows },
    shown: { rows: names },
  };
};

/** the playhead's moment as a timeline mark: its frame, no rows */
export const momentMark = (film: Film, frame: number): Mark => timelineMark(film, { first: frame, last: frame, rows: [] });

// == Show ========================================================================
/** what showing a note's marks does: its timeline spans (a span of frames, or rows)
 *  looped together, first to last, each lighting its rows over its frames; else the
 *  first frame any mark names (the playhead's moment, a stroke's frame) sought; else
 *  nothing, the playhead where it is */
export const showingOf = (marks: ReadonlyArray<Mark>): Showing => {
  const spans = marks.flatMap(mark => (isTimeline(mark) && mark.frames && ((mark.frames.last > mark.frames.first) || (rowsShown(mark).length > 0))) ? [{ ...mark.frames, rows: rowsShown(mark) }] : []);
  if(spans.length > 0) {
    const loop = { first: Math.min(...spans.map(span => span.first)), last: Math.max(...spans.map(span => span.last)) };
    return { loop, seek: loop.first, lit: spans };
  } /* else -- no span: a moment, or none */
  const framed = marks.find(mark => mark.frames)?.frames;
  return framed ? { seek: framed.first, lit: [] } : { lit: [] };
};

const isTimeline = (mark: Mark): boolean => mark.surface === TIMELINE_SURFACE;
/** the rows a timeline mark lights: the names it was shown by */
const rowsShown = (mark: Mark): ReadonlyArray<string> => {
  const rows = mark.shown.rows;
  return Array.isArray(rows) ? rows.filter((row): row is string => typeof row === 'string') : [];
};

// == Surface =====================================================================
/** the timeline as Review calls it: marking, the marks made, and a note shown */
export class TimelineSurface {
  private marking = false;
  // each mark as it is made, and those made since marking last turned on: a listener
  // hears the ones made before it subscribed, then each as it is made, so the moment
  // mark reaches it however late its subscription arrives across the bridge
  private readonly made = new Subject<Mark>();
  private madeSince: ReadonlyArray<Mark> = [];

  public constructor(private readonly host: SurfaceHost) {}

  /** advertises the surface for Review to find; standalone, nothing */
  public advertise(charmiq: CharmIQAPI | undefined): void {
    if(!charmiq?.advertise) return/*standalone: no Review*/;
    charmiq.advertise(REVIEW_SURFACE, {
      kind: async () => TIMELINE_SURFACE,
      marking: async (on: boolean) => this.setMarking(on),
      marks$: () => this.marks$(),
      show: async (marks: ReadonlyArray<Mark>) => this.show(marks),
    } satisfies ReviewSurface);
  }

  // == Marking ===================================================================
  /** each mark made since marking last turned on, then each as it is made */
  public marks$(): Observable<Mark> { return defer(() => concat(from(this.madeSince), this.made)); }

  /** takes marks (on), the playhead's moment marked at once, or stops; spans drag
   *  across the lanes only while on. Either way the marks made before are dropped, so
   *  a listener subscribing for the next note never hears the last one's */
  public setMarking(on: boolean): void {
    if(on === this.marking) return/*already so*/;
    this.marking = on;
    this.madeSince = [];
    this.host.timeline.setMarking(on);
    const film = this.host.film();
    if(on && film) this.emit(momentMark(film, this.host.frame()));
  }

  /** a span dragged on the timeline, marked while marking */
  public mark(span: MarkedSpan): void {
    const film = this.host.film();
    if(!this.marking || !film) return/*not marking, or no film*/;
    this.emit(timelineMark(film, span));
  }

  // a mark made: kept for later listeners, then heard by those listening
  private emit(mark: Mark): void {
    this.madeSince = [...this.madeSince, mark];
    this.made.next(mark);
  }

  // == Show ======================================================================
  /** shows a note's marks (SEE: showingOf): a span looped and played, its rows lit;
   *  a frame sought, paused; none, the loop stopped and the lights cleared, the
   *  playhead where it is. Answers once the studio has drawn the frame it went to (a
   *  span's first), so whoever looks next sees the note's moment, never the picture
   *  before it; a studio that never draws it (gone from the film) answers as it stands */
  public async show(marks: ReadonlyArray<Mark>): Promise<void> {
    const { player, timeline } = this.host;
    const film = this.host.film();
    const showing = showingOf(marks);
    player.pause();
    if(!film) { player.loopSpan(undefined); timeline.lightSpans([]); return; }
    const loop = showing.loop && { first: clampFrame(film, showing.loop.first), last: clampFrame(film, showing.loop.last) };
    player.loopSpan(loop);
    const at = (showing.seek !== undefined) ? clampFrame(film, showing.seek) : undefined;
    if(at !== undefined) player.seek(at);
    timeline.lightSpans(showing.lit);
    if(at !== undefined) {
      const drawn = this.host.shown(at);
      player.redraw()/*shown again, whether or not the playhead moved*/;
      await drawn.catch(() => undefined);
    }
    if(loop) player.play();
  }
}

// == Util ========================================================================
/** a frame within the film */
const clampFrame = (film: Film, frame: number): number => Math.max(0, Math.min(film.frames.length - 1, Math.round(frame)));
const thousandths = (value: number): number => (Math.round(value * 1000) / 1000) || 0/*never -0*/;
