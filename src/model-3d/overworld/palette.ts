// The colours of the overworld: each region's ground, the path, the banks and the chocolate river, brightened from the map's 16-colour sprites.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The four regions the rivers cut the map into, named for their ground. */
export type Region = 'crater' | 'meadow' | 'candy' | 'frost';

export const regions: readonly Region[] = ['crater', 'meadow', 'candy', 'frost'];

/** A region's ground: its base, a lighter and a darker tone, and the flecks scattered over it. */
export interface Ground {
	base: number;
	light: number;
	dark: number;
	flecks: readonly number[];
}

export const grounds: Readonly<Record<Region, Ground>> = {
	crater: {
		base: 0x3fcc4e,
		light: 0x7cf06a,
		dark: 0x24a83c,
		flecks: [0x9cff7c, 0x6af0f0],
	},
	meadow: {
		base: 0xff8ef2,
		light: 0xffc8fa,
		dark: 0xe06ad8,
		flecks: [0xffffff, 0xa83aa8],
	},
	candy: {
		base: 0x22c9c9,
		light: 0x6ff2f2,
		dark: 0x14a2ac,
		flecks: [0xffffff, 0x9afcfc],
	},
	frost: {
		base: 0xf2f2ff,
		light: 0xffffff,
		dark: 0xd2d2f0,
		flecks: [0xff80ff, 0x6af0f0, 0xffee55],
	},
};

export const path = {
	base: 0xffe45a,
	light: 0xfff29a,
	dark: 0xe8c43c,
	speck: 0xc88a2a,
	kerb: 0xb8681e,
} as const;

/** The river bank, from the waterline up to the lip. */
export const bank = {
	low: 0x6e2f10,
	mid: 0x9c5218,
	lip: 0xd9a04a,
} as const;

/** The stone, wood and trim shared by the built things. */
export const trim = {
	wood: 0xb5651d,
	woodDark: 0x7a3f12,
	stone: 0x9a9aa8,
	stoneDark: 0x5a5a68,
	stoneLight: 0xc8c8d4,
	white: 0xffffff,
	cream: 0xfff2d8,
	red: 0xe0302c,
	redDark: 0xa01818,
	yellow: 0xffe94a,
	cyan: 0x55f0f0,
	cyanDark: 0x1fb5c0,
	pink: 0xff66ff,
	pinkDark: 0xb838c8,
	blue: 0x4a4cf0,
	blueDark: 0x1c1ca8,
	green: 0x4cf050,
	black: 0x14141c,
	chocolate: 0x5a2a10,
} as const;
