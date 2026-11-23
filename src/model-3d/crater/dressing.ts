// The crater's dressing for its ground: gems and cobbles on the rock face, and grass, pebbles, sprinkles and flowers on the crust.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { lattice, noise2, rng } from './hash.ts';
import { Mesher, mix, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';
import { bevelSpan, half, studBase, walkBand } from './dims.ts';

export function smooth(t: number): number {
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
function boulder(
	m: Mesher,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	base: number,
	groove: number,
): void {
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
		m.quad(crevice[k], crevice[l], outer[l], outer[k], groove);
		const a = ((k + 0.5) / n) * Math.PI * 2,
			lit = -Math.cos(a) * 0.55 + Math.sin(a) * 0.8,
			c = shade(base, 0.74 + 0.3 * (lit * 0.5 + 0.5));
		m.quadC(outer[k], outer[l], inner[l], inner[k], shade(c, 0.85), shade(c, 0.85), c, c);
		m.tri(inner[k], inner[l], apex, shade(c, 1.18));
	}
}

/** The colours of the studs on a rock face: the gems, the cobbles and the dark ring round a cobble. */
export interface StudLook {
	gems: readonly number[];
	cobble: number;
	ring: number;
}

/** The crater's studs: pink, navy and pale gems, and cobbles of lighter rock. */
export const craterStudLook: StudLook = {
	gems: gemColours,
	cobble: palette.rockLight,
	ring: shade(palette.rockDark, 0.5),
};

/** Gems and, now and then, a cobble or two on a rock face. */
export function faceStuds(
	m: Mesher,
	col: number,
	row: number,
	under: (x: number) => number,
	boulders: boolean,
	look: StudLook,
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
			c = shade(look.cobble, 0.95 + rnd() * 0.3);
		if (y + ry > top - 0.08) continue;
		if (placedBoulders.some((o) => Math.abs(o.x - x) < o.rx + rx && Math.abs(o.y - y) < o.ry + ry))
			continue;
		placedBoulders.push({ x, y, rx, ry });
		boulder(m, x, y, rx, ry, c, look.ring);
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
		gem(m, x, y, rx, ry, 0.02 + rnd() * 0.025, look.gems[Math.floor(rnd() * look.gems.length)]);
	}
}

/** The crater's studs. */
export function craterStuds(
	m: Mesher,
	col: number,
	row: number,
	under: (x: number) => number,
	boulders: boolean,
): void {
	faceStuds(m, col, row, under, boulders, craterStudLook);
}

/** The grass colour at a point of a tile's top: soft patches of lighter and darker green, darkened where a wall or the far edge shades it. */
export function craterGrass(wx: number, x: number, z: number, aoL: number, aoR: number): number {
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
export function craterTopDetails(
	m: Mesher,
	col: number,
	row: number,
	surf: (x: number) => number,
): void {
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
