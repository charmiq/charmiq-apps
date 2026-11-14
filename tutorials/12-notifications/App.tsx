import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { appStateFailureNotice, AppStateSettings, type AppStateView } from '/shared/app-state-settings/app-state-settings';
import { recordLines } from '/shared/line-records/line-records';

import type { AppContent, ApplicationUser, NotificationSend, NotificationSendError, NotificationState } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;
import { adding, editing, jobsIn, JobList, type Job } from './jobs';
import { People, Together, type SharesStatus } from './People';
import { byPlace, colorForId, initials, introducing, membersIn, needsIntroduction, peopleOf, readShares, sharesFailureNotice, type Me, type Share } from './people';

// two people, one document, opened as an app from the Home Screen. The jobs they share
// are records in the document's app-content (SEE: ./jobs.ts), beside each person's
// member line (SEE: ./people.ts). Each person's own place (the newest job they have
// seen) lives in app-state under their User id. The page the app runs on takes the
// header's color behind the status bar, the new count on its icon, and a shortcut's
// view (`?show=done`). Each new job, once saved, is sent as a push notification to
// everyone else whose device turned them on; a tap on it opens the app at that job
// ********************************************************************************
const newId = () => Math.random().toString(36).slice(2, 10);
/** the shortest wait between two reads of the shares when the list is returned to */
const SHARES_REREAD_MS = 15_000;
/** the page behind the Application, in each mode: the header's own color (SEE: ./styles.scss) */
const TOP_COLOR = { light: '#f7f7f4', dark: '#161614' };

/** the most a notification says (the Platform's limit) */
const MAX_BODY_LENGTH = 500;
/** how long a job a notification opened stays highlighted */
const HIGHLIGHT_MS = 2_400;

/** what the list shows: every job, or the done ones a shortcut opens */
type View = 'all' | 'done';
/** a saved job whose notification was not accepted: sent again exactly as it was, with
 *  the identifier the Platform gave the first send */
type Unsent = Readonly<{ job: Job; notification: NotificationSend; submissionId?: string; sending: boolean; }>;

