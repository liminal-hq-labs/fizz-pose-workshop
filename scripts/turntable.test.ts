// Checks the standing turntable's keys, smooth rotation, feature fades, outlines and one-hip Stunner.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect, describe } from 'bun:test';
import rig from '../source/ben-turntable-rig.json';
import skin from '../source/ben-turntable-skin.json';
import poses from '../source/poses.json';
import edits from '../edits.json';
import { sampleTurntable, rotateYaw, type Point3 } from '../src/rig/turntable.ts';
import { colourRuns, mirrorGrid, morphRow } from '../src/rig/turntable-morph.ts';
import { buildTurntable, changedPixels, stopName, turntableData } from './draw-turntable.ts';
import { padStanding, turntableKeys, sampleTurntableSkin, morphDraft } from './turntable-reference.ts';
import type { Frame, Frames } from '../src/types.ts';

const frames = buildTurntable(),
	angles = Array.from({ length: rig.sampleCount }, (_, i) => (i * 360) / rig.sampleCount),
	ordered = angles.map((angle) => frames[stopName(angle)]),
	saved = edits as unknown as Frames;
const count = (frame: Frame, pattern: RegExp, rows: [number, number] = [0, frame.height - 1]): number =>
	[...frame.grid.slice(rows[0], rows[1] + 1).join('')].filter((code) => pattern.test(code)).length;
// The twelve-frame run is the motion benchmark: its largest step changes 234 pixels.
const runStepLimit = 234;

describe('keys', () => {
	test('0°, 45° and 315° are the saved standing sprites, and the snapshots match the saved artwork', () => {
		for (const [angle, name] of [
			[0, 'ben_standFront'],
			[45, 'ben_standRight'],
			[315, 'ben_stand'],
		] as const) {
			expect(skin.references[name].grid).toEqual(saved[name].grid);
			expect(frames[stopName(angle)]).toEqual(padStanding(saved[name], rig, angle === 0));
		}
		const front = frames.ben_turn000;
		for (let y = 0; y < 30; y++) expect(front.grid[y].slice(4, 28)).toBe(saved.ben_standFront.grid[y]);
	});
	test('there is one key every 45°, including the rear quarters at 135° and 225°', () => {
		const keys = turntableKeys(rig, skin, turntableData);
		expect(keys.map((key) => key.angle)).toEqual([0, 45, 90, 135, 180, 225, 270, 315, 360]);
		for (const key of keys) expect(frames[stopName(key.angle % 360)]).toEqual(key.frame);
	});
	test('the saved frames and animation are the turntable redrawn', () => {
		for (const [name, frame] of Object.entries(frames)) {
			expect(saved[name].grid).toEqual(frame.grid);
			expect((poses.frames as Frames)[name].grid).toEqual(frame.grid);
		}
		const animation = poses.animations['standing-360'];
		expect(animation.frames).toEqual(angles.map(stopName));
		expect(animation.loop).toBe(true);
		expect(new Set(animation.durationsMs)).toEqual(new Set([rig.frameMs]));
	});
});

describe('canvas', () => {
	test('24 distinct palette-only stops keep the crown on row 2, the soles on row 34 and fit a 24-pixel crop', () => {
		expect(ordered).toHaveLength(24);
		expect(new Set(ordered.map((frame) => frame.grid.join(''))).size).toBe(24);
		for (const frame of ordered) {
			expect(frame.grid.every((row) => row.length === rig.width && [...row].every((code) => Object.hasOwn(skin.palette, code)))).toBe(true);
			expect(frame.grid.findIndex((row) => /[^.]/.test(row))).toBe(2);
			expect(frame.grid.findLastIndex((row) => /[^.]/.test(row))).toBe(rig.groundY);
			for (const row of frame.grid) expect(row.slice(0, 4) + row.slice(28)).toMatch(/^\.*$/);
		}
	});
	test('the outline stays closed: at most five colour pixels touch transparency, none of them below the ground', () => {
		for (const frame of ordered) {
			let open = 0;
			for (let y = 0; y < frame.height; y++)
				for (let x = 0; x < frame.width; x++) {
					const code = frame.grid[y][x];
					if (code === '.' || code === 'k') continue;
					const neighbours = [
						[1, 0],
						[-1, 0],
						[0, -1],
						...(y === rig.groundY ? [] : [[0, 1]]),
					];
					if (neighbours.some(([dx, dy]) => (frame.grid[y + dy]?.[x + dx] ?? '.') === '.')) open++;
				}
			expect(open).toBeLessThanOrEqual(5);
		}
	});
});

