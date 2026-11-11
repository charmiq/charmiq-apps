import type { Leg, Posed } from '../../brick-shared/plant';
import type { PoseBottoms } from '../../brick-shared/rise';

import { channelAt, secondFrames, type Film, type FilmFrame } from './film';
import { element } from './gait-view';
import { contactOf, draftFrom, draftKey, draftOf, filmedOf, keyOn, onionReach, plantedOn, unposed, type Draft, POSED } from './pose-draft';
import type { Point } from './recorder';
import { type ReferenceAt, type ReferenceLook, DEFAULT_LOOK } from './pose-reference';

// the Pose mode: one figure posed at one frame against a reference picture, in the
// timeline's place. The hands are on the film's picture: the studio is handed the
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
const NO_REFERENCE = 'No reference';

// == Types =======================================================================
/** what the mode asks of Stop Motion: an actor handed to the studio to pose at a frame
 *  as the draft stands it, its pinned foot named (no values: the pose ended, the film's
 *  own frame again), the draft's values written into the scene as the frame's key
 *  (undefined once the scene holds it, else why not), a frame sought (by its index, the
 *  film paused) or stepped to (frames on, back when less than 0), the film shown again,
 *  the onion skin drawn, reference pictures picked from the Drive or removed, how many
 *  frames each picture of a run stands for, and how the reference lies over the stage */
export type PoseHost = Readonly<{
  pose: (actor: string, index: number, values: Draft | undefined, pin?: Leg) => void;
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
  private readonly scrub: HTMLInputElement;
  private readonly numbers = new Map<string, HTMLInputElement>();
  private readonly pinnedNote: HTMLElement;
  private readonly onionButton: HTMLButtonElement;

  // .. State .....................................................................
  /** the film shown, the actor posed and the frame shown */
  private film: Film | undefined/*none yet*/;
  private actor: string | undefined/*no actor in the film*/;
  private shown = 0;
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
    this.actorSelect.addEventListener('change', () => this.choose(this.actorSelect.value));
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
    const back = element('button', 'tag tag--plain', head);
    back.type = 'button';
    back.textContent = 'Back to the film';
    back.title = 'Leave without writing (Escape)';
    back.addEventListener('click', () => this.host.close());

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
    // the film's frames, scrubbed: the playhead where it is let go
    this.scrub = element('input', 'pose-scrub', root);
    Object.assign(this.scrub, { type: 'range', min: '0', max: '0', step: '1', value: '0' });
    this.scrub.setAttribute('aria-label', 'Frame');
    this.scrub.addEventListener('input', () => this.host.seek(Number(this.scrub.value)));

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
    const actors = film?.scene.actors ?? [];
    this.actorSelect.replaceChildren(...actors.map(actor => Object.assign(document.createElement('option'), { value: actor.name, textContent: actor.name })));
    this.actor = actors.some(actor => actor.name === this.actor) ? this.actor : (actors.find(actor => unposed(actor) === undefined) ?? actors[0])?.name;
    if(this.actor !== undefined) this.actorSelect.value = this.actor;
    this.scrub.max = String(Math.max(0, (film?.frames.length ?? 1) - 1));
    this.shown = Math.min(this.shown, Math.max(0, (film?.frames.length ?? 1) - 1));
    this.reload();
  }

  /** the frame shown: the draft starts again from where the film stands the actor on
   *  it; a draft left unwritten on the frame before is let go, and said so */
  public setFrame(frame: FilmFrame | undefined): void {
    const index = frame?.index ?? 0;
    if(frame && (document.activeElement !== this.scrub)) this.scrub.value = String(index)/*held where the person scrubs*/;
    if(index === this.shown) return/*the frame posed*/;
    const left = (!this.root.hidden && this.isChanged) ? this.shown : undefined;
    this.shown = index;
    if(!this.root.hidden) this.reload()/*hidden, the film plays on: posed afresh once shown*/;
    if(left !== undefined) this.note.textContent = `Frame ${left + 1}'s pose was not written: Enter writes a pose before stepping on`;
  }

  /** poses an actor */
  public choose(actor: string): void {
    this.actor = actor;
    this.actorSelect.value = actor;
    this.reload();
  }

  /** shows or hides the mode; hidden, a draft is let go, the studio's pose ends and the
   *  film's frame shows again */
  public show(on: boolean): void {
    const posing = !this.root.hidden && (this.actor !== undefined);
    this.root.hidden = !on;
    if(on) this.reload();
    else if(posing) this.host.pose(this.actor!/*by contract: posing*/, this.shown, undefined/*the film's frame again*/);
    if(!on) this.tellOnion()/*no drawing before drawn on the film*/;
  }

  /** what the stage measures a figure's rise from, as it stages the film: where a
   *  pinned foot's contact stands is read from it */
  public setBottoms(bottoms: PoseBottoms | undefined): void { this.bottoms = bottoms; }

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
    if(key === 'Escape') this.host.close();
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

  // the draft started again from where the film stands the actor at the frame shown,
  // and handed to the studio; an actor the mode cannot pose says why, its values held
  private reload() {
    const film = this.film, actor = this.recorded;
    const refused = actor ? unposed(actor) : 'No actor to pose: the scene casts none';
    this.filmed = (film && actor) ? filmedOf(film, actor, this.shown) : {};
    this.started = (film && actor) ? draftOf(film, actor, this.shown) : {};
    this.values = { ...this.started };
    [this.pinned, this.undone, this.redone] = [undefined, [], []]/*a drawing of its own: nothing pinned, nothing to undo*/;
    for(const number of this.numbers.values()) number.disabled = refused !== undefined;
    this.writeButton.disabled = refused !== undefined;
    const held = (film && actor) ? keyOn(film, actor, this.shown) : undefined;
    this.keyNote.textContent = !film ? '' : `frame ${this.shown + 1} · ${held ? `its key${(held.line !== undefined) ? ` on line ${held.line}` : ''}` : 'no key yet: one is added'}`;
    if(refused !== undefined) { this.note.textContent = refused; this.note.dataset.state = 'refused'; }
    else if(this.note.dataset.state === 'refused') { this.note.textContent = ''; delete this.note.dataset.state; }
    this.showValues();
    if(!this.root.hidden) this.tell();
    this.tellOnion();
  }

  // hands the actor to the studio as the draft stands; an actor the mode cannot pose is
  // handed to no one
  private tell() {
    if(this.actor === undefined) return/*no actor in the film*/;
    this.host.pose(this.actor, this.shown, this.writeButton.disabled ? undefined : this.values, this.pinned?.leg);
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
  // the draft written into the scene as the frame's key
  private async write() {
    const film = this.film, actor = this.recorded;
    if(!film || !actor || this.writeButton.disabled) return/*nothing to write*/;
    const key = draftKey(film, actor, this.shown, this.values);
    if(Object.keys(key).length < 1) { this.note.textContent = 'Nothing is changed: the frame stands as the scene keys it'; return; }
    this.note.textContent = 'Writing the key into the scene…';
    const refused = await this.host.write(actor.name, this.shown, key);
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
