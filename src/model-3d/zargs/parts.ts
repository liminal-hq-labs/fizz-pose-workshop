// Shared building blocks for the Zarg creatures: cached ellipsoids, tintable parts, googly eyes and motion tracking.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { SpriteDraw } from '../../level-3d/types.ts';
import { inked, toon } from '../toon.ts';

/** The EGA candy colours the creatures are painted in. */
export const ega = {
	black: 0x0a0a12,
	white: 0xffffff,
	grey: 0xaaaaaa,
	green: 0x55ff55,
	darkGreen: 0x00aa00,
	yellow: 0xffff55,
	brown: 0xaa5500,
	darkBrown: 0x7a3a00,
	pink: 0xff55ff,
	purple: 0xaa00aa,
	red: 0xff5555,
	darkRed: 0xaa0000,
	cyan: 0x55ffff,
} as const;

/** How far round from front-on a walking creature turns: most of the way to a profile, still showing its face. */
export const threeQuarter = 1.0;

const ellipsoids = new Map<string, THREE.BufferGeometry>();

/** A shared ellipsoid with the given radii. The scaling is baked in so ink outlines keep an even thickness. */
export function ellipsoid(rx: number, ry: number, rz: number): THREE.BufferGeometry {
	const key = `${rx}|${ry}|${rz}`;
	let geometry = ellipsoids.get(key);
	if (!geometry) {
		geometry = new THREE.SphereGeometry(1, 28, 18);
		geometry.scale(rx, ry, rz);
		ellipsoids.set(key, geometry);
	}
	return geometry;
}

/** Moves `current` towards `target`, frame-rate independently. A zero `dt` leaves it where it is. */
export function ease(current: number, target: number, rate: number, dt: number): number {
	return dt > 0 ? current + (target - current) * (1 - Math.exp(-rate * dt)) : current;
}

export function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}

/** True when the sim has greyed the sprite, which is how it shows a stunned enemy. */
export function isStunned(draw: SpriteDraw): boolean {
	return (draw.tint & 0xff) < 0xe0;
}

/** A blink amount from 0 (open) to 1 (shut) that comes round every few seconds, offset by `seed`. */
export function blinkAmount(time: number, seed: number): number {
	const period = 3.4 + (seed % 1.3),
		p = (time + seed * 7.3) % period;
	return p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0;
}

