// The level stage: runs the sim at its fixed step and keeps one 3D actor alive for each sprite it draws.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { depth } from '../model-3d/toon.ts';
import { Roster, type RosterStats } from './roster.ts';
import { LevelSim, type SpriteSheet, stepSeconds } from './sim.ts';
import type { FrameContext, ModelSet, SpriteDraw } from './types.ts';

/** How far the camera stands from the level on a wide screen, in tiles: close, so the characters read at a glance. */
const cameraDistance = 16;
/** The camera's vertical field of view on a wide screen, in degrees. */
const baseFov = 32;
/** The widest field of view the camera takes on a narrow screen before it pulls back instead, in degrees. */
const maxFov = 56;
/** The fewest tiles of the level's middle plane the view may show across, however narrow the screen. */
const minViewTiles = 14;
/** The camera's offset from the point it looks at, at the base distance: a little left and above: low enough to read as a side view, high enough that the ground's top shows. */
const cameraOffset = { x: -0.8, y: 1.2 };
/** How far above the sim's camera position the view looks, so Ben stands a little below the middle of the frame. */
const lookRise = 0.9;
/** How far Ben may stand from the middle of the frame, as a share of the half view: sideways, below it and above it. */
const leadX = 0.4,
	leadDown = 0.5,
	leadUp = 0.25;

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}
/** The sun's offset from the point it lights. */
const sunOffset = new THREE.Vector3(-8, 16, 14);
const shadowSize = 1536;

/**
 * The camera's field of view and distance for a screen shape and zoom. The camera stands at `cameraDistance`, with the
 * base field of view, unless that would show fewer than `minViewTiles` across; then it widens the field of view, and when
 * that reaches `maxFov` it pulls back as well.
 */
