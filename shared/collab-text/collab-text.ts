import { collab, getClientID, receiveUpdates, sendableUpdates, type Update } from '@codemirror/collab';
import { history, redo, undo } from '@codemirror/commands';
import { ChangeSet, EditorState, Text, Transaction, type ChangeSpec } from '@codemirror/state';

import type { AppContentAPI, AppContentEdit, ContentChange } from '../charmiq';

// a live text editor over one app-content block, as CodeMirror's collaborative
// editing model has it: the host is the authority, and this client keeps the text
// it last confirmed, the one batch of its own changes it has sent, and the changes
// made since, separately. CodeMirror's collab extension (over a state with no view)
// rebases the unconfirmed changes over each change the host reports, and its
// history undoes this client's own changes only, mapped over everyone else's.
// Changes travel as the host's actual edits (`edits$`), never as snapshots to diff,
// and each batch is sent as a guarded write tagged with an edit id that the host's
// edit names back, so an acknowledgement is recognized whichever arrives first:
// the write's answer or the edit
// SEE: https://codemirror.net/examples/collab/
// ********************************************************************************
// == Types =======================================================================
/** where the text stands. `stopped` keeps the text as it is in the editor, the
 *  changes never confirmed included, and says why it can no longer be saved */
export type CollabTextStatus =
  | Readonly<{ kind: 'loading'; }>
  | Readonly<{ kind: 'synced'; }>
  | Readonly<{ kind: 'saving'; }>
  | Readonly<{ kind: 'stopped'; reason: 'removed' | 'refused' | 'broken' | 'unsupported'; message: string; }>;

/** the editor a CollabText keeps in step: it shows `text()` and applies every change
 *  the CollabText makes to it (another's change, an undo), mapping its selection */
export type CollabTextEditor = Readonly<{
  /** the text is replaced whole: the first load, or the block created anew */
  reset: (text: string) => void;
  /** a change to the text the editor shows */
  apply: (changes: ChangeSet) => void;
  /** where the text stands */
  status: (status: CollabTextStatus) => void;
}>;

/** the batch sent and not yet confirmed */
type InFlight = Readonly<{ editId: string; count: number; base: string; }>;
/** a caller waiting until this client's changes so far are confirmed */
type Waiter = Readonly<{ target: number; resolve: () => void; reject: (error: Error) => void; }>;

// == Constants ===================================================================
/** the author of every change the host reports that is not this client's own */
const HOST = 'host';

// == Class =======================================================================
export class CollabText {
  /** the editor's text as this client holds it: confirmed, plus its own changes */
  private state: EditorState | null = null;
  /** the block, at the revision last confirmed, and its text there */
  private block: Readonly<{ id: string; revision: string; text: Text; }> | null = null;
  private inFlight: InFlight | null = null;
  /** the batch in flight was refused: it is sent again once the host's change that
   *  refused it has arrived */
  private refused = false;
  private stopped: Extract<CollabTextStatus, { kind: 'stopped'; }> | null = null;
  /** disposed: nothing is sent or received again */
  private closed = false;
  private unsubscribe: (() => void) | null = null;

  /** how many of this client's own updates the host has confirmed, ever */
  private confirmed = 0;
  private waiters: Waiter[] = [];

  // == Lifecycle =================================================================
  public constructor(private readonly appContent: AppContentAPI, private readonly selector: string, private readonly editor: CollabTextEditor) {}

  /** follows the block; the editor is reset once it stands */
  public start(): void {
    this.editor.status({ kind: 'loading' });
    if(!this.appContent.edits$) { this.stop('unsupported', 'This page cannot save live edits. Reload it to edit.'); return; }
    const subscription = this.appContent.edits$(this.selector).subscribe({
      next: edit => this.receive(edit),
      error: () => this.stop('broken', 'This file could not be read. Reload to try again.'),
    });
    this.unsubscribe = () => subscription.unsubscribe();
  }

  /** stops following the block: a write still in flight settles unanswered and is
   *  never sent again, and every caller waiting on one is refused */
  public dispose(): void {
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.refuseWaiters('This file was closed before your changes were saved.');
  }

