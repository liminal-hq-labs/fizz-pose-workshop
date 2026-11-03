// Checks the seated phone idle and its typing loop: a real seat on the ground, crossed shins that read in the sprite, the
// grip and thumbs, the holster, the rig-to-sprite overlay, the screen light and the hand-over into typing. Playback and
// export looping for the phone animations are covered with every other animation in `scripts/playback.test.ts`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import { frameDurations } from '../src/rig/timing.ts';
import type { Vec2 } from '../src/rig/kinematics.ts';
import type { RigPose } from '../src/rig/run.ts';
import { egaBrighter, lightGrid, litVariants, type LightingData } from '../src/rig/lighting.ts';
import { paintRig, sampleRigSprites, Pixels, type BodyPart } from './rig-skin.ts';
import { rigLighting } from './rig-lighting.ts';
import { changedPixels, loadSavedFrames, median, savedAnimations } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';

const root = new URL('../', import.meta.url);
function load(animation: string) {
  const entry = rigCatalogue.find(item => item.animation === animation)!, rig = entry.rig;
  const samples = Array.from({ length: rig.sampleCount }, (_, i) => sampleRig(rig, sampleTime(rig, i)));
  const painted = samples.map(pose => paintRig(rig, skin, pose));
  const seated = samples.map((pose, i) => [pose, i] as const).filter(([pose]) => pose.presentation!.seated);
  return { entry, rig, samples, painted, seated, light: rigLighting(rig, skin) };
}
const idle = load('phone-idle'), typing = load('phone-typing'), phones = [idle, typing];
const seatBottom = Math.max(...skin.seatFront.rows.map(row => row.y)) - skin.seatFront.anchor[1];
const saved = loadSavedFrames();

test('the seat rests on the ground line once he sits, and stays there while he reads and types', () => {
  expect(idle.seated.map(([, i]) => i)).toEqual([3, 4, 5, 6, 7, 8]);
  expect(typing.seated).toHaveLength(typing.rig.sampleCount);
  for (const { rig, seated, painted } of phones) for (const [pose, i] of seated) {
    const grid = painted[i].frame().grid, x = Math.round(pose.root[0]);
    // The seat's ink row is the ground contact, and there is no gap between the hips and the ground.
    expect(Math.round(pose.root[1]) + seatBottom).toBe(rig.groundY);
    for (let y = Math.round(pose.root[1]); y <= rig.groundY; y++) expect(grid[y][x]).not.toBe('.');
    expect(grid[rig.groundY].replaceAll('.', '').length).toBeGreaterThanOrEqual(12);
    // The shirt hem bunches one pixel wider than the standing hem just above the belt.
    const belt = Math.round(pose.root[1]) - 1;
    expect(grid[belt - 1].indexOf('R')).toBeLessThan(idle.painted[0].frame().grid[Math.round(idle.samples[0].root[1]) - 2].indexOf('R'));
  }
  // From the moment the seat lands, the continuous rigs never lift the hips again; on the way down they only descend.
  const clip = idle.rig.performance!, seatedKey = clip.keys.findIndex(key => key.seated), seatedFrom = clip.keys[seatedKey].phase, seatY = clip.keys[seatedKey].root[1];
  for (let t = seatedFrom; t <= 1; t += 1 / 240) expect(sampleRig(idle.rig, t).root[1]).toBeCloseTo(seatY, 9);
  for (let t = 0; t <= 1; t += 1 / 240) sampleRig(typing.rig, t).root.forEach((value, axis) => expect(value).toBeCloseTo(sampleRig(idle.rig, 1).root[axis], 9));
  for (let t = 0, last = -Infinity; t <= seatedFrom; t += 1 / 240) { const y = sampleRig(idle.rig, t).root[1]; expect(y).toBeGreaterThanOrEqual(last - 1e-9); last = y; }
});

test('the feet never lift or leave the ground, and the knees splay out with roughly level thighs', () => {
  for (const { rig, seated } of phones) {
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
  }
});

/** The pixels a lone shin paints, using the same outlined segment as the skin. */
function shinBand(pose: RigPose, leg: 'nearLeg' | 'farLeg', seam: string): string[] {
  const out = new Pixels(idle.rig.width, idle.rig.height), chain = pose[leg];
  out.segment([chain[1], chain[2]], 2, skin.palette.denim, 'k'); out.segment([chain[1], chain[2]], 1, seam);
  return out.frame().grid;
}

test('the crossed shins overlap in the sprite, with the near shin drawn over the far shin', () => {
  for (const { rig, seated, painted } of phones) for (const [pose, i] of seated) {
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
    const count = (code: string, side: (x: number) => boolean): number => grid.reduce((sum, row) => sum + [...row].filter((c, x) => c === code && side(x)).length, 0);
    expect(count(skin.palette.denimSeam, x => x < pose.root[0])).toBeGreaterThanOrEqual(3);
    expect(grid.reduce((sum, row, y) => sum + [...row].filter((c, x) => c !== 'k' && c === far[y][x] && near[y][x] === '.').length, 0)).toBeGreaterThanOrEqual(6);
    // Each red shoe shows on the opposite side to its knee.
    expect(count('R', x => x > pose.root[0] + 2) && count('R', x => x < pose.root[0] - 2)).toBeGreaterThan(0);
  }
});

