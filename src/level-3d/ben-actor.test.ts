// Checks the player's model set: which sprites it claims, where his feet end up and how he turns.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { type BenActor, benModels } from './ben-actor.ts';
import type { FrameContext, SpriteDraw } from './types.ts';

const names = [
	'ben_stand',
	'ben_run1',
	'ben_run2',
	'ben_jump',
	'ben_pogo',
	'ben_pogo2',
	'ben_shoot',
	'ben_aimUp',
	'ben_aimDown',
	'ben_lookUp',
	'ben_lookDown',
	'ben_climb1',
	'ben_climb2',
	'ben_mantle1',
	'ben_mantle2',
	'ben_mantle3',
];

/** The sprite's drawn size in tiles: the pogo frames are 16 by 32 pixels, the rest 16 by 24. */
function drawOf(name: string, x: number, y: number, flip = false): SpriteDraw {
	const h = name.startsWith('ben_pogo') ? 2 : 1.5;
	return {
		name,
		x,
		y: y + h / 2,
		w: 1,
		h,
		flip,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: false,
		order: 0,
	};
}
const frameOf = (draw: SpriteDraw, time: number): FrameContext => ({
	time,
	dt: 1 / 60,
	ben: { x: draw.x, y: draw.y },
	camera: { x: draw.x, y: draw.y, z: 21 },
	draws: [draw],
});
const make = (draw: SpriteDraw): BenActor => benModels.create('ben', draw) as BenActor;
/** How far the pogo stick's tip is above the sprite's bottom edge, in tiles. */
function tipHeight(ben: BenActor, draw: SpriteDraw): number {
	ben.object.updateMatrixWorld(true);
	return (
		new THREE.Vector3().setFromMatrixPosition(ben.fig.props.pogo.matrixWorld).y -
		(draw.y - draw.h / 2)
	);
}

test('every ben_ sprite is the ben family and nothing else is', () => {
	for (const name of names) expect(benModels.family(name)).toBe('ben');
	for (const name of ['benMap0', 'benMap1', 'bubble', 'gloop0', 'craterTop', 'ben', 'Ben_stand'])
		expect(benModels.family(name)).toBeNull();
});

test('each sprite poses without throwing, with his feet on the sprite bottom edge', () => {
	for (const name of names) {
		const draw = drawOf(name, 10, 5),
			ben = make(draw);
		for (let i = 0; i < 8; i++) ben.update(draw, frameOf(draw, i / 60));
		const sole = ben.soleHeight(draw);
		expect(Number.isFinite(sole)).toBe(true);
		// A mantle anchors him to the ledge's lip rather than his own feet, which hang below the sprite's edge.
		if (name.startsWith('ben_mantle')) expect(sole).toBeLessThan(0.05);
		else if (name.startsWith('ben_pogo')) expect(Math.abs(tipHeight(ben, draw))).toBeLessThan(0.05);
		else expect(Math.abs(sole)).toBeLessThan(0.15);
		ben.dispose?.();
	}
});

test('his feet stay on the sprite edge through a run, a jump and a pogo bounce', () => {
	const ben = make(drawOf('ben_stand', 0, 5));
	let time = 0;
	const step = (name: string, x: number, y: number): number => {
		const draw = drawOf(name, x, y);
		ben.update(draw, frameOf(draw, (time += 1 / 60)));
		return Math.abs(name.startsWith('ben_pogo') ? tipHeight(ben, draw) : ben.soleHeight(draw));
	};
	let worst = 0;
	for (let i = 0; i < 60; i++)
		worst = Math.max(worst, step(i % 20 < 10 ? 'ben_run1' : 'ben_run2', i * 0.1, 5));
	for (let i = 0; i < 40; i++) {
		const t = i / 60;
		worst = Math.max(worst, step('ben_jump', 6 + i * 0.1, 5 + 20.5 * t - 30 * t * t));
	}
	for (let i = 0; i < 80; i++) {
		const t = (i % 40) / 60;
		worst = Math.max(
			worst,
			step(i % 40 < 7 ? 'ben_pogo2' : 'ben_pogo', 10, 5 + Math.max(0, 14 * t - 30 * t * t)),
		);
	}
	expect(worst).toBeLessThan(0.2);
	ben.dispose?.();
});

