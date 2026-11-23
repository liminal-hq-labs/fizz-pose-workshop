// Tests for the crater terrain models: every sprite maps to a family, actors build and sit on their tiles, and slopes meet the game's collision.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import type { FrameContext, SpriteDraw } from '../../level-3d/types.ts';
import { depth } from '../toon.ts';
import {
	crystalGeometry,
	crystalTurns,
	doorGeometry,
	exitBottomGeometry,
	exitTopGeometry,
	spikeGeometry,
} from './features.ts';
import {
	blockGeometry,
	blockTile,
	groundTile,
	platformGeometry,
	walkBand,
	fillGeometry,
	slopeGeometry,
	slopeHeights,
	slopeSurface,
	topGeometry,
	variantCount,
	type SlopeName,
} from './ground.ts';
import { mergeTiles } from './batch.ts';
import { terrainModels } from './terrain.ts';
import { enclosed } from './surroundings.ts';
import { rockFace, stoneRelief } from './stones.ts';
import { Mesher } from './mesher.ts';
import { half } from './ground.ts';

const spriteNames = [
	'craterFill',
	'craterTop',
	'craterBlock',
	'craterR45',
	'craterL45',
	'craterR22A',
	'craterR22B',
	'craterL22A',
	'craterL22B',
	'craterPlat',
	'spike',
	'chocTop0',
	'chocTop1',
	'chocDeep0',
	'chocDeep1',
	'doorRed',
	'exitBot',
	'exitTop',
	'crysM',
	'mtnTop',
	'hillTop',
	'fill',
];

function draw(name: string, x: number, y: number): SpriteDraw {
	return {
		name,
		x,
		y,
		w: 1,
		h: 1,
		flip: false,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: false,
		order: 0,
	};
}

function frameOf(draws: SpriteDraw[]): FrameContext {
	return { time: 1.5, dt: 1 / 60, ben: { x: 10, y: 6 }, camera: { x: 10, y: 9, z: 16 }, draws };
}

describe('terrain families', () => {
	test('every crater sprite belongs to a family', () => {
		for (const name of spriteNames) expect(terrainModels.family(name)).not.toBeNull();
	});

	test('sprites of other sets are left alone', () => {
		for (const name of ['ben_stand', 'gloop0', 'cheezie', 'cloud'])
			expect(terrainModels.family(name)).toBeNull();
	});

	test('animation frames of the chocolate share a family', () => {
		expect(terrainModels.family('chocTop0')).toBe(terrainModels.family('chocTop1'));
		expect(terrainModels.family('chocDeep0')).toBe(terrainModels.family('chocDeep1'));
		expect(terrainModels.family('chocTop0')).not.toBe(terrainModels.family('chocDeep0'));
	});

	test('tiles are fixed and the backdrop is not', () => {
		for (const name of spriteNames) {
			const family = terrainModels.family(name)!;
			expect(terrainModels.fixed?.(family)).toBe(family !== 'backdrop');
		}
	});
});

