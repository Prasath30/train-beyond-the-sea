// A vintage Japanese seaside commuter car, built at human scale in metres.
// The car points down -z (direction of travel). y = 0 is the floor.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glow, canvasTexture } from './toon.js';

export const CAR = {
  halfW: 1.45, half: 9.6, wallTop: 2.05, peak: 2.45, sill: .85, windowTop: 1.75,
  bay: 1.8, bays: 8, saloon: 7.2, partition: 7.4, doorZ: 8.1, doorW: 1.0, doorH: 1.95,
};
export const bayCenter = i => -CAR.saloon + CAR.bay / 2 + i * CAR.bay;
const T = .08; // wall thickness
const ARCH_R = (CAR.halfW ** 2 + (CAR.peak - CAR.wallTop) ** 2) / (2 * (CAR.peak - CAR.wallTop));
const ARCH_CY = CAR.peak - ARCH_R;
export const ceilingAt = x => ARCH_CY + Math.sqrt(ARCH_R * ARCH_R - x * x);

function materials() {
  const grain = (base, dark, light) => canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = Math.random() < .5 ? dark : light; c.globalAlpha = .08 + Math.random() * .12;
      c.lineWidth = .6 + Math.random() * 1.6; c.beginPath();
      const x = Math.random() * w;
      c.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) c.lineTo(x + Math.sin(y * .03 + i) * 4, y);
      c.stroke();
    }
  });
  const planks = canvasTexture(512, 512, (c, w, h) => {
    const n = 6, pw = w / n;
    for (let i = 0; i < n; i++) {
      const tone = 60 + Math.random() * 18;
      c.fillStyle = `hsl(24 ${48 + Math.random() * 10}% ${tone * .42}%)`; c.fillRect(i * pw, 0, pw, h);
      c.globalAlpha = .14; c.strokeStyle = '#2a140a';
      for (let g = 0; g < 9; g++) { c.beginPath(); const x = i * pw + Math.random() * pw; c.moveTo(x, 0); c.lineTo(x + 3, h); c.stroke(); }
      c.globalAlpha = 1; c.fillStyle = '#2a160c'; c.fillRect(i * pw, 0, 2, h);
      const joint = Math.random() * h; c.fillRect(i * pw, joint, pw, 2);
    }
  }, [1, 7]);
  const moquette = canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#7d1e2c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = Math.random() < .5 ? '#5e1320' : '#963544'; c.globalAlpha = .35;
      c.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
  }, [2, 2]);
  const net = canvasTexture(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = '#d8c7a0'; c.lineWidth = 3;
    for (let i = 0; i <= w; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
  }, [3, 120]);
  return {
    wood: toon(0xffffff, { map: grain('#9b5a2e', '#4d2410', '#c98a4f') }),
    woodDark: toon(0xffffff, { map: grain('#5f3218', '#2b1408', '#8a5130') }),
    floor: toon(0xffffff, { map: planks }),
    seat: toon(0xffffff, { map: moquette }),
    ceiling: toon(0xf1e6cc, { side: THREE.DoubleSide }),
    metal: toon(0xd8c69b),
    brass: toon(0xe0b266),
    strap: toon(0xefe4cc),
    extLow: toon(0x6e2331),
    extHigh: toon(0xeadcbf),
    roof: toon(0x6f727b, { side: THREE.DoubleSide }),
    under: toon(0x2a2422),
    rubber: toon(0x2b2422),
    net: toon(0xffffff, { map: net, alphaTest: .5, side: THREE.DoubleSide }),
    lamp: glow(0xffe2b0, 3.2),
    glass: new THREE.MeshBasicMaterial({ color: 0xfff1df, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }),
  };
}

