// Turns a soup of labelled triangles into watertight printable solids on a voxel grid, and writes STL and 3MF files.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';

/** A voxel grid in millimetres. Voxel `(i, j, k)` has its centre at `origin + (i, j, k) * h`. */
export interface Grid {
	nx: number;
	ny: number;
	nz: number;
	h: number;
	origin: [number, number, number];
}
/** An indexed triangle mesh in millimetres. */
export interface SolidMesh {
	positions: Float32Array;
	indices: Uint32Array;
}
/**
 * Triangles to voxelise: nine floats a triangle, and two labels for each of its corners. `colour` picks the filament and
 * `piece` the kit part; zero means "take the label of the nearest labelled surface".
 */
export interface Soup {
	positions: Float32Array;
	colour: Uint8Array;
	piece: Uint8Array;
}

const INF = 1e20;

export function gridFor(soup: Soup, h: number, padding: number): Grid {
	const lo = [Infinity, Infinity, Infinity],
		hi = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < soup.positions.length; i++) {
		const a = i % 3,
			v = soup.positions[i];
		if (v < lo[a]) lo[a] = v;
		if (v > hi[a]) hi[a] = v;
	}
	const n = [0, 1, 2].map((a) => Math.ceil((hi[a] - lo[a]) / h) + 1 + 2 * padding);
	return {
		nx: n[0],
		ny: n[1],
		nz: n[2],
		h,
		origin: [lo[0] - padding * h, lo[1] - padding * h, lo[2] - padding * h],
	};
}

/** The voxels the triangles pass through, their labels, and for each the surface sample nearest its centre. */
export interface Raster {
	shell: Uint8Array;
	piece: Uint8Array;
	/** For a shell voxel, its row in `samples`; otherwise -1. */
	sampleOf: Int32Array;
	/** Six floats a row: a point on the surface in voxel units, and the surface's unit normal there. */
	samples: Float32Array;
}

/** Visits points on every triangle at half-voxel spacing, in voxel units, with the triangle's unit normal. */
function eachSample(
	soup: Soup,
	g: Grid,
	visit: (x: number, y: number, z: number, normal: number[], corner: number) => void,
): void {
	const p = soup.positions,
		inv = 1 / g.h,
		normal = [0, 0, 0];
	for (let t = 0; t < p.length / 9; t++) {
		const o = t * 9,
			edge = (a: number, b: number): number =>
				Math.hypot(p[o + a] - p[o + b], p[o + a + 1] - p[o + b + 1], p[o + a + 2] - p[o + b + 2]),
			n = Math.max(1, Math.ceil(Math.max(edge(0, 3), edge(3, 6), edge(6, 0)) / (g.h * 0.5))),
			ux = p[o + 3] - p[o],
			uy = p[o + 4] - p[o + 1],
			uz = p[o + 5] - p[o + 2],
			vx = p[o + 6] - p[o],
			vy = p[o + 7] - p[o + 1],
			vz = p[o + 8] - p[o + 2],
			cx = uy * vz - uz * vy,
			cy = uz * vx - ux * vz,
			cz = ux * vy - uy * vx,
			length = Math.hypot(cx, cy, cz);
		if (length === 0) continue;
		normal[0] = cx / length;
		normal[1] = cy / length;
		normal[2] = cz / length;
		for (let a = 0; a <= n; a++)
			for (let b = 0; a + b <= n; b++) {
				const u = a / n,
					v = b / n,
					w = 1 - u - v;
				visit(
					(p[o] * w + p[o + 3] * u + p[o + 6] * v - g.origin[0]) * inv,
					(p[o + 1] * w + p[o + 4] * u + p[o + 7] * v - g.origin[1]) * inv,
					(p[o + 2] * w + p[o + 5] * u + p[o + 8] * v - g.origin[2]) * inv,
					normal,
					t * 3 + (w >= u && w >= v ? 0 : u >= v ? 1 : 2),
				);
			}
	}
}

/**
 * Marks every voxel a triangle passes through. A sample takes the piece label of its nearest corner, so a boundary inside
 * a mesh follows the mesh's own vertex colours.
 */
