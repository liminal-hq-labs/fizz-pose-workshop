// Tests for the open-sky models: every sprite maps to a family, tiles sit in their cells and walk at the collision height, the cloud ledge fills its span, and the hover pad's top is the platform's.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import type { FrameContext, SpriteDraw } from '../../level-3d/types.ts';
import { mergeTiles } from '../crater/batch.ts';
import {
	blockTile,
	fillGeometry,
	groundTile,
	platformGeometry,
	slopeGeometry,
	slopeHeights,
	topGeometry,
	variantCount,
	walkBand,
	type SlopeName,
} from '../crater/ground.ts';
import { enclosed } from '../crater/surroundings.ts';
import { terrainModels } from '../crater/terrain.ts';
import { depth } from '../toon.ts';
import { isOpenSky } from './backdrop.ts';
import { skyTheme } from './biscuit.ts';
import { cloudLedge } from './cloud-ledge.ts';
import { skyModels } from './terrain.ts';

const spriteNames = [
	'skyFill',
	'skyTop',
	'skyBlock',
	'skyR45',
	'skyL45',
	'skyR22A',
	'skyR22B',
	'skyL22A',
	'skyL22B',
	'skyPlat',
	'hover0',
	'hover1',
	'cloud',
];

function draw(name: string, x: number, y: number, w = 1, h = 1): SpriteDraw {
	return {
		name,
		x,
		y,
		w,
		h,
		flip: false,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: false,
		order: 0,
	};
}

function frameOf(draws: SpriteDraw[], level?: number, dt = 1 / 60): FrameContext {
	return {
		time: 1.5,
		dt,
		ben: { x: 10, y: 6 },
		camera: { x: 10, y: 9, z: 16 },
		mode: 'level',
		level,
		draws,
	};
}

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

/** The highest vertex at local x on the left or right edge of a tile, as a fraction of the tile above its base. */
function edgeHeight(geometry: THREE.BufferGeometry, edge: -0.5 | 0.5): number {
	const position = geometry.getAttribute('position');
	let top = -Infinity;
	for (let i = 0; i < position.count; i++)
		if (Math.abs(position.getX(i) - edge) < 1e-6) top = Math.max(top, position.getY(i));
	return top + 0.5;
}

describe('sky families', () => {
	test('every open-sky sprite belongs to a family', () => {
		for (const name of spriteNames) expect(skyModels.family(name)).not.toBeNull();
	});

	test('the crater set claims the shared sprites first, and neither set takes the other’s ground', () => {
		for (const name of ['spike', 'crysM', 'exitBot', 'exitTop', 'mtnTop', 'hillTop', 'fill'])
			expect(skyModels.family(name)).toBeNull();
		for (const name of ['craterTop', 'craterPlat', 'ben_stand', 'gloop0'])
			expect(skyModels.family(name)).toBeNull();
		for (const name of ['skyTop', 'skyPlat', 'hover0', 'cloud'])
			expect(terrainModels.family(name)).toBeNull();
		for (const name of ['spike', 'crysM', 'exitBot', 'exitTop', 'mtnTop', 'hillTop', 'fill'])
			expect(terrainModels.family(name)).not.toBeNull();
	});

	test('the two frames of the hover pad share a family, and only the ground is fixed', () => {
		expect(skyModels.family('hover0')).toBe(skyModels.family('hover1'));
		for (const name of spriteNames) {
			const family = skyModels.family(name)!,
				moves = family === 'hover' || family === 'cloud';
			expect(skyModels.fixed?.(family)).toBe(!moves);
		}
	});

	test('the open-sky levels are Meteor Mesa, Marshmallow Meadows, Frosting Flats and Gumdrop Isle', () => {
		for (const level of [3, 5, 10, 13]) expect(isOpenSky(level)).toBe(true);
		for (const level of [0, 1, 2, 4, 6, 12, 14]) expect(isOpenSky(level)).toBe(false);
		expect(isOpenSky(undefined)).toBe(false);
	});
});

