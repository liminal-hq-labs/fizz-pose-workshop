// Composes the hybrid Ben: the artboard's kid head on the original Codex body, wearing this model's helmet,
// running shoes and holstered Stunner.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import config from "../../source/ben-3d.json";
import palette from "../../source/game-palette.json";
import { createBenModel, type BenModel } from "./model.ts";
import { artifactFace, craniumField, facePoint } from "./head.ts";
import { bindGeometry } from "./rig.ts";
import { parseSkinLayers, projectSkinLayer } from "./svg-skin.ts";
import { holsterTurn } from "./stunner.ts";
import {
  capsuleDistance,
  cavityColours,
  ellipsoid,
  frontSurface,
  onSurface,
  sculptSurface,
  smoothUnion,
  taperedCapsule,
  weightSurface,
  type Field,
  type Influences,
} from "./sculpt.ts";

type Colour = keyof typeof palette;

/** Selectable model builds in the viewer; the hybrid is the default. */
export const benBuilds = [
  { id: "hybrid", label: "Hybrid (artifact head, Codex body)" },
  { id: "current", label: "Current (PR #7)" },
] as const;
export type BenBuild = (typeof benBuilds)[number]["id"];

/** Chest prints for the hybrid shirt. The Bubble trio is the artboard's default. */
export const shirtPrints = [
  { id: "bubbles", label: "Bubble trio" },
  { id: "drop", label: "Fizz drop" },
  { id: "cap", label: "Bottle cap" },
  { id: "cross", label: "Sprite cross" },
] as const;
export type ShirtPrint = (typeof shirtPrints)[number]["id"];

export interface HybridBenModel extends BenModel {
  /** Rebuilds the chest print; see `shirtPrints`. */
  setPrint: (id: string) => void;
  print: () => ShirtPrint;
}

/**
 * The hybrid's head, face, helmet and straps are authored in the same frame as the current model's head,
 * so the shared cranium, hairline and fitted helmet apply unchanged, then lowered by `headDrop`. The neck
 * is shorter for it: the jaw sits about half a unit above the collar.
 */
export const hybrid = {
  headDrop: 1.0,
  /**
   * Neck tube axis at the collar, its depth-to-width ratio and radius; the collar is built round the same
   * axis. Above the collar the neck leans `lean` units forward into the jaw.
   */
  neck: { z: 0, depth: 0.82, radius: 1.35, lean: 0.25 },
  /** Collar top at the front; it climbs `collarRise` at the back. */
  collarTop: 21.1,
  collarRise: 0.45,
  beltY: 10.9,
  beltHeight: 0.7,
  beltThickness: 0.17,
  /** Bubble-trio print origin on the chest and the artboard-unit to model-unit scale. */
  printCentre: [-0.2, 16.55] as const,
  printScale: 1.95,
} as const;

/** The hybrid's skull: the artboard's egg face joined to the shared cranium the helmet is fitted to. */
export function hybridHeadField(x: number, y: number, z: number): number {
  return smoothUnion(craniumField(x, y, z), artifactFace(x, y, z), 0.5);
}

/**
 * Shirt torso cross-sections up the body: height, half-width, front and back. Widest at the belly and
 * still full at the waist, as in the Codex model; the back stays nearly upright from the waist to the
 * shoulder blades and rounds gently over into the collar, with no hump; the top closes round the neck.
 */
export const torsoSections: readonly (readonly [number, number, number, number])[] = [
  [10.0, 2.0, 1.6, -1.6],
  [11.0, 2.1, 1.68, -1.65],
  [12.5, 2.3, 1.88, -1.76],
  [14.5, 2.48, 2.05, -1.82],
  [16.0, 2.48, 2.05, -1.84],
  [17.5, 2.4, 1.98, -1.84],
  [18.8, 2.3, 1.88, -1.82],
  [19.7, 2.15, 1.78, -1.78],
  [20.3, 1.85, 1.45, -1.6],
  [20.7, 1.35, 1.0, -1.2],
  [21.0, 0.6, 0.45, -0.55],
];
const torsoTop = 21.05,
  sectionStep = 0.05;
// Linear between the sections, then smoothed, so the silhouette has no kinks.
const sectionTable = ((): Float64Array[] => {
  const [y0] = torsoSections[0],
    count = Math.round((torsoTop - y0) / sectionStep) + 1;
  let rows = Array.from({ length: count }, (_, i) => {
    const y = Math.min(y0 + i * sectionStep, torsoSections.at(-1)![0]);
    let k = 0;
    while (k < torsoSections.length - 2 && torsoSections[k + 1][0] < y) k++;
    const a = torsoSections[k],
      b = torsoSections[k + 1],
      t = (y - a[0]) / (b[0] - a[0]);
    return Float64Array.from([1, 2, 3], (c) => THREE.MathUtils.lerp(a[c], b[c], t));
  });
  for (let pass = 0; pass < 3; pass++)
    rows = rows.map((_, i) => {
      const out = new Float64Array(3);
      let n = 0;
      for (let j = Math.max(0, i - 8); j <= Math.min(rows.length - 1, i + 8); j++, n++)
        for (let c = 0; c < 3; c++) out[c] += rows[j][c];
      return out.map((v) => v / n);
    });
  return rows;
})();
export function torsoSection(y: number): { width: number; front: number; back: number } {
  const f = THREE.MathUtils.clamp((y - torsoSections[0][0]) / sectionStep, 0, sectionTable.length - 1),
    i = Math.min(Math.floor(f), sectionTable.length - 2),
    t = f - i,
    v = (c: number): number => THREE.MathUtils.lerp(sectionTable[i][c], sectionTable[i + 1][c], t);
  return { width: v(0), front: v(1), back: v(2) };
}

