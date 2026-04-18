import { BehaviorSubject, type Observable } from 'rxjs';

import type { FrameInputs } from './renderer';

// drives the render loop. Tracks iTime / iTimeDelta / iFrame / iFrameRate and
// mouse state, exposes a play / pause / reset API, and publishes a telemetry
// stream the toolbar reads to paint the time + fps readouts
//
// The loop is a single requestAnimationFrame -- the renderer callback is supplied
// by main.ts so this module has no dependency on WebGL. Pausing stops the RAF
// chain entirely (no wasted GPU), reset zeroes time + frame while preserving the
// playing state
// ********************************************************************************
// == Types =======================================================================
/** small read-only readout the toolbar displays. Emitted at most once per animation
 *  frame (so subscribers don't need to debounce) */
export interface PlaybackTelemetry {
  readonly isPlaying:     boolean;
  readonly time:          number/*seconds*/;
  readonly frame:         number;
  readonly frameRate:     number/*smoothed, Hz*/;
  readonly cssWidth:      number;
  readonly cssHeight:     number;
}

// --------------------------------------------------------------------------------
/** signature of the per-frame render callback supplied by main.ts */
export type RenderCallback = (inputs: Readonly<FrameInputs>) => void;

// == Constants ===================================================================
/** smoothing constant for the fps readout. Lower = laggier but steadier */
const FPS_SMOOTHING = 0.9;

/** minimum dt in seconds, so a hidden tab returning 30s later doesn't produce a
 *  runaway iTimeDelta spike that breaks shaders */
const MAX_DT_SECONDS = 0.1/*100ms -- renderer effectively stalls at 10fps min*/;

// == Class =======================================================================
export class Playback {
  private readonly canvas: HTMLCanvasElement;
  private readonly render: RenderCallback;

  private readonly telemetrySubject = new BehaviorSubject<PlaybackTelemetry>({
    isPlaying: true, time: 0, frame: 0, frameRate: 0, cssWidth: 0, cssHeight: 0
  });

  // playback clock
  private rafHandle:   number  = 0;
  private isPlaying:   boolean = true;
  private time:        number  = 0;
  private frame:       number  = 0;
  private lastWallMs:  number  = 0;
  private frameRate:   number  = 0/*smoothed Hz*/;

  // iMouse state -- xy is current (when MLB down), zw is the last click. xy stays
  // at its last position when the mouse button lifts; zw is set once per click and
  // is NEGATED while the button is released, which some shaders test for
  private mouseX:  number = 0;
  private mouseY:  number = 0;
  private clickX:  number = 0;
  private clickY:  number = 0;
  private mouseDown: boolean = false;

  // pending resize -- coalesced so the renderer sees one update per frame
  private pendingWidth:  number = 0;
  private pendingHeight: number = 0;

  // resize callback wired from main.ts so Playback is also the point at which the
  // ResizeObserver routes through -- keeps the RAF loop in charge of coalescing
  // updates to the next frame
  private onResize: ((width: number, height: number, dpr: number) => void) | null = null;

  // == Lifecycle =================================================================
  public constructor(canvas: HTMLCanvasElement, render: RenderCallback) {
    this.canvas = canvas;
    this.render = render;

    // mouse tracking. Pointer events cover mouse + pen + touch uniformly; listeners
    // are attached to the canvas so they don't leak beyond the stage
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup',   this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
  }

