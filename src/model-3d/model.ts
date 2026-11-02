// Constructs a detailed, fully volumetric Ben with skinned limbs and bone-bound surface artwork.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import config from "../../source/ben-3d.json";
import {
  sculptSurface,
  capsuleDistance,
  ellipsoid,
  smoothUnion,
  weightSurface,
  frontSurface,
  shoeProfile,
  type Influences,
} from "./sculpt.ts";
import palette from "../../source/game-palette.json";
import { createBenRig, bindGeometry, type BenRig } from "./rig.ts";
import { parseSkinLayers, projectSkinLayer } from "./svg-skin.ts";

export interface BenModel extends BenRig {
  meshes: THREE.SkinnedMesh[];
  phoneMeshes: THREE.SkinnedMesh[];
  dispose: () => void;
}
const vector = (a: readonly number[]): THREE.Vector3 =>
  new THREE.Vector3(a[0], a[1], a[2]);
export function createBenModel(svg: string): BenModel {
  const rig = createBenRig(),
    meshes: THREE.SkinnedMesh[] = [],
    phoneMeshes: THREE.SkinnedMesh[] = [],
    materials = new Map<string, THREE.MeshStandardMaterial>(),
    layers = parseSkinLayers(svg);
  const mat = (
    code: keyof typeof palette,
    roughness = 0.75,
    metalness = 0,
  ): THREE.MeshStandardMaterial => {
    const key = code + roughness + metalness;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: palette[code] ?? "#ffffff",
        roughness,
        metalness,
        side: THREE.DoubleSide,
      });
      materials.set(key, m);
    }
    return m;
  };
  const add = (
    name: string,
    g: THREE.BufferGeometry,
    bone: string,
    m: THREE.Material | THREE.Material[],
    position: THREE.Vector3 = new THREE.Vector3(),
    scale?: THREE.Vector3,
    rotation?: THREE.Euler,
    blend?: { bone: string; weight: (p: THREE.Vector3) => number },
  ): THREE.SkinnedMesh => {
    if (scale) g.scale(scale.x, scale.y, scale.z);
    if (rotation)
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    g.translate(position.x, position.y, position.z);
    const mesh = bindGeometry(rig, g, bone, m, name, blend);
    meshes.push(mesh);
    return mesh;
  };
  const orb = (
    name: string,
    p: readonly number[],
    r: readonly number[],
    bone: string,
    colour: keyof typeof palette,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new THREE.SphereGeometry(1, 24, 16),
      bone,
      mat(colour),
      vector(p),
      vector(r),
    );
  const box = (
    name: string,
    p: readonly number[],
    size: readonly number[],
    bone: string,
    colour: keyof typeof palette,
    radius = 0.2,
    rotation?: THREE.Euler,
    blend?: { bone: string; weight: (p: THREE.Vector3) => number },
  ): THREE.SkinnedMesh =>
    add(
      name,
      new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
      bone,
      mat(colour),
      vector(p),
      undefined,
      rotation,
      blend,
    );
  const limb = (
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    bone: string,
    colour: keyof typeof palette,
  ): void => {
    const d = new THREE.Vector3().subVectors(b, a),
      q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        d.clone().normalize(),
      ),
      g = new THREE.CapsuleGeometry(
        r,
        Math.max(0.01, d.length() - 2 * r),
        6,
        12,
      );
    g.applyQuaternion(q);
    add(name, g, bone, mat(colour), a.clone().add(b).multiplyScalar(0.5));
  };
  const tube = (
    name: string,
    points: THREE.Vector3[],
    r: number,
    bone: string,
    colour: keyof typeof palette,
  ): void => {
    add(
      name,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        Math.max(8, points.length * 4),
        r,
        6,
        false,
      ),
      bone,
      mat(colour),
    );
  };
  const decal = (
    id: string,
    bone: string,
    surface: (u: number, v: number) => THREE.Vector3,
    colour: keyof typeof palette,
    outward?: THREE.Vector3,
  ): void => {
    const layer = layers.get(id);
    if (!layer) throw new Error("Missing skin layer " + id);
    meshes.push(
      projectSkinLayer(
        rig,
        layer,
        bone,
        surface,
        mat(colour),
        id + "_" + meshes.length,
        outward,
      ),
    );
  };
  // The shell fits over the skull and hair; the sprite's black border is not shell volume.
  const rings = [
      [25.35, 4.8, 4.55],
      [26.5, 4.85, 4.6],
      [28.0, 4.5, 4.3],
      [29.25, 3.8, 3.7],
      [30.25, 3.05, 3.0],
      [30.85, 2.45, 2.5],
      [31.0, 2.2, 2.3],
    ],
    positions: number[] = [],
    indices: number[] = [],
    segments = 48;
  for (const [y, rx, rz] of rings)
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(rx * Math.cos(a), y, rz * Math.sin(a));
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j,
        b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const dome = new THREE.BufferGeometry();
  dome.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  dome.setIndex(indices);
  dome.computeVertexNormals();
  add("Helmet_dome", dome, "head", mat("g", 0.42));
  const crown = new THREE.CircleGeometry(1, 48);
  crown.scale(2.2, 2.3, 1);
  crown.rotateX(-Math.PI / 2);
  add(
    "Helmet_crown",
    crown,
    "head",
    mat("g", 0.42),
    new THREE.Vector3(0, 31.0, 0),
  );
  const ring = (
    name: string,
    y: number,
    rx: number,
    rz: number,
    r: number,
    colour: keyof typeof palette,
  ): void => {
    const points = Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz);
    });
    tube(name, points, r, "head", colour);
  };
  ring("Helmet_black_edge", 25.3, 4.76, 4.5, 0.14, "k");
  ring("Helmet_grey_rim", 25.25, 4.7, 4.44, 0.18, "L");
  const brimShape = new THREE.Shape();
  brimShape.moveTo(-4.6, 3.0);
  brimShape.quadraticCurveTo(-4.9, 5.0, -4.25, 5.8);
  brimShape.quadraticCurveTo(-2.7, 7.4, 0, 7.4);
  brimShape.quadraticCurveTo(2.7, 7.4, 4.25, 5.8);
  brimShape.quadraticCurveTo(4.9, 5.0, 4.6, 3.0);
  brimShape.closePath();
  const brim = new THREE.ExtrudeGeometry(brimShape, {
    depth: 0.3,
    bevelEnabled: true,
    bevelSize: 0.12,
    bevelThickness: 0.1,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 16,
  });
  brim.rotateX(Math.PI / 2);
  add(
    "Helmet_forward_brim",
    brim,
    "head",
    [mat("G"), mat("k")],
    new THREE.Vector3(0, 25.5, 0),
  );
  const capHeight = (x: number, z: number): number => {
    const distances = rings.map(
      (row) => row[2] * Math.sqrt(Math.max(0, 1 - (x * x) / (row[1] * row[1]))),
    );
    if (Math.abs(z) <= distances.at(-1)!) return rings.at(-1)![0];
    for (let i = rings.length - 2; i >= 0; i--)
      if (Math.abs(z) <= distances[i]) {
        const t =
          (Math.abs(z) - distances[i + 1]) / (distances[i] - distances[i + 1]);
        return THREE.MathUtils.lerp(rings[i + 1][0], rings[i][0], t);
      }
    return rings[0][0];
  };
  decal(
    "helmet-stripe",
    "head",
    (u, v) => {
      const z = (v * 4.45) / 6.1;
      return new THREE.Vector3(u, capHeight(u, z) + 0.13, z);
    },
    "W",
    new THREE.Vector3(0, 1, 0),
  );
  for (const side of [-1, 1])
    for (const z of [-1.8, 1.5]) {
      decal(
        "helmet-vent",
        "head",
        (u, v) => {
          const x = side * 2.9 + u,
            depth = z + v;
          return new THREE.Vector3(x, capHeight(x, depth) + 0.065, depth);
        },
        "G",
        new THREE.Vector3(0, 1, 0),
      );
      decal(
        "helmet-vent",
        "head",
        (u, v) => {
          const x = side * 2.9 + u * 0.52,
            depth = z + v * 0.82;
          return new THREE.Vector3(x, capHeight(x, depth) + 0.085, depth);
        },
        "D",
        new THREE.Vector3(0, 1, 0),
      );
    }
  for (const side of [-1, 1]) {
    tube(
      "Helmet_moulded_ridge",
      [0.8, 1.8, 2.8, 3.8].map((z) => {
        const x = side * 1.6;
        return new THREE.Vector3(x, capHeight(x, z) + 0.06, z);
      }),
      0.06,
      "head",
      "G",
    );
    tube(
      "Helmet_temple_strap",
      [
        new THREE.Vector3(side * 3.8, 25.2, 0.65),
        new THREE.Vector3(side * 4.05, 24.2, 0.25),
        new THREE.Vector3(side * 3.9, 23.35, -0.1),
      ],
      0.1,
      "head",
      "D",
    );
  }
  orb("Head", config.head.centre, config.head.radii, "head", "W");
  for (const side of [-1, 1]) {
    orb("Ear", [side * 3.95, 23.6, 0.1], [0.55, 0.85, 0.55], "head", "W");
    orb("Ear_inner", [side * 4.25, 23.6, 0.18], [0.12, 0.48, 0.3], "head", "L");
  }
  // A complete close-fitting cap of hair continues beneath the helmet and around the temples.
  const hairPositions: number[] = [],
    hairIndices: number[] = [],
    hairRows = 20,
    hairSegments = 72;
  const hairPoint = (longitude: number, t: number): THREE.Vector3 => {
    const lineY =
      23.6 + 1.4 * Math.cos(longitude) + 0.1 * Math.sin(longitude * 9);
    const polar = 0.04 + t * (Math.acos((lineY - 23.2) / 3.35) - 0.04);
    return new THREE.Vector3(
      4.21 * Math.sin(polar) * Math.sin(longitude),
      23.2 + 3.35 * Math.cos(polar),
      0.2 + 3.71 * Math.sin(polar) * Math.cos(longitude),
    );
  };
  for (let i = 0; i <= hairRows; i++)
    for (let j = 0; j <= hairSegments; j++)
      hairPositions.push(
        ...hairPoint((j / hairSegments) * Math.PI * 2, i / hairRows).toArray(),
      );
  for (let i = 0; i < hairRows; i++)
    for (let j = 0; j < hairSegments; j++) {
      const a = i * (hairSegments + 1) + j,
        b = a + hairSegments + 1;
      hairIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const hair = new THREE.BufferGeometry();
  hair.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(hairPositions, 3),
  );
  hair.setIndex(hairIndices);
  hair.computeVertexNormals();
  add("Brown_blond_hair", hair, "head", mat("N"));
  for (let j = 0; j < 14; j++) {
    const longitude = 0.85 + (j / 13) * (Math.PI * 2 - 1.7);
    tube(
      "Hair_gold_strand",
      [0.65, 0.79, 0.91].map((t) =>
        hairPoint(longitude, t).multiply(new THREE.Vector3(1.006, 1, 1.006)),
      ),
      0.035,
      "head",
      "y",
    );
  }
  // Facial details sit on the curved skull instead of disappearing inside it.
  const faceZ = (x: number, y: number): number =>
    0.2 +
    3.65 *
      Math.sqrt(
        Math.max(0, 1 - (x * x) / 4.15 ** 2 - (y - 23.2) ** 2 / 3.3 ** 2),
      );
  for (const x of [-1.85, 1.85]) {
    const y = 24.65,
      z = faceZ(x, y) + 0.08;
    orb("Blue_eye", [x, y, z], [0.4, 0.45, 0.16], "head", "B");
    orb("Pupil", [x, y - 0.02, z + 0.14], [0.16, 0.24, 0.07], "head", "k");
    orb(
      "Eye_glint",
      [x - 0.1, y + 0.17, z + 0.19],
      [0.085, 0.1, 0.04],
      "head",
      "W",
    );
    tube(
      "Eyebrow",
      [-0.4, 0, 0.4].map(
        (dx) => new THREE.Vector3(x + dx, 25.15, faceZ(x + dx, 25.55) + 0.08),
      ),
      0.055,
      "head",
      "N",
    );
  }
  orb("Nose", [0, 24, 3.72], [0.56, 0.53, 0.75], "head", "W");
  orb("Nose_shadow", [0, 23.7, 4.15], [0.35, 0.15, 0.24], "head", "L");
  tube(
    "Mouth_smile",
    [-0.95, 0, 0.95].map((x) => {
      const y = x === 0 ? 22.9 : 23.08;
      return new THREE.Vector3(x, y, faceZ(x, y) + 0.09);
    }),
    0.17,
    "head",
    "R",
  );
  limb(
    "Neck",
    new THREE.Vector3(0, 19.0, 0),
    new THREE.Vector3(0, 21, 0),
    1.25,
    "neck",
    "W",
  );
  const shirtField = (x: number, y: number, z: number): number => {
    let d = Math.max(
      ellipsoid(x, y, z, [0, 14.4, 0], [4.0, 6.0, 3.05]),
      10.95 - y,
      y - 19.15,
    );
    for (const sign of [-1, 1]) {
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [sign * 3.55, 17.65, 0.05], [2.0, 1.6, 2.15]),
        0.6,
      );
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [sign * 4.65, 16.85, 0.2], [1.35, 1.18, 1.5]),
        0.4,
      );
    }
    return d;
  };
  const shirtWeights: Influences = (p) => {
    const side = p.x < 0 ? "right" : "left",
      arm =
        THREE.MathUtils.smoothstep(Math.abs(p.x), 3.2, 5.3) *
        THREE.MathUtils.smoothstep(p.y, 14.8, 16.0),
      chest = THREE.MathUtils.smoothstep(p.y, 13, 18);
    return {
      spine: (1 - arm) * (1 - chest),
      chest: (1 - arm) * chest,
      [side + "UpperArm"]: arm,
    };
  };
  const garment = sculptSurface(shirtField, [-7, 10, -4], [7, 20.5, 4], 56),
    garmentMesh = add("Shirt_torso", garment, "spine", mat("W").clone());
  const garmentMaterial = garmentMesh.material as THREE.MeshStandardMaterial;
  garmentMaterial.vertexColors = true;
  materials.set("garment", garmentMaterial);
  const colours: number[] = [],
    gp = garment.getAttribute("position"),
    darkRed = new THREE.Color(palette.R),
    lightRed = new THREE.Color(palette.r);
  for (let i = 0; i < gp.count; i++) {
    const blend =
      THREE.MathUtils.smoothstep(Math.abs(gp.getX(i)), 3.4, 5.2) * 0.75 +
      THREE.MathUtils.smoothstep(gp.getY(i), 17, 19) * 0.2;
    const c = darkRed.clone().lerp(lightRed, blend);
    colours.push(c.r, c.g, c.b);
  }
  garment.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  weightSurface(rig, garment, shirtWeights);
  const collarPositions: number[] = [],
    collarIndices: number[] = [],
    collarRows = 6,
    collarSegments = 64;
  for (let i = 0; i <= collarRows; i++) {
    const t = i / collarRows,
      rx = THREE.MathUtils.lerp(1.32, 2.05, t),
      rz = THREE.MathUtils.lerp(1.08, 1.65, t),
      y = 19.47 - 0.3 * t + 0.06 * Math.sin(Math.PI * t);
    for (let j = 0; j <= collarSegments; j++) {
      const a = (j / collarSegments) * Math.PI * 2;
      collarPositions.push(rx * Math.cos(a), y, rz * Math.sin(a));
    }
  }
  for (let i = 0; i < collarRows; i++)
    for (let j = 0; j < collarSegments; j++) {
      const a = i * (collarSegments + 1) + j,
        b = a + collarSegments + 1;
      collarIndices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const collar = new THREE.BufferGeometry();
  collar.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(collarPositions, 3),
  );
  collar.setIndex(collarIndices);
  collar.computeVertexNormals();
  add("White_shirt_collar", collar, "chest", mat("W"));
  const stitchedEdge = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return new THREE.Vector3(1.94 * Math.cos(a), 19.23, 1.58 * Math.sin(a));
  });
  tube("Collar_sewn_edge", stitchedEdge, 0.025, "chest", "L");
  for (const [id, colour, offset] of [
    ["fizz-emblem", "y", 0.045],
    ["fizz-emblem-core", "N", 0.065],
  ] as const) {
    decal(
      id,
      "chest",
      (u, v) => {
        const y = 17.1 - v;
        return new THREE.Vector3(u, y, frontSurface(shirtField, u, y) + offset);
      },
      colour,
    );
    weightSurface(rig, meshes.at(-1)!.geometry, shirtWeights);
  }
  // One continuous pair of jeans joins the pelvis, thighs, knees and tapered cuffs.
  const pantsField = (x: number, y: number, z: number): number => {
    let d = ellipsoid(x, y, z, [0, 9.55, 0], [3.7, 1.55, 2.4]);
    for (const sign of [-1, 1]) {
      const cy = THREE.MathUtils.clamp(y, 3.3, 9.2),
        t = THREE.MathUtils.smoothstep(cy, 3.3, 9.2),
        rx = THREE.MathUtils.lerp(1.1, 1.62, t),
        rz = THREE.MathUtils.lerp(1.25, 1.85, t),
        cx = sign * (2.3 - 0.12 * t);
      const leg =
        (Math.hypot((x - cx) / rx, (y - cy) / rx, (z - 0.05) / rz) - 1) * rx;
      d = smoothUnion(d, leg, 0.35);
    }
    return d;
  };
  const pantsWeights: Influences = (p) => {
    const pelvis = THREE.MathUtils.smoothstep(p.y, 8.1, 10),
      left = THREE.MathUtils.smoothstep(p.x, -0.8, 0.8),
      knee = 1 - THREE.MathUtils.smoothstep(p.y, 5.8, 7.5),
      foot = 1 - THREE.MathUtils.smoothstep(p.y, 3.25, 4.1);
    const w: Record<string, number> = { pelvis };
    for (const [side, share] of [
      ["right", 1 - left],
      ["left", left],
    ] as const) {
      w[side + "Thigh"] = (1 - pelvis) * share * (1 - knee);
      w[side + "Shin"] = (1 - pelvis) * share * knee * (1 - foot);
      w[side + "Foot"] = (1 - pelvis) * share * knee * foot;
    }
    return w;
  };
  const pants = sculptSurface(pantsField, [-5, 1.8, -3.3], [5, 12, 3.3], 56);
  add("Jeans_continuous", pants, "pelvis", mat("B"));
  weightSurface(rig, pants, pantsWeights);
  // The curved belt follows the same waist instead of making a rectangular shelf.
  const belt = new THREE.TorusGeometry(1, 0.09, 8, 64);
  belt.rotateX(Math.PI / 2);
  belt.scale(3.55, 4.2, 2.65);
  belt.translate(0, 10.8, 0);
  add("Belt", belt, "pelvis", mat("D"));
  box("Belt_buckle", [0, 10.82, 2.85], [1.2, 0.8, 0.23], "pelvis", "y", 0.1);
  box(
    "Belt_buckle_inset",
    [0, 10.82, 3],
    [0.62, 0.4, 0.08],
    "pelvis",
    "N",
    0.05,
  );
  for (const [side, sign] of [
    ["right", -1],
    ["left", 1],
  ] as const) {
    const shoulder = rig.rest[side + "UpperArm"],
      elbow = rig.rest[side + "Forearm"],
      hand = rig.rest[side + "Hand"],
      ankle = rig.rest[side + "Foot"];
    const armField = (x: number, y: number, z: number): number => {
      const t = THREE.MathUtils.clamp((18 - y) / 6.5, 0, 1),
        cx = THREE.MathUtils.lerp(shoulder.x, hand.x, t),
        cz = THREE.MathUtils.lerp(shoulder.z, hand.z, t),
        cy = THREE.MathUtils.clamp(y, 11.6, 17.0),
        radius = THREE.MathUtils.lerp(1.02, 0.8, t);
      let d = Math.hypot(x - cx, y - cy, z - cz) - radius;
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [hand.x, 11.45, hand.z], [0.64, 0.73, 0.69]),
        0.22,
      );
      for (let finger = 0; finger < 4; finger++) {
        const depth = hand.z - 0.54 + finger * 0.36,
          tipY = [9.95, 9.7, 9.8, 10.05][finger],
          root = [hand.x, 11.15, depth],
          knuckle = [hand.x - sign * 0.04, 10.55, depth + 0.04],
          tip = [hand.x - sign * 0.3, tipY, depth + 0.1];
        d = smoothUnion(d, capsuleDistance(x, y, z, root, knuckle, 0.18), 0.08);
        d = smoothUnion(d, capsuleDistance(x, y, z, knuckle, tip, 0.155), 0.07);
      }
      d = smoothUnion(
        d,
        ellipsoid(
          x,
          y,
          z,
          [hand.x - sign * 0.48, 11.55, hand.z + 0.45],
          [0.36, 0.48, 0.34],
        ),
        0.19,
      );
      return smoothUnion(
        d,
        capsuleDistance(
          x,
          y,
          z,
          [hand.x - sign * 0.52, 11.5, hand.z + 0.5],
          [hand.x - sign * 0.68, 10.9, hand.z + 0.62],
          0.24,
        ),
        0.14,
      );
    };
    const arm = sculptSurface(
      armField,
      [sign < 0 ? -6.4 : 3.2, 9.1, -1.5],
      [sign < 0 ? -3.2 : 6.4, 18.7, 2.4],
      72,
    );
    add(side + "_arm_continuous", arm, side + "UpperArm", mat("W"));
    weightSurface(rig, arm, (p) => {
      const lower = 1 - THREE.MathUtils.smoothstep(p.y, 13.4, 15.2),
        palm = 1 - THREE.MathUtils.smoothstep(p.y, 11.2, 12.5);
      return {
        [side + "UpperArm"]: 1 - lower,
        [side + "Forearm"]: lower * (1 - palm),
        [side + "Hand"]: lower * palm,
      };
    });
    const seamPoints = Array.from({ length: 25 }, (_, i) => {
      const y = 9.5 - (i / 24) * 5.7,
        x = sign * (3.12 - (0.07 * i) / 24);
      return new THREE.Vector3(x, y, frontSurface(pantsField, x, y) + 0.025);
    });
    tube(side + "_denim_seam", seamPoints, 0.06, side + "Thigh", "c");
    weightSurface(rig, meshes.at(-1)!.geometry, pantsWeights);
    const z = ankle.z,
      foot = side + "Foot",
      toe = side + "Toe",
      blend = {
        bone: toe,
        weight: (p: THREE.Vector3) =>
          THREE.MathUtils.smoothstep(p.z, z + 2.2, z + 3.9),
      };
    // Low rubber sole, rounded red toe and a continuous ankle-to-vamp upper match the sprite sneakers.
    const soleSections = [
      { at: -3.8, width: 0.01, bottom: -0.05, top: 0.05 },
      { at: -3.4, width: 1.8, bottom: -0.5, top: 0.35 },
      { at: -1.5, width: 2.45, bottom: -0.5, top: 0.4 },
      { at: 2, width: 2.6, bottom: -0.5, top: 0.45 },
      { at: 5.8, width: 2.3, bottom: -0.4, top: 0.45 },
      { at: 7, width: 0.01, bottom: 0.04, top: 0.06 },
    ];
    add(
      side + "_white_sole",
      shoeProfile(soleSections, ankle.x, z),
      foot,
      mat("W"),
      undefined,
      undefined,
      undefined,
      blend,
    );
    const upperSections = [
      { at: -3.5, width: 0.01, bottom: 0.2, top: 0.4 },
      { at: -3.05, width: 1.55, bottom: 0.1, top: 3.3 },
      { at: -1.6, width: 2.0, bottom: 0.1, top: 4.2 },
      { at: 0, width: 2.18, bottom: 0.1, top: 3.75 },
      { at: 1.6, width: 2.35, bottom: 0.1, top: 2.65 },
      { at: 4.6, width: 2.24, bottom: 0.1, top: 1.9 },
      { at: 6.35, width: 1.5, bottom: 0.1, top: 1.55 },
      { at: 6.9, width: 0.01, bottom: 0.3, top: 0.6 },
    ];
    add(
      side + "_shoe_upper",
      shoeProfile(upperSections, ankle.x, z),
      foot,
      mat("R"),
      undefined,
      undefined,
      undefined,
      blend,
    );
    const cuffPoints = Array.from({ length: 41 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return new THREE.Vector3(
        ankle.x + 1.37 * Math.cos(a),
        3.82 - 0.14 * Math.sin(a),
        z - 0.55 + 1.15 * Math.sin(a),
      );
    });
    tube(side + "_shoe_collar", cuffPoints, 0.1, foot, "r");
    tube(
      side + "_heel_seam",
      [
        new THREE.Vector3(ankle.x, 1, z - 3.1),
        new THREE.Vector3(ankle.x, 2.3, z - 2.9),
        new THREE.Vector3(ankle.x, 3.45, z - 2.1),
      ],
      0.05,
      foot,
      "r",
    );
    for (let j = 0; j < 5; j++) {
      const depth = 0.1 + j * 0.49,
        y = 3.65 - j * 0.27;
      tube(
        side + "_lace",
        [
          new THREE.Vector3(ankle.x - 0.67, y, z + depth),
          new THREE.Vector3(ankle.x, y + 0.06, z + depth + 0.13),
          new THREE.Vector3(ankle.x + 0.67, y, z + depth),
        ],
        0.075,
        foot,
        "W",
      );
    }
    decal(
      "shoe-badge",
      foot,
      (u, v) => {
        const y = 2.3 - v,
          depth = -1.5 + u;
        const cx = 2.02 * Math.sqrt(Math.max(0, 1 - ((y - 2.26) / 1.94) ** 2));
        return new THREE.Vector3(ankle.x + sign * (cx + 0.035), y, z + depth);
      },
      "y",
      new THREE.Vector3(sign, 0, 0),
    );
  }
  // A complete volumetric Stunner is attached to a dedicated bone on the anatomical right hip.
  const gunOrigin = rig.rest.stunner,
    gunQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    );
  const gunBox = (
    name: string,
    p: THREE.Vector3,
    size: readonly number[],
    colour: keyof typeof palette,
  ): void => {
    const g = new RoundedBoxGeometry(size[0], size[1], size[2], 2, 0.12);
    g.applyQuaternion(gunQ);
    add(
      name,
      g,
      "stunner",
      mat(colour, 0.45, 0.15),
      p.applyQuaternion(gunQ).add(gunOrigin),
    );
  };
  gunBox(
    "Stunner_purple_body",
    new THREE.Vector3(0, 0, 0.3),
    [1.65, 1.65, 3.25],
    "M",
  );
  gunBox(
    "Stunner_dark_top",
    new THREE.Vector3(0, 0.85, 0.3),
    [1.75, 0.35, 3.6],
    "D",
  );
  gunBox(
    "Stunner_grip",
    new THREE.Vector3(0, -1.1, -0.6),
    [1.0, 1.7, 0.9],
    "M",
  );
  gunBox(
    "Stunner_energy_panel",
    new THREE.Vector3(0.86, 0, 0.2),
    [0.12, 0.9, 1.5],
    "m",
  );
  for (let j = 0; j < 3; j++)
    gunBox(
      "Stunner_panel_rib",
      new THREE.Vector3(0.95, 0, -0.3 + j * 0.4),
      [0.05, 1, 0.08],
      "D",
    );
  const muzzle = new THREE.CylinderGeometry(0.66, 0.66, 0.35, 16);
  muzzle.rotateX(Math.PI / 2);
  muzzle.applyQuaternion(gunQ);
  add(
    "Stunner_muzzle",
    muzzle,
    "stunner",
    mat("k"),
    new THREE.Vector3(0, 0.15, 2.02).applyQuaternion(gunQ).add(gunOrigin),
  );
  orb(
    "Stunner_belt_clip",
    [-4.4, 10.65, 0.35],
    [0.7, 0.35, 0.65],
    "pelvis",
    "D",
  );
  const phoneCentre = rig.rest.phone;
  phoneMeshes.push(
    box(
      "Phone_dark_back",
      phoneCentre.toArray(),
      [2.2, 3.5, 0.35],
      "phone",
      "D",
      0.25,
    ),
  );
  phoneMeshes.push(
    orb(
      "Phone_camera",
      [phoneCentre.x - 0.55, phoneCentre.y + 1.15, phoneCentre.z + 0.23],
      [0.25, 0.25, 0.08],
      "phone",
      "k",
    ),
  );
  const screen = box(
    "Phone_screen",
    [phoneCentre.x, phoneCentre.y, phoneCentre.z - 0.22],
    [1.85, 3.0, 0.08],
    "phone",
    "c",
    0.14,
  );
  phoneMeshes.push(screen);
  const mark = layers.get("phone-mark")!;
  const phoneMark = projectSkinLayer(
    rig,
    mark,
    "phone",
    (u, v) =>
      new THREE.Vector3(
        phoneCentre.x + u,
        phoneCentre.y - v,
        phoneCentre.z + 0.22,
      ),
    mat("y"),
    "Phone_Fizz_mark",
  );
  meshes.push(phoneMark);
  phoneMeshes.push(phoneMark);
  rig.bones.phone.scale.setScalar(0);
  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
  rig.root.userData = {
    description: config.name,
    units: config.units,
    referenceFloor: config.floorY,
    referenceCrown: config.crownY,
  };
  return {
    ...rig,
    meshes,
    phoneMeshes,
    dispose: () => {
      const geometries = new Set(meshes.map((mesh) => mesh.geometry));
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      rig.skeleton.dispose();
    },
  };
}
