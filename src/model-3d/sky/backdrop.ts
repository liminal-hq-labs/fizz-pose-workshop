// The daylight backdrop of the open-sky levels: a bright sky with a warm sun, drifting clouds at three depths, a sea of cloud and layers of distant biscuit mesas.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { FrameContext } from '../../level-3d/types.ts';
import { lattice, rng } from '../crater/hash.ts';
import { propMaterial } from '../crater/materials.ts';
import { Mesher, mix, shade } from '../crater/mesher.ts';
import { cameraBehind, type Scenery } from '../crater/scenery.ts';
import { lump, softened } from './lumps.ts';
import { palette } from './palette.ts';

/** The open-sky levels by the simulation's id: Meteor Mesa, Marshmallow Meadows, Frosting Flats and Gumdrop Isle. */
export const openSkyLevels: readonly number[] = [3, 5, 10, 13];

/** True when `level` is one of the open-sky levels; a missing level is not. */
export function isOpenSky(level: number | undefined): boolean {
	return level !== undefined && openSkyLevels.includes(level);
}

/** A part of the backdrop that trails the camera by a fraction, so near layers slide past faster than far ones. */
interface Layer {
	object: THREE.Object3D;
	/** How much of the camera's x and y the layer follows; 1 would pin it to the screen. */
	fx: number;
	fy: number;
	/** The layer's resting position when the camera is at the origin. */
	ox: number;
	oy: number;
	oz: number;
}

interface Drifter {
	object: THREE.Object3D;
	base: number;
	speed: number;
	y: number;
	z: number;
	/** How much of the camera's x the cloud follows. */
	fx: number;
}

/** How the stage lights a level before the daylight backdrop changes them, and what the daylight sets. */
const daylight_ = {
	background: palette.horizon,
	fog: { colour: 0xcfe8fb, near: 46, far: 330 },
	hemisphere: { sky: 0xeaf4ff, ground: 0xf2d49c, intensity: 1.45 },
	sun: { colour: 0xfff0d2, intensity: 2.3 },
};

/** The direction of the sun in the sky, as a vector from the viewer. */
const sunDirection = new THREE.Vector3(-0.22, 0.12, -0.96).normalize();

const skyStops: readonly (readonly [number, number])[] = [
	[-0.35, 0xc8e6ff],
	[0, 0xa4d6ff],
	[0.1, 0x7ac4fc],
	[0.3, 0x4aa8f4],
	[0.65, 0x2f94ec],
	[1, 0x2a86e2],
];

function skyColour(h: number): number {
	if (h <= skyStops[0][0]) return skyStops[0][1];
	for (let i = 1; i < skyStops.length; i++) {
		const [h1, c1] = skyStops[i],
			[h0, c0] = skyStops[i - 1];
		if (h <= h1) return mix(c0, c1, (h - h0) / (h1 - h0));
	}
	return skyStops[skyStops.length - 1][1];
}

function makeSky(): THREE.Object3D {
	const geometry = new THREE.SphereGeometry(300, 40, 28),
		position = geometry.getAttribute('position'),
		colours = new Float32Array(position.count * 3),
		scratch = new THREE.Color(),
		dir = new THREE.Vector3();
	for (let i = 0; i < position.count; i++) {
		dir.fromBufferAttribute(position, i).normalize();
		/* The sky brightens and warms round the sun. */
		const near = Math.max(0, dir.dot(sunDirection)),
			warm = near ** 14 * 0.55 + near ** 4 * 0.12;
		scratch.setHex(mix(skyColour(dir.y), palette.sunGlow, Math.min(0.4, warm)));
		colours.set([scratch.r, scratch.g, scratch.b], i * 3);
	}
	geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
	const sky = new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({
			vertexColors: true,
			side: THREE.BackSide,
			depthWrite: false,
			fog: false,
		}),
	);
	sky.renderOrder = -100;
	sky.frustumCulled = false;
	return sky;
}

