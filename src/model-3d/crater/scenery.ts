// The scenery a level's backdrop sprites stand for: one shared set of far-off scenery at a time, attached to the scene by the first sprite and following the camera.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, FrameContext } from '../../level-3d/types.ts';

/** Far-off scenery: a root object to hang in the scene, and the work of moving it with the camera. */
export interface Scenery {
	readonly root: THREE.Object3D;
	/** Called when the scenery is attached to a scene, for what it changes besides its own objects, such as the lights. */
	enter?(scene: THREE.Object3D): void;
	/** Called when the scenery is taken out of the scene it entered, to put back what `enter` changed. */
	leave?(scene: THREE.Object3D): void;
	/** Moves the scenery to the camera's view; the frame says where the camera and the clock are. */
	follow(frame: FrameContext): void;
}

/** How far the stage's camera stands left of and above the spot Ben usually stands at, in tiles. */
export const cameraBehind = { x: 0.8, y: 3.1 };

let active: Scenery | null = null;
let activeScene: THREE.Object3D | null = null;
let users = 0;

function detach(): void {
	if (!active) return;
	if (activeScene) active.leave?.(activeScene);
	active.root.parent?.remove(active.root);
	active = null;
	activeScene = null;
}

/**
 * An actor for one of the sprites the game draws its parallax scenery with. The actor itself is empty; the first one
 * alive attaches the scenery `choose` names for the frame to the scene, and every update moves it with the camera. When
 * the choice changes, the old scenery is taken out and the new one put in. The last actor to go removes the scenery.
 */
export function sceneryActor(choose: (frame: FrameContext) => Scenery): Actor {
	const holder = new THREE.Group();
	users++;
	return {
		object: holder,
		update(_draw, frame) {
			const scene = holder.parent;
			if (!scene) return;
			const wanted = choose(frame);
			if (active !== wanted || wanted.root.parent !== scene) {
				detach();
				scene.add(wanted.root);
				wanted.enter?.(scene);
				active = wanted;
				activeScene = scene;
			}
			wanted.follow(frame);
		},
		dispose() {
			users--;
			if (users <= 0) detach();
		},
	};
}
