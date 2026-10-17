import type { Area, PlanPicture, Point } from '../stage';

// a plan: the scene seen straight down, north up, an area filling the picture whole
// (the rest of the picture beyond it, never less). The camera stands high over the
// area's middle through a narrow lens, so the ground maps to the picture as a map
// does; over it lie the film's paths, each actor's name where it stands and the
// film's camera as a wedge out to where it looks, all drawn on the ground
// ********************************************************************************
// == Constants ===================================================================
/** the plan's lens: narrow, so heights barely lean */
export const PLAN_FOV = 10/*degrees*/;
const PLATES_PER_STUD = 2.5;
/** the light under every mark, so it reads on any ground */
const HALO = 'rgba(255, 253, 242, 0.85)';
/** the ink of names and the film's camera */
const INK = '#1D1C19';
const CAMERA_FILL = 'rgba(255, 253, 242, 0.35)';
const LABEL_FONT = '\'JetBrains Mono\', ui-monospace, Menlo, monospace';

// == Plan ========================================================================
/** where the camera stands over an area for a picture `aspect` wide for each unit
 *  high: over the area's middle, high enough that the area fills the picture */
export const planAim = (area: Area, aspect: number): Readonly<{ position: Point; target: Point; fov: number; }> => {
  const [x, z] = [area.x + (area.width / 2), area.z + (area.depth / 2)];
  const halfHigh = Math.max(area.depth / 2, area.width / (2 * aspect))/*studs*/;
  const distance = halfHigh / Math.tan((PLAN_FOV / 2) * (Math.PI / 180));
  return { position: { x, z, height: distance * PLATES_PER_STUD }, target: { x, z, height: 0 }, fov: PLAN_FOV };
};

/** a point on the ground where a plan draws it in a picture `width` by `height` */
const placeOf = (area: Area, width: number, height: number) => {
  const scale = Math.min(width / area.width, height / area.depth)/*pixels a stud*/;
  const [x, z] = [area.x + (area.width / 2), area.z + (area.depth / 2)];
  return (point: Readonly<{ x: number; z: number; }>): [number, number] => [(width / 2) + ((point.x - x) * scale), (height / 2) - ((point.z - z) * scale)];
};

/** draws a plan's marks over a picture `width` by `height` at the context's origin */
export const drawPlan = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, plan: PlanPicture, width: number, height: number): void => {
  const place = placeOf(plan.area, width, height);
  const line = Math.max(2, Math.round(Math.min(width, height) / 200));
  context.save();
  context.lineCap = context.lineJoin = 'round';

  // each path, on a halo of light
  for(const path of plan.paths) {
    const points = path.points.map(place);
    for(const [color, thickness] of [[HALO, line + 2], [path.color, line]] as const) {
      context.strokeStyle = context.fillStyle = color;
      context.lineWidth = thickness;
      if(points.length < 2) { context.beginPath(); context.arc(points[0][0], points[0][1], thickness, 0, Math.PI * 2); context.fill(); continue; }
      context.beginPath();
      points.forEach(([x, y], index) => { if(index < 1) context.moveTo(x, y); else context.lineTo(x, y); });
      context.stroke();
    }
  }

  // the film's camera: a wedge as wide as its picture's field of view, out to where
  // it looks
  const { position, target, fov } = plan.camera;
  const [from, to] = [place(position), place(target)];
  const reach = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if(reach >= line) {
    const half = Math.atan(Math.tan((fov / 2) * (Math.PI / 180)) * plan.aspect);
    const facing = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const edge = (turn: number): [number, number] => [from[0] + (Math.cos(facing + turn) * reach / Math.cos(half)), from[1] + (Math.sin(facing + turn) * reach / Math.cos(half))];
    context.beginPath();
    context.moveTo(...from);
    context.lineTo(...edge(-half));
    context.lineTo(...edge(half));
    context.closePath();
    context.fillStyle = CAMERA_FILL;
    context.fill();
    context.strokeStyle = INK;
    context.lineWidth = Math.max(1, line / 2);
    context.stroke();
  } /* else -- straight overhead: its place alone */
  context.fillStyle = INK;
  context.beginPath();
  context.arc(from[0], from[1], line * 1.5, 0, Math.PI * 2);
  context.fill();

  // each actor's name where it stands, and the camera's, each beside its place on the
  // first side no name already drawn covers (a rider and what it rides stand together)
  const size = Math.max(10, Math.round(Math.min(width, height) / 32));
  context.font = `500 ${size}px ${LABEL_FONT}`;
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  context.lineWidth = 3;
  const taken: Box[] = [];
  for(const { text, at } of [...plan.labels.map(label => ({ text: label.text, at: place(label) })), { text: 'camera', at: from }]) {
    const across = context.measureText(text).width, gap = line * 2;
    const sides: ReadonlyArray<Box> = [
      [at[0] + gap, at[1] - gap - size, across, size], [at[0] + gap, at[1] + gap, across, size],
      [at[0] - gap - across, at[1] - gap - size, across, size], [at[0] - gap - across, at[1] + gap, across, size],
    ];
    const box = sides.find(side => !taken.some(other => overlaps(side, other))) ?? sides[0];
    taken.push(box);
    context.strokeStyle = HALO;
    context.strokeText(text, box[0], box[1] + size);
    context.fillStyle = INK;
    context.fillText(text, box[0], box[1] + size);
  }
  context.restore();
};

// == Util ========================================================================
/** a box on the picture: its left, top, width and height (pixels) */
type Box = readonly [number, number, number, number];
const overlaps = (a: Box, b: Box): boolean => (a[0] < (b[0] + b[2])) && (b[0] < (a[0] + a[2])) && (a[1] < (b[1] + b[3])) && (b[1] < (a[1] + a[3]));
