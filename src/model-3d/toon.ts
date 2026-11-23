// Shared cartoon look for level models: toon materials on Ben's ramp, an ink outline, and the level's depth layout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { toonRamp } from './ben-g/shared.ts';

/**
 * How the side-on level is laid out in depth. One tile is one unit. The sim's X and Y are the scene's X and Y; Z is depth,
 * positive towards the camera. Characters and pickups stand on the plane Z = 0.
 */
export const depth = {
	/** Terrain runs from `-lane / 2` to `lane / 2` in Z, so characters stand in the middle of a strip of ground. */
	lane: 1.75,
	/** How deep floating ledges and blocks are, centred on Z = 0: shallower than the ground, so they read as platforms. */
	shelf: 0.8,
	/** The nearest the backdrop may come; everything behind the level sits at or beyond this Z. */
	backdrop: -7,
} as const;

const toonCache = new Map<string, THREE.MeshToonMaterial>();

/** A flat-shaded cartoon material in the same two-step ramp as Ben. Materials are shared: do not mutate one. */
export function toon(
	colour: number,
	options: { emissive?: number; opacity?: number } = {},
): THREE.MeshToonMaterial {
	const key = `${colour}|${options.emissive ?? 0}|${options.opacity ?? 1}`;
	let material = toonCache.get(key);
	if (!material) {
		material = new THREE.MeshToonMaterial({
			color: colour,
			gradientMap: toonRamp,
			emissive: options.emissive ?? 0,
			transparent: (options.opacity ?? 1) < 1,
			opacity: options.opacity ?? 1,
		});
		toonCache.set(key, material);
	}
	return material;
}

const inkCache = new Map<number, THREE.MeshBasicMaterial>();

/** The ink material for an outline `width` units thick: a back-facing shell pushed out along the normals. */
function ink(width: number): THREE.MeshBasicMaterial {
	let material = inkCache.get(width);
	if (!material) {
		material = new THREE.MeshBasicMaterial({ color: 0x0a0a12, side: THREE.BackSide });
		material.onBeforeCompile = (shader) => {
			shader.vertexShader = shader.vertexShader.replace(
				'#include <begin_vertex>',
				`vec3 transformed = position + normalize(normal) * ${width.toFixed(4)};`,
			);
		};
		material.customProgramCacheKey = () => `ink-${width}`;
		inkCache.set(width, material);
	}
	return material;
}

/**
 * A mesh with a black outline, like Ben's. The outline is a child that shares the geometry, so it follows the mesh. It
 * needs smooth normals; on a hard-edged box the shell splits at the corners, so bevel or merge the vertices first.
 */
export function inked(
	geometry: THREE.BufferGeometry,
	material: THREE.Material,
	width = 0.035,
): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, material),
		shell = new THREE.Mesh(geometry, ink(width));
	shell.userData.ink = true;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.add(shell);
	return mesh;
}
