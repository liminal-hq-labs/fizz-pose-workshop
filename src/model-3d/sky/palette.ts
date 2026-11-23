// The colours of the open-sky levels, taken from the game's 16-colour sprites and brightened for lit 3D surfaces.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export const palette = {
	/* Baked biscuit rock: the sprite's brown, in the golden and toasted shades of one baking. */
	biscuit: 0xc47a2e,
	biscuitDark: 0xa66020,
	biscuitLight: 0xdc9c4a,
	toasted: 0x8e4a14,
	shortbread: 0xeab65c,
	caramel: 0x7a3a10,
	crevice: 0x4a2208,
	/* The icing crust: the sprite's yellow, as butter icing with a paler gloss. */
	icingTop: 0xffeb78,
	icingFront: 0xf4c43a,
	icingDark: 0xd09a22,
	icingLight: 0xfff9c8,
	sugar: 0xffffff,
	sugarGold: 0xffd24a,
	sprinkleRed: 0xff5555,
	sprinkleCyan: 0x55ffff,
	sprinkleGreen: 0x55ff55,
	sprinkleBlue: 0x7878ff,
	/* Shortbread blocks, mortared with jam: the sprite's yellow slab in its dark red frame. */
	crumb: 0xf2c46a,
	crumbGold: 0xe8b552,
	crumbPale: 0xf8d27c,
	crumbDeep: 0xdca848,
	crumbEdge: 0xfff3c0,
	jam: 0x962c16,
	/* Clouds, and the ledge's cyan fringe. */
	cloud: 0xffffff,
	cloudShade: 0xd2e4f8,
	cloudBlue: 0xa6c6ea,
	cloudCyan: 0x6fe6ff,
	/* The hover pad: grey metal over a cyan glow, with red and yellow lamps. */
	metal: 0xb4b9c6,
	metalDark: 0x5a5e70,
	metalLight: 0xe6e9f2,
	lampRed: 0xff5555,
	lampYellow: 0xffee55,
	glow: 0x55ffff,
	/* The sky and what hangs in it. */
	zenith: 0x2f8fe8,
	skyMid: 0x6cbcf8,
	horizon: 0xc6e6fb,
	haze: 0xd2ebfc,
	sun: 0xfff6cc,
	sunGlow: 0xffe6a0,
} as const;
