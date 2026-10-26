import type { Observable } from 'rxjs';

// the review capability: an Application a person marks (a surface: Brick Studio's
// picture, Stop Motion's timeline) advertises it, and Review (a document's notes)
// finds every surface by it. While a note is written Review asks each surface to take
// marks, hears each mark as the person makes it, and later asks each surface to show
// a note's marks again. A surface resolves its own marks into its own terms (what lies
// under a stroke, which frames and rows a span covers), so Review keeps and shows
// marks without understanding them, and a new surface needs only to mark and show.
// Methods take positional arguments (SEE: CharmIQAPI.advertise)
// ********************************************************************************
// == Constants ===================================================================
/** the capability a surface advertises and Review discovers */
export const REVIEW_SURFACE = 'charmiq.review-surface';

// == Types =======================================================================
/** what a note points at, made on a surface */
export type Mark = Readonly<{
  /** the kind of surface that made it ('picture', 'timeline') */
  surface: string;
  /** what the mark points at, in a person's words: the note's chip */
  label: string;
  /** the film frames it names: one (a stroke drawn on the frame shown) or a span, first
   *  and last; any surface may go to them (the timeline to a stroke's frame) */
  frames?: Readonly<{ first: number; last: number; }>;
  /** what the surface resolved it to (the frame, the actors and parts under it, the
   *  scene lines driving them), for whoever reads the note: the Agent, the lead agent */
  resolved: Readonly<Record<string, unknown>>;
  /** how the surface that made it shows it again: its own, opaque to Review */
  shown: Readonly<Record<string, unknown>>;
}>;

/** a surface, as Review calls it */
export type ReviewSurface = Readonly<{
  /** the kind of surface it is (a mark's `surface`) */
  kind: () => Promise<string>;
  /** takes marks while `on`, from the person, until told to stop */
  marking: (on: boolean) => Promise<void>;
  /** each mark the person makes on the surface, as it is made */
  marks$: () => Observable<Mark>;
  /** shows these marks: draws those of its own kind, and may go to the frames any of
   *  them names; none clears what it shows */
  show: (marks: ReadonlyArray<Mark>) => Promise<void>;
}>;