export function rasterise(soup: Soup, g: Grid): Raster {
	const size = g.nx * g.ny * g.nz,
		shell = new Uint8Array(size),
		piece = new Uint8Array(size),
		sampleOf = new Int32Array(size).fill(-1);
	let samples = new Float32Array(1 << 20),
		reach = new Float32Array(1 << 17),
		rows = 0;
	eachSample(soup, g, (x, y, z, normal, corner) => {
		const i = Math.round(x),
			j = Math.round(y),
			k = Math.round(z),
			at = i + g.nx * (j + g.ny * k),
			off = (x - i) * (x - i) + (y - j) * (y - j) + (z - k) * (z - k);
		shell[at] = 1;
		if (soup.piece[corner]) piece[at] = soup.piece[corner];
		let row = sampleOf[at];
		if (row < 0) {
			row = sampleOf[at] = rows++;
			if (rows * 6 > samples.length) {
				const more = new Float32Array(samples.length * 2);
				more.set(samples);
				samples = more;
				const further = new Float32Array(reach.length * 2);
				further.set(reach);
				reach = further;
			}
			reach[row] = Infinity;
		}
		if (off < reach[row]) {
			reach[row] = off;
			samples.set([x, y, z, normal[0], normal[1], normal[2]], row * 6);
		}
	});
	return { shell, piece, sampleOf, samples: samples.slice(0, rows * 6) };
}

/**
 * The label of each voxel the solid's outer surface passes through. Only samples that lie on that surface count, tested by
 * stepping half a voxel along the triangle's normal into open air, so a surface buried under another one never speckles
 * the colour above it, and the bodies divide along what can be seen. Labels listed in `buried` count wherever they are,
 * for pieces that should part along a hidden surface.
 */
export function exposedLabels(
	soup: Soup,
	which: 'colour' | 'piece',
	g: Grid,
	occ: Float32Array,
	buried: readonly number[] = [],
): Uint8Array {
	const labels = soup[which];
	const { nx, ny, nz } = g,
		out = new Uint8Array(nx * ny * nz),
		read = (x: number, y: number, z: number): number => {
			const i = Math.min(nx - 2, Math.max(0, Math.floor(x))),
				j = Math.min(ny - 2, Math.max(0, Math.floor(y))),
				k = Math.min(nz - 2, Math.max(0, Math.floor(z))),
				fx = x - i,
				fy = y - j,
				fz = z - k,
				at = i + nx * (j + ny * k),
				row = (base: number): number =>
					(occ[base] * (1 - fx) + occ[base + 1] * fx) * (1 - fy) +
					(occ[base + nx] * (1 - fx) + occ[base + nx + 1] * fx) * fy;
			return row(at) * (1 - fz) + row(at + nx * ny) * fz;
		};
	eachSample(soup, g, (x, y, z, normal, corner) => {
		if (!labels[corner]) return;
		if (
			!buried.includes(labels[corner]) &&
			read(x + 0.5 * normal[0], y + 0.5 * normal[1], z + 0.5 * normal[2]) > 0.34
		)
			return;
		out[Math.round(x) + nx * (Math.round(y) + ny * Math.round(z))] = labels[corner];
	});
	return out;
}

/**
 * The exact squared distance, in voxels, from every voxel to the nearest seed (Felzenszwalb and Huttenlocher's separable
 * transform). With `feature`, also the index of that nearest seed.
 */
