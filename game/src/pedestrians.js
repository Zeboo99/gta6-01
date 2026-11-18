// Pedestrians: simple figures that stroll the sidewalks, turn at corners,
// and run away from gunfire or a speeding car. They also notice crimes:
// hurting one in sight of a cop raises the wanted level.

import * as THREE from 'three';
import { CFG, COLOURS } from './config.js';
import { resolveCircle } from './city.js';

const bodyGeo = new THREE.BoxGeometry(0.5, 1.0, 0.32);
const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
const legGeo = new THREE.BoxGeometry(0.44, 0.5, 0.3);

export class Pedestrians {
  constructor(scene, colliders, rng) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = rng;
    this.list = [];
    for (let i = 0; i < CFG.pedestrians.count; i++) {
      this.spawn(this.randomSidewalkSpot());
    }
  }

  randomSidewalkSpot() {
    const street = CFG.streets[Math.floor(this.rng.next() * CFG.streets.length)];
    const along = this.rng.range(-230, 230);
    const side = this.rng.chance(0.5) ? CFG.streetHalf + 2.5 : -(CFG.streetHalf + 2.5);
    return this.rng.chance(0.5) ? [along, street + side] : [street + side, along];
  }

  spawn([x, z]) {
    const shirt = new THREE.MeshLambertMaterial({ color: this.rng.pick(COLOURS.shirt) });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, shirt);
    body.position.y = 1.05;
    body.castShadow = true;
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.75;
    head.castShadow = true;
    const legs = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    legs.position.y = 0.3;
    group.add(body);
    group.add(head);
    group.add(legs);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const ped = {
      mesh: group,
      speed: this.rng.range(CFG.pedestrians.speedMin, CFG.pedestrians.speedMax),
      heading: this.rng.next() * Math.PI * 2,
      state: 'walk',
      fleeX: 0,
      fleeZ: 0,
      fleeTime: 0,
      walkPhase: this.rng.next() * 10,
    };
    this.list.push(ped);
    return ped;
  }

  // Everyone within range of (x, z) runs away from it.
  scare(x, z, radius) {
    for (const ped of this.list) {
      const dx = ped.mesh.position.x - x;
      const dz = ped.mesh.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        ped.state = 'flee';
        ped.fleeX = dx / (d || 1);
        ped.fleeZ = dz / (d || 1);
        ped.fleeTime = 3 + this.rng.next() * 2;
      }
    }
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.list) {
      const d = Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  remove(ped) {
    const i = this.list.indexOf(ped);
    if (i >= 0) this.list.splice(i, 1);
    this.scene.remove(ped.mesh);
  }

  update(dt, time) {
    for (const ped of this.list) {
      const p = ped.mesh.position;
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        if (ped.fleeTime <= 0) ped.state = 'walk';
        p.x += ped.fleeX * 5.5 * dt;
        p.z += ped.fleeZ * 5.5 * dt;
        ped.heading = Math.atan2(ped.fleeX, ped.fleeZ);
      } else {
        // Stroll along the sidewalk grid; turn at intersections.
        const speed = ped.speed;
        p.x += Math.sin(ped.heading) * speed * dt;
        p.z += Math.cos(ped.heading) * speed * dt;
        const nearJunction = CFG.streets.some((s) => Math.abs(p.x - s) < 1 || Math.abs(p.z - s) < 1);
        if (nearJunction && this.rng.chance(dt * 0.3)) {
          ped.heading += this.rng.pick([-Math.PI / 2, Math.PI / 2, 0]);
        }
        if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250) ped.heading += Math.PI;
      }
      ped.mesh.rotation.y = ped.heading;
      // A simple walk bob.
      ped.walkPhase += dt * (ped.state === 'flee' ? 14 : 8);
      ped.mesh.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.06;
      resolveCircle(this.colliders, p, 0.4);
    }
  }
}
