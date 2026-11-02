// Converts legacy workshop colour codes to the game's sixteen-colour EGA palette.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import colourMap from '../source/colour-map.json';
import type { Frames } from './types.ts';

const mapping: Record<string, string> = colourMap;
export function normaliseFrames(frames: Frames): Frames;
export function normaliseFrames(frames: unknown): unknown;
export function normaliseFrames(frames: unknown): unknown {
  const converted = structuredClone(frames);
  if (!converted || typeof converted !== 'object' || Array.isArray(converted)) return converted;
  for (const frame of Object.values(converted)) {
    if (frame && Array.isArray(frame.grid)) {
      frame.grid = frame.grid.map((row: unknown) => typeof row === 'string' ? [...row].map(code => mapping[code] ?? code).join('') : row);
    }
  }
  return converted;
}
