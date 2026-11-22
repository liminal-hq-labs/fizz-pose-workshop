// The factor that sizes the cast of the level (enemies, pickups, keys, shots and effects) against the sprite art.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * The hero is drawn a third larger than his sprite's art, because the slim model reads smaller than the chunky sprite.
 * Everything that shares the stage with him is scaled by the same factor, so the cast keeps the game's proportions. The
 * terrain is not scaled, because it is the simulation's collision grid.
 */
export const castScale = 4 / 3;
