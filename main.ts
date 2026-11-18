// Solmar City — the hand-in program for the "Make GTA 6" bounty
// (Node 22, standard library only).
//
// The game lives in game/ beside this file: plain static files a desktop
// browser loads offline (index.html plus ES modules and the vendored
// three.js build, no network request). This program hands the game in by
// copying game/ and screenshots/ into the output directory and writing
// /output/dossier.json with the kit's vendored library. It never deletes
// the output directory: the grader mounts /output itself, so removing it
// would fail the run (the fps-02 lesson). Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output, e.g.
// `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.
//
// What the dossier describes: a 3D open-world crime game set in Solmar, a
// coastal city on a 9x9 street grid with downtown towers, a port, a park
// and a beach. The player walks and drives, steals cars, earns wanted
// stars and outruns police cars and foot cops, fights rivals, and runs a
// six-mission story from the first taxi fare to the big score at the port,
// with a HUD, a live minimap, pickups and localStorage saves.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function countGameFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = countGameFiles(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

// The scorer's own caps (kit reference/gate.json): the dossier writer only
// shapes the text size; the rest refuse an entry the scorer would refuse,
// so check them here first and fail loudly instead of handing in a bad run.
const gameDir = join(repoRoot, 'game');
const shotDir = join(repoRoot, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
if (!existsSync(join(gameDir, 'vendor', 'three.module.min.js'))) throw new Error('game/vendor/three.module.min.js is missing (three.js must be vendored, no CDN)');
const gameSize = countGameFiles(gameDir);
if (gameSize.files > 993) throw new Error(`game/ holds ${gameSize.files} files, cap 993`);
if (gameSize.bytes > 48 * 1024 * 1024) throw new Error(`game/ is ${gameSize.bytes} bytes, cap 48 MiB`);
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > 4) throw new Error(`screenshots/ holds ${shots.length} images, need 3 or 4`);
for (const name of shots) {
  const size = statSync(join(shotDir, name)).size;
  if (size > 256 * 1024) throw new Error(`screenshot ${name} is ${size} bytes, cap 256 KiB`);
}

copyTree(gameDir, join(outDir, 'game'));
copyTree(shotDir, join(outDir, 'screenshots'));

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
