import type { AppContentAPI, AppContentChange, AppContentSnapshot, ContentChange } from '../../../shared/charmiq';
import { BuildError } from './build';
import { holdsParts } from './model';

// the build's LDraw text lives in the `model` app-content, and the app-content is
// the truth: the build shows what it holds, whoever changed it. Every edit is
// measured on a snapshot of the app-content and applies only while it is still
// exactly that (a guarded edit), an edit that changes nothing included; on a
// conflict it is measured again on the same app-content as it is now. A deletion
// notice is a reason to check, never proof the app-content is gone: it is gone when
// a read of it by its id finds nothing while the build still shows what was checked.
// Any read's answer applies only while the build still shows what it showed when
// the read began (otherwise the change stream has moved on, and carries the newer
// state). A read that fails is an error, never an absence.
// A document with no app-content named `model` may hold the build under a near name:
// one app-content unnamed, or named `model` up to case and outer spaces, whose text
// holds parts (LDraw pasted by hand). That one is the build, followed and edited by
// its id, its name and text left as they are; once shown it stays the build, parts or
// none, until one named `model` appears. Whether the document holds no build is read,
// never assumed from a stream: its app-contents are listed (snapshots by index) and
// each is known once the change stream names it or a read finds it gone.
// Two collaborators who each find no app-content and add a part create two `model`
// app-contents, both kept when their edits merge. No pair of guarded edits can move
// one build into the other exactly once, so a document holding more than one is a
// conflict: every build is kept and readable, and edits wait until one remains. Two
// app-contents under a near name, neither shown, wait the same way
// SEE: tutorials/03-writing-data for the same pattern, explained
// ********************************************************************************
// == Constants ===================================================================
/** name + selector of the app-content that holds the LDraw text */
const MODEL_NAME = 'model';
const MODEL_SELECTOR = `[name='${MODEL_NAME}']`;

/** how many times an edit is measured again after the app-content changed under it */
const EDIT_ATTEMPTS = 3;
/** how long the change stream may take to name an app-content a listing found: it
 *  answers within a bridge round trip, so one silent past this is not answering */
const NAMING_DEADLINE_MILLIS = 10_000;

/** the refusal on a page opened before guarded edits existed */
const RELOAD = 'This page cannot make safe edits. Reload it to edit the build.';
/** the refusal while the document holds more than one build */
const conflict = (count: number) => `This document holds ${count} builds named ${MODEL_NAME}, made at once by different people. Nothing was changed: edits wait until one build remains. getModel returns each build's text; combine them into one ${MODEL_NAME} app-content in the document and remove the others.`;
/** the refusal while the document holds builds under near names alone, none of them shown */
const ambiguous = (count: number) => `This document holds ${count} builds and none named ${MODEL_NAME}. Nothing was changed: edits wait until one is chosen. getModel returns each build's text; name the one to use ${MODEL_NAME} in the document.`;
/** the refusal when the document's app-contents cannot be listed in time */
const UNREAD = 'The document\'s builds could not be read. Nothing was changed; reload to try again.';

// == Types =======================================================================
/** the app-content as last seen: an older page sees no revision */
type Seen = Readonly<{ id: string; content: string; revision?: string; }>;
/** an app-content as the change stream last named it */
type Known = Readonly<{ id: string; name?: string; content: string; revision?: string; }>;

// == Class =======================================================================
export class ContentBridge {
  private seen: Seen | null = null/*no app-content*/;
  private following = false/*changes reach the build once the app-content is known*/;
  private onTextChanged: ((text: string) => void) | null = null;
  private onUncertainChanged: ((uncertain: boolean) => void) | null = null;
  /** a check of the app-content shown failed: whether it is still there is unknown
   *  until the app-content's next revision, or its confirmed absence */
  private uncertain = false;
  /** every app-content the change stream named, by id, as last named */
  private readonly known = new Map<string, Known>();
  /** whether each app-content's text holds parts, by id, for the text it was read on */
  private readonly holding = new Map<string, Readonly<{ content: string; holds: boolean; }>>();
  /** told of each app-content the change stream names (SEE: list()) */
  private readonly naming = new Set<() => void>();
  private onBuildsChanged: (() => void) | null = null;

  // == Lifecycle =================================================================
  public constructor(private readonly appContent: AppContentAPI) {}

  /** register the callback for each change to the app-content's text once known */
  public onChange(callback: (text: string) => void): void {
    this.onTextChanged = callback;
  }

  /** register the callback for the build becoming uncertain, or certain again */
  public onUncertain(callback: (uncertain: boolean) => void): void {
    this.onUncertainChanged = callback;
  }

  /** whether the build may no longer be in the document: a check of its app-content
   *  failed, and it is shown as last seen */
  public isUncertain(): boolean { return this.uncertain; }

