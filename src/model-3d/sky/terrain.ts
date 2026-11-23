// The ground, cloud ledges, hover platforms and clouds of the open-sky levels, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, ModelSet, SpriteDraw } from '../../level-3d/types.ts';
import { TileBatch } from '../crater/batch.ts';
import { propMaterial } from '../crater/materials.ts';
import { Mesher } from '../crater/mesher.ts';
import { batchedGround, groundActor, isGround } from '../crater/tiles.ts';
import { isOpenSky } from './backdrop.ts';
import { skyTheme } from './biscuit.ts';
import { hoverActor } from './hover.ts';
import { lump, softened } from './lumps.ts';

/** Sprite names the simulation draws for the open-sky levels, and the model family each belongs to. */
const families: Readonly<Record<string, string>> = {
	skyFill: 'fill',
	skyTop: 'top',
	skyBlock: 'block',
	skyR45: 'R45',
	skyL45: 'L45',
	skyR22A: 'R22A',
	skyR22B: 'R22B',
	skyL22A: 'L22A',
	skyL22B: 'L22B',
	skyPlat: 'plat',
	hover0: 'hover',
	hover1: 'hover',
	cloud: 'cloud',
};

const batch = new TileBatch(skyTheme);

/**
 * A cloud sprite the simulation draws. In an open-sky level the daylight backdrop draws its own clouds, so this one is
 * left empty; in any other level it is a single soft puff standing behind the lane where the sprite is.
 */
function cloudActor(): Actor {
	const group = new THREE.Group();
	let puff: THREE.Mesh | null = null;
	return {
		object: group,
		update(draw, frame) {
			if (isOpenSky(frame.level)) return;
			if (!puff) {
				puff = new THREE.Mesh(puffGeometry(), propMaterial);
				group.add(puff);
			}
			group.position.set(draw.x, draw.y, -6);
			group.scale.setScalar(Math.max(0.2, draw.w / 3));
		},
	};
}

let puffShape: THREE.BufferGeometry | null = null;

/** A flat-based cartoon cloud three tiles long, the size of the sprite. */
function puffGeometry(): THREE.BufferGeometry {
	if (!puffShape) {
		const m = new Mesher(),
			paint = (h: number, up: number): number => (up > 0.2 || h > 0.5 ? 0xffffff : 0xd6e6f8);
		lump(m, [-0.9, 0.1, 0], [0.8, 0.5, 0.5], paint, { flat: 0.3 });
		lump(m, [0.2, 0.25, 0], [1.1, 0.7, 0.6], paint, { flat: 0.3 });
		lump(m, [1.1, 0.1, 0], [0.7, 0.45, 0.5], paint, { flat: 0.3 });
		puffShape = softened(m.build());
	}
	return puffShape;
}

export const skyModels: ModelSet = {
	name: 'sky',
	family: (spriteName) => families[spriteName] ?? null,
	fixed: (family) => isGround(family),
	root: batch.root,
	place(family, first) {
		const tile = batchedGround(family, first, skyTheme);
		return tile ? batch.add(tile.look, tile.geometry, first.x, first.y, tile.yaw, tile.info) : null;
	},
	sync() {
		batch.flush();
	},
	create(family, first: SpriteDraw) {
		if (family === 'hover') return hoverActor(first);
		if (family === 'cloud') return cloudActor();
		const ground = groundActor(family, first, skyTheme);
		if (ground) return ground;
		throw new Error(`sky has no model for the family ${family}`);
	},
};
