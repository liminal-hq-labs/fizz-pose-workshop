// Draws the level's fixed terrain tiles in a handful of meshes: tiles are merged into chunks along X, one mesh per look.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Placed } from '../../level-3d/types.ts';
import { chasmGeometry, massifGeometry } from './chasm.ts';
import { craterTheme } from './crater-theme.ts';
import type { Surroundings } from './surroundings.ts';
import type { GroundTheme } from './theme.ts';

/** How wide a chunk is, in tiles: wide enough for few draws, narrow enough that frustum culling skips the far ends. */
export const chunkTiles = 16;
/** How far past the ends of the ground the rock massifs reach, in tiles. */
const massifWidth = 18;
/** The lowest edge of the chasm walls and massifs, in tiles. */
const floor = -10;

/** The looks a tile can have; tiles of one look in one chunk share a mesh. */
export type Look = 'ground' | 'fill' | 'prop' | 'glow' | 'chocolate' | 'unlit' | 'wall';

type LookSpec = { material: THREE.Material; cast: boolean; receive: boolean };

/** How each look is drawn with a theme's materials, and whether it casts and receives shadows. */
function looksOf(theme: GroundTheme): Record<Look, LookSpec> {
	const { ground, prop, glow, chocolate, unlit } = theme.materials;
	return {
		ground: { material: ground, cast: true, receive: true },
		fill: { material: ground, cast: false, receive: true },
		wall: { material: ground, cast: false, receive: true },
		prop: { material: prop, cast: true, receive: true },
		glow: { material: glow, cast: true, receive: true },
		chocolate: { material: chocolate, cast: false, receive: false },
		unlit: { material: unlit, cast: false, receive: false },
	};
}

/** What a tile says about the ground mass it belongs to, for the walls of the pits between them. */
export interface TileInfo {
	/** For tiles that are solid ground: the height of the surface above the column's centre. */
	solidTop?: number;
	/** True for tiles of a pool, which is a pit that is filled in. */
	pool?: boolean;
	/** For solid tiles: the height of the left and right edge of the surface, as fractions of the tile, so neighbours can join. */
	edges?: readonly [number, number];
	/** Builds the tile's geometry for what is around it; the batch calls it again when the neighbours change. */
	build?: (around: Surroundings) => THREE.BufferGeometry;
	/** For tiles that join their own kind, such as ledges: a name, so the tile can ask whether the one beside it is the same. */
	join?: string;
}

interface Part {
	geometry: THREE.BufferGeometry;
	look: Look;
	x: number;
	y: number;
	yaw: number;
	info: TileInfo;
	/** The signature of the surroundings `geometry` was built for, when `info.build` made it. */
	sig?: string;
}

interface Chunk {
	index: number;
	parts: Set<Part>;
	meshes: THREE.Mesh[];
	dirty: boolean;
	wallKey: string;
}

/** A key for the tile whose centre is at (x, y). */
function cellKey(x: number, y: number): number {
	return (Math.floor(x) + 100000) * 8192 + Math.floor(y) + 4096;
}

/** Copies `parts` into one geometry, moving each to its tile. All the geometries must carry the same attributes. */
export function mergeTiles(
	parts: readonly { geometry: THREE.BufferGeometry; x: number; y: number; yaw: number }[],
): THREE.BufferGeometry {
	const first = parts[0].geometry,
		names = Object.keys(first.attributes),
		total = parts.reduce((sum, part) => sum + part.geometry.getAttribute('position').count, 0),
		out = new THREE.BufferGeometry();
	for (const name of names) {
		const size = first.getAttribute(name).itemSize,
			array = new Float32Array(total * size);
		let at = 0;
		for (const part of parts) {
			const source = part.geometry.getAttribute(name),
				src = source.array as ArrayLike<number>,
				count = source.count,
				cos = Math.cos(part.yaw),
				sin = Math.sin(part.yaw);
			if (name === 'position' || name === 'normal') {
				const move = name === 'position';
				for (let i = 0; i < count; i++) {
					const x = src[i * 3],
						y = src[i * 3 + 1],
						z = src[i * 3 + 2];
					array[at++] = x * cos + z * sin + (move ? part.x : 0);
					array[at++] = y + (move ? part.y : 0);
					array[at++] = -x * sin + z * cos;
				}
			} else {
				array.set(src as Float32Array, at);
				at += count * size;
			}
		}
		out.setAttribute(name, new THREE.BufferAttribute(array, size));
	}
	out.computeBoundingSphere();
	return out;
}

/**
 * The fixed terrain, drawn as chunk meshes. Tiles are added and removed one at a time; the merged meshes are rebuilt for
 * the chunks that changed when `flush` runs, so a thousand tiles arriving at once cost one build, and a tile that
 * disappears later costs one chunk's rebuild.
 */
