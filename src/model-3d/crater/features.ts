// Geometry for the crater level's features: spikes, molten chocolate, the cookie door, the exit and crystals.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { Mesher, shade, type V3 } from './mesher.ts';
import { palette } from './palette.ts';
import { rng } from './hash.ts';
import { pad, type FaceMap, type PadStyle } from './relief.ts';
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

/** The pad style of a plank or a post segment: a bevelled strip of one colour, flush on the sides that carry on. */
function plankStyle(
	base: number,
	relief: number,
	flush: readonly [boolean, boolean, boolean, boolean],
	size = 1,
): PadStyle {
	const g = (on: boolean): number => (on ? 0 : 0.006 * size),
		b = (on: boolean): number => (on ? 0 : 0.011 * size);
	return {
		gap: [g(flush[0]), g(flush[1]), g(flush[2]), g(flush[3])],
		bevel: [b(flush[0]), b(flush[1]), b(flush[2]), b(flush[3])],
		w0: 0.002,
		w1: relief,
		foot: shade(base, 0.9),
		crown: shade(base, 1.06),
		edges: {
			left: shade(base, 1.2),
			right: shade(base, 0.62),
			bottom: shade(base, 0.5),
			top: shade(base, 1.38),
		},
	};
}

/** A small round-headed rivet or nail, as a four-sided pyramid. */
function rivet(m: Mesher, x: number, y: number, z: number, r: number, colour: number): void {
	m.pyramid(
		[
			[x - r, y - r, z],
			[x + r, y - r, z],
			[x + r, y + r, z],
			[x - r, y + r, z],
		],
		[x, y, z + r * 1.1],
		[shade(colour, 0.7), shade(colour, 0.9), shade(colour, 1.3), shade(colour, 1.1)],
	);
}

/**
 * The red cookie door, two tiles tall, built around the lower tile's centre: jam posts of small blocks, six cookie planks
 * across, two jam braces with hinge straps and rivets, a gold knob at hand height and a small gingham jam lock. It fills the
 * lane, so it is a wall.
 */
