import type { CharmIQAPI } from '../../../shared/charmiq';

import { DesignExists, displayName } from '../../brick-shared/designs';

import type { Avoided } from './clearance';
import { cameraShots, filmLengthOf, frameAtTime, setAt, shotAt, shotFrames, type CameraShot, type Film } from './film';
import { UnsavedChanges, type Films } from './films';
import { MAX_AREA_CELLS, type CellArea } from './ground';
import { closePairs, closest, isSized, overlapsOf, type Size } from './measure';
import { motionOf, MOTION_CHANNELS } from './motion-read';
import type { Player } from './player';
import type { Point, RecordedActor, SceneError } from './recorder';
import { cameraProblems, footingProblems, problemAtTime, reviewCuts, screenAt, type CameraProblem, type CutSide, type PartFinding } from './review';
import type { ScreenBox } from './screen';
import type { Surface } from './steps';
import type { Board, StageState } from './studios';

// the Charm command surface (SEE: manifest.json `advertise`): what the film is, the
// player's transport, and the film's geometry. A Charm writes the scene in the code
// editor's scene.js tab; these say how the film stands, show any moment of it on the
// studios so a screenshot sees it, show a storyboard of its moments on the main
// studio's sheet for one screenshot to read, tell where its actors and camera stand,
// which actors stand in each other and how close actors come, read it as it looks
// (each actor on the screen, where the camera goes wrong, each cut as an editor reads
// it; SEE: review.ts), and keep the film in the Drive: its set and its scene saved as
// one film, opened back, or cleared for a new one
// ********************************************************************************
// == Constants ===================================================================
/** the most frames a storyboard shows (SEE: Brick Studio's storyboard) */
const MAX_BOARD = 12;

// == Types =======================================================================
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
  /** shows frames on the main studio's storyboard sheet, answering how many */
  storyboard: (frames: ReadonlyArray<Board>, view?: string) => Promise<number>;
  /** the film's files */
  films: Films;
  /** the names of the sounds Stop Motion ships, once listed */
  shippedSounds: () => Promise<ReadonlyArray<string>>;
}>;

