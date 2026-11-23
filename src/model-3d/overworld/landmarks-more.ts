// The overworld's other level landmarks, simpler than the first area's: a meadow gate, theatre, bog, caves, mirror, hollow, glass hall, cake, spire, foundry, gumdrop isle and citadel.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Mesher, shade } from '../crater/mesher.ts';
import { built, instancedParts, scratch, solidMesh } from './actors.ts';
import type { LandmarkModel } from './landmarks.ts';
import { trim } from './palette.ts';
import { crystal, crystalColours } from './scenery.ts';
import { arch, blob, lathe, limb, slab } from './shapes.ts';

const meadows: LandmarkModel = {
	reach: 1.5,
	height: 3,
	solid(m) {
		blob(
			m,
			{ x: 0, y: 0.1, z: 0.55 },
			{ x: 1.25, y: 1.0, z: 0.7 },
			{ bottom: 0xc8c8dc, top: 0xffffff },
			{ sides: 10, rings: 4, jitter: 0.05, seed: 2, bake: 0.06 },
		);
		blob(
			m,
			{ x: 0, y: 0.1, z: 1.35 },
			{ x: 0.85, y: 0.7, z: 0.55 },
			{ bottom: 0xdcdcee, top: 0xffffff },
			{ sides: 9, rings: 4, jitter: 0.05, seed: 4, bake: 0.06 },
		);
		blob(
			m,
			{ x: 0, y: 0.1, z: 1.95 },
			{ x: 0.6, y: 0.5, z: 0.45 },
			{ bottom: 0xff66ff, top: 0xffa8ff },
			{ sides: 8, rings: 3, bake: 0.08 },
		);
		blob(
			m,
			{ x: 0.05, y: 0.1, z: 2.5 },
			{ x: 0.2, y: 0.2, z: 0.2 },
			{ bottom: 0xaa0000, top: 0xe02828 },
			{ sides: 7, rings: 3 },
		);
		limb(m, [0.05, 0.1, 2.65], [0.18, 0.1, 2.95], 0.025, 0.02, 0x2ec040);
		for (const x of [-0.62, 0.62]) {
			lathe(
				m,
				[
					{ r: 0.2, z: 0, colour: 0xc8c8dc },
					{ r: 0.17, z: 0.2, colour: trim.white },
					{ r: 0.17, z: 1.2, colour: trim.white },
					{ r: 0.2, z: 1.3, colour: 0xffa8ff },
				],
				{ sides: 8, cx: x, cy: -1.05, bake: 0.12 },
			);
		}
		slab(
			m,
			[-0.82, -1.18, 1.3],
			[0.82, -0.92, 1.5],
			{ top: 0xffa8ff, front: 0xff66ff, side: 0xb838c8 },
			1,
		);
	},
};

const playhouse: LandmarkModel = {
	reach: 1.4,
	height: 3,
	solid(m) {
		slab(
			m,
			[-0.95, -0.6, 0],
			[0.95, 0.6, 1.7],
			{ top: 0xb830b8, front: 0xc040c8, side: 0x982098 },
			0.75,
		);
		slab(m, [-0.97, -0.62, 1.36], [0.97, -0.58, 1.5], 0xff66ff, 1);
		for (const x of [-0.42, 0.42]) {
			slab(
				m,
				[x - 0.36, -0.64, 0],
				[x - 0.02, -0.58, 1.05],
				{ top: 0xaa0000, front: 0xc41e1e, side: 0xaa0000 },
				1,
			);
			slab(
				m,
				[x + 0.02, -0.64, 0],
				[x + 0.36, -0.58, 1.05],
				{ top: 0xaa0000, front: 0xc41e1e, side: 0xaa0000 },
				1,
			);
		}
		slab(
			m,
			[-0.6, -0.72, 1.12],
			[0.6, -0.62, 1.4],
			{ top: trim.yellow, front: trim.yellow, side: 0xd8b830 },
			1,
		);
		for (let i = 0; i < 5; i++)
			slab(
				m,
				[-0.5 + i * 0.24 - 0.04, -0.735, 1.22],
				[-0.5 + i * 0.24 + 0.04, -0.72, 1.3],
				trim.black,
				1,
			);
		/* The pitched white roof, a cherry on its front. */
		const ym = 0;
		m.quad([-1.05, -0.72, 1.7], [1.05, -0.72, 1.7], [1.05, ym, 2.5], [-1.05, ym, 2.5], 0xf4f4ff);
		m.quad([1.05, 0.72, 1.7], [-1.05, 0.72, 1.7], [-1.05, ym, 2.5], [1.05, ym, 2.5], 0xffffff);
		m.tri([-1.05, 0.72, 1.7], [-1.05, -0.72, 1.7], [-1.05, ym, 2.5], 0xe0e0f0);
		m.tri([1.05, -0.72, 1.7], [1.05, 0.72, 1.7], [1.05, ym, 2.5], 0xe0e0f0);
		blob(
			m,
			{ x: 0, y: -0.5, z: 2.0 },
			{ x: 0.1, y: 0.1, z: 0.1 },
			{ bottom: 0xaa0000, top: 0xe02828 },
			{ sides: 6, rings: 3 },
		);
	},
};

