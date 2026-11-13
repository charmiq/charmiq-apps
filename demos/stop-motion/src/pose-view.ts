import type { Leg, Posed } from '../../brick-shared/plant';
import type { PoseBottoms } from '../../brick-shared/rise';

import { channelAt, secondFrames, type Film, type FilmFrame } from './film';
import { element } from './gait-view';
import { contactOf, draftFrom, draftKey, draftOf, filmedOf, keyOn, onionReach, plantedOn, unposed, type Draft, POSED } from './pose-draft';
import type { Point } from './recorder';
import { type ReferenceAt, type ReferenceLook, DEFAULT_LOOK } from './pose-reference';

// the Pose mode: one figure posed at one frame against a reference picture, in a strip
// over the timeline, which stays: its rows and keys find the frame posed, and it scrubs
// and steps as ever. The hands are on the film's picture: the studio is handed the
// figure where the film stands it at the frame, and the person poses it there by hand
// (a limb dragged, the figure carried and clicked onto studs, turned by its ring, a
// foot pinned: SEE Brick Studio's pose). What they pose comes back as the draft, drawn
// on the studio and written nowhere. Enter (or Write the key) writes the draft into
// the scene as the frame's key (SEE: scene-edit.ts rekey, pose-draft.ts draftKey) and
// the film the scene makes shows it; Escape (or Back to the film) leaves with nothing
// written. Here stand only what the picture cannot carry: the actor posed, the key the
// frame holds, the reference pictures picked from the Drive and how they lie over the
// stage, the onion skin, and a drawer of the exact values, each typed for a number the
// hand cannot find. A frame holding no key starts from the key before it; Ctrl-Z undoes
// the draft's last change and Shift-Ctrl-Z does it again. The mode poses an actor cast
// `click: false`, which stands exactly where its keys place it
// ********************************************************************************
// == Constants ===================================================================
/** the step a typed value takes: a place in studs, a height in plates, an angle in
 *  degrees */
const STEP = { place: 0.05, height: 0.1, angle: 0.5 } as const;
/** the values posed, in groups: each its channel, what it is called and its kind */
const GROUPS: ReadonlyArray<readonly [string, ReadonlyArray<readonly [channel: string, label: string, kind: keyof typeof STEP]>]> = [
  ['Place', [['x', 'x · east', 'place'], ['z', 'z · north', 'place'], ['height', 'height · up', 'height']]],
  ['Turn', [['yaw', 'yaw', 'angle'], ['pitch', 'pitch', 'angle'], ['roll', 'roll', 'angle']]],
  ['Pose', [['pose.head', 'head', 'angle'], ['pose.hat', 'hat', 'angle'], ['pose.leftArm', 'left arm', 'angle'], ['pose.rightArm', 'right arm', 'angle'], ['pose.leftLeg', 'left leg', 'angle'], ['pose.rightLeg', 'right leg', 'angle'], ['pose.lean', 'lean', 'angle'], ['pose.leftWrist', 'left wrist', 'angle'], ['pose.rightWrist', 'right wrist', 'angle']]],
];
/** the values that place a figure: what a pinned foot solves */
const PLACE: ReadonlyArray<string> = ['x', 'z', 'height'];
/** how far a value stands from the film's before it is a draft */
const DRAFTED = 1e-9;
/** how many times a pose left is tried to be written before it is given up, and how
 *  long after one try the next comes (milliseconds) */
const KEEP_TRIES = 5, KEEP_AGAIN_MILLIS = 400;
const NO_REFERENCE = 'No reference';

// == Types =======================================================================
/** what the mode asks of Stop Motion: an actor handed to the studio to pose at a frame
 *  as the draft stands it, its pinned foot named (no values: the pose ended, the film's
 *  own frame again), the draft's values written into the scene as the frame's key
 *  (undefined once the scene holds it, else why not), a frame sought (by its index, the
 *  film paused) or stepped to (frames on, back when less than 0), the film shown again,
 *  the onion skin drawn, reference pictures picked from the Drive or removed, how many
 *  frames each picture of a run stands for, and how the reference lies over the stage */
