// The level stage: runs the sim at its fixed step and keeps one 3D actor alive for each sprite it draws.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { LevelSim, type SpriteSheet, stepSeconds } from './sim.ts';
import type { Actor, FrameContext, ModelSet, SpriteDraw } from './types.ts';

/** How far a moving sprite may travel in a frame and still be the same actor, in tiles. */
const sameActorReach = 2.5;

interface Live {
	actor: Actor;
	x: number;
	y: number;
	seen: number;
}

/**
 * Draws any sprite no model set claims as the flat pixel sprite it is, standing in the scene. It keeps the level complete
 * while models are missing, and is the honest fallback for sprites that have no 3D form yet.
 */
function flatSprites(sheet: SpriteSheet, texture: THREE.Texture): ModelSet {
	const materials = new Map<string, THREE.MeshBasicMaterial>(),
		plane = new THREE.PlaneGeometry(1, 1);
	return {
		name: 'flat sprites',
		family: (name) => name,
		fixed: () => false,
		create(family) {
			let material = materials.get(family);
			if (!material) {
				const [left, bottom, width, height] = sheet.sprites[family] ?? [0, 0, 1, 1],
					map = texture.clone();
				map.repeat.set(width / sheet.size, height / sheet.size);
				map.offset.set(left / sheet.size, bottom / sheet.size);
				map.needsUpdate = true;
				material = new THREE.MeshBasicMaterial({
					map,
					transparent: true,
					alphaTest: 0.05,
					side: THREE.DoubleSide,
				});
				materials.set(family, material);
			}
			const mesh = new THREE.Mesh(plane, material.clone());
			return {
				object: mesh,
				update(draw) {
					mesh.position.set(draw.x, draw.y, 0);
					mesh.rotation.z = draw.rot;
					mesh.scale.set(draw.w * (draw.flip ? -1 : 1), draw.h, 1);
					mesh.material.opacity = draw.alpha;
					mesh.material.color.setHex(draw.tint);
				},
				dispose: () => mesh.material.dispose(),
			};
		},
	};
}

export interface StageOptions {
	canvas: HTMLCanvasElement;
	sim: LevelSim;
	sheet: SpriteSheet;
	sheetImage: THREE.Texture;
	sets: readonly ModelSet[];
	/** Called once a frame with the input bits to hold for the sim's steps. */
	held: () => number;
}

