import * as THREE from 'three';

import { pictureFootprint, pictureLine, type Picture } from '../picture';
import type { Pixels } from './panorama';

// the pictures a set stands, drawn: each a panel its size in studs, its image on its
// face (covering it, contained in it on the panel's own gray, or stretched over it) and
// the panel's gray behind, standing upright in the middle of its stud row or lying flat
// on its level (SEE: picture.ts). Images are read once each, a Drive file or a picture
// Brick Studio ships (SEE: PictureFiles), a sky's picture among them; a panel stands plain until its image is
// read, and stays so when it cannot be. A picture naming no height takes its image's
// shape once read, three quarters of its width until then
// ********************************************************************************
// == Constants ===================================================================
/** the widest picture an image is drawn from (pixels): a phone's photo is larger than
 *  any screen shows */
export const MOST_PICTURE = 4096;
/** the longest side of a panel's face as drawn (pixels) */
const MOST_FACE = 1024;
/** a panel's own color: its back, and round an image contained in it */
const PANEL_GRAY = '#8C8A86';
/** a plate's height (studs), and how far a flat picture lies above its level: on the
 *  tops of the studs there (4 LDU), a hair over them so it never fights with them */
const PLATE = 0.4;
const FLAT_LIFT = 0.2 + 0.005;
/** a picture's height as a share of its width until its image is read */
const UNREAD_SHAPE = 0.75;

// == PictureFiles ================================================================
/** the images skies and pictures name (a Drive file, or a picture Brick Studio ships),
 *  each read and decoded once (at most MOST_PICTURE wide); one that cannot be read is
 *  read again when next asked for */
export class PictureFiles {
  private readonly read = new Map<string, Promise<Pixels>>();

  public constructor(private readonly readImage: (image: string) => Promise<ArrayBuffer>) {}

  /** an image's pixels */
  public pixels(image: string): Promise<Pixels> {
    let read = this.read.get(image);
    if(!read) {
      read = this.readImage(image).then(decode);
      read.catch(() => this.read.delete(image)/*read again when next asked for*/);
      this.read.set(image, read);
    } /* else -- read, or being read */
    return read;
  }
}

// == PictureStand ================================================================
/** the pictures of the set drawn, as meshes in `group`; `changed` is told when an
 *  image is read, or fails to be */
export class PictureStand {
  public readonly group = new THREE.Group();
  /** each picture drawn, by its line: its meshes and what they hold */
  private readonly drawn = new Map<string, Readonly<{ object: THREE.Object3D; dispose: () => void; }>>();
  /** each image's face source, once read (none where it could not be) */
  private readonly images = new Map<string, Pixels | undefined>();
  private readonly reading = new Set<string>();
  private readonly unread = new Set<string>();
  private readonly backMaterial = new THREE.MeshStandardMaterial({ color: PANEL_GRAY, roughness: 0.8, metalness: 0 });
  private shown: ReadonlyArray<Picture> = [];

  public constructor(private readonly files: PictureFiles, private readonly changed: () => void) {}

  /** whether an image is being read */
  public get loading(): boolean { return this.reading.size > 0; }
  /** how many pictures shown name an image that could not be read */
  public get unreadCount(): number { return this.shown.filter(picture => this.unread.has(picture.image)).length; }

  /** stands a set's pictures, its others taken down */
  public show(pictures: ReadonlyArray<Picture>): void {
    this.shown = pictures;
    const wanted = new Map(pictures.map(picture => [keyOf(picture, this.images.get(picture.image)), picture]));
    for(const [key, { object, dispose }] of this.drawn) {
      if(wanted.has(key)) continue;
      this.group.remove(object);
      dispose();
      this.drawn.delete(key);
    }
    for(const [key, picture] of wanted) {
      if(!this.drawn.has(key)) {
        const made = this.make(picture);
        this.group.add(made.object);
        this.drawn.set(key, made);
      } /* else -- standing */
      this.read(picture.image);
    }
  }

  public dispose(): void {
    for(const { dispose } of this.drawn.values()) dispose();
    this.drawn.clear();
    this.backMaterial.dispose();
  }

