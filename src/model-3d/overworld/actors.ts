// What the overworld's models share: materials for lit and glowing parts, shared geometry building, and the moving parts of batched models.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { FrameContext } from '../../level-3d/types.ts';
import { toonRamp } from '../ben-g/shared.ts';
import { Mesher } from '../crater/mesher.ts';
import { standingMaterial } from './batch.ts';

/** Lit glass: translucent, with the toon shading of everything else. */
export const glazeMaterial = new THREE.MeshToonMaterial({
	vertexColors: true,
	gradientMap: toonRamp,
	transparent: true,
	opacity: 0.6,
	depthWrite: false,
});

/**
 * The moving part of a batched model: a mesh or group that the set places once and updates every frame. The batch holds
 * the still parts of buildings and landmarks in its chunks, so what moves is kept apart.
 */
export interface Extra {
	object: THREE.Object3D;
	update(frame: FrameContext): void;
	dispose(): void;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** Builds a geometry once for a key; every model of the kind shares it. */
export function built(key: string, build: (m: Mesher) => void): THREE.BufferGeometry {
	let geometry = cache.get(key);
	if (!geometry) {
		const m = new Mesher();
		build(m);
		cache.set(key, (geometry = m.build()));
	}
	return geometry;
}

/** A solid mesh that casts and receives shadows. */
export function solidMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
	const mesh = new THREE.Mesh(geometry, standingMaterial);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

/** One draw call for several copies of a solid shape that move on their own. */
export function instancedParts(geometry: THREE.BufferGeometry, count: number): THREE.InstancedMesh {
	const mesh = new THREE.InstancedMesh(geometry, standingMaterial, count);
	mesh.frustumCulled = false;
	mesh.castShadow = false;
	mesh.receiveShadow = false;
	return mesh;
}

/** The centre of the tile a sprite stands on, for sprites drawn with their base on the tile's south edge. */
export function tileCentre(draw: { x: number; y: number; h: number }): { x: number; y: number } {
	return { x: Math.floor(draw.x) + 0.5, y: Math.round(draw.y - draw.h / 2) + 0.5 };
}

/** A scratch object for setting instance matrices without allocating. */
export const scratch = new THREE.Object3D();
