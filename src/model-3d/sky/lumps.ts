// Soft rounded lumps for clouds: low-poly ellipsoids that merge into a mesher, coloured by height and by how far they face up.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mesher } from '../crater/mesher.ts';

const unit = new Map<number, Float32Array>();

/** The corners of an icosphere of radius 1, three to a triangle, anticlockwise from outside. */
function sphere(detail: number): Float32Array {
	let corners = unit.get(detail);
	if (!corners) {
		const geometry = new THREE.IcosahedronGeometry(1, detail);
		corners = Float32Array.from(geometry.getAttribute('position').array);
		geometry.dispose();
		unit.set(detail, corners);
	}
	return corners;
}

/** How a lump is painted: from a vertex's height in the lump (0 at its foot, 1 at its crown) and how far its normal points up (-1 down, 1 up). */
export type LumpColour = (height: number, up: number) => number;

/**
 * An ellipsoid centred at (cx, cy, cz). Its foot may be cut flat: `flat` is the share of its height, from the bottom, that
 * is pressed up into a plane, so a cloud can have a level base; `capTop` does the same from the top and leaves out the
 * flat it makes, so a puff can hang from a surface. `detail` is the icosphere's subdivision.
 */
export function lump(
	m: Mesher,
	centre: readonly [number, number, number],
	radii: readonly [number, number, number],
	colour: LumpColour,
	options: { detail?: number; flat?: number; capTop?: number } = {},
): void {
	const corners = sphere(options.detail ?? 1),
		flat = options.flat ?? 0,
		[cx, cy, cz] = centre,
		[rx, ry, rz] = radii,
		floor = -1 + 2 * flat,
		ceiling = 1 - 2 * (options.capTop ?? 0);
	for (let i = 0; i < corners.length; i += 9) {
		const points: [number, number, number][] = [],
			colours: number[] = [];
		for (let k = 0; k < 3; k++) {
			const x = corners[i + k * 3],
				y = corners[i + k * 3 + 1],
				z = corners[i + k * 3 + 2],
				yy = Math.min(ceiling, Math.max(y, floor));
			points.push([cx + x * rx, cy + yy * ry, cz + z * rz]);
			colours.push(colour((yy + 1) / 2, y));
		}
		if (options.capTop && points.every((p) => p[1] >= cy + ceiling * ry - 1e-9)) continue;
		m.triC(points[0], points[1], points[2], colours[0], colours[1], colours[2]);
	}
}

/**
 * Rounds off the shading of a built geometry: vertices that share a place and a colour share a normal, so lumps look soft
 * instead of faceted. The result has no index, so it merges into a batch like any other tile geometry.
 */
export function softened(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
	geometry.deleteAttribute('normal');
	const merged = mergeVertices(geometry, 1e-4);
	merged.computeVertexNormals();
	const out = merged.toNonIndexed();
	out.computeBoundingSphere();
	geometry.dispose();
	merged.dispose();
	return out;
}
