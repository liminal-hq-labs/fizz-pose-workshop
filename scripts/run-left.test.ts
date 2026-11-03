// Checks that the left-facing run turns the pinned right run round with Ben's Stunner kept on his far (right) hip.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import pinned from './fixtures/pinned-reference-motion.json';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import { overlayShift } from '../src/rig/reflect.ts';
import { facePixels } from '../src/rig/face.ts';
import type { Vec2 } from '../src/rig/kinematics.ts';
import type { RigPose } from '../src/rig/run.ts';
import type { Frame } from '../src/types.ts';
import { drawRunCycle } from './draw-run-cycle.ts';
import { skinRig } from './rig-skin.ts';
import { loadSavedFrames, savedAnimations, cycleSteps, changedPixels, median } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';

const entry = (animation: string) => rigCatalogue.find(item => item.animation === animation)!;
const right = entry('walk-run'), left = entry('walk-run-left');
const saved = loadSavedFrames();
const frames = (prefix: string, count = right.rig.sampleCount): Frame[] => Array.from({ length: count }, (_, i) => saved[prefix + (i + 1)]);
const rights = frames('ben_walkRight'), lefts = frames('ben_walkLeft');
const mirror = (frame: Frame): string[] => frame.grid.map(row => [...row].reverse().join(''));
const stunnerCodes = /[Mm]/;
const showsStunner = (frame: Frame): boolean => stunnerCodes.test(frame.grid.join(''));

test('the left run shares the right run rig, keys and timing, turned round rather than mirrored', () => {
  const { name, facing, ...rest } = left.rig, { name: rightName, ...rightRest } = right.rig;
  expect(facing).toBe('left'); expect(left.rig.mirrored).toBeFalsy(); expect(name).not.toBe(rightName);
  expect(rest).toEqual({ ...rightRest, facing: undefined } as typeof rest);
  expect(left.prefix).toBe('ben_walkLeft'); expect(left.labels).toEqual(right.labels);
  // Twelve looping frames at the right run's 50 ms each.
  expect(savedAnimations['walk-run-left'].frames).toEqual(lefts.map((_, i) => `ben_walkLeft${i + 1}`));
  expect(savedAnimations['walk-run-left'].durationsMs).toEqual(savedAnimations['walk-run'].durationsMs);
  expect(savedAnimations['walk-run-left'].loop).not.toBe(false);
  // The saved left sprites are exactly what the rig draws, and redrawing never touches the pinned right run.
  expect(drawRunCycle('walk-run-left')).toEqual(Object.fromEntries(lefts.map((frame, i) => [`ben_walkLeft${i + 1}`, frame])));
  const pins = pinned.frames as unknown as Record<string, Frame>;
  for (const [name, frame] of Object.entries(drawRunCycle('walk-run'))) { expect(frame).toEqual(pins[name]); expect(saved[name]).toEqual(pins[name]); }
});

test('the Stunner stays on the far (right) hip: hidden behind the body, as on the saved left-facing stand', () => {
  expect(showsStunner(saved.ben_stand)).toBe(false);
  // The same poses with no Stunner on either hip separate the near holster that the turn removes from far-holster pixels.
  const bare = structuredClone(skin); bare.stunner.pixels = bare.stunner.pixels.map(row => '.'.repeat(row.length));
  const holsterSize = skin.stunner.pixels.join('').replaceAll('.', '').length;
  const differences = (a: readonly string[], b: readonly string[]): Vec2[] => a.flatMap((row, y) => [...row].flatMap((code, x): Vec2[] => b[y][x] !== code ? [[x, y]] : []));
  rights.forEach((frame, i) => {
    const turned = mirror(frame), turnedLeft = lefts[i], pose = sampleRig(left.rig, sampleTime(left.rig, i)), unarmed = skinRig(left.rig, bare, pose).grid;
    expect(showsStunner(frame)).toBe(true); expect(showsStunner(turnedLeft)).toBe(false);
    expect(turnedLeft.grid).not.toEqual(turned);
    // Without any Stunner, the left frame is the plain mirror except where the right frame's near-hip holster was drawn: the
    // face, helmet, collar, limbs, shoes and badge are the turned-round right-facing pose pixel for pixel.
    const removed = differences(turned, unarmed);
    expect(removed.length).toBeGreaterThan(0); expect(removed.length).toBeLessThanOrEqual(holsterSize);
    const holster = differences(turned, mirror(skinRig(right.rig, bare, sampleRig(right.rig, sampleTime(right.rig, i)))));
    expect(removed).toEqual(holster);
    // The far-hip holster hangs behind the far leg and body. At most three ink pixels of it thicken the back contour where its
    // tip passes the hip as the far thigh swings back (frames 10-12, as in the saved left jump); none of its purple ever shows.
    const peeking = differences(unarmed, turnedLeft.grid);
    expect(peeking.length).toBeLessThanOrEqual(3);
    for (const [x, y] of peeking) expect(turnedLeft.grid[y][x]).toBe('k');
  });
});

test('no run frame is an exact mirror of a saved frame that shows the Stunner', () => {
  const stunnerFrames = Object.entries(saved).filter(([name, frame]) => name.startsWith('ben_') && showsStunner(frame));
  for (const frame of [...rights, ...lefts]) {
    const turned = mirror(frame);
    for (const [name, other] of stunnerFrames) if (other.width === frame.width && other.height === frame.height) expect([name, other.grid]).not.toEqual([name, turned]);
    if (showsStunner(frame)) for (const [name, other] of Object.entries(saved)) if (other.width === frame.width) expect([name, other.grid]).not.toEqual([name, turned]);
  }
});

