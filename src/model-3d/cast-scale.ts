// The factors that size the cast of the level (enemies, pickups, keys, shots and effects) against the sprite art.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * Ben is a regular ten-year-old about 1.4 m tall and stands 2 tiles, so one tile is about 70 cm. The enemies are exactly
 * the size of their art, which is also the size the simulation collides with: next to him a Gloop is a waist-high slug.
 * The spore puffs, the stun stars, the generic puff and the enemy shot belong to the creatures and share this factor.
 */
export const creatureScale = 1;

/**
 * The collectibles (cheezie, chocolate bar, cookie, soda can and the gumdrop keys) are 70 percent of their art, which
 * makes a cheezie bag about 46 cm: an oversized cartoon prop that is still clearly smaller than his torso. The fizz
 * bubble Ben fires shares this factor. The terrain is not scaled, because it is the simulation's collision grid.
 */
export const collectibleScale = 0.7;
