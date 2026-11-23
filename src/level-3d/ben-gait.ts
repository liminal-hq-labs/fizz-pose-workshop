// Plants the running Ben's stance feet on the ground: each foot holds the world X where it landed until it lifts.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { smoothstep } from '../model-3d/ben-g/poses.ts';
import type { PoseOut } from '../model-3d/ben-g/types.ts';

/** What the gait needs to know about the figure this frame. */
export interface GaitFrame {
	/** The figure's world X, in tiles. */
	x: number;
	/** His yaw about the vertical, in radians: the model's +Z (forward) points along +X at a quarter turn. */
	yaw: number;
	/** Tiles per model pixel. */
	scale: number;
	/** The ground's rise over run under him, positive when it climbs towards +X. */
	slope: number;
	/** 1 facing right, -1 facing left. */
	face: number;
	/** How far the toe and the heel are forward and back of the ankle, and how high the ankle is above the sole, in model pixels. */
	toe: number;
	heel: number;
	ankle: number;
}

/** What the gait needs to know about a figure walking over a flat ground plane in any direction. */
export interface GroundGaitFrame {
	/** The figure's place on the ground plane, in tiles. */
	x: number;
	y: number;
	/** His yaw about the vertical, in radians: yaw 0 faces -Y (south on the map) and a quarter turn faces +X. */
	yaw: number;
	/** Tiles per model pixel. */
	scale: number;
	/** How far the toe and the heel are forward and back of the ankle, and how high the ankle is above the sole, in model pixels. */
	toe: number;
	heel: number;
	ankle: number;
}

/** The share of the run cycle a foot spends on the ground, as the model's run pose has it. */
const stanceShare = 0.4;
/** The most a planted foot may be pulled from where the authored cycle puts it, in model pixels. */
const reach = 4;
/** Below this the stride's direction is too nearly across the view to plant feet by X alone. */
const minSide = 0.35;

/**
 * Overrides the feet of the model's run pose. While a foot bears weight its goal is rebuilt every frame from the world X
 * where it landed, so the ground holds it still whatever the body does: speed changes, turns and slopes included. In the
 * swing the authored lift is kept, with the last stance error eased out and the ground's height and tilt under the foot.
 */
export class Gait {
	private readonly planted = [false, false];
	private readonly anchor = [0, 0];
	private readonly carry = [0, 0];
	private readonly carryY = [0, 0];
	/** The world X of each foot's last stance goal, for tools that measure drift. */
	readonly stanceX = [NaN, NaN];
	/** The ground-plane Y of each foot's last stance goal, set by `applyGround`. */
	readonly stanceY = [NaN, NaN];
	private readonly anchorY = [0, 0];

	reset(): void {
		this.planted[0] = this.planted[1] = false;
		this.carry[0] = this.carry[1] = this.carryY[0] = this.carryY[1] = 0;
	}

	apply(o: PoseOut, cycles: number, f: GaitFrame): void {
		const phase = ((cycles % 1) + 1) % 1,
			sinY = Math.sin(f.yaw),
			cosY = Math.cos(f.yaw),
			weight = smoothstep((Math.abs(sinY) - minSide) / 0.25),
			tilt = Math.atan(f.slope * f.face);
		for (let i = 0; i < 2; i++) {
			const s = i === 0 ? 1 : -1,
				goal = o.feet[s],
				abs = goal.abs;
			if (!abs) continue;
			const u = (phase + (s > 0 ? 0 : 0.5)) % 1,
				pitch = goal.pitch ?? 0;
			/* The foot is rigid and turns about the heel or the toe, whichever is on the ground; its ankle follows from that. */
			const pivot = pitch > 0 ? f.toe : f.heel,
				sinP = Math.sin(pitch),
				cosP = Math.cos(pitch),
				lift = f.ankle * cosP + pivot * sinP,
				shift = pivot * (1 - cosP) + f.ankle * sinP;
			if (u < stanceShare) {
				if (!this.planted[i]) {
					this.planted[i] = true;
					this.anchor[i] = f.x + f.scale * (abs[0] * cosY + (abs[2] - shift) * sinY);
				}
				const wanted = ((this.anchor[i] - f.x) / f.scale - abs[0] * cosY) / (sinY || 1) + shift,
					dz = Math.max(-reach, Math.min(reach, wanted - abs[2])) * weight,
					dy = (lift - abs[1]) * weight;
				this.carry[i] = dz;
				this.carryY[i] = dy;
				abs[2] += dz;
				abs[1] += dy;
				goal.pitch = pitch - tilt;
				this.stanceX[i] = f.x + f.scale * (abs[0] * cosY + abs[2] * sinY);
			} else {
				this.planted[i] = false;
				const fade = 1 - smoothstep((u - stanceShare) / 0.25);
				abs[2] += this.carry[i] * fade;
				abs[1] += this.carryY[i] * fade;
				goal.pitch = pitch - tilt * 0.6;
			}
			abs[1] += f.slope * (abs[0] * cosY + abs[2] * sinY);
		}
	}

	/**
	 * The same for a figure on a flat ground plane: a stance foot's goal is rebuilt every frame from the point on the
	 * plane where it landed, whichever way he walks or turns, so the ground holds it still. The model's forward (+Z) points
	 * along (sin yaw, -cos yaw) on the plane and its lateral axis (+X) along (cos yaw, sin yaw).
	 */
	applyGround(o: PoseOut, cycles: number, f: GroundGaitFrame): void {
		const phase = ((cycles % 1) + 1) % 1,
			sinY = Math.sin(f.yaw),
			cosY = Math.cos(f.yaw);
		for (let i = 0; i < 2; i++) {
			const s = i === 0 ? 1 : -1,
				goal = o.feet[s],
				abs = goal.abs;
			if (!abs) continue;
			const u = (phase + (s > 0 ? 0 : 0.5)) % 1,
				pitch = goal.pitch ?? 0,
				pivot = pitch > 0 ? f.toe : f.heel,
				sinP = Math.sin(pitch),
				cosP = Math.cos(pitch),
				lift = f.ankle * cosP + pivot * sinP,
				shift = pivot * (1 - cosP) + f.ankle * sinP;
			if (u < stanceShare) {
				if (!this.planted[i]) {
					this.planted[i] = true;
					const forward = abs[2] - shift;
					this.anchor[i] = f.x + f.scale * (abs[0] * cosY + forward * sinY);
					this.anchorY[i] = f.y + f.scale * (abs[0] * sinY - forward * cosY);
				}
				const dx = (this.anchor[i] - f.x) / f.scale,
					dy = (this.anchorY[i] - f.y) / f.scale,
					lateral = dx * cosY + dy * sinY,
					forward = dx * sinY - dy * cosY + shift,
					side = Math.max(-reach, Math.min(reach, lateral - abs[0])),
					dz = Math.max(-reach, Math.min(reach, forward - abs[2])),
					dh = lift - abs[1];
				this.carry[i] = dz;
				this.carryY[i] = dh;
				abs[0] += side;
				abs[2] += dz;
				abs[1] += dh;
				const along = abs[2] - shift;
				this.stanceX[i] = f.x + f.scale * (abs[0] * cosY + along * sinY);
				this.stanceY[i] = f.y + f.scale * (abs[0] * sinY - along * cosY);
			} else {
				this.planted[i] = false;
				const fade = 1 - smoothstep((u - stanceShare) / 0.25);
				abs[2] += this.carry[i] * fade;
				abs[1] += this.carryY[i] * fade;
			}
		}
	}
}
