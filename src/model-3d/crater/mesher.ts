// A tiny flat-shaded mesh builder with per-triangle colours, used to model terrain without image textures.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';

export type V3 = readonly [number, number, number];

/** A colour for each face of a box; a plain number colours all of them. */
export interface BoxColours {
	top: number;
	front: number;
	side: number;
}

/** Which faces of a box to build. Hidden faces are left out to save triangles. */
export interface BoxFaces {
	front?: boolean;
	back?: boolean;
	left?: boolean;
	right?: boolean;
	top?: boolean;
	bottom?: boolean;
}

const scratch = new THREE.Color();

/** Multiplies a hex colour by a brightness factor. */
export function shade(hex: number, factor: number): number {
	const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor)),
		g = Math.min(255, Math.round(((hex >> 8) & 255) * factor)),
		b = Math.min(255, Math.round((hex & 255) * factor));
	return (r << 16) | (g << 8) | b;
}

/** Blends two hex colours; `t` of 0 is `a` and 1 is `b`. */
export function mix(a: number, b: number, t: number): number {
	const ch = (shift: number): number =>
		Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
	return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Collects triangles and builds one non-indexed geometry with vertex colours. Winding is anticlockwise seen from outside,
 * so `computeVertexNormals` gives flat faces.
 */
export class Mesher {
	readonly positions: number[] = [];
	readonly colours: number[] = [];

	tri(a: V3, b: V3, c: V3, colour: number): this {
		scratch.setHex(colour);
		for (const p of [a, b, c]) {
			this.positions.push(p[0], p[1], p[2]);
			this.colours.push(scratch.r, scratch.g, scratch.b);
		}
		return this;
	}

	quad(a: V3, b: V3, c: V3, d: V3, colour: number): this {
		return this.tri(a, b, c, colour).tri(a, c, d, colour);
	}

	/** A triangle with a colour at each corner, which blend across it. */
	triC(a: V3, b: V3, c: V3, ca: number, cb: number, cc: number): this {
		const corners: [V3, number][] = [
			[a, ca],
			[b, cb],
			[c, cc],
		];
		for (const [p, colour] of corners) {
			scratch.setHex(colour);
			this.positions.push(p[0], p[1], p[2]);
			this.colours.push(scratch.r, scratch.g, scratch.b);
		}
		return this;
	}

	/** A quadrilateral with a colour at each corner, in the order of its points. */
	quadC(a: V3, b: V3, c: V3, d: V3, ca: number, cb: number, cc: number, cd: number): this {
		return this.triC(a, b, c, ca, cb, cc).triC(a, c, d, ca, cc, cd);
	}

	/** An axis-aligned box. Colours may differ per face group. */
	box(
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
		colour: number | BoxColours,
		faces: BoxFaces = {},
	): this {
		const c: BoxColours =
				typeof colour === 'number' ? { top: colour, front: colour, side: colour } : colour,
			on = (flag: boolean | undefined): boolean => flag !== false;
		if (on(faces.front)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c.front);
		if (on(faces.back)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c.side);
		if (on(faces.left)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c.side);
		if (on(faces.right)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c.side);
		if (on(faces.top)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], c.top);
		if (on(faces.bottom)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c.side);
		return this;
	}

	/**
	 * A pyramid over a quadrilateral base. The base runs anticlockwise seen from the apex; its own face is not built. Each
	 * side takes the next colour in `colours`.
	 */
	pyramid(base: readonly [V3, V3, V3, V3], apex: V3, colours: readonly number[]): this {
		for (let i = 0; i < 4; i++)
			this.tri(base[i], base[(i + 1) % 4], apex, colours[i % colours.length]);
		return this;
	}

	build(): THREE.BufferGeometry {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		return geometry;
	}
}