test('flipping the sprite turns him round with weight, settling within a third of a second', () => {
	const right = drawOf('ben_stand', 3, 2),
		left = drawOf('ben_stand', 3, 2, true),
		ben = make(right);
	let time = 0;
	for (let i = 0; i < 12; i++) ben.update(right, frameOf(right, (time += 1 / 60)));
	expect(ben.heading()).toBe(1);
	const first = ben.fig.turn.rotation.y;
	ben.update(left, frameOf(left, (time += 1 / 60)));
	const second = ben.fig.turn.rotation.y;
	// One frame into the turn he has moved, but not all the way round.
	expect(second).toBeLessThan(first);
	expect(second).toBeGreaterThan(-first);
	// The turn is a spring: it settles within a third of a second.
	for (let i = 0; i < 20; i++) ben.update(left, frameOf(left, (time += 1 / 60)));
	expect(ben.heading()).toBe(-1);
	expect(ben.fig.turn.rotation.y).toBeCloseTo(-first, 3);
	ben.dispose?.();
});

test('his run cycle advances with the distance he travels, and holds still when he does', () => {
	const ben = make(drawOf('ben_run1', 0, 0));
	let time = 0;
	const at = (x: number): number => {
		const draw = drawOf('ben_run1', x, 0);
		ben.update(draw, frameOf(draw, (time += 1 / 60)));
		return ben.fig.J.pelvis.position.y;
	};
	for (let i = 0; i < 12; i++) at(0);
	const still = [at(0), at(0), at(0)];
	expect(Math.abs(still[0] - still[2])).toBeLessThan(1e-6);
	const moving = new Set<number>();
	for (let i = 1; i <= 12; i++) moving.add(Math.round(at(i * (7 / 60)) * 1000));
	expect(moving.size).toBeGreaterThan(4);
	ben.dispose?.();
});

test('the model keeps no props of its own: no ladder, ledge or shot bubbles', () => {
	for (const name of ['ben_shoot', 'ben_climb1', 'ben_mantle2', 'ben_pogo']) {
		const draw = drawOf(name, 0, 0),
			ben = make(draw);
		for (let i = 0; i < 20; i++) ben.update(draw, frameOf(draw, i / 60));
		const { props } = ben.fig;
		expect(props.ladder.visible).toBe(false);
		expect(props.ledge.visible).toBe(false);
		expect(props.bubbles.some((bubble) => bubble.visible)).toBe(false);
		expect(props.pogo.visible).toBe(name === 'ben_pogo');
		ben.dispose?.();
	}
});

test('a dead Ben tumbles with the sprite and his rig survives the sim hiding him for a blink', () => {
	const alive = drawOf('ben_stand', 0, 0),
		ben = make(alive);
	ben.update(alive, frameOf(alive, 0));
	ben.dispose?.();
	const again = make(alive);
	expect(again).toBe(ben);
	const dead = { ...drawOf('ben_jump', 0, 1), rot: 1.2 };
	again.update(dead, frameOf(dead, 0.1));
	expect(again.object.rotation.z).toBeCloseTo(1.2, 6);
	expect(again.mode).toBe('dead');
	again.dispose?.();
});

