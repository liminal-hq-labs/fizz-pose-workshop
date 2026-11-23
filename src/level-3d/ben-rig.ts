// The cartoon Ben's rig as both of his actors use it: scaled to the game's proportions, with bone snapshots, paint and a springy turn.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { applyPose } from '../model-3d/ben-g/apply.ts';
import { applyFace } from '../model-3d/ben-g/faces.ts';
import { poses, smoothstep } from '../model-3d/ben-g/poses.ts';
import { buildRig } from '../model-3d/ben-g/rig.ts';
import { inkMaterial } from '../model-3d/ben-g/shared.ts';
import { benGSpec, defaultOptions } from '../model-3d/ben-g/spec.ts';
import type { Fig, PoseOut } from '../model-3d/ben-g/types.ts';

/** How tall the standing sprite is drawn in a level, in tiles. */
export const spriteHeight = 1.5;
/**
 * How much taller than the sprite's box the model stands: about 2 tiles against the sprite's 1.5, a third larger. The
 * sprite is chunky, with a helmet as wide as the tile, while the model is slim and reads much smaller at the sprite's own
 * height. The enemies and pickups are scaled by the same factor, so the cast stays in proportion. His soles stay on the
 * box's bottom edge and his head rises above its top.
 */
export const presence = 1.28;
/** How tall he stands, in tiles, in a level and on the map. */
export const standHeight = spriteHeight * presence;
/** The smallest part of him, as a radius in sprite pixels, that still casts a shadow. */
const smallestShadowCaster = 1.1;
/** The turn between headings is a spring: its natural frequency in radians a second, and its damping ratio. */
const turnFrequency = 38;
const turnDamping = 0.72;

export const sides = [1, -1] as const;
const tau = Math.PI * 2;

/** An angle brought into the range of half a turn either way. */
export const wrap = (angle: number): number => angle - tau * Math.round(angle / tau);
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const ease = (k: number): number => smoothstep(k);

/** The bones, finger curls and offsets of one displayed frame, kept so the next pose can fade in from it. */
export class Snap {
	readonly q = new Float64Array(17 * 4);
	readonly p = new Float64Array(3);
	readonly chest = new Float64Array(2);
	readonly digits: Float64Array;
	off = 0;
	constructor(digits: number) {
		this.digits = new Float64Array(digits);
	}
}

/** The way he faces about the vertical: a spring that turns him with weight, so the head can lead the body round. */
export class Turn {
	yaw = 0;
	vel = 0;
	/** How far the target is ahead of the body after the last step, in radians, limited to a little over a radian. */
	lead = 0;

	/** Puts him at `target` at rest. */
	snapTo(target: number): void {
		this.yaw = target;
		this.vel = 0;
		this.lead = 0;
	}

	/** Advances `el` seconds towards `target`, taking the short way round. */
	step(target: number, el: number): void {
		const aim = this.yaw + wrap(target - this.yaw),
			steps = Math.max(1, Math.ceil(el / 0.004)),
			h = el / steps;
		for (let i = 0; i < steps; i++) {
			this.vel +=
				(turnFrequency * turnFrequency * (aim - this.yaw) -
					2 * turnDamping * turnFrequency * this.vel) *
				h;
			this.yaw += this.vel * h;
		}
		this.lead = clamp(aim - this.yaw, -1.2, 1.2);
	}
}

/** A built Ben scaled to stand `standHeight` tall, with what both actors need to pose, fade, paint and light him. */
export class BenRig {
	readonly fig: Fig;
	/** Tiles per model pixel. */
	readonly scale: number;
	readonly joints: THREE.Object3D[];
	readonly digits: THREE.Object3D[] = [];
	private readonly tmpQ = new THREE.Quaternion();
	private readonly tmpColour = new THREE.Color();
	private readonly paint: {
		material: THREE.Material & { color: THREE.Color };
		base: THREE.Color;
	}[] = [];
	private tint = 0xffffff;
	private opacity = 1;

	constructor() {
		const vents = typeof document === 'undefined' ? 'mesh' : defaultOptions.vents;
		this.fig = buildRig(benGSpec({ vents }));
		const fig = this.fig;
		fig.props.glow.visible = false;
		this.joints = fig.jointList;
		for (const s of sides) {
			this.digits.push(...fig.X.fingers[s], fig.X.thumbs[s]);
		}
		/* The model is measured in sprite pixels: scale so the standing crown reaches the standing height. */
		applyPose(fig, poses.stand(0, fig), 0);
		fig.turn.updateMatrixWorld(true);
		this.scale = standHeight / (fig.loc(fig.J._crown).y + 0.4);
		fig.turn.scale.setScalar(this.scale);
		fig.turn.traverse((node) => {
			const mesh = node as THREE.Mesh;
			if (!mesh.isMesh || Array.isArray(mesh.material)) return;
			/* He is about three hundred meshes, and each shadow caster is drawn a second time. Only his body and his
			   larger parts cast: an eye, a finger or an ink shell adds nothing to the shadow on the ground. */
			if (mesh.castShadow && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
				mesh.geometry.computeBoundingSphere();
				const reach =
					(mesh.geometry.boundingSphere?.radius ?? 0) *
					Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
				if (mesh.userData.ol || reach < smallestShadowCaster) mesh.castShadow = false;
			}
			const material = mesh.material as THREE.Material & { color?: THREE.Color };
			if (material === inkMaterial || !material.color) return;
			if (this.paint.some((entry) => entry.material === material)) return;
			this.paint.push({
				material: material as THREE.Material & { color: THREE.Color },
				base: material.color.clone(),
			});
		});
	}

