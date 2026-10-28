import { merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, skip } from 'rxjs/operators';

import type { CharmIQAPI } from '../../../shared/charmiq';

import { DocumentState } from '../../brick-shared/app-state';
import { DesignStore } from '../../brick-shared/designs';
import { isPlatformFile, Drive, type DriveFile, SOUND_FILES } from '../../brick-shared/drive';
import { PickDialog } from '../../brick-shared/pick-dialog';

import { exportFilmCommands } from './command';
import { Director } from './director';
import { exportFilm, fileName, save } from './export';
import { filmLengthOf, filmTimeOf, type Film, type Paint } from './film';
import { FilmDialog } from './film-dialog';
import { filmPartsOf, Films } from './films';
import { GaitView } from './gait-view';
import { closePairs } from './measure';
import { Player, type PlayerState } from './player';
import { castAs, type Recorded, type SceneError, type SoundCue } from './recorder';
import { TimelineSurface } from './review-surface';
import { addSound, applyEdit, isRefusal, regait, retimeSound, sameGait, sameSounds, soundsAdded, soundsMoved, writtenGait, type Refusal, type SceneEdit } from './scene-edit';
import { runScene } from './scene-runner';
import { SceneSource, SCENE_TAB, type MeasuredScene } from './scene-source';
import { listShippedSounds, peaksOf, shippedSoundsLister, soundsOf, SoundBank } from './sound';
import { Soundtrack, type SoundState } from './soundtrack';
import { Strip } from './strip';
import { Studios, type StageState } from './studios';
import { Inspector } from './inspector';
import { actorColor, Timeline, type TimelineSounds } from './timeline';
import type { SoundReading } from './timeline-marks';

// entry point: the film's timeline. It follows the scene's code in the code editor,
// runs it into a film, stages it on the studios (the film's screens) and wires the
// playhead, the timeline, the picture track and the transport. Stop Motion draws no
// film: the studios show it. A scene with a mistake keeps the last film that ran and
// says where the mistake is. The film's file (New, Open, Save as, Save) is its set and
// its scene in one design in the Drive, written and read by Stop Motion between the
// two. Stop Motion plays the film's sound itself, on the player's clock (SEE:
// soundtrack.ts). The timeline is a review surface: a note marks it and shows its marks
// again on it (SEE: review-surface.ts)
//
//   SceneSource (the editor's scene.js) -> Director: runScene (a Worker), filmOf
//     -> Studios.stage (the wheels found, the reel loaded) -> Player (+ Soundtrack),
//        Timeline, Strip
// ********************************************************************************
const charmiq: CharmIQAPI | undefined = window.charmiq;

// == Constants ===================================================================
/** how long the film rests before its file looks again whether it changed */
const RECHECK_MS = 300/*ms*/;
/** the width of a picture on the picture track (its height the film's shape) */
const PICTURE_WIDTH = 128/*pixels*/;
/** the width of the inspector's picture of a frame (its height the film's shape): the
 *  sheet shows it at up to 300 CSS pixels */
const INSPECT_WIDTH = 480/*pixels*/;
/** how a picture is kept: a small image */
const PICTURE_TYPE = 'image/jpeg';
const PICTURE_QUALITY = 0.8;
/** where this browser keeps whether the picture track is a storyboard */
const STORYBOARD_KEY = 'stop-motion:storyboard';
/** how long after a film opens its bar says so while nothing stages: a film opened
 *  over the same set and scene stages nothing anew */
const OPENING_MS = 2_000/*ms*/;
/** how many slices of a sound its waveform draws */
const WAVE_SLICES = 512;
/** how long the export button says a film saved without its sound */
const WITHOUT_SOUND_MS = 6_000/*ms*/;

// == Elements ====================================================================
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = element<HTMLParagraphElement>('status');
const statusTitle = element<HTMLElement>('statusTitle');
const statusText = element<HTMLSpanElement>('statusText');
const statusAction = element<HTMLButtonElement>('statusAction');
const studioChip = element<HTMLSpanElement>('studioChip');
const editorChip = element<HTMLSpanElement>('editorChip');
const filmTitle = element<HTMLHeadingElement>('filmTitle');
const filmFacts = element<HTMLParagraphElement>('filmFacts');
const cast = element<HTMLUListElement>('cast');
const problem = element<HTMLDivElement>('problem');
const logs = element<HTMLPreElement>('logs');
const timecode = element<HTMLSpanElement>('timecode');
const frameCount = element<HTMLSpanElement>('frameCount');
const playButton = element<HTMLButtonElement>('playButton');
const loopButton = element<HTMLButtonElement>('loopButton');
const storyboardButton = element<HTMLButtonElement>('storyboardButton');
const gaitButton = element<HTMLButtonElement>('gaitButton');
const exportButton = element<HTMLButtonElement>('exportButton');
const soundChip = element<HTMLButtonElement>('soundChip');
const soundButton = element<HTMLButtonElement>('soundButton');
const fileControls = element<HTMLDivElement>('file');
const fileTitle = element<HTMLSpanElement>('fileTitle');
const fileState = element<HTMLSpanElement>('fileState');

