// compiles Shadertoy-style fragment shaders into a linked WebGL2 program. The
// User writes `void mainImage(out vec4 fragColor, in vec2 fragCoord)` and a small
// trampoline turns that into a standard `main()`. Per-shader uniform locations are
// cached so the renderer can stream values without repeated string lookups every frame
// ********************************************************************************
// == Types =======================================================================
/** outcome of a compile attempt. On success, `program` is the ready-to-use
 *  WebGLProgram and `infoLog` contains any non-fatal driver warnings. On failure,
 *  `program` is null and `infoLog` holds the (potentially multi-line) GLSL diagnostic
 *  surfaced by the driver */
export interface CompileResult {
  readonly ok:         boolean;
  readonly program:    WebGLProgram | null;
  readonly uniforms:   Readonly<ShaderUniforms> | null;
  readonly infoLog:    string;
}

// --------------------------------------------------------------------------------
/** cached uniform locations for the shared shader uniform block. Every field may
 *  be null if the shader does not reference the uniform (the GLSL compiler strips
 *  unused ones so `getUniformLocation` legitimately returns null in that case) */
export interface ShaderUniforms {
  readonly iResolution:         WebGLUniformLocation | null;
  readonly iTime:               WebGLUniformLocation | null;
  readonly iTimeDelta:          WebGLUniformLocation | null;
  readonly iFrameRate:          WebGLUniformLocation | null;
  readonly iFrame:              WebGLUniformLocation | null;
  readonly iMouse:              WebGLUniformLocation | null;
  readonly iDate:               WebGLUniformLocation | null;
  readonly iChannelTime:        WebGLUniformLocation | null;
  readonly iChannelResolution:  WebGLUniformLocation | null;
  readonly iChannel:            ReadonlyArray<WebGLUniformLocation | null>;
}

// == Constants ===================================================================
/** vertex shader — a fullscreen triangle in clip space. Three vertices, no attributes,
 *  computed from gl_VertexID. The fragCoord in pixels is emitted as-is so the
 *  fragment shader can recover it directly */
const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  // one-triangle fullscreen trick: emits (-1,-1), (3,-1), (-1,3)
  vec2 pos = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

// --------------------------------------------------------------------------------
/** prepended to the User's shader source so the shader uniform vocabulary is
 *  available. Precision is set to highp */
const FRAGMENT_PREAMBLE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform float iFrameRate;
uniform int   iFrame;
uniform float iChannelTime[4];
uniform vec3  iChannelResolution[4];
uniform vec4  iMouse;
uniform vec4  iDate;

uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

