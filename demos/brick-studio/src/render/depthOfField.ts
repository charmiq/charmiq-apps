import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

// a lens's depth of field over a rasterized frame: each pixel's circle of confusion
// from its distance (SEE: lens.ts), then a gather over a disk, each sample counted
// where its own circle reaches the pixel, so a near blur spreads over what stands
// sharp behind it and a far blur never spreads over what stands before it. The disk
// takes a fixed number of samples, each read from the frame's mipmap level as wide as
// the samples stand apart, so a wide blur is as smooth as a narrow one at the same cost
// ********************************************************************************
// == Constants ===================================================================
/** the pixels a tile of the near blur's reach covers across */
const TILE = 16;
/** the tiles a near blur reaches over what stands behind it */
const REACH = 16;
/** the samples the disk takes about each pixel */
const SAMPLES = 96;

// == Shaders =====================================================================
const QUAD_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** the frame's color, and in its alpha the pixel's circle of confusion as a radius in
 *  pixels, negative before the focus */
const CIRCLE_SHADER = {
  uniforms: { tColor: { value: null }, tDepth: { value: null }, nearClip: { value: 0.1 }, farClip: { value: 2000 }, focus: { value: 1 }, farBlur: { value: 0 }, mostBlur: { value: 0 } },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tColor; uniform sampler2D tDepth;
    uniform float nearClip; uniform float farClip; uniform float focus; uniform float farBlur; uniform float mostBlur;
    varying vec2 vUv;
    void main() {
      float away = -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tDepth, vUv)), nearClip, farClip);
      gl_FragColor = vec4(texture2D(tColor, vUv).rgb, clamp(farBlur * (1.0 - (focus / away)), -mostBlur, mostBlur));
    }`,
};

/** each tile's widest near circle (pixels) */
const NEAR_SHADER = {
  uniforms: { tCircle: { value: null } },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */`
    uniform sampler2D tCircle;
    void main() {
      ivec2 size = textureSize(tCircle, 0), tile = ivec2(gl_FragCoord.xy) * ${TILE};
      float near = 0.0;
      for(int y=0; y<${TILE}; y++) for(int x=0; x<${TILE}; x++) near = max(near, -texelFetch(tCircle, min(tile + ivec2(x, y), size - 1), 0).a);
      gl_FragColor = vec4(near, 0.0, 0.0, 1.0);
    }`,
};

/** each tile's widest near circle reaching into it from a tile about it */
const REACH_SHADER = {
  uniforms: { tNear: { value: null } },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */`
    uniform sampler2D tNear;
    void main() {
      ivec2 tiles = textureSize(tNear, 0), tile = ivec2(gl_FragCoord.xy);
      float reached = 0.0;
      for(int y=-${REACH}; y<=${REACH}; y++) for(int x=-${REACH}; x<=${REACH}; x++) {
        ivec2 at = tile + ivec2(x, y);
        if(any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, tiles))) continue;
        float near = texelFetch(tNear, at, 0).r;
        if(length(max(vec2(0.0), abs(vec2(x, y)) - 1.0) * ${TILE}.0) <= near) reached = max(reached, near)/*its nearest pixel within its circle of this tile's*/;
      }
      gl_FragColor = vec4(reached, 0.0, 0.0, 1.0);
    }`,
};

/** each pixel gathered over a disk as wide as its own circle or a near circle reaching
 *  it: a sample counts where its circle reaches the pixel, one behind the pixel no
 *  wider than the pixel's own, weighted by its circle's area (a wide circle spreads
 *  its light thin) */
const GATHER_SHADER = {
  uniforms: { tCircle: { value: null }, tReach: { value: null } },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */`
    uniform sampler2D tCircle; uniform sampler2D tReach;
    varying vec2 vUv;
    void main() {
      vec4 center = textureLod(tCircle, vUv, 0.0);
      float own = abs(center.a);
      float radius = max(own, texture2D(tReach, vUv).r);
      if(radius < 0.5) { gl_FragColor = vec4(center.rgb, 1.0); return; }
      vec2 texel = 1.0 / vec2(textureSize(tCircle, 0));
      float apart = radius * sqrt(3.14159265 / ${SAMPLES}.0);
      float level = max(0.0, log2(apart)), edge = max(0.5, 0.5 * apart);
      float least = (radius * radius) / ${SAMPLES}.0/*the area a sample stands for, over pi*/;
      float weight = 1.0 / max(own * own, least);
      vec3 sum = center.rgb * weight;
      float total = weight;
      for(int i=0; i<${SAMPLES}; i++) {
        float r = radius * sqrt((float(i) + 0.5) / ${SAMPLES}.0), turn = float(i) * 2.39996323/*the golden angle*/;
        vec4 taken = textureLod(tCircle, vUv + (vec2(cos(turn), sin(turn)) * r * texel), level);
        float size = (taken.a > center.a) ? min(abs(taken.a), own) : abs(taken.a);
        float counted = smoothstep(r - edge, r + edge, size) / max(size * size, least);
        sum += taken.rgb * counted;
        total += counted;
      }
      gl_FragColor = vec4(sum / total, 1.0);
    }`,
};

// == Depth of Field ==============================================================
export class DepthOfFieldPass extends Pass {
  private readonly depth = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private readonly depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, blending: THREE.NoBlending });
  /** the frame's color and circles, mipmapped so a sample reads as wide as it stands for */
  private readonly circles = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  private readonly near = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private readonly reach = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private readonly circle = new THREE.ShaderMaterial(CIRCLE_SHADER);
  private readonly nearMaterial = new THREE.ShaderMaterial(NEAR_SHADER);
  private readonly reachMaterial = new THREE.ShaderMaterial(REACH_SHADER);
  private readonly gather = new THREE.ShaderMaterial(GATHER_SHADER);
  private readonly quad = new FullScreenQuad();
  private readonly clearColor = new THREE.Color();
  /** the frame's height (pixels) */
  private height = 1;

  public constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {
    super();
    this.circle.uniforms.tDepth.value = this.depth.texture;
    this.nearMaterial.uniforms.tCircle.value = this.circles.texture;
    this.reachMaterial.uniforms.tNear.value = this.near.texture;
    this.gather.uniforms.tCircle.value = this.circles.texture;
    this.gather.uniforms.tReach.value = this.reach.texture;
  }

  /** focuses `distance` (studs along the view), a point infinitely far blurring
   *  `farShare` of the frame's height across */
  public focus(distance: number, farShare: number): void {
    const { uniforms } = this.circle;
    uniforms.focus.value = distance;
    uniforms.farBlur.value = (farShare * this.height) / 2;
    uniforms.mostBlur.value = this.height / 2/*a circle at most the frame's height across*/;
  }

  public setSize(width: number, height: number): void {
    this.height = height;
    this.depth.setSize(width, height);
    this.circles.setSize(width, height);
    const [across, down] = [Math.ceil(width / TILE), Math.ceil(height / TILE)];
    this.near.setSize(across, down);
    this.reach.setSize(across, down);
  }

  public render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    // the depth, the sky drawn as the far clear (its background is no surface)
    const [background, autoClear, clearAlpha] = [this.scene.background, renderer.autoClear, renderer.getClearAlpha()];
    renderer.getClearColor(this.clearColor);
    this.scene.overrideMaterial = this.depthMaterial;
    this.scene.background = null;
    renderer.autoClear = false;
    renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(this.depth);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.scene.background = background;
    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.autoClear = autoClear;

    // each pixel's circle, the near circles' reach, then the gather
    const { uniforms } = this.circle;
    [uniforms.nearClip.value, uniforms.farClip.value, uniforms.tColor.value] = [this.camera.near, this.camera.far, readBuffer.texture];
    this.draw(renderer, this.circle, this.circles);
    this.draw(renderer, this.nearMaterial, this.near);
    this.draw(renderer, this.reachMaterial, this.reach);
    this.draw(renderer, this.gather, this.renderToScreen ? null : writeBuffer);
  }

  public dispose(): void {
    for(const target of [this.depth, this.circles, this.near, this.reach]) target.dispose();
    for(const material of [this.depthMaterial, this.circle, this.nearMaterial, this.reachMaterial, this.gather]) material.dispose();
    this.quad.dispose();
  }

  // == Internal ==================================================================
  private draw(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }
}
