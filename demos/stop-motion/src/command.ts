import type { CharmIQAPI } from '../../../shared/charmiq';

import { DesignExists, displayName } from '../../brick-shared/designs';
import { isPlatformFile } from '../../brick-shared/drive';
import { listed } from '../../brick-shared/words';

import type { Avoided } from './clearance';
import { cameraShots, filmLengthOf, frameAtTime, setAt, shotAt, shotFrames, soundEndOf, type CameraShot, type Film } from './film';
import { UnsavedChanges, type Films } from './films';
import { MAX_AREA_CELLS, type CellArea } from './ground';
import { closePairs, closest, isSized, overlapsOf, type Size, CLOSE_GAP } from './measure';
import { motionOf, MOTION_CHANNELS } from './motion-read';
import type { Player } from './player';
import type { Point, RecordedActor, SceneError } from './recorder';
import { cameraGroups, cameraProblems, clearancesOf, footingProblems, problemAtTime, reviewCuts, screenAt, type CameraProblem, type CutSide, type FootingKind, type HeldBack, type PartFinding } from './review';
import type { ScreenBox } from './screen';
import { soundSpans, type Heard } from './sound';
import type { Surface } from './steps';
import type { Board, StageState } from './studios';

// the Charm command surface (SEE: manifest.json `advertise`): what the film is, the
// player's transport, and the film's geometry. A Charm writes the scene in the code
// editor's scene.js tab; these say how the film stands (its facts and every problem in
// a line each, the detail of those it asks after), show any moment of it on the
// studios so a screenshot sees it, show a storyboard of its moments on the main
// studio's sheet for one screenshot to read, map what stands where on its set (a part
// named at each top, the whole set at once), tell where its actors and camera stand,
// which actors stand in each other and how close actors come, read it as it looks
// (each actor on the screen, where the camera goes wrong, each cut as an editor reads
// it; SEE: review.ts), hear a sound it can play as its length and the spans it sounds
// over (SEE: sound.ts soundSpans), and keep the film in the Drive: its set and its
// scene saved as one film, opened back, or cleared for a new one
// ********************************************************************************
// == Constants ===================================================================
// -- Describing the Film ---------------------------------------------------------
/** what describeFilm judges wrong, in the order its summary lists them: two actors in
 *  each other, the camera inside something or its target hidden, each way a figure's
 *  footing goes wrong (SEE: review.ts FootingKind), and a keyed flight short of a part
 *  it crosses */
const PROBLEM_KINDS = ['overlap', 'inside', 'hidden', 'into', 'above', 'floating', 'tipped', 'through', 'short'] as const;
/** the camera's kinds, in their detail's order: its problems, then its own subject
 *  standing before the point it aims at (`own`: never a problem, so counted apart and
 *  detailed on request; SEE: review.ts CameraProblem) */
const CAMERA_KINDS: ReadonlyArray<MeasuredKind> = ['inside', 'hidden', 'own'];
/** the footing problem kinds, in their summary's order */
const FOOTING_KINDS: ReadonlyArray<ProblemKind & FootingKind> = ['into', 'above', 'floating', 'tipped', 'through'];
/** what describeFilm details on request: each problem kind and the camera's own
 *  subject, every keyed flight's clearance, each walk's leaps, and the actors that come
 *  close */
const ASKED_KINDS: ReadonlyArray<string> = ['overlap', ...CAMERA_KINDS, ...FOOTING_KINDS, 'short', 'clearance', 'leaps', 'close'];
/** a walk taking fewer steps than this between two of its leaps is summed up (a hurdles
 *  race runs three strides between its hurdles); every walk's leaps are detailed */
const FEW_STEPS = 3;

// -- Sounds ----------------------------------------------------------------------
/** the least pause (seconds) listen parts a sound's spans at when asked none: a
 *  speaker's breath between phrases, longer than the stops within a word */
const MIN_PAUSE = 0.3;
/** the least and the most pause (seconds) listen is asked to part at */
const MIN_PAUSE_RANGE = { least: 0.05, most: 10 } as const;
/** the most spans listen answers */
const MAX_SPANS = 60;

// -- Storyboard ------------------------------------------------------------------
/** the most frames a storyboard shows (SEE: Brick Studio's storyboard) */
const MAX_BOARD = 12;
/** where a shot's storyboard takes its frames, as shares of the way from its first
 *  frame to its last: both ends and two between, one picture of the shot's motion */
const SHOT_SPREAD = [0, 1 / 3, 2 / 3, 1] as const;

// == Types =======================================================================
// -- Describing the Film ---------------------------------------------------------
/** a way describeFilm judges a film wrong (SEE: PROBLEM_KINDS) */
type ProblemKind = typeof PROBLEM_KINDS[number];
/** what describeFilm measures: each problem kind and the camera's own subject (SEE:
 *  CAMERA_KINDS) */
type MeasuredKind = ProblemKind | 'own';
/** what describeFilm is asked to detail: the measures naming any of `actors`, over any
 *  of `from` to `to` (seconds), of `kinds` (SEE: ASKED_KINDS); each left out, all */
export type FilmAsk = Readonly<{ actors?: ReadonlyArray<string>; from?: number; to?: number; kinds?: ReadonlyArray<string>; }>;
/** describeFilm's arguments as a Charm sends them (SEE: FilmAsk) */
type AskArgs = Readonly<{ actors?: unknown; from?: unknown; to?: unknown; kinds?: unknown; }>;
/** a film as describeFilm measures it: its actors' boxes once the stage sized them, and
 *  the film as staged (the film shown, staged) with the parts each frame's camera met */
export type Measured = Readonly<{ film: Film; sizes?: Readonly<Record<string, Size>>; staged?: Readonly<{ film: Film; sizes: Readonly<Record<string, Size>>; parts: ReadonlyArray<PartFinding>; }>; }>;

