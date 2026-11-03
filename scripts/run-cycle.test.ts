// Verifies continuous rig anatomy, ground contacts, loop continuity and pixel sampling.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import rig from '../source/ben-side-rig.json';
import { sampleRunRig, stanceTravel, type RigFoot, type RigPose } from '../src/rig/run.ts';
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
test('supporting forefeet lock to virtual world ground and both feet clear it in flight', () => {
  const travel = stanceTravel(rig) / rig.stride.stanceFraction;
  const start = sampleRunRig(rig, 0).nearFoot.ball[0];
  for (let i = 0; i < 100; i++) {
    const time = i / 100 * rig.stride.stanceFraction, pose = sampleRunRig(rig, time);
    expect(pose.nearFoot.ball[1]).toBeCloseTo(rig.groundY, 8);
    expect(pose.nearFoot.ball[0] + travel * time).toBeCloseTo(start, 8);
    expect(pose.nearFoot.heel[1]).toBeLessThanOrEqual(rig.groundY + 1e-8);
  }
  for (const time of [2 / 6, 5 / 6]) {
    const pose = sampleRunRig(rig, time); expect(pose.contact).toBe('flight');
    expect(pose.nearFoot.toe[1]).toBeLessThan(rig.groundY - .5); expect(pose.farFoot.toe[1]).toBeLessThan(rig.groundY - .5);
  }
});
const contacts: RigPose['contact'][] = ['near', 'near', 'near', 'flight', 'flight', 'flight', 'far', 'far', 'far', 'flight', 'flight', 'flight'];
test('continuous rig closes without a joint reset and samples the expected twelve contact phases', () => {
  expect(sampleRunRig(rig, 0)).toEqual(sampleRunRig(rig, 1));
  const last = sampleRunRig(rig, 1 - 1e-6), first = sampleRunRig(rig, 0);
  for (const key of ['nearArm', 'farArm', 'nearLeg', 'farLeg'] as const) for (let i = 0; i < 3; i++) expect(distance(last[key][i], first[key][i])).toBeLessThan(.001);
  expect(Array.from({ length: 12 }, (_, i) => sampleRunRig(rig, i / 12).contact)).toEqual(contacts);
});
test('twelve palette sprites have alternating supporting soles and empty ground in flight', () => {
  const frames = Object.values(drawRunCycle()); expect(frames.length).toBe(12);
  for (const [i, frame] of frames.entries()) {
    const floor = frame.grid[rig.groundY];
    expect(frame.grid.every(row => row.length === rig.width && [...row].every(c => Object.hasOwn(palette, c)))).toBe(true);
    expect(frame.grid.slice(rig.groundY + 1).every(row => row === '.'.repeat(rig.width))).toBe(true);
    expect(frame.grid.join('')).toContain('M');
    // A foot within half a pixel of the ground (supporting, just leaving or about to land) shows its sole on the ground row.
    const pose = sampleRunRig(rig, i / 12), low = (foot: RigFoot): boolean => rig.groundY - Math.max(foot.toe[1], foot.heel[1]) < .5;
    expect(floor.includes('W')).toBe(low(pose.nearFoot)); expect(floor.includes('L')).toBe(low(pose.farFoot));
    if (contacts[i] !== 'flight') expect(low(contacts[i] === 'near' ? pose.nearFoot : pose.farFoot)).toBe(true);
  }
});

// Both strides are the same motion half a cycle apart: each joint matches its near/far counterpart six frames later, except
// where the near foot deliberately swings wider to pass in front of the planted far shin.
test('the second stride repeats the first with near and far swapped', () => {
  for (let i = 0; i < 6; i++) {
    const a = sampleRunRig(rig, i / 12), b = sampleRunRig(rig, (i + 6) / 12);
    expect(distance(a.root, b.root)).toBeLessThan(1e-9); expect(b.torsoAngle).toBeCloseTo(a.torsoAngle, 10);
    expect(distance(a.nearFoot.ankle, b.farFoot.ankle)).toBeLessThan(1e-9);
    expect(distance(a.farFoot.ankle, b.nearFoot.ankle)).toBeLessThanOrEqual(rig.stride.nearPassForward + 1e-9);
  }
});
// Twelve samples halve the per-step travel: no joint moves more than five pixels between consecutive sprites.
test('no running joint jumps more than five pixels between consecutive frames, including the loop seam', () => {
  const poses = Array.from({ length: 12 }, (_, i) => sampleRunRig(rig, i / 12));
  for (let i = 0; i < 12; i++) {
    const a = poses[i], b = poses[(i + 1) % 12];
    for (const [p, q] of [[a.root, b.root], [a.neck, b.neck], [a.nearArm[2], b.nearArm[2]], [a.farArm[2], b.farArm[2]], [a.nearLeg[1], b.nearLeg[1]], [a.farLeg[1], b.farLeg[1]], [a.nearFoot.ankle, b.nearFoot.ankle], [a.farFoot.ankle, b.farFoot.ankle]]) expect(distance(p, q)).toBeLessThan(5);
  }
});

