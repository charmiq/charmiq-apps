// the Platform bundler loads an unknown file type as text (the packed LDraw parts)
declare module '*.ldr' {
  const text: string;
  export default text;
}

// three-gpu-pathtracer ships no types: the subset render/pathTrace.ts uses
declare module 'three-gpu-pathtracer' {
  import type { Camera, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three';
  export class PhysicalCamera extends PerspectiveCamera {
    public focusDistance: number;
    public bokehSize: number;
  }
  export class WebGLPathTracer {
    public constructor(renderer: WebGLRenderer);
    public bounces: number;
    public filterGlossyFactor: number;
    public tiles: Vector2;
    public minSamples: number;
    public readonly samples: number;
    public readonly isCompiling: boolean;
    public rasterizeSceneCallback: (scene: Scene, camera: Camera) => void;
    public setScene(scene: Scene, camera: Camera): void;
    public updateCamera(): void;
    public renderSample(): void;
    public dispose(): void;
  }
}