// -- Film Host -------------------------------------------------------------------
/** what the surface reads from the film's wiring */
export type FilmHost = Readonly<{
  film: () => Film | undefined;
  error: () => SceneError | undefined;
  studios: () => number;
  editors: () => number;
  stage: () => StageState;
  /** the film the studios staged: the stage's sizes and parts are its own */
  staged: () => Film | undefined;
  /** stages the latest scene's film again: cast and shown on the studios */
  restage: () => Promise<void>;
  player: Player;
  /** resolves once the main studio has drawn a frame */
  shown: (index: number) => Promise<void>;
  /** the surfaces over every cell of an area of a set, the film staged (SEE: ground.ts surfacesIn) */
  surfaces: (set: string | undefined, area: CellArea) => Promise<ReadonlyArray<ReadonlyArray<ReadonlyArray<Surface>>>>;
  /** the area a set's parts stand over, the film staged; none for a set without parts */
  extent: (set: string | undefined) => Promise<CellArea | undefined>;
  /** shows frames on the main studio's storyboard sheet, answering how many */
  storyboard: (frames: ReadonlyArray<Board>, view?: string) => Promise<number>;
  /** the film's files */
  films: Films;
  /** the names of the sounds Stop Motion ships, once listed */
  shippedSounds: () => Promise<ReadonlyArray<string>>;
  /** a sound decoded as the film plays it (a Platform file's URI or a shipped sound's
   *  name), read once; or why it cannot be read or decoded */
  hear: (sound: string) => Promise<AudioBuffer>;
}>;

