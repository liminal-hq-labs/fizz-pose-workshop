// Converts legacy workshop colour codes to the game's sixteen-colour EGA palette.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import colourMap from '../source/colour-map.json';

export function normaliseFrames(frames) {
  const converted = structuredClone(frames);
  if (!converted || typeof converted !== 'object' || Array.isArray(converted)) return converted;
  for (const frame of Object.values(converted)) {
    if (frame && Array.isArray(frame.grid)) {
      frame.grid = frame.grid.map(row => typeof row === 'string' ? [...row].map(code => colourMap[code] ?? code).join('') : row);
    }
  }
  return converted;
}
