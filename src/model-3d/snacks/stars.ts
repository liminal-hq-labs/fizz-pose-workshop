// The dizzy stars that circle above a stunned enemy, and the single twinkling star of the night sky.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { creatureScale } from '../cast-scale.ts';
import { depth } from '../toon.ts';
import { candy, clamp, ease, phaseOf, sparkleGeometry, sparkleMaterial } from './shared.ts';

const orbiting = 3,
	/** The art sits 1/16 tile above the middle of its box, which is 1/16 / creatureScale in the model's own units. */
	centre = 1 / 16 / creatureScale;

/**
 * Three bright yellow stars on a tilted ring round the sprite's centre, which the sim puts above the stunned head. The sim
 * swaps between `stars0` and `stars1` six times a second; the model turns that swap into a bounce in their size. The ring
 * is as wide as the sprite.
 */
export function createDizzyStars(first: SpriteDraw): Actor {
	const seed = phaseOf(first.x, first.y),
		root = new THREE.Group(),
		stars: THREE.Group[] = [];
	root.scale.setScalar(creatureScale);
	for (let i = 0; i < orbiting; i++) {
		const star = new THREE.Group(),
			back = new THREE.Mesh(sparkleGeometry(), sparkleMaterial(candy.black, false)),
			front = new THREE.Mesh(sparkleGeometry(), sparkleMaterial(candy.yellow, false)),
			glow = new THREE.Mesh(sparkleGeometry(), sparkleMaterial(candy.white, false));
		back.scale.setScalar(1.28);
		back.userData.ink = true;
		back.position.z = -0.01;
		glow.scale.setScalar(0.4);
		glow.position.z = 0.01;
		star.add(back, front, glow);
		stars.push(star);
		root.add(star);
	}
	let bounce = 1;

	return {
		object: root,
		update(draw, frame) {
			const t = frame.time,
				dt = frame.dt,
				reach = draw.w * 0.29;
			root.position.set(draw.x, draw.y, 0);
			bounce = ease(bounce, draw.name === 'stars1' ? 1.08 : 0.96, 28, dt);
			for (let i = 0; i < stars.length; i++) {
				const a = -t * 4.2 + (i / orbiting) * Math.PI * 2 + seed,
					star = stars[i],
					near = Math.sin(a);
				star.position.set(Math.cos(a) * reach, centre + Math.sin(a * 2) * 0.09, near * 0.3);
				/* The stars passing in front are a little bigger than those behind. */
				star.scale.setScalar(0.2 * bounce * (1 + near * 0.18));
				star.rotation.z = t * 3 + i * 1.3;
			}
		},
		dispose: () => root.clear(),
	};
}

/**
 * A star of the night sky: a small twinkle that the sim fades in and out by alpha and tints white, yellow or cyan. It sits
 * just in front of the backdrop. Its size follows the alpha too, so it swells as it brightens.
 */
export function createNightStar(): Actor {
	const star = new THREE.Mesh(sparkleGeometry(), sparkleMaterial(candy.white, true));
	let tint = 0xffffff;
	return {
		object: star,
		update(draw) {
			star.position.set(draw.x, draw.y, depth.backdrop + 0.5);
			if (draw.tint !== tint) {
				tint = draw.tint;
				star.material = sparkleMaterial(tint, true);
			}
			star.scale.setScalar(draw.w * 2.6 * (0.35 + 0.65 * clamp(draw.alpha, 0, 1)));
			star.rotation.z = draw.rot + draw.x * 0.7;
		},
	};
}
