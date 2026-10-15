import type { CharmIQAPI } from '../../../shared/charmiq';
import { Build } from './build';
import { familyLabel } from './catalog';
import { isSound } from './check';
import { CommandSurface } from './command';
import { ContentBridge } from './content-bridge';
import { DesignDialog } from './design-dialog';
import { Designs } from './designs';
import { Drive } from './drive';
import { FidelityControl } from './fidelity-control';
import { getColor, getColorValue } from './grid';
import { GroundControl } from './ground-control';
import { LookAround } from './look-around';
import type { Model } from './model';
import { StepControl } from './step-control';
import { DEFAULT_VIEW, STANDING, Viewer, type Walk } from './viewer';

// entry point: creates the modules, wires them, loads the parts, then the build
// ********************************************************************************
const charmiq: CharmIQAPI = window.charmiq;

// == Elements ====================================================================
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('stage');
const status = element<HTMLParagraphElement>('status');
const statusText = element<HTMLSpanElement>('statusText');
const hint = element<HTMLParagraphElement>('hint');
const loading = element<HTMLDivElement>('loading');
const loadingText = element<HTMLSpanElement>('loadingText');
const retryButton = element<HTMLButtonElement>('retryButton');
const retrySep = element<HTMLSpanElement>('retrySep');

// == Theme =======================================================================
// the tags take their colors from the same palette as the bricks
for(const [name, key] of [['--brick-yellow', 'yellow'], ['--brick-azure', 'azure'], ['--brick-red', 'red']] as const) {
  const value = getColorValue(getColor(key)!.code);
  if(value) document.documentElement.style.setProperty(name, value);
}

