// Tests for the roster: fixed tiles are placed once and left alone, moving sprites keep their actors, and exits play out.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { Roster } from './roster.ts';
import { framing } from './stage.ts';
import type { Actor, FrameContext, ModelSet, Placed, SpriteDraw } from './types.ts';

function draw(name: string, x: number, y: number): SpriteDraw {
	return {
		name,
		x,
		y,
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

interface Counts {
	created: number;
	updates: number;
	disposed: number;
	leaves: number;
	leavingCalls: number[];
	placed: number;
	removed: number;
}

/** A tile set (`tile`, fixed) and a creature set (`thing`, moving, with an exit), counting what the roster asks of them. */
function fakeSets(options: { batch?: boolean; exit?: number } = {}): {
	sets: ModelSet[];
	counts: Counts;
} {
	const counts: Counts = {
		created: 0,
		updates: 0,
		disposed: 0,
		leaves: 0,
		leavingCalls: [],
		placed: 0,
		removed: 0,
	};
	const make = (): Actor => {
		counts.created++;
		const actor: Actor = {
			object: new THREE.Group(),
			update: () => {
				counts.updates++;
			},
			dispose: () => {
				counts.disposed++;
			},
		};
		return actor;
	};
	const tiles: ModelSet = {
		name: 'tiles',
		family: (name) => (name === 'tile' ? 'tile' : null),
		fixed: () => true,
		create: make,
		place: options.batch
			? (): Placed => {
					counts.placed++;
					return { remove: () => void counts.removed++ };
				}
			: undefined,
	};
	const things: ModelSet = {
		name: 'things',
		family: (name) => (name === 'thing' ? 'thing' : null),
		create() {
			const actor = make();
			if (options.exit) {
				actor.leave = () => {
					counts.leaves++;
					return options.exit!;
				};
				actor.leaving = (elapsed) => {
					counts.leavingCalls.push(elapsed);
				};
			}
			return actor;
		},
	};
	return { sets: [tiles, things], counts };
}

const fallback: ModelSet = {
	name: 'flat',
	family: (name) => name,
	create: () => ({ object: new THREE.Group(), update() {} }),
};

function frameOf(draws: SpriteDraw[], extra: Partial<FrameContext> = {}): FrameContext {
	return {
		time: 0,
		dt: 1 / 60,
		ben: { x: 10, y: 5 },
		camera: { x: 10, y: 8, z: 16 },
		draws,
		...extra,
	};
}

function tileRow(count: number): SpriteDraw[] {
	return Array.from({ length: count }, (_, i) => draw('tile', i + 0.5, 0.5));
}

describe('fixed tiles', () => {
	test('each tile is made and updated once, however many frames pass', () => {
		const { sets, counts } = fakeSets(),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			draws = tileRow(50);
		for (let i = 0; i < 10; i++) roster.sync(draws, frameOf(draws));
		expect(counts.created).toBe(50);
		expect(counts.updates).toBe(50);
		expect(scene.children.length).toBe(50);
		expect(roster.stats.fixedActors).toBe(50);
		/* The first frame works the list out; the rest are matched in order without a lookup. */
		expect(roster.stats.reconciles).toBe(1);
	});

	test('a tile that stops being drawn is removed and disposed, and the others stay', () => {
		const { sets, counts } = fakeSets(),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			draws = tileRow(10);
		roster.sync(draws, frameOf(draws));
		const gone = draws.splice(4, 1);
		roster.sync(draws, frameOf(draws));
		expect(gone.length).toBe(1);
		expect(counts.disposed).toBe(1);
		expect(scene.children.length).toBe(9);
		expect(counts.created).toBe(10);
		roster.sync(draws, frameOf(draws));
		expect(counts.created).toBe(10);
		expect(roster.stats.reconciles).toBe(2);
	});

	test('a tile that comes back is made afresh', () => {
		const { sets, counts } = fakeSets(),
			roster = new Roster(new THREE.Scene(), sets, fallback),
			draws = tileRow(3),
			back = draws.pop()!;
		roster.sync(tileRow(3), frameOf(tileRow(3)));
		roster.sync(draws, frameOf(draws));
		draws.push(back);
		roster.sync(draws, frameOf(draws));
		expect(counts.created).toBe(4);
	});

	test('sprites moving in the list ahead of the tiles do not disturb their actors', () => {
		const { sets, counts } = fakeSets(),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			tiles = tileRow(20);
		roster.sync(tiles, frameOf(tiles));
		const withThing = [draw('thing', 3, 3), ...tiles];
		roster.sync(withThing, frameOf(withThing));
		roster.sync(withThing, frameOf(withThing));
		expect(counts.created).toBe(21);
		expect(counts.disposed).toBe(0);
		expect(scene.children.length).toBe(21);
	});

	test('tiles that a set places in its batch make no actors, and removal goes through the handle', () => {
		const { sets, counts } = fakeSets({ batch: true }),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			draws = tileRow(30);
		roster.sync(draws, frameOf(draws));
		expect(counts.placed).toBe(30);
		expect(counts.created).toBe(0);
		expect(scene.children.length).toBe(0);
		draws.pop();
		roster.sync(draws, frameOf(draws));
		expect(counts.removed).toBe(1);
		expect(roster.stats.placedTiles).toBe(29);
	});

	test('the set is told after each sync, and its root is in the scene', () => {
		let calls = 0;
		const root = new THREE.Group(),
			set: ModelSet = {
				...fakeSets().sets[0],
				root,
				sync: () => void calls++,
			},
			scene = new THREE.Scene(),
			roster = new Roster(scene, [set], fallback);
		expect(root.parent).toBe(scene);
		roster.sync([], frameOf([]));
		roster.sync([], frameOf([]));
		expect(calls).toBe(2);
	});
});

describe('moving sprites', () => {
	test('one actor follows a sprite that moves a little each frame, and is updated every frame', () => {
		const { sets, counts } = fakeSets(),
			roster = new Roster(new THREE.Scene(), sets, fallback);
		for (let i = 0; i < 20; i++) {
			const draws = [draw('thing', 5 + i * 0.2, 3)];
			roster.sync(draws, frameOf(draws));
		}
		expect(counts.created).toBe(1);
		expect(counts.updates).toBe(20);
	});

	test('two sprites of a family keep their own actors', () => {
		const { sets, counts } = fakeSets(),
			roster = new Roster(new THREE.Scene(), sets, fallback);
		for (let i = 0; i < 5; i++) {
			const draws = [draw('thing', 5 + i * 0.1, 3), draw('thing', 20 - i * 0.1, 3)];
			roster.sync(draws, frameOf(draws));
		}
		expect(counts.created).toBe(2);
		expect(counts.disposed).toBe(0);
	});

	test('sprites no set claims are drawn by the fallback and reported', () => {
		const { sets } = fakeSets(),
			roster = new Roster(new THREE.Scene(), sets, fallback),
			draws = [draw('mystery', 1, 1)];
		roster.sync(draws, frameOf(draws));
		expect([...roster.unmodelled]).toEqual(['mystery']);
		roster.sync([], frameOf([]));
		expect(roster.unmodelled.size).toBe(0);
	});
});

describe('exits', () => {
	test('a collected sprite stays for its exit, gets a call each frame, then goes', () => {
		const { sets, counts } = fakeSets({ exit: 0.25 }),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			first = [draw('thing', 11, 5)];
		roster.sync(first, frameOf(first));
		expect(scene.children.length).toBe(1);
		for (let i = 0; i < 10; i++) roster.sync([], frameOf([]));
		expect(counts.leaves).toBe(1);
		expect(counts.disposed).toBe(0);
		expect(scene.children.length).toBe(1);
		expect(roster.stats.leaving).toBe(1);
		expect(counts.leavingCalls.length).toBe(10);
		expect(counts.leavingCalls[0]).toBeCloseTo(1 / 60, 6);
		for (let i = 0; i < 10; i++) roster.sync([], frameOf([]));
		expect(counts.disposed).toBe(1);
		expect(scene.children.length).toBe(0);
		expect(roster.stats.leaving).toBe(0);
	});

	test('no exit when Ben jumps across the level, as on a restart', () => {
		const { sets, counts } = fakeSets({ exit: 0.25 }),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			draws = [draw('thing', 11, 5)];
		roster.sync(draws, frameOf(draws));
		roster.sync([], frameOf([], { ben: { x: 3, y: 5 } }));
		expect(counts.leaves).toBe(0);
		expect(counts.disposed).toBe(1);
		expect(scene.children.length).toBe(0);
	});

	test('no exit for a sprite far from the camera', () => {
		const { sets, counts } = fakeSets({ exit: 0.25 }),
			scene = new THREE.Scene(),
			roster = new Roster(scene, sets, fallback),
			draws = [draw('thing', 90, 5)];
		roster.sync(draws, frameOf(draws));
		roster.sync([], frameOf([]));
		expect(counts.leaves).toBe(0);
		expect(counts.disposed).toBe(1);
	});

	test('an exit of zero seconds removes the actor at once', () => {
		const { sets, counts } = fakeSets({ exit: 0.0001 });
		sets[1].create = () => {
			const actor: Actor = {
				object: new THREE.Group(),
				update() {},
				leave: () => 0,
				dispose: () => void counts.disposed++,
			};
			return actor;
		};
		const roster = new Roster(new THREE.Scene(), sets, fallback),
			draws = [draw('thing', 11, 5)];
		roster.sync(draws, frameOf(draws));
		roster.sync([], frameOf([]));
		expect(counts.disposed).toBe(1);
		expect(roster.stats.leaving).toBe(0);
	});
});

describe('camera framing', () => {
	const width = (aspect: number): number => {
		const { fov, distance } = framing(aspect);
		return 2 * distance * Math.tan((fov * Math.PI) / 360) * aspect;
	};

	test('a wide screen gets the close camera', () => {
		const { fov, distance } = framing(16 / 9);
		expect(distance).toBe(16);
		expect(fov).toBe(32);
	});

	test('a narrow screen widens the view to at least 14 tiles across', () => {
		for (const aspect of [1, 0.75, 9 / 16, 0.4])
			expect(width(aspect)).toBeGreaterThanOrEqual(13.99);
	});

	test('the field of view stops widening and the camera pulls back instead', () => {
		const tall = framing(0.4);
		expect(tall.fov).toBeLessThanOrEqual(56.0001);
		expect(tall.distance).toBeGreaterThan(16);
		expect(framing(1).distance).toBe(16);
	});

	test('zooming in brings the camera closer and keeps the view wide enough for the zoom', () => {
		expect(framing(16 / 9, 2).distance).toBe(8);
	});
});
