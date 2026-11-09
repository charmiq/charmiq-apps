import type { AppStateAPI } from '../charmiq';

// an Application's settings in its app state. The app state is one value for everyone
// on the document, and the last write wins (SEE: the Platform's App-Content and
// App-State guide): settings that two people change at once keep one person's.
//
// Shown: the latest state the document told, with this client's changes not yet
// confirmed laid over it. A change made here stands over an older state still
// arriving; once saved, it gives way to the next state the document tells.
//
// Saving: each change is written onto the latest state, with its value taken from
// this client and every other key as the document last told it, one save at a time.
// Nothing is written before the state is known, nor after it can no longer be read.
// A failed save is told, and the setting shows the saved value again
// ********************************************************************************
// == Types =======================================================================
/** the settings shown: the latest state with this client's unconfirmed changes */
export type AppStateView = Readonly<Record<string, unknown>>;

/** what went wrong: the state could no longer be read, or a change was not saved */
export type AppStateFailure = 'read' | 'save';

/** where a setting lives in the state: its key, then the keys within it */
export type SettingPath = ReadonlyArray<string>;

// ................................................................................
/** a change made here, until the document confirms it */
interface Change {
  readonly path: SettingPath;
  /** undefined removes the setting */
  readonly value: unknown;
  /** a save carries it (false: still to be written) */
  saving: boolean;
  /** saved: the next state the document tells is at or after it */
  saved: boolean;
  /** told whether it was saved, once its save settles (a replaced change's too) */
  readonly answers: Array<(saved: boolean) => void>;
}

// == Class =======================================================================
export class AppStateSettings {
  private readonly appState: Pick<AppStateAPI, 'onChange$' | 'set'>;
  private readonly onState: (view: AppStateView) => void;
  private readonly onFailure: (failure: AppStateFailure, error: unknown) => void;

  /** the latest state the document told (undefined: not yet known, or lost) */
  private latest: AppStateView | undefined = undefined;
  /** the state can no longer be read: a change is never written */
  private lost = false;
  /** a save is in flight */
  private writing = false;

  /** changes made here, by setting: a later change to one replaces the earlier */
  private readonly changes = new Map<string/*path key*/, Change>();

  // == Lifecycle =================================================================
  public constructor(appState: Pick<AppStateAPI, 'onChange$' | 'set'>, onState: (view: AppStateView) => void, onFailure: (failure: AppStateFailure, error: unknown) => void) {
    this.appState = appState;
    this.onState = onState;
    this.onFailure = onFailure;
  }

  // ------------------------------------------------------------------------------
  /** follows the app state; resolves once its first state is known, or it cannot
   *  be read */
  public start(): Promise<void> {
    return new Promise<void>(resolve => {
      this.appState.onChange$().subscribe({
        next: (state: unknown) => { this.receive(state); resolve(); },
        error: (error: unknown) => { this.lose(error); resolve(); },
      });
    });
  }

  // == Getters ===================================================================
  /** the settings shown */
  public view(): AppStateView {
    let view: AppStateView = this.latest ?? {};
    for(const change of this.changes.values()) view = withSetting(view, change.path, change.value);
    return view;
  }

  // == Writers ===================================================================
  /** changes a setting (undefined removes it): shown at once, written onto the
   *  latest state once it is known. Answers whether it was saved: never once the
   *  state can no longer be read */
  public change(path: SettingPath, value: unknown): Promise<boolean> {
    const key = keyOf(path);
    const earlier = this.changes.get(key);
    if(this.latest && sameValue(settingOf(this.view(), path), value)) {
      if(!earlier || earlier.saved) return Promise.resolve(true)/*already saved*/;
      return new Promise<boolean>(answer => earlier.answers.push(answer))/*already on its way*/;
    } /* else -- a new value, or the state not known: nothing shown is yet known saved */

    const answered = new Promise<boolean>(answer => {
      const answers = ((earlier && !earlier.saving) ? earlier.answers : [])/*a replaced unwritten change is answered with this one*/;
      this.changes.set(key, { path, value, saving: false, saved: false, answers: [...answers, answer] });
    });
    this.onState(this.view());
    if(this.lost) this.answerUnwritten(false);
    else this.write();
    return answered;
  }

