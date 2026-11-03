// Samples the reusable Fizz Stunner rig into editable action sprites and exports. The pogo ride is a performance rig.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { fileURLToPath } from "node:url";
import { readFile, writeFile } from 'node:fs/promises';
import fire from '../source/ben-fire-rig.json';
import skin from '../source/ben-side-skin.json';
import { sampleRigSprites } from './rig-skin.ts';
import { exportRig } from './export-rig.ts';
import { type SideRig } from '../src/rig/run.ts';
import { frameDurations } from '../src/rig/timing.ts';
import type { Frames, WorkshopData } from '../src/types.ts';

export const actionRigs = [
  { rig: fire as SideRig, prefix: 'ben_fireRight', animation: 'fizz-blaster', folder: 'ben-firing' },
] as const;
if (import.meta.main) {
  const root = new URL('../', import.meta.url);
  const authored: Omit<WorkshopData, 'palette'> = JSON.parse(await readFile(new URL('source/poses.json', root), 'utf8'));
  const edits: Frames = JSON.parse(await readFile(new URL('edits.json', root), 'utf8'));
  // Optional animation names on the command line redraw only those rigs.
  const only = process.argv.slice(2);
  for (const action of actionRigs.filter(action => !only.length || only.includes(action.animation))) {
    const frames = sampleRigSprites(action.rig, skin, action.prefix);
    Object.assign(authored.frames, frames); Object.assign(edits, frames);
    authored.animations[action.animation] = { frames: Object.keys(frames), durationsMs: frameDurations(action.rig) };
    await exportRig(action.rig, skin, fileURLToPath(new URL('rig/' + action.folder, root)));
  }
  await writeFile(new URL('source/poses.json', root), JSON.stringify(authored, null, 2) + '\n');
  await writeFile(new URL('edits.json', root), JSON.stringify(edits, null, 2) + '\n');
  console.log('Saved six Fizz Stunner poses with their reusable rig.');
}
