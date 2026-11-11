// a held part settled onto the reference picture: one part, one joint, tried a little
// either way of where the person put it, and the angle kept whose outline lies best on
// the picture's edges. The picture's edges are where its brightness changes most, and
// every pixel knows how far it lies from the nearest; a part's outline is the hull of
// the points the picture shows of it, walked a step at a time. Never a whole figure
// fitted at once: a figure's front and back, and a limb through the set, read alike to
// an outline, so the person places the part and this only seats it
// ********************************************************************************
// == Constants ===================================================================
/** how far from an edge a pixel is told apart (pixels): past it every pixel is as far */
export const EDGE_REACH = 12;
/** the share of a picture's pixels, by how sharply its brightness changes there, that
 *  are its edges */
const EDGE_SHARE = 0.1;
/** how much better than where the part stands an angle must lie to be offered */
const BETTER = 0.05;

// == Types =======================================================================
/** a point of a picture (pixels across and down) */
export type Spot = readonly [number, number];
/** a picture's edges: how far each of its pixels lies from the nearest (pixels, at
 *  most EDGE_REACH) */
export type Edges = Readonly<{ width: number; height: number; distance: Float32Array; }>;
/** an angle tried and how its outline lies (less is better) */
export type Tried = Readonly<{ value: number; score: number; }>;

// == Edges =======================================================================
/** the edges of a picture's pixels (RGBA, row by row): the EDGE_SHARE of them whose
 *  brightness changes most across its neighbors, and each pixel's distance to the
 *  nearest, two sweeps over the picture */
export const edgesOf = (rgba: Uint8ClampedArray, width: number, height: number): Edges => {
  const light = new Float32Array(width * height);
  for(let at=0; at<light.length; at++) light[at] = (0.299 * rgba[at * 4]) + (0.587 * rgba[(at * 4) + 1]) + (0.114 * rgba[(at * 4) + 2]);
  const change = new Float32Array(width * height);
  for(let y=1; y<height - 1; y++) for(let x=1; x<width - 1; x++) {
    const at = (y * width) + x;
    const across = (light[at - width + 1] + (2 * light[at + 1]) + light[at + width + 1]) - (light[at - width - 1] + (2 * light[at - 1]) + light[at + width - 1]);
    const down = (light[at + width - 1] + (2 * light[at + width]) + light[at + width + 1]) - (light[at - width - 1] + (2 * light[at - width]) + light[at - width + 1]);
    change[at] = Math.hypot(across, down);
  }
  const sorted = Float32Array.from(change).sort(), least = Math.max(1, sorted[Math.floor(sorted.length * (1 - EDGE_SHARE))]);
  const distance = new Float32Array(width * height).fill(EDGE_REACH);
  for(let at=0; at<change.length; at++) if(change[at] >= least) distance[at] = 0;
  // each pixel the least of its neighbors already swept, a step or a diagonal on
  const sweep = (from: number, to: number, step: number) => {
    for(let y=from; y!==to; y+=step) for(let x=(step > 0) ? 0 : width - 1; (x >= 0) && (x < width); x+=step) {
      const at = (y * width) + x;
      let least_ = distance[at];
      if((x - step >= 0) && (x - step < width)) least_ = Math.min(least_, distance[at - step] + 1);
      if((y - step >= 0) && (y - step < height)) {
        least_ = Math.min(least_, distance[at - (step * width)] + 1);
        if((x - step >= 0) && (x - step < width)) least_ = Math.min(least_, distance[at - (step * width) - step] + Math.SQRT2);
        if((x + step >= 0) && (x + step < width)) least_ = Math.min(least_, distance[at - (step * width) + step] + Math.SQRT2);
      } /* else -- the first row swept */
      distance[at] = Math.min(EDGE_REACH, least_);
    }
  };
  sweep(0, height, 1);
  sweep(height - 1, -1, -1);
  return { width, height, distance };
};

// == Outline =====================================================================
/** the hull round some points: its corners in order */
export const hullOf = (spots: ReadonlyArray<Spot>): ReadonlyArray<Spot> => {
  const sorted = [...spots].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if(sorted.length < 3) return sorted;
  const turns = (o: Spot, a: Spot, b: Spot) => ((a[0] - o[0]) * (b[1] - o[1])) - ((a[1] - o[1]) * (b[0] - o[0]));
  const half = (points: ReadonlyArray<Spot>) => {
    const run: Spot[] = [];
    for(const point of points) { while((run.length >= 2) && (turns(run[run.length - 2], run[run.length - 1], point) <= 0)) run.pop(); run.push(point); }
    return run.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
};

/** the points along a hull, round it and back to its start, `step` apart */
export const alongOf = (hull: ReadonlyArray<Spot>, step: number): ReadonlyArray<Spot> => hull.flatMap((from, index) => {
  const to = hull[(index + 1) % hull.length], length = Math.hypot(to[0] - from[0], to[1] - from[1]), steps = Math.max(1, Math.round(length / step));
  return Array.from({ length: steps }, (_, at): Spot => [from[0] + (((to[0] - from[0]) * at) / steps), from[1] + (((to[1] - from[1]) * at) / steps)]);
});

// == Score =======================================================================
/** how an outline lies on a picture's edges: the mean distance of its points from the
 *  nearest edge, a point off the picture at EDGE_REACH; no points lie nowhere */
export const liesOn = (edges: Edges, spots: ReadonlyArray<Spot>): number => {
  if(spots.length < 1) return Infinity;
  let total = 0;
  for(const [x, y] of spots) {
    const [across, down] = [Math.round(x), Math.round(y)];
    total += ((across < 0) || (down < 0) || (across >= edges.width) || (down >= edges.height)) ? EDGE_REACH : edges.distance[(down * edges.width) + across];
  }
  return total / spots.length;
};

/** the angle tried that lies best, when it lies better than where the part stands
 *  (`stands`, one of those tried) by more than BETTER of that; none otherwise */
export const bestOf = (tried: ReadonlyArray<Tried>, stands: number): Tried | undefined => {
  const standing = tried.find(each => each.value === stands);
  const best = tried.reduce<Tried | undefined>((least, each) => (!least || (each.score < least.score)) ? each : least, undefined);
  if(!best || !standing || (best.value === stands) || !(best.score < (standing.score * (1 - BETTER)))) return undefined;
  return best;
};
