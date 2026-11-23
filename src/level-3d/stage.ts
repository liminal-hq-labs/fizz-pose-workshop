// The level stage: runs the sim at its fixed step and keeps one 3D actor alive for each sprite it draws.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { depth } from '../model-3d/toon.ts';
import { Roster, type RosterStats } from './roster.ts';
import { LevelSim, Mode, type SpriteSheet, State, stepSeconds } from './sim.ts';
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
/** The sun's offset from the point it lights in a level: behind the level and a little left of the camera. */
const sunOffset = new THREE.Vector3(-8, 16, 14);
/** The sun's offset on the map: south-west and high, so shadows fall north-east across the ground. */
const mapSunOffset = new THREE.Vector3(-14, -10, 22);
const shadowSize = 1536;

/** The overworld's camera: seen from the south, looking north and down. */
const mapCamera = {
	/** How far the camera stands from the point it looks at on a wide screen, in tiles. */
	distance: 16,
	fov: 32,
	maxFov: 56,
	/** The fewest tiles of the ground the view may show across, however narrow the screen. */
	minTiles: 14,
	/** The angle the view looks down at, from horizontal, in degrees. */
	pitch: 55,
	/** How far Ben may stand from the middle of the frame, as a share of the half view. */
	lead: 0.4,
	/** The tallest thing on the map that casts a shadow, in tiles, for fitting the shadow box. */
	casterHeight: 4,
} as const;

/** What the stage is showing: the side-on level or the overworld seen from above. */
export type SceneMode = 'level' | 'map';

/** The scene the sim is in: the stage drops every actor when this changes. */
export interface SceneId {
	mode: SceneMode;
	/** The level's id in a level; undefined on the map. */
	level: number | undefined;
	/** A string that is equal for equal scenes. */
	key: string;
}

/** The scene for the sim's mode and level id. The attract loop and a stopped sim draw as a level. */
export function sceneOf(simMode: number, levelId: number): SceneId {
	if (simMode === Mode.map) return { mode: 'map', level: undefined, key: 'map' };
	return { mode: 'level', level: levelId, key: `level:${levelId}` };
}

/** A camera's distance and field of view on a wide screen, the fewest tiles it may show across and the widest view it takes. */
interface FramingSpec {
	distance: number;
	fov: number;
	maxFov: number;
	minTiles: number;
}

function framingFor(
	spec: FramingSpec,
	aspect: number,
	zoom: number,
): { fov: number; distance: number } {
	const distance = spec.distance / zoom,
		half = spec.minTiles / zoom / 2,
		needed = half / (distance * aspect),
		base = Math.tan((spec.fov * Math.PI) / 360);
	if (needed <= base) return { fov: spec.fov, distance };
	const fov = (2 * Math.atan(needed) * 180) / Math.PI;
	if (fov <= spec.maxFov) return { fov, distance };
	return { fov: spec.maxFov, distance: half / (Math.tan((spec.maxFov * Math.PI) / 360) * aspect) };
}

/**
 * The level camera's field of view and distance for a screen shape and zoom. The camera stands at `cameraDistance`, with
 * the base field of view, unless that would show fewer than `minViewTiles` across; then it widens the field of view, and
 * when that reaches `maxFov` it pulls back as well.
 */
export function framing(aspect: number, zoom = 1): { fov: number; distance: number } {
	return framingFor(
		{ distance: cameraDistance, fov: baseFov, maxFov, minTiles: minViewTiles },
		aspect,
		zoom,
	);
}

/** The same for the map camera: about 16 tiles across on a wide screen, never fewer than 14. */
export function mapFraming(aspect: number, zoom = 1): { fov: number; distance: number } {
	return framingFor(mapCamera, aspect, zoom);
}

