// The common frame of a pickup: a model that turns slowly, a soft glow behind it and an occasional twinkle.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import {
	candy,
	clamp,
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
/** How long the pop lasts when a pickup is collected, in seconds, and how many sparkles fly out. */
const popFor = 0.28,
	popSparks = 8;

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
	let fading: THREE.Material[] = [],
		sparks: THREE.Mesh[] = [];
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
		/*
		 * Collected: the model swells and fades while a ring of sparkles flies out. The materials are shared, so the body
		 * and halo get their own fading copies for the pop; the outline shell just goes.
		 */
		leave() {
			body.traverse((part) => {
				const mesh = part as THREE.Mesh;
				if (!mesh.isMesh) return;
				if (mesh.userData.ink) {
					mesh.visible = false;
					return;
				}
				const copy = (mesh.material as THREE.Material).clone();
				copy.transparent = true;
				copy.userData.base = copy.opacity;
				mesh.material = copy;
				fading.push(copy);
			});
			const haloCopy = halo.material.clone();
			halo.material = haloCopy;
			haloCopy.userData.base = haloCopy.opacity;
			fading.push(haloCopy);
			twinkle.visible = false;
			for (let i = 0; i < popSparks; i++) {
				const spark = new THREE.Mesh(
					sparkleGeometry(),
					sparkleMaterial(i % 2 ? candy.white : look.glow, true),
				);
				spark.position.z = 0.4;
				spark.userData.angle = (i / popSparks) * Math.PI * 2 + phase;
				sparks.push(spark);
				root.add(spark);
			}
			return popFor;
		},
		leaving(elapsed, duration) {
			const p = clamp(elapsed / duration, 0, 1),
				out = 1 - (1 - p) * (1 - p);
			body.scale.setScalar(1 + 0.9 * out);
			for (const material of fading)
				material.opacity = (material.userData.base as number) * (1 - p);
			halo.scale.setScalar(2 + 1.6 * out);
			for (let i = 0; i < sparks.length; i++) {
				const spark = sparks[i],
					a: number = spark.userData.angle,
					reach = 0.3 + 0.75 * out * (i % 2 ? 0.8 : 1);
				spark.position.x = Math.cos(a) * reach;
				spark.position.y = Math.sin(a) * reach;
				spark.scale.setScalar((i % 2 ? 0.34 : 0.46) * Math.sin(Math.min(1, p * 1.1) * Math.PI));
				spark.rotation.z = a + p * 2;
			}
		},
		dispose() {
			for (const material of fading) material.dispose();
			fading = [];
			sparks = [];
			root.clear();
		},
	};
}
