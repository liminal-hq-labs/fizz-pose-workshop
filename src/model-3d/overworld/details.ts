// Small things on the ground, sized to a boy of 1.4 metres: tufts, pebbles, flowers, marshmallow fluff, sprinkles and sugar crystals.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { lattice } from '../crater/hash.ts';
import { Mesher, shade, type V3 } from '../crater/mesher.ts';
import type { Region } from './palette.ts';
import { blob, lathe, slab } from './shapes.ts';

/** How many look-alike models each kind of detail has. */
export const detailVariants = 3;

const cache = new Map<string, THREE.BufferGeometry>();

/** A thin three-sided blade leaning away from the root by `lean`. */
function blade(m: Mesher, x: number, y: number, h: number, lean: V3, colour: number): void {
	const w = 0.035,
		tip: V3 = [x + lean[0], y + lean[1], h],
		a: V3 = [x - w, y - w * 0.6, 0],
		b: V3 = [x + w, y - w * 0.6, 0],
		c: V3 = [x, y + w, 0];
	m.tri(a, b, tip, shade(colour, 0.95));
	m.tri(b, c, tip, shade(colour, 1.1));
	m.tri(c, a, tip, shade(colour, 0.8));
}

function tuft(m: Mesher, variant: number, colour: number): void {
	const blades = 5 + variant;
	for (let i = 0; i < blades; i++) {
		const a = (i / blades) * Math.PI * 2 + variant,
			r = 0.04 + lattice(i, variant, 1) * 0.05;
		blade(
			m,
			Math.cos(a) * r,
			Math.sin(a) * r,
			0.16 + lattice(i, variant, 2) * 0.16,
			[Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0],
			shade(colour, 0.85 + lattice(i, variant, 3) * 0.3),
		);
	}
}

function pebbles(m: Mesher, variant: number, light = 0xb8b8c8): void {
	for (let i = 0; i < 3; i++) {
		const r = 0.05 + lattice(i, variant, 4) * 0.05;
		blob(
			m,
			{
				x: (lattice(i, variant, 5) - 0.5) * 0.3,
				y: (lattice(i, variant, 6) - 0.5) * 0.3,
				z: r * 0.5,
			},
			{ x: r, y: r * 0.85, z: r * 0.6 },
			{ bottom: shade(light, 0.55), top: light },
			{ sides: 5, rings: 2, seed: i },
		);
	}
}

function flower(m: Mesher, petal: number, centre: number, height: number): void {
	lathe(
		m,
		[
			{ r: 0.025, z: 0, colour: 0x2ec040 },
			{ r: 0.018, z: height, colour: 0x4cf050 },
		],
		{ sides: 4 },
	);
	blade(m, 0.04, 0, 0.16, [0.07, 0.02, 0], 0x4cf050);
	const petals = 6,
		z = height;
	for (let i = 0; i < petals; i++) {
		const a = (i / petals) * Math.PI * 2,
			b = ((i + 0.5) / petals) * Math.PI * 2,
			c = ((i + 1) / petals) * Math.PI * 2;
		m.tri(
			[Math.cos(a) * 0.04, Math.sin(a) * 0.04, z],
			[Math.cos(b) * 0.13, Math.sin(b) * 0.13, z + 0.02],
			[Math.cos(c) * 0.04, Math.sin(c) * 0.04, z],
			petal,
		);
	}
	lathe(
		m,
		[
			{ r: 0.045, z: z - 0.005, colour: centre },
			{ r: 0.04, z: z + 0.035, colour: centre },
		],
		{ sides: 6 },
	);
}

function fluff(m: Mesher, variant: number): void {
	for (let i = 0; i < 3; i++) {
		const r = 0.07 + lattice(i, variant, 7) * 0.05;
		blob(
			m,
			{
				x: (lattice(i, variant, 8) - 0.5) * 0.3,
				y: (lattice(i, variant, 9) - 0.5) * 0.3,
				z: r * 0.7,
			},
			{ x: r, y: r, z: r * 0.8 },
			{ bottom: 0xe8d8f0, top: 0xffffff },
			{ sides: 6, rings: 3 },
		);
	}
}

