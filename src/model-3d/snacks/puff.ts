// The puff: a cartoon cloud with a ring and sparks that swells and fades while the sim counts it out.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { clamp, ellipsoid, phaseOf, sparkleGeometry } from './shared.ts';

const blobs = 7,
	sparks = 4;

let ringGeometry: THREE.TorusGeometry | null = null;

/**
 * The sim draws a puff as one sprite that starts at half a tile and grows by one and a half tiles a second while its alpha
 * runs from 1 to 0 over its life, tinted for what made it (white for a pop, yellow for a hit, cyan for Ben's shot landing,
 * red for an enemy shot landing, grey for crumbling ground). The model reads progress from that alpha and size from the
 * sprite's width.
 */
export function createPuff(first: SpriteDraw): Actor {
	const seed = phaseOf(first.x, first.y),
		root = new THREE.Group(),
		cloud = new THREE.Group(),
		cloudMaterial = new THREE.MeshToonMaterial({
			color: 0xffffff,
			emissive: 0x555555,
			transparent: true,
			depthWrite: false,
		}),
		lightMaterial = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide,
		}),
		puffs: THREE.Mesh[] = [],
		twinkles: THREE.Mesh[] = [];
	ringGeometry ??= new THREE.TorusGeometry(0.5, 0.035, 6, 36);
	const ring = new THREE.Mesh(ringGeometry, lightMaterial);
	for (let i = 0; i < blobs; i++) {
		const blob = new THREE.Mesh(ellipsoid(1, 1, 1), cloudMaterial),
			a = (i / blobs) * Math.PI * 2 + seed;
		blob.userData.angle = a;
		blob.userData.size = i === 0 ? 0.26 : 0.17 + 0.04 * Math.sin(i * 2.3);
		puffs.push(blob);
		cloud.add(blob);
	}
	for (let i = 0; i < sparks; i++) {
		const spark = new THREE.Mesh(sparkleGeometry(), lightMaterial);
		spark.userData.angle = (i / sparks) * Math.PI * 2 + seed + 0.4;
		twinkles.push(spark);
		root.add(spark);
	}
	root.add(cloud, ring);
	let tint = -1;

	return {
		object: root,
		update(draw, frame) {
			const progress = clamp(1 - draw.alpha, 0, 1),
				t = frame.time;
			/* Puffs sit in front of the creatures they hide. */
			root.position.set(draw.x, draw.y, 0.4);
			root.scale.setScalar(draw.w);
			if (draw.tint !== tint) {
				tint = draw.tint;
				cloudMaterial.color.setHex(tint);
				lightMaterial.color.setHex(tint);
			}
			cloudMaterial.opacity = clamp(draw.alpha * 1.1, 0, 1) * 0.92;
			lightMaterial.opacity = draw.alpha;
			cloud.rotation.z = progress * 1.2;
			for (let i = 0; i < puffs.length; i++) {
				const blob = puffs[i],
					a: number = blob.userData.angle,
					size: number = blob.userData.size,
					spread = i === 0 ? 0 : 0.28 + progress * 0.12;
				blob.position.set(
					Math.cos(a) * spread,
					Math.sin(a) * spread * 0.9,
					Math.sin(a * 2 + seed) * 0.08,
				);
				blob.scale.setScalar(size * (1 + progress * 0.35 + Math.sin(t * 9 + i) * 0.03));
			}
			ring.scale.setScalar(0.8 + progress * 0.45);
			ring.visible = progress > 0.02;
			for (const spark of twinkles) {
				const a: number = spark.userData.angle,
					out = 0.45 + progress * 0.4;
				spark.position.set(Math.cos(a) * out, Math.sin(a) * out, 0.1);
				spark.scale.setScalar(0.3 * Math.sin(Math.min(1, progress * 1.15) * Math.PI));
				spark.rotation.z = a + progress * 2;
			}
		},
		dispose() {
			cloudMaterial.dispose();
			lightMaterial.dispose();
			root.clear();
		},
	};
}