// == Instances ===================================================================
// -- Scene and Studios -----------------------------------------------------------
/** a color the page's style names (a custom property), as a plan's marks take it */
const styled = (property: string): string => getComputedStyle(document.documentElement).getPropertyValue(property).trim();
/** a plan's marks in the timeline's colors: each actor's row, and the camera's */
const paint: Paint = { actor: index => styled(actorColor(index)), camera: styled('--brick-azure') };

const source = new SceneSource();
const studios = new Studios(paint);

// -- Drive -----------------------------------------------------------------------
/** the Drive, through the Platform: the film's files and its sounds */
const drive = charmiq && new Drive(charmiq.mcp);

// -- Sounds ----------------------------------------------------------------------
/** the sounds Stop Motion ships, listed from their folder until a listing succeeds:
 *  each by the name a scene plays it by, and the resource it is read as (none
 *  standalone) */
const shipped = shippedSoundsLister(() => charmiq ? listShippedSounds(charmiq.resources) : Promise.resolve(new Map()/*standalone: none*/));
const shippedNames = async (): Promise<ReadonlyArray<string>> => [...(await shipped()).keys()];
/** why the shipped sounds could not be listed, while they cannot: the scene waits for
 *  them, and the status offers to try again */
let shippedFailure: string | undefined/*listed, or not yet asked*/;

/** the film's sounds, read once each: a Platform file through the Drive, a shipped
 *  sound as the manifest declares it */
const bank = drive && new SoundBank(
  async name => {
    const resource = (await shipped()).get(name);
    if(!resource || !charmiq?.resources?.bytes) throw new Error(`Stop Motion ships no sound named ${name}`);
    return charmiq.resources.bytes(resource);
  },
  uri => drive.bytes(uri));
const soundtrack = new Soundtrack(bank);

/** the audio files in the Drive a sound is added from: the folder films go to first */
/** the document's app state, the one every store keeps its entry in */
const documentState = charmiq && new DocumentState(charmiq.appState);
const soundStore = documentState && drive && new DesignStore(drive, documentState, { noun: 'sound', listing: 'describeFilm', pick: 'Add' }, SOUND_FILES);
const soundDialog = soundStore && new PickDialog(element('sounds'), soundStore, file => addSoundAt(file), 'The sound was not added');

// -- Director --------------------------------------------------------------------
/** runs the scene once its shipped sounds are listed, its audiences lifted from the
 *  figures built into the set, and shows the film it makes */
const director = new Director(studios, async (code, parts) => {
  let names: ReadonlyArray<string>;
  try {
    names = await shippedNames();
  } catch(failure) {
    console.warn('stop-motion: the shipped sounds could not be listed:', failure);
    shippedFailure = (failure as Error).message;
    return { ok: false, error: { message: `The sounds Stop Motion ships could not be listed (${shippedFailure}).` } };
  }
  shippedFailure = undefined;
  return runScene(code, names, parts);
}, { show: next => showFilm(next), error: next => showError(next) });

// -- Playback --------------------------------------------------------------------
const player = new Player(index => showFrame(index), soundtrack);
const inspector = new Inspector(element('inspect'), element('sheetFilm'), () => timeline.unpin());
const timeline = new Timeline(element('timeline'), {
  seek: index => player.seek(index), step: delta => player.step(delta), toggle: () => player.toggle(), marked: span => surface.mark(span),
  picture: index => picture(index, INSPECT_WIDTH), nearPicture: index => strip.nearest(index),
  sounds: () => soundsKnown, fixed: cue => fixedWhy(cue), moveSound: (cue, time) => moveSound(cue, time),
  viewed: span => strip.setSpan(span)/*the picture track frames it*/,
  gait: actor => { gaitView.choose(actor); showGait(true); },
  followActor: actor => { followed = actor; follow(); },
}, inspector);
const strip = new Strip(element('strip'), index => { player.pause(); player.seek(index); }, () => void developTrack(), (from, to) => timeline.showSpan(from, to));
/** the timeline as a review surface: marked while a note is written, a note's marks
 *  shown on it */
