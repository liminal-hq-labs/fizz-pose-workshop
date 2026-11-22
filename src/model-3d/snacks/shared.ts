// Shared building blocks for the snack, key and effect models: cached geometry, glow and sparkle sprites, and phases.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The EGA candy colours the snacks are painted in. */
export const candy = {
	black: 0x0a0a12,
	white: 0xffffff,
	grey: 0xaaaaaa,
	yellow: 0xffff55,
	brown: 0xaa5500,
	red: 0xff5555,
	darkRed: 0xaa0000,
	blue: 0x5555ff,
	darkBlue: 0x0000aa,
	green: 0x55ff55,
	darkGreen: 0x00aa00,
	cyan: 0x55ffff,
} as const;

const ellipsoids = new Map<string, THREE.BufferGeometry>();

/** A shared ellipsoid with the given radii. The scaling is baked in so ink outlines keep an even thickness. */
export function ellipsoid(rx: number, ry: number, rz: number): THREE.BufferGeometry {
	const key = `${rx}|${ry}|${rz}`;
	let geometry = ellipsoids.get(key);
	if (!geometry) {
		geometry = new THREE.SphereGeometry(1, 28, 18);
		geometry.scale(rx, ry, rz);
		ellipsoids.set(key, geometry);
	}
	return geometry;
}

/** A surface of revolution about Y through `profile` points `[radius, height]`, listed from the bottom up. */
export function lathe(
	profile: readonly (readonly [number, number])[],
	segments = 32,
): THREE.BufferGeometry {
	return new THREE.LatheGeometry(
		profile.map(([r, y]) => new THREE.Vector2(r, y)),
		segments,
	);
}

/** Merges ellipsoids placed at `spots` (`[x, y, z, rx, ry, rz]`) into one geometry, so a speckled surface costs one draw. */
export function scatter(
	spots: readonly (readonly [number, number, number, number, number, number])[],
): THREE.BufferGeometry {
	const parts = spots.map(([x, y, z, rx, ry, rz]) => {
		const geometry = new THREE.SphereGeometry(1, 10, 8);
		geometry.scale(rx, ry, rz);
		geometry.translate(x, y, z);
		return geometry;
	});
	const merged = mergeGeometries(parts);
	for (const part of parts) part.dispose();
	return merged;
}

export function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}

/** Moves `current` towards `target`, frame-rate independently. A zero `dt` leaves it where it is. */
export function ease(current: number, target: number, rate: number, dt: number): number {
	return dt > 0 ? current + (target - current) * (1 - Math.exp(-rate * dt)) : current;
}

/** A repeatable phase in `[0, 2 pi)` from a sprite's position, so neighbours in a row turn and shine a little apart. */
export function phaseOf(x: number, y: number): number {
	const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
	const along = x * 0.55 + (s - Math.floor(s)) * 0.5;
	return ((along % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/** A soft round glow: opaque in the middle and fading smoothly to nothing at the edge. */
let glowMap: THREE.DataTexture | null = null;
function glowTexture(): THREE.DataTexture {
	if (!glowMap) {
		const size = 64,
			data = new Uint8Array(size * size * 4);
		for (let j = 0; j < size; j++)
			for (let i = 0; i < size; i++) {
				const d = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2,
					a = clamp(1 - d, 0, 1),
					v = Math.round(255 * a * a * (3 - 2 * a)),
					at = (j * size + i) * 4;
				data[at] = data[at + 1] = data[at + 2] = 255;
				data[at + 3] = v;
			}
		glowMap = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
		glowMap.magFilter = glowMap.minFilter = THREE.LinearFilter;
		glowMap.colorSpace = THREE.SRGBColorSpace;
		glowMap.needsUpdate = true;
	}
	return glowMap;
}

let glowPlane: THREE.PlaneGeometry | null = null;
const glows = new Map<string, THREE.MeshBasicMaterial>();

/** A unit square for a glow halo; scale it to the halo's width. */
export function glowGeometry(): THREE.PlaneGeometry {
	glowPlane ??= new THREE.PlaneGeometry(1, 1);
	return glowPlane;
}

/** A shared additive material that paints the soft round glow in `colour` at the given strength. */
export function glowMaterial(colour: number, strength: number): THREE.MeshBasicMaterial {
	const key = `${colour}|${strength}`;
	let material = glows.get(key);
	if (!material) {
		material = new THREE.MeshBasicMaterial({
			map: glowTexture(),
			color: colour,
			transparent: true,
			opacity: strength,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
		glows.set(key, material);
	}
	return material;
}

let sparkleShape: THREE.ShapeGeometry | null = null;

/** A four-pointed twinkle one unit from tip to tip, facing +Z. */
export function sparkleGeometry(): THREE.ShapeGeometry {
	if (!sparkleShape) {
		const shape = new THREE.Shape(),
			points = 8;
		for (let i = 0; i < points; i++) {
			const a = (i / points) * Math.PI * 2 + Math.PI / 2,
				r = i % 2 === 0 ? 0.5 : 0.1;
			if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
			else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
		}
		shape.closePath();
		sparkleShape = new THREE.ShapeGeometry(shape);
	}
	return sparkleShape;
}

const sparkles = new Map<string, THREE.MeshBasicMaterial>();

/** A shared flat material for twinkles, optionally additive so they brighten what is behind them. */
export function sparkleMaterial(colour: number, additive: boolean): THREE.MeshBasicMaterial {
	const key = `${colour}|${additive}`;
	let material = sparkles.get(key);
	if (!material) {
		material = new THREE.MeshBasicMaterial({
			color: colour,
			side: THREE.DoubleSide,
			transparent: additive,
			blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
			depthWrite: !additive,
		});
		sparkles.set(key, material);
	}
	return material;
}

/** Multiplies each channel of `colour` by `k`, for a darker or brighter relative of it. */
export function shade(colour: number, k: number): number {
	const c = (shift: number): number => Math.min(255, Math.round(((colour >> shift) & 255) * k));
	return (c(16) << 16) | (c(8) << 8) | c(0);
}
