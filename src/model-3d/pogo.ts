// Builds Ben's pogo stick prop, its compressing coil spring and the bounce timing shared by the 3D pose and preview.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type palette from '../../source/game-palette.json';

type Colour = keyof typeof palette;

/**
 * Pogo stick dimensions in model units (one unit per sprite pixel), in the stick's own frame: the rubber tip touches y 0,
 * the shaft runs up +y, the handlebar and footpegs run across x and Ben stands behind it, facing +z. The rubber foot and the
 * plunger rod stay with the tip; the coil spring joins the foot to the peg collar, so the collar, pegs, shaft and handlebar
 * ride down as the spring compresses.
 */
export const pogoStick = {
	footHeight: 1.1,
	footRadius: 0.66,
	rodRadius: 0.2,
	springExtended: 5.2,
	springCompressed: 2.1,
	springTurns: 7,
	coilRadius: 0.62,
	wireRadius: 0.13,
	collarHeight: 1,
	collarRadius: 0.58,
	/** The pegs' top face, above the spring top. */
	pegTop: 0.75,
	pegInner: 0.45,
	pegOuter: 3.2,
	pegDepth: 1.05,
	pegThickness: 0.42,
	shaftRadius: 0.4,
	shaftLength: 14.2,
	barHalfWidth: 3.7,
	barRadius: 0.28,
	gripInner: 1.75,
	gripRadius: 0.44,
	/** Distance in front of the pelvis centre at which the shaft stands. */
	z: 2.65,
} as const;

/** The stick's state at one moment of a bounce. */
export interface PogoState {
	/** Height of the rubber tip above the floor. */
	lift: number;
	/** 0 with the spring fully extended, 1 fully compressed. */
	compression: number;
	/** Spring length between the foot cap and the collar. */
	springLength: number;
	/** Forward lean of the shaft in degrees (the top towards +z). */
	lean: number;
	/** Whether the tip is on the ground. */
	grounded: boolean;
}

/**
 * Bounce timing as phases of one cycle: the tip touches down at 0, the spring is fully compressed at `deepest`, the rider
 * drives the stick back up and it leaves the ground at `liftOff`, then flies to the apex at the middle of the flight and
 * falls back for the next touchdown at 1.
 */
export const pogoTiming = { deepest: 0.15, liftOff: 0.36, hop: 4.2 } as const;

const smooth = (t: number): number => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * (3 - 2 * x);
};
/** The spring's compression on the ground: it loads quickly after touchdown, then releases as Ben drives up. */
export function pogoCompression(phase: number): number {
	const t = ((phase % 1) + 1) % 1,
		{ deepest, liftOff } = pogoTiming;
	if (t >= liftOff) return 0;
	return t < deepest ? Math.sin((Math.PI / 2) * (t / deepest)) : smooth(1 - (t - deepest) / (liftOff - deepest));
}
export function pogoState(phase: number): PogoState {
	const t = ((phase % 1) + 1) % 1,
		{ liftOff, hop } = pogoTiming,
		compression = pogoCompression(t),
		grounded = t < liftOff,
		s = grounded ? 0 : (t - liftOff) / (1 - liftOff);
	return {
		lift: grounded ? 0 : hop * 4 * s * (1 - s),
		compression,
		springLength: THREE.MathUtils.lerp(pogoStick.springExtended, pogoStick.springCompressed, compression),
		// The shaft leans forward as Ben loads it and comes nearer upright at the apex, as the sprite ride keys it (4° to 8°).
		lean: 6 + 2 * compression - 2 * Math.sin(Math.PI * s),
		grounded,
	};
}
/** Height of the footpegs' top face above the tip, for a spring of `springLength`. */
export function pegHeight(springLength: number): number {
	return pogoStick.footHeight + springLength + pogoStick.pegTop;
}
/** Height of the handlebar's centre line above the tip. */
export function barHeight(springLength: number): number {
	return pogoStick.footHeight + springLength + pogoStick.collarHeight + pogoStick.shaftLength;
}