  /** register the callback for a change to the builds the document holds */
  public onBuilds(callback: () => void): void {
    this.onBuildsChanged = callback;
  }

  /** every build the document holds, by app-content id: more than one is a conflict */
  public builds(): ReadonlyArray<Readonly<{ id: string; ldraw: string; }>> {
    return this.candidates().map(({ id, content }) => ({ id, ldraw: content }));
  }

  /** why edits wait, when the document holds more than one build */
  public conflict(): string | undefined {
    const named = this.named();
    if(named.length > 1) return conflict(named.length);
    const candidates = this.candidates();
    return ((named.length < 1) && (candidates.length > 1)) ? ambiguous(candidates.length) : undefined;
  }

  /** whether this page can make guarded edits (an older page cannot: reload it) */
  public canEdit(): boolean { return (typeof this.appContent.snapshot === 'function'); }

  // ------------------------------------------------------------------------------
  /** follows the app-content and resolves with its text once it is known: the build
   *  the document holds, or its confirmed absence (an empty build). Rejects when the
   *  app-content cannot be read */
  public open(): Promise<string> {
    return new Promise((resolve, reject) => {
      const settle = () => { if(!this.following) { this.following = true; resolve(this.seen?.content ?? ''); } };
      const fail = (failure: unknown) => { if(!this.following) { this.following = true; reject(failure); } };

      // every app-content, named: the build's changes among them
      this.appContent.onChange$().subscribe({
        next: (change: AppContentChange) => this.observe(change),
        error: failure => this.following ? console.error('brick-studio: the build stopped following the document:', failure) : fail(failure),
      });

      // an app-content that does not exist sends no change: read whether there is one
      if(this.appContent.snapshot) this.find().then(settle, fail);
      else this.appContent.get(MODEL_SELECTOR).then(text => { if(!this.seen && text) this.accept({ id: '', content: text }); settle(); }, fail)/*an older page: its text, read once*/;
    });
  }

  // == Edit ======================================================================
  /** applies the edits `measure` makes on the app-content's text, guarded by the
   *  snapshot measured. With no build in the document an app-content is created first
   *  when there is anything to write, and the edits are measured on what it holds. On a
   *  conflict the edits are measured again on the same app-content as it is now;
   *  `measure` throws to refuse. Resolves once the build has the app-content's new text */
  public async edit(measure: (text: string) => ReadonlyArray<ContentChange>): Promise<void> {
    if(!this.appContent.snapshot) throw new BuildError(RELOAD);
    this.refuseConflict();
    let snapshot = this.current();
    if(!snapshot) {
      const existing = await this.find()/*one the build has not seen yet*/;
      this.refuseConflict()/*the listing may find more than one*/;
      if(existing) snapshot = existing;
      else if(measure('').length < 1) return/*no app-content, and nothing to write*/;
      else snapshot = await this.create();
    } /* else -- the app-content as last seen */

    for(let attempt=1; ; attempt++) {
      this.refuseConflict()/*another build may have arrived meanwhile*/;
      const changes = measure(snapshot.content);
      // nothing to change on this text still needs this text to be the app-content's
      if((changes.length < 1) ? await this.isCurrent(snapshot) : await this.apply(changes, snapshot)) break;

      const current = await this.read(byId(snapshot.id), snapshot.id);
      if(!current) throw new BuildError('The build was removed from the document. Nothing was changed.');
      if(attempt >= EDIT_ATTEMPTS) throw new BuildError('The build kept changing while this edit was made. Nothing was changed; try again.');
      snapshot = current;
    }
    await this.reconcile(snapshot.id);
  }

  /** replaces the app-content's whole text on purpose: anything another writer changed
   *  meanwhile is replaced too. Writes the build's own app-content (its name kept), and
   *  creates one named `model` when the document holds no build */
  public async replace(text: string): Promise<void> {
    if(!this.appContent.snapshot) throw new BuildError(RELOAD);
    this.refuseConflict()/*a replacement would make one build pass for all*/;
    const existing = this.current() ?? await this.find();
    this.refuseConflict()/*the listing may find more than one*/;
    if(existing) {
      await this.appContent.set(text, byId(existing.id))/*no name: the app-content keeps its own*/;
      await this.read(byId(existing.id), existing.id);
    } else {
      await this.appContent.set(text, MODEL_SELECTOR, MODEL_NAME);
      await this.read(MODEL_SELECTOR);
    }
  }

  // == Internal ==================================================================
  // -- Builds --------------------------------------------------------------------
  /** the app-contents named `model` */
  private named(): Known[] {
    return [...this.known.values()].filter(entry => entry.name === MODEL_NAME);
  }

