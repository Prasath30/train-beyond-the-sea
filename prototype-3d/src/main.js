import * as THREE from 'three';
import { buildCarriage, bayCenter, CAR } from './carriage.js';
import { buildWorld } from './world.js';
import { createPipeline } from './post.js';
import { createPlayer } from './player.js';
import { createAudio } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe5a68c, 70, 1100);
const camera = new THREE.PerspectiveCamera(64, 1, .03, 9000);

// The sun sits low over the sea, ahead and to the left of the train.
const sunDir = new THREE.Vector3(-.8, .13, -.56).normalize();
const shared = { sunDir: { value: sunDir }, time: { value: 0 }, travel: { value: 0 } };

const sun = new THREE.DirectionalLight(0xffb27a, 3.6);
sun.position.copy(sunDir).multiplyScalar(45);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 100 });
sun.shadow.bias = -.0004; sun.shadow.normalBias = .025;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x9a8fd0, 0x6b4636, 1.05));

// Journey: cruise, announce the stop, brake smoothly, stop beside the platform.
const params = new URLSearchParams(location.search);
const STATION = 1150, CRUISE = 16, BRAKE = .85;
let travel = Number(params.get('at')) || 0, speed = 0;
const brakeFrom = STATION - CRUISE * CRUISE / (2 * BRAKE);

const car = buildCarriage(sunDir, shared);
scene.add(car.group);
const world = buildWorld(shared, STATION);
scene.add(world.group);
const pipeline = createPipeline(renderer, scene, camera);
const audio = createAudio();

const exitDoor = car.doors.find(d => d.s > 0 && d.e < 0);
let boarded = false, announced = false, arrived = false, lastJoint = Math.floor(travel / 25), jolt = 0;

const AISLE = [-.34, .34, -7.5, 7.5];
const VESTIBULES = [[-1.2, 1.2, -9.35, -7.5], [-1.2, 1.2, 7.5, 9.35]];
const DOORWAY = [.9, 1.95, -8.45, -7.75];
const PLATFORM = [1.75, 5.5, -30, 30];
const areas = () => exitDoor.open > .85 ? [AISLE, ...VESTIBULES, DOORWAY, PLATFORM] : [AISLE, ...VESTIBULES];

const player = createPlayer(camera, canvas, {
  areas,
  interactables: () => car.interactables,
  describe(mode, target) {
    if (mode === 'moving') return '';
    if (target?.action === 'door') {
      if (target.door !== exitDoor) return 'This door stays closed';
      if (!arrived) return 'Doors open at the next stop';
      return exitDoor.target ? '' : 'Open the door · E';
    }
    if (target?.action === 'sit' && mode === 'standing') return 'Sit down · E';
    if (mode === 'seated') return 'Stand up · E';
    return '';
  },
  act(target, api) {
    if (target.action === 'sit' && player.mode === 'standing') { api.sitAt(target.seat); audio.sit(); }
    else if (target.action === 'door' && target.door === exitDoor && arrived && !exitDoor.target) {
      exitDoor.target = 1; audio.door(); toast('Konoha', 'Mind the gap as you step down');
    } else if (player.mode === 'seated') api.stand();
  },
  onStep(pose) { audio.step(pose.x > 1.7 ? 'stone' : 'wood'); },
});
player.sitAt({ x: -.95, z: bayCenter(3) + .36, yaw: 0, side: -1 }, true);
player.pose.yaw = .95; player.pose.pitch = -.06;

let toastTimer;
function toast(title, line) {
  const el = $('toast');
  el.querySelector('strong').textContent = title; el.querySelector('span').textContent = line;
  el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5200);
}

$('board').addEventListener('click', async () => {
  boarded = true; document.body.classList.add('boarded');
  await audio.start();
  if (matchMedia('(pointer: fine)').matches) canvas.requestPointerLock?.()?.catch?.(() => {});
  setTimeout(() => { if (!announced) toast('海線 · Sea Line', 'Next stop, Konoha'); }, 900);
});
$('sound').addEventListener('click', e => {
  e.stopPropagation(); audio.setEnabled(!audio.enabled);
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  $('sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
});
const walk = $('walk');
walk.addEventListener('pointerdown', e => { e.preventDefault(); player.setWalk(true); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) walk.addEventListener(ev, () => player.setWalk(false));

function resize() {
  const w = innerWidth, h = innerHeight, ratio = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 1 ? 78 : 64; camera.updateProjectionMatrix();
  pipeline.resize(w, h, ratio);
}
addEventListener('resize', resize); resize();

if (params.has('debug')) window.rail = { THREE, scene, player, camera, car, get travel() { return travel; }, set travel(v) { travel = v; }, board: () => $('board').click() };
const timer = new THREE.Timer();
let elapsed = 0;
function frame(now) {
  timer.update(now);
  step(Math.min(timer.getDelta(), .05));
  requestAnimationFrame(frame);
}
function step(dt) {
  elapsed += dt;

  // Train motion
  // The title card holds a still moment; the ride starts when you board.
  if (boarded) {
    const allowed = Math.sqrt(Math.max(0, 2 * BRAKE * (STATION - travel)));
    speed = Math.min(CRUISE, allowed);
    travel = Math.min(STATION, travel + speed * dt);
    if (STATION - travel < .02) { travel = STATION; speed = 0; }
  } else speed = 0;
  if (!announced && travel >= brakeFrom - 120) { announced = true; audio.chime(); toast('次は 木ノ葉', 'Next stop, Konoha. Doors open on the right'); }
  if (!arrived && travel >= STATION) { arrived = true; audio.chime(); toast('木ノ葉 · Konoha', 'Walk to the front door on the right to get off'); }
  const joint = Math.floor(travel / 25);
  if (joint !== lastJoint && speed > .5) { lastJoint = joint; audio.joint(speed / CRUISE, Math.min(.5, 2.4 / speed)); jolt = speed / CRUISE; }
  audio.speed(speed / CRUISE);
  shared.time.value = elapsed; shared.travel.value = travel;
  world.update(travel);
  car.update(dt, elapsed);

  // Passenger
  const prompt = player.update(dt);
  $('prompt').textContent = prompt;
  $('prompt').classList.toggle('show', !!prompt && boarded);
  document.body.classList.toggle('standing', player.mode === 'standing');

  // The carriage sways, hums and kicks over each rail joint; standing still it rests.
  if (player.pose.x < CAR.halfW + .2) {
    const f = speed / CRUISE;
    jolt *= Math.exp(-dt * 9);
    camera.position.x += Math.sin(elapsed * 1.25) * .006 * f;
    camera.position.y += (Math.sin(elapsed * 23) * .0007 + Math.sin(elapsed * 2.1) * .0025) * f - jolt * .006;
    camera.rotation.z += Math.sin(elapsed * 1.25 + .6) * .0035 * f;
    // Leaning forward a little while the train brakes.
    if (travel > brakeFrom && speed > 0) camera.rotation.x -= .012 * Math.min(1, speed / 4);
  }

  pipeline.render(elapsed);
}
// ?debug: advance the simulation without relying on animation frames.
if (window.rail) window.rail.step = (seconds = 0, fps = 30) => { for (let i = 0; i < Math.max(1, seconds * fps); i++) step(1 / fps); };
requestAnimationFrame(frame);
