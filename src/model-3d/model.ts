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
  cavityColours,
  ellipsoid,
  onSurface,
  smoothUnion,
  taperedCapsule,
  weightSurface,
  frontSurface,
  type Field,
  type Influences,
} from "./sculpt.ts";
import {
  cycleHelmet,
  helmetSurfacePoint,
  runningShoe,
  runnerTop,
  runnerProfile,
  shoeScale,
  shoeY,
  toeFlex,
} from "./equipment.ts";
import {
  eyeCentres,
  eyeRadius,
  eyelids,
  facePoint,
  hairCap,
  headField,
} from "./head.ts";
import palette from "../../source/game-palette.json";
import { holsterTurn, stunnerParts, stunnerTip } from "./stunner.ts";
import { createBenRig, bindGeometry, type BenRig } from "./rig.ts";
import { parseSkinLayers, projectSkinLayer } from "./svg-skin.ts";

export interface BenModel extends BenRig {
  meshes: THREE.SkinnedMesh[];
  phoneMeshes: THREE.SkinnedMesh[];
  dispose: () => void;
}
type Colour = keyof typeof palette;
/** Surface finish layered over an EGA base colour; lighting supplies the in-between shades. */
interface Finish {
  readonly roughness?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly sheenColour?: Colour;
  readonly vertexColours?: boolean;
}
const finishes = {
  skin: { roughness: 0.52, sheen: 0.2, sheenRoughness: 0.55, sheenColour: "W" },
  cotton: {
    roughness: 0.88,
    sheen: 0.45,
    sheenRoughness: 0.7,
    sheenColour: "r",
  },
  denim: {
    roughness: 0.92,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColour: "b",
  },
  hair: { roughness: 0.58, sheen: 0.6, sheenRoughness: 0.35, sheenColour: "y" },
  shell: { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 },
  foam: { roughness: 0.95 },
  webbing: {
    roughness: 0.75,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColour: "L",
  },
  eye: { roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.05 },
  lips: { roughness: 0.42 },
  mesh: { roughness: 0.7, sheen: 0.3, sheenRoughness: 0.6, sheenColour: "r" },
  rubber: { roughness: 0.8 },
  leather: { roughness: 0.55 },
  metal: { roughness: 0.32, metalness: 0.65 },
  plastic: { roughness: 0.45, metalness: 0.15 },
} as const satisfies Record<string, Finish>;
const vector = (a: readonly number[]): THREE.Vector3 =>
  new THREE.Vector3(a[0], a[1], a[2]);