const surface = new TimelineSurface({ film: () => film, frame: () => player.current.index, timeline, player, shown: index => studios.whenShown(index) });
const gaitView = new GaitView(element('gait'), { write: (name, keys) => writeGait(name, keys), seek: index => { player.pause(); player.seek(index); }, step: delta => player.step(delta), rewind: index => player.seek(index), loop: span => player.loopSpan(span), close: () => showGait(false) });

// -- Film Files ------------------------------------------------------------------
/** the film's files: Stop Motion reads and writes the main studio's build and the
 *  code block's scene for them, the set written staged anew */
const films = documentState && drive && new Films(drive, documentState, filmPartsOf(studios, director, source));
const filmDialog = films && new FilmDialog(element('films'), films, { onOpened: (name, scene) => opened(name, scene) });

// == State =======================================================================
/** the film the timeline shows, and the mistake of the last scene run, when it has
 *  one */
let film: Film | undefined;
let error: SceneError | undefined;
/** the editors found, and whether one holds the scene; why the Platform refused
 *  looking for them, while it does */
let editors = 0, hasCode = false;
let editorsRefused: string | undefined;
/** the export running, while one is: whether it was stopped, and its stop */
let exporting: { cancelled: boolean; stop: () => void; } | undefined;

// == Film ========================================================================
/** the actor the studios follow through the film (its row's name pressed), while one is */
let followed: string | undefined;
/** tells the studios whom to follow: the actor followed, with its keys at the film's
 *  times, or no one. A film staged again follows no one until told */
const follow = () => {
  const actor = followed && film?.scene.actors.find(each => each.name === followed);
  studios.follow(actor ? { actor: actor.name, keys: [...new Set(actor.keys.map(key => key.time))].map(time => filmTimeOf(film!, time)) } : undefined);
};

const showFilm = (next: Film) => {
  film = next;
  soundtrack.setFilm(next);
  learnSounds(next);
  player.setFilm(next);
  showTimeline();
  follow()/*staged again, the studios follow no one until told*/;
  strip.show(next);
  gaitView.setFilm(next);
  showSheet();
  showStatus();
};

/** the timeline of the film, marking the actors that come close once the stage has
 *  sized them */
const showTimeline = () => {
  const stage = studios.stageState;
  timeline.show(film, (film && (stage.kind === 'staged') && (studios.film?.scene === film.scene)) ? closePairs(film, stage.sizes) : []);
};

const showError = (next: SceneError | undefined) => {
  error = next;
  problem.hidden = !next;
  problem.replaceChildren(...(next ? [
    Object.assign(document.createElement('b'), { textContent: (next.line !== undefined) ? `Line ${next.line}` : 'The scene' }),
    Object.assign(document.createElement('span'), { textContent: next.message }),
  ] : []));
  editorChip.dataset.state = next ? 'error' : hasCode ? 'ok' : (editors > 0) ? 'waiting' : 'none';
  showStatus();
};

// == Sheet =======================================================================
const showSheet = () => {
  if(!film) { filmTitle.textContent = 'No film yet'; filmFacts.textContent = ''; cast.replaceChildren(); logs.hidden = true; return; }
  const { scene } = film;
  filmTitle.textContent = scene.title;
  filmFacts.textContent = `${filmLengthOf(film).toFixed(1)} s · ${scene.fps} fps · ${film.frames.length} frames · ${scene.width}×${scene.height}`;
  const stage = studios.stageState;
  const refused = new Map((stage.kind === 'staged') ? stage.refused.map(each => [each.name, each.reason]) : []);
  cast.replaceChildren(...scene.actors.map((actor, index) => {
    const item = document.createElement('li');
    item.style.setProperty('--row', `var(${actorColor(index)})`);
    const castWords = castAs(actor.source);
    const what = `${castWords.definite ? 'the' : 'a'} ${castWords.words}`;
    const notes = [what, actor.ride ? `rides the ${actor.ride.parent}` : undefined, ((stage.kind === 'staged') && stage.wheeled.has(actor.name)) ? 'its wheels roll' : undefined].filter(Boolean).join(' · ');
    item.append(Object.assign(document.createElement('b'), { textContent: actor.name }), Object.assign(document.createElement('span'), { textContent: refused.get(actor.name) ?? notes }));
    item.classList.toggle('is-refused', refused.has(actor.name));
    return item;
  }));
  logs.hidden = scene.logs.length < 1;
  logs.textContent = scene.logs.slice(-12).join('\n');
};

// == Status ======================================================================
/** what stops the film from showing on the studios, and what to do; hidden while
 *  it shows */