const fudgeBog: LandmarkModel = {
	reach: 1.6,
	height: 3,
	solid(m) {
		lathe(
			m,
			[
				{ r: 1.45, z: 0, colour: 0x6a3010 },
				{ r: 1.3, z: 0.28, colour: 0xa05414 },
				{ r: 1.0, z: 0.3, colour: 0x7a3a10 },
				{ r: 0.94, z: 0.1, colour: 0x2c1408 },
			],
			{ sides: 16, jitter: 0.06, seed: 5, bake: 0.12 },
		);
		/* A dead tree with bare branches, and two glowing reeds. */
		limb(m, [0.7, 0.45, 0.1], [0.75, 0.5, 1.7], 0.2, 0.11, 0x8a4410, 5);
		limb(m, [0.75, 0.5, 1.7], [0.9, 0.55, 2.7], 0.11, 0.04, 0x8a4410, 5);
		limb(m, [0.74, 0.5, 1.3], [1.35, 0.7, 1.95], 0.07, 0.025, 0x8a4410);
		limb(m, [0.76, 0.5, 1.8], [0.2, 0.65, 2.4], 0.07, 0.025, 0x8a4410);
		limb(m, [0.78, 0.52, 2.2], [1.25, 0.4, 2.75], 0.05, 0.02, 0x8a4410);
		limb(m, [-1.0, 0.1, 0.1], [-1.05, 0.15, 1.1], 0.06, 0.04, 0x4cf050, 5);
		limb(m, [-0.8, 0.45, 0.1], [-0.78, 0.5, 0.8], 0.06, 0.04, 0x4cf050, 5);
		blob(
			m,
			{ x: -0.15, y: -0.1, z: 0.12 },
			{ x: 0.38, y: 0.22, z: 0.1 },
			{ bottom: 0x8a0000, top: 0xc41e1e },
			{ sides: 8, rings: 2 },
		);
	},
	glow(m) {
		lathe(
			m,
			[
				{ r: 0.04, z: 0.14, colour: trim.yellow },
				{ r: 0.04, z: 0.17, colour: trim.yellow },
			],
			{ sides: 4, cx: 0.2, cy: -0.1 },
		);
		blob(
			m,
			{ x: -1.05, y: 0.15, z: 1.15 },
			{ x: 0.1, y: 0.1, z: 0.1 },
			{ bottom: 0x8aff70, top: 0xd0ffc0 },
			{ sides: 5, rings: 2 },
		);
		blob(
			m,
			{ x: -0.78, y: 0.5, z: 0.85 },
			{ x: 0.09, y: 0.09, z: 0.09 },
			{ bottom: 0x8aff70, top: 0xd0ffc0 },
			{ sides: 5, rings: 2 },
		);
	},
};