test('left and right faces are consistent reflections, measured from the saved sprites', () => {
  const width = right.rig.width, reflect = ([x, y]: Vec2): Vec2 => [width - 1 - x, y], sorted = (points: Vec2[]): Vec2[] => [...points].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (let i = 0; i < right.rig.sampleCount; i++) {
    const t = sampleTime(right.rig, i), r = sampleRig(right.rig, t), l = sampleRig(left.rig, t);
    expect(l.face.pixelAnchor).toEqual(reflect(r.face.pixelAnchor));
    expect(l.face.eyePixels).toEqual(sorted(r.face.eyePixels.map(reflect)));
    expect(l.face.mouthPixels).toEqual(sorted(r.face.mouthPixels.map(reflect)));
    for (const landmark of ['ear', 'nose', 'cheek', 'chin'] as const) expect(l.face[landmark].pixel).toEqual(reflect(r.face[landmark].pixel));
    // The saved left sprite shows exactly the rig's eye and mouth pixels and the ear colour, as the right one does.
    expect(facePixels(lefts[i], skin.face.eye, l.face.pixelAnchor)).toEqual(l.face.eyePixels);
    expect(facePixels(lefts[i], skin.face.mouth, l.face.pixelAnchor)).toEqual(l.face.mouthPixels);
    expect(lefts[i].grid[l.face.ear.pixel[1]][l.face.ear.pixel[0]]).toBe(skin.face.ear);
  }
  // The hand-edited faces turn round intact: one-pixel mouth turned away (frames 2-5), two pixels in profile (1, 6-8, 11 and 12)
  // and three with the second eye showing at the camera-facing peak (frames 9 and 10).
  expect(lefts.map((frame, i) => facePixels(frame, skin.face.mouth, sampleRig(left.rig, sampleTime(left.rig, i)).face.pixelAnchor).length)).toEqual([2, 1, 1, 1, 1, 2, 2, 2, 3, 3, 2, 2]);
  expect(lefts.map((frame, i) => facePixels(frame, skin.face.eye, sampleRig(left.rig, sampleTime(left.rig, i)).face.pixelAnchor).length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1]);
});

test('the left run loops without duplicate frames or spikes, matching the right run step for step', () => {
  const steps = (sequence: Frame[]): number[] => cycleSteps(sequence.length).map(({ from, to }) => changedPixels(sequence[from], sequence[to]));
  const leftSteps = steps(lefts), rightSteps = steps(rights);
  expect(Math.min(...leftSteps)).toBeGreaterThan(0);
  expect(Math.max(...leftSteps)).toBeLessThanOrEqual(2 * median(leftSteps));
  // The wrap from frame 12 back to frame 1 is an ordinary step, and no step differs from the right run by more than the hidden holster.
  expect(leftSteps.at(-1)!).toBeLessThanOrEqual(Math.max(...leftSteps.slice(0, -1)));
  leftSteps.forEach((change, i) => expect(Math.abs(change - rightSteps[i])).toBeLessThanOrEqual(12));
  expect(new Set(lefts.map(frame => frame.grid.join())).size).toBe(lefts.length);
});

test('the sampled-rig overlay sits on the left sprites exactly as it does on the right ones', () => {
  expect(overlayShift(right.rig)).toBe(0); expect(overlayShift(left.rig)).toBe(1);
  const width = right.rig.width;
  const joints = (pose: RigPose): Vec2[] => [...pose.nearArm, ...pose.farArm, ...pose.nearLeg, ...pose.farLeg, pose.root, pose.neck, pose.nearFoot.ball, pose.farFoot.ball, pose.nearFoot.heel, pose.farFoot.heel];
  for (let i = 0; i < right.rig.sampleCount; i++) {
    const t = sampleTime(right.rig, i), r = joints(sampleRig(right.rig, t)), l = joints(sampleRig(left.rig, t));
    r.forEach((joint, j) => {
      // The skin draws a right-facing joint into pixel round(x); the left sprite holds that pixel mirrored.
      const drawnRight = Math.round(joint[0]), drawnLeft = width - 1 - drawnRight;
      const overlayRight = joint[0] + overlayShift(right.rig), overlayLeft = l[j][0] + overlayShift(left.rig);
      expect(l[j][1]).toBeCloseTo(joint[1], 9);
      // Distance from the overlay point to the drawn pixel's centre: at most a pixel, and the same on both facings.
      const errorRight = Math.abs(overlayRight - (drawnRight + .5)), errorLeft = Math.abs(overlayLeft - (drawnLeft + .5));
      expect(errorRight).toBeLessThanOrEqual(1); expect(errorLeft).toBeCloseTo(errorRight, 9);
    });
  }
});

test('the six-frame cuts reuse every other twelve-frame sprite over the same 600 ms loop', () => {
  for (const [name, six] of [['walk-run', 'walk-run-6'], ['walk-run-left', 'walk-run-left-6']]) {
    const full = savedAnimations[name], cut = savedAnimations[six];
    expect(cut.frames).toEqual(full.frames.filter((_: string, i: number) => i % 2 === 0));
    expect(cut.durationsMs.reduce((a: number, b: number) => a + b, 0)).toBe(full.durationsMs.reduce((a: number, b: number) => a + b, 0));
  }
});
