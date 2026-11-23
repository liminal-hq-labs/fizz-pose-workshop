// The chocolate bar: a brown bar with a yellow band, wrapped in red paper that twists into bows at both ends.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { inked, toon } from '../toon.ts';
import { createPickup } from './pickup.ts';
import { candy, ellipsoid } from './shared.ts';

let barGeometry: THREE.BufferGeometry | null = null;

function build(body: THREE.Group): void {
	barGeometry ??= new RoundedBoxGeometry(0.54, 0.37, 0.34, 5, 0.09);
	body.add(inked(barGeometry, toon(candy.brown, { emissive: 0x2a1200 }), 0.03));
	/* The yellow label band and the dark red groove run right round the bar, so they show from the back too. */
	const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.352), toon(candy.yellow));
	band.position.y = 0.06;
	const groove = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.352), toon(candy.darkRed));
	groove.position.y = -0.07;
	body.add(band, groove);
	for (const end of [-1, 1]) {
		const wrapper = toon(candy.red, { emissive: 0x331111 }),
			knot = inked(ellipsoid(0.06, 0.15, 0.12), wrapper, 0.025);
		knot.position.x = end * 0.29;
		body.add(knot);
		for (const bow of [-1, 1]) {
			const fan = inked(ellipsoid(0.13, 0.1, 0.045), wrapper, 0.025);
			fan.position.set(end * 0.385, bow * 0.115, 0);
			fan.rotation.z = end * bow * 0.6;
			body.add(fan);
		}
	}
	const shine = new THREE.Mesh(
		ellipsoid(0.1, 0.025, 0.02),
		toon(candy.white, { emissive: 0x999999 }),
	);
	shine.position.set(-0.1, 0.13, 0.17);
	body.add(shine);
}

export function createChoc(first: SpriteDraw): Actor {
	return createPickup({ build, size: 1, glow: 0xffa040, reach: 0.55, spin: 1.1 }, first);
}
