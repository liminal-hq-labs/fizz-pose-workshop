// Draws the overworld's fixed tiles in a few meshes: the land, the river and everything that stands on it are merged into chunks of tiles.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Placed } from '../../level-3d/types.ts';
import { toonRamp } from '../ben-g/shared.ts';
import { lattice } from '../crater/hash.ts';
import { Mesher } from '../crater/mesher.ts';
import { decalDetails, detailGeometry, detailVariants, scatter } from './details.ts';
import type { Region } from './palette.ts';
import { sceneryGeometry, sceneryScale, sceneryVariants } from './scenery.ts';
import { append, lathe, newSink, type Sink } from './shapes.ts';
import { kinds, Terrain, waterZ } from './terrain.ts';
import { addRiverTile, riverGeometry, riverMaterial, riverTime, seaMesh } from './water.ts';

/** How wide a chunk is, in tiles: few draw calls, and the far ones can be culled. */
export const chunkTiles = 30;
/** How many cells a tile of land is cut into along each side. */
const cells = 4;
const glintCapacity = 160;

/** Vertex-coloured toon shading for the land. */
export const landMaterial = new THREE.MeshToonMaterial({
	vertexColors: true,
	gradientMap: toonRamp,
});

/** Vertex-coloured toon shading for what stands on the land. */
export const standingMaterial = new THREE.MeshToonMaterial({
	vertexColors: true,
	gradientMap: toonRamp,
});

/** The clock the river's sparkles read. */
const glintTime = { value: 0 };

const glintMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
glintMaterial.onBeforeCompile = (shader) => {
	shader.uniforms.uTime = glintTime;
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nuniform float uTime;')
		.replace(
			'#include <begin_vertex>',
			`#include <begin_vertex>
float twinkle = 0.5 + 0.5 * sin(uTime * 3.2 + instanceMatrix[3].x * 2.7 + instanceMatrix[3].y * 1.9);
transformed *= 0.15 + 0.85 * twinkle;`,
		);
};
glintMaterial.customProgramCacheKey = () => 'overworld-glint';

function glintGeometry(): THREE.BufferGeometry {
	const m = new Mesher();
	lathe(
		m,
		[
			{ r: 0, z: -0.16, colour: 0xffffff },
			{ r: 0.05, z: 0, colour: 0xffffff },
			{ r: 0, z: 0.16, colour: 0xffffff },
		],
		{ sides: 4, bake: 0 },
	);
	return m.build();
}

/** A standing thing placed on a tile: scenery, or a detail scattered over the ground. */
interface Standing {
	x: number;
	y: number;
	family: string;
	look: number;
	variant: number;
	yaw: number;
	scale: number;
	/** Set for the sim's own ground decals, which keep their place. */
	detail?: string;
	/** Set for a built model, which stands on the highest ground under `reach` and sinks a little into it. */
	geometry?: THREE.BufferGeometry;
	reach?: number;
	sink?: number;
}

interface Chunk {
	cx: number;
	cy: number;
	standing: Set<Standing>;
	land: THREE.Mesh | null;
	water: THREE.Mesh | null;
	things: THREE.Mesh | null;
	dirty: boolean;
}

const noop: Placed = { remove() {} };

function key(cx: number, cy: number): number {
	return (cx + 512) * 1024 + cy + 512;
}

/** A place on the ground that a model stands on and keeps the scattered details away from. */
interface Claim {
	x: number;
	y: number;
	r: number;
}

const colour = new THREE.Color();

export class OverworldBatch {
	readonly root = new THREE.Group();
	readonly terrain = new Terrain();
	private readonly chunks = new Map<number, Chunk>();
	private readonly claims: Claim[] = [];
	private readonly glints: THREE.InstancedMesh;
	private readonly glintSlots = new Map<number, number>();
	private readonly freeGlints: number[] = [];
	private glintCount = 0;
	private sea: THREE.Mesh | null = null;
	private tiles = 0;

	constructor() {
		this.root.name = 'overworld ground';
		this.glints = new THREE.InstancedMesh(glintGeometry(), glintMaterial, glintCapacity);
		this.glints.count = 0;
		this.glints.frustumCulled = false;
		this.glints.name = 'overworld glints';
		this.root.add(this.glints);
	}

	/** Number of meshes the batch has in the scene, for tests and the report. */
	get meshCount(): number {
		let n = this.glints.count > 0 ? 1 : 0;
		for (const chunk of this.chunks.values())
			n += (chunk.land ? 1 : 0) + (chunk.water ? 1 : 0) + (chunk.things ? 1 : 0);
		return n + (this.sea ? 1 : 0);
	}

