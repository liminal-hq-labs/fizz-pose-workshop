// Applies reusable skeletal poses and exports sampled animation clips without scaling body parts.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import sideRig from "../../source/ben-side-rig.json";
import { sampleRunRig } from "../rig/run.ts";
import config from "../../source/ben-3d.json";
import { runnerProfile, toeFlex } from "./equipment.ts";
import { resetRig } from "./rig.ts";
import { handGrip, holsterTurn, palmCentre, stunnerGrip } from "./stunner.ts";
import type { BenModel } from "./model.ts";
import { barHeight, pegHeight, pogoState, pogoStick, pogoTiming } from "./pogo.ts";
export const poseNames = [
  "Standing",
  "Run",
  "Jump",
  "Fall",
  "Climb",
  "Pogo",
  "Firing",
  "Whistle",
  "Phone",
  "Look up",
  "Look down",
  "Belly clutch",
] as const;
export type BenPose = (typeof poseNames)[number];
const rad = THREE.MathUtils.degToRad;
const durations: Readonly<Partial<Record<BenPose, number>>> = {
  Run: 0.6,
  Jump: 1.1,
  Fall: 1.2,
  Climb: 1.4,
  Pogo: 0.8,
  Whistle: 2,
  Firing: 2.6,
  "Look up": 2.8,
  "Look down": 3.2,
};
export function poseDuration(pose: BenPose): number | null {
  return durations[pose] ?? null;
}
const smooth = THREE.MathUtils.smoothstep;
const gesture = (phase: number): number =>
  smooth(phase, 0.06, 0.3) * (1 - smooth(phase, 0.65, 0.94));

function aimChain(
  model: BenModel,
  names: readonly [string, string, string],
  target: THREE.Vector3,
  pole: THREE.Vector3,
): void {
  model.root.updateMatrixWorld(true);
  const upper = model.bones[names[0]],
    lower = model.bones[names[1]],
    hand = model.bones[names[2]];
  const origin = upper.getWorldPosition(new THREE.Vector3()),
    goal = model.root.localToWorld(target.clone()),
    poleWorld = model.root.localToWorld(pole.clone());
  const upperLength = lower.position.length(),
    lowerLength = hand.position.length(),
    axis = goal.clone().sub(origin),
    distance = THREE.MathUtils.clamp(
      axis.length(),
      Math.abs(upperLength - lowerLength) + 0.001,
      upperLength + lowerLength - 0.001,
    );
  axis.normalize();
  const bend = poleWorld.sub(origin);
  bend.addScaledVector(axis, -bend.dot(axis));
  if (bend.lengthSq() < 0.001) bend.set(1, 0, 0);
  bend.normalize();
  const along =
      (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance),
    height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)),
    elbow = origin
      .clone()
      .addScaledVector(axis, along)
      .addScaledVector(bend, height);
  const setDirection = (
    bone: THREE.Bone,
    child: THREE.Bone,
    direction: THREE.Vector3,
  ): void => {
    const parent = bone
      .parent!.getWorldQuaternion(new THREE.Quaternion())
      .invert();
    direction.normalize().applyQuaternion(parent);
    bone.quaternion.setFromUnitVectors(
      child.position.clone().normalize(),
      direction,
    );
    model.root.updateMatrixWorld(true);
  };
  setDirection(upper, lower, elbow.clone().sub(origin));
  setDirection(lower, hand, goal.clone().sub(elbow));
}
function aimArm(
  model: BenModel,
  side: "right" | "left",
  target: THREE.Vector3,
  pole: THREE.Vector3,
): void {
  aimChain(
    model,
    [side + "UpperArm", side + "Forearm", side + "Hand"],
    target,
    pole,
  );
}
const ankleRestY = config.bones.find((b) => b.name === "rightFoot")!
    .position[1],
  toeRestY =
    config.bones.find((b) => b.name === "rightToe")!.position[1] - ankleRestY,
  toeRestZ = config.bones.find((b) => b.name === "rightToe")!.position[2];
