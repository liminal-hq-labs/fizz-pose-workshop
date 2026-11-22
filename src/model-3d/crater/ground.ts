// Geometry for the crater ground: rock fill, grassy crust, blocks, slopes and one-way ledges, in a handful of shared variants.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { rng } from './hash.ts';
import { Mesher, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';

/** How many look-alike variants each kind of tile has; a tile picks one by hashing its position. */
export const variantCount = 8;

/** Half the depth of the ground strip: terrain runs from -half to +half in Z. */
const half = 1.5;
/** The vertical thickness of the grassy crust. */
const crustDepth = 0.17;
/** How far the crust's front overhangs the rock face. */
const overhang = 0.06;

/** The slope tiles: the surface height at the tile's left and right edge, as a fraction of the tile. */
export const slopeHeights = {
	R45: [0, 1],
	L45: [1, 0],
	R22A: [0, 0.5],
	R22B: [0.5, 1],
	L22A: [1, 0.5],
	L22B: [0.5, 0],
} as const satisfies Record<string, readonly [number, number]>;

export type SlopeName = keyof typeof slopeHeights;

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
	let geometry = cache.get(key);
	if (!geometry) cache.set(key, (geometry = make()));
	return geometry;
}

export function rockColour(rnd: () => number): number {
	const r = rnd(),
		base =
			r < 0.4
				? palette.rock
				: r < 0.65
					? palette.rockDark
					: r < 0.85
						? palette.rockLight
						: palette.rock;
	return shade(base, 0.92 + rnd() * 0.16);
}

/** A front face from y0 to y1 cut into a 3 by 3 grid whose inner corners bulge, so the rock reads as faceted stone. */
function rockGrid(m: Mesher, rnd: () => number, y0: number, y1: number): void {
	const n = 3,
		points: V3[][] = [];
	for (let i = 0; i <= n; i++) {
		points.push([]);
		for (let j = 0; j <= n; j++) {
			const inner = i > 0 && i < n && j > 0 && j < n;
			points[i].push([
				-0.5 + i / n,
				y0 + ((y1 - y0) * j) / n,
				half + (inner ? (rnd() - 0.35) * 0.14 : 0),
			]);
		}
	}
	for (let i = 0; i < n; i++)
		for (let j = 0; j < n; j++)
			m.quad(
				points[i][j],
				points[i + 1][j],
				points[i + 1][j + 1],
				points[i][j + 1],
				rockColour(rnd),
			);
}

/** Gem-like studs scattered on a rock face: the pink and navy flecks of the sprites. */
function studs(
	m: Mesher,
	rnd: () => number,
	count: number,
	inside: (x: number, y: number) => boolean,
): void {
	for (let placed = 0, tries = 0; placed < count && tries < count * 8; tries++) {
		const x = -0.42 + rnd() * 0.84,
			y = -0.45 + rnd() * 0.9,
			r = 0.04 + rnd() * 0.06,
			ry = r * (0.7 + rnd() * 0.6),
			depth = 0.03 + rnd() * 0.05,
			pick = rnd(),
			colour =
				pick < 0.4
					? palette.rockPink
					: pick < 0.75
						? palette.rockNavy
						: pick < 0.88
							? palette.rockDark
							: palette.rockLight;
		if (!inside(x - r, y - ry) || !inside(x + r, y + ry) || !inside(x - r, y + ry)) continue;
		placed++;
		const z = half - 0.02;
		m.pyramid(
			[
				[x - r, y - ry, z],
				[x + r, y - ry, z],
				[x + r, y + ry, z],
				[x - r, y + ry, z],
			],
			[x + (rnd() - 0.5) * r * 0.6, y + (rnd() - 0.5) * ry * 0.6, z + depth],
			[colour, shade(colour, 0.8), shade(colour, 0.65), shade(colour, 1.1)],
		);
	}
}

/** Rock body tile: a deep strip with a faceted front, and a few studs. */
export function fillGeometry(variant: number): THREE.BufferGeometry {
	return cached(`fill${variant}`, () => {
		const rnd = rng(1000 + variant * 31),
			m = new Mesher();
		rockGrid(m, rnd, -0.5, 0.5);
		m.box(-0.5, -0.5, -half, 0.5, 0.5, half, palette.rockDark, {
			front: false,
			back: false,
			bottom: false,
		});
		studs(m, rnd, 4 + Math.floor(rnd() * 4), () => true);
		return m.build();
	});
}

