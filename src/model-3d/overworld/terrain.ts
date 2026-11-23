// The overworld's tile grid and the ground's shape and colour at any point of it: soft relief, a dished path with kerbs and stepped river banks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { noise2 } from '../crater/hash.ts';
import { mix } from '../crater/mesher.ts';
import { bank, grounds, path, regions, type Region } from './palette.ts';

/** What a tile of the grid holds. */
export const kinds = { none: 0, grass: 1, path: 2, river: 3 } as const;

/** The height of the chocolate river's surface; the land stands above it and its banks step down to it. */
export const waterZ = -0.6;

/** Tile coordinates are kept in a square grid with a margin, so a neighbour just off the map reads as empty. */
const gridSize = 128;
const margin = 16;

function smooth(t: number): number {
	const c = Math.min(1, Math.max(0, t));
	return c * c * (3 - 2 * c);
}

/** The bank's height by distance from the water's edge, in tiles: a steep face, a step, then the shoulder of the land. */
const bankProfile: readonly (readonly [number, number])[] = [
	[0, waterZ],
	[0.25, -0.42],
	[0.5, -0.05],
	[0.75, 0.2],
];

function bankHeight(d: number): number {
	if (d >= 0.75) return Infinity;
	for (let i = 1; i < bankProfile.length; i++) {
		const [d1, z1] = bankProfile[i];
		if (d <= d1) {
			const [d0, z0] = bankProfile[i - 1];
			return z0 + ((z1 - z0) * (d - d0)) / (d1 - d0);
		}
	}
	return Infinity;
}

/** The soft rolling of open ground. */
function relief(u: number, v: number): number {
	return 0.035 + 0.075 * noise2(u * 0.5, v * 0.5, 11) + 0.04 * noise2(u * 1.9 + 3, v * 1.9, 12);
}

const regionIndex: Record<Region, number> = { crater: 0, meadow: 1, candy: 2, frost: 3 };