/** an actor left as posed while its key is written: its draft's values, which the
 *  picture draws it by until the film is made again with the key in it */
export type Standing = Readonly<{ actor: string; values: Draft; film: Film | undefined/*the film it was left on: one made since shows the key itself*/; }>;
export type PoseHost = Readonly<{
  pose: (actor: string, index: number, values: Draft | undefined, pin?: Leg, standing?: ReadonlyArray<Standing>) => void;
  write: (actor: string, index: number, values: Draft) => Promise<string | undefined>;
  seek: (index: number) => void; step: (delta: number) => void; close: () => void;
  onion: (skin: Readonly<{ actor: string; before: number; }> | undefined) => void;
  pickReference: () => void; removeReference: () => void; every: (frames: number) => void; look: (look: ReferenceLook) => void;
}>;
/** the draft as it stood: its values and its pinned foot */
type Stood = Readonly<{ values: Draft; pinned: PoseView['pinned']; }>;

// == Pose View ===================================================================
export class PoseView {
  // .. Elements ..................................................................
  private readonly actorSelect: HTMLSelectElement;
  private readonly keyNote: HTMLElement;
  private readonly note: HTMLElement;
  private readonly writeButton: HTMLButtonElement;
  private readonly referenceName: HTMLElement;
  private readonly everyField: HTMLInputElement;
  private readonly everyLabel: HTMLElement;
  private readonly opacity: HTMLInputElement;
  private readonly viewSelect: HTMLSelectElement;
  private readonly removeButton: HTMLButtonElement;
  private readonly numbers = new Map<string, HTMLInputElement>();
  private readonly pinnedNote: HTMLElement;
  private readonly onionButton: HTMLButtonElement;

  // .. State .....................................................................
  /** the film shown, the actor posed and the frame shown */
  private film: Film | undefined/*none yet*/;
  private actor: string | undefined/*no actor in the film*/;
  private shown = 0;
  private playing = false;
  /** the drafts left that are still to be written, in the order they were left, and
   *  whether one is being written */
  private readonly kept: Array<Readonly<{ actor: string; index: number; key: Draft; }> & { tries: number; }> = [];
  private keeping = false;
  /** the draft: where its values started at the frame, and as posed since */
  private started: Draft = {};
  private values: Record<string, number> = {};
  /** where the film stands the actor at the frame shown: a draft is whatever differs */
  private filmed: Draft = {};
  /** the foot pinned, and where its contact holds, while one is: the studio pivots the
   *  figure about it, and a value typed solves its place about it; what the stage
   *  measures the figure's rise from */
  private pinned: Readonly<{ leg: Leg; at: Point; }> | undefined;
  private bottoms: PoseBottoms | undefined;
  /** the actors that click onto studs and those that are figures, once the stage has said (SEE: setCast) */
  private clicks: ReadonlySet<string> | undefined;
  private figures: ReadonlySet<string> | undefined;
  /** the draft as it stood when its key was last written into the scene, on the drawing in hand */
  private writtenAs: Draft | undefined;
  /** the actors left as posed on the frame shown, their keys still being written */
  private standing: ReadonlyArray<Standing> = [];
  /** the draft as it stood before each change, to undo, and after each undone, to do
   *  again */
  private undone: Stood[] = [];
  private redone: Stood[] = [];
  /** how many drawings before the frame the studio draws as onion skin */
  private onion = 0;
  private skinned = false;
  /** how the reference lies over the stage */
  private look: ReferenceLook = DEFAULT_LOOK;

