// The level landmarks of the overworld: what each stands on its tile as, how it is posed on the map, and the first area's three in full.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { FrameContext } from '../../level-3d/types.ts';
import type { Mesher } from '../crater/mesher.ts';
import { built, glazeMaterial, instancedParts, scratch, solidMesh, type Extra } from './actors.ts';
import { trim } from './palette.ts';
import { crystal, crystalColours } from './scenery.ts';
import { blob, lathe, limb, slab } from './shapes.ts';

/** What a landmark is made of. It stands on the ground around its own origin, with its door facing south (-Y). */
export interface LandmarkModel {
	/** How far from its centre it reaches, so the ground's scattered details stay out from under it. */
	reach: number;
	/** Its height. */
	height: number;
	/** How far north of the sprite's centre it stands, in tiles; the default leaves room on the doorstep for the level's pole. */
	shift?: number;
	solid(m: Mesher): void;
	/** Parts that glow of their own: windows, flames, cores. */
	glow?(m: Mesher): void;
	/** Parts that are see-through. */
	glaze?(m: Mesher): void;
	/** Adds moving parts and returns what runs each frame to move them. */
	extras?(group: THREE.Group): (frame: FrameContext) => void;
}

/** The merged still geometry of a landmark: its body and the parts that glow. */
export function landmarkModel(name: string, model: LandmarkModel): THREE.BufferGeometry {
	return built(`lm-${name}`, (m) => {
		model.solid(m);
		model.glow?.(m);
	});
}

/** A landmark's moving parts, or null for one that stands still. */
export function landmarkExtra(name: string, model: LandmarkModel): Extra | null {
	if (!model.glaze && !model.extras) return null;
	const group = new THREE.Group();
	if (model.glaze) {
		const glass = new THREE.Mesh(built(`lm-${name}-glaze`, model.glaze), glazeMaterial);
		glass.renderOrder = 2;
		group.add(glass);
	}
	const move = model.extras?.(group);
	return {
		object: group,
		update: (frame) => move?.(frame),
		dispose() {},
	};
}

/* Crater Fields: a rim of baked earth round a pit with a glowing core, and gems standing in the rubble. */

const crater: LandmarkModel = {
	reach: 1.5,
	height: 2,
	solid(m) {
		lathe(
			m,
			[
				{ r: 1.4, z: 0, colour: 0x7a3a10 },
				{ r: 1.3, z: 0.22, colour: 0xa05414 },
				{ r: 1.05, z: 0.46, colour: 0xd8883a },
				{ r: 0.86, z: 0.34, colour: 0x7a7a88 },
				{ r: 0.74, z: 0.1, colour: 0x3a3a48 },
			],
			{ sides: 18, jitter: 0.05, seed: 3, bake: 0.14 },
		);
		lathe(
			m,
			[
				{ r: 0.72, z: 0.1, colour: 0x14141c },
				{ r: 0.72, z: 0.12, colour: 0x14141c },
			],
			{ sides: 18 },
		);
		const gems: readonly [number, number, number, number, keyof typeof crystalColours][] = [
			[-1.0, 0.5, 1.7, 0.3, 'cyan'],
			[-0.5, 1.0, 1.3, 0.24, 'pink'],
			[0.45, 1.02, 1.85, 0.3, 'cyan'],
			[1.05, 0.3, 1.25, 0.26, 'pink'],
			[0.0, 1.12, 0.95, 0.2, 'cyan'],
			[-1.1, -0.2, 0.9, 0.2, 'pink'],
			[1.12, -0.3, 0.8, 0.18, 'cyan'],
		];
		gems.forEach(([x, y, h, r, colour], i) =>
			crystal(m, { x, y, z: 0.25 }, { r, h }, crystalColours[colour], i),
		);
		for (let i = 0; i < 6; i++) {
			const a = 3.4 + i * 0.5;
			blob(
				m,
				{ x: Math.cos(a) * 1.35, y: Math.sin(a) * 1.3, z: 0.08 },
				{ x: 0.2, y: 0.17, z: 0.14 },
				{ bottom: 0x58586a, top: 0x9a9aaa },
				{ sides: 5, rings: 2, seed: i },
			);
		}
	},
	glow(m) {
		lathe(
			m,
			[
				{ r: 0.5, z: 0.13, colour: 0xff3a2a },
				{ r: 0.5, z: 0.16, colour: 0xff3a2a },
			],
			{ sides: 14, bake: 0 },
		);
		lathe(
			m,
			[
				{ r: 0.3, z: 0.16, colour: 0xffe94a },
				{ r: 0.3, z: 0.19, colour: 0xffe94a },
			],
			{ sides: 12, bake: 0 },
		);
	},
	extras(group) {
		const mat = new THREE.MeshBasicMaterial({
				color: 0xff9a2a,
				transparent: true,
				opacity: 0.3,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				side: THREE.DoubleSide,
			}),
			column = new THREE.Mesh(
				new THREE.CylinderGeometry(0.28, 0.5, 1.3, 14, 1, true)
					.rotateX(Math.PI / 2)
					.translate(0, 0, 0.8),
				mat,
			);
		group.add(column);
		return (frame) => {
			const pulse = 0.5 + 0.5 * Math.sin(frame.time * 2.4);
			mat.opacity = 0.08 + 0.14 * pulse;
			column.scale.set(1, 1, 0.8 + 0.4 * pulse);
		};
	},
};

/* Meteor Mesa: a mesa of baked strata under a few drifting clouds. */