describe('terrain actors', () => {
	test('every tile actor builds, updates and stands at its sprite', () => {
		for (const name of spriteNames) {
			const family = terrainModels.family(name)!;
			if (family === 'backdrop') continue;
			const first = draw(name, 12.5, 7.5),
				actor = terrainModels.create(family, first);
			actor.update(first, frameOf([first]));
			actor.object.updateMatrix();
			expect(actor.object.position.x).toBe(12.5);
			expect(actor.object.position.y).toBe(7.5);
			expect(actor.object.position.z).toBe(0);
			actor.dispose?.();
		}
	});

	test('backdrop actors attach one shared backdrop to the scene and remove it with the last actor', () => {
		const scene = new THREE.Scene(),
			one = terrainModels.create('backdrop', draw('mtnTop', 10, 5)),
			two = terrainModels.create('backdrop', draw('hillTop', 12, 4));
		scene.add(one.object, two.object);
		one.update(draw('mtnTop', 10, 5), frameOf([]));
		two.update(draw('hillTop', 12, 4), frameOf([]));
		const backdrops = scene.children.filter((child) => child.name === 'crater backdrop');
		expect(backdrops.length).toBe(1);
		one.dispose?.();
		expect(scene.children.filter((child) => child.name === 'crater backdrop').length).toBe(1);
		two.dispose?.();
		expect(scene.children.filter((child) => child.name === 'crater backdrop').length).toBe(0);
	});

	test('a door of two stacked sprites shows its model once, on the lower one', () => {
		const lower = draw('doorRed', 171.5, 6.5),
			upper = draw('doorRed', 171.5, 7.5),
			frame = frameOf([lower, upper]),
			low = terrainModels.create('door', lower),
			high = terrainModels.create('door', upper);
		low.update(lower, frame);
		high.update(upper, frame);
		const visible = (actor: { object: THREE.Object3D }): boolean =>
			(actor.object.children[0] as THREE.Mesh).visible;
		expect(visible(low)).toBe(true);
		expect(visible(high)).toBe(false);
	});

	test('tiles of one family share a geometry and a material', () => {
		const a = terrainModels.create('top', draw('craterTop', 4.5, 3.5)),
			b = terrainModels.create('top', draw('craterTop', 4.5, 3.5));
		expect((a.object as THREE.Mesh).material).toBe((b.object as THREE.Mesh).material);
		expect(blockGeometry()).toBe(blockGeometry());
		expect(fillGeometry(3)).toBe(fillGeometry(3));
	});

	test('the same tile position always picks the same variant', () => {
		const make = (): THREE.BufferGeometry =>
			(terrainModels.create('fill', draw('craterFill', 20.5, 2.5)).object as THREE.Mesh).geometry;
		expect(make()).toBe(make());
	});
});

/** The highest vertex at local x on the left or right edge of a slope tile, as a fraction of the tile above its base. */
function edgeHeight(geometry: THREE.BufferGeometry, edge: -0.5 | 0.5): number {
	const position = geometry.getAttribute('position');
	let top = -Infinity;
	for (let i = 0; i < position.count; i++)
		if (Math.abs(position.getX(i) - edge) < 1e-6) top = Math.max(top, position.getY(i));
	return top + 0.5;
}

describe('slopes meet the game collision', () => {
	const expected: Record<SlopeName, [number, number]> = {
		R45: [0, 1],
		L45: [1, 0],
		R22A: [0, 0.5],
		R22B: [0.5, 1],
		L22A: [1, 0.5],
		L22B: [0.5, 0],
	};
	for (const shape of Object.keys(expected) as SlopeName[])
		test(`${shape} surface runs ${expected[shape][0]} to ${expected[shape][1]}`, () => {
			expect(slopeSurface(shape, 0)).toBe(expected[shape][0]);
			expect(slopeSurface(shape, 1)).toBe(expected[shape][1]);
			expect(slopeHeights[shape].map(Number)).toEqual(expected[shape]);
			for (let v = 0; v < variantCount; v++) {
				const geometry = slopeGeometry(shape, v);
				expect(edgeHeight(geometry, -0.5)).toBeCloseTo(expected[shape][0], 6);
				expect(edgeHeight(geometry, 0.5)).toBeCloseTo(expected[shape][1], 6);
			}
		});

	test('the flat top tile is level at the top of its cell', () => {
		for (let v = 0; v < variantCount; v++) {
			expect(edgeHeight(topGeometry(v), -0.5)).toBeCloseTo(1, 6);
			expect(edgeHeight(topGeometry(v), 0.5)).toBeCloseTo(1, 6);
		}
	});

	test('no part of a slope surface rises above the collision line inside the lane the player walks', () => {
		for (const shape of Object.keys(expected) as SlopeName[]) {
			const geometry = slopeGeometry(shape, 0),
				position = geometry.getAttribute('position');
			for (let i = 0; i < position.count; i++) {
				if (Math.abs(position.getZ(i)) > walkBand - 0.05) continue;
				expect(position.getY(i) + 0.5).toBeLessThanOrEqual(
					slopeSurface(shape, position.getX(i) + 0.5) + 1e-6,
				);
			}
		}
	});
});

