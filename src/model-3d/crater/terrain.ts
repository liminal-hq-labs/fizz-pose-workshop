// The ground, slopes, ledges, hazards, door, exit, crystals and backdrop of the crater levels, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, ModelSet, SpriteDraw } from '../../level-3d/types.ts';
import { backdropActor } from './backdrop.ts';
import { TileBatch, type Look, type TileInfo } from './batch.ts';
import {
	chocolateDeepGeometry,
	chocolateTopGeometry,
	crystalGeometry,
	doorGeometry,
	exitBottomGeometry,
	exitLettersGeometry,
	exitTopGeometry,
	spikeGeometry,
} from './features.ts';
import {
	blockGeometry,
	fillGeometry,
	platformGeometry,
	slopeGeometry,
	slopeHeights,
	topGeometry,
	type SlopeName,
	variantCount,
} from './ground.ts';
import { glowGeometry, glowMaterial as haloMaterial } from '../snacks/shared.ts';
import { tileHash } from './hash.ts';
import {
	chocolateMaterial,
	chocolateTime,
	glowMaterial,
	groundMaterial,
	propMaterial,
	unlitMaterial,
} from './materials.ts';

/** Sprite names the simulation draws for the crater levels, and the model family each belongs to. */
const families: Readonly<Record<string, string>> = {
	craterFill: 'fill',
	craterTop: 'top',
	craterBlock: 'block',
	craterR45: 'R45',
	craterL45: 'L45',
	craterR22A: 'R22A',
	craterR22B: 'R22B',
	craterL22A: 'L22A',
	craterL22B: 'L22B',
	craterPlat: 'plat',
	spike: 'spike',
	chocTop0: 'chocTop',
	chocTop1: 'chocTop',
	chocDeep0: 'chocDeep',
	chocDeep1: 'chocDeep',
	doorRed: 'door',
	exitBot: 'exitBot',
	exitTop: 'exitTop',
	crysM: 'crystal',
	mtnTop: 'backdrop',
	hillTop: 'backdrop',
	fill: 'backdrop',
};

function isSlope(family: string): family is SlopeName {
	return family in slopeHeights;
}

function variantOf(draw: SpriteDraw): number {
	return Math.floor(tileHash(draw.x, draw.y) * variantCount) % variantCount;
}

/** Fixes an object to its tile: terrain never moves, so the matrix is built once and never recomputed. */
function pin(object: THREE.Object3D, draw: SpriteDraw): void {
	object.position.set(draw.x, draw.y, 0);
	object.updateMatrix();
	object.matrixAutoUpdate = false;
}