  // == Read ======================================================================
  /** the text as this client holds it */
  public text(): string { return this.state?.doc.toString() ?? ''; }
  /** whether the text can be edited (and saved) */
  public isEditable(): boolean { return !!this.state && !this.stopped && !this.closed; }

  /** resolves once the host has applied every change this client made before the
   *  call (applied, not yet durably saved), or rejects, with the reason, when the
   *  text stops or closes first */
  public whenSaved(): Promise<void> {
    if(this.closed) return Promise.reject(new Error('This file was closed.'));
    if(this.stopped) return Promise.reject(new Error(this.stopped.message));
    const target = this.confirmed + (this.state ? sendableUpdates(this.state).length : 0);
    if(this.confirmed >= target) return Promise.resolve();
    return new Promise((resolve, reject) => { this.waiters.push({ target, resolve, reject }); });
  }

  // == Edit ======================================================================
  /** a change the user made in the editor, measured on the text before it */
  public local(changes: ChangeSet): void {
    if(!this.state || !this.isEditable()) return/*the editor is read-only while stopped*/;
    this.state = this.state.update({ changes, annotations: Transaction.userEvent.of('input') }).state;
    this.flush();
  }

  /** undoes this client's last change, mapped over everyone's since */
  public undo(): void { this.command(undo); }
  /** redoes this client's last undone change */
  public redo(): void { this.command(redo); }

  private command(run: typeof undo): void {
    if(!this.state || !this.isEditable()) return;
    let made: Transaction | null = null;
    run({ state: this.state, dispatch: tr => { made = tr; } });
    if(!made) return/*nothing to undo or redo*/;
    this.state = (made as Transaction).state;
    this.editor.apply((made as Transaction).changes);
    this.flush();
  }

  // == Send ======================================================================
  /** sends the changes not yet sent, as one guarded write tagged with an edit id;
   *  one batch is in flight at a time */
  private flush(): void {
    if(!this.state || !this.block || this.inFlight || this.stopped || this.closed) return;
    const updates = sendableUpdates(this.state);
    if(updates.length < 1) { this.editor.status({ kind: 'synced' }); return; }

    // changes rebased into nothing (another made the same deletion) change nothing:
    // the host would accept them without an edit to name them back, so they are
    // confirmed here
    const changes = toContentChanges(updates);
    if(changes.length < 1) {
      const own = getClientID(this.state);
      this.state = receiveUpdates(this.state, updates.map(update => ({ changes: update.changes, clientID: own }))).state;
      this.confirm(updates.length);
      this.editor.status({ kind: 'synced' });
      return;
    } /* else -- something to send */

    const block = this.block;
    const inFlight: InFlight = { editId: `${getClientID(this.state)}:${Math.random().toString(36).slice(2, 10)}`, count: updates.length, base: block.revision };
    this.inFlight = inFlight;
    this.refused = false;
    this.editor.status({ kind: 'saving' });
    this.appContent.applyChanges(changes, `[id='${block.id}']`, { id: block.id, revision: block.revision }, { editId: inFlight.editId }).then(
      () => undefined/*confirmed by the edit that names it*/,
      (error: { code?: unknown; }) => this.failed(inFlight, error)
    );
  }

  /** a write's refusal: a conflict is the host's change arriving first, and the
   *  batch goes again over it; anything else stops, keeping the text */
  private failed(inFlight: InFlight, error: { code?: unknown; }): void {
    if(this.closed || (this.inFlight !== inFlight)) return/*closed, or confirmed or replaced meanwhile*/;
    if(error?.code !== 'app/content-conflict') { this.stop('refused', 'Your latest changes could not be saved. Copy them, then reload.'); return; }
    if(this.block && (this.block.revision !== inFlight.base)) { this.inFlight = null; this.flush(); return; }
    this.refused = true/*the change that refused it is still on its way*/;
  }

  // == Receive ===================================================================
  private receive(edit: AppContentEdit): void {
    if(this.closed) return;
    // a block removed (or absent) while this client held nothing unsent resumes if
    // it returns
    if(this.stopped?.reason === 'removed' && (edit.kind === 'created') && !this.hasUnsent()) this.stopped = null;
    if(this.stopped) return;
    switch(edit.kind) {
      case 'created': return this.created(edit.id, edit.revision, edit.content);
      case 'removed':
      case 'absent': return this.stop('removed', this.hasUnsent() ? 'This file was removed from the document. Copy your latest text to keep it.' : 'This file was removed from the document.');
      case 'changes': return this.changed(edit);
    }
  }

