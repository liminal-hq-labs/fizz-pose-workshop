// Draws Ben's ordered six-phase run from joint positions and saves editable frame grids.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runPhases, frameDurationMs, type Point, type Limb, type ShoeStyle, type RunPhase } from '../source/run-cycle.ts';
import type { Frame, Frames, WorkshopData } from '../src/types.ts';

class Art {
  readonly width = 24;
  readonly height = 44;
  readonly grid = Array.from({ length: this.height }, () => Array<string>(this.width).fill('.'));
  rect(x: number, y: number, width: number, height: number, colour: string): void {
    if (x < 0 || y < 0 || x + width > this.width || y + height > this.height) throw new Error(`Drawing clips at ${x},${y}.`);
    for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) this.grid[yy][xx] = colour;
  }
  row(x: number, y: number, codes: string): void {
    [...codes].forEach((code, i) => { if (code !== '.') this.rect(x + i, y, 1, 1, code); });
  }
  line(points: readonly Point[], width: number, colour: string, outline = true): void {
    const passes: [number, string][] = outline ? [[width + 2, 'k'], [width, colour]] : [[width, colour]];
    for (const [thickness, fill] of passes) for (let n = 1; n < points.length; n++) {
      const a = points[n - 1], b = points[n], steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
      for (let t = 0; t <= steps; t++) {
        const x = Math.round(a[0] + (b[0] - a[0]) * t / steps), y = Math.round(a[1] + (b[1] - a[1]) * t / steps);
        this.rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, fill);
      }
    }
  }
  shoe(ankle: Point, near: boolean, style: ShoeStyle): void {
    const x = ankle[0] - 1, y = ankle[1], sole = near ? 'W' : 'L';
    if (style === 'toeOff') {
      this.row(x - 1, y - 1, 'kkkk'); this.row(x - 1, y, 'kRRk'); this.row(x - 1, y + 1, 'kRRRk');
      this.row(x - 1, y + 2, `k${sole}${sole}RRk`); this.row(x, y + 3, `kkRR${sole}${sole}k`);
      this.row(x + 2, y + 4, `kk${sole}${sole}k`);
    } else {
      this.row(x - 1, y - 1, 'kkkkkkk'); this.row(x - 1, y, near ? 'kRRrrRk' : 'kRRRRRk');
      this.row(x - 1, y + 1, `kRRR${sole}${sole}k`); this.row(x - 1, y + 2, `k${sole.repeat(5)}k`);
    }
  }
  frame(): Frame { return { width: this.width, height: this.height, grid: this.grid.map(row => row.join('')) }; }
}

function arm(art: Art, limb: Limb, near: boolean, bob: number): void {
  const [shoulder, elbow, hand] = limb.map(([x, y]) => [x, y + bob] as Point);
  const sleeveEnd: Point = [Math.round((shoulder[0] + elbow[0]) / 2), Math.round((shoulder[1] + elbow[1]) / 2)];
  // One continuous outer outline lets the red sleeve meet the skin without a black cuff seam.
  art.line([shoulder, sleeveEnd, elbow, hand], 2, near ? 'W' : 'L');
  art.line([shoulder, sleeveEnd], 2, near ? 'r' : 'R', false);
  art.rect(hand[0], hand[1], 1, 1, near ? 'L' : 'D');
}

function stunner(art: Art, phase: RunPhase): void {
  const [hip, knee] = phase.nearLeg;
  const angle = Math.atan2(knee[0] - hip[0], knee[1] - hip[1]), cos = Math.cos(angle), sin = Math.sin(angle);
  const pixels = ['kDDk', 'kMmk', 'kMMk', '.kMk', '..k.'];
  const anchorX = 11.5, anchorY = 23.5 + phase.bob;
  for (let y = 21; y <= 32; y++) for (let x = 5; x <= 20; x++) {
    const dx = x - anchorX, dy = y - anchorY;
    const sx = Math.round(cos * dx - sin * dy + 1.5), sy = Math.round(sin * dx + cos * dy - .5);
    if (sy >= 0 && sy < 5 && sx >= 0 && sx < 4 && pixels[sy][sx] !== '.') art.rect(x, y, 1, 1, pixels[sy][sx]);
  }
}

