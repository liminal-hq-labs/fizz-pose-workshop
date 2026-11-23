// The crater's one-way ledge: a cyan-capped teal slab on small feet, cut into planks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { lattice } from './hash.ts';
import { Mesher, shade } from './mesher.ts';
import { palette } from './palette.ts';
import { shelfHalf } from './dims.ts';

/** How many planks a ledge has to a tile, and how far each stands in from its joints. */
const planks = 2;
const plankGap = 0.01;

/**
 * The one-way ledge, as drawn: a cyan-capped teal slab 0.3 tall hanging from the top of its cell, a violet line under it and
 * small feet, 0.375 in all, cut into planks half a tile long with a dark joint between them. The slab is a shelf deep and
 * its ends sit exactly on the cell's edges. `wx` and `wy` are the tile's centre, which tint the planks.
 */
export function planksTile(wx: number, wy: number): THREE.BufferGeometry {
	const m = new Mesher(),
		d = shelfHalf,
		top = 0.5,
		cap = 0.4375,
		teal = 0.25,
		slab = 0.1875,
		bevel = 0.05,
		recess = 0.012,
		dark = shade(palette.cyanDark, 0.3),
		row = Math.floor(wy);
	/* The joints show as the dark backing, set a little behind and below the planks. */
	m.box(-0.5, slab, -d, 0.5, top - recess, d - recess, dark, {
		left: false,
		right: false,
		bottom: false,
		back: false,
	});
	for (let i = 0; i < planks; i++) {
		const x0 = -0.5 + i / planks + plankGap,
			x1 = -0.5 + (i + 1) / planks - plankGap,
			world = Math.floor(wx - 0.5) * planks + i,
			tint = 0.94 + 0.12 * lattice(world, row, 340),
			c = shade(palette.cyan, tint);
		/* The top is two boards deep, with a joint between them. */
		for (const [z0, z1, k] of [
			[-d, -0.006, 0],
			[0.006, d - bevel, 1],
		] as const) {
			const t = shade(c, 0.95 + 0.1 * lattice(world, row, 341 + k));
			m.quadC(
				[x0, top, z1],
				[x1, top, z1],
				[x1, top, z0],
				[x0, top, z0],
				t,
				t,
				shade(t, 0.9),
				shade(t, 0.9),
			);
		}
		m.quad([x0, cap, d], [x1, cap, d], [x1, top, d - bevel], [x0, top, d - bevel], shade(c, 1.1));
		m.quad([x0, teal, d], [x1, teal, d], [x1, cap, d], [x0, cap, d], c);
		m.quadC(
			[x0, slab, d - 0.01],
			[x1, slab, d - 0.01],
			[x1, teal, d],
			[x0, teal, d],
			shade(palette.ledge, tint),
			shade(palette.ledge, tint),
			shade(palette.cyanDark, tint),
			shade(palette.cyanDark, tint),
		);
		/* One stud on the front of each plank, set a little off its middle. */
		const cx = (x0 + x1) / 2,
			r = 0.024,
			y = 0.31 + (i % 2) * 0.03;
		m.pyramid(
			[
				[cx - r, y - r, d],
				[cx + r, y - r, d],
				[cx + r, y + r, d],
				[cx - r, y + r, d],
			],
			[cx, y, d + 0.026],
			[palette.ledgeStud, palette.ledge, shade(palette.ledge, 0.7), palette.ledge],
		);
	}
	for (const sx of [-1, 1]) {
		const x = sx * 0.5;
		if (sx < 0) m.quad([x, slab, -d], [x, slab, d], [x, top, d], [x, top, -d], palette.cyanDark);
		else
			m.quad([x, slab, d], [x, slab, -d], [x, top, -d], [x, top, d], shade(palette.cyanDark, 0.85));
	}
	m.quad(
		[-0.5, slab, -d],
		[0.5, slab, -d],
		[0.5, slab, d],
		[-0.5, slab, d],
		shade(palette.ledge, 0.75),
	);
	/* A back face, for seeing the ledge from behind. */
	m.quad(
		[0.5, slab, -d],
		[-0.5, slab, -d],
		[-0.5, top, -d],
		[0.5, top, -d],
		shade(palette.cyanDark, 0.8),
	);
	for (const x of [-0.25, 0.25])
		for (const z of [-d + 0.12, d - 0.16])
			m.box(x - 0.04, 0.125, z - 0.05, x + 0.04, slab, z + 0.05, palette.teal, { top: false });
	return m.build();
}
