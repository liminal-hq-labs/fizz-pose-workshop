// The overworld's standing scenery as little models: crystal, rock-candy, marshmallow and frosting trees, boulders and cake slices.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { Mesher, mix } from '../crater/mesher.ts';
import { blob, lathe, slab, type Ring } from './shapes.ts';
import { trim } from './palette.ts';

/** How many look-alike models each scenery family has; a tile picks one by hashing its position. */
export const sceneryVariants = 4;

const cache = new Map<string, THREE.BufferGeometry>();

/** How a crystal's six faces differ in brightness, so it reads as cut. */
function cut(side: number): number {
	return [1.28, 1, 0.8][side % 3];
}

/** A crystal: a point at each end and the widest part a third of the way up. */
export function crystal(
	m: Mesher,
	at: { x: number; y: number; z: number },
	size: { r: number; h: number },
	colours: { body: number; light: number; dark: number },
	seed: number,
): void {
	const rings: Ring[] = [
		{ r: 0, z: 0, colour: colours.dark },
		{ r: size.r * 0.5, z: size.h * 0.14, colour: colours.body },
		{ r: size.r, z: size.h * 0.4, colour: colours.light },
		{ r: size.r * 0.7, z: size.h * 0.72, colour: colours.body },
		{ r: 0, z: size.h, colour: colours.light },
	];
	lathe(m, rings, { sides: 6, cx: at.x, cy: at.y, z: at.z, facet: cut, bake: 0.08, turn: seed });
}

function trunk(m: Mesher, height: number, r: number): void {
	lathe(
		m,
		[
			{ r: r * 1.5, z: 0, colour: trim.woodDark },
			{ r, z: height * 0.4, colour: trim.wood },
			{ r: r * 0.85, z: height, colour: trim.wood },
		],
		{ sides: 6 },
	);
}

export const crystalColours = {
	cyan: { body: 0x44e8e8, light: 0xc8ffff, dark: 0x1fb5c0 },
	pink: { body: 0xff55ff, light: 0xffc2ff, dark: 0xb030c0 },
	blue: { body: 0x5a64ff, light: 0xc4caff, dark: 0x2a2ab8 },
} as const;

/** A crystal tree: a brown trunk holding up a faceted gem, with two small gems at its foot. */
function crystalTree(m: Mesher, look: number, variant: number): void {
	const colours = look === 0 ? crystalColours.cyan : crystalColours.pink,
		tall = 0.9 + variant * 0.07;
	trunk(m, 1.1 * tall, 0.12);
	crystal(m, { x: 0, y: 0, z: 0.7 * tall }, { r: 0.62, h: 2.45 * tall }, colours, variant);
	crystal(m, { x: 0.42, y: -0.2, z: 0 }, { r: 0.18, h: 0.55 }, colours, variant + 1);
	crystal(m, { x: -0.38, y: 0.18, z: 0 }, { r: 0.14, h: 0.4 }, colours, variant + 2);
}

/** Rock candy: tall hexagonal columns standing in a cluster on a small grey stone. */
function candyTree(m: Mesher, look: number, variant: number): void {
	const colours = look === 0 ? crystalColours.cyan : crystalColours.blue,
		heights = [2.5 + variant * 0.2, 1.8 + ((variant * 3) % 4) * 0.12, 1.3 + variant * 0.1],
		places = [
			[0, 0],
			[0.46, -0.16],
			[-0.4, 0.2],
		] as const;
	blob(
		m,
		{ x: 0, y: 0, z: 0.12 },
		{ x: 0.8, y: 0.7, z: 0.2 },
		{ bottom: 0x6a6a78, top: 0x9a9aaa },
		{ sides: 7, jitter: 0.08, seed: variant },
	);
	for (let i = 0; i < 3; i++) {
		const [x, y] = places[i],
			h = heights[i],
			r = 0.34 - i * 0.04;
		lathe(
			m,
			[
				{ r, z: 0, colour: colours.dark },
				{ r, z: h * 0.7, colour: colours.body },
				{ r: r * 0.9, z: h * 0.78, colour: colours.light },
				{ r: 0, z: h, colour: colours.light },
			],
			{ sides: 6, cx: x, cy: y, z: 0.1, facet: cut, bake: 0.06, turn: variant * 0.4 },
		);
	}
}

