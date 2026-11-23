// The cartoon Ben walking the overworld map, driven by the sim's top-down hero sprite.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { poseFaces, poseGazes } from '../model-3d/ben-g/faces.ts';
import { poses } from '../model-3d/ben-g/poses.ts';
import type { PoseOut } from '../model-3d/ben-g/types.ts';
import { Gait } from './ben-gait.ts';
import { Blink, Idle, Rng, type IdlePose } from './ben-idle.ts';
import { idleLife, runPose, strideTiles } from './ben-moves.ts';
import { BenRig, Turn, clamp, sides, wrap, type Snap } from './ben-rig.ts';
import type { Actor, FrameContext, ModelSet, SpriteDraw } from './types.ts';

/** The sim's sprites for the hero on the map: two walk frames of one family. */
const frames: ReadonlySet<string> = new Set(['benMap0', 'benMap1']);
/** The slowest travel, in tiles a second, that counts as walking; the sim moves him at 5 or not at all. */
const walkSpeed = 1;
/** A jump between frames longer than this, in tiles, is a teleport or a new map rather than travel. */
const teleportJump = 3;
/**
 * How much longer his stride is than in a level: at the sim's 5 tiles a second it gives about three strides a second, the
 * rate the sprite's own two frames alternate at, a jog rather than a sprint.
 */
const strideLonger = 1.15;
/** How far he leans into his travel, in radians, and how quickly the lean follows. */
const walkLean = 0.1;
const leanSeconds = 0.06;
/**
 * How far a landmark's bottom edge may stand north of his feet and how far south of them, and how far to either side of its
 * box he may be, in tiles.
 */
const landmarkReach = 1.9;
const landmarkBehind = 1.5;
const landmarkSide = 0.7;
/** How long he must have stood before he notices a landmark, in seconds, so passing one does not make him stop and stare. */
const noticeAfter = 0.12;
/** How far an idle pose turns him from his heading towards the camera, as a share of the way. */
const idleTowardCamera = 0.65;

/** The heading that faces the camera: south, along -Y. */
const south = 0;

export type MapMode = 'stand' | 'walk' | 'look';

/** A figure and the pose state kept on it, for the one place the sim draws Ben on the map. */
export interface BenMapActor extends Actor {
	readonly fig: BenRig['fig'];
	/** The pose mode chosen on the last update, for tooling and tests. */
	readonly mode: MapMode;
	/** The idle pose playing on the last update, or null. */
	readonly idlePose: IdlePose | null;
	/** The heading he is turning to, in radians: 0 faces south, a quarter turn faces east, a half turn faces north. */
	readonly heading: number;
	/** The heading he is showing now, in radians. */
	readonly yaw: number;
	/** The ground-plane position of each stance foot's goal on the last walking frame (his left foot first), or NaN. */
	readonly stance: readonly { x: number; y: number }[];
	/** The height of his lowest sole above the ground plane on the last update, in tiles. */
	soleHeight(): number;
}

/** Whether a sprite is a level's landmark, the building or feature a level is entered at, drawn above its node. */
function isLandmark(name: string): boolean {
	return name === 'owCastle' || (name.length > 4 && name.startsWith('owLm'));
}

const pool: BenMapFigure[] = [];

/** Everything about one Ben on the map: the rig, the measurements of his travel and the pose he is in. */
class BenMapFigure implements BenMapActor {
	readonly object = new THREE.Group();
	mode: MapMode = 'stand';
	idlePose: IdlePose | null = null;
	heading = south;
	readonly stance = [
		{ x: NaN, y: NaN },
		{ x: NaN, y: NaN },
	];
	private readonly rig = new BenRig();
	readonly fig = this.rig.fig;
	private readonly scale = this.rig.scale;
	private readonly snap: Snap = this.rig.snapshot();
	/* The tilt group lies him down onto the map's ground plane (the scene's +Z is up there), turns him about his own
	   vertical and leans him about his soles. The model's own turn node keeps its scale and its vertical offset. */
	private readonly tilt = new THREE.Group();
	private readonly tmpV = new THREE.Vector3();
	private readonly turn = new Turn();
	private readonly rng = new Rng(0x6ea7);
	private readonly idle = new Idle(this.rng);
	private readonly blink = new Blink(this.rng);
	private readonly gait = new Gait();
	private seen = false;
	private lastTime = 0;
	private x = 0;
	private y = 0;
	private vx = 0;
	private vy = 0;
	private clock = 0;
	private cycles = 0;
	private poseKey = '';
	private fadeT = 1;
	private fadeLength = 0.09;
	private lean = 0;
	private snapOff = 0;
	private stoodFor = 0;
	/* The heading to the landmark he regards, kept as a number because sprite records are reused. */
	private lookHeading = 0;

