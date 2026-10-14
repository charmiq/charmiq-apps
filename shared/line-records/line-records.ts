import type { AppContent, ContentChange } from '../charmiq';

// records kept one per line in an app-content (JSON Lines), written through the
// app-content shown: a write is the one guarded change that makes the app-content
// the lines wanted, refused whole when it has changed since. A record with an id is
// measured again by that id on the app-content as it is now
// SEE: tutorials/03-writing-data for the line-record pattern, explained
// ********************************************************************************
// == Edit ========================================================================
/** the one change that makes `text` these lines (each ending its line when the
 *  text ends its last): the run between what both share at the start and at the
 *  end. Null when nothing changes */
export const changeTo = (text: string, lines: ReadonlyArray<string>): ContentChange | null => {
  const next = (lines.length < 1) ? '' : (lines.join('\n') + (text.endsWith('\n') ? '\n' : ''));
  if(next === text) return null;

  let start = 0;
  while((start < text.length) && (start < next.length) && (text[start] === next[start])) start++;
  let end = 0;
  while((end < text.length - start) && (end < next.length - start) && (text[text.length - 1 - end] === next[next.length - 1 - end])) end++;
  return { from: start, to: text.length - end, insert: next.slice(start, next.length - end) };
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