function tileMesh(
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
function tileActor(
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

/** How long the door takes to give way, in seconds, and how much of that it spends shaking before it drops. */
const doorExit = 0.7,
	doorShake = 0.22;

function doorActor(first: SpriteDraw): Actor {
	const group = new THREE.Group(),
		mesh = tileMesh(doorGeometry(), propMaterial, { cast: true, receive: true });
	group.add(mesh);
	pin(group, first);
	let decided = false;
	return {
		object: group,
		update(draw, frame) {
			if (decided) return;
			decided = true;
			/* Two door sprites stack; only the lower one carries the whole two-tile door. */
			const below = frame.draws.some(
				(other) =>
					other.name === draw.name && other.x === draw.x && Math.abs(other.y - (draw.y - 1)) < 0.01,
			);
			mesh.visible = !below;
		},
		/* Opened with the key: it rattles, then drops into the ground like a portcullis. */
		leave: () => (mesh.visible ? doorExit : 0),
		leaving(elapsed) {
			group.matrixAutoUpdate = true;
			const shake = Math.min(1, elapsed / doorShake),
				drop = Math.max(0, (elapsed - doorShake) / (doorExit - doorShake));
			group.position.set(
				first.x + (elapsed < doorShake ? Math.sin(elapsed * 90) * 0.04 * (1 - shake * 0.3) : 0),
				first.y - drop * drop * 2.2,
				0,
			);
			group.rotation.z = elapsed < doorShake ? Math.sin(elapsed * 70) * 0.01 : 0;
		},
	};
}

function exitActor(family: 'exitBot' | 'exitTop', first: SpriteDraw): Actor {
	const group = new THREE.Group();
	group.add(
		tileMesh(family === 'exitBot' ? exitBottomGeometry() : exitTopGeometry(), propMaterial, {
			cast: true,
			receive: true,
		}),
	);
	if (family === 'exitTop') {
		group.add(tileMesh(exitLettersGeometry(), unlitMaterial, { cast: false, receive: false }));
		/* A warm glow over the doorway, so the way out reads from across the level. */
		const halo = new THREE.Mesh(glowGeometry(), haloMaterial(0xffd84a, 0.55));
		halo.position.set(0, -0.6, 0.5);
		halo.scale.setScalar(3.6);
		halo.renderOrder = -1;
		group.add(halo);
	}
	return tileActor(group, first);
}

const batch = new TileBatch();

/** How a family's tiles are drawn in the batch, for the families that go in it. */
function batched(
	family: string,
	first: SpriteDraw,
): { look: Look; geometry: THREE.BufferGeometry; info: TileInfo; yaw: number } | null {
	const solid = (look: Look, geometry: THREE.BufferGeometry, top = 0.5) => ({
		look,
		geometry,
		yaw: 0,
		info: { solidTop: top },
	});
	if (isSlope(family)) {
		const [hl, hr] = slopeHeights[family];
		return solid('ground', slopeGeometry(family, variantOf(first)), -0.5 + (hl + hr) / 2);
	}
	switch (family) {
		case 'fill':
			return solid('fill', fillGeometry(variantOf(first)));
		case 'top':
			return solid('ground', topGeometry(variantOf(first)));
		case 'block':
			return solid('ground', blockGeometry());
		case 'plat':
			return { look: 'prop', geometry: platformGeometry(), yaw: 0, info: {} };
		case 'spike':
			return { look: 'prop', geometry: spikeGeometry(), yaw: 0, info: {} };
		case 'crystal':
			return {
				look: 'glow',
				geometry: crystalGeometry(),
				yaw: (tileHash(first.x, first.y, 5) - 0.5) * 0.9,
				info: {},
			};
		case 'chocTop':
			return { look: 'chocolate', geometry: chocolateTopGeometry(), yaw: 0, info: { pool: true } };
		case 'chocDeep':
			return { look: 'chocolate', geometry: chocolateDeepGeometry(), yaw: 0, info: { pool: true } };
	}
	return null;
}

export const terrainModels: ModelSet = {
	name: 'terrain',
	family: (spriteName) => families[spriteName] ?? null,
	fixed: (family) => family !== 'backdrop',
	root: batch.root,
	place(family, first) {
		const tile = batched(family, first);
		return tile ? batch.add(tile.look, tile.geometry, first.x, first.y, tile.yaw, tile.info) : null;
	},
	sync(frame) {
		chocolateTime.value = frame.time;
		batch.flush();
	},
	create(family, first) {
		if (family === 'backdrop') return backdropActor();
		if (family === 'door') return doorActor(first);
		if (family === 'exitBot' || family === 'exitTop') return exitActor(family, first);
		if (family === 'chocTop' || family === 'chocDeep') {
			const mesh = tileMesh(
				family === 'chocTop' ? chocolateTopGeometry() : chocolateDeepGeometry(),
				chocolateMaterial,
				{ cast: false, receive: false },
			);
			return tileActor(mesh, first, (time) => {
				chocolateTime.value = time;
			});
		}
		if (isSlope(family))
			return tileActor(
				tileMesh(slopeGeometry(family, variantOf(first)), groundMaterial, {
					cast: true,
					receive: true,
				}),
				first,
			);
		switch (family) {
			case 'fill':
				return tileActor(
					tileMesh(fillGeometry(variantOf(first)), groundMaterial, { cast: false, receive: true }),
					first,
				);
			case 'top':
				return tileActor(
					tileMesh(topGeometry(variantOf(first)), groundMaterial, { cast: true, receive: true }),
					first,
				);
			case 'block':
				return tileActor(
					tileMesh(blockGeometry(), groundMaterial, { cast: true, receive: true }),
					first,
				);
			case 'plat':
				return tileActor(
					tileMesh(platformGeometry(), propMaterial, { cast: true, receive: true }),
					first,
				);
			case 'spike':
				return tileActor(
					tileMesh(spikeGeometry(), propMaterial, { cast: true, receive: true }),
					first,
				);
			case 'crystal': {
				const mesh = tileMesh(crystalGeometry(), glowMaterial, { cast: true, receive: true }),
					actor = tileActor(mesh, first);
				mesh.rotation.y = (tileHash(first.x, first.y, 5) - 0.5) * 0.9;
				mesh.updateMatrix();
				return actor;
			}
		}
		throw new Error(`terrain has no model for the family ${family}`);
	},
};
