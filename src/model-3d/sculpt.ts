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
  maxTriangles = 60000,
): THREE.BufferGeometry {
  const material = new THREE.MeshBasicMaterial(),
    march = new MarchingCubes(resolution, material, false, false, maxTriangles);
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
  if (march.count >= maxTriangles * 3)
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
  keepLargestComponent(welded);
  welded.computeVertexNormals();
  refineSurface(
    welded,
    field,
    0.5 * Math.min(...max.map((v, i) => (v - min[i]) / resolution)),
  );
  geometry.dispose();
  march.geometry.dispose();
  material.dispose();
  return welded;
}
// Each sculpted part is one surface; tiny bubbles where a field grazes zero are dropped.
function keepLargestComponent(geometry: THREE.BufferGeometry): void {
  const index = geometry.index!,
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
    const a = root(index.getX(i));
    parent[root(index.getX(i + 1))] = a;
    parent[root(index.getX(i + 2))] = a;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < count; i++)
    sizes.set(root(i), (sizes.get(root(i)) ?? 0) + 1);
  if (sizes.size < 2) return;
  const largest = [...sizes.entries()].reduce((a, b) =>
      b[1] > a[1] ? b : a,
    )[0],
    remap = new Int32Array(count).fill(-1),
    kept: number[] = [];
  let used = 0;
  for (let i = 0; i < count; i++) if (root(i) === largest) remap[i] = used++;
  for (let i = 0; i < index.count; i++) {
    const j = remap[index.getX(i)];
    if (j >= 0) kept.push(j);
  }
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize,
      packed = new Float32Array(used * size);
    for (let i = 0; i < count; i++)
      if (remap[i] >= 0)
        for (let c = 0; c < size; c++)
          packed[remap[i] * size + c] = attribute.array[i * size + c];
    geometry.setAttribute(name, new THREE.BufferAttribute(packed, size));
  }
  geometry.setIndex(kept);
}
// Marching cubes leaves vertices slightly off a curved surface, which shows as terracing.
// Snap each vertex back onto the field and shade it with the field gradient instead.
function refineSurface(
  geometry: THREE.BufferGeometry,
  field: Field,
  limit: number,
): void {
  const positions = geometry.getAttribute("position"),
    normals = geometry.getAttribute("normal"),
    p = new THREE.Vector3(),
    g = new THREE.Vector3(),
    start = new THREE.Vector3(),
    e = 0.004;
  const gradient = (q: THREE.Vector3): THREE.Vector3 =>
    g
      .set(
        field(q.x + e, q.y, q.z) - field(q.x - e, q.y, q.z),
        field(q.x, q.y + e, q.z) - field(q.x, q.y - e, q.z),
        field(q.x, q.y, q.z + e) - field(q.x, q.y, q.z - e),
      )
      .divideScalar(2 * e);
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    start.copy(p);
    for (let step = 0; step < 3; step++) {
      const d = field(p.x, p.y, p.z),
        length = gradient(p).lengthSq();
      if (length < 1e-8 || Math.abs(d) < 1e-5) break;
      p.addScaledVector(g, -d / length);
    }
    // Creases, where the gradient jumps, keep their marching-cubes position.
    if (p.distanceTo(start) > limit) p.copy(start);
    positions.setXYZ(i, p.x, p.y, p.z);
    if (gradient(p).lengthSq() > 1e-8) {
      g.normalize();
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      // Keep mesh-averaged normals at sharp edges, where the field gradient is one-sided.
      if (n.dot(g) > 0.7) normals.setXYZ(i, g.x, g.y, g.z);
    }
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
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
export function smoothSubtract(a: number, b: number, k: number): number {
  return -smoothUnion(-a, b, k);
}
// A capsule whose radius changes linearly from one end to the other, for tapering limbs.
export function taperedCapsule(
  x: number,
  y: number,
  z: number,
  a: readonly number[],
  b: readonly number[],
  ra: number,
  rb: number,
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
  return (
    Math.hypot(px - dx * t, py - dy * t, pz - dz * t) -
    THREE.MathUtils.lerp(ra, rb, t)
  );
}
// Moves a point along the field gradient until it lies `offset` units outside the surface.
export function onSurface(
  field: Field,
  p: THREE.Vector3,
  offset = 0,
): THREE.Vector3 {
  const e = 0.01,
    q = p.clone(),
    g = new THREE.Vector3();
  for (let i = 0; i < 32; i++) {
    const d = field(q.x, q.y, q.z) - offset;
    if (Math.abs(d) < 1e-4) break;
    g.set(
      field(q.x + e, q.y, q.z) - field(q.x - e, q.y, q.z),
      field(q.x, q.y + e, q.z) - field(q.x, q.y - e, q.z),
      field(q.x, q.y, q.z + e) - field(q.x, q.y, q.z - e),
    ).divideScalar(2 * e);
    const length = g.lengthSq();
    if (length < 1e-10) break;
    q.addScaledVector(g, -d / length);
  }
  return q;
}
// Darkens creases and sockets by blending vertex colours towards a palette shade.
export function cavityColours(
  geometry: THREE.BufferGeometry,
  field: Field,
  base: (p: THREE.Vector3) => THREE.Color,
  shade: THREE.Color,
  strength = 0.5,
  reach = 0.35,
): void {
  const positions = geometry.getAttribute("position"),
    normals = geometry.getAttribute("normal"),
    colours = new Float32Array(positions.count * 3),
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    c = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    n.fromBufferAttribute(normals, i);
    const probe = field(
        p.x + n.x * reach,
        p.y + n.y * reach,
        p.z + n.z * reach,
      ),
      occlusion = THREE.MathUtils.clamp(1 - probe / reach, 0, 1) ** 1.5;
    c.copy(base(p)).lerp(shade, occlusion * strength);
    c.toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
}
