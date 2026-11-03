// Builds a vented bicycle helmet and joined running-shoe surfaces.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import config from "../../source/ben-3d.json";
import palette from "../../source/game-palette.json";
import { craniumField, hairThickness } from "./head.ts";
import { ellipsoid, sculptSurface, smoothUnion } from "./sculpt.ts";

const helmet = config.helmet;
/** Material slots of the helmet mesh, in group order. */
export const helmetSlots = ["shell", "liner", "vent", "rim"] as const;
/** Roof channels on each side of the solid central rib, interrupted by a bridge across the crown. */
export const helmetVents: readonly {
  x: number;
  halfWidth: number;
  front: number;
  back: number;
}[] = [
  { x: -2.25, halfWidth: 0.26, front: 1.5, back: 0.05 },
  { x: -2.25, halfWidth: 0.26, front: -1.0, back: -2.5 },
  { x: -1.05, halfWidth: 0.28, front: 2.2, back: 0.1 },
  { x: -1.05, halfWidth: 0.28, front: -0.95, back: -3.0 },
  { x: 1.05, halfWidth: 0.28, front: 2.2, back: 0.1 },
  { x: 1.05, halfWidth: 0.28, front: -0.95, back: -3.0 },
  { x: 2.25, halfWidth: 0.26, front: 1.5, back: 0.05 },
  { x: 2.25, halfWidth: 0.26, front: -1.0, back: -2.5 },
];
const slot2d = (
  x: number,
  z: number,
  vent: (typeof helmetVents)[number],
): number =>
  Math.hypot(x - vent.x, z - THREE.MathUtils.clamp(z, vent.back, vent.front)) -
  vent.halfWidth;
/** The lower edge of the shell: just above the brow, above the ears and over the occiput. */
export function helmetRim(x: number, z: number): number {
  const a = Math.atan2(x, z - helmet.centre[2]),
    { front, side, back } = helmet.rim,
    a0 = ((front + back) / 2 + side) / 2,
    a2 = ((front + back) / 2 - side) / 2;
  return a0 + ((front - back) / 2) * Math.cos(a) + a2 * Math.cos(2 * a);
}
/** The smooth outer shell surface without vents, used for the stripe and fit checks. */
export function helmetOuter(x: number, y: number, z: number): number {
  return smoothUnion(
    ellipsoid(x, y, z, helmet.centre, helmet.radii),
    ellipsoid(x, y, z, helmet.tail.centre, helmet.tail.radii),
    0.9,
  );
}
/** The liner surface sits a small gap outside Ben's hair. */
export function helmetInner(x: number, y: number, z: number): number {
  return craniumField(x, y, z) - hairThickness - helmet.linerGap;
}
// Shell edges are rounded fillets, so the sculpted surface stays smooth where cuts meet the shell.
const smax = (a: number, b: number, k = 0.14): number =>
  -smoothUnion(-a, -b, k);
