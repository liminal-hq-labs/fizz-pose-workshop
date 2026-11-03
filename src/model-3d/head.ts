// Defines Ben's selectable head and face styles as smooth distance fields around one shared cranium.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import config from "../../source/ben-3d.json";
import type palette from "../../source/game-palette.json";
import {
  capsuleDistance,
  ellipsoid,
  smoothSubtract,
  smoothUnion,
  type Field,
} from "./sculpt.ts";

const cranium = config.head.centre,
  radii = config.head.radii;
/** Hair thickness over the cranium; the helmet liner clears this by a small gap. */
export const hairThickness = 0.14;

/** The rounded braincase shared by every style, used by the hair cap and the fitted helmet liner. */
export function craniumField(x: number, y: number, z: number): number {
  return ellipsoid(x, y, z, cranium, radii);
}
const smax = (a: number, b: number, k: number): number =>
  -smoothUnion(-a, -b, k);
// The back of the skull carries down into the top of the neck, so the head sits on it rather than overhanging.
function withSkull(face: number, x: number, y: number, z: number): number {
  return smoothUnion(
    smoothUnion(craniumField(x, y, z), face, 0.9),
    ellipsoid(x, y, z, [0, 23.35, -1.35], [1.6, 1.25, 1.5]),
    0.8,
  );
}

type Colour = keyof typeof palette;
export interface HeadStyle {
  readonly id:
    "cartoon" | "sprite" | "stylised" | "toy" | "realistic" | "sprite-real";
  readonly label: string;
  /** One-line description for the viewer and the docs. */
  readonly summary: string;
  readonly field: Field;
  /** Faceted, flat-shaded surfaces rather than smooth ones. */
  readonly flat: boolean;
  readonly resolution: number;
  /** Skin finish: soft skin or glossy toy plastic. */
  readonly finish: "skin" | "toy";
  readonly cavity: number;
  /** Optional light-red blush on the cheeks, and grey under-chin banding as in the sprite. */
  readonly blush?: {
    centre: readonly number[];
    radius: number;
    amount: number;
  };
  readonly underChin?: number;
  readonly eyes: {
    readonly kind: "ball" | "cartoon" | "pixel" | "painted";
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
  readonly nose: "sculpted" | "block" | "ball";
  readonly mouth: {
    readonly kind: "smile" | "bar" | "grin";
    readonly y: number;
    readonly width: number;
    readonly curve: number;
    readonly radius: number;
  };
  readonly brows?: {
    readonly y: number;
    readonly width: number;
    readonly radius: number;
    readonly colour: Colour;
  };
  readonly ears: {
    readonly centre: readonly number[];
    readonly radii: readonly number[];
    readonly box: boolean;
  };
}

// A: a round, soft cartoon head with big simple eyes, a small nose bump and a simple smile.
const cartoonField: Field = (x, y, z) => {
  let d = ellipsoid(x, y, z, [0, 24.6, 0.45], [2.8, 2.6, 2.85]);
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 23.0, 1.1], [1.75, 0.95, 1.7]),
    0.9,
  );
  for (const sign of [-1, 1])
    d = smoothUnion(
      d,
      ellipsoid(x, y, z, [sign * 1.5, 24.5, 1.6], [1.05, 0.95, 1.1]),
      0.7,
    );
  d = smoothUnion(d, Math.hypot(x, y - 25.2, z - 3.3) - 0.42, 0.15);
  return withSkull(d, x, y, z);
};
// B: closest to the pixel sprite: a flat-fronted, blocky round face with flat features.
const spriteField: Field = (x, y, z) => {
  const d = smax(
    ellipsoid(x, y, z, [0, 24.55, 0.4], [2.95, 2.75, 3.05]),
    z - 2.95,
    0.6,
  );
  return withSkull(d, x, y, z);
};
// F: the sprite head made more real: a narrower jaw and gentle chin, defined cheekbones and real ears,
// keeping the flat front, bumpy nose block, blue eye dots and the big-headed sprite proportions.
const spriteRealField: Field = (x, y, z) => {
  let d = smoothUnion(
    ellipsoid(x, y, z, [0, 25.1, 0.4], [2.85, 2.25, 3.0]),
    ellipsoid(x, y, z, [0, 23.45, 0.85], [2.0, 1.5, 2.35]),
    0.9,
  );
  for (const sign of [-1, 1])
    d = smoothUnion(
      d,
      ellipsoid(x, y, z, [sign * 1.8, 25.15, 1.85], [0.85, 0.55, 0.85]),
      0.45,
    );
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 22.55, 1.65], [0.72, 0.48, 0.7]),
    0.5,
  );
  d = smax(d, z - 2.95, 0.6);
  return withSkull(d, x, y, z);
};
// E: the original realistic sculpt: skull, jaw, chin, cheekbones, brow, eye sockets, bridged nose and lips.
const realisticField: Field = (x, y, z) => {
  let d = ellipsoid(x, y, z, [0, 25.05, 0.85], [2.4, 2.75, 2.75]);
  for (const sign of [-1, 1]) {
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
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 23.95, 2.25], [1.25, 0.95, 1.1]),
    0.6,
  );
  d = smoothUnion(d, ellipsoid(x, y, z, [0, 22.9, 2.0], [0.88, 0.6, 0.8]), 0.5);
  d = withSkull(d, x, y, z);
  d = smoothUnion(
    d,
    capsuleDistance(x, y, z, [-1.75, 26.85, 2.95], [1.75, 26.85, 2.95], 0.5),
    0.55,
  );
  for (const sign of [-1, 1])
    d = smoothSubtract(
      d,
      ellipsoid(x, y, z, [sign * 1.15, 26.1, 3.45], [0.82, 0.62, 0.72]),
      0.32,
    );
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
  return smoothSubtract(
    d,
    capsuleDistance(x, y, z, [-0.72, 23.86, 3.42], [0.72, 23.86, 3.42], 0.08),
    0.12,
  );
};
// C: the sculpted face softened halfway towards a cartoon, with simple brows and blushed cheeks.
const stylisedField: Field = (x, y, z) => {
  let d = ellipsoid(x, y, z, [0, 24.95, 0.8], [2.6, 2.8, 2.8]);
  for (const sign of [-1, 1]) {
    d = smoothUnion(
      d,
      capsuleDistance(
        x,
        y,
        z,
        [sign * 1.95, 24.4, -0.35],
        [sign * 0.7, 22.95, 1.8],
        0.5,
      ),
      0.9,
    );
    d = smoothUnion(
      d,
      ellipsoid(x, y, z, [sign * 1.5, 25.1, 2.0], [1.0, 0.85, 1.0]),
      0.6,
    );
  }
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 23.95, 2.2], [1.25, 0.95, 1.1]),
    0.6,
  );
  d = smoothUnion(
    d,
    ellipsoid(x, y, z, [0, 22.95, 1.95], [0.95, 0.62, 0.82]),
    0.55,
  );
  d = withSkull(d, x, y, z);
  for (const sign of [-1, 1])
    d = smoothSubtract(
      d,
      ellipsoid(x, y, z, [sign * 1.12, 26.05, 3.65], [0.78, 0.6, 0.62]),
      0.35,
    );
  return smoothUnion(
    d,
    capsuleDistance(x, y, z, [0, 26.2, 3.25], [0, 25.15, 3.75], 0.27),
    0.3,
  );
};
// D: a chunky toy-figure head, a rounded cylinder with painted-on features.
const toyField: Field = (x, y, z) => {
  let d = smax(
    Math.hypot(x / 2.85, (z - 0.2) / 2.85) * 2.85 - 2.85,
    Math.abs(y - 24.25) - 1.95,
    0.9,
  );
  d = smoothUnion(d, Math.hypot(x, y - 25.0, z - 3.2) - 0.34, 0.12);
  return withSkull(d, x, y, z);
};

