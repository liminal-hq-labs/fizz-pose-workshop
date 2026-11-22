// The Marshmallow blob: a round white bouncer with a pink base that stretches in flight and squashes on landing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import {
	Motion,
	Tint,
	blinkAmount,
	clamp,
	ease,
	ega,
	ellipsoid,
	isStunned,
	look,
	lookAtHero,
	part,
	release,
	seedOf,
} from './parts.ts';

const radius = 0.43,
	/** Marshmallows turn less than the others so the face stays in view. */
	turnAngle = 0.62;

let baseGeometry: THREE.BufferGeometry | null = null;

/** The pink band: the lower part of a sphere a hair larger than the white body. */
function base(): THREE.BufferGeometry {
	baseGeometry ??= new THREE.SphereGeometry(
		1.012,
		28,
		10,
		0,
		Math.PI * 2,
		Math.PI * 0.66,
		Math.PI * 0.34,
	).scale(radius, radius * 1.05, radius);
	return baseGeometry;
}

export function createMarsh(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		motion = new Motion(),
		root = new THREE.Group(),
		turn = new THREE.Group(),
		body = new THREE.Group(),
		face = new THREE.Group(),
		outward = new THREE.Vector3(),
		forward = new THREE.Vector3(0, 0, 1);
	root.add(turn);
	turn.add(body);
	body.add(face);

	part(body, tint, ellipsoid(radius, radius * 1.05, radius), ega.white);
	part(body, tint, base(), ega.pink, { ink: 0 });
	/* A grey shine on the upper left, as in the sprite. */
	outward.set(-0.5, 0.75, 0.55).normalize();
	const shine = part(body, tint, ellipsoid(0.07, 0.045, 0.02), ega.grey, { ink: 0 });
	shine.position.copy(outward).multiplyScalar(radius * 1.05);
	shine.quaternion.setFromUnitVectors(forward, outward);
	for (const side of [-1, 1]) {
		outward.set(side * 0.36, -0.06, 0.93).normalize();
		const cheek = part(body, tint, ellipsoid(0.07, 0.04, 0.02), 0xffaaff, { ink: 0 });
		cheek.position.copy(outward).multiplyScalar(radius * 1.03);
		cheek.quaternion.setFromUnitVectors(forward, outward);
	}
	/* The face rides on the front of the body and shifts a little towards what the blob is looking at. */
	const eyes: THREE.Mesh[] = [];
	for (const side of [-1, 1]) {
		const eye = part(face, tint, ellipsoid(0.058, 0.08, 0.03), ega.black, { ink: 0 });
		eye.position.set(side * 0.15, 0.08, 0);
		part(eye, tint, ellipsoid(0.014, 0.018, 0.01), ega.white, { ink: 0, pos: [0.012, 0.02, 0.02] });
		eyes.push(eye);
	}
	part(face, tint, ellipsoid(0.034, 0.024, 0.02), ega.purple, { ink: 0, pos: [0, -0.04, 0.0] });
	face.position.z = radius * 0.97;

	let yaw = (first.flip ? 1 : -1) * turnAngle,
		squish = first.name === 'marsh1' ? -0.36 : 0.04,
		jelly = 0,
		wasLow = squish < 0;

	return {
		object: root,
		update(draw, frame) {
			const dt = frame.dt,
				t = frame.time,
				stunned = isStunned(draw),
				low = draw.name === 'marsh1';
			motion.track(draw, dt);
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y - draw.h / 2 + 1 / 16, 0);

			yaw = ease(yaw, (draw.flip ? 1 : -1) * turnAngle, 8, dt);
			turn.rotation.y = yaw;

			/* Frame 1 is the landing squash; frame 0 the round, rising ball. Real vertical speed stretches it on top. */
			if (low && !wasLow) jelly = 1;
			wasLow = low;
			jelly = ease(jelly, 0, 5, dt);
			const target = (low ? -0.36 : 0.03) + clamp(motion.vy * 0.018, -0.12, 0.2);
			squish = ease(squish, target, 20, dt);
			const wobble = jelly * Math.sin(t * 26) * 0.07,
				sy = 1 + squish + wobble,
				sxz = 1 - squish * 0.55 - wobble * 0.5;
			body.scale.set(sxz, sy, sxz);
			body.position.y = radius * 1.05 * sy;
			turn.rotation.z =
				clamp(-motion.vx * 0.045, -0.15, 0.15) + (stunned ? 0 : Math.sin(t * 3 + seed * 5) * 0.015);

			lookAtHero(draw.x, draw.y + 0.3, yaw, frame.ben, 12);
			const blink = blinkAmount(t, seed);
			face.position.x = look.x * 0.05;
			face.position.y = look.y * 0.04;
			for (const eye of eyes) eye.scale.y = 1 - 0.9 * blink;
		},
		dispose: () => release(root),
	};
}
