import type { SoundCue } from './recorder';

// the edits the timeline and the Gait mode make to the scene's code, each one range of it measured on
// the whole scene as it was read (SEE: apps/codemirror-editor's editText, refused once
// the scene has changed since): a sound added is its own line at the scene's end; a
// sound moved is its time rewritten where its call writes it, on the line the
// recorder took it from, and a sound played until a time moves its `until` with it.
// Only code is read for a call, never a comment or a string. A time the scene writes as
// an expression (`HOME`, `RAMP + 0.2`) is the scene's to change, so moving such a sound
// is refused, saying where it is written. What an edit plays is checked before it is
// written: the scene as edited must play the sounds the scene did, with only that one
// added or moved. A gait shaped is its call's keys rewritten in place (or its own
// line at the scene's start, the scene naming none), refused where the scene writes
// them as anything but `{ ... }`
// ********************************************************************************
// == Types =======================================================================
/** one range of the scene's code, `from` to `to` (offsets into `measured`, the whole
 *  scene it was measured on), replaced by `text` */
export type SceneEdit = Readonly<{ measured: string; from: number; to: number; text: string; }>;
/** an edit the scene cannot take, and why */
export type Refusal = Readonly<{ refused: string; }>;

// == Edits =======================================================================
/** the edit that plays a Platform file from `time`: its own line at the scene's end,
 *  the file's name beside it for the reader (one line of comment, whatever the name
 *  holds) */
export const addSound = (code: string, time: number, uri: string, label: string): SceneEdit => {
  const lead = ((code.length > 0) && !LINE_BREAK.test(code[code.length - 1])) ? '\n' : '';
  const named = label.replace(LINE_BREAKS, ' ').trim();
  return { measured: code, from: code.length, to: code.length, text: `${lead}sound.at(${seconds(time)}, ${literal(uri)})${(named.length > 0) ? ` // ${named}` : ''}\n` };
};

/** the edit that moves a sound to `time` (its `until` with it): its time, and its
 *  `until`, rewritten where its call writes them as numbers; refused when either is
 *  written otherwise, when the line plays that sound twice at that time, or when the
 *  timeline cannot find its call on its line */
export const retimeSound = (code: string, cue: SoundCue, time: number): SceneEdit | Refusal => {
  const line = lineAt(code, cue.line);
  if(!line) return { refused: 'Its line in the scene is not known' };
  const runs = inert(code);
  const calls = [...runs.slice(line.start, line.end).matchAll(SOUND_CALL)].flatMap(call => {
    const [timeAt, nameAt] = [call.indices![1]!, call.indices![3]!].map(([from, to]) => [line.start + from, line.start + to] as const);
    return (code.slice(...nameAt) === cue.name) ? [{ time: code.slice(...timeAt), timeAt, after: line.start + call.index + call[0].length }] : [];
  });
  const written = calls.filter(call => NUMBER.test(call.time) && (Math.abs(Number(call.time) - cue.time) < TIME_EPSILON));
  if(written.length > 1) return { refused: `Line ${cue.line} plays it twice at ${seconds(cue.time)} s` };
  if(written.length < 1) return { refused: (calls.length > 0) ? `Its time is written as ${calls[0].time} on line ${cue.line}: change it there` : `The timeline cannot find it on line ${cue.line}: change it there` };
  const [call] = written;
  const start = Math.max(0, time);
  if(cue.until === undefined) return { measured: code, from: call.timeAt[0], to: call.timeAt[1], text: seconds(start) };

  // played until a time: its `until`, written in the call's options, moves with it
  const until = untilOf(code, runs, call.after);
  if(!until || !NUMBER.test(until.text) || (Math.abs(Number(until.text) - cue.until) >= TIME_EPSILON)) return { refused: `Its until is written as ${until?.text ?? 'something else'} on line ${cue.line}: change it there` };
  return { measured: code, from: call.timeAt[0], to: until.at[1], text: `${seconds(start)}${code.slice(call.timeAt[1], until.at[0])}${seconds(cue.until + (start - cue.time))}` };
};

/** the edit that writes the scene's gait `name` as `keys` (what it changes from the
 *  built-in walk, SEE: writtenGait): its call's keys rewritten where it writes them, or,
 *  the scene naming no such gait (`written` none), its own line at the scene's start;
 *  refused when its keys are written as anything but `{ ... }`, or its call cannot be
 *  found on its line */
export const regait = (code: string, written: Readonly<{ name: string; line?: number; }> | undefined, name: string, keys: Readonly<Record<string, unknown>>): SceneEdit | Refusal => {
  if(!written) return { measured: code, from: 0, to: 0, text: `gait(${literal(name)}, ${gaitLiteral(writtenGait(keys), '')});\n` };
  const line = lineAt(code, written.line);
  if(!line) return { refused: 'Its line in the scene is not known' };
  const text = gaitLiteral(writtenGait(keys), /^[ \t]*/.exec(code.slice(line.start, line.end))![0]/*its line's indent*/);
  const runs = inert(code);
  const calls = [...runs.slice(line.start, line.end).matchAll(GAIT_CALL)].filter(call => { const [from, to] = call.indices![2]!; return code.slice(line.start + from, line.start + to) === name; });
  if(calls.length !== 1) return { refused: `gait('${name}') is not found on line ${written.line}: change it there` };
  // past the name: its keys, or the call's end
  const after = (at: number) => { while(/\s/.test(runs[at] ?? '')) at++; return at; };
  let at = after(line.start + calls[0].index + calls[0][0].length);
  if(runs[at] === ')') return { measured: code, from: at, to: at, text: `, ${text}` };
  if(runs[at] === ',') at = after(at + 1);
  const close = (runs[at] === '{') ? closing(runs, at) : undefined/*not written as { ... }*/;
  if(close === undefined) return { refused: `gait('${name}')'s keys are not written as { ... } on line ${written.line}: change them there` };
  return { measured: code, from: at, to: close + 1, text };
};

/** a gait's keys as the scene writes them: each number to two places */
export const writtenGait = (keys: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> => {
  const round = (value: unknown): unknown => Array.isArray(value) ? value.map(round)
    : ((typeof value === 'object') && (value !== null)) ? Object.fromEntries(Object.entries(value).map(([key, each]) => [key, round(each)]))
    : (typeof value === 'number') ? Number(value.toFixed(2)) : value;
  return Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, round(value)]));
};

