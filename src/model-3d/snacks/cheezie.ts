// The cheezie: a bag of cheese puffs, plump and yellow with red crimped ends and brown puff speckles.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { castScale } from '../cast-scale.ts';
import { inked, toon } from '../toon.ts';
import { createPickup } from './pickup.ts';
import { candy, ellipsoid, scatter } from './shared.ts';

const rx = 0.28,
	ry = 0.38,
	rz = 0.2;

let speckles: THREE.BufferGeometry | null = null;

/** Brown puff speckles on both faces of the bag, merged into one geometry. */
function speckleGeometry(): THREE.BufferGeometry {
	if (!speckles) {
		const spots: [number, number, number, number, number, number][] = [],
			places: [number, number, number][] = [
				[-0.1, 0.16, 0.05],
				[0.12, 0.2, 0.04],
				[0.02, 0.02, 0.06],
				[-0.14, -0.1, 0.045],
				[0.13, -0.08, 0.05],
				[-0.02, -0.26, 0.04],
			];
		for (const side of [-1, 1])
			for (const [x, y, size] of places) {
				const inside = 1 - (x / rx) ** 2 - (y / ry) ** 2,
					z = rz * Math.sqrt(Math.max(inside, 0.05)) * 0.96 * side;
				spots.push([x * side, y, z, size * 1.2, size * 0.8, 0.02]);
			}
		speckles = scatter(spots);
	}
	return speckles;
}

function build(body: THREE.Group): void {
	body.add(inked(ellipsoid(rx, ry, rz), toon(candy.yellow, { emissive: 0x332200 }), 0.03));
	for (const end of [-1, 1]) {
		const crimp = inked(ellipsoid(0.29, 0.07, 0.1), toon(candy.red, { emissive: 0x331111 }), 0.025);
		crimp.position.y = end * 0.4;
		body.add(crimp);
	}
	const dots = new THREE.Mesh(speckleGeometry(), toon(candy.brown));
	body.add(dots);
	const shine = new THREE.Mesh(
		ellipsoid(0.045, 0.1, 0.03),
		toon(candy.white, { emissive: 0x888888 }),
	);
	shine.position.set(-0.17, 0.2, 0.15);
	shine.rotation.z = 0.25;
	body.add(shine);
	const shineBack = shine.clone();
	shineBack.position.set(0.17, 0.2, -0.15);
	body.add(shineBack);
}

export function createCheezie(first: SpriteDraw): Actor {
	return createPickup({ build, glow: 0xffaa22, reach: 0.5, centre: -0.031 / castScale }, first);
}