function arch({ r, cy, half, z0, z1, segs = 28, inward = true }) {
  const a = Math.asin(half / r), pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = -a + 2 * a * i / segs, x = r * Math.sin(t), y = cy + r * Math.cos(t), k = inward ? -1 : 1;
    for (const z of [z0, z1]) { pos.push(x, y, z); nor.push(Math.sin(t) * k, Math.cos(t) * k, 0); uv.push(i / segs, z === z0 ? 0 : 1); }
  }
  for (let i = 0; i < segs; i++) {
    const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
    if (inward) idx.push(a0, a1, b0, b0, a1, b1); else idx.push(a0, b0, a1, b0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function archShape(hole) {
  const s = new THREE.Shape(), a = Math.asin(CAR.halfW / ARCH_R);
  s.moveTo(-CAR.halfW, 0); s.lineTo(-CAR.halfW, CAR.wallTop);
  for (let i = 0; i <= 20; i++) { const t = -a + 2 * a * i / 20; s.lineTo(ARCH_R * Math.sin(t), ARCH_CY + ARCH_R * Math.cos(t)); }
  s.lineTo(CAR.halfW, 0);
  if (hole === 'doorway') { s.lineTo(.45, 0); s.lineTo(.45, 2.0); s.lineTo(-.45, 2.0); s.lineTo(-.45, 0); }
  s.lineTo(-CAR.halfW, 0);
  if (hole === 'window') {
    const h = new THREE.Path(); h.moveTo(-.4, 1.05); h.lineTo(.4, 1.05); h.lineTo(.4, 1.8); h.lineTo(-.4, 1.8); h.lineTo(-.4, 1.05);
    s.holes.push(h);
  }
  return s;
}

// Sunbeams: a prism from each sunlit window to wherever the light lands.
function sunShaft(z0, z1, light) {
  const corners = [[z0, CAR.sill + .02], [z1, CAR.sill + .02], [z1, CAR.windowTop - .02], [z0, CAR.windowTop - .02]];
  const near = [], far = [];
  for (const [z, y] of corners) {
    const p = new THREE.Vector3(-CAR.halfW, y, z);
    const s = Math.min((CAR.halfW - p.x) / light.x, p.y / -light.y);
    near.push(p); far.push(p.clone().addScaledVector(light, s));
  }
  const pos = [], fade = [];
  const quad = (a, b, c, d, ta, tb, tc, td) => {
    pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
    fade.push(ta, tb, tc, ta, tc, td);
  };
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(near[i], near[j], far[j], far[i], 0, 0, 1, 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
  return g;
}

export function buildCarriage(sunDir, shared) {
  const M = materials();
  const group = new THREE.Group();
  const interactables = [];
  const add = (geo, mat, x, y, z, parent = group, shadows = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = shadows; parent.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);

  // Floor, under-frame and roof
  const floor = add(new THREE.PlaneGeometry(CAR.halfW * 2, CAR.half * 2), M.floor, 0, 0, 0);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  box(CAR.halfW * 2 + .16, .9, CAR.half * 2 - .4, M.under, 0, -.46, 0);
  add(arch({ r: ARCH_R, cy: ARCH_CY, half: CAR.halfW, z0: -CAR.half, z1: CAR.half }), M.ceiling, 0, 0, 0);
  add(arch({ r: ARCH_R + .07, cy: ARCH_CY, half: CAR.halfW + T, z0: -CAR.half, z1: CAR.half, inward: false }), M.roof, 0, .01, 0);
  for (let i = 0; i <= CAR.bays; i++) {
    const z = -CAR.saloon + i * CAR.bay;
    add(arch({ r: ARCH_R - .025, cy: ARCH_CY, half: CAR.halfW - .02, z0: z - .035, z1: z + .035, segs: 24 }), M.woodDark, 0, 0, 0);
  }

  // Side walls: windows along the saloon, sliding doors in each vestibule.
  const wall = (s, z0, z1, y0, y1) => {
    const ext = y1 <= CAR.sill + .01 ? M.extLow : M.extHigh;
    const mats = s < 0 ? [M.wood, ext, M.wood, M.wood, M.wood, M.wood] : [ext, M.wood, M.wood, M.wood, M.wood, M.wood];
    const m = new THREE.Mesh(new THREE.BoxGeometry(T, y1 - y0, z1 - z0), mats);
    m.position.set(s * (CAR.halfW + T / 2), (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true; group.add(m);
  };
  const solid = (s, z0, z1) => { wall(s, z0, z1, 0, CAR.sill); wall(s, z0, z1, CAR.sill, CAR.wallTop); };
  const windows = [];
  for (const s of [-1, 1]) {
    const d0 = CAR.doorZ - CAR.doorW / 2, d1 = CAR.doorZ + CAR.doorW / 2;
    solid(s, -CAR.half, -d1); solid(s, -d0, -CAR.saloon); solid(s, CAR.saloon, d0); solid(s, d1, CAR.half);
    wall(s, -d1, -d0, CAR.doorH, CAR.wallTop); wall(s, d0, d1, CAR.doorH, CAR.wallTop);
    wall(s, -CAR.saloon, CAR.saloon, 0, CAR.sill); wall(s, -CAR.saloon, CAR.saloon, CAR.windowTop, CAR.wallTop);
    let last = -CAR.saloon;
    for (let i = 0; i < CAR.bays; i++) {
      const c = bayCenter(i);
      wall(s, last, c - .6, CAR.sill, CAR.windowTop); last = c + .6;
      windows.push({ s, c });
      const inner = s * (CAR.halfW - .02);
      box(.17, .035, 1.26, M.metal, s * (CAR.halfW - .06), CAR.sill + .017, c);
      box(.04, .9, .035, M.metal, inner, (CAR.sill + CAR.windowTop) / 2, c - .6);
      box(.04, .9, .035, M.metal, inner, (CAR.sill + CAR.windowTop) / 2, c + .6);
      box(.04, .035, 1.2, M.metal, inner, CAR.windowTop - .017, c);
      box(.05, .04, 1.2, M.metal, s * (CAR.halfW - .01), 1.52, c);
      const pane = add(new THREE.PlaneGeometry(1.2, .22), M.glass, s * (CAR.halfW + .01), 1.635, c, group, false);
      pane.rotation.y = Math.PI / 2; pane.layers.set(1);
    }
    wall(s, last, CAR.saloon, CAR.sill, CAR.windowTop);
  }

  // Partitions between saloon and vestibules, and the two car ends.
  const extrude = (shape, z, mat) => {
    const m = add(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false }), mat, 0, 0, z - T / 2);
    return m;
  };
  extrude(archShape('doorway'), -CAR.partition, M.wood);
  extrude(archShape('doorway'), CAR.partition, M.wood);
  extrude(archShape('window'), -CAR.half, M.woodDark);
  extrude(archShape('window'), CAR.half, M.woodDark);

  // A route map above each doorway: every station is an anime.
  const routeMap = canvasTexture(1024, 160, (c, w, h) => {
    c.fillStyle = '#f3ead6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3d2b22'; c.font = '600 26px Georgia, serif'; c.fillText('海線  Sea Line', 30, 42);
    const stops = [['木ノ葉', 'Konoha'], ['麦わら', 'Grand Line'], ['シガンシナ', 'Shiganshina'], ['呪術高専', 'Jujutsu High']];
    c.strokeStyle = '#2f6d74'; c.lineWidth = 8; c.beginPath(); c.moveTo(60, 100); c.lineTo(w - 60, 100); c.stroke();
    stops.forEach(([jp, en], i) => {
      const x = 120 + i * 260;
      c.fillStyle = i === 0 ? '#b4442c' : '#f3ead6'; c.strokeStyle = '#2f6d74'; c.lineWidth = 6;
      c.beginPath(); c.arc(x, 100, 14, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#3d2b22'; c.font = '24px "Hiragino Mincho ProN", serif'; c.fillText(jp, x - 40, 76);
      c.font = 'italic 19px Georgia, serif'; c.fillText(en, x - 40, 142);
    });
  });
  routeMap.wrapS = routeMap.wrapT = THREE.ClampToEdgeWrapping;
  for (const z of [-CAR.partition + T / 2 + .005, CAR.partition - T / 2 - .005]) {
    const m = add(new THREE.PlaneGeometry(1.6, .25), toon(0xffffff, { map: routeMap }), 0, 2.13, z, group, false);
    if (z > 0) m.rotation.y = Math.PI;
  }

  // Seats: facing pairs in each bay, with grab handles at the aisle corner.
  const cushion = new RoundedBoxGeometry(.95, .14, .47, 3, .05);
  const back = new RoundedBoxGeometry(.95, .64, .13, 3, .05);
  const arm = new RoundedBoxGeometry(.06, .2, .46, 2, .025);
  const handle = new THREE.CylinderGeometry(.014, .014, .2, 8);
  for (let i = 0; i < CAR.bays; i++) {
    const c = bayCenter(i);
    for (const s of [-1, 1]) for (const f of [1, -1]) {
      const x = s * .95;
      const seat = add(cushion, M.seat, x, .45, c + f * .4);
      seat.userData = { action: 'sit', seat: { x, z: c + f * .36, yaw: f > 0 ? 0 : Math.PI, side: s } };
      interactables.push(seat);
      const b = add(back, M.seat, x, .84, c + f * .72); b.rotation.x = f * .12;
      box(.89, .38, .42, M.woodDark, x, .19, c + f * .4);
      add(arm, M.wood, s * .49, .6, c + f * .4);
      const h = add(handle, M.metal, s * .56, 1.19, c + f * .77); h.rotation.z = Math.PI / 2;
    }
  }

  // Luggage racks, hanging straps and ceiling lamps.
  const rod = (x, y, len, mat) => { const m = add(new THREE.CylinderGeometry(.012, .012, len, 8), mat, x, y, 0); m.rotation.x = Math.PI / 2; return m; };
  for (const s of [-1, 1]) {
    rod(s * 1.1, 1.99, CAR.saloon * 2, M.metal);
    rod(s * .62, 2.13, CAR.saloon * 2, M.metal);
    const rack = add(new THREE.PlaneGeometry(.33, CAR.saloon * 2), M.net, s * 1.28, 1.97, 0, group, true);
    rack.rotation.x = -Math.PI / 2;
    for (let i = 0; i <= CAR.bays; i++) box(.36, .03, .03, M.metal, s * 1.29, 1.98, -CAR.saloon + i * CAR.bay);
    for (let z = -CAR.saloon + .35; z < CAR.saloon; z += .45) {
      box(.008, .2, .026, M.strap, s * .62, 2.02, z);
      const ring = add(new THREE.TorusGeometry(.065, .012, 8, 24), M.strap, s * .62, 1.86, z);
      ring.rotation.y = Math.PI / 2;
    }
  }
  const lights = [];
  for (let i = 0; i < CAR.bays; i++) {
    const c = bayCenter(i);
    add(new THREE.CylinderGeometry(.19, .21, .05, 24), M.brass, 0, ceilingAt(0) - .03, c, group, false);
    add(new THREE.CylinderGeometry(.16, .16, .02, 24), M.lamp, 0, ceilingAt(0) - .065, c, group, false);
  }
  for (const z of [-5.4, 0, 5.4]) {
    const l = new THREE.PointLight(0xffc98a, 1.6, 7, 2); l.position.set(0, 2.15, z); group.add(l); lights.push(l);
  }

  // Vestibule sliding doors. They run along the outside of the body.
  const doors = [];
  for (const s of [-1, 1]) for (const e of [-1, 1]) {
    const leaf = new THREE.Group();
    const dw = CAR.doorW + .04, x = 0;
    box(dw, 1.0, .04, M.extHigh, x, .5, 0, leaf);
    box(dw, .2, .04, M.extHigh, x, CAR.doorH - .1, 0, leaf);
    box(.14, .75, .04, M.extHigh, x - dw / 2 + .07, 1.375, 0, leaf);
    box(.14, .75, .04, M.extHigh, x + dw / 2 - .07, 1.375, 0, leaf);
    box(.025, .3, .05, M.metal, x - dw / 2 + .1, 1.0, 0, leaf);
    const pane = add(new THREE.PlaneGeometry(dw - .28, .75), M.glass, x, 1.375, 0, leaf, false); pane.layers.set(1);
    leaf.rotation.y = Math.PI / 2;
    leaf.position.set(s * (CAR.halfW + T + .03), 0, e * CAR.doorZ);
    group.add(leaf);
    const door = { leaf, s, e, open: 0, target: 0, z0: e * CAR.doorZ };
    leaf.children.forEach(m => { m.userData = { action: 'door', door }; interactables.push(m); });
    doors.push(door);
  }

  // Sunbeams and floating dust, both on layer 1 so they skip the outline pass.
  const light = sunDir.clone().negate();
  const shaftMaterial = new THREE.ShaderMaterial({
    uniforms: { time: shared.time },
    vertexShader: 'attribute float fade;varying float vFade;varying vec3 vP;void main(){vFade=fade;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float time;varying float vFade;varying vec3 vP;void main(){float a=.05*(1.-vFade*.75)*(.85+.15*sin(time*.7+vP.z*1.3));gl_FragColor=vec4(vec3(1.,.68,.38)*a,a);}',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shafts = [];
  for (const w of windows.filter(w => w.s < 0)) {
    const m = new THREE.Mesh(sunShaft(w.c - .6, w.c + .6, light), shaftMaterial);
    m.layers.set(1); m.renderOrder = 5; group.add(m); shafts.push(m);
  }
  const dustCount = 420, dust = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dust[i * 3] = (Math.random() * 2 - 1) * 1.3; dust[i * 3 + 1] = .3 + Math.random() * 1.9; dust[i * 3 + 2] = (Math.random() * 2 - 1) * 7;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: canvasTexture(32, 32, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, '#fff'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fillRect(0, 0, w, w); }), color: 0xffd9a8, size: .007, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.layers.set(1); group.add(motes);

  function update(dt, t, open) {
    for (const d of doors) {
      d.open += (d.target - d.open) * (1 - Math.exp(-dt * 2.4));
      // Each leaf slides toward the car end, over the pocket wall.
      d.leaf.position.z = d.z0 + d.e * d.open * (CAR.doorW + .06);
    }
    const p = dustGeo.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      p.array[i * 3 + 1] += Math.sin(t * .4 + i) * .0009;
      p.array[i * 3] += Math.cos(t * .3 + i * 1.7) * .0006;
    }
    p.needsUpdate = true;
  }

  return { group, interactables, doors, lights, update };
}
