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
  firing,
  ladder,
  ladderRungs,
  runTwist,
} from "./poses.ts";
import { palmCentre, stunnerTip } from "./stunner.ts";
import { helmetOuter, helmetVents } from "./equipment.ts";
import {
  craniumField,
  defaultHeadStyle,
  hairThickness,
  hairline,
  headStyles,
} from "./head.ts";
const headField = defaultHeadStyle.field;
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
    // Measured in the phone's own frame: screen towards -z (Ben), back towards +z.
    const toPhone = model.bones.phone.matrixWorld.clone().invert(),
      // The body less a thin skin, so pads resting on the glass or the back count as contact, not overlap.
      inside = new THREE.Box3(
        new THREE.Vector3(-1.02, -1.67, -0.14),
        new THREE.Vector3(1.02, 1.67, 0.09),
      );
    for (const side of ["right", "left"] as const) {
      const arm = model.meshes.find(
          (mesh) => mesh.name === side + "_arm_continuous",
        )!,
        positions = arm.geometry.getAttribute("position"),
        p = new THREE.Vector3();
      let onScreen = 0,
        behind = 0;
      for (let i = 0; i < positions.count; i++) {
        arm.getVertexPosition(i, p).applyMatrix4(toPhone);
        // No part of the hand or forearm passes through the phone body.
        expect(inside.containsPoint(p)).toBe(false);
        const overFace = Math.abs(p.x) < 1.0 && Math.abs(p.y) < 1.7;
        if (overFace && p.z < -0.25) onScreen++;
        if (overFace && p.z > 0.2) behind++;
      }
      // The thumb is over the screen, facing Ben, and the palm and fingers hold the back.
      expect(onScreen).toBeGreaterThan(20);
      expect(behind).toBeGreaterThan(200);
      const thumbs = model.bones[side + "Thumb"]
        .getWorldPosition(new THREE.Vector3())
        .applyMatrix4(toPhone);
      expect(Math.abs(thumbs.x)).toBeGreaterThan(1.0);
    }
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
    expect(groups).toHaveLength(3);
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
        (mesh) => /collar/i.test(mesh.name) && !mesh.name.endsWith("_edge"),
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
    // The opening's floor lies just below the collar band, hidden inside the neck.
    expect(hits.every((hit) => hit.point.y < 20.7)).toBe(true);
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

    // A visible neck between the collar band and the jaw.
    expect(head.min.y - 21.05).toBeGreaterThan(0.7);
    expect(neck.max.y - neck.min.y).toBeGreaterThan(4);
    const r = model.rest,
      thigh = r.rightThigh.distanceTo(r.rightShin),
      shin = r.rightShin.distanceTo(r.rightFoot);
    expect(thigh).toBeGreaterThan(shin);
    expect(thigh).toBeGreaterThan(3.9);
    expect(shin).toBeGreaterThan(3.6);
    expect(shoe.max.z - shoe.min.z).toBeGreaterThan(5.8);
    expect(shoe.max.z - shoe.min.z).toBeLessThan(6.4);
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
    applyBenPose(model, "Firing", firing.fire);
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
  test("shoes are red over the top and toe, with a white toe cap and sole and a grey underside", () => {
    applyBenPose(model, "Standing");
    const shoe = model.meshes.find((mesh) => mesh.name === "right_shoe")!,
      colours = (shoe.material as THREE.MeshPhysicalMaterial[]).map((m) =>
        m.color.getHexString(),
      ),
      x = model.rest.rightFoot.x,
      hit = (from: THREE.Vector3, direction: THREE.Vector3): string =>
        colours[
          new THREE.Raycaster(from, direction.normalize()).intersectObject(
            shoe,
          )[0].face!.materialIndex
        ];
    expect(colours).toEqual(["aa0000", "ffffff", "aaaaaa"]);
    // Red over the instep, with the white rubber cap wrapping over the top of the toe.
    for (const z of [-0.5, 1, 2.2])
      expect(
        hit(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)),
      ).toBe("aa0000");
    expect(
      hit(
        new THREE.Vector3(x, 10, config.shoes.toeZ - 0.35),
        new THREE.Vector3(0, -1, 0),
      ),
    ).toBe("ffffff");
    expect(
      hit(new THREE.Vector3(x, 0.45, 20), new THREE.Vector3(0, 0, -1)),
    ).toBe("ffffff");
    expect(
      hit(new THREE.Vector3(x + 5, -0.2, 1), new THREE.Vector3(-1, 0, 0)),
    ).toBe("ffffff");
    expect(hit(new THREE.Vector3(x, -10, 1), new THREE.Vector3(0, 1, 0))).toBe(
      "aaaaaa",
    );
    for (const lace of model.meshes.filter((m) => m.name === "right_lace"))
      expect(
        (lace.material as THREE.MeshPhysicalMaterial).color.getHexString(),
      ).not.toBe("ffffff");
  });
  test("sleeves stay on the upper arms through raised, swinging and bent poses", () => {
    const shirt = model.meshes.find((mesh) => mesh.name === "Shirt_torso")!,
      positions = shirt.geometry.getAttribute("position"),
      weights = shirt.geometry.getAttribute("skinWeight"),
      indices = shirt.geometry.getAttribute("skinIndex");
    for (const side of ["right", "left"] as const) {
      const bone = model.skeleton.bones.indexOf(model.bones[side + "UpperArm"]),
        shoulder = model.rest[side + "UpperArm"],
        elbow = model.rest[side + "Forearm"],
        axis = elbow.clone().sub(shoulder).normalize(),
        hem: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        const v = new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .sub(shoulder),
          along = v.dot(axis);
        if (
          along > 1.9 &&
          v.clone().addScaledVector(axis, -along).length() < 1.1
        )
          hem.push(i);
      }
      expect(hem.length).toBeGreaterThan(40);
      // The sleeve tube is skinned rigidly to the upper arm.
      for (const i of hem) {
        let share = 0;
        for (let k = 0; k < 4; k++)
          if (indices.getComponent(i, k) === bone)
            share += weights.getComponent(i, k);
        expect(share).toBeGreaterThan(0.99);
      }
      for (const [pose, phase] of [
        ["Run", 0.25],
        ["Run", 0.75],
        ["Climb", 0.3],
        ["Jump", 0.3],
        ["Firing", firing.fire],
        ["Phone", 0],
        ["Fall", 0.5],
      ] as const) {
        applyBenPose(model, pose, phase);
        const s = model.bones[side + "UpperArm"].getWorldPosition(
            new THREE.Vector3(),
          ),
          e = model.bones[side + "Forearm"].getWorldPosition(
            new THREE.Vector3(),
          ),
          line = new THREE.Line3(s, e),
          closest = new THREE.Vector3();
        for (const i of hem) {
          const p = shirt.getVertexPosition(i, new THREE.Vector3());
          line.closestPointToPoint(p, true, closest);
          expect(closest.distanceTo(p)).toBeLessThan(1.3);
        }
      }
    }
  });
  test("the run counter-rotates hips and shoulders as the arms swing", () => {
    let low = Infinity,
      high = -Infinity;
    const yaw = (a: THREE.Vector3, b: THREE.Vector3): number =>
      THREE.MathUtils.radToDeg(Math.atan2(-(b.z - a.z), b.x - a.x));
    for (let i = 0; i < 60; i++) {
      applyBenPose(model, "Run", i / 60);
      const shoulders = yaw(
          model.bones.rightUpperArm.getWorldPosition(new THREE.Vector3()),
          model.bones.leftUpperArm.getWorldPosition(new THREE.Vector3()),
        ),
        hips = yaw(
          model.bones.rightThigh.getWorldPosition(new THREE.Vector3()),
          model.bones.leftThigh.getWorldPosition(new THREE.Vector3()),
        ),
        rightArm = model.bones.rightHand.getWorldPosition(
          new THREE.Vector3(),
        ).z;
      low = Math.min(low, shoulders);
      high = Math.max(high, shoulders);
      // Shoulders and hips turn opposite ways, and the right shoulder leads when the right hand swings forward.
      if (Math.abs(shoulders) > 4)
        expect(Math.sign(hips)).toBe(-Math.sign(shoulders));
      if (shoulders > 8) expect(rightArm).toBeGreaterThan(0);
    }
    expect(high - low).toBeGreaterThan(1.6 * runTwist.shoulders);
  });
  test("firing draws the Stunner from the right hip, fires it forward and reholsters", () => {
    const tip = (): THREE.Vector3 =>
      model.bones.muzzleFlash.getWorldPosition(new THREE.Vector3());
    applyBenPose(model, "Standing");
    const holstered = tip(),
      gun = model.bones.stunner.getWorldPosition(new THREE.Vector3());
    applyBenPose(model, "Firing", 0.04);
    expect(tip().distanceTo(holstered)).toBeLessThan(0.01);
    applyBenPose(model, "Firing", firing.fire);
    const fired = tip(),
      palm = palmCentre
        .clone()
        .applyQuaternion(
          model.bones.rightHand.getWorldQuaternion(new THREE.Quaternion()),
        )
        .add(model.bones.rightHand.getWorldPosition(new THREE.Vector3()));
    expect(fired.z).toBeGreaterThan(6);
    expect(fired.y).toBeGreaterThan(15);
    expect(
      model.bones.stunner
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(palm),
    ).toBeLessThan(1.4);
    expect(model.bones.muzzleFlash.scale.x).toBeGreaterThan(0.9);
    applyBenPose(model, "Firing", 0.99);
    expect(
      model.bones.stunner.getWorldPosition(new THREE.Vector3()).distanceTo(gun),
    ).toBeLessThan(0.01);
    expect(stunnerTip.z).toBeGreaterThan(2);
  });
  test("climbing hands hold rungs and feet stand on them", () => {
    for (const phase of [0.55, 0.7, 0.85]) {
      applyBenPose(model, "Climb", phase);
      const rungs = ladderRungs(phase),
        palm = palmCentre
          .clone()
          .applyQuaternion(
            model.bones.rightHand.getWorldQuaternion(new THREE.Quaternion()),
          )
          .add(model.bones.rightHand.getWorldPosition(new THREE.Vector3()));
      expect(Math.abs(palm.z - ladder.z)).toBeLessThan(0.45);
      expect(Math.min(...rungs.map((y) => Math.abs(palm.y - y)))).toBeLessThan(
        0.9,
      );
      const ankle = model.bones.leftFoot.getWorldPosition(new THREE.Vector3());
      expect(
        Math.min(...rungs.map((y) => Math.abs(ankle.y - 2.1 - y))),
      ).toBeLessThan(0.05);
    }
  });
  test("the neck is short and sturdy, and the skull and jaw rest on it", () => {
    applyBenPose(model, "Standing");
    const neck = model.meshes.find((mesh) => mesh.name === "Neck")!.geometry,
      positions = neck.getAttribute("position");
    let width = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      if (Math.abs(y - 21.2) < 0.3) width = Math.max(width, 2 * Math.abs(x));
      // The top of the neck is buried in the head, at the jaw and behind it under the skull.
      if (y > 23.6) expect(headField(x, y, z)).toBeLessThan(0);
    }
    expect(width).toBeGreaterThan(2.8);
  });
  test("the belt wraps the waistband with no gap at any angle", () => {
    applyBenPose(model, "Standing");
    const belt = model.meshes.find((mesh) => mesh.name === "Belt")!,
      jeans = model.meshes.find((mesh) => mesh.name === "Jeans_continuous")!;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2,
        inward = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)),
        from = inward.clone().multiplyScalar(-10).setY(11.25),
        ray = new THREE.Raycaster(from, inward),
        beltHits = ray.intersectObject(belt),
        jeansHit = ray.intersectObject(jeans)[0];
      expect(beltHits.length).toBeGreaterThan(0);
      // The belt's outer face stands one belt thickness off the waistband: it lies on it, with no daylight.
      const outer = beltHits[0].distance,
        standOff = jeansHit.distance - outer;
      expect(standOff).toBeGreaterThan(0.08);
      expect(standOff).toBeLessThan(0.22);
    }
  });
  test("every head style builds, fits the helmet and swaps without leaking geometry", () => {
    const spare = createBenModel(
      readFileSync(
        new URL("../../source/ben-3d-skins.svg", import.meta.url),
        "utf8",
      ),
    );
    try {
      applyBenPose(spare, "Standing");
      const count = spare.meshes.length,
        helmet = spare.meshes.find((mesh) => mesh.name === "Helmet_dome")!,
        isHeadPart = (mesh: THREE.SkinnedMesh): boolean =>
          mesh.userData.bone === "head" &&
          mesh.name !== "Helmet_dome" &&
          !mesh.name.startsWith("helmet-");
      helmet.geometry.computeBoundingBox();
      const helmetWidth =
        helmet.geometry.boundingBox!.max.x - helmet.geometry.boundingBox!.min.x;
      for (const style of [...headStyles.slice(1), headStyles[0]]) {
        const old = spare.meshes.filter(isHeadPart),
          released = new Set<object>();
        for (const mesh of old)
          mesh.geometry.addEventListener("dispose", () => released.add(mesh));
        spare.setHeadStyle(style.id);
        expect(spare.headStyle()).toBe(style.id);
        expect(released.size).toBe(old.length);
        const head = spare.meshes.find((mesh) => mesh.name === "Head")!;
        head.geometry.computeBoundingBox();
        const box = head.geometry.boundingBox!;
        expect(box.min.y).toBeGreaterThan(21.6);
        expect(box.min.y).toBeLessThan(22.7);
        expect(box.max.x - box.min.x).toBeLessThan(helmetWidth);
        // The skull stays under the fitted helmet in every style.
        expect(box.max.y).toBeLessThan(config.crownY - 0.85);
        expect(
          spare.meshes.filter((mesh) => mesh.name === "Helmet_front_strap"),
        ).toHaveLength(2);
      }
      expect(spare.headStyle()).toBe(defaultHeadStyle.id);
      expect(spare.meshes.length).toBe(count);
    } finally {
      spare.dispose();
    }
  }, 120_000);
  test("sleeves, hair and collar keep the skin beneath them covered in every pose", () => {
    // Snapshots of the posed surfaces, so each ray is a plain triangle test rather than per-vertex skinning.
    const snapshot = (mesh: THREE.SkinnedMesh): THREE.Mesh => {
      const geometry = mesh.geometry.clone(),
        positions = geometry.getAttribute("position"),
        p = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        mesh.getVertexPosition(i, p);
        positions.setXYZ(i, p.x, p.y, p.z);
      }
      geometry.deleteAttribute("skinIndex");
      geometry.deleteAttribute("skinWeight");
      // Fresh bounds: a cloned rest-pose box would make the raycaster skip posed triangles outside it.
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
    };
    const named = (name: string): THREE.SkinnedMesh =>
      model.meshes.find((mesh) => mesh.name === name)!;
    const restPositions = (name: string): THREE.BufferAttribute =>
      named(name).geometry.getAttribute("position") as THREE.BufferAttribute;
    const pick = (
      name: string,
      keep: (p: THREE.Vector3) => boolean,
      count: number,
    ): number[] => {
      const positions = restPositions(name),
        chosen: number[] = [],
        p = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++)
        if (keep(p.fromBufferAttribute(positions, i))) chosen.push(i);
      const step = Math.max(1, Math.floor(chosen.length / count));
      return chosen.filter((_, i) => i % step === 0).slice(0, count);
    };
    // Sleeve-covered arm skin: below the shoulder blend (where the cap stretches over the joint when the
    // arm is raised), clear of the cuff (where you can see a little way up the sleeve) and on the
    // outward-facing side, since inside the sleeve meets the torso.
    const arms = (["right", "left"] as const).map((side) => {
      const shoulder = model.rest[side + "UpperArm"],
        elbow = model.rest[side + "Forearm"],
        axis = elbow.clone().sub(shoulder),
        length = axis.length(),
        sign = side === "right" ? -1 : 1;
      axis.normalize();
      return {
        side,
        samples: pick(
          side + "_arm_continuous",
          (p) => {
            const along = p.clone().sub(shoulder).dot(axis),
              radial = p.clone().sub(shoulder).addScaledVector(axis, -along);
            return (
              along > 0.9 &&
              along < 0.6 * length - 0.7 &&
              radial.x * sign > -0.2 * radial.length()
            );
          },
          48,
        ),
      };
    });
    const scalp = pick(
      "Head",
      (p) => p.y > hairline(p.x, p.z) + 0.3 && p.y < 28,
      40,
    );
    // The neck: 64 sectors all the way round, at four heights from the shoulders below the collar up to
    // just under the collar top. Below the band is where a thin upper back once let the nape show.
    const neck = (() => {
      const positions = restPositions("Neck"),
        sectors = new Map<number, number>(),
        p = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i);
        const a = Math.atan2(p.x, p.z + 0.5),
          back = (1 - Math.cos(a)) / 2;
        const top = 21.05 + 0.6 * back - 0.2;
        if (p.y < 19.0 || p.y > top) continue;
        const band = Math.min(3, Math.floor(((p.y - 19.0) / (top - 19.0)) * 4)),
          sector =
            (Math.floor(((a + Math.PI) / (2 * Math.PI)) * 64) % 64) + 64 * band;
        if (!sectors.has(sector)) sectors.set(sector, i);
      }
      return [...sectors.values()];
    })();
    expect(neck.length).toBeGreaterThanOrEqual(240);
    // Covered when the first surface met on the way in is fabric or hair. Another part of the same body
    // (a forearm swinging in front of the upper arm, say) is an occluder, not a hole; skin and fabric
    // meeting within a hair's breadth is contact, drawn with the fabric in front.
    const covered = (
      origin: THREE.Vector3,
      target: THREE.Vector3,
      covers: THREE.Mesh[],
      skin: THREE.Mesh,
    ): boolean => {
      const hits = new THREE.Raycaster(
          origin,
          target.clone().sub(origin).normalize(),
        ).intersectObjects([...covers, skin]),
        hit = hits[0];
      if (!hit) return false;
      if (hit.object !== skin) return true;
      if (hit.point.distanceTo(target) > 0.08) return true;
      const cover = hits.find((h) => h.object !== skin);
      return !!cover && cover.distance - hit.distance < 0.06;
    };
    const label = (p: THREE.Vector3): string =>
      p
        .toArray()
        .map((v) => v.toFixed(2))
        .join(",");
    for (const [pose, phase] of [
      ["Standing", 0],
      ["Run", 0.25],
      ["Run", 0.75],
      ["Climb", 0.3],
      ["Fall", 0.5],
      ["Jump", 0.3],
      ["Firing", firing.fire],
      ["Phone", 0],
    ] as const) {
      applyBenPose(model, pose, phase);
      // Rolled hems and the collar seam are part of the covering fabric.
      const trim = model.meshes
          .filter((mesh) => /_rolled_|Collar_sewn_edge/.test(mesh.name))
          .map(snapshot),
        shirt = snapshot(named("Shirt_torso")),
        fabric = [shirt, ...trim],
        hair = snapshot(named("Brown_blond_hair")),
        head = snapshot(named("Head")),
        neckSkin = snapshot(named("Neck")),
        p = new THREE.Vector3(),
        exposed: string[] = [];
      for (const arm of arms) {
        const skin = snapshot(named(arm.side + "_arm_continuous")),
          s = model.bones[arm.side + "UpperArm"].getWorldPosition(
            new THREE.Vector3(),
          ),
          e = model.bones[arm.side + "Forearm"].getWorldPosition(
            new THREE.Vector3(),
          ),
          line = new THREE.Line3(s, e),
          closest = new THREE.Vector3();
        for (const i of arm.samples) {
          p.fromBufferAttribute(skin.geometry.getAttribute("position"), i);
          line.closestPointToPoint(p, true, closest);
          const out = p.clone().sub(closest).normalize(),
            below = out
              .clone()
              .add(new THREE.Vector3(0, -0.7, 0))
              .normalize();
          // From straight out and from below, as when looking up at the arm.
          for (const direction of [out, below])
            if (
              !covered(p.clone().addScaledVector(direction, 6), p, fabric, skin)
            )
              exposed.push(arm.side + " arm " + label(p));
        }
        skin.geometry.dispose();
        (skin.material as THREE.Material).dispose();
      }
      const headCentre = model.bones.head.localToWorld(
        new THREE.Vector3(...config.head.centre).sub(model.rest.head),
      );
      for (const i of scalp) {
        p.fromBufferAttribute(head.geometry.getAttribute("position"), i);
        const origin = p
          .clone()
          .addScaledVector(p.clone().sub(headCentre).normalize(), 2);
        if (!covered(origin, p, [hair], head))
          exposed.push("scalp " + label(p));
      }
      // Collar rays sweep from well below to a little above, square to the chest, which leans and turns.
      const neckBase = model.bones.neck.getWorldPosition(new THREE.Vector3()),
        up = new THREE.Vector3(0, 1, 0).applyQuaternion(
          model.bones.chest.getWorldQuaternion(new THREE.Quaternion()),
        );
      for (const i of neck) {
        p.fromBufferAttribute(neckSkin.geometry.getAttribute("position"), i);
        const out = p.clone().sub(neckBase);
        out.addScaledVector(up, -out.dot(up)).normalize();
        // From steeply below (a camera under the stage) to a little above.
        for (const degrees of [-75, -50, -25, 0, 25]) {
          const e = THREE.MathUtils.degToRad(degrees),
            direction = out
              .clone()
              .multiplyScalar(Math.cos(e))
              .addScaledVector(up, Math.sin(e));
          if (
            !covered(
              p.clone().addScaledVector(direction, 6),
              p,
              fabric,
              neckSkin,
            )
          )
            exposed.push("neck " + degrees + "° " + label(p));
        }
      }
      for (const mesh of [hair, head, neckSkin, ...fabric]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      expect({ pose, phase, exposed }).toEqual({ pose, phase, exposed: [] });
    }
  }, 180_000);
});
