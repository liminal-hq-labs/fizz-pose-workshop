// Pose shaping for the playable Ben: the Stunner, the jump and fall, the landing squash and the standing idle life.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { eachSide, poseBase, smoothstep } from '../model-3d/ben-g/poses.ts';
import type { Fig, HandGoal, PoseOut } from '../model-3d/ben-g/types.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const negateX = (v: number[] | undefined): void => {
	if (v) v[0] = -v[0];
};

/**
 * Turns a pose into its mirror image: the hands and feet change sides, and everything that leans or twists to one side
 * goes to the other. Used to put the Stunner in his left hand when he faces left, so it stays on the camera's side.
 */
export function mirrorPose(o: PoseOut): void {
	o.px = -o.px;
	for (const bone of [o.prot, o.spine, o.chest, o.neck, o.head]) {
		bone[1] = -bone[1];
		bone[2] = -bone[2];
	}
	const hands = o.hands,
		feet = o.feet,
		h1 = hands[1],
		f1 = feet[1];
	hands[1] = hands[-1];
	hands[-1] = h1;
	feet[1] = feet[-1];
	feet[-1] = f1;
	for (const s of [1, -1]) {
		const h = hands[s],
			f = feet[s];
		negateX(h.abs);
		negateX(h.rel);
		negateX(h.hint);
		negateX(f.abs);
		negateX(f.rel);
		negateX(f.hint);
	}
}

/** Swaps and mirrors the arms alone, leaving the legs and the gait that drives them as they are. */
export function mirrorArms(o: PoseOut): void {
	const hands = o.hands,
		h1 = hands[1];
	hands[1] = hands[-1];
	hands[-1] = h1;
	for (const s of [1, -1]) {
		const h = hands[s];
		negateX(h.abs);
		negateX(h.rel);
		negateX(h.hint);
	}
}

/**
 * Arm goals for the Stunner in his right hand: forwards, or up or down along the aim, with `kick` of recoil. The hand sits
 * lower than the shoulder so the muzzle is nearer where the sim spawns the bubble. `offHand` false leaves the other arm to
 * whatever else he is holding, such as the pogo's handlebar.
 */
export function aimArms(fig: Fig, o: PoseOut, aim: number, kick: number, offHand: boolean): void {
	const A = fig.d.A,
		reach = A * 0.96 - 2.2 * kick,
		elevation = aim === 1 ? 1.05 : aim === -1 ? -1.0 : 0;
	/* Aimed up, the arm goes forward of the face and bends so the forearm stands upright: held straight up beside his
	   head it hides the face from the camera. */
	const gun: HandGoal =
		aim === 0
			? { rel: [0.6, -2.3 + 1.4 * kick, reach], hint: [-0.7, -1, -0.2], grip: 1.2 }
			: aim === 1
				? { rel: [-0.5, 5.4 - 1.2 * kick, 5.6 - 0.8 * kick], hint: [-0.3, -0.5, 1], grip: 1.2 }
				: {
						rel: [0.4, reach * Math.sin(elevation) - 0.2, reach * Math.cos(elevation) + 0.8],
						hint: [-1, -0.3, -0.2],
						grip: 1.2,
					};
	o.hands[-1] = gun;
	if (offHand)
		o.hands[1] = {
			rel: [0.5 + 0.6 * kick, -A * 0.78 + 0.8 * kick, -1.4 - 0.8 * kick],
			hint: [0.6, 0, -1],
			grip: 1,
		};
	if (aim !== 0) {
		o.chest[0] += aim === 1 ? -0.06 : 0.16;
		o.head[0] += aim === 1 ? -0.02 : 0.2;
	}
	o.gun = true;
	o.flash = kick > 0.6;
}

/** Keyframes of the jump along the airborne parameter, 0 at the take-off speed down to 1 at the fastest fall. */
const airKeys = [0, 0.22, 0.5, 0.78, 1];
/*
 * Columns: legs' length below the hip as a share of the leg, how far the knees come forward as a share of the leg, the toes'
 * pitch, the hands' height above the shoulder as a share of the arm, how far out they spread and forward they reach in
 * model pixels, the chest's pitch and stretch, the hips' height, how far the knees point forwards, and the pelvis' pitch.
 */
const airFrames: readonly (readonly number[])[] = [
	[0.99, 0.0, 0.9, 0.92, 1.5, -0.4, -0.06, 1.07, 0.9, 0.0, 0.0],
	[0.84, 0.2, 0.35, 0.78, 1.8, 1.2, 0.04, 1.02, 0.0, 0.5, 0.05],
	[0.6, 0.44, -0.1, 0.5, 2.2, 3.0, 0.1, 0.97, -1.0, 1.0, 0.12],
	[0.88, 0.14, 0.4, 0.45, 2.5, 1.8, 0.03, 1.0, 0.0, 0.4, 0.05],
	[0.97, 0.06, 0.6, 0.6, 2.8, 0.6, -0.04, 1.03, 0.5, 0.0, 0.0],
];
const key = new Float64Array(11);

