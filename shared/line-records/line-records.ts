import type { AppContent, ContentChange } from '../charmiq';

// records kept one per line in an app-content (JSON Lines), written through the
// app-content shown: a write is the one guarded change that makes the app-content
// the lines wanted, refused whole when it has changed since. A record with an id is
// measured again by that id on the app-content as it is now
// SEE: tutorials/03-writing-data for the line-record pattern, explained
// ********************************************************************************
// == Edit ========================================================================
/** the text as lines, each with the line break that ends it (the last may have none) */
const terminatedLines = (text: string): string[] => (text === '') ? [] : (text.match(/[^\n]*\n|[^\n]+$/g) ?? []);

/** the changes that make `text` these lines (each ending its line), replacing whole
 *  lines only: the runs of lines that differ, last first (each measured after the
 *  ones before it). A line both hold once each (every record, since each carries its
 *  id) and in the same order stays as it is, however large the change around it */
export const lineChanges = (text: string, lines: ReadonlyArray<string>): ContentChange[] => {
  const before = terminatedLines(text), after = lines.map(line => `${line}\n`);
  const offsets = before.reduce<number[]>((starts, line) => [ ...starts, starts[starts.length - 1] + line.length ], [ 0 ]);
  return lineHunks(before, after)
    .map(hunk => ({ from: offsets[hunk.oldStart], to: offsets[hunk.oldEnd], insert: after.slice(hunk.newStart, hunk.newEnd).join('') }))
    .reverse();
};

type Hunk = Readonly<{ oldStart: number; oldEnd: number; newStart: number; newEnd: number; }>;

/** the runs that differ between two line lists (patience diff): the lines each holds
 *  once, in the longest order both share, stand; the runs between them differ */
const lineHunks = (before: ReadonlyArray<string>, after: ReadonlyArray<string>): Hunk[] => {
  const hunks: Hunk[] = [];
  const span = (oldFrom: number, oldTo: number, newFrom: number, newTo: number): void => {
    // what both share at the start and end of the span stands
    while((oldFrom < oldTo) && (newFrom < newTo) && (before[oldFrom] === after[newFrom])) { oldFrom++; newFrom++; }
    while((oldFrom < oldTo) && (newFrom < newTo) && (before[oldTo - 1] === after[newTo - 1])) { oldTo--; newTo--; }
    if((oldFrom === oldTo) && (newFrom === newTo)) return/*the same*/;

    const anchors = uniqueAnchors(before, oldFrom, oldTo, after, newFrom, newTo);
    if(anchors.length < 1) { hunks.push({ oldStart: oldFrom, oldEnd: oldTo, newStart: newFrom, newEnd: newTo }); return/*nothing both hold once: all of it differs*/; }
    let oldGap = oldFrom, newGap = newFrom;
    for(const [ oldIndex, newIndex ] of anchors) { span(oldGap, oldIndex, newGap, newIndex); oldGap = oldIndex + 1; newGap = newIndex + 1; }
    span(oldGap, oldTo, newGap, newTo);
  };
  span(0, before.length, 0, after.length);
  return hunks;
};

/** the lines each side of a span holds exactly once, paired, reduced to the longest
 *  run whose order both share (patience sorting) */
const uniqueAnchors = (before: ReadonlyArray<string>, oldFrom: number, oldTo: number, after: ReadonlyArray<string>, newFrom: number, newTo: number): Array<[ number, number ]> => {
  const once = (sequence: ReadonlyArray<string>, from: number, to: number) => {
    const seen = new Map<string, number>()/*line -> its index, or -1 when it repeats*/;
    for(let index=from; index<to; index++) seen.set(sequence[index], seen.has(sequence[index]) ? -1 : index);
    return seen;
  };
  const oldOnce = once(before, oldFrom, oldTo), newOnce = once(after, newFrom, newTo);
  const pairs: Array<[ number, number ]> = [];
  for(let index=oldFrom; index<oldTo; index++) {
    const oldIndex = oldOnce.get(before[index]), newIndex = newOnce.get(before[index]);
    if((oldIndex === index) && (newIndex !== undefined) && (newIndex >= 0)) pairs.push([ index, newIndex ]);
  }

  // the longest run of pairs increasing in the new order
  const tails: number[] = [], previous = new Array<number>(pairs.length).fill(-1);
  pairs.forEach(([ , newIndex ], at) => {
    let low = 0, high = tails.length;
    while(low < high) { const middle = (low + high) >> 1; if(pairs[tails[middle]][1] < newIndex) low = middle + 1; else high = middle; }
    if(low > 0) previous[at] = tails[low - 1];
    tails[low] = at;
  });
  const run: Array<[ number, number ]> = [];
  for(let at=(tails.length > 0) ? tails[tails.length - 1] : -1; at >= 0; at = previous[at]) run.unshift(pairs[at]);
  return run;
};

/** makes the app-content these lines, through it and guarded by it, replacing whole
 *  lines only (SEE: lineChanges): a line is always one writer's whole record, so two
 *  writers changing one record at once leave one of them (or both, as two lines),
 *  never a record mixed from the two */
export const writeLines = async (content: AppContent, lines: ReadonlyArray<string>): Promise<void> => {
  const changes = lineChanges(content.text, lines);
  if(changes.length > 0) await content.edit(changes);
};

/** a write refused because its app-content changed since it was shown */
export const isConflict = (error: unknown): boolean => ((error as { code?: unknown; } | null)?.code === 'app/content-conflict');

// == Records =====================================================================
/** an app-content's records one per line: an app-content holding one JSON array
 *  (an older Application's) is its elements, so a write turns it into lines */
export const recordLines = (content: Pick<AppContent, 'lines'>): ReadonlyArray<string> => {
  const text = content.lines.join('\n').trim();
  if(!text.startsWith('[')) return content.lines;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(record => JSON.stringify(record)) : content.lines;
  } catch{
    return content.lines/*not one array*/;
  }
};

/** the record a line holds, or null for a blank or malformed line (kept as
 *  written, never shown) */
export const parseRecord = (line: string): Record<string, unknown> | null => {
  const s = line.trim();
  if(s.length < 1) return null/*blank*/;
  try {
    const parsed: unknown = JSON.parse(s);
    return (parsed && (typeof parsed === 'object') && !Array.isArray(parsed)) ? parsed as Record<string, unknown> : null;
  } catch{
    return null/*malformed*/;
  }
};