export function distance(
	seed: Uint8Array,
	g: Grid,
	feature: boolean,
): { d2: Float32Array; nearest: Int32Array | null } {
	const { nx, ny, nz } = g,
		size = nx * ny * nz,
		d2 = new Float32Array(size),
		nearest = feature ? new Int32Array(size).fill(-1) : null;
	for (let row = 0; row < ny * nz; row++) {
		const base = row * nx;
		let last = -1;
		for (let i = 0; i < nx; i++) {
			if (seed[base + i]) last = i;
			d2[base + i] = last < 0 ? INF : (i - last) * (i - last);
			if (nearest && last >= 0) nearest[base + i] = base + last;
		}
		last = -1;
		for (let i = nx - 1; i >= 0; i--) {
			if (seed[base + i]) last = i;
			if (last >= 0 && (last - i) * (last - i) < d2[base + i]) {
				d2[base + i] = (last - i) * (last - i);
				if (nearest) nearest[base + i] = base + last;
			}
		}
	}
	const longest = Math.max(ny, nz),
		f = new Float64Array(longest),
		src = new Int32Array(longest),
		v = new Int32Array(longest),
		z = new Float64Array(longest + 1);
	const pass = (count: number, stride: number, lines: number, start: (line: number) => number) => {
		for (let line = 0; line < lines; line++) {
			const base = start(line);
			for (let q = 0; q < count; q++) {
				f[q] = d2[base + q * stride];
				if (nearest) src[q] = nearest[base + q * stride];
			}
			let k = -1;
			for (let q = 0; q < count; q++) {
				if (f[q] >= INF) continue;
				let s = 0;
				while (k >= 0) {
					const r = v[k];
					s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
					if (s > z[k]) break;
					k--;
				}
				k++;
				v[k] = q;
				z[k] = k === 0 ? -INF : s;
				z[k + 1] = INF;
			}
			if (k < 0) continue;
			let at = 0;
			for (let q = 0; q < count; q++) {
				while (z[at + 1] < q) at++;
				const r = v[at];
				d2[base + q * stride] = (q - r) * (q - r) + f[r];
				if (nearest) nearest[base + q * stride] = src[r];
			}
		}
	};
	pass(ny, nx, nx * nz, (line) => (line % nx) + nx * ny * Math.floor(line / nx));
	pass(nz, nx * ny, nx * ny, (line) => line);
	return { d2, nearest };
}

/** The voxels a ball of `radius` voxels can reach from the grid's edge without touching the shell. */
export function reachable(shellDistance2: Float32Array, g: Grid, radius: number): Uint8Array {
	const { nx, ny, nz } = g,
		size = nx * ny * nz,
		out = new Uint8Array(size),
		queue = new Int32Array(size),
		r2 = radius * radius;
	let head = 0,
		tail = 0;
	const push = (at: number) => {
		if (!out[at] && shellDistance2[at] > r2) {
			out[at] = 1;
			queue[tail++] = at;
		}
	};
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++)
				if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1)
					push(i + nx * (j + ny * k));
	while (head < tail) {
		const at = queue[head++],
			i = at % nx,
			j = Math.floor(at / nx) % ny,
			k = Math.floor(at / (nx * ny));
		if (i > 0) push(at - 1);
		if (i < nx - 1) push(at + 1);
		if (j > 0) push(at - nx);
		if (j < ny - 1) push(at + nx);
		if (k > 0) push(at - nx * ny);
		if (k < nz - 1) push(at + nx * ny);
	}
	return out;
}

/** One pass of a `[1, 2, 1] / 4` blur along each axis, in place. */
export function blur(field: Float32Array, g: Grid, passes = 1): void {
	const { nx, ny, nz } = g,
		longest = Math.max(nx, ny, nz),
		line = new Float32Array(longest);
	const along = (count: number, stride: number, lines: number, start: (l: number) => number) => {
		for (let l = 0; l < lines; l++) {
			const base = start(l);
			for (let q = 0; q < count; q++) line[q] = field[base + q * stride];
			for (let q = 0; q < count; q++)
				field[base + q * stride] =
					0.25 * line[q > 0 ? q - 1 : q] + 0.5 * line[q] + 0.25 * line[q < count - 1 ? q + 1 : q];
		}
	};
	for (let n = 0; n < passes; n++) {
		along(nx, 1, ny * nz, (l) => l * nx);
		along(ny, nx, nx * nz, (l) => (l % nx) + nx * ny * Math.floor(l / nx));
		along(nz, nx * ny, nx * ny, (l) => l);
	}
}

/**
 * A signed depth in voxels, positive inside the closed solid: everything a ball of `radius` voxels cannot reach from
 * outside. Overlapping parts fuse, open tube ends and enclosed hollows fill, and any gap narrower than the ball's diameter
 * closes. Its zero sits about half a voxel outside the sampled shell.
 */
export function closing(shell: Uint8Array, g: Grid, radius: number): Float32Array {
	const field = distance(reachable(distance(shell, g, false).d2, g, radius), g, false).d2,
		edge = radius + 0.5;
	for (let i = 0; i < field.length; i++) field[i] = Math.sqrt(field[i]) - edge;
	return field;
}