function surfaceY(hl: number, hr: number, x: number): number {
	return -0.5 + hl + (hr - hl) * (x + 0.5);
}

/**
 * The grass-topped tile for a surface running from height `hl` at the left edge to `hr` at the right, as fractions of the
 * tile. The flat top tile is `hl = hr = 1`. Edge heights are exact, because Ben walks on them.
 */
function crustTile(hl: number, hr: number, key: string, seed: number): THREE.BufferGeometry {
	return cached(key, () => {
		const rnd = rng(seed),
			m = new Mesher(),
			sl = -0.5 + hl,
			sr = -0.5 + hr,
			lowL = Math.max(-0.5, sl - crustDepth),
			lowR = Math.max(-0.5, sr - crustDepth),
			zf = half + overhang,
			under = (x: number): number => surfaceY(hl, hr, x) - crustDepth;
		if (hl === hr) {
			rockGrid(m, rnd, -0.5, lowL);
		} else {
			const ring: V3[] = [];
			for (const p of [
				[-0.5, -0.5],
				[0.5, -0.5],
				[0.5, lowR],
				[-0.5, lowL],
			] as const)
				if (!ring.some((q) => q[0] === p[0] && q[1] === p[1])) ring.push([p[0], p[1], half]);
			const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
				cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
				centre: V3 = [cx, cy, half + 0.04 + rnd() * 0.05];
			for (let i = 0; i < ring.length; i++)
				m.tri(ring[i], ring[(i + 1) % ring.length], centre, rockColour(rnd));
		}
		const rockTop = (x: number): number => under(x) - 0.01;
		if (lowL > -0.5)
			m.quad(
				[-0.5, -0.5, -half],
				[-0.5, -0.5, half],
				[-0.5, lowL, half],
				[-0.5, lowL, -half],
				palette.rockDark,
			);
		if (lowR > -0.5)
			m.quad(
				[0.5, -0.5, half],
				[0.5, -0.5, -half],
				[0.5, lowR, -half],
				[0.5, lowR, half],
				palette.rockDark,
			);
		studs(
			m,
			rnd,
			hl === hr ? 3 + Math.floor(rnd() * 3) : 3,
			(x, y) => y < rockTop(x) - 0.04 && y > -0.46,
		);
		/* The crust: a slab along the surface with a front lip, green drips and a few tufts at the lane's edges. */
		m.quad([-0.5, sl, zf], [0.5, sr, zf], [0.5, sr, -half], [-0.5, sl, -half], palette.crustTop);
		m.quad([-0.5, lowL, zf], [0.5, lowR, zf], [0.5, sr, zf], [-0.5, sl, zf], palette.crustFront);
		m.quad(
			[-0.5, lowL, -half],
			[-0.5, lowL, zf],
			[-0.5, sl, zf],
			[-0.5, sl, -half],
			palette.crustDark,
		);
		m.quad([0.5, lowR, zf], [0.5, lowR, -half], [0.5, sr, -half], [0.5, sr, zf], palette.crustDark);
		for (let i = 0, n = 3 + Math.floor(rnd() * 4); i < n; i++) {
			const w = 0.07 + rnd() * 0.07,
				x = -0.46 + rnd() * (0.92 - w),
				top = Math.min(under(x), under(x + w)) + 0.03,
				bottom = Math.max(-0.47, top - 0.08 - rnd() * 0.18);
			if (top - bottom < 0.04) continue;
			m.box(x, bottom, half - 0.02, x + w, top, zf + 0.01, palette.crustFront, {
				back: false,
				top: false,
				bottom: false,
			});
		}
		for (let i = 0, n = 2 + Math.floor(rnd() * 3); i < n; i++) {
			const x = -0.36 + rnd() * 0.72,
				r = 0.04 + rnd() * 0.04,
				z = rnd() < 0.5 ? -half + 0.1 + rnd() * 0.5 : 1.1 + rnd() * 0.3,
				y = surfaceY(hl, hr, x) - 0.01,
				colour = rnd() < 0.5 ? palette.crustTop : palette.crustFront;
			m.pyramid(
				[
					[x - r, y, z + r],
					[x + r, y, z + r],
					[x + r, y, z - r],
					[x - r, y, z - r],
				],
				[x, y + 0.08 + rnd() * 0.12, z],
				[colour, shade(colour, 0.85), shade(colour, 0.7), shade(colour, 0.95)],
			);
		}
		return m.build();
	});
}

