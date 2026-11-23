// Checks the stage's pieces that need no browser: which scene the sim is in, and how the map camera frames the ground.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { Roster } from './roster.ts';
import { Mode } from './sim.ts';
import { mapCameraOffset, mapFraming, sceneOf } from './stage.ts';
import type { Actor, FrameContext, ModelSet, SpriteDraw } from './types.ts';

describe('the scene the sim is in', () => {
	test('the map is one scene, whatever level the sim last held', () => {
		expect(sceneOf(Mode.map, 0)).toEqual({ mode: 'map', level: undefined, key: 'map' });
		expect(sceneOf(Mode.map, 3).key).toBe('map');
	});

	test('each level is its own scene, so entering another level drops every actor too', () => {
		expect(sceneOf(Mode.level, 0)).toEqual({ mode: 'level', level: 0, key: 'level:0' });
		expect(sceneOf(Mode.level, 3).key).not.toBe(sceneOf(Mode.level, 0).key);
	});

	test('going from a level to the map and back to the same level changes the scene both times', () => {
		const keys = [sceneOf(Mode.level, 0), sceneOf(Mode.map, 0), sceneOf(Mode.level, 0)].map(
			(s) => s.key,
		);
		expect(keys[0]).not.toBe(keys[1]);
		expect(keys[1]).not.toBe(keys[2]);
	});

	test('the attract loop and a stopped sim are drawn as a level', () => {
		expect(sceneOf(Mode.attract, 1).mode).toBe('level');
		expect(sceneOf(Mode.none, 0).mode).toBe('level');
	});
});

describe('the map camera', () => {
	/** A camera set up as the stage sets it, looking at the origin. */
	function cameraFor(aspect: number, zoom = 1): THREE.PerspectiveCamera {
		const { fov, distance } = mapFraming(aspect, zoom),
			camera = new THREE.PerspectiveCamera(fov, aspect, 0.5, 400);
		camera.position.copy(mapCameraOffset(distance));
		camera.lookAt(0, 0, 0);
		camera.updateMatrixWorld();
		return camera;
	}
	const at = (camera: THREE.Camera, x: number, y: number): THREE.Vector3 =>
		new THREE.Vector3(x, y, 0).project(camera);

	test('stands south of the point it looks at and above it, looking down at 63 degrees', () => {
		const offset = mapCameraOffset(19);
		expect(offset.x).toBe(0);
		expect(offset.y).toBeLessThan(0);
		expect(offset.length()).toBeCloseTo(19, 10);
		expect(Math.atan2(offset.z, -offset.y) * (180 / Math.PI)).toBeCloseTo(63, 10);
	});

	test('north is up the screen and east is to the right', () => {
		const camera = cameraFor(16 / 9);
		expect(at(camera, 0, 4).y).toBeGreaterThan(0);
		expect(at(camera, 0, -4).y).toBeLessThan(0);
		expect(at(camera, 4, 0).x).toBeGreaterThan(0);
		expect(at(camera, -4, 0).x).toBeLessThan(0);
		expect(Math.hypot(at(camera, 0, 0).x, at(camera, 0, 0).y)).toBeCloseTo(0, 6);
	});

	test('shows 18 to 21 tiles across the ground on a wide screen', () => {
		const camera = cameraFor(16 / 9),
			right = at(camera, 9, 0),
			left = at(camera, -9, 0);
		/* Nine tiles either side of the middle fit inside the frame, and ten and a half do not. */
		expect(right.x).toBeLessThan(1);
		expect(left.x).toBeGreaterThan(-1);
		expect(at(camera, 10.5, 0).x).toBeGreaterThan(1);
	});

	test('foreshortens the ground going north by the sine of the pitch', () => {
		const camera = cameraFor(16 / 9),
			/* One tile north and one tile east, in pixels of a screen of any height. */
			north = at(camera, 0, 1).y - at(camera, 0, 0).y,
			east = (at(camera, 1, 0).x - at(camera, 0, 0).x) * camera.aspect;
		expect(north / east).toBeGreaterThan(0.75);
		expect(north / east).toBeLessThan(0.9);
	});

	test('a narrow screen widens the view to at least 14 tiles across, then pulls back', () => {
		for (const aspect of [1, 0.75, 9 / 16, 0.4]) {
			const { fov, distance } = mapFraming(aspect);
			expect(2 * distance * Math.tan((fov * Math.PI) / 360) * aspect).toBeGreaterThanOrEqual(13.99);
			expect(fov).toBeLessThanOrEqual(56.0001);
		}
		expect(mapFraming(16 / 9)).toEqual({ fov: 32, distance: 19 });
		expect(mapFraming(0.4).distance).toBeGreaterThan(19);
	});

	test('zooming in brings the camera closer', () => {
		expect(mapFraming(16 / 9, 2).distance).toBe(9.5);
	});
});