export function createBenModel(svg: string): BenModel {
  const rig = createBenRig(),
    meshes: THREE.SkinnedMesh[] = [],
    phoneMeshes: THREE.SkinnedMesh[] = [],
    materials = new Map<string, THREE.MeshPhysicalMaterial>(),
    layers = parseSkinLayers(svg);
  const mat = (
    code: Colour,
    finish: Finish = {},
  ): THREE.MeshPhysicalMaterial => {
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
        side: THREE.DoubleSide,
      });
      materials.set(key, m);
    }
    return m;
  };
  const skin = mat("W", finishes.skin),
    shadedSkin = mat("W", { ...finishes.skin, vertexColours: true });
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
    m: THREE.Material,
    rotation?: THREE.Euler,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new THREE.SphereGeometry(1, 24, 16),
      bone,
      m,
      vector(p),
      vector(r),
      rotation,
    );
  const box = (
    name: string,
    p: readonly number[],
    size: readonly number[],
    bone: string,
    m: THREE.Material,
    radius = 0.2,
    rotation?: THREE.Euler,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
      bone,
      m,
      vector(p),
      undefined,
      rotation,
    );
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
        8,
        closed,
      ),
      bone,
      m,
    );
  const decal = (
    id: string,
    bone: string,
    surface: (u: number, v: number) => THREE.Vector3,
    m: THREE.Material,
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
        m,
        id + "_" + meshes.length,
        outward,
      ),
    );
  };
  const shade = (
    g: THREE.BufferGeometry,
    field: Field,
    base: (p: THREE.Vector3) => THREE.Color,
    toward: Colour,
    strength?: number,
    reach?: number,
  ): void =>
    cavityColours(
      g,
      field,
      base,
      new THREE.Color(palette[toward] ?? "#000000"),
      strength,
      reach,
    );
  const white = new THREE.Color(palette.W);

  // The green cycling helmet fits the skull with about one unit of shell and foam above the hair.
  add("Helmet_dome", cycleHelmet(), "head", [
    mat("W", { ...finishes.shell, vertexColours: true }),
    mat("D", finishes.foam),
    mat("G", finishes.foam),
    mat("L", finishes.foam),
  ]);
  decal(
    "helmet-stripe",
    "head",
    (u, v) =>
      helmetSurfacePoint(
        u,
        THREE.MathUtils.lerp(-1.5, 1.18, (v + 6.1) / 12.2),
        0.05,
      ),
    mat("W", finishes.shell),
    new THREE.Vector3(0, 1, 0),
  );
  // Webbing straps meet at a divider below each ear and close with a buckle beneath the chin.
  const webbing = mat("D", finishes.webbing),
    strap = config.helmet.strapRadius,
    onHead = (x: number, y: number, z: number): THREE.Vector3 =>
      onSurface(headField, new THREE.Vector3(x, y, z), strap + 0.04);
  for (const sign of [-1, 1]) {
    const divider = onHead(sign * 2.55, 24.0, 0.55);
    tube(
      "Helmet_front_strap",
      [
        onHead(sign * 2.75, 26.75, 1.55),
        onHead(sign * 2.7, 25.4, 1.05),
        divider,
        onHead(sign * 1.9, 22.75, 1.05),
        onHead(sign * 0.85, 22.0, 1.45),
        onHead(sign * 0.2, 21.85, 1.6),
      ],
      strap,
      "head",
      webbing,
    );
    tube(
      "Helmet_rear_strap",
      [
        onHead(sign * 2.55, 26.25, -2.4),
        onHead(sign * 2.75, 25.1, -1.35),
        divider,
      ],
      strap,
      "head",
      webbing,
    );
    box(
      "Helmet_strap_divider",
      divider.toArray(),
      [0.22, 0.55, 0.42],
      "head",
      mat("L", finishes.plastic),
      0.08,
      new THREE.Euler(0, 0, sign * 0.25),
    );
  }
  const buckle = onHead(0, 21.85, 1.55);
  box(
    "Helmet_chin_buckle",
    buckle.toArray(),
    [0.72, 0.3, 0.42],
    "head",
    mat("D", finishes.plastic),
    0.1,
  );
  box(
    "Helmet_chin_buckle_release",
    [buckle.x, buckle.y - 0.12, buckle.z + 0.05],
    [0.34, 0.12, 0.3],
    "head",
    mat("L", finishes.plastic),
    0.04,
  );

  // A sculpted head: jaw, chin, cheekbones, brow ridge, eye sockets, nose and lip line.
  const head = sculptSurface(
    headField,
    [-3.5, 21.4, -4.4],
    [3.5, 30.3, 4.6],
    70,
    120000,
  );
  shade(head, headField, () => white, "L", 0.35, 0.3);
  add("Head", head, "head", shadedSkin);
  for (const sign of [-1, 1]) {
    const tilt = new THREE.Euler(-0.18, 0, sign * 0.12);
    orb(
      "Ear",
      [sign * 2.95, 25.45, -0.5],
      [0.32, 0.82, 0.56],
      "head",
      skin,
      tilt,
    );
    orb(
      "Ear_inner",
      [sign * 3.14, 25.45, -0.44],
      [0.09, 0.5, 0.3],
      "head",
      mat("L", finishes.skin),
      tilt,
    );
  }
  // Close-cropped brown-blond hair shows below the helmet at the temples and nape.
  add("Brown_blond_hair", hairCap(head), "head", mat("N", finishes.hair));
  // Eyes sit in their sockets, with lids, irises and the sprite's blue colour.
  const eyeWhite = mat("W", finishes.eye);
  for (const [ex, ey, ez] of eyeCentres) {
    orb(
      "Eye_white",
      [ex, ey, ez],
      [eyeRadius, eyeRadius, eyeRadius],
      "head",
      eyeWhite,
    );
    const front = ez + eyeRadius;
    orb(
      "Blue_eye",
      [ex, ey, front - 0.1],
      [0.29, 0.3, 0.13],
      "head",
      mat("B", finishes.eye),
    );
    orb(
      "Pupil",
      [ex, ey, front - 0.02],
      [0.13, 0.14, 0.07],
      "head",
      mat("k", finishes.eye),
    );
    orb(
      "Eye_glint",
      [ex - 0.1, ey + 0.12, front + 0.03],
      [0.06, 0.07, 0.03],
      "head",
      eyeWhite,
    );
    // Skin lids cover the top and bottom of each eyeball, so less white shows without a squint.
    // The upper lid edge rests just over the top of the iris; a thin lash line defines it.
    const lidRadius = eyeRadius + 0.035;
    for (const [name, edge, upper] of [
      ["Upper_eyelid", eyelids.upper, true],
      ["Lower_eyelid", eyelids.lower, false],
    ] as const) {
      const sweep = Math.PI / 2 - Math.abs(edge);
      add(
        name,
        new THREE.SphereGeometry(
          lidRadius,
          28,
          10,
          0,
          Math.PI,
          upper ? 0 : Math.PI - sweep,
          sweep,
        ),
        "head",
        skin,
        new THREE.Vector3(ex, ey, ez),
      );
      tube(
        upper ? "Upper_lash_line" : "Lower_lid_edge",
        [-1.2, -0.6, 0, 0.6, 1.2].map(
          (a) =>
            new THREE.Vector3(
              ex + lidRadius * Math.sin(a) * Math.cos(edge),
              ey + lidRadius * Math.sin(edge),
              ez + lidRadius * Math.cos(a) * Math.cos(edge),
            ),
        ),
        upper ? 0.032 : 0.022,
        "head",
        upper ? mat("D", finishes.lips) : skin,
      );
    }
    tube(
      "Eyebrow",
      [-0.6, -0.2, 0.2, 0.6].map((dx) =>
        facePoint(
          ex + dx,
          27.12 + 0.08 * Math.cos(dx * 2) - 0.06 * Math.sign(ex) * dx,
          0.06,
        ),
      ),
      0.085,
      "head",
      mat("N", finishes.hair),
    );
  }
  tube(
    "Mouth_smile",
    [-0.85, -0.45, 0, 0.45, 0.85].map((x) =>
      facePoint(x, 23.88 + 0.16 * (x / 0.85) ** 2, 0.02),
    ),
    0.12,
    "head",
    mat("R", finishes.lips),
  );
  // A slender neck rises from the collar, flaring slightly into the shoulders so no gap shows inside the
  // neckline, and blends into the head bone below the jaw for nods and tilts.
  const neck = new THREE.LatheGeometry(
    [
      [1.38, 18.8],
      [1.38, 20.3],
      [1.32, 20.95],
      [1.18, 21.7],
      [1.08, 22.6],
      [1.06, 23.6],
      [0.6, 24.2],
      [0, 24.3],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  // Slightly deeper than wide at the jaw, shallower at the base so it stays inside the collar.
  neck.scale(1, 1, 0.88);
  neck.rotateX(-0.05);
  add(
    "Neck",
    neck,
    "neck",
    skin,
    new THREE.Vector3(0, 0, -0.2),
    undefined,
    undefined,
    {
      bone: "head",
      weight: (p) => THREE.MathUtils.smoothstep(p.y, 22.0, 23.2),
    },
  );

  // The shirt, shoulder caps, sleeves and turned collar band are one cotton surface.
  // Sleeves are tubes around each upper-arm bone, hemmed square to the arm and skinned to it, so the
  // openings sit on the arm in every pose; a small gap under the arm keeps sleeve and torso separate.
  const neckAngle = (x: number, z: number): number => Math.atan2(x, z + 0.2),
    collarTop = (a: number): number => 21.05 + 0.3 * ((1 - Math.cos(a)) / 2),
    collarBottom = (a: number): number => 20.15 + 0.4 * ((1 - Math.cos(a)) / 2),
    neckRadial = (x: number, z: number): number =>
      Math.hypot(x, (z + 0.2) / 0.92),
    smax = (a: number, b: number, k: number): number => -smoothUnion(-a, -b, k);
  const collarField = (x: number, y: number, z: number): number => {
    const a = neckAngle(x, z),
      top = collarTop(a),
      bottom = collarBottom(a),
      flare = THREE.MathUtils.clamp((top - y) / (top - bottom), 0, 1),
      radius = THREE.MathUtils.lerp(1.6, 1.92, flare);
    return smax(
      smax(Math.abs(neckRadial(x, z) - radius) - 0.13, y - top, 0.08),
      bottom - 0.3 - y,
      0.08,
    );
  };
  const sleeves = (["right", "left"] as const).map((side) => {
    const shoulder = rig.rest[side + "UpperArm"],
      elbow = rig.rest[side + "Forearm"],
      axis = elbow.clone().sub(shoulder),
      length = axis.length();
    axis.normalize();
    return { side, shoulder, axis, length, hem: 0.6 * length };
  });
  const sleeveFrame = (
    sleeve: (typeof sleeves)[number],
    x: number,
    y: number,
    z: number,
  ): { along: number; radial: number } => {
    const dx = x - sleeve.shoulder.x,
      dy = y - sleeve.shoulder.y,
      dz = z - sleeve.shoulder.z,
      along = dx * sleeve.axis.x + dy * sleeve.axis.y + dz * sleeve.axis.z;
    return {
      along,
      radial: Math.sqrt(
        Math.max(0, dx * dx + dy * dy + dz * dz - along * along),
      ),
    };
  };
  const sleeveField = (
    sleeve: (typeof sleeves)[number],
    x: number,
    y: number,
    z: number,
  ): number => {
    const { along, radial } = sleeveFrame(sleeve, x, y, z),
      t = THREE.MathUtils.clamp(along / sleeve.hem, 0, 1),
      tube =
        along < 0
          ? Math.hypot(radial, along) - 1.14
          : radial - THREE.MathUtils.lerp(1.14, 1.06, t);
    return smax(tube, along - sleeve.hem, 0.08);
  };
  const torsoField = (x: number, y: number, z: number): number => {
    let d = smoothUnion(
      ellipsoid(x, y, z, [0, 16.8, 0.05], [2.45, 3.8, 1.95]),
      ellipsoid(x, y, z, [0, 13.4, 0.1], [2.25, 3.2, 1.8]),
      1.2,
    );
    d = smoothUnion(
      d,
      ellipsoid(x, y, z, [0, 19.55, -0.7], [2.2, 1.15, 1.2]),
      0.8,
    );
    for (const sign of [-1, 1])
      d = smoothUnion(
        d,
        capsuleDistance(
          x,
          y,
          z,
          [sign * 0.75, 19.85, -0.2],
          [sign * 2.75, 19.25, -0.05],
          0.85,
        ),
        0.8,
      );
    return d;
  };
  const shirtField = (x: number, y: number, z: number): number => {
    let d = torsoField(x, y, z);
    // The sleeve blends into the shoulder seam but stays separate from the torso below the armpit.
    for (const sleeve of sleeves) {
      const { along } = sleeveFrame(sleeve, x, y, z);
      d = smoothUnion(
        d,
        sleeveField(sleeve, x, y, z),
        THREE.MathUtils.lerp(
          0.3,
          0.03,
          THREE.MathUtils.smoothstep(along, 0.2, 1.1),
        ),
      );
    }
    d = Math.max(smoothUnion(d, collarField(x, y, z), 0.1), 10.95 - y);
    // The open neckline is cut after the collar joins, leaving one clean inner wall.
    return smax(d, -Math.max(neckRadial(x, z) - 1.46, 19.4 - y), 0.06);
  };
  const shirtWeights: Influences = (p) => {
    const chest = THREE.MathUtils.smoothstep(p.y, 13.4, 18.4),
      waist = THREE.MathUtils.smoothstep(p.y, 11.2, 14.2),
      torso = torsoField(p.x, p.y, p.z),
      w: Record<string, number> = {};
    let arms = 0;
    for (const sleeve of sleeves) {
      const { along } = sleeveFrame(sleeve, p.x, p.y, p.z),
        // Sleeve fabric (nearer the sleeve tube than the torso) follows the upper arm; the shoulder
        // cap blends from the chest above the joint into the arm just below it.
        nearer = THREE.MathUtils.smoothstep(
          torso - sleeveField(sleeve, p.x, p.y, p.z),
          -0.08,
          0.12,
        ),
        share = nearer * THREE.MathUtils.smoothstep(along, -0.55, 0.25);
      w[sleeve.side + "UpperArm"] = share;
      arms += share;
    }
    const body = Math.max(0, 1 - arms);
    w.pelvis = body * (1 - waist);
    w.spine = body * waist * (1 - chest);
    w.chest = body * waist * chest;
    return w;
  };
  const garment = sculptSurface(
      shirtField,
      [-5.6, 10.6, -2.8],
      [5.6, 21.6, 2.9],
      62,
      120000,
    ),
    darkRed = new THREE.Color(palette.R),
    lightRed = new THREE.Color(palette.r);
  // Colour follows smooth functions of position, so the white collar meets the red shirt in a clean line.
  shade(
    garment,
    shirtField,
    (p) => {
      const collar =
        THREE.MathUtils.smoothstep(
          p.y - collarBottom(neckAngle(p.x, p.z)),
          0.0,
          0.06,
        ) *
        (1 - THREE.MathUtils.smoothstep(neckRadial(p.x, p.z), 2.25, 2.35));
      const sleeve = Math.max(
        ...sleeves.map((s) =>
          THREE.MathUtils.smoothstep(
            sleeveFrame(s, p.x, p.y, p.z).along,
            -0.4,
            0.4,
          ),
        ),
      );
      return darkRed
        .clone()
        .lerp(
          lightRed,
          sleeve * 0.7 + THREE.MathUtils.smoothstep(p.y, 18.6, 20.2) * 0.25,
        )
        .lerp(white, collar);
    },
    "k",
    0.4,
  );
  add(
    "Shirt_torso",
    garment,
    "spine",
    mat("W", { ...finishes.cotton, vertexColours: true }),
  );
  weightSurface(rig, garment, shirtWeights);
  tube(
    "Collar_sewn_edge",
    Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2 - Math.PI,
        y = collarBottom(a) + 0.06,
        r = 1.92 + 0.14;
      return new THREE.Vector3(
        r * Math.sin(a),
        y,
        r * 0.92 * Math.cos(a) - 0.2,
      );
    }),
    0.03,
    "chest",
    mat("L", finishes.cotton),
    true,
  );
  for (const [id, colour, offset] of [
    ["fizz-emblem", "y", 0.045],
    ["fizz-emblem-core", "N", 0.065],
  ] as const) {
    decal(
      id,
      "chest",
      (u, v) => {
        const y = 17.6 - v;
        return new THREE.Vector3(u, y, frontSurface(shirtField, u, y) + offset);
      },
      mat(colour, finishes.cotton),
    );
    weightSurface(rig, meshes.at(-1)!.geometry, shirtWeights);
  }

  // One continuous pair of slim straight jeans joins the pelvis, seat, thighs, knees and cuffs.
  const hipY = rig.rest.rightThigh.y,
    kneeY = rig.rest.rightShin.y,
    ankleY = rig.rest.rightFoot.y,
    legX = Math.abs(rig.rest.rightThigh.x),
    hemY = ankleY - 0.3;
  const legRadii = (y: number): { rx: number; rz: number } => {
    const t = THREE.MathUtils.smoothstep(y, kneeY - 0.4, hipY);
    return {
      rx: THREE.MathUtils.lerp(0.95, 1.3, t),
      rz: THREE.MathUtils.lerp(1.05, 1.4, t),
    };
  };
  const pantsField = (x: number, y: number, z: number): number => {
    // A straight waistband above the hip joints and a rounded pelvis below it, without creases.
    const waist = 10.4;
    let d =
      y >= waist
        ? Math.max((Math.hypot(x / 2.55, z / 1.85) - 1) * 1.85, y - 11.55)
        : ellipsoid(x, y, z, [0, waist, 0], [2.55, 2.6, 1.85]);
    for (const sign of [-1, 1]) {
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [sign * 1.05, 9.35, -0.6], [1.3, 1.35, 1.2]),
        0.5,
      );
      const cy = THREE.MathUtils.clamp(y, hemY, hipY + 0.5),
        { rx, rz } = legRadii(cy),
        leg = Math.max(
          (Math.hypot((x - sign * legX) / rx, (z - 0.08) / rz) - 1) * rx,
          hemY - y,
          y - (hipY + 0.6),
        );
      d = smoothUnion(d, leg, 0.45);
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [sign * legX, kneeY, 0.72], [0.62, 0.52, 0.42]),
        0.35,
      );
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
  const pants = sculptSurface(
    pantsField,
    [-3.4, hemY - 0.3, -2.2],
    [3.4, 11.9, 2.4],
    56,
    120000,
  );
  shade(pants, pantsField, () => new THREE.Color(palette.B), "k", 0.45);
  add(
    "Jeans_continuous",
    pants,
    "pelvis",
    mat("W", { ...finishes.denim, vertexColours: true }),
  );
  weightSurface(rig, pants, pantsWeights);
  // The belt sits on the jeans waistband.
  const belt = new THREE.TorusGeometry(1, 0.09, 8, 72);
  belt.rotateX(Math.PI / 2);
  belt.scale(2.57, 4.4, 1.88);
  belt.translate(0, 11.1, 0);
  add("Belt", belt, "pelvis", mat("D", finishes.leather));
  box(
    "Belt_buckle",
    [0, 11.1, 2.06],
    [1.1, 0.78, 0.22],
    "pelvis",
    mat("y", finishes.metal),
    0.1,
  );
  box(
    "Belt_buckle_inset",
    [0, 11.1, 2.2],
    [0.62, 0.4, 0.08],
    "pelvis",
    mat("N", finishes.leather),
    0.05,
  );

  for (const [side, sign] of [
    ["right", -1],
    ["left", 1],
  ] as const) {
    const shoulder = rig.rest[side + "UpperArm"].toArray(),
      elbow = rig.rest[side + "Forearm"].toArray(),
      wrist = rig.rest[side + "Hand"].toArray(),
      ankle = rig.rest[side + "Foot"],
      inward = -sign;
    const along = (
      a: readonly number[],
      b: readonly number[],
      t: number,
    ): number[] => a.map((v, i) => THREE.MathUtils.lerp(v, b[i], t));
    const at = (dx: number, dy: number, dz: number): number[] => [
      wrist[0] + dx,
      wrist[1] + dy,
      wrist[2] + dz,
    ];
    // Deltoid, biceps, elbow, forearm taper, wrist, palm, four fingers and an opposing thumb.
    const armField = (x: number, y: number, z: number): number => {
      let d = taperedCapsule(x, y, z, shoulder, elbow, 0.98, 0.66);
      d = smoothUnion(
        d,
        ellipsoid(
          x,
          y,
          z,
          along(shoulder, elbow, 0.45).map((v, i) => v + [0, 0, 0.18][i]),
          [0.84, 1.35, 0.82],
        ),
        0.45,
      );
      d = smoothUnion(
        d,
        Math.hypot(x - elbow[0], y - elbow[1], z - elbow[2]) - 0.64,
        0.3,
      );
      d = smoothUnion(
        d,
        taperedCapsule(x, y, z, elbow, wrist, 0.72, 0.46),
        0.3,
      );
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, along(elbow, wrist, 0.28), [0.78, 1.25, 0.8]),
        0.5,
      );
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, at(0, -0.82, 0.02), [0.4, 0.82, 0.8]),
        0.28,
      );
      for (let finger = 0; finger < 4; finger++) {
        const offset = [0.56, 0.2, -0.18, -0.52][finger],
          length = [1.05, 1.15, 1.08, 0.86][finger],
          r = [0.2, 0.21, 0.2, 0.17][finger],
          knuckle = at(0, -1.45, offset),
          middle = at(inward * 0.12, -1.45 - length * 0.55, offset + 0.02),
          tip = at(inward * 0.32, -1.45 - length, offset + 0.03);
        d = smoothUnion(d, capsuleDistance(x, y, z, knuckle, middle, r), 0.1);
        d = smoothUnion(
          d,
          capsuleDistance(x, y, z, middle, tip, r * 0.88),
          0.07,
        );
      }
      const thumbBase = at(inward * 0.15, -0.4, 0.55),
        thumbJoint = at(inward * 0.38, -1.02, 0.86),
        thumbTip = at(inward * 0.52, -1.55, 0.8);
      d = smoothUnion(
        d,
        capsuleDistance(x, y, z, thumbBase, thumbJoint, 0.26),
        0.18,
      );
      return smoothUnion(
        d,
        capsuleDistance(x, y, z, thumbJoint, thumbTip, 0.2),
        0.08,
      );
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
    weightSurface(rig, arm, (p) => {
      const upper = THREE.MathUtils.smoothstep(
          p.y,
          elbow[1] - 0.45,
          elbow[1] + 0.45,
        ),
        palm =
          1 - THREE.MathUtils.smoothstep(p.y, wrist[1] - 0.45, wrist[1] + 0.15);
      return {
        [side + "UpperArm"]: upper,
        [side + "Forearm"]: (1 - upper) * (1 - palm),
        [side + "Hand"]: (1 - upper) * palm,
      };
    });
    const seamPoints = Array.from({ length: 25 }, (_, i) => {
      const y = hipY - 0.2 - (i / 24) * (hipY - 0.2 - (hemY + 0.15)),
        x = sign * (legX + legRadii(y).rx * 0.82);
      return new THREE.Vector3(x, y, frontSurface(pantsField, x, y) + 0.025);
    });
    tube(
      side + "_denim_seam",
      seamPoints,
      0.06,
      side + "Thigh",
      mat("c", finishes.denim),
    );
    weightSurface(rig, meshes.at(-1)!.geometry, pantsWeights);
    const z = ankle.z,
      foot = side + "Foot",
      toe = side + "Toe",
      blend = {
        bone: toe,
        weight: (p: THREE.Vector3) =>
          THREE.MathUtils.smoothstep(p.z, z + toeFlex.start, z + toeFlex.end),
      };
    // Red upper, white toe cap and sole, and grey underside share one connected shoe surface.
    add(
      side + "_shoe",
      runningShoe(ankle.x, z),
      foot,
      [
        mat("R", finishes.mesh),
        mat("W", finishes.rubber),
        mat("L", finishes.rubber),
      ],
      undefined,
      undefined,
      undefined,
      blend,
    );
    const sx = shoeScale.x,
      sz = shoeScale.z;
    const cuff = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2,
        x = 0.74 * sx * Math.cos(a),
        depth = (-0.2 + 0.6 * Math.sin(a)) * sz;
      return new THREE.Vector3(
        ankle.x + x,
        runnerTop(x, depth) + 0.025,
        z + depth,
      );
    });
    tube(side + "_ankle_binding", cuff, 0.035, foot, mat("r", finishes.mesh));
    for (let j = 0; j < 5; j++) {
      const depth = (0.05 + j * 0.4) * sz;
      const points = [-0.44, 0, 0.44].map(
        (x) =>
          new THREE.Vector3(
            ankle.x + x * sx,
            runnerTop(x * sx, depth) + 0.05,
            z + depth,
          ),
      );
      tube(side + "_lace", points, 0.045, foot, mat("r", finishes.webbing));
    }
    const sideSeam = Array.from({ length: 16 }, (_, i) => {
      const depth = (-1.85 + (i / 15) * 3.1) * sz,
        p = runnerProfile(depth),
        y = p.seam + 0.3;
      const a = Math.asin(
        Math.min(1, ((y - p.seam) / (p.top - p.seam)) ** (1 / 0.75)),
      );
      return new THREE.Vector3(
        ankle.x + sign * (p.width * Math.cos(a) + 0.015),
        y,
        z + depth,
      );
    });
    tube(
      side + "_quarter_stitch",
      sideSeam,
      0.025,
      foot,
      mat("r", finishes.mesh),
    );
    decal(
      "shoe-badge",
      foot,
      (u, v) => {
        const depth = (0.05 + u * 0.7) * sz,
          p = runnerProfile(depth),
          y = shoeY(1.35) - v * 0.65 * shoeScale.y,
          a = Math.asin(
            Math.min(1, ((y - p.seam) / (p.top - p.seam)) ** (1 / 0.75)),
          );
        return new THREE.Vector3(
          ankle.x + sign * (p.width * Math.cos(a) + 0.025),
          y,
          z + depth,
        );
      },
      mat("y", finishes.mesh),
      new THREE.Vector3(sign, 0, 0),
    );
  }
  // The ray-gun Stunner rides on its own bone, holstered on the anatomical right hip only.
  // Its parts are authored in the gun frame and turned into the holstered pose at rest.
  const gunOrigin = rig.rest.stunner,
    glow = mat("c").clone();
  glow.emissive.set("#55ffff");
  glow.emissiveIntensity = 1.2;
  materials.set("stunnerGlow", glow);
  for (const part of stunnerParts()) {
    part.geometry.applyQuaternion(holsterTurn);
    add(
      part.name,
      part.geometry,
      "stunner",
      part.glow ? glow : mat(part.colour, finishes.plastic),
      gunOrigin.clone(),
    );
  }
  // A dark holster band hugs the barrel below the body and clips to the belt; it stays on the hip when drawn.
  const holster = new THREE.CylinderGeometry(0.5, 0.46, 0.75, 20, 1, true);
  holster.rotateX(Math.PI / 2);
  holster.translate(0, 0, 1.4);
  holster.applyQuaternion(holsterTurn);
  add(
    "Holster_band",
    holster,
    "pelvis",
    mat("D", finishes.leather),
    gunOrigin.clone(),
  );
  const holsterStrap = new THREE.BoxGeometry(0.35, 1.0, 0.12);
  add(
    "Holster_strap",
    holsterStrap,
    "pelvis",
    mat("D", finishes.leather),
    new THREE.Vector3(gunOrigin.x + 0.35, 10.5, gunOrigin.z + 0.35),
    undefined,
    new THREE.Euler(0, -0.9, 0),
  );
  const flashAt = stunnerTip
    .clone()
    .applyQuaternion(holsterTurn)
    .add(gunOrigin);
  const flash = mat("c").clone();
  flash.emissive.set("#55ffff");
  flash.emissiveIntensity = 2;
  materials.set("muzzleGlow", flash);
  const burst = new THREE.SphereGeometry(1, 14, 10);
  burst.scale(0.7, 0.7, 1.6);
  burst.translate(0, 0, 1.3);
  burst.applyQuaternion(holsterTurn);
  add("Stunner_muzzle_flash", burst, "muzzleFlash", flash, flashAt);
  rig.bones.muzzleFlash.scale.setScalar(0);
  const phoneCentre = rig.rest.phone;
  phoneMeshes.push(
    box(
      "Phone_dark_back",
      phoneCentre.toArray(),
      [2.2, 3.5, 0.35],
      "phone",
      mat("D", finishes.plastic),
      0.25,
    ),
  );
  phoneMeshes.push(
    orb(
      "Phone_camera",
      [phoneCentre.x - 0.55, phoneCentre.y + 1.15, phoneCentre.z + 0.23],
      [0.25, 0.25, 0.08],
      "phone",
      mat("k", finishes.eye),
    ),
  );
  phoneMeshes.push(
    box(
      "Phone_screen",
      [phoneCentre.x, phoneCentre.y, phoneCentre.z - 0.22],
      [1.85, 3.0, 0.08],
      "phone",
      mat("c", finishes.eye),
      0.14,
    ),
  );
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
