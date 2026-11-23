// The crater's ground theme: plum stone, a grassy crust, candy-brick blocks and plank ledges, lit to sink into shadow.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { craterBlocks } from './bricks.ts';
import { craterGrass, craterStuds, craterTopDetails } from './dressing.ts';
import { planksTile } from './ledge.ts';
import {
	chocolateMaterial,
	glowMaterial,
	groundMaterial,
	propMaterial,
	unlitMaterial,
} from './materials.ts';
import { shade } from './mesher.ts';
import { palette } from './palette.ts';
import { stoneColour } from './stones.ts';
import type { GroundTheme } from './theme.ts';

export const craterTheme: GroundTheme = {
	name: 'crater',
	materials: {
		ground: groundMaterial,
		prop: propMaterial,
		glow: glowMaterial,
		chocolate: chocolateMaterial,
		unlit: unlitMaterial,
	},
	stoneColour,
	crevice: palette.crevice,
	crust: {
		top: palette.crustTop,
		front: palette.crustFront,
		dark: palette.crustDark,
		light: palette.crustLight,
	},
	cliffFace: palette.rockDark,
	crustColour: craterGrass,
	studs: craterStuds,
	dress: craterTopDetails,
	block: craterBlocks,
	ledge: (wx, wy) => planksTile(wx, wy),
	/* The pit sinks into darkness with depth, so a gap reads as a chasm cut into the ground. */
	chasmTone(colour, v, top) {
		const deep = Math.min(1, (top - v) / 5);
		return shade(colour, 0.62 * (1 - 0.8 * deep));
	},
	cliffTone: (colour) => shade(colour, 0.9),
};
