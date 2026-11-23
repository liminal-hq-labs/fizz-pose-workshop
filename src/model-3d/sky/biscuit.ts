// The open-sky ground theme: baked biscuit rock in courses of crumbly stones, an icing crust, shortbread blocks and cloud ledges.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { BlockTheme } from '../crater/bricks.ts';
import { bevelSpan, half, walkBand } from '../crater/dims.ts';
import { faceStuds, smooth, type StudLook } from '../crater/dressing.ts';
import { lattice, noise2, rng } from '../crater/hash.ts';
import {
	chocolateMaterial,
	glowMaterial,
	groundMaterialOf,
	propMaterial,
	unlitMaterial,
} from '../crater/materials.ts';
import { Mesher, mix, shade } from '../crater/mesher.ts';
import type { GroundTheme } from '../crater/theme.ts';
import { cloudLedge } from './cloud-ledge.ts';
import { palette } from './palette.ts';

/** The colour of a stone of biscuit rock: mostly golden and toasted browns, now and then a pale shortbread one or a dark caramel one. */
export function biscuitStone(a: number, b: number, face: number): number {
	const r = lattice(a, b, 520 + face),
		luck = lattice(a, b, 525 + face),
		base =
			r < 0.3
				? palette.biscuit
				: r < 0.55
					? palette.biscuitDark
					: r < 0.75
						? palette.biscuitLight
						: r < 0.87
							? palette.toasted
							: r < 0.95
								? palette.shortbread
								: palette.caramel;
	return shade(base, 0.93 + luck * 0.14);
}

const crumbs = [
	palette.crumb,
	palette.crumb,
	palette.crumbPale,
	palette.crumbGold,
	palette.crumbDeep,
	palette.crumbGold,
	palette.crumbPale,
] as const;

/** Shortbread bricks: golden cream, a little different from one to the next. */
function shortbread(a: number, b: number, face: number): number {
	const base = crumbs[Math.floor(lattice(a, b, 540 + face) * crumbs.length)];
	return shade(base, 0.94 + 0.12 * lattice(a, b, 550 + face));
}

const blocks: BlockTheme = {
	colour: shortbread,
	mortar: palette.jam,
	edge: palette.crumbEdge,
	glint: palette.sugar,
};

/** Sugar crystals on the rock face, and crumbs of shortbread standing out of it. */
const studs: StudLook = {
	gems: [
		palette.sugarGold,
		palette.sugarGold,
		palette.sugar,
		palette.icingTop,
		palette.sprinkleRed,
	],
	cobble: palette.biscuitLight,
	ring: shade(palette.caramel, 0.5),
};

/** The icing's colour at a point of a tile's top: soft swirls of cream and butter, shaded where a wall or the far edge is near. */
function icing(wx: number, x: number, z: number, aoL: number, aoR: number): number {
	const broad = noise2((wx + x) * 0.5, z * 1.1 + 3, 15),
		swirl = noise2((wx + x) * 2.2, z * 3.0 + 9, 17),
		patch = smooth((0.6 * broad + 0.4 * swirl - 0.3) / 0.45),
		dark = shade(palette.icingTop, 0.9),
		bright = mix(palette.icingTop, palette.icingLight, 0.6);
	let colour = mix(dark, bright, patch);
	colour = shade(colour, 0.84 + 0.16 * smooth((z + half) / 0.5));
	const wall = Math.max(aoL * (1 - smooth((x + 0.5) / 0.42)), aoR * (1 - smooth((0.5 - x) / 0.42)));
	return shade(colour, 1 - 0.3 * wall);
}

const sprinkles = [
	palette.sprinkleRed,
	palette.sprinkleCyan,
	palette.sprinkleGreen,
	palette.sprinkleBlue,
	palette.sugar,
] as const;

/**
 * Peaks of piped icing, sugar grains, sprinkles and the odd candy button on the icing, kept to the near and far edges so
 * the strip a hero walks on stays clear.
 */