/** The scene, the camera and the pool of actors. */
export class Stage {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 400);
	readonly renderer: THREE.WebGLRenderer;
	readonly draws: SpriteDraw[] = [];
	/** Sprite names drawn by the flat fallback this frame, for tooling that reports missing models. */
	readonly unmodelled = new Set<string>();
	/** When true the stage does not advance the sim, so tooling can pose a frame. */
	paused = false;
	/** How much closer than usual the camera stands; 2 is twice as close, centred on Ben. */
	zoom = 1;
	private readonly sets: readonly ModelSet[];
	private readonly fixed = new Map<string, Live>();
	private readonly moving = new Map<string, Live[]>();
	private readonly owner = new Map<
		string,
		{ set: ModelSet; family: string; fixed: boolean } | null
	>();
	private readonly fallback: ModelSet;
	private frameNumber = 0;
	private carry = 0;
	private last = 0;
	private time = 0;
	private view = { x: 12, y: 7 };

	constructor(private readonly options: StageOptions) {
		this.sets = options.sets;
		this.fallback = flatSprites(options.sheet, options.sheetImage);
		this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true });
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.scene.background = new THREE.Color(0x1a1030);
		this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x4a3050, 1.5));
		const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
		sun.name = 'sun';
		sun.position.set(-8, 16, 14);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.left = -22;
		sun.shadow.camera.right = 22;
		sun.shadow.camera.top = 16;
		sun.shadow.camera.bottom = -16;
		sun.shadow.camera.far = 80;
		sun.shadow.bias = -0.0015;
		this.scene.add(sun, sun.target);
	}

	private claim(name: string): { set: ModelSet; family: string; fixed: boolean } | null {
		let hit = this.owner.get(name);
		if (hit !== undefined) return hit;
		hit = null;
		for (const set of this.sets) {
			const family = set.family(name);
			if (family !== null) {
				hit = { set, family, fixed: set.fixed?.(family) ?? false };
				break;
			}
		}
		this.owner.set(name, hit);
		return hit;
	}

	private make(set: ModelSet, family: string, draw: SpriteDraw): Live {
		const actor = set.create(family, draw);
		this.scene.add(actor.object);
		return { actor, x: draw.x, y: draw.y, seen: this.frameNumber };
	}

	private drop(live: Live): void {
		live.actor.dispose?.();
		this.scene.remove(live.actor.object);
	}

	/** Reads the sim's frame and brings the actors into line with it. */
	sync(alpha: number, dt: number): void {
		const sim = this.options.sim,
			view = sim.frame(alpha, this.draws),
			ben = this.draws.find((draw) => draw.name.startsWith('ben_')),
			frame: FrameContext = {
				time: this.time,
				dt,
				ben: ben ? { x: ben.x, y: ben.y } : { x: view.cameraX, y: view.cameraY },
				draws: this.draws,
			};
		this.frameNumber++;
		this.unmodelled.clear();
		this.view = { x: view.cameraX, y: view.cameraY };
		for (const draw of this.draws) {
			const claimed = this.claim(draw.name),
				set = claimed?.set ?? this.fallback,
				family = claimed?.family ?? draw.name;
			if (!claimed) this.unmodelled.add(draw.name);
			let live: Live | undefined;
			if (claimed?.fixed) {
				const key = `${family}|${draw.x.toFixed(2)}|${draw.y.toFixed(2)}`;
				live = this.fixed.get(key);
				if (!live) this.fixed.set(key, (live = this.make(set, family, draw)));
			} else {
				const key = `${set.name}|${family}`;
				let list = this.moving.get(key);
				if (!list) this.moving.set(key, (list = []));
				let best = sameActorReach * sameActorReach;
				for (const other of list) {
					if (other.seen === this.frameNumber) continue;
					const d = (other.x - draw.x) ** 2 + (other.y - draw.y) ** 2;
					if (d < best) {
						best = d;
						live = other;
					}
				}
				if (!live) list.push((live = this.make(set, family, draw)));
			}
			live.seen = this.frameNumber;
			live.x = draw.x;
			live.y = draw.y;
			live.actor.update(draw, frame);
		}
		for (const [key, live] of this.fixed)
			if (live.seen !== this.frameNumber) {
				this.drop(live);
				this.fixed.delete(key);
			}
		for (const list of this.moving.values())
			for (let i = list.length - 1; i >= 0; i--)
				if (list[i].seen !== this.frameNumber) {
					this.drop(list[i]);
					list.splice(i, 1);
				}
		/* The camera follows the sim's own, pulled back and raised a little so the level reads as a place. Zoomed in, it
		   centres on Ben instead. */
		const close = this.zoom > 1,
			target = close
				? new THREE.Vector3(frame.ben.x, frame.ben.y, 0)
				: new THREE.Vector3(this.view.x, this.view.y + 0.6, 0);
		this.camera.position.set(target.x - 1.2 / this.zoom, target.y + 3.2 / this.zoom, 27 / this.zoom);
		this.camera.lookAt(target);
		const sun = this.scene.getObjectByName('sun') as THREE.DirectionalLight;
		sun.position.set(target.x - 8, target.y + 16, 14);
		sun.target.position.copy(target);
	}

	resize(): void {
		const canvas = this.options.canvas,
			width = canvas.clientWidth || 1280,
			height = canvas.clientHeight || 720;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	/** One animation frame: steps the sim as often as real time asks, then draws. */
	tick(now: number): void {
		const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0);
		this.last = now;
		this.time += dt;
		if (!this.paused) {
			this.carry += dt;
			const held = this.options.held();
			while (this.carry >= stepSeconds) {
				this.options.sim.step(held);
				this.carry -= stepSeconds;
			}
		}
		this.sync(this.paused ? 0 : this.carry / stepSeconds, dt);
		this.renderer.render(this.scene, this.camera);
	}

	/** Advances the sim by whole steps with fixed input and draws once, for tooling and tests. */
	advance(steps: number, held: number): void {
		for (let i = 0; i < steps; i++) this.options.sim.step(held);
		this.time += steps * stepSeconds;
		this.sync(0, steps * stepSeconds);
		this.renderer.render(this.scene, this.camera);
	}
}
