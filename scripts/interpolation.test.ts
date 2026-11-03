// Checks continuous key interpolation, limb arcs, free sample placement, ink-safe head tilts and the falling rig.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { evaluateCurve, monotoneCurve } from '../src/rig/performance.ts';
import { sampleIndex, sampleRig, sampleTime } from '../src/rig/sample.ts';
import { distance } from '../src/rig/kinematics.ts';
import { torsoPoint, validateRig, type SideRig } from '../src/rig/run.ts';
import { skinRig } from './rig-skin.ts';
import { exposedEdges, helmetCodes, loadSavedFrames } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';

const rig = (animation: string): SideRig => rigCatalogue.find(entry => entry.animation === animation)!.rig;
const performances = rigCatalogue.filter(entry => entry.rig.performance);
const velocity = (f: (t: number) => number, t: number, side: -1 | 1, h = 1e-6): number => side * (f(t + side * h) - f(t)) / h;

test('monotone curves pass through every key, never overshoot and carry velocity through interior keys', () => {
  const phases = [0, .2, .5, .7, 1], values = [0, 3, 8, 8, 2];
  const curve = monotoneCurve(phases, values, false, [false, false, false, false, true]);
  phases.forEach((phase, i) => expect(evaluateCurve(curve, phase)).toBe(values[i]));
  for (let i = 0; i < phases.length - 1; i++) for (let s = 0; s <= 20; s++) {
    const value = evaluateCurve(curve, phases[i] + (phases[i + 1] - phases[i]) * s / 20);
    expect(value).toBeGreaterThanOrEqual(Math.min(values[i], values[i + 1]) - 1e-9); expect(value).toBeLessThanOrEqual(Math.max(values[i], values[i + 1]) + 1e-9);
  }
  // Rising through the key at 0.2 keeps moving instead of easing to a stop; the flat run from 0.5 to 0.7 holds still.
  const at = (t: number): number => evaluateCurve(curve, t);
  expect(velocity(at, .2, -1)).toBeGreaterThan(10); expect(velocity(at, .2, -1)).toBeCloseTo(velocity(at, .2, 1), 1);
  expect(curve.slopes[2]).toBe(0); expect(curve.slopes[3]).toBe(0); expect(curve.slopes[4]).toBe(0); expect(curve.slopes[0]).toBe(0);
  // A loop carries the same velocity across its seam.
  const loop = monotoneCurve([0, .25, .5, .75, 1], [0, 2, 5, 3, 0], true), wrap = (t: number): number => evaluateCurve(loop, t);
  expect(loop.slopes[0]).toBe(loop.slopes[4]);
  const seamless = monotoneCurve([0, .3, .6, 1], [1, 4, 2, 1], true);
  expect(seamless.slopes[0]).toBe(seamless.slopes[3]);
  expect(velocity(wrap, 1, -1)).toBeCloseTo(velocity(wrap, 0, 1), 1);
});

test('performance motion keeps its velocity through keys that are not holds or beats', () => {
  for (const { rig: clip } of performances) {
    const keys = clip.performance!.keys;
    for (let i = 1; i < keys.length - 1; i++) {
      if (keys[i].hold || keys[i].beat) continue;
      for (const axis of [0, 1] as const) {
        const root = (t: number): number => sampleRig(clip, t).root[axis], before = velocity(root, keys[i].phase, -1), after = velocity(root, keys[i].phase, 1);
        expect(Math.abs(before - after)).toBeLessThan(.05 * Math.max(1, Math.abs(before)));
      }
    }
  }
  // The jump's launch rises through its key rather than stopping on it, as the per-key easing used to.
  const jump = rig('jump'), launch = jump.performance!.keys[1].phase;
  expect(velocity(t => sampleRig(jump, t).root[1], launch, 1)).toBeLessThan(-10);
});

test('free hands and feet swing on arcs about the shoulder and hip within their keyed reach', () => {
  for (const { rig: clip } of performances) {
    const keys = clip.performance!.keys;
    for (let i = 0; i < keys.length - 1; i++) for (const [limb, chain] of [['nearHand', 'nearArm'], ['farHand', 'farArm'], ['nearAnkle', 'nearLeg'], ['farAnkle', 'farLeg']] as const) {
      const pinned = keys[i][limb].every((value, axis) => value === keys[i + 1][limb][axis]);
      const support = limb === 'nearAnkle' ? 'nearSupport' : limb === 'farAnkle' ? 'farSupport' : null;
      if (pinned || (support && keys[i][support] && keys[i + 1][support])) continue;
      const reach = (t: number): number => { const pose = sampleRig(clip, t); return distance(pose[chain][0], pose[chain][2]); };
      const low = Math.min(reach(keys[i].phase), reach(keys[i + 1].phase)), high = Math.max(reach(keys[i].phase), reach(keys[i + 1].phase));
      for (let s = 1; s < 8; s++) {
        const value = reach(keys[i].phase + (keys[i + 1].phase - keys[i].phase) * s / 8);
        expect(value).toBeGreaterThanOrEqual(low - 1e-6); expect(value).toBeLessThanOrEqual(high + 1e-6);
      }
    }
  }
  // Grounded feet slide along their support instead of arcing through it: the seated phone idle crosses its ankles on the floor.
  const phone = rig('phone-idle');
  for (let t = 0; t <= phone.performance!.keys[1].phase; t += .01) for (const foot of ['nearFoot', 'farFoot'] as const) expect(sampleRig(phone, t)[foot].ankle[1]).toBeCloseTo(46, 8);
});

