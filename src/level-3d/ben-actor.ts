// The cartoon Ben as the level's player: his sprite frames from the sim drive the 3D model's poses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ModelSet } from './types.ts';

export const benModels: ModelSet = {
	name: 'ben',
	family: () => null,
	create() {
		throw new Error('ben has no model yet');
	},
};
