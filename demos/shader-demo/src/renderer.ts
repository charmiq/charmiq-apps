import { compileShader, type CompileResult, type ShaderUniforms } from './shader-program';

// owns the WebGL2 context, the VAO for the fullscreen triangle, the active
// shader program, and the per-frame uniform upload. This module is the only
// one in the demo that touches gl.* directly beyond shader compilation -- the
// renderer is swappable if WebGPU ever enters the picture
//
// Rendering model
//   one triangle covering the screen. The fragment shader runs for every pixel
//   inside the canvas viewport and writes a single colour per pixel. Channel
//   samplers are bound to texture units 0..3 by the ChannelBinder
// ********************************************************************************
// == Types =======================================================================
/** per-frame inputs streamed from playback + the mouse tracker */
export interface FrameInputs {
  readonly time:      number/*iTime, seconds*/;
  readonly timeDelta: number/*iTimeDelta, seconds*/;
  readonly frameRate: number/*iFrameRate, Hz*/;
  readonly frame:     number/*iFrame, integer*/;
  readonly mouse:     readonly [number, number, number, number]/*iMouse: xy current, zw last-click*/;
}

// --------------------------------------------------------------------------------
/** per-channel metadata streamed in from the ChannelBinder. A null texture indicates
 *  an unbound slot (a dummy 1x1 texture is bound in its place) */
export interface ChannelState {
  readonly texture:    WebGLTexture | null;
  readonly resolution: readonly [number, number, number]/*w, h, depth (1 for 2D)*/;
  readonly time:       number/*seconds -- 0 for still images*/;
}

// == Constants ===================================================================
/** pixel data for the fallback 1x1 texture bound when a channel is unbound. Middle
 *  grey so shaders that sample without gating show a neutral color */
const FALLBACK_PIXEL = new Uint8Array([128, 128, 128, 255]);

// == Class =======================================================================
/** renders one fragment shader per frame. Owns the WebGL program lifetime */
export class Renderer {
  private readonly gl: WebGL2RenderingContext;

  private readonly vao:             WebGLVertexArrayObject;
  private readonly fallbackTexture: WebGLTexture;

  private program:  WebGLProgram       | null = null;
  private uniforms: ShaderUniforms     | null = null;

  /** reusable typed arrays so per-frame uniform uploads don't allocate */
  private readonly channelTimeBuf: Float32Array = new Float32Array(4);
  private readonly channelResBuf:  Float32Array = new Float32Array(12)/*4 * vec3*/;

  // == Lifecycle =================================================================
  public constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if(!gl) throw new Error('WebGL2 is not available in this environment');
    this.gl = gl;

    // a VAO is required in WebGL2 even when the vertex shader uses no attributes
    // -- bind one empty VAO and reuse it for every draw
    const vao = gl.createVertexArray();
    if(!vao) throw new Error('failed to create a VertexArrayObject');
    this.vao = vao;

    // pre-create the fallback texture so unbound channels still have something to
    // sample from (driver-UB otherwise on some platforms)
    this.fallbackTexture = this.createFallbackTexture();