/**
 * The occupancy of the printable solid, from 0 outside to 1 inside with 0.5 on its surface.
 *
 * `closing` decides what is solid, but only to the nearest voxel. Close to the surface, wherever the nearest sampled
 * triangle agrees with it, the depth is measured to that triangle's plane instead, which puts the surface where the model
 * has it and removes the voxel staircase.
 */
export function occupancy(
	raster: Raster,
	shell: Uint8Array,
	g: Grid,
	radius: number,
): Float32Array {
	const field = closing(shell, g, radius),
		{ nearest } = distance(shell, g, true),
		{ nx, ny } = g,
		s = raster.samples;
	for (let at = 0; at < field.length; at++) {
		const coarse = field[at] - 0.5;
		field[at] = coarse;
		if (Math.abs(coarse) > 2.5 || nearest![at] < 0) continue;
		const row = raster.sampleOf[nearest![at]] * 6;
		if (row < 0) continue;
		const i = at % nx,
			j = Math.floor(at / nx) % ny,
			k = Math.floor(at / (nx * ny)),
			exact =
				(s[row] - i) * s[row + 3] + (s[row + 1] - j) * s[row + 4] + (s[row + 2] - k) * s[row + 5];
		if (Math.abs(exact - coarse) < 1) field[at] = exact;
	}
	blur(field, g, 2);
	for (let i = 0; i < field.length; i++) field[i] = Math.min(1, Math.max(0, 0.5 + 0.5 * field[i]));
	return field;
}

/** Every voxel's label, taken from the nearest shell voxel that has one. */
export function spread(labels: Uint8Array, g: Grid): Uint8Array {
	const { nearest } = distance(labels, g, true),
		out = new Uint8Array(labels.length);
	for (let i = 0; i < out.length; i++) out[i] = nearest![i] < 0 ? 0 : labels[nearest![i]];
	return out;
}

/**
 * Splits a label into its connected pieces inside the solid and renumbers every label as `piece`. Pieces smaller than
 * `minimum` voxels are merged into a neighbour. Returns the new labels and, for each, the label it came from.
 */
export function components(
	labels: Uint8Array,
	occ: Float32Array,
	g: Grid,
	minimum: number,
	rounds = 4,
): { labels: Uint8Array; from: number[] } {
	const { nx, ny, nz } = g,
		size = nx * ny * nz,
		id = new Int32Array(size),
		queue = new Int32Array(size),
		from: number[] = [0],
		sizes: number[] = [0],
		step = [1, -1, nx, -nx, nx * ny, -nx * ny];
	for (let seed = 0; seed < size; seed++) {
		if (id[seed] || occ[seed] < 0.5 || !labels[seed]) continue;
		const label = labels[seed],
			mine = from.length;
		let head = 0,
			tail = 0;
		id[seed] = mine;
		queue[tail++] = seed;
		while (head < tail) {
			const at = queue[head++],
				i = at % nx,
				j = Math.floor(at / nx) % ny,
				k = Math.floor(at / (nx * ny)),
				ok = [i < nx - 1, i > 0, j < ny - 1, j > 0, k < nz - 1, k > 0];
			for (let s = 0; s < 6; s++) {
				const next = at + step[s];
				if (ok[s] && !id[next] && occ[next] >= 0.5 && labels[next] === label) {
					id[next] = mine;
					queue[tail++] = next;
				}
			}
		}
		from.push(label);
		sizes.push(tail);
	}
	const kept = sizes.map((count) => count >= minimum),
		renumber = new Int32Array(from.length),
		keptFrom: number[] = [0];
	kept.forEach((keep, i) => {
		if (i && keep) {
			renumber[i] = keptFrom.length;
			keptFrom.push(from[i]);
		}
	});
	const seeds = new Uint8Array(size);
	for (let i = 0; i < size; i++) seeds[i] = renumber[id[i]];
	const spreadOut = spread(seeds, g);
	/* Spreading the kept pieces over the merged ones can strand an island of one piece inside another: go round again. */
	if (kept.some((keep, i) => i && !keep) && rounds > 0) {
		const again = components(spreadOut, occ, g, minimum, rounds - 1);
		return { labels: again.labels, from: again.from.map((label) => keptFrom[label]) };
	}
	return { labels: spreadOut, from: keptFrom };
}

