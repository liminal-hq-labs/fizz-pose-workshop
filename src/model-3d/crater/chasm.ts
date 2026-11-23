// Rock faces behind and beside the ground: the back walls of pits and gaps, and the cliffs past the ends of the level.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { half } from './ground.ts';
import { Mesher, shade } from './mesher.ts';
import { palette } from './palette.ts';
import { rockFace } from './stones.ts';

/**
 * The back wall of a pit: a rock face of small stones at the back of the lane, one tile wide, from `bottom` up to `top`. It
 * sinks into darkness with depth, so a gap reads as a chasm cut into the ground rather than a space between slabs. Its
 * stones are laid by world position, so they run on from one column to the next.
 */
export function chasmGeometry(column: number, top: number, bottom: number): THREE.BufferGeometry {
	const m = new Mesher();
	rockFace(m, {
		map: (u, v, w) => [u, v, -half + w],
		u0: column,
		u1: column + 1,
		v0: bottom,
		t0: top,
		t1: top,
		originU: 0,
		originV: 0,
		face: 3,
		joint: palette.crevice,
		tone: (colour, _u, v) => {
			const deep = Math.min(1, (top - v) / 5);
			return shade(colour, 0.62 * (1 - 0.8 * deep));
		},
		bevelled: 'flat',
	});
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
		x0 = side < 0 ? edge - width : edge;
	rockFace(m, {
		map: (u, v, w) => [u, v, half - 0.04 + w],
		u0: x0,
		u1: x0 + width,
		v0: bottom,
		t0: height,
		t1: height,
		originU: 0,
		originV: 0,
		face: 4,
		joint: palette.crevice,
		tone: (colour) => shade(colour, 0.9),
		bevelled: 'flat',
	});
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
