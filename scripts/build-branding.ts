// Builds the workshop's SVG hero and matching repository avatars from saved Ben artwork.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { rects, rgb } from './images.ts';
import type { Frame, WorkshopData } from '../src/types.ts';

const root = new URL('../', import.meta.url);
const data = await Bun.file(new URL('assets.json', root)).json() as WorkshopData;
const standing = data.frames.ben_standFront;
const running = Array.from({ length: 6 }, (_, i) => data.frames[`ben_walkRight${i + 1}`]);
if (!standing || running.some(frame => !frame)) throw new Error('Generate the saved standing and running sprites before building branding.');
const header = '<!-- (c) Copyright 2026 Liminal HQ, Scott Morris; SPDX-License-Identifier: Apache-2.0 OR MIT -->';
const sprite = (frame: Frame): string => `<g shape-rendering="crispEdges">${rects(frame, data.palette)}</g>`;
const run = running.map((frame, i) => `<g class="phase phase-${i}">${sprite(frame)}</g>`).join('\n');
const phases = running.map((_, i) => `.phase-${i} { animation-delay: -${(6 - i) / 10}s; }`).join('\n');
const swatches = ['k', 'B', 'G', 'C', 'R', 'M', 'N', 'L', 'D', 'b', 'g', 'c', 'r', 'm', 'y', 'W'].map((code, i) => `<rect x="${48 + i * 23}" y="262" width="16" height="8" rx="2" fill="${data.palette[code]}"/>`).join('');
const hero = `${header}
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="320" viewBox="0 0 1200 320" role="img" aria-labelledby="title desc">
<title id="title">Classic Fizz Pose Workshop — Liminal HQ</title>
<desc id="desc">Ben's original saved pixel artwork: left and right standing views flank a six-frame running loop, beside the workshop name and sixteen game-palette swatches. Reduced motion shows a still running pose.</desc>
<defs>
  <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#080b17"/><stop offset="1" stop-color="#211526"/></linearGradient>
  <linearGradient id="brand"><stop offset=".2" stop-color="#ffffff"/><stop offset=".65" stop-color="#ffaa40"/><stop offset="1" stop-color="#f43f5e"/></linearGradient>
  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#ffffff" stroke-opacity=".055"/></pattern>
</defs>
<style>
text { font-family: Inter, system-ui, sans-serif; }
.phase { visibility: hidden; animation: run .6s steps(1,end) infinite; }
@keyframes run { 0% { visibility: visible; } 16.666667%,100% { visibility: hidden; } }
${phases}
@media (prefers-reduced-motion: reduce) { .phase { animation: none; visibility: hidden; } .phase-0 { visibility: visible; } }
</style>
<rect width="1200" height="320" rx="20" fill="url(#bg)"/>
<rect x="1" y="1" width="1198" height="318" rx="19" fill="none" stroke="#ffffff" stroke-opacity=".12"/>
<text x="48" y="47" fill="#fdba74" font-size="12" font-weight="700" letter-spacing="3">LIMINAL HQ / CHARACTER LAB</text>
<text x="45" y="110" fill="url(#brand)" font-size="49" font-weight="800" letter-spacing="-2">Classic Fizz</text>
<text x="47" y="158" fill="#ffffff" font-size="36" font-weight="700" letter-spacing="-1">Pose Workshop</text>
<text x="48" y="201" fill="#c8becf" font-size="16">Native pixels. Reusable rigs. A character in motion.</text>
<text x="48" y="237" fill="#9e93ad" font-size="11" letter-spacing="2">BUN + TYPESCRIPT / SVG / THREE.JS</text>
${swatches}
<rect x="582" y="28" width="590" height="264" rx="12" fill="#080b17" stroke="#42354d"/>
<rect x="583" y="29" width="588" height="262" rx="11" fill="url(#grid)"/>
<text x="604" y="53" fill="#b3a6c4" font-size="10" letter-spacing="2">BEN BLAZE / SAVED SPRITE STUDIES</text>
<path d="M604 241H1150" stroke="#7c5d8f" stroke-dasharray="3 5"/>
<g transform="translate(616 81) scale(4.5)">${sprite(data.frames.ben_stand)}</g>
<g transform="translate(808 77) scale(4.5)">${run}</g>
<g transform="translate(1000 81) scale(4.5)">${sprite(data.frames.ben_standRight)}</g>
<text x="670" y="272" text-anchor="middle" fill="#b3a6c4" font-size="10" letter-spacing="2">STUDY</text>
<text x="862" y="272" text-anchor="middle" fill="#55ffff" font-size="10" letter-spacing="2">6-FRAME RUN</text>
<text x="1054" y="272" text-anchor="middle" fill="#b3a6c4" font-size="10" letter-spacing="2">REFINE</text>
</svg>\n`;
// The avatar crops the saved front view at the chest; no source pixels are repainted.
const portrait: Frame = { width: 20, height: 23, grid: standing.grid.slice(1, 24).map(row => row.slice(2, 22)) };
const avatar = `${header}
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
<title id="title">Classic Fizz Pose Workshop avatar</title>
<desc id="desc">Ben's green bicycle helmet, white collar and red shirt, in the saved sixteen-colour pixel style on a dark square with an orange frame.</desc>
<rect width="512" height="512" fill="#101323"/>
<path d="M24 104V24H104M408 24H488V104M488 408V488H408M104 488H24V408" fill="none" stroke="#ffaa40" stroke-width="8"/>
<g transform="translate(96 48) scale(16)">${sprite(portrait)}</g>
</svg>\n`;
// Rasterise the same integer-aligned rectangles without a browser dependency.
const image = new PNG({ width: 512, height: 512 });
const paint = (x: number, y: number, width: number, height: number, hex: string): void => {
  const channels = rgb(hex);
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    const offset = (py * 512 + px) * 4;
    image.data.set([...channels, 255], offset);
  }
};
paint(0, 0, 512, 512, '#101323');
for (const [x, y] of [[20, 20], [408, 20], [20, 484], [408, 484]]) paint(x, y, 84, 8, '#ffaa40');
for (const [x, y] of [[20, 20], [484, 20], [20, 408], [484, 408]]) paint(x, y, 8, 84, '#ffaa40');
portrait.grid.forEach((row, y) => [...row].forEach((code, x) => {
  const colour = data.palette[code];
  if (colour) paint(96 + x * 16, 48 + y * 16, 16, 16, colour);
}));
await mkdir(new URL('assets/', root), { recursive: true });
await Promise.all([
  writeFile(new URL('assets/hero.svg', root), hero),
  writeFile(new URL('assets/avatar.svg', root), avatar),
  writeFile(new URL('assets/avatar.png', root), PNG.sync.write(image)),
]);
console.log('Built animated hero, SVG avatar and 512 × 512 PNG avatar from saved sprites.');
