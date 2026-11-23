// The cartoon Ben walking the overworld map, driven by the sim's top-down hero sprite.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from './types.ts';

export const benMapModels: ModelSet = {
	name: 'ben on the map',
	family: () => null,
	create() {
		throw new Error('ben on the map has no model yet');
	},
};