describe('winding', () => {
	test('the large triangles of the solid tiles face away from the tile centre', () => {
		const geometries = [
			fillGeometry(0),
			topGeometry(0),
			blockGeometry(),
			...(Object.keys(slopeHeights) as SlopeName[]).map((shape) => slopeGeometry(shape, 0)),
		];
		for (const geometry of geometries) {
			const position = geometry.getAttribute('position'),
				normal = geometry.getAttribute('normal'),
				a = new THREE.Vector3(),
				b = new THREE.Vector3(),
				c = new THREE.Vector3();
			let inward = 0;
			for (let i = 0; i < position.count; i += 3) {
				a.fromBufferAttribute(position, i);
				b.fromBufferAttribute(position, i + 1);
				c.fromBufferAttribute(position, i + 2);
				/* Small triangles belong to studs, drips and tufts, which may face a neighbour rather than away. */
				const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
				if (area < 0.12) continue;
				const centre = a.clone().add(b).add(c).divideScalar(3);
				centre.y += 0.2;
				const dot =
					normal.getX(i) * centre.x + normal.getY(i) * centre.y + normal.getZ(i) * centre.z;
				if (dot < -0.1) inward++;
			}
			expect(inward).toBe(0);
		}
	});
});

describe('door exit', () => {
	test('the lower door sprite drops into the ground when it leaves, and the upper one goes at once', () => {
		const lower = draw('doorRed', 171.5, 6.5),
			upper = draw('doorRed', 171.5, 7.5),
			frame = frameOf([lower, upper]),
			low = terrainModels.create('door', lower),
			high = terrainModels.create('door', upper);
		low.update(lower, frame);
		high.update(upper, frame);
		const seconds = low.leave?.(frame) ?? 0;
		expect(seconds).toBeGreaterThan(0.3);
		expect(high.leave?.(frame)).toBe(0);
		low.leaving?.(0, seconds, frame);
		const start = low.object.position.y;
		low.leaving?.(seconds, seconds, frame);
		expect(low.object.position.y).toBeLessThan(start - 1.5);
		expect(low.object.position.x).toBeCloseTo(171.5, 5);
	});
});

describe('batched terrain', () => {
	const frame = frameOf([]);

	test('a thousand tiles take a handful of meshes, and removing one rebuilds only its chunk', () => {
		const handles: { remove(): void }[] = [],
			before = terrainModels.root?.children.length ?? 0;
		for (let x = 0; x < 100; x++)
			for (let y = 0; y < 10; y++) {
				const name = y === 9 ? 'craterTop' : 'craterFill',
					tile = draw(name, 800.5 + x, y + 0.5),
					placed = terrainModels.place?.(terrainModels.family(name)!, tile);
				expect(placed).not.toBeNull();
				handles.push(placed!);
			}
		terrainModels.sync?.(frame);
		const meshes = (terrainModels.root?.children.length ?? 0) - before;
		expect(meshes).toBeGreaterThan(0);
		expect(meshes).toBeLessThan(40);
		const triangles = (): number =>
			terrainModels
				.root!.children.filter(
					(child) => child.name.includes(' 5') || child.name.includes('crater '),
				)
				.reduce(
					(sum, child) =>
						sum + ((child as THREE.Mesh).geometry.getAttribute('position').count || 0),
					0,
				);
		const full = triangles();
		handles[0].remove();
		terrainModels.sync?.(frame);
		expect(triangles()).toBeLessThan(full);
		for (const handle of handles) handle.remove();
		terrainModels.sync?.(frame);
		expect(terrainModels.root?.children.length).toBe(before);
	});

	test('families drawn as actors, such as the door and the exit, are not placed', () => {
		for (const name of ['doorRed', 'exitBot', 'exitTop', 'mtnTop'])
			expect(terrainModels.place?.(terrainModels.family(name)!, draw(name, 5.5, 5.5))).toBeNull();
	});

	test('a pit between two tiles of ground gets a wall behind it, and a pool has the chocolate attribute for its shader', () => {
		const handles = [
			...[0, 1, 2, 5, 6, 7].map((x) =>
				terrainModels.place!('top', draw('craterTop', 900.5 + x, 3.5))!,
			),
			terrainModels.place!('chocTop', draw('chocTop0', 903.5, 2.5))!,
		];
		terrainModels.sync?.(frame);
		const names = terrainModels.root!.children.map((child) => child.name);
		expect(names.some((name) => name.startsWith('crater wall'))).toBe(true);
		const pool = terrainModels.root!.children.find((child) =>
			child.name.startsWith('crater chocolate'),
		)!;
		expect((pool as THREE.Mesh).geometry.getAttribute('aLocal')).toBeDefined();
		for (const handle of handles) handle.remove();
		terrainModels.sync?.(frame);
	});

	test('merged tiles sit where their sprites are', () => {
		const geometry = mergeTiles([
			{ geometry: topGeometry(0), x: 10, y: 2, yaw: 0 },
			{ geometry: topGeometry(0), x: 20, y: 4, yaw: 0 },
		]);
		geometry.computeBoundingBox();
		expect(geometry.boundingBox!.min.x).toBeGreaterThan(9);
		expect(geometry.boundingBox!.max.x).toBeLessThan(21);
		expect(geometry.getAttribute('position').count).toBe(
			topGeometry(0).getAttribute('position').count * 2,
		);
		expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
	});
});

