// The cartoon Ben as the level's player: his sprite frames from the sim drive the 3D model's poses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { applyPose } from '../model-3d/ben-g/apply.ts';
import { applyFace, poseFaces, poseGazes } from '../model-3d/ben-g/faces.ts';
import { poses, smoothstep } from '../model-3d/ben-g/poses.ts';
import { buildRig } from '../model-3d/ben-g/rig.ts';
import { inkMaterial } from '../model-3d/ben-g/shared.ts';
import { benGSpec, defaultOptions } from '../model-3d/ben-g/spec.ts';
import type { Fig, FootGoal, HandGoal, PoseOut } from '../model-3d/ben-g/types.ts';
import type { Actor, FrameContext, ModelSet, SpriteDraw } from './types.ts';

/** How tall the standing sprite is drawn, in tiles; the model is scaled so his crown reaches it. */
const standHeight = 1.5;
/** How long a turn between facing left and right takes, in seconds. */
const turnSeconds = 0.1;
/** How far short of a dead side view he stays, so the camera sees some of his face, in radians. */
const cameraTurn = 0.45;
/** The sim's launch speed for a standing jump, in tiles a second; it maps vertical speed onto the jump pose. */
const jumpSpeed = 20.5;
/** The length of the sim's mantle, and of the pogo's squash frame, in seconds. */
const mantleSeconds = 0.3;
const squashSeconds = 0.12;
/** How much longer than the model's own stride the run cycle is stretched, and how far the hips sink to allow it. */
const strideStretch = 1.8;
const runCrouch = 0.8;
/** How much longer than the model's own rung spacing a climb cycle is stretched. */
const climbStretch = 2;
/** How far the pogo's body is raised on a longer spring so the stick reads at the sprite's height, in model pixels. */
const pogoRaise = 5.5;
/** The most the pose is allowed to be wrong about the feet before the stand pose takes over, in tiles a second. */
const airSpeed = 1.5;
const runSpeed = 0.5;

const sides = [1, -1] as const;
const tau = Math.PI * 2;

export type Mode =
	'stand' | 'lookUp' | 'lookDown' | 'run' | 'air' | 'land' | 'pogo' | 'climb' | 'mantle' | 'dead';

/** A figure and the pose state kept on it, for the one place the sim draws Ben. */
export interface BenActor extends Actor {
	readonly fig: Fig;
	/** The pose mode chosen on the last update, for tooling and tests. */
	readonly mode: Mode;
	/** The way he faces along X on the last update: 1 right, -1 left, 0 square to the camera or climbing. */
	heading(): number;
	/** The height of his lowest sole above the sprite's bottom edge on the last update, in tiles. */
	soleHeight(draw: SpriteDraw): number;
}

/** The bones, finger curls and offsets of one displayed frame, kept so the next pose can fade in from it. */
class Snap {
	readonly q = new Float64Array(17 * 4);
	readonly p = new Float64Array(3);
	readonly chest = new Float64Array(2);
	readonly digits: Float64Array;
	off = 0;
	constructor(digits: number) {
		this.digits = new Float64Array(digits);
	}
}

const wrap = (angle: number): number => angle - tau * Math.round(angle / tau);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const ease = (k: number): number => smoothstep(k);

const pool: BenFigure[] = [];