    // bind iChannel0..3 to texture units 0..3 once -- these assignments are
    // program-scoped though, so they're re-applied after every compile
  }

  // == Public =====================================================================
  /** replace the active program with a freshly compiled one. Returns the compile
   *  result so callers can display the infoLog on failure. A failed compile leaves
   *  the previous program in place so the canvas keeps rendering */
  public setShader(userSource: string): CompileResult {
    const result = compileShader(this.gl, userSource);
    if(!result.ok || !result.program || !result.uniforms) return result;

    // swap in the new program + release the old one
    if(this.program) this.gl.deleteProgram(this.program);
    this.program  = result.program;
    this.uniforms = result.uniforms;

    // iChannel samplers always read from texture units 0..3 -- bind once per
    // program since uniform sampler assignments are not shared across programs
    this.gl.useProgram(this.program);
    const iChannel = this.uniforms.iChannel;
    for(let i=0; i<iChannel.length; i++) {
      if(iChannel[i]) this.gl.uniform1i(iChannel[i]!, i);
    }

    return result;
  }

  // ------------------------------------------------------------------------------
  /** size the drawing buffer to match the canvas CSS size * DPR. Called on resize
   *  (ResizeObserver in main.ts) and on demand. Idempotent -- no-op if the size
   *  hasn't changed */
  public resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    const dpr = Math.max(1, devicePixelRatio || 1);
    const width  = Math.max(1, Math.floor(cssWidth  * dpr));
    const height = Math.max(1, Math.floor(cssHeight * dpr));
    if((canvas.width === width) && (canvas.height === height)) return;/*unchanged*/

    canvas.width  = width;
    canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  // ------------------------------------------------------------------------------
  /** draw a single frame using the supplied inputs. If no program is active (e.g.
   *  the first render before a successful compile), the canvas is cleared to black
   *  so the User sees the stage is alive but empty */
  public render(inputs: Readonly<FrameInputs>, channels: ReadonlyArray<ChannelState>): void {
    const gl = this.gl;

    if(!this.program || !this.uniforms) {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    } /* else -- a compiled program is ready to render */

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // bind textures to units 0..3 -- channels array may be shorter than 4 if the
    // caller chose not to stream unused channels
    for(let i=0; i<4; i++) {
      const state = channels[i];
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, state?.texture ?? this.fallbackTexture);
    }

    this.uploadUniforms(inputs, channels);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------------------------------------
  /** dispose of GL-owned resources. Called on shutdown (rare -- the canvas usually
   *  outlives the app) */
  public destroy(): void {
    if(this.program) this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteTexture(this.fallbackTexture);
    this.program  = null;
    this.uniforms = null;
  }

  // == Internal ===================================================================
  /** stream the shader uniform block to the active program */
  private uploadUniforms(inputs: Readonly<FrameInputs>, channels: ReadonlyArray<ChannelState>): void {
    const gl  = this.gl;
    const u   = this.uniforms!;
    const canvas = gl.canvas as HTMLCanvasElement;

    if(u.iResolution) gl.uniform3f(u.iResolution, canvas.width, canvas.height, 1.0);
    if(u.iTime)       gl.uniform1f(u.iTime,       inputs.time);
    if(u.iTimeDelta)  gl.uniform1f(u.iTimeDelta,  inputs.timeDelta);
    if(u.iFrameRate)  gl.uniform1f(u.iFrameRate,  inputs.frameRate);
    if(u.iFrame)      gl.uniform1i(u.iFrame,      inputs.frame);

    if(u.iMouse) {
      const m = inputs.mouse;
      gl.uniform4f(u.iMouse, m[0], m[1], m[2], m[3]);
    } /* else -- shader doesn't read iMouse */

    if(u.iDate) {
      const now = new Date();
      const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
      gl.uniform4f(u.iDate, now.getFullYear(), now.getMonth(), now.getDate(), seconds);
    } /* else -- shader doesn't read iDate */

    // per-channel arrays -- write into the reusable buffers then upload once
    const chTime = this.channelTimeBuf;
    const chRes  = this.channelResBuf;
    for(let i=0; i<4; i++) {
      const state = channels[i];
      chTime[i]       = state ? state.time          : 0;
      chRes[i * 3 + 0] = state ? state.resolution[0] : 1;
      chRes[i * 3 + 1] = state ? state.resolution[1] : 1;
      chRes[i * 3 + 2] = state ? state.resolution[2] : 1;
    }
    if(u.iChannelTime)       gl.uniform1fv(u.iChannelTime,       chTime);
    if(u.iChannelResolution) gl.uniform3fv(u.iChannelResolution, chRes);
  }

  // ................................................................................
  /** a 1x1 mid-grey texture used when no Asset is bound to a channel */
  private createFallbackTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if(!tex) throw new Error('failed to create fallback texture');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, FALLBACK_PIXEL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  // ------------------------------------------------------------------------------
  /** expose the raw context so peer modules (ChannelBinder) can manage their own
   *  GL resources without a second context */
  public getContext(): WebGL2RenderingContext { return this.gl; }
}
