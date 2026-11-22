// The Spore pod: a purple bulb on a green stem that swells, then squeezes out a puff every three seconds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { castScale } from '../cast-scale.ts';
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
} from './parts.ts';

const headRadius = 0.37,
	stemHeight = 0.28,
	/** The bulb is wider than it is tall, as in the sprite, so a stem shows below it. */
	flatten = 0.82,
	/** The sim's puff is the last second of a three second cycle; the pod starts to swell about 0.8 s before it. */
	idleSeconds = 2,
	swellSeconds = 0.8,
	puffs = 6;

let stemGeometry: THREE.BufferGeometry | null = null;
let leafGeometry: THREE.BufferGeometry | null = null;

function stem(): THREE.BufferGeometry {
	stemGeometry ??= new THREE.CylinderGeometry(0.06, 0.085, 1, 12).translate(0, 0.5, 0);
	return stemGeometry;
}

/** A leaf blade that grows out along +X from its base. */
function leaf(): THREE.BufferGeometry {
	leafGeometry ??= new THREE.SphereGeometry(1, 20, 12)
		.scale(0.13, 0.03, 0.06)
		.translate(0.11, 0, 0);
	return leafGeometry;
}

export function createPod(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		motion = new Motion(),
		root = new THREE.Group(),
		turn = new THREE.Group(),
		stalk = new THREE.Group(),
		head = new THREE.Group(),
		antenna = new THREE.Group(),
		mouthHole = new THREE.Group(),
		outward = new THREE.Vector3(),
		forward = new THREE.Vector3(0, 0, 1);
	root.scale.setScalar(castScale);
	root.add(turn);
	turn.add(stalk);
	stalk.add(head);

	const stemMesh = part(stalk, tint, stem(), ega.darkGreen, { ink: 0.02 });
	stemMesh.scale.set(1, stemHeight + 0.1, 1);
	const leaves: THREE.Mesh[] = [];
	for (const side of [-1, 1]) {
		const blade = part(turn, tint, leaf(), ega.green, { ink: 0.018 });
		blade.position.set(side * 0.03, 0.1, 0.02);
		blade.scale.x = side;
		leaves.push(blade);
	}

	part(head, tint, ellipsoid(headRadius, headRadius * 0.98, headRadius), ega.purple);
	/* Pink bumps stud the bulb. */
	const bumps: readonly [number, number, number][] = [
		[-0.55, 0.55, 0.65],
		[0.55, 0.5, 0.7],
		[-0.9, -0.1, 0.35],
		[0.95, -0.05, 0.25],
		[0.1, 0.95, 0.2],
		[-0.35, -0.55, 0.75],
		[0.4, -0.5, 0.75],
		[0, 0.4, -0.9],
	];
	for (const [x, y, z] of bumps) {
		outward.set(x, y, z).normalize();
		const bump = part(head, tint, ellipsoid(0.065, 0.065, 0.03), ega.pink, { ink: 0 });
		bump.position.copy(outward).multiplyScalar(headRadius * 0.99);
		bump.quaternion.setFromUnitVectors(forward, outward);
	}
	const eyes = [
		new Eye(head, tint, 0.085, [-0.12, 0.07, headRadius * 0.9]),
		new Eye(head, tint, 0.085, [0.12, 0.07, headRadius * 0.9]),
	];
	mouthHole.position.set(0, -0.09, headRadius * 0.93);
	part(mouthHole, tint, ellipsoid(0.06, 0.05, 0.02), 0x330033, { ink: 0 });
	head.add(mouthHole);

	/* A thin antenna with a pink bobble pops up when the pod puffs, as in the second sprite frame. */
	part(
		antenna,
		tint,
		new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6).translate(0, 0.11, 0),
		ega.black,
		{
			ink: 0,
		},
	);
	part(antenna, tint, ellipsoid(0.065, 0.065, 0.065), ega.pink, { pos: [0, 0.25, 0], ink: 0.015 });
	antenna.position.y = headRadius * 0.92;
	head.add(antenna);

	/* The burst: a few glowing bubbles thrown out from the bulb during the puff. */
	const burst: THREE.Mesh[] = [];
	for (let i = 0; i < puffs; i++) {
		const bubble = part(root, tint, ellipsoid(0.07, 0.07, 0.07), i % 2 ? ega.pink : 0xff99ff, {
			ink: 0,
			emissive: 0x663366,
		});
		bubble.visible = false;
		bubble.userData.effect = true;
		burst.push(bubble);
	}

	let sinceIdle = 0,
		wasPuff = first.name === 'pod1',
		puffTime = wasPuff ? 0 : 9,
		swell = 0,
		popped = 0,
		wilt = 0,
		sway = 0;

	return {
		object: root,
		update(draw, frame) {
			const dt = frame.dt,
				t = frame.time,
				stunned = isStunned(draw),
				puffing = draw.name === 'pod1' && !stunned;
			motion.track(draw, dt);
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y - draw.h / 2 + 1 / 16, 0);
			turn.rotation.y = 0.25;

			/* Time since the last puff ended tells how close the next one is, so the bulb can swell before it. */
			if (puffing) {
				if (!wasPuff) puffTime = 0;
				puffTime += dt;
				sinceIdle = 0;
			} else {
				sinceIdle = stunned ? 0 : sinceIdle + dt;
				puffTime = 9;
			}
			wasPuff = puffing;
			const ready = stunned
				? 0
				: clamp((sinceIdle - (idleSeconds - swellSeconds)) / swellSeconds, 0, 1);
			swell = ease(swell, ready, 14, dt);
			popped = ease(popped, puffing ? 1 : 0, puffing ? 22 : 9, dt);
			wilt = ease(wilt, stunned ? 1 : 0, 5, dt);
			const rest = Math.sin(t * 1.7 + seed * 6),
				squeeze = popped,
				sy = flatten * (1 + swell * 0.06 - squeeze * 0.16 + rest * 0.012),
				sxz = 1 + swell * 0.03 - rest * 0.006;
			head.scale.set(sxz, sy, sxz);
			sway = ease(
				sway,
				Math.sin(t * 1.3 + seed * 4) * 0.06 + swell * Math.sin(t * 38) * 0.03,
				12,
				dt,
			);
			stalk.rotation.z = sway + wilt * 0.12;
			/* A wilted pod bows its head right down towards the front; the stem bends over. */
			stalk.rotation.x = wilt * 0.35;
			head.position.set(
				0,
				stemHeight + headRadius * flatten * 0.95 - wilt * 0.06 - squeeze * 0.05,
				0,
			);
			head.rotation.z = wilt * 0.45;
			head.rotation.x = wilt * 0.3;
			antenna.scale.setScalar(Math.max(popped, 0.001) * (1 + Math.sin(t * 30) * 0.05));
			antenna.rotation.z = Math.sin(t * 14) * 0.2 * popped;
			mouthHole.scale.set(1 + popped * 0.9, 0.4 + popped * 1.5 + swell * 0.4, 1);
			/* The leaves droop outward from the stem's foot; the left one is mirrored, so it turns the other way. */
			leaves[0].rotation.z = 0.3 + rest * 0.04 + wilt * 0.5 - swell * 0.15;
			leaves[1].rotation.z = -(0.3 - rest * 0.04 + wilt * 0.5 - swell * 0.15);

			lookAtHero(draw.x, draw.y + 0.9, 0.25, frame.ben, 12);
			for (let i = 0; i < eyes.length; i++) {
				if (stunned) eyes[i].dizzy(t, i * 2.4 + seed);
				else eyes[i].gaze();
				eyes[i].blink(stunned ? 0.3 : clamp(blinkAmount(t, seed) + popped * 0.9, 0, 1));
			}

			/* Throw the bubbles out sideways and let them fall back, fading as they shrink. */
			for (let i = 0; i < burst.length; i++) {
				const bubble = burst[i],
					k = puffTime / 1.0,
					live = puffing && k < 1;
				bubble.visible = live;
				if (!live) continue;
				const side = i % 2 ? 1 : -1,
					angle = 0.3 + ((i >> 1) / 3) * 0.9,
					run = 0.8 * Math.sqrt(k) + (i >> 1) * 0.08;
				bubble.position.set(
					side * Math.cos(angle) * run * 0.9,
					stemHeight + headRadius * flatten + 0.1 + Math.sin(angle) * run * 0.6 - k * k * 0.45,
					0.05 * (i - 3),
				);
				bubble.scale.setScalar(Math.max(0.05, (1 - k) * (0.7 + 0.2 * (i % 3))));
			}
		},
		dispose: () => release(root),
	};
}
