import type { Leg } from '../../brick-shared/plant';
import type { PoseBottoms } from '../../brick-shared/rise';

import type { PartLine } from './grid';
import type { Model } from './model';
import { describeIn } from './check';
import { afloat, against, amongItself, stoppedAmongItself, carriedShort, dialed,forwardOf, heldAt, heldOf, heldShort, into, jointsOf, pulled, reachOf, ringAngleAt, ringAround, ringPoint, setDown, settled, soleAt, stepped, stoppedAgainst, stoppedBy, travelOf, turnedTo, valueOf, withValue, type Crossing, type Held, type Pin, type PoseMarks, type Under, FEET } from './pose-gesture';
import { alongOf, bestOf, hullOf, liesOn, type Tried } from './pose-settle';
import { placing, probing } from './probe';
import { shotLines, shotParts, type Cast, type Point, type Shot } from './stage';
import type { Viewer } from './viewer';

// a figure posed by hand on the stage's picture, as a person poses the toy in front of
// them: a limb, the head, the hat, a hand or the torso dragged turns about its joint,
// the part following the pointer (with ⌘ or Ctrl it is dialed by the pointer's straight
// run; Shift settles it on each fifteen degrees, Alt on each whole one); the hips dragged carry the figure across the set,
// clicking onto studs (Alt sets it down free, Shift lifts it); the ring on the ground at
// its feet turns it where it stands; the knob over its head tips it; a foot clicked is
// pinned, and every turn, tip and swing then pivots about it. No gesture passes a piece
// into the set: it stops at the last pose that passes, and a piece already in it is
// drawn red. Each pointer move is solved and drawn here, in the studio's own frame;
// the film that owns the pose is told the figure's shot once a gesture ends (SEE:
// pose-gesture.ts for the solves, stage-control.ts pose)
// ********************************************************************************
// == Constants ===================================================================
/** how far a press may move before it is a drag, and how near a handle a press takes
 *  it (page pixels) */
const DRAGGED = 4, NEAR_HANDLE = 10;
/** how near the ring's own line a press over a part of the figure must be to take the
 *  ring (page pixels): the ring passes before his legs, and a press on a leg takes the leg */
const ON_RING = 4;
/** how near a quarter turn the ring settles on it (degrees), unless held free */
const DETENT = 4;
/** the steps a part dragged or a ring turned settles on (degrees): held with Shift, and
 *  a part's with Alt */
const STEP_COARSE = 15, STEP_FINE = 1;
/** how far over the top of what a figure wears on its head (its head's, bare) the knob
 *  it is tipped by stands, on a stalk from that top (LDU): a short stalk, close */
const KNOB = 9;
/** how near the picture's top the knob may stand before the line that says what the
 *  hands do stands at the picture's foot instead (page pixels): it never lies over a control */
const HINT_CLEAR = 72;
/** how far outside the ring the readout stands, and how far within the picture's
 *  edges it is kept (page pixels) */
const READOUT_OUT = 18, READOUT_WITHIN = 8;
/** how far over the studs it will seat on a figure carried is held (plates), how long
 *  it takes to seat once let go, and how far over its lowest point its hips stand, where
 *  the rod under a figure lifted ends (plates) */
const HOVER = 0.7, SEAT_MILLIS = 260, HIPS_UP = 3.5;
/** the most a drag up the picture carries a figure away for what the same drag across
 *  would carry it aside, and a plate in studs */
const DEPTH_GAIN = 2.5, STUDS_PER_PLATE = 0.4;
/** how steeply the camera looks down (radians) before the ground under the pointer is
 *  read directly: 45 degrees */
const STEEP = Math.PI / 4;
/** how far either way of where a part stands a settle tries its joint (degrees), the
 *  step it tries in, and how far apart the points of its outline are (pixels of the
 *  reference's edges) */
const SETTLE_REACH = 12, SETTLE_STEP = 1, OUTLINE_STEP = 2;
const LEGS: ReadonlyArray<string> = ['leftLeg', 'rightLeg'];
/** the parts each part carries as its joint turns: an arm its hand, the head its hat,
 *  the torso all that stands on it */
const CARRIES: Readonly<Record<string, ReadonlyArray<string>>> = {
  rightArm: ['rightHand'], leftArm: ['leftHand'], head: ['hat'], torso: ['head', 'hat', 'rightArm', 'leftArm', 'rightHand', 'leftHand'],
};
/** the one line over the picture that says what the hands do, for a figure and for
 *  anything else */
