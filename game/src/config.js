// Solmar City — tuning and layout constants. One source of truth for every
// system: the city grid, the player and car feel, the wanted ladder, the
// mission payouts and the audio levels. Nothing here imports three.js.

export const CFG = {
  title: 'SOLMAR CITY',
  saveKey: 'solmar-save-v1',

  // City grid: streets run both ways at these coordinates (metres). Blocks
  // sit between neighbouring streets; a block is 46 m wide, streets 14 m.
  streets: [-240, -180, -120, -60, 0, 60, 120, 180, 240],
  streetHalf: 7,
  block: 46,
  cityHalf: 247,
  // East edge: sand from x 254 to 320, ocean beyond it.
  beachStart: 254,
  sandEnd: 320,
  waterStart: 320,
  // Downtown towers live in this rectangle; the port (warehouses) in the
  // south-west; one park block is kept free of buildings.
  downtown: { minX: -130, maxX: 130, minZ: -247, maxZ: -60 },
  port: { minX: -247, maxX: -60, minZ: 190, maxZ: 247 },
  park: { minX: 7, maxX: 53, minZ: 67, maxZ: 113 },

  player: {
    walkSpeed: 6,
    runSpeed: 10.5,
    accel: 40,
    jumpSpeed: 8.5,
    gravity: 24,
    radius: 0.55,
    height: 1.8,
    maxHealth: 100,
    punchDamage: 25,
    punchRange: 2.2,
    punchCooldown: 0.45,
    gunDamage: 34,
    gunRange: 60,
    gunCooldown: 0.22,
    startAmmo: 48,
    maxAmmo: 240,
  },

  car: {
    accel: 22,
    brake: 34,
    reverseAccel: 12,
    maxSpeed: 38,
    maxReverse: 10,
    steer: 1.9,
    grip: 6,
    offRoadMax: 14,
    radius: 1.6,
  },

  traffic: { count: 20, speedMin: 7, speedMax: 12 },
  pedestrians: { count: 24, speedMin: 1.2, speedMax: 2.2 },

  wanted: {
    maxStars: 5,
    stealCar: 1,
    assault: 1,
    kill: 2,
    shootNearCop: 1,
    decayDelay: 8,
    decayPerStar: 6,
    // cop spawns per star level: [cars, foot cops]
    response: [[0, 0], [1, 0], [2, 1], [3, 2], [4, 3], [5, 4]],
    copCarSpeed: 30,
    copFootSpeed: 7.5,
    bustedSeconds: 2.5,
    bustedFine: 200,
    wastedFine: 150,
  },

  money: { start: 250, taxiFare: 60, pickupCash: 40 },

  missions: [
    { id: 'm1', title: 'First Fare', payout: 300 },
    { id: 'm2', title: 'The Package', payout: 450 },
    { id: 'm3', title: 'Hot Wheels', payout: 600 },
    { id: 'm4', title: 'Rival Crew', payout: 900 },
    { id: 'm5', title: 'The Getaway', payout: 1200 },
    { id: 'm6', title: 'The Big Score', payout: 2500 },
  ],

  audio: { music: 0.5, sfx: 0.9 },
};

export const COLOURS = {
  sky: 0x87b5d6,
  fog: 0xcfe0ea,
  sun: 0xffe3b3,
  asphalt: 0x33363b,
  sidewalk: 0x9a9a92,
  grass: 0x5d8a4a,
  sand: 0xd9c08a,
  water: 0x2e7fa8,
  building: [0xc9a689, 0xa8b6c4, 0xd8c9a3, 0x9fb4a4, 0xc4a4a4, 0x8fa8bf, 0xd0b090],
  downtown: [0x7e93a8, 0x93a7b8, 0x6d8296, 0xa8b0b8],
  car: [0xc0392b, 0x2e6db4, 0x27ae60, 0xe67e22, 0x8e44ad, 0xf1c40f, 0xecf0f1, 0x2c3e50],
  taxi: 0xf7c948,
  policeCar: 0x1c2733,
  shirt: [0xd95f4b, 0x4b8fd9, 0x5cb85c, 0xe8b13c, 0x9b59b6, 0xecf0f1, 0x34495e],
};
