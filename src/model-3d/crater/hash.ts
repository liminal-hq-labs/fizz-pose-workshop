// Deterministic hashing and value noise for placing terrain details, so the same tile always looks the same.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A hash of three integers, uniform in [0, 1). */
export function lattice(a: number, b: number, salt = 0): number {
	let h =
		Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
	h ^= h >>> 15;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** A hash of a tile position (tile centres sit on half tiles), uniform in [0, 1). */
export function tileHash(x: number, y: number, salt = 0): number {
	return lattice(Math.round(x * 2), Math.round(y * 2), salt);
}

/** A small seeded generator (mulberry32) returning numbers in [0, 1). */
export function rng(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Smooth value noise in [0, 1) over the plane. */
export function noise2(x: number, y: number, salt = 0): number {
	const ix = Math.floor(x),
		iy = Math.floor(y),
		fx = x - ix,
		fy = y - iy,
		sx = fx * fx * (3 - 2 * fx),
		sy = fy * fy * (3 - 2 * fy),
		a = lattice(ix, iy, salt),
		b = lattice(ix + 1, iy, salt),
		c = lattice(ix, iy + 1, salt),
		d = lattice(ix + 1, iy + 1, salt);
	return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