const HINT = 'Drag a part to pose it · the hips carry him · the ring turns him · every control is listed at the left';
const HINT_THING = 'Drag it to carry it · the ring turns it · every control is listed at the left';
/** where this browser keeps whether the controls stand open or folded */
const HELP_KEY = 'brick-studio.pose-help';
/** what the line says while a gesture holds the pointer: only what matters to it */
const HINT_HELD = { joint: 'Cmd/Ctrl dials it straight · Shift 15° · Alt 1° · let go to keep it', ring: 'Settles on each quarter turn · Shift 15° · Alt turns freely', carry: 'Clicks onto studs · Alt carries him off them · Shift lifts' } as const;
/** a part as the readout names it, and what each joint's readout is called */
const partLabel = (part: string): string => part.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`);

// == Types =======================================================================
/** what the studio's picture answers a pose: what a point of the page shows and where a
 *  point of the scene shows, where the pointer meets a level or an upright plane, a
 *  built piece's box, and the marks it draws (SEE: Viewer) */
export type PoseScreen = Pick<Viewer, 'under' | 'sight' | 'onLevel' | 'onUpright' | 'heading' | 'pieceBox' | 'crossing' | 'showPoseMarks' | 'outline' | 'setHides' | 'referenceEdges'>;
/** what a pose asks of the stage: the frame drawn with its shots, and the film told
 *  the figure's shot and its pinned foot once a gesture ends */
export type PoseHost = Readonly<{ draw: (shots: ReadonlyArray<Shot>) => void; posed: (shot: Shot, pin: Leg | undefined) => void; }>;
/** the readout beside the part held: its box, what it says, the number typed into it
 *  and the smaller word after it (the way a figure faces, while its ring is turned and
 *  the number is the turn swept); and the picture, which shows the hand that takes a part */
export type PoseElements = Readonly<{ stage: HTMLElement; hint: HTMLElement; help: HTMLDetailsElement/*the controls, shown while an actor is posed: open or folded as this browser keeps it*/; readout: HTMLElement; label: HTMLElement; value: HTMLInputElement; note: HTMLElement; }>;
/** a pointer's event as a pose reads it */
export type PosePointer = Readonly<{ clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; metaKey?: boolean; ctrlKey?: boolean; button?: number; }>;

/** a figure being posed: the frame's shots (the figure's among them), its lines'
 *  place among the frame's, and the set's reads */
type Session = {
  readonly cast: Cast; readonly shots: Shot[]; readonly index: number; readonly offset: number; readonly actor: string; readonly figure: boolean;
  readonly bottoms: PoseBottoms | undefined; readonly feet: Readonly<{ width: number; depth: number; }>;
  readonly inside: (points: ReadonlyArray<Point>) => ReadonlyArray<boolean>; readonly under: Under;
  /** the set's placement each point stands in, and a placement in words */
  readonly placing: (points: ReadonlyArray<Point>) => ReadonlyArray<number | undefined>; readonly named: (placement: number) => string;
  /** which line of the frame's other actors each segment first crosses a surface of
   *  (the figure is held clear of them as of the set), and every line the frame draws
   *  with its actor's name */
  readonly crossing: Crossing; readonly drawn: ReadonlyArray<Readonly<{ line: PartLine; name: string; }>>;
  pin: Pin | undefined;
};
/** a gesture under way: where it was pressed and whether it has moved, and what it
 *  turns (the point of the part held, the far end of what its joint turns and where in
 *  the scene that stood when it was taken) or carries; while a part is dialed, where
 *  the pointer was and how the figure stood when the dial was taken up */
type Gesture = Readonly<{ down: readonly [number, number]; part?: string; was?: ReadonlyArray<PartLine>; }> & { moved: boolean; dial?: Readonly<{ down: readonly [number, number]; shot: Shot; }>; } & (
  | Readonly<{ kind: 'joint'; held: Held; reach?: Held; grab?: Point; joints: ReadonlyArray<string>; since?: number/*where its first joint stood when it was taken*/; }>
  | Readonly<{ kind: 'ring'; about: Point; angle: number; yaw: number; }>
  | Readonly<{ kind: 'carry'; grab: Point; off: Readonly<{ x: number; z: number; }>; height: number; }>
);

// == Class =======================================================================
export class PoseControl {
  private session: Session | undefined;
  private gesture: Gesture | undefined;
  /** the part under the pointer, else the handle under it (named on the picture as
   *  `data-pose-over`), the joint the readout shows and types into, and the studs the
   *  figure last clicked onto */
  private hovered: string | undefined;
  private handle: 'ring' | 'knob' | undefined;
  private pointed: readonly [number, number] | undefined;
  private read: Readonly<{ part: string; joint: string; held?: Held; }> | undefined;
  /** whether a press on any part of the figure carries it (Space held: SEE stage-control.ts) */
  public carrying = false;
  /** what the readout was last stood for: it stands where it was put until it reads another part, or a part is taken again */
  private stood: string | undefined;
  private clicked: ReadonlyArray<Point> | undefined;
  /** how many times the figure has seated on studs, and whether the seat under way
   *  has landed; where the set stopped the gesture under way; whether it sets the
   *  figure down loose of the studs; the figure's drawings before, as onion skin; and
   *  the lines a settle onto the reference would leave */
  private seated = 0;
  private landed = false;
  /** the lines the frame last drawn shows red, as the marks named them; none drawn yet for the pose begun */
  private flags: string | undefined;
  private stopped: Readonly<{ lines: ReadonlyArray<number>; placements: ReadonlyArray<number>; pieces: ReadonlyArray<number>; own: ReadonlyArray<number>; }> | undefined;
  private loose = false;
  private before: ReadonlyArray<PartLine> = [];
  private settling: ReadonlyArray<PartLine> | undefined;
  private suggested: Readonly<{ joint: string; value: number; }> | undefined;
  /** the latest pointer move not yet drawn: one solve a frame, the newest */
  private pending: PosePointer | undefined;

  public constructor(private readonly screen: PoseScreen, private readonly host: PoseHost, private readonly elements?: PoseElements) {
    // the controls open the first time, then as this browser last left them
    if(elements) {
      try { elements.help.open = localStorage.getItem(HELP_KEY) !== 'folded'; } catch { elements.help.open = true/*storage can be absent or refused*/; }
      elements.help.addEventListener('toggle', () => { try { localStorage.setItem(HELP_KEY, elements.help.open ? 'open' : 'folded'); } catch { /*storage can be absent or refused*/ } });
    } /* else -- no page to show them on */
    elements?.value.addEventListener('change', () => this.typed());
    elements?.value.addEventListener('keydown', event => { if(event.key === 'Enter') { this.typed(); elements.stage.focus({ preventScroll: true }); } event.stopPropagation()/*a number typed is no key of the pose's*/; });
  }

  // == Session ===================================================================
  /** whether an actor is posed, and which */
  public get actor(): string | undefined { return this.session?.actor; }

  /** the figure's shot as it stands, while one is posed */
  public get shot(): Shot | undefined { return this.session?.shots[this.session.index]; }

  /** hands an actor of a frame to the person: the frame's `shots` on `set`, the actor
   *  its `actor`, its `pin` its pinned foot. A pose under way starts again from them */
  public begin(cast: Cast, set: Model, shots: ReadonlyArray<Shot>, actor: string, figure: boolean, bottoms: PoseBottoms | undefined, pin: Leg | undefined): void {
    const index = shots.findIndex(shot => shot.name === actor), offset = shotLines(cast, shots.slice(0, index)).length;
    const probe = probing(set);
    if(this.session?.actor !== actor) [this.read, this.hovered] = [undefined, undefined]/*another figure: nothing of it held yet*/;
    this.session = {
      cast, shots: [...shots], index, offset, actor, figure, bottoms, feet: FEET,
      inside: points => probe(points, [], []).points.map(part => part !== null),
      under: ground => { const { grounds, studded } = probe([], [], [ground]); return grounds[0].map((height, at) => ({ height, studded: studded[0][at] })); },
      placing: placing(set), named: placement => describeIn(set, placement).split(' at ')[0]/*its kind and color; where it stands is drawn*/,
      crossing: segments => this.screen.crossing(segments, { from: offset, count: shotLines(cast, [shots[index]]).length }),
      drawn: shots.flatMap(shot => shotLines(cast, [shot]).map(line => ({ line, name: shot.name }))),
      pin: undefined,
    };
    this.session.pin = pin && { leg: pin, at: soleAt(bottoms, shots[index], pin) };
    [this.gesture, this.pending, this.clicked, this.flags] = [undefined, undefined, undefined, undefined];
    if(this.elements) { this.elements.hint.textContent = figure ? HINT : HINT_THING; this.elements.hint.hidden = false; this.elements.help.hidden = false; }
    this.mark();
  }

  /** draws the frame as the pose stands it again, its marks with it: once the view is
   *  let go to the film's camera, which the frame is drawn through */
  public redraw(): void {
    if(!this.session) return/*none under way*/;
    this.draw(this.session);
    this.mark();
  }

  /** ends the pose: its marks taken down, the picture as the film shows it next */
  public end(): void {
    if(!this.session) return/*none under way*/;
    [this.session, this.gesture, this.pending, this.hovered, this.read, this.clicked, this.stopped, this.settling] = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];
    [this.before, this.loose, this.landed, this.suggested, this.handle] = [[], false, false, undefined, undefined];
    this.screen.showPoseMarks(undefined);
    this.showReadout();
    if(this.elements) { this.elements.stage.style.cursor = ''; delete this.elements.stage.dataset.poseOver; this.elements.hint.hidden = true; this.elements.help.hidden = true; }
  }

  /** lets the pinned foot go, as a click on it does, from wherever the foot is hidden:
   *  told as posed, no foot pinned. Nothing with none pinned */
  public unpin(): void {
    const session = this.session;
    if(!session?.pin || this.gesture) return/*no foot pinned, or a gesture under way*/;
    session.pin = undefined;
    this.host.posed(session.shots[session.index], undefined);
    this.mark();
  }

  // == Pointer ===================================================================
  /** a press on the picture: taken (true) when it lands on the figure posed or one of
   *  its handles, which starts a gesture; any other press is the view's */
  public pointerDown(event: PosePointer): boolean {
    const session = this.session, shot = this.shot;
    if(!session || !shot || ((event.button ?? 0) !== 0)) return false;
    this.answer(false)/*a settle's suggestion is left once the hands move on*/;
    const down = [event.clientX, event.clientY] as const;
    const about = this.pivot(session, shot);
    this.stood = undefined/*a part taken: the readout stands anew*/;
    const hit = this.screen.under(event.clientX, event.clientY), line = (hit?.line ?? -1) - session.offset;
    const parts = shotParts(session.cast, shot), onFigure = !!hit && (line >= 0) && (line < parts.length);
    const grabbed = this.carrying && onFigure/*Space held on him: he is carried, whatever handle lies over him there*/;
    if(!grabbed && this.onRing(about, down, onFigure)) {
      const angle = this.ringAngle(about, down);
      if(angle !== undefined) { this.gesture = { kind: 'ring', down, moved: false, about, angle, yaw: shot.turn.yaw }; this.mark(); return true; }
    } /* else -- not the ring */
    const knob = this.knob(session, shot);
    if(!grabbed && knob && this.nearKnob(session, shot, down)) { this.gesture = { kind: 'joint', down, moved: false, held: knob, joints: ['pitch', 'roll'] }; this.mark(); return true; }

    if(!hit || !onFigure) {
      // off him, within the ring: the disc of light under him carries him, from wherever he is looked at
      const within = this.withinRing(about, down), met = within ? this.screen.onLevel(event.clientX, event.clientY, shot.position.height) : undefined;
      if(!met) return false/*off the figure posed: the view's*/;
      this.gesture = { kind: 'carry', down, moved: false, grab: met, off: { x: shot.position.x - met.x, z: shot.position.z - met.z }, height: shot.position.height };
      this.mark();
      return true;
    } /* else -- on him */
    const part = parts[line];
    // while Space is held any part of him pressed carries him, as his hips do: the way to move him from above. His torso, pressed without it, leans him
    const carries = this.carrying;
    const joints = (session.figure && (part !== undefined) && !carries) ? jointsOf(part) : undefined;
    // what the part's joint turns: the part and what it carries, their copy left where they were and the travel drawn at their far end
    const turns = parts.flatMap((each, index) => ((each === part) || ((part !== undefined) && (each !== undefined) && CARRIES[part]?.includes(each))) ? [index] : []);
    const held = heldOf(session.cast, shot, line, hit.at), reach = joints ? reachOf({ cast: session.cast, shot, bottoms: session.bottoms, pin: session.pin }, held, joints[0], turns, ldraw => this.screen.pieceBox(ldraw)) : held;
    this.gesture = joints
      ? { kind: 'joint', down, moved: false, part, was: shotLines(session.cast, [shot]).filter((_, index) => turns.includes(index)), held, reach, grab: heldAt(session.cast, shot, reach), joints, since: valueOf(shot, joints[0]) }
      : { kind: 'carry', down, moved: false, ...((part !== undefined) ? { part } : {}), grab: hit.at, off: { x: shot.position.x - hit.at.x, z: shot.position.z - hit.at.z }, height: shot.position.height };
    this.mark();
    return true;
  }

  /** the pointer moved: a gesture under way follows it, drawn once a frame; else the
   *  part under it is marked. True while a gesture holds the pointer */
  public pointerMove(event: PosePointer): boolean {
    if(!this.session) return false;
    if(!this.gesture) { this.hover(event); return false; }
    const { down } = this.gesture;
    if(!this.gesture.moved && (Math.hypot(event.clientX - down[0], event.clientY - down[1]) <= DRAGGED)) return true/*a press, so far*/;
    this.gesture.moved = true;
    const waiting = !!this.pending;
    this.pending = event;
    if(waiting) return true/*the frame asked for draws the newest*/;
    const draw = () => { const latest = this.pending; this.pending = undefined; if(latest && this.gesture) this.follow(latest); };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(draw); else draw();
    return true;
  }

  /** the pointer let go: a gesture that moved tells the film the figure's shot; a
   *  press that never moved on a foot pins it, or lets a pinned foot go */
  public pointerUp(event: PosePointer): boolean {
    const session = this.session, gesture = this.gesture;
    if(!session || !gesture) return false;
    if(this.pending) { this.pending = undefined; this.follow(event); }
    this.gesture = undefined;
    const shot = session.shots[session.index];
    if(!gesture.moved) {
      const leg = (session.figure && (gesture.part !== undefined) && LEGS.includes(gesture.part)) ? gesture.part as Leg : undefined;
      if(leg) { session.pin = (session.pin?.leg === leg) ? undefined : { leg, at: soleAt(session.bottoms, shot, leg) }; this.host.posed(shot, session.pin?.leg); }
    } else this.host.posed(shot, session.pin?.leg);
    [this.stopped, this.loose] = [undefined, false];
    if(this.clicked && gesture.moved) this.seat(session); else { this.clicked = undefined; this.mark(); }
    return true;
  }

  // == Internal ==================================================================
  // .. Gestures ..................................................................
  // the gesture under way brought to the pointer: solved, held back at the set, drawn
  private follow(event: PosePointer): void {
    const session = this.session!/*by contract: a gesture under way*/, gesture = this.gesture!/*by contract*/;
    const from = session.shots[session.index], figure = { cast: session.cast, shot: from, bottoms: session.bottoms, pin: session.pin };
    const at = [event.clientX, event.clientY] as const;
    let to: Shot | undefined, keep = (shot: Shot) => settled(figure, shot);
    if(gesture.kind === 'joint') {
      // the point held follows the pointer round its joint; with ⌘ (or Ctrl) the joint is
      // dialed by the pointer's straight run from where the dial was taken up
      const sight = (point: Point) => this.screen.sight(point);
      if((event.metaKey || event.ctrlKey) && (gesture.joints.length === 1)) {
        gesture.dial ??= { down: at, shot: from };
        to = dialed({ ...figure, shot: gesture.dial.shot }, gesture.reach ?? gesture.held, gesture.joints[0], sight, gesture.dial.down, at);
      } else {
        gesture.dial = undefined;
        to = pulled(figure, gesture.held, gesture.joints, sight, at);
      }
      const step = event.shiftKey ? STEP_COARSE : event.altKey ? STEP_FINE : undefined;
      if(step !== undefined) to = stepped(figure, to, gesture.joints, step);
      if(gesture.part !== undefined) this.read = { part: gesture.part, joint: gesture.joints[0], held: gesture.held };
    } else if(gesture.kind === 'ring') {
      // the point of the ring taken stays under the pointer, round the ring as the picture draws it
      const angle = this.ringAngle(gesture.about, at);
      if(angle !== undefined) {
        // from where it stands, the short way round: a ring dragged past half a turn never jumps a whole one
        const yaw = Math.round((from.turn.yaw + turned((gesture.yaw + (angle - gesture.angle)) - from.turn.yaw)) * 10) / 10, quarter = Math.round(yaw / 90) * 90;
        to = turnedTo(figure, event.shiftKey ? Math.round(yaw / STEP_COARSE) * STEP_COARSE : (!event.altKey && (Math.abs(yaw - quarter) <= DETENT)) ? quarter : yaw);
        this.read = { part: 'turn', joint: 'yaw' };
      } /* else -- the ring seen edge on, or behind the camera: where it stands */
    } else {
      keep = shot => shot/*a pinned foot goes where the figure is carried*/;
      to = this.carried(session, gesture, from, event);
      this.read = undefined;
    }
    if(!to) return/*nowhere to go: as it stands*/;
    const boxOf = (ldraw: string) => this.screen.pieceBox(ldraw);
    const count = (shot: Shot) => this.passesInto(session, shot).reduce((total, each) => total + each, 0);
    const standing = session.figure ? count(from) : 0;
    // a figure is held back at the last pose that passes no more of it into anything. A thing (a door on its pin, a crate) goes where it is put: a door turns grazing its own jamb, so what it stands in is shown red and never stops it
    const passes = session.figure ? (shot: Shot) => count(shot) <= standing : () => true;
    // carried across the set, he goes between two levels as a hand lifts him (up, then across); lifted (Shift), straight up
    const { shot: next, past } = ((gesture.kind === 'carry') && !event.shiftKey) ? carriedShort(from, to, passes) : heldShort(from, to, passes, keep);
    // what stopped it: its pieces that first pass in just past where it is held, and the set's parts and the other actors' pieces they meet
    const [bySet, byActors] = past ? [stoppedBy(session.cast, past, next, boxOf, session.placing), stoppedAgainst(session.cast, past, next, boxOf, session.crossing)] : [undefined, undefined];
    const byItself = (past && session.figure) ? stoppedAmongItself(session.cast, past, next, boxOf) : [];
    this.stopped = (bySet && byActors) ? { lines: [...new Set([...bySet.lines, ...byActors.lines, ...byItself])], placements: bySet.placements, pieces: byActors.pieces, own: byItself } : undefined;
    if(gesture.kind === 'carry') { if(next !== to) this.clicked = undefined/*held back short of its studs*/; if(session.pin) session.pin = { ...session.pin, at: soleAt(session.bottoms, next, session.pin.leg) }; }
    this.loose = (gesture.kind !== 'joint') && event.altKey;
    session.shots[session.index] = next;
    this.draw(session);
    this.mark();
  }

  // how far each line a shot draws passes into what it is held clear of: its points in
  // the set's parts, its edges that cross the other actors' surfaces and, for a figure, its own
  // other pieces (`itself`: those it is joined to among them, so they judge a gesture
  // by whether it meets more, and never mark a piece as standing inside something)
  private passesInto(session: Session, shot: Shot, itself = true): ReadonlyArray<number> {
    const boxOf = (ldraw: string) => this.screen.pieceBox(ldraw);
    // a thing's place in the set is judged by its box, which a door's swing or a handle fills falsely: only a figure is judged against the set
    const [set, actors, own] = [session.figure ? into(session.cast, shot, boxOf, session.inside) : shotLines(session.cast, [shot]).map(() => 0), against(session.cast, shot, boxOf, session.crossing), (itself && session.figure) ? amongItself(session.cast, shot, boxOf) : undefined];
    return set.map((count, line) => count + actors[line] + (own?.[line] ?? 0));
  }

  // the frame drawn as the pose stands it: a figure carried over the studs it will
  // seat on held a little over them, until it is let go
  private draw(session: Session, over = this.clicked ? HOVER : 0): void {
    const shot = session.shots[session.index];
    this.host.draw((over > 0) ? session.shots.map((each, index) => (index === session.index) ? { ...shot, position: { ...shot.position, height: shot.position.height + over } } : each) : session.shots);
  }

  // a figure let go over its studs seats: it drops the last of the way, a little past
  // and back, as a toy pressed onto studs settles, and the studs ripple as it lands
  private seat(session: Session): void {
    const started = (typeof performance !== 'undefined') ? performance.now() : 0;
    const step = () => {
      if(this.session !== session) return/*the pose ended, or began again*/;
      const run = (typeof requestAnimationFrame === 'function') ? Math.min(1, (performance.now() - started) / SEAT_MILLIS) : 1;
      // down fast, then a small rebound that dies away
      const over = (run < 0.45) ? HOVER * (1 - Math.pow(run / 0.45, 2)) : HOVER * 0.16 * Math.sin(((run - 0.45) / 0.55) * Math.PI) * (1 - run);
      if((run >= 0.45) && !this.landed) { this.landed = true; this.seated++; this.mark(); }
      this.draw(session, Math.max(0, over));
      if(run < 1) requestAnimationFrame(step); else { this.clicked = undefined; this.landed = false; this.mark(); }
    };
    step();
  }

  // the figure carried by its hips to the pointer: lifted with Shift, else across the
  // level it was taken at and set down on the surface under it
  private carried(session: Session, gesture: Extract<Gesture, { kind: 'carry'; }>, from: Shot, event: PosePointer): Shot | undefined {
    const risen = from.position.height - gesture.height;
    if(event.shiftKey) {
      const up = this.screen.onUpright(event.clientX, event.clientY, { x: from.position.x - gesture.off.x, z: from.position.z - gesture.off.z, height: gesture.grab.height + risen });
      if(!up) return undefined;
      const floor = session.under({ x: from.position.x, z: from.position.z, ...session.feet, yaw: from.turn.yaw }).filter(surface => surface.height <= (from.position.height + 1e-6)).pop()?.height ?? 0;
      this.clicked = undefined;
      return { ...from, position: { ...from.position, height: Math.max(floor, Math.round((gesture.height + (up.height - gesture.grab.height)) * 100) / 100) } };
    } /* else -- across the set */
    // across the picture he goes with the pointer; up the picture he goes away from the
    // camera, as far as the ground runs under a pointer moved so, but never more than
    // DEPTH_GAIN times as far as across: a camera looking nearly level along the ground
    // would otherwise send him across the set for a hair of the pointer
    const { x, z, down: steep } = this.screen.heading();
    // looked down on steeply, the ground under the pointer is where he goes
    const met = (steep > STEEP) ? this.screen.onLevel(event.clientX, event.clientY, gesture.grab.height + risen) : this.screen.onUpright(event.clientX, event.clientY, gesture.grab);
    if(!met) return undefined;
    const away = (steep > STEEP) ? 0 : ((met.height - gesture.grab.height) * STUDS_PER_PLATE) * Math.min(DEPTH_GAIN, 1 / Math.max(Math.tan(steep), 1e-6));
    const to = { x: gesture.off.x + met.x + (x * away), z: gesture.off.z + met.z + (z * away) };
    const down = setDown(from, { x: Math.round(to.x * 100) / 100, z: Math.round(to.z * 100) / 100 }, session.feet, session.under, event.altKey);
    this.clicked = down?.clicked ? studsUnder(down.shot, session.feet) : undefined;
    return down?.shot;
  }

  // the part under a pointer that holds nothing: marked, the picture showing the hand
  private hover(event: PosePointer): void {
    const session = this.session!/*by contract*/, shot = session.shots[session.index];
    const hit = this.screen.under(event.clientX, event.clientY), line = (hit?.line ?? -1) - session.offset;
    const parts = shotParts(session.cast, shot);
    const onFigure = !!hit && (line >= 0) && (line < parts.length);
    // what a press here would take (SEE: pointerDown): the ring, the knob, else the part under the pointer
    const handle = this.onRing(this.pivot(session, shot), [event.clientX, event.clientY], onFigure) ? 'ring' : this.nearKnob(session, shot, [event.clientX, event.clientY]) ? 'knob' : undefined;
    const part = (onFigure && !handle) ? (parts[line] ?? 'hips') : undefined;
    if(this.elements) { this.elements.stage.style.cursor = ((part !== undefined) || handle) ? 'grab' : ''; this.elements.stage.dataset.poseOver = part ?? handle ?? ''; }
    const pointed = (handle === 'ring') ? [event.clientX, event.clientY] as const : undefined/*where on the ring: its pips there grow*/;
    if((part === this.hovered) && (handle === this.handle) && !pointed) return/*as marked*/;
    [this.hovered, this.handle, this.pointed] = [part, handle, pointed];
    this.mark();
  }

  // a number typed into the readout: its joint set so, whatever the set says
  private typed(): void {
    const session = this.session, read = this.read, value = Number(this.elements?.value.value);
    if(!session || !read || !Number.isFinite(value)) return/*not a number yet*/;
    const shot = session.shots[session.index];
    session.shots[session.index] = settled({ bottoms: session.bottoms, pin: session.pin }, withValue(shot, read.joint, value));
    this.host.draw(session.shots);
    this.host.posed(session.shots[session.index], session.pin?.leg);
    this.mark();
  }

  // .. Handles ...................................................................
  // what the figure turns about: its pinned foot, else where it stands
  private pivot(session: Session, shot: Shot): Point { return session.pin?.at ?? shot.position; }

  // whether a point of the page lies on the ring about a point, as it is drawn: leaned
  // up toward a camera that looks nearly level
  private onRing(about: Point, [x, y]: readonly [number, number], onFigure: boolean): boolean {
    const round = ringAround(about, this.screen.heading()).flatMap(point => { const seen = this.screen.sight(point); return seen ? [seen] : []; });
    // over a part of the figure only the ring's own line takes the press: the part is taken beside it
    return round.some((spot, index) => (index > 0) && (segmentGap(round[index - 1], spot, x, y) <= (onFigure ? ON_RING : NEAR_HANDLE)));
  }

  // whether a point of the page lies within the ring about a point, as the picture draws it
  private withinRing(about: Point, [x, y]: readonly [number, number]): boolean {
    const round = ringAround(about, this.screen.heading()).flatMap(point => { const seen = this.screen.sight(point); return seen ? [seen] : []; });
    let within = false;
    for(let at=0, before=round.length - 1; at<round.length; before=at++) {
      const [a, b] = [round[at], round[before]];
      if(((a[1] > y) !== (b[1] > y)) && (x < (((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])) + a[0])) within = !within;
    }
    return within;
  }

  // where on the ring about a point a point of the page lies, as the picture draws it
  // (degrees clockwise from north); none while any of it stands behind the camera
  private ringAngle(about: Point, at: readonly [number, number]): number | undefined {
    const round = ringAround(about, this.screen.heading()).map(point => this.screen.sight(point));
    return round.every(seen => seen !== undefined) ? ringAngleAt(round as ReadonlyArray<readonly [number, number]>, at) : undefined;
  }

  // where on the ring about a point a point of the page lies nearest: degrees clockwise from north
  private ringNear(about: Point, [x, y]: readonly [number, number]): number {
    const round = ringAround(about, this.screen.heading());
    const gap = (point: Point) => { const seen = this.screen.sight(point); return seen ? Math.hypot(seen[0] - x, seen[1] - y) : Infinity; };
    const nearest = round.reduce((best, point, index) => (gap(point) < gap(round[best])) ? index : best, 0);
    return Math.round((nearest / (round.length - 1)) * 360) % 360;
  }

  // whether a point of the page lies on the knob over a figure's head
  private nearKnob(session: Session, shot: Shot, [x, y]: readonly [number, number]): boolean {
    const knob = this.knob(session, shot), seen = knob && this.screen.sight(heldAt(session.cast, shot, knob));
    return !!seen && (Math.hypot(seen[0] - x, seen[1] - y) <= NEAR_HANDLE);
  }

  // the knob over a figure's head: a point up the own axis of what it wears on its head
  // (its head, bare), `up` over that piece's top as the studio measures it
  private knob(session: Session, shot: Shot, up = KNOB): Held | undefined {
    if(!session.figure) return undefined;
    const parts = shotParts(session.cast, shot), line = parts.includes('hat') ? parts.indexOf('hat') : parts.indexOf('head');
    if(line < 0) return undefined;
    const top = this.screen.pieceBox(shotLines(session.cast, [shot])[line].ldraw)?.min[1] ?? 0/*a piece not measured: its own origin*/;
    return { line, own: [0, top - up, 0] };
  }

  // .. Marks .....................................................................
  // the figure's marks as it stands, and its readout
  private mark(): void {
    const session = this.session;
    if(!session) return;
    const shot = session.shots[session.index], lines = shotLines(session.cast, [shot]), parts = shotParts(session.cast, shot);
    const gesture = this.gesture, marked = gesture ? gesture.part : this.hovered;
    const linesOf = (part: string) => lines.filter((_, index) => (parts[index] ?? 'hips') === part);
    const counts = this.passesInto(session, shot, false)/*what stands inside the set or another actor: its own joined pieces are no overlap to mark*/;
    const knob = this.knob(session, shot), stalk = this.knob(session, shot, 0);
    const pivot = this.pivot(session, shot), stopped = this.stopped;
    const gap = afloat(shot, session.feet, session.under);
    const figure = { cast: session.cast, shot, bottoms: session.bottoms, pin: session.pin };
    const travel = ((gesture?.kind === 'joint') && gesture.moved && (gesture.joints.length === 1)) ? travelOf(figure, gesture.reach ?? gesture.held, gesture.joints[0], gesture.since) : undefined;
    const marks: PoseMarks = {
      ...((marked !== undefined) ? { part: { lines: linesOf(marked), held: !!gesture } } : {}),
      ...((gesture?.was && gesture.moved) ? { was: gesture.was } : {}),
      ...(travel ? { arc: { ...travel, ...((gesture?.kind === 'joint') && gesture.grab ? { from: gesture.grab } : {}) } } : {}),
      // the ring: the point of it he faces; while it is turned, the point taken and where that point has come to (a figure's yaw runs clockwise, as the ring's angles do)
      ring: { at: { ...pivot }, yaw: shot.turn.yaw, front: ringPoint(pivot, forwardOf(session.cast, shot)), over: !gesture && (this.handle === 'ring'), ...((!gesture && (this.handle === 'ring') && this.pointed) ? { near: this.ringNear(pivot, this.pointed) } : {}), held: gesture?.kind === 'ring', ...((gesture?.kind === 'ring') ? { grab: ringPoint(pivot, gesture.angle), now: ringPoint(pivot, gesture.angle + (shot.turn.yaw - gesture.yaw)) } : {}), loose: this.loose },
      ...((knob && stalk) ? { knob: { from: heldAt(session.cast, shot, stalk), to: heldAt(session.cast, shot, knob), over: !gesture && (this.handle === 'knob'), held: (gesture?.kind === 'joint') && (gesture.part === undefined) } } : {}),
      ...(session.pin ? { pin: { at: session.pin.at, lines: linesOf(session.pin.leg) } } : {}),
      ...(this.clicked ? { studs: this.clicked } : {}), seated: this.seated,
      ...((gap !== undefined) ? { rod: { from: { ...shot.position, height: shot.position.height - gap }, to: { ...shot.position, height: shot.position.height + HIPS_UP } } } : {}),
      ...(stopped ? { stopped: { lines: stopped.lines.map(line => lines[line]), placements: stopped.placements, others: stopped.pieces.flatMap(piece => session.drawn[piece] ? [session.drawn[piece].line] : []) } } : {}),
      inside: lines.filter((_, index) => counts[index] > 0), into: session.figure ? counts.flatMap((count, index) => (count > 0) ? [session.offset + index] : []) : []/*a thing is one piece: red, it would be red whole for a hand through it*/,
      ...(this.settling ? { preview: this.settling } : {}), ...((this.before.length > 0) ? { before: this.before } : {}),
    };
    this.screen.showPoseMarks(marks);
    // the pieces that pass into something are drawn red by the frame drawn next (SEE: Viewer#showPoseMarks): as they change, the frame is drawn again, so none stays red from the pose or the actor before
    const flags = (marks.into ?? []).join();
    if(flags !== this.flags) { this.flags = flags; this.draw(session); }
    this.showReadout();
    // what the line says: what stops him, named, while the set does; else what the hands do
    // what stopped him, in words: another actor by its name, a part of the set by its kind and color, a piece of his own by its name (the one he is not holding)
    const ownPart = stopped?.own.map(line => parts[line] ?? 'hips').find(part => (part !== gesture?.part) && !((gesture?.part !== undefined) && CARRIES[gesture.part]?.includes(part)));
    const stopper = !stopped ? undefined : session.drawn[stopped.pieces[0]] ? session.drawn[stopped.pieces[0]].name : (stopped.placements.length > 0) ? `the ${session.named(stopped.placements[0])}` : ownPart ? `his ${partLabel(ownPart)}` : undefined;
    if(!this.suggested) this.say(stopper ? `Stopped by ${stopper}` : gesture ? HINT_HELD[gesture.kind] : undefined);
    // the line stands at the picture's foot while the knob stands where it would lie
    const top = this.elements?.stage.getBoundingClientRect().top ?? 0, knobSeen = knob && this.screen.sight(heldAt(session.cast, shot, knob));
    this.elements?.hint.classList.toggle('is-low', !!knobSeen && ((knobSeen[1] - top) < HINT_CLEAR));
  }

  // == Settle ====================================================================
  /** settles the part last held onto the reference picture: its one joint tried a
   *  little either way of where it stands, and the angle whose outline lies best on the
   *  picture's edges shown as a suggestion, the part where it would stand, for the
   *  person to take (SEE: answer) or leave. Says why when there is nothing to settle */
  public settle(): string | undefined {
    const session = this.session, read = this.read, reference = this.screen.referenceEdges();
    if(!session || this.gesture) return undefined/*not now*/;
    if(!read?.held) return this.say('Drag a part first: the part last held is the one settled');
    if(!reference) return this.say('Lay a reference picture first: a part settles onto its edges');
    const shot = session.shots[session.index], parts = shotParts(session.cast, shot), stands = valueOf(shot, read.joint);
    const posedAt = (value: number) => settled({ bottoms: session.bottoms, pin: session.pin }, withValue(shot, read.joint, value));
    const linesAt = (value: number) => shotLines(session.cast, [posedAt(value)]).filter((_, index) => parts[index] === read.part);
    // the part's outline at an angle: the hull of its points the picture shows, the set hiding none of them
    const scoreAt = (value: number) => {
      const seen = linesAt(value).flatMap(line => this.screen.outline(line)).filter(point => !this.screen.setHides(point)).flatMap(point => { const at = this.screen.sight(point); return at ? [reference.spot(at[0], at[1])] : []; });
      return liesOn(reference.edges, alongOf(hullOf(seen), OUTLINE_STEP));
    };
    const tried: Tried[] = [];
    for(let offset=-SETTLE_REACH; offset<=SETTLE_REACH; offset+=SETTLE_STEP) tried.push({ value: stands + offset, score: scoreAt(stands + offset) });
    const best = bestOf(tried, stands);
    if(!best) return this.say(`The ${partLabel(read.part)} lies as well on the reference as any angle near it`);
    this.suggested = { joint: read.joint, value: Math.round(best.value * 10) / 10 || 0 };
    this.settling = linesAt(best.value);
    this.mark();
    return this.say(`Settle the ${partLabel(read.part)} at ${this.suggested.value}° (it stands at ${Math.round(stands * 10) / 10 || 0}°): Enter takes it, Escape leaves it`);
  }

  /** takes or leaves a settle's suggestion; false when none stands */
  public answer(take: boolean): boolean {
    const session = this.session, suggested = this.suggested;
    if(!session || !suggested) return false;
    [this.suggested, this.settling] = [undefined, undefined];
    if(take) {
      session.shots[session.index] = settled({ bottoms: session.bottoms, pin: session.pin }, withValue(session.shots[session.index], suggested.joint, suggested.value));
      this.host.draw(session.shots);
      this.host.posed(session.shots[session.index], session.pin?.leg);
    } /* else -- left where the person put it */
    this.say(undefined);
    this.mark();
    return true;
  }

  // what the line over the picture says: a word about a settle, else what the hands do
  public say(text: string | undefined): string | undefined {
    if(this.elements && this.session) this.elements.hint.textContent = text ?? (this.session.figure ? HINT : HINT_THING);
    return text;
  }

  /** the figure's drawings before the frame posed, drawn with it as onion skin: each
   *  its lines; none takes them down */
  public showBefore(before: ReadonlyArray<PartLine>): void {
    if((before.length < 1) && (this.before.length < 1)) return/*none drawn, none to draw*/;
    this.before = before;
    this.mark();
  }

  // the readout beside the part last held: its name and its angle, typed into
  private showReadout(): void {
    const elements = this.elements, session = this.session, read = this.read;
    if(!elements) return/*no readout to show*/;
    const shot = session?.shots[session.index];
    const seen = (session && shot && read) ? this.screen.sight(read.held ? heldAt(session.cast, shot, read.held) : this.pivot(session, shot)) : undefined;
    elements.readout.hidden = !seen;
    if(!seen || !session || !shot || !read) { this.stood = undefined; return; }
    elements.label.textContent = partLabel(read.part);
    // while the ring is turned: the turn swept since it was taken, and after it the way he faces
    const gesture = this.gesture, stands = Math.round(valueOf(shot, read.joint) * 10) / 10 || 0;
    const swept = (gesture?.kind === 'ring') ? Math.round((shot.turn.yaw - gesture.yaw) * 10) / 10 || 0 : undefined;
    elements.note.hidden = swept === undefined;
    elements.note.textContent = (swept === undefined) ? '' : `facing ${stands.toFixed(1)}°`;
    if(elements.value.ownerDocument.activeElement !== elements.value) elements.value.value = (swept ?? stands).toFixed(1)/*always to the tenth, so it keeps its width; signed: a number's box takes no plus*/;

    // it stands where it was put for the part it reads, and stays there while the part
    // moves: outside the ring, on the side the part is on, level with the part as it
    // was taken, within the picture
    const reads = `${read.part}:${read.joint}`;
    if(this.stood === reads) return/*as it stands*/;
    this.stood = reads;
    const box = elements.readout.parentElement?.getBoundingClientRect(), [left, top] = [box?.left ?? 0, box?.top ?? 0];
    const pivot = this.pivot(session, shot), middle = this.screen.sight(pivot) ?? seen;
    const round = ringAround(pivot, this.screen.heading()).flatMap(point => { const spot = this.screen.sight(point); return spot ? [spot[0]] : []; });
    const [west, east] = (round.length > 0) ? [Math.min(...round), Math.max(...round)] : [middle[0], middle[0]];
    const { offsetWidth: width, offsetHeight: height } = elements.readout;
    const before = !!read.held && (seen[0] < middle[0]);
    const within = (value: number, most: number) => Math.max(READOUT_WITHIN, Math.min(value, most - READOUT_WITHIN));
    const x = before ? (west - left) - READOUT_OUT - width : (east - left) + READOUT_OUT;
    // no room on its side of the ring: the other side
    const fits = (at: number) => !box || ((at >= READOUT_WITHIN) && ((at + width) <= (box.width - READOUT_WITHIN)));
    const other = before ? (east - left) + READOUT_OUT : (west - left) - READOUT_OUT - width;
    elements.readout.style.left = `${box ? within(fits(x) ? x : fits(other) ? other : x, box.width - width) : x}px`;
    elements.readout.style.top = `${box ? within((seen[1] - top) - (height / 2), box.height - height) : seen[1] - top}px`;
  }
}

// == Util ========================================================================
/** how far a point lies from a segment (pixels) */
const segmentGap = (from: readonly [number, number], to: readonly [number, number], x: number, y: number): number => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]], length = (dx * dx) + (dy * dy);
  const share = (length > 0) ? Math.max(0, Math.min(1, (((x - from[0]) * dx) + ((y - from[1]) * dy)) / length)) : 0;
  return Math.hypot(x - (from[0] + (dx * share)), y - (from[1] + (dy * share)));
};

/** an angle turned through, the short way round (degrees, -180 to 180) */
const turned = (angle: number): number => ((((angle + 180) % 360) + 360) % 360) - 180;

/** the middle of each stud under a figure's feet, clicked onto studs at a quarter turn */
const studsUnder = (shot: Shot, feet: Readonly<{ width: number; depth: number; }>): ReadonlyArray<Point> => {
  const quarter = (((Math.round(shot.turn.yaw / 90) % 2) + 2) % 2) === 1;
  const [across, along] = quarter ? [feet.depth, feet.width] : [feet.width, feet.depth];
  const studs: Point[] = [];
  for(let x=0; x<across; x++) for(let z=0; z<along; z++) studs.push({ x: (shot.position.x - (across / 2)) + x + 0.5, z: (shot.position.z - (along / 2)) + z + 0.5, height: shot.position.height });
  return studs;
};
