// a camera's lens, a thin lens at a brick's own scale: the picture is a full frame's
// (24 mm high, as the field of view spans the picture's height), standing at the
// distance the field of view names, and the lens's focal length is the one that
// focuses the distance in focus onto it, so a lens keeps its field of view however
// near it focuses. A point's circle of confusion is the lens's opening seen from the
// picture: its diameter is the opening, times the picture's distance over the
// distance in focus, times how far the point stands from the focus as a share of its
// own distance (|1 - focus / distance|). Both the depth of field drawn over a frame
// and the path tracer's lens open by it, so stepping between the looks keeps the blur
// ********************************************************************************
// == Constants ===================================================================
/** a full frame's height (mm), across which a field of view is measured */
export const SENSOR_HEIGHT = 24;
/** a stud's pitch (mm): the scene's unit at a brick's own scale */
export const STUD = 8;

// == Types =======================================================================
/** a lens: its field of view (degrees across the picture's height), its opening as an
 *  f-number and the distance in focus (studs) */
export type ThinLens = Readonly<{ fov: number; aperture: number; focus: number; }>;

// == Lens ========================================================================
/** the picture's distance behind the lens (mm): the full-frame focal length a field of
 *  view names, a 160 mm lens's 8.58 degrees */
export const imageDistance = (fov: number): number => (SENSOR_HEIGHT / 2) / Math.tan(((fov * Math.PI) / 180) / 2);

/** the lens's focal length (mm): the thin lens that focuses the distance in focus onto
 *  the picture */
export const focalLength = ({ fov, focus }: ThinLens): number => {
  const [picture, subject] = [imageDistance(fov), focus * STUD];
  return (subject * picture) / (subject + picture);
};

/** the lens's opening (studs across): its focal length over its f-number */
export const apertureWidth = (lens: ThinLens): number => focalLength(lens) / lens.aperture / STUD;

/** how wide a point infinitely far blurs, as a share of the picture's height; a point
 *  `distance` studs ahead blurs this times |1 - focus / distance| */
export const farBlurShare = (lens: ThinLens): number =>
  (apertureWidth(lens) * STUD * (imageDistance(lens.fov) / (lens.focus * STUD))) / SENSOR_HEIGHT;

/** the diameter (pixels) a point `distance` studs ahead blurs to in a picture `height`
 *  pixels high: none at the distance in focus */
export const blurDiameter = (lens: ThinLens, distance: number, height: number): number =>
  farBlurShare(lens) * Math.abs(1 - (lens.focus / distance)) * height;