  public constructor(private readonly root: HTMLElement, private readonly host: PoseHost) {
    root.replaceChildren();
    const head = element('header', 'pose-head', root);
    element('span', 'eyebrow', head).textContent = 'Pose of';
    this.actorSelect = element('select', 'pose-actor', head);
    this.actorSelect.setAttribute('aria-label', 'The actor posed');
    this.actorSelect.addEventListener('change', () => { this.choose(this.actorSelect.value); this.actorSelect.blur()/*chosen: Space pressed next is the pose's, never the chooser opened again*/; });
    this.keyNote = element('span', 'pose-key', head);
    this.pinnedNote = element('span', 'pose-pinned', head);
    this.pinnedNote.setAttribute('role', 'status');
    this.note = element('span', 'pose-note', head);
    this.note.setAttribute('role', 'status');
    // the drawings before the frame, drawn on the studio: two, one, none
    this.onionButton = element('button', 'tag tag--plain pose-onion', head);
    this.onionButton.type = 'button';
    this.onionButton.title = 'Draw the drawings before this frame on the studio: two, one, none';
    this.onionButton.addEventListener('click', () => { this.onion = (this.onion + 2) % 3; this.showOnion(); this.tellOnion(); });
    this.showOnion();
    this.writeButton = element('button', 'tag tag--yellow pose-write', head);
    this.writeButton.type = 'button';
    this.writeButton.textContent = 'Write the key';
    this.writeButton.title = 'Write the pose into the scene as this frame\'s key (Enter)';
    this.writeButton.addEventListener('click', () => void this.write());

    // the reference pictures: picked from the Drive, the frames each stands for, and
    // how they lie over the stage
    const reference = element('div', 'pose-references', root);
    const pick = element('button', 'tag tag--plain pose-reference', reference);
    pick.type = 'button';
    pick.textContent = 'Reference…';
    pick.title = 'Lay a picture from your Drive over the studio, to pose against: the pictures after it in its folder follow the film from this frame';
    pick.addEventListener('click', () => this.host.pickReference());
    this.referenceName = element('span', 'pose-reference-name', reference);
    this.referenceName.textContent = NO_REFERENCE;
    this.everyLabel = element('label', 'pose-look pose-every', reference);
    element('span', 'eyebrow', this.everyLabel).textContent = 'a picture every';
    this.everyField = element('input', 'pose-value', this.everyLabel);
    Object.assign(this.everyField, { type: 'number', min: '1', max: '48', step: '1', value: '1' });
    this.everyField.setAttribute('aria-label', 'How many frames each reference picture stands for');
    element('span', 'eyebrow', this.everyLabel).textContent = 'frames';
    this.everyField.addEventListener('change', () => { const frames = Number(this.everyField.value); if(Number.isInteger(frames) && (frames >= 1)) this.host.every(frames); });
    const strength = element('label', 'pose-look', reference);
    element('span', 'eyebrow', strength).textContent = 'opacity';
    this.opacity = element('input', 'pose-opacity', strength);
    Object.assign(this.opacity, { type: 'range', min: '0', max: '1', step: '0.05' });
    this.opacity.addEventListener('input', () => this.relook({ opacity: Number(this.opacity.value) }));
    this.viewSelect = element('select', 'pose-view', reference);
    this.viewSelect.setAttribute('aria-label', 'How the reference shows');
    this.viewSelect.replaceChildren(...([['over', 'Over the stage'], ['difference', 'Where they differ']] as const).map(([value, textContent]) => Object.assign(document.createElement('option'), { value, textContent })));
    this.viewSelect.addEventListener('change', () => this.relook({ view: (this.viewSelect.value === 'difference') ? 'difference' : 'over' }));
    this.removeButton = element('button', 'tag tag--plain pose-reference-remove', reference);
    this.removeButton.type = 'button';
    this.removeButton.textContent = 'Remove';
    this.removeButton.addEventListener('click', () => this.host.removeReference());

    // the exact values, closed until asked for: a number typed where the hand cannot find it
    const drawer = element('details', 'pose-exact', root);
    element('summary', 'eyebrow', drawer).textContent = 'Exact values';
    const body = element('div', 'pose-body', drawer);
    for(const [title, values] of GROUPS) {
      const group = element('div', 'pose-group', body);
      element('p', 'eyebrow', group).textContent = title;
      for(const [channel, label, kind] of values) {
        const row = element('label', 'pose-number', group);
        row.dataset.channel = channel;
        element('span', 'eyebrow', row).textContent = label;
        const number = element('input', 'pose-value', row);
        Object.assign(number, { type: 'number', step: String(STEP[kind]) });
        number.setAttribute('aria-label', label);
        number.addEventListener('change', () => { if((number.value !== '') && Number.isFinite(Number(number.value))) this.type(channel, Number(number.value)); });
        this.numbers.set(channel, number);
      }
    }
    // the keys the mode takes, here as over the studio: a field keeps its own
    addEventListener('keydown', event => {
      if(this.root.hidden || !this.film || event.altKey) return;
      const field = (event.target instanceof HTMLInputElement) || (event.target instanceof HTMLSelectElement) || (event.target instanceof HTMLTextAreaElement);
      if(event.ctrlKey || event.metaKey) { if((event.key.toLowerCase() !== 'z') || field) return/*not the mode's, or a field's own undo*/; }
      else if(event.key === 'Enter') { if((event.target instanceof HTMLButtonElement) || field) return/*its own press, or a number typed*/; }
      else if((event.key === 'ArrowLeft') || (event.key === 'ArrowRight')) { if(field) return/*its own keys*/; }
      else if(event.key !== 'Escape') return/*not the mode's*/;
      this.key({ key: (event.ctrlKey || event.metaKey) ? 'z' : event.key, shift: event.shiftKey });
      event.preventDefault();
    });
    this.showLook();
  }

