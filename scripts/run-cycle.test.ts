// Verifies continuous rig anatomy, ground contacts, loop continuity and pixel sampling.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import rig from '../source/ben-side-rig.json';
import { sampleRunRig, stanceTravel } from '../src/rig/run.ts';
import { distance, type Chain } from '../src/rig/kinematics.ts';
import { drawRunCycle } from './draw-run-cycle.ts';
import palette from '../source/game-palette.json';

test('arms and legs retain bone lengths and the elbows never flip during a full continuous cycle', () => {
  for (let i = 0; i <= 240; i++) {
    const pose = sampleRunRig(rig, i / 240);
    for (const [chain, upper, lower] of [[pose.nearArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.farArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.nearLeg, rig.legs.thighLength, rig.legs.shinLength], [pose.farLeg, rig.legs.thighLength, rig.legs.shinLength]] as [Chain, number, number][]) {
      expect(distance(chain[0], chain[1])).toBeCloseTo(upper, 8); expect(distance(chain[1], chain[2])).toBeCloseTo(lower, 8);
    }
    for (const [shoulder, elbow, hand] of [pose.nearArm, pose.farArm]) {
      const cross = (elbow[0] - shoulder[0]) * (hand[1] - elbow[1]) - (elbow[1] - shoulder[1]) * (hand[0] - elbow[0]);
      expect(cross).toBeLessThan(0);
    }
    expect(distance(pose.nearLeg[2], pose.nearFoot.ankle)).toBeLessThan(1e-8);
    expect(distance(pose.farLeg[2], pose.farFoot.ankle)).toBeLessThan(1e-8);
    expect(distance(pose.root, pose.neck)).toBeCloseTo(10, 8);
  }
});
test('supporting toes lock to virtual world ground and both feet clear it in flight', () => {
  const travel = stanceTravel(rig) / rig.stride.stanceFraction;
  const start = sampleRunRig(rig, 0).nearFoot.toe[0];
  for (let i = 0; i < 100; i++) {
    const time = i / 100 * rig.stride.stanceFraction, pose = sampleRunRig(rig, time);
    expect(pose.nearFoot.toe[1]).toBeCloseTo(rig.groundY, 8);
    expect(pose.nearFoot.toe[0] + travel * time).toBeCloseTo(start, 8);
    expect(pose.nearFoot.heel[1]).toBeLessThanOrEqual(rig.groundY + 1e-8);
  }
  for (const time of [2 / 6, 5 / 6]) {
    const pose = sampleRunRig(rig, time); expect(pose.contact).toBe('flight');
    expect(pose.nearFoot.toe[1]).toBeLessThan(rig.groundY - .5); expect(pose.farFoot.toe[1]).toBeLessThan(rig.groundY - .5);
  }
});
test('continuous rig closes without a joint reset and samples the expected six contact phases', () => {
  expect(sampleRunRig(rig, 0)).toEqual(sampleRunRig(rig, 1));
  const last = sampleRunRig(rig, 1 - 1e-6), first = sampleRunRig(rig, 0);
  for (const key of ['nearArm', 'farArm', 'nearLeg', 'farLeg'] as const) for (let i = 0; i < 3; i++) expect(distance(last[key][i], first[key][i])).toBeLessThan(.001);
  expect(Array.from({ length: 6 }, (_, i) => sampleRunRig(rig, i / 6).contact)).toEqual(['near', 'near', 'flight', 'far', 'far', 'flight']);
});
test('six palette sprites have alternating supporting soles and empty ground in flight', () => {
  const frames = Object.values(drawRunCycle()); expect(frames.length).toBe(6);
  for (const [i, frame] of frames.entries()) {
    const floor = frame.grid[rig.groundY];
    expect(frame.grid.every(row => row.length === rig.width && [...row].every(c => Object.hasOwn(palette, c)))).toBe(true);
    expect(frame.grid.slice(rig.groundY + 1).every(row => row === '.'.repeat(rig.width))).toBe(true);
    expect(frame.grid.join('')).toContain('M');
    if (i === 2 || i === 5) expect(/[WL]/.test(floor)).toBe(false);
    else expect(floor).toContain(i < 3 ? 'W' : 'L');
  }
});
