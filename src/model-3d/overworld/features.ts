// The overworld's small features: the flag poles and waving flags, teleporter pads, signposts, the fountain and Ben's saucer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { toonRamp } from '../ben-g/shared.ts';
import { lattice } from '../crater/hash.ts';
import type { Mesher } from '../crater/mesher.ts';
import { built, scratch, type Extra } from './actors.ts';
import type { OverworldBatch } from './batch.ts';
import { trim } from './palette.ts';
import { disc, lathe, slab } from './shapes.ts';

/** Where a pole stands, given its sprite: on the doorstep, to the right of the level's node. */
export function poleSpot(
	draw: { x: number; y: number },
	batch: OverworldBatch,
): { x: number; y: number } {
	const x = draw.x,
		y = draw.y - 0.9;
	/* A pole that would stand inside a building, as the Citadel's does at its gate, moves out to the side of it. */
	return { x: batch.isClaimed(x, y) ? x + 0.95 : x, y };
}

const poleHeight = 2.1;

function addPole(m: Mesher): void {
	lathe(
		m,
		[
			{ r: 0.2, z: 0, colour: trim.woodDark },
			{ r: 0.16, z: 0.1, colour: trim.wood },
			{ r: 0.12, z: 0.16, colour: trim.wood },
		],
		{ sides: 8 },
	);
	lathe(
		m,
		[
			{ r: 0.045, z: 0.1, colour: 0xc8c8d4 },
			{ r: 0.035, z: poleHeight, colour: 0x9a9aa8 },
		],
		{ sides: 6, bake: 0.2 },
	);
	lathe(
		m,
		[
			{ r: 0, z: poleHeight - 0.02, colour: trim.yellow },
			{ r: 0.09, z: poleHeight + 0.06, colour: trim.yellow },
			{ r: 0, z: poleHeight + 0.16, colour: 0xfff29a },
		],
		{ sides: 6 },
	);
}

/** The bare pole each level has until it is cleared. */
export function poleModel(): THREE.BufferGeometry {
	return built('pole', addPole);
}

/** A pole with its green flag hung from the top, as the cleared level has it. */
function flagModel(): THREE.BufferGeometry {
	return built('flag', (m) => {
		addPole(m);
		const cols = 8,
			w = 0.95,
			h = 0.6,
			top = poleHeight - 0.08;
		for (let i = 0; i < cols; i++) {
			const x0 = 0.05 + (i / cols) * w,
				x1 = 0.05 + ((i + 1) / cols) * w;
			m.quadC(
				[x0, 0, top - h],
				[x1, 0, top - h],
				[x1, 0, top],
				[x0, 0, top],
				0x1fa832,
				0x1fa832,
				0x4cf050,
				0x4cf050,
			);
			m.quadC(
				[x1, 0, top - h],
				[x0, 0, top - h],
				[x0, 0, top],
				[x1, 0, top],
				0x1fa832,
				0x1fa832,
				0x4cf050,
				0x4cf050,
			);
		}
		/* A white star in the middle of the cloth. */
		const cx = 0.05 + w * 0.45,
			cz = top - h * 0.5,
			point = (a: number, r: number): [number, number, number] => [
				cx + Math.cos(a) * r,
				-0.004,
				cz + Math.sin(a) * r,
			];
		for (let k = 0; k < 5; k++) {
			const a = (k / 5) * Math.PI * 2 + Math.PI / 2,
				b = ((k + 0.5) / 5) * Math.PI * 2 + Math.PI / 2,
				c = ((k + 1) / 5) * Math.PI * 2 + Math.PI / 2;
			m.tri(point(a, 0.17), point(b, 0.07), [cx, -0.004, cz], 0xffffff);
			m.tri([cx, -0.004, cz], point(b, 0.07), point(c, 0.17), 0xffffff);
		}
	});
}

const flagTime = { value: 0 };
/** The flag's material: the cloth, past the pole, sways with the clock and each flag in its own phase. */
const flagMaterial = new THREE.MeshToonMaterial({
	vertexColors: true,
	gradientMap: toonRamp,
	side: THREE.DoubleSide,
});
flagMaterial.onBeforeCompile = (shader) => {
	shader.uniforms.uTime = flagTime;
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nuniform float uTime;')
		.replace(
			'#include <begin_vertex>',
			`vec3 transformed = vec3(position);
float cloth = step(0.05, position.x) * step(1.3, position.z) * step(position.z, 2.05);
float reach = clamp((position.x - 0.05) / 0.95, 0.0, 1.0) * cloth;
float phase = modelMatrix[3].x * 1.7 + modelMatrix[3].y * 2.3;
transformed.y += sin(position.x * 7.0 - uTime * 5.0 + phase) * 0.09 * reach;
transformed.z += sin(position.x * 5.0 - uTime * 4.0 + phase) * 0.03 * reach;`,
		);
};
flagMaterial.customProgramCacheKey = () => 'overworld-flag';

