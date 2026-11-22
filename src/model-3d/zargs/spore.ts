// The spore puffs: a drifting cluster of glowing pink and purple bubbles that the Spore pod leaves on the ground.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { castScale } from '../cast-scale.ts';
import { Tint, ease, ega, ellipsoid, part, release, seedOf } from './parts.ts';

/** Where each bubble floats in the cluster, with its size, as x, y, z and radius. */
const bubbles: readonly [number, number, number, number][] = [
	[-0.28, 0.18, 0.05, 0.1],
	[0.05, 0.3, -0.05, 0.13],
	[0.3, 0.1, 0.1, 0.09],
	[-0.08, -0.05, 0.12, 0.11],
	[0.18, -0.25, -0.08, 0.07],
	[-0.32, -0.22, -0.05, 0.06],
	[0.36, 0.32, 0.0, 0.05],
	[-0.15, 0.4, 0.1, 0.045],
];

/**
 * The layout's own extent runs about 0.79 wide and 0.77 tall around (0.015, 0.06). The two sprite frames are different
 * sizes, and the art's bottom sits higher in the first: each pose stretches the layout to its frame's art, in tiles of the
 * model's own units (the cast scale is applied on top).
 */
const poses = [
	{ kx: 0.93, ky: 0.73, centre: 0.17 },
	{ kx: 1.19, ky: 1.14, centre: 0.109 },
] as const;

/** The soft halo round a cluster; shared by every cluster, never changed. */
const halo = new THREE.MeshBasicMaterial({
	color: ega.pink,
	transparent: true,
	opacity: 0.18,
	depthWrite: false,
});

export function createSpore(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		root = new THREE.Group(),
		meshes: THREE.Mesh[] = [];
	for (let i = 0; i < bubbles.length; i++) {
		const [, , , r] = bubbles[i];
		meshes.push(
			part(root, tint, ellipsoid(r, r, r), i % 3 === 0 ? ega.purple : ega.pink, {
				ink: 0.012,
				emissive: i % 3 === 0 ? 0x550055 : 0x993399,
			}),
		);
	}
	root.scale.setScalar(castScale);
	const glow = new THREE.Mesh(ellipsoid(0.55, 0.45, 0.4), halo);
	root.add(glow);
	let pulse = first.name === 'spore1' ? 1 : 0;

	return {
		object: root,
		update(draw, frame) {
			const t = frame.time;
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y, 0);
			/* The two sprite frames alternate fast; the bubbles swell on one and relax on the other. */
			pulse = ease(pulse, draw.name === 'spore1' ? 1 : 0, 16, frame.dt);
			const kx = poses[0].kx + (poses[1].kx - poses[0].kx) * pulse,
				ky = poses[0].ky + (poses[1].ky - poses[0].ky) * pulse,
				centre = poses[0].centre + (poses[1].centre - poses[0].centre) * pulse;
			for (let i = 0; i < meshes.length; i++) {
				const [x, y, z] = bubbles[i],
					phase = seed * 6 + i * 1.7;
				meshes[i].position.set(
					(x - 0.015) * kx + Math.sin(t * 1.9 + phase) * 0.02,
					(y - 0.06) * ky + centre + Math.sin(t * 3.1 + phase) * 0.02,
					z + Math.cos(t * 2.3 + phase) * 0.03,
				);
				meshes[i].scale.setScalar(1 + (i % 2 ? pulse : 1 - pulse) * 0.22);
			}
			glow.scale.setScalar(0.95 + pulse * 0.1);
			glow.position.y = centre;
		},
		dispose: () => release(root),
	};
}