/** A soft round glow: rings of triangles whose vertex alpha falls from `strength` at the centre to nothing at the rim. */
function makeGlow(radius: number, colour: number, strength: number): THREE.Mesh {
	const rings = 10,
		segments = 32,
		position: number[] = [],
		rgba: number[] = [],
		index: number[] = [],
		tint = new THREE.Color(colour);
	for (let r = 0; r <= rings; r++) {
		const t = r / rings;
		for (let k = 0; k < segments; k++) {
			const a = (k / segments) * Math.PI * 2;
			position.push(Math.cos(a) * t * radius, Math.sin(a) * t * radius, 0);
			rgba.push(tint.r, tint.g, tint.b, strength * (1 - t) ** 2);
		}
	}
	for (let r = 0; r < rings; r++)
		for (let k = 0; k < segments; k++) {
			const a = r * segments + k,
				b = r * segments + ((k + 1) % segments),
				c = (r + 1) * segments + k,
				d = (r + 1) * segments + ((k + 1) % segments);
			index.push(a, b, d, a, d, c);
		}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
	geometry.setIndex(index);
	return new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			fog: false,
			side: THREE.DoubleSide,
		}),
	);
}

/** The sun: a pale disc inside a warm glow, high on the left where the stage's own sun stands. */
function makeSun(): THREE.Object3D {
	const group = new THREE.Group(),
		disc = new THREE.Mesh(
			new THREE.CircleGeometry(12, 40),
			new THREE.MeshBasicMaterial({ color: palette.sun, fog: false, depthWrite: false }),
		),
		halo = makeGlow(70, palette.sunGlow, 0.85),
		wide = makeGlow(200, palette.sunGlow, 0.18);
	disc.renderOrder = -80;
	halo.renderOrder = -85;
	wide.renderOrder = -86;
	for (const part of [disc, halo, wide]) part.frustumCulled = false;
	group.add(wide, halo, disc);
	group.position.copy(sunDirection).multiplyScalar(250);
	const holder = new THREE.Group();
	holder.add(group);
	return holder;
}

/** How a cloud lump is painted: white where it faces the sun, sky-blue grey underneath. */
function cloudPaint(height: number, up: number): number {
	const lit = Math.min(1, Math.max(0, 0.42 + 0.55 * up + 0.3 * height)),
		smooth = lit * lit * (3 - 2 * lit),
		base = mix(palette.cloudBlue, palette.cloud, smooth);
	return up > 0.5 ? mix(base, 0xfffcec, (up - 0.5) * 0.5) : base;
}

/**
 * A cumulus: a row of rounded puffs with a level base, taller in the middle, with smaller puffs heaped on top. `size` is
 * the length of the base in tiles.
 */
function makeCloud(seed: number, size: number): THREE.BufferGeometry {
	const rand = rng(seed),
		m = new Mesher(),
		puffs = 4 + Math.floor(rand() * 3);
	for (let i = 0; i < puffs; i++) {
		const t = puffs === 1 ? 0 : i / (puffs - 1) - 0.5,
			lift = 1 - Math.abs(t) * 1.3,
			rx = size * (0.14 + 0.07 * rand()) * (0.7 + 0.5 * lift),
			ry = rx * (0.62 + 0.18 * rand()) * (0.7 + 0.5 * lift),
			x = t * size * 0.8;
		lump(m, [x, ry * 0.25, (rand() - 0.5) * size * 0.06], [rx, ry, rx * 0.8], cloudPaint, {
			flat: 0.4,
		});
		if (rand() < 0.7)
			lump(m, [x + (rand() - 0.5) * rx, ry * 0.9, 0], [rx * 0.62, ry * 0.7, rx * 0.55], cloudPaint);
	}
	return softened(m.build());
}

/** Strata of the mesas: the sprite's brown in the golden and toasted shades of a baked biscuit. */
const strata = [0xd6a05a, 0xb26e2c, 0xc98a40, 0x9e6228, 0xdcae68, 0xb87832] as const;

interface MesaOptions {
	seed: number;
	/** The strip of sky the mesas are spread along, in tiles. */
	span: number;
	width: readonly [number, number];
	height: readonly [number, number];
	gap: readonly [number, number];
	/** How far the colours are pulled towards the haze, 0 to 1. */
	haze: number;
}

