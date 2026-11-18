// Vehicles: box-built cars (body, cabin, wheels, lights), traffic that
// drives the street grid, and the arcade driving model for the player.
// A car is a THREE.Group with userData { heading, speed, kind }.

import * as THREE from 'three';
import { CFG, COLOURS } from './config.js';
import { isRoad, resolveCircle } from './city.js';

const wheelGeo = new THREE.BoxGeometry(0.35, 0.7, 0.7);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

export function createCarMesh(kind, color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const isTruck = kind === 'truck';
  const isSport = kind === 'sport';
  const bodyLen = isTruck ? 5.6 : isSport ? 4.4 : 4.6;
  const bodyH = isTruck ? 1.5 : 0.75;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, bodyH, bodyLen), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, isTruck ? 0.9 : 0.65, isTruck ? 1.4 : 2.2),
    isTruck ? bodyMat : glassMat,
  );
  cabin.position.set(0, bodyH + 0.45, isTruck ? 1.2 : -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  // Headlights and tail lights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x555533 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x330000 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), lightMat);
    hl.position.set(sx, 0.7, bodyLen / 2);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1), tailMat);
    tl.position.set(sx, 0.7, -bodyLen / 2);
    group.add(tl);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.25, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xf7c948, emissive: 0x444422 }),
    );
    sign.position.set(0, bodyH + 0.9, -0.2);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2233cc, emissive: 0x111133 }),
    );
    bar.position.set(0, bodyH + 0.85, -0.2);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  // Four wheels as one dark box each; cheap and reads fine at street level.
  for (const [wx, wz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.35, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }
  group.userData.kind = kind;
  group.userData.length = bodyLen;
  return group;
}

export function randomCarColor(rng) {
  return rng.pick(COLOURS.car);
}

// --- Traffic: cars that follow the street grid ---------------------------

export class Traffic {
  constructor(scene, colliders, rng) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = rng;
    this.cars = [];
    const kinds = ['sedan', 'sedan', 'sedan', 'sport', 'truck', 'taxi'];
    for (let i = 0; i < CFG.traffic.count; i++) {
      const kind = kinds[Math.floor(rng.next() * kinds.length)];
      const color = kind === 'taxi' ? COLOURS.taxi : randomCarColor(rng);
      const mesh = createCarMesh(kind, color);
      const street = CFG.streets[Math.floor(rng.next() * CFG.streets.length)];
      const along = rng.range(-230, 230);
      const horizontal = rng.chance(0.5);
      const x = horizontal ? along : street;
      const z = horizontal ? street : along;
      mesh.position.set(x, 0, z);
      // Forward is (sin heading, cos heading): +x travel is heading PI/2.
      const heading = horizontal
        ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
        : (rng.chance(0.5) ? 0 : Math.PI);
      mesh.rotation.y = heading;
      scene.add(mesh);
      this.cars.push({
        mesh,
        speed: rng.range(CFG.traffic.speedMin, CFG.traffic.speedMax),
        heading,
        axis: horizontal ? 'x' : 'z',
        dir: horizontal ? Math.sign(Math.sin(heading)) : Math.sign(Math.cos(heading)),
        wait: 0,
      });
    }
  }

  // Pick the nearest drivable car to a point (for stealing), within range.
  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.mesh.position.x - x, car.mesh.position.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  addCar(car) {
    this.cars.push(car);
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      if (car === playerCar) continue;
      if (!car.axis) continue; // parked / mission cars have no route yet
      const p = car.mesh.position;
      // Slow for a car ahead on the same street.
      let ahead = false;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.mesh.position.x - p.x;
        const dz = other.mesh.position.z - p.z;
        const forward = car.axis === 'x' ? dx * car.dir : dz * car.dir;
        const lateral = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
        if (forward > 0 && forward < 9 && lateral < 3) {
          ahead = true;
          break;
        }
      }
      const target = ahead ? 0 : car.speed;
      car.current = (car.current ?? car.speed) + (target - (car.current ?? car.speed)) * Math.min(1, dt * 2);
      const step = car.current * dt;
      if (car.axis === 'x') p.x += step * car.dir;
      else p.z += step * car.dir;
      // At a street end or an intersection, sometimes turn.
      const atEnd = Math.abs(p.x) > 244 || Math.abs(p.z) > 244;
      const nearJunction = CFG.streets.some((s) => Math.abs((car.axis === 'x' ? p.x : p.z) - s) < 1.2);
      if ((atEnd || (nearJunction && this.rng.chance(dt * 0.25))) && car.current > 1) {
        const otherAxis = car.axis === 'x' ? 'z' : 'x';
        const cross = CFG.streets.reduce((a, s) => (Math.abs(s - (car.axis === 'x' ? p.z : p.x)) < Math.abs(a - (car.axis === 'x' ? p.z : p.x)) ? s : a), CFG.streets[0]);
        if (car.axis === 'x') p.z = cross;
        else p.x = cross;
        car.axis = otherAxis;
        car.dir = this.rng.chance(0.5) ? 1 : -1;
        car.heading = otherAxis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
        car.mesh.rotation.y = car.heading;
      }
      resolveCircle(this.colliders, p, 1.4);
    }
  }
}

// --- Player driving -------------------------------------------------------

export function driveCar(car, steerInput, throttle, brake, dt, colliders, onCrash) {
  const p = car.mesh.position;
  const state = car.drive || (car.drive = { speed: 0 });
  const onRoad = isRoad(p.x, p.z);
  const maxSpeed = onRoad ? CFG.car.maxSpeed : CFG.car.offRoadMax;
  if (throttle > 0) state.speed += CFG.car.accel * throttle * dt;
  if (brake > 0) state.speed -= CFG.car.brake * brake * dt;
  if (throttle < 0) state.speed += CFG.car.reverseAccel * throttle * dt;
  // Drag and rolling resistance.
  state.speed -= state.speed * 0.6 * dt;
  state.speed = Math.max(-CFG.car.maxReverse, Math.min(maxSpeed, state.speed));
  if (Math.abs(state.speed) < 0.05 && throttle === 0) state.speed = 0;
  // Steering only bites while moving; sharper at low speed.
  const steerAmount = steerInput * CFG.car.steer * dt * Math.min(1, Math.abs(state.speed) / 8 + 0.3) * Math.sign(state.speed || 1);
  car.heading -= steerAmount;
  car.mesh.rotation.y = car.heading;
  const nx = p.x + Math.sin(car.heading) * state.speed * dt;
  const nz = p.z + Math.cos(car.heading) * state.speed * dt;
  const before = { x: p.x, z: p.z };
  p.x = nx;
  p.z = nz;
  if (resolveCircle(colliders, p, CFG.car.radius)) {
    // A scrape: kill most of the speed and report the crash once.
    const lost = Math.abs(state.speed);
    state.speed *= 0.25;
    if (lost > 6 && onCrash) onCrash(lost);
  }
  return { speed: state.speed, crashed: Math.hypot(p.x - before.x, p.z - before.z) < Math.abs(state.speed) * dt * 0.5 };
}
