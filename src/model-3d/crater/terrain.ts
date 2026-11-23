// The ground, slopes, ledges, hazards, door, exit, crystals and backdrop of the crater levels, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, ModelSet, SpriteDraw } from '../../level-3d/types.ts';
import { backdropActor } from './backdrop.ts';
import { TileBatch } from './batch.ts';
import { craterTheme } from './crater-theme.ts';
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
import { batchedGround, groundActor, pin, tileActor, tileMesh, type BatchedTile } from './tiles.ts';
import { glowGeometry, glowMaterial as haloMaterial } from '../snacks/shared.ts';
import { tileHash } from './hash.ts';
import {
	chocolateMaterial,
	chocolateTime,
	glowMaterial,
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

/** How long the door takes to give way, in seconds, and how much of that it spends shaking before it drops. */
const doorExit = 0.7,
	doorShake = 0.22;

function doorActor(first: SpriteDraw): Actor {
	/* `first` is a pooled record the reader refills every frame: keep what the door needs from it now. */
	const x = first.x,
		y = first.y,
		group = new THREE.Group(),
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
				x + (elapsed < doorShake ? Math.sin(elapsed * 90) * 0.04 * (1 - shake * 0.3) : 0),
				y - drop * drop * 2.2,
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

/** The widest a crystal cluster turns about its own axis, in radians: small, so it stays inside its cell. */
const crystalYaw = 0.24;

const batch = new TileBatch(craterTheme);

/** How a family's tiles are drawn in the batch, for the families that go in it. */
function batched(family: string, first: SpriteDraw): BatchedTile | null {
	const ground = batchedGround(family, first, craterTheme);
	if (ground) return ground;
	/* The draw is a pooled record that is refilled later: copy the position now. */
	const x = first.x,
		y = first.y;
	switch (family) {
		case 'spike':
			return { look: 'prop', geometry: spikeGeometry(), yaw: 0, info: {} };
		case 'crystal':
			return {
				look: 'glow',
				geometry: crystalGeometry(),
				yaw: (tileHash(x, y, 5) - 0.5) * crystalYaw,
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
		const ground = groundActor(family, first, craterTheme);
		if (ground) return ground;
		switch (family) {
			case 'spike':
				return tileActor(
					tileMesh(spikeGeometry(), propMaterial, { cast: true, receive: true }),
					first,
				);
			case 'crystal': {
				const mesh = tileMesh(crystalGeometry(), glowMaterial, { cast: true, receive: true }),
					actor = tileActor(mesh, first);
				mesh.rotation.y = (tileHash(first.x, first.y, 5) - 0.5) * crystalYaw;
				mesh.updateMatrix();
				return actor;
			}
		}
		throw new Error(`terrain has no model for the family ${family}`);
	},
};
