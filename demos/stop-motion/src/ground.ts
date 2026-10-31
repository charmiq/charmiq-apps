import type { Film } from './film';
import { footprintMiddle, type Size } from './measure';
import { type Surface, type SurfaceAt, BASEPLATE } from './steps';

// the ground actors follow (SEE: recorder.ts ground): each frame's footprint of every
// actor that follows the ground, read where the film made without the ground puts it
// (the ground moves it up and down alone), the surfaces under each asked of the studio
// (SEE: Brick Studio's probeStage grounds) set by set a batch at a time, and the ground
// followed frame by frame: on the highest surface no more than its step above where it
// stood, so it steps up a curb and down off one; before a surface past its step its
// height holds, as at a wall (its keys still move it on: the ground sets heights
// alone). Where it is first shown, and shown again after it was
// hidden (it never walked there), it starts as on the baseplate: the highest surface
// within its step of 0, else the lowest under it; one naming a level to start at (a
// gallery's, as its builder laid it) starts on the surface under it nearest that level,
// the higher of two as near. The surfaces an actor that clicks onto
// studs stands on are asked the same way, cell by cell around where its keys put it
// each frame (its steps, turns and hops stray no further), each surface studded or not
// and named by the part whose top it is; the surfaces over an area, and the extent of a
// set's parts, are asked the same way for a map of the set
// ********************************************************************************
// == Constants ===================================================================
/** the most footprints one probe answers (Brick Studio's MAX_PROBES), and the most
 *  columns they reach together (its MAX_GROUND_COLUMNS) */
const PROBE_BATCH = 20_000;
const COLUMN_BATCH = 200_000;
/** a footprint's place and turn to the hundredth, so a standing actor asks once */
const HUNDREDTHS = 100;

// == Types =======================================================================
/** a footprint the ground is asked under (SEE: Brick Studio's ProbeGround) */
export type Footprint = Readonly<{ x: number; z: number; width: number; depth: number; yaw: number; }>;
/** asks the studio the surfaces under footprints of a set (the first staged when none
 *  is named), each lowest first (plates) */
export type GroundProbe = (set: string | undefined, grounds: ReadonlyArray<Footprint>) => Promise<ReadonlyArray<ReadonlyArray<number>>>;
/** the same, each surface studded or not and its part (SEE: Brick Studio's probe
 *  studded, tops) */
export type SurfaceProbe = (set: string | undefined, grounds: ReadonlyArray<Footprint>) => Promise<ReadonlyArray<ReadonlyArray<Surface>>>;
/** asks the studio the area a set's parts stand over (SEE: Brick Studio's probe
 *  extent): none for a set without parts */
export type ExtentProbe = (set: string | undefined) => Promise<CellArea | undefined>;
/** the grounds a studio's probe answers: the surfaces under each footprint, and beside
 *  them whether each is studded and the part whose top it is */
export type ProbedGrounds = Readonly<{ grounds?: ReadonlyArray<ReadonlyArray<number>>; studded?: ReadonlyArray<ReadonlyArray<boolean>>; tops?: ReadonlyArray<ReadonlyArray<string | null>>; }>;

// == Ground ======================================================================
/** the ground under each actor that follows it, at every frame (plates), by name: none
 *  for an actor the stage did not size */
export const groundsOf = async (film: Film, sizes: Readonly<Record<string, Size>>, probe: GroundProbe): Promise<ReadonlyMap<string, ReadonlyArray<number>>> => {
  const following = film.scene.actors.filter(actor => actor.ground && Object.hasOwn(sizes, actor.name));
  if(following.length < 1) return new Map();

  // each footprint once, set by set
  const asked = new Map<string, Readonly<{ set: string | undefined; footprint: Footprint; }>>();
  const keys = following.map(actor => film.frames.map(frame => {
    const shot = frame.actors.find(each => each.name === actor.name);
    if(!shot) return undefined/*hidden: no ground to stand on*/;
    const size = sizes[actor.name];
    const middle = footprintMiddle({ position: shot.position, yaw: shot.turn.yaw, size });
    const footprint = { x: rounded(middle.x), z: rounded(middle.z), width: size.width, depth: size.depth, yaw: rounded(shot.turn.yaw) };
    const key = `${frame.set ?? ''}|${footprint.x}|${footprint.z}|${footprint.width}|${footprint.depth}|${footprint.yaw}`;
    asked.set(key, { set: frame.set, footprint });
    return key;
  }));
  const surfaces = await probeAll(probe, asked);

  // followed frame by frame
  return new Map(following.map((actor, index) => {
    const { step, start } = actor.ground!;
    let level = 0, fresh = true;
    const levels = keys[index].map(key => {
      const under = (key === undefined) ? undefined : surfaces.get(key);
      if(!under || (under.length < 1)) { fresh = true; return level; }
      const within = under.filter(surface => surface <= ((fresh ? 0 : level) + step));
      if(fresh && (start !== undefined)) level = nearest(under, start);
      else level = (within.length > 0) ? Math.max(...within) : fresh ? under[0]/*shown where nothing is within its step: the lowest under it*/ : level/*a wall: where it stood*/;
      fresh = false;
      return level;
    });
    return [actor.name, levels] as const;
  }));
};

/** of the surfaces under an actor (lowest first), the nearest a level, the higher of
 *  two as near */
const nearest = (under: ReadonlyArray<number>, level: number): number =>
  under.reduce((best, surface) => (Math.abs(surface - level) <= Math.abs(best - level)) ? surface : best);

