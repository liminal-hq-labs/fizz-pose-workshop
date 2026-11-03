// Checks the seated phone idle: a real seat on the ground, crossed shins that read in the sprite, the grip, the holster,
// and the rig-to-sprite overlay.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import type { Vec2 } from '../src/rig/kinematics.ts';
import type { RigPose } from '../src/rig/run.ts';
import { paintRig, sampleRigSprites, Pixels, type BodyPart } from './rig-skin.ts';
import { loadSavedFrames } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';

const entry = rigCatalogue.find(item => item.animation === 'phone-idle')!, rig = entry.rig, clip = rig.performance!;
const samples = Array.from({ length: rig.sampleCount }, (_, i) => sampleRig(rig, sampleTime(rig, i)));
const painted = samples.map(pose => paintRig(rig, skin, pose));
const seatedKey = clip.keys.findIndex(key => key.seated), seatedFrom = clip.keys[seatedKey].phase;
const seated = samples.map((pose, i) => [pose, i] as const).filter(([pose]) => pose.presentation!.seated);
const seatBottom = Math.max(...skin.seatFront.rows.map(row => row.y)) - skin.seatFront.anchor[1];

test('the seat rests on the ground line once he sits, and stays there while he reads', () => {
  expect(seated.map(([, i]) => i)).toEqual([3, 4, 5, 6, 7, 8]);
  for (const [pose, i] of seated) {
    const grid = painted[i].frame().grid, x = Math.round(pose.root[0]);
    // The seat's ink row is the ground contact, and there is no gap between the hips and the ground.
    expect(Math.round(pose.root[1]) + seatBottom).toBe(rig.groundY);
    for (let y = Math.round(pose.root[1]); y <= rig.groundY; y++) expect(grid[y][x]).not.toBe('.');
    expect(grid[rig.groundY].replaceAll('.', '').length).toBeGreaterThanOrEqual(12);
    // The shirt hem bunches one pixel wider than the standing hem just above the belt.
    const belt = Math.round(pose.root[1]) - 1, hem = (frame: string[], y: number): number => frame[y].replaceAll('.', '').length;
    expect(grid[belt - 1].indexOf('R')).toBeLessThan(painted[0].frame().grid[Math.round(samples[0].root[1]) - 2].indexOf('R'));
    expect(hem(grid, belt)).toBeGreaterThan(0);
  }
  // From the moment the seat lands, the continuous rig never lifts the hips again.
  for (let t = seatedFrom; t <= 1; t += 1 / 240) expect(sampleRig(rig, t).root[1]).toBeCloseTo(clip.keys[seatedKey].root[1], 9);
  // The hips only ever move down on the way to the seat: no hover, no bounce.
  for (let t = 0, last = -Infinity; t <= seatedFrom; t += 1 / 240) { const y = sampleRig(rig, t).root[1]; expect(y).toBeGreaterThanOrEqual(last - 1e-9); last = y; }
});

test('the feet never lift or leave the ground, and the knees splay out with roughly level thighs', () => {
  for (let i = 0; i <= 240; i++) {
    const pose = sampleRig(rig, i / 240);
    for (const leg of [pose.nearLeg, pose.farLeg]) expect(leg[2][1]).toBeCloseTo(46, 9);
    expect(pose.contact).toBe('both');
  }
  for (const [pose] of seated) {
    const [nearHip, nearKnee, nearAnkle] = pose.nearLeg, [farHip, farKnee, farAnkle] = pose.farLeg;
    // Knees out to the sides, beyond the hips; thighs within 25 degrees of level, never lifted above it.
    expect(nearKnee[0]).toBeLessThan(nearHip[0] - 5); expect(farKnee[0]).toBeGreaterThan(farHip[0] + 5);
    for (const [hip, knee] of [[nearHip, nearKnee], [farHip, farKnee]]) expect(Math.abs(knee[1] - hip[1]) / Math.abs(knee[0] - hip[0])).toBeLessThan(Math.tan(25 * Math.PI / 180));
    // The shins cross: each ankle is tucked on the other side of the middle, towards the opposite knee.
    expect(nearAnkle[0]).toBeGreaterThan(pose.root[0] + 2); expect(farAnkle[0]).toBeLessThan(pose.root[0] - 2);
    expect(pose.presentation!.shinOver).toBe('near');
  }
});

/** The pixels a lone shin paints, using the same outlined segment as the skin. */
function shinBand(pose: RigPose, leg: 'nearLeg' | 'farLeg', seam: string): string[] {
  const out = new Pixels(rig.width, rig.height), chain = pose[leg];
  out.segment([chain[1], chain[2]], 2, skin.palette.denim, 'k'); out.segment([chain[1], chain[2]], 1, seam);
  return out.frame().grid;
}