test('shoe articulation cushions landing and bends at the forefoot during push-off', () => {
  const landing = sampleRunRig(rig, 0).nearFoot;
  expect(landing.heel[1]).toBeCloseTo(rig.groundY, 8);
  expect(landing.ball[1]).toBeCloseTo(rig.groundY, 8);
  expect(landing.toe[1]).toBeLessThan(rig.groundY - .7);
  expect(landing.compression).toBe(rig.feet.landingCompression);
  const settled = sampleRunRig(rig, rig.stride.stanceFraction * .32).nearFoot;
  expect(settled.toePitch).toBeCloseTo(0, 8); expect(settled.compression).toBeCloseTo(0, 8);
  const push = sampleRunRig(rig, rig.stride.stanceFraction * .85).nearFoot;
  expect(push.heel[1]).toBeLessThan(rig.groundY - .7);
  expect(push.ball[1]).toBeCloseTo(rig.groundY, 8); expect(push.toe[1]).toBeCloseTo(rig.groundY, 8);
  expect(push.pitch - push.toePitch).toBeGreaterThan(.3);
  for (let i = 0; i <= 240; i++) for (const foot of [sampleRunRig(rig, i / 240).nearFoot, sampleRunRig(rig, i / 240).farFoot]) {
    expect(distance(foot.ball, foot.toe)).toBeCloseTo(2, 8);
    expect(distance(foot.heel, foot.ball)).toBeCloseTo(2, 8);
    expect(Math.max(foot.heel[1], foot.ball[1], foot.toe[1])).toBeLessThanOrEqual(rig.groundY + 1e-8);
  }
  const last = sampleRunRig(rig, 1 - 1e-6).nearFoot;
  expect(distance(last.toe, landing.toe)).toBeLessThan(.001);
  expect(Math.abs(last.compression - landing.compression)).toBeLessThan(.001);
});

// The forward swing stays low over the ground while the back foot still kicks its heel up behind the body.
test('the recovering foot clears the ground low, with a heel kick behind the body', () => {
  for (let i = 0; i <= 240; i++) {
    const pose = sampleRunRig(rig, i / 240);
    for (const foot of [pose.nearFoot, pose.farFoot]) {
      expect(rig.groundY - foot.heel[1]).toBeLessThanOrEqual(4);
      expect(rig.groundY - foot.toe[1]).toBeLessThanOrEqual(4.5);
    }
  }
  const kick = sampleRunRig(rig, 0).farFoot;
  expect(rig.groundY - kick.heel[1]).toBeGreaterThanOrEqual(3);
  expect(kick.heel[0]).toBeLessThan(sampleRunRig(rig, 0).root[0]);
});

// The near foot swings slightly wider at mid-swing so its shoe clears the planted far shin instead of cutting it short.
test('the near foot passes clear in front of the planted far shin, and only around mid-swing', () => {
  const pose = sampleRunRig(rig, 4 / 6), [, knee, ankle] = pose.farLeg, heel = pose.nearFoot.heel;
  const shinX = knee[0] + (ankle[0] - knee[0]) * (heel[1] - knee[1]) / (ankle[1] - knee[1]);
  expect(heel[0] - shinX).toBeGreaterThanOrEqual(3);
  expect(rig.groundY - heel[1]).toBeLessThanOrEqual(4);
  // Outside the pass window, the near foot follows the far foot's path half a cycle later.
  for (let i = 0; i <= 240; i++) {
    const t = i / 240, near = sampleRunRig(rig, t).nearFoot;
    if (near.stance || near.progress <= .4 || near.progress >= .72) expect(distance(near.ankle, sampleRunRig(rig, t + .5).farFoot.ankle)).toBeLessThan(1e-9);
  }
});
