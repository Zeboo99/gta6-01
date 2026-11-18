// Seeded random numbers (mulberry32). The same seed gives the same city,
// the same traffic and the same screenshot scenes, which is what makes the
// deterministic ?shot= scenes repeatable.

export class Rng {
  constructor(seed) {
    this.a = seed | 0;
  }

  next() {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  chance(p) {
    return this.next() < p;
  }

  // Pick a value from -1 or 1.
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

// A shared generator for anything that only needs variety, not replay.
export const rng = new Rng(20261117);
