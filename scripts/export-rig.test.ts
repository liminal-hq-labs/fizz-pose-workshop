// Exercises reusable rig exports with different character proportions and sample counts.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import rig from '../source/ben-side-rig.json';
import skin from '../source/ben-side-skin.json';
import { exportRig } from './export-rig.ts';
import { sampleRunRig, validateRig } from '../src/rig/run.ts';

test('exports a reusable rig with a different canvas, bone proportions and twelve samples', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fizz-rig-'));
  try {
    const other = structuredClone(rig);
    other.name = 'Proportion test'; other.width = 32; other.height = 50; other.groundY = 38; other.root = [14, 27];
    other.sampleCount = 12; other.durationMs = 720; other.arms.upperLength = 3.9; other.arms.forearmLength = 3.4;
    other.legs.thighLength *= 1.1; other.legs.shinLength *= 1.1;
    await exportRig(other, skin, directory);
    const files = await readdir(directory); expect(files.filter(name => /^sprite-\d+\.svg$/.test(name))).toHaveLength(12);
    const image = PNG.sync.read(await readFile(join(directory, 'sprite-12.png'))); expect([image.width, image.height]).toEqual([32, 50]);
    const metadata = JSON.parse(await readFile(join(directory, 'samples.json'), 'utf8')); expect(metadata.samples).toHaveLength(12); expect(metadata.frameDurationMs).toBe(60);
    const svg = await readFile(join(directory, 'rig.svg'), 'utf8'); expect(svg).toContain('Proportion test'); expect(svg).not.toMatch(/NaN|Infinity/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('rejects invalid timing and unreachable foot paths instead of exporting detached feet', () => {
  const invalid = structuredClone(rig); invalid.sampleCount = 7; expect(() => validateRig(invalid)).toThrow();
  const short = structuredClone(rig); short.legs.thighLength = 1; short.legs.shinLength = 1;
  expect(() => sampleRunRig(short, 0)).toThrow('Foot path exceeds leg reach');
});