out vec4 cmq_FragColor;
`;

// --------------------------------------------------------------------------------
/** appended after the User's shader source so the shader entry point is wired up
 *  to a standard `main()` */
const FRAGMENT_TRAMPOLINE = `
void main() {
  mainImage(cmq_FragColor, gl_FragCoord.xy);
}
`;

// --------------------------------------------------------------------------------
/** offset (in lines) between the User's source and the assembled fragment source.
 *  Used to rewrite driver-reported line numbers back into the User's frame of
 *  reference. Must equal the number of '\n' in FRAGMENT_PREAMBLE */
const PREAMBLE_LINES = FRAGMENT_PREAMBLE.split('\n').length - 1;

// == Functions ===================================================================
/** compile + link the User's shader into a program. The caller owns the GL context.
 *  On failure the returned program is null and the infoLog is remapped so line
 *  numbers refer back to the User's source */
export const compileShader = (gl: WebGL2RenderingContext, userSource: string): CompileResult => {
  const vs = compileStage(gl, gl.VERTEX_SHADER,   VERTEX_SHADER);
  if(!vs.shader) return fail(gl, vs.infoLog, [vs.shader]);

  const fragmentSource = FRAGMENT_PREAMBLE + userSource + FRAGMENT_TRAMPOLINE;
  const fs = compileStage(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if(!fs.shader) {
    const remapped = remapLineNumbers(fs.infoLog, PREAMBLE_LINES);
    return fail(gl, remapped, [vs.shader, fs.shader]);
  } /* else -- fragment compiled */

  const program = gl.createProgram();
  if(!program) return fail(gl, 'gl.createProgram() returned null', [vs.shader, fs.shader]);

  gl.attachShader(program, vs.shader);
  gl.attachShader(program, fs.shader);
  gl.linkProgram(program);

  // detach + delete the stage shaders regardless of link outcome -- once the
  // program is linked it holds its own reference, and keeping stage shaders
  // around is just a leak
  gl.detachShader(program, vs.shader);
  gl.detachShader(program, fs.shader);
  gl.deleteShader(vs.shader);
  gl.deleteShader(fs.shader);

  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const infoLog = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    return { ok: false, program: null, uniforms: null, infoLog };
  } /* else -- linked cleanly */

  const uniforms = resolveUniforms(gl, program);
  return { ok: true, program, uniforms, infoLog: '' };
};

// --------------------------------------------------------------------------------
/** look up every uniform location the renderer cares about. Missing locations
 *  return null, which gl.uniform*() treats as a silent no-op -- so the caller can
 *  set every uniform every frame without guarding */
const resolveUniforms = (gl: WebGL2RenderingContext, program: WebGLProgram): ShaderUniforms => ({
  iResolution:        gl.getUniformLocation(program, 'iResolution'),
  iTime:              gl.getUniformLocation(program, 'iTime'),
  iTimeDelta:         gl.getUniformLocation(program, 'iTimeDelta'),
  iFrameRate:         gl.getUniformLocation(program, 'iFrameRate'),
  iFrame:             gl.getUniformLocation(program, 'iFrame'),
  iMouse:             gl.getUniformLocation(program, 'iMouse'),
  iDate:              gl.getUniformLocation(program, 'iDate'),
  iChannelTime:       gl.getUniformLocation(program, 'iChannelTime[0]'),
  iChannelResolution: gl.getUniformLocation(program, 'iChannelResolution[0]'),
  iChannel: [
    gl.getUniformLocation(program, 'iChannel0'),
    gl.getUniformLocation(program, 'iChannel1'),
    gl.getUniformLocation(program, 'iChannel2'),
    gl.getUniformLocation(program, 'iChannel3')
  ]
});

// == Internal ====================================================================
interface StageResult {
  readonly shader:  WebGLShader | null;
  readonly infoLog: string;
}

// ................................................................................
/** compile a single shader stage. Returns either the compiled shader or the driver's
 *  infoLog. Errors are never thrown -- the caller always gets a structured result
 *  to render in the UI */
const compileStage = (gl: WebGL2RenderingContext, type: number, source: string): StageResult => {
  const shader = gl.createShader(type);
  if(!shader) return { shader: null, infoLog: 'gl.createShader() returned null' };

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if(gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return { shader, infoLog: '' };

  const infoLog = gl.getShaderInfoLog(shader) ?? '';
  gl.deleteShader(shader);
  return { shader: null, infoLog };
};

// ................................................................................
/** clean up any partial state + return a uniform failure result */
const fail = (gl: WebGL2RenderingContext, infoLog: string, shaders: ReadonlyArray<WebGLShader | null>): CompileResult => {
  for(let i=0; i<shaders.length; i++) {
    const s = shaders[i];
    if(s) gl.deleteShader(s);
  }
  return { ok: false, program: null, uniforms: null, infoLog };
};

// ................................................................................
/** rewrite `0:LINE:` prefixes in an infoLog so the reported line number refers to
 *  the User's source instead of the assembled source. Most drivers emit diagnostics
 *  as `0:<line>:<column>: <message>` -- subtract the preamble line count and clamp
 *  to 1. Lines that don't match are passed through */
const remapLineNumbers = (infoLog: string, preambleLines: number): string => {
  const pattern = /^(\s*\d+):(\d+):/;
  const lines = infoLog.split('\n');
  const out: string[] = [];
  for(let i=0; i<lines.length; i++) {
    const line = lines[i];
    const match = line.match(pattern);
    if(!match) {
      out.push(line);
      continue;
    } /* else -- matched the driver's line-column prefix */
    const file = match[1];
    const lineNum = Math.max(1, parseInt(match[2], 10) - preambleLines);
    out.push(line.replace(pattern, `${file}:${lineNum}:`));
  }
  return out.join('\n');
};