/** whether two gaits' keys say the same: the same keys, the same numbers */
export const sameGait = (one: Readonly<Record<string, unknown>> | undefined, other: Readonly<Record<string, unknown>> | undefined): boolean => JSON.stringify(sorted(one ?? {})) === JSON.stringify(sorted(other ?? {}));

/** whether an edit, or what it plays, refused */
export const isRefusal = <T extends object>(result: T | Refusal): result is Refusal => 'refused' in result;

/** the scene as an edit leaves it */
export const applyEdit = (edit: SceneEdit): string => edit.measured.slice(0, edit.from) + edit.text + edit.measured.slice(edit.to);

// == What an Edit Plays ==========================================================
/** the sounds a scene playing `sounds` plays once a Platform file plays from `time` */
export const soundsAdded = (sounds: ReadonlyArray<SoundCue>, time: number, uri: string): ReadonlyArray<SoundCue> => [...sounds, { time: Number(seconds(time)), name: uri, volume: 1 }];

/** the sounds a scene playing `sounds` plays once `cue` moves to `time` (its `until`
 *  with it); refused when the scene no longer plays `cue` */
export const soundsMoved = (sounds: ReadonlyArray<SoundCue>, cue: SoundCue, time: number): ReadonlyArray<SoundCue> | Refusal => {
  const at = sounds.findIndex(each => (each.line === cue.line) && (each.name === cue.name) && (Math.abs(each.time - cue.time) < TIME_EPSILON));
  if(at < 0) return { refused: 'The scene no longer plays it there: try again' };
  const start = Number(seconds(Math.max(0, time)));
  const moved = { ...sounds[at], time: start, ...((cue.until !== undefined) ? { until: Number(seconds(cue.until + (start - cue.time))) } : {}) };
  return sounds.map((each, index) => (index === at) ? moved : each);
};

/** whether two scenes play the same sounds: the same times, names, volumes, spans
 *  and actors, in any order, wherever their lines stand */
export const sameSounds = (one: ReadonlyArray<SoundCue>, other: ReadonlyArray<SoundCue>): boolean => {
  const keys = (sounds: ReadonlyArray<SoundCue>) => sounds.map(({ time, name, volume, until, actor }) => JSON.stringify([Number(seconds(time)), name, volume, (until === undefined) ? null : Number(seconds(until)), actor ?? null])).sort();
  const [a, b] = [keys(one), keys(other)];
  return (a.length === b.length) && a.every((key, index) => key === b[index]);
};

