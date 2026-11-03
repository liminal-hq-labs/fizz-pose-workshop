// Compares a smooth side-view rig with its editable sprite samples in the workshop.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import skin from '../../source/ben-side-skin.json';
import { mountFaceInspector } from './face-inspector.ts';
import { rigCatalogue } from './catalogue.ts';
import { sampleIndex, sampleRig, sampleTime } from './sample.ts';
import { type SideRig, type RigPose } from './run.ts';
import type { Chain, Vec2 } from './kinematics.ts';
import type { WorkshopData } from '../types.ts';
import { appliedLevel, lightGrid, type LightingData } from './lighting.ts';

const hexRgb = (hex: string): number[] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

export function mountRigPreview(data: WorkshopData): void {
  const mount = document.querySelector<HTMLElement>('#rig-preview'); if (!mount) return;
  const section: HTMLElement = mount;
  const actions = rigCatalogue;
  let action = actions[0], rig = action.rig;
  section.innerHTML = `<h2>Rig first, sprites second.</h2><p>The cyan limbs face the camera; purple limbs are behind. Yellow feet are supported by the ground or pogo pegs. Watch the continuous rig, switch to the sampled sprite poses, or pause and step through each pose. Both views use the same rig time.</p>
    <div class="controls"><label>Action <select id="rig-action">${actions.map((entry,i) => `<option value="${i}">${entry.title}</option>`).join('')}</select></label><button id="rig-play">Pause rig</button><label>Rig speed <select id="rig-speed"><option value="0.25">Quarter speed</option><option value="0.5" selected>Half speed</option><option value="1">Normal speed</option></select></label><label>Rig display <select id="rig-mode"><option value="smooth">Continuous</option><option value="samples">Sprite samples</option></select></label><label><input id="rig-overlay" type="checkbox">Overlay sampled rig on sprite</label><button id="rig-prev">Previous pose</button><button id="rig-next">Next pose</button></div>
    <div class="controls" id="rig-light-controls" hidden><label><input id="rig-light" type="checkbox">Screen light preview</label><label>Light render <select id="rig-light-mode"><option value="lookup">EGA lookup (DOS)</option><option value="tint">Colour tint (web)</option></select></label><label>Light intensity <input id="rig-light-gain" type="range" min="0" max="150" value="100"><output id="rig-light-value">100%</output></label><label><input id="rig-light-mask" type="checkbox">Overlay light mask</label></div>
    <label class="rig-scrubber">Cycle position <input id="rig-time" type="range" min="0" max="1000" value="0"><output id="rig-position"></output></label>
    <div class="rig-comparison"><article><h3>Continuous rig</h3><div class="rig-stage"><canvas id="rig-bones" role="img" aria-label="Animated character skeleton with fixed-length arms and legs"></canvas></div></article><article><h3>Sprite samples</h3><div class="rig-stage"><canvas id="rig-avatar" role="img" aria-label="The sprite sample corresponding to the rig phase"></canvas></div></article><article id="rig-light-panel" hidden><h3>Screen light</h3><div class="rig-stage"><canvas id="rig-lit" role="img" aria-label="The same sprite sample lit by the phone screen from its exported light data"></canvas></div></article></div>
    <p class="small"><a href="rig/ben-running/rig.svg" target="_blank">Animated rig SVG</a> · <a href="rig/ben-running/samples.json">Joint samples</a> · <a href="rig/ben-running/rig.json">Rig settings</a> · <a href="rig/ben-running/skin.json">Sprite skin</a> · <a href="rig/ben-running/sprites.gif" target="_blank">Sprite GIF</a></p>`;
  let updateFace = mountFaceInspector(section, rig, data, skin.face, action.prefix, action.folder);
  const $ = <T extends HTMLElement>(query: string): T => section.querySelector<T>(query)!;
  const bones = $<HTMLCanvasElement>('#rig-bones'), avatar = $<HTMLCanvasElement>('#rig-avatar');
  const slider = $<HTMLInputElement>('#rig-time'), play = $<HTMLButtonElement>('#rig-play'), overlay = $<HTMLInputElement>('#rig-overlay');
  const speedSelect = $<HTMLSelectElement>('#rig-speed'), mode = $<HTMLSelectElement>('#rig-mode');
  let time = 0, last = performance.now(), speed = .5, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scale = 10;
  const lit = $<HTMLCanvasElement>('#rig-lit'), lightToggle = $<HTMLInputElement>('#rig-light'), lightMode = $<HTMLSelectElement>('#rig-light-mode');
  const lightGain = $<HTMLInputElement>('#rig-light-gain'), lightMaskToggle = $<HTMLInputElement>('#rig-light-mask');
  // The preview reads the exported light data, so it shows exactly what a game receives. The sprite samples stay unlit.
  let lighting: LightingData | null = null;
  function loadLighting(): void {
    lighting = null; lightToggle.checked = false; showLight();
    $<HTMLElement>('#rig-light-controls').hidden = !rig.lighting;
    if (!rig.lighting) return;
    const wanted = action.folder;
    fetch(`rig/${wanted}/lighting.json`).then(response => response.ok ? response.json() as Promise<LightingData> : null).then(found => { if (action.folder === wanted) lighting = found; }).catch(() => { lighting = null; });
  }
  function showLight(): void { $<HTMLElement>('#rig-light-panel').hidden = !lightToggle.checked; section.querySelector('.rig-comparison')!.classList.toggle('lit', lightToggle.checked); }
  lightToggle.onchange = showLight;
  lightGain.oninput = () => { $<HTMLOutputElement>('#rig-light-value').textContent = lightGain.value + '%'; };
  function resize(): void { for (const c of [bones, avatar, lit]) { c.width = rig.width * scale; c.height = rig.height * scale; } }
  resize(); loadLighting();
  $<HTMLSelectElement>('#rig-action').onchange = event => {
    action = actions[Number((event.target as HTMLSelectElement).value)]; rig = action.rig; time = 0; resize();
    section.querySelector('#face-sequence')?.remove();
    updateFace = mountFaceInspector(section, rig, data, skin.face, action.prefix, action.folder);
    section.querySelectorAll<HTMLAnchorElement>('a[href^="rig/"]').forEach(link => { link.setAttribute('href', link.getAttribute('href')!.replace(/rig\/ben-[^/]+\//, 'rig/' + action.folder + '/'));  });
    loadLighting();
  };
  /** Draws the saved sprite lit by its exported frame light: the EGA lookup a DOS renderer uses, or a colour tint. */
  function paintLit(context: CanvasRenderingContext2D, grid: readonly string[], index: number): void {
    const frame = lighting?.frames[index]; if (!lighting || !frame) return;
    const intensity = frame.intensity * Number(lightGain.value) / 100, tint = lightMode.value === 'tint';
    const lookup = lightGrid(grid, frame.mask, intensity, lighting.litVariants), light = hexRgb(lighting.colour.hex);
    grid.forEach((row, y) => [...row].forEach((code, x) => {
      const base = data.palette[code]; if (!base) return;
      const level = appliedLevel(Number(frame.mask[y][x]), intensity);
      let colour = tint ? base : data.palette[lookup[y][x]] ?? base;
      if (tint && level > 0) { const rgb = hexRgb(base), amount = Math.min(1, level / lighting!.levels) * .55; colour = `rgb(${rgb.map((value, i) => Math.round(value + (light[i] - value) * amount)).join(',')})`; }
      context.fillStyle = colour; context.fillRect(x * scale, y * scale, scale, scale);
      if (lightMaskToggle.checked && frame.mask[y][x] !== '0') { context.fillStyle = `rgba(255,255,80,${.15 + .2 * Number(frame.mask[y][x])})`; context.fillRect(x * scale + scale * .3, y * scale + scale * .3, scale * .4, scale * .4); }
    }));
    if (frame.source) { context.strokeStyle = lighting.colour.hex; context.lineWidth = 2; context.beginPath(); context.arc(frame.source[0] * scale, frame.source[1] * scale, lighting.radius * scale * Math.max(.05, intensity), 0, Math.PI * 2); context.stroke(); }
  }
  function updateButton(): void { play.textContent = playing ? 'Pause rig' : 'Play rig'; play.setAttribute('aria-pressed', String(playing)); }
  updateButton(); play.onclick = () => { if (time >= 1) time = 0; playing = !playing; updateButton(); };
  speedSelect.onchange = () => { speed = Number(speedSelect.value); };
  slider.oninput = () => { playing = false; time = Number(slider.value) / 1000; updateButton(); };
  const step = (direction: number): void => { playing = false; time = sampleTime(rig, (currentIndex() + direction + rig.sampleCount) % rig.sampleCount); updateButton(); };
  $<HTMLButtonElement>('#rig-prev').onclick = () => step(-1); $<HTMLButtonElement>('#rig-next').onclick = () => step(1);
  function skeleton(context: CanvasRenderingContext2D, pose: RigPose, translucent = false): void {
    context.save(); context.scale(scale, scale); context.globalAlpha = translucent ? .8 : 1;
    const line = (points: readonly Vec2[], colour: string, thickness = .22): void => {
      context.strokeStyle = colour; context.lineWidth = thickness; context.beginPath();
      points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.stroke();
    };
    const limb = (chain: Chain, colour: string): void => { line(chain, colour, .28); for (const [x, y] of chain) { context.fillStyle = colour; context.beginPath(); context.arc(x, y, .24, 0, Math.PI * 2); context.fill(); } };
    const environment = pose.presentation?.environment;
    if (environment?.kind === 'ladder') {
      for (const x of [environment.x,environment.x+environment.width]) line([[x,environment.y],[x,rig.groundY]], '#688276', .15);
      for(let y=environment.y;y<=rig.groundY;y+=environment.spacing) line([[environment.x,y],[environment.x+environment.width,y]],'#688276',.15);
    } else if (environment) line([[environment.x,rig.groundY],[environment.x,environment.y],[environment.x+environment.width,environment.y]],'#688276',.3);
    if (pose.presentation?.phone) line([pose.presentation.phone, [pose.presentation.phone[0],pose.presentation.phone[1]-3]], '#55ffff', .9);
    if (pose.pogo) {
      const p = pose.pogo; line([p.springTop, p.shaftTop], '#ddd', .4); line(p.pegs, '#ddd', .4);
      line([[p.shaftTop[0] - 3, p.shaftTop[1]], [p.shaftTop[0] + 3, p.shaftTop[1]]], '#ddd', .4);
      const coils: Vec2[] = [p.springTop];
      for (let i = 1; i < 6; i++) coils.push([p.tip[0] + (i % 2 ? -1 : 1), p.springTop[1] + p.springLength * i / 6]);
      coils.push(p.tip); line(coils, p.grounded ? '#fff66b' : '#ddd', .25);
    }
    if (pose.weapon) { line([pose.weapon.grip, pose.weapon.muzzle], pose.weapon.flash ? '#ffff55' : '#ff55ff', .7); }
    line([[0, rig.groundY], [rig.width, rig.groundY]], '#58745f', .1);
    limb(pose.farLeg, '#a080d0'); limb(pose.farArm, '#a080d0'); line([pose.root, pose.neck], '#ffec91', .4);
    line([pose.nearArm[0], pose.farArm[0]], '#ffa05f', .45); limb(pose.nearLeg, '#75edfa'); limb(pose.nearArm, '#75edfa');
    for (const foot of [pose.farFoot, pose.nearFoot]) line([foot.heel, foot.ball, foot.toe], foot.stance ? '#ffef5f' : '#8cd1df', .3);
    if (!translucent) {
      context.strokeStyle = '#a8e47d'; context.lineWidth = .2; context.beginPath(); context.ellipse(pose.neck[0], pose.neck[1] - 6, 4.5, 5.5, 0, 0, Math.PI * 2); context.stroke();
      line([[pose.neck[0], pose.neck[1] - 6], [pose.neck[0] + 3, pose.neck[1] - 6 + pose.headTurn * .4]], '#a8e47d', .15);
    }
    if (!translucent) {
      for (const [landmark, colour] of [[pose.face.eye, '#77c7ff'], [pose.face.mouth, '#ff9f87'], [pose.face.ear, '#d7b775'], [pose.face.nose, '#b5df95']] as const) {
        context.fillStyle = colour; context.beginPath(); context.arc(landmark.world[0], landmark.world[1], .18, 0, Math.PI * 2); context.fill();
      }
    } else {
      for (const [landmark, colour] of [[pose.face.eye, '#77c7ff'], [pose.face.mouth, '#ff9f87'], [pose.face.ear, '#d7b775']] as const) {
        context.strokeStyle = colour; context.lineWidth = .12; context.strokeRect(landmark.pixel[0], landmark.pixel[1], 1, 1);
      }
    }
    context.restore();
  }
  function currentIndex(): number { return sampleIndex(rig, time); }
  function tick(now: number): void {
    if (playing) {
      const next = time + Math.max(0, Math.min(now - last, 100)) * speed / rig.durationMs;
      time = rig.performance && !rig.performance.loop ? Math.min(1, next) : next % 1;
      if (time === 1) {playing = false; updateButton();}
    }
    last = now;
    const index = currentIndex();
    const sample = sampleTime(rig, index), pose = sampleRig(rig, mode.value === 'samples' ? sample : time);
    const context = bones.getContext('2d')!, pixel = avatar.getContext('2d')!;
    context.clearRect(0, 0, bones.width, bones.height); pixel.clearRect(0, 0, avatar.width, avatar.height);
    skeleton(context, pose);
    const frame = data.frames[action.prefix + (index + 1)];
    frame.grid.forEach((row, y) => [...row].forEach((code, x) => { const colour = data.palette[code]; if (colour) { pixel.fillStyle = colour; pixel.fillRect(x * scale, y * scale, scale, scale); } }));
    if (overlay.checked) skeleton(pixel, sampleRig(rig, sample), true);
    if (lightToggle.checked) { const litContext = lit.getContext('2d')!; litContext.clearRect(0, 0, lit.width, lit.height); paintLit(litContext, frame.grid, index); if (overlay.checked) skeleton(litContext, sampleRig(rig, sample), true); }
    slider.value = String(Math.floor(time * 1000));
    $<HTMLOutputElement>('#rig-position').textContent = `${index + 1}/${rig.sampleCount} · ${action.labels[index]}${!rig.lightingNote ? '' : lighting ? ` · Screen light ${Math.round((lighting.frames[index]?.intensity ?? 0) * 100)}%` : ' · Screen light: brighten face and hands dynamically'}`;
    section.dataset.pose = String(index + 1);
    updateFace(index, mode.value === 'samples' ? sampleRig(rig, sample) : pose);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
