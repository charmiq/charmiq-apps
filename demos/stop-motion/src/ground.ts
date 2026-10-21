import type { Film } from './film';
import type { Size } from './measure';

// the ground actors follow (SEE: recorder.ts ground): each frame's footprint of every
// actor that follows the ground, read where the film made without the ground puts it
// (the ground moves it up and down alone), the surfaces under each asked of the studio
// (SEE: Brick Studio's probeStage grounds) set by set a batch at a time, and the ground
// followed frame by frame: on the highest surface no more than its step above where it
// stood, so it steps up a curb and down off one; before a surface past its step its
// height holds, as at a wall (its keys still move it on: the ground sets heights
// alone). Where it is first shown, and shown again after it was
// hidden (it never walked there), it starts as on the baseplate: the highest surface
// within its step of 0, else the lowest under it
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
    const footprint = { x: rounded(shot.position.x), z: rounded(shot.position.z), width: size.width, depth: size.depth, yaw: rounded(shot.turn.yaw) };
    const key = `${frame.set ?? ''}|${footprint.x}|${footprint.z}|${footprint.width}|${footprint.depth}|${footprint.yaw}`;
    asked.set(key, { set: frame.set, footprint });
    return key;
  }));
  const surfaces = await probeAll(probe, asked);

  // followed frame by frame
  return new Map(following.map((actor, index) => {
    const step = actor.ground!.step;
    let level = 0, fresh = true;
    const levels = keys[index].map(key => {
      const under = (key === undefined) ? undefined : surfaces.get(key);
      if(!under || (under.length < 1)) { fresh = true; return level; }
      const within = under.filter(surface => surface <= ((fresh ? 0 : level) + step));
      level = (within.length > 0) ? Math.max(...within) : fresh ? under[0]/*shown where nothing is within its step: the lowest under it*/ : level/*a wall: where it stood*/;
      fresh = false;
      return level;
    });
    return [actor.name, levels] as const;
  }));
};

// == Internal ====================================================================
/** asks the probe for every footprint, set by set, in batches within its bounds */
const probeAll = async (probe: GroundProbe, asked: ReadonlyMap<string, Readonly<{ set: string | undefined; footprint: Footprint; }>>): Promise<ReadonlyMap<string, ReadonlyArray<number>>> => {
  const bySet = new Map<string | undefined, Array<readonly [string, Footprint]>>();
  for(const [key, { set, footprint }] of asked) {
    const listed = bySet.get(set) ?? [];
    listed.push([key, footprint]);
    bySet.set(set, listed);
  }
  const found = new Map<string, ReadonlyArray<number>>();
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
