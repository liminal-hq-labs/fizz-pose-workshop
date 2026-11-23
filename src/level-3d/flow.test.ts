// Checks the play flow: the death beat and retry or the map, game over, a cleared level, the pause and the restart.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'bun:test';
import { fallLimit, flowTimes, LevelFlow, type Card } from './flow.ts';

/** A flow with a hand-run clock, recording what it asked of the page. */
function make(overworld = false) {
	const log: string[] = [];
	let cards: (Card | null)[] = [];
	let now = 0;
	const timers: { at: number; fn: () => void; id: number }[] = [];
	let next = 1;
	const flow = new LevelFlow({
		card: (c) => cards.push(c),
		freeze: (on) => log.push(on ? 'freeze' : 'thaw'),
		muffle: (on) => log.push(on ? 'muffle' : 'open'),
		pauseScreen: (on) => log.push(on ? 'pause-on' : 'pause-off'),
		retry: () => log.push('retry'),
		toMap: overworld ? () => log.push('map') : undefined,
		newGame: () => log.push('new'),
		celebrate: () => log.push('confetti'),
		later: (fn, ms) => {
			const id = next++;
			timers.push({ at: now + ms, fn, id });
			return id;
		},
		cancel: (id) => {
			const i = timers.findIndex((t) => t.id === id);
			if (i >= 0) timers.splice(i, 1);
		},
	});
	const advance = (ms: number): void => {
		now += ms;
		for (;;) {
			const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
			if (!due) return;
			timers.splice(timers.indexOf(due), 1);
			due.fn();
		}
	};
	return { flow, log, advance, cards: () => cards, clear: () => ((cards = []), (log.length = 0)) };
}

describe('LevelFlow', () => {
	it('shows a card on a death, then loads the level again keeping lives, without a new game', () => {
		const t = make();
		t.flow.died(2, 'Crater Fields');
		expect(t.flow.phase).toBe('died');
		expect(t.cards()[0]!.text).toContain('2 lives left');
		expect(t.log).toEqual(['freeze', 'muffle']);
		t.advance(flowTimes.tumble - 1);
		expect(t.log).not.toContain('retry');
		t.advance(2);
		expect(t.log.slice(2)).toEqual(['open', 'retry', 'thaw']);
		expect(t.log).not.toContain('new');
		expect(t.cards().at(-1)).toBeNull();
		expect(t.flow.phase).toBe('play');
	});

	it('says one life in the singular', () => {
		const t = make();
		t.flow.died(1, 'Crater Fields');
		expect(t.cards()[0]!.text).toContain('1 life left');
	});

	it('waits for a key at game over, ignores the first moment, then starts a new game', () => {
		const t = make();
		t.flow.gameOver(40);
		expect(t.flow.phase).toBe('gameover');
		expect(t.cards()[0]!.text).toContain('40 snack points');
		expect(t.flow.press()).toBe(false);
		t.advance(flowTimes.keyGuard + 1);
		expect(t.flow.press()).toBe(true);
		expect(t.log).toContain('new');
		expect(t.log).not.toContain('retry');
		expect(t.flow.phase).toBe('play');
		expect(t.flow.press()).toBe(false);
	});

	it('lets the sim run on after the exit, then celebrates and waits to play again', () => {
		const t = make();
		t.flow.complete('Crater Fields', 120);
		expect(t.log).toEqual([]);
		t.advance(flowTimes.afterExit + 1);
		expect(t.log).toEqual(['confetti', 'freeze', 'muffle']);
		expect(t.cards()[0]!.title).toBe('Crater Fields cleared!');
		expect(t.flow.press()).toBe(false);
		t.advance(flowTimes.keyGuard + 1);
		expect(t.flow.press()).toBe(true);
		expect(t.log).toContain('new');
	});

	it('does not take a second event while one card is up', () => {
		const t = make();
		t.flow.died(2, 'Crater Fields');
		t.flow.died(1, 'Crater Fields');
		t.flow.complete('Crater Fields', 0);
		expect(t.cards()).toHaveLength(1);
	});

	it('pauses and resumes only in play', () => {
		const t = make();
		expect(t.flow.togglePause()).toBe(true);
		expect(t.log).toEqual(['freeze', 'pause-on']);
		expect(t.flow.togglePause()).toBe(false);
		t.flow.gameOver(0);
		expect(t.flow.togglePause()).toBe(false);
		expect(t.log.filter((l) => l === 'pause-on')).toHaveLength(1);
	});

	it('restarts from anywhere with a new game, dropping a card, a pause and a pending retry', () => {
		const t = make();
		t.flow.died(2, 'Crater Fields');
		t.flow.restart();
		t.clear();
		t.advance(flowTimes.tumble * 2);
		expect(t.log).toEqual([]);
		t.flow.togglePause();
		t.flow.restart();
		expect(t.flow.paused).toBe(false);
		expect(t.log.at(-1)).toBe('thaw');
		expect(t.log).toContain('new');
	});

	it('counts a fall well below the level as a death', () => {
		expect(fallLimit).toBeLessThan(0);
	});
});

