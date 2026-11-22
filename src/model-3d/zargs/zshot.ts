// The enemy shot: a glowing red bolt with a yellow core that stretches along its flight and spits sparks behind it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { Motion, Tint, clamp, ease, ega, ellipsoid, part, release, seedOf } from './parts.ts';

const sparks = 3;

export function createZshot(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		motion = new Motion(),
		root = new THREE.Group(),
		bolt = new THREE.Group(),
		trail: THREE.Mesh[] = [];
	root.add(bolt);
	part(bolt, tint, ellipsoid(0.2, 0.2, 0.2), ega.red, { emissive: 0x992222, ink: 0.018 });
	part(bolt, tint, ellipsoid(0.12, 0.12, 0.12), ega.yellow, {
		emissive: 0xffff55,
		ink: 0,
		pos: [0, 0, 0.12],
	});
	for (let i = 0; i < sparks; i++)
		trail.push(
			part(bolt, tint, ellipsoid(0.07, 0.07, 0.07), i % 2 ? ega.yellow : ega.red, {
				emissive: 0x883333,
				ink: 0,
			}),
		);
	let angle = 0,
		stretch = 1;

	return {
		object: root,
		update(draw, frame) {
			const dt = frame.dt,
				t = frame.time;
			motion.track(draw, dt);
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y, 0);

			/* The bolt points along its flight and lengthens with its speed; a still bolt stays round. */
			const speed = Math.hypot(motion.vx, motion.vy);
			if (speed > 0.5) angle = Math.atan2(motion.vy, motion.vx);
			stretch = ease(stretch, 1 + clamp(speed * 0.06, 0, 0.6), 12, dt);
			bolt.rotation.z = angle;
			const pulse = 1 + Math.sin(t * 24 + seed * 6) * 0.1;
			bolt.scale.set(stretch * pulse, pulse, pulse);
			for (let i = 0; i < trail.length; i++) {
				const k = (i + 1) / trail.length;
				trail[i].position.set(-0.22 - k * 0.3, Math.sin(t * 18 + i * 2 + seed * 5) * 0.06, 0);
				trail[i].scale.setScalar(1 - k * 0.7);
			}
		},
		dispose: () => release(root),
	};
}
