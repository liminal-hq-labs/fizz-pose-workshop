// The common frame of a pickup: a model that turns slowly, a soft glow behind it and an occasional twinkle.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import {
	candy,
	glowGeometry,
	glowMaterial,
	phaseOf,
	sparkleGeometry,
	sparkleMaterial,
} from './shared.ts';

/** What makes one pickup different from another. */
export interface PickupLook {
	/** Adds the solid parts to `body`, which turns about its own vertical axis. The model fills about one tile. */
	build(body: THREE.Group): void;
	/** The colour of the halo behind the pickup. */
	glow: number;
	/** How far from the centre the twinkles may land, in tiles. */
	reach?: number;
	/** The turning rate in radians a second. */
	spin?: number;
}

const twinkleEvery = 2.6,
	twinkleFor = 0.5;

/**
 * Builds the actor for a pickup. The sim already bobs pickups up and down in the sprite's position, so the model only
 * turns and glows. Each pickup starts at a phase taken from its position, so a row of them ripples instead of marching.
 */
export function createPickup(look: PickupLook, first: SpriteDraw): Actor {
	const phase = phaseOf(first.x, first.y),
		root = new THREE.Group(),
		body = new THREE.Group(),
		halo = new THREE.Mesh(glowGeometry(), glowMaterial(look.glow, 0.5)),
		twinkle = new THREE.Mesh(sparkleGeometry(), sparkleMaterial(candy.white, true)),
		reach = look.reach ?? 0.5,
		spin = look.spin ?? 1.2;
	look.build(body);
	halo.position.z = -0.25;
	halo.renderOrder = -1;
	twinkle.position.z = 0.35;
	twinkle.visible = false;
	root.add(halo, body, twinkle);

	return {
		object: root,
		update(draw, frame) {
			const t = frame.time;
			root.position.set(draw.x, draw.y, 0);
			root.scale.setScalar(draw.w);
			body.rotation.y = t * spin + phase;
			body.rotation.z = Math.sin(t * 1.7 + phase) * 0.07;
			body.rotation.x = Math.sin(t * 1.3 + phase * 2) * 0.05;
			halo.scale.setScalar(2 + Math.sin(t * 2.6 + phase) * 0.18);
			const clock = (t + phase * 0.6) / twinkleEvery,
				cycle = Math.floor(clock),
				local = (clock - cycle) * (twinkleEvery / twinkleFor);
			if (local < 1) {
				const a = phase + cycle * 2.4;
				twinkle.visible = true;
				twinkle.position.x = Math.cos(a) * reach;
				twinkle.position.y = Math.sin(a) * reach * 0.9 + 0.1;
				twinkle.scale.setScalar(0.5 * Math.sin(local * Math.PI));
				twinkle.rotation.z = local * 1.5;
			} else twinkle.visible = false;
		},
		dispose: () => root.clear(),
	};
}
