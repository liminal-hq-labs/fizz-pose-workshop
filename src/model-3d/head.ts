// Defines Ben's sculpted head, face, ears and hair as smooth distance fields.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import config from "../../source/ben-3d.json";
import {
  capsuleDistance,
  ellipsoid,
  smoothSubtract,
  smoothUnion,
} from "./sculpt.ts";

const cranium = config.head.centre,
  radii = config.head.radii;
/** Hair thickness over the cranium; the helmet liner clears this by a small gap. */
export const hairThickness = 0.14;
/** Eye centres sit in carved sockets below the brow ridge. */
export const eyeCentres: readonly (readonly [number, number, number])[] = [
  [-1.15, 26.1, 2.72],
  [1.15, 26.1, 2.72],
];
export const eyeRadius = 0.6;

/** The rounded braincase alone, used by the hair cap and the fitted helmet liner. */
export function craniumField(x: number, y: number, z: number): number {
  return ellipsoid(x, y, z, cranium, radii);
}

// Skull, jaw, chin, cheekbones, brow, eye sockets and nose form one continuous surface.
export function headField(x: number, y: number, z: number): number {
  let d = craniumField(x, y, z);
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 25.05, 0.85], [2.4, 2.75, 2.75]),
    0.9,
  );
  for (const sign of [-1, 1]) {
    // Jaw line from below the ear to the chin, and the cheekbone above it.
    d = smoothUnion(
      d,
      capsuleDistance(
        x,
        y,
        z,
        [sign * 1.95, 24.35, -0.35],
        [sign * 0.68, 22.9, 1.85],
        0.42,
      ),
      0.7,
    );
    d = smoothUnion(
      d,
      ellipsoid(x, y, z, [sign * 1.5, 25.2, 2.05], [0.92, 0.8, 0.95]),
      0.55,
    );
  }
  // Upper jaw and lips project forward of the cheeks; the chin sits just behind them.
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 23.95, 2.25], [1.25, 0.95, 1.1]),
    0.6,
  );
  d = smoothUnion(d, ellipsoid(x, y, z, [0, 22.9, 2.0], [0.88, 0.6, 0.8]), 0.5);
  d = smoothUnion(
    d,
    capsuleDistance(x, y, z, [-1.75, 26.85, 2.95], [1.75, 26.85, 2.95], 0.5),
    0.55,
  );
  for (const [ex, ey] of eyeCentres)
    d = smoothSubtract(
      d,
      ellipsoid(x, y, z, [ex, ey, 3.45], [0.82, 0.62, 0.72]),
      0.32,
    );
  // Bridge, tip and nostril wings.
  d = smoothUnion(
    d,
    capsuleDistance(x, y, z, [0, 26.35, 3.2], [0, 25.1, 3.95], 0.3),
    0.3,
  );
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 24.98, 3.5], [0.6, 0.34, 0.46]),
    0.25,
  );
  // A shallow line between the lips.
  d = smoothSubtract(
    d,
    capsuleDistance(x, y, z, [-0.72, 23.86, 3.42], [0.72, 23.86, 3.42], 0.08),
    0.12,
  );
  return d;
}

/** Hairline height around the head: high at the forehead, above the ears and low at the nape. */
export function hairline(x: number, z: number): number {
  const a = Math.atan2(x, z - cranium[2]);
  return (
    26.4 + 1.8 * Math.cos(a) - 0.2 * Math.cos(2 * a) + 0.1 * Math.sin(9 * a)
  );
}

// Close-cropped hair: the head surface above the hairline, lifted along its normals.
// Building it from the head mesh avoids a hidden inner surface and keeps it parallel to the skull.
export function hairCap(head: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = head.getAttribute("position"),
    normals = head.getAttribute("normal"),
    index = head.index!,
    remap = new Map<number, number>(),
    out: number[] = [],
    faces: number[] = [],
    p = new THREE.Vector3(),
    n = new THREE.Vector3();
  const covered = (i: number): boolean => {
    p.fromBufferAttribute(positions, i);
    return p.y > hairline(p.x, p.z);
  };
  const vertex = (i: number): number => {
    let j = remap.get(i);
    if (j === undefined) {
      p.fromBufferAttribute(positions, i);
      n.fromBufferAttribute(normals, i);
      p.addScaledVector(n, hairThickness);
      j = out.length / 3;
      out.push(p.x, p.y, p.z);
      remap.set(i, j);
    }
    return j;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t),
      b = index.getX(t + 1),
      c = index.getX(t + 2);
    if (covered(a) && covered(b) && covered(c))
      faces.push(vertex(a), vertex(b), vertex(c));
  }
  const hair = new THREE.BufferGeometry();
  hair.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  hair.setIndex(faces);
  hair.computeVertexNormals();
  return hair;
}

/** Places a facial detail on the front of the face, a small distance proud of the skin. */
export function facePoint(x: number, y: number, offset = 0.04): THREE.Vector3 {
  let low = 0,
    high = 6;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (headField(x, y, middle) < 0) low = middle;
    else high = middle;
  }
  return new THREE.Vector3(x, y, (low + high) / 2 + offset);
}