  // == Film ======================================================================
  /** the film shown: its actors, and the one posed where the frame shown stands it */
  public setFilm(film: Film | undefined): void {
    this.film = film;
    this.settleStanding();
    const actors = film?.scene.actors ?? [];
    this.actorSelect.replaceChildren(...actors.map(actor => Object.assign(document.createElement('option'), { value: actor.name, textContent: actor.name })));
    this.actor = actors.some(actor => actor.name === this.actor) ? this.actor : (actors.find(actor => this.refusal(actor) === undefined) ?? actors[0])?.name;
    if(this.actor !== undefined) this.actorSelect.value = this.actor;
    const frames = Math.max(0, (film?.frames.length ?? 1) - 1), posed = this.recorded;
    // a draft the person changed stands as the film is made again under it (a key written a frame back, the scene edited): only what it is measured against is read anew
    const stands = !this.root.hidden && this.isChanged && (this.shown <= frames) && !!posed && (this.refusal(posed) === undefined);
    this.shown = Math.min(this.shown, frames);
    if(stands) this.remeasure(); else this.reload();
    void this.writeKept()/*the film made again: the next pose left is written on it*/;
  }

  /** the frame shown: the draft starts again from where the film stands the actor on
   *  it. A draft changed on the frame before is kept: written as that frame's key as
   *  the frame is left (stepped, scrubbed or sought from), and said so; the drawing
   *  after, holding no key, then starts from it */
  public setFrame(frame: FilmFrame | undefined): void {
    const index = frame?.index ?? 0;
    if(index === this.shown) return/*the frame posed*/;
    if(this.playing) { this.shown = index; return/*the film plays on: posed afresh once it stops*/; }
    const left = this.left();
    this.shown = index;
    this.standing = []/*another frame: its own drawing*/;
    if(!this.root.hidden) this.reload()/*hidden, the film plays on: posed afresh once shown*/;
    if(left) this.keep(left);
  }

  /** whether the film plays: playing, the figure is let go (a draft changed kept as its
   *  frame's key first) and the studio shows the film's own frames; stopped, the figure
   *  is handed back at the frame it stops on */
  public setPlaying(playing: boolean): void {
    if(playing === this.playing) return/*as it stands*/;
    const left = playing ? this.left() : undefined;
    this.playing = playing;
    if(this.root.hidden) return/*not posing*/;
    if(!playing) { this.reload(); return; }
    if(this.actor !== undefined) this.host.pose(this.actor, this.shown, undefined/*the film's own frames*/);
    this.tellOnion();
    if(left) this.keep(left);
  }