/** A marshmallow tree: a white puff on a thin trunk, grey underneath, with pink sprinkles. */
function puffTree(m: Mesher, _look: number, variant: number): void {
	const lift = 1.15 + variant * 0.06;
	trunk(m, lift, 0.1);
	blob(
		m,
		{ x: 0, y: 0, z: lift + 0.62 },
		{ x: 0.82, y: 0.78, z: 0.74 },
		{ bottom: 0xb8b8d0, top: 0xffffff },
		{ sides: 9, rings: 5, jitter: 0.06, seed: variant, bake: 0.05 },
	);
	for (let i = 0; i < 4; i++) {
		const a = i * 1.7 + variant,
			x = Math.cos(a) * 0.62,
			y = Math.sin(a) * 0.58,
			z = lift + 0.7 + Math.sin(a * 2.1) * 0.28;
		slab(m, [x - 0.07, y - 0.07, z], [x + 0.07, y + 0.07, z + 0.09], trim.pink, 1);
	}
}

/** A frosting tree: tiers of pink cone, each ringed with white icing, on a short brown trunk. */
function frostTree(m: Mesher, _look: number, variant: number): void {
	trunk(m, 0.5, 0.11);
	const tiers = 3;
	for (let t = 0; t < tiers; t++) {
		const z = 0.4 + t * 0.7,
			r = 0.8 - t * 0.17;
		lathe(
			m,
			[
				{ r: r, z, colour: trim.white },
				{ r: r * 0.97, z: z + 0.09, colour: trim.white },
				{ r: r * 0.9, z: z + 0.11, colour: trim.pink },
				{ r: r * 0.5, z: z + 0.86, colour: mix(trim.pink, trim.white, 0.15) },
				{ r: 0.07, z: z + 0.92, colour: trim.pink },
			],
			{ sides: 10, bake: 0.2, turn: variant * 0.3 + t * 0.2 },
		);
	}
	slab(m, [-0.05, -0.05, 2.6], [0.05, 0.05, 2.84], trim.yellow, 1);
	for (let i = 0; i < 3; i++) {
		const a = i * 2.1 + variant,
			x = Math.cos(a) * 0.45,
			y = Math.sin(a) * 0.45;
		slab(
			m,
			[x - 0.05, y - 0.05, 0.8 + i * 0.4],
			[x + 0.05, y + 0.05, 0.89 + i * 0.4],
			i % 2 ? trim.cyan : trim.yellow,
			1,
		);
	}
}

/** A boulder of grey stone, lumpy and lighter on top. */
function boulder(m: Mesher, _look: number, variant: number): void {
	blob(
		m,
		{ x: 0, y: 0, z: 0.36 },
		{ x: 0.7, y: 0.6, z: 0.5 },
		{ bottom: 0x58586a, top: 0xa8a8b8 },
		{ sides: 8, rings: 4, jitter: 0.14, seed: variant, bake: 0.12 },
	);
	blob(
		m,
		{ x: 0.5, y: -0.22, z: 0.14 },
		{ x: 0.26, y: 0.22, z: 0.16 },
		{ bottom: 0x58586a, top: 0x9a9aaa },
		{ sides: 6, rings: 2, jitter: 0.1, seed: variant + 5 },
	);
}

