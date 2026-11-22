// The crater's distant scenery: a dusk sky with stars, a ringed planet and candy clouds, layered mountains, rolling hills with gumdrops and lollipops.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, FrameContext } from '../../level-3d/types.ts';
import { lattice, noise2, rng } from './hash.ts';
import { Mesher, mix, shade } from './mesher.ts';
import { propMaterial } from './materials.ts';

/** A part of the backdrop that trails the camera by a fraction, so near layers slide past faster than far ones. */
interface Layer {
	object: THREE.Object3D;
	/** How much of Ben's x and y the layer follows; 1 would pin it to the screen. */
	fx: number;
	fy: number;
	/** The layer's resting position when Ben is at the origin. */
	ox: number;
	oy: number;
	oz: number;
}

/** Gives a geometry vertex colours from a function of each vertex's position. */
function paint(
	geometry: THREE.BufferGeometry,
	colour: (x: number, y: number, z: number) => number,
): THREE.BufferGeometry {
	const position = geometry.getAttribute('position'),
		colours = new Float32Array(position.count * 3),
		scratch = new THREE.Color();
	for (let i = 0; i < position.count; i++) {
		scratch.setHex(colour(position.getX(i), position.getY(i), position.getZ(i)));
		colours.set([scratch.r, scratch.g, scratch.b], i * 3);
	}
	geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
	return geometry;
}