/** Hair coverage on the hybrid head, 0 on skin to 1 on hair, in the head frame. */
export function hybridHair(x: number, y: number, z: number): number {
  const a = Math.atan2(x, z - config.head.centre[2]),
    line = 26.175 + 2.25 * Math.cos(a) - 0.425 * Math.cos(2 * a);
  return THREE.MathUtils.smoothstep(y - line, -0.3, 0.15);
}

interface Finish {
  readonly roughness?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly sheenColour?: Colour;
  readonly vertexColours?: boolean;
  readonly inFront?: boolean;
  readonly layer?: number;
}
// The same finishes as the current model, so the two builds share their look under the studio lights.
const finishes = {
  skin: { roughness: 0.52, sheen: 0.2, sheenRoughness: 0.55, sheenColour: "W" },
  cotton: { roughness: 0.88, sheen: 0.45, sheenRoughness: 0.7, sheenColour: "r" },
  denim: { roughness: 0.92, sheen: 0.35, sheenRoughness: 0.8, sheenColour: "b" },
  hair: { roughness: 0.58, sheen: 0.6, sheenRoughness: 0.35, sheenColour: "y" },
  webbing: { roughness: 0.75, sheen: 0.3, sheenRoughness: 0.6, sheenColour: "L" },
  eye: { roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.05 },
  lips: { roughness: 0.42 },
  leather: { roughness: 0.55 },
  metal: { roughness: 0.32, metalness: 0.65 },
  plastic: { roughness: 0.45, metalness: 0.15 },
} as const satisfies Record<string, Finish>;

/** Meshes kept from the current model: its helmet shell and stripe, shoes, Stunner, holster and phone. */
const kept =
  /^(Helmet_dome|helmet-stripe_\d+|(right|left)_(shoe|ankle_binding|lace|quarter_stitch)|shoe-badge_\d+|Stunner_.*|Holster_band|Phone_.*)$/;

const smax = (a: number, b: number, k: number): number =>
  -smoothUnion(-a, -b, k);