/** what a new job's notification says: shown on a lock screen, so no more than the job */
const bodyOf = (name: string, text: string): string => {
  const body = `${name} added: ${text}`;
  return (body.length > MAX_BODY_LENGTH) ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body;
};
/** whether the person asked the device for less motion */
const prefersLessMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ================================================================================
export const App = () => {
  const { appContent, appState, mcp, page } = window.charmiq;
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
  const [view, setView] = useState<View>('all');
  const [notify, setNotify] = useState<NotificationState | null>(null/*not yet known*/);
  const [notifyFailed, setNotifyFailed] = useState(false);
  const [unsent, setUnsent] = useState<Unsent[]>([]);
  const [target, setTarget] = useState<string | null>(null/*no job asked for*/);
  const [highlight, setHighlight] = useState<string | null>(null);
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

  // the header continues into the status bar (or a desktop app's title bar)
  useEffect(() => page.setTopColor(TOP_COLOR), [page]);

  // a launch names the view to open: the address the app opened with, or a shortcut
  // chosen while it is open (`?show=done`). A launch naming no view leaves it as it is.
  // A notification's tap names its job (`?job=<id>`): every job is shown, and that one
  // is found
  useEffect(() => page.launchQueue.setConsumer(({ targetURL }) => {
    const query = new URL(targetURL).searchParams;
    const wanted = query.get('show'), job = query.get('job');
    if((wanted === 'all') || (wanted === 'done')) setView(wanted);
    if(job) { setView('all'); setTarget(job); }
  }), [page]);

  // whether this device's notifications are on: read on opening, and again on coming
  // back (they may have been turned off in the device's settings meanwhile). A state
  // that cannot be read offers the tap, which answers for itself
  useEffect(() => {
    const read = () => page.notifications.state().then(setNotify, () => setNotify('off'));
    void read();
    const returned = () => { if(document.visibilityState === 'visible') void read(); };
    document.addEventListener('visibilitychange', returned);
    return () => document.removeEventListener('visibilitychange', returned);
  }, [page]);

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
  const shown = (view === 'done') ? jobs.filter(job => job.done) : jobs;

  // the new count on the app's icon, whenever it changes. A request made outside a tap
  // shows only once the person has decided about badges (SEE: markSeen)
  useEffect(() => { if(placeKnown) page.setAppBadge(fresh.length); }, [page, placeKnown, fresh.length]);

  // the job a notification opened: scrolled to and highlighted once the list holds it.
  // It stays asked for until then (a list still arriving), or until another launch
  const targetMissing = !!target && (content !== undefined) && !jobs.some(job => job.id === target);
  useEffect(() => {
    if(!target || !jobs.some(job => job.id === target)) return;
    document.querySelector(`[data-job="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'center', behavior: prefersLessMotion() ? 'auto' : 'smooth' });
    setHighlight(target);
    setTarget(null);
  }, [target, jobs]);
  useEffect(() => {
    if(!highlight) return;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

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
  // only a send notifies: the saved line alone tells no one
  const announce = (entry: Unsent) => {
    setUnsent(current => current.map(each => (each.job.id === entry.job.id) ? { ...each, sending: true } : each));
    page.notifications.send({ ...entry.notification, ...(entry.submissionId ? { submissionId: entry.submissionId } : {}) }).then(
      () => setUnsent(current => current.filter(each => each.job.id !== entry.job.id)),
      (failure: NotificationSendError) => {
        // the same send again, under the identifier the Platform gave it: a send that was
        // in fact accepted is answered with that acceptance, never sent twice
        const failed: Unsent = { ...entry, submissionId: failure?.submissionId ?? entry.submissionId, sending: false };
        setUnsent(current => [...current.filter(each => each.job.id !== entry.job.id), failed]);
      });
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if(!text || !me) return;
    setDraft('');
    setError(null);
    const job: Job = { k: 'job', id: newId(), text, by: me.id, name: me.name, done: false, ts: Date.now() };
    list.change(adding(job)).then(
      // each job is its own news: no replacementTag, so one never replaces another
      () => announce({ job, notification: { audienceType: 'subscribers', excludeThisDevice: true, body: bodyOf(me.name, text), launch: `job=${job.id}` }, sending: false }),
      () => setError(`"${text}" was not saved. Try again.`));
  };
  // turning notifications on is this device's decision, asked from a tap
  const turnOn = () => {
    setNotifyFailed(false);
    page.notifications.request().then(setNotify, () => setNotifyFailed(true));
  };
  const toggle = (job: Job) => save(`"${job.text}"`, editing(job.id, current => ({ ...current, done: !current.done })));
  const remove = (job: Job) => save(`Removing "${job.text}"`, editing(job.id, () => null));
  // seen is a gesture, never a side effect of drawing the list. The tap also clears the
  // icon's count: where a badge needs permission (a Mac), a request made during a tap
  // is the one that asks
  const markSeen = () => {
    if(!me) return;
    page.setAppBadge(0);
    void settings.change(['byUser', me.id, 'seen'], Math.max(seen, ...fresh.map(job => job.ts)));
  };

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
      {ready && ((notify === 'off') || (notify === 'blocked')) && (
        <section className="notify">
          <p>{(notify === 'blocked')
            ? 'This device blocks notifications for this app. Allow them in its settings (on an iPhone or iPad: Settings → Notifications), then tap Notify me.'
            : 'Hear about new jobs on this device, even with the app closed.'}</p>
          <button type="button" onClick={turnOn}>Notify me</button>
          {notifyFailed && <p className="error" role="alert">Notifications could not be turned on. Try again.</p>}
        </section>
      )}
      <form className="add" onSubmit={add}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a job" aria-label="New job" disabled={!canChange} />
        <button type="submit" disabled={!canChange || !draft.trim()}>Add</button>
      </form>
      {readFailed && <p className="notice" role="alert">The list could not be read. Reload to try again.</p>}
      {(user === null) && <p className="notice" role="alert">Sign in to work on this list.</p>}
      {looker && <p className="notice">You can look at this list. To add or check off jobs, ask whoever shared it to let you make changes.</p>}
      {introFailed && <p className="error" role="alert">Your name could not be added to the list. <button type="button" className="link" onClick={retryIntroduction}>Try again</button></p>}
      {error && <p className="error" role="alert">{error}</p>}
      {unsent.map(({ job, sending, ...entry }) => (
        <p key={job.id} className="error" role="alert">
          <span className="clip">"<span>{job.text}</span>"</span> was saved, but no one was told about it.{' '}
          <button type="button" className="link" disabled={sending} onClick={() => announce({ job, sending, ...entry })}>{sending ? 'Telling them…' : 'Tell them again'}</button>
        </p>
      ))}
      {targetMissing && <p className="notice" role="status">The job that notification was about is not on the list. It may have been removed.</p>}
      {ready && (jobs.length > 0) && (
        <div className="views" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === 'all'} className={(view === 'all') ? 'on' : undefined} onClick={() => setView('all')}>All jobs</button>
          <button type="button" role="tab" aria-selected={view === 'done'} className={(view === 'done') ? 'on' : undefined} onClick={() => setView('done')}>Done</button>
        </div>
      )}
      {ready && (jobs.length < 1) && <p className="notice">No jobs yet.</p>}
      {ready && (jobs.length > 0) && (shown.length < 1) && <p className="notice">No jobs are done yet.</p>}
      <ul className="items">
        {shown.map(job => (
          <li key={job.id} data-job={job.id} className={[job.done && 'done', (highlight === job.id) && 'flash'].filter(Boolean).join(' ') || undefined} style={{ '--writer': colors.get(job.by) ?? colorForId(job.by) } as React.CSSProperties}>
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
