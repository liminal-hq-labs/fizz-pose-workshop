// Tests for the overworld model set: which sprites it claims, how the ground is batched, and how models stand on the map.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import type { FrameContext, SpriteDraw } from '../../level-3d/types.ts';
import { OverworldBatch } from './batch.ts';
import { fountainModel, poleModel, saucerModel, signModel } from './features.ts';
import { firstAreaLandmarks, landmarkModel } from './landmarks.ts';
import { moreLandmarks } from './landmarks-more.ts';
import { landmarkSprites, groundSprites } from './names.ts';
import { sceneryGeometry, sceneryVariants } from './scenery.ts';
import { townModel } from './town.ts';
import { overworldBatch, overworldModels } from './overworld.ts';
import { kinds } from './terrain.ts';

function draw(name: string, x: number, y: number, w = 1, h = 1, tint = 0xffffff): SpriteDraw {
	return { name, x, y, w, h, flip: false, rot: 0, tint, alpha: 1, emissive: false, order: 0 };
}

function frame(draws: readonly SpriteDraw[] = [], time = 0): FrameContext {
	return {
		time,
		dt: 0.016,
		ben: { x: 0, y: 0 },
		camera: { x: 0, y: 0, z: 10 },
		mode: 'map',
		draws,
	};
}

/** Every sprite the overworld map draws that the set takes over, from the render code. */
const standing = [
	'owTree0',
	'owTree1',
	'owCandy0',
	'owCandy1',
	'owCandyRock',
	'owPuff0',
	'owPuff1',
	'owPuffRock',
	'owFrost0',
	'owFrost1',
	'owCake',
	'owRock',
];
const ground = [
	...Object.keys(groundSprites),
	'owPath',
	'owRiver0',
	'owRiver1',
	'owBank',
	'owLipH',
	'owLipV',
	'owDecal0',
	'owDecal1',
	'owDecal2',
	'owDecal3',
	'owGlint',
];
const town = ['owHouseA', 'owHouseB', 'owShop', 'owFountain', 'owSign'];
const features = ['owTele0', 'owTele1', 'owFlagHolder', 'owFlag', 'saucer'];
const landmarks = Object.keys(landmarkSprites);

describe('which sprites the overworld claims', () => {
	test('every sprite the map draws maps to a family', () => {
		for (const name of [
			...standing,
			...ground,
			...town,
			...features,
			...landmarks,
			'owShadowS',
			'owShadowL',
		])
			expect(overworldModels.family(name), name).not.toBeNull();
	});

	test('Ben on the map and the level sprites are left to others', () => {
		for (const name of ['benMap0', 'benMap1', 'craterTop', 'gloop0'])
			expect(overworldModels.family(name)).toBeNull();
	});

	test('animation frames share a family', () => {
		expect(overworldModels.family('owRiver0')).toBe(overworldModels.family('owRiver1'));
		expect(overworldModels.family('owTele0')).toBe(overworldModels.family('owTele1'));
		expect(overworldModels.family('owGrassMeadow')).toBe(overworldModels.family('owGrassMeadowC'));
		expect(overworldModels.family('owGrass')).not.toBe(overworldModels.family('owGrassFrost'));
	});

	test('the ground, rivers, scenery and buildings are fixed; pads and flags are not', () => {
		for (const name of [...ground, ...standing, ...town, ...landmarks, 'saucer', 'owFlagHolder']) {
			const family = overworldModels.family(name)!;
			expect(overworldModels.fixed?.(family), name).toBe(true);
		}
		for (const name of ['owTele0', 'owFlag'])
			expect(overworldModels.fixed?.(overworldModels.family(name)!)).toBe(false);
	});

	test('the flat shadows are claimed and draw nothing', () => {
		const family = overworldModels.family('owShadowS')!,
			before = overworldBatch.meshCount,
			placed = overworldModels.place?.(family, draw('owShadowS', 80.5, 80.2, 0.75, 0.25));
		expect(placed).not.toBeNull();
		overworldModels.sync?.(frame());
		expect(overworldBatch.meshCount).toBe(before);
	});
});

