// The Gravity drone: a spinning-top flier with a yellow ring, googly eyes and pulses of gravity rolling out beneath it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import {
	Eye,
	Motion,
	Tint,
	clamp,
	ease,
	ega,
	ellipsoid,
	lookAtHero,
	part,
	release,
	seedOf,
} from './parts.ts';

const beads = 8;

let topGeometry: THREE.BufferGeometry | null = null;
let bottomGeometry: THREE.BufferGeometry | null = null;

function profile(points: readonly [number, number][]): THREE.BufferGeometry {
	return new THREE.LatheGeometry(
		points.map(([r, y]) => new THREE.Vector2(r, y)),
		32,
	);
}

/** The dome above the ring. */
function top(): THREE.BufferGeometry {
	topGeometry ??= profile([
		[0.44, 0],
		[0.43, 0.06],
		[0.38, 0.14],
		[0.3, 0.23],
		[0.2, 0.3],
		[0.1, 0.34],
		[0.0, 0.35],
	]);
	return topGeometry;
}

/** The point below the ring, like the tip of a spinning top. */
function bottom(): THREE.BufferGeometry {
	bottomGeometry ??= profile([
		[0.0, -0.42],
		[0.06, -0.4],
		[0.15, -0.32],
		[0.28, -0.2],
		[0.38, -0.09],
		[0.44, 0],
	]);
	return bottomGeometry;
}

export function createDrone(first: SpriteDraw): Actor {
	const tint = new Tint(),
		seed = seedOf(first),
		motion = new Motion(),
		root = new THREE.Group(),
		craft = new THREE.Group(),
		ring = new THREE.Group(),
		ringBeads: THREE.Mesh[] = [],
		pulses: THREE.Mesh[] = [],
		pulseMaterials: THREE.MeshBasicMaterial[] = [];
	root.add(craft);

	part(craft, tint, top(), ega.pink, { ink: 0.025 });
	part(craft, tint, bottom(), ega.purple, { ink: 0.025 });
	part(craft, tint, new THREE.TorusGeometry(0.435, 0.05, 10, 40).rotateX(Math.PI / 2), ega.yellow, {
		emissive: 0x665500,
		ink: 0.02,
	});
	for (let i = 0; i < beads; i++) {
		const a = (i / beads) * Math.PI * 2,
			bead = part(ring, tint, ellipsoid(0.055, 0.055, 0.055), i % 2 ? ega.white : ega.yellow, {
				pos: [Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46],
				ink: 0.015,
				emissive: 0x888844,
			});
		ringBeads.push(bead);
	}
	craft.add(ring);
	/* The grey cap and its little yellow button crown the dome. */
	part(craft, tint, new THREE.CylinderGeometry(0.07, 0.085, 0.14, 14), ega.grey, {
		pos: [0, 0.4, 0],
		ink: 0.02,
	});
	part(craft, tint, ellipsoid(0.09, 0.04, 0.09), ega.yellow, { pos: [0, 0.48, 0], ink: 0.015 });

	const eyes = [
		new Eye(craft, tint, 0.1, [-0.15, 0.15, 0.31]),
		new Eye(craft, tint, 0.1, [0.15, 0.15, 0.31]),
	];
	eyes[0].root.rotation.y = -0.3;
	eyes[1].root.rotation.y = 0.3;

	/* Rings of gravity ripple down from under the drone. Each has its own material so it can fade. */
	const ripple = new THREE.TorusGeometry(0.4, 0.012, 6, 36).rotateX(Math.PI / 2);
	for (let i = 0; i < 2; i++) {
		const material = new THREE.MeshBasicMaterial({
				color: ega.cyan,
				transparent: true,
				opacity: 0,
				depthWrite: false,
			}),
			mesh = new THREE.Mesh(ripple, material);
		craft.add(mesh);
		pulses.push(mesh);
		pulseMaterials.push(material);
	}

	let spin = 0,
		bankX = 0,
		bankZ = 0;

	return {
		object: root,
		update(draw, frame) {
			const dt = frame.dt,
				t = frame.time;
			motion.track(draw, dt);
			tint.apply(draw.tint, draw.alpha);
			root.position.set(draw.x, draw.y, 0);

			/* It banks into its sweeps, noses with its climb, and bobs on top of the sim's path. */
			bankZ = ease(bankZ, clamp(-motion.vx * 0.07, -0.3, 0.3), 8, dt);
			bankX = ease(bankX, clamp(-motion.vy * 0.03, -0.25, 0.25), 8, dt);
			craft.rotation.set(bankX, clamp(motion.vx * 0.05, -0.25, 0.25) + 0.15, bankZ);
			craft.position.y = Math.sin(t * 5 + seed * 6) * 0.015;

			/* The ring spins fast; the two sprite frames flash the beads. */
			spin += dt * 7;
			ring.rotation.y = spin;
			const flash = draw.name === 'drone1';
			for (let i = 0; i < ringBeads.length; i++)
				ringBeads[i].scale.setScalar((i % 2 === 0) === flash ? 1.25 : 0.85);

			for (let i = 0; i < pulses.length; i++) {
				const k = (t * 0.9 + i * 0.5 + seed) % 1;
				pulses[i].position.y = -0.3 - k * 0.5;
				pulses[i].scale.setScalar(0.25 + k * 0.7);
				pulseMaterials[i].opacity = 0.55 * (1 - k) * Math.min(1, k * 5);
			}

			lookAtHero(draw.x, draw.y + 0.1, craft.rotation.y, frame.ben, 14);
			for (let i = 0; i < eyes.length; i++) {
				eyes[i].gaze();
				eyes[i].blink(0);
			}
		},
		dispose() {
			for (const material of pulseMaterials) material.dispose();
			release(root);
		},
	};
}
