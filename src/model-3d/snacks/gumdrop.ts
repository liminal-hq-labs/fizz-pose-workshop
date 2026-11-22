// The gumdrop key: a sugar-dusted dome of red, blue or green gum that opens the matching cookie door.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { castScale } from '../cast-scale.ts';
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

/** The dome's size in the model's own units: the sprite's art is 0.75 wide and 0.69 tall, and the cast scale is applied on top. */
const radius = 0.355,
	height = 0.66,
	bottom = -height / 2;

let domeGeometry: THREE.BufferGeometry | null = null,
	sugarGeometry: THREE.BufferGeometry | null = null;

function dome(): THREE.BufferGeometry {
	if (!domeGeometry) {
		const profile: [number, number][] = [
			[0, bottom],
			[radius - 0.07, bottom],
			[radius, bottom + 0.04],
		];
		for (let i = 1; i <= 14; i++) {
			const a = (i / 14) * (Math.PI / 2);
			profile.push([
				radius * Math.cos(a) ** 0.75,
				bottom + 0.04 + (height - 0.04) * Math.sin(a) ** 0.85,
			]);
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
				y = bottom + 0.04 + (height - 0.04) * h,
				r = radius * (1 - h ** 1.7) ** 0.62 + 0.012;
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
			/* The art sits 1/16 tile above the bottom of its box, which leaves its middle a little below the sprite's. */
			centre: -0.094 / castScale,
			build(body) {
				body.add(inked(dome(), toon(colour.gum, { emissive: shade(colour.gum, 0.25) }), 0.03));
				body.add(new THREE.Mesh(sugar(), toon(candy.white, { emissive: 0x888888 })));
				for (const side of [-1, 1]) {
					const shine = new THREE.Mesh(
						ellipsoid(0.07, 0.11, 0.03),
						toon(candy.white, { emissive: 0xcccccc }),
					);
					shine.position.set(-0.15 * side, 0.1, side * 0.27);
					shine.rotation.set(0, side * -0.5, 0.35 * side);
					body.add(shine);
				}
			},
		},
		first,
	);
}