describe('a change of scene in the roster', () => {
	const draw = (name: string, x: number, y: number): SpriteDraw => ({
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
	});
	const frame = (mode: 'map' | 'level', draws: SpriteDraw[]): FrameContext => ({
		time: 0,
		dt: 1 / 60,
		ben: { x: 10, y: 5 },
		camera: { x: 10, y: 8, z: 16 },
		mode,
		level: mode === 'level' ? 0 : undefined,
		draws,
	});

	/** Every actor has an exit, so one that plays it would be a sign the roster let the old scene linger. */
	function build() {
		const log = { created: 0, disposed: 0, exits: 0, placed: 0, removed: 0 };
		const make = (): Actor => {
			log.created++;
			return {
				object: new THREE.Group(),
				update() {},
				leave: () => {
					log.exits++;
					return 0.5;
				},
				dispose: () => void log.disposed++,
			};
		};
		const set: ModelSet = {
			name: 'all',
			family: (name) => name,
			fixed: (family) => family === 'tile',
			create: make,
		};
		const scene = new THREE.Scene(),
			fallback: ModelSet = { name: 'flat', family: (n) => n, create: make };
		return { roster: new Roster(scene, [set], fallback), scene, log };
	}

	test('drops every actor at once, with no exit, and the next frame builds the new scene afresh', () => {
		const { roster, scene, log } = build(),
			level = [draw('tile', 1, 1), draw('tile', 2, 1), draw('thing', 5, 5)];
		roster.sync(level, frame('level', level));
		expect(log.created).toBe(3);
		expect(scene.children).toHaveLength(3);
		roster.clear();
		expect(log.disposed).toBe(3);
		expect(log.exits).toBe(0);
		expect(scene.children).toHaveLength(0);
		expect(roster.stats).toMatchObject({ fixedActors: 0, movingActors: 0, leaving: 0 });
		const map = [draw('tile', 1, 1), draw('thing', 5, 5)];
		roster.sync(map, frame('map', map));
		expect(log.created).toBe(5);
		expect(scene.children).toHaveLength(2);
		expect(log.exits).toBe(0);
	});

	test('finishes actors that were already playing an exit', () => {
		const { roster, scene, log } = build(),
			first = [draw('thing', 5, 5)];
		roster.sync(first, frame('level', first));
		roster.sync([], frame('level', []));
		expect(log.exits).toBe(1);
		expect(roster.stats.leaving).toBe(1);
		roster.clear();
		expect(roster.stats.leaving).toBe(0);
		expect(log.disposed).toBe(1);
		expect(scene.children).toHaveLength(0);
	});

	test('does not take the jump from one scene to the next for a restart that skips exits later', () => {
		const { roster, log } = build(),
			far = [draw('thing', 50, 50)];
		roster.sync(far, { ...frame('level', far), ben: { x: 50, y: 50 } });
		roster.clear();
		/* Ben is elsewhere in the new scene; a later disappearance near him plays its exit as usual. */
		const near = [draw('thing', 5, 5)];
		roster.sync(near, frame('map', near));
		roster.sync([], frame('map', []));
		expect(log.exits).toBe(1);
	});
});
