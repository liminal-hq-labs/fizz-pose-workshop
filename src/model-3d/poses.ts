// Applies reusable skeletal poses and exports sampled animation clips without scaling body parts.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { resetRig } from "./rig.ts";
import type { BenModel } from "./model.ts";
export const poseNames = [
  "Standing",
  "Run",
  "Jump",
  "Climb",
  "Firing",
  "Whistle",
  "Phone",
  "Look up",
  "Belly clutch",
] as const;
export type BenPose = (typeof poseNames)[number];
const rad = THREE.MathUtils.degToRad;
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
export function sampleRunFoot(time: number): {
  phase: number;
  z: number;
  y: number;
  pitch: number;
  toe: number;
  stance: boolean;
} {
  const phase = ((time % 1) + 1) % 1,
    stance = phase < 0.5,
    t = stance ? phase * 2 : (phase - 0.5) * 2;
  const z = stance
    ? THREE.MathUtils.lerp(3.2, -3.2, t)
    : THREE.MathUtils.lerp(-3.2, 3.2, t * t * (3 - 2 * t)) -
      6.4 * (2 * t * t * t - 3 * t * t + t);
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
  for (const depth of [-3.4, -1.5, 0, 2, 2.9, 3.9, 5.8, 6.8]) {
    const w = THREE.MathUtils.smoothstep(depth, 2.2, 3.9),
      y = -4,
      z = depth;
    const bentY = -2.2 + (y + 2.2) * Math.cos(b) - (z - 2.9) * Math.sin(b),
      bentZ = 2.9 + (y + 2.2) * Math.sin(b) + (z - 2.9) * Math.cos(b);
    lowest = Math.min(
      lowest,
      THREE.MathUtils.lerp(y, bentY, w) * Math.cos(a) -
        THREE.MathUtils.lerp(z, bentZ, w) * Math.sin(a),
    );
  }
  return {
    phase,
    z,
    y: -0.5 - lowest + (stance ? 0 : 2.2 * Math.sin(Math.PI * t)),
    pitch,
    toe,
    stance,
  };
}
export function applyBenPose(model: BenModel, pose: BenPose, time = 0): void {
  resetRig(model);
  model.bones.phone.scale.setScalar(pose === "Phone" ? 1 : 0);
  const b = model.bones,
    s = Math.sin(time * Math.PI * 2),
    c = Math.cos(time * Math.PI * 2);
  const turn = (name: string, x = 0, y = 0, z = 0): void => {
    b[name].rotation.set(rad(x), rad(y), rad(z));
  };
  if (pose === "Run") {
    b.pelvis.position.y += -1.1 + 0.15 * Math.cos(time * Math.PI * 4);
    turn("spine", 12, 0, 0);
    turn("chest", 0, s * 4, 0);
    turn("neck", -7, -s * 2, 0);
    for (const [side, sign] of [
      ["right", 1],
      ["left", -1],
    ] as const) {
      turn(side + "UpperArm", sign * c * 42, 0, 0);
      turn(side + "Forearm", -75, 0, 0);
    }
  } else if (pose === "Jump") {
    b.pelvis.position.y += 3.5;
    turn("spine", 9);
    turn("rightUpperArm", -65, 0, -18);
    turn("leftUpperArm", -55, 0, 18);
    turn("rightForearm", -45);
    turn("leftForearm", -55);
    turn("rightThigh", -55, 0, -12);
    turn("leftThigh", 22, 0, 15);
    turn("rightShin", 83);
    turn("leftShin", 75);
    turn("rightFoot", -18);
    turn("leftFoot", 25);
  } else if (pose === "Climb") {
    turn("rightUpperArm", -150, 0, -15);
    turn("leftUpperArm", -105, 0, 20);
    turn("rightForearm", -25);
    turn("leftForearm", -65);
    turn("rightThigh", -20);
    turn("leftThigh", -68);
    turn("rightShin", 35);
    turn("leftShin", 85);
    turn("leftFoot", -10);
  } else if (pose === "Firing") {
    turn("rightUpperArm", -85, 12, -12);
    turn("rightForearm", -12);
    turn("leftUpperArm", -70, -35, 22);
    turn("leftForearm", -50);
    turn("chest", -3, -8);
    turn("head", 0, 8);
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
    turn("head", -24, 0, 0);
    turn("rightForearm", -18);
    turn("leftForearm", -18);
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
        x = model.rest[side + "Foot"].x;
      aimChain(
        model,
        [side + "Thigh", side + "Shin", side + "Foot"],
        new THREE.Vector3(x, foot.y, foot.z),
        new THREE.Vector3(x, 6, 6),
      );
      const parent = model.bones[side + "Foot"].parent!,
        inverse = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      model.bones[side + "Foot"].quaternion.copy(
        inverse
          .multiply(model.root.getWorldQuaternion(new THREE.Quaternion()))
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(1, 0, 0),
              rad(foot.pitch),
            ),
          ),
      );
      model.bones[side + "Toe"].rotation.x = rad(foot.toe);
      model.root.updateMatrixWorld(true);
    }
  if (pose === "Phone") {
    aimArm(
      model,
      "right",
      new THREE.Vector3(-1.3, 16, 4.8),
      new THREE.Vector3(-6, 13, 3),
    );
    aimArm(
      model,
      "left",
      new THREE.Vector3(1.3, 16, 4.8),
      new THREE.Vector3(6, 13, 3),
    );
  }
  if (pose === "Belly clutch") {
    aimArm(
      model,
      "right",
      new THREE.Vector3(-1.1, 13.2, 3.2),
      new THREE.Vector3(-6, 12, 3),
    );
    aimArm(
      model,
      "left",
      new THREE.Vector3(1.1, 13.2, 3.2),
      new THREE.Vector3(6, 12, 3),
    );
  }
  if (pose === "Firing") {
    aimArm(
      model,
      "right",
      new THREE.Vector3(-0.8, 17, 4.7),
      new THREE.Vector3(-5, 14, 3),
    );
    aimArm(
      model,
      "left",
      new THREE.Vector3(0.6, 16.5, 4.0),
      new THREE.Vector3(5, 14, 3),
    );
    const hand = b.rightHand,
      position = hand
        .getWorldPosition(new THREE.Vector3())
        .add(
          new THREE.Vector3(0, 1.1, 0.6).applyQuaternion(
            model.root.getWorldQuaternion(new THREE.Quaternion()),
          ),
        ),
      q = model.root.getWorldQuaternion(new THREE.Quaternion()),
      parent = b.stunner.parent!;
    parent.worldToLocal(position);
    b.stunner.position.copy(position);
    const parentQ = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    b.stunner.quaternion.copy(
      parentQ
        .multiply(q)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            -Math.PI / 2,
          ),
        ),
    );
  }
  model.root.updateMatrixWorld(true);
  model.skeleton.update();
}
export function createBenClips(model: BenModel): THREE.AnimationClip[] {
  const clips: THREE.AnimationClip[] = [];
  for (const pose of poseNames) {
    if (pose === "Standing") continue;
    const count = pose === "Run" || pose === "Whistle" ? 24 : 1,
      duration = pose === "Run" ? 0.6 : pose === "Whistle" ? 2 : 1,
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