// == Surfaces ====================================================================
/** the surfaces in each cell of each set an actor that clicks onto studs (`clicks`)
 *  stands near in a film: each cell around where it stands each frame asked once; a
 *  cell not asked, the baseplate */
export const surfacesOf = async (film: Film, clicks: ReadonlySet<string>, probe: SurfaceProbe): Promise<(set: string | undefined) => SurfaceAt> => {
  const asked = new Map<string, Readonly<{ set: string | undefined; footprint: Footprint; }>>();
  for(const frame of film.frames) for(const actor of frame.actors) {
    if(!clicks.has(actor.name)) continue;
    const [cx, cz] = [Math.floor(actor.position.x), Math.floor(actor.position.z)];
    for(let x=cx-NEAR; x<=cx+NEAR; x++) for(let z=cz-NEAR; z<=cz+NEAR; z++) asked.set(cellKey(frame.set, x, z), { set: frame.set, footprint: { x: x + 0.5, z: z + 0.5, width: 1, depth: 1, yaw: 0 } });
  }
  const found = (asked.size > 0) ? await probeAll(probe, asked) : new Map<string, ReadonlyArray<Surface>>();
  return set => (x, z) => found.get(cellKey(set, x, z)) ?? BASEPLATE(x, z);
};

/** an area of a set (whole studs): its south-west corner and size */
export type CellArea = Readonly<{ x: number; z: number; width: number; depth: number; }>;
/** the most cells a read of an area asks */
export const MAX_AREA_CELLS = 64 * 64;
/** the surfaces over every cell of an area of a set, each lowest first: a row a z from
 *  its south, each row's cells from its west. A read of where things are (a track, a
 *  mat, a bar's top), not only of where actors stand */
export const surfacesIn = async (probe: SurfaceProbe, set: string | undefined, area: CellArea): Promise<ReadonlyArray<ReadonlyArray<ReadonlyArray<Surface>>>> => {
  const asked = new Map<string, Readonly<{ set: string | undefined; footprint: Footprint; }>>();
  for(let z=area.z; z<(area.z + area.depth); z++) for(let x=area.x; x<(area.x + area.width); x++) asked.set(cellKey(set, x, z), { set, footprint: { x: x + 0.5, z: z + 0.5, width: 1, depth: 1, yaw: 0 } });
  const found = await probeAll(probe, asked);
  return Array.from({ length: area.depth }, (_, row) => Array.from({ length: area.width }, (_, column) => found.get(cellKey(set, area.x + column, area.z + row)) ?? []));
};

/** the surfaces a probe answers under each footprint: smooth where it says nothing of
 *  studs, its part where it names one (the baseplate's, and a studio naming none,
 *  none) */
export const surfacesProbed = (probed: ProbedGrounds): ReadonlyArray<ReadonlyArray<Surface>> =>
  (probed.grounds ?? []).map((surfaces, index) => surfaces.map((height, at) => {
    const part = probed.tops?.[index]?.[at];
    return { height, studded: probed.studded?.[index]?.[at] ?? false, ...(((part !== undefined) && (part !== null)) ? { part } : {}) };
  }));

/** how many cells either way around where an actor stands its surfaces are asked */
const NEAR = 1;
const cellKey = (set: string | undefined, x: number, z: number): string => `${set ?? ''}|${x}|${z}`;

// == Internal ====================================================================
/** asks the probe for every footprint, set by set, in batches within its bounds */
const probeAll = async <T>(probe: (set: string | undefined, grounds: ReadonlyArray<Footprint>) => Promise<ReadonlyArray<ReadonlyArray<T>>>, asked: ReadonlyMap<string, Readonly<{ set: string | undefined; footprint: Footprint; }>>): Promise<ReadonlyMap<string, ReadonlyArray<T>>> => {
  const bySet = new Map<string | undefined, Array<readonly [string, Footprint]>>();
  for(const [key, { set, footprint }] of asked) {
    const listed = bySet.get(set) ?? [];
    listed.push([key, footprint]);
    bySet.set(set, listed);
  }
  const found = new Map<string, ReadonlyArray<T>>();
  for(const [set, all] of bySet) {
    let batch: Array<readonly [string, Footprint]> = [], columns = 0;
    const send = async () => {
      if(batch.length < 1) return;
      const answer = await probe(set, batch.map(([, footprint]) => footprint));
      batch.forEach(([key], index) => found.set(key, answer[index] ?? []));
      [batch, columns] = [[], 0];
    };
    for(const each of all) {
      const reach = columnsReached(each[1]);
      if(((batch.length + 1) > PROBE_BATCH) || ((columns + reach) > COLUMN_BATCH)) await send();
      batch.push(each);
      columns += reach;
    }
    await send();
  }
  return found;
};

/** how many columns a footprint's bounds reach, as the studio counts them (SEE: Brick
 *  Studio's columnsReached) */
const columnsReached = ({ x, z, width, depth, yaw }: Footprint): number => {
  const angle = yaw * (Math.PI / 180);
  const [halfX, halfZ] = [((width * Math.abs(Math.cos(angle))) + (depth * Math.abs(Math.sin(angle)))) / 2, ((width * Math.abs(Math.sin(angle))) + (depth * Math.abs(Math.cos(angle)))) / 2];
  return (Math.ceil(x + halfX) - Math.floor(x - halfX)) * (Math.ceil(z + halfZ) - Math.floor(z - halfZ));
};

const rounded = (value: number): number => (Math.round(value * HUNDREDTHS) / HUNDREDTHS) || 0/*never -0*/;
