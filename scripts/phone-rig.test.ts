// Checks the seated phone idle: a real seat on the ground, crossed shins that read in the sprite, the grip, the holster,
// the rig-to-sprite overlay and the exported screen light.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import type { Vec2 } from '../src/rig/kinematics.ts';
import type { RigPose } from '../src/rig/run.ts';
import { egaBrighter, lightGrid, litVariants, type LightingData } from '../src/rig/lighting.ts';
import { paintRig, sampleRigSprites, Pixels, type BodyPart } from './rig-skin.ts';
import { rigLighting } from './rig-lighting.ts';
import { loadSavedFrames } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';

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

test('the screen light follows the phone: off until it is out, ramping up as it rises, dimming on the scroll beat', () => {
  const light = rigLighting(rig, skin), intensity = light.frames.map(frame => frame.intensity);
  samples.forEach((pose, i) => { if (!pose.presentation!.phone) { expect(intensity[i]).toBe(0); expect(light.frames[i].source).toBeNull(); } });
  const raised = samples.findIndex(pose => pose.presentation?.phone && pose.presentation.phone[0] < pose.root[0] + 2);
  expect(intensity[raised]).toBeGreaterThan(0);
  expect(Math.max(...intensity)).toBe(1);
  expect(intensity.at(-1)).toBeLessThan(1); expect(intensity.at(-1)).toBeGreaterThan(.5);
  for (let i = raised; i < intensity.indexOf(1); i++) expect(intensity[i + 1]).toBeGreaterThanOrEqual(intensity[i]);
});

test('the light mask touches only skin on the face, arms and hands, plus a faint spill', () => {
  const settings = rig.lighting!, light = rigLighting(rig, skin);
  light.frames.forEach((frame, i) => {
    const { rows, parts } = painted[i];
    frame.mask.forEach((row, y) => [...row].forEach((level, x) => {
      if (level === '0') return;
      const part = parts[y][x], skinPixel = settings.parts.includes(part) && settings.skin.includes(rows[y][x]);
      expect(skinPixel || (settings.spill!.parts.includes(part) && Number(level) <= settings.spill!.maxLevel)).toBe(true);
      expect(rows[y][x]).not.toBe('k');
    }));
  });
  // Once the phone is up the face and both hands are lit, and the face brighter than the spill.
  const read = light.frames.findIndex(frame => frame.intensity === 1), { parts } = painted[read];
  const levels = (part: BodyPart): number[] => light.frames[read].mask.flatMap((row, y) => [...row].map(Number).filter((_, x) => parts[y][x] === part));
  expect(Math.max(...levels('face'))).toBeGreaterThanOrEqual(2); expect(Math.max(...levels('hand'))).toBe(3);
});

test('sprite exports stay unlit and the saved light data matches the rig', () => {
  const saved = loadSavedFrames(), drawn = sampleRigSprites(rig, skin, entry.prefix);
  for (const [name, frame] of Object.entries(drawn)) expect(saved[name].grid).toEqual(frame.grid);
  const exported: LightingData = JSON.parse(readFileSync(new URL('../rig/ben-phone/lighting.json', import.meta.url), 'utf8'));
  expect(exported).toEqual(rigLighting(rig, skin));
  // Lighting a frame at zero intensity changes nothing.
  for (const frame of exported.frames) expect(lightGrid(saved[entry.prefix + frame.sprite.match(/\d+/)![0].replace(/^0/, '')].grid, frame.mask, 0, exported.litVariants)).toEqual(saved[entry.prefix + frame.sprite.match(/\d+/)![0].replace(/^0/, '')].grid);
});

test('the lit-colour lookup gives every EGA colour a valid, never darker variant', () => {
  const variants = litVariants(3), codes = Object.keys(palette).filter(code => code !== '.');
  const luma = (code: string): number => { const hex = (palette as Record<string, string | null>)[code]!; const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return .299 * r + .587 * g + .114 * b; };
  expect(Object.keys(variants).sort()).toEqual(codes.sort());
  for (const code of codes) {
    expect(variants[code]).toHaveLength(3);
    let previous = code;
    for (const lit of variants[code]) { expect(codes).toContain(lit); expect(luma(lit)).toBeGreaterThanOrEqual(luma(previous)); expect(lit).toBe(egaBrighter[previous]); previous = lit; }
  }
  expect(variants.W).toEqual(['W', 'W', 'W']); expect(variants.R[0]).toBe('r'); expect(variants.L[0]).toBe('W'); expect(variants.D[0]).toBe('L');
});
