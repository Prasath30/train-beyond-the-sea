// Cel shading: every lit surface uses a small number of hard light bands.
import * as THREE from 'three';

let gradient;
export function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([60, 125, 195, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color, options = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...options });
}

// Glowing surfaces (lamps, lit windows) bloom because they exceed 1.0 in linear light.
export function glow(color, strength = 3) {
  const material = new THREE.MeshBasicMaterial({ color });
  material.color.multiplyScalar(strength);
  return material;
}

export function canvasTexture(width, height, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (repeat) texture.repeat.set(repeat[0], repeat[1]);
  return texture;
}

// Deterministic random numbers keep the scenery identical on every ride.
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared by the sky dome, the water and the distant hills, so reflections and haze
// always agree with the sky itself.
export const SKY_GLSL = /* glsl */`
uniform vec3 sunDir;
uniform float time;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
vec3 skyColor(vec3 d){
  float h = d.y;
  float sd = max(dot(d, sunDir), 0.);
  vec3 horizon = vec3(1.32, .76, .46), middle = vec3(.96, .55, .52), zenith = vec3(.22, .24, .50);
  vec3 c = mix(horizon, middle, smoothstep(-.02, .15, h));
  c = mix(c, zenith, smoothstep(.13, .65, h));
  c += vec3(1.1, .52, .2) * pow(sd, 6.) * .85 * (1. - smoothstep(0., .45, h));
  c += vec3(1.6, 1., .55) * pow(sd, 90.) * .7 + vec3(2., 1.3, .7) * pow(sd, 900.) * 1.5;
  c += vec3(9., 6.5, 4.) * smoothstep(.99962, .99978, sd);
  if (h > .012) {
    vec2 p = d.xz / (h + .12) * 1.25;
    float n = fbm(p + vec2(time * .004, 0.));
    float band = smoothstep(.015, .11, h) * (1. - smoothstep(.45, .85, h));
    float cloud = smoothstep(.52, .6, n) * band;
    float thick = smoothstep(.6, .78, n);
    vec3 lit = mix(vec3(.74, .52, .70), vec3(1.65, .86, .52), pow(sd, 2.5));
    vec3 shade = mix(vec3(.44, .35, .56), vec3(.86, .48, .46), pow(sd, 3.));
    vec3 cc = mix(lit, shade, thick * .7) + vec3(1.3, .62, .2) * pow(sd, 12.) * (1. - thick);
    c = mix(c, cc, cloud);
  }
  return c;
}`;
