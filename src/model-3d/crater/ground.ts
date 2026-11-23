// Geometry for the ground of every world: a face of small stones, a lipped crust, blocks of bricks, slopes and one-way ledges, as the theme dresses them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { blockMasonry, type BlockSides } from './bricks.ts';
import { craterTheme } from './crater-theme.ts';
import {
	bevelSpan,
	crustDepth,
	half,
	lipOut,
	lipShadow,
	shelfHalf,
	variantCount,
	walkBand,
} from './dims.ts';
import { lattice } from './hash.ts';
import { Mesher, mix, shade } from './mesher.ts';
import { rockFace, stoneRelief } from './stones.ts';
import { enclosed, type Surroundings, type TileShape } from './surroundings.ts';
import type { GroundTheme } from './theme.ts';

export { half, shelfHalf, variantCount, walkBand };

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

/**
 * One ground tile, built for its place in the level. `shape` gives the surface: the flat top tile is `hl = hr = 1`, rock
 * with no crust is a fill tile. Edge heights are exact, because Ben walks on them; the crust's lip and every detail stand
 * out only in Z or above the surface at its near and far edges, never beyond the tile's own cell in X. `s` says what the
 * neighbours are, so side faces appear only where the tile ends a run, and walls shade the ground at their foot. The rock
 * face is laid in small stones by world position, so its courses and joints run on across neighbouring tiles.
 */
export function groundTile(
	shape: TileShape,
	wx: number,
	wy: number,
	s: Surroundings,
	theme: GroundTheme = craterTheme,
): THREE.BufferGeometry {
	const m = new Mesher(),
		col = Math.floor(wx),
		row = Math.floor(wy),
		{ hl, hr, crust } = shape,
		sl = -0.5 + hl,
		sr = -0.5 + hr,
		surf = (x: number): number => sl + (sr - sl) * (x + 0.5),
		under = (x: number): number => (crust ? Math.max(-0.5, surf(x) - crustDepth) : 0.5),
		/* The edge of the rock under the crust, before it is cut off at the foot of the cell. */
		edge = (x: number): number => (crust ? surf(x) - crustDepth : 0.5),
		zf = half + lipOut;
	/* The rock lit by how far it is below the crust, and in the shadow of the lip just under it. */
	const tone = (colour: number, u: number, v: number): number => {
		if (!crust) return shade(colour, 0.86);
		const below = edge(u) - v,
			lit = shade(colour, 1.02 - 0.28 * Math.min(1, Math.max(0, below / 0.8)));
		return below < lipShadow
			? mix(lit, theme.crevice, 0.8 * (1 - Math.max(0, below) / lipShadow))
			: lit;
	};
	rockFace(m, {
		map: (u, v, w) => [u, v, half + w],
		u0: -0.5,
		u1: 0.5,
		v0: -0.5,
		t0: edge(-0.5),
		t1: edge(0.5),
		originU: wx,
		originV: wy,
		face: 0,
		joint: theme.crevice,
		colour: theme.stoneColour,
		tone,
		bevelled: 'lit',
	});
	/* Side faces, where the tile ends a run or stands above its neighbour. */
	for (const side of [-1, 1] as const) {
		const edgeH = side < 0 ? hl : hr,
			other = side < 0 ? s.leftH : s.rightH;
		if (edgeH - other < 0.02) continue;
		const x = side * 0.5,
			y0 = -0.5 + other,
			y1 = -0.5 + edgeH,
			yc = crust ? Math.max(y0, y1 - crustDepth) : y1;
		if (yc - y0 > 1e-4)
			rockFace(m, {
				map:
					side < 0
						? (u, v, w) => [x + (stoneRelief - w), v, u]
						: (u, v, w) => [x - (stoneRelief - w), v, -u],
				u0: -half,
				u1: half,
				v0: y0,
				t0: yc,
				t1: yc,
				originU: wx * 0.731,
				originV: wy,
				face: side < 0 ? 1 : 2,
				joint: shade(theme.crevice, 0.8),
				colour: theme.stoneColour,
				tone: (colour) => shade(colour, 0.7),
				bevelled: 'lit',
			});
		if (crust && y1 - yc > 1e-4) {
			const a = yc,
				b = y1;
			if (side < 0)
				m.quadC(
					[x, a, -half],
					[x, a, zf],
					[x, b, zf],
					[x, b, -half],
					theme.crust.dark,
					theme.crust.dark,
					shade(theme.crust.front, 0.9),
					shade(theme.crust.front, 0.9),
				);
			else
				m.quadC(
					[x, a, zf],
					[x, a, -half],
					[x, b, -half],
					[x, b, zf],
					theme.crust.dark,
					theme.crust.dark,
					shade(theme.crust.front, 0.9),
					shade(theme.crust.front, 0.9),
				);
		}
	}
	theme.studs(m, col, row, under, !crust || (hl === 1 && hr === 1));
	if (crust) {
		const zt = half - bevelSpan,
			aoL = s.wallL ? 1 : 0,
			aoR = s.wallR ? 1 : 0,
			nx = 8,
			nz = 4,
			xAt = (i: number): number => -0.5 + i / nx,
			zAt = (j: number): number => -half + (j * (zt + half)) / nz;
		for (let i = 0; i < nx; i++)
			for (let j = 0; j < nz; j++) {
				const [x0, x1, z0, z1] = [xAt(i), xAt(i + 1), zAt(j), zAt(j + 1)],
					c = (x: number, z: number): number => theme.crustColour(wx, x, z, aoL, aoR);
				m.quadC(
					[x0, surf(x0), z1],
					[x1, surf(x1), z1],
					[x1, surf(x1), z0],
					[x0, surf(x0), z0],
					c(x0, z1),
					c(x1, z1),
					c(x1, z0),
					c(x0, z0),
				);
			}
		const low = (x: number): number => Math.max(-0.5, surf(x) - bevelSpan),
			xl = -0.5,
			xr = 0.5,
			lit = mix(theme.crust.top, theme.crust.light, 0.65);
		/* The lip: a bevel rolling off the top, then the lip face. */
		m.quadC(
			[xl, low(xl), zf],
			[xr, low(xr), zf],
			[xr, surf(xr), zt],
			[xl, surf(xl), zt],
			theme.crust.top,
			theme.crust.top,
			lit,
			lit,
		);
		m.quadC(
			[xl, under(xl), zf],
			[xr, under(xr), zf],
			[xr, low(xr), zf],
			[xl, low(xl), zf],
			shade(theme.crust.front, 0.85),
			shade(theme.crust.front, 0.85),
			theme.crust.front,
			theme.crust.front,
		);
		/* Drips hang below the lip as thin rounded tongues of green, in slots that line up from tile to tile. */
		const slots = 8,
			slotWidth = 1 / slots;
		for (let slot = 0; slot < slots; slot++) {
			const len = 0.04 + 0.13 * lattice(slots * col + slot, row, 90) ** 1.6;
			if (len < 0.05) continue;
			const x0 = -0.5 + slot * slotWidth + 0.012,
				steps = 3;
			for (let j = 0; j < steps; j++) {
				const t0 = j / steps,
					t1 = (j + 1) / steps,
					xa = x0 + (slotWidth - 0.024) * t0,
					xb = x0 + (slotWidth - 0.024) * t1,
					round = (t: number): number => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
					ya = Math.max(-0.5, under(xa) - len * round(t0)),
					yb = Math.max(-0.5, under(xb) - len * round(t1)),
					deep = shade(theme.crust.front, 0.72);
				m.quadC(
					[xa, ya, zf],
					[xb, yb, zf],
					[xb, under(xb), zf],
					[xa, under(xa), zf],
					deep,
					deep,
					theme.crust.front,
					theme.crust.front,
				);
			}
		}
		theme.dress(m, col, row, surf);
	}
	return m.build();
}