/**
 * A flag on its pole: at rest on the pole when the level is cleared, and in the air while Ben throws it, which the sim
 * shows by drawing a bare pole beside it.
 */
export function flagActor(first: SpriteDraw, batch: OverworldBatch): Actor {
	const mesh = new THREE.Mesh(flagModel(), flagMaterial),
		spot = poleSpot(first, batch);
	mesh.castShadow = true;
	mesh.position.set(spot.x, spot.y, batch.terrain.height(spot.x, spot.y) - 0.02);
	return {
		object: mesh,
		update(draw, frame) {
			flagTime.value = frame.time;
			const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 0.01,
				rest = whole(draw.x - 0.1) && whole(draw.y - 0.4);
			let pole: SpriteDraw | null = null;
			if (!rest) {
				let best = 1e9;
				for (const other of frame.draws)
					if (other.name === 'owFlagHolder') {
						const d = Math.hypot(other.x - draw.x, other.y - draw.y);
						if (d < best) {
							best = d;
							pole = other;
						}
					}
			}
			const here = poleSpot(draw, batch);
			if (pole) {
				/* In flight the sprite's height shows only as a rise on the page; take it as lift from the distance to go. */
				const lift = Math.min(2.2, 0.55 * Math.hypot(pole.x - draw.x, pole.y - draw.y));
				mesh.position.set(here.x, here.y - lift * 0.5, lift);
			} else mesh.position.set(here.x, here.y, batch.terrain.height(here.x, here.y) - 0.02);
		},
		dispose() {},
	};
}

/* The teleporter pad. */

function addPad(m: Mesher, on: boolean): void {
	lathe(
		m,
		[
			{ r: 0.92, z: 0, colour: trim.stoneDark },
			{ r: 0.88, z: 0.14, colour: trim.stone },
			{ r: 0.8, z: 0.2, colour: trim.stoneLight },
			{ r: 0.62, z: 0.2, colour: trim.stoneLight },
		],
		{ sides: 14, bake: 0.12 },
	);
	lathe(
		m,
		[
			{ r: 0.46, z: 0.2, colour: trim.stoneDark },
			{ r: 0.46, z: 0.22, colour: trim.stoneDark },
		],
		{ sides: 14 },
	);
	const ring = (r0: number, r1: number, z: number, colour: number): void => {
		const sides = 28;
		for (let i = 0; i < sides; i++) {
			const a = (i / sides) * Math.PI * 2,
				b = ((i + 1) / sides) * Math.PI * 2;
			m.quad(
				[Math.cos(a) * r0, Math.sin(a) * r0, z],
				[Math.cos(b) * r0, Math.sin(b) * r0, z],
				[Math.cos(b) * r1, Math.sin(b) * r1, z],
				[Math.cos(a) * r1, Math.sin(a) * r1, z],
				colour,
			);
		}
	};
	ring(0.62, 0.72, 0.205, on ? 0x55f0f0 : 0x6a7684);
	ring(0.42, 0.5, 0.215, on ? 0x55f0f0 : 0x6a7684);
	disc(m, 0, 0, 0.225, 0.42, on ? 0xffffff : 0x8a8a98, 20);
}

const padOn = new THREE.MeshToonMaterial({
	vertexColors: true,
	gradientMap: toonRamp,
	emissive: 0x2a8090,
});
const padOff = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });

let beamShared: THREE.BufferGeometry | null = null;
function beam(): THREE.BufferGeometry {
	if (!beamShared) {
		beamShared = new THREE.CylinderGeometry(0.34, 0.6, 2.6, 18, 1, true);
		beamShared.rotateX(Math.PI / 2);
		beamShared.translate(0, 0, 1.5);
	}
	return beamShared;
}

