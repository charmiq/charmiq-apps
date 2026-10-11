import type { AppContentAPI, AppContentChange, AppContentSnapshot, ContentChange } from '../../../shared/charmiq';
import { BuildError } from './build';

// the build's LDraw text lives in the `model` appContent block, and the block is
// the truth: the build shows what it holds, whoever changed it. Every edit is
// measured on a snapshot of the block and applies only while the block is still
// exactly that (a guarded edit); on a conflict it is measured again on the same
// block as it is now. A deletion notice is bookkeeping, never proof the block is
// gone: that is confirmed by reading the block again
// SEE: tutorials/03-writing-data for the same pattern, explained
// ********************************************************************************
// == Constants ===================================================================
/** name + selector of the content block that holds the LDraw text */
const MODEL_NAME = 'model';
const MODEL_SELECTOR = `[name='${MODEL_NAME}']`;

/** how many times an edit is measured again after the block changed under it */
const EDIT_ATTEMPTS = 3;

/** the refusal on a page opened before guarded edits existed */
const RELOAD = 'This page cannot make safe edits. Reload it to edit the build.';

// == Types =======================================================================
/** the block as last seen: an older page sees no revision */
type Seen = Readonly<{ id: string; content: string; revision?: string; }>;

// == Class =======================================================================
export class ContentBridge {
  private seen: Seen | null = null/*no block*/;
  private following = false/*changes reach the build once the block is known*/;
  private onTextChanged: ((text: string) => void) | null = null;

  // == Lifecycle =================================================================
  public constructor(private readonly appContent: AppContentAPI) {}

  /** register the callback for each change to the block's text after it is known */
  public onChange(callback: (text: string) => void): void {
    this.onTextChanged = callback;
  }

  /** whether this page can make guarded edits (an older page cannot: reload it) */
  public canEdit(): boolean { return (typeof this.appContent.snapshot === 'function'); }

  // ------------------------------------------------------------------------------
  /** follows the block and resolves with its text once it is known: its first
   *  change, or its confirmed absence (an empty build). Rejects when the block
   *  cannot be read */
  public open(): Promise<string> {
    return new Promise((resolve, reject) => {
      const settle = () => { if(!this.following) { this.following = true; resolve(this.seen?.content ?? ''); } };
      const fail = (failure: unknown) => { if(!this.following) { this.following = true; reject(failure); } };

      this.appContent.onChange$(MODEL_SELECTOR).subscribe({
        next: (change: AppContentChange) => {
          if(change.deleted) return/*bookkeeping, not a cleared build*/;
          this.accept(change);
          settle();
        },
        error: failure => this.following ? console.error('brick-studio: the build stopped following the document:', failure) : fail(failure),
      });

      // a block that does not exist sends no change: ask whether there is one
      if(this.appContent.snapshot) this.appContent.snapshot(MODEL_SELECTOR).then(current => { if(current) this.accept(current); settle(); }, fail);
      else this.appContent.get(MODEL_SELECTOR).then(text => { if(!this.seen && text) this.accept({ id: '', content: text }); settle(); }, fail)/*an older page: its text, read once*/;
    });
  }

  // == Edit ======================================================================
  /** applies the edits `measure` makes on the block's text, guarded by the snapshot
   *  measured. A missing block is created first when there is anything to write,
   *  and the edits are measured on what it holds. On a conflict the edits are
   *  measured again on the same block as it is now; `measure` throws to refuse.
   *  Resolves once the build has the block's new text */
  public async edit(measure: (text: string) => ReadonlyArray<ContentChange>): Promise<void> {
    if(!this.appContent.snapshot) throw new BuildError(RELOAD);
    let snapshot = this.current();
    if(!snapshot) {
      if(measure('').length < 1) return/*nothing to write, so no block to create*/;
      snapshot = await this.create();
    } /* else -- the block as last seen */
    for(let attempt=1; ; attempt++) {
      const changes = measure(snapshot.content);
      if(changes.length < 1) return/*nothing to change*/;
      try {
        await this.appContent.applyChanges(changes, byId(snapshot.id), { id: snapshot.id, revision: snapshot.revision });
        break;
      } catch(error) {
        if(!isConflict(error)) throw error;
        const current = await this.appContent.snapshot(byId(snapshot.id));
        if(!current) { this.gone(snapshot.id); throw new BuildError('The build was removed from the document. Nothing was changed.'); }
        this.accept(current);
        if(attempt >= EDIT_ATTEMPTS) throw new BuildError('The build kept changing while this edit was made. Nothing was changed; try again.');
        snapshot = current;
      }
    }
    await this.reconcile(snapshot.id);
  }

  /** replaces the block's whole text on purpose: anything another writer changed
   *  meanwhile is replaced too. Creates the block when there is none */
  public async replace(text: string): Promise<void> {
    if(!this.appContent.snapshot) throw new BuildError(RELOAD);
    await this.appContent.set(text, MODEL_SELECTOR, MODEL_NAME);
    const current = await this.appContent.snapshot(MODEL_SELECTOR);
    if(current) this.accept(current);
  }

  // == Internal ==================================================================
  /** the block as last seen, when it can guard an edit */
  private current(): AppContentSnapshot | null {
    const seen = this.seen;
    return (seen?.revision !== undefined) ? { id: seen.id, content: seen.content, revision: seen.revision } : null;
  }

  /** creates the block when the document has none, leaving one that exists as it
   *  is (no edit), then reads it: the edit is measured on whatever it holds */
  private async create(): Promise<AppContentSnapshot> {
    await this.appContent.applyChanges([], MODEL_SELECTOR);
    const created = await this.appContent.snapshot!(MODEL_SELECTOR)/*SEE: edit()*/;
    if(!created) throw new BuildError('The build could not be added to the document. Nothing was changed.');
    this.accept(created);
    return created;
  }

  /** brings the build to the block as it is now, once an edit has applied */
  private async reconcile(id: string): Promise<void> {
    const current = await this.appContent.snapshot!(byId(id))/*SEE: edit()*/;
    if(current) this.accept(current);
    else this.gone(id);
  }

  /** takes the block as seen: every new revision is the block's state, an equal
   *  text included; the build is told when its text is new */
  private accept(change: Seen): void {
    const previous = this.seen;
    if(previous && (previous.id === change.id) && (change.revision !== undefined) && (previous.revision === change.revision)) return/*already seen*/;
    this.seen = { id: change.id, content: change.content, revision: change.revision };
    if(this.following && (change.content !== previous?.content)) this.onTextChanged?.(change.content);
  }

  /** the block with this id is confirmed gone: the build is empty, unless another
   *  block took its place first */
  private gone(id: string): void {
    if(this.seen?.id !== id) return/*already following another*/;
    this.seen = null;
    if(this.following) this.onTextChanged?.('');
  }
}

// == Util ========================================================================
const byId = (id: string): string => `[id='${id}']`;
const isConflict = (error: unknown): boolean => ((error as { code?: unknown; } | null)?.code === 'app/content-conflict');
