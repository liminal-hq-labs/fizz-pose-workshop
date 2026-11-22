// Snacks, soda, keys and the effects the sim draws as sprites, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from '../../level-3d/types.ts';

export const itemModels: ModelSet = {
	name: 'items',
	family: () => null,
	create() {
		throw new Error('items has no models yet');
	},
};