// == Commands ====================================================================
export const exportFilmCommands = (charmiq: CharmIQAPI, host: FilmHost): void => {
  charmiq.exportCommands({
    describeFilm: async () => {
      const film = host.film(), error = host.error(), stage = host.stage();
      const sizes = sizesOf(stage), staged = stagedOf(host);
      return {
        studios: host.studios(), editors: host.editors(), ...stageReport(stage),
        ...(film ? {
          title: film.scene.title, seconds: film.scene.length, ...(film.scene.speed ? { filmSeconds: thousandths(filmLengthOf(film)) } : {}), fps: film.scene.fps, frames: film.frames.length,
          actors: film.scene.actors.map(actor => actor.name), views: film.scene.views.map(view => view.name),
          shots: cameraShots(film.scene.camera, film.scene.length).map(shot => { const set = setAt(film.scene.sets, shot.from); return (set !== undefined) ? { ...shot, set } : shot; }),
          ...(film.scene.sets ? { sets: film.scene.sets.map(({ time, set }) => ({ time: thousandths(time), set })) } : {}),
          ...(film.scene.sounds ? { sounds: film.scene.sounds.map(({ time, name, volume, until, actor, fadeIn, fadeOut }) => ({
            time: thousandths(time), name, volume, ...((until !== undefined) ? { until: thousandths(until) } : {}), ...((actor !== undefined) ? { actor } : {}),
            ...((fadeIn !== undefined) ? { fadeIn: thousandths(fadeIn) } : {}), ...((fadeOut !== undefined) ? { fadeOut: thousandths(fadeOut) } : {}),
          })) } : {}),
          ...(film.footsteps ? { footsteps: [...new Set(film.footsteps.map(cue => cue.actor!))].map(actor => {
            const steps = film.footsteps!.filter(cue => cue.actor === actor);
            return { actor, steps: steps.length, from: thousandths(steps[0].time), to: thousandths(steps[steps.length - 1].time), sounds: [...new Set(steps.map(cue => cue.name))] };
          }) } : {}),
          ...(sizes ? { overlaps: overlapsReport(film, sizes) } : {}),
          ...(staged ? { camera: cameraProblems(staged.film, staged.sizes, staged.parts).map(problemReport) } : {}),
          ...(staged ? { footing: footingReport(staged.film) } : {}),
          ...((staged && (staged.avoided.length > 0)) ? { avoided: staged.avoided.map(({ from, to, kept, view }) => ({ from: thousandths(from), to: thousandths(to), kept: hundredths(kept), ...((view !== undefined) ? { view } : {}) })) } : {}),
          ...(sizes ? { close: closeReport(film, sizes) } : {}),
          ...((film.scene.logs.length > 0) ? { logs: film.scene.logs.slice(-20) } : {}),
        } : {}),
        ...(error ? { error: { message: error.message, ...((error.line !== undefined) ? { line: error.line } : {}) } } : {}),
        ...(await host.shippedSounds().then(shippedSounds => ({ shippedSounds }), (failure: unknown) => ({ shippedSounds: [], shippedSoundsError: (failure as Error).message }))),
        file: host.films.state,
      };
    },
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
    stage: async () => { await host.restage(); return stageReport(host.stage()); },

    play: () => { host.player.play(); return { playing: true }; },
    pause: () => { host.player.pause(); return { playing: false, frame: host.player.current.index }; },

    storyboard: async ({ times, frames, view }: { times?: unknown; frames?: unknown; view?: unknown; }) => {
      const film = filmOf(host);
      const { scene } = film;
      const last = film.frames.length - 1;
      if((view !== undefined) && !scene.views.some(each => each.name === view)) throw new Error(`No view '${String(view)}': ${(scene.views.length > 0) ? `the scene's views are ${scene.views.map(each => each.name).join(', ')}` : 'the scene names no views'}.`);
      if((times !== undefined) && (frames !== undefined)) throw new Error('Give times or frames, not both.');
      const shots = cameraShots(scene.camera, scene.length);
      let indices: number[];
      if(times !== undefined) {
        if(!Array.isArray(times) || !times.every(each => (typeof each === 'number') && (each >= 0) && (each <= scene.length))) throw new Error(`times are seconds from 0 to ${scene.length}.`);
        indices = times.map(each => frameAtTime(film, each));
      } else if(frames !== undefined) {
        if(!Array.isArray(frames) || !frames.every(each => Number.isInteger(each) && (each >= 0) && (each <= last))) throw new Error(`frames are whole frames from 0 to ${last}.`);
        indices = frames as number[];
      } else {
        indices = shotFrames(film).map(each => each.middle);
      }
      if(indices.length < 1) throw new Error('Give at least one time or frame.');
      if(indices.length > MAX_BOARD) throw new Error(`A storyboard shows at most ${MAX_BOARD} frames.`);
      const boards = indices.map(index => ({ frame: index, caption: captionOf(film.frames[index].time, index, shots) }));
      const shown = await host.storyboard(boards, view as string | undefined);
      return { shown, frames: boards.map(board => ({ frame: board.frame, time: thousandths(film.frames[board.frame].time), caption: board.caption })) };
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
    surfaces: async ({ x, z, width, depth, time }: { x?: unknown; z?: unknown; width?: unknown; depth?: unknown; time?: unknown; }) => {
      const film = reviewed(host).film;
      if([x, z, width, depth].some(value => !Number.isInteger(value))) throw new Error('x and z are the area\'s south-west cell, width and depth its size, all whole studs.');
      const area = { x: x as number, z: z as number, width: width as number, depth: depth as number };
      if((area.width < 1) || (area.depth < 1) || ((area.width * area.depth) > MAX_AREA_CELLS)) throw new Error(`An area is 1 to ${MAX_AREA_CELLS} cells (64 by 64).`);
      if((time !== undefined) && ((typeof time !== 'number') || (time < 0) || (time > film.scene.length))) throw new Error(`time is a moment of the film, 0 to ${film.scene.length} seconds.`);
      const set = setAt(film.scene.sets, (time as number | undefined) ?? 0);
      return { ...((set !== undefined) ? { set } : {}), ...surfacesReport(area, await host.surfaces(set, area)) };
    },
    where: ({ time, frame }: { time?: unknown; frame?: unknown; }) => {
      const film = filmOf(host);
      const at = film.frames[frameAt(film, time, frame)];
      return {
        frame: at.index, time: thousandths(at.time), ...((at.set !== undefined) ? { set: at.set } : {}),
        actors: at.actors.map(actor => ({ name: actor.name, position: rounded(actor.position), turn: { yaw: hundredths(actor.turn.yaw), pitch: hundredths(actor.turn.pitch), roll: hundredths(actor.turn.roll) } })),
        camera: { position: rounded(at.camera.position), target: rounded(at.camera.target), fov: hundredths(at.camera.fov) },
      };
    },
  });
};

// == Report ======================================================================
/** describeFilm's overlaps: each with where the two stand when they stand deepest */
export const overlapsReport = (film: Film, sizes: Readonly<Record<string, Size>>) =>
  overlapsOf(film, sizes).map(({ actors, from, to, most, frame, time }) => ({ actors, from: thousandths(from), to: thousandths(to), most: hundredths(most), time: thousandths(time), positions: positionsAt(film, frame, actors) }));

/** describeFilm's footing, over the film staged on the set's surfaces */
export const footingReport = (film: Film) =>
  footingProblems(film).map(({ actor, from, to, kind, most, at, surface, part, points, by, lines, keys, tilts, heldBack }) => ({
    actor, from: thousandths(from), to: thousandths(to), kind, most: hundredths(most), at: rounded(at), ...((surface !== undefined) ? { surface: hundredths(surface) } : {}), ...((part !== undefined) ? { part } : {}), ...(points ? { points } : {}), by, lines,
    ...(keys ? { keys: keys.map(key => ({ time: thousandths(key.time), height: hundredths(key.height) })) } : {}),
    ...(tilts ? { tilts: tilts.map(key => ({ time: thousandths(key.time), channel: key.channel, value: hundredths(key.value) })) } : {}), ...(heldBack ? { heldBack } : {}),
  }));

/** motionOf's answer: an actor's motion read (SEE: motion-read.ts), rounded */
export const motionReport = (film: Film, actor: RecordedActor, from: number, to: number, samples: number) => {
  const read = motionOf(film, actor, from, to, samples);
  return {
    actor: read.actor,
    samples: read.samples.map(({ time, frame, shown, ...at }) => ({ time: thousandths(time), frame, shown, ...Object.fromEntries(Object.entries(at).map(([key, value]) => [key, hundredths(value)])) })),
    drivers: Object.fromEntries(MOTION_CHANNELS.map(channel => [channel, read.drivers[channel].map(({ from: spanFrom, to: spanTo, by, lines, heldBack }) => ({ from: thousandths(spanFrom), to: thousandths(spanTo), by, lines, ...((heldBack !== undefined) ? { heldBack: thousandths(heldBack) } : {}) }))])),
  };
};

/** the surfaces over an area as a person reads a map: north up (a row a z, the
 *  highest first), west on the left (a cell an x), each cell its surfaces' tops (plates)
 *  lowest first joined by `/`, `-` where none */
export const surfacesReport = (area: CellArea, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<Surface>>>) => ({
  area, west: area.x, east: area.x + area.width - 1,
  rows: rows.map((cells, row) => ({ z: area.z + row, cells: cells.map(surfaces => (surfaces.length > 0) ? surfaces.map(surface => hundredths(surface.height)).join('/') : '-').join(' ') })).reverse(),
});

/** describeFilm's close actors */
export const closeReport = (film: Film, sizes: Readonly<Record<string, Size>>) =>
  closePairs(film, sizes).map(pair => ({ actors: pair.actors, frame: pair.frame, time: thousandths(pair.time), gap: hundredths(pair.gap) }));

// == Util ========================================================================
/** runs a change of film, a refusal over unsaved changes saying how to go on */
const discarding = async <T>(change: () => Promise<T>): Promise<T> => {
  try { return await change(); }
  catch(failure) {
    if(failure instanceof UnsavedChanges) throw new Error(`${failure.message} Pass discard: true to go on without saving.`);
    throw failure;
  }
};

/** the film, or why there is none */
const filmOf = (host: FilmHost): Film => {
  const film = host.film();
  if(!film) throw new Error('No film yet: the scene.js tab holds no scene that runs (describeFilm says why).');
  return film;
};

/** the frame a time (the scene's seconds) or a frame (from 0) names, within the film */
const frameAt = (film: Film, time: unknown, frame: unknown): number => {
  if(typeof frame === 'number') { if(Number.isFinite(frame)) return Math.max(0, Math.min(film.frames.length - 1, Math.round(frame))); }
  else if((typeof time === 'number') && Number.isFinite(time)) return frameAtTime(film, time);
  throw new Error('Give the time (seconds) or the frame (from 0).');
};

/** how the stage stands, model-facing: its kind, the actors it refused, and why it
 *  stands unstaged when it failed */
const stageReport = (stage: StageState) => ({
  stage: stage.kind,
  ...((stage.kind === 'staged') && (stage.refused.length > 0) ? { refused: stage.refused } : {}),
  ...((stage.kind === 'failed') ? { stageError: stage.message } : {}),
  ...((stage.kind === 'ambiguous') ? { stageError: `${stage.builds} studios hold a build: the set must be in one, the others empty.` } : {}),
});

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

/** a storyboard frame's caption: its time, its number and its shot's name */
const captionOf = (time: number, index: number, shots: ReadonlyArray<CameraShot>): string => {
  const shot = shotAt(shots, time);
  return [`${time.toFixed(2)} s`, `frame ${index}`, ...((shot?.name !== undefined) ? [shot.name] : [])].join(' · ');
};

const hundredths = (value: number): number => (Math.round(value * 100) / 100) || 0/*never -0*/;
const thousandths = (value: number): number => (Math.round(value * 1000) / 1000) || 0/*never -0*/;
const rounded = ({ x, z, height }: Point): Point => ({ x: hundredths(x), z: hundredths(z), height: hundredths(height) });
/** where each of two actors shown in a frame stands, by name */
const positionsAt = (film: Film, frame: number, names: readonly [string, string]): Record<string, Point> =>
  Object.fromEntries(names.map(name => [name, rounded(film.frames[frame].actors.find(actor => actor.name === name)!.position)]));