/** Whether each thumb tip shows above the phone, near then far. */
function thumbsUp(painted: Pixels, pose: RigPose): [boolean, boolean] {
  const phone = pose.presentation!.phone!, px = Math.round(phone[0]), top = Math.round(phone[1]) - skin.phoneBack.anchor[1];
  const up = (dx: number): boolean => painted.rows[top - 1][px + dx] === 'W' && painted.parts[top - 1][px + dx] === 'hand';
  return [up(-1), up(1)];
}

test('the thumbs press the screen side: tips show only above the phone and drop behind it as they tap', () => {
  for (const { samples, painted } of phones) samples.forEach((pose, i) => {
    const phone = pose.presentation!.phone; if (!phone) return;
    const { parts } = painted[i], px = Math.round(phone[0]), top = Math.round(phone[1]) - skin.phoneBack.anchor[1], taps = pose.presentation!.taps ?? [0, 0];
    expect(thumbsUp(painted[i], pose)).toEqual([taps[0] < .5, taps[1] < .5]);
    // Nothing of the hand covers the case: the back of the phone (camera side) shows whole between the fingers.
    for (let y = top; y <= top + 6; y++) for (let x = px - 1; x <= px + 1; x++) expect(parts[y][x]).toBe('prop');
    // A finger wraps round each side of the case.
    for (const x of [px - 2, px + 2]) expect(parts[Math.round(phone[1])][x]).toBe('hand');
  });
  expect(idle.samples.at(-1)!.presentation!.taps).toEqual([1, 0]);
});

test('typing alternates the thumbs in bursts with pauses, and the loop never repeats a frame', () => {
  const thumbs = typing.samples.map((pose, i) => thumbsUp(typing.painted[i], pose));
  const taps = thumbs.map(([near, far]) => !near && far ? 'near' : near && !far ? 'far' : near && far ? 'pause' : 'both');
  expect(taps).not.toContain('both');
  expect(taps.filter(tap => tap === 'pause').length).toBeGreaterThanOrEqual(2);
  // Consecutive taps (across the loop seam too) always switch thumbs.
  const order = [...taps, taps[0]].filter(tap => tap !== 'pause');
  for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  // Fast tap bursts and longer pauses: the pauses hold at least twice as long as the quickest tap.
  const holds = frameDurations(typing.rig), tapHolds = holds.filter((_, i) => taps[i] !== 'pause'), pauseHolds = holds.filter((_, i) => taps[i] === 'pause');
  expect(Math.min(...pauseHolds)).toBeGreaterThanOrEqual(2 * Math.min(...tapHolds));
  expect(new Set(holds).size).toBeGreaterThanOrEqual(4);
  // No two consecutive frames match, and the wrap from last to first changes about as much as any other step.
  const frames = typing.painted.map(p => p.frame()), steps = frames.map((frame, i) => changedPixels(frame, frames[(i + 1) % frames.length]));
  expect(Math.min(...steps)).toBeGreaterThan(0);
  expect(steps.at(-1)!).toBeLessThanOrEqual(2 * median(steps));
  expect(sampleRig(typing.rig, 1)).toEqual(sampleRig(typing.rig, 0));
  // A blink, a glance up from the screen and a breath sit inside the loop.
  const presented = typing.samples.map(pose => pose.presentation!);
  expect(presented.some(p => (p.blink ?? 0) >= .5)).toBe(true);
  expect(presented.some(p => (p.gaze ?? 0) < .5) && presented.some(p => (p.gaze ?? 0) >= .5)).toBe(true);
  expect(presented.some(p => (p.breath ?? 0) >= .5) && presented.some(p => (p.breath ?? 0) < .5)).toBe(true);
});

test('the breath lifts the head and collar with the chest, so the collar always rests on the shirt', () => {
  for (const [pose, i] of typing.seated) {
    const grid = typing.painted[i].frame().grid, x = Math.round(pose.root[0]), collar = pose.face.pixelAnchor[1];
    expect(grid[collar][x]).toBe('W');
    expect(/[rR]/.test(grid[collar + 1][x])).toBe(true);
  }
});

