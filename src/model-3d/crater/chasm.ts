// Rock faces behind and beside the ground: the back walls of pits and gaps, and the cliffs past the ends of the level.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { half, strataColour } from './ground.ts';
import { lattice } from './hash.ts';
import { Mesher, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';

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
		rows = Math.ceil(top - bottom),
		y = (j: number): number => Math.max(bottom, top - j),
		point = (i: number, j: number): V3 => [
			column + i,
			y(j),
			-half + bulge(column + i, j, 61, 0.14),
		];
	for (let j = rows - 1; j >= 0; j--) {
		const depth = Math.min(1, (top - (y(j) + y(j + 1)) / 2) / 5),
			dim = 0.62 * (1 - 0.8 * depth);
		/* Strata run on through every column of a row, each stratum lit at its top and dark at its foot. */
		const row = Math.floor((y(j) + y(j + 1)) / 2),
			base = shade(strataColour(row, 0), (0.86 + 0.1 * lattice(column, row, 3)) * dim);
		m.quadC(
			point(0, j + 1),
			point(1, j + 1),
			point(1, j),
			point(0, j),
			shade(base, 0.8),
			shade(base, 0.8),
			shade(base, 1.08),
			shade(base, 1.08),
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
		height = Math.min(top, 34),
		rows = Math.ceil(height - bottom),
		x0 = side < 0 ? edge - width : edge,
		y = (j: number): number => Math.min(height, bottom + j),
		point = (i: number, j: number): V3 => [
			x0 + i,
			y(j),
			half + (i === 0 || i === width ? 0 : bulge(i, j, 62, 0.16) - 0.04),
		];
	for (let i = 0; i < width; i++)
		for (let j = 0; j < rows; j++) {
			const row = Math.floor(y(j)),
				base = shade(strataColour(row, 0), 0.9 + 0.1 * lattice(x0 + i, row, 4));
			m.quadC(
				point(i, j),
				point(i + 1, j),
				point(i + 1, j + 1),
				point(i, j + 1),
				shade(base, 0.82),
				shade(base, 0.82),
				shade(base, 1.08),
				shade(base, 1.08),
			);
		}
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
