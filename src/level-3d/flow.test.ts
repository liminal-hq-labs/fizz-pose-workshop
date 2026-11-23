// Checks the play flow: the death beat and retry, game over, a cleared level, the pause and the restart.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'bun:test';
import { fallLimit, flowTimes, LevelFlow, type Card } from './flow.ts';

/** A flow with a hand-run clock, recording what it asked of the page. */
function make() {
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