/**
 * One closed mesh per label. Each label has a field that is positive inside its body and zero on its surface; where two
 * bodies meet, both fields cross zero on the same surface, so the bodies tile the solid, and where a body meets the outside
 * its surface is the solid's own. Shells under `speck` triangles, left where three bodies meet, are dropped.
 */
export function bodies(
	labels: Uint8Array,
	count: number,
	occ: Float32Array,
	g: Grid,
	speck: number,
): SolidMesh[] {
	const size = labels.length,
		best = new Float32Array(size),
		second = new Float32Array(size),
		total = new Float32Array(size),
		w = new Float32Array(size),
		weigh = (c: number): void => {
			for (let i = 0; i < size; i++) w[i] = labels[i] === c ? 1 : 0;
			blur(w, g, 2);
		};
	for (let c = 1; c <= count; c++) {
		weigh(c);
		for (let i = 0; i < size; i++) {
			const v = w[i];
			total[i] += v;
			if (v > best[i]) {
				second[i] = best[i];
				best[i] = v;
			} else if (v > second[i]) second[i] = v;
		}
	}
	const meshes: SolidMesh[] = [];
	for (let c = 1; c <= count; c++) {
		weigh(c);
		for (let i = 0; i < size; i++) {
			const o = occ[i],
				scale = total[i] > 0 ? o / total[i] : 0;
			w[i] = w[i] * scale - Math.max((w[i] === best[i] ? second[i] : best[i]) * scale, 1 - o);
		}
		meshes.push(dropSpecks(surface(w, g, 0), speck));
	}
	return meshes;
}

/** A hole for an alignment pin across the join between two pieces. Lengths are in millimetres. */
export interface Pin {
	between: [number, number];
	at: number[];
	along: number[];
	/** How far the hole runs into each piece. */
	depth: number;
}

/**
 * Drills a pin hole across each join between two pieces that has room for one, and returns the drilled occupancy. A hole
 * sits at the middle of the join, runs along its average normal, and is kept only where `wall` voxels of solid surround
 * it; it is shortened to fit, and dropped if it would be shallower than `shallowest`.
 */
export function drillPins(
	labels: Uint8Array,
	occ: Float32Array,
	g: Grid,
	radius: number,
	deepest: number,
	shallowest: number,
	wall: number,
): { occ: Float32Array; pins: Pin[] } {
	const { nx, ny, nz } = g,
		slab = nx * ny,
		joins = new Map<number, number[]>(),
		step = [1, nx, slab];
	for (let k = 0; k < nz - 1; k++)
		for (let j = 0; j < ny - 1; j++)
			for (let i = 0; i < nx - 1; i++) {
				const at = i + nx * j + slab * k,
					a = labels[at];
				if (occ[at] < 0.99) continue;
				for (let axis = 0; axis < 3; axis++) {
					const b = labels[at + step[axis]];
					if (b === a || occ[at + step[axis]] < 0.99) continue;
					const key = Math.min(a, b) * 256 + Math.max(a, b),
						sign = a < b ? 1 : -1;
					let sum = joins.get(key);
					if (!sum) joins.set(key, (sum = [0, 0, 0, 0, 0, 0, 0]));
					sum[0] += i + (axis === 0 ? 0.5 : 0);
					sum[1] += j + (axis === 1 ? 0.5 : 0);
					sum[2] += k + (axis === 2 ? 0.5 : 0);
					sum[3 + axis] += sign;
					sum[6]++;
				}
			}
	const drilled = occ.slice(),
		pins: Pin[] = [],
		labelAt = (p: number[]): number =>
			labels[Math.round(p[0]) + nx * Math.round(p[1]) + slab * Math.round(p[2])],
		/* Visits voxels near the hole's axis with their distance outside a flat-ended cylinder of the given size. */
		near = (
			c: number[],
			n: number[],
			length: number,
			reach: number,
			visit: (at: number, outside: number) => void,
		) => {
			const pad = length + reach + 2,
				lo = c.map((v) => Math.max(0, Math.floor(v - pad))),
				hi = c.map((v, a) => Math.min([nx, ny, nz][a] - 1, Math.ceil(v + pad)));
			for (let k = lo[2]; k <= hi[2]; k++)
				for (let j = lo[1]; j <= hi[1]; j++)
					for (let i = lo[0]; i <= hi[0]; i++) {
						const dx = i - c[0],
							dy = j - c[1],
							dz = k - c[2],
							t = dx * n[0] + dy * n[1] + dz * n[2],
							radial = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - t * t));
						visit(i + nx * j + slab * k, Math.max(radial - reach, Math.abs(t) - length));
					}
		};
	[...joins.entries()]
		.sort((a, b) => a[0] - b[0])
		.forEach(([key, sum]) => {
			const size = Math.hypot(sum[3], sum[4], sum[5]);
			if (size < Math.PI * (radius + wall) * (radius + wall)) return;
			const n = [sum[3] / size, sum[4] / size, sum[5] / size],
				a = key >> 8,
				b = key & 255;
			let c = [sum[0] / sum[6], sum[1] / sum[6], sum[2] / sum[6]];
			/* A curved join's middle can sit off the join itself: slide along the normal to where the two pieces meet. */
			let moved = false;
			for (let reach = 0; reach < 60 && !moved; reach += 0.5)
				for (const way of [1, -1]) {
					const lower = c.map((v, e) => v + n[e] * (way * reach - 0.5)),
						upper = c.map((v, e) => v + n[e] * (way * reach + 0.5));
					if (lower.some((v, e) => v < 1 || v > [nx, ny, nz][e] - 2)) continue;
					if (upper.some((v, e) => v < 1 || v > [nx, ny, nz][e] - 2)) continue;
					if (labelAt(lower) === a && labelAt(upper) === b) {
						c = c.map((v, e) => v + n[e] * way * reach);
						moved = true;
						break;
					}
				}
			if (!moved) return;
			for (let length = deepest; length >= shallowest; length -= 0.5) {
				let clear = true;
				near(c, n, length + wall, radius + wall, (at, outside) => {
					if (outside <= 0 && occ[at] < 0.99) clear = false;
				});
				if (!clear) continue;
				near(c, n, length, radius, (at, outside) => {
					drilled[at] = Math.min(drilled[at], Math.min(1, Math.max(0, 0.5 + 0.5 * outside)));
				});
				pins.push({
					between: [a, b],
					at: c.map((v, e) => g.origin[e] + v * g.h),
					along: n,
					depth: length * g.h,
				});
				return;
			}
		});
	return { occ: drilled, pins };
}