  // == Internal ==================================================================
  // reads an image once; once read (or not), the pictures shown are drawn again
  private read(uri: string): void {
    if(this.images.has(uri) || this.reading.has(uri)) return/*read, or being read*/;
    this.reading.add(uri);
    this.files.pixels(uri).then(
      pixels => { this.images.set(uri, pixels); this.unread.delete(uri); },
      (error: unknown) => { console.warn('brick-studio: a picture\'s image could not be read:', error); this.images.set(uri, undefined); this.unread.add(uri); },
    ).finally(() => {
      this.reading.delete(uri);
      this.show(this.shown)/*with its image, or plain*/;
      this.changed();
    });
  }

  // a picture's panel: its face and its back, placed and turned
  private make(picture: Picture): Readonly<{ object: THREE.Object3D; dispose: () => void; }> {
    const image = this.images.get(picture.image);
    const width = picture.width, height = picture.height ?? (image ? (width * image.height) / image.width : width * UNREAD_SHAPE);
    const face = faceTexture(image, width, height, picture.fit);
    const front = new THREE.MeshStandardMaterial(face ? { map: face, roughness: 0.7, metalness: 0 } : { color: PANEL_GRAY, roughness: 0.8, metalness: 0 });
    const plane = new THREE.PlaneGeometry(width, height);
    const object = new THREE.Group();
    const shown = new THREE.Mesh(plane, front);
    const back = new THREE.Mesh(plane, this.backMaterial);
    back.rotation.y = Math.PI/*facing away*/;
    for(const mesh of [shown, back]) { mesh.castShadow = mesh.receiveShadow = true; }
    object.add(shown, ...(picture.flat ? [] : [back]));
    const [east, north] = pictureFootprint(picture, height);
    const bottom = picture.level * PLATE;
    object.position.set(picture.x + (east / 2), picture.flat ? (bottom + FLAT_LIFT) : (bottom + (height / 2)), -(picture.z + (north / 2)));
    if(picture.flat) object.rotation.set(-Math.PI / 2, -(picture.rotation * Math.PI) / 180, 0, 'YXZ')/*laid flat, its top north, then turned as upright*/;
    else object.rotation.y = -(picture.rotation * Math.PI) / 180/*clockwise seen from above: south toward west*/;
    return { object, dispose: () => { plane.dispose(); front.dispose(); face?.dispose(); } };
  }
}

// == Internal ====================================================================
/** a picture as drawn: its line and whether its image is read, so a picture whose
 *  image arrives is drawn again */
const keyOf = (picture: Picture, image: Pixels | undefined): string => `${pictureLine(picture)}|${image ? 'read' : 'plain'}`;

/** a panel's face: its image fitted to the panel's shape (none where no image is read) */
const faceTexture = (image: Pixels | undefined, width: number, height: number, fit: Picture['fit']): THREE.Texture | undefined => {
  if(!image) return undefined;
  const scale = MOST_FACE / Math.max(width, height);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
  const context = canvas.getContext('2d')!;
  const source = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
  source.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  if(fit === 'stretch') context.drawImage(source, 0, 0, canvas.width, canvas.height);
  else {
    // covering: the larger scale, the overflow cropped; contained: the smaller, the
    // panel's gray round it
    const by = ((fit === 'contain') ? Math.min : Math.max)(canvas.width / image.width, canvas.height / image.height);
    const [drawnWidth, drawnHeight] = [image.width * by, image.height * by];
    context.fillStyle = PANEL_GRAY;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, (canvas.width - drawnWidth) / 2, (canvas.height - drawnHeight) / 2, drawnWidth, drawnHeight);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** an image's bytes as pixels, at most MOST_PICTURE wide */
const decode = async (bytes: ArrayBuffer): Promise<Pixels> => {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    const scale = Math.min(1, MOST_PICTURE / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0, width, height);
    return { data: context.getImageData(0, 0, width, height).data, width, height };
  } finally {
    bitmap.close();
  }
};
