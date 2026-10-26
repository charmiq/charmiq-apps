import { concat, defer, from, Subject, type Observable } from 'rxjs';

import type { CharmIQAPI } from '../../../shared/charmiq';
import { REVIEW_SURFACE, type Mark, type ReviewSurface } from '../../../shared/review/surface';

import { actorsUnder, extended, namedParts, pictureMark, picturePoint, polylinePoints, shownStrokes, strokeSamples, PICTURE, type PicturePoint } from './review';
import type { StageControl } from './stage-control';
import type { Viewer } from './viewer';

// the picture as a review surface: the studio advertises the review capability (SEE:
// shared/review/surface.ts), and Review, a document's notes, finds it. While Review
// asks for marks, a pointer drag over the picture draws a stroke and leaves it drawn,
// the camera standing still under it (the marks' layer takes the pointer from the
// canvas and the keys walk nowhere); each stroke, as the pointer lifts, is resolved
// (SEE: review.ts) and heard on `marks$`. Marking off takes the strokes away. Review
// shows a note's marks again until the next show: each picture mark is drawn over the
// picture while the studio shows the frame it was drawn on through the view it was
// drawn through, taken off on any other and drawn again on returning. The layer moves
// and resizes nothing; with no Review in the document nothing calls it and it stands
// empty
// ********************************************************************************
// == Types =======================================================================
/** the marks' layer over the picture (an SVG in picture coordinates), its marks shown
 *  again, and the strokes drawn while marking */
export type ReviewElements = Readonly<{ root: SVGSVGElement; shown: SVGGElement; drawn: SVGGElement; }>;

/** a stroke under way: the pointer drawing it, its points and its line */
type Stroke = { /*NOTE: Mutable: each move extends its points*/
  readonly pointer: number;
  points: ReadonlyArray<PicturePoint>;
  readonly line: SVGGElement;
};

// == Class =======================================================================
export class ReviewControl {
  /** whether the picture takes marks */
  private marking = false;
  /** each mark made, as it is made, and those made since marking last turned on, so a
   *  subscriber arriving after a stroke still hears it (SEE: marks$) */
  private readonly made = new Subject<Mark>();
  private since: Mark[] = [];
  private stroke: Stroke | undefined/*none under way*/;
  /** the marks Review last asked shown, drawn as the picture shows their frames */
  private shownMarks: ReadonlyArray<Mark> = [];

  public constructor(private readonly elements: ReviewElements, private readonly studio: HTMLElement, private readonly viewer: Pick<Viewer, 'placementsAt' | 'pictureBounds'>, private readonly stage: Pick<StageControl, 'shown' | 'shownChanged$'>, private readonly standStill: () => void/*the keys' walk stopped*/) {
    const { root } = elements;
    root.addEventListener('pointerdown', event => this.begin(event));
    root.addEventListener('pointermove', event => this.extend(event));
    root.addEventListener('pointerup', event => this.end(event));
    root.addEventListener('pointercancel', event => { if(event.pointerId === this.stroke?.pointer) this.drop(); });
    stage.shownChanged$().subscribe(() => { if(this.shownMarks.length > 0) this.drawShown(); });
  }

  /** whether the picture takes marks: the keys walk nowhere meanwhile */
  public get isMarking(): boolean { return this.marking; }

  /** advertises the review capability; called once from main.ts */
  public advertise(charmiq: CharmIQAPI): void {
    const surface: ReviewSurface = {
      kind: async () => PICTURE,
      marking: async on => this.setMarking(on),
      marks$: () => this.marks$(),
      show: async marks => this.show(marks),
    };
    charmiq.advertise(REVIEW_SURFACE, surface);
  }

  // == Marking ===================================================================
  /** takes marks or stops: either way the strokes drawn and any under way go, and the
   *  marks heard so far are forgotten, so the next note's subscriber (which subscribes
   *  before marking turns on again) hears its own strokes alone */
  private setMarking(on: boolean): void {
    this.since = [];
    if(on) this.standStill();
    this.marking = on;
    this.drop();
    this.elements.drawn.replaceChildren();
    this.studio.classList.toggle('is-marking', on);
  }