/** Everything about one Ben: the rig, the measurements of his motion and the pose he is in. */
class BenFigure implements BenActor {
	readonly fig: Fig;
	readonly object = new THREE.Group();
	mode: Mode = 'stand';
	private readonly scale: number;
	private readonly joints: THREE.Object3D[];
	private readonly digits: THREE.Object3D[] = [];
	private readonly snap: Snap;
	private readonly scratch: Snap;
	private readonly tmpQ = new THREE.Quaternion();
	private readonly tmpV = new THREE.Vector3();
	private readonly tmpColour = new THREE.Color();
	private readonly paint: {
		material: THREE.Material & { color: THREE.Color };
		base: THREE.Color;
	}[] = [];
	private tint = 0xffffff;
	private opacity = 1;
	/* Poses read at start: where the pose's mantle body sits when the hands let go, and the climb's period. */
	private readonly mantleBodyZ: number;
	private readonly climbPeriod = 1.92;
	/* Motion measured from the sprite's own travel. */
	private seen = false;
	private lastTime = 0;
	private x = 0;
	private y = 0;
	private vx = 0;
	private vy = 0;
	private clock = 0;
	private runCycles = 0;
	private climbCycles = 0;
	private airV = 0;
	private fallTime = 0;
	private landT = 1;
	private landAmount = 1;
	private peak = 14;
	private squashT = 1;
	private groundY = 0;
	private poseKey = '';
	private fadeT = 1;
	private fadeLength = 0.09;
	/* Facing. */
	private yaw = 0;
	private yawFrom = 0;
	private yawTo = 0;
	private turnT = 1;
	private face = 1;
	/* The Stunner: aim is 0 forwards, 1 up, -1 down; kick is the recoil, 1 at the shot and falling to 0. */
	private aim = 0;
	private gunHold = 0;
	private kick = 0;
	private shooting = false;
	private bubbleNear = false;
	/* The mantle in progress. */
	private mantleT = 0;
	private mantleX = 0;
	private mantleY = 0;
	private mantleRise = 0.5;
	private wasMantle = false;
	private wasPogo = false;
	private wasSquash = false;

	constructor() {
		const vents = typeof document === 'undefined' ? 'mesh' : defaultOptions.vents;
		this.fig = buildRig(benGSpec({ vents }));
		const fig = this.fig;
		fig.props.glow.visible = false;
		this.joints = fig.jointList;
		for (const s of sides) {
			this.digits.push(...fig.X.fingers[s], fig.X.thumbs[s]);
		}
		this.snap = new Snap(this.digits.length);
		this.scratch = new Snap(this.digits.length);
		/* The model is measured in sprite pixels: scale so the standing crown reaches the sprite's drawn height. */
		applyPose(fig, poses.stand(0, fig), 0);
		fig.turn.updateMatrixWorld(true);
		this.scale = standHeight / (fig.loc(fig.J._crown).y + 0.4);
		fig.turn.scale.setScalar(this.scale);
		this.mantleBodyZ = poses.ledge(0.54 * 6.5, fig).pz;
		this.object.add(fig.turn);
		fig.turn.traverse((node) => {
			const mesh = node as THREE.Mesh;
			if (!mesh.isMesh || Array.isArray(mesh.material)) return;
			const material = mesh.material as THREE.Material & { color?: THREE.Color };
			if (material === inkMaterial || !material.color) return;
			if (this.paint.some((entry) => entry.material === material)) return;
			this.paint.push({
				material: material as THREE.Material & { color: THREE.Color },
				base: material.color.clone(),
			});
		});
	}

	/* ---------- bone snapshots, for fading between poses ---------- */