export function createHybridBenModel(
  svg: string,
  initialPrint: ShirtPrint = "bubbles",
): HybridBenModel {
  const base = createBenModel(svg),
    rig = { root: base.root, bones: base.bones, skeleton: base.skeleton, rest: base.rest },
    meshes = base.meshes,
    materials = new Map<string, THREE.MeshPhysicalMaterial>(),
    layers = parseSkinLayers(svg),
    drop = hybrid.headDrop;
  // Everything else of the current model is replaced: head, neck, shirt, arms, jeans and belt.
  for (const mesh of [...meshes])
    if (!kept.test(mesh.name)) {
      rig.root.remove(mesh);
      mesh.geometry.dispose();
      meshes.splice(meshes.indexOf(mesh), 1);
    }
  for (const mesh of meshes)
    if (mesh.name === "Helmet_dome" || mesh.name.startsWith("helmet-stripe"))
      mesh.geometry.translate(0, -drop, 0);

  const mat = (code: Colour, finish: Finish = {}): THREE.MeshPhysicalMaterial => {
    const key = code + JSON.stringify(finish);
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({
        color: palette[code] ?? "#ffffff",
        roughness: finish.roughness ?? 0.75,
        metalness: finish.metalness ?? 0,
        clearcoat: finish.clearcoat ?? 0,
        clearcoatRoughness: finish.clearcoatRoughness ?? 0,
        sheen: finish.sheen ?? 0,
        sheenRoughness: finish.sheenRoughness ?? 1,
        sheenColor: palette[finish.sheenColour ?? "k"] ?? "#000000",
        vertexColors: finish.vertexColours ?? false,
        polygonOffset: finish.inFront ?? false,
        polygonOffsetFactor: finish.inFront ? -2 * (finish.layer ?? 1) : 0,
        polygonOffsetUnits: finish.inFront ? -2 * (finish.layer ?? 1) : 0,
        side: THREE.DoubleSide,
      });
      materials.set(key, m);
    }
    return m;
  };
  // Head-frame parts are lowered with the helmet as they are bound.
  const add = (
    name: string,
    g: THREE.BufferGeometry,
    bone: string,
    m: THREE.Material,
  ): THREE.SkinnedMesh => {
    if (bone === "head") g.translate(0, -drop, 0);
    const mesh = bindGeometry(rig, g, bone, m, name);
    meshes.push(mesh);
    return mesh;
  };
  const orb = (
    name: string,
    p: THREE.Vector3,
    r: readonly number[],
    bone: string,
    m: THREE.Material,
    rotation?: THREE.Euler,
  ): THREE.SkinnedMesh => {
    const g = new THREE.SphereGeometry(1, 28, 18);
    g.scale(r[0], r[1], r[2]);
    if (rotation) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    g.translate(p.x, p.y, p.z);
    return add(name, g, bone, m);
  };
  const box = (
    name: string,
    p: THREE.Vector3,
    size: readonly number[],
    bone: string,
    m: THREE.Material,
    radius: number,
    rotation?: THREE.Euler,
  ): THREE.SkinnedMesh => {
    const g = new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius);
    if (rotation) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    g.translate(p.x, p.y, p.z);
    return add(name, g, bone, m);
  };
  const tube = (
    name: string,
    points: THREE.Vector3[],
    r: number,
    bone: string,
    m: THREE.Material,
    closed = false,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, closed),
        Math.max(8, points.length * 4),
        r,
        10,
        closed,
      ),
      bone,
      m,
    );
  const shade = (
    g: THREE.BufferGeometry,
    field: Field,
    base: (p: THREE.Vector3) => THREE.Color,
    toward: Colour,
    strength?: number,
    reach?: number,
  ): void =>
    cavityColours(g, field, base, new THREE.Color(palette[toward] ?? "#000000"), strength, reach);
  const white = new THREE.Color(palette.W),
    skin = mat("W", finishes.skin),
    shadedSkin = mat("W", { ...finishes.skin, vertexColours: true });

  // ── Head: the artboard kid's egg-shaped head, its eyes, nose, smile and ears, under the fitted helmet.
  const headField = hybridHeadField,
    head = sculptSurface(headField, [-3.6, 22.3, -4.5], [3.6, 30.3, 4.0], 76, 150000);
  // Close-cropped brown-blond hair is painted into the head surface along a smooth hairline, as on the
  // artboard, so there is no separate cap whose edge could catch the light or the helmet's shadow.
  const hairColour = new THREE.Color(palette.N);
  shade(
    head,
    headField,
    (p) => white.clone().lerp(hairColour, hybridHair(p.x, p.y, p.z)),
    "L",
    0.15,
    0.3,
  );
  add("Head", head, "head", shadedSkin);
  const eyeMaterial = mat("B", finishes.eye),
    glint = mat("W", finishes.eye),
    normalAt = (p: THREE.Vector3): THREE.Vector3 => {
      const e = 0.01;
      return new THREE.Vector3(
        headField(p.x + e, p.y, p.z) - headField(p.x - e, p.y, p.z),
        headField(p.x, p.y + e, p.z) - headField(p.x, p.y - e, p.z),
        headField(p.x, p.y, p.z + e) - headField(p.x, p.y, p.z - e),
      ).normalize();
    };
  for (const sign of [-1, 1]) {
    // Tall glossy dark-blue ovals set into the surface, each turned to face along the skin normal.
    const surface = facePoint(headField, sign * 1.1, 26.08, 0),
      n = normalAt(surface),
      turn = new THREE.Euler(-Math.asin(n.y), Math.atan2(n.x, n.z), 0, "YXZ"),
      centre = surface.clone().addScaledVector(n, -0.05);
    orb("Blue_eye", centre, [0.27, 0.45, 0.15], "head", eyeMaterial, turn);
    const spark = surface
      .clone()
      .add(new THREE.Vector3(-0.08, 0.17, 0).applyEuler(turn))
      .addScaledVector(n, 0.075);
    orb("Eye_glint", spark, [0.085, 0.095, 0.035], "head", glint, turn);
    // Small ears, set at mid-depth like the artboard's, with a shaded inner bowl.
    const tilt = new THREE.Euler(-0.12, 0, sign * 0.1);
    orb("Ear", new THREE.Vector3(sign * 2.98, 25.85, 0.05), [0.3, 0.65, 0.48], "head", skin, tilt);
    orb(
      "Ear_inner",
      new THREE.Vector3(sign * 3.15, 25.85, 0.1),
      [0.1, 0.4, 0.27],
      "head",
      mat("L", finishes.skin),
      tilt,
    );
  }
  orb("Nose", facePoint(headField, 0, 25.62, -0.1), [0.26, 0.26, 0.26], "head", skin);
  // The artboard's smile: a thin red half-circle, opening upwards, laid on the face.
  tube(
    "Mouth_smile",
    Array.from({ length: 13 }, (_, i) => {
      const t = -Math.PI / 2 + (i / 12) * Math.PI;
      return facePoint(headField, 0.6 * Math.sin(t), 25.07 - 0.6 * Math.cos(t), 0.03);
    }),
    0.11,
    "head",
    mat("R", finishes.lips),
  );
  // Webbing straps in front of and behind each ear to a divider, then under the jaw to the buckle.
  const webbing = mat("D", finishes.webbing),
    strap = config.helmet.strapRadius,
    onHead = (x: number, y: number, z: number): THREE.Vector3 =>
      onSurface(headField, new THREE.Vector3(x, y, z), strap + 0.02);
  for (const sign of [-1, 1]) {
    const divider = onHead(sign * 2.75, 24.35, 0.45);
    tube(
      "Helmet_front_strap",
      [
        onHead(sign * 2.75, 26.75, 1.55),
        onHead(sign * 2.85, 25.4, 1.05),
        divider,
        onHead(sign * 2.25, 23.35, 0.95),
        onHead(sign * 1.25, 22.8, 1.35),
        onHead(sign * 0.25, 22.62, 1.55),
      ],
      strap,
      "head",
      webbing,
    );
    tube(
      "Helmet_rear_strap",
      [onHead(sign * 2.55, 26.25, -2.4), onHead(sign * 2.85, 25.1, -1.35), divider],
      strap,
      "head",
      webbing,
    );
    box(
      "Helmet_strap_divider",
      divider,
      [0.22, 0.55, 0.42],
      "head",
      mat("L", finishes.plastic),
      0.08,
      new THREE.Euler(0, 0, sign * 0.25),
    );
  }
  const buckle = onHead(0, 22.6, 1.55);
  box("Helmet_chin_buckle", buckle, [0.72, 0.3, 0.42], "head", mat("D", finishes.plastic), 0.1);
  box(
    "Helmet_chin_buckle_release",
    buckle.clone().add(new THREE.Vector3(0, -0.12, 0.05)),
    [0.34, 0.12, 0.3],
    "head",
    mat("L", finishes.plastic),
    0.04,
  );

  // ── Shirt: the Codex barrel torso with round shoulders, slimmed for a skinny kid, closed over the
  // shoulders around the neck. The current model's skinned sleeves are kept.
  const nk = hybrid.neck,
    neckAngle = (x: number, z: number): number => Math.atan2(x, z - nk.z),
    neckRadial = (x: number, z: number): number => Math.hypot(x, (z - nk.z) / nk.depth),
    collarTop = (a: number): number =>
      hybrid.collarTop + hybrid.collarRise * ((1 - Math.cos(a)) / 2),
    around = (a: number, r: number, y: number): THREE.Vector3 =>
      new THREE.Vector3(r * Math.sin(a), y, nk.z + r * nk.depth * Math.cos(a));
  const sleeves = (["right", "left"] as const).map((side) => {
    const shoulder = rig.rest[side + "UpperArm"],
      elbow = rig.rest[side + "Forearm"],
      axis = elbow.clone().sub(shoulder),
      length = axis.length();
    axis.normalize();
    return { side, shoulder, axis, length, hem: 0.6 * length };
  });
  type Sleeve = (typeof sleeves)[number];
  const sleeveFrame = (s: Sleeve, x: number, y: number, z: number): { along: number; radial: number } => {
    const dx = x - s.shoulder.x,
      dy = y - s.shoulder.y,
      dz = z - s.shoulder.z,
      along = dx * s.axis.x + dy * s.axis.y + dz * s.axis.z;
    return { along, radial: Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along)) };
  };
  const sleeveField = (s: Sleeve, x: number, y: number, z: number): number => {
    const { along, radial } = sleeveFrame(s, x, y, z),
      t = THREE.MathUtils.clamp(along / s.hem, 0, 1),
      tube =
        along < 0 ? Math.hypot(radial, along) - 1.18 : radial - THREE.MathUtils.lerp(1.18, 1.1, t);
    return smax(tube, along - s.hem, 0.08);
  };
  const torsoField = (x: number, y: number, z: number): number => {
    // The Codex barrel, lofted through `torsoSection` so the back runs smoothly from the waist to the
    // collar and the top closes over the shoulders round the neck.
    const s = torsoSection(y),
      dz = (s.front - s.back) / 2,
      zc = (s.front + s.back) / 2;
    let d = smax(
      (Math.hypot(x / s.width, (z - zc) / dz) - 1) * Math.min(s.width, dz),
      Math.max(y - torsoTop, torsoSections[0][0] - y),
      0.3,
    );
    // Round Codex shoulders under the sleeve caps.
    for (const sign of [-1, 1])
      d = smoothUnion(d, ellipsoid(x, y, z, [sign * 2.35, 18.55, 0], [1.25, 1.2, 1.4]), 0.6);
    return d;
  };
  const shirtField = (x: number, y: number, z: number): number => {
    let d = torsoField(x, y, z);
    for (const s of sleeves) {
      const { along } = sleeveFrame(s, x, y, z);
      d = smoothUnion(
        d,
        sleeveField(s, x, y, z),
        THREE.MathUtils.lerp(0.3, 0.03, THREE.MathUtils.smoothstep(along, 0.2, 1.1)),
      );
    }
    // Tucked into the jeans beneath the belt.
    return Math.max(d, 10.5 - y);
  };
  // The shoulder hands over from chest to arm across a wide band, so a fully raised arm stretches the cap
  // over the joint instead of tearing it; the arm skin under it shares the same blend.
  const shoulderCap = (along: number): number => THREE.MathUtils.smoothstep(along, -1.1, 0.45);
  const shirtWeights: Influences = (p) => {
    const chest = THREE.MathUtils.smoothstep(p.y, 13.4, 18.4),
      waist = THREE.MathUtils.smoothstep(p.y, 11.2, 14.2),
      torso = torsoField(p.x, p.y, p.z),
      w: Record<string, number> = {};
    let arms = 0;
    for (const s of sleeves) {
      const { along, radial } = sleeveFrame(s, p.x, p.y, p.z),
        nearer = THREE.MathUtils.smoothstep(torso - sleeveField(s, p.x, p.y, p.z), -0.08, 0.12),
        inTube =
          THREE.MathUtils.smoothstep(along, -0.1, 0.4) *
          (1 - THREE.MathUtils.smoothstep(radial, 1.2, 1.45)) *
          (1 - THREE.MathUtils.smoothstep(along, s.hem + 0.15, s.hem + 0.4)) *
          // Only sleeve fabric: the barrel's side under the arm stays with the torso when the arm lifts.
          THREE.MathUtils.smoothstep(torso - sleeveField(s, p.x, p.y, p.z), -0.4, 0),
        share = shoulderCap(along) * Math.max(nearer, inTube);
      w[s.side + "UpperArm"] = share;
      arms += share;
    }
    const body = Math.max(0, 1 - arms);
    w.pelvis = body * (1 - waist);
    w.spine = body * waist * (1 - chest);
    w.chest = body * waist * chest;
    return w;
  };
  /** Height of the shirt's top surface above a point round the neck axis. */
  const shirtTop = (a: number, r: number): number => {
    const p = around(a, r, 0);
    let low = 18.6,
      high = 23;
    if (shirtField(p.x, low, p.z) >= 0) throw new Error("Shirt yoke does not reach the collar.");
    for (let i = 0; i < 30; i++) {
      const y = (low + high) / 2;
      if (shirtField(p.x, y, p.z) < 0) low = y;
      else high = y;
    }
    return (low + high) / 2;
  };
  const garment = sculptSurface(shirtField, [-5.6, 10.3, -3.0], [5.6, 21.2, 2.9], 64, 120000),
    darkRed = new THREE.Color(palette.R),
    lightRed = new THREE.Color(palette.r);
  shade(
    garment,
    shirtField,
    (p) => {
      const sleeve = Math.max(
        ...sleeves.map((s) =>
          THREE.MathUtils.smoothstep(sleeveFrame(s, p.x, p.y, p.z).along, -0.4, 0.4),
        ),
      );
      return darkRed
        .clone()
        .lerp(lightRed, sleeve * 0.7 + THREE.MathUtils.smoothstep(p.y, 18.6, 20.4) * 0.25);
    },
    "k",
    0.4,
  );
  // The white collar: a rolled band with real thickness, one closed smooth surface round the neck axis.
  // Its inner face lies inside the neck and its skirt dips into the shirt yoke at every angle, so the
  // neck, collar and shirt overlap instead of meeting edge to edge. It is part of the shirt mesh.
  const R = nk.radius,
    collarSegments = 128,
    collarProfile = 48,
    collarPositions: number[] = [],
    collarIndices: number[] = [];
  for (let i = 0; i < collarSegments; i++) {
    const a = (i / collarSegments) * Math.PI * 2 - Math.PI,
      top = collarTop(a),
      ring: [number, number][] = [
        [R - 0.3, shirtTop(a, R - 0.3) - 0.7],
        [R - 0.24, top - 0.3],
        [R - 0.12, top - 0.03],
        [R + 0.08, top + 0.02],
        [R + 0.25, top - 0.1],
        [R + 0.42, THREE.MathUtils.lerp(top, shirtTop(a, R + 0.42), 0.55)],
        [R + 0.53, shirtTop(a, R + 0.53) + 0.08],
        [R + 0.62, shirtTop(a, R + 0.62) - 0.1],
        [R + 0.46, shirtTop(a, R + 0.46) - 0.42],
        [R + 0.1, shirtTop(a, R + 0.1) - 0.62],
      ],
      curve = new THREE.CatmullRomCurve3(
        ring.map(([r, y]) => new THREE.Vector3(r, y, 0)),
        true,
        "centripetal",
      );
    for (let j = 0; j < collarProfile; j++) {
      const q = curve.getPoint(j / collarProfile),
        p = around(a, q.x, q.y);
      collarPositions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < collarSegments; i++)
    for (let j = 0; j < collarProfile; j++) {
      const at = (u: number, v: number): number =>
          (u % collarSegments) * collarProfile + (v % collarProfile),
        a = at(i, j),
        b = at(i + 1, j),
        c = at(i, j + 1),
        d = at(i + 1, j + 1);
      collarIndices.push(a, c, b, b, c, d);
    }
  const collar = new THREE.BufferGeometry();
  collar.setAttribute("position", new THREE.Float32BufferAttribute(collarPositions, 3));
  collar.setIndex(collarIndices);
  collar.computeVertexNormals();
  {
    // Outward-facing winding, as for the sculpted shirt: a closed surface wound outward has a positive
    // signed volume.
    const p = (k: number): THREE.Vector3 =>
      new THREE.Vector3().fromArray(collarPositions, collarIndices[k] * 3);
    let volume = 0;
    for (let k = 0; k < collarIndices.length; k += 3)
      volume += p(k).dot(new THREE.Vector3().crossVectors(p(k + 1), p(k + 2)));
    if (volume < 0) {
      for (let i = 0; i < collarIndices.length; i += 3)
        [collarIndices[i + 1], collarIndices[i + 2]] = [collarIndices[i + 2], collarIndices[i + 1]];
      collar.setIndex(collarIndices);
      collar.computeVertexNormals();
    }
  }
  collar.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      Array.from({ length: collarPositions.length }, (_, i) => [white.r, white.g, white.b][i % 3]),
      3,
    ),
  );
  const shirt = mergeGeometries([garment, collar]);
  garment.dispose();
  collar.dispose();
  add("Shirt_torso", shirt, "spine", mat("W", { ...finishes.cotton, vertexColours: true }));
  weightSurface(rig, shirt, shirtWeights);
  for (const s of sleeves) {
    const across = new THREE.Vector3(1, 0, 0).addScaledVector(s.axis, -s.axis.x).normalize(),
      ring = new THREE.Vector3().crossVectors(s.axis, across),
      centre = s.shoulder.clone().addScaledVector(s.axis, s.hem - 0.02);
    tube(
      "Sleeve_rolled_hem",
      Array.from({ length: 49 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return centre
          .clone()
          .addScaledVector(across, 1.1 * Math.cos(a))
          .addScaledVector(ring, 1.1 * Math.sin(a));
      }),
      0.13,
      s.side + "UpperArm",
      mat("r", finishes.cotton),
      true,
    );
  }

  // ── Neck: a short skin tube, flaring into the jaw and skull so the head reads as resting on it, from deep inside the shirt yoke, up through the collar, into the head.
  // Below the collar top it is skinned with the chest, exactly as the shirt and collar there.
  const neckRings = 30,
    neckSegments = 96,
    neckPositions: number[] = [],
    neckIndices: number[] = [];
  for (let i = 0; i <= neckRings; i++) {
    const y = THREE.MathUtils.lerp(18.9, 23.4, i / neckRings);
    for (let j = 0; j < neckSegments; j++) {
      const p = around(
        (j / neckSegments) * Math.PI * 2 - Math.PI,
        nk.radius + 0.3 * THREE.MathUtils.smoothstep(y, 21.8, 22.9),
        y,
      );
      // Leaning slightly forward out of the shoulders into the jaw.
      p.z += nk.lean * THREE.MathUtils.smoothstep(y, 21.4, 23.2);
      neckPositions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < neckRings; i++)
    for (let j = 0; j < neckSegments; j++) {
      const a = i * neckSegments + j,
        b = a + neckSegments,
        c = i * neckSegments + ((j + 1) % neckSegments),
        d = c + neckSegments;
      neckIndices.push(a, c, b, b, c, d);
    }
  const neck = new THREE.BufferGeometry();
  neck.setAttribute("position", new THREE.Float32BufferAttribute(neckPositions, 3));
  neck.setIndex(neckIndices);
  neck.computeVertexNormals();
  add("Neck", neck, "neck", skin);
  weightSurface(rig, neck, (p) => {
    const top = collarTop(neckAngle(p.x, p.z)),
      seated = 1 - THREE.MathUtils.smoothstep(p.y, top + 0.05, top + 0.45),
      onHead = THREE.MathUtils.smoothstep(p.y, 21.9, 22.6);
    return { chest: seated, neck: (1 - seated) * (1 - onHead), head: (1 - seated) * onHead };
  });

  // ── Jeans: the Codex pelvis, full at the hips below the belt, with slim straight legs and cuffs.
  const hipY = rig.rest.rightThigh.y,
    kneeY = rig.rest.rightShin.y,
    ankleY = rig.rest.rightFoot.y,
    legX = Math.abs(rig.rest.rightThigh.x),
    hemY = ankleY - 0.3;
  const legRadii = (y: number): { rx: number; rz: number } => {
    const t = THREE.MathUtils.smoothstep(y, kneeY - 0.4, hipY);
    return { rx: THREE.MathUtils.lerp(0.95, 1.25, t), rz: THREE.MathUtils.lerp(1.05, 1.35, t) };
  };
  const pantsField = (x: number, y: number, z: number): number => {
    let d = Math.max(ellipsoid(x, y, z, [0, 9.65, -0.05], [2.55, 2.3, 1.95]), y - 11.4);
    for (const sign of [-1, 1]) {
      d = smoothUnion(d, ellipsoid(x, y, z, [sign * 1.05, 9.2, -0.65], [1.25, 1.3, 1.15]), 0.5);
      const cy = THREE.MathUtils.clamp(y, hemY, hipY + 0.5),
        { rx, rz } = legRadii(cy),
        leg = Math.max(
          (Math.hypot((x - sign * legX) / rx, (z - 0.08) / rz) - 1) * rx,
          hemY - y,
          y - (hipY + 0.6),
        );
      d = smoothUnion(d, leg, 0.45);
      d = smoothUnion(d, ellipsoid(x, y, z, [sign * legX, kneeY, 0.68], [0.6, 0.5, 0.4]), 0.35);
    }
    return d;
  };
  const pantsWeights: Influences = (p) => {
    const pelvis = THREE.MathUtils.smoothstep(p.y, hipY - 1.6, hipY + 0.3),
      left = THREE.MathUtils.smoothstep(p.x, -0.8, 0.8),
      upper = THREE.MathUtils.smoothstep(p.y, kneeY, kneeY + 0.75),
      lower = 1 - THREE.MathUtils.smoothstep(p.y, kneeY - 0.75, kneeY),
      joint = 1 - upper - lower,
      foot = 1 - THREE.MathUtils.smoothstep(p.y, ankleY + 0.05, ankleY + 0.9);
    const w: Record<string, number> = { pelvis };
    for (const [side, share] of [
      ["right", 1 - left],
      ["left", left],
    ] as const) {
      w[side + "Knee"] = (1 - pelvis) * share * joint;
      w[side + "Thigh"] = (1 - pelvis) * share * upper;
      w[side + "Shin"] = (1 - pelvis) * share * lower * (1 - foot);
      w[side + "Foot"] = (1 - pelvis) * share * lower * foot;
    }
    return w;
  };
  const pants = sculptSurface(pantsField, [-3.4, hemY - 0.3, -2.3], [3.4, 11.6, 2.4], 60, 120000);
  shade(pants, pantsField, () => new THREE.Color(palette.B), "k", 0.45);
  add("Jeans_continuous", pants, "pelvis", mat("W", { ...finishes.denim, vertexColours: true }));
  weightSurface(rig, pants, pantsWeights);

  // ── Belt: a leather band traced row by row round the shirt and jeans where they meet, so it sits in
  // the crease over the hips with no daylight above or below it.
  const bodyField = (x: number, y: number, z: number): number =>
      Math.min(shirtField(x, y, z), pantsField(x, y, z)),
    bodyRadius = (angle: number, y: number): number => {
      let low = 0,
        high = 4;
      for (let i = 0; i < 30; i++) {
        const r = (low + high) / 2;
        if (bodyField(r * Math.sin(angle), y, r * Math.cos(angle)) < 0) low = r;
        else high = r;
      }
      return (low + high) / 2;
    };
  const { beltY, beltHeight, beltThickness } = hybrid,
    beltProfile = [
      [-0.03, -0.5],
      [0.6, -0.5],
      [1, -0.32],
      [1, 0.32],
      [0.6, 0.5],
      [-0.03, 0.5],
    ],
    beltPositions: number[] = [],
    beltIndices: number[] = [],
    beltSegments = 128;
  for (let i = 0; i <= beltSegments; i++) {
    const a = (i / beltSegments) * Math.PI * 2;
    for (const [out, up] of beltProfile) {
      const y = beltY + up * beltHeight,
        r = bodyRadius(a, y) + out * beltThickness;
      beltPositions.push(r * Math.sin(a), y, r * Math.cos(a));
    }
  }
  for (let i = 0; i < beltSegments; i++)
    for (let j = 0; j < beltProfile.length - 1; j++) {
      const a = i * beltProfile.length + j,
        b = a + beltProfile.length;
      beltIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const belt = new THREE.BufferGeometry();
  belt.setAttribute("position", new THREE.Float32BufferAttribute(beltPositions, 3));
  belt.setIndex(beltIndices);
  belt.computeVertexNormals();
  add("Belt", belt, "pelvis", mat("D", finishes.leather));
  const buckleZ = bodyRadius(0, beltY) + beltThickness;
  box("Belt_buckle", new THREE.Vector3(0, beltY, buckleZ + 0.08), [1.1, 0.78, 0.2], "pelvis", mat("y", finishes.metal), 0.1);
  box("Belt_buckle_inset", new THREE.Vector3(0, beltY, buckleZ + 0.2), [0.62, 0.4, 0.08], "pelvis", mat("N", finishes.leather), 0.05);
  // The kept holster hangs from this belt by a short strap on the right hip.
  {
    const gunOrigin = rig.rest.stunner,
      angle = Math.atan2(gunOrigin.x, gunOrigin.z),
      top = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(
        bodyRadius(angle, beltY - 0.1) + beltThickness + 0.04,
      ),
      bottom = new THREE.Vector3(0, 0.5, 1.2).applyQuaternion(holsterTurn).add(gunOrigin);
    top.y = beltY - 0.1;
    const g = new THREE.BoxGeometry(0.36, top.distanceTo(bottom), 0.1);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        top.clone().sub(bottom).normalize(),
      ),
    );
    const mid = top.clone().add(bottom).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    add("Holster_strap", g, "pelvis", mat("D", finishes.leather));
  }

  // ── Arms and hands from the current model: deltoid, biceps, elbow, tapering forearm, wrist, palm,
  // four jointed fingers and a thumb on its own bone, inside the skinned sleeves.
  for (const [side, sign] of [
    ["right", -1],
    ["left", 1],
  ] as const) {
    const shoulder = rig.rest[side + "UpperArm"].toArray(),
      elbow = rig.rest[side + "Forearm"].toArray(),
      wrist = rig.rest[side + "Hand"].toArray(),
      inward = -sign;
    const along = (a: readonly number[], b: readonly number[], t: number): number[] =>
      a.map((v, i) => THREE.MathUtils.lerp(v, b[i], t));
    const at = (dx: number, dy: number, dz: number): number[] => [
      wrist[0] + dx,
      wrist[1] + dy,
      wrist[2] + dz,
    ];
    const sleeveOf = sleeves.find((s) => s.side === side)!;
    const armField = (x: number, y: number, z: number): number => {
      let d = taperedCapsule(x, y, z, shoulder, elbow, 0.98, 0.66);
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, along(shoulder, elbow, 0.45).map((v, i) => v + [0, 0, 0.18][i]), [0.84, 1.35, 0.82]),
        0.45,
      );
      d = smoothUnion(d, Math.hypot(x - elbow[0], y - elbow[1], z - elbow[2]) - 0.64, 0.3);
      d = smoothUnion(d, taperedCapsule(x, y, z, elbow, wrist, 0.72, 0.46), 0.3);
      d = smoothUnion(d, ellipsoid(x, y, z, along(elbow, wrist, 0.28), [0.78, 1.25, 0.8]), 0.5);
      d = smoothUnion(d, ellipsoid(x, y, z, at(0, -0.82, 0.02), [0.4, 0.82, 0.8]), 0.28);
      for (let finger = 0; finger < 4; finger++) {
        const offset = [0.56, 0.2, -0.18, -0.52][finger],
          length = [1.05, 1.15, 1.08, 0.86][finger],
          r = [0.2, 0.21, 0.2, 0.17][finger],
          knuckle = at(0, -1.45, offset),
          middle = at(inward * 0.12, -1.45 - length * 0.55, offset + 0.02),
          tip = at(inward * 0.32, -1.45 - length, offset + 0.03);
        d = smoothUnion(d, capsuleDistance(x, y, z, knuckle, middle, r), 0.1);
        d = smoothUnion(d, capsuleDistance(x, y, z, middle, tip, r * 0.88), 0.07);
      }
      const thumbBase = at(inward * 0.15, -0.4, 0.55),
        thumbJoint = at(inward * 0.38, -1.02, 0.86),
        thumbTip = at(inward * 0.52, -1.55, 0.8);
      d = smoothUnion(d, capsuleDistance(x, y, z, thumbBase, thumbJoint, 0.26), 0.18);
      d = smoothUnion(d, capsuleDistance(x, y, z, thumbJoint, thumbTip, 0.2), 0.08);
      // Hidden inside the sleeve, the shoulder and upper arm sit a little deeper, leaving the fabric room
      // to stretch over the joint when the arm is raised; below the hem the muscles keep their shape.
      const down = sleeveFrame(sleeveOf, x, y, z).along;
      return d + 0.55 * (1 - THREE.MathUtils.smoothstep(down, sleeveOf.hem - 0.9, sleeveOf.hem - 0.1));
    };
    const arm = sculptSurface(
      armField,
      [sign < 0 ? -5.9 : 2.5, 7.6, -1.5],
      [sign < 0 ? -2.5 : 5.9, 20.0, 2.1],
      62,
      120000,
    );
    shade(arm, armField, () => white, "L", 0.35, 0.25);
    add(side + "_arm_continuous", arm, side + "UpperArm", shadedSkin);
    const sleeve = sleeves.find((s) => s.side === side)!,
      thumbBone = rig.rest[side + "Thumb"],
      thumbStart = at(inward * 0.15, -0.4, 0.55),
      thumbEnd = at(inward * 0.52, -1.55, 0.8),
      thumbAxis = new THREE.Vector3(
        thumbEnd[0] - thumbStart[0],
        thumbEnd[1] - thumbStart[1],
        thumbEnd[2] - thumbStart[2],
      ).normalize();
    weightSurface(rig, arm, (p) => {
      const upper = THREE.MathUtils.smoothstep(p.y, elbow[1] - 0.45, elbow[1] + 0.45),
        cap = shoulderCap(sleeveFrame(sleeve, p.x, p.y, p.z).along),
        palm = 1 - THREE.MathUtils.smoothstep(p.y, wrist[1] - 0.45, wrist[1] + 0.15),
        thumb =
          (1 - THREE.MathUtils.smoothstep(capsuleDistance(p.x, p.y, p.z, thumbStart, thumbEnd, 0), 0.26, 0.42)) *
          THREE.MathUtils.smoothstep(p.clone().sub(thumbBone).dot(thumbAxis), -0.05, 0.25);
      return {
        chest: upper * (1 - cap),
        [side + "UpperArm"]: upper * cap,
        [side + "Forearm"]: (1 - upper) * (1 - palm),
        [side + "Hand"]: (1 - upper) * palm * (1 - thumb),
        [side + "Thumb"]: (1 - upper) * palm * thumb,
      };
    });
    const seamPoints = Array.from({ length: 25 }, (_, i) => {
      const y = hipY - 0.2 - (i / 24) * (hipY - 0.2 - (hemY + 0.15)),
        x = sign * (legX + legRadii(y).rx * 0.82);
      return new THREE.Vector3(x, y, frontSurface(pantsField, x, y) + 0.025);
    });
    tube(side + "_denim_seam", seamPoints, 0.06, side + "Thigh", mat("c", finishes.denim));
    weightSurface(rig, meshes.at(-1)!.geometry, pantsWeights);
  }

  // ── Chest print, rebuilt on request. Shapes are polygons fine enough to stay round up close, cut
  // into short edges and laid on the shirt's front surface in layers that draw over it.
  const disc = (cx: number, cy: number, r: number): THREE.Shape => {
    const s = new THREE.Shape();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2,
        x = cx + r * Math.cos(a),
        y = cy + r * Math.sin(a);
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    return s;
  };
  const dropShape = (scaleX = 1, scaleY = 1): THREE.Shape => {
    const s = new THREE.Shape(),
      path = new THREE.Path();
    path.moveTo(0, 0.78);
    path.bezierCurveTo(0.22, 0.45, 0.42, 0.18, 0.42, -0.12);
    path.absarc(0, -0.12, 0.42, 0, Math.PI, true);
    path.bezierCurveTo(-0.42, 0.18, -0.22, 0.45, 0, 0.78);
    path.getSpacedPoints(160).forEach((p, i) =>
      i === 0 ? s.moveTo(p.x * scaleX, p.y * scaleY) : s.lineTo(p.x * scaleX, p.y * scaleY),
    );
    return s;
  };
  const capShape = (): THREE.Shape => {
    const s = new THREE.Shape(),
      teeth = 21;
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2,
        r = i % 2 ? 0.44 : 0.52;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return s;
  };
  // Artboard emblem layers, back to front, in artboard units centred on the print origin.
  const printLayers = (id: ShirtPrint): { colour: Colour; shapes: THREE.Shape[] }[] => {
    if (id === "bubbles") {
      const bubbles = [
        [0, -0.08, 0.42],
        [0.42, 0.38, 0.2],
        [0.62, 0.7, 0.12],
      ];
      return [
        { colour: "N", shapes: bubbles.map(([x, y, r]) => disc(x, y, r * 1.18)) },
        { colour: "y", shapes: bubbles.map(([x, y, r]) => disc(x, y, r)) },
        { colour: "W", shapes: [disc(-0.16, 0.08, 0.1)] },
      ];
    }
    if (id === "drop")
      return [
        { colour: "N", shapes: [dropShape(1.16, 1.12)] },
        { colour: "y", shapes: [dropShape()] },
        { colour: "W", shapes: [disc(-0.14, 0.02, 0.09), disc(-0.05, 0.26, 0.05)] },
      ];
    return [
      { colour: "y", shapes: [capShape()] },
      { colour: "N", shapes: [disc(0, 0, 0.36)] },
      { colour: "y", shapes: [disc(0, 0, 0.28)] },
      { colour: "W", shapes: [disc(-0.1, 0.1, 0.07)] },
    ];
  };
  const [printX, printY] = hybrid.printCentre,
    printScale = hybrid.printScale;
  const printParts = (id: ShirtPrint): THREE.SkinnedMesh[] => {
    const start = meshes.length;
    if (id === "cross") {
      // The sprite's yellow cross, from the same SVG layers as the current model's emblem.
      for (const [layerId, colour, offset] of [
        ["fizz-emblem", "y", 0.045],
        ["fizz-emblem-core", "N", 0.065],
      ] as const) {
        const mesh = projectSkinLayer(
          rig,
          layers.get(layerId)!,
          "chest",
          (u, v) => {
            const y = 17.6 - v;
            return new THREE.Vector3(u, y, frontSurface(shirtField, u, y) + offset);
          },
          mat(colour, { ...finishes.cotton, inFront: true, layer: 3 }),
          "Shirt_print_" + layerId,
        );
        weightSurface(rig, mesh.geometry, shirtWeights);
        meshes.push(mesh);
      }
      return meshes.slice(start);
    }
    printLayers(id).forEach((layer, k) => {
      const flat = new THREE.ShapeGeometry(layer.shapes),
        g = new TessellateModifier(0.1, 12).modify(flat),
        positions = g.getAttribute("position");
      flat.dispose();
      for (let i = 0; i < positions.count; i++) {
        const x = printX + printScale * positions.getX(i),
          y = printY + printScale * positions.getY(i);
        positions.setXYZ(i, x, y, frontSurface(shirtField, x, y) + 0.04 + 0.02 * k);
      }
      g.computeVertexNormals();
      const mesh = bindGeometry(
        rig,
        g,
        "chest",
        mat(layer.colour, { ...finishes.cotton, inFront: true, layer: 2 + k }),
        "Shirt_print_" + id + "_" + k,
      );
      weightSurface(rig, g, shirtWeights);
      meshes.push(mesh);
    });
    return meshes.slice(start);
  };
  let currentPrint: ShirtPrint = initialPrint,
    printMeshes = printParts(currentPrint);
  const setPrint = (id: string): void => {
    const next = shirtPrints.find((p) => p.id === id)?.id ?? "bubbles";
    if (next === currentPrint) return;
    for (const mesh of printMeshes) {
      rig.root.remove(mesh);
      mesh.geometry.dispose();
      meshes.splice(meshes.indexOf(mesh), 1);
    }
    currentPrint = next;
    printMeshes = printParts(next);
    rig.root.updateMatrixWorld(true);
    rig.skeleton.update();
  };

  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
  rig.root.userData = { ...rig.root.userData, build: "hybrid" };
  return {
    ...base,
    meshes,
    setHeadStyle: () => undefined,
    headStyle: () => "artifact",
    setPrint,
    print: () => currentPrint,
    dispose: () => {
      base.dispose();
      materials.forEach((m) => m.dispose());
    },
  };
}
