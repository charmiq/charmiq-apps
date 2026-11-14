import { parseRecord } from '/shared/line-records/line-records';

import type { ApplicationDocument, CharmIQError, CharmIQMcpAPI } from '../../shared/charmiq';
import type { ListChange } from './jobs';

// the people on the Punch List. Each person who opens the list writes their own
// `member` line beside the jobs: their name, picture and a color no one else on the list
// uses. Who else has the document comes from its shares (`describe_file`): Editors and
// Owners work on the list, Commenters and Viewers only look at it, and someone invited
// who has not opened the list yet has a seat and no member line
// ********************************************************************************
/** the colors a person can be given, in the order they are handed out */
const PALETTE = [
  { id: 'coral', hex: '#e5484d' }, { id: 'blue', hex: '#2f6bff' }, { id: 'mint', hex: '#1f9d55' }, { id: 'violet', hex: '#8e52e0' },
  { id: 'tangerine', hex: '#e07b00' }, { id: 'teal', hex: '#0e9bb0' }, { id: 'pink', hex: '#d6407f' }, { id: 'olive', hex: '#7a8a00' },
] as const;
/** the Share Roles that may change the document (a Manager only on a Folder) */
const WRITER_ROLES: ReadonlySet<string> = new Set(['owner', 'manager', 'editor']);

export type Member = Readonly<{ k: 'member'; id: string; name: string; img: string; c: string; }>;
/** who is opening the list, as their member line holds them */
export type Me = Readonly<{ id: string; name: string; img: string; }>;
/** one User's (or invited email's) Share Role on the document */
export type Share = Readonly<{ user: string; role: string; }>;

/** someone with a seat on the list */
export type Person = Readonly<{
  id: string;
  /** their name once they have opened the list; until then their email, when they were
   *  invited by one, or a placeholder */
  name: string;
  img: string;
  color: string;
  /** may change the list (Editor or Owner); otherwise they only look at it */
  writer: boolean;
  /** has opened the list: their member line is on it */
  opened: boolean;
}>;

// == Colors ======================================================================
/** the color a palette id names (an unknown id: the first) */
export const colorOf = (id: string | undefined): string => (PALETTE.find(color => color.id === id) ?? PALETTE[0]).hex;
/** a color for someone with no member line yet: the same on every screen */
export const colorForId = (id: string): string => {
  let hash = 0;
  for(const char of id) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length].hex;
};

// == Member Lines ================================================================
/** the member a line holds, or null for any other line */
const memberOf = (line: string): Member | null => {
  const record = parseRecord(line);
  return ((record?.k === 'member') && (typeof record.id === 'string')) ? record as Member : null;
};
/** the members the list's lines hold, by User id */
export const membersIn = (lines: ReadonlyArray<string>): Map<string, Member> =>
  new Map(lines.map(memberOf).filter((member): member is Member => !!member).map(member => [member.id, member]));

/** whether this person's member line is missing, or holds an older name or picture */
export const needsIntroduction = (members: ReadonlyMap<string, Member>, me: Me): boolean => {
  const member = members.get(me.id);
  return !member || (member.name !== me.name) || (member.img !== me.img);
};

/** the list with this person's member line: added on their first open with a color no
 *  one else on the list uses (chosen from the list as it stands when it is written),
 *  rewritten when their name or picture changes, their color kept */
export const introducing = (me: Me): ListChange => lines => {
  const members = membersIn(lines);
  if(!needsIntroduction(members, me)) return lines/*already as they are*/;
  const used = new Set([...members.values()].filter(member => member.id !== me.id).map(member => member.c));
  const color = members.get(me.id)?.c ?? (PALETTE.find(entry => !used.has(entry.id)) ?? PALETTE[0]).id;
  const line = JSON.stringify({ k: 'member', id: me.id, name: me.name, img: me.img, c: color } satisfies Member);
  return members.has(me.id) ? lines.map(each => (memberOf(each)?.id === me.id) ? line : each) : [...lines, line];
};

// == Shares ======================================================================
/** the document's current shares, read with the VFS `describe_file` tool in verbose
 *  mode (scope `mcp.platform.vfs`). Its declared output carries `shares` (each
 *  `{ user, role }`: a User id or an invited email, and a Share Role) in verbose mode,
 *  absent when the document has no active shares. Rejects when the Platform refuses
 *  the read or answers without a result: an unread list is never "nobody else" */
export const readShares = async (mcp: CharmIQMcpAPI, document: ApplicationDocument): Promise<Share[]> => {
  // only the shares are wanted: the outline is filtered down to the Applications
  const result = await mcp.callTool('vfs', 'describe_file', { uri: document.uri, verbose: true, types: ['iframe-app'] });
  if(result.isError) throw new Error(result.content.map(part => part.text).join('\n') || 'The Platform refused to describe the document');
  const described = result.structuredContent as { shares?: unknown; } | null | undefined;
  if(!described || (typeof described !== 'object')) throw new Error('The Platform described the document without a result');
  if(described.shares === undefined) return []/*no active shares*/;
  if(!Array.isArray(described.shares)) throw new Error('The Platform described the document\'s shares in an unknown shape');
  return (described.shares as unknown[])
      .filter((share): share is Share => !!share && (typeof (share as Share).user === 'string') && (typeof (share as Share).role === 'string'))
      .map(({ user, role }) => ({ user, role }));
};

/** what to tell the person when the shares could not be read */
export const sharesFailureNotice = (error: unknown): string => {
  const code = (error as CharmIQError | null)?.code;
  return ((code === 'functions/permission-denied') || (code === 'functions/cancelled'))
    ? 'This list was not allowed to see who has the document.'
    : 'Who has this document could not be read.';
};

// == People ======================================================================
/** everyone with a seat: each share, named by their member line once they have opened
 *  the list, and everyone with a member line the shares do not name (access through a
 *  Folder, say), who wrote here and so may change it. Without the shares (unread or
 *  refused) it is the people who opened the list. A Share Role this list does not
 *  know only looks. The person looking (`me`) has opened it, their member line written
 *  or not */
export const peopleOf = (shares: ReadonlyArray<Share> | null, members: ReadonlyMap<string, Member>, me: Me | null): Person[] => {
  const people = new Map<string, Person>();
  for(const { user, role } of shares ?? []) {
    const member = members.get(user), writer = WRITER_ROLES.has(role);
    people.set(user, member
      ? { id: user, name: member.name, img: member.img, color: colorOf(member.c), writer, opened: true }
      : { id: user, name: user.includes('@') ? user : (writer ? 'Someone you invited' : 'A guest'), img: '', color: colorForId(user), writer, opened: false });
  }
  for(const member of members.values()) {
    if(!people.has(member.id)) people.set(member.id, { id: member.id, name: member.name, img: member.img, color: colorOf(member.c), writer: true, opened: true });
  }
  const seat = me && people.get(me.id);
  if(me && !seat?.opened) people.set(me.id, { id: me.id, name: me.name, img: me.img, color: colorForId(me.id), writer: seat?.writer ?? true, opened: true });
  return [...people.values()];
};

/** you first, then those who opened the list by name (A–Z), then those who have not
 *  opened it yet by name */
export const byPlace = (meId: string | undefined) => (a: Person, b: Person): number =>
  (Number(b.id === meId) - Number(a.id === meId)) || (Number(b.opened) - Number(a.opened)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** the first word of a name */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;
/** up to two initials of a name */
export const initials = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';