const caves: LandmarkModel = {
	reach: 1.5,
	height: 2.6,
	solid(m) {
		lathe(
			m,
			[
				{ r: 1.3, z: 0, colour: 0x4a4a58 },
				{ r: 1.3, z: 0.3, colour: 0x6a6a78 },
				{ r: 1.1, z: 0.8, colour: 0x8a8a98 },
				{ r: 0.8, z: 1.2, colour: 0xa8a8b8 },
				{ r: 0.35, z: 1.45, colour: 0xb8b8c8 },
			],
			{ sides: 14, jitter: 0.04, seed: 8, bake: 0.14 },
		);
		arch(m, 0, -1.31, 0.01, 0.5, 0.35, 0xc0c0cc);
		arch(m, 0, -1.32, 0.01, 0.36, 0.3, 0x0a0aa0);
		const gems: readonly [number, number, number, number, keyof typeof crystalColours][] = [
			[-0.5, 0.1, 1.2, 0.2, 'cyan'],
			[0.1, 0.35, 1.4, 0.23, 'pink'],
			[0.55, -0.1, 0.9, 0.17, 'cyan'],
		];
		gems.forEach(([x, y, h, r, colour], i) =>
			crystal(m, { x, y, z: 1.2 }, { r, h }, crystalColours[colour], i),
		);
	},
};

/** The octahedral mirror of the shafts: a tall six-sided diamond, white on one side and blue on the other. */
function mirror(m: Mesher): void {
	const top: [number, number, number] = [0, 0, 2.7],
		bottom: [number, number, number] = [0, 0, 0.75],
		faces = [0xffffff, 0xdcffff, 0x8afcff, 0x55f0f0, 0x5a64ff, 0x3a3ad8];
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2,
			b = ((i + 1) / 6) * Math.PI * 2,
			pa: [number, number, number] = [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 1.75],
			pb: [number, number, number] = [Math.cos(b) * 0.62, Math.sin(b) * 0.62, 1.75];
		m.tri(pa, pb, top, faces[i]);
		m.tri(pb, pa, bottom, shade(faces[i], 0.8));
	}
}

const shafts: LandmarkModel = {
	reach: 1.1,
	height: 3.1,
	solid(m) {
		lathe(
			m,
			[
				{ r: 0.7, z: 0, colour: 0x7a3a10 },
				{ r: 0.6, z: 0.14, colour: 0xb8681e },
				{ r: 0.3, z: 0.18, colour: 0xb8681e },
			],
			{ sides: 10 },
		);
		lathe(
			m,
			[
				{ r: 0.16, z: 0.16, colour: trim.stoneDark },
				{ r: 0.1, z: 0.8, colour: trim.stone },
			],
			{ sides: 6 },
		);
	},
	extras(group) {
		const gem = solidMesh(built('mirror', mirror));
		group.add(gem);
		return (frame) => {
			gem.rotation.z = frame.time * 0.5;
			gem.position.z = Math.sin(frame.time * 1.3) * 0.06;
		};
	},
};

const hollow: LandmarkModel = {
	reach: 1.3,
	height: 3.2,
	solid(m) {
		lathe(
			m,
			[
				{ r: 1.05, z: 0, colour: 0x7a3a10 },
				{ r: 0.85, z: 0.5, colour: 0xa05414 },
				{ r: 0.8, z: 2.4, colour: 0xb8681e },
				{ r: 0.84, z: 2.6, colour: 0x6a6a78 },
				{ r: 0.6, z: 2.7, colour: 0x8a8a98 },
			],
			{ sides: 12, jitter: 0.04, seed: 12, bake: 0.16 },
		);
		slab(
			m,
			[-0.62, -0.84, 0.3],
			[-0.46, -0.72, 2.3],
			{ top: 0xaa0000, front: 0xc41e1e, side: 0xaa0000 },
			1,
		);
		arch(m, 0.05, -0.82, 0.4, 0.34, 0.5, 0x2a1408);
		arch(m, 0.05, -0.83, 0.4, 0.26, 0.45, 0x0a0aa0);
		for (const [x, tone] of [
			[-1.0, 0xff5a5a],
			[0.95, 0xff7a9a],
		] as const) {
			lathe(
				m,
				[
					{ r: 0.08, z: 0, colour: trim.white },
					{ r: 0.07, z: 0.3, colour: trim.white },
				],
				{ sides: 5, cx: x, cy: -0.5 },
			);
			blob(
				m,
				{ x, y: -0.5, z: 0.3 },
				{ x: 0.27, y: 0.27, z: 0.2 },
				{ bottom: shade(tone, 0.8), top: tone },
				{ sides: 8, rings: 3 },
			);
			for (let i = 0; i < 3; i++)
				slab(
					m,
					[x + Math.cos(i * 2.1) * 0.14 - 0.04, -0.5 + Math.sin(i * 2.1) * 0.14 - 0.04, 0.46],
					[x + Math.cos(i * 2.1) * 0.14 + 0.04, -0.5 + Math.sin(i * 2.1) * 0.14 + 0.04, 0.5],
					trim.white,
					1,
				);
		}
	},
	glow(m) {
		slab(
			m,
			[-0.12, -0.835, 0.7],
			[-0.06, -0.82, 0.8],
			{ top: trim.white, front: trim.white, side: trim.white },
			1,
		);
		slab(
			m,
			[0.12, -0.835, 0.7],
			[0.18, -0.82, 0.8],
			{ top: trim.white, front: trim.white, side: trim.white },
			1,
		);
	},
};