const soleContacts = Array.from({ length: 81 }, (_, i) => {
  const z = THREE.MathUtils.lerp(config.shoes.heelZ, config.shoes.toeZ, i / 80);
  return { z, y: runnerProfile(z).bottom - ankleRestY };
});
/** Degrees of counter-rotation in the run: hips one way, shoulders the other, plus the head turn. */
export const runTwist = { hips: 7, shoulders: 14, head: 5 } as const;
export function sampleRunBody(time: number): {
  bob: number;
  lean: number;
  hipYaw: number;
  spineYaw: number;
  chestYaw: number;
  headYaw: number;
  arms: readonly [
    { upper: number; forearm: number },
    { upper: number; forearm: number },
  ];
} {
  const pose = sampleRunRig(sideRig, time),
    angles = ([a, b, c]: typeof pose.nearArm): {
      upper: number;
      forearm: number;
    } => {
      const upper = Math.atan2(b[0] - a[0], b[1] - a[1]),
        lower = Math.atan2(c[0] - b[0], c[1] - b[1]);
      return {
        upper: -upper - pose.torsoAngle,
        forearm: -Math.atan2(Math.sin(lower - upper), Math.cos(lower - upper)),
      };
    };
  return {
    bob: sideRig.root[1] - pose.root[1],
    lean: pose.torsoAngle,
    // The rig's torsoTurn (−1 to 1) brings the near (right) shoulder forward with the near arm.
    // Hips counter-rotate; the shoulders end up turned by runTwist.shoulders in total.
    hipYaw: -pose.torsoTurn * rad(runTwist.hips),
    spineYaw: pose.torsoTurn * rad(runTwist.hips + runTwist.shoulders * 0.4),
    chestYaw: pose.torsoTurn * rad(runTwist.shoulders * 0.6),
    // The rig's headTurn is −1 at the camera-facing peak, when the face turns to Ben's right.
    headYaw: pose.headTurn * rad(runTwist.head),
    arms: [angles(pose.nearArm), angles(pose.farArm)],
  };
}
export function sampleRunFoot(time: number): {
  phase: number;
  z: number;
  y: number;
  pitch: number;
  toe: number;
  stance: boolean;
} {
  const phase = ((time % 1) + 1) % 1,
    stance = phase < sideRig.stride.stanceFraction,
    t = stance
      ? phase / sideRig.stride.stanceFraction
      : (phase - sideRig.stride.stanceFraction) /
        (1 - sideRig.stride.stanceFraction);
  const z = stance
    ? THREE.MathUtils.lerp(
        config.run.strideHalfLength,
        -config.run.strideHalfLength,
        t,
      )
    : THREE.MathUtils.lerp(
        -config.run.strideHalfLength,
        config.run.strideHalfLength,
        t * t * (3 - 2 * t),
      ) -
      ((2 * config.run.strideHalfLength * (1 - sideRig.stride.stanceFraction)) /
        sideRig.stride.stanceFraction) *
        (2 * t * t * t - 3 * t * t + t);
  const pitch = stance
    ? THREE.MathUtils.lerp(-12, 0, THREE.MathUtils.smoothstep(t, 0, 0.2)) +
      25 * THREE.MathUtils.smoothstep(t, 0.7, 1)
    : THREE.MathUtils.lerp(25, -12, t);
  const toe = stance
    ? -pitch * THREE.MathUtils.smoothstep(t, 0.65, 1)
    : -25 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.3));
  const a = rad(pitch),
    b = rad(toe);
  let lowest = Infinity;
  for (const { z, y } of soleContacts) {
    const w = THREE.MathUtils.smoothstep(z, toeFlex.start, toeFlex.end);
    const bentY =
        toeRestY + (y - toeRestY) * Math.cos(b) - (z - toeRestZ) * Math.sin(b),
      bentZ =
        toeRestZ + (y - toeRestY) * Math.sin(b) + (z - toeRestZ) * Math.cos(b);
    lowest = Math.min(
      lowest,
      THREE.MathUtils.lerp(y, bentY, w) * Math.cos(a) -
        THREE.MathUtils.lerp(z, bentZ, w) * Math.sin(a),
    );
  }
  return {
    phase,
    z,
    y:
      -0.5 -
      lowest +
      (stance ? 0 : config.run.recoveryLift * Math.sin(Math.PI * t)),
    pitch,
    toe,
    stance,
  };
}
/** Eases between keyed values; each key is [phase, value] and phases rise from 0 to 1. */
export function track(
  keys: readonly (readonly [number, number])[],
  phase: number,
): number {
  if (phase <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++)
    if (phase <= keys[i][0]) {
      const [a, va] = keys[i - 1],
        [b, vb] = keys[i];
      return THREE.MathUtils.lerp(va, vb, smooth(phase, a, b));
    }
  return keys.at(-1)![1];
}
const axisX = new THREE.Vector3(1, 0, 0),
  axisY = new THREE.Vector3(0, 1, 0);
