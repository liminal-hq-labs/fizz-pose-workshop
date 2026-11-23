// The page's play flow: what happens after Ben dies, finishes the level, runs out of lives or the player pauses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What the page is doing: playing, showing a card over the level, or waiting for a key. */
export type Phase = 'play' | 'died' | 'complete' | 'gameover';

/** A card shown over the level. */
export interface Card {
	title: string;
	text: string;
	/** What the player can do next, or empty when the page carries on by itself. */
	action: string;
}

/** What the flow asks of the page. */
export interface FlowHooks {
	/** Shows a card, or clears it with null. */
	card(card: Card | null): void;
	/** Stops or resumes the sim. */
	freeze(on: boolean): void;
	/** Muffles the music behind a card, or opens it again. */
	muffle(on: boolean): void;
	/** Shows or hides the pause screen and suspends or resumes the sound. */
	pauseScreen(on: boolean): void;
	/** Loads the level again, keeping the lives and snack points the sim holds. */
	retry(): void;
	/** Starts a new game: three lives and no snack points. */
	newGame(): void;
	/** Throws the confetti of a cleared level. */
	celebrate(): void;
	/** Starts a timer; the page passes `setTimeout`, a test its own clock. */
	later(fn: () => void, ms: number): unknown;
	/** Cancels a timer from `later`. */
	cancel(timer: unknown): void;
}

/** How long the tumble card stays before the level starts again, and how long the sim runs on after the exit. */
export const flowTimes = { tumble: 1800, afterExit: 700, keyGuard: 600 } as const;

/** How far below the bottom of the level Ben may fall before it counts as a death, in tiles. */
export const fallLimit = -12;

const plural = (n: number): string => `${n} ${n === 1 ? 'life' : 'lives'}`;

/**
 * The sim raises DIED, GAME_OVER and LEVEL_COMPLETE and leaves the rest to the shell. The game goes back to its map;
 * this page has none, so a death shows a short card and loads the level again with the lives and snack points the sim
 * kept, a game over waits for a key to start a new game, and a cleared level celebrates and waits to be played again.
 */
export class LevelFlow {
	phase: Phase = 'play';
	paused = false;
	private timer: unknown;
	private armed = false;

	constructor(private readonly hooks: FlowHooks) {}

	private clear(): void {
		if (this.timer !== undefined) this.hooks.cancel(this.timer);
		this.timer = undefined;
	}

	private cardUp(card: Card, wait?: number): void {
		this.clear();
		this.armed = false;
		this.hooks.freeze(true);
		this.hooks.muffle(true);
		this.hooks.card(card);
		if (wait === undefined) return;
		this.timer = this.hooks.later(() => {
			this.armed = true;
			this.timer = undefined;
		}, wait);
	}

	/** The sim raised DIED: `lives` are left. The level starts again after a short card. */
	died(lives: number, level: string): void {
		if (this.phase !== 'play') return;
		this.phase = 'died';
		this.cardUp({
			title: 'Ben took a tumble',
			text: `${level} starts again. ${plural(lives)} left — every 100 snack points earns another.`,
			action: '',
		});
		this.timer = this.hooks.later(() => this.resume(), flowTimes.tumble);
	}

	/** The sim raised GAME_OVER with `score` snack points. */
	gameOver(score: number): void {
		if (this.phase === 'gameover') return;
		this.phase = 'gameover';
		this.cardUp(
			{
				title: 'Out of lives',
				text: `You finished with ${score} snack points.`,
				action: 'Press a key to start again',
			},
			flowTimes.keyGuard,
		);
	}

	/** The sim raised LEVEL_COMPLETE: the sim runs on a moment, as in the game, then the card comes up. */
	complete(level: string, score: number): void {
		if (this.phase !== 'play') return;
		this.phase = 'complete';
		this.clear();
		this.timer = this.hooks.later(() => {
			this.hooks.celebrate();
			this.cardUp(
				{
					title: `${level} cleared!`,
					text: `${score} snack points. Ben made it to the exit.`,
					action: 'Press Enter to play again',
				},
				flowTimes.keyGuard,
			);
		}, flowTimes.afterExit);
	}

	private resume(): void {
		this.clear();
		this.phase = 'play';
		this.hooks.card(null);
		this.hooks.muffle(false);
		this.hooks.retry();
		this.hooks.freeze(false);
	}

	/** A key or a tap while a card waits: starts a new game. Returns whether it was used. */
	press(): boolean {
		if (!this.armed || (this.phase !== 'gameover' && this.phase !== 'complete')) return false;
		this.restart();
		return true;
	}

	/** Starts a new game from anywhere, as the R key does. */
	restart(): void {
		this.clear();
		this.armed = false;
		this.paused = false;
		this.phase = 'play';
		this.hooks.pauseScreen(false);
		this.hooks.card(null);
		this.hooks.muffle(false);
		this.hooks.newGame();
		this.hooks.freeze(false);
	}

	/** Pauses or resumes. Only play pauses; a card has the screen already. */
	togglePause(): boolean {
		if (this.phase !== 'play') return this.paused;
		this.paused = !this.paused;
		this.hooks.freeze(this.paused);
		this.hooks.pauseScreen(this.paused);
		return this.paused;
	}
}
