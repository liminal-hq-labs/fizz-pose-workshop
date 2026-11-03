// Samples Ben's reusable continuous running rig into the twelve editable right-facing and left-facing running frames.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import skin from '../source/ben-side-skin.json';
import { rigCatalogue, type RigEntry } from '../src/rig/catalogue.ts';
import { sampleRigSprites } from './rig-skin.ts';
import { exportRig } from './export-rig.ts';
import type { Frames, WorkshopData } from '../src/types.ts';

/** The running entries: the pinned right-facing run and its left-facing turn, which share one rig and its keys. */
export const runEntries: readonly RigEntry[] = rigCatalogue.filter(entry => !entry.rig.performance && (entry.rig.motion ?? 'run') === 'run');
const entry = (animation: string): RigEntry => runEntries.find(item => item.animation === animation)!;
export function drawRunCycle(animation = 'walk-run'): Frames { const { rig, prefix } = entry(animation); return sampleRigSprites(rig, skin, prefix); }
if (import.meta.main) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const authored: Omit<WorkshopData, 'palette'> = JSON.parse(await readFile(root + 'source/poses.json', 'utf8'));
  const edits: Frames = JSON.parse(await readFile(root + 'edits.json', 'utf8'));
  // Optional animation names (`walk-run`, `walk-run-left`) redraw only those runs; with none given both directions are redrawn.
  const args = process.argv.slice(2), replace = args.includes('--replace-edits'), only = args.filter(arg => !arg.startsWith('--')), kept: string[] = [];
  const unknown = only.filter(name => !runEntries.some(item => item.animation === name));
  if (unknown.length) throw new Error(`Unknown run animation ${unknown.join(', ')}; choose from ${runEntries.map(item => item.animation).join(', ')}.`);
  for (const { rig, animation, folder } of runEntries.filter(item => !only.length || only.includes(item.animation))) {
    const frames = drawRunCycle(animation);
    // An override that differs from the previously drawn grid is a manual edit, and it takes precedence over the redraw.
    // Pass --replace-edits to discard those edits deliberately and adopt the rig's grids.
    for (const [name, frame] of Object.entries(frames)) {
      const manual = edits[name] && JSON.stringify(edits[name]) !== JSON.stringify(authored.frames[name]);
      if (manual && !replace) kept.push(name); else edits[name] = frame;
    }
    Object.assign(authored.frames, frames);
    authored.animations[animation] = { frames: Object.keys(frames), durationsMs: Object.keys(frames).map(() => rig.durationMs / rig.sampleCount) };
    // The six-frame cut reuses every other twelve-frame sprite at twice the duration, so no extra art is stored.
    const half = Object.keys(frames).filter((_, i) => i % 2 === 0);
    authored.animations[animation + '-6'] = { frames: half, durationsMs: half.map(() => (rig.durationMs / rig.sampleCount) * 2) };
    await exportRig(rig, skin, root + 'rig/' + folder);
    console.log(`Sampled ${rig.sampleCount} ${rig.facing === 'left' ? 'left' : 'right'}-facing running sprites from the continuous rig and saved rig/${folder}.`);
  }
  await writeFile(root + 'source/poses.json', JSON.stringify(authored, null, 2) + '\n');
  await writeFile(root + 'edits.json', JSON.stringify(edits, null, 2) + '\n');
  if (kept.length) console.log(`Kept manual editor overrides for ${kept.join(', ')}; run with --replace-edits to replace them.`);
}
