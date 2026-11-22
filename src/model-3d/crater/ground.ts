// Geometry for the crater ground: strata-banded rock, a lipped grassy crust, blocks, slopes and one-way ledges.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { depth } from '../toon.ts';
import { lattice, noise2, rng } from './hash.ts';
import { Mesher, mix, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';
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

const strataBases = [
	palette.rock,
	shade(palette.rockDark, 0.9),
	shade(palette.rockLight, 1.1),
	palette.rock,
] as const;

/** The base colour of a rock stratum: the same for every tile of a row, so bands run along a whole stretch of ground. */
export function strataColour(row: number, band: number): number {
	return strataBases[Math.floor(lattice(row, band, 50) * strataBases.length)];
}

function smooth(t: number): number {
	const c = Math.min(1, Math.max(0, t));
	return c * c * (3 - 2 * c);
}

/**
 * The front face of the rock below `under(x)`, in three strata bands whose edges run on across neighbouring tiles. Each band
 * is lit lighter at its top and darker at its base, and stands a little proud of the band above or below it, so the face
 * reads as a few large stacked slabs instead of noise.
 */
function strata(
	m: Mesher,
	col: number,
	row: number,
	under: (x: number) => number,
	shadowed: boolean,
): void {
	const xs = [-0.5, 0, 0.5],
		lines: number[][] = [xs.map((x) => under(x))],
		raws = [0.06 + (lattice(row, 0, 41) - 0.5) * 0.16, -0.27 + (lattice(row, 0, 42) - 0.5) * 0.12];
	for (let k = 1; k <= 2; k++)
		lines.push(
			xs.map((x, i) => {
				const wobble = (lattice(2 * col + 1 + 2 * x, row, 43 + k) - 0.5) * 0.08;
				return Math.max(-0.5, Math.min(lines[k - 1][i], raws[k - 1] + wobble));
			}),
		);
	lines.push(xs.map(() => -0.5));
	const out = [0, 1, 2].map((k) => lattice(row, k, 70) * 0.035),
		light = [1.18, 1, 0.86],
		dark = [0.8, 0.7, 0.6],
		colourOf = (k: number): number =>
			shade(strataColour(row, k), (0.96 + 0.08 * lattice(col, row, 60 + k)) * light[k]);
	for (let k = 0; k < 3; k++) {
		const base = colourOf(k),
			z = half + out[k];
		for (let i = 0; i < 2; i++) {
			const [x0, x1] = [xs[i], xs[i + 1]],
				t0 = lines[k][i],
				t1 = lines[k][i + 1],
				b0 = lines[k + 1][i],
				b1 = lines[k + 1][i + 1];
			if (t0 - b0 < 1e-4 && t1 - b1 < 1e-4) continue;
			const low = shade(base, dark[k] / light[k]);
			if (k === 0 && shadowed) {
				/* The lip's shadow: dark under the crust, easing to the band's colour. */
				const m0 = Math.max(b0, t0 - 0.11),
					m1 = Math.max(b1, t1 - 0.11);
				m.quadC(
					[x0, m0, z],
					[x1, m1, z],
					[x1, t1, z],
					[x0, t0, z],
					base,
					base,
					palette.crevice,
					palette.crevice,
				);
				m.quadC([x0, b0, z], [x1, b1, z], [x1, m1, z], [x0, m0, z], low, low, base, base);
			} else m.quadC([x0, b0, z], [x1, b1, z], [x1, t1, z], [x0, t0, z], low, low, base, base);
		}
		if (k === 2) continue;
		/* The step between this band and the next: a lit ledge where the lower one stands proud, a shadow where it is set back. */
		const zA = z,
			zB = half + out[k + 1];
		if (Math.abs(zB - zA) < 0.008) continue;
		for (let i = 0; i < 2; i++) {
			const [x0, x1] = [xs[i], xs[i + 1]],
				y0 = lines[k + 1][i],
				y1 = lines[k + 1][i + 1];
			if (zB > zA)
				m.quad(
					[x0, y0, zA],
					[x0, y0, zB],
					[x1, y1, zB],
					[x1, y1, zA],
					shade(colourOf(k + 1), 1.25),
				);
			else m.quad([x0, y0, zB], [x1, y1, zB], [x1, y1, zA], [x0, y0, zA], shade(colourOf(k), 0.55));
		}
	}
}

/** A gem set into the rock: a small faceted pyramid, lit on its top and left. */
function gem(
	m: Mesher,
	x: number,
	y: number,
	rx: number,
	ry: number,
	d: number,
	colour: number,
): void {
	const z = half + 0.004;
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

/** A rounded boulder standing out of the rock face, lit from the upper left, with a dark crevice round it. */
function boulder(m: Mesher, cx: number, cy: number, rx: number, ry: number, base: number): void {
	const n = 8,
		d = 0.1 + rx * 0.12,
		ring = (scale: number, z: number): V3[] =>
			Array.from({ length: n }, (_, k) => {
				const a = (k / n) * Math.PI * 2;
				return [cx + Math.cos(a) * rx * scale, cy + Math.sin(a) * ry * scale, z] as const;
			}),
		crevice = ring(1.1, half + 0.004),
		outer = ring(1, half + 0.012),
		inner = ring(0.58, half + d * 0.7),
		apex: V3 = [cx - rx * 0.06, cy + ry * 0.08, half + d];
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

/** Gems and, now and then, a boulder on a rock face. */
function faceStuds(
	m: Mesher,
	col: number,
	row: number,
	under: (x: number) => number,
	boulders: boolean,
): void {
	const rnd = rng(Math.imul(col, 7349) ^ Math.imul(row, 1291) ^ 0x5bd1),
		top = under(0);
	let bx = 0,
		by = 0,
		bw = 0,
		bh = 0;
	if (boulders && lattice(col, row, 70) < (top > 0.4 ? 0.22 : 0.14)) {
		bw = 0.3 + rnd() * 0.16;
		bh = 0.18 + rnd() * 0.09;
		bx = (rnd() - 0.5) * (0.9 - 2 * bw);
		const high = Math.min(top - 0.1, 0.38) - bh,
			low = -0.46 + bh;
		by = low + rnd() * Math.max(0, high - low);
		if (by + bh > top - 0.08) bw = 0;
		else
			boulder(
				m,
				bx,
				by,
				bw,
				bh,
				shade(strataColour(row, 3 + Math.floor(rnd() * 2)), 1.12 + rnd() * 0.2),
			);
	}
	for (
		let placed = 0, tries = 0, want = Math.floor(rnd() * 3);
		placed < want && tries < 40;
		tries++
	) {
		const x = -0.4 + rnd() * 0.8,
			y = -0.42 + rnd() * 0.84,
			rx = 0.05 + rnd() * 0.05,
			ry = rx * (0.8 + rnd() * 0.5);
		if (y + ry > under(x) - 0.1 || y + ry > under(x - rx) - 0.1 || y + ry > under(x + rx) - 0.1)
			continue;
		if (bw > 0 && ((x - bx) / (bw * 1.25)) ** 2 + ((y - by) / (bh * 1.25)) ** 2 < 1) continue;
		placed++;
		gem(m, x, y, rx, ry, 0.04 + rnd() * 0.04, gemColours[Math.floor(rnd() * gemColours.length)]);
	}
}

/** The grass colour at a point of a tile's top: soft patches of lighter and darker green, darkened where a wall or the far edge shades it. */
function grassColour(wx: number, x: number, z: number, aoL: number, aoR: number): number {
	const n = noise2((wx + x) * 0.7, z * 1.1 + 3, 5),
		patch = smooth((n - 0.3) / 0.45),
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
				: walkBand + 0.03 + h2 * (zFront - walkBand - 0.03);
	for (let j = 0; j < 4; j++) {
		const key = 4 * col + j,
			xc = -0.5 + (j + 0.5) * 0.25 + (lattice(key, row, 99) - 0.5) * 0.1,
			back = lattice(key, row, 100) < 0.7,
			front = lattice(key, row, 101) < 0.3;
		for (const [on, z, tall] of [
			[back, -half + 0.05 + lattice(key, row, 102) * 0.14, 0.1],
			[front, zFront - 0.04 - lattice(key, row, 103) * 0.06, 0.07],
		] as const) {
			if (!on) continue;
			for (let b = -1; b <= 1; b++) {
				const x = xc + b * 0.04,
					h = (0.04 + lattice(key * 3 + b, row, 104) * 0.5 * tall) * (b === 0 ? 1.3 : 1),
					lean = (lattice(key * 3 + b, row, 105) - 0.5) * 0.05,
					y = surf(x) - 0.004;
				m.triC(
					[x - 0.02, y, z],
					[x + 0.02, y, z],
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
	if (lattice(col, row, 110) < 0.16) {
		const [x, z] = spot(),
			r = 0.05 + rnd() * 0.04,
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
				m.box(x - 0.04, y, z - 0.012, x + 0.04, y + 0.028, z + 0.012, c, {
					back: false,
					bottom: false,
				});
			else
				m.box(x - 0.012, y, z - 0.04, x + 0.012, y + 0.028, z + 0.04, c, {
					back: false,
					bottom: false,
				});
		}
	}
	if (lattice(col, row, 130) < 0.12) {
		const [x, z] = spot(),
			y = surf(x) - 0.004,
			head = [palette.rockPink, palette.sprinkleYellow, palette.cyan][Math.floor(rnd() * 3)];
		m.tri([x - 0.012, y, z], [x + 0.012, y, z], [x, y + 0.11, z], palette.crustDark);
		const r = 0.04,
			cy = y + 0.12;
		m.pyramid(
			[
				[x - r, cy, z + r],
				[x + r, cy, z + r],
				[x + r, cy, z - r],
				[x - r, cy, z - r],
			],
			[x, cy + 0.03, z],
			[shade(head, 0.8), shade(head, 0.95), shade(head, 1.2), shade(head, 1.05)],
		);
	}
}

/**
 * One ground tile, built for its place in the level. `shape` gives the surface: the flat top tile is `hl = hr = 1`, rock
 * with no crust is a fill tile. Edge heights are exact, because Ben walks on them; the crust's lip and every detail stand
 * out only in Z or above the surface at its near and far edges, never beyond the tile's own cell in X. `s` says what the
 * neighbours are, so side faces appear only where the tile ends a run, and walls shade the ground at their foot.
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
		zf = half + lipOut;
	strata(m, col, row, under, crust);
	/* Side faces, where the tile ends a run or stands above its neighbour. */
	for (const side of [-1, 1] as const) {
		const edge = side < 0 ? hl : hr,
			other = side < 0 ? s.leftH : s.rightH;
		if (edge - other < 0.02) continue;
		const x = side * 0.5,
			y0 = -0.5 + other,
			y1 = -0.5 + edge,
			yc = crust ? Math.max(y0, y1 - crustDepth) : y1,
			rock = [shade(palette.rockDark, 0.8), shade(palette.rockDark, 0.58)] as const;
		const quad = (a: number, b: number, za: number, ca: number, cb: number): void => {
			if (b - a < 1e-4) return;
			if (side < 0) m.quadC([x, a, -half], [x, a, za], [x, b, za], [x, b, -half], ca, ca, cb, cb);
			else m.quadC([x, a, za], [x, a, -half], [x, b, -half], [x, b, za], ca, ca, cb, cb);
		};
		quad(y0, yc, half, rock[1], rock[0]);
		if (crust) quad(yc, y1, zf, palette.crustDark, shade(palette.crustFront, 0.9));
	}
	faceStuds(m, col, row, under, !crust || (hl === 1 && hr === 1));
	if (crust) {
		const zt = half - bevelSpan,
			aoL = s.wallL ? 1 : 0,
			aoR = s.wallR ? 1 : 0,
			nx = 4,
			nz = 5,
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
		/* Drips hang below the lip as rounded tongues of green, in slots that line up from tile to tile. */
		for (let slot = 0; slot < 4; slot++) {
			const len = 0.04 + 0.17 * lattice(4 * col + slot, row, 90) ** 1.6;
			if (len < 0.05) continue;
			const x0 = -0.5 + slot * 0.25 + 0.015,
				steps = 4;
			for (let j = 0; j < steps; j++) {
				const t0 = j / steps,
					t1 = (j + 1) / steps,
					xa = x0 + 0.22 * t0,
					xb = x0 + 0.22 * t1,
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
 * A chiselled magenta block with a chamfered frame, a raised panel and corner rivets. It fills its cell: the top is at the
 * cell's top and the sides on its edges. Resting on ground it is as deep as the lane; floating it is a shelf's depth.
 */
export function blockTile(resting: boolean): THREE.BufferGeometry {
	return cached(resting ? 'block' : 'blockFloating', () => {
		const m = new Mesher(),
			d = resting ? half : shelfHalf,
			p = 0.43,
			out = 0.05;
		m.quadC(
			[-0.5, 0.5, d],
			[0.5, 0.5, d],
			[0.5, 0.5, -d],
			[-0.5, 0.5, -d],
			palette.blockTop,
			palette.blockTop,
			shade(palette.blockTop, 0.88),
			shade(palette.blockTop, 0.88),
		);
		for (const sx of [-1, 1] as const) {
			const x = sx * 0.5;
			if (sx < 0) m.quad([x, -0.5, -d], [x, -0.5, d], [x, 0.5, d], [x, 0.5, -d], palette.blockBody);
			else
				m.quad(
					[x, -0.5, d],
					[x, -0.5, -d],
					[x, 0.5, -d],
					[x, 0.5, d],
					shade(palette.blockBody, 0.85),
				);
		}
		m.quadC(
			[-0.43, 0.43, d + out],
			[0.43, 0.43, d + out],
			[0.5, 0.5, d],
			[-0.5, 0.5, d],
			palette.blockEdge,
			palette.blockEdge,
			palette.white,
			palette.white,
		);
		m.quad([-0.5, -0.5, d], [-p, -p, d + out], [-p, p, d + out], [-0.5, 0.5, d], palette.blockEdge);
		m.quad(
			[0.5, -0.5, d],
			[0.5, 0.5, d],
			[p, p, d + out],
			[p, -p, d + out],
			shade(palette.blockBody, 0.7),
		);
		m.quad(
			[-0.5, -0.5, d],
			[0.5, -0.5, d],
			[p, -p, d + out],
			[-p, -p, d + out],
			shade(palette.blockBody, 0.62),
		);
		const z = d + out;
		m.quadC(
			[-p, -p, z],
			[p, -p, z],
			[p, p, z],
			[-p, p, z],
			palette.blockFront,
			shade(palette.blockFront, 0.9),
			palette.blockPanel,
			palette.blockPanel,
		);
		const q = 0.24,
			step = 0.035;
		m.quad(
			[-q, -q, z + step],
			[q, -q, z + step],
			[q, q, z + step],
			[-q, q, z + step],
			palette.blockBody,
		);
		m.quad(
			[-q, -q, z],
			[q, -q, z],
			[q, -q, z + step],
			[-q, -q, z + step],
			shade(palette.blockBody, 0.7),
		);
		m.quad(
			[q, -q, z],
			[q, q, z],
			[q, q, z + step],
			[q, -q, z + step],
			shade(palette.blockBody, 0.75),
		);
		m.quad(
			[-q, q, z],
			[-q, -q, z],
			[-q, -q, z + step],
			[-q, q, z + step],
			shade(palette.blockEdge, 0.95),
		);
		m.quad([q, q, z], [-q, q, z], [-q, q, z + step], [q, q, z + step], palette.blockEdge);
		for (const sx of [-1, 1])
			for (const sy of [-1, 1]) {
				const cx = sx * 0.345,
					cy = sy * 0.345,
					r = 0.04;
				m.pyramid(
					[
						[cx - r, cy - r, z],
						[cx + r, cy - r, z],
						[cx + r, cy + r, z],
						[cx - r, cy + r, z],
					],
					[cx, cy, z + 0.045],
					[palette.blockPanel, palette.blockBody, palette.blockEdge, palette.blockEdge],
				);
			}
		return m.build();
	});
}

export function blockGeometry(): THREE.BufferGeometry {
	return blockTile(true);
}

/**
 * The one-way ledge, as drawn: a cyan-capped teal slab 0.3 tall hanging from the top of its cell, a violet line under it and
 * three small feet, 0.375 in all. The slab is a shelf deep, and its ends sit exactly on the cell's edges.
 */
export function platformGeometry(): THREE.BufferGeometry {
	return cached('plat', () => {
		const m = new Mesher(),
			d = shelfHalf,
			top = 0.5,
			cap = 0.4375,
			teal = 0.25,
			slab = 0.1875,
			bevel = 0.05;
		m.quadC(
			[-0.5, top, d - bevel],
			[0.5, top, d - bevel],
			[0.5, top, -d],
			[-0.5, top, -d],
			palette.cyan,
			palette.cyan,
			shade(palette.cyan, 0.9),
			shade(palette.cyan, 0.9),
		);
		m.quad(
			[-0.5, cap, d],
			[0.5, cap, d],
			[0.5, top, d - bevel],
			[-0.5, top, d - bevel],
			shade(palette.cyan, 1.1),
		);
		m.quad([-0.5, teal, d], [0.5, teal, d], [0.5, cap, d], [-0.5, cap, d], palette.cyan);
		m.quadC(
			[-0.5, slab, d - 0.01],
			[0.5, slab, d - 0.01],
			[0.5, teal, d],
			[-0.5, teal, d],
			palette.ledge,
			palette.ledge,
			palette.cyanDark,
			palette.cyanDark,
		);
		for (const sx of [-1, 1]) {
			const x = sx * 0.5;
			if (sx < 0) m.quad([x, slab, -d], [x, slab, d], [x, top, d], [x, top, -d], palette.cyanDark);
			else
				m.quad(
					[x, slab, d],
					[x, slab, -d],
					[x, top, -d],
					[x, top, d],
					shade(palette.cyanDark, 0.85),
				);
		}
		m.quad(
			[-0.5, slab, -d],
			[0.5, slab, -d],
			[0.5, slab, d],
			[-0.5, slab, d],
			shade(palette.ledge, 0.75),
		);
		for (const [i, x] of [-0.375, -0.125, 0.125, 0.375].entries()) {
			const r = 0.03,
				y = 0.31 + (i % 2) * 0.03,
				z = d + 0.0;
			m.pyramid(
				[
					[x - r, y - r, z],
					[x + r, y - r, z],
					[x + r, y + r, z],
					[x - r, y + r, z],
				],
				[x, y, z + 0.03],
				[palette.ledgeStud, palette.ledge, shade(palette.ledge, 0.7), palette.ledge],
			);
		}
		for (const x of [-0.34, -0.03, 0.28])
			for (const z of [-d + 0.15, d - 0.2])
				m.box(x - 0.05, 0.125, z - 0.06, x + 0.05, slab, z + 0.06, palette.teal, {
					top: false,
					bottom: false,
				});
		return m.build();
	});
}
