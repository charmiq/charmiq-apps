import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { appStateFailureNotice, AppStateSettings, type AppStateView } from '/shared/app-state-settings/app-state-settings';
import { recordLines } from '/shared/line-records/line-records';

import type { AppContent, ApplicationUser } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;
import { adding, editing, jobsIn, JobList, type Job } from './jobs';
import { People, Together, type SharesStatus } from './People';
import { byPlace, colorForId, initials, introducing, membersIn, needsIntroduction, peopleOf, readShares, sharesFailureNotice, type Me, type Share } from './people';

// two people, one document. The jobs they share are records in the document's
// app-content (SEE: ./jobs.ts), beside each person's member line (SEE: ./people.ts).
// Each person's own place (the newest job they have seen) lives in app-state under
// their User id, so it never touches the other's
// ********************************************************************************
const newId = () => Math.random().toString(36).slice(2, 10);
/** the shortest wait between two reads of the shares when the list is returned to */
const SHARES_REREAD_MS = 15_000;

// ================================================================================
export const App = () => {
  const { appContent, appState, mcp } = window.charmiq;
  const here = window.charmiq.document/*the document the list is in: null outside one*/;
  const [content, setContent] = useState<AppContent | null>();
  const [readFailed, setReadFailed] = useState(false);
  const [user, setUser] = useState<ApplicationUser | null>();
  const [place, setPlace] = useState<AppStateView>({});
  const [placeKnown, setPlaceKnown] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [sharesStatus, setSharesStatus] = useState<SharesStatus>(here ? 'reading' : 'none');
  const [sharesNotice, setSharesNotice] = useState<string | null>(null);
  const [introFailed, setIntroFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // == Initialization ============================================================
  // the list, whoever changed it -- this Application's own changes included
  const list = useMemo(() => new JobList(appContent), [appContent]);
  useEffect(() => list.follow(setContent, () => setReadFailed(true)), [list]);

  // who is looking: their id keys their place, their name signs their jobs
  useEffect(() => {
    const subscription = window.charmiq.user$().subscribe({ next: setUser, error: () => setUser(null) });
    return () => subscription.unsubscribe();
  }, []);

  // each person's place, written onto the latest app-state (SEE: shared/app-state-settings).
  // Nothing is counted as new until the place is known
  const settings = useMemo(() => new AppStateSettings(appState, setPlace, (failure, cause) => setError(appStateFailureNotice(failure, cause))), [appState]);
  useEffect(() => { void settings.start().then(() => setPlaceKnown(true)); }, [settings]);

  // who has the document: read on opening, and again when the list is returned to
  // (an invite made in the Share menu meanwhile). Only the latest read is shown
  const sharesRead = useRef({ sequence: 0, at: -Infinity });
  const loadShares = useCallback(() => {
    if(!here) return/*no document to read*/;
    const sequence = ++sharesRead.current.sequence;
    sharesRead.current.at = performance.now();
    readShares(mcp, here).then(
      read => { if(sequence !== sharesRead.current.sequence) return; setShares(read); setSharesStatus('read'); setSharesNotice(null); },
      failure => { if(sequence !== sharesRead.current.sequence) return; console.warn('The document\'s shares could not be read', failure); setSharesStatus(status => (status === 'read') ? 'read'/*keeps the last read*/ : 'failed'); setSharesNotice(sharesFailureNotice(failure)); });
  }, [here, mcp]);
  useEffect(() => {
    loadShares();
    const returned = () => { if((document.visibilityState === 'visible') && ((performance.now() - sharesRead.current.at) > SHARES_REREAD_MS)) loadShares(); };
    document.addEventListener('visibilitychange', returned);
    window.addEventListener('focus', returned);
    return () => { document.removeEventListener('visibilitychange', returned); window.removeEventListener('focus', returned); };
  }, [loadShares]);

  // == Reading ===================================================================
  const lines = useMemo(() => (content ? recordLines(content) : []), [content]);
  const jobs = useMemo(() => jobsIn(content ?? null), [content]);
  const members = useMemo(() => membersIn(lines), [lines]);
  const me = useMemo<Me | null>(() => (user ? { id: user.id, name: user.name || 'Someone', img: user.imageUrl ?? '' } : null), [user]);
  const people = useMemo(() => peopleOf(shares, members, me).sort(byPlace(me?.id)), [shares, members, me]);
  const colors = useMemo(() => new Map(people.map(person => [person.id, person.color])), [people]);
  // the shares name a Commenter or Viewer: they look at the list and never change it
  const looker = !!me && !!shares?.some(share => (share.user === me.id)) && !people.find(person => person.id === me.id)?.writer;

  const byUser = (place.byUser ?? {}) as Record<string, { seen?: number; } | undefined>;
  // the newest job this person has seen, by the jobs' own times: never this device's
  // clock against the writer's
  const seen = (me && byUser[me.id]?.seen) ?? 0;
  const fresh = placeKnown ? jobs.filter(job => me && (job.by !== me.id) && (job.ts > seen)) : [];

  // == Member Line ===============================================================
  // a person's member line is written on their first open and when their name or picture
  // changes, once for each: never in a loop, and never for someone who only looks (whose
  // write would be refused). It waits for the shares, which say who only looks
  const introduced = useRef(new Set<string>());
  useEffect(() => {
    if((content === undefined) || readFailed || !me || looker || (sharesStatus === 'reading')) return;
    if(!needsIntroduction(members, me)) return;
    const key = JSON.stringify(me);
    if(introduced.current.has(key)) return/*asked once already*/;
    introduced.current.add(key);
    setIntroFailed(false);
    list.change(introducing(me)).catch(() => setIntroFailed(true));
  }, [content, readFailed, me, looker, sharesStatus, members, list]);
  const retryIntroduction = () => { if(me) { introduced.current.delete(JSON.stringify(me)); setIntroFailed(false); list.change(introducing(me)).catch(() => setIntroFailed(true)); } };

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
    save(`"${text}"`, adding({ k: 'job', id: newId(), text, by: me.id, name: me.name, done: false, ts: Date.now() }));
  };
  const toggle = (job: Job) => save(`"${job.text}"`, editing(job.id, current => ({ ...current, done: !current.done })));
  const remove = (job: Job) => save(`Removing "${job.text}"`, editing(job.id, () => null));
  // seen is a gesture, never a side effect of drawing the list
  const markSeen = () => { if(me) void settings.change(['byUser', me.id, 'seen'], Math.max(seen, ...fresh.map(job => job.ts))); };

  // == UI ========================================================================
  const ready = (content !== undefined) && !readFailed && !!me;
  const canChange = ready && !looker;
  return (
    <div className="app">
      <header>
        <h1>Punch List</h1>
        {fresh.length > 0 && <button type="button" className="fresh" onClick={markSeen}>{fresh.length} new</button>}
      </header>
      {ready && <Together meId={me?.id} looker={looker} people={people} status={sharesStatus} notice={sharesNotice} onRetry={loadShares} />}
      <form className="add" onSubmit={add}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a job" aria-label="New job" disabled={!canChange} />
        <button type="submit" disabled={!canChange || !draft.trim()}>Add</button>
      </form>
      {readFailed && <p className="notice" role="alert">The list could not be read. Reload to try again.</p>}
      {(user === null) && <p className="notice" role="alert">Sign in to work on this list.</p>}
      {looker && <p className="notice">You can look at this list. To add or check off jobs, ask whoever shared it to let you make changes.</p>}
      {introFailed && <p className="error" role="alert">Your name could not be added to the list. <button type="button" className="link" onClick={retryIntroduction}>Try again</button></p>}
      {error && <p className="error" role="alert">{error}</p>}
      {ready && (jobs.length < 1) && <p className="notice">No jobs yet.</p>}
      <ul className="items">
        {jobs.map(job => (
          <li key={job.id} className={job.done ? 'done' : undefined} style={{ '--writer': colors.get(job.by) ?? colorForId(job.by) } as React.CSSProperties}>
            <input type="checkbox" checked={job.done} onChange={() => toggle(job)} aria-label={`Done: ${job.text}`} disabled={!canChange} />
            <span className="text" title={job.text}>{job.text}</span>
            {(me && (job.by === me.id))
              ? <span className="by">you</span>
              : <span className="by initials" role="img" title={job.name} aria-label={job.name}>{initials(job.name)}</span>}
            <button type="button" onClick={() => remove(job)} aria-label={`Remove ${job.text}`} disabled={!canChange}>Remove</button>
          </li>
        ))}
      </ul>
      {ready && <People meId={me?.id} looker={looker} people={people} status={sharesStatus} />}
    </div>
  );
};