/** A gumdrop of glossy dark-blue candy with a pale glint. */
function candyRock(m: Mesher, _look: number, variant: number): void {
	blob(
		m,
		{ x: 0, y: 0, z: 0.4 },
		{ x: 0.66, y: 0.6, z: 0.52 },
		{ bottom: 0x1c22a8, top: 0x4a52f4 },
		{ sides: 9, rings: 4, jitter: 0.07, seed: variant, bake: 0.1 },
	);
	blob(
		m,
		{ x: -0.22, y: 0.14, z: 0.74 },
		{ x: 0.14, y: 0.1, z: 0.07 },
		{ bottom: 0x9ad8ff, top: 0xe8ffff },
		{ sides: 6, rings: 2 },
	);
}

/** A marshmallow: a soft white cylinder with a pink middle on top. */
function puffRock(m: Mesher, _look: number, variant: number): void {
	lathe(
		m,
		[
			{ r: 0.62, z: 0, colour: 0xc8c8e0 },
			{ r: 0.7, z: 0.14, colour: 0xe8e8f8 },
			{ r: 0.7, z: 0.5, colour: trim.white },
			{ r: 0.56, z: 0.66, colour: trim.white },
			{ r: 0.34, z: 0.7, colour: 0xff70f4 },
		],
		{ sides: 10, jitter: 0.05, seed: variant, bake: 0.06 },
	);
}

/** A slice of cake: sponge with a jam stripe, white icing on top and a candle. */
function cake(m: Mesher, _look: number, variant: number): void {
	const w = 0.72 + (variant % 2) * 0.06;
	slab(m, [-w, -0.6, 0], [w, 0.6, 0.62], { top: 0xb8681e, front: 0xc2742a, side: 0xa05414 }, 0.75);
	slab(
		m,
		[-w - 0.01, -0.61, 0.22],
		[w + 0.01, 0.61, 0.3],
		{ top: 0xc41e1e, front: 0xd23030, side: 0xa01818 },
		1,
	);
	slab(
		m,
		[-w - 0.04, -0.64, 0.62],
		[w + 0.04, 0.64, 0.8],
		{ top: trim.white, front: 0xf4f4ff, side: 0xe0e0f0 },
		1,
	);
	for (let i = 0; i < 3; i++) {
		const x = -w + 0.25 + i * 0.4;
		slab(m, [x - 0.07, -0.66, 0.6], [x + 0.07, -0.6, 0.72], trim.white, 1);
	}
	lathe(
		m,
		[
			{ r: 0.06, z: 0.8, colour: trim.pink },
			{ r: 0.06, z: 1.2, colour: trim.pinkDark },
		],
		{ sides: 5, cx: 0.1 },
	);
	lathe(
		m,
		[
			{ r: 0.08, z: 1.2, colour: 0xff8a20 },
			{ r: 0.04, z: 1.38, colour: trim.yellow },
			{ r: 0, z: 1.46, colour: trim.yellow },
		],
		{ sides: 5, cx: 0.1 },
	);
}

const builders: Readonly<Record<string, (m: Mesher, look: number, variant: number) => void>> = {
	tree: crystalTree,
	candyTree,
	puffTree,
	frostTree,
	rock: boulder,
	candyRock,
	puffRock,
	cake,
};

/** The merged geometry of one variant of a scenery family, shared by every tile that uses it. */
export function sceneryGeometry(
	family: string,
	look: number,
	variant: number,
): THREE.BufferGeometry {
	const key = `${family}|${look}|${variant}`;
	let geometry = cache.get(key);
	if (!geometry) {
		const build = builders[family];
		if (!build) throw new Error(`the overworld has no scenery family ${family}`);
		const m = new Mesher();
		build(m, look, variant);
		cache.set(key, (geometry = m.build()));
	}
	return geometry;
}

/** How much a scenery family's size may vary between tiles: the least and the most. */
export const sceneryScale: Readonly<Record<string, readonly [number, number]>> = {
	tree: [0.85, 1.15],
	candyTree: [0.85, 1.2],
	puffTree: [0.85, 1.15],
	frostTree: [0.85, 1.1],
	rock: [0.7, 1.2],
	candyRock: [0.75, 1.15],
	puffRock: [0.8, 1.15],
	cake: [0.9, 1.1],
};
