// The candy block as masonry: courses of small bricks in mortar, laid out in world space so a wall of blocks reads as one wall.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { depth } from '../toon.ts';
import { lattice } from './hash.ts';
import { Mesher, mix, shade } from './mesher.ts';
import { palette } from './palette.ts';
import { pad, type FaceMap, type PadStyle } from './relief.ts';

/** Courses of bricks in one tile, so a course is a quarter of a tile tall. */
const courses = 4;
/** The length of a brick on the front and top of a block. */
const brickLength = 0.5;
/** How far a brick's front stands out of the mortar on the front face. */
const frontRelief = 0.034;
/** How far the mortar sits below the top and the sides, which stay on the tile's own edges. */
const recess = 0.03;
/** How far each edge of a brick stands in from its joint, and how wide its bevel is. */
const gap = 0.012;
const bevel = 0.016;
/** How long a brick on the side of a block is, at most. */
const sideLength = 0.45;

/** What a theme gives its blocks: how a brick is coloured, the mortar between bricks, the highlight on their edges and their glints. */
export interface BlockTheme {
	colour(a: number, b: number, face: number): number;
	mortar: number;
	edge: number;
	glint: number;
}

const brickColours = [
	palette.blockFront,
	palette.blockFront,
	palette.blockPanel,
	palette.blockBody,
	palette.blockBody,
	palette.blockViolet,
	palette.blockTop,
] as const;

/** The crater's blocks: candy bricks in pinks and violets over plum mortar. */
export const craterBlocks: BlockTheme = {
	colour: brickColour,
	mortar: palette.blockMortar,
	edge: palette.blockEdge,
	glint: palette.white,
};

function mod(a: number, n: number): number {
	return ((a % n) + n) % n;
}

/** The colour of one brick, from its place in the wall. */
export function brickColour(a: number, b: number, face: number): number {
	const base = brickColours[Math.floor(lattice(a, b, 300 + face) * brickColours.length)];
	return shade(base, 0.94 + 0.12 * lattice(a, b, 310 + face));
}

/** The pad style of a brick of colour `base`, flush on the sides that run on into a neighbour. */
function brickStyle(
	base: number,
	relief: number,
	flush: readonly [boolean, boolean, boolean, boolean],
	lit: number,
	edge: number,
): PadStyle {
	const g = (on: boolean): number => (on ? 0 : gap),
		b = (on: boolean): number => (on ? 0 : bevel);
	return {
		gap: [g(flush[0]), g(flush[1]), g(flush[2]), g(flush[3])],
		bevel: [b(flush[0]), b(flush[1]), b(flush[2]), b(flush[3])],
		w0: 0.004,
		w1: relief,
		foot: shade(base, 0.9 * lit),
		crown: shade(base, 1.07 * lit),
		edges: {
			left: shade(mix(base, edge, 0.3), lit),
			right: shade(base, 0.68 * lit),
			bottom: shade(base, 0.55 * lit),
			top: shade(mix(base, edge, 0.7), lit),
		},
	};
}

/** What a block needs to know about the tiles beside it: the heights of their edges that meet it, as fractions of a tile. */
export interface BlockSides {
	leftH: number;
	rightH: number;
}

/**
 * A block built from bricks. Four courses of half-tile bricks, every other course shifted by a quarter, are laid by world
 * position, so the joints run straight through from tile to tile. A brick cut by the tile's edge is flush to it. The front
 * bricks stand 0.034 out of the mortar; on the top and sides the mortar is recessed instead, so the block keeps its cell.
 * `wx` and `wy` are the tile's centre.
 */
