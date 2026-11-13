import { isConflict, parseRecord, recordLines, writeLines } from '/shared/line-records/line-records';

import type { AppContent, AppContentAPI } from '../../shared/charmiq';

// the Punch List's jobs: one JSON record per line of the app-content named
// `punch-list`. Every change is made to the list as it stands, through it and guarded by
// it; when someone changed it first, the same change is made again to the newer list,
// by the job's id, so a change never lands on another job and never undoes another's
// ********************************************************************************
/** the app-content holding the jobs */
export const NAME = 'punch-list';
/** how many times a change is measured again when someone changed the list first */
const ATTEMPTS = 3;
/** how long a refused change waits for the list's newer revision */
const NEWER_WAIT_MS = 5_000;

export type Job = Readonly<{ k: 'job'; id: string; text: string; by: string; name: string; done: boolean; ts: number; }>;
/** a change to the list's lines: every line it does not change, as written */
export type ListChange = (lines: ReadonlyArray<string>) => ReadonlyArray<string>;

// == Reading =====================================================================
/** the job a line holds, or null for any other line (kept as written, never shown) */
export const jobOf = (line: string): Job | null => {
  const record = parseRecord(line);
  return ((record?.k === 'job') && (typeof record.id === 'string')) ? record as Job : null;
};
/** open jobs first, then done; oldest first within each */
export const byPlace = (a: Job, b: Job) => (Number(a.done) - Number(b.done)) || (a.ts - b.ts) || a.id.localeCompare(b.id);
/** the jobs the list holds, in their place */
export const jobsIn = (content: AppContent | null): Job[] =>
  (content ? recordLines(content).map(jobOf).filter((job): job is Job => !!job) : []).sort(byPlace);

// == Changes =====================================================================
/** the list with this job added at its end */
export const adding = (job: Job): ListChange => lines => [...lines, JSON.stringify(job)];
/** the list with the job of this id edited (null: removed) */
export const editing = (id: string, edit: (job: Job) => Job | null): ListChange => lines =>
  lines.flatMap(line => {
    const job = jobOf(line);
    if(!job || (job.id !== id)) return [line];
    const edited = edit(job);
    return edited ? [JSON.stringify(edited)] : [];
  });

// == Class =======================================================================
/** follows the list and changes it by id, to the list as it stands */
export class JobList {
  private readonly appContent: Pick<AppContentAPI, 'content$' | 'create'>;
  /** the list as it now stands (null: none yet), once it is known */
  private latest: AppContent | null = null;
  private known = false;
  /** changes waiting for the list's newer revision */
  private readonly waiting: Array<() => void> = [];

  public constructor(appContent: Pick<AppContentAPI, 'content$' | 'create'>) { this.appContent = appContent; }

  /** follows the list, whoever changed it (this client's own changes included)
   *  @returns stops following */
  public follow(onList: (content: AppContent | null) => void, onFailure: (failure: unknown) => void): () => void {
    const subscription = this.appContent.content$(`[name='${NAME}']`).subscribe({
      next: content => { this.latest = content; this.known = true; onList(content); this.waiting.splice(0).forEach(wake => wake()); },
      error: onFailure,
    });
    return () => subscription.unsubscribe();
  }

  /** makes the change to the list as it stands; a list another writer changed first
   *  is changed again, as it then stands. Nothing is written before the list is known:
   *  a write then could start a second list beside the first */
  public async change(next: ListChange): Promise<void> {
    if(!this.known) throw new Error('the list is not known yet');
    for(let attempt=0; attempt<ATTEMPTS; attempt++) {
      const shown = this.latest;
      if(!shown) { await this.appContent.create(next([]).join('\n') + '\n', NAME); return/*the first job starts the list*/; }
      try {
        await writeLines(shown, next(recordLines(shown)));
        return;
      } catch(refused) {
        if(!isConflict(refused)) throw refused;
        await new Promise<void>(resolve => { this.waiting.push(resolve); setTimeout(resolve, NEWER_WAIT_MS); })/*the newer list*/;
      }
    }
    throw new Error('the list kept changing');
  }
}
