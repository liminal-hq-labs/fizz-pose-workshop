// Renders static poses and timed sprite loops from shared workshop data.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { WorkshopData } from './types.ts';

export function mountGallery(data: WorkshopData): void {
  const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
  const motionNames = { 'walk-run': 'Walk / run', pogo: 'Pogo · extend / compress', climb: 'Ladder climb', mantle: 'Ledge pull-up · grip / haul / push', 'fizz-blaster': 'Fizz Blaster · recoil' };
  function card(title: string, key: string, animated: boolean, extra = ''): string {
    return `<article><div class="stage"><canvas role="img" aria-label="${title}" data-${animated ? 'animation' : 'frame'}="${key}" ${extra}></canvas></div><h3>${title}</h3><p>${animated ? `<a href="animations/${key}.svg">Animated SVG</a> · <a href="animations/${key}.gif">GIF</a>` : `<a href="frames/${key}.png">PNG</a> · <a href="frames/${key}.svg">SVG</a>`}</p></article>`;
  }
  $('#motions').innerHTML = Object.entries(motionNames).map(([key, title]) => card(title, key, true)).join('');
  const directionNames: Record<string, string> = { NW: 'North-west', N: 'North', NE: 'North-east', W: 'West', E: 'East', SW: 'South-west', S: 'South', SE: 'South-east' };
  $('#compass').innerHTML = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'].map(direction => direction ? card(directionNames[direction], 'overworld-' + direction, true, 'data-topdown="true"') : '<div aria-hidden="true" style="display:grid;place-items:center;color:#a9ee73">N ↑</div>').join('');
  $('#frames').innerHTML = Object.keys(data.frames).map(key => card(key.replace('ben_', '').replaceAll('_', ' '), key, false, key.startsWith('benMap') ? 'data-topdown="true"' : '')).join('');
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, elapsed = 0, last = performance.now(), scale = 6, speed = 1;
  const button = $<HTMLButtonElement>('#play');
  function updateButton(): void { button.textContent = playing ? 'Pause animations' : 'Play animations'; button.setAttribute('aria-pressed', String(playing)); }
  updateButton(); button.onclick = () => { playing = !playing; updateButton(); };
  const scaleSelect = $<HTMLSelectElement>('#scale'), speedSelect = $<HTMLSelectElement>('#speed'), flip = $<HTMLInputElement>('#flip');
  scaleSelect.onchange = () => { scale = Number(scaleSelect.value); };
  speedSelect.onchange = () => { speed = Number(speedSelect.value); };
  flip.onchange = () => { document.documentElement.style.setProperty('--facing', flip.checked ? '-1' : '1'); };
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-frame],canvas[data-animation]')];
  function tick(now: number): void {
    if (playing) elapsed += (now - last) * speed;
    last = now;
    for (const canvas of canvases) {
      let key = canvas.dataset.frame;
      if (canvas.dataset.animation) {
        const animation = data.animations[canvas.dataset.animation];
        let time = elapsed % animation.durationsMs.reduce((sum, value) => sum + value, 0), index = 0;
        while (index < animation.frames.length - 1 && time >= animation.durationsMs[index]) { time -= animation.durationsMs[index]; index++; }
        key = animation.frames[index];
      }
      if (!key) continue;
      const frame = data.frames[key];
      if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
      const top = canvas.dataset.topdown, actualScale = top && innerWidth < 600 ? 3 : scale;
      canvas.style.width = frame.width * actualScale + 'px'; canvas.style.height = frame.height * actualScale + 'px';
      if (top) canvas.style.transform = 'none';
      const context = canvas.getContext('2d')!; context.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const colour = data.palette[frame.grid[y][x]];
        if (colour) { context.fillStyle = colour; context.fillRect(x, y, 1, 1); }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
