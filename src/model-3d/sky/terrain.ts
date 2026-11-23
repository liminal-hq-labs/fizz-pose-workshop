// The ground, cloud ledges, hover platforms and daylight backdrop of the open-sky levels, as 3D models for the level stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from '../../level-3d/types.ts';

export const skyModels: ModelSet = {
	name: 'sky',
	family: () => null,
	create() {
		throw new Error('sky has no models yet');
	},
};
