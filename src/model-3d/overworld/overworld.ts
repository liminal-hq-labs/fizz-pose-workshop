// The overworld map's ground, rivers, scenery, buildings and level landmarks, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from '../../level-3d/types.ts';

export const overworldModels: ModelSet = {
	name: 'overworld',
	family: () => null,
	create() {
		throw new Error('overworld has no models yet');
	},
};