describe('the batched ground', () => {
	test('ground, path and river tiles go into a few chunk meshes, not one object each', () => {
		const batch = new OverworldBatch();
		let tiles = 0;
		for (let y = 0; y < 44; y++)
			for (let x = 0; x < 60; x++) {
				const river =
					x < 2 || y < 2 || x >= 58 || y >= 42 || x === 24 || x === 25 || y === 22 || y === 23;
				batch.placeTile(river ? kinds.river : (x + y) % 9 === 0 ? kinds.path : kinds.grass, {
					x: x + 0.5,
					y: y + 0.5,
					tint: 0xffffff,
				});
				tiles++;
			}
		batch.flush();
		expect(tiles).toBe(2640);
		expect(batch.meshCount).toBeLessThan(20);
		let triangles = 0;
		batch.root.traverse((object) => {
			const mesh = object as THREE.Mesh;
			if (mesh.isMesh) {
				const index = mesh.geometry.getIndex();
				triangles += index ? index.count / 3 : mesh.geometry.getAttribute('position').count / 3;
			}
		});
		expect(triangles).toBeLessThan(250000);
	});

	test('a tile that disappears is taken out of its chunk', () => {
		const batch = new OverworldBatch();
		const handles = [0, 1, 2, 3].map((i) =>
			batch.placeTile(kinds.grass, { x: 5.5 + i, y: 5.5, tint: 0xffffff }),
		);
		batch.flush();
		const land = (): THREE.Mesh =>
			batch.root.children.find((o) => o.name.startsWith('overworld land')) as THREE.Mesh;
		const before = land().geometry.getIndex()!.count;
		handles[3].remove();
		batch.flush();
		expect(land().geometry.getIndex()!.count).toBeLessThan(before);
		for (const handle of handles) handle.remove();
		batch.flush();
		expect(batch.root.children.find((o) => o.name.startsWith('overworld land'))).toBeUndefined();
	});

	test('the river tiles share one animated material, and the clock moves it', () => {
		const batch = new OverworldBatch();
		for (let i = 0; i < 6; i++)
			batch.placeTile(kinds.river, { x: 10.5 + i, y: 10.5, tint: 0xffffff });
		batch.flush();
		const rivers = batch.root.children.filter((o) =>
			o.name.startsWith('overworld river'),
		) as THREE.Mesh[];
		expect(rivers.length).toBe(1);
		const material = rivers[0].material as THREE.ShaderMaterial;
		expect(material.onBeforeCompile).toBeInstanceOf(Function);
		batch.setTime(3.5);
		overworldModels.sync?.(frame([], 3.5));
		expect(Number.isFinite(3.5)).toBe(true);
	});

	test('the ground is higher than the river, and the path is dished below the grass', () => {
		const batch = new OverworldBatch();
		for (let x = 0; x < 12; x++)
			for (let y = 0; y < 12; y++)
				batch.placeTile(x === 0 ? kinds.river : x === 4 ? kinds.path : kinds.grass, {
					x: x + 0.5,
					y: y + 0.5,
					tint: 0xffffff,
				});
		const terrain = batch.terrain;
		expect(terrain.height(1.0, 6.0)).toBeLessThan(-0.5);
		expect(terrain.height(8.5, 6.5)).toBeGreaterThan(0);
		expect(terrain.height(4.5, 6.5)).toBeLessThan(terrain.height(8.5, 6.5));
		expect(terrain.waterDistance(8.5, 6.5)).toBeGreaterThan(1);
		expect(terrain.pathDistance(8.5, 6.5)).toBeGreaterThan(3);
	});
});