export const headStyles: readonly HeadStyle[] = [
  {
    id: "cartoon",
    label: "A · Soft cartoon",
    summary:
      "A round, soft head with big simple blue eyes and tiny highlights, a small nose bump and a simple red smile.",
    field: cartoonField,
    flat: false,
    resolution: 64,
    finish: "skin",
    cavity: 0.22,
    eyes: { kind: "cartoon", x: 1.1, y: 26.0, size: 1.4 },
    nose: "sculpted",
    mouth: { kind: "smile", y: 23.62, width: 0.72, curve: 0.22, radius: 0.11 },
    brows: { y: 27.0, width: 0.42, radius: 0.07, colour: "N" },
    ears: {
      centre: [2.88, 25.3, -0.45],
      radii: [0.32, 0.72, 0.52],
      box: false,
    },
  },
  {
    id: "sprite",
    label: "B · Sprite-faithful",
    summary:
      "The closest to the pixel sprite: a flat-fronted, faceted face with flat blue eye dots, a grey bumpy nose block and an upturned smile with a lighter upper lip and corner creases.",
    field: spriteField,
    flat: true,
    resolution: 36,
    finish: "skin",
    cavity: 0,
    underChin: 23.1,
    eyes: { kind: "pixel", x: 1.3, y: 26.0, size: 1.5 },
    nose: "block",
    mouth: { kind: "grin", y: 23.72, width: 0.8, curve: 0.24, radius: 0.13 },
    ears: { centre: [2.95, 25.3, -0.45], radii: [0.36, 1.0, 0.7], box: true },
  },
  {
    id: "stylised",
    label: "C · Stylised",
    summary:
      "Halfway between the sculpt and a cartoon: a fuller face with shallow sockets, lidded eyes, simple brow lines and blushed cheeks.",
    field: stylisedField,
    flat: false,
    resolution: 70,
    finish: "skin",
    cavity: 0.3,
    blush: { centre: [1.6, 24.9, 2.3], radius: 1.0, amount: 0.3 },
    eyes: { kind: "ball", x: 1.12, y: 26.05, size: 1.0 },
    nose: "sculpted",
    mouth: { kind: "smile", y: 23.85, width: 0.82, curve: 0.18, radius: 0.12 },
    brows: { y: 27.05, width: 0.6, radius: 0.06, colour: "N" },
    ears: {
      centre: [2.95, 25.45, -0.5],
      radii: [0.32, 0.82, 0.56],
      box: false,
    },
  },
  {
    id: "toy",
    label: "D · Toy figure",
    summary:
      "A chunky toy-figure head: a glossy rounded cylinder with painted-on eyes and smile, a ball nose and nub ears.",
    field: toyField,
    flat: false,
    resolution: 60,
    finish: "toy",
    cavity: 0.15,
    eyes: { kind: "painted", x: 1.1, y: 25.95, size: 1.55 },
    nose: "ball",
    mouth: { kind: "smile", y: 23.7, width: 0.8, curve: 0.25, radius: 0.075 },
    ears: { centre: [2.9, 25.2, -0.3], radii: [0.36, 0.6, 0.45], box: false },
  },
  {
    id: "realistic",
    label: "E · Realistic (original)",
    summary:
      "The first sculpted head: a jaw line, brow ridge, carved eye sockets with lidded eyeballs, a bridged nose and lips.",
    field: realisticField,
    flat: false,
    resolution: 70,
    finish: "skin",
    cavity: 0.35,
    eyes: { kind: "ball", x: 1.15, y: 26.1, size: 1.09 },
    nose: "sculpted",
    mouth: { kind: "smile", y: 23.88, width: 0.85, curve: 0.16, radius: 0.12 },
    brows: { y: 27.12, width: 0.6, radius: 0.085, colour: "N" },
    ears: {
      centre: [2.95, 25.45, -0.5],
      radii: [0.32, 0.82, 0.56],
      box: false,
    },
  },
  {
    id: "sprite-real",
    label: "F · Sprite head, realer",
    summary:
      "The sprite-faithful head with real ears, a narrower jaw, a gentle chin and defined cheekbones, keeping the flat bumpy nose, blue eye dots and a defined smile.",
    field: spriteRealField,
    flat: false,
    resolution: 60,
    finish: "skin",
    cavity: 0.2,
    eyes: { kind: "pixel", x: 1.25, y: 26.0, size: 1.4 },
    nose: "block",
    mouth: { kind: "grin", y: 23.72, width: 0.78, curve: 0.24, radius: 0.13 },
    ears: {
      centre: [2.88, 25.35, -0.45],
      radii: [0.32, 0.8, 0.56],
      box: false,
    },
  },
];
export const defaultHeadStyle = headStyles[0];
export function headStyle(id: string): HeadStyle {
  return headStyles.find((style) => style.id === id) ?? defaultHeadStyle;
}