// A rounded grey lip that stands proud of the lower front edge and fades out towards the temples.
function brimField(x: number, y: number, z: number): number {
  const rim = helmetRim(x, z),
    front = THREE.MathUtils.smoothstep(
      z,
      helmet.brim.fromZ,
      helmet.brim.fromZ + 1.6,
    );
  return smax(
    smax(
      helmetOuter(x, y, z) - helmet.brim.proud * front,
      Math.abs(y - rim - helmet.brim.height / 2) - helmet.brim.height / 2,
    ),
    Math.max(-helmetInner(x, y, z), helmet.brim.fromZ - z),
  );
}
export function helmetField(x: number, y: number, z: number): number {
  let d = smax(
    smax(helmetOuter(x, y, z), -helmetInner(x, y, z)),
    helmetRim(x, z) - y,
  );
  for (const vent of helmetVents)
    d = smax(d, -Math.max(slot2d(x, z, vent), helmet.ventFloor - y), 0.12);
  // Side vents pass through the shell above each temple.
  for (const sign of [-1, 1]) {
    const side = Math.max(
      Math.hypot(
        y - THREE.MathUtils.lerp(28.35, 28.75, (z + 2.4) / 3.8),
        z - THREE.MathUtils.clamp(z, -2.4, 1.4),
      ) - 0.3,
      2.6 - sign * x,
    );
    d = smax(d, -side, 0.1);
  }
  return smoothUnion(d, brimField(x, y, z), 0.1);
}
/** Finds the outer shell along a ray from the shell centre, `offset` units proud of it. */
export function helmetSurfacePoint(
  x: number,
  angle: number,
  offset = 0,
): THREE.Vector3 {
  const c = helmet.centre,
    dy = Math.cos(angle),
    dz = Math.sin(angle);
  let low = 0,
    high = 8;
  for (let i = 0; i < 30; i++) {
    const t = (low + high) / 2;
    if (helmetOuter(x, c[1] + dy * t, c[2] + dz * t) < 0) low = t;
    else high = t;
  }
  const t = (low + high) / 2 + offset;
  return new THREE.Vector3(x, c[1] + dy * t, c[2] + dz * t);
}
// One closed, ventilated shell with foam thickness, built as a sculpted solid and split into material groups.
// The glossy outer shell is green above a grey trim band and front lip, blended per vertex for a clean edge.
export function cycleHelmet(): THREE.BufferGeometry {
  const sculpted = sculptSurface(
      helmetField,
      [-4.6, 25.2, -6.4],
      [4.6, 31.25, 5.6],
      66,
      150000,
    ),
    positions = sculpted.getAttribute("position"),
    index = sculpted.index!,
    groups = helmetSlots.map(() => [] as number[]),
    colours = new Float32Array(positions.count * 3),
    green = new THREE.Color(palette.g ?? "#55ff55"),
    grey = new THREE.Color(palette.L ?? "#aaaaaa"),
    c = new THREE.Vector3(),
    p = new THREE.Vector3(),
    colour = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const trim =
      1 -
      THREE.MathUtils.smoothstep(
        p.y - helmetRim(p.x, p.z),
        helmet.trim - 0.04,
        helmet.trim + 0.04,
      );
    colour
      .copy(green)
      .lerp(grey, trim)
      .toArray(colours, i * 3);
  }
  for (let i = 0; i < index.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++)
      c.add(p.fromBufferAttribute(positions, index.getX(i + k)));
    c.divideScalar(3);
    const outer = helmetOuter(c.x, c.y, c.z),
      inner = Math.abs(helmetInner(c.x, c.y, c.z)),
      rim = Math.abs(c.y - helmetRim(c.x, c.z));
    const slot =
      outer > -0.1 || brimField(c.x, c.y, c.z) > -0.1
        ? rim < 0.06 && outer < -0.1
          ? 3
          : 0
        : inner < 0.1
          ? 1
          : rim < 0.1
            ? 3
            : 2;
    groups[slot].push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", positions);
  g.setAttribute("normal", sculpted.getAttribute("normal"));
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.setIndex(groups.flat());
  let offset = 0;
  groups.forEach((indices, material) => {
    g.addGroup(offset, indices.length, material);
    offset += indices.length;
  });
  const welded = mergeVertices(g, 1e-6);
  g.dispose();
  sculpted.dispose();
  return welded;
}

export interface ShoeSection {
  z: number;
  width: number;
  top: number;
  bottom: number;
  seam: number;
}
/**
 * Running-shoe scale against the authored sprite-sized profile below. A real running shoe is
 * about 15% of body height; Ben keeps a chunkier cartoon shoe at about 22% (6.8 units).
 */
export const shoeScale = { x: 0.8, y: 0.85, z: 0.78 } as const;
/** Model-space height of an authored shoe height, scaled up from the sole at −0.5. */
export const shoeY = (y: number): number => (y + 0.5) * shoeScale.y - 0.5;
/** The forefoot blends into the toe bone across this span ahead of the ankle. */
export const toeFlex = { start: 1.7 * shoeScale.z, end: 3.0 * shoeScale.z };
const authoredSections: readonly ShoeSection[] = [
  { z: -2.5, width: 0, top: 0.05, bottom: 0.05, seam: 0.05 },
  { z: -2.15, width: 0.697, top: 1.54, bottom: -0.32, seam: 0.176 },
  { z: -1.4, width: 0.943, top: 2.2976, bottom: -0.5, seam: 0.124 },
  { z: -0.35, width: 1.271, top: 2.5256, bottom: -0.5, seam: 0.044 },
  { z: 1.55, width: 1.804, top: 1.6936, bottom: -0.5, seam: 0.004 },
  { z: 3.8, width: 1.6154, top: 1.264, bottom: -0.4, seam: 0.12 },
  { z: 5.6, width: 1.066, top: 1, bottom: -0.12, seam: 0.296 },
  { z: 6.2, width: 0, top: 0.4, bottom: 0.4, seam: 0.4 },
];
export const runnerSections: readonly ShoeSection[] = authoredSections.map(
  (s) => ({
    z: s.z * shoeScale.z,
    width: s.width * shoeScale.x,
    top: shoeY(s.top),
    bottom: shoeY(s.bottom),
    seam: shoeY(s.seam),
  }),
);
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
    const p = runnerProfile(
      THREE.MathUtils.lerp(
        runnerSections[0].z,
        runnerSections.at(-1)!.z,
        i / rows,
      ),
    );
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