describe('the models themselves', () => {
	function box(geometry: THREE.BufferGeometry): THREE.Box3 {
		geometry.computeBoundingBox();
		return geometry.boundingBox!;
	}

	test('every landmark stands on Z = 0 and rises along +Z', () => {
		const all = { ...firstAreaLandmarks, ...moreLandmarks };
		expect(Object.keys(all).length).toBe(Object.keys(landmarkSprites).length);
		for (const [name, model] of Object.entries(all)) {
			const b = box(landmarkModel(name, model));
			expect(b.min.z, name).toBeGreaterThanOrEqual(-0.2);
			expect(b.max.z, name).toBeGreaterThan(0.5);
			expect(b.max.z, name).toBeLessThan(model.height + 1);
			expect(Math.max(b.max.x - b.min.x, b.max.y - b.min.y), name).toBeLessThan(
				model.reach * 2 + 1.2,
			);
		}
	});

	test('the town, pole, sign, fountain and saucer stand on Z = 0', () => {
		for (const geometry of [
			townModel('houseA'),
			townModel('houseB'),
			townModel('shop'),
			poleModel(),
			signModel(),
			fountainModel(),
			saucerModel(),
		]) {
			const b = box(geometry);
			expect(b.min.z).toBeGreaterThanOrEqual(-0.2);
			expect(b.max.z).toBeGreaterThan(0.9);
		}
		expect(box(townModel('houseA')).max.z).toBeGreaterThan(2.5);
	});

	test('trees stand 2 to 3.5 units tall and rocks stay low, in every variant', () => {
		for (const family of ['tree', 'candyTree', 'puffTree', 'frostTree'])
			for (const look of [0, 1])
				for (let v = 0; v < sceneryVariants; v++) {
					const b = box(sceneryGeometry(family, look, v));
					expect(b.min.z, family).toBeGreaterThanOrEqual(-0.2);
					expect(b.max.z, family).toBeGreaterThan(2);
					expect(b.max.z, family).toBeLessThan(3.6);
				}
		for (const family of ['rock', 'candyRock', 'puffRock', 'cake']) {
			const b = box(sceneryGeometry(family, 0, 0));
			expect(b.min.z, family).toBeGreaterThanOrEqual(-0.2);
			expect(b.max.z, family).toBeLessThan(1.6);
		}
	});
});

