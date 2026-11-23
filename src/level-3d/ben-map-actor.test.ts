// Checks the hero's model set for the overworld: which sprites it claims, how he stands, turns and plants his feet.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { type BenMapActor, benMapModels } from './ben-map-actor.ts';
import { wrap } from './ben-rig.ts';
import type { FrameContext, SpriteDraw } from './types.ts';

/** The hero's sprite is 16 pixels square: one tile, drawn with its bottom edge on his feet. */
function drawAt(x: number, y: number, name = 'benMap0'): SpriteDraw {
	return {
		name,
		x,
		y: y + 0.5,
		w: 1,
		h: 1,
		flip: false,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: false,
		order: 0,
	};
}
const landmark = (x: number, y: number, name = 'owLmCrater'): SpriteDraw => ({
	...drawAt(x, y),
	name,
	h: 1.5,
});
const frameOf = (draw: SpriteDraw, time: number, draws?: readonly SpriteDraw[]): FrameContext => ({
	time,
	dt: 1 / 60,
	ben: { x: draw.x, y: draw.y },
	camera: { x: draw.x, y: draw.y - 4, z: 20 },
	mode: 'map',
	draws: draws ?? [draw],
});
const make = (draw: SpriteDraw): BenMapActor => benMapModels.create('benMap', draw) as BenMapActor;
const pointOf = (object: THREE.Object3D): THREE.Vector3 => {
	object.updateWorldMatrix(true, false);
	return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
};

/** The sim's pace on the map, in tiles a second, and the eight headings he walks, as angles from south towards east. */
const pace = 5;
const eight = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);

/** Walks him `frames` frames at `pace` along `angle` from `from`, and returns the clock and where he ended. */
function walk(
	ben: BenMapActor,
	state: { time: number; x: number; y: number },
	angle: number,
	frames: number,
	name = 'benMap0',
): void {
	for (let i = 0; i < frames; i++) {
		state.x += (Math.sin(angle) * pace) / 60;
		state.y += (-Math.cos(angle) * pace) / 60;
		const draw = drawAt(state.x, state.y, name);
		ben.update(draw, frameOf(draw, (state.time += 1 / 60)));
	}
}
function stand(
	ben: BenMapActor,
	state: { time: number; x: number; y: number },
	frames: number,
): void {
	for (let i = 0; i < frames; i++) {
		const draw = drawAt(state.x, state.y);
		ben.update(draw, frameOf(draw, (state.time += 1 / 60)));
	}
}

test('both hero sprites are one family and nothing else is', () => {
	expect(benMapModels.family('benMap0')).toBe('benMap');
	expect(benMapModels.family('benMap1')).toBe('benMap');
	for (const name of [
		'ben_stand',
		'ben_run1',
		'benMap',
		'benMap2',
		'owShadowS',
		'saucer',
		'BenMap0',
	])
		expect(benMapModels.family(name)).toBeNull();
});

test('he stands upright along +Z, two tiles tall, with his soles on the ground at the sprite foot point', () => {
	const draw = drawAt(20.4, 11.7),
		ben = make(draw);
	for (let i = 0; i < 8; i++) ben.update(draw, frameOf(draw, i / 60));
	ben.object.updateMatrixWorld(true);
	const helmet = ben.fig.X.helmet;
	if (!helmet) throw new Error('no helmet');
	const box = new THREE.Box3().setFromObject(helmet),
		head = pointOf(ben.fig.J.head),
		pelvis = pointOf(ben.fig.J.pelvis);
	// About two tiles to the top of the helmet, as in a level.
	expect(box.max.z).toBeGreaterThan(1.98);
	expect(box.max.z).toBeLessThan(2.08);
	// Upright: the head is straight above the hips.
	expect(head.z).toBeGreaterThan(pelvis.z + 0.5);
	expect(Math.hypot(head.x - pelvis.x, head.y - pelvis.y)).toBeLessThan(0.15);
	// His soles on Z = 0 under the sprite's bottom edge.
	expect(Math.abs(ben.soleHeight())).toBeLessThan(0.05);
	expect(Math.abs(pelvis.x - 20.4)).toBeLessThan(0.2);
	expect(Math.abs(pelvis.y - 11.7)).toBeLessThan(0.2);
	expect(box.min.z).toBeGreaterThan(-0.05);
	ben.dispose?.();
});

test('with no movement yet he faces south, towards the camera', () => {
	const draw = drawAt(5, 5),
		ben = make(draw);
	for (let i = 0; i < 10; i++) ben.update(draw, frameOf(draw, i / 60));
	expect(wrap(ben.yaw)).toBeCloseTo(0, 3);
	const forward = new THREE.Vector3(0, 0, 1).transformDirection(ben.fig.turn.matrixWorld);
	expect(forward.y).toBeLessThan(-0.95);
	ben.dispose?.();
});

