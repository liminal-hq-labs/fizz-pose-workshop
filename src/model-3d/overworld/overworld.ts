// The overworld map's ground, rivers, scenery, buildings and level landmarks, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Actor, ModelSet, Placed, SpriteDraw } from '../../level-3d/types.ts';
import { lattice } from '../crater/hash.ts';
import { tileCentre, type Extra } from './actors.ts';
import { OverworldBatch } from './batch.ts';
import {
	flagActor,
	fountainExtra,
	fountainModel,
	poleModel,
	poleSpot,
	saucerExtra,
	saucerModel,
	signModel,
	teleActor,
} from './features.ts';
import {
	firstAreaLandmarks,
	landmarkExtra,
	landmarkModel,
	type LandmarkModel,
} from './landmarks.ts';
import { moreLandmarks } from './landmarks-more.ts';
import { familyOf, groundSprites, isFixed, sceneryFamilies, trimFamilies } from './names.ts';
import { kinds } from './terrain.ts';
import { townModel, type TownDesign } from './town.ts';

/** Makes the actor of a family that is not batched: the pads, whose power the sim changes, and the flags, which fly. */
export type ActorFactory = (first: SpriteDraw, batch: OverworldBatch) => Actor;

const batch = new OverworldBatch();

const factories = new Map<string, ActorFactory>([
	['tele', teleActor],
	['flag', flagActor],
]);

const landmarks: Readonly<Record<string, LandmarkModel>> = {
	...firstAreaLandmarks,
	...moreLandmarks,
};

const noop: Placed = { remove() {} };

/** The moving parts of batched models, which the set updates each frame. */
const extras = new Set<Extra>();

/** Puts a model in the batch with a moving part beside it, and gives back one handle for both. */
function standWith(
	placed: Placed,
	extra: Extra | null,
	at: { x: number; y: number; z: number },
): Placed {
	if (!extra) return placed;
	extra.object.position.set(at.x, at.y, at.z);
	batch.root.add(extra.object);
	extras.add(extra);
	return {
		remove() {
			placed.remove();
			extras.delete(extra);
			batch.root.remove(extra.object);
			extra.dispose();
		},
	};
}

function placeBuilding(family: string, first: SpriteDraw): Placed {
	const at = tileCentre(first),
		yaw = (lattice(Math.round(at.x), Math.round(at.y), 73) - 0.5) * 0.06;
	return batch.placeModel(townModel(family as TownDesign), at, { reach: 1.1, sink: 0.05, yaw });
}

function placeFeature(family: string, first: SpriteDraw): Placed | null {
	const x = first.x,
		y = first.y;
	switch (family) {
		case 'houseA':
		case 'houseB':
		case 'shop':
			return placeBuilding(family, first);
		case 'sign':
			return batch.placeModel(signModel(), first, {
				reach: 0.5,
				sink: 0.03,
				yaw: (lattice(Math.round(x), Math.round(y), 72) - 0.5) * 0.3,
			});
		case 'pole':
			return batch.placeModel(poleModel(), poleSpot(first, batch), {
				reach: 0.5,
				sink: 0.02,
				claims: false,
			});
		case 'fountain': {
			const at = tileCentre(first);
			return standWith(
				batch.placeModel(fountainModel(), at, { reach: 1.2, sink: 0.03 }),
				fountainExtra(),
				{ x: at.x, y: at.y, z: batch.groundUnder(at.x, at.y, 1.2) - 0.03 },
			);
		}
		case 'saucer':
			return standWith(
				batch.placeModel(saucerModel(), first, { reach: 1.7, sink: 0.02, yaw: 0.25 }),
				saucerExtra(),
				{ x, y, z: batch.groundUnder(x, y, 1.7) - 0.02 },
			);
	}
	if (family.startsWith('lm-')) {
		const name = family.slice(3),
			model = landmarks[name],
			big = name === 'Castle',
			at = { x, y: y + (model.shift ?? (big ? 0.5 : 0.6)) };
		return standWith(
			batch.placeModel(landmarkModel(name, model), at, { reach: model.reach, sink: 0.1 }),
			landmarkExtra(name, model),
			{ x: at.x, y: at.y, z: batch.groundUnder(at.x, at.y, model.reach) - 0.1 },
		);
	}
	return null;
}

export const overworldModels: ModelSet = {
	name: 'overworld',
	family(spriteName) {
		const family = familyOf(spriteName);
		return family !== null && (isFixed(family) || factories.has(family)) ? family : null;
	},
	fixed: (family) => isFixed(family),
	root: batch.root,
	place(family, first) {
		if (family.startsWith('grass-'))
			return batch.placeTile(kinds.grass, first, groundSprites[first.name].region);
		if (family === 'path') return batch.placeTile(kinds.path, first);
		if (family === 'river') return batch.placeTile(kinds.river, first);
		if (family === 'decal') return batch.placeDecal(first.name, first);
		if (family === 'glint') return batch.placeGlint(first);
		if (trimFamilies.has(family)) return noop;
		if (sceneryFamilies.has(family)) return batch.placeScenery(family, first.name, first);
		return placeFeature(family, first);
	},
	sync(frame) {
		batch.setTime(frame.time);
		batch.flush();
		for (const extra of extras) extra.update(frame);
	},
	create(family, first) {
		const factory = factories.get(family);
		if (!factory) throw new Error(`the overworld has no model for the family ${family}`);
		return factory(first, batch);
	},
};

/** The batch the set draws into, for tests. */
export const overworldBatch = batch;
