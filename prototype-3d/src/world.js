// Everything outside the car. The train stays at the origin and the world slides
// past it: an object at track position s sits at z = travelled - s.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, canvasTexture, random, SKY_GLSL } from './toon.js';

export const GROUND_Y = -1.2;
const CHUNK = 800;

function sky(shared) {
  const material = new THREE.ShaderMaterial({
    uniforms: { sunDir: shared.sunDir, time: shared.time },
    vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: SKY_GLSL + 'varying vec3 vDir;void main(){gl_FragColor=vec4(skyColor(normalize(vDir)),1.);}',
    side: THREE.BackSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), material);
  mesh.layers.set(1); mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}

// Flooded paddies near the line, a beach and then the sea toward the sunset.
function ground(shared) {
  const material = new THREE.ShaderMaterial({
    uniforms: { sunDir: shared.sunDir, time: shared.time, travel: shared.travel },
    vertexShader: 'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: SKY_GLSL + /* glsl */`
      uniform float travel;
      varying vec3 vWorld;
      vec3 water(vec3 V, vec3 n, vec3 deep){
        vec3 R = reflect(V, n); R.y = abs(R.y);
        float fres = .3 + .7 * pow(1. - max(dot(-V, n), 0.), 5.);
        return mix(deep, skyColor(R), fres);
      }
      void main(){
        vec3 P = vWorld;
        vec2 fp = vec2(P.x, travel - P.z);
        vec3 V = normalize(P - cameraPosition);
        float dist = length(P - cameraPosition);
        float shore = -185. + 22. * noise(vec2(fp.y * .004, 0.)) + 8. * noise(vec2(fp.y * .02, 3.));
        float ax = abs(P.x);
        vec3 col;
        if (P.x < shore - 10.) {
          vec2 w = fp * vec2(.06, .035);
          vec3 n = normalize(vec3((noise(w + time * .3) - .5) * .5 + (noise(w * 3.1 - time * .6) - .5) * .3, 1.,
                                  (noise(w.yx + time * .2) - .5) * .5 + (noise(w * 2.7 + time * .5) - .5) * .3));
          col = water(V, n, vec3(.08, .1, .2));
        } else if (P.x < shore) {
          col = mix(vec3(.62, .44, .36), vec3(.82, .6, .45), noise(fp * .3));
        } else if (ax < 3.1) {
          col = vec3(.3, .25, .25) * (.7 + .6 * noise(fp * 7.));
          float sleeper = step(.72, fract(fp.y / .6)) * step(ax, 1.3);
          col = mix(col, vec3(.2, .14, .12), sleeper * .8);
          float rail = 1. - smoothstep(.02, .05, abs(ax - .76));
          col = mix(col, vec3(.95, .7, .55), rail);
        } else if (ax < 7.) {
          col = vec3(.36, .42, .17) * (.8 + .4 * noise(fp * 1.3));
        } else {
          // Hand-laid paddies: warped, uneven plots rather than a perfect grid.
          vec2 wp = fp + vec2(noise(fp * .013), noise(fp * .013 + 5.)) * 14.;
          float colW = 26. + 18. * hash(vec2(floor(wp.y / 24.), 3.));
          vec2 cell = vec2(colW, 24.), q = wp / cell, f = fract(q), e = min(f, 1. - f) * cell;
          float edge = min(e.x, e.y), bank = .45 + .35 * noise(floor(q) * 1.7);
          float px = fwidth(edge);
          float isBank = 1. - smoothstep(bank - px, bank + px, edge);
          vec3 grass = vec3(.22, .27, .1) * (.8 + .4 * noise(fp * .9));
          vec3 n = normalize(vec3((noise(fp * .9 + time * .4) - .5) * .05, 1., (noise(fp.yx * .9 - time * .3) - .5) * .05));
          vec3 pond = water(V, n, vec3(.08, .065, .07));
          // Seedlings planted in rows along the line, patchy, fading out with distance.
          float rows = smoothstep(.55, .95, .5 + .5 * sin(fp.x * 20.9)) * step(.35, noise(fp * 2.3 + floor(q)));
          float sprout = mix(rows, .12, clamp(dist / 30., 0., 1.)) * (.5 + .5 * hash(floor(q)));
          pond = mix(pond, vec3(.2, .3, .1), sprout * .55);
          col = mix(pond, grass, isBank);
        }
        vec3 haze = skyColor(normalize(vec3(V.x, .015, V.z)));
        col = mix(col, haze, 1. - exp(-dist * .0008));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = GROUND_Y; mesh.receiveShadow = false;
  return mesh;
}

// Layered ridges: near ones green-blue and lit by the low sun, far ones lavender haze.
function ridges(shared) {
  const material = layer => new THREE.ShaderMaterial({
    uniforms: { sunDir: shared.sunDir, time: shared.time, layer: { value: layer } },
    vertexShader: 'attribute float top;varying float vTop;varying vec3 vWorld;void main(){vTop=top;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: SKY_GLSL + /* glsl */`
      uniform float layer;
      varying float vTop; varying vec3 vWorld;
      void main(){
        vec3 base = mix(mix(vec3(.13, .2, .22), vec3(.3, .32, .48), smoothstep(0., .5, layer)), vec3(.52, .48, .66), smoothstep(.5, 1., layer));
        base += vec3(.36, .14, .06) * pow(vTop, 6.) * (1. - layer * .5);
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 haze = skyColor(normalize(vec3(V.x, max(V.y, .012), V.z)));
        float aerial = clamp(.1 + .48 * layer + (1. - vTop) * .24, 0., .95);
        gl_FragColor = vec4(mix(base, haze, aerial), 1.);
      }`,
  });
  const strip = (x, length, low, high, seed, layer) => {
    const rng = random(seed), waves = [];
    for (let i = 0; i < 6; i++) waves.push([1 + Math.floor(rng() * (3 + i * 6)), rng() * 6.28, (1 / (1 + i)) * (.6 + rng() * .4)]);
    const n = 360, pos = [], top = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const z = -length / 2 + i * length / n, u = i / n;
      let h = 0; for (const [k, ph, a] of waves) h += Math.sin(u * k * Math.PI * 2 + ph) * a;
      const y = GROUND_Y + low + (high - low) * (.5 + .5 * Math.tanh(h * .9));
      pos.push(x, GROUND_Y - 6, z, x, y, z); top.push(0, 1);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('top', new THREE.Float32BufferAttribute(top, 1));
    g.setIndex(idx);
    const mat = material(layer); mat.side = THREE.DoubleSide;
    return { geometry: g, material: mat, length };
  };
  const layers = [
    strip(420, 3600, 10, 42, 11, 0), strip(760, 3600, 35, 105, 23, .45), strip(1250, 4800, 80, 190, 37, .85),
    strip(-2600, 4800, 6, 55, 51, 1),
  ];
  const group = new THREE.Group(), copies = [];
  for (const l of layers) for (let k = -1; k <= 1; k++) {
    const m = new THREE.Mesh(l.geometry, l.material); m.frustumCulled = false; m.renderOrder = -5;
    group.add(m); copies.push({ mesh: m, k, length: l.length });
  }
  return {
    group,
    update(travel) { for (const c of copies) c.mesh.position.z = (travel % c.length) + c.k * c.length; },
  };
}

// One 800 m stretch of countryside: telegraph poles, wires, houses, trees.
function chunk() {
  const rng = random(7);
  const parts = new Map();
  const put = (key, geometry, matrix) => { if (!parts.has(key)) parts.set(key, []); parts.get(key).push(geometry.clone().applyMatrix4(matrix)); };
  const m4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const roof = new THREE.ConeGeometry(.75, 1, 4, 1).rotateY(Math.PI / 4).translate(0, .5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const pole = new THREE.CylinderGeometry(.11, .14, 1, 6).translate(0, .5, 0);
  const wires = [];

  // Poles on the sunny side: their shadows sweep through the carriage.
  for (let z = 0; z > -CHUNK; z -= 40) {
    put('pole', pole, m4(-4.6, GROUND_Y, z, 1, 8.2, 1));
    put('pole', unitBox, m4(-4.6, GROUND_Y + 7.3, z, 1.9, .12, .14));
    for (const dx of [-.8, -.3, .3, .8]) put('insulator', unitBox, m4(-4.6 + dx, GROUND_Y + 7.42, z, .07, .14, .07));
    for (const dx of [-.8, -.3, .3, .8]) {
      const y0 = GROUND_Y + 7.55;
      for (let i = 0; i < 12; i++) {
        const a = i / 12, b = (i + 1) / 12, sag = t => -1.1 * 4 * t * (1 - t);
        wires.push(-4.6 + dx, y0 + sag(a), z - a * 40, -4.6 + dx, y0 + sag(b), z - b * 40);
      }
    }
  }
  const house = (x, z, big) => {
    const w = 5 + rng() * 4 + (big ? 3 : 0), d = 4.5 + rng() * 3, h = 3 + rng() * 1.6 + (big ? 2.6 : 0), ry = (rng() - .5) * .3;
    put(rng() < .5 ? 'wallCream' : 'wallWood', unitBox, m4(x, GROUND_Y, z, w, h, d, ry));
    put(rng() < .7 ? 'roofSlate' : 'roofRed', roof, m4(x, GROUND_Y + h, z, w * 1.32, 1.8 + rng() * .8, d * 1.32, ry));
    put('rim', unitBox, m4(x, GROUND_Y + h - .2, z, w * 1.02, .2, d * 1.02, ry));
    if (rng() < .55) {
      const side = x > 0 ? -1 : 1;
      put('window', unitBox, m4(x + side * (w / 2 + .02), GROUND_Y + 1.1 + rng() * .5, z + (rng() - .5) * d * .4, .05, .9, 1.2, ry));
    }
  };
  const tree = (x, z, s) => {
    put('trunk', pole, m4(x, GROUND_Y, z, s * 1.6, s * 3.2, s * 1.6));
    put(rng() < .5 ? 'leafA' : 'leafB', blob, m4(x, GROUND_Y + s * 4.2, z, s * 2.4, s * 2, s * 2.4));
    put(rng() < .5 ? 'leafB' : 'leafC', blob, m4(x + s * .9, GROUND_Y + s * 3.4, z + s * .5, s * 1.6, s * 1.4, s * 1.6));
  };
  for (let i = 0; i < 9; i++) {
    const cz = -rng() * CHUNK, cx = 40 + rng() * 240, n = 3 + Math.floor(rng() * 6);
    for (let j = 0; j < n; j++) house(cx + (rng() - .5) * 40, cz + (rng() - .5) * 50, rng() < .2);
    for (let j = 0; j < 4; j++) tree(cx + (rng() - .5) * 60, cz + (rng() - .5) * 70, .8 + rng() * .6);
  }
  for (let i = 0; i < 5; i++) {
    const cz = -rng() * CHUNK, cx = -40 - rng() * 100;
    for (let j = 0; j < 2 + rng() * 4; j++) house(cx + (rng() - .5) * 30, cz + (rng() - .5) * 40, false);
    for (let j = 0; j < 3; j++) tree(cx + (rng() - .5) * 40, cz + (rng() - .5) * 50, .9 + rng() * .5);
  }
  // A few trees right beside the line: they flicker the light inside the car.
  for (let i = 0; i < 7; i++) tree(-8 - rng() * 5, -rng() * CHUNK, 1 + rng() * .5);
  for (let i = 0; i < 40; i++) tree(320 + rng() * 120, -rng() * CHUNK, 1.5 + rng());

  const mats = {
    pole: toon(0x4b3a34), insulator: toon(0xe8e0d0), wallCream: toon(0xe9d9bc), wallWood: toon(0x8a5a3a),
    roofSlate: toon(0x3c4458), roofRed: toon(0x8b3b2e), rim: toon(0x2f2a2c), window: glow(0xffc070, 2.2),
    trunk: toon(0x4a3426), leafA: toon(0x3d5a2c), leafB: toon(0x557235), leafC: toon(0x2f4a2a),
  };
  const group = new THREE.Group();
  for (const [key, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[key]);
    mesh.castShadow = key !== 'window'; mesh.receiveShadow = true; group.add(mesh);
  }
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const wireLines = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2224 }));
  wireLines.layers.set(1); group.add(wireLines);
  return group;
}

// The Konoha halt: a wooden platform on the right-hand side of the train.
function station() {
  const group = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const stone = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#a98f80'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 * 32; x < w; x += 64) {
      c.fillStyle = `hsl(18 ${14 + Math.random() * 8}% ${54 + Math.random() * 10}%)`; c.fillRect(x + 1, y + 1, 62, 30);
    }
  }, [2, 16]);
  const wood = toon(0x7a4c2e), woodDark = toon(0x4a2c1c), roofTile = toon(0x8c3a2c), cloth = toon(0xf1e4cb);
  box(4.6, 1.23, 70, toon(0xffffff, { map: stone }), 3.95, GROUND_Y + .6, 0);
  box(.14, .02, 70, toon(0xf3eee2), 1.75, -.005, 0);
  box(.3, .02, 70, toon(0xe0b43a), 2.35, -.005, 0);
  // Shelter
  for (const z of [-6, -2, 2, 6]) for (const x of [4.3, 5.9]) box(.18, 2.7, .18, wood, x, 1.33, z);
  const roof = box(2.6, .1, 14.5, roofTile, 5.1, 2.78, 0); roof.rotation.z = -.12;
  box(2.2, .12, 14, woodDark, 5.1, 2.62, 0);
  box(.5, .06, 3, wood, 5.4, .46, 0); box(.08, .5, 3, wood, 5.62, .72, 0);
  for (const z of [-1.3, 1.3]) box(.45, .42, .08, woodDark, 5.4, .22, z);
  // Nameboard
  const board = canvasTexture(512, 192, (c, w, h) => {
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3b2a20'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#2b1e18'; c.font = '700 88px "Hiragino Mincho ProN", "Yu Mincho", serif'; c.textAlign = 'center'; c.fillText('木ノ葉', w / 2, 108);
    c.font = '600 30px Georgia, serif'; c.fillText('K O N O H A', w / 2, 160);
  });
  board.wrapS = board.wrapT = THREE.ClampToEdgeWrapping;
  for (const z of [-11.2, -8.8]) box(.12, 2.4, .12, woodDark, 3.2, 1.2, z);
  const sign = add(new THREE.BoxGeometry(.06, .9, 2.4), [toon(0xffffff, { map: board }), toon(0xffffff, { map: board }), woodDark, woodDark, woodDark, woodDark], 3.2, 1.9, -10);
  sign.castShadow = true;
  // Banners and lanterns: the leaf village is close.
  const banner = canvasTexture(128, 384, (c, w, h) => {
    c.fillStyle = '#a3302a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f3e7d0'; c.lineWidth = 7; c.beginPath();
    for (let a = 0; a < 11; a += .1) { const r = 3 + a * 3.2, x = w / 2 + Math.cos(a) * r, y = 150 + Math.sin(a) * r; a ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke(); c.beginPath(); c.moveTo(w / 2 + 30, 150); c.lineTo(w / 2 + 52, 120); c.stroke();
  });
  board.wrapS = THREE.ClampToEdgeWrapping;
  for (const z of [-5, 5]) {
    const b = add(new THREE.PlaneGeometry(.7, 2.1), toon(0xffffff, { map: banner, side: THREE.DoubleSide }), 4.25, 1.4, z);
    b.rotation.y = Math.PI / 2;
  }
  const lantern = glow(0xff6a3a, 2.6);
  for (const z of [-4, 0, 4]) {
    add(new THREE.SphereGeometry(.17, 16, 12), lantern, 4.6, 2.35, z).scale.set(1, 1.25, 1);
    const l = new THREE.PointLight(0xff9a60, 2.2, 6, 2); l.position.set(4.6, 2.2, z); group.add(l);
  }
  for (const z of [-16, 14]) {
    box(.1, 3.4, .1, woodDark, 3.0, 1.7, z);
    add(new THREE.CylinderGeometry(.2, .12, .26, 12), glow(0xffd9a0, 3), 3.0, 3.35, z);
  }
  // Fence along the back with the village beyond.
  for (let z = -34; z <= 34; z += 2) box(.1, 1.0, .1, wood, 6.2, .5, z);
  box(.06, .08, 70, wood, 6.2, .85, 0); box(.06, .08, 70, wood, 6.2, .45, 0);
  for (let i = 0; i < 18; i++) {
    const x = 12 + (i % 3) * 9 + Math.random() * 3, z = -40 + i * 5;
    box(6, 3.5 + (i % 4), 5, toon(i % 2 ? 0xe5d2b2 : 0xd9b99a), x, GROUND_Y + 2, z);
    const r = add(new THREE.ConeGeometry(4.8, 2, 4), roofTile, x, GROUND_Y + 4.6 + (i % 4), z); r.rotation.y = Math.PI / 4;
  }
  return group;
}

export function buildWorld(shared, stationAt) {
  const group = new THREE.Group();
  group.add(sky(shared), ground(shared));
  const hills = ridges(shared); group.add(hills.group);
  const base = chunk(), chunks = [base, base.clone(), base.clone()];
  chunks.forEach(c => group.add(c));
  const halt = station(); group.add(halt);
  return {
    group,
    update(travel) {
      hills.update(travel);
      const p = travel % CHUNK;
      chunks.forEach((c, k) => { c.position.z = p + (k - 1) * CHUNK; });
      halt.position.z = travel - stationAt;
    },
  };
}
