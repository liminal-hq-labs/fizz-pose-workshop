// Small solid shapes for the overworld's models, built along +Z on the ground: lathed rings, slabs and gable roofs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type * as THREE from 'three';
import { lattice } from '../crater/hash.ts';
import { Mesher, shade, type V3 } from '../crater/mesher.ts';

/** One ring of a lathed shape: its radius, its height and its colour. */
export interface Ring {
	r: number;
	z: number;
	colour: number;
}

export interface LatheOptions {
	sides?: number;
	cx?: number;
	cy?: number;
	/** Added to every ring's height. */
	z?: number;
	/** Stretches the shape along X and Y. */
	sx?: number;
	sy?: number;
	/** How far each ring vertex may stray from its radius, as a share of it, by a hash of `seed`. */
	jitter?: number;
	seed?: number;
	/** How much the faces away from the sun darken and those towards it lighten. */
	bake?: number;
	/** A brightness factor for each side, for faceted crystals. */
	facet?: (side: number) => number;
	/** Turns the first side, in radians. */
	turn?: number;
}

/** The azimuth the sun's light comes from, for baking a little shade into the faces. */
const sunAzimuth = (3 * Math.PI) / 4;

/** Joins rings from the bottom up into a closed body of `sides` faces; a ring of radius 0 is a point. */
export function lathe(m: Mesher, rings: readonly Ring[], options: LatheOptions = {}): void {
	const sides = options.sides ?? 8,
		cx = options.cx ?? 0,
		cy = options.cy ?? 0,
		z0 = options.z ?? 0,
		sx = options.sx ?? 1,
		sy = options.sy ?? 1,
		jitter = options.jitter ?? 0,
		seed = options.seed ?? 0,
		bake = options.bake ?? 0.1,
		turn = options.turn ?? 0,
		point = (ring: number, side: number): V3 => {
			const r = rings[ring],
				a = turn + ((side % sides) / sides) * Math.PI * 2,
				wobble = jitter ? 1 + (lattice(ring * 31 + side, seed, 7) - 0.5) * 2 * jitter : 1;
			return [cx + Math.cos(a) * r.r * sx * wobble, cy + Math.sin(a) * r.r * sy * wobble, z0 + r.z];
		};
	for (let k = 0; k + 1 < rings.length; k++) {
		const lower = rings[k],
			upper = rings[k + 1];
		for (let i = 0; i < sides; i++) {
			const mid = turn + ((i + 0.5) / sides) * Math.PI * 2,
				light = 1 + bake * Math.cos(mid - sunAzimuth) * 2,
				f = light * (options.facet ? options.facet(i) : 1),
				ca = shade(lower.colour, f),
				cb = shade(upper.colour, f);
			if (lower.r === 0 && upper.r === 0) continue;
			if (upper.r === 0) m.triC(point(k, i), point(k, i + 1), point(k + 1, i), ca, ca, cb);
			else if (lower.r === 0) m.triC(point(k, i), point(k + 1, i + 1), point(k + 1, i), ca, cb, cb);
			else
				m.quadC(point(k, i), point(k, i + 1), point(k + 1, i + 1), point(k + 1, i), ca, ca, cb, cb);
		}
	}
	/* A cap over the top ring when it is not a point, so a flat-topped body is closed. */
	const top = rings.length - 1;
	if (rings[top].r > 0) {
		const centre: V3 = [cx, cy, z0 + rings[top].z],
			colour = shade(rings[top].colour, 1.1);
		for (let i = 0; i < sides; i++) m.tri(point(top, i), point(top, i + 1), centre, colour);
	}
}

export interface SlabColours {
	top: number;
	front: number;
	side: number;
}

/**
 * An axis-aligned block with its top facing up and its front facing south (-Y). `foot` darkens the walls at the bottom
 * edge, so a building sits into the ground.
 */
export function slab(
	m: Mesher,
	[x0, y0, z0]: V3,
	[x1, y1, z1]: V3,
	colour: number | SlabColours,
	foot = 0.8,
): void {
	const c = typeof colour === 'number' ? { top: colour, front: colour, side: colour } : colour,
		low = (hex: number): number => shade(hex, foot);
	m.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], shade(c.top, 1.12));
	m.quadC(
		[x0, y0, z0],
		[x1, y0, z0],
		[x1, y0, z1],
		[x0, y0, z1],
		low(c.front),
		low(c.front),
		c.front,
		c.front,
	);
	m.quadC(
		[x1, y1, z0],
		[x0, y1, z0],
		[x0, y1, z1],
		[x1, y1, z1],
		low(c.side),
		low(c.side),
		c.side,
		c.side,
	);
	m.quadC(
		[x0, y1, z0],
		[x0, y0, z0],
		[x0, y0, z1],
		[x0, y1, z1],
		low(c.side),
		low(c.side),
		c.side,
		c.side,
	);
	m.quadC(
		[x1, y0, z0],
		[x1, y1, z0],
		[x1, y1, z1],
		[x1, y0, z1],
		low(c.side),
		low(c.side),
		c.side,
		c.side,
	);
}

/** A gable roof over a rectangle: the ridge runs along X, and the ends are filled in. */
export function gable(
	m: Mesher,
	[x0, y0, z0]: V3,
	[x1, y1, ridge]: V3,
	colour: number,
	end: number = colour,
	overhang = 0.08,
): void {
	const ym = (y0 + y1) / 2,
		a = x0 - overhang,
		b = x1 + overhang,
		front = y0 - overhang,
		back = y1 + overhang;
	m.quad([a, front, z0], [b, front, z0], [b, ym, ridge], [a, ym, ridge], shade(colour, 0.92));
	m.quad([b, back, z0], [a, back, z0], [a, ym, ridge], [b, ym, ridge], shade(colour, 1.08));
	m.tri([a, back, z0], [a, front, z0], [a, ym, ridge], end);
	m.tri([b, front, z0], [b, back, z0], [b, ym, ridge], end);
}

