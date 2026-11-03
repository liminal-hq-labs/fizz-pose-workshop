// Reports each saved cycle's canvas, content box, palette letters and byte cost against the Lieutenant Fizz 2 sprite format.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { loadSavedFrames, savedAnimations } from './motion-metrics.ts';
import type { Frame } from '../src/types.ts';

// What the game's docs/SPRITES.md and assets/sprites/ep2-ben-a.json use for Ben: 24 by 32, anchored at the feet and centre.
export const gameCanvas = { width: 24, height: 32, anchor: [12, 32] } as const;
// The game's EGA letters in index order (SPRITES.md palette table); `.` is transparent.
export const gameLetters = 'kBGCRMNLDbgcrmyW';

export interface CycleReport {
  readonly name: string; readonly frames: number;
  readonly canvas: readonly [number, number];
  /** Union of the opaque pixels across the cycle: left, top, right and bottom edges (inclusive). */
  readonly content: readonly [number, number, number, number];
  readonly contentSize: readonly [number, number];
  readonly fitsGameCanvas: boolean;
  /** Anchor in the lab canvas that lands on the game's [12, 32] when the content is cropped to 24 by 32 around the feet. */
  readonly anchor: readonly [number, number];
  readonly letters: string; readonly unknownLetters: string;
  readonly bytes8Native: number; readonly bytes4Native: number; readonly bytes8Game: number; readonly bytes4Game: number;
}

function opaqueBox(frames: readonly Frame[]): [number, number, number, number] {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (const frame of frames) frame.grid.forEach((row, y) => [...row].forEach((code, x) => {
    if (code === '.') return;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }));
  return [left, top, right, bottom];
}

export function reportCycles(): CycleReport[] {
  const saved = loadSavedFrames();
  return Object.entries(savedAnimations).map(([name, animation]) => {
    const frames = animation.frames.map(key => saved[key]);
    const { width, height } = frames[0];
    const content = opaqueBox(frames), contentSize: [number, number] = [content[2] - content[0] + 1, content[3] - content[1] + 1];
    const used = new Set(frames.flatMap(frame => frame.grid.flatMap(row => [...row]))); used.delete('.');
    const letters = [...used].sort().join(''), unknownLetters = [...used].filter(code => !gameLetters.includes(code)).sort().join('');
    // The feet sit on the bottom opaque row; the body centre is the middle of the content box.
    const anchor: [number, number] = [Math.round((content[0] + content[2] + 1) / 2), content[3] + 1];
    const native = width * height * frames.length, game = gameCanvas.width * gameCanvas.height * frames.length;
    return { name, frames: frames.length, canvas: [width, height], content, contentSize, fitsGameCanvas: contentSize[0] <= gameCanvas.width && contentSize[1] <= gameCanvas.height, anchor, letters, unknownLetters,
      bytes8Native: native, bytes4Native: native / 2, bytes8Game: game, bytes4Game: game / 2 };
  });
}

if (import.meta.main) {
  const reports = reportCycles();
  console.log(`Game canvas ${gameCanvas.width}x${gameCanvas.height}, anchor [${gameCanvas.anchor}]; letters ${gameLetters}`);
  console.log('cycle'.padEnd(16) + 'frames canvas  content  fits  anchor   8-bit native/game   4-bit native/game  letters outside game table');
  for (const r of reports) console.log(`${r.name.padEnd(16)}${String(r.frames).padStart(6)} ${r.canvas.join('x').padEnd(7)} ${r.contentSize.join('x').padEnd(7)} ${(r.fitsGameCanvas ? 'yes' : 'NO').padEnd(5)} [${r.anchor}]`.padEnd(54)
    + `${String(r.bytes8Native).padStart(7)}/${String(r.bytes8Game).padEnd(7)}${String(r.bytes4Native).padStart(8)}/${String(r.bytes4Game).padEnd(7)} ${r.unknownLetters || 'none'}`);
  const total = (pick: (r: CycleReport) => number): number => reports.reduce((sum, r) => sum + pick(r), 0);
  console.log(`Total: ${total(r => r.bytes8Native)} B native / ${total(r => r.bytes8Game)} B at game size (8-bit); ${total(r => r.bytes4Native)} / ${total(r => r.bytes4Game)} B (4-bit)`);
}