const showStatus = () => {
  const stage = studios.stageState;
  // `working`, the share done of work underway (null while its share is unknown)
  const say = (title: string, text: string, action?: string, working?: number | null) => {
    status.hidden = false;
    statusTitle.textContent = title;
    statusText.textContent = text;
    statusAction.hidden = !action;
    statusAction.textContent = action ?? '';
    status.classList.toggle('is-working', working !== undefined);
    status.classList.toggle('is-measured', typeof working === 'number');
    if(typeof working === 'number') status.style.setProperty('--done', String(working));
  };
  // Stop Motion finds the studio and the editor by looking for them in the document: a
  // refused look stops everything, and the Platform's reason says what to change
  const refused = studios.refusal ?? editorsRefused;
  if(refused !== undefined) return say('Stop Motion can\'t look for the studio and the code editor.', refused, 'Try again');
  if((studios.count < 1) && (studios.otherVersions > 0)) return say('Reload the page.', 'This document\'s Brick Studio is another version than Stop Motion: reloading the page loads the same version of both.');
  if(studios.count < 1) return say('No studio.', 'Stop Motion plays the film on Brick Studio: add Brick Studio to this document, above the film.');
  if(stage.kind === 'ambiguous') return say(`${stage.builds} studios hold a build.`, 'The set is the build of one studio: keep it in one, and the others empty.');
  if(editors < 1) return say('No scene.', `The scene is code in a code editor's ${SCENE_TAB} tab: add a code editor to this document.`);
  if(!hasCode) return say('No scene.', `Waiting for a ${SCENE_TAB} tab in the code editor.`);
  if(shippedFailure !== undefined) return say('Stop Motion\'s sounds could not be listed.', shippedFailure, 'Try again');
  if(!film) return error ? say('The scene has a mistake.', `${(error.line !== undefined) ? `Line ${error.line}: ` : ''}${error.message}`) : say('Reading the scene…', '', undefined, null);
  if(stage.kind === 'left') return say('The studio went back to its build.', 'The film is paused; stage it again to go on.', 'Stage again');
  if(stage.kind === 'failed') return say('The studio refused the film.', stage.message, 'Try again');
  if(stage.kind === 'staging') return say('Staging…', (stage.frames !== undefined) ? `Loading the film into the studio: ${stage.loaded ?? 0} of ${stage.frames} frames.` : 'Setting the scene in the studio.', undefined, (stage.frames !== undefined) ? ((stage.loaded ?? 0) / Math.max(1, stage.frames)) : null);
  status.hidden = true;
};

// the studio and the editor looked for again, the shipped sounds listed again and the
// scene run again, or the latest scene staged again as it is
statusAction.addEventListener('click', () => {
  if((studios.refusal !== undefined) || (editorsRefused !== undefined)) { studios.retry(); source.retry(); return; }
  if((shippedFailure !== undefined) && (source.code !== null)) void director.take(source.code);
  else void director.restage();
});

// == Picture Track ===============================================================
/** the darkroom: a picture is drawn here to keep */
const darkroom = document.createElement('canvas');
let developing = false;

/** a frame's picture `width` pixels wide (its height the film's shape) as the main
 *  studio draws it, kept as a small image; none while the film plays or exports, or
 *  when the studio cannot draw it (the status says why). The studio's own picture never
 *  shifts for it */
const picture = async (index: number, width: number): Promise<string | undefined> => {
  const filming = film;
  if(!filming || player.current.playing || exporting || (studios.stageState.kind !== 'staged')) return undefined;
  const image = await studios.thumbnail(index, { width, height: Math.round(width * (filming.scene.height / filming.scene.width)) });
  if(!image) return undefined;
  [darkroom.width, darkroom.height] = [image.width, image.height];
  darkroom.getContext('2d')!.drawImage(image, 0, 0);
  image.close();
  return darkroom.toDataURL(PICTURE_TYPE, PICTURE_QUALITY);
};

/** develops the picture track from the main studio a cell at a time, while the film
 *  neither plays nor exports: the studio's picture never shifts for it */
const developTrack = async () => {
  if(developing) return/*already developing*/;
  developing = true;
  try {
    while(film && !player.current.playing && !exporting && (studios.stageState.kind === 'staged')) {
      const filming = film;
      const index = strip.wanting[0];
      if(index === undefined) break/*every cell developed*/;
      const developed = await picture(index, PICTURE_WIDTH);
      if(!developed) break/*none now: the status says why*/;
      strip.develop(filming, index, developed);
      if((film === filming) && strip.wanting.includes(index)) break/*the track took no picture*/;
    }
  } finally {
    developing = false;
  }
};