  // == Internal ==================================================================
  /** a state the document told: the latest, over which only unsaved changes stand */
  private receive(state: unknown): void {
    this.latest = isRecord(state) ? state : {/*no state*/};
    for(const [key, change] of this.changes) if(change.saved) this.changes.delete(key);
    this.write()/*a change waiting for the state*/;
    this.onState(this.view());
  }

  // ------------------------------------------------------------------------------
  /** the state can no longer be read: what waits is never written */
  private lose(error: unknown): void {
    this.latest = undefined;
    this.lost = true;
    this.answerUnwritten(false);
    console.error('Could not read the app state', error);
    this.onFailure('read', error);
  }

  // ------------------------------------------------------------------------------
  /** answers every change no save carries */
  private answerUnwritten(saved: boolean): void {
    for(const change of this.changes.values()) if(!change.saving) change.answers.splice(0).forEach(answer => answer(saved));
  }

  // ------------------------------------------------------------------------------
  /** writes the changes onto the latest state, one save at a time */
  private write(): void {
    if(this.writing || !this.latest) return/*in flight, or no state to write onto (not yet known, or lost)*/;
    const carried = [...this.changes.values()].filter(change => !change.saving);
    if(carried.length < 1) return/*nothing to write*/;

    for(const change of carried) change.saving = true;
    this.writing = true;
    const settled = (failure: unknown | undefined) => {
      this.writing = false;
      for(const change of carried) {
        change.answers.splice(0).forEach(answer => answer(failure === undefined));
        const key = keyOf(change.path);
        if(this.changes.get(key) !== change) continue/*replaced by a later change*/;
        if(failure !== undefined) this.changes.delete(key)/*shows the saved value*/;
        else change.saved = true;
      }
      if(failure !== undefined) {
        console.error('Could not save the app state', failure);
        this.onFailure('save', failure);
        this.onState(this.view());
      } /* else -- saved */
      this.write()/*a change made meanwhile*/;
    };
    let saving: Promise<void>;
    try { saving = this.appState.set(this.view()/*the latest state with every change made here*/); }
    catch(error) { saving = Promise.reject(error)/*thrown while sending*/; }
    saving.then(() => settled(undefined), (error: unknown) => settled(error ?? new Error('The app state was not saved')));
  }
}

// == Notice ======================================================================
/** what the person is told when a setting was not saved or the state can no
 *  longer be read: what happened, the reason when known, and what to do next */
export const appStateFailureNotice = (failure: AppStateFailure, error: unknown): string => {
  const reason = ((error instanceof Error) && error.message) ? `: ${error.message}` : '';
  return (failure === 'save')
    ? `A setting wasn't saved${reason}. Change it again to try once more.`
    : `Settings stopped updating, and changes here aren't saved${reason}. Reload to try again.`;
};

// == Helpers =====================================================================
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && (typeof value === 'object') && !Array.isArray(value);

/** one key per setting path */
const keyOf = (path: SettingPath): string => JSON.stringify(path);

/** the value at a path (undefined: absent) */
const settingOf = (state: AppStateView, path: SettingPath): unknown => {
  let value: unknown = state;
  for(const key of path) {
    if(!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
};

/** a copy of the state with the value at the path (undefined removes it) */
const withSetting = (state: AppStateView, path: SettingPath, value: unknown): AppStateView => {
  const [key, ...rest] = path;
  if(rest.length < 1) {
    if(value !== undefined) return { ...state, [key]: value };
    const { [key]: _removed, ...kept } = state;
    return kept;
  } /* else -- within the key */
  const within = isRecord(state[key]) ? state[key] as AppStateView : {};
  return { ...state, [key]: withSetting(within, rest, value) };
};

/** settings are JSON: equal when they serialize alike */
const sameValue = (a: unknown, b: unknown): boolean => (a === b) || (JSON.stringify(a) === JSON.stringify(b));
