// The ground, slopes, ledges, hazards, door, exit, crystals and backdrop of the crater levels, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from '../../level-3d/types.ts';

export const terrainModels: ModelSet = {
	name: 'terrain',
	family: () => null,
	create() {
		throw new Error('terrain has no models yet');
	},
};