function multiply(colour: number, tint: number): number {
	const r = (((colour >> 16) & 255) * ((tint >> 16) & 255)) / 255,
		g = (((colour >> 8) & 255) * ((tint >> 8) & 255)) / 255,
		b = ((colour & 255) * (tint & 255)) / 255;
	return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

interface Tinted {
	mesh: THREE.Mesh;
	colour: number;
	emissive: number;
	/** Parts such as eye whites keep most of their brightness when the sprite is greyed, so a stunned face still reads. */
	soft: boolean;
}

/** Moves each channel of a tint most of the way to white. */
function soften(tint: number): number {
	const lift = (c: number): number => Math.round(c + (255 - c) * 0.65);
	return (lift((tint >> 16) & 255) << 16) | (lift((tint >> 8) & 255) << 8) | lift(tint & 255);
}

/** Keeps a creature's parts in step with the sim's tint and alpha by swapping in shared toon materials. */
export class Tint {
	private readonly parts: Tinted[] = [];
	private tint = 0xffffff;
	private alpha = 1;

	add(mesh: THREE.Mesh, colour: number, emissive = 0, soft = false): void {
		this.parts.push({ mesh, colour, emissive, soft });
	}

	/** Re-skins every part when the tint or the alpha (in steps of a twentieth) has changed. */
	apply(tint: number, alpha: number): void {
		const a = Math.round(clamp(alpha, 0, 1) * 20) / 20;
		if (tint === this.tint && a === this.alpha) return;
		this.tint = tint;
		this.alpha = a;
		const soft = soften(tint);
		for (const part of this.parts) {
			const by = part.soft ? soft : tint;
			part.mesh.material = toon(multiply(part.colour, by), {
				emissive: part.emissive ? multiply(part.emissive, by) : 0,
				opacity: a,
			});
		}
	}
}

export interface PartOptions {
	pos?: readonly [number, number, number];
	rot?: readonly [number, number, number];
	scale?: readonly [number, number, number];
	/** Outline thickness; 0 for none. */
	ink?: number;
	emissive?: number;
	shadow?: boolean;
	/** See `Tint`: keeps the part bright when the creature is stunned. */
	soft?: boolean;
}

/** Adds a toon-shaded, outlined mesh to `parent` and registers it for tinting. */
export function part(
	parent: THREE.Object3D,
	tint: Tint,
	geometry: THREE.BufferGeometry,
	colour: number,
	options: PartOptions = {},
): THREE.Mesh {
	const ink = options.ink ?? 0.025,
		material = toon(colour, { emissive: options.emissive });
	let mesh: THREE.Mesh;
	if (ink > 0) mesh = inked(geometry, material, ink);
	else {
		mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = options.shadow ?? false;
	}
	if (options.pos) mesh.position.set(...options.pos);
	if (options.rot) mesh.rotation.set(...options.rot);
	if (options.scale) mesh.scale.set(...options.scale);
	tint.add(mesh, colour, options.emissive ?? 0, options.soft ?? false);
	parent.add(mesh);
	return mesh;
}

/** Where a creature's eyes should look: a unit vector in the creature's own frame, written by `lookAtHero`. */
export const look = { x: 0, y: 0, z: 1 };

/**
 * Works out the look direction for a creature turned `yaw` about Y, whose eyes sit at (`x`, `y`), towards the hero. The
 * result always has some forward part so the pupils stay on the visible side of the eye.
 */
export function lookAtHero(
	x: number,
	y: number,
	yaw: number,
	ben: { x: number; y: number },
	reach: number,
): void {
	let dx = ben.x - x,
		dy = ben.y - y;
	const far = Math.hypot(dx, dy);
	/* A hero beyond the reach is only glanced at, so far-off creatures do not stare across the whole level. */
	if (far > reach) {
		dx *= reach / far;
		dy *= reach / far;
	}
	const lx = dx * Math.cos(yaw),
		lz = Math.max(dx * Math.sin(yaw), 0.35 * Math.hypot(dx, dy) + 0.4),
		length = Math.hypot(lx, dy, lz) || 1;
	look.x = lx / length;
	look.y = dy / length;
	look.z = lz / length;
}

/** A round googly eye with a pupil that can look in any direction, blink and spin dizzily. */
export class Eye {
	readonly root = new THREE.Group();
	private readonly pupil = new THREE.Group();
	private readonly radius: number;

	constructor(
		parent: THREE.Object3D,
		tint: Tint,
		radius: number,
		pos: readonly [number, number, number],
		pupilColour: number = ega.black,
	) {
		this.radius = radius;
		this.root.position.set(...pos);
		this.root.scale.setScalar(radius);
		part(this.root, tint, ellipsoid(1, 1, 1), ega.white, { ink: 0.03 / radius, soft: true });
		this.pupil.rotation.order = 'YXZ';
		part(this.pupil, tint, ellipsoid(0.52, 0.52, 0.3), pupilColour, { ink: 0 });
		part(this.pupil, tint, ellipsoid(0.12, 0.12, 0.08), ega.white, {
			ink: 0,
			pos: [0.17, 0.19, 0.24],
		});
		this.root.add(this.pupil);
		parent.add(this.root);
		this.aim(0, 0, 1);
	}

	/** Points the pupil along a unit vector in the eye's frame. */
	aim(x: number, y: number, z: number): void {
		const d = 0.86;
		this.pupil.position.set(x * d, y * d, z * d);
		this.pupil.rotation.set(-Math.asin(clamp(y, -1, 1)), Math.atan2(x, z), 0);
	}

	/** Looks along the shared `look` vector. */
	gaze(): void {
		this.aim(look.x, look.y, look.z);
	}

	/** Circles the pupil like a dizzy cartoon eye. */
	dizzy(time: number, phase: number): void {
		const a = time * 9 + phase,
			x = Math.cos(a) * 0.62,
			y = Math.sin(a) * 0.62;
		this.aim(x, y, Math.sqrt(1 - x * x - y * y));
	}

	/** 0 is open, 1 is shut. */
	blink(amount: number): void {
		this.root.scale.y = this.radius * (1 - 0.92 * amount);
	}
}

/** Tracks how fast a sprite is moving from one frame to the next, smoothed so the sim's step does not jitter it. */
export class Motion {
	x = 0;
	y = 0;
	vx = 0;
	vy = 0;
	private ready = false;

	track(draw: SpriteDraw, dt: number): void {
		if (this.ready && dt > 1e-4) {
			const k = 1 - Math.exp(-dt * 18);
			this.vx += ((draw.x - this.x) / dt - this.vx) * k;
			this.vy += ((draw.y - this.y) / dt - this.vy) * k;
		}
		this.ready = true;
		this.x = draw.x;
		this.y = draw.y;
	}
}

/** A seed in 0..1 from where a creature first appears, so neighbours blink and sway out of step. */
export function seedOf(first: SpriteDraw): number {
	return (Math.abs(Math.sin(first.x * 12.9898 + first.y * 78.233)) * 43758.5453) % 1;
}

/** Releases the children of a creature. Geometry and materials are shared, so there is nothing else to free. */
export function release(object: THREE.Object3D): void {
	object.clear();
}
