// Samples reusable pogo and Fizz Stunner rigs into editable action sprites and exports.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { fileURLToPath } from "node:url";
import { readFile, writeFile } from 'node:fs/promises';
import pogo from '../source/ben-pogo-rig.json';
import fire from '../source/ben-fire-rig.json';
import skin from '../source/ben-side-skin.json';
import { sampleRigSprites } from './rig-skin.ts';
import { exportRig } from './export-rig.ts';
import type { SideRig } from '../src/rig/run.ts';
import type { Frames, WorkshopData } from '../src/types.ts';

export const actionRigs = [
  { rig: pogo as SideRig, prefix: 'ben_pogoRight', animation: 'pogo', folder: 'ben-pogo' },
  { rig: fire as SideRig, prefix: 'ben_fireRight', animation: 'fizz-blaster', folder: 'ben-firing' },
] as const;
if (import.meta.main) {
  const root = new URL('../', import.meta.url);
  const authored: Omit<WorkshopData, 'palette'> = JSON.parse(await readFile(new URL('source/poses.json', root), 'utf8'));
  const edits: Frames = JSON.parse(await readFile(new URL('edits.json', root), 'utf8'));
  for (const action of actionRigs) {
    const frames = sampleRigSprites(action.rig, skin, action.prefix);
    Object.assign(authored.frames, frames); Object.assign(edits, frames);
    authored.animations[action.animation] = { frames: Object.keys(frames), durationsMs: Object.keys(frames).map(() => action.rig.durationMs / action.rig.sampleCount) };
    await exportRig(action.rig, skin, fileURLToPath(new URL('rig/' + action.folder, root)));
  }
  await writeFile(new URL('source/poses.json', root), JSON.stringify(authored, null, 2) + '\n');
  await writeFile(new URL('edits.json', root), JSON.stringify(edits, null, 2) + '\n');
  console.log('Saved six pogo poses and six Fizz Stunner poses with their reusable rigs.');
}