// -- Storyboard ------------------------------------------------------------------
/** shows the picture track a shot at a time, or a frame at a time: this browser's own
 *  choice, kept across visits */
const showStoryboard = (storyboard: boolean) => {
  storyboardButton.setAttribute('aria-pressed', String(storyboard));
  strip.setStoryboard(storyboard);
  try { localStorage.setItem(STORYBOARD_KEY, String(storyboard)); } catch { /*a preference only*/ }
};
storyboardButton.addEventListener('click', () => showStoryboard(storyboardButton.getAttribute('aria-pressed') !== 'true'));
try { if(localStorage.getItem(STORYBOARD_KEY) === 'true') showStoryboard(true); } catch { /*storage can be absent or refused*/ }

// -- Gait ------------------------------------------------------------------------
/** shows the Gait mode in place of the timeline, the picture track and the sheet, or
 *  the film again */
const showGait = (on: boolean) => {
  gaitButton.setAttribute('aria-pressed', String(on));
  gaitButton.textContent = on ? 'Close gait' : 'Gait';
  document.querySelector('.motion')!.classList.toggle('is-gait', on);
  gaitView.show(on);
};
gaitButton.addEventListener('click', () => showGait(gaitButton.getAttribute('aria-pressed') !== 'true'));

// == File ========================================================================
/** the film's file: its name, and whether it is saved; `note`, a word about the last
 *  thing done to it, until it next changes */
const showFile = (note?: string) => {
  if(!films) { fileControls.hidden = true; return; }
  const { name, changed } = films.state;
  fileTitle.textContent = name ?? 'Untitled film';
  fileState.textContent = opening ? 'opening…' : (note ?? (!changed ? ((name !== undefined) ? 'saved' : '') : (name !== undefined) ? 'unsaved changes' : 'not saved'));
  fileState.dataset.state = opening ? 'working' : note ? 'note' : changed ? 'changed' : 'saved';
};

/** a film opened: its bar says it is opening until the film staged on it is drawn
 *  (or nothing stages anew, or the stage stops), then what the open left */
let opening: Readonly<{ note?: string; staging: boolean; timer: number; }> | undefined;
const opened = (name: string, scene: boolean) => {
  if(opening) window.clearTimeout(opening.timer);
  const note = scene ? undefined : `"${name}" carries no scene: its set is open, the scene kept.`;
  opening = { ...(note ? { note } : {}), staging: false, timer: window.setTimeout(() => { if(opening && !opening.staging) settleOpening(); }, OPENING_MS) };
  showFile();
};
const settleOpening = () => {
  if(!opening) return;
  const { note, timer } = opening;
  window.clearTimeout(timer);
  opening = undefined;
  showFile(note);
};
const followOpening = (stage: StageState) => {
  if(!opening) return;
  if(stage.kind === 'staging') opening = { ...opening, staging: true };
  else if((stage.kind !== 'staged') || opening.staging) settleOpening()/*staged, or stopped*/;
};

/** saves the film over its own file once the document has told it, or asks for a name */
const saveFilm = async () => {
  if(!films || !filmDialog) return;
  fileState.textContent = 'saving…';
  try {
    const saved = await films.saveOver();
    showFile((saved && !saved.changed) ? 'saved: nothing had changed' : undefined);
    if(!saved) filmDialog.saveAs(film?.scene.title ?? 'Untitled film');
  } catch(failure) { fileState.textContent = (failure as Error).message; fileState.dataset.state = 'error'; }
};
/** asks for a name and a folder and saves the film there as a new file, which becomes
 *  the film's own; the film's own name offered, else the scene's title */
const saveFilmAs = () => filmDialog?.saveAs(films?.state.name ?? film?.scene.title ?? 'Untitled film');

element('newButton').addEventListener('click', () => void filmDialog?.openNew());
element('openButton').addEventListener('click', () => filmDialog?.openOpen());
element('saveAsButton').addEventListener('click', () => saveFilmAs());
element('saveButton').addEventListener('click', () => void saveFilm());

// == Sounds ======================================================================
// what the timeline knows of the film's sounds: each read one's length and waveform,
// each Platform file's name (a shipped sound is called by its own), and each one's
// file being read or found unreadable
const soundLengths = new Map<string, number>();
const soundPeaks = new Map<string, Float32Array>();
const soundNames = new Map<string, string>();
const soundReadings = new Map<string, SoundReading>();
const soundsKnown: TimelineSounds = {
  duration: sound => soundLengths.get(sound),
  label: sound => soundNames.get(sound) ?? (isPlatformFile(sound) ? 'a sound' : sound),
  peaks: sound => soundPeaks.get(sound),
  reading: sound => soundReadings.get(sound),
};