const skyStops: readonly (readonly [number, number])[] = [
	[-0.3, 0xffb070],
	[-0.12, 0xff8296],
	[0.02, 0xe05aa8],
	[0.16, 0x9a3ab8],
	[0.34, 0x5a2a9c],
	[0.7, 0x2a1566],
	[1, 0x160c40],
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
	const geometry = paint(new THREE.SphereGeometry(300, 32, 20), (x, y, z) =>
			skyColour(y / Math.hypot(x, y, z)),
		),
		sky = new THREE.Mesh(
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

function makeStars(): THREE.Object3D {
	const rand = rng(404),
		count = 260,
		position = new Float32Array(count * 3),
		colour = new Float32Array(count * 3),
		tint = new THREE.Color();
	for (let i = 0; i < count; i++) {
		const azimuth = (rand() - 0.5) * 2.2,
			height = 0.03 + Math.pow(rand(), 0.8) * 0.5,
			c = Math.sqrt(1 - height * height);
		position.set([Math.sin(azimuth) * c * -280, height * 280, -Math.cos(azimuth) * c * 280], i * 3);
		tint.setHex(rand() < 0.3 ? 0xffd6f6 : rand() < 0.5 ? 0xd6ecff : 0xffffff);
		colour.set([tint.r, tint.g, tint.b], i * 3);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
	const stars = new THREE.Points(
		geometry,
		new THREE.PointsMaterial({ size: 0.7, vertexColors: true, sizeAttenuation: true, fog: false }),
	);
	stars.frustumCulled = false;
	stars.renderOrder = -90;
	return stars;
}

/** A banded gas giant with a tilted ring. */
function makePlanet(): THREE.Object3D {
	const group = new THREE.Group(),
		bands = [0xffc8ee, 0xff9ad8, 0xffe0f6, 0xe874c8, 0xffb4e4],
		body = new THREE.Mesh(
			paint(new THREE.SphereGeometry(14, 32, 20), (_x, y) => {
				const t = (y / 14 + 1) * 2.5 + Math.sin(y * 0.9) * 0.2;
				return bands[Math.min(bands.length - 1, Math.max(0, Math.floor(t)))];
			}),
			propMaterial,
		),
		ringGeometry = new THREE.RingGeometry(19, 28, 64, 1),
		ring = new THREE.Mesh(
			paint(ringGeometry, (x, y) => {
				const r = Math.hypot(x, y);
				return r < 22.5 ? 0xffe9fb : r < 24 ? 0xd68ad0 : 0xffd0f2;
			}),
			new THREE.MeshBasicMaterial({
				vertexColors: true,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.82,
			}),
		);
	ring.rotation.x = Math.PI / 2 - 0.35;
	ring.rotation.y = 0.25;
	body.castShadow = false;
	group.add(body, ring);
	group.rotation.z = -0.2;
	return group;
}

function makeMoon(radius: number, colour: number): THREE.Object3D {
	const moon = new THREE.Mesh(
		paint(new THREE.SphereGeometry(radius, 20, 14), (x, y, z) =>
			shade(colour, 0.85 + 0.25 * noise2(x * 0.5 + 9, y * 0.5 + z * 0.5, 5)),
		),
		propMaterial,
	);
	return moon;
}

/** Puffs of cotton-candy cloud: flattened spheres in a lumpy row. */
function makeCloud(seed: number): THREE.Object3D {
	const rand = rng(seed),
		group = new THREE.Group(),
		puffs = 4 + Math.floor(rand() * 3),
		material = new THREE.MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.88,
			depthWrite: false,
		});
	for (let i = 0; i < puffs; i++) {
		const r = 5 + rand() * 6,
			puff = new THREE.Mesh(
				paint(new THREE.SphereGeometry(1, 14, 10), (_x, y) => mix(0xff9ad0, 0xffe6f8, (y + 1) / 2)),
				material,
			);
		puff.scale.set(r * 1.5, r * 0.55, r * 0.7);
		puff.position.set((i - puffs / 2) * 8 + rand() * 4, rand() * 2.5, rand() * 6);
		group.add(puff);
	}
	return group;
}

interface RangeOptions {
	width: number;
	depth: number;
	step: number;
	rows: number;
	seed: number;
	/** The terrain height at a point of the range, in local coordinates. */
	height: (x: number, z: number) => number;
	/** The colour of a facet from its height and how upright it is (0 flat, 1 vertical). */
	colour: (y: number, steepness: number, rnd: number) => number;
	floor: number;
	/** A brightness factor applied to every facet, since toon lighting runs bright. */
	dim: number;
}

/**
 * A flat-shaded height field centred on the origin with a skirt dropped from the front edge to `floor`, so nothing shows
 * through below the ridge line. The back edge is left open: another layer or the sky hides it.
 */
function makeRange(options: RangeOptions): THREE.BufferGeometry {
	const { width, depth, step, rows, seed, height, colour, floor, dim } = options,
		cols = Math.round(width / step),
		m = new Mesher(),
		rand = rng(seed),
		px = (i: number): number => -width / 2 + (i * width) / cols,
		pz = (j: number): number => depth / 2 - (j * depth) / rows,
		point = (i: number, j: number): [number, number, number] => [
			px(i),
			height(px(i), pz(j)),
			pz(j),
		];
	for (let i = 0; i < cols; i++)
		for (let j = 0; j < rows; j++) {
			const a = point(i, j),
				b = point(i + 1, j),
				c = point(i + 1, j + 1),
				d = point(i, j + 1),
				split = (lattice(i, j, seed) < 0.5 ? 0 : 1) === 0;
			for (const tri of split
				? ([
						[a, b, c],
						[a, c, d],
					] as const)
				: ([
						[a, b, d],
						[b, c, d],
					] as const)) {
				const [p, q, r] = tri,
					ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]),
					nx = (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]),
					nz = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]),
					steep = 1 - Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1),
					average = (p[1] + q[1] + r[1]) / 3;
				const facet = shade(colour(average, steep, rand()), dim);
				if (ny >= 0) m.tri(p, q, r, facet);
				else m.tri(p, r, q, facet);
			}
		}
	for (let i = 0; i < cols; i++) {
		const a = point(i, 0),
			b = point(i + 1, 0),
			base = colour(Math.min(a[1], b[1]), 0.2, 0.5);
		m.quad([a[0], floor, a[2]], [b[0], floor, b[2]], b, a, shade(base, 0.6 * dim));
	}
	return m.build();
}

function ridged(x: number, z: number, scale: number, salt: number): number {
	const n = noise2(x / scale, z / (scale * 0.8), salt);
	return 1 - Math.abs(n * 2 - 1);
}

function makeFarMountains(): THREE.Object3D {
	const geometry = makeRange({
		width: 520,
		depth: 70,
		step: 7,
		rows: 7,
		seed: 11,
		floor: -120,
		dim: 0.72,
		height(x, z) {
			const front = (35 - z) / 70,
				base = ridged(x, z, 34, 1) ** 1.7 * 30 + noise2(x / 12, z / 12, 2) * 5;
			return base * (0.35 + 0.65 * (1 - front)) + 2;
		},
		colour(y, steep, rnd) {
			if (y > 19) return shade(0xff9cf0, 0.92 + rnd * 0.14);
			const t = Math.min(1, Math.max(0, y / 19));
			return shade(mix(0x2c1880, 0x5e36b8, t), (1 - steep * 0.3) * (0.92 + rnd * 0.14));
		},
	});
	return new THREE.Mesh(geometry, propMaterial);
}

