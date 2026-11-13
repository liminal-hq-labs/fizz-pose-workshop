// Checks the walk-in rig, the rear view, the Stunner side and the door-pass contract against the saved frames.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import { distance } from '../src/rig/kinematics.ts';
import { validateRig } from '../src/rig/run.ts';
import { frameDurations, replaysContinuously } from '../src/rig/timing.ts';
import { skinRig, type RigSkin } from './rig-skin.ts';
import { trimmedHeadBack } from './performance-skin.ts';
import { bodyRows, buildDoorPass, crownRow, dosBytes, exitPiece, hiddenRows, occupied, rise, spriteLeft } from './door-pass.ts';
import { changedPixels, cycleSteps, loadSavedFrames, median, savedAnimations } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';

const entry = rigCatalogue.find(item => item.animation === 'door-walk-in')!, rig = entry.rig;
const frames = loadSavedFrames();
const names = Array.from({ length: rig.sampleCount }, (_, i) => `${entry.prefix}${i + 1}`);
const purple = (grid: string[]): number => grid.join('').replace(/[^Mm]/g, '').length;

test('the walk-in is an eight-frame 24 × 44 one-shot with matching timing and sample times', () => {
  validateRig(rig);
  expect([rig.width, rig.height, rig.sampleCount]).toEqual([24, 44, 8]);
  expect(rig.performance!.view).toBe('back');
  expect(rig.facing).toBeUndefined();
  expect(replaysContinuously(rig)).toBe(false);
  expect(savedAnimations['door-walk-in']).toEqual({ frames: names, durationsMs: frameDurations(rig), loop: false });
  expect(frameDurations(rig).reduce((sum, hold) => sum + hold, 0)).toBe(rig.durationMs);
  expect(rig.performance!.sampleTimes![0]).toBe(0); expect(rig.performance!.sampleTimes!.at(-1)).toBe(1);
  for (const name of names) expect([frames[name].width, frames[name].height]).toEqual([24, 44]);
});

test('the saved frames are the rig redrawn, in the game palette', () => {
  names.forEach((name, i) => {
    const drawn = skinRig(rig, skin as unknown as RigSkin, sampleRig(rig, sampleTime(rig, i)));
    expect(frames[name].grid).toEqual(drawn.grid);
    expect(drawn.grid.every(row => [...row].every(code => Object.hasOwn(palette, code)))).toBe(true);
  });
});

test('every frame is a rear view: the rear helmet is drawn at the head anchor and no face is', () => {
  const head = trimmedHeadBack((skin as unknown as RigSkin).headBack, rig.performance!.neckTrim ?? 0), faceEye = (skin as unknown as RigSkin).face.eye;
  names.forEach((name, i) => {
    const grid = frames[name].grid, anchor = sampleRig(rig, sampleTime(rig, i)).face.pixelAnchor;
    for (const row of head.rows) {
      const y = anchor[1] + row.y - head.anchor[1];
      expect(grid[y].slice(anchor[0] + row.x - head.anchor[0], anchor[0] + row.x - head.anchor[0] + row.pixels.length)).toBe(row.pixels);
    }
    // The nape hair and the helmet stripe show; the blue eye pixels of a face do not.
    expect(grid.join('')).toContain('N');
    expect(grid.slice(anchor[1] - 12, anchor[1] + 1).join('').includes(faceEye)).toBe(false);
  });
});

test('the Stunner stays on Ben’s right hip, the viewer’s right, in every frame', () => {
  names.forEach((name, i) => {
    const grid = frames[name].grid, root = sampleRig(rig, sampleTime(rig, i)).root;
    const columns = grid.flatMap(row => [...row].flatMap((code, x) => code === 'M' || code === 'm' ? [x] : []));
    expect(purple(grid)).toBeGreaterThan(0);
    for (const x of columns) expect(x).toBeGreaterThan(root[0] + 3);
  });
});

test('the legs step in turn with fixed bones, the near foot first and the far foot second', () => {
  for (let i = 0; i <= 160; i++) {
    const pose = sampleRig(rig, i / 160);
    for (const [chain, upper, lower] of [[pose.nearLeg, rig.legs.thighLength, rig.legs.shinLength], [pose.farLeg, rig.legs.thighLength, rig.legs.shinLength], [pose.nearArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.farArm, rig.arms.upperLength, rig.arms.forearmLength]] as const) {
      expect(distance(chain[0], chain[1])).toBeCloseTo(upper, 8); expect(distance(chain[1], chain[2])).toBeCloseTo(lower, 8);
    }
    expect(Math.max(pose.nearFoot.ankle[1], pose.farFoot.ankle[1])).toBeGreaterThan(rig.groundY - 4);
  }
  const lifted = (i: number, side: 'nearFoot' | 'farFoot'): number => sampleRig(rig, sampleTime(rig, i))[side].ankle[1];
  // The near foot steps first, the far foot second: each lifts at least two pixels while the other stays planted.
  expect(Math.min(...[1, 2].map(i => lifted(i, 'nearFoot')))).toBeLessThanOrEqual(rig.groundY - 5);
  expect(Math.min(...[4, 5].map(i => lifted(i, 'farFoot')))).toBeLessThanOrEqual(rig.groundY - 5);
});

