// Solmar City — the game itself. Boots the renderer, builds the city and
// its systems, runs the loop, and wires up the controls: walk, drive,
// steal, fight, wanted, missions, pickups, save, and the pause menu.
// Nothing here talks to the network; the only storage is localStorage.

import * as THREE from 'three';
import { CFG } from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, nearestRoadPoint } from './city.js';
import { Traffic, createCarMesh, driveCar, randomCarColor } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { UI } from './ui.js';

const SAVE_KEY = CFG.saveKey;

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CFG.sky);
    this.scene.fog = new THREE.Fog(0xcfe0ea, 220, 900);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 8, 20);

    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffe3b3, 1.7);
    this.sun.position.set(180, 260, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -320;
    this.sun.shadow.camera.right = 320;
    this.sun.shadow.camera.top = 320;
    this.sun.shadow.camera.bottom = -320;
    this.sun.shadow.camera.far = 800;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.rng = new Rng(20261117);
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.ui = new UI();

    this.city = buildCity(this.scene, this.rng);
    this.traffic = new Traffic(this.scene, this.city.colliders, this.rng);
    this.peds = new Pedestrians(this.scene, this.city.colliders, this.rng);
    this.player = new Player(this.scene, this.city.colliders);
    this.police = new Police(this.scene, this.city.colliders, this.rng);
    this.missions = new Missions(this.scene, this.rng);

    this.world = {
      scene: this.scene,
      player: this.player,
      police: this.police,
      missions: this.missions,
      peds: this.peds,
      traffic: this.traffic,
      city: this.city,
      audio: this.audio,
      time: 0,
      started: false,
      cameraAim: { x: 0, z: 1 },
      onPlayerRam: (speed) => this.onPlayerRam(speed),
      onBusted: () => this.onBusted(),
      enemyShoot: (enemy, dist) => this.enemyShoot(enemy, dist),
    };

    this.camYaw = 0;
    this.camPitch = 0.32;
    this.paused = false;
    this.started = false;
    this.time = 0;
    this.shot = new URLSearchParams(window.location.search).get('shot');
    this.tracers = [];
    this.pickups = [];
    this.parked = [];
    this.spawnPickups();
    this.spawnParkedCars();
    this.missions.onEvent = (type, text) => this.onMissionEvent(type, text);

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.tryStartMission();
      if (e.code === 'KeyP') this.togglePause();
      if (e.code === 'KeyN') this.audio.setMuted(!this.audio.muted);
      if (e.code === 'KeyK') this.saveGame(true);
    });

    // Shot scenes are staged before the first frame so screenshots are
    // deterministic.
    if (this.shot) this.setupShotScene();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Pickups -----------------------------------------------------------

  spawnPickups() {
    const kinds = ['cash', 'health', 'ammo', 'cash', 'health', 'ammo', 'cash', 'cash', 'ammo', 'health'];
    for (const kind of kinds) {
      const [x, z] = this.pickupSpot();
      this.pickups.push(this.makePickup(kind, x, z));
    }
  }

  pickupSpot() {
    for (let tries = 0; tries < 20; tries++) {
      const x = this.rng.range(-240, 240);
      const z = this.rng.range(-240, 240);
      const onStreet = CFG.streets.some((s) => Math.abs(x - s) < CFG.streetHalf || Math.abs(z - s) < CFG.streetHalf);
      if (onStreet) return [x, z];
    }
    return [0, 30];
  }

  makePickup(kind, x, z) {
    const color = kind === 'cash' ? 0x27ae60 : kind === 'health' ? 0xecf0f1 : 0xf1c40f;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    mesh.position.set(x, 1.1, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return { kind, mesh, x, z, respawn: 0 };
  }

  // --- Parked cars (easy steals, not part of traffic) --------------------

  spawnParkedCars() {
    const spots = [
      [120, 60, 0.6], [60, -120, -0.4], [-120, 120, 1.2], [180, -180, 0], [-60, -60, 2.1], [240, 120, -1.1],
    ];
    for (const [x, z, heading] of spots) {
      const mesh = createCarMesh('sedan', randomCarColor(this.rng));
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      this.scene.add(mesh);
      this.parked.push({ mesh, heading, drive: { speed: 0 }, parked: true });
    }
  }

  // --- Missions ----------------------------------------------------------

  tryStartMission() {
    if (!this.started || this.paused) return;
    if (this.missions.active) {
      this.ui.showToast('Mission active: ' + this.missions.objective);
      return;
    }
    if (this.missions.completedCount >= CFG.missions.length) {
      this.ui.showToast('Story complete — Solmar is yours. Free roam!');
      return;
    }
    this.missions.startNext();
    this.audio.missionStart();
  }

  onMissionEvent(type, text) {
    if (type === 'brief') this.ui.showDialogue('Maya', text, 8);
    if (type === 'done') this.ui.showDialogue('Maya', text, 8);
    if (type === 'objective') this.ui.showToast('Objective: ' + text);
    if (type === 'payout') {
      this.player.money += text;
      this.ui.showToast('Mission complete! +$' + text.toLocaleString('en-US'));
      this.audio.missionDone();
      this.saveGame(false);
      if (this.missions.completedCount >= CFG.missions.length) {
        this.ui.showDialogue('Maya', 'That is the whole story, Rico. Solmar is yours now — keep driving, keep earning.', 10);
      }
    }
  }

  // --- Crime and consequences -------------------------------------------

  onPlayerRam(speed) {
    if (speed > 8) {
      this.audio.crash(speed / 30);
      this.ui.showToast('Police rammed your car!');
    }
  }

  enemyShoot(enemy, dist) {
    const from = enemy.mesh.position;
    const to = { x: this.player.x, z: this.player.z };
    this.spawnTracer(from.x, 1.4, from.z, to.x, 1.2, to.z, 0xff5533);
    this.audio.shot();
    const hitChance = Math.max(0.15, 0.55 - dist / 60);
    if (Math.random() < hitChance) {
      this.player.takeDamage(8 + Math.random() * 6);
      this.ui.showToast('You got shot!');
    }
  }

  onBusted() {
    if (!this.started) return;
    this.police.clear();
    this.player.money = Math.max(0, this.player.money - CFG.wanted.bustedFine);
    this.player.health = CFG.player.maxHealth;
    this.exitCar();
    this.player.reset(0, 12);
    this.missions.index = -1;
    this.missions.marker.visible = false;
    this.audio.busted();
    this.audio.setSiren(false);
    this.saveGame(false);
    this.ui.showEnd('BUSTED', 'The police caught you. Fine: $' + CFG.wanted.bustedFine + '. Maya is not happy.', 'Back to the streets', () => {
      this.ui.hideEnd();
      this.started = true;
    });
  }

  onWasted() {
    if (!this.started) return;
    this.police.clear();
    this.player.money = Math.max(0, this.player.money - CFG.wanted.wastedFine);
    this.player.health = CFG.player.maxHealth;
    this.player.dead = false;
    this.exitCar();
    this.player.reset(0, 12);
    this.missions.index = -1;
    this.missions.marker.visible = false;
    this.audio.wasted();
    this.saveGame(false);
    this.ui.showEnd('WASTED', 'You got taken out. Hospital bill: $' + CFG.wanted.wastedFine + '.', 'Back to the streets', () => {
      this.ui.hideEnd();
      this.started = true;
    });
  }

  // --- Entering and leaving cars ----------------------------------------

  nearestEnterableCar(maxDist) {
    const px = this.player.x;
    const pz = this.player.z;
    let best = null;
    let bestD = maxDist;
    const consider = (car) => {
      const d = Math.hypot(car.mesh.position.x - px, car.mesh.position.z - pz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    };
    for (const car of this.traffic.cars) consider(car);
    for (const car of this.parked) consider(car);
    if (this.missions.currentCar) consider(this.missions.currentCar);
    return best;
  }

  enterCar(car) {
    const isTrafficCar = this.traffic.cars.includes(car);
    const isParked = this.parked.includes(car);
    if (isTrafficCar) this.traffic.removeCar(car);
    if (isParked) {
      const i = this.parked.indexOf(car);
      this.parked.splice(i, 1);
    }
    this.player.inCar = car;
    this.player.group.visible = false;
    car.drive = car.drive || { speed: 0 };
    car.wasParked = isParked;
    if (isTrafficCar || isParked) {
      this.police.addHeat(CFG.wanted.stealCar);
      this.ui.showToast('Car stolen! The police are on their way.');
      this.audio.setSiren(true);
    }
    this.audio.click();
  }

  exitCar() {
    const car = this.player.inCar;
    if (!car) return;
    // Leave the car where it is; it rejoins traffic or stays parked.
    this.player.inCar = null;
    this.player.group.visible = true;
    const side = 2.2;
    const lx = Math.cos(car.heading) * side;
    const lz = -Math.sin(car.heading) * side;
    this.player.pos.set(car.mesh.position.x + lx, 0, car.mesh.position.z + lz);
    this.player.heading = car.heading;
    // A parked car goes back to its parking spot list; a stolen traffic car
    // rejoins traffic (it needs a route — give it one if it has none).
    if (car.wasParked) {
      this.parked.push(car);
    } else if (!this.traffic.cars.includes(car) && car !== this.missions.currentCar) {
      if (!car.axis) {
        car.axis = 'x';
        car.dir = 1;
        car.speed = 9;
      }
      this.traffic.addCar(car);
    }
  }

  // --- Combat ------------------------------------------------------------

  doPunch() {
    const result = this.player.tryPunch(this.world);
    if (!result) return;
    this.audio.punch();
    if (!result.target) return;
    const { target, damage } = result;
    if (target.kind === 'ped') {
      this.peds.remove(target.obj);
      this.police.addHeat(CFG.wanted.kill);
      this.ui.showToast('You knocked out a pedestrian!');
      this.spawnCashDrop(target.obj.mesh.position.x, target.obj.mesh.position.z);
    } else if (target.kind === 'enemy') {
      if (this.missions.damageEnemy(target.obj, damage)) {
        this.ui.showToast('Rival down!');
        this.spawnCashDrop(target.obj.mesh.position.x, target.obj.mesh.position.z);
      }
    }
  }

  doShoot() {
    const result = this.player.tryShoot(this.world);
    if (!result) return;
    this.audio.shot();
    const from = this.player.pos;
    const aim = this.world.cameraAim;
    const ex = from.x + aim.x * result.distance;
    const ez = from.z + aim.z * result.distance;
    this.spawnTracer(from.x, 1.5, from.z, ex, 1.4, ez, 0xffe9a8);
    if (result.hit) {
      const { hit, damage } = result;
      if (hit.kind === 'ped') {
        this.peds.remove(hit.obj);
        this.police.addHeat(CFG.wanted.kill);
        this.ui.showToast('You shot a pedestrian! The police are coming.');
        this.spawnCashDrop(hit.obj.mesh.position.x, hit.obj.mesh.position.z);
      } else if (hit.kind === 'enemy') {
        if (this.missions.damageEnemy(hit.obj, damage)) {
          this.ui.showToast('Rival down!');
          this.spawnCashDrop(hit.obj.mesh.position.x, hit.obj.mesh.position.z);
        }
      } else if (hit.kind === 'cop') {
        hit.obj.health -= damage;
        this.police.addHeat(CFG.wanted.kill);
        if (hit.obj.health <= 0) {
          const i = this.police.footCops.indexOf(hit.obj);
          if (i >= 0) this.police.footCops.splice(i, 1);
          this.scene.remove(hit.obj.mesh);
          this.ui.showToast('You took down a cop! Heat is max.');
        }
      }
    } else {
      // A shot near a cop draws attention.
      for (const cop of this.police.footCops) {
        const d = Math.hypot(cop.mesh.position.x - from.x, cop.mesh.position.z - from.z);
        if (d < 40) {
          this.police.addHeat(CFG.wanted.shootNearCop);
          break;
        }
      }
      this.peds.scare(from.x, from.z, 25);
    }
  }

  spawnCashDrop(x, z) {
    const p = this.makePickup('cash', x + 1, z + 1);
    p.respawn = 0;
    this.pickups.push(p);
  }

  spawnTracer(x1, y1, z1, x2, y2, z2, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // --- Save / load -------------------------------------------------------

  saveGame(announce) {
    try {
      const data = {
        money: this.player.money,
        health: this.player.health,
        ammo: this.player.ammo,
        completed: this.missions.completedCount,
        x: this.player.x,
        z: this.player.z,
        time: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (announce) this.ui.showToast('Game saved.');
    } catch (err) {
      // Storage can be unavailable in some embeds; the game plays on.
    }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  applySave(save) {
    this.player.money = save.money ?? CFG.money.start;
    this.player.health = save.health ?? CFG.player.maxHealth;
    this.player.ammo = save.ammo ?? CFG.player.startAmmo;
    this.missions.completedCount = save.completed ?? 0;
    if (typeof save.x === 'number' && typeof save.z === 'number') {
      this.player.reset(save.x, save.z);
    }
  }

  // --- Start / pause -----------------------------------------------------

  start() {
    const save = this.loadSave();
    this.ui.showMenu(
      CFG.title,
      save
        ? 'Welcome back, Rico. $' + save.money.toLocaleString('en-US') + ' in your pocket, ' + save.completed + ' of 6 missions done.'
        : 'A new open-world crime story. Walk the streets of Solmar, steal cars, outrun the police, and run six missions for Maya — from the first fare to the big score.',
      save ? 'CONTINUE' : 'START GAME',
      () => {
        if (save) this.applySave(save);
        this.ui.hideMenu();
        this.beginPlay();
      },
    );
    if (this.shot) {
      // Screenshot mode skips the menu: the scene is already staged.
      this.ui.hideMenu();
      this.beginPlay();
    }
  }

  beginPlay() {
    this.audio.init();
    this.audio.startMusic();
    this.started = true;
    this.world.started = true;
    this.ui.drawMinimap(this.world);
    this.ui.showToast('Maya: "Press M to start a mission. E to enter a car."', 6);
  }

  togglePause() {
    if (!this.started) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.ui.showPause(() => this.togglePause());
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      this.ui.hidePause();
    }
  }

  // --- Screenshot scenes -------------------------------------------------

  setupShotScene() {
    this.started = true;
    this.world.started = true;
    if (this.shot === 'title') {
      // A wide view over downtown toward the beach at sunset light.
      this.camera.position.set(-160, 90, 260);
      this.camera.lookAt(60, 0, -40);
      this.shotCamera = true;
    } else if (this.shot === 'play') {
      // Rico driving a taxi down 5th Street with traffic around.
      const car = this.parked[0];
      this.enterCar(car);
      car.mesh.position.set(0, 0, 60);
      car.heading = Math.PI;
      car.mesh.rotation.y = Math.PI;
      car.drive.speed = 14;
      this.camYaw = Math.PI;
      this.camPitch = 0.22;
    } else if (this.shot === 'action') {
      // Rico on foot at the park, aiming at rivals, cops closing in.
      // Face +z: the rivals and the mission marker are at z 88-93.
      this.player.reset(30, 80);
      this.player.heading = 0;
      this.camYaw = 0;
      this.camPitch = 0.18;
      this.missions.start(3);
      this.police.addHeat(2);
      this.player.ammo = 120;
      this.player.aiming = true;
    }
    // Paint the minimap once now, so the first screenshot frame already
    // shows it (the loop only repaints it four times a second).
    this.ui.drawMinimap(this.world);
  }

  // --- Camera ------------------------------------------------------------

  updateCamera(dt) {
    if (this.shotCamera) return;
    const { dx, dy } = this.input.takeMouse();
    this.camYaw -= dx * 0.0028;
    this.camPitch += dy * 0.0022;
    this.camPitch = Math.max(-0.15, Math.min(0.85, this.camPitch));
    const player = this.player;
    const aimDir = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    this.world.cameraAim = aimDir;
    let focus;
    let dist;
    let height;
    if (player.inCar) {
      const car = player.inCar;
      focus = car.mesh.position;
      dist = 10;
      height = 4.2;
      // The chase camera follows the car's heading, eased.
      let diff = car.heading - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 2.2);
    } else {
      focus = player.pos;
      dist = player.aiming ? 3.4 : 6.5;
      height = player.aiming ? 2.1 : 3.2;
      if (player.aiming) player.heading = this.camYaw;
    }
    const cx = focus.x - Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
    const cz = focus.z - Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
    const cy = focus.y + height + Math.sin(this.camPitch) * dist;
    // Keep the camera out of buildings: clamp its height above the ground.
    this.camera.position.set(cx, Math.max(cy, 1.2), cz);
    this.camera.lookAt(focus.x + Math.sin(this.camYaw) * 2, focus.y + 1.4, focus.z + Math.cos(this.camYaw) * 2);
  }

  // --- Main loop ---------------------------------------------------------

  tick(now) {
    requestAnimationFrame((t) => this.tick(t));
    const dt = Math.min(0.05, (now - (this.lastNow ?? now)) / 1000);
    this.lastNow = now;
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }
    this.time += dt;
    this.world.time = this.time;
    if (this.started) {
      this.update(dt);
    }
    this.city.water.position.y = -0.4 + Math.sin(this.time * 0.5) * 0.12;
    // Tracers fade fast.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.ui.tick(dt);
    this.input.endFrame();
    if (this.shot && !window.__shotReady) {
      window.__shotReady = true;
    }
  }

  update(dt) {
    const input = this.input;
    const player = this.player;

    // Entering and leaving cars.
    if (input.hit('KeyE')) {
      if (player.inCar) {
        this.exitCar();
      } else {
        const car = this.nearestEnterableCar(3.5);
        if (car) this.enterCar(car);
      }
    }

    if (player.inCar) {
      const car = player.inCar;
      const { f, s } = input.moveAxis();
      const brake = input.down('Space') ? 1 : 0;
      const result = driveCar(car, s, f, brake, dt, this.city.colliders, (speed) => {
        this.audio.crash(speed / 30);
        this.peds.scare(car.mesh.position.x, car.mesh.position.z, 15);
      });
      this.audio.setEngine(Math.abs(car.drive.speed) / CFG.car.maxSpeed);
      // A hard crash hurts the player a little.
      if (result.crashed && Math.abs(car.drive.speed) > 12) player.takeDamage(2);
    } else {
      this.audio.setEngine(0);
      player.updateOnFoot(dt, input, this.camYaw, this.world);
      if (input.leftPressed) {
        if (player.aiming) this.doShoot();
        else this.doPunch();
      }
      if (input.hit('KeyF')) this.doPunch();
      if (input.hit('KeyR')) {
        // Reload: nothing to reload — ammo is a pool; show the count.
        this.ui.showToast(player.ammo + ' rounds left.');
      }
    }

    // Pickups.
    for (const p of this.pickups) {
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          const [x, z] = this.pickupSpot();
          p.x = x;
          p.z = z;
          p.mesh.position.set(x, 1.1, z);
          p.mesh.visible = true;
        }
        continue;
      }
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1.1 + Math.sin(this.time * 3 + p.x) * 0.15;
      const d = Math.hypot(player.x - p.x, player.z - p.z);
      if (d < 1.6 && !player.inCar) {
        if (p.kind === 'cash') {
          player.money += CFG.money.pickupCash;
          this.ui.showToast('+$' + CFG.money.pickupCash + ' cash found.');
          this.audio.cash();
        } else if (p.kind === 'health') {
          player.heal(40);
          this.ui.showToast('Health +40.');
          this.audio.pickup();
        } else {
          player.ammo = Math.min(CFG.player.maxAmmo, player.ammo + 24);
          this.ui.showToast('Ammo +24.');
          this.audio.pickup();
        }
        p.mesh.visible = false;
        p.respawn = 25;
      }
    }

    this.traffic.update(dt, player.inCar);
    this.peds.update(dt, this.time);
    this.police.update(dt, this.world);
    this.missions.update(dt, this.world);
    this.updateCamera(dt);
    this.ui.updateHUD(this.world);
    if (this.time % 0.25 < dt) this.ui.drawMinimap(this.world);

    if (player.dead) {
      this.onWasted();
    }
  }
}
