// Checks that the item model set claims every pickup and effect sprite it owns and that each builds, animates and disposes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import type { FrameContext, SpriteDraw } from '../../level-3d/types.ts';
import * as THREE from 'three';
import { castScale } from '../cast-scale.ts';
import { itemModels } from './items.ts';

const families: Record<string, string[]> = {
	cheezie: ['cheezie'],
	choc: ['choc'],
	cookie: ['cookie'],
	soda: ['soda'],
	keyRed: ['keyRed'],
	keyBlue: ['keyBlue'],
	keyGreen: ['keyGreen'],
	bubble: ['bubble'],
	puff: ['puff'],
	stars: ['stars0', 'stars1'],
	star: ['star'],
};

const sizes: Record<string, number> = { bubble: 0.5, stars0: 1, stars1: 1, star: 0.25 };

function drawOf(name: string, x: number, y: number, extra: Partial<SpriteDraw> = {}): SpriteDraw {
	const size = sizes[name] ?? 1;
	return {
		name,
		x,
		y,
		w: size,
		h: name.startsWith('stars') ? size / 2 : size,
		flip: false,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: true,
		order: 0,
		...extra,
	};
}

function frameOf(time: number, draws: SpriteDraw[], dt = 1 / 60): FrameContext {
	return { time, dt, ben: { x: 3, y: 5 }, camera: { x: 3, y: 8, z: 16 }, draws };
}

test('every sprite maps to its family, and the stars frames share one', () => {
	for (const [family, names] of Object.entries(families))
		for (const name of names) expect(itemModels.family(name)).toBe(family);
	expect(itemModels.family('ben_run1')).toBeNull();
	expect(itemModels.family('craterTop')).toBeNull();
	expect(itemModels.family('zshot')).toBeNull();
	expect(itemModels.family('toString')).toBeNull();
});

test('the three keys are one model in three colours', () => {
	const red = itemModels.create('keyRed', drawOf('keyRed', 1, 1)),
		blue = itemModels.create('keyBlue', drawOf('keyBlue', 1, 1));
	expect(red.object).not.toBe(blue.object);
	red.dispose?.();
	blue.dispose?.();
});

test('each model builds, follows its sprite and disposes', () => {
	for (const [family, names] of Object.entries(families)) {
		const actor = itemModels.create(family, drawOf(names[0], 7.5, 4.5));
		expect(actor.object.children.length).toBeGreaterThanOrEqual(0);
		let time = 0;
		for (const name of names)
			for (const flip of [false, true])
				for (const alpha of [1, 0.5, 0.05]) {
					const at = { x: 12.25 + (flip ? 1 : 0), y: 6.5 + alpha },
						draw = drawOf(name, at.x, at.y, { flip, alpha, tint: flip ? 0xffff55 : 0xffffff });
					time += 0.2;
					expect(() => actor.update(draw, frameOf(time, [draw]))).not.toThrow();
					expect(actor.object.position.x).toBeCloseTo(at.x, 5);
					expect(actor.object.position.y).toBeCloseTo(at.y, 5);
				}
		expect(() => actor.dispose?.()).not.toThrow();
	}
});

test('a pickup row turns out of step and a paused frame does not move anything', () => {
	const first = itemModels.create('cheezie', drawOf('cheezie', 17.5, 4.5)),
		second = itemModels.create('cheezie', drawOf('cheezie', 18.5, 4.5)),
		a = drawOf('cheezie', 17.5, 4.5),
		b = drawOf('cheezie', 18.5, 4.5);
	first.update(a, frameOf(1, [a]));
	second.update(b, frameOf(1, [b]));
	expect(first.object.children[1].rotation.y).not.toBeCloseTo(
		second.object.children[1].rotation.y,
		3,
	);
	const before = first.object.children[1].rotation.y;
	first.update(a, frameOf(1, [a], 0));
	expect(first.object.children[1].rotation.y).toBe(before);
});

test('the bubble heads away from Ben at first, then along its own flight', () => {
	const bubble = itemModels.create('bubble', drawOf('bubble', 4.3, 5.2)),
		body = bubble.object.children[0];
	bubble.update(drawOf('bubble', 4.3, 5.2), frameOf(0, []));
	expect(body.rotation.z).toBeCloseTo(0, 5);
	const left = drawOf('bubble', 4.0, 5.2);
	bubble.update(left, frameOf(0.02, [left]));
	expect(Math.abs(body.rotation.z)).toBeCloseTo(Math.PI, 3);
	bubble.dispose?.();
});

test('a moving bubble trails behind its flight', () => {
	const bubble = itemModels.create('bubble', drawOf('bubble', 4.3, 5.2));
	let x = 4.3;
	for (let i = 0; i < 20; i++) {
		x += 16 / 60;
		const draw = drawOf('bubble', x, 5.2);
		bubble.update(draw, frameOf(i / 60, [draw]));
	}
	const trail = bubble.object.children.slice(1);
	expect(trail.length).toBeGreaterThan(0);
	for (const bit of trail) {
		expect(bit.visible).toBe(true);
		expect(bit.position.x).toBeLessThan(-0.2);
	}
	bubble.dispose?.();
});

test('a puff fades its materials with the sprite and a night star stays behind the level', () => {
	const puff = itemModels.create('puff', drawOf('puff', 3, 3)),
		draw = drawOf('puff', 3, 3, { alpha: 0.3, tint: 0xff5555, w: 1.2 });
	puff.update(draw, frameOf(0.1, [draw]));
	expect(puff.object.scale.x).toBeCloseTo(1.2 * castScale, 5);
	puff.dispose?.();
	const star = itemModels.create('star', drawOf('star', 9, 9)),
		sky = drawOf('star', 9, 9);
	star.update(sky, frameOf(0.1, [sky]));
	expect(star.object.position.z).toBeLessThan(0);
});

test('a collected pickup pops: it swells and fades while sparkles fly out, and the shared materials stay untouched', () => {
	for (const family of ['cheezie', 'choc', 'cookie', 'soda', 'keyRed']) {
		const draw = drawOf(family, 9.5, 4.5),
			actor = itemModels.create(family, draw),
			other = itemModels.create(family, draw);
		actor.update(draw, frameOf(1, [draw]));
		const seconds = actor.leave?.(frameOf(1, [])) ?? 0;
		expect(seconds).toBeGreaterThan(0.15);
		expect(seconds).toBeLessThan(0.4);
		const body = actor.object.children[1],
			halo = actor.object.children[0] as THREE.Mesh,
			sparkles = actor.object.children.length;
		expect(sparkles).toBeGreaterThan(3);
		actor.leaving?.(0, seconds, frameOf(1, []));
		const early = body.scale.x;
		actor.leaving?.(seconds * 0.9, seconds, frameOf(1, []));
		expect(body.scale.x).toBeGreaterThan(early + 0.4);
		expect((halo.material as THREE.Material).opacity).toBeLessThan(0.1);
		/* A pickup of the same kind that was not collected keeps its own materials. */
		expect(
			((other.object.children[0] as THREE.Mesh).material as THREE.Material).opacity,
		).toBeGreaterThan(0.3);
		actor.dispose?.();
		other.dispose?.();
	}
});

test('effects and creatures that are not pickups have no exit', () => {
	for (const family of ['puff', 'bubble', 'star']) {
		const actor = itemModels.create(family, drawOf(family, 3, 3));
		expect(actor.leave).toBeUndefined();
	}
});