describe('sky actors', () => {
	test('every tile actor builds, updates and stands at its sprite', () => {
		for (const name of spriteNames) {
			const family = skyModels.family(name)!;
			if (family === 'cloud') continue;
			const first = draw(name, 12.5, 7.5, name.startsWith('hover') ? 2 : 1, 0.5),
				actor = skyModels.create(family, first);
			actor.update(first, frameOf([first], 3));
			actor.object.updateMatrix();
			expect(actor.object.position.x).toBe(12.5);
			expect(actor.object.position.y).toBe(7.5);
			expect(actor.object.position.z).toBe(0);
			actor.dispose?.();
		}
	});

	test('tiles of one family share a geometry, and the same position always picks the same variant', () => {
		expect(fillGeometry(3, skyTheme)).toBe(fillGeometry(3, skyTheme));
		expect(fillGeometry(3, skyTheme)).not.toBe(fillGeometry(3));
		const make = (): THREE.BufferGeometry =>
			(skyModels.create('fill', draw('skyFill', 20.5, 2.5)).object as THREE.Mesh).geometry;
		expect(make()).toBe(make());
	});
});

describe('sky ground meets the game collision', () => {
	const expected: Record<SlopeName, [number, number]> = {
		R45: [0, 1],
		L45: [1, 0],
		R22A: [0, 0.5],
		R22B: [0.5, 1],
		L22A: [1, 0.5],
		L22B: [0.5, 0],
	};
	for (const shape of Object.keys(expected) as SlopeName[])
		test(`${shape} surface runs ${expected[shape][0]} to ${expected[shape][1]}, and nothing in the lane rises above it`, () => {
			expect(slopeHeights[shape].map(Number)).toEqual(expected[shape]);
			for (let v = 0; v < variantCount; v++) {
				const geometry = slopeGeometry(shape, v, skyTheme),
					position = geometry.getAttribute('position');
				expect(edgeHeight(geometry, -0.5)).toBeCloseTo(expected[shape][0], 6);
				expect(edgeHeight(geometry, 0.5)).toBeCloseTo(expected[shape][1], 6);
				for (let i = 0; i < position.count; i++) {
					if (Math.abs(position.getZ(i)) > walkBand - 0.05) continue;
					const line =
						expected[shape][0] +
						(expected[shape][1] - expected[shape][0]) * (position.getX(i) + 0.5);
					expect(position.getY(i) + 0.5).toBeLessThanOrEqual(line + 1e-6);
				}
			}
		});

	test('no vertex of a ground or fill tile leaves its cell in X, in any variant or surrounding', () => {
		const around = [
			{ leftH: 0, rightH: 0, wallL: true, wallR: true, below: false },
			{ leftH: 1, rightH: 1, wallL: false, wallR: false, below: true },
			{ leftH: 0, rightH: 1, wallL: true, wallR: false, below: true },
		];
		const shapes = [
			...(Object.keys(slopeHeights) as SlopeName[]).map((name) => ({
				hl: slopeHeights[name][0],
				hr: slopeHeights[name][1],
			})),
			{ hl: 1, hr: 1 },
		];
		for (const shape of shapes)
			for (const s of around)
				for (let v = 0; v < variantCount; v++) {
					const box = boxOf(groundTile({ ...shape, crust: true }, 40.5 + v, 6.5, s, skyTheme));
					expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
					expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-6);
					expect(box.min.y).toBeGreaterThanOrEqual(-0.5 - 1e-6);
				}
		for (let v = 0; v < variantCount; v++) {
			const box = boxOf(
				groundTile({ hl: 1, hr: 1, crust: false }, 40.5 + v, 6.5, around[0], skyTheme),
			);
			expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
			expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-6);
			expect(box.max.y).toBeLessThanOrEqual(0.5 + 1e-6);
		}
	});

	test('the walking strip of a top tile is exactly at the top of its cell, and only small icing details stand above it', () => {
		for (let v = 0; v < variantCount; v++) {
			const shape = { hl: 1, hr: 1, crust: true },
				walking = boxOf(
					groundTile(shape, 20.5 + v, 3.5, enclosed(shape), skyTheme),
					walkBand - 0.05,
				);
			expect(walking.max.y).toBeCloseTo(0.5, 6);
			expect(boxOf(topGeometry(v, skyTheme)).max.y).toBeLessThan(0.5 + 0.1);
			expect(edgeHeight(topGeometry(v, skyTheme), -0.5)).toBeCloseTo(1, 6);
			expect(edgeHeight(topGeometry(v, skyTheme), 0.5)).toBeCloseTo(1, 6);
		}
	});

	test('the ground is as deep as the lane, and the block fills its cell exactly', () => {
		const top = boxOf(topGeometry(0, skyTheme));
		expect(top.max.z - top.min.z).toBeGreaterThan(depth.lane - 0.01);
		for (const resting of [true, false]) {
			const box = boxOf(blockTile(resting, { x: 12.5, y: 7.5 }, { leftH: 0, rightH: 0 }, skyTheme));
			expect(box.min.x).toBeCloseTo(-0.5, 6);
			expect(box.max.x).toBeCloseTo(0.5, 6);
			expect(box.min.y).toBeCloseTo(-0.5, 6);
			expect(box.max.y).toBeCloseTo(0.5, 6);
			expect(box.max.z).toBeLessThanOrEqual((resting ? depth.lane : depth.shelf) / 2 + 0.04 + 1e-6);
		}
	});

	test('the end of a run sits on the cell boundary', () => {
		const end = groundTile(
			{ hl: 1, hr: 1, crust: true },
			10.5,
			6.5,
			{
				leftH: 0,
				rightH: 1,
				wallL: false,
				wallR: false,
				below: true,
			},
			skyTheme,
		);
		expect(boxOf(end).min.x).toBeCloseTo(-0.5, 6);
	});
});

