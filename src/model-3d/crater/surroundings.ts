// What a ground tile knows about the tiles around it, so its edges, shadows and rock forms can join its neighbours'.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The solid ground around one tile: how much of each neighbouring edge is rock, as a fraction of a tile. */
export interface Surroundings {
	/** The height of the left neighbour's right edge, 0 when there is no tile. */
	leftH: number;
	/** The height of the right neighbour's left edge, 0 when there is no tile. */
	rightH: number;
	/** True when the tile up and to the left is solid, so a wall rises beside this tile. */
	wallL: boolean;
	/** True when the tile up and to the right is solid. */
	wallR: boolean;
	/** True when there is solid ground directly below, so a block here rests on something. */
	below: boolean;
}

/** The surface of a tile: its height at the left and right edge, as fractions of the tile, and whether it carries a grassy crust. */
export interface TileShape {
	hl: number;
	hr: number;
	crust: boolean;
}

/** A tile in the middle of a run: hidden on both sides, with ground below. */
export function enclosed(shape: TileShape): Surroundings {
	return { leftH: shape.hl, rightH: shape.hr, wallL: false, wallR: false, below: true };
}
