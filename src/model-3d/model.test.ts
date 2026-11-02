// Checks volumetric anatomy, deformation, attachment placement and exported skeletal animation.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { installThreeToolRuntime } from "../../scripts/three-runtime.ts";
import { createBenModel } from "./model.ts";
import {
  applyBenPose,
  createBenClips,
  poseNames,
  serialisePose,
  sampleRunFoot,
} from "./poses.ts";
import { cycleProfile } from "./equipment.ts";
import config from "../../source/ben-3d.json";

installThreeToolRuntime();
const model = createBenModel(
  readFileSync(
    new URL("../../source/ben-3d-skins.svg", import.meta.url),
    "utf8",
  ),
);
afterAll(() => model.dispose());
describe("Ben volumetric character", () => {
  test("head, torso, shoes and helmet have real depth and calibrated standing height", () => {
    applyBenPose(model, "Standing");
    for (const name of ["Head", "Shirt_torso", "right_shoe", "Helmet_dome"]) {
      const mesh = model.meshes.find((mesh) => mesh.name === name)!;
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
      expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(0.9);
      expect(size.z).toBeGreaterThan(4);
    }
    const bounds = new THREE.Box3();
    for (const mesh of model.meshes)
      if (!mesh.name.startsWith("Phone")) {
        mesh.computeBoundingBox();
        bounds.union(mesh.boundingBox!);
      }
    expect(bounds.min.y).toBeCloseTo(config.floorY, 3);
    expect(bounds.max.y).toBeCloseTo(config.crownY + 0.13, 1);
  });
  test("every vertex has finite normalised weights referring to the shared 21-bone rig", () => {
    expect(model.skeleton.bones).toHaveLength(21);
    for (const mesh of model.meshes) {
      expect(mesh.skeleton).toBe(model.skeleton);
      const weights = mesh.geometry.getAttribute("skinWeight"),
        indices = mesh.geometry.getAttribute("skinIndex");
      for (let i = 0; i < weights.count; i++) {
        expect(
          weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i),
        ).toBeCloseTo(1, 5);
        expect(indices.getX(i)).toBeLessThan(21);
        expect(indices.getY(i)).toBeLessThan(21);
      }
    }
  });
  test("toe bending deforms the sole without moving its heel", () => {
    applyBenPose(model, "Standing");
    const sole = model.meshes.find((mesh) => mesh.name === "right_shoe")!,
      vertices = sole.geometry.getAttribute("position");
    let front = 0,
      back = 0;
    for (let i = 0; i < vertices.count; i++) {
      if (vertices.getZ(i) > vertices.getZ(front)) front = i;
      if (vertices.getZ(i) < vertices.getZ(back)) back = i;
    }
    const beforeFront = sole.getVertexPosition(front, new THREE.Vector3()),
      beforeBack = sole.getVertexPosition(back, new THREE.Vector3());
    model.bones.rightToe.rotation.x = 0.35;
    model.root.updateMatrixWorld(true);
    model.skeleton.update();
    expect(
      sole
        .getVertexPosition(front, new THREE.Vector3())
        .distanceTo(beforeFront),
    ).toBeGreaterThan(0.5);
    expect(
      sole.getVertexPosition(back, new THREE.Vector3()).distanceTo(beforeBack),
    ).toBeLessThan(0.0001);
  });
  test("phone pose places both hands beside the phone and restores its hidden attachment", () => {
    applyBenPose(model, "Phone");
    for (const [side, x] of [
      ["right", -1.3],
      ["left", 1.3],
    ] as const)
      expect(
        model.bones[side + "Hand"]
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(new THREE.Vector3(x, 16, 4.8)),
      ).toBeLessThan(0.01);
    expect(model.bones.phone.scale.x).toBe(1);
    applyBenPose(model, "Standing");
    expect(model.bones.phone.scale.x).toBe(0);
  });
  test("run closes its loop and all poses preserve finite bone transforms", () => {
    applyBenPose(model, "Run", 0);
    const first = serialisePose(model);
    applyBenPose(model, "Run", 1);
    const last = serialisePose(model);
    for (const name of Object.keys(first.bones)) {
      first.bones[name].quaternion.forEach((value, i) =>
        expect(last.bones[name].quaternion[i]).toBeCloseTo(value, 5),
      );
      first.bones[name].position.forEach((value, i) =>
        expect(last.bones[name].position[i]).toBeCloseTo(value, 5),
      );
    }
    for (const pose of poseNames) {
      applyBenPose(model, pose, 0.25);
      for (const bone of model.skeleton.bones)
        expect(bone.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }
  });
  test("shirt, jeans and arms remain connected surfaces across their joints", () => {
    for (const name of [
      "Shirt_torso",
      "Jeans_continuous",
      "right_arm_continuous",
      "left_arm_continuous",
      "right_shoe",
      "left_shoe",
    ]) {
      const geometry = model.meshes.find(
          (mesh) => mesh.name === name,
        )!.geometry,
        index = geometry.index!,
        count = geometry.getAttribute("position").count,
        parent = Uint32Array.from({ length: count }, (_, i) => i);
      const root = (value: number): number => {
        while (parent[value] !== value) {
          parent[value] = parent[parent[value]];
          value = parent[value];
        }
        return value;
      };
      for (let i = 0; i < index.count; i += 3) {
        const a = root(index.getX(i)),
          b = root(index.getX(i + 1)),
          c = root(index.getX(i + 2));
        parent[b] = a;
        parent[c] = a;
      }
      expect(new Set(Array.from(parent, (_, i) => root(i))).size).toBe(1);
    }
  });
  test("running-shoe colour regions share their seam vertices and the body stays lean", () => {
    const shoe = model.meshes.find(
        (mesh) => mesh.name === "right_shoe",
      )!.geometry,
      index = shoe.index!,
      groups = shoe.groups;
    expect(groups).toHaveLength(2);
    const vertices = groups.map((group) => {
      const set = new Set<number>();
      for (let i = group.start; i < group.start + group.count; i++)
        set.add(index.getX(i));
      return set;
    });
    expect(
      [...vertices[0]].filter((i) => vertices[1].has(i)).length,
    ).toBeGreaterThan(100);
    const shirt = model.meshes.find(
      (mesh) => mesh.name === "Shirt_torso",
    )!.geometry;
    shirt.computeBoundingBox();
    expect(shirt.boundingBox!.getSize(new THREE.Vector3()).x).toBeLessThan(11);
  });
  test("cycling vents are actual openings and the central roof rib is solid", () => {
    applyBenPose(model, "Standing");
    const helmet = model.meshes.find((mesh) => mesh.name === "Helmet_dome")!,
      z = -2.0,
      x = cycleProfile(z).width * Math.sin(0.32);
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(x, 40, z),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(helmet),
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(0, 40, z),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(helmet).length,
    ).toBeGreaterThan(0);
  });
  test("hair conforms to the skull and the sewn collar has an open neckline", () => {
    applyBenPose(model, "Standing");
    const hair = model.meshes
      .find((mesh) => mesh.name === "Brown_blond_hair")!
      .geometry.getAttribute("position");
    for (let i = 0; i < hair.count; i++) {
      const distance = Math.hypot(
        hair.getX(i) / 4.15,
        (hair.getY(i) - 23.2) / 3.3,
        (hair.getZ(i) - 0.2) / 3.65,
      );
      expect(distance).toBeGreaterThanOrEqual(1);
      expect(distance).toBeLessThan(1.03);
    }
    const collar = model.meshes.find(
      (mesh) => mesh.name === "White_shirt_collar",
    )!;
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(0, 25, 0),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(collar),
    ).toHaveLength(0);
  });
  test("running plants each foot backwards and recovers it forwards with forward knees", () => {
    let previous = Infinity;
    for (const phase of [0, 0.1, 0.2, 0.3, 0.4]) {
      const foot = sampleRunFoot(phase);
      expect(foot.stance).toBe(true);
      expect(foot.z).toBeLessThan(previous);
      previous = foot.z;
      applyBenPose(model, "Run", phase);
      const ankle = model.bones.rightFoot.getWorldPosition(new THREE.Vector3());
      expect(
        ankle.distanceTo(
          new THREE.Vector3(model.rest.rightFoot.x, foot.y, foot.z),
        ),
      ).toBeLessThan(0.02);
      const hip = model.bones.rightThigh.getWorldPosition(new THREE.Vector3()),
        knee = model.bones.rightShin.getWorldPosition(new THREE.Vector3()),
        along = (hip.z + ankle.z) / 2;
      expect(knee.z).toBeGreaterThan(along - 0.05);
    }
    previous = -Infinity;
    for (const phase of [0.5, 0.6, 0.7, 0.8, 0.9]) {
      const foot = sampleRunFoot(phase);
      expect(foot.stance).toBe(false);
      expect(foot.z).toBeGreaterThan(previous);
      previous = foot.z;
    }
    expect(
      Math.abs(
        sampleRunFoot(0.5 - 0.0001).toe - sampleRunFoot(0.5 + 0.0001).toe,
      ),
    ).toBeLessThan(0.1);
    expect(sampleRunFoot(0.75).y).toBeGreaterThan(sampleRunFoot(0.25).y + 1.5);
  });
  test("GLB round trip retains skinned geometry, bones, clips and phone visibility tracks", async () => {
    const clips = createBenClips(model);
    const binary = await new GLTFExporter().parseAsync(model.root, {
      binary: true,
      animations: clips,
      onlyVisible: false,
    });
    expect(binary instanceof ArrayBuffer).toBe(true);
    const imported = await new GLTFLoader().parseAsync(
      binary as ArrayBuffer,
      "",
    );
    expect(imported.animations.map((clip) => clip.name)).toEqual(
      poseNames.filter((name) => name !== "Standing"),
    );
    let skinned = 0;
    imported.scene.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) {
        skinned++;
        expect(node.skeleton.bones).toHaveLength(21);
        node.geometry.dispose();
      }
    });
    expect(skinned).toBeGreaterThanOrEqual(model.meshes.length);
    expect(
      imported.animations
        .find((clip) => clip.name === "Phone")!
        .tracks.some(
          (track) => track.name === "phone.scale" && track.values[0] === 1,
        ),
    ).toBe(true);
  });
});