export function doorGeometry(): THREE.BufferGeometry {
	return cached('door', () => {
		const m = new Mesher(),
			rnd = rng(77),
			y0 = -0.5,
			y1 = 1.5,
			lintel = 1.38,
			inner = 0.36,
			plankCount = 6,
			front: FaceMap = (u, v, w) => [u, v, half + w],
			postFront = half + 0.03;
		/* The posts: a dark core with a column of small jam blocks on its face. */
		for (const [a, b] of [
			[-0.5, -inner],
			[inner, 0.5],
		] as const) {
			m.box(a, y0, -half, b, y1, postFront, palette.jamDark, {
				back: false,
				bottom: false,
				top: false,
			});
			for (let k = 0; k < 8; k++)
				pad(
					m,
					(u, v, w) => [u, v, postFront + w],
					{ u0: a, v0: y0 + k * 0.25, u1: b, v1: y0 + (k + 1) * 0.25 },
					{
						...plankStyle(
							shade(palette.jam, 0.94 + rnd() * 0.12),
							0.02,
							[false, false, false, false],
							0.8,
						),
						w0: 0.002,
					},
				);
		}
		/* The lintel across the top. */
		m.box(-inner, lintel, -half, inner, y1, half + 0.04, palette.jam, {
			back: false,
			bottom: false,
			left: false,
			right: false,
		});
		/* Planks: a dark backing, and six upright cookie planks, each a little different. */
		m.quad(
			[-inner, y0, half],
			[inner, y0, half],
			[inner, lintel, half],
			[-inner, lintel, half],
			palette.chip,
		);
		const wide = (2 * inner) / plankCount;
		for (let i = 0; i < plankCount; i++) {
			const base = shade(i % 2 === 0 ? palette.cookie : palette.cookieDark, 0.94 + rnd() * 0.14);
			pad(
				m,
				front,
				{ u0: -inner + i * wide, v0: y0, u1: -inner + (i + 1) * wide, v1: lintel },
				plankStyle(base, 0.035, [false, false, true, false]),
			);
			/* A chip or two in the grain. */
			for (let c = 0; c < 2; c++)
				rivet(
					m,
					-inner + (i + 0.3 + 0.4 * rnd()) * wide,
					y0 + 0.15 + rnd() * 1.1,
					half + 0.034,
					0.011,
					palette.chip,
				);
		}
		/* Two braces of jam across the planks, each with a rivet on every plank. */
		for (const [b0, b1] of [
			[-0.24, -0.1],
			[1.1, 1.24],
		] as const) {
			pad(
				m,
				front,
				{ u0: -inner, v0: b0, u1: inner, v1: b1 },
				{ ...plankStyle(palette.jam, 0.062, [false, false, false, false]), w0: 0.03 },
			);
			for (let i = 0; i < plankCount; i++)
				rivet(m, -inner + (i + 0.5) * wide, (b0 + b1) / 2, half + 0.062, 0.014, palette.white);
			/* The hinge strap: a darker length of the brace on the hinge side. */
			pad(
				m,
				front,
				{ u0: -inner, v0: b0 + 0.02, u1: -0.12, v1: b1 - 0.02 },
				{ ...plankStyle(palette.chip, 0.074, [false, false, false, false], 0.7), w0: 0.06 },
			);
			rivet(m, -0.3, (b0 + b1) / 2, half + 0.074, 0.011, palette.knob);
		}
		/* A small gingham lock above the knob, four cells across. */
		const cell = 0.035,
			lx = 0.2,
			ly = 0.64;
		for (let i = 0; i < 4; i++)
			for (let j = 0; j < 4; j++)
				m.box(
					lx + (i - 2) * cell,
					ly + (j - 2) * cell,
					half + 0.035,
					lx + (i - 1) * cell,
					ly + (j - 1) * cell,
					half + 0.06,
					(i + j) % 2 === 0 ? palette.white : palette.jamDark,
					{ back: false, bottom: false, left: false, right: false },
				);
		/* The knob, at about the height of Ben's hand. */
		pad(
			m,
			front,
			{ u0: 0.15, v0: 0.26, u1: 0.25, v1: 0.42 },
			{ ...plankStyle(palette.chip, 0.05, [false, false, false, false], 0.6), w0: 0.035 },
		);
		rivet(m, 0.2, 0.34, half + 0.05, 0.038, palette.knob);
		return m.build();
	});
}

/** Green posts either side of the exit, each a column of small blocks over a dark core. */
function exitFrame(m: Mesher): void {
	for (const [a, b] of [
		[-0.5, -0.38],
		[0.38, 0.5],
	] as const) {
		m.box(a, -0.5, -0.2, b, 0.5, 0.17, palette.green, { back: false, bottom: false });
		for (let k = 0; k < 4; k++)
			pad(
				m,
				(u, v, w) => [u, v, 0.17 + w],
				{ u0: a, v0: -0.5 + k * 0.25, u1: b, v1: -0.25 + k * 0.25 },
				{
					...plankStyle(
						shade(k % 2 === 0 ? palette.greenLight : palette.green, 0.95 + 0.05 * (k % 3)),
						0.03,
						[false, false, false, false],
						0.7,
					),
					w0: 0.002,
				},
			);
	}
}

/** Upright wooden planks across the exit's door, from `v0` to `v1`, flush to the edge that runs on into the other half. */
function exitPlanks(m: Mesher, v0: number, v1: number, flush: readonly [boolean, boolean]): void {
	const count = 6,
		wide = 0.76 / count;
	m.quad([-0.38, v0, 0], [0.38, v0, 0], [0.38, v1, 0], [-0.38, v1, 0], palette.woodDark);
	for (let i = 0; i < count; i++)
		pad(
			m,
			(u, v, w) => [u, v, w],
			{ u0: -0.38 + i * wide, v0, u1: -0.38 + (i + 1) * wide, v1 },
			plankStyle(
				shade(palette.wood, i % 2 === 0 ? 1.04 : 0.92 + 0.03 * i),
				0.025,
				[false, false, flush[0], flush[1]],
				0.8,
			),
		);
}

