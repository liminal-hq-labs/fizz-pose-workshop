// Checks the printable-solid pipeline on a simple shape and on a coarse build of the cartoon Ben.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { buildBenGPrint, filamentFor } from './build-ben-g-print.ts';
import {
	type Soup,
	bodies,
	exposedLabels,
	gridFor,
	meshVolume,
	occupancy,
	openEdges,
	rasterise,
	spread,
	stl,
	surface,
	threeMf,
} from './print-solid.ts';

/** Two overlapping spheres, the left labelled 1 and the right 2. */
function twoSpheres(): Soup {
	const positions: number[] = [],
		labels: number[] = [];
	for (const [x, label] of [
		[-3, 1],
		[3, 2],
	]) {
		const at = new THREE.SphereGeometry(5, 48, 32).translate(x, 0, 0).toNonIndexed()
			.attributes.position;
		for (let i = 0; i < at.count; i++) {
			positions.push(at.getX(i), at.getY(i), at.getZ(i));
			labels.push(label);
		}
	}
	return {
		positions: Float32Array.from(positions),
		colour: Uint8Array.from(labels),
		piece: Uint8Array.from(labels),
	};
}

test('overlapping spheres fuse into one closed solid that its two bodies tile', () => {
	const soup = twoSpheres(),
		grid = gridFor(soup, 0.25, 6),
		raster = rasterise(soup, grid),
		occ = occupancy(raster, raster.shell, grid, 2),
		solid = surface(occ, grid, 0.5),
		/* Two spheres of radius 5 with centres 6 apart: two whole spheres less the lens they share. */
		lens = (Math.PI * Math.pow(10 - 6, 2) * (36 + 12 * 10)) / (12 * 6),
		expected = (2 * 4 * Math.PI * 125) / 3 - lens,
		halves = bodies(spread(exposedLabels(soup, 'colour', grid, occ), grid), 2, occ, grid, 20);
	expect(openEdges(solid)).toBe(0);
	expect(Math.abs(meshVolume(solid) - expected) / expected).toBeLessThan(0.02);
	for (const half of halves) expect(openEdges(half)).toBe(0);
	expect(Math.abs(meshVolume(halves[0]) - meshVolume(halves[1])) / expected).toBeLessThan(0.03);
	expect(
		Math.abs(meshVolume(halves[0]) + meshVolume(halves[1]) - meshVolume(solid)) / expected,
	).toBeLessThan(0.005);
	expect(stl([solid], 'spheres').length).toBe(84 + (solid.indices.length / 3) * 50);
	expect(
		threeMf([{ name: 'left', colour: 0xff0000, mesh: halves[0] }], 'half').subarray(0, 2),
	).toEqual(new Uint8Array([0x50, 0x4b]));
});

test('every model colour maps to one of the four filaments', () => {
	expect(filamentFor(0x49d957)).toBe(1);
	expect(filamentFor(0xd93a32)).toBe(2);
	expect(filamentFor(0x2f45b8)).toBe(3);
	expect(filamentFor(0xf6c7a2)).toBe(4);
	expect(filamentFor(0xffffff)).toBe(4);
	expect(filamentFor(0x15152a)).toBe(3);
	expect(filamentFor(0xb98a45)).toBe(4);
	expect(filamentFor(0xb98a45, true)).toBe(3);
});

test('a coarse Ben builds as closed bodies, and the kit has every piece and pin', () => {
	const print = buildBenGPrint(120, 0.6),
		total = print.colours.reduce((sum, body) => sum + meshVolume(body.mesh), 0);
	expect(openEdges(print.solid)).toBe(0);
	for (const body of [...print.colours, ...print.kit]) expect(openEdges(body.mesh)).toBe(0);
	expect(Math.abs(total - meshVolume(print.solid)) / meshVolume(print.solid)).toBeLessThan(0.02);
	expect(print.kit.map((body) => body.name).sort()).toEqual([
		'arm-left',
		'arm-right',
		'base',
		'head',
		'helmet',
		'jeans',
		'runner-left',
		'runner-right',
		'shirt',
		'stunner',
	]);
	expect(print.pins.length).toBeGreaterThanOrEqual(7);
}, 60000);
