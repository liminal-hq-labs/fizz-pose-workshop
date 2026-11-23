// Checks saving and restoring a game: what is captured, what is written back, and what a damaged save does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'bun:test';
import type { StorageLike } from './audio/level-sound.ts';
import {
	applyProgress,
	captureProgress,
	clearedCount,
	describeProgress,
	parseProgress,
	readProgress,
	saveKey,
	serializeProgress,
	writeProgress,
	type Progress,
} from './progress.ts';
import { State } from './sim.ts';

/** A stand-in for the sim's state array. */
function fakeSim(values: Partial<Record<keyof typeof State, number>> = {}) {
	const store = new Map<number, number>();
	for (const [name, value] of Object.entries(values))
		store.set(State[name as keyof typeof State], value);
	return {
		state: (index: number) => store.get(index) ?? 0,
		setState: (index: number, value: number) => {
			store.set(index, value);
			/* As the sim does: setting an axis of the map position gives Ben one. */
			if (index === State.mapX || index === State.mapY) store.set(State.hasMapPos, 1);
			if (index === State.hasMapPos && value === 0) store.set(State.hasMapPos, 0);
		},
		store,
	};
}

const memory = (
	initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } => {
	const data = { ...initial };
	return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

const saved: Progress = {
	lives: 2,
	score: 420,
	nextLife: 500,
	ammo: 4,
	doneMask: 0b1,
	map: { x: 14.2, y: 5.6 },
};

describe('capturing and applying progress', () => {
	it('captures what the sim holds, with the map position when it has one', () => {
		const sim = fakeSim({
			lives: 2,
			score: 420,
			nextLife: 500,
			ammo: 4,
			doneMask: 1,
			hasMapPos: 1,
			mapX: 14.2,
			mapY: 5.6,
		});
		expect(captureProgress(sim)).toEqual(saved);
	});

	it('leaves the map position out when the sim has none', () => {
		const sim = fakeSim({ lives: 3, nextLife: 100, ammo: 5 });
		expect(captureProgress(sim).map).toBeUndefined();
	});

	it('writes a save back into a new game, and gives it a map position', () => {
		const sim = fakeSim();
		applyProgress(sim, saved);
		expect(captureProgress(sim)).toEqual(saved);
	});

	it('clears the map position when the save has none, so Ben starts at the saucer', () => {
		const sim = fakeSim({ hasMapPos: 1, mapX: 3, mapY: 3 });
		applyProgress(sim, { ...saved, map: undefined });
		expect(sim.state(State.hasMapPos)).toBe(0);
	});
});

describe('keeping a save', () => {
	it('round-trips through the storage under the page’s own key', () => {
		const storage = memory();
		expect(writeProgress(storage, saved)).toBe(true);
		expect(Object.keys(storage.data)).toEqual([saveKey]);
		expect(saveKey).not.toContain('level-3d');
		expect(readProgress(storage)).toEqual(saved);
	});

	it('reads nothing from empty storage, and survives storage that is missing or throws', () => {
		expect(readProgress(memory())).toBeNull();
		expect(readProgress(null)).toBeNull();
		expect(writeProgress(null, saved)).toBe(false);
		const broken: StorageLike = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('full');
			},
		};
		expect(readProgress(broken)).toBeNull();
		expect(writeProgress(broken, saved)).toBe(false);
	});

	it('refuses text that is not a save, or holds values the game cannot have', () => {
		for (const text of [
			'',
			'not json',
			'null',
			'[]',
			JSON.stringify({ ...saved }),
			JSON.stringify({ version: 2, ...saved }),
			JSON.stringify({ version: 1, ...saved, lives: -1 }),
			JSON.stringify({ version: 1, ...saved, lives: 1.5 }),
			JSON.stringify({ version: 1, ...saved, score: '420' }),
			JSON.stringify({ version: 1, ...saved, doneMask: 70000 }),
			JSON.stringify({ version: 1, ...saved, map: { x: 99, y: 5 } }),
			JSON.stringify({ version: 1, ...saved, map: { x: 'a', y: 5 } }),
			JSON.stringify({ version: 1, ...saved, map: null }),
		])
			expect(parseProgress(text), text).toBeNull();
	});

	it('accepts a save with no map position', () => {
		const { map: _map, ...bare } = saved;
		expect(parseProgress(serializeProgress(bare))).toEqual(bare);
	});

	it('ignores a damaged save in the storage', () => {
		expect(readProgress(memory({ [saveKey]: '{"version":1,"lives":"x"}' }))).toBeNull();
	});
});

describe('describing a save', () => {
	it('counts the first area’s cleared levels by their ids: Crater Fields 0, Meteor Mesa 3, Zarg Lookout 4', () => {
		expect(clearedCount(0)).toBe(0);
		expect(clearedCount(0b1)).toBe(1);
		expect(clearedCount(0b11001)).toBe(3);
		/* Levels of the other areas do not count towards this area. */
		expect(clearedCount(0b100110)).toBe(0);
	});

	it('gives lives, snack points and levels cleared', () => {
		expect(describeProgress(saved)).toBe('2 lives · 420 snack points · 1 of 3 levels cleared');
		expect(describeProgress({ ...saved, lives: 1 })).toContain('1 life ·');
	});
});
