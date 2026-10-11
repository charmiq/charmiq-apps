import type { CharmIQAPI } from '../../../shared/charmiq';
import { Build } from './build';
import { isSound } from './check';
import { CommandSurface } from './command';
import { ContentBridge } from './content-bridge';
import { FidelityControl } from './fidelity-control';
import { getColor, getColorValue } from './grid';
import type { Model } from './model';
import { DEFAULT_VIEW, Viewer } from './viewer';

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
const viewer = new Viewer(canvas, readTheme());
const bridge = new ContentBridge(charmiq.appContent);
const build = new Build(bridge);
const look = new FidelityControl(element('fidelity'), element('fidelityName'), viewer);
const commands = new CommandSurface(build, viewer, look);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => viewer.setTheme(readTheme()));

// == Status ======================================================================
const showStatus = (model: Model) => {
  const result = build.check();
  const count = model.placements.length + model.others.length;
  const notes = [
    (result.collisions.length > 0) ? plural(result.collisions.length, 'collision') : undefined,
    (result.floating.length > 0) ? `${result.floating.length} floating` : undefined,
    (result.unchecked > 0) ? `${result.unchecked} off grid` : undefined,
  ].filter(Boolean);
  statusText.textContent = (count < 1) ? 'Empty' : [plural(count, 'part'), ...((notes.length > 0) ? notes : ['all held'])].join(' · ');
  status.classList.toggle('is-warning', !isSound(result));
  hint.hidden = (count > 0);
};

const plural = (count: number, noun: string): string => `${count} ${noun}${(count === 1) ? '' : 's'}`;

// == Controls ====================================================================
element('fitButton').addEventListener('click', () => void viewer.setView(viewer.getView(), true));
element('frontButton').addEventListener('click', () => void viewer.setView({ azimuth: 0, elevation: 12 }, true));
element('topButton').addEventListener('click', () => void viewer.setView({ azimuth: 0, elevation: 89 }, true));
element('resetButton').addEventListener('click', () => void viewer.setView(DEFAULT_VIEW, true));

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
  build.onChange((model, source) => {
    viewer.setModel(model, (source !== 'load') && !reducedMotion.matches);
    if(source === 'load') viewer.jumpToView(DEFAULT_VIEW);
    else viewer.keepInView();
    showStatus(model);
  });
  commands.init();
  await build.init();

  await viewer.whenSettled();
  loading.classList.add('is-done');
};
start();
