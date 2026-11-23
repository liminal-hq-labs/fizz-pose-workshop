// A rock face built of small stones: courses and joints laid out in world space, so the stones run on across neighbouring tiles.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { lattice } from './hash.ts';
import { type Mesher, mix, shade } from './mesher.ts';
import { palette } from './palette.ts';
import { clipPolygon, flatPolygon, pad, type FaceMap, type Point } from './relief.ts';

/** The tallest a stone stands out of the joints between stones: the relief the faces keep to. */
export const stoneRelief = 0.036;
/** How far each edge of a stone stands in from its joint, so a joint is twice this wide. */
const gap = 0.011;
/** How wide a stone's bevel is. */
const bevel = 0.018;
/** The mean height of a course of stones, in tiles; each course differs from it by up to a quarter. */
const courseHeight = 0.32;
const courseJitter = 0.5;
/** The mean widths a course of stones may have, in tiles. */
const stoneWidths = [0.32, 0.4, 0.48] as const;
const jointJitter = 0.5;
/** The share of joints that are left out, so now and then a stone is twice as long. */
const merged = 0.15;

/** The height of the line between course `m` and the one below it, in world space; the same for every face. */
export function courseLine(m: number): number {
	return (m + (lattice(m, 0, 201) - 0.5) * courseJitter) * courseHeight;
}

function mod(a: number, n: number): number {
	return ((a % n) + n) % n;
}

/** The spacing of the joints of a course on a face. */
function spacingOf(course: number, face: number): number {
	return stoneWidths[Math.floor(lattice(course, 1, 205 + face) * stoneWidths.length)];
}

function jointAt(k: number, course: number, face: number, spacing: number): number {
	return (k + (lattice(k, course, 210 + face) - 0.5) * jointJitter) * spacing;
}

/** Every third joint is always there, so a stone is never more than three spacings long and a walk along a course can start at one. */
function jointKept(k: number, course: number, face: number): boolean {
	return mod(k, 3) === 0 || lattice(k, course, 215 + face) >= merged;
}

/** The colour of a stone: mostly the crater's purples, now and then a pinker or a bluer one. */
export function stoneColour(a: number, b: number, face: number): number {
	const r = lattice(a, b, 220 + face),
		luck = lattice(a, b, 225 + face),
		base =
			r < 0.34
				? palette.rock
				: r < 0.64
					? shade(palette.rockDark, 1.0)
					: r < 0.8
						? shade(palette.rockLight, 0.96)
						: r < 0.88
							? palette.rock
							: r < 0.95
								? mix(palette.rock, palette.rockPink, 0.28)
								: mix(palette.rockDark, palette.rockNavy, 0.35);
	return shade(base, 0.92 + luck * 0.16);
}

/** A part of a flat face to cover with stones. */
export interface FaceSpec {
	map: FaceMap;
	/** The face's width runs from `u0` to `u1`; it starts at `v0` and runs up to a straight line that is `t0` at `u0` and `t1` at `u1`. */
	u0: number;
	u1: number;
	v0: number;
	t0: number;
	t1: number;
	/** Where the face's (0, 0) is in world space, so stones and courses are the same on every tile that shows them. */
	originU: number;
	originV: number;
	/** Which face of a tile this is; each has its own joints, and the courses line up between them. */
	face: number;
	/** The colour of the joints between stones, and how a stone's colour is lit and shadowed at a point of the face. */
	joint: number;
	tone: (colour: number, u: number, v: number) => number;
	/** The colour of the stone at a place in the wall; the crater's rock when absent. */
	colour?: (a: number, b: number, face: number) => number;
	/** How much of a stone's edge is bevelled: `lit` only its top and left, which catch the light; `flat` none, for far rock. */
	bevelled: 'lit' | 'flat';
}

function line(f: FaceSpec): (u: number) => number {
	const slope = (f.t1 - f.t0) / (f.u1 - f.u0);
	return (u) => f.t0 + slope * (u - f.u0);
}

/**
 * Covers a face with small stones in irregular courses, over a dark joint colour. Courses are 0.15 to 0.45 tall and stones
 * 0.15 to 0.65 long, now and then twice that. A stone cut by the edge of the face runs on flush to it, so the next tile
 * carries it on; where the top edge is a slope, the stones cut by it are left flat.
 */