/** Sets a bone's orientation in the model (root) frame. */
function orientInModel(
  model: BenModel,
  bone: THREE.Bone,
  orientation: THREE.Quaternion,
): void {
  model.root.updateMatrixWorld(true);
  bone.quaternion.copy(
    bone
      .parent!.getWorldQuaternion(new THREE.Quaternion())
      .invert()
      .multiply(model.root.getWorldQuaternion(new THREE.Quaternion()))
      .multiply(orientation),
  );
  model.root.updateMatrixWorld(true);
}
/** Plants a shoe level with the ground, turned by `yaw` and pitched by `pitch` degrees. */
function plantFoot(
  model: BenModel,
  side: "right" | "left",
  yaw = 0,
  pitch = 0,
): void {
  orientInModel(
    model,
    model.bones[side + "Foot"],
    new THREE.Quaternion()
      .setFromAxisAngle(axisY, rad(yaw))
      .multiply(new THREE.Quaternion().setFromAxisAngle(axisX, rad(pitch))),
  );
}
function legTo(
  model: BenModel,
  side: "right" | "left",
  ankle: THREE.Vector3,
  knee = new THREE.Vector3(model.rest[side + "Foot"].x, 6, 8),
): void {
  aimChain(model, [side + "Thigh", side + "Shin", side + "Foot"], ankle, knee);
}
/** A hand orientation in the model frame from its finger direction and palm normal. */
function handFrame(
  side: "right" | "left",
  fingers: THREE.Vector3,
  palm: THREE.Vector3,
): THREE.Quaternion {
  const down = fingers.clone().normalize(),
    across = palm.clone().addScaledVector(down, -palm.dot(down)).normalize(),
    // The right palm faces the hand frame's +x, the left palm its −x; the fingers run along −y.
    x = side === "right" ? across : across.clone().negate(),
    y = down.clone().negate(),
    z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}
/** The relaxed thumb's direction in the hand frame, from its base towards its tip. */
function thumbRest(side: "right" | "left"): THREE.Vector3 {
  const inward = side === "right" ? 1 : -1;
  return new THREE.Vector3(inward * 0.37, -1.15, 0.25);
}
/** Ladder geometry shared by the climb pose and the preview's ladder prop. */
// `top` is the highest rung a hand grabs; feet stand on rungs with the ankle `footHigh` above them at the top of a step.
export const ladder = {
  rungSpacing: 2.4,
  z: 4.5,
  halfWidth: 2.7,
  top: 25.2,
  footHigh: 5.7,
  handX: 2.2,
};
/** Rung heights in the model frame at a climb phase; the ladder scrolls down as Ben climbs in place. */
export function ladderRungs(phase: number, count = 12): number[] {
  const r = ladder.rungSpacing,
    shift = (((-2 * r * phase) % r) + r) % r;
  return Array.from(
    { length: count },
    (_, k) => ladder.top - r * 10 + shift + k * r,
  );
}
// One limb's climb cycle: it holds a rung for half the cycle (descending with the ladder) and reaches two rungs up.
function climbLimb(phase: number, high: number): { y: number; reach: number } {
  const r = ladder.rungSpacing,
    p = ((phase % 1) + 1) % 1;
  if (p >= 0.5) return { y: high - r * ((p - 0.5) / 0.5), reach: 0 };
  const t = smooth(p, 0, 0.5);
  return { y: high - r + r * t, reach: Math.sin(Math.PI * (p / 0.5)) };
}
/**
 * The texting grip, in the phone's own frame (screen towards −z, facing Ben). The phone tilts back by
 * `tilt` degrees so the screen faces his eyes. The palms cup its back with the fingers up behind it,
 * and each thumb bone swings round the side edge so the thumb tip presses `thumbTip` on the screen.
 * Values are for the right hand (on Ben's right, −x); the left hand mirrors them. `fingers` and
 * `thumb` (the hand's thumb-side direction) have their x measured inwards, towards the phone.
 */