const cornerOffset = [
	[0, 0, 0],
	[1, 0, 0],
	[1, 1, 0],
	[0, 1, 0],
	[0, 0, 1],
	[1, 0, 1],
	[1, 1, 1],
	[0, 1, 1],
];
const edgeCorners = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 0],
	[4, 5],
	[5, 6],
	[6, 7],
	[7, 4],
	[0, 4],
	[1, 5],
	[2, 6],
	[3, 7],
];
/** For each cube edge: the corner that owns it and its axis. */
const edgeOwner = [
	[0, 0],
	[1, 1],
	[3, 0],
	[0, 1],
	[4, 0],
	[5, 1],
	[7, 0],
	[4, 1],
	[0, 2],
	[1, 2],
	[2, 2],
	[3, 2],
];

/** Marching cubes over the surface `field = level`, solid where the field is higher. Vertices are shared, faces wind outward. */
export function surface(field: Float32Array, g: Grid, level: number): SolidMesh {
	const { nx, ny, nz } = g,
		slab = nx * ny,
		vertexAt = new Map<number, number>(),
		positions: number[] = [],
		indices: number[] = [],
		value = new Float64Array(8),
		cubeVertex = new Int32Array(12);
	for (let k = 0; k < nz - 1; k++)
		for (let j = 0; j < ny - 1; j++)
			for (let i = 0; i < nx - 1; i++) {
				const at = i + nx * j + slab * k;
				let cube = 0;
				for (let c = 0; c < 8; c++) {
					const o = cornerOffset[c];
					/* A corner exactly on the surface would put several vertices on one point; treat it as just outside. */
					value[c] = field[at + o[0] + nx * o[1] + slab * o[2]] - level || -1e-7;
					if (value[c] < 0) cube |= 1 << c;
				}
				const bits = edgeTable[cube];
				if (!bits) continue;
				for (let e = 0; e < 12; e++) {
					if (!(bits & (1 << e))) continue;
					const [a, b] = edgeCorners[e],
						owner = cornerOffset[edgeOwner[e][0]],
						key = 3 * (at + owner[0] + nx * owner[1] + slab * owner[2]) + edgeOwner[e][1];
					let vertex = vertexAt.get(key);
					if (vertex === undefined) {
						const t = Math.min(0.999, Math.max(0.001, value[a] / (value[a] - value[b]))),
							pa = cornerOffset[a],
							pb = cornerOffset[b];
						vertex = positions.length / 3;
						positions.push(
							g.origin[0] + (i + pa[0] + t * (pb[0] - pa[0])) * g.h,
							g.origin[1] + (j + pa[1] + t * (pb[1] - pa[1])) * g.h,
							g.origin[2] + (k + pa[2] + t * (pb[2] - pa[2])) * g.h,
						);
						vertexAt.set(key, vertex);
					}
					cubeVertex[e] = vertex;
				}
				for (let t = cube * 16; triTable[t] !== -1; t += 3) {
					const a = cubeVertex[triTable[t]],
						b = cubeVertex[triTable[t + 1]],
						c = cubeVertex[triTable[t + 2]];
					if (a !== b && b !== c && c !== a) indices.push(a, b, c);
				}
			}
	const mesh = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
	if (meshVolume(mesh) < 0)
		for (let t = 0; t < mesh.indices.length; t += 3) {
			const swap = mesh.indices[t + 1];
			mesh.indices[t + 1] = mesh.indices[t + 2];
			mesh.indices[t + 2] = swap;
		}
	return mesh;
}

