// The contract between the level stage and the model sets that turn the sim's sprites into 3D actors.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';

/**
 * One sprite the sim asked to draw this frame. Positions and sizes are in tiles: X runs right along the level, Y runs up,
 * and one tile is one world unit. `x` and `y` are the sprite's centre.
 */
export interface SpriteDraw {
	/** The sim's sprite name, such as `craterTop`, `gloop1` or `ben_run2`. */
	name: string;
	x: number;
	y: number;
	/** The drawn width and height in tiles, always positive. A 16 pixel sprite at scale 1 is 1 tile. */
	w: number;
	h: number;
	/** True when the sim mirrored the sprite: a character then faces left instead of right. */
	flip: boolean;
	/** Rotation in radians, anticlockwise. */
	rot: number;
	/** A colour multiplier, 0xffffff for none. */
	tint: number;
	alpha: number;
	/** True for sprites that glow regardless of light: fizz, lava, lamps. */
	emissive: boolean;
	/** The sprite's place in the sim's painter's order this frame; later draws are in front. */
	order: number;
}

/** What a model can read about the frame besides its own sprite. */
export interface FrameContext {
	/** Seconds since the page started, for idle motion that the sim does not drive. */
	time: number;
	/** Seconds since the last drawn frame. */
	dt: number;
	/** Where Ben is, in tiles. */
	ben: { x: number; y: number };
	/** Every sprite drawn this frame, in order. */
	draws: readonly SpriteDraw[];
}

/** A 3D stand-in for one sprite, kept alive from frame to frame while the sim keeps drawing it. */
export interface Actor {
	/** Added to the scene by the stage. Build it around the origin: the stage does not move it. */
	object: THREE.Object3D;
	/**
	 * Called every frame with the sprite this actor stands for. The actor places itself: set `object.position` from
	 * `draw.x` and `draw.y` (Z is depth, towards the camera) and react to the name, flip, tint and alpha.
	 */
	update(draw: SpriteDraw, frame: FrameContext): void;
	/** Called when the sim stops drawing the sprite, before the object is removed. Free geometry made per actor. */
	dispose?(): void;
}

/** A group of related models, such as the terrain or the enemies. */
export interface ModelSet {
	name: string;
	/**
	 * The family a sprite belongs to, or null when this set does not draw it. Animation frames of one thing share a
	 * family (`gloop0` and `gloop1` are both `gloop`), so one actor lives across them and sees the name change.
	 */
	family(spriteName: string): string | null;
	/** Makes an actor for the first sprite of a family member. */
	create(family: string, first: SpriteDraw): Actor;
	/**
	 * Families whose members never move, such as terrain tiles. The stage matches them by position, which is cheaper and
	 * exact. Everything else is matched to the nearest actor of its family from the frame before.
	 */
	fixed?(family: string): boolean;
}