describe('rotation', () => {
	test('every step, including 345° back to 0°, changes fewer pixels than the run benchmark', () => {
		ordered.forEach((frame, i) => {
			const step = changedPixels(frame, ordered[(i + 1) % ordered.length]);
			expect(step).toBeGreaterThan(0);
			expect(step).toBeLessThanOrEqual(runStepLimit);
		});
		const keys = turntableKeys(rig, skin, turntableData);
		expect(sampleTurntableSkin(rig, keys, 0, turntableData)).toEqual(sampleTurntableSkin(rig, keys, 360, turntableData));
	});
	test('the silhouette never jumps: each row edge moves at most three pixels per step', () => {
		ordered.forEach((frame, i) => {
			const next = ordered[(i + 1) % ordered.length];
			for (let y = 2; y <= rig.groundY; y++) {
				const a = frame.grid[y],
					b = next.grid[y];
				const right = (row: string): number => row.length - 1 - [...row].reverse().findIndex((code) => code !== '.');
				expect(Math.abs(a.search(/[^.]/) - b.search(/[^.]/))).toBeLessThanOrEqual(3);
				expect(Math.abs(right(a) - right(b))).toBeLessThanOrEqual(3);
			}
		});
	});
	test('facial features, hair and the helmet stripe fade by a pixel or two per step instead of switching', () => {
		ordered.forEach((frame, i) => {
			const next = ordered[(i + 1) % ordered.length];
			expect(Math.abs(count(frame, /B/, [9, 13]) - count(next, /B/, [9, 13]))).toBeLessThanOrEqual(1);
			expect(Math.abs(count(frame, /R/, [9, 13]) - count(next, /R/, [9, 13]))).toBeLessThanOrEqual(2);
			expect(Math.abs(count(frame, /N/, [9, 13]) - count(next, /N/, [9, 13]))).toBeLessThanOrEqual(2);
			expect(Math.abs(count(frame, /W/, [3, 6]) - count(next, /W/, [3, 6]))).toBeLessThanOrEqual(1);
		});
		for (const angle of angles) {
			const frame = frames[stopName(angle)],
				eyes = count(frame, /B/, [9, 13]),
				hair = count(frame, /N/, [9, 13]);
			if (angle >= 120 && angle <= 240) expect(eyes).toBe(0);
			if (angle <= 60 || angle >= 300) expect(eyes).toBe(2);
			if (angle <= 90 || angle >= 270) expect(hair).toBe(0);
			if (angle >= 135 && angle <= 225) expect(hair).toBeGreaterThanOrEqual(5);
			// The helmet stripe is one white line, never doubled.
			for (let y = 3; y <= 6; y++) expect(count(frame, /W/, [y, y])).toBe(1);
		}
	});
	test('the collar is one white row resting on an all-red shoulder row, so it never reads as a scarf', () => {
		for (const frame of ordered) {
			expect(frame.grid[14]).toMatch(/W/);
			expect(frame.grid[15]).not.toMatch(/[WL]/);
			expect(frame.grid[15]).toMatch(/[rR]/);
		}
	});
	test('each stop keeps two shoes with red uppers and a white near sole on the ground', () => {
		for (const frame of ordered) {
			const sole = frame.grid[rig.groundY];
			expect(count(frame, /R/, [30, 34])).toBeGreaterThanOrEqual(10);
			expect(count({ ...frame, grid: [sole] }, /W/)).toBeGreaterThanOrEqual(6);
		}
	});
});

