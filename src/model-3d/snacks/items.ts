// Snacks, soda, keys and the effects the sim draws as sprites, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Actor, ModelSet, SpriteDraw } from '../../level-3d/types.ts';
import { createBubble } from './bubble.ts';
import { createCheezie } from './cheezie.ts';
import { createChoc } from './choc.ts';
import { createCookie } from './cookie.ts';
import { createGumdrop, gumColours } from './gumdrop.ts';
import { createPuff } from './puff.ts';
import { createSoda } from './soda.ts';
import { createDizzyStars, createNightStar } from './stars.ts';

/** Each family's sprite frames and the function that builds its actor. */
const families: readonly {
	family: string;
	sprites: readonly string[];
	make: (first: SpriteDraw) => Actor;
}[] = [
	{ family: 'cheezie', sprites: ['cheezie'], make: createCheezie },
	{ family: 'choc', sprites: ['choc'], make: createChoc },
	{ family: 'cookie', sprites: ['cookie'], make: createCookie },
	{ family: 'soda', sprites: ['soda'], make: createSoda },
	{ family: 'keyRed', sprites: ['keyRed'], make: (first) => createGumdrop(first, gumColours.red) },
	{
		family: 'keyBlue',
		sprites: ['keyBlue'],
		make: (first) => createGumdrop(first, gumColours.blue),
	},
	{
		family: 'keyGreen',
		sprites: ['keyGreen'],
		make: (first) => createGumdrop(first, gumColours.green),
	},
	{ family: 'bubble', sprites: ['bubble'], make: createBubble },
	{ family: 'puff', sprites: ['puff'], make: createPuff },
	{ family: 'stars', sprites: ['stars0', 'stars1'], make: createDizzyStars },
	{ family: 'star', sprites: ['star'], make: createNightStar },
];

const familyOf = new Map<string, string>(),
	makers = new Map<string, (first: SpriteDraw) => Actor>();
for (const entry of families) {
	makers.set(entry.family, entry.make);
	for (const sprite of entry.sprites) familyOf.set(sprite, entry.family);
}

export const itemModels: ModelSet = {
	name: 'items',
	family: (spriteName) => familyOf.get(spriteName) ?? null,
	create(family, first) {
		const make = makers.get(family);
		if (!make) throw new Error(`items has no model for ${family}`);
		return make(first);
	},
};