export function meshVolume(mesh: SolidMesh): number {
	const p = mesh.positions;
	let six = 0;
	for (let t = 0; t < mesh.indices.length; t += 3) {
		const a = mesh.indices[t] * 3,
			b = mesh.indices[t + 1] * 3,
			c = mesh.indices[t + 2] * 3;
		six +=
			p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
			p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
			p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
	}
	return six / 6;
}

/** How many edges are not shared by exactly two triangles, one in each direction. Zero means a closed, oriented surface. */
export function openEdges(mesh: SolidMesh): number {
	const count = mesh.positions.length / 3,
		balance = new Map<number, number>(),
		uses = new Map<number, number>();
	for (let t = 0; t < mesh.indices.length; t += 3)
		for (let e = 0; e < 3; e++) {
			const a = mesh.indices[t + e],
				b = mesh.indices[t + ((e + 1) % 3)],
				key = a < b ? a * count + b : b * count + a;
			balance.set(key, (balance.get(key) ?? 0) + (a < b ? 1 : -1));
			uses.set(key, (uses.get(key) ?? 0) + 1);
		}
	let bad = 0;
	uses.forEach((n, key) => {
		if (n !== 2 || balance.get(key) !== 0) bad++;
	});
	return bad;
}

/** Drops shells smaller than `minimum` triangles: specks left where three bodies meet. */
export function dropSpecks(mesh: SolidMesh, minimum: number): SolidMesh {
	const count = mesh.positions.length / 3,
		parent = new Int32Array(count).map((_, i) => i);
	const find = (a: number): number => {
		while (parent[a] !== a) a = parent[a] = parent[parent[a]];
		return a;
	};
	for (let t = 0; t < mesh.indices.length; t += 3) {
		const a = find(mesh.indices[t]);
		parent[find(mesh.indices[t + 1])] = a;
		parent[find(mesh.indices[t + 2])] = a;
	}
	const triangles = new Map<number, number>();
	for (let t = 0; t < mesh.indices.length; t += 3) {
		const root = find(mesh.indices[t]);
		triangles.set(root, (triangles.get(root) ?? 0) + 1);
	}
	const renumber = new Int32Array(count).fill(-1),
		positions: number[] = [],
		indices: number[] = [];
	for (let t = 0; t < mesh.indices.length; t += 3) {
		if (triangles.get(find(mesh.indices[t]))! < minimum) continue;
		for (let e = 0; e < 3; e++) {
			const v = mesh.indices[t + e];
			if (renumber[v] < 0) {
				renumber[v] = positions.length / 3;
				positions.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
			}
			indices.push(renumber[v]);
		}
	}
	return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

export function bounds(mesh: SolidMesh): { min: number[]; max: number[] } {
	const min = [Infinity, Infinity, Infinity],
		max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < mesh.positions.length; i++) {
		const a = i % 3,
			v = mesh.positions[i];
		if (v < min[a]) min[a] = v;
		if (v > max[a]) max[a] = v;
	}
	return { min, max };
}