/** The flat grassy top tile. */
export function topGeometry(variant: number): THREE.BufferGeometry {
	return crustTile(1, 1, `top${variant}`, 2000 + variant * 17);
}

/** One of the six slope tiles. */
export function slopeGeometry(shape: SlopeName, variant: number): THREE.BufferGeometry {
	const [hl, hr] = slopeHeights[shape];
	return crustTile(hl, hr, `${shape}${variant}`, 3000 + variant * 13 + shape.length * 101 + hl * 7);
}

/** The surface height of a slope shape at local x in 0..1, as a fraction of the tile (the game's collision rule). */
export function slopeSurface(shape: SlopeName, lx: number): number {
	const [hl, hr] = slopeHeights[shape];
	return hl + (hr - hl) * lx;
}

/** A chiselled magenta block with a raised panel, pale bevel edges and corner studs. */
export function blockGeometry(): THREE.BufferGeometry {
	return cached('block', () => {
		const m = new Mesher(),
			z = half;
		m.box(
			-0.5,
			-0.5,
			-half,
			0.5,
			0.5,
			half,
			{ top: palette.blockTop, front: palette.blockFront, side: palette.blockBody },
			{ back: false, bottom: false },
		);
		m.box(-0.5, -0.5, z, -0.44, 0.5, z + 0.03, palette.blockEdge, { back: false, bottom: false });
		m.box(-0.5, 0.44, z, 0.5, 0.5, z + 0.03, palette.blockEdge, { back: false, bottom: false });
		m.box(-0.34, -0.34, z, 0.34, 0.34, z + 0.07, palette.blockPanel, {
			back: false,
			bottom: false,
		});
		m.box(-0.2, -0.2, z + 0.07, 0.2, 0.2, z + 0.09, palette.blockBody, {
			back: false,
			bottom: false,
		});
		for (const sx of [-1, 1])
			for (const sy of [-1, 1]) {
				const cx = sx * 0.4,
					cy = sy * 0.4,
					r = 0.045;
				m.pyramid(
					[
						[cx - r, cy - r, z],
						[cx + r, cy - r, z],
						[cx + r, cy + r, z],
						[cx - r, cy + r, z],
					],
					[cx, cy, z + 0.05],
					[palette.blockEdge, palette.blockPanel, palette.blockBody, palette.blockPanel],
				);
			}
		return m.build();
	});
}

/** The one-way ledge: a cyan-capped slab on little teal feet, with studs on its front. */
export function platformGeometry(): THREE.BufferGeometry {
	return cached('plat', () => {
		const m = new Mesher(),
			zl = 1.25,
			zb = -1.25;
		m.box(
			-0.5,
			0.31,
			zb,
			0.5,
			0.5,
			zl,
			{ top: palette.cyan, front: palette.cyanDark, side: palette.cyan },
			{
				back: false,
				bottom: false,
			},
		);
		m.box(
			-0.5,
			0.12,
			zb,
			0.5,
			0.31,
			zl - 0.04,
			{ top: palette.ledge, front: palette.ledge, side: palette.ledge },
			{
				back: false,
				top: false,
			},
		);
		for (const x of [-0.375, -0.125, 0.125, 0.375]) {
			const r = 0.055,
				y = 0.215,
				z = zl - 0.04;
			m.pyramid(
				[
					[x - r, y - r, z],
					[x + r, y - r, z],
					[x + r, y + r, z],
					[x - r, y + r, z],
				],
				[x, y, z + 0.05],
				[palette.ledgeStud, palette.ledge, shade(palette.ledge, 0.7), palette.ledge],
			);
		}
		for (const x of [-0.3, 0.3])
			for (const z of [zb + 0.2, zl - 0.25])
				m.box(x - 0.05, 0, z - 0.05, x + 0.05, 0.12, z + 0.05, palette.teal, {
					top: false,
					bottom: false,
				});
		return m.build();
	});
}
