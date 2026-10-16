import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import type { CharmIQAPI } from '../../../shared/charmiq';
import { exportFilmCommands } from './command';
import { exportFilm, fileName, save } from './export';
import { filmOf, type Film } from './film';
import { Player, type PlayerState } from './player';
import type { SceneError } from './recorder';
import { runScene } from './scene-runner';
import { SceneSource, SCENE_TAB } from './scene-source';
import { Strip } from './strip';
import { Studios, type StageState } from './studios';
import { actorColor, Timeline } from './timeline';

// entry point: follows the scene's code in the code editor, runs it into a film,
// stages it on the studios, and wires the player, the timeline, the strip and the
// transport. A scene with a mistake keeps the last film that ran on screen and says
// where the mistake is
//
//   SceneSource (the editor's scene.js) -> runScene (a Worker) -> filmOf
//     -> Studios.stage (wheeled actors) -> filmOf again -> Player, Timeline, Strip
// ********************************************************************************
const charmiq: CharmIQAPI | undefined = window.charmiq;

// == Elements ====================================================================
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const screen = element<HTMLCanvasElement>('screen');
const slate = element<HTMLDivElement>('slate');
const slateTitle = element<HTMLHeadingElement>('slateTitle');
const slateText = element<HTMLParagraphElement>('slateText');
const slateAction = element<HTMLButtonElement>('slateAction');
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
const developButton = element<HTMLButtonElement>('developButton');
const exportButton = element<HTMLButtonElement>('exportButton');

// == Instances ===================================================================
const source = new SceneSource();
const studios = new Studios();
const player = new Player(screen, studios);
const timeline = new Timeline(element('timeline'), { seek: index => player.seek(index), step: delta => player.step(delta), toggle: () => player.toggle() });
const strip = new Strip(element('strip'), index => { player.pause(); player.seek(index); });

// == State =======================================================================
/** the film on screen, and the mistake of the last scene run, when it has one */
let film: Film | undefined;
let error: SceneError | undefined;
/** the scene's code last taken, and how many scenes have been asked to run (a newer
 *  run wins) */
let lastCode = '';
let run = 0;
/** the editors found, and whether one holds the scene */
let editors = 0, hasCode = false;
/** the export running, while one is */
let exporting: { cancelled: boolean; } | undefined;

// == Scene =======================================================================
/** runs a scene's code into a film and stages it; a mistake keeps the last film */
const takeScene = async (code: string) => {
  const asked = ++run;
  const result = await runScene(code);
  if(asked !== run) return/*a newer scene runs*/;
  if(!result.ok) { showError(result.error); return; }
  try {
    const first = filmOf(result.scene);
    const staged = await studios.stage(first.scene);
    if(asked !== run) return;
    const wheeled = (staged.kind === 'staged') ? staged.wheeled : new Set<string>();
    showFilm((wheeled.size > 0) ? filmOf(result.scene, wheeled) : first);
    showError(undefined);
  } catch(failure) {
    showError({ message: (failure as Error).message, line: (failure as { sceneLine?: number; }).sceneLine });
  }
};

const showFilm = (next: Film) => {
  const sameShots = !!film && (JSON.stringify(film.frames.map(frame => [frame.actors, frame.camera, frame.views])) === JSON.stringify(next.frames.map(frame => [frame.actors, frame.camera, frame.views])));
  film = next;
  document.documentElement.style.setProperty('--aspect', `${next.scene.width} / ${next.scene.height}`);
  player.setFilm(next, sameShots);
  timeline.show(next);
  strip.show(next, index => player.taken(index));
  showSheet();
  showSlate();
};

const showError = (next: SceneError | undefined) => {
  error = next;
  problem.hidden = !next;
  problem.replaceChildren(...(next ? [
    Object.assign(document.createElement('b'), { textContent: (next.line !== undefined) ? `Line ${next.line}` : 'The scene' }),
    Object.assign(document.createElement('span'), { textContent: next.message }),
  ] : []));
  editorChip.dataset.state = next ? 'error' : hasCode ? 'ok' : (editors > 0) ? 'waiting' : 'none';
  showSlate();
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
    const what = (typeof actor.source.component === 'string') ? `the ${actor.source.component}` : `a ${[actor.source.color, actor.source.part].filter(Boolean).join(' ')}`;
    const notes = [what, actor.ride ? `rides the ${actor.ride.parent}` : undefined, ((stage.kind === 'staged') && stage.wheeled.has(actor.name)) ? 'its wheels roll' : undefined].filter(Boolean).join(' · ');
    item.append(Object.assign(document.createElement('b'), { textContent: actor.name }), Object.assign(document.createElement('span'), { textContent: refused.get(actor.name) ?? notes }));
    item.classList.toggle('is-refused', refused.has(actor.name));
    return item;
  }));
  logs.hidden = scene.logs.length < 1;
  logs.textContent = scene.logs.slice(-12).join('\n');
};

