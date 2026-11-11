import { isPlatformFile, type DriveFile } from '../../brick-shared/drive';

// the Pose mode's reference as it is kept (SEE: pose-view.ts): which picture, and the
// frame it was chosen on, is the document's, one entry of its app state, so whoever
// opens the document poses against the same picture; a run of pictures that follows the
// film (the source film's frames, one a drawing) is another entry beside it; how the
// reference lies over the stage (its opacity, its view, whether it shows alone) is this
// browser's own. None is the scene's: a film plays the same with or without its reference
// ********************************************************************************
// == Constants ===================================================================
/** the app state key that keeps the reference picture */
export const REFERENCE_STATE = 'reference';
/** the app state key that keeps the run of reference pictures, and the most a run holds:
 *  past it the run stops (twenty seconds of a film drawn on ones at 24 frames a second) */
export const REFERENCES_STATE = 'references';
export const MOST_PICTURES = 480;
/** where this browser keeps how the reference lies over the stage */
export const REFERENCE_LOOK_KEY = 'stop-motion:reference';
/** what a picture is called until its name is known */
const UNNAMED = 'a picture';

// == Types =======================================================================
/** the reference picture: a Platform file, its name, and the film's frame (from 0) it
 *  was chosen on */
export type ReferencePicture = Readonly<{ uri: string; name: string; frame: number; }>;
/** how the reference lies over the stage: how strongly it shows (0 to 1), over the
 *  stage or as where the two differ, and whether it shows alone (SEE: Brick Studio's
 *  reference) */
export type ReferenceLook = Readonly<{ opacity: number; view: 'over' | 'difference'; flip: boolean; }>;

/** a run of reference pictures that follows the film: its pictures in order, the
 *  film's frame (from 0) its first shows at, and how many frames each stands for (a
 *  film drawn on twos against every drawing: 2) */
export type ReferenceRun = Readonly<{ pictures: ReadonlyArray<Readonly<{ uri: string; name: string; }>>; from: number; every: number; }>;
/** the reference at a frame: its file, what the mode says of it, and for a run's
 *  picture the frames each stands for */
export type ReferenceAt = Readonly<{ uri: string; label: string; every?: number; }>;

/** the look until the person changes it */
export const DEFAULT_LOOK: ReferenceLook = { opacity: 0.5, view: 'over', flip: false };

// == Kept ========================================================================
/** the picture an app state entry keeps: none unless it names a Platform file */
export const pictureFrom = (entry: unknown): ReferencePicture | undefined => {
  if((typeof entry !== 'object') || (entry === null)) return undefined/*no entry*/;
  const { uri, name, frame } = entry as Readonly<Record<string, unknown>>;
  if(!isPlatformFile(uri)) return undefined/*not a picture of the Drive's*/;
  return { uri, name: ((typeof name === 'string') && (name.length > 0)) ? name : UNNAMED, frame: (Number.isInteger(frame) && ((frame as number) >= 0)) ? frame as number : 0 };
};

/** the look this browser keeps as text: each value its default where the text does not
 *  hold it */
export const lookFrom = (kept: string | null): ReferenceLook => {
  let read: unknown;
  try { read = JSON.parse(kept ?? 'null'); } catch { read = null/*not kept as a look*/; }
  const { opacity, view, flip } = ((typeof read === 'object') && (read !== null)) ? read as Readonly<Record<string, unknown>> : {} as Readonly<Record<string, unknown>>;
  return {
    opacity: ((typeof opacity === 'number') && (opacity >= 0) && (opacity <= 1)) ? opacity : DEFAULT_LOOK.opacity,
    view: ((view === 'over') || (view === 'difference')) ? view : DEFAULT_LOOK.view,
    flip: (typeof flip === 'boolean') ? flip : DEFAULT_LOOK.flip,
  };
};

/** a look as this browser keeps it */
export const lookText = (look: ReferenceLook): string => JSON.stringify(look);

// == Run =========================================================================
/** a run of pictures to pose a shot against: the pictures of `files` (a folder's
 *  listing) sorted by name as numbers read (`Drawing 9` before `Drawing 10`), from the
 *  one picked on, at most MOST_PICTURES; its first at the frame it was picked on, a
 *  picture a frame until the person says how many frames each stands for. A listing
 *  without the picture picked makes a run of that picture alone */
export const runOf = (files: ReadonlyArray<DriveFile>, picked: DriveFile, frame: number): ReferenceRun => {
  const sorted = [...files].sort((one, other) => one.fileName.localeCompare(other.fileName, 'en', { numeric: true }));
  const first = sorted.findIndex(file => file.uri === picked.uri);
  const run = (first < 0) ? [picked] : sorted.slice(first, first + MOST_PICTURES);
  return { pictures: run.map(file => ({ uri: file.uri, name: file.fileName })), from: frame, every: 1 };
};

/** the run an app state entry keeps: none unless it holds a Platform file; a picture
 *  that is none is left out, and a start or a step that is no whole number takes its
 *  least */
export const runFrom = (entry: unknown): ReferenceRun | undefined => {
  if((typeof entry !== 'object') || (entry === null)) return undefined/*no entry*/;
  const { pictures, from, every } = entry as Readonly<Record<string, unknown>>;
  const kept = (Array.isArray(pictures) ? pictures : []).flatMap(each => { const picture = pictureFrom(each); return picture ? [{ uri: picture.uri, name: picture.name }] : []; }).slice(0, MOST_PICTURES);
  if(kept.length < 1) return undefined/*no picture of the Drive's*/;
  const whole = (value: unknown, least: number): number => (Number.isInteger(value) && ((value as number) >= least)) ? value as number : least;
  return { pictures: kept, from: whole(from, 0), every: whole(every, 1) };
};

/** the reference a frame is posed against: the run's picture the frame falls on (each
 *  held over the frames up to the next), else the single picture, else none; with what
 *  the mode says of it, and for a run's the frames each of its pictures stands for */
export const referenceAt = (run: ReferenceRun | undefined, single: ReferencePicture | undefined, frame: number): ReferenceAt | undefined => {
  const at = run ? Math.floor((frame - run.from) / run.every) : -1, picture = run?.pictures[at];
  if(run && picture && (frame >= run.from)) return { uri: picture.uri, label: `${picture.name} · picture ${at + 1} of ${run.pictures.length}`, every: run.every };
  return single && { uri: single.uri, label: `${single.name} · frame ${single.frame + 1}` };
};
