// Constructs a detailed, fully volumetric Ben with skinned limbs and bone-bound surface artwork.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import config from "../../source/ben-3d.json";
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
  // Helmet rings form a rounded volume with a flattened crown, rather than an extruded silhouette.
  const rings = [
      [25.9, 5.4, 5.2],
      [27, 5.4, 5.1],
      [28.8, 5.05, 4.8],
      [30.4, 4.3, 4.1],
      [31.6, 3.15, 3.25],
      [32.3, 2.25, 2.3],
      [32.5, 1.9, 2.0],
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
  crown.scale(1.9, 2, 1);
  crown.rotateX(-Math.PI / 2);
  add(
    "Helmet_crown",
    crown,
    "head",
    mat("g", 0.42),
    new THREE.Vector3(0, 32.5, 0),
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
  ring("Helmet_black_edge", 25.8, 5.3, 5.05, 0.23, "k");
  ring("Helmet_grey_rim", 25.7, 5.22, 4.99, 0.27, "L");
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
    new THREE.Vector3(0, 26.05, 0),
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
      const z = (v * 4.9) / 6.1;
      return new THREE.Vector3(u, capHeight(u, z) + 0.13, z);
    },
    "W",
    new THREE.Vector3(0, 1, 0),
  );
  for (const side of [-1, 1])
    for (const z of [-1.8, 1.8]) {
      orb(
        "Helmet_vent_recess",
        [side * 3.2, 30.1, z],
        [0.32, 0.13, 0.78],
        "head",
        "G",
      );
      orb(
        "Helmet_vent_inner",
        [side * 3.2, 30.16, z],
        [0.17, 0.07, 0.56],
        "head",
        "D",
      );
    }
  orb("Head", config.head.centre, config.head.radii, "head", "W");
  for (const side of [-1, 1]) {
    orb("Ear", [side * 3.95, 23.6, 0.1], [0.55, 0.85, 0.55], "head", "W");
    orb("Ear_inner", [side * 4.25, 23.6, 0.18], [0.12, 0.48, 0.3], "head", "L");
  }
  // Brown-blond hair hugs the rear skull below the helmet, with small gold strands.
  const hairPositions: number[] = [],
    hairIndices: number[] = [];
  for (let j = 0; j <= 24; j++) {
    const a = Math.PI * 0.12 + (j / 24) * Math.PI * 0.76;
    for (const y of [22.7, 24.7])
      hairPositions.push(Math.cos(a) * 4.12, y, -Math.sin(a) * 3.7);
    if (j < 24) {
      const n = j * 2;
      hairIndices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const hair = new THREE.BufferGeometry();
  hair.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(hairPositions, 3),
  );
  hair.setIndex(hairIndices);
  hair.computeVertexNormals();
  add("Brown_blond_hair", hair, "head", mat("N"));
  for (const x of [-2.5, -1.25, 0, 1.25, 2.5])
    tube(
      "Hair_gold_strand",
      [
        new THREE.Vector3(x, 24.45, -3.7 * Math.sqrt(1 - (x * x) / 17)),
        new THREE.Vector3(x + 0.12, 23.65, -3.72 * Math.sqrt(1 - (x * x) / 17)),
      ],
      0.075,
      "head",
      "y",
    );
  // Facial details sit on the curved skull instead of disappearing inside it.
  const faceZ = (x: number, y: number): number =>
    0.2 +
    3.65 *
      Math.sqrt(
        Math.max(0, 1 - (x * x) / 4.15 ** 2 - (y - 23.2) ** 2 / 3.3 ** 2),
      );
  for (const x of [-1.85, 1.85]) {
    const y = 25,
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
        (dx) => new THREE.Vector3(x + dx, 25.55, faceZ(x + dx, 25.55) + 0.08),
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
  orb("White_shirt_collar", [0, 19.9, 0.15], [2.5, 0.45, 1.85], "neck", "W");
  limb(
    "Neck",
    new THREE.Vector3(0, 19.0, 0),
    new THREE.Vector3(0, 21, 0),
    1.25,
    "neck",
    "W",
  );
  box(
    "Shirt_torso",
    config.torso.centre,
    config.torso.size,
    "spine",
    "R",
    0.9,
    undefined,
    { bone: "chest", weight: (p) => THREE.MathUtils.smoothstep(p.y, 13, 18) },
  );
  box("Shirt_shoulders", [0, 18.35, 0], [7.5, 1.8, 5.75], "chest", "r", 0.7);
  const collarPoints = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 1.45, 19.2, Math.sin(a) * 1.23);
  });
  tube("Shirt_collar", collarPoints, 0.16, "chest", "r");
  decal(
    "fizz-emblem",
    "chest",
    (u, v) =>
      new THREE.Vector3(
        u,
        17.1 - v,
        3.04 + 0.1 * Math.sqrt(Math.max(0, 1 - (u * u) / 16)),
      ),
    "y",
  );
  decal(
    "fizz-emblem-core",
    "chest",
    (u, v) => new THREE.Vector3(u, 17.1 - v, 3.16),
    "N",
  );
  box("Belt", [0, 10.8, 0], [7.8, 0.9, 5.85], "pelvis", "D", 0.22);
  box("Belt_buckle", [0, 10.82, 3.0], [1.2, 0.8, 0.23], "pelvis", "y", 0.1);
  box(
    "Belt_buckle_inset",
    [0, 10.82, 3.15],
    [0.62, 0.4, 0.08],
    "pelvis",
    "N",
    0.05,
  );
  for (const x of [-2.6, 2.6])
    box("Belt_loop", [x, 10.85, 3.0], [0.4, 1.2, 0.2], "pelvis", "B", 0.08);
  box("Jeans_hips", [0, 9.7, 0], [6.7, 1.5, 5.1], "pelvis", "B", 0.45);
  for (const [side, sign] of [
    ["right", -1],
    ["left", 1],
  ] as const) {
    const shoulder = rig.rest[side + "UpperArm"],
      elbow = rig.rest[side + "Forearm"],
      hand = rig.rest[side + "Hand"],
      hip = rig.rest[side + "Thigh"],
      knee = rig.rest[side + "Shin"],
      ankle = rig.rest[side + "Foot"];
    const cuff = shoulder.clone().lerp(elbow, 0.52);
    limb(side + "_upper_arm", shoulder, elbow, 1.05, side + "UpperArm", "W");
    limb(side + "_short_sleeve", shoulder, cuff, 1.42, side + "UpperArm", "r");
    limb(side + "_forearm", elbow, hand, 1.0, side + "Forearm", "W");
    orb(
      side + "_elbow",
      elbow.toArray(),
      [1.04, 1.04, 1.04],
      side + "Forearm",
      "W",
    );
    orb(side + "_hand", hand.toArray(), [0.88, 0.85, 0.7], side + "Hand", "W");
    orb(
      side + "_thumb",
      [hand.x - sign * 0.56, hand.y + 0.15, hand.z + 0.42],
      [0.33, 0.48, 0.35],
      side + "Hand",
      "W",
    );
    for (let j = 0; j < 3; j++)
      tube(
        side + "_finger_crease",
        [
          new THREE.Vector3(
            hand.x - 0.4 + j * 0.28,
            hand.y - 0.45,
            hand.z + 0.58,
          ),
          new THREE.Vector3(
            hand.x - 0.4 + j * 0.28,
            hand.y - 0.2,
            hand.z + 0.68,
          ),
        ],
        0.025,
        side + "Hand",
        "L",
      );
    limb(side + "_jeans_thigh", hip, knee, 1.42, side + "Thigh", "B");
    limb(side + "_jeans_shin", knee, ankle, 1.3, side + "Shin", "B");
    orb(side + "_knee", knee.toArray(), [1.35, 1.35, 1.35], side + "Shin", "B");
    tube(
      side + "_thigh_seam",
      [
        hip.clone().add(new THREE.Vector3(sign * 0.8, 0, 1.1)),
        knee.clone().add(new THREE.Vector3(sign * 0.8, 0, 1.05)),
      ],
      0.11,
      side + "Thigh",
      "c",
    );
    tube(
      side + "_shin_seam",
      [
        knee.clone().add(new THREE.Vector3(sign * 0.8, 0, 1.0)),
        ankle.clone().add(new THREE.Vector3(sign * 0.8, 0, 1.0)),
      ],
      0.11,
      side + "Shin",
      "c",
    );
    for (let j = 0; j < 5; j++)
      box(
        side + "_stitch",
        [hip.x + sign * 0.98, 9.0 - j * 0.45, hip.z + 1.07],
        [0.12, 0.12, 0.06],
        side + "Thigh",
        "c",
        0.025,
      );
    const z = ankle.z,
      foot = side + "Foot",
      toe = side + "Toe",
      hingeZ = z + 2.9,
      blend = {
        bone: toe,
        weight: (p: THREE.Vector3) =>
          THREE.MathUtils.smoothstep(p.z, hingeZ - 0.7, hingeZ + 1.0),
      };
    box(
      side + "_white_sole",
      [ankle.x, 0, z + (config.shoes.toeZ + config.shoes.heelZ) / 2],
      [config.shoes.width, 1, config.shoes.length],
      foot,
      "W",
      0.48,
      undefined,
      blend,
    );
    box(
      side + "_sole_edge",
      [ankle.x, 0.55, z + (config.shoes.toeZ + config.shoes.heelZ) / 2],
      [5.0, 0.18, config.shoes.length - 0.25],
      foot,
      "D",
      0.06,
      undefined,
      blend,
    );
    box(
      side + "_shoe_upper",
      [ankle.x, 1.45, z + (config.shoes.toeZ + config.shoes.heelZ) / 2 - 0.15],
      [4.85, 1.75, config.shoes.length - 0.65],
      foot,
      "R",
      0.74,
      undefined,
      blend,
    );
    box(
      side + "_high_top",
      [ankle.x, 2.85, z - 1.15],
      [4.4, 2.9, 4.1],
      foot,
      "R",
      0.65,
    );
    box(
      side + "_toe_cap",
      [ankle.x, 1.13, z + config.shoes.toeZ - 1.8],
      [4.8, 1.4, 2.8],
      foot,
      "W",
      0.65,
      undefined,
      blend,
    );
    box(
      side + "_tongue",
      [ankle.x, 2.8, z + 1.05],
      [2.4, 2.3, 0.48],
      foot,
      "r",
      0.18,
      new THREE.Euler(-0.25, 0, 0),
    );
    for (let j = 0; j < 4; j++) {
      tube(
        side + "_lace",
        [
          new THREE.Vector3(ankle.x - 0.9, 2.0 + j * 0.38, z + 1.1 - j * 0.17),
          new THREE.Vector3(ankle.x + 0.9, 2.0 + j * 0.38, z + 1.1 - j * 0.17),
        ],
        0.07,
        foot,
        "W",
      );
      for (const sx of [-1, 1])
        orb(
          side + "_eyelet",
          [ankle.x + sx * 1.05, 2.0 + j * 0.38, z + 1.12 - j * 0.17],
          [0.12, 0.1, 0.08],
          foot,
          "D",
        );
    }
    decal(
      "shoe-badge",
      foot,
      (u, v) => new THREE.Vector3(ankle.x + sign * 2.24, 2.4 - v, z - 1.0 + u),
      "y",
      new THREE.Vector3(sign, 0, 0),
    );
    box(
      side + "_heel_counter",
      [ankle.x, 1.65, z - 3.14],
      [3.8, 1.45, 0.24],
      foot,
      "r",
      0.2,
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
