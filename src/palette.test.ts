// Checks legacy colour migration without losing edited pixels or transparency.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import palette from '../source/game-palette.json';
import { normaliseFrames } from './palette.ts';
import { validateFrames } from './model.ts';

test('offers sixteen distinct opaque colours plus transparency', () => {
  expect(Object.keys(palette)).toHaveLength(17);
  expect(palette['.']).toBeNull();
  expect(new Set(Object.values(palette).filter(Boolean)).size).toBe(16);
  expect(palette.k).toBe('#000000');
});
test('maps all legacy colours while preserving yellow details and transparent pixels', () => {
  const frames = { ben: { width: 10, height: 1, grid: ['KQhVOsAy.W'] } };
  const converted = normaliseFrames(frames);
  expect(converted.ben.grid).toEqual(['kGWNNbBy.W']);
  expect(frames.ben.grid).toEqual(['KQhVOsAy.W']);
  expect(validateFrames(converted, frames, palette)).toEqual(converted);
  expect(normaliseFrames(converted)).toEqual(converted);
});
test('retains canonical game colours and rejects unknown import codes', () => {
  const codes = Object.keys(palette).join('');
  const frames = { ben: { width: codes.length, height: 1, grid: [codes] } };
  expect(normaliseFrames(frames)).toEqual(frames);
  expect(() => validateFrames(normaliseFrames({ ben: { ...frames.ben, grid: ['?'.repeat(codes.length)] } }), frames, palette)).toThrow();
});
