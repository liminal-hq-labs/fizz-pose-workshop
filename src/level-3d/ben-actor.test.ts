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

test('flipping the sprite turns him round, smoothly and through about a tenth of a second', () => {
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
	for (let i = 0; i < 12; i++) ben.update(left, frameOf(left, (time += 1 / 60)));
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
