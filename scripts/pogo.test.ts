// Checks the pogo ride: the stick's spring and lift, grips and pegs bound to Ben, foot pitch, loop closure and both directions.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import { distance, radians, type Chain } from '../src/rig/kinematics.ts';
import { validateRig, type SideRig } from '../src/rig/run.ts';
import { frameDurations } from '../src/rig/timing.ts';
import { pogoStickPose } from '../src/rig/pogo.ts';
import { paintRig, pogoLayers, skinRig } from './rig-skin.ts';
import { changedPixels, cycleSteps, loadSavedFrames, median, savedAnimations } from './motion-metrics.ts';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';
import type { RigSkin } from './rig-skin.ts';

const entry = (animation: string) => rigCatalogue.find(item => item.animation === animation)!;
const right = entry('pogo'), left = entry('pogo-left'), rig = right.rig, sides = [right, left];
const frames = loadSavedFrames();
const sprites = (prefix: string): string[][] => Array.from({ length: rig.sampleCount }, (_, i) => frames[`${prefix}${i + 1}`].grid);

test('the ride is a twelve-frame 24 × 44 loop in both directions with matching timing', () => {
	for (const { rig: side, prefix, animation } of sides) {
		validateRig(side);
		expect([side.width, side.height, side.sampleCount]).toEqual([24, 44, 12]);
		expect(savedAnimations[animation]).toEqual({ frames: Array.from({ length: 12 }, (_, i) => `${prefix}${i + 1}`), durationsMs: frameDurations(side), loop: true });
		expect(frameDurations(side).reduce((sum, hold) => sum + hold, 0)).toBe(side.durationMs);
	}
	expect(left.rig.facing).toBe('left'); expect(left.rig.performance).toBe(rig.performance);
});

test('the spring compresses on the ground, extends to launch and the stick leaves the ground in flight', () => {
	const poses = Array.from({ length: 241 }, (_, i) => sampleRig(rig, i / 240)), stick = rig.pogo!;
	const lengths = poses.map(pose => pose.pogo!.springLength);
	expect(Math.min(...lengths)).toBe(stick.springCompressed); expect(Math.max(...lengths)).toBe(stick.springExtended);
	for (const pose of poses) {
		// Compressed only while the tip is planted, and the tip never sinks through the ground.
		if (pose.pogo!.springLength < stick.springExtended) expect(pose.pogo!.grounded).toBe(true);
		expect(pose.pogo!.tip[1]).toBeLessThanOrEqual(rig.groundY);
		expect(pose.contact).toBe(pose.pogo!.grounded ? 'pogo' : 'flight');
	}
	// The saved frames show the squash at its deepest and a flight that lifts the tip off the ground line.
	const saved = Array.from({ length: rig.sampleCount }, (_, i) => sampleRig(rig, sampleTime(rig, i)).pogo!);
	expect(saved.map(p => p.springLength)).toContain(stick.springCompressed);
	expect(saved.filter(p => !p.grounded).length).toBeGreaterThanOrEqual(4);
	expect(Math.min(...saved.map(p => p.tip[1]))).toBeLessThanOrEqual(rig.groundY - 2);
	// The pelvis drops as the spring loads: the deepest squash sits at least four pixels lower than the launch.
	const roots = Array.from({ length: rig.sampleCount }, (_, i) => sampleRig(rig, sampleTime(rig, i)).root[1]);
	expect(Math.max(...roots) - Math.min(...roots)).toBeGreaterThanOrEqual(4);
});

test('hands stay on the grips and soles on the pegs with fixed bones, the feet pitched with the stick', () => {
	for (let i = 0; i <= 240; i++) {
		const pose = sampleRig(rig, i / 240), p = pose.pogo!;
		for (const [chain, upper, lower] of [[pose.nearArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.farArm, rig.arms.upperLength, rig.arms.forearmLength], [pose.nearLeg, rig.legs.thighLength, rig.legs.shinLength], [pose.farLeg, rig.legs.thighLength, rig.legs.shinLength]] as [Chain, number, number][]) {
			expect(distance(chain[0], chain[1])).toBeCloseTo(upper, 8); expect(distance(chain[1], chain[2])).toBeCloseTo(lower, 8);
		}
		expect(distance(pose.nearArm[2], p.grips[0])).toBeLessThan(1e-6); expect(distance(pose.farArm[2], p.grips[1])).toBeLessThan(1e-6);
		// The ball of each foot rests on its peg, and the foot turns about it.
		expect(distance(pose.nearFoot.ball, p.pegs[0])).toBeLessThan(1e-6); expect(distance(pose.farFoot.ball, p.pegs[1])).toBeLessThan(1e-6);
		// Never flat: each foot follows the stick's lean plus its own rock, toes pointing down hardest at the launch.
		for (const foot of [pose.nearFoot, pose.farFoot]) expect(Math.abs(foot.pitch)).toBeGreaterThan(radians(1));
		// The pelvis rides behind the shaft, so the stick stands in front of Ben.
		expect(pose.root[0]).toBeLessThan(p.collar[0] - 2);
	}
	const pitches = Array.from({ length: rig.sampleCount }, (_, i) => sampleRig(rig, sampleTime(rig, i)).nearFoot.pitch * 180 / Math.PI);
	expect(Math.max(...pitches)).toBeGreaterThanOrEqual(18); expect(Math.max(...pitches) - Math.min(...pitches)).toBeGreaterThanOrEqual(12);
});

