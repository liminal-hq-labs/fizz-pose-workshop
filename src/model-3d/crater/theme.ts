// What a world gives the shared ground machinery: its rock, crust, blocks, ledge, dressing, backdrop-facing walls and materials.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import type { BlockTheme } from './bricks.ts';
import type { Mesher } from './mesher.ts';
import type { Surroundings } from './surroundings.ts';

/** The colours of the crust on top of the ground, and of its lip and drips. */
export interface Crust {
	top: number;
	front: number;
	dark: number;
	light: number;
}

/** The materials a batch draws a world's tiles with, one for each look. */
export interface TileMaterials {
	ground: THREE.Material;
	prop: THREE.Material;
	glow: THREE.Material;
	chocolate: THREE.Material;
	unlit: THREE.Material;
}

/**
 * A world's ground: the colours and small shapes the shared tile, batch and wall builders take. The crater's is
 * `craterTheme`; every other world supplies its own and gets the same tiles, joins and batching.
 */
export interface GroundTheme {
	/** Names the batch's root and meshes, and keys the geometry caches. */
	name: string;
	materials: TileMaterials;
	/** The colour of the stone at a place in a rock face, from its joint index, course and face. */
	stoneColour(a: number, b: number, face: number): number;
	/** The colour of the joints between stones, and of the shadow under the crust's lip. */
	crevice: number;
	crust: Crust;
	/** The face of a cliff that turns towards the level, past the ends of the ground. */
	cliffFace: number;
	/** The colour of the crust's top at a point, from the tile's world x, the point's local x and z and the shade of walls beside it. */
	crustColour(wx: number, x: number, z: number, aoL: number, aoR: number): number;
	/** Studs set on a rock face; `under(x)` is the edge of the rock under the crust, and `boulders` says whether larger ones may stand. */
	studs(m: Mesher, col: number, row: number, under: (x: number) => number, boulders: boolean): void;
	/** Details on the crust, kept to the near and far edges so the walking strip stays clear; `surf(x)` is the crust's height. */
	dress(m: Mesher, col: number, row: number, surf: (x: number) => number): void;
	block: BlockTheme;
	/** The one-way ledge for the tile centred at (wx, wy); `around` says whether another ledge joins either side. */
	ledge(wx: number, wy: number, around: Surroundings): THREE.BufferGeometry;
	/** How the rock of a pit's back wall is lit at height `v`, for a wall rising to `top`. */
	chasmTone(colour: number, v: number, top: number): number;
	/** How the rock of a cliff past the ends of the ground is lit. */
	cliffTone(colour: number): number;
}