  /** poses an actor: a draft changed on the actor left is kept as its frame's key */
  public choose(actor: string): void {
    const left = (actor === this.actor) ? undefined : this.left();
    // the actor left stands as posed beside the one taken up: the film shows it so only once it is made again with the key
    this.standing = left ? [...this.standing.filter(each => each.actor !== left.actor), { actor: left.actor, values: { ...this.values }, film: this.film }] : this.standing;
    this.standing = this.standing.filter(each => each.actor !== actor);
    this.actor = actor;
    this.actorSelect.value = actor;
    if(left) this.keep(left);
    this.reload()/*after the note of the key kept: an actor the mode cannot pose says why*/;
  }

  /** shows or hides the mode; hidden, a draft changed is kept as its frame's key (only
   *  Escape leaves one behind: SEE key), the studio's pose ends and the film's frame
   *  shows again */
  public show(on: boolean): void {
    const posing = !this.root.hidden && (this.actor !== undefined), left = on ? undefined : this.left();
    this.root.hidden = !on;
    if(on) this.reload();
    else if(posing) this.host.pose(this.actor!/*by contract: posing*/, this.shown, undefined/*the film's frame again*/);
    if(!on) this.tellOnion()/*no drawing before drawn on the film*/;
    if(left) this.keep(left);
  }

  /** what the stage measures a figure's rise from, as it stages the film: where a
   *  pinned foot's contact stands is read from it */
  public setBottoms(bottoms: PoseBottoms | undefined): void { this.bottoms = bottoms; }

  /** the actors that click onto studs and those that are figures, as the stage says
   *  once the film is staged: one that never clicks is posed as it is cast (SEE:
   *  unposed), and one that is no figure is placed and turned alone, its pose's
   *  numbers resting */
  public setCast(clicks: ReadonlySet<string>, figures: ReadonlySet<string>): void {
    const posed = this.recorded, was = posed && [this.refusal(posed), this.isFigure].join();
    [this.clicks, this.figures] = [clicks, figures];
    if(posed && ([this.refusal(posed), this.isFigure].join() !== was)) this.reload()/*posed after all, or not; its pose's numbers with it*/;
  }

  /** hands the actor to the studio again as the draft stands: once the film is staged
   *  again, which ends the studio's pose */
  public repose(): void { if(!this.root.hidden) this.tell(); }

  // == Posed =====================================================================
  /** the studio's word once a gesture on its picture ends: the actor's shot as posed
   *  by hand, and its pinned foot. It is the draft from now, one change to undo */
  public posed(actor: string, posed: Posed, pin: Leg | null): void {
    const film = this.film, recorded = this.recorded;
    if(this.root.hidden || !film || !recorded || (actor !== this.actor) || this.writeButton.disabled) return/*not the actor posed*/;
    this.remember();
    this.values = { ...draftFrom(film, recorded, this.shown, posed) };
    this.pinned = pin ? { leg: pin, at: contactOf(this.bottoms, this.values, pin, this.twist) } : undefined;
    this.showValues();
    this.note.textContent = '';
  }

  /** a key the mode takes, pressed here or over the studio: Enter writes, Escape
   *  leaves, the arrows step a frame (a second with Shift), z undoes (with Shift, does
   *  again) */
  public key({ key, shift }: Readonly<{ key: string; shift: boolean; }>): void {
    if(this.root.hidden || !this.film) return/*not posing*/;
    if(key === 'Escape') { [this.undone, this.redone] = [[], []]/*the draft left behind: nothing of it kept*/; this.host.close(); }
    else if((key === 'ArrowLeft') || (key === 'ArrowRight')) this.host.step(((key === 'ArrowLeft') ? -1 : 1) * (shift ? secondFrames(this.film.scene.fps) : 1));
    else if(this.writeButton.disabled) return/*nothing posed*/;
    else if(key === 'Enter') void this.write();
    else if(key === 'z') this.undo(shift);
  }

