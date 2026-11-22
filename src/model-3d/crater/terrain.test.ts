// Tests for the crater terrain models: every sprite maps to a family, actors build and sit on their tiles, and slopes meet the game's collision.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import type { FrameContext, SpriteDraw } from '../../level-3d/types.ts';
import {
	blockGeometry,
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
				if (Math.abs(position.getZ(i)) > 0.8) continue;
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
