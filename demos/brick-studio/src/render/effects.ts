import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { DepthOfFieldPass } from './depthOfField';
import type { Fidelity } from './fidelity';
import { GRADE_GLSL, type Grade } from './grade';
import { farBlurShare } from './lens';

// the rasterized frame at a stop. Stops 0 and 1 render straight to the canvas;
// stop 2 adds ambient occlusion (the dark in creases, seams and under overhangs);
// stop 3 adds what a macro photo of a toy has: a shallow depth of field, a faint
// vignette and grain. A lens with its own aperture (a film's camera) brings the depth
// of field to every stop, focused where the lens says. The depth of field is a thin
// lens's through the camera's field of view (SEE: lens.ts)
// ********************************************************************************
// == Constants ===================================================================
/** the f-number a stop's own depth of field opens to (Photo's toy-photo look) */
export const DEFAULT_APERTURE = 22;

// == Types =======================================================================
/** how a frame is focused: the distance in focus (along the view, scene units) and
 *  the lens's opening as an f-number (the stop's own when left out) */
export type Lens = Readonly<{ distance: number; aperture?: number; }>;

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

/** a stage light's white balance and saturation over the frame's light, before its
 *  tone curve (SEE: grade.ts) */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, gradeWhite: { value: new THREE.Vector3(1, 1, 1) }, gradeSaturation: { value: 1 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    ${GRADE_GLSL}
    void main() { vec4 color = texture2D(tDiffuse, vUv); gl_FragColor = vec4(grade(color.rgb), color.a); }`,
};

// == Effects =====================================================================
export class Effects {
  private composer: EffectComposer | undefined;
  private bokeh: DepthOfFieldPass | undefined;
  private fidelity: Fidelity = 0;
  /** a depth of field at every stop: a lens of its own aperture asks for one */
  private depthOfField = false;
  /** a stage light's grade, at every stop */
  private grade: Grade | undefined;
  private gradePass: ShaderPass | undefined;
  private width = 1;
  private height = 1;

  public constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {}

  // ------------------------------------------------------------------------------
  public setFidelity(fidelity: Fidelity): void {
    if(fidelity === this.fidelity) return;
    this.fidelity = fidelity;
    this.build();
  }

  /** draws a depth of field at every stop (`on`), or at Photo alone. The chain built
   *  for one stays until the stop changes, its pass switched on and off: a
   *  transition between a shot with a lens and one without switches it twice a frame */
  public setDepthOfField(on: boolean): void {
    if(on === this.depthOfField) return;
    this.depthOfField = on;
    if(on && !this.bokeh) this.build();
    if(this.bokeh) this.bokeh.enabled = this.blurs;
  }

  /** grades the frame at every stop (SEE: grade.ts); none draws it as lit. The chain
   *  built for one stays until the stop changes, its pass switched off without one */
  public setGrade(grade: Grade | undefined): void {
    this.grade = grade;
    if(grade && !this.gradePass) this.build();
    if(!this.gradePass) return;
    this.gradePass.enabled = !!grade;
    this.gradeUniforms();
  }

  /** the grade pass's white and saturation as the grade says */
  private gradeUniforms(): void {
    if(!this.gradePass || !this.grade) return;
    const { uniforms } = this.gradePass;
    [uniforms.gradeWhite.value, uniforms.gradeSaturation.value] = [new THREE.Vector3(...this.grade.white), this.grade.saturation];
  }

  /** whether the frame draws through the chain: a stop's own passes, a lens's depth
   *  of field or a grade */
  private get chained(): boolean { return (this.fidelity >= 2) || this.depthOfField || !!this.grade; }

  /** whether the frame draws a depth of field: Photo's own, or a lens's */
  private get blurs(): boolean { return (this.fidelity >= 3) || this.depthOfField; }

  /** the passes the stop and the depth of field take */
  private build(): void {
    const { fidelity, depthOfField, grade } = this;
    // each pass's own targets and materials, then the composer's
    for(const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.composer = this.bokeh = this.gradePass = undefined;
    if(!this.chained) return/*straight to the canvas*/;

    // a multisampled half-float target keeps edges smooth and highlights unclipped
    const target = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));

    if(fidelity >= 2) {
      const occlusion = new GTAOPass(this.scene, this.camera, this.width, this.height);
      occlusion.updateGtaoMaterial({ radius: 1.0/*studs*/, distanceExponent: 1.2, thickness: 1, scale: 1.3, samples: 16 });
      occlusion.updatePdMaterial({ radius: 6, samples: 16 });
      occlusion.blendIntensity = 1;
      composer.addPass(occlusion);
    } /* else -- no occlusion below Shaded */

    if((fidelity >= 3) || depthOfField) {
      this.bokeh = new DepthOfFieldPass(this.scene, this.camera);
      composer.addPass(this.bokeh);
    } /* else -- everything in focus */

    if(grade) {
      this.gradePass = new ShaderPass(GRADE_SHADER);
      this.gradeUniforms();
      composer.addPass(this.gradePass);
    } /* else -- the frame as lit */

    composer.addPass(new OutputPass()/*tone mapping and color space*/);
    if(fidelity >= 3) composer.addPass(new ShaderPass(FINISH_SHADER));
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.width, this.height);
    this.composer = composer;
  }

  /** whether the frame draws a depth of field, so is focused at all */
  public get focuses(): boolean { return !!this.bokeh && this.blurs; }

  /** focuses the depth of field as the lens says, through the camera's field of view */
  public focus({ distance, aperture = DEFAULT_APERTURE }: Lens): void {
    this.bokeh?.focus(distance, farBlurShare({ fov: this.camera.fov, aperture, focus: distance }));
  }

  public setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
  }

  public render(): void {
    if(this.composer && this.chained) this.composer.render();
    else this.renderer.render(this.scene, this.camera)/*straight to the canvas, a chain kept for a lens aside*/;
  }
}
