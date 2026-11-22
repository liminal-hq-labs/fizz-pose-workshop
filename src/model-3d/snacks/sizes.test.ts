// Checks that each pickup and effect is its sprite's art size times the cast scale, and that it sits where the art does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import type { SpriteDraw } from '../../level-3d/types.ts';
import { castScale } from '../cast-scale.ts';
import { itemModels } from './items.ts';

/**
 * The opaque part of each sprite in `sprites.png`, in tiles: the box the sim draws it in, the art's size, and how far the
 * art's bottom sits above the box's bottom.
 */
const art: Record<string, { box: [number, number]; w: number; h: number; gap: number }> = {
	cheezie: { box: [1, 1], w: 0.625, h: 0.9375, gap: 0 },
	choc: { box: [1, 1], w: 1, h: 0.5, gap: 0.25 },
	cookie: { box: [1, 1], w: 0.875, h: 0.875, gap: 0.0625 },
	soda: { box: [1, 1], w: 0.5, h: 0.9375, gap: 0 },
	keyRed: { box: [1, 1], w: 0.75, h: 0.6875, gap: 0.0625 },
	keyBlue: { box: [1, 1], w: 0.75, h: 0.6875, gap: 0.0625 },
	keyGreen: { box: [1, 1], w: 0.75, h: 0.6875, gap: 0.0625 },
	bubble: { box: [0.5, 0.5], w: 0.375, h: 0.375, gap: 0.0625 },
	puff: { box: [1, 1], w: 0.875, h: 0.875, gap: 0.0625 },
	stars0: { box: [1, 0.5], w: 0.6875, h: 0.375, gap: 0.125 },
	stars1: { box: [1, 0.5], w: 0.75, h: 0.375, gap: 0.125 },
};

/** The bounds of every visible, opaque mesh that is part of the model itself rather than its outline or glow. */
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

test('each pickup and effect is its art times the cast scale, over a whole turn, about the art centre', () => {
	for (const [name, a] of Object.entries(art)) {
		const draw: SpriteDraw = {
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
			family = itemModels.family(name) as string,
			actor = itemModels.create(family, draw),
			slow = name === 'bubble',
			frames = slow ? 120 : 70;
		let width = 0,
			height = 0,
			base = Infinity,
			time = 5;
		for (let i = 0; i < frames; i++) {
			/* Pickups and stars turn with the clock, so a long step walks them through a full turn; a bubble settles. */
			time += slow ? 1 / 60 : 0.1;
			actor.update(draw, {
				time,
				dt: 1 / 60,
				ben: { x: 6, y: 6 },
				camera: { x: 6, y: 6, z: 16 },
				draws: [draw],
			});
			if (slow && i < 60) continue;
			const box = solidBounds(actor.object);
			width = Math.max(width, box.max.x - box.min.x);
			height = Math.max(height, box.max.y - box.min.y);
			base = Math.min(base, box.min.y);
		}
		const targetHeight = a.h * castScale,
			centre = draw.y - a.box[1] / 2 + a.gap + a.h / 2,
			wantBase = centre - targetHeight / 2;
		expect(Math.abs(width / (a.w * castScale) - 1), `${name} width`).toBeLessThan(0.1);
		expect(Math.abs(height / targetHeight - 1), `${name} height`).toBeLessThan(0.1);
		expect(Math.abs(base - wantBase), `${name} base`).toBeLessThan(0.06);
		actor.dispose?.();
	}
});
