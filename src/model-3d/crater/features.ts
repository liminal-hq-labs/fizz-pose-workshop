// Geometry for the crater level's features: spikes, molten chocolate, the cookie door, the exit and crystals.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { Mesher, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';
import { rng } from './hash.ts';
import { depth } from '../toon.ts';

const half = depth.lane / 2;
const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
	let geometry = cache.get(key);
	if (!geometry) cache.set(key, (geometry = make()));
	return geometry;
}

/** Gives a geometry an `aLocal` attribute: its vertices' positions in the tile, which merging into a chunk would otherwise lose. */
function withLocal(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
	const position = geometry.getAttribute('position');
	geometry.setAttribute(
		'aLocal',
		new THREE.Float32BufferAttribute(Float32Array.from(position.array), 3),
	);
	return geometry;
}

/**
 * A row of small sharp spikes, as drawn: four across the tile, each a quarter tile wide at its foot and half a tile tall,
 * standing on the bottom of the cell with no plate under them. They run three deep across the lane, and each is rust on its
 * lit side and red on the other, like the sprite.
 */
export function spikeGeometry(): THREE.BufferGeometry {
	return cached('spike', () => {
		const m = new Mesher(),
			r = 0.118,
			base = -0.5,
			rise = 0.5;
		for (const z of [-0.5, 0, 0.5])
			for (let i = 0; i < 4; i++) {
				const x = -0.375 + i * 0.25,
					tip = rise;
				m.pyramid(
					[
						[x - r, base, z + r],
						[x + r, base, z + r],
						[x + r, base, z - r],
						[x - r, base, z - r],
					],
					[x, base + tip, z],
					[
						palette.spikeBase,
						palette.spikeRed,
						shade(palette.spikeRed, 0.7),
						shade(palette.spikeBase, 1.25),
					],
				);
				/* A bright edge on the point, so the sharp end catches the eye. */
				const t = base + tip * 0.72,
					k = 0.28 * r;
				m.pyramid(
					[
						[x - k, t, z + k],
						[x + k, t, z + k],
						[x + k, t, z - k],
						[x - k, t, z - k],
					],
					[x, base + tip, z],
					[
						palette.spikeLight,
						shade(palette.spikeLight, 0.85),
						shade(palette.spikeLight, 0.8),
						palette.spikeLight,
					],
				);
			}
		return m.build();
	});
}

/**
 * The top of a chocolate pool: a deep slab whose upper face is a fine grid, so the wave in the chocolate shader has
 * vertices to move. Only the front and top are built; the neighbouring ground hides the rest.
 */
export function chocolateTopGeometry(): THREE.BufferGeometry {
	return cached('chocTop', () => {
		const m = new Mesher(),
			nx = 8,
			nz = 8,
			x = (i: number): number => -0.5 + i / nx,
			z = (j: number): number => half - (j * 2 * half) / nz;
		for (let i = 0; i < nx; i++) {
			m.quad(
				[x(i), -0.5, half],
				[x(i + 1), -0.5, half],
				[x(i + 1), 0.5, half],
				[x(i), 0.5, half],
				palette.chocolate,
			);
			for (let j = 0; j < nz; j++)
				m.quad(
					[x(i), 0.5, z(j)],
					[x(i + 1), 0.5, z(j)],
					[x(i + 1), 0.5, z(j + 1)],
					[x(i), 0.5, z(j + 1)],
					palette.chocolateTop,
				);
		}
		return withLocal(m.build());
	});
}

/** The body of a chocolate pool: one front face; the shader draws the streaks. */
export function chocolateDeepGeometry(): THREE.BufferGeometry {
	return cached('chocDeep', () =>
		withLocal(
			new Mesher()
				.quad(
					[-0.5, -0.5, half],
					[0.5, -0.5, half],
					[0.5, 0.5, half],
					[-0.5, 0.5, half],
					palette.chocolate,
				)
				.build(),
		),
	);
}