const sugarGlass: LandmarkModel = {
	reach: 1.4,
	height: 2.4,
	solid(m) {
		lathe(
			m,
			[
				{ r: 1.3, z: 0, colour: 0x3a3ad8 },
				{ r: 1.25, z: 0.16, colour: 0x5a64ff },
			],
			{ sides: 16, bake: 0.1 },
		);
		/* The frame: four ribs rising over the dome, and a ring round it at mid height. */
		const radius = 1.2,
			ribs = 4,
			steps = 6;
		for (let r = 0; r < ribs; r++) {
			const turn = (r / ribs) * Math.PI;
			for (let s = 0; s < steps * 2; s++) {
				const a0 = (s / (steps * 2)) * Math.PI,
					a1 = ((s + 1) / (steps * 2)) * Math.PI,
					at = (a: number): [number, number, number] => [
						-Math.cos(a) * radius * Math.cos(turn),
						-Math.cos(a) * radius * Math.sin(turn),
						Math.sin(a) * 1.9 + 0.1,
					];
				limb(m, at(a0), at(a1), 0.035, 0.035, 0x4a4cf0);
			}
		}
		const ringCount = 16;
		for (let i = 0; i < ringCount; i++) {
			const a = (i / ringCount) * Math.PI * 2,
				b = ((i + 1) / ringCount) * Math.PI * 2,
				r = Math.sqrt(1 - 0.35 * 0.35) * radius * 0.95;
			limb(
				m,
				[Math.cos(a) * r, Math.sin(a) * r, 0.1 + 1.9 * 0.55],
				[Math.cos(b) * r, Math.sin(b) * r, 0.1 + 1.9 * 0.55],
				0.035,
				0.035,
				0x4a4cf0,
			);
		}
		arch(m, 0, -1.2, 0.05, 0.3, 0.35, 0x0a0aa0);
	},
	glaze(m) {
		lathe(
			m,
			[
				{ r: 1.18, z: 0.1, colour: 0x66f8ff },
				{ r: 1.1, z: 0.8, colour: 0x88fcff },
				{ r: 0.9, z: 1.4, colour: 0xa8ffff },
				{ r: 0.5, z: 1.85, colour: 0xc8ffff },
				{ r: 0, z: 2.0, colour: trim.white },
			],
			{ sides: 16, bake: 0.08 },
		);
	},
};

const flats: LandmarkModel = {
	reach: 1.5,
	height: 2.4,
	solid(m) {
		slab(
			m,
			[-1.1, -0.72, 0],
			[1.1, 0.72, 0.85],
			{ top: 0xb8681e, front: 0xc2742a, side: 0xa05414 },
			0.75,
		);
		slab(
			m,
			[-1.11, -0.73, 0.36],
			[1.11, 0.73, 0.46],
			{ top: 0xaa1818, front: 0xc42222, side: 0xaa1818 },
			1,
		);
		slab(
			m,
			[-1.15, -0.77, 0.85],
			[1.15, 0.77, 1.08],
			{ top: trim.white, front: 0xf4f4ff, side: 0xe0e0f0 },
			1,
		);
		for (let i = 0; i < 7; i++)
			slab(
				m,
				[-1.0 + i * 0.33, -0.8, 0.66 - (i % 3) * 0.07],
				[-0.82 + i * 0.33, -0.76, 0.9],
				trim.white,
				1,
			);
		for (let i = 0; i < 6; i++)
			blob(
				m,
				{ x: -0.9 + i * 0.36, y: -0.68, z: 1.1 },
				{ x: 0.12, y: 0.12, z: 0.1 },
				{ bottom: 0xff66ff, top: 0xffa8ff },
				{ sides: 6, rings: 2 },
			);
		for (const x of [-0.65, 0, 0.65])
			lathe(
				m,
				[
					{ r: 0.08, z: 1.05, colour: 0xff66ff },
					{ r: 0.08, z: 1.8, colour: 0xb838c8 },
				],
				{ sides: 6, cx: x, cy: 0.05, bake: 0.2 },
			);
	},
	glow(m) {
		for (const x of [-0.65, 0, 0.65])
			lathe(
				m,
				[
					{ r: 0.1, z: 1.8, colour: 0xff8a20 },
					{ r: 0.06, z: 1.98, colour: trim.yellow },
					{ r: 0, z: 2.12, colour: 0xfff29a },
				],
				{ sides: 5, cx: x, cy: 0.05, bake: 0 },
			);
	},
};