	snapshot(): Snap {
		return new Snap(this.digits.length);
	}

	/** Records the bones as they are, with the offset `off` they are shown at. */
	capture(into: Snap, off: number): void {
		const joints = this.joints;
		for (let i = 0; i < joints.length; i++) {
			const q = joints[i].quaternion;
			into.q[i * 4] = q.x;
			into.q[i * 4 + 1] = q.y;
			into.q[i * 4 + 2] = q.z;
			into.q[i * 4 + 3] = q.w;
		}
		const pelvis = this.fig.J.pelvis.position;
		into.p[0] = pelvis.x;
		into.p[1] = pelvis.y;
		into.p[2] = pelvis.z;
		const scale = this.fig.J.chest.scale;
		into.chest[0] = scale.y;
		into.chest[1] = scale.z;
		for (let i = 0; i < this.digits.length; i++) into.digits[i] = this.digits[i].rotation.z;
		into.off = off;
	}

	/** Moves the figure's bones from `from` (weight 0) to where they are now (weight 1); returns the blended offset. */
	mix(from: Snap, k: number, off: number): number {
		const joints = this.joints;
		const q = this.tmpQ;
		for (let i = 0; i < joints.length; i++) {
			q.set(from.q[i * 4], from.q[i * 4 + 1], from.q[i * 4 + 2], from.q[i * 4 + 3]);
			q.slerp(joints[i].quaternion, k);
			joints[i].quaternion.copy(q);
		}
		const pelvis = this.fig.J.pelvis.position;
		pelvis.set(
			from.p[0] + (pelvis.x - from.p[0]) * k,
			from.p[1] + (pelvis.y - from.p[1]) * k,
			from.p[2] + (pelvis.z - from.p[2]) * k,
		);
		const scale = this.fig.J.chest.scale;
		scale.set(
			1,
			from.chest[0] + (scale.y - from.chest[0]) * k,
			from.chest[1] + (scale.z - from.chest[1]) * k,
		);
		for (let i = 0; i < this.digits.length; i++) {
			const d = this.digits[i].rotation;
			d.z = from.digits[i] + (d.z - from.digits[i]) * k;
		}
		return from.off + (off - from.off) * k;
	}

	/** Puts the Stunner in the hand on the camera's side: his right facing right, his left facing left. */
	holdGun(side: number): void {
		const fig = this.fig,
			hand = fig.J['hand' + side],
			gun = fig.X.gun;
		if (gun.parent !== hand) {
			hand.add(gun);
			gun.position.x = (side < 0 ? 1 : -1) * Math.abs(gun.position.x);
		}
	}

	/**
	 * Applies a pose with the props the world supplies, and the model's own shot bubbles, taken out. The Stunner is put in
	 * the hand `gunSide` when the pose holds it out; otherwise it stays holstered on his hip.
	 */
	put(o: PoseOut, face: string, gaze: readonly number[], clock: number, gunSide: number): void {
		o.shotId = undefined;
		o.ladder = undefined;
		o.ledge = undefined;
		o.phone = undefined;
		o.notes = false;
		o.pogoFree = undefined;
		o.freeCan = undefined;
		o.rootDrop = 0;
		const fig = this.fig;
		if (o.gun) this.holdGun(gunSide);
		applyPose(fig, o, clock);
		fig.shots = [];
		fig.props.glow.visible = false;
		applyFace(fig, o.face || face, gaze);
	}

	/** Closes or opens his eyes. */
	blink(shut: boolean): void {
		const eyes = this.fig.X.eyes;
		eyes.scale.y = shut ? 0.12 : 1;
		eyes.position.y = shut ? 3.55 * 0.88 : 0;
	}

	/** Multiplies every painted material by `tint` and fades it to `alpha`. */
	setPaint(tint: number, alpha: number): void {
		if (tint === this.tint && alpha === this.opacity) return;
		this.tint = tint;
		this.opacity = alpha;
		this.tmpColour.setHex(tint);
		for (const { material, base } of this.paint) {
			material.color.copy(base).multiply(this.tmpColour);
			const faded = alpha < 0.999;
			if (material.transparent !== faded) {
				material.transparent = faded;
				material.needsUpdate = true;
			}
			material.opacity = alpha;
		}
	}
}