/** Where the map camera stands relative to the point it looks at, `distance` away: south of it and up. */
export function mapCameraOffset(distance: number): THREE.Vector3 {
	const pitch = (mapCamera.pitch * Math.PI) / 180;
	return new THREE.Vector3(0, -Math.cos(pitch) * distance, Math.sin(pitch) * distance);
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
					/* The sim lists sprites in painter's order, so they are drawn in it rather than sorted by depth:
					   sprites that lie on one plane would otherwise fight over it. */
					depthWrite: false,
				});
				materials.set(family, material);
			}
			const mesh = new THREE.Mesh(plane, material.clone());
			return {
				object: mesh,
				update(draw) {
					mesh.position.set(draw.x, draw.y, 0);
					mesh.renderOrder = draw.order;
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
	/** The scene the actors on the stage belong to. */
	private shown: SceneId;
	private readonly target = new THREE.Vector3();
	private readonly frame: FrameContext = {
		time: 0,
		dt: 0,
		ben: { x: 0, y: 0 },
		camera: { x: 0, y: 0, z: cameraDistance },
		draws: this.draws,
	};

	constructor(private readonly options: StageOptions) {
		this.shown = sceneOf(options.sim.mode, options.sim.state(State.levelId));
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
			sim = this.options.sim,
			view = sim.frame(alpha, this.draws),
			draws = this.draws,
			scene = sceneOf(sim.mode, sim.state(State.levelId));
		/* A new scene shares nothing with the last: drop every actor, with no exit, before any is matched to this frame. */
		if (scene.key !== this.shown.key) this.changeScene(scene);
		let ben: SpriteDraw | undefined;
		/* Ben is drawn near the end of the list. */
		for (let i = draws.length - 1; i >= 0; i--)
			if (draws[i].name.startsWith('ben_')) {
				ben = draws[i];
				break;
			}
		const frame = this.frame,
			look = this.target;
		frame.time = this.time;
		frame.dt = dt;
		frame.mode = scene.mode;
		frame.level = scene.level;
		frame.ben.x = ben ? ben.x : view.cameraX;
		frame.ben.y = ben ? ben.y : view.cameraY;
		if (scene.mode === 'map') this.syncMap(view, frame);
		else this.syncLevel(view, frame);
		this.roster.sync(draws, frame);
		Object.assign(this.stats, this.roster.stats);
		this.stats.syncMs = performance.now() - started;
	}

	/** Which scene the stage is showing, and the one the sim is in now. */
	get showing(): SceneId {
		return this.shown;
	}

	/** Drops every actor and sets the sun and shadow for the new scene. */
	private changeScene(scene: SceneId): void {
		this.roster.clear();
		this.shown = scene;
		this.shadowKey = '';
		const cam = this.sun.shadow.camera;
		if (scene.mode === 'map') {
			/* The ground is the XY plane and Z is up, so the shadow camera's own up is Z. */
			cam.up.set(0, 0, 1);
		} else {
			cam.up.set(0, 1, 0);
			cam.near = 1;
			cam.far = 56;
			cam.updateProjectionMatrix();
		}
	}

	/** Places the level camera and the sun for this frame. */
	private syncLevel(view: { cameraX: number; cameraY: number }, frame: FrameContext): void {
		const close = this.zoom > 1,
			look = this.target;
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
		this.setFov(fov);
		this.camera.position.set(
			look.x + cameraOffset.x * scale,
			look.y + cameraOffset.y * scale,
			distance,
		);
		this.camera.lookAt(look);
		frame.camera.x = this.camera.position.x;
		frame.camera.y = this.camera.position.y;
		frame.camera.z = distance;
		this.aimSun(look, fov, distance);
	}

	/**
	 * Places the map camera: it follows the sim's own, kept within a share of the half view of Ben, standing south of the
	 * point it looks at and above it, looking north and down. Zoomed in, it centres on Ben.
	 */
	private syncMap(view: { cameraX: number; cameraY: number }, frame: FrameContext): void {
		const look = this.target,
			{ fov, distance } = mapFraming(this.camera.aspect, this.zoom),
			halfW = distance * Math.tan((fov * Math.PI) / 360) * this.camera.aspect,
			/* The view's half height on the ground is its half height across the view, foreshortened by the pitch. */
			halfGround =
				(distance * Math.tan((fov * Math.PI) / 360)) / Math.sin((mapCamera.pitch * Math.PI) / 180);
		if (this.zoom > 1) look.set(frame.ben.x, frame.ben.y, 0);
		else
			look.set(
				clamp(
					view.cameraX,
					frame.ben.x - halfW * mapCamera.lead,
					frame.ben.x + halfW * mapCamera.lead,
				),
				clamp(
					view.cameraY,
					frame.ben.y - halfGround * mapCamera.lead,
					frame.ben.y + halfGround * mapCamera.lead,
				),
				0,
			);
		this.setFov(fov);
		this.camera.position.copy(look).add(mapCameraOffset(distance));
		this.camera.lookAt(look);
		frame.camera.x = this.camera.position.x;
		frame.camera.y = this.camera.position.y;
		frame.camera.z = this.camera.position.z;
		this.aimMapSun(look);
	}

	private setFov(fov: number): void {
		if (Math.abs(this.camera.fov - fov) <= 1e-6) return;
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

	/**
	 * Points the map's sun at the ground in view and fits its shadow box to it. The box is the bounds, along the light's
	 * own right and up, of the ground the camera sees (and the height of the tallest thing above it), so it is the same
	 * for every look point, and the target snaps to whole shadow texels so shadows do not swim as the camera moves.
	 */
	private aimMapSun(look: THREE.Vector3): void {
		const forward = mapSunOffset.clone().negate().normalize(),
			right = new THREE.Vector3().crossVectors(forward, this.sun.shadow.camera.up).normalize(),
			up = new THREE.Vector3().crossVectors(right, forward).normalize(),
			cam = this.sun.shadow.camera,
			reach = mapSunOffset.length();
		/* The four corners of the view on the ground, relative to the look point: a ray through each corner of the screen. */
		const ground = new THREE.Vector3(),
			ray = new THREE.Vector3(),
			low = [Infinity, Infinity, Infinity],
			high = [-Infinity, -Infinity, -Infinity];
		for (const height of [0, mapCamera.casterHeight])
			for (const [nx, ny] of [
				[-1, -1],
				[1, -1],
				[-1, 1],
				[1, 1],
			]) {
				ray.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
				const t = (height - this.camera.position.z) / ray.z;
				ground.copy(this.camera.position).addScaledVector(ray, t).sub(look);
				const along = [ground.dot(right), ground.dot(up), ground.dot(forward)];
				for (let i = 0; i < 3; i++) {
					low[i] = Math.min(low[i], along[i]);
					high[i] = Math.max(high[i], along[i]);
				}
			}
		const margin = 1,
			key = `map|${low.map((v) => v.toFixed(2))}|${high.map((v) => v.toFixed(2))}`;
		if (key !== this.shadowKey) {
			this.shadowKey = key;
			cam.left = low[0] - margin;
			cam.right = high[0] + margin;
			cam.bottom = low[1] - margin;
			cam.top = high[1] + margin;
			/* The shadow camera stands `reach` back from the target along the light. Casters nearer the light than the
			   ground in view also fall into it, so the near plane has room for them. */
			cam.near = Math.max(0.5, reach + low[2] - 8);
			cam.far = reach + high[2] + 4;
			cam.updateProjectionMatrix();
		}
		const widthTexel = (cam.right - cam.left) / shadowSize,
			heightTexel = (cam.top - cam.bottom) / shadowSize,
			snapRight = Math.round(look.dot(right) / widthTexel) * widthTexel - look.dot(right),
			snapUp = Math.round(look.dot(up) / heightTexel) * heightTexel - look.dot(up);
		this.sun.target.position
			.copy(look)
			.addScaledVector(right, snapRight)
			.addScaledVector(up, snapUp);
		this.sun.position.copy(this.sun.target.position).add(mapSunOffset);
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