const spire: LandmarkModel = {
	reach: 1.5,
	height: 5.2,
	solid(m) {
		const top = 5.0,
			radiusAt = (z: number): number => 1.3 * (1 - z / (top + 0.3)) + 0.04,
			bands = [1.0, 1.9, 2.7, 3.4, 4.0, 4.5],
			rings: { r: number; z: number; colour: number }[] = [
				{ r: 1.4, z: 0, colour: trim.white },
				{ r: 1.4, z: 0.2, colour: trim.white },
				{ r: 1.3, z: 0.24, colour: 0xd044ff },
			];
		let z = 0.24;
		for (const band of bands) {
			rings.push({ r: radiusAt(band), z: band, colour: 0xe070ff });
			rings.push(
				{ r: radiusAt(band) + 0.05, z: band, colour: trim.white },
				{ r: radiusAt(band + 0.1) + 0.05, z: band + 0.1, colour: trim.white },
			);
			rings.push({ r: radiusAt(band + 0.1), z: band + 0.1, colour: 0xd044ff });
			z = band + 0.1;
		}
		rings.push({ r: radiusAt(z), z, colour: 0xd044ff }, { r: 0.04, z: top, colour: 0xe070ff });
		lathe(m, rings, { sides: 16, bake: 0.28 });
		arch(m, 0, -1.28, 0.2, 0.3, 0.55, 0x2a0a40);
		for (let i = 0; i < 7; i++) {
			const zz = 0.9 + i * 0.6,
				a = i * 2.1,
				r = radiusAt(zz) + 0.01;
			slab(
				m,
				[Math.cos(a) * r - 0.05, Math.sin(a) * r - 0.05, zz],
				[Math.cos(a) * r + 0.05, Math.sin(a) * r + 0.05, zz + 0.1],
				i % 2 ? trim.cyan : trim.yellow,
				1,
			);
		}
		lathe(
			m,
			[
				{ r: 0, z: top - 0.1, colour: 0xffb020 },
				{ r: 0.26, z: top + 0.25, colour: trim.yellow },
				{ r: 0, z: top + 0.75, colour: 0xfff29a },
			],
			{ sides: 5, bake: 0 },
		);
	},
};

