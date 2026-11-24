// Anime finish: ink outlines from depth and normals, bloom on the sun and lamps,
// then a warm grade with cool shadows, a vignette and faint film grain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const quadVertex = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

export function createPipeline(renderer, scene, camera) {
  const size = new THREE.Vector2();
  const colorTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  colorTarget.depthTexture = new THREE.DepthTexture(1, 1);
  const normalTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const normalMaterial = new THREE.MeshNormalMaterial();

  const outline = new ShaderPass({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null },
      texel: { value: new THREE.Vector2() }, cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
    },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */`
      #include <packing>
      uniform sampler2D tColor, tDepth, tNormal;
      uniform vec2 texel; uniform float cameraNear, cameraFar;
      varying vec2 vUv;
      float viewDepth(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
      vec3 normalAt(vec2 uv){ return texture2D(tNormal, uv).xyz * 2. - 1.; }
      void main(){
        vec3 col = texture2D(tColor, vUv).rgb;
        float d = viewDepth(vUv);
        vec3 n = normalAt(vUv);
        float de = 0., ne = 0.;
        vec2 o[4];
        o[0] = vec2(texel.x, 0.); o[1] = vec2(-texel.x, 0.); o[2] = vec2(0., texel.y); o[3] = vec2(0., -texel.y);
        for (int i = 0; i < 4; i++) {
          de = max(de, (viewDepth(vUv + o[i]) - d) / d);
          ne = max(ne, 1. - dot(n, normalAt(vUv + o[i])));
        }
        float edge = max(smoothstep(.035, .08, de), smoothstep(.3, .55, ne));
        edge *= 1. - smoothstep(18., 120., d);
        vec3 ink = col * vec3(.3, .22, .24);
        gl_FragColor = vec4(mix(col, ink, edge * .9), 1.);
      }`,
  });

  // ShaderPass clones its uniforms, and render-target textures can't be cloned.
  outline.uniforms.tColor.value = colorTarget.texture;
  outline.uniforms.tDepth.value = colorTarget.depthTexture;
  outline.uniforms.tNormal.value = normalTarget.texture;

  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
    vertexShader: quadVertex,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(.2126, .7152, .0722));
        c = mix(vec3(l), c, 1.1);
        c *= mix(vec3(.9, .9, 1.06), vec3(1.05, 1., .93), smoothstep(0., .9, l));
        vec2 q = vUv - .5; c *= 1. - dot(q, q) * .6;
        float g = fract(sin(dot(vUv * vec2(1317., 911.) + fract(time), vec2(12.9898, 78.233))) * 43758.5453);
        c += (g - .5) * .016 * (.4 + l);
        gl_FragColor = vec4(max(c, 0.), 1.);
      }`,
  });

  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .38, .5, 1.7);
  composer.addPass(outline); composer.addPass(bloom); composer.addPass(grade); composer.addPass(new OutputPass());

  function resize(width, height, ratio) {
    const w = Math.floor(width * ratio), h = Math.floor(height * ratio);
    colorTarget.setSize(w, h); normalTarget.setSize(w, h);
    composer.setPixelRatio(ratio); composer.setSize(width, height);
    const thickness = Math.max(1, ratio * .85);
    outline.uniforms.texel.value.set(thickness / w, thickness / h);
    size.set(w, h);
  }

  function render(time) {
    // Normals for the outline pass; sky, glass, beams and dust are on layer 1 and skipped.
    renderer.shadowMap.needsUpdate = false;
    scene.overrideMaterial = normalMaterial; camera.layers.set(0);
    renderer.setRenderTarget(normalTarget); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, camera);
    scene.overrideMaterial = null; camera.layers.enableAll();
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(colorTarget); renderer.setClearColor(0x000000, 1); renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    grade.uniforms.time.value = time;
    composer.render();
  }

  return { resize, render };
}
