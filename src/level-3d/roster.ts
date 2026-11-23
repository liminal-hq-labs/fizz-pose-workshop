// The roster of live actors: matches each frame's sprites to the actors made for them, and creates, exits and removes them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import type { Actor, FrameContext, ModelSet, Placed, SpriteDraw } from './types.ts';

/** How far a moving sprite may travel in a frame and still be the same actor, in tiles. */
const sameActorReach = 2.5;
/** How far Ben may travel in a frame before the roster takes it for a restart or a teleport, in tiles. */
const restartJump = 6;
/** How far from the camera a sprite may vanish and still get an exit, in tiles. */
const exitReach = 24;
/** Fixed tiles are keyed by quarter tiles, within this many either side of the origin. */
const keyRange = 4096;
const keyOffset = 1024;

/** A set's family: its actors, and the list of moving ones when the family is not fixed. */
interface Family {
	set: ModelSet;
	name: string;
	id: number;
	fixed: boolean;
	/** True when no set claimed the sprite and the flat fallback draws it. */
	fallback: boolean;
	moving: Moving[];
}

interface Moving {
	actor: Actor;
	x: number;
	y: number;
	seen: number;
}

interface Fixed {
	actor: Actor | null;
	placed: Placed | null;
	seen: number;
}

interface Leaving {
	actor: Actor;
	elapsed: number;
	duration: number;
}

/** What the roster holds and how much work the last sync did, for the debug readout. */
export interface RosterStats {
	/** Actors on the scene for fixed tiles that are not batched. */
	fixedActors: number;
	/** Tiles drawn into a set's batches. */
	placedTiles: number;
	movingActors: number;
	/** Actors playing an exit. */
	leaving: number;
	/** Sprites the sim listed last frame. */
	sprites: number;
	/** Frames since the start in which the set of fixed tiles had to be worked out afresh. */
	reconciles: number;
}

/** Keeps one actor alive for each sprite the sim draws. */
export class Roster {
	/** Sprite names drawn by the flat fallback this frame, for tooling that reports missing models. */
	readonly unmodelled = new Set<string>();
	readonly stats: RosterStats = {
		fixedActors: 0,
		placedTiles: 0,
		movingActors: 0,
		leaving: 0,
		sprites: 0,
		reconciles: 0,
	};
	private readonly byName = new Map<string, Family>();
	private readonly byKey = new Map<string, Family>();
	private readonly fixed = new Map<number, Fixed>();
	private readonly leaving: Leaving[] = [];
	private previous = new Float64Array(2048);
	private current = new Float64Array(2048);
	private previousCount = 0;
	private frameNumber = 0;
	private lastBen: { x: number; y: number } | null = null;

	constructor(
		private readonly scene: THREE.Object3D,
		private readonly sets: readonly ModelSet[],
		private readonly fallback: ModelSet,
	) {
		for (const set of sets) if (set.root) scene.add(set.root);
	}

	private familyOf(name: string): Family {
		let hit = this.byName.get(name);
		if (hit) return hit;
		let set: ModelSet = this.fallback,
			family = name,
			fallback = true;
		for (const candidate of this.sets) {
			const found = candidate.family(name);
			if (found !== null) {
				set = candidate;
				family = found;
				fallback = false;
				break;
			}
		}
		const key = `${set.name}|${family}`;
		hit = this.byKey.get(key);
		if (!hit) {
			hit = {
				set,
				name: family,
				id: this.byKey.size + 1,
				fixed: !fallback && (set.fixed?.(family) ?? false),
				fallback,
				moving: [],
			};
			this.byKey.set(key, hit);
		}
		this.byName.set(name, hit);
		return hit;
	}

	private keyOf(family: Family, draw: SpriteDraw): number {
		return (
			(family.id * keyRange + Math.round(draw.x * 4) + keyOffset) * keyRange +
			Math.round(draw.y * 4) +
			keyOffset
		);
	}

	/** Finds or makes the record of a fixed tile, running its one and only `update` on creation. */
	private resolveFixed(family: Family, key: number, draw: SpriteDraw, frame: FrameContext): Fixed {
		let live = this.fixed.get(key);
		if (live) return live;
		const placed = family.set.place?.(family.name, draw) ?? null;
		let actor: Actor | null = null;
		if (!placed) {
			actor = family.set.create(family.name, draw);
			this.scene.add(actor.object);
			actor.update(draw, frame);
			this.stats.fixedActors++;
		} else this.stats.placedTiles++;
		live = { actor, placed, seen: this.frameNumber };
		this.fixed.set(key, live);
		return live;
	}