export function rockFace(m: Mesher, f: FaceSpec): void {
	const top = line(f),
		tMax = Math.max(f.t0, f.t1),
		flat = Math.abs(f.t1 - f.t0) < 1e-9;
	if (tMax <= f.v0 + 1e-6) return;
	const edge = clipPolygon(
		[
			[f.u0, f.v0],
			[f.u1, f.v0],
			[f.u1, tMax],
			[f.u0, tMax],
		],
		(f.t1 - f.t0) / (f.u1 - f.u0),
		-1,
		f.t0 - ((f.t1 - f.t0) / (f.u1 - f.u0)) * f.u0,
	);
	if (edge.length < 3) return;
	flatPolygon(m, f.map, edge, 0, (u, v) => f.tone(f.joint, u, v));
	const worldLow = f.v0 + f.originV,
		worldHigh = tMax + f.originV,
		first = Math.floor(worldLow / courseHeight) - 2,
		last = Math.ceil(worldHigh / courseHeight) + 2;
	for (let course = first; course <= last; course++) {
		const ya = courseLine(course) - f.originV,
			yb = courseLine(course + 1) - f.originV;
		if (yb <= f.v0 + 1e-9 || ya >= tMax - 1e-9) continue;
		const spacing = spacingOf(course, f.face),
			worldA = f.u0 + f.originU,
			worldB = f.u1 + f.originU;
		let k = Math.floor(worldA / spacing) - 1;
		k -= mod(k, 3);
		let from = jointAt(k, course, f.face, spacing),
			fromK = k;
		for (k++; from < worldB; k++) {
			if (!jointKept(k, course, f.face)) continue;
			const to = jointAt(k, course, f.face, spacing);
			if (to > worldA)
				stone(m, f, top, flat, course, fromK, from - f.originU, to - f.originU, ya, yb);
			from = to;
			fromK = k;
		}
	}
}

/** One stone, whose whole extent is from `xa` to `xb` and `ya` to `yb` on the face, cut to what the face shows. */
function stone(
	m: Mesher,
	f: FaceSpec,
	top: (u: number) => number,
	flat: boolean,
	course: number,
	jointIndex: number,
	xa: number,
	xb: number,
	ya: number,
	yb: number,
): void {
	const a = Math.max(xa, f.u0),
		b = Math.min(xb, f.u1),
		low = Math.max(ya, f.v0),
		flushL = xa < f.u0 - 1e-9,
		flushR = xb > f.u1 + 1e-9,
		flushB = ya < f.v0 - 1e-9;
	let high = yb,
		flushT = false;
	if (flat && yb > f.t0 + 1e-9) {
		high = f.t0;
		flushT = true;
	}
	if (b - a < 1e-4 || high - low < 1e-4) return;
	const base = (f.colour ?? stoneColour)(jointIndex, course, f.face),
		relief = stoneRelief * (0.3 + 0.7 * lattice(jointIndex, course, 230 + f.face)),
		mid = (a + b) / 2,
		fits = flat || (yb <= top(a) + 1e-9 && yb <= top(b) + 1e-9);
	if (fits && xb - xa >= 0.07 && yb - ya >= 0.07) {
		const g = f.bevelled === 'lit' ? gap : 0.008,
			lit = f.bevelled === 'lit' ? bevel : 0,
			side = (flush: boolean, v: number): number => (flush ? 0 : v);
		pad(
			m,
			f.map,
			{ u0: a, v0: low, u1: b, v1: high },
			{
				gap: [side(flushL, g), side(flushR, g), side(flushB, g), side(flushT, g)],
				bevel: [side(flushL, lit), 0, 0, side(flushT, lit)],
				w0: 0.003,
				w1: relief,
				foot: f.tone(shade(base, 0.86), mid, low),
				crown: f.tone(shade(base, 1.1), mid, high),
				edges: {
					left: f.tone(shade(base, 1.14), mid, (low + high) / 2),
					right: f.tone(shade(base, 0.66), mid, (low + high) / 2),
					bottom: f.tone(shade(base, 0.5), mid, low),
					top: f.tone(shade(base, 1.28), mid, high),
				},
			},
		);
		return;
	}
	/* A stone the top edge cuts through, or a sliver: a flat polygon in the stone's colour, cut to the edge. */
	const inL = flushL ? 0 : gap,
		inR = flushR ? 0 : gap,
		inB = flushB ? 0 : gap;
	if (b - inR - (a + inL) < 1e-3 || high - (low + inB) < 1e-3) return;
	let shape: Point[] = [
		[a + inL, low + inB],
		[b - inR, low + inB],
		[b - inR, high],
		[a + inL, high],
	];
	if (!flat) {
		const slope = (f.t1 - f.t0) / (f.u1 - f.u0);
		shape = clipPolygon(shape, slope, -1, f.t0 - slope * f.u0);
	}
	if (shape.length < 3) return;
	const span = Math.max(1e-6, yb - ya);
	flatPolygon(m, f.map, shape, relief * 0.5, (u, v) =>
		f.tone(shade(base, 0.86 + 0.24 * Math.min(1, Math.max(0, (v - ya) / span))), u, v),
	);
}