const defaultColumn = (variant: number): number => 100 + variant * 3;

/** A fill tile for a variant, as it stands inside a run of rock. */
export function fillGeometry(
	variant: number,
	theme: GroundTheme = craterTheme,
): THREE.BufferGeometry {
	const shape = { hl: 1, hr: 1, crust: false };
	return cached(`${theme.name}:fill${variant}`, () =>
		groundTile(shape, defaultColumn(variant) + 0.5, 0.5, enclosed(shape), theme),
	);
}

/** The flat crusted top tile for a variant, as it stands inside a run of ground. */
export function topGeometry(
	variant: number,
	theme: GroundTheme = craterTheme,
): THREE.BufferGeometry {
	const shape = { hl: 1, hr: 1, crust: true };
	return cached(`${theme.name}:top${variant}`, () =>
		groundTile(shape, defaultColumn(variant) + 0.5, 0.5, enclosed(shape), theme),
	);
}

/** One of the six slope tiles for a variant. */
export function slopeGeometry(
	name: SlopeName,
	variant: number,
	theme: GroundTheme = craterTheme,
): THREE.BufferGeometry {
	const [hl, hr] = slopeHeights[name],
		shape = { hl, hr, crust: true };
	return cached(`${theme.name}:${name}${variant}`, () =>
		groundTile(shape, defaultColumn(variant) + 0.5, 0.5, enclosed(shape), theme),
	);
}

/** The surface height of a slope shape at local x in 0..1, as a fraction of the tile (the game's collision rule). */
export function slopeSurface(shape: SlopeName, lx: number): number {
	const [hl, hr] = slopeHeights[shape];
	return hl + (hr - hl) * lx;
}

/**
 * A block built from small bricks. It fills its cell: the top is at the cell's top and the sides on its edges.
 * Resting on ground it is as deep as the lane; floating it is a shelf's depth. With `at`, the tile's centre, the bricks are
 * laid by world position, so the joints run on through neighbouring blocks, and `sides` says which ends are open; without
 * it the block is a default tile with both ends open.
 */
export function blockTile(
	resting: boolean,
	at?: { x: number; y: number },
	sides: BlockSides = { leftH: 0, rightH: 0 },
	theme: GroundTheme = craterTheme,
): THREE.BufferGeometry {
	if (at) return blockMasonry(resting, at.x, at.y, sides, theme.block);
	return cached(`${theme.name}:${resting ? 'block' : 'blockFloating'}`, () =>
		blockMasonry(resting, defaultColumn(0) + 0.5, 0.5, sides, theme.block),
	);
}

export function blockGeometry(theme: GroundTheme = craterTheme): THREE.BufferGeometry {
	return blockTile(true, undefined, undefined, theme);
}

/** The one-way ledge, as the crater draws it: planks. `wx` and `wy` are the tile's centre. */
export function platformTile(wx: number, wy: number): THREE.BufferGeometry {
	return craterTheme.ledge(wx, wy, enclosedLedge);
}

const enclosedLedge: Surroundings = {
	leftH: 0,
	rightH: 0,
	wallL: false,
	wallR: false,
	below: false,
	joinL: true,
	joinR: true,
};

/** The default ledge tile, as it stands inside a run of ledge. */
export function platformGeometry(theme: GroundTheme = craterTheme): THREE.BufferGeometry {
	return cached(`${theme.name}:plat`, () =>
		theme.ledge(defaultColumn(0) + 0.5, 0.5, enclosedLedge),
	);
}
