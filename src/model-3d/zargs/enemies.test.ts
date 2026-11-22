// Checks that the enemy model set claims every sprite it owns and that each creature builds, animates and disposes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import type { FrameContext, SpriteDraw } from '../../level-3d/types.ts';
import { enemyModels } from './enemies.ts';

const families: Record<string, string[]> = {
	gloop: ['gloop0', 'gloop1'],
	hopper: ['hopper0', 'hopper1'],
	marsh: ['marsh0', 'marsh1'],
	pod: ['pod0', 'pod1'],
	spore: ['spore0', 'spore1'],
	drone: ['drone0', 'drone1'],
	zshot: ['zshot'],
};

function drawOf(name: string, x: number, y: number, extra: Partial<SpriteDraw> = {}): SpriteDraw {
	const size = name === 'zshot' ? 0.5 : 1;
	return {
		name,
		x,
		y,
		w: size,
		h: size,
		flip: false,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: false,
		order: 0,
		...extra,
	};
}

function frameOf(time: number, draws: SpriteDraw[]): FrameContext {
	return { time, dt: 1 / 60, ben: { x: 3, y: 5 }, camera: { x: 3, y: 5, z: 16 }, draws };
}

test('every sprite maps to its family, and both frames of a creature share one', () => {
	for (const [family, names] of Object.entries(families))
		for (const name of names) expect(enemyModels.family(name)).toBe(family);
	expect(enemyModels.family('ben_run0')).toBeNull();
	expect(enemyModels.family('craterTop')).toBeNull();
	expect(enemyModels.family('toString')).toBeNull();
});

test('each creature builds, follows its sprite through both frames and stuns, and disposes', () => {
	for (const [family, names] of Object.entries(families)) {
		const first = drawOf(names[0], 7.5, 4.5),
			actor = enemyModels.create(family, first);
		expect(actor.object.children.length).toBeGreaterThan(0);
		let time = 0;
		for (const stunned of [false, true])
			for (const flip of [false, true])
				for (const name of names) {
					const at = { x: 12.25 + (flip ? 1 : 0), y: 6.5 },
						draw = drawOf(name, at.x, at.y, {
							flip,
							tint: stunned ? 0xaaaaaa : 0xffffff,
							alpha: name.startsWith('spore') ? 0.9 : 1,
						});
					for (let i = 0; i < 8; i++) {
						time += 1 / 60;
						actor.update(draw, frameOf(time, [draw]));
					}
					expect(actor.object.position.x).toBeCloseTo(at.x, 5);
					/* Standing creatures keep their feet at the sprite's bottom edge; floating ones are centred on it. */
					const standing = ['gloop', 'hopper', 'marsh', 'pod'].includes(family);
					expect(actor.object.position.y).toBeCloseTo(
						standing ? at.y - draw.h / 2 + 1 / 16 : at.y,
						5,
					);
					expect(actor.object.position.z).toBe(0);
				}
		actor.dispose?.();
		expect(actor.object.children.length).toBe(0);
	}
});

test('a creature that is not drawn for a while keeps working when it returns with a long frame', () => {
	const actor = enemyModels.create('hopper', drawOf('hopper0', 0, 4.5));
	const draw = drawOf('hopper1', 5, 6);
	actor.update(draw, {
		time: 1,
		dt: 0.1,
		ben: { x: 9, y: 4 },
		camera: { x: 9, y: 4, z: 16 },
		draws: [draw],
	});
	actor.update(draw, {
		time: 1,
		dt: 0,
		ben: { x: 9, y: 4 },
		camera: { x: 9, y: 4, z: 16 },
		draws: [draw],
	});
	expect(Number.isFinite(actor.object.position.y)).toBe(true);
	actor.dispose?.();
});