/** the film's sounds read and named for the timeline, which shows each being read and
 *  draws it again as it is read or found unreadable */
const learnSounds = (next: Film) => {
  const names = soundsOf(next);
  if(bank) {
    for(const name of names) if(!soundLengths.has(name)) soundReadings.set(name, 'loading')/*read again, if unreadable before*/;
    timeline.soundsChanged();
    void bank.load(names, (name, buffer) => {
      if(buffer) {
        soundLengths.set(name, buffer.duration);
        if(!soundPeaks.has(name)) soundPeaks.set(name, peaksOf(buffer, WAVE_SLICES));
        soundReadings.delete(name);
      } else soundReadings.set(name, 'unread');
      timeline.soundsChanged();
    });
  } /* else -- standalone: no sound is read */
  for(const name of names) {
    if(!drive || !isPlatformFile(name) || soundNames.has(name)) continue/*named, or not a Platform file*/;
    void drive.fileName(name).then(found => { soundNames.set(name, found); timeline.soundsChanged(); showSound(soundState); }, () => undefined/*unnamed: called a sound*/);
  }
};

/** the sounds that could not be read, called as the timeline calls them */
const unread = (sounds: ReadonlyArray<string>) => `${sounds.map(soundsKnown.label).join(', ')} could not be read`;

/** writes an edit measured on `scene` into the tab it was read from, once the scene as
 *  edited (`after`) is shown to hold what the edit means against the scene now
 *  (`before`; both run as the film runs them, `holds` saying why not); undefined once
 *  the scene holds it, else why not */
const editScene = async (scene: MeasuredScene, edit: SceneEdit, holds: (before: Recorded, after: Recorded) => string | undefined): Promise<string | undefined> => {
  const [names, parts] = await Promise.all([shippedNames(), studios.figureParts()]);
  const [before, after] = await Promise.all([runScene(edit.measured, names, parts), runScene(applyEdit(edit), names, parts)]);
  if(!before.ok) return `The scene has a mistake to fix first: ${before.error.message}`;
  if(!after.ok) return after.error.message;
  const why = holds(before.scene, after.scene);
  if(why !== undefined) return why;
  try {
    await source.edit(scene, edit);
    return undefined/*the scene holds it*/;
  } catch(failure) {
    return (failure as Error).message;
  }
};

/** what a sound's edit must leave: the scene playing what `expected` makes of the sounds
 *  it plays now */
const playing = (expected: (sounds: ReadonlyArray<SoundCue>) => ReadonlyArray<SoundCue> | Refusal) => (before: Recorded, after: Recorded): string | undefined => {
  const wanted = expected(before.sounds ?? []);
  if(isRefusal(wanted)) return wanted.refused;
  return sameSounds(after.sounds ?? [], wanted) ? undefined/*it plays them*/ : 'The timeline cannot make this change to the scene: change it there';
};

/** adds a Platform file to the scene, played from the playhead */
const addSoundAt = async (file: DriveFile) => {
  const scene = source.scene;
  if(!scene) throw new Error(`No code editor holds the scene: add one with a ${SCENE_TAB} tab.`);
  const time = film ? film.frames[player.current.index].time : 0/*the scene's time the playhead shows*/;
  soundNames.set(file.uri, file.fileName);
  const refused = await editScene(scene, addSound(scene.code, time, file.uri, file.fileName), playing(sounds => soundsAdded(sounds, time, file.uri)));
  if(refused !== undefined) throw new Error(refused);
};

/** why a sound cannot be moved on the timeline, or undefined when its time is a
 *  number the scene writes on its line */
const fixedWhy = (cue: SoundCue): string | undefined => {
  const code = source.code;
  if(code === null) return 'No code editor holds the scene';
  const edit = retimeSound(code, cue, cue.time);
  return isRefusal(edit) ? edit.refused : undefined;
};

/** moves a sound to a time of the film: its time rewritten on its line, undefined once
 *  the scene holds it, else why not */
const moveSound = async (cue: SoundCue, time: number): Promise<string | undefined> => {
  const scene = source.scene;
  if(!scene) return 'No code editor holds the scene';
  const edit = retimeSound(scene.code, cue, time);
  if(isRefusal(edit)) return edit.refused;
  return editScene(scene, edit, playing(sounds => soundsMoved(sounds, cue, time)));
};

/** writes the scene's gait `name` as `keys` (what it changes from the built-in walk):
 *  undefined once the scene holds it, else why not */