/** A teleporter pad: dim stone when it is off, a glowing ring and a pulsing beam of light when it is powered. */
export function teleActor(first: SpriteDraw, batch: OverworldBatch): Actor {
	const group = new THREE.Group(),
		mesh = new THREE.Mesh(
			built('pad-off', (m) => addPad(m, false)),
			padOff,
		),
		light = new THREE.Mesh(
			beam(),
			new THREE.MeshBasicMaterial({
				color: 0x55f0f0,
				transparent: true,
				opacity: 0.25,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
			}),
		),
		beamMat = light.material as THREE.MeshBasicMaterial,
		x = first.x,
		y = first.y,
		phase = lattice(Math.round(x), Math.round(y), 71) * 6.28,
		release = batch.claim(x, y, 1.1);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	light.visible = false;
	group.add(mesh, light);
	group.position.set(x, y, batch.terrain.height(x, y) - 0.03);
	let powered = false;
	return {
		object: group,
		update(draw, frame) {
			const on = (draw.tint & 0xff) > 0xa0;
			if (on !== powered) {
				powered = on;
				mesh.geometry = built(on ? 'pad-on' : 'pad-off', (m) => addPad(m, on));
				mesh.material = on ? padOn : padOff;
				light.visible = on;
			}
			if (on) {
				const pulse = 0.5 + 0.5 * Math.sin(frame.time * 4 + phase);
				beamMat.opacity = 0.14 + 0.2 * pulse;
				light.scale.set(0.9 + 0.15 * pulse, 0.9 + 0.15 * pulse, 0.85 + 0.2 * pulse);
			}
		},
		dispose() {
			beamMat.dispose();
			release();
		},
	};
}

/* Ben's saucer. */

export function saucerModel(): THREE.BufferGeometry {
	return built('saucer', (m) => {
		lathe(
			m,
			[
				{ r: 0.5, z: 0.45, colour: trim.stoneDark },
				{ r: 1.05, z: 0.58, colour: 0xa8a8b8 },
				{ r: 1.38, z: 0.74, colour: trim.white },
				{ r: 1.3, z: 0.86, colour: trim.cream },
				{ r: 0.8, z: 1.04, colour: trim.white },
				{ r: 0.64, z: 1.06, colour: trim.cream },
			],
			{ sides: 20, bake: 0.08 },
		);
		lathe(
			m,
			[
				{ r: 0.56, z: 1.04, colour: 0xff5a5a },
				{ r: 0.56, z: 1.4, colour: 0xff7a7a },
				{ r: 0.5, z: 1.44, colour: 0xff8a8a },
			],
			{ sides: 12, bake: 0.12 },
		);
		lathe(
			m,
			[
				{ r: 0.5, z: 1.4, colour: 0x66f8ff },
				{ r: 0.46, z: 1.62, colour: 0x9afcff },
				{ r: 0.3, z: 1.84, colour: 0xc8ffff },
				{ r: 0, z: 1.94, colour: trim.white },
			],
			{ sides: 14, bake: 0.14 },
		);
		for (let i = 0; i < 4; i++) {
			const a = (i / 4) * Math.PI * 2 + 0.4;
			slab(
				m,
				[Math.cos(a) * 0.57 - 0.08, Math.sin(a) * 0.57 - 0.08, 1.14],
				[Math.cos(a) * 0.57 + 0.08, Math.sin(a) * 0.57 + 0.08, 1.3],
				trim.chocolate,
				1,
			);
		}
		for (let i = 0; i < 12; i++) {
			const a = (i / 12) * Math.PI * 2;
			slab(
				m,
				[Math.cos(a) * 1.3 - 0.06, Math.sin(a) * 1.3 - 0.06, 0.8],
				[Math.cos(a) * 1.3 + 0.06, Math.sin(a) * 1.3 + 0.06, 0.9],
				i % 2 ? trim.yellow : 0xffffff,
				1,
			);
		}
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2 + Math.PI / 2,
				x = Math.cos(a) * 0.82,
				y = Math.sin(a) * 0.82;
			lathe(
				m,
				[
					{ r: 0.07, z: 0, colour: trim.stoneDark },
					{ r: 0.05, z: 0.62, colour: trim.stone },
				],
				{ sides: 5, cx: x, cy: y },
			);
			lathe(
				m,
				[
					{ r: 0.2, z: 0, colour: trim.stoneDark },
					{ r: 0.16, z: 0.06, colour: trim.stone },
					{ r: 0.1, z: 0.07, colour: trim.stone },
				],
				{ sides: 8, cx: x, cy: y },
			);
		}
		lathe(
			m,
			[
				{ r: 0.03, z: 1.9, colour: trim.stone },
				{ r: 0.03, z: 2.3, colour: trim.stone },
			],
			{ sides: 4 },
		);
	});
}

