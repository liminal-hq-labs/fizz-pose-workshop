// Generates the workshop exports from authored pixel grids and saved editor overrides.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import authored from '../source/poses.json';
import palette from '../source/game-palette.json';
import original from '../source/classic-fizz-original.json';
import { normaliseFrames } from '../src/palette.ts';
import { validateFrames } from '../src/model.ts';
import { png, raster, rects, gif } from './images.ts';
import type { Frames, SheetRect } from '../src/types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const frames: Frames = validateFrames(authored.frames, authored.frames, palette);
try {
  const overrides: unknown = JSON.parse(await readFile(root + 'edits.json', 'utf8'));
  if (overrides && typeof overrides === 'object' && Object.keys(overrides).length) Object.assign(frames, validateFrames(normaliseFrames(overrides), frames, palette));
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
const animations = authored.animations;
for (const [name, animation] of Object.entries(animations)) {
  if (!animation.frames.length || animation.frames.length !== animation.durationsMs.length || animation.durationsMs.some(duration => !Number.isFinite(duration) || duration <= 0 || duration % 10 !== 0)) throw new Error(`Invalid animation timing: ${name}`);
  const first = frames[animation.frames[0]];
  if (!first || animation.frames.some(key => !frames[key] || frames[key].width !== first.width || frames[key].height !== first.height)) throw new Error(`Invalid animation frames: ${name}`);
}
for (const directory of ['frames', 'animations', 'sheets']) await mkdir(root + directory, { recursive: true });
for (const [name, frame] of Object.entries(frames)) {
  await writeFile(root + `frames/${name}.png`, png(frame, palette));
  await writeFile(root + `frames/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" shape-rendering="crispEdges"><title>${name}</title>${rects(frame, palette)}</svg>\n`);
}
for (const [name, animation] of Object.entries(animations)) {
  const sequence = animation.frames.map(key => frames[key]);
  const { width, height } = sequence[0], total = animation.durationsMs.reduce((sum, time) => sum + time, 0);
  const loop = (animation as {loop?: boolean}).loop !== false;
  let start = 0;
  const css = sequence.map((_, index) => {
    const end = start + animation.durationsMs[index];
    const rule = `.f${index}{animation:a${index} ${total}ms steps(1,end) ${loop ? 'infinite' : '1 forwards'}}@keyframes a${index}{0%{visibility:${index === 0 ? 'visible' : 'hidden'}}${(start / total * 100).toFixed(4)}%{visibility:visible}${(end / total * 100).toFixed(4)}%{visibility:hidden}100%{visibility:${!loop && index === sequence.length - 1 ? 'visible' : 'hidden'}}}`;
    start = end; return rule;
  }).join('') + '@media(prefers-reduced-motion:reduce){g{animation:none!important;visibility:hidden}g:first-of-type{visibility:visible}}';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><style>${css}</style>` + sequence.map((frame, index) => `<g class="f${index}" visibility="hidden">${rects(frame, palette)}</g>`).join('') + '</svg>';
  await writeFile(root + `animations/${name}.svg`, svg);
  await writeFile(root + `animations/${name}.gif`, gif(sequence, animation.durationsMs, palette, loop));
}
const cellWidth = Math.max(...Object.values(frames).map(frame => frame.width));
const cellHeight = Math.max(...Object.values(frames).map(frame => frame.height));
const sheet = new PNG({ width: cellWidth * 8, height: cellHeight * Math.ceil(Object.keys(frames).length / 8) });
const positions: Record<string, SheetRect> = {};
Object.entries(frames).forEach(([name, frame], index) => {
  const x = index % 8 * cellWidth, y = Math.floor(index / 8) * cellHeight;
  const image = raster(frame, palette);
  PNG.bitblt(image, sheet, 0, 0, frame.width, frame.height, x, y);
  positions[name] = { x, y, width: frame.width, height: frame.height };
});
await writeFile(root + 'sheets/ben-poses.png', PNG.sync.write(sheet));
await writeFile(root + 'assets.json', JSON.stringify({ palette, frames, animations, sheet: positions }, null, 2) + '\n');
await writeFile(root + 'original-study.png', png(original, original.palette, 6));
const bundle = await Bun.build({ entrypoints: [root + 'src/standalone.ts'], target: 'browser', format: 'iife', minify: true });
if (!bundle.success) throw new AggregateError(bundle.logs, 'Could not bundle the standalone gallery.');
const inline = `const DATA = ${JSON.stringify({ palette, frames, animations })};\n${await bundle.outputs[0].text()}`;
const template = await readFile(root + 'templates/standalone.html', 'utf8');
await writeFile(root + 'standalone-preview.html', template.replace('__PREVIEW_SCRIPT__', () => inline.replaceAll('</script', '<\\/script')));
await writeFile(root + 'README.md', await readFile(root + 'templates/README.md', 'utf8'));
console.log(`Built ${Object.keys(frames).length} frames and ${Object.keys(animations).length} animation sequences.`);
