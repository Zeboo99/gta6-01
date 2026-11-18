// The city of Solmar: a grid of streets, blocks of buildings, a beach and
// ocean to the east, a port in the south-west, a park, palms and street
// lights. Everything is built from boxes and canvas textures at boot, so
// the game ships no image files. The module also owns the collision boxes
// (axis-aligned) and the 2D data the minimap draws from.

import * as THREE from 'three';
import { CFG, COLOURS } from './config.js';

const WORLD_MIN = -320;
const WORLD_SIZE = 640;
const TEX = 1024;

function worldToTex(v) {
  return ((v - WORLD_MIN) / WORLD_SIZE) * TEX;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// A facade: dark glass windows on a tinted wall, drawn once and reused.
function facadeTexture(base, floors, cols) {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 8);
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < 0.22;
      g.fillStyle = lit ? '#ffe9a8' : '#1d2b3a';
      g.fillRect(10 + col * ((128 - 20) / cols), 16 + f * ((256 - 24) / floors), (128 - 20) / cols - 6, (256 - 24) / floors - 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture() {
  const c = makeCanvas(TEX, TEX);
  const g = c.getContext('2d');
  // Grass base.
  g.fillStyle = '#5d8a4a';
  g.fillRect(0, 0, TEX, TEX);
  // Sand strip on the east edge.
  g.fillStyle = '#d9c08a';
  g.fillRect(worldToTex(CFG.beachStart), 0, worldToTex(CFG.sandEnd) - worldToTex(CFG.beachStart), TEX);
  // Port concrete in the south-west.
  g.fillStyle = '#8d8d84';
  g.fillRect(worldToTex(CFG.port.minX), worldToTex(CFG.port.minZ), worldToTex(CFG.port.maxX) - worldToTex(CFG.port.minX), worldToTex(CFG.port.maxZ) - worldToTex(CFG.port.minZ));
  // Sidewalks: a light frame around every block.
  g.fillStyle = '#9a9a92';
  for (let i = 0; i < CFG.streets.length - 1; i++) {
    for (let j = 0; j < CFG.streets.length - 1; j++) {
      const x0 = CFG.streets[i] + CFG.streetHalf - 2;
      const z0 = CFG.streets[j] + CFG.streetHalf - 2;
      const w = CFG.streets[i + 1] - CFG.streets[i] - 2 * CFG.streetHalf + 4;
      g.fillRect(worldToTex(x0), worldToTex(z0), (w / WORLD_SIZE) * TEX, (w / WORLD_SIZE) * TEX);
    }
  }
  // Asphalt streets.
  g.fillStyle = '#33363b';
  for (const s of CFG.streets) {
    const t = worldToTex(s);
    const w = ((CFG.streetHalf * 2) / WORLD_SIZE) * TEX;
    g.fillRect(t - w / 2, 0, w, TEX);
    g.fillRect(0, t - w / 2, TEX, w);
  }
  // Park, painted after the sidewalks so its green is not covered by them.
  g.fillStyle = '#4a7a3d';
  g.fillRect(worldToTex(CFG.park.minX), worldToTex(CFG.park.minZ), worldToTex(CFG.park.maxX) - worldToTex(CFG.park.minX), worldToTex(CFG.park.maxZ) - worldToTex(CFG.park.minZ));
  // Centre dashes and crosswalks.
  g.fillStyle = '#d8c95a';
  for (const s of CFG.streets) {
    const t = worldToTex(s);
    for (let d = -300; d < 300; d += 16) {
      const p = worldToTex(d);
      g.fillRect(t - 1.5, p, 3, 8);
      g.fillRect(p, t - 1.5, 8, 3);
    }
  }
  g.fillStyle = 'rgba(240,240,230,0.85)';
  for (const sx of CFG.streets) {
    for (const sz of CFG.streets) {
      const tx = worldToTex(sx);
      const tz = worldToTex(sz);
      for (let k = -2; k <= 2; k++) {
        g.fillRect(tx - 9 + k * 4, tz - 11, 2.5, 22);
        g.fillRect(tx - 11, tz - 9 + k * 4, 22, 2.5);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const buildingRects = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Ground: one textured plane for the whole map.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Ocean: a plane east of the sand, animated gently by the renderer.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(320, WORLD_SIZE),
    new THREE.MeshPhongMaterial({ color: COLOURS.water, shininess: 120, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CFG.waterStart + 160, -0.4, 0);
  water.receiveShadow = true;
  group.add(water);

  // Facade variants, shared by every building.
  const facades = COLOURS.building.map((col) => facadeTexture('#' + col.toString(16).padStart(6, '0'), 10, 5));
  const downtownFacades = COLOURS.downtown.map((col) => facadeTexture('#' + col.toString(16).padStart(6, '0'), 18, 7));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  function addBuilding(cx, cz, w, d, h, downtown) {
    const tex = downtown ? downtownFacades[Math.floor(rng.next() * downtownFacades.length)]
      : facades[Math.floor(rng.next() * facades.length)];
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, 0, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    buildingRects.push({ x: cx, z: cz, w, d });
  }

  // One building per block, taller downtown, none in the park or the port.
  for (let i = 0; i < CFG.streets.length - 1; i++) {
    for (let j = 0; j < CFG.streets.length - 1; j++) {
      const x0 = CFG.streets[i] + CFG.streetHalf;
      const z0 = CFG.streets[j] + CFG.streetHalf;
      const cx = x0 + CFG.block / 2;
      const cz = z0 + CFG.block / 2;
      if (cx > CFG.park.minX - 2 && cx < CFG.park.maxX + 2 && cz > CFG.park.minZ - 2 && cz < CFG.park.maxZ + 2) continue;
      if (cx > CFG.port.minX && cx < CFG.port.maxX && cz > CFG.port.minZ && cz < CFG.port.maxZ) continue;
      const downtown = cx > CFG.downtown.minX && cx < CFG.downtown.maxX && cz > CFG.downtown.minZ && cz < CFG.downtown.maxZ;
      const w = downtown ? rng.range(26, 38) : rng.range(24, 40);
      const d = downtown ? rng.range(26, 38) : rng.range(24, 40);
      const h = downtown ? rng.range(35, 95) : rng.range(8, 26);
      addBuilding(cx, cz, w, d, h, downtown);
    }
  }

  // Port warehouses and container stacks.
  const contCols = [0xc0392b, 0x2e6db4, 0x27ae60, 0xe67e22];
  for (let k = 0; k < 5; k++) {
    const wx = CFG.port.minX + 30 + k * 32;
    const wz = CFG.port.minZ + 22;
    addBuilding(wx, wz, 26, 16, 10, false);
  }
  for (let k = 0; k < 14; k++) {
    const cx = CFG.port.minX + 20 + rng.range(0, 130);
    const cz = CFG.port.minZ + 55 + rng.range(0, 45);
    const mat = new THREE.MeshLambertMaterial({ color: contCols[k % contCols.length] });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(12, 2.6, 2.6);
    mesh.position.set(cx, 0, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: cx - 6, maxX: cx + 6, minZ: cz - 1.3, maxZ: cz + 1.3 });
    buildingRects.push({ x: cx, z: cz, w: 12, d: 2.6 });
  }

  // Palms: instanced trunks and canopies along the beach, the park and
  // a few sidewalks.
  const palmSpots = [];
  for (let z = -240; z <= 240; z += 30) palmSpots.push([CFG.beachStart + 8 + rng.range(-3, 3), z + rng.range(-8, 8)]);
  for (let k = 0; k < 12; k++) palmSpots.push([CFG.park.minX + rng.range(4, 42), CFG.park.minZ + rng.range(4, 42)]);
  for (let k = 0; k < 24; k++) {
    const s = CFG.streets[Math.floor(rng.next() * CFG.streets.length)];
    palmSpots.push([s + CFG.streetHalf + 2.5, CFG.streets[Math.floor(rng.next() * CFG.streets.length)] + rng.range(-100, 100)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 5, 6);
  trunkGeo.translate(0, 2.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.ConeGeometry(2.8, 3.2, 7);
  canopyGeo.translate(0, 6.2, 0);
  canopyGeo.scale(1, 0.55, 1); // a flat palm canopy, not a pine cone
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f7a33 });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  palmSpots.forEach(([x, z], i) => {
    m4.makeRotationY(rng.next() * Math.PI * 2);
    m4.setPosition(x, 0, z);
    trunks.setMatrixAt(i, m4);
    canopies.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  canopies.castShadow = true;
  group.add(trunks);
  group.add(canopies);

  // Street lights at intersection corners, instanced.
  const lightSpots = [];
  for (const sx of CFG.streets) {
    for (const sz of CFG.streets) {
      lightSpots.push([sx + CFG.streetHalf + 1, sz + CFG.streetHalf + 1]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 5);
  poleGeo.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f45 }), lightSpots.length);
  const headGeo = new THREE.SphereGeometry(0.28, 6, 5);
  headGeo.translate(0, 6.1, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x554411 }), lightSpots.length);
  lightSpots.forEach(([x, z], i) => {
    m4.identity();
    m4.setPosition(x, 0, z);
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
  });
  group.add(poles);
  group.add(heads);

  // Invisible walls at the map edges (the water blocks the east at x 320 —
  // the ground plane ends there, so nothing may walk past the shoreline).
  colliders.push({ minX: -320, maxX: -262, minZ: -320, maxZ: 320 });
  colliders.push({ minX: 262, maxX: 320, minZ: -320, maxZ: -262 });
  colliders.push({ minX: 262, maxX: 320, minZ: 262, maxZ: 320 });
  colliders.push({ minX: 320, maxX: 640, minZ: -320, maxZ: 320 });
  colliders.push({ minX: -320, maxX: 320, minZ: -320, maxZ: -262 });
  colliders.push({ minX: -320, maxX: 320, minZ: 262, maxZ: 320 });

  scene.add(group);
  return {
    colliders,
    buildingRects,
    water,
    group,
  };
}

// Is the point on a street (drivable) rather than a block?
export function isRoad(x, z) {
  for (const s of CFG.streets) {
    if (Math.abs(x - s) <= CFG.streetHalf + 1 || Math.abs(z - s) <= CFG.streetHalf + 1) return true;
  }
  return false;
}

// The nearest point on the road network, for spawning cars and walkers.
export function nearestRoadPoint(x, z, rng) {
  let best = null;
  let bestD = Infinity;
  for (const sx of CFG.streets) {
    for (const sz of CFG.streets) {
      const d = Math.hypot(x - sx, z - sz);
      if (d < bestD) {
        bestD = d;
        best = [sx, sz];
      }
    }
  }
  const [ix, iz] = best;
  if (Math.abs(x - ix) < Math.abs(z - iz)) return [ix + rng.range(-3, 3), z];
  return [x, iz + rng.range(-3, 3)];
}

// Push a circle (x, z, radius) out of every collider it overlaps. Returns
// true when anything pushed it, so callers can react (a crash, a scrape).
export function resolveCircle(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Dead centre of a box: push out along the smallest penetration.
        const pl = pos.x - c.minX;
        const pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ;
        const pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}