test('the Fizz Stunner rests on Ben’s right hip (the camera’s left) in every frame, on the thigh once seated', () => {
  for (const { samples, painted } of phones) samples.forEach((pose, i) => {
    const grid = painted[i].frame().grid, holster: Vec2[] = [];
    grid.forEach((row, y) => [...row].forEach((code, x) => { if (code === 'M' || code === 'm') holster.push([x, y]); }));
    expect(holster.length).toBeGreaterThanOrEqual(3);
    expect(holster.every(([x]) => x < pose.root[0] - 2)).toBe(true);
    // It hangs from the belt: its top is within a row of the belt.
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
  for (const { entry, samples, painted } of phones) samples.forEach((pose, i) => {
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
    for (const [name, point] of joints) expect(`${entry.prefix}${i + 1} ${name} ${near(point, expected[name])}`).toBe(`${entry.prefix}${i + 1} ${name} true`);
  });
});

test('the screen light follows the phone: off until it is out, ramping up as it rises, dimming on the scroll beat', () => {
  const { samples, light } = idle, intensity = light.frames.map(frame => frame.intensity);
  samples.forEach((pose, i) => { if (!pose.presentation!.phone) { expect(intensity[i]).toBe(0); expect(light.frames[i].source).toBeNull(); } });
  const raised = samples.findIndex(pose => pose.presentation?.phone && pose.presentation.phone[0] < pose.root[0] + 2);
  expect(intensity[raised]).toBeGreaterThan(0);
  expect(Math.max(...intensity)).toBe(1);
  expect(intensity.at(-1)).toBeLessThan(1); expect(intensity.at(-1)).toBeGreaterThan(.5);
  for (let i = raised; i < intensity.indexOf(1); i++) expect(intensity[i + 1]).toBeGreaterThanOrEqual(intensity[i]);
});

test('while typing the screen flickers with the taps: brighter on a tap, dipping between and on pauses', () => {
  const intensity = typing.light.frames.map(frame => frame.intensity), taps = typing.samples.map(pose => pose.presentation!.taps!);
  for (const value of intensity) { expect(value).toBeGreaterThan(.5); expect(value).toBeLessThanOrEqual(1); }
  const tapping = intensity.filter((_, i) => taps[i].some(tap => tap >= .5)), pausing = intensity.filter((_, i) => taps[i].every(tap => tap < .5));
  expect(Math.max(...tapping)).toBe(1); expect(Math.max(...pausing)).toBeLessThan(Math.max(...tapping));
  expect(new Set(intensity).size).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < intensity.length; i++) if (intensity[i] === Math.max(...intensity)) expect(intensity[(i + 1) % intensity.length]).toBeLessThan(1);
  // The thumb tips that show above the phone are lit.
  typing.samples.forEach((pose, i) => {
    const phone = pose.presentation!.phone!, px = Math.round(phone[0]), top = Math.round(phone[1]) - skin.phoneBack.anchor[1], up = thumbsUp(typing.painted[i], pose);
    up.forEach((shows, side) => { if (shows) expect(Number(typing.light.frames[i].mask[top - 1][px + (side ? 1 : -1)])).toBeGreaterThanOrEqual(2); });
  });
});

test('the light mask touches only skin on the face, arms and hands, plus a faint spill', () => {
  for (const { rig, light, painted } of phones) {
    const settings = rig.lighting!;
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
  }
});

test('sprite exports stay unlit and the saved light data matches each rig', () => {
  for (const { entry, rig, light } of phones) {
    for (const [name, frame] of Object.entries(sampleRigSprites(rig, skin, entry.prefix))) expect(saved[name].grid).toEqual(frame.grid);
    const exported: LightingData = JSON.parse(readFileSync(new URL(`rig/${entry.folder}/lighting.json`, root), 'utf8'));
    expect(exported).toEqual(light);
    // Lighting a frame at zero intensity changes nothing.
    exported.frames.forEach((frame, i) => { const grid = saved[entry.prefix + (i + 1)].grid; expect(lightGrid(grid, frame.mask, 0, exported.litVariants)).toEqual(grid); });
  }
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

test('the sit-down hands over to the typing loop, saved as its own loop and as the whole performance', () => {
  expect(idle.entry.then).toBe('phone-typing');
  const sequence = typing.entry.sequence!, whole = savedAnimations[sequence.name], lead = savedAnimations['phone-idle'], loop = savedAnimations['phone-typing'];
  expect(lead.loop).toBe(false); expect(loop.loop).toBe(true); expect(whole.loop).toBe(true);
  expect(loop.frames).toEqual(Array.from({ length: typing.rig.sampleCount }, (_, i) => `ben_phoneType${i + 1}`));
  expect(loop.durationsMs).toEqual(frameDurations(typing.rig));
  const repeat = <T,>(items: readonly T[]): T[] => Array.from({ length: sequence.repeats }, () => items).flat();
  expect(whole.frames).toEqual([...lead.frames, ...repeat(loop.frames)]);
  expect(whole.durationsMs).toEqual([...lead.durationsMs, ...repeat(loop.durationsMs)]);
  // The handover from the last sit-down frame into typing is a real step, no bigger than the loop's own steps.
  const typed = loop.frames.map(name => saved[name]), steps = typed.map((frame, i) => changedPixels(frame, typed[(i + 1) % typed.length]));
  const handover = changedPixels(saved[lead.frames.at(-1)!], typed[0]);
  expect(handover).toBeGreaterThan(0); expect(handover).toBeLessThanOrEqual(2 * median(steps));
});
