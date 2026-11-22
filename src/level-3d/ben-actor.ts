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
import { Gait } from './ben-gait.ts';
import { Blink, Idle, Rng, type IdlePose } from './ben-idle.ts';
import {
	aimArms,
	airPose,
	idleLife,
	landOverlay,
	mirrorArms,
	mirrorPose,
	tuckOf,
} from './ben-moves.ts';
import type { Actor, FrameContext, ModelSet, SpriteDraw } from './types.ts';

/** How tall the standing sprite is drawn, in tiles. */
const spriteHeight = 1.5;
/**
 * How much taller than the sprite's box the model stands. The sprite is chunky, with a helmet as wide as the tile, while
 * the model is slim, so at the sprite's height he reads much smaller than the sprite does; this gives him its presence.
 * His soles stay on the box's bottom edge and his head rises above its top.
 */
const presence = 1.28;
/** The smallest part of him, as a radius in sprite pixels, that still casts a shadow. */
const smallestShadowCaster = 1.1;
const standHeight = spriteHeight * presence;
/** How far short of a dead side view he stays, so the camera sees some of his face, in radians. */
const cameraTurn = 0.45;
/** The turn between facing left and right is a spring: its natural frequency in radians a second, and its damping ratio. */
const turnFrequency = 38;
const turnDamping = 0.72;
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
const pogoRaise = 5.5 / presence;
/** The slowest vertical and horizontal travel, in tiles a second, that counts as airborne and as running. */
const airSpeed = 1.5;
const runSpeed = 0.5;
/** How long the landing squash lasts, and how much of it is the drop, in seconds. */
const landSeconds = 0.26;
const landDrop = 0.055;
/** How long the Stunner stays raised after a shot that the sprite does not show, such as one from the pogo stick. */
const shotHold = 0.28;

const sides = [1, -1] as const;
const tau = Math.PI * 2;

export type Mode =
	'stand' | 'lookUp' | 'lookDown' | 'run' | 'air' | 'pogo' | 'climb' | 'mantle' | 'dead';

/** A figure and the pose state kept on it, for the one place the sim draws Ben. */
export interface BenActor extends Actor {
	readonly fig: Fig;
	/** The pose mode chosen on the last update, for tooling and tests. */
	readonly mode: Mode;
	/** The idle pose playing on the last update, or null. */
	readonly idlePose: IdlePose | null;
	/** The world X, in tiles, of each stance foot's goal on the last run frame (his left foot first), or NaN. */
	readonly stanceX: readonly number[];
	/** The hand the Stunner is in on the last update: -1 his right, 1 his left. */
	readonly gunSide: number;
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
/** The landing squash's depth `t` seconds after touching down: a quick drop, then a springy release. */
const landCurve = (t: number): number =>
	t < landDrop ? ease(t / landDrop) : 1 - ease((t - landDrop) / (landSeconds - landDrop));

const pool: BenFigure[] = [];

/** Everything about one Ben: the rig, the measurements of his motion and the pose he is in. */
class BenFigure implements BenActor {
	readonly fig: Fig;
	readonly object = new THREE.Group();
	mode: Mode = 'stand';
	idlePose: IdlePose | null = null;
	gunSide = -1;
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
	private readonly rng = new Rng(0x5eed);
	private readonly idle = new Idle(this.rng);
	private readonly blink = new Blink(this.rng);
	private readonly gait = new Gait();
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
	private ax = 0;
	private slope = 0;
	private clock = 0;
	private runCycles = 0;
	private climbCycles = 0;
	private airV = 0;
	private fallTime = 0;
	private peakFall = 0;
	private landT = landSeconds;
	private landAmount = 1;
	private peak = 14;
	private squashT = 1;
	private groundY = 0;
	private poseKey = '';
	private fadeT = 1;
	private fadeLength = 0.09;
	private lean = 0;
	private snapOff = 0;
	/* Facing: the turn is a spring so it has weight, and the head leads it. */
	private yaw = 0;
	private yawVel = 0;
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
		/* The model is measured in sprite pixels: scale so the standing crown reaches the standing height. */
		applyPose(fig, poses.stand(0, fig), 0);
		fig.turn.updateMatrixWorld(true);
		this.scale = standHeight / (fig.loc(fig.J._crown).y + 0.4);
		fig.turn.scale.setScalar(this.scale);
		this.mantleBodyZ = poses.ledge(0.54 * 6.5, fig).pz;
		this.object.add(fig.turn);
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

