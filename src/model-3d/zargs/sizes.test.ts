// Checks that each creature's solid silhouette is its sprite's art size times the cast scale, and that its base sits where the art's does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import type { SpriteDraw } from '../../level-3d/types.ts';
import { castScale } from '../cast-scale.ts';
import { enemyModels } from './enemies.ts';

/**
 * The opaque part of each sprite in `sprites.png`, in tiles: the box the sim draws it in, the art's size, and how far the
 * art's bottom sits above the box's bottom.
 */
const art: Record<string, { box: [number, number]; w: number; h: number; gap: number }> = {
	gloop0: { box: [1, 1], w: 0.875, h: 0.9375, gap: 0 },
	gloop1: { box: [1, 1], w: 1, h: 0.8125, gap: 0 },
	hopper0: { box: [1, 1], w: 0.75, h: 0.8125, gap: 0 },
	hopper1: { box: [1, 1], w: 0.75, h: 1, gap: 0 },
	marsh0: { box: [1, 1], w: 0.875, h: 0.8125, gap: 0 },
	marsh1: { box: [1, 1], w: 1, h: 0.5625, gap: 0 },
	pod0: { box: [1, 1], w: 0.75, h: 0.875, gap: 0 },
	pod1: { box: [1, 1], w: 0.75, h: 1, gap: 0 },
	drone0: { box: [1, 1], w: 0.875, h: 0.875, gap: 0.125 },
	drone1: { box: [1, 1], w: 0.875, h: 0.875, gap: 0.125 },
	spore0: { box: [1, 1], w: 0.8125, h: 0.625, gap: 0.3125 },
	spore1: { box: [1, 1], w: 0.9375, h: 0.875, gap: 0.0625 },
	zshot: { box: [0.5, 0.5], w: 0.375, h: 0.375, gap: 0.0625 },
};

const family = (name: string): string => enemyModels.family(name) as string,
	/** Creatures that stand on the ground rest one pixel up; the spore puffs keep their art's bottom where it is. */
	standing = new Set(['gloop', 'hopper', 'marsh', 'pod']);

/** The bounds of every visible, opaque mesh that is part of the creature itself rather than its outline, glow or effects. */
function solidBounds(root: THREE.Object3D): THREE.Box3 {
	root.updateWorldMatrix(true, true);
	const box = new THREE.Box3(),
		point = new THREE.Vector3();
	root.traverse((object) => {
		const mesh = object as THREE.Mesh;
		if (!mesh.isMesh || mesh.userData.ink || mesh.userData.effect) return;
		for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (!o.visible) return;
		const material = mesh.material as THREE.Material;
		if (material.blending === THREE.AdditiveBlending) return;
		if (material.transparent && material.opacity < 0.5) return;
		const position = mesh.geometry.getAttribute('position');
		for (let i = 0; i < position.count; i++)
			box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
	});
	return box;
}

test('each creature is its art times the cast scale, in both frames, with its base where the art is', () => {
	const at = { x: 10, y: 6 };
	for (const [name, a] of Object.entries(art)) {
		const draw: SpriteDraw = {
				name,
				x: at.x,
				y: at.y,
				w: a.box[0],
				h: a.box[1],
				flip: false,
				rot: 0,
				tint: 0xffffff,
				alpha: 1,
				emissive: false,
				order: 0,
			},
			actor = enemyModels.create(family(name), draw);
		let time = 5,
			width = 0,
			height = 0,
			base = Infinity;
		for (let i = 0; i < 90; i++) {
			time += 1 / 60;
			actor.update(draw, {
				time,
				dt: 1 / 60,
				ben: { x: 6, y: 6 },
				camera: { x: 6, y: 6, z: 16 },
				draws: [draw],
			});
			if (i < 40) continue;
			const box = solidBounds(actor.object);
			width = Math.max(width, box.max.x - box.min.x);
			height = Math.max(height, box.max.y - box.min.y);
			base = Math.min(base, box.min.y);
		}
		const bottom = at.y - a.box[1] / 2 + a.gap,
			targetHeight = a.h * castScale,
			wantBase = standing.has(family(name))
				? bottom + 1 / 16
				: family(name) === 'spore'
					? bottom
					: bottom + a.h / 2 - targetHeight / 2;
		expect(Math.abs(width / (a.w * castScale) - 1), `${name} width`).toBeLessThan(0.1);
		expect(Math.abs(height / targetHeight - 1), `${name} height`).toBeLessThan(0.1);
		expect(Math.abs(base - wantBase), `${name} base`).toBeLessThan(0.06);
		actor.dispose?.();
	}
});

test('a round creature is about as deep as it is wide', () => {
	for (const name of ['gloop0', 'marsh0', 'pod0', 'drone0', 'hopper0']) {
		const a = art[name],
			draw: SpriteDraw = {
				name,
				x: 10,
				y: 6,
				w: a.box[0],
				h: a.box[1],
				flip: false,
				rot: 0,
				tint: 0xffffff,
				alpha: 1,
				emissive: false,
				order: 0,
			},
			actor = enemyModels.create(family(name), draw);
		for (let i = 0; i < 60; i++)
			actor.update(draw, {
				time: 5 + i / 60,
				dt: 1 / 60,
				ben: { x: 6, y: 6 },
				camera: { x: 6, y: 6, z: 16 },
				draws: [draw],
			});
		const size = solidBounds(actor.object).getSize(new THREE.Vector3());
		expect(size.z, name).toBeGreaterThan(size.x * 0.7);
		expect(size.z, name).toBeLessThan(size.x * 1.3);
		actor.dispose?.();
	}
});
