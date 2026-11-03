// Compares a smooth side-view rig with its editable sprite samples in the workshop.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import skin from '../../source/ben-side-skin.json';
import { mountFaceInspector } from './face-inspector.ts';
import { rigCatalogue } from './catalogue.ts';
import { playbackElapsed, rigPlayback, sampleRig, sampleTime } from './sample.ts';
import { type SideRig, type RigPose } from './run.ts';
import type { Chain, Vec2 } from './kinematics.ts';
import type { WorkshopData } from '../types.ts';

export function mountRigPreview(data: WorkshopData): void {
  const mount = document.querySelector<HTMLElement>('#rig-preview'); if (!mount) return;
  const section: HTMLElement = mount;
  const actions = rigCatalogue;
  let action = actions[0], rig = action.rig;
  section.innerHTML = `<h2>Rig first, sprites second.</h2><p>The cyan limbs face the camera; purple limbs are behind. Yellow feet are supported by the ground or pogo pegs. Watch the continuous rig, switch to the sampled sprite poses, or pause and step through each pose. Both views use the same rig time.</p>
    <div class="controls"><label>Action <select id="rig-action">${actions.map((entry,i) => `<option value="${i}">${entry.title}</option>`).join('')}</select></label><button id="rig-play">Pause rig</button><label>Rig speed <select id="rig-speed"><option value="0.25">Quarter speed</option><option value="0.5" selected>Half speed</option><option value="1">Normal speed</option></select></label><label>Rig display <select id="rig-mode"><option value="smooth">Continuous</option><option value="samples">Sprite samples</option></select></label><label><input id="rig-overlay" type="checkbox">Overlay sampled rig on sprite</label><button id="rig-prev">Previous pose</button><button id="rig-next">Next pose</button></div>
    <label class="rig-scrubber">Cycle position <input id="rig-time" type="range" min="0" max="1000" value="0"><output id="rig-position"></output></label>
    <div class="rig-comparison"><article><h3>Continuous rig</h3><div class="rig-stage"><canvas id="rig-bones" role="img" aria-label="Animated character skeleton with fixed-length arms and legs"></canvas></div></article><article><h3>Sprite samples</h3><div class="rig-stage"><canvas id="rig-avatar" role="img" aria-label="The sprite sample corresponding to the rig phase"></canvas></div></article></div>
    <p class="small"><a href="rig/ben-running/rig.svg" target="_blank">Animated rig SVG</a> · <a href="rig/ben-running/samples.json">Joint samples</a> · <a href="rig/ben-running/rig.json">Rig settings</a> · <a href="rig/ben-running/skin.json">Sprite skin</a> · <a href="rig/ben-running/sprites.gif" target="_blank">Sprite GIF</a></p>`;
  let updateFace = mountFaceInspector(section, rig, data, skin.face, action.prefix, action.folder);
  const $ = <T extends HTMLElement>(query: string): T => section.querySelector<T>(query)!;
  const bones = $<HTMLCanvasElement>('#rig-bones'), avatar = $<HTMLCanvasElement>('#rig-avatar');
  const slider = $<HTMLInputElement>('#rig-time'), play = $<HTMLButtonElement>('#rig-play'), overlay = $<HTMLInputElement>('#rig-overlay');
  const speedSelect = $<HTMLSelectElement>('#rig-speed'), mode = $<HTMLSelectElement>('#rig-mode');
  // Playback runs on elapsed milliseconds through the saved frame holds, so it wraps like the gallery and the exports: a
  // one-shot rests on its final pose, then replays.
  let elapsed = 0, time = 0, last = performance.now(), speed = .5, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scale = 10;
  function resize(): void { for (const c of [bones, avatar]) { c.width = rig.width * scale; c.height = rig.height * scale; } }
  resize();
  $<HTMLSelectElement>('#rig-action').onchange = event => {
    action = actions[Number((event.target as HTMLSelectElement).value)]; rig = action.rig; elapsed = 0; time = 0; resize();
    section.querySelector('#face-sequence')?.remove();
    updateFace = mountFaceInspector(section, rig, data, skin.face, action.prefix, action.folder);
    section.querySelectorAll<HTMLAnchorElement>('a[href^="rig/"]').forEach(link => { link.setAttribute('href', link.getAttribute('href')!.replace(/rig\/ben-[^/]+\//, 'rig/' + action.folder + '/'));  });
  };
  function updateButton(): void { play.textContent = playing ? 'Pause rig' : 'Play rig'; play.setAttribute('aria-pressed', String(playing)); }
  updateButton(); play.onclick = () => { playing = !playing; updateButton(); };
  speedSelect.onchange = () => { speed = Number(speedSelect.value); };
  slider.oninput = () => { playing = false; time = Number(slider.value) / 1000; elapsed = playbackElapsed(rig, time); updateButton(); };
  const step = (direction: number): void => { playing = false; time = sampleTime(rig, (currentIndex() + direction + rig.sampleCount) % rig.sampleCount); elapsed = playbackElapsed(rig, time); updateButton(); };
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
  function currentIndex(): number { return rigPlayback(rig, elapsed).index; }
  function tick(now: number): void {
    if (playing) { elapsed += Math.max(0, Math.min(now - last, 100)) * speed; time = rigPlayback(rig, elapsed).time; }
    last = now;
    const index = currentIndex();
    const sample = sampleTime(rig, index), pose = sampleRig(rig, mode.value === 'samples' ? sample : time);
    const context = bones.getContext('2d')!, pixel = avatar.getContext('2d')!;
    context.clearRect(0, 0, bones.width, bones.height); pixel.clearRect(0, 0, avatar.width, avatar.height);
    skeleton(context, pose);
    const frame = data.frames[action.prefix + (index + 1)];
    frame.grid.forEach((row, y) => [...row].forEach((code, x) => { const colour = data.palette[code]; if (colour) { pixel.fillStyle = colour; pixel.fillRect(x * scale, y * scale, scale, scale); } }));
    if (overlay.checked) skeleton(pixel, sampleRig(rig, sample), true);
    slider.value = String(Math.floor(time * 1000));
    $<HTMLOutputElement>('#rig-position').textContent = `${index + 1}/${rig.sampleCount} · ${action.labels[index]}${rig.lightingNote ? ' · Screen light: brighten face and hands dynamically' : ''}`;
    section.dataset.pose = String(index + 1);
    updateFace(index, mode.value === 'samples' ? sampleRig(rig, sample) : pose);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
