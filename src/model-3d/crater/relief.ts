// Small relief shapes for the terrain's masonry: raised pads with bevelled edges, and flat polygons, on any flat face of a tile.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Mesher, V3 } from './mesher.ts';

/**
 * Places a point of a flat face in the tile. `u` runs to the viewer's right as they face the face, `v` runs up it and `w` runs
 * out of it, so a quadrilateral taken anticlockwise in (u, v) is anticlockwise seen from outside.
 */
export type FaceMap = (u: number, v: number, w: number) => V3;

/** A rectangle on a face. */
export interface Rect {
	u0: number;
	v0: number;
	u1: number;
	v1: number;
}

/** A value for each side of a pad: left, right, bottom, top. */
export type Sides = readonly [number, number, number, number];

/** The colours of a pad's four bevelled edges. */
export interface EdgeColours {
	left: number;
	right: number;
	bottom: number;
	top: number;
}

/** How a pad looks: its gaps and bevels, its heights above the face and its colours. */
export interface PadStyle {
	/** How far each edge of the pad stands in from the rectangle. */
	gap: Sides;
	/** How wide each bevel is; zero leaves the edge square, which is how a pad joins a neighbour on the next tile. */
	bevel: Sides;
	/** The height of the pad's outer edge, and of its flat front, above the face's `w` = 0. */
	w0: number;
	w1: number;
	/** The flat front's colour at its foot and at its top. */
	foot: number;
	crown: number;
	edges: EdgeColours;
}

/** The share of a pad's width or height that its bevels may use up, so a small pad keeps a flat front. */
const bevelShare = 0.3;

/**
 * A raised pad: a flat front with a bevel round each edge that has one, sloping down to the face. Edges with no gap and no
 * bevel run flush to the rectangle, so a pad cut by the edge of a tile carries on into the next one without a seam.
 */
export function pad(m: Mesher, map: FaceMap, rect: Rect, style: PadStyle): void {
	const [gl, gr, gb, gt] = style.gap,
		ou0 = rect.u0 + gl,
		ou1 = rect.u1 - gr,
		ov0 = rect.v0 + gb,
		ov1 = rect.v1 - gt,
		width = ou1 - ou0,
		height = ov1 - ov0;
	if (width < 1e-4 || height < 1e-4) return;
	const [bl, br, bb, bt] = style.bevel,
		iu0 = ou0 + Math.min(bl, width * bevelShare),
		iu1 = ou1 - Math.min(br, width * bevelShare),
		iv0 = ov0 + Math.min(bb, height * bevelShare),
		iv1 = ov1 - Math.min(bt, height * bevelShare),
		o = (u: number, v: number): V3 => map(u, v, style.w0),
		i = (u: number, v: number): V3 => map(u, v, style.w1),
		{ edges } = style;
	if (iv0 - ov0 > 1e-9) m.quad(o(ou0, ov0), o(ou1, ov0), i(iu1, iv0), i(iu0, iv0), edges.bottom);
	if (ov1 - iv1 > 1e-9) m.quad(i(iu0, iv1), i(iu1, iv1), o(ou1, ov1), o(ou0, ov1), edges.top);
	if (iu0 - ou0 > 1e-9) m.quad(o(ou0, ov0), i(iu0, iv0), i(iu0, iv1), o(ou0, ov1), edges.left);
	if (ou1 - iu1 > 1e-9) m.quad(i(iu1, iv0), o(ou1, ov0), o(ou1, ov1), i(iu1, iv1), edges.right);
	m.quadC(
		i(iu0, iv0),
		i(iu1, iv0),
		i(iu1, iv1),
		i(iu0, iv1),
		style.foot,
		style.foot,
		style.crown,
		style.crown,
	);
}

/** A point of a face in (u, v). */
export type Point = readonly [number, number];

/**
 * Cuts a convex polygon to the side of the line `a * u + b * v + c = 0` where the expression is not negative. The polygon
 * keeps its direction round.
 */
export function clipPolygon(polygon: readonly Point[], a: number, b: number, c: number): Point[] {
	const out: Point[] = [],
		side = (p: Point): number => a * p[0] + b * p[1] + c;
	for (let k = 0; k < polygon.length; k++) {
		const p = polygon[k],
			q = polygon[(k + 1) % polygon.length],
			sp = side(p),
			sq = side(q);
		if (sp >= 0) out.push(p);
		if (sp >= 0 !== sq >= 0) {
			const t = sp / (sp - sq);
			out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
		}
	}
	return out;
}

/** A flat convex polygon on a face at height `w`, coloured at each corner by `colourAt`. */
export function flatPolygon(
	m: Mesher,
	map: FaceMap,
	polygon: readonly Point[],
	w: number,
	colourAt: (u: number, v: number) => number,
): void {
	for (let k = 1; k + 1 < polygon.length; k++) {
		const a = polygon[0],
			b = polygon[k],
			c = polygon[k + 1];
		m.triC(
			map(a[0], a[1], w),
			map(b[0], b[1], w),
			map(c[0], c[1], w),
			colourAt(a[0], a[1]),
			colourAt(b[0], b[1]),
			colourAt(c[0], c[1]),
		);
	}
}