test('the ride loops continuously and its saved frames change on every step without a spike', () => {
	const first = sampleRig(rig, 0), last = sampleRig(rig, 1 - 1e-6);
	for (const key of ['nearArm', 'farArm', 'nearLeg', 'farLeg'] as const) for (let i = 0; i < 3; i++) expect(distance(last[key][i], first[key][i])).toBeLessThan(.01);
	for (const { prefix } of sides) {
		const sequence = sprites(prefix).map(grid => ({ width: 24, height: 44, grid }));
		expect(new Set(sequence.map(frame => frame.grid.join('|'))).size).toBe(sequence.length);
		const changes = cycleSteps(sequence.length).map(({ from, to }) => changedPixels(sequence[from], sequence[to]));
		expect(Math.min(...changes)).toBeGreaterThan(0); expect(Math.max(...changes)).toBeLessThanOrEqual(2 * median(changes));
	}
});

test('the saved frames are the rig redrawn, in the game palette, with the whole stick on the canvas', () => {
	for (const { rig: side, prefix } of sides) for (let i = 0; i < side.sampleCount; i++) {
		const drawn = skinRig(side, skin as unknown as RigSkin, sampleRig(side, sampleTime(side, i)));
		expect(frames[`${prefix}${i + 1}`].grid).toEqual(drawn.grid);
		expect(drawn.grid.every(row => [...row].every(code => Object.hasOwn(palette, code)))).toBe(true);
	}
	// Each spring length draws its own number of coil rows between the tip and the collar, and the yellow shaft, the red band
	// and the dark grips are all painted.
	for (const length of [2, 3, 4, 5]) {
		const stick = pogoStickPose(rig.pogo!, rig.groundY, 12, 0, (rig.pogo!.springExtended - length) / (rig.pogo!.springExtended - rig.pogo!.springCompressed), 0);
		expect(stick.springLength).toBe(length); expect(stick.collar[1]).toBe(rig.groundY - rig.pogo!.footHeight - length);
		const { shaft, core } = pogoLayers(stick), codes = new Set([...shaft, ...core].map(([, , code]) => code));
		for (const code of ['y', 'R', 'L', 'D', 'k']) expect(codes.has(code)).toBe(true);
	}
});

test('the Stunner stays on Ben’s right hip: shown facing right, hidden facing left, and no frame is a mirror of another', () => {
	const purple = (grid: string[]): number => grid.join('').replace(/[^Mm]/g, '').length;
	const rights = sprites(right.prefix), lefts = sprites(left.prefix);
	for (let i = 0; i < rig.sampleCount; i++) {
		expect(purple(rights[i])).toBeGreaterThan(0); expect(purple(lefts[i])).toBe(0);
		const flipped = rights[i].map(row => [...row].reverse().join(''));
		expect(lefts[i]).not.toEqual(flipped);
		// Apart from the holster the left frame is the turned-round right frame: the stick, limbs and face all come across.
		const differ = lefts[i].reduce((sum, row, y) => sum + [...row].filter((code, x) => code !== flipped[y][x]).length, 0);
		expect(differ).toBeLessThanOrEqual(16);
	}
	// The painter marks the stick as a prop, so a light mask or hit test can tell it from Ben.
	const parts = paintRig(rig, skin as unknown as RigSkin, sampleRig(rig, 0)).parts.flat();
	expect(parts.filter(part => part === 'prop').length).toBeGreaterThan(20);
});

test('pogo keys must ride the stick on every key with valid stick settings', () => {
	const broken = structuredClone(rig) as SideRig; delete broken.performance!.keys[3].stick;
	expect(() => validateRig(broken)).toThrow();
	const spring = structuredClone(rig) as SideRig; spring.pogo!.springCompressed = spring.pogo!.springExtended;
	expect(() => validateRig(spring)).toThrow();
});
