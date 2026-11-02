// Verifies that rig-derived facial dots stay attached to the same head-local pixels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import rig from '../source/ben-side-rig.json';
import skin from '../source/ben-side-skin.json';
import { sampleRunRig } from '../src/rig/run.ts';
import { sampleFace, facePixels } from '../src/rig/face.ts';
import { drawRunCycle } from './draw-run-cycle.ts';

test('small camera turns cannot push eye and mouth across independent world rounding boundaries', () => {
  const towards = sampleFace([10.49, 20.49], -1, rig.face), away = sampleFace([10.49, 20.49], 1, rig.face);
  expect(Math.round(towards.eye.world[0])).not.toBe(Math.round(away.eye.world[0]));
  expect(towards.eye.pixel).toEqual(away.eye.pixel); expect(towards.mouth.pixel).toEqual(away.mouth.pixel);
  expect(towards.eye.pixel).toEqual([12, 15]); expect(towards.mouth.pixel).toEqual([12, 17]);
});
test('continuous facial landmarks remain fixed in head space while following the rig anchor', () => {
  for (let i = 0; i <= 240; i++) {
    const pose = sampleRunRig(rig, i / 240), face = pose.face;
    expect(face.anchor).toEqual(pose.neck);
    expect([face.eye.pixel[0] - face.pixelAnchor[0], face.eye.pixel[1] - face.pixelAnchor[1]]).toEqual([2, -5]);
    expect([face.mouth.pixel[0] - face.pixelAnchor[0], face.mouth.pixel[1] - face.pixelAnchor[1]]).toEqual([2, -3]);
    expect(face.eye.pixel[0]).toBe(face.mouth.pixel[0]); expect(face.mouth.pixel[1] - face.eye.pixel[1]).toBe(2);
    expect(Math.abs(face.eye.local[0] - rig.face.eye[0])).toBeLessThan(.1);
  }
});
test('all six actual sprite grids contain exactly the rig eye and mouth, including the loop seam', () => {
  const frames = Object.values(drawRunCycle()), positions = [];
  for (const [i, frame] of frames.entries()) {
    const face = sampleRunRig(rig, i / rig.sampleCount).face;
    expect(facePixels(frame, skin.face.eye, face.pixelAnchor)).toEqual([face.eye.pixel]);
    expect(facePixels(frame, skin.face.mouth, face.pixelAnchor)).toEqual([face.mouth.pixel]);
    expect(frame.grid[face.eye.pixel[1]][face.eye.pixel[0]]).toBe(skin.face.eye);
    expect(frame.grid[face.mouth.pixel[1]][face.mouth.pixel[0]]).toBe(skin.face.mouth);
    positions.push(face.eye.pixel);
  }
  expect(positions).toEqual([[17, 10], [17, 10], [17, 9], [17, 10], [16, 9], [16, 9]]);
  for (let i = 0; i < positions.length; i++) {
    const next = positions[(i + 1) % positions.length];
    expect(Math.abs(positions[i][0] - next[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(positions[i][1] - next[1])).toBeLessThanOrEqual(1);
  }
});
