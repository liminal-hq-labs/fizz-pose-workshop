// Builds a named skeletal hierarchy and binds volumetric geometry to reusable character bones.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import config from "../../source/ben-3d.json";
export type BoneName = (typeof config.bones)[number]["name"];
export interface BenRig {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
  rest: Record<string, THREE.Vector3>;
}
export function createBenRig(): BenRig {
  const root = new THREE.Group();
  root.name = "Ben_Blaze";
  const bones: Record<string, THREE.Bone> = {},
    rest: Record<string, THREE.Vector3> = {};
  for (const spec of config.bones) {
    const bone = new THREE.Bone();
    bone.name = spec.name;
    const world = new THREE.Vector3(
      ...(spec.position as [number, number, number]),
    );
    rest[spec.name] = world;
    bone.position.copy(world);
    if (spec.parent) bone.position.sub(rest[spec.parent]);
    bones[spec.name] = bone;
    (spec.parent ? bones[spec.parent] : root).add(bone);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(
    config.bones.map((spec) => bones[spec.name]),
  );
  skeleton.calculateInverses();
  return { root, bones, skeleton, rest };
}
export function bindGeometry(
  rig: BenRig,
  geometry: THREE.BufferGeometry,
  bone: string,
  material: THREE.Material | THREE.Material[],
  name: string,
  blend?: { bone: string; weight: (position: THREE.Vector3) => number },
): THREE.SkinnedMesh {
  const count = geometry.getAttribute("position").count,
    indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4),
    primary = rig.skeleton.bones.indexOf(rig.bones[bone]),
    secondary = blend
      ? rig.skeleton.bones.indexOf(rig.bones[blend.bone])
      : primary,
    p = new THREE.Vector3();
  if (primary < 0 || secondary < 0) throw new Error("Unknown skin binding.");
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(geometry.getAttribute("position"), i);
    const mix = blend ? THREE.MathUtils.clamp(blend.weight(p), 0, 1) : 0;
    indices[i * 4] = primary;
    indices[i * 4 + 1] = secondary;
    weights[i * 4] = 1 - mix;
    weights[i * 4 + 1] = mix;
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  rig.root.add(mesh);
  mesh.bind(rig.skeleton, new THREE.Matrix4());
  mesh.userData.bone = bone;
  return mesh;
}
export function resetRig(rig: BenRig): void {
  for (const spec of config.bones) {
    const bone = rig.bones[spec.name];
    bone.rotation.set(0, 0, 0);
    bone.scale.set(1, 1, 1);
    bone.position.copy(rig.rest[spec.name]);
    if (spec.parent) bone.position.sub(rig.rest[spec.parent]);
  }
  rig.root.updateMatrixWorld(true);
}