/**
 * The red cookie door, two tiles tall, built around the lower tile's centre: jam-red posts, a bumpy cookie face ringed
 * with chocolate chips, and a gingham jam lock at the middle. It fills the lane, so it is a wall.
 */
export function doorGeometry(): THREE.BufferGeometry {
	return cached('door', () => {
		const m = new Mesher(),
			rnd = rng(77),
			y0 = -0.5,
			y1 = 1.5,
			cols = 3,
			rows = 8,
			grid: V3[][] = [];
		for (let i = 0; i <= cols; i++) {
			grid.push([]);
			for (let j = 0; j <= rows; j++) {
				const inner = i > 0 && i < cols && j > 0 && j < rows;
				grid[i].push([
					-0.36 + (0.72 * i) / cols,
					y0 + ((y1 - y0) * j) / rows,
					half + (inner ? rnd() * 0.07 : 0),
				]);
			}
		}
		for (let i = 0; i < cols; i++)
			for (let j = 0; j < rows; j++)
				m.quad(
					grid[i][j],
					grid[i + 1][j],
					grid[i + 1][j + 1],
					grid[i][j + 1],
					shade(rnd() < 0.5 ? palette.cookie : palette.cookieDark, 0.94 + rnd() * 0.12),
				);
		for (const [a, b] of [
			[-0.5, -0.36],
			[0.36, 0.5],
		] as const)
			m.box(
				a,
				y0,
				-half,
				b,
				y1,
				half + 0.05,
				{ top: palette.jam, front: palette.jam, side: palette.jamDark },
				{
					back: false,
					bottom: false,
					top: false,
				},
			);
		const ring = 12;
		for (let k = 0; k < ring; k++) {
			const a = (k / ring) * Math.PI * 2,
				cx = Math.cos(a) * 0.29,
				cy = 0.5 + Math.sin(a) * 0.29;
			chip(m, cx, cy, 0.04);
		}
		for (const [cx, cy] of [
			[-0.2, 1.3],
			[0.18, 1.25],
			[0, 1.4],
			[-0.22, -0.3],
			[0.2, -0.38],
			[0, -0.2],
			[-0.25, 0.95],
			[0.26, 0.05],
		] as const)
			chip(m, cx, cy, 0.035);
		/* The jam lock: a five by five gingham. */
		const cell = 0.075;
		for (let i = 0; i < 5; i++)
			for (let j = 0; j < 5; j++)
				m.box(
					(i - 2.5) * cell,
					0.5 + (j - 2.5) * cell,
					half + 0.02,
					(i - 1.5) * cell,
					0.5 + (j - 1.5) * cell,
					half + 0.07,
					(i + j) % 2 === 0 ? palette.white : palette.jamDark,
					{ back: false, bottom: false, left: false, right: false },
				);
		return m.build();
	});
}

function chip(m: Mesher, x: number, y: number, r: number): void {
	const z = half + 0.01;
	m.pyramid(
		[
			[x - r, y - r, z],
			[x + r, y - r, z],
			[x + r, y + r, z],
			[x - r, y + r, z],
		],
		[x, y, z + 0.06],
		[palette.chip, shade(palette.chip, 0.7), shade(palette.chip, 0.55), shade(palette.chip, 1.3)],
	);
}

function exitFrame(m: Mesher): void {
	for (const [a, b] of [
		[-0.5, -0.38],
		[0.38, 0.5],
	] as const)
		m.box(
			a,
			-0.5,
			-0.2,
			b,
			0.5,
			0.2,
			{ top: palette.greenLight, front: palette.green, side: palette.green },
			{
				back: false,
				bottom: false,
			},
		);
}

/** The lower half of the exit: green posts around a wooden door with a yellow knob. */
export function exitBottomGeometry(): THREE.BufferGeometry {
	return cached('exitBot', () => {
		const m = new Mesher();
		exitFrame(m);
		m.box(
			-0.38,
			-0.5,
			-0.2,
			0.38,
			0.5,
			0,
			{ top: palette.wood, front: palette.wood, side: palette.wood },
			{
				back: false,
				bottom: false,
				top: false,
				left: false,
				right: false,
			},
		);
		m.box(-0.025, -0.5, 0, 0.025, 0.5, 0.02, palette.woodDark, {
			back: false,
			bottom: false,
			top: false,
		});
		m.box(0.2, -0.05, 0, 0.3, 0.05, 0.07, palette.knob, { back: false });
		return m.build();
	});
}