  // == Reference =================================================================
  /** the reference laid over the stage at the frame shown (none: no reference), with
   *  how many frames each picture of its run stands for, or why it is not shown */
  public setReference(shown: ReferenceAt | undefined, refused?: string): void {
    this.referenceName.textContent = refused ?? (shown ? shown.label : NO_REFERENCE);
    this.referenceName.classList.toggle('is-refused', refused !== undefined);
    this.everyLabel.hidden = !shown || (shown.every === undefined);
    if((shown?.every !== undefined) && (document.activeElement !== this.everyField)) this.everyField.value = String(shown.every);
    for(const control of [this.opacity, this.viewSelect, this.removeButton]) control.disabled = !shown;
  }

  /** how the reference lies over the stage, as kept */
  public setLook(look: ReferenceLook): void {
    this.look = look;
    this.showLook();
  }

  /** says a word about the last thing done */
  public say(text: string): void { this.note.textContent = text; }

  // == Internal ==================================================================
  // whether a value stands away from where the film stands it
  private get isDrafted(): boolean { return (this.actor !== undefined) && POSED.some(channel => (this.values[channel] !== undefined) && (Math.abs(this.values[channel] - (this.filmed[channel] ?? 0)) > DRAFTED)); }

  // whether the person changed the draft since the frame started it
  private get isChanged(): boolean { return this.undone.length > 0; }

  // the actor posed, as the scene records it
  private get recorded() { return this.film?.scene.actors.find(actor => actor.name === this.actor); }

  // whether the actor posed is a figure, as the stage says (taken to be until it does)
  private get isFigure(): boolean { return (this.actor === undefined) || (this.figures?.has(this.actor) ?? true); }

  // why an actor cannot be posed, none when it can (SEE: unposed): by whether the stage says it clicks onto studs
  private refusal(actor: Parameters<typeof unposed>[0]): string | undefined { return unposed(actor, this.clicks?.has(actor.name) ?? true); }

  // the draft started again from where the film stands the actor at the frame shown,
  // and handed to the studio; an actor the mode cannot pose says why, its values held
  private reload() {
    const film = this.film, actor = this.recorded;
    const refused = actor ? this.refusal(actor) : 'No actor to pose: the scene casts none';
    this.filmed = (film && actor) ? filmedOf(film, actor, this.shown) : {};
    this.started = (film && actor) ? draftOf(film, actor, this.shown) : {};
    this.values = { ...this.started };
    [this.pinned, this.undone, this.redone, this.writtenAs] = [undefined, [], [], undefined]/*a drawing of its own: nothing pinned, nothing to undo, nothing written*/;
    for(const [channel, number] of this.numbers) {
      number.disabled = (refused !== undefined) || (channel.startsWith('pose.') && !this.isFigure)/*a figure's alone*/;
      if(document.activeElement === number) number.blur()/*a number typed for the actor before: this actor's value shows*/;
    }
    this.writeButton.disabled = refused !== undefined;
    this.showKey();
    if(refused !== undefined) { this.note.textContent = refused; this.note.dataset.state = 'refused'; }
    else if(this.note.dataset.state === 'refused') { this.note.textContent = ''; delete this.note.dataset.state; }
    this.showValues();
    if(!this.root.hidden) this.tell();
    this.tellOnion();
  }

  // the draft as the person changed it, kept while the film is made again under it:
  // where the film stands the actor now and where the draft would start are read anew,
  // the draft and what it can undo stand, and the studio is handed it again
  private remeasure() {
    const film = this.film, actor = this.recorded;
    if(!film || !actor) return/*by contract: a draft of an actor the film casts*/;
    this.filmed = filmedOf(film, actor, this.shown);
    this.started = draftOf(film, actor, this.shown);
    this.showKey();
    this.showValues();
    this.tell();
    this.tellOnion();
  }

