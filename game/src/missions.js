// The story: six missions from Maya, the taxi dispatcher, to the big score
// at the port. Each mission is a small state machine over waypoints — drive
// somewhere, pick something up, lose the heat, or clear a crew — with
// on-screen dialogue and a payout at the end.

import * as THREE from 'three';
import { CFG } from './config.js';
import { createCarMesh } from './vehicles.js';

const markerGeo = new THREE.CylinderGeometry(2.2, 2.2, 0.25, 24);
const markerMat = new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.55 });
const enemyBodyGeo = new THREE.BoxGeometry(0.62, 1.05, 0.36);
const enemyHeadGeo = new THREE.SphereGeometry(0.24, 10, 8);

function makeEnemy(scene, x, z, rng) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8e2f2f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98f6a });
  const body = new THREE.Mesh(enemyBodyGeo, jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(enemyHeadGeo, skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(body, head);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    mesh: group,
    health: 60,
    shootTimer: 1 + rng.next() * 2,
    walkPhase: rng.next() * 10,
    speed: 3.2,
  };
}

function makeObjectiveCar(scene, x, z, heading, color) {
  const mesh = createCarMesh('sport', color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return { mesh, heading, drive: { speed: 0 } };
}

const MISSION_TEXT = {
  m1: {
    brief: 'Maya: "Rico, my cab driver called in sick. Take the taxi from the depot and drop the passenger at the beach hotel. Easy money."',
    steps: [
      { kind: 'goto', label: 'Get in the taxi at the depot', x: -180, z: 0 },
      { kind: 'goto', label: 'Drive the passenger to the beach hotel', x: 236, z: -60 },
    ],
    done: 'Maya: "First fare done. You drive like you mean it. I have more work if you want it."',
  },
  m2: {
    brief: 'Maya: "A package is waiting at the port warehouse. Pick it up and bring it to the park bench. No questions, no cops."',
    steps: [
      { kind: 'goto', label: 'Pick up the package at the port', x: -140, z: 210 },
      { kind: 'goto', label: 'Deliver the package to the park', x: 30, z: 90 },
    ],
    done: 'Maya: "Clean delivery. The client is happy — and happy clients pay."',
  },
  m3: {
    brief: 'Maya: "The crew needs wheels. There is a red sportscar parked by the marina. Take it — and do not get caught."',
    steps: [
      { kind: 'steal', label: 'Steal the red sportscar at the marina', x: 236, z: 60 },
      { kind: 'goto', label: 'Bring it to the garage on 5th Street', x: -60, z: 180 },
    ],
    done: 'Maya: "Nice ride. The crew owes you one now."',
  },
  m4: {
    brief: 'Maya: "A rival crew is muscling into our streets near the park. Clear them out — fists or fire, your call."',
    steps: [
      { kind: 'clear', label: 'Clear the rival crew at the park', x: 30, z: 90, count: 3 },
    ],
    done: 'Maya: "Streets are ours again. Word travels fast in Solmar."',
  },
  m5: {
    brief: 'Maya: "The cops raided the garage. Grab the getaway car and lose them — then meet me at the beach."',
    steps: [
      { kind: 'goto', label: 'Grab the getaway car at the garage', x: -60, z: 180 },
      { kind: 'escape', label: 'Lose the police (drop to 0 stars)', x: 236, z: 120 },
    ],
    done: 'Maya: "You shook them. I knew you had it in you, Rico."',
  },
  m6: {
    brief: 'Maya: "The big one. A shipment at the port, guarded. Take it, and we never work small again."',
    steps: [
      { kind: 'clear', label: 'Take the shipment at the port', x: -140, z: 210, count: 4 },
      { kind: 'goto', label: 'Drive the shipment to the beach hotel', x: 236, z: -60 },
    ],
    done: 'Maya: "We did it. Solmar is ours now, Rico. The city never forgets a legend."',
  },
};

export class Missions {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.index = -1; // -1 = no mission active
    this.step = 0;
    this.done = false;
    this.completedCount = 0;
    this.enemies = [];
    this.marker = new THREE.Mesh(markerGeo, markerMat);
    this.marker.visible = false;
    scene.add(this.marker);
    this.markerPos = { x: 0, z: 0 };
    this.currentCar = null;
    this.escapeActive = false;
    this.onEvent = null; // (type, text) => void
    this.world = null;
  }

  get active() {
    return this.index >= 0 && !this.done;
  }

  get current() {
    return this.active ? CFG.missions[this.index] : null;
  }

  get currentStep() {
    if (!this.active) return null;
    return MISSION_TEXT[CFG.missions[this.index].id].steps[this.step] || null;
  }

  get objective() {
    const s = this.currentStep;
    return s ? s.label : (this.done ? 'Story complete — Solmar is yours' : 'Press M to start a mission');
  }

  start(index) {
    const def = CFG.missions[index];
    if (!def) return;
    // Remove the previous mission's car, if it is still standing around.
    if (this.currentCar) this.removeCar(this.currentCar);
    this.index = index;
    this.step = 0;
    this.done = false;
    this.escapeActive = false;
    this.clearEnemies();
    this.spawnStep();
    this.emit('brief', MISSION_TEXT[def.id].brief);
  }

  startNext() {
    if (this.completedCount >= CFG.missions.length) return false;
    this.start(this.completedCount);
    return true;
  }

  emit(type, text) {
    if (this.onEvent) this.onEvent(type, text);
  }

  spawnStep() {
    const step = this.currentStep;
    if (!step) {
      this.finish();
      return;
    }
    this.markerPos = { x: step.x, z: step.z };
    this.marker.position.set(step.x, 0.2, step.z);
    this.marker.visible = true;
    if (step.kind === 'clear') {
      this.clearEnemies();
      for (let i = 0; i < step.count; i++) {
        this.enemies.push(makeEnemy(this.scene, step.x + (i - 1) * 4, step.z + (i % 2) * 5 - 2, this.rng));
      }
    }
    if (this.index === 0 && this.step === 0) {
      // Mission 1: a taxi waits at the depot.
      this.currentCar = makeObjectiveCar(this.scene, -180, 0, Math.PI / 2, 0xf7c948);
      this.currentCar.mesh.userData.kind = 'taxi';
    }
    if (this.index === 2 && this.step === 0) {
      // Mission 3: the red sportscar at the marina.
      this.currentCar = makeObjectiveCar(this.scene, 236, 60, Math.PI, 0xc0392b);
    }
    if (this.index === 4 && this.step === 0) {
      // Mission 5: the getaway car at the garage.
      this.currentCar = makeObjectiveCar(this.scene, -60, 180, 0, 0x2e6db4);
    }
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  removeCar(car) {
    if (car) this.scene.remove(car.mesh);
    if (this.currentCar === car) this.currentCar = null;
  }

  finish() {
    const def = CFG.missions[this.index];
    this.completedCount += 1;
    this.done = true;
    this.marker.visible = false;
    this.clearEnemies();
    this.emit('done', MISSION_TEXT[def.id].done);
    this.emit('payout', def.payout);
    this.index = -1;
  }

  advance() {
    this.step += 1;
    const step = this.currentStep;
    if (!step) {
      this.finish();
      return;
    }
    this.spawnStep();
    this.emit('objective', step.label);
  }

  update(dt, world) {
    this.world = world;
    if (!this.active) return;
    const step = this.currentStep;
    if (!step) return;
    const player = world.player;
    const px = player.x;
    const pz = player.z;
    const dist = Math.hypot(px - step.x, pz - step.z);

    if (step.kind === 'goto') {
      const inCar = !!player.inCar;
      const radius = inCar ? 5 : 3.5;
      if (dist < radius) this.advance();
    } else if (step.kind === 'steal') {
      if (player.inCar === this.currentCar) this.advance();
    } else if (step.kind === 'clear') {
      if (this.enemies.length === 0) this.advance();
      // Enemies chase and shoot the player.
      for (const e of this.enemies) {
        const p = e.mesh.position;
        const dx = px - p.x;
        const dz = pz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 2) {
          const heading = Math.atan2(dx, dz);
          p.x += Math.sin(heading) * e.speed * dt;
          p.z += Math.cos(heading) * e.speed * dt;
          e.mesh.rotation.y = heading;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < 28) {
          e.shootTimer = 1.6 + this.rng.next() * 1.2;
          if (world.enemyShoot) world.enemyShoot(e, d);
        }
        e.walkPhase += dt * 8;
        p.y = Math.abs(Math.sin(e.walkPhase)) * 0.05;
      }
    } else if (step.kind === 'escape') {
      if (!this.escapeActive) {
        this.escapeActive = true;
        world.police.addHeat(2);
      }
      if (world.police.stars === 0) this.advance();
    }

    // Marker pulse.
    this.marker.scale.setScalar(1 + Math.sin(world.time * 3) * 0.12);
    this.marker.rotation.y += dt;
  }

  damageEnemy(enemy, amount) {
    enemy.health -= amount;
    if (enemy.health <= 0) {
      const i = this.enemies.indexOf(enemy);
      if (i >= 0) this.enemies.splice(i, 1);
      this.scene.remove(enemy.mesh);
      return true;
    }
    return false;
  }
}