	private chunk(tx: number, ty: number): Chunk {
		const cx = Math.floor(tx / chunkTiles),
			cy = Math.floor(ty / chunkTiles);
		let chunk = this.chunks.get(key(cx, cy));
		if (!chunk) {
			chunk = { cx, cy, standing: new Set(), land: null, water: null, things: null, dirty: true };
			this.chunks.set(key(cx, cy), chunk);
		}
		return chunk;
	}

	/** Marks the chunks that a change at a tile can reach: its own and any it borders. */
	private touch(tx: number, ty: number): void {
		for (const dy of [-1, 0, 1])
			for (const dx of [-1, 0, 1]) this.chunk(tx + dx, ty + dy).dirty = true;
	}

	/** Puts a tile of ground, path or river on the map. */
	placeTile(
		kind: number,
		draw: { x: number; y: number; tint: number },
		region: Region = 'crater',
	): Placed {
		const tx = Math.floor(draw.x),
			ty = Math.floor(draw.y);
		this.terrain.set(tx, ty, kind, region, draw.tint);
		this.tiles++;
		this.touch(tx, ty);
		return {
			remove: () => {
				this.terrain.set(tx, ty, kinds.none);
				this.tiles--;
				this.touch(tx, ty);
			},
		};
	}

	/** Puts a piece of scenery on the tile whose south edge its sprite stands on. */
	placeScenery(
		family: string,
		spriteName: string,
		draw: { x: number; y: number; h: number },
	): Placed {
		const tx = Math.floor(draw.x),
			ty = Math.round(draw.y - draw.h / 2),
			look = spriteName.endsWith('1') ? 1 : 0,
			[least, most] = sceneryScale[family],
			item: Standing = {
				x: tx + 0.5 + (lattice(tx, ty, 51) - 0.5) * 0.2,
				y: ty + 0.5 + (lattice(tx, ty, 52) - 0.5) * 0.2,
				family,
				look,
				variant: Math.floor(lattice(tx, ty, 53) * sceneryVariants) % sceneryVariants,
				yaw: lattice(tx, ty, 54) * Math.PI * 2,
				scale: least + (most - least) * lattice(tx, ty, 55),
			},
			chunk = this.chunk(tx, ty);
		chunk.standing.add(item);
		chunk.dirty = true;
		return {
			remove: () => {
				chunk.standing.delete(item);
				chunk.dirty = true;
			},
		};
	}

	/** Puts a built model on the ground at a place, and keeps the scattered details away from it. */
	placeModel(
		geometry: THREE.BufferGeometry,
		at: { x: number; y: number },
		options: { reach: number; sink?: number; yaw?: number; claims?: boolean },
	): Placed {
		const item: Standing = {
				x: at.x,
				y: at.y,
				family: 'model',
				look: 0,
				variant: 0,
				yaw: options.yaw ?? 0,
				scale: 1,
				geometry,
				reach: options.reach,
				sink: options.sink ?? 0.05,
			},
			chunk = this.chunk(Math.floor(at.x), Math.floor(at.y)),
			release = options.claims === false ? () => {} : this.claim(at.x, at.y, options.reach);
		chunk.standing.add(item);
		chunk.dirty = true;
		return {
			remove: () => {
				chunk.standing.delete(item);
				chunk.dirty = true;
				release();
			},
		};
	}