test('sprite samples are placed independently of the keys and map back to their own index', () => {
  for (const { rig: clip } of performances) {
    const times = Array.from({ length: clip.sampleCount }, (_, i) => sampleTime(clip, i));
    times.forEach((time, i) => { expect(sampleIndex(clip, time)).toBe(i); if (i) expect(time).toBeGreaterThan(times[i - 1]); });
    if (clip.performance!.sampleTimes) for (let i = 0; i < times.length - 1; i++) expect(sampleIndex(clip, (times[i] + times[i + 1]) / 2)).toBe(i);
  }
  // The ledge pull, death and phone idle sample in-betweens between their keys.
  for (const name of ['mantle', 'death', 'phone-idle']) {
    const clip = rig(name), phases = new Set(clip.performance!.keys.map(key => key.phase));
    expect(Array.from({ length: clip.sampleCount }, (_, i) => sampleTime(clip, i)).some(time => !phases.has(time))).toBe(true);
  }
});

test('rolled heads keep every helmet pixel inked at any tilt', () => {
  for (const name of ['death', 'jump', 'fall']) {
    const clip = rig(name), base = sampleRig(clip, 0);
    const rim = (degrees: number): number => exposedEdges(skinRig(clip, skin, { ...base, headAngle: degrees * Math.PI / 180 }), helmetCodes);
    const upright = rim(0);
    for (let degrees = -14; degrees <= 14; degrees += .5) expect(rim(degrees)).toBeLessThanOrEqual(upright);
  }
});

test('the fall braces for impact: arms guarding the chest, knees bent and feet together, swaying without flailing', () => {
  const fall = rig('fall'), jump = rig('jump'), saved = loadSavedFrames();
  expect(fall.performance!.loop).toBe(true); expect(fall.mirrored).toBeFalsy();
  expect(sampleRig(fall, 0)).toEqual(sampleRig(fall, 1));
  const guard: [number, number][][] = [[], []];
  for (let i = 0; i < fall.sampleCount; i++) {
    const pose = sampleRig(fall, sampleTime(fall, i)), shoulder = torsoPoint(pose, [0, fall.torso.shoulderY]), lean = pose.torsoAngle * 180 / Math.PI;
    expect(pose.contact).toBe('flight');
    // A slight forward crouch that never tips back.
    expect(lean).toBeGreaterThan(5); expect(lean).toBeLessThan(11);
    // Both hands are drawn in front of the chest and face, between chin and belly height.
    [pose.nearArm, pose.farArm].forEach((arm, side) => {
      expect(arm[2][0]).toBeGreaterThan(pose.neck[0] + 2); expect(arm[2][1]).toBeGreaterThan(shoulder[1] - 4); expect(arm[2][1]).toBeLessThan(shoulder[1] + 3);
      guard[side].push([arm[2][0] - shoulder[0], arm[2][1] - shoulder[1]]);
    });
    // Knees bent, ready to land, with the feet together or lightly staggered.
    for (const leg of [pose.nearLeg, pose.farLeg]) expect(distance(leg[0], leg[2])).toBeLessThan(fall.legs.thighLength + fall.legs.shinLength - 1.5);
    expect(Math.abs(pose.nearFoot.ankle[0] - pose.farFoot.ankle[0])).toBeLessThanOrEqual(4);
  }
  // No flailing: each guarding hand stays within a pixel and a half of its place relative to the shoulder across the loop.
  for (const hand of guard) for (const axis of [0, 1]) expect(Math.max(...hand.map(point => point[axis])) - Math.min(...hand.map(point => point[axis]))).toBeLessThanOrEqual(1.5);
  // Clearly not the jump: the jump's apex spreads the feet sixteen pixels apart.
  const apex = sampleRig(jump, jump.performance!.keys[2].phase); expect(apex.farFoot.ankle[0] - apex.nearFoot.ankle[0]).toBeGreaterThan(14);
  // The left-facing fall turns round with the Stunner on the far (right) hip rather than mirroring it across.
  const left = rig('fall-left'); expect(left.facing).toBe('left'); expect(left.performance).toBe(fall.performance);
  for (let i = 1; i <= fall.sampleCount; i++) {
    const a = saved[`ben_fallRig${i}`], b = saved[`ben_fallLeft${i}`];
    expect(b.grid).not.toEqual(a.grid.map(row => [...row].reverse().join(''))); expect(b.grid.join('').split('M').length - 1).toBeLessThanOrEqual(2);
  }

  // Distinct sprites: no fall frame repeats a jump frame, and none is a mirror of another Stunner-bearing frame.
  const fallFrames = Array.from({ length: fall.sampleCount }, (_, i) => saved[`ben_fallRig${i + 1}`]);
  const others = Object.entries(saved).filter(([name]) => name.startsWith('ben_') && !name.startsWith('ben_fallRig') && !name.startsWith('ben_fallLeft')).map(([, frame]) => frame);
  for (const frame of fallFrames) {
    expect(frame.grid.join('')).toContain('M');
    for (let i = 0; i < jump.sampleCount; i++) expect(frame.grid).not.toEqual(saved[`ben_jumpRig${i + 1}`].grid);
    const mirrored = frame.grid.map(row => [...row].reverse().join(''));
    for (const other of others) if (other.width === frame.width && other.height === frame.height) expect(other.grid).not.toEqual(mirrored);
  }
});