  /** the app-contents that are the document's builds: those named `model`, else the
   *  one shown, else those under a near name whose text holds parts */
  private candidates(): Known[] {
    const named = this.named();
    if(named.length > 0) return named;
    const shown = this.seen ? this.known.get(this.seen.id) : undefined;
    if(shown) return [shown]/*the build, parts or none*/;
    return [...this.known.values()].filter(entry => isNearName(entry.name) && this.holdsParts(entry));
  }

  /** the build's app-content: the one shown while it is named `model` (or none is),
   *  else the first named `model`, else the only candidate */
  private chosen(): Known | undefined {
    const named = this.named();
    if(named.length > 0) return named.find(entry => entry.id === this.seen?.id) ?? named[0];
    const candidates = this.candidates();
    return (candidates.length === 1) ? candidates[0] : undefined;
  }

  private holdsParts(entry: Known): boolean {
    const memo = this.holding.get(entry.id);
    if(memo?.content === entry.content) return memo.holds;
    const holds = holdsParts(entry.content);
    this.holding.set(entry.id, { content: entry.content, holds });
    return holds;
  }

  /** takes a change the stream sends: an app-content named, or a deletion notice */
  private observe(change: AppContentChange): void {
    if(change.deleted) { this.confirmKnown(change.id); this.confirm(change.id); return; }
    this.known.set(change.id, { id: change.id, name: change.name, content: change.content, revision: change.revision });
    this.naming.forEach(named => named());
    this.follow(change.id);
  }

  /** shows the build's app-content: its change as the stream sends it (`changed`), or the
   *  app-content now chosen in place of the one shown, as last named. Another
   *  app-content's change never replays the shown one's, which a read may be past. Until
   *  the build is open nothing new is chosen: the stream names app-contents one at a
   *  time, so the first under a near name would pass for the only one before the listing
   *  finds the rest (SEE: find()). Tells the build of the builds the document holds */
  private follow(changed?: string): void {
    const chosen = this.chosen();
    const shown = (chosen?.id === this.seen?.id);
    if(chosen && ((shown && (chosen.id === changed)) || (!shown && this.following))) this.accept(chosen);
    this.onBuildsChanged?.();
  }

  // -- Reads ---------------------------------------------------------------------
  /** the document's build, read: the app-content named `model`, which a read by name
   *  finds; else its app-contents listed and each named (SEE: list()), then the chosen
   *  one read by its id. Null when the document holds none */
  private async find(): Promise<AppContentSnapshot | null> {
    const named = await this.read(MODEL_SELECTOR);
    if(named) return named;
    await this.list();
    const chosen = this.chosen();
    return chosen ? this.read(byId(chosen.id), chosen.id) : null;
  }