const world = (ben: BenActor, object: THREE.Object3D): THREE.Vector3 => {
	ben.object.updateMatrixWorld(true);
	return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
};
/** Runs him along the ground and returns the largest slide of any foot's heel or toe while it bears weight, in tiles. */
function stanceSlide(speed: number, slope: number, flip: boolean): number {
	const at = (i: number): SpriteDraw => {
		const x = 20 + (flip ? -1 : 1) * ((i * speed) / 60);
		return { ...drawOf('ben_run1', x, 5 + slope * (x - 20), flip) };
	};
	const ben = make(at(0)),
		heel = new THREE.Vector3(),
		toe = new THREE.Vector3(),
		open: ({ tag: string; x0: number; worst: number } | null)[] = [null, null];
	let worst = 0,
		time = 0;
	for (let i = 0; i < 200; i++) {
		const draw = at(i);
		ben.update(draw, frameOf(draw, (time += 1 / 60)));
		ben.object.updateMatrixWorld(true);
		for (let k = 0; k < 2; k++) {
			const foot = ben.fig.J['foot' + (k === 0 ? 1 : -1)],
				ground = (px: number): number => draw.y - draw.h / 2 + slope * (px - draw.x);
			heel.set(0, -ben.fig.P.ank, -0.3 * ben.fig.P.shoeL);
			toe.set(0, -ben.fig.P.ank, 0.65 * ben.fig.P.shoeL);
			foot.localToWorld(heel);
			foot.localToWorld(toe);
			const onHeel = heel.y - ground(heel.x) < 0.02 && heel.y <= toe.y,
				onToe = !onHeel && toe.y - ground(toe.x) < 0.02,
				point = onHeel ? heel : toe,
				tag = onHeel ? 'heel' : 'toe',
				run = open[k];
			if (i > 90 && (onHeel || onToe)) {
				if (run && run.tag === tag) run.worst = Math.max(run.worst, Math.abs(point.x - run.x0));
				else open[k] = { tag, x0: point.x, worst: 0 };
				// A run of a few frames or more is a stance, not a swing foot skimming the ground.
				const now = open[k];
				if (now && now.worst > worst && i - 90 > 3) worst = now.worst;
			} else open[k] = null;
		}
	}
	ben.dispose?.();
	return worst;
}

test('a stance foot stays planted: its heel or toe slides under a sixth of a tile on the flat and on a slope', () => {
	expect(stanceSlide(7, 0, false)).toBeLessThan(0.17);
	expect(stanceSlide(7, 0, true)).toBeLessThan(0.17);
	expect(stanceSlide(4, 0, false)).toBeLessThan(0.17);
	expect(stanceSlide(7, 0.4, false)).toBeLessThan(0.17);
	expect(stanceSlide(7, -0.4, true)).toBeLessThan(0.17);
});

test('the planted stance goal holds its world X from touchdown to lift-off', () => {
	const at = (i: number): SpriteDraw => drawOf('ben_run1', 20 + (i * 7) / 60, 5),
		ben = make(at(0));
	let time = 0,
		longest = 0,
		held = 0,
		last = NaN;
	for (let i = 0; i < 160; i++) {
		const draw = at(i);
		ben.update(draw, frameOf(draw, (time += 1 / 60)));
		const now = ben.stanceX[0];
		if (i > 60 && Math.abs(now - last) < 1e-6) held++;
		else held = 0;
		longest = Math.max(longest, held);
		last = now;
	}
	expect(longest).toBeGreaterThanOrEqual(3);
	ben.dispose?.();
});

test('he stands about a quarter taller than the sprite box, with his soles on its bottom edge', () => {
	const draw = drawOf('ben_stand', 10, 5),
		ben = make(draw);
	for (let i = 0; i < 6; i++) ben.update(draw, frameOf(draw, i / 60));
	const crown = world(ben, ben.fig.J._crown).y - 5;
	expect(crown).toBeGreaterThan(1.7);
	expect(crown).toBeLessThan(1.95);
	expect(Math.abs(ben.soleHeight(draw))).toBeLessThan(0.05);
	ben.dispose?.();
});

/** A bubble the sim has just spawned beside him. */
const bubbleBeside = (draw: SpriteDraw, ahead: number, rise = 0.85): SpriteDraw => ({
	...draw,
	name: 'bubble',
	x: draw.x + ahead,
	y: draw.y - draw.h / 2 + rise,
	w: 1,
	h: 1,
});

test('a bubble beside him on the pogo stick raises the Stunner in his hand, and it goes away again', () => {
	const stick = drawOf('ben_pogo', 10, 5),
		ben = make(stick);
	let time = 0;
	for (let i = 0; i < 10; i++) ben.update(stick, frameOf(stick, (time += 1 / 60)));
	expect(ben.fig.X.gun.visible).toBe(false);
	ben.update(stick, {
		...frameOf(stick, (time += 1 / 60)),
		draws: [stick, bubbleBeside(stick, 0.9)],
	});
	expect(ben.fig.X.gun.visible).toBe(true);
	expect(ben.mode).toBe('pogo');
	for (let i = 0; i < 30; i++) ben.update(stick, frameOf(stick, (time += 1 / 60)));
	expect(ben.fig.X.gun.visible).toBe(false);
	ben.dispose?.();
});