	private capture(into: Snap, off: number): void {
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
	private mix(from: Snap, k: number, off: number): number {
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

	/* ---------- putting a pose on the figure ---------- */

	/** Applies a pose with the props the world supplies, and the model's own shot bubbles, taken out. */
	private put(o: PoseOut, face: string, gaze: readonly number[]): void {
		o.shotId = undefined;
		o.ladder = undefined;
		o.ledge = undefined;
		o.phone = undefined;
		o.notes = false;
		o.pogoFree = undefined;
		o.freeCan = undefined;
		o.rootDrop = 0;
		const fig = this.fig;
		applyPose(fig, o, this.clock);
		fig.shots = [];
		fig.props.glow.visible = false;
		applyFace(fig, o.face || face, gaze);
	}

	/** Raises everything of the pogo pose by `dh` pixels above the stick's tip and lengthens the spring to meet it. */
	private raisePogo(o: PoseOut, dh: number): void {
		o.py += dh;
		for (const s of sides) {
			for (const goal of [o.hands[s], o.feet[s]] as (HandGoal | FootGoal)[]) {
				const abs = goal.abs;
				if (abs) abs[1] += dh;
			}
		}
		if (o.pogo) o.pogo.pegH += dh;
	}

	/** Throws his arms up as he takes off and out as he comes down, which the standalone jump pose only hints at. */
	private flail(o: PoseOut): void {
		const A = this.fig.d.A,
			rise = clamp(this.vy / jumpSpeed, 0, 1),
			fall = clamp(-this.vy / jumpSpeed, 0, 1);
		for (const s of sides) {
			const rel = o.hands[s].rel;
			if (!rel) continue;
			rel[0] += s * (0.8 + 1.4 * fall);
			rel[1] += A * (0.45 + 0.45 * rise + 0.2 * fall);
			rel[2] += 1.5 * rise;
		}
		o.chest[0] += 0.08 * rise;
	}

	/** Arm goals for the Stunner: forwards, or up or down along the sprite's aim, with `kick` of recoil. */
	private aimArms(o: PoseOut): void {
		const A = this.fig.d.A,
			k = this.kick,
			reach = A * 0.96 - 2.2 * k,
			elevation = this.aim === 1 ? 1.25 : this.aim === -1 ? -1.2 : 0;
		const gun: HandGoal =
			this.aim === 0
				? {
						rel: [0.9, -0.5 + 1.6 * k, A * 0.96 - 2.2 * k],
						hint: [-0.7, -1, -0.2],
						grip: 1.2,
					}
				: {
						rel: [
							0.6,
							reach * Math.sin(elevation) + (this.aim === 1 ? 0.3 : -0.2),
							reach * Math.cos(elevation) + 0.5,
						],
						hint: [-1, this.aim === 1 ? 0.3 : -0.3, -0.2],
						grip: 1.2,
					};
		o.hands[-1] = gun;
		o.hands[1] = {
			rel: [0.5 + 0.6 * k, -A * 0.78 + 0.8 * k, -1.4 - 0.8 * k],
			hint: [0.6, 0, -1],
			grip: 1,
		};
		if (this.aim !== 0) {
			o.chest[0] += this.aim === 1 ? -0.14 : 0.16;
			o.head[0] += this.aim === 1 ? -0.3 : 0.22;
		}
		o.gun = true;
		o.flash = k > 0.6;
	}

	/* ---------- one frame ---------- */

	update(draw: SpriteDraw, frame: FrameContext): void {
		const fig = this.fig,
			S = this.scale,
			bottom = draw.y - draw.h / 2,
			name = draw.name;
		let el = frame.dt > 0 ? Math.min(frame.dt, 0.1) : 1 / 60;
		const gap = frame.time - this.lastTime;
		if (gap > el * 0.5 && gap < 0.5) el = gap;
		const fresh = !this.seen || gap > 0.5 || gap < -0.5 || Math.abs(draw.x - this.x) > 3;
		this.clock += el;

		/* Motion, measured from the sprite's travel and smoothed over a couple of frames. */
		const dx = fresh ? 0 : draw.x - this.x,
			dy = fresh ? 0 : draw.y - this.y;
		if (fresh) {
			this.vx = this.vy = 0;
			this.fadeT = this.fadeLength;
			this.landT = 1;
			this.squashT = 1;
			this.gunHold = 0;
			this.kick = 0;
			this.fallTime = 0;
		} else {
			const a = 1 - Math.exp(-el / 0.025);
			this.vx += (dx / el - this.vx) * a;
			this.vy += (dy / el - this.vy) * a;
		}
		this.seen = true;
		this.lastTime = frame.time;
		this.x = draw.x;
		this.y = draw.y;

		/* What the sprite says he is doing. */
		const dead = Math.abs(draw.rot) > 1e-3,
			mantle = name.startsWith('ben_mantle'),
			climbing = name === 'ben_climb1' || name === 'ben_climb2',
			pogo = name === 'ben_pogo' || name === 'ben_pogo2',
			aimSprite =
				name === 'ben_shoot' ? 0 : name === 'ben_aimUp' ? 1 : name === 'ben_aimDown' ? -1 : null,
			airborne = Math.abs(this.vy) > airSpeed,
			moving = Math.abs(this.vx) > runSpeed;
		let mode: Mode;
		if (dead) mode = 'dead';
		else if (mantle) mode = 'mantle';
		else if (climbing) mode = 'climb';
		else if (pogo) mode = 'pogo';
		else if (name === 'ben_jump' || (aimSprite !== null && airborne)) mode = 'air';
		else if (name === 'ben_run1' || name === 'ben_run2' || (aimSprite !== null && moving))
			mode = 'run';
		else if (name === 'ben_lookUp') mode = 'lookUp';
		else if (name === 'ben_lookDown') mode = 'lookDown';
		else mode = 'stand';
		if (
			this.mode === 'air' &&
			(mode === 'stand' || mode === 'lookUp' || mode === 'lookDown') &&
			!fresh
		) {
			this.landT = 0;
			this.landAmount = clamp(-this.airVy / jumpSpeed, 0.35, 1);
		}
		if (mode === 'air') this.airVy = Math.min(this.vy, 0) || this.airVy;
		if (this.landT < 0.16 && (mode === 'stand' || mode === 'lookUp' || mode === 'lookDown')) {
			this.landT += el;
			if (this.landT < 0.16) mode = 'land';
		} else if (this.landT < 0.16) this.landT = 1;
		const gunMode = ['stand', 'lookUp', 'lookDown', 'run', 'air', 'land'].includes(mode);

		/* The Stunner: raised while the shoot sprites show and a moment after, kicked by each shot. */
		let bubble = false;
		for (const other of frame.draws) {
			if (
				other.name === 'bubble' &&
				Math.abs(other.x - draw.x) < 0.9 &&
				Math.abs(other.y - draw.y) < 1.2
			) {
				bubble = true;
				break;
			}
		}
		if (aimSprite !== null) {
			this.aim = aimSprite;
			this.gunHold = 0.12;
			if (!this.shooting || (bubble && !this.bubbleNear)) this.kick = 1;
		} else this.gunHold -= el;
		this.shooting = aimSprite !== null;
		this.bubbleNear = bubble;
		this.kick = Math.max(0, this.kick - el / 0.14);
		const gun = gunMode && this.gunHold > 0;

		/* Facing: a smooth turn between left and right, never quite side-on; climbing faces into the scene. */
		this.face = draw.flip ? -1 : 1;
		const targetYaw =
			mode === 'climb' ? Math.PI - this.face * 0.4 : this.face * (Math.PI / 2 - cameraTurn);
		if (fresh) this.yaw = this.yawFrom = this.yawTo = targetYaw;
		else if (Math.abs(wrap(targetYaw - this.yawTo)) > 1e-6) {
			this.yawFrom = this.yaw;
			this.yawTo = this.yawFrom + wrap(targetYaw - this.yawFrom);
			this.turnT = 0;
		}
		this.turnT = Math.min(turnSeconds, this.turnT + el);
		this.yaw = this.yawFrom + (this.yawTo - this.yawFrom) * ease(this.turnT / turnSeconds);

		/* A new mode fades in from the bones as they were shown. */
		const key = mode + (gun ? '+gun' : '');
		if (key !== this.poseKey) {
			if (!fresh && this.poseKey !== '') {
				this.capture(this.snap, this.snapOff);
				this.fadeT = 0;
				this.fadeLength =
					mode === 'mantle' || this.mode === 'mantle' ? 0.05 : mode === 'land' ? 0.05 : 0.09;
			}
			this.poseKey = key;
		}
		this.mode = mode;

		/* The pose itself. */
		let off = 0;
		let gaze: readonly number[] = [0, 0];
		let zShift = 0;
		let rootZ = 0;
		switch (mode) {
			case 'stand':
			case 'lookUp':
			case 'lookDown':
			case 'land': {
				let o: PoseOut;
				if (mode === 'land') {
					const u = 0.7 + 0.22 * (this.landT / 0.16);
					o = poses.jump(1.9 * u, fig);
					o.py = fig.d.standY - (fig.d.standY - o.py) * this.landAmount;
				} else if (gun) {
					o = poses.fire(this.fireTime(), fig);
				} else o = poses.stand(this.clock, fig);
				if (mode === 'lookUp') {
					o.head[0] = -0.4;
					o.neck[0] = -0.12;
					o.chest[0] = -0.05;
					gaze = [0, 1];
				} else if (mode === 'lookDown') {
					o.head[0] = 0.42;
					o.neck[0] = 0.1;
					o.chest[0] = 0.08;
					gaze = [0, -1];
				}
				if (gun) this.aimArms(o);
				this.put(o, gun ? poseFaces.fire : poseFaces.stand, gun ? [0, 0] : gaze);
				break;
			}
			case 'run': {
				if (!fresh) this.runCycles = (this.runCycles + Math.abs(dx) / this.strideTiles()) % 1000;
				const o = poses.run(this.runCycles / 1.4, fig);
				for (const s of sides) {
					const abs = o.feet[s].abs;
					if (abs) abs[2] = (abs[2] + 0.3) * strideStretch - 0.3;
					const rel = o.hands[s].rel;
					if (rel) rel[2] *= 1.25;
				}
				o.py -= runCrouch;
				if (gun) this.aimArms(o);
				this.put(o, poseFaces.run, poseGazes.run ?? [0, 0]);
				break;
			}
			case 'air':
			case 'dead': {
				const target = clamp(0.5 - this.vy / (2 * jumpSpeed), 0.02, 0.98);
				if (mode === 'dead') {
					const o = poses.fall(this.clock * 2.2, fig);
					o.face = 'shout';
					this.put(o, 'shout', [0, 0]);
					off = o.lift + 2.16;
					break;
				}
				this.airV += (target - this.airV) * (1 - Math.exp(-el / 0.03));
				if (this.vy < -1) this.fallTime += el;
				else this.fallTime = 0;
				const long = ease((this.fallTime - 0.45) / 0.3);
				const jump = poses.jump(1.9 * (0.24 + 0.46 * this.airV), fig);
				if (gun) this.aimArms(jump);
				else this.flail(jump);
				this.put(jump, poseFaces.jump, [0, 0]);
				off = jump.lift - 0.3;
				if (long > 0.01 && !gun) {
					this.capture(this.scratch, off);
					const fall = poses.fall(this.clock, fig);
					this.put(fall, poseFaces.fall, poseGazes.fall);
					off = this.mix(this.scratch, long, fall.lift + 2.16);
				}
				break;
			}
			case 'pogo': {
				const squashing = name === 'ben_pogo2';
				if (!this.wasPogo) this.squashT = squashSeconds;
				if (squashing && !this.wasSquash) {
					this.squashT = 0;
					this.groundY = bottom;
					this.peak = 8;
				}
				this.wasSquash = squashing;
				let u: number;
				if (this.squashT < squashSeconds) {
					/* The sim shows the squash frame for the first moments of a bounce: the spring lets go. */
					this.squashT += el;
					this.peak = Math.max(this.peak, this.vy);
					this.airV = 0;
					u = 0.18 + 0.18 * ease(this.squashT / squashSeconds);
				} else if (this.vy < 0 && Math.max(0, bottom - this.groundY) < 0.4) {
					u = 0.18 * ease(1 - Math.max(0, bottom - this.groundY) / 0.4);
				} else {
					const v = clamp(0.5 - this.vy / (2 * this.peak), 0, 1);
					this.airV += (v - this.airV) * (1 - Math.exp(-el / 0.03));
					u = 0.36 + 0.64 * this.airV;
				}
				const o = poses.pogo(u / 1.25, fig);
				this.raisePogo(o, pogoRaise);
				this.put(o, poseFaces.pogo, poseGazes.pogo);
				off = o.lift;
				break;
			}
			case 'climb': {
				if (!fresh) {
					this.climbCycles += (dy + Math.abs(dx)) / S / (4 * 2.4 * climbStretch);
				}
				const cycles = ((this.climbCycles % 1) + 1) % 1;
				const o = poses.climb(cycles * this.climbPeriod, fig);
				const gap2 = 2.4,
					handTop = fig.d.standY + 0.8 + fig.d.shOff + 3.4,
					footTop = handTop - Math.round((handTop - (fig.P.ank + 0.8 + 2 * gap2)) / gap2) * gap2;
				for (const s of sides) {
					const hand = o.hands[s].abs,
						foot = o.feet[s].abs;
					if (hand) {
						const mid = handTop - gap2 - 1.55;
						hand[1] = mid + (hand[1] - mid) * climbStretch;
					}
					if (foot) {
						const mid = footTop - gap2 + fig.P.ank - 0.1;
						foot[1] = mid + (foot[1] - mid) * climbStretch;
					}
				}
				this.put(o, poseFaces.climb, poseGazes.climb);
				off = 3.2;
				zShift = 5.95 * S;
				break;
			}
			case 'mantle': {
				if (!this.wasMantle) {
					this.mantleT = 0;
					this.mantleX = draw.x;
					this.mantleY = bottom;
					this.mantleRise = 0.5;
				}
				this.mantleT += el;
				const [lo, hi] =
					name === 'ben_mantle1' ? [0, 0.3] : name === 'ben_mantle2' ? [0.3, 0.6] : [0.6, 1];
				const p = clamp(this.mantleT / mantleSeconds, lo, hi),
					e = ease(Math.min(1, p / 0.6));
				if (p < 0.6 && e > 0.1) this.mantleRise = clamp((bottom - this.mantleY) / e, 0.1, 0.95);
				const top = p >= 0.6 ? bottom : this.mantleY + this.mantleRise;
				const u = p < 0.6 ? 0.22 + 0.32 * (p / 0.6) : 0.54 + 0.16 * ((p - 0.6) / 0.4);
				const o = poses.ledge(u * 6.5, fig);
				const lipModel = (o.ledge?.y ?? 0) + 1.3;
				/* His sideways travel over the lip is the sim's; the pose's own is removed once the hands let go. */
				rootZ = ((draw.x - this.mantleX) * this.face) / S - Math.max(0, o.pz - this.mantleBodyZ);
				this.put(o, poseFaces.ledge, poseGazes.ledge);
				const wl = ease(p / 0.45);
				/* The lip's height in his own frame, as the offset that puts it on the real ledge. */
				off = wl * ((-draw.h / 2 - (top - draw.y - lipModel * S)) / S);
				break;
			}
		}
		this.wasMantle = mode === 'mantle';
		this.wasPogo = mode === 'pogo';

		/* Fade from the previous mode's bones. */
		if (this.fadeT < this.fadeLength) {
			this.fadeT += el;
			off = this.mix(this.snap, ease(this.fadeT / this.fadeLength), off);
		}
		this.snapOff = off;

		/* Blink, as the bench does. */
		const blink = (this.clock + 2) % 3.7 < 0.12;
		fig.X.eyes.scale.y = blink ? 0.12 : 1;
		fig.X.eyes.position.y = blink ? 3.55 * 0.88 : 0;

		/* Place the figure with his lowest sole on the sprite's bottom edge, turned and tilted as the sim says. */
		this.object.position.set(draw.x, draw.y, 0);
		this.object.rotation.set(0, 0, draw.rot);
		fig.turn.rotation.y = this.yaw;
		fig.turn.position.set(0, -draw.h / 2 - off * S, zShift);
		fig.root.position.z = rootZ;
		this.object.updateMatrixWorld(true);
		this.setPaint(draw.tint, draw.alpha);
	}

	private snapOff = 0;
	private airVy = -jumpSpeed;

	/** The pose time of the fire pose for the current recoil: 0 at rest, and back along its recoil curve. */
	private fireTime(): number {
		return this.kick > 0 ? (0.18 + 0.34 * (1 - this.kick)) / 0.9 : 0;
	}

	/** How far the run pose carries a planted foot in one cycle, in tiles. */
	private strideTiles(): number {
		return 5 * 0.29 * this.fig.d.Lg * strideStretch * this.scale;
	}

	private setPaint(tint: number, alpha: number): void {
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

	heading(): number {
		return Math.abs(Math.sin(this.fig.turn.rotation.y)) < 0.05
			? 0
			: Math.sign(Math.sin(this.fig.turn.rotation.y));
	}

	soleHeight(draw: SpriteDraw): number {
		const fig = this.fig,
			S = this.scale,
			v = this.tmpV;
		this.object.updateMatrixWorld(true);
		let low = Infinity;
		for (const s of sides) {
			v.setFromMatrixPosition(fig.J['foot' + s].matrixWorld);
			low = Math.min(low, v.y - fig.P.ank * S);
			v.setFromMatrixPosition(fig.J['_toe' + s].matrixWorld);
			low = Math.min(low, v.y - 0.4 * S);
		}
		return low - (draw.y - draw.h / 2);
	}

	dispose(): void {
		pool.push(this);
	}
}

/** The player's model set: every `ben_` sprite is one Ben, built once and kept across the sim's blink frames. */
export const benModels: ModelSet = {
	name: 'ben',
	family: (name) => (name.startsWith('ben_') ? 'ben' : null),
	create() {
		return pool.pop() ?? new BenFigure();
	},
};