const head: readonly (readonly [number, number, string])[] = [
  [2, 10, 'kkkkkk'], [3, 8, 'kkgggWggkk'], [4, 7, 'kgggggWgggk'], [5, 7, 'kGGgggWGGgk'],
  [6, 7, 'kGGggggWGGk'], [7, 7, 'kGGGGGGGGGGGk'], [8, 7, 'kGDDLLLLLLLLk'],
  [9, 9, 'kWWLWWBWk'], [10, 9, 'kLWWLWWWWk'], [11, 10, 'kLWWWRWk'], [12, 11, 'kLWWWk'],
  [13, 11, 'kLLLk'], [14, 10, 'kWWWWk'],
];
const torso: readonly (readonly [number, number, string])[] = [
  [15, 10, 'krrrrrk'], [16, 9, 'krrrrrrrk'], [17, 10, 'kRRRRyrk'], [18, 10, 'kRRRRyRk'],
  [19, 10, 'kRRRRRRk'], [20, 10, 'kRRRRRRk'], [21, 10, 'kRRRRRRk'], [22, 10, 'kRRRRRRk'], [23, 10, 'kDDyDDk'],
];


function headForTurn(turn: number): typeof head {
  if (!turn) return head;
  // Keep the shell and silhouette fixed; tiny feature shifts suggest camera-facing yaw.
  const changed: Record<number, readonly [number, number, string]> = turn < 0 ? {
    9: [9, 9, 'kWWLWBWWk'], 10: [10, 9, 'kLWWWLWWWk'], 11: [11, 10, 'kLWWRWWk'],
  } : {
    9: [9, 9, 'kWWLWWWBk'], 10: [10, 9, 'kLLWLWWWWk'], 11: [11, 10, 'kLWWWWRk'],
  };
  return head.map(row => changed[row[0]] ?? row);
}
function torsoForTurn(turn: number): typeof torso {
  if (!turn) return torso;
  const changed: Record<number, readonly [number, number, string]> = turn < 0 ? {
    15: [15, 9, 'krrrrrrrk'], 16: [16, 9, 'krrrrrrrk'], 17: [17, 9, 'kRRRRyyRk'], 18: [18, 9, 'kRRRRyRRk'],
  } : {
    15: [15, 11, 'krrrrrk'], 16: [16, 10, 'krrrrrrk'], 17: [17, 11, 'kRRRRRk'], 18: [18, 11, 'kRRRRRk'],
  };
  return torso.map(row => changed[row[0]] ?? row);
}

export function drawRunCycle(): Frames {
  const frames: Frames = {};
  runPhases.forEach((phase, index) => {
    const art = new Art();
    art.line(phase.farLeg, 2, 'B'); art.shoe(phase.farLeg[2], false, phase.farShoe);
    arm(art, phase.farArm, false, phase.bob);
    for (const [y, x, codes] of torsoForTurn(phase.torsoTurn)) art.row(x, y + phase.bob, codes);
    art.line(phase.nearLeg, 3, 'B');
    const [hip, knee] = phase.nearLeg, steps = Math.max(Math.abs(knee[0] - hip[0]), Math.abs(knee[1] - hip[1]));
    for (let t = 0; t <= steps; t++) art.rect(Math.round(hip[0] + (knee[0] - hip[0]) * t / steps), Math.round(hip[1] + (knee[1] - hip[1]) * t / steps), 1, 1, 'c');
    art.shoe(phase.nearLeg[2], true, phase.nearShoe);
    stunner(art, phase); arm(art, phase.nearArm, true, phase.bob);
    for (const [y, x, codes] of headForTurn(phase.headTurn)) art.row(x, y + phase.bob, codes);
    const frame = art.frame();
    frame.grid = frame.grid.map((row, y) => {
      const shift = y <= 14 + phase.bob ? 3 : y <= 19 + phase.bob ? 2 : y <= 22 + phase.bob ? 1 : 0;
      if (row.slice(24 - shift).replaceAll('.', '').length) throw new Error(`Frame ${index + 1} clips during lean.`);
      return '.'.repeat(shift) + row.slice(0, 24 - shift);
    });
    frames[`ben_walkRight${index + 1}`] = frame;
  });
  return frames;
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const authored: Omit<WorkshopData, 'palette'> = JSON.parse(await readFile(root + 'source/poses.json', 'utf8'));
  const edits: Frames = JSON.parse(await readFile(root + 'edits.json', 'utf8'));
  const frames = drawRunCycle();
  Object.assign(authored.frames, frames); Object.assign(edits, frames);
  authored.animations['walk-run'] = { frames: Object.keys(frames), durationsMs: runPhases.map(() => frameDurationMs) };
  await writeFile(root + 'source/poses.json', JSON.stringify(authored, null, 2) + '\n');
  await writeFile(root + 'edits.json', JSON.stringify(edits, null, 2) + '\n');
  console.log('Drew six ordered run frames: contact, push-off, flight, opposite contact, opposite push-off, flight.');
}
