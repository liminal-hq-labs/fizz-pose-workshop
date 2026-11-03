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
  poseDuration,
} from "./poses.ts";
import { helmetOuter, helmetVents } from "./equipment.ts";
import { craniumField, hairThickness, headField } from "./head.ts";
import sideRig from "../../source/ben-side-rig.json";
import { sampleRunRig } from "../rig/run.ts";
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
    // The shell crown stays at the calibrated sprite crown; only the thin stripe stands proud of it.
    const helmet = model.meshes.find((mesh) => mesh.name === "Helmet_dome")!;
    helmet.computeBoundingBox();
    expect(helmet.boundingBox!.max.y).toBeCloseTo(config.crownY, 1);
    expect(bounds.max.y).toBeGreaterThanOrEqual(config.crownY);
    expect(bounds.max.y).toBeLessThan(config.crownY + 0.1);
  });
  test("every vertex has finite normalised weights referring to the shared skeletal rig", () => {
    expect(model.skeleton.bones).toHaveLength(config.bones.length);
    for (const mesh of model.meshes) {
      expect(mesh.skeleton).toBe(model.skeleton);
      const weights = mesh.geometry.getAttribute("skinWeight"),
        indices = mesh.geometry.getAttribute("skinIndex");
      for (let i = 0; i < weights.count; i++) {
        expect(
          weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i),
        ).toBeCloseTo(1, 5);
        expect(indices.getX(i)).toBeLessThan(config.bones.length);
        expect(indices.getY(i)).toBeLessThan(config.bones.length);
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
      vent = helmetVents.find((v) => v.x > 0 && v.back < z && v.front > z)!,
      x = vent.x;
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
  test("hair hugs the skull, the helmet clears it and the collar belongs to an open shirt neckline", () => {
    applyBenPose(model, "Standing");
    const hair = model.meshes
      .find((mesh) => mesh.name === "Brown_blond_hair")!
      .geometry.getAttribute("position");
    for (let i = 0; i < hair.count; i++) {
      const d = headField(hair.getX(i), hair.getY(i), hair.getZ(i));
      expect(d).toBeGreaterThan(-0.26);
      expect(d).toBeLessThan(hairThickness + 0.01);
    }
    // About one unit of shell and foam between the top of the skull and the outer crown.
    const skullTop = config.head.centre[1] + config.head.radii[1];
    expect(config.crownY - skullTop).toBeGreaterThan(0.85);
    expect(config.crownY - skullTop).toBeLessThan(1.2);
    for (const [x, y, z] of [
      [0, skullTop + 0.2, -0.35],
      [3.2, 26.5, -0.35],
      [0, 27.6, 3.3],
    ])
      expect(craniumField(x, y, z)).toBeGreaterThan(0);
    expect(helmetOuter(0, config.crownY - 0.02, -0.4)).toBeLessThan(0);
    // The collar is a white band in the shirt surface, not a separate ring.
    expect(
      model.meshes.some(
        (mesh) => /collar/i.test(mesh.name) && mesh.name !== "Collar_sewn_edge",
      ),
    ).toBe(false);
    const shirt = model.meshes.find((mesh) => mesh.name === "Shirt_torso")!,
      colours = shirt.geometry.getAttribute("color"),
      positions = shirt.geometry.getAttribute("position");
    let white = 0,
      low = Infinity,
      high = -Infinity;
    for (let i = 0; i < colours.count; i++)
      if (
        colours.getX(i) > 0.8 &&
        colours.getY(i) > 0.8 &&
        positions.getY(i) > 19.5
      ) {
        white++;
        low = Math.min(low, positions.getY(i));
        high = Math.max(high, positions.getY(i));
      }
    expect(white).toBeGreaterThan(200);
    expect(high - low).toBeGreaterThan(0.8);
    expect(high - low).toBeLessThan(1.6);
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 25, -0.2),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(shirt);
    expect(hits.every((hit) => hit.point.y < 19.6)).toBe(true);
  });
  test("proportions read as a more realistic Ben with the Stunner on his right hip", () => {
    applyBenPose(model, "Standing");
    const box = (name: string): THREE.Box3 => {
      const result = new THREE.Box3();
      for (const mesh of model.meshes.filter((m) => m.name === name)) {
        mesh.geometry.computeBoundingBox();
        result.union(mesh.geometry.boundingBox!);
      }
      return result;
    };
    const head = box("Head"),
      shirt = box("Shirt_torso"),
      shoe = box("right_shoe"),
      neck = box("Neck"),
      arm = box("right_arm_continuous"),
      heads = (config.crownY - config.floorY) / (config.crownY - head.min.y);
    expect(heads).toBeGreaterThan(3.4);
    expect(heads).toBeLessThan(3.6);
    // Shirt shoulders are wider than the helmet, which is wider than the face.
    const helmet = box("Helmet_dome"),
      faceWidth = head.max.x - head.min.x;
    expect(shirt.max.x - shirt.min.x).toBeGreaterThan(
      helmet.max.x - helmet.min.x,
    );
    expect(helmet.max.x - helmet.min.x).toBeGreaterThan(faceWidth);
    expect(faceWidth).toBeLessThan(config.torso.size[0]);
    // A visible neck between the collar band and the jaw.
    expect(head.min.y - 21.05).toBeGreaterThan(0.7);
    expect(neck.max.y - neck.min.y).toBeGreaterThan(4);
    const r = model.rest,
      thigh = r.rightThigh.distanceTo(r.rightShin),
      shin = r.rightShin.distanceTo(r.rightFoot);
    expect(thigh).toBeGreaterThan(shin);
    expect(thigh).toBeGreaterThan(3.9);
    expect(shin).toBeGreaterThan(3.6);
    expect(shoe.max.z - shoe.min.z).toBeGreaterThan(6.5);
    expect(shoe.max.z - shoe.min.z).toBeLessThan(7.1);
    // Hands reach well below the wrist, with room for four fingers and a thumb.
    expect(r.rightHand.y - arm.min.y).toBeGreaterThan(2.3);
    for (const mesh of model.meshes.filter((m) =>
      m.name.startsWith("Stunner"),
    )) {
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.max.x).toBeLessThan(0);
    }
  });
  test("disposing the model releases every geometry and material", () => {
    const spare = createBenModel(
      readFileSync(
        new URL("../../source/ben-3d-skins.svg", import.meta.url),
        "utf8",
      ),
    );
    const disposed = new Set<object>(),
      geometries = new Set(spare.meshes.map((mesh) => mesh.geometry)),
      materials = new Set(
        spare.meshes.flatMap((mesh) =>
          Array.isArray(mesh.material) ? mesh.material : [mesh.material],
        ),
      );
    for (const item of [...geometries, ...materials])
      item.addEventListener("dispose", () => disposed.add(item));
    spare.dispose();
    expect(disposed.size).toBe(geometries.size + materials.size);
    for (const material of materials)
      for (const value of Object.values(material))
        expect(value instanceof THREE.Texture).toBe(false);
  }, 60_000);
  test("running plants each foot backwards and recovers it forwards with forward knees", () => {
    let previous = Infinity;
    for (const phase of [0, 0.04, 0.08, 0.12, 0.16, 0.2]) {
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
    for (const phase of [0.45, 0.55, 0.65, 0.75, 0.85]) {
      const foot = sampleRunFoot(phase);
      expect(foot.stance).toBe(false);
      expect(foot.z).toBeGreaterThan(previous);
      previous = foot.z;
    }
    expect(
      Math.abs(
        sampleRunFoot(sideRig.stride.stanceFraction - 0.0001).toe -
          sampleRunFoot(sideRig.stride.stanceFraction + 0.0001).toe,
      ),
    ).toBeLessThan(0.1);
    expect(sampleRunFoot(0.75).y).toBeGreaterThan(sampleRunFoot(0.1).y + 1.5);
  });
  test("3D waist bob, torso pitch and contact phases follow the continuous sprite rig", () => {
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i <= 60; i++) {
      const time = i / 60,
        reference = sampleRunRig(sideRig, time);
      applyBenPose(model, "Run", time);
      const bob =
        model.bones.pelvis.position.y -
        (model.rest.pelvis.y + config.run.pelvisOffset);
      expect(bob).toBeCloseTo(sideRig.root[1] - reference.root[1], 6);
      expect(model.bones.spine.rotation.x).toBeCloseTo(reference.torsoAngle, 6);
      expect(sampleRunFoot(time).stance).toBe(reference.nearFoot.stance);
      expect(sampleRunFoot(time + 0.5).stance).toBe(reference.farFoot.stance);
      low = Math.min(low, bob);
      high = Math.max(high, bob);
    }
    expect(high - low).toBeGreaterThan(1.45);
  });
  test("shirt hem stays anchored to the pelvis as the torso leans and bobs", () => {
    const shirt = model.meshes.find((mesh) => mesh.name === "Shirt_torso")!,
      positions = shirt.geometry.getAttribute("position"),
      hem = Array.from({ length: positions.count }, (_, i) => i).filter(
        (i) => positions.getY(i) < 11.15,
      );
    expect(hem.length).toBeGreaterThan(10);
    const inverse =
      model.skeleton.boneInverses[
        model.skeleton.bones.indexOf(model.bones.pelvis)
      ];
    for (const time of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
      applyBenPose(model, "Run", time);
      for (const i of hem) {
        const expected = new THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(inverse)
          .applyMatrix4(model.bones.pelvis.matrixWorld);
        expect(
          shirt.getVertexPosition(i, new THREE.Vector3()).distanceTo(expected),
        ).toBeLessThan(0.0001);
      }
    }
  });
  test("run knees keep volume, bone lengths and a reachable fluid path", () => {
    const pants = model.meshes.find(
        (mesh) => mesh.name === "Jeans_continuous",
      )!,
      positions = pants.geometry.getAttribute("position"),
      ring = Array.from({ length: positions.count }, (_, i) => i).filter(
        (i) =>
          Math.abs(positions.getY(i) - model.rest.rightShin.y) < 0.12 &&
          positions.getX(i) < -0.8,
      );
    expect(ring.length).toBeGreaterThan(10);
    let previous: THREE.Quaternion | null = null;
    for (let i = 0; i <= 180; i++) {
      const phase = i / 180;
      applyBenPose(model, "Run", phase);
      const hip = model.bones.rightThigh.getWorldPosition(new THREE.Vector3()),
        knee = model.bones.rightShin.getWorldPosition(new THREE.Vector3()),
        ankle = model.bones.rightFoot.getWorldPosition(new THREE.Vector3()),
        foot = sampleRunFoot(phase),
        flex =
          180 -
          THREE.MathUtils.radToDeg(
            hip.clone().sub(knee).angleTo(ankle.clone().sub(knee)),
          );
      expect(flex).toBeLessThan(130);
      expect(
        ankle.distanceTo(
          new THREE.Vector3(model.rest.rightFoot.x, foot.y, foot.z),
        ),
      ).toBeLessThan(0.001);
      expect(hip.distanceTo(knee)).toBeCloseTo(
        model.bones.rightShin.position.length(),
        5,
      );
      expect(knee.distanceTo(ankle)).toBeCloseTo(
        model.bones.rightFoot.position.length(),
        5,
      );
      if (previous)
        expect(previous.angleTo(model.bones.rightShin.quaternion)).toBeLessThan(
          0.14,
        );
      previous = model.bones.rightShin.quaternion.clone();
      for (const vertex of ring) {
        const rest = new THREE.Vector3()
            .fromBufferAttribute(positions, vertex)
            .distanceTo(model.rest.rightShin),
          posed = pants
            .getVertexPosition(vertex, new THREE.Vector3())
            .distanceTo(knee);
        expect(posed / rest).toBeGreaterThan(0.88);
      }
    }
  });
  test("ankle cuffs retain their width where they enter the shoes", () => {
    const p = model.meshes
        .find((mesh) => mesh.name === "Jeans_continuous")!
        .geometry.getAttribute("position"),
      xs = Array.from({ length: p.count }, (_, i) => i)
        .filter(
          (i) =>
            p.getY(i) > model.rest.rightFoot.y - 0.1 &&
            p.getY(i) < model.rest.rightFoot.y + 0.3 &&
            p.getX(i) < 0,
        )
        .map((i) => p.getX(i));
    expect(xs.length).toBeGreaterThan(10);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.8);
  });
  test("firing and both look actions move, loop and export real animation tracks", () => {
    for (const pose of ["Firing", "Look up", "Look down"] as const) {
      expect(poseDuration(pose)).toBeGreaterThan(0);
      applyBenPose(model, pose, 0);
      const start = serialisePose(model);
      applyBenPose(model, pose, 0.44);
      const middle = serialisePose(model);
      expect(JSON.stringify(middle.bones)).not.toBe(
        JSON.stringify(start.bones),
      );
      applyBenPose(model, pose, 1);
      expect(serialisePose(model)).toEqual(start);
    }
    applyBenPose(model, "Firing", 0.44);
    expect(model.bones.muzzleFlash.scale.x).toBeGreaterThan(0.9);
    applyBenPose(model, "Standing");
    expect(model.bones.muzzleFlash.scale.x).toBe(0);
    const clips = createBenClips(model);
    for (const name of ["Firing", "Look up", "Look down"]) {
      const clip = clips.find((c) => c.name === name)!;
      expect(clip.tracks[0].times.length).toBeGreaterThan(20);
      expect(
        clip.tracks.some((track) => {
          const size = track.getValueSize();
          return [...track.values].some(
            (value, i) => Math.abs(value - track.values[i % size]) > 0.001,
          );
        }),
      ).toBe(true);
    }
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
        expect(node.skeleton.bones).toHaveLength(config.bones.length);
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
