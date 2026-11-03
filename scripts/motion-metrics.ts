// Measures frame-to-frame motion in saved sprite cycles: pixel change, head travel, feature flicker and outline gaps.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import authored from '../source/poses.json';
import palette from '../source/game-palette.json';
import { normaliseFrames } from '../src/palette.ts';
import { validateFrames } from '../src/model.ts';
import type { Animation, Frame, Frames } from '../src/types.ts';

/** Saved frames exactly as `bun run generate` exports them: authored grids with editor overrides applied. */
export function loadSavedFrames(): Frames {
  const frames = validateFrames(authored.frames, authored.frames, palette);
  const overrides: unknown = JSON.parse(readFileSync(new URL('../edits.json', import.meta.url), 'utf8'));
  if (overrides && typeof overrides === 'object' && Object.keys(overrides).length) Object.assign(frames, validateFrames(normaliseFrames(overrides), frames, palette));
  return frames;
}
export const savedAnimations: Readonly<Record<string, Animation>> = authored.animations;

/** One step from frame `from` to the next frame in playback order; the last step wraps to the first frame because every saved cycle loops. */
export interface CycleStep { readonly from: number; readonly to: number; }
export function cycleSteps(length: number): readonly CycleStep[] {
  return Array.from({ length }, (_, from) => ({ from, to: (from + 1) % length }));
}

export function changedPixels(a: Frame, b: Frame): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('Cannot compare frames of different sizes.');
  let count = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (a.grid[y][x] !== b.grid[y][x]) count++;
  return count;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Centre of the green helmet shell, which every Ben pose shows and which tracks the head. */
export function helmetCentre(frame: Frame): readonly [number, number] | null {
  let sumX = 0, sumY = 0, count = 0;
  frame.grid.forEach((row, y) => [...row].forEach((code, x) => { if (code === 'G' || code === 'g') { sumX += x; sumY += y; count++; } }));
  return count ? [sumX / count, sumY / count] : null;
}

export function colourCounts(frame: Frame): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const row of frame.grid) for (const code of row) if (code !== '.') counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}

const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** Coloured pixels that touch transparency directly instead of through the black `k` ink outline. */
export function exposedEdges(frame: Frame, codes?: ReadonlySet<string>): number {
  let count = 0;
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const code = frame.grid[y][x];
    if (code === '.' || code === 'k' || (codes && !codes.has(code))) continue;
    if (neighbours.some(([dx, dy]) => (frame.grid[y + dy]?.[x + dx] ?? '.') === '.')) count++;
  }
  return count;
}
export const helmetCodes: ReadonlySet<string> = new Set(['G', 'g']);
