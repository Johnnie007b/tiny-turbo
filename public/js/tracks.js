/* Tiny Turbo - track definitions (all original). s = fraction of lap length, d = lateral offset from the centre line. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const defs = [
    {
      id: 'breakfast', name: 'Breakfast Bedlam', blurb: 'Race across the kitchen table. Mind the edge!', theme: 'breakfast', edge: 'fall', hw: 80, startAt: [1250, 262], laps: 3, seed: 11,
      pts: [[420, 330], [950, 240], [1520, 290], [2020, 360], [2420, 560], [2480, 960], [2170, 1200], [1720, 1090], [1380, 1290], [1520, 1600], [1100, 1740], [600, 1630], [320, 1280], [520, 980], [270, 660]],
      hazards: [
        { k: 'ramp', s: 0.378, d: -42, r: 40 }, { k: 'ramp', s: 0.378, d: 42, r: 40 },
        { k: 'boost', s: 0.03, d: 0, r: 34 }, { k: 'oil', s: 0.13, d: -30, r: 36 }, { k: 'water', s: 0.27, d: 25, r: 40 },
        { k: 'boost', s: 0.52, d: 25, r: 30 }, { k: 'oil', s: 0.655, d: 20, r: 34 },
        { k: 'boost', s: 0.7, d: -20, r: 30 }, { k: 'water', s: 0.83, d: -30, r: 38 }, { k: 'oil', s: 0.92, d: 30, r: 32 }
      ],
      gaps: [{ s0: 0.385, s1: 0.4 }],
      obstacles: [
        { k: 'bowl', s: 0.08, d: 52, r: 30 }, { k: 'mug', s: 0.18, d: -55, r: 20 }, { k: 'jar', s: 0.22, d: 50, r: 17 },
        { k: 'cube', s: 0.31, d: -40, r: 10 }, { k: 'cube', s: 0.315, d: -22, r: 10 }, { k: 'bowl', s: 0.46, d: -50, r: 30 },
        { k: 'mug', s: 0.56, d: -50, r: 20 }, { k: 'jar', s: 0.66, d: 48, r: 17 }, { k: 'cube', s: 0.74, d: 30, r: 10 },
        { k: 'bowl', s: 0.78, d: 52, r: 30 }, { k: 'mug', s: 0.88, d: 52, r: 20 }, { k: 'jar', s: 0.96, d: -52, r: 17 }
      ]
    },
    {
      id: 'workbench', name: 'Workbench Rally', blurb: 'Tight chicanes between bolts, cans and vises.', theme: 'workbench', edge: 'wall', hw: 74, startAt: [1350, 270], laps: 3, seed: 23,
      pts: [[480, 285], [1000, 250], [1700, 310], [2250, 360], [2520, 700], [2300, 1030], [1850, 1060], [1600, 820], [1170, 800], [900, 1070], [1000, 1330], [1500, 1470], [2000, 1480], [2330, 1580], [2330, 1780], [1900, 1860], [1100, 1830], [500, 1700], [260, 1250], [330, 900], [520, 620]],
      hazards: [
        { k: 'ramp', s: 0.3295, d: -42, r: 40 }, { k: 'ramp', s: 0.3295, d: 42, r: 40 },
        { k: 'ramp', s: 0.8295, d: -42, r: 40 }, { k: 'ramp', s: 0.8295, d: 42, r: 40 },
        { k: 'boost', s: 0.02, d: 0, r: 32 }, { k: 'oil', s: 0.1, d: 20, r: 36 }, { k: 'boost', s: 0.19, d: -20, r: 30 },
        { k: 'oil', s: 0.4, d: -25, r: 34 }, { k: 'water', s: 0.5, d: 20, r: 38 },
        { k: 'boost', s: 0.58, d: 0, r: 30 }, { k: 'oil', s: 0.7, d: 24, r: 34 }, { k: 'boost', s: 0.9, d: 20, r: 30 }
      ],
      gaps: [{ s0: 0.335, s1: 0.3455 }, { s0: 0.835, s1: 0.8455 }],
      obstacles: [
        { k: 'bolt', s: 0.06, d: 40, r: 13 }, { k: 'can', s: 0.15, d: -42, r: 24 }, { k: 'bolt', s: 0.23, d: 38, r: 13 },
        { k: 'can', s: 0.27, d: 40, r: 24 }, { k: 'bolt', s: 0.44, d: 40, r: 13 }, { k: 'can', s: 0.47, d: -40, r: 24 },
        { k: 'bolt', s: 0.55, d: -38, r: 13 }, { k: 'can', s: 0.64, d: 42, r: 24 }, { k: 'bolt', s: 0.67, d: -40, r: 13 },
        { k: 'can', s: 0.75, d: -42, r: 24 }, { k: 'bolt', s: 0.87, d: 38, r: 13 }, { k: 'can', s: 0.95, d: -42, r: 24 }
      ]
    },
    {
      id: 'sandbox', name: 'Sandbox Safari', blurb: 'Loose sand, puddles and rocks in the backyard.', theme: 'sandbox', edge: 'rough', hw: 86, startAt: [760, 500], laps: 3, seed: 37,
      pts: [[500, 640], [1000, 380], [1600, 520], [2020, 320], [2520, 520], [2570, 1010], [2120, 1260], [1720, 1020], [1320, 1220], [1520, 1620], [1020, 1770], [520, 1520], [320, 1020]],
      hazards: [
        { k: 'ramp', s: 0.328, d: -42, r: 40 }, { k: 'ramp', s: 0.328, d: 42, r: 40 },
        { k: 'boost', s: 0.03, d: 0, r: 34 }, { k: 'water', s: 0.12, d: -20, r: 44 }, { k: 'oil', s: 0.2, d: 25, r: 36 },
        { k: 'boost', s: 0.42, d: -25, r: 30 }, { k: 'water', s: 0.52, d: 25, r: 44 },
        { k: 'oil', s: 0.6, d: -25, r: 34 }, { k: 'boost', s: 0.68, d: 0, r: 30 }, { k: 'water', s: 0.8, d: -15, r: 44 }, { k: 'boost', s: 0.92, d: 25, r: 30 }
      ],
      gaps: [{ s0: 0.335, s1: 0.35 }],
      obstacles: [
        { k: 'rock', s: 0.07, d: 55, r: 22 }, { k: 'bucket', s: 0.16, d: -55, r: 24 }, { k: 'rock', s: 0.25, d: -50, r: 18 },
        { k: 'pot', s: 0.38, d: 55, r: 22 }, { k: 'rock', s: 0.46, d: 50, r: 22 }, { k: 'bucket', s: 0.56, d: 55, r: 24 },
        { k: 'rock', s: 0.64, d: -55, r: 22 }, { k: 'pot', s: 0.72, d: -55, r: 22 }, { k: 'rock', s: 0.76, d: 50, r: 18 },
        { k: 'bucket', s: 0.86, d: -55, r: 24 }, { k: 'pot', s: 0.97, d: 55, r: 22 }
      ]
    },
    {
      id: 'bathtub', name: 'Bubble Bath Bash', blurb: 'Slippery porcelain, rubber ducks and soap!', theme: 'bathtub', edge: 'wall', hw: 80, startAt: [1000, 345], grip: 0.82, laps: 3, seed: 53,
      pts: [[620, 430], [1420, 320], [2220, 430], [2570, 830], [2270, 1170], [1830, 1250], [1620, 1030], [1230, 1030], [1050, 1320], [1300, 1620], [1150, 1880], [650, 1820], [330, 1400], [370, 820]],
      hazards: [
        { k: 'ramp', s: 0.5505, d: -42, r: 40 }, { k: 'ramp', s: 0.5505, d: 42, r: 40 },
        { k: 'boost', s: 0.03, d: 0, r: 34 }, { k: 'oil', s: 0.12, d: -25, r: 38 }, { k: 'water', s: 0.2, d: 20, r: 40 },
        { k: 'boost', s: 0.3, d: 0, r: 30 }, { k: 'oil', s: 0.42, d: 25, r: 36 }, { k: 'water', s: 0.64, d: -20, r: 40 }, { k: 'boost', s: 0.74, d: 20, r: 30 }, { k: 'oil', s: 0.84, d: -25, r: 36 }, { k: 'boost', s: 0.93, d: 0, r: 30 }
      ],
      gaps: [{ s0: 0.557, s1: 0.5714 }],
      obstacles: [
        { k: 'duck', s: 0.08, d: 50, r: 17 }, { k: 'soap', s: 0.16, d: -52, r: 22 }, { k: 'duck', s: 0.25, d: -50, r: 17 },
        { k: 'bomb', s: 0.35, d: 50, r: 15 }, { k: 'soap', s: 0.46, d: -52, r: 22 }, { k: 'duck', s: 0.6, d: 50, r: 17 },
        { k: 'soap', s: 0.69, d: 52, r: 22 }, { k: 'bomb', s: 0.79, d: -50, r: 15 }, { k: 'duck', s: 0.88, d: 50, r: 17 }, { k: 'soap', s: 0.97, d: -52, r: 22 }
      ]
    }
  ];
  TT.trackDefs = defs;
  if (typeof module === 'object' && module.exports) module.exports = defs;
})(typeof window !== 'undefined' ? window : globalThis);
