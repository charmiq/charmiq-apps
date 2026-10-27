// framing a build from one direction: the nearest camera, looking that way, whose
// picture holds every point given, those at the edge of the picture's binding reach
// at its margin. Aimed at the build's extent (the Charm's sheet), the camera moves
// across and up as well as back, so a build that reaches toward the camera (a long
// street seen from its end) fills the picture as one seen broadside does; aimed at
// the build's middle (the person's own view, which turns about it), the near end
// stands low and the far end short of the top
// ********************************************************************************
// == Types =======================================================================
/** a point as the camera's view holds it, from where the view turns about: how far
 *  across to the right, how far up, and how far toward the camera */
export type ViewPoint = readonly [across: number, up: number, toward: number];

/** where the camera stands from where the view turns about: moved across and up
 *  (the point it then turns about), and back from there along the view */
export type Framing = Readonly<{ across: number; up: number; distance: number; }>;

/** the share of the picture's width and height the points reach across */
export type Share = Readonly<{ width: number; height: number; }>;

/** what a framing centres the picture on: the points' extent on each of its axes, or
 *  the middle the points are given from */
export type FramingAim = 'extent' | 'middle';

// == Framing =====================================================================
/** the nearest camera holding every point within its picture, shrunk by `margin` (a
 *  picture `aspect` wide for each unit high, `tanHalf` the tangent of half its
 *  vertical field of view), aimed at `aim`. A point `toward` the camera by t and off
 *  the middle by p stands within the picture's half span at distance d when
 *  |p - offset| <= k (d - t), k the half span's tangent. Aimed at the extent, each
 *  axis is solved alone: the nearest d holding both extremes is
 *  (max(p + kt) - min(p - kt)) / 2k, the offset midway between them, the farther
 *  axis's distance holding both and the other axis centred on its points. Aimed at
 *  the middle, the offset is 0 and d the most any point needs, t + |p| / k */
export const frameView = (points: ReadonlyArray<ViewPoint>, tanHalf: number, aspect: number, margin: number, aim: FramingAim): Framing => {
  const axis = (index: 0 | 1, tangent: number) => {
    let high = -Infinity, low = Infinity;
    for(const point of points) {
      high = Math.max(high, point[index] + (tangent * point[2]));
      low = Math.min(low, point[index] - (tangent * point[2]));
    }
    return (aim === 'extent') ? { offset: (high + low) / 2, distance: (high - low) / (2 * tangent) } : { offset: 0, distance: Math.max(high, -low) / tangent };
  };
  if(points.length < 1) return { across: 0, up: 0, distance: 0 }/*nothing to hold*/;
  const vertical = tanHalf / margin;
  const across = axis(0, vertical * aspect), up = axis(1, vertical);
  return { across: across.offset, up: up.offset, distance: Math.max(across.distance, up.distance) };
};

/** the share of a picture's width and height the points reach across, seen through
 *  a framing (the picture `aspect` wide for each unit high, `tanHalf` the tangent of
 *  half its vertical field of view) */
export const framedShare = (points: ReadonlyArray<ViewPoint>, framing: Framing, tanHalf: number, aspect: number): Share => {
  const span = (index: 0 | 1, offset: number, tangent: number) => {
    let high = -Infinity, low = Infinity;
    for(const point of points) {
      const seen = (point[index] - offset) / ((framing.distance - point[2]) * tangent);
      high = Math.max(high, seen);
      low = Math.min(low, seen);
    }
    return (high - low) / 2/*the picture spans -1 to 1*/;
  };
  if(points.length < 1) return { width: 0, height: 0 }/*nothing seen*/;
  return { width: span(0, framing.across, tanHalf * aspect), height: span(1, framing.up, tanHalf) };
};
