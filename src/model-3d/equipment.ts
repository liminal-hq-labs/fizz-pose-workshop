// Builds a vented bicycle helmet and joined running-shoe surfaces.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const helmetShape = {
  width: 9.4,
  depth: 10.8,
  centreY: 25.1,
  crownY: 31.0,
  thickness: 0.28,
};
const shellStations = [
  { z: -5.3, width: 0, top: 25.9, bottom: 25.9 },
  { z: -4.7, width: 2.65, top: 28.15, bottom: 24.95 },
  { z: -3.4, width: 4.15, top: 30.15, bottom: 24.9 },
  { z: -1.6, width: 4.7, top: 31.0, bottom: 25.05 },
  { z: 1.0, width: 4.6, top: 31.0, bottom: 25.25 },
  { z: 3.3, width: 4.0, top: 29.9, bottom: 25.45 },
  { z: 4.8, width: 2.45, top: 27.7, bottom: 25.65 },
  { z: 5.5, width: 0, top: 26.35, bottom: 26.35 },
] as const;
export function cycleProfile(z: number): {
  width: number;
  top: number;
  bottom: number;
} {
  const depth = THREE.MathUtils.clamp(z, -5.3, 5.5);
  let i = 0;
  while (i < shellStations.length - 2 && shellStations[i + 1].z < depth) i++;
  const a = shellStations[i],
    b = shellStations[i + 1],
    t = (depth - a.z) / (b.z - a.z),
    result = { width: 0, top: 0, bottom: 0 };
  for (const key of ["width", "top", "bottom"] as const) {
    const slope = (b[key] - a[key]) / (b.z - a.z),
      previous = shellStations[Math.max(0, i - 1)],
      next = shellStations[Math.min(shellStations.length - 1, i + 2)],
      before = i === 0 ? slope : (a[key] - previous[key]) / (a.z - previous.z),
      after =
        i + 2 >= shellStations.length
          ? slope
          : (next[key] - b[key]) / (next.z - b.z),
      ma = before * slope <= 0 ? 0 : (2 * before * slope) / (before + slope),
      mb = after * slope <= 0 ? 0 : (2 * after * slope) / (after + slope);
    result[key] =
      (2 * t ** 3 - 3 * t * t + 1) * a[key] +
      (t ** 3 - 2 * t * t + t) * (b.z - a.z) * ma +
      (-2 * t ** 3 + 3 * t * t) * b[key] +
      (t ** 3 - t * t) * (b.z - a.z) * mb;
  }
  return result;
}
export function helmetHeight(x: number, z: number): number {
  const p = cycleProfile(z),
    side = THREE.MathUtils.clamp(Math.abs(x) / Math.max(0.001, p.width), 0, 1);
  return (
    p.bottom +
    0.22 * side ** 4 +
    (p.top - p.bottom) * Math.max(0, 1 - side * side) ** 0.225
  );
}
export function cycleHelmet(): THREE.BufferGeometry {
  const columns = 64,
    rows = 80,
    positions: number[] = [],
    groups = [[] as number[], [] as number[], [] as number[]],
    kept: boolean[][] = [];
  const stride = (rows + 1) * (columns + 1);
  for (const inner of [false, true])
    for (let i = 0; i <= rows; i++) {
      const z = THREE.MathUtils.lerp(-5.3, 5.5, i / rows),
        p = cycleProfile(z);
      for (let j = 0; j <= columns; j++) {
        const a = -Math.PI / 2 + (j / columns) * Math.PI,
          x = p.width * Math.sin(a),
          y = helmetHeight(x, z);
        positions.push(
          x *
            (inner
              ? Math.max(0, p.width - 0.28) / Math.max(0.001, p.width)
              : 1),
          y - (inner ? 0.28 : 0),
          z,
        );
      }
    }
  for (let i = 0; i < rows; i++) {
    kept[i] = [];
    for (let j = 0; j < columns; j++) {
      const z = THREE.MathUtils.lerp(-5.3, 5.5, (i + 0.5) / rows),
        a = -Math.PI / 2 + ((j + 0.5) / columns) * Math.PI,
        roofSlot =
          (Math.abs(Math.abs(a) - 0.32) < 0.075 ||
            Math.abs(Math.abs(a) - 0.73) < 0.095) &&
          z > -3.7 &&
          z < 3.4 &&
          Math.abs(z - 0.1) > 0.35,
        sideSlot =
          Math.abs(a) > 1.02 && Math.abs(a) < 1.24 && z > -3.8 && z < 2.65;
      kept[i][j] = !roofSlot && !sideSlot;
    }
  }
  const wall = (a: number, b: number): void => {
    groups[2].push(a, b, a + stride, b, b + stride, a + stride);
  };
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++)
      if (kept[i][j]) {
        const a = i * (columns + 1) + j,
          b = a + columns + 1,
          c = a + 1,
          d = b + 1;
        groups[0].push(a, b, c, b, d, c);
        groups[1].push(
          a + stride,
          c + stride,
          b + stride,
          b + stride,
          c + stride,
          d + stride,
        );
        if (i === 0 || !kept[i - 1][j]) wall(c, a);
        if (i === rows - 1 || !kept[i + 1][j]) wall(b, d);
        if (j === 0 || !kept[i][j - 1]) wall(a, b);
        if (j === columns - 1 || !kept[i][j + 1]) wall(d, c);
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(groups.flat());
  let offset = 0;
  groups.forEach((indices, material) => {
    g.addGroup(offset, indices.length, material);
    offset += indices.length;
  });
  const welded = mergeVertices(g, 1e-5);
  welded.computeVertexNormals();
  g.dispose();
  return welded;
}

