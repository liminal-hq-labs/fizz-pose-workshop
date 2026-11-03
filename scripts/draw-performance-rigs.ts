// Saves six editable poses and reusable exports for climbing, jumping and expressive idle/action rigs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import skin from '../source/ben-side-skin.json';
import { sampleRigSprites } from './rig-skin.ts';
import { frameDurations } from '../src/rig/timing.ts';
import { exportRig } from './export-rig.ts';
import type { Frames, WorkshopData } from '../src/types.ts';

if (import.meta.main) {
 const root = new URL('../', import.meta.url);
 const authored: Omit<WorkshopData,'palette'> = JSON.parse(await readFile(new URL('source/poses.json',root),'utf8'));
 const edits: Frames = JSON.parse(await readFile(new URL('edits.json',root),'utf8'));
 for (const name of Object.keys(authored.frames).filter(name=>/^ben_whistle[1-6]$/.test(name))) {delete authored.frames[name]; delete edits[name];}
 delete authored.animations.whistle;
 // Optional animation names on the command line redraw only those rigs; with none given every performance rig is redrawn.
 const only = process.argv.slice(2);
 for (const entry of rigCatalogue.filter(entry => entry.rig.performance && (!only.length || only.includes(entry.animation)))) {
  const frames = sampleRigSprites(entry.rig,skin,entry.prefix);
  Object.assign(authored.frames,frames); Object.assign(edits,frames);
  authored.animations[entry.animation] = {frames:Object.keys(frames),durationsMs:frameDurations(entry.rig),loop:true};
  await exportRig(entry.rig,skin,fileURLToPath(new URL('rig/'+entry.folder,root)));
 }
 await writeFile(new URL('source/poses.json',root),JSON.stringify(authored,null,2)+'\n');
 await writeFile(new URL('edits.json',root),JSON.stringify(edits,null,2)+'\n');
 console.log('Saved performance rigs and their editable poses.');
}
