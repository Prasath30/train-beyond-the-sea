// First-person passenger. Seated you can look around; standing you can walk the
// aisle, take another seat or step out through an open door.
import * as THREE from 'three';

const SEATED_EYE = 1.14, STANDING_EYE = 1.6, SPEED = 1.35;
const ease = t => t * t * (3 - 2 * t);

export function createPlayer(camera, dom, { areas, interactables, describe, act, onStep }) {
  const pose = { x: 0, y: SEATED_EYE, z: 0, yaw: 0, pitch: 0 };
  const keys = new Set();
  let mode = 'seated', seat = null, move = null, stride = 0, bob = 0, locked = false, walkHeld = false, current = null;
  const ray = new THREE.Raycaster(); ray.far = 2.6; ray.layers.enableAll();
  const forward = new THREE.Vector3();

  function sitAt(s, instant = false) {
    seat = s;
    // Settle in with the head turned a little toward the window.
    const target = { x: s.x, y: SEATED_EYE, z: s.z, yaw: s.yaw - s.side * .55 * (s.yaw ? -1 : 1) };
    if (instant) { Object.assign(pose, target); mode = 'seated'; return; }
    tween(target, 1.25, 'seated');
  }
  function stand() {
    if (mode !== 'seated' || !seat) return;
    tween({ x: 0, y: STANDING_EYE, z: seat.z + (seat.yaw ? .12 : -.12) }, 1.1, 'standing');
    seat = null;
  }
  function tween(target, duration, done) {
    move = { from: { ...pose }, to: target, t: 0, duration, done };
    mode = 'moving';
  }

  function inside(x, z) { return areas().some(a => x >= a[0] && x <= a[1] && z >= a[2] && z <= a[3]); }

  function interact() {
    if (mode === 'moving') return;
    if (mode === 'seated' && (!current || current.action !== 'door')) { stand(); return; }
    if (current) act(current, { sitAt, stand, pose });
  }

  // Desktop: pointer lock with mouse look. Touch: drag to look, tap to act, hold to walk.
  dom.addEventListener('click', () => {
    if (!locked && matchMedia('(pointer: fine)').matches) { dom.requestPointerLock?.()?.catch?.(() => {}); return; }
    if (locked) interact();
  });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === dom; });
  document.addEventListener('mousemove', e => { if (locked) look(e.movementX, e.movementY, .0021); });
  let touch = null;
  dom.addEventListener('touchstart', e => { const t = e.changedTouches[0]; touch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, time: performance.now() }; }, { passive: true });
  dom.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (touch && t.identifier === touch.id) { look(t.clientX - touch.x, t.clientY - touch.y, .0045); touch.x = t.clientX; touch.y = t.clientY; }
  }, { passive: true });
  dom.addEventListener('touchend', e => {
    for (const t of e.changedTouches) if (touch && t.identifier === touch.id) {
      if (Math.hypot(t.clientX - touch.sx, t.clientY - touch.sy) < 10 && performance.now() - touch.time < 350) interact();
      touch = null;
    }
  });
  addEventListener('keydown', e => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); interact(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function look(dx, dy, k) {
    pose.yaw -= dx * k; pose.pitch -= dy * k;
    pose.pitch = THREE.MathUtils.clamp(pose.pitch, -1.25, 1.2);
    if (mode === 'seated' && seat) {
      const rel = Math.atan2(Math.sin(pose.yaw - seat.yaw), Math.cos(pose.yaw - seat.yaw));
      pose.yaw = seat.yaw + THREE.MathUtils.clamp(rel, -2.1, 2.1);
      pose.pitch = THREE.MathUtils.clamp(pose.pitch, -.95, .75);
    }
  }

  function update(dt) {
    if (mode === 'moving') {
      move.t = Math.min(1, move.t + dt / move.duration);
      const k = ease(move.t);
      for (const key of ['x', 'z', 'y']) pose[key] = move.from[key] + (move.to[key] - move.from[key]) * k;
      if (move.to.yaw !== undefined) {
        const d = Math.atan2(Math.sin(move.to.yaw - move.from.yaw), Math.cos(move.to.yaw - move.from.yaw));
        pose.yaw = move.from.yaw + d * k;
      }
      // A little lift and dip as the body rises from or settles into a seat.
      pose.y += Math.sin(move.t * Math.PI) * .05;
      if (move.t >= 1) { mode = move.done; move = null; }
    } else if (mode === 'standing') {
      let ix = 0, iz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp') || walkHeld) iz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      const len = Math.hypot(ix, iz);
      if (len) {
        ix /= len; iz /= len;
        const s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
        const dx = (ix * c + iz * s) * SPEED * dt, dz = (-ix * s + iz * c) * SPEED * dt;
        if (inside(pose.x + dx, pose.z + dz)) { pose.x += dx; pose.z += dz; }
        else if (inside(pose.x + dx, pose.z)) pose.x += dx;
        else if (inside(pose.x, pose.z + dz)) pose.z += dz;
        const before = Math.floor(stride / Math.PI);
        stride += dt * 7.4;
        if (Math.floor(stride / Math.PI) !== before) onStep(pose);
        bob = Math.min(1, bob + dt * 4);
      } else bob = Math.max(0, bob - dt * 3);
    }
    camera.position.set(pose.x, pose.y + (mode === 'standing' ? Math.abs(Math.sin(stride)) * .028 * bob - .014 * bob : 0), pose.z);
    camera.position.x += Math.sin(stride * .5) * .012 * bob;
    camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');

    // What is the passenger looking at?
    camera.getWorldDirection(forward);
    ray.set(camera.position, forward);
    const hit = ray.intersectObjects(interactables(), false)[0];
    current = hit ? hit.object.userData : null;
    if (current && current.action === 'sit' && mode === 'seated') current = null;
    return describe(mode, current);
  }

  return {
    pose, sitAt, update, interact,
    get mode() { return mode; },
    get locked() { return locked; },
    setWalk(on) { walkHeld = on; },
  };
}
