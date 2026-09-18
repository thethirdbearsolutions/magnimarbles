// Boards are size [width, depth], centered on the origin, x to the right and
// z toward the camera. Magnet charge: + repels the marble, - pulls it.
// Challenges: { time: s } finish under s seconds; { magnets: n } win using
// exactly n; { attempts: n } win within n tries.

export const LEVELS = [
  {
    name: "First Pull",
    size: [24, 16],
    start: [-9, 0],
    startVelocity: [7, 0],
    goal: { x: 9, z: 4.5, r: 1.1 },
    budget: 2,
    walls: [
      { x: 2, z: 0, w: 1, d: 7 },
    ],
    challenges: [{ time: 6 }, { magnets: 1 }, { attempts: 2 }],
  },
  {
    name: "The Pit",
    size: [24, 16],
    start: [-9, -5],
    startVelocity: [0, 0],
    goal: { x: 9, z: 5, r: 1.1 },
    budget: 3,
    walls: [
      { x: -3, z: 3, w: 1, d: 10 },
    ],
    pits: [
      { x: 3, z: -0.5, w: 5, d: 7 },
    ],
    spikes: [
      { x: 7, z: 1, r: 0.6 },
      { x: 11, z: -2, r: 0.6 },
    ],
    challenges: [{ time: 10 }, { magnets: 2 }, { attempts: 4 }],
  },
  {
    name: "Fortress",
    size: [26, 18],
    start: [-10, 0],
    startVelocity: [5, 0],
    goal: { x: 8.7, z: 0, r: 1.1 },
    budget: 4,
    walls: [
      { x: 10.5, z: 0, w: 1, d: 8 },
      { x: 7.25, z: -3.5, w: 7.5, d: 1 },
      { x: 7.25, z: 3.5, w: 7.5, d: 1 },
    ],
    magnets: [
      { x: 6, z: 0, q: 0.6 },
    ],
    ice: [
      { x: -2, z: 5, w: 8, d: 5 },
    ],
    spikes: [
      { x: 0, z: -5, r: 0.6 },
      { x: 1, z: 5, r: 0.6 },
    ],
    challenges: [{ time: 5 }, { magnets: 1 }, { attempts: 6 }],
  },
];
