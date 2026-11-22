// Rock faces behind and beside the ground: the back walls of pits and gaps, and the cliffs past the ends of the level.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { rockColour } from './ground.ts';
import { lattice, rng } from './hash.ts';
import { Mesher, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';

/** Half the depth of the ground strip. */
const half = 1.5;

/** A point of a rock face grid: the same column and row always give the same bulge, so neighbouring faces join. */
function bulge(ix: number, iy: number, salt: number, amount: number): number {
	return lattice(ix, iy, salt) * amount;
}

/**
 * The back wall of a pit: a faceted rock face at the back of the lane, one tile wide, from `bottom` up to `top`. It sinks
 * into darkness with depth, so a gap reads as a chasm cut into the ground rather than a space between slabs.
 */
export function chasmGeometry(column: number, top: number, bottom: number): THREE.BufferGeometry {
	const m = new Mesher(),
		rnd = rng(column * 7919 + 13),
		rows = Math.ceil(top - bottom),
		y = (j: number): number => Math.max(bottom, top - j),
		point = (i: number, j: number): V3 => [column + i, y(j), -half + bulge(column + i, j, 61, 0.3)];
	for (let j = rows - 1; j >= 0; j--) {
		const depth = Math.min(1, (top - (y(j) + y(j + 1)) / 2) / 5),
			dim = 1 - 0.78 * depth * depth;
		m.quad(
			point(0, j + 1),
			point(1, j + 1),
			point(1, j),
			point(0, j),
			shade(rockColour(rnd), 0.8 * dim),
		);
	}
	return m.build();
}

/**
 * A cliff of the crater rock past an end of the ground, `width` tiles wide, rising from `bottom` to `top` and capped with
 * grass. `side` is -1 for the cliff on the left of `edge` and 1 for the one on its right.
 */
export function massifGeometry(
	side: -1 | 1,
	edge: number,
	width: number,
	bottom: number,
	top: number,
): THREE.BufferGeometry {
	const m = new Mesher(),
		rnd = rng(side * 4001 + 17),
		height = Math.min(top, 34),
		rows = Math.ceil(height - bottom),
		x0 = side < 0 ? edge - width : edge,
		y = (j: number): number => Math.min(height, bottom + j),
		point = (i: number, j: number): V3 => [
			x0 + i,
			y(j),
			half + (i === 0 || i === width ? 0 : bulge(i, j, 62, 0.3) - 0.1),
		];
	for (let i = 0; i < width; i++)
		for (let j = 0; j < rows; j++)
			m.quad(
				point(i, j),
				point(i + 1, j),
				point(i + 1, j + 1),
				point(i, j + 1),
				shade(rockColour(rnd), 0.95),
			);
	m.quad(
		[x0, height, half + 0.06],
		[x0 + width, height, half + 0.06],
		[x0 + width, height, -half],
		[x0, height, -half],
		palette.crustTop,
	);
	/* The face turned to the level, so the cliff has an edge when seen at an angle. */
	const faceX = side < 0 ? x0 + width : x0;
	if (side < 0)
		m.quad(
			[faceX, bottom, half],
			[faceX, bottom, -half],
			[faceX, height, -half],
			[faceX, height, half],
			palette.rockDark,
		);
	else
		m.quad(
			[faceX, bottom, -half],
			[faceX, bottom, half],
			[faceX, height, half],
			[faceX, height, -half],
			palette.rockDark,
		);
	return m.build();
}