describe('backdrop', () => {
	test('the parallax follows the camera and not Ben', () => {
		const scene = new THREE.Scene(),
			actor = terrainModels.create('backdrop', draw('mtnTop', 10, 5)),
			sprite = draw('mtnTop', 10, 5);
		scene.add(actor.object);
		const at = (ben: number, camera: number): number => {
			const frame: FrameContext = {
				time: 1,
				dt: 0,
				ben: { x: ben, y: 6 },
				camera: { x: camera, y: 9, z: 16 },
				draws: [],
			};
			actor.update(sprite, frame);
			const root = scene.children.find((child) => child.name === 'crater backdrop')!;
			return root.children.reduce((sum, child) => sum + child.position.x, 0);
		};
		const rest = at(40, 50);
		expect(at(55, 50)).toBeCloseTo(rest, 6);
		expect(at(40, 60)).not.toBeCloseTo(rest, 3);
		actor.dispose?.();
	});
});

/** The bounding box of a geometry, optionally only of the vertices within `zMax` of the middle of the lane. */
function boxOf(geometry: THREE.BufferGeometry, zMax = Infinity): THREE.Box3 {
	const position = geometry.getAttribute('position'),
		box = new THREE.Box3(),
		v = new THREE.Vector3();
	for (let i = 0; i < position.count; i++) {
		v.fromBufferAttribute(position, i);
		if (Math.abs(v.z) <= zMax) box.expandByPoint(v);
	}
	return box;
}