/** The lower half of the exit: green posts around a door of wooden planks, with small hinges and a gold knob at hand height. */
export function exitBottomGeometry(): THREE.BufferGeometry {
	return cached('exitBot', () => {
		const m = new Mesher();
		exitFrame(m);
		exitPlanks(m, -0.5, 0.5, [false, true]);
		for (const [a, b] of [
			[-0.36, -0.25],
			[0.02, 0.13],
		] as const) {
			pad(
				m,
				(u, v, w) => [u, v, w],
				{ u0: -0.38, v0: a, u1: -0.12, v1: b },
				{ ...plankStyle(palette.black, 0.045, [false, false, false, false], 0.6), w0: 0.02 },
			);
			rivet(m, -0.3, (a + b) / 2, 0.045, 0.01, palette.knob);
		}
		pad(
			m,
			(u, v, w) => [u, v, w],
			{ u0: 0.2, v0: 0.22, u1: 0.3, v1: 0.4 },
			{ ...plankStyle(palette.black, 0.04, [false, false, false, false], 0.6), w0: 0.02 },
		);
		rivet(m, 0.25, 0.31, 0.04, 0.032, palette.knob);
		return m.build();
	});
}

/** The upper half of the exit: the posts, the top of the planks, a black sign board with a thin yellow border and four nails. */
export function exitTopGeometry(): THREE.BufferGeometry {
	return cached('exitTop', () => {
		const m = new Mesher();
		exitFrame(m);
		exitPlanks(m, -0.5, -0.2, [true, false]);
		m.box(-0.38, -0.2, -0.2, 0.38, 0.5, 0, palette.black, {
			back: false,
			bottom: false,
			left: false,
			right: false,
		});
		const edge = 0.03,
			line = 0.012;
		for (const [x0, y0, x1, y1] of [
			[-0.38 + edge, -0.2 + edge, 0.38 - edge, -0.2 + edge + line],
			[-0.38 + edge, 0.5 - edge - line, 0.38 - edge, 0.5 - edge],
			[-0.38 + edge, -0.2 + edge, -0.38 + edge + line, 0.5 - edge],
			[0.38 - edge - line, -0.2 + edge, 0.38 - edge, 0.5 - edge],
		] as const)
			m.quad([x0, y0, 0.003], [x1, y0, 0.003], [x1, y1, 0.003], [x0, y1, 0.003], palette.knob);
		for (const x of [-0.3, 0.3])
			for (const y of [-0.12, 0.42]) rivet(m, x, y, 0.003, 0.012, palette.knob);
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

/** How far behind the middle of the lane a crystal cluster stands: its back just inside the ground's far edge. */
const crystalDepth = -(depth.lane / 2 - 0.235);
/** The cluster is half as deep as it is wide, so all of it fits behind him inside the lane. */
const crystalFlatten = 0.5;
/** How many ways a crystal cluster is turned about its own axis, and the widest turn in radians. */
export const crystalTurns = 5;
const crystalYaw = 0.24;

/**
 * A cluster of five pink and white crystals on the ground, 0.82 wide and 0.88 tall like the sprite, in one of
 * `crystalTurns` slightly different turns. The turn is small, so the cluster stays inside its cell.
 */
export function crystalGeometry(turn = 0): THREE.BufferGeometry {
	const yaw = (turn / (crystalTurns - 1) - 0.5) * crystalYaw;
	return cached(`crystal${turn}`, () => {
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
		/* Small shards round the foot, a hand's width tall, so the cluster has a small scale as well as a large one. */
		crystal(m, -0.35, 0.2, 0.045, 0.2, -0.03, [c[1], c[0], c[4]]);
		crystal(m, 0.35, -0.12, 0.045, 0.16, 0.03, [c[0], c[1], c[2]]);
		crystal(m, -0.05, 0.4, 0.04, 0.17, 0.01, [c[4], c[0], c[1]]);
		crystal(m, 0.14, -0.33, 0.04, 0.13, 0.02, [c[2], c[1], c[0]]);
		crystal(m, -0.33, -0.3, 0.035, 0.11, -0.02, [c[0], c[4], c[2]]);
		/* The crystals are scenery, not something he touches: they stand at the back of the lane, behind him. */
		return m.build().rotateY(yaw).scale(1, 1, crystalFlatten).translate(0, 0, crystalDepth);
	});
}