export function framing(aspect: number, zoom = 1): { fov: number; distance: number } {
	const distance = cameraDistance / zoom,
		half = minViewTiles / zoom / 2,
		needed = half / (distance * aspect),
		base = Math.tan((baseFov * Math.PI) / 360);
	if (needed <= base) return { fov: baseFov, distance };
	const fov = (2 * Math.atan(needed) * 180) / Math.PI;
	if (fov <= maxFov) return { fov, distance };
	return { fov: maxFov, distance: half / (Math.tan((maxFov * Math.PI) / 360) * aspect) };
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

/** What the stage measured on its last frame, as plain numbers for a debug readout. */
export interface StageStats extends RosterStats {
	/** Milliseconds `sync` took: reading the sim's list, matching actors and updating them. */
	syncMs: number;
	/** Draw calls in the last render, shadow pass included. */
	calls: number;
	/** Triangles in the last render, shadow pass included. */
	triangles: number;
	geometries: number;
	programs: number;
	/** Frames a second, smoothed over about a second of `tick` calls. */
	fps: number;
}

/** The scene, the camera and the pool of actors. */
export class Stage {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(baseFov, 16 / 9, 0.5, 400);
	readonly renderer: THREE.WebGLRenderer;
	readonly draws: SpriteDraw[] = [];
	/** Sprite names drawn by the flat fallback this frame, for tooling that reports missing models. */
	readonly unmodelled: Set<string>;
	/** Counts from the last frame: actors, draw calls, triangles, milliseconds in `sync`. Read it, do not write it. */
	readonly stats: StageStats = {
		fixedActors: 0,
		placedTiles: 0,
		movingActors: 0,
		leaving: 0,
		sprites: 0,
		reconciles: 0,
		syncMs: 0,
		calls: 0,
		triangles: 0,
		geometries: 0,
		programs: 0,
		fps: 0,
	};
	/** When true the stage does not advance the sim, so tooling can pose a frame. */
	paused = false;
	/** How much closer than usual the camera stands; 2 is twice as close, centred on Ben. */
	zoom = 1;
	private readonly roster: Roster;
	private readonly fallback: ModelSet;
	private readonly sun: THREE.DirectionalLight;
	private carry = 0;
	private last = 0;
	private time = 0;
	private smoothDt = 0;
	private shadowKey = '';
	private readonly target = new THREE.Vector3();
	private readonly frame: FrameContext = {
		time: 0,
		dt: 0,
		ben: { x: 0, y: 0 },
		camera: { x: 0, y: 0, z: cameraDistance },
		draws: this.draws,
	};

	constructor(private readonly options: StageOptions) {
		this.fallback = flatSprites(options.sheet, options.sheetImage);
		this.roster = new Roster(this.scene, options.sets, this.fallback);
		this.unmodelled = this.roster.unmodelled;
		this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true });
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.scene.background = new THREE.Color(0x1a1030);
		/* A little haze that starts behind the level, so the backdrop's layers separate with distance. */
		this.scene.fog = new THREE.Fog(0xd864b8, 26, 260);
		this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x4a3050, 1.5));
		const sun = (this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4));
		sun.name = 'sun';
		sun.position.copy(sunOffset);
		sun.castShadow = true;
		sun.shadow.mapSize.set(shadowSize, shadowSize);
		sun.shadow.camera.near = 1;
		sun.shadow.camera.far = 56;
		sun.shadow.bias = -0.0015;
		this.scene.add(sun, sun.target);
	}

	/** Reads the sim's frame and brings the actors into line with it. */
	sync(alpha: number, dt: number): void {
		const started = performance.now(),
			view = this.options.sim.frame(alpha, this.draws),
			draws = this.draws;
		let ben: SpriteDraw | undefined;
		/* Ben is drawn near the end of the list. */
		for (let i = draws.length - 1; i >= 0; i--)
			if (draws[i].name.startsWith('ben_')) {
				ben = draws[i];
				break;
			}
		const frame = this.frame,
			close = this.zoom > 1,
			look = this.target;
		frame.time = this.time;
		frame.dt = dt;
		frame.ben.x = ben ? ben.x : view.cameraX;
		frame.ben.y = ben ? ben.y : view.cameraY;
		/* The camera follows the sim's own, pulled back and raised a little so the level reads as a place. Zoomed in, it
		   centres on Ben instead. It is placed before any actor is updated, so models see this frame's view. */
		const { fov, distance } = framing(this.camera.aspect, this.zoom),
			scale = distance / cameraDistance;
		if (close) look.set(frame.ben.x, frame.ben.y, 0);
		else {
			/* The sim frames a wider view than this one, and holds it still at the level's ends, which can leave Ben at
			   the edge or off screen. Keep him within a share of the half view of the centre. */
			const halfH = distance * Math.tan((fov * Math.PI) / 360),
				halfW = halfH * this.camera.aspect;
			look.set(
				clamp(view.cameraX, frame.ben.x - halfW * leadX, frame.ben.x + halfW * leadX),
				clamp(
					view.cameraY + lookRise,
					frame.ben.y - halfH * leadUp,
					frame.ben.y + halfH * leadDown,
				),
				0,
			);
		}
		if (Math.abs(this.camera.fov - fov) > 1e-6) {
			this.camera.fov = fov;
			this.camera.updateProjectionMatrix();
		}
		this.camera.position.set(
			look.x + cameraOffset.x * scale,
			look.y + cameraOffset.y * scale,
			distance,
		);
		this.camera.lookAt(look);
		frame.camera.x = this.camera.position.x;
		frame.camera.y = this.camera.position.y;
		frame.camera.z = distance;
		this.roster.sync(draws, frame);
		this.aimSun(look, fov, distance);
		Object.assign(this.stats, this.roster.stats);
		this.stats.syncMs = performance.now() - started;
	}

	/**
	 * Points the sun at the strip of level in view and fits its shadow box to it, snapped to whole shadow texels so
	 * shadows do not swim as the camera moves.
	 */
	private aimSun(look: THREE.Vector3, fov: number, distance: number): void {
		const halfH = distance * Math.tan((fov * Math.PI) / 360),
			halfW = halfH * this.camera.aspect,
			cam = this.sun.shadow.camera,
			/* The sun looks along -sunOffset; these are the shadow camera's right and up in the world. */
			right = new THREE.Vector3(sunOffset.z, 0, -sunOffset.x).normalize(),
			up = new THREE.Vector3().crossVectors(right, sunOffset).normalize().negate();
		/* The box must cover the visible ground and the lane's depth, as seen along the light. */
		const reach = depth.lane / 2 + 0.3,
			w = right.x * (halfW + 1) + right.z * reach + 0.5,
			h = Math.abs(up.x) * (halfW + 1) + up.y * (halfH + 1.5) + Math.abs(up.z) * reach + 0.5,
			key = `${w.toFixed(2)}|${h.toFixed(2)}`;
		if (key !== this.shadowKey) {
			this.shadowKey = key;
			cam.left = -w;
			cam.right = w;
			cam.top = h;
			cam.bottom = -h;
			cam.updateProjectionMatrix();
		}
		const textel = (2 * w) / shadowSize,
			texelUp = (2 * h) / shadowSize,
			snapR = Math.round(look.dot(right) / textel) * textel - look.dot(right),
			snapU = Math.round(look.dot(up) / texelUp) * texelUp - look.dot(up);
		this.sun.target.position.copy(look).addScaledVector(right, snapR).addScaledVector(up, snapU);
		this.sun.position.copy(this.sun.target.position).add(sunOffset);
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

	private render(dt: number): void {
		this.renderer.render(this.scene, this.camera);
		const info = this.renderer.info,
			stats = this.stats;
		stats.calls = info.render.calls;
		stats.triangles = info.render.triangles;
		stats.geometries = info.memory.geometries;
		stats.programs = info.programs?.length ?? 0;
		if (dt > 0) {
			this.smoothDt = this.smoothDt ? this.smoothDt * 0.95 + dt * 0.05 : dt;
			stats.fps = 1 / this.smoothDt;
		}
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
		this.render(dt);
	}

	/** Advances the sim by whole steps with fixed input and draws once, for tooling and tests. */
	advance(steps: number, held: number): void {
		for (let i = 0; i < steps; i++) this.options.sim.step(held);
		this.time += steps * stepSeconds;
		this.sync(0, steps * stepSeconds);
		this.render(0);
	}
}
