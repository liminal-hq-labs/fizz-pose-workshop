// The cartoon Ben's measurements, colours, default switches, bone names and palette mapping.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Spec, Options } from "./types.ts";

/** Variation G's fixed measurements and colours. */
const measurements = {
  id: "G",
  hs: 1.08,
  eye: 1.0,
  legU: 4.5,
  legL: 4.25,
  ank: 2.1,
  seg: [3.0, 3.0, 3.9],
  neck: 1.1,
  sw: 3.5,
  shUp: 2.4,
  aU: 4.4,
  aL: 3.8,
  hand: 2.6,
  hipHalf: 1.5,
  tW: 5.4,
  tD: 4.0,
  armR: 0.8,
  legR: 1.08,
  shoeL: 5.75,
  shoeW: 2.5,
  col: {
    helmet: 0x49d957,
    helmetD: 0x1c8a38,
    rim: 0xb4b8c4,
    shirt: 0xd93a32,
    shirtD: 0xb02a25,
    jeans: 0x2f45b8,
    jeansD: 0x22338f,
    stripe: 0x6f8cf0,
    shoe: 0xc62d2d,
    skin: 0xf6c7a2,
    hair: 0xb98a45,
    eye: 0x2d55d8,
    mouth: 0xb3202c,
    belt: 0x4a4a55,
  },
};
/** The default switches: grape fizz, the can-loader Stunner, high-tops, seams and stripe, cut vents and a wrist computer. */
export const defaultOptions: Options = {
  line: 0.11,
  fizz: "grape",
  stunner: "can",
  shoe: "high",
  jeans: "both",
  cheeks: "none",
  vents: "holes",
  helmet: true,
  backpack: false,
  wrist: true,
};
export const fizzColours: Record<string, { l: number; d: number }> = {
  grape: { l: 0xff55ff, d: 0xaa00aa },
  cream: { l: 0xff9ac4, d: 0xd9457f },
};
/** The seventeen bones as `[name, label]`, in skeleton order. */
export const joints = [
  ["pelvis", "Hips"],
  ["spine", "Waist"],
  ["chest", "Chest"],
  ["neck", "Neck"],
  ["head", "Head"],
  ["armU-1", "Right shoulder"],
  ["armL-1", "Right elbow"],
  ["hand-1", "Right wrist"],
  ["armU1", "Left shoulder"],
  ["armL1", "Left elbow"],
  ["hand1", "Left wrist"],
  ["legU-1", "Right hip"],
  ["legL-1", "Right knee"],
  ["foot-1", "Right ankle"],
  ["legU1", "Left hip"],
  ["legL1", "Left knee"],
  ["foot1", "Left ankle"],
];
export const jointIndex: Record<string, number> = {};
joints.forEach((j, i) => {
  jointIndex[j[0]] = i;
});

/** The measurements merged with a set of switches. */
export function benGSpec(options: Partial<Options> = {}): Spec {
  return { ...measurements, ...defaultOptions, ...options };
}
const gamePalette = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa, 0x555555,
  0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];
/** The game palette colour a model colour stands for in sprite renders. */
export function paletteColour(hex: number, C: Record<string, number>): number {
  const named: Record<string, number> = {
    skin: 0xffffff,
    hair: 0xaa5500,
    shirt: 0xaa0000,
    shirtD: 0xaa0000,
    jeans: 0x0000aa,
    jeansD: 0x0000aa,
    stripe: 0x55ffff,
    helmet: 0x00aa00,
    helmetD: 0x00aa00,
    rim: 0xaaaaaa,
    shoe: 0xaa0000,
    eye: 0x0000aa,
    mouth: 0xaa0000,
    belt: 0x555555,
  };
  for (const k in named) if (C[k] === hex) return named[k];
  let best = 0;
  let bd = 1e9;
  const r = hex >> 16;
  const g = (hex >> 8) & 255;
  const bl = hex & 255;
  gamePalette.forEach((e) => {
    const d =
      Math.pow(r - (e >> 16), 2) + Math.pow(g - ((e >> 8) & 255), 2) + Math.pow(bl - (e & 255), 2);
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  return best;
}
