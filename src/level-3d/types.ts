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
	/**
	 * True when the sim mirrored the sprite. Which way that faces depends on the art: Ben's sprites are drawn facing
	 * right, the enemies' facing left, so a flipped Ben faces left and a flipped enemy faces right.
	 */
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
	/**
	 * Where the camera is, in tiles (X right, Y up, Z towards the viewer), for anything that should follow the view rather
	 * than Ben: parallax layers, the sky dome, haze. It is placed before any actor is updated, so it is this frame's.
	 */
	camera: { x: number; y: number; z: number };
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
	/**
	 * Called when the sim stops drawing the sprite, such as a snack being collected or a door opening. Returns how many
	 * seconds the object should stay in the scene for a short exit, or 0 (or nothing) to go at once. It is not called when
	 * the level restarts or the sprite is far from the camera.
	 */
	leave?(frame: FrameContext): number;
	/**
	 * Called every frame while the object is staying for its exit, with the seconds since `leave` and the duration it
	 * returned. The last call has `elapsed >= duration`, after which the stage disposes the actor.
	 */
	leaving?(elapsed: number, duration: number, frame: FrameContext): void;
	/** Called when the object is removed from the scene, after any exit. Free geometry made per actor. */
	dispose?(): void;
}

/** A tile a model set drew for itself, as part of a batch, rather than as an actor of its own. */
export interface Placed {
	/** Takes the tile out of the batch. */
	remove(): void;
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
	 * exact, and calls `update` on their actors once, for the first sprite, and never again. Everything else is matched to
	 * the nearest actor of its family from the frame before and updated every frame.
	 */
	fixed?(family: string): boolean;
	/**
	 * For fixed families: draws the tile into a batch the set owns (reached through `root`) and returns a handle, or
	 * returns null to have the stage make an actor with `create` instead. Lets a set draw a thousand tiles in a few meshes.
	 */
	place?(family: string, first: SpriteDraw): Placed | null;
	/** An object the stage adds to the scene once, for what `place` draws. */
	root?: THREE.Object3D;
	/** Called once a frame after the actors are brought into line, to flush batches and set shared uniforms. */
	sync?(frame: FrameContext): void;
}