export class TileBatch {
	readonly root = new THREE.Group();
	private readonly chunks = new Map<number, Chunk>();
	private readonly ends: THREE.Mesh[] = [];
	private endsKey = '';
	private columnsDirty = false;
	/** The solid tiles by column and row, for tiles to look at their neighbours. */
	private readonly cells = new Map<number, Part>();
	private readonly looks: Record<Look, LookSpec>;

	constructor(private readonly theme: GroundTheme = craterTheme) {
		this.root.name = `${theme.name} terrain`;
		this.looks = looksOf(theme);
	}

	/** Number of chunk meshes currently in the scene. */
	get meshCount(): number {
		let n = this.ends.length;
		for (const chunk of this.chunks.values()) n += chunk.meshes.length;
		return n;
	}

	add(
		look: Look,
		geometry: THREE.BufferGeometry,
		x: number,
		y: number,
		yaw = 0,
		info: TileInfo = {},
	): Placed {
		const index = Math.floor(x / chunkTiles);
		let chunk = this.chunks.get(index);
		if (!chunk)
			this.chunks.set(
				index,
				(chunk = { index, parts: new Set(), meshes: [], dirty: false, wallKey: '' }),
			);
		const part: Part = { geometry, look, x, y, yaw, info };
		chunk.parts.add(part);
		chunk.dirty = true;
		if (info.solidTop !== undefined || info.pool) this.columnsDirty = true;
		if (info.edges || info.join) {
			this.cells.set(cellKey(x, y), part);
			this.touchNeighbours(x);
		}
		return {
			remove: () => {
				chunk.parts.delete(part);
				chunk.dirty = true;
				if (info.solidTop !== undefined || info.pool) this.columnsDirty = true;
				if (info.edges || info.join) {
					if (this.cells.get(cellKey(x, y)) === part) this.cells.delete(cellKey(x, y));
					this.touchNeighbours(x);
				}
				if (part.sig !== undefined) part.geometry.dispose();
			},
		};
	}

	/** Marks the chunks either side of a column dirty, since a tile there may take its shape from this one. */
	private touchNeighbours(x: number): void {
		for (const dx of [-1, 1]) {
			const chunk = this.chunks.get(Math.floor((x + dx) / chunkTiles));
			if (chunk) chunk.dirty = true;
		}
	}

	/** What stands around a tile, read from the solid tiles the batch holds. */
	private around(part: Part): Surroundings {
		const { x, y } = part,
			at = (dx: number, dy: number): Part | undefined => this.cells.get(cellKey(x + dx, y + dy)),
			left = at(-1, 0),
			right = at(1, 0),
			upLeft = at(-1, 1),
			upRight = at(1, 1);
		const join = part.info.join;
		return {
			leftH: left?.info.edges?.[1] ?? 0,
			rightH: right?.info.edges?.[0] ?? 0,
			wallL: (upLeft?.info.edges?.[1] ?? 0) >= 0.5,
			wallR: (upRight?.info.edges?.[0] ?? 0) >= 0.5,
			below: at(0, -1)?.info.edges !== undefined,
			joinL: join !== undefined && left?.info.join === join,
			joinR: join !== undefined && right?.info.join === join,
		};
	}

	/** Builds the geometry of every tile whose surroundings have changed since it was last built. */
	private rebuildTiles(chunk: Chunk): void {
		for (const part of chunk.parts) {
			const build = part.info.build;
			if (!build) continue;
			const around = this.around(part),
				sig = `${around.leftH}|${around.rightH}|${around.wallL}|${around.wallR}|${around.below}|${around.joinL}|${around.joinR}`;
			if (sig === part.sig) continue;
			if (part.sig !== undefined) part.geometry.dispose();
			part.geometry = build(around);
			part.sig = sig;
		}
	}

	/** Rebuilds what changed since the last call. */
	flush(): void {
		const tops = this.columnsDirty ? this.columnHeights() : null;
		this.columnsDirty = false;
		for (const chunk of this.chunks.values()) {
			let wallKey = chunk.wallKey;
			if (tops) {
				const cells: number[] = [];
				for (let c = 0; c < chunkTiles; c++)
					cells.push(tops.open.get(chunk.index * chunkTiles + c) ?? -Infinity);
				wallKey = cells.join(',');
			}
			if (!chunk.dirty && wallKey === chunk.wallKey) continue;
			chunk.wallKey = wallKey;
			chunk.dirty = false;
			this.rebuild(chunk, tops?.open ?? null);
		}
		if (tops) this.rebuildEnds(tops.min, tops.max, tops.leftTop, tops.rightTop);
	}