  /** each mark made from now on, after those made since marking last turned on: a
   *  subscriber before or after marking turns on hears every stroke once */
  private marks$(): Observable<Mark> { return defer(() => concat(from([...this.since]), this.made)); }

  // .. Stroke ....................................................................
  private begin(event: PointerEvent): void {
    if(!this.marking || (event.button !== 0) || this.stroke) return;
    event.preventDefault()/*no text selection, no focus change*/;
    this.elements.root.setPointerCapture(event.pointerId);
    const points = [this.pointOf(event)];
    const line = strokeElement(this.elements.root.ownerDocument, points);
    this.elements.drawn.append(line);
    this.stroke = { pointer: event.pointerId, points, line };
  }

  private extend(event: PointerEvent): void {
    const stroke = this.stroke;
    if(!stroke || (event.pointerId !== stroke.pointer)) return;
    const points = extended(stroke.points, this.pointOf(event));
    if(points === stroke.points) return/*not moved far enough*/;
    stroke.points = points;
    drawStroke(stroke.line, points);
  }

  /** the stroke finished as the pointer lifts: left drawn, resolved and heard */
  private end(event: PointerEvent): void {
    const stroke = this.stroke;
    if(!stroke || (event.pointerId !== stroke.pointer)) return;
    this.stroke = undefined;
    const mark = this.resolve(stroke.points);
    this.since.push(mark);
    this.made.next(mark);
  }

  /** lets a stroke under way go, undrawn */
  private drop(): void {
    this.stroke?.line.remove();
    this.stroke = undefined;
  }

  /** a stroke as a mark: the frame and view the picture shows, the actors whose shown
   *  pieces it passes over or encloses, and the parts its points and middle show */
  private resolve(stroke: ReadonlyArray<PicturePoint>): Mark {
    const shown = this.stage.shown();
    const { model, placements } = this.viewer.placementsAt(strokeSamples(stroke));
    const actors = shown ? actorsUnder(stroke, shown.actors.map(actor => ({ name: actor.name, boxes: this.viewer.pictureBounds(actor.lines) }))) : [];
    const set = shown?.set ?? model?.set/*the build's set, named when it holds several*/;
    return pictureMark({ ...((shown?.frame !== undefined) ? { frame: shown.frame } : {}), ...((shown?.view !== undefined) ? { view: shown.view } : {}), ...((set !== undefined) ? { set } : {}), actors, parts: model ? namedParts(model, placements) : [], stroke });
  }

  private pointOf(event: PointerEvent): PicturePoint { return picturePoint(event.clientX, event.clientY, this.elements.root.getBoundingClientRect()); }

  // == Show ======================================================================
  /** shows these marks in place of those shown before: none clears them */
  private show(marks: ReadonlyArray<Mark>): void {
    this.shownMarks = marks;
    this.drawShown();
  }

  /** draws the strokes of the marks shown made on the frame and through the view the
   *  picture shows now */
  private drawShown(): void {
    const { root, shown } = this.elements;
    shown.replaceChildren(...shownStrokes(this.shownMarks, this.stage.shown()).map(stroke => strokeElement(root.ownerDocument, stroke)));
  }
}

// == Util ========================================================================
const SVG = 'http://www.w3.org/2000/svg';

/** a stroke's drawing: a dark halo under its line, so it reads over any picture */
const strokeElement = (owner: Document, stroke: ReadonlyArray<PicturePoint>): SVGGElement => {
  const group = owner.createElementNS(SVG, 'g');
  for(const kind of ['review-halo', 'review-line']) {
    const line = owner.createElementNS(SVG, 'polyline');
    line.setAttribute('class', kind);
    group.append(line);
  }
  drawStroke(group, stroke);
  return group;
};

const drawStroke = (group: SVGGElement, stroke: ReadonlyArray<PicturePoint>): void => {
  for(const line of group.children) line.setAttribute('points', polylinePoints(stroke));
};
