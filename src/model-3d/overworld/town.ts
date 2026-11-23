// The town of Crater Corners: two cottages in red and blue and the bakery, as tall little buildings with glowing windows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { shade, type Mesher } from '../crater/mesher.ts';
import { built } from './actors.ts';
import { lathe, slab } from './shapes.ts';
import { trim } from './palette.ts';

/** A window and its cross-bars, facing south at height `z`. */
function window_(m: Mesher, x: number, y: number, z: number, w: number, h: number): void {
	slab(
		m,
		[x - w - 0.04, y - 0.01, z - 0.04],
		[x + w + 0.04, y + 0.03, z + h + 0.04],
		trim.white,
		1,
	);
}

function windowGlow(
	m: Mesher,
	x: number,
	y: number,
	z: number,
	w: number,
	h: number,
	colour: number = trim.cyan,
): void {
	slab(
		m,
		[x - w, y - 0.03, z],
		[x + w, y - 0.0, z + h],
		{ top: colour, front: colour, side: colour },
		1,
	);
	slab(m, [x - 0.012, y - 0.04, z], [x + 0.012, y - 0.01, z + h], trim.white, 1);
	slab(
		m,
		[x - w, y - 0.04, z + h / 2 - 0.012],
		[x + w, y - 0.01, z + h / 2 + 0.012],
		trim.white,
		1,
	);
}

function cottage(
	roof: number,
	roofTrim: number,
): { solid: (m: Mesher) => void; glow: (m: Mesher) => void } {
	return {
		solid(m) {
			slab(
				m,
				[-0.62, -0.52, 0],
				[0.62, 0.52, 1.75],
				{ top: trim.cream, front: trim.white, side: 0xf0e4d0 },
				0.78,
			);
			slab(m, [-0.7, -0.6, 1.62], [0.7, 0.6, 1.78], roofTrim, 1);
			m.pyramid(
				[
					[-0.82, -0.72, 1.76],
					[0.82, -0.72, 1.76],
					[0.82, 0.72, 1.76],
					[-0.82, 0.72, 1.76],
				],
				[0, 0, 3.35],
				[shade(roof, 0.92), shade(roof, 0.8), shade(roof, 1.1), shade(roof, 1)],
			);
			slab(
				m,
				[0.3, 0.1, 2.0],
				[0.58, 0.4, 3.05],
				{ top: trim.stoneDark, front: trim.stone, side: trim.stoneDark },
				1,
			);
			slab(m, [0.26, 0.06, 3.0], [0.62, 0.44, 3.12], trim.stoneDark, 1);
			slab(m, [-0.22, -0.58, 0], [0.22, -0.5, 1.2], trim.wood, 1);
			slab(m, [-0.3, -0.7, 0], [0.3, -0.5, 0.1], trim.stone, 1);
			window_(m, -0.42, -0.52, 0.85, 0.12, 0.3);
			window_(m, 0.42, -0.52, 0.85, 0.12, 0.3);
			slab(m, [-0.04, -0.6, 0.55], [0.04, -0.52, 0.65], trim.yellow, 1);
		},
		glow(m) {
			windowGlow(m, -0.42, -0.52, 0.89, 0.12, 0.3);
			windowGlow(m, 0.42, -0.52, 0.89, 0.12, 0.3);
		},
	};
}

const cottages = { houseA: cottage(0xff5a5a, 0xa01818), houseB: cottage(0x5a64ff, 0x1c1ca8) };

function bakery(): { solid: (m: Mesher) => void; glow: (m: Mesher) => void } {
	return {
		solid(m) {
			slab(
				m,
				[-0.74, -0.55, 0],
				[0.74, 0.55, 1.7],
				{ top: trim.yellow, front: 0xfff06a, side: 0xe8c43c },
				0.78,
			);
			slab(
				m,
				[-0.7, -0.5, 1.7],
				[0.7, 0.5, 2.0],
				{ top: trim.cream, front: trim.white, side: trim.cream },
				1,
			);
			slab(
				m,
				[-0.6, -0.42, 2.0],
				[0.6, 0.42, 2.9],
				{ top: 0xc87430, front: 0xb8681e, side: 0xa05414 },
				0.9,
			);
			slab(
				m,
				[-0.66, -0.48, 2.9],
				[0.66, 0.48, 3.02],
				{ top: trim.white, front: trim.white, side: trim.cream },
				1,
			);
			/* A striped awning over the door and the windows. */
			for (let i = 0; i < 8; i++) {
				const x0 = -0.78 + i * 0.195;
				slab(m, [x0, -0.9, 1.2], [x0 + 0.195, -0.5, 1.46], i % 2 ? trim.white : trim.red, 1);
			}
			slab(m, [-0.2, -0.58, 0], [0.2, -0.5, 1.1], trim.wood, 1);
			slab(m, [-0.9, -0.82, 0.8], [0.9, -0.78, 0.86], trim.woodDark, 1);
			/* A little stack of loaves and a cake on the counter. */
			for (let i = 0; i < 3; i++)
				lathe(
					m,
					[
						{ r: 0.1, z: 0.86, colour: 0xd89048 },
						{ r: 0.08, z: 0.98, colour: 0xe8a860 },
						{ r: 0.03, z: 1.02, colour: 0xe8a860 },
					],
					{ sides: 6, cx: -0.55 + i * 0.22, cy: -0.8 },
				);
			window_(m, -0.5, -0.55, 0.62, 0.14, 0.3);
			window_(m, 0.5, -0.55, 0.62, 0.14, 0.3);
		},
		glow(m) {
			windowGlow(m, -0.5, -0.55, 0.66, 0.14, 0.3, 0xffd070);
			windowGlow(m, 0.5, -0.55, 0.66, 0.14, 0.3, 0xffd070);
			slab(
				m,
				[-0.46, -0.5, 2.28],
				[-0.14, -0.44, 2.56],
				{ top: trim.yellow, front: trim.yellow, side: trim.yellow },
				1,
			);
			slab(
				m,
				[0.14, -0.5, 2.28],
				[0.46, -0.44, 2.56],
				{ top: trim.yellow, front: trim.yellow, side: trim.yellow },
				1,
			);
		},
	};
}

const designs = { ...cottages, shop: bakery() };

export type TownDesign = keyof typeof designs;

/** The geometry of one of the town's buildings, with its windows, facing south. */
export function townModel(design: TownDesign): THREE.BufferGeometry {
	return built(`town-${design}`, (m) => {
		designs[design].solid(m);
		designs[design].glow(m);
	});
}