  // the frame shown and the key it holds, said
  private showKey() {
    const film = this.film, actor = this.recorded;
    const held = (film && actor) ? keyOn(film, actor, this.shown) : undefined;
    this.keyNote.textContent = !film ? '' : `frame ${this.shown + 1} · ${held ? `its key${(held.line !== undefined) ? ` on line ${held.line}` : ''}` : 'no key yet: one is added'}`;
  }

  // hands the actor to the studio as the draft stands; an actor the mode cannot pose is
  // handed to no one
  private tell() {
    if((this.actor === undefined) || this.playing) return/*no actor in the film, or let go while it plays*/;
    this.host.pose(this.actor, this.shown, this.writeButton.disabled ? undefined : this.values, this.pinned?.leg, this.standing);
  }

  // the draft's values on their numbers, its pinned foot named, and whether it stands
  // away from the film said on the mode for its look
  private showValues() {
    for(const [channel, number] of this.numbers) if(document.activeElement !== number) number.value = shownValue(this.values[channel] ?? 0);
    this.pinnedNote.textContent = this.pinned ? `pinned: ${partLabel(this.pinned.leg)}` : '';
    this.root.dataset.drafted = String(this.isDrafted);
  }

  // the twist the actor's keys give it at the frame shown, which turns it whole
  private get twist(): number {
    const time = this.film?.frames[this.shown]?.time;
    return ((time !== undefined) && this.recorded) ? (channelAt(this.recorded.keys, 'pose.twist', time) ?? 0) : 0;
  }

  // .. Typed .....................................................................
  // a value typed: the draft stood so on the studio, a pinned foot held where it is
  // (the figure's place solved about it) or carried with a place typed
  private type(channel: string, value: number) {
    if((this.actor === undefined) || this.writeButton.disabled) return/*nothing to pose*/;
    this.remember();
    this.values[channel] = value;
    if(this.pinned && PLACE.includes(channel)) this.pinned = { ...this.pinned, at: contactOf(this.bottoms, this.values, this.pinned.leg, this.twist) };
    else if(this.pinned) this.values = { ...plantedOn(this.bottoms, this.values, this.pinned.leg, this.pinned.at, this.twist) };
    this.showValues();
    this.note.textContent = '';
    this.tell();
  }

  // .. Undo ......................................................................
  // keeps the draft as it stands, to come back to: a change of its own
  private remember() {
    this.undone.push({ values: { ...this.values }, pinned: this.pinned });
    this.redone = [];
  }

  // the draft as it stood before its last change (or, again, after it), stood so on
  // the studio
  private undo(again: boolean) {
    const [from, to] = again ? [this.redone, this.undone] : [this.undone, this.redone];
    const last = from.pop();
    if(!last || (this.actor === undefined)) { this.note.textContent = again ? 'Nothing to do again' : 'Nothing to undo'; return; }
    to.push({ values: { ...this.values }, pinned: this.pinned });
    [this.values, this.pinned] = [{ ...last.values }, last.pinned];
    this.showValues();
    this.note.textContent = '';
    this.tell();
  }

  // .. Onion Skin ................................................................
  private showOnion() {
    this.onionButton.textContent = `Onion skin: ${(this.onion < 1) ? 'off' : (this.onion === 1) ? '1 drawing' : `${this.onion} drawings`}`;
    this.onionButton.setAttribute('aria-pressed', String(this.onion > 0));
  }

  // tells the studio the drawings before the frame shown to draw, while the mode shows
  // and its onion skin is on
  private tellOnion() {
    const film = this.film, reach = (film && (this.actor !== undefined) && !this.root.hidden) ? onionReach(film, this.actor, this.shown, this.onion) : 0;
    const skin = (reach > 0) ? { actor: this.actor!/*by contract: reached*/, before: reach } : undefined;
    if(!skin && !this.skinned) return/*none drawn, none to draw*/;
    this.skinned = !!skin;
    this.host.onion(skin);
  }

