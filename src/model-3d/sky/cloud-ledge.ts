// The sky levels' one-way ledge: a flat-topped pillow of cloud filling the top 0.375 of its cell, with puffs round it and a cyan fringe hanging under.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { depth } from '../toon.ts';
import { lattice } from '../crater/hash.ts';
import { Mesher, mix, shade } from '../crater/mesher.ts';
import type { Surroundings } from '../crater/surroundings.ts';
import { lump, softened } from './lumps.ts';
import { palette } from './palette.ts';

/** Half the ledge's depth, the flat top's reach in Z and how far the rounded rim is let down from it. */
const reach = depth.shelf / 2;
const rimZ = 0.12;
/** The rounded rim at an open end of the ledge, in X. */
const rimX = 0.16;
/** The top of the cell, where Ben stands, and where the pillow's rim and underside are. */
const top = 0.5;
const rimY = 0.3;
const belly = 0.22;
/** The lowest a hanging puff reaches: the ledge fills the top 0.375 of its cell. */
const bottom = 0.125;
const nx = 10;
const nz = 6;

/** How far up a rounded rim stands, 0 at the edge and 1 from `margin` in: a quarter circle. */
function rise(distance: number, margin: number): number {
	if (distance >= margin) return 1;
	const t = 1 - Math.max(0, distance) / margin;
	return Math.sqrt(Math.max(0, 1 - t * t));
}

/**
 * The cloud ledge for the tile centred at (wx, wy). The top is flat at the top of the cell across the whole walking
 * strip; its rim rounds down at the front and back, and at the ends of a run of ledge. Where `around` says another ledge
 * joins, that end runs straight on into it. Puffs stand out of the front and back and hang from the belly, all inside the
 * cell's width, so the ledge fills the same span as the simulation's collision.
 */
export function cloudLedge(wx: number, wy: number, around: Surroundings): THREE.BufferGeometry {
	const m = new Mesher(),
		col = Math.floor(wx),
		row = Math.floor(wy),
		joinL = around.joinL === true,
		joinR = around.joinR === true,
		height = (x: number, z: number): number => {
			const dl = joinL ? Infinity : x + 0.5,
				dr = joinR ? Infinity : 0.5 - x,
				f = Math.min(rise(Math.min(dl, dr), rimX), rise(reach - Math.abs(z), rimZ));
			return rimY + (top - rimY) * f;
		},
		colourAt = (x: number, z: number): number => {
			const y = height(x, z),
				edge = 1 - (y - rimY) / (top - rimY),
				speck =
					0.97 + 0.03 * lattice(Math.round(x * 20) + col * 20, Math.round(z * 20) + row * 20, 401);
			return shade(mix(palette.cloud, palette.cloudShade, Math.min(1, edge * 1.2)), speck);
		},
		xAt = (i: number): number => -0.5 + i / nx,
		zAt = (j: number): number => -reach + (j * 2 * reach) / nz;
	/* The top: a grid that is level where Ben walks and rolls off at the rim. */
	for (let i = 0; i < nx; i++)
		for (let j = 0; j < nz; j++) {
			const [x0, x1, z0, z1] = [xAt(i), xAt(i + 1), zAt(j), zAt(j + 1)];
			m.quadC(
				[x0, height(x0, z1), z1],
				[x1, height(x1, z1), z1],
				[x1, height(x1, z0), z0],
				[x0, height(x0, z0), z0],
				colourAt(x0, z1),
				colourAt(x1, z1),
				colourAt(x1, z0),
				colourAt(x0, z0),
			);
		}
	/* The belly: shaded, going to cyan, under a short skirt round the rim. */
	const skirt = shade(palette.cloudShade, 0.94),
		under = mix(palette.cloudBlue, palette.cloudCyan, 0.35);
	m.quad([-0.5, rimY, reach], [0.5, rimY, reach], [0.5, belly, reach], [-0.5, belly, reach], skirt);
	m.quad(
		[0.5, rimY, -reach],
		[-0.5, rimY, -reach],
		[-0.5, belly, -reach],
		[0.5, belly, -reach],
		skirt,
	);
	if (!joinL)
		m.quad(
			[-0.5, rimY, -reach],
			[-0.5, rimY, reach],
			[-0.5, belly, reach],
			[-0.5, belly, -reach],
			skirt,
		);
	if (!joinR)
		m.quad(
			[0.5, rimY, reach],
			[0.5, rimY, -reach],
			[0.5, belly, -reach],
			[0.5, belly, reach],
			skirt,
		);
	m.quad(
		[-0.5, belly, -reach],
		[0.5, belly, -reach],
		[0.5, belly, reach],
		[-0.5, belly, reach],
		under,
	);
	/* Puffs on the front and back, standing out of the skirt and under the top. */
	const puffColour = (h: number, up: number): number =>
		shade(mix(palette.cloudShade, palette.cloud, Math.min(1, h * 0.7 + up * 0.3 + 0.2)), 0.99);
	const front = 3,
		back = 2;
	for (let k = 0; k < front + back; k++) {
		const isFront = k < front,
			n = isFront ? front : back,
			slot = isFront ? k : k - front,
			rx = 0.13 + 0.06 * lattice(col, row, 410 + k),
			cx0 = -0.5 + (0.5 + slot) / n,
			cx = Math.max(-0.5 + rx, Math.min(0.5 - rx, cx0 + (lattice(col, row, 420 + k) - 0.5) * 0.12)),
			ry = 0.1 + 0.03 * lattice(col, row, 430 + k),
			cy = Math.min(top - 0.025 - ry, 0.32 + 0.05 * lattice(col, row, 440 + k)),
			rz = 0.09,
			cz = (isFront ? 1 : -1) * (reach - rz + 0.02);
		lump(m, [cx, cy, cz], [rx, ry, rz], puffColour);
	}
	/* Rounded puffs cap the ends of a run of ledge, so it does not stop in a flat wall. */
	for (const [open, side] of [
		[!joinL, -1],
		[!joinR, 1],
	] as const)
		if (open) lump(m, [side * 0.385, 0.33, 0], [0.115, 0.1, 0.22], puffColour);
	/* The fringe: puffs hanging from the belly, cyan at their feet, like the sprite's wavy underside. */
	const hang = 3,
		fringe = (h: number): number =>
			mix(palette.cloudCyan, mix(palette.cloudBlue, palette.cloudShade, 0.6), Math.min(1, h * 1.8));
	for (let k = 0; k < hang; k++) {
		const rx = 0.16 + 0.06 * lattice(col, row, 450 + k),
			cx0 = -0.5 + (0.5 + k) / hang,
			cx = Math.max(-0.5 + rx, Math.min(0.5 - rx, cx0 + (lattice(col, row, 460 + k) - 0.5) * 0.1)),
			ry = belly - bottom,
			cz = (lattice(col, row, 470 + k) - 0.5) * 0.24;
		lump(m, [cx, belly, cz], [rx, ry, 0.2 + 0.06 * lattice(col, row, 480 + k)], fringe, {
			capTop: 0.5,
		});
	}
	return softened(m.build());
}
