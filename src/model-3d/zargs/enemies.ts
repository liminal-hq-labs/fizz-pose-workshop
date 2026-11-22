// The Zarg creatures of Episode 1, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Actor, ModelSet, SpriteDraw } from '../../level-3d/types.ts';
import { createDrone } from './drone.ts';
import { createGloop } from './gloop.ts';
import { createHopper } from './hopper.ts';
import { createMarsh } from './marsh.ts';
import { createPod } from './pod.ts';
import { createSpore } from './spore.ts';
import { createZshot } from './zshot.ts';

/** Each creature's sprite frames and the function that builds its actor. */
const creatures: readonly {
	family: string;
	sprites: readonly string[];
	make: (first: SpriteDraw) => Actor;
}[] = [
	{ family: 'gloop', sprites: ['gloop0', 'gloop1'], make: createGloop },
	{ family: 'hopper', sprites: ['hopper0', 'hopper1'], make: createHopper },
	{ family: 'marsh', sprites: ['marsh0', 'marsh1'], make: createMarsh },
	{ family: 'pod', sprites: ['pod0', 'pod1'], make: createPod },
	{ family: 'spore', sprites: ['spore0', 'spore1'], make: createSpore },
	{ family: 'drone', sprites: ['drone0', 'drone1'], make: createDrone },
	{ family: 'zshot', sprites: ['zshot'], make: createZshot },
];

const familyOf = new Map<string, string>(),
	makers = new Map<string, (first: SpriteDraw) => Actor>();
for (const creature of creatures) {
	makers.set(creature.family, creature.make);
	for (const sprite of creature.sprites) familyOf.set(sprite, creature.family);
}

export const enemyModels: ModelSet = {
	name: 'enemies',
	family: (spriteName) => familyOf.get(spriteName) ?? null,
	create(family, first) {
		const make = makers.get(family);
		if (!make) throw new Error(`enemies has no model for ${family}`);
		return make(first);
	},
};