describe('the cloud ledge', () => {
	const alone = { leftH: 0, rightH: 0, wallL: false, wallR: false, below: false },
		cases = [
			['alone', { ...alone, joinL: false, joinR: false }],
			['at the left end', { ...alone, joinL: false, joinR: true }],
			['at the right end', { ...alone, joinL: true, joinR: false }],
			['inside a run', { ...alone, joinL: true, joinR: true }],
		] as const;

	for (const [label, around] of cases)
		test(`${label}: it fills the top 0.375 of its cell, in its width and a shelf's depth`, () => {
			for (let i = 0; i < 6; i++) {
				const box = boxOf(cloudLedge(64.5 + i, 7.5, around));
				expect(box.max.y).toBeCloseTo(0.5, 6);
				expect(box.min.y).toBeGreaterThanOrEqual(0.5 - 0.375 - 1e-6);
				expect(box.min.y).toBeLessThan(0.2);
				expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
				expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-6);
				expect(box.max.z - box.min.z).toBeLessThan(depth.lane - 0.5);
				expect(box.max.z).toBeLessThanOrEqual(depth.shelf / 2 + 0.03);
			}
		});

	test('the top is level at the top of the cell wherever a hero can stand on it, and a joined end runs straight on', () => {
		const run = boxOf(cloudLedge(64.5, 7.5, cases[3][1]), 0.3);
		expect(run.max.y).toBeCloseTo(0.5, 6);
		const position = cloudLedge(64.5, 7.5, cases[3][1]).getAttribute('position');
		let flat = 0;
		for (let i = 0; i < position.count; i++) {
			if (Math.abs(position.getZ(i)) > 0.26) continue;
			expect(position.getY(i)).toBeLessThanOrEqual(0.5 + 1e-6);
			if (Math.abs(position.getY(i) - 0.5) < 1e-6) flat++;
		}
		expect(flat).toBeGreaterThan(30);
		/* A joined side has top vertices on the cell edge at full height; an open one has rounded down. */
		const topAtEdge = (g: THREE.BufferGeometry, x: number): number => {
			const p = g.getAttribute('position');
			let best = -Infinity;
			for (let i = 0; i < p.count; i++)
				if (Math.abs(p.getX(i) - x) < 1e-6 && Math.abs(p.getZ(i)) < 0.2)
					best = Math.max(best, p.getY(i));
			return best;
		};
		expect(topAtEdge(cloudLedge(64.5, 7.5, cases[2][1]), -0.5)).toBeCloseTo(0.5, 6);
		expect(topAtEdge(cloudLedge(64.5, 7.5, cases[2][1]), 0.5)).toBeLessThan(0.45);
	});

	test('the default ledge is a cloud and is shallower than the ground', () => {
		const box = boxOf(platformGeometry(skyTheme));
		expect(box.max.z - box.min.z).toBeLessThan(depth.lane - 0.5);
		expect(platformGeometry(skyTheme)).toBe(platformGeometry(skyTheme));
		expect(platformGeometry(skyTheme)).not.toBe(platformGeometry());
	});
});