// == Slate =======================================================================
/** what the screen says when it shows no frame: why, and what to do */
const showSlate = () => {
  const stage = studios.stageState;
  const say = (title: string, text: string, action?: string) => {
    slate.hidden = false;
    slateTitle.textContent = title;
    slateText.textContent = text;
    slateAction.hidden = !action;
    slateAction.textContent = action ?? '';
  };
  if(studios.count < 1) return say('No studio', 'Stop Motion films what Brick Studio stages. Add Brick Studio to this document, above the film.');
  if(editors < 1) return say('No scene', `The scene is code in a code editor's ${SCENE_TAB} tab. Add a code editor to this document.`);
  if(!hasCode) return say('No scene', `Waiting for a ${SCENE_TAB} tab in the code editor.`);
  if(!film) return say(error ? 'The scene has a mistake' : 'Reading the scene', error ? `${(error.line !== undefined) ? `Line ${error.line}: ` : ''}${error.message}` : 'Running the scene…');
  if(stage.kind === 'left') return say('The studio went back to its build', 'Stage the film again to go on.', 'Stage again');
  if(stage.kind === 'failed') return say('The studio refused the film', stage.message, 'Try again');
  if((stage.kind === 'staging') && (player.taken(player.current.index) === undefined)) return say('Staging', 'Setting the scene in the studio…');
  slate.hidden = true;
};

slateAction.addEventListener('click', () => { if(film) { void studios.stage(film.scene).then(() => { showSlate(); player.redraw(); }); } });

// == Transport ===================================================================
const showPlayer = (state: PlayerState) => {
  timeline.setFrame(state.index);
  strip.setFrame(state.index);
  const fps = film?.scene.fps ?? 24;
  const seconds = Math.floor(state.index / fps), frames = state.index % fps;
  timecode.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  frameCount.textContent = film ? `frame ${state.index + 1} of ${film.frames.length}${(state.taken < film.frames.length) ? ` · ${state.taken} shot` : ' · all shot'}` : '';
  playButton.setAttribute('aria-pressed', String(state.playing));
  playButton.title = playButton.ariaLabel = state.playing ? 'Pause (Space)' : 'Play (Space)';
  loopButton.setAttribute('aria-pressed', String(state.loop));
  screen.classList.toggle('is-shooting', state.shooting);
};
player.state$.subscribe(showPlayer);
player.onTaken((index, frame) => strip.develop(index, frame));

element('firstButton').addEventListener('click', () => { player.pause(); player.seek(0); });
element('backButton').addEventListener('click', () => player.step(-1));
playButton.addEventListener('click', () => player.toggle());
element('nextButton').addEventListener('click', () => player.step(1));
element('lastButton').addEventListener('click', () => { player.pause(); player.seek(Number.MAX_SAFE_INTEGER); });
loopButton.addEventListener('click', () => player.setLoop(!player.current.loop));

developButton.addEventListener('click', async () => {
  if(!film || developButton.disabled) return;
  developButton.disabled = true;
  try { await player.develop((done, total) => { developButton.textContent = `Shooting ${done}/${total}`; }); }
  finally { developButton.disabled = false; developButton.textContent = 'Shoot all'; }
});

exportButton.addEventListener('click', async () => {
  if(exporting) { exporting.cancelled = true; return; }
  if(!film) return;
  const filming = film, request = { cancelled: false };
  exporting = request;
  player.pause();
  exportButton.classList.add('is-busy');
  try {
    const file = await exportFilm(filming, studios, (done, total) => { exportButton.textContent = `Exporting ${Math.round((done / total) * 100)}% · stop`; }, () => request.cancelled);
    if(file) save(file, fileName(filming.scene.title));
  } catch(failure) {
    console.error('stop-motion: the export failed:', failure);
    showError({ message: `The export failed: ${(failure as Error).message}` });
  } finally {
    exporting = undefined;
    exportButton.classList.remove('is-busy');
    exportButton.textContent = 'Export MP4';
    player.redraw();
  }
});

// == Screen size =================================================================
new ResizeObserver(() => {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  screen.width = Math.max(1, Math.round(screen.clientWidth * ratio));
  screen.height = Math.max(1, Math.round(screen.clientHeight * ratio));
  player.redraw();
}).observe(screen);

// == Studios =====================================================================
studios.state$.subscribe((stage: StageState) => {
  studioChip.dataset.state = stage.kind;
  studioChip.textContent = (studios.count > 1) ? `${studios.count} studios` : (studios.count === 1) ? 'Brick Studio' : 'No studio';
  showSlate();
  showSheet();
});
studios.studios$.subscribe(() => { if(film) void takeScene(lastCode); })/*new studios: stage again*/;

// == Init ========================================================================
source.text$.subscribe(({ editors: count, code }) => {
  editors = count;
  hasCode = code !== null;
  editorChip.dataset.state = error ? 'error' : hasCode ? 'ok' : (count > 0) ? 'waiting' : 'none';
  editorChip.textContent = (count > 0) ? SCENE_TAB : 'No editor';
  showSlate();
});
source.text$.pipe(map(({ code }) => code), distinctUntilChanged(), debounceTime(250)).subscribe(code => {
  if(code === null) return;
  lastCode = code;
  void takeScene(code);
});

source.init(charmiq);
studios.init(charmiq);
if(charmiq) {
  exportFilmCommands(charmiq, { film: () => film, error: () => error, studios: () => studios.count, editors: () => editors, stage: () => studios.stageState, player });
} /* else -- standalone: no Charm reaches the film */
showSheet();
showSlate();