describe('Fizz Stunner', () => {
	const stunner = (frame: Frame): number[] =>
		frame.grid.flatMap((row) => [...row].flatMap((code, x) => (/[Mm]/.test(code) ? [x] : [])));
	test('shows only while Ben\'s right hip faces the camera, on that hip\'s side of the body', () => {
		for (const angle of angles) {
			const hip = sampleTurntable(rig, angle).joints.stunner.camera,
				pixels = stunner(frames[stopName(angle)]);
			if (hip[2] < -1.7) expect(pixels).toHaveLength(0);
			else {
				expect(pixels.length).toBeGreaterThan(0);
				const mean = pixels.reduce((sum, x) => sum + x, 0) / pixels.length;
				if (Math.abs(hip[0]) > 1.5) expect(Math.sign(mean - rig.centreX)).toBe(Math.sign(hip[0]));
			}
		}
	});
	test('a stop that shows the Stunner is never a plain mirror of another stop', () => {
		for (const a of ordered)
			if (stunner(a).length)
				for (const b of ordered)
					for (const axis of [30, 31]) expect(mirrorGrid(b.grid, axis)).not.toEqual(a.grid);
	});
});

describe('in-between method', () => {
	test('a run present in one key grows from zero width instead of appearing whole', () => {
		expect(morphRow('..kWWk..', '..kWWk..', 0.5)).toBe('..kWWk..');
		expect(morphRow('.kWWWWk.', '..kWWk..', 0.5)).toMatch(/^\.+kW+k\.+$/);
		expect(colourRuns('kkWB.')).toEqual([
			{ code: 'k', x0: 0, x1: 2 },
			{ code: 'W', x0: 2, x1: 3 },
			{ code: 'B', x0: 3, x1: 4 },
			{ code: '.', x0: 4, x1: 5 },
		]);
		const slide = [0, 1 / 3, 2 / 3, 1].map((t) => morphRow('.kBk......', '......kBk.', t).indexOf('B'));
		expect(slide).toEqual([2, 4, 5, 7]);
	});
	test('cleaned rows are recorded against a reproducible draft, and mirrored stops name their partner', () => {
		const keys = turntableKeys(rig, skin, turntableData);
		expect(turntableData.inbetweens.map((s) => s.angle).sort((a, b) => a - b)).toEqual(angles.filter((a) => a % 45));
		for (const stop of turntableData.inbetweens) {
			if (stop.draft === 'morph') expect(stop.angle).toBeLessThan(180);
			else expect(stop.of).toBe(360 - stop.angle);
			const draft = stop.draft === 'morph' ? morphDraft(keys, stop.angle) : undefined;
			for (const [y, row] of Object.entries(stop.rows)) {
				expect(row).toHaveLength(rig.width);
				if (draft) expect(draft.grid[Number(y)]).not.toBe(row);
			}
		}
	});
});

test('standing body joints and three-dimensional bone lengths remain fixed through every angle', () => {
	const distance = (a: Point3, b: Point3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
	for (let angle = 0; angle <= 360; angle += 5) {
		const pose = sampleTurntable(rig, angle);
		for (const chain of rig.connections)
			for (let i = 1; i < chain.length; i++) {
				const a = pose.joints[chain[i - 1]],
					b = pose.joints[chain[i]];
				expect(distance(a.camera, b.camera)).toBeCloseTo(distance(a.model, b.model), 8);
			}
		pose.joints.pelvis.camera.forEach((v, i) => expect(v).toBeCloseTo([0, 24, 0][i], 8));
		expect(pose.joints.crown.camera[1]).toBe(2);
	}
	expect(rotateYaw([2, 3, 4], 90)).toEqual([4, 3, -1.9999999999999998]);
});