function makeMidMountains(): THREE.Object3D {
	const geometry = makeRange({
		width: 460,
		depth: 36,
		step: 5,
		rows: 5,
		seed: 23,
		floor: -120,
		dim: 0.7,
		height(x, z) {
			const front = (18 - z) / 36,
				base = ridged(x + 40, z, 22, 3) ** 1.5 * 17 + noise2(x / 8, z / 8, 4) * 3;
			return base * (0.4 + 0.6 * (1 - front)) + 1;
		},
		colour(y, steep, rnd) {
			if (y > 14) return shade(0xff7ee0, 0.92 + rnd * 0.12);
			const t = Math.min(1, Math.max(0, y / 14));
			return shade(mix(0x561a8c, 0xa83cc0, t), (1 - steep * 0.3) * (0.92 + rnd * 0.14));
		},
	});
	return new THREE.Mesh(geometry, propMaterial);
}

/** The height of the rolling hills at a point of their local frame, shared so props can stand on them. */
function hillHeight(x: number, z: number): number {
	return 1.4 + noise2(x / 15, z / 9, 7) * 3.6 + noise2(x / 5, z / 4, 8) * 1;
}

const candy = [0xff4fa0, 0x4fe0ff, 0x9cff4f, 0xffe04f, 0xb04fff, 0xff8a3a];

function makeHills(): THREE.Object3D {
	const group = new THREE.Group(),
		geometry = makeRange({
			width: 420,
			depth: 18,
			step: 3,
			rows: 6,
			seed: 31,
			floor: -60,
			dim: 0.82,
			height: hillHeight,
			colour(y, steep, rnd) {
				const lift = Math.min(1, Math.max(0, (y - 1.5) / 6)),
					mint = steep < 0.25 ? 0.22 : 0;
				return shade(mix(mix(0x8a34c4, 0xd85ce0, lift), 0x5fe0b0, mint), 0.9 + rnd * 0.16);
			},
		});
	group.add(new THREE.Mesh(geometry, propMaterial));
	const m = new Mesher(),
		rand = rng(909);
	for (let x = -200; x < 200; x += 8 + rand() * 7) {
		const z = -7 + rand() * 14,
			r = 0.9 + rand() * 1.4,
			y = hillHeight(x, z) - 0.2,
			colour = candy[Math.floor(rand() * candy.length)];
		dome(m, x, y, z, r, colour);
		if (rand() < 0.3)
			dome(m, x + r * 1.5, y - 0.2, z + 1.5, r * 0.55, candy[Math.floor(rand() * candy.length)]);
	}
	for (let x = -190; x < 200; x += 45 + rand() * 35) {
		const z = -8 + rand() * 5;
		lollipop(
			m,
			x,
			hillHeight(x, z) - 0.5,
			z,
			1.1 + rand() * 0.5,
			4 + rand() * 3,
			candy[Math.floor(rand() * candy.length)],
		);
	}
	const props = new THREE.Mesh(m.build(), propMaterial);
	group.add(props);
	return group;
}

/** A gumdrop: a squat hemisphere in rings of facets, lighter towards the crown. */
function dome(m: Mesher, cx: number, cy: number, cz: number, r: number, colour: number): void {
	const rings = 4,
		segments = 10,
		point = (ring: number, k: number): [number, number, number] => {
			const polar = (ring / rings) * (Math.PI / 2),
				a = (k / segments) * Math.PI * 2;
			return [
				cx + Math.cos(a) * Math.cos(polar) * r,
				cy + Math.sin(polar) * r * 0.8,
				cz - Math.sin(a) * Math.cos(polar) * r,
			];
		};
	for (let ring = 0; ring < rings; ring++)
		for (let k = 0; k < segments; k++) {
			const c = shade(colour, 0.85 + 0.3 * (ring / rings) + (k % 2) * 0.04);
			if (ring === rings - 1) m.tri(point(ring, k), point(ring, k + 1), point(rings, 0), c);
			else
				m.quad(point(ring, k), point(ring, k + 1), point(ring + 1, k + 1), point(ring + 1, k), c);
		}
}

