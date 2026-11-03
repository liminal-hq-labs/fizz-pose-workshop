// Samples spring-driven pogoing and a grounded Fizz Stunner firing cycle.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, radians, rotate, smoothstep, solveTwoBone, wrap, type Vec2 } from './kinematics.ts';
import { sampleFace } from './face.ts';
import { torsoPoint, type RigFoot, type RigPose, type SideRig } from './run.ts';

function flatFoot(ankle: Vec2, rig: SideRig): RigFoot {
  return { ankle, ball: add(ankle, [rig.feet.ball[0], rig.feet.ball[1]]), toe: add(ankle, [rig.feet.toe[0], rig.feet.toe[1]]), heel: add(ankle, [rig.feet.heel[0], rig.feet.heel[1]]), pitch: 0, toePitch: 0, compression: 0, stance: true, progress: 0 };
}
export function sampleActionRig(rig: SideRig, time: number): RigPose {
  const t = wrap(time);
  let root: Vec2, torsoAngle: number, nearAnkle: Vec2, farAnkle: Vec2, nearHand: Vec2, farHand: Vec2;
  let pogo: RigPose['pogo'], weapon: RigPose['weapon'];
  if (rig.motion === 'pogo') {
    const settings = rig.pogo; if (!settings) throw new Error('Pogo rig requires spring settings.');
    const grounded = t <= .18 || t >= .82;
    const flight = grounded ? 0 : Math.sin(Math.PI * (t - .18) / .64) ** 2;
    const extension = t < .18 ? smoothstep(t / .18) : t > .82 ? 1 - smoothstep((t - .82) / .18) : 1;
    const springLength = settings.compressedLength + (settings.extendedLength - settings.compressedLength) * extension;
    const tip: Vec2 = [rig.root[0] + 4, rig.groundY - settings.lift * flight];
    const springTop: Vec2 = [tip[0], tip[1] - springLength];
    const shaftTop: Vec2 = [tip[0], springTop[1] - settings.shaftLength];
    const pegY = shaftTop[1] + settings.pegOffset;
    root = [rig.root[0], pegY - 7];
    torsoAngle = radians(rig.torso.leanDegrees + Math.sin(t * Math.PI * 2));
    nearAnkle = [root[0] + 1, pegY - 2]; farAnkle = [root[0] - 2.5, pegY - 2];
    nearHand = [shaftTop[0] + 1, shaftTop[1]]; farHand = [shaftTop[0] - 1, shaftTop[1]];
    pogo = { tip, springTop, shaftTop, grips: [nearHand, farHand], pegs: [[root[0] - 4.5, pegY], [root[0] + 5, pegY]], springLength, grounded };
  } else if (rig.motion === 'fire') {
    const settings = rig.fire; if (!settings) throw new Error('Firing rig requires recoil settings.');
    // The muzzle flash leads the recoil: it fires at t = .12 to .22 while the kick is still building, the kick peaks by t = .33
    // and then eases back across the rest of the loop, so no two sampled frames repeat.
    const recoil = smoothstep((t - .12) / .2) * (1 - smoothstep((t - .33) / .67));
    root = [rig.root[0] - recoil * settings.recoil * .55, rig.root[1]];
    torsoAngle = radians(rig.torso.leanDegrees - recoil * 6);
    nearAnkle = [rig.root[0] + 2, rig.groundY - 2]; farAnkle = [rig.root[0] - 3, rig.groundY - 2];
    nearHand = [17.4 - recoil * settings.recoil, 19.5 - recoil * .3]; farHand = add(nearHand, [-.8, .5]);
    const angle = radians(-settings.kickDegrees * recoil);
    weapon = { grip: nearHand, angle, muzzle: add(nearHand, rotate([6, -2], angle)), flash: t >= .12 && t < .22 };
  } else throw new Error('Unknown action rig.');
  const base = { root, torsoAngle }, neck = torsoPoint(base, [0, -rig.torso.neckHeight]);
  const nearShoulder = torsoPoint(base, [-rig.torso.shoulderSpread, rig.torso.shoulderY]);
  const farShoulder = torsoPoint(base, [rig.torso.shoulderSpread, rig.torso.shoulderY]);
  const nearFoot = flatFoot(nearAnkle, rig), farFoot = flatFoot(farAnkle, rig);
  const nearArm = solveTwoBone(nearShoulder, nearHand, rig.arms.upperLength, rig.arms.forearmLength, -1);
  const farArm = solveTwoBone(farShoulder, farHand, rig.arms.upperLength, rig.arms.forearmLength, -1);
  const nearLeg = solveTwoBone(add(root, [rig.legs.hipSpread, 0]), nearAnkle, rig.legs.thighLength, rig.legs.shinLength);
  const farLeg = solveTwoBone(add(root, [-rig.legs.hipSpread, 0]), farAnkle, rig.legs.thighLength, rig.legs.shinLength);
  for (const [chain, target] of [[nearArm, nearHand], [farArm, farHand], [nearLeg, nearAnkle], [farLeg, farAnkle]] as const) {
    if (Math.hypot(chain[2][0] - target[0], chain[2][1] - target[1]) > 1e-5) throw new Error('Action target exceeds bone reach.');
  }
  return { time: t, root, torsoAngle, torsoTurn: 0, headTurn: 0, neck, face: sampleFace(neck, 0, rig.face, t), nearArm, farArm, nearLeg, farLeg, nearFoot, farFoot, contact: pogo ? pogo.grounded ? 'pogo' : 'flight' : 'both', pogo, weapon };
}