describe('pieces match their art', () => {
	test('the lane is 1.75 deep and the ground fills it', () => {
		expect(depth.lane).toBe(1.75);
		const box = boxOf(topGeometry(0));
		expect(box.min.z).toBeCloseTo(-depth.lane / 2, 6);
		expect(box.max.z).toBeLessThan(depth.lane / 2 + 0.1);
	});

	test('spikes are half a tile tall, stand on the bottom of the cell and fill its width', () => {
		const box = boxOf(spikeGeometry());
		expect(box.min.y).toBeCloseTo(-0.5, 6);
		expect(box.max.y - box.min.y).toBeLessThanOrEqual(0.5 + 1e-6);
		expect(box.max.y - box.min.y).toBeGreaterThan(0.45);
		expect(box.max.x - box.min.x).toBeGreaterThan(0.9);
		expect(box.min.x).toBeGreaterThanOrEqual(-0.5);
		expect(box.max.x).toBeLessThanOrEqual(0.5);
	});

	test('the ledge hangs 0.375 from the top of its cell, ends on the cell edges and is shallower than the ground', () => {
		const box = boxOf(platformGeometry());
		expect(box.max.y).toBeCloseTo(0.5, 6);
		expect(box.min.y).toBeCloseTo(0.125, 6);
		expect(box.min.x).toBeCloseTo(-0.5, 6);
		expect(box.max.x).toBeCloseTo(0.5, 6);
		expect(box.max.z - box.min.z).toBeLessThanOrEqual(depth.shelf + 0.05);
		expect(box.max.z - box.min.z).toBeLessThan(depth.lane);
	});

	test('the block fills its cell exactly, top at the cell top', () => {
		for (const resting of [true, false]) {
			const box = boxOf(blockTile(resting));
			expect(box.min.x).toBeCloseTo(-0.5, 6);
			expect(box.max.x).toBeCloseTo(0.5, 6);
			expect(box.min.y).toBeCloseTo(-0.5, 6);
			expect(box.max.y - 0.5).toBeLessThan(1e-6);
		}
		const floating = boxOf(blockTile(false));
		expect(floating.max.z - floating.min.z).toBeLessThan(boxOf(blockTile(true)).max.z * 2);
	});

	test('the crystal is within 10 percent of the art, 0.81 wide and 0.88 tall, in its cell and behind the hero in every turn', () => {
		for (let turn = 0; turn < crystalTurns; turn++) {
			const box = boxOf(crystalGeometry(turn));
			expect(box.min.y).toBeCloseTo(-0.5, 6);
			expect(Math.abs(box.max.y - box.min.y - 0.875)).toBeLessThan(0.0875);
			expect(Math.abs(box.max.x - box.min.x - 0.8125)).toBeLessThan(0.1);
			expect(box.min.x).toBeGreaterThanOrEqual(-0.5);
			expect(box.max.x).toBeLessThanOrEqual(0.5);
			/* It is scenery at the back of the lane: nothing of it reaches the plane he runs on. */
			expect(box.max.z).toBeLessThan(-0.4);
			expect(box.min.z).toBeGreaterThanOrEqual(-depth.lane / 2);
		}
	});

	test('the door is a tile wide and two tall, and the exit halves are a tile each', () => {
		const door = boxOf(doorGeometry());
		expect(door.max.x - door.min.x).toBeCloseTo(1, 6);
		expect(door.max.y - door.min.y).toBeCloseTo(2, 6);
		for (const geometry of [exitBottomGeometry(), exitTopGeometry()]) {
			const box = boxOf(geometry);
			expect(box.max.x - box.min.x).toBeCloseTo(1, 6);
			expect(box.max.y - box.min.y).toBeCloseTo(1, 6);
		}
	});
});