interface Part {
	name: string;
	geometry: THREE.BufferGeometry;
	colour: Colour;
	finish: 'paint' | 'chrome' | 'rubber' | 'plastic';
	upper: boolean;
}
const finishes: Record<Part['finish'], THREE.MeshPhysicalMaterialParameters> = {
	paint: { roughness: 0.3, metalness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.12 },
	chrome: { roughness: 0.3, metalness: 0.35 },
	rubber: { roughness: 0.88, metalness: 0 },
	plastic: { roughness: 0.42, metalness: 0.1 },
};

/** A pogo stick prop with an animated coil spring. Call `pose` to set the bounce, `dispose` to release it. */
export interface PogoStickProp {
	readonly group: THREE.Group;
	readonly meshes: readonly THREE.Mesh[];
	/** Places the stick at its tip position in the parent frame and compresses its spring. */
	pose(state: PogoState, tip: THREE.Vector3): void;
	dispose(): void;
}

const ringSegments = 8,
	coilSteps = 22;
/**
 * The coil spring as one tube whose vertices are rewritten in place for each spring length, so compressing it never
 * allocates. The first and last half turn are closed flat, as on a real compression spring, and the wire keeps its round
 * section at every length.
 */
function coilSpring(): { geometry: THREE.BufferGeometry; setLength(length: number): void } {
	const { springTurns, coilRadius, wireRadius } = pogoStick,
		rings = Math.ceil(springTurns * coilSteps) + 1,
		positions = new Float32Array(rings * ringSegments * 3),
		normals = new Float32Array(rings * ringSegments * 3),
		index: number[] = [];
	for (let i = 0; i < rings - 1; i++)
		for (let j = 0; j < ringSegments; j++) {
			const a = i * ringSegments + j,
				b = i * ringSegments + ((j + 1) % ringSegments),
				c = a + ringSegments,
				d = b + ringSegments;
			index.push(a, c, b, b, c, d);
		}
	const geometry = new THREE.BufferGeometry();
	geometry.setIndex(index);
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
	const setLength = (length: number): void => {
		// Height along the coil: flat closed ends for half a turn each, an even pitch between them.
		const live = springTurns - 1,
			pitch = (length - 4 * wireRadius) / live,
			heightAt = (turn: number): number =>
				wireRadius + (turn < 0.5 ? 0 : turn > springTurns - 0.5 ? live * pitch : (turn - 0.5) * pitch),
			slopeAt = (turn: number): number => (turn < 0.5 || turn > springTurns - 0.5 ? 0 : pitch);
		for (let i = 0; i < rings; i++) {
			const turn = (i / (rings - 1)) * springTurns,
				theta = turn * Math.PI * 2,
				cos = Math.cos(theta),
				sin = Math.sin(theta),
				cy = heightAt(turn);
			// Tangent of the helix (unnormalised): around the coil plus the rise per radian.
			const rise = slopeAt(turn) / (Math.PI * 2),
				tl = Math.hypot(coilRadius, rise),
				tx = (-sin * coilRadius) / tl,
				ty = rise / tl,
				tz = (cos * coilRadius) / tl;
			// The outward normal is radial; the binormal completes the frame.
			const nx = cos,
				nz = sin,
				bx = ty * nz,
				by = tz * nx - tx * nz,
				bz = -ty * nx;
			for (let j = 0; j < ringSegments; j++) {
				const phi = (j / ringSegments) * Math.PI * 2,
					u = Math.cos(phi),
					v = Math.sin(phi),
					k = (i * ringSegments + j) * 3,
					ox = u * nx + v * bx,
					oy = v * by,
					oz = u * nz + v * bz;
				positions[k] = cos * coilRadius + ox * wireRadius;
				positions[k + 1] = cy + oy * wireRadius;
				positions[k + 2] = sin * coilRadius + oz * wireRadius;
				normals[k] = ox;
				normals[k + 1] = oy;
				normals[k + 2] = oz;
			}
		}
		geometry.attributes.position.needsUpdate = true;
		geometry.attributes.normal.needsUpdate = true;
		geometry.computeBoundingSphere();
	};
	setLength(pogoStick.springExtended);
	return { geometry, setLength };
}