test('walking in each of the eight directions turns him to face it, and he keeps the heading when he stops', () => {
	for (const angle of eight) {
		const ben = make(drawAt(30, 20)),
			state = { time: 0, x: 30, y: 20 };
		stand(ben, state, 6);
		walk(ben, state, angle, 40);
		expect(ben.mode).toBe('walk');
		expect(Math.abs(wrap(ben.yaw - angle))).toBeLessThan(0.05);
		// His forward, along the model's +Z, points the way he is going across the ground plane.
		const forward = new THREE.Vector3(0, 0, 1).transformDirection(ben.fig.turn.matrixWorld);
		expect(forward.x).toBeCloseTo(Math.sin(angle), 1);
		expect(forward.y).toBeCloseTo(-Math.cos(angle), 1);
		stand(ben, state, 90);
		expect(ben.mode).toBe('stand');
		expect(Math.abs(wrap(ben.yaw - angle))).toBeLessThan(0.05);
		expect(Math.abs(ben.soleHeight())).toBeLessThan(0.08);
		ben.dispose?.();
	}
});

test('turning takes a spring: a few frames into a reversal he has moved, but not all the way round', () => {
	const ben = make(drawAt(30, 20)),
		state = { time: 0, x: 30, y: 20 };
	walk(ben, state, Math.PI / 2, 40);
	const before = ben.yaw;
	// The sim's reversal takes a few frames to show in his travel, and the spring then takes a few more.
	walk(ben, state, -Math.PI / 2, 3);
	expect(Math.abs(ben.yaw - before)).toBeGreaterThan(0.5);
	expect(Math.abs(wrap(ben.yaw - -Math.PI / 2))).toBeGreaterThan(1);
	walk(ben, state, -Math.PI / 2, 20);
	expect(Math.abs(wrap(ben.yaw + Math.PI / 2))).toBeLessThan(0.05);
	ben.dispose?.();
});

/** Walks him along `angle` and returns the largest slide of any heel or toe on the ground plane while it bears weight, in tiles. */
function stanceSlide(angle: number, turnTo?: number): number {
	const ben = make(drawAt(30, 20)),
		state = { time: 0, x: 30, y: 20 },
		heel = new THREE.Vector3(),
		toe = new THREE.Vector3(),
		open: ({ tag: string; x0: number; y0: number; worst: number } | null)[] = [null, null];
	let worst = 0;
	walk(ben, state, angle, 40);
	for (let i = 0; i < 160; i++) {
		walk(ben, state, turnTo !== undefined && i > 60 ? turnTo : angle, 1);
		ben.object.updateMatrixWorld(true);
		for (let k = 0; k < 2; k++) {
			const foot = ben.fig.J['foot' + (k === 0 ? 1 : -1)];
			heel.set(0, -ben.fig.P.ank, -0.3 * ben.fig.P.shoeL);
			toe.set(0, -ben.fig.P.ank, 0.65 * ben.fig.P.shoeL);
			foot.localToWorld(heel);
			foot.localToWorld(toe);
			const onHeel = heel.z < 0.02 && heel.z <= toe.z,
				onToe = !onHeel && toe.z < 0.02,
				point = onHeel ? heel : toe,
				tag = onHeel ? 'heel' : 'toe',
				run = open[k];
			if (onHeel || onToe) {
				if (run && run.tag === tag)
					run.worst = Math.max(run.worst, Math.hypot(point.x - run.x0, point.y - run.y0));
				else open[k] = { tag, x0: point.x, y0: point.y, worst: 0 };
				const now = open[k];
				if (now && now.worst > worst) worst = now.worst;
			} else open[k] = null;
		}
	}
	ben.dispose?.();
	return worst;
}

test('a stance foot stays planted on the ground plane in all eight directions, and through a turn', () => {
	for (const angle of eight) expect(stanceSlide(angle)).toBeLessThan(0.15);
	// A sharp turn mid-stride swings the planted foot round its ankle, so its heel and toe move a little.
	expect(stanceSlide(0, Math.PI / 4)).toBeLessThan(0.4);
	expect(stanceSlide(Math.PI / 2, Math.PI)).toBeLessThan(0.4);
});

test('the planted stance goal holds its place on the ground from touchdown to lift-off', () => {
	for (const angle of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
		const ben = make(drawAt(30, 20)),
			state = { time: 0, x: 30, y: 20 };
		let longest = 0,
			held = 0,
			last = { x: NaN, y: NaN };
		for (let i = 0; i < 160; i++) {
			walk(ben, state, angle, 1);
			const now = ben.stance[0];
			if (i > 60 && Math.hypot(now.x - last.x, now.y - last.y) < 1e-6) held++;
			else held = 0;
			longest = Math.max(longest, held);
			last = { x: now.x, y: now.y };
		}
		expect(longest).toBeGreaterThanOrEqual(3);
		ben.dispose?.();
	}
});