/**
 * Flat-topped mesas and buttes along a strip, each a stack of boxes that step in as they rise, so the cliffs read as
 * layers of baked biscuit, standing on a skirt of crumbs and capped with pale icing. Their fronts are at z = 0 and they run
 * back from there; the foot of the skirt is at y = 0 and the box walls carry on far below it, so nothing shows through.
 */
function makeMesas(options: MesaOptions): THREE.BufferGeometry {
	const { seed, span, width, height, gap, haze } = options,
		rand = rng(seed),
		m = new Mesher(),
		tint = (colour: number, k: number): number => mix(shade(colour, k), palette.haze, haze),
		between = (range: readonly [number, number]): number =>
			range[0] + (range[1] - range[0]) * rand();
	for (let x = -span / 2; x < span / 2;) {
		const butte = rand() < 0.3,
			w = between(width) * (butte ? 0.45 : 1),
			h = between(height) * (butte ? 1.3 : 1),
			cx = x + w / 2,
			depth = w * 0.6,
			skirt = h * 0.32,
			shoulder = h * 0.34;
		/* The skirt of crumbs: a trapezoid sloping up to the cliff's foot, over a plain wall down to the floor. */
		const skirtLow = tint(0xb88040, 0.95),
			skirtHigh = tint(0xe0b46e, 1.05);
		m.quadC(
			[cx - w / 2 - skirt, 0, 0],
			[cx + w / 2 + skirt, 0, 0],
			[cx + w / 2, shoulder, 0],
			[cx - w / 2, shoulder, 0],
			skirtLow,
			skirtLow,
			skirtHigh,
			skirtHigh,
		);
		m.box(cx - w / 2 - skirt, -60, -depth * 0.6, cx + w / 2 + skirt, 0, 0, skirtLow, {
			top: false,
			bottom: false,
			back: false,
		});
		m.quad(
			[cx - w / 2 - skirt, 0, 0],
			[cx - w / 2, shoulder, 0],
			[cx - w / 2, shoulder, -depth],
			[cx - w / 2 - skirt, 0, -depth * 0.6],
			tint(0xa87038, 0.9),
		);
		m.quad(
			[cx + w / 2 + skirt, 0, 0],
			[cx + w / 2, shoulder, -depth],
			[cx + w / 2, shoulder, 0],
			[cx + w / 2 + skirt, 0, -depth * 0.6],
			tint(0xa87038, 0.8),
		);
		/* The cliff: one or two tiers, the front cut into bands of strata that carry on across the tier. */
		const tiers = rand() < 0.45 ? 2 : 1;
		let y0 = shoulder,
			inset = 0;
		for (let t = 0; t < tiers; t++) {
			const last = t === tiers - 1,
				y1 = last ? h : shoulder + (h - shoulder) * (0.55 + 0.15 * rand()),
				left = cx - w / 2 + inset,
				right = cx + w / 2 - inset,
				back = -depth * (1 - inset / w),
				bands = Math.max(3, Math.round((y1 - y0) / 2));
			for (let i = 0; i < bands; i++) {
				const ya = y0 + ((y1 - y0) * i) / bands,
					yb = y0 + ((y1 - y0) * (i + 1)) / bands,
					base = strata[(i + Math.floor(rand() * 3)) % strata.length],
					front = tint(base, (0.84 + 0.16 * (i / bands)) * (0.94 + 0.12 * rand()));
				m.quad([left, ya, 0], [right, ya, 0], [right, yb, 0], [left, yb, 0], front);
				m.quad(
					[right, ya, 0],
					[right, ya, back],
					[right, yb, back],
					[right, yb, 0],
					shade(front, 0.74),
				);
				m.quad(
					[left, ya, back],
					[left, ya, 0],
					[left, yb, 0],
					[left, yb, back],
					shade(front, 0.84),
				);
			}
			/* The top: pale icing on the highest tier, plain baked crust on the lower one. */
			m.quad(
				[left, y1, 0],
				[right, y1, 0],
				[right, y1, back],
				[left, y1, back],
				last ? tint(0xfff0b4, 1.02) : tint(0xe8b870, 1.1),
			);
			y0 = y1;
			inset += w * (0.05 + 0.07 * rand());
		}
		x += w + between(gap);
	}
	return m.build();
}

