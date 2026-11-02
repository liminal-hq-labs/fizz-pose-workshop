// Builds smooth garment and anatomy surfaces with continuous skeletal weights.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { BenRig } from "./rig.ts";

export type Field = (x: number, y: number, z: number) => number;
export type Influences = (p: THREE.Vector3) => Readonly<Record<string, number>>;
export function ellipsoid(
  x: number,
  y: number,
  z: number,
  centre: readonly number[],
  radii: readonly number[],
): number {
  const a = (x - centre[0]) / radii[0],
    b = (y - centre[1]) / radii[1],
    c = (z - centre[2]) / radii[2];
  const k0 = Math.hypot(a, b, c),
    k1 = Math.hypot(a / radii[0], b / radii[1], c / radii[2]);
  return k1 < 1e-8 ? -Math.min(...radii) : (k0 * (k0 - 1)) / k1;
}
export function smoothUnion(a: number, b: number, k: number): number {
  const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return THREE.MathUtils.lerp(b, a, h) - k * h * (1 - h);
}
export function sculptSurface(
  field: Field,
  min: readonly number[],
  max: readonly number[],
  resolution = 52,
): THREE.BufferGeometry {
  const material = new THREE.MeshBasicMaterial(),
    march = new MarchingCubes(resolution, material, false, false, 60000);
  march.isolation = 0;
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++)
        march.field[x + y * resolution + z * resolution * resolution] = -field(
          min[0] + (x / resolution) * (max[0] - min[0]),
          min[1] + (y / resolution) * (max[1] - min[1]),
          min[2] + (z / resolution) * (max[2] - min[2]),
        );
  march.update();
  if (march.count >= 180000)
    throw new Error("Sculpted surface exceeded its triangle budget.");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      march.positionArray.slice(0, march.count * 3),
      3,
    ),
  );
  geometry.scale(
    (max[0] - min[0]) / 2,
    (max[1] - min[1]) / 2,
    (max[2] - min[2]) / 2,
  );
  geometry.translate(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  );
  const welded = mergeVertices(geometry, 1e-4);
  welded.computeVertexNormals();
  geometry.dispose();
  march.geometry.dispose();
  material.dispose();
  return welded;
}
export function weightSurface(
  rig: BenRig,
  geometry: THREE.BufferGeometry,
  sample: Influences,
): void {
  const positions = geometry.getAttribute("position"),
    indices = new Uint16Array(positions.count * 4),
    weights = new Float32Array(positions.count * 4),
    p = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const entries = Object.entries(sample(p))
        .filter(([, w]) => w > 1e-6)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
      sum = entries.reduce((total, [, w]) => total + w, 0);
    if (!Number.isFinite(sum) || sum <= 0)
      throw new Error("Invalid sculpted skin weights.");
    entries.forEach(([name, w], j) => {
      const index = rig.skeleton.bones.indexOf(rig.bones[name]);
      if (index < 0) throw new Error("Unknown sculpted bone " + name);
      indices[i * 4 + j] = index;
      weights[i * 4 + j] = w / sum;
    });
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
}
export function frontSurface(field: Field, x: number, y: number): number {
  let low = 0,
    high = 5;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (field(x, y, middle) < 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
export function capsuleDistance(
  x: number,
  y: number,
  z: number,
  a: readonly number[],
  b: readonly number[],
  radius: number,
): number {
  const px = x - a[0],
    py = y - a[1],
    pz = z - a[2],
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2],
    t = THREE.MathUtils.clamp(
      (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz),
      0,
      1,
    );
  return Math.hypot(px - dx * t, py - dy * t, pz - dz * t) - radius;
}
