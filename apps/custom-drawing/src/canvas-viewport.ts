import type { Point } from './element-model';

// pan, zoom, coordinate transforms, and grid / layer management
// ********************************************************************************
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

const ZOOM_SENSITIVITY = 0.001;

// == CanvasViewport ==============================================================
export class CanvasViewport {
  readonly container: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly backgroundLayer: SVGGElement;
  readonly drawingLayer: SVGGElement;
  readonly selectionLayer: SVGGElement;

  panOffset: Point = { x: 100, y: 100 };
  zoomLevel = 1;

  public constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.svg = document.getElementById('mainSvg') as unknown as SVGSVGElement;
    this.backgroundLayer = document.getElementById('backgroundLayer') as unknown as SVGGElement;
    this.drawingLayer = document.getElementById('drawingLayer') as unknown as SVGGElement;
    this.selectionLayer = document.getElementById('selectionLayer') as unknown as SVGGElement;
  }

  // -- Config application --------------------------------------------------------
  /** show / hide the grid (background layer) */
  public setGridVisible(visible: boolean): void {
    this.backgroundLayer.style.display = visible ? '' : 'none';
  }

  /** update the stroke color of the grid pattern */
  public setGridColor(color: string): void {
    const path = document.querySelector<SVGPathElement>('#grid path');
    if(path) path.setAttribute('stroke', color);
  }

  /** update the SVG canvas background color */
  public setBackgroundColor(color: string): void {
    this.svg.style.background = color;
  }

  // -- Coordinate conversion -----------------------------------------------------
  // screen (clientX/clientY) → canvas (element-coordinate space)
  public screenToCanvas(clientX: number, clientY: number): Point {
    // use the SVG's own coordinate matrix so the conversion is correct regardless
    // of how the platform embeds the app (iframe offsets, transforms, etc.)
    const ctm = this.drawingLayer.getScreenCTM();
    if(ctm) {
      const inv = ctm.inverse();
      return {
        x: inv.a * clientX + inv.c * clientY + inv.e,
        y: inv.b * clientX + inv.d * clientY + inv.f,
      };
    } /* else -- no CTM available */

    // fallback: manual math (matches the original drawing.html approach)
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panOffset.x) / this.zoomLevel,
      y: (clientY - rect.top - this.panOffset.y) / this.zoomLevel,
    };
  }

  // canvas → screen
  public canvasToScreen(cx: number, cy: number): Point {
    const rect = this.container.getBoundingClientRect();
    return {
      x: cx * this.zoomLevel + this.panOffset.x + rect.left,
      y: cy * this.zoomLevel + this.panOffset.y + rect.top,
    };
  }

  // convert a screen-pixel size to its canvas-space equivalent (e.g. handle radii)
  public screenSizeToCanvasSize(px: number): number {
    return px / this.zoomLevel;
  }

  // -- transform application -----------------------------------------------------
  public updateTransform(): void {
    const t = `translate(${this.panOffset.x},${this.panOffset.y}) scale(${this.zoomLevel})`;
    this.backgroundLayer.setAttribute('transform', t);
    this.drawingLayer.setAttribute('transform', t);
    this.selectionLayer.setAttribute('transform', t);
  }

  // -- Zoom ----------------------------------------------------------------------
  public applyZoom(delta: number, centerX: number, centerY: number): void {
    const prev = this.zoomLevel;
    this.zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoomLevel * (1 - delta * ZOOM_SENSITIVITY)));

    // keep the point under the cursor fixed
    const ratio = this.zoomLevel / prev;
    this.panOffset.x = centerX - (centerX - this.panOffset.x) * ratio;
    this.panOffset.y = centerY - (centerY - this.panOffset.y) * ratio;

    this.updateTransform();
  }

  // zoom to fit all given bounds within the viewport
  public zoomToFit(minX: number, minY: number, maxX: number, maxY: number, padding = 50): void {
    const rect = this.container.getBoundingClientRect();
    const w = maxX - minX,
          h = maxY - minY;
    if((w === 0) || (h === 0)) return;

    this.zoomLevel = Math.min(
      (rect.width - padding * 2) / w,
      (rect.height - padding * 2) / h,
      MAX_ZOOM,
    );

    this.panOffset.x = (rect.width - w * this.zoomLevel) / 2 - minX * this.zoomLevel;
    this.panOffset.y = (rect.height - h * this.zoomLevel) / 2 - minY * this.zoomLevel;
    this.updateTransform();
  }

  // -- Pan -----------------------------------------------------------------------
  public pan(dx: number, dy: number): void {
    this.panOffset.x += dx;
    this.panOffset.y += dy;
    this.updateTransform();
  }
}