/**
 * A sea of cloud, a bank of flat-based puffs spread over the ground plane far below the level, so the gaps between the
 * mesas open on cloud rather than on nothing.
 */
function makeCloudSea(): THREE.BufferGeometry {
	const rand = rng(77),
		m = new Mesher();
	for (let i = 0; i < 150; i++) {
		const x = (rand() - 0.5) * 520,
			z = -90 - rand() * 90,
			r = 9 + rand() * 13;
		lump(m, [x, 0, z], [r, r * (0.16 + rand() * 0.14), r * 0.55], cloudPaint, {
			flat: 0.4,
			detail: 0,
		});
	}
	return softened(m.build());
}

class Daylight implements Scenery {
	readonly root = new THREE.Group();
	private readonly layers: Layer[] = [];
	private readonly drifters: Drifter[] = [];
	private stamp = Number.NaN;
	private saved: {
		background: THREE.Color | THREE.Texture | null;
		fog: { colour: number; near: number; far: number } | null;
		hemisphere: { sky: number; ground: number; intensity: number } | null;
		sun: { colour: number; intensity: number } | null;
	} | null = null;

	constructor() {
		this.root.name = 'sky backdrop';
		this.add(makeSky(), 1, 1, 0, 3, 0);
		this.add(makeSun(), 1, 1, 0, 3, 0);
		const clouds = [
			{ count: 4, z: -62, size: 20, y: 12, spread: 12, speed: 0.9, fx: 0.86 },
			{ count: 5, z: -105, size: 32, y: 20, spread: 14, speed: 0.55, fx: 0.93 },
			{ count: 5, z: -160, size: 48, y: 28, spread: 18, speed: 0.35, fx: 0.97 },
		];
		let seed = 500;
		for (const tier of clouds)
			for (let i = 0; i < tier.count; i++, seed++) {
				const object = new THREE.Mesh(
					makeCloud(seed, tier.size * (0.8 + 0.4 * lattice(seed, 1))),
					propMaterial,
				);
				this.drifters.push({
					object,
					base: i * (420 / tier.count) + lattice(seed, 2) * 30,
					speed: tier.speed * (0.8 + 0.4 * lattice(seed, 3)),
					y: tier.y + (lattice(seed, 4) - 0.3) * tier.spread,
					z: tier.z - lattice(seed, 5) * 14,
					fx: tier.fx,
				});
				this.root.add(object);
			}
		/* Three ranks of mesas: far and pale, then nearer and warmer. The offsets keep each rank where it stood on screen for a camera at the usual height. */
		const ranks = [
			{
				seed: 11,
				span: 640,
				width: [20, 46],
				height: [16, 30],
				gap: [30, 95],
				haze: 0.22,
				fx: 0.9,
				fy: 0.94,
				oy: -12.6,
				oz: -170,
			},
			{
				seed: 23,
				span: 560,
				width: [14, 32],
				height: [9, 18],
				gap: [30, 85],
				haze: 0.12,
				fx: 0.78,
				fy: 0.92,
				oy: -8.5,
				oz: -112,
			},
			{
				seed: 31,
				span: 480,
				width: [8, 18],
				height: [4, 8],
				gap: [40, 110],
				haze: 0.05,
				fx: 0.6,
				fy: 0.9,
				oy: -9.5,
				oz: -78,
			},
		] as const;
		for (const rank of ranks)
			this.add(
				new THREE.Mesh(makeMesas(rank), propMaterial),
				rank.fx,
				rank.fy,
				0,
				rank.oy,
				rank.oz,
			);
		this.add(new THREE.Mesh(makeCloudSea(), propMaterial), 0.94, 0.8, 0, -20.5, 0);
	}

	private add(
		object: THREE.Object3D,
		fx: number,
		fy: number,
		ox: number,
		oy: number,
		oz: number,
	): void {
		object.position.set(ox, oy, oz);
		this.root.add(object);
		this.layers.push({ object, fx, fy, ox, oy, oz });
	}

