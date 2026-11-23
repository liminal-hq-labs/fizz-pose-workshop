// Geometry for the crater ground: a face of small stones, a lipped grassy crust, blocks of bricks, slopes and one-way ledges of planks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { depth } from '../toon.ts';
import { blockMasonry, type BlockSides } from './bricks.ts';
import { lattice, noise2, rng } from './hash.ts';
import { Mesher, mix, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';
import { rockFace, stoneRelief } from './stones.ts';
import { enclosed, type Surroundings, type TileShape } from './surroundings.ts';

/** How many look-alike variants each kind of default tile has; a tile picks one by hashing its position. */
export const variantCount = 8;

/** Half the depth of the ground strip: terrain runs from -half to +half in Z. */
export const half = depth.lane / 2;
/** Half the depth of a floating ledge or block. */
export const shelfHalf = depth.shelf / 2;
/** The vertical thickness of the grassy crust. */
const crustDepth = 0.2;
/** How far the crust's front lip stands out from the rock face. */
const lipOut = 0.06;
/** How far back from the front edge the flat top gives way to the lip's bevel. */
const bevelSpan = 0.07;
/** Where the ground's surface is flat enough to walk on: details that stand above it stay outside |z| < this. */
export const walkBand = 0.55;
/** How far below the crust's edge the rock is in the shadow of its lip. */
const lipShadow = 0.14;
/** The height above the face at which boulders and gems sit: on top of the stones, which reach `stoneRelief`. */
const studBase = half + 0.02;

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

function smooth(t: number): number {
	const c = Math.min(1, Math.max(0, t));
	return c * c * (3 - 2 * c);
}

/** A gem set on the rock: a small faceted pyramid, lit on its top and left. */
function gem(
	m: Mesher,
	x: number,
	y: number,
	rx: number,
	ry: number,
	d: number,
	colour: number,
): void {
	const z = studBase;
	m.pyramid(
		[
			[x - rx, y - ry, z],
			[x + rx, y - ry, z],
			[x + rx, y + ry, z],
			[x - rx, y + ry, z],
		],
		[x - rx * 0.15, y + ry * 0.15, z + d],
		[shade(colour, 0.62), shade(colour, 0.85), shade(colour, 1.3), shade(colour, 1.12)],
	);
}

const gemColours = [
	palette.rockPink,
	palette.rockPink,
	palette.rockNavy,
	palette.rockNavy,
	palette.crystalLight,
] as const;

/** A rounded cobble standing out of the rock face, lit from the upper left, with a dark crevice round it. */
function boulder(m: Mesher, cx: number, cy: number, rx: number, ry: number, base: number): void {
	const n = 6,
		d = 0.03 + rx * 0.12,
		ring = (scale: number, z: number): V3[] =>
			Array.from({ length: n }, (_, k) => {
				const a = (k / n) * Math.PI * 2;
				return [cx + Math.cos(a) * rx * scale, cy + Math.sin(a) * ry * scale, z] as const;
			}),
		crevice = ring(1.1, studBase),
		outer = ring(1, studBase + 0.008),
		inner = ring(0.58, studBase + d * 0.7),
		apex: V3 = [cx - rx * 0.06, cy + ry * 0.08, studBase + d];
	for (let k = 0; k < n; k++) {
		const l = (k + 1) % n;
		m.quad(crevice[k], crevice[l], outer[l], outer[k], shade(palette.rockDark, 0.5));
		const a = ((k + 0.5) / n) * Math.PI * 2,
			lit = -Math.cos(a) * 0.55 + Math.sin(a) * 0.8,
			c = shade(base, 0.74 + 0.3 * (lit * 0.5 + 0.5));
		m.quadC(outer[k], outer[l], inner[l], inner[k], shade(c, 0.85), shade(c, 0.85), c, c);
		m.tri(inner[k], inner[l], apex, shade(c, 1.18));
	}
}

/** Gems and, now and then, a cobble or two on a rock face. */
function faceStuds(
	m: Mesher,
	col: number,
	row: number,
	under: (x: number) => number,
	boulders: boolean,
): void {
	const rnd = rng(Math.imul(col, 7349) ^ Math.imul(row, 1291) ^ 0x5bd1),
		top = under(0),
		placedBoulders: { x: number; y: number; rx: number; ry: number }[] = [];
	for (let b = 0; boulders && b < 2; b++) {
		if (lattice(col, row, 70 + b) >= (b === 0 ? (top > 0.4 ? 0.3 : 0.22) : 0.1)) continue;
		const rx = 0.1 + rnd() * 0.09,
			ry = rx * (0.62 + rnd() * 0.2),
			x = (rnd() - 0.5) * (0.9 - 2 * rx),
			high = Math.min(top - 0.1, 0.38) - ry,
			low = -0.46 + ry,
			y = low + rnd() * Math.max(0, high - low),
			c = shade(palette.rockLight, 0.95 + rnd() * 0.3);
		if (y + ry > top - 0.08) continue;
		if (placedBoulders.some((o) => Math.abs(o.x - x) < o.rx + rx && Math.abs(o.y - y) < o.ry + ry))
			continue;
		placedBoulders.push({ x, y, rx, ry });
		boulder(m, x, y, rx, ry, c);
	}
	for (
		let placed = 0, tries = 0, want = 1 + Math.floor(rnd() * 3);
		placed < want && tries < 40;
		tries++
	) {
		const x = -0.4 + rnd() * 0.8,
			y = -0.42 + rnd() * 0.84,
			rx = 0.03 + rnd() * 0.025,
			ry = rx * (0.8 + rnd() * 0.5);
		if (y + ry > under(x) - 0.1 || y + ry > under(x - rx) - 0.1 || y + ry > under(x + rx) - 0.1)
			continue;
		if (
			placedBoulders.some(
				(o) => ((x - o.x) / (o.rx * 1.3)) ** 2 + ((y - o.y) / (o.ry * 1.3)) ** 2 < 1,
			)
		)
			continue;
		placed++;
		gem(m, x, y, rx, ry, 0.02 + rnd() * 0.025, gemColours[Math.floor(rnd() * gemColours.length)]);
	}
}

/** The grass colour at a point of a tile's top: soft patches of lighter and darker green, darkened where a wall or the far edge shades it. */
function grassColour(wx: number, x: number, z: number, aoL: number, aoR: number): number {
	const broad = noise2((wx + x) * 0.7, z * 1.1 + 3, 5),
		clump = noise2((wx + x) * 2.6, z * 3.4 + 9, 7),
		patch = smooth((0.65 * broad + 0.35 * clump - 0.3) / 0.45),
		dark = shade(palette.crustTop, 0.72),
		bright = mix(palette.crustTop, palette.crustLight, 0.55);
	let colour = mix(dark, bright, patch);
	/* The far edge sits in the shade of the rock behind, the near edge catches the light. */
	colour = shade(colour, 0.78 + 0.22 * smooth((z + half) / 0.5));
	const wall = Math.max(aoL * (1 - smooth((x + 0.5) / 0.42)), aoR * (1 - smooth((0.5 - x) / 0.42)));
	return shade(colour, 1 - 0.42 * wall);
}

/** Blades, pebbles, sprinkles and flowers on the crust, kept to the near and far edges so the walking strip stays clear. */
function topDetails(m: Mesher, col: number, row: number, surf: (x: number) => number): void {
	const zFront = half - bevelSpan - 0.03,
		zone = (h1: number, h2: number): number =>
			h1 < 0.6
				? -half + 0.05 + h2 * (half - walkBand - 0.08)
				: walkBand + 0.03 + h2 * (zFront - walkBand - 0.03),
		clusters = 6;
	for (let j = 0; j < clusters; j++) {
		const key = clusters * col + j,
			xc = -0.4 + (j * 0.8) / (clusters - 1) + (lattice(key, row, 99) - 0.5) * 0.04,
			back = lattice(key, row, 100) < 0.8,
			front = lattice(key, row, 101) < 0.35;
		/* Blades run from ankle to shin height at the back of the strip and a little lower at its front. */
		for (const [on, z, low, span] of [
			[back, -half + 0.05 + lattice(key, row, 102) * 0.14, 0.08, 0.09],
			[front, zFront - 0.04 - lattice(key, row, 103) * 0.06, 0.07, 0.06],
		] as const) {
			if (!on) continue;
			for (let b = -1; b <= 1; b++) {
				const x = xc + b * 0.03,
					h = (low + lattice(key * 3 + b, row, 104) * span) * (b === 0 ? 1.1 : 1),
					lean = (lattice(key * 3 + b, row, 105) - 0.5) * 0.05,
					y = surf(x) - 0.004;
				m.triC(
					[x - 0.015, y, z],
					[x + 0.015, y, z],
					[x + lean, y + h, z],
					palette.crustFront,
					palette.crustFront,
					palette.crustLight,
				);
			}
		}
	}
	const rnd = rng(Math.imul(col, 4919) ^ Math.imul(row, 3221) ^ 0x1f3a),
		spot = (): [number, number] => {
			const x = -0.38 + rnd() * 0.76;
			return [x, zone(rnd(), rnd())];
		};
	for (
		let p = 0,
			pebbles = lattice(col, row, 110) < 0.3 ? 1 + (lattice(col, row, 111) < 0.3 ? 1 : 0) : 0;
		p < pebbles;
		p++
	) {
		const [x, z] = spot(),
			r = 0.025 + rnd() * 0.025,
			y = surf(x) - 0.01,
			c = shade(palette.pebble, 0.85 + rnd() * 0.25);
		m.pyramid(
			[
				[x - r, y, z + r * 0.8],
				[x + r, y, z + r * 0.8],
				[x + r * 0.8, y, z - r],
				[x - r, y, z - r * 0.8],
			],
			[x + (rnd() - 0.5) * r, y + r * 0.8, z],
			[shade(c, 0.9), shade(c, 0.7), shade(c, 1.2), shade(c, 1.05)],
		);
	}
	if (lattice(col, row, 120) < 0.22) {
		const sprinkles = [palette.cyan, palette.sprinkleYellow, palette.white, palette.rockPink];
		for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
			const [x, z] = spot(),
				alongX = rnd() < 0.5,
				c = sprinkles[Math.floor(rnd() * sprinkles.length)],
				y = surf(x) - 0.012;
			if (alongX)
				m.box(x - 0.03, y, z - 0.009, x + 0.03, y + 0.022, z + 0.009, c, {
					back: false,
					bottom: false,
				});
			else
				m.box(x - 0.009, y, z - 0.03, x + 0.009, y + 0.022, z + 0.03, c, {
					back: false,
					bottom: false,
				});
		}
	}
	if (lattice(col, row, 130) < 0.12) {
		const [x, z] = spot(),
			y = surf(x) - 0.004,
			head = [palette.rockPink, palette.sprinkleYellow, palette.cyan][Math.floor(rnd() * 3)];
		m.tri([x - 0.01, y, z], [x + 0.01, y, z], [x, y + 0.09, z], palette.crustDark);
		const r = 0.03,
			cy = y + 0.1;
		m.pyramid(
			[
				[x - r, cy, z + r],
				[x + r, cy, z + r],
				[x + r, cy, z - r],
				[x - r, cy, z - r],
			],
			[x, cy + 0.025, z],
			[shade(head, 0.8), shade(head, 0.95), shade(head, 1.2), shade(head, 1.05)],
		);
	}
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
			? mix(lit, palette.crevice, 0.8 * (1 - Math.max(0, below) / lipShadow))
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
		joint: palette.crevice,
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
				joint: shade(palette.crevice, 0.8),
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
					palette.crustDark,
					palette.crustDark,
					shade(palette.crustFront, 0.9),
					shade(palette.crustFront, 0.9),
				);
			else
				m.quadC(
					[x, a, zf],
					[x, a, -half],
					[x, b, -half],
					[x, b, zf],
					palette.crustDark,
					palette.crustDark,
					shade(palette.crustFront, 0.9),
					shade(palette.crustFront, 0.9),
				);
		}
	}
	faceStuds(m, col, row, under, !crust || (hl === 1 && hr === 1));
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
					c = (x: number, z: number): number => grassColour(wx, x, z, aoL, aoR);
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
			lit = mix(palette.crustTop, palette.crustLight, 0.65);
		/* The lip: a bevel rolling off the top, then the lip face. */
		m.quadC(
			[xl, low(xl), zf],
			[xr, low(xr), zf],
			[xr, surf(xr), zt],
			[xl, surf(xl), zt],
			palette.crustTop,
			palette.crustTop,
			lit,
			lit,
		);
		m.quadC(
			[xl, under(xl), zf],
			[xr, under(xr), zf],
			[xr, low(xr), zf],
			[xl, low(xl), zf],
			shade(palette.crustFront, 0.85),
			shade(palette.crustFront, 0.85),
			palette.crustFront,
			palette.crustFront,
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
					deep = shade(palette.crustFront, 0.72);
				m.quadC(
					[xa, ya, zf],
					[xb, yb, zf],
					[xb, under(xb), zf],
					[xa, under(xa), zf],
					deep,
					deep,
					palette.crustFront,
					palette.crustFront,
				);
			}
		}
		topDetails(m, col, row, surf);
	}
	return m.build();
}