describe('ground tiles stay in their cell and walk at the collision height', () => {
	const shapes = [
		...(Object.keys(slopeHeights) as SlopeName[]).map((name) => ({
			name,
			hl: slopeHeights[name][0],
			hr: slopeHeights[name][1],
		})),
		{ name: 'top', hl: 1, hr: 1 },
	];
	test('no vertex of a ground or fill tile leaves its cell in X, in any variant or surrounding', () => {
		const around = [
			{ leftH: 0, rightH: 0, wallL: true, wallR: true, below: false },
			{ leftH: 1, rightH: 1, wallL: false, wallR: false, below: true },
			{ leftH: 0, rightH: 1, wallL: true, wallR: false, below: true },
		];
		for (const shape of shapes)
			for (const s of around)
				for (let v = 0; v < variantCount; v++) {
					const box = boxOf(
						groundTile({ hl: shape.hl, hr: shape.hr, crust: true }, 40.5 + v, 6.5, s),
					);
					expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
					expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-6);
					expect(box.min.y).toBeGreaterThanOrEqual(-0.5 - 1e-6);
				}
		for (let v = 0; v < variantCount; v++) {
			const box = boxOf(groundTile({ hl: 1, hr: 1, crust: false }, 40.5 + v, 6.5, around[0]));
			expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
			expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-6);
			expect(box.max.y).toBeLessThanOrEqual(0.5 + 1e-6);
		}
	});

	test('the walking strip of a top tile is exactly at the top of its cell, and only blades, pebbles and sprinkles stand above it', () => {
		for (let v = 0; v < variantCount; v++) {
			const walking = boxOf(
				groundTile(
					{ hl: 1, hr: 1, crust: true },
					20.5 + v,
					3.5,
					enclosed({ hl: 1, hr: 1, crust: true }),
				),
				walkBand - 0.05,
			);
			expect(walking.max.y).toBeCloseTo(0.5, 6);
			const whole = boxOf(topGeometry(v));
			expect(whole.max.y).toBeLessThan(0.5 + 0.2);
		}
	});

	test('the ends of a run sit on the cell boundary: end faces are at x = +/-0.5', () => {
		const end = groundTile({ hl: 1, hr: 1, crust: true }, 10.5, 6.5, {
				leftH: 0,
				rightH: 1,
				wallL: false,
				wallR: false,
				below: true,
			}),
			position = end.getAttribute('position');
		let onEdge = 0;
		for (let i = 0; i < position.count; i++) if (Math.abs(position.getX(i) + 0.5) < 1e-6) onEdge++;
		expect(onEdge).toBeGreaterThan(8);
		expect(boxOf(end).min.x).toBeCloseTo(-0.5, 6);
	});

	test('batched tiles around a gap end exactly on the cell boundaries', () => {
		const frame = frameOf([]),
			handles = [0, 1, 2, 5, 6, 7].map((x) =>
				terrainModels.place!('top', draw('craterTop', 700.5 + x, 3.5))!,
			),
			fills = [0, 1, 2, 5, 6, 7].map((x) =>
				terrainModels.place!('fill', draw('craterFill', 700.5 + x, 2.5))!,
			);
		terrainModels.sync?.(frame);
		const ground = terrainModels.root!.children.filter((child) =>
				child.name.startsWith('crater ground'),
			),
			box = new THREE.Box3();
		for (const mesh of ground) {
			const b = boxOf((mesh as THREE.Mesh).geometry);
			if (b.min.x > 690 && b.max.x < 720) box.union(b);
		}
		/* The ground on the left of the gap ends at 703, the ground on its right starts at 705. */
		const xs: number[] = [];
		for (const mesh of ground) {
			const position = (mesh as THREE.Mesh).geometry.getAttribute('position');
			for (let i = 0; i < position.count; i++)
				if (position.getX(i) > 702.9 && position.getX(i) < 705.1) xs.push(position.getX(i));
		}
		expect(xs.length).toBeGreaterThan(0);
		expect(Math.max(...xs.filter((x) => x < 704))).toBeCloseTo(703, 6);
		expect(Math.min(...xs.filter((x) => x > 704))).toBeCloseTo(705, 6);
		for (const handle of [...handles, ...fills]) handle.remove();
		terrainModels.sync?.(frame);
	});
});

/** The triangles of a geometry that face straight out along +Z at or beyond `zMin`: their corners and colours. */
function frontTriangles(
	geometry: THREE.BufferGeometry,
	zMin: number,
): { points: THREE.Vector3[]; colours: number[] }[] {
	const position = geometry.getAttribute('position'),
		normal = geometry.getAttribute('normal'),
		colour = geometry.getAttribute('color'),
		out: { points: THREE.Vector3[]; colours: number[] }[] = [];
	for (let i = 0; i < position.count; i += 3) {
		if (normal.getZ(i) < 0.999) continue;
		const points = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k));
		if (points.some((p) => p.z < zMin)) continue;
		out.push({
			points,
			colours: [0, 1, 2].map(
				(k) => colour.getX(i + k) + 7 * colour.getY(i + k) + 31 * colour.getZ(i + k),
			),
		});
	}
	return out;
}

