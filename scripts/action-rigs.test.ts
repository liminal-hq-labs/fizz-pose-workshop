// Verifies action rig anatomy, equipment attachments, palette output and continuous loop seams.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { actionRigs } from './draw-action-rigs.ts';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';
import { skinRig, sampleRigSprites } from './rig-skin.ts';
import { sampleRig } from '../src/rig/sample.ts';
import { distance, type Chain } from '../src/rig/kinematics.ts';
import { validateRig } from '../src/rig/run.ts';

for (const {rig, prefix} of actionRigs) {
  test(`${rig.motion} keeps fixed bones and attached hands/feet throughout a closed loop`, () => {
    expect(sampleRig(rig, 0)).toEqual(sampleRig(rig, 1));
    for (let i = 0; i <= 120; i++) {
      const pose = sampleRig(rig, i / 120);
      for (const [chain, upper, lower] of [[pose.nearArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.farArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.nearLeg, rig.legs.thighLength, rig.legs.shinLength], [pose.farLeg, rig.legs.thighLength, rig.legs.shinLength]] as [Chain, number, number][]) {
        expect(distance(chain[0], chain[1])).toBeCloseTo(upper, 8); expect(distance(chain[1], chain[2])).toBeCloseTo(lower, 8);
      }
      expect(distance(pose.nearLeg[2], pose.nearFoot.ankle)).toBeLessThan(1e-8);
      expect(distance(pose.farLeg[2], pose.farFoot.ankle)).toBeLessThan(1e-8);
      if (pose.pogo) {
        expect(distance(pose.nearArm[2], pose.pogo.grips[0])).toBeLessThan(1e-8);
        expect(distance(pose.farArm[2], pose.pogo.grips[1])).toBeLessThan(1e-8);
        expect(pose.nearFoot.ball[1]).toBeCloseTo(pose.pogo.pegs[0][1], 8);
        expect(pose.farFoot.ball[1]).toBeCloseTo(pose.pogo.pegs[0][1], 8);
        expect(pose.pogo.tip[1]).toBeLessThanOrEqual(rig.groundY);
        if (pose.pogo.grounded) expect(pose.pogo.tip[1]).toBe(rig.groundY);
      } else {
        expect(distance(pose.nearArm[2], pose.weapon!.grip)).toBeLessThan(1e-8);
        expect(pose.nearFoot.ball).toEqual(sampleRig(rig, 0).nearFoot.ball);
        expect(pose.farFoot.ball).toEqual(sampleRig(rig, 0).farFoot.ball);
      }
      const frame = skinRig(rig, skin, pose);
      expect(frame.grid.every(row => row.length === rig.width && [...row].every(code => Object.hasOwn(palette, code)))).toBe(true);
      expect(frame.grid.slice(rig.groundY + 1).every(row => row === '.'.repeat(rig.width))).toBe(true);
      for (const key of ['eye', 'mouth', 'ear'] as const) {
        const [x,y] = pose.face[key].pixel; expect(frame.grid[y][x]).toBe(skin.face[key]);
      }
    }
    const last = sampleRig(rig, 1 - 1e-6), first = sampleRig(rig, 0);
    for (const key of ['nearArm', 'farArm', 'nearLeg', 'farLeg'] as const) for (let i = 0; i < 3; i++) expect(distance(last[key][i], first[key][i])).toBeLessThan(.001);
    expect(Object.keys(sampleRigSprites(rig, skin, prefix))).toHaveLength(6);
  });
}
test('pogo compresses on the ground, launches and raises the entire device at the apex', () => {
  const rig = actionRigs[0].rig, compressed = sampleRig(rig, 0), launch = sampleRig(rig, .18), apex = sampleRig(rig, .5);
  expect(compressed.pogo!.springLength).toBe(3); expect(launch.pogo!.springLength).toBe(6);
  expect(apex.pogo!.tip[1]).toBe(rig.groundY - 6);
  expect(apex.contact).toBe('flight'); expect(compressed.contact).toBe('pogo');
  expect(apex.root[1]).toBeLessThan(compressed.root[1] - 8);
});
test('Stunner discharge precedes recovery and returns to the same ready position', () => {
  const rig = actionRigs[1].rig, aim = sampleRig(rig, 0), fire = sampleRig(rig, 1 / 6), recoil = sampleRig(rig, 2 / 6), ready = sampleRig(rig, 5 / 6);
  expect(aim.weapon!.flash).toBe(false); expect(fire.weapon!.flash).toBe(true); expect(recoil.weapon!.flash).toBe(false);
  expect(fire.weapon!.grip[0]).toBeLessThan(aim.weapon!.grip[0]); expect(fire.weapon!.angle).toBeLessThan(aim.weapon!.angle);
  expect(ready.weapon).toEqual(aim.weapon);
});
test('invalid spring and recoil settings cannot produce exports', () => {
  const pogo = structuredClone(actionRigs[0].rig); pogo.pogo!.compressedLength = -1;
  expect(() => validateRig(pogo)).toThrow();
  const fire = structuredClone(actionRigs[1].rig); fire.fire!.recoil = Number.NaN;
  expect(() => validateRig(fire)).toThrow();
});