function stickParts(): Part[] {
	const s = pogoStick,
		parts: Part[] = [];
	const part = (name: string, geometry: THREE.BufferGeometry, colour: Colour, finish: Part['finish'], upper: boolean): void => {
		parts.push({ name, geometry, colour, finish, upper });
	};
	// The tip: a rubber foot with a rounded, slightly flared sole and a grey cap the spring sits on.
	part(
		'Pogo_rubber_foot',
		new THREE.LatheGeometry(
			[
				[0, 0],
				[s.footRadius * 0.8, 0],
				[s.footRadius, 0.18],
				[s.footRadius * 0.92, 0.6],
				[s.footRadius * 0.78, s.footHeight - 0.25],
				[0, s.footHeight - 0.25],
			].map(([r, y]) => new THREE.Vector2(r, y)),
			24,
		),
		'D',
		'rubber',
		false,
	);
	part('Pogo_foot_cap', new THREE.CylinderGeometry(s.coilRadius + 0.12, s.footRadius * 0.82, 0.28, 24).translate(0, s.footHeight - 0.14, 0), 'L', 'chrome', false);
	// The plunger rod runs from the foot up through the spring into the shaft, where it slides as the spring compresses.
	const rod = s.springExtended + s.collarHeight + 1.2;
	part('Pogo_plunger_rod', new THREE.CylinderGeometry(s.rodRadius, s.rodRadius, rod, 12).translate(0, s.footHeight + rod / 2, 0), 'L', 'chrome', false);
	// Above the spring: a collar with the footpegs, the painted shaft and the handlebar. These ride with the spring top.
	part('Pogo_collar', new THREE.CylinderGeometry(s.collarRadius, s.collarRadius + 0.08, s.collarHeight, 20).translate(0, s.collarHeight / 2, 0), 'D', 'plastic', true);
	for (const side of [-1, 1]) {
		const length = s.pegOuter - s.pegInner,
			peg = new THREE.BoxGeometry(length, s.pegThickness, s.pegDepth, 4, 1, 1);
		peg.translate(side * (s.pegInner + length / 2), s.pegTop - s.pegThickness / 2, 0);
		part('Pogo_footpeg', peg, 'D', 'rubber', true);
		// Tread ribs across the top of each peg, and a brace from the collar down under it.
		for (let k = 0; k < 4; k++)
			part(
				'Pogo_peg_tread',
				new THREE.BoxGeometry(0.14, 0.08, s.pegDepth * 0.9).translate(side * (s.pegInner + 0.45 + k * 0.7), s.pegTop + 0.04, 0),
				'k',
				'rubber',
				true,
			);
		const brace = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8);
		brace.rotateZ(side * 0.95);
		brace.translate(side * 0.95, s.pegTop - s.pegThickness - 0.45, 0);
		part('Pogo_peg_brace', brace, 'L', 'chrome', true);
		part('Pogo_peg_cap', new THREE.BoxGeometry(0.2, s.pegThickness + 0.08, s.pegDepth + 0.08).translate(side * (s.pegOuter + 0.08), s.pegTop - s.pegThickness / 2, 0), 'y', 'paint', true);
	}
	part('Pogo_shaft', new THREE.CylinderGeometry(s.shaftRadius, s.shaftRadius + 0.04, s.shaftLength, 20).translate(0, s.collarHeight + s.shaftLength / 2, 0), 'y', 'paint', true);
	// A dark band where the shaft meets the collar and a Fizz-yellow-on-red label band near the top.
	part('Pogo_shaft_band', new THREE.CylinderGeometry(s.shaftRadius + 0.06, s.shaftRadius + 0.06, 0.5, 20).translate(0, s.collarHeight + 0.25, 0), 'D', 'plastic', true);
	part('Pogo_label', new THREE.CylinderGeometry(s.shaftRadius + 0.03, s.shaftRadius + 0.03, 1.4, 20).translate(0, s.collarHeight + s.shaftLength - 3.2, 0), 'R', 'paint', true);
	const top = s.collarHeight + s.shaftLength;
	part('Pogo_bar_tee', new THREE.SphereGeometry(s.shaftRadius + 0.14, 16, 10).translate(0, top, 0), 'y', 'paint', true);
	part('Pogo_handlebar', new THREE.CylinderGeometry(s.barRadius, s.barRadius, s.barHalfWidth * 2, 16).rotateZ(Math.PI / 2).translate(0, top, 0), 'y', 'paint', true);
	for (const side of [-1, 1]) {
		const length = s.barHalfWidth - s.gripInner,
			grip = new THREE.CapsuleGeometry(s.gripRadius, length - s.gripRadius, 4, 14);
		grip.rotateZ(Math.PI / 2);
		grip.translate(side * (s.gripInner + length / 2), top, 0);
		part('Pogo_grip', grip, 'k', 'rubber', true);
		for (let k = 0; k < 3; k++)
			part(
				'Pogo_grip_rib',
				new THREE.TorusGeometry(s.gripRadius, 0.05, 6, 16).rotateY(Math.PI / 2).translate(side * (s.gripInner + 0.45 + k * 0.6), top, 0),
				'D',
				'rubber',
				true,
			);
		part('Pogo_bar_end', new THREE.SphereGeometry(s.gripRadius + 0.04, 14, 10).translate(side * (s.barHalfWidth + 0.05), top, 0), 'R', 'plastic', true);
	}
	return parts;
}