/** The upper half of the exit: the posts, a black sign board and a wooden lintel. */
export function exitTopGeometry(): THREE.BufferGeometry {
	return cached('exitTop', () => {
		const m = new Mesher();
		exitFrame(m);
		m.box(-0.38, -0.5, -0.2, 0.38, -0.2, 0, palette.wood, {
			back: false,
			bottom: false,
			left: false,
			right: false,
		});
		m.box(-0.38, -0.2, -0.2, 0.38, 0.5, 0, palette.black, {
			back: false,
			bottom: false,
			left: false,
			right: false,
		});
		return m.build();
	});
}

const font: Record<string, readonly string[]> = {
	E: ['111', '100', '111', '100', '111'],
	X: ['101', '101', '010', '101', '101'],
	I: ['111', '010', '010', '010', '111'],
	T: ['111', '010', '010', '010', '010'],
};

/** The yellow letters of the exit sign, built to sit on the black board of `exitTopGeometry`. */
export function exitLettersGeometry(): THREE.BufferGeometry {
	return cached('exitLetters', () => {
		const m = new Mesher(),
			dx = 0.04,
			dy = 0.078,
			left = -0.3,
			top = 0.44;
		[...'EXIT'].forEach((letter, index) => {
			font[letter].forEach((row, r) =>
				[...row].forEach((on, c) => {
					if (on !== '1') return;
					const x = left + (index * 4 + c) * dx,
						y = top - r * dy;
					m.box(x, y - dy, 0, x + dx, y, 0.06, palette.yellow, { back: false, bottom: false });
				}),
			);
		});
		return m.build();
	});
}

function crystal(
	m: Mesher,
	cx: number,
	cz: number,
	r: number,
	h: number,
	lean: number,
	colours: readonly number[],
): void {
	const sides = 6,
		floor = -0.5,
		shoulder = floor + h * 0.72,
		bottom: V3[] = [],
		top: V3[] = [];
	for (let k = 0; k < sides; k++) {
		const a = (k / sides) * Math.PI * 2 + 0.3;
		bottom.push([cx + Math.cos(a) * r, floor, cz - Math.sin(a) * r]);
		top.push([cx + lean * 0.72 + Math.cos(a) * r * 0.85, shoulder, cz - Math.sin(a) * r * 0.85]);
	}
	const apex: V3 = [cx + lean, floor + h, cz];
	for (let k = 0; k < sides; k++) {
		const n = (k + 1) % sides;
		m.quad(bottom[k], bottom[n], top[n], top[k], colours[k % colours.length]);
		m.tri(top[k], top[n], apex, shade(colours[(k + 1) % colours.length], 1.15));
	}
}

/** A cluster of five pink and white crystals on the ground, 0.82 wide and 0.88 tall like the sprite. */
export function crystalGeometry(): THREE.BufferGeometry {
	return cached('crystal', () => {
		const m = new Mesher(),
			c = [
				palette.crystalPink,
				palette.crystalLight,
				palette.crystalPurple,
				palette.crystalPink,
				palette.white,
				palette.crystalLight,
			];
		crystal(m, 0, -0.05, 0.15, 0.88, 0.02, c);
		crystal(m, -0.24, 0.1, 0.13, 0.58, -0.08, [c[2], c[0], c[1], c[2], c[0], c[4]]);
		crystal(m, 0.24, 0.05, 0.13, 0.68, 0.07, [c[1], c[3], c[2], c[0], c[1], c[4]]);
		crystal(m, 0.08, 0.25, 0.08, 0.36, 0.03, c);
		crystal(m, -0.13, -0.28, 0.1, 0.72, -0.03, [c[0], c[2], c[1], c[4], c[0], c[2]]);
		return m.build();
	});
}