// == Internal ====================================================================
// a sound's call in code: `at(` or `sound(`, its time (group 1, up to its comma) and
// its sound (group 3, a quoted string, its contents blanked: SEE: inert), the places
// kept (`d`)
const SOUND_CALL = /\b(?:at|sound)\(\s*([^,()]*?)\s*,\s*(['"])( *)\2/dg;
// a call's `until` in its options: its value up to the next comma or brace
const UNTIL = /\buntil\s*:\s*([^,{}()]*?)\s*(?=[,}])/d;
// a gait's call in code: `gait(` and its name (group 2, a quoted string, its contents
// blanked: SEE: inert), the places kept (`d`)
const GAIT_CALL = /\bgait\(\s*(['"])( *)\1/dg;
// a time written as a number
const NUMBER = /^\d+(?:\.\d+)?$/;
// a time past a cue's that rounding alone puts there (seconds)
const TIME_EPSILON = 1e-9;
// every character that ends a line of JavaScript, a line comment included
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const LINE_BREAKS = /[\n\r\u2028\u2029]+/g;

// a time as the scene writes it: seconds to the millisecond, no trailing zeros
const seconds = (time: number): string => String(Number(Math.max(0, time).toFixed(3)));

// text as a single-quoted string literal of the scene's: its quotes, backslashes and
// line breaks escaped
const literal = (text: string): string => `'${text.replace(/[\\'\n\r\u2028\u2029]/g, character => (character === '\\') ? '\\\\' : (character === '\'') ? '\\\'' : `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;

// the code with every comment and every string's or template's contents blanked
// (offsets and line breaks kept), so a pattern finds only what runs: a call in a
// comment or a string is no call. A template's `${}` is blanked with it, its calls the
// scene's to change. A `/` not starting a comment is division (a regular expression
// holding a quote blanks the rest of its line: the timeline then finds no call there)
const inert = (code: string): string => {
  const kept = code.split('')/*UTF-16 units, as every offset counts*/;
  const blank = (from: number, to: number) => { for(let at=from; at<Math.min(to, kept.length); at++) if(!LINE_BREAK.test(kept[at])) kept[at] = ' '; };
  let at = 0;
  while(at < code.length) {
    const [character, next] = [code[at], code[at + 1]];
    if((character === '/') && (next === '/')) {
      let end = at;
      while((end < code.length) && !LINE_BREAK.test(code[end])) end++;
      blank(at, end);
      at = end;
    } else if((character === '/') && (next === '*')) {
      const close = code.indexOf('*/', at + 2);
      const end = (close < 0) ? code.length : (close + 2);
      blank(at, end);
      at = end;
    } else if((character === '\'') || (character === '"') || (character === '`')) {
      let end = at + 1;
      while((end < code.length) && (code[end] !== character) && ((character === '`') || !LINE_BREAK.test(code[end]))) end += (code[end] === '\\') ? 2 : 1;
      if(character === '`') blank(at, end + 1)/*the whole template, its quotes too*/;
      else blank(at + 1, end)/*the string's contents, its quotes kept*/;
      at = end + 1;
    } else at++;
  }
  return kept.join('');
};

// a gait's keys written as the scene writes them: a key a line, indented past `indent`
const gaitLiteral = (keys: Readonly<Record<string, unknown>>, indent: string): string => {
  const valueOf = (value: unknown): string => Array.isArray(value) ? `[${value.map(valueOf).join(', ')}]`
    : ((typeof value === 'object') && (value !== null)) ? `{ ${Object.entries(value).map(([key, each]) => `${key}: ${valueOf(each)}`).join(', ')} }` : String(value);
  const lines = Object.entries(keys).map(([key, value]) => `${indent}  ${key}: ${valueOf(value)},`);
  return (lines.length < 1) ? '{}' : `{\n${lines.join('\n')}\n${indent}}`;
};

// a value with every object's keys in order, so two written alike compare alike
const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
  : ((typeof value === 'object') && (value !== null)) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, each]) => [key, sorted(each)])) : value;

// where the bracket opening at `open` closes in code alone (`runs`, SEE: inert); none
// when it never does
const closing = (runs: string, open: number): number | undefined => {
  let depth = 0;
  for(let at=open; at<runs.length; at++) {
    if('({['.includes(runs[at])) depth++;
    else if(')}]'.includes(runs[at]) && (--depth === 0)) return at;
  }
  return undefined/*never closed*/;
};

// the `until` in a call's options: from `after` (past its sound) to the call's closing
// parenthesis, read in code alone; its text and where it stands
const untilOf = (code: string, runs: string, after: number): Readonly<{ text: string; at: readonly [number, number]; }> | undefined => {
  let depth = 0, end = after;
  for(; end<runs.length; end++) {
    const character = runs[end];
    if('({['.includes(character)) depth++;
    else if(')}]'.includes(character)) { if(depth === 0) break; depth--; }
  }
  const found = UNTIL.exec(runs.slice(after, end));
  if(!found) return undefined/*no until in its options*/;
  const [from, to] = found.indices![1]!;
  return { text: code.slice(after + from, after + to), at: [after + from, after + to] };
};

// a line of the code (from 1): where it starts and ends
const lineAt = (code: string, line: number | undefined): Readonly<{ start: number; end: number; }> | undefined => {
  if((line === undefined) || (line < 1)) return undefined/*not known*/;
  let start = 0;
  for(let at=1; at<line; at++) {
    const next = code.indexOf('\n', start);
    if(next < 0) return undefined/*past the code's end*/;
    start = next + 1;
  }
  const end = code.indexOf('\n', start);
  return { start, end: (end < 0) ? code.length : end };
};