export interface ShoeSection {
  z: number;
  width: number;
  top: number;
  bottom: number;
  seam: number;
}
export const runnerSections: readonly ShoeSection[] = [
  { z: -3.4, width: 0, top: 0.05, bottom: 0.05, seam: 0.05 },
  { z: -3.05, width: 1.2, top: 2.45, bottom: -0.32, seam: 0.33 },
  { z: -1.65, width: 1.7, top: 3.25, bottom: -0.5, seam: 0.3 },
  { z: -0.2, width: 1.78, top: 2.95, bottom: -0.5, seam: 0.21 },
  { z: 1.55, width: 2.2, top: 2.05, bottom: -0.5, seam: 0.13 },
  { z: 3.8, width: 1.97, top: 1.55, bottom: -0.4, seam: 0.25 },
  { z: 5.6, width: 1.3, top: 1.2, bottom: -0.12, seam: 0.4 },
  { z: 6.2, width: 0, top: 0.4, bottom: 0.4, seam: 0.4 },
];
export function runnerProfile(z: number): ShoeSection {
  const depth = THREE.MathUtils.clamp(
    z,
    runnerSections[0].z,
    runnerSections.at(-1)!.z,
  );
  let i = 0;
  while (i < runnerSections.length - 2 && runnerSections[i + 1].z < depth) i++;
  const a = runnerSections[i],
    b = runnerSections[i + 1],
    t = (depth - a.z) / (b.z - a.z),
    result = { z: depth, width: 0, top: 0, bottom: 0, seam: 0 };
  for (const key of ["width", "top", "bottom", "seam"] as const) {
    const slope = (b[key] - a[key]) / (b.z - a.z),
      previous = runnerSections[Math.max(0, i - 1)],
      next = runnerSections[Math.min(runnerSections.length - 1, i + 2)];
    const before =
        i === 0 ? slope : (a[key] - previous[key]) / (a.z - previous.z),
      after =
        i + 2 >= runnerSections.length
          ? slope
          : (next[key] - b[key]) / (next.z - b.z);
    const ma =
        before * slope <= 0 ? 0 : (2 * before * slope) / (before + slope),
      mb = after * slope <= 0 ? 0 : (2 * after * slope) / (after + slope);
    result[key] =
      (2 * t ** 3 - 3 * t * t + 1) * a[key] +
      (t ** 3 - 2 * t * t + t) * (b.z - a.z) * ma +
      (-2 * t ** 3 + 3 * t * t) * b[key] +
      (t ** 3 - t * t) * (b.z - a.z) * mb;
  }
  result.width = Math.max(0, result.width);
  return result;
}
export function runnerTop(x: number, z: number): number {
  const p = runnerProfile(z);
  return (
    p.seam +
    (p.top - p.seam) *
      Math.max(0, 1 - (x / Math.max(0.001, p.width)) ** 2) ** 0.375
  );
}
export function runningShoe(
  centreX: number,
  centreZ: number,
): THREE.BufferGeometry {
  const rows = 96,
    upper = 32,
    sole = 20,
    segments = upper + sole,
    positions: number[] = [],
    groups = [[] as number[], [] as number[]];
  for (let i = 0; i <= rows; i++) {
    const p = runnerProfile(THREE.MathUtils.lerp(-3.4, 6.2, i / rows));
    for (let j = 0; j < segments; j++) {
      const isUpper = j < upper,
        a = isUpper
          ? (j / upper) * Math.PI
          : Math.PI + ((j - upper) / sole) * Math.PI,
        c = Math.cos(a),
        s = Math.sin(a);
      const x = isUpper
          ? p.width * c
          : p.width * Math.sign(c) * Math.abs(c) ** 0.45,
        y = isUpper
          ? p.seam + (p.top - p.seam) * Math.max(0, s) ** 0.75
          : p.seam - (p.seam - p.bottom) * Math.abs(s) ** 0.4;
      positions.push(centreX + x, y, centreZ + p.z);
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j,
        b = a + segments,
        c = i * segments + ((j + 1) % segments),
        d = c + segments;
      groups[j < upper ? 0 : 1].push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(groups.flat());
  g.addGroup(0, groups[0].length, 0);
  g.addGroup(groups[0].length, groups[1].length, 1);
  const welded = mergeVertices(g, 1e-5);
  welded.computeVertexNormals();
  g.dispose();
  return welded;
}