  // ------------------------------------------------------------------------------
  /** start the RAF loop. Idempotent -- calling while playing is a no-op */
  public start(): void {
    if(this.rafHandle !== 0) return;/*already running*/
    this.lastWallMs = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------------------------
  /** tear down listeners + RAF */
  public destroy(): void {
    if(this.rafHandle !== 0) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;

    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup',   this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
  }

  // == Public =====================================================================
  /** set a callback to receive resize notifications routed through RAF. Caller is
   *  responsible for observing the DOM (e.g. ResizeObserver) and invoking `setSize`;
   *  this callback fires on the frame following a size change so the renderer gets
   *  a single coalesced update */
  public setResizeCallback(cb: (width: number, height: number, dpr: number) => void): void {
    this.onResize = cb;
  }

  // ------------------------------------------------------------------------------
  /** report a new canvas CSS size. Coalesced -- only the last size before the next
   *  RAF tick is forwarded to the renderer */
  public setSize(cssWidth: number, cssHeight: number): void {
    if((this.pendingWidth === cssWidth) && (this.pendingHeight === cssHeight)) return;
    this.pendingWidth  = cssWidth;
    this.pendingHeight = cssHeight;
  }

  // ------------------------------------------------------------------------------
  public play(): void {
    if(this.isPlaying) return;
    this.isPlaying = true;
    this.lastWallMs = performance.now()/*skip over the paused gap*/;
    this.emitTelemetry();
  }

  // ------------------------------------------------------------------------------
  public pause(): void {
    if(!this.isPlaying) return;
    this.isPlaying = false;
    this.emitTelemetry();
  }

  // ------------------------------------------------------------------------------
  public togglePlay(): void {
    if(this.isPlaying) this.pause();
    else               this.play();
  }

  // ------------------------------------------------------------------------------
  public reset(): void {
    this.time  = 0;
    this.frame = 0;
    this.emitTelemetry();
  }

  // ------------------------------------------------------------------------------
  public telemetry$(): Observable<PlaybackTelemetry> {
    return this.telemetrySubject.asObservable();
  }

  // == Internal ===================================================================
  /** per-frame tick. Bound as an arrow so it can be passed to RAF directly */
  private tick = (nowMs: number): void => {
    this.rafHandle = requestAnimationFrame(this.tick);

    // flush a pending resize before rendering so the shader sees the new
    // iResolution for this frame
    if((this.pendingWidth > 0) && (this.pendingHeight > 0) && this.onResize) {
      this.onResize(this.pendingWidth, this.pendingHeight, window.devicePixelRatio);
    } /* else -- no pending resize */

    // wall-clock delta, clamped so tab-switch stalls don't leap time forward
    const dt = Math.min((nowMs - this.lastWallMs) / 1000, MAX_DT_SECONDS);
    this.lastWallMs = nowMs;

    if(this.isPlaying) {
      this.time += dt;
      this.frame += 1;
    } /* else -- paused: time + frame are frozen; mouse + resize still flow */

    // smoothed fps readout (EMA on instantaneous 1/dt)
    if(dt > 0) {
      const inst = 1 / dt;
      this.frameRate = (this.frameRate === 0) ? inst : (this.frameRate * FPS_SMOOTHING + inst * (1 - FPS_SMOOTHING));
    } /* else -- dt=0 shouldn't happen but be defensive */

    // iMouse: while held, xy reports the live position and zw stays at the click
    // origin; when released, xy stays at the last position and zw is negated
    const mouse: readonly [number, number, number, number] = [
      this.mouseX,
      this.mouseY,
      this.mouseDown ? this.clickX : -Math.abs(this.clickX),
      this.mouseDown ? this.clickY : -Math.abs(this.clickY)
    ];

    const inputs: FrameInputs = {
      time:      this.time,
      timeDelta: dt,
      frameRate: this.frameRate,
      frame:     this.frame,
      mouse
    };
    this.render(inputs);

    // emit telemetry once per frame -- subscribers can throttle downstream
    this.emitTelemetry();
  };

  // ................................................................................
  private emitTelemetry(): void {
    const canvas = this.canvas;
    this.telemetrySubject.next({
      isPlaying: this.isPlaying,
      time:      this.time,
      frame:     this.frame,
      frameRate: this.frameRate,
      cssWidth:  canvas.clientWidth,
      cssHeight: canvas.clientHeight
    });
  }

  // ................................................................................
  private handlePointerDown = (event: PointerEvent): void => {
    const pos = this.toCanvasCoords(event);
    this.mouseX = pos.x;
    this.mouseY = pos.y;
    this.clickX = pos.x;
    this.clickY = pos.y;
    this.mouseDown = true;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if(!this.mouseDown) return/*only track while held -- matches iMouse contract*/;
    const pos = this.toCanvasCoords(event);
    this.mouseX = pos.x;
    this.mouseY = pos.y;
  };

  private handlePointerUp = (event: PointerEvent): void => {
    this.mouseDown = false;
    if(this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    } /* else -- capture already released */
  };

  // ................................................................................
  /** convert a pointer event into device-pixel coordinates with origin at the
   *  bottom-left */
  private toCanvasCoords(event: PointerEvent): { x: number; y: number; } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const x = (event.clientX - rect.left) * dpr;
    const y = (rect.height - (event.clientY - rect.top)) * dpr;
    return { x, y };
  }
}
