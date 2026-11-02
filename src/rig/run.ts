// Samples a continuous running rig with fixed bones, planted forefeet and alternating flight phases.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { sampleFace, type FaceSettings, type FacePose } from './face.ts';
import { add, bezier, forwardChain, lerp, radians, rotate, smoothstep, solveTwoBone, tau, wrap, type Chain, type Vec2 } from './kinematics.ts';

export interface SideRig {
  motion?: 'run' | 'pogo' | 'fire';
  pogo?: { compressedLength: number; extendedLength: number; shaftLength: number; lift: number; pegOffset: number };
  fire?: { recoil: number; kickDegrees: number };
  name: string; width: number; height: number; groundY: number; durationMs: number; sampleCount: number;
  root: number[];
  face: FaceSettings;
  torso: { leanDegrees: number; pitchSwayDegrees: number; bobAmplitude: number; bobLag: number; shoulderY: number; shoulderSpread: number; shoulderTwist: number; neckHeight: number };
  feet: { toe: number[]; heel: number[]; ball: number[]; landingToeDegrees: number; landingCompression: number };
  arms: { upperLength: number; forearmLength: number; swingDegrees: number; elbowDegrees: number; elbowFlexDegrees: number; phaseLead: number; biasDegrees: number };
  legs: { thighLength: number; shinLength: number; hipSpread: number };
  stride: { stanceFraction: number; frontX: number; backX: number; lift: number; toeOffDegrees: number; recoveryToeDegrees: number };
}
export interface RigFoot { ankle: Vec2; ball: Vec2; toe: Vec2; heel: Vec2; pitch: number; toePitch: number; compression: number; stance: boolean; progress: number; }
export interface RigPose {
  face: FacePose;
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
function footTarget(rig: SideRig, cycle: number): RigFoot {
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
    const relative = bezier([start, [start[0] + tangent, start[1]], [stride.backX - 3, rig.groundY - stride.lift * 1.8], [stride.frontX + 3, rig.groundY - stride.lift * 1.8], [end[0] - tangent, end[1]], end], progress);
    ankle = [rig.root[0] + relative[0], relative[1]];
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
  if (rig.motion && !["run", "pogo", "fire"].includes(rig.motion)) throw new Error("Unknown rig motion.");
  if (rig.motion === "pogo" && (!rig.pogo || Object.values(rig.pogo).some(value => !Number.isFinite(value) || value <= 0) || rig.pogo.compressedLength > rig.pogo.extendedLength)) throw new Error("Pogo spring settings must be positive and ordered.");
  if (rig.motion === "fire" && (!rig.fire || Object.values(rig.fire).some(value => !Number.isFinite(value) || value < 0))) throw new Error("Firing settings must be finite and non-negative.");
  const numeric = [...rig.root, rig.face.yawDegrees, ...rig.face.eye, ...rig.face.mouth, ...rig.face.ear, ...Object.values(rig.face.profile).flat(), rig.face.shiftAmplitude, ...rig.feet.toe, ...rig.feet.heel, ...rig.feet.ball, rig.feet.landingToeDegrees, rig.feet.landingCompression, ...Object.values(rig.torso), ...Object.values(rig.arms), ...Object.values(rig.legs), ...Object.values(rig.stride), rig.groundY];
  if (numeric.some(value => !Number.isFinite(value)) || rig.root.length !== 2 || rig.face.eye.length !== 3 || rig.face.mouth.length !== 3 || rig.face.ear.length !== 3 || rig.feet.toe.length !== 2 || rig.feet.heel.length !== 2 || rig.feet.ball.length !== 2 || rig.feet.landingCompression < 0 || rig.feet.landingCompression >= .6) throw new Error('Rig coordinates and motion settings must be finite.');
  const positive = [rig.width, rig.height, rig.durationMs, rig.sampleCount, rig.arms.upperLength, rig.arms.forearmLength, rig.legs.thighLength, rig.legs.shinLength, rig.torso.neckHeight];
  if (positive.some(value => !Number.isFinite(value) || value <= 0) || !Number.isInteger(rig.sampleCount) || rig.sampleCount < 2 || rig.durationMs / rig.sampleCount % 10 !== 0) throw new Error("Rig dimensions, bones and GIF frame timing must be valid positive values.");
  if (!Number.isInteger(rig.width) || !Number.isInteger(rig.height) || rig.groundY >= rig.height || rig.groundY < 0) throw new Error("Rig ground must fit the pixel canvas.");
}
export function sampleRunRig(rig: SideRig, time: number): RigPose {
  if (!(rig.stride.stanceFraction > 0 && rig.stride.stanceFraction < .5)) throw new Error('Running requires alternating stance and flight.');
  const t = wrap(time), theta = t * tau;
  const root: Vec2 = [rig.root[0], rig.root[1] + rig.torso.bobAmplitude * Math.cos(2 * tau * (t - rig.torso.bobLag))];
  const torsoAngle = radians(rig.torso.leanDegrees + rig.torso.pitchSwayDegrees * Math.sin(theta));
  const armTheta = theta + rig.arms.phaseLead * tau;
  const torsoTurn = -Math.cos(armTheta), headTurn = -Math.cos(armTheta);
  const base = { root, torsoAngle };
  const nearShoulder = torsoPoint(base, [-rig.torso.shoulderSpread + torsoTurn * rig.torso.shoulderTwist, rig.torso.shoulderY]);
  const farShoulder = torsoPoint(base, [rig.torso.shoulderSpread - torsoTurn * rig.torso.shoulderTwist, rig.torso.shoulderY]);
  const nearAngle = radians(rig.arms.biasDegrees - rig.arms.swingDegrees * Math.cos(armTheta)), farAngle = radians(rig.arms.biasDegrees + rig.arms.swingDegrees * Math.cos(armTheta));
  const nearFlex = radians(rig.arms.elbowDegrees + rig.arms.elbowFlexDegrees * Math.sin(armTheta));
  const farFlex = radians(rig.arms.elbowDegrees - rig.arms.elbowFlexDegrees * Math.sin(armTheta));
  const neck = torsoPoint(base, [0, -rig.torso.neckHeight]);
  const face = sampleFace(neck, headTurn, rig.face, t);
  const nearFoot = footTarget(rig, t), farFoot = footTarget(rig, t + .5);
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