  /** lists the document's app-contents by index and resolves once the change stream
   *  has named each, or a read finds it gone: every app-content the document held when
   *  listed is then known. Rejects when the stream names none in time */
  private async list(): Promise<void> {
    const listed = new Set<string>();
    for(let index=0; ; index++) {
      const snapshot = await this.appContent.snapshot!(`[${index}]`);
      if(!snapshot) break;
      listed.add(snapshot.id);
    }

    const pending = new Set([...listed].filter(id => !this.known.has(id)));
    if(pending.size < 1) return;
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (failure?: unknown) => {
        if(done) return;
        done = true;
        clearTimeout(deadline);
        this.naming.delete(check);
        if(failure) reject(failure);
        else resolve();
      };
      const check = () => {
        for(const id of [...pending]) if(this.known.has(id)) pending.delete(id);
        if(pending.size < 1) finish();
      };
      const deadline = setTimeout(() => {
        console.error(`brick-studio: the change stream named none of ${pending.size} listed app-content(s) within ${NAMING_DEADLINE_MILLIS} ms`);
        finish(new BuildError(UNREAD));
      }, NAMING_DEADLINE_MILLIS);
      this.naming.add(check);
      // a listed app-content removed since is never named: a read finds it gone
      for(const id of pending) this.appContent.snapshot!(byId(id)).then(current => { if(!current) { pending.delete(id); check(); } }, finish);
    });
  }

  /** the app-content as last seen, when it can guard an edit */
  private current(): AppContentSnapshot | null {
    const seen = this.seen;
    return (seen?.revision !== undefined) ? { id: seen.id, content: seen.content, revision: seen.revision } : null;
  }

  /** creates the app-content when the document has none, leaving one that exists as it
   *  is (no edit), then reads it: the edit is measured on whatever it holds */
  private async create(): Promise<AppContentSnapshot> {
    await this.appContent.applyChanges([], MODEL_SELECTOR);
    const created = await this.read(MODEL_SELECTOR);
    if(!created) throw new BuildError('The build could not be added to the document. Nothing was changed.');
    return created;
  }

  /** applies edits guarded by the snapshot they were measured on: false when the
   *  app-content has changed since (a conflict) */
  private async apply(changes: ReadonlyArray<ContentChange>, snapshot: AppContentSnapshot): Promise<boolean> {
    try {
      await this.appContent.applyChanges(changes, byId(snapshot.id), { id: snapshot.id, revision: snapshot.revision });
      return true;
    } catch(error) {
      if(isConflict(error)) return false;
      throw error;
    }
  }

  /** whether the app-content still has the snapshot's revision */
  private async isCurrent(snapshot: AppContentSnapshot): Promise<boolean> {
    return (await this.appContent.snapshot!(byId(snapshot.id)))?.revision === snapshot.revision/*SEE: edit()*/;
  }

  /** brings the build to the app-content as it is now, once an edit has applied */
  private async reconcile(id: string): Promise<void> {
    await this.read(byId(id), id);
  }

  private refuseConflict(): void {
    const reason = this.conflict();
    if(reason) throw new BuildError(reason);
  }

  // -- Deletion ------------------------------------------------------------------
  /** a deletion notice for an app-content the stream named: it is no longer known once
   *  a read of it by id finds nothing while it is still as checked (SEE: read()) */
  private confirmKnown(id: string): void {
    const checked = this.known.get(id);
    if(!checked || !this.appContent.snapshot) return/*never named, or an older page*/;
    this.appContent.snapshot(byId(id)).then(
      current => {
        if(current || (this.known.get(id) !== checked)) return/*there, or restored or changed since the check*/;
        this.forget(id);
        this.onBuildsChanged?.();
      },
      failure => console.error('brick-studio: an app-content could not be checked after a deletion notice:', failure)/*it stays known: a conflict is never cleared by a failed read*/
    );
  }

  /** a deletion notice for the app-content with this id: reads it to learn whether it
   *  is gone. An older page cannot read it, and keeps the build */
  private confirm(id: string): void {
    const checked = this.seen;
    if(!this.appContent.snapshot || (checked?.id !== id)) return/*not the app-content shown*/;
    this.read(byId(id), id).catch(failure => {
      console.error('brick-studio: the build could not be checked after a deletion notice:', failure);
      if(this.seen === checked) this.setUncertain(true)/*a failure, like an answer, is about the app-content checked*/;
    });
  }

  /** reads the app-content, taking the answer (the app-content, or for `id`, its
   *  absence) only while the build still shows what it showed when the read began */
  private async read(selector: string, id?: string): Promise<AppContentSnapshot | null> {
    const checked = this.seen;
    const current = await this.appContent.snapshot!(selector)/*every caller has checked support*/;
    if(this.seen === checked) {
      if(current) this.accept(current);
      else if(id !== undefined) this.gone(id);
    } /* else -- the change stream moved on while the read was out */
    return current;
  }

  /** takes the app-content as seen: every new revision is the app-content's state, an
   *  equal text included; the build is told when its text is new */
  private accept(change: Seen): void {
    const previous = this.seen;
    if(previous && (previous.id === change.id) && (change.revision !== undefined) && (previous.revision === change.revision)) return/*already seen*/;
    this.seen = { id: change.id, content: change.content, revision: change.revision };
    this.setUncertain(false)/*a new revision: the app-content is there*/;
    if(this.following && (change.content !== previous?.content)) this.onTextChanged?.(change.content);
  }

  private setUncertain(uncertain: boolean): void {
    if(this.uncertain === uncertain) return;
    this.uncertain = uncertain;
    this.onUncertainChanged?.(uncertain);
  }

  /** the app-content with this id is confirmed gone while the build still shows it
   *  (SEE: read()): the build is empty, or the document's other build */
  private gone(id: string): void {
    if(this.seen?.id !== id) return/*the build shows another app-content*/;
    this.forget(id);
    this.seen = null;
    this.setUncertain(false)/*confirmed gone*/;
    if(this.following) this.onTextChanged?.('');
    this.follow();
  }

  /** drops an app-content confirmed gone from what the stream named */
  private forget(id: string): void {
    this.known.delete(id);
    this.holding.delete(id);
  }
}

// == Util ========================================================================
const byId = (id: string): string => `[id='${id}']`;
const isConflict = (error: unknown): boolean => ((error as { code?: unknown; } | null)?.code === 'app/content-conflict');
/** an app-content name the build may be under when none is named `model`: none, or
 *  `model` up to case and outer spaces */
const isNearName = (name: string | undefined): boolean => {
  const trimmed = name?.trim().toLowerCase() ?? '';
  return (trimmed.length < 1) || (trimmed === MODEL_NAME);
};
