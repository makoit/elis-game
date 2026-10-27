import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Letzter Pass (nach Tonemapping, sRGB): Speed-Radialblur, Farbsaum bei Boost, Vignette, leichtes Color-Grading.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    blur: { value: 0 },
    aberr: { value: 0 },
    vig: { value: 0.32 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float blur, aberr, vig;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - vec2(0.5, 0.46);
      float r = length(d);
      vec2 dir = d * blur * smoothstep(0.12, 0.75, r);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        vec2 o = dir * (float(i) / 5.0);
        vec2 ab = d * aberr * r;
        col += vec3(texture2D(tDiffuse, vUv - o + ab).r, texture2D(tDiffuse, vUv - o).g, texture2D(tDiffuse, vUv - o - ab).b);
      }
      col /= 6.0;
      // Color-Grading: etwas Kontrast + Sättigung, warme Lichter / kühle Schatten
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.12);
      col = (col - 0.5) * 1.06 + 0.5;
      col += vec3(0.012, 0.0, -0.01) * smoothstep(0.4, 1.0, l) - vec3(0.01, 0.0, -0.012) * (1.0 - smoothstep(0.0, 0.4, l));
      col *= 1.0 - vig * smoothstep(0.35, 0.95, r * 1.35);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// Nachbearbeitung für das Rennen – nur in der hohen Qualitätsstufe.
export class PostFX {
  constructor(renderer, scene, camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(1);
    this.composer.setSize(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 0.9);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.final);
    this.renderer = renderer;
    this.k = 0; // geglättete Geschwindigkeits-Intensität (0..1)
    this.boost = 0;
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
  }

  render(dt, speed, boosting) {
    const u = this.final.uniforms;
    const target = Math.min(1, Math.max(0, (speed - 8) / 22));
    this.k += (target - this.k) * Math.min(1, dt * 3);
    this.boost += ((boosting ? 1 : 0) - this.boost) * Math.min(1, dt * 6);
    u.blur.value = 0.035 * this.k + 0.05 * this.boost;
    u.aberr.value = 0.004 * this.boost;
    this.bloom.strength = 0.32 + 0.25 * this.boost;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
    this.bloom.dispose();
  }
}