	/** Sets the sky the level is lit by: the background, the haze and the stage's hemisphere light and sun. */
	enter(scene: THREE.Object3D): void {
		const saved: NonNullable<Daylight['saved']> = {
			background: null,
			fog: null,
			hemisphere: null,
			sun: null,
		};
		if ((scene as THREE.Scene).isScene) {
			const stage = scene as THREE.Scene;
			saved.background = stage.background;
			stage.background = new THREE.Color(daylight_.background);
			if (stage.fog) {
				saved.fog = {
					colour: stage.fog.color.getHex(),
					near: (stage.fog as THREE.Fog).near,
					far: (stage.fog as THREE.Fog).far,
				};
				stage.fog.color.setHex(daylight_.fog.colour);
				(stage.fog as THREE.Fog).near = daylight_.fog.near;
				(stage.fog as THREE.Fog).far = daylight_.fog.far;
			}
		}
		scene.traverse((object) => {
			const hemisphere = object as THREE.HemisphereLight;
			if (hemisphere.isHemisphereLight) {
				saved.hemisphere = {
					sky: hemisphere.color.getHex(),
					ground: hemisphere.groundColor.getHex(),
					intensity: hemisphere.intensity,
				};
				hemisphere.color.setHex(daylight_.hemisphere.sky);
				hemisphere.groundColor.setHex(daylight_.hemisphere.ground);
				hemisphere.intensity = daylight_.hemisphere.intensity;
			} else if (object.name === 'sun' && (object as THREE.DirectionalLight).isDirectionalLight) {
				const sun = object as THREE.DirectionalLight;
				saved.sun = { colour: sun.color.getHex(), intensity: sun.intensity };
				sun.color.setHex(daylight_.sun.colour);
				sun.intensity = daylight_.sun.intensity;
			}
		});
		this.saved = saved;
	}

	/** Puts back what `enter` changed. */
	leave(scene: THREE.Object3D): void {
		const saved = this.saved;
		this.saved = null;
		if (!saved) return;
		if ((scene as THREE.Scene).isScene) {
			const stage = scene as THREE.Scene;
			stage.background = saved.background;
			if (stage.fog && saved.fog) {
				stage.fog.color.setHex(saved.fog.colour);
				(stage.fog as THREE.Fog).near = saved.fog.near;
				(stage.fog as THREE.Fog).far = saved.fog.far;
			}
		}
		scene.traverse((object) => {
			const hemisphere = object as THREE.HemisphereLight;
			if (hemisphere.isHemisphereLight && saved.hemisphere) {
				hemisphere.color.setHex(saved.hemisphere.sky);
				hemisphere.groundColor.setHex(saved.hemisphere.ground);
				hemisphere.intensity = saved.hemisphere.intensity;
			} else if (
				object.name === 'sun' &&
				(object as THREE.DirectionalLight).isDirectionalLight &&
				saved.sun
			) {
				const sun = object as THREE.DirectionalLight;
				sun.color.setHex(saved.sun.colour);
				sun.intensity = saved.sun.intensity;
			}
		});
	}

	/** Slides the layers with the camera, not with Ben, so they hold still when he jumps with the view held. */
	follow(frame: FrameContext): void {
		const x = frame.camera.x + cameraBehind.x,
			y = frame.camera.y - cameraBehind.y,
			stamp = frame.time * 1000 + x * 7 + y * 13;
		if (stamp === this.stamp) return;
		this.stamp = stamp;
		for (const layer of this.layers)
			layer.object.position.set(x * layer.fx + layer.ox, y * layer.fy + layer.oy, layer.oz);
		for (const cloud of this.drifters) {
			const span = 420,
				drift = (((cloud.base + frame.time * cloud.speed) % span) + span) % span;
			cloud.object.position.set(x * cloud.fx + drift - span / 2, y * 0.9 + cloud.y, cloud.z);
		}
	}
}

let shared: Daylight | null = null;

/** The one daylight backdrop, made the first time it is asked for. */
export function daylight(): Scenery {
	return (shared ??= new Daylight());
}
