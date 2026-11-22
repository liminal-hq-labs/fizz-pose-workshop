// The Zarg creatures of Episode 1, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from '../../level-3d/types.ts';

export const enemyModels: ModelSet = {
	name: 'enemies',
	family: () => null,
	create() {
		throw new Error('enemies has no models yet');
	},
};