const readTheme = () => {
  const style = getComputedStyle(document.documentElement);
  return { stage: style.getPropertyValue('--stage').trim(), baseplate: style.getPropertyValue('--baseplate').trim() };
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// == Instances ===================================================================
const viewer = new Viewer(canvas, readTheme(), name => charmiq.resources.text(name)/*a part family, read the first time a build shows it*/);
const bridge = new ContentBridge(charmiq.appContent);
const build = new Build(bridge);
const look = new FidelityControl(element('fidelity'), element('fidelityName'), element('fidelityState'), viewer);
const designs = new Designs(new Drive(charmiq.mcp), build, charmiq.appState);
const lookAround = new LookAround(element('sheet'), document.querySelector<HTMLElement>('.bar')!/*by contract*/, viewer);
const commands = new CommandSurface(build, designs, viewer, lookAround, look);
const ground = new GroundControl({ root: element('ground'), button: element('groundButton'), menu: element('groundMenu') }, build);
const steps = new StepControl({ root: element('steps'), first: element('stepFirst'), previous: element('stepPrevious'), play: element('stepPlay'), next: element('stepNext'), label: element('stepLabel') }, viewer, () => !reducedMotion.matches);
const designDialog = new DesignDialog(element('designs'), designs, {
  partCount: () => { const model = build.getModel(); return model.placements.length + model.others.length; },
  onLoaded: () => void viewer.frameWhole()/*a loaded design is framed whole*/,
  onAdded: () => void viewer.frameWhole()/*the build framed with the copy beside it*/,
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => viewer.setTheme(readTheme()));

// == Status ======================================================================
const showStatus = (model: Model) => {
  const result = build.check();
  const count = model.placements.length + model.others.length;
  const builds = build.builds().length;
  const unbuilt = viewer.unbuiltCount(model), undrawn = viewer.undrawnCount(model);
  const failed = viewer.familiesFailed().map(familyLabel), loading = viewer.familiesLoading().map(familyLabel);
  const notes = [
    (unbuilt > 0) ? `${unbuilt} not shown · ${(failed.length > 0) ? failed.join(', ') : 'parts'} failed to load` : undefined,
    (loading.length > 0) ? `loading ${loading.join(', ')}…` : undefined,
    (undrawn > 0) ? `${undrawn} too far or too large to draw` : undefined,
    viewer.reachesPastBaseplate() ? 'reaches past the baseplate' : undefined,
    (builds > 1) ? `${builds} builds in this document · edits paused` : undefined,
    build.isUncertain() ? 'could not check the document · reload to try again' : undefined,
    result.truncated ? 'read in part' : undefined,
    (result.collisions.length > 0) ? plural(result.collisions.length, 'collision') : undefined,
    (result.floating.length > 0) ? `${result.floating.length} floating` : undefined,
    (result.unchecked > 0) ? `${result.unchecked} off grid` : undefined,
  ].filter(Boolean);
  statusText.textContent = ((count < 1) && (notes.length < 1)) ? 'Empty' : [plural(count, 'part'), ...((notes.length > 0) ? notes : ['all held'])].join(' · ');
  status.classList.toggle('is-warning', !isSound(result) || build.isUncertain() || (builds > 1) || (unbuilt > 0) || (undrawn > 0));
  retryButton.hidden = retrySep.hidden = (unbuilt < 1);
  hint.hidden = (count > 0) || result.truncated;
};

const plural = (count: number, noun: string): string => `${count} ${noun}${(count === 1) ? '' : 's'}`;

// == Controls ====================================================================
retryButton.addEventListener('click', () => viewer.retryUnbuilt());
element('fitButton').addEventListener('click', () => void viewer.setView(viewer.getView(), true));
element('frontButton').addEventListener('click', () => void viewer.setView({ azimuth: 0, elevation: 12 }, true));
element('topButton').addEventListener('click', () => void viewer.setView({ azimuth: 0, elevation: 89 }, true));
element('resetButton').addEventListener('click', () => void viewer.setView(DEFAULT_VIEW, true));

// .. Designs .....................................................................
// save the build as a design in the Drive, or open one in its place
const standStill = () => { held.clear(); viewer.walk(STANDING); };
element('saveButton').addEventListener('click', () => { standStill(); designDialog.openSave(); });
element('openButton').addEventListener('click', () => { standStill(); designDialog.openOpen(); });

// .. Full screen .................................................................
// the whole studio goes full screen, its controls with it; Esc (the browser's own)
// or the button leaves. The button shows only where the page may go full screen
// (an embedding frame allows it; some phones never do)
const studio = document.querySelector<HTMLDivElement>('.studio')!/*by contract*/;
const fullscreenButton = element<HTMLButtonElement>('fullscreenButton');
fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener('click', () => {
  if(document.fullscreenElement) void document.exitFullscreen();
  else studio.requestFullscreen().catch(error => console.error('brick-studio: full screen failed:', error));
});
document.addEventListener('fullscreenchange', () => {
  const full = (document.fullscreenElement === studio);
  fullscreenButton.setAttribute('aria-pressed', String(full));
  fullscreenButton.title = full ? 'Leave full screen' : 'Full screen';
});

// .. Help ........................................................................
// the controls over the whole studio: the button or I opens them, a click anywhere
// or Esc closes them
const help = element<HTMLDialogElement>('help');
const toggleHelp = () => {
  if(help.open) { help.close(); return; }
  standStill()/*the studio stands still under the help*/;
  help.showModal();
};
element('helpButton').addEventListener('click', toggleHelp);
help.addEventListener('click', () => help.close());

// .. Walking .....................................................................
// keys by position on the keyboard (any layout): W S forward and back, A D left
// and right, Q E turn, Space C up and down, Shift faster
const WALK_KEYS: Readonly<Record<string, readonly [keyof Omit<Walk, 'fast'>, number]>> = {
  KeyW: ['forward', 1], KeyS: ['forward', -1],
  KeyD: ['right', 1],   KeyA: ['right', -1],
  Space: ['up', 1],     KeyC: ['up', -1],
  KeyQ: ['turn', 1],    KeyE: ['turn', -1],
};
const held = new Set<string>();
const walkFromKeys = (fast: boolean): Walk => {
  const walk = { ...STANDING, fast };
  for(const code of held) { const [axis, sign] = WALK_KEYS[code]; walk[axis] += sign; }
  return walk;
};

/** whether a key goes to what has focus instead (text being typed, a shortcut) */
const isForOthers = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey ||
  ((event.target instanceof HTMLElement) && (event.target.isContentEditable || (event.target instanceof HTMLTextAreaElement) ||
    ((event.target instanceof HTMLInputElement) && (event.target.type !== 'range'))));

const onWalkKey = (event: KeyboardEvent, down: boolean) => {
  if(designDialog.isOpen) return/*the dialog has the keys*/;
  if(down && lookAround.isOpen && !isForOthers(event)) { lookAround.hide(); return; }
  if(down && (event.code === 'KeyI') && !isForOthers(event)) { toggleHelp(); return; }
  if(!(event.code in WALK_KEYS)) { if(event.key === 'Shift') viewer.walk(walkFromKeys(down)); return; }
  if(down && (isForOthers(event) || help.open)) return;
  event.preventDefault()/*Space neither scrolls nor presses the focused button*/;
  if(down) held.add(event.code);
  else held.delete(event.code);
  viewer.walk(walkFromKeys(event.shiftKey));
};
window.addEventListener('keydown', event => onWalkKey(event, true));
window.addEventListener('keyup', event => onWalkKey(event, false));
window.addEventListener('blur', () => { held.clear(); viewer.walk(STANDING); })/*a key released elsewhere never sticks*/;

// == Init ========================================================================
const start = async () => {
  try {
    await viewer.load();
  } catch(error) {
    console.error('failed to load the parts:', error);
    loading.classList.add('is-error');
    loadingText.textContent = 'The parts failed to load';
    return;
  }

  await look.init();
  void designs.init()/*every save, list and load waits for it*/;
  build.onChange((model, source) => {
    lookAround.hide()/*a picture of the build as it stood*/;
    steps.show(model, (source !== 'load') && !reducedMotion.matches)/*the build whole: any playback ends*/;
    ground.show(model);
    if(source === 'load') viewer.jumpToView(DEFAULT_VIEW);
    else viewer.keepInView();
    showStatus(model);
  });
  build.onUncertain(() => showStatus(build.getModel()));
  viewer.onParts(() => showStatus(build.getModel()));
  commands.init()/*each command waits for the build*/;
  try {
    await build.init();
  } catch(error) {
    console.error('brick-studio: the build could not be read:', error);
    loading.classList.add('is-error');
    loadingText.textContent = (((error as { code?: unknown; } | null)?.code === 'functions/permission-denied')
      ? 'This Application isn\'t allowed to read the build.'
      : 'The build could not be read.') + ' Reload to try again.';
    return;
  }

  await viewer.whenSettled();
  loading.classList.add('is-done');
};
start();