describe('the hover platform', () => {
	/** The sim draws the pad at the centre of its 2 by 0.5 box, so its top is half a tile above that. */
	const first = (name = 'hover0'): SpriteDraw => draw(name, 99.5, 4.75, 2, 0.5);
	const bodyOf = (actor: { object: THREE.Object3D }): THREE.Mesh =>
		actor.object.children.find(
			(child) => (child as THREE.Mesh).isMesh && (child as THREE.Mesh).castShadow,
		) as THREE.Mesh;

	test('its standing surface is the top of the sprite: nothing rises above it, and the top is flat across the pad', () => {
		const actor = skyModels.create('hover', first()),
			geometry = bodyOf(actor).geometry,
			position = geometry.getAttribute('position'),
			box = boxOf(geometry);
		expect(box.max.y).toBeCloseTo(0.25, 6);
		expect(box.min.x).toBeCloseTo(-1, 6);
		expect(box.max.x).toBeCloseTo(1, 6);
		expect(box.max.z).toBeLessThanOrEqual(depth.shelf / 2 + 0.01);
		let flat = 0;
		for (let i = 0; i < position.count; i++) {
			if (Math.abs(position.getZ(i)) > walkBand - 0.15 || Math.abs(position.getX(i)) > 0.9)
				continue;
			if (Math.abs(position.getY(i) - 0.25) < 1e-6) flat++;
		}
		expect(flat).toBeGreaterThan(12);
		/* Placed at the sprite's centre, the top is at the sim platform's top: y + h / 2. */
		const draw0 = first();
		actor.update(draw0, frameOf([draw0], 3));
		expect(actor.object.position.y + box.max.y).toBeCloseTo(4.75 + 0.25, 6);
	});

	test('its lamps change colour and its glow swells between the two frames, and it moves with the sprite', () => {
		const a = first('hover0'),
			actor = skyModels.create('hover', a),
			lamps = actor.object.children.find(
				(child) =>
					(child as THREE.Mesh).isMesh &&
					!(child as THREE.Mesh).castShadow &&
					(child as THREE.Mesh).material instanceof THREE.MeshBasicMaterial &&
					((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex() !== 0xffffff &&
					!(child as THREE.Mesh).renderOrder,
			) as THREE.Mesh | undefined,
			halo = actor.object.children.find((child) => child.renderOrder === -1) as THREE.Mesh;
		const colourOf = (): number => (lamps!.material as THREE.MeshBasicMaterial).color.getHex();
		actor.update(a, frameOf([a], 3, 1 / 60));
		const red = colourOf(),
			small = halo.scale.x;
		const b = first('hover1');
		b.x = 100.1;
		for (let i = 0; i < 40; i++) actor.update(b, frameOf([b], 3, 1 / 60));
		expect(colourOf()).not.toBe(red);
		expect(halo.scale.x).toBeGreaterThan(small + 0.1);
		expect(actor.object.position.x).toBeCloseTo(100.1, 6);
		for (let i = 0; i < 40; i++) actor.update(a, frameOf([a], 3, 1 / 60));
		expect(colourOf()).toBe(red);
		expect(halo.scale.x).toBeCloseTo(small, 2);
	});

	test('it is a moving actor, matched from frame to frame, and it sits on its sprite when the draw is refilled', () => {
		const d = first(),
			actor = skyModels.create('hover', d);
		/* The reader refills the same record with another sprite: the pad keeps the size it was made at. */
		d.w = 1;
		d.h = 1;
		d.x = 3.5;
		d.y = 2.5;
		const box = boxOf(bodyOf(actor).geometry);
		expect(box.max.x).toBeCloseTo(1, 6);
		expect(box.max.y).toBeCloseTo(0.25, 6);
	});
});

describe('batched sky terrain', () => {
	const frame = frameOf([], 3);

	test('a thousand tiles take a handful of meshes, and removing one rebuilds only its chunk', () => {
		const handles: { remove(): void }[] = [],
			before = skyModels.root?.children.length ?? 0;
		for (let x = 0; x < 100; x++)
			for (let y = 0; y < 10; y++) {
				const name = y === 9 ? 'skyTop' : 'skyFill',
					placed = skyModels.place?.(skyModels.family(name)!, draw(name, 800.5 + x, y + 0.5));
				expect(placed).not.toBeNull();
				handles.push(placed!);
			}
		skyModels.sync?.(frame);
		const meshes = (skyModels.root?.children.length ?? 0) - before;
		expect(meshes).toBeGreaterThan(0);
		expect(meshes).toBeLessThan(40);
		for (const handle of handles) handle.remove();
		skyModels.sync?.(frame);
		expect(skyModels.root?.children.length).toBe(before);
	});

	test('the hover pad and the clouds are actors, and are not placed', () => {
		for (const name of ['hover0', 'hover1', 'cloud'])
			expect(skyModels.place?.(skyModels.family(name)!, draw(name, 5.5, 5.5))).toBeNull();
	});

	test('a pit between two tiles gets a wall behind it that fades into the haze, and ledges join their neighbours', () => {
		const handles = [
			...[0, 1, 2, 5, 6, 7].map((x) => skyModels.place!('top', draw('skyTop', 900.5 + x, 3.5))!),
			skyModels.place!('plat', draw('skyPlat', 903.5, 5.5))!,
			skyModels.place!('plat', draw('skyPlat', 904.5, 5.5))!,
		];
		skyModels.sync?.(frame);
		const names = skyModels.root!.children.map((child) => child.name);
		expect(names.some((name) => name.startsWith('sky wall'))).toBe(true);
		expect(names.every((name) => name.startsWith('sky '))).toBe(true);
		const props = skyModels.root!.children.filter((child) => child.name.startsWith('sky prop'));
		expect(props.length).toBeGreaterThan(0);
		/* Two ledges in a row meet in the middle at full height: the joined edge at x = 904 has top vertices at 5.5 + 0.5 - 0 = 6. */
		let joined = -Infinity;
		for (const mesh of props) {
			const p = (mesh as THREE.Mesh).geometry.getAttribute('position');
			for (let i = 0; i < p.count; i++)
				if (Math.abs(p.getX(i) - 904) < 1e-6 && Math.abs(p.getZ(i)) < 0.2)
					joined = Math.max(joined, p.getY(i));
		}
		expect(joined).toBeCloseTo(6, 6);
		for (const handle of handles) handle.remove();
		skyModels.sync?.(frame);
	});

	test('merged tiles sit where their sprites are', () => {
		const geometry = mergeTiles([
			{ geometry: topGeometry(0, skyTheme), x: 10, y: 2, yaw: 0 },
			{ geometry: topGeometry(0, skyTheme), x: 20, y: 4, yaw: 0 },
		]);
		geometry.computeBoundingBox();
		expect(geometry.boundingBox!.min.x).toBeGreaterThan(9);
		expect(geometry.boundingBox!.max.x).toBeLessThan(21);
	});

	test('batched tiles build for the place they were drawn at, not where the pooled draw ends up', () => {
		const tile = draw('skyBlock', 960.5, 3.5),
			placed = skyModels.place!('block', tile)!;
		tile.x = 5.5;
		tile.y = 5.5;
		skyModels.sync?.(frameOf([], 3));
		const found = skyModels.root!.children.some((mesh) => {
			if (!mesh.name.startsWith('sky ground')) return false;
			const b = boxOf((mesh as THREE.Mesh).geometry);
			return b.min.x > 955 && b.max.x < 965;
		});
		expect(found).toBe(true);
		placed.remove();
		skyModels.sync?.(frameOf([], 3));
	});
});

describe('the daylight backdrop', () => {
	function scene(): {
		scene: THREE.Scene;
		hemisphere: THREE.HemisphereLight;
		sun: THREE.DirectionalLight;
	} {
		const s = new THREE.Scene(),
			hemisphere = new THREE.HemisphereLight(0xdfe6ff, 0x4a3050, 1.5),
			sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
		sun.name = 'sun';
		s.background = new THREE.Color(0x1a1030);
		s.fog = new THREE.Fog(0xd864b8, 26, 260);
		s.add(hemisphere, sun);
		return { scene: s, hemisphere, sun };
	}

	test('an open-sky level gets the daylight, lights it, and puts the stage back when the last backdrop sprite goes', () => {
		const { scene: s, hemisphere, sun } = scene(),
			a = terrainModels.create('backdrop', draw('mtnTop', 10, 5)),
			b = terrainModels.create('backdrop', draw('hillTop', 12, 4));
		s.add(a.object, b.object);
		a.update(draw('mtnTop', 10, 5), frameOf([], 3));
		b.update(draw('hillTop', 12, 4), frameOf([], 3));
		expect(s.children.filter((child) => child.name === 'sky backdrop').length).toBe(1);
		expect(s.children.filter((child) => child.name === 'crater backdrop').length).toBe(0);
		expect((s.background as THREE.Color).getHex()).not.toBe(0x1a1030);
		expect(s.fog!.color.getHex()).not.toBe(0xd864b8);
		expect(hemisphere.color.getHex()).not.toBe(0xdfe6ff);
		expect(sun.color.getHex()).not.toBe(0xfff1dc);
		a.dispose?.();
		expect(s.children.filter((child) => child.name === 'sky backdrop').length).toBe(1);
		b.dispose?.();
		expect(s.children.filter((child) => child.name === 'sky backdrop').length).toBe(0);
		expect((s.background as THREE.Color).getHex()).toBe(0x1a1030);
		expect(s.fog!.color.getHex()).toBe(0xd864b8);
		expect((s.fog as THREE.Fog).near).toBe(26);
		expect((s.fog as THREE.Fog).far).toBe(260);
		expect(hemisphere.color.getHex()).toBe(0xdfe6ff);
		expect(hemisphere.groundColor.getHex()).toBe(0x4a3050);
		expect(hemisphere.intensity).toBe(1.5);
		expect(sun.color.getHex()).toBe(0xfff1dc);
		expect(sun.intensity).toBe(2.4);
	});

	test('any other level, and a frame that names no level, keep the dusk backdrop and the stage as it is', () => {
		for (const level of [undefined, 0, 1, 7]) {
			const { scene: s, hemisphere } = scene(),
				actor = terrainModels.create('backdrop', draw('mtnTop', 10, 5));
			s.add(actor.object);
			actor.update(draw('mtnTop', 10, 5), frameOf([], level));
			expect(s.children.filter((child) => child.name === 'crater backdrop').length).toBe(1);
			expect(s.children.filter((child) => child.name === 'sky backdrop').length).toBe(0);
			expect((s.background as THREE.Color).getHex()).toBe(0x1a1030);
			expect(hemisphere.intensity).toBe(1.5);
			actor.dispose?.();
		}
	});

	test('a change of level swaps the backdrop and restores the lights in between', () => {
		const { scene: s, hemisphere } = scene(),
			actor = terrainModels.create('backdrop', draw('mtnTop', 10, 5));
		s.add(actor.object);
		actor.update(draw('mtnTop', 10, 5), frameOf([], 3));
		expect(hemisphere.intensity).not.toBe(1.5);
		actor.update(draw('mtnTop', 10, 5), frameOf([], 0));
		expect(hemisphere.intensity).toBe(1.5);
		expect((s.background as THREE.Color).getHex()).toBe(0x1a1030);
		expect(s.children.filter((child) => child.name === 'crater backdrop').length).toBe(1);
		actor.dispose?.();
	});

	test('the parallax follows the camera and not Ben', () => {
		const { scene: s } = scene(),
			actor = terrainModels.create('backdrop', draw('mtnTop', 10, 5)),
			sprite = draw('mtnTop', 10, 5);
		s.add(actor.object);
		const at = (ben: number, camera: number): number => {
			const frame: FrameContext = {
				time: 1,
				dt: 0,
				ben: { x: ben, y: 6 },
				camera: { x: camera, y: 9, z: 16 },
				mode: 'level',
				level: 3,
				draws: [],
			};
			actor.update(sprite, frame);
			const root = s.children.find((child) => child.name === 'sky backdrop')!;
			return root.children.reduce((sum, child) => sum + child.position.x, 0);
		};
		const rest = at(40, 50);
		expect(at(55, 50)).toBeCloseTo(rest, 6);
		expect(at(40, 60)).not.toBeCloseTo(rest, 3);
		actor.dispose?.();
	});

	test('the simulation’s own cloud sprites are drawn by the backdrop in an open-sky level, and as a soft puff elsewhere', () => {
		const sprite = draw('cloud', 30.5, 12, 3, 1),
			day = skyModels.create('cloud', sprite),
			other = skyModels.create('cloud', sprite);
		day.update(sprite, frameOf([sprite], 3));
		other.update(sprite, frameOf([sprite], 12));
		expect(day.object.children.length).toBe(0);
		expect(other.object.children.length).toBe(1);
	});
});

describe('the pooled draw', () => {
	test('a hover pad made from a record that is refilled afterwards keeps its own name and size', () => {
		const record = draw('hover1', 50.5, 3.75, 2, 0.5),
			actor = skyModels.create('hover', record);
		record.name = 'gloop0';
		record.w = 4;
		const body = actor.object.children.find((c) => (c as THREE.Mesh).castShadow) as THREE.Mesh;
		expect(boxOf(body.geometry).max.x).toBeCloseTo(1, 6);
	});
});
