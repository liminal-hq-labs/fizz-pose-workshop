// Samples Ben's reusable continuous rig into the twelve editable running frames.
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
  // An override that differs from the previously drawn grid is a manual edit, and it takes precedence over the redraw.
  // Pass --replace-edits to discard those edits deliberately and adopt the rig's grids.
  const replace = process.argv.includes('--replace-edits'), kept: string[] = [];
  for (const [name, frame] of Object.entries(frames)) {
    const manual = edits[name] && JSON.stringify(edits[name]) !== JSON.stringify(authored.frames[name]);
    if (manual && !replace) kept.push(name); else edits[name] = frame;
  }
  Object.assign(authored.frames, frames);
  authored.animations['walk-run'] = { frames: Object.keys(frames), durationsMs: Object.keys(frames).map(() => rig.durationMs / rig.sampleCount) };
  await writeFile(root + 'source/poses.json', JSON.stringify(authored, null, 2) + '\n');
  await writeFile(root + 'edits.json', JSON.stringify(edits, null, 2) + '\n');
  await exportRig(rig, skin, root + 'rig/ben-running');
  console.log(`Sampled ${rig.sampleCount} running sprites from the continuous right-side rig and saved the rig exports.`);
  if (kept.length) console.log(`Kept manual editor overrides for ${kept.join(', ')}; run with --replace-edits to replace them.`);
}
