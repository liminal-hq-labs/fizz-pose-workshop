// Renders static poses and timed sprite loops from shared workshop data.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import stunnerStudy from '../source/fizz-stunner-study.json';
import { rigCatalogue } from './rig/catalogue.ts';
import type { WorkshopData } from './types.ts';

import { oneShotRestMs } from './rig/timing.ts';
export function mountGallery(data: WorkshopData): void {
  const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
  const motionNames = { 'walk-run': 'Run right · six phases', pogo: 'Pogo · six spring phases', climb: 'Ladder climb · hand over hand, eight phases', mantle: 'Ledge pull right · hang to stand', 'mantle-left': 'Ledge pull left · hang to stand', 'fizz-blaster': 'Fizz Stunner · six firing phases', 'look-up-down': 'Look up & down · front-facing', jump: 'Jump right · crouch to landing', 'jump-left': 'Jump left · Stunner on the far hip', fall: 'Fall right · bracing for impact', 'fall-left': 'Fall left · bracing for impact', death: 'Dramatic death', 'whistle-left': 'Whistle left · standing idle', 'whistle-right': 'Whistle right · standing idle', 'phone-idle': 'Seated phone idle · camera-facing' };
  function card(title: string, key: string, animated: boolean, extra = ''): string {
    return `<article><div class="stage"><canvas role="img" aria-label="${title}" data-${animated ? 'animation' : 'frame'}="${key}" ${extra}></canvas></div><h3>${title}</h3><p>${animated ? `<a href="animations/${key}.svg">Animated SVG</a> · <a href="animations/${key}.gif">GIF</a>` : `<a href="frames/${key}.png">PNG</a> · <a href="frames/${key}.svg">SVG</a>`}</p></article>`;
  }
  const studies = document.querySelector<HTMLElement>('#performance-studies');
  if (studies) studies.innerHTML = rigCatalogue.filter(entry=>entry.rig.performance).map(entry => '<h2>' + entry.title + '</h2>' + (entry.rig.lightingNote ? '<p>Lighting note: the phone screen should light his face and hands dynamically in the game. This pixel preview keeps the game palette.</p>' : '') + '<div class="run-strip">' + entry.labels.map((label,i)=>card((i+1)+'. '+label,entry.prefix+(i+1),false)).join('') + '</div>').join('');
  const stunners=document.querySelector<HTMLElement>('#stunner-studies');
  if(stunners)stunners.innerHTML='<h2>Fizz Stunner · on its own</h2><p>A compact purple sidearm with a dark top, squared muzzle and short grip. The holstered and right-facing held views are exact source patches; left-facing views are mirrored, and front/rear/quarter details are labelled interpretations. Every view is editable.</p><div class="original">'+card('Turnaround study','stunner-views',true)+card('Discharge and recoil','stunner-fire',true)+'</div><div class="grid">'+stunnerStudy.views.map(view=>'<article><div class="stage"><canvas role="img" aria-label="'+view.label+'" data-frame="'+view.name+'" data-fixed-facing="true"></canvas></div><h3>'+view.label+'</h3><p class="small">Native: <canvas class="stunner-native" data-frame="'+view.name+'" data-native="true" role="img" aria-label="Native pixels for '+view.label+'"></canvas></p><p><a href="frames/'+view.name+'.png">PNG</a> · <a href="frames/'+view.name+'.svg">SVG</a></p></article>').join('')+'</div><p class="small"><a href="docs/TURNTABLE_REVIEW.md">Reference and detail review</a> · <a href="source/fizz-stunner-study.json">Source study</a></p>';
  $('#motions').innerHTML = Object.entries(motionNames).map(([key, title]) => card(title, key, true)).join('');
  const directionNames: Record<string, string> = { NW: 'North-west', N: 'North', NE: 'North-east', W: 'West', E: 'East', SW: 'South-west', S: 'South', SE: 'South-east' };
  $('#compass').innerHTML = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'].map(direction => direction ? card(directionNames[direction], 'overworld-' + direction, true, 'data-topdown="true"') : '<div aria-hidden="true" style="display:grid;place-items:center;color:#a9ee73">N ↑</div>').join('');
  $('#frames').innerHTML = Object.keys(data.frames).map(key => card(key.replace('ben_', '').replaceAll('_', ' '), key, false, key.startsWith('benMap') ? 'data-topdown="true"' : '')).join('');
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, elapsed = 0, last = performance.now(), scale = 6, speed = 1;
  const button = $<HTMLButtonElement>('#play');
  function updateButton(): void { button.textContent = playing ? 'Pause animations' : 'Play animations'; button.setAttribute('aria-pressed', String(playing)); }
  const restart = document.createElement('button'); restart.textContent = 'Restart animations';
  button.after(restart); restart.onclick = () => {elapsed = 0; playing = true; updateButton();};
  updateButton(); button.onclick = () => { playing = !playing; updateButton(); };
  const scaleSelect = $<HTMLSelectElement>('#scale'), speedSelect = $<HTMLSelectElement>('#speed'), flip = $<HTMLInputElement>('#flip');
  scaleSelect.onchange = () => { scale = Number(scaleSelect.value); };
  speedSelect.onchange = () => { speed = Number(speedSelect.value); };
  flip.onchange = () => { document.documentElement.style.setProperty('--facing', flip.checked ? '-1' : '1'); };
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-frame],canvas[data-animation]')];
  function tick(now: number): void {
    if (playing) elapsed += Math.max(0,now - last) * speed;
    last = now;
    for (const canvas of canvases) {
      let key = canvas.dataset.frame;
      if (canvas.dataset.animation) {
        const animation = data.animations[canvas.dataset.animation];
        const duration = animation.durationsMs.reduce((sum,value)=>sum+value,0);
        // A one-shot holds its final pose for a rest before replaying, so the review never snaps from the end back to the start.
        let time = animation.loop === false ? Math.min(elapsed % (duration + oneShotRestMs), duration - 1) : elapsed % duration, index = 0;
        while (index < animation.frames.length - 1 && time >= animation.durationsMs[index]) { time -= animation.durationsMs[index]; index++; }
        key = animation.frames[index];
      }
      if (!key) continue;
      const frame = data.frames[key];
      if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
      const top = canvas.dataset.topdown, actualScale = canvas.dataset.native ? 1 : top && innerWidth < 600 ? 3 : scale;
      canvas.style.width = frame.width * actualScale + 'px'; canvas.style.height = frame.height * actualScale + 'px';
      if (top || canvas.dataset.fixedFacing || canvas.dataset.native) canvas.style.transform = 'none';
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
