// The terrain families every ground theme shares (fill, top, block, ledge, slopes) as batched tiles and as one-off actors.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import type { Look, TileInfo } from './batch.ts';
import {
	blockGeometry,
	blockTile,
	fillGeometry,
	groundTile,
	platformGeometry,
	slopeGeometry,
	slopeHeights,
	topGeometry,
	type SlopeName,
	variantCount,
} from './ground.ts';
import { tileHash } from './hash.ts';
import type { Surroundings } from './surroundings.ts';
import type { GroundTheme } from './theme.ts';

/** The model families that make up a theme's ground: the sprites of a world name these, and `groundFamily` tells them apart. */
export const groundFamilies = [
	'fill',
	'top',
	'block',
	'plat',
	'R45',
	'L45',
	'R22A',
	'R22B',
	'L22A',
	'L22B',
] as const;

export function isGround(family: string): boolean {
	return (groundFamilies as readonly string[]).includes(family);
}

export function isSlope(family: string): family is SlopeName {
	return family in slopeHeights;
}

export function variantOf(draw: SpriteDraw): number {
	return Math.floor(tileHash(draw.x, draw.y) * variantCount) % variantCount;
}

/** Fixes an object to its tile: terrain never moves, so the matrix is built once and never recomputed. */
export function pin(object: THREE.Object3D, draw: SpriteDraw): void {
	object.position.set(draw.x, draw.y, 0);
	object.updateMatrix();
	object.matrixAutoUpdate = false;
}

export function tileMesh(
	geometry: THREE.BufferGeometry,
	material: THREE.Material,
	shadows: { cast: boolean; receive: boolean },
): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = shadows.cast;
	mesh.receiveShadow = shadows.receive;
	return mesh;
}

/** An actor for a tile that stays where it is drawn. */
export function tileActor(
	object: THREE.Object3D,
	first: SpriteDraw,
	tick?: (frameTime: number) => void,
): Actor {
	pin(object, first);
	let x = first.x,
		y = first.y;
	return {
		object,
		update(draw, frame) {
			if (draw.x !== x || draw.y !== y) {
				x = draw.x;
				y = draw.y;
				object.matrixAutoUpdate = true;
				pin(object, draw);
			}
			tick?.(frame.time);
		},
	};
}

/** How a tile of the batch is drawn: its look, its default geometry, what it says about its neighbours and how it is turned. */
export interface BatchedTile {
	look: Look;
	geometry: THREE.BufferGeometry;
	info: TileInfo;
	yaw: number;
}

/** The batched form of one of the ground families, or null for a family that is not one of them. */
export function batchedGround(
	family: string,
	first: SpriteDraw,
	theme: GroundTheme,
): BatchedTile | null {
	/* The draw is a pooled record that is refilled later, and the builders below run later: copy the position now. */
	const x = first.x,
		y = first.y;
	const solid = (
		look: Look,
		geometry: THREE.BufferGeometry,
		edges: readonly [number, number],
		build: (around: Surroundings) => THREE.BufferGeometry,
		top = 0.5,
	): BatchedTile => ({
		look,
		geometry,
		yaw: 0,
		info: { solidTop: top, edges, build },
	});
	const shaped = (hl: number, hr: number, crust: boolean) => (around: Surroundings) =>
		groundTile({ hl, hr, crust }, x, y, around, theme);
	if (isSlope(family)) {
		const [hl, hr] = slopeHeights[family];
		return solid(
			'ground',
			slopeGeometry(family, variantOf(first), theme),
			[hl, hr],
			shaped(hl, hr, true),
			-0.5 + (hl + hr) / 2,
		);
	}
	switch (family) {
		case 'fill':
			return solid('fill', fillGeometry(variantOf(first), theme), [1, 1], shaped(1, 1, false));
		case 'top':
			return solid('ground', topGeometry(variantOf(first), theme), [1, 1], shaped(1, 1, true));
		case 'block':
			return solid('ground', blockGeometry(theme), [1, 1], (around) =>
				blockTile(around.below, { x, y }, { leftH: around.leftH, rightH: around.rightH }, theme),
			);
		case 'plat':
			return {
				look: 'prop',
				geometry: platformGeometry(theme),
				yaw: 0,
				info: { build: (around) => theme.ledge(x, y, around), join: 'plat' },
			};
	}
	return null;
}

/** An actor for one of the ground families, for a caller that does not batch; null for any other family. */
export function groundActor(family: string, first: SpriteDraw, theme: GroundTheme): Actor | null {
	const { ground, prop } = theme.materials;
	if (isSlope(family))
		return tileActor(
			tileMesh(slopeGeometry(family, variantOf(first), theme), ground, {
				cast: true,
				receive: true,
			}),
			first,
		);
	switch (family) {
		case 'fill':
			return tileActor(
				tileMesh(fillGeometry(variantOf(first), theme), ground, { cast: false, receive: true }),
				first,
			);
		case 'top':
			return tileActor(
				tileMesh(topGeometry(variantOf(first), theme), ground, { cast: true, receive: true }),
				first,
			);
		case 'block':
			return tileActor(
				tileMesh(blockGeometry(theme), ground, { cast: true, receive: true }),
				first,
			);
		case 'plat':
			return tileActor(
				tileMesh(platformGeometry(theme), prop, { cast: true, receive: true }),
				first,
			);
	}
	return null;
}