	get stanceX(): readonly number[] {
		return this.gait.stanceX;
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
		if (o.gun) this.holdGun(this.gunSide);
		applyPose(fig, o, this.clock);
		fig.shots = [];
		fig.props.glow.visible = false;
		applyFace(fig, o.face || face, gaze);
	}

	/** Puts the Stunner in the hand on the camera's side: his right facing right, his left facing left. */
	private holdGun(side: number): void {
		const fig = this.fig,
			hand = fig.J['hand' + side],
			gun = fig.X.gun;
		if (gun.parent !== hand) {
			hand.add(gun);
			gun.position.x = (side < 0 ? 1 : -1) * Math.abs(gun.position.x);
		}
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

	/** Holds the Stunner out along the aim, in the right hand and mirrored to the left when he faces left. */
	private aimGun(o: PoseOut, offHand: boolean, mirrorAll: boolean): void {
		aimArms(this.fig, o, this.aim, this.kick, offHand);
		if (this.gunSide > 0) {
			if (mirrorAll) mirrorPose(o);
			else mirrorArms(o);
		}
		/* Aiming up, his face turns out to the camera so the helmet's brim does not hide it. */
		if (this.aim === 1) o.head[1] -= this.face * 0.4;
	}

	/** The height of his lowest sole above the model's ground, in model pixels. */
	private lowestSole(): number {
		const fig = this.fig;
		let low = Infinity;
		for (const s of sides) {
			low = Math.min(low, fig.loc(fig.J['foot' + s]).y - fig.P.ank);
			low = Math.min(low, fig.loc(fig.J['_toe' + s]).y - 0.4);
		}
		return low;
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
			this.vx = this.vy = this.ax = this.slope = 0;
			this.fadeT = this.fadeLength;
			this.landT = landSeconds;
			this.squashT = 1;
			this.gunHold = 0;
			this.kick = 0;
			this.fallTime = 0;
			this.lean = 0;
			this.yawVel = 0;
			this.gait.reset();
		} else {
			const a = 1 - Math.exp(-el / 0.025),
				before = this.vx;
			this.vx += (dx / el - this.vx) * a;
			this.vy += (dy / el - this.vy) * a;
			this.ax += ((this.vx - before) / el - this.ax) * (1 - Math.exp(-el / 0.06));
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
		const grounded = mode === 'stand' || mode === 'lookUp' || mode === 'lookDown' || mode === 'run';
		if (mode === 'air') {
			if (this.mode !== 'air') this.peakFall = 0;
			this.peakFall = Math.max(this.peakFall, -this.vy);
		} else if (this.mode === 'air' && grounded && !fresh && this.peakFall > 4) {
			this.landT = 0;
			this.landAmount = clamp(this.peakFall / jumpSpeed, 0.3, 1.1);
		}
		if (this.landT < landSeconds) this.landT += el;
		const squash =
			grounded && this.landT < landSeconds ? landCurve(this.landT) * this.landAmount : 0;

		/* The Stunner: raised while the shoot sprites show and a moment after, kicked by each shot. A shot the sprite does not
		   show, from the pogo stick, is found from the bubble that appears beside him. */
		let bubble = false,
			bubbleAim = 0;
		for (const other of frame.draws) {
			if (other.name !== 'bubble') continue;
			const sideways = other.x - draw.x,
				up = other.y - bottom;
			if (Math.abs(sideways) < 1.5 && up > -0.5 && up < 2.2) {
				bubble = true;
				bubbleAim = Math.abs(sideways) < 0.3 ? (up > 1 ? 1 : -1) : 0;
				break;
			}
		}
		const newBubble = bubble && !this.bubbleNear;
		if (aimSprite !== null) {
			this.aim = aimSprite;
			this.gunHold = 0.12;
			if (!this.shooting || newBubble) this.kick = 1;
		} else if (mode === 'pogo' && newBubble) {
			this.aim = bubbleAim;
			this.gunHold = shotHold;
			this.kick = 1;
		} else this.gunHold -= el;
		this.shooting = aimSprite !== null;
		this.bubbleNear = bubble;
		this.kick = Math.max(0, this.kick - el / 0.14);
		const gun = (grounded || mode === 'air' || mode === 'pogo') && this.gunHold > 0;
		this.face = draw.flip ? -1 : 1;
		if (gun) this.gunSide = this.face > 0 ? -1 : 1;

		/* Idle life: the standing Ben plays a pose from the model after a few seconds, and any input ends it at once. */
		this.idle.update(el, mode === 'stand' && !gun && squash === 0 && !fresh);
		const idlePose = mode === 'stand' && !gun ? this.idle.pose : null;

		/* Facing: a spring between left and right, never quite side-on; climbing faces into the scene. */
		const towardCamera = idlePose === 'tip' || idlePose === 'rock' ? 0.4 : 0;
		const targetYaw =
			mode === 'climb'
				? Math.PI - this.face * 0.4
				: this.face * (Math.PI / 2 - cameraTurn - towardCamera);
		if (fresh) {
			this.yaw = targetYaw;
			this.yawVel = 0;
		}
		const aimYaw = this.yaw + wrap(targetYaw - this.yaw),
			steps = Math.max(1, Math.ceil(el / 0.004)),
			h = el / steps;
		for (let i = 0; i < steps; i++) {
			this.yawVel +=
				(turnFrequency * turnFrequency * (aimYaw - this.yaw) -
					2 * turnDamping * turnFrequency * this.yawVel) *
				h;
			this.yaw += this.yawVel * h;
		}
		const lead = clamp(aimYaw - this.yaw, -1.2, 1.2);

		/* A new pose fades in from the bones as they were shown. */
		const key = mode + (gun ? '+gun' : '') + (idlePose ?? '');
		if (key !== this.poseKey) {
			if (!fresh && this.poseKey !== '') {
				this.capture(this.snap, this.snapOff);
				this.fadeT = 0;
				this.fadeLength =
					mode === 'mantle' || this.mode === 'mantle' ? 0.05 : idlePose ? 0.35 : 0.09;
			}
			this.poseKey = key;
		}
		this.mode = mode;
		this.idlePose = idlePose;

		/* The pose itself. */
		let off = 0;
		let gaze: readonly number[] = [0, 0];
		let zShift = 0;
		let rootZ = 0;
		let leanTarget = 0;
		const speed = clamp((this.vx * this.face) / 7, -1, 1);
		switch (mode) {
			case 'stand':
			case 'lookUp':
			case 'lookDown': {
				let o: PoseOut;
				let face: string = poseFaces.stand;
				if (gun) {
					o = poses.fire(this.fireTime(), fig);
					this.aimGun(o, true, true);
					face = poseFaces.fire;
				} else if (idlePose) {
					o = poses[idlePose](this.idle.time, fig);
					if (idlePose === 'tip' && this.face < 0) mirrorPose(o);
					face = poseFaces[idlePose];
					gaze = poseGazes[idlePose] ?? [0, 0];
				} else {
					o = poses.stand(this.clock, fig);
					const look = idleLife(o, this.clock, this.face);
					gaze = [-this.face * 0.9 * look, 0];
				}
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
				if (squash > 0) landOverlay(o, squash);
				o.head[1] += 0.45 * lead;
				this.put(o, face, gun ? [0, 0] : gaze);
				break;
			}
			case 'run': {
				if (!fresh) {
					const along = Math.max(0.5, Math.abs(Math.sin(this.yaw)));
					this.runCycles = (this.runCycles + Math.abs(dx) / (this.strideTiles() * along)) % 1000;
				}
				if (this.slope !== 0 || Math.abs(this.vx) > 2) {
					const raw = Math.abs(this.vx) > 2 ? clamp(this.vy / this.vx, -1.2, 1.2) : 0;
					this.slope += (raw - this.slope) * (1 - Math.exp(-el / 0.05));
				}
				const o = poses.run(this.runCycles / 1.4, fig);
				for (const s of sides) {
					const abs = o.feet[s].abs;
					if (abs) abs[2] = (abs[2] + 0.3) * strideStretch - 0.3;
					const rel = o.hands[s].rel;
					if (rel) rel[2] *= 1.25;
				}
				o.py -= runCrouch;
				o.prot[0] += 0.5 * Math.atan(this.slope * this.face);
				this.gait.apply(o, this.runCycles, {
					x: draw.x,
					yaw: this.yaw,
					scale: S,
					slope: this.slope,
					face: this.face,
					toe: fig.P.shoeL * 0.68,
					heel: -fig.P.shoeL * 0.3,
					ankle: fig.P.ank,
				});
				if (gun) this.aimGun(o, true, false);
				if (squash > 0) landOverlay(o, squash);
				o.head[1] += 0.45 * lead;
				this.put(o, poseFaces.run, poseGazes.run ?? [0, 0]);
				leanTarget = -clamp(this.vx / 7, -1, 1) * 0.05 - clamp(this.ax / 60, -1, 1) * 0.09;
				break;
			}
			case 'air': {
				const target = clamp(0.5 - this.vy / (2 * jumpSpeed), 0, 1);
				this.airV += (target - this.airV) * (1 - Math.exp(-el / 0.03));
				if (this.vy < -1) this.fallTime += el;
				else this.fallTime = 0;
				const panic = ease((this.fallTime - 0.5) / 0.35),
					o = airPose(fig, this.airV, this.clock, gun ? 0 : panic, speed, -this.face);
				if (gun) this.aimGun(o, true, false);
				o.head[1] += 0.45 * lead;
				this.put(o, poseFaces.jump, poseGazes.fall ?? [0, 0]);
				off = this.lowestSole() - 1.5 * tuckOf(this.airV);
				leanTarget = -this.vx * 0.008;
				break;
			}
			case 'dead': {
				const o = poses.fall(this.clock * 2.2, fig),
					flap = this.clock * 16;
				for (const s of sides) {
					const hand = o.hands[s].rel,
						foot = o.feet[s].rel;
					if (hand) {
						hand[1] += 4 * Math.sin(flap + s * 1.3);
						hand[0] += s * 2 * Math.cos(flap * 0.8 + s);
					}
					if (foot) foot[2] += 3 * Math.sin(flap * 0.9 + s * 2);
				}
				o.face = 'shout';
				this.put(o, 'shout', [0, 0.6]);
				off = o.lift + 2.16;
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
				if (gun) this.aimGun(o, false, false);
				this.put(o, poseFaces.pogo, poseGazes.pogo);
				off = o.lift;
				leanTarget = -clamp(this.vx / 7, -1, 1) * 0.16;
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
		if (mode !== 'run') {
			this.slope *= Math.exp(-el / 0.1);
			if (this.mode !== 'run') this.gait.reset();
		}
		if (grounded && mode !== 'run') {
			/* Turning on the spot leans him into the new direction, then rights him as the spring settles. */
			leanTarget += clamp(-this.yawVel / 9, -1, 1) * 0.13;
		}
		this.wasMantle = mode === 'mantle';
		this.wasPogo = mode === 'pogo';

		/* Fade from the previous mode's bones. */
		if (this.fadeT < this.fadeLength) {
			this.fadeT += el;
			off = this.mix(this.snap, ease(this.fadeT / this.fadeLength), off);
		}
		this.snapOff = off;

		/* Blink, at irregular gaps. */
		const shut = this.blink.update(el) > 0;
		fig.X.eyes.scale.y = shut ? 0.12 : 1;
		fig.X.eyes.position.y = shut ? 3.55 * 0.88 : 0;

		/* Lean into his travel about his soles, then place the figure with his lowest sole on the sprite's bottom edge, turned
		   as the sim says. */
		this.lean += (leanTarget - this.lean) * (1 - Math.exp(-el / 0.05));
		const lean = mode === 'dead' || mode === 'climb' || mode === 'mantle' ? 0 : this.lean,
			half = draw.h / 2;
		this.object.position.set(
			draw.x - half * Math.sin(lean),
			draw.y - half + half * Math.cos(lean),
			0,
		);
		this.object.rotation.set(0, 0, draw.rot + lean);
		fig.turn.rotation.y = this.yaw;
		fig.turn.position.set(0, -draw.h / 2 - off * S, zShift);
		fig.root.position.z = rootZ;
		this.object.updateMatrixWorld(true);
		this.setPaint(draw.tint, draw.alpha);
	}

	/** The pose time of the fire pose for the current recoil: 0 at rest, and back along its recoil curve. */
	private fireTime(): number {
		return this.kick > 0 ? (0.18 + 0.34 * (1 - this.kick)) / 0.9 : 0;
	}

	/** How far the run pose carries a planted foot in one cycle, in tiles of travel square to the view. */
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