function dress(m: Mesher, col: number, row: number, surf: (x: number) => number): void {
	const zFront = half - bevelSpan - 0.03,
		zone = (h1: number, h2: number): number =>
			h1 < 0.6
				? -half + 0.05 + h2 * (half - walkBand - 0.08)
				: walkBand + 0.03 + h2 * (zFront - walkBand - 0.03),
		clusters = 5;
	for (let j = 0; j < clusters; j++) {
		const key = clusters * col + j,
			xc = -0.38 + (j * 0.76) / (clusters - 1) + (lattice(key, row, 500) - 0.5) * 0.04,
			back = lattice(key, row, 501) < 0.6,
			front = lattice(key, row, 502) < 0.22;
		for (const [on, z, low, span] of [
			[back, -half + 0.07 + lattice(key, row, 503) * 0.1, 0.025, 0.045],
			[front, zFront - 0.05 - lattice(key, row, 504) * 0.04, 0.02, 0.03],
		] as const) {
			if (!on) continue;
			const h = low + lattice(key, row, 505) * span,
				r = 0.045 + 0.02 * lattice(key, row, 506),
				y = surf(xc) - 0.004,
				lean = (lattice(key, row, 507) - 0.5) * 0.03;
			m.pyramid(
				[
					[xc - r, y, z + r],
					[xc + r, y, z + r],
					[xc + r, y, z - r],
					[xc - r, y, z - r],
				],
				[xc + lean, y + h, z],
				[
					shade(palette.icingLight, 0.9),
					shade(palette.icingLight, 0.78),
					shade(palette.icingTop, 0.9),
					palette.icingLight,
				],
			);
		}
	}
	const rnd = rng(Math.imul(col, 4721) ^ Math.imul(row, 3109) ^ 0x2c7b),
		spot = (): [number, number] => [-0.38 + rnd() * 0.76, zone(rnd(), rnd())];
	for (let g = 0, grains = 2 + Math.floor(rnd() * 3); g < grains; g++) {
		const [x, z] = spot(),
			r = 0.02 + rnd() * 0.016,
			y = surf(x) - 0.006,
			c = rnd() < 0.5 ? palette.sugar : palette.sugarGold;
		m.pyramid(
			[
				[x - r, y, z + r],
				[x + r, y, z + r],
				[x + r, y, z - r],
				[x - r, y, z - r],
			],
			[x + (rnd() - 0.5) * r, y + r * 1.1, z],
			[shade(c, 0.9), shade(c, 0.74), shade(c, 1.1), shade(c, 1)],
		);
	}
	if (lattice(col, row, 510) < 0.3)
		for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
			const [x, z] = spot(),
				alongX = rnd() < 0.5,
				c = sprinkles[Math.floor(rnd() * sprinkles.length)],
				y = surf(x) - 0.012;
			if (alongX)
				m.box(x - 0.035, y, z - 0.01, x + 0.035, y + 0.024, z + 0.01, c, {
					back: false,
					bottom: false,
				});
			else
				m.box(x - 0.01, y, z - 0.035, x + 0.01, y + 0.024, z + 0.035, c, {
					back: false,
					bottom: false,
				});
		}
	if (lattice(col, row, 520) < 0.1) {
		/* A candy button: a squat dome of one colour. */
		const [x, z] = spot(),
			r = 0.05,
			y = surf(x) - 0.006,
			c = [palette.sprinkleRed, palette.sprinkleCyan, palette.sprinkleGreen][Math.floor(rnd() * 3)];
		m.pyramid(
			[
				[x - r, y, z + r],
				[x + r, y, z + r],
				[x + r, y, z - r],
				[x - r, y, z - r],
			],
			[x, y + 0.045, z],
			[shade(c, 0.85), shade(c, 0.7), shade(c, 1.2), shade(c, 1.05)],
		);
	}
}

export const skyTheme: GroundTheme = {
	name: 'sky',
	materials: {
		ground: groundMaterialOf('sky-ground', 0.84),
		prop: propMaterial,
		glow: glowMaterial,
		chocolate: chocolateMaterial,
		unlit: unlitMaterial,
	},
	stoneColour: biscuitStone,
	crevice: palette.crevice,
	crust: {
		top: palette.icingTop,
		front: palette.icingFront,
		dark: palette.icingDark,
		light: palette.icingLight,
	},
	cliffFace: palette.toasted,
	crustColour: icing,
	studs: (m, col, row, under, boulders) => faceStuds(m, col, row, under, boulders, studs),
	dress,
	block: blocks,
	ledge: cloudLedge,
	/* A pit in a mesa shows the rock of its far wall, which dims and then pales into the haze below the level. */
	chasmTone(colour, v, top) {
		const deep = Math.min(1, Math.max(0, (top - v) / 8));
		return mix(shade(colour, 0.8 - 0.15 * deep), palette.haze, 0.92 * deep ** 1.3);
	},
	cliffTone: (colour) => shade(colour, 0.96),
};
