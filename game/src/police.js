// The wanted system: crimes raise the heat, police cars and foot cops
// respond, and the heat cools off when the player stays out of sight.
// Busted on foot, wasted at zero health — both cost money and move the
// player to a safe place.

import * as THREE from 'three';
import { CFG, COLOURS } from './config.js';
import { createCarMesh, driveCar } from './vehicles.js';
import { resolveCircle } from './city.js';

const copBodyGeo = new THREE.BoxGeometry(0.62, 1.05, 0.36);
const copHeadGeo = new THREE.SphereGeometry(0.24, 10, 8);
const copLegGeo = new THREE.BoxGeometry(0.52, 0.55, 0.34);

function makeFootCop(scene) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const body = new THREE.Mesh(copBodyGeo, uniform);
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(copHeadGeo, skin);
  head.position.y = 1.78;
  head.castShadow = true;
  const legs = new THREE.Mesh(copLegGeo, new THREE.MeshLambertMaterial({ color: 0x141c26 }));
  legs.position.y = 0.3;
  // A cap brim, so cops read as cops at a glance.
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x0e141c }),
  );
  cap.position.y = 1.98;
  group.add(body, head, legs, cap);
  scene.add(group);
  return { mesh: group, health: 60, punchTimer: 0, walkPhase: Math.random() * 10 };
}

export class Police {
  constructor(scene, colliders, rng) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = rng;
    this.heat = 0;
    this.stars = 0;
    this.calmTimer = 0;
    this.copCars = [];
    this.footCops = [];
    this.bustedTimer = 0;
    this.sirenWanted = false;
  }

  get wanted() {
    return this.stars;
  }

  addHeat(amount) {
    this.heat = Math.min(CFG.wanted.maxStars, this.heat + amount);
    this.stars = Math.floor(this.heat);
    this.calmTimer = 0;
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this.calmTimer = 0;
    this.bustedTimer = 0;
    this.despawnAll();
  }

  despawnAll() {
    for (const c of this.copCars) this.scene.remove(c.mesh);
    for (const c of this.footCops) this.scene.remove(c.mesh);
    this.copCars = [];
    this.footCops = [];
  }

  spawnCopCar(x, z) {
    const mesh = createCarMesh('police', COLOURS.policeCar);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = this.rng.next() * Math.PI * 2;
    this.scene.add(mesh);
    const car = { mesh, heading: mesh.rotation.y, drive: { speed: 0 }, lightPhase: this.rng.next() * 10 };
    this.copCars.push(car);
    return car;
  }

  spawnFootCop(x, z) {
    const cop = makeFootCop(this.scene);
    cop.mesh.position.set(x, 0, z);
    this.footCops.push(cop);
    return cop;
  }

  // Pick a road point near the player, just out of sight.
  spawnPointNear(playerX, playerZ, dist) {
    const angle = this.rng.next() * Math.PI * 2;
    const x = playerX + Math.cos(angle) * dist;
    const z = playerZ + Math.sin(angle) * dist;
    return [Math.max(-240, Math.min(240, x)), Math.max(-240, Math.min(240, z))];
  }

  update(dt, world) {
    const player = world.player;
    const px = player.x;
    const pz = player.z;
    const inCar = !!player.inCar;

    // Keep the response matched to the star level.
    const [wantCars, wantCops] = CFG.wanted.response[this.stars] || [0, 0];
    while (this.copCars.length < wantCars) {
      const [x, z] = this.spawnPointNear(px, pz, 90);
      this.spawnCopCar(x, z);
    }
    while (this.copCars.length > wantCars) {
      const car = this.copCars.pop();
      this.scene.remove(car.mesh);
    }
    while (this.footCops.length < wantCops && !inCar) {
      const [x, z] = this.spawnPointNear(px, pz, 40);
      this.spawnFootCop(x, z);
    }
    while (this.footCops.length > wantCops) {
      const cop = this.footCops.pop();
      this.scene.remove(cop.mesh);
    }

    // Heat cools off when no cop is near and no crime happened lately.
    let nearestCop = Infinity;
    for (const c of this.copCars) nearestCop = Math.min(nearestCop, Math.hypot(c.mesh.position.x - px, c.mesh.position.z - pz));
    for (const c of this.footCops) nearestCop = Math.min(nearestCop, Math.hypot(c.mesh.position.x - px, c.mesh.position.z - pz));
    if (this.stars > 0 && nearestCop > 70) {
      this.calmTimer += dt;
      if (this.calmTimer > CFG.wanted.decayDelay) {
        this.heat = Math.max(0, this.heat - dt / CFG.wanted.decayPerStar);
        this.stars = Math.floor(this.heat);
        if (this.stars === 0) this.calmTimer = 0;
      }
    } else {
      this.calmTimer = 0;
    }

    // Cop cars chase the player and ram.
    for (const car of this.copCars) {
      const p = car.mesh.position;
      const dx = px - p.x;
      const dz = pz - p.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += diff * Math.min(1, dt * 1.6);
      car.mesh.rotation.y = car.heading;
      const speed = Math.min(CFG.wanted.copCarSpeed, dist * 0.8 + 8);
      const st = car.drive;
      st.speed += (speed - st.speed) * Math.min(1, dt * 1.5);
      p.x += Math.sin(car.heading) * st.speed * dt;
      p.z += Math.cos(car.heading) * st.speed * dt;
      resolveCircle(this.colliders, p, 1.6);
      // Ram the player's car.
      if (inCar) {
        const d = Math.hypot(player.inCar.mesh.position.x - p.x, player.inCar.mesh.position.z - p.z);
        if (d < 3.4) {
          const crash = { speed: st.speed };
          if (crash.speed > 4 && world.onPlayerRam) world.onPlayerRam(crash.speed);
          st.speed *= 0.4;
          if (player.inCar.drive) player.inCar.drive.speed *= 0.7;
        }
      }
      // Flash the light bar.
      car.lightPhase += dt * 8;
      if (car.mesh.userData.lightBar) {
        car.mesh.userData.lightBar.material.emissive.setHex(Math.sin(car.lightPhase) > 0 ? 0xcc1122 : 0x1122cc);
      }
    }

    // Foot cops chase and punch the player on foot.
    let bustedNear = false;
    for (const cop of this.footCops) {
      const p = cop.mesh.position;
      const dx = px - p.x;
      const dz = pz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.5) {
        const heading = Math.atan2(dx, dz);
        p.x += Math.sin(heading) * CFG.wanted.copFootSpeed * dt;
        p.z += Math.cos(heading) * CFG.wanted.copFootSpeed * dt;
        cop.mesh.rotation.y = heading;
        cop.walkPhase += dt * 12;
        p.y = Math.abs(Math.sin(cop.walkPhase)) * 0.06;
      } else {
        bustedNear = true;
        cop.punchTimer -= dt;
        if (cop.punchTimer <= 0) {
          cop.punchTimer = 0.9;
          player.takeDamage(12);
          if (world.audio) world.audio.punch();
        }
      }
      resolveCircle(this.colliders, p, 0.4);
    }

    // Busted: a cop holds the player on foot.
    if (bustedNear && !inCar && this.stars > 0) {
      this.bustedTimer += dt;
      if (this.bustedTimer >= CFG.wanted.bustedSeconds && world.onBusted) world.onBusted();
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }

    // Sirens while wanted.
    if (world.audio) world.audio.setSiren(this.stars > 0);
  }
}
