// Saves editable poses and reusable exports for climbing, jumping, falling and expressive idle/action rigs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rigCatalogue, type RigStills } from '../src/rig/catalogue.ts';
import skin from '../source/ben-side-skin.json';
import { sampleRigSprites, skinRig } from './rig-skin.ts';
import { sampleRig } from '../src/rig/sample.ts';
import type { SideRig } from '../src/rig/run.ts';
import { frameDurations, replaysContinuously } from '../src/rig/timing.ts';
import { exportRig } from './export-rig.ts';
import type { Frames, WorkshopData } from '../src/types.ts';

/** Renders a rig's extra stills on its own canvas and crops them, refusing a crop that would cut any of Ben off. */
export function rigStills(rig: SideRig, stills: RigStills): Frames {
 return Object.fromEntries(stills.times.map((time, i) => {
  const {grid} = skinRig(rig,skin,sampleRig(rig,time)), [dx, dy] = stills.offset;
  grid.forEach((row, y) => [...row].forEach((code, x) => {
   if (code !== '.' && (x < dx || y < dy || x >= dx + stills.width || y >= dy + stills.height)) throw new Error(`${stills.prefix}${i + 1} crop cuts off a pixel at ${x},${y}.`);
  }));
  // The crop may run past the rig canvas; that part is transparent.
  const crop = Array.from({length: stills.height}, (_, y) => (grid[dy + y] ?? '').slice(dx, dx + stills.width).padEnd(stills.width, '.'));
  return [stills.prefix + (i + 1), {width: stills.width, height: stills.height, grid: crop}];
 }));
}

if (import.meta.main) {
 const root = new URL('../', import.meta.url);
 const authored: Omit<WorkshopData,'palette'> = JSON.parse(await readFile(new URL('source/poses.json',root),'utf8'));
 const edits: Frames = JSON.parse(await readFile(new URL('edits.json',root),'utf8'));
 for (const name of Object.keys(authored.frames).filter(name=>/^ben_whistle[1-6]$/.test(name))) {delete authored.frames[name]; delete edits[name];}
 delete authored.animations.whistle;
 // Optional animation names on the command line redraw only those rigs; with none given every performance rig is redrawn.
 const args = process.argv.slice(2), replace = args.includes('--replace-edits'), only = args.filter(arg => !arg.startsWith('--')), kept: string[] = [];
 for (const entry of rigCatalogue.filter(entry => entry.rig.performance && (!only.length || only.includes(entry.animation)))) {
  const frames = sampleRigSprites(entry.rig,skin,entry.prefix);
  const stills = entry.stills ? rigStills(entry.rig,entry.stills) : {};
  // An override that differs from the previously drawn grid is a manual edit, and it takes precedence over the redraw.
  // Pass --replace-edits to discard those edits deliberately and adopt the rig's grids.
  for (const [name, frame] of Object.entries({...frames,...stills})) {
   const manual = edits[name] && authored.frames[name] && JSON.stringify(edits[name]) !== JSON.stringify(authored.frames[name]);
   if (manual && !replace) kept.push(name); else edits[name] = frame;
  }
  Object.assign(authored.frames,stills);
  // A rig that now samples fewer poses drops its old trailing frames.
  const stale = new RegExp(`^${entry.prefix}(\\d+)$`);
  for (const name of Object.keys(authored.frames)) { const match = stale.exec(name); if (match && Number(match[1]) > entry.rig.sampleCount) { delete authored.frames[name]; delete edits[name]; } }
  Object.assign(authored.frames,frames);
  // One-shot performances are saved as one-shots, so the review gallery holds their final pose instead of snapping back.
  authored.animations[entry.animation] = {frames:Object.keys(frames),durationsMs:frameDurations(entry.rig),loop:replaysContinuously(entry.rig)};
  await exportRig(entry.rig,skin,fileURLToPath(new URL('rig/'+entry.folder,root)));
 }
 // A loop with a `sequence` also saves the whole performance: its lead-in once, then the loop `repeats` times, then a restart.
 for (const {animation, sequence} of rigCatalogue) {
  const loop = authored.animations[animation], lead = sequence && authored.animations[sequence.leadIn];
  if (!sequence || !loop || !lead) continue;
  const repeat = <T,>(items: readonly T[]): T[] => Array.from({length: sequence.repeats}, () => items).flat();
  authored.animations[sequence.name] = {frames:[...lead.frames,...repeat(loop.frames)],durationsMs:[...(lead.durationsMs ?? []),...repeat(loop.durationsMs ?? [])],loop:true};
 }
 await writeFile(new URL('source/poses.json',root),JSON.stringify(authored,null,2)+'\n');
 await writeFile(new URL('edits.json',root),JSON.stringify(edits,null,2)+'\n');
 console.log('Saved performance rigs and their editable poses.');
 if (kept.length) console.log(`Kept manual editor overrides for ${kept.join(', ')}; run with --replace-edits to replace them.`);
}