/** How tucked the legs are for an airborne parameter, 0 to 1; the feet are allowed to hang this far above the sprite's edge. */
export function tuckOf(p: number): number {
	return smoothstep(1 - Math.abs(p - 0.5) / 0.3);
}

/**
 * Builds the jump and fall from the airborne parameter `p` (0 at the take-off speed, 0.5 at the top, 1 at the fastest
 * fall): a stretched launch with the arms thrown up, a tuck at the top, and the legs reaching for the ground on the way
 * down. The near arm goes forward and the far arm back, since the camera sees him from the side. `panic` (0 to 1) turns a long fall into flailing arms and pedalling legs; `run` leans him into his travel.
 */
export function airPose(
	fig: Fig,
	p: number,
	clock: number,
	panic: number,
	run: number,
	near: number,
): PoseOut {
	const d = fig.d,
		A = d.A,
		Lg = d.Lg;
	let seg = 0;
	while (seg < airKeys.length - 2 && p > airKeys[seg + 1]) seg++;
	const k = smoothstep(clamp((p - airKeys[seg]) / (airKeys[seg + 1] - airKeys[seg]), 0, 1)),
		a = airFrames[seg],
		b = airFrames[seg + 1];
	for (let i = 0; i < key.length; i++) key[i] = a[i] + (b[i] - a[i]) * k;
	const o = poseBase(d.standY + key[8]);
	o.prot[0] = key[10] + 0.1 * Math.abs(run);
	o.chest[0] = key[6];
	o.chestScale = key[7];
	o.head[0] = -0.1 - 0.12 * key[9] + 0.1 * panic;
	o.face = p < 0.62 ? 'shout' : panic > 0.5 ? 'worried' : 'shout';
	o.mouth = 'open';
	const flutter = 1.2 * panic;
	eachSide((s) => {
		const split = s > 0 ? 1.18 : 0.82,
			pedal = Math.sin(clock * 13 + (s > 0 ? 0 : Math.PI)) * 0.22 * panic,
			legY = key[0] - 0.1 * panic;
		o.feet[s] = {
			rel: [
				s * 0.3,
				-Lg * legY,
				Lg * (key[1] * split + pedal) + 0.3 + (s > 0 ? 1 : -1) * 0.9 * run,
			],
			pitch: key[2],
			hint: [s * 0.2, 0.2, 0.6 + 0.6 * key[9]],
		};
		const up = A * (key[3] + 0.25 * panic) + Math.sin(clock * 15 + s * 1.9) * flutter;
		o.hands[s] = {
			rel: [
				s * (0.8 + key[4]),
				Math.min(up, A * 0.97),
				key[5] + Math.cos(clock * 11 + s) * flutter * 0.5,
			],
			hint: [s * 1, -0.3, -0.3],
			grip: 0.8,
		};
	});
	return o;
}

/**
 * Presses a pose down into a landing squash: `c` is 1 at the deepest. The feet's goals are left alone, so a planted foot
 * stays planted and the knees take the weight.
 */
export function landOverlay(o: PoseOut, c: number): void {
	o.py -= 3.4 * c;
	o.prot[0] += 0.28 * c;
	o.spine[0] += 0.08 * c;
	o.chest[0] += 0.16 * c;
	o.head[0] -= 0.25 * c;
	o.chestScale -= 0.05 * c;
	for (const s of [1, -1]) {
		const rel = o.hands[s]?.rel;
		if (!rel) continue;
		rel[0] += s * 1.2 * c;
		rel[1] += 0.8 * c;
		rel[2] += 1.2 * c;
	}
}

/**
 * Breathing, a slow shift of weight and an occasional glance for the standing Ben, added to the stand pose. `glance` is
 * the direction towards the camera: the sign his head turns to look out of the screen.
 */
export function idleLife(o: PoseOut, clock: number, glance: number): number {
	const sway = Math.sin(clock * 0.55),
		breath = Math.sin(clock * 2.1);
	o.px += 0.28 * sway;
	o.prot[2] += 0.014 * sway;
	o.chest[2] -= 0.01 * sway;
	o.chestScale = 1 + 0.024 * breath;
	o.chest[0] += 0.012 * breath;
	o.head[0] = 0.02 * Math.sin(clock * 0.9);
	const phase = (clock % 7.3) / 7.3,
		look = smoothstep((phase - 0.5) / 0.08) * (1 - smoothstep((phase - 0.72) / 0.08));
	o.head[1] = 0.12 * Math.sin(clock * 0.45) + glance * 0.5 * look;
	return glance * look;
}