describe('LevelFlow on the game page (with an overworld)', () => {
	it('shows the card, then goes back to the map with no retry and no new game', () => {
		const t = make(true);
		t.flow.died(2, 'Crater Fields');
		expect(t.cards()[0]!.text).toContain('Crater Fields sends you back to the map. 2 lives left');
		t.advance(flowTimes.tumble - 1);
		expect(t.log).not.toContain('map');
		t.advance(2);
		expect(t.log.slice(2)).toEqual(['open', 'map', 'thaw']);
		expect(t.log).not.toContain('retry');
		expect(t.log).not.toContain('new');
		expect(t.cards().at(-1)).toBeNull();
		expect(t.flow.phase).toBe('play');
	});

	it('celebrates a cleared level with its own line, and the map follows a key after the guard', () => {
		const t = make(true);
		t.flow.complete('Crater Fields', 120, 'The path on to Meteor Mesa is open.');
		t.advance(flowTimes.afterExit + 1);
		expect(t.log).toEqual(['confetti', 'freeze', 'muffle']);
		expect(t.cards()[0]).toMatchObject({
			title: 'Crater Fields cleared!',
			text: 'The path on to Meteor Mesa is open.',
			action: 'Press Enter for the map',
		});
		expect(t.flow.press()).toBe(false);
		t.advance(flowTimes.keyGuard + 1);
		expect(t.flow.press()).toBe(true);
		expect(t.log.slice(3)).toEqual(['open', 'map', 'thaw']);
		expect(t.log).not.toContain('new');
		expect(t.flow.phase).toBe('play');
		expect(t.flow.press()).toBe(false);
	});

	it('gives a score line when a level has no line of its own', () => {
		const t = make(true);
		t.flow.complete('Crater Fields', 120);
		t.advance(flowTimes.afterExit + 1);
		expect(t.cards()[0]!.text).toContain('120 snack points');
	});

	it('offers a new game at game over, not the map', () => {
		const t = make(true);
		t.flow.gameOver(40);
		expect(t.cards()[0]!.action).toBe('Press a key to start a new game');
		t.advance(flowTimes.keyGuard + 1);
		expect(t.flow.press()).toBe(true);
		expect(t.log).toContain('new');
		expect(t.log).not.toContain('map');
	});

	it('leaves for the map from a level that ends with no card, as the saucer does', () => {
		const t = make(true);
		t.flow.leaveToMap();
		expect(t.log).toEqual(['open', 'map', 'thaw']);
		expect(t.flow.phase).toBe('play');
	});

	it('drops a pending trip to the map when a new game starts', () => {
		const t = make(true);
		t.flow.died(2, 'Crater Fields');
		t.flow.restart();
		t.clear();
		t.advance(flowTimes.tumble * 2);
		expect(t.log).toEqual([]);
	});

	it('pauses on the map and in a level alike', () => {
		const t = make(true);
		expect(t.flow.togglePause()).toBe(true);
		expect(t.flow.togglePause()).toBe(false);
		expect(t.log).toEqual(['freeze', 'pause-on', 'thaw', 'pause-off']);
	});
});