	constructor() {
		this.object.rotation.x = Math.PI / 2;
		/* The stage draws his silhouette through anything that stands in front of him. */
		this.object.userData.seeThrough = true;
		this.tilt.rotation.order = 'YXZ';
		this.object.add(this.tilt);
		this.tilt.add(this.fig.turn);
		this.turn.snapTo(south);
	}

	get yaw(): number {
		return this.turn.yaw;
	}

	update(draw: SpriteDraw, frame: FrameContext): void {
		const fig = this.fig,
			S = this.scale,
			/* The sim marks his feet with the sprite's bottom edge. */
			fx = draw.x,
			fy = draw.y - draw.h / 2;
		let el = frame.dt > 0 ? Math.min(frame.dt, 0.1) : 1 / 60;
		const gap = frame.time - this.lastTime;
		if (gap > el * 0.5 && gap < 0.5) el = gap;
		const fresh =
			!this.seen || gap > 0.5 || gap < -0.5 || Math.hypot(fx - this.x, fy - this.y) > teleportJump;
		this.clock += el;

		/* Motion, measured from the sprite's travel and smoothed over a couple of frames. */
		const dx = fresh ? 0 : fx - this.x,
			dy = fresh ? 0 : fy - this.y;
		if (fresh) {
			this.vx = this.vy = 0;
			this.fadeT = this.fadeLength;
			this.lean = 0;
			this.turn.vel = 0;
			this.gait.reset();
			this.stoodFor = 0;
		} else {
			const a = 1 - Math.exp(-el / 0.025);
			this.vx += (dx / el - this.vx) * a;
			this.vy += (dy / el - this.vy) * a;
		}
		this.seen = true;
		this.lastTime = frame.time;
		this.x = fx;
		this.y = fy;

		const speed = Math.hypot(this.vx, this.vy),
			walking = speed > walkSpeed;
		if (walking) {
			/* He faces the way he goes: yaw 0 is south, a quarter turn is east. */
			this.heading = Math.atan2(this.vx, -this.vy);
			this.stoodFor = 0;
		} else this.stoodFor += el;

		/* A landmark within a tile or two to the north, or the saucer or a sign at his feet, holds his attention. */
		let look = false;
		if (!walking && !fresh && this.stoodFor > noticeAfter) look = this.regard(draw, frame, fx, fy);
		const mode: MapMode = walking ? 'walk' : look ? 'look' : 'stand';

		/* Idle life, as in the levels: he plays a pose from the model after a few seconds, and any step ends it. */
		this.idle.update(el, mode === 'stand' && !fresh);
		const idlePose = mode === 'stand' ? this.idle.pose : null;

		/* Facing: the same spring as in a level. An idle pose turns him part of the way to the camera so it can be seen. */
		let target = this.heading;
		if (mode === 'look') target = this.lookHeading;
		else if (idlePose) target = this.heading + wrap(south - this.heading) * idleTowardCamera;
		if (fresh) this.turn.snapTo(this.turn.yaw);
		this.turn.step(target, el);

		/* A new pose fades in from the bones as they were shown. */
		const key = mode + (idlePose ?? '');
		if (key !== this.poseKey) {
			if (!fresh && this.poseKey !== '') {
				this.rig.capture(this.snap, this.snapOff);
				this.fadeT = 0;
				this.fadeLength = idlePose ? 0.35 : 0.09;
			}
			this.poseKey = key;
		}
		this.mode = mode;
		this.idlePose = idlePose;

		let o: PoseOut;
		let face: string = poseFaces.stand;
		let gaze: readonly number[] = [0, 0];
		let leanTarget = 0;
		if (mode === 'walk') {
			if (!fresh)
				this.cycles =
					(this.cycles + (Math.hypot(dx, dy) / strideTiles(fig, S)) * strideLonger) % 1000;
			o = runPose(fig, this.cycles);
			this.gait.applyGround(o, this.cycles, {
				x: fx,
				y: fy,
				yaw: this.turn.yaw,
				scale: S,
				toe: fig.P.shoeL * 0.68,
				heel: -fig.P.shoeL * 0.3,
				ankle: fig.P.ank,
			});
			face = poseFaces.run;
			gaze = poseGazes.run ?? [0, 0];
			leanTarget = walkLean;
			for (let i = 0; i < 2; i++) {
				this.stance[i].x = this.gait.stanceX[i];
				this.stance[i].y = this.gait.stanceY[i];
			}
		} else {
			this.gait.reset();
			if (idlePose) {
				o = poses[idlePose](this.idle.time, fig);
				face = poseFaces[idlePose];
				gaze = poseGazes[idlePose] ?? [0, 0];
			} else {
				o = poses.stand(this.clock, fig);
				/* He glances out at the camera now and then, whichever way he faces. */
				const side = Math.sin(this.turn.yaw) >= 0 ? 1 : -1;
				gaze = [-side * 0.9 * idleLife(o, this.clock, side), 0];
			}
			if (mode === 'look') {
				o.head[0] = -0.4;
				o.neck[0] = -0.12;
				o.chest[0] = -0.05;
				gaze = [0, 1];
			}
		}
		o.head[1] += 0.45 * this.turn.lead;
		this.rig.put(o, face, gaze, this.clock, -1);

		/* Fade from the previous mode's bones. */
		let off = 0;
		if (this.fadeT < this.fadeLength) {
			this.fadeT += el;
			off = this.rig.mix(this.snap, clamp(this.fadeT / this.fadeLength, 0, 1), off);
		}
		this.snapOff = off;

		/* Blink, at irregular gaps. */
		this.rig.blink(this.blink.update(el) > 0);

		/* Lean into his travel about his soles, then stand him with his soles on the ground at the sprite's foot point. */
		this.lean += (leanTarget - this.lean) * (1 - Math.exp(-el / leanSeconds));
		this.object.position.set(fx, fy, 0);
		this.tilt.rotation.set(this.lean, this.turn.yaw, 0);
		fig.turn.position.set(0, -off * S, 0);
		this.object.updateMatrixWorld(true);
		this.rig.setPaint(draw.tint, draw.alpha);
	}

