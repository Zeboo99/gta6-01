// The HUD and the menus: health, wanted stars, money, ammo, the objective
// line, the mission dialogue, the minimap, and the start / pause / busted /
// wasted screens. The minimap is a 2D canvas drawn from the same city data
// the 3D world is built from.

import { CFG } from './config.js';

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'health-fill', 'health-text', 'stars', 'money', 'ammo', 'objective', 'objective-label', 'dialogue', 'dialogue-name', 'dialogue-text', 'toast', 'minimap', 'speed', 'controls-hint', 'crosshair', 'menu', 'menu-title', 'menu-sub', 'menu-btn', 'pause', 'pause-btn', 'end', 'end-title', 'end-text', 'end-btn']) {
      this.el[id] = document.getElementById(id);
    }
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.dialogueTimer = 0;
    this.toastTimer = 0;
  }

  showMenu(title, sub, btnLabel, onClick) {
    // The h1 title is static in the HTML; only the subtitle and button change.
    this.el.menu.style.display = 'flex';
    this.el['menu-sub'].textContent = sub;
    this.el['menu-btn'].textContent = btnLabel;
    this.el['menu-btn'].onclick = onClick;
    this.el.hud.style.display = 'none';
  }

  hideMenu() {
    this.el.menu.style.display = 'none';
    this.el.hud.style.display = 'block';
  }

  showPause(onResume) {
    this.el.pause.style.display = 'flex';
    this.el['pause-btn'].onclick = onResume;
  }

  hidePause() {
    this.el.pause.style.display = 'none';
  }

  showEnd(title, text, btnLabel, onClick) {
    this.el.end.style.display = 'flex';
    this.el['end-title'].textContent = title;
    this.el['end-text'].textContent = text;
    this.el['end-btn'].textContent = btnLabel;
    this.el['end-btn'].onclick = onClick;
  }

  hideEnd() {
    this.el.end.style.display = 'none';
  }

  updateHUD(world) {
    const player = world.player;
    const healthPct = Math.max(0, player.health);
    this.el['health-fill'].style.width = healthPct + '%';
    this.el['health-text'].textContent = Math.ceil(healthPct) + ' HP';
    let stars = '';
    for (let i = 0; i < CFG.wanted.maxStars; i++) {
      stars += i < world.police.stars ? '★' : '☆';
    }
    this.el.stars.textContent = stars;
    this.el.stars.style.color = world.police.stars > 0 ? '#ffd24a' : '#888';
    this.el.money.textContent = '$' + player.money.toLocaleString('en-US');
    this.el.ammo.textContent = player.inCar ? '—' : (player.ammo + ' ammo');
    this.el.objective.textContent = world.missions.objective;
    const speed = player.inCar && player.inCar.drive ? Math.abs(player.inCar.drive.speed) * 3.6 : player.speed * 3.6;
    this.el.speed.textContent = Math.round(speed) + ' km/h';
    this.el.crosshair.style.display = player.aiming && !player.inCar ? 'block' : 'none';
    this.el['controls-hint'].style.display = world.started ? 'none' : 'block';
  }

  showDialogue(name, text, seconds = 6) {
    this.el['dialogue-name'].textContent = name;
    this.el['dialogue-text'].textContent = text;
    this.el.dialogue.style.display = 'block';
    this.dialogueTimer = seconds;
  }

  showToast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    this.toastTimer = seconds;
  }

  tick(dt) {
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.el.dialogue.style.display = 'none';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.display = 'none';
    }
  }

  // Draw the minimap: streets, blocks, water, the park, the mission
  // marker, traffic, the player arrow and the north indicator.
  drawMinimap(world) {
    const ctx = this.minimapCtx;
    const size = 190;
    const scale = size / 640;
    const toMap = (v) => (v + 320) * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#20262b';
    ctx.fillRect(0, 0, size, size);
    // Water.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(toMap(CFG.waterStart), 0, size - toMap(CFG.waterStart), size);
    // Sand.
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(toMap(CFG.beachStart), 0, toMap(CFG.sandEnd) - toMap(CFG.beachStart), size);
    // Park.
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(toMap(CFG.park.minX), toMap(CFG.park.minZ), (CFG.park.maxX - CFG.park.minX) * scale, (CFG.park.maxZ - CFG.park.minZ) * scale);
    // Blocks.
    ctx.fillStyle = '#3a3f45';
    for (const b of world.city.buildingRects) {
      ctx.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), b.w * scale, b.d * scale);
    }
    // Streets.
    ctx.fillStyle = '#6a6f75';
    for (const s of CFG.streets) {
      ctx.fillRect(toMap(s - CFG.streetHalf), 0, CFG.streetHalf * 2 * scale, size);
      ctx.fillRect(0, toMap(s - CFG.streetHalf), size, CFG.streetHalf * 2 * scale);
    }
    // Mission marker.
    if (world.missions.active) {
      const m = world.missions.markerPos;
      const pulse = 1 + Math.sin(world.time * 4) * 0.2;
      ctx.fillStyle = '#f7c948';
      ctx.beginPath();
      ctx.arc(toMap(m.x), toMap(m.z), 6 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Cop cars (blue dots).
    ctx.fillStyle = '#4a90ff';
    for (const c of world.police.copCars) {
      ctx.beginPath();
      ctx.arc(toMap(c.mesh.position.x), toMap(c.mesh.position.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies (red dots).
    ctx.fillStyle = '#ff4a4a';
    for (const e of world.missions.enemies) {
      ctx.beginPath();
      ctx.arc(toMap(e.mesh.position.x), toMap(e.mesh.position.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = toMap(world.player.x);
    const pz = toMap(world.player.z);
    const heading = world.player.inCar ? world.player.inCar.heading : world.player.heading;
    ctx.save();
    ctx.translate(px, pz);
    // Screen up is world -z; rotate the up-pointing arrow to the heading.
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    // North indicator.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', 8, 14);
  }
}
