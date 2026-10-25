// a tab's text changed by the text a caller names, never by offsets it would have to
// count: each edit's find text, exactly once in the text as the edits before it left
// it, replaced in order, the whole refused when one is not there once. What changes
// goes in as the one range from the first character changed to the last, so a long
// tab takes a small edit (its undo, its cursor and its collaborators see that alone)
// ********************************************************************************
// == Types =======================================================================
/** one replacement: the text to find, exactly once, and what replaces it */
export type Replacement = Readonly<{ find: string; replace: string; }>;
/** the one range a tab's text changes over: from inclusive, to exclusive, and what
 *  goes there */
export type ChangedRange = Readonly<{ from: number; to: number; insert: string; }>;

// == Replace =====================================================================
/** the range `edits` change `text` over, undefined when they change nothing; throws,
 *  naming the edit, for one not in its form or whose find text is not there once */
export const replaced = (text: string, edits: ReadonlyArray<unknown>): ChangedRange | undefined => {
  if(edits.length < 1) throw new Error('No edits given.');
  let next = text;
  edits.forEach((edit, index) => {
    const { find, replace } = (edit ?? {}) as Record<string, unknown>;
    if((typeof find !== 'string') || (find.length < 1) || (typeof replace !== 'string')) throw new Error(`edits[${index}]: find is the text to replace, and replace what replaces it`);
    const at = next.indexOf(find);
    if(at < 0) throw new Error(`edits[${index}]: its find text is not in the tab as the edits before it left it (getText reads it)`);
    const count = occurrences(next, find);
    if(count > 1) throw new Error(`edits[${index}]: its find text occurs ${count} times; include more of the text around it so it occurs once`);
    next = next.slice(0, at) + replace + next.slice(at + find.length);
  });
  if(next === text) return undefined/*nothing changed*/;

  // the text both share before the change and after it
  let start = 0;
  while((start < text.length) && (start < next.length) && (text[start] === next[start])) start++;
  let end = 0;
  while((end < (text.length - start)) && (end < (next.length - start)) && (text[text.length - 1 - end] === next[next.length - 1 - end])) end++;
  return { from: start, to: text.length - end, insert: next.slice(start, next.length - end) };
};

// == Internal ====================================================================
/** how often `find` occurs in `text`, each counted from where the one before began
 *  (so a find that overlaps itself counts each place it could be replaced) */
const occurrences = (text: string, find: string): number => {
  let count = 0;
  for(let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + 1)) count++;
  return count;
};
