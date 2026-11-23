// Saving and restoring a game: the lives, snack points, cleared levels and map position the sim holds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Follows `captureProgress` and `applyProgress` in episodes/episode-1/src/save.ts of liminal-hq/lieutenant-fizz at
// commit 94f354d, without the play time and the slots.

import type { StorageLike } from './audio/level-sound.ts';
import { State } from './sim.ts';

/** Where the page keeps the game: a key of its own, apart from the sound setting and from the game's saves. */
export const saveKey = 'fizz-3d:save';

/** The levels of the first area, in the order the map opens them, by the sim's id. */
export const firstAreaLevels: readonly number[] = [0, 3, 4];

/** What a save holds. */
export interface Progress {
	lives: number;
	score: number;
	/** The score the next extra life comes at. */
	nextLife: number;
	ammo: number;
	/** One bit for each level cleared, by the sim's id. */
	doneMask: number;
	/** Where Ben stood on the map, in tiles, when the sim has one. */
	map?: { x: number; y: number };
}

/** The part of the sim a save reads. */
export interface ProgressSource {
	state(index: number): number;
}

/** The part of the sim a restore writes. */
export interface ProgressTarget {
	setState(index: number, value: number): void;
}

/** What the sim holds now, as the game captures it when it goes to the map. */
export function captureProgress(sim: ProgressSource): Progress {
	const progress: Progress = {
		lives: sim.state(State.lives),
		score: sim.state(State.score),
		nextLife: sim.state(State.nextLife),
		ammo: sim.state(State.ammo),
		doneMask: sim.state(State.doneMask),
	};
	if (sim.state(State.hasMapPos) === 1)
		progress.map = { x: sim.state(State.mapX), y: sim.state(State.mapY) };
	return progress;
}

/** Writes a save into a sim that has just started a new game. The map position is only used by the next `enterMap`. */
export function applyProgress(sim: ProgressTarget, progress: Progress): void {
	sim.setState(State.lives, progress.lives);
	sim.setState(State.score, progress.score);
	sim.setState(State.nextLife, progress.nextLife);
	sim.setState(State.ammo, progress.ammo);
	sim.setState(State.doneMask, progress.doneMask);
	if (progress.map) {
		sim.setState(State.mapX, progress.map.x);
		sim.setState(State.mapY, progress.map.y);
	} else sim.setState(State.hasMapPos, 0);
}

const whole = (value: unknown, low: number, high: number): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high;

/** The text a save is stored as. */
export function serializeProgress(progress: Progress): string {
	return JSON.stringify({ version: 1, ...progress });
}

/** A save read back from text, or null when it is not one this page wrote or holds a value the game cannot have. */
export function parseProgress(text: string | null): Progress | null {
	if (!text) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof raw !== 'object' || raw === null) return null;
	const data = raw as Record<string, unknown>;
	if (data.version !== 1) return null;
	if (
		!whole(data.lives, 0, 99) ||
		!whole(data.score, 0, 9_999_999) ||
		!whole(data.nextLife, 0, 10_000_000) ||
		!whole(data.ammo, 0, 999) ||
		!whole(data.doneMask, 0, 0xffff)
	)
		return null;
	const progress: Progress = {
		lives: data.lives,
		score: data.score,
		nextLife: data.nextLife,
		ammo: data.ammo,
		doneMask: data.doneMask,
	};
	if (data.map !== undefined) {
		const map = data.map as Record<string, unknown> | null;
		if (
			typeof map !== 'object' ||
			map === null ||
			typeof map.x !== 'number' ||
			typeof map.y !== 'number' ||
			!Number.isFinite(map.x) ||
			!Number.isFinite(map.y) ||
			map.x < 0 ||
			map.x > 60 ||
			map.y < 0 ||
			map.y > 44
		)
			return null;
		progress.map = { x: map.x, y: map.y };
	}
	return progress;
}

/** Keeps a save. Returns false when the storage is missing, full or blocked, so the page can say it was not kept. */
export function writeProgress(storage: StorageLike | null, progress: Progress): boolean {
	try {
		if (!storage) return false;
		storage.setItem(saveKey, serializeProgress(progress));
		return true;
	} catch {
		return false;
	}
}

/** The save kept, or null when there is none, it is damaged or the storage is blocked. */
export function readProgress(storage: StorageLike | null): Progress | null {
	try {
		return parseProgress(storage?.getItem(saveKey) ?? null);
	} catch {
		return null;
	}
}

/** How many of the first area's levels a save has cleared. */
export function clearedCount(doneMask: number): number {
	return firstAreaLevels.filter((id) => (doneMask >> id) & 1).length;
}

/** One line on what a save holds, for the start card. */
export function describeProgress(progress: Progress): string {
	const lives = `${progress.lives} ${progress.lives === 1 ? 'life' : 'lives'}`,
		cleared = `${clearedCount(progress.doneMask)} of ${firstAreaLevels.length} levels cleared`;
	return `${lives} · ${progress.score.toLocaleString('en-CA')} snack points · ${cleared}`;
}
