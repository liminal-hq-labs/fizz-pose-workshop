// Shows ordered head-aligned crops and measured facial pixels beside their rig-derived anchors.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import saved from '../../assets.json';
import { sampleRig, sampleTime } from './sample.ts';
import { facePixels } from './face.ts';
import { type RigPose, type SideRig } from './run.ts';
import type { Vec2 } from './kinematics.ts';
import type { WorkshopData } from '../types.ts';

export function mountFaceInspector(parent: HTMLElement, rig: SideRig, data: WorkshopData, colours: { eye: string; mouth: string; ear: string }, prefix = 'ben_walkRight', folder = 'ben-running'): (index: number, pose: RigPose) => void {
  const block = document.createElement('section'); block.className = 'face-inspector'; block.id = 'face-sequence';
  block.innerHTML = `<h3>Face landmarks · in sequence</h3><p>These crops follow the head, so the eye, mouth and ear follow the shared rig settings within each crop. The table shows their canvas pixels and offsets from the shared head anchor. A browser draft that differs from the rig is marked below.</p><label><input id="rig-face-markers" type="checkbox" checked>Highlight eye, mouth, nose and ear pixels</label><p id="rig-face-current" class="small"></p><div class="face-heads"></div><div class="face-table-wrap"><table><thead><tr><th>Frame</th><th>Head anchor</th><th>Eye pixel</th><th>Mouth pixel</th><th>Ear pixel</th><th>Offsets from head</th><th>Nose / cheek / chin</th><th>Status</th></tr></thead><tbody></tbody></table></div><p class="small"><a href="rig/${folder}/face-sequence.svg" target="_blank">Saved head sequence</a> · <a href="rig/${folder}/face-sequence.json">Saved landmark measurements</a></p>`;
  parent.append(block);
  const container = block.querySelector<HTMLElement>('.face-heads')!, tbody = block.querySelector<HTMLTableSectionElement>('tbody')!;
  const markers = block.querySelector<HTMLInputElement>('#rig-face-markers')!;
  const samples = Array.from({ length: rig.sampleCount }, (_, i) => sampleRig(rig, sampleTime(rig, i)));
  const canvases: HTMLCanvasElement[] = [], rows: HTMLTableRowElement[] = [];
  for (let i = 0; i < rig.sampleCount; i++) {
    const card = document.createElement('article'), title = document.createElement('h4'), canvas = document.createElement('canvas');
    title.textContent = `Frame ${i + 1}`; canvas.width = 90; canvas.height = 84; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Head-aligned face sample ${i + 1}`);
    card.append(title, canvas); container.append(card); canvases.push(canvas);
    const row = tbody.insertRow(); for (let c = 0; c < 8; c++) row.insertCell(); rows.push(row);
  }
  const cache: string[] = [];
  const coordinate = (point: Vec2): string => `${point[0]}, ${point[1]}`;
  const actual = (points: Vec2[]): string => points.length ? points.map(coordinate).join(' / ') : '—';
  const offset = (points: Vec2[], anchor: Vec2): string => points.length === 1 ? coordinate([points[0][0] - anchor[0], points[0][1] - anchor[1]]) : '—';
  let active = -1;
  return (index, pose) => {
    block.querySelector<HTMLElement>('#rig-face-current')!.textContent = `Current rig: eye ${pose.face.eye.world.map(v => v.toFixed(2)).join(', ')} → pixel ${coordinate(pose.face.eye.pixel)}; mouth ${pose.face.mouth.world.map(v => v.toFixed(2)).join(', ')} → pixel ${coordinate(pose.face.mouth.pixel)}; ear ${coordinate(pose.face.ear.pixel)}; nose ${coordinate(pose.face.nose.pixel)}; chin ${coordinate(pose.face.chin.pixel)}.`;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i], anchor = sample.face.pixelAnchor, frame = data.frames[prefix + (i + 1)];
      const signature = `${markers.checked}:${frame.grid.slice(Math.max(0, anchor[1] - 13), anchor[1] + 1).join('')}`;
      if (signature !== cache[i]) {
        cache[i] = signature;
        const eye = facePixels(frame, colours.eye, anchor), mouth = facePixels(frame, colours.mouth, anchor);
        const ear = sample.face.ear.pixel, earMatches = frame.grid[ear[1]]?.[ear[0]] === colours.ear;
        const landmarksMatch = earMatches && JSON.stringify(eye) === JSON.stringify(sample.face.eyePixels) && JSON.stringify(mouth) === JSON.stringify(sample.face.mouthPixels);
        const canonical = (saved.frames as WorkshopData['frames'])[prefix + (i + 1)];
        const matches = sample.presentation ? !!canonical && frame.grid.slice(Math.max(0,anchor[1]-13),anchor[1]+1).join('') === canonical.grid.slice(Math.max(0,anchor[1]-13),anchor[1]+1).join('') : landmarksMatch;
        const label = sample.presentation?.view === 'back' ? 'Facing away' : sample.presentation && sample.presentation.expression !== 'normal' ? 'Expression: ' + sample.presentation.expression : 'Anchored';
        const values = [String(i + 1), coordinate(anchor), actual(eye), actual(mouth), coordinate(ear), `Eye ${offset(eye, anchor)} / mouth ${offset(mouth, anchor)} / ear ${coordinate([ear[0] - anchor[0], ear[1] - anchor[1]])}`, [sample.face.nose.pixel, sample.face.cheek.pixel, sample.face.chin.pixel].map(coordinate).join(' / '), matches ? label : 'Draft differs'];
        values.forEach((value, c) => { rows[i].cells[c].textContent = value; }); rows[i].dataset.matches = String(matches);
        const context = canvases[i].getContext('2d')!; context.clearRect(0, 0, 90, 84);
        const origin: Vec2 = [anchor[0] - 7, anchor[1] - 13];
        for (let y = 0; y < 14; y++) for (let x = 0; x < 15; x++) {
          const code = frame.grid[y + origin[1]]?.[x + origin[0]], colour = data.palette[code];
          if (colour) { context.fillStyle = colour; context.fillRect(x * 6, y * 6, 6, 6); }
        }
        if (markers.checked) for (const [points, colour] of [[eye, '#77c7ff'], [mouth, '#ffb78e'], [[ear], '#d7b775'], [[sample.face.nose.pixel], '#b5df95']] as [Vec2[], string][]) {
          context.strokeStyle = colour; context.lineWidth = 1;
          for (const point of points) context.strokeRect((point[0] - origin[0]) * 6 + .5, (point[1] - origin[1]) * 6 + .5, 5, 5);
        }
      }
      if (active !== index) { rows[i].dataset.active = String(i === index); container.children[i].setAttribute('aria-current', String(i === index)); }
    }
    active = index;
  };
}
