// Idle life for the standing Ben: a schedule of the model's idle poses, and a blink with the odd double.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type IdlePose = 'wrist' | 'tip' | 'rock';

/** The idle poses in the order they play, and how long each runs, in seconds. */
const order: readonly IdlePose[] = ['wrist', 'rock', 'tip'];
const lengths: Record<IdlePose, number> = { wrist: 3.2, rock: 3, tip: 2.9 };
/** How long he stands before the first idle, and the range of rests between them, in seconds. The sim's joke comes at 20. */
const firstAfter = 4;
const restMin = 2;
const restSpan = 1.5;

/** A small seeded generator, so each Ben has his own rhythm and a test can replay it. */
export class Rng {
	constructor(private seed: number) {}
	next(): number {
		this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
		return this.seed / 4294967296;
	}
}

/** Which idle pose plays, and for how long it has been playing. */
export class Idle {
	private still = 0;
	private rest = firstAfter;
	private clipTime = 0;
	private clip: IdlePose | null = null;
	private nextIndex: number;
	constructor(private readonly rng: Rng) {
		this.nextIndex = Math.floor(rng.next() * order.length);
	}

	/** The idle pose playing now, or null. */
	get pose(): IdlePose | null {
		return this.clip;
	}
	/** Seconds since the pose began. */
	get time(): number {
		return this.clipTime;
	}
	/** Seconds standing still. */
	get standing(): number {
		return this.still;
	}

	/** Advances by `el` seconds; any frame that is not `standing` ends the pose and the count. */
	update(el: number, standing: boolean): void {
		if (!standing) {
			this.still = 0;
			this.clip = null;
			this.clipTime = 0;
			this.rest = firstAfter;
			return;
		}
		this.still += el;
		if (this.clip) {
			this.clipTime += el;
			if (this.clipTime >= lengths[this.clip]) {
				this.clip = null;
				this.rest = restMin + restSpan * this.rng.next();
				this.still = 0;
			}
		} else if (this.still >= this.rest) {
			this.clip = order[this.nextIndex++ % order.length];
			this.clipTime = 0;
		}
	}
}

/** Blinks at irregular gaps, one time in four twice running. */
export class Blink {
	private wait: number;
	private closed = 0;
	private again = false;
	constructor(private readonly rng: Rng) {
		this.wait = 1.5 + rng.next() * 2;
	}

	/** How closed the eyes are, 0 open to 1 shut. */
	update(el: number): number {
		if (this.closed > 0) {
			this.closed -= el;
			if (this.closed <= 0) {
				if (this.again) {
					this.again = false;
					this.wait = 0.12;
				}
			}
			return this.closed > 0 ? 1 : 0;
		}
		this.wait -= el;
		if (this.wait <= 0) {
			this.closed = 0.11;
			this.again = this.rng.next() < 0.25;
			this.wait = 2.2 + this.rng.next() * 3;
		}
		return 0;
	}
}