test('pointed and tucked jump shoes keep their ink outline around the red upper at every angle', () => {
  const saved = loadSavedFrames(), jump = rig('jump');
  for (let i = 1; i <= jump.sampleCount; i++) {
    const { grid } = saved[`ben_jumpRig${i}`];
    grid.forEach((row, y) => [...row].forEach((code, x) => {
      if (code === 'R' || code === 'r') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(grid[y + dy]?.[x + dx] ?? '.').not.toBe('.');
    }));
  }
});

test('the left-facing jump turns Ben round with his Stunner on the far (right) hip instead of mirroring it across', () => {
  const saved = loadSavedFrames(), right = rig('jump'), left = rig('jump-left');
  expect(left.facing).toBe('left'); expect(left.mirrored).toBeFalsy(); expect(left.performance).toBe(right.performance);
  expect(saved.ben_stand.grid.join('')).not.toContain('M');
  for (let i = 1; i <= right.sampleCount; i++) {
    const a = saved[`ben_jumpRig${i}`], b = saved[`ben_jumpLeft${i}`], mirror = a.grid.map(row => [...row].reverse().join(''));
    expect(b.grid).not.toEqual(mirror);
    // The visible near-hip holster of the right-facing frame is gone; at most a sliver of the far-side one peeks out.
    const count = (grid: readonly string[], code: string): number => grid.join('').split(code).length - 1;
    expect(count(a.grid, 'M')).toBeGreaterThanOrEqual(3); expect(count(b.grid, 'M')).toBeLessThanOrEqual(2);
    mirror.forEach((row, y) => [...row].forEach((code, x) => { if (code === 'M' || code === 'm') expect(b.grid[y][x]).not.toBe(code); }));
    // Everything else (face, collar, limbs, shoes and badge) is the turned-round right-facing pose.
    let differing = 0; mirror.forEach((row, y) => [...row].forEach((code, x) => { if (b.grid[y][x] !== code) differing++; }));
    expect(differing).toBeLessThan(25);
  }
  expect(() => validateRig({ ...left, mirrored: true })).toThrow();
});

test('shirt cloth moves only on the rigs that opt in, and only in its hem and sleeves', () => {
  const clothed = ['fall', 'fall-left', 'phone-typing'];
  for (const { animation, rig: clip } of rigCatalogue) {
    if (clothed.includes(animation)) { expect(clip.clothing).toBeDefined(); continue; }
    // The run, look loop, standing and every other rig keep their authored shirt.
    expect(clip.clothing).toBeUndefined();
    for (let i = 0; i < clip.sampleCount; i++) expect(sampleRig(clip, sampleTime(clip, i)).cloth).toBeUndefined();
  }
  for (const name of clothed) {
    const clip = rig(name), plain = { ...clip, clothing: undefined }, states = new Set<string>();
    for (let i = 0; i < clip.sampleCount; i++) {
      const pose = sampleRig(clip, sampleTime(clip, i)), on = skinRig(clip, skin, pose), off = skinRig(plain, skin, sampleRig(plain, sampleTime(plain, i)));
      states.add(JSON.stringify(pose.cloth));
      // The outline stays closed, and the collar (rows down to the head anchor), emblem, belt and Stunner keep every pixel.
      // A cuff riding up only uncovers the arm's own skin.
      expect(exposedEdges(on)).toBe(exposedEdges(off));
      const collar = pose.face.pixelAnchor[1];
      on.grid.forEach((row, y) => [...row].forEach((code, x) => {
        if (code === off.grid[y][x]) return;
        for (const kept of 'DyMm') { expect(code).not.toBe(kept); expect(off.grid[y][x]).not.toBe(kept); }
        expect(y).toBeGreaterThan(collar);
      }));
      let changed = 0; on.grid.forEach((row, y) => [...row].forEach((code, x) => { if (code !== off.grid[y][x]) changed++; })); expect(changed).toBeLessThanOrEqual(6);
    }
    // The hem and sleeves really move through the loop: at least three different cloth states.
    expect(states.size).toBeGreaterThanOrEqual(3);
  }
});

test('the Fizz Stunner stays on the hip in every jump, fall and ledge-pull frame, however high the knee rises', () => {
  const saved = loadSavedFrames();
  for (const { animation, prefix, rig: clip } of rigCatalogue) {
    if (!['jump', 'fall', 'mantle', 'mantle-left'].includes(animation)) continue;
    for (let i = 1; i <= clip.sampleCount; i++) expect(saved[prefix + i].grid.join('')).toContain('M');
  }
});