/** Hairline height around the head: high at the forehead, above the ears and low at the nape. */
export function hairline(x: number, z: number): number {
  const a = Math.atan2(x, z - cranium[2]);
  return (
    26.175 +
    2.25 * Math.cos(a) -
    0.425 * Math.cos(2 * a) +
    0.1 * Math.sin(9 * a)
  );
}

// Close-cropped hair: the head surface above the hairline, lifted along its normals.
// Building it from the head mesh avoids a hidden inner surface and keeps it parallel to the skull.
// Every triangle that reaches the hair region is kept, so the cap has no holes. Across the hairline its
// thickness and colour fade into the skin, which hides the triangle edges instead of leaving a ragged cut.
export function hairCap(
  head: THREE.BufferGeometry,
  hair: THREE.Color,
  skin: THREE.Color,
): THREE.BufferGeometry {
  const positions = head.getAttribute("position"),
    normals = head.getAttribute("normal"),
    index = head.index!,
    remap = new Map<number, number>(),
    out: number[] = [],
    colours: number[] = [],
    faces: number[] = [],
    p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    c = new THREE.Color();
  const coverage = (i: number): number => {
    p.fromBufferAttribute(positions, i);
    return THREE.MathUtils.smoothstep(p.y - hairline(p.x, p.z), -0.35, 0.1);
  };
  const vertex = (i: number): number => {
    let j = remap.get(i);
    if (j === undefined) {
      const amount = coverage(i);
      p.fromBufferAttribute(positions, i);
      n.fromBufferAttribute(normals, i);
      p.addScaledVector(n, 0.02 + (hairThickness - 0.02) * amount);
      j = out.length / 3;
      out.push(p.x, p.y, p.z);
      c.copy(skin).lerp(hair, amount);
      colours.push(c.r, c.g, c.b);
      remap.set(i, j);
    }
    return j;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t),
      b = index.getX(t + 1),
      d = index.getX(t + 2);
    if (Math.max(coverage(a), coverage(b), coverage(d)) > 0)
      faces.push(vertex(a), vertex(b), vertex(d));
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  cap.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  cap.setIndex(faces);
  cap.computeVertexNormals();
  return cap;
}

/** Places a facial detail on the front of a face, a small distance proud of the skin. */
export function facePoint(
  field: Field,
  x: number,
  y: number,
  offset = 0.04,
): THREE.Vector3 {
  let low = 0,
    high = 6;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (field(x, y, middle) < 0) low = middle;
    else high = middle;
  }
  return new THREE.Vector3(x, y, (low + high) / 2 + offset);
}
