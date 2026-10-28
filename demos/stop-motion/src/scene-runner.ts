import { readRecorded, recordCode, type FigurePart, type Recorded, type RecordedCode, type SceneError } from './recorder';
import { WALK } from './steps';

// runs a scene's code in a Worker of its own: the code reaches no document, no
// bridge and no Application, only the recorder's API, and answers with plain data
// (SEE: recorder.ts). A run that does not answer in time is stopped and named, so a
// scene that loops forever never hangs the film
// ********************************************************************************
// == Constants ===================================================================
const RUN_MILLIS = 4_000/*ms*/;

/** the Worker's source: the recorder as its own text, answering each scene posted
 *  with the studio's sounds, the built-in gait and the figures built into the set */
export const WORKER_SOURCE = `const record = ${recordCode.toString()};
self.onmessage = (event) => {
  try { self.postMessage({ ok: true, scene: record(event.data.code, event.data.sounds, event.data.gait, event.data.parts) }); }
  catch(error) { self.postMessage({ ok: false, error: { message: String((error && error.message) || error), line: error && error.sceneLine } }); }
};`;

// == Types =======================================================================
export type SceneRun = Readonly<{ ok: true; scene: Recorded; } | { ok: false; error: SceneError; }>;

// == Runner ======================================================================
/** the Worker's answer as a run: its recording read as a film reads it (SEE:
 *  recorder.ts readRecorded), or why it makes none */
export const runOf = (answer: unknown): SceneRun => {
  const run = answer as Readonly<{ ok: true; scene: RecordedCode; } | { ok: false; error: SceneError; }>;
  if(!run.ok) return run;
  try { return { ok: true, scene: readRecorded(run.scene) }; }
  catch(error) { return { ok: false, error: { message: (error as Error).message, line: (error as { sceneLine?: number; }).sceneLine } }; }
};

/** the scene a code makes, its sounds named from the studio's `sounds` and its
 *  audiences lifted from the set's figure `parts` (none while no studio lists them), or
 *  why it makes none */
export const runScene = (code: string, sounds: ReadonlyArray<string>, parts?: ReadonlyArray<FigurePart>): Promise<SceneRun> => new Promise(resolve => {
  let worker: Worker;
  try { worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))); }
  catch(error) { resolve({ ok: false, error: { message: `The scene could not start: ${(error as Error).message}` } }); return; }

  const timeout = setTimeout(() => { worker.terminate(); resolve({ ok: false, error: { message: `The scene ran past ${RUN_MILLIS / 1000} seconds: a loop that never ends?` } }); }, RUN_MILLIS);
  worker.onmessage = event => { clearTimeout(timeout); worker.terminate(); resolve(runOf(event.data)); };
  worker.onerror = event => { clearTimeout(timeout); worker.terminate(); resolve({ ok: false, error: { message: event.message || 'The scene could not run' } }); event.preventDefault(); };
  worker.postMessage({ code, sounds, gait: WALK, ...(parts ? { parts } : {}) });
});