function sprinkles(m: Mesher, variant: number, colours: readonly number[]): void {
	for (let i = 0; i < 4; i++) {
		const x = (lattice(i, variant, 10) - 0.5) * 0.4,
			y = (lattice(i, variant, 11) - 0.5) * 0.4,
			turn = lattice(i, variant, 12) * Math.PI,
			c = Math.cos(turn) * 0.07,
			s = Math.sin(turn) * 0.07,
			colour = colours[(i + variant) % colours.length];
		/* A little rod lying on the ground, drawn as a flat-topped bar. */
		const p: V3[] = [
			[x - c - s * 0.4, y - s + c * 0.4, 0.02],
			[x + c - s * 0.4, y + s + c * 0.4, 0.02],
			[x + c + s * 0.4, y + s - c * 0.4, 0.02],
			[x - c + s * 0.4, y - s - c * 0.4, 0.02],
		];
		m.quad(p[0], p[1], p[2], p[3], shade(colour, 1.1));
		m.quad(
			[p[0][0], p[0][1], 0],
			[p[3][0], p[3][1], 0],
			[p[3][0], p[3][1], 0.02],
			[p[0][0], p[0][1], 0.02],
			shade(colour, 0.7),
		);
		m.tri([p[0][0], p[0][1], 0.02], [p[1][0], p[1][1], 0.02], [x, y, 0.07], shade(colour, 0.9));
	}
}

function sugar(m: Mesher, variant: number): void {
	for (let i = 0; i < 3; i++) {
		const x = (lattice(i, variant, 13) - 0.5) * 0.34,
			y = (lattice(i, variant, 14) - 0.5) * 0.34,
			h = 0.12 + lattice(i, variant, 15) * 0.12;
		lathe(
			m,
			[
				{ r: 0, z: 0, colour: 0xc8c8f0 },
				{ r: 0.05, z: h * 0.35, colour: 0xffffff },
				{ r: 0, z: h, colour: 0xffffff },
			],
			{ sides: 4, cx: x, cy: y, facet: (side) => (side % 2 ? 0.85 : 1.15) },
		);
	}
}

function shard(m: Mesher, variant: number): void {
	for (let i = 0; i < 2; i++) {
		const x = (lattice(i, variant, 16) - 0.5) * 0.3,
			y = (lattice(i, variant, 17) - 0.5) * 0.3,
			h = 0.16 + lattice(i, variant, 18) * 0.12;
		lathe(
			m,
			[
				{ r: 0.05, z: 0, colour: 0x14a2ac },
				{ r: 0.04, z: h * 0.7, colour: 0x9afcfc },
				{ r: 0, z: h, colour: 0xffffff },
			],
			{ sides: 5, cx: x, cy: y, facet: (side) => (side % 2 ? 0.85 : 1.15) },
		);
	}
}

const builders: Readonly<Record<string, (m: Mesher, variant: number) => void>> = {
	pebbles: (m, v) => pebbles(m, v),
	tuft: (m, v) => tuft(m, v, 0x58e856),
	flowerPink: (m) => flower(m, 0xff5ad0, 0xffe94a, 0.36),
	flowerWhite: (m) => flower(m, 0xffffff, 0xffe94a, 0.3),
	fluff,
	sprinkles: (m, v) => sprinkles(m, v, [0xffffff, 0x6af0f0, 0xffe94a]),
	sprinklesPink: (m, v) => sprinkles(m, v, [0xff4fd8, 0xffe94a, 0x6af0f0]),
	sprinklesPlum: (m, v) => sprinkles(m, v, [0xa83aa8, 0xffffff]),
	sugar,
	shard,
	slab: (m) => slab(m, [-0.05, -0.05, 0], [0.05, 0.05, 0.05], 0xffffff),
};

/** The geometry of one variant of a detail, shared by every place that uses it. */
export function detailGeometry(name: string, variant: number): THREE.BufferGeometry {
	const key = `${name}|${variant}`;
	let geometry = cache.get(key);
	if (!geometry) {
		const build = builders[name];
		if (!build) throw new Error(`the overworld has no detail ${name}`);
		const m = new Mesher();
		build(m, variant);
		cache.set(key, (geometry = m.build()));
	}
	return geometry;
}

/** The sim's four ground decals, by the number in the sprite's name, as the details they become. */
export const decalDetails = ['pebbles', 'tuft', 'flowerPink', 'flowerWhite'] as const;

/** The kinds of detail scattered over each region's open ground, with how likely each is on a tile. */
export const scatter: Readonly<Record<Region, readonly (readonly [string, number])[]>> = {
	crater: [
		['tuft', 0.34],
		['pebbles', 0.08],
		['shard', 0.03],
	],
	meadow: [
		['fluff', 0.24],
		['sprinklesPlum', 0.12],
		['tuft', 0.05],
	],
	candy: [
		['sprinkles', 0.3],
		['shard', 0.1],
		['pebbles', 0.04],
	],
	frost: [
		['sugar', 0.22],
		['sprinklesPink', 0.3],
	],
};
