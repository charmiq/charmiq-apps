import type { Key, SoundCue } from './recorder';

// the edits the timeline, the Gait mode and the Pose mode make to the scene's code, each one range of it measured on
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
// them as anything but `{ ... }`. A key posed is the values given rewritten where its
// call writes them, its time (often an expression) and every other value as written,
// or, on a frame holding no key, a held key on its own line after the actor's last;
// what it keys is checked as a sound's edit is: the scene as edited must hold the keys
// the scene did, with only that one changed or added
// ********************************************************************************
// == Types =======================================================================
/** one range of the scene's code, `from` to `to` (offsets into `measured`, the whole
 *  scene it was measured on), replaced by `text` */
export type SceneEdit = Readonly<{ measured: string; from: number; to: number; text: string; }>;
/** an edit the scene cannot take, and why */
export type Refusal = Readonly<{ refused: string; }>;
/** an actor as a key's edit reads it: its name, the line the scene declares it on and
 *  its keys */
export type Keyed = Readonly<{ name: string; line?: number; keys: ReadonlyArray<Key>; }>;

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

/** the edit that writes `values` (each by its channel, a pose's joint as `pose.<joint>`)
 *  into an actor's key. With the `key` a frame holds, only those values are rewritten
 *  where its call writes them on its line (one the key lacks added), its time and
 *  every other value as written; refused when its call cannot be told on its line, or
 *  its values (or its pose, a joint given) are written as anything but `{ ... }` of
 *  `name: value` pairs. With none, a held key at `time` is its own line after the
 *  statement of the actor's last key (of its declaration, the actor having none), under
 *  the name the scene declares the actor by; refused when the scene declares it under
 *  none */
export const rekey = (code: string, actor: Keyed, key: Key | undefined, time: number, values: Readonly<Record<string, number>>): SceneEdit | Refusal => {
  const runs = inert(code);
  if(key) {
    const line = lineAt(code, key.line);
    if(!line) return { refused: 'Its line in the scene is not known' };
    // each key the line writes: its call's arguments
    const calls = [...runs.slice(line.start, line.end).matchAll(KEY_CALL)].flatMap(call => { const given = argumentsOf(runs, line.start + call.index + call[0].length - 1); return given ? [given] : []; });
    if(calls.length < 1) return { refused: `No key is found on line ${key.line}: change it there` };
    const timed = calls.filter(([at]) => { const written = at ? code.slice(...at) : ''; return NUMBER.test(written) && (Math.abs(Number(written) - key.time) < TIME_EPSILON); });
    const found = (calls.length === 1) ? calls[0] : (timed.length === 1) ? timed[0] : undefined/*which of them is not told*/;
    if(!found) return { refused: `Line ${key.line} writes more than one key: change it there` };
    const given = found[1];
    if(!given || (runs[given[0]] !== '{') || (closing(runs, given[0]) !== (given[1] - 1))) return { refused: `Its values are not written as { ... } on line ${key.line}: change them there` };
    const text = valuesRewritten(code, runs, given[0], given[1] - 1, values);
    if(text === 'values') return { refused: `Its values are not written as name: value pairs on line ${key.line}: change them there` };
    if(text === 'pose') return { refused: `Its pose is not written as { ... } on line ${key.line}: change it there` };
    return { measured: code, from: given[0], to: given[1], text: text.written };
  } /* else -- no key on the frame: one of its own */

  const declared = lineAt(code, actor.line);
  if(!declared) return { refused: 'Its line in the scene is not known' };
  const name = [...runs.slice(declared.start, declared.end).matchAll(DECLARED)].find(call => { const [from, to] = call.indices![3]!; return code.slice(declared.start + from, declared.start + to) === actor.name; })?.[1];
  if(name === undefined) return { refused: `The name the scene declares '${actor.name}' by is not found on line ${actor.line}: add its key there` };
  // past the statement its last key ends (a call chained over lines, values over lines)
  const last = lineAt(code, Math.max(...actor.keys.flatMap(each => (each.line !== undefined) ? [each.line] : []), actor.line!/*by contract: its line read above*/))!/*by contract: a line the scene ran*/;
  const end = statementEnd(runs, last.start);
  const call = `${name}.at(${timeText(time)}, ${valuesLiteral(values)}, 'hold')`;
  if(')}]'.includes(runs[end] ?? ' ')) return { measured: code, from: end, to: end, text: `; ${call} ` }/*its block ends on its line*/;
  const indent = /^[ \t]*/.exec(code.slice(declared.start, declared.end))![0];
  const ended = /;\s*$/.test(runs.slice(last.start, end)) ? ';' : ''/*as its statement ends*/;
  const at = Math.min(code.length, end + 1);
  return { measured: code, from: at, to: at, text: `${(end >= code.length) ? '\n' : ''}${indent}${call}${ended}\n` };
};

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

