// The cream soda can: a red can with a white band, grey rims, a pull tab and bright fizz drops.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { collectibleScale } from '../cast-scale.ts';
import { inked, toon } from '../toon.ts';
import { createPickup } from './pickup.ts';
import { candy, ellipsoid, lathe } from './shared.ts';

let bodyGeometry: THREE.BufferGeometry | null = null,
	lidGeometry: THREE.BufferGeometry | null = null,
	baseGeometry: THREE.BufferGeometry | null = null,
	bandGeometry: THREE.BufferGeometry | null = null,
	tabGeometry: THREE.BufferGeometry | null = null;

/** The model is a little smaller than the sprite art before its scale factor is applied. */
const fit = 0.95;

function build(body: THREE.Group): void {
	const can = new THREE.Group();
	can.scale.setScalar(fit);
	body.add(can);
	bodyGeometry ??= lathe([
		[0, -0.45],
		[0.17, -0.45],
		[0.215, -0.42],
		[0.235, -0.36],
		[0.235, 0.36],
		[0.215, 0.42],
		[0.17, 0.45],
		[0, 0.45],
	]);
	lidGeometry ??= lathe([
		[0.246, 0.3],
		[0.246, 0.36],
		[0.224, 0.425],
		[0.176, 0.457],
		[0, 0.457],
	]);
	baseGeometry ??= lathe([
		[0, -0.457],
		[0.176, -0.457],
		[0.224, -0.425],
		[0.246, -0.36],
		[0.246, -0.3],
	]);
	bandGeometry ??= lathe([
		[0.244, -0.11],
		[0.244, 0.1],
	]);
	tabGeometry ??= new THREE.TorusGeometry(0.06, 0.017, 8, 16);
	can.add(inked(bodyGeometry, toon(candy.red, { emissive: 0x3a1111 }), 0.03));
	const rim = toon(candy.grey, { emissive: 0x333333 }),
		top = new THREE.Mesh(lidGeometry, rim),
		bottom = new THREE.Mesh(baseGeometry, rim),
		band = new THREE.Mesh(bandGeometry, toon(candy.white, { emissive: 0x555555 }));
	const tab = new THREE.Mesh(tabGeometry, rim);
	tab.position.set(0, 0.47, 0.05);
	tab.rotation.x = Math.PI / 2 - 0.2;
	can.add(top, bottom, band, tab);
	/* Fizz drops on both faces of the lower can, and a shine down one side. */
	for (const side of [-1, 1]) {
		for (const [x, y, size] of [
			[0.03, -0.25, 0.04],
			[-0.06, -0.32, 0.03],
			[0.09, -0.34, 0.025],
		] as const) {
			const drop = new THREE.Mesh(
				ellipsoid(size, size, 0.015),
				toon(candy.cyan, { emissive: 0x338888 }),
			);
			drop.position.set(x * side, y, side * Math.sqrt(0.24 * 0.24 - x * x) * 1.0);
			can.add(drop);
		}
		const shine = new THREE.Mesh(
			ellipsoid(0.03, 0.17, 0.02),
			toon(candy.white, { emissive: 0xaaaaaa }),
		);
		shine.position.set(-0.13 * side, 0.2, side * 0.195);
		shine.rotation.y = side * -0.55;
		can.add(shine);
	}
}

export function createSoda(first: SpriteDraw): Actor {
	return createPickup(
		{
			build,
			size: 0.94,
			glow: 0x55eeff,
			reach: 0.55,
			spin: 1.3,
			centre: -0.031 / collectibleScale,
		},
		first,
	);
}
