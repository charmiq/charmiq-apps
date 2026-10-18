import { merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import type { CharmIQAPI } from '../../../shared/charmiq';

import { DesignStore } from '../../brick-shared/designs';
import { Drive, type DriveFile, SOUND_FILES } from '../../brick-shared/drive';

import { exportFilmCommands } from './command';
import { Director } from './director';
import { exportFilm, fileName, save } from './export';
import type { Film, Paint } from './film';
import { FilmDialog } from './film-dialog';
import { Films } from './films';
import { closePairs } from './measure';
import { Player, type PlayerState } from './player';
import { castAs, type SceneError, type SoundCue } from './recorder';
import { addSound, applyEdit, isRefusal, retimeSound, sameSounds, soundsAdded, soundsMoved, type Refusal, type SceneEdit } from './scene-edit';
import { runScene } from './scene-runner';
import { SceneSource, SCENE_TAB, type MeasuredScene } from './scene-source';
import { isPlatformFile, peaksOf, soundsOf, SoundBank, SHIPPED_SOUNDS } from './sound';
import { SoundDialog } from './sound-dialog';
import { Soundtrack, type SoundState } from './soundtrack';
import { Strip } from './strip';
import { Studios, type StageState } from './studios';
import { Inspector } from './inspector';
import { actorColor, Timeline, type TimelineSounds } from './timeline';

// entry point: the film's timeline. It follows the scene's code in the code editor,
// runs it into a film, stages it on the studios (the film's screens) and wires the
// playhead, the timeline, the picture track and the transport. Stop Motion draws no
// film: the studios show it. A scene with a mistake keeps the last film that ran and
// says where the mistake is. The film's file (New, Open, Save) is its set and its scene
// in one design in the Drive, written and read by Stop Motion between the two. Stop
// Motion plays the film's sound itself, on the player's clock (SEE: soundtrack.ts)
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
const exportButton = element<HTMLButtonElement>('exportButton');
const soundChip = element<HTMLButtonElement>('soundChip');
const soundButton = element<HTMLButtonElement>('soundButton');
const fileControls = element<HTMLDivElement>('file');
const fileTitle = element<HTMLSpanElement>('fileTitle');
const fileState = element<HTMLSpanElement>('fileState');

// == Instances ===================================================================
/** a color the page's style names (a custom property), as a plan's marks take it */
const styled = (property: string): string => getComputedStyle(document.documentElement).getPropertyValue(property).trim();
/** a plan's marks in the timeline's colors: each actor's row, and the camera's */
const paint: Paint = { actor: index => styled(actorColor(index)), camera: styled('--brick-azure') };

const source = new SceneSource();
const studios = new Studios(paint);
const director = new Director(studios, code => runScene(code, SHIPPED_SOUNDS), { show: next => showFilm(next), error: next => showError(next) });
/** the Drive, through the Platform: the film's files and its sounds */
const drive = charmiq && new Drive(charmiq.mcp);
/** the film's sounds, read once each: a Platform file through the Drive, a shipped
 *  sound as the manifest declares it */
const bank = drive && new SoundBank(
  name => charmiq?.resources?.bytes ? charmiq.resources.bytes(name) : Promise.reject(new Error('This Platform delivers no Application files')),
  uri => drive.bytes(uri));
const soundtrack = new Soundtrack(bank);
const player = new Player(index => showFrame(index), soundtrack);
const inspector = new Inspector(element('inspect'), element('sheetFilm'), () => timeline.unpin());
const timeline = new Timeline(element('timeline'), {
  seek: index => player.seek(index), step: delta => player.step(delta), toggle: () => player.toggle(),
  picture: index => picture(index, INSPECT_WIDTH), nearPicture: index => strip.nearest(index),
  sounds: () => soundsKnown, fixed: cue => fixedWhy(cue), moveSound: (cue, time) => moveSound(cue, time),
}, inspector);
const strip = new Strip(element('strip'), index => { player.pause(); player.seek(index); }, () => void developTrack());
/** the film's files: Stop Motion reads and writes the main studio's build and the
 *  code block's scene for them, the set written staged anew */
const films = charmiq && drive && new Films(drive, charmiq.appState, {
  set: () => studios.readSet(),
  setSet: async ldraw => { await studios.writeSet(ldraw); void director.restage(); },
  clearSet: async () => { await studios.clearSet(); void director.restage(); },
  scene: () => source.code,
  checkScene: () => source.check(),
  setScene: code => source.write(code),
});
const filmDialog = films && new FilmDialog(element('films'), films, { onOpened: (name, scene) => opened(name, scene) });
/** the audio files in the Drive a sound is added from: the folder films go to first */
const soundStore = charmiq && drive && new DesignStore(drive, charmiq.appState, { noun: 'sound', listing: 'describeFilm', pick: 'Add' }, SOUND_FILES);
const soundDialog = soundStore && new SoundDialog(element('sounds'), soundStore, file => addSoundAt(file));

// == State =======================================================================
/** the film the timeline shows, and the mistake of the last scene run, when it has
 *  one */
let film: Film | undefined;
let error: SceneError | undefined;
/** the editors found, and whether one holds the scene */
let editors = 0, hasCode = false;
/** the export running, while one is */
let exporting: { cancelled: boolean; } | undefined;

// == Film ========================================================================
const showFilm = (next: Film) => {
  film = next;
  soundtrack.setFilm(next);
  learnSounds(next);
  player.setFilm(next);
  showTimeline();
  strip.show(next);
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
  filmFacts.textContent = `${scene.length.toFixed(1)} s · ${scene.fps} fps · ${film.frames.length} frames · ${scene.width}×${scene.height}`;
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
  if(studios.count < 1) return say('No studio.', 'Stop Motion plays the film on Brick Studio: add Brick Studio to this document, above the film.');
  if(stage.kind === 'ambiguous') return say(`${stage.builds} studios hold a build.`, 'The set is the build of one studio: keep it in one, and the others empty.');
  if(editors < 1) return say('No scene.', `The scene is code in a code editor's ${SCENE_TAB} tab: add a code editor to this document.`);
  if(!hasCode) return say('No scene.', `Waiting for a ${SCENE_TAB} tab in the code editor.`);
  if(!film) return error ? say('The scene has a mistake.', `${(error.line !== undefined) ? `Line ${error.line}: ` : ''}${error.message}`) : say('Reading the scene…', '', undefined, null);
  if(stage.kind === 'left') return say('The studio went back to its build.', 'The film is paused; stage it again to go on.', 'Stage again');
  if(stage.kind === 'failed') return say('The studio refused the film.', stage.message, 'Try again');
  if(stage.kind === 'staging') return say('Staging…', (stage.frames !== undefined) ? `Loading the film into the studio: ${stage.loaded ?? 0} of ${stage.frames} frames.` : 'Setting the scene in the studio.', undefined, (stage.frames !== undefined) ? ((stage.loaded ?? 0) / Math.max(1, stage.frames)) : null);
  status.hidden = true;
};

statusAction.addEventListener('click', () => void director.restage());

// == Picture track ===============================================================
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

/** saves the film over its own file, or asks for a name first */
const saveFilm = async () => {
  if(!films || !filmDialog) return;
  if(films.state.name === undefined) { filmDialog.saveAs(film?.scene.title ?? 'Untitled film'); return; }
  fileState.textContent = 'saving…';
  try { await films.save(); showFile(); }
  catch(failure) { fileState.textContent = (failure as Error).message; fileState.dataset.state = 'error'; }
};

element('newButton').addEventListener('click', () => void filmDialog?.openNew());
element('openButton').addEventListener('click', () => filmDialog?.openOpen());
element('saveButton').addEventListener('click', () => void saveFilm());

// == Sounds ======================================================================
// what the timeline knows of the film's sounds: each read one's length and waveform,
// each Platform file's name (a shipped sound is called by its own)
const soundLengths = new Map<string, number>();
const soundPeaks = new Map<string, Float32Array>();
const soundNames = new Map<string, string>();
const soundsKnown: TimelineSounds = {
  duration: sound => soundLengths.get(sound),
  label: sound => soundNames.get(sound) ?? (isPlatformFile(sound) ? 'a sound' : sound),
  peaks: sound => soundPeaks.get(sound),
};

/** the film's sounds read and named for the timeline, which draws them again once
 *  they are */
const learnSounds = (next: Film) => {
  const names = soundsOf(next);
  if(bank) {
    void bank.load(names).then(buffers => {
      for(const [name, buffer] of buffers) { soundLengths.set(name, buffer.duration); if(!soundPeaks.has(name)) soundPeaks.set(name, peaksOf(buffer, WAVE_SLICES)); }
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
 *  edited is shown to play what `expected` makes of the sounds the scene plays now
 *  (both run as the film runs them); undefined once the scene holds it, else why not */
const editScene = async (scene: MeasuredScene, edit: SceneEdit, expected: (sounds: ReadonlyArray<SoundCue>) => ReadonlyArray<SoundCue> | Refusal): Promise<string | undefined> => {
  const [before, after] = await Promise.all([runScene(edit.measured, SHIPPED_SOUNDS), runScene(applyEdit(edit), SHIPPED_SOUNDS)]);
  if(!before.ok) return `The scene has a mistake to fix first: ${before.error.message}`;
  if(!after.ok) return after.error.message;
  const wanted = expected(before.scene.sounds ?? []);
  if(isRefusal(wanted)) return wanted.refused;
  if(!sameSounds(after.scene.sounds ?? [], wanted)) return 'The timeline cannot make this change to the scene: change it there';
  try {
    await source.edit(scene, edit);
    return undefined/*the scene holds it*/;
  } catch(failure) {
    return (failure as Error).message;
  }
};

/** adds a Platform file to the scene, played from the playhead */
const addSoundAt = async (file: DriveFile) => {
  const scene = source.scene;
  if(!scene) throw new Error(`No code editor holds the scene: add one with a ${SCENE_TAB} tab.`);
  const time = film ? (player.current.index / film.scene.fps) : 0;
  soundNames.set(file.uri, file.fileName);
  const refused = await editScene(scene, addSound(scene.code, time, file.uri, file.fileName), sounds => soundsAdded(sounds, time, file.uri));
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
  return editScene(scene, edit, sounds => soundsMoved(sounds, cue, time));
};

soundButton.disabled = !soundDialog;
soundButton.addEventListener('click', () => soundDialog?.open());

// == Transport ===================================================================
/** a frame on the studios; while playing, how long the main studio takes to show it
 *  is what the sound waits */
const showFrame = (index: number) => {
  const asked = performance.now();
  studios.show(index);
  if(player.current.playing) void studios.whenShown(index).then(() => soundtrack.observeDelay(performance.now() - asked), () => undefined/*another frame meanwhile*/);
};

const showPlayer = (state: PlayerState) => {
  timeline.setFrame(state.index);
  strip.setFrame(state.index);
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

element('firstButton').addEventListener('click', () => { player.pause(); player.seek(0); });
element('backButton').addEventListener('click', () => player.step(-1));
playButton.addEventListener('click', () => player.toggle());
element('nextButton').addEventListener('click', () => player.step(1));
element('lastButton').addEventListener('click', () => { player.pause(); player.seek(Number.MAX_SAFE_INTEGER); });
loopButton.addEventListener('click', () => player.setLoop(!player.current.loop));

/** the sound chip: shown only when the film's sound is silent until a press (the
 *  press lets it in), plays without some of its sounds, or cannot play (its title
 *  says why, shown again as the sounds' names arrive) */
let soundState: SoundState = { kind: 'none' };
const showSound = (state: SoundState) => {
  soundState = state;
  const missing = (('missing' in state) && (state.missing.length > 0)) ? unread(state.missing) : undefined;
  const [shown, text, title] =
    (state.kind === 'silent') ? [true, 'Sound off · click to hear', `Let the film's sound play${missing ? ` (${missing})` : ''}`]
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
  if(exporting) { exporting.cancelled = true; return; }
  if(!film) return;
  const filming = film, request = { cancelled: false };
  exporting = request;
  player.pause();
  exportButton.classList.add('is-busy');
  try {
    const sounds = bank && await bank.load(soundsOf(filming));
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
  studioChip.textContent = (studios.count > 1) ? `${studios.count} studios` : (studios.count === 1) ? 'Brick Studio' : 'No studio';
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
source.text$.subscribe(({ editors: count, code }) => {
  editors = count;
  hasCode = code !== null;
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
  films.state$.subscribe(() => showFile());
  merge(source.text$, studios.setChanges$).pipe(debounceTime(RECHECK_MS)).subscribe(() => void films.recheck())/*the scene or the set changed*/;
} /* else -- standalone: no Drive */
if(charmiq) {
  exportFilmCommands(charmiq, { film: () => film, error: () => error, studios: () => studios.count, editors: () => editors, stage: () => studios.stageState, player, shown: index => studios.whenShown(index), storyboard: (frames, view) => studios.storyboard(frames, view), films: films! });
} /* else -- standalone: no Charm reaches the film */
showSheet();
showStatus();
showFile();