/** A binary STL of one or more meshes fused into one file. */
export function stl(meshes: SolidMesh[], title: string): Uint8Array {
	const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0),
		bytes = new Uint8Array(84 + triangles * 50),
		view = new DataView(bytes.buffer);
	bytes.set(strToU8(title.slice(0, 79)));
	view.setUint32(80, triangles, true);
	let at = 84;
	for (const mesh of meshes) {
		const p = mesh.positions;
		for (let t = 0; t < mesh.indices.length; t += 3) {
			const a = mesh.indices[t] * 3,
				b = mesh.indices[t + 1] * 3,
				c = mesh.indices[t + 2] * 3,
				ux = p[b] - p[a],
				uy = p[b + 1] - p[a + 1],
				uz = p[b + 2] - p[a + 2],
				vx = p[c] - p[a],
				vy = p[c + 1] - p[a + 1],
				vz = p[c + 2] - p[a + 2],
				nx = uy * vz - uz * vy,
				ny = uz * vx - ux * vz,
				nz = ux * vy - uy * vx,
				length = Math.hypot(nx, ny, nz) || 1;
			view.setFloat32(at, nx / length, true);
			view.setFloat32(at + 4, ny / length, true);
			view.setFloat32(at + 8, nz / length, true);
			for (const [n, corner] of [a, b, c].entries())
				for (let e = 0; e < 3; e++) view.setFloat32(at + 12 + n * 12 + e * 4, p[corner + e], true);
			at += 50;
		}
	}
	return bytes;
}

/** One body of a 3MF file. */
export interface Body {
	name: string;
	colour: number;
	mesh: SolidMesh;
}

/**
 * A 3MF file holding one object made of the given bodies as components, so a slicer loads them as the parts of a single
 * model, in place, each with its name and display colour.
 */
export function threeMf(bodies: Body[], title: string): Uint8Array {
	const hex = (colour: number): string => '#' + colour.toString(16).padStart(6, '0').toUpperCase(),
		escape = (text: string): string =>
			text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
		parts: string[] = [
			'<?xml version="1.0" encoding="UTF-8"?>\n',
			'<model unit="millimeter" xml:lang="en-CA" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
			` <metadata name="Title">${escape(title)}</metadata>\n`,
			' <resources>\n',
			'  <basematerials id="1">\n',
			...bodies.map(
				(body) => `   <base name="${escape(body.name)}" displaycolor="${hex(body.colour)}"/>\n`,
			),
			'  </basematerials>\n',
		];
	bodies.forEach((body, n) => {
		const p = body.mesh.positions,
			x = body.mesh.indices,
			lines: string[] = [];
		lines.push(
			`  <object id="${n + 2}" name="${escape(body.name)}" type="model" pid="1" pindex="${n}">\n   <mesh>\n    <vertices>\n`,
		);
		for (let i = 0; i < p.length; i += 3)
			lines.push(
				`     <vertex x="${p[i].toFixed(5)}" y="${p[i + 1].toFixed(5)}" z="${p[i + 2].toFixed(5)}"/>\n`,
			);
		lines.push('    </vertices>\n    <triangles>\n');
		for (let i = 0; i < x.length; i += 3)
			lines.push(`     <triangle v1="${x[i]}" v2="${x[i + 1]}" v3="${x[i + 2]}"/>\n`);
		lines.push('    </triangles>\n   </mesh>\n  </object>\n');
		parts.push(lines.join(''));
	});
	const whole = bodies.length + 2;
	parts.push(
		`  <object id="${whole}" name="${escape(title)}" type="model">\n   <components>\n`,
		...bodies.map((_, n) => `    <component objectid="${n + 2}"/>\n`),
		'   </components>\n  </object>\n </resources>\n',
		` <build>\n  <item objectid="${whole}"/>\n </build>\n</model>\n`,
	);
	return zipSync(
		{
			'[Content_Types].xml': strToU8(
				'<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n',
			),
			'_rels/.rels': strToU8(
				'<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n',
			),
			'3D/3dmodel.model': strToU8(parts.join('')),
		},
		{ level: 9, mtime: new Date('2026-01-01T00:00:00Z') },
	);
}