// == Commands ====================================================================
export const exportFilmCommands = (charmiq: CharmIQAPI, host: FilmHost): void => {
  charmiq.exportCommands({
    // -- Describing the Film -----------------------------------------------------
    describeFilm: async (asked: AskArgs = {}) => {
      const film = host.film(), error = host.error(), stage = host.stage();
      const sizes = sizesOf(stage), staged = stagedOf(host);
      const measured = film && { film, ...(sizes ? { sizes } : {}), ...(staged ? { staged } : {}) };
      const errorReport = error ? { error: { message: error.message, ...((error.line !== undefined) ? { line: error.line } : {}) } } : {};
      const ask = askOf(film, asked);
      if(ask) return { studios: host.studios(), editors: host.editors(), ...stageReport(stage), ...(measured ? detailReport(measured, ask) : {}), ...errorReport };
      return {
        studios: host.studios(), editors: host.editors(), ...stageReport(stage),
        ...(film ? filmFacts(film, staged?.avoided, await lengthsOf(host, film)) : {}),
        ...(staged ? await extentsReport(staged.film, host.extent).catch(() => ({})/*a studio not answering: its sets' extents unsaid*/) : {}),
        ...(measured ? summaryReport(measured) : {}),
        ...errorReport,
        ...(await host.shippedSounds().then(shippedSounds => ({ shippedSounds }), (failure: unknown) => ({ shippedSounds: [], shippedSoundsError: (failure as Error).message }))),
        file: host.films.state,
      };
    },

    // -- Reading an Actor, a Sound and the Set -----------------------------------
    motionOf: ({ actor, from, to, samples }: { actor?: unknown; from?: unknown; to?: unknown; samples?: unknown; }) => {
      const film = filmOf(host);
      const names = film.scene.actors.map(each => each.name);
      const recorded = film.scene.actors.find(each => each.name === actor);
      if(!recorded) throw new Error(`No actor '${String(actor)}' in the film (${names.join(', ')}).`);
      if([from, to, samples].some(value => (value !== undefined) && ((typeof value !== 'number') || !Number.isFinite(value)))) throw new Error('from and to are seconds, samples a count.');
      const [start, end] = [(from as number | undefined) ?? 0, (to as number | undefined) ?? film.scene.length];
      if(end < start) throw new Error('to is after from.');
      return motionReport(film, recorded, start, end, (samples as number | undefined) ?? 12);
    },
    where: ({ time, frame }: { time?: unknown; frame?: unknown; }) => {
      const film = filmOf(host);
      const current = (time === undefined) && (frame === undefined);
      const at = film.frames[current ? Math.min(film.frames.length - 1, host.player.current.index) : frameAt(film, time, frame)];
      return {
        frame: at.index, time: thousandths(at.time), ...(current ? { current: true } : {}), ...((at.set !== undefined) ? { set: at.set } : {}),
        actors: at.actors.map(actor => ({ name: actor.name, position: rounded(actor.position), turn: { yaw: hundredths(actor.turn.yaw), pitch: hundredths(actor.turn.pitch), roll: hundredths(actor.turn.roll) } })),
        camera: { position: rounded(at.camera.position), target: rounded(at.camera.target), fov: hundredths(at.camera.fov) },
      };
    },
    measure: ({ actors, from, to }: { actors?: unknown; from?: unknown; to?: unknown; }) => {
      const film = filmOf(host);
      const names = film.scene.actors.map(actor => actor.name);
      if(!Array.isArray(actors) || (actors.length !== 2) || (actors[0] === actors[1])) throw new Error('measure takes two actors, each named once.');
      for(const actor of actors) if(!names.includes(actor as string)) throw new Error(`No actor '${String(actor)}' in the film (${names.join(', ')}).`);
      const sizes = sizesOf(host.stage());
      if(!sizes) throw new Error('The actors\' sizes come from the studio, which has not staged the film (describeFilm says why).');
      const [a, b] = actors as [string, string];
      for(const actor of [a, b]) if(!isSized(sizes, actor)) throw new Error(`The studio did not cast '${actor}' (describeFilm says why).`);
      if([from, to].some(value => (value !== undefined) && ((typeof value !== 'number') || !Number.isFinite(value)))) throw new Error('from and to are seconds.');
      const found = closest(film, sizes, a, b, from as number | undefined, to as number | undefined);
      if(!found) throw new Error(`${a} and ${b} are never shown together${((from !== undefined) || (to !== undefined)) ? ' then' : ''}.`);
      return { actors: [a, b], frame: found.frame, time: thousandths(found.time), gap: hundredths(found.gap), touching: found.gap === 0, positions: positionsAt(film, found.frame, [a, b]) };
    },
    listen: async ({ sound, minPause }: { sound?: unknown; minPause?: unknown; }) => {
      if(!isPlatformFile(sound)) {
        const shipped = await host.shippedSounds();
        if((typeof sound !== 'string') || !shipped.includes(sound)) throw new Error(`listen hears a Platform file by its URI (charmiq://file/<assetId>) or a sound Stop Motion ships: ${shipped.join(', ')}.`);
      } /* else -- any Platform file: its read says whether it is a sound */
      if((minPause !== undefined) && ((typeof minPause !== 'number') || !(minPause >= MIN_PAUSE_RANGE.least) || !(minPause <= MIN_PAUSE_RANGE.most))) throw new Error(`minPause is seconds, from ${MIN_PAUSE_RANGE.least} to ${MIN_PAUSE_RANGE.most}.`);
      const least = (minPause as number | undefined) ?? MIN_PAUSE;
      const decoded = await host.hear(sound).catch((failure: unknown) => { throw new Error(`${sound} could not be heard: ${String((failure as Error)?.message ?? failure).replace(/\.$/, '')}.`); });
      return listenReport(sound, least, soundSpans(decoded, least, MAX_SPANS));
    },
    surfaces: async ({ x, z, width, depth, time }: { x?: unknown; z?: unknown; width?: unknown; depth?: unknown; time?: unknown; }) => {
      const film = reviewed(host).film;
      const whole = [x, z, width, depth].every(value => value === undefined);
      if(!whole && [x, z, width, depth].some(value => !Number.isInteger(value))) throw new Error('x and z are the area\'s south-west cell, width and depth its size, all whole studs; leave all four out for the whole set.');
      const area = whole ? undefined : { x: x as number, z: z as number, width: width as number, depth: depth as number };
      if(area && ((area.width < 1) || (area.depth < 1) || ((area.width * area.depth) > MAX_AREA_CELLS))) throw new Error(`An area is 1 to ${MAX_AREA_CELLS} cells (64 by 64).`);
      if((time !== undefined) && ((typeof time !== 'number') || (time < 0) || (time > film.scene.length))) throw new Error(`time is a moment of the film, 0 to ${film.scene.length} seconds.`);
      const set = setAt(film.scene.sets, (time as number | undefined) ?? 0);
      return { ...((set !== undefined) ? { set } : {}), ...(await surfacesAnswer(host, set, area)) };
    },

    // -- Playing and Staging -----------------------------------------------------
    stage: async () => { await host.restage(); return stageReport(host.stage()); },
    seek: async ({ time, frame }: { time?: unknown; frame?: unknown; }) => {
      const film = filmOf(host);
      host.player.pause();
      host.player.seek(frameAt(film, time, frame));
      const shown = host.player.current.index;
      const drawn = host.shown(shown);
      host.player.redraw()/*shown again, whether or not the playhead moved*/;
      await drawn;
      return { frame: shown, time: thousandths(film.frames[shown].time) };
    },
    play: () => { host.player.play(); return { playing: true }; },
    pause: () => { host.player.pause(); return { playing: false, frame: host.player.current.index }; },

    // -- Pictures ----------------------------------------------------------------
    // the film shown, and read as it looks on the screen

    storyboard: async ({ times, frames, shot, view }: { times?: unknown; frames?: unknown; shot?: unknown; view?: unknown; }) => {
      const film = filmOf(host);
      const { scene } = film;
      const last = film.frames.length - 1;
      if((view !== undefined) && !scene.views.some(each => each.name === view)) throw new Error(`No view '${String(view)}': ${(scene.views.length > 0) ? `the scene's views are ${scene.views.map(each => each.name).join(', ')}` : 'the scene names no views'}.`);
      const picks = Object.entries({ times, frames, shot }).filter(([, value]) => value !== undefined).map(([key]) => key);
      if(picks.length > 1) throw new Error(`Give ${listed(picks, 'or')}, not ${(picks.length > 2) ? 'all three' : 'both'}.`);
      const shots = cameraShots(scene.camera, scene.length);
      let indices: number[];
      if(times !== undefined) {
        if(!Array.isArray(times) || !times.every(each => (typeof each === 'number') && (each >= 0) && (each <= scene.length))) throw new Error(`times are seconds from 0 to ${scene.length}.`);
        indices = times.map(each => frameAtTime(film, each));
      } else if(frames !== undefined) {
        if(!Array.isArray(frames) || !frames.every(each => Number.isInteger(each) && (each >= 0) && (each <= last))) throw new Error(`frames are whole frames from 0 to ${last}.`);
        indices = frames as number[];
      } else if(shot !== undefined) {
        indices = shotSpread(film, shots, shot);
      } else {
        indices = shotFrames(film).map(each => each.middle);
      }
      if(indices.length < 1) throw new Error('Give at least one time or frame.');
      if(indices.length > MAX_BOARD) throw new Error(`A storyboard shows at most ${MAX_BOARD} frames.`);
      const boards = indices.map(index => ({ frame: index, caption: captionOf(film.frames[index].time, index, shots) }));
      const shown = await host.storyboard(boards, view as string | undefined);
      return { shown, frames: boards.map(board => ({ frame: board.frame, time: thousandths(film.frames[board.frame].time), caption: board.caption })) };
    },
    screenOf: ({ time, frame }: { time?: unknown; frame?: unknown; }) => {
      const { film, sizes, parts } = reviewed(host);
      const index = frameAt(film, time, frame), at = film.frames[index];
      const problem = problemAtTime(cameraProblems(film, sizes, parts), at.time);
      return {
        frame: index, time: thousandths(at.time),
        actors: Object.fromEntries(Object.entries(screenAt(film, sizes, index)).map(([name, box]) => [name, screenReport(box)])),
        ...(problem ? { camera: problemReport(problem) } : {}),
      };
    },
    reviewCuts: () => {
      const { film, sizes, parts } = reviewed(host);
      return { cuts: reviewCuts(film, sizes, cameraProblems(film, sizes, parts)).map(cut => ({ time: thousandths(cut.time), frame: cut.frame, before: sideReport(cut.before), after: sideReport(cut.after), angle: hundredths(cut.angle), shots: { before: thousandths(cut.shots.before), after: thousandths(cut.shots.after) }, flags: cut.flags })) };
    },

    // -- Files -------------------------------------------------------------------
    listFilms: async () => {
      const designs = await host.films.store.list();
      return { folder: host.films.store.getFolder().name, films: designs.map(design => ({ name: displayName(design), uri: design.uri })) };
    },
    saveFilm: async ({ name, replace }: { name?: unknown; replace?: unknown; }) => {
      if((name !== undefined) && (typeof name !== 'string')) throw new Error('name is the film\'s name.');
      try {
        const saved = await host.films.save(name, replace === true);
        return { saved: saved.name, ...(saved.folder ? { folder: saved.folder.name } : {})/*a film opened by its uri: its folder unknown*/, ...(saved.replaced ? { replaced: true } : {}) };
      } catch(failure) {
        if(failure instanceof DesignExists) throw new Error(`${failure.message} Pass replace: true to write over it.`);
        throw failure;
      }
    },
    openFilm: async ({ name, uri, discard }: { name?: unknown; uri?: unknown; discard?: unknown; }) => {
      const design = (typeof uri === 'string') ? await host.films.store.at(uri) : (typeof name === 'string') ? name : undefined;
      if(design === undefined) throw new Error('Give the film\'s uri (listFilms) or its name.');
      const opened = await discarding(() => host.films.open(design, discard === true));
      return { opened: opened.name, scene: opened.scene };
    },
    newFilm: async ({ discard }: { discard?: unknown; }) => {
      await discarding(() => host.films.clear(discard === true));
      return { cleared: true };
    },
  });
};

// == Report ======================================================================
// -- Summary and Detail ----------------------------------------------------------
/** describeFilm's facts of a film: what it is, its shots, sets, sounds (each read
 *  with its length, from `lengths`, and the scene's time one played once ends) and
 *  footsteps, each walk taking fewer than FEW_STEPS steps between two of its leaps (SEE:
 *  leapsReport), where an avoiding camera was drawn in (once staged) and what its scene
 *  logged */
export const filmFacts = (film: Film, avoided: ReadonlyArray<Avoided> | undefined, lengths: ReadonlyMap<string, number>) => ({
  title: film.scene.title, seconds: film.scene.length, ...(film.scene.speed ? { filmSeconds: thousandths(filmLengthOf(film)) } : {}), fps: film.scene.fps, frames: film.frames.length,
  actors: film.scene.actors.map(actor => actor.name), views: film.scene.views.map(view => view.name),
  shots: cameraShots(film.scene.camera, film.scene.length).map(shot => { const set = setAt(film.scene.sets, shot.from); return (set !== undefined) ? { ...shot, set } : shot; }),
  ...(film.scene.sets ? { sets: film.scene.sets.map(({ time, set }) => ({ time: thousandths(time), set })) } : {}),
  ...(film.scene.sounds ? { sounds: film.scene.sounds.map(cue => {
    const { time, name, volume, until, actor, fadeIn, fadeOut } = cue;
    const seconds = lengths.get(name), ends = (until === undefined) ? soundEndOf(film, cue, seconds) : undefined/*its until*/;
    return {
      time: thousandths(time), name, ...((seconds !== undefined) ? { seconds: thousandths(seconds) } : {}), volume,
      ...((until !== undefined) ? { until: thousandths(until) } : {}), ...((ends !== undefined) ? { ends: thousandths(ends) } : {}), ...((actor !== undefined) ? { actor } : {}),
      ...((fadeIn !== undefined) ? { fadeIn: thousandths(fadeIn) } : {}), ...((fadeOut !== undefined) ? { fadeOut: thousandths(fadeOut) } : {}),
    };
  }) } : {}),
  ...(film.footsteps ? { footsteps: [...new Set(film.footsteps.map(cue => cue.actor!))].map(actor => {
    const steps = film.footsteps!.filter(cue => cue.actor === actor);
    return { actor, steps: steps.length, from: thousandths(steps[0].time), to: thousandths(steps[steps.length - 1].time), sounds: [...new Set(steps.map(cue => cue.name))] };
  }) } : {}),
  ...fewStepsOf(film),
  ...((avoided && (avoided.length > 0)) ? { avoided: avoided.map(({ from, to, kept, view }) => ({ from: thousandths(from), to: thousandths(to), kept: hundredths(kept), ...((view !== undefined) ? { view } : {}) })) } : {}),
  ...((film.scene.logs.length > 0) ? { logs: film.scene.logs.slice(-20) } : {}),
});

/** describeFilm's summary of a film's problems: how many of each kind it measured (two
 *  actors in each other once the stage sized them, the rest once staged), how many
 *  moments the camera's own subject stands before the point it aims at (`own`, apart
 *  from the problems; none unsaid), and every problem in a line, the worst first within
 *  each kind (SEE: Problem), a shot's camera problems of one kind and one cause in one
 *  line for them all (SEE: cameraLines) */
export const summaryReport = (measured: Measured) => {
  const camera = cameraOf(measured);
  const problems = problemsOf(measured, camera), lines = cameraLines(measured, camera);
  const kinds = PROBLEM_KINDS.filter(kind => (kind === 'overlap') ? (measured.sizes !== undefined) : (measured.staged !== undefined));
  const linesOf = (kind: ProblemKind) => (CAMERA_KINDS.includes(kind) ? lines : problems).filter(problem => problem.kind === kind);
  const own = problems.filter(problem => problem.kind === 'own').length;
  return (kinds.length < 1) ? {} : { counts: Object.fromEntries(kinds.map(kind => [kind, problems.filter(problem => problem.kind === kind).length])), ...((own > 0) ? { own } : {}), problems: PROBLEM_KINDS.flatMap(linesOf).map(({ entry }) => entry) };
};

/** describeFilm's detail of the problems, the camera's own subject, clearances, leaps
 *  and close actors asked after, each in full: those naming any actor asked, over any of
 *  the span asked, of the kinds asked (close actors only when asked); each list once
 *  measured */
export const detailReport = (measured: Measured, ask: FilmAsk) => {
  const { film, sizes, staged } = measured;
  const wants = (...kinds: ReadonlyArray<string>) => !ask.kinds || kinds.some(kind => ask.kinds!.includes(kind));
  const span = { from: ask.from ?? 0, to: ask.to ?? film.scene.length };
  const naming = (names: ReadonlyArray<string>) => !ask.actors || names.some(name => ask.actors!.includes(name));
  const over = (from: number, to: number) => (from <= span.to) && (to >= span.from);
  const problems = problemsOf(measured).filter(problem => naming(problem.actors) && over(problem.from, problem.to));
  const ofKinds = (kinds: ReadonlyArray<MeasuredKind>) => problems.filter(problem => kinds.includes(problem.kind) && wants(problem.kind));
  return {
    ...((sizes && wants('overlap')) ? { overlaps: ofKinds(['overlap']).map(problem => problem.detail) } : {}),
    ...((staged && wants(...CAMERA_KINDS)) ? { camera: ofKinds(CAMERA_KINDS).map(problem => problem.detail) } : {}),
    ...((staged && wants(...FOOTING_KINDS)) ? { footing: ofKinds(FOOTING_KINDS).map(problem => problem.detail) } : {}),
    ...((staged && wants('clearance', 'short')) ? { clearances: clearancesReport(staged.film).filter(each => naming([each.actor]) && over(each.from, each.to) && (wants('clearance') || !each.cleared)) } : {}),
    ...((staged && wants('leaps')) ? { leaps: leapsReport(staged.film).filter(each => naming([each.actor]) && over(each.leaps[0], each.leaps[each.leaps.length - 1])) } : {}),
    ...((sizes && ask.kinds?.includes('close')) ? { close: { withinStuds: CLOSE_GAP, pairs: closeReport(film, sizes).filter(pair => naming(pair.actors) && over(pair.time, pair.time)) } } : {}),
  };
};

// -- Problems --------------------------------------------------------------------
/** a problem describeFilm judges (or the camera's own subject before its target): its
 *  kind, the actors it names, its span (seconds) and how much is wrong (studs, or
 *  degrees tipped; a camera problem's span alone), its line in the summary and its full
 *  entry in the detail */
type Problem = Readonly<{ kind: MeasuredKind; actors: ReadonlyArray<string>; from: number; to: number; amount: number; entry: Readonly<Record<string, unknown>>; detail: Readonly<Record<string, unknown>>; }>;

/** every problem of a measured film, kind by kind (SEE: PROBLEM_KINDS), then the camera's
 *  own subject before its target, the worst first within each: the most wrong, then the
 *  longest, then the earliest; its camera's those `spans` holds (SEE: cameraOf) */
const problemsOf = (measured: Measured, spans: ReadonlyArray<CameraProblem> = cameraOf(measured)): ReadonlyArray<Problem> => {
  const { film, sizes, staged } = measured;
  const overlaps = sizes ? overlapsReport(film, sizes).map(detail => ({ kind: 'overlap' as const, actors: detail.actors, from: detail.from, to: detail.to, amount: detail.most, entry: { kind: 'overlap', actors: detail.actors, from: detail.from, to: detail.to, most: detail.most, unit: 'studs' }, detail })) : [];
  const camera = spans.map(problemReport).map(detail => ({ kind: detail.kind, actors: [detail.by], from: detail.from, to: detail.to, amount: 0, entry: { kind: detail.kind, by: detail.by, from: detail.from, to: detail.to }, detail }));
  const footing = staged ? footingReport(staged.film).map(detail => ({
    kind: detail.kind, actors: [detail.actor], from: detail.from, to: detail.to, amount: detail.most, detail,
    entry: { kind: detail.kind, actor: detail.actor, from: detail.from, to: detail.to, most: detail.most, unit: (detail.kind === 'tipped') ? 'degrees' : 'studs', ...((detail.part !== undefined) ? { part: detail.part } : {}), lines: detail.lines, ...(detail.heldBack ? { heldBack: detail.heldBack } : {}) },
  })) : [];
  const short = staged ? clearancesReport(staged.film).filter(each => !each.cleared).map(detail => {
    const most = hundredths(-detail.margin)/*how far short*/;
    return { kind: 'short' as const, actors: [detail.actor], from: detail.from, to: detail.to, amount: most, detail, entry: { kind: 'short', actor: detail.actor, from: detail.from, to: detail.to, most, unit: 'studs', time: detail.time, point: detail.point, part: detail.part, lines: detail.lines } };
  }) : [];
  const all: ReadonlyArray<Problem> = [...overlaps, ...camera, ...footing, ...short];
  const length = ({ from, to }: Problem) => thousandths(to - from)/*its ends' rounding aside*/;
  return [...PROBLEM_KINDS, 'own' as const].flatMap(kind => all.filter(problem => problem.kind === kind).sort((a, b) => (b.amount - a.amount) || (length(b) - length(a)) || (a.from - b.from)));
};

/** describeFilm's overlaps: each with where the two stand when they stand deepest */
export const overlapsReport = (film: Film, sizes: Readonly<Record<string, Size>>) =>
  overlapsOf(film, sizes).map(({ actors, from, to, most, frame, time }) => ({ actors, from: thousandths(from), to: thousandths(to), most: hundredths(most), time: thousandths(time), positions: positionsAt(film, frame, actors) }));

/** where a measured film's camera goes wrong (SEE: review.ts cameraProblems), once
 *  staged; in the film's order */
const cameraOf = ({ staged }: Measured): ReadonlyArray<CameraProblem> => staged ? cameraProblems(staged.film, staged.sizes, staged.parts) : [];

/** the summary's lines of a film's camera problems, a shot's of one kind and one cause
 *  in one (SEE: review.ts cameraGroups): a lone problem its own line; a group what stands
 *  in the way by its short name, its shot, its span from the first to the last, how many
 *  moments it holds and when its worst (the longest, then the earliest) starts. The most
 *  time the camera goes wrong first, then the earliest */
const cameraLines = ({ staged }: Measured, camera: ReadonlyArray<CameraProblem>): ReadonlyArray<Readonly<{ kind: MeasuredKind; entry: Readonly<Record<string, unknown>>; }>> => {
  if(!staged) return [];
  const shots = cameraShots(staged.film.scene.camera, staged.film.scene.length);
  const length = ({ from, to }: CameraProblem) => thousandths(to - from);
  return cameraGroups(shots, camera).map(({ shot, kind, by, problems }) => {
    const [first, last] = [problems[0], problems[problems.length - 1]];
    const worst = [...problems].sort((a, b) => (length(b) - length(a)) || (a.from - b.from))[0];
    const held = thousandths(problems.reduce((sum, problem) => sum + length(problem), 0));
    const entry = (problems.length < 2) ? { kind, by: first.by, from: thousandths(first.from), to: thousandths(first.to) }
      : { kind, by, ...((shot.name !== undefined) ? { shot: shot.name } : {}), from: thousandths(first.from), to: thousandths(last.to), moments: problems.length, time: thousandths(worst.from) };
    return { kind, held, from: first.from, entry };
  }).sort((a, b) => (b.held - a.held) || (a.from - b.from));
};

// -- Footing, Leaps and Clearances -----------------------------------------------
/** describeFilm's footing, over the film staged on the set's surfaces: where each
 *  figure stands as its span starts (its height over the baseplate), the top of what its
 *  feet are in or over and how high over that top it stands, and the part the ground it
 *  follows stands it on */
export const footingReport = (film: Film) =>
  footingProblems(film).map(({ actor, from, to, kind, most, at, surface, on, part, points, by, lines, keys, tilts, heldBack, upright }) => ({
    actor, from: thousandths(from), to: thousandths(to), kind, most: hundredths(most), at: rounded(at),
    ...((surface !== undefined) ? { surfaceTop: hundredths(surface), aboveSurface: hundredths(at.height - surface) } : {}), ...((on !== undefined) ? { on } : {}),
    ...((part !== undefined) ? { part } : {}), ...(points ? { points } : {}), by, lines,
    ...(keys ? { keys: keys.map(key => ({ time: thousandths(key.time), height: hundredths(key.height) })) } : {}),
    ...(tilts ? { tilts: tilts.map(key => ({ time: thousandths(key.time), channel: key.channel, value: hundredths(key.value) })) } : {}),
    ...((heldBack && (upright !== undefined)) ? { heldBack: heldBackReport(heldBack, upright) } : {}),
  }));

/** a tipped span's keys held back, model-facing: each key's channel, time and line, and
 *  the fix, its channels keyed upright at the moment to (SEE: review.ts FootingProblem) */
const heldBackReport = (keys: ReadonlyArray<HeldBack>, upright: number) => ({
  keys: keys.map(({ channel, time, line }) => ({ channel, time: thousandths(time), ...((line !== undefined) ? { line } : {}) })),
  fix: `key ${listed([...new Set(keys.map(key => key.channel))])} 0 at ${thousandths(upright)} s`,
});

/** describeFilm's summed-up leaps: each walk taking fewer than FEW_STEPS steps between
 *  two of its leaps; none unsaid */
const fewStepsOf = (film: Film) => {
  const few = leapsReport(film).filter(walk => walk.stepsBetween.some(steps => steps < FEW_STEPS));
  return (few.length > 0) ? { leaps: few } : {};
};

/** describeFilm's leaps: each walk leaping a part in its way, its actor and line, when
 *  each leap sets off and the steps between each and the next (SEE: film.ts WalkLeaps) */
export const leapsReport = (film: Film) =>
  (film.leaps ?? []).map(({ actor, line, times, stepsBetween }) => ({ actor, ...((line !== undefined) ? { line } : {}), leaps: times.map(thousandths), stepsBetween }));

/** describeFilm's clearances: each keyed flight over each part it crosses, its least
 *  margin (studs) with when it is least and the body's point setting it, and whether it
 *  clears the part, the least margin first */
export const clearancesReport = (film: Film) =>
  [...clearancesOf(film)].sort((a, b) => a.margin - b.margin).map(({ actor, from, to, part, margin, time, point, cleared, lines }) => ({ actor, from: thousandths(from), to: thousandths(to), part, margin: hundredths(margin), time: thousandths(time), point, cleared, lines }));

// -- Sounds ----------------------------------------------------------------------
/** listen's answer: a sound heard (SEE: sound.ts soundSpans) at the least pause
 *  asked, its spans to the hundredth (its window's 0.02 s), each with the pause after
 *  it, and how many it found when they were capped */
export const listenReport = (sound: string, minPause: number, heard: Heard) => ({
  sound, seconds: thousandths(heard.seconds), minPause,
  spans: heard.spans.map(({ from, to }, at) => {
    const next = heard.spans[at + 1];
    return { from: hundredths(from), to: hundredths(to), ...(next ? { pause: hundredths(next.from - to) } : {}) };
  }),
  ...((heard.found > heard.spans.length) ? { capped: { found: heard.found } } : {}),
});

/** the length (seconds) of each sound the scene plays, by name: those that can be
 *  heard, each decoded once */
const lengthsOf = async (host: FilmHost, film: Film): Promise<ReadonlyMap<string, number>> => {
  const names = [...new Set((film.scene.sounds ?? []).map(cue => cue.name))];
  return new Map((await Promise.all(names.map(name => host.hear(name).then(buffer => [[name, buffer.duration] as const], () => []/*unreadable: no length*/)))).flat());
};

// -- Motion ----------------------------------------------------------------------
/** motionOf's answer: an actor's motion read (SEE: motion-read.ts), rounded */
export const motionReport = (film: Film, actor: RecordedActor, from: number, to: number, samples: number) => {
  const read = motionOf(film, actor, from, to, samples);
  return {
    actor: read.actor,
    samples: read.samples.map(({ time, frame, shown, ...at }) => ({ time: thousandths(time), frame, shown, ...Object.fromEntries(Object.entries(at).map(([key, value]) => [key, hundredths(value)])) })),
    drivers: Object.fromEntries(MOTION_CHANNELS.map(channel => [channel, read.drivers[channel].map(({ from: spanFrom, to: spanTo, by, lines, heldBack }) => ({ from: thousandths(spanFrom), to: thousandths(spanTo), by, lines, ...((heldBack !== undefined) ? { heldBack: thousandths(heldBack) } : {}) }))])),
  };
};

// -- Set Map ---------------------------------------------------------------------
/** surfaces' answer over a set: the map of the area asked, or, asked none, the set's
 *  overview (SEE: overviewReport), its extent read a stud at a time */
export const surfacesAnswer = async (read: Pick<FilmHost, 'surfaces' | 'extent'>, set: string | undefined, area: CellArea | undefined) => {
  if(area) return surfacesReport(area, await read.surfaces(set, area));
  const extent = await read.extent(set);
  return extent ? overviewReport(extent, await read.surfaces(set, extent)) : { rows: [], legend: {} }/*no parts: nothing to map*/;
};

/** the surfaces over an area as a person reads a map: north up (a row a z, the
 *  highest first), west on the left, each row's cells as runs of like cells, each run
 *  its first cell's x and its tops (SEE: rowOf), each key a part in the legend (SEE:
 *  legendOf) */
export const surfacesReport = (area: CellArea, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<Surface>>>) => {
  const { keys, legend } = legendOf(rows.flat());
  return {
    area, west: area.x, east: area.x + area.width - 1,
    rows: rows.map((cells, row) => ({ z: area.z + row, cells: rowOf(keys, cells, area.x, 1) })).reverse(),
    legend,
  };
};

/** a set's whole extent on one map (SEE: surfacesReport), each cell the least square of
 *  studs (`cell` a side) that fits the extent within MAX_AREA_CELLS cells: each row the
 *  z of its cells' south studs, each run's x and west and east the x of its first, the
 *  first and the last cells' west studs. A cell shows the tops most of its studs show,
 *  the higher of as many (its highest top), the first read of as many still: a track's
 *  tile over a stud of mat */
export const overviewReport = (extent: CellArea, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<Surface>>>) => {
  let cell = 1;
  while((Math.ceil(extent.width / cell) * Math.ceil(extent.depth / cell)) > MAX_AREA_CELLS) cell++;
  const [across, down] = [Math.ceil(extent.width / cell), Math.ceil(extent.depth / cell)];
  const shown = Array.from({ length: down }, (_, row) => Array.from({ length: across }, (_, column) => {
    const studs = rows.slice(row * cell, (row + 1) * cell).flatMap(cells => cells.slice(column * cell, (column + 1) * cell));
    const tallied = new Map<string, Readonly<{ surfaces: ReadonlyArray<Surface>; count: number; }>>();
    for(const surfaces of studs) {
      const key = surfaces.map(surface => `${surface.part ?? ''}@${surface.height}`).join('/');
      tallied.set(key, { surfaces, count: (tallied.get(key)?.count ?? 0) + 1 });
    }
    let most: Readonly<{ surfaces: ReadonlyArray<Surface>; count: number; }> | undefined;
    for(const each of tallied.values()) if(!most || (each.count > most.count) || ((each.count === most.count) && (highestOf(each.surfaces) > highestOf(most.surfaces)))) most = each;
    return most?.surfaces ?? [];
  }));
  const { keys, legend } = legendOf(shown.flat());
  return {
    extent, cell, west: extent.x, east: extent.x + ((across - 1) * cell),
    rows: shown.map((cells, row) => ({ z: extent.z + (row * cell), cells: rowOf(keys, cells, extent.x, cell) })).reverse(),
    legend,
  };
};

/** describeFilm's extents: each set the film stands on (the one it starts on, then each
 *  set keyed, once each), the area its parts stand over, named but for the build's
 *  first; a set without parts left out */
export const extentsReport = async (film: Film, extent: FilmHost['extent']) => {
  const sets = [...new Set([setAt(film.scene.sets, 0), ...(film.scene.sets ?? []).map(key => key.set)])];
  const extents = (await Promise.all(sets.map(async set => {
    const area = await extent(set);
    return area ? [{ ...((set !== undefined) ? { set } : {}), ...area }] : [];
  }))).flat();
  return (extents.length > 0) ? { extents } : {};
};

// .. Legend, Rows and Cells ......................................................
/** the legend of the parts whose tops a map shows, in the order of their names: each
 *  part keyed by its own name (SEE: partKey), so a part takes the same key in every
 *  map; two parts whose names key alike each keyed by its whole name instead, its
 *  space a `.` (`brick-2x4.blue`, `brick-2x4.black`) */
const legendOf = (cells: ReadonlyArray<ReadonlyArray<Surface>>) => {
  const names = [...new Set(cells.flatMap(surfaces => surfaces.flatMap(surface => (surface.part !== undefined) ? [surface.part] : [])))].sort();
  const shared = (name: string) => names.some(other => (other !== name) && (partKey(other) === partKey(name)));
  const keys = new Map(names.map(name => [name, shared(name) ? name.replace(/ /gu, '.') : partKey(name)] as const));
  return { keys, legend: Object.fromEntries([...keys].map(([name, key]) => [key, name])) };
};
/** a part's legend key read off its name, its kind then its color (Brick Studio's
 *  describePart): of each, every word holding a digit whole and every other its first
 *  letter (`tile-2x4 orange` t2x4o, `fence-lattice-1x4x1 white` fl1x4x1w) */
const partKey = (name: string): string => name.split(' ').map(words => words.split('-').map(word => /\d/u.test(word) ? word : word.charAt(0)).join('')).join('');
/** a map's row: its cells west to east as runs of like cells, each run its first cell's
 *  x (studs, its west stud; cells `step` studs apart) and its tops (`-34:0 -22:p1x10y@31
 *  -21:0`), a space between, each run reaching to the next run's x (the row's east for
 *  the last) */
const rowOf = (keys: ReadonlyMap<string, string>, cells: ReadonlyArray<ReadonlyArray<Surface>>, west: number, step: number): string => {
  const runs: string[] = [];
  let last: string | undefined;
  cells.forEach((surfaces, column) => {
    const tops = cellOf(keys, surfaces);
    if(tops !== last) runs.push(`${west + (column * step)}:${tops}`);
    last = tops;
  });
  return runs.join(' ');
};
/** a map's cell: its tops lowest first, each its part's key and its height (plates)
 *  joined by `@`, or its height alone (the baseplate, or where the studio names no
 *  part), the tops joined by `/`; `-` where none */
const cellOf = (keys: ReadonlyMap<string, string>, surfaces: ReadonlyArray<Surface>): string =>
  (surfaces.length > 0) ? surfaces.map(surface => `${(surface.part !== undefined) ? `${keys.get(surface.part)}@` : ''}${hundredths(surface.height)}`).join('/') : '-';
/** the highest of a stud's tops, below any for none */
const highestOf = (surfaces: ReadonlyArray<Surface>): number => Math.max(-Infinity, ...surfaces.map(surface => surface.height));

// -- Close Actors ----------------------------------------------------------------
/** describeFilm's close actors, the nearest first (SEE: measure.ts closePairs) */
export const closeReport = (film: Film, sizes: Readonly<Record<string, Size>>) =>
  [...closePairs(film, sizes)].sort((a, b) => a.gap - b.gap).map(pair => ({ actors: pair.actors, frame: pair.frame, time: thousandths(pair.time), gap: hundredths(pair.gap) }));

// == Util ========================================================================
// -- Asks and Refusals -----------------------------------------------------------
/** what describeFilm is asked to detail, checked against the film; none when it asks
 *  for no detail (the summary) */
const askOf = (film: Film | undefined, { actors, from, to, kinds }: AskArgs): FilmAsk | undefined => {
  if([actors, from, to, kinds].every(value => value === undefined)) return undefined/*the summary*/;
  const names = film?.scene.actors.map(actor => actor.name) ?? [];
  if((actors !== undefined) && (!Array.isArray(actors) || (actors.length < 1))) throw new Error('actors names the actors to detail, a list of their names.');
  for(const actor of (actors as ReadonlyArray<unknown> | undefined) ?? []) if(!names.includes(actor as string)) throw new Error(`No actor '${String(actor)}' in the film (${names.join(', ')}).`);
  if([from, to].some(value => (value !== undefined) && ((typeof value !== 'number') || !Number.isFinite(value)))) throw new Error('from and to are seconds.');
  if((from !== undefined) && (to !== undefined) && ((to as number) < (from as number))) throw new Error('to is after from.');
  if((kinds !== undefined) && (!Array.isArray(kinds) || (kinds.length < 1) || !kinds.every(kind => ASKED_KINDS.includes(kind as string)))) throw new Error(`kinds is a list of ${ASKED_KINDS.join(', ')}.`);
  return { ...((actors !== undefined) ? { actors: actors as ReadonlyArray<string> } : {}), ...((from !== undefined) ? { from: from as number } : {}), ...((to !== undefined) ? { to: to as number } : {}), ...((kinds !== undefined) ? { kinds: kinds as ReadonlyArray<string> } : {}) };
};

/** the frame a time (the scene's seconds) or a frame (from 0) names, within the film */
const frameAt = (film: Film, time: unknown, frame: unknown): number => {
  if(typeof frame === 'number') { if(Number.isFinite(frame)) return Math.max(0, Math.min(film.frames.length - 1, Math.round(frame))); }
  else if((typeof time === 'number') && Number.isFinite(time)) return frameAtTime(film, time);
  throw new Error('Give the time (seconds) or the frame (from 0).');
};

/** runs a change of film, a refusal over unsaved changes saying how to go on */
const discarding = async <T>(change: () => Promise<T>): Promise<T> => {
  try { return await change(); }
  catch(failure) {
    if(failure instanceof UnsavedChanges) throw new Error(`${failure.message} Pass discard: true to go on without saving.`);
    throw failure;
  }
};

// -- Staged Film -----------------------------------------------------------------
/** the film, or why there is none */
const filmOf = (host: FilmHost): Film => {
  const film = host.film();
  if(!film) throw new Error('No film yet: the scene.js tab holds no scene that runs (describeFilm says why).');
  return film;
};

/** each actor's box, once the stage has said */
const sizesOf = (stage: StageState): Readonly<Record<string, Size>> | undefined => (stage.kind === 'staged') ? stage.sizes : undefined;

/** the film shown as the studios staged it: its actors' boxes and the parts each
 *  frame's camera meets; none while the film shown is not the one staged */
const stagedOf = (host: FilmHost): Readonly<{ film: Film; sizes: Readonly<Record<string, Size>>; parts: ReadonlyArray<PartFinding>; avoided: ReadonlyArray<Avoided>; }> | undefined => {
  const film = host.film(), stage = host.stage();
  return (film && (stage.kind === 'staged') && (host.staged() === film)) ? { film, sizes: stage.sizes, parts: stage.parts, avoided: stage.avoided } : undefined;
};

/** the film as staged, or why it is not */
const reviewed = (host: FilmHost) => {
  filmOf(host)/*a film, or why there is none*/;
  const staged = stagedOf(host);
  if(!staged) throw new Error('The film is read as it looks once the studios stage it: stage it (describeFilm says why it is not).');
  return staged;
};

// -- Model-Facing Shapes ---------------------------------------------------------
/** how the stage stands, model-facing: its kind, the actors it refused, and why it
 *  stands unstaged when it failed */
const stageReport = (stage: StageState) => ({
  stage: stage.kind,
  ...((stage.kind === 'staged') && (stage.refused.length > 0) ? { refused: stage.refused } : {}),
  ...((stage.kind === 'failed') ? { stageError: stage.message } : {}),
  ...((stage.kind === 'ambiguous') ? { stageError: `${stage.builds} studios hold a build: the set must be in one, the others empty.` } : {}),
});

/** a camera problem, model-facing */
const problemReport = ({ from, to, kind, by }: CameraProblem) => ({ from: thousandths(from), to: thousandths(to), kind, by });
/** a box on the screen, model-facing: only that it is behind the camera when it is */
const screenReport = (box: ScreenBox) => box.behind ? { behind: true } : {
  left: thousandths(box.left), top: thousandths(box.top), right: thousandths(box.right), bottom: thousandths(box.bottom),
  center: { x: thousandths(box.center.x), y: thousandths(box.center.y) }, depth: hundredths(box.depth), inFrame: box.inFrame,
};
/** a side of a cut, model-facing */
const sideReport = ({ frame, time, shot, subject, screen, moving }: CutSide) => ({
  frame, time: thousandths(time), ...((shot !== undefined) ? { shot } : {}), ...((subject !== undefined) ? { subject } : {}),
  ...(screen ? { screen: screenReport(screen) } : {}), ...((moving !== undefined) ? { moving } : {}),
});
/** where each of two actors shown in a frame stands, by name */
const positionsAt = (film: Film, frame: number, names: readonly [string, string]): Record<string, Point> =>
  Object.fromEntries(names.map(name => [name, rounded(film.frames[frame].actors.find(actor => actor.name === name)!.position)]));

// -- Storyboard Frames -----------------------------------------------------------
/** the frames a storyboard of the shot named `shot` shows (SEE: SHOT_SPREAD), each
 *  once; or why the film shows no shot of that name alone */
const shotSpread = (film: Film, shots: ReadonlyArray<CameraShot>, shot: unknown): number[] => {
  const named = shots.filter(each => each.name === shot);
  if(named.length < 1) {
    const names = [...new Set(shots.flatMap(each => each.name ?? []))];
    throw new Error(`No shot '${String(shot)}': ${(names.length > 0) ? `the film's shots are ${names.join(', ')}` : 'the film\'s shots are unnamed (camera.cut\'s name names one)'}.`);
  } /* else -- a shot of that name */
  if(named.length > 1) throw new Error(`${named.length} shots are named '${String(shot)}', from ${listed(named.map(each => `${thousandths(each.from)} s`))}: give their times, or name each cut its own.`);
  const framed = shotFrames(film).find(each => each.shot.from === named[0].from);
  if(!framed) throw new Error(`No frame shows shot '${String(shot)}' (${thousandths(named[0].from)} s to ${thousandths(named[0].to)} s): it is shorter than a frame.`);
  return [...new Set(SHOT_SPREAD.map(share => Math.round(framed.first + ((framed.last - framed.first) * share))))];
};

/** a storyboard frame's caption: its time, its number and its shot's name */
const captionOf = (time: number, index: number, shots: ReadonlyArray<CameraShot>): string => {
  const shot = shotAt(shots, time);
  return [`${time.toFixed(2)} s`, `frame ${index}`, ...((shot?.name !== undefined) ? [shot.name] : [])].join(' · ');
};

// -- Rounding --------------------------------------------------------------------
const hundredths = (value: number): number => (Math.round(value * 100) / 100) || 0/*never -0*/;
const thousandths = (value: number): number => (Math.round(value * 1000) / 1000) || 0/*never -0*/;
const rounded = ({ x, z, height }: Point): Point => ({ x: hundredths(x), z: hundredths(z), height: hundredths(height) });
