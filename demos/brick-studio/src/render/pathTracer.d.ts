// three-gpu-pathtracer's own declarations omit the compile state its WebGLPathTracer
// carries at runtime, which render/pathTrace.ts reads
import 'three-gpu-pathtracer';

declare module 'three-gpu-pathtracer' {
  interface WebGLPathTracer {
    /** whether its shaders are still compiling */
    readonly isCompiling: boolean;
  }
}
