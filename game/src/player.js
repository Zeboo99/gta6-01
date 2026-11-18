// The player on foot: third-person walking, running and jumping, punching
// and shooting, getting in and out of cars, and picking up cash, health
// and ammo. The player also owns the money, health and ammo the HUD shows.

import * as THREE from 'three';
import { CFG, COLOURS } from './config.js';
import { resolveCircle } from './city.js';

const bodyGeo = new THREE.BoxGeometry(0.62, 1.05, 0.36);
const headGeo = new THREE.SphereGeometry(0.24, 10, 8);
const legGeo = new THREE.BoxGeometry(0.52, 0.55, 0.34);
const armGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);

export class Player {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.group = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2e6db4 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
    this.body = new THREE.Mesh(bodyGeo, jacket);
    this.body.position.y = 1.05;
    this.body.castShadow = true;
    this.head = new THREE.Mesh(headGeo, skin);
    this.head.position.y = 1.78;
    this.head.castShadow = true;
    this.legs = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x22303c }));
    this.legs.position.y = 0.3;
    this.armL = new THREE.Mesh(armGeo, jacket);
    this.armL.position.set(-0.42, 1.1, 0);
    this.armR = new THREE.Mesh(armGeo, jacket);
    this.armR.position.set(0.42, 1.1, 0);
    // A simple pistol in the right hand, shown when aiming.
    this.gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    this.gun.position.set(0.42, 0.85, 0.3);
    this.gun.visible = false;
    this.group.add(this.body, this.head, this.legs, this.armL, this.armR, this.gun);
    this.group.position.set(0, 0, 12);
    scene.add(this.group);

    this.pos = this.group.position;
    this.heading = 0;
    this.vy = 0;
    this.grounded = true;
    this.speed = 0;
    this.health = CFG.player.maxHealth;
    this.ammo = CFG.player.startAmmo;
    this.money = CFG.money.start;
    this.inCar = null;
    this.aiming = false;
    this.punchTimer = 0;
    this.shootTimer = 0;
    this.walkPhase = 0;
    this.hurtTimer = 0;
    this.dead = false;
  }

  // While driving, the player's position IS the car's position: the
  // mission, police and pickup checks all read x/z, so they must follow
  // the car, not the stale on-foot spot where the player got in.
  get x() { return this.inCar ? this.inCar.mesh.position.x : this.pos.x; }
  get z() { return this.inCar ? this.inCar.mesh.position.z : this.pos.z; }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.heading = 0;
    this.health = CFG.player.maxHealth;
    this.dead = false;
    this.inCar = null;
    this.group.visible = true;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtTimer = 0.4;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.health = Math.min(CFG.player.maxHealth, this.health + amount);
  }

  // Move on foot. camHeading is the camera's yaw; movement is relative to it.
  updateOnFoot(dt, input, camHeading, world) {
    const { f, s } = input.moveAxis();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const targetSpeed = (f !== 0 || s !== 0)
      ? (running ? CFG.player.runSpeed : CFG.player.walkSpeed) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 8);
    if (targetSpeed > 0) {
      const moveAngle = camHeading + Math.atan2(s, f);
      // Smoothly turn towards the movement direction.
      let diff = moveAngle - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    // Jump and gravity.
    if (input.hit('Space') && this.grounded) {
      this.vy = CFG.player.jumpSpeed;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= CFG.player.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    resolveCircle(this.colliders, this.pos, CFG.player.radius);
    this.group.rotation.y = this.heading;
    this.walkPhase += dt * this.speed * 1.6;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.07;
    this.group.position.y = this.pos.y + bob;
    this.legs.position.y = 0.3 + Math.sin(this.walkPhase) * 0.05;
    this.aiming = input.mouseRight;
    this.gun.visible = this.aiming;
    if (this.aiming) {
      this.armR.rotation.x = -Math.PI / 2 + 0.3;
    } else {
      this.armR.rotation.x = Math.sin(this.walkPhase) * 0.4;
      this.armL.rotation.x = -Math.sin(this.walkPhase) * 0.4;
    }
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
  }

  // Punch: hits the nearest pedestrian or enemy in front of the player.
  tryPunch(world) {
    if (this.punchTimer > 0 || this.inCar) return null;
    this.punchTimer = CFG.player.punchCooldown;
    this.armR.rotation.x = -1.4;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const targets = [];
    for (const ped of world.peds.list) targets.push({ obj: ped, x: ped.mesh.position.x, z: ped.mesh.position.z, kind: 'ped' });
    for (const e of world.missions.enemies) targets.push({ obj: e, x: e.mesh.position.x, z: e.mesh.position.z, kind: 'enemy' });
    for (const t of targets) {
      const dx = t.x - this.pos.x;
      const dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < CFG.player.punchRange && (dx * fx + dz * fz) / (d || 1) > 0.3) return { target: t, damage: CFG.player.punchDamage };
    }
    return { target: null, damage: 0 };
  }

  // Shoot: a hitscan ray from the player along the aim direction.
  tryShoot(world) {
    if (this.shootTimer > 0 || this.ammo <= 0 || this.inCar) return null;
    this.shootTimer = CFG.player.gunCooldown;
    this.ammo -= 1;
    const aim = world.cameraAim;
    const ox = this.pos.x;
    const oz = this.pos.z;
    let best = null;
    let bestD = CFG.player.gunRange;
    const targets = [];
    for (const ped of world.peds.list) targets.push({ obj: ped, x: ped.mesh.position.x, z: ped.mesh.position.z, kind: 'ped' });
    for (const e of world.missions.enemies) targets.push({ obj: e, x: e.mesh.position.x, z: e.mesh.position.z, kind: 'enemy' });
    for (const c of world.police.footCops) targets.push({ obj: c, x: c.mesh.position.x, z: c.mesh.position.z, kind: 'cop' });
    for (const t of targets) {
      const dx = t.x - ox;
      const dz = t.z - oz;
      const along = dx * aim.x + dz * aim.z;
      if (along < 0 || along > bestD) continue;
      const perp = Math.abs(dx * aim.z - dz * aim.x);
      if (perp < 1.2) {
        bestD = along;
        best = t;
      }
    }
    return { hit: best, distance: bestD, damage: CFG.player.gunDamage };
  }
}