const defaultColumn = (variant: number): number => 100 + variant * 3;

/** A fill tile for a variant, as it stands inside a run of rock. */
export function fillGeometry(variant: number): THREE.BufferGeometry {
	const shape = { hl: 1, hr: 1, crust: false };
	return cached(`fill${variant}`, () =>
		groundTile(shape, defaultColumn(variant) + 0.5, 0.5, enclosed(shape)),
	);
}

/** The flat grassy top tile for a variant, as it stands inside a run of ground. */
export function topGeometry(variant: number): THREE.BufferGeometry {
	const shape = { hl: 1, hr: 1, crust: true };
	return cached(`top${variant}`, () =>
		groundTile(shape, defaultColumn(variant) + 0.5, 0.5, enclosed(shape)),
	);
}

/** One of the six slope tiles for a variant. */
export function slopeGeometry(name: SlopeName, variant: number): THREE.BufferGeometry {
	const [hl, hr] = slopeHeights[name],
		shape = { hl, hr, crust: true };
	return cached(`${name}${variant}`, () =>
		groundTile(shape, defaultColumn(variant) + 0.5, 0.5, enclosed(shape)),
	);
}

/** The surface height of a slope shape at local x in 0..1, as a fraction of the tile (the game's collision rule). */
export function slopeSurface(shape: SlopeName, lx: number): number {
	const [hl, hr] = slopeHeights[shape];
	return hl + (hr - hl) * lx;
}

