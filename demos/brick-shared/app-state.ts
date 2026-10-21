import { BehaviorSubject, type Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import type { AppStateAPI } from '../../shared/charmiq';

// the document's app state, held live: the one reader and writer of the Platform's
// app state in its frame. The Platform keeps the state whole (set whole), while each
// part of the app keeps one entry in it (the folder designs go to, the film's file): a
// part follows and writes its entry here, never the state. The Platform's state stream
// is the one source of the state: it tells the state as it stands once followed, then
// every change, a write of this frame's told before that write's set answers. A write
// changes its entry in the latest state told, every other entry as it is, and the
// writes run one at a time, in order, so each builds on the one before it. Two viewers
// writing at once can still cross: the Platform sets the state whole, unconditionally
// ********************************************************************************
type State = Readonly<Record<string, unknown>>;

// == Class =======================================================================
export class DocumentState {
  private readonly state = new BehaviorSubject<State>({});
  /** the state first told, once followed by whoever asks first */
  private reading: Promise<void> | undefined;
  /** why the state is not followed: the stream refused, or ended */
  private failure: string | undefined;
  /** the last write, settled or not */
  private writing: Promise<unknown> = Promise.resolve();

  public constructor(private readonly appState: AppStateAPI) {}

  /** follows the state; settles once it is first told, rejects saying why the
   *  Platform will not tell it */
  public init(): Promise<void> {
    this.reading ??= new Promise<void>((resolve, reject) => {
      // a failure once told refuses the writes after it, the state told last stale
      const fail = (error: unknown) => { this.failure = messageOf(error); reject(error); };
      try {
        this.appState.onChange$().subscribe({
          next: state => { this.state.next(stateOf(state)); resolve(); },
          error: fail,
          complete: () => fail(new Error('The document stopped telling its app state: reload to follow it again.')),
        });
      } catch(error) { fail(error); }
    });
    return this.reading;
  }

  /** why the state is not followed, when it is not */
  public get readError(): string | undefined { return this.failure; }

  // == Entry =====================================================================
  /** an entry's value, now and as it changes (absent: undefined) */
  public entry$(key: string): Observable<unknown> {
    return this.state.pipe(map(state => state[key]), distinctUntilChanged((a, b) => canonical(a) === canonical(b)));
  }

  /** sets an entry in the latest state told, every other entry as it is, once the
   *  state is first told and the writes before it settle; the entry changes here as
   *  the Platform tells it. Refused while the state is not followed */
  public write(key: string, value: unknown): Promise<void> {
    const next = this.writing.then(async () => {
      await this.init();
      if(this.failure !== undefined) throw new Error(this.failure)/*the state told last may be stale*/;
      await this.appState.set({ ...this.state.value, [key]: value });
    });
    this.writing = next.catch(() => undefined/*settled*/);
    return next;
  }
}

// == Util ========================================================================
/** the state the Platform answers, as entries (none: no state yet) */
const stateOf = (state: unknown): State => ((state !== null) && (typeof state === 'object')) ? state as State : {};
/** a value's JSON text, each object's keys in order: equal values, equal texts */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, each: unknown) =>
  ((each !== null) && (typeof each === 'object') && !Array.isArray(each)) ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => (a < b) ? -1 : (a > b) ? 1 : 0)) : each) ?? 'undefined';

const messageOf = (error: unknown): string => (error instanceof Error) ? error.message : String(error);
