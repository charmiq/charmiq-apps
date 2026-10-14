import type { AppContentAPI, AppContentChange, AppContentSnapshot, ContentChange } from '../../../shared/charmiq';
import { BuildError } from './build';

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
// Two collaborators who each find no app-content and add a part create two `model`
// app-contents, both kept when their edits merge. No pair of guarded edits can move
// one build into the other exactly once, so a document holding more than one is a
// conflict: every build is kept and readable, and edits wait until one remains
// SEE: tutorials/03-writing-data for the same pattern, explained
// ********************************************************************************
// == Constants ===================================================================
/** name + selector of the app-content that holds the LDraw text */
const MODEL_NAME = 'model';
const MODEL_SELECTOR = `[name='${MODEL_NAME}']`;

/** how many times an edit is measured again after the app-content changed under it */
const EDIT_ATTEMPTS = 3;

/** the refusal on a page opened before guarded edits existed */
const RELOAD = 'This page cannot make safe edits. Reload it to edit the build.';
/** the refusal while the document holds more than one build */
const conflict = (count: number) => `This document holds ${count} builds named ${MODEL_NAME}, made at once by different people. Nothing was changed: edits wait until one build remains. getModel returns each build's text; combine them into one ${MODEL_NAME} app-content in the document and remove the others.`;

// == Types =======================================================================
/** the app-content as last seen: an older page sees no revision */
type Seen = Readonly<{ id: string; content: string; revision?: string; }>;

// == Class =======================================================================
export class ContentBridge {
  private seen: Seen | null = null/*no app-content*/;
  private following = false/*changes reach the build once the app-content is known*/;
  private onTextChanged: ((text: string) => void) | null = null;
  private onUncertainChanged: ((uncertain: boolean) => void) | null = null;
  /** a check of the app-content shown failed: whether it is still there is unknown
   *  until the app-content's next revision, or its confirmed absence */
  private uncertain = false;
  /** every app-content named `model`, by id, as last seen */
  private readonly models = new Map<string, Seen>();
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
    return [...this.models].map(([id, seen]) => ({ id, ldraw: seen.content }));
  }

  /** why edits wait, when the document holds more than one build */
  public conflict(): string | undefined {
    return (this.models.size > 1) ? conflict(this.models.size) : undefined;
  }

  /** whether this page can make guarded edits (an older page cannot: reload it) */
  public canEdit(): boolean { return (typeof this.appContent.snapshot === 'function'); }

  // ------------------------------------------------------------------------------
  /** follows the app-content and resolves with its text once it is known: its first
   *  change, or its confirmed absence (an empty build). Rejects when the app-content
   *  cannot be read */
  public open(): Promise<string> {
    return new Promise((resolve, reject) => {
      const settle = () => { if(!this.following) { this.following = true; resolve(this.seen?.content ?? ''); } };
      const fail = (failure: unknown) => { if(!this.following) { this.following = true; reject(failure); } };

      this.appContent.onChange$(MODEL_SELECTOR).subscribe({
        next: (change: AppContentChange) => {
          if(change.deleted) { this.confirm(change.id); return; }
          this.accept(change);
          settle();
        },
        error: failure => this.following ? console.error('brick-studio: the build stopped following the document:', failure) : fail(failure),
      });

      // every app-content named `model`: more than one is a conflict
      this.appContent.onChange$().subscribe({
        next: (change: AppContentChange) => {
          if(change.deleted) { this.confirmModel(change.id); return; }
          if(change.name === MODEL_NAME) this.models.set(change.id, { id: change.id, content: change.content, revision: change.revision });
          else if(!this.models.delete(change.id)) return/*not a build*/;
          this.onBuildsChanged?.();
        },
        error: failure => console.error('brick-studio: the builds stopped following the document:', failure),
      });

      // an app-content that does not exist sends no change: ask whether there is one
      if(this.appContent.snapshot) this.read(MODEL_SELECTOR).then(settle, fail);
      else this.appContent.get(MODEL_SELECTOR).then(text => { if(!this.seen && text) this.accept({ id: '', content: text }); settle(); }, fail)/*an older page: its text, read once*/;
    });
  }

  // == Edit ======================================================================
  /** applies the edits `measure` makes on the app-content's text, guarded by the
   *  snapshot measured. A missing app-content is created first when there is anything
   *  to write, and the edits are measured on what it holds. On a conflict the edits are
   *  measured again on the same app-content as it is now; `measure` throws to refuse.
   *  Resolves once the build has the app-content's new text */
  public async edit(measure: (text: string) => ReadonlyArray<ContentChange>): Promise<void> {
    if(!this.appContent.snapshot) throw new BuildError(RELOAD);
    this.refuseConflict();
    let snapshot = this.current();
    if(!snapshot) {
      const existing = await this.read(MODEL_SELECTOR)/*one the build has not seen yet*/;
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
   *  meanwhile is replaced too. Creates the app-content when there is none */
  public async replace(text: string): Promise<void> {
    if(!this.appContent.snapshot) throw new BuildError(RELOAD);
    this.refuseConflict()/*a replacement would make one build pass for all*/;
    await this.appContent.set(text, MODEL_SELECTOR, MODEL_NAME);
    await this.read(MODEL_SELECTOR);
  }

  // == Internal ==================================================================
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

  /** a deletion notice for an app-content named `model`: it is no longer a build once a
   *  read of it by id finds nothing while the build is still as checked (SEE: read()) */
  private confirmModel(id: string): void {
    const checked = this.models.get(id);
    if(!checked || !this.appContent.snapshot) return/*not a build, or an older page*/;
    this.appContent.snapshot(byId(id)).then(
      current => {
        if(current || (this.models.get(id) !== checked)) return/*there, or restored or changed since the check*/;
        this.models.delete(id);
        this.onBuildsChanged?.();
      },
      failure => console.error('brick-studio: a build could not be checked after a deletion notice:', failure)/*it stays a build: a conflict is never cleared by a failed read*/
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
   *  (SEE: read()): the build is empty */
  private gone(id: string): void {
    if(this.seen?.id !== id) return/*the build shows another app-content*/;
    this.seen = null;
    this.setUncertain(false)/*confirmed gone*/;
    if(this.following) this.onTextChanged?.('');
  }
}

// == Util ========================================================================
const byId = (id: string): string => `[id='${id}']`;
const isConflict = (error: unknown): boolean => ((error as { code?: unknown; } | null)?.code === 'app/content-conflict');
