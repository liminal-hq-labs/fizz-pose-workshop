// Exports rig-derived facial coordinates and head-aligned SVG crops for sequence inspection.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { facePixels } from '../src/rig/face.ts';
import type { RigPose } from '../src/rig/run.ts';
import type { Frame, Palette } from '../src/types.ts';

export function faceSequence(frames: Frame[], samples: RigPose[], palette: Palette, colours: { eye: string; mouth: string; ear: string }): { json: string; svg: string } {
  const report = samples.map((pose, i) => ({
    frame: i + 1, phase: pose.time, view: pose.presentation?.view ?? 'side', expression: pose.presentation?.expression ?? 'normal', headAnchor: pose.face.pixelAnchor,
    eye: pose.face.eye, mouth: pose.face.mouth, mouthPixels: pose.face.mouthPixels, ear: pose.face.ear, nose: pose.face.nose, noseTip: pose.face.noseTip, noseVisible: pose.face.noseVisible, cheek: pose.face.cheek, chin: pose.face.chin, shift: pose.face.pixelShift,
    renderedEar: frames[i].grid[pose.face.ear.pixel[1]]?.[pose.face.ear.pixel[0]] === colours.ear ? [pose.face.ear.pixel] : [],
    renderedEye: facePixels(frames[i], colours.eye, pose.face.pixelAnchor), renderedMouth: facePixels(frames[i], colours.mouth, pose.face.pixelAnchor),
  }));
  const cells = samples.map((pose, i) => {
    const [ax, ay] = pose.face.pixelAnchor, frame = frames[i], rects: string[] = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 15; x++) {
      const code = frame.grid[y + ay - 13]?.[x + ax - 7], colour = palette[code];
      if (colour) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`);
    }
    return `<g transform="translate(${i * 19 + 2},2)">${rects.join('')}<text x="7" y="17" fill="#c7ddb9" text-anchor="middle" font-family="monospace" font-size="2">${i + 1}</text></g>`;
  });
  return {
    json: JSON.stringify({ note: 'World landmarks follow the continuous rig; pixels share one snapped head anchor. Crops are aligned to that anchor.', frames: report }, null, 2) + '\n',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${samples.length * 114}" height="120" viewBox="0 0 ${samples.length * 19} 20" shape-rendering="crispEdges"><title>Head-aligned facial landmark sequence</title><rect width="100%" height="100%" fill="#14221b"/>${cells.join('')}</svg>\n`,
  };
}