/** A lollipop: a pale stick and a two-ring swirled disc facing the viewer. */
function lollipop(
	m: Mesher,
	cx: number,
	baseY: number,
	cz: number,
	r: number,
	stick: number,
	colour: number,
): void {
	const top = baseY + stick,
		cy = top + r * 0.8;
	m.box(cx - 0.12, baseY, cz - 0.12, cx + 0.12, top + 0.3, cz + 0.12, 0xf4eadf, { bottom: false });
	const slices = 12,
		depth = 0.35,
		a = (k: number, scale: number): [number, number, number] => [
			cx + Math.cos((k / slices) * Math.PI * 2) * r * scale,
			cy + Math.sin((k / slices) * Math.PI * 2) * r * scale,
			cz + depth,
		],
		rim = (k: number): [number, number, number] => [a(k, 1)[0], a(k, 1)[1], cz - depth];
	for (let k = 0; k < slices; k++) {
		const odd = k % 2 === 0,
			inner = odd ? colour : 0xffffff,
			outer = odd ? 0xffffff : colour;
		m.tri([cx, cy, cz + depth], a(k, 0.5), a(k + 1, 0.5), inner);
		m.quad(a(k, 0.5), a(k, 1), a(k + 1, 1), a(k + 1, 0.5), outer);
		m.quad(a(k, 1), rim(k), rim(k + 1), a(k + 1, 1), shade(colour, 0.7));
	}
}

class Backdrop {
	readonly root = new THREE.Group();
	private readonly layers: Layer[] = [];
	private readonly clouds: { object: THREE.Object3D; base: number; speed: number; y: number }[] =
		[];
	private stamp = Number.NaN;

	constructor() {
		this.root.name = 'crater backdrop';
		this.add(makeSky(), 1, 1, 0, 3, 0);
		this.add(makeStars(), 1, 1, 0, 3, 0);
		this.add(makePlanet(), 0.96, 0.94, 38, 24, -190);
		this.add(makeMoon(3.2, 0xffe6a8), 0.97, 0.95, -52, 20, -160);
		this.add(makeMoon(1.6, 0xb6e8ff), 0.97, 0.95, -18, 33, -170);
		for (let i = 0; i < 8; i++) {
			const cloud = makeCloud(60 + i),
				y = 8 + (i % 4) * 5.5 + lattice(i, 3) * 4;
			this.clouds.push({ object: cloud, base: i * 52, speed: 0.5 + lattice(i, 9) * 0.6, y });
			this.root.add(cloud);
		}
		this.add(makeFarMountains(), 0.55, 0.85, 0, -14, -130);
		this.add(makeMidMountains(), 0.3, 0.7, 0, -9, -55);
		this.add(makeHills(), 0.12, 0.5, 0, -2, -17);
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

	follow(frame: FrameContext): void {
		const { x, y } = frame.ben,
			stamp = frame.time * 1000 + x * 7 + y * 13;
		if (stamp === this.stamp) return;
		this.stamp = stamp;
		for (const layer of this.layers)
			layer.object.position.set(x * layer.fx + layer.ox, y * layer.fy + layer.oy, layer.oz);
		for (const cloud of this.clouds) {
			const span = 420,
				drift = (((cloud.base + frame.time * cloud.speed) % span) + span) % span;
			cloud.object.position.set(
				x * 0.9 + drift - span / 2,
				y * 0.9 + cloud.y,
				-105 - (cloud.base % 3) * 12,
			);
		}
	}
}

let backdrop: Backdrop | null = null;
let users = 0;

/**
 * An actor for one of the sprites the game draws its parallax scenery with. The actor itself is empty; the first one
 * alive attaches the single shared 3D backdrop to the scene and every update moves it with Ben.
 */
export function backdropActor(): Actor {
	const holder = new THREE.Group();
	users++;
	return {
		object: holder,
		update(_draw, frame) {
			const scene = holder.parent;
			if (!scene) return;
			backdrop ??= new Backdrop();
			if (backdrop.root.parent !== scene) scene.add(backdrop.root);
			backdrop.follow(frame);
		},
		dispose() {
			users--;
			if (users <= 0) backdrop?.root.parent?.remove(backdrop.root);
		},
	};
}
