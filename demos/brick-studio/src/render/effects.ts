import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import type { Fidelity } from './fidelity';

// the rasterized frame at a stop. Stops 0 and 1 render straight to the canvas;
// stop 2 adds ambient occlusion (the dark in creases, seams and under overhangs);
// stop 3 adds what a macro photo of a toy has: a shallow depth of field focused on
// the build, a faint vignette and grain
// ********************************************************************************
// == Constants ===================================================================
/** blur per unit of distance from focus, times the framing distance: the same
 *  macro look at any zoom */
const APERTURE = 0.012;
const MAX_BLUR = 0.004;

// == Finish ======================================================================
/** a faint vignette and fixed film grain, in display space before output */
const FINISH_SHADER = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.1 }, grain: { value: 0.018 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vignette; uniform float grain;
    varying vec2 vUv;
    float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float edge = smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.4);
      color.rgb *= 1.0 - (vignette * edge);
      color.rgb += (noise(gl_FragCoord.xy) - 0.5) * grain;
      gl_FragColor = color;
    }`,
};

// == Effects =====================================================================
export class Effects {
  private composer: EffectComposer | undefined;
  private bokeh: BokehPass | undefined;
  private fidelity: Fidelity = 0;
  private width = 1;
  private height = 1;

  public constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {}

  // ------------------------------------------------------------------------------
  public setFidelity(fidelity: Fidelity): void {
    if(fidelity === this.fidelity) return;
    this.fidelity = fidelity;
    this.composer?.dispose();
    this.composer = this.bokeh = undefined;
    if(fidelity < 2) return/*straight to the canvas*/;

    // a multisampled half-float target keeps edges smooth and highlights unclipped
    const target = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));

    const occlusion = new GTAOPass(this.scene, this.camera, this.width, this.height);
    occlusion.updateGtaoMaterial({ radius: 1.0/*studs*/, distanceExponent: 1.2, thickness: 1, scale: 1.3, samples: 16 });
    occlusion.updatePdMaterial({ radius: 6, samples: 16 });
    occlusion.blendIntensity = 1;
    composer.addPass(occlusion);

    if(fidelity >= 3) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 1, aperture: 0, maxblur: MAX_BLUR });
      composer.addPass(this.bokeh);
    } /* else -- everything in focus */

    composer.addPass(new OutputPass()/*tone mapping and color space*/);
    if(fidelity >= 3) composer.addPass(new ShaderPass(FINISH_SHADER));
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.width, this.height);
    this.composer = composer;
  }

  /** focuses the depth of field at `distance` from the camera */
  public focus(distance: number): void {
    if(!this.bokeh) return;
    const { uniforms } = this.bokeh.materialBokeh;
    uniforms.focus.value = distance;
    uniforms.aperture.value = APERTURE / Math.max(distance, 1);
  }

  public setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
  }

  public render(): void {
    if(this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