/** A straight rod from one point to another, tapering from `r0` to `r1`, closed at the far end. */
export function limb(
	m: Mesher,
	a: V3,
	b: V3,
	r0: number,
	r1: number,
	colour: number,
	sides = 4,
): void {
	const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
		length = Math.hypot(d[0], d[1], d[2]) || 1,
		n: V3 = [d[0] / length, d[1] / length, d[2] / length],
		helper: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0],
		cross = (p: V3, q: V3): V3 => [
			p[1] * q[2] - p[2] * q[1],
			p[2] * q[0] - p[0] * q[2],
			p[0] * q[1] - p[1] * q[0],
		],
		u0 = cross(helper, n),
		ul = Math.hypot(u0[0], u0[1], u0[2]) || 1,
		u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul],
		v = cross(n, u),
		ring = (c: V3, r: number, i: number): V3 => {
			const t = (i / sides) * Math.PI * 2;
			return [
				c[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r,
				c[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r,
				c[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r,
			];
		};
	for (let i = 0; i < sides; i++) {
		const f = 0.85 + 0.3 * ((i + 0.5) / sides);
		m.quad(
			ring(a, r0, i),
			ring(a, r0, i + 1),
			ring(b, r1, i + 1),
			ring(b, r1, i),
			shade(colour, f),
		);
		if (r1 > 0) m.tri(ring(b, r1, i), ring(b, r1, i + 1), b, shade(colour, 1.05));
	}
}

/** A flat arch facing south: a half-disc on a rectangle, its lowest edge at `z`. */
export function arch(
	m: Mesher,
	x: number,
	y: number,
	z: number,
	half: number,
	rise: number,
	colour: number,
): void {
	const steps = 10,
		top = z + rise;
	m.quad([x - half, y, z], [x + half, y, z], [x + half, y, top], [x - half, y, top], colour);
	for (let i = 0; i < steps; i++) {
		const a = (i / steps) * Math.PI,
			b = ((i + 1) / steps) * Math.PI;
		m.tri(
			[x, y, top],
			[x + Math.cos(a) * half, y, top + Math.sin(a) * half],
			[x + Math.cos(b) * half, y, top + Math.sin(b) * half],
			colour,
		);
	}
}

/** A flat disc facing up, for water and glass. */
export function disc(
	m: Mesher,
	cx: number,
	cy: number,
	z: number,
	r: number,
	colour: number,
	sides = 16,
): void {
	for (let i = 0; i < sides; i++) {
		const a = (i / sides) * Math.PI * 2,
			b = ((i + 1) / sides) * Math.PI * 2;
		m.tri(
			[cx + Math.cos(a) * r, cy + Math.sin(a) * r, z],
			[cx + Math.cos(b) * r, cy + Math.sin(b) * r, z],
			[cx, cy, z],
			colour,
		);
	}
}

/** A rounded blob: an ellipsoid of `rings` bands, coloured from `bottom` to `top`. */
export function blob(
	m: Mesher,
	c: { x: number; y: number; z: number },
	r: { x: number; y: number; z: number },
	colours: { bottom: number; top: number },
	options: Omit<LatheOptions, 'cx' | 'cy' | 'z' | 'sx' | 'sy'> & { rings?: number } = {},
): void {
	const rings = options.rings ?? 4,
		list: Ring[] = [];
	for (let k = 0; k <= rings; k++) {
		const t = -1 + (2 * k) / rings,
			radius = Math.sqrt(Math.max(0, 1 - t * t));
		list.push({
			r: k === 0 || k === rings ? 0 : radius,
			z: t * r.z,
			colour: mixHex(colours.bottom, colours.top, (t + 1) / 2),
		});
	}
	lathe(m, list, { ...options, cx: c.x, cy: c.y, z: c.z, sx: r.x, sy: r.y });
}

function mixHex(a: number, b: number, t: number): number {
	const ch = (shift: number): number =>
		Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
	return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Copies a geometry into flat arrays, moved to a place, turned about Z and scaled; normals are turned with it. */
export interface Sink {
	positions: number[];
	normals: number[];
	colours: number[];
}

export function newSink(): Sink {
	return { positions: [], normals: [], colours: [] };
}

export function append(
	sink: Sink,
	geometry: THREE.BufferGeometry,
	x: number,
	y: number,
	z: number,
	yaw = 0,
	scale = 1,
): void {
	const position = geometry.getAttribute('position'),
		normal = geometry.getAttribute('normal'),
		colour = geometry.getAttribute('color'),
		cos = Math.cos(yaw),
		sin = Math.sin(yaw);
	for (let i = 0; i < position.count; i++) {
		const px = position.getX(i) * scale,
			py = position.getY(i) * scale;
		sink.positions.push(
			px * cos - py * sin + x,
			px * sin + py * cos + y,
			position.getZ(i) * scale + z,
		);
		const nx = normal.getX(i),
			ny = normal.getY(i);
		sink.normals.push(nx * cos - ny * sin, nx * sin + ny * cos, normal.getZ(i));
		sink.colours.push(colour.getX(i), colour.getY(i), colour.getZ(i));
	}
}
