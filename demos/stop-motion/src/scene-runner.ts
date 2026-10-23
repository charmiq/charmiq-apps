import { record, type Recorded, type SceneError } from './recorder';
import { WALK } from './steps';

// runs a scene's code in a Worker of its own: the code reaches no document, no
// bridge and no Application, only the recorder's API, and answers with plain data
// (SEE: recorder.ts). A run that does not answer in time is stopped and named, so a
// scene that loops forever never hangs the film
// ********************************************************************************
// == Constants ===================================================================
const RUN_MILLIS = 4_000/*ms*/;

/** the Worker's source: the recorder as its own text, answering each scene posted
 *  with the studio's sounds and the built-in gait */
const WORKER_SOURCE = `const record = ${record.toString()};
self.onmessage = (event) => {
  try { self.postMessage({ ok: true, scene: record(event.data.code, event.data.sounds, event.data.gait) }); }
  catch(error) { self.postMessage({ ok: false, error: { message: String((error && error.message) || error), line: error && error.sceneLine } }); }
};`;

// == Types =======================================================================
export type SceneRun = Readonly<{ ok: true; scene: Recorded; } | { ok: false; error: SceneError; }>;

// == Runner ======================================================================
/** the scene a code makes, its sounds named from the studio's `sounds`, or why it
 *  makes none */
export const runScene = (code: string, sounds: ReadonlyArray<string>): Promise<SceneRun> => new Promise(resolve => {
  let worker: Worker;
  try { worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))); }
  catch(error) { resolve({ ok: false, error: { message: `The scene could not start: ${(error as Error).message}` } }); return; }

  const timeout = setTimeout(() => { worker.terminate(); resolve({ ok: false, error: { message: `The scene ran past ${RUN_MILLIS / 1000} seconds: a loop that never ends?` } }); }, RUN_MILLIS);
  worker.onmessage = event => { clearTimeout(timeout); worker.terminate(); resolve(event.data as SceneRun); };
  worker.onerror = event => { clearTimeout(timeout); worker.terminate(); resolve({ ok: false, error: { message: event.message || 'The scene could not run' } }); event.preventDefault(); };
  worker.postMessage({ code, sounds, gait: WALK });
});