  // .. Write .....................................................................
  // the draft about to be left, when the person changed it and it holds something to
  // write: its actor, its frame and the key's values
  private left(): Readonly<{ actor: string; index: number; key: Draft; }> | undefined {
    const film = this.film, actor = this.recorded;
    if(this.root.hidden || !film || !actor || this.writeButton.disabled || !this.isChanged) return undefined/*nothing posed*/;
    const written = this.writtenAs;
    if(written && POSED.every(channel => written[channel] === this.values[channel])) return undefined/*written as it stands*/;
    const key = draftKey(film, actor, this.shown, this.values);
    return (Object.keys(key).length > 0) ? { actor: actor.name, index: this.shown, key } : undefined/*as the scene keys it*/;
  }

  // a draft left is written as its own frame's key, whatever frame shows by now: one
  // at a time, in the order they were left
  private keep(left: NonNullable<ReturnType<PoseView['left']>>) {
    this.kept.push({ ...left, tries: 0 });
    this.note.textContent = `Writing frame ${left.index + 1}'s pose into the scene…`;
    void this.writeKept();
  }

  // writes the first draft kept. A write refused is tried again (the scene may be mid
  // way through the write before it: it is tried once the film is made again, and
  // after a moment), KEEP_TRIES times before it is given up and said
  private async writeKept() {
    const next = this.kept[0];
    if(this.keeping || !next) return/*one at a time, or none left*/;
    this.keeping = true;
    const refused = await this.host.write(next.actor, next.index, next.key).catch((failure: unknown) => (failure instanceof Error) ? failure.message : String(failure));
    this.keeping = false;
    if(refused === undefined) { this.kept.shift(); this.note.textContent = `Frame ${next.index + 1}'s pose is written into the scene`; this.settleStanding(); }
    else if(++next.tries >= KEEP_TRIES) { this.kept.shift(); this.note.textContent = `Frame ${next.index + 1}'s pose could not be written: ${refused}`; }
    /* else -- tried again */
    if(this.kept.length > 0) setTimeout(() => void this.writeKept(), KEEP_AGAIN_MILLIS);
  }

  // an actor left as posed stands by its draft until every key left is written and the film is made again with them: from then the film shows it
  private settleStanding() {
    if((this.kept.length > 0) || this.keeping) return/*a key still to write*/;
    this.standing = this.standing.filter(each => each.film === this.film);
  }

  // the draft written into the scene as the frame's key
  private async write() {
    const film = this.film, actor = this.recorded;
    if(!film || !actor || this.writeButton.disabled) return/*nothing to write*/;
    const key = draftKey(film, actor, this.shown, this.values);
    if(Object.keys(key).length < 1) { this.note.textContent = 'Nothing is changed: the frame stands as the scene keys it'; return; }
    this.note.textContent = 'Writing the key into the scene…';
    const values = { ...this.values };
    const refused = await this.host.write(actor.name, this.shown, key);
    if(refused === undefined) this.writtenAs = values/*the scene holds it: left as it is, nothing is written again though the film is not made again yet*/;
    this.note.textContent = refused ?? 'Written into the scene';
  }

  // how the reference lies changed: shown, and told
  private relook(change: Partial<ReferenceLook>) {
    this.look = { ...this.look, ...change };
    this.showLook();
    this.host.look(this.look);
  }

  private showLook() {
    this.opacity.value = String(this.look.opacity);
    this.viewSelect.value = this.look.view;
  }
}

// == Drawing =====================================================================
/** a part as the mode names it: `leftLeg` the left leg */
const partLabel = (part: string): string => part.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`);

/** a value as its number shows it: to the thousandth */
const shownValue = (value: number): string => String(Number(value.toFixed(3)) || 0);