const foundry: LandmarkModel = {
	reach: 1.6,
	height: 3.2,
	solid(m) {
		slab(
			m,
			[-1.1, -0.65, 0],
			[1.1, 0.65, 1.15],
			{ top: 0x6a6a78, front: 0x7a7a88, side: 0x5a5a68 },
			0.7,
		);
		for (let row = 0; row < 5; row++)
			for (let i = 0; i < 5; i++) {
				const x0 = -1.05 + i * 0.44 + (row % 2) * 0.22;
				if (x0 + 0.4 > 1.1) continue;
				const tone = ((i * 7 + row * 3) % 4) / 4;
				slab(
					m,
					[Math.max(-1.1, x0), -0.675, 0.06 + row * 0.21],
					[Math.min(1.1, x0 + 0.4), -0.65, 0.06 + row * 0.21 + 0.16],
					shade(0x9a9aa8, 0.75 + tone * 0.35),
					1,
				);
			}
		slab(
			m,
			[-0.34, -0.7, 0],
			[0.34, -0.64, 0.92],
			{ top: 0xaa1818, front: 0xc42222, side: 0xaa1818 },
			1,
		);
		for (const [x, tint] of [
			[-0.62, 0xc8c8d4],
			[0.58, 0x9a9aa8],
		] as const) {
			lathe(
				m,
				[
					{ r: 0.3, z: 1.1, colour: 0xa05414 },
					{ r: 0.26, z: 2.5, colour: 0xb8681e },
					{ r: 0.28, z: 2.55, colour: 0xaa1818 },
					{ r: 0.28, z: 2.7, colour: 0xc42222 },
					{ r: 0.34, z: 2.76, colour: tint },
					{ r: 0.32, z: 2.88, colour: tint },
				],
				{ sides: 10, cx: x, cy: 0.12, bake: 0.18 },
			);
		}
	},
	glow(m) {
		slab(
			m,
			[-0.2, -0.705, 0.04],
			[0.2, -0.65, 0.6],
			{ top: trim.yellow, front: trim.yellow, side: trim.yellow },
			1,
		);
		slab(
			m,
			[-0.12, -0.71, 0.5],
			[0.12, -0.65, 0.72],
			{ top: 0xff8a20, front: 0xff8a20, side: 0xff8a20 },
			1,
		);
	},
	extras(group) {
		const puffGeometry = built('smoke', (m) =>
				blob(
					m,
					{ x: 0, y: 0, z: 0 },
					{ x: 1, y: 1, z: 0.9 },
					{ bottom: 0x8a8a98, top: 0xc8c8d4 },
					{ sides: 7, rings: 3 },
				),
			),
			puffs = instancedParts(puffGeometry, 6);
		group.add(puffs);
		return (frame) => {
			for (let i = 0; i < 6; i++) {
				const chimney = i % 2,
					t = (frame.time * 0.22 + Math.floor(i / 2) / 3 + chimney * 0.17) % 1,
					x = chimney ? 0.58 : -0.62;
				scratch.position.set(
					x + t * 0.5 + Math.sin(t * 6 + i) * 0.08,
					0.12 + t * 0.2,
					2.95 + t * 1.8,
				);
				scratch.scale.setScalar(Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.34 + 0.02);
				scratch.updateMatrix();
				puffs.setMatrixAt(i, scratch.matrix);
			}
			puffs.instanceMatrix.needsUpdate = true;
		};
	},
};

const gumdrop: LandmarkModel = {
	reach: 1.3,
	height: 2.3,
	shift: -0.2,
	solid(m) {
		const drops: readonly [number, number, number, number, number, number][] = [
			[-0.75, -0.25, 0, 0.62, 0xff4a4a, 0xff8a8a],
			[0.05, -0.38, 0, 0.7, 0xffe030, 0xfff29a],
			[0.8, -0.2, 0, 0.62, 0x3ad84a, 0x8aff8a],
			[-0.4, 0.25, 0.62, 0.55, 0x4a52ff, 0x8a92ff],
			[0.4, 0.25, 0.62, 0.55, 0xff55ff, 0xffa8ff],
			[0.0, 0.05, 1.2, 0.52, 0x44e8e8, 0xc8ffff],
		];
		for (const [x, y, z, r, low, high] of drops) {
			blob(
				m,
				{ x: x * 0.88, y: y * 0.88, z: (z + r * 0.6) * 0.88 },
				{ x: r * 0.88, y: r * 0.88, z: r * 0.75 },
				{ bottom: low, top: high },
				{ sides: 9, rings: 4, bake: 0.1 },
			);
			blob(
				m,
				{ x: (x - r * 0.3) * 0.88, y: (y - r * 0.3) * 0.88, z: (z + r * 1.2) * 0.88 },
				{ x: r * 0.12, y: r * 0.1, z: r * 0.07 },
				{ bottom: trim.white, top: trim.white },
				{ sides: 5, rings: 2 },
			);
		}
	},
};

/** A pennant on a short pole. */
function pennant(m: Mesher, x: number, y: number, z: number): void {
	limb(m, [x, y, z], [x, y, z + 0.9], 0.03, 0.025, 0xc8c8d4);
	m.quad([x, y, z + 0.8], [x + 0.5, y, z + 0.72], [x + 0.5, y, z + 0.9], [x, y, z + 0.9], 0xff55ff);
	m.quad([x + 0.5, y, z + 0.72], [x, y, z + 0.8], [x, y, z + 0.9], [x + 0.5, y, z + 0.9], 0xb030c0);
}