function channels(hex: number): [number, number, number] {
	return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** A region's ground tone at a point: its dark, base and light tones by a slow noise. */
function tone(region: Region, u: number, v: number): [number, number, number] {
	const ground = grounds[region],
		raw = noise2(u * 0.55, v * 0.55, 21) * 0.7 + noise2(u * 2.3, v * 2.3, 22) * 0.3,
		t = Math.min(1, Math.max(0, (raw - 0.5) * 2 + 0.5)),
		hex =
			t < 0.5
				? mix(ground.dark, ground.base, t * 2)
				: mix(ground.base, ground.light, (t - 0.5) * 2);
	return channels(hex);
}

/** The tile grid and what the ground is like at a point of it. */
export class Terrain {
	private readonly kind = new Uint8Array(gridSize * gridSize);
	private readonly region = new Uint8Array(gridSize * gridSize);
	private readonly tintGrid = new Uint32Array(gridSize * gridSize);
	/** The scan of the last point asked about, shared by height and colour. */
	private scanU = NaN;
	private scanV = NaN;
	private dRiver = Infinity;
	private dPath = Infinity;
	private inside = 0;
	private insidePath = 0;
	private readonly weight = [0, 0, 0, 0];

	private index(x: number, y: number): number {
		const gx = x + margin,
			gy = y + margin;
		return gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize ? -1 : gy * gridSize + gx;
	}

	kindAt(x: number, y: number): number {
		const i = this.index(x, y);
		return i < 0 ? kinds.none : this.kind[i];
	}

	regionAt(x: number, y: number): Region {
		const i = this.index(x, y);
		return i < 0 ? 'crater' : regions[this.region[i]];
	}

	tintAt(x: number, y: number): number {
		const i = this.index(x, y);
		return i < 0 ? 0xffffff : this.tintGrid[i] || 0xffffff;
	}

	/** Sets a tile; returns false when it lay outside the grid. */
	set(x: number, y: number, kind: number, region: Region = 'crater', tint = 0xffffff): boolean {
		const i = this.index(x, y);
		if (i < 0) return false;
		this.kind[i] = kind;
		this.region[i] = regionIndex[region];
		this.tintGrid[i] = tint;
		return true;
	}

	/**
	 * Works out what lies around a point: how far the nearest river and path are, how many tiles touch it (more than one
	 * on a tile edge) and how many of those are path, and how much each region's ground weighs in.
	 */
	private scan(u: number, v: number): void {
		if (u === this.scanU && v === this.scanV) return;
		this.scanU = u;
		this.scanV = v;
		const fx = Math.floor(u),
			fy = Math.floor(v),
			weight = this.weight;
		weight[0] = weight[1] = weight[2] = weight[3] = 0;
		this.dRiver = this.dPath = Infinity;
		this.inside = this.insidePath = 0;
		for (let y = fy - 1; y <= fy + 1; y++)
			for (let x = fx - 1; x <= fx + 1; x++) {
				const kind = this.kindAt(x, y),
					dx = Math.max(x - u, 0, u - (x + 1)),
					dy = Math.max(y - v, 0, v - (y + 1)),
					d = Math.hypot(dx, dy);
				if (d === 0 && kind !== kinds.none) {
					this.inside++;
					if (kind === kinds.path) this.insidePath++;
				}
				if (kind === kinds.river || kind === kinds.none) this.dRiver = Math.min(this.dRiver, d);
				else if (kind === kinds.path) this.dPath = Math.min(this.dPath, d);
				if (kind === kinds.grass && d < 0.6)
					weight[this.region[this.index(x, y)]] += smooth(1 - d / 0.6);
			}
	}

	/** The ground's height at a point, in tiles above the level of the land's flat. */
	height(u: number, v: number): number {
		this.scan(u, v);
		let z: number;
		if (this.inside > 0 && this.insidePath === this.inside) z = 0;
		else if (this.insidePath > 0) z = 0.05;
		else {
			z = relief(u, v);
			if (this.dPath < 0.6) z = 0.05 + (z - 0.05) * smooth(this.dPath / 0.6);
		}
		return Math.min(z, bankHeight(this.dRiver));
	}

	/**
	 * The ground's colour at a point, as a hex number. A point on the edge between a path tile and a grass tile is coloured
	 * for the tile that owns the face being drawn, so the path's edge stays crisp.
	 */
	colour(u: number, v: number, owner: number = kinds.grass): number {
		this.scan(u, v);
		const onPath = owner === kinds.path;
		if (onPath && this.insidePath === this.inside) {
			const n = noise2(u * 1.3, v * 1.3, 31),
				base =
					n < 0.5 ? mix(path.dark, path.base, n * 2) : mix(path.base, path.light, (n - 0.5) * 2);
			return base;
		}
		if (onPath) return path.kerb;
		const weights = this.weight,
			total = weights[0] + weights[1] + weights[2] + weights[3];
		let r = 0,
			g = 0,
			b = 0;
		if (total <= 0) [r, g, b] = channels(grounds.crater.base);
		else
			for (let i = 0; i < 4; i++) {
				if (!weights[i]) continue;
				const [tr, tg, tb] = tone(regions[i], u, v),
					w = weights[i] / total;
				r += tr * w;
				g += tg * w;
				b += tb * w;
			}
		let hex = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
		if (this.dPath < 0.3) hex = mix(hex, path.kerb, 0.22 * (1 - this.dPath / 0.3));
		const d = this.dRiver;
		if (d < 0.75) {
			const low =
				d < 0.25 ? mix(bank.low, bank.mid, d / 0.25) : mix(bank.mid, bank.lip, (d - 0.25) / 0.25);
			hex = d < 0.5 ? low : mix(bank.lip, hex, Math.max(0, (d - 0.55) / 0.2));
		}
		return hex;
	}

	/** The surface normal at a point, from the height around it, as a unit vector. */
	normal(u: number, v: number, out: [number, number, number]): void {
		const e = 0.125,
			dx = this.height(u + e, v) - this.height(u - e, v),
			dy = this.height(u, v + e) - this.height(u, v - e),
			s = 1 / Math.hypot(dx, dy, 2 * e);
		out[0] = -dx * s;
		out[1] = -dy * s;
		out[2] = 2 * e * s;
	}

	/** How far a point is from the nearest path tile, in tiles. */
	pathDistance(u: number, v: number): number {
		this.scan(u, v);
		return this.dPath;
	}

	/** How far a point is from the water, in tiles. */
	waterDistance(u: number, v: number): number {
		this.scan(u, v);
		return this.dRiver;
	}
}