test('facing left while firing leaves the Stunner on the camera side of his body, and facing right too', () => {
	for (const flip of [false, true]) {
		const draw = drawOf('ben_shoot', 10, 5, flip),
			ben = make(drawOf('ben_stand', 10, 5, flip));
		for (let i = 0; i < 12; i++) ben.update(draw, frameOf(draw, i / 60));
		const gun = world(ben, ben.fig.X.gun),
			pelvis = world(ben, ben.fig.J.pelvis),
			head = world(ben, ben.fig.J.head);
		// The camera is at +Z: the gun is nearer to it than his hips, and out ahead of his head.
		expect(gun.z).toBeGreaterThan(pelvis.z + 0.05);
		expect((gun.x - head.x) * (flip ? -1 : 1)).toBeGreaterThan(0.3);
		expect(ben.gunSide).toBe(flip ? 1 : -1);
		ben.dispose?.();
	}
});

test('aimed up, the Stunner is held ahead of his face rather than beside it, so the face stays in view', () => {
	for (const flip of [false, true]) {
		const draw = drawOf('ben_aimUp', 10, 5, flip),
			ben = make(drawOf('ben_stand', 10, 5, flip));
		for (let i = 0; i < 14; i++) ben.update(draw, frameOf(draw, i / 60));
		const gun = world(ben, ben.fig.X.gun),
			head = world(ben, ben.fig.J.head);
		expect(gun.y).toBeGreaterThan(head.y);
		expect((gun.x - head.x) * (flip ? -1 : 1)).toBeGreaterThan(0.2);
		ben.dispose?.();
	}
});

test('landing squashes him, standing or running, and he comes back up', () => {
	for (const name of ['ben_stand', 'ben_run1']) {
		const ben = make(drawOf('ben_stand', 0, 5));
		let time = 0,
			x = 0;
		const put = (n: string, y: number): number => {
			const draw = drawOf(n, (x += n === 'ben_run1' || n === 'ben_jump' ? 0.1 : 0), y);
			ben.update(draw, frameOf(draw, (time += 1 / 60)));
			return ben.fig.J.pelvis.position.y;
		};
		for (let i = 0; i < 20; i++) put('ben_stand', 5);
		const rest = name === 'ben_stand' ? put('ben_stand', 5) : NaN;
		let y = 5,
			v = 20.5,
			low = Infinity,
			after = 0;
		for (let i = 0; i < 90 && after < 40; i++) {
			v -= 1;
			y += v / 60;
			if (y > 5) {
				put('ben_jump', y);
				continue;
			}
			y = 5;
			after++;
			low = Math.min(low, put(name, 5));
		}
		const settled = put(name, 5);
		if (name === 'ben_stand') {
			expect(low).toBeLessThan(rest - 1.5);
			expect(Math.abs(settled - rest)).toBeLessThan(0.6);
		} else expect(low).toBeLessThan(settled - 1);
		ben.dispose?.();
	}
});

test('standing still, he plays an idle pose after a few seconds and drops it the moment he moves', () => {
	const draw = drawOf('ben_stand', 3, 3),
		ben = make(draw);
	let time = 0,
		first = -1;
	for (let i = 0; i < 60 * 5.5; i++) {
		ben.update(draw, frameOf(draw, (time += 1 / 60)));
		if (ben.idlePose && first < 0) first = time;
	}
	expect(first).toBeGreaterThan(2);
	expect(first).toBeLessThan(8);
	expect(ben.idlePose).not.toBeNull();
	// An idle that is still playing at the sim's twenty-second joke would be too late: none starts that late.
	const run = drawOf('ben_run1', 3.1, 3);
	ben.update(run, frameOf(run, (time += 1 / 60)));
	expect(ben.idlePose).toBeNull();
	ben.dispose?.();
});