export function blockMasonry(
	resting: boolean,
	wx: number,
	wy: number,
	sides: BlockSides,
	theme: BlockTheme = craterBlocks,
): THREE.BufferGeometry {
	const m = new Mesher(),
		d = resting ? depth.lane / 2 : depth.shelf / 2,
		row = Math.floor(wy),
		mortar = theme.mortar;
	/* The front: mortar at the face, and the courses of bricks on it. */
	m.quad([-0.5, -0.5, d], [0.5, -0.5, d], [0.5, 0.5, d], [-0.5, 0.5, d], mortar);
	const front: FaceMap = (u, v, w) => [u, v, d + w];
	for (let c = 0; c < courses; c++) {
		const course = row * courses + c,
			shift = mod(course, 2) * (brickLength / 2),
			v0 = -0.5 + c / courses,
			v1 = v0 + 1 / courses,
			first = Math.floor((wx - 0.5 - shift) / brickLength),
			last = Math.ceil((wx + 0.5 - shift) / brickLength);
		for (let n = first; n <= last; n++) {
			const xa = n * brickLength + shift - wx,
				xb = xa + brickLength;
			if (xb <= -0.5 + 1e-9 || xa >= 0.5 - 1e-9) continue;
			const a = Math.max(xa, -0.5),
				b = Math.min(xb, 0.5),
				base = theme.colour(n, course, 0),
				relief = frontRelief * (0.65 + 0.35 * lattice(n, course, 320));
			pad(
				m,
				front,
				{ u0: a, v0, u1: b, v1 },
				brickStyle(base, relief, [xa < -0.5 - 1e-9, xb > 0.5 + 1e-9, false, false], 1, theme.edge),
			);
			/* A glint on some bricks, like the shine on a sweet. */
			if (lattice(n, course, 330) < 0.22 && b - a > 0.3)
				m.quad(
					front(a + 0.07, v1 - 0.06, relief + 0.001),
					front(a + 0.16, v1 - 0.06, relief + 0.001),
					front(a + 0.16, v1 - 0.045, relief + 0.001),
					front(a + 0.07, v1 - 0.045, relief + 0.001),
					theme.glint,
				);
		}
	}
	/* The top: mortar a little below the cell's top, and rows of brick tops whose faces are level with it. */
	const rows = Math.max(2, Math.round((2 * d) / 0.4)),
		top: FaceMap = (u, v, w) => [u, 0.5 - recess + w, -v];
	m.quad(top(-0.5, -d, 0), top(0.5, -d, 0), top(0.5, d, 0), top(-0.5, d, 0), mortar);
	for (let r = 0; r < rows; r++) {
		const v0 = -d + (r * 2 * d) / rows,
			v1 = v0 + (2 * d) / rows,
			shift = (r % 2) * (brickLength / 2),
			first = Math.floor((wx - 0.5 - shift) / brickLength),
			last = Math.ceil((wx + 0.5 - shift) / brickLength);
		for (let n = first; n <= last; n++) {
			const xa = n * brickLength + shift - wx,
				xb = xa + brickLength;
			if (xb <= -0.5 + 1e-9 || xa >= 0.5 - 1e-9) continue;
			pad(
				m,
				top,
				{ u0: Math.max(xa, -0.5), v0, u1: Math.min(xb, 0.5), v1 },
				brickStyle(
					shade(theme.colour(n, row * rows + r, 1), 1.12),
					recess,
					[xa < -0.5 - 1e-9, xb > 0.5 + 1e-9, false, false],
					1,
					theme.edge,
				),
			);
		}
	}
	/* The ends, where no block or ground stands beside this one: courses of bricks along the depth. */
	const length = (2 * d) / Math.max(2, Math.round((2 * d) / sideLength));
	for (const side of [-1, 1] as const) {
		const other = side < 0 ? sides.leftH : sides.rightH;
		if (other >= 1 - 1e-6) continue;
		const x = side * 0.5,
			map: FaceMap =
				side < 0 ? (u, v, w) => [x + (recess - w), v, u] : (u, v, w) => [x - (recess - w), v, -u],
			low = -0.5 + other;
		if (side < 0)
			m.quad(
				[x + recess, -0.5, -d],
				[x + recess, -0.5, d],
				[x + recess, 0.5, d],
				[x + recess, 0.5, -d],
				mortar,
			);
		else
			m.quad(
				[x - recess, -0.5, d],
				[x - recess, -0.5, -d],
				[x - recess, 0.5, -d],
				[x - recess, 0.5, d],
				mortar,
			);
		for (let c = 0; c < courses; c++) {
			const course = row * courses + c,
				v0 = -0.5 + c / courses,
				v1 = v0 + 1 / courses,
				shift = mod(course, 2) * (length / 2);
			if (v1 <= low + 1e-9) continue;
			for (let i = -1; i * length + shift < 2 * d; i++) {
				const ua = -d + i * length + shift,
					ub = ua + length,
					a = Math.max(ua, -d),
					b = Math.min(ub, d);
				if (b - a < 0.02) continue;
				pad(
					m,
					map,
					{ u0: a, v0, u1: b, v1 },
					brickStyle(
						theme.colour(i + side * 40, course, 2),
						recess,
						[ua < -d + 1e-9, ub > d - 1e-9, false, false],
						side < 0 ? 0.9 : 0.8,
						theme.edge,
					),
				);
			}
		}
	}
	/* A block in the air has an underside, in the shade of the mortar. */
	if (!resting)
		m.quad([-0.5, -0.5, -d], [0.5, -0.5, -d], [0.5, -0.5, d], [-0.5, -0.5, d], shade(mortar, 0.7));
	return m.build();
}