test('his stride advances with the distance he travels: faster takes more cycles, and standing holds still', () => {
	const pelvisHeights = (frames: number, speed: number): Set<number> => {
		const ben = make(drawAt(30, 20)),
			seen = new Set<number>();
		let time = 0;
		for (let i = 1; i <= frames; i++) {
			const draw = drawAt(30 + (i * speed) / 60, 20);
			ben.update(draw, frameOf(draw, (time += 1 / 60)));
			seen.add(Math.round(ben.fig.J.pelvis.position.y * 1000));
		}
		ben.dispose?.();
		return seen;
	};
	expect(pelvisHeights(24, pace).size).toBeGreaterThan(4);
	const ben = make(drawAt(30, 20)),
		state = { time: 0, x: 30, y: 20 };
	stand(ben, state, 40);
	const a = ben.fig.J.pelvis.position.y;
	stand(ben, state, 1);
	// Breathing moves him a hair; a stride would move the hips by pixels.
	expect(Math.abs(ben.fig.J.pelvis.position.y - a)).toBeLessThan(0.05);
	ben.dispose?.();
});

test('he keeps no level props: no ladder, ledge, pogo stick or shot bubbles, and the Stunner is holstered', () => {
	const ben = make(drawAt(0, 0)),
		state = { time: 0, x: 0, y: 0 };
	walk(ben, state, 1, 30, 'benMap1');
	stand(ben, state, 30);
	const { props, X } = ben.fig;
	expect(props.ladder.visible).toBe(false);
	expect(props.ledge.visible).toBe(false);
	expect(props.pogo.visible).toBe(false);
	expect(props.bubbles.some((bubble) => bubble.visible)).toBe(false);
	expect(X.gun.visible).toBe(false);
	expect(X.holster.visible).toBe(true);
	ben.dispose?.();
});

test('his rig survives the sim hiding him for a blink and keeps his heading', () => {
	const ben = make(drawAt(8, 8)),
		state = { time: 0, x: 8, y: 8 };
	walk(ben, state, Math.PI / 2, 30);
	ben.dispose?.();
	const again = make(drawAt(state.x, state.y));
	expect(again).toBe(ben);
	stand(again, state, 6);
	expect(Math.abs(wrap(again.yaw - Math.PI / 2))).toBeLessThan(0.05);
	again.dispose?.();
});

test('a teleport does not drag him across the map or turn him', () => {
	const ben = make(drawAt(8, 8)),
		state = { time: 0, x: 8, y: 8 };
	walk(ben, state, Math.PI / 2, 30);
	const yaw = ben.yaw;
	state.x = 40;
	state.y = 30;
	stand(ben, state, 3);
	expect(Math.abs(wrap(ben.yaw - yaw))).toBeLessThan(0.05);
	expect(ben.mode).toBe('stand');
	expect(Math.abs(ben.soleHeight())).toBeLessThan(0.08);
	ben.dispose?.();
});

test('standing still, he plays an idle pose after a few seconds and drops it the moment he walks', () => {
	const ben = make(drawAt(3, 3)),
		state = { time: 0, x: 3, y: 3 };
	let first = -1;
	for (let i = 0; i < 60 * 5.5; i++) {
		stand(ben, state, 1);
		if (ben.idlePose && first < 0) first = state.time;
	}
	expect(first).toBeGreaterThan(2);
	expect(first).toBeLessThan(8);
	expect(ben.idlePose).not.toBeNull();
	walk(ben, state, 0, 1);
	expect(ben.idlePose).toBeNull();
	ben.dispose?.();
});

test('at the foot of a landmark he looks up at it, and not when it is far off or he is walking', () => {
	const at = (x: number, y: number, others: readonly SpriteDraw[], frames: number): BenMapActor => {
		const ben = make(drawAt(x, y)),
			draw = drawAt(x, y);
		for (let i = 0; i < frames; i++) ben.update(draw, frameOf(draw, i / 60, [draw, ...others]));
		return ben;
	};
	// A level's landmark stands in the row above its node, which is north of his doorstep.
	const near = at(10, 10, [landmark(10.2, 11.8)], 30);
	expect(near.mode).toBe('look');
	// He faces it: north, a half turn from south.
	expect(Math.abs(wrap(near.yaw - Math.PI))).toBeLessThan(0.3);
	near.dispose?.();
	const far = at(10, 10, [landmark(10.2, 16)], 30);
	expect(far.mode).toBe('stand');
	far.dispose?.();
	const other = at(10, 10, [landmark(10.2, 11.8, 'owTree0')], 30);
	expect(other.mode).toBe('stand');
	other.dispose?.();
	const ben = make(drawAt(10, 10)),
		state = { time: 0, x: 10, y: 10 };
	walk(ben, state, 0, 20);
	expect(ben.mode).toBe('walk');
	ben.dispose?.();
});