/** The colours of the vertices that lie on the vertical line x = `x` in front triangles, keyed by height. */
function edgeColours(
	triangles: { points: THREE.Vector3[]; colours: number[] }[],
	x: number,
): Map<string, number> {
	const out = new Map<string, number>();
	for (const t of triangles)
		t.points.forEach((p, k) => {
			if (Math.abs(p.x - x) < 1e-6) out.set(p.y.toFixed(5), Math.round(t.colours[k] * 1e4) / 1e4);
		});
	return out;
}

describe('masonry', () => {
	test('the front of a block has at least four courses of bricks, and each tile has more than four bricks', () => {
		for (const resting of [true, false]) {
			const d = resting ? half : depth.shelf / 2,
				fronts = frontTriangles(blockTile(resting, { x: 12.5, y: 7.5 }), d + 0.02),
				bricks = new Set<string>();
			for (const t of fronts) {
				const xs = t.points.map((p) => p.x),
					ys = t.points.map((p) => p.y);
				bricks.add(`${Math.min(...xs).toFixed(3)}|${Math.min(...ys).toFixed(3)}`);
			}
			/* Each brick's flat front is two triangles, sharing a corner at its lower left. */
			const courses = new Set([...bricks].map((b) => b.split('|')[1]));
			expect(courses.size).toBeGreaterThanOrEqual(4);
			expect(bricks.size).toBeGreaterThanOrEqual(6);
		}
	});

	test('bricks stand at most 0.04 out of the mortar, and the block keeps to its cell', () => {
		const resting = blockTile(false, { x: 12.5, y: 7.5 }),
			box = boxOf(resting);
		expect(box.max.z).toBeLessThanOrEqual(depth.shelf / 2 + 0.04 + 1e-6);
		expect(box.max.y).toBeLessThanOrEqual(0.5 + 1e-6);
		expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
		expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-6);
	});

	test('the joints of neighbouring blocks line up: the bricks that cross a tile edge match on both sides', () => {
		const d = depth.shelf / 2,
			left = frontTriangles(
				blockTile(false, { x: 12.5, y: 7.5 }, { leftH: 1, rightH: 1 }),
				d + 0.02,
			),
			right = frontTriangles(
				blockTile(false, { x: 13.5, y: 7.5 }, { leftH: 1, rightH: 1 }),
				d + 0.02,
			),
			a = edgeColours(left, 0.5),
			b = edgeColours(right, -0.5);
		expect(a.size).toBeGreaterThan(0);
		expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
		for (const [y, c] of a) expect(b.get(y)).toBeCloseTo(c, 3);
		/* Every other course is shifted by a quarter tile, so the straddling bricks are on alternate courses only. */
		const ys = new Set([...a.keys()].map((y) => Math.floor((Number(y) + 0.5) * 4 + 1e-6)));
		expect(ys.size).toBeLessThanOrEqual(2);
	});

	test('a stack of blocks and its neighbours keep the same courses: tiles in a column share their course lines', () => {
		const d = depth.shelf / 2,
			low = frontTriangles(blockTile(false, { x: 12.5, y: 7.5 }), d + 0.02),
			high = frontTriangles(blockTile(false, { x: 12.5, y: 8.5 }), d + 0.02),
			bottoms = (t: typeof low): string[] =>
				[
					...new Set(
						t
							.filter(
								(x) =>
									Math.max(...x.points.map((p) => p.y)) - Math.min(...x.points.map((p) => p.y)) >
									0.1,
							)
							.map((x) => Math.min(...x.points.map((p) => p.y)).toFixed(3)),
					),
				].sort();
		expect(bottoms(low)).toEqual(bottoms(high));
	});

	test('a face of rock has many small stones, and its relief stays under 0.04', () => {
		const m = new Mesher();
		rockFace(m, {
			map: (u, v, w) => [u, v, half + w],
			u0: -0.5,
			u1: 0.5,
			v0: -0.5,
			t0: 0.5,
			t1: 0.5,
			originU: 40.5,
			originV: 3.5,
			face: 0,
			joint: 0x32104a,
			tone: (c) => c,
			bevelled: 'lit',
		});
		const geometry = m.build(),
			position = geometry.getAttribute('position');
		let top = -Infinity;
		for (let i = 0; i < position.count; i++) top = Math.max(top, position.getZ(i));
		expect(top - half).toBeLessThanOrEqual(stoneRelief + 1e-6);
		expect(stoneRelief).toBeLessThanOrEqual(0.04);
		const fronts = frontTriangles(geometry, half + 0.005);
		/* Two triangles to a stone face: a tile's face holds at least six stones, none of them a tile wide. */
		expect(fronts.length).toBeGreaterThanOrEqual(12);
		for (const t of fronts) {
			const xs = t.points.map((p) => p.x);
			expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1 - 1e-6);
		}
	});

	test('the stones of neighbouring fill tiles line up: a stone cut by the tile edge matches on both sides', () => {
		const shape = { hl: 1, hr: 1, crust: false },
			a = frontTriangles(groundTile(shape, 40.5, 3.5, enclosed(shape)), half + 0.005),
			b = frontTriangles(groundTile(shape, 41.5, 3.5, enclosed(shape)), half + 0.005),
			left = edgeColours(a, 0.5),
			right = edgeColours(b, -0.5);
		/* A stone that crosses the edge by less than its own joint is drawn on one side only; every other one matches. */
		const shared = [...left.keys()].filter((y) => right.has(y));
		expect(shared.length).toBeGreaterThanOrEqual(4);
		expect(shared.length).toBeGreaterThanOrEqual(left.size - 3);
		for (const y of shared) expect(right.get(y)).toBeCloseTo(left.get(y)!, 3);
	});

	test('the ledge is cut into planks, and is shallower than a block of the ground', () => {
		expect(depth.shelf).toBeLessThanOrEqual(0.8);
		const d = depth.shelf / 2,
			fronts = frontTriangles(platformGeometry(), d - 0.001),
			planks = new Set(fronts.map((t) => Math.min(...t.points.map((p) => p.x)).toFixed(3)));
		expect(planks.size).toBeGreaterThanOrEqual(2);
		const box = boxOf(platformGeometry());
		expect(box.max.z - box.min.z).toBeLessThan(0.9);
	});
});

