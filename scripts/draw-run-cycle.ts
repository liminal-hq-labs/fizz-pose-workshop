// Samples Ben's reusable continuous rig into the six editable running frames.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import rig from '../source/ben-side-rig.json';
import skin from '../source/ben-side-skin.json';
import { sampleRigSprites } from './rig-skin.ts';
import { exportRig } from './export-rig.ts';
import type { Frames, WorkshopData } from '../src/types.ts';

export function drawRunCycle(): Frames { return sampleRigSprites(rig, skin); }
if (import.meta.main) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const authored: Omit<WorkshopData, 'palette'> = JSON.parse(await readFile(root + 'source/poses.json', 'utf8'));
  const edits: Frames = JSON.parse(await readFile(root + 'edits.json', 'utf8'));
  const frames = drawRunCycle();
  Object.assign(authored.frames, frames); Object.assign(edits, frames);
  authored.animations['walk-run'] = { frames: Object.keys(frames), durationsMs: Object.keys(frames).map(() => rig.durationMs / rig.sampleCount) };
  await writeFile(root + 'source/poses.json', JSON.stringify(authored, null, 2) + '\n');
  await writeFile(root + 'edits.json', JSON.stringify(edits, null, 2) + '\n');
  await exportRig(rig, skin, root + 'rig/ben-running');
  console.log('Sampled six running sprites from the continuous right-side rig and saved the rig exports.');
}