// == What an Edit Keys ===========================================================
/** the keys a scene's `actors` hold once `actor`'s `key` takes `values` (each to the
 *  thousandth, as written), or, with no key, once it holds a held key of them at `time` */
export const keysRekeyed = (actors: ReadonlyArray<Keyed>, actor: string, key: Key | undefined, time: number, values: Readonly<Record<string, number>>): ReadonlyArray<Keyed> => {
  const taken = Object.fromEntries(Object.entries(values).map(([channel, value]) => [channel, thousandth(value)]));
  return actors.map(each => {
    if(each.name !== actor) return each;
    if(!key) return { ...each, keys: [...each.keys, { time: Number(timeText(time)), values: taken, ease: 'hold' as const }] };
    const at = each.keys.findIndex(held => (held.line === key.line) && (Math.abs(held.time - key.time) < TIME_EPSILON));
    return { ...each, keys: each.keys.map((held, index) => (index === at) ? { ...held, values: { ...held.values, ...taken } } : held) };
  });
};

/** whether two scenes' actors hold the same keys: each actor's times, values and
 *  eases, in any order, wherever their lines stand */
export const sameKeys = (one: ReadonlyArray<Keyed>, other: ReadonlyArray<Keyed>): boolean => {
  const keys = (actors: ReadonlyArray<Keyed>) => actors.map(({ name, keys: held }) => JSON.stringify([name, held.map(({ time, values, ease }) => JSON.stringify([time, sorted(values), ease])).sort()])).sort();
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
// a key's call in code: `.at(`, up to its opening parenthesis
const KEY_CALL = /\.\s*at\s*\(/g;
// an actor declared under a name: the name (group 1) and the actor's own (group 3, a
// quoted string, its contents blanked: SEE: inert), the places kept (`d`)
const DECLARED = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*actor\s*\(\s*(['"])( *)\2/dg;
// a value's name before its colon, in a `{ ... }` of `name: value` pairs
const PAIR_NAME = /^([A-Za-z_$][\w$]*)\s*:\s*/;
// the values a key's `{ ... }` writes, in the order a key written whole names them, and
// a pose's joints in theirs
const KEY_VALUES = ['x', 'z', 'height', 'yaw', 'pitch', 'roll', 'visible'];
const POSE_JOINTS = ['head', 'hat', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'lean', 'leftWrist', 'rightWrist', 'twist'];
// a pose's joint as a key's channel names it
const POSE = 'pose.';
// a time written as a number
const NUMBER = /^\d+(?:\.\d+)?$/;
// a time past a cue's that rounding alone puts there (seconds)
const TIME_EPSILON = 1e-9;
// every character that ends a line of JavaScript, a line comment included
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const LINE_BREAKS = /[\n\r\u2028\u2029]+/g;

// a time as the scene writes it: seconds to the millisecond, no trailing zeros
const seconds = (time: number): string => String(Number(Math.max(0, time).toFixed(3)));

// a key's time as the scene writes it: the frame's own exactly, since a key stands on a
// frame only at its time (to the millisecond where that is the same time)
const timeText = (time: number): string => { const at = Math.max(0, time); return (Number(seconds(at)) === at) ? seconds(at) : String(at); };

// a key's value as the scene writes it: to the thousandth, never -0
const thousandth = (value: number): number => Number(value.toFixed(3)) || 0;

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

// a call's arguments in code alone (`runs`), its parenthesis opening at `open`: where
// each stands, its surrounding space left out; none when the call never closes
const argumentsOf = (runs: string, open: number): ReadonlyArray<readonly [number, number]> | undefined => {
  const close = closing(runs, open);
  return (close === undefined) ? undefined : listed(runs, open + 1, close);
};

// the pieces between `from` and `to` in code alone that commas part at that depth: where
// each stands, its surrounding space left out, an empty one (a comma trailing) left out
const listed = (runs: string, from: number, to: number): ReadonlyArray<readonly [number, number]> => {
  const pieces: Array<readonly [number, number]> = [];
  let depth = 0, start = from;
  const take = (end: number) => {
    let [first, last] = [start, end];
    while((first < last) && /\s/.test(runs[first])) first++;
    while((last > first) && /\s/.test(runs[last - 1])) last--;
    if(last > first) pieces.push([first, last]);
  };
  for(let at=from; at<to; at++) {
    if('({['.includes(runs[at])) depth++;
    else if(')}]'.includes(runs[at])) depth--;
    else if((runs[at] === ',') && (depth === 0)) { take(at); start = at + 1; }
  }
  take(to);
  return pieces;
};

// the `name: value` pairs a `{ ... }` writes (its braces at `open` and `close`): each
// name and where its value stands; none when a piece of it is anything else (a spread, a
// name alone, a name computed or quoted)
const pairsOf = (runs: string, open: number, close: number): ReadonlyArray<Readonly<{ name: string; value: readonly [number, number]; }>> | undefined => {
  const pairs = listed(runs, open + 1, close).map(([from, to]) => { const named = PAIR_NAME.exec(runs.slice(from, to)); return named ? { name: named[1], value: [from + named[0].length, to] as const } : undefined; });
  return pairs.every(pair => pair !== undefined) ? pairs : undefined;
};

// a key's `{ ... }` (its braces at `open` and `close`) with `values` written into it:
// each value it names rewritten where it stands, each it lacks added after its last, a
// pose's joints within its pose's `{ ... }` the same way; 'values' or 'pose' when that
// is written as anything but `{ ... }` of `name: value` pairs
const valuesRewritten = (code: string, runs: string, open: number, close: number, values: Readonly<Record<string, number>>): Readonly<{ written: string; }> | 'values' | 'pose' => {
  const pairs = pairsOf(runs, open, close);
  if(!pairs) return 'values';
  const changes: Array<Readonly<{ from: number; to: number; text: string; }>> = [];
  // writes `given` (name and value, in order) into the pairs of a `{ ... }`
  const write = (braces: readonly [number, number], within: NonNullable<ReturnType<typeof pairsOf>>, given: ReadonlyArray<readonly [string, string]>) => {
    const added = given.filter(([name]) => !within.some(pair => pair.name === name)).map(([name, value]) => `${name}: ${value}`);
    for(const [name, value] of given) { const pair = within.find(each => each.name === name); if(pair) changes.push({ from: pair.value[0], to: pair.value[1], text: value }); }
    if(added.length < 1) return/*every value named already*/;
    const last = within[within.length - 1];
    changes.push(last ? { from: last.value[1], to: last.value[1], text: `, ${added.join(', ')}` } : { from: braces[0] + 1, to: braces[1], text: ` ${added.join(', ')} ` });
  };
  const own = ordered(Object.keys(values).filter(channel => !channel.startsWith(POSE)), KEY_VALUES).map(channel => [channel, String(thousandth(values[channel]))] as const);
  const joints = ordered(Object.keys(values).filter(channel => channel.startsWith(POSE)).map(channel => channel.slice(POSE.length)), POSE_JOINTS).map(joint => [joint, String(thousandth(values[`${POSE}${joint}`]))] as const);
  const pose = pairs.find(pair => pair.name === 'pose');
  if((joints.length > 0) && pose) {
    const posed = ((runs[pose.value[0]] === '{') && (closing(runs, pose.value[0]) === (pose.value[1] - 1))) ? pairsOf(runs, pose.value[0], pose.value[1] - 1) : undefined;
    if(!posed) return 'pose';
    write([pose.value[0], pose.value[1] - 1], posed, joints);
  } /* else -- no joint given, or no pose written: one of its own */
  write([open, close], pairs, [...own, ...(((joints.length > 0) && !pose) ? [['pose', `{ ${joints.map(([joint, value]) => `${joint}: ${value}`).join(', ')} }`] as const] : [])]);
  let written = code.slice(open, close + 1);
  for(const { from, to, text } of [...changes].sort((a, b) => b.from - a.from)) written = written.slice(0, from - open) + text + written.slice(to - open);
  return { written };
};

// a key's values written whole as the scene writes them: each in order, a pose's joints
// in its pose
const valuesLiteral = (values: Readonly<Record<string, number>>): string => {
  const own = ordered(Object.keys(values).filter(channel => !channel.startsWith(POSE)), KEY_VALUES).map(channel => `${channel}: ${thousandth(values[channel])}`);
  const joints = ordered(Object.keys(values).filter(channel => channel.startsWith(POSE)).map(channel => channel.slice(POSE.length)), POSE_JOINTS).map(joint => `${joint}: ${thousandth(values[`${POSE}${joint}`])}`);
  const all = [...own, ...((joints.length > 0) ? [`pose: { ${joints.join(', ')} }`] : [])];
  return (all.length < 1) ? '{}' : `{ ${all.join(', ')} }`;
};

// names in the order `order` lists them, any it does not list after them as given
const ordered = (names: ReadonlyArray<string>, order: ReadonlyArray<string>): ReadonlyArray<string> => {
  const place = (name: string) => { const at = order.indexOf(name); return (at < 0) ? order.length : at; };
  return [...names].sort((a, b) => place(a) - place(b));
};

// where the statement on the line starting at `from` ends in code alone: the line break
// it ends at (the code's end, with none), past values written over lines and calls
// chained onto later lines; or the bracket closing its block, when that ends on its line
const statementEnd = (runs: string, from: number): number => {
  let depth = 0, at = from;
  for(; at<runs.length; at++) {
    if('({['.includes(runs[at])) depth++;
    else if(')}]'.includes(runs[at])) { if(depth === 0) break/*its block's end*/; depth--; }
    else if(LINE_BREAK.test(runs[at]) && (depth === 0)) {
      let next = at + 1;
      while(/\s/.test(runs[next] ?? '')) next++;
      if(runs[next] !== '.') break/*the next line is a statement of its own*/;
    }
  }
  return at;
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