	/** The surface height of each column of solid ground, and for each pit column how high the wall behind it rises. */
	private columnHeights(): {
		open: Map<number, number>;
		min: number;
		max: number;
		leftTop: number;
		rightTop: number;
	} {
		const rows = new Map<number, Map<number, number>>(),
			pools = new Set<number>(),
			seen = new Set<number>(),
			top = new Map<number, number>();
		for (const chunk of this.chunks.values())
			for (const part of chunk.parts) {
				const column = Math.floor(part.x);
				seen.add(column);
				if (part.info.pool) pools.add(column);
				if (part.info.solidTop === undefined) continue;
				let columnRows = rows.get(column);
				if (!columnRows) rows.set(column, (columnRows = new Map()));
				columnRows.set(Math.floor(part.y), part.y + part.info.solidTop);
			}
		/* A column's surface is the top of the unbroken run of solid tiles from its lowest: blocks floating above a pit
		   are not ground. */
		for (const [column, columnRows] of rows) {
			let row = Math.min(...columnRows.keys());
			while (columnRows.has(row + 1)) row++;
			top.set(column, columnRows.get(row)!);
		}
		for (const column of pools) top.delete(column);
		const columns = [...seen].sort((a, b) => a - b),
			open = new Map<number, number>();
		if (!columns.length) return { open, min: 1, max: 0, leftTop: 0, rightTop: 0 };
		const min = columns[0],
			max = columns[columns.length - 1],
			left = new Float64Array(max - min + 1).fill(NaN),
			right = new Float64Array(max - min + 1).fill(NaN);
		let carry = NaN;
		for (let c = min; c <= max; c++) {
			if (top.has(c)) carry = top.get(c)!;
			left[c - min] = carry;
		}
		carry = NaN;
		for (let c = max; c >= min; c--) {
			if (top.has(c)) carry = top.get(c)!;
			right[c - min] = carry;
		}
		for (let c = min; c <= max; c++) {
			if (top.has(c)) continue;
			const a = left[c - min],
				b = right[c - min],
				h = Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b);
			if (!Number.isNaN(h)) open.set(c, h);
		}
		return { open, min, max, leftTop: top.get(min) ?? 0, rightTop: top.get(max) ?? 0 };
	}

	private rebuild(chunk: Chunk, open: Map<number, number> | null): void {
		this.rebuildTiles(chunk);
		for (const mesh of chunk.meshes) {
			mesh.geometry.dispose();
			this.root.remove(mesh);
		}
		chunk.meshes.length = 0;
		const byLook = new Map<Look, Part[]>();
		for (const part of chunk.parts) {
			let list = byLook.get(part.look);
			if (!list) byLook.set(part.look, (list = []));
			list.push(part);
		}
		const walls: { geometry: THREE.BufferGeometry; x: number; y: number; yaw: number }[] = [];
		for (let c = 0; c < chunkTiles; c++) {
			const column = chunk.index * chunkTiles + c,
				h = open ? open.get(column) : this.wallHeight(chunk, c);
			if (h !== undefined && h > floor)
				walls.push({ geometry: chasmGeometry(column, h, floor, this.theme), x: 0, y: 0, yaw: 0 });
		}
		for (const [look, parts] of byLook) this.mesh(chunk, look, parts);
		if (walls.length) this.mesh(chunk, 'wall', walls);
	}

	/** The wall height remembered in a chunk's key, for rebuilds that did not recompute the columns. */
	private wallHeight(chunk: Chunk, c: number): number | undefined {
		const value = Number(chunk.wallKey.split(',')[c]);
		return Number.isFinite(value) ? value : undefined;
	}

	private mesh(
		chunk: Chunk,
		look: Look,
		parts: readonly { geometry: THREE.BufferGeometry; x: number; y: number; yaw: number }[],
	): void {
		const spec = this.looks[look],
			mesh = new THREE.Mesh(mergeTiles(parts), spec.material);
		mesh.castShadow = spec.cast;
		mesh.receiveShadow = spec.receive;
		mesh.matrixAutoUpdate = false;
		mesh.name = `${this.theme.name} ${look} ${chunk.index}`;
		chunk.meshes.push(mesh);
		this.root.add(mesh);
	}

	/** Rock massifs past each end of the ground, so a wall at the end of the level reads as the edge of a cliff. */
	private rebuildEnds(min: number, max: number, leftTop: number, rightTop: number): void {
		const key = `${min}|${max}|${leftTop}|${rightTop}`;
		if (key === this.endsKey) return;
		this.endsKey = key;
		for (const mesh of this.ends) {
			mesh.geometry.dispose();
			this.root.remove(mesh);
		}
		this.ends.length = 0;
		if (max < min) return;
		for (const [from, top, side] of [
			[min, leftTop, -1],
			[max + 1, rightTop, 1],
		] as const) {
			const mesh = new THREE.Mesh(
				massifGeometry(side, from, massifWidth, floor, top, this.theme),
				this.theme.materials.ground,
			);
			mesh.receiveShadow = true;
			mesh.matrixAutoUpdate = false;
			mesh.name = `${this.theme.name} massif ${side}`;
			this.ends.push(mesh);
			this.root.add(mesh);
		}
	}
}