/**
 * A candy block built from small bricks. It fills its cell: the top is at the cell's top and the sides on its edges.
 * Resting on ground it is as deep as the lane; floating it is a shelf's depth. With `at`, the tile's centre, the bricks are
 * laid by world position, so the joints run on through neighbouring blocks, and `sides` says which ends are open; without
 * it the block is a default tile with both ends open.
 */
export function blockTile(
	resting: boolean,
	at?: { x: number; y: number },
	sides: BlockSides = { leftH: 0, rightH: 0 },
): THREE.BufferGeometry {
	if (at) return blockMasonry(resting, at.x, at.y, sides);
	return cached(resting ? 'block' : 'blockFloating', () =>
		blockMasonry(resting, defaultColumn(0) + 0.5, 0.5, sides),
	);
}

export function blockGeometry(): THREE.BufferGeometry {
	return blockTile(true);
}

/** How many planks a ledge has to a tile, and how far each stands in from its joints. */
const planks = 2;
const plankGap = 0.01;

/**
 * The one-way ledge, as drawn: a cyan-capped teal slab 0.3 tall hanging from the top of its cell, a violet line under it and
 * small feet, 0.375 in all, cut into planks half a tile long with a dark joint between them. The slab is a shelf deep and
 * its ends sit exactly on the cell's edges. `wx` and `wy` are the tile's centre, which tint the planks.
 */
export function platformTile(wx: number, wy: number): THREE.BufferGeometry {
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

/** The default ledge tile, as it stands inside a run of ledge. */
export function platformGeometry(): THREE.BufferGeometry {
	return cached('plat', () => platformTile(defaultColumn(0) + 0.5, 0.5));
}
