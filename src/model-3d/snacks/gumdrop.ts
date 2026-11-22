// The gumdrop key: a sugar-dusted dome of red, blue or green gum that opens the matching cookie door.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { inked, toon } from '../toon.ts';
import { createPickup } from './pickup.ts';
import { candy, ellipsoid, lathe, scatter, shade } from './shared.ts';

/** A gumdrop colour: the gum itself and the halo that matches it. */
export interface GumColour {
	gum: number;
	glow: number;
}

export const gumColours: Record<string, GumColour> = {
	red: { gum: candy.red, glow: 0xff4444 },
	blue: { gum: 0x6666ff, glow: 0x4477ff },
	green: { gum: candy.green, glow: 0x44ff66 },
};

let domeGeometry: THREE.BufferGeometry | null = null,
	sugarGeometry: THREE.BufferGeometry | null = null;

function dome(): THREE.BufferGeometry {
	if (!domeGeometry) {
		const profile: [number, number][] = [
			[0, -0.3],
			[0.34, -0.3],
			[0.41, -0.26],
		];
		for (let i = 1; i <= 14; i++) {
			const a = (i / 14) * (Math.PI / 2);
			profile.push([0.41 * Math.cos(a) ** 0.75, -0.26 + 0.56 * Math.sin(a) ** 0.85]);
		}
		domeGeometry = lathe(profile, 36);
	}
	return domeGeometry;
}

/** Sugar grains on the dome's surface, spread by the golden angle and merged into one geometry. */
function sugar(): THREE.BufferGeometry {
	if (!sugarGeometry) {
		const spots: [number, number, number, number, number, number][] = [],
			golden = Math.PI * (3 - Math.sqrt(5));
		for (let i = 0; i < 26; i++) {
			const h = 0.05 + (i / 26) * 0.9,
				a = i * golden,
				y = -0.26 + 0.56 * h,
				r = 0.41 * (1 - h ** 1.7) ** 0.62 + 0.012;
			spots.push([Math.cos(a) * r, y, Math.sin(a) * r, 0.025, 0.025, 0.025]);
		}
		sugarGeometry = scatter(spots);
	}
	return sugarGeometry;
}

export function createGumdrop(first: SpriteDraw, colour: GumColour): Actor {
	return createPickup(
		{
			glow: colour.glow,
			reach: 0.5,
			spin: 1.4,
			build(body) {
				body.add(inked(dome(), toon(colour.gum, { emissive: shade(colour.gum, 0.25) }), 0.03));
				body.add(new THREE.Mesh(sugar(), toon(candy.white, { emissive: 0x888888 })));
				for (const side of [-1, 1]) {
					const shine = new THREE.Mesh(
						ellipsoid(0.07, 0.11, 0.03),
						toon(candy.white, { emissive: 0xcccccc }),
					);
					shine.position.set(-0.16 * side, 0.13, side * 0.3);
					shine.rotation.set(0, side * -0.5, 0.35 * side);
					body.add(shine);
				}
			},
		},
		first,
	);
}
