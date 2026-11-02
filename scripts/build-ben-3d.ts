// Exports a reusable rigged Three.js model, glTF binary and named pose animations.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mkdir, writeFile, readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createBenModel } from "../src/model-3d/model.ts";
import sideRig from "../source/ben-side-rig.json";
import { sampleRunRig } from "../src/rig/run.ts";
import {
  createBenClips,
  applyBenPose,
  sampleRunFoot,
} from "../src/model-3d/poses.ts";
import { installThreeToolRuntime } from "./three-runtime.ts";
import config from "../source/ben-3d.json";

installThreeToolRuntime();
const root = new URL("../", import.meta.url),
  svg = await readFile(new URL("source/ben-3d-skins.svg", root), "utf8"),
  model = createBenModel(svg),
  clips = createBenClips(model);
model.root.animations = clips;
const output = new URL("models/ben-3d/", root);
await mkdir(output, { recursive: true });
const glb = await new GLTFExporter().parseAsync(model.root, {
  binary: true,
  animations: clips,
  onlyVisible: false,
  trs: true,
  copyright: "2026 Liminal HQ, Scott Morris — Apache-2.0 OR MIT",
});
if (!(glb instanceof ArrayBuffer))
  throw new Error("Expected a binary glTF export.");
await writeFile(new URL("ben.glb", output), new Uint8Array(glb));
await writeFile(
  new URL("rig.json", output),
  JSON.stringify(
    {
      ...config,
      meshCount: model.meshes.length,
      bones: model.skeleton.bones.map((b) => b.name),
      animations: clips.map((c) => ({ name: c.name, duration: c.duration })),
    },
    null,
    2,
  ) + "\n",
);
await writeFile(new URL("skins.svg", output), svg);
const samples = Array.from({ length: 61 }, (_, i) => {
  const phase = i / 60,
    reference = sampleRunRig(sideRig, phase);
  applyBenPose(model, "Run", phase);
  const hip = model.bones.rightThigh.getWorldPosition(new THREE.Vector3()),
    knee = model.bones.rightShin.getWorldPosition(new THREE.Vector3()),
    ankle = model.bones.rightFoot.getWorldPosition(new THREE.Vector3()),
    foot = sampleRunFoot(phase);
  return {
    rightKneeFlexDegrees:
      180 -
      THREE.MathUtils.radToDeg(
        hip.clone().sub(knee).angleTo(ankle.clone().sub(knee)),
      ),
    ankleTargetError: ankle.distanceTo(
      new THREE.Vector3(model.rest.rightFoot.x, foot.y, foot.z),
    ),
    phase,
    sourceWaistDelta: sideRig.root[1] - reference.root[1],
    modelWaistDelta:
      model.bones.pelvis.position.y -
      (model.rest.pelvis.y + config.run.pelvisOffset),
    modelPelvisY: model.bones.pelvis.position.y,
    sourceTorsoDegrees: (reference.torsoAngle * 180) / Math.PI,
    modelTorsoDegrees: (model.bones.spine.rotation.x * 180) / Math.PI,
    nearStance: sampleRunFoot(phase).stance,
    farStance: sampleRunFoot(phase + 0.5).stance,
    sourceNearStance: reference.nearFoot.stance,
    sourceFarStance: reference.farFoot.stance,
  };
});
await mkdir(new URL("review/", output), { recursive: true });
await writeFile(
  new URL("review/run-body-motion.json", output),
  JSON.stringify(
    {
      reference: "source/ben-side-rig.json",
      bobAmplitude: sideRig.torso.bobAmplitude,
      bobLag: sideRig.torso.bobLag,
      stanceFraction: sideRig.stride.stanceFraction,
      runPelvisOffset: config.run.pelvisOffset,
      strideHalfLength: config.run.strideHalfLength,
      recoveryLift: config.run.recoveryLift,
      maxKneeFlexDegrees: Math.max(
        ...samples.map((s) => s.rightKneeFlexDegrees),
      ),
      maxAnkleTargetError: Math.max(...samples.map((s) => s.ankleTargetError)),
      maxWaistError: Math.max(
        ...samples.map((s) => Math.abs(s.sourceWaistDelta - s.modelWaistDelta)),
      ),
      maxTorsoDegreesError: Math.max(
        ...samples.map((s) =>
          Math.abs(s.sourceTorsoDegrees - s.modelTorsoDegrees),
        ),
      ),
      samples,
    },
    null,
    2,
  ) + "\n",
);
model.dispose();
console.log(
  `Exported rigged Ben: ${config.bones.length} bones, ${clips.length} clips, ${(glb.byteLength / 1024).toFixed(0)} KiB GLB.`,
);