	/** Takes an actor off the scene, after its exit if it has one and the circumstances call for it. */
	private retire(actor: Actor, frame: FrameContext, x: number, restarted: boolean): void {
		if (actor.leave && !restarted && Math.abs(x - frame.camera.x) < exitReach) {
			const duration = actor.leave(frame);
			if (duration > 0) {
				this.leaving.push({ actor, elapsed: 0, duration });
				return;
			}
		}
		this.finish(actor);
	}

	private finish(actor: Actor): void {
		actor.dispose?.();
		this.scene.remove(actor.object);
	}

	/** Brings the actors into line with this frame's sprites. */
	sync(draws: readonly SpriteDraw[], frame: FrameContext): void {
		const count = draws.length,
			stats = this.stats;
		this.frameNumber++;
		this.unmodelled.clear();
		stats.sprites = count;
		if (this.current.length < count) {
			this.current = new Float64Array(count * 2);
			this.previous = new Float64Array(count * 2);
			this.previousCount = 0;
			/* The old keys are gone, so the first pass takes the slow way once. */
		}
		const ben = frame.ben,
			restarted =
				this.lastBen !== null &&
				Math.hypot(ben.x - this.lastBen.x, ben.y - this.lastBen.y) > restartJump;
		this.lastBen = { x: ben.x, y: ben.y };
		let changed = false;
		const previous = this.previous,
			current = this.current;
		for (let i = 0; i < count; i++) {
			const draw = draws[i],
				family = this.familyOf(draw.name);
			if (family.fixed) {
				const key = this.keyOf(family, draw);
				current[i] = key;
				if (previous[i] === key && i < this.previousCount) continue;
				changed = true;
				this.resolveFixed(family, key, draw, frame);
				continue;
			}
			current[i] = -1;
			if (i < this.previousCount && previous[i] !== -1) changed = true;
			if (family.fallback) this.unmodelled.add(draw.name);
			let live: Moving | undefined,
				best = sameActorReach * sameActorReach;
			for (const other of family.moving) {
				if (other.seen === this.frameNumber) continue;
				const d = (other.x - draw.x) ** 2 + (other.y - draw.y) ** 2;
				if (d < best) {
					best = d;
					live = other;
				}
			}
			if (!live) {
				const actor = family.set.create(family.name, draw);
				this.scene.add(actor.object);
				family.moving.push((live = { actor, x: draw.x, y: draw.y, seen: 0 }));
			}
			live.seen = this.frameNumber;
			live.x = draw.x;
			live.y = draw.y;
			live.actor.update(draw, frame);
		}
		for (let i = count; i < this.previousCount; i++) if (previous[i] !== -1) changed = true;
		if (changed) {
			stats.reconciles++;
			/* The fixed tiles moved in the list or changed: mark every one drawn and drop the rest. */
			for (let i = 0; i < count; i++) {
				const key = current[i];
				if (key === -1) continue;
				const live = this.fixed.get(key);
				if (live) live.seen = this.frameNumber;
			}
			for (const [key, live] of this.fixed)
				if (live.seen !== this.frameNumber) {
					this.fixed.delete(key);
					if (live.placed) {
						live.placed.remove();
						stats.placedTiles--;
					} else if (live.actor) {
						stats.fixedActors--;
						this.retire(live.actor, frame, live.actor.object.position.x, restarted);
					}
				}
		}
		this.previous = current;
		this.current = previous;
		this.previousCount = count;
		let moving = 0;
		for (const family of this.byKey.values()) {
			const list = family.moving;
			for (let i = list.length - 1; i >= 0; i--)
				if (list[i].seen !== this.frameNumber) {
					this.retire(list[i].actor, frame, list[i].x, restarted);
					list.splice(i, 1);
				}
			moving += list.length;
		}
		stats.movingActors = moving;
		for (let i = this.leaving.length - 1; i >= 0; i--) {
			const exit = this.leaving[i];
			exit.elapsed += frame.dt;
			exit.actor.leaving?.(exit.elapsed, exit.duration, frame);
			if (exit.elapsed >= exit.duration) {
				this.finish(exit.actor);
				this.leaving.splice(i, 1);
			}
		}
		stats.leaving = this.leaving.length;
		for (const set of this.sets) set.sync?.(frame);
	}
}