/** Builds the stick from palette base colours; `colours` maps each EGA code to its hex value. */
export function createPogoStick(colours: Readonly<Record<string, string | null>>): PogoStickProp {
	const group = new THREE.Group(),
		lower = new THREE.Group(),
		upper = new THREE.Group(),
		materials = new Map<string, THREE.MeshPhysicalMaterial>(),
		meshes: THREE.Mesh[] = [];
	group.name = 'Pogo_stick';
	group.add(lower, upper);
	const material = (colour: Colour, finish: Part['finish']): THREE.MeshPhysicalMaterial => {
		const key = colour + finish;
		let m = materials.get(key);
		if (!m) {
			m = new THREE.MeshPhysicalMaterial({ color: colours[colour] ?? '#ff00ff', ...finishes[finish] });
			materials.set(key, m);
		}
		return m;
	};
	for (const part of stickParts()) {
		const mesh = new THREE.Mesh(part.geometry, material(part.colour, part.finish));
		mesh.name = part.name;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		(part.upper ? upper : lower).add(mesh);
		meshes.push(mesh);
	}
	const spring = coilSpring(),
		coil = new THREE.Mesh(spring.geometry, material('L', 'chrome'));
	coil.name = 'Pogo_spring';
	coil.castShadow = true;
	coil.position.y = pogoStick.footHeight;
	lower.add(coil);
	meshes.push(coil);
	let springLength = -1;
	return {
		group,
		meshes,
		pose(state, tip) {
			group.position.copy(tip);
			group.rotation.set(THREE.MathUtils.degToRad(state.lean), 0, 0);
			upper.position.y = pogoStick.footHeight + state.springLength;
			if (state.springLength !== springLength) spring.setLength(state.springLength);
			springLength = state.springLength;
		},
		dispose() {
			for (const mesh of meshes) mesh.geometry.dispose();
			for (const m of materials.values()) m.dispose();
		},
	};
}