test('the walk-in ends cleanly: a one-shot with no wrapping step, changing on every step without a spike', () => {
  const sequence = names.map(name => frames[name]);
  expect(new Set(sequence.map(frame => frame.grid.join('|'))).size).toBe(sequence.length);
  const changes = cycleSteps(sequence.length, false).map(({ from, to }) => changedPixels(sequence[from], sequence[to]));
  expect(changes.length).toBe(7);
  expect(Math.min(...changes)).toBeGreaterThan(0); expect(Math.max(...changes)).toBeLessThanOrEqual(3 * median(changes));
  // Ben stays the same size throughout: the occupied height varies by at most a row.
  const heights = sequence.map(frame => occupied(frame).height);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  // Fizz 2's Ben is 33 px tall: the trimmed neck puts the crown on row 3 in every frame, and the soles on row 35 (row 34 in the frame where a foot lifts).
  expect(Math.max(...heights)).toBe(33);
  for (const frame of sequence) { expect(occupied(frame).y0).toBe(3); expect(occupied(frame).y1).toBeLessThanOrEqual(35); }
});

test('the door-pass contract is monotonic and matches the saved frames and the builder', async () => {
  const saved = JSON.parse(readFileSync(new URL('../source/ben-door-pass.json', import.meta.url), 'utf8'));
  expect(saved).toEqual(JSON.parse(JSON.stringify(await buildDoorPass(frames))));
  const walkIn = saved.farPlaneWalkIn;
  expect(walkIn.perFrame.map((f: { name: string }) => f.name)).toEqual(names);
  for (let i = 1; i < names.length; i++) {
    expect(rise[i]).toBeGreaterThan(rise[i - 1]); expect(hiddenRows[i]).toBeGreaterThanOrEqual(hiddenRows[i - 1]);
    expect(walkIn.perFrame[i].progress).toBeGreaterThan(walkIn.perFrame[i - 1].progress);
    expect(walkIn.perFrame[i].offsetFromStart.y).toBeLessThan(walkIn.perFrame[i - 1].offsetFromStart.y);
  }
  expect(hiddenRows[0]).toBe(0); expect(hiddenRows.at(-1)!).toBeLessThan(bodyRows);
  // Ben overlaps the exit in every frame, inside its 20 px width, and is wider than the 14 px lit opening.
  for (const frame of walkIn.perFrame) {
    expect(frame.overlapsExit).toBe(true);
    expect(frame.exitColumns.left).toBeGreaterThanOrEqual(0); expect(frame.exitColumns.right).toBeLessThan(exitPiece.width);
    expect(frame.bounds.width).toBeGreaterThan(exitPiece.openingWidth);
    expect(frame.visibleRows + frame.hiddenRows).toBe(bodyRows);
    expect(frame.keepCanvasRows).toBe(frame.visibleRows + crownRow);
  }
  expect(spriteLeft).toBe(-2);
  expect(walkIn.dos.bytesPerFrame).toBe(dosBytes(24, 44)); expect(walkIn.dos.totalBytes).toBe(528 * 8);
});

test('the side-on pass is the existing six-frame run, in front of the whole 16 × 48 door, with the Stunner on one hip and no mirrors', () => {
  const saved = JSON.parse(readFileSync(new URL('../source/ben-door-pass.json', import.meta.url), 'utf8')).sideOnPass;
  expect(saved.door).toMatchObject({ width: 16, height: 48 });
  expect(saved.door.layers).toContain('no front layer');
  const right = savedAnimations['walk-run-6'].frames, left = savedAnimations['walk-run-left-6'].frames;
  expect(saved.sets.right.frames.map((f: { name: string }) => f.name)).toEqual(right);
  expect(saved.sets.left.frames.map((f: { name: string }) => f.name)).toEqual(left);
  expect(right.length).toBe(6); expect(left.length).toBe(6);
  expect(saved.sets.right.dos.totalBytes).toBe(3168);
  right.forEach((name, i) => {
    const flipped = frames[name].grid.map(row => [...row].reverse().join(''));
    expect(purple(frames[name].grid)).toBeGreaterThan(0); expect(purple(frames[left[i]].grid)).toBe(0);
    expect(frames[left[i]].grid).not.toEqual(flipped);
    // Door 48 tall: Ben never reaches its top, so no duck or head clearance is needed.
    expect(occupied(frames[name]).height).toBeLessThanOrEqual(34);
    expect(occupied(frames[left[i]]).height).toBeLessThanOrEqual(34);
  });
});
