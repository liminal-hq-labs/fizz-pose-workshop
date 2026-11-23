// The fudge cookie: a round brown cookie with a dark red fudge swirl and yellow chips, turning on its edge like a coin.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { inked, toon } from '../toon.ts';
import { createPickup } from './pickup.ts';
import { candy, ellipsoid, lathe, scatter } from './shared.ts';

/** The model is a little smaller than the sprite art before its scale factor is applied. */
const fit = 0.94;

let discGeometry: THREE.BufferGeometry | null = null,
	fudgeGeometry: THREE.BufferGeometry | null = null,
	chipGeometry: THREE.BufferGeometry | null = null;

/** The cookie lies about the Y axis and is stood up by its group, so its two faces are +Y and -Y here. */
function build(body: THREE.Group): void {
	discGeometry ??= lathe([
		[0, -0.1],
		[0.38, -0.1],
		[0.45, -0.07],
		[0.47, 0],
		[0.45, 0.07],
		[0.38, 0.1],
		[0, 0.1],
	]);
	fudgeGeometry ??= lathe([
		[0, 0.128],
		[0.16, 0.124],
		[0.27, 0.105],
		[0.3, 0.085],
		[0.3, 0.07],
	]);
	if (!chipGeometry) {
		const spots: [number, number, number, number, number, number][] = [];
		for (const side of [-1, 1])
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * Math.PI * 2 + (side > 0 ? 0 : Math.PI / 8);
				spots.push([Math.cos(a) * 0.37, side * 0.095, Math.sin(a) * 0.37, 0.05, 0.022, 0.05]);
			}
		chipGeometry = scatter(spots);
	}
	const cookie = new THREE.Group();
	cookie.rotation.x = Math.PI / 2;
	cookie.scale.setScalar(fit);
	cookie.add(inked(discGeometry, toon(candy.brown, { emissive: 0x2a1200 }), 0.03));
	for (const side of [1, -1]) {
		const fudge = new THREE.Mesh(fudgeGeometry, toon(candy.darkRed, { emissive: 0x330000 }));
		fudge.scale.y = side;
		const spot = new THREE.Mesh(ellipsoid(0.1, 0.03, 0.1), toon(candy.brown));
		spot.position.y = side * 0.125;
		cookie.add(fudge, spot);
	}
	cookie.add(new THREE.Mesh(chipGeometry, toon(candy.yellow, { emissive: 0x666622 })));
	body.add(cookie);
}

export function createCookie(first: SpriteDraw): Actor {
	return createPickup({ build, size: 0.875, glow: 0xffaa44, reach: 0.55, spin: 1.0 }, first);
}
