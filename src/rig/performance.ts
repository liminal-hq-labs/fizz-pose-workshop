// Interpolates authored action goals and solves fixed-length limbs for expressive sprite studies.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, lerp, radians, rotate, smoothstep, solveTwoBone, wrap, type Vec2, type Chain } from './kinematics.ts';
import { sampleFace } from './face.ts';
import { torsoPoint, type RigFoot, type RigPose, type SideRig } from './run.ts';

export type Expression = 'normal' | 'startled' | 'grit' | 'tongue' | 'dizzy' | 'wince' | 'out' | 'whistle';
export interface PerformanceKey {
  nearFootDegrees?: number; farFootDegrees?: number;
  phase: number; root: number[]; lean: number; headRoll: number;
  nearHand: number[]; farHand: number[]; nearAnkle: number[]; farAnkle: number[];
  expression: Expression; nearSupport: boolean; farSupport: boolean; phone?: number[];
}
export interface PerformanceSettings {
  view: 'side' | 'back' | 'front'; standing?: 'left' | 'right'; loop: boolean; keys: PerformanceKey[];
  environment?: { kind: 'ladder' | 'ledge'; x: number; y: number; width: number; spacing: number };
}
function foot(ankle: Vec2, supported: boolean, rig: SideRig, angle = 0): RigFoot {
  return {ankle, ball: add(ankle, rotate([rig.feet.ball[0], rig.feet.ball[1]], angle)), toe: add(ankle, rotate([rig.feet.toe[0], rig.feet.toe[1]], angle)), heel: add(ankle, rotate([rig.feet.heel[0], rig.feet.heel[1]], angle)), pitch: angle, toePitch: angle, compression: 0, stance: supported, progress: 0};
}
export function samplePerformance(rig: SideRig, time: number): RigPose {
  const clip = rig.performance; if (!clip || !Number.isFinite(time)) throw new Error('Performance rig requires finite time and action goals.');
  const t = clip.loop ? wrap(time) : Math.max(0, Math.min(1, time));
  const keys = clip.keys;
  const index = Math.max(0, keys.findLastIndex(key => key.phase <= t));
  const a = keys[index], b = keys[Math.min(index + 1, keys.length - 1)];
  const u = a === b ? 0 : smoothstep((t - a.phase) / (b.phase - a.phase));
  const vector = (key: 'root' | 'nearHand' | 'farHand' | 'nearAnkle' | 'farAnkle'): Vec2 => [lerp(a[key][0], b[key][0], u), lerp(a[key][1], b[key][1], u)];
  const root = vector('root'), torsoAngle = radians(lerp(a.lean, b.lean, u)), headAngle = radians(lerp(a.headRoll, b.headRoll, u));
  const base = {root, torsoAngle}, neck = torsoPoint(base, [0, -rig.torso.neckHeight]);
  const nearShoulder = torsoPoint(base, [-rig.torso.shoulderSpread, rig.torso.shoulderY]);
  const farShoulder = torsoPoint(base, [rig.torso.shoulderSpread, rig.torso.shoulderY]);
  const nearHip = add(root, [-rig.legs.hipSpread, 0]), farHip = add(root, [rig.legs.hipSpread, 0]);
  const solve = (origin: Vec2, target: Vec2, upper: number, lower: number, pole: number): Chain => {
    const chain = solveTwoBone(origin, target, upper, lower, pole);
    if (Math.hypot(chain[2][0] - target[0], chain[2][1] - target[1]) > 1e-5) throw new Error(`${rig.motion} goal exceeds reach at phase ${t.toFixed(3)}: ${origin} → ${target}.`);
    return chain;
  };
  const nearArm = solve(nearShoulder, vector('nearHand'), rig.arms.upperLength, rig.arms.forearmLength, -1);
  const farArm = solve(farShoulder, vector('farHand'), rig.arms.upperLength, rig.arms.forearmLength, clip.view === 'side' ? -1 : 1);
  const nearLeg = solve(nearHip, vector('nearAnkle'), rig.legs.thighLength, rig.legs.shinLength, clip.view === 'side' ? 1 : -1);
  const farLeg = solve(farHip, vector('farAnkle'), rig.legs.thighLength, rig.legs.shinLength, 1);
  const nearFoot = foot(nearLeg[2], a.nearSupport, rig, radians(lerp(a.nearFootDegrees ?? 0, b.nearFootDegrees ?? 0, u))), farFoot = foot(farLeg[2], a.farSupport, rig, radians(lerp(a.farFootDegrees ?? 0, b.farFootDegrees ?? 0, u)));
  const phone: Vec2 | undefined = a.phone ? b.phone ? [lerp(a.phone[0], b.phone[0], u), lerp(a.phone[1], b.phone[1], u)] : [a.phone[0], a.phone[1]] : undefined;
  const noteX = clip.standing === 'left' ? [1,4] : [25,28];
  const notes: Vec2[] | undefined = rig.motion === 'whistle' ? [[noteX[0], 12 - 3 * Math.sin(t * Math.PI * 2)], [noteX[1], 7 - 2 * Math.cos(t * Math.PI * 2)]] : undefined;
  const face = sampleFace(neck, 0, rig.face, t, headAngle);
  return { time: t, root, torsoAngle, torsoTurn: 0, headTurn: 0, headAngle, neck, face, nearArm, farArm, nearLeg, farLeg, nearFoot, farFoot,
    contact: a.nearSupport && a.farSupport ? 'both' : a.nearSupport ? 'near' : a.farSupport ? 'far' : 'flight',
    presentation: {view: clip.view, standing: clip.standing, expression: a.expression, environment: clip.environment, cameraShoes: rig.motion === 'death', phone, notes},
  };
}
