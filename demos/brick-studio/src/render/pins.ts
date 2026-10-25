import * as THREE from 'three';

import { occupiedCells, pinsOf, sameTarget, type PinTarget } from '../check';
import type { Model } from '../model';
import type { Point } from '../stage';

// the marks the build view draws over what its pins hold (SEE: pin.ts): a push pin over
// each pinned part, a copy's once, its needle on the top of it at the middle, drawn over
// everything at one size however far the view stands, so a brick held in the air reads
// as meant. The build view alone draws them: a stage, a film's frame and a picture made
// for one never do, nor does the path tracer, which is given the parts alone
// ********************************************************************************
// == Constants ===================================================================
/** a mark's height on the screen, a share of the picture's (its width the same) */
const MARK_SIZE = 0.045;
/** the glyph's canvas, pixels a side */
const GLYPH = 64;
/** the pin's head and its needle (a brick film's red push pin) */
const HEAD = '#D0312D';
const HEAD_LIGHT = '#F28B82';
const NEEDLE = '#8A8A8A';

// == PinMarks ====================================================================
/** the marks over a model's pinned parts, as `group`; `scenePoint` places a point of
 *  the build's grid in the scene */
export class PinMarks {
  public readonly group = new THREE.Group();
  private readonly material: THREE.SpriteMaterial;
  private shown = '';

  public constructor(private readonly scenePoint: (point: Point) => THREE.Vector3) {
    const canvas = Object.assign(document.createElement('canvas'), { width: GLYPH, height: GLYPH });
    drawGlyph(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false, transparent: true });
    this.group.renderOrder = 2/*over the parts and the ghosts*/;
  }

  /** marks a model's pinned parts, or none (`undefined`: a stage) */
  public show(model: Model | undefined): void {
    const marks = model ? marksOf(model) : [];
    const key = JSON.stringify(marks);
    if(key === this.shown) return/*as marked*/;
    this.shown = key;
    this.group.clear();
    for(const point of marks) {
      const mark = new THREE.Sprite(this.material);
      mark.center.set(0.5, 0)/*its needle's tip*/;
      mark.scale.set(MARK_SIZE, MARK_SIZE, 1);
      mark.position.copy(this.scenePoint(point));
      mark.renderOrder = 2;
      this.group.add(mark);
    }
  }
}

// == Internal ====================================================================
/** where each pin's mark stands: the top of what it holds, over the middle of its cells */
const marksOf = (model: Model): ReadonlyArray<Point> => {
  const marked: PinTarget[] = [];
  return pinsOf(model).targets.flatMap(target => {
    if(!target || marked.some(each => sameTarget(each, target))) return []/*holding nothing, or marked*/;
    marked.push(target);
    const held = ('placement' in target) ? [target.placement] : model.placements.flatMap((_, index) => (model.placementPlaced?.[index] === target.placed) ? [index] : []);
    const cells = held.flatMap(index => occupiedCells(model, model.placements[index]));
    if(cells.length < 1) return [];
    const middle = (axis: 'x' | 'z') => cells.reduce((total, cell) => total + cell[axis] + 0.5, 0) / cells.length;
    return [{ x: middle('x'), z: middle('z'), height: Math.max(...cells.map(cell => cell.top)) }];
  });
};

/** a push pin: its round head over its needle, the needle's tip at the foot */
const drawGlyph = (context: CanvasRenderingContext2D): void => {
  context.strokeStyle = NEEDLE;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(GLYPH / 2, 34);
  context.lineTo(GLYPH / 2, GLYPH);
  context.stroke();
  context.fillStyle = HEAD;
  context.beginPath();
  context.arc(GLYPH / 2, 20, 15, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = HEAD_LIGHT;
  context.beginPath();
  context.arc((GLYPH / 2) - 5, 15, 5, 0, Math.PI * 2);
  context.fill();
};