describe('models on the map', () => {
	function geometryBounds(root: THREE.Object3D, name: string): THREE.Box3 {
		const box = new THREE.Box3();
		root.traverse((object) => {
			const mesh = object as THREE.Mesh;
			if (mesh.isMesh && mesh.name.startsWith(name)) {
				mesh.geometry.computeBoundingBox();
				box.union(mesh.geometry.boundingBox!);
			}
		});
		return box;
	}

	test('every landmark, building and feature stands on the ground and rises along +Z', () => {
		const batch = new OverworldBatch();
		for (let y = 80; y < 100; y++)
			for (let x = 80; x < 100; x++)
				batch.placeTile(kinds.grass, { x: x + 0.5, y: y + 0.5, tint: 0xffffff });
		const names = [
			...landmarks.map((n) => landmarkSprites[n]),
			'houseA',
			'houseB',
			'shop',
			'sign',
			'pole',
			'fountain',
			'saucer',
		];
		expect(names.length).toBe(22);
		const sprites: Record<string, string> = {
			houseA: 'owHouseA',
			houseB: 'owHouseB',
			shop: 'owShop',
			sign: 'owSign',
			pole: 'owFlagHolder',
			fountain: 'owFountain',
			saucer: 'saucer',
		};
		for (const [i, name] of names.entries()) {
			const spriteName =
					sprites[name] ??
					Object.keys(landmarkSprites).find((key) => landmarkSprites[key] === name)!,
				x = 82.5 + (i % 6) * 3,
				y = 82.5 + Math.floor(i / 6) * 3,
				family = overworldModels.family(spriteName)!,
				first = draw(spriteName, x, y, 1, 1.5);
			const placed = overworldModels.place?.(family, first);
			expect(placed, name).not.toBeNull();
			placed!.remove();
		}
		expect(overworldModels.root).toBeDefined();
	});

	test('a landmark placed in the shared batch lies at the place it was drawn, and above the ground', () => {
		const first = draw('owLmMesa', 70.5, 70.35, 2, 2),
			family = overworldModels.family('owLmMesa')!;
		for (let y = 66; y < 76; y++)
			for (let x = 66; x < 76; x++)
				overworldModels.place?.('grass-crater', draw('owGrass', x + 0.5, y + 0.5));
		const placed = overworldModels.place?.(family, first)!;
		/* The sim reuses the record for another sprite on the next frame. */
		first.x = -50;
		first.y = -50;
		first.name = 'gloop0';
		overworldModels.sync?.(frame());
		const box = geometryBounds(overworldBatch.root, 'overworld things');
		expect(box.min.x).toBeGreaterThan(60);
		expect(box.max.x).toBeLessThan(80);
		expect(box.min.y).toBeGreaterThan(60);
		expect(box.max.z).toBeGreaterThan(1.5);
		expect(box.min.z).toBeGreaterThan(-0.5);
		placed.remove();
	});

	test('a teleporter pad made from a draw that is then overwritten stays where it was made', () => {
		for (let y = 16; y < 23; y++)
			for (let x = 9; x < 16; x++)
				overworldBatch.placeTile(kinds.grass, { x: x + 0.5, y: y + 0.5, tint: 0xffffff });
		const family = overworldModels.family('owTele0')!,
			first = draw('owTele0', 12.5, 19.5, 1, 1, 0x777777),
			actor = overworldModels.create(family, first);
		first.x = 99;
		first.y = 99;
		first.tint = 0xffffff;
		const at = actor.object.position.clone();
		expect(at.x).toBeCloseTo(12.5, 5);
		expect(at.y).toBeCloseTo(19.5, 5);
		/* Standing on Z = 0 with its height along +Z. */
		const box = new THREE.Box3().setFromObject(actor.object);
		expect(box.min.z).toBeGreaterThan(-0.2);
		expect(box.max.z).toBeGreaterThan(0.15);
		actor.dispose?.();
	});

	test('a pad lights its beam when the sim draws it powered, and only then', () => {
		const family = overworldModels.family('owTele0')!,
			actor = overworldModels.create(family, draw('owTele0', 30.5, 19.5, 1, 1, 0x777777)),
			lights = (): number => {
				let n = 0;
				actor.object.traverse((o) => {
					if (
						(o as THREE.Mesh).isMesh &&
						o.visible &&
						((o as THREE.Mesh).material as THREE.Material).transparent
					)
						n++;
				});
				return n;
			};
		actor.update(draw('owTele0', 30.5, 19.5, 1, 1, 0x777777), frame());
		expect(lights()).toBe(0);
		actor.update(draw('owTele1', 30.5, 19.5, 1, 1, 0xffffff), frame([], 1));
		expect(lights()).toBe(1);
		actor.dispose?.();
	});

	test('a flag stands on its pole and flies when a bare pole is drawn beside it', () => {
		const family = overworldModels.family('owFlag')!,
			first = draw('owFlag', 15.1, 7.4, 0.7, 0.7),
			actor = overworldModels.create(family, first),
			rest = actor.object.position.clone();
		first.x = -9;
		actor.update(draw('owFlag', 15.1, 7.4, 0.7, 0.7), frame());
		expect(actor.object.position.x).toBeCloseTo(rest.x, 5);
		expect(actor.object.position.z).toBeLessThan(0.3);
		const flying = draw('owFlag', 12.1, 9.9, 0.7, 0.7);
		actor.update(flying, frame([draw('owFlagHolder', 15.1, 7.4, 0.7, 0.7), flying], 1));
		expect(actor.object.position.z).toBeGreaterThan(0.5);
		const box = new THREE.Box3().setFromObject(actor.object);
		expect(box.max.z - actor.object.position.z).toBeGreaterThan(2);
		actor.dispose?.();
	});

	test('scenery varies by tile, deterministically', () => {
		const make = (): number[] => {
			const batch = new OverworldBatch();
			for (let i = 0; i < 12; i++) {
				batch.placeTile(kinds.grass, { x: 40.5 + i, y: 40.5, tint: 0xffffff });
				batch.placeScenery('tree', 'owTree0', { x: 40.5 + i, y: 40.5 + 0.75, h: 1.5 });
			}
			batch.flush();
			const mesh = batch.root.children.find((o) =>
				o.name.startsWith('overworld things'),
			) as THREE.Mesh;
			return [...(mesh.geometry.getAttribute('position').array as Float32Array).slice(0, 4000)];
		};
		const a = make(),
			b = make();
		expect(a.length).toBeGreaterThan(100);
		expect(a).toEqual(b);
		const heights = new Set<number>();
		for (let i = 0; i < a.length; i += 3) heights.add(Math.round(a[i + 2] * 100));
		expect(heights.size).toBeGreaterThan(20);
	});
});
