// Saves a side-view rig, its skin, continuous motion and sampled sprite/SVG outputs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { sampleRig, sampleTime } from '../src/rig/sample.ts';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type SideRig } from '../src/rig/run.ts';
import { frameDurations } from '../src/rig/timing.ts';
import { rigSvg } from '../src/rig/svg.ts';
import { sampleRigSprites, type RigSkin } from './rig-skin.ts';
import { gif, png, rects } from './images.ts';
import { faceSequence } from './face-sequence.ts';
import { validateFrames } from '../src/model.ts';
import palette from '../source/game-palette.json';

export async function exportRig(rig: SideRig, skin: RigSkin, output: string): Promise<void> {
  await mkdir(output, { recursive: true });
  const generated = sampleRigSprites(rig, skin, 'frame');
  const frames = Object.values(validateFrames(generated, generated, palette));
  const samples = frames.map((_, i) => sampleRig(rig, sampleTime(rig, i)));
  await writeFile(output + '/rig.json', JSON.stringify(rig, null, 2) + '\n');
  await writeFile(output + '/skin.json', JSON.stringify(skin, null, 2) + '\n');
  await writeFile(output + '/samples.json', JSON.stringify({ durationMs: rig.durationMs, loop: rig.performance?.loop ?? true, lightingNote: rig.lightingNote, frameDurationMs: rig.durationMs / rig.sampleCount, frameDurationsMs: frameDurations(rig), samples }, null, 2) + '\n');
  const face = faceSequence(frames, samples, palette, skin.face);
  await writeFile(output + '/face-sequence.json', face.json);
  await writeFile(output + '/face-sequence.svg', face.svg);
  await writeFile(output + '/rig.svg', rigSvg(rig));
  await writeFile(output + '/sprites.gif', gif(frames, frameDurations(rig), palette, rig.performance?.loop ?? true));
  for (const [i, frame] of frames.entries()) {
    const name = String(i + 1).padStart(2, '0');
    await writeFile(output + `/rig-${name}.svg`, rigSvg(rig, sampleTime(rig, i)));
    await writeFile(output + `/sprite-${name}.png`, png(frame, palette));
    await writeFile(output + `/sprite-${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" shape-rendering="crispEdges">${rects(frame, palette)}</svg>\n`);
  }
}
if (import.meta.main) {
  const [rigFile = 'source/ben-side-rig.json', skinFile = 'source/ben-side-skin.json', output = 'rig/ben-running'] = process.argv.slice(2);
  const rig: SideRig = JSON.parse(await readFile(rigFile, 'utf8'));
  const skin: RigSkin = JSON.parse(await readFile(skinFile, 'utf8'));
  await exportRig(rig, skin, resolve(output));
  console.log(`Exported ${rig.sampleCount} sprites and an animated rig to ${output}.`);
}