/** The saucer's beacon, which blinks on its aerial. */
export function saucerExtra(): Extra {
	const geometry = built('saucerBeacon', (m) =>
			lathe(
				m,
				[
					{ r: 0, z: 2.3, colour: trim.red },
					{ r: 0.09, z: 2.38, colour: trim.red },
					{ r: 0, z: 2.48, colour: 0xff8a8a },
				],
				{ sides: 6 },
			),
		),
		mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
	return {
		object: mesh,
		update(frame) {
			mesh.visible = Math.sin(frame.time * 3) > 0.2;
		},
		dispose() {
			(mesh.material as THREE.Material).dispose();
		},
	};
}

/* Signposts. */

export function signModel(): THREE.BufferGeometry {
	return built('sign', (m) => {
		lathe(
			m,
			[
				{ r: 0.08, z: 0, colour: trim.woodDark },
				{ r: 0.06, z: 1.0, colour: trim.wood },
			],
			{ sides: 6 },
		);
		slab(
			m,
			[-0.42, -0.08, 0.7],
			[0.42, 0.03, 1.2],
			{ top: trim.woodDark, front: trim.yellow, side: trim.wood },
			1,
		);
		slab(m, [-0.42, -0.08, 0.7], [0.42, -0.07, 0.73], trim.woodDark, 1);
		slab(m, [-0.42, -0.08, 1.17], [0.42, -0.07, 1.2], trim.woodDark, 1);
		for (let row = 0; row < 2; row++)
			for (let i = 0; i < 5; i++) {
				const x = -0.28 + i * 0.14,
					z = 0.8 + row * 0.19;
				slab(m, [x - 0.04, -0.09, z], [x + 0.04, -0.075, z + 0.08], trim.black, 1);
			}
	});
}

/* The fountain. */

export function fountainModel(): THREE.BufferGeometry {
	return built('fountain', (m) => {
		lathe(
			m,
			[
				{ r: 0.98, z: 0, colour: trim.stoneDark },
				{ r: 1.0, z: 0.14, colour: trim.stone },
				{ r: 1.0, z: 0.34, colour: trim.stoneLight },
				{ r: 0.86, z: 0.36, colour: trim.stoneLight },
				{ r: 0.84, z: 0.2, colour: trim.stoneDark },
			],
			{ sides: 14, bake: 0.12 },
		);
		disc(m, 0, 0, 0.3, 0.86, 0x4ec4ff, 20);
		lathe(
			m,
			[
				{ r: 0.2, z: 0.2, colour: trim.woodDark },
				{ r: 0.14, z: 0.8, colour: trim.wood },
			],
			{ sides: 8 },
		);
		lathe(
			m,
			[
				{ r: 0.12, z: 0.76, colour: trim.woodDark },
				{ r: 0.5, z: 0.86, colour: trim.wood },
				{ r: 0.5, z: 0.98, colour: trim.stoneLight },
				{ r: 0.4, z: 0.98, colour: trim.stoneDark },
			],
			{ sides: 12 },
		);
		disc(m, 0, 0, 1.0, 0.4, 0x8adcff, 14);
	});
}

const droplets = 22;
let dropGeometry: THREE.BufferGeometry | null = null;

/** The fountain's jet: drops that rise from the bowl, fall into the basin and shrink as they go. */
export function fountainExtra(): Extra {
	const spray = new THREE.InstancedMesh(
		(dropGeometry ??= new THREE.OctahedronGeometry(0.06, 0)),
		new THREE.MeshBasicMaterial({ color: 0xc8f0ff }),
		droplets,
	);
	spray.frustumCulled = false;
	return {
		object: spray,
		update(frame) {
			for (let i = 0; i < droplets; i++) {
				const t = (frame.time * 0.8 + i / droplets) % 1,
					a = i * 2.4,
					r = 0.05 + 0.5 * t,
					z = 1.0 + 1.35 * 4 * t * (1 - t) - 0.7 * t * t;
				scratch.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
				scratch.scale.setScalar(0.7 + 0.5 * (1 - t));
				scratch.updateMatrix();
				spray.setMatrixAt(i, scratch.matrix);
			}
			spray.instanceMatrix.needsUpdate = true;
		},
		dispose() {
			(spray.material as THREE.Material).dispose();
			spray.dispose();
		},
	};
}