	/** The highest ground within `reach` of a point, so a building does not hang over a dip. */
	groundUnder(x: number, y: number, reach: number): number {
		let z = this.terrain.height(x, y);
		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		])
			z = Math.max(z, this.terrain.height(x + dx * reach * 0.7, y + dy * reach * 0.7));
		return z;
	}

	/** Puts one of the sim's ground decals where the sim drew it. */
	placeDecal(spriteName: string, draw: { x: number; y: number }): Placed {
		const number = Number(spriteName.slice(-1)),
			tx = Math.floor(draw.x),
			ty = Math.floor(draw.y),
			item: Standing = {
				x: draw.x,
				y: draw.y,
				family: 'decal',
				look: 0,
				variant: Math.floor(lattice(tx, ty, 56) * detailVariants) % detailVariants,
				yaw: lattice(tx, ty, 57) * Math.PI * 2,
				scale: 1,
				detail: decalDetails[number] ?? decalDetails[0],
			},
			chunk = this.chunk(tx, ty);
		chunk.standing.add(item);
		chunk.dirty = true;
		return {
			remove: () => {
				chunk.standing.delete(item);
				chunk.dirty = true;
			},
		};
	}

	/** A sparkle on the river, which twinkles from the shader's clock. */
	placeGlint(draw: { x: number; y: number }): Placed {
		const slot = this.freeGlints.pop() ?? this.glintCount++,
			id = Math.round(draw.x * 4) * 4096 + Math.round(draw.y * 4);
		if (slot >= glintCapacity) return noop;
		this.glintSlots.set(id, slot);
		const matrix = new THREE.Matrix4().makeTranslation(draw.x, draw.y, waterZ + 0.1);
		this.glints.setMatrixAt(slot, matrix);
		this.glints.count = this.glintCount;
		this.glints.instanceMatrix.needsUpdate = true;
		return {
			remove: () => {
				this.glintSlots.delete(id);
				this.glints.setMatrixAt(slot, new THREE.Matrix4().makeScale(0, 0, 0));
				this.glints.instanceMatrix.needsUpdate = true;
				this.freeGlints.push(slot);
			},
		};
	}

	/** Keeps the scattered details off a circle of ground that a model stands on; returns a handle that frees it. */
	claim(x: number, y: number, r: number): () => void {
		const claim = { x, y, r };
		this.claims.push(claim);
		this.touch(Math.floor(x), Math.floor(y));
		return () => {
			const at = this.claims.indexOf(claim);
			if (at >= 0) this.claims.splice(at, 1);
			this.touch(Math.floor(x), Math.floor(y));
		};
	}

	/** Whether a point lies inside a circle some model has claimed. */
	isClaimed(x: number, y: number): boolean {
		for (const claim of this.claims)
			if (Math.hypot(x - claim.x, y - claim.y) < claim.r) return true;
		return false;
	}

	/** Rebuilds the meshes of every chunk that changed since the last call. */
	flush(): void {
		for (const chunk of this.chunks.values()) {
			if (!chunk.dirty) continue;
			chunk.dirty = false;
			this.rebuild(chunk);
		}
		if (this.tiles > 0 && !this.sea) this.buildSea();
		else if (this.tiles === 0 && this.sea) this.dropSea();
	}

	/** Sets the clocks the river and its sparkles read. */
	setTime(time: number): void {
		riverTime.value = time;
		glintTime.value = time;
	}

	private buildSea(): void {
		const bounds = this.mapBounds();
		if (bounds.x1 < bounds.x0) return;
		this.sea = seaMesh(bounds, 400);
		this.root.add(this.sea);
	}

	/** Takes the sea away when the map's tiles are gone, so it does not hang behind a level. */
	private dropSea(): void {
		if (!this.sea) return;
		this.root.remove(this.sea);
		this.sea.geometry.dispose();
		this.sea = null;
	}

	/** The rectangle of tiles the map covers, from the tiles the grid holds. */
	private mapBounds(): { x0: number; y0: number; x1: number; y1: number } {
		let x0 = Infinity,
			y0 = Infinity,
			x1 = -Infinity,
			y1 = -Infinity;
		for (const chunk of this.chunks.values())
			for (let y = chunk.cy * chunkTiles; y < (chunk.cy + 1) * chunkTiles; y++)
				for (let x = chunk.cx * chunkTiles; x < (chunk.cx + 1) * chunkTiles; x++)
					if (this.terrain.kindAt(x, y) !== kinds.none) {
						x0 = Math.min(x0, x);
						y0 = Math.min(y0, y);
						x1 = Math.max(x1, x + 1);
						y1 = Math.max(y1, y + 1);
					}
		return { x0, y0, x1, y1 };
	}

	private replace(chunk: Chunk, slot: 'land' | 'water' | 'things', mesh: THREE.Mesh | null): void {
		const old = chunk[slot];
		if (old) {
			old.geometry.dispose();
			this.root.remove(old);
		}
		chunk[slot] = mesh;
		if (mesh) this.root.add(mesh);
	}

	private rebuild(chunk: Chunk): void {
		const x0 = chunk.cx * chunkTiles,
			y0 = chunk.cy * chunkTiles;
		this.replace(chunk, 'land', this.buildLand(chunk, x0, y0));
		this.replace(chunk, 'water', this.buildWater(chunk, x0, y0));
		this.replace(chunk, 'things', this.buildThings(chunk, x0, y0));
	}

	private buildLand(chunk: Chunk, x0: number, y0: number): THREE.Mesh | null {
		const terrain = this.terrain,
			n = chunkTiles * cells + 1,
			indexOf = [new Int32Array(n * n).fill(-1), new Int32Array(n * n).fill(-1)],
			positions: number[] = [],
			normals: number[] = [],
			colours: number[] = [],
			indices: number[] = [],
			normal: [number, number, number] = [0, 0, 1],
			heights = new Float32Array(n * n).fill(NaN);
		let used = 0;
		const vertex = (i: number, j: number, owner: number): number => {
			const at = j * n + i,
				index = indexOf[owner === kinds.path ? 1 : 0];
			if (index[at] >= 0) return index[at];
			const u = x0 + i / cells,
				v = y0 + j / cells,
				z = terrain.height(u, v);
			terrain.normal(u, v, normal);
			colour.setHex(terrain.colour(u, v, owner));
			positions.push(u, v, z);
			normals.push(normal[0], normal[1], normal[2]);
			colours.push(colour.r, colour.g, colour.b);
			heights[at] = z;
			return (index[at] = used++);
		};
		for (let ty = 0; ty < chunkTiles; ty++)
			for (let tx = 0; tx < chunkTiles; tx++) {
				const kind = terrain.kindAt(x0 + tx, y0 + ty);
				if (kind !== kinds.grass && kind !== kinds.path) continue;
				for (let b = 0; b < cells; b++)
					for (let a = 0; a < cells; a++) {
						const i = tx * cells + a,
							j = ty * cells + b,
							v00 = vertex(i, j, kind),
							v10 = vertex(i + 1, j, kind),
							v11 = vertex(i + 1, j + 1, kind),
							v01 = vertex(i, j + 1, kind),
							flip =
								Math.abs(heights[j * n + i] - heights[(j + 1) * n + i + 1]) >
								Math.abs(heights[j * n + i + 1] - heights[(j + 1) * n + i]);
						if (flip) indices.push(v00, v10, v01, v10, v11, v01);
						else indices.push(v00, v10, v11, v00, v11, v01);
					}
			}
		if (!used) return null;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
		geometry.setIndex(indices);
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(geometry, landMaterial);
		mesh.name = `overworld land ${chunk.cx},${chunk.cy}`;
		mesh.receiveShadow = true;
		mesh.castShadow = false;
		mesh.matrixAutoUpdate = false;
		return mesh;
	}

	private buildWater(chunk: Chunk, x0: number, y0: number): THREE.Mesh | null {
		const out = { positions: [] as number[], colours: [] as number[], indices: [] as number[] },
			tint = new THREE.Color();
		for (let ty = 0; ty < chunkTiles; ty++)
			for (let tx = 0; tx < chunkTiles; tx++)
				if (this.terrain.kindAt(x0 + tx, y0 + ty) === kinds.river) {
					tint.setHex(this.terrain.tintAt(x0 + tx, y0 + ty));
					addRiverTile(out, x0 + tx, y0 + ty, tint);
				}
		if (!out.indices.length) return null;
		const mesh = new THREE.Mesh(riverGeometry(out), riverMaterial);
		mesh.name = `overworld river ${chunk.cx},${chunk.cy}`;
		mesh.receiveShadow = false;
		mesh.castShadow = false;
		mesh.matrixAutoUpdate = false;
		return mesh;
	}

	/** Scenery, the sim's decals, and the details scattered over open ground. */
	private buildThings(chunk: Chunk, x0: number, y0: number): THREE.Mesh | null {
		const sink: Sink = newSink(),
			terrain = this.terrain,
			taken = new Set<number>();
		for (const item of chunk.standing) {
			const tx = Math.floor(item.x),
				ty = Math.floor(item.y);
			taken.add(ty * 4096 + tx);
			if (item.geometry) {
				append(
					sink,
					item.geometry,
					item.x,
					item.y,
					this.groundUnder(item.x, item.y, item.reach ?? 0) - (item.sink ?? 0),
					item.yaw,
					item.scale,
				);
				continue;
			}
			const geometry = item.detail
					? detailGeometry(item.detail, item.variant)
					: sceneryGeometry(item.family, item.look, item.variant),
				sink_ = item.detail ? 0 : 0.03;
			append(
				sink,
				geometry,
				item.x,
				item.y,
				terrain.height(item.x, item.y) - sink_,
				item.yaw,
				item.scale,
			);
		}
		for (let ty = y0; ty < y0 + chunkTiles; ty++)
			for (let tx = x0; tx < x0 + chunkTiles; tx++) {
				if (terrain.kindAt(tx, ty) !== kinds.grass || taken.has(ty * 4096 + tx)) continue;
				const region = terrain.regionAt(tx, ty),
					roll = lattice(tx, ty, 61);
				let sum = 0;
				for (const [name, chance] of scatter[region]) {
					sum += chance;
					if (roll >= sum) continue;
					const x = tx + 0.15 + lattice(tx, ty, 62) * 0.7,
						y = ty + 0.15 + lattice(tx, ty, 63) * 0.7;
					if (
						terrain.pathDistance(x, y) < 0.35 ||
						terrain.waterDistance(x, y) < 0.9 ||
						this.isClaimed(x, y)
					)
						break;
					const variant = Math.floor(lattice(tx, ty, 64) * detailVariants) % detailVariants;
					append(
						sink,
						detailGeometry(name, variant),
						x,
						y,
						terrain.height(x, y) - 0.01,
						lattice(tx, ty, 65) * Math.PI * 2,
						0.85 + lattice(tx, ty, 66) * 0.4,
					);
					break;
				}
			}
		if (!sink.positions.length) return null;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(sink.positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(sink.normals, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(sink.colours, 3));
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(geometry, standingMaterial);
		mesh.name = `overworld things ${chunk.cx},${chunk.cy}`;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.matrixAutoUpdate = false;
		return mesh;
	}
}
