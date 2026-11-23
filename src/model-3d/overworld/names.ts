// Which model family each sprite the overworld draws belongs to, and which families stand still.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Region } from './palette.ts';

/** Ground sprites by name: the region they belong to, and which of the three looks. */
export const groundSprites: Readonly<Record<string, { region: Region; look: number }>> = {
	owGrass: { region: 'crater', look: 0 },
	owGrassB: { region: 'crater', look: 1 },
	owGrassC: { region: 'crater', look: 2 },
	owGrassMeadow: { region: 'meadow', look: 0 },
	owGrassMeadowB: { region: 'meadow', look: 1 },
	owGrassMeadowC: { region: 'meadow', look: 2 },
	owGrassCandy: { region: 'candy', look: 0 },
	owGrassCandyB: { region: 'candy', look: 1 },
	owGrassCandyC: { region: 'candy', look: 2 },
	owGrassFrost: { region: 'frost', look: 0 },
	owGrassFrostB: { region: 'frost', look: 1 },
	owGrassFrostC: { region: 'frost', look: 2 },
};

/** The landmark sprites and the level each stands for. */
export const landmarkSprites: Readonly<Record<string, string>> = {
	owLmCrater: 'Crater',
	owLmMesa: 'Mesa',
	owLmLookout: 'Lookout',
	owLmMeadows: 'Meadows',
	owLmPlayhouse: 'Playhouse',
	owLmFudgeBog: 'FudgeBog',
	owLmCaves: 'Caves',
	owLmShafts: 'Shafts',
	owLmHollow: 'Hollow',
	owLmSugarGlass: 'SugarGlass',
	owLmFlats: 'Flats',
	owLmSpire: 'Spire',
	owLmFoundry: 'Foundry',
	owLmGumdrop: 'Gumdrop',
	owCastle: 'Castle',
};

/** The model family of every sprite the overworld draws. Ben on the map and any sprite not listed here are not ours. */
const families: Record<string, string> = {
	owPath: 'path',
	owRiver0: 'river',
	owRiver1: 'river',
	owBank: 'bank',
	owLipH: 'lip',
	owLipV: 'lip',
	owDecal0: 'decal',
	owDecal1: 'decal',
	owDecal2: 'decal',
	owDecal3: 'decal',
	owGlint: 'glint',
	owShadowS: 'shadow',
	owShadowL: 'shadow',
	owTree0: 'tree',
	owTree1: 'tree',
	owCandy0: 'candyTree',
	owCandy1: 'candyTree',
	owPuff0: 'puffTree',
	owPuff1: 'puffTree',
	owFrost0: 'frostTree',
	owFrost1: 'frostTree',
	owRock: 'rock',
	owCandyRock: 'candyRock',
	owPuffRock: 'puffRock',
	owCake: 'cake',
	owHouseA: 'houseA',
	owHouseB: 'houseB',
	owShop: 'shop',
	owFountain: 'fountain',
	owSign: 'sign',
	owTele0: 'tele',
	owTele1: 'tele',
	owFlagHolder: 'pole',
	owFlag: 'flag',
	saucer: 'saucer',
};
for (const name of Object.keys(groundSprites))
	families[name] = `grass-${groundSprites[name].region}`;
for (const [name, level] of Object.entries(landmarkSprites)) families[name] = `lm-${level}`;

export function familyOf(spriteName: string): string | null {
	return families[spriteName] ?? null;
}

/** Families that never move: the ground, its trims, scenery, buildings and landmarks, which the set draws in batches. */
const fixedFamilies = new Set<string>([
	'grass-crater',
	'grass-meadow',
	'grass-candy',
	'grass-frost',
	'path',
	'river',
	'bank',
	'lip',
	'decal',
	'glint',
	'shadow',
	'tree',
	'candyTree',
	'puffTree',
	'frostTree',
	'rock',
	'candyRock',
	'puffRock',
	'cake',
	'houseA',
	'houseB',
	'shop',
	'sign',
	'pole',
	'fountain',
	'saucer',
]);

export function isFixed(family: string): boolean {
	return fixedFamilies.has(family) || family.startsWith('lm-');
}

/** The scenery families, which stand on a tile and are merged into the chunk meshes. */
export const sceneryFamilies: ReadonlySet<string> = new Set([
	'tree',
	'candyTree',
	'puffTree',
	'frostTree',
	'rock',
	'candyRock',
	'puffRock',
	'cake',
]);

/** Families whose tile is only a trim of the ground the set works out for itself, so they draw nothing of their own. */
export const trimFamilies: ReadonlySet<string> = new Set(['bank', 'lip', 'shadow']);