function strata(): readonly (readonly [number, number, number])[] {
	return [
		[1.32, 0, 0xff6a6a],
		[1.32, 0.1, 0xa05414],
		[1.24, 0.56, 0xa05414],
		[1.16, 0.56, 0xaa1818],
		[1.08, 1.0, 0xaa1818],
		[1.0, 1.0, 0xff6a6a],
		[0.94, 1.42, 0xff6a6a],
		[0.88, 1.42, 0xa05414],
		[0.82, 1.82, 0xa05414],
		[0.78, 1.82, 0xb8681e],
	];
}

const mesa: LandmarkModel = {
	reach: 1.5,
	height: 2.3,
	solid(m) {
		lathe(
			m,
			strata().map(([r, z, colour]) => ({ r, z, colour })),
			{ sides: 14, jitter: 0.04, seed: 9, bake: 0.16 },
		);
		slab(
			m,
			[-0.28, -0.12, 1.83],
			[0.28, 0.2, 2.0],
			{ top: trim.yellow, front: 0xfff06a, side: 0xd8b830 },
			1,
		);
		/* Grey slits in the red band, as the sprite has. */
		slab(m, [-0.5, -1.12, 0.62], [-0.42, -1.04, 0.98], trim.stoneDark, 1);
		slab(m, [0.4, -1.14, 0.2], [0.48, -1.06, 0.5], trim.stoneDark, 1);
	},
	extras(group) {
		const cloudGeometry = built('cloud', (m) => {
				blob(
					m,
					{ x: 0, y: 0, z: 0 },
					{ x: 0.5, y: 0.34, z: 0.26 },
					{ bottom: 0xdde4f4, top: 0xffffff },
					{ sides: 8, rings: 3 },
				);
				blob(
					m,
					{ x: 0.38, y: 0.04, z: 0.06 },
					{ x: 0.32, y: 0.26, z: 0.22 },
					{ bottom: 0xdde4f4, top: 0xffffff },
					{ sides: 7, rings: 3 },
				);
				blob(
					m,
					{ x: -0.36, y: -0.04, z: 0.04 },
					{ x: 0.3, y: 0.24, z: 0.2 },
					{ bottom: 0xdde4f4, top: 0xffffff },
					{ sides: 7, rings: 3 },
				);
			}),
			clouds = instancedParts(cloudGeometry, 3);
		group.add(clouds);
		return (frame) => {
			for (let i = 0; i < 3; i++) {
				const a = frame.time * (0.12 + i * 0.03) + i * 2.1;
				scratch.position.set(
					Math.cos(a) * 1.5,
					Math.sin(a) * 1.2,
					2.5 + i * 0.28 + Math.sin(frame.time * 0.7 + i) * 0.08,
				);
				scratch.scale.setScalar(0.8 + i * 0.15);
				scratch.updateMatrix();
				clouds.setMatrixAt(i, scratch.matrix);
			}
			clouds.instanceMatrix.needsUpdate = true;
		};
	},
};

/* Zarg Lookout: a watchtower with a red observation pod and an aerial. */

const lookout: LandmarkModel = {
	reach: 0.9,
	height: 4.3,
	solid(m) {
		lathe(
			m,
			[
				{ r: 0.72, z: 0, colour: 0x7a3a10 },
				{ r: 0.62, z: 0.16, colour: 0xb8681e },
				{ r: 0.4, z: 0.2, colour: 0xb8681e },
			],
			{ sides: 10 },
		);
		lathe(
			m,
			[
				{ r: 0.38, z: 0.16, colour: 0xd8d8e4 },
				{ r: 0.32, z: 3.0, colour: 0xf4f4ff },
			],
			{ sides: 8, bake: 0.32 },
		);
		for (const z of [0.9, 1.6, 2.3])
			slab(m, [-0.08, -0.4, z], [0.08, -0.3, z + 0.26], trim.black, 1);
		lathe(
			m,
			[
				{ r: 0.74, z: 2.95, colour: trim.stoneDark },
				{ r: 0.74, z: 3.12, colour: trim.stone },
				{ r: 0.5, z: 3.14, colour: trim.stoneLight },
			],
			{ sides: 12 },
		);
		lathe(
			m,
			[
				{ r: 0.74, z: 3.0, colour: 0xe08a2a },
				{ r: 0.74, z: 3.06, colour: 0xe08a2a },
			],
			{ sides: 12 },
		);
		lathe(
			m,
			[
				{ r: 0.5, z: 3.12, colour: 0xaa1818 },
				{ r: 0.5, z: 3.6, colour: 0xc42222 },
				{ r: 0.38, z: 3.84, colour: 0xff5a5a },
				{ r: 0.12, z: 3.98, colour: 0xff7a7a },
			],
			{ sides: 12, bake: 0.14 },
		);
		limb(m, [0, 0, 3.95], [0, 0, 4.6], 0.03, 0.02, trim.stoneLight);
		blob(
			m,
			{ x: 0, y: 0, z: 4.66 },
			{ x: 0.06, y: 0.06, z: 0.06 },
			{ bottom: trim.white, top: trim.white },
			{ sides: 5, rings: 2 },
		);
	},
	glow(m) {
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2 + 0.3;
			slab(
				m,
				[Math.cos(a) * 0.5 - 0.1, Math.sin(a) * 0.5 - 0.1, 3.3],
				[Math.cos(a) * 0.5 + 0.1, Math.sin(a) * 0.5 + 0.1, 3.5],
				{ top: trim.yellow, front: trim.yellow, side: trim.yellow },
				1,
			);
		}
	},
	extras(group) {
		const light = new THREE.Mesh(
			new THREE.OctahedronGeometry(0.11, 0),
			new THREE.MeshBasicMaterial({ color: 0xff4a3a }),
		);
		light.position.set(0, 0, 4.72);
		group.add(light);
		return (frame) => {
			light.visible = Math.sin(frame.time * 3.2) > 0;
		};
	},
};

export const firstAreaLandmarks = { Crater: crater, Mesa: mesa, Lookout: lookout } as const;
