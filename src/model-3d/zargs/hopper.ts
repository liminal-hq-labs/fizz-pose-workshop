// The Crater hopper: a one-eyed yellow blob on springy legs that squashes on landing and stretches in the air.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { creatureScale } from '../cast-scale.ts';
import {
	Eye,
	Motion,
	Tint,
	blinkAmount,
	clamp,
	ease,
	ega,
	ellipsoid,
	isStunned,
	lookAtHero,
	part,
	release,
	seedOf,
	threeQuarter,
} from './parts.ts';

/** The model, boots and all, is a touch smaller than the sprite art before its scale factor is applied. */
const fit = 0.91,
	bodyRadius = 0.36,
	bootHeight = 0.09;

let legGeometry: THREE.BufferGeometry | null = null;

/** A unit-height leg whose top sits at the origin and which hangs down; scaled in Y to set its length. */
function leg(): THREE.BufferGeometry {
	legGeometry ??= new THREE.CylinderGeometry(0.055, 0.045, 1, 12).translate(0, -0.5, 0);
	return legGeometry;
}

export function createHopper(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		motion = new Motion(),
		root = new THREE.Group(),
		turn = new THREE.Group(),
		rock = new THREE.Group(),
		body = new THREE.Group(),
		eyeSpot = new THREE.Vector3(0, 0.3, 1).normalize().multiplyScalar(bodyRadius * 0.86);
	root.scale.setScalar(creatureScale * fit);
	root.add(turn);
	turn.add(rock);
	rock.add(body);

	part(body, tint, ellipsoid(bodyRadius, bodyRadius * 1.04, bodyRadius), ega.yellow);
	/* Brown freckles lie flat on the body: each is a small disc turned to face outwards. */
	const spots: readonly [number, number, number, number][] = [
		[-0.9, 0.25, 0.3, 0.06],
		[-0.7, -0.35, 0.6, 0.05],
		[0.95, 0.1, -0.15, 0.05],
		[-0.3, 0.8, -0.5, 0.045],
		[0.3, -0.6, -0.7, 0.05],
		[-0.4, -0.1, -0.9, 0.055],
	];
	const outward = new THREE.Vector3(),
		forward = new THREE.Vector3(0, 0, 1);
	for (const [x, y, z, size] of spots) {
		outward.set(x, y, z).normalize();
		const spot = part(body, tint, ellipsoid(size, size, size * 0.35), ega.brown, { ink: 0 });
		spot.position.copy(outward).multiplyScalar(bodyRadius * 0.99);
		spot.quaternion.setFromUnitVectors(forward, outward);
	}
	const eye = new Eye(body, tint, 0.17, [eyeSpot.x, eyeSpot.y, eyeSpot.z]);
	part(body, tint, ellipsoid(0.045, 0.03, 0.03), ega.red, {
		pos: [0.04, -0.15, bodyRadius * 0.95],
		ink: 0,
	});

	/* The legs and boots hang from the body; the body rises on them in the air. */
	const legs: { group: THREE.Group; shaft: THREE.Mesh; side: number }[] = [];
	for (const side of [-1, 1]) {
		const group = new THREE.Group(),
			shaft = part(group, tint, leg(), ega.darkBrown, { ink: 0.015 });
		part(group, tint, ellipsoid(0.12, bootHeight, 0.18), ega.brown, {
			pos: [0, 0, 0.04],
			ink: 0.02,
		});
		root.add(group);
		legs.push({ group, shaft, side });
	}
	const boots = legs.map((l) => l.group.children[1]);

	let yaw = (first.flip ? 1 : -1) * threeQuarter,
		air = first.name === 'hopper1' ? 1 : 0,
		land = 0,
		slump = 0,
		wasAir = air > 0;

	return {
		object: root,
		update(draw, frame) {
			const dt = frame.dt,
				t = frame.time,
				stunned = isStunned(draw),
				flying = draw.name === 'hopper1' && !stunned;
			motion.track(draw, dt);
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y - draw.h / 2 + 1 / 16, 0);

			yaw = ease(yaw, (draw.flip ? 1 : -1) * threeQuarter, 10, dt);
			turn.rotation.y = yaw;

			/* Frame 1 is the airborne stretch. Touching down kicks a squash that settles back out. */
			air = ease(air, flying ? 1 : 0, 18, dt);
			if (wasAir && !flying) land = 1;
			wasAir = flying;
			land = ease(land, 0, 7, dt);
			slump = ease(slump, stunned ? 1 : 0, 6, dt);

			const stretch = clamp(motion.vy / 13, -0.6, 1),
				breathe = Math.sin(t * 2.6 + seed * 6) * 0.015,
				squash = land * Math.sin(t * 30) * 0.02 + land * 0.22 + slump * 0.12,
				sy = 1 + stretch * 0.12 * air - squash + breathe,
				sxz = 1 - (sy - 1) * 0.5,
				legLength = (0.03 + 0.24 * air) * (1 - slump * 0.6) * (1 - land * 0.5),
				bodyY = bootHeight * 1.2 + legLength + bodyRadius * sy * 1.02;
			body.scale.set(sxz, sy, sxz);
			body.position.y = bodyY;
			rock.rotation.z = slump * (-0.22 + Math.sin(t * 2.2) * 0.1);
			rock.position.x = slump * 0.05;
			body.rotation.x = -clamp(motion.vy * 0.02, -0.2, 0.25) * air;

			for (const { group, shaft, side } of legs) {
				group.position.set(
					side * (0.17 + slump * 0.12 + air * 0.03),
					bootHeight * 1.2 + legLength,
					0.02,
				);
				shaft.scale.set(1, Math.max(legLength, 0.001), 1);
				group.rotation.z = side * (0.12 * air + slump * 0.55);
				group.rotation.x = -0.05 * air;
			}
			for (const boot of boots) boot.position.y = -legLength - bootHeight * 0.2;

			lookAtHero(draw.x, draw.y + 0.5, yaw, frame.ben, 14);
			if (stunned) eye.dizzy(t, seed * 3);
			else eye.gaze();
			eye.blink(stunned ? 0 : blinkAmount(t, seed));
		},
		dispose: () => release(root),
	};
}