  /** whether this client holds changes the host has not confirmed */
  private hasUnsent(): boolean { return !!this.state && (sendableUpdates(this.state).length > 0); }

  /** the block stands: its text, unless this client holds changes it never sent */
  private created(id: string, revision: string, content: string): void {
    if(this.hasUnsent()) { this.stop('broken', 'This file changed in a way your edits cannot follow. Copy your text, then reload.'); return; }
    this.block = { id, revision, text: Text.of(content.split('\n')) };
    this.state = EditorState.create({ doc: content, extensions: [collab({ startVersion: 0 }), history()] });
    this.inFlight = null;
    this.editor.reset(content);
    this.editor.status({ kind: 'synced' });
  }

  private changed(edit: Extract<AppContentEdit, { kind: 'changes'; }>): void {
    if(!this.state || !this.block) return/*not yet standing: its creation comes first*/;
    if(edit.base !== this.block.revision) { this.stop('broken', 'This file missed a change. Copy your text, then reload.'); return; }

    const inFlight = this.inFlight;
    if(inFlight && (edit.ack === inFlight.editId)) {
      // this client's batch, applied as sent: confirmed
      const own = getClientID(this.state);
      const sent = sendableUpdates(this.state).slice(0, inFlight.count);
      const changes = sent.reduce((composed, update) => composed.compose(update.changes), ChangeSet.empty(this.block.text.length));
      this.state = receiveUpdates(this.state, sent.map(update => ({ changes: update.changes, clientID: own }))).state;
      this.block = { id: this.block.id, revision: edit.revision, text: changes.apply(this.block.text) };
      this.inFlight = null;
      this.confirm(inFlight.count);
      this.flush();
      return;
    } /* else -- another's change, rebased under this client's own */

    const changes = toChangeSet(edit.changes, this.block.text.length);
    const tr = receiveUpdates(this.state, [{ changes, clientID: HOST }]);
    this.state = tr.state;
    this.block = { id: this.block.id, revision: edit.revision, text: changes.apply(this.block.text) };
    this.editor.apply(tr.changes);
    if(this.refused) { this.inFlight = null; this.refused = false; this.flush(); }
  }

  // == Stop ======================================================================
  /** the text can no longer be saved: the editor keeps it, read-only, and says why */
  private stop(reason: Extract<CollabTextStatus, { kind: 'stopped'; }>['reason'], message: string): void {
    if(this.stopped) return;
    this.stopped = { kind: 'stopped', reason, message };
    this.editor.status(this.stopped);
    this.refuseWaiters(message);
  }

  // == Wait ======================================================================
  private confirm(count: number): void {
    this.confirmed += count;
    const settled = this.waiters.filter(waiter => waiter.target <= this.confirmed);
    this.waiters = this.waiters.filter(waiter => waiter.target > this.confirmed);
    settled.forEach(waiter => waiter.resolve());
  }

  private refuseWaiters(message: string): void {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach(waiter => waiter.reject(new Error(message)));
  }
}

// == Util ========================================================================
/** a block's edits, each measured after the ones before it, as one change set on
 *  the text they start from */
const toChangeSet = (changes: ReadonlyArray<ContentChange>, length: number): ChangeSet =>
  changes.reduce((composed, { from, to, insert }) => {
    const next = ChangeSet.of({ from, to, insert: insert ?? '' } satisfies ChangeSpec, composed.newLength);
    return composed.compose(next);
  }, ChangeSet.empty(length));

/** updates, in order, as edits each measured after the ones before it: within an
 *  update the last change first, so none moves another */
const toContentChanges = (updates: ReadonlyArray<Update>): ContentChange[] =>
  updates.flatMap(update => {
    const changes: ContentChange[] = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => { changes.unshift({ from: fromA, to: toA, insert: inserted.toString() }); });
    return changes;
  });