test('the crossed shins overlap in the sprite, with the near shin drawn over the far shin', () => {
  for (const [pose, i] of seated) {
    const grid = painted[i].frame().grid, near = shinBand(pose, 'nearLeg', skin.palette.denimSeam), far = shinBand(pose, 'farLeg', 'C');
    let overlap = 0;
    for (let y = 0; y < rig.height; y++) for (let x = 0; x < rig.width; x++) {
      if (near[y][x] === '.' || far[y][x] === '.') continue;
      overlap++;
      // Where they cross, the sprite shows the near shin, never the far shin's seam, unless the phone or a hand held in
      // front of the lap covers both.
      if (painted[i].parts[y][x] === 'prop' || painted[i].parts[y][x] === 'hand') continue;
      expect(grid[y][x]).toBe(near[y][x]);
    }
    expect(overlap).toBeGreaterThanOrEqual(12);
    // Both diagonals read: the near shin's light seam on its knee side, and the far shin's own denim beyond the crossing
    // (a hand reaching for the pocket may cover part of it).
    const seams = (code: string, side: (x: number) => boolean): number => grid.reduce((sum, row) => sum + [...row].filter((c, x) => c === code && side(x)).length, 0);
    expect(seams(skin.palette.denimSeam, x => x < pose.root[0])).toBeGreaterThanOrEqual(3);
    const farShows = grid.reduce((sum, row, y) => sum + [...row].filter((c, x) => c !== 'k' && c === far[y][x] && near[y][x] === '.').length, 0);
    expect(farShows).toBeGreaterThanOrEqual(6);
    // Each red shoe shows on the opposite side to its knee.
    expect(seams('R', x => x > pose.root[0] + 2) && seams('R', x => x < pose.root[0] - 2)).toBeGreaterThan(0);
  }
});

test('the thumbs press the screen side: they show only above the phone, and the scrolling thumb drops behind it', () => {
  samples.forEach((pose, i) => {
    const phone = pose.presentation!.phone; if (!phone) return;
    const { rows, parts } = painted[i], px = Math.round(phone[0]), top = Math.round(phone[1]) - skin.phoneBack.anchor[1];
    const pressed = (pose.presentation!.scroll ?? 0) >= .5;
    expect(rows[top - 1][px + 1]).toBe('W'); expect(parts[top - 1][px + 1]).toBe('hand');
    if (pressed) expect(parts[top - 1][px - 1]).not.toBe('hand'); else expect(rows[top - 1][px - 1]).toBe('W');
    // Nothing of the hand covers the case: the back of the phone (camera side) shows whole between the fingers.
    for (let y = top; y <= top + 6; y++) for (let x = px - 1; x <= px + 1; x++) expect(parts[y][x]).toBe('prop');
    // A finger wraps round each side of the case.
    for (const x of [px - 2, px + 2]) expect(parts[Math.round(phone[1])][x]).toBe('hand');
  });
  expect(samples.at(-1)!.presentation!.scroll).toBe(1);
});

test('the Fizz Stunner rests on Ben’s right hip (the camera’s left) in every frame, on the thigh once seated', () => {
  samples.forEach((pose, i) => {
    const grid = painted[i].frame().grid, holster: Vec2[] = [];
    grid.forEach((row, y) => [...row].forEach((code, x) => { if (code === 'M' || code === 'm') holster.push([x, y]); }));
    expect(holster.length).toBeGreaterThanOrEqual(3);
    expect(holster.every(([x]) => x < pose.root[0] - 2)).toBe(true);
    // It hangs from the belt: its top is within a row of the belt and every pixel touches the body.
    const rowsUsed = holster.map(([, y]) => y);
    expect(Math.min(...rowsUsed)).toBeGreaterThanOrEqual(Math.round(pose.root[1]) - 1);
    expect(Math.max(...rowsUsed)).toBeLessThanOrEqual(Math.round(pose.root[1]) + 3);
  });
});

const expected: Record<string, readonly BodyPart[]> = {
  shoulder: ['arm', 'shirt'], elbow: ['arm', 'shirt', 'hand'], wrist: ['hand', 'arm', 'prop'],
  hip: ['leg', 'shirt'], knee: ['leg'], ankle: ['leg', 'shoe'], phone: ['prop'],
};
test('the sampled rig overlay sits on the matching limbs of every sprite within one pixel', () => {
  samples.forEach((pose, i) => {
    const { parts } = painted[i];
    const near = (point: Vec2, allowed: readonly BodyPart[]): boolean => {
      const x = Math.floor(point[0]), y = Math.floor(point[1]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (allowed.includes(parts[y + dy]?.[x + dx] ?? '')) return true;
      return false;
    };
    const joints: [string, Vec2][] = [];
    for (const arm of [pose.nearArm, pose.farArm]) joints.push(['shoulder', arm[0]], ['elbow', arm[1]], ['wrist', arm[2]]);
    for (const leg of [pose.nearLeg, pose.farLeg]) joints.push(['hip', leg[0]], ['knee', leg[1]], ['ankle', leg[2]]);
    if (pose.presentation!.phone) joints.push(['phone', pose.presentation!.phone]);
    for (const [name, point] of joints) expect(`${i + 1} ${name} ${near(point, expected[name])}`).toBe(`${i + 1} ${name} true`);
  });
});

test('the saved phone sprites are the rig\u2019s own drawing', () => {
  const saved = loadSavedFrames();
  for (const [name, frame] of Object.entries(sampleRigSprites(rig, skin, entry.prefix))) expect(saved[name].grid).toEqual(frame.grid);
});