export const phoneHold = {
  /** Moves the phone from its rest attachment towards Ben's chest, so the forearms rise to it. */
  offset: [0, 1, -1],
  tilt: -25,
  palm: [1.15, -1.25, 0.58],
  fingers: [0.2, 0.95, 0.15],
  thumb: [-1, 0.1, 0],
  thumbTip: [0.9, -0.95, -0.5],
};
/** Firing sequence phases: reach, draw, aim, fire, recoil, lower and reholster. */
export const firing = {
  reach: [0.06, 0.18],
  draw: [0.18, 0.28],
  aim: [0.28, 0.44],
  fire: 0.5,
  flash: [0.485, 0.53],
  recover: [0.5, 0.66],
  lower: [0.7, 0.8],
  holster: [0.8, 0.9],
  release: [0.9, 0.98],
} as const;
function fireStunner(model: BenModel, phase: number): void {
  const b = model.bones,
    rest = model.rest,
    span = (range: readonly [number, number]): number =>
      smooth(phase, range[0], range[1]),
    stance = span(firing.aim) * (1 - span(firing.holster)),
    kick =
      smooth(phase, firing.fire - 0.005, firing.fire + 0.02) *
      (1 - smooth(phase, firing.fire + 0.02, firing.recover[1]));
  // Ben turns his right shoulder towards the target, drops into a planted stance and leans into the shot.
  b.pelvis.position.y += -0.8 * stance + 0.2 * kick;
  b.pelvis.position.z += -0.35 * kick;
  b.pelvis.rotation.y = rad(24 * stance);
  b.spine.rotation.set(rad(14 * stance - 11 * kick), rad(8 * stance), 0);
  b.chest.rotation.set(rad(-6 * kick), rad(10 * stance), 0);
  b.neck.rotation.set(rad(-6 * stance + 4 * kick), rad(-19 * stance), 0);
  b.head.rotation.set(rad(-5 * stance - 5 * kick), rad(-21 * stance), 0);
  model.root.updateMatrixWorld(true);
  const step = stance;
  legTo(
    model,
    "right",
    new THREE.Vector3(
      rest.rightFoot.x - 0.6 * step,
      rest.rightFoot.y,
      -2.0 * step,
    ),
  );
  legTo(
    model,
    "left",
    new THREE.Vector3(
      rest.leftFoot.x + 0.5 * step,
      rest.leftFoot.y,
      1.8 * step,
    ),
  );
  plantFoot(model, "right", 25 * step);
  plantFoot(model, "left", 10 * step);
  // The gun's orientation and the grip point travel from the holster to the aim and back.
  // The holster rides on the turning pelvis, so read it from the Stunner bone before it is drawn.
  const toModel = model.root.matrixWorld.clone().invert(),
    rootTurn = model.root.getWorldQuaternion(new THREE.Quaternion()).invert(),
    holstered = rootTurn
      .clone()
      .multiply(b.stunner.getWorldQuaternion(new THREE.Quaternion()))
      .multiply(holsterTurn),
    holster = b.stunner
      .getWorldPosition(new THREE.Vector3())
      .applyMatrix4(toModel)
      .add(stunnerGrip.clone().applyQuaternion(holstered)),
    lifted = holster.clone().add(new THREE.Vector3(-0.2, 1.6, 0.6)),
    aimed = new THREE.Quaternion().setFromAxisAngle(axisX, rad(-4)),
    recoiled = new THREE.Quaternion().setFromAxisAngle(axisX, rad(-42)),
    lowered = new THREE.Quaternion().setFromAxisAngle(axisX, rad(55)),
    // Arm locked out at shoulder height, sighting along the barrel.
    aimPoint = new THREE.Vector3(-1.0, 18.6, 9.4),
    lowPoint = new THREE.Vector3(-2.4, 12.6, 3.4);
  const drawn = span(firing.draw),
    aiming = span(firing.aim),
    down = span(firing.lower),
    back = span(firing.holster);
  const gun = holstered
    .clone()
    .slerp(aimed, aiming)
    .slerp(recoiled, kick)
    .slerp(lowered, down)
    .slerp(holstered, back);
  const grip = holster
    .clone()
    .lerp(lifted, drawn)
    .lerp(aimPoint, aiming)
    .add(new THREE.Vector3(0, 0.9 * kick, -1.8 * kick))
    .lerp(lowPoint, down)
    .lerp(holster, back);
  const held = phase >= firing.reach[1] && phase <= firing.holster[1];
  // The hand closes on the grip, so the hand's orientation follows the gun's.
  const hand = gun.clone().multiply(handGrip.clone().invert()),
    restHand = new THREE.Quaternion(),
    reach = span(firing.reach) * (1 - span(firing.release)),
    handTurn = restHand.clone().slerp(hand, held ? 1 : reach),
    wrist = grip.clone().sub(palmCentre.clone().applyQuaternion(handTurn)),
    wristGoal = rest.rightHand.clone().lerp(wrist, held ? 1 : reach);
  aimArm(model, "right", wristGoal, new THREE.Vector3(-6, 13, -2));
  orientInModel(model, b.rightHand, handTurn);
  // The left hand cups the right during the aim, then returns to his side.
  const support = stance * (1 - down),
    cup = grip.clone().add(new THREE.Vector3(0.75, -0.35, -0.35));
  aimArm(
    model,
    "left",
    rest.leftHand.clone().lerp(cup, support),
    new THREE.Vector3(6, 12, 1),
  );
  orientInModel(
    model,
    b.leftHand,
    new THREE.Quaternion().slerp(
      handFrame(
        "left",
        new THREE.Vector3(-0.3, -0.2, 1),
        new THREE.Vector3(-1, 0.6, 0),
      ),
      support,
    ),
  );
  // The Stunner follows the hand while drawn and stays in its holster otherwise.
  const attached =
    held || (phase > firing.reach[1] && phase < firing.holster[1]);
  if (attached) {
    const gunAt = b.rightHand
      .getWorldPosition(new THREE.Vector3())
      .applyMatrix4(toModel)
      .add(palmCentre.clone().applyQuaternion(handTurn))
      .sub(stunnerGrip.clone().applyQuaternion(gun));
    b.stunner.position.copy(
      b.stunner.parent!.worldToLocal(model.root.localToWorld(gunAt)),
    );
    orientInModel(
      model,
      b.stunner,
      gun.clone().multiply(holsterTurn.clone().invert()),
    );
  }
  b.muzzleFlash.scale.setScalar(
    smooth(phase, firing.flash[0], firing.fire) *
      (1 - smooth(phase, firing.fire, firing.flash[1])),
  );
}
export function applyBenPose(model: BenModel, pose: BenPose, time = 0): void {
  resetRig(model);
  model.bones.phone.scale.setScalar(pose === "Phone" ? 1 : 0);
  model.bones.muzzleFlash.scale.setScalar(0);
  const phase = ((time % 1) + 1) % 1,
    amount = gesture(phase);
  const b = model.bones,
    rest = model.rest,
    s = Math.sin(time * Math.PI * 2);
  const turn = (name: string, x = 0, y = 0, z = 0): void => {
    b[name].rotation.set(rad(x), rad(y), rad(z));
  };
  if (pose === "Run") {
    const body = sampleRunBody(time);
    b.pelvis.position.y += config.run.pelvisOffset + body.bob;
    // Hips and shoulders counter-rotate with the arm swing, as in the sprite rig, and the head
    // holds its line of sight while making the rig's small camera-facing turn.
    b.pelvis.rotation.y = body.hipYaw;
    b.spine.rotation.set(body.lean, body.spineYaw, 0);
    b.chest.rotation.y = body.chestYaw;
    b.neck.rotation.set(
      -body.lean * 0.5,
      -(body.hipYaw + body.spineYaw + body.chestYaw) * 0.7,
      0,
    );
    b.head.rotation.y = body.headYaw;
    for (const side of ["right", "left"] as const) {
      const arm = body.arms[side === "right" ? 0 : 1];
      b[side + "UpperArm"].rotation.x = arm.upper;
      b[side + "Forearm"].rotation.x = arm.forearm;
    }
  } else if (pose === "Jump") {
    // Crouch, launch, tuck at the apex, reach down and absorb the landing.
    b.pelvis.position.y += jumpHeight(phase);
    turn(
      "spine",
      track(
        [
          [0, 0],
          [0.15, 16],
          [0.26, -4],
          [0.5, 8],
          [0.78, 4],
          [0.88, 18],
          [1, 0],
        ],
        phase,
      ),
    );
    turn(
      "head",
      track(
        [
          [0, 0],
          [0.15, -8],
          [0.5, 4],
          [0.88, -6],
          [1, 0],
        ],
        phase,
      ),
    );
    const arm = track(
        [
          [0, 0],
          [0.15, 38],
          [0.28, -165],
          [0.5, -130],
          [0.72, -80],
          [0.88, -35],
          [1, 0],
        ],
        phase,
      ),
      spread = track(
        [
          [0, 0],
          [0.28, 12],
          [0.5, 28],
          [0.72, 35],
          [0.9, 14],
          [1, 0],
        ],
        phase,
      ),
      bend = track(
        [
          [0, 0],
          [0.15, -20],
          [0.28, -15],
          [0.5, -40],
          [0.88, -30],
          [1, 0],
        ],
        phase,
      );
    turn("rightUpperArm", arm, 0, -spread);
    turn("leftUpperArm", arm * 0.92, 0, spread);
    turn("rightForearm", bend);
    turn("leftForearm", bend);
  } else if (pose === "Fall") {
    // Braced for impact: crouched, head tucked, forearms raised in front of the chest and face,
    // knees soft and feet lightly staggered beneath him.
    b.pelvis.position.y += 3 + 0.25 * s;
    turn("spine", 11 + 1.5 * s, 0, 0);
    turn("chest", 4, 0, 0);
    turn("neck", 6, 0, 0);
    turn("head", 10, 0, 0);
  } else if (pose === "Climb") {
    // Hands grip wide, beside the face, with the head tipped back so the helmet brim clears the rungs.
    b.pelvis.position.x = 0.22 * Math.sin(phase * Math.PI * 4);
    turn("spine", 4, 3 * Math.sin(phase * Math.PI * 4), 0);
    turn("neck", -7, 0, 0);
    turn("head", -11, 0, 0);
  } else if (pose === "Whistle") {
    turn("head", -3, 3 + s * 2, 2);
    turn("rightForearm", -25);
    turn("leftForearm", -18);
  } else if (pose === "Phone") {
    turn("rightUpperArm", -30, -10, -12);
    turn("leftUpperArm", -30, 10, 12);
    turn("rightForearm", -100, 0, -7);
    turn("leftForearm", -100, 0, 7);
    turn("head", 16, 0, 0);
  } else if (pose === "Look up") {
    turn("head", -24 * amount);
    turn("neck", -4 * amount);
    turn("spine", -2 * amount);
    turn("rightForearm", -18 * amount);
    turn("leftForearm", -18 * amount);
  } else if (pose === "Look down") {
    turn("spine", 18 * amount);
    turn("neck", 10 * amount);
    turn("head", 25 * amount);
    turn("rightUpperArm", -8 * amount, 0, -10 * amount);
    turn("leftUpperArm", -8 * amount, 0, 10 * amount);
    turn("rightForearm", -20 * amount);
    turn("leftForearm", -20 * amount);
  } else if (pose === "Belly clutch") {
    turn("spine", 16, 0, 0);
    turn("head", -8, 0, 8);
    turn("rightUpperArm", -25, -15, -10);
    turn("leftUpperArm", -25, 15, 10);
    turn("rightForearm", -100, 0, -35);
    turn("leftForearm", -100, 0, 35);
    turn("rightThigh", -30, 0, -15);
    turn("leftThigh", -20, 0, 15);
    turn("rightShin", 45);
    turn("leftShin", 35);
  }
  model.root.updateMatrixWorld(true);
  if (pose === "Run")
    for (const [side, offset] of [
      ["right", 0],
      ["left", 0.5],
    ] as const) {
      const foot = sampleRunFoot(time + offset),
        x = rest[side + "Foot"].x;
      legTo(model, side, new THREE.Vector3(x, foot.y, foot.z));
      plantFoot(model, side, 0, foot.pitch);
      b[side + "Toe"].rotation.x = rad(foot.toe);
      model.root.updateMatrixWorld(true);
    }
  if (pose === "Jump") {
    const lift = jumpHeight(phase),
      tuck = track(
        [
          [0, 0],
          [0.3, 0],
          [0.48, 2.8],
          [0.6, 2.6],
          [0.76, 0],
          [1, 0],
        ],
        phase,
      ),
      toe = track(
        [
          [0, 0],
          [0.2, 0],
          [0.27, 32],
          [0.4, 12],
          [0.6, -8],
          [0.78, 8],
          [0.84, 0],
          [1, 0],
        ],
        phase,
      );
    for (const [side, forward] of [
      ["right", 1],
      ["left", -0.4],
    ] as const) {
      const ankle = rest[side + "Foot"].clone();
      ankle.y = Math.max(ankle.y, ankle.y + lift + tuck);
      ankle.z += forward * tuck * 0.45;
      legTo(model, side, ankle);
      plantFoot(model, side, 0, toe);
    }
  }
  if (pose === "Fall") {
    for (const [side, forward] of [
      ["right", 0.55],
      ["left", -0.35],
    ] as const) {
      const ankle = rest[side + "Foot"].clone();
      ankle.x *= 0.85;
      ankle.y += 3 + 0.25 * s + 1.1;
      ankle.z += forward;
      legTo(model, side, ankle);
      plantFoot(model, side, 0, 12);
    }
    for (const side of ["right", "left"] as const) {
      const sign = side === "right" ? -1 : 1,
        wrist = new THREE.Vector3(sign * 1.25, 23.9 + 0.3 * s, 4.1);
      aimArm(model, side, wrist, new THREE.Vector3(sign * 6, 15, 2));
      orientInModel(
        model,
        b[side + "Hand"],
        handFrame(
          side,
          new THREE.Vector3(-sign * 0.3, 1, 0.35),
          new THREE.Vector3(sign * 0.2, 0, 1),
        ),
      );
    }
  }
  if (pose === "Climb") {
    for (const [side, offset] of [
      ["right", 0],
      ["left", 0.5],
    ] as const) {
      const sign = side === "right" ? -1 : 1,
        hand = climbLimb(phase + offset, ladder.top),
        // Each foot steps with the opposite hand and stands on a rung two units above its ankle.
        foot = climbLimb(phase + offset + 0.5, ladder.footHigh);
      const wrist = new THREE.Vector3(
        sign * ladder.handX,
        hand.y + 0.45,
        ladder.z - 0.85 - 0.9 * hand.reach,
      );
      aimArm(model, side, wrist, new THREE.Vector3(sign * 6, 16, -3));
      orientInModel(
        model,
        b[side + "Hand"],
        handFrame(
          side,
          new THREE.Vector3(0, 0.3, 1),
          new THREE.Vector3(0, -1, 0.3),
        ),
      );
      legTo(
        model,
        side,
        new THREE.Vector3(
          sign * 1.4,
          foot.y,
          ladder.z - 1.55 - 0.8 * foot.reach,
        ),
        new THREE.Vector3(sign * 1.6, 6, 10),
      );
      plantFoot(model, side, 0, -6 + 10 * foot.reach);
    }
  }
  if (pose === "Phone") {
    b.phone.rotation.x = rad(phoneHold.tilt);
    b.phone.position.add(new THREE.Vector3(...phoneHold.offset));
    model.root.updateMatrixWorld(true);
  }
  if (pose === "Phone")
    for (const side of ["right", "left"] as const) {
      const sign = side === "right" ? -1 : 1,
        tilt = new THREE.Quaternion().setFromAxisAngle(
          axisX,
          rad(phoneHold.tilt),
        ),
        local = (v: readonly number[]): THREE.Vector3 =>
          new THREE.Vector3(-sign * v[0], v[1], v[2]).applyQuaternion(tilt),
        fingers = local(phoneHold.fingers).normalize(),
        thumb = local(phoneHold.thumb);
      thumb.addScaledVector(fingers, -thumb.dot(fingers)).normalize();
      const down = fingers.clone().negate(),
        hold = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(
            new THREE.Vector3().crossVectors(down, thumb),
            down,
            thumb,
          ),
        ),
        // Directions point inwards (towards the phone) for both hands; the palm sits on each hand's own side.
        phoneAt = rest.phone
          .clone()
          .add(new THREE.Vector3(...phoneHold.offset)),
        palm = new THREE.Vector3(
          sign * phoneHold.palm[0],
          phoneHold.palm[1],
          phoneHold.palm[2],
        )
          .applyQuaternion(tilt)
          .add(phoneAt),
        wrist = palm.clone().sub(palmCentre.clone().applyQuaternion(hold));
      aimArm(model, side, wrist, new THREE.Vector3(sign * 6, 12, 2));
      orientInModel(model, b[side + "Hand"], hold);
      // Swing the thumb from its relaxed line onto the screen.
      const thumbBone = b[side + "Thumb"],
        base = model.root.worldToLocal(
          thumbBone.getWorldPosition(new THREE.Vector3()),
        ),
        relaxed = thumbRest(side).applyQuaternion(hold).normalize(),
        target = new THREE.Vector3(
          sign * phoneHold.thumbTip[0],
          phoneHold.thumbTip[1],
          phoneHold.thumbTip[2],
        )
          .applyQuaternion(tilt)
          .add(phoneAt);
      orientInModel(
        model,
        thumbBone,
        new THREE.Quaternion()
          .setFromUnitVectors(relaxed, target.sub(base).normalize())
          .multiply(hold),
      );
    }
  if (pose === "Belly clutch") {
    aimArm(
      model,
      "right",
      new THREE.Vector3(-1.1, 13.2, 2.6),
      new THREE.Vector3(-6, 12, 3),
    );
    aimArm(
      model,
      "left",
      new THREE.Vector3(1.1, 13.2, 2.6),
      new THREE.Vector3(6, 12, 3),
    );
  }
  if (pose === "Firing") fireStunner(model, phase);
  if (pose === "Pogo") ridePogo(model, phase);
  syncLegJoints(model);
  model.root.updateMatrixWorld(true);
  model.skeleton.update();
}
/**
 * Ben's body through one pogo bounce, keyed against the stick's own timing (`pogoTiming`): touchdown at 0, the deepest
 * compression, the drive up to lift-off, a tuck at the apex as he pulls the stick up under him, and the reach down for the
 * next touchdown. Heights are the pelvis above the footpegs; the lean is the spine's forward pitch in degrees; `rock` turns
 * each foot about its peg (positive lifts the heel and points the toe down) on top of the shaft's own lean.
 */
