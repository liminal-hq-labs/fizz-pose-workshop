// Every model set the level stage draws with, in the order they claim sprites.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { terrainModels } from '../model-3d/crater/terrain.ts';
import { overworldModels } from '../model-3d/overworld/overworld.ts';
import { skyModels } from '../model-3d/sky/terrain.ts';
import { itemModels } from '../model-3d/snacks/items.ts';
import { enemyModels } from '../model-3d/zargs/enemies.ts';
import { benModels } from './ben-actor.ts';
import { benMapModels } from './ben-map-actor.ts';
import type { ModelSet } from './types.ts';

export const modelSets: readonly ModelSet[] = [
	benModels,
	benMapModels,
	enemyModels,
	itemModels,
	terrainModels,
	skyModels,
	overworldModels,
];
