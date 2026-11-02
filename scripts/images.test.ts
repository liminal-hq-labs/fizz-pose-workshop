// Verifies native-resolution image exports preserve opaque black and transparent pixels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { PNG } from 'pngjs';
import { png } from './images.ts';
import type { Frame } from '../src/types.ts';

const frame: Frame = { width: 2, height: 2, grid: ['kW', '..'] };
const palette = { '.': null, k: '#000000', W: '#ffffff' };
test('PNG export distinguishes opaque black from transparent pixels', () => {
  const image = PNG.sync.read(png(frame, palette));
  expect([image.width, image.height]).toEqual([2, 2]);
  expect([...image.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
});
test('scaled exports repeat whole pixels without blending palette colours', () => {
  const image = PNG.sync.read(png(frame, palette, 2));
  expect([image.width, image.height]).toEqual([4, 4]);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const offset = (y * 4 + x) * 4;
    expect([...image.data.subarray(offset, offset + 4)]).toEqual(y >= 2 ? [0, 0, 0, 0] : x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
  }
});