export const pogoRide = (() => {
  const { deepest, liftOff } = pogoTiming,
    apex = (liftOff + 1) / 2;
  return {
    pelvis: [
      [0, 9.3],
      [deepest, 7.3],
      [liftOff - 0.06, 10],
      [liftOff, 10.05],
      [apex, 8.5],
      [0.86, 9.6],
      [1, 9.3],
    ],
    back: [
      [0, 1.7],
      [deepest, 2.25],
      [liftOff, 1.35],
      [apex, 1.75],
      [1, 1.7],
    ],
    lean: [
      [0, 10],
      [deepest, 21],
      [liftOff - 0.04, 5],
      [apex, 12],
      [0.86, 8],
      [1, 10],
    ],
    rock: [
      [0, 0],
      [deepest, -7],
      [liftOff - 0.04, 16],
      [liftOff + 0.06, 14],
      [apex, 6],
      [0.86, 1],
      [1, 0],
    ],
  } as const satisfies Record<string, readonly (readonly [number, number])[]>;
})();
/** Feet stand this far either side of the shaft, with the middle of the sole on the peg. */
const pogoFootX = 1.85,
  archZ = 1.1;
const pogoFrame = new THREE.Matrix4(),
  pogoTurn = new THREE.Quaternion();
/** A point in the stick's frame (tip at the origin, shaft up +y) carried into the model frame for `phase`. */
export function pogoPoint(phase: number, local: THREE.Vector3): THREE.Vector3 {
  const state = pogoState(phase);
  pogoTurn.setFromAxisAngle(axisX, rad(state.lean));
  pogoFrame.compose(
    new THREE.Vector3(0, config.floorY + state.lift, pogoStick.z),
    pogoTurn,
    new THREE.Vector3(1, 1, 1),
  );
  return local.clone().applyMatrix4(pogoFrame);
}
function ridePogo(model: BenModel, phase: number): void {
  const b = model.bones,
    state = pogoState(phase),
    peg = pegHeight(state.springLength),
    bar = barHeight(state.springLength),
    lean = track(pogoRide.lean, phase);
  const pegCentre = pogoPoint(phase, new THREE.Vector3(0, peg, 0));
  b.pelvis.position.set(
    0,
    pegCentre.y + track(pogoRide.pelvis, phase),
    pegCentre.z - track(pogoRide.back, phase),
  );
  b.spine.rotation.set(rad(lean * 0.6), 0, 0);
  b.chest.rotation.set(rad(lean * 0.4), 0, 0);
  // The head holds its line of sight over the handlebar while the body pitches.
  b.neck.rotation.set(rad(-lean * 0.35), 0, 0);
  b.head.rotation.set(rad(-lean * 0.45), 0, 0);
  model.root.updateMatrixWorld(true);
  const pitch = state.lean + track(pogoRide.rock, phase),
    sole = ankleRestY - runnerProfile(archZ).bottom,
    turn = new THREE.Quaternion().setFromAxisAngle(axisX, rad(pitch));
  for (const side of ["right", "left"] as const) {
    const sign = side === "right" ? -1 : 1;
    // The middle of the sole rests on the peg's top face; the foot turns about that contact, so the ankle follows it.
    const contact = pogoPoint(phase, new THREE.Vector3(sign * pogoFootX, peg, 0)),
      ankle = contact.add(new THREE.Vector3(0, sole, -archZ).applyQuaternion(turn));
    legTo(model, side, ankle, new THREE.Vector3(sign * 3.4, ankle.y + 4, 10));
    plantFoot(model, side, sign * -4, pitch);
    // Overhand grip: the palm rests on top of the grip with the fingers over the front of the bar.
    const grip = pogoPoint(phase, new THREE.Vector3(sign * 2.65, bar, 0)),
      hold = handFrame(side, new THREE.Vector3(sign * -0.1, -0.45, 1), new THREE.Vector3(0, -1, -0.4)),
      palm = grip.add(new THREE.Vector3(0, pogoStick.gripRadius + 0.3, -0.15)),
      wrist = palm.sub(palmCentre.clone().applyQuaternion(hold));
    aimArm(model, side, wrist, new THREE.Vector3(sign * 7, wrist.y - 1, -5));
    orientInModel(model, b[side + "Hand"], hold);
  }
}
/** Pelvis height through the jump: crouch, ballistic arc and landing absorption. */
export function jumpHeight(phase: number): number {
  if (phase < 0.15) return -1.6 * smooth(phase, 0, 0.15);
  if (phase < 0.26) return -1.6 * (1 - smooth(phase, 0.15, 0.26));
  if (phase < 0.8) return 5.5 * (1 - ((phase - 0.53) / 0.27) ** 2);
  return -1.4 * Math.sin((Math.PI * (phase - 0.8)) / 0.2);
}
export function syncLegJoints(model: BenModel): void {
  const b = model.bones;
  for (const side of ["right", "left"])
    b[side + "Knee"].quaternion
      .identity()
      .slerp(b[side + "Shin"].quaternion, 0.5);
}
export function createBenClips(model: BenModel): THREE.AnimationClip[] {
  const clips: THREE.AnimationClip[] = [];
  for (const pose of poseNames) {
    if (pose === "Standing") continue;
    const duration = poseDuration(pose) ?? 1,
      count = poseDuration(pose) !== null ? 60 : 1,
      times = Array.from(
        { length: count + 1 },
        (_, i) => (i / count) * duration,
      ),
      values = new Map<string, number[]>(),
      positions = new Map<string, number[]>(),
      scales = new Map<string, number[]>();
    for (let i = 0; i <= count; i++) {
      applyBenPose(model, pose, i / count);
      for (const bone of model.skeleton.bones) {
        const q = values.get(bone.name) ?? [],
          p = positions.get(bone.name) ?? [];
        q.push(...bone.quaternion.toArray());
        p.push(...bone.position.toArray());
        values.set(bone.name, q);
        positions.set(bone.name, p);
        const scale = scales.get(bone.name) ?? [];
        scale.push(...bone.scale.toArray());
        scales.set(bone.name, scale);
      }
    }
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [name, data] of values)
      tracks.push(
        new THREE.QuaternionKeyframeTrack(name + ".quaternion", times, data),
      );
    for (const [name, data] of positions)
      tracks.push(
        new THREE.VectorKeyframeTrack(name + ".position", times, data),
      );
    for (const [name, data] of scales)
      tracks.push(new THREE.VectorKeyframeTrack(name + ".scale", times, data));
    clips.push(new THREE.AnimationClip(pose, duration, tracks));
  }
  applyBenPose(model, "Standing");
  return clips;
}
export function serialisePose(model: BenModel): {
  name: string;
  root: number[];
  quaternion: number[];
  bones: Record<
    string,
    { position: number[]; quaternion: number[]; scale: number[] }
  >;
} {
  return {
    name: "Ben custom pose",
    root: model.root.position.toArray(),
    quaternion: model.root.quaternion.toArray(),
    bones: Object.fromEntries(
      model.skeleton.bones.map((b) => [
        b.name,
        {
          position: b.position.toArray(),
          quaternion: b.quaternion.toArray(),
          scale: b.scale.toArray(),
        },
      ]),
    ),
  };
}
