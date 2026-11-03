// Samples a continuous running rig with fixed bones, planted forefeet and alternating flight phases.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { PerformanceSettings, Expression } from './performance.ts';
import type { ClothingSettings, ClothPose } from './clothing.ts';
import { sampleFace, type FaceSettings, type FacePose } from './face.ts';
import { add, bezier, forwardChain, lerp, radians, rotate, smoothstep, solveTwoBone, tau, wrap, type Chain, type Vec2 } from './kinematics.ts';

export interface SideRig {
  motion?: 'run' | 'pogo' | 'fire' | 'ladder' | 'jump' | 'fall' | 'death' | 'ledge' | 'whistle' | 'phone';
  lightingNote?: string;
  performance?: PerformanceSettings;
  mirrored?: boolean;
  /**
   * `left` turns a right-facing rig round for left-facing sprites: the skeleton, face and patches mirror, but Ben's
   * Fizz Stunner stays on his right hip, which is then the far side, so it is drawn behind the body instead of copied across.
   */
  facing?: 'right' | 'left';
  /** Optional cloth parts (shirt hem and sleeves) with follow-through; see `src/rig/clothing.ts`. */
  clothing?: ClothingSettings;
  pogo?: { compressedLength: number; extendedLength: number; shaftLength: number; lift: number; pegOffset: number };
  fire?: { recoil: number; kickDegrees: number };
  name: string; width: number; height: number; groundY: number; durationMs: number; sampleCount: number;
  root: number[];
  face: FaceSettings;
  torso: { leanDegrees: number; pitchSwayDegrees: number; bobAmplitude: number; bobLag: number; shoulderY: number; shoulderSpread: number; shoulderTwist: number; neckHeight: number };
  feet: { toe: number[]; heel: number[]; ball: number[]; landingToeDegrees: number; landingCompression: number };
  arms: { upperLength: number; forearmLength: number; swingDegrees: number; elbowDegrees: number; elbowFlexDegrees: number; phaseLead: number; biasDegrees: number };
  legs: { thighLength: number; shinLength: number; hipSpread: number };
  stride: { stanceFraction: number; frontX: number; backX: number; lift: number; reachLift?: number; nearPassForward?: number; toeOffDegrees: number; recoveryToeDegrees: number };
}
export interface RigFoot { ankle: Vec2; ball: Vec2; toe: Vec2; heel: Vec2; pitch: number; toePitch: number; compression: number; stance: boolean; progress: number; }
export interface RigPose {
  face: FacePose;
  headAngle?: number;
  cloth?: ClothPose;
  presentation?: {view: 'side' | 'back' | 'front'; expression: Expression; cameraShoes: boolean; standing?: 'left' | 'right'; phone?: Vec2; notes?: Vec2[]; pucker?: number; blink?: number; environment?: PerformanceSettings['environment'] };
  time: number; root: Vec2; torsoAngle: number; torsoTurn: number; headTurn: number; neck: Vec2;
  nearArm: Chain; farArm: Chain; nearLeg: Chain; farLeg: Chain; nearFoot: RigFoot; farFoot: RigFoot;
  contact: 'near' | 'far' | 'flight' | 'pogo' | 'both';
  pogo?: { tip: Vec2; springTop: Vec2; shaftTop: Vec2; grips: readonly [Vec2, Vec2]; pegs: readonly [Vec2, Vec2]; springLength: number; grounded: boolean };
  weapon?: { grip: Vec2; muzzle: Vec2; angle: number; flash: boolean };
}
export function torsoPoint(pose: Pick<RigPose, 'root' | 'torsoAngle'>, local: Vec2): Vec2 { return add(pose.root, rotate(local, pose.torsoAngle)); }
export function stanceTravel(rig: SideRig): number {
  const toe = rotate([rig.feet.ball[0], rig.feet.ball[1]], radians(rig.stride.toeOffDegrees));
  return rig.stride.frontX + rig.feet.ball[0] - (rig.stride.backX + toe[0]);
}
function footTarget(rig: SideRig, cycle: number, near = false): RigFoot {
  const phase = wrap(cycle), stride = rig.stride, stance = phase < stride.stanceFraction;
  const toeOff = radians(stride.toeOffDegrees), initialPitch = rotate([rig.feet.ball[0], rig.feet.ball[1]], toeOff);
  const start: Vec2 = [stride.backX, rig.groundY - initialPitch[1]], end: Vec2 = [stride.frontX, rig.groundY - rig.feet.ball[1]];
  let ankle: Vec2, pitch: number, toePitch: number, compression: number, progress: number;
  if (stance) {
    progress = phase / stride.stanceFraction;
    pitch = toeOff * smoothstep((progress - .3) / .7);
    const support = rotate([rig.feet.ball[0], rig.feet.ball[1]], pitch);
    const contactX = rig.root[0] + stride.frontX + rig.feet.ball[0] - stanceTravel(rig) * progress;
    ankle = [contactX - support[0], rig.groundY - support[1]];
    // A raised toe rolls down after landing; the forefoot stays flat as the heel lifts.
    toePitch = radians(rig.feet.landingToeDegrees) * (1 - smoothstep(progress / .32));
    compression = rig.feet.landingCompression * (1 - smoothstep(progress / .3));
  } else {
    progress = (phase - stride.stanceFraction) / (1 - stride.stanceFraction);
    const tangent = -stanceTravel(rig) / stride.stanceFraction * (1 - stride.stanceFraction) / 5;
    // Quintic controls preserve the stance velocity at lift-off and landing while lifting the heel.
    // `lift` shapes the heel kick behind the body; the optional `reachLift` keeps the forward swing lower to the ground.
    const relative = bezier([start, [start[0] + tangent, start[1]], [stride.backX - 3, rig.groundY - stride.lift * 1.8], [stride.frontX + 3, rig.groundY - (stride.reachLift ?? stride.lift) * 1.8], [end[0] - tangent, end[1]], end], progress);
    // The near (camera-side) foot passes in front of the planted far shin at mid-swing. `nearPassForward` swings it that
    // many pixels wider forward there, easing in and out, so its shoe does not sit on the far shin and break it into a stub.
    // The far foot passes behind the near leg, where the overlap is hidden, so it keeps the plain path.
    const pass = near && stride.nearPassForward ? stride.nearPassForward * Math.sin(Math.PI * Math.min(1, Math.max(0, (progress - .4) / .32))) ** 2 : 0;
    ankle = [rig.root[0] + relative[0] + pass, relative[1]];
    const recovery = radians(stride.recoveryToeDegrees);
    pitch = progress < .6 ? lerp(toeOff, recovery, smoothstep(progress / .6)) : lerp(recovery, 0, smoothstep((progress - .6) / .4));
    // Release the toe hinge in early recovery, then lift it slightly before the next landing.
    toePitch = lerp(0, pitch, smoothstep(progress / .3)) + radians(rig.feet.landingToeDegrees) * smoothstep((progress - .65) / .35);
    compression = rig.feet.landingCompression * smoothstep((progress - .92) / .08);
  }
  const ball = add(ankle, rotate([rig.feet.ball[0], rig.feet.ball[1]], pitch));
  const toe = add(ball, rotate([rig.feet.toe[0] - rig.feet.ball[0], rig.feet.toe[1] - rig.feet.ball[1]], toePitch));
  return { ankle, ball, toe, heel: add(ankle, rotate([rig.feet.heel[0], rig.feet.heel[1]], pitch)), pitch, toePitch, compression, stance, progress };
}
export function validateRig(rig: SideRig): void {
  if (rig.facing !== undefined && rig.facing !== 'right' && rig.facing !== 'left') throw new Error("Rig facing must be 'right' or 'left'.");
  if (rig.facing === 'left' && rig.mirrored) throw new Error('A left-facing rig already turns round; it cannot also be a plain mirror.');
  if (rig.motion && !["run", "pogo", "fire", "ladder", "jump", "fall", "death", "ledge", "whistle", "phone"].includes(rig.motion)) throw new Error("Unknown rig motion.");
  if (rig.motion === "pogo" && (!rig.pogo || Object.values(rig.pogo).some(value => !Number.isFinite(value) || value <= 0) || rig.pogo.compressedLength > rig.pogo.extendedLength)) throw new Error("Pogo spring settings must be positive and ordered.");
  if (rig.motion === "fire" && (!rig.fire || Object.values(rig.fire).some(value => !Number.isFinite(value) || value < 0))) throw new Error("Firing settings must be finite and non-negative.");
  if (["ladder", "jump", "fall", "death", "ledge", "whistle", "phone"].includes(rig.motion ?? "")) {
    const clip = rig.performance;
    if (!clip || clip.keys.length < 2 || clip.keys[0].phase !== 0 || clip.keys.at(-1)!.phase !== 1) throw new Error("Performance goals must cover phases zero through one.");
    for (let i = 0; i < clip.keys.length; i++) {
      const key = clip.keys[i];
      if (!Number.isFinite(key.phase) || (i > 0 && key.phase <= clip.keys[i-1].phase) || ![key.lean,key.headRoll,...key.root,...key.nearHand,...key.farHand,...key.nearAnkle,...key.farAnkle,...(key.phone ?? [])].every(Number.isFinite)) throw new Error("Performance goals must be finite and strictly ordered.");
    }
    const times = clip.sampleTimes;
    if (times && (times.length !== rig.sampleCount || times.some((time, i) => !Number.isFinite(time) || time < 0 || time > 1 || (i > 0 && time <= times[i - 1])) || times[0] !== 0 || (clip.loop ? times.at(-1)! >= 1 : times.at(-1) !== 1))) throw new Error("Sample times must be one ordered phase per sprite, starting at zero and ending at one for a one-shot or before one for a loop.");
    if (clip.environment?.kind === "ladder" && !(clip.environment.spacing > 0)) throw new Error("Ladder rung spacing must be positive.");
    if (clip.travel) {
      // A travelling loop closes in world coordinates: its last key is its first key moved by one cycle's travel.
      const [first, last] = [clip.keys[0], clip.keys.at(-1)!], [dx, dy] = clip.travel;
      const moved = (a: readonly number[], b: readonly number[]): boolean => b[0] === a[0] + dx && b[1] === a[1] + dy;
      if (!clip.loop || clip.travel.length !== 2 || !clip.travel.every(Number.isFinite) || !(["root", "nearHand", "farHand", "nearAnkle", "farAnkle"] as const).every(name => moved(first[name], last[name])) || first.lean !== last.lean || first.headRoll !== last.headRoll) throw new Error("A travelling loop must end on its first key moved by the travel.");
    }
  }
  const numeric = [...rig.root, rig.face.yawDegrees, ...rig.face.eye, ...rig.face.mouth, ...rig.face.ear, ...Object.values(rig.face.profile).flat(), rig.face.shiftAmplitude, ...rig.feet.toe, ...rig.feet.heel, ...rig.feet.ball, rig.feet.landingToeDegrees, rig.feet.landingCompression, ...Object.values(rig.torso), ...Object.values(rig.arms), ...Object.values(rig.legs), ...Object.values(rig.stride), rig.groundY];
  if (numeric.some(value => !Number.isFinite(value)) || rig.root.length !== 2 || rig.face.eye.length !== 3 || rig.face.mouth.length !== 3 || rig.face.ear.length !== 3 || rig.feet.toe.length !== 2 || rig.feet.heel.length !== 2 || rig.feet.ball.length !== 2 || rig.feet.landingCompression < 0 || rig.feet.landingCompression >= .6) throw new Error('Rig coordinates and motion settings must be finite.');
  const positive = [rig.width, rig.height, rig.durationMs, rig.sampleCount, rig.arms.upperLength, rig.arms.forearmLength, rig.legs.thighLength, rig.legs.shinLength, rig.torso.neckHeight];
  if (positive.some(value => !Number.isFinite(value) || value <= 0) || !Number.isInteger(rig.sampleCount) || rig.sampleCount < 2 || rig.durationMs / rig.sampleCount % 10 !== 0) throw new Error("Rig dimensions, bones and GIF frame timing must be valid positive values.");
  if (!Number.isInteger(rig.width) || !Number.isInteger(rig.height) || rig.groundY >= rig.height || rig.groundY < 0) throw new Error("Rig ground must fit the pixel canvas.");
}
// Snaps the running head to the pixel grid the torso patch is drawn on. The column follows the rest neck plus the
// rounded sway, so the sub-pixel pitch sway cannot hop the helmet sideways in only half of the cycle. The row is the
// lowest canvas row that the torso patch still maps to the neck at that column, so the collar always rests directly
// on the shirt: rounding the continuous neck instead leaves a one-pixel ink gap whenever the neck sits near a pixel edge.
export function seatedHead(rig: SideRig, root: Vec2, torsoAngle: number, neck: Vec2, restNeck: Vec2): Vec2 {
  const x = Math.round(restNeck[0]) + Math.round(neck[0] - restNeck[0]);
  // The torso patch shows local row round(-dx sin a + dy cos a); keep the largest canvas row whose local row is at or above the neck.
  const bound = root[1] + (-rig.torso.neckHeight + .5 + (x - root[0]) * Math.sin(torsoAngle)) / Math.cos(torsoAngle);
  return [x, Math.ceil(bound) - 1];
}
export function sampleRunRig(rig: SideRig, time: number): RigPose {
  if (!(rig.stride.stanceFraction > 0 && rig.stride.stanceFraction < .5)) throw new Error('Running requires alternating stance and flight.');
  const t = wrap(time), theta = t * tau;
  const root: Vec2 = [rig.root[0], rig.root[1] + rig.torso.bobAmplitude * Math.cos(2 * tau * (t - rig.torso.bobLag))];
  const torsoAngle = radians(rig.torso.leanDegrees + rig.torso.pitchSwayDegrees * Math.sin(theta));
  const armTheta = theta + rig.arms.phaseLead * tau;
  // `face.turnLead` (in cycles) lets the head turn run slightly ahead of the stride, so the camera-facing peak lands on one frame.
  const torsoTurn = -Math.cos(armTheta), headTurn = Math.sin(theta + (rig.face.turnLead ?? 0) * tau);
  const base = { root, torsoAngle };
  const nearShoulder = torsoPoint(base, [-rig.torso.shoulderSpread + torsoTurn * rig.torso.shoulderTwist, rig.torso.shoulderY]);
  const farShoulder = torsoPoint(base, [rig.torso.shoulderSpread - torsoTurn * rig.torso.shoulderTwist, rig.torso.shoulderY]);
  const nearAngle = radians(rig.arms.biasDegrees - rig.arms.swingDegrees * Math.cos(armTheta)), farAngle = radians(rig.arms.biasDegrees + rig.arms.swingDegrees * Math.cos(armTheta));
  const nearFlex = radians(rig.arms.elbowDegrees + rig.arms.elbowFlexDegrees * Math.sin(armTheta));
  const farFlex = radians(rig.arms.elbowDegrees - rig.arms.elbowFlexDegrees * Math.sin(armTheta));
  const neck = torsoPoint(base, [0, -rig.torso.neckHeight]);
  const restNeck = torsoPoint({root:[rig.root[0],rig.root[1]],torsoAngle:radians(rig.torso.leanDegrees)},[0,-rig.torso.neckHeight]);
  const face = sampleFace(neck, headTurn, rig.face, t, 0, restNeck, seatedHead(rig, root, torsoAngle, neck, restNeck));
  const nearFoot = footTarget(rig, t, true), farFoot = footTarget(rig, t + .5);
  const nearHip = add(root, [rig.legs.hipSpread, 0]), farHip = add(root, [-rig.legs.hipSpread, 0]);
  const nearLeg = solveTwoBone(nearHip, nearFoot.ankle, rig.legs.thighLength, rig.legs.shinLength);
  const farLeg = solveTwoBone(farHip, farFoot.ankle, rig.legs.thighLength, rig.legs.shinLength);
  if (Math.hypot(nearLeg[2][0] - nearFoot.ankle[0], nearLeg[2][1] - nearFoot.ankle[1]) > 1e-5 || Math.hypot(farLeg[2][0] - farFoot.ankle[0], farLeg[2][1] - farFoot.ankle[1]) > 1e-5) throw new Error('Foot path exceeds leg reach; adjust root, stride or bone lengths.');
  return {
    time: t, root, torsoAngle, torsoTurn, headTurn, neck, face,
    nearArm: forwardChain(nearShoulder, rig.arms.upperLength, rig.arms.forearmLength, nearAngle, nearFlex),
    farArm: forwardChain(farShoulder, rig.arms.upperLength, rig.arms.forearmLength, farAngle, farFlex),
    nearLeg, farLeg, nearFoot, farFoot, contact: nearFoot.stance ? 'near' : farFoot.stance ? 'far' : 'flight',
  };
}