const writeGait = async (name: string, keys: Readonly<Record<string, unknown>>): Promise<string | undefined> => {
  const scene = source.scene;
  if(!scene) return 'No code editor holds the scene';
  const edit = regait(scene.code, film?.scene.gaits?.find(each => each.name === name), name, keys);
  if(isRefusal(edit)) return edit.refused;
  return editScene(scene, edit, (_, after) => sameGait(after.gaits?.find(each => each.name === name)?.keys, writtenGait(keys)) ? undefined/*it walks it*/ : 'The Gait mode cannot make this change to the scene: change it there');
};

soundButton.disabled = !soundDialog;
soundButton.addEventListener('click', () => soundDialog?.open());

// == Transport ===================================================================
/** a frame on the studios, saying whether the film plays; while playing, how long the
 *  main studio takes to show it is what the sound waits */
const showFrame = (index: number) => {
  const asked = performance.now();
  studios.show(index, player.current.playing);
  if(player.current.playing) void studios.whenShown(index).then(() => soundtrack.observeDelay(performance.now() - asked), () => undefined/*another frame meanwhile*/);
};

const showPlayer = (state: PlayerState) => {
  timeline.setFrame(state.index);
  strip.setFrame(state.index);
  gaitView.setFrame(film?.frames[state.index]);
  const fps = film?.scene.fps ?? 24;
  const seconds = Math.floor(state.index / fps), frames = state.index % fps;
  timecode.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  frameCount.textContent = film ? `frame ${state.index + 1} of ${film.frames.length}` : '';
  playButton.setAttribute('aria-pressed', String(state.playing));
  playButton.title = playButton.ariaLabel = state.playing ? 'Pause (Space)' : 'Play (Space)';
  loopButton.setAttribute('aria-pressed', String(state.loop));
  if(!state.playing) void developTrack()/*idle: the picture track develops*/;
};
player.state$.subscribe(showPlayer);
// a studio's controls say whether the film plays: told at once as it starts or stops
player.state$.pipe(map(state => state.playing), distinctUntilChanged(), skip(1)).subscribe(() => showFrame(player.current.index));
// what the person asks from a studio's controls, full screen: the film's own transport
studios.asked$.subscribe(ask => {
  if(ask.kind === 'play') player.play();
  else if(ask.kind === 'pause') player.pause();
  else player.seek(ask.frame);
});

element('firstButton').addEventListener('click', () => { player.pause(); player.seek(0); });
element('backButton').addEventListener('click', () => player.step(-1));
playButton.addEventListener('click', () => player.toggle());
element('nextButton').addEventListener('click', () => player.step(1));
element('lastButton').addEventListener('click', () => { player.pause(); player.seek(Number.MAX_SAFE_INTEGER); });
loopButton.addEventListener('click', () => player.setLoop(!player.current.loop));

/** the sound chip: shown only while the film's sounds load (the film plays silent
 *  meanwhile), when its sound is silent until a press (the press lets it in), plays
 *  without some of its sounds, or cannot play (its title says why, shown again as the
 *  sounds' names arrive) */
let soundState: SoundState = { kind: 'none' };
const showSound = (state: SoundState) => {
  soundState = state;
  const missing = (('missing' in state) && (state.missing.length > 0)) ? unread(state.missing) : undefined;
  const [shown, text, title] =
    (state.kind === 'loading') ? [true, `Loading sounds · ${state.settled} of ${state.total}`, 'The film plays silent until its sounds arrive']
    : (state.kind === 'silent') ? [true, 'Sound off · click to hear', `Let the film's sound play${missing ? ` (${missing})` : ''}`]
    : (state.kind === 'unavailable') ? [true, 'No sound', ('reason' in state) ? state.reason : (missing ?? '')]
    : ((state.kind === 'ready') && missing) ? [true, 'Sounds missing', missing]
    : [false, '', ''];
  soundChip.hidden = !shown;
  soundChip.dataset.state = (missing && (state.kind === 'ready')) ? 'missing' : state.kind;
  soundChip.disabled = (state.kind !== 'silent');
  soundChip.textContent = text;
  soundChip.title = title;
};
soundtrack.state$.subscribe(showSound);
soundChip.addEventListener('click', () => void soundtrack.resume());

