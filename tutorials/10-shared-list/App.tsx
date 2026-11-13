import React, { useEffect, useMemo, useState } from 'react';

import { appStateFailureNotice, AppStateSettings, type AppStateView } from '/shared/app-state-settings/app-state-settings';

import type { AppContent, ApplicationUser } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;
import { adding, editing, jobsIn, JobList, type Job } from './jobs';

// two people, one document. The jobs they share are records in the document's
// app-content (SEE: ./jobs.ts). Each person's own place (the newest job they have
// seen) lives in app-state under their User id, so it never touches the other's
// ********************************************************************************
const newId = () => Math.random().toString(36).slice(2, 10);

// ================================================================================
export const App = () => {
  const { appContent, appState } = window.charmiq;
  const [content, setContent] = useState<AppContent | null>();
  const [readFailed, setReadFailed] = useState(false);
  const [me, setMe] = useState<ApplicationUser | null>();
  const [place, setPlace] = useState<AppStateView>({});
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // == Initialization ============================================================
  // the list, whoever changed it -- this Application's own changes included
  const list = useMemo(() => new JobList(appContent), [appContent]);
  useEffect(() => list.follow(setContent, () => setReadFailed(true)), [list]);

  // who is looking: their id keys their place, their name signs their jobs
  useEffect(() => {
    const subscription = window.charmiq.user$().subscribe({ next: setMe, error: () => setMe(null) });
    return () => subscription.unsubscribe();
  }, []);

  // each person's place, written onto the latest app-state (SEE: shared/app-state-settings)
  const settings = useMemo(() => new AppStateSettings(appState, setPlace, (failure, cause) => setError(appStateFailureNotice(failure, cause))), [appState]);
  useEffect(() => { void settings.start(); }, [settings]);

  // == Reading ===================================================================
  const jobs = useMemo(() => jobsIn(content ?? null), [content]);
  const byUser = (place.byUser ?? {}) as Record<string, { seen?: number; } | undefined>;
  // the newest job this person has seen, by the jobs' own times: never this device's
  // clock against the writer's
  const seen = (me && byUser[me.id]?.seen) ?? 0;
  const fresh = jobs.filter(job => me && (job.by !== me.id) && (job.ts > seen));

  // == Handlers ==================================================================
  const save = (what: string, change: Parameters<JobList['change']>[0]) => {
    setError(null);
    list.change(change).catch(() => setError(`${what} was not saved. Try again.`));
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if(!text || !me) return;
    setDraft('');
    save(`"${text}"`, adding({ k: 'job', id: newId(), text, by: me.id, name: me.name || 'Someone', done: false, ts: Date.now() }));
  };
  const toggle = (job: Job) => save(`"${job.text}"`, editing(job.id, current => ({ ...current, done: !current.done })));
  const remove = (job: Job) => save(`Removing "${job.text}"`, editing(job.id, () => null));
  // seen is a gesture, never a side effect of drawing the list
  const markSeen = () => { if(me) void settings.change(['byUser', me.id, 'seen'], Math.max(seen, ...fresh.map(job => job.ts))); };

  // == UI ========================================================================
  const ready = (content !== undefined) && !readFailed && !!me;
  return (
    <div className="app">
      <header>
        <h1>Punch List</h1>
        {fresh.length > 0 && <button type="button" className="fresh" onClick={markSeen}>{fresh.length} new</button>}
      </header>
      <form className="add" onSubmit={add}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a job" aria-label="New job" disabled={!ready} />
        <button type="submit" disabled={!ready || !draft.trim()}>Add</button>
      </form>
      {readFailed && <p className="notice" role="alert">The list could not be read. Reload to try again.</p>}
      {(me === null) && <p className="notice" role="alert">Sign in to work on this list.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {ready && (jobs.length < 1) && <p className="notice">No jobs yet.</p>}
      <ul className="items">
        {jobs.map(job => (
          <li key={job.id} className={job.done ? 'done' : undefined}>
            <input type="checkbox" checked={job.done} onChange={() => toggle(job)} aria-label={`Done: ${job.text}`} disabled={!ready} />
            <span className="text" title={job.text}>{job.text}</span>
            <span className="by" title={job.name}>{(me && (job.by === me.id)) ? 'you' : job.name}</span>
            <button type="button" onClick={() => remove(job)} aria-label={`Remove ${job.text}`} disabled={!ready}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
};