describe('actors keep what they need from the pooled draw', () => {
	test('a door that leaves stays where it stood when the draw it was made from is refilled', () => {
		const lower = draw('doorRed', 171.5, 6.5),
			upper = draw('doorRed', 171.5, 7.5),
			frame = frameOf([lower, upper]),
			actor = terrainModels.create('door', lower);
		actor.update(lower, frame);
		/* The reader refills the same record with whatever sprite is at that index now. */
		lower.x = 40.5;
		lower.y = 2.5;
		const seconds = actor.leave?.(frame) ?? 0;
		expect(seconds).toBeGreaterThan(0);
		let previous = 6.5;
		for (let t = 0; t <= seconds + 1e-9; t += seconds / 20) {
			actor.leaving?.(t, seconds, frame);
			expect(Math.abs(actor.object.position.x - 171.5)).toBeLessThan(0.05);
			expect(actor.object.position.y).toBeLessThanOrEqual(previous + 1e-9);
			expect(actor.object.position.y).toBeLessThanOrEqual(6.5 + 1e-9);
			previous = actor.object.position.y;
		}
	});

	test('batched tiles build for the place they were drawn at, not where the pooled draw ends up', () => {
		const tile = draw('craterBlock', 960.5, 3.5),
			placed = terrainModels.place!('block', tile)!;
		tile.x = 5.5;
		tile.y = 5.5;
		terrainModels.sync?.(frameOf([]));
		const meshes = terrainModels.root!.children.filter((c) => c.name.startsWith('crater ground'));
		const found = meshes.some((mesh) => {
			const b = boxOf((mesh as THREE.Mesh).geometry);
			return b.min.x > 955 && b.max.x < 965;
		});
		expect(found).toBe(true);
		placed.remove();
		terrainModels.sync?.(frameOf([]));
	});
});