exportButton.addEventListener('click', async () => {
  if(exporting) { exporting.cancelled = true; exporting.stop(); return; }
  if(!film) return;
  // a stop ends the wait on the sounds at once: their read carries on for the film's
  // playing, and an export stopped meanwhile never starts
  let stop = () => {/*not yet waiting*/};
  const stopped = new Promise<void>(resolve => { stop = resolve; });
  const filming = film, request = { cancelled: false, stop: () => stop() };
  exporting = request;
  player.pause();
  exportButton.classList.add('is-busy');
  try {
    exportButton.textContent = 'Loading sounds… · stop'/*until the sounds are in, then each frame encoded*/;
    const sounds = bank && await Promise.race([bank.load(soundsOf(filming)), stopped.then(() => undefined/*stopped*/)]);
    if(request.cancelled) return/*stopped while the sounds loaded*/;
    const exported = await exportFilm(filming, studios, sounds, (done, total) => { exportButton.textContent = `Exporting ${Math.round((done / total) * 100)}% · stop`; }, () => request.cancelled);
    if(exported) save(exported.file, fileName(filming.scene.title));
    if(exported?.withoutSound) exportedNote('Saved without sound', exported.withoutSound);
    else if(exported?.missing) exportedNote((exported.missing.length < soundsOf(filming).size) ? 'Saved, sounds missing' : 'Saved without sound', unread(exported.missing));
  } catch(failure) {
    console.error('stop-motion: the export failed:', failure);
    showError({ message: `The export failed: ${(failure as Error).message}` });
  } finally {
    exporting = undefined;
    exportButton.classList.remove('is-busy');
    exportButton.textContent = 'Export MP4';
    player.redraw()/*the studio shows the playhead's frame again*/;
    void developTrack();
  }
});

/** an export saved without its film's sound, or some of it: the export button says
 *  so a moment, its title why */
const exportedNote = (label: string, reason: string) => {
  setTimeout(() => {
    exportButton.textContent = label;
    exportButton.title = reason;
    setTimeout(() => { if(!exporting) { exportButton.textContent = 'Export MP4'; exportButton.title = 'Save the film as a video'; } }, WITHOUT_SOUND_MS);
  });
};

// == Studios =====================================================================
/** the studio chip: how many studios, and where the film stands on them */
const showChip = () => {
  studioChip.dataset.state = studios.stageState.kind;
  studioChip.textContent = (studios.count > 1) ? `${studios.count} studios` : (studios.count === 1) ? 'Brick Studio' : (studios.otherVersions > 0) ? 'Reload' : 'No studio';
};

studios.state$.subscribe((stage: StageState) => {
  if((stage.kind !== 'staged') && (stage.kind !== 'staging')) player.pause()/*no film to play: the status says why*/;
  followOpening(stage);
  showChip();
  showStatus();
  showSheet();
  if(stage.kind === 'staged') { showTimeline()/*the actors sized*/; void developTrack(); }
});
studios.studios$.subscribe(() => { showChip(); showStatus(); void director.restage(); })/*new studios: the scene staged again on them*/;

// == Init ========================================================================
source.text$.subscribe(({ editors: count, code, refused }) => {
  editors = count;
  hasCode = code !== null;
  editorsRefused = refused;
  editorChip.dataset.state = error ? 'error' : hasCode ? 'ok' : (count > 0) ? 'waiting' : 'none';
  editorChip.textContent = (count > 0) ? SCENE_TAB : 'No editor';
  showStatus();
});
source.text$.pipe(map(({ code }) => code), distinctUntilChanged(), debounceTime(250)).subscribe(code => {
  if(code === null) return;
  void director.take(code);
});

source.init(charmiq);
studios.init(charmiq);
void soundStore?.init()/*the folder sounds are added from first*/;
if(films) {
  void films.store.init()/*the folder the app state names*/;
  films.init().catch((failure: unknown) => { fileState.textContent = (failure as Error).message; fileState.dataset.state = 'error'; })/*the film's file the app state names*/;
  films.state$.subscribe(() => showFile());
  merge(source.text$, studios.setChanges$).pipe(debounceTime(RECHECK_MS)).subscribe(() => void films.recheck())/*the scene or the set changed*/;
} /* else -- standalone: no Drive */
surface.advertise(charmiq);
if(charmiq) exportFilmCommands(charmiq, { film: () => film, error: () => error, studios: () => studios.count, editors: () => editors, stage: () => studios.stageState, staged: () => studios.film, restage: () => director.restage(), player, shown: index => studios.whenShown(index), surfaces: (set, area) => studios.surfacesIn(set, area), extent: set => studios.extentOf(set), figureParts: () => director.parts, held: asks => studios.held(asks), storyboard: (frames, view) => studios.storyboard(frames, view), films: films!, shippedSounds: shippedNames, hear: sound => bank ? bank.read(sound) : Promise.reject(new Error('this Platform delivers no sound files')), soundName: async sound => (drive && isPlatformFile(sound)) ? drive.fileName(sound) : undefined/*a shipped sound: named by its name*/ });
showSheet();
showStatus();
showFile();
