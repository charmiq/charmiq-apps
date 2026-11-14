import React, { useState } from 'react';

import { firstName, initials, type Person } from './people';

// who is on the list with you: the line at the top that says whether anyone else is
// here yet, and the people section beneath the jobs (who works on the list, who only
// looks at it, and how to bring someone in)
// ********************************************************************************
/** how far the document's shares have been read: `none` outside a saved document */
export type SharesStatus = 'none' | 'reading' | 'read' | 'failed';

const INVITE_TEXT = 'Come work on our Punch List with me. Open the document I shared with you: every job either of us adds shows up on both screens, marked in the color of whoever added it.';

// == Avatar ======================================================================
/** a solid avatar for someone who works on the list, a hollow one for someone who only
 *  looks at it; a person who has not opened the list has no name to show yet */
const Avatar = ({ person, size }: Readonly<{ person: Person; size: number; }>) => {
  const [broken, setBroken] = useState(false);
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.4), ...(person.writer ? { background: person.color } : { color: person.color, borderColor: person.color }) };
  return (
    <span className={person.writer ? 'avatar' : 'avatar looker'} style={style} aria-hidden="true">
      {(person.img && !broken) ? <img alt="" src={person.img} onError={() => setBroken(true)} /> : (person.opened ? initials(person.name) : '?')}
    </span>
  );
};

// == Together ====================================================================
/** the first names of up to two people, then how many more: `Ana`, `Ana and Lee`,
 *  `Ana, Lee and 2 more` */
const namesOf = (people: ReadonlyArray<Person>): string => {
  const names = people.slice(0, 2).map(person => firstName(person.name));
  if(people.length > 2) return `${names.join(', ')} and ${people.length - 2} more`;
  return names.join(' and ');
};

/** the line at the top of the list: whether anyone else is on it yet */
export const Together = ({ meId, looker, people, status, notice, onRetry }: Readonly<{ meId: string | undefined; looker: boolean; people: ReadonlyArray<Person>; status: SharesStatus; notice: string | null; onRetry: () => void; }>) => {
  if(status === 'none') return <section className="together"><div className="words"><p className="title">Save this list in a document to share it.</p><p className="sub">Who else is on the list comes from the document's shares, and there is no document here yet.</p></div></section>;

  const others = people.filter(person => person.id !== meId);
  const writers = others.filter(person => person.writer), lookers = others.filter(person => !person.writer);
  const opened = writers.filter(person => person.opened);
  const me = people.find(person => person.id === meId);

  let title: string, sub: string;
  if(looker) {
    // someone who only looks is never "in with" anyone: they watch the list
    title = (opened.length > 0) ? `${namesOf(opened)} ${(opened.length === 1) ? 'is' : 'are'} working on this list.` : 'You are looking in on this list.';
    sub = 'Every job they add shows up here, marked in the color of whoever added it.';
  } else if(opened.length > 0) {
    title = `${namesOf(opened)} ${(opened.length === 1) ? 'is' : 'are'} in with you.`;
    sub = 'Every job either of you adds shows up on both screens, marked in the color of whoever added it.';
  } else if(status !== 'read') {
    // without the shares no one can say who else has a seat: never "just you"
    title = (status === 'reading') ? 'Finding out who else is here…' : (notice ?? 'Who has this document could not be read.');
    sub = (status === 'reading') ? 'Who else is on the list comes from the document\'s shares.' : 'Anyone who opens the list still shows up here.';
  } else if(writers.length > 0) {
    title = (writers.length === 1) ? 'The person you invited hasn\'t dropped by yet.' : 'The people you invited haven\'t dropped by yet.';
    sub = 'They have a seat on this document. Once they open it, their name and color show up here.';
  } else if(lookers.length > 0) {
    title = 'Only guests so far.';
    sub = 'Guests can look at the list but can\'t change it. Share this document with someone who can make changes to work on it together.';
  } else {
    title = 'It\'s just you in here.';
    sub = 'Share this document with someone and let them make changes. Once they open it, they show up right here.';
  }
  const shown = [...(me ? [me] : []), ...(opened.length ? opened : writers)].slice(0, 3);
  return (
    <section className="together">
      <div className="duo">{shown.map(person => <Avatar key={person.id} person={person} size={34} />)}{(writers.length < 1) && <span className="avatar slot" aria-hidden="true">+</span>}</div>
      <div className="words">
        <p className="title" role={(status === 'failed') && (opened.length < 1) ? 'alert' : undefined}>{title}</p>
        <p className="sub">{sub}</p>
        {(status === 'failed') && <button type="button" className="link" onClick={onRetry}>Try again</button>}
      </div>
    </section>
  );
};

// == People ======================================================================
/** the people section: who works on the list, who only looks at it, and the card that
 *  brings someone in. `people` arrives sorted (SEE: ./people.ts byPlace) */
export const People = ({ meId, looker, people, status }: Readonly<{ meId: string | undefined; looker: boolean; people: ReadonlyArray<Person>; status: SharesStatus; }>) => {
  const [copied, setCopied] = useState<string | null>(null);
  if(status === 'none') return null/*Together says why*/;

  const writers = people.filter(person => person.writer), lookers = people.filter(person => !person.writer);
  const anyoneElse = writers.some(person => person.id !== meId);
  const row = (person: Person) => (
    <li key={person.id}>
      <Avatar person={person} size={32} />
      <span className="who">
        <span className="name" title={person.name}>{person.name}{(person.id === meId) && ' (you)'}</span>
        {/* someone who only looks writes no member line, so whether they opened it is unknown */}
        {(person.id !== meId) && <span className="status">{!person.writer ? 'Can see the jobs' : person.opened ? 'Has opened the list' : 'Hasn\'t opened it yet'}</span>}
      </span>
      {(person.id !== meId) && <span className={person.writer ? 'role' : 'role looker'}>{person.writer ? 'Works on it' : 'Looks in'}</span>}
    </li>
  );
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(INVITE_TEXT);
      setCopied('Invite text copied.');
    } catch{
      setCopied(`Copy this and send it with the link: ${INVITE_TEXT}`);
    }
  };
  return (
    <section className="people">
      <h2>On this list</h2>
      <ul className="rows">{writers.map(row)}</ul>
      {(lookers.length > 0) && <><h2>Looking in <small>they can see the jobs but not change them</small></h2><ul className="rows">{lookers.map(row)}</ul></>}
      {!looker && <div className={anyoneElse ? 'invite' : 'invite nudge'}>
        <h3>{anyoneElse ? 'Want to add another?' : 'Bring someone in'}</h3>
        <p>{anyoneElse ? 'Share this document with more people and they show up above.' : 'Share this document with them and let them make changes. They open the same page, and every job either of you adds shows up on both screens.'}</p>
        <ol>
          <li>Open this document's <b>Share</b> menu</li>
          <li>Add them, and let them <b>make changes</b> (Editor)</li>
          <li>Send them the link</li>
        </ol>
        <button type="button" onClick={() => void copyInvite()}>Copy invite text</button>
        {copied && <p className="copied" role="status">{copied}</p>}
      </div>}
    </section>
  );
};
