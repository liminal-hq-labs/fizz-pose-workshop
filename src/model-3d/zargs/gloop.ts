// The Gloop: a green eyestalk slug that stretches and squashes along the ground and wilts when it is stunned.
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
	look,
	lookAtHero,
	part,
	release,
	seedOf,
	threeQuarter,
} from './parts.ts';

/**
 * The model is drawn a little narrower and lower than the sprite art, which the stalks and the eye rise out of; the cast
 * scale then takes it to the hero's proportions.
 */
const fitWidth = 0.97,
	fitHeight = 0.96;

let segmentGeometry: THREE.BufferGeometry | null = null;

/** A unit-length stalk segment that rises from the origin; scaled in Y to set its length. */
function segment(): THREE.BufferGeometry {
	segmentGeometry ??= new THREE.CylinderGeometry(0.04, 0.047, 1, 12).translate(0, 0.5, 0);
	return segmentGeometry;
}

/** One eyestalk: a lower segment, an elbow that bends it forward, an upper segment and an eye on the end. */
class Stalk {
	readonly root = new THREE.Group();
	private readonly elbow = new THREE.Group();
	readonly eye: Eye;

	constructor(tint: Tint, size: number, eyeRadius: number) {
		const lower = part(this.root, tint, segment(), ega.green, { ink: 0.018 });
		lower.scale.set(size, 0.2 * size, size);
		this.elbow.position.y = 0.2 * size;
		this.root.add(this.elbow);
		part(this.elbow, tint, ellipsoid(0.052 * size, 0.052 * size, 0.052 * size), ega.green, {
			ink: 0.018,
		});
		const upper = part(this.elbow, tint, segment(), ega.green, { ink: 0.018 });
		upper.scale.set(size, 0.16 * size, size);
		this.eye = new Eye(this.elbow, tint, eyeRadius, [0, 0.16 * size + eyeRadius * 0.55, 0]);
	}

	/** `lean` tilts the whole stalk forward and `bend` hooks the upper part further over. */
	pose(lean: number, bend: number, side: number): void {
		this.root.rotation.set(lean, 0, side);
		this.elbow.rotation.x = bend;
	}
}

export function createGloop(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		motion = new Motion(),
		root = new THREE.Group(),
		turn = new THREE.Group(),
		body = new THREE.Group(),
		tall = new Stalk(tint, 1, 0.13),
		small = new Stalk(tint, 0.78, 0.09);
	root.add(turn);
	root.scale.set(creatureScale * fitWidth, creatureScale * fitHeight, creatureScale * fitWidth);
	turn.add(body, tall.root, small.root);

	part(body, tint, ellipsoid(0.34, 0.25, 0.47), ega.green, { pos: [0, 0.26, 0] });
	part(body, tint, ellipsoid(0.38, 0.065, 0.5), ega.darkGreen, { pos: [0, 0.07, 0.01] });
	for (const side of [-1, 1]) {
		part(body, tint, ellipsoid(0.03, 0.045, 0.06), ega.yellow, {
			pos: [side * 0.325, 0.19, 0.14],
			rot: [0, 0, side * -0.25],
			ink: 0,
		});
		part(body, tint, ellipsoid(0.026, 0.04, 0.05), ega.yellow, {
			pos: [side * 0.3, 0.17, -0.18],
			ink: 0,
		});
	}
	part(body, tint, ellipsoid(0.08, 0.04, 0.1), ega.white, {
		pos: [-0.12, 0.47, -0.02],
		rot: [0.1, 0, 0.3],
		ink: 0,
		emissive: 0x555555,
	});
	/* The smile is a dark arc on the face. */
	part(body, tint, new THREE.TorusGeometry(0.075, 0.014, 6, 14, Math.PI), ega.black, {
		pos: [0, 0.2, 0.455],
		rot: [0, 0, Math.PI],
		ink: 0,
	});

	tall.root.position.set(0.04, 0.4, 0.2);
	small.root.position.set(-0.16, 0.38, 0.14);
	const bigEye = tall.eye,
		smallEye = small.eye;

	let yaw = (first.flip ? 1 : -1) * threeQuarter,
		stretch = 0,
		droop = 0;

	return {
		object: root,
		update(draw, frame) {
			const dt = frame.dt,
				t = frame.time,
				stunned = isStunned(draw);
			motion.track(draw, dt);
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y - draw.h / 2 + 1 / 16, 0);

			yaw = ease(yaw, (draw.flip ? 1 : -1) * threeQuarter, 9, dt);
			turn.rotation.y = yaw;

			/* Frame 0 is the tall stretch and frame 1 the low squash; the body eases between them. A stun flattens it fully. */
			const target = stunned ? 1.25 : draw.name === 'gloop1' ? 1 : 0;
			stretch = ease(stretch, target, stunned ? 6 : 14, dt);
			droop = ease(droop, stunned ? 1 : 0, 5, dt);
			const moving = clamp(Math.abs(motion.vx) / 1.5, 0, 1),
				ripple = Math.sin(t * 11 + seed * 6) * 0.03 * moving,
				pant = stunned ? Math.sin(t * 5) * 0.03 : 0,
				sy = 1.14 - 0.32 * stretch + pant,
				sz = 0.93 + 0.2 * stretch + ripple,
				sx = 0.98 + 0.08 * stretch;
			body.scale.set(sx, sy, sz);
			body.rotation.z = stunned ? Math.sin(t * 8) * 0.05 : Math.sin(t * 6 + seed) * 0.02 * moving;
			body.rotation.x = -0.05 * moving * Math.sin(t * 11 + seed * 6);

			/* The stalks ride the top of the body and sway. When the slug is dazed they flop back and the eyes dangle. */
			const rise = 0.4 * sy,
				sway = Math.sin(t * 2.4 + seed * 9) * 0.1 + (stunned ? 0 : (0.5 - stretch) * 0.12);
			tall.root.position.y = rise;
			small.root.position.y = rise - 0.02;
			tall.pose(
				-droop * 0.5 + 0.1 * Math.sin(t * 3.1 + seed),
				0.55 + droop * 1.9 + 0.12 * Math.sin(t * 2.2 + seed * 3),
				sway,
			);
			small.pose(
				-droop * 0.7 + 0.12 * Math.sin(t * 3.7 + 1 + seed),
				0.4 + droop * 2.1 + 0.15 * Math.sin(t * 2.9 + seed * 5),
				-sway * 1.3,
			);

			const blink = stunned ? 0 : blinkAmount(t, seed);
			lookAtHero(draw.x, draw.y + 0.6, yaw, frame.ben, 12);
			if (stunned) {
				bigEye.dizzy(t, 0);
				smallEye.dizzy(t, 2.1);
			} else {
				bigEye.gaze();
				smallEye.aim(look.x * 0.9, look.y * 0.9, look.z);
			}
			bigEye.blink(blink);
			smallEye.blink(stunned ? 0 : blinkAmount(t + 0.9, seed + 0.4));
		},
		dispose: () => release(root),
	};
}