const castle: LandmarkModel = {
	reach: 1.9,
	height: 4.4,
	solid(m) {
		const wall = { top: 0x8a4418, front: 0x7a3a14, side: 0x5a2a10 };
		slab(m, [-1.2, -0.58, 0], [1.2, 0.58, 1.9], wall, 0.6);
		for (let i = 0; i < 4; i++)
			slab(m, [-1.2, -0.6, 0.35 + i * 0.36], [1.2, -0.58, 0.45 + i * 0.36], 0xff55ff, 1);
		slab(
			m,
			[-1.25, -0.63, 1.85],
			[1.25, 0.63, 2.0],
			{ top: trim.white, front: trim.white, side: trim.cream },
			1,
		);
		for (let i = 0; i < 8; i++)
			slab(
				m,
				[-1.2 + i * 0.3, -0.63, 2.0],
				[-1.2 + i * 0.3 + 0.17, 0.63, 2.24],
				{ top: trim.white, front: trim.white, side: trim.cream },
				1,
			);
		slab(m, [-0.46, -0.5, 1.9], [0.46, 0.5, 3.5], wall, 0.8);
		for (let i = 0; i < 3; i++)
			slab(m, [-0.46, -0.52, 2.3 + i * 0.36], [0.46, -0.5, 2.4 + i * 0.36], 0xff55ff, 1);
		slab(
			m,
			[-0.52, -0.56, 3.5],
			[0.52, 0.56, 3.72],
			{ top: trim.white, front: trim.white, side: trim.cream },
			1,
		);
		for (let i = 0; i < 4; i++)
			slab(
				m,
				[-0.5 + i * 0.3, -0.56, 3.72],
				[-0.5 + i * 0.3 + 0.16, 0.56, 3.94],
				{ top: trim.white, front: trim.white, side: trim.cream },
				1,
			);
		for (const x of [-1.0, 1.0]) {
			lathe(
				m,
				[
					{ r: 0.42, z: 0, colour: 0x5a2a10 },
					{ r: 0.38, z: 0.4, colour: 0x7a3a14 },
					{ r: 0.36, z: 2.7, colour: 0x8a4418 },
					{ r: 0.44, z: 2.76, colour: trim.white },
					{ r: 0.44, z: 2.95, colour: trim.white },
					{ r: 0.2, z: 3.02, colour: trim.white },
				],
				{ sides: 10, cx: x, cy: 0.1, bake: 0.16 },
			);
			pennant(m, x - 0.1, 0.1, 3.0);
		}
		pennant(m, -0.1, 0, 3.94);
		arch(m, 0, -0.61, 0.0, 0.3, 0.95, 0x08080c);
		slab(m, [-0.36, -0.64, 0], [-0.28, -0.6, 1.3], trim.white, 1);
		slab(m, [0.28, -0.64, 0], [0.36, -0.6, 1.3], trim.white, 1);
	},
	glow(m) {
		const lit = (x: number, y: number, z: number, hw: number, h: number): void =>
			slab(
				m,
				[x - hw, y - 0.03, z],
				[x + hw, y, z + h],
				{ top: trim.yellow, front: trim.yellow, side: trim.yellow },
				1,
			);
		lit(0, -0.505, 2.85, 0.1, 0.4);
		lit(-1.0, -0.3, 1.9, 0.08, 0.35);
		lit(1.0, -0.3, 1.9, 0.08, 0.35);
		lit(-0.7, -0.595, 1.3, 0.09, 0.3);
		lit(0.7, -0.595, 1.3, 0.09, 0.3);
	},
};

export const moreLandmarks = {
	Meadows: meadows,
	Playhouse: playhouse,
	FudgeBog: fudgeBog,
	Caves: caves,
	Shafts: shafts,
	Hollow: hollow,
	SugarGlass: sugarGlass,
	Flats: flats,
	Spire: spire,
	Foundry: foundry,
	Gumdrop: gumdrop,
	Castle: castle,
} as const;