	/**
	 * Looks through the frame's sprites for a landmark he stands at the foot of, and when there is one keeps the heading
	 * that faces it and whether it towers over him. Does not keep the sprite records.
	 */
	private regard(draw: SpriteDraw, frame: FrameContext, fx: number, fy: number): boolean {
		let best = Infinity;
		for (const other of frame.draws) {
			if (other === draw || !isLandmark(other.name)) continue;
			const ahead = other.y - other.h / 2 - fy,
				across = Math.abs(other.x - fx) - other.w / 2;
			if (ahead < -landmarkBehind || ahead > landmarkReach || across > landmarkSide) continue;
			const d = Math.hypot(other.x - fx, ahead);
			if (d >= best) continue;
			best = d;
			/* He faces it, but mostly north: a landmark is looked up at, not walked round. */
			this.lookHeading = Math.atan2((other.x - fx) * 0.4, -Math.max(other.y - fy, 0.5));
		}
		return best < Infinity;
	}

	soleHeight(): number {
		const fig = this.fig,
			S = this.scale,
			v = this.tmpV;
		this.object.updateMatrixWorld(true);
		let low = Infinity;
		for (const s of sides) {
			v.setFromMatrixPosition(fig.J['foot' + s].matrixWorld);
			low = Math.min(low, v.z - fig.P.ank * S);
			v.setFromMatrixPosition(fig.J['_toe' + s].matrixWorld);
			low = Math.min(low, v.z - 0.4 * S);
		}
		return low;
	}

	dispose(): void {
		pool.push(this);
	}
}

/** The hero's model set: `benMap0` and `benMap1` are one Ben, built once and kept across the sim's blink frames. */
export const benMapModels: ModelSet = {
	name: 'ben on the map',
	family: (name) => (frames.has(name) ? 'benMap' : null),
	create() {
		return pool.pop() ?? new BenMapFigure();
	},
};
