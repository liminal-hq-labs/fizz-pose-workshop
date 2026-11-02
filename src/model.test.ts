// Checks reversible sprite edits and imported grid validation.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { createHistory, setPixel, validateFrames } from './model.ts';

const frames = { ben: { width: 2, height: 2, grid: ['..', 'RR'] } };
const palette = { '.': null, R: '#aa0000' };
test('validates dimensions, palette codes and frame names before importing', () => {
  expect(validateFrames(frames, frames, palette)).toEqual(frames);
  expect(() => validateFrames({ ben: { ...frames.ben, grid: ['X.', 'RR'] } }, frames, palette)).toThrow();
  expect(() => validateFrames({ ben: { ...frames.ben, width: 3 } }, frames, palette)).toThrow();
  expect(() => validateFrames({ unknown: frames.ben }, frames, palette)).toThrow();
  expect(() => validateFrames({ toString: frames.ben }, frames, palette)).toThrow();
});
test('one stroke reverses together and a new stroke clears redo', () => {
  const history = createHistory(), before = structuredClone(frames.ben), frame = structuredClone(before);
  setPixel(frame, 0, 0, 'R'); setPixel(frame, 1, 0, 'R');
  history.record(before, frame);
  expect(history.undo()).toEqual(before);
  expect(history.redo()).toEqual(frame);
  history.undo(); history.record(before, { ...before, grid: ['R.', 'RR'] });
  expect(history.canRedo).toBe(false);
});
test('transparent pixels and out-of-bounds strokes preserve dimensions', () => {
  const frame = structuredClone(frames.ben);
  expect(setPixel(frame, -1, 0, 'R')).toBe(false);
  expect(setPixel(frame, 0, 2, 'R')).toBe(false);
  expect(setPixel(frame, 0, 1, '.')).toBe(true);
  expect(frame.grid).toEqual(['..', '.R']);
});
